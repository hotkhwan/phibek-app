<!-- src/routes/(app)/biDash/+page.svelte
     Phase 6 placeholder — full klynx biDash is ~3.8k LOC (analytics + map +
     timeseries + camera grid). Defer the deep port; surface the underlying
     Metabase embed URL when present so users can still pull the BI tile up. -->
<script lang="ts">
  import { onDestroy, onMount } from 'svelte'
  import { env } from '$env/dynamic/public'
  import { setPageTitle } from '$lib/utils/title'
  import DomainStarter from '$lib/components/shared/DomainStarter.svelte'
  import { WS_TOPICS, type WsTopic } from '$lib/realtime/wsTopics'
  import { liveBadgeClass, liveBadgeLabel } from '$lib/realtime/liveStatus'
  import {
    subscribeWsTopic,
    wsHubLastError,
    wsHubStatus
  } from '$lib/stores/wsHub'
  import type {
    CameraStatusPayload,
    KControlStatusPayload,
    WssIngestEventPayload
  } from '$lib/types/realtime'
  import { m } from '$lib/i18n/messages'

  const metabase = $derived(env.PUBLIC_METABASE_EMBED_URL ?? '')

  type BiDashRealtimePayload = CameraStatusPayload | KControlStatusPayload | WssIngestEventPayload

  let realtimeDenied = $state('')
  let recent = $state<Array<{ key: string; topic: WsTopic; label: string; at: string }>>([])
  let unsubscribeRealtime: (() => void) | null = null
  const seen = new Set<string>()

  const counters = $derived({
    ingest: recent.filter((item) => item.topic === WS_TOPICS.INGEST_EVENT).length,
    blacklist: recent.filter((item) => item.topic === WS_TOPICS.INGEST_BLACKLIST).length,
    cameras: recent.filter((item) => item.topic === WS_TOPICS.CAMERA_STATUS).length,
    kcontrol: recent.filter((item) => item.topic === WS_TOPICS.KCONTROL_STATUS).length
  })

  function frameKey(topic: WsTopic, payload: BiDashRealtimePayload) {
    if (topic === WS_TOPICS.CAMERA_STATUS) {
      const data = payload as CameraStatusPayload
      return `${topic}:${data.cameraId}:${data.occurredAt}`
    }
    if (topic === WS_TOPICS.KCONTROL_STATUS) {
      const data = payload as KControlStatusPayload
      return `${topic}:${data.deviceId}:${data.evaluatedAt}`
    }
    const data = payload as WssIngestEventPayload
    return `${topic}:${data.eventId}:${data.occurredAt ?? ''}`
  }

  function frameLabel(topic: WsTopic, payload: BiDashRealtimePayload) {
    if (topic === WS_TOPICS.CAMERA_STATUS) {
      const data = payload as CameraStatusPayload
      return `${data.name || data.cameraId} ${data.prevState ?? 'unknown'} → ${data.status}`
    }
    if (topic === WS_TOPICS.KCONTROL_STATUS) {
      const data = payload as KControlStatusPayload
      return `${data.name || data.hwId || data.deviceId} ${data.prevStatus ?? 'unknown'} → ${data.status}`
    }
    const data = payload as WssIngestEventPayload
    return `${data.eventCategory || data.eventType || 'event'} ${data.eventId}`
  }

  function frameTime(topic: WsTopic, payload: BiDashRealtimePayload) {
    if (topic === WS_TOPICS.CAMERA_STATUS) return (payload as CameraStatusPayload).occurredAt
    if (topic === WS_TOPICS.KCONTROL_STATUS) return (payload as KControlStatusPayload).evaluatedAt
    return (payload as WssIngestEventPayload).occurredAt ?? new Date().toISOString()
  }

  function applyRealtime(topic: WsTopic, payload: BiDashRealtimePayload) {
    const key = frameKey(topic, payload)
    if (seen.has(key)) return
    seen.add(key)
    if (seen.size > 500) {
      const keep = Array.from(seen).slice(-250)
      seen.clear()
      for (const item of keep) seen.add(item)
    }

    recent = [{
      key,
      topic,
      label: frameLabel(topic, payload),
      at: frameTime(topic, payload)
    }, ...recent].slice(0, 24)
  }

  function startRealtime() {
    if (unsubscribeRealtime) return
    realtimeDenied = ''
    unsubscribeRealtime = subscribeWsTopic<BiDashRealtimePayload>(
      [WS_TOPICS.INGEST_EVENT, WS_TOPICS.INGEST_BLACKLIST, WS_TOPICS.CAMERA_STATUS, WS_TOPICS.KCONTROL_STATUS],
      (topic, _ts, payload) => applyRealtime(topic, payload),
      {
        onDenied: (topic, reason) => {
          realtimeDenied = `${topic} denied: ${reason}`
        }
      }
    )
  }

  onMount(() => {
    setPageTitle(m.navBiDash())
    startRealtime()
  })

  onDestroy(() => {
    unsubscribeRealtime?.()
  })
</script>

<DomainStarter title={m.navBiDash()} subtitle="Metabase / aggregated business intelligence" icon="bi-bar-chart" legacyName="biDash">
  <div class="card mb-3">
    <div class="card-header fw-bold d-flex justify-content-between align-items-center">
      <span>Realtime WSS monitor</span>
      <span class="badge {liveBadgeClass($wsHubStatus)}" title={$wsHubLastError ?? ''}>
        <i class="bi bi-broadcast me-1"></i>{liveBadgeLabel($wsHubStatus)}
      </span>
    </div>
    <div class="card-body">
      {#if realtimeDenied}
        <div class="alert alert-warning small py-2">{realtimeDenied}</div>
      {/if}
      <div class="row g-2 mb-3">
        <div class="col-sm-3 col-6"><div class="small text-body text-opacity-50">Ingest</div><div class="fs-4 fw-bold">{counters.ingest}</div></div>
        <div class="col-sm-3 col-6"><div class="small text-body text-opacity-50">Blacklist</div><div class="fs-4 fw-bold">{counters.blacklist}</div></div>
        <div class="col-sm-3 col-6"><div class="small text-body text-opacity-50">Cameras</div><div class="fs-4 fw-bold">{counters.cameras}</div></div>
        <div class="col-sm-3 col-6"><div class="small text-body text-opacity-50">kControl</div><div class="fs-4 fw-bold">{counters.kcontrol}</div></div>
      </div>
      {#if recent.length === 0}
        <div class="text-body text-opacity-50 small">Waiting for contract-backed live frames.</div>
      {:else}
        <div class="list-group list-group-flush">
          {#each recent as item (item.key)}
            <div class="list-group-item bg-transparent px-0 d-flex justify-content-between gap-3">
              <div>
                <span class="badge bg-secondary me-2">{item.topic}</span>
                <span>{item.label}</span>
              </div>
              <time class="small text-body text-opacity-50">{new Date(item.at).toLocaleTimeString()}</time>
            </div>
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
