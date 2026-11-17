// 1g1g Revival 主服务：静态文件 + API（零依赖 Node http）
import http from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { handleApi } from './routes.mjs'
import { setSecureFlag } from './auth.mjs'

const root = path.dirname(fileURLToPath(import.meta.url))
const dist = process.env.DIST_DIR || path.join(root, '..', 'web', 'dist')
const port = Number(process.env.PORT || 3000)
setSecureFlag(process.env.NODE_ENV === 'production')

const mime = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.mp3': 'audio/mpeg', '.woff2': 'font/woff2', '.json': 'application/json; charset=utf-8',
}

async function staticFile(req, res, url) {
  let pathname
  try { pathname = decodeURIComponent(url.pathname) } catch { pathname = '/' }
  let file = path.resolve(dist, `.${pathname}`)
  if (!file.startsWith(dist + path.sep) && file !== dist) file = path.join(dist, 'index.html')
  try {
    if ((await stat(file)).isDirectory()) file = path.join(file, 'index.html')
    const info = await stat(file)
    const headers = { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream', 'Content-Length': info.size }
    if (path.extname(file) !== '.html') headers['Cache-Control'] = 'public, max-age=3600'
    res.writeHead(200, headers)
    if (req.method === 'HEAD') return res.end()
    res.end(await readFile(file))
  } catch {
    file = path.join(dist, 'index.html')
    try {
      const body = await readFile(file)
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Length': body.length })
      res.end(body)
    } catch {
      res.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8' })
      res.end('网站尚未构建，请先运行 npm run build（开发模式请访问 Vite 端口）')
    }
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`)
  try {
    if (url.pathname.startsWith('/api/')) await handleApi(req, res, url)
    else await staticFile(req, res, url)
  } catch (error) {
    console.error(`${req.method} ${url.pathname}:`, error.message)
    if (!res.headersSent) res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify({ code: 502, message: error.message || '服务暂时不可用，请稍后重试' }))
  }
})

server.listen(port, '0.0.0.0', () => console.log(`1g1g Revival: http://0.0.0.0:${port}`))
