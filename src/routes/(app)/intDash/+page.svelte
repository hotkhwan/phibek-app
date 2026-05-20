<!-- src/routes/(app)/intDash/+page.svelte -->
<script lang="ts">
  import { onDestroy, onMount } from 'svelte'
  import { setPageTitle } from '$lib/utils/title'
  import DomainStarter from '$lib/components/shared/DomainStarter.svelte'
  import ProtectedImage from '$lib/components/shared/ProtectedImage.svelte'
  import IntDashMap from '$lib/components/intDash/IntDashMap.svelte'
  import {
    countCameras,
    countIngestEvents,
    fetchIngestAggregate,
    listIngestEvents,
    type IngestEvent,
    type IngestPictureCoordinate
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
  type Timeline = {
    buckets: string[]
    series: Record<Severity, number[]>
  }
  type Analytics = {
    timeline: Timeline
    topDevices: Array<{ name: string; count: number }>
    cameraHealth: { online: number | null; offline: number | null }
    categories: Array<{ name: string; count: number }>
  }

  const FEED_LIMIT = 20
  const ANALYTICS_LIMIT = 200
  const TIMELINE_BUCKETS = 12
  const TIMELINE_BUCKET_MINUTES = 5
  const severityOrder: Severity[] = ['high', 'medium', 'low', 'info', 'none']
  const severityLabels: Record<Severity, string> = {
    high: 'รุนแรง',
    medium: 'ปานกลาง',
    low: 'ต่ำ',
    info: 'ข้อมูล',
    none: 'ไม่ระบุ'
  }

  let events = $state<IngestEvent[]>([])
  let analyticsEvents = $state<IngestEvent[]>([])
  let totalEvents = $state<number | null>(null)
  let highSeverity = $state<number | null>(null)
  let eventsToday = $state<number | null>(null)
  let aiCamerasReporting = $state<number | null>(null)
  let aiAccuracy = $state<number | null>(null)
  let cameraHealth = $state<{ online: number | null; offline: number | null }>({ online: null, offline: null })
  let loading = $state(false)
  let errorMsg = $state('')
  let lastUpdatedAt = $state<Date | null>(null)
  let realtimeDenied = $state('')
  let unsubscribeRealtime: (() => void) | null = null
  let refreshTimer: ReturnType<typeof setTimeout> | null = null
  let lightboxIndex = $state<number | null>(null)
  const seenRealtimeEvents = new Set<string>()

  const mapEvents = $derived(analyticsEvents.filter((event) => !!eventLocation(event)).slice(0, 200))
  const analytics = $derived(buildAnalytics(analyticsEvents))
  const lightboxEvent = $derived(lightboxIndex === null ? null : events[lightboxIndex] ?? null)

  function startOfTodayISO() {
    const date = new Date()
    date.setHours(0, 0, 0, 0)
    return date.toISOString()
  }

  async function load() {
    loading = true
    errorMsg = ''
    try {
      const today = startOfTodayISO()
      const [totalRes, highRes, todayRes, aggregateRes, feedRes, analyticsRes, onlineRes, offlineRes] =
        await Promise.all([
          countIngestEvents(),
          countIngestEvents({ severity: 'high' }),
          countIngestEvents({ from: today }),
          fetchIngestAggregate({ from: today, bucket: '1h' }),
          listIngestEvents({ page: 1, perPage: FEED_LIMIT, sortOrder: 'desc' }),
          listIngestEvents({ page: 1, perPage: ANALYTICS_LIMIT, sortOrder: 'desc' }),
          countCameras({ monitorState: 'online' }),
          countCameras({ monitorState: 'offline' })
        ])

      totalEvents = totalRes.data?.pagination?.totalRecords ?? null
      highSeverity = highRes.data?.pagination?.totalRecords ?? null
      eventsToday = todayRes.data?.pagination?.totalRecords ?? null
      aiCamerasReporting = aggregateRes.data?.details?.aiCamerasReporting ?? null
      aiAccuracy = aggregateRes.data?.details?.averageAccuracy?.samples
        ? aggregateRes.data.details.averageAccuracy.value
        : null
      events = feedRes.data?.details?.items ?? []
      analyticsEvents = analyticsRes.data?.details?.items ?? events
      cameraHealth = {
        online: onlineRes.data?.pagination?.totalRecords ?? null,
        offline: offlineRes.data?.pagination?.totalRecords ?? null
      }

      const firstError =
        totalRes.error || highRes.error || todayRes.error || aggregateRes.error ||
        feedRes.error || analyticsRes.error
      if (firstError) errorMsg = firstError.message
      lastUpdatedAt = new Date()
    } catch (err) {
      errorMsg = err instanceof Error ? err.message : 'Unable to load AI event intelligence'
    } finally {
      loading = false
    }
  }

  function normalizeSeverity(value: unknown): Severity {
    const normalized = typeof value === 'string' ? value.toLowerCase() : ''
    if (normalized === 'high' || normalized === 'medium' || normalized === 'low' || normalized === 'info') return normalized
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
    return event.deviceName ?? event.deviceId ?? event.source ?? event.sourceFamily ?? '—'
  }

  function eventLocation(event: IngestEvent) {
    const location = event.location ?? event.detail?.payload?.location
    if (location && typeof location === 'object' && 'lat' in location && 'lng' in location) {
      const lat = Number((location as { lat?: unknown }).lat)
      const lng = Number((location as { lng?: unknown }).lng)
      if (Number.isFinite(lat) && Number.isFinite(lng) && lat !== 0 && lng !== 0) return { lat, lng }
    }
    const lat = Number(payloadValue(event, 'lat') ?? payloadValue(event, 'latitude'))
    const lng = Number(payloadValue(event, 'lng') ?? payloadValue(event, 'longitude'))
    if (Number.isFinite(lat) && Number.isFinite(lng) && lat !== 0 && lng !== 0) return { lat, lng }
    return null
  }

  function firstImage(event: IngestEvent) {
    const refs = (event.binaryRefs ?? event.detail?.binaryRefs ?? []).filter(
      (ref) => ref.kind === 'image' || ref.contentType?.startsWith('image/')
    )
    const ref = refs[0]
    if (!ref?.bucket || !ref.objectId) return ''
    return `/api/v1/files/${encodeURIComponent(ref.bucket)}/${ref.objectId.split('/').map(encodeURIComponent).join('/')}`
  }

  function firstBbox(event: IngestEvent): IngestPictureCoordinate | null {
    return event.payload?.pictureCoordinates?.[0] ?? event.detail?.payload?.pictureCoordinates?.[0] ?? null
  }

  function formatCount(value: number | undefined | null) {
    if (value === null || value === undefined) return '—'
    return Number(value).toLocaleString('en-US')
  }

  function formatAccuracy(value: number | null) {
    if (value === null || !Number.isFinite(value)) return '—'
    return `${(value * 100).toFixed(1)}%`
  }

  function formatTime(value?: string) {
    if (!value) return '—'
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

  function severityColor(severity: Severity) {
    if (severity === 'high') return '#ef4444'
    if (severity === 'medium') return '#f97316'
    if (severity === 'low') return '#3b82f6'
    return '#9ca3af'
  }

  function buildAnalytics(items: IngestEvent[]): Analytics {
    const now = Date.now()
    const bucketMs = TIMELINE_BUCKET_MINUTES * 60 * 1000
    const start = Math.floor((now - TIMELINE_BUCKETS * bucketMs) / bucketMs) * bucketMs
    const buckets = Array.from({ length: TIMELINE_BUCKETS }, (_, index) => new Date(start + index * bucketMs).toISOString())
    const series = severityOrder.reduce((acc, severity) => {
      acc[severity] = new Array(TIMELINE_BUCKETS).fill(0)
      return acc
    }, {} as Record<Severity, number[]>)
    const deviceCounts = new Map<string, number>()
    const categoryCounts = new Map<string, number>()

    for (const event of items) {
      const severity = eventSeverity(event)
      const t = event.occurredAt ? Date.parse(event.occurredAt) : NaN
      if (Number.isFinite(t) && t >= start && t <= now) {
        const index = Math.floor((t - start) / bucketMs)
        if (index >= 0 && index < TIMELINE_BUCKETS) series[severity][index] += 1
      }
      const device = eventDevice(event)
      if (device && device !== '—') deviceCounts.set(device, (deviceCounts.get(device) ?? 0) + 1)
      const category = event.eventCategory?.trim() || event.eventClass?.trim() || 'ไม่ระบุ'
      categoryCounts.set(category, (categoryCounts.get(category) ?? 0) + 1)
    }

    return {
      timeline: { buckets, series },
      topDevices: [...deviceCounts.entries()]
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5),
      cameraHealth,
      categories: collapseLongTail([...categoryCounts.entries()].map(([name, count]) => ({ name, count })))
    }
  }

  function cameraHealthDonutStyle() {
    const online = analytics.cameraHealth.online ?? 0
    const offline = analytics.cameraHealth.offline ?? 0
    const total = online + offline
    const onlinePct = total > 0 ? (online / total) * 100 : 0
    return `background:conic-gradient(var(--bs-success) 0 ${onlinePct}%, var(--bs-danger) ${onlinePct}% 100%)`
  }

  function collapseLongTail(items: Array<{ name: string; count: number }>) {
    const sorted = items.sort((a, b) => b.count - a.count)
    if (sorted.length <= 6) return sorted
    const head = sorted.slice(0, 5)
    const tail = sorted.slice(5).reduce((sum, item) => sum + item.count, 0)
    return [...head, { name: 'อื่นๆ', count: tail }]
  }

  function scheduleRefresh() {
    if (refreshTimer) clearTimeout(refreshTimer)
    refreshTimer = setTimeout(() => {
      refreshTimer = null
      void load()
    }, 1000)
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
      occurredAt: data.occurredAt ?? new Date().toISOString(),
      severity: data.severity,
      eventClass: data.eventClass,
      location: data.location
    }
  }

  function applyRealtimeEvent(data: WssIngestEventPayload) {
    const event = wssEventToIngestEvent(data)
    if (!event?.eventId) return
    if (!seenRealtimeEvents.has(event.eventId)) {
      seenRealtimeEvents.add(event.eventId)
      events = [event, ...events.filter((item) => (item.eventId ?? item.id) !== event.eventId)].slice(0, FEED_LIMIT)
      analyticsEvents = [event, ...analyticsEvents.filter((item) => (item.eventId ?? item.id) !== event.eventId)].slice(0, ANALYTICS_LIMIT)
    }
    scheduleRefresh()
  }

  function startRealtime() {
    if (unsubscribeRealtime) return
    realtimeDenied = ''
    unsubscribeRealtime = subscribeWsTopic<WssIngestEventPayload>(
      [WS_TOPICS.INGEST_EVENT, WS_TOPICS.INGEST_BLACKLIST],
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
    if (refreshTimer) clearTimeout(refreshTimer)
    refreshTimer = null
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

  function openLightbox(event: IngestEvent) {
    const index = events.findIndex((item) => (item.eventId ?? item.id) === (event.eventId ?? event.id))
    if (index >= 0) lightboxIndex = index
  }

  function moveLightbox(step: number) {
    if (lightboxIndex === null) return
    const next = lightboxIndex + step
    if (next >= 0 && next < events.length) lightboxIndex = next
  }

  function onLightboxKey(event: KeyboardEvent) {
    if (event.key === 'Escape') lightboxIndex = null
    if (event.key === 'ArrowLeft') moveLightbox(-1)
    if (event.key === 'ArrowRight') moveLightbox(1)
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
      อัปเดตล่าสุด {lastUpdatedAt ? formatTime(lastUpdatedAt.toISOString()) : '—'}
    </div>
    <div class="d-flex align-items-center gap-2">
      <span class="badge bg-warning text-dark">Beta</span>
      <span class="badge {liveBadgeClass($wsHubStatus)}" title={$wsHubLastError ?? ''}>
        <i class="bi bi-broadcast me-1"></i>{liveBadgeLabel($wsHubStatus)}
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

  <section class="intdash-kpis mb-4">
    <div class="card intdash-kpi">
      <i class="bi bi-activity"></i>
      <span>เหตุการณ์ทั้งหมด</span>
      <strong>{formatCount(totalEvents)}</strong>
      <small>สะสมตั้งแต่ระบบเริ่มรับเหตุการณ์</small>
    </div>
    <div class="card intdash-kpi">
      <i class="bi bi-exclamation-triangle text-danger"></i>
      <span>เหตุการณ์รุนแรง</span>
      <strong class="text-danger">{formatCount(highSeverity)}</strong>
      <small>severity = high (สะสม)</small>
    </div>
    <div class="card intdash-kpi">
      <i class="bi bi-camera-video"></i>
      <span>กล้อง AI ที่รายงาน</span>
      <strong>{formatCount(aiCamerasReporting)}</strong>
      <small>ตั้งแต่ 00:00 ของวันนี้</small>
    </div>
    <div class="card intdash-kpi">
      <i class="bi bi-cpu"></i>
      <span>ความแม่นยำเฉลี่ย</span>
      <strong>{formatAccuracy(aiAccuracy)}</strong>
      <small>เฉลี่ยจาก similarity ของเหตุการณ์วันนี้</small>
    </div>
    <div class="card intdash-kpi">
      <i class="bi bi-lightning-charge"></i>
      <span>เหตุการณ์วันนี้</span>
      <strong>{formatCount(eventsToday)}</strong>
      <small>ตั้งแต่ 00:00 ของวันนี้</small>
    </div>
  </section>

  <section class="intdash-main mb-4">
    <div class="card intdash-map-card">
      <div class="card-body">
        <div class="fw-bold mb-2">แผนที่เหตุการณ์แบบเรียลไทม์</div>
        <IntDashMap events={mapEvents} {loading} />
      </div>
    </div>

    <div class="card intdash-feed-card">
      <div class="card-body">
        <div class="d-flex justify-content-between align-items-center mb-2">
          <div class="fw-bold">เหตุการณ์ล่าสุด</div>
          <span class="badge bg-secondary-subtle text-body">{events.length} รายการ</span>
        </div>
        <div class="intdash-feed">
          {#if loading && events.length === 0}
            <div class="text-center text-body text-opacity-50 py-5">Loading events...</div>
          {:else if events.length === 0}
            <div class="text-center text-body text-opacity-50 py-5">ยังไม่มีเหตุการณ์</div>
          {:else}
            {#each events as event (event.eventId ?? event.id)}
              <div class="intdash-feed-row">
                <span class={severityClass(eventSeverity(event))}></span>
                <div class="min-w-0 flex-grow-1">
                  <div class="fw-semibold text-truncate">{eventLabel(event)}</div>
                  <div class="small text-body text-opacity-50 text-truncate">{eventDevice(event)}</div>
                  {#if event.eventClass}
                    <span class="badge bg-secondary-subtle text-body mt-1">{event.eventClass}</span>
                  {/if}
                </div>
                <button
                  type="button"
                  class="intdash-thumb"
                  aria-label={`Open ${eventLabel(event)} capture`}
                  disabled={!firstImage(event)}
                  onclick={() => openLightbox(event)}
                >
                  {#if firstImage(event)}
                    <ProtectedImage src={firstImage(event)} alt={eventLabel(event)} class="intdash-thumb-img" bbox={firstBbox(event)} />
                  {:else}
                    <i class="bi bi-image text-body text-opacity-50"></i>
                  {/if}
                </button>
                <small class="text-body text-opacity-50 text-end">{formatTime(event.occurredAt)}</small>
              </div>
            {/each}
          {/if}
        </div>
      </div>
    </div>
  </section>

  <section class="intdash-analytics">
    <div class="card">
      <div class="card-body">
        <div class="fw-bold">เหตุการณ์ย้อนหลัง 60 นาที</div>
        <div class="small text-body text-opacity-50 mb-3">แบ่งทุก 5 นาที ตามระดับความรุนแรง</div>
        <div class="intdash-timeline">
          {#each analytics.timeline.buckets as bucket, index}
            {@const total = severityOrder.reduce((sum, severity) => sum + analytics.timeline.series[severity][index], 0)}
            <div class="intdash-timeline-bar" title={`${formatTime(bucket)} · ${total}`}>
              {#each severityOrder as severity}
                {@const value = analytics.timeline.series[severity][index]}
                {#if value > 0}
                  <span style={`height:${Math.max(8, value * 7)}px;background:${severityColor(severity)}`}></span>
                {/if}
              {/each}
            </div>
          {/each}
        </div>
      </div>
    </div>
    <div class="card">
      <div class="card-body">
        <div class="fw-bold">อุปกรณ์ที่รายงานมากที่สุด</div>
        <div class="small text-body text-opacity-50 mb-3">Top 5 ในข้อมูลล่าสุด</div>
        <div class="d-grid gap-2">
          {#each analytics.topDevices as item}
            <div class="intdash-bar-row">
              <span class="text-truncate">{item.name}</span>
              <b>{item.count}</b>
              <i style={`width:${Math.min(100, item.count * 2)}%`}></i>
            </div>
          {:else}
            <div class="text-body text-opacity-50 small">ยังไม่มีข้อมูล</div>
          {/each}
        </div>
      </div>
    </div>
    <div class="card">
      <div class="card-body">
        <div class="fw-bold">สถานะกล้อง</div>
        <div class="small text-body text-opacity-50 mb-3">ออนไลน์ / ออฟไลน์ (ปัจจุบัน)</div>
        <div class="intdash-donut" style={cameraHealthDonutStyle()}></div>
        <div class="d-flex justify-content-center gap-3 small mt-3">
          <span><i class="intdash-dot bg-success"></i>ออนไลน์ {formatCount(analytics.cameraHealth.online)}</span>
          <span><i class="intdash-dot bg-danger"></i>ออฟไลน์ {formatCount(analytics.cameraHealth.offline)}</span>
        </div>
      </div>
    </div>
    <div class="card">
      <div class="card-body">
        <div class="fw-bold">ประเภทเหตุการณ์</div>
        <div class="small text-body text-opacity-50 mb-3">สัดส่วนจากข้อมูลล่าสุด</div>
        <div class="d-grid gap-2">
          {#each analytics.categories as item, index}
            <div class="intdash-category-row">
              <i style={`background:${['#3b82f6', '#10b981', '#f97316', '#a855f7', '#ec4899', '#9ca3af'][index % 6]}`}></i>
              <span class="text-truncate">{item.name}</span>
              <b>{item.count}</b>
            </div>
          {:else}
            <div class="text-body text-opacity-50 small">ยังไม่มีเหตุการณ์</div>
          {/each}
        </div>
      </div>
    </div>
  </section>

  <div class="small text-body text-opacity-50 mt-4">
    Status: B-2 / B-3a / B-3b / B-3c / B-4 shipped · อิงตาม klynx-api/docs/contracts/event-severity-forwarding.md
  </div>
</DomainStarter>

{#if lightboxEvent}
  <div
    class="intdash-lightbox"
    role="button"
    tabindex="0"
    aria-label="Close image preview"
    onclick={(event) => { if (event.target === event.currentTarget) lightboxIndex = null }}
    onkeydown={onLightboxKey}
  >
    <div class="intdash-lightbox-top">
      <div>
        <b>{eventLabel(lightboxEvent)}</b>
        <span>{eventDevice(lightboxEvent)} · {formatTime(lightboxEvent.occurredAt)}</span>
      </div>
      <button type="button" class="btn btn-light btn-sm" aria-label="Close" onclick={() => lightboxIndex = null}>
        <i class="bi bi-x-lg"></i>
      </button>
    </div>
    <div class="intdash-lightbox-stage">
      {#if firstImage(lightboxEvent)}
        <ProtectedImage src={firstImage(lightboxEvent)} alt={eventLabel(lightboxEvent)} class="intdash-lightbox-img" bbox={firstBbox(lightboxEvent)} />
      {:else}
        <div class="text-white-50">ไม่มีรูปแนบในเหตุการณ์นี้</div>
      {/if}
    </div>
    <button type="button" class="btn btn-light intdash-lightbox-prev" aria-label="Previous event" disabled={lightboxIndex === 0} onclick={() => moveLightbox(-1)}>
      <i class="bi bi-chevron-left"></i>
    </button>
    <button type="button" class="btn btn-light intdash-lightbox-next" aria-label="Next event" disabled={lightboxIndex === events.length - 1} onclick={() => moveLightbox(1)}>
      <i class="bi bi-chevron-right"></i>
    </button>
  </div>
{/if}

<style>
  .intdash-kpis,
  .intdash-analytics {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 1rem;
  }

  .intdash-kpi {
    padding: 1rem;
    min-height: 7rem;
  }

  .intdash-kpi i,
  .intdash-kpi span,
  .intdash-kpi small {
    color: rgba(var(--bs-body-color-rgb), 0.55);
  }

  .intdash-kpi strong {
    display: block;
    font-size: 1.85rem;
    line-height: 1.1;
    margin: 0.5rem 0 0.25rem;
  }

  .intdash-main {
    display: grid;
    grid-template-columns: minmax(0, 2fr) minmax(20rem, 1fr);
    gap: 1rem;
  }

  .intdash-map,
  .intdash-feed {
    height: 27.5rem;
  }

  .intdash-map {
    position: relative;
    overflow: hidden;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 0.35rem;
    background:
      radial-gradient(circle at 55% 50%, rgba(var(--bs-theme-rgb), 0.16), transparent 25%),
      linear-gradient(135deg, rgba(20, 28, 35, 0.98), rgba(8, 12, 18, 0.98));
  }

  .intdash-map-grid {
    position: absolute;
    inset: 0;
    background-image:
      linear-gradient(rgba(255, 255, 255, 0.04) 1px, transparent 1px),
      linear-gradient(90deg, rgba(255, 255, 255, 0.04) 1px, transparent 1px);
    background-size: 42px 42px;
    opacity: 0.45;
  }

  .intdash-map-toolbar,
  .intdash-map-legend,
  .intdash-map-empty {
    position: absolute;
    z-index: 2;
    background: rgba(var(--bs-body-bg-rgb), 0.86);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 0.25rem;
    color: rgba(var(--bs-body-color-rgb), 0.72);
    font-size: 0.75rem;
  }

  .intdash-map-toolbar {
    top: 0.75rem;
    left: 0.75rem;
    display: flex;
    gap: 0.6rem;
    padding: 0.35rem 0.5rem;
  }

  .intdash-map-legend {
    left: 0.75rem;
    bottom: 0.75rem;
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
    padding: 0.4rem 0.55rem;
  }

  .intdash-map-legend i,
  .intdash-dot {
    display: inline-block;
    width: 0.5rem;
    height: 0.5rem;
    border-radius: 999px;
    margin-right: 0.35rem;
  }

  .intdash-map-empty {
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    padding: 0.6rem 0.75rem;
    text-align: center;
  }

  .intdash-map-marker {
    position: absolute;
    z-index: 1;
    width: 0.85rem;
    height: 0.85rem;
    border: 2px solid rgba(255, 255, 255, 0.9);
    border-radius: 999px;
    box-shadow: 0 0 0 0.35rem rgba(255, 255, 255, 0.08);
    transform: translate(-50%, -50%);
    animation: intdash-pulse 1.8s ease-out infinite;
  }

  .intdash-feed {
    overflow-y: auto;
    padding-right: 0.25rem;
  }

  .intdash-feed-row {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) 2.75rem 4.5rem;
    align-items: center;
    gap: 0.75rem;
    min-height: 4rem;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  }

  .intdash-thumb {
    width: 2.5rem;
    height: 2.5rem;
    padding: 0;
    overflow: hidden;
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 0.25rem;
    background: rgba(255, 255, 255, 0.04);
  }

  .intdash-thumb:disabled {
    cursor: default;
  }

  :global(.intdash-thumb-img) {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .intdash-severity {
    width: 0.7rem;
    height: 0.7rem;
    border-radius: 999px;
    flex: 0 0 auto;
    background: var(--bs-secondary);
  }

  .intdash-severity-high { background: var(--bs-danger); }
  .intdash-severity-medium { background: var(--bs-warning); }
  .intdash-severity-low { background: var(--bs-info); }
  .intdash-severity-info,
  .intdash-severity-none { background: var(--bs-secondary); }

  .intdash-analytics {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }

  .intdash-timeline {
    height: 10rem;
    display: flex;
    align-items: flex-end;
    gap: 0.45rem;
    border-bottom: 1px dashed rgba(255, 255, 255, 0.16);
  }

  .intdash-timeline-bar {
    flex: 1 1 0;
    min-width: 0.45rem;
    display: flex;
    align-items: flex-end;
    justify-content: center;
    gap: 1px;
  }

  .intdash-timeline-bar span {
    width: 100%;
    min-height: 0.15rem;
    border-radius: 999px 999px 0 0;
  }

  .intdash-bar-row {
    position: relative;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 0.5rem;
    padding-bottom: 0.35rem;
  }

  .intdash-bar-row i {
    grid-column: 1 / -1;
    height: 0.5rem;
    border-radius: 999px;
    background: var(--bs-theme);
  }

  .intdash-donut {
    width: 7rem;
    height: 7rem;
    margin: 0.75rem auto 0;
    border-radius: 999px;
    position: relative;
  }

  .intdash-donut::after {
    content: '';
    position: absolute;
    inset: 1.8rem;
    border-radius: inherit;
    background: var(--bs-body-bg);
  }

  .intdash-category-row {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    gap: 0.5rem;
    align-items: center;
  }

  .intdash-category-row i {
    width: 0.65rem;
    height: 0.65rem;
    border-radius: 999px;
  }

  .intdash-lightbox {
    position: fixed;
    inset: 0;
    z-index: 3000;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.88);
  }

  .intdash-lightbox-stage {
    max-width: 90vw;
    max-height: 80vh;
  }

  :global(.intdash-lightbox-img) {
    max-width: 90vw;
    max-height: 80vh;
    width: auto;
    height: auto;
    object-fit: contain;
  }

  .intdash-lightbox-top {
    position: absolute;
    top: 1rem;
    left: 1rem;
    right: 1rem;
    display: flex;
    justify-content: space-between;
    gap: 1rem;
    color: white;
    pointer-events: none;
  }

  .intdash-lightbox-top > * {
    pointer-events: auto;
  }

  .intdash-lightbox-top span {
    display: block;
    font-size: 0.8rem;
    opacity: 0.72;
  }

  .intdash-lightbox-prev,
  .intdash-lightbox-next {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
  }

  .intdash-lightbox-prev { left: 1rem; }
  .intdash-lightbox-next { right: 1rem; }

  @keyframes intdash-pulse {
    0% { box-shadow: 0 0 0 0 rgba(255, 255, 255, 0.35); }
    100% { box-shadow: 0 0 0 1.4rem rgba(255, 255, 255, 0); }
  }

  @media (max-width: 1400px) {
    .intdash-kpis { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    .intdash-analytics { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  }

  @media (max-width: 992px) {
    .intdash-main,
    .intdash-kpis,
    .intdash-analytics {
      grid-template-columns: 1fr;
    }
  }
</style>
