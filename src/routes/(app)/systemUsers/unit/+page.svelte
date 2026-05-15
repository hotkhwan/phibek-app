<!-- src/routes/(app)/systemUsers/unit/+page.svelte -->
<script lang="ts">
  import { onMount } from 'svelte'
  import { setPageTitle } from '$lib/utils/title'
  import Modal from '$lib/components/shared/Modal.svelte'
  import ConfirmDialog from '$lib/components/shared/ConfirmDialog.svelte'
  import {
    addOrgUnitMembers,
    createOrgUnit,
    deleteOrgUnit,
    getOrgUnitTree,
    listOrgMembers,
    listOrgUnitMembers,
    removeOrgUnitMembers,
    updateOrgUnit,
    type KlynxUser,
    type OrgUnit
  } from '$lib/api/klynxUser'
  import { activeWorkspaceId } from '$lib/stores/activeWorkspace'
  import { notify } from '$lib/stores/notify'
  import { m } from '$lib/i18n/messages'
  import { get } from 'svelte/store'

  type ViewMode = 'members' | 'add'
  type MemberRow = KlynxUser & { userId?: string; orgRole?: 'admin' | 'member' | 'owner'; label?: string }

  let units = $state<OrgUnit[]>([])
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
  let selectedAdding = $state<Map<string, 'admin' | 'member'>>(new Map())
  let formOpen = $state(false)
  let deleteOpen = $state(false)
  let editing = $state<OrgUnit | null>(null)
  let form = $state({ name: '', description: '', parentId: '' })

  const selected = $derived(units.find((x) => x.id === selectedId))
  const filtered = $derived(units.filter((x) => `${x.name} ${x.description ?? ''} ${x.parentId ?? ''}`.toLowerCase().includes(search.toLowerCase())))
  const shownMembers = $derived((viewMode === 'members' ? members : addUsers).filter((u) => `${displayName(u)} ${u.email ?? ''}`.toLowerCase().includes(memberSearch.toLowerCase())))
  const duplicateUnit = $derived.by(() => form.name.trim() ? findDuplicateUnit(form.name, form.parentId, editing?.id) : undefined)

  function userId(row: MemberRow) { return row.userId ?? row.id }
  function displayName(row: MemberRow) { return row.label || row.fullName || `${row.firstName ?? ''} ${row.lastName ?? ''}`.trim() || row.username || row.email || userId(row) }
  function unitDepth(row: OrgUnit) { let depth = 0; let parent = row.parentId; while (parent && depth < 6) { depth++; parent = units.find((u) => u.id === parent)?.parentId } return depth }
  function unitParentKey(parentId?: string) { return parentId || '' }
  function unitNameKey(name: string) { return name.trim().toLocaleLowerCase() }
  function parentLabel(parentId?: string) { return parentId ? units.find((u) => u.id === parentId)?.name ?? 'selected parent' : 'root' }
  function duplicateMessage(name: string, parentId?: string) {
    return `A unit named "${name.trim()}" already exists under ${parentLabel(parentId)}. Select the existing unit or use another name.`
  }
  function findDuplicateUnit(name: string, parentId?: string, excludeId?: string) {
    const key = unitNameKey(name)
    const parentKey = unitParentKey(parentId)
    return units.find((unit) =>
      unit.id !== excludeId &&
      unitParentKey(unit.parentId) === parentKey &&
      unitNameKey(unit.name) === key
    )
  }
  function isDuplicateUnitError(err: unknown) {
    const apiErr = err as { message?: string; data?: { code?: string; message?: string } }
    const message = `${apiErr.message ?? ''} ${apiErr.data?.message ?? ''} ${apiErr.data?.code ?? ''}`.toLowerCase()
    return message.includes('duplicate key') && (message.includes('org_units') || message.includes('uq_root_name_per_org'))
  }

  async function load() {
    loading = true
    errorMsg = ''
    const { data, error } = await getOrgUnitTree()
    loading = false
    if (error) errorMsg = error.message
    units = flattenUnits(data?.details ?? [])
    if (!selectedId && units[0]) selectedId = units[0].id
    if (selectedId) await loadMembers()
  }

  function flattenUnits(items: OrgUnit[]): OrgUnit[] {
    const out: OrgUnit[] = []
    const walk = (list: OrgUnit[]) => {
      for (const item of list) {
        out.push(item)
        const children = (item as OrgUnit & { children?: OrgUnit[] }).children ?? []
        if (children.length) walk(children)
      }
    }
    walk(items)
    return out
  }

  async function loadMembers() {
    if (!selectedId) return
    memberLoading = true
    const req = viewMode === 'members'
      ? listOrgUnitMembers(selectedId, { page: 1, perPage: 250, search: memberSearch || undefined })
      : listOrgMembers({ page: 1, perPage: 250, mode: 'members', search: memberSearch || undefined, sortField: 'firstName', sortOrder: 'asc' })
    const { data, error } = await req
    memberLoading = false
    if (error) { notify.error('Members unavailable', error.message); return }
    const mapped = (data?.details?.items ?? []).map((u) => ({ ...u, label: displayName(u) }))
    if (viewMode === 'members') members = mapped
    else addUsers = mapped.filter((u) => !members.some((m) => userId(m) === userId(u)))
  }

  function selectUnit(id: string) {
    selectedId = id
    viewMode = 'members'
    memberSearch = ''
    selectedRemoval = new Set()
    selectedAdding = new Map()
    loadMembers()
  }

  function startCreate(parentId = selectedId) { editing = null; form = { name: '', description: '', parentId }; formOpen = true }
  function startEdit(row = selected) { if (!row) return; editing = row; form = { name: row.name, description: row.description ?? '', parentId: row.parentId ?? '' }; formOpen = true }

  async function save() {
    if (!form.name.trim()) return
    const activeOrg = get(activeWorkspaceId)
    if (!activeOrg) {
      notify.warning('Select an organization', 'Org units are created inside the active organization.')
      return
    }
    if (duplicateUnit) {
      selectedId = duplicateUnit.id
      notify.warning('Unit already exists', duplicateMessage(form.name, form.parentId))
      return
    }
    const body = { name: form.name.trim(), description: form.description, ...(form.parentId ? { parentId: form.parentId } : {}) }
    try {
      if (editing) await updateOrgUnit(editing.id, body)
      else await createOrgUnit(body)
      notify.success('Unit saved')
      formOpen = false
      await load()
    } catch (err) {
      if (isDuplicateUnitError(err)) {
        notify.warning('Unit already exists', duplicateMessage(form.name, form.parentId))
        await load()
        return
      }
      notify.error('Unit save failed', (err as { message?: string })?.message ?? 'Unknown error')
    }
  }

  async function remove() {
    if (!selected) return
    await deleteOrgUnit(selected.id)
    notify.success('Unit deleted')
    selectedId = ''
    deleteOpen = false
    await load()
  }

  function switchMode(mode: ViewMode) { viewMode = mode; memberSearch = ''; selectedRemoval = new Set(); selectedAdding = new Map(); loadMembers() }
  function toggleRemoval(id: string) { const next = new Set(selectedRemoval); if (next.has(id)) next.delete(id); else next.add(id); selectedRemoval = next }
  function toggleAdding(row: MemberRow) { const next = new Map(selectedAdding); const id = userId(row); if (next.has(id)) next.delete(id); else next.set(id, 'member'); selectedAdding = next }
  function setAddRole(id: string, role: 'admin' | 'member') { const next = new Map(selectedAdding); next.set(id, role); selectedAdding = next }

  async function batchRemove() {
    if (!selectedId || selectedRemoval.size === 0) return
    await removeOrgUnitMembers(selectedId, Array.from(selectedRemoval))
    notify.success('Members removed from unit')
    selectedRemoval = new Set()
    await loadMembers()
    await load()
  }

  async function batchAdd() {
    if (!selectedId || selectedAdding.size === 0) return
    await addOrgUnitMembers(selectedId, Array.from(selectedAdding.entries()).map(([userId, role]) => ({ userId, role })))
    notify.success('Members added to unit')
    selectedAdding = new Map()
    viewMode = 'members'
    await loadMembers()
    await load()
  }

  onMount(() => { setPageTitle(`${m.navSystemUsers()} · ${m.navSystemUsersUnit()}`); load() })
</script>

<div class="page-header mb-3"><h1 class="page-title">{m.navSystemUsersUnit()}</h1><div class="d-flex gap-2"><button class="btn btn-outline-theme btn-sm" onclick={load} disabled={loading}><i class="bi bi-arrow-clockwise me-1"></i>Refresh</button><button class="btn btn-theme btn-sm" onclick={() => startCreate('')}><i class="bi bi-plus-lg me-1"></i>Add root unit</button></div></div>
{#if errorMsg}<div class="alert alert-danger">{errorMsg}</div>{/if}

<div class="row g-3 system-users-workspace">
  <div class="col-xl-4"><div class="card h-100"><div class="card-header d-flex align-items-center gap-2"><i class="bi bi-diagram-2 text-theme"></i><b>Org units</b><span class="badge bg-theme text-black ms-auto">{units.length}</span></div><div class="card-body"><input class="form-control form-control-sm mb-3" bind:value={search} placeholder="Search units..." />{#if loading}<div class="text-muted">Loading…</div>{/if}<div class="list-group list-group-flush">{#each filtered as row (row.id)}<button type="button" class="list-group-item list-group-item-action d-flex align-items-start gap-2" class:active={selectedId === row.id} style={`padding-left:${0.75 + unitDepth(row) * 1.1}rem`} onclick={() => selectUnit(row.id)}><i class="bi {row.parentId ? 'bi-folder' : 'bi-folder2-open'}"></i><span class="min-w-0 flex-grow-1"><b class="d-block text-truncate">{row.name}</b><small class="d-block text-truncate opacity-75">{row.description || row.parentId || 'root'}</small></span><span class="badge bg-secondary-subtle text-body">{row.childCount ?? 0}</span></button>{/each}</div></div></div></div>
  <div class="col-xl-8"><div class="card h-100"><div class="card-header d-flex align-items-center gap-2"><div><b>{selected?.name ?? 'Select unit'}</b><div class="small text-muted">{viewMode === 'members' ? 'Unit members' : 'Add members to unit'}</div></div><div class="ms-auto d-flex gap-2">{#if selected}<button class="btn btn-outline-theme btn-sm" aria-label="Add child unit" onclick={() => startCreate(selected.id)} title="Add child"><i class="bi bi-node-plus"></i></button><button class="btn btn-outline-theme btn-sm" aria-label="Edit" title="Edit" onclick={() => startEdit()}><i class="bi bi-pencil"></i></button><button class="btn btn-outline-danger btn-sm" aria-label="Delete" title="Delete" onclick={() => deleteOpen = true}><i class="bi bi-trash"></i></button>{/if}</div></div><div class="card-body">
    {#if selected}<div class="d-flex flex-wrap gap-2 align-items-center mb-3"><div class="btn-group btn-group-sm"><button class="btn" class:btn-theme={viewMode === 'members'} class:btn-outline-theme={viewMode !== 'members'} onclick={() => switchMode('members')}>Members</button><button class="btn" class:btn-theme={viewMode === 'add'} class:btn-outline-theme={viewMode !== 'add'} onclick={() => switchMode('add')}>Add members</button></div><input class="form-control form-control-sm ms-auto member-search" bind:value={memberSearch} oninput={() => loadMembers()} placeholder="Search members..." /></div>{#if memberLoading}<div class="text-muted">Loading members…</div>{/if}<div class="table-responsive"><table class="table table-sm table-striped align-middle"><thead><tr><th style="width:42px"></th><th>User</th><th>Email</th><th class="text-center">Role</th></tr></thead><tbody>{#each shownMembers as row (userId(row))}<tr><td>{#if viewMode === 'members'}<input class="form-check-input" type="checkbox" checked={selectedRemoval.has(userId(row))} onchange={() => toggleRemoval(userId(row))} />{:else}<input class="form-check-input" type="checkbox" checked={selectedAdding.has(userId(row))} onchange={() => toggleAdding(row)} />{/if}</td><td><i class="bi bi-person me-2 text-theme"></i>{displayName(row)}</td><td>{row.email ?? '—'}</td><td class="text-center">{#if viewMode === 'add'}<select class="form-select form-select-sm role-select" disabled={!selectedAdding.has(userId(row))} value={selectedAdding.get(userId(row)) ?? 'member'} onchange={(e) => setAddRole(userId(row), (e.currentTarget as HTMLSelectElement).value as 'admin' | 'member')}><option value="member">Member</option><option value="admin">Admin</option></select>{:else}<span class="badge bg-secondary-subtle text-body">{row.orgRole ?? 'member'}</span>{/if}</td></tr>{/each}</tbody></table></div><div class="d-flex justify-content-end gap-2">{#if viewMode === 'members' && selectedRemoval.size}<button class="btn btn-danger btn-sm" onclick={batchRemove}>Remove {selectedRemoval.size}</button>{/if}{#if viewMode === 'add' && selectedAdding.size}<button class="btn btn-theme btn-sm" onclick={batchAdd}>Add {selectedAdding.size}</button>{/if}</div>{:else}<div class="text-muted">Select a unit to manage members.</div>{/if}
  </div></div></div>
</div>

<Modal bind:open={formOpen} title={editing ? 'Edit unit' : 'Add unit'} size="md">
  {#snippet body()}<div class="mb-3"><label class="form-label" for="unit-name">Name</label><input id="unit-name" class="form-control" bind:value={form.name} />{#if duplicateUnit}<div class="alert alert-warning py-2 px-3 mt-2 mb-0 small">{duplicateMessage(form.name, form.parentId)}</div>{/if}</div><div class="mb-3"><label class="form-label" for="unit-parent">Parent unit</label><select id="unit-parent" class="form-select" bind:value={form.parentId}><option value="">— root —</option>{#each units.filter((u) => u.id !== editing?.id) as opt (opt.id)}<option value={opt.id}>{opt.name}</option>{/each}</select></div><div class="mb-3"><label class="form-label" for="unit-description">Description</label><textarea id="unit-description" class="form-control" rows="3" bind:value={form.description}></textarea></div>{/snippet}
  {#snippet footer()}<button class="btn btn-outline-secondary" onclick={() => formOpen = false}>Cancel</button><button class="btn btn-theme" onclick={save} disabled={!form.name.trim() || !!duplicateUnit}>Save</button>{/snippet}
</Modal>
<ConfirmDialog bind:open={deleteOpen} title="Delete unit" message="Delete this unit?" confirmLabel="Delete" danger onConfirm={remove} />

<style lang="scss">
  .system-users-workspace { min-height: calc(100vh - 13rem); }
  .list-group-item.active { background: rgba(var(--bs-theme-rgb), .16); border-color: rgba(var(--bs-theme-rgb), .45); color: var(--bs-body-color); }
  .member-search { max-width: 280px; }
  .role-select { min-width: 112px; }
</style>
