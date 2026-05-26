<!-- src/routes/(base)/auth/login/+page.svelte -->
<script lang="ts">
  import { onMount } from 'svelte'
  import { browser } from '$app/environment'
  import { page } from '$app/state'
  import { goto } from '$app/navigation'
  import { resolve, asset } from '$app/paths'
  import { setPageTitle } from '$lib/utils/title'
  import { initKeycloak, login } from '$lib/client/keycloak'
  import { m } from '$lib/i18n/messages'

  const backgroundImage = asset('/img/landing/cover.jpg')

  let busy = $state(true)
  let error = $state('')

  // returnTo coming from the redirect chain already includes paths.base
  // (hooks.server.ts forwards `${pathname}${search}`), so use it as-is.
  // When the user lands here directly with no returnTo, fall back to the
  // base-prefixed dashboard via resolve().
  const returnTo = $derived(
    page.url.searchParams.get('returnTo') ?? resolve('/intDash')
  )

  onMount(async () => {
    setPageTitle(m.authPageTitle())
    if (!browser) return

    try {
      const ok = await initKeycloak({
        onLoad: 'check-sso',
        redirectPath: '/auth/callback'
      })
      if (ok) {
        await goto(returnTo, { replaceState: true })
        return
      }
    } catch (err) {
      console.error('[auth/login] init error', err)
    } finally {
      busy = false
    }
  })

  async function onSignIn() {
    busy = true
    error = ''
    try {
      await login(returnTo)
    } catch (err) {
      console.error('[auth/login] login error', err)
      error = (err as Error)?.message || 'Sign in failed'
      busy = false
    }
  }
</script>

<div class="login d-flex align-items-center justify-content-center vh-100 p-3" style={`background-image: linear-gradient(rgba(8, 12, 26, 0.78), rgba(8, 12, 26, 0.78)), url(${backgroundImage}); background-size: cover; background-position: center;`}>
  <div class="login-container w-100" style="max-width: 420px">
    <div class="card card-glass">
      <div class="card-body p-4 p-md-5">
        <h1 class="mb-2 fw-bold">{m.authPageTitle()}</h1>
        <p class="text-body text-opacity-50 mb-4">{m.authPageSubtitle()}</p>

        {#if error}
          <div class="alert alert-danger small">{error}</div>
        {/if}

        <button
          type="button"
          class="btn btn-outline-theme btn-lg w-100 mb-2"
          disabled={busy}
          onclick={onSignIn}
        >
          {#if busy}
            <span class="spinner-border spinner-border-sm me-2" role="status"></span>
            {m.authPageConnecting()}
          {:else}
            <i class="bi bi-shield-lock me-2"></i>
            {m.authPageSso()}
          {/if}
        </button>

        <p class="text-body text-opacity-50 small mt-3 mb-0">
          {m.authPageRedirectNote()}
        </p>
      </div>
      <div class="card-arrow">
        <div class="card-arrow-top-left"></div>
        <div class="card-arrow-top-right"></div>
        <div class="card-arrow-bottom-left"></div>
        <div class="card-arrow-bottom-right"></div>
      </div>
    </div>
  </div>
</div>

<style>
  .login {
    min-height: 100vh;
    background-repeat: no-repeat;
    background-attachment: fixed;
  }

  .login .card-glass {
    background: rgba(9, 14, 34, 0.78);
    border: 1px solid rgba(255, 255, 255, 0.08);
    backdrop-filter: blur(18px);
    box-shadow: 0 32px 80px rgba(0, 0, 0, 0.24);
  }
</style>
