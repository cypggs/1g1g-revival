// 统一音乐来源适配层（MusicProvider）
// 前端只依赖本服务 /api/*，不直接出现上游域名
import { get, eapiPost, tracks, track, cached } from './netease.mjs'

// 官方榜单 id（原"百度热门"的现代替代）
export const CHARTS = {
  hot: { id: 3778678, name: '热歌榜' },
  soaring: { id: 19723756, name: '飙升榜' },
  fresh: { id: 3779629, name: '新歌榜' },
  top: { id: 19723756, name: '原创榜' },
}

export async function searchSongs(keyword, { limit = 30, offset = 0 } = {}) {
  const data = await get('/api/cloudsearch/pc', { s: keyword, type: 1, limit, offset, total: 'true' })
  return {
    songs: tracks(data.result?.songs),
    total: data.result?.songCount || 0,
  }
}

export async function songDetails(ids) {
  if (!ids.length) return []
  const { data } = await eapiPost('/api/v3/song/detail', {
    c: JSON.stringify(ids.map((id) => ({ id: Number(id) }))),
  })
  return tracks(data.songs)
}

// 取流 + 可播放性判定（核心验证逻辑，三条件缺一不可）
// 返回 { url, size, bitrate, fee, freeTrial } 或 null
export async function resolveSources(ids, { level = 'standard', encodeType } = {}) {
  const et = encodeType || (['lossless', 'hires'].includes(level) ? 'flac' : 'mp3')
  const { data } = await eapiPost('/api/song/enhance/player/url/v1', {
    ids: JSON.stringify(ids.map(Number)),
    level,
    encodeType: et,
  })
  const streams = data.data || []
  return streams.map((s) => {
    const playable = !!(s?.url && s.size && !s.freeTrialInfo)
    return {
      id: String(s.id),
      url: s.url ? s.url.replace(/^http:/, 'https:') : null,
      size: s.size || 0,
      bitrate: s.br || 0,
      type: s.type || et,
      fee: s.fee ?? 0,
      freeTrial: !!s.freeTrialInfo,
      playable,
      checkedAt: Date.now(),
    }
  })
}

export async function getLyrics(id) {
  return get('/api/song/lyric', { id, lv: 1, tv: -1 })
}

export async function getComments(id, offset = 0) {
  return get(`/api/v1/resource/comments/R_SO_4_${Number(id)}`, { limit: 30, offset })
}

export async function getArtist(id) {
  const data = await get(`/api/v1/artist/${Number(id)}`)
  data.hotSongs = tracks(data.hotSongs)
  return data
}

export async function getAlbum(id) {
  const data = await get(`/api/v1/album/${Number(id)}`)
  data.songs = tracks(data.songs)
  return data
}

export async function getPlaylist(id) {
  const data = await get('/api/v6/playlist/detail', { id, n: 1000 })
  if (data.playlist) data.playlist.tracks = tracks(data.playlist.tracks)
  return data
}

// 榜单（栏目区"热门"）
export async function getChart(kind = 'hot') {
  const chart = CHARTS[kind] || CHARTS.hot
  const data = await get('/api/v6/playlist/detail', { id: chart.id, n: 100 })
  return { name: chart.name, songs: tracks(data.playlist?.tracks) }
}

// 歌词搜索（网易云无独立歌词搜索，用歌名+歌词关键词近似）
export async function searchAny(keyword, { limit = 30, offset = 0 } = {}) {
  return searchSongs(keyword, { limit, offset })
}

export { track, tracks }
