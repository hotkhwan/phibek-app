// src/lib/api/org.ts
import { PUBLIC_APP_BASE_PATH } from '$env/static/public'
import type { ApiResponse, Org, IngestConfig, OrgMember, PaginatedResponse } from '$lib/types/org'
import { guardAuth } from '$lib/api/authGuard'

const BASE = `${(PUBLIC_APP_BASE_PATH ?? '/aisom').replace(/\/$/, '')}/api`

async function apiFetch<T>(
  path: string,
  init?: RequestInit,
  orgId?: string
): Promise<ApiResponse<T>> {
  const res = await fetch(`${BASE}${path}`, {
    headers: {
      'content-type': 'application/json',
      ...(orgId ? { 'x-active-workspace': orgId } : {}),
      ...init?.headers
    },
    ...init
  })
  guardAuth(res)
  const json = await res.json()
  if (!res.ok) throw json
  return json as ApiResponse<T>
}

// ────────────────────────────────────────────
// Organizations
// ────────────────────────────────────────────
export async function listOrgs(): Promise<Org[]> {
  const r = await apiFetch<any[]>('/orgs')
  const items = r.details ?? []
  const now = new Date().toISOString()
  return items.map((item: any) => ({
    id: item.orgId ?? item.id,
    name: item.name,
    description: item.description ?? '',
    status: item.status ?? 'active',
    createdAt: item.createdAt ?? now,
    updatedAt: item.updatedAt ?? now
  }))
}

export async function createOrg(body: {
  name: string
  description?: string
}): Promise<Org> {
  const r = await apiFetch<any>('/orgs', {
    method: 'POST',
    body: JSON.stringify(body)
  })
  const item = r.details ?? r
  console.log('🔍 [createOrg] response:', JSON.stringify(r))
  if (!item) throw new Error('Failed to create org: no data returned')
  const now = new Date().toISOString()
  return {
    id: item.id ?? item.orgId,
    name: item.name,
    description: item.description ?? '',
    status: item.status ?? 'active',
    createdAt: item.createdAt ?? now,
    updatedAt: item.updatedAt ?? now
  }
}

export async function getOrg(id: string): Promise<Org> {
  const r = await apiFetch<any>(`/orgs/${id}`)
  const item = r.details ?? r
  console.log('🔍 [getOrg] response:', JSON.stringify(r))
  if (!item) throw new Error('Failed to get org: no data returned')
  const now = new Date().toISOString()
  return {
    id: item.orgId ?? item.id,
    name: item.name,
    description: item.description ?? '',
    status: item.status ?? 'active',
    createdAt: item.createdAt ?? now,
    updatedAt: item.updatedAt ?? now
  }
}

export async function updateOrg(
  id: string,
  body: { name?: string; description?: string; isActive?: boolean }
): Promise<Org> {
  const r = await apiFetch<any>(`/orgs/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body)
  })
  const item = r.details ?? r
  console.log('🔍 [updateOrg] response:', JSON.stringify(r))
  if (!item) throw new Error('Failed to update org: no data returned')
  const now = new Date().toISOString()
  return {
    id: item.orgId ?? item.id,
    name: item.name,
    description: item.description ?? '',
    status: item.status ?? 'active',
    createdAt: item.createdAt ?? now,
    updatedAt: item.updatedAt ?? now
  }
}

export async function deleteOrg(id: string): Promise<void> {
  await apiFetch(`/orgs/${id}`, { method: 'DELETE' })
}

// ────────────────────────────────────────────
// Ingest Config  →  /ingest  (X-Active-Org required)
// ────────────────────────────────────────────
export async function getIngestConfig(orgId: string): Promise<IngestConfig> {
  const r = await apiFetch<IngestConfig>('/ingest', undefined, orgId)
  if (!r.details) throw new Error('ingest config not found')
  return r.details
}

export async function rotateIngestSecret(orgId: string): Promise<IngestConfig> {
  const r = await apiFetch<IngestConfig>('/ingest/rotateSecret', { method: 'POST' }, orgId)
  if (!r.detail) throw new Error('ingest config not found')
  return r.detail
}

// ────────────────────────────────────────────
// Org Members
// ────────────────────────────────────────────
export async function listOrgMembers(
  orgId: string,
  params?: {
    page?: number
    perPage?: number
    sortField?: string
    sortOrder?: 'asc' | 'desc'
    search?: string
  }
): Promise<PaginatedResponse<OrgMember>> {
  const queryParams = new URLSearchParams()
  if (params) {
    if (params.page !== undefined) queryParams.set('page', String(params.page))
    if (params.perPage !== undefined) queryParams.set('perPage', String(params.perPage))
    if (params.sortField) queryParams.set('sortField', params.sortField)
    if (params.sortOrder) queryParams.set('sortOrder', params.sortOrder)
    if (params.search) queryParams.set('search', params.search)
  }
  const queryString = queryParams.toString()
  const r = await apiFetch<any>(
    `/orgs/users/members${queryString ? '?' + queryString : ''}`,
    undefined,
    orgId
  )
  console.log('🔍 [listOrgMembers] response:', JSON.stringify(r))
  return {
    items: r.details ?? [],
    total: r.pagination?.totalRecords ?? 0,
    page: r.pagination?.page ?? 1,
    perPage: r.pagination?.perPage ?? 10,
    totalPages: r.pagination?.totalPages ?? 1
  }
}

export async function inviteOrgUsers(
  orgId: string,
  users: { userId: string; role: 'admin' | 'member' }[]
): Promise<void> {
  await apiFetch('/orgs/users/invite', { method: 'POST', body: JSON.stringify({ users }) }, orgId)
}

export async function inviteUserByEmail(
  orgId: string,
  email: string,
  role: 'admin' | 'member'
): Promise<void> {
  await apiFetch('/orgs/users/invite-by-email', {
    method: 'POST',
    body: JSON.stringify({ email, role })
  }, orgId)
}

export async function removeOrgUsers(
  orgId: string,
  users: { userId: string; role: 'admin' | 'member' }[]
): Promise<void> {
  await apiFetch('/orgs/users/remove', { method: 'PATCH', body: JSON.stringify({ users }) }, orgId)
}