// src/lib/api/effectiveAccess.ts
import { apiSafe } from '$lib/utils/fetch'

export type EffectiveAccess = {
  visibleMenuIds: string[]
  platformCapabilities: {
    canCreateOrganization: boolean
    canManageSettings: boolean
    canManageSubscription: boolean
  }
  orgCapabilities: {
    canManageOrganization: boolean
    canManageMembers: boolean
    canManageOrgUnits: boolean
    canManageMenuPermissions: boolean
    canManageResourcePermissions: boolean
  }
}

export type EffectiveAccessResponse = {
  code: string
  message: string
  status: boolean
  details: EffectiveAccess
}

export async function getEffectiveAccess(orgId: string) {
  return apiSafe<EffectiveAccessResponse>('/orgs/effectiveAccess', {
    headers: { 'X-Active-Org': orgId }
  })
}
