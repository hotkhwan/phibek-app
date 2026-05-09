// src/lib/server/auth.ts
import { parseJwt } from './jwt'

export function userFromToken(token: string) {
  const payload = parseJwt(token)

  return {
    sub: payload.sub,
    email: payload.email,
    name: payload.name,
    roles: payload.roles ?? [],
    permissions: payload.permissions ?? [],
    platformRole: payload.role ?? undefined
  }
}
