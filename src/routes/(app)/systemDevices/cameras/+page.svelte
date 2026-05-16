<!-- src/routes/(app)/systemDevices/cameras/+page.svelte
     Full-CRUD camera registry page.
     Mirrors phibek users page pattern: KPI summary cards (monitor state),
     toolbar with search + monitor-state filter, table with row actions,
     inline create/edit modal, delete confirm dialog, and pagination footer. -->
<script lang="ts">
  import { onMount } from 'svelte'
  import { setPageTitle } from '$lib/utils/title'
  import Modal from '$lib/components/shared/Modal.svelte'
  import ConfirmDialog from '$lib/components/shared/ConfirmDialog.svelte'
  import {
    createCamera,
    deleteCamera,
    listCameras,
    syncCameraMonitor,
    updateCamera,
    type Camera,
    type CameraInput,
    type MonitorState
  } from '$lib/api/devices'
  import { notify } from '$lib/stores/notify'
  import { m } from '$lib/i18n/messages'

  type MonitorFilter = 'all' | MonitorState

  // ─────────── data ───────────
  let rows = $state<Camera[]>([])
  let loading = $state(false)
  let errorMsg = $state('')
  let totalRecords = $state(0)
  let summary = $state({ online: 0, offline: 0, suspect: 0, unknown: 0 })

  // ─────────── filters ───────────
  let search = $state('')
  let monitorFilter = $state<MonitorFilter>('all')
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
  let form = $state<CameraInput>({
    name: '',
    url: '',
    brand: '',
    district: '',
    lat: 13.7563,
    lng: 100.5018,
    user: '',
    password: '',
    angle: '',
    mapVisibility: 'public',
    description: '',
    offlineDescription: ''
  })

  // ─────────── delete dialog ───────────
  let deleteOpen = $state(false)
  let deleteBusy = $state(false)
  let deleteTarget = $state<Camera | null>(null)

  // ─────────── sync monitor ───────────
  let syncing = $state(false)

  // ─────────── derived ───────────
  const totalSummary = $derived(summary.online + summary.offline + summary.suspect + summary.unknown)
  const totalForPct = $derived(totalSummary > 0 ? totalSummary : Math.max(totalRecords, rows.length))
  function pct(n: number): number {
    return totalForPct > 0 ? Math.round((n / totalForPct) * 100) : 0
  }

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

  // ─────────── load ───────────
  async function load() {
    if (loading) return
    loading = true
    errorMsg = ''
    const { data, error } = await listCameras({
      page: safePage,
      perPage,
      search: search.trim() || undefined,
      monitorState: monitorFilter === 'all' ? undefined : monitorFilter,
      sortField: 'dateTimeCreate',
      sortOrder: 'desc'
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

    // Recompute summary counters from current page if backend doesn't surface them.
    // For an accurate org-scoped total we'd need a separate /summary endpoint;
    // counting the visible page is "good enough" for a top-of-page indicator.
    const next = { online: 0, offline: 0, suspect: 0, unknown: 0 }
    for (const r of rows) {
      const state = (r.monitorState ?? 'unknown') as MonitorState
      if (state === 'online' || state === 'offline' || state === 'suspect' || state === 'unknown') {
        next[state]++
      } else {
        next.unknown++
      }
    }
    summary = next
  }

  function setFilter(next: MonitorState) {
    monitorFilter = monitorFilter === next ? 'all' : next
    pageIndex = 1
    void load()
  }

  function clearFilters() {
    monitorFilter = 'all'
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
      name: '',
      url: '',
      brand: '',
      district: '',
      lat: 13.7563,
      lng: 100.5018,
      user: '',
      password: '',
      angle: '',
      mapVisibility: 'public',
      description: '',
      offlineDescription: ''
    }
    showPassword = false
  }

  function openCreate() {
    resetForm()
    formMode = 'create'
    editingId = null
    formOpen = true
  }

  function openEdit(row: Camera) {
    resetForm()
    formMode = 'edit'
    editingId = row.id || row.camId || null
    form = {
      name: row.name ?? '',
      url: row.url ?? '',
      brand: row.brand ?? '',
      district: row.district ?? '',
      lat: typeof row.lat === 'number' ? row.lat : 13.7563,
      lng: typeof row.lng === 'number' ? row.lng : 100.5018,
      user: row.user ?? '',
      password: '',
      angle: row.angle ?? '',
      mapVisibility: (row.mapVisibility ?? 'public') as 'public' | 'internal',
      description: row.description ?? '',
      offlineDescription: row.offlineDescription ?? ''
    }
    formOpen = true
  }

  async function submitForm() {
    if (formBusy) return
    formBusy = true
    try {
      const payload: CameraInput = {
        name: form.name?.trim() || undefined,
        url: form.url?.trim() || undefined,
        brand: form.brand?.trim() || undefined,
        district: form.district?.trim() || undefined,
        lat: typeof form.lat === 'number' && Number.isFinite(form.lat) ? form.lat : undefined,
        lng: typeof form.lng === 'number' && Number.isFinite(form.lng) ? form.lng : undefined,
        user: form.user?.trim() || undefined,
        password: form.password?.trim() || undefined,
        angle: form.angle?.trim() || undefined,
        mapVisibility: form.mapVisibility,
        description: form.description?.trim() || undefined,
        offlineDescription: form.offlineDescription?.trim() || undefined
      }

      if (formMode === 'create') {
        const { error } = await createCamera(payload)
        if (error) throw new Error(error.message)
        notify.success('เพิ่มกล้องสำเร็จ', form.name ?? '')
      } else if (editingId) {
        const { error } = await updateCamera(editingId, payload)
        if (error) throw new Error(error.message)
        notify.success('อัปเดตกล้องสำเร็จ', form.name ?? '')
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

  // ─────────── delete ───────────
  function openDelete(row: Camera) {
    deleteTarget = row
    deleteOpen = true
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    deleteBusy = true
    try {
      await deleteCamera(deleteTarget.id || deleteTarget.camId || '')
      notify.success('ลบกล้องแล้ว', deleteTarget.name)
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

  // ─────────── sync monitor ───────────
  async function runSyncMonitor() {
    if (syncing) return
    syncing = true
    try {
      const { data, error } = await syncCameraMonitor()
      if (error) throw new Error(error.message)
      const r = data?.details ?? { registered: 0, skipped: 0, failed: 0 }
      const title = r.failed > 0 ? 'ซิงก์เสร็จแบบบางส่วน' : 'ซิงก์สถานะกล้องสำเร็จ'
      const body = `ลงทะเบียน ${r.registered} • ข้าม ${r.skipped} • ล้มเหลว ${r.failed}`
      if (r.failed > 0) notify.warning(title, body)
      else notify.success(title, body)
      await load()
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      notify.error('ซิงก์สถานะกล้องไม่สำเร็จ', msg)
    } finally {
      syncing = false
    }
  }

  // ─────────── badge helpers ───────────
  function badgeClass(state: string | undefined): string {
    switch (state) {
      case 'online': return 'bg-success'
      case 'offline': return 'bg-danger'
      case 'suspect': return 'bg-warning text-dark'
      default: return 'bg-secondary'
    }
  }

  function badgeLabel(state: string | undefined): string {
    switch (state) {
      case 'online': return 'Online'
      case 'offline': return 'Offline'
      case 'suspect': return 'Suspect'
      default: return 'Unknown'
    }
  }

  onMount(() => {
    setPageTitle(`${m.navSystemDevices()} · ${m.navSystemDevicesCameras()}`)
    void load()
  })
</script>

<div class="page-shell">
  <!-- Page header -->
  <div class="d-flex flex-wrap align-items-center justify-content-between gap-3 mb-3">
    <div>
      <h1 class="page-header mb-1">
        <i class="bi bi-camera-video text-theme me-2"></i>{m.navSystemDevicesCameras()}
      </h1>
      <div class="text-body text-opacity-50 small">Camera registry · status / location / source · BE-backed CRUD</div>
    </div>
    <div class="d-flex gap-2 flex-wrap">
      <button type="button" class="btn btn-outline-theme btn-sm" onclick={runSyncMonitor} disabled={syncing}>
        <i class="bi {syncing ? 'bi-arrow-repeat spin' : 'bi-arrow-repeat'} me-1"></i>
        Sync monitor
      </button>
      <button type="button" class="btn btn-theme btn-sm" onclick={openCreate}>
        <i class="bi bi-plus-lg me-1"></i> Add camera
      </button>
    </div>
  </div>

  <!-- KPI cards -->
  <div class="row g-3 mb-3">
    <div class="col-6 col-lg-3">
      <button type="button" class="kpi-card w-100" class:active={monitorFilter === 'online'} onclick={() => setFilter('online')}>
        <div class="kpi-icon bg-success bg-opacity-25 text-success"><i class="bi bi-check-circle"></i></div>
        <div class="kpi-body">
          <div class="kpi-label">Online</div>
          <div class="kpi-value">{summary.online.toLocaleString()}</div>
          <div class="kpi-foot small text-body text-opacity-50">{pct(summary.online)}% of total</div>
        </div>
      </button>
    </div>
    <div class="col-6 col-lg-3">
      <button type="button" class="kpi-card w-100" class:active={monitorFilter === 'offline'} onclick={() => setFilter('offline')}>
        <div class="kpi-icon bg-danger bg-opacity-25 text-danger"><i class="bi bi-x-circle"></i></div>
        <div class="kpi-body">
          <div class="kpi-label">Offline</div>
          <div class="kpi-value">{summary.offline.toLocaleString()}</div>
          <div class="kpi-foot small text-body text-opacity-50">{pct(summary.offline)}% of total</div>
        </div>
      </button>
    </div>
    <div class="col-6 col-lg-3">
      <button type="button" class="kpi-card w-100" class:active={monitorFilter === 'suspect'} onclick={() => setFilter('suspect')}>
        <div class="kpi-icon bg-warning bg-opacity-25 text-warning"><i class="bi bi-question-circle"></i></div>
        <div class="kpi-body">
          <div class="kpi-label">Suspect</div>
          <div class="kpi-value">{summary.suspect.toLocaleString()}</div>
          <div class="kpi-foot small text-body text-opacity-50">{pct(summary.suspect)}% of total</div>
        </div>
      </button>
    </div>
    <div class="col-6 col-lg-3">
      <button type="button" class="kpi-card w-100" class:active={monitorFilter === 'unknown'} onclick={() => setFilter('unknown')}>
        <div class="kpi-icon bg-secondary bg-opacity-25 text-secondary"><i class="bi bi-dash-circle"></i></div>
        <div class="kpi-body">
          <div class="kpi-label">Unknown</div>
          <div class="kpi-value">{summary.unknown.toLocaleString()}</div>
          <div class="kpi-foot small text-body text-opacity-50">{pct(summary.unknown)}% of total</div>
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
          <input class="form-control" placeholder="Search cameras…" bind:value={search} onkeydown={(e) => { if (e.key === 'Enter') { pageIndex = 1; void load() } }} />
          {#if search}
            <button type="button" class="btn btn-outline-secondary" aria-label="Clear search" title="Clear search" onclick={() => { search = ''; pageIndex = 1; void load() }}>
              <i class="bi bi-x"></i>
            </button>
          {/if}
        </div>
        <div class="d-flex align-items-center gap-2 ms-auto">
          {#if monitorFilter !== 'all' || search}
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

  <!-- Error banner -->
  {#if errorMsg}
    <div class="alert alert-danger small mb-3">{errorMsg}</div>
  {/if}

  <!-- Table -->
  <div class="card">
    <div class="table-responsive">
      <table class="table table-striped table-sm table-card text-nowrap mb-0 align-middle">
        <thead>
          <tr>
            <th>Name</th>
            <th>Brand</th>
            <th>Monitor</th>
            <th>District</th>
            <th>Updated</th>
            <th class="text-end" style="width: 110px;">Actions</th>
          </tr>
        </thead>
        <tbody>
          {#if loading && rows.length === 0}
            <tr><td colspan="6" class="text-center py-4 text-uppercase text-body text-opacity-50">
              <div class="spinner-border spinner-border-sm text-theme me-2"></div>Loading…
            </td></tr>
          {:else if rows.length === 0}
            <tr><td colspan="6" class="text-center py-4 text-uppercase text-body text-opacity-50">No cameras</td></tr>
          {:else}
            {#each rows as r (r.id || r.camId)}
              <tr>
                <td>
                  <div class="fw-semibold text-body">{r.name || '—'}</div>
                  {#if r.url}
                    <div class="small text-body text-opacity-50 text-truncate" style="max-width: 320px">{r.url}</div>
                  {/if}
                </td>
                <td class="text-body text-opacity-75">{r.brand || '—'}</td>
                <td><span class="badge {badgeClass(r.monitorState)}">{badgeLabel(r.monitorState)}</span></td>
                <td class="text-body text-opacity-75">{r.district || '—'}</td>
                <td class="text-body text-opacity-75">{(r.updateAt ?? r.dateTimeUpdate) ? new Date(r.updateAt ?? r.dateTimeUpdate!).toLocaleString() : '—'}</td>
                <td class="text-end">
                  <div class="btn-group btn-group-sm">
                    <button type="button" class="btn btn-outline-secondary" title="Edit" onclick={() => openEdit(r)}>
                      <i class="bi bi-pencil"></i>
                    </button>
                    <button type="button" class="btn btn-outline-danger" title="Delete" onclick={() => openDelete(r)}>
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

    <!-- Pagination footer -->
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

<!-- Create / Edit modal -->
<Modal bind:open={formOpen} title={formMode === 'create' ? 'Add camera' : 'Edit camera'} size="lg" dismissible={!formBusy}>
  {#snippet body()}
    <form class="row g-3" onsubmit={(e) => { e.preventDefault(); void submitForm() }}>
      <div class="col-md-8">
        <label class="form-label" for="cam-name">Name</label>
        <input id="cam-name" class="form-control form-control-sm" bind:value={form.name} placeholder="e.g. Front gate camera" />
      </div>
      <div class="col-md-4">
        <label class="form-label" for="cam-brand">Brand</label>
        <input id="cam-brand" class="form-control form-control-sm" bind:value={form.brand} placeholder="HikVision / Dahua / Axis…" />
      </div>

      <div class="col-12">
        <label class="form-label" for="cam-url">RTSP URL</label>
        <input id="cam-url" class="form-control form-control-sm font-monospace" bind:value={form.url} placeholder="rtsp://host:554/path" />
        <div class="form-text">Stream URL probed by the monitoring engine.</div>
      </div>

      <div class="col-md-6">
        <label class="form-label" for="cam-user">User</label>
        <input id="cam-user" class="form-control form-control-sm" bind:value={form.user} autocomplete="off" />
      </div>
      <div class="col-md-6">
        <label class="form-label" for="cam-password">Password</label>
        <div class="input-group input-group-sm">
          <input
            id="cam-password"
            class="form-control"
            type={showPassword ? 'text' : 'password'}
            bind:value={form.password}
            autocomplete="new-password"
            placeholder={formMode === 'edit' ? 'Leave blank to keep current' : ''}
          />
          <button type="button" class="btn btn-outline-secondary" aria-label={showPassword ? 'Hide password' : 'Show password'} title={showPassword ? 'Hide password' : 'Show password'} onclick={() => (showPassword = !showPassword)}>
            <i class={showPassword ? 'bi bi-eye-slash' : 'bi bi-eye'}></i>
          </button>
        </div>
      </div>

      <div class="col-md-6">
        <label class="form-label" for="cam-district">District</label>
        <input id="cam-district" class="form-control form-control-sm" bind:value={form.district} />
      </div>
      <div class="col-md-3">
        <label class="form-label" for="cam-lat">Latitude</label>
        <input id="cam-lat" type="number" step="any" class="form-control form-control-sm font-monospace" bind:value={form.lat} />
      </div>
      <div class="col-md-3">
        <label class="form-label" for="cam-lng">Longitude</label>
        <input id="cam-lng" type="number" step="any" class="form-control form-control-sm font-monospace" bind:value={form.lng} />
      </div>

      <div class="col-md-4">
        <label class="form-label" for="cam-angle">Angle</label>
        <input id="cam-angle" class="form-control form-control-sm" bind:value={form.angle} placeholder="e.g. 90" />
      </div>
      <div class="col-md-4">
        <label class="form-label" for="cam-visibility">Map visibility</label>
        <select id="cam-visibility" class="form-select form-select-sm" bind:value={form.mapVisibility}>
          <option value="public">public</option>
          <option value="internal">internal</option>
        </select>
      </div>

      <div class="col-12">
        <label class="form-label" for="cam-description">Description</label>
        <textarea id="cam-description" class="form-control form-control-sm" rows="2" bind:value={form.description}></textarea>
      </div>

      <div class="col-12">
        <label class="form-label" for="cam-offline">Offline note</label>
        <textarea id="cam-offline" class="form-control form-control-sm" rows="2" bind:value={form.offlineDescription} placeholder="Operator note shown when the camera is offline."></textarea>
      </div>
    </form>
  {/snippet}
  {#snippet footer()}
    <button type="button" class="btn btn-outline-secondary btn-sm" onclick={() => (formOpen = false)} disabled={formBusy}>Cancel</button>
    <button type="button" class="btn btn-theme btn-sm" onclick={submitForm} disabled={formBusy}>
      {#if formBusy}<span class="spinner-border spinner-border-sm me-1"></span>{/if}
      {formMode === 'create' ? 'Add camera' : 'Save changes'}
    </button>
  {/snippet}
</Modal>

<ConfirmDialog
  bind:open={deleteOpen}
  title="Delete camera?"
  message={`This removes "${deleteTarget?.name ?? ''}" from the org. This action cannot be undone.`}
  confirmLabel="Delete"
  cancelLabel="Cancel"
  danger
  busy={deleteBusy}
  onConfirm={confirmDelete}
/>

<style>
  .page-shell {
    padding: 1rem;
  }

  .page-header {
    font-size: 1.4rem;
    font-weight: 700;
  }

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

  .kpi-card:hover {
    border-color: var(--bs-primary);
  }

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

  .kpi-body {
    flex: 1 1 auto;
    min-width: 0;
  }

  .kpi-label {
    font-size: .72rem;
    text-transform: uppercase;
    color: rgba(var(--bs-body-color-rgb), .55);
    font-weight: 600;
    letter-spacing: .03em;
  }

  .kpi-value {
    font-size: 1.45rem;
    font-weight: 700;
    line-height: 1.1;
  }

  .kpi-foot {
    line-height: 1.2;
  }

  .spin {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }
</style>
