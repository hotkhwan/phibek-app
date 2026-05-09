// src/lib/stores/auth.ts
import { writable, derived, get } from 'svelte/store'
import { browser } from '$app/environment'

export type Permission = string | { resource: string; allow: string }

export type UserData = {
  id: string
  username?: string
  email?: string
  firstName?: string
  lastName?: string
  fullName?: string
  avatar?: string
  locale?: 'en' | 'th' | string
  role?: string
  permissions?: Permission[]
  token?: string
  refreshToken?: string
}

export type AuthState = {
  ready: boolean
  isAuthenticated: boolean
  user: UserData | null
}

const initialState: AuthState = {
  ready: false,
  isAuthenticated: false,
  user: null
}

const _auth = writable<AuthState>(initialState)

export const auth = {
  subscribe: _auth.subscribe,
  setReady: (ready: boolean) => _auth.update((s) => ({ ...s, ready })),
  setAuthenticated: (value: boolean) =>
    _auth.update((s) => ({ ...s, isAuthenticated: value, ready: true })),
  setUser: (user: UserData | null) =>
    _auth.update((s) => ({ ...s, user, isAuthenticated: !!user })),
  updateUser: (partial: Partial<UserData>) =>
    _auth.update((s) => ({
      ...s,
      user: s.user ? { ...s.user, ...partial } : null
    })),
  logout: () => _auth.set({ ready: true, isAuthenticated: false, user: null }),
  get: () => get(_auth)
}

export const isAuthenticated = derived(_auth, ($a) => $a.isAuthenticated)
export const currentUser = derived(_auth, ($a) => $a.user)
export const authReady = derived(_auth, ($a) => $a.ready)

export function hasRole(role: string) {
  const s = auth.get()
  return !!s.user && s.user.role === role
}

export function hasPermission(perm: Permission) {
  const s = auth.get()
  if (!s.user || !Array.isArray(s.user.permissions)) return false
  if (typeof perm === 'string') {
    return s.user.permissions.some((p) =>
      typeof p === 'string' ? p === perm : p.resource === perm
    )
  }
  return s.user.permissions.some(
    (p) =>
      typeof p === 'object' &&
      p.resource === perm.resource &&
      p.allow === perm.allow
  )
}

const STORAGE_KEY = 'auth_intended'
export function setIntended(path: string) {
  if (!browser) return
  try {
    sessionStorage.setItem(STORAGE_KEY, path)
  } catch {
    // ignore
  }
}
export function popIntended(): string | null {
  if (!browser) return null
  try {
    const v = sessionStorage.getItem(STORAGE_KEY)
    if (v) sessionStorage.removeItem(STORAGE_KEY)
    return v
  } catch {
    return null
  }
}
