<!-- src/routes/(app)/iotControl/map/+page.svelte -->
<script lang="ts">
  import { onMount } from 'svelte'
  import { setPageTitle } from '$lib/utils/title'
  import DomainStarter from '$lib/components/shared/DomainStarter.svelte'
  import { m } from '$lib/i18n/messages'

  onMount(() => setPageTitle(`${m.navIotControl()} · ${m.navIotControlMap()}`))
</script>

<DomainStarter title={m.navIotControlMap()} subtitle="Sensor map view" icon="bi-map" legacyName="kcontrol/map">
  <div class="card">
    <div class="card-body">
      <p class="text-body text-opacity-75 mb-0">
        Leaflet + sensor markers will land in Phase 5 (full domain port).
        Tracker for now: subscribes to <code>kcontrol.health</code> via the
        shared MQTT singleton — see <a href="/iotControl">overview</a>.
      </p>
    </div>
    <div class="card-arrow">
      <div class="card-arrow-top-left"></div>
      <div class="card-arrow-top-right"></div>
      <div class="card-arrow-bottom-left"></div>
      <div class="card-arrow-bottom-right"></div>
    </div>
  </div>
</DomainStarter>
