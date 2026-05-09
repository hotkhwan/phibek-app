// src/lib/api/police.ts
// klynx police domain — kwatch-backed watchlist alarms (`/kapi/kwatch/watchlist`)
// rendered in the police-mode dashboard.
import { api, apiSafe } from '$lib/utils/fetch'

type ApiEnvelope<T> = { status?: boolean; code?: string; message?: string; details: T }
type Pagination = {
  page: number
  perPage: number
  totalRecords: number
  totalPages: number
}

export type WatchlistItem = {
  id: string
  prefix?: string
  fname?: string
  lname?: string
  nickname?: string
  age?: number
  policeStation?: string
  image?: string
  status?: 'active' | 'inactive'
  createdAt?: string
}

export type ListWatchlistParams = {
  page?: number
  perPage?: number
  search?: string
  station?: string
  status?: 'active' | 'inactive'
}

export async function listWatchlist(params: ListWatchlistParams = {}) {
  return apiSafe<
    ApiEnvelope<{ items: WatchlistItem[] }> & { pagination?: Pagination }
  >('/kwatch/watchlist', { params })
}

export async function getWatchlistItem(id: string) {
  return apiSafe<ApiEnvelope<WatchlistItem>>(
    `/kwatch/watchlist/${encodeURIComponent(id)}`
  )
}

export async function deleteWatchlistItem(id: string): Promise<void> {
  await api(`/kwatch/watchlist/${encodeURIComponent(id)}`, { method: 'DELETE' })
}
