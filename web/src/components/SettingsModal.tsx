// 设置弹窗：列表长度限制 / 黑名单管理 / 配色
import { useEffect, useState } from 'react'
import { useApp } from '../stores/appStore'
import { usePlayer } from '../stores/playerStore'
import { get, del } from '../services/api'
import type { ThemeName } from '../types'

export function SettingsModal() {
  const { settingsOpen, setSettingsOpen, settings, saveSettings, theme } = useApp()
  const player = usePlayer()
  const [blocked, setBlocked] = useState<string[]>([])

  useEffect(() => {
    if (!settingsOpen) return
    get<{ artists: string[] }>('/api/blocked').then((d) => setBlocked(d.artists)).catch(() => {})
  }, [settingsOpen])

  if (!settingsOpen) return null

  const listLimit = settings?.listLimit ?? player.limit

  return (
    <div className="modal-mask" onClick={() => setSettingsOpen(false)}>
      <div className="modal" style={{ width: 380 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span>个人设置</span>
          <button className="close" onClick={() => setSettingsOpen(false)}>✕</button>
        </div>
        <div className="modal-body">
          <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13 }}>
            播放列表长度限制
            <span>
              <button className="mini-btn" onClick={() => void saveSettings({ listLimit: Math.max(5, listLimit - 5) })}>−</button>
              <b style={{ margin: '0 8px' }}>{listLimit}</b>
              <button className="mini-btn" onClick={() => void saveSettings({ listLimit: Math.min(100, listLimit + 5) })}>+</button>
            </span>
          </label>
          <div className="hint">列表超过此长度后，播放完毕的歌曲不再自动补充。</div>
          <label style={{ fontSize: 13 }}>
            配色方案
            <div className="swatches" style={{ marginTop: 6 }}>
              {(['blue', 'red', 'ocean', 'black', 'google'] as ThemeName[]).map((t) => (
                <button key={t} className={`swatch-${t}${theme === t ? ' active' : ''}`} style={{ width: 22, height: 22 }}
                  onClick={() => void saveSettings({ theme: t })} />
              ))}
            </div>
          </label>
          <label style={{ fontSize: 13 }}>
            歌手黑名单（{blocked.length}）
            <div style={{ maxHeight: 120, overflowY: 'auto', marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {blocked.length === 0 && <span className="hint">暂无。可在底部信息区将歌手加入黑名单。</span>}
              {blocked.map((artist) => (
                <span key={artist} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  {artist}
                  <button className="mini-btn" onClick={() => void del(`/api/blocked/${encodeURIComponent(artist)}`).then(() =>
                    setBlocked((list) => list.filter((a) => a !== artist))
                  )}>移除</button>
                </span>
              ))}
            </div>
          </label>
        </div>
      </div>
    </div>
  )
}
