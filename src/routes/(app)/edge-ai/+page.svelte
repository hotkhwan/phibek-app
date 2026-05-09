<!-- src/routes/(app)/edge-ai/+page.svelte -->
<script lang="ts">
  import { onMount } from 'svelte'
  import { setPageTitle } from '$lib/utils/title'
  import DomainStarter from '$lib/components/shared/DomainStarter.svelte'
  import DataTableStarter from '$lib/components/shared/DataTableStarter.svelte'
  import { fetchEdgeAiSummary, type EdgeAiSummary } from '$lib/api/edgeAi'
  import { m } from '$lib/i18n/messages'

  let summary = $state<EdgeAiSummary | null>(null)
  let loading = $state(false)
  let errorMsg = $state('')

  const stats = $derived([
    { label: 'Detections', value: summary?.totals?.detections ?? 0, icon: 'bi-bullseye' },
    { label: 'Alerts', value: summary?.totals?.alerts ?? 0, icon: 'bi-bell-fill text-warning' },
    { label: 'Active Devices', value: summary?.totals?.devicesActive ?? 0, icon: 'bi-cpu-fill' },
    { label: 'Active Streams', value: summary?.totals?.streamsActive ?? 0, icon: 'bi-broadcast' }
  ])

  async function load() {
    loading = true
    const { data, error } = await fetchEdgeAiSummary()
    loading = false
    if (error) errorMsg = error.message
    summary = data?.details ?? null
  }

  onMount(() => {
    setPageTitle(m.navEdgeAi())
    load()
  })

  const eventColumns = [
    { key: 'occurredAt', label: 'When',
      accessor: (r: NonNullable<EdgeAiSummary['topEvents']>[number]) =>
        r.occurredAt ? new Date(r.occurredAt).toLocaleString() : '—' },
    { key: 'deviceName', label: 'Device' },
    { key: 'eventType', label: 'Type' },
    { key: 'id', label: 'Event ID' }
  ]
</script>

<DomainStarter title={m.navEdgeAi()} subtitle="ATA / aggregated edge AI summary" icon="bi-cpu-fill" legacyName="edge-ai">
  <div class="d-flex justify-content-end mb-3">
    <button type="button" class="btn btn-outline-theme btn-sm" onclick={load} disabled={loading}>
      <i class="bi bi-arrow-clockwise me-1"></i> Refresh
    </button>
  </div>

  {#if errorMsg}
    <div class="alert alert-danger small mb-3">{errorMsg}</div>
  {/if}

  <div class="row g-3 mb-4">
    {#each stats as s}
      <div class="col-xl col-md-6">
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

  <div class="fw-bold mb-2">Top Events</div>
  <DataTableStarter
    columns={eventColumns}
    rows={summary?.topEvents ?? []}
    {loading}
    error={errorMsg}
    emptyText="No detections in this period"
  />
</DomainStarter>
