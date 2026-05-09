// src/routes/(base)/auth/session/+server.ts
// Set httpOnly session cookie from Bearer token returned by Keycloak.
// Mirrors klynx /auth/session POST contract.
import { json, error } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { userFromToken } from '$lib/server/auth'

const COOKIE_NAME = 'session_token'
const COOKIE_PATH = '/'
const MAX_AGE = 60 * 60 * 8 // 8h

export const POST: RequestHandler = async ({ request, cookies, url }) => {
  const auth = request.headers.get('authorization') ?? ''
  if (!auth.startsWith('Bearer ')) {
    throw error(401, 'missing bearer token')
  }
  const token = auth.slice('Bearer '.length).trim()
  if (!token) {
    throw error(401, 'empty token')
  }

  // Validate the token shape — userFromToken throws on invalid JWT
  try {
    userFromToken(token)
  } catch (err) {
    console.warn('[auth/session] token rejected:', (err as Error)?.message)
    throw error(401, 'invalid token')
  }

  cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: url.protocol === 'https:',
    sameSite: 'lax',
    path: COOKIE_PATH,
    maxAge: MAX_AGE
  })

  return json({ status: true, cookie: COOKIE_NAME })
}
