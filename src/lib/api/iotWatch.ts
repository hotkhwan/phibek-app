// src/lib/api/iotWatch.ts
// klynx kwatch — watchman / watchlist integration.
// Klynx fronts an external WatchMan service (`useApiWatchMan`) using a
// separate base URL. For Phase 4 we surface a thin wrapper; the deep port
// (filters, image upload) lands in Phase 5/6.
import { api, apiSafe } from '$lib/utils/fetch'
import { env } from '$env/dynamic/public'

type ApiEnvelope<T> = { status?: boolean; code?: string; message?: string; details: T }

export type WatchmanEntry = {
  id: string
  prefix?: string
  fname?: string
  lname?: string
  nickname?: string
  age?: number
  policeStation?: string
  image?: string
}

const WATCHMAN_BASE = (env.PUBLIC_WATCHMAN_API_URL ?? '').replace(/\/+$/, '')

export async function listWatchEntries(params: { page?: number; perPage?: number; search?: string } = {}) {
  if (!WATCHMAN_BASE) {
    return {
      data: null,
      error: {
        statusCode: 0,
        message: 'PUBLIC_WATCHMAN_API_URL not configured',
        url: ''
      }
    } as const
  }
  return apiSafe<ApiEnvelope<{ items: WatchmanEntry[]; total?: number }>>(
    '/users',
    { params, baseUrl: WATCHMAN_BASE }
  )
}

export async function deleteWatchEntry(id: string): Promise<void> {
  if (!WATCHMAN_BASE) throw new Error('PUBLIC_WATCHMAN_API_URL not configured')
  await api(`/users/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    baseUrl: WATCHMAN_BASE
  })
}
