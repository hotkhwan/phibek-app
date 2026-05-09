<!-- src/lib/components/plugins/ApexCharts.svelte -->
<script lang="ts">
  import { onMount, onDestroy, afterUpdate } from 'svelte'
  import { appVariables } from '$lib/stores/appVariables'
  import type ApexCharts from 'apexcharts'
  import type { ApexOptions } from 'apexcharts'

  export let options: ApexOptions
  export let height: string | number

  let chart: ApexCharts | null = null
  let elm: HTMLDivElement | null = null
  let ApexLib: typeof ApexCharts | null = null
  let unsubscribe: (() => void) | null = null

  function buildTheme(vars: any): ApexOptions {
    return {
      ...options,
      theme: {
        mode: 'dark'
      },
      grid: { borderColor: vars.color.borderColor }
    }
  }

  function render(vars: any) {
    if (!elm || !ApexLib) return

    chart = new ApexLib(elm, buildTheme(vars))
    chart.render()
  }

  onMount(async () => {
    ApexLib = (await import('apexcharts')).default

    unsubscribe = appVariables.subscribe((vars) => {
      if (!vars?.color) return
      chart?.destroy()
      render(vars)
    })
  })

  afterUpdate(() => {
    chart?.destroy()
    render($appVariables)
  })

  onDestroy(() => {
    unsubscribe?.()
    chart?.destroy()
  })
</script>

<div bind:this={elm} style="height: {height}"></div>
