// 推荐引擎：信号采集 → 用户画像 → 打分 → 多样性控制
// 权重（初始参数，可调）：收藏+10 锁定+8 听完+2 播放>60% +1 跳过-3 <20% -5 黑名单-100
import { db, now } from './db.mjs'

export const WEIGHTS = {
  favorite: 10,
  lock: 8,
  complete: 2,
  mostly: 1,
  skip: -3,
  partial: -5,
  unfavorite: -5,
  unlock: -1,
  blacklist: -100,
}

export function recordEvent({ userId = null, deviceId = '', songId, event, artists = [] }) {
  const weight = WEIGHTS[event]
  if (weight === undefined) return
  db.prepare(`
    INSERT INTO user_events (user_id, device_id, provider, song_id, event, weight, artists, created_at)
    VALUES (?, ?, 'netease', ?, ?, ?, ?, ?)
  `).run(userId, deviceId, String(songId), event, weight, artists.join('/'), now())
}

export function recordPlay({ userId = null, deviceId = '', song, playMs = 0 }) {
  const completed = playMs >= (song.duration || 0) * 0.9 && song.duration > 0 ? 1 : 0
  db.prepare(`
    INSERT INTO listening_history (user_id, device_id, provider, song_id, name, artists, album, played_at, play_ms, completed)
    VALUES (?, ?, 'netease', ?, ?, ?, ?, ?, ?, ?)
  `).run(userId, deviceId, String(song.id), song.name, (song.artists || []).join('/'), song.album || '', now(), playMs, completed)
  return completed
}

// 用户画像：近期（7天）与长期（全部）分开
export function userProfile(userId, deviceId = '') {
  const since = now() - 7 * 86400 * 1000
  const rows = db.prepare(`
    SELECT song_id, event, weight, artists, created_at FROM user_events
    WHERE (user_id = ? OR (user_id IS NULL AND device_id = ?)) AND created_at > ?
    ORDER BY created_at DESC LIMIT 500
  `).all(userId || -1, deviceId, now() - 90 * 86400 * 1000)

  const artistScore = new Map()
  const recentSongs = new Set()
  const likedArtists = new Set()
  for (const row of rows) {
    if (row.created_at >= since) recentSongs.add(row.song_id)
    for (const artist of row.artists.split('/').filter(Boolean)) {
      artistScore.set(artist, (artistScore.get(artist) || 0) + row.weight)
      if (row.weight >= 8) likedArtists.add(artist)
    }
  }
  const blocked = blockedArtists(userId, deviceId)
  return { artistScore, recentSongs, likedArtists, blocked }
}

export function blockedArtists(userId, deviceId = '') {
  const rows = db.prepare(`
    SELECT DISTINCT artist FROM blocked_artists
    WHERE user_id = ? OR (user_id IS NULL AND device_id = ?)
  `).all(userId || -1, deviceId)
  return new Set(rows.map((r) => r.artist))
}

export function addBlockedArtist({ userId = null, deviceId = '', artist }) {
  if (!artist) return
  db.prepare(`
    INSERT INTO blocked_artists (user_id, device_id, artist, created_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT DO NOTHING
  `).run(userId, deviceId, artist, now())
  recordEvent({ userId, deviceId, songId: `artist:${artist}`, event: 'blacklist', artists: [artist] })
}

export function removeBlockedArtist({ userId = null, deviceId = '', artist }) {
  db.prepare('DELETE FROM blocked_artists WHERE artist = ? AND (user_id = ? OR (user_id IS NULL AND device_id = ?))')
    .run(artist, userId || -1, deviceId)
}

// 对候选歌曲打分
export function scoreCandidate(track, profile) {
  const artists = (track.ar || []).map((a) => a.name)
  if (artists.some((a) => profile.blocked.has(a))) return -Infinity
  if (profile.recentSongs.has(String(track.id))) return -Infinity
  let score = Math.random() * 2 // 轻微抖动避免排序僵化
  for (const artist of artists) score += profile.artistScore.get(artist) || 0
  return score
}

// 多样性配额：50% 喜好 / 20% 相似 / 20% 探索 / 10% 冷门
// 在已验证可播放的池子上执行
export function diversify(verified, profile, { count = 10 } = {}) {
  const liked = [], neutral = [], explore = []
  for (const song of verified) {
    const artists = (song.ar || []).map((a) => a.name)
    const hit = artists.some((a) => profile.likedArtists.has(a))
    const score = scoreCandidate(song, profile)
    if (hit && score > 0) liked.push(song)
    else if (score > -Infinity && score <= 2) explore.push(song)
    else neutral.push(song)
  }
  const take = (arr, n) => arr.slice(0, n)
  const likedN = Math.round(count * 0.5)
  const neutralN = Math.round(count * 0.2)
  const exploreN = count - likedN - neutralN
  // 探索位从 neutral+explore 混排，保证惊喜
  const surprise = [...explore, ...neutral].sort(() => Math.random() - 0.5)
  return [
    ...take(liked, likedN),
    ...take(neutral, neutralN),
    ...take(surprise, exploreN),
  ].sort(() => Math.random() - 0.5)
}
