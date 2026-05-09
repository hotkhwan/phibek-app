<!-- src/routes/(public)/docs/[...slug]/+page.svelte -->
<script lang="ts">
  import { page } from '$app/state'
  import { onMount } from 'svelte'
  import { setPageTitle } from '$lib/utils/title'

  const slug = $derived(page.params.slug ?? '')

  onMount(() => setPageTitle(`Docs · ${slug}`))
</script>

<div class="container py-5" style="max-width: 760px;">
  <a href="/docs" class="btn btn-link btn-sm p-0 mb-3">
    <i class="bi bi-chevron-left me-1"></i> All sections
  </a>
  <h1 class="h2 fw-bold font-monospace" style="color: var(--phibek-foresight-gold);">{slug}</h1>

  <div class="card mt-3">
    <div class="card-body">
      <p class="text-body text-opacity-75 mb-2">
        Markdown rendering for individual doc pages (mdsvex / fetch-from-content
        store) is a follow-up. The page slug is loaded from the route param —
        once the markdown loader is wired, content will render here.
      </p>
      <p class="text-body text-opacity-50 small mb-0">
        See <a href="/docs">/docs</a> for the section index.
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
