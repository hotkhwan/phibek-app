// src/lib/stores/appSidebarMenus.ts
// Sidebar follows cyber_admin v2.0 structure: one NAVIGATION section for the
// operating surface, then USER PORTAL for personal/account pages.
import { writable } from 'svelte/store'
import type { SidebarMenu } from '$lib/types/navigation'

export const appSidebarMenus = writable<SidebarMenu[]>([
  { kind: 'header', id: 'nav', textKey: 'navNavigation' },

  { kind: 'link', id: 'dashboard', menuId: 'dashboard', url: 'dashboard', icon: 'bi bi-ui-radios-grid', textKey: 'navDashboard' },
  { kind: 'link', id: 'aiSearch', menuId: 'ksearch', url: 'aiSearch', icon: 'bi bi-search-heart', textKey: 'navAiSearch' },
  { kind: 'link', id: 'iotWatch', menuId: 'kwatch', url: 'iotWatch', icon: 'bi bi-eye', textKey: 'navIotWatch' },
  {
    kind: 'link',
    id: 'iotControl',
    menuId: 'kcontrol',
    icon: 'bi bi-cpu',
    textKey: 'navIotControl',
    children: [
      { id: 'iotControlOverview', menuId: 'kcontrolDevices', url: 'iotControl', textKey: 'navIotControlOverview' },
      { id: 'iotControlEvents', menuId: 'kcontrolEvents', url: 'iotControl/events', textKey: 'navIotControlEvents' },
      { id: 'iotControlLogs', menuId: 'kcontrolLogs', url: 'iotControl/logs', textKey: 'navIotControlLogs' },
      { id: 'iotControlMap', menuId: 'kcontrolMap', url: 'iotControl/map', textKey: 'navIotControlMap' },
      { id: 'iotControlSop', menuId: 'kcontrolSop', url: 'iotControl/sop', textKey: 'navIotControlSop' }
    ]
  },
  { kind: 'link', id: 'edgeAi', menuId: 'edgeAiSummaryReport', url: 'edge-ai', icon: 'bi bi-cpu-fill', textKey: 'navEdgeAi' },
  {
    kind: 'link',
    id: 'ingest',
    menuId: 'ingest',
    icon: 'bi bi-collection',
    textKey: 'navIngest',
    children: [
      { id: 'ingestEvents', menuId: 'ingestEvents', url: 'ingest/events', textKey: 'navIngestEvents' },
      { id: 'ingestDashboard', menuId: 'ingestDashboard', url: 'ingest/dashboard', textKey: 'navIngestDashboard' }
    ]
  },
  { kind: 'link', id: 'floorPlans', menuId: 'floor-plans-menu', url: 'floorPlans', icon: 'bi bi-bounding-box', textKey: 'navFloorPlans' },
  {
    kind: 'link',
    id: 'police',
    menuId: 'police',
    icon: 'bi bi-shield-shaded',
    textKey: 'navPolice',
    children: [
      { id: 'policeWatchlist', url: 'police', textKey: 'navPoliceWatchlist' },
      { id: 'policeMode', url: 'polices', textKey: 'navPolicePoliceMode' }
    ]
  },
  { kind: 'link', id: 'live', menuId: 'live', url: 'live', icon: 'bi bi-broadcast', textKey: 'navLive' },
  { kind: 'link', id: 'map', menuId: 'map', url: 'map', icon: 'bi bi-globe-americas', textKey: 'navMap' },
  { kind: 'link', id: 'videoWall', menuId: 'videowall', url: 'videowall', icon: 'bi bi-grid-3x3-gap', textKey: 'navVideoWall' },
  { kind: 'link', id: 'biDash', menuId: 'map', url: 'biDash', icon: 'bi bi-bar-chart-line', textKey: 'navBiDash' },
  { kind: 'link', id: 'mqtt', url: 'mqtt', icon: 'bi bi-router', textKey: 'navMqttConsole' },
  { kind: 'link', id: 'watchman', url: 'watchman', icon: 'bi bi-display', textKey: 'navWatchmanIframe' },
  {
    kind: 'link',
    id: 'systemDevices',
    menuId: 'systemDevices',
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
    menuId: 'systemUsers',
    icon: 'bi bi-people-fill',
    textKey: 'navSystemUsers',
    children: [
      { id: 'systemUsersUsers', menuId: 'systemUsersUsers', url: 'systemUsers/users', textKey: 'navSystemUsersUsers' },
      { id: 'systemUsersOrganizations', menuId: 'systemUsersOrgs', url: 'systemUsers/organizations', textKey: 'navSystemUsersOrganizations' },
      { id: 'systemUsersUnit', menuId: 'systemUsersUnits', url: 'systemUsers/unit', textKey: 'navSystemUsersUnit' },
      // klynx-api 4.53.0 tightened GET/LIST on /orgs/(menu|resource)/permissions
      // to require organization.manage on the active org. The legacy
      // `systemUsersPermissions` menu grant alone is insufficient — gate
      // this entry on both to stay defense-in-depth aligned with the BE.
      // See docs/contracts/permission-profile.md §5.2 + §5.2.1 (klynx FE
      // 3.50.0 mirror).
      { id: 'systemUsersPermissions', menuId: 'systemUsersPermissions', url: 'systemUsers/permissions/menu', textKey: 'navSystemUsersPermissions', requireCapability: 'organization.manage' }
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
