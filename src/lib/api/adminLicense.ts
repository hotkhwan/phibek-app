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

export type License = {
  id: string
  licenseId?: string
  customerOrgId?: string
  customerName?: string
  plan?: string
  seats?: number
  expiresAt?: string
  status?: 'active' | 'expired' | 'revoked'
  createdAt?: string
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

export async function listLicenses(params: { page?: number; perPage?: number; search?: string } = {}) {
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
  return api<ApiEnvelope<License>>('/admin/licenses', { method: 'POST', body })
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
