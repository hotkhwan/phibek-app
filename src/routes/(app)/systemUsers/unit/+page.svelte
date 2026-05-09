<!-- src/routes/(app)/systemUsers/unit/+page.svelte -->
<script lang="ts">
  import { onMount } from 'svelte'
  import { setPageTitle } from '$lib/utils/title'
  import AdminExplorer from '$lib/components/shared/AdminExplorer.svelte'
  import {
    createOrgUnit,
    deleteOrgUnit,
    listOrgUnits,
    updateOrgUnit,
    type OrgUnit
  } from '$lib/api/klynxUser'
  import { m } from '$lib/i18n/messages'

  type Mode = 'detail' | 'create' | 'edit' | 'delete'

  let rows = $state<OrgUnit[]>([])
  let selectedId = $state('')
  let loading = $state(false)
  let errorMsg = $state('')
  let search = $state('')
  let mode = $state<Mode>('detail')
  let form = $state({ name: '', description: '', parentId: '' })

  const selected = $derived(rows.find((x) => x.id === selectedId))
  const filtered = $derived(
    rows.filter((x) => `${x.name} ${x.description ?? ''} ${x.parentId ?? ''}`.toLowerCase().includes(search.toLowerCase()))
  )
  const items = $derived(filtered.map((x) => ({
    id: x.id,
    title: x.name,
    subtitle: x.parentId ? `Parent: ${x.parentId}` : x.description,
    icon: x.parentId ? 'bi-folder' : 'bi-folder2-open',
    meta: x.childCount ? String(x.childCount) : ''
  })))

  async function load() {
    loading = true
    errorMsg = ''
    const { data, error } = await listOrgUnits({ perPage: 100, search: search || undefined })
    loading = false
    if (error) errorMsg = error.message
    rows = data?.details?.items ?? []
    if (!selectedId && rows[0]) selectedId = rows[0].id
  }

  function startCreate() {
    form = { name: '', description: '', parentId: selectedId }
    mode = 'create'
  }

  function startEdit() {
    if (!selected) return
    form = {
      name: selected.name,
      description: selected.description ?? '',
      parentId: selected.parentId ?? ''
    }
    mode = 'edit'
  }

  async function save() {
    if (!form.name.trim()) return
    const body = {
      name: form.name.trim(),
      description: form.description,
      ...(form.parentId.trim() ? { parentId: form.parentId.trim() } : {})
    }
    if (mode === 'create') await createOrgUnit(body)
    if (mode === 'edit' && selected) await updateOrgUnit(selected.id, body)
    mode = 'detail'
    await load()
  }

  async function remove() {
    if (!selected) return
    await deleteOrgUnit(selected.id)
    selectedId = ''
    mode = 'detail'
    await load()
  }

  onMount(() => {
    setPageTitle(`${m.navSystemUsers()} · ${m.navSystemUsersUnit()}`)
    load()
  })
</script>

<AdminExplorer
  title={m.navSystemUsersUnit()}
  subtitle="Organisation unit hierarchy"
  icon="bi-diagram-2"
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
          <div class="mb-3"><label class="form-label" for="unit-name">Name</label><input id="unit-name" class="form-control" bind:value={form.name} /></div>
          <div class="mb-3">
            <label class="form-label" for="unit-parent">Parent unit</label>
            <select id="unit-parent" class="form-select" bind:value={form.parentId}>
              <option value="">— root —</option>
              {#each rows.filter((u) => u.id !== selected?.id) as opt (opt.id)}
                <option value={opt.id}>{opt.name}</option>
              {/each}
            </select>
          </div>
          <div class="mb-3"><label class="form-label" for="unit-description">Description</label><textarea id="unit-description" class="form-control" rows="4" bind:value={form.description}></textarea></div>
          <button class="btn btn-theme me-2" onclick={save}>{m.adminExplorerSave()}</button>
          <button class="btn btn-outline-secondary" onclick={() => (mode = 'detail')}>{m.adminExplorerCancel()}</button>
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
            <dt>ID</dt><dd><code>{selected.id}</code></dd>
            <dt>Name</dt><dd>{selected.name}</dd>
            <dt>Parent</dt><dd>{selected.parentId ?? '—'}</dd>
            <dt>Description</dt><dd>{selected.description ?? '—'}</dd>
            <dt>Children</dt><dd>{selected.childCount ?? 0}</dd>
          </dl>
        </div>
      </div>
    {/if}
  {/snippet}
</AdminExplorer>
