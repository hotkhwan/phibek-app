<!-- src/routes/(app)/systemDevices/cameras/+page.svelte -->
<script lang="ts">
  import { onMount } from 'svelte'
  import { setPageTitle } from '$lib/utils/title'
  import DomainStarter from '$lib/components/shared/DomainStarter.svelte'
  import DataTableStarter from '$lib/components/shared/DataTableStarter.svelte'
  import { listCameras, type Camera } from '$lib/api/devices'
  import { m } from '$lib/i18n/messages'

  let rows = $state<Camera[]>([])
  let loading = $state(false)
  let errorMsg = $state('')
  let search = $state('')

  async function load() {
    loading = true
    const { data, error } = await listCameras({ perPage: 50, search: search || undefined })
    loading = false
    if (error) errorMsg = error.message
    rows = data?.details?.items ?? []
  }

  onMount(() => {
    setPageTitle(`${m.navSystemDevices()} · ${m.navSystemDevicesCameras()}`)
    load()
  })

  const columns = [
    { key: 'name', label: 'Name' },
    { key: 'groupName', label: 'Group' },
    {
      key: 'online',
      label: 'Online',
      accessor: (r: Camera) => (r.online ? '✅' : '❌')
    },
    {
      key: 'enabled',
      label: 'Enabled',
      accessor: (r: Camera) => (r.enabled ? 'Yes' : 'No')
    },
    {
      key: 'updateAt',
      label: 'Updated',
      accessor: (r: Camera) => (r.updateAt ? new Date(r.updateAt).toLocaleString() : '—')
    }
  ]
</script>

<DomainStarter title={m.navSystemDevicesCameras()} subtitle="Cameras / RTSP / source registry" icon="bi-camera-video" legacyName="systemDevices/cameras">
  <div class="d-flex justify-content-between gap-2 mb-3">
    <div class="input-group input-group-sm" style="max-width: 320px">
      <span class="input-group-text"><i class="bi bi-search"></i></span>
      <input class="form-control" placeholder="Search cameras…" bind:value={search} onkeydown={(e) => e.key === 'Enter' && load()} />
    </div>
    <button type="button" class="btn btn-outline-theme btn-sm" onclick={load} disabled={loading}>
      <i class="bi bi-arrow-clockwise me-1"></i> Refresh
    </button>
  </div>
  <DataTableStarter {columns} {rows} {loading} error={errorMsg} emptyText="No cameras" />
</DomainStarter>
