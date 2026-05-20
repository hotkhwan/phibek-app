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
  wssFlvUrl?: string | null
  mapVisibility?: 'inherit' | 'forcePublic' | 'forcePrivate' | 'public' | 'private' | string
  monitorState?: MonitorState | string
  online?: boolean
  groupId?: string
  groupName?: string
  enabled?: boolean
  brand?: string
  district?: string
  status?: boolean | string
  alarm?: boolean
  ataWsFlvUrl?: string | null
  isOwner?: boolean
  isOwener?: boolean
  user?: string
  lat?: number
  lng?: number
  angle?: string
  monitorReasonCode?: string
  lastProbeAt?: string
  offlineDescription?: string
  location?: string
  dateTimeCreate?: string
  dateTimeUpdate?: string
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

export type MonitorState = 'online' | 'offline' | 'suspect' | 'unknown'

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
  mapVisibility?: 'public' | 'internal' | 'inherit' | 'forcePublic' | 'forcePrivate'
  description?: string
  offlineDescription?: string
}

export type EdgeDevice = {
  id: string
  hwId?: string
  name: string
  type?: EdgeDeviceType | string
  username?: string
  url?: string
  tls?: boolean
  status?: 'online' | 'offline' | 'pairing' | 'connected' | 'disconnected' | string
  refId?: string
  lastSeenAt?: string
}

export type EdgeDeviceType = 'svms' | 'ata' | 'iboc'

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

export type SystemEdgeDevice = {
  id: string
  type?: 'svms' | 'ata' | 'iboc' | string
  name: string
  url?: string
  tls?: boolean
  createdAt?: string
  updatedAt?: string
}

export type ResourceGroupResourceType = 'camera' | 'kcontrol' | 'edge'

export type ResourceGroupIcon = {
  online?: string | null
  offline?: string | null
}

export type ResourceGroup = {
  id: string
  name: string
  parentId?: string
  parentGroupId?: string | null
  isRoot?: boolean
  description?: string
  resourceType?: ResourceGroupResourceType | string
  mapVisibility?: 'public' | 'private' | string
  filterVisibility?: 'public' | 'internal' | string
  includeFilterChildren?: boolean
  icon?: ResourceGroupIcon
  resourceCount?: number
  cameraCount?: number
  children?: ResourceGroup[]
  createAt?: string
  updateAt?: string
}

export type ResourceGroupInput = {
  name: string
  description?: string
  resourceType: ResourceGroupResourceType
  mapVisibility?: 'public' | 'private'
  filterVisibility?: 'public' | 'internal'
  includeFilterChildren?: boolean
  icon?: ResourceGroupIcon
  parentGroupId?: string | null
}

export type ListParams = {
  page?: number
  perPage?: number
  sortField?: string
  sortOrder?: 'asc' | 'desc'
  search?: string
  groupId?: string
  mapVisibility?: '' | 'inherit' | 'forcePublic' | 'forcePrivate' | 'public' | 'private'
  monitorState?: MonitorState | 'all'
  status?: string
  q?: string
  type?: EdgeDeviceType | 'all'
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

export type CameraGwSyncStatus = {
  items?: Camera[]
  summary?: {
    total?: number
    localOnly?: number
    pending?: number
    failed?: number
    deferred?: number
  }
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

export async function getCameraGwSyncStatus(params: { orgId?: string } = {}) {
  return apiSafe<ApiEnvelope<CameraGwSyncStatus | Camera[]>>('/admin/system/gwSyncStatus', {
    params
  })
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

export async function getResourceGroupTree() {
  // klynx-api 4.25.8+ — returns the entire org's RG forest with `children` already nested.
  return apiSafe<ApiEnvelope<{ items: ResourceGroup[] } | ResourceGroup[]>>(
    '/resources/groups',
    { params: { tree: 'true' } }
  )
}

export async function getResourceGroup(id: string) {
  return apiSafe<ApiEnvelope<ResourceGroup>>(
    `/resources/groups/${encodeURIComponent(id)}`
  )
}

export async function createResourceGroup(body: ResourceGroupInput) {
  return apiSafe<ApiEnvelope<ResourceGroup>>('/resources/groups', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body
  })
}

export async function updateResourceGroup(id: string, body: Partial<ResourceGroupInput>) {
  return apiSafe<ApiEnvelope<ResourceGroup>>(`/resources/groups/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body
  })
}

export async function deleteResourceGroup(id: string): Promise<void> {
  await api(`/resources/groups/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

export async function listResourceGroupMembers(id: string, resType: 'cameras' | 'kcontrols' | 'edges' = 'cameras') {
  return apiSafe<ApiEnvelope<{ items: Array<{ id: string; name?: string }> }>>(
    `/resources/groups/${encodeURIComponent(id)}/${resType}`
  )
}

export async function addResourceGroupMembers(id: string, resType: 'cameras' | 'kcontrols' | 'edges', ids: string[]) {
  return apiSafe<ApiEnvelope<unknown>>(`/resources/groups/${encodeURIComponent(id)}/${resType}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: { [resType]: ids }
  })
}

export async function removeResourceGroupMembers(id: string, resType: 'cameras' | 'kcontrols' | 'edges', ids: string[]) {
  return apiSafe<ApiEnvelope<unknown>>(`/resources/groups/${encodeURIComponent(id)}/${resType}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: { [resType]: ids }
  })
}
