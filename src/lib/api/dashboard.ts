// src/lib/api/dashboard.ts
import { browser } from '$app/environment'
import { env } from '$env/dynamic/public'
import { get } from 'svelte/store'
import { activeWorkspaceId } from '$lib/stores/activeWorkspace'
import { auth } from '$lib/stores/auth'
import { apiSafe, type ApiError } from '$lib/utils/fetch'

type ApiEnvelope<T> = { status?: boolean; code?: string; message?: string; details: T }

export type AnalyticsScope = 'all' | 'public' | 'owner'

export type AnalyticsChartSeries = {
  name: string
  data: number[]
}

export type AnalyticsTimeseriesChart = {
  type?: string
  categories: string[]
  series: AnalyticsChartSeries[]
}

export type AnalyticsDonutChart = {
  type?: string
  labels: string[]
  series: number[]
}

export type AnalyticsBarChart = {
  type?: string
  categories: string[]
  series: AnalyticsChartSeries[]
}

export type AnalyticsGeoMapPoint = {
  lat: number
  lon: number
  count: number
  label: string
}

export type AnalyticsOverviewKpis = {
  plays: number
  uniqueSessions: number
  uniqueViewersApprox: number
  activeStreamsApprox: number
}

export type AnalyticsTopCamera = {
  streamId: string
  name: string
  plays: number
  siteName?: string
  district?: string
  location?: string
}

export type AnalyticsOverviewDetails = {
  range: { start: string; end: string; groupBy?: string; tz?: string }
  kpis: AnalyticsOverviewKpis
  charts: {
    playsSeries: AnalyticsTimeseriesChart
    activeStreamsSeries: AnalyticsTimeseriesChart
    byResourceGroupSeries: AnalyticsTimeseriesChart
    geoMap: { type?: string; points: AnalyticsGeoMapPoint[] }
  }
  breakdowns: {
    byDevice: AnalyticsBarChart
    byBrowser: AnalyticsDonutChart
    byOS: AnalyticsDonutChart
    bySource: AnalyticsBarChart
  }
  topCameras: AnalyticsTopCamera[]
}

export type OverviewQuery = {
  dateTime?: string
  tz?: string
  groupBy?: 'hour' | 'day' | 'month'
  scope?: AnalyticsScope
  ouId?: string
  resourceGroups?: string
}

export type AnalyticsOverviewResponse = ApiEnvelope<AnalyticsOverviewDetails>

export type CameraUsageItem = {
  id: string
  name: string
  location?: string
  brand?: string
  scope: 'owner' | 'public' | string
  playCount: number
  lat: number
  lng: number
  district?: string
  mapVisibility?: 'inherit' | 'forcePublic' | 'forcePrivate' | string
  lastUsedAt: string | null
  isOnline: boolean
  type?: string
  resourceGroups: string[]
}

export type CameraUsageSummary = {
  totalCameras: number
  usedCameras: number
  unusedCameras: number
  totalPlayCount: number
  filteredCameras: number
  filteredPlayCount: number
  windowFrom: string
  windowTo: string
}

export type CameraUsageQuery = {
  from: string
  to: string
  tz?: string
  scope?: AnalyticsScope
  cameraIds?: string
  q?: string
  page?: number
  perPage?: number
  sortField?: 'playCount' | 'name' | 'lastUsedAt'
  sortOrder?: 'asc' | 'desc'
}

export type CameraUsageResponse = ApiEnvelope<{
  items: CameraUsageItem[]
  summary: CameraUsageSummary
  truncated: boolean
}> & {
  pagination?: {
    page: number
    perPage: number
    totalRecords: number
    totalPages: number
    sortField?: string
    sortOrder?: 'asc' | 'desc'
  }
}

export type AnalyticsEventItem = {
  event: string
  count: number
}

export type AnalyticsEventsResponse = ApiEnvelope<{ items: AnalyticsEventItem[] }>

export async function fetchAnalyticsOverview(
  query: OverviewQuery = {}
): Promise<{
  data: AnalyticsOverviewResponse | null
  error: ApiError | null
}> {
  return apiSafe<AnalyticsOverviewResponse>('/analytics/live/overview', {
    params: query as Record<string, unknown>
  })
}

export async function fetchAnalyticsTimeseries(query: OverviewQuery = {}) {
  return apiSafe('/analytics/live/timeseries', {
    params: query as Record<string, unknown>
  })
}

export async function fetchAnalyticsEvents(
  query: OverviewQuery = {}
): Promise<{
  data: AnalyticsEventsResponse | null
  error: ApiError | null
}> {
  return apiSafe<AnalyticsEventsResponse>('/analytics/live/events', {
    params: query as Record<string, unknown>
  })
}

export async function fetchCameraUsage(query: CameraUsageQuery): Promise<{
  data: CameraUsageResponse | null
  error: ApiError | null
}> {
  return apiSafe<CameraUsageResponse>('/admin/analytics/cameraUsage', {
    params: query as Record<string, unknown>
  })
}

function apiBase() {
  return (env.PUBLIC_API_BASE_URL ?? '').replace(/\/+$/, '')
}

function buildAdminAnalyticsUrl(path: string, params: Record<string, unknown>) {
  const url = new URL(`${apiBase()}/${path.replace(/^\//, '')}`)
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue
    url.searchParams.set(key, String(value))
  }
  return url.toString()
}

export async function downloadCameraUsageExport(
  query: CameraUsageQuery & { format: 'xlsx' | 'csv' }
) {
  if (!browser) return
  const token = auth.get().user?.token
  const activeOrg = get(activeWorkspaceId)
  const url = buildAdminAnalyticsUrl('/admin/analytics/cameraUsage/export', query)
  const res = await fetch(url, {
    headers: {
      Accept: query.format === 'csv' ? 'text/csv' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(activeOrg ? { 'X-Active-Org': activeOrg } : {})
    },
    credentials: 'include'
  })

  if (!res.ok) {
    const payload = await res.json().catch(() => undefined) as { message?: string } | undefined
    throw <ApiError>{
      statusCode: res.status,
      statusMessage: res.statusText,
      message: payload?.message || res.statusText || 'Export failed',
      data: payload,
      url
    }
  }

  const blob = await res.blob()
  const disposition = res.headers.get('content-disposition') ?? ''
  const filenameMatch = /filename="?([^";]+)"?/i.exec(disposition)
  const filename = filenameMatch?.[1] ?? `cameraUsage.${query.format}`
  const objectUrl = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = objectUrl
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(objectUrl)
}
