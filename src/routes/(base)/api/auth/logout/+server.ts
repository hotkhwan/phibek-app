// src/routes/(base)/api/auth/logout/+server.ts
import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'

export const POST: RequestHandler = ({ cookies }) => {
  cookies.delete('session_token', { path: '/' })
  cookies.delete('session_refresh', { path: '/' })
  return json({ status: true })
}

export const DELETE = POST
