import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { usePlayer } from './stores/playerStore'
import { useApp } from './stores/appStore'
import { controls } from './hooks/useAudioEngine'
import './styles/themes.css'
import './styles/app.css'

// 调试/自动化测试钩子
;(window as any).__1g1g = { usePlayer, useApp, controls }

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
