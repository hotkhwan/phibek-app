<!-- src/routes/(app)/+layout.svelte -->
<script lang="ts">
  import { onDestroy, onMount } from 'svelte'
  import { browser } from '$app/environment'
  import { goto } from '$app/navigation'
  import { base, resolve } from '$app/paths'
  import { page } from '$app/state'
  import { appOptions } from '$lib/stores/appOptions'
  import { auth } from '$lib/stores/auth'
  import { activeWorkspaceId } from '$lib/stores/activeWorkspace'
  import { effectiveAccess } from '$lib/stores/effectiveAccess'
  import { evaluatePageAccess, normalizePagePath } from '$lib/utils/pageAccess'

  import AppHeader from '$lib/components/app/AppHeader.svelte'
  import AppSidebar from '$lib/components/app/AppSidebar.svelte'
  import AppTopNav from '$lib/components/app/AppTopNav.svelte'
  import AppFooter from '$lib/components/app/AppFooter.svelte'

  let { data, children } = $props()
  let unsubscribeWorkspace: (() => void) | null = null
  let redirectingTo = $state<string | null>(null)

  onMount(() => {
    $appOptions.appHeaderHide = false
    $appOptions.appSidebarHide = false
    $appOptions.appTopNav = false
    $appOptions.appFooter = true
    $appOptions.appContentClass = ''

    if (data.user) {
      auth.setUser({
        id: data.user.sub,
        email: data.user.email,
        fullName: data.user.name,
        role: data.user.platformRole ?? '',
        permissions: data.user.permissions ?? [],
        token: data.user.accessToken
      })
    } else {
      auth.setReady(true)
    }

    unsubscribeWorkspace = activeWorkspaceId.subscribe((orgId) => {
      if (orgId && auth.get().user?.token) {
        effectiveAccess.fetch(orgId)
      } else {
        effectiveAccess.reset()
      }
    })
  })

  onDestroy(() => {
    unsubscribeWorkspace?.()
  })

  function accessInput() {
    return {
      access: $effectiveAccess.access,
      accessLoaded: $effectiveAccess.isLoaded,
      hasActiveOrg: Boolean($activeWorkspaceId),
      user: $auth.user
    }
  }

  function firstAllowedFallback() {
    const input = accessInput()
    if (evaluatePageAccess('/intDash', input).allowed) return '/intDash'
    if (evaluatePageAccess('/dashboard', input).allowed) return '/dashboard'
    return '/profile'
  }

  $effect(() => {
    if (!browser || !$auth.ready || !$auth.isAuthenticated) return

    const currentPath = normalizePagePath(page.url.pathname, base)
    const decision = evaluatePageAccess(currentPath, accessInput())
    if (decision.allowed || decision.pending) {
      redirectingTo = null
      return
    }

    const fallback = firstAllowedFallback()
    if (currentPath === fallback) return

    const target = resolve(fallback)
    if (redirectingTo === target) return

    redirectingTo = target
    void goto(target, { replaceState: true }).finally(() => {
      if (redirectingTo === target) redirectingTo = null
    })
  })
</script>

{#if !$appOptions.appHeaderHide}<AppHeader />{/if}
{#if !$appOptions.appSidebarHide}<AppSidebar />{/if}
{#if $appOptions.appTopNav}<AppTopNav />{/if}

<div
  id="content"
  class="app-content{$appOptions.appContentClass
    ? ' ' + $appOptions.appContentClass
    : ''}"
>
  {@render children()}
</div>

{#if $appOptions.appFooter}<AppFooter />{/if}
