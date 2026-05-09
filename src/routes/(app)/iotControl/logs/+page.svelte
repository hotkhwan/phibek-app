<!-- src/routes/(app)/iotControl/logs/+page.svelte -->
<script lang="ts">
  import { onMount } from 'svelte'
  import { setPageTitle } from '$lib/utils/title'
  import DomainStarter from '$lib/components/shared/DomainStarter.svelte'
  import DataTableStarter from '$lib/components/shared/DataTableStarter.svelte'
  import { listLogs, type IotControlLog } from '$lib/api/iotControl'
  import { m } from '$lib/i18n/messages'

  let rows = $state<IotControlLog[]>([])
  let loading = $state(false)
  let errorMsg = $state('')
  let level = $state<'all' | 'info' | 'warn' | 'error'>('all')

  async function load() {
    loading = true
    const { data, error } = await listLogs({
      perPage: 100,
      level: level === 'all' ? undefined : level
    })
    loading = false
    if (error) errorMsg = error.message
    rows = data?.details?.items ?? []
  }

  onMount(() => {
    setPageTitle(`${m.navIotControl()} · ${m.navIotControlLogs()}`)
    load()
  })

  const columns = [
    { key: 'level', label: 'Level' },
    { key: 'source', label: 'Source' },
    { key: 'message', label: 'Message' },
    {
      key: 'occurredAt',
      label: 'When',
      accessor: (r: IotControlLog) => (r.occurredAt ? new Date(r.occurredAt).toLocaleString() : '—')
    }
  ]
</script>

<DomainStarter title={m.navIotControlLogs()} subtitle="kcontrol audit log" icon="bi-journal-text" legacyName="kcontrol/logs">
  <div class="d-flex justify-content-between align-items-center mb-3 gap-2">
    <select class="form-select form-select-sm w-auto" bind:value={level} onchange={load}>
      <option value="all">All levels</option>
      <option value="info">info</option>
      <option value="warn">warn</option>
      <option value="error">error</option>
    </select>
    <button type="button" class="btn btn-outline-theme btn-sm" onclick={load} disabled={loading}>
      <i class="bi bi-arrow-clockwise me-1"></i> Refresh
    </button>
  </div>
  <DataTableStarter {columns} {rows} {loading} error={errorMsg} emptyText="No logs" />
</DomainStarter>
