// src/lib/api/user.ts
import { PUBLIC_APP_BASE_PATH } from '$env/static/public'
import type { PaginatedResponse, User } from '$lib/types/user'
import { guardAuth } from '$lib/api/authGuard'

const BASE = `${(PUBLIC_APP_BASE_PATH ?? '/aisom').replace(/\/$/, '')}/api`

async function apiFetch(path: string, init?: RequestInit): Promise<any> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'content-type': 'application/json', ...init?.headers },
    ...init
  })
  guardAuth(res)
  const json = await res.json()
  if (!res.ok) throw json
  return json
}

// ────────────────────────────────────────────
// Types
// ────────────────────────────────────────────

export interface UserProfile {
  id: string
  email?: string
  firstName?: string
  lastName?: string
  role?: string
  avatar?: string
  locale?: string
  mapLocation?: { lat: string | number; lng: string | number }
  zoomLevel?: number
  perPage?: number
  enabled: boolean
  createdAt: string
}

export interface UpdateUserPayload {
  firstName?: string
  lastName?: string
  email?: string
  role?: string
  avatar?: string
  locale?: string
  mapLocation?: { lat: string; lng: string }
  zoomLevel?: number
  perPage?: number
}

export interface UpdatePasswordPayload {
  password: string
  temporary: boolean
}

// Introspect response shape (JWT claims)
interface IntrospectResponse {
  sub: string
  preferred_username?: string
  email?: string
  given_name?: string
  family_name?: string
  name?: string
  role?: string
  avatar?: string
  locale?: string
  mapLocation?: { lat: string | number; lng: string | number }
  zoomLevel?: number
  perPage?: number
  [key: string]: unknown
}

// ────────────────────────────────────────────
// Users (admin list)
// ────────────────────────────────────────────

export async function listUsers(params?: {
  page?: number
  perPage?: number
  sortOrder?: 'asc' | 'desc'
  search?: string
}): Promise<PaginatedResponse<User>> {
  const q = new URLSearchParams()
  if (params?.page !== undefined) q.set('page', String(params.page))
  if (params?.perPage !== undefined) q.set('perPage', String(params.perPage))
  if (params?.sortOrder) q.set('sortOrder', params.sortOrder)
  if (params?.search) q.set('search', params.search)

  const r = await apiFetch(`/users${q.toString() ? '?' + q.toString() : ''}`)

  return {
    items: r.details ?? [],
    total: r.pagination?.totalRecords ?? 0,
    page: r.pagination?.page ?? 1,
    limit: r.pagination?.perPage ?? 10
  }
}

// ────────────────────────────────────────────
// Profile (current user via introspect)
// ────────────────────────────────────────────

export async function introspectUser(): Promise<UserProfile> {
  const r: IntrospectResponse = await apiFetch('/auth/introspect')
  return {
    id: r.sub,
    email: r.email,
    firstName: r.given_name ?? r.name?.split(' ')[0],
    lastName: r.family_name ?? r.name?.split(' ').slice(1).join(' '),
    role: r.role,
    avatar: r.avatar,
    locale: r.locale,
    mapLocation: r.mapLocation,
    zoomLevel: r.zoomLevel,
    perPage: r.perPage,
    enabled: true,
    createdAt: ''
  }
}

export async function updateUser(userId: string, data: UpdateUserPayload): Promise<void> {
  await apiFetch(`/users/${userId}`, {
    method: 'PATCH',
    body: JSON.stringify(data)
  })
}

export async function uploadAvatar(userId: string, file: File): Promise<string> {
  const form = new FormData()
  form.append('avatar', file)
  const res = await fetch(`${BASE}/users/${userId}`, {
    method: 'PATCH',
    body: form
  })
  guardAuth(res)
  const json = await res.json()
  if (!res.ok) throw json
  return (json.details ?? json)?.avatar ?? ''
}

export async function updateUserPassword(userId: string, data: UpdatePasswordPayload): Promise<void> {
  await apiFetch(`/users/${userId}/password`, {
    method: 'PATCH',
    body: JSON.stringify(data)
  })
}
