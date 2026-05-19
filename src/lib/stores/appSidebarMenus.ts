// src/lib/stores/appSidebarMenus.ts
// Sidebar follows cyber_admin v2.0 structure: one NAVIGATION section for the
// operating surface, then USER PORTAL for personal/account pages.
import { writable } from 'svelte/store'
import type { SidebarMenu } from '$lib/types/navigation'

export const appSidebarMenus = writable<SidebarMenu[]>([
  { kind: 'header', id: 'nav', textKey: 'navNavigation' },

  { kind: 'link', id: 'dashboard', menuId: 'dashboard', url: 'dashboard', icon: 'bi bi-ui-radios-grid', textKey: 'navDashboard' },
  { kind: 'link', id: 'intDash', menuId: 'intDash', url: 'intDash', icon: 'bi bi-activity', textKey: 'navIntDash' },
  { kind: 'link', id: 'aiSearch', menuId: 'ksearch', url: 'aiSearch', icon: 'bi bi-search-heart', textKey: 'navAiSearch' },
  {
    kind: 'link',
    id: 'iotControl',
    icon: 'bi bi-cpu',
    textKey: 'navIotControl',
    children: [
      { id: 'iotControlOverview', menuId: 'kcontrolDevices', url: 'iotControl', textKey: 'navIotControlOverview' },
      { id: 'iotControlEvents', menuId: 'kcontrolEvents', url: 'iotControl/events', textKey: 'navIotControlEvents' },
      { id: 'iotControlLogs', menuId: 'kcontrolLogs', url: 'iotControl/logs', textKey: 'navIotControlLogs' },
      { id: 'iotControlTemperature', menuId: 'kcontrolTemperature', url: 'iotControl/temperature', textKey: 'navIotControlTemperature' },
      { id: 'iotControlMap', menuId: 'kcontrolMap', url: 'iotControl/map', textKey: 'navIotControlMap' },
      { id: 'iotControlSop', menuId: 'kcontrolSop', url: 'iotControl/sop', textKey: 'navIotControlSop' }
    ]
  },
  {
    kind: 'link',
    id: 'edgeAi',
    icon: 'bi bi-cpu-fill',
    textKey: 'navEdgeAi',
    children: [
      { id: 'edgeAiSummaryReport', menuId: 'edgeAiSummaryReport', url: 'edge-ai/summary-report', textKey: 'navEdgeAiSummary' },
      { id: 'edgeAiPeopleCounting', menuId: 'edgeAiPeopleCounting', url: 'edge-ai/summary/people-counting', textKey: 'navEdgeAiPeopleCounting' },
      { id: 'edgeAiPeopleBlacklist', menuId: 'edgeAiPeopleBlacklist', url: 'edge-ai/summary/people-blacklist', textKey: 'navEdgeAiPeopleBlacklist' },
      { id: 'edgeAiEventsNotification', menuId: 'edgeAiEventsNotification', url: 'edge-ai/summary/events-notification', textKey: 'navEdgeAiEventsNotification' }
    ]
  },
  {
    kind: 'link',
    id: 'ingest',
    icon: 'bi bi-collection',
    textKey: 'navIngest',
    children: [
      { id: 'ingestEvents', menuId: 'ingestEvents', url: 'ingest/events', textKey: 'navIngestEvents' },
      { id: 'ingestDashboard', menuId: 'ingestDashboard', url: 'ingest/dashboard', textKey: 'navIngestDashboard' }
    ]
  },
  { kind: 'link', id: 'floorPlans', menuId: 'floor-plans-menu', url: 'floorPlans', icon: 'bi bi-bounding-box', textKey: 'navFloorPlans' },
  { kind: 'link', id: 'watchlist', menuId: 'police', url: 'police', icon: 'bi bi-person-bounding-box', textKey: 'navPolice' },
  { kind: 'link', id: 'live', url: 'live', icon: 'bi bi-broadcast', textKey: 'navLive' },
  { kind: 'link', id: 'map', menuId: 'map', url: 'map', icon: 'bi bi-globe-americas', textKey: 'navMap' },
  { kind: 'link', id: 'videoWall', menuId: 'videowall', url: 'videowall', icon: 'bi bi-grid-3x3-gap', textKey: 'navVideoWall' },
  { kind: 'link', id: 'biDash', menuId: 'map', url: 'biDash', icon: 'bi bi-bar-chart-line', textKey: 'navBiDash' },
  { kind: 'link', id: 'mqtt', url: 'mqtt', icon: 'bi bi-router', textKey: 'navMqttConsole' },
  {
    kind: 'link',
    id: 'systemDevices',
    icon: 'bi bi-hdd-network',
    textKey: 'navSystemDevices',
    children: [
      { id: 'systemDevicesCameras', menuId: 'systemDevicesCameras', url: 'systemDevices/cameras', textKey: 'navSystemDevicesCameras' },
      { id: 'systemDevicesEdge', menuId: 'systemDevicesEdge', url: 'systemDevices/edge', textKey: 'navSystemDevicesEdge' },
      { id: 'systemDevicesGroups', menuId: 'systemDevicesGroups', url: 'systemDevices/groups', textKey: 'navSystemDevicesGroups' }
    ]
  },
  {
    kind: 'link',
    id: 'systemUsers',
    icon: 'bi bi-people-fill',
    textKey: 'navSystemUsers',
    children: [
      { id: 'systemUsersUsers', menuId: 'systemUsersUsers', url: 'systemUsers/users', textKey: 'navSystemUsersUsers' },
      { id: 'systemUsersOrganizations', menuId: 'systemUsersOrgs', url: 'systemUsers/organizations', textKey: 'navSystemUsersOrganizations' },
      { id: 'systemUsersUnit', menuId: 'systemUsersUnits', url: 'systemUsers/unit', textKey: 'navSystemUsersUnit' },
      { id: 'systemUsersPermissions', menuId: 'systemUsersPermissions', url: 'systemUsers/permissions/menu', textKey: 'navSystemUsersPermissions' }
    ]
  },
  {
    kind: 'link',
    id: 'admin',
    icon: 'bi bi-shield-lock',
    textKey: 'navAdmin',
    children: [
      { id: 'adminOverview', url: 'admin', textKey: 'navAdminOverview' },
      { id: 'adminLicenses', url: 'admin/licenses', textKey: 'navAdminLicenses' },
      { id: 'adminPlatformLicense', url: 'admin/platform-license', textKey: 'navAdminPlatformLicense' }
    ]
  },
  { kind: 'link', id: 'landing', url: 'landing', icon: 'bi bi-rainbow', textKey: 'navLanding' },

  { kind: 'header', id: 'userPortal', textKey: 'navUserPortal' },
  { kind: 'link', id: 'profile', url: 'profile', icon: 'bi bi-person', textKey: 'navProfile' },
  { kind: 'link', id: 'settings', url: 'settings', icon: 'bi bi-gear', textKey: 'navSettings' },
  { kind: 'link', id: 'subscription', url: 'subscription', icon: 'bi bi-gem', textKey: 'navSubscription' },
  { kind: 'link', id: 'pricing', url: 'pricing', icon: 'bi bi-tags', textKey: 'navPricing' },
  { kind: 'link', id: 'docs', url: 'docs', icon: 'bi bi-question-octagon', textKey: 'navDocumentation' }
])
