<!-- src/routes/(app)/polices/+page.svelte -->
<script lang="ts">
  import { onMount } from 'svelte'
  import { setPageTitle } from '$lib/utils/title'
  import DomainStarter from '$lib/components/shared/DomainStarter.svelte'
  import { subscribeMqtt, decodeJson, mqttStatus, getMqttClient } from '$lib/stores/mqtt'
  import { m } from '$lib/i18n/messages'

  type Hit = { t: number; topic: string; preview: string }
  let recent = $state<Hit[]>([])
  let unsub = $state<(() => void) | null>(null)

  function startSubscribe() {
    unsub?.()
    unsub = subscribeMqtt(['kwatch.watchlist', 'kwatch.watchlist.sync', 'kalert', 'kdetect'], (topic, payload) => {
      const json = decodeJson(payload)
      const preview = json
        ? JSON.stringify(json).slice(0, 200)
        : new TextDecoder().decode(payload).slice(0, 200)
      recent = [{ t: Date.now(), topic, preview }, ...recent].slice(0, 50)
    })
  }

  onMount(() => {
    setPageTitle(m.navPolicePoliceMode())
    void getMqttClient()
    startSubscribe()
    return () => unsub?.()
  })
</script>

<DomainStarter title={m.navPolicePoliceMode()} subtitle="Real-time alarm + watchlist hit feed" icon="bi-radioactive" legacyName="polices">
  <div class="row g-3">
    <div class="col-12">
      <div class="card">
        <div class="card-header fw-bold d-flex justify-content-between align-items-center">
          <span>
            <i class="bi bi-broadcast me-1"></i> Live MQTT
          </span>
          <span class="badge bg-secondary">{$mqttStatus}</span>
        </div>
        <div class="card-body">
          <div class="text-body text-opacity-50 small mb-2">
            Subscribed: <code>kwatch.watchlist</code> · <code>kwatch.watchlist.sync</code> ·
            <code>kalert</code> · <code>kdetect</code>
          </div>

          <div
            class="border rounded bg-black bg-opacity-25 p-2"
            style="max-height: 60vh; overflow-y: auto; font-family: var(--bs-font-monospace); font-size: 0.8rem;"
          >
            {#if recent.length === 0}
              <div class="text-body text-opacity-50">— waiting for hits —</div>
            {:else}
              {#each recent as r (r.t)}
                <div class="mb-1">
                  <span class="text-body text-opacity-50">[{new Date(r.t).toLocaleTimeString()}]</span>
                  <span class="text-theme">{r.topic}</span>
                  <span class="text-body text-opacity-75">{r.preview}</span>
                </div>
              {/each}
            {/if}
          </div>
        </div>
        <div class="card-arrow">
          <div class="card-arrow-top-left"></div>
          <div class="card-arrow-top-right"></div>
          <div class="card-arrow-bottom-left"></div>
          <div class="card-arrow-bottom-right"></div>
        </div>
      </div>
    </div>
  </div>
</DomainStarter>
