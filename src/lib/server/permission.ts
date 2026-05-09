// src/lib/server/permission.ts
import { error } from '@sveltejs/kit'

export function requireRole(
  user: App.Locals['user'],
  role: string
) {
  if (!user || !user.roles.includes(role)) {
    throw error(403, 'Forbidden')
  }
}

export function requirePermission(
  user: App.Locals['user'],
  perm: string
) {
  if (!user || !user.permissions?.includes(perm)) {
    throw error(403, 'Forbidden')
  }
}
