// 数据层：node:sqlite（Node 22.5+ 内置）
import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import path from 'node:path'

const dataDir = process.env.DATA_DIR || path.join(process.cwd(), 'data')
mkdirSync(dataDir, { recursive: true })
export const db = new DatabaseSync(path.join(dataDir, '1g1g.db'))

db.exec(`
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  last_login_at INTEGER
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS user_settings (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  theme TEXT NOT NULL DEFAULT 'blue',
  list_limit INTEGER NOT NULL DEFAULT 30,
  volume REAL NOT NULL DEFAULT 0.8,
  muted INTEGER NOT NULL DEFAULT 0,
  preferences TEXT NOT NULL DEFAULT '{}',
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS favorites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'netease',
  song_id TEXT NOT NULL,
  name TEXT NOT NULL,
  artists TEXT NOT NULL,
  album TEXT NOT NULL DEFAULT '',
  cover_url TEXT NOT NULL DEFAULT '',
  duration INTEGER NOT NULL DEFAULT 0,
  note TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  UNIQUE(user_id, provider, song_id)
);

CREATE TABLE IF NOT EXISTS listening_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  device_id TEXT NOT NULL DEFAULT '',
  provider TEXT NOT NULL DEFAULT 'netease',
  song_id TEXT NOT NULL,
  name TEXT NOT NULL,
  artists TEXT NOT NULL,
  album TEXT NOT NULL DEFAULT '',
  played_at INTEGER NOT NULL,
  play_ms INTEGER NOT NULL DEFAULT 0,
  completed INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_history_user_time ON listening_history(user_id, played_at DESC);

CREATE TABLE IF NOT EXISTS blocked_artists (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL DEFAULT '',
  artist TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_blocked_unique ON blocked_artists(user_id, artist);

CREATE TABLE IF NOT EXISTS user_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  device_id TEXT NOT NULL DEFAULT '',
  provider TEXT NOT NULL DEFAULT 'netease',
  song_id TEXT NOT NULL,
  event TEXT NOT NULL, -- favorite|unfavorite|lock|unlock|skip|complete|partial| blacklist
  weight INTEGER NOT NULL,
  artists TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_user_time ON user_events(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS playback_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  provider TEXT NOT NULL DEFAULT 'netease',
  song_id TEXT NOT NULL,
  kind TEXT NOT NULL, -- unavailable|wrong_song|wrong_artist|wrong_album|other
  detail TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS songs (
  provider TEXT NOT NULL,
  song_id TEXT NOT NULL,
  name TEXT NOT NULL,
  artists TEXT NOT NULL,
  album TEXT NOT NULL DEFAULT '',
  cover_url TEXT NOT NULL DEFAULT '',
  duration INTEGER NOT NULL DEFAULT 0,
  playability TEXT NOT NULL DEFAULT 'unknown',
  checked_at INTEGER,
  PRIMARY KEY (provider, song_id)
);

CREATE TABLE IF NOT EXISTS source_cache (
  provider TEXT NOT NULL,
  song_id TEXT NOT NULL,
  url TEXT NOT NULL,
  size INTEGER NOT NULL DEFAULT 0,
  bitrate INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'unknown',
  checked_at INTEGER NOT NULL,
  PRIMARY KEY (provider, song_id)
);
`)

export function now() { return Date.now() }

export function upsertSong(song, playability = 'unknown') {
  db.prepare(`
    INSERT INTO songs (provider, song_id, name, artists, album, cover_url, duration, playability, checked_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(provider, song_id) DO UPDATE SET
      name = excluded.name, artists = excluded.artists, album = excluded.album,
      cover_url = excluded.cover_url, duration = excluded.duration,
      playability = excluded.playability, checked_at = excluded.checked_at
  `).run(
    song.provider || 'netease', String(song.id), song.name || '',
    (song.artists || []).join('/'), song.album || '', song.coverUrl || '',
    song.duration || 0, playability, now()
  )
}

export function cacheSource(provider, songId, source) {
  db.prepare(`
    INSERT INTO source_cache (provider, song_id, url, size, bitrate, status, checked_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(provider, song_id) DO UPDATE SET
      url = excluded.url, size = excluded.size, bitrate = excluded.bitrate,
      status = excluded.status, checked_at = excluded.checked_at
  `).run(provider, String(songId), source.url || '', source.size || 0, source.bitrate || 0, source.status || 'unknown', now())
}

export function getCachedSource(provider, songId, maxAgeMs = 10 * 60 * 1000) {
  const row = db.prepare('SELECT * FROM source_cache WHERE provider = ? AND song_id = ?').get(provider, String(songId))
  if (!row) return null
  if (Date.now() - row.checked_at > maxAgeMs || row.status !== 'available') return null
  return row
}
