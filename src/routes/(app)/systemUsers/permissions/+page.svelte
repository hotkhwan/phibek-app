<!-- src/routes/(app)/systemUsers/permissions/+page.svelte -->
<script lang="ts">
  import { onMount } from 'svelte'
  import { page } from '$app/state'
  import { setPageTitle } from '$lib/utils/title'
  import AdminExplorer from '$lib/components/shared/AdminExplorer.svelte'
  import {
    createMenuPermission,
    createResourcePermission,
    deleteMenuPermission,
    deleteResourcePermission,
    getMenuPermissionDetail,
    listMenuPermissions,
    listResourcePermissions,
    setMenuPermissionStatus,
    updateMenuPermission,
    updateResourcePermission,
    type MenuPermission,
    type ResourcePermission
  } from '$lib/api/klynxUser'
  import { notify } from '$lib/stores/notify'
  import { m } from '$lib/i18n/messages'

  type Tab = 'menu' | 'resource' | 'api'
  type Mode = 'detail' | 'create' | 'edit' | 'delete'
  type Row = (MenuPermission | ResourcePermission) & { id: string }

  let activeTab = $state<Tab>('menu')
  let menuRows = $state<MenuPermission[]>([])
  let resourceRows = $state<ResourcePermission[]>([])
  let selectedId = $state('')
  let loading = $state(false)
  let errorMsg = $state('')
  let search = $state('')
  let mode = $state<Mode>('detail')
  let form = $state({ name: '', description: '', allow: 'r', ids: '' })

  const rows = $derived<Row[]>(activeTab === 'menu' ? menuRows : activeTab === 'resource' ? resourceRows : [])
  const selected = $derived(rows.find((x) => x.id === selectedId))
  const filtered = $derived(
    rows.filter((x) => JSON.stringify(x).toLowerCase().includes(search.toLowerCase()))
  )
  const items = $derived(filtered.map((x) => ({
    id: x.id,
    title: x.name ?? ('menuId' in x ? x.menuId : x.resourceId),
    subtitle: x.description ?? ('menuId' in x ? x.menuId : x.resourceId),
    icon: activeTab === 'menu' ? 'bi-list-ul' : 'bi-box-seam',
    meta: x.allow
  })))

  function idsFromText() {
    return form.ids.split(',').map((x) => x.trim()).filter(Boolean)
  }

  async function load() {
    loading = true
    errorMsg = ''
    if (activeTab === 'menu') {
      const { data, error } = await listMenuPermissions({ perPage: 100 })
      if (error) errorMsg = error.message
      menuRows = data?.details?.items ?? []
    } else if (activeTab === 'resource') {
      const { data, error } = await listResourcePermissions({ perPage: 100 })
      if (error) errorMsg = error.message
      resourceRows = data?.details?.items ?? []
    }
    loading = false
    selectedId = rows[0]?.id ?? ''
  }

  function switchTab(tab: Tab) {
    activeTab = tab
    selectedId = ''
    mode = 'detail'
    load()
  }

  function startCreate() {
    if (activeTab === 'api') return
    form = { name: '', description: '', allow: 'r', ids: '' }
    mode = 'create'
  }

  async function startEdit() {
    if (!selected || activeTab === 'api') return
    form = {
      name: selected.name ?? '',
      description: selected.description ?? '',
      allow: selected.allow ?? 'r',
      ids: 'menuId' in selected ? selected.menuId : selected.resourceId
    }
    mode = 'edit'

    // Hydrate full detail for menu permissions (provides menuIds list)
    if (activeTab === 'menu') {
      const { data, error } = await getMenuPermissionDetail(selected.id)
      if (error) {
        notify.warning('Detail load', error.message)
        return
      }
      const detail = data?.details
      if (detail) {
        form.name = detail.name ?? form.name
        form.description = detail.description ?? form.description
        form.allow = detail.allow ?? form.allow
        if (detail.menuIds?.length) form.ids = detail.menuIds.join(', ')
      }
    }
  }

  async function toggleStatus() {
    if (!selected || activeTab !== 'menu') return
    const current = (selected as MenuPermission & { status?: boolean }).status ?? true
    try {
      await setMenuPermissionStatus(selected.id, !current)
      notify.success('Status updated')
      await load()
    } catch (err) {
      notify.error('Status toggle failed', (err as { message?: string })?.message ?? 'Unknown')
    }
  }

  async function save() {
    if (!form.name.trim()) return
    const allow = form.allow as 'r' | 'rw' | 'none'
    if (activeTab === 'menu') {
      const body = { name: form.name.trim(), description: form.description, allow, menus: idsFromText() }
      if (mode === 'create') await createMenuPermission(body)
      if (mode === 'edit' && selected) await updateMenuPermission(selected.id, body)
    }
    if (activeTab === 'resource') {
      const body = { name: form.name.trim(), description: form.description, allow, resources: idsFromText() }
      if (mode === 'create') await createResourcePermission(body)
      if (mode === 'edit' && selected) await updateResourcePermission(selected.id, body)
    }
    mode = 'detail'
    await load()
  }

  async function remove() {
    if (!selected) return
    if (activeTab === 'menu') await deleteMenuPermission(selected.id)
    if (activeTab === 'resource') await deleteResourcePermission(selected.id)
    mode = 'detail'
    selectedId = ''
    await load()
  }

  onMount(() => {
    const tab = page.url.searchParams.get('tab')
    if (tab === 'resource' || tab === 'api' || tab === 'menu') activeTab = tab
    setPageTitle(`${m.navSystemUsers()} · ${m.navSystemUsersPermissions()}`)
    load()
  })
</script>

<AdminExplorer
  title={m.navSystemUsersPermissions()}
  subtitle="RBAC: menu / resource / API permissions"
  icon="bi-shield-lock"
  {items}
  {selectedId}
  {search}
  {loading}
  error={errorMsg}
  createDisabled={activeTab === 'api'}
  editDisabled={activeTab === 'api'}
  deleteDisabled={activeTab === 'api'}
  onSearch={(value) => (search = value)}
  onSelect={(id) => { selectedId = id; mode = 'detail' }}
  onCreate={startCreate}
  onEdit={startEdit}
  onDelete={() => (mode = 'delete')}
  onRefresh={load}
>
  {#snippet detail()}
    <div class="btn-group mb-3">
      <button class="btn btn-sm" class:btn-theme={activeTab === 'menu'} class:btn-outline-theme={activeTab !== 'menu'} onclick={() => switchTab('menu')}>Menu</button>
      <button class="btn btn-sm" class:btn-theme={activeTab === 'resource'} class:btn-outline-theme={activeTab !== 'resource'} onclick={() => switchTab('resource')}>Resource</button>
      <button class="btn btn-sm" class:btn-theme={activeTab === 'api'} class:btn-outline-theme={activeTab !== 'api'} onclick={() => switchTab('api')}>API</button>
    </div>

    {#if activeTab === 'api'}
      <div class="card"><div class="card-body"><div class="d-flex align-items-center gap-2 mb-2"><i class="bi bi-shield-check text-theme"></i><strong>API Permissions</strong><span class="badge bg-secondary-subtle text-body">read-only</span></div><p class="text-muted mb-0">API permission management is exposed by the backend contract as a separate surface. This panel keeps route parity with klynx and prevents accidental menu/resource schema mixing.</p></div></div>
    {:else if mode === 'create' || mode === 'edit'}
      <div class="card">
        <div class="card-header fw-bold">{mode === 'create' ? m.adminExplorerCreate() : m.adminExplorerEdit()}</div>
        <div class="card-body">
          <div class="mb-3"><label class="form-label" for="perm-name">Name</label><input id="perm-name" class="form-control" bind:value={form.name} /></div>
          <div class="mb-3"><label class="form-label" for="perm-description">Description</label><textarea id="perm-description" class="form-control" rows="3" bind:value={form.description}></textarea></div>
          <div class="mb-3">
            <label class="form-label" for="perm-allow">Allow</label>
            <select id="perm-allow" class="form-select" bind:value={form.allow}>
              <option value="r">Read</option>
              <option value="rw">Read / Write</option>
              <option value="none">None</option>
            </select>
          </div>
          <div class="mb-3">
            <label class="form-label" for="perm-ids">{activeTab === 'menu' ? 'Menu IDs' : 'Resource IDs'}</label>
            <input id="perm-ids" class="form-control" bind:value={form.ids} placeholder="comma,separated,ids" />
          </div>
          <button class="btn btn-theme me-2" onclick={save}>{m.adminExplorerSave()}</button>
          <button class="btn btn-outline-secondary" onclick={() => (mode = 'detail')}>{m.adminExplorerCancel()}</button>
        </div>
      </div>
    {:else if mode === 'delete' && selected}
      <div class="card">
        <div class="card-header fw-bold text-danger">{m.adminExplorerDelete()}</div>
        <div class="card-body">
          <p>{m.adminExplorerDeleteConfirm()}</p>
          <div class="fw-bold mb-3">{selected.name ?? selected.id}</div>
          <button class="btn btn-danger me-2" onclick={remove}>{m.adminExplorerDelete()}</button>
          <button class="btn btn-outline-secondary" onclick={() => (mode = 'detail')}>{m.adminExplorerCancel()}</button>
        </div>
      </div>
    {:else if selected}
      <div class="card">
        <div class="card-header fw-bold d-flex align-items-center justify-content-between">
          <span>{m.adminExplorerDetail()}</span>
          {#if activeTab === 'menu'}
            <button type="button" class="btn btn-outline-theme btn-sm" onclick={toggleStatus}>
              <i class="bi bi-toggle-on me-1"></i>
              {(selected as MenuPermission & { status?: boolean }).status === false ? 'Enable' : 'Disable'}
            </button>
          {/if}
        </div>
        <div class="card-body">
          <dl class="admin-detail-grid">
            <dt>ID</dt><dd><code>{selected.id}</code></dd>
            <dt>Name</dt><dd>{selected.name ?? '—'}</dd>
            <dt>Description</dt><dd>{selected.description ?? '—'}</dd>
            <dt>Allow</dt><dd>{selected.allow ?? '—'}</dd>
            <dt>{activeTab === 'menu' ? 'Menu ID' : 'Resource ID'}</dt>
            <dd>{'menuId' in selected ? selected.menuId : selected.resourceId}</dd>
            {#if activeTab === 'menu'}
              <dt>Status</dt>
              <dd>
                <span class="badge"
                  class:bg-success={(selected as MenuPermission & { status?: boolean }).status !== false}
                  class:bg-secondary={(selected as MenuPermission & { status?: boolean }).status === false}>
                  {(selected as MenuPermission & { status?: boolean }).status === false ? 'disabled' : 'active'}
                </span>
              </dd>
            {/if}
          </dl>
        </div>
      </div>
    {/if}
  {/snippet}
</AdminExplorer>
