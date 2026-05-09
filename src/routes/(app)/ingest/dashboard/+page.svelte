<!-- src/routes/(app)/ingest/dashboard/+page.svelte -->
<script lang="ts">
  import { onMount } from 'svelte'
  import { setPageTitle } from '$lib/utils/title'
  import DomainStarter from '$lib/components/shared/DomainStarter.svelte'
  import DataTableStarter from '$lib/components/shared/DataTableStarter.svelte'
  import { fetchIngestDashboard, type IngestDashboard } from '$lib/api/klynxIngest'
  import { m } from '$lib/i18n/messages'

  let dash = $state<IngestDashboard | null>(null)
  let loading = $state(false)
  let errorMsg = $state('')

  const stats = $derived([
    { label: 'Events 24h', value: dash?.totals?.events24h ?? 0, icon: 'bi-clock-history' },
    { label: 'Events 1h', value: dash?.totals?.eventsHour ?? 0, icon: 'bi-stopwatch' },
    { label: 'Events 1m', value: dash?.totals?.eventsMinute ?? 0, icon: 'bi-lightning' },
    { label: 'Devices Reporting', value: dash?.totals?.devicesReporting ?? 0, icon: 'bi-broadcast-pin' },
    { label: 'Rejected', value: dash?.rejected ?? 0, icon: 'bi-x-octagon text-danger' }
  ])

  async function load() {
    loading = true
    const { data, error } = await fetchIngestDashboard()
    loading = false
    if (error) errorMsg = error.message
    dash = data?.details ?? null
  }

  onMount(() => {
    setPageTitle(`${m.navIngest()} · ${m.navIngestDashboard()}`)
    load()
  })

  const byTypeCols = [
    { key: 'key', label: 'Event Type' },
    { key: 'value', label: 'Count' }
  ]
  const byDeviceCols = [
    { key: 'deviceName', label: 'Device' },
    { key: 'deviceId', label: 'Device ID' },
    { key: 'count', label: 'Count' }
  ]
</script>

<DomainStarter title={m.navIngestDashboard()} subtitle="Event throughput by type + device" icon="bi-bar-chart-line" legacyName="ingest/dashboard">
  {#if errorMsg}
    <div class="alert alert-danger small mb-3">{errorMsg}</div>
  {/if}

  <div class="row g-3 mb-4">
    {#each stats as s}
      <div class="col-xl col-md-6 col-12">
        <div class="card h-100">
          <div class="card-body">
            <div class="d-flex align-items-center mb-2">
              <i class="bi {s.icon} fs-4 me-2"></i>
              <div class="text-body text-opacity-50 fw-semibold small">{s.label}</div>
            </div>
            <div class="display-6 fw-bold mb-0">{s.value.toLocaleString()}</div>
          </div>
          <div class="card-arrow">
            <div class="card-arrow-top-left"></div>
            <div class="card-arrow-top-right"></div>
            <div class="card-arrow-bottom-left"></div>
            <div class="card-arrow-bottom-right"></div>
          </div>
        </div>
      </div>
    {/each}
  </div>

  <div class="row g-3">
    <div class="col-lg-6">
      <div class="fw-bold mb-2">By Event Type</div>
      <DataTableStarter columns={byTypeCols} rows={dash?.byType ?? []} {loading} emptyText="No type breakdown" />
    </div>
    <div class="col-lg-6">
      <div class="fw-bold mb-2">By Device</div>
      <DataTableStarter columns={byDeviceCols} rows={dash?.byDevice ?? []} {loading} emptyText="No device breakdown" />
    </div>
  </div>
</DomainStarter>
