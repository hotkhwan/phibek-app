// src/lib/api/subscription.ts
import { PUBLIC_APP_BASE_PATH } from '$env/static/public'
import { guardAuth } from '$lib/api/authGuard'

const BASE = `${(PUBLIC_APP_BASE_PATH ?? '/aisom').replace(/\/$/, '')}/api`

// ────────────────────────────────────────────
// Localised text helper
// ────────────────────────────────────────────
export type LocalisedText = { en: string; th: string }

// ────────────────────────────────────────────
// Types (matching actual backend responses)
// ────────────────────────────────────────────
export type PlanId = 'freemium' | 'pro' | 'enterprise'
export type BillingCycle = 'none' | 'monthly' | 'yearly'

export interface PackagePlan {
	id: string
	code: string
	name: LocalisedText
	description: LocalisedText
	status: string
	sortOrder: number
	isPublic: boolean
	billing: {
		supportedCycles: BillingCycle[]
		price: {
			monthly: number
			yearly: number
			currency: string
			display: LocalisedText
		}
	}
	limits: {
		orgCacheTtlSec: number
		maxPayloadBytes: number
		perOrgPerSec: number
		perOrgBurst: number
		perIpPerMin: number
		storageQuotaBytes: number
		maxOrganizationsPerTenant: number
		eventsPerMonth: number
		teamMembers: number
		webhooksPerOrg: number
		lineTargetsPerOrg: number
		discordTargetsPerOrg: number
		telegramTargetsPerOrg: number
		messageChannelsPerOrg: number
	}
	features: Record<string, boolean>
	ui: {
		badge: LocalisedText
		highlight: boolean
		theme: string
		featureList: Array<{
			key: string
			label: LocalisedText
		}>
	}
	createdAt: string
	updatedAt: string
}

/** Limits nested object from /subscriptions/current */
export interface SubscriptionLimits {
	orgCacheTtlSec: number
	maxPayloadBytes: number
	perOrgPerSec: number
	perOrgBurst: number
	perIpPerMin: number
	storageQuotaBytes: number
	maxOrganizationsPerTenant: number
	eventsPerMonth: number
	teamMembers: number
	webhooksPerOrg: number
	lineTargetsPerOrg: number
	discordTargetsPerOrg: number
	telegramTargetsPerOrg: number
	messageChannelsPerOrg: number
}

/** Response from GET /subscriptions/current */
export interface CurrentSubscriptionDetails {
	tenantId: string
	planId: string
	status: 'active' | 'inactive' | 'pending' | 'cancelled'
	billingCycle: BillingCycle
	limits: SubscriptionLimits
	features: Record<string, boolean>
}

// ────────────────────────────────────────────
// API Functions
// ────────────────────────────────────────────

export async function listPackages(): Promise<PackagePlan[]> {
	const res = await fetch(`${BASE}/subscriptions/packages`, {
		headers: { 'content-type': 'application/json' }
	})
	guardAuth(res)
	const json = await res.json()
	if (!res.ok) throw json
	return json.details ?? []
}

export async function getCurrentSubscription(): Promise<CurrentSubscriptionDetails> {
	const res = await fetch(`${BASE}/subscriptions/current`, {
		headers: { 'content-type': 'application/json' }
	})
	guardAuth(res)
	const json = await res.json()
	if (!res.ok) throw json
	const result = json.details
	if (!result) throw new Error('Current subscription not found')
	return result as CurrentSubscriptionDetails
}

export async function changePlan(
	planId: PlanId,
	billingCycle: BillingCycle
): Promise<CurrentSubscriptionDetails> {
	const res = await fetch(`${BASE}/subscriptions/plan`, {
		method: 'PATCH',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ planId, billingCycle })
	})
	guardAuth(res)
	const json = await res.json()
	if (!res.ok) throw json
	return json.details as CurrentSubscriptionDetails
}

export async function bootstrapSubscription(): Promise<CurrentSubscriptionDetails> {
	const res = await fetch(`${BASE}/subscriptions/bootstrap`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' }
	})
	guardAuth(res)
	const json = await res.json()
	if (!res.ok) throw json
	return json.details as CurrentSubscriptionDetails
}

export async function activateEnterprise(licenseKey: string): Promise<CurrentSubscriptionDetails> {
	const res = await fetch(`${BASE}/subscriptions/enterprise/activate`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ licenseKey })
	})
	guardAuth(res)
	const json = await res.json()
	if (!res.ok) throw json
	return json.details as CurrentSubscriptionDetails
}
