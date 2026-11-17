// 首次访问欢迎页（原版文案）
import { useApp } from '../stores/appStore'
import { usePlayer } from '../stores/playerStore'
import { controls } from '../hooks/useAudioEngine'

export function Welcome() {
  const { setWelcome } = useApp()
  const songs = usePlayer((s) => s.songs)

  async function start() {
    setWelcome(false)
    if (!songs.length) await usePlayer.getState().reset()
    void controls.play()
  }

  return (
    <div className="welcome">
      <div className="welcome-text">
        <h1>欢迎来到亦歌！</h1>
        <p>亦歌自动为您播放好听的歌曲，并根据您的操作感知您的音乐喜好，使得播放的歌曲越来越符合您的口味。</p>
        <p>遇到您喜爱的歌曲，您可以将它们加入"收藏"，以便将来随时随地找来收听。</p>
        <p>接下来为您播放的首批歌曲，是一周以来亦歌用户收听最多的歌曲。当您一边使用电脑一边听歌时，亦歌是您的最佳伙伴！</p>
        <button className="start-btn" onClick={() => void start()}>开始亦歌之旅</button>
      </div>
    </div>
  )
}
