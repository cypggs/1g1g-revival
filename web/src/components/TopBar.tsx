import { useApp } from '../stores/appStore'
import type { ThemeName } from '../types'

const SWATCHES: { name: ThemeName; className: string; label: string }[] = [
  { name: 'blue', className: 'swatch-blue', label: '淡蓝色' },
  { name: 'red', className: 'swatch-red', label: '红色' },
  { name: 'ocean', className: 'swatch-ocean', label: '蓝色' },
  { name: 'black', className: 'swatch-black', label: '黑色' },
  { name: 'google', className: 'swatch-google', label: 'Google 色' },
]

export function TopBar() {
  const { user, theme, setTheme, setAuthModal, logout, setSettingsOpen } = useApp()

  return (
    <header className="topbar">
      <div className="brand">
        <span className="logo-mark"><img src="/logo.png" alt="亦歌" className="logo-img" /></span>
        <span className="logo-text">亦歌</span>
        <span className="beta">Beta</span>
      </div>
      <div className="user-zone">
        {user ? (
          <>
            <span className="welcome">欢迎你! {user.name}</span>
            <button className="link" onClick={() => setSettingsOpen(true)}>设置</button>
            <button className="link" onClick={() => void logout()}>退出</button>
          </>
        ) : (
          <>
            <button className="link" onClick={() => setAuthModal('register')}>注册</button>
            <button className="link" onClick={() => setAuthModal('login')}>登录</button>
          </>
        )}
        <a className="link" href="https://github.com/cypggs/1g1g-revival" target="_blank" rel="noreferrer">GitHub</a>
        <a className="link" href="https://tieba.baidu.com/f?kw=%E4%BA%A6%E6%AD%8C" target="_blank" rel="noreferrer">亦歌吧</a>
        <button className="link" onClick={() => alert('帮助：\n\nT 热门  F 收藏  H 刚听过\nP 播放/暂停  N 下一首  M 静音\n\n双击"下一首"按钮可更换当前歌曲播放源。')}>帮助</button>
        <span className="swatches" title="配色方案">
          {SWATCHES.map((s) => (
            <button
              key={s.name}
              className={`${s.className}${theme === s.name ? ' active' : ''}`}
              title={s.label}
              onClick={() => setTheme(s.name)}
            />
          ))}
        </span>
      </div>
    </header>
  )
}
