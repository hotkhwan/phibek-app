<!-- src/routes/(app)/intDash/+page.svelte -->
<script lang="ts">
  import { onDestroy, onMount } from 'svelte'
  import { setPageTitle } from '$lib/utils/title'
  import IntDashCharts from '$lib/components/intDash/IntDashCharts.svelte'
  import IntDashMap from '$lib/components/intDash/IntDashMap.svelte'
  import {
    countCamerasByState,
    countIntDashEvents,
    emptyIntDashDatasets,
    emptyIntDashTimeline,
    fetchIntDashAggregate,
    listIntDashEvents,
    type IntDashAggregateDetails,
    type IntDashDatasets,
    type IntDashEvent,
    type IntDashTimeline
  } from '$lib/api/intDash'
  import { m } from '$lib/i18n/messages'

  type IntDashKpis = {
    totalEvents: number | null
    highSeverity: number | null
    eventsToday: number | null
    aiCamerasReporting: number | null
    aiAccuracy: number | null
  }

  const severityKeys = ['high', 'medium', 'low', 'info', 'none'] as const
  const severityLabel: Record<string, string> = {
    high: 'รุนแรง',
    medium: 'ปานกลาง',
    low: 'ต่ำ',
    info: 'ข้อมูล',
    none: 'ไม่ระบุ'
  }

  let events = $state<IntDashEvent[]>([])
  let kpis = $state<IntDashKpis>({
    totalEvents: null,
    highSeverity: null,
    eventsToday: null,
    aiCamerasReporting: null,
    aiAccuracy: null
  })
  let datasets = $state<IntDashDatasets>(emptyIntDashDatasets())
  let loading = $state(false)
  let errorMsg = $state('')
  let lastUpdatedAt = $state<Date | null>(null)
  let refreshTimer: ReturnType<typeof setInterval> | null = null

  const markerCount = $derived(events.filter(hasEventLocation).length)

  const kpiCards = $derived([
    { label: 'เหตุการณ์ทั้งหมด', value: kpis.totalEvents, icon: 'bi-activity', tone: 'neutral', hint: 'pagination.totalRecords จาก /events' },
    { label: 'เหตุการณ์รุนแรง', value: kpis.highSeverity, icon: 'bi-exclamation-triangle', tone: 'danger', hint: 'severity = high' },
    { label: 'กล้อง AI ที่รายงาน', value: kpis.aiCamerasReporting, icon: 'bi-camera-video', tone: 'muted', hint: 'รอ contract เฉพาะ KPI' },
    { label: 'ความแม่นยำเฉลี่ย', value: kpis.aiAccuracy, icon: 'bi-bullseye', tone: 'muted', hint: 'รอ contract เฉพาะ KPI' },
    { label: 'เหตุการณ์วันนี้', value: kpis.eventsToday, icon: 'bi-lightning-charge', tone: 'info', hint: 'ตั้งแต่ 00:00 วันนี้' }
  ])

  function formatCount(value: number | null): string {
    if (value === null) return '—'
    return value.toLocaleString('en-US')
  }

  function formatTime(value?: string): string {
    if (!value) return '—'
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return value
    return d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  }

  function formatLastUpdated(): string {
    if (!lastUpdatedAt) return '—'
    return lastUpdatedAt.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  }

  function startOfTodayISO(): string {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    return d.toISOString()
  }

  function minutesAgoISO(minutes: number): string {
    return new Date(Date.now() - minutes * 60_000).toISOString()
  }

  function normalizedSeverity(severity?: string): 'high' | 'medium' | 'low' | 'info' | 'none' {
    if (severity === 'high' || severity === 'medium' || severity === 'low' || severity === 'info' || severity === 'none') return severity
    return 'none'
  }

  function severityText(severity?: string): string {
    return severityLabel[normalizedSeverity(severity)]
  }

  function severityClass(severity?: string): string {
    return `severity-${normalizedSeverity(severity)}`
  }

  function eventTitle(ev: IntDashEvent): string {
    return ev.eventType || '(unspecified)'
  }

  function eventDevice(ev: IntDashEvent): string {
    return ev.deviceName || ev.deviceId || '—'
  }

  function hasEventLocation(ev: IntDashEvent): boolean {
    const lat = ev.detail?.location?.lat
    const lng = ev.detail?.location?.lng
    return typeof lat === 'number' && typeof lng === 'number' && Number.isFinite(lat) && Number.isFinite(lng) && lat !== 0 && lng !== 0
  }

  function validateTimeline(timeline: IntDashTimeline | undefined): IntDashTimeline {
    if (!timeline?.buckets?.length) return emptyIntDashTimeline()
    const valid = severityKeys.every((key) =>
      Array.isArray(timeline.series?.[key]) && timeline.series[key].length === timeline.buckets.length
    )
    return valid ? timeline : emptyIntDashTimeline()
  }

  function datasetsFromAggregate(
    aggregate: IntDashAggregateDetails,
    online: number | null,
    offline: number | null
  ): IntDashDatasets {
    const categories = [...(aggregate.categories ?? [])]
    const shownTotal = categories.reduce((sum, item) => sum + item.count, 0)
    const tail = Math.max(0, (aggregate.categoriesTotal ?? shownTotal) - shownTotal)
    if (tail > 0) categories.push({ name: 'อื่นๆ', count: tail })

    return {
      timeline: validateTimeline(aggregate.timeline),
      topDevices: (aggregate.topDevices ?? []).map((item) => ({
        deviceName: item.deviceName || item.deviceId || '—',
        count: item.count
      })),
      cameraHealth: { online, offline },
      categories,
      scopeOrgFallback: aggregate.scope?.orgIdFallback === true,
      usedAggregateEndpoint: true
    }
  }

  function bucketByTimeline(items: readonly IntDashEvent[]): IntDashTimeline {
    const bucketMinutes = 5
    const bucketCount = 12
    const bucketMs = bucketMinutes * 60_000
    const now = Date.now()
    const windowStart = now - bucketCount * bucketMs
    const alignedStart = Math.floor(windowStart / bucketMs) * bucketMs
    const buckets = Array.from({ length: bucketCount }, (_, index) => new Date(alignedStart + index * bucketMs).toISOString())
    const series = {
      high: new Array(bucketCount).fill(0) as number[],
      medium: new Array(bucketCount).fill(0) as number[],
      low: new Array(bucketCount).fill(0) as number[],
      info: new Array(bucketCount).fill(0) as number[],
      none: new Array(bucketCount).fill(0) as number[]
    }

    for (const ev of items) {
      if (!ev.occurredAt) continue
      const t = Date.parse(ev.occurredAt)
      if (!Number.isFinite(t) || t < windowStart || t > now) continue
      const idx = Math.floor((t - alignedStart) / bucketMs)
      if (idx < 0 || idx >= bucketCount) continue
      const severity = normalizedSeverity(ev.severity)
      series[severity][idx] = (series[severity][idx] ?? 0) + 1
    }

    return { buckets, series }
  }

  function topDevices(items: readonly IntDashEvent[]) {
    const counts = new Map<string, number>()
    for (const ev of items) {
      const name = ev.deviceName || ev.deviceId || ''
      if (!name) continue
      counts.set(name, (counts.get(name) ?? 0) + 1)
    }
    return [...counts.entries()]
      .map(([deviceName, count]) => ({ deviceName, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)
  }

  function topCategories(items: readonly IntDashEvent[]) {
    const counts = new Map<string, number>()
    for (const ev of items) {
      const name = ev.eventCategory?.trim() || 'ไม่ระบุ'
      counts.set(name, (counts.get(name) ?? 0) + 1)
    }
    const sorted = [...counts.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
    if (sorted.length <= 6) return sorted
    const head = sorted.slice(0, 5)
    const tail = sorted.slice(5).reduce((sum, item) => sum + item.count, 0)
    return [...head, { name: 'อื่นๆ', count: tail }]
  }

  function datasetsFromEvents(
    items: readonly IntDashEvent[],
    online: number | null,
    offline: number | null
  ): IntDashDatasets {
    return {
      timeline: bucketByTimeline(items),
      topDevices: topDevices(items),
      cameraHealth: { online, offline },
      categories: topCategories(items),
      scopeOrgFallback: false,
      usedAggregateEndpoint: false
    }
  }

  async function refresh() {
    if (loading) return
    loading = true
    errorMsg = ''

    const now = new Date().toISOString()
    const aggregateFrom = minutesAgoISO(60)
    const [
      feedResult,
      totalResult,
      highResult,
      todayResult,
      aggregateResult,
      onlineResult,
      offlineResult
    ] = await Promise.all([
      listIntDashEvents({ page: 1, perPage: 20, sortOrder: 'desc' }),
      countIntDashEvents({}),
      countIntDashEvents({ severity: 'high' }),
      countIntDashEvents({ from: startOfTodayISO() }),
      fetchIntDashAggregate({ from: aggregateFrom, to: now, bucket: '5m', topDevicesLimit: 5, topCategoriesLimit: 5 }),
      countCamerasByState('online'),
      countCamerasByState('offline')
    ])

    events = feedResult.data?.details?.items ?? []
    kpis = {
      totalEvents: totalResult.count,
      highSeverity: highResult.count,
      eventsToday: todayResult.count,
      aiCamerasReporting: null,
      aiAccuracy: null
    }

    if (aggregateResult.data?.details) {
      datasets = datasetsFromAggregate(aggregateResult.data.details, onlineResult.count, offlineResult.count)
    } else {
      const fallback = await listIntDashEvents({ page: 1, perPage: 200, sortOrder: 'desc' })
      const fallbackEvents = fallback.data?.details?.items ?? events
      datasets = datasetsFromEvents(fallbackEvents, onlineResult.count, offlineResult.count)
    }

    const firstError = feedResult.error ?? aggregateResult.error ?? totalResult.error ?? highResult.error ?? todayResult.error
    if (firstError && events.length === 0 && !datasets.usedAggregateEndpoint) {
      errorMsg = firstError.message
    }

    lastUpdatedAt = new Date()
    loading = false
  }

  onMount(() => {
    setPageTitle(m.navIntDash())
    void refresh()
    refreshTimer = setInterval(() => void refresh(), 60_000)
  })

  onDestroy(() => {
    if (refreshTimer) clearInterval(refreshTimer)
  })
</script>

<div class="intdash-page">
  <section class="intdash-header">
    <div>
      <div class="eyebrow">
        <i class="bi bi-broadcast-pin"></i>
        <span>AI Intelligence (Beta)</span>
      </div>
      <h1>AI Event Intelligence</h1>
      <p>ภาพรวมเหตุการณ์จากกล้อง AI และ Edge AI · อัปเดตล่าสุด {formatLastUpdated()}</p>
    </div>
    <div class="header-actions">
      {#if datasets.scopeOrgFallback}
        <span class="status-pill muted">scope=org-only</span>
      {/if}
      <span class="status-pill {datasets.usedAggregateEndpoint ? 'success' : 'warning'}">
        {datasets.usedAggregateEndpoint ? 'aggregate' : 'fallback'}
      </span>
      <button type="button" class="btn btn-outline-theme btn-sm" onclick={refresh} disabled={loading}>
        <i class="bi {loading ? 'bi-arrow-clockwise spin' : 'bi-arrow-clockwise'}"></i>
        <span>Refresh</span>
      </button>
    </div>
  </section>

  {#if errorMsg}
    <div class="intdash-alert" role="status">
      <i class="bi bi-exclamation-triangle"></i>
      <span>Unable to load AI event data: {errorMsg}</span>
    </div>
  {/if}

  <section class="kpi-grid" aria-label="AI event KPIs">
    {#each kpiCards as card}
      <article class="kpi-card {card.tone}">
        <div class="kpi-icon"><i class="bi {card.icon}"></i></div>
        <div class="kpi-copy">
          <span>{card.label}</span>
          <strong>{formatCount(card.value)}</strong>
          <small>{card.hint}</small>
        </div>
      </article>
    {/each}
  </section>

  <section class="main-grid">
    <article class="panel map-panel">
      <div class="panel-header">
        <div>
          <h2>แผนที่เหตุการณ์ล่าสุด</h2>
          <span>{markerCount} เหตุการณ์มีพิกัดจาก feed ล่าสุด</span>
        </div>
        <div class="severity-legend">
          <span class="dot high"></span>
          <span class="dot medium"></span>
          <span class="dot low"></span>
          <span class="dot none"></span>
        </div>
      </div>
      <div class="map-frame">
        <IntDashMap {events} {loading} />
      </div>
    </article>

    <article class="panel feed-panel">
      <div class="panel-header">
        <div>
          <h2>เหตุการณ์ล่าสุด</h2>
          <span>{events.length} รายการ</span>
        </div>
      </div>

      {#if loading && events.length === 0}
        <div class="feed-empty"><i class="bi bi-arrow-clockwise spin"></i><span>กำลังโหลด...</span></div>
      {:else if events.length === 0}
        <div class="feed-empty"><i class="bi bi-inbox"></i><span>ยังไม่มีเหตุการณ์</span></div>
      {:else}
        <div class="event-feed">
          {#each events as ev (ev.id)}
            <article class="event-row">
              <div class="event-main">
                <strong>{eventTitle(ev)}</strong>
                <span>{eventDevice(ev)}</span>
                {#if ev.eventClass}
                  <small>{ev.eventClass}</small>
                {/if}
              </div>
              <div class="event-meta">
                <span class="severity-badge {severityClass(ev.severity)}">{severityText(ev.severity)}</span>
                <time>{formatTime(ev.occurredAt)}</time>
              </div>
            </article>
          {/each}
        </div>
      {/if}
    </article>
  </section>

  <section class="analytics-section" aria-label="AI event analytics">
    <IntDashCharts {datasets} {loading} />
  </section>
</div>

<style>
  .intdash-page {
    display: grid;
    gap: 1rem;
    padding: 1rem;
  }

  .intdash-header {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 1rem;
    padding: .2rem 0 .4rem;
  }

  .eyebrow {
    display: inline-flex;
    align-items: center;
    gap: .5rem;
    color: rgba(96, 165, 250, .9);
    font-size: .78rem;
    font-weight: 700;
    letter-spacing: 0;
    text-transform: uppercase;
  }

  .intdash-header h1 {
    margin: .3rem 0 .2rem;
    color: rgba(248, 250, 252, .96);
    font-size: clamp(1.55rem, 2.6vw, 2.2rem);
    font-weight: 700;
    letter-spacing: 0;
  }

  .intdash-header p {
    margin: 0;
    color: rgba(203, 213, 225, .7);
    font-size: .9rem;
  }

  .header-actions {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    flex-wrap: wrap;
    gap: .5rem;
  }

  .header-actions .btn {
    display: inline-flex;
    align-items: center;
    gap: .4rem;
  }

  .status-pill {
    display: inline-flex;
    align-items: center;
    min-height: 30px;
    border-radius: 999px;
    padding: .28rem .7rem;
    font-size: .72rem;
    border: 1px solid rgba(148, 163, 184, .22);
    color: rgba(226, 232, 240, .86);
    background: rgba(15, 23, 42, .58);
  }

  .status-pill.success {
    border-color: rgba(16, 185, 129, .3);
    color: #86efac;
  }

  .status-pill.warning {
    border-color: rgba(249, 115, 22, .34);
    color: #fed7aa;
  }

  .status-pill.muted {
    color: rgba(203, 213, 225, .7);
  }

  .intdash-alert {
    display: flex;
    align-items: center;
    gap: .55rem;
    border: 1px solid rgba(239, 68, 68, .28);
    border-radius: 8px;
    background: rgba(127, 29, 29, .18);
    color: #fecaca;
    padding: .75rem .9rem;
    font-size: .86rem;
  }

  .kpi-grid {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 1rem;
  }

  .kpi-card {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: .75rem;
    min-height: 126px;
    border: 1px solid rgba(148, 163, 184, .18);
    border-radius: 8px;
    background: rgba(8, 16, 24, .82);
    padding: 1rem;
    box-shadow: 0 16px 36px rgba(0, 0, 0, .16);
  }

  .kpi-icon {
    display: grid;
    width: 38px;
    height: 38px;
    place-items: center;
    border-radius: 8px;
    color: #bfdbfe;
    background: rgba(59, 130, 246, .13);
  }

  .kpi-card.danger .kpi-icon {
    color: #fecaca;
    background: rgba(239, 68, 68, .16);
  }

  .kpi-card.info .kpi-icon {
    color: #bae6fd;
    background: rgba(14, 165, 233, .14);
  }

  .kpi-card.muted .kpi-icon {
    color: rgba(203, 213, 225, .68);
    background: rgba(148, 163, 184, .12);
  }

  .kpi-copy {
    min-width: 0;
  }

  .kpi-copy span,
  .kpi-copy small {
    display: block;
    color: rgba(203, 213, 225, .68);
    font-size: .75rem;
    line-height: 1.35;
  }

  .kpi-copy strong {
    display: block;
    margin: .25rem 0 .1rem;
    color: rgba(248, 250, 252, .96);
    font-size: 1.75rem;
    line-height: 1.1;
  }

  .main-grid {
    display: grid;
    grid-template-columns: minmax(0, 2fr) minmax(320px, 1fr);
    gap: 1rem;
  }

  .panel {
    border: 1px solid rgba(148, 163, 184, .18);
    border-radius: 8px;
    background: rgba(8, 16, 24, .82);
    padding: 1rem;
    box-shadow: 0 16px 36px rgba(0, 0, 0, .16);
  }

  .panel-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
    margin-bottom: .85rem;
  }

  .panel-header h2 {
    margin: 0;
    color: rgba(248, 250, 252, .94);
    font-size: 1rem;
    font-weight: 700;
    line-height: 1.35;
  }

  .panel-header span {
    color: rgba(203, 213, 225, .62);
    font-size: .78rem;
  }

  .map-frame {
    height: 440px;
    min-height: 440px;
  }

  .severity-legend {
    display: inline-flex;
    align-items: center;
    gap: .32rem;
    min-height: 24px;
  }

  .dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    border: 1px solid rgba(248, 250, 252, .72);
  }

  .dot.high { background: #ef4444; }
  .dot.medium { background: #f97316; }
  .dot.low { background: #3b82f6; }
  .dot.none { background: #6b7280; }

  .event-feed {
    display: grid;
    max-height: 440px;
    overflow: auto;
    padding-right: .25rem;
  }

  .event-row {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: .85rem;
    border-top: 1px solid rgba(148, 163, 184, .14);
    padding: .75rem 0;
  }

  .event-row:first-child {
    border-top: 0;
    padding-top: 0;
  }

  .event-main {
    min-width: 0;
  }

  .event-main strong,
  .event-main span,
  .event-main small {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .event-main strong {
    color: rgba(248, 250, 252, .92);
    font-size: .9rem;
    font-weight: 600;
  }

  .event-main span,
  .event-main small,
  .event-meta time {
    color: rgba(203, 213, 225, .62);
    font-size: .75rem;
  }

  .event-main small {
    margin-top: .22rem;
    color: rgba(147, 197, 253, .8);
  }

  .event-meta {
    display: grid;
    justify-items: end;
    gap: .3rem;
    flex: 0 0 auto;
  }

  .severity-badge {
    border-radius: 999px;
    padding: .18rem .55rem;
    font-size: .7rem;
    font-weight: 700;
    line-height: 1.4;
  }

  .severity-high {
    color: #fecaca;
    background: rgba(239, 68, 68, .2);
  }

  .severity-medium {
    color: #fed7aa;
    background: rgba(249, 115, 22, .18);
  }

  .severity-low {
    color: #bfdbfe;
    background: rgba(59, 130, 246, .18);
  }

  .severity-info,
  .severity-none {
    color: rgba(226, 232, 240, .76);
    background: rgba(148, 163, 184, .14);
  }

  .feed-empty {
    display: grid;
    min-height: 440px;
    place-items: center;
    align-content: center;
    gap: .65rem;
    color: rgba(203, 213, 225, .66);
    font-size: .88rem;
  }

  .feed-empty i {
    font-size: 1.5rem;
  }

  .analytics-section {
    min-width: 0;
  }

  .spin {
    animation: intdash-spin .8s linear infinite;
  }

  @keyframes intdash-spin {
    to {
      transform: rotate(360deg);
    }
  }

  :global([data-bs-theme="light"]) .intdash-header h1,
  :global([data-bs-theme="light"]) .panel-header h2,
  :global([data-bs-theme="light"]) .kpi-copy strong,
  :global([data-bs-theme="light"]) .event-main strong {
    color: rgba(15, 23, 42, .94);
  }

  :global([data-bs-theme="light"]) .intdash-header p,
  :global([data-bs-theme="light"]) .panel-header span,
  :global([data-bs-theme="light"]) .kpi-copy span,
  :global([data-bs-theme="light"]) .kpi-copy small,
  :global([data-bs-theme="light"]) .event-main span,
  :global([data-bs-theme="light"]) .event-main small,
  :global([data-bs-theme="light"]) .event-meta time {
    color: rgba(71, 85, 105, .74);
  }

  :global([data-bs-theme="light"]) .kpi-card,
  :global([data-bs-theme="light"]) .panel {
    background: rgba(255, 255, 255, .94);
    border-color: rgba(15, 23, 42, .1);
  }

  @media (max-width: 1199.98px) {
    .kpi-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .main-grid {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 767.98px) {
    .intdash-page {
      padding: .75rem;
    }

    .intdash-header {
      align-items: flex-start;
      flex-direction: column;
    }

    .header-actions {
      justify-content: flex-start;
    }

    .kpi-grid {
      grid-template-columns: 1fr;
    }

    .map-frame,
    .feed-empty {
      min-height: 360px;
      height: 360px;
    }

    .event-feed {
      max-height: 360px;
    }
  }
</style>
