<!-- src/routes/(app)/admin/licenses/+page.svelte -->
<script lang="ts">
  import { onMount } from 'svelte'
  import { setPageTitle } from '$lib/utils/title'
  import DomainStarter from '$lib/components/shared/DomainStarter.svelte'
  import DataTableStarter from '$lib/components/shared/DataTableStarter.svelte'
  import { listLicenses, type License } from '$lib/api/adminLicense'
  import { m } from '$lib/i18n/messages'

  let rows = $state<License[]>([])
  let loading = $state(false)
  let errorMsg = $state('')
  let search = $state('')

  async function load() {
    loading = true
    errorMsg = ''
    const { data, error } = await listLicenses({ perPage: 50, search: search || undefined })
    loading = false
    if (error) errorMsg = error.message
    rows = data?.details?.items ?? []
  }

  onMount(() => {
    setPageTitle(`${m.navAdmin()} · ${m.navAdminLicenses()}`)
    load()
  })

  const columns = [
    { key: 'licenseId', label: 'License ID' },
    { key: 'customerName', label: 'Customer' },
    { key: 'plan', label: 'Plan' },
    { key: 'seats', label: 'Seats' },
    {
      key: 'expiresAt',
      label: 'Expires',
      accessor: (r: License) => (r.expiresAt ? new Date(r.expiresAt).toLocaleDateString() : '—')
    },
    { key: 'status', label: 'Status' }
  ]
</script>

<DomainStarter title={m.navAdminLicenses()} subtitle="Per-customer license issuance" icon="bi-key" legacyName="admin/licenses">
  <div class="d-flex justify-content-between gap-2 mb-3">
    <div class="input-group input-group-sm" style="max-width: 320px">
      <span class="input-group-text"><i class="bi bi-search"></i></span>
      <input
        class="form-control"
        placeholder="Search by customer / id…"
        bind:value={search}
        onkeydown={(e) => e.key === 'Enter' && load()}
      />
    </div>
    <button type="button" class="btn btn-outline-theme btn-sm" onclick={load} disabled={loading}>
      <i class="bi bi-arrow-clockwise me-1"></i> Refresh
    </button>
  </div>
  <DataTableStarter {columns} {rows} {loading} error={errorMsg} emptyText="No licenses issued" />
</DomainStarter>
