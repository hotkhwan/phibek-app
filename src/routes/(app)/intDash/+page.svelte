<!-- src/routes/(app)/intDash/+page.svelte -->
<script lang="ts">
  import { onDestroy, onMount } from 'svelte'
  import { setPageTitle } from '$lib/utils/title'
  import DomainStarter from '$lib/components/shared/DomainStarter.svelte'
  import {
    fetchIngestDashboard,
    listIngestEvents,
    type IngestDashboard,
    type IngestEvent
  } from '$lib/api/klynxIngest'
  import { WS_TOPICS } from '$lib/realtime/wsTopics'
  import {
    subscribeWsTopic,
    wsHubLastError,
    wsHubStatus,
    type LiveStatus
  } from '$lib/stores/wsHub'
  import type { WssIngestEventPayload } from '$lib/types/realtime'

  type Severity = 'high' | 'medium' | 'low' | 'info' | 'none'
  type EventWithSeverity = IngestEvent & { severity?: string }
  type RealtimeMessage = {
    key: string
    topic: string
    eventId: string
    label: string
    severity: Severity
    device: string
    occurredAt?: string
    receivedAt: string
    location?: WssIngestEventPayload['location']
  }

  let dashboard = $state<IngestDashboard | null>(null)
  let events = $state<IngestEvent[]>([])
  let loading = $state(false)
  let errorMsg = $state('')
  let lastUpdatedAt = $state<Date | null>(null)
  let realtimeDenied = $state('')
  let lastRealtimeAt = $state<string | null>(null)
  let realtimeMessages = $state<RealtimeMessage[]>([])
  let unsubscribeRealtime: (() => void) | null = null
  let realtimeReloadTimer: ReturnType<typeof setTimeout> | null = null
  const seenRealtimeEvents = new Set<string>()

  const latestEvents = $derived(events.slice(0, 10))
  const latestRealtimeMessages = $derived(realtimeMessages.slice(0, 8))
  const highSeverityCount = $derived(events.filter((event) => eventSeverity(event) === 'high').length)
  const kpis = $derived([
    {
      label: 'เหตุการณ์ทั้งหมด',
      value: dashboard?.totals?.events24h ?? events.length,
      hint: 'สะสมในช่วง 24 ชั่วโมงล่าสุด',
      icon: 'bi-activity',
      tone: 'theme'
    },
    {
      label: 'เหตุการณ์รุนแรง',
      value: highSeverityCount,
      hint: 'severity = high ในหน้าต่างล่าสุด',
      icon: 'bi-exclamation-triangle',
      tone: 'danger'
    },
    {
      label: 'กล้อง AI ที่รายงาน',
      value: dashboard?.totals?.devicesReporting ?? 0,
      hint: 'อุปกรณ์ที่ส่ง event เข้า gateway',
      icon: 'bi-camera-video',
      tone: 'info'
    },
    {
      label: 'เหตุการณ์นาทีล่าสุด',
      value: dashboard?.totals?.eventsMinute ?? 0,
      hint: 'normalized events ต่อนาที',
      icon: 'bi-lightning-charge',
      tone: 'warning'
    }
  ])

  async function load() {
    loading = true
    errorMsg = ''

    try {
      const [dashboardResult, eventsResult] = await Promise.all([
        fetchIngestDashboard(),
        listIngestEvents({ page: 1, perPage: 20 })
      ])

      dashboard = dashboardResult.data?.details ?? null
      events = eventsResult.data?.details?.items ?? []

      if (dashboardResult.error || eventsResult.error) {
        errorMsg = dashboardResult.error?.message ?? eventsResult.error?.message ?? ''
      }

      lastUpdatedAt = new Date()
    } catch (err) {
      errorMsg = err instanceof Error ? err.message : 'Unable to load intelligence dashboard'
    } finally {
      loading = false
    }
  }

  function normalizeSeverity(value: unknown): Severity {
    const normalized = typeof value === 'string' ? value.toLowerCase() : ''
    if (normalized === 'high' || normalized === 'medium' || normalized === 'low' || normalized === 'info') {
      return normalized
    }
    return 'none'
  }

  function payloadValue(event: IngestEvent, key: string) {
    return event.payload?.[key] ?? event.detail?.payload?.[key]
  }

  function eventSeverity(event: IngestEvent): Severity {
    return normalizeSeverity(
      (event as EventWithSeverity).severity ??
        payloadValue(event, 'severity') ??
        payloadValue(event, 'level')
    )
  }

  function eventLabel(event: IngestEvent) {
    return event.eventType ?? event.type ?? event.eventCategory ?? '(unspecified)'
  }

  function eventDevice(event: IngestEvent) {
    return event.deviceName ?? event.deviceId ?? event.source ?? event.sourceFamily ?? '-'
  }

  function eventLocationLabel(location?: WssIngestEventPayload['location']) {
    if (!location) return ''
    return `${location.lat.toFixed(5)}, ${location.lng.toFixed(5)}`
  }

  function formatCount(value: number | undefined | null) {
    return Number(value ?? 0).toLocaleString('en-US')
  }

  function formatTime(value?: string) {
    if (!value) return '-'
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return value
    return date.toLocaleTimeString('th-TH', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    })
  }

  function severityClass(severity: Severity) {
    return `intdash-severity intdash-severity-${severity}`
  }

  function pruneSeenEvents() {
    if (seenRealtimeEvents.size <= 500) return
    const keep = Array.from(seenRealtimeEvents).slice(-250)
    seenRealtimeEvents.clear()
    for (const key of keep) seenRealtimeEvents.add(key)
  }

  function wssEventToIngestEvent(data: WssIngestEventPayload): IngestEvent | null {
    if (!data?.eventId) return null
    return {
      id: data.eventId,
      eventId: data.eventId,
      eventType: data.eventType,
      type: data.eventType,
      eventCategory: data.eventCategory,
      eventAction: data.eventAction,
      sourceFamily: data.sourceFamily,
      source: data.sourceFamily,
      deviceId: data.deviceId,
      occurredAt: data.occurredAt,
      severity: data.severity,
      eventClass: data.eventClass,
      location: data.location
    }
  }

  function scheduleRealtimeReload() {
    if (realtimeReloadTimer) clearTimeout(realtimeReloadTimer)
    realtimeReloadTimer = setTimeout(() => {
      realtimeReloadTimer = null
      void load()
    }, 1200)
  }

  function applyRealtimeEvent(topic: string, data: WssIngestEventPayload) {
    const event = wssEventToIngestEvent(data)
    if (!event?.eventId) return
    const receivedAt = new Date().toISOString()
    const severity = eventSeverity(event)
    const messageKey = `${topic}:${event.eventId}:${receivedAt}`

    lastRealtimeAt = receivedAt
    realtimeMessages = [
      {
        key: messageKey,
        topic,
        eventId: event.eventId,
        label: eventLabel(event),
        severity,
        device: eventDevice(event),
        occurredAt: event.occurredAt,
        receivedAt,
        location: data.location
      },
      ...realtimeMessages
    ].slice(0, 25)

    if (seenRealtimeEvents.has(event.eventId)) {
      scheduleRealtimeReload()
      return
    }
    seenRealtimeEvents.add(event.eventId)
    pruneSeenEvents()

    events = [
      event,
      ...events.filter((item) => (item.eventId ?? item.id) !== event.eventId)
    ].slice(0, 20)
    scheduleRealtimeReload()
  }

  function startRealtime() {
    if (unsubscribeRealtime) return
    realtimeDenied = ''
    unsubscribeRealtime = subscribeWsTopic<WssIngestEventPayload>(
      [WS_TOPICS.INGEST_EVENT, WS_TOPICS.INGEST_BLACKLIST],
      (topic, _ts, payload) => applyRealtimeEvent(topic, payload),
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

  function liveBadgeClass(status: LiveStatus) {
    if (status === 'on') return 'bg-success bg-opacity-25 text-success'
    if (status === 'reconnecting') return 'bg-warning text-dark'
    if (status === 'error') return 'bg-danger'
    return 'bg-secondary'
  }

  function liveBadgeLabel(status: LiveStatus) {
    if (status === 'on') return 'LIVE'
    if (status === 'reconnecting') return 'Syncing'
    if (status === 'error') return 'WSS error'
    return 'REST'
  }

  onMount(() => {
    setPageTitle('AI Event Intelligence')
    startRealtime()
    void load()
  })

  onDestroy(() => {
    stopRealtime()
  })
</script>

<DomainStarter
  title="AI Event Intelligence"
  subtitle="ภาพรวมเหตุการณ์จากกล้อง AI และ Edge AI"
  icon="bi-activity"
  legacyName="intDash"
>
  <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
    <div class="text-body text-opacity-50 small">
      อัปเดตล่าสุด {lastUpdatedAt ? formatTime(lastUpdatedAt.toISOString()) : '-'}
    </div>
    <div class="d-flex align-items-center gap-2">
      <span class="badge bg-warning text-dark">Beta</span>
      <span class="badge {liveBadgeClass($wsHubStatus)}" title={$wsHubLastError ?? ''}>
        <i class="bi bi-broadcast me-1"></i>{liveBadgeLabel($wsHubStatus)}
      </span>
      <span class="badge bg-dark text-body text-opacity-75 border border-secondary">
        WSS {lastRealtimeAt ? formatTime(lastRealtimeAt) : '-'}
      </span>
      <button type="button" class="btn btn-outline-theme btn-sm" onclick={load} disabled={loading}>
        <i class="bi bi-arrow-clockwise me-1"></i>{loading ? 'Loading...' : 'Refresh'}
      </button>
    </div>
  </div>

  {#if errorMsg}
    <div class="alert alert-danger small mb-3">{errorMsg}</div>
  {/if}
  {#if realtimeDenied}
    <div class="alert alert-warning small mb-3">{realtimeDenied}</div>
  {/if}

  <div class="row g-3 mb-4">
    {#each kpis as kpi}
      <div class="col-xl-3 col-md-6">
        <div class="card h-100 intdash-kpi">
          <div class="card-body">
            <div class="d-flex align-items-center gap-2 mb-2">
              <i class="bi {kpi.icon} intdash-kpi-icon intdash-tone-{kpi.tone}"></i>
              <div class="text-body text-opacity-50 small fw-semibold">{kpi.label}</div>
            </div>
            <div class="display-6 fw-bold">{formatCount(kpi.value)}</div>
            <div class="text-body text-opacity-50 small">{kpi.hint}</div>
          </div>
          <div class="card-arrow">
            <div class="card-arrow-top-left"></div>
            <div class="card-arrow-top-right"></div>
            <div class="card-arrow-bottom-left"></div>
            <div class="card-arrow-bottom-right"></div>
          </div>
        </div>
      </div>
    {/each}
  </div>

  <div class="row g-3">
    <div class="col-xl-8">
      <div class="card h-100">
        <div class="card-body">
          <div class="d-flex justify-content-between align-items-center mb-3">
            <div class="fw-bold">เรียลไทม์ AI events</div>
            <div class="small text-body text-opacity-50">{formatCount(events.length)} รายการล่าสุด</div>
          </div>

          <div class="intdash-event-stream">
            {#if loading && events.length === 0}
              <div class="text-center text-body text-opacity-50 py-5">Loading events...</div>
            {:else if latestEvents.length === 0}
              <div class="text-center text-body text-opacity-50 py-5">ยังไม่มีเหตุการณ์ในช่วงล่าสุด</div>
            {:else}
              {#each latestEvents as event (event.eventId ?? event.id)}
                {@const severity = eventSeverity(event)}
                <div class="intdash-event-row">
                  <span class={severityClass(severity)}></span>
                  <div class="min-w-0">
                    <div class="fw-semibold text-truncate">{eventLabel(event)}</div>
                    <div class="text-body text-opacity-50 small text-truncate">{eventDevice(event)}</div>
                  </div>
                  <div class="ms-auto text-end small">
                    <div class="text-body text-opacity-75">{formatTime(event.occurredAt)}</div>
                    <div class="text-body text-opacity-50">{severity}</div>
                  </div>
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

    <div class="col-xl-4">
      <div class="card h-100">
        <div class="card-body">
          <div class="fw-bold mb-3">สรุป ingest</div>
          <div class="intdash-summary-line">
            <span>24 ชั่วโมง</span>
            <strong>{formatCount(dashboard?.totals?.events24h)}</strong>
          </div>
          <div class="intdash-summary-line">
            <span>1 ชั่วโมง</span>
            <strong>{formatCount(dashboard?.totals?.eventsHour)}</strong>
          </div>
          <div class="intdash-summary-line">
            <span>Rejected</span>
            <strong>{formatCount(dashboard?.rejected)}</strong>
          </div>

          <div class="fw-bold mt-4 mb-2">ประเภทเหตุการณ์</div>
          {#if dashboard?.byType?.length}
            <div class="d-grid gap-2">
              {#each dashboard.byType.slice(0, 6) as item}
                <div class="intdash-type-row">
                  <span class="text-truncate">{item.key}</span>
                  <strong>{formatCount(item.value)}</strong>
                </div>
              {/each}
            </div>
          {:else}
            <div class="text-body text-opacity-50 small">ยังไม่มีข้อมูลประเภทเหตุการณ์</div>
          {/if}

          <div class="fw-bold mt-4 mb-2">Realtime WSS messages</div>
          <div class="intdash-wss-feed">
            {#if latestRealtimeMessages.length === 0}
              <div class="text-body text-opacity-50 small py-2">รอข้อความจาก ingest.event / ingest.blacklist</div>
            {:else}
              {#each latestRealtimeMessages as message (message.key)}
                <div class="intdash-wss-row">
                  <span class={severityClass(message.severity)}></span>
                  <div class="min-w-0">
                    <div class="d-flex align-items-center gap-2">
                      <span class="badge bg-theme text-black">{message.topic}</span>
                      <span class="small text-body text-opacity-50">{formatTime(message.receivedAt)}</span>
                    </div>
                    <div class="fw-semibold text-truncate mt-1">{message.label}</div>
                    <div class="small text-body text-opacity-50 text-truncate">
                      {message.device}
                      {#if eventLocationLabel(message.location)}
                        · {eventLocationLabel(message.location)}
                      {/if}
                    </div>
                  </div>
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

<style>
  .intdash-kpi-icon {
    font-size: 1.15rem;
  }

  .intdash-tone-theme {
    color: var(--bs-theme);
  }

  .intdash-tone-danger {
    color: var(--bs-danger);
  }

  .intdash-tone-info {
    color: var(--bs-info);
  }

  .intdash-tone-warning {
    color: var(--bs-warning);
  }

  .intdash-event-stream {
    min-height: 31rem;
  }

  .intdash-wss-feed {
    display: grid;
    gap: 0.75rem;
  }

  .intdash-event-row,
  .intdash-wss-row,
  .intdash-summary-line,
  .intdash-type-row {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    min-height: 3.5rem;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  }

  .intdash-wss-row {
    align-items: flex-start;
    min-height: 4.25rem;
    padding-bottom: 0.75rem;
  }

  .intdash-type-row,
  .intdash-summary-line {
    justify-content: space-between;
    min-height: 2.5rem;
  }

  .intdash-severity {
    width: 0.7rem;
    height: 0.7rem;
    border-radius: 999px;
    flex: 0 0 auto;
    background: var(--bs-secondary);
  }

  .intdash-severity-high {
    background: var(--bs-danger);
    box-shadow: 0 0 0 0.3rem rgba(var(--bs-danger-rgb), 0.12);
  }

  .intdash-severity-medium {
    background: var(--bs-warning);
  }

  .intdash-severity-low {
    background: var(--bs-info);
  }

  .intdash-severity-info {
    background: var(--bs-primary);
  }

  .intdash-severity-none {
    background: var(--bs-secondary);
  }
</style>
