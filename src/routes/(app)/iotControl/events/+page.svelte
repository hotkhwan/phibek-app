<!-- src/routes/(app)/iotControl/events/+page.svelte -->
<script lang="ts">
  import { onDestroy, onMount } from 'svelte'
  import { setPageTitle } from '$lib/utils/title'
  import DomainStarter from '$lib/components/shared/DomainStarter.svelte'
  import DataTableStarter from '$lib/components/shared/DataTableStarter.svelte'
  import { listEvents, type IotControlEvent } from '$lib/api/iotControl'
  import { WS_TOPICS } from '$lib/realtime/wsTopics'
  import { liveBadgeClass, liveBadgeLabel } from '$lib/realtime/liveStatus'
  import {
    subscribeWsTopic,
    wsHubLastError,
    wsHubStatus
  } from '$lib/stores/wsHub'
  import type { KControlEventPayload } from '$lib/types/realtime'
  import { m } from '$lib/i18n/messages'

  let rows = $state<IotControlEvent[]>([])
  let loading = $state(false)
  let errorMsg = $state('')
  let realtimeDenied = $state('')
  let lastRealtimeAt = $state<string | null>(null)
  let unsubscribeRealtime: (() => void) | null = null
  let realtimeReloadTimer: ReturnType<typeof setTimeout> | null = null
  const seenEvents = new Set<string>()

  async function load() {
    loading = true
    const { data, error } = await listEvents({ perPage: 50 })
    loading = false
    if (error) errorMsg = error.message
    rows = data?.details?.items ?? []
  }

  function scheduleRealtimeReload() {
    if (realtimeReloadTimer) clearTimeout(realtimeReloadTimer)
    realtimeReloadTimer = setTimeout(() => {
      realtimeReloadTimer = null
      void load()
    }, 1200)
  }

  function eventToRow(payload: KControlEventPayload): IotControlEvent | null {
    if (!payload?.eventId) return null
    return {
      id: payload.eventId,
      deviceId: payload.deviceId ?? payload.hwId,
      type: payload.eventType,
      payload: payload.data,
      occurredAt: payload.occurredAt
    }
  }

  function applyRealtimeEvent(payload: KControlEventPayload) {
    const row = eventToRow(payload)
    if (!row?.id) return
    if (seenEvents.has(row.id)) return
    seenEvents.add(row.id)
    if (seenEvents.size > 500) {
      const keep = Array.from(seenEvents).slice(-250)
      seenEvents.clear()
      for (const key of keep) seenEvents.add(key)
    }

    lastRealtimeAt = payload.occurredAt ?? new Date().toISOString()
    rows = [row, ...rows.filter((item) => item.id !== row.id)].slice(0, 50)
    scheduleRealtimeReload()
  }

  function startRealtime() {
    if (unsubscribeRealtime) return
    realtimeDenied = ''
    unsubscribeRealtime = subscribeWsTopic<KControlEventPayload>(
      [WS_TOPICS.KCONTROL_EVENT],
      (_topic, _ts, payload) => applyRealtimeEvent(payload),
      {
        onDenied: (topic, reason) => {
          realtimeDenied = `${topic} denied: ${reason}`
        }
      }
    )
  }

  function stopRealtime() {
    unsubscribeRealtime?.()
    unsubscribeRealtime = null
    if (realtimeReloadTimer) clearTimeout(realtimeReloadTimer)
    realtimeReloadTimer = null
  }

  onMount(() => {
    setPageTitle(`${m.navIotControl()} · ${m.navIotControlEvents()}`)
    startRealtime()
    load()
  })

  onDestroy(() => {
    stopRealtime()
  })

  const columns = [
    { key: 'id', label: 'Event ID' },
    { key: 'deviceId', label: 'Device' },
    { key: 'type', label: 'Type' },
    {
      key: 'occurredAt',
      label: 'Occurred',
      accessor: (r: IotControlEvent) => (r.occurredAt ? new Date(r.occurredAt).toLocaleString() : '—')
    }
  ]
</script>

<DomainStarter title={m.navIotControlEvents()} subtitle="kcontrol event stream" icon="bi-collection" legacyName="kcontrol/events">
  <div class="d-flex flex-wrap justify-content-end align-items-center gap-2 mb-3">
    <span class="badge {liveBadgeClass($wsHubStatus)}" title={$wsHubLastError ?? ''}>
      <i class="bi bi-broadcast me-1"></i>{liveBadgeLabel($wsHubStatus)}
    </span>
    {#if lastRealtimeAt}
      <span class="small text-body text-opacity-50">last {new Date(lastRealtimeAt).toLocaleTimeString()}</span>
    {/if}
    <button type="button" class="btn btn-outline-theme btn-sm" onclick={load} disabled={loading}>
      <i class="bi bi-arrow-clockwise me-1"></i> Refresh
    </button>
  </div>
  {#if realtimeDenied}
    <div class="alert alert-warning small py-2">{realtimeDenied}</div>
  {/if}
  <DataTableStarter {columns} {rows} {loading} error={errorMsg} emptyText="No events" />
</DomainStarter>
