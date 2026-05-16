// src/lib/api/devices.ts
// klynx /kapi/resources/* — cameras, edge devices, resource groups.
import { api, apiSafe } from '$lib/utils/fetch'

type ApiEnvelope<T> = { status?: boolean; code?: string; message?: string; details: T }
type Pagination = {
  page: number
  perPage: number
  totalRecords: number
  totalPages: number
  sortField?: string
  sortOrder?: 'asc' | 'desc'
}

export type MonitorState = 'online' | 'offline' | 'suspect' | 'unknown'

export type Camera = {
  id: string
  camId?: string
  name: string
  description?: string
  url?: string
  online?: boolean
  groupId?: string
  groupName?: string
  enabled?: boolean
  brand?: string
  district?: string
  user?: string
  password?: string
  lat?: number
  lng?: number
  angle?: string
  mapVisibility?: 'public' | 'internal'
  monitorState?: MonitorState | string
  monitorReasonCode?: string
  lastProbeAt?: string
  offlineDescription?: string
  status?: boolean
  state?: boolean | string
  location?: string
  dateTimeCreate?: string
  dateTimeUpdate?: string
  createAt?: string
  updateAt?: string
  relations?: string[]
}

export type CameraInput = {
  name?: string
  url?: string
  lat?: number
  lng?: number
  brand?: string
  district?: string
  user?: string
  password?: string
  angle?: string
  mapVisibility?: 'public' | 'internal'
  description?: string
  offlineDescription?: string
}

export type EdgeDeviceType = 'svms' | 'ata' | 'iboc'

export type EdgeDevice = {
  id: string
  type?: EdgeDeviceType | string
  name: string
  username?: string
  url?: string
  tls?: boolean
  status?: 'online' | 'offline' | 'pairing' | 'connected' | 'disconnected' | string
  lastSeenAt?: string
  createAt?: string
  updateAt?: string
}

export type EdgeDeviceInput = {
  type?: EdgeDeviceType
  name?: string
  username?: string
  password?: string
  url?: string
  tls?: boolean
  apiKey?: string
  apiSecret?: string
}

export type ResourceGroup = {
  id: string
  name: string
  parentId?: string
  description?: string
  resourceCount?: number
}

export type ListParams = {
  page?: number
  perPage?: number
  sortField?: string
  sortOrder?: 'asc' | 'desc'
  search?: string
  groupId?: string
  monitorState?: MonitorState | 'all'
  status?: string
}

export async function listCameras(params: ListParams = {}) {
  const { monitorState, ...rest } = params
  const wireParams: Record<string, unknown> = { ...rest }
  if (monitorState && monitorState !== 'all') wireParams.monitorState = monitorState
  return apiSafe<
    ApiEnvelope<{ items: Camera[] }> & { pagination?: Pagination }
  >('/resources/camera', { params: wireParams })
}

export async function getCamera(id: string) {
  return apiSafe<ApiEnvelope<Camera>>(
    `/resources/camera/${encodeURIComponent(id)}`
  )
}

export async function createCamera(body: CameraInput) {
  return apiSafe<ApiEnvelope<Camera>>('/resources/camera', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body
  })
}

export async function updateCamera(id: string, body: CameraInput) {
  return apiSafe<ApiEnvelope<Camera>>(`/resources/camera/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body
  })
}

export async function deleteCamera(id: string): Promise<void> {
  await api(`/resources/camera/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

export async function syncCameraMonitor() {
  return apiSafe<ApiEnvelope<{ registered: number; skipped: number; failed: number }>>(
    '/resources/camera/syncMonitor',
    { method: 'POST' }
  )
}

export type EdgeListParams = {
  page?: number
  perPage?: number
  q?: string
  type?: EdgeDeviceType | 'all'
}

export async function listEdgeDevices(params: EdgeListParams = {}) {
  const { type, ...rest } = params
  const wireParams: Record<string, unknown> = { ...rest }
  if (type && type !== 'all') wireParams.type = type
  return apiSafe<
    ApiEnvelope<{ items: EdgeDevice[] }> & { pagination?: Pagination }
  >('/system/edge', { params: wireParams })
}

export async function getEdgeDevice(id: string) {
  return apiSafe<ApiEnvelope<EdgeDevice>>(
    `/system/edge/${encodeURIComponent(id)}`
  )
}

export async function createEdgeDevice(body: EdgeDeviceInput) {
  return apiSafe<ApiEnvelope<EdgeDevice>>('/system/edge', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body
  })
}

export async function updateEdgeDevice(id: string, body: EdgeDeviceInput) {
  return apiSafe<ApiEnvelope<EdgeDevice>>(`/system/edge/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body
  })
}

export async function deleteEdgeDevice(id: string): Promise<void> {
  await api(`/system/edge/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

export async function listResourceGroups(params: ListParams = {}) {
  return apiSafe<
    ApiEnvelope<{ items: ResourceGroup[] }> & { pagination?: Pagination }
  >('/resources/groups', { params })
}
