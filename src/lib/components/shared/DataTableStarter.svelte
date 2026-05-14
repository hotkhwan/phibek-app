<!-- src/lib/components/shared/DataTableStarter.svelte
     Lightweight async-data table for Phase 4 starter pages. -->
<script lang="ts" generics="T extends Record<string, unknown>">
  type Column = {
    key: string
    label: string
    accessor?: (row: T) => unknown
    cellClass?: string
  }

  type RowAction = {
    label: string
    icon?: string
    class?: string
    action: (row: T) => void | Promise<void>
  }

  let {
    columns,
    rows = [],
    loading = false,
    error = '',
    emptyText = 'No records',
    rowActions = []
  } = $props<{
    columns: Column[]
    rows: T[]
    loading?: boolean
    error?: string
    emptyText?: string
    rowActions?: RowAction[]
  }>()

  function read(row: T, col: Column): string {
    const v = col.accessor ? col.accessor(row) : (row as Record<string, unknown>)[col.key]
    if (v === null || v === undefined) return '—'
    if (typeof v === 'object') return JSON.stringify(v)
    return String(v)
  }
</script>

<div class="card data-table-starter">
  <div class="card-body p-0">
    {#if error}
      <div class="alert alert-danger small m-3">{error}</div>
    {/if}

    <div class="table-responsive data-table-starter-scroll">
      <table class="table table-card mb-0">
        <thead>
          <tr>
            {#each columns as col}
              <th scope="col">{col.label}</th>
            {/each}
            {#if rowActions.length}
              <th scope="col" class="text-end">Actions</th>
            {/if}
          </tr>
        </thead>
        <tbody>
          {#if loading && rows.length === 0}
            <tr>
              <td colspan={columns.length + (rowActions.length ? 1 : 0)} class="text-center py-4">
                <div class="spinner-border spinner-border-sm text-theme me-2"></div>
                <span class="text-body text-opacity-50">Loading…</span>
              </td>
            </tr>
          {:else if rows.length === 0}
            <tr>
              <td colspan={columns.length + (rowActions.length ? 1 : 0)} class="text-center py-4 text-body text-opacity-50">
                {emptyText}
              </td>
            </tr>
          {:else}
            {#each rows as row, i (i)}
              <tr>
                {#each columns as col}
                  <td class={col.cellClass ?? ''}>{read(row, col)}</td>
                {/each}
                {#if rowActions.length}
                  <td class="text-end text-nowrap">
                    {#each rowActions as rowAction}
                      <button
                        type="button"
                        class={rowAction.class ?? 'btn btn-outline-theme btn-sm me-1'}
                        onclick={() => rowAction.action(row)}
                      >
                        {#if rowAction.icon}<i class={rowAction.icon}></i>{/if}
                        <span class="ms-1">{rowAction.label}</span>
                      </button>
                    {/each}
                  </td>
                {/if}
              </tr>
            {/each}
          {/if}
        </tbody>
      </table>
    </div>
  </div>
  <div class="card-arrow">
    <div class="card-arrow-top-left"></div>
    <div class="card-arrow-top-right"></div>
    <div class="card-arrow-bottom-left"></div>
    <div class="card-arrow-bottom-right"></div>
  </div>
</div>

<style>
  .data-table-starter {
    min-height: 0;
  }

  .data-table-starter-scroll {
    max-height: min(62vh, 44rem);
    overflow: auto;
  }

  .data-table-starter-scroll :global(thead th) {
    position: sticky;
    top: 0;
    z-index: 2;
    background: rgba(var(--bs-body-bg-rgb), 0.96);
    backdrop-filter: blur(10px);
  }
</style>
