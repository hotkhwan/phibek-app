<!-- src/routes/(app)/+layout.svelte -->
<script lang="ts">
  import { onDestroy, onMount } from 'svelte'
  import { appOptions } from '$lib/stores/appOptions'
  import { auth } from '$lib/stores/auth'
  import { activeWorkspaceId } from '$lib/stores/activeWorkspace'
  import { effectiveAccess } from '$lib/stores/effectiveAccess'

  import AppHeader from '$lib/components/app/AppHeader.svelte'
  import AppSidebar from '$lib/components/app/AppSidebar.svelte'
  import AppTopNav from '$lib/components/app/AppTopNav.svelte'
  import AppFooter from '$lib/components/app/AppFooter.svelte'

  let { data, children } = $props()
  let unsubscribeWorkspace: (() => void) | null = null

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
