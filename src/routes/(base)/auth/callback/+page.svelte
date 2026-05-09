<!-- src/routes/(base)/auth/callback/+page.svelte -->
<script lang="ts">
  import { onMount } from 'svelte'
  import { browser } from '$app/environment'
  import { goto } from '$app/navigation'
  import { resolve } from '$app/paths'
  import { setPageTitle } from '$lib/utils/title'
  import { initKeycloak } from '$lib/client/keycloak'
  import { popIntended } from '$lib/stores/auth'
  import { m } from '$lib/i18n/messages'

  let error = $state('')

  onMount(async () => {
    setPageTitle(m.authPageCallbackTitle())
    if (!browser) return

    try {
      const ok = await initKeycloak({
        onLoad: 'check-sso',
        redirectPath: '/auth/callback'
      })
      if (!ok) {
        error = m.authPageCallbackDidNotComplete()
        setTimeout(() => goto(resolve('/auth/login'), { replaceState: true }), 1200)
        return
      }
      const url = new URL(window.location.href)
      const returnTo =
        url.searchParams.get('returnTo') ?? popIntended() ?? resolve('/dashboard')
      await goto(returnTo, { replaceState: true })
    } catch (err) {
      console.error('[auth/callback] error', err)
      error = (err as Error)?.message || m.authPageCallbackFailed()
      setTimeout(() => goto(resolve('/auth/login'), { replaceState: true }), 1500)
    }
  })
</script>

<div class="d-flex align-items-center justify-content-center vh-100 p-3">
  <div class="text-center">
    {#if error}
      <div class="alert alert-danger">{error}</div>
      <a href={resolve('/auth/login')} class="btn btn-outline-theme">{m.authPageCallbackBackToSignIn()}</a>
    {:else}
      <div class="spinner-border text-theme mb-3" role="status">
        <span class="visually-hidden">{m.authPageCallbackInProgress()}</span>
      </div>
      <div class="text-body text-opacity-75">{m.authPageCallbackInProgress()}</div>
    {/if}
  </div>
</div>
