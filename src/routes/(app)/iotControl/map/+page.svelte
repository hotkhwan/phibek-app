<!-- src/routes/(app)/iotControl/map/+page.svelte -->
<script lang="ts">
  import { onDestroy, onMount } from 'svelte'
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
    KControlAlarmPayload,
    KControlEventPayload,
    KControlStatusPayload
  } from '$lib/types/realtime'
  import { m } from '$lib/i18n/messages'

  type KControlMapPayload = KControlAlarmPayload | KControlEventPayload | KControlStatusPayload

  let recent = $state<Array<{ key: string; topic: WsTopic; label: string; at: string }>>([])
  let realtimeDenied = $state('')
  let unsubscribeRealtime: (() => void) | null = null
  const seen = new Set<string>()

  const counters = $derived({
    status: recent.filter((item) => item.topic === WS_TOPICS.KCONTROL_STATUS).length,
    alarms: recent.filter((item) => item.topic === WS_TOPICS.KCONTROL_ALARM).length,
    events: recent.filter((item) => item.topic === WS_TOPICS.KCONTROL_EVENT).length
  })

  function frameKey(topic: WsTopic, payload: KControlMapPayload) {
    if (topic === WS_TOPICS.KCONTROL_STATUS) {
      const data = payload as KControlStatusPayload
      return `${topic}:${data.deviceId}:${data.evaluatedAt}`
    }
    if (topic === WS_TOPICS.KCONTROL_ALARM) {
      const data = payload as KControlAlarmPayload
      return `${topic}:${data.alarmId}:${data.occurredAt ?? ''}`
    }
    const data = payload as KControlEventPayload
    return `${topic}:${data.eventId}:${data.occurredAt ?? ''}`
  }

  function frameLabel(topic: WsTopic, payload: KControlMapPayload) {
    if (topic === WS_TOPICS.KCONTROL_STATUS) {
      const data = payload as KControlStatusPayload
      return `${data.name || data.hwId || data.deviceId} ${data.prevStatus ?? 'unknown'} → ${data.status}`
    }
    if (topic === WS_TOPICS.KCONTROL_ALARM) {
      const data = payload as KControlAlarmPayload
      return `${data.name || data.hwId || data.deviceId || 'device'} ${data.alarmType ?? 'alarm'} ${data.severity ?? ''}`.trim()
    }
    const data = payload as KControlEventPayload
    return `${data.hwId || data.deviceId || 'device'} ${data.eventType ?? 'event'}`
  }

  function frameTime(topic: WsTopic, payload: KControlMapPayload) {
    if (topic === WS_TOPICS.KCONTROL_STATUS) return (payload as KControlStatusPayload).evaluatedAt
    if (topic === WS_TOPICS.KCONTROL_ALARM) return (payload as KControlAlarmPayload).occurredAt ?? new Date().toISOString()
    return (payload as KControlEventPayload).occurredAt ?? new Date().toISOString()
  }

  function applyRealtime(topic: WsTopic, payload: KControlMapPayload) {
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
    }, ...recent].slice(0, 30)
  }

  function startRealtime() {
    if (unsubscribeRealtime) return
    realtimeDenied = ''
    unsubscribeRealtime = subscribeWsTopic<KControlMapPayload>(
      [WS_TOPICS.KCONTROL_EVENT, WS_TOPICS.KCONTROL_ALARM, WS_TOPICS.KCONTROL_STATUS],
      (topic, _ts, payload) => applyRealtime(topic, payload),
      {
        onDenied: (topic, reason) => {
          realtimeDenied = `${topic} denied: ${reason}`
        }
      }
    )
  }

  onMount(() => {
    setPageTitle(`${m.navIotControl()} · ${m.navIotControlMap()}`)
    startRealtime()
  })

  onDestroy(() => {
    unsubscribeRealtime?.()
  })
</script>

<DomainStarter title={m.navIotControlMap()} subtitle="Sensor map view" icon="bi-map" legacyName="kcontrol/map">
  <div class="row g-3">
    <div class="col-xl-4">
      <div class="card h-100">
        <div class="card-header fw-bold d-flex justify-content-between align-items-center">
          <span>Live WSS</span>
          <span class="badge {liveBadgeClass($wsHubStatus)}" title={$wsHubLastError ?? ''}>
            {liveBadgeLabel($wsHubStatus)}
          </span>
        </div>
        <div class="card-body">
          {#if realtimeDenied}
            <div class="alert alert-warning small py-2">{realtimeDenied}</div>
          {/if}
          <div class="row g-2">
            <div class="col-4"><div class="small text-body text-opacity-50">Status</div><div class="fs-4 fw-bold">{counters.status}</div></div>
            <div class="col-4"><div class="small text-body text-opacity-50">Alarms</div><div class="fs-4 fw-bold">{counters.alarms}</div></div>
            <div class="col-4"><div class="small text-body text-opacity-50">Events</div><div class="fs-4 fw-bold">{counters.events}</div></div>
          </div>
          <div class="small text-body text-opacity-50 mt-3">
            Topics: <code>kcontrol.event</code> · <code>kcontrol.alarm</code> · <code>kcontrol.status</code>
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

    <div class="col-xl-8">
      <div class="card h-100">
        <div class="card-header fw-bold">Recent map events</div>
        <div class="card-body">
          {#if recent.length === 0}
            <div class="text-body text-opacity-50">Waiting for WSS frames.</div>
          {:else}
            <div class="list-group list-group-flush">
              {#each recent as item (item.key)}
                <div class="list-group-item px-0 bg-transparent d-flex justify-content-between gap-3">
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
    </div>
  </div>
</DomainStarter>
