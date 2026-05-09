// src/lib/api/target.ts
import { PUBLIC_APP_BASE_PATH } from '$env/static/public'
import type { ApiResponse, DeliveryTarget } from '$lib/types/org'
import { guardAuth } from '$lib/api/authGuard'

const BASE = `${(PUBLIC_APP_BASE_PATH ?? '/aisom').replace(/\/$/, '')}/api`

async function apiFetch<T>(
  path: string,
  orgId: string,
  init?: RequestInit
): Promise<ApiResponse<T>> {
  const res = await fetch(`${BASE}${path}`, {
    headers: {
      'content-type': 'application/json',
      'x-active-workspace': orgId,
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
// Delivery Targets  →  /targets  (X-Active-Org required)
// ────────────────────────────────────────────
export async function listTargets(orgId: string): Promise<DeliveryTarget[]> {
  const r = await apiFetch<DeliveryTarget[]>('/targets', orgId)
  return r.details ?? []                          // array → details
}

export async function createTarget(
  orgId: string,
  body: Omit<DeliveryTarget, 'id' | 'orgId' | 'createdAt' | 'updatedAt'>
): Promise<DeliveryTarget> {
  const r = await apiFetch<DeliveryTarget>('/targets', orgId, {
    method: 'POST',
    body: JSON.stringify(body)
  })
  if (!r.details) throw new Error('created target not returned')
  return r.details
}

export async function getTarget(orgId: string, targetId: string): Promise<DeliveryTarget> {
  const r = await apiFetch<DeliveryTarget>(`/targets/${targetId}`, orgId)
  if (!r.details) throw new Error('target not found')
  return r.details
}

export async function updateTarget(
  orgId: string,
  targetId: string,
  body: Partial<Omit<DeliveryTarget, 'id' | 'orgId' | 'createdAt' | 'updatedAt'>>
): Promise<DeliveryTarget> {
  const r = await apiFetch<DeliveryTarget>(`/targets/${targetId}`, orgId, {
    method: 'PATCH',
    body: JSON.stringify(body)
  })
  if (!r.details) throw new Error('updated target not returned')
  return r.details
}

export async function deleteTarget(orgId: string, targetId: string): Promise<void> {
  await apiFetch<void>(`/targets/${targetId}`, orgId, { method: 'DELETE' })
}

// Backend returns 409 with this shape when the target is still assigned to
// one or more mapping templates. The proxy layer throws the full response
// body as-is, so the catch-handler checks `code === 'TARGET_IN_USE'`.
export interface TargetInUseTemplateRef {
  templateId: string
  name: string
}

export interface TargetInUseError {
  code: 'TARGET_IN_USE'
  message?: string
  status: false
  details?: { templates?: TargetInUseTemplateRef[] }
}

export function isTargetInUseError(e: unknown): e is TargetInUseError {
  return typeof e === 'object' && e !== null && (e as { code?: string }).code === 'TARGET_IN_USE'
}