// src/lib/types/org.ts

export type OrgStatus = 'active' | 'inactive'

export interface Org {
  id: string
  name: string
  description?: string
  status: OrgStatus
  createdAt: string
  updatedAt?: string
  ingestConfig?: IngestConfig
}

export interface IngestConfig {
  ingestEndpoint: string
  signatureRequired: boolean
  ingestSecretMasked?: string
  rateLimit: {
    perSecond: number
    burst: number
  }
}

export type TargetType = 'webhook' | 'line' | 'telegram' | 'discord'

export interface DeliveryTarget {
  id: string
  orgId: string
  type: TargetType
  name: string
  enabled: boolean
  config: WebhookConfig | LineConfig | TelegramConfig | DiscordConfig
  createdAt: string
  updatedAt?: string
}

export interface WebhookConfig {
  url: string
  signingEnabled: boolean
  signingSecret?: string
  headers?: Record<string, string>
  timeoutMs?: number
}

export interface LineConfig {
  channelAccessToken?: string
  channelAccessTokenRef?: string
  to: string[]
}

export interface TelegramConfig {
  botTokenRef: string
  chatId: string
}

export interface DiscordConfig {
  webhookUrl: string
  signingEnabled?: boolean
}

export interface ApiResponse<T> {
  code: string
  message?: string
  status: boolean
  details?: T    // plural — list endpoints (r.details ?? [])
  detail?: T     // singular — single object endpoints (r.detail)
  pagination?: {
    page: number
    perPage: number
    totalRecords: number
    totalPages: number
    sortField?: string
    sortOrder?: string
  }
}

export interface PaginatedResponse<T> {
  items: T[]
  total: number
  page?: number
  perPage?: number
  totalPages?: number
}

// ────────────────────────────────────────────
// Org Members
// ────────────────────────────────────────────
export type OrgMemberRole = 'admin' | 'member'

export interface OrgMember {
  userId: string
  email?: string
  firstName?: string
  lastName?: string
  fullName?: string
  role: OrgMemberRole
  enabled?: boolean
  createdAt: string
  joinedAt?: string
}

export interface OrgInviteUser {
  userId: string
  role: OrgMemberRole
}


