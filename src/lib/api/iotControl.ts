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
