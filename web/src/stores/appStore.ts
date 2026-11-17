// 应用状态：用户 / 主题 / 浏览区 / 弹窗
import { create } from 'zustand'
import type { User, ThemeName, BrowserTab, UserSettings, BrowserResult } from '../types'
import { get, post, put } from '../services/api'

const LS_THEME = '1g1g-theme'

interface AppState {
  user: User | null
  settings: UserSettings | null
  theme: ThemeName
  browserTab: BrowserTab | null
  browserVisible: boolean
  browserResult: BrowserResult | null
  browserLoading: boolean
  searchQuery: string
  welcome: boolean
  authModal: 'login' | 'register' | null
  settingsOpen: boolean
  lyricsOpen: boolean
  commentsOpen: boolean
  init: () => Promise<void>
  setTheme: (theme: ThemeName) => void
  openBrowser: (tab: BrowserTab, result: BrowserResult | null) => void
  setBrowserResult: (result: BrowserResult) => void
  hideBrowser: () => void
  setSearchQuery: (q: string) => void
  setWelcome: (welcome: boolean) => void
  setAuthModal: (modal: 'login' | 'register' | null) => void
  setSettingsOpen: (open: boolean) => void
  setLyricsOpen: (open: boolean) => void
  setCommentsOpen: (open: boolean) => void
  login: (email: string, password: string) => Promise<void>
  register: (email: string, name: string, password: string) => Promise<void>
  logout: () => Promise<void>
  saveSettings: (patch: Partial<UserSettings>) => Promise<void>
  requireLogin: () => boolean
}

function applyTheme(theme: ThemeName) {
  document.documentElement.dataset.theme = theme
  localStorage.setItem(LS_THEME, theme)
}

export const useApp = create<AppState>((set, getState) => ({
  user: null,
  settings: null,
  theme: (localStorage.getItem(LS_THEME) as ThemeName) || 'blue',
  browserTab: null,
  browserVisible: false,
  browserResult: null,
  browserLoading: false,
  searchQuery: '',
  welcome: !localStorage.getItem('1g1g-started'),
  authModal: null,
  settingsOpen: false,
  lyricsOpen: false,
  commentsOpen: false,

  init: async () => {
    applyTheme(getState().theme)
    try {
      const data = await get<{ user: User | null; settings: UserSettings | null }>('/api/me')
      set({ user: data.user, settings: data.settings })
      if (data.settings?.theme) {
        set({ theme: data.settings.theme })
        applyTheme(data.settings.theme)
      }
    } catch { /* 未登录或网络问题，保持本地状态 */ }
  },

  setTheme: (theme) => {
    set({ theme })
    applyTheme(theme)
    const settings = getState().settings
    put('/api/settings', { theme, listLimit: settings?.listLimit ?? 30, volume: settings?.volume ?? 0.8, muted: settings?.muted ?? false }).catch(() => {})
  },

  openBrowser: (tab, result) => set({ browserTab: tab, browserVisible: true, browserResult: result }),
  setBrowserResult: (result) => set({ browserResult: result, browserLoading: false }),
  hideBrowser: () => set({ browserVisible: false }),
  setSearchQuery: (q) => set({ searchQuery: q }),
  setWelcome: (welcome) => {
    if (!welcome) localStorage.setItem('1g1g-started', '1')
    set({ welcome })
  },
  setAuthModal: (authModal) => set({ authModal }),
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
  setLyricsOpen: (lyricsOpen) => set({ lyricsOpen }),
  setCommentsOpen: (commentsOpen) => set({ commentsOpen }),

  login: async (email, password) => {
    const data = await post<{ user: User }>('/api/login', { email, password })
    set({ user: data.user, authModal: null })
  },

  register: async (email, name, password) => {
    const data = await post<{ user: User }>('/api/register', { email, name, password })
    set({ user: data.user, authModal: null })
  },

  logout: async () => {
    await post('/api/logout')
    set({ user: null })
  },

  saveSettings: async (patch) => {
    const next = { ...(getState().settings || { theme: getState().theme, listLimit: 30, volume: 0.8, muted: false }), ...patch }
    set({ settings: next })
    if (patch.theme) getState().setTheme(patch.theme)
    await put('/api/settings', { theme: next.theme, listLimit: next.listLimit, volume: next.volume, muted: next.muted }).catch(() => {})
  },

  requireLogin: () => {
    if (getState().user) return true
    set({ authModal: 'login' })
    return false
  },
}))
