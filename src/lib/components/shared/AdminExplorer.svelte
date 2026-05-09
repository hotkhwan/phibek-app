<!-- src/lib/components/shared/AdminExplorer.svelte -->
<script lang="ts">
  import { m } from '$lib/i18n/messages'

  type Item = {
    id: string
    title: string
    subtitle?: string
    icon?: string
    meta?: string
  }

  let {
    title,
    subtitle = '',
    icon = 'bi-folder',
    items = [],
    selectedId = '',
    search = '',
    loading = false,
    error = '',
    createDisabled = false,
    editDisabled = false,
    deleteDisabled = false,
    onSearch,
    onSelect,
    onCreate,
    onEdit,
    onDelete,
    onRefresh,
    children,
    detail
  } = $props<{
    title: string
    subtitle?: string
    icon?: string
    items?: Item[]
    selectedId?: string
    search?: string
    loading?: boolean
    error?: string
    createDisabled?: boolean
    editDisabled?: boolean
    deleteDisabled?: boolean
    onSearch?: (value: string) => void
    onSelect?: (id: string) => void
    onCreate?: () => void
    onEdit?: () => void
    onDelete?: () => void
    onRefresh?: () => void
    children?: import('svelte').Snippet
    detail?: import('svelte').Snippet
  }>()
</script>

<div class="container-xxl p-3 p-lg-4">
  <div class="app-content-header px-0">
    <div class="page-header">
      <i class="bi {icon} text-theme me-2"></i>{title}
      {#if subtitle}<small>{subtitle}</small>{/if}
    </div>
  </div>

  <div class="admin-explorer file-manager d-flex flex-column">
    <div class="file-manager-toolbar">
      <button type="button" class="btn border-0 text-uppercase" disabled={createDisabled} onclick={onCreate}>
        <i class="bi bi-plus-lg me-1 opacity-5"></i>{m.adminExplorerCreate()}
      </button>
      <button type="button" class="btn border-0 text-uppercase" disabled={!selectedId || editDisabled} onclick={onEdit}>
        <i class="bi bi-pen me-1 opacity-5"></i>{m.adminExplorerEdit()}
      </button>
      <button type="button" class="btn border-0 text-uppercase" disabled={!selectedId || deleteDisabled} onclick={onDelete}>
        <i class="bi bi-trash me-1 opacity-5"></i>{m.adminExplorerDelete()}
      </button>
      <button type="button" class="btn border-0 text-uppercase ms-auto" disabled={loading} onclick={onRefresh}>
        <i class="bi bi-arrow-clockwise me-1 opacity-5"></i>{m.adminExplorerRefresh()}
      </button>
    </div>

    <div class="file-manager-container flex-1 d-flex overflow-hidden">
      <aside class="file-manager-sidebar d-flex flex-column">
        <div class="p-3 border-bottom">
          <input
            type="search"
            class="form-control form-control-sm"
            placeholder={m.adminExplorerSearch()}
            value={search}
            oninput={(e) => onSearch?.((e.currentTarget as HTMLInputElement).value)}
          />
        </div>
        <div class="file-manager-sidebar-content overflow-auto p-3">
          {#if error}
            <div class="alert alert-danger small">{error}</div>
          {/if}
          {#if loading && items.length === 0}
            <div class="text-body text-opacity-50 small">{m.actionLoading()}</div>
          {:else}
            <div class="admin-explorer-list">
              {#each items as item}
                <button
                  type="button"
                  class="admin-explorer-item"
                  class:active={selectedId === item.id}
                  onclick={() => onSelect?.(item.id)}
                >
                  <div class="d-flex align-items-center gap-2">
                    <i class="bi {item.icon ?? 'bi-folder'} text-theme"></i>
                    <div class="flex-1 min-w-0">
                      <div class="fw-bold text-truncate">{item.title}</div>
                      {#if item.subtitle}<div class="small text-body text-opacity-50 text-truncate">{item.subtitle}</div>{/if}
                    </div>
                    {#if item.meta}<span class="badge bg-theme text-theme-color">{item.meta}</span>{/if}
                  </div>
                </button>
              {/each}
            </div>
          {/if}
        </div>
      </aside>

      <section class="flex-1 overflow-auto p-3 p-lg-4">
        {#if detail}
          {@render detail()}
        {:else if children}
          {@render children()}
        {:else}
          <div class="h-100 d-grid place-items-center text-body text-opacity-50">
            {m.adminExplorerNoSelection()}
          </div>
        {/if}
      </section>
    </div>
  </div>
</div>
