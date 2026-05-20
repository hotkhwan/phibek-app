// src/lib/api/klynxUser.ts
// klynx /kapi/users/* + /kapi/orgs/* — system user / org / unit / permission management.
// Named `klynxUser` to avoid clashing with the existing `lib/api/user.ts`
// (gateway-portal flavor) which a few stale imports may still rely on.
import { api, apiSafe } from '$lib/utils/fetch'

type ApiEnvelope<T> = { status?: boolean; code?: string; message?: string; details: T }
type Pagination = {
  page: number
  perPage: number
  totalRecords: number
  totalPages: number
}

export type KlynxUser = {
  id: string
  username: string
  email?: string
  firstName?: string
  lastName?: string
  fullName?: string
  enabled?: boolean
  role?: string
  platformRole?: string
  avatar?: string
  createdAt?: string
  createAt?: string
  updateAt?: string
}

export type UserOrganizationMembership = Organization & {
  orgRole?: 'owner' | 'admin' | 'member'
  tenantId?: string
  isActive?: boolean
}

export type ProvisionUserBody = {
  username: string
  password: string
  firstName?: string
  lastName?: string
  email?: string
  enabled?: boolean
  role?: string
}

export type UpdateUserBody = {
  firstName?: string
  lastName?: string
  email?: string
  role?: string
  enabled?: boolean
}

export type UserDetail = {
  user: KlynxUser
  organizations: UserOrganizationMembership[]
}

export type Organization = {
  id: string
  orgId?: string
  name: string
  description?: string
  status?: string
  ingestEndpoint?: string
  provisionStatus?: 'pending' | 'provisioning' | 'active' | 'provisionFailed' | string
  createAt?: string
  updateAt?: string
}

export type OrgUnit = {
  id: string
  name: string
  parentId?: string
  description?: string
  childCount?: number
  totalUnit?: number
  memberCount?: number
  children?: OrgUnit[]
}

export type MenuPermission = {
  id: string
  name?: string
  description?: string
  menuId: string
  menuIds?: string[]
  role?: string
  allow?: 'r' | 'rw' | 'none'
  status?: boolean
  scopeType?: 'organization' | 'orgUnit'
  orgUnitIds?: string[]
}

export type ResourcePermission = {
  id: string
  name?: string
  description?: string
  resourceId: string
  resourceGroupIds?: string[]
  cameraIds?: string[]
  kcontrolIds?: string[]
  edgeIds?: string[]
  orgUnitIds?: string[]
  memberIds?: string[]
  memberIdsByOU?: Record<string, string[]>
  relations?: string[]
  status?: boolean
  resourceDeviceScope?: 'all' | 'selected' | string
  includeOrgUnitChildren?: boolean
  includeResourceGroupChildren?: boolean
  role?: string
  allow?: 'r' | 'rw' | 'none'
}

export type PhibekWorkspaceResult = {
  ingestEndpoint?: string
  provisionStatus: 'pending' | 'provisioning' | 'active' | 'provisionFailed' | string
}

export type ListParams = {
  page?: number
  perPage?: number
  search?: string
  sortField?: string
  sortOrder?: 'asc' | 'desc'
  mode?: 'members'
}

export async function listUsers(params: ListParams = {}) {
  return apiSafe<
    ApiEnvelope<{ items: KlynxUser[] }> & { pagination?: Pagination }
  >('/users', { params })
}

/**
 * Members of the active organisation. After `removeUserFromOrg` the deleted
 * user disappears from this list (they still exist in Keycloak as system
 * users — see `listUsers` for that scope).
 *
 * Backend matches klynx: GET /orgs/users/members
 *   X-Active-Org: <orgId>  (auto-injected by `lib/utils/fetch`)
 */
export async function listOrgMembers(params: ListParams & { sortField?: string } = {}, orgId?: string) {
  return apiSafe<
    ApiEnvelope<{ items: (KlynxUser & { orgRole?: 'owner' | 'admin' | 'member' })[] }>
    & { pagination?: Pagination }
  >('/orgs/users/members', {
    params,
    headers: orgId ? { 'X-Active-Org': orgId } : undefined
  })
}

export async function getUser(id: string) {
  return apiSafe<ApiEnvelope<KlynxUser | UserDetail>>(`/users/${encodeURIComponent(id)}`)
}

export async function provisionUser(body: ProvisionUserBody) {
  return api<ApiEnvelope<KlynxUser>>('/orgs/users/provision', {
    method: 'POST',
    body
  })
}

export async function updateUser(id: string, body: UpdateUserBody) {
  return api<ApiEnvelope<KlynxUser>>(`/users/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body
  })
}

export async function updateUserProfileMultipart(id: string, body: FormData) {
  return api<ApiEnvelope<KlynxUser>>(`/users/${encodeURIComponent(id)}/profile`, {
    method: 'PATCH',
    body
  })
}

export async function updateOrgMemberRole(
  userId: string,
  orgId: string,
  role: 'admin' | 'member'
) {
  return api<ApiEnvelope<unknown>>(`/orgs/users/${encodeURIComponent(userId)}`, {
    method: 'PATCH',
    body: { role },
    headers: orgId ? { 'X-Active-Org': orgId } : undefined
  })
}

export async function setUserEnabled(id: string, enabled: boolean) {
  return api<ApiEnvelope<KlynxUser>>(
    `/users/${encodeURIComponent(id)}/${enabled ? 'enable' : 'disable'}`,
    { method: 'PATCH' }
  )
}

/**
 * Remove user(s) from the active org. Klynx contract:
 *   PATCH /orgs/users/remove
 *   X-Active-Org: <orgId>
 *   body: { users: [{ userId }, ...] }
 */
export async function removeUserFromOrg(userId: string, orgId?: string) {
  return removeUsersFromOrg([userId], orgId)
}

export async function removeUsersFromOrg(userIds: string[], orgId?: string) {
  return api<ApiEnvelope<unknown>>('/orgs/users/remove', {
    method: 'PATCH',
    body: { users: userIds.map((id) => ({ userId: id })) },
    headers: orgId ? { 'X-Active-Org': orgId } : undefined
  })
}

export async function listOrgs(params: ListParams = {}) {
  return apiSafe<
    ApiEnvelope<{ items: Organization[] }> & { pagination?: Pagination }
  >('/orgs/', { params })
}

export async function createOrg(body: { name: string; description?: string }) {
  return api<ApiEnvelope<Organization>>('/orgs/', { method: 'POST', body })
}

export async function updateOrg(id: string, body: { name?: string; description?: string; status?: string }) {
  return api<ApiEnvelope<Organization>>(`/orgs/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body
  })
}

export async function deleteOrg(id: string) {
  return api<ApiEnvelope<unknown>>(`/orgs/${encodeURIComponent(id)}`, {
    method: 'DELETE'
  })
}

export async function getOrgIngestStatus(orgId: string) {
  return apiSafe<ApiEnvelope<{
    ingestEndpoint?: string
    eventIngestUri?: string
    provisionStatus?: PhibekWorkspaceResult['provisionStatus']
  }>>('/ingest/', {
    headers: orgId ? { 'X-Active-Org': orgId } : undefined
  })
}

export async function enableOrgIngest(orgId: string) {
  return api<ApiEnvelope<{
    orgId?: string
    workspaceId?: string
    eventIngestUri?: string
    provisionStatus: PhibekWorkspaceResult['provisionStatus']
    idempotent?: boolean
  }>>('/ingest/enableWebhook', {
    method: 'POST',
    headers: orgId ? { 'X-Active-Org': orgId } : undefined
  })
}

export async function listOrgUnits(params: ListParams = {}) {
  return apiSafe<
    ApiEnvelope<{ items: OrgUnit[] }> & { pagination?: Pagination }
  >('/orgs/units/', { params })
}

export async function getOrgUnitTree() {
  return apiSafe<ApiEnvelope<OrgUnit[] | { items?: OrgUnit[]; children?: OrgUnit[] }>>('/orgs/units/tree')
}

export async function getOrgUnitsAll() {
  return apiSafe<ApiEnvelope<OrgUnit[] | { items?: OrgUnit[]; children?: OrgUnit[] }>>('/orgs/units/all')
}

export async function bulkDeleteOrgUnits(ids: string[]) {
  return api<ApiEnvelope<unknown>>('/orgs/units', {
    method: 'DELETE',
    body: { ids }
  })
}

export async function listOrgUnitMembers(unitId: string, params: { page?: number; perPage?: number; search?: string } = {}) {
  return apiSafe<ApiEnvelope<{ items: KlynxUser[] }>>(
    `/orgs/units/${encodeURIComponent(unitId)}/members`,
    { params }
  )
}

export async function createOrgUnit(body: { name: string; description?: string; parentId?: string }) {
  return api<ApiEnvelope<OrgUnit>>('/orgs/units', { method: 'POST', body })
}

export async function updateOrgUnit(id: string, body: { name?: string; description?: string; parentId?: string }) {
  return api<ApiEnvelope<OrgUnit>>(`/orgs/units/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body
  })
}

export async function deleteOrgUnit(id: string) {
  return api<ApiEnvelope<unknown>>(`/orgs/units/${encodeURIComponent(id)}`, {
    method: 'DELETE'
  })
}

export async function listMenuPermissions(params: ListParams = {}) {
  return apiSafe<
    ApiEnvelope<{ items: MenuPermission[] }>
  >('/orgs/menu/permissions/', { params })
}

export async function listResourcePermissions(params: ListParams = {}) {
  return apiSafe<
    ApiEnvelope<{ items: ResourcePermission[] }>
  >('/orgs/resource/permissions/', { params })
}

export async function createMenuPermission(body: {
  name: string
  description?: string
  menus?: string[]
  relations?: string[]
  status?: boolean
  scopeType?: 'organization' | 'orgUnit'
}) {
  return api<ApiEnvelope<MenuPermission>>('/orgs/menu/permissions', { method: 'POST', body })
}

export async function updateMenuPermission(id: string, body: {
  name?: string
  description?: string
  menus?: string[]
  relations?: string[]
  status?: boolean
  scopeType?: 'organization' | 'orgUnit'
  orgUnits?: string[]
  userIds?: string[]
  includeOrgUnitChildren?: boolean
}) {
  return api<ApiEnvelope<MenuPermission>>(`/orgs/menu/permissions/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body
  })
}

export async function deleteMenuPermission(id: string) {
  return api<ApiEnvelope<unknown>>(`/orgs/menu/permissions/${encodeURIComponent(id)}`, {
    method: 'DELETE'
  })
}

export async function getMenuPermissionDetail(id: string) {
  return apiSafe<ApiEnvelope<MenuPermission & {
    menuIds?: string[]
    relations?: string[]
    scopeType?: string
    orgUnitIds?: string[]
    userIds?: string[]
    includeOrgUnitChildren?: boolean
  }>>(`/orgs/menu/permissions/${encodeURIComponent(id)}`)
}

export async function setMenuPermissionStatus(id: string, status: boolean) {
  return api<ApiEnvelope<MenuPermission>>(
    `/orgs/menu/permissions/${encodeURIComponent(id)}`,
    { method: 'PATCH', body: { status } }
  )
}

export async function createResourcePermission(body: {
  name: string
  description?: string
  relations: string[]
  status?: boolean
}) {
  return api<ApiEnvelope<ResourcePermission>>('/orgs/resource/permissions', { method: 'POST', body })
}

export async function updateResourcePermission(id: string, body: {
  name?: string
  description?: string
  relations?: string[]
  status?: boolean
  orgUnits?: string[]
  resourceGroups?: string[]
  cameras?: string[]
  kControls?: string[]
  edges?: string[]
  memberIdsByOU?: Record<string, string[]>
  resourceDeviceScope?: 'all' | 'selected' | string
  includeOrgUnitChildren?: boolean
  includeResourceGroupChildren?: boolean
}) {
  return api<ApiEnvelope<ResourcePermission>>(`/orgs/resource/permissions/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body
  })
}

export async function getResourcePermissionDetail(id: string) {
  return apiSafe<ApiEnvelope<ResourcePermission>>(`/orgs/resource/permissions/${encodeURIComponent(id)}`)
}

export async function deleteResourcePermission(id: string) {
  return api<ApiEnvelope<unknown>>(`/orgs/resource/permissions/${encodeURIComponent(id)}`, {
    method: 'DELETE'
  })
}

export async function inviteOrgMember(body: { email: string; role: string }) {
  return api<ApiEnvelope<{ inviteId: string }>>('/orgs/users/invite', {
    method: 'POST',
    body
  })
}

export async function inviteOrgUsers(users: Array<{ userId: string; role?: 'admin' | 'member' }>, orgId?: string) {
  return api<ApiEnvelope<unknown>>('/orgs/users/invite', {
    method: 'POST',
    body: { users },
    headers: orgId ? { 'X-Active-Org': orgId } : undefined
  })
}

export async function removeOrgMember(userId: string) {
  await api('/orgs/users/remove', {
    method: 'POST',
    body: { userId }
  })
}

export async function addOrgUnitMembers(unitId: string, users: Array<{ userId: string; role?: 'admin' | 'member' }>) {
  return api<ApiEnvelope<unknown>>(`/orgs/units/${encodeURIComponent(unitId)}/members`, {
    method: 'POST',
    body: { users }
  })
}

export async function removeOrgUnitMembers(unitId: string, userIds: string[]) {
  return api<ApiEnvelope<unknown>>(`/orgs/units/${encodeURIComponent(unitId)}/members`, {
    method: 'PATCH',
    body: { users: userIds.map((userId) => ({ userId })) }
  })
}
