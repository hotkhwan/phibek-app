<!-- src/routes/(public)/changelog/[...slug]/+page.svelte -->
<script lang="ts">
  import { page } from '$app/state'
  import { onMount } from 'svelte'
  import { setPageTitle } from '$lib/utils/title'

  const slug = $derived(page.params.slug ?? '')

  onMount(() => setPageTitle(`Changelog · ${slug}`))
</script>

<div class="container py-5" style="max-width: 760px;">
  <a href="/changelog" class="btn btn-link btn-sm p-0 mb-3">
    <i class="bi bi-chevron-left me-1"></i> All entries
  </a>
  <h1 class="display-6 fw-bold font-monospace" style="color: var(--phibek-foresight-gold);">{slug}</h1>
  <div class="card mt-3">
    <div class="card-body">
      <p class="text-body text-opacity-75 mb-0">
        Per-version detail rendering (markdown loaded from <code>klynx-api/CHANGELOG.md</code>)
        is a follow-up. For now, see the consolidated list at <a href="/changelog">/changelog</a>.
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
