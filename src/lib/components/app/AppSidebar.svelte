<!-- src/lib/components/app/AppSidebar.svelte
     Mirrors cyber_admin v2.0 / template_html/src/html/partials/app-sidebar.html
     — menu-profile block at top, single NAVIGATION header with HUD decoration,
     bottom status widget + DOCUMENTATION button. -->
<script lang="ts">
  import { env } from '$env/dynamic/public'
  import { m } from '$lib/i18n/messages'
  import { appOptions } from '$lib/stores/appOptions'
  import { appSidebarMenus } from '$lib/stores/appSidebarMenus'
  import { auth } from '$lib/stores/auth'
  import {
    activeWorkspace,
    activeWorkspaceId,
    setActiveWorkspace,
    setWorkspaceList,
    workspaceList
  } from '$lib/stores/activeWorkspace'
  import { effectiveAccess } from '$lib/stores/effectiveAccess'
  import { listSystemEdgeDevices, type SystemEdgeDevice } from '$lib/api/devices'
  import { listWorkspaces } from '$lib/api/workspace'
  import { getBackendVersion } from '$lib/api/systemVersion'
  import { evaluatePageAccess, menuPath } from '$lib/utils/pageAccess'
  import { itemsFrom } from '$lib/utils/apiShape'
  import pkg from '../../../../package.json'

  import { page } from '$app/state'
  import { afterNavigate } from '$app/navigation'
  import { resolve } from '$app/paths'
  import { onMount, tick } from 'svelte'

  import type {
    SidebarChild,
    SidebarMenu,
    SidebarMenuLink
  } from '$lib/types/navigation'

  let beVersion = $state('—')

  onMount(async () => {
    document.body.classList.add('app-init')
    void loadBackendVersion()
    if ($workspaceList.length > 0) return
    try {
      const workspaces = await listWorkspaces()
      setWorkspaceList(workspaces)
    } catch (err) {
      console.warn('[AppSidebar] failed to load organizations', err)
    }
  })

  async function loadBackendVersion() {
    const { data, error } = await getBackendVersion()
    if (error || !data?.details) return
    beVersion = data.details.version || '—'
  }

  function isLinkMenu(menu: SidebarMenu): menu is SidebarMenuLink {
    return menu.kind === 'link'
  }

  function mobileToggler() {
    $appOptions.appSidebarMobileToggled = !$appOptions.appSidebarMobileToggled
  }
  function hideMobileSidebar() {
    $appOptions.appSidebarMobileToggled = false
  }
  afterNavigate(() => hideMobileSidebar())

  function hasActiveChild(children?: SidebarChild[]) {
    const pathname = page.url.pathname
    return children?.some((c) => (c.url ? menuHref(c.url) === pathname : false)) ?? false
  }

  function accessInput() {
    return {
      access: $effectiveAccess.access,
      accessLoaded: $effectiveAccess.isLoaded,
      hasActiveOrg: Boolean($activeWorkspaceId),
      user: $auth.user
    }
  }

  function canSeeMenu(menu: SidebarMenuLink | SidebarChild) {
    if (menu.url) {
      return evaluatePageAccess(menuPath(menu.url), accessInput()).allowed
    }

    if (menu.menuId) {
      return $effectiveAccess.isLoaded && $effectiveAccess.access.visibleMenuIds.includes(menu.menuId)
    }

    return false
  }

  function visibleChildren(children?: SidebarChild[]) {
    return children?.filter((child) => canSeeMenu(child)) ?? []
  }

  function canLoadEdgeDeviceMenu() {
    return (
      Boolean($activeWorkspaceId) &&
      $effectiveAccess.isLoaded &&
      $effectiveAccess.access.visibleMenuIds.includes('systemDevicesEdge')
    )
  }

  let edgeMenuDevices = $state<SystemEdgeDevice[]>([])
  let edgeMenuLoadKey = $state('')
  let edgeMenuSeq = 0

  async function loadEdgeDeviceMenu(orgId: string) {
    const seq = ++edgeMenuSeq
    const { data, error } = await listSystemEdgeDevices({ perPage: 100 })
    if (seq !== edgeMenuSeq || orgId !== $activeWorkspaceId) return

    if (error) {
      console.warn('[AppSidebar] failed to load edge device menu', error.message)
      edgeMenuDevices = []
      return
    }

    edgeMenuDevices = itemsFrom<SystemEdgeDevice>(data?.details).filter(
      (device) => Boolean(device.id && device.name && isExternalUrl(device.url))
    )
  }

  $effect(() => {
    const orgId = $activeWorkspaceId
    const key = orgId && canLoadEdgeDeviceMenu() ? orgId : ''

    if (!key) {
      edgeMenuLoadKey = ''
      edgeMenuDevices = []
      return
    }

    if (edgeMenuLoadKey === key) return
    edgeMenuLoadKey = key
    void loadEdgeDeviceMenu(key)
  })

  const edgeDeviceChildren = $derived.by<SidebarChild[]>(() => {
    if (!canLoadEdgeDeviceMenu()) return []

    return edgeMenuDevices.map((device) => ({
      id: `systemDevicesEdge:${device.id}`,
      textKey: 'navSystemDevicesEdge',
      text: device.type ? `${device.name} · ${device.type.toUpperCase()}` : device.name,
      url: device.url,
      external: true
    }))
  })

  function renderedChildren(menu: SidebarMenuLink) {
    const children = visibleChildren(menu.children)
    if (menu.id === 'systemDevices' && edgeDeviceChildren.length > 0) {
      return [...children, ...edgeDeviceChildren]
    }
    return children
  }

  function hasRenderedChildren(menu: SidebarMenuLink) {
    return renderedChildren(menu).length > 0
  }

  function childLabel(child: SidebarChild) {
    return child.text ?? t(child.textKey)
  }

  function isExternalUrl(url?: string) {
    return /^https?:\/\//i.test(url ?? '')
  }

  function menuHref(url?: string) {
    if (!url) return '#'
    if (isExternalUrl(url)) return url
    return withBase(url)
  }

  function linkTarget(child: SidebarChild) {
    return child.external || isExternalUrl(child.url) ? '_blank' : undefined
  }

  function linkRel(child: SidebarChild) {
    return child.external || isExternalUrl(child.url) ? 'noreferrer' : undefined
  }

  const debugMenuEnabled = env.PUBLIC_DEBUG_MENU_ENABLED === 'true'

  function isVisibleMenu(menu: SidebarMenu) {
    if (menu.kind !== 'link') return true
    if (menu.debug && !debugMenuEnabled) return false
    const children = renderedChildren(menu)
    if (menu.children?.length) return children.length > 0 || canSeeMenu(menu)
    return canSeeMenu(menu)
  }

  const visibleSidebarMenus = $derived($appSidebarMenus.filter(isVisibleMenu))
  const navigationMenus = $derived.by(() => {
    const userPortalIndex = visibleSidebarMenus.findIndex((menu) => menu.kind === 'header' && menu.id === 'userPortal')
    return userPortalIndex >= 0 ? visibleSidebarMenus.slice(0, userPortalIndex) : visibleSidebarMenus
  })
  const userPortalMenus = $derived.by(() => {
    const userPortalIndex = visibleSidebarMenus.findIndex((menu) => menu.kind === 'header' && menu.id === 'userPortal')
    return userPortalIndex >= 0 ? visibleSidebarMenus.slice(userPortalIndex) : []
  })

  const _resolve = resolve as (path: string) => string
  function withBase(url?: string) {
    if (!url) return '#'
    return _resolve(`/${url}`)
  }

  function t(key: string | number | symbol): string {
    if (typeof key !== 'string') return String(key)
    const fn = (m as Record<string, unknown>)[key]
    return typeof fn === 'function' ? (fn as () => string)() : key
  }

  // Expand / collapse for has-sub menus
  let openedMenuId = $state<string | null>(null)

  async function toggleMenu(menu: SidebarMenu) {
    if (!isLinkMenu(menu) || !hasRenderedChildren(menu)) return
    openedMenuId = openedMenuId === menu.id ? null : menu.id
    await tick()
    window.dispatchEvent(new Event('resize'))
  }

  function onParentClick(e: MouseEvent, menu: SidebarMenu) {
    if (isLinkMenu(menu) && hasRenderedChildren(menu)) {
      e.preventDefault()
      toggleMenu(menu)
      return
    }
    hideMobileSidebar()
  }

  // auto-open the parent that owns the active child
  $effect(() => {
    const activeParent = $appSidebarMenus.find(
      (x): x is SidebarMenuLink =>
        x.kind === 'link' && !!x.children?.length && hasActiveChild(x.children)
    )
    if (activeParent?.id) openedMenuId = activeParent.id
  })

  // Profile derived from auth store
  const profileName = $derived(
    $auth.user?.fullName ||
      $auth.user?.username ||
      $auth.user?.email ||
      'OPERATOR'
  )
  const profileRole = $derived(
    ($auth.user?.role || 'member').toUpperCase()
  )

  async function chooseWorkspace(id: string) {
    await setActiveWorkspace(id)
  }
</script>

<!-- BEGIN #appSidebar -->
<div id="sidebar" class="app-sidebar">
  <div class="app-sidebar-content">
    <!-- BEGIN organization selector -->
    <div class="menu menu-profile-shell">
      <div class="menu-org-selector dropdown">
        <button
          type="button"
          class="menu-org-selector-btn"
          data-bs-toggle="dropdown"
          data-bs-display="static"
          aria-expanded="false"
          title={$activeWorkspace?.name ?? 'Select organization'}
        >
          <span class="menu-org-selector-icon">
            <i class="bi bi-building"></i>
          </span>
          <span class="menu-org-selector-copy">
            <span class="menu-org-selector-text">{$activeWorkspace?.name ?? 'Select organization'}</span>
            <small>{profileName} · {profileRole}</small>
          </span>
          <b class="caret"></b>
        </button>
        <div class="dropdown-menu dropdown-menu-end me-2">
          {#if $workspaceList.length > 0}
            {#each $workspaceList as workspace (workspace.id)}
              <button
                type="button"
                class="dropdown-item d-flex align-items-center"
                class:active={$activeWorkspace?.id === workspace.id}
                onclick={() => chooseWorkspace(workspace.id)}
              >
                <i class="bi bi-building me-2"></i>
                <span class="text-truncate">{workspace.name}</span>
                {#if $activeWorkspace?.id === workspace.id}
                  <i class="bi bi-check-lg ms-auto"></i>
                {/if}
              </button>
            {/each}
          {:else}
            <a class="dropdown-item d-flex align-items-center" href={withBase('systemUsers/organizations')}>
              <i class="bi bi-plus-lg me-2"></i> Add organization
            </a>
          {/if}
          <div class="dropdown-divider"></div>
          <a class="dropdown-item d-flex align-items-center" href={withBase('systemUsers/organizations')}>
            <i class="bi bi-gear me-2"></i> Manage organizations
          </a>
        </div>
      </div>
    </div>
    <!-- END organization selector -->

    <!-- BEGIN navigation menu -->
    <div class="menu sidebar-menu-section sidebar-menu-navigation">
      {#each navigationMenus as menu (menu.id)}
        {#if menu.kind === 'header'}
          <div class="menu-header">
            <div class="menu-title">{t(menu.textKey)}</div>
            <div class="flex-1 pt-3px ps-1">
              <div class="h-1px bg-white bg-opacity-25"></div>
              <div class="py-3px d-flex">
                <div class="hud-line flex-1 h-4px opacity-5"></div>
                <div class="bg-white bg-opacity-25 h-5px w-10px ms-3px"></div>
                <div class="bg-white bg-opacity-50 h-5px w-10px ms-3px"></div>
                <div class="bg-white bg-opacity-75 h-5px w-10px ms-3px"></div>
              </div>
            </div>
          </div>
          <div class="h-1px bg-white bg-opacity-25 w-100 mb-2"></div>
        {:else if menu.kind === 'divider'}
          <div class="menu-divider"></div>
        {:else if isLinkMenu(menu)}
          <div
            class="menu-item"
            class:has-sub={hasRenderedChildren(menu)}
            class:expand={openedMenuId === menu.id}
            class:active={(menu.url ? withBase(menu.url) === page.url.pathname : false) ||
              hasActiveChild(renderedChildren(menu))}
          >
            <a
              class="menu-link"
              href={menuHref(menu.url)}
              onclick={(e) => onParentClick(e, menu)}
            >
              {#if menu.icon}
                <span class="menu-icon">
                  <i class={menu.icon}></i>
                  {#if menu.highlight}
                    <span class="menu-dot"></span>
                  {/if}
                </span>
              {/if}
              <span class="menu-text">{t(menu.textKey)}</span>
              {#if hasRenderedChildren(menu)}
                <span class="menu-caret"><b class="caret"></b></span>
              {/if}
            </a>

            {#if hasRenderedChildren(menu)}
              <div class="menu-submenu">
                {#each renderedChildren(menu) as child (child.id)}
                  <div
                    class="menu-item"
                    class:active={child.url ? menuHref(child.url) === page.url.pathname : false}
                  >
                    <a
                      class="menu-link"
                      href={menuHref(child.url)}
                      target={linkTarget(child)}
                      rel={linkRel(child)}
                      onclick={hideMobileSidebar}
                    >
                      <span class="menu-text">{childLabel(child)}</span>
                    </a>
                  </div>
                {/each}
              </div>
            {/if}
          </div>
        {/if}
      {/each}
    </div>
    <!-- END navigation menu -->

    <!-- BEGIN user portal menu -->
    <div class="menu sidebar-menu-section sidebar-menu-user-portal">
      {#each userPortalMenus as menu (menu.id)}
        {#if menu.kind === 'header'}
          <div class="menu-header">
            <div class="menu-title">{t(menu.textKey)}</div>
            <div class="flex-1 pt-3px ps-1">
              <div class="h-1px bg-white bg-opacity-25"></div>
              <div class="py-3px d-flex">
                <div class="hud-line flex-1 h-4px opacity-5"></div>
                <div class="bg-white bg-opacity-25 h-5px w-10px ms-3px"></div>
                <div class="bg-white bg-opacity-50 h-5px w-10px ms-3px"></div>
                <div class="bg-white bg-opacity-75 h-5px w-10px ms-3px"></div>
              </div>
            </div>
          </div>
          <div class="h-1px bg-white bg-opacity-25 w-100 mb-2"></div>
        {:else if menu.kind === 'divider'}
          <div class="menu-divider"></div>
        {:else if isLinkMenu(menu)}
          <div
            class="menu-item"
            class:has-sub={hasRenderedChildren(menu)}
            class:expand={openedMenuId === menu.id}
            class:active={(menu.url ? withBase(menu.url) === page.url.pathname : false) ||
              hasActiveChild(renderedChildren(menu))}
          >
            <a
              class="menu-link"
              href={menuHref(menu.url)}
              onclick={(e) => onParentClick(e, menu)}
            >
              {#if menu.icon}
                <span class="menu-icon">
                  <i class={menu.icon}></i>
                  {#if menu.highlight}
                    <span class="menu-dot"></span>
                  {/if}
                </span>
              {/if}
              <span class="menu-text">{t(menu.textKey)}</span>
              {#if hasRenderedChildren(menu)}
                <span class="menu-caret"><b class="caret"></b></span>
              {/if}
            </a>

            {#if hasRenderedChildren(menu)}
              <div class="menu-submenu">
                {#each renderedChildren(menu) as child (child.id)}
                  <div
                    class="menu-item"
                    class:active={child.url ? menuHref(child.url) === page.url.pathname : false}
                  >
                    <a
                      class="menu-link"
                      href={menuHref(child.url)}
                      target={linkTarget(child)}
                      rel={linkRel(child)}
                      onclick={hideMobileSidebar}
                    >
                      <span class="menu-text">{childLabel(child)}</span>
                    </a>
                  </div>
                {/each}
              </div>
            {/if}
          </div>
        {/if}
      {/each}
    </div>
    <!-- END user portal menu -->

    <!-- BEGIN sidebar bottom widget -->
    <div class="mt-auto">
      <div class="row row-gap-3 col-gap-2 mb-3 pt-3 fw-semibold">
        <div class="col-6">
          <div class="text-body text-opacity-75 small">SERVER STATUS</div>
          <div class="text-body fw-bold">online</div>
          <div class="text-body text-opacity-50 fs-8px">UPTIME: live</div>
        </div>
        <div class="col-6">
          <div class="text-body text-opacity-75 small">ACTIVE USER</div>
          <div class="text-body fw-bold">{profileName}</div>
          <div class="text-body text-opacity-50 fs-8px">{profileRole}</div>
        </div>
        <div class="col-6">
          <div class="text-body text-opacity-75 small">PLATFORM</div>
          <div class="text-body fw-bold">Phibek, พิเภท</div>
          <div class="text-body text-opacity-50 fs-8px">v{pkg.version}</div>
        </div>
        <div class="col-6">
          <div class="text-body text-opacity-75 small">BACKEND</div>
          <div class="text-body fw-bold">API</div>
          <div class="text-body text-opacity-50 fs-8px">v{beVersion}</div>
        </div>
      </div>
    </div>
    <!-- END sidebar bottom widget -->
  </div>
</div>
<!-- END #appSidebar -->

<button
  class="app-sidebar-mobile-backdrop"
  aria-label="button"
  onclick={mobileToggler}
></button>
