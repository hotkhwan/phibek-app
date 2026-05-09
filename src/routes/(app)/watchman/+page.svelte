<!-- src/routes/(app)/watchman/+page.svelte
     Full port of klynx pages/watchman.vue — iframe wrapper that embeds an
     external Watchman page (URL passed via ?url=). -->
<script lang="ts">
  import { onMount } from 'svelte'
  import { page } from '$app/state'
  import { setPageTitle } from '$lib/utils/title'
  import DomainStarter from '$lib/components/shared/DomainStarter.svelte'
  import { m } from '$lib/i18n/messages'

  const iframeUrl = $derived(page.url.searchParams.get('url') ?? '')

  onMount(() => setPageTitle(m.navWatchmanIframe()))
</script>

<DomainStarter title={m.navWatchmanIframe()} subtitle="External WatchMan UI (iframe)" icon="bi-display" legacyName="watchman">
  {#if iframeUrl}
    <div class="card">
      <div class="card-body p-0">
        <div class="ratio" style="--bs-aspect-ratio: 75%;">
          <iframe
            src={iframeUrl}
            title="WatchMan"
            style="border: 0; width: 100%; height: 100%;"
            allow="autoplay; fullscreen"
            referrerpolicy="strict-origin-when-cross-origin"
          ></iframe>
        </div>
      </div>
      <div class="card-arrow">
        <div class="card-arrow-top-left"></div>
        <div class="card-arrow-top-right"></div>
        <div class="card-arrow-bottom-left"></div>
        <div class="card-arrow-bottom-right"></div>
      </div>
    </div>
  {:else}
    <div class="alert alert-warning small">
      <i class="bi bi-info-circle me-1"></i>
      Provide a target URL via <code>?url=https://…</code> in the address bar.
      Example: <code>/watchman?url=https://watchman.example.com/dashboard</code>
    </div>
  {/if}
</DomainStarter>
