// src/lib/types/workspace.ts

export type WorkspaceStatus = 'active' | 'inactive'

export interface Workspace {
  id: string
  name: string
  description?: string
  status: WorkspaceStatus
  createdAt: string
  updatedAt?: string
}

export type WorkspaceMemberRole = 'owner' | 'admin' | 'operator' | 'viewer'

export interface WorkspaceMember {
  userId: string
  email?: string
  firstName?: string
  lastName?: string
  fullName?: string
  role: WorkspaceMemberRole
  enabled?: boolean
  createdAt: string
  joinedAt?: string
}

export interface WorkspaceInviteUser {
  userId: string
  role: WorkspaceMemberRole
}

export interface RuntimeEntitlement {
  workspaceId: string
  planCode: string
  maxEventsPerSecond: number
  maxPayloadBytes: number
  maxAssets: number
  maxSources: number
  maxPipelines: number
  maxSites: number
  allowedSourceFamilies: string[]
  retentionDays: number
  webhookTargetsLimit: number
  eventExportEnabled: boolean
  assetTrackingEnabled: boolean
}
