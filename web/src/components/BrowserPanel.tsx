// 浏览区：右侧结果面板（收藏/历史/手气不错/搜索/热门）
import { useApp } from '../stores/appStore'
import { usePlayer } from '../stores/playerStore'
import { controls, loadCurrent } from '../hooks/useAudioEngine'
import { get, post, put, del } from '../services/api'
import type { Song, BrowserResult } from '../types'

export function BrowserPanel() {
  const { browserVisible, browserTab, browserResult, hideBrowser, user, setAuthModal } = useApp()
  const player = usePlayer()
  if (!browserVisible || !browserTab) return null

  function playNow(song: Song) {
    // 立即播放：若该歌在列表中则移到队首，否则插到队首（停止当前）
    const idx = player.songs.findIndex((s) => s.id === song.id)
    if (idx >= 0) player.playAt(idx)
    else {
      player.insertNext(song)
      player.playAt(0)
    }
    void loadCurrent(true)
  }

  function insertNext(song: Song) {
    player.insertNext(song) // 原版：插入第二位
  }

  async function favorite(song: Song, note?: string) {
    if (!user) return setAuthModal('login')
    await post('/api/favorites', {
      id: song.id, name: song.name, artists: song.artists,
      album: song.album, coverUrl: song.coverUrl, duration: song.duration, note,
    })
  }

  async function editNote(song: Song) {
    if (!user) return setAuthModal('login')
    const current = song.note || ''
    const note = prompt(`给《${song.name}》写点附注：`, current)
    if (note === null) return
    if (browserTab === 'favorites') {
      await put(`/api/favorites/${encodeURIComponent(song.id)}`, { note })
      await refresh()
    } else {
      await favorite(song, note)
    }
  }

  async function refresh() {
    if (!browserTab) return
    let path = ''
    if (browserTab === 'favorites') path = '/api/favorites'
    else if (browserTab === 'history') path = '/api/history'
    else if (browserTab === 'lucky') path = '/api/lucky'
    else if (browserTab === 'hot') path = '/api/chart?kind=hot'
    else return
    try {
      const data = await get<any>(path)
      const result: BrowserResult = browserTab === 'favorites'
        ? { title: `我的收藏 (${data.total})`, songs: data.songs, total: data.total, pages: data.pages, page: 1 }
        : browserTab === 'lucky'
          ? { title: '手气不错', songs: data.tracks, reasons: data.reasons }
          : browserTab === 'hot'
            ? { title: data.name, songs: data.songs }
            : { title: '刚刚听过', songs: data.songs }
      useApp.getState().setBrowserResult(result)
    } catch { /* 保持现状 */ }
  }

  async function pageSearch(page: number) {
    const q = useApp.getState().searchQuery
    if (!q.trim()) return
    const data = await get<{ songs: Song[]; total: number }>(`/api/search?q=${encodeURIComponent(q.trim())}&limit=13&offset=${(page - 1) * 13}`)
    useApp.getState().setBrowserResult({
      title: `搜索“${q.trim()}”`, songs: data.songs, total: data.total, page, pages: Math.max(1, Math.ceil(data.total / 13)),
    })
  }

  async function pageFavorites(page: number) {
    const data = await get<{ songs: Song[]; total: number; pages: number }>(`/api/favorites?page=${page}`)
    useApp.getState().setBrowserResult({
      title: `我的收藏 (${data.total})`, songs: data.songs, total: data.total, page, pages: data.pages,
    })
  }

  const result = browserResult
  const page = result?.page || 1
  const pages = result?.pages || 1

  return (
    <aside className="browser" aria-label="浏览区">
      <div className="browser-head">
        <span>{result?.title ?? '加载中…'}</span>
        <button className="hide-btn" title="隐藏浏览区" onClick={hideBrowser}>»</button>
      </div>
      <div className="browser-body">
        {result?.songs.map((song, i) => (
          <div
            key={`${song.id}-${i}`}
            className={`row${song.playable === false ? ' unplayable' : ''}`}
            title={song.playable === false ? '该歌曲需要会员或存在版权限制，无法播放' : `${song.name} - ${song.artists.join('/')} - ${song.album}`}
          >
            <span className="title">
              {song.name}
              <span className="artist"> - {song.artists.join('/')}{song.album ? ` - ${song.album}` : ''}</span>
              {song.playable === false && <span className="reason">VIP</span>}
              {song.note && <span className="reason">{song.note}</span>}
              {result.reasons?.[song.id] && <span className="reason">{result.reasons[song.id]}</span>}
            </span>
            <span className="hover-actions">
              {song.playable !== false && (
                <>
                  <button title="立即播放" onClick={() => playNow(song)}>▶</button>
                  <button title="加入播放列表（第二位）" onClick={() => insertNext(song)}>＋</button>
                </>
              )}
              <button title="添加/修改附注" onClick={() => void editNote(song)}>✎</button>
              <button title="收藏" onClick={() => void favorite(song).catch((e) => alert(e.message))}>★</button>
              {browserTab === 'favorites' && (
                <button title="删除收藏" onClick={() => void del(`/api/favorites/${encodeURIComponent(song.id)}`).then(refresh)}>✕</button>
              )}
            </span>
          </div>
        ))}
        {result && !result.songs.length && <div className="row" style={{ justifyContent: 'center', opacity: 0.6 }}>暂无内容</div>}
      </div>
      <div className="browser-foot">
        <span>
          <button className="tool-btn" onClick={() => {
            const list = (result?.songs || []).filter((s) => s.playable !== false)
            for (let i = list.length - 1; i >= 0; i--) player.insertNext(list[i])
          }}>加入本页</button>{' '}
          <button className="tool-btn" onClick={() => {
            const list = (result?.songs || []).filter((s) => s.playable !== false)
            for (let i = list.length - 1; i >= 0; i--) player.insertNext(list[i])
          }}>全部加入</button>
        </span>
        {(browserTab === 'search' || browserTab === 'favorites') && pages > 1 && (
          <span className="pager">
            <button disabled={page <= 1} onClick={() => void (browserTab === 'search' ? pageSearch(page - 1) : pageFavorites(page - 1))}>◀</button>
            <span>{page}</span>
            <button disabled={page >= pages} onClick={() => void (browserTab === 'search' ? pageSearch(page + 1) : pageFavorites(page + 1))}>▶</button>
          </span>
        )}
      </div>
    </aside>
  )
}
