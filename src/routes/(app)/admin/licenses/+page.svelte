<!-- src/routes/(app)/admin/licenses/+page.svelte
     Per-customer license issuance + lifecycle (activate / suspend / terminate / renew). -->
<script lang="ts">
  import { onMount } from 'svelte'
  import { setPageTitle } from '$lib/utils/title'
  import Modal from '$lib/components/shared/Modal.svelte'
  import {
    activateLicense,
    listLicenses,
    renewLicense,
    suspendLicense,
    terminateLicense,
    type License,
    type LicenseStatus
  } from '$lib/api/adminLicense'
  import { notify } from '$lib/stores/notify'
  import { m } from '$lib/i18n/messages'

  type StatusFilter = 'all' | LicenseStatus

  let rows = $state<License[]>([])
  let loading = $state(false)
  let errorMsg = $state('')
  let totalRecords = $state(0)

  let search = $state('')
  let statusFilter = $state<StatusFilter>('all')
  let perPage = $state(10)
  const PER_PAGE_OPTIONS = [10, 20, 50, 100]
  let pageIndex = $state(1)

  type ActionKind = 'activate' | 'suspend' | 'terminate'
  let actionOpen = $state(false)
  let actionBusy = $state(false)
  let actionKind = $state<ActionKind>('activate')
  let actionTarget = $state<License | null>(null)
  let actionReason = $state('')

  let renewOpen = $state(false)
  let renewBusy = $state(false)
  let renewTarget = $state<License | null>(null)
  let renewExpiresAt = $state('')
  let renewReason = $state('')

  const summary = $derived({
    total: totalRecords || rows.length,
    active: rows.filter((r) => r.status === 'active').length,
    suspended: rows.filter((r) => r.status === 'suspended').length,
    expired: rows.filter((r) => r.status === 'expired' || r.status === 'terminated').length
  })

  const totalPages = $derived(Math.max(1, Math.ceil(totalRecords / perPage)))
  const safePage = $derived(Math.min(Math.max(1, pageIndex), totalPages))
  const showingFrom = $derived(totalRecords === 0 ? 0 : (safePage - 1) * perPage + 1)
  const showingTo = $derived(Math.min(safePage * perPage, totalRecords))

  async function load() {
    if (loading) return
    loading = true
    errorMsg = ''
    const { data, error } = await listLicenses({
      page: safePage,
      perPage,
      search: search.trim() || undefined,
      status: statusFilter === 'all' ? undefined : statusFilter
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

  function setStatusFilter(next: LicenseStatus) {
    statusFilter = statusFilter === next ? 'all' : next
    pageIndex = 1
    void load()
  }

  function badge(s: LicenseStatus | undefined): string {
    switch (s) {
      case 'active': return 'bg-success'
      case 'suspended': return 'bg-warning text-dark'
      case 'expired':
      case 'terminated':
      case 'revoked':
        return 'bg-danger'
      default:
        return 'bg-secondary'
    }
  }

  function openAction(kind: ActionKind, row: License) {
    actionKind = kind
    actionTarget = row
    actionReason = ''
    actionOpen = true
  }

  async function confirmAction() {
    if (!actionTarget) return
    actionBusy = true
    try {
      const id = actionTarget.licenseId ?? actionTarget.id
      const fn = actionKind === 'activate'
        ? activateLicense
        : actionKind === 'suspend'
          ? suspendLicense
          : terminateLicense
      const { error } = await fn(id, actionReason ? { reason: actionReason } : {})
      if (error) throw new Error(error.message)
      const verb = actionKind === 'activate' ? 'Activate' : actionKind === 'suspend' ? 'Suspend' : 'Terminate'
      notify.success(`${verb} successful`, actionTarget.customerName ?? id)
      actionOpen = false
      actionTarget = null
      await load()
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      notify.error('การดำเนินการล้มเหลว', msg)
    } finally {
      actionBusy = false
    }
  }

  function openRenew(row: License) {
    renewTarget = row
    renewExpiresAt = row.expiresAt ? row.expiresAt.slice(0, 10) : ''
    renewReason = ''
    renewOpen = true
  }

  async function confirmRenew() {
    if (!renewTarget) return
    if (!renewExpiresAt) {
      notify.warning('ใส่วันหมดอายุก่อน', '')
      return
    }
    renewBusy = true
    try {
      const id = renewTarget.licenseId ?? renewTarget.id
      const expiresAt = new Date(renewExpiresAt).toISOString()
      const { error } = await renewLicense(id, renewReason ? { expiresAt, reason: renewReason } : { expiresAt })
      if (error) throw new Error(error.message)
      notify.success('ต่ออายุสำเร็จ', renewTarget.customerName ?? id)
      renewOpen = false
      renewTarget = null
      await load()
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      notify.error('ต่ออายุไม่สำเร็จ', msg)
    } finally {
      renewBusy = false
    }
  }

  onMount(() => {
    setPageTitle(`${m.navAdmin()} · ${m.navAdminLicenses()}`)
    void load()
  })
</script>

<div class="page-shell">
  <div class="d-flex flex-wrap align-items-center justify-content-between gap-3 mb-3">
    <div>
      <h1 class="page-header mb-1">
        <i class="bi bi-key text-theme me-2"></i>{m.navAdminLicenses()}
      </h1>
      <div class="text-body text-opacity-50 small">Per-customer license issuance · activate / suspend / terminate / renew</div>
    </div>
    <a href="/admin/licenses/create" class="btn btn-theme btn-sm">
      <i class="bi bi-plus-lg me-1"></i> Issue license
    </a>
  </div>

  <div class="row g-3 mb-3">
    <div class="col-6 col-lg-3">
      <button type="button" class="kpi-card w-100" class:active={statusFilter === 'all'} onclick={() => { statusFilter = 'all'; pageIndex = 1; void load() }}>
        <div class="kpi-icon bg-primary bg-opacity-25 text-primary"><i class="bi bi-collection"></i></div>
        <div class="kpi-body">
          <div class="kpi-label">Total</div>
          <div class="kpi-value">{summary.total.toLocaleString()}</div>
        </div>
      </button>
    </div>
    <div class="col-6 col-lg-3">
      <button type="button" class="kpi-card w-100" class:active={statusFilter === 'active'} onclick={() => setStatusFilter('active')}>
        <div class="kpi-icon bg-success bg-opacity-25 text-success"><i class="bi bi-check2-circle"></i></div>
        <div class="kpi-body">
          <div class="kpi-label">Active</div>
          <div class="kpi-value">{summary.active.toLocaleString()}</div>
        </div>
      </button>
    </div>
    <div class="col-6 col-lg-3">
      <button type="button" class="kpi-card w-100" class:active={statusFilter === 'suspended'} onclick={() => setStatusFilter('suspended')}>
        <div class="kpi-icon bg-warning bg-opacity-25 text-warning"><i class="bi bi-pause-circle"></i></div>
        <div class="kpi-body">
          <div class="kpi-label">Suspended</div>
          <div class="kpi-value">{summary.suspended.toLocaleString()}</div>
        </div>
      </button>
    </div>
    <div class="col-6 col-lg-3">
      <button type="button" class="kpi-card w-100" class:active={statusFilter === 'expired'} onclick={() => setStatusFilter('expired')}>
        <div class="kpi-icon bg-danger bg-opacity-25 text-danger"><i class="bi bi-x-circle"></i></div>
        <div class="kpi-body">
          <div class="kpi-label">Expired / Terminated</div>
          <div class="kpi-value">{summary.expired.toLocaleString()}</div>
        </div>
      </button>
    </div>
  </div>

  <div class="card mb-3">
    <div class="card-body py-3">
      <div class="d-flex flex-wrap gap-2 align-items-center">
        <div class="input-group input-group-sm" style="max-width: 320px">
          <span class="input-group-text"><i class="bi bi-search"></i></span>
          <input class="form-control" placeholder="Search by customer / id…" bind:value={search} onkeydown={(e) => { if (e.key === 'Enter') { pageIndex = 1; void load() } }} />
          {#if search}
            <button type="button" class="btn btn-outline-secondary" aria-label="Clear" title="Clear" onclick={() => { search = ''; pageIndex = 1; void load() }}>
              <i class="bi bi-x"></i>
            </button>
          {/if}
        </div>
        <div class="ms-auto d-flex gap-2 align-items-center">
          <select class="form-select form-select-sm" style="width: auto" bind:value={perPage} onchange={() => { pageIndex = 1; void load() }}>
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
            <th>License ID</th>
            <th>Customer</th>
            <th>Plan</th>
            <th>Seats</th>
            <th>Status</th>
            <th>Expires</th>
            <th class="text-end" style="width: 180px;">Actions</th>
          </tr>
        </thead>
        <tbody>
          {#if loading && rows.length === 0}
            <tr><td colspan="7" class="text-center py-4 text-uppercase text-body text-opacity-50">
              <div class="spinner-border spinner-border-sm text-theme me-2"></div>Loading…
            </td></tr>
          {:else if rows.length === 0}
            <tr><td colspan="7" class="text-center py-4 text-uppercase text-body text-opacity-50">No licenses issued</td></tr>
          {:else}
            {#each rows as r (r.id || r.licenseId)}
              {@const id = r.licenseId || r.id}
              <tr>
                <td><a class="text-theme font-monospace small" href={`/admin/licenses/${encodeURIComponent(id)}`}>{id}</a></td>
                <td class="fw-semibold">{r.customerName ?? '—'}</td>
                <td><span class="badge bg-info text-dark text-uppercase">{r.plan ?? '—'}</span></td>
                <td>{r.seats ?? '—'}</td>
                <td><span class="badge text-uppercase {badge(r.status)}">{r.status ?? '—'}</span></td>
                <td class="text-body text-opacity-75">{r.expiresAt ? new Date(r.expiresAt).toLocaleDateString() : '—'}</td>
                <td class="text-end">
                  <div class="btn-group btn-group-sm">
                    {#if r.status !== 'active'}
                      <button type="button" class="btn btn-outline-success" title="Activate" aria-label="Activate" onclick={() => openAction('activate', r)}>
                        <i class="bi bi-play-circle"></i>
                      </button>
                    {/if}
                    {#if r.status === 'active'}
                      <button type="button" class="btn btn-outline-warning" title="Suspend" aria-label="Suspend" onclick={() => openAction('suspend', r)}>
                        <i class="bi bi-pause-circle"></i>
                      </button>
                    {/if}
                    <button type="button" class="btn btn-outline-secondary" title="Renew" aria-label="Renew" onclick={() => openRenew(r)}>
                      <i class="bi bi-arrow-clockwise"></i>
                    </button>
                    <button type="button" class="btn btn-outline-danger" title="Terminate" aria-label="Terminate" onclick={() => openAction('terminate', r)}>
                      <i class="bi bi-x-octagon"></i>
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
            <button type="button" class="page-link" onclick={() => { if (safePage > 1) { pageIndex = safePage - 1; void load() } }} disabled={safePage <= 1}>Previous</button>
          </li>
          <li class="page-item active"><span class="page-link">{safePage}</span></li>
          <li class="page-item" class:disabled={safePage >= totalPages}>
            <button type="button" class="page-link" onclick={() => { if (safePage < totalPages) { pageIndex = safePage + 1; void load() } }} disabled={safePage >= totalPages}>Next</button>
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

<Modal bind:open={actionOpen} title={actionKind === 'activate' ? 'Activate license' : actionKind === 'suspend' ? 'Suspend license' : 'Terminate license'} size="md" dismissible={!actionBusy}>
  {#snippet body()}
    <div>
      <p class="mb-3">
        {actionKind === 'activate'
          ? 'Activate this license so the customer can use it.'
          : actionKind === 'suspend'
            ? 'Suspend this license temporarily. The customer cannot use it until reactivated.'
            : 'Terminate this license permanently. This action cannot be undone.'}
      </p>
      <div class="mb-2">
        <strong>{actionTarget?.customerName ?? actionTarget?.licenseId ?? actionTarget?.id ?? ''}</strong>
      </div>
      <label class="form-label" for="action-reason">Reason {actionKind === 'terminate' ? '' : '(optional)'}</label>
      <textarea id="action-reason" class="form-control form-control-sm" rows="2" bind:value={actionReason} placeholder="e.g. Customer requested suspension during contract review."></textarea>
    </div>
  {/snippet}
  {#snippet footer()}
    <button type="button" class="btn btn-outline-secondary btn-sm" onclick={() => (actionOpen = false)} disabled={actionBusy}>Cancel</button>
    <button type="button" class="btn {actionKind === 'activate' ? 'btn-success' : actionKind === 'suspend' ? 'btn-warning' : 'btn-danger'} btn-sm" onclick={confirmAction} disabled={actionBusy}>
      {#if actionBusy}<span class="spinner-border spinner-border-sm me-1"></span>{/if}
      {actionKind === 'activate' ? 'Activate' : actionKind === 'suspend' ? 'Suspend' : 'Terminate'}
    </button>
  {/snippet}
</Modal>

<Modal bind:open={renewOpen} title="Renew license" size="md" dismissible={!renewBusy}>
  {#snippet body()}
    <div>
      <div class="mb-3">
        <strong>{renewTarget?.customerName ?? renewTarget?.licenseId ?? renewTarget?.id ?? ''}</strong>
      </div>
      <div class="mb-3">
        <label class="form-label" for="renew-expires">New expiry date *</label>
        <input id="renew-expires" type="date" class="form-control form-control-sm" bind:value={renewExpiresAt} />
      </div>
      <div>
        <label class="form-label" for="renew-reason">Reason (optional)</label>
        <textarea id="renew-reason" class="form-control form-control-sm" rows="2" bind:value={renewReason} placeholder="Renewal note for the audit trail."></textarea>
      </div>
    </div>
  {/snippet}
  {#snippet footer()}
    <button type="button" class="btn btn-outline-secondary btn-sm" onclick={() => (renewOpen = false)} disabled={renewBusy}>Cancel</button>
    <button type="button" class="btn btn-theme btn-sm" onclick={confirmRenew} disabled={renewBusy || !renewExpiresAt}>
      {#if renewBusy}<span class="spinner-border spinner-border-sm me-1"></span>{/if}
      Renew
    </button>
  {/snippet}
</Modal>

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
