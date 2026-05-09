<!-- src/routes/(app)/aiSearch/+page.svelte -->
<script lang="ts">
  import { onMount } from 'svelte'
  import { setPageTitle } from '$lib/utils/title'
  import DomainStarter from '$lib/components/shared/DomainStarter.svelte'
  import DataTableStarter from '$lib/components/shared/DataTableStarter.svelte'
  import { listChats, type AiSearchChat } from '$lib/api/aiSearch'
  import { m } from '$lib/i18n/messages'

  let rows = $state<AiSearchChat[]>([])
  let loading = $state(false)
  let errorMsg = $state('')

  async function load() {
    loading = true
    errorMsg = ''
    const { data, error } = await listChats({ perPage: 25 })
    loading = false
    if (error) {
      errorMsg = error.message
      return
    }
    rows = data?.details?.items ?? []
  }

  onMount(() => {
    setPageTitle(m.navAiSearch())
    load()
  })

  const columns = [
    { key: 'title', label: 'Title' },
    { key: 'preview', label: 'Preview' },
    { key: 'messageCount', label: 'Messages' },
    {
      key: 'updatedAt',
      label: 'Updated',
      accessor: (r: AiSearchChat) => (r.updatedAt ? new Date(r.updatedAt).toLocaleString() : '—')
    }
  ]
</script>

<DomainStarter title={m.navAiSearch()} subtitle="AI camera search & chat history" icon="bi-search-heart" legacyName="ksearch">
  <div class="d-flex justify-content-end mb-3">
    <button type="button" class="btn btn-outline-theme btn-sm" onclick={load} disabled={loading}>
      <i class="bi bi-arrow-clockwise me-1"></i>
      {loading ? 'Loading…' : 'Refresh'}
    </button>
  </div>
  <DataTableStarter
    {columns}
    {rows}
    {loading}
    error={errorMsg}
    emptyText="No chat sessions yet"
  />
</DomainStarter>
