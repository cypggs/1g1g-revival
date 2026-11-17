// 统一类型定义
export interface Song {
  id: string
  name: string
  artists: string[]
  artistIds?: (number | null)[]
  album: string
  albumId?: number | null
  coverUrl?: string
  duration: number // 秒
  note?: string
  isFavorite?: boolean
  playable?: boolean
  playabilityStatus?: 'available' | 'vip_required' | 'copyright_restricted' | 'unavailable' | 'expired' | 'unknown'
  locked?: boolean // 仅本地
  reason?: string // 手气不错推荐解释
}

export type PlayMode = 'all' | 'locked' | 'single'

export type ThemeName = 'blue' | 'red' | 'ocean' | 'black' | 'google'

export interface User {
  id: number
  email: string
  name: string
}

export interface UserSettings {
  theme: ThemeName
  listLimit: number
  volume: number
  muted: boolean
}

export type BrowserTab = 'hot' | 'favorites' | 'history' | 'lucky' | 'search'

export interface BrowserResult {
  title: string
  songs: Song[]
  total?: number
  page?: number
  pages?: number
  reasons?: Record<string, string>
}
