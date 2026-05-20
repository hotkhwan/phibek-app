// src/lib/client/keycloak.ts
import { browser } from '$app/environment'
import Keycloak from 'keycloak-js'
import { env } from '$env/dynamic/public'
import { auth, setIntended, type UserData } from '$lib/stores/auth'

let kc: Keycloak | null = null
let refreshTimer: ReturnType<typeof setInterval> | null = null

const BASE_PATH = normalizeBasePath(env.PUBLIC_APP_BASE_PATH)

function normalizeBasePath(value?: string) {
  if (!value || value === '/') return ''
  return `/${value.replace(/^\/+|\/+$/g, '')}`
}

function normalizeAppPath(path: string) {
  if (!path) return '/'
  if (/^https?:\/\//i.test(path)) return path
  return `/${path}`.replace(/\/+/g, '/')
}

function getRuntimeBasePath() {
  if (BASE_PATH) return BASE_PATH
  if (!browser) return ''
  const firstSegment = window.location.pathname.split('/')[1]
  const rootSegments = new Set([
    'auth',
    'landing',
    'error',
    'comingsoon',
    'dashboard',
    'docs',
    'favicon.ico',
    'robots.txt',
    '_app',
    'img',
    'js',
    'favicons'
  ])
  return firstSegment && !rootSegments.has(firstSegment) ? `/${firstSegment}` : ''
}

function absolute(path: string) {
  if (!browser) return path
  const prefix = getRuntimeBasePath()
  const p = normalizeAppPath(path)
  if (/^https?:\/\//i.test(p)) return p
  if (prefix && (p === prefix || p.startsWith(`${prefix}/`))) {
    return `${window.location.origin}${p}`
  }
  return `${window.location.origin}${prefix}${p}`
}

function withRuntimeBase(path: string) {
  const prefix = getRuntimeBasePath()
  const p = normalizeAppPath(path)
  if (/^https?:\/\//i.test(p)) return p
  if (prefix && (p === prefix || p.startsWith(`${prefix}/`))) return p
  return `${prefix}${p}` || '/'
}

function callbackPath(returnTo: string) {
  const safeReturnTo = withRuntimeBase(returnTo)
  return `/auth/callback?returnTo=${encodeURIComponent(safeReturnTo)}`
}

function parseJwtClient(token?: string): Record<string, unknown> | null {
  if (!token) return null
  const parts = token.split('.')
  if (parts.length < 2 || !parts[1]) return null
  try {
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const json = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    )
    return JSON.parse(json) as Record<string, unknown>
  } catch {
    return null
  }
}

async function setSessionCookie(token: string) {
  const prefix = getRuntimeBasePath()
  const res = await fetch(`${prefix}/auth/session`, {
    method: 'POST',
    credentials: 'include',
    headers: { Authorization: `Bearer ${token}` }
  })
  if (!res.ok) throw new Error(`session cookie set failed: ${res.status}`)
}

async function clearSessionCookie() {
  const prefix = getRuntimeBasePath()
  await fetch(`${prefix}/api/auth/logout`, {
    method: 'POST',
    credentials: 'include'
  }).catch(() => {})
}

export function getKeycloak(): Keycloak | null {
  return kc
}

export type InitOptions = {
  onLoad?: 'check-sso' | 'login-required'
  redirectPath?: string
}

export async function initKeycloak(options: InitOptions = {}): Promise<boolean> {
  if (!browser) return false
  if (kc) return !!kc.authenticated

  const url = env.PUBLIC_KC_URL
  const realm = env.PUBLIC_KC_REALM
  const clientId = env.PUBLIC_KC_CLIENT_ID

  if (!url || !realm || !clientId) {
    console.warn('[keycloak] missing PUBLIC_KC_URL/REALM/CLIENT_ID — skipping init')
    auth.setReady(true)
    return false
  }

  kc = new Keycloak({ url, realm, clientId })
  const redirectUri = absolute(options.redirectPath ?? '/auth/callback')
  const onLoad = options.onLoad ?? 'check-sso'

  try {
    const authenticated = await kc.init({
      onLoad,
      silentCheckSsoRedirectUri:
        onLoad === 'check-sso' ? absolute('/silent-check-sso.html') : undefined,
      redirectUri,
      checkLoginIframe: false,
      pkceMethod: 'S256'
    })

    if (!authenticated || !kc.token) {
      auth.setReady(true)
      return false
    }

    await onAuthenticated(kc.token, kc.refreshToken ?? '')
    startRefreshTimer()
    return true
  } catch (err) {
    console.error('[keycloak] init failed', err)
    auth.setReady(true)
    return false
  }
}

async function onAuthenticated(token: string, refreshToken: string) {
  const payload = parseJwtClient(token) ?? {}
  const sub = String(payload.sub ?? '')
  if (!sub) {
    await logout()
    return
  }

  const user: UserData = {
    id: sub,
    username: String(payload.preferred_username ?? ''),
    email: String(payload.email ?? ''),
    firstName: String(payload.given_name ?? ''),
    lastName: String(payload.family_name ?? ''),
    avatar: String(payload.avatar ?? ''),
    locale: String(payload.locale ?? 'en'),
    role: String(payload.role ?? ''),
    permissions: Array.isArray(payload.permissions)
      ? (payload.permissions as string[])
      : [],
    token,
    refreshToken,
    fullName:
      `${String(payload.given_name ?? '')} ${String(payload.family_name ?? '')}`.trim() ||
      String(payload.preferred_username ?? '') ||
      ''
  }

  auth.setUser(user)
  auth.setReady(true)

  try {
    await setSessionCookie(token)
  } catch (err) {
    console.warn('[keycloak] set session cookie failed', err)
  }
}

function startRefreshTimer() {
  if (refreshTimer) return
  refreshTimer = setInterval(async () => {
    if (!kc) return
    try {
      const refreshed = await kc.updateToken(30)
      if (!refreshed || !kc.token) return
      auth.updateUser({
        token: kc.token,
        refreshToken: kc.refreshToken ?? ''
      })
      try {
        await setSessionCookie(kc.token)
      } catch {
        await logout()
      }
    } catch {
      await logout()
    }
  }, 30_000)
}

function stopRefreshTimer() {
  if (refreshTimer) {
    clearInterval(refreshTimer)
    refreshTimer = null
  }
}

export async function login(redirectPath = '/dashboard') {
  if (!browser) return
  const returnTo = withRuntimeBase(redirectPath)
  setIntended(returnTo)
  const redirectUri = absolute(callbackPath(returnTo))
  if (!kc) {
    await initKeycloak({ onLoad: 'login-required', redirectPath: callbackPath(returnTo) })
    return
  }
  await kc.login({ redirectUri })
}

export async function logout() {
  stopRefreshTimer()
  await clearSessionCookie()
  auth.logout()
  if (kc) {
    try {
      await kc.logout({ redirectUri: absolute('/auth/login') })
    } catch (err) {
      console.warn('[keycloak] logout failed', err)
    }
    kc = null
  } else if (browser) {
    window.location.assign(absolute('/auth/login'))
  }
}
