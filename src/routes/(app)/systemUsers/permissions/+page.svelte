<!-- src/routes/(app)/systemUsers/permissions/+page.svelte -->
<script lang="ts">
  import { onDestroy, onMount } from 'svelte'
  import { page } from '$app/state'
  import { get } from 'svelte/store'
  import { setPageTitle } from '$lib/utils/title'
  import { appOptions } from '$lib/stores/appOptions'
  import { appSidebarMenus } from '$lib/stores/appSidebarMenus'
  import {
    createMenuPermission,
    createResourcePermission,
    deleteMenuPermission,
    deleteResourcePermission,
    getMenuPermissionDetail,
    getOrgUnitsAll,
    getResourcePermissionDetail,
    listMenuPermissions,
    listOrgMembers,
    listResourcePermissions,
    setMenuPermissionStatus,
    updateMenuPermission,
    updateResourcePermission,
    type KlynxUser,
    type MenuPermission,
    type OrgUnit,
    type ResourcePermission
  } from '$lib/api/klynxUser'
  import { listCameras, listResourceGroups, type Camera, type ResourceGroup } from '$lib/api/devices'
  import { notify } from '$lib/stores/notify'
  import { m } from '$lib/i18n/messages'
  import type { SidebarChild, SidebarMenu, SidebarMenuLink } from '$lib/types/navigation'

  type Tab = 'resource' | 'menu' | 'api'
  type Relation = 'viewer' | 'editor' | 'creator'
  type Row = (MenuPermission | ResourcePermission) & { id: string }
  type TreeKind = 'section' | 'profile' | 'menu' | 'orgUnit' | 'member' | 'resourceGroup' | 'camera' | 'apiScope'
  type PermissionTreeNode = {
    id: string
    kind: TreeKind
    label: string
    value?: string
    description?: string
    icon?: string
    count?: string | number
    selectable?: boolean
    children?: PermissionTreeNode[]
  }

  let activeTab = $state<Tab>('resource')
  let menuRows = $state<MenuPermission[]>([])
  let resourceRows = $state<ResourcePermission[]>([])
  let orgUnits = $state<OrgUnit[]>([])
  let members = $state<(KlynxUser & { userId?: string; orgRole?: string })[]>([])
  let groups = $state<ResourceGroup[]>([])
  let cameras = $state<Camera[]>([])
  let selectedId = $state('')
  let loading = $state(false)
  let detailLoading = $state(false)
  let saving = $state(false)
  let errorMsg = $state('')
  let search = $state('')
  let pickerSearch = $state('')
  let form = $state({ name: '', description: '', status: true, relation: 'viewer' as Relation })
  let selectedOrgUnits = $state<Set<string>>(new Set())
  let selectedMembers = $state<Set<string>>(new Set())
  let selectedGroups = $state<Set<string>>(new Set())
  let selectedCameras = $state<Set<string>>(new Set())
  let selectedMenus = $state<Set<string>>(new Set())
  let expandedNodes = $state<Set<string>>(new Set([
    'profiles:resource',
    'profiles:menu',
    'profiles:api',
    'menu-section:nav',
    'menu-section:userPortal',
    'audience:orgUnits',
    'audience:members',
    'resources:groups',
    'resources:ungrouped',
    'api:root',
    'api:third-party',
    'api:aliza'
  ]))
  let includeOrgUnitChildren = $state(true)
  let includeResourceGroupChildren = $state(true)
  let createMode = $state(false)

  const rows = $derived<Row[]>(activeTab === 'menu' ? menuRows : activeTab === 'resource' ? resourceRows : [])
  const selected = $derived(rows.find((x) => x.id === selectedId))
  const filteredRows = $derived(rows.filter((x) => `${x.name ?? ''} ${x.description ?? ''} ${x.id}`.toLowerCase().includes(search.toLowerCase())))
  const profileTree = $derived.by(() => buildProfileTree(filteredRows))
  const menuTree = $derived.by(() => filterTree(buildMenuTree(), pickerSearch))
  const audienceTree = $derived.by(() => filterTree(buildAudienceTree(), pickerSearch))
  const resourceTree = $derived.by(() => filterTree(buildResourceTree(), pickerSearch))
  const apiTree = $derived.by(() => filterTree(buildApiTree(), pickerSearch))

  function idOfUser(row: KlynxUser & { userId?: string }) { return row.userId ?? row.id }
  function displayName(row: KlynxUser) { return row.fullName || `${row.firstName ?? ''} ${row.lastName ?? ''}`.trim() || row.username || row.email || row.id }
  function cameraId(row: Camera) { return row.camId ?? row.id }
  function relations(): Relation[] { return form.relation === 'creator' ? ['viewer', 'editor', 'creator'] : form.relation === 'editor' ? ['viewer', 'editor'] : ['viewer'] }
  function relationFrom(values?: string[]) { return values?.includes('creator') ? 'creator' : values?.includes('editor') ? 'editor' : 'viewer' }
  function relationLabel() { return form.relation === 'creator' ? 'Create / Manage' : form.relation === 'editor' ? 'Read / Write' : 'Read' }
  function menuIds() { return [...selectedMenus] }
  function setFrom(values: Array<string | undefined | null>) { return new Set(values.filter(Boolean).map(String)) }
  function selectedListCount(values?: Array<string | undefined | null>) { return values?.filter(Boolean).length ?? 0 }
  function rowSelectedCount(row: Row) {
    const resource = row as ResourcePermission & { memberIds?: string[]; resourceGroupIds?: string[]; cameraIds?: string[] }
    const menu = row as MenuPermission & { userIds?: string[] }
    return selectedListCount(resource.orgUnitIds)
      + selectedListCount(resource.memberIds ?? menu.userIds)
      + selectedListCount(resource.resourceGroupIds)
      + selectedListCount(resource.cameraIds)
      + selectedListCount(menu.menuIds)
  }
  function descendantIds<T extends { id: string; parentId?: string }>(items: T[], rootId: string) {
    const out = new Set<string>([rootId])
    let changed = true
    while (changed) {
      changed = false
      for (const item of items) {
        if (item.parentId && out.has(item.parentId) && !out.has(item.id)) {
          out.add(item.id)
          changed = true
        }
      }
    }
    return out
  }
  function selectedDescendantCount<T extends { id: string; parentId?: string }>(items: T[], rootId: string, selectedIds: Set<string>) {
    const ids = descendantIds(items, rootId)
    let count = 0
    for (const id of selectedIds) if (ids.has(id)) count += 1
    return count
  }

  function t(key: string | number | symbol): string {
    if (typeof key !== 'string') return String(key)
    const fn = (m as Record<string, unknown>)[key]
    return typeof fn === 'function' ? (fn as () => string)() : key
  }

  function itemsFrom<T>(value: unknown): T[] {
    if (Array.isArray(value)) return value as T[]
    if (!value || typeof value !== 'object') return []

    const obj = value as Record<string, unknown>
    for (const key of ['items', 'details', 'units', 'orgUnits', 'children']) {
      const nested = obj[key]
      const items = itemsFrom<T>(nested)
      if (items.length) return items
    }

    return []
  }

  function flattenUnits(items: unknown): OrgUnit[] {
    const out: OrgUnit[] = []
    const walk = (list: OrgUnit[]) => {
      for (const item of list) {
        out.push(item)
        const children = itemsFrom<OrgUnit>((item as OrgUnit & { children?: unknown }).children)
        if (children.length) walk(children)
      }
    }
    walk(itemsFrom<OrgUnit>(items))
    return out
  }

  function toggle(setName: 'ou' | 'member' | 'group' | 'camera' | 'menu', id: string) {
    const source = setName === 'ou'
      ? selectedOrgUnits
      : setName === 'member'
        ? selectedMembers
        : setName === 'group'
          ? selectedGroups
          : setName === 'camera'
            ? selectedCameras
            : selectedMenus
    const next = new Set(source)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    if (setName === 'ou') selectedOrgUnits = next
    else if (setName === 'member') selectedMembers = next
    else if (setName === 'group') selectedGroups = next
    else if (setName === 'camera') selectedCameras = next
    else selectedMenus = next
  }

  function toggleExpanded(id: string) {
    const next = new Set(expandedNodes)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    expandedNodes = next
  }

  function isLinkMenu(menu: SidebarMenu): menu is SidebarMenuLink {
    return menu.kind === 'link'
  }

  function childNodes(children?: SidebarChild[]) {
    return children?.map(sidebarChildToNode).filter((x): x is PermissionTreeNode => !!x) ?? []
  }

  function sidebarChildToNode(child: SidebarChild): PermissionTreeNode | null {
    const children = childNodes(child.children)
    if (!child.menuId && children.length === 0) return null
    return {
      id: `menu:${child.id}:${child.menuId ?? child.url ?? 'group'}`,
      kind: 'menu',
      label: t(child.textKey),
      value: child.menuId,
      description: child.url,
      icon: children.length ? 'bi-folder2-open' : 'bi-file-earmark-text',
      count: children.length || undefined,
      selectable: !!child.menuId,
      children
    }
  }

  function sidebarMenuToNode(menu: SidebarMenuLink): PermissionTreeNode | null {
    const children = childNodes(menu.children)
    if (!menu.menuId && children.length === 0) return null
    return {
      id: `menu:${menu.id}:${menu.menuId ?? menu.url ?? 'group'}`,
      kind: 'menu',
      label: t(menu.textKey),
      value: menu.menuId,
      description: menu.url,
      icon: menu.icon ?? (children.length ? 'bi-folder2-open' : 'bi-file-earmark-text'),
      count: children.length || undefined,
      selectable: !!menu.menuId,
      children
    }
  }

  function buildMenuTree(): PermissionTreeNode[] {
    const sections: PermissionTreeNode[] = []
    let current: PermissionTreeNode | null = null
    for (const item of get(appSidebarMenus)) {
      if (item.kind === 'header') {
        current = {
          id: `menu-section:${item.id}`,
          kind: 'section',
          label: t(item.textKey),
          icon: 'bi-folder2-open',
          selectable: false,
          children: []
        }
        sections.push(current)
        continue
      }
      if (!isLinkMenu(item)) continue
      const node = sidebarMenuToNode(item)
      if (!node) continue
      if (!current) {
        current = { id: 'menu-section:root', kind: 'section', label: 'Menus', icon: 'bi-folder2-open', selectable: false, children: [] }
        sections.push(current)
      }
      current.children = [...(current.children ?? []), node]
    }
    return sections.filter((section) => section.children?.length)
  }

  function buildProfileTree(items: Row[]): PermissionTreeNode[] {
    const label = activeTab === 'resource' ? 'Resource profiles' : activeTab === 'menu' ? 'Menu profiles' : 'API integrations'
    return [{
      id: `profiles:${activeTab}`,
      kind: 'section',
      label,
      icon: 'bi-folder2-open',
      count: activeTab === 'api' ? 'read-only' : items.length,
      selectable: false,
      children: activeTab === 'api'
        ? [
          { id: 'profiles:api:third-party', kind: 'apiScope', label: 'third-party integrations', icon: 'bi-hdd-stack', selectable: false },
          { id: 'profiles:api:service-account', kind: 'apiScope', label: 'service-account scopes', icon: 'bi-key', selectable: false }
        ]
        : items.map((row) => ({
          id: `profile:${row.id}`,
          kind: 'profile',
          label: row.name || row.id,
          value: row.id,
          description: row.description || row.id,
          icon: (row as ResourcePermission).status === false ? 'bi-folder-x' : 'bi-folder2-open',
          count: rowSelectedCount(row) || undefined
        }))
    }]
  }

  function buildOrgUnitNodes(parentId?: string): PermissionTreeNode[] {
    return orgUnits
      .filter((unit) => (unit.parentId ?? '') === (parentId ?? ''))
      .map((unit) => {
        const children = buildOrgUnitNodes(unit.id)
        return {
          id: `ou:${unit.id}`,
          kind: 'orgUnit',
          label: unit.name,
          value: unit.id,
          description: unit.description,
          icon: children.length ? 'bi-folder2-open' : 'bi-building',
          count: children.length || selectedDescendantCount(orgUnits, unit.id, selectedOrgUnits) || undefined,
          children
        }
      })
  }

  function buildMemberNodes(): PermissionTreeNode[] {
    return members.map((member) => ({
      id: `member:${idOfUser(member)}`,
      kind: 'member',
      label: displayName(member),
      value: idOfUser(member),
      description: member.email ?? member.username,
      icon: 'bi-person'
    }))
  }

  function buildAudienceTree(): PermissionTreeNode[] {
    return [
      {
        id: 'audience:orgUnits',
        kind: 'section',
        label: 'Source org units',
        icon: 'bi-diagram-3',
        count: selectedOrgUnits.size,
        selectable: false,
        children: buildOrgUnitNodes()
      },
      {
        id: 'audience:members',
        kind: 'section',
        label: 'Narrow users',
        icon: 'bi-people',
        count: selectedMembers.size || 'All',
        selectable: false,
        children: buildMemberNodes()
      }
    ]
  }

  function buildResourceGroupNodes(parentId?: string): PermissionTreeNode[] {
    return groups
      .filter((group) => (group.parentId ?? '') === (parentId ?? ''))
      .map((group) => {
        const childGroups = buildResourceGroupNodes(group.id)
        const childCameras = cameras
          .filter((camera) => camera.groupId === group.id)
          .map((camera) => ({
            id: `camera:${cameraId(camera)}`,
            kind: 'camera' as const,
            label: camera.name,
            value: cameraId(camera),
            description: camera.description ?? camera.camId,
            icon: camera.online === false ? 'bi-camera-video-off' : 'bi-camera-video'
          }))
        const children = [...childGroups, ...childCameras]
        return {
          id: `group:${group.id}`,
          kind: 'resourceGroup',
          label: group.name,
          value: group.id,
          description: group.description,
          icon: children.length ? 'bi-folder2-open' : 'bi-folder',
          count: children.length || undefined,
          children
        }
      })
  }

  function buildResourceTree(): PermissionTreeNode[] {
    const knownGroupIds = new Set(groups.map((group) => group.id))
    const ungroupedCameras = cameras
      .filter((camera) => !camera.groupId || !knownGroupIds.has(camera.groupId))
      .map((camera) => ({
        id: `camera:${cameraId(camera)}`,
        kind: 'camera' as const,
        label: camera.name,
        value: cameraId(camera),
        description: camera.description ?? camera.camId,
        icon: camera.online === false ? 'bi-camera-video-off' : 'bi-camera-video'
      }))
    const children = buildResourceGroupNodes()
    const nodes: PermissionTreeNode[] = [
      {
        id: 'resources:groups',
        kind: 'section',
        label: 'Resource groups',
        icon: 'bi-folder2-open',
        count: selectedGroups.size,
        selectable: false,
        children
      },
      {
        id: 'resources:ungrouped',
        kind: 'section',
        label: 'Ungrouped devices',
        icon: 'bi-hdd-network',
        count: selectedCameras.size || 'All',
        selectable: false,
        children: ungroupedCameras
      }
    ]
    return nodes.filter((node) => (node.children?.length ?? 0) || node.id === 'resources:groups')
  }

  function buildApiTree(): PermissionTreeNode[] {
    return [{
      id: 'api:root',
      kind: 'section',
      label: 'API Integrations',
      icon: 'bi-hdd-stack',
      count: 'scopes',
      selectable: false,
      children: [
        {
          id: 'api:third-party',
          kind: 'apiScope',
          label: 'third-party integration',
          icon: 'bi-folder2-open',
          count: '1',
          selectable: false,
          children: [
            { id: 'api:read-events', kind: 'apiScope', label: 'read:events', description: '/thirdParty/events + /thirdParty/files', icon: 'bi-key', selectable: false }
          ]
        },
        {
          id: 'api:aliza',
          kind: 'apiScope',
          label: 'aliza bot',
          icon: 'bi-folder2-open',
          count: '1',
          selectable: false,
          children: [
            { id: 'api:aliza-bug-reports', kind: 'apiScope', label: 'aliza:bug-reports', description: '/admin/aliza/bug-reports', icon: 'bi-key', selectable: false }
          ]
        }
      ]
    }]
  }

  function filterTree(nodes: PermissionTreeNode[], query: string): PermissionTreeNode[] {
    const q = query.trim().toLowerCase()
    if (!q) return nodes
    return nodes.flatMap((node) => {
      const children = filterTree(node.children ?? [], query)
      const haystack = `${node.label} ${node.value ?? ''} ${node.description ?? ''}`.toLowerCase()
      if (haystack.includes(q) || children.length) return [{ ...node, children }]
      return []
    })
  }

  function isNodeSelected(node: PermissionTreeNode) {
    if (!node.value) return false
    if (node.kind === 'profile') return selectedId === node.value
    if (node.kind === 'menu') return selectedMenus.has(node.value)
    if (node.kind === 'orgUnit') return selectedOrgUnits.has(node.value)
    if (node.kind === 'member') return selectedMembers.has(node.value)
    if (node.kind === 'resourceGroup') return selectedGroups.has(node.value)
    if (node.kind === 'camera') return selectedCameras.has(node.value)
    return false
  }

  function selectedChildCount(node: PermissionTreeNode): number {
    return (node.children ?? []).reduce((count, child) => count + (isNodeSelected(child) ? 1 : 0) + selectedChildCount(child), 0)
  }

  function onTreeNodeClick(node: PermissionTreeNode) {
    if (node.kind === 'profile' && node.value) {
      selectedId = node.value
      hydrate(node.value)
      return
    }
    if (node.selectable === false || !node.value) {
      if (node.children?.length) toggleExpanded(node.id)
      return
    }
    if (node.kind === 'menu') toggle('menu', node.value)
    else if (node.kind === 'orgUnit') toggle('ou', node.value)
    else if (node.kind === 'member') toggle('member', node.value)
    else if (node.kind === 'resourceGroup') toggle('group', node.value)
    else if (node.kind === 'camera') toggle('camera', node.value)
  }

  function treeEmptyText() {
    return pickerSearch ? 'No match' : 'No items'
  }

  function iconClass(node: PermissionTreeNode, checked = false) {
    const raw = node.icon ?? ((node.children?.length ?? 0) > 0 ? 'bi-folder2-open' : 'bi-file-earmark-text')
    const normalized = raw.startsWith('bi ') || raw.startsWith('fa ') || raw.startsWith('far ') || raw.startsWith('fas ')
      ? raw
      : `bi ${raw}`
    if (checked) return `${normalized} text-theme`
    if ((node.children?.length ?? 0) > 0 || node.kind === 'section') return `${normalized} text-warning`
    return `${normalized} text-body text-opacity-50`
  }

  function collectExpandableIds(nodes: PermissionTreeNode[]) {
    const ids: string[] = []
    const walk = (items: PermissionTreeNode[]) => {
      for (const node of items) {
        if (node.children?.length) {
          ids.push(node.id)
          walk(node.children)
        }
      }
    }
    walk(nodes)
    return ids
  }

  function setTreeExpanded(nodes: PermissionTreeNode[], expanded: boolean) {
    const affectedIds = new Set(collectExpandableIds(nodes))
    const next = new Set(expandedNodes)
    for (const id of affectedIds) {
      if (expanded) next.add(id)
      else next.delete(id)
    }
    expandedNodes = next
  }

  function resetForm() {
    form = { name: '', description: '', status: true, relation: 'viewer' }
    selectedOrgUnits = new Set()
    selectedMembers = new Set()
    selectedGroups = new Set()
    selectedCameras = new Set()
    selectedMenus = new Set()
    includeOrgUnitChildren = true
    includeResourceGroupChildren = true
  }

  async function loadLookups() {
    const [unitsRes, membersRes, groupsRes, camerasRes] = await Promise.all([
      getOrgUnitsAll(),
      listOrgMembers({ perPage: 500, mode: 'members', sortField: 'firstName', sortOrder: 'asc' }),
      listResourceGroups({ perPage: 500 }),
      listCameras({ perPage: 500 })
    ])
    orgUnits = flattenUnits(unitsRes.data?.details)
    members = itemsFrom<KlynxUser & { userId?: string; orgRole?: string }>(membersRes.data?.details)
    groups = itemsFrom<ResourceGroup>(groupsRes.data?.details)
    cameras = itemsFrom<Camera>(camerasRes.data?.details)

    const lookupError = unitsRes.error ?? membersRes.error ?? groupsRes.error ?? camerasRes.error
    if (lookupError) {
      notify.warning('Permission lookup partially loaded', lookupError.message)
    }
  }

  async function load() {
    loading = true
    errorMsg = ''
    const [menuRes, resourceRes] = await Promise.all([
      listMenuPermissions({ perPage: 250 }),
      listResourcePermissions({ perPage: 250 })
    ])
    loading = false
    if (menuRes.error) errorMsg = menuRes.error.message
    if (resourceRes.error) errorMsg = resourceRes.error.message
    menuRows = menuRes.data?.details?.items ?? []
    resourceRows = resourceRes.data?.details?.items ?? []
    if (!selectedId || !rows.some((r) => r.id === selectedId)) selectedId = rows[0]?.id ?? ''
    if (selectedId) await hydrate(selectedId)
  }

  async function hydrate(id = selectedId) {
    if (!id || activeTab === 'api') return
    detailLoading = true
    createMode = false
    try {
      if (activeTab === 'menu') {
        const { data, error } = await getMenuPermissionDetail(id)
        if (error) throw error
        const d = data?.details
        form = { name: d?.name ?? selected?.name ?? '', description: d?.description ?? selected?.description ?? '', status: d?.status ?? true, relation: relationFrom(d?.relations) }
        selectedOrgUnits = setFrom(d?.orgUnitIds ?? [])
        selectedMembers = setFrom(d?.userIds ?? [])
        selectedGroups = new Set()
        selectedCameras = new Set()
        selectedMenus = setFrom(d?.menuIds ?? [])
        includeOrgUnitChildren = d?.includeOrgUnitChildren ?? true
      } else {
        const { data, error } = await getResourcePermissionDetail(id)
        if (error) throw error
        const d = data?.details
        form = { name: d?.name ?? selected?.name ?? '', description: d?.description ?? selected?.description ?? '', status: d?.status ?? true, relation: relationFrom(d?.relations) }
        selectedOrgUnits = setFrom(d?.orgUnitIds ?? [])
        selectedMembers = setFrom(d?.memberIds ?? [])
        selectedGroups = setFrom(d?.resourceGroupIds ?? [])
        selectedCameras = setFrom(d?.cameraIds ?? [])
        selectedMenus = new Set()
        includeOrgUnitChildren = d?.includeOrgUnitChildren ?? true
        includeResourceGroupChildren = d?.includeResourceGroupChildren ?? true
      }
    } catch (err) {
      notify.warning('Permission detail unavailable', (err as { message?: string })?.message ?? 'Unknown')
    } finally {
      detailLoading = false
    }
  }

  function switchTab(tab: Tab) {
    activeTab = tab
    createMode = false
    selectedId = ''
    resetForm()
    selectedId = rows[0]?.id ?? ''
    if (selectedId) hydrate(selectedId)
  }

  function startCreate() {
    if (activeTab === 'api') return
    selectedId = ''
    createMode = true
    resetForm()
  }

  async function save() {
    if (!form.name.trim()) { notify.warning('Profile name required'); return }
    saving = true
    let savedId = selectedId
    try {
      if (activeTab === 'resource') {
        let id = selectedId
        if (createMode || !id) {
          const created = await createResourcePermission({ name: form.name.trim(), description: form.description, status: form.status, relations: relations() })
          id = created.details.id
        }
        savedId = id
        await updateResourcePermission(id, {
          name: form.name.trim(), description: form.description, status: form.status, relations: relations(),
          orgUnits: [...selectedOrgUnits], memberIds: [...selectedMembers], resourceGroups: [...selectedGroups], cameras: [...selectedCameras],
          resourceDeviceScope: selectedCameras.size ? 'selected' : 'all', includeOrgUnitChildren, includeResourceGroupChildren
        })
      } else if (activeTab === 'menu') {
        let id = selectedId
        if (createMode || !id) {
          const created = await createMenuPermission({ name: form.name.trim(), description: form.description, status: form.status, scopeType: 'orgUnit', menus: menuIds(), relations: relations() })
          id = created.details.id
        }
        savedId = id
        await updateMenuPermission(id, {
          name: form.name.trim(), description: form.description, status: form.status, scopeType: 'orgUnit', menus: menuIds(), relations: relations(),
          orgUnits: [...selectedOrgUnits], userIds: [...selectedMembers], includeOrgUnitChildren
        })
      }
      notify.success('Permission profile saved')
      createMode = false
      selectedId = savedId
      await load()
    } catch (err) {
      notify.error('Save failed', (err as { message?: string })?.message ?? 'Unknown error')
    } finally {
      saving = false
    }
  }

  async function remove() {
    if (!selectedId) return
    try {
      if (activeTab === 'menu') await deleteMenuPermission(selectedId)
      if (activeTab === 'resource') await deleteResourcePermission(selectedId)
      notify.success('Permission profile deleted')
      selectedId = ''
      resetForm()
      await load()
    } catch (err) {
      notify.error('Delete failed', (err as { message?: string })?.message ?? 'Unknown error')
    }
  }

  async function toggleStatus() {
    if (activeTab !== 'menu' || !selectedId) { form.status = !form.status; return }
    await setMenuPermissionStatus(selectedId, !form.status)
    await hydrate(selectedId)
  }

  onMount(async () => {
    const tab = page.url.searchParams.get('tab')
    if (tab === 'menu' || tab === 'resource' || tab === 'api') activeTab = tab
    setPageTitle(`${m.navSystemUsers()} · ${m.navSystemUsersPermissions()}`)
    $appOptions.appContentClass = 'p-0 d-flex flex-column'
    await Promise.all([loadLookups(), load()])
  })

  onDestroy(() => {
    $appOptions.appContentClass = ''
  })
</script>

{#snippet treeView(nodes: PermissionTreeNode[], emptyText: string)}
  {#if nodes.length}
    <div class="file-tree permission-tree">
      {#each nodes as node (node.id)}
        {@render treeNode(node)}
      {/each}
    </div>
  {:else}
    <div class="empty-panel">{emptyText}</div>
  {/if}
{/snippet}

{#snippet treeNode(node: PermissionTreeNode)}
  {@const hasChildren = !!node.children?.length}
  {@const checked = isNodeSelected(node)}
  {@const checkedChildren = selectedChildCount(node)}
  {@const partial = checkedChildren > 0 && !checked}
  <div
    class="file-node permission-file-node"
    class:has-sub={hasChildren}
    class:expand={expandedNodes.has(node.id)}
    class:selected={checked}
    class:partial-selected={partial}
  >
    <div
      class="file-link permission-tree-link"
      class:node-checked={checked}
      class:node-partial={partial}
      class:node-muted={node.selectable === false}
      aria-expanded={hasChildren ? expandedNodes.has(node.id) : undefined}
    >
      <button
        type="button"
        class="file-arrow"
        aria-label={expandedNodes.has(node.id) ? 'Collapse' : 'Expand'}
        disabled={!hasChildren}
        onclick={() => toggleExpanded(node.id)}
      ></button>
      <button type="button" class="file-info permission-tree-hit" onclick={() => onTreeNodeClick(node)}>
        <span class="permission-check" class:checked class:partial>
          {#if checked}
            <i class="bi bi-check2"></i>
          {:else if partial}
            <i class="bi bi-dash"></i>
          {/if}
        </span>
        <span class="file-icon">
          <i class={iconClass(node, checked)}></i>
        </span>
        <span class="file-text min-w-0">
          <span class="file-label text-truncate">{node.label}</span>
          {#if node.description}<small class="file-description text-truncate">{node.description}</small>{/if}
        </span>
        <span class="permission-mini-badges">
          {#if partial}<span class="permission-node-badge muted">{checkedChildren}</span>{/if}
          {#if node.count !== undefined}<span class="permission-node-badge soft">{node.count}</span>{/if}
        </span>
      </button>
    </div>
    {#if hasChildren}
      <div class="file-tree">
        {#each node.children ?? [] as child (child.id)}
          {@render treeNode(child)}
        {/each}
      </div>
    {/if}
  </div>
{/snippet}

<div class="permission-shell">
  <div class="permission-topbar">
    <div class="page-header mb-3 permission-page-header">
      <div>
        <h1 class="page-title">{m.navSystemUsersPermissions()}</h1>
        <p class="page-subtitle">จัดการ Menu, Resource และ API permission profiles ตามรูปแบบ Klynx</p>
      </div>
    </div>

    <nav class="permission-tabs" aria-label="Permission sections">
      <button type="button" class:active={activeTab === 'menu'} onclick={() => switchTab('menu')}><i class="bi bi-list me-1"></i>กำหนดสิทธิ์เข้าถึงเมนูระบบ</button>
      <button type="button" class:active={activeTab === 'api'} onclick={() => switchTab('api')}><i class="bi bi-hdd-stack me-1"></i>API Integrations</button>
      <button type="button" class:active={activeTab === 'resource'} onclick={() => switchTab('resource')}><i class="bi bi-box me-1"></i>กำหนดสิทธิ์เข้าถึงทรัพยากร</button>
    </nav>
  </div>

  {#if errorMsg}<div class="alert alert-danger mx-3 mt-3 mb-0">{errorMsg}</div>{/if}

  <div class="permission-workspace file-manager" id="permissionManager">
    <div class="file-manager-toolbar permission-actionbar">
      <button type="button" class="btn border-0 text-uppercase" onclick={startCreate} disabled={activeTab === 'api'}>
        <i class="bi bi-plus-lg me-1 opacity-5"></i>Profile
      </button>
      <button type="button" class="btn border-0 text-uppercase" onclick={save} disabled={activeTab === 'api' || saving || (!createMode && !selectedId)}>
        {#if saving}<span class="spinner-border spinner-border-sm me-1"></span>{:else}<i class="bi bi-check2-square me-1 opacity-5"></i>{/if}Apply
      </button>
      <button type="button" class="btn border-0 text-uppercase" onclick={remove} disabled={activeTab === 'api' || !selectedId}>
        <i class="bi bi-trash me-1 opacity-5"></i>Delete
      </button>
      <button type="button" class="btn border-0 text-uppercase ms-auto" onclick={load} disabled={loading}>
        <i class="bi bi-arrow-clockwise me-1 opacity-5"></i>Refresh
      </button>
    </div>

    <div class="file-manager-container permission-manager-container">
      <aside class="permission-list file-manager-sidebar">
        <div class="p-3 border-bottom">
          <input class="form-control form-control-sm" bind:value={search} placeholder="Search profiles..." />
        </div>
        <div class="file-manager-sidebar-content permission-sidebar-scroll">
          <div class="p-3">
            {@render treeView(profileTree, activeTab === 'api' ? 'No API nodes' : 'No profiles')}
          </div>
        </div>
        <div class="file-manager-sidebar-footer permission-sidebar-footer">
          <span>{activeTab === 'api' ? 'API' : filteredRows.length}</span>
          <span>{activeTab === 'resource' ? 'resource profiles' : activeTab === 'menu' ? 'menu profiles' : 'integration scopes'}</span>
        </div>
      </aside>

      <main class="permission-editor file-manager-content">
        <div class="permission-editor-heading">
          <div class="min-w-0">
            <div class="text-muted small text-uppercase">{createMode ? 'New permission profile' : selected ? 'Edit permission profile' : activeTab === 'api' ? 'API integrations' : 'No profile selected'}</div>
            <h2 class="text-truncate">{activeTab === 'api' ? 'API Integrations' : form.name || selected?.name || 'Untitled profile'}</h2>
          </div>
          {#if activeTab !== 'api'}
            <button class="btn btn-outline-secondary btn-sm" onclick={toggleStatus} disabled={!createMode && !selectedId}>
              <i class={form.status ? 'bi bi-toggle-on' : 'bi bi-toggle-off'}></i> {form.status ? 'Active' : 'Disabled'}
            </button>
          {/if}
        </div>

        <div class="permission-editor-scroll">
          {#if activeTab !== 'api'}
            <div class="permission-form">
              <div class="field"><label for="perm-profile-name">Name</label><input id="perm-profile-name" class="form-control form-control-sm" bind:value={form.name} /></div>
              <div class="field"><label for="perm-profile-description">Description</label><input id="perm-profile-description" class="form-control form-control-sm" bind:value={form.description} /></div>
              <div class="field"><label for="perm-profile-action">Action</label><select id="perm-profile-action" class="form-select form-select-sm" bind:value={form.relation}><option value="viewer">Read</option><option value="editor">Read / Write</option><option value="creator">Create / Manage</option></select></div>
            </div>
          {/if}

          <input class="form-control form-control-sm picker-search" bind:value={pickerSearch} placeholder="Filter tree..." />

          {#if activeTab === 'menu'}
            <div class="permission-tree-stage">
              <section class="permission-tree-panel primary-tree-panel">
                <header>
                  <span><i class="bi bi-list text-theme me-2"></i>Menu tree</span>
                  <span class="permission-tree-tools">
                    <button type="button" title="Expand tree" onclick={() => setTreeExpanded(menuTree, true)}><i class="bi bi-arrows-expand"></i></button>
                    <button type="button" title="Collapse tree" onclick={() => setTreeExpanded(menuTree, false)}><i class="bi bi-arrows-collapse"></i></button>
                    <span class="permission-node-badge">{selectedMenus.size}</span>
                  </span>
                </header>
                <div class="permission-tree-body">
                  {@render treeView(menuTree, treeEmptyText())}
                </div>
              </section>

              <section class="permission-tree-panel">
                <header>
                  <span><i class="bi bi-diagram-3 text-theme me-2"></i>Scope tree</span>
                  <span class="permission-tree-tools">
                    <button type="button" title="Expand tree" onclick={() => setTreeExpanded(audienceTree, true)}><i class="bi bi-arrows-expand"></i></button>
                    <button type="button" title="Collapse tree" onclick={() => setTreeExpanded(audienceTree, false)}><i class="bi bi-arrows-collapse"></i></button>
                    <label class="form-check tree-toggle">
                      <input class="form-check-input" type="checkbox" bind:checked={includeOrgUnitChildren} />
                      <span>Child units</span>
                    </label>
                  </span>
                </header>
                <div class="permission-tree-body">
                  {@render treeView(audienceTree, treeEmptyText())}
                </div>
              </section>
            </div>
          {:else if activeTab === 'resource'}
            <div class="permission-tree-stage">
              <section class="permission-tree-panel">
                <header>
                  <span><i class="bi bi-diagram-3 text-theme me-2"></i>Source tree</span>
                  <span class="permission-tree-tools">
                    <button type="button" title="Expand tree" onclick={() => setTreeExpanded(audienceTree, true)}><i class="bi bi-arrows-expand"></i></button>
                    <button type="button" title="Collapse tree" onclick={() => setTreeExpanded(audienceTree, false)}><i class="bi bi-arrows-collapse"></i></button>
                    <label class="form-check tree-toggle">
                      <input class="form-check-input" type="checkbox" bind:checked={includeOrgUnitChildren} />
                      <span>Child units</span>
                    </label>
                  </span>
                </header>
                <div class="permission-tree-body">
                  {@render treeView(audienceTree, treeEmptyText())}
                </div>
              </section>

              <section class="permission-tree-panel primary-tree-panel">
                <header>
                  <span><i class="bi bi-folder2-open text-theme me-2"></i>Resource tree</span>
                  <span class="permission-tree-tools">
                    <button type="button" title="Expand tree" onclick={() => setTreeExpanded(resourceTree, true)}><i class="bi bi-arrows-expand"></i></button>
                    <button type="button" title="Collapse tree" onclick={() => setTreeExpanded(resourceTree, false)}><i class="bi bi-arrows-collapse"></i></button>
                    <label class="form-check tree-toggle">
                      <input class="form-check-input" type="checkbox" bind:checked={includeResourceGroupChildren} />
                      <span>Child groups</span>
                    </label>
                  </span>
                </header>
                <div class="permission-tree-body">
                  {@render treeView(resourceTree, treeEmptyText())}
                </div>
              </section>
            </div>
          {:else}
            <div class="permission-tree-stage api-tree-stage">
              <section class="permission-tree-panel primary-tree-panel">
                <header>
                  <span><i class="bi bi-hdd-stack text-theme me-2"></i>API tree</span>
                  <span class="permission-tree-tools">
                    <button type="button" title="Expand tree" onclick={() => setTreeExpanded(apiTree, true)}><i class="bi bi-arrows-expand"></i></button>
                    <button type="button" title="Collapse tree" onclick={() => setTreeExpanded(apiTree, false)}><i class="bi bi-arrows-collapse"></i></button>
                    <span class="permission-node-badge">read-only</span>
                  </span>
                </header>
                <div class="permission-tree-body">
                  {@render treeView(apiTree, treeEmptyText())}
                </div>
              </section>
            </div>
          {/if}

          <div class="permission-summary">
            <span><b>{activeTab === 'api' ? 'Scopes' : relationLabel()}</b></span>
            {#if activeTab === 'menu'}
              <span>Menus <b>{selectedMenus.size}</b></span>
              <span>Org units <b>{selectedOrgUnits.size}</b></span>
              <span>Users <b>{selectedMembers.size || 'All'}</b></span>
            {:else if activeTab === 'resource'}
              <span>Org units <b>{selectedOrgUnits.size}</b></span>
              <span>Users <b>{selectedMembers.size || 'All'}</b></span>
              <span>Resource groups <b>{selectedGroups.size}</b></span>
              <span>Devices <b>{selectedCameras.size || 'All'}</b></span>
            {:else}
              <span>Integrations <b>service-account</b></span>
            {/if}
            {#if detailLoading}<span class="ms-auto"><span class="spinner-border spinner-border-sm me-1"></span>Loading detail</span>{/if}
          </div>
        </div>
      </main>
    </div>
  </div>
</div>

<style lang="scss">
  .permission-shell {
    height: 100%;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }

  .permission-topbar {
    flex: 0 0 auto;
    padding: .75rem 1.5rem 0;
    border-bottom: 1px solid rgba(var(--bs-border-color-rgb), .42);
    background: rgba(var(--bs-body-bg-rgb), .96);
    backdrop-filter: blur(10px);
  }

  .permission-page-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
    margin-bottom: .5rem !important;
  }

  .permission-page-header { align-items: flex-start; }
  .page-title { font-size: 1.25rem; margin: 0; }
  .page-subtitle { color: rgba(var(--bs-body-color-rgb), .58); margin: .25rem 0 0; }
  .permission-tabs { display: flex; flex-wrap: wrap; gap: 1rem; margin-bottom: 1rem; border-bottom: 1px solid rgba(var(--bs-border-color-rgb), .55); padding-bottom: 0; }
  .permission-tabs button { border: 0; border-bottom: 2px solid transparent; background: transparent; color: rgba(var(--bs-body-color-rgb), .62); border-radius: 0; padding: .7rem .25rem .75rem; }
  .permission-tabs button.active { border-bottom-color: var(--bs-theme); color: var(--bs-theme); background: transparent; }

  .permission-workspace {
    flex: 1 1 auto;
    min-height: 0;
    --bs-file-manager-sidebar-width: 26rem;
    border-top: 1px solid rgba(var(--bs-border-color-rgb), .5);
  }

  .permission-manager-container { min-height: 0; }
  .permission-actionbar { flex: 0 0 auto; background: rgba(18, 18, 22, .72); }
  .permission-list, .permission-editor, .permission-tree-panel { border: 0; background: transparent; border-radius: 0; }
  .permission-list { background: rgba(18, 18, 22, .72); }
  .permission-editor { flex: 1 1 auto; min-width: 0; background: rgba(18, 18, 22, .34); }
  .permission-list, .permission-editor { padding: 0; min-height: 0; }
  .permission-sidebar-scroll { overflow: auto; }
  .permission-sidebar-footer { display: flex; justify-content: space-between; gap: .75rem; color: rgba(var(--bs-body-color-rgb), .58); font-size: .72rem; text-transform: uppercase; letter-spacing: 0; }

  .permission-editor-heading, .permission-summary {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    flex-wrap: wrap;
  }

  .permission-editor-heading {
    border-bottom: 1px solid rgba(var(--bs-border-color-rgb), .55);
    padding: 1rem 1.25rem;
    background: rgba(18, 18, 22, .72);
  }

  .permission-editor-heading h2 { font-size: 1.25rem; margin: 0; }
  .permission-editor-scroll { padding: 1rem 1.25rem; }
  .permission-form { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: .75rem; margin: 0 0 1rem; }
  .field label { display: block; font-size: .7rem; font-weight: 700; text-transform: uppercase; color: rgba(var(--bs-body-color-rgb), .62); margin-bottom: .35rem; }
  .picker-search { margin-bottom: 1rem; }

  .permission-tree-stage {
    display: grid;
    grid-template-columns: minmax(22rem, 1fr) minmax(22rem, 1fr);
    border: 1px solid rgba(var(--bs-border-color-rgb), .46);
    border-radius: .35rem;
    overflow: hidden;
    background: rgba(10, 12, 16, .24);
    min-height: 28rem;
  }

  .api-tree-stage { grid-template-columns: 1fr; }

  .permission-tree-panel {
    min-width: 0;
    min-height: 28rem;
    border-left: 1px solid rgba(var(--bs-border-color-rgb), .38);
    display: flex;
    flex-direction: column;
  }

  .permission-tree-panel:first-child { border-left: 0; }
  .primary-tree-panel { background: rgba(var(--bs-theme-rgb), .025); }

  .permission-tree-panel header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: .75rem;
    font-weight: 700;
    margin: 0;
    padding: .8rem 1rem;
    border-bottom: 1px solid rgba(var(--bs-border-color-rgb), .36);
    background: rgba(255, 255, 255, .025);
  }

  .permission-tree-body {
    flex: 1 1 auto;
    min-height: 0;
    overflow: auto;
    padding: 1rem;
  }

  .tree-toggle {
    display: inline-flex;
    align-items: center;
    gap: .35rem;
    margin: 0;
    color: rgba(var(--bs-body-color-rgb), .68);
    font-size: .76rem;
    font-weight: 600;
  }

  .permission-tree-tools {
    display: inline-flex;
    align-items: center;
    justify-content: flex-end;
    gap: .35rem;
    min-width: 0;
  }

  .permission-tree-tools > button {
    width: 1.65rem;
    height: 1.65rem;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px solid rgba(var(--bs-border-color-rgb), .5);
    border-radius: .25rem;
    background: rgba(255, 255, 255, .035);
    color: rgba(var(--bs-body-color-rgb), .72);
  }

  .permission-tree-tools > button:hover {
    border-color: rgba(var(--bs-theme-rgb), .5);
    color: var(--bs-theme);
  }

  .empty-panel { border: 1px dashed rgba(var(--bs-border-color-rgb), .8); border-radius: .35rem; color: rgba(var(--bs-body-color-rgb), .55); padding: 1rem; text-align: center; }
  .permission-summary { border-top: 1px solid rgba(var(--bs-theme-rgb), .24); margin-top: 1rem; padding-top: .85rem; color: rgba(var(--bs-body-color-rgb), .7); }
  .permission-mini-badges {
    display: inline-flex;
    align-items: center;
    gap: .25rem;
    flex: 0 0 auto;
  }

  .permission-node-badge {
    min-width: 1.25rem;
    height: 1.25rem;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: .15rem;
    border-radius: .25rem;
    padding-inline: .35rem;
    background: rgba(var(--bs-theme-rgb), .2);
    color: var(--bs-theme);
    font-size: .7rem;
    font-weight: 700;
    line-height: 1;
  }

  .permission-node-badge.soft {
    background: rgba(255, 255, 255, .075);
    color: rgba(var(--bs-body-color-rgb), .62);
  }

  .permission-node-badge.muted {
    background: rgba(255, 255, 255, .08);
    color: rgba(var(--bs-body-color-rgb), .68);
  }

  .permission-tree .file-node {
    padding-inline-start: 1.1rem;
  }

  .permission-tree .file-link.permission-tree-link {
    width: 100%;
    border: 0;
    background: transparent;
    color: rgba(var(--bs-body-color-rgb), .84);
    text-align: left;
    align-items: center;
    min-height: 2.15rem;
    padding: .2rem .35rem;
    border-radius: .25rem;
  }

  .permission-tree .permission-tree-hit,
  .permission-tree .file-arrow {
    border: 0;
    background: transparent;
    color: inherit;
    padding: 0;
  }

  .permission-tree .permission-tree-hit {
    display: flex;
    flex: 1;
    align-items: center;
    gap: .45rem;
    min-width: 0;
    text-align: left;
    min-height: 1.85rem;
  }

  .permission-tree .file-arrow {
    width: 1rem;
    min-width: 1rem;
    align-self: center;
    height: 1.85rem;
  }

  .permission-tree .file-arrow:disabled {
    opacity: 1;
  }

  .permission-tree .file-link.permission-tree-link:hover {
    background: rgba(255, 255, 255, .055);
    opacity: 1;
  }

  .permission-tree .file-link.node-checked {
    background: rgba(var(--bs-theme-rgb), .13);
    box-shadow: inset 3px 0 0 rgba(var(--bs-theme-rgb), .85);
    color: var(--bs-theme);
    font-weight: 700;
  }

  .permission-tree .file-link.node-partial {
    background: rgba(var(--bs-theme-rgb), .06);
    box-shadow: inset 3px 0 0 rgba(var(--bs-theme-rgb), .35);
  }

  .permission-tree .file-link.node-muted {
    color: rgba(var(--bs-body-color-rgb), .7);
  }

  .permission-tree .file-info {
    min-width: 0;
    align-items: center;
  }

  .permission-tree .file-icon {
    margin-top: 0;
  }

  .permission-tree .file-text {
    display: grid;
    min-width: 0;
  }

  .permission-tree .file-label {
    min-width: 0;
    line-height: 1.25;
  }

  .permission-tree .file-description {
    color: rgba(var(--bs-body-color-rgb), .46);
    font-size: .72rem;
    font-weight: 500;
  }

  .permission-check {
    width: 1rem;
    height: 1rem;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
    border: 1px solid rgba(var(--bs-border-color-rgb), .75);
    border-radius: .25rem;
    background: rgba(255, 255, 255, .035);
    color: var(--bs-theme);
    font-size: .8rem;
  }

  .permission-check.checked {
    border-color: rgba(var(--bs-theme-rgb), .8);
    background: rgba(var(--bs-theme-rgb), .18);
  }

  .permission-check.partial {
    border-color: rgba(var(--bs-theme-rgb), .52);
    background: rgba(var(--bs-theme-rgb), .08);
  }

  .permission-shell .permission-tabs {
    margin-bottom: 0;
    border-bottom: 0;
  }

  .permission-shell .permission-workspace { flex: 1 1 auto; min-height: 0; padding: 0; overflow: hidden; }

  .permission-shell .permission-list,
  .permission-shell .permission-editor {
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .permission-editor-scroll { flex: 1 1 auto; min-height: 0; overflow: auto; }

  @media (max-width: 1199.98px) {
    .permission-tree-stage, .permission-form { grid-template-columns: 1fr; }
    .permission-tree-panel { border-left: 0; border-top: 1px solid rgba(var(--bs-border-color-rgb), .38); }
    .permission-tree-panel:first-child { border-top: 0; }
  }

  @media (max-width: 767.98px) {
    .permission-page-header { flex-direction: column; }
    .permission-topbar { padding-inline: .75rem; }
    .permission-editor-scroll { padding: .75rem; }
  }
</style>
