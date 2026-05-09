<!-- src/routes/(public)/error/+page.svelte -->
<script lang="ts">
  import { resolve } from '$app/paths'
  import { m } from '$lib/i18n/messages'
</script>

<div class="error-page">
  <div class="error-page-content">
    <div class="hud-line-lg mb-3 mt-n5"></div>
    <div class="error-code">404</div>
    <div class="hud-line-lg mt-3 mb-5"></div>
    <h1 class="mt-5 mb-2 text-uppercase">{m.errorOops()}</h1>
    <h6 class="fw-semibold text-body text-opacity-75 text-uppercase mb-3">
      {m.errorNotFoundDesc()}
    </h6>
    <hr class="w-40px mx-auto my-4 mb-5" />
    <p class="mb-2 opacity-5 text-uppercase fw-bold">{m.errorHelpfulLinks()}</p>
    <p class="mb-3 d-flex justify-content-center align-items-center px-3 flex-wrap gap-lg-3 gap-2 text-uppercase fw-semibold">
      <a href={resolve('/dashboard')} class="text-decoration-none text-body text-opacity-75">{m.navDashboard()}</a>
      <span class="w-3px h-3px bg-white bg-opacity-25"></span>
      <a href={resolve('/settings')} class="text-decoration-none text-body text-opacity-75">{m.navSettings()}</a>
      <span class="w-3px h-3px bg-white bg-opacity-25"></span>
      <a href={resolve('/profile')} class="text-decoration-none text-body text-opacity-75">{m.navProfile()}</a>
    </p>
    <button type="button" class="btn btn-outline-secondary px-3" onclick={() => history.back()}>
      BACK
    </button>
  </div>
</div>
