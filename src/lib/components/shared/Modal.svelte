<!-- src/lib/components/shared/Modal.svelte
     Generic Bootstrap modal wrapper. Use bind:open to control visibility. -->
<script lang="ts">
  import { onMount, onDestroy } from 'svelte'

  let {
    open = $bindable(false),
    title = '',
    size = 'md' as 'sm' | 'md' | 'lg' | 'xl',
    dismissible = true,
    onClose = () => {},
    header,
    body,
    footer
  } = $props<{
    open?: boolean
    title?: string
    size?: 'sm' | 'md' | 'lg' | 'xl'
    dismissible?: boolean
    onClose?: () => void
    header?: import('svelte').Snippet
    body?: import('svelte').Snippet
    footer?: import('svelte').Snippet
  }>()

  let dialogEl: HTMLDivElement | null = $state(null)
  let bsModal: { show: () => void; hide: () => void; dispose: () => void } | null = null

  async function ensure() {
    if (!dialogEl || bsModal) return
    const bs = (await import('bootstrap')) as unknown as {
      Modal: new (el: HTMLElement, opts?: Record<string, unknown>) => {
        show: () => void
        hide: () => void
        dispose: () => void
      }
    }
    bsModal = new bs.Modal(dialogEl, {
      backdrop: dismissible ? true : 'static',
      keyboard: dismissible
    })
    dialogEl.addEventListener('hidden.bs.modal', () => {
      open = false
      onClose()
    })
  }

  $effect(() => {
    if (!dialogEl) return
    if (open) {
      ensure().then(() => bsModal?.show())
    } else {
      bsModal?.hide()
    }
  })

  onMount(ensure)
  onDestroy(() => bsModal?.dispose())

  const sizeClass = $derived(
    size === 'sm' ? 'modal-sm' : size === 'lg' ? 'modal-lg' : size === 'xl' ? 'modal-xl' : ''
  )
</script>

<div
  bind:this={dialogEl}
  class="modal fade"
  tabindex="-1"
  aria-hidden={!open}
  role="dialog"
>
  <div class="modal-dialog modal-dialog-centered {sizeClass}">
    <div class="modal-content">
      <div class="modal-header">
        <h5 class="modal-title fw-bold">
          {#if header}{@render header()}{:else}{title}{/if}
        </h5>
        {#if dismissible}
          <button type="button" class="btn-close" aria-label="Close" onclick={() => (open = false)}></button>
        {/if}
      </div>
      <div class="modal-body">
        {#if body}{@render body()}{/if}
      </div>
      {#if footer}
        <div class="modal-footer">
          {@render footer()}
        </div>
      {/if}
      <div class="card-arrow">
        <div class="card-arrow-top-left"></div>
        <div class="card-arrow-top-right"></div>
        <div class="card-arrow-bottom-left"></div>
        <div class="card-arrow-bottom-right"></div>
      </div>
    </div>
  </div>
</div>
