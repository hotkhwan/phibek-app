<!-- src/lib/components/app/AppHeader.svelte -->
<script lang="ts">
  import { appOptions } from '$lib/stores/appOptions'
  import { resolve } from '$app/paths'
  import { asset } from '$lib/utils/asset'
  import { page } from '$app/state'
  import { goto } from '$app/navigation'
  import { m } from '$lib/i18n/messages'
  import { listWorkspaces } from '$lib/api/workspace'
  import { onMount, tick } from 'svelte'

  // Prefer user from server load (layout/+layout.server.ts) -> page.data.user
  const userEmail = $derived(
    page?.data?.user?.email ?? page?.data?.user?.name ?? page?.data?.user?.sub ?? 'user@local'
  )
  const userLabel = $derived(userEmail.split('@')[0] || userEmail)
  const userImg = $derived(
    page?.data?.user?.img ?? asset('/img/user/profile.jpg')
  )

  let isLoggingOut = $state(false)
  let logoutError = $state('')
  let searchInput: HTMLInputElement | undefined

  onMount(async () => {
    try {
      const { setWorkspaceList } = await import('$lib/stores/activeWorkspace')
      const workspaces = await Promise.race([
        listWorkspaces(),
        new Promise<[]>((_, reject) =>
          setTimeout(() => reject(new Error('Timeout')), 10000)
        )
      ])
      setWorkspaceList(workspaces)
    } catch (e) {
      console.error('Failed to load workspaces:', e)
    }
  })

  let notificationData = [
    {
      icon: 'bi bi-bag text-theme',
      titleKey: 'headerNotificationNewOrder',
      timeKey: 'headerNotificationJustNow'
    },
    {
      icon: 'bi bi-person-circle text-theme',
      titleKey: 'headerNotificationNewAccounts',
      timeKey: 'headerNotificationMinutesAgo'
    },
    {
      icon: 'bi bi-gear text-theme',
      titleKey: 'headerNotificationSetupCompleted',
      timeKey: 'headerNotificationMinutesAgo'
    },
    {
      icon: 'bi bi-grid text-theme',
      titleKey: 'headerNotificationWidgetInstall',
      timeKey: 'headerNotificationMinutesAgo'
    },
    {
      icon: 'bi bi-credit-card text-theme',
      titleKey: 'headerNotificationPaymentEnabled',
      timeKey: 'headerNotificationMinutesAgo'
    }
  ]

  function desktopToggler() {
    $appOptions.appSidebarToggled =
      $appOptions.appSidebarCollapsed == false ? false : true
    $appOptions.appSidebarCollapsed =
      $appOptions.appSidebarCollapsed == false ? true : false
  }

  function mobileToggler() {
    $appOptions.appSidebarMobileToggled = !$appOptions.appSidebarMobileToggled
  }

  async function openHeaderSearch() {
    $appOptions.appHeaderSearchToggled = true
    await tick()
    searchInput?.focus()
  }

  function closeHeaderSearch() {
    $appOptions.appHeaderSearchToggled = false
  }

  function handleSearchSubmit(event: Event) {
    event.preventDefault()
  }

  function handleSearchKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      closeHeaderSearch()
    }
  }

  async function handleLogout(event?: Event) {
    event?.preventDefault?.()
    if (isLoggingOut) return

    isLoggingOut = true
    logoutError = ''

    try {
      // BFF endpoint should clear HttpOnly cookies (session_token/session_refresh)
      const res = await fetch(resolve('/api/auth/logout'), {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ reason: 'user' })
      })

      // If server returns non-2xx, still hard-navigate away after best effort
      if (!res.ok) {
        logoutError = `${m.headerLogoutFailed()} (${res.status})`
      }

      // Redirect to public landing/login
      await goto(resolve('/'), { replaceState: true })
    } catch (err) {
      logoutError = m.headerLogoutFailed()
      await goto(resolve('/'), { replaceState: true })
    } finally {
      isLoggingOut = false
    }
  }
</script>

<!-- BEGIN #header -->
<div id="header" class="app-header">
  <!-- BEGIN desktop-toggler -->
  <div class="desktop-toggler">
    <button
      type="button"
      class="menu-toggler"
      aria-label={m.headerAriaDesktopToggler()}
      onclick={desktopToggler}
    >
      <span class="bar"></span>
      <span class="bar"></span>
      <span class="bar"></span>
    </button>
  </div>
  <!-- BEGIN desktop-toggler -->

  <!-- BEGIN mobile-toggler -->
  <div class="mobile-toggler">
    <button
      type="button"
      class="menu-toggler"
      aria-label={m.headerAriaMobileToggler()}
      onclick={mobileToggler}
    >
      <span class="bar"></span>
      <span class="bar"></span>
      <span class="bar"></span>
    </button>
  </div>
  <!-- END mobile-toggler -->

  <!-- BEGIN brand -->
  <div class="brand">
    <a
      href={resolve('/')}
      aria-label={m.headerAriaBrandLink()}
      class="brand-logo phibek-brand"
    >
      <span class="brand-img phibek-brand-img">
        <img
          src={asset('/img/logo/phibek-mark.webp')}
          alt="PHIBEK"
          class="phibek-brand-mark"
          onerror={(e) => (e.currentTarget as HTMLElement).style.display = 'none'}
        />
        <span class="brand-img-text text-theme phibek-brand-fallback">{m.headerBrand()}</span>
      </span>
      <span class="brand-text phibek-brand-text">
        <span class="phibek-brand-name">{m.headerBrandText()}</span>
        <small class="phibek-brand-subtitle">{m.headerBrandSubtitle()}</small>
      </span>
    </a>
  </div>
  <!-- END brand -->

  <!-- BEGIN menu -->
  <div class="menu">
    <div class="menu-item">
      <button
        type="button"
        aria-label={m.headerAriaSearch()}
        class="menu-link header-icon-button"
        onclick={openHeaderSearch}
      >
        <div class="menu-icon"><i class="bi bi-search nav-icon"></i></div>
      </button>
    </div>

    <div class="menu-item dropdown dropdown-mobile-full">
      <a
        href="#/"
        aria-label={m.headerAriaNotifications()}
        data-bs-toggle="dropdown"
        data-bs-display="static"
        class="menu-link"
      >
        <div class="menu-icon"><i class="bi bi-bell nav-icon"></i></div>
        <div class="menu-badge bg-theme"></div>
      </a>

      <div class="dropdown-menu dropdown-menu-end mt-1 w-300px fs-11px pt-1">
        <h6 class="dropdown-header fs-10px mb-1">
          {m.headerNotificationsTitle()}
        </h6>
        <div class="dropdown-divider mt-1"></div>

        {#if notificationData && notificationData.length > 0}
          {#each notificationData as n}
            <a
              href="#/"
              aria-label={m.headerAriaNotificationItem()}
              class="d-flex align-items-center py-10px dropdown-item text-wrap fw-semibold"
            >
              <div class="fs-20px">
                <i class={n.icon}></i>
              </div>
              <div class="flex-1 flex-wrap ps-3">
                <div class="mb-1 text-inverse">{(m as any)[n.titleKey]()}</div>
                <div class="small text-inverse text-opacity-50">
                  {(m as any)[n.timeKey]()}
                </div>
              </div>
              <div class="ps-2 fs-16px">
                <i class="bi bi-chevron-right"></i>
              </div>
            </a>
          {/each}
        {:else}
          <div class="px-3 pb-3 pt-2">{m.headerNoRecordFound()}</div>
        {/if}

        <hr class="my-0" />
        <div class="py-10px mb-n2 text-center">
          <a
            href="#/"
            aria-label={m.headerAriaSeeAll()}
            class="text-decoration-none fw-bold"
          >
            {m.headerSeeAll()}
          </a>
        </div>
      </div>
    </div>

    <div class="menu-item dropdown dropdown-mobile-full">
      <a
        href="#/"
        aria-label={m.headerAriaUserMenu()}
        data-bs-toggle="dropdown"
        data-bs-display="static"
        class="menu-link"
      >
        <div class="menu-img online">
          {#if userImg}
            <img src={userImg} alt={m.headerProfileImageAlt()} height="60" />
          {:else}
            <div
              class="d-flex align-items-center justify-content-center w-100 h-100 bg-inverse bg-opacity-25 text-inverse text-opacity-50 rounded-circle overflow-hidden"
            >
              <i class="bi bi-person-fill fs-32px mb-n3"></i>
            </div>
          {/if}
        </div>
        <div class="menu-text header-user-email d-sm-block d-none" title={userEmail}>{userLabel}</div>
      </a>

      <div class="dropdown-menu dropdown-menu-end me-lg-3 fs-11px mt-1">
        <a
          aria-label={m.headerAriaProfile()}
          class="dropdown-item d-flex align-items-center"
          href="/comingsoon"
        >
          {m.headerProfile()}
          <i class="bi bi-person-circle ms-auto text-theme fs-16px my-n1"></i>
        </a>

        <a
          aria-label={m.headerAriaSettings()}
          class="dropdown-item d-flex align-items-center"
          href="/comingsoon"
        >
          {m.headerSettings()}
          <i class="bi bi-gear ms-auto text-theme fs-16px my-n1"></i>
        </a>

        <div class="dropdown-divider"></div>

        <a
          aria-label={m.headerAriaLogout()}
          class="dropdown-item d-flex align-items-center"
          href={resolve('/')}
          onclick={handleLogout}
        >
          {#if isLoggingOut}
            {m.headerLoggingOut()}
          {:else}
            {m.headerLogout()}
          {/if}
          <i class="bi bi-toggle-off ms-auto text-theme fs-16px my-n1"></i>
        </a>

        {#if logoutError}
          <div class="px-3 pt-2 pb-1 text-danger small">{logoutError}</div>
        {/if}
      </div>
    </div>
  </div>
  <!-- END menu -->

  <!-- BEGIN menu-search -->
  <form
    class="menu-search-mobile"
    method="POST"
    name="header_search_form"
    onsubmit={handleSearchSubmit}
  >
    <div class="menu-search-container">
      <div class="menu-search-icon"><i class="bi bi-search"></i></div>
      <div class="menu-search-input">
        <input
          bind:this={searchInput}
          type="text"
          class="form-control form-control-lg"
          placeholder={m.headerSearchPlaceholder()}
          onkeydown={handleSearchKeydown}
        />
      </div>
      <div class="menu-search-icon">
        <button
          type="button"
          aria-label={m.headerAriaCloseSearch()}
          class="header-search-close"
          onclick={closeHeaderSearch}
        >
          <i class="bi bi-x-lg"></i>
        </button>
      </div>
    </div>
  </form>
  <!-- END menu-search -->
</div>
<!-- END #header -->

<style>
  .phibek-brand {
    display: inline-flex;
    align-items: center;
    gap: 0.625rem;
    text-decoration: none;
  }
  .phibek-brand-img {
    width: 32px;
    height: 32px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    position: relative;
  }
  .phibek-brand-mark {
    width: 32px;
    height: 32px;
    display: block;
    object-fit: contain;
    filter: drop-shadow(0 0 6px rgba(232, 184, 75, 0.35));
  }
  .phibek-brand-fallback {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 700;
    color: var(--phibek-oracle-gold);
    pointer-events: none;
  }
  .phibek-brand-mark + .phibek-brand-fallback {
    display: none;
  }
  .phibek-brand-text {
    display: inline-flex;
    flex-direction: column;
    align-items: flex-start;
    line-height: 1;
  }
  .phibek-brand-name {
    font-weight: 700;
    letter-spacing: 0.12em;
    color: var(--phibek-foresight-gold);
    font-size: 1rem;
  }
  .phibek-brand-subtitle {
    color: var(--phibek-foresight-gold);
    opacity: 0.8;
    letter-spacing: 0.18em;
    font-size: 0.6875rem;
    margin-top: 2px;
  }
  .header-user-email {
    width: 6.75rem;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 0.625rem;
    letter-spacing: 0.05em;
    opacity: 0.62;
  }
  .header-icon-button {
    border: 0;
    background: transparent;
    height: 100%;
  }
  .header-search-close {
    border: 0;
    background: transparent;
    color: inherit;
    line-height: 1;
    padding: 0;
  }
</style>
