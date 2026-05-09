// src/lib/types/aiMapping.ts

export interface WorkspaceAIConfig {
	workspaceId: string
	enabled: boolean
	provider: string // 'gemini' | 'openai' | 'claude'
	model: string
	providerMode: string // 'freeSharedProvider' | 'userKey'
	hasKey: boolean // true if encrypted key exists — actual key never returned
	updatedAt?: string
}

export interface SuggestFieldMapping {
	sourcePath: string
	targetPath: string
	valueCodes?: Record<string, string>
	origin: string // 'system' | 'ai' | 'merged'
}

export interface SuggestMatchRule {
	field: string
	operator: string
	value: string
	origin: string // 'system' | 'ai' | 'merged'
}

export interface AISuggestResult {
	mode: string // 'aiAssisted' | 'systemOnly' | 'aiFailedFallback'
	suggestedEventType: string
	fieldMappings: SuggestFieldMapping[]
	matchRules: SuggestMatchRule[]
	aiProvider?: string
	aiModel?: string
	fallbackReason?: string
}

export interface MissingFieldHint {
	field: string
	reason: string
	forAction: string
}

export interface ConfigDraftCondition {
	field: string
	operator: string
	value: unknown
}

export interface DryRunResult {
	matched: boolean
	webhookTargetsCount: number
	lineTargetsCount: number
	discordTargetsCount: number
	incompleteTargets: string[]
	evaluationDetails: string[]
}

export interface ConfigDraft {
	draftId: string
	workspaceId: string
	status: string // 'incomplete' | 'ready' | 'reviewed' | 'published' | 'deployed'
	sourceFamily: string
	matchConditions: ConfigDraftCondition[] | null
	missingFields: MissingFieldHint[] | null
	warnings: string[] | null
	reviewSummary: string[]
	redactedPrompt: string
	createdBy: string
	createdAt: string
	updatedAt: string
}

export interface AIValidateResult {
	ok: boolean
	latencyMs?: number
	error?: string
}
