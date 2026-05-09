<!-- src/routes/(app)/systemDevices/edge/+page.svelte -->
<script lang="ts">
  import { onMount } from 'svelte'
  import { setPageTitle } from '$lib/utils/title'
  import DomainStarter from '$lib/components/shared/DomainStarter.svelte'
  import DataTableStarter from '$lib/components/shared/DataTableStarter.svelte'
  import { listEdgeDevices, type EdgeDevice } from '$lib/api/devices'
  import { m } from '$lib/i18n/messages'

  let rows = $state<EdgeDevice[]>([])
  let loading = $state(false)
  let errorMsg = $state('')

  async function load() {
    loading = true
    const { data, error } = await listEdgeDevices({ perPage: 50 })
    loading = false
    if (error) errorMsg = error.message
    rows = data?.details?.items ?? []
  }

  onMount(() => {
    setPageTitle(`${m.navSystemDevices()} · ${m.navSystemDevicesEdge()}`)
    load()
  })

  const columns = [
    { key: 'name', label: 'Name' },
    { key: 'hwId', label: 'Hardware ID' },
    { key: 'refId', label: 'RID' },
    { key: 'status', label: 'Status' },
    {
      key: 'lastSeenAt',
      label: 'Last Seen',
      accessor: (r: EdgeDevice) => (r.lastSeenAt ? new Date(r.lastSeenAt).toLocaleString() : '—')
    }
  ]
</script>

<DomainStarter title={m.navSystemDevicesEdge()} subtitle="Edge appliances / Windows connectors" icon="bi-hdd-network" legacyName="systemDevices/edge">
  <div class="d-flex justify-content-end mb-3">
    <button type="button" class="btn btn-outline-theme btn-sm" onclick={load} disabled={loading}>
      <i class="bi bi-arrow-clockwise me-1"></i> Refresh
    </button>
  </div>
  <DataTableStarter {columns} {rows} {loading} error={errorMsg} emptyText="No edge devices paired" />
</DomainStarter>
