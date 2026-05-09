// src/lib/types/ingest.ts

// ────────────────────────────────────────────
// Field Mapping
// ────────────────────────────────────────────

export interface FieldMapping {
	sourcePath: string
	targetPath: string
	required: boolean
	confidence?: number
	transform?: string
}

// ────────────────────────────────────────────
// V2 Match Condition
// ────────────────────────────────────────────

export interface MatchCondition {
	field: string
	operator: 'eq' | 'in' | 'contains' | 'prefix'
	values: string[]
}

// ────────────────────────────────────────────
// Payload / Classification
// ────────────────────────────────────────────

export interface PayloadCondition {
	field: string
	operator: 'eq' | 'in'
	values: string[]
}

export interface ClassificationSet {
	eventClass?: string
	eventSeverity?: string
}

export interface ClassificationRule {
	name: string
	when: PayloadCondition[]
	set: ClassificationSet
	order?: number
}

// ────────────────────────────────────────────
// Delivery / Message / DLQ
// ────────────────────────────────────────────

export interface TemplateDeliveryTarget {
	targetId: string
	filter?: PayloadCondition[]
	eventClasses?: string[]
	eventSeverities?: string[]
	messageTemplateKey?: string
}

export interface MessageTemplate {
	key?: string
	channelType: string
	locale: string
	title: string
	body: string
	extras?: Record<string, string>
}

export interface DLQConfig {
	enabled: boolean
	maxRetries: number
	retryTimeoutSeconds: number
}

// ────────────────────────────────────────────
// Mapping Template (V3)
// ────────────────────────────────────────────

export interface MappingTemplate {
	templateId: string
	orgId?: string
	name: string
	enabled?: boolean
	sourceFamily?: string
	finalEventType?: string
	// Normalization selector — evaluated at ingest time against raw payload
	// to decide which template applies for normalization.
	matchAll?: MatchCondition[]
	matchAny?: MatchCondition[]
	// Delivery filter — evaluated at delivery-dispatch time against the
	// normalized event to decide whether to send to this template's targets.
	// raw.* fields are not allowed here (backend rejects with 400).
	deliveryMatchAll?: MatchCondition[]
	deliveryMatchAny?: MatchCondition[]
	priority?: number
	mappings: FieldMapping[]
	defaultLocale?: string
	deliveryTargets?: TemplateDeliveryTarget[]
	classificationRules?: ClassificationRule[]
	messageTemplates?: MessageTemplate[]
	dlq?: DLQConfig
	createdAt: string
	updatedAt: string
	createdBy?: string
}

// ────────────────────────────────────────────
// Pending Event (Event Management)
// ────────────────────────────────────────────

export interface PendingEvent {
	id: string
	eventId: string
	tenantId: string
	orgId: string
	name?: string
	description?: string
	lat?: number
	lng?: number
	eventType?: string
	priority?: 'low' | 'medium' | 'high'
	tags?: string[]
	status: string
	statusName?: string
	rawBody?: Record<string, unknown>
	contentType?: string
	sourceIp?: string
	fingerprint?: string
	suggestedType?: string
	createdAt: string
	updatedAt: string
	approvedBy?: string
	approvedAt?: string
}

export interface EventUpdateInput {
	name?: string
	description?: string
	lat?: number
	lng?: number
	eventType?: string
	priority?: 'low' | 'medium' | 'high'
	tags?: string[]
}

// ────────────────────────────────────────────
// Bulk Operations
// ────────────────────────────────────────────

export interface BulkResult {
	succeeded: string[]
	failed: Array<{ id: string; reason: string }>
}

// ────────────────────────────────────────────
// Device Import Result
// ────────────────────────────────────────────

export interface DeviceImportResult {
	inserted: number
	updated: number
	skipped: number
	ids: string[]
	errors: string[]
}

// ────────────────────────────────────────────
// Approved Event (canonical, post-normalization)
// ────────────────────────────────────────────

export interface ApprovedEventBinaryRef {
	objectId: string
	bucket: string
	contentType: string
	fieldName?: string
	kind: string
	role: string
	sourceIndex: number
}

export interface ApprovedEvent {
	id: string
	eventId: string
	tenantId: string
	eventType: string
	source: {
		deviceId: string
		deviceType: string
		deviceName?: string
		workspaceId: string
	}
	location: {
		lat: number
		lng: number
		zone: string
	}
	geo?: {
		countryCode: string
		adminLevel: number
		adminName: string
		adminCode: string
		idScheme: string
	}
	geoCell?: {
		scheme: string
		precision: number
		cell: string
	}
	payload?: Record<string, unknown>
	binaryRefs?: ApprovedEventBinaryRef[]
	meta?: {
		schemaVersion: string
		traceId: string
		templateId: string
		normalizedAt: string
	}
	occurredAt: string
	createdAt: string
	updatedAt: string
	workspaceId: string
	name?: string
	lat: number
	lng: number
}

// ────────────────────────────────────────────
// List Response
// ────────────────────────────────────────────

export interface TemplateListResponse {
	details: MappingTemplate[]
	page: number
	perPage: number
	total: number
	totalPages: number
}

// ────────────────────────────────────────────
// Dashboard
// ────────────────────────────────────────────

export interface DashboardStats {
	pendingEvents: number
	approvedEvents: number
	rejectedEvents: number
	totalEvents: number
	byEventType?: Record<string, number>
	byAdminArea1?: Record<string, number>
	byGeoCell?: Array<{ cell: string; count: number; lat: number; lng: number }>
	recentEvents?: Array<{
		id: string
		eventId: string
		name: string
		eventType: string
		status: string
		createdAt: string
		sourceIp?: string
		lat?: number
		lng?: number
	}>
}

// ────────────────────────────────────────────
// DLQ (Dead Letter Queue) — used by delivery/dlq pages
// ────────────────────────────────────────────

export type DlqStatus = 'pending' | 'retrying' | 'resolved' | 'abandoned'
export type DlqStage = 'deliver' | 'normalize'

export interface DlqMessage {
	messageId: string
	eventId: string
	tenantId: string
	orgId: string
	templateId: string
	topic: string
	stage: DlqStage
	reason: string
	payload: Record<string, unknown>
	retryCount: number
	maxRetries: number
	retryTimeoutSeconds: number
	status: DlqStatus
	lastErrorAt: string
	createdAt: string
	updatedAt: string
}

export interface DlqStats {
	pending: number
	retrying: number
	resolved: number
	abandoned: number
	total: number
}

// ────────────────────────────────────────────
// V3 Source Profile
// ────────────────────────────────────────────

export interface SourceProfile {
	sourceFamily: string
	displayName: string
	mode?: 'active' | 'comingSoon' | 'mock' | 'disabled'
	enabled?: boolean
	description?: string
	// Legacy V2 fields kept for backward compat
	multiRef?: boolean
	refRules?: {
		primaryRefFields?: string[]
		secondaryRefFields?: string[]
		siteFields?: string[]
	}
	suggestedMatchFields?: string[]
	createdAt: string
	updatedAt: string
}

// ────────────────────────────────────────────
// V3 Device Management
// ────────────────────────────────────────────

export interface DeviceManagement {
	deviceMgmtId: string
	tenantId: string
	orgId: string
	sourceFamily: string
	entityType: 'channel' | 'device' | 'sourceSerial'
	entityId: string
	deviceId?: string
	lat?: number
	lng?: number
	site?: string
	zone?: string
	createdAt: string
	updatedAt: string
}

// ────────────────────────────────────────────
// V3 Unknown Payload Review
// ────────────────────────────────────────────

export interface UnknownPayloadReview {
	reviewId: string
	orgId: string
	sourceFamily: string
	fingerprint: string
	seenCount: number
	firstSeenAt: string
	lastSeenAt: string
	samplePayload: Record<string, unknown>
	candidateSuggestionIds: string[]
	status: 'pending' | 'rejected'
	createdAt: string
	updatedAt: string
}

// ────────────────────────────────────────────
// V3 Rejected Payload Pattern
// ────────────────────────────────────────────

export interface RejectedPayloadPattern {
	patternId: string
	orgId: string
	sourceFamily: string
	fingerprint: string
	reason: string
	createdBy: string
	createdAt: string
}

// ────────────────────────────────────────────
// V3 Mapping Suggestion (system preset, read-only)
// ────────────────────────────────────────────

export interface MappingSuggestion {
	id: string
	displayName: string
	sourceFamily: string
	matchAll?: MatchCondition[]
	matchAny?: MatchCondition[]
	fieldMappings?: FieldMapping[]
	samplePayload?: Record<string, unknown>
	createdAt: string
	updatedAt: string
}
