<!-- src/lib/components/shared/Toaster.svelte -->
<script lang="ts">
  import { fly, fade } from 'svelte/transition'
  import { toasts, dismiss, type ToastVariant } from '$lib/stores/notify'

  const iconFor: Record<ToastVariant, string> = {
    success: 'bi-check-circle-fill',
    error: 'bi-exclamation-octagon-fill',
    warning: 'bi-exclamation-triangle-fill',
    info: 'bi-info-circle-fill'
  }

  const colorFor: Record<ToastVariant, string> = {
    success: 'text-success',
    error: 'text-danger',
    warning: 'text-warning',
    info: 'text-info'
  }
</script>

<div
  class="toast-container position-fixed bottom-0 start-50 translate-middle-x p-3 app-toast-bottom-center"
  style="z-index: 1080"
  role="region"
  aria-live="polite"
>
  {#each $toasts as t (t.id)}
    <div
      class="toast show mb-2"
      role="alert"
      aria-live="assertive"
      aria-atomic="true"
      in:fly={{ y: 24, duration: 200 }}
      out:fade={{ duration: 150 }}
    >
      <div class="toast-header">
        <i class="bi {t.icon ?? iconFor[t.variant]} me-2 {colorFor[t.variant]}"></i>
        <strong class="me-auto">{t.title}</strong>
        <button
          type="button"
          class="btn-close"
          aria-label="Close"
          onclick={() => dismiss(t.id)}
        ></button>
      </div>
      {#if t.description}
        <div class="toast-body">{t.description}</div>
      {/if}
    </div>
  {/each}
</div>
