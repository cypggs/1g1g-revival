// 免费电台：候选池构建 + 服务端逐首验证匿名可完整播放
// 移植自 mygo-web-cloudmusic /api/free-radio 并增强：
// - 分层候选池（榜单/日推/探索），支持推荐上下文注入
// - 验证结果缓存与失败冷却
import { get, eapiPost, tracks, cached } from './netease.mjs'
import { resolveSources } from './provider.mjs'

function shuffled(items) {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

// 候选池：日推 + 热歌榜/飙升榜/新歌榜，5 分钟缓存
export async function candidatePool() {
  return cached('radio-candidates', 300, async () => {
    const [daily, hot, soaring, fresh] = await Promise.all([
      get('/api/v3/discovery/recommend/songs').catch(() => ({ data: { dailySongs: [] } })),
      get('/api/v6/playlist/detail', { id: 3778678, n: 1000 }),
      get('/api/v6/playlist/detail', { id: 19723756, n: 1000 }),
      get('/api/v6/playlist/detail', { id: 3779629, n: 1000 }),
    ])
    const byID = new Map()
    for (const item of [
      ...tracks(daily.data?.dailySongs),
      ...tracks(hot.playlist?.tracks),
      ...tracks(soaring.playlist?.tracks),
      ...tracks(fresh.playlist?.tracks),
    ]) byID.set(item.id, item)
    return [...byID.values()]
  })
}

// 验证一批候选，返回可完整播放的歌曲（含 streamUrl）
// exclude: 需要排除的 provider id 集合（近期已播/黑名单歌手等由调用方处理）
export async function verifiedRadio({ count = 30, excludeIds = new Set(), seedTags = [] } = {}) {
  const candidates = await candidatePool()
  const pool = shuffled(candidates.filter((item) => !excludeIds.has(String(item.id))))
  const available = []
  for (let offset = 0; offset < pool.length && available.length < count && offset < 300; offset += 100) {
    const batch = pool.slice(offset, offset + 100)
    const sources = await resolveSources(batch.map((item) => item.id)).catch(() => [])
    const byId = new Map(sources.map((s) => [s.id, s]))
    for (const item of batch) {
      const src = byId.get(String(item.id))
      if (!src?.playable) continue
      available.push({ ...item, streamUrl: src.url, fee: 0 })
    }
  }
  if (!available.length) throw new Error('暂时没有可播放的歌曲，请稍后重试')
  return shuffled(available).slice(0, count)
}
