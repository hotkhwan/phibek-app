<script lang="ts">
  import { onMount } from 'svelte'
  import { resolve } from '$app/paths'
  import { goto } from '$app/navigation'

  onMount(() => {
    goto(resolve('/dashboard'), { replaceState: true })
  })
</script>

<div class="redirecting">
  Redirecting to dashboard...
</div>

<style>
  .redirecting {
    min-height: 100vh;
    display: grid;
    place-items: center;
    color: #ffffff;
    background: #0b1224;
    font-size: 1rem;
  }
</style>
