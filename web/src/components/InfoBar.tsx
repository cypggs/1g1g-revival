// 信息区：底部歌曲信息条（分享/黑名单/歌词/学唱/MV/下载）
import { useApp } from '../stores/appStore'
import { usePlayer } from '../stores/playerStore'
import { post } from '../services/api'

export function InfoBar() {
  const song = usePlayer((s) => s.songs[0])
  const { setLyricsOpen, lyricsOpen, setCommentsOpen, commentsOpen, requireLogin } = useApp()
  if (!song) return null

  const artist = song.artists.join('/')
  const sharePath = `/${encodeURIComponent(artist)}+${encodeURIComponent(song.name)}`

  async function share() {
    const url = `${location.origin}${sharePath}`
    const encoded = `${location.origin}${sharePath}` // 现代浏览器直接支持中文路径
    try {
      await navigator.clipboard.writeText(encoded)
      alert(`播放链接已复制：\n${encoded}\n\n发给朋友，打开即听。`)
    } catch {
      prompt('复制以下链接分享：', encoded)
    }
  }

  async function blacklist() {
    if (!confirm(`把"${artist}"加入黑名单？\n亦歌将不会再推荐${artist}的歌。`)) return
    await post('/api/blocked', { artist }).catch((e) => alert(e.message))
    alert(`已把"${artist}"加入黑名单`)
  }

  async function report() {
    const kind = prompt('报告问题类型：unavailable(无法播放) / wrong_song(歌曲错误) / wrong_artist(歌手错误) / other(其他)', 'unavailable')
    if (!kind) return
    const detail = prompt('补充说明（可选）：', '') || ''
    await post('/api/report', { songId: song.id, kind, detail }).catch((e) => alert(e.message))
    alert('已提交报告，我们会尽快检查该歌曲。')
  }

  return (
    <footer className="infobar" aria-label="信息区">
      <span className="now">{song.name} - {artist}{song.album ? ` - ${song.album}` : ''}</span>
      {song.note && <span className="note-chip">{song.note}</span>}
      <span className="sep">|</span>
      <button onClick={() => void share()}>推荐给朋友</button>
      <button onClick={() => void blacklist()}>把"{artist}"加入黑名单</button>
      <span className="spacer" />
      <button onClick={() => setLyricsOpen(!lyricsOpen)}>{lyricsOpen ? '关闭歌词' : '歌词'}</button>
      <button title="卡拉OK高亮模式（轻量版）" onClick={() => setLyricsOpen(true)}>学唱</button>
      <a className="link-btn" href={`https://search.bilibili.com/all?keyword=${encodeURIComponent(`${song.name} ${artist}`)}`} target="_blank" rel="noreferrer">MV</a>
      <a className="link-btn" href={`https://music.163.com/#/search/m/?s=${encodeURIComponent(`${song.name} ${artist}`)}`} target="_blank" rel="noreferrer">下载</a>
      <button onClick={() => void report()}>报告链接错误</button>
    </footer>
  )
}
