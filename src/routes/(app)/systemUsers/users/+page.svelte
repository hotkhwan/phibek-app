<!-- src/routes/(app)/systemUsers/users/+page.svelte
     Layout follows cyber_admin v2.0/template_html/src/html/page_products.html:
       page-header + ADD USER (top)
       3 KPI summary cards (kept by request)
       Toolbar: STATUS dropdown + search input-group
       table-striped table-sm table-card text-uppercase
       Footer: "Showing X to Y of Z entries" + pagination-sm page-link
     Row actions use direct compact icon buttons. -->
<script lang="ts">
  import { onMount } from 'svelte'
  import { setPageTitle } from '$lib/utils/title'
  import Modal from '$lib/components/shared/Modal.svelte'
  import ConfirmDialog from '$lib/components/shared/ConfirmDialog.svelte'
  import {
    getUser,
    listOrgs,
    listUsers,
    provisionUser,
    removeUserFromOrg,
    setUserEnabled,
    updateOrgMemberRole,
    updateUser,
    updateUserProfileMultipart,
    type KlynxUser,
    type Organization,
    type UserDetail,
    type UserOrganizationMembership
  } from '$lib/api/klynxUser'
  import { activeWorkspaceId } from '$lib/stores/activeWorkspace'
  import { get } from 'svelte/store'
  import { notify } from '$lib/stores/notify'
  import { m } from '$lib/i18n/messages'

  type StatusFilter = 'all' | 'enabled' | 'disabled'
  type PlatformRole = 'administrator' | 'user'
  type OrgRole = 'admin' | 'member'
  type EditableMembership = UserOrganizationMembership & {
    draftRole: OrgRole
    originalRole: OrgRole
    isNew?: boolean
  }

  // ─────────── data ───────────
  let rows = $state<KlynxUser[]>([])
  let loading = $state(false)
  let exporting = $state(false)
  let errorMsg = $state('')

  // Mirror activeWorkspaceId so the template can react. New users are added
  // to whichever org is selected here (X-Active-Org auto-injected by fetch).
  let activeOrgId = $state('')

  // ─────────── filters ───────────
  let search = $state('')
  let statusFilter = $state<StatusFilter>('all')
  let perPage = $state(10)
  const PER_PAGE_OPTIONS = [10, 25, 50, 100]
  let pageIndex = $state(1)

  // ─────────── modal state ───────────
  type FormMode = 'create' | 'edit'
  let formOpen = $state(false)
  let formMode = $state<FormMode>('create')
  let formBusy = $state(false)
  let editingId = $state<string | null>(null)
  let originalEnabled = $state(true)
  let avatarFile = $state<File | null>(null)
  let avatarPreview = $state('')
  let memberships = $state<EditableMembership[]>([])
  let orgOptions = $state<Organization[]>([])
  let orgLoading = $state(false)
  let addOrgId = $state('')
  let addOrgRole = $state<OrgRole>('member')
  let form = $state({
    username: '',
    password: '',
    firstName: '',
    lastName: '',
    email: '',
    platformRole: 'user' as PlatformRole,
    enabled: true
  })

  // ─────────── delete confirm ───────────
  let deleteOpen = $state(false)
  let deleteBusy = $state(false)
  let deleteTarget = $state<KlynxUser | null>(null)

  // ─────────── avatar lightbox ───────────
  let lightboxOpen = $state(false)

  // ─────────── derived ───────────
  const totalUsers = $derived(rows.length)
  const enabledUsers = $derived(rows.filter((u) => u.enabled !== false).length)
  const disabledUsers = $derived(totalUsers - enabledUsers)
  const enabledPct = $derived(totalUsers ? Math.round((enabledUsers / totalUsers) * 100) : 0)
  const disabledPct = $derived(totalUsers ? 100 - enabledPct : 0)

  // Status filter is applied client-side (no backend support).
  // Search is sent to the backend (server-side) — see `load()` below.
  const filtered = $derived(rows.filter((u) => {
    if (statusFilter === 'enabled' && u.enabled === false) return false
    if (statusFilter === 'disabled' && u.enabled !== false) return false
    return true
  }))

  const totalEntries = $derived(filtered.length)
  const totalPages = $derived(Math.max(1, Math.ceil(totalEntries / perPage)))
  const safePage = $derived(Math.min(Math.max(1, pageIndex), totalPages))
  const offset = $derived((safePage - 1) * perPage)
  const paged = $derived(filtered.slice(offset, offset + perPage))
  const showingFrom = $derived(totalEntries === 0 ? 0 : offset + 1)
  const showingTo = $derived(Math.min(offset + perPage, totalEntries))

  // page numbers (windowed)
  const pageNumbers = $derived.by(() => {
    const list: number[] = []
    const max = Math.min(totalPages, 6)
    let start = Math.max(1, safePage - 2)
    const end = Math.min(totalPages, start + max - 1)
    start = Math.max(1, end - max + 1)
    for (let i = start; i <= end; i++) list.push(i)
    return list
  })

  const availableOrgs = $derived(orgOptions.filter((org) => {
    const id = orgIdOf(org)
    return id && !memberships.some((m) => orgIdOf(m) === id)
  }))

  // Active org metadata for the page header banner.
  const activeOrg = $derived(orgOptions.find((o) => orgIdOf(o) === activeOrgId))
  const hasActiveOrg = $derived(!!activeOrgId)

  function orgIdOf(org: Pick<Organization, 'id' | 'orgId'> | null | undefined): string {
    return org?.orgId || org?.id || ''
  }

  function orgRoleOf(role: string | undefined): OrgRole {
    return role === 'admin' ? 'admin' : 'member'
  }

  function platformRoleOf(role: string | undefined): PlatformRole {
    return role === 'administrator' ? 'administrator' : 'user'
  }

  function isUserDetail(details: KlynxUser | UserDetail | undefined): details is UserDetail {
    return !!details && typeof details === 'object' && 'user' in details && Array.isArray(details.organizations)
  }

  function resetAvatarPreview() {
    if (avatarPreview) URL.revokeObjectURL(avatarPreview)
    avatarPreview = ''
    avatarFile = null
  }

  function onAvatarChange(event: Event) {
    const input = event.currentTarget as HTMLInputElement
    const file = input.files?.[0]
    resetAvatarPreview()
    if (!file) return
    if (!file.type.startsWith('image/')) {
      notify.warning('Please choose an image file')
      input.value = ''
      return
    }
    avatarFile = file
    avatarPreview = URL.createObjectURL(file)
  }

  async function convertImageToWebp(file: File): Promise<File> {
    if (file.type === 'image/webp' && file.size <= 2 * 1024 * 1024) return file
    const bitmap = await createImageBitmap(file)
    const maxSide = 768
    const ratio = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
    const width = Math.max(1, Math.round(bitmap.width * ratio))
    const height = Math.max(1, Math.round(bitmap.height * ratio))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Cannot prepare avatar image')
    ctx.drawImage(bitmap, 0, 0, width, height)
    bitmap.close()
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((value) => value ? resolve(value) : reject(new Error('Cannot convert avatar to webp')), 'image/webp', 0.86)
    })
    const basename = file.name.replace(/\.[^.]+$/, '') || 'avatar'
    return new File([blob], `${basename}.webp`, { type: 'image/webp' })
  }

  async function loadOrgOptions() {
    orgLoading = true
    const { data, error } = await listOrgs({ perPage: 250 })
    orgLoading = false
    if (error) {
      notify.warning('Organizations unavailable', error.message)
      orgOptions = []
      return
    }
    orgOptions = data?.details?.items ?? []
  }

  function addPendingOrg() {
    if (!addOrgId) return
    const org = availableOrgs.find((item) => orgIdOf(item) === addOrgId)
    if (!org) return
    memberships = [
      ...memberships,
      { ...org, orgRole: addOrgRole, draftRole: addOrgRole, originalRole: addOrgRole, isNew: true }
    ]
    addOrgId = ''
    addOrgRole = 'member'
  }

  function fullNameOf(u: KlynxUser): string {
    return u.fullName?.trim() ||
      `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() ||
      u.username
  }

  function statusLabel(): string {
    if (statusFilter === 'enabled') return 'STATUS: ENABLED'
    if (statusFilter === 'disabled') return 'STATUS: DISABLED'
    return 'STATUS: ALL'
  }

  // ─────────── load (always /users — adminPlatform sees the platform-wide
  //                  registry; new users are added to the active org via
  //                  X-Active-Org on the create call) ───────────
  let searchToken = 0
  async function load() {
    loading = true
    errorMsg = ''
    const myToken = ++searchToken
    const params = {
      perPage: 250,
      search: search.trim() || undefined
    }
    try {
      const { data, error } = await listUsers(params)
      if (myToken !== searchToken) return
      if (error) {
        errorMsg = error.message
        rows = []
      } else {
        rows = (data?.details?.items ?? []) as KlynxUser[]
      }
      pageIndex = 1
    } catch (err) {
      if (myToken !== searchToken) return
      errorMsg = (err as Error)?.message ?? 'Failed to load users'
      rows = []
    } finally {
      loading = false
    }
  }

  // ─────────── debounced search → server fetch ───────────
  let searchTimer: ReturnType<typeof setTimeout> | null = null
  function onSearchInput() {
    pageIndex = 1
    if (searchTimer) clearTimeout(searchTimer)
    searchTimer = setTimeout(() => {
      load()
    }, 350)
  }

  // ─────────── create ───────────
  // adminPlatform creates users into the active org (X-Active-Org auto-injected
  // by `lib/utils/fetch`). On a fresh install with no org selected, block the
  // action and prompt the user to create one in `Organizations` first.
  function openCreate() {
    if (!activeOrgId) {
      notify.warning('Select an organization', 'New users are added to the active organization. Create one in Organizations or switch to an existing one before adding users.')
      return
    }
    formMode = 'create'
    editingId = null
    originalEnabled = true
    resetAvatarPreview()
    memberships = []
    addOrgId = ''
    addOrgRole = 'member'
    form = { username: '', password: '', firstName: '', lastName: '', email: '', platformRole: 'user', enabled: true }
    formOpen = true
  }
  async function openEdit(u: KlynxUser) {
    formMode = 'edit'
    editingId = u.id
    originalEnabled = u.enabled !== false
    resetAvatarPreview()
    memberships = []
    addOrgId = ''
    addOrgRole = 'member'
    form = {
      username: u.username,
      password: '',
      firstName: u.firstName ?? '',
      lastName: u.lastName ?? '',
      email: u.email ?? '',
      platformRole: platformRoleOf(u.platformRole ?? u.role),
      enabled: u.enabled !== false
    }
    formOpen = true
    await Promise.allSettled([
      (async () => {
        const { data, error } = await getUser(u.id)
        if (error) {
          notify.warning('User detail unavailable', error.message)
          return
        }
        const details = data?.details
        if (!isUserDetail(details)) return
        const user = details.user
        originalEnabled = user.enabled !== false
        form = {
          ...form,
          username: user.username || form.username,
          firstName: user.firstName ?? '',
          lastName: user.lastName ?? '',
          email: user.email ?? '',
          platformRole: platformRoleOf(user.platformRole ?? user.role),
          enabled: user.enabled !== false
        }
        memberships = details.organizations.map((org) => {
          const role = orgRoleOf(org.orgRole)
          return { ...org, draftRole: role, originalRole: role }
        })
      })(),
      loadOrgOptions()
    ])
  }
  async function saveForm() {
    if (formBusy) return
    if (!form.username.trim()) { notify.warning('Username required'); return }
    if (formMode === 'create' && !form.password) { notify.warning('Password required for new user'); return }
    formBusy = true
    try {
      if (formMode === 'create') {
        await provisionUser({
          username: form.username.trim(),
          password: form.password,
          firstName: form.firstName.trim() || undefined,
          lastName: form.lastName.trim() || undefined,
          email: form.email.trim() || undefined,
          enabled: form.enabled,
          role: 'member'
        })
        notify.success('User created', form.username)
      } else if (editingId) {
        await updateUser(editingId, {
          firstName: form.firstName.trim() || undefined,
          lastName: form.lastName.trim() || undefined,
          email: form.email.trim() || undefined,
          role: form.platformRole
        })
        if (form.enabled !== originalEnabled) {
          await setUserEnabled(editingId, form.enabled)
        }
        if (avatarFile) {
          const avatar = await convertImageToWebp(avatarFile)
          const body = new FormData()
          body.set('firstName', form.firstName.trim())
          body.set('lastName', form.lastName.trim())
          body.set('avatar', avatar)
          await updateUserProfileMultipart(editingId, body)
        }
        for (const membership of memberships) {
          const orgId = orgIdOf(membership)
          if (!orgId || membership.orgRole === 'owner') continue
          if (!membership.isNew && membership.draftRole === membership.originalRole) continue
          await updateOrgMemberRole(editingId, orgId, membership.draftRole)
        }
        notify.success('User updated', form.username)
      }
      resetAvatarPreview()
      formOpen = false
      await load()
    } catch (err) {
      notify.error('Save failed', (err as { message?: string })?.message ?? 'Unknown error')
    } finally {
      formBusy = false
    }
  }

  async function toggleEnabled(u: KlynxUser) {
    const next = u.enabled === false
    try {
      await setUserEnabled(u.id, next)
      notify.success(next ? 'User enabled' : 'User disabled', u.username)
      await load()
    } catch (err) {
      notify.error('Toggle failed', (err as { message?: string })?.message ?? 'Unknown error')
    }
  }

  function openDelete(u: KlynxUser) { deleteTarget = u; deleteOpen = true }
  async function confirmDelete() {
    if (!deleteTarget) return
    deleteBusy = true
    const removedId = deleteTarget.id
    const orgId = get(activeWorkspaceId) ?? ''
    try {
      await removeUserFromOrg(removedId, orgId || undefined)
      notify.success('User removed', deleteTarget.username)
      // Optimistically drop the row so the UI reflects the change immediately
      // even if the backend list has a stale cache momentarily.
      rows = rows.filter((r) => r.id !== removedId)
      // Then re-fetch from the current scope endpoint to get authoritative data.
      await load()
    } catch (err) {
      notify.error('Remove failed', (err as { message?: string })?.message ?? 'Unknown error')
    } finally {
      deleteBusy = false
      deleteOpen = false
      deleteTarget = null
    }
  }

  function matchesCurrentFilters(u: KlynxUser): boolean {
    if (statusFilter === 'enabled' && u.enabled === false) return false
    if (statusFilter === 'disabled' && u.enabled !== false) return false
    if (!search) return true
    const needle = search.toLowerCase()
    return (
      (u.username ?? '').toLowerCase().includes(needle) ||
      (u.email ?? '').toLowerCase().includes(needle) ||
      (u.firstName ?? '').toLowerCase().includes(needle) ||
      (u.lastName ?? '').toLowerCase().includes(needle) ||
      (u.fullName ?? '').toLowerCase().includes(needle)
    )
  }

  async function fetchUsersForExport(): Promise<KlynxUser[]> {
    const perPageExport = 500
    const first = await listUsers({
      page: 1,
      perPage: perPageExport,
      search: search.trim() || undefined
    })
    if (first.error) throw new Error(first.error.message)

    const items = first.data?.details?.items ?? []
    const totalPages = first.data?.pagination?.totalPages ?? 1
    if (totalPages <= 1) return items.filter(matchesCurrentFilters)

    const rest: KlynxUser[] = []
    for (let page = 2; page <= totalPages; page += 1) {
      const res = await listUsers({
        page,
        perPage: perPageExport,
        search: search.trim() || undefined
      })
      if (res.error) throw new Error(res.error.message)
      rest.push(...(res.data?.details?.items ?? []))
    }
    return [...items, ...rest].filter(matchesCurrentFilters)
  }

  async function exportExcel() {
    if (exporting) return
    exporting = true
    try {
      const exportRows = await fetchUsersForExport()
      const header = ['#', 'Username', 'Full Name', 'Email', 'Status', 'Role', 'Created']
      const lines = exportRows.map((u, i) => [
        i + 1, u.username, fullNameOf(u), u.email ?? '',
        u.enabled === false ? 'disabled' : 'enabled',
        u.platformRole ?? u.role ?? '', u.createdAt ?? u.createAt ?? ''
      ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))
      const csv = [header.join(','), ...lines].join('\n')
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `users-${new Date().toISOString().slice(0, 10)}.csv`
      a.click()
      URL.revokeObjectURL(url)
      notify.success(
        search || statusFilter !== 'all' ? 'Filtered users exported' : 'All users exported',
        `${exportRows.length} user${exportRows.length === 1 ? '' : 's'}`
      )
    } catch (err) {
      notify.error('Export failed', (err as { message?: string })?.message ?? 'Unknown error')
    } finally {
      exporting = false
    }
  }

  function gotoPage(p: number) {
    if (p < 1 || p > totalPages || p === safePage) return
    pageIndex = p
  }

  onMount(() => {
    setPageTitle(`${m.navSystemUsers()} · ${m.navSystemUsersUsers()}`)
    // Mirror activeWorkspaceId so the template can react when the user
    // switches org from the header dropdown — without re-mounting the page.
    const unsub = activeWorkspaceId.subscribe((id) => {
      activeOrgId = id ?? ''
    })
    // Load orgs eagerly so the banner can name the active org and so the
    // edit-modal membership list has options without an extra await.
    void loadOrgOptions()
    load()
    return () => unsub()
  })
</script>

<div class="users-page d-flex flex-column" style="min-height: 100%;">
  <!-- Breadcrumb -->
  <ul class="breadcrumb border-bottom px-3 py-2 m-0">
    <li class="breadcrumb-item"><a href="#/" onclick={(e) => e.preventDefault()}>SYSTEM</a></li>
    <li class="breadcrumb-item active">USERS</li>
  </ul>

  <!-- Header -->
  <div class="app-content-header d-flex align-items-end p-3 pb-0">
    <div class="page-header mb-0">
      {m.navSystemUsersUsers()}
      <small>{rows.length} user{rows.length === 1 ? '' : 's'} in system</small>
    </div>
    <div class="ms-auto">
      <button
        type="button"
        class="btn btn-outline-theme text-uppercase"
        onclick={openCreate}
        disabled={!hasActiveOrg}
        title={hasActiveOrg ? '' : 'Select an active organization first'}
      >
        <i class="bi bi-plus-lg me-1"></i> Add user
      </button>
    </div>
  </div>

  <!-- KPI summary cards -->
  <div class="px-3 pt-3">
    <div class="row g-3">
      <div class="col-xl-4 col-md-6">
        <div class="card h-100">
          <div class="card-body d-flex align-items-center justify-content-between py-3">
            <div>
              <div class="text-body text-opacity-50 small text-uppercase fw-semibold">Total users</div>
              <div class="display-6 mb-0">{totalUsers.toLocaleString()}</div>
            </div>
            <i class="bi bi-people fs-2 text-body text-opacity-25"></i>
          </div>
          <div class="card-arrow"><div class="card-arrow-top-left"></div><div class="card-arrow-top-right"></div><div class="card-arrow-bottom-left"></div><div class="card-arrow-bottom-right"></div></div>
        </div>
      </div>
      <div class="col-xl-4 col-md-6">
        <div class="card h-100">
          <div class="card-body d-flex align-items-center justify-content-between py-3">
            <div>
              <div class="text-body text-opacity-50 small text-uppercase fw-semibold">Enabled</div>
              <div class="display-6 mb-0 text-theme">
                {enabledUsers.toLocaleString()}
                <small class="text-body text-opacity-50 ms-1">{enabledPct}%</small>
              </div>
            </div>
            <i class="bi bi-person-check fs-2 text-theme opacity-50"></i>
          </div>
          <div class="card-arrow"><div class="card-arrow-top-left"></div><div class="card-arrow-top-right"></div><div class="card-arrow-bottom-left"></div><div class="card-arrow-bottom-right"></div></div>
        </div>
      </div>
      <div class="col-xl-4 col-md-12">
        <div class="card h-100">
          <div class="card-body d-flex align-items-center justify-content-between py-3">
            <div>
              <div class="text-body text-opacity-50 small text-uppercase fw-semibold">Disabled</div>
              <div class="display-6 mb-0 text-body text-opacity-50">
                {disabledUsers.toLocaleString()}
                <small class="text-body text-opacity-50 ms-1">{disabledPct}%</small>
              </div>
            </div>
            <i class="bi bi-person-x fs-2 text-body text-opacity-25"></i>
          </div>
          <div class="card-arrow"><div class="card-arrow-top-left"></div><div class="card-arrow-top-right"></div><div class="card-arrow-bottom-left"></div><div class="card-arrow-bottom-right"></div></div>
        </div>
      </div>
    </div>
  </div>

  <!-- Toolbar (cyber_admin pattern) -->
  <div class="p-3 border-bottom">
    <!-- Active-org context: new users are created into this org -->
    {#if hasActiveOrg}
      <div class="small text-body text-opacity-50 text-uppercase mb-2">
        <i class="bi bi-building me-1"></i>
        New users are added to:
        <span class="text-theme fw-semibold">{activeOrg?.name ?? activeOrgId}</span>
      </div>
    {:else}
      <div class="alert alert-warning d-flex align-items-center py-2 mb-2 small text-uppercase" role="alert">
        <i class="bi bi-exclamation-triangle-fill me-2"></i>
        <span>No active organization. Create one in <a href="organizations" class="alert-link">Organizations</a> and select it before adding users.</span>
      </div>
    {/if}

    <div class="input-group mb-3">
      <button class="btn btn-outline-secondary dropdown-toggle text-uppercase" type="button" data-bs-toggle="dropdown" aria-expanded="false">
        {statusLabel()} &nbsp;
      </button>
      <div class="dropdown-menu">
        <button type="button" class="dropdown-item text-uppercase" onclick={() => { statusFilter = 'all'; pageIndex = 1 }}>All</button>
        <button type="button" class="dropdown-item text-uppercase" onclick={() => { statusFilter = 'enabled'; pageIndex = 1 }}>Enabled</button>
        <button type="button" class="dropdown-item text-uppercase" onclick={() => { statusFilter = 'disabled'; pageIndex = 1 }}>Disabled</button>
      </div>
      <div class="flex-fill position-relative">
        <div class="input-group">
          <div class="input-group-text position-absolute top-0 bottom-0 bg-none border-0 pe-0">
            <i class="fa fa-search opacity-5"></i>
          </div>
          <input type="text" class="form-control ps-30px border-start-0" placeholder="Search users…"
            bind:value={search}
            oninput={onSearchInput}
            onkeydown={(e) => {
              if (e.key === 'Enter') {
                if (searchTimer) { clearTimeout(searchTimer); searchTimer = null }
                load()
              }
            }} />
        </div>
      </div>
    </div>

    <div class="d-flex flex-wrap gap-4 text-uppercase text-nowrap mb-n2 small">
      <button
        type="button"
        class="btn btn-link p-0 fw-semibold text-body text-opacity-75 d-flex align-items-center gap-2 text-decoration-none"
        onclick={exportExcel}
        disabled={loading || exporting || rows.length === 0}
        title={search || statusFilter !== 'all'
          ? `Export ${filtered.length} filtered user(s)`
          : 'Export all users'}
      >
        <i class={`fa ${exporting ? 'fa-spinner fa-spin' : 'fa-download'} fa-fw text-body text-opacity-25`}></i>
        {exporting ? 'Exporting…' : 'Export'}
      </button>
      <button type="button" class="btn btn-link p-0 fw-semibold text-body text-opacity-75 d-flex align-items-center gap-2 text-decoration-none"
        onclick={load} disabled={loading}>
        <i class="fa fa-arrows-rotate fa-fw text-body text-opacity-25"></i>
        {loading ? 'Loading…' : 'Refresh'}
      </button>
      {#if search || statusFilter !== 'all'}
        <button type="button" class="btn btn-link p-0 fw-semibold text-body text-opacity-75 d-flex align-items-center gap-2 text-decoration-none"
          onclick={() => { search = ''; statusFilter = 'all'; pageIndex = 1; load() }}>
          <i class="fa fa-xmark fa-fw text-body text-opacity-25"></i> Clear
        </button>
      {/if}
      <div class="ms-auto text-body text-opacity-50 d-flex align-items-center gap-2">
        <span>Per page</span>
        <select class="form-select form-select-sm" style="width: auto" bind:value={perPage} onchange={() => (pageIndex = 1)}>
          {#each PER_PAGE_OPTIONS as n}
            <option value={n}>{n}</option>
          {/each}
        </select>
      </div>
    </div>
  </div>

  {#if errorMsg}
    <div class="alert alert-danger small mx-3 mt-3 mb-0">{errorMsg}</div>
  {/if}

  <!-- Table -->
  <div class="flex-1">
    <div class="table-responsive">
      <table class="table table-striped table-sm table-card text-nowrap mb-1 align-middle">
        <thead>
          <tr>
            <th>User</th>
            <th>Email</th>
            <th>Status</th>
            <th>Platform Role</th>
            <th>Created</th>
            <th class="text-end" style="width: 104px;">Actions</th>
          </tr>
        </thead>
        <tbody>
          {#if loading && rows.length === 0}
            <tr><td colspan="6" class="text-center py-4 text-uppercase text-body text-opacity-50">
              <div class="spinner-border spinner-border-sm text-theme me-2"></div>Loading…
            </td></tr>
          {:else if paged.length === 0}
            <tr><td colspan="6" class="text-center py-4 text-uppercase text-body text-opacity-50">No users</td></tr>
          {:else}
            {#each paged as u (u.id)}
              <tr>
                <td>
                  <div class="d-flex align-items-center">
                    {#if u.avatar}
                      <img alt={u.username} width="30" height="30" class="object-fit-cover rounded-circle" src={u.avatar} />
                    {:else}
                      <span class="d-inline-flex align-items-center justify-content-center rounded-circle bg-body-secondary" style="width: 30px; height: 30px;">
                        <i class="bi bi-person"></i>
                      </span>
                    {/if}
                    <div class="ms-3">
                      <div class="text-body fw-semibold">{u.username}</div>
                      <div class="small text-body text-opacity-50 text-capitalize">{fullNameOf(u)}</div>
                    </div>
                  </div>
                </td>
                <td class="align-middle text-lowercase">{u.email ?? '—'}</td>
                <td class="align-middle">
                  <span class="badge text-uppercase"
                    class:bg-theme={u.enabled !== false}
                    class:text-theme-color={u.enabled !== false}
                    class:bg-secondary={u.enabled === false}
                    class:bg-opacity-25={u.enabled === false}
                    class:text-body={u.enabled === false}
                    class:text-opacity-75={u.enabled === false}>
                    {u.enabled !== false ? 'Enabled' : 'Disabled'}
                  </span>
                </td>
                <td class="align-middle font-monospace">{u.platformRole ?? u.role ?? '—'}</td>
                <td class="align-middle">{(u.createdAt ?? u.createAt) ? new Date(u.createdAt ?? u.createAt!).toLocaleString() : '—'}</td>
                <td class="align-middle text-end">
                  <div class="btn-group btn-group-sm user-row-actions" role="group" aria-label={`Actions for ${u.username}`}>
                    <button type="button" class="btn btn-outline-secondary" title="Edit" aria-label={`Edit ${u.username}`} onclick={() => openEdit(u)}>
                      <i class="bi bi-pencil"></i>
                    </button>
                    <button type="button" class="btn btn-outline-secondary" title={u.enabled === false ? 'Enable' : 'Disable'} aria-label={`${u.enabled === false ? 'Enable' : 'Disable'} ${u.username}`} onclick={() => toggleEnabled(u)}>
                      <i class={u.enabled === false ? 'bi bi-toggle-off' : 'bi bi-toggle-on'}></i>
                    </button>
                    <button type="button" class="btn btn-outline-danger" title="Remove" aria-label={`Remove ${u.username}`} onclick={() => openDelete(u)}>
                      <i class="bi bi-trash"></i>
                    </button>
                  </div>
                </td>
              </tr>
            {/each}
          {/if}
        </tbody>
      </table>
    </div>
  </div>

  <!-- Pagination footer (cyber_admin pattern) -->
  <div class="p-3 border-top">
    <div class="d-lg-flex align-items-center gap-3">
      <div class="text-body text-opacity-50 flex-1 text-lg-start text-center mb-2 mb-lg-0">
        Showing
        <span class="text-body">{showingFrom} to {showingTo}</span>
        of <span class="text-body">{totalEntries}</span> entries
      </div>
      <ul class="pagination pagination-sm mb-0 justify-content-center">
        <li class="page-item" class:disabled={safePage <= 1}>
          <button type="button" class="page-link" onclick={() => gotoPage(safePage - 1)} disabled={safePage <= 1}>Previous</button>
        </li>
        {#each pageNumbers as p}
          <li class="page-item" class:active={p === safePage}>
            <button type="button" class="page-link" onclick={() => gotoPage(p)}>{p}</button>
          </li>
        {/each}
        <li class="page-item" class:disabled={safePage >= totalPages}>
          <button type="button" class="page-link" onclick={() => gotoPage(safePage + 1)} disabled={safePage >= totalPages}>Next</button>
        </li>
      </ul>
    </div>
  </div>
</div>

<!-- Create / Edit modal -->
<Modal bind:open={formOpen} title={formMode === 'create' ? 'Add user' : 'Edit user'} size={formMode === 'edit' ? 'xl' : 'lg'} dismissible={!formBusy}>
  {#snippet body()}
    {#if formMode === 'edit'}
      <div class="user-edit-shell">
        <div class="user-avatar-panel">
          <div class="text-uppercase fw-semibold text-body text-opacity-75 mb-3">Profile image</div>

          <div class="user-avatar-thumb-wrap">
            <label class="user-avatar-drop" for="user-avatar">
              {#if avatarPreview}
                <img src={avatarPreview} alt="Avatar preview" />
              {:else}
                <i class="bi bi-image"></i>
                <span>Choose</span>
              {/if}
            </label>
            {#if avatarPreview}
              <button
                type="button"
                class="user-avatar-zoom"
                aria-label="View full image"
                title="View full image"
                onclick={() => (lightboxOpen = true)}
              >
                <i class="bi bi-zoom-in"></i>
              </button>
            {/if}
          </div>

          <input id="user-avatar" class="visually-hidden" type="file" accept="image/jpeg,image/png,image/gif,image/webp" onchange={onAvatarChange} />
          <div class="d-flex justify-content-center gap-2 mt-3">
            <label class="btn btn-outline-theme btn-sm" for="user-avatar">
              <i class="bi bi-upload me-1"></i> Upload
            </label>
            {#if avatarPreview}
              <button
                type="button"
                class="btn btn-outline-secondary btn-sm"
                onclick={resetAvatarPreview}
              >
                <i class="bi bi-x-lg me-1"></i> Remove
              </button>
            {/if}
          </div>
          <div class="small text-body text-opacity-50 mt-2">Saved as WEBP · max 768×768</div>
        </div>

        <div class="user-edit-fields">
          <div class="row g-3">
            <div class="col-md-6">
              <label class="form-label" for="user-username">Username</label>
              <input id="user-username" class="form-control form-control-sm" bind:value={form.username} disabled autocomplete="username" />
            </div>
            <div class="col-md-6">
              <label class="form-label" for="user-enabled-select">Status</label>
              <select id="user-enabled-select" class="form-select form-select-sm" bind:value={form.enabled}>
                <option value={true}>Enabled</option>
                <option value={false}>Disabled</option>
              </select>
            </div>
            <div class="col-md-6">
              <label class="form-label" for="user-firstName">First name</label>
              <input id="user-firstName" class="form-control form-control-sm" bind:value={form.firstName} autocomplete="given-name" />
            </div>
            <div class="col-md-6">
              <label class="form-label" for="user-lastName">Last name</label>
              <input id="user-lastName" class="form-control form-control-sm" bind:value={form.lastName} autocomplete="family-name" />
            </div>
            <div class="col-md-6">
              <label class="form-label" for="user-email">Email</label>
              <input id="user-email" type="email" class="form-control form-control-sm" bind:value={form.email} autocomplete="email" />
            </div>
            <div class="col-md-6">
              <label class="form-label" for="user-role">Platform role</label>
              <select id="user-role" class="form-select form-select-sm font-monospace" bind:value={form.platformRole}>
                <option value="user">user</option>
                <option value="administrator">administrator</option>
              </select>
            </div>
          </div>

          <div class="user-org-editor mt-4">
            <div class="d-flex flex-wrap align-items-center gap-2 mb-2">
              <div class="text-uppercase fw-semibold text-body text-opacity-75">Organizations</div>
              <span class="badge bg-theme text-theme-color">{memberships.length}</span>
              {#if orgLoading}
                <span class="spinner-border spinner-border-sm text-theme ms-auto"></span>
              {/if}
            </div>

            <div class="user-org-list">
              {#each memberships as membership (orgIdOf(membership))}
                <div class="user-org-row">
                  <div class="d-flex align-items-center gap-2 min-w-0">
                    <i class="bi bi-building text-theme"></i>
                    <div class="min-w-0">
                      <div class="text-body fw-semibold text-truncate">{membership.name}</div>
                      {#if membership.isNew}
                        <div class="small text-theme">Pending add</div>
                      {:else if membership.orgRole === 'owner'}
                        <div class="small text-theme">Owner role is read-only</div>
                      {/if}
                    </div>
                  </div>
                  <select class="form-select form-select-sm user-org-role" bind:value={membership.draftRole} disabled={membership.orgRole === 'owner'}>
                    <option value="member">member</option>
                    <option value="admin">admin</option>
                  </select>
                </div>
              {:else}
                <div class="text-body text-opacity-50 small py-2">No organization memberships found.</div>
              {/each}
            </div>

            <div class="row g-2 mt-2">
              <div class="col-md-7">
                <select class="form-select form-select-sm" bind:value={addOrgId} disabled={orgLoading || availableOrgs.length === 0}>
                  <option value="">Add organization...</option>
                  {#each availableOrgs as org (orgIdOf(org))}
                    <option value={orgIdOf(org)}>{org.name}</option>
                  {/each}
                </select>
              </div>
              <div class="col-md-3">
                <select class="form-select form-select-sm" bind:value={addOrgRole} disabled={!addOrgId}>
                  <option value="member">member</option>
                  <option value="admin">admin</option>
                </select>
              </div>
              <div class="col-md-2">
                <button type="button" class="btn btn-outline-theme btn-sm w-100" aria-label="Add to selected org" disabled={!addOrgId} onclick={addPendingOrg}>
                  <i class="bi bi-plus-lg"></i>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    {:else}
      <div class="user-form-grid">
        <div class="col-md-6">
          <label class="form-label" for="user-username">Username</label>
          <input id="user-username" class="form-control form-control-sm" bind:value={form.username} autocomplete="username" />
        </div>
        <div class="col-md-6">
          <label class="form-label" for="user-email">Email</label>
          <input id="user-email" type="email" class="form-control form-control-sm" bind:value={form.email} autocomplete="email" />
        </div>
        <div class="col-md-6">
          <label class="form-label" for="user-firstName">First name</label>
          <input id="user-firstName" class="form-control form-control-sm" bind:value={form.firstName} autocomplete="given-name" />
        </div>
        <div class="col-md-6">
          <label class="form-label" for="user-lastName">Last name</label>
          <input id="user-lastName" class="form-control form-control-sm" bind:value={form.lastName} autocomplete="family-name" />
        </div>
        <div class="col-md-6">
          <label class="form-label" for="user-password">Password</label>
          <input id="user-password" type="password" class="form-control form-control-sm" bind:value={form.password} autocomplete="new-password" />
        </div>
        <div class="col-md-6 d-flex align-items-end">
          <div class="form-check form-switch">
            <input id="user-enabled" type="checkbox" class="form-check-input" bind:checked={form.enabled} />
            <label class="form-check-label" for="user-enabled">Enabled</label>
          </div>
        </div>
      </div>
    {/if}
  {/snippet}
  {#snippet footer()}
    <button type="button" class="btn btn-outline-secondary btn-sm text-uppercase" onclick={() => { lightboxOpen = false; resetAvatarPreview(); formOpen = false }} disabled={formBusy}>
      Cancel
    </button>
    <button type="button" class="btn btn-outline-theme btn-sm text-uppercase" onclick={saveForm} disabled={formBusy}>
      {#if formBusy}<span class="spinner-border spinner-border-sm me-1"></span>{/if}
      {formMode === 'create' ? 'Create' : 'Save'}
    </button>
  {/snippet}
</Modal>

<!-- Delete confirm -->
<ConfirmDialog
  bind:open={deleteOpen}
  title="Remove user from organization?"
  message={deleteTarget ? `User "${deleteTarget.username}" will lose org membership. This is reversible (re-invite).` : ''}
  confirmLabel="Remove"
  cancelLabel="Cancel"
  danger
  busy={deleteBusy}
  onConfirm={confirmDelete}
/>

<!-- Avatar lightbox (full image preview) -->
<Modal bind:open={lightboxOpen} title="Profile image preview" size="xl">
  {#snippet body()}
    {#if avatarPreview}
      <div class="d-flex justify-content-center" style="background: rgba(0,0,0,.35); border-radius: .25rem;">
        <img src={avatarPreview} alt="Avatar full preview" style="max-width: 100%; max-height: 70vh; object-fit: contain; display: block;" />
      </div>
    {:else}
      <div class="text-body text-opacity-50 text-center py-5">No image selected.</div>
    {/if}
  {/snippet}
  {#snippet footer()}
    <button type="button" class="btn btn-outline-secondary btn-sm text-uppercase" onclick={() => (lightboxOpen = false)}>
      Close
    </button>
  {/snippet}
</Modal>

<style>
  .users-page {
    font-size: 0.8125rem;
  }

  .users-page :global(.page-header) {
    font-size: 1.25rem;
  }

  .users-page :global(.page-header small) {
    font-size: 0.6875rem;
  }

  .users-page :global(.display-6) {
    font-size: 1.75rem;
  }

  .users-page :global(.table) {
    font-size: 0.78125rem;
  }

  .users-page :global(.table thead th) {
    font-size: 0.65625rem;
  }

  .users-page :global(.btn),
  .users-page :global(.form-control),
  .users-page :global(.form-select),
  .users-page :global(.input-group-text) {
    font-size: 0.8125rem;
  }

  .user-row-actions :global(.btn) {
    width: 2rem;
    padding-inline: 0;
  }

  .user-form-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.875rem 1rem;
  }

  .user-form-grid :global(.col-md-6) {
    width: auto;
  }

  .user-form-grid :global(.form-label) {
    margin-bottom: 0.35rem;
    font-size: 0.75rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .user-edit-shell {
    display: grid;
    grid-template-columns: minmax(13rem, 16rem) minmax(0, 1fr);
    gap: 1.5rem;
  }

  .user-avatar-panel {
    border-right: 1px solid rgba(var(--bs-theme-rgb), .28);
    padding-right: 1.25rem;
    text-align: center;
  }

  .user-avatar-thumb-wrap {
    position: relative;
    width: 7rem;          /* ~112px compact */
    height: 7rem;
    margin-inline: auto;
  }

  .user-avatar-drop {
    width: 100%;
    height: 100%;
    border-radius: .35rem;
    border: 2px dashed rgba(var(--bs-theme-rgb), .42);
    background: rgba(var(--bs-body-bg-rgb), .18);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: .25rem;
    cursor: pointer;
    overflow: hidden;
    margin: 0;
  }

  .user-avatar-drop img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .user-avatar-drop i {
    font-size: 1.5rem;
    opacity: .64;
  }

  .user-avatar-drop span {
    font-weight: 700;
    font-size: .7rem;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .user-avatar-zoom {
    position: absolute;
    bottom: .35rem;
    right: .35rem;
    width: 1.85rem;
    height: 1.85rem;
    padding: 0;
    border-radius: 50%;
    border: 1px solid rgba(var(--bs-theme-rgb), .8);
    background: rgba(0, 0, 0, .55);
    color: var(--bs-theme);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: background .15s ease, transform .15s ease;
  }

  .user-avatar-zoom:hover,
  .user-avatar-zoom:focus-visible {
    background: var(--bs-theme);
    color: var(--bs-theme-color);
    transform: scale(1.06);
    outline: none;
  }

  .user-avatar-zoom i {
    font-size: 1rem;
  }

  .user-edit-fields :global(.form-label) {
    margin-bottom: 0.35rem;
    font-size: 0.75rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .user-org-editor {
    border-top: 1px solid rgba(var(--bs-theme-rgb), .24);
    padding-top: 1rem;
  }

  .user-org-list {
    display: grid;
    gap: .5rem;
    max-height: 13rem;
    overflow-y: auto;
    padding-right: .25rem;
  }

  .user-org-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 9rem;
    align-items: center;
    gap: .75rem;
    border: 1px solid rgba(var(--bs-theme-rgb), .26);
    background: rgba(var(--bs-body-bg-rgb), .18);
    padding: .625rem .75rem;
  }

  .user-org-role {
    width: 9rem;
  }

  @media (max-width: 767.98px) {
    .user-form-grid {
      grid-template-columns: 1fr;
    }

    .user-edit-shell {
      grid-template-columns: 1fr;
    }

    .user-avatar-panel {
      border-right: 0;
      border-bottom: 1px solid rgba(var(--bs-theme-rgb), .28);
      padding-right: 0;
      padding-bottom: 1rem;
    }

    .user-org-row {
      grid-template-columns: 1fr;
    }

    .user-org-role {
      width: 100%;
    }
  }
</style>
