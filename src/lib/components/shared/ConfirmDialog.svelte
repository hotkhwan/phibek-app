<!-- src/lib/components/shared/ConfirmDialog.svelte
     Confirm/cancel dialog around the generic Modal. -->
<script lang="ts">
  import Modal from '$lib/components/shared/Modal.svelte'

  let {
    open = $bindable(false),
    title = 'Are you sure?',
    message = '',
    confirmLabel = 'Confirm',
    cancelLabel = 'Cancel',
    danger = false,
    busy = false,
    onConfirm = async () => {}
  } = $props<{
    open?: boolean
    title?: string
    message?: string
    confirmLabel?: string
    cancelLabel?: string
    danger?: boolean
    busy?: boolean
    onConfirm?: () => void | Promise<void>
  }>()

  async function handleConfirm() {
    busy = true
    try {
      await onConfirm()
      open = false
    } finally {
      busy = false
    }
  }
</script>

<Modal bind:open {title} size="sm" dismissible={!busy}>
  {#snippet body()}
    <p class="mb-0 text-body text-opacity-85">{message}</p>
  {/snippet}
  {#snippet footer()}
    <button
      type="button"
      class="btn btn-outline-secondary btn-sm"
      onclick={() => (open = false)}
      disabled={busy}
    >
      {cancelLabel}
    </button>
    <button
      type="button"
      class="btn btn-sm"
      class:btn-danger={danger}
      class:btn-outline-theme={!danger}
      onclick={handleConfirm}
      disabled={busy}
    >
      {#if busy}
        <span class="spinner-border spinner-border-sm me-1"></span>
      {/if}
      {confirmLabel}
    </button>
  {/snippet}
</Modal>
