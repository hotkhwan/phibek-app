// src/lib/api/dashboard.ts
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
