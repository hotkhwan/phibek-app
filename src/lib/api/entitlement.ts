// src/lib/api/entitlement.ts
import { PUBLIC_APP_BASE_PATH } from '$env/static/public'
import type { ApiResponse } from '$lib/types/org'
import type { RuntimeEntitlement } from '$lib/types/workspace'
import { guardAuth } from '$lib/api/authGuard'

const BASE = `${(PUBLIC_APP_BASE_PATH ?? '').replace(/\/$/, '')}/api`

async function apiFetch<T>(
  path: string,
  workspaceId: string,
  init?: RequestInit
): Promise<ApiResponse<T>> {
  const res = await fetch(`${BASE}${path}`, {
    headers: {
      'content-type': 'application/json',
      'x-active-workspace': workspaceId,
      ...init?.headers
    },
    ...init
  })
  guardAuth(res)
  const json = await res.json()
  if (!res.ok) throw json
  return json as ApiResponse<T>
}

export async function getEntitlement(workspaceId: string): Promise<RuntimeEntitlement> {
  const r = await apiFetch<RuntimeEntitlement>('/workspaces/entitlement', workspaceId)
  if (!r.details) throw new Error('entitlement not found')
  return r.details
}
