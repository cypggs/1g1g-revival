// 播放列表引擎 —— 亦歌核心交互的忠实实现
// 规则（源自官方帮助文档）：
// - 播放器总是播放列表第一首；播完列表整体上滚一格
// - 锁定歌播完回列表底部；未锁定歌被移除后系统在底部补充新歌
// - 列表有"长度限制"（默认 30，初始 20），超限后不再补充
// - 「加入播放列表」插入第二位
// - 模式：播放全部 / 只播锁定 / 循环当前
import { create } from 'zustand'
import type { Song, PlayMode } from '../types'
import { get, post } from '../services/api'

const LS_KEY = '1g1g-playlist'
const LS_VOLUME = '1g1g-volume'
const LS_LIMIT = '1g1g-list-limit'

interface PersistedQueue { songs: Song[] }

function loadQueue(): Song[] {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as PersistedQueue
    return Array.isArray(parsed.songs) ? parsed.songs : []
  } catch { return [] }
}

function persist(songs: Song[]) {
  localStorage.setItem(LS_KEY, JSON.stringify({ songs }))
}

interface PlayerState {
  songs: Song[]
  limit: number
  mode: PlayMode
  playing: boolean
  loading: boolean
  position: number
  buffered: number
  duration: number
  volume: number
  muted: boolean
  error: string
  // actions
  setQueue: (songs: Song[], autoplay?: boolean) => void
  playAt: (index: number) => void
  insertNext: (song: Song) => void
  removeAt: (index: number) => void
  toggleLock: (index: number) => void
  lockAll: () => void
  unlockAll: () => void
  shuffle: () => void
  clear: () => void
  adjustLimit: (delta: number) => void
  setMode: (mode: PlayMode) => void
  advance: (reason: 'ended' | 'skip', playMs?: number) => void
  setPlaying: (playing: boolean) => void
  setLoading: (loading: boolean) => void
  setProgress: (position: number, buffered: number, duration: number) => void
  setVolume: (volume: number) => void
  toggleMute: () => void
  setError: (error: string) => void
  reportEvent: (event: string, playMs?: number) => void
  refill: (count?: number) => Promise<void>
  reset: () => Promise<void>
  bootstrapIfEmpty: () => Promise<void>
}

let refillInFlight = false
const playedMs = { current: 0 }

export const usePlayer = create<PlayerState>((set, getState) => {
  // ---- 内部：播放完毕/跳过后的列表推进 ----
  function advanceQueue(reason: 'ended' | 'skip') {
    const state = getState()
    const songs = [...state.songs]
    if (!songs.length) return { songs, started: false }
    const current = songs[0]
    const playMs = playedMs.current
    // 推荐信号
    const ratio = current.duration > 0 ? playMs / (current.duration * 1000) : 0
    if (reason === 'ended' || ratio > 0.9) state.reportEvent('complete', playMs)
    else if (ratio < 0.2) state.reportEvent('partial', playMs)
    else state.reportEvent('skip', playMs)

    if (current.locked) {
      songs.push(songs.shift()!) // 锁定 → 回底部
    } else {
      songs.shift() // 未锁定 → 移除
    }

    if (state.mode === 'locked') {
      // 只播锁定：把第一首锁定歌带到队首
      const idx = songs.findIndex((s) => s.locked)
      if (idx > 0) songs.unshift(songs.splice(idx, 1)[0])
    }

    // 补充新歌：仅当列表长度低于限制
    if (songs.length < state.limit) {
      const need = Math.min(state.limit - songs.length, 2)
      void getState().refill(need)
    }
    set({ songs })
    persist(songs)
    return { songs, started: true }
  }

  return {
    songs: loadQueue(),
    limit: Number(localStorage.getItem(LS_LIMIT)) || 30,
    mode: 'all',
    playing: false,
    loading: false,
    position: 0,
    buffered: 0,
    duration: 0,
    volume: Number(localStorage.getItem(LS_VOLUME) ?? 0.8),
    muted: false,
    error: '',

    setQueue: (songs) => {
      persist(songs)
      set({ songs, mode: 'all' })
    },

    playAt: (index) => {
      const songs = [...getState().songs]
      if (index < 0 || index >= songs.length) return
      const [target] = songs.splice(index, 1)
      songs.unshift(target)
      persist(songs)
      set({ songs, position: 0 })
    },

    insertNext: (song) => {
      const songs = [...getState().songs]
      const exists = songs.findIndex((s) => s.id === song.id)
      if (exists >= 0) songs.splice(exists, 1)
      if (songs.length === 0) songs.unshift(song)
      else songs.splice(1, 0, song)
      persist(songs)
      set({ songs })
    },

    removeAt: (index) => {
      const songs = [...getState().songs]
      if (index < 0 || index >= songs.length) return
      songs.splice(index, 1)
      if (songs.length < getState().limit) void getState().refill(1)
      persist(songs)
      set({ songs })
    },

    toggleLock: (index) => {
      const songs = [...getState().songs]
      if (!songs[index]) return
      songs[index] = { ...songs[index], locked: !songs[index].locked }
      persist(songs)
      set({ songs })
      getState().reportEvent(songs[index].locked ? 'lock' : 'unlock')
    },

    lockAll: () => {
      const songs = getState().songs.map((s) => ({ ...s, locked: true }))
      persist(songs)
      set({ songs })
    },

    unlockAll: () => {
      const songs = getState().songs.map((s) => ({ ...s, locked: false }))
      persist(songs)
      set({ songs })
    },

    shuffle: () => {
      const songs = [...getState().songs]
      const [current, ...rest] = songs
      for (let i = rest.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[rest[i], rest[j]] = [rest[j], rest[i]]
      }
      persist([current, ...rest])
      set({ songs: [current, ...rest] })
    },

    clear: () => {
      persist([])
      set({ songs: [] })
    },

    adjustLimit: (delta) => {
      const limit = Math.max(5, Math.min(100, getState().limit + delta))
      localStorage.setItem(LS_LIMIT, String(limit))
      set({ limit })
      const songs = getState().songs
      if (songs.length > limit) {
        persist(songs.slice(0, limit))
        set({ songs: songs.slice(0, limit) })
      }
    },

    setMode: (mode) => set({ mode }),

    advance: (reason, playMs) => {
      playedMs.current = playMs ?? playedMs.current
      const { songs, started } = advanceQueue(reason)
      set({ position: 0 })
      return started ? songs : null as never
    },

    setPlaying: (playing) => set({ playing }),
    setLoading: (loading) => set({ loading }),
    setProgress: (position, buffered, duration) => {
      playedMs.current = position * 1000
      set({ position, buffered, duration })
    },
    setVolume: (volume) => {
      localStorage.setItem(LS_VOLUME, String(volume))
      set({ volume, muted: volume === 0 ? getState().muted : false })
    },
    toggleMute: () => set({ muted: !getState().muted }),
    setError: (error) => set({ error }),

    reportEvent: (event, playMs) => {
      const songs = getState().songs
      const current = songs[0]
      if (!current) return
      post('/api/event', { event, song: { id: current.id, name: current.name, artists: current.artists, album: current.album, duration: current.duration }, playMs }).catch(() => {})
    },

    refill: async (count = 3) => {
      if (refillInFlight) return
      refillInFlight = true
      try {
        const state = getState()
        if (state.songs.length >= state.limit) return
        const data = await post<{ tracks: any[] }>('/api/refill', {
          count,
          excludeIds: state.songs.map((s) => s.id),
        })
        const existing = new Set(getState().songs.map((s) => s.id))
        const fresh = data.tracks
          .filter((t) => !existing.has(String(t.id)))
          .map((t) => ({ ...t, locked: false }) as Song)
        const songs = [...getState().songs]
        for (const song of fresh) {
          if (songs.length >= getState().limit) break
          songs.push(song)
        }
        persist(songs)
        set({ songs })
      } catch {
        // 补歌失败静默，下次推进时重试
      } finally {
        refillInFlight = false
      }
    },

    reset: async () => {
      const data = await get<{ tracks: Song[] }>('/api/bootstrap')
      const songs = data.tracks.map((t) => ({ ...t, locked: false }))
      persist(songs)
      set({ songs, mode: 'all' })
    },

    bootstrapIfEmpty: async () => {
      if (getState().songs.length) return
      await getState().reset()
    },
  }
})

export function currentSong(): Song | undefined {
  return usePlayer.getState().songs[0]
}
