<!-- src/routes/(app)/systemDevices/edge/+page.svelte -->
<script lang="ts">
  import { onDestroy, onMount } from 'svelte'
  import { setPageTitle } from '$lib/utils/title'
  import DomainStarter from '$lib/components/shared/DomainStarter.svelte'
  import DataTableStarter from '$lib/components/shared/DataTableStarter.svelte'
  import { listEdgeDevices, type EdgeDevice } from '$lib/api/devices'
  import { activeWorkspaceId } from '$lib/stores/activeWorkspace'
  import { m } from '$lib/i18n/messages'
  import { itemsFrom } from '$lib/utils/apiShape'

  let rows = $state<EdgeDevice[]>([])
  let loading = $state(false)
  let errorMsg = $state('')
  let unsubscribeWorkspace: (() => void) | null = null
  let loadSeq = 0

  async function load() {
    const seq = ++loadSeq
    loading = true
    errorMsg = ''
    const { data, error } = await listEdgeDevices({ perPage: 50 })
    if (seq !== loadSeq) return
    loading = false
    if (error) errorMsg = error.message
    rows = itemsFrom<EdgeDevice>(data?.details)
  }

  onMount(() => {
    setPageTitle(`${m.navSystemDevices()} · ${m.navSystemDevicesEdge()}`)
    unsubscribeWorkspace = activeWorkspaceId.subscribe((orgId) => {
      if (!orgId) {
        rows = []
        errorMsg = 'Select an organization to load edge devices.'
        return
      }
      void load()
    })
  })

  onDestroy(() => {
    unsubscribeWorkspace?.()
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
