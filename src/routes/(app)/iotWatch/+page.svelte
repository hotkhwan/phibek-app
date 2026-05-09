<!-- src/routes/(app)/iotWatch/+page.svelte -->
<script lang="ts">
  import { onMount } from 'svelte'
  import { setPageTitle } from '$lib/utils/title'
  import DomainStarter from '$lib/components/shared/DomainStarter.svelte'
  import DataTableStarter from '$lib/components/shared/DataTableStarter.svelte'
  import { listWatchEntries, type WatchmanEntry } from '$lib/api/iotWatch'
  import { env } from '$env/dynamic/public'
  import { m } from '$lib/i18n/messages'

  let rows = $state<WatchmanEntry[]>([])
  let loading = $state(false)
  let errorMsg = $state('')

  const watchmanConfigured = $derived(!!env.PUBLIC_WATCHMAN_API_URL)

  async function load() {
    loading = true
    errorMsg = ''
    const { data, error } = await listWatchEntries({ perPage: 25 })
    loading = false
    if (error) {
      errorMsg = error.message
      return
    }
    rows = data?.details?.items ?? []
  }

  onMount(() => {
    setPageTitle(m.navIotWatch())
    if (watchmanConfigured) load()
  })

  const columns = [
    { key: 'fname', label: 'First Name' },
    { key: 'lname', label: 'Last Name' },
    { key: 'nickname', label: 'Nickname' },
    { key: 'age', label: 'Age' },
    { key: 'policeStation', label: 'Station' }
  ]
</script>

<DomainStarter title={m.navIotWatch()} subtitle="Watchlist entries (external WatchMan service)" icon="bi-eye" legacyName="kwatch · watchman">
  {#if !watchmanConfigured}
    <div class="alert alert-warning small mb-3">
      <i class="bi bi-info-circle me-1"></i>
      <code>PUBLIC_WATCHMAN_API_URL</code> is not configured. Set it in
      <code>.env</code> to enable WatchMan integration. Until then this page is read-only stub.
    </div>
  {:else}
    <div class="d-flex justify-content-end mb-3">
      <button type="button" class="btn btn-outline-theme btn-sm" onclick={load} disabled={loading}>
        <i class="bi bi-arrow-clockwise me-1"></i>
        {loading ? 'Loading…' : 'Refresh'}
      </button>
    </div>
  {/if}
  <DataTableStarter {columns} {rows} {loading} error={errorMsg} emptyText="No watchlist entries" />
</DomainStarter>
