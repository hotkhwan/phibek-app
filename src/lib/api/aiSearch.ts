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
