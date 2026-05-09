// src/lib/api/ingest.ts
import { PUBLIC_APP_BASE_PATH } from '$env/static/public'
import type { ApiResponse, IngestConfig } from '$lib/types/org'
import { guardAuth } from '$lib/api/authGuard'
import type {
	MappingTemplate,
	FieldMapping,
	MatchCondition,
	TemplateDeliveryTarget,
	ClassificationRule,
	MessageTemplate,
	DLQConfig,
	PayloadCondition,
	TemplateListResponse,
	DashboardStats,
	DlqMessage,
	DlqStats,
	DlqStatus,
	DlqStage,
	SourceProfile,
	DeviceManagement,
	UnknownPayloadReview,
	RejectedPayloadPattern,
	MappingSuggestion,
	ApprovedEvent,
	ApprovedEventBinaryRef,
	PendingEvent,
	EventUpdateInput,
	BulkResult,
	DeviceImportResult
} from '$lib/types/ingest'

// Re-export types for consumers
export type {
	MappingTemplate,
	FieldMapping,
	MatchCondition,
	TemplateDeliveryTarget,
	ClassificationRule,
	MessageTemplate,
	DLQConfig,
	PayloadCondition,
	TemplateListResponse,
	DashboardStats,
	DlqMessage,
	DlqStats,
	DlqStatus,
	DlqStage,
	SourceProfile,
	DeviceManagement,
	UnknownPayloadReview,
	RejectedPayloadPattern,
	MappingSuggestion,
	ApprovedEvent,
	ApprovedEventBinaryRef,
	PendingEvent,
	EventUpdateInput,
	BulkResult,
	DeviceImportResult
}
export type { ClassificationSet } from '$lib/types/ingest'

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
// Ingest Config
// ────────────────────────────────────────────

export async function getIngestConfig(orgId: string): Promise<IngestConfig> {
	const r = await apiFetch<IngestConfig>('/ingest/', orgId)
	if (!r.details) throw new Error('ingest config not found')
	return r.details
}

export async function rotateIngestSecret(orgId: string): Promise<IngestConfig> {
	const r = await apiFetch<IngestConfig>('/ingest/rotateSecret', orgId, { method: 'POST' })
	if (!r.details) throw new Error('ingest config not found')
	return r.details
}

// ────────────────────────────────────────────
// Dashboard
// ────────────────────────────────────────────

export async function getDashboardStats(
	orgId: string,
	params?: {
		startDate?: string
		endDate?: string
		status?: 'all' | 'pending' | 'approved' | 'rejected'
		eventType?: string
	}
): Promise<DashboardStats> {
	const q = new URLSearchParams()
	if (params?.startDate && params?.endDate) {
		q.set('dateTime', `${params.startDate},${params.endDate}`)
	}
	if (params?.status) q.set('status', params.status)
	if (params?.eventType) q.set('eventType', params.eventType)
	const url = `/ingest/dashboard${q.toString() ? `?${q}` : ''}`
	const r = await apiFetch<DashboardStats>(url, orgId)
	if (!r.details) throw new Error('dashboard stats not found')
	return r.details
}

// ────────────────────────────────────────────
// Event Management (Pending Events)
// ────────────────────────────────────────────

export async function listPendingEvents(
	orgId: string,
	page = 1,
	perPage = 20,
	params?: { status?: string; eventType?: string; sortField?: string; sortOrder?: string }
): Promise<{ details: PendingEvent[]; page: number; perPage: number; total: number; totalPages: number }> {
	const q = new URLSearchParams({
		page: String(page),
		perPage: String(perPage),
		sortField: params?.sortField ?? 'createdAt',
		sortOrder: params?.sortOrder ?? 'desc'
	})
	if (params?.status && params.status !== 'all') q.set('status', params.status)
	if (params?.eventType) q.set('eventType', params.eventType)

	const res = await fetch(`${BASE}/ingest/management?${q}`, {
		headers: { 'content-type': 'application/json', 'x-active-workspace': orgId }
	})
	guardAuth(res)
	const json = await res.json() as {
		details: PendingEvent[]
		pagination: { page: number; perPage: number; totalRecords: number; totalPages: number }
	}
	if (!res.ok) throw json
	return {
		details: json.details ?? [],
		page: json.pagination?.page ?? page,
		perPage: json.pagination?.perPage ?? perPage,
		total: json.pagination?.totalRecords ?? 0,
		totalPages: json.pagination?.totalPages ?? 0
	}
}

export async function getPendingEvent(orgId: string, eventId: string): Promise<PendingEvent> {
	const r = await apiFetch<PendingEvent>(`/ingest/management/${eventId}`, orgId)
	if (!r.details) throw new Error('pending event not found')
	return r.details
}

export async function updatePendingEvent(
	orgId: string,
	eventId: string,
	data: EventUpdateInput
): Promise<void> {
	await apiFetch<unknown>(`/ingest/management/${eventId}`, orgId, {
		method: 'PATCH',
		body: JSON.stringify(data)
	})
}

export async function approveEvent(
	orgId: string,
	eventId: string,
	data?: EventUpdateInput
): Promise<void> {
	await apiFetch<unknown>(`/ingest/management/${eventId}/approve`, orgId, {
		method: 'POST',
		body: data ? JSON.stringify(data) : undefined
	})
}

export async function rejectEvent(orgId: string, eventId: string): Promise<void> {
	await apiFetch<unknown>(`/ingest/management/${eventId}/reject`, orgId, { method: 'POST' })
}

export async function deletePendingEvent(orgId: string, eventId: string): Promise<void> {
	await apiFetch<unknown>(`/ingest/management/${eventId}`, orgId, { method: 'DELETE' })
}

// ────────────────────────────────────────────
// Bulk Operations (Event Management)
// ────────────────────────────────────────────

export async function bulkApprove(orgId: string, eventIds: string[]): Promise<BulkResult> {
	const r = await apiFetch<BulkResult>('/ingest/management/bulk/approve', orgId, {
		method: 'POST',
		body: JSON.stringify({ eventIds })
	})
	if (!r.details) throw new Error('bulk approve failed')
	return r.details
}

export async function bulkReject(orgId: string, eventIds: string[]): Promise<BulkResult> {
	const r = await apiFetch<BulkResult>('/ingest/management/bulk/reject', orgId, {
		method: 'POST',
		body: JSON.stringify({ eventIds })
	})
	if (!r.details) throw new Error('bulk reject failed')
	return r.details
}

export async function bulkDelete(orgId: string, eventIds: string[]): Promise<BulkResult> {
	const r = await apiFetch<BulkResult>('/ingest/management/bulk/delete', orgId, {
		method: 'POST',
		body: JSON.stringify({ eventIds })
	})
	if (!r.details) throw new Error('bulk delete failed')
	return r.details
}

export async function bulkApplyTemplate(orgId: string, templateId: string, eventIds: string[]): Promise<BulkResult> {
	const r = await apiFetch<BulkResult>('/ingest/management/bulk/applyTemplate', orgId, {
		method: 'POST',
		body: JSON.stringify({ templateId, eventIds })
	})
	if (!r.details) throw new Error('bulk apply template failed')
	return r.details
}

// ────────────────────────────────────────────
// Mapping Templates (V3 — endpoint: /ingest/mappingTemplates)
// ────────────────────────────────────────────

export async function listTemplates(
	orgId: string,
	page = 1,
	perPage = 20,
	params?: { search?: string; sourceFamily?: string; enabled?: boolean }
): Promise<TemplateListResponse> {
	const q = new URLSearchParams({
		page: String(page),
		perPage: String(perPage),
		sortField: 'createdAt',
		sortOrder: 'desc'
	})
	if (params?.search) q.set('search', params.search)
	if (params?.sourceFamily) q.set('sourceFamily', params.sourceFamily)
	if (params?.enabled !== undefined) q.set('enabled', String(params.enabled))

	const res = await fetch(`${BASE}/ingest/mappingTemplates?${q}`, {
		headers: { 'content-type': 'application/json', 'x-active-workspace': orgId }
	})
	guardAuth(res)
	const json = await res.json() as {
		details: MappingTemplate[]
		pagination: { page: number; perPage: number; totalRecords: number; totalPages: number }
	}
	if (!res.ok) throw json
	return {
		details: json.details ?? [],
		page: json.pagination?.page ?? page,
		perPage: json.pagination?.perPage ?? perPage,
		total: json.pagination?.totalRecords ?? 0,
		totalPages: json.pagination?.totalPages ?? 0
	}
}

export async function createTemplate(
	orgId: string,
	data: {
		name: string
		enabled?: boolean
		sourceFamily?: string
		finalEventType?: string
		matchAll?: MatchCondition[]
		matchAny?: MatchCondition[]
		deliveryMatchAll?: MatchCondition[]
		deliveryMatchAny?: MatchCondition[]
		priority?: number
		mappings?: FieldMapping[]
		defaultLocale?: string
		deliveryTargets?: TemplateDeliveryTarget[]
		classificationRules?: ClassificationRule[]
		messageTemplates?: MessageTemplate[]
		dlq?: DLQConfig
	}
): Promise<MappingTemplate> {
	const r = await apiFetch<MappingTemplate>('/ingest/mappingTemplates', orgId, {
		method: 'POST',
		body: JSON.stringify(data)
	})
	if (!r.details) throw new Error('template not found in response')
	return r.details
}

export async function getTemplate(orgId: string, templateId: string): Promise<MappingTemplate> {
	const r = await apiFetch<MappingTemplate>(`/ingest/mappingTemplates/${templateId}`, orgId)
	if (!r.details) throw new Error('template not found')
	return r.details
}

export async function updateTemplate(
	orgId: string,
	templateId: string,
	data: {
		name?: string
		enabled?: boolean
		sourceFamily?: string
		finalEventType?: string
		matchAll?: MatchCondition[]
		matchAny?: MatchCondition[]
		deliveryMatchAll?: MatchCondition[]
		deliveryMatchAny?: MatchCondition[]
		priority?: number
		mappings?: FieldMapping[]
		defaultLocale?: string
		deliveryTargets?: TemplateDeliveryTarget[]
		classificationRules?: ClassificationRule[]
		messageTemplates?: MessageTemplate[]
		dlq?: DLQConfig
	}
): Promise<void> {
	await apiFetch<unknown>(`/ingest/mappingTemplates/${templateId}`, orgId, {
		method: 'PATCH',
		body: JSON.stringify(data)
	})
}

export async function deleteTemplate(orgId: string, templateId: string): Promise<void> {
	await apiFetch<unknown>(`/ingest/mappingTemplates/${templateId}`, orgId, { method: 'DELETE' })
}

// ────────────────────────────────────────────
// DLQ (Dead Letter Queue) — used by delivery/dlq pages
// ────────────────────────────────────────────

export async function listDlq(
	orgId: string,
	page = 1,
	perPage = 20,
	params?: {
		status?: DlqStatus
		stage?: DlqStage
		channel?: string
		eventId?: string
		from?: string
		to?: string
	}
): Promise<{ details: DlqMessage[]; page: number; perPage: number; total: number; totalPages: number }> {
	const q = new URLSearchParams({
		page: String(page),
		perPage: String(perPage),
		sortField: 'createdAt',
		sortOrder: 'desc'
	})
	if (params?.status) q.set('status', params.status)
	if (params?.stage) q.set('stage', params.stage)
	if (params?.channel) q.set('channel', params.channel)
	if (params?.eventId) q.set('eventId', params.eventId)
	if (params?.from) q.set('from', params.from)
	if (params?.to) q.set('to', params.to)

	const res = await fetch(`${BASE}/ingest/dlq?${q}`, {
		headers: { 'content-type': 'application/json', 'x-active-workspace': orgId }
	})
	guardAuth(res)
	const json = await res.json() as {
		details: DlqMessage[]
		pagination: { page: number; perPage: number; totalRecords: number; totalPages: number }
	}
	if (!res.ok) throw json
	return {
		details: json.details ?? [],
		page: json.pagination?.page ?? page,
		perPage: json.pagination?.perPage ?? perPage,
		total: json.pagination?.totalRecords ?? 0,
		totalPages: json.pagination?.totalPages ?? 0
	}
}

export async function getDlqStats(orgId: string): Promise<DlqStats> {
	const r = await apiFetch<DlqStats>('/ingest/dlq/stats', orgId)
	if (!r.details) throw new Error('DLQ stats not found')
	return r.details
}

export async function getDlqDetail(orgId: string, messageId: string): Promise<DlqMessage> {
	const r = await apiFetch<DlqMessage>(`/ingest/dlq/${messageId}`, orgId)
	if (!r.details) throw new Error('DLQ message not found')
	return r.details
}

export async function retryDlq(orgId: string, messageId: string): Promise<void> {
	await apiFetch<unknown>(`/ingest/dlq/${messageId}/retry`, orgId, { method: 'POST' })
}

export async function replayDlq(orgId: string, messageId: string): Promise<void> {
	await apiFetch<unknown>(`/ingest/dlq/${messageId}/replay`, orgId, { method: 'POST' })
}

export async function abandonDlq(orgId: string, messageId: string, reason?: string): Promise<void> {
	await apiFetch<unknown>(`/ingest/dlq/${messageId}/abandon`, orgId, {
		method: 'POST',
		body: JSON.stringify({ reason: reason ?? '' })
	})
}

// ────────────────────────────────────────────
// Source Profiles (global)
// ────────────────────────────────────────────

export async function listSourceProfiles(orgId: string): Promise<SourceProfile[]> {
	const r = await apiFetch<SourceProfile[]>('/ingest/sourceProfiles', orgId)
	return r.details ?? []
}

export async function getSourceProfile(orgId: string, sourceFamily: string): Promise<SourceProfile> {
	const r = await apiFetch<SourceProfile>(`/ingest/sourceProfiles/${sourceFamily}`, orgId)
	if (!r.details) throw new Error('source profile not found')
	return r.details
}

export async function createSourceProfile(
	orgId: string,
	data: { sourceFamily: string; displayName: string; mode?: string }
): Promise<SourceProfile> {
	const r = await apiFetch<SourceProfile>('/ingest/sourceProfiles', orgId, {
		method: 'POST',
		body: JSON.stringify(data)
	})
	if (!r.details) throw new Error('source profile not found in response')
	return r.details
}

export async function updateSourceProfile(
	orgId: string,
	sourceFamily: string,
	data: { displayName?: string; mode?: string }
): Promise<void> {
	await apiFetch<unknown>(`/ingest/sourceProfiles/${sourceFamily}`, orgId, {
		method: 'PATCH',
		body: JSON.stringify(data)
	})
}

// ────────────────────────────────────────────
// Device Management (org-scoped)
// ────────────────────────────────────────────

export async function listDeviceManagement(
	orgId: string,
	page = 1,
	perPage = 20,
	params?: { sourceFamily?: string }
): Promise<{ details: DeviceManagement[]; page: number; perPage: number; total: number; totalPages: number }> {
	const q = new URLSearchParams({
		page: String(page),
		perPage: String(perPage)
	})
	if (params?.sourceFamily) q.set('sourceFamily', params.sourceFamily)

	const res = await fetch(`${BASE}/ingest/deviceManagement?${q}`, {
		headers: { 'content-type': 'application/json', 'x-active-workspace': orgId }
	})
	guardAuth(res)
	const json = await res.json() as {
		details: DeviceManagement[]
		pagination: { page: number; perPage: number; totalRecords: number; totalPages: number }
	}
	if (!res.ok) throw json
	return {
		details: json.details ?? [],
		page: json.pagination?.page ?? page,
		perPage: json.pagination?.perPage ?? perPage,
		total: json.pagination?.totalRecords ?? 0,
		totalPages: json.pagination?.totalPages ?? 0
	}
}

export async function getDeviceManagement(orgId: string, id: string): Promise<DeviceManagement> {
	const r = await apiFetch<DeviceManagement>(`/ingest/deviceManagement/${id}`, orgId)
	if (!r.details) throw new Error('device management record not found')
	return r.details
}

export async function createDeviceManagement(
	orgId: string,
	data: {
		sourceFamily: string
		entityType: string
		entityId: string
		deviceId?: string
		lat?: number
		lng?: number
		site?: string
		zone?: string
	}
): Promise<DeviceManagement> {
	const r = await apiFetch<DeviceManagement>('/ingest/deviceManagement', orgId, {
		method: 'POST',
		body: JSON.stringify(data)
	})
	if (!r.details) throw new Error('device management record not found in response')
	return r.details
}

export async function updateDeviceManagement(
	orgId: string,
	id: string,
	data: {
		deviceId?: string
		lat?: number
		lng?: number
		site?: string
		zone?: string
	}
): Promise<void> {
	await apiFetch<unknown>(`/ingest/deviceManagement/${id}`, orgId, {
		method: 'PATCH',
		body: JSON.stringify(data)
	})
}

export async function deleteDeviceManagement(orgId: string, id: string): Promise<void> {
	await apiFetch<unknown>(`/ingest/deviceManagement/${id}`, orgId, { method: 'DELETE' })
}

export async function downloadDeviceTemplate(orgId: string): Promise<Blob> {
	const res = await fetch(`${BASE}/ingest/deviceManagement/template`, {
		headers: { 'x-active-workspace': orgId }
	})
	guardAuth(res)
	if (!res.ok) throw new Error('failed to download template')
	return res.blob()
}

export async function exportDevices(
	orgId: string,
	params?: { sourceFamily?: string; entityType?: string }
): Promise<Blob> {
	const q = new URLSearchParams()
	if (params?.sourceFamily) q.set('sourceFamily', params.sourceFamily)
	if (params?.entityType) q.set('entityType', params.entityType)
	const url = `/ingest/deviceManagement/export${q.toString() ? `?${q}` : ''}`
	const res = await fetch(`${BASE}${url}`, {
		headers: { 'x-active-workspace': orgId }
	})
	guardAuth(res)
	if (!res.ok) throw new Error('failed to export devices')
	return res.blob()
}

export async function importDevices(
	orgId: string,
	file: File,
	dryRun = false
): Promise<DeviceImportResult> {
	const formData = new FormData()
	formData.append('file', file)
	if (dryRun) formData.append('dryRun', 'true')
	const res = await fetch(`${BASE}/ingest/deviceManagement/import`, {
		method: 'POST',
		headers: { 'x-active-workspace': orgId },
		body: formData
	})
	guardAuth(res)
	const json = await res.json()
	if (!res.ok) throw json
	return json as DeviceImportResult
}

// ────────────────────────────────────────────
// Unknown Payload Reviews (V3)
// ────────────────────────────────────────────

export async function listUnknownPayloadReviews(
	orgId: string,
	page = 1,
	perPage = 20,
	params?: { status?: string; sourceFamily?: string; startDate?: string; endDate?: string }
): Promise<{ details: UnknownPayloadReview[]; page: number; perPage: number; total: number; totalPages: number }> {
	const q = new URLSearchParams({
		page: String(page),
		perPage: String(perPage),
		sortField: 'lastSeenAt',
		sortOrder: 'desc'
	})
	if (params?.status) q.set('status', params.status)
	if (params?.sourceFamily) q.set('sourceFamily', params.sourceFamily)
	if (params?.startDate && params?.endDate) {
		q.set('dateTime', `${params.startDate},${params.endDate}`)
	}

	const res = await fetch(`${BASE}/ingest/unknownPayloadReviews?${q}`, {
		headers: { 'content-type': 'application/json', 'x-active-workspace': orgId }
	})
	guardAuth(res)
	const json = await res.json() as {
		details: UnknownPayloadReview[]
		pagination: { page: number; perPage: number; totalRecords: number; totalPages: number }
	}
	if (!res.ok) throw json
	return {
		details: json.details ?? [],
		page: json.pagination?.page ?? page,
		perPage: json.pagination?.perPage ?? perPage,
		total: json.pagination?.totalRecords ?? 0,
		totalPages: json.pagination?.totalPages ?? 0
	}
}

export async function getUnknownPayloadReview(orgId: string, id: string): Promise<UnknownPayloadReview> {
	const r = await apiFetch<UnknownPayloadReview>(`/ingest/unknownPayloadReviews/${id}`, orgId)
	if (!r.details) throw new Error('unknown payload review not found')
	return r.details
}

export async function createTemplateFromReview(
	orgId: string,
	id: string,
	data: {
		name: string
		sourceFamily?: string
		matchAll?: MatchCondition[]
		matchAny?: MatchCondition[]
		mappings?: FieldMapping[]
		deliveryTargets?: TemplateDeliveryTarget[]
	}
): Promise<MappingTemplate> {
	const r = await apiFetch<MappingTemplate>(
		`/ingest/unknownPayloadReviews/${id}/createTemplate`,
		orgId,
		{ method: 'POST', body: JSON.stringify(data) }
	)
	if (!r.details) throw new Error('template not found in response')
	return r.details
}

export async function useSuggestion(
	orgId: string,
	id: string,
	data: { suggestionId: string; name?: string }
): Promise<MappingTemplate> {
	const r = await apiFetch<MappingTemplate>(
		`/ingest/unknownPayloadReviews/${id}/useSuggestion`,
		orgId,
		{ method: 'POST', body: JSON.stringify(data) }
	)
	if (!r.details) throw new Error('template not found in response')
	return r.details
}

export async function rejectUnknownPayload(
	orgId: string,
	id: string,
	reason?: string
): Promise<void> {
	await apiFetch<unknown>(`/ingest/unknownPayloadReviews/${id}/reject`, orgId, {
		method: 'POST',
		body: JSON.stringify({ reason: reason ?? '' })
	})
}

export async function deleteUnknownPayloadReview(orgId: string, id: string): Promise<void> {
	await apiFetch<unknown>(`/ingest/unknownPayloadReviews/${id}`, orgId, { method: 'DELETE' })
}

// ────────────────────────────────────────────
// Rejected Payload Patterns (V3)
// ────────────────────────────────────────────

export async function listRejectedPayloadPatterns(
	orgId: string,
	page = 1,
	perPage = 20,
	params?: { sourceFamily?: string }
): Promise<{ details: RejectedPayloadPattern[]; page: number; perPage: number; total: number; totalPages: number }> {
	const q = new URLSearchParams({
		page: String(page),
		perPage: String(perPage),
		sortField: 'createdAt',
		sortOrder: 'desc'
	})
	if (params?.sourceFamily) q.set('sourceFamily', params.sourceFamily)

	const res = await fetch(`${BASE}/ingest/rejectedPayloadPatterns?${q}`, {
		headers: { 'content-type': 'application/json', 'x-active-workspace': orgId }
	})
	guardAuth(res)
	const json = await res.json() as {
		details: RejectedPayloadPattern[]
		pagination: { page: number; perPage: number; totalRecords: number; totalPages: number }
	}
	if (!res.ok) throw json
	return {
		details: json.details ?? [],
		page: json.pagination?.page ?? page,
		perPage: json.pagination?.perPage ?? perPage,
		total: json.pagination?.totalRecords ?? 0,
		totalPages: json.pagination?.totalPages ?? 0
	}
}

export async function getRejectedPayloadPattern(
	orgId: string,
	id: string
): Promise<RejectedPayloadPattern> {
	const r = await apiFetch<RejectedPayloadPattern>(`/ingest/rejectedPayloadPatterns/${id}`, orgId)
	if (!r.details) throw new Error('rejected payload pattern not found')
	return r.details
}

export async function deleteRejectedPayloadPattern(orgId: string, id: string): Promise<void> {
	await apiFetch<unknown>(`/ingest/rejectedPayloadPatterns/${id}`, orgId, { method: 'DELETE' })
}

// ────────────────────────────────────────────
// Mapping Suggestions (V3 — system presets, read-only)
// ────────────────────────────────────────────

export async function listMappingSuggestions(
	orgId: string,
	page = 1,
	perPage = 20,
	params?: { sourceFamily?: string }
): Promise<{ details: MappingSuggestion[]; page: number; perPage: number; total: number; totalPages: number }> {
	const q = new URLSearchParams({
		page: String(page),
		perPage: String(perPage)
	})
	if (params?.sourceFamily) q.set('sourceFamily', params.sourceFamily)

	const res = await fetch(`${BASE}/ingest/mappingSuggestions?${q}`, {
		headers: { 'content-type': 'application/json', 'x-active-workspace': orgId }
	})
	guardAuth(res)
	const json = await res.json() as {
		details: MappingSuggestion[]
		pagination: { page: number; perPage: number; totalRecords: number; totalPages: number }
	}
	if (!res.ok) throw json
	return {
		details: json.details ?? [],
		page: json.pagination?.page ?? page,
		perPage: json.pagination?.perPage ?? perPage,
		total: json.pagination?.totalRecords ?? 0,
		totalPages: json.pagination?.totalPages ?? 0
	}
}

export async function getMappingSuggestion(orgId: string, id: string): Promise<MappingSuggestion> {
	const r = await apiFetch<MappingSuggestion>(`/ingest/mappingSuggestions/${id}`, orgId)
	if (!r.details) throw new Error('mapping suggestion not found')
	return r.details
}

// ────────────────────────────────────────────
// Event Details (canonical approved events, post-normalization)
// ────────────────────────────────────────────

export async function listApprovedEvents(
	orgId: string,
	page = 1,
	perPage = 20,
	params?: {
		eventType?: string
		sourceFamily?: string
		search?: string
		startDate?: string
		endDate?: string
	}
): Promise<{ details: ApprovedEvent[]; page: number; perPage: number; total: number; totalPages: number }> {
	const q = new URLSearchParams({
		page: String(page),
		perPage: String(perPage),
		sortField: 'createdAt',
		sortOrder: 'desc'
	})
	if (params?.eventType) q.set('eventType', params.eventType)
	if (params?.sourceFamily) q.set('sourceFamily', params.sourceFamily)
	if (params?.search) q.set('search', params.search)
	if (params?.startDate && params?.endDate) {
		q.set('dateTime', `${params.startDate},${params.endDate}`)
	}

	const res = await fetch(`${BASE}/ingest/details?${q}`, {
		headers: { 'content-type': 'application/json', 'x-active-workspace': orgId }
	})
	guardAuth(res)
	const json = await res.json() as {
		details: ApprovedEvent[]
		pagination: { page: number; perPage: number; totalRecords: number; totalPages: number }
	}
	if (!res.ok) throw json
	return {
		details: json.details ?? [],
		page: json.pagination?.page ?? page,
		perPage: json.pagination?.perPage ?? perPage,
		total: json.pagination?.totalRecords ?? 0,
		totalPages: json.pagination?.totalPages ?? 0
	}
}

export async function getApprovedEvent(orgId: string, eventId: string): Promise<ApprovedEvent> {
	const r = await apiFetch<ApprovedEvent>(`/ingest/details/${eventId}`, orgId)
	if (!r.details) throw new Error('approved event not found')
	return r.details
}

export function getImageUrl(bucket: string, objectId: string): string {
	return `${BASE}/files/${bucket}/${objectId}`
}
