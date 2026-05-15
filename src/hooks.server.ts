// src/hooks.server.ts
import type { Handle, HandleServerError } from '@sveltejs/kit'
import { redirect } from '@sveltejs/kit'
import { userFromToken } from '$lib/server/auth'

const BASE_PATH = normalizeBasePath(process.env.PUBLIC_APP_BASE_PATH)

function normalizeBasePath(v?: string) {
  if (!v || v === '/') return ''
  return '/' + v.replace(/^\/+|\/+$/g, '')
}

function stripBase(pathname: string, basePath: string) {
  if (!basePath) return pathname
  if (pathname === basePath) return '/'
  if (pathname.startsWith(basePath + '/')) {
    return pathname.slice(basePath.length)
  }
  return pathname
}

const publicExact = new Set([
  '/',
  '/landing',
  '/landing/landing',
  '/robots.txt',
  '/favicon.ico',
  '/documentation',
  '/error',
  '/comingsoon',
  '/silent-check-sso.html'
])

const publicPrefixes = [
  '/auth',
  '/api',
  '/_app',
  '/changelog',
  '/docs',
  '/img',
  '/js',
  '/favicons'
]

function isPublicPath(p: string) {
  if (publicExact.has(p)) return true
  return publicPrefixes.some(prefix => p.startsWith(prefix))
}

export const handle: Handle = async ({ event, resolve }) => {
  const pathname = event.url.pathname
  const pathnameNoBase = stripBase(pathname, BASE_PATH)

  // 🔍 Debug: log every request to detect loops
  console.log(`[hooks] ${event.request.method} ${pathname} → stripped: ${pathnameNoBase} | BASE_PATH="${BASE_PATH}" | hasToken=${!!event.cookies.get('session_token')}`)

  // ⛔ auth routes ห้ามโดน redirect ซ้ำ
  if (pathnameNoBase.startsWith('/auth')) {
    return resolve(event)
  }

  event.locals.user = null

  const token = event.cookies.get('session_token')
  if (token) {
    try {
      const user = userFromToken(token)
      event.locals.user = { ...user, accessToken: token }
    } catch {
      event.cookies.delete('session_token', { path: '/' })
      event.cookies.delete('session_refresh', { path: '/' })
    }
  }

  if (!event.locals.user && !isPublicPath(pathnameNoBase)) {
    const returnTo = `${pathname}${event.url.search}`
    throw redirect(
      302,
      `${BASE_PATH}/auth/session/start?returnTo=${encodeURIComponent(returnTo)}`
    )
  }

  return resolve(event)
}

export const handleError: HandleServerError = ({ error, event }) => {
  console.error('--- SERVER ERROR ---')
  console.error('URL:', event.url.pathname)
  console.error('Message:', (error as Error)?.message)
  console.error('Stack:', (error as Error)?.stack)

  return {
    message: 'Internal Server Error',
    code: 'INTERNAL_ERROR'
  }
}
