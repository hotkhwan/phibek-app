<!-- src/routes/(app)/police/+page.svelte -->
<script lang="ts">
  import { onMount } from 'svelte'
  import { setPageTitle } from '$lib/utils/title'
  import DomainStarter from '$lib/components/shared/DomainStarter.svelte'
  import DataTableStarter from '$lib/components/shared/DataTableStarter.svelte'
  import { listWatchlist, type WatchlistItem } from '$lib/api/police'
  import { m } from '$lib/i18n/messages'

  let rows = $state<WatchlistItem[]>([])
  let loading = $state(false)
  let errorMsg = $state('')
  let search = $state('')
  let stationFilter = $state('')

  async function load() {
    loading = true
    errorMsg = ''
    const { data, error } = await listWatchlist({
      perPage: 50,
      search: search || undefined,
      station: stationFilter || undefined
    })
    loading = false
    if (error) errorMsg = error.message
    rows = data?.details?.items ?? []
  }

  onMount(() => {
    setPageTitle(m.navPoliceWatchlist())
    load()
  })

  const columns = [
    { key: 'fname', label: 'First Name' },
    { key: 'lname', label: 'Last Name' },
    { key: 'nickname', label: 'Nickname' },
    { key: 'age', label: 'Age' },
    { key: 'policeStation', label: 'Station' },
    { key: 'status', label: 'Status' }
  ]
</script>

<DomainStarter title={m.navPoliceWatchlist()} subtitle="kwatch watchlist (police-mode)" icon="bi-shield-shaded" legacyName="police">
  <div class="d-flex flex-wrap justify-content-between gap-2 mb-3">
    <div class="d-flex gap-2 flex-wrap">
      <div class="input-group input-group-sm" style="max-width: 280px">
        <span class="input-group-text"><i class="bi bi-search"></i></span>
        <input
          class="form-control"
          placeholder="Search…"
          bind:value={search}
          onkeydown={(e) => e.key === 'Enter' && load()}
        />
      </div>
      <input
        class="form-control form-control-sm"
        style="max-width: 180px"
        placeholder="Station"
        bind:value={stationFilter}
        onkeydown={(e) => e.key === 'Enter' && load()}
      />
    </div>
    <button type="button" class="btn btn-outline-theme btn-sm" onclick={load} disabled={loading}>
      <i class="bi bi-arrow-clockwise me-1"></i> Refresh
    </button>
  </div>
  <DataTableStarter {columns} {rows} {loading} error={errorMsg} emptyText="No watchlist entries" />
</DomainStarter>
