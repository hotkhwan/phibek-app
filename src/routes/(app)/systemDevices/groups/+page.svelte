<!-- src/routes/(app)/systemDevices/groups/+page.svelte -->
<script lang="ts">
  import { onMount } from 'svelte'
  import { setPageTitle } from '$lib/utils/title'
  import AdminExplorer from '$lib/components/shared/AdminExplorer.svelte'
  import { listResourceGroups, type ResourceGroup } from '$lib/api/devices'
  import { m } from '$lib/i18n/messages'

  let rows = $state<ResourceGroup[]>([])
  let selectedId = $state('')
  let loading = $state(false)
  let errorMsg = $state('')
  let search = $state('')
  let notice = $state('')

  const selected = $derived(rows.find((x) => x.id === selectedId))
  const filtered = $derived(
    rows.filter((x) => `${x.name} ${x.description ?? ''} ${x.parentId ?? ''}`.toLowerCase().includes(search.toLowerCase()))
  )
  const items = $derived(filtered.map((x) => ({
    id: x.id,
    title: x.name,
    subtitle: x.parentId ? `Parent: ${x.parentId}` : x.description,
    icon: x.parentId ? 'bi-folder' : 'bi-folder2-open',
    meta: x.resourceCount ? String(x.resourceCount) : ''
  })))

  async function load() {
    loading = true
    errorMsg = ''
    const { data, error } = await listResourceGroups({ perPage: 100, search: search || undefined })
    loading = false
    if (error) errorMsg = error.message
    rows = data?.details?.items ?? []
    if (!selectedId && rows[0]) selectedId = rows[0].id
  }

  function unsupported() {
    notice = m.adminExplorerUnsupportedMutation()
  }

  onMount(() => {
    setPageTitle(`${m.navSystemDevices()} · ${m.navSystemDevicesGroups()}`)
    load()
  })
</script>

<AdminExplorer
  title={m.navSystemDevicesGroups()}
  subtitle="Resource group hierarchy (camera / kcontrol / edge)"
  icon="bi-diagram-3"
  {items}
  {selectedId}
  {search}
  {loading}
  error={errorMsg}
  createDisabled
  editDisabled
  deleteDisabled
  onSearch={(value) => (search = value)}
  onSelect={(id) => { selectedId = id; notice = '' }}
  onCreate={unsupported}
  onEdit={unsupported}
  onDelete={unsupported}
  onRefresh={load}
>
  {#snippet detail()}
    {#if notice}<div class="alert alert-warning small">{notice}</div>{/if}
    {#if selected}
      <div class="card">
        <div class="card-header fw-bold">{m.adminExplorerDetail()}</div>
        <div class="card-body">
          <dl class="admin-detail-grid">
            <dt>ID</dt><dd><code>{selected.id}</code></dd>
            <dt>Name</dt><dd>{selected.name}</dd>
            <dt>Parent</dt><dd>{selected.parentId ?? '—'}</dd>
            <dt>Description</dt><dd>{selected.description ?? '—'}</dd>
            <dt>Members</dt><dd>{selected.resourceCount ?? 0}</dd>
          </dl>
        </div>
      </div>
    {/if}
  {/snippet}
</AdminExplorer>
