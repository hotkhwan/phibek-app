<!-- src/routes/(app)/systemDevices/edge/+page.svelte
     Full CRUD page for klynx-managed edge nodes (SVMS / ATA / IBOC).
     Endpoint: /kapi/system/edge — mirrors klynx-feature pattern. -->
<script lang="ts">
  import { onMount } from 'svelte'
  import { setPageTitle } from '$lib/utils/title'
  import Modal from '$lib/components/shared/Modal.svelte'
  import ConfirmDialog from '$lib/components/shared/ConfirmDialog.svelte'
  import {
    createEdgeDevice,
    deleteEdgeDevice,
    listEdgeDevices,
    updateEdgeDevice,
    type EdgeDevice,
    type EdgeDeviceInput,
    type EdgeDeviceType
  } from '$lib/api/devices'
  import { notify } from '$lib/stores/notify'
  import { m } from '$lib/i18n/messages'

  type TypeFilter = 'all' | EdgeDeviceType

  // ─────────── data ───────────
  let rows = $state<EdgeDevice[]>([])
  let loading = $state(false)
  let errorMsg = $state('')
  let totalRecords = $state(0)

  // ─────────── filters ───────────
  let search = $state('')
  let typeFilter = $state<TypeFilter>('all')
  let perPage = $state(10)
  const PER_PAGE_OPTIONS = [10, 20, 50, 100]
  let pageIndex = $state(1)

  // ─────────── modal state ───────────
  type FormMode = 'create' | 'edit'
  let formOpen = $state(false)
  let formMode = $state<FormMode>('create')
  let formBusy = $state(false)
  let editingId = $state<string | null>(null)
  let showPassword = $state(false)
  let showApiSecret = $state(false)
  let form = $state<EdgeDeviceInput>({
    type: 'svms',
    name: '',
    username: '',
    password: '',
    url: '',
    tls: false,
    apiKey: '',
    apiSecret: ''
  })

  // ─────────── delete dialog ───────────
  let deleteOpen = $state(false)
  let deleteBusy = $state(false)
  let deleteTarget = $state<EdgeDevice | null>(null)

  // ─────────── derived ───────────
  const summary = $derived({
    svms: rows.filter((r) => r.type === 'svms').length,
    ata: rows.filter((r) => r.type === 'ata').length,
    iboc: rows.filter((r) => r.type === 'iboc').length
  })

  const totalPages = $derived(Math.max(1, Math.ceil(totalRecords / perPage)))
  const safePage = $derived(Math.min(Math.max(1, pageIndex), totalPages))
  const showingFrom = $derived(totalRecords === 0 ? 0 : (safePage - 1) * perPage + 1)
  const showingTo = $derived(Math.min(safePage * perPage, totalRecords))
  const pageNumbers = $derived.by(() => {
    const list: number[] = []
    const start = Math.max(1, safePage - 2)
    const end = Math.min(totalPages, start + 4)
    for (let i = start; i <= end; i++) list.push(i)
    return list
  })

  // ─────────── form validity ───────────
  const isFormValid = $derived.by(() => {
    if (!form.name || !form.username || !form.url) return false
    if (formMode === 'create' && !form.password) return false
    if (form.type === 'ata' && !form.apiKey) return false
    return true
  })

  // ─────────── load ───────────
  async function load() {
    if (loading) return
    loading = true
    errorMsg = ''
    const { data, error } = await listEdgeDevices({
      page: safePage,
      perPage,
      q: search.trim() || undefined,
      type: typeFilter === 'all' ? undefined : typeFilter
    })
    loading = false
    if (error) {
      errorMsg = error.message
      rows = []
      totalRecords = 0
      return
    }
    rows = data?.details?.items ?? []
    totalRecords = data?.pagination?.totalRecords ?? rows.length
  }

  function setTypeFilter(next: EdgeDeviceType) {
    typeFilter = typeFilter === next ? 'all' : next
    pageIndex = 1
    void load()
  }

  function clearFilters() {
    typeFilter = 'all'
    search = ''
    pageIndex = 1
    void load()
  }

  function gotoPage(p: number) {
    if (p < 1 || p > totalPages || p === safePage) return
    pageIndex = p
    void load()
  }

  function changePerPage(next: number) {
    perPage = next
    pageIndex = 1
    void load()
  }

  // ─────────── form ───────────
  function resetForm() {
    form = {
      type: 'svms',
      name: '',
      username: '',
      password: '',
      url: '',
      tls: false,
      apiKey: '',
      apiSecret: ''
    }
    showPassword = false
    showApiSecret = false
  }

  function openCreate() {
    resetForm()
    formMode = 'create'
    editingId = null
    formOpen = true
  }

  function openEdit(row: EdgeDevice) {
    resetForm()
    formMode = 'edit'
    editingId = row.id || null
    form = {
      type: (row.type as EdgeDeviceType) ?? 'svms',
      name: row.name ?? '',
      username: row.username ?? '',
      password: '',
      url: row.url ?? '',
      tls: row.tls ?? false,
      apiKey: '',
      apiSecret: ''
    }
    formOpen = true
  }

  async function submitForm() {
    if (formBusy || !isFormValid) return
    formBusy = true
    try {
      const payload: EdgeDeviceInput = {
        type: form.type,
        name: form.name?.trim(),
        username: form.username?.trim(),
        url: form.url?.trim(),
        tls: form.tls ?? false
      }
      // Only send password if user typed one (edit-keep semantics)
      if (form.password?.trim()) payload.password = form.password.trim()
      if (form.type === 'ata') {
        if (form.apiKey?.trim()) payload.apiKey = form.apiKey.trim()
        if (form.apiSecret?.trim()) payload.apiSecret = form.apiSecret.trim()
      }

      if (formMode === 'create') {
        const { error } = await createEdgeDevice(payload)
        if (error) throw new Error(error.message)
        notify.success('เพิ่ม edge device สำเร็จ', form.name ?? '')
      } else if (editingId) {
        const { error } = await updateEdgeDevice(editingId, payload)
        if (error) throw new Error(error.message)
        notify.success('อัปเดต edge device สำเร็จ', form.name ?? '')
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

  function openDelete(row: EdgeDevice) {
    deleteTarget = row
    deleteOpen = true
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    deleteBusy = true
    try {
      await deleteEdgeDevice(deleteTarget.id)
      notify.success('ลบ edge device แล้ว', deleteTarget.name)
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

  function typeBadgeClass(t: string | undefined): string {
    switch (t) {
      case 'svms': return 'bg-primary'
      case 'ata': return 'bg-info text-dark'
      case 'iboc': return 'bg-success'
      default: return 'bg-secondary'
    }
  }

  function statusBadgeClass(s: string | undefined): string {
    switch (s) {
      case 'online':
      case 'connected':
        return 'bg-success'
      case 'offline':
      case 'disconnected':
        return 'bg-danger'
      case 'pairing':
        return 'bg-warning text-dark'
      default:
        return 'bg-secondary'
    }
  }

  onMount(() => {
    setPageTitle(`${m.navSystemDevices()} · ${m.navSystemDevicesEdge()}`)
    void load()
  })
</script>

<div class="page-shell">
  <div class="d-flex flex-wrap align-items-center justify-content-between gap-3 mb-3">
    <div>
      <h1 class="page-header mb-1">
        <i class="bi bi-hdd-network text-theme me-2"></i>{m.navSystemDevicesEdge()}
      </h1>
      <div class="text-body text-opacity-50 small">SVMS / ATA / IBOC edge nodes · BE-backed CRUD via /kapi/system/edge</div>
    </div>
    <button type="button" class="btn btn-theme btn-sm" onclick={openCreate}>
      <i class="bi bi-plus-lg me-1"></i> Add edge device
    </button>
  </div>

  <!-- KPI by type -->
  <div class="row g-3 mb-3">
    <div class="col-6 col-lg-4">
      <button type="button" class="kpi-card w-100" class:active={typeFilter === 'svms'} onclick={() => setTypeFilter('svms')}>
        <div class="kpi-icon bg-primary bg-opacity-25 text-primary"><i class="bi bi-cpu"></i></div>
        <div class="kpi-body">
          <div class="kpi-label">SVMS</div>
          <div class="kpi-value">{summary.svms.toLocaleString()}</div>
          <div class="kpi-foot small text-body text-opacity-50">on this page</div>
        </div>
      </button>
    </div>
    <div class="col-6 col-lg-4">
      <button type="button" class="kpi-card w-100" class:active={typeFilter === 'ata'} onclick={() => setTypeFilter('ata')}>
        <div class="kpi-icon bg-info bg-opacity-25 text-info"><i class="bi bi-cpu-fill"></i></div>
        <div class="kpi-body">
          <div class="kpi-label">ATA</div>
          <div class="kpi-value">{summary.ata.toLocaleString()}</div>
          <div class="kpi-foot small text-body text-opacity-50">on this page</div>
        </div>
      </button>
    </div>
    <div class="col-6 col-lg-4">
      <button type="button" class="kpi-card w-100" class:active={typeFilter === 'iboc'} onclick={() => setTypeFilter('iboc')}>
        <div class="kpi-icon bg-success bg-opacity-25 text-success"><i class="bi bi-robot"></i></div>
        <div class="kpi-body">
          <div class="kpi-label">IBOC</div>
          <div class="kpi-value">{summary.iboc.toLocaleString()}</div>
          <div class="kpi-foot small text-body text-opacity-50">on this page</div>
        </div>
      </button>
    </div>
  </div>

  <!-- Toolbar -->
  <div class="card mb-3">
    <div class="card-body py-3">
      <div class="d-flex flex-wrap gap-2 align-items-center">
        <div class="input-group input-group-sm" style="max-width: 320px">
          <span class="input-group-text"><i class="bi bi-search"></i></span>
          <input class="form-control" placeholder="Search edge devices…" bind:value={search} onkeydown={(e) => { if (e.key === 'Enter') { pageIndex = 1; void load() } }} />
          {#if search}
            <button type="button" class="btn btn-outline-secondary" aria-label="Clear search" title="Clear" onclick={() => { search = ''; pageIndex = 1; void load() }}>
              <i class="bi bi-x"></i>
            </button>
          {/if}
        </div>
        <div class="d-flex align-items-center gap-2 ms-auto">
          {#if typeFilter !== 'all' || search}
            <button type="button" class="btn btn-outline-secondary btn-sm" onclick={clearFilters}>
              <i class="bi bi-x-circle me-1"></i> Clear
            </button>
          {/if}
          <select class="form-select form-select-sm" style="width: auto" bind:value={perPage} onchange={(e) => changePerPage(Number((e.target as HTMLSelectElement).value))}>
            {#each PER_PAGE_OPTIONS as opt}
              <option value={opt}>{opt} / page</option>
            {/each}
          </select>
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

  <div class="card">
    <div class="table-responsive">
      <table class="table table-striped table-sm table-card text-nowrap mb-0 align-middle">
        <thead>
          <tr>
            <th>Name</th>
            <th>Type</th>
            <th>URL</th>
            <th>TLS</th>
            <th>Status</th>
            <th>Last seen</th>
            <th class="text-end" style="width: 110px;">Actions</th>
          </tr>
        </thead>
        <tbody>
          {#if loading && rows.length === 0}
            <tr><td colspan="7" class="text-center py-4 text-uppercase text-body text-opacity-50">
              <div class="spinner-border spinner-border-sm text-theme me-2"></div>Loading…
            </td></tr>
          {:else if rows.length === 0}
            <tr><td colspan="7" class="text-center py-4 text-uppercase text-body text-opacity-50">No edge devices</td></tr>
          {:else}
            {#each rows as r (r.id)}
              <tr>
                <td>
                  <div class="fw-semibold text-body">{r.name || '—'}</div>
                  {#if r.username}
                    <div class="small text-body text-opacity-50">{r.username}</div>
                  {/if}
                </td>
                <td><span class="badge text-uppercase {typeBadgeClass(r.type)}">{r.type ?? '—'}</span></td>
                <td class="small text-body text-opacity-75 font-monospace text-truncate" style="max-width: 280px">{r.url || '—'}</td>
                <td>{r.tls ? '🔒' : '—'}</td>
                <td><span class="badge {statusBadgeClass(r.status)}">{r.status ?? '—'}</span></td>
                <td class="text-body text-opacity-75">{r.lastSeenAt ? new Date(r.lastSeenAt).toLocaleString() : '—'}</td>
                <td class="text-end">
                  <div class="btn-group btn-group-sm">
                    <button type="button" class="btn btn-outline-secondary" title="Edit" aria-label="Edit" onclick={() => openEdit(r)}>
                      <i class="bi bi-pencil"></i>
                    </button>
                    <button type="button" class="btn btn-outline-danger" title="Delete" aria-label="Delete" onclick={() => openDelete(r)}>
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

    <div class="p-3 border-top">
      <div class="d-lg-flex align-items-center gap-3">
        <div class="text-body text-opacity-50 flex-1 text-lg-start text-center mb-2 mb-lg-0">
          Showing <span class="text-body">{showingFrom} to {showingTo}</span> of <span class="text-body">{totalRecords}</span> entries
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

    <div class="card-arrow">
      <div class="card-arrow-top-left"></div>
      <div class="card-arrow-top-right"></div>
      <div class="card-arrow-bottom-left"></div>
      <div class="card-arrow-bottom-right"></div>
    </div>
  </div>
</div>

<Modal bind:open={formOpen} title={formMode === 'create' ? 'Add edge device' : 'Edit edge device'} size="lg" dismissible={!formBusy}>
  {#snippet body()}
    <form class="row g-3" onsubmit={(e) => { e.preventDefault(); void submitForm() }}>
      <div class="col-md-6">
        <label class="form-label" for="edge-type">Type</label>
        <select id="edge-type" class="form-select form-select-sm" bind:value={form.type} disabled={formMode === 'edit'}>
          <option value="svms">SVMS</option>
          <option value="ata">ATA</option>
          <option value="iboc">IBOC</option>
        </select>
        {#if formMode === 'edit'}
          <div class="form-text">Type cannot change after creation.</div>
        {/if}
      </div>
      <div class="col-md-6">
        <label class="form-label" for="edge-name">Name *</label>
        <input id="edge-name" class="form-control form-control-sm" bind:value={form.name} required />
      </div>

      <div class="col-md-6">
        <label class="form-label" for="edge-username">Username *</label>
        <input id="edge-username" class="form-control form-control-sm" bind:value={form.username} autocomplete="username" required />
      </div>
      <div class="col-md-6">
        <label class="form-label" for="edge-password">Password {formMode === 'create' ? '*' : ''}</label>
        <div class="input-group input-group-sm">
          <input
            id="edge-password"
            class="form-control"
            type={showPassword ? 'text' : 'password'}
            bind:value={form.password}
            autocomplete="new-password"
            placeholder={formMode === 'edit' ? 'Leave blank to keep current' : ''}
          />
          <button type="button" class="btn btn-outline-secondary" aria-label={showPassword ? 'Hide' : 'Show'} title={showPassword ? 'Hide' : 'Show'} onclick={() => (showPassword = !showPassword)}>
            <i class={showPassword ? 'bi bi-eye-slash' : 'bi bi-eye'}></i>
          </button>
        </div>
      </div>

      <div class="col-md-10">
        <label class="form-label" for="edge-url">URL *</label>
        <input id="edge-url" class="form-control form-control-sm font-monospace" bind:value={form.url} placeholder="https://edge.example.com" required />
      </div>
      <div class="col-md-2 d-flex align-items-end">
        <div class="form-check form-switch">
          <input id="edge-tls" class="form-check-input" type="checkbox" role="switch" bind:checked={form.tls} />
          <label class="form-check-label small" for="edge-tls">TLS</label>
        </div>
      </div>

      {#if form.type === 'ata'}
        <div class="col-12">
          <hr class="my-1" />
          <div class="small text-body text-opacity-50 mb-1">ATA-only credentials</div>
        </div>
        <div class="col-md-6">
          <label class="form-label" for="edge-apikey">API key *</label>
          <input id="edge-apikey" class="form-control form-control-sm font-monospace" bind:value={form.apiKey} autocomplete="off" />
        </div>
        <div class="col-md-6">
          <label class="form-label" for="edge-apisecret">API secret</label>
          <div class="input-group input-group-sm">
            <input
              id="edge-apisecret"
              class="form-control font-monospace"
              type={showApiSecret ? 'text' : 'password'}
              bind:value={form.apiSecret}
              autocomplete="off"
              placeholder={formMode === 'edit' ? 'Leave blank to keep current' : ''}
            />
            <button type="button" class="btn btn-outline-secondary" aria-label={showApiSecret ? 'Hide' : 'Show'} title={showApiSecret ? 'Hide' : 'Show'} onclick={() => (showApiSecret = !showApiSecret)}>
              <i class={showApiSecret ? 'bi bi-eye-slash' : 'bi bi-eye'}></i>
            </button>
          </div>
        </div>
      {/if}
    </form>
  {/snippet}
  {#snippet footer()}
    <button type="button" class="btn btn-outline-secondary btn-sm" onclick={() => (formOpen = false)} disabled={formBusy}>Cancel</button>
    <button type="button" class="btn btn-theme btn-sm" onclick={submitForm} disabled={formBusy || !isFormValid}>
      {#if formBusy}<span class="spinner-border spinner-border-sm me-1"></span>{/if}
      {formMode === 'create' ? 'Add edge device' : 'Save changes'}
    </button>
  {/snippet}
</Modal>

<ConfirmDialog
  bind:open={deleteOpen}
  title="Delete edge device?"
  message={`This removes "${deleteTarget?.name ?? ''}" from the org. This action cannot be undone.`}
  confirmLabel="Delete"
  cancelLabel="Cancel"
  danger
  busy={deleteBusy}
  onConfirm={confirmDelete}
/>

<style>
  .page-shell { padding: 1rem; }
  .page-header { font-size: 1.4rem; font-weight: 700; }
  .kpi-card {
    display: flex;
    align-items: center;
    gap: .9rem;
    width: 100%;
    padding: .9rem 1rem;
    border: 1px solid var(--bs-border-color);
    border-radius: 8px;
    background: var(--bs-body-bg);
    transition: border-color .15s, box-shadow .15s;
    text-align: left;
  }
  .kpi-card:hover { border-color: var(--bs-primary); }
  .kpi-card.active {
    border-color: var(--bs-primary);
    box-shadow: 0 0 0 2px rgba(var(--bs-primary-rgb), .12);
  }
  .kpi-icon {
    display: grid;
    width: 40px;
    height: 40px;
    place-items: center;
    border-radius: 8px;
    flex: 0 0 auto;
    font-size: 1.2rem;
  }
  .kpi-body { flex: 1 1 auto; min-width: 0; }
  .kpi-label {
    font-size: .72rem;
    text-transform: uppercase;
    color: rgba(var(--bs-body-color-rgb), .55);
    font-weight: 600;
    letter-spacing: .03em;
  }
  .kpi-value { font-size: 1.45rem; font-weight: 700; line-height: 1.1; }
  .spin { animation: spin 1s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
</style>
