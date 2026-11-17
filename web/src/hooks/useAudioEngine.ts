// 音频引擎：HTML5 Audio ↔ 播放列表引擎桥接
// - 播放完毕/失败按亦歌规则推进列表
// - 双击"下一首"= 重新取源重播当前（非切歌）
// - 失败自动重取源一次，仍失败才切下一首
import { useEffect, useRef } from 'react'
import { usePlayer } from '../stores/playerStore'
import { get } from '../services/api'

let audio: HTMLAudioElement | null = null
let loadSeq = 0

function element(): HTMLAudioElement {
  if (audio) return audio
  audio = new Audio()
  audio.preload = 'auto'
  audio.crossOrigin = 'anonymous'
  return audio
}

async function streamUrlFor(song: { id: string; streamUrl?: string }, forceRefresh = false): Promise<string> {
  if (song.streamUrl && !forceRefresh) return song.streamUrl
  const data = await get<{ stream?: { url: string }; message?: string }>(`/api/stream?id=${song.id}`)
  if (!data.stream?.url) throw new Error(data.message || '这首歌曲暂时无法播放')
  return data.stream.url
}

function mediaSession(song: { name: string; artists: string[]; album: string; coverUrl?: string }) {
  if (!('mediaSession' in navigator)) return
  navigator.mediaSession.metadata = new MediaMetadata({
    title: song.name,
    artist: song.artists.join(' / '),
    album: song.album,
    artwork: song.coverUrl ? [{ src: song.coverUrl, sizes: '512x512' }] : [],
  })
  navigator.mediaSession.setActionHandler('play', () => void controls.play())
  navigator.mediaSession.setActionHandler('pause', () => controls.pause())
  navigator.mediaSession.setActionHandler('nexttrack', () => controls.next())
}

export async function loadCurrent(autoplay: boolean): Promise<void> {
  const state = usePlayer.getState()
  const song = state.songs[0]
  if (!song) return
  const seq = ++loadSeq
  const el = element()
  el.pause()
  usePlayer.setState({ position: 0, buffered: 0, duration: song.duration || 0, error: '', loading: true })
  mediaSession(song)
  document.title = `${song.name} - ${song.artists.join('/')} | 亦歌`
  try {
    const url = await streamUrlFor(song)
    if (seq !== loadSeq) return
    el.src = url
    el.load()
    if (autoplay) await el.play()
    usePlayer.setState({ loading: false })
  } catch (error) {
    if (seq !== loadSeq) return
    usePlayer.setState({ loading: false, playing: false, error: error instanceof Error ? error.message : '播放失败' })
  }
}

function advanceAndLoad(reason: 'ended' | 'skip') {
  const state = usePlayer.getState()
  state.advance(reason)
  const next = usePlayer.getState().songs[0]
  if (next) void loadCurrent(true)
  else usePlayer.setState({ playing: false })
}

export const controls = {
  async play() {
    const el = element()
    if (!el.src) return loadCurrent(true)
    try { await el.play() } catch (error) {
      const notAllowed = error instanceof DOMException && error.name === 'NotAllowedError'
      usePlayer.getState().setError(notAllowed
        ? '浏览器阻止了自动播放，请再点一次播放按钮'
        : error instanceof Error ? error.message : '播放失败')
    }
  },
  pause() { element().pause() },
  toggle() { usePlayer.getState().playing ? controls.pause() : controls.play() },
  seek(seconds: number) {
    const el = element()
    el.currentTime = Math.max(0, seconds)
    usePlayer.setState({ position: el.currentTime })
  },

  // 单击下一首：跳过（列表按规则推进）
  next() { advanceAndLoad('skip') },

  // 双击下一首：重新取源重播当前歌曲（原版行为）
  async replaySource() {
    const song = usePlayer.getState().songs[0]
    if (!song) return
    const seq = ++loadSeq
    const el = element()
    usePlayer.setState({ loading: true, error: '' })
    try {
      const url = await streamUrlFor(song, true)
      if (seq !== loadSeq) return
      el.src = url
      el.load()
      await el.play()
      usePlayer.setState({ loading: false })
    } catch {
      if (seq !== loadSeq) return
      usePlayer.setState({ loading: false })
      advanceAndLoad('skip')
    }
  },
}

export function useAudioEngine() {
  const setPlaying = usePlayer((s) => s.setPlaying)
  const setLoading = usePlayer((s) => s.setLoading)
  const setProgress = usePlayer((s) => s.setProgress)
  const volume = usePlayer((s) => s.volume)
  const muted = usePlayer((s) => s.muted)
  const mounted = useRef(false)

  useEffect(() => {
    if (mounted.current) return
    mounted.current = true
    const el = element()
    el.volume = usePlayer.getState().volume

    el.addEventListener('timeupdate', () => {
      const buffered = el.buffered.length ? el.buffered.end(el.buffered.length - 1) : 0
      setProgress(el.currentTime || 0, buffered, Number.isFinite(el.duration) ? el.duration : 0)
    })
    el.addEventListener('progress', () => {
      const buffered = el.buffered.length ? el.buffered.end(el.buffered.length - 1) : 0
      usePlayer.setState({ buffered })
    })
    el.addEventListener('play', () => setPlaying(true))
    el.addEventListener('pause', () => setPlaying(false))
    el.addEventListener('waiting', () => setLoading(true))
    el.addEventListener('canplay', () => setLoading(false))
    el.addEventListener('ended', () => {
      const state = usePlayer.getState()
      if (state.mode === 'single') {
        el.currentTime = 0
        void el.play()
        return
      }
      advanceAndLoad('ended')
    })
    el.addEventListener('error', () => {
      // 播放中出错：自动重取源一次，再失败切下一首
      const song = usePlayer.getState().songs[0]
      if (!song) return
      setLoading(true)
      streamUrlFor(song, true)
        .then((url) => {
          if (loadSeq !== loadSeq) return
          el.src = url
          el.load()
          return el.play()
        })
        .catch(() => advanceAndLoad('skip'))
    })
  }, [])

  useEffect(() => { element().volume = muted ? 0 : volume }, [volume, muted])
}
