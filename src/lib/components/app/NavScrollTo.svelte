<!-- src/lib/components/app/NavScrollTo.svelte -->
<script lang="ts">
  export let target: string

  function scrollTo(event: MouseEvent) {
    event.preventDefault()

    const targetElm = document.querySelector<HTMLElement>(target)
    const targetHeader = document.querySelector<HTMLElement>('.app-header')

    if (!targetElm) return

    const headerHeight = targetHeader?.offsetHeight ?? 0
    const targetTop = targetElm.offsetTop - headerHeight - 24

    window.scrollTo({
      top: targetTop,
      behavior: 'smooth'
    })
  }
</script>

<a class="nav-link" href={target} on:click={scrollTo}>
  <slot />
</a>
