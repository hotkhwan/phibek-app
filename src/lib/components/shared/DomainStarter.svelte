<!-- src/lib/components/shared/DomainStarter.svelte
     Phase 4 starter shell for rebranded domain pages — title block + cyber_admin
     card-arrow surround + slot for content. Keep this lightweight; deep porting
     happens per-domain in later phases. -->
<script lang="ts">
  let {
    title,
    subtitle = '',
    icon = 'bi-grid-3x3-gap',
    legacyName = '',
    children
  } = $props<{
    title: string
    subtitle?: string
    icon?: string
    legacyName?: string
    children?: import('svelte').Snippet
  }>()
</script>

<div class="p-3 p-lg-4">
  <div class="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-4">
    <div>
      <h1 class="page-header mb-1 fw-bold">
        <i class="bi {icon} text-theme me-2"></i>
        {title}
      </h1>
      {#if subtitle}
        <div class="text-body text-opacity-50 small">{subtitle}</div>
      {/if}
      {#if legacyName}
        <div class="small mt-1">
          <span class="badge bg-secondary bg-opacity-25 text-body text-opacity-75">
            <i class="bi bi-arrow-left-right me-1"></i> klynx · <code class="text-body text-opacity-75">{legacyName}</code>
          </span>
        </div>
      {/if}
    </div>
  </div>

  {#if children}
    {@render children()}
  {/if}
</div>
