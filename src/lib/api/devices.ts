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

export type Camera = {
  id: string
  camId?: string
  name: string
  description?: string
  url?: string
  streamUrl?: string
  mapVisibility?: 'inherit' | 'forcePublic' | 'forcePrivate' | 'public' | 'private' | string
  monitorState?: 'online' | 'offline' | 'unknown' | string
  online?: boolean
  groupId?: string
  groupName?: string
  enabled?: boolean
  externalSource?: {
    provider?: string
    sourceFamily?: string
    edgeId?: string
    gwCamId?: string
    gwDeviceMgmtId?: string
    gwWorkspaceId?: string
    gwSyncStatus?: 'synced' | 'localOnly' | 'pending' | 'failed' | 'deferred' | string
    gwSyncLastError?: string
    nameOverridden?: boolean
    locationOverridden?: boolean
    streamConfigOverridden?: boolean
    typeOverridden?: boolean
  }
  createAt?: string
  updateAt?: string
}

export type EdgeDevice = {
  id: string
  hwId?: string
  name: string
  status?: 'online' | 'offline' | 'pairing'
  refId?: string
  lastSeenAt?: string
}

export type SystemEdgeDevice = {
  id: string
  type?: 'svms' | 'ata' | 'iboc' | string
  name: string
  url?: string
  tls?: boolean
  createdAt?: string
  updatedAt?: string
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
  mapVisibility?: '' | 'inherit' | 'forcePublic' | 'forcePrivate' | 'public' | 'private'
}

export type CameraMonitorSyncResult = {
  registered: number
  skipped: number
  failed: number
}

export type CameraSyncResult = {
  id: string
  status: 'synced' | 'skipped' | 'failed'
  reason?: string
}

export async function listCameras(params: ListParams = {}) {
  return apiSafe<
    ApiEnvelope<{ items: Camera[] }> & { pagination?: Pagination }
  >('/resources/camera', { params })
}

export async function getCamera(id: string) {
  return apiSafe<ApiEnvelope<Camera>>(
    `/resources/camera/${encodeURIComponent(id)}`
  )
}

export async function deleteCamera(id: string): Promise<void> {
  await api(`/resources/camera/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

export async function syncCameraMonitor() {
  return api<ApiEnvelope<CameraMonitorSyncResult>>('/resources/camera/syncMonitor', {
    method: 'POST'
  })
}

export async function syncCamera(id: string) {
  return api<ApiEnvelope<CameraSyncResult>>(
    `/resources/camera/${encodeURIComponent(id)}/sync`,
    { method: 'POST' }
  )
}

export async function listEdgeDevices(params: ListParams = {}) {
  return apiSafe<
    ApiEnvelope<{ items: EdgeDevice[] }> & { pagination?: Pagination }
  >('/resources/edge', { params })
}

export async function listSystemEdgeDevices(params: ListParams = {}) {
  return apiSafe<
    ApiEnvelope<{ items: SystemEdgeDevice[] }> & { pagination?: Pagination }
  >('/system/edge', { params })
}

export async function listResourceGroups(params: ListParams = {}) {
  return apiSafe<
    ApiEnvelope<{ items: ResourceGroup[] }> & { pagination?: Pagination }
  >('/resources/groups', { params })
}
