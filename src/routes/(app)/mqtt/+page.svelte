<!-- src/routes/(app)/mqtt/+page.svelte
     Full port of klynx pages/mqtt.vue — MQTT test console using the shared
     subscribeMqtt store. -->
<script lang="ts">
  import { onMount, onDestroy } from 'svelte'
  import { setPageTitle } from '$lib/utils/title'
  import DomainStarter from '$lib/components/shared/DomainStarter.svelte'
  import {
    getMqttClient,
    getMqttConfig,
    setMqttUrlOverride,
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
  let brokerUrl = $state('')
  let brokerStatus = $state('')
  let brokerBusy = $state(false)

  const subscriptions = new Map<string, () => void>()
  let mqttConfig = $state(getMqttConfig())
  const brokerStorageKey = 'phibek:mqtt:broker-url'

  function brokerSourceLabel() {
    switch (mqttConfig.source) {
      case 'runtime':
        return 'manual'
      case 'PUBLIC_MQTT_URL':
        return 'PUBLIC_MQTT_URL'
      case 'NUXT_PUBLIC_MQTT_URL':
        return 'NUXT_PUBLIC_MQTT_URL'
      default:
        return 'not configured'
    }
  }

  function refreshMqttConfig() {
    mqttConfig = getMqttConfig()
    brokerUrl = mqttConfig.url ?? ''
  }

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
    if (!trimmed) return
    if (!subscriptions.has(trimmed)) {
      const unsub = subscribeMqtt(trimmed, handleMessage)
      subscriptions.set(trimmed, unsub)
    }
    if (!activeTopics.includes(trimmed)) {
      activeTopics = [...activeTopics, trimmed]
    }
  }

  function unsubscribeTopic(t: string) {
    const fn = subscriptions.get(t)
    if (fn) {
      fn()
      subscriptions.delete(t)
    }
    activeTopics = activeTopics.filter((x) => x !== t)
  }

  function clearSubscriptions() {
    for (const fn of subscriptions.values()) fn()
    subscriptions.clear()
  }

  async function connectActiveTopics() {
    await getMqttClient()
    for (const t of activeTopics) subscribeTopic(t)
  }

  async function applyBrokerUrl() {
    brokerStatus = ''
    brokerBusy = true
    try {
      const nextUrl = brokerUrl.trim()
      await setMqttUrlOverride(nextUrl || undefined)
      clearSubscriptions()
      if (nextUrl) {
        localStorage.setItem(brokerStorageKey, nextUrl)
      } else {
        localStorage.removeItem(brokerStorageKey)
      }
      refreshMqttConfig()
      msgs = []
      await connectActiveTopics()
      brokerStatus = nextUrl ? `Connected via ${brokerSourceLabel()}` : 'Connected via env default'
    } catch (err) {
      refreshMqttConfig()
      brokerStatus = (err as Error)?.message ?? String(err)
    } finally {
      brokerBusy = false
    }
  }

  async function resetBrokerUrl() {
    brokerUrl = ''
    await applyBrokerUrl()
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
    const savedUrl = localStorage.getItem(brokerStorageKey)?.trim()
    void (async () => {
      if (savedUrl) {
        try {
          await setMqttUrlOverride(savedUrl)
        } catch {
          localStorage.removeItem(brokerStorageKey)
        }
      }
      refreshMqttConfig()
      await connectActiveTopics()
    })()
  })

  onDestroy(() => {
    clearSubscriptions()
  })
</script>

<DomainStarter title={m.navMqttConsole()} subtitle="Subscribe + publish test console" icon="bi-broadcast-pin" legacyName="mqtt">
  <div class="card mb-3">
    <div class="card-header fw-bold d-flex justify-content-between align-items-center">
      <span>Broker</span>
      <span class="badge {statusBadge[$mqttStatus]}">{$mqttStatus}</span>
    </div>
    <div class="card-body">
      <div class="input-group input-group-sm">
        <input
          class="form-control font-monospace"
          bind:value={brokerUrl}
          onkeydown={(e) => e.key === 'Enter' && void applyBrokerUrl()}
          placeholder="wss://istio.k-lynx.com/mqtt"
          aria-label="MQTT broker URL"
        />
        <button type="button" class="btn btn-outline-theme" disabled={brokerBusy} onclick={applyBrokerUrl}>
          <i class="bi bi-plug me-1"></i> Connect
        </button>
        <button type="button" class="btn btn-outline-secondary" disabled={brokerBusy} onclick={resetBrokerUrl} title="Use env default">
          <i class="bi bi-arrow-counterclockwise"></i>
        </button>
      </div>
      <div class="small text-body text-opacity-50 mt-2">
        Current:
        {#if mqttConfig.url}
          <code>{mqttConfig.url}</code>
          <span class="ms-1">via {brokerSourceLabel()}</span>
        {:else}
          <span>PUBLIC_MQTT_URL / NUXT_PUBLIC_MQTT_URL not configured</span>
        {/if}
      </div>
      {#if brokerStatus}
        <div class="small text-body text-opacity-75 mt-2">{brokerStatus}</div>
      {/if}
    </div>
    <div class="card-arrow">
      <div class="card-arrow-top-left"></div>
      <div class="card-arrow-top-right"></div>
      <div class="card-arrow-bottom-left"></div>
      <div class="card-arrow-bottom-right"></div>
    </div>
  </div>

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
