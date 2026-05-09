<!-- src/routes/(base)/auth/error/+page.svelte -->
<script lang="ts">
  import { page } from '$app/state'
  import { resolve } from '$app/paths'
  import { m } from '$lib/i18n/messages'

  const reason = $derived(
    page.url.searchParams.get('reason') ?? m.authPageErrorUnknown()
  )
</script>

<div class="d-flex align-items-center justify-content-center vh-100 p-3">
  <div class="text-center" style="max-width: 480px">
    <h1 class="display-5 fw-bold mb-2">{m.authPageErrorTitle()}</h1>
    <p class="text-body text-opacity-50 mb-4">{reason}</p>
    <a href={resolve('/auth/login')} class="btn btn-outline-theme">{m.authPageErrorTryAgain()}</a>
  </div>
</div>
