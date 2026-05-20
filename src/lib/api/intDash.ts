// src/lib/api/intDash.ts
// PHIBEK /intDash — consumes klynx-api event contracts without FE-side schema invention.
import { apiSafe, type ApiError } from '$lib/utils/fetch'

type ApiEnvelope<T> = { status?: boolean; code?: string; message?: string; details: T }
type Pagination = {
  page: number
  perPage: number
  totalRecords: number
  totalPages: number
}

export type IntDashSeverity = 'high' | 'medium' | 'low' | 'info' | 'none' | string

export type IntDashEventLocation = {
  lat?: number
  lng?: number
  site?: string
  zone?: string
}

export type IntDashEvent = {
  id: string
  eventId?: string
  orgId?: string
  workspaceId?: string
  eventType?: string
  eventCategory?: string
  eventAction?: string
  eventClass?: string
  severity?: IntDashSeverity
  sourceFamily?: string
  deviceId?: string
  deviceName?: string
  occurredAt?: string
  detail?: {
    location?: IntDashEventLocation
    payload?: Record<string, unknown>
    binaryRefs?: unknown[]
  }
}

export type ListIntDashEventsParams = {
  page?: number
  perPage?: number
  from?: string
  to?: string
  eventType?: string
  severity?: string
  deviceId?: string
  sortField?: string
  sortOrder?: 'asc' | 'desc'
}

export type ListIntDashEventsResponse = ApiEnvelope<{ items: IntDashEvent[] }> & {
  pagination?: Pagination
}

export type IntDashTimeline = {
  buckets: string[]
  series: Record<'high' | 'medium' | 'low' | 'info' | 'none', number[]>
}

export type IntDashAggregateDetails = {
  window?: {
    from: string
    to: string
    bucket: '1m' | '5m' | '15m' | '1h' | '1d'
  }
  scope?: {
    workspaceId?: string
    orgIdFallback?: boolean
  }
  timeline: IntDashTimeline
  topDevices: Array<{ deviceId?: string; deviceName: string; count: number }>
  categories: Array<{ name: string; count: number }>
  categoriesTotal: number
  totals: {
    events: number
    bySeverity: Record<'high' | 'medium' | 'low' | 'info' | 'none', number>
  }
}

export type IntDashAggregateParams = {
  from: string
  to?: string
  bucket?: '1m' | '5m' | '15m' | '1h' | '1d'
  topDevicesLimit?: number
  topCategoriesLimit?: number
}

export type IntDashDatasets = {
  timeline: IntDashTimeline
  topDevices: Array<{ deviceName: string; count: number }>
  cameraHealth: { online: number | null; offline: number | null }
  categories: Array<{ name: string; count: number }>
  scopeOrgFallback: boolean
  usedAggregateEndpoint: boolean
}

export function emptyIntDashTimeline(): IntDashTimeline {
  return {
    buckets: [],
    series: { high: [], medium: [], low: [], info: [], none: [] }
  }
}

export function emptyIntDashDatasets(): IntDashDatasets {
  return {
    timeline: emptyIntDashTimeline(),
    topDevices: [],
    cameraHealth: { online: null, offline: null },
    categories: [],
    scopeOrgFallback: false,
    usedAggregateEndpoint: false
  }
}

export async function listIntDashEvents(params: ListIntDashEventsParams = {}) {
  return apiSafe<ListIntDashEventsResponse>('/events', { params })
}

export async function countIntDashEvents(
  params: Omit<ListIntDashEventsParams, 'page' | 'perPage'> = {}
): Promise<{ count: number | null; error: ApiError | null }> {
  const { data, error } = await listIntDashEvents({ ...params, page: 1, perPage: 1 })
  if (error) return { count: null, error }
  return { count: data?.pagination?.totalRecords ?? 0, error: null }
}

export async function fetchIntDashAggregate(params: IntDashAggregateParams) {
  return apiSafe<ApiEnvelope<IntDashAggregateDetails>>('/events/aggregate', { params })
}

export async function countCamerasByState(monitorState: 'online' | 'offline') {
  const { data, error } = await apiSafe<ApiEnvelope<{ items: unknown[] }> & { pagination?: Pagination }>(
    '/resources/camera',
    { params: { page: 1, perPage: 1, monitorState } }
  )
  if (error) return { count: null, error }
  return { count: data?.pagination?.totalRecords ?? null, error: null }
}
