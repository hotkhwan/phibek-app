// src/routes/(base)/auth/session/start/+server.ts
// Entry point used by hooks.server.ts when the user has no session.
// Forwards to /auth/login which handles Keycloak silent SSO + redirect.
import { redirect } from '@sveltejs/kit'
import { env } from '$env/dynamic/public'
import type { RequestHandler } from './$types'

function normalizeBasePath(value?: string) {
  if (!value || value === '/') return ''
  return `/${value.replace(/^\/+|\/+$/g, '')}`
}

const BASE = normalizeBasePath(env.PUBLIC_APP_BASE_PATH)

export const GET: RequestHandler = ({ url }) => {
  const returnTo = url.searchParams.get('returnTo') || `${BASE}/dashboard`
  throw redirect(302, `${BASE}/auth/login?returnTo=${encodeURIComponent(returnTo)}`)
}
