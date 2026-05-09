// src/lib/api/floorPlan.ts
// klynx floor plans — `/kapi/floorPlans/*` digital-twin layouts with cameras.
import { api, apiSafe } from '$lib/utils/fetch'

type ApiEnvelope<T> = { status?: boolean; code?: string; message?: string; details: T }
type Pagination = {
  page: number
  perPage: number
  totalRecords: number
  totalPages: number
}

export type FloorPlan = {
  id: string
  name: string
  description?: string
  imageUrl?: string
  cameraCount?: number
  width?: number
  height?: number
  createdAt?: string
  updatedAt?: string
}

export type FloorPlanDetail = FloorPlan & {
  markers?: Array<{
    id: string
    cameraId?: string
    label?: string
    x: number
    y: number
  }>
}

export async function listFloorPlans(params: { page?: number; perPage?: number; search?: string } = {}) {
  return apiSafe<
    ApiEnvelope<{ items: FloorPlan[] }> & { pagination?: Pagination }
  >('/floorPlans', { params })
}

export async function getFloorPlan(id: string) {
  return apiSafe<ApiEnvelope<FloorPlanDetail>>(
    `/floorPlans/${encodeURIComponent(id)}`
  )
}

export async function deleteFloorPlan(id: string): Promise<void> {
  await api(`/floorPlans/${encodeURIComponent(id)}`, { method: 'DELETE' })
}
