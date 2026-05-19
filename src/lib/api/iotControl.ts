// src/lib/api/iotControl.ts
// klynx kcontrol — sensor / alarm / SOP control plane.
// Backend endpoints stay original (`/kapi/kcontrol/*`, `/kapi/resources/kcontrol/*`).
import { api, apiSafe } from '$lib/utils/fetch'

type ApiEnvelope<T> = { status?: boolean; code?: string; message?: string; details: T }

export type IotControlOverview = {
  totalDevices?: number
  online?: number
  offline?: number
  warning?: number
  alarms24h?: number
  pending?: number
}

export type IotControlAlarm = {
  id: string
  deviceId?: string
  deviceName?: string
  severity?: 'info' | 'warning' | 'critical'
  status?: 'pending' | 'ack' | 'resolved'
  message?: string
  occurredAt?: string
}

export type IotControlEvent = {
  id: string
  deviceId?: string
  type?: string
  payload?: Record<string, unknown>
  occurredAt?: string
}

export type IotControlLog = {
  id: string
  level?: 'info' | 'warn' | 'error'
  source?: string
  message?: string
  occurredAt?: string
}

export type IotControlResource = {
  id: string
  name: string
  type?: string
  enabled?: boolean
  online?: boolean
  lastSeenAt?: string
}

export type KControlConfigSource = 'org' | 'default'

export type KControlConfig = {
  tempThresholdC: number
  historySampleEveryN: number
  historyTtlDays: number
  source: {
    tempThresholdC: KControlConfigSource
    historySampleEveryN: KControlConfigSource
    historyTtlDays: KControlConfigSource
  }
}

export type KControlConfigPatch = {
  tempThresholdC?: number | null
  historySampleEveryN?: number | null
}

export type TemperatureSummaryItem = {
  deviceId: string
  hwId: string
  name: string
  current: number | null
  avg: number | null
  max: number | null
  p95: number | null
  sampleCount: number
  countAboveThreshold: number
  lastRecordedAt: string | null
}

export type TemperatureOrgRollup = {
  totalDevices: number
  devicesAboveThreshold: number
  totalSamples: number
  totalCountAboveThreshold: number
}

export type TemperatureHistoryItem = {
  recordedAt: string
  tempC: number
}

export type TemperatureSummaryDetails = {
  items: TemperatureSummaryItem[]
  orgRollup: TemperatureOrgRollup
  threshold: number
}

export type TemperatureHistoryDetails = {
  items: TemperatureHistoryItem[]
  totalRecords?: number
}

export async function fetchOverview() {
  return apiSafe<ApiEnvelope<IotControlOverview>>('/kcontrol/dashboard')
}

export async function listResources(params: { page?: number; perPage?: number; search?: string } = {}) {
  return apiSafe<ApiEnvelope<{ items: IotControlResource[]; total?: number }>>(
    '/resources/kcontrol/',
    { params }
  )
}

export async function listEvents(params: { page?: number; perPage?: number; from?: string; to?: string } = {}) {
  return apiSafe<ApiEnvelope<{ items: IotControlEvent[]; total?: number }>>(
    '/kcontrol/events',
    { params }
  )
}

export async function listLogs(params: { page?: number; perPage?: number; level?: string } = {}) {
  return apiSafe<ApiEnvelope<{ items: IotControlLog[]; total?: number }>>(
    '/kcontrol/logs',
    { params }
  )
}

export async function ackAlarm(alarmId: string, note?: string): Promise<void> {
  await api(`/kcontrol/alarms/${encodeURIComponent(alarmId)}/ack`, {
    method: 'POST',
    body: note ? { note } : {}
  })
}

export async function resolveAlarm(alarmId: string, note?: string): Promise<void> {
  await api(`/kcontrol/alarms/${encodeURIComponent(alarmId)}/resolve`, {
    method: 'POST',
    body: note ? { note } : {}
  })
}

export async function getKControlConfig() {
  return apiSafe<ApiEnvelope<KControlConfig>>('/orgs/kcontrol-config')
}

export async function patchKControlConfig(body: KControlConfigPatch) {
  return apiSafe<ApiEnvelope<KControlConfig>, KControlConfigPatch>(
    '/orgs/kcontrol-config',
    { method: 'PATCH', body }
  )
}

export async function getTemperatureSummary(params: {
  from?: string
  to?: string
  page?: number
  perPage?: number
  sortField?: 'name' | 'current' | 'avg' | 'max' | 'p95' | 'countAboveThreshold'
  sortOrder?: 'asc' | 'desc'
} = {}) {
  return apiSafe<ApiEnvelope<TemperatureSummaryDetails>>(
    '/resources/kcontrol/temperature/summary',
    { params }
  )
}

export async function getTemperatureHistory(
  id: string,
  params: {
    from?: string
    to?: string
    limit?: number
    sortOrder?: 'asc' | 'desc'
  } = {}
) {
  return apiSafe<ApiEnvelope<TemperatureHistoryDetails>>(
    `/resources/kcontrol/${encodeURIComponent(id)}/temperature/history`,
    { params }
  )
}
