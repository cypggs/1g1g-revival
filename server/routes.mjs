// 1g1g Revival API 路由
import { db, now, upsertSong, cacheSource, getCachedSource } from './db.mjs'
import * as auth from './auth.mjs'
import * as provider from './provider.mjs'
import { verifiedRadio } from './radio.mjs'
import * as rec from './recommend.mjs'

function send(res, code, payload, headers = {}) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers })
  res.end(JSON.stringify(payload))
}

function context(req) {
  const token = auth.parseCookies(req)['1g1g_session']
  const user = auth.userForSession(token)
  const deviceId = req.headers['x-device-id'] || ''
  return { user, userId: user?.id || null, deviceId, token }
}

function publicTrack(t) {
  return {
    id: String(t.id),
    name: t.name,
    artists: (t.ar || []).map((a) => a.name),
    artistIds: (t.ar || []).map((a) => a.id),
    album: t.al?.name || '',
    albumId: t.al?.id || null,
    coverUrl: (t.al?.picUrl || '').replace(/^http:/, 'https:'),
    duration: Math.round((t.dt || 0) / 1000),
    alias: t.alia || [],
    streamUrl: t.streamUrl || undefined,
  }
}

// 从候选集剔除：近期已听 + 黑名单歌手
function exclusionSet(ctx, extraIds = []) {
  const profile = rec.userProfile(ctx.userId, ctx.deviceId)
  const exclude = new Set(profile.recentSongs)
  for (const id of extraIds) exclude.add(String(id))
  return { exclude, profile }
}

export async function handleApi(req, res, url) {
  const p = url.pathname
  const method = req.method
  const ctx = context(req)
  const json = async () => {
    const chunks = []
    for await (const chunk of req) chunks.push(chunk)
    if (!chunks.length) return {}
    try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch { return {} }
  }

  // ---- 健康 / 启动 ----
  if (p === '/api/health') return send(res, 200, { ok: true, name: '1g1g Revival' })

  if (p === '/api/bootstrap') {
    // 首批歌曲：一周验证池随机 20 首（原版：一周以来用户收听最多）
    const { exclude } = exclusionSet(ctx)
    const batch = await verifiedRadio({ count: 20, excludeIds: exclude })
    return send(res, 200, { code: 200, tracks: batch.map(publicTrack) })
  }

  // ---- 播放流 ----
  if (p === '/api/stream') {
    const id = url.searchParams.get('id')
    if (!id) return send(res, 400, { code: 400, message: '缺少歌曲 id' })
    const cached = getCachedSource('netease', id)
    if (cached) return send(res, 200, { code: 200, stream: { url: cached.url, bitrate: cached.bitrate } })
    const [source] = await provider.resolveSources([id])
    if (!source?.playable || !source.url) {
      upsertSong({ id }, 'unavailable')
      return send(res, 200, { code: 404, message: '这首歌曲暂时无法播放，可能需要会员或存在版权限制' })
    }
    cacheSource('netease', id, { ...source, status: 'available' })
    upsertSong({ id }, 'available')
    return send(res, 200, { code: 200, stream: { url: source.url, bitrate: source.bitrate } })
  }

  // ---- 搜索 ----
  if (p === '/api/search') {
    const q = (url.searchParams.get('q') || '').trim()
    if (!q) return send(res, 200, { code: 200, songs: [], total: 0 })
    const { songs, total } = await provider.searchSongs(q, {
      limit: Math.min(Number(url.searchParams.get('limit')) || 30, 60),
      offset: Number(url.searchParams.get('offset')) || 0,
    })
    // 收藏置顶（原版行为：搜索结果中自己收藏的排在最前）
    let favorites = []
    if (ctx.userId) {
      favorites = db.prepare('SELECT song_id FROM favorites WHERE user_id = ?').all(ctx.userId).map((r) => r.song_id)
    }
    const favSet = new Set(favorites.map(String))
    // 批量验证可播放性（一次 EAPI 调用），不可播放的标记出来
    const sources = await provider.resolveSources(songs.map((t) => t.id)).catch(() => [])
    const playableSet = new Set(sources.filter((s) => s.playable).map((s) => s.id))
    const mapped = songs.map((t) => ({
      ...publicTrack(t),
      isFavorite: favSet.has(String(t.id)),
      playable: playableSet.has(String(t.id)),
      playabilityStatus: playableSet.has(String(t.id)) ? 'available' : 'vip_required',
    }))
    mapped.sort((a, b) => (b.isFavorite ? 1 : 0) - (a.isFavorite ? 1 : 0))
    return send(res, 200, { code: 200, songs: mapped, total })
  }

  // ---- 榜单（栏目区"热门"） ----
  if (p === '/api/chart') {
    const data = await provider.getChart(url.searchParams.get('kind') || 'hot')
    const slice = data.songs.slice(0, 30)
    const sources = await provider.resolveSources(slice.map((t) => t.id)).catch(() => [])
    const playableSet = new Set(sources.filter((s) => s.playable).map((s) => s.id))
    return send(res, 200, {
      code: 200, name: data.name,
      songs: slice.map((t) => ({
        ...publicTrack(t),
        playable: playableSet.has(String(t.id)),
        playabilityStatus: playableSet.has(String(t.id)) ? 'available' : 'vip_required',
      })),
    })
  }

  // ---- 手气不错 ----
  if (p === '/api/lucky') {
    const { exclude, profile } = exclusionSet(ctx)
    const batch = await verifiedRadio({ count: 30, excludeIds: exclude })
    const picked = rec.diversify(batch, profile, { count: 15 })
    const reasons = buildReasons(picked, profile)
    return send(res, 200, { code: 200, tracks: picked.map(publicTrack), reasons })
  }

  // ---- 自动补歌 ----
  if (p === '/api/refill') {
    const body = await json()
    const currentIds = Array.isArray(body.excludeIds) ? body.excludeIds : []
    const { exclude, profile } = exclusionSet(ctx, currentIds)
    const count = Math.min(Number(body.count) || 5, 10)
    const batch = await verifiedRadio({ count: count * 3, excludeIds: exclude })
    const picked = rec.diversify(batch, profile, { count })
    return send(res, 200, { code: 200, tracks: picked.map(publicTrack) })
  }

  // ---- 歌词 / 评论 ----
  if (p === '/api/lyrics') {
    const data = await provider.getLyrics(url.searchParams.get('id'))
    return send(res, 200, data)
  }
  if (p === '/api/comments') {
    const data = await provider.getComments(url.searchParams.get('id'), Number(url.searchParams.get('offset')) || 0)
    return send(res, 200, data)
  }

  // ---- 认证 ----
  if (p === '/api/register' && method === 'POST') {
    const body = await json()
    const email = String(body.email || '').trim()
    const name = String(body.name || '').trim()
    const password = String(body.password || '')
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return send(res, 400, { code: 400, message: '请输入有效的邮箱地址' })
    if (!name) return send(res, 400, { code: 400, message: '请输入昵称' })
    if (password.length < 6) return send(res, 400, { code: 400, message: '密码至少需要 6 位' })
    if (db.prepare('SELECT id FROM users WHERE email = ?').get(email)) return send(res, 409, { code: 409, message: '该邮箱已注册' })
    const user = auth.createUser(email, name, password)
    const { token } = auth.createSession(user.id)
    db.prepare('INSERT INTO user_settings (user_id, updated_at) VALUES (?, ?)').run(user.id, now())
    return send(res, 200, { code: 200, user: { id: user.id, email: user.email, name: user.name } }, { 'Set-Cookie': auth.sessionCookie(token) })
  }

  if (p === '/api/login' && method === 'POST') {
    const body = await json()
    const user = auth.authenticate(String(body.email || ''), String(body.password || ''))
    if (!user) return send(res, 401, { code: 401, message: '邮箱或密码不正确' })
    const { token } = auth.createSession(user.id)
    return send(res, 200, { code: 200, user }, { 'Set-Cookie': auth.sessionCookie(token) })
  }

  if (p === '/api/logout' && method === 'POST') {
    auth.destroySession(ctx.token)
    return send(res, 200, { code: 200 }, { 'Set-Cookie': auth.sessionCookie('') })
  }

  if (p === '/api/me') {
    if (!ctx.user) return send(res, 200, { code: 200, user: null })
    const settings = db.prepare('SELECT theme, list_limit, volume, muted FROM user_settings WHERE user_id = ?').get(ctx.userId)
    return send(res, 200, { code: 200, user: ctx.user, settings: settings || null })
  }

  // ---- 收藏 ----
  if (p === '/api/favorites') {
    if (!ctx.userId) return send(res, 401, { code: 401, message: '请先登录' })
    if (method === 'GET') {
      const q = (url.searchParams.get('q') || '').trim()
      const limit = 13
      const page = Math.max(1, Number(url.searchParams.get('page')) || 1)
      let rows
      let total = 0
      if (q) {
        const like = `%${q}%`
        total = db.prepare('SELECT COUNT(*) n FROM favorites WHERE user_id = ? AND (name LIKE ? OR artists LIKE ? OR album LIKE ? OR note LIKE ?)')
          .get(ctx.userId, like, like, like, like).n
        rows = db.prepare('SELECT * FROM favorites WHERE user_id = ? AND (name LIKE ? OR artists LIKE ? OR album LIKE ? OR note LIKE ?) ORDER BY created_at DESC LIMIT ? OFFSET ?')
          .all(ctx.userId, like, like, like, like, limit, (page - 1) * limit)
      } else {
        total = db.prepare('SELECT COUNT(*) n FROM favorites WHERE user_id = ?').get(ctx.userId).n
        rows = db.prepare('SELECT * FROM favorites WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?')
          .all(ctx.userId, limit, (page - 1) * limit)
      }
      return send(res, 200, {
        code: 200,
        total,
        page,
        pages: Math.max(1, Math.ceil(total / limit)),
        songs: rows.map((r) => ({
          id: r.song_id, name: r.name, artists: r.artists.split('/'), album: r.album,
          coverUrl: r.cover_url, duration: r.duration, note: r.note,
        })),
      })
    }
    if (method === 'POST') {
      const body = await json()
      if (!body.id || !body.name) return send(res, 400, { code: 400, message: '缺少歌曲信息' })
      db.prepare(`
        INSERT INTO favorites (user_id, provider, song_id, name, artists, album, cover_url, duration, note, created_at)
        VALUES (?, 'netease', ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id, provider, song_id) DO UPDATE SET note = excluded.note
      `).run(ctx.userId, String(body.id), String(body.name), (body.artists || []).join('/'),
        body.album || '', body.coverUrl || '', body.duration || 0, String(body.note || ''), now())
      rec.recordEvent({ userId: ctx.userId, deviceId: ctx.deviceId, songId: body.id, event: 'favorite', artists: body.artists || [] })
      return send(res, 200, { code: 200 })
    }
  }

  if (p.startsWith('/api/favorites/') && method === 'DELETE') {
    if (!ctx.userId) return send(res, 401, { code: 401, message: '请先登录' })
    const songId = decodeURIComponent(p.slice('/api/favorites/'.length))
    const row = db.prepare('SELECT artists FROM favorites WHERE user_id = ? AND song_id = ?').get(ctx.userId, songId)
    db.prepare('DELETE FROM favorites WHERE user_id = ? AND song_id = ?').run(ctx.userId, songId)
    if (row) rec.recordEvent({ userId: ctx.userId, deviceId: ctx.deviceId, songId, event: 'unfavorite', artists: row.artists.split('/') })
    return send(res, 200, { code: 200 })
  }

  if (p.startsWith('/api/favorites/') && method === 'PUT') {
    if (!ctx.userId) return send(res, 401, { code: 401, message: '请先登录' })
    const songId = decodeURIComponent(p.slice('/api/favorites/'.length))
    const body = await json()
    db.prepare('UPDATE favorites SET note = ? WHERE user_id = ? AND song_id = ?').run(String(body.note || ''), ctx.userId, songId)
    return send(res, 200, { code: 200 })
  }

  // ---- 播放历史 ----
  if (p === '/api/history') {
    const rows = db.prepare(`
      SELECT * FROM listening_history
      WHERE ${ctx.userId ? 'user_id = ?' : 'device_id = ?'}
      ORDER BY played_at DESC LIMIT 13
    `).all(ctx.userId || ctx.deviceId)
    return send(res, 200, {
      code: 200,
      songs: rows.map((r) => ({
        id: r.song_id, name: r.name, artists: r.artists.split('/'), album: r.album,
        duration: r.duration, playedAt: r.played_at, playMs: r.play_ms, completed: !!r.completed,
      })),
    })
  }

  // ---- 行为事件（推荐信号） ----
  if (p === '/api/event' && method === 'POST') {
    const body = await json()
    const song = body.song || {}
    const event = String(body.event || '')
    if (!['lock', 'unlock', 'skip', 'complete', 'mostly', 'partial', 'favorite', 'unfavorite'].includes(event)) {
      return send(res, 400, { code: 400, message: '未知事件' })
    }
    rec.recordEvent({ userId: ctx.userId, deviceId: ctx.deviceId, songId: song.id, event, artists: song.artists || [] })
    if (event === 'complete' || event === 'partial' || event === 'mostly') {
      rec.recordPlay({ userId: ctx.userId, deviceId: ctx.deviceId, song, playMs: Number(body.playMs) || 0 })
    }
    return send(res, 200, { code: 200 })
  }

  // ---- 黑名单 ----
  if (p === '/api/blocked') {
    if (method === 'GET') {
      const blocked = [...rec.blockedArtists(ctx.userId, ctx.deviceId)]
      return send(res, 200, { code: 200, artists: blocked })
    }
    if (method === 'POST') {
      const body = await json()
      const artist = String(body.artist || '').trim()
      if (!artist) return send(res, 400, { code: 400, message: '缺少歌手名' })
      rec.addBlockedArtist({ userId: ctx.userId, deviceId: ctx.deviceId, artist })
      return send(res, 200, { code: 200 })
    }
  }
  if (p.startsWith('/api/blocked/') && method === 'DELETE') {
    const artist = decodeURIComponent(p.slice('/api/blocked/'.length))
    rec.removeBlockedArtist({ userId: ctx.userId, deviceId: ctx.deviceId, artist })
    return send(res, 200, { code: 200 })
  }

  // ---- 错误报告 ----
  if (p === '/api/report' && method === 'POST') {
    const body = await json()
    const kind = String(body.kind || 'other')
    if (!['unavailable', 'wrong_song', 'wrong_artist', 'wrong_album', 'other'].includes(kind)) {
      return send(res, 400, { code: 400, message: '未知报告类型' })
    }
    db.prepare('INSERT INTO playback_reports (user_id, provider, song_id, kind, detail, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(ctx.userId, 'netease', String(body.songId || ''), kind, String(body.detail || '').slice(0, 500), now())
    return send(res, 200, { code: 200 })
  }

  // ---- 设置 ----
  if (p === '/api/settings' && method === 'PUT') {
    const body = await json()
    if (ctx.userId) {
      db.prepare(`
        INSERT INTO user_settings (user_id, theme, list_limit, volume, muted, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET
          theme = excluded.theme, list_limit = excluded.list_limit,
          volume = excluded.volume, muted = excluded.muted, updated_at = excluded.updated_at
      `).run(ctx.userId, String(body.theme || 'blue'), Math.max(5, Math.min(100, Number(body.listLimit) || 30)),
        Math.max(0, Math.min(1, Number(body.volume ?? 0.8))), body.muted ? 1 : 0, now())
    }
    return send(res, 200, { code: 200 })
  }

  return send(res, 404, { code: 404, message: '接口不存在' })
}

function buildReasons(tracks, profile) {
  const reasons = {}
  for (const t of tracks) {
    const artists = (t.ar || []).map((a) => a.name)
    const liked = artists.find((a) => profile.likedArtists.has(a))
    if (liked) reasons[t.id] = `你收藏过 ${liked} 的歌`
    else if (artists.some((a) => (profile.artistScore.get(a) || 0) > 0)) reasons[t.id] = '这首歌与你最近的听歌偏好相似'
    else reasons[t.id] = '一首你可能没听过的歌'
  }
  return reasons
}
