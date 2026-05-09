// src/lib/api/edgeAi.ts
// klynx edge-ai — ATA / aggregated edge analytics summary.
// Backend: `/kapi/dashboard/summary` (per klynx pages/edge-ai/summary-report.vue).
import { apiSafe } from '$lib/utils/fetch'

type ApiEnvelope<T> = { status?: boolean; code?: string; message?: string; details: T }

export type EdgeAiSummary = {
  range?: { from: string; to: string }
  totals?: {
    detections?: number
    alerts?: number
    devicesActive?: number
    streamsActive?: number
  }
  byEventType?: Array<{ key: string; value: number }>
  byDevice?: Array<{ deviceId: string; deviceName?: string; count: number }>
  topEvents?: Array<{ id: string; deviceName?: string; eventType?: string; occurredAt?: string }>
}

export async function fetchEdgeAiSummary(params: { from?: string; to?: string } = {}) {
  return apiSafe<ApiEnvelope<EdgeAiSummary>>('/dashboard/summary', { params })
}
