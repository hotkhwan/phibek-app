<!-- src/routes/(app)/systemDevices/groups/+page.svelte
     Resource group tree editor.
     - Loads tree forest via /resources/groups?tree=true (klynx-api 4.25.8+)
     - Falls back to flat list + client-side buildTree for older BEs
     - Click a node to select; right pane shows details + member cameras
     - Create root group / sub-group, edit metadata, delete (with member cleanup) -->
<script lang="ts">
  import { onMount } from 'svelte'
  import { setPageTitle } from '$lib/utils/title'
  import Modal from '$lib/components/shared/Modal.svelte'
  import ConfirmDialog from '$lib/components/shared/ConfirmDialog.svelte'
  import {
    createResourceGroup,
    deleteResourceGroup,
    getResourceGroupTree,
    listResourceGroupMembers,
    listResourceGroups,
    updateResourceGroup,
    type ResourceGroup,
    type ResourceGroupInput,
    type ResourceGroupResourceType
  } from '$lib/api/devices'
  import { notify } from '$lib/stores/notify'
  import { m } from '$lib/i18n/messages'

  type GroupNode = ResourceGroup & { children: GroupNode[]; depth: number }
  type FormMode = 'create' | 'edit'

  let tree = $state<GroupNode[]>([])
  let flatById = $state<Map<string, GroupNode>>(new Map())
  let loading = $state(false)
  let errorMsg = $state('')
  let search = $state('')
  let expanded = $state<Set<string>>(new Set())
  let selectedId = $state<string | null>(null)

  let members = $state<Array<{ id: string; name?: string }>>([])
  let membersLoading = $state(false)

  let formOpen = $state(false)
  let formMode = $state<FormMode>('create')
  let formBusy = $state(false)
  let editingId = $state<string | null>(null)
  let form = $state<ResourceGroupInput>({
    name: '',
    description: '',
    resourceType: 'camera',
    mapVisibility: 'public',
    filterVisibility: 'public',
    includeFilterChildren: false,
    icon: { online: null, offline: null },
    parentGroupId: null
  })

  let deleteOpen = $state(false)
  let deleteBusy = $state(false)
  let deleteTarget = $state<GroupNode | null>(null)

  const selected = $derived(selectedId ? flatById.get(selectedId) ?? null : null)
  const filteredTree = $derived.by(() => {
    const q = search.trim().toLowerCase()
    if (!q) return tree
    const matches = (n: GroupNode): boolean => {
      const txt = `${n.name} ${n.description ?? ''}`.toLowerCase()
      if (txt.includes(q)) return true
      return n.children.some(matches)
    }
    const prune = (nodes: GroupNode[]): GroupNode[] =>
      nodes.filter(matches).map((n) => ({ ...n, children: prune(n.children) }))
    return prune(tree)
  })

  function buildFlat(nodes: GroupNode[], out: Map<string, GroupNode> = new Map()): Map<string, GroupNode> {
    for (const n of nodes) {
      out.set(n.id, n)
      if (n.children.length) buildFlat(n.children, out)
    }
    return out
  }

  function buildTreeFromFlat(items: ResourceGroup[]): GroupNode[] {
    const byId = new Map<string, GroupNode>()
    for (const item of items) {
      byId.set(item.id, { ...item, children: [], depth: 0 })
    }
    const roots: GroupNode[] = []
    for (const node of byId.values()) {
      const parentId = node.parentGroupId ?? node.parentId ?? null
      if (parentId && byId.has(parentId)) {
        const parent = byId.get(parentId)!
        node.depth = parent.depth + 1
        parent.children.push(node)
      } else {
        roots.push(node)
      }
    }
    return roots
  }

  function assignDepth(nodes: GroupNode[], depth = 0) {
    for (const n of nodes) {
      n.depth = depth
      assignDepth(n.children, depth + 1)
    }
  }

  async function load() {
    if (loading) return
    loading = true
    errorMsg = ''
    const { data, error } = await getResourceGroupTree()
    if (error) {
      const flat = await listResourceGroups({ perPage: 500 })
      loading = false
      if (flat.error) {
        errorMsg = flat.error.message
        tree = []
        flatById = new Map()
        return
      }
      const items = flat.data?.details?.items ?? []
      tree = buildTreeFromFlat(items)
      flatById = buildFlat(tree)
      return
    }
    loading = false
    const rawDetails = data?.details
    const rawItems: ResourceGroup[] = Array.isArray(rawDetails)
      ? rawDetails
      : Array.isArray((rawDetails as { items?: ResourceGroup[] } | undefined)?.items)
        ? (rawDetails as { items: ResourceGroup[] }).items
        : []
    const hasNested = rawItems.some((r) => Array.isArray(r.children))
    if (hasNested) {
      const wrap = (nodes: ResourceGroup[]): GroupNode[] =>
        nodes.map((n) => ({
          ...n,
          depth: 0,
          children: wrap(Array.isArray(n.children) ? n.children : [])
        } as GroupNode))
      tree = wrap(rawItems)
      assignDepth(tree)
    } else {
      tree = buildTreeFromFlat(rawItems)
    }
    flatById = buildFlat(tree)
  }

  async function loadMembers(id: string) {
    if (!id) return
    membersLoading = true
    const { data } = await listResourceGroupMembers(id, 'cameras')
    membersLoading = false
    members = data?.details?.items ?? []
  }

  function selectNode(id: string) {
    selectedId = id
    members = []
    void loadMembers(id)
  }

  function toggleExpanded(id: string) {
    const next = new Set(expanded)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    expanded = next
  }

  function resetForm() {
    form = {
      name: '',
      description: '',
      resourceType: 'camera',
      mapVisibility: 'public',
      filterVisibility: 'public',
      includeFilterChildren: false,
      icon: { online: null, offline: null },
      parentGroupId: null
    }
  }

  function openCreateRoot() {
    resetForm()
    formMode = 'create'
    editingId = null
    formOpen = true
  }

  function openCreateChild(parent: GroupNode) {
    resetForm()
    formMode = 'create'
    editingId = null
    form.parentGroupId = parent.id
    form.resourceType = (parent.resourceType as ResourceGroupResourceType) ?? 'camera'
    formOpen = true
  }

  function openEdit(node: GroupNode) {
    resetForm()
    formMode = 'edit'
    editingId = node.id
    form = {
      name: node.name ?? '',
      description: node.description ?? '',
      resourceType: (node.resourceType as ResourceGroupResourceType) ?? 'camera',
      mapVisibility: (node.mapVisibility as 'public' | 'private') ?? 'public',
      filterVisibility: (node.filterVisibility as 'public' | 'internal') ?? 'public',
      includeFilterChildren: node.includeFilterChildren ?? false,
      icon: { online: node.icon?.online ?? null, offline: node.icon?.offline ?? null },
      parentGroupId: node.parentGroupId ?? null
    }
    formOpen = true
  }

  async function submitForm() {
    if (formBusy) return
    if (!form.name.trim()) {
      notify.warning('ใส่ชื่อกลุ่มก่อน', '')
      return
    }
    formBusy = true
    try {
      const payload: ResourceGroupInput = {
        name: form.name.trim(),
        description: form.description?.trim() || undefined,
        resourceType: form.resourceType,
        mapVisibility: form.mapVisibility,
        filterVisibility: form.filterVisibility,
        includeFilterChildren: form.includeFilterChildren ?? false,
        icon: {
          online: form.icon?.online?.trim() || null,
          offline: form.icon?.offline?.trim() || null
        }
      }
      if (formMode === 'create' && form.parentGroupId) payload.parentGroupId = form.parentGroupId

      if (formMode === 'create') {
        const { error } = await createResourceGroup(payload)
        if (error) throw new Error(error.message)
        notify.success('สร้างกลุ่มสำเร็จ', form.name)
      } else if (editingId) {
        const editPayload: Partial<ResourceGroupInput> = { ...payload }
        delete editPayload.parentGroupId
        const { error } = await updateResourceGroup(editingId, editPayload)
        if (error) throw new Error(error.message)
        notify.success('อัปเดตกลุ่มสำเร็จ', form.name)
      }
      formOpen = false
      await load()
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      notify.error('บันทึกไม่สำเร็จ', msg)
    } finally {
      formBusy = false
    }
  }

  function openDelete(node: GroupNode) {
    deleteTarget = node
    deleteOpen = true
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    deleteBusy = true
    try {
      await deleteResourceGroup(deleteTarget.id)
      notify.success('ลบกลุ่มแล้ว', deleteTarget.name)
      if (selectedId === deleteTarget.id) {
        selectedId = null
        members = []
      }
      deleteOpen = false
      deleteTarget = null
      await load()
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      notify.error('ลบไม่สำเร็จ', msg)
    } finally {
      deleteBusy = false
    }
  }

  function resourceTypeBadge(t: string | undefined): string {
    switch (t) {
      case 'camera': return 'bg-info text-dark'
      case 'kcontrol': return 'bg-primary'
      case 'edge': return 'bg-success'
      default: return 'bg-secondary'
    }
  }

  onMount(() => {
    setPageTitle(`${m.navSystemDevices()} · ${m.navSystemDevicesGroups()}`)
    void load()
  })
</script>

<div class="page-shell">
  <div class="d-flex flex-wrap align-items-center justify-content-between gap-3 mb-3">
    <div>
      <h1 class="page-header mb-1">
        <i class="bi bi-folder2-open text-theme me-2"></i>{m.navSystemDevicesGroups()}
      </h1>
      <div class="text-body text-opacity-50 small">Resource group hierarchy · camera / kcontrol / edge</div>
    </div>
    <button type="button" class="btn btn-theme btn-sm" onclick={openCreateRoot}>
      <i class="bi bi-plus-lg me-1"></i> New root group
    </button>
  </div>

  <div class="card mb-3">
    <div class="card-body py-3">
      <div class="d-flex flex-wrap gap-2 align-items-center">
        <div class="input-group input-group-sm" style="max-width: 320px">
          <span class="input-group-text"><i class="bi bi-search"></i></span>
          <input class="form-control" placeholder="Search groups…" bind:value={search} />
          {#if search}
            <button type="button" class="btn btn-outline-secondary" aria-label="Clear" title="Clear" onclick={() => (search = '')}>
              <i class="bi bi-x"></i>
            </button>
          {/if}
        </div>
        <div class="ms-auto d-flex gap-2">
          <button type="button" class="btn btn-outline-secondary btn-sm" onclick={() => (expanded = new Set([...flatById.keys()]))}>
            <i class="bi bi-arrows-expand me-1"></i> Expand all
          </button>
          <button type="button" class="btn btn-outline-secondary btn-sm" onclick={() => (expanded = new Set())}>
            <i class="bi bi-arrows-collapse me-1"></i> Collapse all
          </button>
          <button type="button" class="btn btn-outline-theme btn-sm" onclick={load} disabled={loading}>
            <i class="bi {loading ? 'bi-arrow-clockwise spin' : 'bi-arrow-clockwise'} me-1"></i> Refresh
          </button>
        </div>
      </div>
    </div>
    <div class="card-arrow">
      <div class="card-arrow-top-left"></div>
      <div class="card-arrow-top-right"></div>
      <div class="card-arrow-bottom-left"></div>
      <div class="card-arrow-bottom-right"></div>
    </div>
  </div>

  {#if errorMsg}
    <div class="alert alert-danger small mb-3">{errorMsg}</div>
  {/if}

  <div class="row g-3">
    <div class="col-lg-7">
      <div class="card">
        <div class="card-header fw-bold">Group tree</div>
        <div class="card-body p-2">
          {#if loading && tree.length === 0}
            <div class="text-center py-4 text-body text-opacity-50">
              <div class="spinner-border spinner-border-sm me-2"></div>Loading tree…
            </div>
          {:else if filteredTree.length === 0}
            <div class="text-center py-4 text-body text-opacity-50">No resource groups yet — click "New root group".</div>
          {:else}
            <ul class="rg-tree-list">
              {#each filteredTree as node (node.id)}
                {@render renderNode(node)}
              {/each}
            </ul>
          {/if}
        </div>
        <div class="card-arrow">
          <div class="card-arrow-top-left"></div>
          <div class="card-arrow-top-right"></div>
          <div class="card-arrow-bottom-left"></div>
          <div class="card-arrow-bottom-right"></div>
        </div>
      </div>
    </div>

    <div class="col-lg-5">
      {#if selected}
        <div class="card">
          <div class="card-header fw-bold d-flex justify-content-between align-items-center">
            <span><i class="bi bi-folder me-1"></i> {selected.name}</span>
            <div class="btn-group btn-group-sm">
              <button type="button" class="btn btn-outline-secondary" title="Edit" aria-label="Edit" onclick={() => openEdit(selected)}>
                <i class="bi bi-pencil"></i>
              </button>
              <button type="button" class="btn btn-outline-secondary" title="Add child group" aria-label="Add child" onclick={() => openCreateChild(selected)}>
                <i class="bi bi-folder-plus"></i>
              </button>
              <button type="button" class="btn btn-outline-danger" title="Delete" aria-label="Delete" onclick={() => openDelete(selected)}>
                <i class="bi bi-trash"></i>
              </button>
            </div>
          </div>
          <div class="card-body small">
            <dl class="row mb-3">
              <dt class="col-5 fw-semibold">Type</dt>
              <dd class="col-7"><span class="badge text-uppercase {resourceTypeBadge(selected.resourceType)}">{selected.resourceType ?? '—'}</span></dd>
              <dt class="col-5 fw-semibold">Map visibility</dt>
              <dd class="col-7 text-uppercase">{selected.mapVisibility ?? '—'}</dd>
              <dt class="col-5 fw-semibold">Filter visibility</dt>
              <dd class="col-7 text-uppercase">{selected.filterVisibility ?? '—'}</dd>
              <dt class="col-5 fw-semibold">Include children</dt>
              <dd class="col-7">{selected.includeFilterChildren ? 'Yes' : 'No'}</dd>
              {#if selected.description}
                <dt class="col-5 fw-semibold">Description</dt>
                <dd class="col-7">{selected.description}</dd>
              {/if}
              {#if selected.icon?.online || selected.icon?.offline}
                <dt class="col-5 fw-semibold">Custom icon</dt>
                <dd class="col-7 font-monospace text-body text-opacity-65 text-truncate">
                  {[selected.icon?.online, selected.icon?.offline].filter(Boolean).join(' / ')}
                </dd>
              {/if}
            </dl>

            <div class="d-flex justify-content-between align-items-center mb-2">
              <strong>Member cameras ({members.length})</strong>
              {#if membersLoading}<span class="spinner-border spinner-border-sm"></span>{/if}
            </div>
            {#if members.length === 0 && !membersLoading}
              <div class="text-body text-opacity-50 small">ยังไม่มีอุปกรณ์ในกลุ่มนี้</div>
            {:else}
              <ul class="list-unstyled small mb-0">
                {#each members as member (member.id)}
                  <li class="member-item">
                    <i class="bi bi-camera-video me-2 text-body text-opacity-50"></i>
                    <span>{member.name ?? member.id}</span>
                  </li>
                {/each}
              </ul>
            {/if}
          </div>
          <div class="card-arrow">
            <div class="card-arrow-top-left"></div>
            <div class="card-arrow-top-right"></div>
            <div class="card-arrow-bottom-left"></div>
            <div class="card-arrow-bottom-right"></div>
          </div>
        </div>
      {:else}
        <div class="card">
          <div class="card-body text-center text-body text-opacity-50 py-5">
            <i class="bi bi-folder fs-3 d-block mb-2"></i>
            เลือกกลุ่มจากต้นไม้เพื่อดูรายละเอียด
          </div>
          <div class="card-arrow">
            <div class="card-arrow-top-left"></div>
            <div class="card-arrow-top-right"></div>
            <div class="card-arrow-bottom-left"></div>
            <div class="card-arrow-bottom-right"></div>
          </div>
        </div>
      {/if}
    </div>
  </div>
</div>

{#snippet renderNode(node: GroupNode)}
  {@const hasChildren = node.children.length > 0}
  {@const isOpen = expanded.has(node.id) || !!search.trim()}
  <li class="rg-tree-node" style="--depth: {node.depth}">
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="rg-tree-row"
      class:selected={selectedId === node.id}
      role="button"
      tabindex="0"
      onclick={() => selectNode(node.id)}
      onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectNode(node.id) } }}
    >
      {#if hasChildren}
        <button type="button" class="rg-toggle" aria-label={isOpen ? 'Collapse' : 'Expand'} onclick={(e) => { e.stopPropagation(); toggleExpanded(node.id) }}>
          <i class="bi {isOpen ? 'bi-chevron-down' : 'bi-chevron-right'}"></i>
        </button>
      {:else}
        <span class="rg-toggle-placeholder"></span>
      {/if}
      <i class="bi {hasChildren ? (isOpen ? 'bi-folder2-open' : 'bi-folder') : 'bi-folder'} text-theme me-1"></i>
      <span class="fw-semibold flex-grow-1 text-truncate">{node.name}</span>
      <span class="badge text-uppercase {resourceTypeBadge(node.resourceType)} small">{node.resourceType ?? '—'}</span>
      {#if typeof node.cameraCount === 'number'}
        <span class="badge bg-light text-dark small ms-1">{node.cameraCount}</span>
      {/if}
    </div>
    {#if hasChildren && isOpen}
      <ul class="rg-tree-children">
        {#each node.children as child (child.id)}
          {@render renderNode(child)}
        {/each}
      </ul>
    {/if}
  </li>
{/snippet}

<Modal bind:open={formOpen} title={formMode === 'create' ? (form.parentGroupId ? 'New sub-group' : 'New root group') : 'Edit group'} size="lg" dismissible={!formBusy}>
  {#snippet body()}
    <form class="row g-3" onsubmit={(e) => { e.preventDefault(); void submitForm() }}>
      {#if formMode === 'create' && form.parentGroupId}
        <div class="col-12">
          <div class="small text-body text-opacity-65">
            Creating as a child of <strong>{flatById.get(form.parentGroupId)?.name ?? form.parentGroupId}</strong>
          </div>
        </div>
      {/if}

      <div class="col-md-8">
        <label class="form-label" for="rg-name">Name *</label>
        <input id="rg-name" class="form-control form-control-sm" bind:value={form.name} required />
      </div>
      <div class="col-md-4">
        <label class="form-label" for="rg-type">Resource type</label>
        <select id="rg-type" class="form-select form-select-sm" bind:value={form.resourceType} disabled={formMode === 'edit' || !!form.parentGroupId}>
          <option value="camera">Camera</option>
          <option value="kcontrol">KControl</option>
          <option value="edge">Edge</option>
        </select>
        {#if formMode === 'edit'}
          <div class="form-text">Type cannot change after creation.</div>
        {:else if form.parentGroupId}
          <div class="form-text">Child groups inherit parent's type.</div>
        {/if}
      </div>

      <div class="col-12">
        <label class="form-label" for="rg-desc">Description</label>
        <textarea id="rg-desc" class="form-control form-control-sm" rows="2" bind:value={form.description}></textarea>
      </div>

      <div class="col-md-4">
        <label class="form-label" for="rg-map">Map visibility</label>
        <select id="rg-map" class="form-select form-select-sm" bind:value={form.mapVisibility}>
          <option value="public">public</option>
          <option value="private">private</option>
        </select>
      </div>
      <div class="col-md-4">
        <label class="form-label" for="rg-filter">Filter visibility</label>
        <select id="rg-filter" class="form-select form-select-sm" bind:value={form.filterVisibility}>
          <option value="public">public</option>
          <option value="internal">internal</option>
        </select>
      </div>
      <div class="col-md-4 d-flex align-items-end">
        <div class="form-check form-switch">
          <input id="rg-children" class="form-check-input" type="checkbox" role="switch" bind:checked={form.includeFilterChildren} />
          <label class="form-check-label small" for="rg-children">Include children in filter</label>
        </div>
      </div>

      <div class="col-md-6">
        <label class="form-label" for="rg-icon-online">Online icon URL</label>
        <input id="rg-icon-online" class="form-control form-control-sm font-monospace" bind:value={form.icon!.online} placeholder="https://… (optional)" />
      </div>
      <div class="col-md-6">
        <label class="form-label" for="rg-icon-offline">Offline icon URL</label>
        <input id="rg-icon-offline" class="form-control form-control-sm font-monospace" bind:value={form.icon!.offline} placeholder="https://… (optional)" />
      </div>
    </form>
  {/snippet}
  {#snippet footer()}
    <button type="button" class="btn btn-outline-secondary btn-sm" onclick={() => (formOpen = false)} disabled={formBusy}>Cancel</button>
    <button type="button" class="btn btn-theme btn-sm" onclick={submitForm} disabled={formBusy}>
      {#if formBusy}<span class="spinner-border spinner-border-sm me-1"></span>{/if}
      {formMode === 'create' ? 'Create group' : 'Save changes'}
    </button>
  {/snippet}
</Modal>

<ConfirmDialog
  bind:open={deleteOpen}
  title="Delete resource group?"
  message={`Delete "${deleteTarget?.name ?? ''}" and all of its sub-groups? Member devices stay in the org — only their group assignment is removed.`}
  confirmLabel="Delete"
  cancelLabel="Cancel"
  danger
  busy={deleteBusy}
  onConfirm={confirmDelete}
/>

<style>
  .page-shell { padding: 1rem; }
  .page-header { font-size: 1.4rem; font-weight: 700; }

  .rg-tree-list,
  .rg-tree-children {
    list-style: none;
    padding-left: 0;
    margin: 0;
  }

  .rg-tree-node {
    padding-left: calc(var(--depth, 0) * .9rem);
  }

  .rg-tree-row {
    display: flex;
    align-items: center;
    gap: .35rem;
    padding: .4rem .6rem;
    border-radius: 6px;
    cursor: pointer;
    transition: background .12s;
    min-width: 0;
  }

  .rg-tree-row:hover {
    background: rgba(var(--bs-body-color-rgb), .06);
  }

  .rg-tree-row.selected {
    background: rgba(var(--bs-primary-rgb), .12);
    box-shadow: inset 0 0 0 1px rgba(var(--bs-primary-rgb), .3);
  }

  .rg-toggle,
  .rg-toggle-placeholder {
    width: 18px;
    height: 18px;
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: 0;
    color: rgba(var(--bs-body-color-rgb), .65);
    padding: 0;
  }

  .rg-toggle:hover {
    color: var(--bs-primary);
  }

  .member-item {
    padding: .25rem 0;
    border-bottom: 1px dashed rgba(var(--bs-border-color-rgb), .5);
  }

  .member-item:last-child {
    border-bottom: 0;
  }

  .spin { animation: spin 1s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
</style>
