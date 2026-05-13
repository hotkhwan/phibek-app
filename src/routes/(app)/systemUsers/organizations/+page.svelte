<!-- src/routes/(app)/systemUsers/organizations/+page.svelte -->
<script lang="ts">
  import { onMount } from 'svelte'
  import { setPageTitle } from '$lib/utils/title'
  import Modal from '$lib/components/shared/Modal.svelte'
  import ConfirmDialog from '$lib/components/shared/ConfirmDialog.svelte'
  import {
    createOrg,
    deleteOrg,
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
  import { m } from '$lib/i18n/messages'

  type ViewMode = 'members' | 'add'
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
  let members = $state<MemberRow[]>([])
  let addUsers = $state<MemberRow[]>([])
  let selectedRemoval = $state<Set<string>>(new Set())
  let selectedAdding = $state<Map<string, OrgRole>>(new Map())
  let formOpen = $state(false)
  let deleteOpen = $state(false)
  let editing = $state<Organization | null>(null)
  let form = $state({ name: '', description: '', status: '' })

  const selected = $derived(rows.find((x) => orgId(x) === selectedId))
  const filtered = $derived(rows.filter((x) => `${x.name} ${x.description ?? ''}`.toLowerCase().includes(search.toLowerCase())))
  const shownMembers = $derived((viewMode === 'members' ? members : addUsers).filter((u) => `${displayName(u)} ${u.email ?? ''}`.toLowerCase().includes(memberSearch.toLowerCase())))

  function orgId(row: Organization) { return row.orgId ?? row.id }
  function userId(row: MemberRow) { return row.userId ?? row.id }
  function displayName(row: MemberRow) { return row.label || row.fullName || `${row.firstName ?? ''} ${row.lastName ?? ''}`.trim() || row.username || row.email || userId(row) }

  async function load() {
    loading = true
    errorMsg = ''
    const { data, error } = await listOrgs({ perPage: 250, search: search || undefined })
    loading = false
    if (error) errorMsg = error.message
    rows = data?.details?.items ?? []
    if (!selectedId && rows[0]) selectedId = orgId(rows[0])
    if (selectedId) await loadMembers()
  }

  async function loadMembers() {
    if (!selectedId) return
    memberLoading = true
    const { data, error } = await listOrgMembers({ page: 1, perPage: 250, mode: viewMode === 'members' ? 'members' : undefined, search: memberSearch || undefined, sortField: 'firstName', sortOrder: 'asc' })
    memberLoading = false
    if (error) { notify.error('Members unavailable', error.message); return }
    const mapped = (data?.details?.items ?? []).map((u) => ({ ...u, label: displayName(u) }))
    if (viewMode === 'members') members = mapped
    else addUsers = mapped
  }

  function selectOrg(id: string) {
    selectedId = id
    viewMode = 'members'
    memberSearch = ''
    selectedRemoval = new Set()
    selectedAdding = new Map()
    loadMembers()
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

  async function batchAdd() {
    if (!selectedId || selectedAdding.size === 0) return
    await inviteOrgUsers(Array.from(selectedAdding.entries()).map(([userId, role]) => ({ userId, role })), selectedId)
    notify.success('Members added')
    selectedAdding = new Map()
    viewMode = 'members'
    await loadMembers()
  }

  function switchMode(mode: ViewMode) {
    viewMode = mode
    memberSearch = ''
    selectedRemoval = new Set()
    selectedAdding = new Map()
    loadMembers()
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
    <div class="card h-100"><div class="card-header d-flex align-items-center gap-2"><div><b>{selected?.name ?? 'Select organization'}</b><div class="small text-muted">{viewMode === 'members' ? 'Members in organization' : 'Add users to organization'}</div></div><div class="ms-auto d-flex gap-2">{#if selected}<button class="btn btn-outline-theme btn-sm" aria-label="Edit" title="Edit" onclick={() => startEdit()}><i class="bi bi-pencil"></i></button><button class="btn btn-outline-danger btn-sm" aria-label="Delete" title="Delete" onclick={() => deleteOpen = true}><i class="bi bi-trash"></i></button>{/if}</div></div><div class="card-body">
      {#if selected}
        <div class="d-flex flex-wrap gap-2 align-items-center mb-3"><div class="btn-group btn-group-sm"><button class="btn" class:btn-theme={viewMode === 'members'} class:btn-outline-theme={viewMode !== 'members'} onclick={() => switchMode('members')}>Members</button><button class="btn" class:btn-theme={viewMode === 'add'} class:btn-outline-theme={viewMode !== 'add'} onclick={() => switchMode('add')}>Add members</button></div><input class="form-control form-control-sm ms-auto member-search" bind:value={memberSearch} oninput={() => loadMembers()} placeholder="Search members..." /></div>
        {#if memberLoading}<div class="text-muted">Loading members…</div>{/if}
        <div class="table-responsive"><table class="table table-sm table-striped align-middle"><thead><tr><th style="width:42px"></th><th>User</th><th>Email</th><th class="text-center">Role</th></tr></thead><tbody>{#each shownMembers as row (userId(row))}<tr><td>{#if viewMode === 'members'}<input class="form-check-input" type="checkbox" checked={selectedRemoval.has(userId(row))} onchange={() => toggleRemoval(userId(row))} />{:else}<input class="form-check-input" type="checkbox" checked={selectedAdding.has(userId(row))} onchange={() => toggleAdding(row)} />{/if}</td><td><i class="bi bi-person me-2 text-theme"></i>{displayName(row)}</td><td>{row.email ?? '—'}</td><td class="text-center">{#if viewMode === 'members'}{#if row.orgRole === 'owner' || row.isOwner}<span class="badge bg-warning text-black">Owner</span>{:else}<select class="form-select form-select-sm role-select" value={row.orgRole ?? 'member'} onchange={(e) => updateRole(row, (e.currentTarget as HTMLSelectElement).value as OrgRole)}><option value="member">Member</option><option value="admin">Admin</option></select>{/if}{:else}<select class="form-select form-select-sm role-select" disabled={!selectedAdding.has(userId(row))} value={selectedAdding.get(userId(row)) ?? 'member'} onchange={(e) => setAddRole(userId(row), (e.currentTarget as HTMLSelectElement).value as OrgRole)}><option value="member">Member</option><option value="admin">Admin</option></select>{/if}</td></tr>{/each}</tbody></table></div>
        <div class="d-flex justify-content-end gap-2">{#if viewMode === 'members' && selectedRemoval.size}<button class="btn btn-danger btn-sm" onclick={batchRemove}>Remove {selectedRemoval.size}</button>{/if}{#if viewMode === 'add' && selectedAdding.size}<button class="btn btn-theme btn-sm" onclick={batchAdd}>Add {selectedAdding.size}</button>{/if}</div>
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
</style>
