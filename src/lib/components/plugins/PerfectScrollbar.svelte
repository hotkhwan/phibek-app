<!-- src/lib/components/plugins/PerfectScrollbar.svelte -->
<script lang="ts">
  import PerfectScrollbar from 'perfect-scrollbar'
  import { onMount, onDestroy } from 'svelte'

  let container: HTMLDivElement | null = null
  let ps: PerfectScrollbar | null = null

  onMount(() => {
    if (container) {
      ps = new PerfectScrollbar(container)
    }
  })

  onDestroy(() => {
    ps?.destroy()
    ps = null
  })
</script>

<div bind:this={container} class={$$props.class}>
  <slot />
</div>
