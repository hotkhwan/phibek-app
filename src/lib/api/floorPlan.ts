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

export type FloorPlanCreateInput = {
  image: File
  name: string
  scaleMetersPerPx: number
  buildingName?: string
  floorLabel?: string
  description?: string
  lat?: number | null
  lng?: number | null
}

export type FloorPlanUpdateInput = {
  name?: string
  buildingName?: string
  floorLabel?: string
  description?: string
  scaleMetersPerPx?: number
  lat?: number | null
  lng?: number | null
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

export async function createFloorPlan(input: FloorPlanCreateInput) {
  const form = new FormData()
  form.append('image', input.image)
  form.append('name', input.name)
  form.append('scaleMetersPerPx', String(input.scaleMetersPerPx))
  if (input.buildingName) form.append('buildingName', input.buildingName)
  if (input.floorLabel) form.append('floorLabel', input.floorLabel)
  if (input.description) form.append('description', input.description)
  if (input.lat != null) form.append('lat', String(input.lat))
  if (input.lng != null) form.append('lng', String(input.lng))
  return apiSafe<ApiEnvelope<FloorPlanDetail>>('/floorPlans', {
    method: 'POST',
    body: form
  })
}

export async function updateFloorPlan(id: string, body: FloorPlanUpdateInput) {
  return apiSafe<ApiEnvelope<FloorPlanDetail>>(`/floorPlans/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body
  })
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
