// src/lib/api/klynxIngest.ts
// klynx ingest — aggregated event feed (`/kapi/events`) + ingest dashboard.
// Named `klynxIngest` to keep the gateway-portal `lib/api/ingest.ts` flavor untouched.
import { apiSafe } from '$lib/utils/fetch'

type ApiEnvelope<T> = { status?: boolean; code?: string; message?: string; details: T }
type Pagination = {
  page: number
  perPage: number
  totalRecords: number
  totalPages: number
}

export type IngestBinaryRef = {
  objectId: string
  bucket: string
  contentType?: string
  fieldName?: string
  kind?: string
  role?: string
  sourceIndex?: number
}

export type IngestPictureCoordinate = {
  width?: number
  height?: number
  x1?: number
  y1?: number
  x2?: number
  y2?: number
}

export type IngestEvent = {
  id: string
  eventId?: string
  type?: string
  eventType?: string
  eventCategory?: string
  eventAction?: string
  source?: string
  sourceFamily?: string
  deviceId?: string
  deviceName?: string
  occurredAt?: string
  severity?: string
  eventClass?: string
  location?: { lat: number; lng: number }
  payload?: Record<string, unknown> & { pictureCoordinates?: IngestPictureCoordinate[] }
  binaryRefs?: IngestBinaryRef[]
  detail?: {
    payload?: Record<string, unknown> & { pictureCoordinates?: IngestPictureCoordinate[] }
    binaryRefs?: IngestBinaryRef[]
  }
}

export type IngestAggregate = {
  aiCamerasReporting?: number
  averageAccuracy?: { value: number; samples: number }
}

export type IngestDashboard = {
  totals?: {
    events24h?: number
    eventsHour?: number
    eventsMinute?: number
    devicesReporting?: number
  }
  byType?: Array<{ key: string; value: number }>
  byDevice?: Array<{ deviceId: string; deviceName?: string; count: number }>
  rejected?: number
}

export type ListEventsParams = {
  page?: number
  perPage?: number
  from?: string
  to?: string
  type?: string
  severity?: string
  deviceId?: string
  sortOrder?: 'asc' | 'desc'
}

export async function listIngestEvents(params: ListEventsParams = {}) {
  return apiSafe<
    ApiEnvelope<{ items: IngestEvent[] }> & { pagination?: Pagination }
  >('/events', { params })
}

export async function fetchIngestDashboard(params: { from?: string; to?: string } = {}) {
  return apiSafe<ApiEnvelope<IngestDashboard>>('/events/dashboard', { params })
}

export async function fetchIngestAggregate(params: { from?: string; to?: string; bucket?: string } = {}) {
  return apiSafe<ApiEnvelope<IngestAggregate>>('/events/aggregate', { params })
}

export async function countIngestEvents(params: ListEventsParams = {}) {
  return apiSafe<ApiEnvelope<{ items: IngestEvent[] }> & { pagination?: Pagination }>(
    '/events',
    { params: { ...params, page: 1, perPage: 1 } }
  )
}

export async function countCameras(params: Record<string, unknown> = {}) {
  return apiSafe<ApiEnvelope<{ items: unknown[] }> & { pagination?: Pagination }>(
    '/resources/camera',
    { params: { ...params, page: 1, perPage: 1 } }
  )
}

export async function getIngestEventDetail(eventId: string) {
  return apiSafe<ApiEnvelope<IngestEvent & {
    payload?: Record<string, unknown> & { pictureCoordinates?: IngestPictureCoordinate[] }
    rawBody?: string
    sourceIp?: string
    lat?: number
    lng?: number
    targets?: Array<{ id: string; name?: string; status?: string; deliveredAt?: string }>
  }>>(`/events/${encodeURIComponent(eventId)}`)
}
