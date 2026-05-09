<!-- src/routes/(public)/changelog/+page.svelte -->
<script lang="ts">
  import { onMount } from 'svelte'
  import { setPageTitle } from '$lib/utils/title'
  import { m } from '$lib/i18n/messages'

  onMount(() => setPageTitle(m.navChangelog()))

  type Entry = { version: string; date: string; bullets: string[] }
  const entries: Entry[] = [
    {
      version: '0.7.0',
      date: '2026-05-07',
      bullets: [
        'Cyber Admin parity pass: PHIBEK พิเภท branding, larger global typography, package-driven platform version, and system user CRUD actions.'
      ]
    },
    {
      version: '0.6.0',
      date: '2026-05-06',
      bullets: [
        'Phase 6: live/map/videowall/biDash/mqtt/watchman + subscription/pricing + public landing/changelog/docs surfaces.'
      ]
    },
    {
      version: '0.5.0',
      date: '2026-05-06',
      bullets: [
        'Phase 5: edge-ai · ingest · floorPlans · police · admin (10 starter pages).',
        'Sidebar: Operations + Admin sections.'
      ]
    },
    {
      version: '0.4.0',
      date: '2026-05-06',
      bullets: [
        'Phase 4: aiSearch · iotWatch · iotControl · systemDevices · systemUsers (14 starter pages, 5 lib/api modules).',
        'PHIBEK navigation replaces gateway-portal Events/Delivery/Workspaces menus.'
      ]
    },
    {
      version: '0.3.0',
      date: '2026-05-06',
      bullets: [
        'Phase 3: realtime + media — singleton MQTT store, FlvPlayer / HlsPlayer / WebRTCPlayer / VideoPlayer, /live smoke.',
        'PHIBEK CI applied: navy + gold palette, brand mark, "PHIBEK · พิเภท" wordmark.'
      ]
    },
    {
      version: '0.2.0',
      date: '2026-05-06',
      bullets: [
        'Phase 2: dashboard / profile / settings + auto Bearer + X-Active-Org fetch.'
      ]
    },
    {
      version: '0.1.0',
      date: '2026-05-06',
      bullets: [
        'Phase 0–1: SvelteKit shell, Keycloak auth + httpOnly cookie session, paraglide i18n.'
      ]
    }
  ]
</script>

<div class="container py-5" style="max-width: 760px;">
  <h1 class="display-5 fw-bold mb-1" style="color: var(--phibek-foresight-gold);">{m.navChangelog()}</h1>
  <p class="text-body text-opacity-50 mb-5">Release notes for the PHIBEK · พิเภท platform.</p>

  {#each entries as e}
    <div class="card mb-3">
      <div class="card-body">
        <div class="d-flex justify-content-between align-items-baseline mb-2">
          <h5 class="fw-bold mb-0 font-monospace">v{e.version}</h5>
          <small class="text-body text-opacity-50">{e.date}</small>
        </div>
        <ul class="mb-0 ps-3">
          {#each e.bullets as b}
            <li class="text-body text-opacity-75 small">{b}</li>
          {/each}
        </ul>
      </div>
      <div class="card-arrow">
        <div class="card-arrow-top-left"></div>
        <div class="card-arrow-top-right"></div>
        <div class="card-arrow-bottom-left"></div>
        <div class="card-arrow-bottom-right"></div>
      </div>
    </div>
  {/each}

  <div class="text-center mt-4">
    <a href="/dashboard" class="btn btn-outline-theme btn-sm">
      <i class="bi bi-arrow-left me-1"></i> Back to dashboard
    </a>
  </div>
</div>
