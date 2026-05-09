<!-- src/routes/(app)/systemUsers/organizations/+page.svelte -->
<script lang="ts">
  import { onMount } from 'svelte'
  import { setPageTitle } from '$lib/utils/title'
  import AdminExplorer from '$lib/components/shared/AdminExplorer.svelte'
  import {
    createOrg,
    deleteOrg,
    listOrgs,
    updateOrg,
    type Organization
  } from '$lib/api/klynxUser'
  import { m } from '$lib/i18n/messages'

  type Mode = 'detail' | 'create' | 'edit' | 'delete'

  let rows = $state<Organization[]>([])
  let selectedId = $state('')
  let loading = $state(false)
  let errorMsg = $state('')
  let search = $state('')
  let mode = $state<Mode>('detail')
  let form = $state({ name: '', description: '', status: '' })

  const selected = $derived(rows.find((x) => (x.orgId ?? x.id) === selectedId))
  const filtered = $derived(
    rows.filter((x) => `${x.name} ${x.description ?? ''}`.toLowerCase().includes(search.toLowerCase()))
  )
  const items = $derived(filtered.map((x) => ({
    id: x.orgId ?? x.id,
    title: x.name,
    subtitle: x.description,
    icon: 'bi-building',
    meta: x.status
  })))

  function orgId(row: Organization) {
    return row.orgId ?? row.id
  }

  async function load() {
    loading = true
    errorMsg = ''
    const { data, error } = await listOrgs({ perPage: 100, search: search || undefined })
    loading = false
    if (error) errorMsg = error.message
    rows = data?.details?.items ?? []
    if (!selectedId && rows[0]) selectedId = orgId(rows[0])
  }

  function startCreate() {
    form = { name: '', description: '', status: '' }
    mode = 'create'
  }

  function startEdit() {
    if (!selected) return
    form = {
      name: selected.name,
      description: selected.description ?? '',
      status: selected.status ?? ''
    }
    mode = 'edit'
  }

  async function save() {
    if (!form.name.trim()) return
    if (mode === 'create') {
      await createOrg({ name: form.name.trim(), description: form.description })
    } else if (mode === 'edit' && selected) {
      await updateOrg(orgId(selected), {
        name: form.name.trim(),
        description: form.description,
        status: form.status || undefined
      })
    }
    mode = 'detail'
    await load()
  }

  async function remove() {
    if (!selected) return
    await deleteOrg(orgId(selected))
    selectedId = ''
    mode = 'detail'
    await load()
  }

  onMount(() => {
    setPageTitle(`${m.navSystemUsers()} · ${m.navSystemUsersOrganizations()}`)
    load()
  })
</script>

<AdminExplorer
  title={m.navSystemUsersOrganizations()}
  subtitle="Tenants / customer accounts"
  icon="bi-building"
  {items}
  {selectedId}
  {search}
  {loading}
  error={errorMsg}
  onSearch={(value) => (search = value)}
  onSelect={(id) => { selectedId = id; mode = 'detail' }}
  onCreate={startCreate}
  onEdit={startEdit}
  onDelete={() => (mode = 'delete')}
  onRefresh={load}
>
  {#snippet detail()}
    {#if mode === 'create' || mode === 'edit'}
      <div class="card">
        <div class="card-header fw-bold">{mode === 'create' ? m.adminExplorerCreate() : m.adminExplorerEdit()}</div>
        <div class="card-body">
          <div class="mb-3">
            <label class="form-label" for="org-name">Name</label>
            <input id="org-name" class="form-control" bind:value={form.name} />
          </div>
          <div class="mb-3">
            <label class="form-label" for="org-description">Description</label>
            <textarea id="org-description" class="form-control" rows="4" bind:value={form.description}></textarea>
          </div>
          {#if mode === 'edit'}
            <div class="mb-3">
              <label class="form-label" for="org-status">Status</label>
              <input id="org-status" class="form-control" bind:value={form.status} />
            </div>
          {/if}
          <div class="d-flex gap-2">
            <button class="btn btn-theme" onclick={save}>{m.adminExplorerSave()}</button>
            <button class="btn btn-outline-secondary" onclick={() => (mode = 'detail')}>{m.adminExplorerCancel()}</button>
          </div>
        </div>
      </div>
    {:else if mode === 'delete' && selected}
      <div class="card">
        <div class="card-header fw-bold text-danger">{m.adminExplorerDelete()}</div>
        <div class="card-body">
          <p>{m.adminExplorerDeleteConfirm()}</p>
          <div class="fw-bold mb-3">{selected.name}</div>
          <button class="btn btn-danger me-2" onclick={remove}>{m.adminExplorerDelete()}</button>
          <button class="btn btn-outline-secondary" onclick={() => (mode = 'detail')}>{m.adminExplorerCancel()}</button>
        </div>
      </div>
    {:else if selected}
      <div class="card">
        <div class="card-header fw-bold">{m.adminExplorerDetail()}</div>
        <div class="card-body">
          <dl class="admin-detail-grid">
            <dt>ID</dt><dd><code>{orgId(selected)}</code></dd>
            <dt>Name</dt><dd>{selected.name}</dd>
            <dt>Description</dt><dd>{selected.description ?? '—'}</dd>
            <dt>Status</dt><dd>{selected.status ?? '—'}</dd>
            <dt>Created</dt><dd>{selected.createAt ? new Date(selected.createAt).toLocaleString() : '—'}</dd>
            <dt>Updated</dt><dd>{selected.updateAt ? new Date(selected.updateAt).toLocaleString() : '—'}</dd>
          </dl>
        </div>
      </div>
    {/if}
  {/snippet}
</AdminExplorer>
