// src/lib/types/realtime.ts
// Wire payloads owned by klynx-api/docs/contracts/realtime-wss.md.

export type CameraStatusValue = 'online' | 'offline' | 'suspect' | 'unknown'

export type CameraStatusPayload = {
  cameraId: string
  orgId: string
  status: CameraStatusValue
  occurredAt: string
  workspaceId?: string
  name?: string
  sourceFamily?: string
  ip?: string
  changeType?: 'create' | 'update' | 'delete'
  reasonCode?: string
  prevState?: CameraStatusValue
  decisionSource?: string
}

export type WssIngestEventLocation = {
  lat: number
  lng: number
}

export type WssIngestEventPayload = {
  eventId: string
  orgId?: string
  workspaceId?: string
  deviceId?: string
  eventType?: string
  eventCategory?: string
  eventAction?: string
  sourceFamily?: string
  severity?: string
  eventClass?: string
  occurredAt?: string
  location?: WssIngestEventLocation
}

export type KControlStatusPayload = {
  deviceId: string
  hwId?: string
  orgId: string
  name?: string
  ip?: string
  status: 'online' | 'offline' | 'unknown' | 'suspect'
  prevStatus?: 'online' | 'offline' | 'unknown' | 'suspect'
  evaluatedAt: string
  inactiveForMs?: number
}

export type KControlAlarmPayload = {
  deviceId?: string
  hwId?: string
  orgId?: string
  name?: string
  alarmId: string
  alarmType?: string
  severity?: 'low' | 'medium' | 'high' | 'critical'
  occurredAt?: string
  data?: Record<string, unknown>
}

export type KControlEventPayload = {
  deviceId?: string
  hwId?: string
  orgId?: string
  eventId: string
  eventType?: string
  occurredAt?: string
  data?: Record<string, unknown>
}

export type KControlTemperaturePayload = {
  deviceId: string
  hwId?: string
  orgId: string
  temperature: number
  unit?: 'C' | string
  readingAt: string
}
