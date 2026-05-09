// src/lib/api/aiMapping.ts
import { PUBLIC_APP_BASE_PATH } from '$env/static/public'
import { guardAuth } from '$lib/api/authGuard'
import type {
	WorkspaceAIConfig,
	AISuggestResult,
	ConfigDraft,
	DryRunResult,
	AIValidateResult
} from '$lib/types/aiMapping'
import type { ApiResponse } from '$lib/types/org'

const BASE = `${(PUBLIC_APP_BASE_PATH ?? '/aisom').replace(/\/$/, '')}/api`

async function apiFetch<T>(path: string, orgId: string, init?: RequestInit): Promise<ApiResponse<T>> {
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
// AI Config
// ────────────────────────────────────────────

export async function getAIConfig(orgId: string): Promise<WorkspaceAIConfig | null> {
	try {
		const r = await apiFetch<WorkspaceAIConfig>('/ingest/ai-config', orgId)
		return r.details ?? null
	} catch {
		return null
	}
}

export async function upsertAIConfig(
	orgId: string,
	body: { provider: string; model: string; apiKey?: string; enabled: boolean }
): Promise<WorkspaceAIConfig> {
	const r = await apiFetch<WorkspaceAIConfig>('/ingest/ai-config', orgId, {
		method: 'PUT',
		body: JSON.stringify(body)
	})
	return r.details!
}

export async function clearAIApiKey(orgId: string): Promise<void> {
	await apiFetch<unknown>('/ingest/ai-config/key', orgId, { method: 'DELETE' })
}

export async function validateAIConfig(orgId: string): Promise<AIValidateResult> {
	// Backend returns { status: "ok"|"fail", error?: string, validatedAt: string }
	const r = await apiFetch<{ status: string; error?: string; validatedAt?: string }>(
		'/ingest/ai-config/validate',
		orgId,
		{ method: 'POST' }
	)
	const raw = r.details
	return {
		ok: raw?.status === 'ok',
		error: raw?.error
	}
}

// ────────────────────────────────────────────
// AI Suggest
// ────────────────────────────────────────────

export async function aiSuggest(
	orgId: string,
	body: { sourceFamily: string; samplePayload?: string; templateId?: string }
): Promise<AISuggestResult> {
	const r = await apiFetch<AISuggestResult>('/ingest/mappingTemplates/ai-suggest', orgId, {
		method: 'POST',
		body: JSON.stringify(body)
	})
	return r.details!
}

// ────────────────────────────────────────────
// Config Drafts
// ────────────────────────────────────────────

export async function createDraftFromPrompt(
	orgId: string,
	body: { prompt: string }
): Promise<ConfigDraft> {
	const r = await apiFetch<ConfigDraft>('/ingest/config-drafts/from-prompt', orgId, {
		method: 'POST',
		body: JSON.stringify(body)
	})
	return r.details!
}

export async function refineDraft(
	orgId: string,
	draftId: string,
	answers: Record<string, string>
): Promise<ConfigDraft> {
	const r = await apiFetch<ConfigDraft>(`/ingest/config-drafts/${draftId}/refine`, orgId, {
		method: 'POST',
		body: JSON.stringify({ answers })
	})
	return r.details!
}

export async function dryRunDraft(
	orgId: string,
	draftId: string,
	samplePayload: Record<string, unknown>
): Promise<DryRunResult> {
	const r = await apiFetch<DryRunResult>(`/ingest/config-drafts/${draftId}/dry-run`, orgId, {
		method: 'POST',
		body: JSON.stringify({ samplePayload })
	})
	return r.details!
}

export async function saveDraft(orgId: string, draftId: string): Promise<ConfigDraft> {
	const r = await apiFetch<ConfigDraft>(`/ingest/config-drafts/${draftId}/save`, orgId, {
		method: 'POST'
	})
	return r.details!
}
