// 登录/注册弹窗（原版：未登录点击收藏时弹出）
import { useState } from 'react'
import { useApp } from '../stores/appStore'

export function AuthModal() {
  const { authModal, setAuthModal, login, register } = useApp()
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  if (!authModal) return null
  const isLogin = authModal === 'login'

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      if (isLogin) await login(email, password)
      else await register(email, name, password)
    } catch (err) {
      setError(err instanceof Error ? err.message : '操作失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-mask" onClick={() => setAuthModal(null)}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span>{isLogin ? '登录亦歌' : '注册亦歌'}</span>
          <button className="close" onClick={() => setAuthModal(null)}>✕</button>
        </div>
        <form className="modal-body" onSubmit={submit}>
          {!isLogin && (
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="昵称" required />
          )}
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="用户名/邮箱" required />
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="密码" required minLength={6} />
          {isLogin && <div className="hint">登录亦歌，收藏列表会保存到网络，在电脑或其它手机上都可以保持同步。</div>}
          {error && <div className="error-text">{error}</div>}
        </form>
        <div className="modal-actions">
          <button className="ghost-btn" onClick={() => setAuthModal(null)}>取消</button>
          <button className="primary-btn" disabled={busy} onClick={() => void submit({ preventDefault() {} } as React.FormEvent)}>
            {busy ? '请稍候…' : isLogin ? '登录' : '注册新账号'}
          </button>
        </div>
        <div className="auth-switch">
          {isLogin ? '还没有账号？' : '已有账号？'}
          <button onClick={() => { setError(''); setAuthModal(isLogin ? 'register' : 'login') }}>
            {isLogin ? '注册新账号' : '直接登录'}
          </button>
        </div>
      </div>
    </div>
  )
}
