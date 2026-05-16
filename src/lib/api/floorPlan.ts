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
  buildingName?: string
  floorLabel?: string
  description?: string
  imageUrl?: string
  scaleMetersPerPx?: number
  cameraCount?: number
  width?: number
  height?: number
  lat?: number
  lng?: number
  createdAt?: string
  updatedAt?: string
}

export type FloorPlanPlacement = {
  id: string
  cameraId?: string
  label?: string
  x: number
  y: number
  yawDeg?: number
}

export type FloorPlanDetail = FloorPlan & {
  placements?: FloorPlanPlacement[]
  markers?: FloorPlanPlacement[]
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

// ─────────────────── Placements (camera markers on canvas) ───────────────────

export type PlacementInput = {
  cameraId: string
  x: number
  y: number
  yawDeg?: number
  label?: string
}

export type PlacementUpdate = {
  x?: number
  y?: number
  yawDeg?: number
  label?: string
}

export async function listPlacements(planId: string) {
  return apiSafe<ApiEnvelope<{ items: FloorPlanPlacement[] }>>(
    `/floorPlans/${encodeURIComponent(planId)}/placements`
  )
}

export async function addPlacement(planId: string, body: PlacementInput) {
  return apiSafe<ApiEnvelope<FloorPlanPlacement>>(
    `/floorPlans/${encodeURIComponent(planId)}/placements`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body }
  )
}

export async function updatePlacement(planId: string, placementId: string, body: PlacementUpdate) {
  return apiSafe<ApiEnvelope<FloorPlanPlacement>>(
    `/floorPlans/${encodeURIComponent(planId)}/placements/${encodeURIComponent(placementId)}`,
    { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body }
  )
}

export async function removePlacement(planId: string, placementId: string) {
  await api(
    `/floorPlans/${encodeURIComponent(planId)}/placements/${encodeURIComponent(placementId)}`,
    { method: 'DELETE' }
  )
}
