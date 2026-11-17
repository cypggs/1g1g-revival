// 网易云音乐双通道 API 客户端 —— 移植自 mygo-web-cloudmusic（已验证实现）
// 公开通道 music.163.com/api/* + EAPI 加密通道 interfacepc.music.163.com/eapi/*
import { createHash, createCipheriv, randomBytes } from 'node:crypto'

const API = 'https://music.163.com'
const EAPI = 'https://interfacepc.music.163.com'
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15'
const EAPI_UA = 'NeteaseMusic 9.0.90/5038 (iPhone; iOS 16.2; zh_CN)'
const deviceId = randomBytes(26).toString('hex').toUpperCase()

export function cookieHeader(session) {
  return Object.entries(session || {})
    .filter(([key, value]) => ['MUSIC_U', '__csrf', 'NMTID'].includes(key) && typeof value === 'string')
    .map(([key, value]) => `${key}=${value}`)
    .join('; ')
}

export async function request(url, { method = 'GET', form, session = {}, eapi = false } = {}) {
  const headers = { 'User-Agent': eapi ? EAPI_UA : UA, Referer: `${API}/` }
  const cookie = cookieHeader(session)
  if (cookie) headers.Cookie = cookie
  let body
  if (form) {
    body = new URLSearchParams(form).toString()
    headers['Content-Type'] = 'application/x-www-form-urlencoded'
  }
  const response = await fetch(url, { method, headers, body, signal: AbortSignal.timeout(20000) })
  const text = await response.text()
  let data
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error(`上游接口返回了无法识别的内容 (${response.status})`)
  }
  return { data, setCookies: response.headers.getSetCookie?.() || [], status: response.status }
}

export async function get(apiPath, query = {}, session = {}) {
  const url = new URL(apiPath, API)
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, String(value))
  const { data } = await request(url, { session })
  if (data.code && data.code !== 200) throw new Error(data.message || data.msg || `上游接口错误 (${data.code})`)
  return data
}

function eapiEncrypt(apiPath, data) {
  const text = JSON.stringify(data)
  const digest = createHash('md5').update(`nobody${apiPath}use${text}md5forencrypt`).digest('hex')
  const plain = Buffer.from(`${apiPath}-36cd479b6b5-${text}-36cd479b6b5-${digest}`)
  const pad = 16 - (plain.length % 16)
  const padded = Buffer.concat([plain, Buffer.alloc(pad, pad)])
  const cipher = createCipheriv('aes-128-ecb', Buffer.from('e82ckenh8dichen8'), null)
  cipher.setAutoPadding(false)
  return Buffer.concat([cipher.update(padded), cipher.final()]).toString('hex').toUpperCase()
}

export async function eapiPost(apiPath, values, session = {}) {
  const now = Date.now()
  const header = {
    osver: 'Microsoft-Windows-10-Professional-build-19045-64bit',
    deviceId,
    os: 'pc',
    appver: '3.1.17.204416',
    versioncode: '140',
    mobilename: '',
    buildver: String(Math.floor(now / 1000)),
    resolution: '1920x1080',
    channel: 'netease',
    requestId: `${now}_${String(now % 1000).padStart(4, '0')}`,
    __csrf: session.__csrf || '',
    ...(session.MUSIC_U ? { MUSIC_U: session.MUSIC_U } : {}),
    ...(session.NMTID ? { NMTID: session.NMTID } : {}),
  }
  const params = eapiEncrypt(apiPath, { ...values, header, e_r: false })
  const url = `${EAPI}/eapi/${apiPath.replace(/^\/api\//, '')}`
  return request(url, { method: 'POST', form: { params }, session, eapi: true })
}

// 统一歌曲字段（兼容多种上游返回形态）
export function track(t) {
  if (!t) return t
  return {
    ...t,
    ar: t.ar || t.artists || [],
    al: t.al || t.album || {},
    dt: t.dt ?? t.duration ?? 0,
    alia: t.alia || t.alias || [],
  }
}

export const tracks = (list) => (list || []).map(track)

export function sized(url, size = 600) {
  return (url || '').replace(/^http:/, 'https:') + (url ? `?param=${size}y${size}` : '')
}

// 内存 TTL 缓存
const cache = new Map()
export async function cached(key, seconds, fn) {
  const hit = cache.get(key)
  if (hit && hit.until > Date.now()) return hit.value
  const value = await fn()
  cache.set(key, { value, until: Date.now() + seconds * 1000 })
  return value
}

export function bustCache(prefix) {
  for (const key of cache.keys()) if (key.startsWith(prefix)) cache.delete(key)
}
