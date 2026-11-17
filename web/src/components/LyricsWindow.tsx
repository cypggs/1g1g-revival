// 歌词浮窗：同步滚动/点击校准/拖拽/缩放/位置记忆
import { useEffect, useRef, useState } from 'react'
import { useApp } from '../stores/appStore'
import { usePlayer } from '../stores/playerStore'
import { get } from '../services/api'

interface LyricLine { time: number; text: string }

function parseLyrics(raw: string): LyricLine[] {
  const lines: LyricLine[] = []
  for (const line of raw.split('\n')) {
    const match = line.match(/\[(\d+):(\d+(?:\.\d+)?)\]/)
    if (!match) continue
    const time = Number(match[1]) * 60 + Number(match[2])
    const text = line.replace(/\[.*?\]/g, '').trim()
    if (text) lines.push({ time, text })
  }
  return lines.sort((a, b) => a.time - b.time)
}

const LS_GEO = '1g1g-lyrics-geo'

export function LyricsWindow() {
  const { lyricsOpen, setLyricsOpen } = useApp()
  const song = usePlayer((s) => s.songs[0])
  const position = usePlayer((s) => s.position)
  const [lines, setLines] = useState<LyricLine[]>([])
  const [missing, setMissing] = useState(false)
  const [geo, setGeo] = useState(() => {
    try { return JSON.parse(localStorage.getItem(LS_GEO) || '{}') } catch { return {} }
  })
  const winRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const dragState = useRef<{ x: number; y: number; left: number; top: number } | null>(null)
  const sizeState = useRef<{ x: number; y: number; w: number; h: number } | null>(null)

  useEffect(() => {
    if (!lyricsOpen || !song) return
    let cancelled = false
    setLines([])
    setMissing(false)
    get<{ lrc?: { lyric?: string }; tlyric?: { lyric?: string } }>(`/api/lyrics?id=${song.id}`)
      .then((data) => {
        if (cancelled) return
        const parsed = parseLyrics(data.lrc?.lyric || '')
        if (parsed.length) setLines(parsed)
        else setMissing(true)
      })
      .catch(() => !cancelled && setMissing(true))
    return () => { cancelled = true }
  }, [lyricsOpen, song?.id])

  useEffect(() => {
    localStorage.setItem(LS_GEO, JSON.stringify(geo))
  }, [geo])

  // 当前行滚动跟随
  const activeIndex = lines.findIndex((l, i) => position >= l.time && (i === lines.length - 1 || position < lines[i + 1].time))
  useEffect(() => {
    const list = listRef.current
    if (!list || activeIndex < 0) return
    const el = list.children[activeIndex] as HTMLElement | undefined
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [activeIndex])

  // 拖拽/缩放在窗口内持续监听（必须无条件注册，避免条件 hook）
  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (dragState.current) {
        const d = dragState.current
        setGeo((g: any) => ({ ...g, left: Math.max(0, d.left + e.clientX - d.x), top: Math.max(0, d.top + e.clientY - d.y) }))
      }
      if (sizeState.current) {
        const s = sizeState.current
        setGeo((g: any) => ({ ...g, width: Math.max(260, s.w + e.clientX - s.x), height: Math.max(160, s.h + e.clientY - s.y) }))
      }
    }
    function onUp() { dragState.current = null; sizeState.current = null }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, [])

  function onDragStart(e: React.MouseEvent) {
    dragState.current = { x: e.clientX, y: e.clientY, left: geo.left ?? window.innerWidth / 2 - 170, top: geo.top ?? 120 }
  }
  function onResizeStart(e: React.MouseEvent) {
    e.preventDefault()
    const rect = winRef.current?.getBoundingClientRect()
    if (!rect) return
    sizeState.current = { x: e.clientX, y: e.clientY, w: rect.width, h: rect.height }
  }

  if (!lyricsOpen || !song) return null

  function seekTo(line: LyricLine) {
    import('../hooks/useAudioEngine').then(({ controls }) => controls.seek(line.time))
  }

  return (
    <div
      ref={winRef}
      className="lyrics-window"
      style={{
        left: geo.left ?? window.innerWidth / 2 - 170,
        top: geo.top ?? 120,
        width: geo.width ?? 340,
        height: geo.height ?? 260,
      }}
    >
      <div className="lyrics-drag" onMouseDown={onDragStart}>
        <button title="关闭" onClick={() => setLyricsOpen(false)}>✕</button>
      </div>
      <div className="lyrics-lines" ref={listRef}>
        {missing && <div style={{ opacity: 0.7, padding: 20 }}>暂无歌词</div>}
        {lines.map((line, i) => (
          <div
            key={i}
            className={`lyrics-line${i === activeIndex ? ' active' : ''}`}
            onClick={() => seekTo(line)}
            title="点击校准到此句"
          >
            {line.text}
          </div>
        ))}
      </div>
      <div className="lyrics-resize" onMouseDown={onResizeStart} />
    </div>
  )
}
