<!-- src/routes/(app)/systemDevices/edge/+page.svelte
     Edge node devices (SVMS / ATA / IBOC) — ports klynx app/pages/systemDevices/edge/*.
     Layout mirrors systemUsers/users/+page.svelte (cyber_admin v2.0):
       breadcrumb · header + Add Edge · 4 KPI cards · type-filter + search toolbar
       · multi-select table · pagination · combined Add/Edit modal · delete confirm.
     CRUD maps to devices.ts /system/edge; add/edit/delete sub-routes 307-redirect here. -->
<script lang="ts">
  import { onDestroy, onMount } from 'svelte'
  import { resolve } from '$app/paths'
  import { setPageTitle } from '$lib/utils/title'
  import { appOptions } from '$lib/stores/appOptions'
  import Modal from '$lib/components/shared/Modal.svelte'
  import ConfirmDialog from '$lib/components/shared/ConfirmDialog.svelte'
  import {
    listSystemEdgeDevices,
    createEdgeDevice,
    updateEdgeDevice,
    deleteEdgeDevice,
    syncEdgeDevice,
    type SystemEdgeDevice,
    type EdgeDeviceType
  } from '$lib/api/devices'
  import { activeWorkspaceId } from '$lib/stores/activeWorkspace'
  import { notify } from '$lib/stores/notify'
  import { m } from '$lib/i18n/messages'

  type TypeFilter = 'all' | EdgeDeviceType

  const TYPE_OPTIONS: { label: string; value: EdgeDeviceType; icon: string; blurb: string }[] = [
    { label: 'SVMS', value: 'svms', icon: 'bi-camera-video', blurb: 'K-Super VMS streaming server' },
    { label: 'ATA', value: 'ata', icon: 'bi-cpu', blurb: 'AI Traffic Analytics platform' },
    { label: 'IBOC', value: 'iboc', icon: 'bi-robot', blurb: 'Intelligent Bot Operations Center' }
  ]

  // ─────────── data ───────────
  let rows = $state<SystemEdgeDevice[]>([])
  let loading = $state(false)
  let exporting = $state(false)
  let errorMsg = $state('')
  let activeOrgId = $state('')

  // ─────────── filters ───────────
  let search = $state('')
  let typeFilter = $state<TypeFilter>('all')
  let perPage = $state(10)
  const PER_PAGE_OPTIONS = [10, 25, 50, 100]
  let pageIndex = $state(1)

  // ─────────── selection ───────────
  let selectedIds = $state<Set<string>>(new Set())
  let syncingIds = $state<Set<string>>(new Set())

  // ─────────── modal state ───────────
  type FormMode = 'create' | 'edit'
  let formOpen = $state(false)
  let formMode = $state<FormMode>('create')
  let formBusy = $state(false)
  let editingId = $state<string | null>(null)
  let edgeType = $state<EdgeDeviceType>('svms')
  let form = $state({
    name: '',
    username: '',
    password: '',
    url: '',
    tls: false,
    apiKey: '',
    apiSecret: ''
  })

  // ─────────── delete confirm ───────────
  let deleteOpen = $state(false)
  let deleteBusy = $state(false)
  let deleteTarget = $state<SystemEdgeDevice | null>(null)

  // ─────────── derived ───────────
  const totalDevices = $derived(rows.length)
  const svmsCount = $derived(rows.filter((d) => d.type === 'svms').length)
  const ataCount = $derived(rows.filter((d) => d.type === 'ata').length)
  const ibocCount = $derived(rows.filter((d) => d.type === 'iboc').length)

  // Type filter + search applied client-side (search is also sent to the backend).
  const filtered = $derived(
    rows.filter((d) => {
      if (typeFilter !== 'all' && d.type !== typeFilter) return false
      if (!search.trim()) return true
      const needle = search.trim().toLowerCase()
      return (
        (d.name ?? '').toLowerCase().includes(needle) ||
        (d.username ?? '').toLowerCase().includes(needle) ||
        (d.url ?? '').toLowerCase().includes(needle)
      )
    })
  )

  const totalEntries = $derived(filtered.length)
  const totalPages = $derived(Math.max(1, Math.ceil(totalEntries / perPage)))
  const safePage = $derived(Math.min(Math.max(1, pageIndex), totalPages))
  const offset = $derived((safePage - 1) * perPage)
  const paged = $derived(filtered.slice(offset, offset + perPage))
  const showingFrom = $derived(totalEntries === 0 ? 0 : offset + 1)
  const showingTo = $derived(Math.min(offset + perPage, totalEntries))

  const pageNumbers = $derived.by(() => {
    const list: number[] = []
    const max = Math.min(totalPages, 6)
    let start = Math.max(1, safePage - 2)
    const end = Math.min(totalPages, start + max - 1)
    start = Math.max(1, end - max + 1)
    for (let i = start; i <= end; i++) list.push(i)
    return list
  })

  const allSelected = $derived(paged.length > 0 && paged.every((d) => selectedIds.has(d.id)))
  const someSelected = $derived(paged.some((d) => selectedIds.has(d.id)) && !allSelected)

  function typeLabel(): string {
    if (typeFilter === 'all') return 'TYPE: ALL'
    return `TYPE: ${typeFilter.toUpperCase()}`
  }

  function typeBadgeClass(type?: string): string {
    if (type === 'svms') return 'text-info'
    if (type === 'ata') return 'text-success'
    if (type === 'iboc') return 'text-purple'
    return 'text-body text-opacity-50'
  }

  function syncableType(type?: string): type is 'svms' | 'ata' {
    return type === 'svms' || type === 'ata'
  }

  // ─────────── load ───────────
  let searchToken = 0
  async function load() {
    loading = true
    errorMsg = ''
    const myToken = ++searchToken
    try {
      const { data, error } = await listSystemEdgeDevices({
        perPage: 250,
        q: search.trim() || undefined
      })
      if (myToken !== searchToken) return
      if (error) {
        errorMsg = error.message
        rows = []
      } else {
        rows = (data?.details?.items ?? []) as SystemEdgeDevice[]
      }
      pageIndex = 1
      clearSelection()
    } catch (err) {
      if (myToken !== searchToken) return
      errorMsg = (err as Error)?.message ?? 'Failed to load edge devices'
      rows = []
    } finally {
      if (myToken === searchToken) loading = false
    }
  }

  let searchTimer: ReturnType<typeof setTimeout> | null = null
  function onSearchInput() {
    pageIndex = 1
    if (searchTimer) clearTimeout(searchTimer)
    searchTimer = setTimeout(() => load(), 350)
  }

  // ─────────── selection helpers ───────────
  function toggleRow(id: string, checked: boolean) {
    const next = new Set(selectedIds)
    if (checked) next.add(id)
    else next.delete(id)
    selectedIds = next
  }
  function toggleAll(checked: boolean) {
    const next = new Set(selectedIds)
    for (const d of paged) {
      if (checked) next.add(d.id)
      else next.delete(d.id)
    }
    selectedIds = next
  }
  function clearSelection() {
    selectedIds = new Set()
  }

  // ─────────── create / edit ───────────
  function openCreate() {
    if (!activeOrgId) {
      notify.warning('Select an organization', 'New edge devices are added to the active organization. Switch to one first.')
      return
    }
    formMode = 'create'
    editingId = null
    edgeType = 'svms'
    form = { name: '', username: '', password: '', url: '', tls: false, apiKey: '', apiSecret: '' }
    formOpen = true
  }

  function openEdit(d: SystemEdgeDevice) {
    formMode = 'edit'
    editingId = d.id
    edgeType = (d.type as EdgeDeviceType) || 'svms'
    form = {
      name: d.name || '',
      username: d.username || '',
      password: '',
      url: d.url || '',
      tls: d.tls || false,
      apiKey: '',
      apiSecret: ''
    }
    formOpen = true
  }

  const formValid = $derived.by(() => {
    if (!form.name.trim() || !form.username.trim() || !form.url.trim()) return false
    if (formMode === 'create' && !form.password) return false
    if (edgeType === 'ata') {
      if (!form.apiKey.trim()) return false
      if (formMode === 'create' && !form.apiSecret) return false
    }
    return true
  })

  async function saveForm() {
    if (formBusy) return
    if (!formValid) {
      notify.warning('Missing fields', 'Please fill all required fields.')
      return
    }
    formBusy = true
    try {
      if (formMode === 'create') {
        const body = {
          type: edgeType,
          name: form.name.trim(),
          username: form.username.trim(),
          password: form.password,
          url: form.url.trim(),
          tls: form.tls,
          ...(edgeType === 'ata' ? { apiKey: form.apiKey.trim(), apiSecret: form.apiSecret } : {})
        }
        const { error } = await createEdgeDevice(body)
        if (error) throw new Error(error.message)
        notify.success('Edge device added', form.name.trim())
      } else if (editingId) {
        const body = {
          name: form.name.trim(),
          username: form.username.trim(),
          url: form.url.trim(),
          tls: form.tls,
          ...(form.password ? { password: form.password } : {}),
          ...(edgeType === 'ata'
            ? { apiKey: form.apiKey.trim(), ...(form.apiSecret ? { apiSecret: form.apiSecret } : {}) }
            : {})
        }
        const { error } = await updateEdgeDevice(editingId, body)
        if (error) throw new Error(error.message)
        notify.success('Edge device updated', form.name.trim())
      }
      formOpen = false
      await load()
    } catch (err) {
      notify.error('Save failed', (err as { message?: string })?.message ?? 'Unknown error')
    } finally {
      formBusy = false
    }
  }

  // ─────────── sync ───────────
  async function runSync(d: SystemEdgeDevice) {
    if (!syncableType(d.type)) {
      notify.info('Sync unavailable', 'IBOC sync is not wired in this UI yet.')
      return
    }
    const next = new Set(syncingIds)
    next.add(d.id)
    syncingIds = next
    try {
      await syncEdgeDevice(d.id, d.type)
      notify.success('Device synced', d.name)
      await load()
    } catch (err) {
      notify.error('Sync failed', (err as { message?: string })?.message ?? 'Unknown error')
    } finally {
      const cleared = new Set(syncingIds)
      cleared.delete(d.id)
      syncingIds = cleared
    }
  }

  // ─────────── delete ───────────
  function openDelete(d: SystemEdgeDevice) {
    deleteTarget = d
    deleteOpen = true
  }
  async function confirmDelete() {
    if (!deleteTarget) return
    deleteBusy = true
    const removedId = deleteTarget.id
    try {
      await deleteEdgeDevice(removedId)
      notify.success('Edge device deleted', deleteTarget.name)
      rows = rows.filter((r) => r.id !== removedId)
      await load()
    } catch (err) {
      notify.error('Delete failed', (err as { message?: string })?.message ?? 'Unknown error')
    } finally {
      deleteBusy = false
      deleteOpen = false
      deleteTarget = null
    }
  }

  // ─────────── export ───────────
  function exportCsv() {
    if (exporting) return
    exporting = true
    try {
      const exportRows = selectedIds.size > 0 ? filtered.filter((d) => selectedIds.has(d.id)) : filtered
      const header = ['#', 'Type', 'Name', 'Username', 'URL', 'TLS', 'Created']
      const lines = exportRows.map((d, i) =>
        [
          i + 1,
          (d.type ?? '').toUpperCase(),
          d.name ?? '',
          d.username ?? '',
          d.url ?? '',
          d.tls ? 'Yes' : 'No',
          d.createdAt ?? ''
        ]
          .map((v) => `"${String(v).replace(/"/g, '""')}"`)
          .join(',')
      )
      const csv = [header.join(','), ...lines].join('\n')
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const dt = new Date()
      const stamp = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
      a.download = `edge-devices-${stamp}.csv`
      a.click()
      URL.revokeObjectURL(url)
      notify.success('Edge devices exported', `${exportRows.length} device${exportRows.length === 1 ? '' : 's'}`)
    } catch (err) {
      notify.error('Export failed', (err as { message?: string })?.message ?? 'Unknown error')
    } finally {
      exporting = false
    }
  }

  function gotoPage(p: number) {
    if (p < 1 || p > totalPages || p === safePage) return
    pageIndex = p
  }

  onMount(() => {
    setPageTitle(`${m.navSystemDevices()} · ${m.navSystemDevicesEdge()}`)
    $appOptions.appContentClass = 'p-0 d-flex flex-column'
    const unsub = activeWorkspaceId.subscribe((id) => {
      activeOrgId = id ?? ''
      if (!id) {
        rows = []
        errorMsg = 'Select an organization to load edge devices.'
        return
      }
      void load()
    })
    return () => unsub()
  })

  onDestroy(() => {
    $appOptions.appContentClass = ''
    if (searchTimer) clearTimeout(searchTimer)
  })
</script>

<div class="edge-page d-flex flex-column">
  <!-- Breadcrumb -->
  <ul class="breadcrumb border-bottom px-3 py-2 m-0">
    <li class="breadcrumb-item"><a href="#/" onclick={(e) => e.preventDefault()}>{m.navSystemDevices()}</a></li>
    <li class="breadcrumb-item active">{m.navSystemDevicesEdge()}</li>
  </ul>

  <!-- Device-type tabs: edge lives inside the device list alongside cameras -->
  <ul class="nav nav-tabs px-3 pt-2">
    <li class="nav-item"><a class="nav-link" href={resolve('/systemDevices/cameras')}><i class="bi bi-camera-video me-1"></i> {m.navSystemDevicesCameras()}</a></li>
    <li class="nav-item"><a class="nav-link active" href={resolve('/systemDevices/edge')}><i class="bi bi-hdd-stack me-1"></i> {m.navSystemDevicesEdge()}</a></li>
  </ul>

  <!-- Header -->
  <div class="app-content-header d-flex align-items-end p-3 pb-0">
    <div class="page-header mb-0">
      {m.navSystemDevicesEdge()}
      <small>{totalDevices} device{totalDevices === 1 ? '' : 's'} in system</small>
    </div>
    <div class="ms-auto">
      <button
        type="button"
        class="btn btn-outline-theme text-uppercase"
        onclick={openCreate}
        disabled={!activeOrgId}
        title={activeOrgId ? '' : 'Select an active organization first'}
      >
        <i class="bi bi-plus-lg me-1"></i> Add edge
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
              <div class="text-body text-opacity-50 small text-uppercase fw-semibold">Total</div>
              <div class="display-6 mb-0">{totalDevices.toLocaleString()}</div>
            </div>
            <i class="bi bi-hdd-stack fs-2 text-body text-opacity-25"></i>
          </div>
          <div class="card-arrow"><div class="card-arrow-top-left"></div><div class="card-arrow-top-right"></div><div class="card-arrow-bottom-left"></div><div class="card-arrow-bottom-right"></div></div>
        </div>
      </div>
      <div class="col-xl-3 col-md-6">
        <div class="card h-100">
          <div class="card-body d-flex align-items-center justify-content-between py-3">
            <div>
              <div class="text-body text-opacity-50 small text-uppercase fw-semibold">SVMS</div>
              <div class="display-6 mb-0 text-info">{svmsCount.toLocaleString()}</div>
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
              <div class="text-body text-opacity-50 small text-uppercase fw-semibold">ATA</div>
              <div class="display-6 mb-0 text-success">{ataCount.toLocaleString()}</div>
            </div>
            <i class="bi bi-cpu fs-2 text-success opacity-50"></i>
          </div>
          <div class="card-arrow"><div class="card-arrow-top-left"></div><div class="card-arrow-top-right"></div><div class="card-arrow-bottom-left"></div><div class="card-arrow-bottom-right"></div></div>
        </div>
      </div>
      <div class="col-xl-3 col-md-6">
        <div class="card h-100">
          <div class="card-body d-flex align-items-center justify-content-between py-3">
            <div>
              <div class="text-body text-opacity-50 small text-uppercase fw-semibold">IBOC</div>
              <div class="display-6 mb-0 text-purple">{ibocCount.toLocaleString()}</div>
            </div>
            <i class="bi bi-robot fs-2 text-purple opacity-50"></i>
          </div>
          <div class="card-arrow"><div class="card-arrow-top-left"></div><div class="card-arrow-top-right"></div><div class="card-arrow-bottom-left"></div><div class="card-arrow-bottom-right"></div></div>
        </div>
      </div>
    </div>
  </div>

  <!-- Toolbar -->
  <div class="edge-toolbar p-3 border-bottom">
    <div class="input-group mb-3">
      <button class="btn btn-outline-secondary dropdown-toggle text-uppercase" type="button" data-bs-toggle="dropdown" aria-expanded="false">
        {typeLabel()} &nbsp;
      </button>
      <div class="dropdown-menu">
        <button type="button" class="dropdown-item text-uppercase" onclick={() => { typeFilter = 'all'; pageIndex = 1 }}>All</button>
        <button type="button" class="dropdown-item text-uppercase" onclick={() => { typeFilter = 'svms'; pageIndex = 1 }}>SVMS</button>
        <button type="button" class="dropdown-item text-uppercase" onclick={() => { typeFilter = 'ata'; pageIndex = 1 }}>ATA</button>
        <button type="button" class="dropdown-item text-uppercase" onclick={() => { typeFilter = 'iboc'; pageIndex = 1 }}>IBOC</button>
      </div>
      <div class="flex-fill position-relative">
        <div class="input-group">
          <div class="input-group-text position-absolute top-0 bottom-0 bg-none border-0 pe-0">
            <i class="fa fa-search opacity-5"></i>
          </div>
          <input
            type="text"
            class="form-control ps-30px border-start-0"
            placeholder="Search edge devices…"
            bind:value={search}
            oninput={onSearchInput}
            onkeydown={(e) => {
              if (e.key === 'Enter') {
                if (searchTimer) { clearTimeout(searchTimer); searchTimer = null }
                load()
              }
            }}
          />
        </div>
      </div>
    </div>

    <div class="d-flex flex-wrap gap-4 text-uppercase text-nowrap mb-n2 small">
      <button
        type="button"
        class="btn btn-link p-0 fw-semibold text-body text-opacity-75 d-flex align-items-center gap-2 text-decoration-none"
        onclick={exportCsv}
        disabled={loading || exporting || rows.length === 0}
        title={selectedIds.size > 0 ? `Export ${selectedIds.size} selected` : 'Export all (filtered)'}
      >
        <i class={`fa ${exporting ? 'fa-spinner fa-spin' : 'fa-download'} fa-fw text-body text-opacity-25`}></i>
        {exporting ? 'Exporting…' : 'Export'}
      </button>
      <button type="button" class="btn btn-link p-0 fw-semibold text-body text-opacity-75 d-flex align-items-center gap-2 text-decoration-none" onclick={load} disabled={loading}>
        <i class="fa fa-arrows-rotate fa-fw text-body text-opacity-25"></i>
        {loading ? 'Loading…' : 'Refresh'}
      </button>
      {#if search || typeFilter !== 'all'}
        <button type="button" class="btn btn-link p-0 fw-semibold text-body text-opacity-75 d-flex align-items-center gap-2 text-decoration-none" onclick={() => { search = ''; typeFilter = 'all'; pageIndex = 1; load() }}>
          <i class="fa fa-xmark fa-fw text-body text-opacity-25"></i> Clear
        </button>
      {/if}
      <div class="ms-auto text-body text-opacity-50 d-flex align-items-center gap-2">
        <span>Per page</span>
        <select class="form-select form-select-sm" style="width: auto" bind:value={perPage} onchange={() => (pageIndex = 1)}>
          {#each PER_PAGE_OPTIONS as n}
            <option value={n}>{n}</option>
          {/each}
        </select>
      </div>
    </div>
  </div>

  {#if errorMsg}
    <div class="alert alert-danger small mx-3 mt-3 mb-0">{errorMsg}</div>
  {/if}

  <!-- Table -->
  <div class="edge-table-region">
    <div class="table-responsive edge-table-scroll">
      <table class="table table-striped table-sm table-card text-nowrap mb-1 align-middle">
        <thead>
          <tr>
            <th style="width: 36px;">
              <input
                type="checkbox"
                class="form-check-input"
                aria-label="Select all"
                checked={allSelected}
                indeterminate={someSelected}
                onchange={(e) => toggleAll(e.currentTarget.checked)}
              />
            </th>
            <th style="width: 44px;" class="text-center">#</th>
            <th>Type</th>
            <th>Name</th>
            <th>Username</th>
            <th>URL</th>
            <th class="text-center">TLS</th>
            <th>Created</th>
            <th class="text-end" style="width: 132px;">Actions</th>
          </tr>
        </thead>
        <tbody>
          {#if loading && rows.length === 0}
            <tr><td colspan="9" class="text-center py-4 text-uppercase text-body text-opacity-50">
              <div class="spinner-border spinner-border-sm text-theme me-2"></div>Loading…
            </td></tr>
          {:else if paged.length === 0}
            <tr><td colspan="9" class="text-center py-4 text-uppercase text-body text-opacity-50">No edge devices</td></tr>
          {:else}
            {#each paged as d, i (d.id)}
              <tr>
                <td>
                  <input
                    type="checkbox"
                    class="form-check-input"
                    aria-label={`Select ${d.name}`}
                    checked={selectedIds.has(d.id)}
                    onchange={(e) => toggleRow(d.id, e.currentTarget.checked)}
                  />
                </td>
                <td class="text-center text-body text-opacity-50">{offset + i + 1}</td>
                <td><span class="fw-semibold {typeBadgeClass(d.type)}">{(d.type ?? '-').toUpperCase()}</span></td>
                <td class="fw-semibold">{d.name || '—'}</td>
                <td class="text-body text-opacity-75">{d.username || '—'}</td>
                <td>
                  {#if d.url}
                    <a href={d.url} target="_blank" rel="noopener noreferrer" class="text-decoration-none edge-url-cell d-inline-block text-truncate">{d.url}</a>
                  {:else}
                    —
                  {/if}
                </td>
                <td class="text-center">
                  {#if d.tls}<i class="bi bi-shield-check text-success"></i>{:else}<i class="bi bi-shield-slash text-body text-opacity-25"></i>{/if}
                </td>
                <td>{d.createdAt ? new Date(d.createdAt).toLocaleString() : '—'}</td>
                <td class="text-end">
                  <div class="btn-group btn-group-sm edge-row-actions" role="group" aria-label={`Actions for ${d.name}`}>
                    <button type="button" class="btn btn-outline-secondary" title="Sync" aria-label={`Sync ${d.name}`} onclick={() => runSync(d)} disabled={!syncableType(d.type) || syncingIds.has(d.id)}>
                      {#if syncingIds.has(d.id)}<span class="spinner-border spinner-border-sm"></span>{:else}<i class="bi bi-arrow-repeat"></i>{/if}
                    </button>
                    <button type="button" class="btn btn-outline-secondary" title="Edit" aria-label={`Edit ${d.name}`} onclick={() => openEdit(d)}>
                      <i class="bi bi-pencil"></i>
                    </button>
                    <button type="button" class="btn btn-outline-danger" title="Delete" aria-label={`Delete ${d.name}`} onclick={() => openDelete(d)}>
                      <i class="bi bi-trash"></i>
                    </button>
                  </div>
                </td>
              </tr>
            {/each}
          {/if}
        </tbody>
      </table>
    </div>
  </div>

  <!-- Pagination footer -->
  <div class="p-3 border-top">
    <div class="d-lg-flex align-items-center gap-3">
      <div class="text-body text-opacity-50 flex-1 text-lg-start text-center mb-2 mb-lg-0">
        Showing <span class="text-body">{showingFrom} to {showingTo}</span> of <span class="text-body">{totalEntries}</span> entries
        {#if selectedIds.size > 0}<span class="ms-2 text-theme">· {selectedIds.size} selected</span>{/if}
      </div>
      <ul class="pagination pagination-sm mb-0 justify-content-center">
        <li class="page-item" class:disabled={safePage <= 1}>
          <button type="button" class="page-link" onclick={() => gotoPage(safePage - 1)} disabled={safePage <= 1}>Previous</button>
        </li>
        {#each pageNumbers as p}
          <li class="page-item" class:active={p === safePage}>
            <button type="button" class="page-link" onclick={() => gotoPage(p)}>{p}</button>
          </li>
        {/each}
        <li class="page-item" class:disabled={safePage >= totalPages}>
          <button type="button" class="page-link" onclick={() => gotoPage(safePage + 1)} disabled={safePage >= totalPages}>Next</button>
        </li>
      </ul>
    </div>
  </div>
</div>

<!-- Create / Edit modal -->
<Modal bind:open={formOpen} title={formMode === 'create' ? 'Add edge device' : 'Edit edge device'} size="lg" dismissible={!formBusy}>
  {#snippet body()}
    <div class="edge-form">
      <!-- Type selector -->
      <div class="text-uppercase fw-semibold text-body text-opacity-75 mb-2">Device type</div>
      <div class="edge-type-grid mb-4">
        {#each TYPE_OPTIONS as opt (opt.value)}
          <button
            type="button"
            class="edge-type-card"
            class:active={edgeType === opt.value}
            disabled={formMode === 'edit'}
            onclick={() => (edgeType = opt.value)}
          >
            <i class={`bi ${opt.icon}`}></i>
            <span class="edge-type-label">{opt.label}</span>
            <span class="edge-type-blurb">{opt.blurb}</span>
            {#if edgeType === opt.value}<i class="bi bi-check-circle-fill edge-type-check"></i>{/if}
          </button>
        {/each}
      </div>

      <div class="row g-3">
        <div class="col-md-6">
          <label class="form-label" for="edge-name">Device name <span class="text-danger">*</span></label>
          <input id="edge-name" class="form-control form-control-sm" bind:value={form.name} placeholder="Enter device name" />
        </div>
        <div class="col-md-6">
          <label class="form-label" for="edge-username">Username <span class="text-danger">*</span></label>
          <input id="edge-username" class="form-control form-control-sm" bind:value={form.username} autocomplete="off" placeholder="Enter username" />
        </div>
        <div class="col-md-6">
          <label class="form-label" for="edge-password">
            Password {#if formMode === 'create'}<span class="text-danger">*</span>{:else}<span class="text-body text-opacity-50 text-lowercase fw-normal">(leave blank to keep)</span>{/if}
          </label>
          <input id="edge-password" type="password" class="form-control form-control-sm" bind:value={form.password} autocomplete="new-password" placeholder="Enter password" />
        </div>
        <div class="col-md-6">
          <label class="form-label" for="edge-url">URL <span class="text-danger">*</span></label>
          <input id="edge-url" class="form-control form-control-sm" bind:value={form.url} placeholder="https://example.com" />
        </div>

        {#if edgeType === 'ata'}
          <div class="col-md-6">
            <label class="form-label" for="edge-apikey">API key <span class="text-danger">*</span></label>
            <input id="edge-apikey" class="form-control form-control-sm" bind:value={form.apiKey} autocomplete="off" placeholder="Enter API key" />
          </div>
          <div class="col-md-6">
            <label class="form-label" for="edge-apisecret">
              API secret {#if formMode === 'create'}<span class="text-danger">*</span>{:else}<span class="text-body text-opacity-50 text-lowercase fw-normal">(leave blank to keep)</span>{/if}
            </label>
            <input id="edge-apisecret" type="password" class="form-control form-control-sm" bind:value={form.apiSecret} autocomplete="new-password" placeholder="Enter API secret" />
          </div>
        {/if}

        <div class="col-12">
          <div class="form-check form-switch">
            <input id="edge-tls" type="checkbox" class="form-check-input" bind:checked={form.tls} />
            <label class="form-check-label" for="edge-tls">Enable TLS (secure connection)</label>
          </div>
        </div>
      </div>
    </div>
  {/snippet}
  {#snippet footer()}
    <button type="button" class="btn btn-outline-secondary btn-sm text-uppercase" onclick={() => (formOpen = false)} disabled={formBusy}>
      Cancel
    </button>
    <button type="button" class="btn btn-outline-theme btn-sm text-uppercase" onclick={saveForm} disabled={formBusy || !formValid}>
      {#if formBusy}<span class="spinner-border spinner-border-sm me-1"></span>{/if}
      {formMode === 'create' ? 'Create' : 'Save'}
    </button>
  {/snippet}
</Modal>

<!-- Delete confirm -->
<ConfirmDialog
  bind:open={deleteOpen}
  title="Delete edge device?"
  message={deleteTarget ? `"${deleteTarget.name}" (${(deleteTarget.type ?? '').toUpperCase()}) will be removed. This cannot be undone.` : ''}
  confirmLabel="Delete"
  cancelLabel="Cancel"
  danger
  busy={deleteBusy}
  onConfirm={confirmDelete}
/>

<style>
  .edge-page {
    height: 100%;
    min-height: 0;
    font-size: 0.8125rem;
  }

  .edge-toolbar {
    flex: 0 0 auto;
    background: rgba(var(--bs-body-bg-rgb), 0.84);
    backdrop-filter: blur(10px);
  }

  .edge-table-region {
    flex: 1 1 auto;
    min-height: 0;
    display: flex;
  }

  .edge-table-scroll {
    flex: 1 1 auto;
    min-height: 0;
    overflow: auto;
  }

  .edge-table-scroll :global(thead th) {
    position: sticky;
    top: 0;
    z-index: 3;
    background: rgba(var(--bs-body-bg-rgb), 0.96);
    backdrop-filter: blur(10px);
  }

  .edge-page :global(.page-header) {
    font-size: 1.25rem;
  }

  .edge-page :global(.page-header small) {
    font-size: 0.6875rem;
  }

  .edge-page :global(.display-6) {
    font-size: 1.75rem;
  }

  .edge-page :global(.table) {
    font-size: 0.78125rem;
  }

  .edge-page :global(.table thead th) {
    font-size: 0.65625rem;
  }

  .text-purple {
    color: #9d6bff;
  }

  .edge-url-cell {
    max-width: 16rem;
    vertical-align: bottom;
  }

  .edge-row-actions :global(.btn) {
    width: 2rem;
    padding-inline: 0;
  }

  /* Type selector cards in the add/edit modal */
  .edge-type-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0.75rem;
  }

  .edge-type-card {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.35rem;
    padding: 1rem 0.75rem;
    border: 2px solid rgba(var(--bs-theme-rgb), 0.26);
    background: rgba(var(--bs-body-bg-rgb), 0.18);
    border-radius: 0.4rem;
    cursor: pointer;
    transition: border-color 0.15s ease, background 0.15s ease;
  }

  .edge-type-card:disabled {
    cursor: default;
    opacity: 0.55;
  }

  .edge-type-card.active {
    border-color: var(--bs-theme);
    background: rgba(var(--bs-theme-rgb), 0.12);
  }

  .edge-type-card i {
    font-size: 1.5rem;
  }

  .edge-type-label {
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .edge-type-blurb {
    font-size: 0.65rem;
    text-align: center;
    color: rgba(var(--bs-body-color-rgb), 0.55);
  }

  .edge-type-check {
    position: absolute;
    top: 0.4rem;
    right: 0.4rem;
    color: var(--bs-theme);
    font-size: 0.9rem;
  }

  .edge-form :global(.form-label) {
    margin-bottom: 0.3rem;
    font-size: 0.72rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  @media (max-width: 575.98px) {
    .edge-type-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
