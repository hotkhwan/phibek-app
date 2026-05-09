<!-- src/routes/(app)/biDash/+page.svelte
     Phase 6 placeholder — full klynx biDash is ~3.8k LOC (analytics + map +
     timeseries + camera grid). Defer the deep port; surface the underlying
     Metabase embed URL when present so users can still pull the BI tile up. -->
<script lang="ts">
  import { onMount } from 'svelte'
  import { env } from '$env/dynamic/public'
  import { setPageTitle } from '$lib/utils/title'
  import DomainStarter from '$lib/components/shared/DomainStarter.svelte'
  import { m } from '$lib/i18n/messages'

  const metabase = $derived(env.PUBLIC_METABASE_EMBED_URL ?? '')

  onMount(() => setPageTitle(m.navBiDash()))
</script>

<DomainStarter title={m.navBiDash()} subtitle="Metabase / aggregated business intelligence" icon="bi-bar-chart" legacyName="biDash">
  {#if metabase}
    <div class="card">
      <div class="card-body p-0">
        <div class="ratio" style="--bs-aspect-ratio: 65%;">
          <iframe src={metabase} title="biDash" style="border: 0; width: 100%; height: 100%;"></iframe>
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
    <div class="card">
      <div class="card-body">
        <div class="alert alert-warning small mb-2">
          <i class="bi bi-info-circle me-1"></i>
          <code>PUBLIC_METABASE_EMBED_URL</code> is not configured.
        </div>
        <p class="text-body text-opacity-75 mb-0">
          Full BI dashboard (4 KPI cards + 6 charts + camera grid + map) is a
          follow-up port (klynx <code>pages/biDash.vue</code> ≈ 3.8k LOC).
        </p>
      </div>
      <div class="card-arrow">
        <div class="card-arrow-top-left"></div>
        <div class="card-arrow-top-right"></div>
        <div class="card-arrow-bottom-left"></div>
        <div class="card-arrow-bottom-right"></div>
      </div>
    </div>
  {/if}
</DomainStarter>
