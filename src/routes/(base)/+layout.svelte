<!-- src/routes/(base)/+layout.svelte -->
<script lang="ts">
  import { onMount } from 'svelte'
  import { appOptions } from '$lib/stores/appOptions'

  let { children } = $props()

  onMount(() => {
    $appOptions.appHeaderHide = true
    $appOptions.appSidebarHide = true
    $appOptions.appFooter = false
    $appOptions.appContentClass = 'p-0'
  })
</script>

<div id="content" class="app-content p-0">
  {@render children()}
</div>
