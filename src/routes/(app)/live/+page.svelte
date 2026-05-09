<!-- src/routes/(app)/live/+page.svelte
     Phase 3 smoke surface — wire MQTT connect status + media player URL probe.
     Real /live (camera grid) lands in Phase 5 (full domain shell). -->
<script lang="ts">
  import { onMount } from 'svelte'
  import { setPageTitle } from '$lib/utils/title'
  import {
    getMqttClient,
    subscribeMqtt,
    decodeJson,
    mqttStatus,
    mqttLastError,
    type MqttStatus
  } from '$lib/stores/mqtt'
  import VideoPlayer from '$lib/components/shared/VideoPlayer.svelte'
  import HlsPlayer from '$lib/components/shared/HlsPlayer.svelte'
  import FlvPlayer from '$lib/components/shared/FlvPlayer.svelte'
  import WebRTCPlayer from '$lib/components/shared/WebRTCPlayer.svelte'
  import { notify } from '$lib/stores/notify'

  let topic = $state('kcontrol.health')
  let logs = $state<Array<{ t: number; topic: string; preview: string }>>([])
  let unsub = $state<(() => void) | null>(null)

  let url = $state('')
  let kind = $state<'auto' | 'hls' | 'flv' | 'webrtc'>('auto')
  let activeUrl = $state<string | null>(null)
  let activeKind = $state<'hls' | 'flv' | 'webrtc' | null>(null)

  let flvRef: { start: (u: string) => void; stop: () => void } | null = $state(null)
  let webrtcRef: { start: (u: string) => void; stop: () => void } | null = $state(null)

  const statusBadgeClass: Record<MqttStatus, string> = {
    idle: 'bg-secondary',
    connecting: 'bg-warning text-dark',
    connected: 'bg-success',
    reconnecting: 'bg-warning text-dark',
    offline: 'bg-secondary',
    error: 'bg-danger',
    closed: 'bg-secondary'
  }

  async function connectMqtt() {
    const c = await getMqttClient()
    if (!c) {
      notify.warning('MQTT', 'PUBLIC_MQTT_URL not configured')
    }
  }

  function startSubscribe() {
    if (unsub) unsub()
    logs = []
    unsub = subscribeMqtt(topic.split(',').map((t) => t.trim()).filter(Boolean), (t, payload) => {
      const json = decodeJson(payload)
      const preview = json
        ? JSON.stringify(json).slice(0, 120)
        : new TextDecoder().decode(payload).slice(0, 120)
      logs = [{ t: Date.now(), topic: t, preview }, ...logs].slice(0, 30)
    })
  }

  function stopSubscribe() {
    unsub?.()
    unsub = null
  }

  function play() {
    activeUrl = url
    activeKind = kind === 'auto' ? null : kind
    queueMicrotask(() => {
      if (kind === 'flv') flvRef?.start(url)
      if (kind === 'webrtc') webrtcRef?.start(url)
    })
  }

  function stopPlayer() {
    flvRef?.stop()
    webrtcRef?.stop()
    activeUrl = null
    activeKind = null
  }

  onMount(() => {
    setPageTitle('Live · Phase 3 smoke')
    connectMqtt()
    return () => {
      stopSubscribe()
      stopPlayer()
    }
  })
</script>

<div class="container-xxl p-3 p-lg-4">
  <h1 class="page-header mb-1 fw-bold">Live · Phase 3 smoke</h1>
  <div class="text-body text-opacity-50 small mb-4">
    Verify MQTT connect/subscribe + media player wiring against klynx-api.
  </div>

  <div class="row g-3">
    <div class="col-lg-5">
      <div class="card h-100">
        <div class="card-header fw-bold d-flex justify-content-between align-items-center">
          <span>MQTT</span>
          <span class="badge {statusBadgeClass[$mqttStatus]}">{$mqttStatus}</span>
        </div>
        <div class="card-body">
          {#if $mqttLastError}
            <div class="alert alert-danger small">{$mqttLastError}</div>
          {/if}

          <div class="mb-3">
            <label class="form-label" for="mqtt-topic">Topic(s) — comma separated, supports `+` and `#`</label>
            <input
              id="mqtt-topic"
              class="form-control"
              bind:value={topic}
              placeholder="kcontrol.alarms,kcontrol.health"
            />
          </div>

          <div class="d-flex gap-2 mb-3">
            <button type="button" class="btn btn-outline-theme btn-sm" onclick={startSubscribe} disabled={!topic}>
              <i class="bi bi-broadcast me-1"></i> Subscribe
            </button>
            <button type="button" class="btn btn-outline-secondary btn-sm" onclick={stopSubscribe} disabled={!unsub}>
              <i class="bi bi-stop me-1"></i> Stop
            </button>
          </div>

          <div class="text-body text-opacity-50 small mb-1">Recent messages:</div>
          <div class="border rounded bg-black bg-opacity-25 p-2" style="max-height: 280px; overflow-y: auto; font-family: var(--bs-font-monospace); font-size: 0.75rem;">
            {#if logs.length === 0}
              <div class="text-body text-opacity-50">— no messages yet —</div>
            {:else}
              {#each logs as l (l.t)}
                <div class="mb-1">
                  <span class="text-body text-opacity-50">[{new Date(l.t).toLocaleTimeString()}]</span>
                  <span class="text-theme">{l.topic}</span>
                  <span class="text-body text-opacity-75">{l.preview}</span>
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

    <div class="col-lg-7">
      <div class="card h-100">
        <div class="card-header fw-bold">Media player</div>
        <div class="card-body">
          <div class="row g-2 mb-3">
            <div class="col-md-9">
              <label class="form-label" for="player-url">Stream URL</label>
              <input
                id="player-url"
                class="form-control"
                bind:value={url}
                placeholder="https://…/live/cam-1.flv  or  …/index.m3u8  or  webrtc URL"
              />
            </div>
            <div class="col-md-3">
              <label class="form-label" for="player-kind">Kind</label>
              <select id="player-kind" class="form-select" bind:value={kind}>
                <option value="auto">Auto</option>
                <option value="hls">HLS</option>
                <option value="flv">FLV</option>
                <option value="webrtc">WebRTC (ZLM)</option>
              </select>
            </div>
          </div>

          <div class="d-flex gap-2 mb-3">
            <button type="button" class="btn btn-outline-theme btn-sm" onclick={play} disabled={!url}>
              <i class="bi bi-play-fill me-1"></i> Play
            </button>
            <button type="button" class="btn btn-outline-secondary btn-sm" onclick={stopPlayer}>
              <i class="bi bi-stop me-1"></i> Stop
            </button>
          </div>

          <div class="ratio ratio-16x9 bg-black rounded overflow-hidden">
            {#if activeUrl}
              {#if activeKind === 'hls' || (activeKind === null && kind === 'auto')}
                {#if kind === 'auto'}
                  <VideoPlayer source={activeUrl} class="w-100 h-100" autoplay muted />
                {:else}
                  <HlsPlayer source={activeUrl} class="w-100 h-100" autoplay muted controls />
                {/if}
              {:else if activeKind === 'flv'}
                <FlvPlayer bind:this={flvRef} class="w-100 h-100" autoplay muted />
              {:else if activeKind === 'webrtc'}
                <WebRTCPlayer bind:this={webrtcRef} class="w-100 h-100" autoplay muted />
              {/if}
            {:else}
              <div class="d-flex align-items-center justify-content-center text-body text-opacity-50">
                — no stream —
              </div>
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
</div>
