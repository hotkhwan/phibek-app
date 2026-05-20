<script lang="ts">
  import { onMount } from 'svelte'
  import { setPageTitle } from '$lib/utils/title'
  import DomainStarter from '$lib/components/shared/DomainStarter.svelte'
  import {
    downloadCameraUsageExport,
    fetchCameraUsage,
    type AnalyticsScope,
    type CameraUsageItem,
    type CameraUsageSummary
  } from '$lib/api/dashboard'
  import { notify } from '$lib/stores/notify'
  import { m } from '$lib/i18n/messages'

  const TZ = 'Asia/Bangkok'
  const now = new Date()
  const defaultTo = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1))
  const defaultFrom = new Date(defaultTo)
  defaultFrom.setUTCDate(defaultFrom.getUTCDate() - 30)

  let fromDate = $state(defaultFrom.toISOString().slice(0, 10))
  let toDate = $state(defaultTo.toISOString().slice(0, 10))
  let scope = $state<AnalyticsScope>('all')
  let q = $state('')
  let loading = $state(false)
  let exporting = $state<'xlsx' | 'csv' | ''>('')
  let errorMsg = $state('')
  let rows = $state<CameraUsageItem[]>([])
  let summary = $state<CameraUsageSummary | null>(null)
  let truncated = $state(false)

  function query() {
    return {
      from: `${fromDate}T00:00:00Z`,
      to: `${toDate}T00:00:00Z`,
      tz: TZ,
      scope,
      q: q || undefined,
      page: 1,
      perPage: 50,
      sortField: 'playCount' as const,
      sortOrder: 'desc' as const
    }
  }

  function fmt(value: number | undefined) {
    return (value ?? 0).toLocaleString()
  }

  function lastUsed(value: string | null) {
    return value ? new Date(value).toLocaleString() : '-'
  }

  function location(row: CameraUsageItem) {
    if (row.lat === 0 && row.lng === 0) return '-'
    return `${row.lat.toFixed(6)}, ${row.lng.toFixed(6)}`
  }

  async function load() {
    loading = true
    errorMsg = ''
    const { data, error } = await fetchCameraUsage(query())
    loading = false
    if (error) {
      errorMsg = error.message
      rows = []
      summary = null
      truncated = false
      return
    }
    rows = data?.details.items ?? []
    summary = data?.details.summary ?? null
    truncated = data?.details.truncated ?? false
  }

  async function exportFile(format: 'xlsx' | 'csv') {
    exporting = format
    try {
      await downloadCameraUsageExport({ ...query(), format })
    } catch (err) {
      notify.error('Camera usage export failed', (err as { message?: string })?.message ?? 'Unknown error')
    } finally {
      exporting = ''
    }
  }

  onMount(() => {
    setPageTitle(`${m.navDashboard()} · Camera Usage`)
    void load()
  })
</script>

<DomainStarter title="Camera Usage" subtitle="Admin analytics from /admin/analytics/cameraUsage" icon="bi-table" legacyName="admin/analytics/cameraUsage">
  <div class="d-flex flex-wrap align-items-end gap-2 mb-3">
    <label class="form-label small mb-0">
      From
      <input class="form-control form-control-sm mt-1" type="date" bind:value={fromDate} />
    </label>
    <label class="form-label small mb-0">
      To
      <input class="form-control form-control-sm mt-1" type="date" bind:value={toDate} />
    </label>
    <label class="form-label small mb-0">
      Scope
      <select class="form-select form-select-sm mt-1" bind:value={scope}>
        <option value="all">All</option>
        <option value="owner">Owner</option>
        <option value="public">Public</option>
      </select>
    </label>
    <label class="form-label small mb-0 flex-grow-1" style="min-width: 220px">
      Search
      <input class="form-control form-control-sm mt-1" placeholder="Camera name..." bind:value={q} onkeydown={(e) => e.key === 'Enter' && load()} />
    </label>
    <button class="btn btn-outline-theme btn-sm" onclick={load} disabled={loading}>
      {#if loading}<span class="spinner-border spinner-border-sm me-1"></span>{:else}<i class="bi bi-arrow-clockwise me-1"></i>{/if}Refresh
    </button>
    <button class="btn btn-outline-secondary btn-sm" onclick={() => exportFile('csv')} disabled={!!exporting}>
      <i class="bi bi-filetype-csv me-1"></i>CSV
    </button>
    <button class="btn btn-outline-secondary btn-sm" onclick={() => exportFile('xlsx')} disabled={!!exporting}>
      <i class="bi bi-file-earmark-spreadsheet me-1"></i>XLSX
    </button>
  </div>

  {#if errorMsg}
    <div class="alert alert-danger small">{errorMsg}</div>
  {/if}
  {#if truncated}
    <div class="alert alert-warning small">Result is truncated at 10,000 rows. Narrow the date range or filters before export.</div>
  {/if}

  {#if summary}
    <div class="row g-2 mb-3">
      <div class="col-6 col-xl-2"><div class="card"><div class="card-body py-2"><div class="small text-muted">Total</div><div class="h5 mb-0">{fmt(summary.totalCameras)}</div></div></div></div>
      <div class="col-6 col-xl-2"><div class="card"><div class="card-body py-2"><div class="small text-muted">Used</div><div class="h5 mb-0">{fmt(summary.usedCameras)}</div></div></div></div>
      <div class="col-6 col-xl-2"><div class="card"><div class="card-body py-2"><div class="small text-muted">Unused</div><div class="h5 mb-0">{fmt(summary.unusedCameras)}</div></div></div></div>
      <div class="col-6 col-xl-2"><div class="card"><div class="card-body py-2"><div class="small text-muted">Plays</div><div class="h5 mb-0">{fmt(summary.totalPlayCount)}</div></div></div></div>
      <div class="col-6 col-xl-2"><div class="card"><div class="card-body py-2"><div class="small text-muted">Filtered</div><div class="h5 mb-0">{fmt(summary.filteredCameras)}</div></div></div></div>
      <div class="col-6 col-xl-2"><div class="card"><div class="card-body py-2"><div class="small text-muted">Filtered plays</div><div class="h5 mb-0">{fmt(summary.filteredPlayCount)}</div></div></div></div>
    </div>
  {/if}

  <div class="card">
    <div class="table-responsive" style="max-height: min(64vh, 48rem)">
      <table class="table table-card mb-0">
        <thead>
          <tr>
            <th>Camera</th>
            <th>Scope</th>
            <th class="text-end">Plays</th>
            <th>Last used</th>
            <th>Map</th>
            <th>Location</th>
            <th>Groups</th>
          </tr>
        </thead>
        <tbody>
          {#if loading && rows.length === 0}
            <tr><td colspan="7" class="text-center py-4"><span class="spinner-border spinner-border-sm me-2"></span>Loading...</td></tr>
          {:else if rows.length === 0}
            <tr><td colspan="7" class="text-center py-4 text-body text-opacity-50">No camera usage rows</td></tr>
          {:else}
            {#each rows as row (row.id)}
              <tr>
                <td>
                  <div class="fw-bold">{row.name || row.id}</div>
                  <div class="small text-body text-opacity-50">{row.id}</div>
                </td>
                <td><span class="badge bg-secondary bg-opacity-25">{row.scope}</span></td>
                <td class="text-end fw-bold">{fmt(row.playCount)}</td>
                <td>{lastUsed(row.lastUsedAt)}</td>
                <td>{row.mapVisibility ?? '-'}</td>
                <td>{location(row)}</td>
                <td>{row.resourceGroups.join('; ') || '-'}</td>
              </tr>
            {/each}
          {/if}
        </tbody>
      </table>
    </div>
  </div>
</DomainStarter>
