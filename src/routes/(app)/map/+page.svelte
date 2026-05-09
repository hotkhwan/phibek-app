<!-- src/routes/(app)/map/+page.svelte
     Phase 6 placeholder — full Leaflet camera map (~1949 lines in klynx)
     deferred. The MQTT realtime layer + camera fetch wiring already exists
     (lib/stores/mqtt + lib/api/devices); the map shell will land in a
     dedicated follow-up. -->
<script lang="ts">
  import { onMount } from 'svelte'
  import { setPageTitle } from '$lib/utils/title'
  import DomainStarter from '$lib/components/shared/DomainStarter.svelte'
  import { m } from '$lib/i18n/messages'

  onMount(() => setPageTitle(m.navMap()))
</script>

<DomainStarter title={m.navMap()} subtitle="Operator map view (cameras + sensors)" icon="bi-geo-alt" legacyName="map">
  <div class="card">
    <div class="card-body">
      <p class="text-body text-opacity-75 mb-2">
        Full Leaflet operator map (cluster + marker popovers + live MQTT overlay)
        is a follow-up port (klynx <code>pages/map.vue</code> ≈ 1.9k LOC).
      </p>
      <p class="text-body text-opacity-50 small mb-0">
        Building blocks already shipped:
        <code>lib/components/leaflet/EventMap.svelte</code>,
        <code>lib/components/leaflet/MapPicker.svelte</code>,
        <code>lib/api/devices.listCameras()</code>,
        <code>lib/stores/mqtt.subscribeMqtt()</code>.
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
