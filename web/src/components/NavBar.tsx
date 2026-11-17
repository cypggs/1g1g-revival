// 栏目区：热门 / 我的收藏 / 刚刚听过 / 手气不错 / 搜索
import { useState } from 'react'
import { useApp } from '../stores/appStore'
import { usePlayer } from '../stores/playerStore'
import { get } from '../services/api'
import type { BrowserTab, BrowserResult, Song } from '../types'

export function NavBar() {
  const { user, browserTab, openBrowser, hideBrowser, setBrowserResult, setAuthModal, browserVisible } = useApp()
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)

  async function show(tab: BrowserTab, fetcher: () => Promise<BrowserResult>) {
    if (tab === 'favorites' && !user) {
      setAuthModal('login')
      return
    }
    if (browserTab === tab && browserVisible) return hideBrowser()
    openBrowser(tab, null)
    setLoading(true)
    try {
      setBrowserResult(await fetcher())
    } catch (error) {
      setBrowserResult({ title: '加载失败', songs: [] })
      useApp.setState({ browserLoading: false })
      alert(error instanceof Error ? error.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }

  const chart = () => show('hot', async () => {
    const data = await get<{ name: string; songs: Song[] }>('/api/chart?kind=hot')
    return { title: data.name, songs: data.songs }
  })

  const favorites = () => show('favorites', async () => {
    const data = await get<{ songs: Song[]; total: number; pages: number; page: number }>('/api/favorites')
    return { title: `我的收藏 (${data.total})`, songs: data.songs, total: data.total, pages: data.pages, page: 1 }
  })

  const history = () => show('history', async () => {
    const data = await get<{ songs: Song[] }>('/api/history')
    return { title: '刚刚听过', songs: data.songs }
  })

  const lucky = () => show('lucky', async () => {
    const data = await get<{ tracks: Song[]; reasons: Record<string, string> }>('/api/lucky')
    return { title: '手气不错', songs: data.tracks, reasons: data.reasons }
  })

  async function search() {
    const q = query.trim()
    if (!q) return
    show('search', async () => {
      const data = await get<{ songs: Song[]; total: number }>(`/api/search?q=${encodeURIComponent(q)}&limit=13`)
      return { title: `搜索“${q}”`, songs: data.songs, total: data.total, page: 1, pages: Math.max(1, Math.ceil(data.total / 13)) }
    })
  }

  const cls = (tab: BrowserTab) => `nav-item${browserTab === tab && browserVisible ? ' active' : ''}`

  return (
    <nav className="navbar">
      <button className={cls('hot')} onClick={() => void chart()} title="快捷键 T">
        <span>♫</span> 热门
      </button>
      <button className={cls('favorites')} onClick={() => void favorites()} title="快捷键 F">
        <span>★</span> 我的收藏
      </button>
      <button className={cls('history')} onClick={() => void history()} title="快捷键 H">
        <span>◔</span> 刚刚听过
      </button>
      <button className={cls('lucky')} onClick={() => void lucky()} title="发现你可能喜欢的歌">
        <span>✤</span> 手气不错
      </button>
      <div className="search-wrap">
        <input
          value={query}
          placeholder="歌手 / 歌名 / 专辑"
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void search()}
        />
        <button onClick={() => void search()} disabled={loading}>{loading ? '…' : '搜索'}</button>
      </div>
    </nav>
  )
}
