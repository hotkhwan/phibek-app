import type { EffectiveAccess } from '$lib/api/effectiveAccess'
import type { UserData } from '$lib/stores/auth'

type PageAccessRule = {
  path: string
  exact?: boolean
  menuIds?: string[]
  authOnly?: boolean
  allowWithoutOrg?: boolean
  requireOrgManage?: boolean
  requirePlatformSettings?: boolean
  requirePlatformAdmin?: boolean
}

export type PageAccessInput = {
  access: EffectiveAccess
  accessLoaded: boolean
  hasActiveOrg: boolean
  user: UserData | null
}

export type PageAccessDecision = {
  allowed: boolean
  pending: boolean
  matched: boolean
  requiredMenuIds: string[]
  requiredOrgCapability?: string
  requiredPlatformCapability?: string
}

const pageAccessRules: PageAccessRule[] = [
  { path: '/profile', authOnly: true },
  { path: '/settings/profile', authOnly: true },
  { path: '/subscription', authOnly: true },
  { path: '/landing', authOnly: true },
  { path: '/docs', authOnly: true },
  { path: '/pricing', authOnly: true },
  { path: '/live', authOnly: true },
  { path: '/mqtt', exact: true, authOnly: true },

  { path: '/admin', requirePlatformAdmin: true },

  { path: '/settings', requireOrgManage: true, requirePlatformSettings: true },

  { path: '/intDash', exact: true, menuIds: ['intDash'] },
  { path: '/dashboard', exact: true, menuIds: ['dashboard'] },
  { path: '/biDash', exact: true, menuIds: ['map'] },
  { path: '/map', menuIds: ['map'] },
  { path: '/videowall', menuIds: ['videowall'] },
  { path: '/floorPlans', menuIds: ['floor-plans-menu'] },

  { path: '/edge-ai/summary/people-counting', menuIds: ['edgeAiPeopleCounting'] },
  { path: '/edge-ai/summary/people-blacklist', menuIds: ['edgeAiPeopleBlacklist'] },
  { path: '/edge-ai/summary/events-notification', menuIds: ['edgeAiEventsNotification'] },
  { path: '/edge-ai/summary-report', menuIds: ['edgeAiSummaryReport'] },
  { path: '/edge-ai', menuIds: ['edgeAiSummaryReport'] },

  { path: '/ksearch', menuIds: ['ksearch'] },
  { path: '/aiSearch', menuIds: ['ksearch'] },

  { path: '/kcontrol/events', menuIds: ['kcontrolEvents'] },
  { path: '/kcontrol/logs', menuIds: ['kcontrolLogs'] },
  { path: '/kcontrol/mapif', menuIds: ['kcontrolMapif'] },
  { path: '/kcontrol/map', menuIds: ['kcontrolMap'] },
  { path: '/kcontrol/sop', menuIds: ['kcontrolSop'] },
  { path: '/kcontrol/temperature', menuIds: ['kcontrolTemperature'] },
  { path: '/kcontrol/edit', menuIds: ['kcontrolDevices'] },
  { path: '/kcontrol', menuIds: ['kcontrolDevices'] },

  { path: '/iotControl/events', menuIds: ['kcontrolEvents'] },
  { path: '/iotControl/logs', menuIds: ['kcontrolLogs'] },
  { path: '/iotControl/temperature', menuIds: ['kcontrolTemperature'] },
  { path: '/iotControl/map', menuIds: ['kcontrolMap'] },
  { path: '/iotControl/sop', menuIds: ['kcontrolSop'] },
  { path: '/iotControl', menuIds: ['kcontrolDevices'] },

  { path: '/ingest/events', menuIds: ['ingestEvents'] },
  { path: '/ingest/dashboard', menuIds: ['ingestDashboard', 'ingestEvents'] },

  { path: '/polices', menuIds: ['police'] },
  { path: '/police', menuIds: ['police'] },
  { path: '/kwatch', menuIds: ['police'] },

  {
    path: '/systemUsers/organizations',
    menuIds: ['systemUsersOrgs'],
    requireOrgManage: true,
    allowWithoutOrg: true
  },
  { path: '/systemUsers/users', menuIds: ['systemUsersUsers'], requireOrgManage: true },
  { path: '/systemUsers/unit', menuIds: ['systemUsersUnits'], requireOrgManage: true },
  {
    path: '/systemUsers/permissions',
    menuIds: ['systemUsersPermissions'],
    requireOrgManage: true
  },
  { path: '/systemUsers', requireOrgManage: true },

  {
    path: '/systemDevices/cameras',
    menuIds: ['systemDevicesCameras'],
    requireOrgManage: true
  },
  {
    path: '/systemDevices/groups',
    menuIds: ['systemDevicesGroups'],
    requireOrgManage: true
  },
  { path: '/systemDevices/edge', menuIds: ['systemDevicesEdge'] }
]

function ruleMatches(path: string, rule: PageAccessRule) {
  if (rule.exact) return path === rule.path
  return path === rule.path || path.startsWith(`${rule.path}/`)
}

export function normalizePagePath(pathname: string, basePath = '') {
  let path = pathname.split('?')[0]?.split('#')[0] || '/'

  if (basePath && path.startsWith(basePath)) {
    path = path.slice(basePath.length) || '/'
  }

  if (path.length > 1) {
    path = path.replace(/\/+$/, '')
  }

  return path || '/'
}

export function menuPath(url?: string) {
  if (!url) return ''
  const withSlash = url.startsWith('/') ? url : `/${url}`
  return normalizePagePath(withSlash)
}

export function findPageAccessRule(pathname: string) {
  const path = normalizePagePath(pathname)
  return pageAccessRules.find((rule) => ruleMatches(path, rule))
}

export function evaluatePageAccess(
  pathname: string,
  input: PageAccessInput
): PageAccessDecision {
  const path = normalizePagePath(pathname)
  const rule = pageAccessRules.find((candidate) => ruleMatches(path, candidate))
  const requiredMenuIds = rule?.menuIds ?? []

  const baseDecision: PageAccessDecision = {
    allowed: false,
    pending: false,
    matched: Boolean(rule),
    requiredMenuIds
  }

  if (!rule) return baseDecision

  if (rule.authOnly) {
    return { ...baseDecision, allowed: true }
  }

  if (rule.requirePlatformAdmin) {
    return {
      ...baseDecision,
      allowed: input.user?.role === 'administrator',
      requiredPlatformCapability: 'administrator'
    }
  }

  const canManageOrg = input.access.orgCapabilities.canManageOrganization
  const canManageSettings = input.access.platformCapabilities.canManageSettings
  const hasMenu = requiredMenuIds.some((menuId) => input.access.visibleMenuIds.includes(menuId))
  const needsAccess =
    requiredMenuIds.length > 0 || rule.requireOrgManage || rule.requirePlatformSettings

  if (needsAccess && !input.hasActiveOrg && !rule.allowWithoutOrg) {
    return {
      ...baseDecision,
      requiredOrgCapability: rule.requireOrgManage ? 'organization.manage' : undefined,
      requiredPlatformCapability: rule.requirePlatformSettings ? 'settings.manage' : undefined
    }
  }

  if (needsAccess && input.hasActiveOrg && !input.accessLoaded) {
    return { ...baseDecision, pending: true }
  }

  return {
    ...baseDecision,
    allowed:
      hasMenu ||
      Boolean(rule.requireOrgManage && canManageOrg) ||
      Boolean(rule.requirePlatformSettings && canManageSettings),
    requiredOrgCapability: rule.requireOrgManage ? 'organization.manage' : undefined,
    requiredPlatformCapability: rule.requirePlatformSettings ? 'settings.manage' : undefined
  }
}

export function canAccessPage(pathname: string, input: PageAccessInput) {
  const decision = evaluatePageAccess(pathname, input)
  return decision.allowed
}
