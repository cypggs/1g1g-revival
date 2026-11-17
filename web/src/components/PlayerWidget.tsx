// 播放区：播放器 + 播放列表（亦歌核心 widget 的忠实复刻）
import { useRef } from 'react'
import { usePlayer } from '../stores/playerStore'
import { useApp } from '../stores/appStore'
import { controls, loadCurrent } from '../hooks/useAudioEngine'
import { post } from '../services/api'
import type { Song } from '../types'

function formatTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) sec = 0
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export function PlayerWidget() {
  const player = usePlayer()
  const { user, setAuthModal, setLyricsOpen, lyricsOpen, requireLogin } = useApp()
  const clickTimer = useRef<ReturnType<typeof setTimeout>>()

  const current = player.songs[0]
  const allLocked = player.songs.length > 0 && player.songs.every((s) => s.locked)

  // 单击=下一首；双击=更换播放源（原版交互）
  function onNextClick() {
    clearTimeout(clickTimer.current)
    clickTimer.current = setTimeout(() => controls.next(), 260)
  }
  function onNextDoubleClick() {
    clearTimeout(clickTimer.current)
    void controls.replaySource()
  }

  function favorite(song: Song) {
    if (!user) {
      setAuthModal('login')
      return
    }
    post('/api/favorites', {
      id: song.id, name: song.name, artists: song.artists,
      album: song.album, coverUrl: song.coverUrl, duration: song.duration,
    }).then(() => {
      useApp.setState({}) // refresh
      alert(`已收藏《${song.name}》`)
    }).catch((e) => alert(e.message))
  }

  const modeText = player.mode === 'all' ? '全部' : player.mode === 'locked' ? '锁定' : '单曲'
  function cycleMode() {
    const order: ('all' | 'locked' | 'single')[] = player.songs.some((s) => s.locked)
      ? ['all', 'locked', 'single']
      : ['all', 'single']
    const next = order[(order.indexOf(player.mode) + 1) % order.length]
    player.setMode(next)
  }

  return (
    <section className="player" aria-label="播放区">
      <div className="player-controls">
        <div className="transport">
          <button
            title={`${player.playing ? '暂停' : '播放'} (P)`}
            onClick={() => void controls.toggle()}
          >
            {player.playing ? '❚❚' : '▶'}
          </button>
          <button title="下一首（双击更换播放源）(N)" onClick={onNextClick} onDoubleClick={onNextDoubleClick}>
            ▶▶❚
          </button>
        </div>
        <span className="time-pill" title="已播放 / 已缓冲">
          {formatTime(player.position)} / {formatTime(player.duration)}
        </span>
        <div className="volume">
          <button title="静音 (M)" onClick={() => player.toggleMute()}>
            {player.muted || player.volume === 0 ? '🔇' : player.volume < 0.5 ? '🔉' : '🔊'}
          </button>
          <input
            type="range" min={0} max={1} step={0.02}
            value={player.muted ? 0 : player.volume}
            onChange={(e) => player.setVolume(Number(e.target.value))}
            aria-label="音量"
          />
        </div>
      </div>

      <div className="player-tools">
        <button className="tool-btn" onClick={() => void player.reset()}>重置列表</button>
        <button className="tool-btn" onClick={() => player.shuffle()}>随机打乱</button>
        <button className="tool-btn" onClick={() => player.clear()}>清空列表</button>
        <span className="list-count">({player.songs.length})</span>
        <button className="mini-btn" title="增加列表长度" onClick={() => player.adjustLimit(1)}>+</button>
        <button
          className="mini-btn" title="缩短列表长度"
          disabled={player.songs.filter((s) => s.locked).length >= player.songs.length - 1 && player.songs.length <= 2}
          onClick={() => player.adjustLimit(-1)}
        >−</button>
        <span className="tool-spacer" />
        {player.loading && <span style={{ fontSize: 11, opacity: 0.7 }}>加载中…</span>}
      </div>

      <div className="playlist">
        <div className="playlist-rows">
          {player.songs.length === 0 && (
            <div className="row" style={{ justifyContent: 'center', opacity: 0.6 }}>列表为空，去搜索或重置列表吧</div>
          )}
          {player.songs.map((song, index) => (
            <div
              key={`${song.id}-${index}`}
              className={`row${index === 0 ? ' current' : ''}`}
              onDoubleClick={() => { player.playAt(index); void loadCurrent(true) }}
              title={`${song.name} - ${song.artists.join('/')}`}
            >
              <span className="lock-flag">{song.locked ? '🔒' : ''}</span>
              <span className="title">
                {song.name}
                <span className="artist"> - {song.artists.join('/')}</span>
              </span>
              <span className="hover-actions">
                <button title="立即播放（或双击此行）" onClick={() => { player.playAt(index); void loadCurrent(true) }}>▶</button>
                <button title={song.locked ? '解锁' : '锁定'} onClick={() => player.toggleLock(index)}>{song.locked ? '🔓' : '🔒'}</button>
                <button title="收藏" onClick={() => favorite(song)}>★</button>
                <button title="删除" onClick={() => index === 0 ? controls.next() : player.removeAt(index)}>✕</button>
              </span>
            </div>
          ))}
        </div>
        <div className="playlist-footer">
          <button className="mode-switch" onClick={() => (allLocked ? player.unlockAll() : player.lockAll())}>
            {allLocked ? '全解' : '全锁'}
          </button>
          <button className="mode-switch" onClick={cycleMode} title="播放模式">
            播放模式: {modeText} ▾
          </button>
          <span className="footer-spacer" />
          <button className="lyrics-toggle" onClick={() => setLyricsOpen(!lyricsOpen)}>
            歌词
          </button>
        </div>
      </div>
      {player.error && <div style={{ padding: '6px 12px', fontSize: 11, color: '#ffb0a0' }}>{player.error}</div>}
    </section>
  )
}
