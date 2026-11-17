// 用户认证：邮箱+密码（scrypt），HttpOnly Cookie 会话
import { scryptSync, randomBytes, timingSafeEqual } from 'node:crypto'
import { db, now } from './db.mjs'

const SESSION_DAYS = 30

export function hashPassword(password, salt = randomBytes(16).toString('hex')) {
  const hash = scryptSync(password, salt, 64).toString('hex')
  return { salt, hash }
}

function verifyPassword(password, salt, hash) {
  const candidate = scryptSync(password, salt, 64)
  const expected = Buffer.from(hash, 'hex')
  return candidate.length === expected.length && timingSafeEqual(candidate, expected)
}

export function createUser(email, name, password) {
  const { salt, hash } = hashPassword(password)
  const result = db.prepare(
    'INSERT INTO users (email, name, password_hash, salt, created_at) VALUES (?, ?, ?, ?, ?)'
  ).run(email.trim().toLowerCase(), name.trim(), hash, salt, now())
  return db.prepare('SELECT id, email, name FROM users WHERE id = ?').get(result.lastInsertRowid)
}

export function authenticate(email, password) {
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.trim().toLowerCase())
  if (!user || !verifyPassword(password, user.salt, user.password_hash)) return null
  db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').run(now(), user.id)
  return { id: user.id, email: user.email, name: user.name }
}

export function createSession(userId) {
  const token = randomBytes(32).toString('base64url')
  const expires = now() + SESSION_DAYS * 86400 * 1000
  db.prepare('INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)').run(token, userId, now(), expires)
  return { token, expires }
}

export function destroySession(token) {
  if (token) db.prepare('DELETE FROM sessions WHERE token = ?').run(token)
}

export function userForSession(token) {
  if (!token) return null
  const row = db.prepare(`
    SELECT u.id, u.email, u.name FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token = ? AND s.expires_at > ?
  `).get(token, now())
  return row || null
}

export function parseCookies(req) {
  const out = {}
  for (const part of (req.headers.cookie || '').split(';')) {
    const at = part.indexOf('=')
    if (at > 0) out[part.slice(0, at).trim()] = part.slice(at + 1).trim()
  }
  return out
}

export function sessionCookie(token, expires) {
  const secure = reqSecure || process.env.NODE_ENV === 'production'
  return `1g1g_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}${secure ? '; Secure' : ''}`
}

let reqSecure = false
export function setSecureFlag(v) { reqSecure = v }
