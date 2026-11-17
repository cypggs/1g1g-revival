// 全局键盘快捷键：T 热门 F 收藏 H 刚听过 P 播放暂停 N 下一首 M 静音
// 输入框聚焦时不触发
import { useEffect } from 'react'
import { useApp } from '../stores/appStore'
import { usePlayer } from '../stores/playerStore'
import { controls } from './useAudioEngine'

export function useKeyboard() {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return
      const key = e.key.toLowerCase()
      const { user, browserTab, browserVisible, openBrowser, hideBrowser, setBrowserResult, setAuthModal } = useApp.getState()
      const show = async (tab: 'hot' | 'favorites' | 'history', path: string, title: (d: any) => { title: string; songs: any[] }) => {
        if (tab === 'favorites' && !user) return setAuthModal('login')
        if (browserTab === tab && browserVisible) return hideBrowser()
        openBrowser(tab, null)
        try {
          const { get } = await import('../services/api')
          const data = await get<any>(path)
          setBrowserResult(title(data))
        } catch { useApp.setState({ browserLoading: false }) }
      }
      switch (key) {
        case 't':
          void show('hot', '/api/chart?kind=hot', (d) => ({ title: d.name, songs: d.songs }))
          break
        case 'f':
          void show('favorites', '/api/favorites', (d) => ({ title: `我的收藏 (${d.total})`, songs: d.songs, pages: d.pages, page: 1 }))
          break
        case 'h':
          void show('history', '/api/history', (d) => ({ title: '刚刚听过', songs: d.songs }))
          break
        case 'p':
          void controls.toggle()
          break
        case 'n':
          controls.next()
          break
        case 'm':
          usePlayer.getState().toggleMute()
          break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}
