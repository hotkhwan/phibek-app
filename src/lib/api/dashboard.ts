// src/lib/api/dashboard.ts
import { api, apiSafe, type ApiError } from '$lib/utils/fetch'

type ApiEnvelope<T> = { status?: boolean; code?: string; message?: string; details: T }

export type AnalyticsScope = 'all' | 'public' | 'owner'

export type AnalyticsOverviewKpis = {
  plays: number
  sessions: number
  sessionsUnique: number
  viewers: number
  streams: number
}

export type AnalyticsOverviewResponse = ApiEnvelope<{
  range: { from: string; to: string }
  kpis: AnalyticsOverviewKpis
  topCameras?: Array<{
    rank: number
    cameraId: string
    cameraName: string
    plays: number
    site?: string
    district?: string
  }>
  byEventType?: Array<{ key: string; value: number }>
  bySource?: Array<{ key: string; value: number }>
}>

export type OverviewQuery = {
  from?: string
  to?: string
  scope?: AnalyticsScope
  ouId?: string
  resourceGroupId?: string
}

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
