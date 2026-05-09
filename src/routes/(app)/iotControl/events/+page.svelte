<!-- src/routes/(app)/iotControl/events/+page.svelte -->
<script lang="ts">
  import { onMount } from 'svelte'
  import { setPageTitle } from '$lib/utils/title'
  import DomainStarter from '$lib/components/shared/DomainStarter.svelte'
  import DataTableStarter from '$lib/components/shared/DataTableStarter.svelte'
  import { listEvents, type IotControlEvent } from '$lib/api/iotControl'
  import { m } from '$lib/i18n/messages'

  let rows = $state<IotControlEvent[]>([])
  let loading = $state(false)
  let errorMsg = $state('')

  async function load() {
    loading = true
    const { data, error } = await listEvents({ perPage: 50 })
    loading = false
    if (error) errorMsg = error.message
    rows = data?.details?.items ?? []
  }

  onMount(() => {
    setPageTitle(`${m.navIotControl()} · ${m.navIotControlEvents()}`)
    load()
  })

  const columns = [
    { key: 'id', label: 'Event ID' },
    { key: 'deviceId', label: 'Device' },
    { key: 'type', label: 'Type' },
    {
      key: 'occurredAt',
      label: 'Occurred',
      accessor: (r: IotControlEvent) => (r.occurredAt ? new Date(r.occurredAt).toLocaleString() : '—')
    }
  ]
</script>

<DomainStarter title={m.navIotControlEvents()} subtitle="kcontrol event stream" icon="bi-collection" legacyName="kcontrol/events">
  <div class="d-flex justify-content-end mb-3">
    <button type="button" class="btn btn-outline-theme btn-sm" onclick={load} disabled={loading}>
      <i class="bi bi-arrow-clockwise me-1"></i> Refresh
    </button>
  </div>
  <DataTableStarter {columns} {rows} {loading} error={errorMsg} emptyText="No events" />
</DomainStarter>
