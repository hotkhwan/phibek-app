<!-- src/routes/(app)/mqtt/+page.svelte
     Full port of klynx pages/mqtt.vue — MQTT test console using the shared
     subscribeMqtt store. -->
<script lang="ts">
  import { onMount, onDestroy } from 'svelte'
  import { setPageTitle } from '$lib/utils/title'
  import DomainStarter from '$lib/components/shared/DomainStarter.svelte'
  import {
    getMqttClient,
    subscribeMqtt,
    mqttStatus,
    mqttLastError,
    type MqttStatus
  } from '$lib/stores/mqtt'
  import type { MqttClient } from 'mqtt'
  import { m } from '$lib/i18n/messages'

  const statusBadge: Record<MqttStatus, string> = {
    idle: 'bg-secondary',
    connecting: 'bg-warning text-dark',
    connected: 'bg-success',
    reconnecting: 'bg-warning text-dark',
    offline: 'bg-secondary',
    error: 'bg-danger',
    closed: 'bg-secondary'
  }

  let activeTopics = $state<string[]>(['kcontrol.events'])
  let topicSub = $state('kcontrol.events')
  let topicPub = $state('kcontrol.events')
  let message = $state(`{
  "deviceId": "69095bcad5c07038b1352627",
  "hwId": "C1:D4:DA:12:50:02",
  "status": "offline",
  "message": "offline",
  "source": "watchdog",
  "stats": { "online": 4, "warning": 4, "offline": 5 }
}`)

  type Msg = { t: number; topic: string; pretty: string }
  let msgs = $state<Msg[]>([])
  let publishStatus = $state('')

  const subscriptions = new Map<string, () => void>()

  function handleMessage(topic: string, payload: Uint8Array) {
    const text = new TextDecoder().decode(payload)
    let pretty = text
    try {
      pretty = JSON.stringify(JSON.parse(text), null, 2)
    } catch {
      // keep raw
    }
    msgs = [{ t: Date.now(), topic, pretty }, ...msgs].slice(0, 400)
  }

  function subscribeTopic(t: string) {
    const trimmed = t.trim()
    if (!trimmed || subscriptions.has(trimmed)) return
    const unsub = subscribeMqtt(trimmed, handleMessage)
    subscriptions.set(trimmed, unsub)
    activeTopics = [...activeTopics, trimmed]
  }

  function unsubscribeTopic(t: string) {
    const fn = subscriptions.get(t)
    if (fn) {
      fn()
      subscriptions.delete(t)
    }
    activeTopics = activeTopics.filter((x) => x !== t)
  }

  async function publish() {
    publishStatus = ''
    const client: MqttClient | null = await getMqttClient()
    if (!client) {
      publishStatus = 'MQTT client not available'
      return
    }
    try {
      await new Promise<void>((resolve, reject) => {
        client.publish(topicPub.trim(), message, { qos: 0, retain: false }, (err) => {
          if (err) reject(err)
          else resolve()
        })
      })
      publishStatus = `Published to ${topicPub.trim()}`
    } catch (err) {
      publishStatus = `Publish failed: ${(err as Error)?.message ?? err}`
    }
  }

  onMount(() => {
    setPageTitle(m.navMqttConsole())
    void getMqttClient()
    for (const t of activeTopics) subscribeTopic(t)
  })

  onDestroy(() => {
    for (const fn of subscriptions.values()) fn()
    subscriptions.clear()
  })
</script>

<DomainStarter title={m.navMqttConsole()} subtitle="Subscribe + publish test console" icon="bi-broadcast-pin" legacyName="mqtt">
  {#if $mqttLastError}
    <div class="alert alert-danger small mb-3">{$mqttLastError}</div>
  {/if}

  <div class="row g-3">
    <div class="col-lg-5">
      <div class="card mb-3">
        <div class="card-header fw-bold d-flex justify-content-between align-items-center">
          <span>Subscribe</span>
          <span class="badge {statusBadge[$mqttStatus]}">{$mqttStatus}</span>
        </div>
        <div class="card-body">
          <div class="input-group input-group-sm mb-3">
            <input class="form-control font-monospace" bind:value={topicSub}
              onkeydown={(e) => e.key === 'Enter' && subscribeTopic(topicSub)} placeholder="topic.name or topic/+/wildcard" />
            <button type="button" class="btn btn-outline-theme" onclick={() => subscribeTopic(topicSub)}>
              <i class="bi bi-plus-lg"></i> Add
            </button>
          </div>

          <div class="text-body text-opacity-50 small mb-1">Active subscriptions</div>
          {#if activeTopics.length === 0}
            <div class="text-body text-opacity-50 small">— none —</div>
          {:else}
            <div class="d-flex flex-wrap gap-1 mb-3">
              {#each activeTopics as t}
                <span class="badge bg-theme bg-opacity-25 text-theme">
                  <code>{t}</code>
                  <button type="button" class="btn-close btn-close-white ms-1" style="font-size: 0.65em;" aria-label="Unsubscribe" onclick={() => unsubscribeTopic(t)}></button>
                </span>
              {/each}
            </div>
          {/if}
        </div>
        <div class="card-arrow">
          <div class="card-arrow-top-left"></div>
          <div class="card-arrow-top-right"></div>
          <div class="card-arrow-bottom-left"></div>
          <div class="card-arrow-bottom-right"></div>
        </div>
      </div>

      <div class="card">
        <div class="card-header fw-bold">Publish</div>
        <div class="card-body">
          <div class="mb-2">
            <label class="form-label small" for="topic-pub">Topic</label>
            <input id="topic-pub" class="form-control form-control-sm font-monospace" bind:value={topicPub} />
          </div>
          <div class="mb-2">
            <label class="form-label small" for="message-pub">Payload (JSON)</label>
            <textarea id="message-pub" class="form-control form-control-sm font-monospace" rows="8" bind:value={message}></textarea>
          </div>
          <button type="button" class="btn btn-outline-theme btn-sm" onclick={publish}>
            <i class="bi bi-send me-1"></i> Publish
          </button>
          {#if publishStatus}
            <div class="small text-body text-opacity-75 mt-2">{publishStatus}</div>
          {/if}
        </div>
        <div class="card-arrow">
          <div class="card-arrow-top-left"></div>
          <div class="card-arrow-top-right"></div>
          <div class="card-arrow-bottom-left"></div>
          <div class="card-arrow-bottom-right"></div>
        </div>
      </div>
    </div>

    <div class="col-lg-7">
      <div class="card h-100">
        <div class="card-header fw-bold d-flex justify-content-between align-items-center">
          <span>Incoming messages ({msgs.length})</span>
          <button type="button" class="btn btn-sm btn-outline-secondary" onclick={() => (msgs = [])}>
            <i class="bi bi-trash me-1"></i> Clear
          </button>
        </div>
        <div class="card-body p-0">
          <div class="border-top bg-black bg-opacity-25 p-2"
            style="max-height: 70vh; overflow-y: auto; font-family: var(--bs-font-monospace); font-size: 0.8rem; white-space: pre-wrap; word-break: break-word;">
            {#if msgs.length === 0}
              <div class="text-body text-opacity-50 p-3">— waiting for messages —</div>
            {:else}
              {#each msgs as m (m.t)}
                <div class="mb-3">
                  <div class="text-body text-opacity-50 small">
                    [{new Date(m.t).toLocaleTimeString()}]
                    <span class="text-theme ms-1">{m.topic}</span>
                  </div>
                  <pre class="mb-0 text-body text-opacity-75">{m.pretty}</pre>
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
