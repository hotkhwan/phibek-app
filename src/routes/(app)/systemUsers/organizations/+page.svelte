<!-- src/routes/(app)/systemUsers/organizations/+page.svelte -->
<script lang="ts">
  import { onMount } from 'svelte'
  import { setPageTitle } from '$lib/utils/title'
  import Modal from '$lib/components/shared/Modal.svelte'
  import ConfirmDialog from '$lib/components/shared/ConfirmDialog.svelte'
  import {
    createOrg,
    deleteOrg,
    enableOrgIngest,
    getOrgIngestStatus,
    inviteOrgUsers,
    listOrgMembers,
    listOrgs,
    removeUsersFromOrg,
    updateOrg,
    updateOrgMemberRole,
    type KlynxUser,
    type Organization
  } from '$lib/api/klynxUser'
  import { notify } from '$lib/stores/notify'
  import { setActiveWorkspace, setWorkspaceList } from '$lib/stores/activeWorkspace'
  import { m } from '$lib/i18n/messages'
  import type { Workspace } from '$lib/types/workspace'

  type ViewMode = 'members' | 'add'
  type OrgTab = 'members' | 'ingest'
  type OrgRole = 'admin' | 'member'
  type MemberRow = KlynxUser & { userId?: string; orgRole?: 'owner' | OrgRole; isOwner?: boolean; label?: string }

  let rows = $state<Organization[]>([])
  let selectedId = $state('')
  let loading = $state(false)
  let memberLoading = $state(false)
  let errorMsg = $state('')
  let search = $state('')
  let memberSearch = $state('')
  let viewMode = $state<ViewMode>('members')
  let orgTab = $state<OrgTab>('members')
  let members = $state<MemberRow[]>([])
  let addUsers = $state<MemberRow[]>([])
  let selectedRemoval = $state<Set<string>>(new Set())
  let selectedAdding = $state<Map<string, OrgRole>>(new Map())
  let formOpen = $state(false)
  let deleteOpen = $state(false)
  let editing = $state<Organization | null>(null)
  let form = $state({ name: '', description: '', status: '' })
  let ingestBusy = $state(false)
  let ingestStatus = $state<'pending' | 'provisioning' | 'active' | 'provisionFailed' | string>('pending')
  let ingestEndpoint = $state('')

  const selected = $derived(rows.find((x) => orgId(x) === selectedId))
  const filtered = $derived(rows.filter((x) => `${x.name} ${x.description ?? ''}`.toLowerCase().includes(search.toLowerCase())))
  const shownMembers = $derived((viewMode === 'members' ? members : addUsers).filter((u) => `${displayName(u)} ${u.email ?? ''}`.toLowerCase().includes(memberSearch.toLowerCase())))

  function orgId(row: Organization) { return row.orgId ?? row.id }
  function userId(row: MemberRow) { return row.userId ?? row.id }
  function displayName(row: MemberRow) { return row.label || row.fullName || `${row.firstName ?? ''} ${row.lastName ?? ''}`.trim() || row.username || row.email || userId(row) }
  function itemsFrom<T>(value: unknown): T[] {
    if (Array.isArray(value)) return value as T[]
    if (!value || typeof value !== 'object') return []
    const record = value as Record<string, unknown>
    for (const key of ['items', 'details', 'orgs', 'organizations']) {
      const nested = record[key]
      if (Array.isArray(nested)) return nested as T[]
    }
    return []
  }
  function syncWorkspaceOptions(orgs: Organization[]) {
    setWorkspaceList(orgs.map((org) => ({
      id: orgId(org),
      name: org.name,
      description: org.description,
      status: org.status === 'inactive' ? 'inactive' : 'active',
      createdAt: org.createAt ?? new Date().toISOString(),
      updatedAt: org.updateAt
    }) as Workspace))
  }

  async function load() {
    loading = true
    errorMsg = ''
    const { data, error } = await listOrgs({ perPage: 250, search: search || undefined })
    loading = false
    if (error) errorMsg = error.message
    rows = itemsFrom<Organization>(data?.details)
    syncWorkspaceOptions(rows)
    if (!selectedId && rows[0]) {
      selectedId = orgId(rows[0])
      await setActiveWorkspace(selectedId)
    }
    if (selectedId) await loadMembers()
    if (selectedId) await loadIngestStatus()
  }

  async function loadMembers() {
    if (!selectedId) return
    if (orgTab !== 'members') return
    memberLoading = true
    const { data, error } = await listOrgMembers({ page: 1, perPage: 250, mode: viewMode === 'members' ? 'members' : undefined, search: memberSearch || undefined, sortField: 'firstName', sortOrder: 'asc' }, selectedId)
    memberLoading = false
    if (error) { notify.error('Members unavailable', error.message); return }
    const mapped = itemsFrom<MemberRow>(data?.details).map((u) => ({ ...u, label: displayName(u) }))
    if (viewMode === 'members') members = mapped
    else addUsers = mapped
  }

  function selectOrg(id: string) {
    selectedId = id
    void setActiveWorkspace(id)
    orgTab = 'members'
    viewMode = 'members'
    memberSearch = ''
    selectedRemoval = new Set()
    selectedAdding = new Map()
    loadMembers()
    loadIngestStatus()
  }

  async function loadIngestStatus() {
    if (!selectedId) return
    ingestBusy = true
    const { data } = await getOrgIngestStatus(selectedId)
    const details = data?.details
    ingestBusy = false
    ingestStatus = details?.provisionStatus || selected?.provisionStatus || 'pending'
    ingestEndpoint = ingestStatus === 'active'
      ? (details?.ingestEndpoint || details?.eventIngestUri || selected?.ingestEndpoint || '')
      : ''
  }

  async function enableIngest() {
    if (!selectedId) return
    ingestBusy = true
    try {
      const res = await enableOrgIngest(selectedId)
      ingestStatus = res.details.provisionStatus || 'pending'
      ingestEndpoint = res.details.eventIngestUri || ''
      notify.success(ingestStatus === 'active' ? 'Gateway ingest active' : 'Gateway ingest provisioning')
      await loadIngestStatus()
    } catch (err) {
      notify.error('Gateway ingest failed', (err as { message?: string })?.message ?? 'Unknown error')
    } finally {
      ingestBusy = false
    }
  }

  async function copyIngestEndpoint() {
    if (!ingestEndpoint) return
    await navigator.clipboard?.writeText(ingestEndpoint)
    notify.success('Copied ingest endpoint')
  }

  function startCreate() { editing = null; form = { name: '', description: '', status: '' }; formOpen = true }
  function startEdit(row = selected) { if (!row) return; editing = row; form = { name: row.name, description: row.description ?? '', status: row.status ?? '' }; formOpen = true }

  async function save() {
    if (!form.name.trim()) return
    if (editing) await updateOrg(orgId(editing), { name: form.name.trim(), description: form.description, status: form.status || undefined })
    else await createOrg({ name: form.name.trim(), description: form.description })
    notify.success('Organization saved')
    formOpen = false
    await load()
  }

  async function remove() {
    if (!selected) return
    await deleteOrg(orgId(selected))
    notify.success('Organization deleted')
    selectedId = ''
    deleteOpen = false
    await load()
  }

  async function updateRole(row: MemberRow, role: OrgRole) {
    if (!selectedId) return
    await updateOrgMemberRole(userId(row), selectedId, role)
    notify.success('Role updated')
    await loadMembers()
  }

  function toggleRemoval(id: string) {
    const next = new Set(selectedRemoval)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    selectedRemoval = next
  }

  function toggleAdding(row: MemberRow) {
    const next = new Map(selectedAdding)
    const id = userId(row)
    if (next.has(id)) next.delete(id)
    else next.set(id, 'member')
    selectedAdding = next
  }

  function setAddRole(id: string, role: OrgRole) {
    const next = new Map(selectedAdding)
    next.set(id, role)
    selectedAdding = next
  }

  async function batchRemove() {
    if (!selectedId || selectedRemoval.size === 0) return
    await removeUsersFromOrg(Array.from(selectedRemoval), selectedId)
    notify.success('Members removed')
    selectedRemoval = new Set()
    await loadMembers()
  }

  let batchRoleBusy = $state(false)

  async function batchSetRole(role: OrgRole) {
    if (!selectedId || selectedRemoval.size === 0 || batchRoleBusy) return
    batchRoleBusy = true
    try {
      const ids = [...selectedRemoval]
      // Skip owners — they can't be downgraded via this API
      const editable = ids.filter((id) => {
        const m = members.find((row) => userId(row) === id)
        return m && m.orgRole !== 'owner'
      })
      if (editable.length === 0) {
        notify.warning('ไม่มีสมาชิกที่เปลี่ยนได้', 'Owner เปลี่ยนสิทธิ์ผ่านเครื่องมือนี้ไม่ได้')
        return
      }
      let ok = 0
      let fail = 0
      for (const id of editable) {
        try {
          await updateOrgMemberRole(id, selectedId, role)
          ok++
        } catch {
          fail++
        }
      }
      if (fail > 0) {
        notify.warning('Bulk role change บางส่วน', `สำเร็จ ${ok} · ล้มเหลว ${fail}`)
      } else {
        notify.success('Bulk role change สำเร็จ', `${ok} member(s) → ${role}`)
      }
      selectedRemoval = new Set()
      await loadMembers()
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      notify.error('Bulk role change ล้มเหลว', msg)
    } finally {
      batchRoleBusy = false
    }
  }

  async function batchAdd() {
    if (!selectedId || selectedAdding.size === 0) return
    await inviteOrgUsers(Array.from(selectedAdding.entries()).map(([userId, role]) => ({ userId, role })), selectedId)
    notify.success('Members added')
    selectedAdding = new Map()
    viewMode = 'members'
    await loadMembers()
  }

  function switchMode(mode: ViewMode) {
    orgTab = 'members'
    viewMode = mode
    memberSearch = ''
    selectedRemoval = new Set()
    selectedAdding = new Map()
    loadMembers()
  }

  function switchOrgTab(tab: OrgTab) {
    orgTab = tab
    if (tab === 'members') loadMembers()
    else loadIngestStatus()
  }

  onMount(() => { setPageTitle(`${m.navSystemUsers()} · ${m.navSystemUsersOrganizations()}`); load() })
</script>

<div class="page-header mb-3"><h1 class="page-title">{m.navSystemUsersOrganizations()}</h1><div class="d-flex gap-2"><button class="btn btn-outline-theme btn-sm" onclick={load} disabled={loading}><i class="bi bi-arrow-clockwise me-1"></i>Refresh</button><button class="btn btn-theme btn-sm" onclick={startCreate}><i class="bi bi-plus-lg me-1"></i>Add organization</button></div></div>

{#if errorMsg}<div class="alert alert-danger">{errorMsg}</div>{/if}

<div class="row g-3 system-users-workspace">
  <div class="col-xl-4">
    <div class="card h-100"><div class="card-header d-flex align-items-center gap-2"><i class="bi bi-building text-theme"></i><b>Organizations</b><span class="badge bg-theme text-black ms-auto">{rows.length}</span></div><div class="card-body"><input class="form-control form-control-sm mb-3" bind:value={search} oninput={() => load()} placeholder="Search organizations..." />{#if loading}<div class="text-muted">Loading…</div>{/if}<div class="list-group list-group-flush">{#each filtered as row (orgId(row))}<button type="button" class="list-group-item list-group-item-action d-flex align-items-start gap-2" class:active={selectedId === orgId(row)} onclick={() => selectOrg(orgId(row))}><i class="bi bi-building"></i><span class="min-w-0 flex-grow-1"><b class="d-block text-truncate">{row.name}</b><small class="d-block text-truncate opacity-75">{row.description || orgId(row)}</small></span><span class="badge bg-secondary-subtle text-body">{row.status || 'active'}</span></button>{/each}</div></div></div>
  </div>
  <div class="col-xl-8">
    <div class="card h-100"><div class="card-header d-flex align-items-center gap-2"><div><b>{selected?.name ?? 'Select organization'}</b><div class="small text-muted">{orgTab === 'ingest' ? 'Gateway ingest and event integration' : viewMode === 'members' ? 'Members in organization' : 'Add users to organization'}</div></div><div class="ms-auto d-flex gap-2">{#if selected}<button class="btn btn-outline-theme btn-sm" aria-label="Edit" title="Edit" onclick={() => startEdit()}><i class="bi bi-pencil"></i></button><button class="btn btn-outline-danger btn-sm" aria-label="Delete" title="Delete" onclick={() => deleteOpen = true}><i class="bi bi-trash"></i></button>{/if}</div></div><div class="card-body">
      {#if selected}
        <div class="d-flex flex-wrap gap-2 align-items-center mb-3"><div class="btn-group btn-group-sm"><button class="btn" class:btn-theme={orgTab === 'members' && viewMode === 'members'} class:btn-outline-theme={orgTab !== 'members' || viewMode !== 'members'} onclick={() => switchMode('members')}>Members</button><button class="btn" class:btn-theme={orgTab === 'members' && viewMode === 'add'} class:btn-outline-theme={orgTab !== 'members' || viewMode !== 'add'} onclick={() => switchMode('add')}>Add members</button><button class="btn" class:btn-theme={orgTab === 'ingest'} class:btn-outline-theme={orgTab !== 'ingest'} onclick={() => switchOrgTab('ingest')}><i class="bi bi-hdd-network me-1"></i>Gateway ingest</button></div>{#if orgTab === 'members'}<input class="form-control form-control-sm ms-auto member-search" bind:value={memberSearch} oninput={() => loadMembers()} placeholder="Search members..." />{/if}</div>
        {#if orgTab === 'ingest'}
          <div class="ingest-panel">
            <div class="d-flex align-items-center gap-3 flex-wrap">
              <div class="ingest-icon"><i class="bi bi-plug"></i></div>
              <div class="flex-grow-1">
                <div class="fw-bold">Gateway ingest events</div>
                <div class="text-muted small">Initializes gateway-api event delivery for this organization.</div>
              </div>
              <span class="badge text-uppercase" class:bg-success={ingestStatus === 'active'} class:bg-warning={ingestStatus === 'provisioning'} class:bg-danger={ingestStatus === 'provisionFailed'} class:bg-secondary={ingestStatus !== 'active' && ingestStatus !== 'provisioning' && ingestStatus !== 'provisionFailed'}>{ingestStatus}</span>
              <button class="btn btn-outline-theme btn-sm" onclick={loadIngestStatus} disabled={ingestBusy}><i class="bi bi-arrow-clockwise me-1"></i>Refresh</button>
              <button class="btn btn-theme btn-sm" onclick={enableIngest} disabled={ingestBusy || ingestStatus === 'active'}>{#if ingestBusy}<span class="spinner-border spinner-border-sm me-1"></span>{/if}<i class="bi bi-lightning-charge me-1"></i>Enable</button>
            </div>
            <div class="mt-3">
              <label class="form-label small text-uppercase" for="ingest-endpoint">Endpoint</label>
              <div class="input-group input-group-sm">
                <input id="ingest-endpoint" class="form-control font-monospace" readonly value={ingestEndpoint || 'Endpoint will appear after gateway confirms active status'} />
                <button class="btn btn-outline-theme" aria-label="Copy ingest endpoint" title="Copy ingest endpoint" onclick={copyIngestEndpoint} disabled={!ingestEndpoint}><i class="bi bi-copy"></i></button>
              </div>
            </div>
          </div>
        {:else}
          {#if memberLoading}<div class="text-muted">Loading members…</div>{/if}
          <div class="table-responsive"><table class="table table-sm table-striped align-middle"><thead><tr><th style="width:42px"></th><th>User</th><th>Email</th><th class="text-center">Role</th></tr></thead><tbody>{#each shownMembers as row (userId(row))}<tr><td>{#if viewMode === 'members'}<input class="form-check-input" type="checkbox" checked={selectedRemoval.has(userId(row))} onchange={() => toggleRemoval(userId(row))} />{:else}<input class="form-check-input" type="checkbox" checked={selectedAdding.has(userId(row))} onchange={() => toggleAdding(row)} />{/if}</td><td><i class="bi bi-person me-2 text-theme"></i>{displayName(row)}</td><td>{row.email ?? '—'}</td><td class="text-center">{#if viewMode === 'members'}{#if row.orgRole === 'owner' || row.isOwner}<span class="badge bg-warning text-black">Owner</span>{:else}<select class="form-select form-select-sm role-select" value={row.orgRole ?? 'member'} onchange={(e) => updateRole(row, (e.currentTarget as HTMLSelectElement).value as OrgRole)}><option value="member">Member</option><option value="admin">Admin</option></select>{/if}{:else}<select class="form-select form-select-sm role-select" disabled={!selectedAdding.has(userId(row))} value={selectedAdding.get(userId(row)) ?? 'member'} onchange={(e) => setAddRole(userId(row), (e.currentTarget as HTMLSelectElement).value as OrgRole)}><option value="member">Member</option><option value="admin">Admin</option></select>{/if}</td></tr>{/each}</tbody></table></div>
          <div class="d-flex justify-content-end gap-2 align-items-center">
            {#if viewMode === 'members' && selectedRemoval.size}
              <span class="small text-body text-opacity-65">{selectedRemoval.size} selected:</span>
              <button class="btn btn-outline-theme btn-sm" disabled={batchRoleBusy} onclick={() => batchSetRole('admin')}>
                {#if batchRoleBusy}<span class="spinner-border spinner-border-sm me-1"></span>{/if}
                Make admin
              </button>
              <button class="btn btn-outline-theme btn-sm" disabled={batchRoleBusy} onclick={() => batchSetRole('member')}>
                {#if batchRoleBusy}<span class="spinner-border spinner-border-sm me-1"></span>{/if}
                Make member
              </button>
              <button class="btn btn-danger btn-sm" onclick={batchRemove}>Remove {selectedRemoval.size}</button>
            {/if}
            {#if viewMode === 'add' && selectedAdding.size}
              <button class="btn btn-theme btn-sm" onclick={batchAdd}>Add {selectedAdding.size}</button>
            {/if}
          </div>
        {/if}
      {:else}<div class="text-muted">Select an organization to manage members.</div>{/if}
    </div></div>
  </div>
</div>

<Modal bind:open={formOpen} title={editing ? 'Edit organization' : 'Add organization'} size="md">
  {#snippet body()}
    <div class="mb-3"><label class="form-label" for="org-name">Name</label><input id="org-name" class="form-control" bind:value={form.name} /></div>
    <div class="mb-3"><label class="form-label" for="org-description">Description</label><textarea id="org-description" class="form-control" rows="3" bind:value={form.description}></textarea></div>
    {#if editing}<div class="mb-3"><label class="form-label" for="org-status">Status</label><input id="org-status" class="form-control" bind:value={form.status} /></div>{/if}
  {/snippet}
  {#snippet footer()}
    <button class="btn btn-outline-secondary" onclick={() => formOpen = false}>Cancel</button>
    <button class="btn btn-theme" onclick={save}>Save</button>
  {/snippet}
</Modal>
<ConfirmDialog bind:open={deleteOpen} title="Delete organization" message="Delete this organization?" confirmLabel="Delete" danger onConfirm={remove} />

<style lang="scss">
  .system-users-workspace { min-height: calc(100vh - 13rem); }
  .list-group-item.active { background: rgba(var(--bs-theme-rgb), .16); border-color: rgba(var(--bs-theme-rgb), .45); color: var(--bs-body-color); }
  .member-search { max-width: 280px; }
  .role-select { min-width: 112px; }
  .ingest-panel {
    border: 1px solid rgba(var(--bs-theme-rgb), .28);
    background: linear-gradient(135deg, rgba(var(--bs-theme-rgb), .1), rgba(var(--bs-body-bg-rgb), .25));
    border-radius: .35rem;
    padding: 1rem;
  }
  .ingest-icon {
    width: 2.75rem;
    height: 2.75rem;
    border-radius: .35rem;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: var(--bs-theme);
    border: 1px solid rgba(var(--bs-theme-rgb), .4);
    background: rgba(var(--bs-theme-rgb), .12);
    font-size: 1.35rem;
  }
</style>
