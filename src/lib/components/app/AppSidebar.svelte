<!-- src/lib/components/app/AppSidebar.svelte
     Mirrors cyber_admin v2.0 / template_html/src/html/partials/app-sidebar.html
     — menu-profile block at top, single NAVIGATION header with HUD decoration,
     bottom status widget + DOCUMENTATION button. -->
<script lang="ts">
  import { m } from '$lib/i18n/messages'
  import { appOptions } from '$lib/stores/appOptions'
  import { appSidebarMenus } from '$lib/stores/appSidebarMenus'
  import { auth } from '$lib/stores/auth'
  import {
    activeWorkspace,
    setActiveWorkspace,
    setWorkspaceList,
    workspaceList
  } from '$lib/stores/activeWorkspace'
  import { effectiveAccess } from '$lib/stores/effectiveAccess'
  import { listWorkspaces } from '$lib/api/workspace'
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

  onMount(async () => {
    document.body.classList.add('app-init')
    if ($workspaceList.length > 0) return
    try {
      const workspaces = await listWorkspaces()
      setWorkspaceList(workspaces)
    } catch (err) {
      console.warn('[AppSidebar] failed to load organizations', err)
    }
  })

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
    return children?.some((c) => (c.url ? withBase(c.url) === pathname : false)) ?? false
  }

  function meetsCapability(menu: SidebarMenuLink | SidebarChild) {
    if (!menu.requireCapability) return true
    switch (menu.requireCapability) {
      case 'organization.manage':
        return $effectiveAccess.access.orgCapabilities.canManageOrganization
      default:
        return true
    }
  }

  function canSeeMenu(menu: SidebarMenuLink | SidebarChild) {
    const menuIdOk = !menu.menuId || $effectiveAccess.access.visibleMenuIds.includes(menu.menuId)
    return menuIdOk && meetsCapability(menu)
  }

  function visibleChildren(children?: SidebarChild[]) {
    return children?.filter((child) => canSeeMenu(child)) ?? []
  }

  function isVisibleMenu(menu: SidebarMenu) {
    if (menu.kind !== 'link') return true
    const children = visibleChildren(menu.children)
    if (menu.children?.length) return canSeeMenu(menu) || children.length > 0
    return canSeeMenu(menu)
  }

  const visibleSidebarMenus = $derived(
    !$effectiveAccess.isLoaded
      ? $appSidebarMenus
      : $appSidebarMenus.filter(isVisibleMenu)
  )
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
    if (!isLinkMenu(menu) || !menu.children?.length) return
    openedMenuId = openedMenuId === menu.id ? null : menu.id
    await tick()
    window.dispatchEvent(new Event('resize'))
  }

  function onParentClick(e: MouseEvent, menu: SidebarMenu) {
    if (isLinkMenu(menu) && menu.children?.length) {
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
            class:has-sub={!!menu.children?.length}
            class:expand={openedMenuId === menu.id}
            class:active={(menu.url ? withBase(menu.url) === page.url.pathname : false) ||
              hasActiveChild(menu.children)}
          >
            <a
              class="menu-link"
              href={menu.url ? withBase(menu.url) : '#'}
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
              {#if menu.children?.length}
                <span class="menu-caret"><b class="caret"></b></span>
              {/if}
            </a>

            {#if menu.children?.length}
              <div class="menu-submenu">
                {#each ($effectiveAccess.isLoaded ? visibleChildren(menu.children) : (menu.children ?? [])) as child (child.id)}
                  <div
                    class="menu-item"
                    class:active={child.url ? withBase(child.url) === page.url.pathname : false}
                  >
                    <a
                      class="menu-link"
                      href={withBase(child.url)}
                      onclick={hideMobileSidebar}
                    >
                      <span class="menu-text">{t(child.textKey)}</span>
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
            class:has-sub={!!menu.children?.length}
            class:expand={openedMenuId === menu.id}
            class:active={(menu.url ? withBase(menu.url) === page.url.pathname : false) ||
              hasActiveChild(menu.children)}
          >
            <a
              class="menu-link"
              href={menu.url ? withBase(menu.url) : '#'}
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
              {#if menu.children?.length}
                <span class="menu-caret"><b class="caret"></b></span>
              {/if}
            </a>

            {#if menu.children?.length}
              <div class="menu-submenu">
                {#each ($effectiveAccess.isLoaded ? visibleChildren(menu.children) : (menu.children ?? [])) as child (child.id)}
                  <div
                    class="menu-item"
                    class:active={child.url ? withBase(child.url) === page.url.pathname : false}
                  >
                    <a
                      class="menu-link"
                      href={withBase(child.url)}
                      onclick={hideMobileSidebar}
                    >
                      <span class="menu-text">{t(child.textKey)}</span>
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
          <div class="text-body text-opacity-75 small">REGION</div>
          <div class="text-body fw-bold">istio.k-lynx</div>
          <div class="text-body text-opacity-50 fs-8px">cluster</div>
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
