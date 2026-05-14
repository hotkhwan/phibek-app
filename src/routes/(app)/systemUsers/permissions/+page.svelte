<!-- src/routes/(app)/systemUsers/permissions/+page.svelte -->
<script lang="ts">
  import { onMount } from 'svelte'
  import { page } from '$app/state'
  import { setPageTitle } from '$lib/utils/title'
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
    await Promise.all([loadLookups(), load()])
  })
</script>

<div class="page-header mb-3 permission-page-header">
  <div>
    <h1 class="page-title">{m.navSystemUsersPermissions()}</h1>
    <p class="page-subtitle">จัดการ Menu, Resource และ API permission profiles ตามรูปแบบ Klynx</p>
  </div>
  <div class="d-flex gap-2">
    <button class="btn btn-outline-theme btn-sm" onclick={load} disabled={loading}><i class="bi bi-arrow-clockwise me-1"></i>Refresh</button>
    <button class="btn btn-theme btn-sm" onclick={startCreate} disabled={activeTab === 'api'}><i class="bi bi-plus-lg me-1"></i>Create profile</button>
  </div>
</div>

<nav class="permission-tabs" aria-label="Permission sections">
  <button type="button" class:active={activeTab === 'resource'} onclick={() => switchTab('resource')}><i class="bi bi-box me-1"></i>Resource</button>
  <button type="button" class:active={activeTab === 'menu'} onclick={() => switchTab('menu')}><i class="bi bi-menu-button-wide me-1"></i>Menu</button>
  <button type="button" class:active={activeTab === 'api'} onclick={() => switchTab('api')}><i class="bi bi-server me-1"></i>API</button>
</nav>

{#if errorMsg}<div class="alert alert-danger">{errorMsg}</div>{/if}

<div class="permission-workspace">
  <aside class="permission-list">
    <div class="permission-list-title mb-3">
      <span>{activeTab === 'resource' ? 'Resource profiles' : activeTab === 'menu' ? 'Menu profiles' : 'API permissions'}</span>
      <span class="badge bg-theme text-black">{filteredRows.length}</span>
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
            <span class="badge bg-secondary-subtle text-body ms-auto">{(row as ResourcePermission).status === false ? 'off' : 'on'}</span>
          </button>
        {:else}
          <div class="empty-panel">No profiles yet.</div>
        {/each}
      </div>
    {/if}
  </aside>

  <main class="permission-editor">
    {#if activeTab === 'api'}
      <div class="empty-panel h-100 d-flex align-items-center justify-content-center">API permissions are separated from Menu and Resource profiles, matching the Klynx permission model.</div>
    {:else}
      <div class="permission-toolbar">
        <div><div class="text-muted small text-uppercase">{createMode ? 'New permission profile' : selected ? 'Edit permission profile' : 'No profile selected'}</div><h2>{form.name || selected?.name || 'Untitled profile'}</h2></div>
        <div class="d-flex gap-2">
          <button class="btn btn-outline-secondary btn-sm" onclick={toggleStatus}><i class={form.status ? 'bi bi-toggle-on' : 'bi bi-toggle-off'}></i> {form.status ? 'Active' : 'Disabled'}</button>
          {#if selectedId}<button class="btn btn-outline-danger btn-sm" aria-label="Delete profile" title="Delete profile" onclick={remove}><i class="bi bi-trash"></i></button>{/if}
          <button class="btn btn-theme btn-sm" onclick={save} disabled={saving}>{#if saving}<span class="spinner-border spinner-border-sm me-1"></span>{/if}Apply</button>
        </div>
      </div>

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
          <div class="choice-list">{#each filteredUnits as unit (unit.id)}<button type="button" class="choice-row" class:selected={selectedOrgUnits.has(unit.id)} style={`padding-left:${0.75 + unitDepth(unit) * 1.15}rem`} onclick={() => toggle('ou', unit.id)}><i class={selectedOrgUnits.has(unit.id) ? 'bi bi-check-circle-fill text-theme' : 'bi bi-circle'}></i><span class="text-truncate">{unit.name}</span>{#if selectedOrgUnits.has(unit.id)}<span class="badge bg-theme text-black ms-auto">selected</span>{/if}</button>{:else}<div class="empty-panel">No org units</div>{/each}</div>
        </section>

        <section class="permission-card">
          <header><span><i class="bi bi-people text-theme me-2"></i>Narrow users</span><span class="badge bg-theme text-black">{selectedMembers.size || 'All'}</span></header>
          <div class="text-muted small mb-2">No user selected means all members in selected org units.</div>
          <div class="choice-list">{#each filteredMembers as member (idOfUser(member))}<button type="button" class="choice-row" class:selected={selectedMembers.has(idOfUser(member))} onclick={() => toggle('member', idOfUser(member))}><i class={selectedMembers.has(idOfUser(member)) ? 'bi bi-check-circle-fill text-theme' : 'bi bi-circle'}></i><span class="text-truncate">{displayName(member)}</span>{#if selectedMembers.has(idOfUser(member))}<span class="badge bg-theme text-black ms-auto">selected</span>{/if}</button>{:else}<div class="empty-panel">No users</div>{/each}</div>
        </section>

        {#if activeTab === 'resource'}
          <section class="permission-card">
            <header><span><i class="bi bi-folder2-open text-theme me-2"></i>Destination groups</span><span class="badge bg-theme text-black">{selectedGroups.size}</span></header>
            <label class="form-check small mb-2"><input class="form-check-input" type="checkbox" bind:checked={includeResourceGroupChildren} /> Include child groups</label>
            <div class="choice-list">{#each filteredGroups as group (group.id)}<button type="button" class="choice-row" class:selected={selectedGroups.has(group.id)} onclick={() => toggle('group', group.id)}><i class={selectedGroups.has(group.id) ? 'bi bi-check-circle-fill text-theme' : 'bi bi-circle'}></i><span class="text-truncate">{group.name}</span>{#if selectedGroups.has(group.id)}<span class="badge bg-theme text-black ms-auto">selected</span>{/if}</button>{:else}<div class="empty-panel">No resource groups</div>{/each}</div>
          </section>

          <section class="permission-card">
            <header><span><i class="bi bi-camera-video text-theme me-2"></i>Specific devices</span><span class="badge bg-theme text-black">{selectedCameras.size || 'All'}</span></header>
            <div class="text-muted small mb-2">Leave empty to allow every device in selected resource groups.</div>
            <div class="choice-list">{#each filteredCameras as camera (cameraId(camera))}<button type="button" class="choice-row" class:selected={selectedCameras.has(cameraId(camera))} onclick={() => toggle('camera', cameraId(camera))}><i class={selectedCameras.has(cameraId(camera)) ? 'bi bi-check-circle-fill text-theme' : 'bi bi-circle'}></i><span class="text-truncate">{camera.name}</span>{#if selectedCameras.has(cameraId(camera))}<span class="badge bg-theme text-black ms-auto">selected</span>{/if}</button>{:else}<div class="empty-panel">No devices</div>{/each}</div>
          </section>
        {/if}
      </div>

      <div class="permission-summary"><span><b>{relationLabel()}</b></span><span>Org units <b>{selectedOrgUnits.size}</b></span><span>Users <b>{selectedMembers.size || 'All'}</b></span>{#if activeTab === 'resource'}<span>Resource groups <b>{selectedGroups.size}</b></span><span>Devices <b>{selectedCameras.size || 'All'}</b></span>{/if}{#if detailLoading}<span class="ms-auto"><span class="spinner-border spinner-border-sm me-1"></span>Loading detail</span>{/if}</div>
    {/if}
  </main>
</div>

<style lang="scss">
  .permission-page-header { align-items: flex-start; }
  .page-subtitle { color: rgba(var(--bs-body-color-rgb), .58); margin: .25rem 0 0; }
  .permission-tabs { display: flex; flex-wrap: wrap; gap: .5rem; margin-bottom: 1rem; border-bottom: 1px solid rgba(var(--bs-border-color-rgb), .55); padding-bottom: .75rem; }
  .permission-tabs button { border: 1px solid rgba(var(--bs-border-color-rgb), .75); background: rgba(var(--bs-body-bg-rgb), .18); color: rgba(var(--bs-body-color-rgb), .72); border-radius: .35rem; padding: .45rem .75rem; }
  .permission-tabs button.active { border-color: rgba(var(--bs-theme-rgb), .72); color: var(--bs-theme); background: rgba(var(--bs-theme-rgb), .12); }
  .permission-list-title { display: flex; align-items: center; justify-content: space-between; font-weight: 700; color: rgba(var(--bs-body-color-rgb), .82); }
  .permission-workspace { display: grid; grid-template-columns: minmax(18rem, 24rem) minmax(0, 1fr); gap: 1rem; min-height: calc(100vh - 12rem); }
  .permission-list, .permission-editor, .permission-card { border: 1px solid rgba(var(--bs-border-color-rgb), .72); background: rgba(var(--bs-body-bg-rgb), .34); border-radius: .45rem; }
  .permission-list, .permission-editor { padding: 1rem; min-height: 0; }
  .permission-stack, .choice-list { display: grid; gap: .5rem; max-height: calc(100vh - 19rem); overflow: auto; padding-right: .25rem; }
  .permission-row, .choice-row { width: 100%; border: 1px solid rgba(var(--bs-border-color-rgb), .7); background: rgba(var(--bs-body-bg-rgb), .2); color: var(--bs-body-color); border-radius: .35rem; padding: .65rem .75rem; display: flex; align-items: center; gap: .6rem; text-align: left; }
  .permission-row.active, .choice-row.selected { border-color: rgba(var(--bs-theme-rgb), .7); background: rgba(var(--bs-theme-rgb), .12); box-shadow: inset 3px 0 0 rgba(var(--bs-theme-rgb), .75); }
  .permission-status { width: .55rem; height: .55rem; border-radius: 50%; background: var(--bs-secondary); box-shadow: 0 0 0 .2rem rgba(var(--bs-secondary-rgb), .12); }
  .permission-status.on { background: var(--bs-theme); box-shadow: 0 0 0 .2rem rgba(var(--bs-theme-rgb), .15); }
  .permission-toolbar, .permission-summary { display: flex; align-items: center; justify-content: space-between; gap: 1rem; flex-wrap: wrap; }
  .permission-toolbar h2 { font-size: 1.25rem; margin: 0; }
  .permission-toolbar { border-bottom: 1px solid rgba(var(--bs-border-color-rgb), .55); padding-bottom: .85rem; }
  .permission-form { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: .75rem; margin-block: 1rem; }
  .field-wide { grid-column: 1 / -1; }
  .field label { display: block; font-size: .7rem; font-weight: 700; text-transform: uppercase; color: rgba(var(--bs-body-color-rgb), .62); margin-bottom: .35rem; }
  .picker-search { margin-bottom: 1rem; }
  .permission-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1rem; }
  .permission-card { padding: .85rem; min-height: 21rem; }
  .permission-card header { display: flex; align-items: center; justify-content: space-between; gap: .75rem; font-weight: 700; margin-bottom: .75rem; }
  .empty-panel { border: 1px dashed rgba(var(--bs-border-color-rgb), .8); border-radius: .35rem; color: rgba(var(--bs-body-color-rgb), .55); padding: 1rem; text-align: center; }
  .permission-summary { border-top: 1px solid rgba(var(--bs-theme-rgb), .24); margin-top: 1rem; padding-top: .85rem; color: rgba(var(--bs-body-color-rgb), .7); }
  @media (max-width: 1199.98px) { .permission-workspace, .permission-grid, .permission-form { grid-template-columns: 1fr; } }
</style>
