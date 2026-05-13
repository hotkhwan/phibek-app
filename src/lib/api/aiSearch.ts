// src/lib/api/aiSearch.ts
// klynx ksearch — AI camera search & chat history.
// Backend endpoints stay original (`/kapi/ksearch/*`); only FE folder rebrand.
import { api, apiSafe } from '$lib/utils/fetch'

type ApiEnvelope<T> = { status?: boolean; code?: string; message?: string; details: T }

export type AiSearchChat = {
  id: string
  title?: string
  messageCount?: number
  updatedAt?: string
  createdAt?: string
  preview?: string
}

export async function listChats(params: { page?: number; perPage?: number; search?: string } = {}) {
  return apiSafe<ApiEnvelope<{ items: AiSearchChat[]; total?: number }>>(
    '/ksearch/chats',
    { params }
  )
}

export async function getChat(id: string) {
  return apiSafe<ApiEnvelope<AiSearchChat & { messages?: unknown[] }>>(
    `/ksearch/chats/${encodeURIComponent(id)}`
  )
}

export async function deleteChat(id: string): Promise<void> {
  await api(`/ksearch/chats/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

export type InvestigationRequest = {
  text: string
  page: number
  perPage: number
  sortField: string
  sortOrder: 'asc' | 'desc'
  score?: number
  include: {
    summary: boolean
    cards: boolean
    timeline: boolean
    mapPoints: boolean
    diagnostics: boolean
  }
}

export type InvestigationPagination = {
  page: number
  perPage: number
  totalRecords: number
  totalPages: number
  sortField: string
  sortOrder: 'asc' | 'desc'
}

export type InvestigationCard = {
  eventId: string
  title: string
  subtitle?: string
  class: string
  score: number
  confidenceLabel: string
  caption: string
  occurredAt?: string
  camera?: { id?: string; name?: string; zone?: string }
  location?: { label?: string; lat?: number; lng?: number; address?: string; available?: boolean; source?: string }
  media: {
    previewImagePath?: string
    previewImageUrl?: string
    playbackAvailable?: boolean
    playbackReason?: string
  }
  tags?: string[]
}

export type InvestigationDetails = {
  query?: { text?: string; language?: string; translatedToEn?: boolean; upstreamNameId?: string }
  summary: {
    headline?: string
    narrative?: string
    total?: number
    matchedEvents?: number
    byClass?: Record<string, number>
    byLocation?: Record<string, number>
    topLocations?: string[]
    timeRange?: { label?: string; from?: string; to?: string }
  }
  cards?: InvestigationCard[]
  timeline?: Array<{
    eventId: string
    occurredAt?: string
    class?: string
    title?: string
    label?: string
    camera?: { name?: string; zone?: string }
    location?: { label?: string }
  }>
  mapPoints?: Array<{ eventId: string; lat: number; lng: number; class: string; label: string; count: number; score: number }>
  diagnostics?: {
    hydration?: { requestedIds?: number; matchedIds?: number; missingIds?: string[] }
  }
}

export type InvestigationEnvelope = ApiEnvelope<InvestigationDetails> & {
  pagination?: InvestigationPagination
}

export async function searchInvestigation(body: InvestigationRequest) {
  return apiSafe<InvestigationEnvelope, InvestigationRequest>('/ksearch/investigate/search', {
    method: 'POST',
    body
  })
}
