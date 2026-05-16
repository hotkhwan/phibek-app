// src/lib/api/adminLicense.ts
// klynx admin license management — `/kapi/admin/licenses` (issuer flow)
// + `/kapi/admin/platformLicense` (platform license activation).
import { api, apiSafe } from '$lib/utils/fetch'

type ApiEnvelope<T> = { status?: boolean; code?: string; message?: string; details: T }
type Pagination = {
  page: number
  perPage: number
  totalRecords: number
  totalPages: number
}

export type LicenseStatus = 'active' | 'suspended' | 'terminated' | 'expired' | 'revoked' | string

export type License = {
  id: string
  licenseId?: string
  customerOrgId?: string
  customerName?: string
  plan?: string
  seats?: number
  expiresAt?: string
  status?: LicenseStatus
  createdAt?: string
  updatedAt?: string
  deploymentType?: string
  deliveryMode?: string
}

export type PlatformLicense = {
  licenseKey?: string
  edition?: string
  customerOrgId?: string
  customerName?: string
  expiresAt?: string
  activatedAt?: string
  status?: 'unactivated' | 'active' | 'expired' | 'invalid'
  features?: string[]
  signature?: string
}

export async function listLicenses(params: { page?: number; perPage?: number; search?: string; status?: LicenseStatus } = {}) {
  return apiSafe<
    ApiEnvelope<{ items: License[] }> & { pagination?: Pagination }
  >('/admin/licenses', { params })
}

export async function getLicense(licenseId: string) {
  return apiSafe<ApiEnvelope<License>>(
    `/admin/licenses/${encodeURIComponent(licenseId)}`
  )
}

export async function createLicense(body: {
  customerOrgId: string
  plan: string
  seats: number
  expiresAt: string
}) {
  return apiSafe<ApiEnvelope<License>>('/admin/licenses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body
  })
}

export async function updateLicense(licenseId: string, body: Partial<{
  plan: string
  seats: number
  expiresAt: string
}>) {
  return apiSafe<ApiEnvelope<License>>(`/admin/licenses/${encodeURIComponent(licenseId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body
  })
}

export async function renewLicense(licenseId: string, body: { expiresAt: string; reason?: string }) {
  return apiSafe<ApiEnvelope<License>>(`/admin/licenses/${encodeURIComponent(licenseId)}/renew`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body
  })
}

export async function activateLicense(licenseId: string, body: { reason?: string } = {}) {
  return apiSafe<ApiEnvelope<License>>(`/admin/licenses/${encodeURIComponent(licenseId)}/activate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body
  })
}

export async function suspendLicense(licenseId: string, body: { reason?: string } = {}) {
  return apiSafe<ApiEnvelope<License>>(`/admin/licenses/${encodeURIComponent(licenseId)}/suspend`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body
  })
}

export async function terminateLicense(licenseId: string, body: { reason?: string } = {}) {
  return apiSafe<ApiEnvelope<License>>(`/admin/licenses/${encodeURIComponent(licenseId)}/terminate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body
  })
}

export async function getPlatformLicense() {
  return apiSafe<ApiEnvelope<PlatformLicense>>('/admin/platformLicense')
}

export async function activatePlatformLicense(licenseKey: string) {
  return api<ApiEnvelope<PlatformLicense>>('/admin/platformLicense/activate', {
    method: 'POST',
    body: { licenseKey }
  })
}

export async function validatePlatformLicense(licenseKey: string) {
  return api<ApiEnvelope<{ valid: boolean; reason?: string }>>(
    '/admin/platformLicense/validate',
    { method: 'POST', body: { licenseKey } }
  )
}
