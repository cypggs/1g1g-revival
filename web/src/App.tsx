// 应用外壳：五分区组装
import { useEffect } from 'react'
import { useApp } from './stores/appStore'
import { usePlayer } from './stores/playerStore'
import { useAudioEngine, loadCurrent } from './hooks/useAudioEngine'
import { useKeyboard } from './hooks/useKeyboard'
import { TopBar } from './components/TopBar'
import { NavBar } from './components/NavBar'
import { PlayerWidget } from './components/PlayerWidget'
import { BrowserPanel } from './components/BrowserPanel'
import { InfoBar } from './components/InfoBar'
import { Welcome } from './components/Welcome'
import { LyricsWindow } from './components/LyricsWindow'
import { AuthModal } from './components/AuthModal'
import { SettingsModal } from './components/SettingsModal'
import { CommentsPanel } from './components/CommentsPanel'

export default function App() {
  const { welcome, browserVisible, init } = useApp()
  const error = usePlayer((s) => s.error)
  useAudioEngine()
  useKeyboard()

  useEffect(() => { void init() }, [])
  useEffect(() => {
    document.body.classList.toggle('browser-closed', !browserVisible)
  }, [browserVisible])

  // 分享直链：/歌手+歌曲名 → 自动播放
  useEffect(() => {
    const match = location.pathname.match(/^\/([^/]+)\+([^/]+)$/)
    if (match) {
      const artist = decodeURIComponent(match[1])
      const name = decodeURIComponent(match[2])
      void import('./services/api').then(async ({ get }) => {
        try {
          const data = await get<{ songs: any[] }>(`/api/search?q=${encodeURIComponent(`${artist} ${name}`)}&limit=1`)
          const song = data.songs[0]
          if (song) {
            const store = usePlayer.getState()
            const wasEmpty = store.songs.length === 0
            store.insertNext(song) // 非空队列插到第二位
            store.playAt(wasEmpty ? 0 : 1) // 移到队首并立即播放
            void loadCurrent(false)
          }
        } catch { /* 忽略 */ }
      })
    }
  }, [])

  // 启动时空列表则取首批歌曲（不自动播放，等待用户交互）
  useEffect(() => {
    void usePlayer.getState().bootstrapIfEmpty()
  }, [])

  if (welcome) {
    return (
      <>
        <TopBar />
        <Welcome />
      </>
    )
  }

  return (
    <>
      <TopBar />
      <NavBar />
      <main className="stage">
        <PlayerWidget />
        <BrowserPanel />
      </main>
      <InfoBar />
      <LyricsWindow />
      <AuthModal />
      <SettingsModal />
      <CommentsPanel />
      {error && <div className="toast">{error}</div>}
    </>
  )
}
