<!-- src/routes/+page.svelte
     This page only renders if the +page.server.ts redirect somehow doesn't
     fire (e.g. the user disabled JS + the server load throws). Show an
     animated spinner with visible "Loading…" text + a manual fallback link.
     -->
<script lang="ts">
  import { onMount } from 'svelte'
  import { goto } from '$app/navigation'
  import { resolve } from '$app/paths'

  let showFallback = $state(false)

  onMount(() => {
    // Belt-and-suspenders client-side redirect.
    goto(resolve('/landing'))
    // After 4s without nav, surface a manual link.
    const t = setTimeout(() => (showFallback = true), 4000)
    return () => clearTimeout(t)
  })
</script>

<div
  class="d-flex flex-column align-items-center justify-content-center vh-100 gap-3 text-center"
  style="background: var(--bs-body-bg);"
>
  <div
    class="spinner-border text-theme"
    role="status"
    aria-hidden="true"
    style="width: 3rem; height: 3rem; border-width: .25em;"
  ></div>

  <div
    class="fw-semibold text-uppercase"
    style="letter-spacing: .12em; color: var(--phibek-foresight-gold);"
  >
    Loading…
  </div>

  <small class="text-body text-opacity-50">PHIBEK · winn is starting up</small>

  {#if showFallback}
    <a href={resolve('/landing')} class="btn btn-outline-theme btn-sm mt-3">
      <i class="bi bi-arrow-right me-1"></i>
      Continue manually
    </a>
  {/if}
</div>
