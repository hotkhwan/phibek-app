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
  licenseMode?: string
  customerOrgId?: string
  customerName?: string
  expiresAt?: string
  activatedAt?: string
  status?: 'unactivated' | 'active' | 'expired' | 'invalid'
  features?: string[]
  signature?: string
  artifactMeta?: Record<string, unknown> | null
  maxDevices?: number
  maxCustomers?: number
  maxOrganizations?: number
  maxLicensedUsers?: number
}

export type PlatformLicenseActivationDetails = {
  platformLicense?: PlatformLicense
  action?: string
  subscriptionRepair?: {
    status?: 'complete' | 'partial' | 'skipped' | string
    reason?: string
    counts?: Record<string, number>
    samples?: Record<string, string[]>
    generatedAt?: string
  }
} & PlatformLicense

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

// ─────────────────── Entitlement / Audit / Artifact ───────────────────

export type Entitlement = {
  features?: string[]
  limits?: Record<string, number | string>
  modules?: Record<string, unknown>
  signedAt?: string
  validUntil?: string
}

export type LicenseAuditEvent = {
  id: string
  action?: string
  actor?: string
  actorName?: string
  reason?: string
  occurredAt?: string
  diff?: Record<string, unknown>
  metadata?: Record<string, unknown>
}

export type LicenseArtifactDetails = {
  keyId?: string
  version?: string
  artifact?: Record<string, unknown>
  signature?: string
  issuedAt?: string
  reissuedAt?: string
  reasonCode?: string
}

export async function getEntitlement(licenseId: string) {
  return apiSafe<ApiEnvelope<Entitlement>>(`/admin/licenses/${encodeURIComponent(licenseId)}/entitlement`)
}

export async function getAuditLog(licenseId: string, params: { page?: number; perPage?: number } = {}) {
  return apiSafe<
    ApiEnvelope<{ items: LicenseAuditEvent[] }> & {
      pagination?: { page: number; perPage: number; totalRecords: number; totalPages: number }
    }
  >(`/admin/licenses/${encodeURIComponent(licenseId)}/audit`, { params })
}

export async function getArtifact(licenseId: string) {
  return apiSafe<ApiEnvelope<LicenseArtifactDetails>>(
    `/admin/licenses/${encodeURIComponent(licenseId)}/artifact`
  )
}

export async function issueArtifact(licenseId: string) {
  return apiSafe<ApiEnvelope<LicenseArtifactDetails>>(
    `/admin/licenses/${encodeURIComponent(licenseId)}/issue`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: {} }
  )
}

export async function reissueArtifact(licenseId: string) {
  return apiSafe<ApiEnvelope<LicenseArtifactDetails>>(
    `/admin/licenses/${encodeURIComponent(licenseId)}/reissue`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: {} }
  )
}

export async function getPlatformLicense() {
  return apiSafe<ApiEnvelope<PlatformLicense>>('/admin/platformLicense')
}

export async function activatePlatformLicense(artifact: unknown) {
  return api<ApiEnvelope<PlatformLicenseActivationDetails>>('/admin/platformLicense/activate', {
    method: 'POST',
    body: { artifact }
  })
}

export async function validatePlatformLicense(artifact: unknown) {
  return api<ApiEnvelope<{ valid?: boolean; reason?: string } | null>>(
    '/admin/platformLicense/validate',
    { method: 'POST', body: { artifact } }
  )
}
