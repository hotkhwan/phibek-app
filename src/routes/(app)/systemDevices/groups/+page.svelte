<!-- src/routes/(app)/systemDevices/groups/+page.svelte
     Resource group tree editor — ports klynx app/pages/systemDevices/groups.vue to the
     PHIBEK cyber_admin v2.0 layout (mirrors systemDevices/edge/+page.svelte conventions):
       breadcrumb · header + New root group · KPI summary cards · search/expand toolbar
       · two-pane layout (group tree | detail + member manager) · create/edit modal · delete confirm.
     - Loads tree forest via getResourceGroupTree() (children pre-nested); falls back to
       flat list + client-side buildTree for older BEs.
     - Right pane has two modes: "members" (devices in group, batch remove) and
       "add" (all org devices, batch add). resType ∈ cameras|kcontrols|edges.
     - Memory rebrand: kcontrol API value unchanged; user-facing label = "iotControl". -->
<script lang="ts">
  import { onDestroy, onMount } from 'svelte'
  import { setPageTitle } from '$lib/utils/title'
  import { appOptions } from '$lib/stores/appOptions'
  import Modal from '$lib/components/shared/Modal.svelte'
  import ConfirmDialog from '$lib/components/shared/ConfirmDialog.svelte'
  import {
    createResourceGroup,
    deleteResourceGroup,
    getResourceGroupTree,
    listResourceGroups,
    updateResourceGroup,
    listResourceGroupMembers,
    addResourceGroupMembers,
    removeResourceGroupMembers,
    listCameras,
    listEdgeDevices,
    type ResourceGroup,
    type ResourceGroupInput,
    type ResourceGroupResourceType
  } from '$lib/api/devices'
  import { listResources as listKcontrolResources } from '$lib/api/iotControl'
  import { activeWorkspaceId } from '$lib/stores/activeWorkspace'
  import { notify } from '$lib/stores/notify'
  import { m } from '$lib/i18n/messages'

  type GroupNode = ResourceGroup & { children: GroupNode[]; depth: number }
  type FormMode = 'create' | 'edit'
  type MemberResType = 'cameras' | 'kcontrols' | 'edges'
  type DeviceItem = { id: string; name?: string }
  type ViewMode = 'members' | 'add'

  /* resourceType (singular, API value) → member endpoint resType (plural) + display meta */
  const RES_META: Record<
    ResourceGroupResourceType,
    { resType: MemberResType; label: string; icon: string; badge: string }
  > = {
    camera: { resType: 'cameras', label: 'Camera', icon: 'bi-camera-video', badge: 'text-info' },
    kcontrol: { resType: 'kcontrols', label: 'iotControl', icon: 'bi-cpu', badge: 'text-primary' },
    edge: { resType: 'edges', label: 'Edge', icon: 'bi-hdd-network', badge: 'text-success' }
  }

  function metaFor(t: string | undefined): (typeof RES_META)[ResourceGroupResourceType] {
    return RES_META[(t as ResourceGroupResourceType) ?? 'camera'] ?? RES_META.camera
  }

  // ─────────── data ───────────
  let tree = $state<GroupNode[]>([])
  let flatById = $state<Map<string, GroupNode>>(new Map())
  let loading = $state(false)
  let errorMsg = $state('')
  let activeOrgId = $state('')

  // ─────────── tree ui ───────────
  let search = $state('')
  let expanded = $state<Set<string>>(new Set())
  let selectedId = $state<string | null>(null)

  // ─────────── right pane / member manager ───────────
  let viewMode = $state<ViewMode>('members')
  let members = $state<DeviceItem[]>([])
  let membersLoading = $state(false)
  let memberSearch = $state('')

  let addPool = $state<DeviceItem[]>([])
  let addPoolLoading = $state(false)
  let addSearch = $state('')
  let inGroupIds = $state<Set<string>>(new Set())

  let selectedForRemoval = $state<Set<string>>(new Set())
  let selectedForAdding = $state<Set<string>>(new Set())
  let memberBusy = $state(false)

  // ─────────── create / edit modal ───────────
  let formOpen = $state(false)
  let formMode = $state<FormMode>('create')
  let formBusy = $state(false)
  let editingId = $state<string | null>(null)
  let form = $state<ResourceGroupInput>(emptyForm())

  function emptyForm(): ResourceGroupInput {
    return {
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

  // ─────────── delete confirm ───────────
  let deleteOpen = $state(false)
  let deleteBusy = $state(false)
  let deleteTarget = $state<GroupNode | null>(null)

  // ─────────── derived ───────────
  const selected = $derived(selectedId ? (flatById.get(selectedId) ?? null) : null)
  const selectedMeta = $derived(metaFor(selected?.resourceType))

  const totalGroups = $derived(flatById.size)
  const rootCount = $derived(tree.length)
  const cameraGroups = $derived([...flatById.values()].filter((n) => (n.resourceType ?? 'camera') === 'camera').length)
  const otherGroups = $derived(totalGroups - cameraGroups)

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

  const filteredMembers = $derived.by(() => {
    const q = memberSearch.trim().toLowerCase()
    if (!q) return members
    return members.filter((d) => (d.name ?? d.id).toLowerCase().includes(q))
  })

  const filteredAddPool = $derived.by(() => {
    const q = addSearch.trim().toLowerCase()
    if (!q) return addPool
    return addPool.filter((d) => (d.name ?? d.id).toLowerCase().includes(q))
  })

  const addableVisible = $derived(filteredAddPool.filter((d) => !inGroupIds.has(d.id)))
  const allMembersSelected = $derived(
    filteredMembers.length > 0 && filteredMembers.every((d) => selectedForRemoval.has(d.id))
  )
  const allAddableSelected = $derived(
    addableVisible.length > 0 && addableVisible.every((d) => selectedForAdding.has(d.id))
  )

  // ─────────── tree build helpers ───────────
  function buildFlat(nodes: GroupNode[], out: Map<string, GroupNode> = new Map()): Map<string, GroupNode> {
    for (const n of nodes) {
      out.set(n.id, n)
      if (n.children.length) buildFlat(n.children, out)
    }
    return out
  }

  function buildTreeFromFlat(items: ResourceGroup[]): GroupNode[] {
    const byId = new Map<string, GroupNode>()
    for (const item of items) byId.set(item.id, { ...item, children: [], depth: 0 })
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

  // ─────────── load tree ───────────
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
      tree = buildTreeFromFlat(flat.data?.details?.items ?? [])
      flatById = buildFlat(tree)
      pruneSelection()
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
        nodes.map(
          (n) =>
            ({
              ...n,
              depth: 0,
              children: wrap(Array.isArray(n.children) ? n.children : [])
            }) as GroupNode
        )
      tree = wrap(rawItems)
      assignDepth(tree)
    } else {
      tree = buildTreeFromFlat(rawItems)
    }
    flatById = buildFlat(tree)
    pruneSelection()
  }

  /* Keep current selection only if it still exists after a reload. */
  function pruneSelection() {
    if (selectedId && !flatById.has(selectedId)) {
      selectedId = null
      members = []
      addPool = []
    }
  }

  // ─────────── members ───────────
  async function loadMembers(id: string) {
    if (!id) return
    const meta = metaFor(flatById.get(id)?.resourceType)
    membersLoading = true
    const { data } = await listResourceGroupMembers(id, meta.resType)
    membersLoading = false
    members = data?.details?.items ?? []
    inGroupIds = new Set(members.map((d) => d.id))
  }

  /* Fetch the org-wide device pool for the selected group's resource type. */
  async function loadAddPool(node: GroupNode) {
    addPoolLoading = true
    try {
      const rt = (node.resourceType as ResourceGroupResourceType) ?? 'camera'
      if (rt === 'camera') {
        const { data } = await listCameras({ perPage: 500 })
        addPool = (data?.details?.items ?? []).map((c) => ({ id: c.id, name: c.name }))
      } else if (rt === 'edge') {
        const { data } = await listEdgeDevices({ perPage: 500 })
        addPool = (data?.details?.items ?? []).map((e) => ({ id: e.id, name: e.name }))
      } else {
        // kcontrol → iotControl resource list
        const { data } = await listKcontrolResources({ perPage: 500 })
        addPool = (data?.details?.items ?? []).map((k) => ({ id: k.id, name: k.name }))
      }
    } finally {
      addPoolLoading = false
    }
  }

  function selectNode(id: string) {
    selectedId = id
    viewMode = 'members'
    members = []
    addPool = []
    memberSearch = ''
    addSearch = ''
    selectedForRemoval = new Set()
    selectedForAdding = new Set()
    void loadMembers(id)
  }

  function toggleExpanded(id: string) {
    const next = new Set(expanded)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    expanded = next
  }

  function switchToAdd() {
    if (!selected) return
    viewMode = 'add'
    addSearch = ''
    selectedForAdding = new Set()
    void loadAddPool(selected)
  }

  function switchToMembers() {
    viewMode = 'members'
    memberSearch = ''
    selectedForRemoval = new Set()
    if (selectedId) void loadMembers(selectedId)
  }

  function toggleRemoval(id: string) {
    const next = new Set(selectedForRemoval)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    selectedForRemoval = next
  }
  function toggleAddSel(id: string) {
    if (inGroupIds.has(id)) return
    const next = new Set(selectedForAdding)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    selectedForAdding = next
  }
  function toggleAllMembers(checked: boolean) {
    const next = new Set(selectedForRemoval)
    for (const d of filteredMembers) {
      if (checked) next.add(d.id)
      else next.delete(d.id)
    }
    selectedForRemoval = next
  }
  function toggleAllAddable(checked: boolean) {
    const next = new Set(selectedForAdding)
    for (const d of addableVisible) {
      if (checked) next.add(d.id)
      else next.delete(d.id)
    }
    selectedForAdding = next
  }

  async function batchRemove() {
    if (!selectedId || selectedForRemoval.size === 0 || memberBusy) return
    memberBusy = true
    try {
      const ids = [...selectedForRemoval]
      const { error } = await removeResourceGroupMembers(selectedId, selectedMeta.resType, ids)
      if (error) throw new Error(error.message)
      notify.success('Members removed', `${ids.length} ${selectedMeta.label.toLowerCase()}${ids.length === 1 ? '' : 's'} removed from group`)
      selectedForRemoval = new Set()
      await loadMembers(selectedId)
      await load()
    } catch (err) {
      notify.error('Remove failed', (err as { message?: string })?.message ?? 'Unknown error')
    } finally {
      memberBusy = false
    }
  }

  async function batchAdd() {
    if (!selectedId || selectedForAdding.size === 0 || memberBusy) return
    memberBusy = true
    try {
      const ids = [...selectedForAdding]
      const { error } = await addResourceGroupMembers(selectedId, selectedMeta.resType, ids)
      if (error) throw new Error(error.message)
      notify.success('Members added', `${ids.length} ${selectedMeta.label.toLowerCase()}${ids.length === 1 ? '' : 's'} added to group`)
      selectedForAdding = new Set()
      switchToMembers()
      await load()
    } catch (err) {
      notify.error('Add failed', (err as { message?: string })?.message ?? 'Unknown error')
    } finally {
      memberBusy = false
    }
  }

  // ─────────── create / edit ───────────
  function openCreateRoot() {
    if (!activeOrgId) {
      notify.warning('Select an organization', 'Resource groups belong to the active organization. Switch to one first.')
      return
    }
    form = emptyForm()
    formMode = 'create'
    editingId = null
    formOpen = true
  }

  function openCreateChild(parent: GroupNode) {
    form = emptyForm()
    formMode = 'create'
    editingId = null
    form.parentGroupId = parent.id
    form.resourceType = (parent.resourceType as ResourceGroupResourceType) ?? 'camera'
    formOpen = true
  }

  function openEdit(node: GroupNode) {
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

  const formValid = $derived(!!form.name.trim())

  async function submitForm() {
    if (formBusy) return
    if (!formValid) {
      notify.warning('Missing name', 'Please enter a group name.')
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
      if (formMode === 'create') {
        if (form.parentGroupId) payload.parentGroupId = form.parentGroupId
        const { error } = await createResourceGroup(payload)
        if (error) throw new Error(error.message)
        notify.success('Group created', form.name.trim())
      } else if (editingId) {
        const editPayload: Partial<ResourceGroupInput> = { ...payload }
        delete editPayload.parentGroupId
        const { error } = await updateResourceGroup(editingId, editPayload)
        if (error) throw new Error(error.message)
        notify.success('Group updated', form.name.trim())
      }
      formOpen = false
      await load()
    } catch (err) {
      notify.error('Save failed', (err as { message?: string })?.message ?? 'Unknown error')
    } finally {
      formBusy = false
    }
  }

  // ─────────── delete ───────────
  function openDelete(node: GroupNode) {
    deleteTarget = node
    deleteOpen = true
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    deleteBusy = true
    const removedId = deleteTarget.id
    const removedName = deleteTarget.name
    try {
      await deleteResourceGroup(removedId)
      notify.success('Group deleted', removedName)
      if (selectedId === removedId) {
        selectedId = null
        members = []
        addPool = []
      }
      deleteOpen = false
      deleteTarget = null
      await load()
    } catch (err) {
      notify.error('Delete failed', (err as { message?: string })?.message ?? 'Unknown error')
    } finally {
      deleteBusy = false
    }
  }

  onMount(() => {
    setPageTitle(`${m.navSystemDevices()} · ${m.navSystemDevicesGroups()}`)
    $appOptions.appContentClass = 'p-0 d-flex flex-column'
    const unsub = activeWorkspaceId.subscribe((id) => {
      activeOrgId = id ?? ''
      selectedId = null
      members = []
      addPool = []
      if (!id) {
        tree = []
        flatById = new Map()
        errorMsg = 'Select an organization to load resource groups.'
        return
      }
      errorMsg = ''
      void load()
    })
    return () => unsub()
  })

  onDestroy(() => {
    $appOptions.appContentClass = ''
  })
</script>

<div class="rg-page d-flex flex-column">
  <!-- Breadcrumb -->
  <ul class="breadcrumb border-bottom px-3 py-2 m-0">
    <li class="breadcrumb-item"><a href="#/" onclick={(e) => e.preventDefault()}>{m.navSystemDevices()}</a></li>
    <li class="breadcrumb-item active">{m.navSystemDevicesGroups()}</li>
  </ul>

  <!-- Header -->
  <div class="app-content-header d-flex align-items-end p-3 pb-0">
    <div class="page-header mb-0">
      {m.navSystemDevicesGroups()}
      <small>{totalGroups} group{totalGroups === 1 ? '' : 's'} · {rootCount} root</small>
    </div>
    <div class="ms-auto">
      <button
        type="button"
        class="btn btn-outline-theme text-uppercase"
        onclick={openCreateRoot}
        disabled={!activeOrgId}
        title={activeOrgId ? '' : 'Select an active organization first'}
      >
        <i class="bi bi-plus-lg me-1"></i> New root group
      </button>
    </div>
  </div>

  <!-- KPI summary cards -->
  <div class="px-3 pt-3">
    <div class="row g-3">
      <div class="col-xl-3 col-md-6">
        <div class="card h-100">
          <div class="card-body d-flex align-items-center justify-content-between py-3">
            <div>
              <div class="text-body text-opacity-50 small text-uppercase fw-semibold">Total groups</div>
              <div class="display-6 mb-0">{totalGroups.toLocaleString()}</div>
            </div>
            <i class="bi bi-diagram-3 fs-2 text-body text-opacity-25"></i>
          </div>
          <div class="card-arrow"><div class="card-arrow-top-left"></div><div class="card-arrow-top-right"></div><div class="card-arrow-bottom-left"></div><div class="card-arrow-bottom-right"></div></div>
        </div>
      </div>
      <div class="col-xl-3 col-md-6">
        <div class="card h-100">
          <div class="card-body d-flex align-items-center justify-content-between py-3">
            <div>
              <div class="text-body text-opacity-50 small text-uppercase fw-semibold">Root groups</div>
              <div class="display-6 mb-0 text-theme">{rootCount.toLocaleString()}</div>
            </div>
            <i class="bi bi-folder fs-2 text-theme opacity-50"></i>
          </div>
          <div class="card-arrow"><div class="card-arrow-top-left"></div><div class="card-arrow-top-right"></div><div class="card-arrow-bottom-left"></div><div class="card-arrow-bottom-right"></div></div>
        </div>
      </div>
      <div class="col-xl-3 col-md-6">
        <div class="card h-100">
          <div class="card-body d-flex align-items-center justify-content-between py-3">
            <div>
              <div class="text-body text-opacity-50 small text-uppercase fw-semibold">Camera groups</div>
              <div class="display-6 mb-0 text-info">{cameraGroups.toLocaleString()}</div>
            </div>
            <i class="bi bi-camera-video fs-2 text-info opacity-50"></i>
          </div>
          <div class="card-arrow"><div class="card-arrow-top-left"></div><div class="card-arrow-top-right"></div><div class="card-arrow-bottom-left"></div><div class="card-arrow-bottom-right"></div></div>
        </div>
      </div>
      <div class="col-xl-3 col-md-6">
        <div class="card h-100">
          <div class="card-body d-flex align-items-center justify-content-between py-3">
            <div>
              <div class="text-body text-opacity-50 small text-uppercase fw-semibold">Other groups</div>
              <div class="display-6 mb-0 text-success">{otherGroups.toLocaleString()}</div>
            </div>
            <i class="bi bi-collection fs-2 text-success opacity-50"></i>
          </div>
          <div class="card-arrow"><div class="card-arrow-top-left"></div><div class="card-arrow-top-right"></div><div class="card-arrow-bottom-left"></div><div class="card-arrow-bottom-right"></div></div>
        </div>
      </div>
    </div>
  </div>

  <!-- Toolbar -->
  <div class="rg-toolbar p-3 border-bottom">
    <div class="d-flex flex-wrap gap-2 align-items-center">
      <div class="flex-fill position-relative" style="min-width: 220px; max-width: 360px;">
        <div class="input-group">
          <div class="input-group-text position-absolute top-0 bottom-0 bg-none border-0 pe-0" style="z-index: 4;">
            <i class="fa fa-search opacity-5"></i>
          </div>
          <input
            type="text"
            class="form-control ps-30px border-start-0"
            placeholder="Search groups…"
            bind:value={search}
          />
        </div>
      </div>
      <div class="ms-auto d-flex flex-wrap gap-3 text-uppercase text-nowrap small align-items-center">
        <button type="button" class="btn btn-link p-0 fw-semibold text-body text-opacity-75 d-flex align-items-center gap-2 text-decoration-none" onclick={() => (expanded = new Set([...flatById.keys()]))} disabled={totalGroups === 0}>
          <i class="bi bi-arrows-expand fa-fw text-body text-opacity-25"></i> Expand all
        </button>
        <button type="button" class="btn btn-link p-0 fw-semibold text-body text-opacity-75 d-flex align-items-center gap-2 text-decoration-none" onclick={() => (expanded = new Set())}>
          <i class="bi bi-arrows-collapse fa-fw text-body text-opacity-25"></i> Collapse all
        </button>
        <button type="button" class="btn btn-link p-0 fw-semibold text-body text-opacity-75 d-flex align-items-center gap-2 text-decoration-none" onclick={load} disabled={loading}>
          <i class={`fa ${loading ? 'fa-spinner fa-spin' : 'fa-arrows-rotate'} fa-fw text-body text-opacity-25`}></i>
          {loading ? 'Loading…' : 'Refresh'}
        </button>
        {#if search}
          <button type="button" class="btn btn-link p-0 fw-semibold text-body text-opacity-75 d-flex align-items-center gap-2 text-decoration-none" onclick={() => (search = '')}>
            <i class="fa fa-xmark fa-fw text-body text-opacity-25"></i> Clear
          </button>
        {/if}
      </div>
    </div>
  </div>

  {#if errorMsg}
    <div class="alert alert-danger small mx-3 mt-3 mb-0">{errorMsg}</div>
  {/if}

  <!-- Two-pane content -->
  <div class="rg-content p-3">
    <div class="row g-3 h-100">
      <!-- Left: tree -->
      <div class="col-lg-5 col-xl-4 d-flex">
        <div class="card flex-fill d-flex flex-column">
          <div class="card-header fw-bold text-uppercase small d-flex align-items-center justify-content-between">
            <span><i class="bi bi-diagram-3 me-1"></i> Group tree</span>
            <span class="badge bg-theme bg-opacity-25 text-theme">{filteredTree.length} root</span>
          </div>
          <div class="card-body p-2 rg-tree-scroll">
            {#if loading && tree.length === 0}
              <div class="text-center py-4 text-body text-opacity-50">
                <div class="spinner-border spinner-border-sm me-2"></div>Loading tree…
              </div>
            {:else if filteredTree.length === 0}
              <div class="text-center py-4 text-body text-opacity-50">
                {search ? 'No groups match your search.' : 'No resource groups yet — click "New root group".'}
              </div>
            {:else}
              <ul class="rg-tree-list">
                {#each filteredTree as node (node.id)}
                  {@render renderNode(node)}
                {/each}
              </ul>
            {/if}
          </div>
          <div class="card-arrow"><div class="card-arrow-top-left"></div><div class="card-arrow-top-right"></div><div class="card-arrow-bottom-left"></div><div class="card-arrow-bottom-right"></div></div>
        </div>
      </div>

      <!-- Right: detail + member manager -->
      <div class="col-lg-7 col-xl-8 d-flex">
        {#if selected}
          <div class="card flex-fill d-flex flex-column">
            <!-- Detail header -->
            <div class="card-header">
              <div class="d-flex align-items-start justify-content-between gap-2 flex-wrap">
                <div class="min-w-0">
                  <div class="d-flex align-items-center gap-2 flex-wrap">
                    <span class="fw-bold fs-6 text-truncate"><i class="bi bi-folder me-1 text-theme"></i>{selected.name}</span>
                    <span class="badge text-uppercase {selectedMeta.badge} bg-body bg-opacity-25">{selectedMeta.label}</span>
                    <span class="badge text-uppercase {selected.mapVisibility === 'private' ? 'text-warning' : 'text-info'} bg-body bg-opacity-25">
                      <i class="bi {selected.mapVisibility === 'private' ? 'bi-lock' : 'bi-globe'} me-1"></i>{selected.mapVisibility ?? 'public'}
                    </span>
                  </div>
                  {#if selected.description}
                    <div class="text-body text-opacity-50 small mt-1 text-truncate">{selected.description}</div>
                  {/if}
                </div>
                <div class="btn-group btn-group-sm rg-detail-actions" role="group" aria-label="Group actions">
                  <button type="button" class="btn btn-outline-secondary" title="Edit group" aria-label="Edit group" onclick={() => openEdit(selected)}>
                    <i class="bi bi-pencil"></i>
                  </button>
                  <button type="button" class="btn btn-outline-secondary" title="Add sub-group" aria-label="Add sub-group" onclick={() => openCreateChild(selected)}>
                    <i class="bi bi-folder-plus"></i>
                  </button>
                  <button type="button" class="btn btn-outline-danger" title="Delete group" aria-label="Delete group" onclick={() => openDelete(selected)}>
                    <i class="bi bi-trash"></i>
                  </button>
                </div>
              </div>

              <!-- Mode bar -->
              <div class="d-flex align-items-center justify-content-between gap-2 mt-3 pt-3 border-top">
                <span class="fw-semibold text-uppercase small">
                  {#if viewMode === 'members'}
                    Members ({filteredMembers.length})
                  {:else}
                    Add {selectedMeta.label.toLowerCase()}s
                  {/if}
                </span>
                <div class="d-flex align-items-center gap-2">
                  {#if viewMode === 'members'}
                    <input type="text" class="form-control form-control-sm" style="width: 12rem;" placeholder="Search members…" bind:value={memberSearch} />
                    <button type="button" class="btn btn-outline-theme btn-sm text-nowrap" onclick={switchToAdd}>
                      <i class="bi bi-plus-lg me-1"></i> Add
                    </button>
                  {:else}
                    <input type="text" class="form-control form-control-sm" style="width: 12rem;" placeholder="Search devices…" bind:value={addSearch} />
                    <button type="button" class="btn btn-outline-secondary btn-sm text-nowrap" onclick={switchToMembers}>
                      <i class="bi bi-arrow-left me-1"></i> Back
                    </button>
                  {/if}
                </div>
              </div>
            </div>

            <!-- List body -->
            <div class="card-body p-0 rg-member-scroll">
              {#if viewMode === 'members'}
                <!-- Members mode -->
                <div class="rg-list-head d-flex align-items-center gap-3 px-3 py-2 small text-body text-opacity-50 text-uppercase border-bottom">
                  <input type="checkbox" class="form-check-input m-0" aria-label="Select all members" checked={allMembersSelected} onchange={(e) => toggleAllMembers(e.currentTarget.checked)} />
                  <span class="flex-fill">{selectedMeta.label} name</span>
                </div>
                {#if membersLoading}
                  <div class="text-center py-4 text-body text-opacity-50"><div class="spinner-border spinner-border-sm me-2"></div>Loading members…</div>
                {:else if filteredMembers.length === 0}
                  <div class="text-center py-5 text-body text-opacity-50">
                    {memberSearch ? 'No members match your search.' : 'No devices in this group yet.'}
                  </div>
                {:else}
                  {#each filteredMembers as d (d.id)}
                    <!-- svelte-ignore a11y_click_events_have_key_events -->
                    <!-- svelte-ignore a11y_no_static_element_interactions -->
                    <div class="rg-list-row d-flex align-items-center gap-3 px-3 py-2" onclick={() => toggleRemoval(d.id)}>
                      <input type="checkbox" class="form-check-input m-0" aria-label={`Select ${d.name ?? d.id}`} checked={selectedForRemoval.has(d.id)} onclick={(e) => e.stopPropagation()} onchange={() => toggleRemoval(d.id)} />
                      <i class={`bi ${selectedMeta.icon} text-body text-opacity-50`}></i>
                      <span class="flex-fill text-truncate">{d.name ?? d.id}</span>
                    </div>
                  {/each}
                {/if}
              {:else}
                <!-- Add mode -->
                <div class="rg-list-head d-flex align-items-center gap-3 px-3 py-2 small text-body text-opacity-50 text-uppercase border-bottom">
                  <input type="checkbox" class="form-check-input m-0" aria-label="Select all addable" checked={allAddableSelected} onchange={(e) => toggleAllAddable(e.currentTarget.checked)} />
                  <span class="flex-fill">{selectedMeta.label} name</span>
                  <span class="rg-status-col text-center">Status</span>
                </div>
                {#if addPoolLoading}
                  <div class="text-center py-4 text-body text-opacity-50"><div class="spinner-border spinner-border-sm me-2"></div>Loading devices…</div>
                {:else if filteredAddPool.length === 0}
                  <div class="text-center py-5 text-body text-opacity-50">No devices found.</div>
                {:else}
                  {#each filteredAddPool as d (d.id)}
                    {@const already = inGroupIds.has(d.id)}
                    <!-- svelte-ignore a11y_click_events_have_key_events -->
                    <!-- svelte-ignore a11y_no_static_element_interactions -->
                    <div class="rg-list-row d-flex align-items-center gap-3 px-3 py-2" class:opacity-50={already} onclick={() => toggleAddSel(d.id)}>
                      <input type="checkbox" class="form-check-input m-0" aria-label={`Select ${d.name ?? d.id}`} checked={already || selectedForAdding.has(d.id)} disabled={already} onclick={(e) => e.stopPropagation()} onchange={() => toggleAddSel(d.id)} />
                      <i class={`bi ${selectedMeta.icon} text-body text-opacity-50`}></i>
                      <span class="flex-fill text-truncate">{d.name ?? d.id}</span>
                      <span class="rg-status-col text-center">
                        {#if already}<span class="badge text-success bg-body bg-opacity-25 text-uppercase">In group</span>{/if}
                      </span>
                    </div>
                  {/each}
                {/if}
              {/if}
            </div>

            <!-- Footer -->
            <div class="card-footer d-flex align-items-center justify-content-between py-2">
              <div class="text-body text-opacity-50 small">
                {#if viewMode === 'members' && selectedForRemoval.size > 0}
                  {selectedForRemoval.size} selected
                {:else if viewMode === 'add' && selectedForAdding.size > 0}
                  {selectedForAdding.size} selected
                {/if}
              </div>
              <div class="d-flex gap-2">
                {#if viewMode === 'members'}
                  <button type="button" class="btn btn-outline-danger btn-sm text-uppercase" onclick={batchRemove} disabled={selectedForRemoval.size === 0 || memberBusy}>
                    {#if memberBusy}<span class="spinner-border spinner-border-sm me-1"></span>{/if}
                    <i class="bi bi-trash me-1"></i> Remove ({selectedForRemoval.size})
                  </button>
                {:else}
                  <button type="button" class="btn btn-outline-theme btn-sm text-uppercase" onclick={batchAdd} disabled={selectedForAdding.size === 0 || memberBusy}>
                    {#if memberBusy}<span class="spinner-border spinner-border-sm me-1"></span>{/if}
                    <i class="bi bi-plus-lg me-1"></i> Add ({selectedForAdding.size})
                  </button>
                {/if}
              </div>
            </div>
            <div class="card-arrow"><div class="card-arrow-top-left"></div><div class="card-arrow-top-right"></div><div class="card-arrow-bottom-left"></div><div class="card-arrow-bottom-right"></div></div>
          </div>
        {:else}
          <div class="card flex-fill">
            <div class="card-body d-flex flex-column align-items-center justify-content-center text-center text-body text-opacity-50 py-5">
              <i class="bi bi-folder2-open fs-1 mb-3 opacity-50"></i>
              <div class="fw-semibold">Select a group from the tree</div>
              <div class="small mt-1">Click a folder on the left to manage its devices and metadata.</div>
            </div>
            <div class="card-arrow"><div class="card-arrow-top-left"></div><div class="card-arrow-top-right"></div><div class="card-arrow-bottom-left"></div><div class="card-arrow-bottom-right"></div></div>
          </div>
        {/if}
      </div>
    </div>
  </div>
</div>

{#snippet renderNode(node: GroupNode)}
  {@const hasChildren = node.children.length > 0}
  {@const isOpen = expanded.has(node.id) || !!search.trim()}
  {@const meta = metaFor(node.resourceType)}
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
      <i class="bi {hasChildren && isOpen ? 'bi-folder2-open' : 'bi-folder'} text-theme me-1"></i>
      <span class="fw-semibold flex-grow-1 text-truncate">{node.name}</span>
      <span class="badge text-uppercase {meta.badge} bg-body bg-opacity-25 small">{meta.label}</span>
      {#if node.children.length > 0}
        <span class="badge bg-success bg-opacity-25 text-success small ms-1" title="Sub-groups"><i class="bi bi-diagram-2 me-1"></i>{node.children.length}</span>
      {/if}
      {#if typeof node.resourceCount === 'number' && node.resourceCount > 0}
        <span class="badge bg-warning bg-opacity-25 text-warning small ms-1" title="Members"><i class="bi bi-hdd-network me-1"></i>{node.resourceCount}</span>
      {:else if typeof node.cameraCount === 'number' && node.cameraCount > 0}
        <span class="badge bg-warning bg-opacity-25 text-warning small ms-1" title="Members"><i class="bi bi-hdd-network me-1"></i>{node.cameraCount}</span>
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

<!-- Create / Edit modal -->
<Modal
  bind:open={formOpen}
  title={formMode === 'create' ? (form.parentGroupId ? 'New sub-group' : 'New root group') : 'Edit group'}
  size="lg"
  dismissible={!formBusy}
>
  {#snippet body()}
    <form class="rg-form row g-3" onsubmit={(e) => { e.preventDefault(); void submitForm() }}>
      {#if formMode === 'create' && form.parentGroupId}
        <div class="col-12">
          <div class="alert alert-info small mb-0 py-2">
            Creating as a child of <strong>{flatById.get(form.parentGroupId)?.name ?? form.parentGroupId}</strong>
          </div>
        </div>
      {/if}

      <div class="col-md-8">
        <label class="form-label" for="rg-name">Name <span class="text-danger">*</span></label>
        <input id="rg-name" class="form-control form-control-sm" bind:value={form.name} placeholder="Enter group name" required />
      </div>
      <div class="col-md-4">
        <label class="form-label" for="rg-type">Resource type</label>
        <select id="rg-type" class="form-select form-select-sm" bind:value={form.resourceType} disabled={formMode === 'edit' || !!form.parentGroupId}>
          <option value="camera">Camera</option>
          <option value="kcontrol">iotControl</option>
          <option value="edge">Edge</option>
        </select>
        {#if formMode === 'edit'}
          <div class="form-text">Type cannot change after creation.</div>
        {:else if form.parentGroupId}
          <div class="form-text">Child groups inherit the parent's type.</div>
        {/if}
      </div>

      <div class="col-12">
        <label class="form-label" for="rg-desc">Description</label>
        <textarea id="rg-desc" class="form-control form-control-sm" rows="2" bind:value={form.description} placeholder="Optional"></textarea>
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
      <div class="col-md-4 d-flex align-items-end pb-1">
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
    <button type="button" class="btn btn-outline-secondary btn-sm text-uppercase" onclick={() => (formOpen = false)} disabled={formBusy}>Cancel</button>
    <button type="button" class="btn btn-outline-theme btn-sm text-uppercase" onclick={submitForm} disabled={formBusy || !formValid}>
      {#if formBusy}<span class="spinner-border spinner-border-sm me-1"></span>{/if}
      {formMode === 'create' ? 'Create' : 'Save'}
    </button>
  {/snippet}
</Modal>

<!-- Delete confirm -->
<ConfirmDialog
  bind:open={deleteOpen}
  title="Delete resource group?"
  message={deleteTarget
    ? `"${deleteTarget.name}"${deleteTarget.children.length > 0 ? ` and its ${deleteTarget.children.length} sub-group${deleteTarget.children.length === 1 ? '' : 's'}` : ''} will be removed. Member devices stay in the org — only their group assignment is cleared.`
    : ''}
  confirmLabel="Delete"
  cancelLabel="Cancel"
  danger
  busy={deleteBusy}
  onConfirm={confirmDelete}
/>

<style>
  .rg-page {
    height: 100%;
    min-height: 0;
    font-size: 0.8125rem;
  }

  .rg-toolbar {
    flex: 0 0 auto;
    background: rgba(var(--bs-body-bg-rgb), 0.84);
    backdrop-filter: blur(10px);
  }

  .rg-content {
    flex: 1 1 auto;
    min-height: 0;
    overflow: auto;
  }

  .rg-content .row {
    min-height: 28rem;
  }

  .rg-page :global(.page-header) {
    font-size: 1.25rem;
  }

  .rg-page :global(.page-header small) {
    font-size: 0.6875rem;
  }

  .rg-page :global(.display-6) {
    font-size: 1.75rem;
  }

  .rg-tree-scroll {
    flex: 1 1 auto;
    min-height: 0;
    max-height: 60vh;
    overflow: auto;
  }

  .rg-member-scroll {
    flex: 1 1 auto;
    min-height: 0;
    max-height: 60vh;
    overflow: auto;
  }

  /* Tree */
  .rg-tree-list,
  .rg-tree-children {
    list-style: none;
    padding-left: 0;
    margin: 0;
  }

  .rg-tree-node {
    padding-left: calc(var(--depth, 0) * 0.9rem);
  }

  .rg-tree-row {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.4rem 0.6rem;
    border-radius: 6px;
    cursor: pointer;
    transition: background 0.12s ease;
    min-width: 0;
  }

  .rg-tree-row:hover {
    background: rgba(var(--bs-body-color-rgb), 0.06);
  }

  .rg-tree-row.selected {
    background: rgba(var(--bs-theme-rgb), 0.14);
    box-shadow: inset 0 0 0 1px rgba(var(--bs-theme-rgb), 0.4);
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
    color: rgba(var(--bs-body-color-rgb), 0.65);
    padding: 0;
  }

  .rg-toggle:hover {
    color: var(--bs-theme);
  }

  /* Member list rows */
  .rg-list-head {
    position: sticky;
    top: 0;
    z-index: 2;
    background: rgba(var(--bs-body-bg-rgb), 0.96);
    backdrop-filter: blur(8px);
  }

  .rg-list-row {
    cursor: pointer;
    border-bottom: 1px dashed rgba(var(--bs-border-color-rgb), 0.5);
    transition: background 0.12s ease;
  }

  .rg-list-row:hover {
    background: rgba(var(--bs-body-color-rgb), 0.05);
  }

  .rg-status-col {
    width: 6.5rem;
    flex: 0 0 auto;
  }

  .rg-detail-actions :global(.btn) {
    width: 2rem;
    padding-inline: 0;
  }

  .rg-form :global(.form-label) {
    margin-bottom: 0.3rem;
    font-size: 0.72rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
</style>
