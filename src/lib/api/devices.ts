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
  online?: boolean
  groupId?: string
  groupName?: string
  enabled?: boolean
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

export async function listEdgeDevices(params: ListParams = {}) {
  return apiSafe<
    ApiEnvelope<{ items: EdgeDevice[] }> & { pagination?: Pagination }
  >('/resources/edge', { params })
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
