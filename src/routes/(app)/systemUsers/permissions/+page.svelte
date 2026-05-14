<!-- src/routes/(app)/systemUsers/permissions/+page.svelte -->
<script lang="ts">
  import { onDestroy, onMount } from 'svelte'
  import { page } from '$app/state'
  import { setPageTitle } from '$lib/utils/title'
  import { appOptions } from '$lib/stores/appOptions'
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

  type Tab = 'resource' | 'menu' | 'api'
  type Relation = 'viewer' | 'editor' | 'creator'
  type Row = (MenuPermission | ResourcePermission) & { id: string }

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
  let form = $state({ name: '', description: '', status: true, relation: 'viewer' as Relation, menuIdsText: '' })
  let selectedOrgUnits = $state<Set<string>>(new Set())
  let selectedMembers = $state<Set<string>>(new Set())
  let selectedGroups = $state<Set<string>>(new Set())
  let selectedCameras = $state<Set<string>>(new Set())
  let includeOrgUnitChildren = $state(true)
  let includeResourceGroupChildren = $state(true)
  let createMode = $state(false)

  const rows = $derived<Row[]>(activeTab === 'menu' ? menuRows : activeTab === 'resource' ? resourceRows : [])
  const selected = $derived(rows.find((x) => x.id === selectedId))
  const filteredRows = $derived(rows.filter((x) => `${x.name ?? ''} ${x.description ?? ''} ${x.id}`.toLowerCase().includes(search.toLowerCase())))
  const filteredUnits = $derived(orgUnits.filter((x) => `${x.name} ${x.description ?? ''}`.toLowerCase().includes(pickerSearch.toLowerCase())))
  const filteredMembers = $derived(members.filter((x) => `${displayName(x)} ${x.email ?? ''}`.toLowerCase().includes(pickerSearch.toLowerCase())))
  const filteredGroups = $derived(groups.filter((x) => `${x.name} ${x.description ?? ''}`.toLowerCase().includes(pickerSearch.toLowerCase())))
  const filteredCameras = $derived(cameras.filter((x) => `${x.name} ${x.description ?? ''} ${x.camId ?? ''}`.toLowerCase().includes(pickerSearch.toLowerCase())))

  function idOfUser(row: KlynxUser & { userId?: string }) { return row.userId ?? row.id }
  function displayName(row: KlynxUser) { return row.fullName || `${row.firstName ?? ''} ${row.lastName ?? ''}`.trim() || row.username || row.email || row.id }
  function cameraId(row: Camera) { return row.camId ?? row.id }
  function unitDepth(row: OrgUnit) { let d = 0; let p = row.parentId; while (p && d < 8) { d++; p = orgUnits.find((u) => u.id === p)?.parentId } return d }
  function relations(): Relation[] { return form.relation === 'creator' ? ['viewer', 'editor', 'creator'] : form.relation === 'editor' ? ['viewer', 'editor'] : ['viewer'] }
  function relationFrom(values?: string[]) { return values?.includes('creator') ? 'creator' : values?.includes('editor') ? 'editor' : 'viewer' }
  function relationLabel() { return form.relation === 'creator' ? 'Create / Manage' : form.relation === 'editor' ? 'Read / Write' : 'Read' }
  function menuIds() { return form.menuIdsText.split(',').map((x) => x.trim()).filter(Boolean) }
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
  function childCount<T extends { parentId?: string }>(items: T[], parentId: string) {
    return items.filter((item) => item.parentId === parentId).length
  }

  function flattenUnits(items: OrgUnit[]): OrgUnit[] {
    const out: OrgUnit[] = []
    const walk = (list: OrgUnit[]) => {
      for (const item of list) {
        out.push(item)
        const children = (item as OrgUnit & { children?: OrgUnit[] }).children ?? []
        if (children.length) walk(children)
      }
    }
    walk(items)
    return out
  }

  function toggle(setName: 'ou' | 'member' | 'group' | 'camera', id: string) {
    const source = setName === 'ou' ? selectedOrgUnits : setName === 'member' ? selectedMembers : setName === 'group' ? selectedGroups : selectedCameras
    const next = new Set(source)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    if (setName === 'ou') selectedOrgUnits = next
    else if (setName === 'member') selectedMembers = next
    else if (setName === 'group') selectedGroups = next
    else selectedCameras = next
  }

  function resetForm() {
    form = { name: '', description: '', status: true, relation: 'viewer', menuIdsText: '' }
    selectedOrgUnits = new Set()
    selectedMembers = new Set()
    selectedGroups = new Set()
    selectedCameras = new Set()
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
    orgUnits = flattenUnits((unitsRes.data?.details as OrgUnit[] | undefined) ?? [])
    members = membersRes.data?.details?.items ?? []
    groups = groupsRes.data?.details?.items ?? []
    cameras = camerasRes.data?.details?.items ?? []
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
        form = { name: d?.name ?? selected?.name ?? '', description: d?.description ?? selected?.description ?? '', status: d?.status ?? true, relation: relationFrom(d?.relations), menuIdsText: (d?.menuIds ?? []).join(', ') }
        selectedOrgUnits = setFrom(d?.orgUnitIds ?? [])
        selectedMembers = setFrom(d?.userIds ?? [])
        selectedGroups = new Set()
        selectedCameras = new Set()
        includeOrgUnitChildren = d?.includeOrgUnitChildren ?? true
      } else {
        const { data, error } = await getResourcePermissionDetail(id)
        if (error) throw error
        const d = data?.details
        form = { name: d?.name ?? selected?.name ?? '', description: d?.description ?? selected?.description ?? '', status: d?.status ?? true, relation: relationFrom(d?.relations), menuIdsText: '' }
        selectedOrgUnits = setFrom(d?.orgUnitIds ?? [])
        selectedMembers = setFrom(d?.memberIds ?? [])
        selectedGroups = setFrom(d?.resourceGroupIds ?? [])
        selectedCameras = setFrom(d?.cameraIds ?? [])
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
    try {
      if (activeTab === 'resource') {
        let id = selectedId
        if (createMode || !id) {
          const created = await createResourcePermission({ name: form.name.trim(), description: form.description, status: form.status, relations: relations() })
          id = created.details.id
        }
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
        await updateMenuPermission(id, {
          name: form.name.trim(), description: form.description, status: form.status, scopeType: 'orgUnit', menus: menuIds(), relations: relations(),
          orgUnits: [...selectedOrgUnits], userIds: [...selectedMembers], includeOrgUnitChildren
        })
      }
      notify.success('Permission profile saved')
      createMode = false
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

<div class="permission-shell">
  <div class="permission-topbar">
    <div class="page-header mb-3 permission-page-header">
      <div>
        <h1 class="page-title">{m.navSystemUsersPermissions()}</h1>
        <p class="page-subtitle">จัดการ Menu, Resource และ API permission profiles ตามรูปแบบ Klynx</p>
      </div>
      <div class="d-flex gap-2">
        <button class="btn btn-outline-theme btn-sm" onclick={load} disabled={loading}><i class="bi bi-arrow-clockwise me-1"></i>Refresh</button>
      </div>
    </div>

    <nav class="permission-tabs" aria-label="Permission sections">
      <button type="button" class:active={activeTab === 'menu'} onclick={() => switchTab('menu')}><i class="bi bi-list me-1"></i>กำหนดสิทธิ์เข้าถึงเมนูระบบ</button>
      <button type="button" class:active={activeTab === 'api'} onclick={() => switchTab('api')}><i class="bi bi-hdd-stack me-1"></i>API Integrations</button>
      <button type="button" class:active={activeTab === 'resource'} onclick={() => switchTab('resource')}><i class="bi bi-box me-1"></i>กำหนดสิทธิ์เข้าถึงทรัพยากร</button>
    </nav>
  </div>

  {#if errorMsg}<div class="alert alert-danger mx-3 mt-3 mb-0">{errorMsg}</div>{/if}

  <div class="permission-workspace file-manager">
  <aside class="permission-list file-manager-sidebar">
    <div class="permission-list-title mb-3">
      <span>{activeTab === 'resource' ? 'Resource profiles' : activeTab === 'menu' ? 'Menu profiles' : 'API permissions'}</span>
      <span class="d-flex align-items-center gap-2">
        <span class="badge bg-theme text-black">{filteredRows.length}</span>
        <button class="btn btn-theme btn-sm" onclick={startCreate} disabled={activeTab === 'api'}><i class="bi bi-plus-lg me-1"></i>สร้างใหม่</button>
      </span>
    </div>
    <input class="form-control form-control-sm mb-3" bind:value={search} placeholder="Search profiles..." />
    {#if activeTab === 'api'}
      <div class="empty-panel">API permission management is read-only in this view.</div>
    {:else}
      <div class="permission-stack">
        {#each filteredRows as row (row.id)}
          <button type="button" class="permission-row" class:active={selectedId === row.id} onclick={() => { selectedId = row.id; hydrate(row.id) }}>
            <span class="permission-status" class:on={(row as ResourcePermission).status !== false}></span>
            <span class="min-w-0"><b class="d-block text-truncate">{row.name || row.id}</b><small class="d-block text-truncate text-muted">{row.description || row.id}</small></span>
            <span class="permission-mini-badges ms-auto">
              {#if rowSelectedCount(row) > 0}<span class="permission-node-badge">{rowSelectedCount(row)}</span>{/if}
              <span class="badge bg-secondary-subtle text-body">{(row as ResourcePermission).status === false ? 'off' : 'on'}</span>
            </span>
          </button>
        {:else}
          <div class="empty-panel">No profiles yet.</div>
        {/each}
      </div>
    {/if}
  </aside>

  <main class="permission-editor file-manager-content">
    {#if activeTab === 'api'}
      <div class="empty-panel h-100 d-flex align-items-center justify-content-center">API permissions are separated from Menu and Resource profiles, matching the Klynx permission model.</div>
    {:else}
      <div class="permission-toolbar file-manager-toolbar">
        <div><div class="text-muted small text-uppercase">{createMode ? 'New permission profile' : selected ? 'Edit permission profile' : 'No profile selected'}</div><h2>{form.name || selected?.name || 'Untitled profile'}</h2></div>
        <div class="d-flex gap-2">
          <button class="btn btn-outline-secondary btn-sm" onclick={toggleStatus}><i class={form.status ? 'bi bi-toggle-on' : 'bi bi-toggle-off'}></i> {form.status ? 'Active' : 'Disabled'}</button>
          {#if selectedId}<button class="btn btn-outline-danger btn-sm" aria-label="Delete profile" title="Delete profile" onclick={remove}><i class="bi bi-trash"></i></button>{/if}
          <button class="btn btn-theme btn-sm" onclick={save} disabled={saving}>{#if saving}<span class="spinner-border spinner-border-sm me-1"></span>{/if}Apply</button>
        </div>
      </div>

      <div class="permission-editor-scroll">
        <div class="permission-form">
          <div class="field"><label for="perm-profile-name">Name</label><input id="perm-profile-name" class="form-control form-control-sm" bind:value={form.name} /></div>
          <div class="field"><label for="perm-profile-description">Description</label><input id="perm-profile-description" class="form-control form-control-sm" bind:value={form.description} /></div>
          <div class="field"><label for="perm-profile-action">Action</label><select id="perm-profile-action" class="form-select form-select-sm" bind:value={form.relation}><option value="viewer">Read</option><option value="editor">Read / Write</option><option value="creator">Create / Manage</option></select></div>
          {#if activeTab === 'menu'}<div class="field field-wide"><label for="perm-menu-ids">Menu IDs</label><input id="perm-menu-ids" class="form-control form-control-sm font-monospace" bind:value={form.menuIdsText} placeholder="dashboard, systemUsers, ingest.events" /></div>{/if}
        </div>

        <input class="form-control form-control-sm picker-search" bind:value={pickerSearch} placeholder="Filter org units, users, resource groups, devices..." />

      <div class="permission-grid">
        <section class="permission-card">
          <header><span><i class="bi bi-diagram-3 text-theme me-2"></i>Source org units</span><span class="badge bg-theme text-black">{selectedOrgUnits.size}</span></header>
          <label class="form-check small mb-2"><input class="form-check-input" type="checkbox" bind:checked={includeOrgUnitChildren} /> Include child units</label>
          <div class="choice-list">{#each filteredUnits as unit (unit.id)}{@const selectedUnder = selectedDescendantCount(orgUnits, unit.id, selectedOrgUnits)}<button type="button" class="choice-row" class:selected={selectedOrgUnits.has(unit.id)} class:has-child-selection={selectedUnder > 0 && !selectedOrgUnits.has(unit.id)} style={`padding-left:${0.75 + unitDepth(unit) * 1.15}rem`} onclick={() => toggle('ou', unit.id)}><i class={selectedOrgUnits.has(unit.id) ? 'bi bi-check-square-fill text-theme' : 'bi bi-square'}></i><i class="bi bi-folder2-open text-theme"></i><span class="text-truncate">{unit.name}</span><span class="permission-mini-badges ms-auto">{#if childCount(orgUnits, unit.id) > 0}<span class="permission-node-badge muted">{childCount(orgUnits, unit.id)}</span>{/if}{#if selectedUnder > 0}<span class="permission-node-badge"><i class="bi bi-check2"></i>{selectedUnder}</span>{/if}{#if selectedOrgUnits.has(unit.id) && selectedMembers.size > 0}<span class="permission-node-badge warn"><i class="bi bi-person"></i>{selectedMembers.size}</span>{/if}</span></button>{:else}<div class="empty-panel">No org units</div>{/each}</div>
        </section>

        <section class="permission-card">
          <header><span><i class="bi bi-people text-theme me-2"></i>Narrow users</span><span class="badge bg-theme text-black">{selectedMembers.size || 'All'}</span></header>
          <div class="text-muted small mb-2">No user selected means all members in selected org units.</div>
          <div class="choice-list">{#each filteredMembers as member (idOfUser(member))}<button type="button" class="choice-row" class:selected={selectedMembers.has(idOfUser(member))} onclick={() => toggle('member', idOfUser(member))}><i class={selectedMembers.has(idOfUser(member)) ? 'bi bi-check-square-fill text-theme' : 'bi bi-square'}></i><i class="bi bi-person"></i><span class="text-truncate">{displayName(member)}</span>{#if selectedMembers.has(idOfUser(member))}<span class="permission-node-badge ms-auto">เลือกแล้ว</span>{/if}</button>{:else}<div class="empty-panel">No users</div>{/each}</div>
        </section>

        {#if activeTab === 'resource'}
          <section class="permission-card">
            <header><span><i class="bi bi-folder2-open text-theme me-2"></i>Destination groups</span><span class="badge bg-theme text-black">{selectedGroups.size}</span></header>
            <label class="form-check small mb-2"><input class="form-check-input" type="checkbox" bind:checked={includeResourceGroupChildren} /> Include child groups</label>
            <div class="choice-list">{#each filteredGroups as group (group.id)}{@const selectedUnder = selectedDescendantCount(groups, group.id, selectedGroups)}<button type="button" class="choice-row" class:selected={selectedGroups.has(group.id)} class:has-child-selection={selectedUnder > 0 && !selectedGroups.has(group.id)} onclick={() => toggle('group', group.id)}><i class={selectedGroups.has(group.id) ? 'bi bi-check-square-fill text-theme' : 'bi bi-square'}></i><i class="bi bi-folder2-open text-theme"></i><span class="text-truncate">{group.name}</span><span class="permission-mini-badges ms-auto">{#if childCount(groups, group.id) > 0}<span class="permission-node-badge muted">{childCount(groups, group.id)}</span>{/if}{#if selectedUnder > 0}<span class="permission-node-badge warn"><i class="bi bi-check2"></i>{selectedUnder}</span>{/if}{#if selectedGroups.has(group.id) && selectedCameras.size > 0}<span class="permission-node-badge"><i class="bi bi-camera"></i>{selectedCameras.size}</span>{/if}</span></button>{:else}<div class="empty-panel">No resource groups</div>{/each}</div>
          </section>

          <section class="permission-card">
            <header><span><i class="bi bi-camera-video text-theme me-2"></i>Specific devices</span><span class="badge bg-theme text-black">{selectedCameras.size || 'All'}</span></header>
            <div class="text-muted small mb-2">Leave empty to allow every device in selected resource groups.</div>
            <div class="choice-list">{#each filteredCameras as camera (cameraId(camera))}<button type="button" class="choice-row" class:selected={selectedCameras.has(cameraId(camera))} onclick={() => toggle('camera', cameraId(camera))}><i class={selectedCameras.has(cameraId(camera)) ? 'bi bi-check-square-fill text-theme' : 'bi bi-square'}></i><i class="bi bi-camera"></i><span class="text-truncate">{camera.name}</span>{#if selectedCameras.has(cameraId(camera))}<span class="permission-node-badge ms-auto">เลือกแล้ว</span>{/if}</button>{:else}<div class="empty-panel">No devices</div>{/each}</div>
          </section>
        {/if}
      </div>

        <div class="permission-summary"><span><b>{relationLabel()}</b></span><span>Org units <b>{selectedOrgUnits.size}</b></span><span>Users <b>{selectedMembers.size || 'All'}</b></span>{#if activeTab === 'resource'}<span>Resource groups <b>{selectedGroups.size}</b></span><span>Devices <b>{selectedCameras.size || 'All'}</b></span>{/if}{#if detailLoading}<span class="ms-auto"><span class="spinner-border spinner-border-sm me-1"></span>Loading detail</span>{/if}</div>
      </div>
    {/if}
  </main>
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
  .permission-list-title { display: flex; align-items: center; justify-content: space-between; font-weight: 700; color: rgba(var(--bs-body-color-rgb), .82); padding: 1rem 1rem .75rem; margin: 0 !important; border-bottom: 1px solid rgba(var(--bs-border-color-rgb), .55); }
  .permission-workspace { flex: 1 1 auto; min-height: 0; display: flex; overflow: hidden; border-top: 1px solid rgba(var(--bs-border-color-rgb), .5); }
  .permission-list, .permission-editor, .permission-card { border: 0; background: transparent; border-radius: 0; }
  .permission-list { width: 25rem; min-width: 25rem; border-right: 1px solid rgba(var(--bs-border-color-rgb), .55); background: rgba(18, 18, 22, .72); }
  .permission-editor { flex: 1 1 auto; min-width: 0; background: rgba(18, 18, 22, .34); }
  .permission-list, .permission-editor { padding: 0; min-height: 0; }
  .permission-list > :global(input), .permission-list > input { margin: 1rem; width: calc(100% - 2rem); }
  .permission-stack, .choice-list { display: grid; align-content: start; gap: .15rem; max-height: none; overflow: auto; padding: .75rem 1rem 1rem; }
  .permission-row, .choice-row { width: 100%; min-height: 2rem; border: 0; background: transparent; color: rgba(var(--bs-body-color-rgb), .82); border-radius: .25rem; padding: .35rem .55rem; display: flex; align-items: center; gap: .45rem; text-align: left; font-size: .86rem; }
  .permission-row:hover, .choice-row:hover { background: rgba(255, 255, 255, .055); }
  .permission-row.active, .choice-row.selected { border: 1px solid rgba(var(--bs-theme-rgb), .56); background: rgba(var(--bs-theme-rgb), .13); box-shadow: inset 3px 0 0 rgba(var(--bs-theme-rgb), .85); color: var(--bs-theme); font-weight: 700; }
  .choice-row.has-child-selection:not(.selected) { background: rgba(var(--bs-theme-rgb), .055); color: rgba(var(--bs-body-color-rgb), .9); }
  .permission-status { width: .55rem; height: .55rem; border-radius: 50%; background: var(--bs-secondary); box-shadow: 0 0 0 .2rem rgba(var(--bs-secondary-rgb), .12); }
  .permission-status.on { background: var(--bs-theme); box-shadow: 0 0 0 .2rem rgba(var(--bs-theme-rgb), .15); }
  .permission-toolbar, .permission-summary { display: flex; align-items: center; justify-content: space-between; gap: 1rem; flex-wrap: wrap; }
  .permission-toolbar h2 { font-size: 1.25rem; margin: 0; }
  .permission-toolbar { border-bottom: 1px solid rgba(var(--bs-border-color-rgb), .55); padding: 1rem 1.25rem; background: rgba(18, 18, 22, .72); }
  .permission-editor-scroll { padding: 1rem 1.25rem; }
  .permission-form { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: .75rem; margin: 0 0 1rem; }
  .field-wide { grid-column: 1 / -1; }
  .field label { display: block; font-size: .7rem; font-weight: 700; text-transform: uppercase; color: rgba(var(--bs-body-color-rgb), .62); margin-bottom: .35rem; }
  .picker-search { margin-bottom: 1rem; }
  .permission-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); border: 1px solid rgba(var(--bs-border-color-rgb), .46); border-radius: .35rem; overflow: hidden; background: rgba(10, 12, 16, .24); }
  .permission-card { padding: 0; min-height: 15rem; border-left: 1px solid rgba(var(--bs-border-color-rgb), .38); border-top: 1px solid rgba(var(--bs-border-color-rgb), .38); }
  .permission-card:nth-child(odd) { border-left: 0; }
  .permission-card:nth-child(-n + 2) { border-top: 0; }
  .permission-card header { display: flex; align-items: center; justify-content: space-between; gap: .75rem; font-weight: 700; margin: 0; padding: .8rem 1rem; border-bottom: 1px solid rgba(var(--bs-border-color-rgb), .36); background: rgba(255, 255, 255, .025); }
  .permission-card .form-check,
  .permission-card .text-muted { margin: .65rem 1rem .25rem; }
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

  .permission-node-badge.warn {
    background: rgba(255, 193, 7, .18);
    color: #ffc107;
  }

  .permission-node-badge.muted {
    background: rgba(255, 255, 255, .08);
    color: rgba(var(--bs-body-color-rgb), .68);
  }

  .choice-list {
    position: relative;
  }

  .choice-list .choice-row {
    position: relative;
  }

  .choice-list .choice-row::before {
    content: '';
    position: absolute;
    top: 50%;
    left: .2rem;
    width: .55rem;
    border-top: 1px solid rgba(var(--bs-body-color-rgb), .16);
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

  .permission-shell .permission-stack {
    flex: 1 1 auto;
    min-height: 0;
    max-height: none;
    align-content: start;
  }

  .permission-editor-scroll { flex: 1 1 auto; min-height: 0; overflow: auto; }

  .permission-shell .choice-list { max-height: min(28vh, 19rem); align-content: start; }

  .permission-shell .permission-toolbar {
    flex: 0 0 auto;
  }

  @media (max-width: 1199.98px) {
    .permission-workspace, .permission-grid, .permission-form { grid-template-columns: 1fr; }
    .permission-shell .permission-workspace { overflow: auto; }
  }

  @media (max-width: 767.98px) {
    .permission-page-header { flex-direction: column; }
    .permission-topbar { padding-inline: .75rem; }
    .permission-shell .permission-workspace { padding: .75rem; }
  }
</style>
