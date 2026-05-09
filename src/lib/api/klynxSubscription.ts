// src/lib/api/klynxSubscription.ts
// klynx subscription / billing — `/kapi/subscriptions/*` + `/kapi/billing/*`.
// Named `klynxSubscription` to keep the gateway-portal `lib/api/subscription.ts` flavor untouched.
import { api, apiSafe } from '$lib/utils/fetch'

type ApiEnvelope<T> = { status?: boolean; code?: string; message?: string; details: T }

export type SubscriptionPlan = {
  code: string
  name: string
  description?: string
  priceMonthly?: number
  priceYearly?: number
  currency?: string
  features?: string[]
  recommended?: boolean
}

export type CurrentSubscription = {
  planCode: string
  planName?: string
  status?: 'active' | 'trial' | 'past_due' | 'canceled'
  currentPeriodEnd?: string
  billingCycle?: 'monthly' | 'yearly'
  usage?: {
    eventsPerSec?: number
    cameras?: number
    storageGb?: number
  }
  limits?: {
    eventsPerSec?: number
    cameras?: number
    storageGb?: number
  }
}

export async function listPackages() {
  return apiSafe<ApiEnvelope<{ items: SubscriptionPlan[] }>>(
    '/public/subscriptions/packages',
    { skipAuth: true }
  )
}

export async function getCurrentSubscription() {
  return apiSafe<ApiEnvelope<CurrentSubscription>>('/subscriptions/current')
}

export async function startCheckout(body: {
  planCode: string
  cycle: 'monthly' | 'yearly'
}) {
  return api<ApiEnvelope<{ checkoutUrl: string; sessionId: string }>>(
    '/billing/checkoutSession',
    { method: 'POST', body }
  )
}

export async function verifyCheckout(sessionId: string) {
  return apiSafe<ApiEnvelope<CurrentSubscription>>('/billing/verifyCheckout', {
    params: { sessionId }
  })
}
