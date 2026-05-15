<!-- src/routes/(app)/dashboard/+page.svelte -->
<script lang="ts">
  import { onDestroy, onMount } from 'svelte'
  import { setPageTitle } from '$lib/utils/title'
  import { appOptions } from '$lib/stores/appOptions'
  import { auth } from '$lib/stores/auth'
  import ViewerMapLibre from '$lib/components/dashboard/ViewerMapLibre.svelte'
  import {
    fetchAnalyticsEvents,
    fetchAnalyticsOverview,
    type AnalyticsBarChart,
    type AnalyticsChartSeries,
    type AnalyticsDonutChart,
    type AnalyticsEventItem,
    type AnalyticsGeoMapPoint,
    type AnalyticsOverviewDetails,
    type AnalyticsTopCamera
  } from '$lib/api/dashboard'

  type StatusTile = {
    label: string
    value: string
    unit: string
    icon: string
    color: string
  }

  type SparkStat = {
    label: string
    value: string
    delta: string
    trend: 'up' | 'down'
    points: number[]
  }

  type Metric = {
    icon: string
    label: string
    value: string
    delta: string
    points: number[]
  }

  type Region = {
    label: string
    value: string
    progress: number
  }

  type Activity = {
    rank: number
    camera: string
    group: string
    plays: string
    share: string
    points: number[]
  }

  type DonutItem = {
    label: string
    value: string
    percent: string
    share: number
    color: string
  }

  type LineSeries = {
    label: string
    value: string
    color: string
    points: number[]
  }

  type PhaseCard = {
    phase: string
    title: string
    meta: string
    active: boolean
    icon: string
  }

  type EventActivity = {
    event: string
    count: string
    meta: string
    icon: string
    tone: string
  }

  const TZ = 'Asia/Bangkok'
  const chartPalette = ['#2de67f', '#0ba6df', '#8b5cf6', '#f97316', '#06b6d4', '#a3e635', '#6366f1', '#ef4444']

  const phaseCards: PhaseCard[] = [
    { phase: 'Phase 1', title: 'Livestream Analytics', meta: 'Usage, viewers, sessions', active: true, icon: 'bi-play-circle-fill' },
    { phase: 'Phase 2', title: 'AI Event Intelligence', meta: 'Detections and incidents', active: false, icon: 'bi-cpu' },
    { phase: 'Phase 3', title: 'AI Command Center', meta: 'Digital twin operations', active: false, icon: 'bi-radar' }
  ]

  const demoStatusTiles: StatusTile[] = [
    { label: 'TOTAL VIEWS', value: '10,245', unit: 'plays', icon: 'bi-play-circle-fill', color: '#2ef27d' },
    { label: 'VIEWING SESSIONS', value: '3,456', unit: 'sessions', icon: 'bi-display', color: '#53a6ff' },
    { label: 'UNIQUE VIEWERS', value: '1,234', unit: 'viewers', icon: 'bi-people', color: '#ff9f1c' },
    { label: 'ACTIVE STREAMS', value: '156', unit: '/ 256 live', icon: 'bi-camera-video-fill', color: '#8b5cf6' },
    { label: 'EVENT TYPES', value: '89', unit: 'events', icon: 'bi-activity', color: '#16d9e3' }
  ]

  const demoSideStats: SparkStat[] = [
    { label: 'BANGKOK', value: '18', delta: '75.0%', trend: 'up', points: [10, 12, 18, 14, 21, 20, 26, 24, 31, 29, 38, 34, 42, 40, 46] },
    { label: 'SINGAPORE', value: '4', delta: '25.0%', trend: 'up', points: [3, 4, 5, 4, 7, 5, 8, 6, 9, 8, 11, 9, 13, 12, 14] },
    { label: 'CHONBURI', value: '3', delta: '12.5%', trend: 'up', points: [2, 3, 3, 5, 4, 6, 5, 7, 7, 8, 9, 8, 10, 11, 12] },
    { label: 'CHIANG MAI', value: '2', delta: '8.3%', trend: 'up', points: [1, 2, 2, 3, 2, 4, 3, 5, 4, 6, 5, 7, 6, 8, 8] },
    { label: 'RAYONG', value: '2', delta: '8.3%', trend: 'up', points: [1, 1, 2, 2, 3, 2, 4, 3, 4, 5, 4, 6, 5, 7, 6] }
  ]

  const demoCampaignBars = [
    38, 44, 51, 60, 66, 73, 80, 70, 58, 64, 76, 84, 70, 68, 66, 62, 55, 48,
    42, 39, 43, 46, 44, 37, 42, 48, 53, 33, 31, 36, 41, 43, 31, 38, 45, 52,
    58, 55, 46, 37, 31, 34, 40, 44, 49, 53, 48, 39, 32, 36, 42, 46, 51, 34,
    27, 24, 22, 25, 29, 26, 31, 28, 34, 43, 51, 59, 68, 72, 78, 84, 90, 76
  ]

  const demoCampaignValues = [70, 92, 140, 221, 308, 402, 480, 540, 682, 890, 1120, 1402, 1602, 1080, 580, 230]

  const demoCampaignTicks = ['8 MAY', '9 MAY', '10 MAY', '11 MAY', '12 MAY', '13 MAY', '14 MAY', '15 MAY']

  const demoSalesMetrics: Metric[] = [
    { icon: 'bi-display', label: 'DESKTOP', value: '6,366', delta: '62.1%', points: [22, 24, 25, 30, 26, 36, 28, 42, 34, 48, 39, 55] },
    { icon: 'bi-phone', label: 'MOBILE', value: '3,547', delta: '34.6%', points: [16, 18, 20, 19, 25, 17, 30, 23, 35, 28, 38, 34] },
    { icon: 'bi-tablet', label: 'TABLET', value: '332', delta: '3.3%', points: [12, 14, 16, 18, 15, 25, 17, 28, 21, 33, 24, 36] }
  ]

  const demoRegions: Region[] = [
    { label: 'WINDOWS', value: '57.7%', progress: 58 },
    { label: 'ANDROID', value: '29.2%', progress: 29 },
    { label: 'IOS', value: '10.1%', progress: 10 },
    { label: 'MACOS', value: '3.0%', progress: 3 }
  ]

  const demoActivityRows: Activity[] = [
    { rank: 1, camera: 'Meeting Room Front Camera 1', group: 'Group 1', plays: '5,125', share: '50.0%', points: [8, 12, 9, 16, 13, 18, 11, 20, 17, 24, 18, 26] },
    { rank: 2, camera: 'Parking Lot Camera', group: 'Group 2', plays: '3,187', share: '31.1%', points: [5, 8, 6, 9, 7, 12, 8, 14, 9, 16, 11, 18] },
    { rank: 3, camera: 'Entrance Camera', group: 'Floor 1', plays: '1,205', share: '11.8%', points: [3, 5, 4, 7, 5, 8, 6, 10, 7, 11, 8, 12] },
    { rank: 4, camera: 'Office Zone Camera', group: 'Floor 2', plays: '728', share: '7.1%', points: [2, 4, 3, 5, 4, 6, 4, 7, 5, 8, 6, 9] }
  ]

  const demoChannelRows: DonutItem[] = [
    { label: 'Edge', value: '6,156', percent: '60.2%', share: 60.2, color: '#2de67f' },
    { label: 'Chrome', value: '2,910', percent: '28.4%', share: 28.4, color: '#0ba6df' },
    { label: 'Safari', value: '726', percent: '7.1%', share: 7.1, color: '#8b5cf6' },
    { label: 'Firefox', value: '235', percent: '2.3%', share: 2.3, color: '#f7a72c' },
    { label: 'Other', value: '208', percent: '2.0%', share: 2.0, color: '#ff7a1c' }
  ]

  const demoTrafficRows: LineSeries[] = [
    { label: 'Direct', value: '5,490', color: '#8b5cf6', points: [22, 25, 23, 31, 28, 37, 35, 42, 39, 48, 44, 52] },
    { label: 'Referral', value: '2,642', color: '#6366f1', points: [12, 16, 14, 20, 18, 24, 21, 30, 26, 34, 30, 38] },
    { label: 'Search', value: '1,271', color: '#7c3aed', points: [8, 9, 11, 12, 10, 14, 13, 16, 15, 18, 17, 20] },
    { label: 'Social', value: '842', color: '#a855f7', points: [5, 7, 6, 9, 8, 10, 11, 12, 10, 13, 12, 15] }
  ]

  const demoResourceGroupLines: LineSeries[] = [
    { label: 'Group 1', value: '5,125', color: '#2de67f', points: [18, 24, 21, 30, 26, 36, 29, 42, 35, 48, 40, 52] },
    { label: 'Group 2', value: '3,187', color: '#ef4444', points: [14, 17, 15, 21, 18, 25, 21, 29, 24, 32, 27, 35] },
    { label: 'Floor 1', value: '1,205', color: '#0ba6df', points: [8, 10, 9, 13, 11, 15, 12, 17, 14, 18, 15, 20] },
    { label: 'Floor 2', value: '728', color: '#8b5cf6', points: [4, 5, 6, 7, 6, 8, 7, 9, 8, 10, 9, 12] }
  ]

  const demoGeoPoints: AnalyticsGeoMapPoint[] = [
    { lat: 13.7563, lon: 100.5018, count: 18, label: 'Bangkok' },
    { lat: 1.3521, lon: 103.8198, count: 4, label: 'Singapore' },
    { lat: 13.3611, lon: 100.9847, count: 3, label: 'Chonburi' },
    { lat: 18.7883, lon: 98.9853, count: 2, label: 'Chiang Mai' },
    { lat: 12.6814, lon: 101.2816, count: 2, label: 'Rayong' }
  ]

  const demoEventActivity: EventActivity[] = [
    { event: 'klive.play.started', count: '102', meta: 'stream started', icon: 'bi-play-circle-fill', tone: 'success' },
    { event: 'klive.play.ended', count: '84', meta: 'stream ended', icon: 'bi-stop-circle', tone: 'violet' },
    { event: 'klive.viewer.joined', count: '61', meta: 'user joined', icon: 'bi-person-plus', tone: 'cyan' },
    { event: 'klive.viewer.disconnected', count: '18', meta: 'user disconnected', icon: 'bi-person-dash', tone: 'warning' }
  ]

  let previousContentClass = ''
  let previousFooter = false
  let overview = $state<AnalyticsOverviewDetails | null>(null)
  let eventItems = $state<AnalyticsEventItem[]>([])
  let loading = $state(false)
  let errorMsg = $state('')
  let hasLoaded = $state(false)
  let dashboardRoot: HTMLDivElement | null = null
  const motionStops: Array<() => void> = []

  const initialRange = buildDefaultRange()
  let dateTimeParam = $state(initialRange.dateTime)
  let fallbackRangeLabel = $state(initialRange.label)
  const usingFallback = $derived(!hasLoaded || !!errorMsg)
  const eventTotal = $derived(eventItems.reduce((sum, item) => sum + (item.count || 0), 0))
  const playsData = $derived(seriesData(overview?.charts?.playsSeries?.series?.[0]))
  const activeStreamData = $derived(seriesData(overview?.charts?.activeStreamsSeries?.series?.[0]))
  const latestPlayCount = $derived(lastNumber(playsData))
  const latestActiveStreams = $derived(lastNumber(activeStreamData))
  const latestCategory = $derived(lastLabel(overview?.charts?.playsSeries?.categories) || 'Latest')
  const rangeLabel = $derived(rangeLabelFromOverview(overview) || fallbackRangeLabel)
  const actualGeoPoints = $derived(overview?.charts?.geoMap?.points ?? [])
  const viewerGeoPoints = $derived(usingFallback ? demoGeoPoints : actualGeoPoints)
  const geoTotal = $derived(viewerGeoPoints.reduce((sum, point) => sum + (point.count || 0), 0))
  const topGeoLabel = $derived(viewerGeoPoints.slice().sort((a, b) => (b.count || 0) - (a.count || 0))[0]?.label ?? '-')

  const statusTiles = $derived(usingFallback
    ? demoStatusTiles
    : buildStatusTiles(overview, eventTotal))
  const sideStats = $derived(usingFallback
    ? demoSideStats
    : buildLocationRows(actualGeoPoints))
  const campaignBars = $derived(usingFallback
    ? demoCampaignBars
    : scaleBars(playsData))
  const campaignLine = $derived(pointsForLine(usingFallback ? demoCampaignValues : playsData, 960, 220))
  const campaignTicks = $derived(usingFallback
    ? demoCampaignTicks
    : pickTicks(overview?.charts?.playsSeries?.categories ?? [], 8))
  const salesMetrics = $derived(usingFallback
    ? demoSalesMetrics
    : deviceMetricRows(overview?.breakdowns?.byDevice))
  const regions = $derived(usingFallback
    ? demoRegions
    : osRows(overview?.breakdowns?.byOS))
  const activityRows = $derived(usingFallback
    ? demoActivityRows
    : cameraRows(overview?.topCameras ?? []))
  const channelRows = $derived(usingFallback
    ? demoChannelRows
    : donutRows(overview?.breakdowns?.byBrowser))
  const trafficRows = $derived(usingFallback
    ? demoTrafficRows
    : barLineRows(overview?.breakdowns?.bySource))
  const resourceGroupLines = $derived(usingFallback
    ? demoResourceGroupLines
    : resourceGroupRows(overview?.charts?.byResourceGroupSeries?.series ?? []))
  const eventActivityRows = $derived(usingFallback
    ? demoEventActivity
    : eventActivity(eventItems))

  function fmt(n: number | undefined | null): string {
    return Number(n ?? 0).toLocaleString('en-US')
  }

  function pct(value: number, total: number): number {
    if (!total) return 0
    return Math.max(0, Math.min(100, (value / total) * 100))
  }

  function palette(index: number): string {
    return chartPalette[index % chartPalette.length] ?? '#2de67f'
  }

  function formatDateForApi(d: Date): string {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  }

  function formatDateLabel(value: string | Date): string {
    const raw = value instanceof Date ? formatDateForApi(value) : String(value)
    const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/)
    if (match) {
      const [, y, m, d] = match
      return new Date(Number(y), Number(m) - 1, Number(d)).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
      })
    }
    const date = new Date(raw)
    return Number.isNaN(date.getTime())
      ? raw
      : date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  }

  function buildDefaultRange() {
    const end = new Date()
    const start = new Date(end)
    start.setDate(start.getDate() - 7)
    return {
      dateTime: `${formatDateForApi(start)},${formatDateForApi(end)}`,
      label: `${formatDateLabel(start)} - ${formatDateLabel(end)}`
    }
  }

  function rangeLabelFromOverview(value: AnalyticsOverviewDetails | null): string {
    if (!value?.range?.start || !value?.range?.end) return ''
    return `${formatDateLabel(value.range.start)} - ${formatDateLabel(value.range.end)}`
  }

  function seriesData(series?: AnalyticsChartSeries): number[] {
    return Array.isArray(series?.data) ? series.data.map((v) => Number(v || 0)) : []
  }

  function lastNumber(values: number[]): number {
    return values.length ? values[values.length - 1] ?? 0 : 0
  }

  function lastLabel(values?: string[]): string {
    return Array.isArray(values) && values.length ? values[values.length - 1] ?? '' : ''
  }

  function spreadTrend(value: number, seed = 0): number[] {
    const base = Math.max(1, value)
    return Array.from({ length: 12 }, (_, i) => Math.max(1, Math.round(base * (.45 + (i + seed + 1) / 16))))
  }

  function buildStatusTiles(data: AnalyticsOverviewDetails | null, events: number): StatusTile[] {
    const kpis = data?.kpis
    return [
      { label: 'TOTAL VIEWS', value: fmt(kpis?.plays), unit: 'plays', icon: 'bi-play-circle-fill', color: '#2ef27d' },
      { label: 'VIEWING SESSIONS', value: fmt(kpis?.uniqueSessions), unit: 'sessions', icon: 'bi-display', color: '#53a6ff' },
      { label: 'UNIQUE VIEWERS', value: fmt(kpis?.uniqueViewersApprox), unit: 'viewers', icon: 'bi-people', color: '#ff9f1c' },
      { label: 'ACTIVE STREAMS', value: fmt(kpis?.activeStreamsApprox), unit: 'live', icon: 'bi-camera-video-fill', color: '#8b5cf6' },
      { label: 'EVENT TYPES', value: fmt(events), unit: 'events', icon: 'bi-activity', color: '#16d9e3' }
    ]
  }

  function buildLocationRows(points: AnalyticsGeoMapPoint[]): SparkStat[] {
    const total = points.reduce((sum, point) => sum + (point.count || 0), 0)
    return points
      .slice()
      .sort((a, b) => (b.count || 0) - (a.count || 0))
      .slice(0, 5)
      .map((point, index) => ({
        label: (point.label || `${point.lat}, ${point.lon}`).toUpperCase(),
        value: fmt(point.count),
        delta: `${pct(point.count || 0, total).toFixed(1)}%`,
        trend: 'up' as const,
        points: spreadTrend(point.count || 1, index)
      }))
  }

  function scaleBars(values: number[]): number[] {
    if (!values.length) return []
    const max = Math.max(...values, 1)
    return values.map((value) => Math.max(8, Math.round((value / max) * 90)))
  }

  function pointsForLine(values: number[], width = 128, height = 38): string {
    const cleaned = values.filter((value) => Number.isFinite(value))
    if (!cleaned.length) return ''
    if (cleaned.length === 1) return `0,${height / 2} ${width},${height / 2}`
    const min = Math.min(...cleaned)
    const max = Math.max(...cleaned)
    const range = max - min || 1
    const step = width / (cleaned.length - 1)
    return cleaned
      .map((value, index) => {
        const x = Math.round(index * step)
        const y = Math.round(height - ((value - min) / range) * (height - 8) - 4)
        return `${x},${Math.max(2, Math.min(height - 2, y))}`
      })
      .join(' ')
  }

  function pickTicks(categories: string[], limit: number): string[] {
    if (!categories.length) return []
    if (categories.length <= limit) return categories.map(shortTick)
    const step = (categories.length - 1) / (limit - 1)
    return Array.from({ length: limit }, (_, i) => shortTick(categories[Math.round(i * step)] ?? ''))
  }

  function shortTick(value: string): string {
    if (!value) return ''
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/)
    if (!match) return value
    const [, y, m, d] = match
    return new Date(Number(y), Number(m) - 1, Number(d)).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short'
    }).toUpperCase()
  }

  function barRows(chart?: AnalyticsBarChart): DonutItem[] {
    const categories = chart?.categories ?? []
    const rows = categories.map((label, index) => ({
      label,
      raw: (chart?.series ?? []).reduce((sum, series) => sum + (series.data[index] || 0), 0),
      color: palette(index)
    }))
    const total = rows.reduce((sum, row) => sum + row.raw, 0)
    return rows.map((row) => ({
      label: row.label,
      value: fmt(row.raw),
      percent: `${pct(row.raw, total).toFixed(1)}%`,
      share: pct(row.raw, total),
      color: row.color
    }))
  }

  function donutRows(chart?: AnalyticsDonutChart): DonutItem[] {
    const labels = chart?.labels ?? []
    const values = chart?.series ?? []
    const total = values.reduce((sum, value) => sum + (value || 0), 0)
    return labels.slice(0, 5).map((label, index) => {
      const value = values[index] ?? 0
      const percent = pct(value, total)
      return {
        label,
        value: fmt(value),
        percent: `${percent.toFixed(1)}%`,
        share: percent,
        color: palette(index)
      }
    })
  }

  function deviceMetricRows(chart?: AnalyticsBarChart): Metric[] {
    const icons = ['bi-display', 'bi-phone', 'bi-tablet', 'bi-device-hdd']
    return barRows(chart).slice(0, 4).map((row, index) => ({
      icon: icons[index] ?? 'bi-display',
      label: row.label.toUpperCase(),
      value: row.value,
      delta: row.percent,
      points: spreadTrend(Number(row.value.replace(/,/g, '')) || 1, index)
    }))
  }

  function osRows(chart?: AnalyticsDonutChart): Region[] {
    return donutRows(chart).slice(0, 4).map((row) => ({
      label: row.label.toUpperCase(),
      value: row.percent,
      progress: Math.round(row.share)
    }))
  }

  function cameraRows(cameras: AnalyticsTopCamera[]): Activity[] {
    const total = cameras.reduce((sum, camera) => sum + (camera.plays || 0), 0)
    return cameras.slice(0, 6).map((camera, index) => ({
      rank: index + 1,
      camera: camera.name || camera.streamId || '-',
      group: camera.siteName || camera.district || camera.location || '-',
      plays: fmt(camera.plays),
      share: `${pct(camera.plays || 0, total).toFixed(1)}%`,
      points: spreadTrend(camera.plays || 1, index)
    }))
  }

  function barLineRows(chart?: AnalyticsBarChart): LineSeries[] {
    return barRows(chart).slice(0, 4).map((row, index) => ({
      label: row.label,
      value: row.value,
      color: row.color,
      points: spreadTrend(Number(row.value.replace(/,/g, '')) || 1, index)
    }))
  }

  function resourceGroupRows(series: AnalyticsChartSeries[]): LineSeries[] {
    return series.slice(0, 5).map((item, index) => ({
      label: item.name || `Group ${index + 1}`,
      value: fmt(seriesData(item).reduce((sum, value) => sum + value, 0)),
      color: palette(index),
      points: seriesData(item)
    }))
  }

  function eventActivity(items: AnalyticsEventItem[]): EventActivity[] {
    return items.slice(0, 5).map((item, index) => ({
      event: item.event || 'unknown.event',
      count: fmt(item.count),
      meta: eventMeta(item.event),
      icon: eventIcon(item.event),
      tone: ['success', 'violet', 'cyan', 'warning', 'blue'][index % 5] ?? 'success'
    }))
  }

  function eventMeta(event: string): string {
    const key = String(event || '').toLowerCase()
    if (key.includes('started') || key.includes('play')) return 'stream activity'
    if (key.includes('ended') || key.includes('stop')) return 'stream ended'
    if (key.includes('join')) return 'user joined'
    if (key.includes('disconnect') || key.includes('leave')) return 'user disconnected'
    return 'livestream event'
  }

  function eventIcon(event: string): string {
    const key = String(event || '').toLowerCase()
    if (key.includes('started') || key.includes('play')) return 'bi-play-circle-fill'
    if (key.includes('ended') || key.includes('stop')) return 'bi-stop-circle'
    if (key.includes('join')) return 'bi-person-plus'
    if (key.includes('disconnect') || key.includes('leave')) return 'bi-person-dash'
    return 'bi-activity'
  }

  function sparkPoints(values: number[], width = 128, height = 38): string {
    return pointsForLine(values, width, height)
  }

  function donutGradient(items: DonutItem[]): string {
    const total = items.reduce((sum, item) => sum + item.share, 0) || 1
    let cursor = 0
    const parts = items.map((item) => {
      const start = cursor
      cursor += (item.share / total) * 100
      return `${item.color} ${start.toFixed(2)}% ${cursor.toFixed(2)}%`
    })

    return `conic-gradient(${parts.join(', ')})`
  }

  function delay(ms: number) {
    return new Promise((resolve) => window.setTimeout(resolve, ms))
  }

  async function waitForAuthContext(timeoutMs = 1400) {
    const started = Date.now()
    while (Date.now() - started < timeoutMs) {
      const state = auth.get()
      if (state.user?.token || state.ready) return
      await delay(50)
    }
  }

  async function runIntroMotion() {
    if (!dashboardRoot || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const { animate } = await import('motion/mini')
    const elements = Array.from(dashboardRoot.querySelectorAll('.phase-strip article, .status-tile, .panel, .health-bar'))
    elements.forEach((element, index) => {
      const animation = animate(
        element,
        { opacity: [0, 1], transform: ['translateY(14px)', 'translateY(0)'] },
        { duration: 0.42, delay: index * 0.035, ease: 'easeOut' }
      )
      motionStops.push(() => animation.stop())
    })
  }

  async function loadDashboard() {
    loading = true
    errorMsg = ''
    await waitForAuthContext()
    const query = { dateTime: dateTimeParam, tz: TZ, scope: 'all' as const }
    const [overviewResult, eventsResult] = await Promise.all([
      fetchAnalyticsOverview(query),
      fetchAnalyticsEvents(query)
    ])

    loading = false
    hasLoaded = true
    overview = overviewResult.data?.details ?? null
    eventItems = eventsResult.data?.details?.items ?? []
    if (overviewResult.error) {
      errorMsg = overviewResult.error.message
    } else if (eventsResult.error) {
      errorMsg = eventsResult.error.message
    }
  }

  onMount(() => {
    setPageTitle('Livestream Analytics')
    previousContentClass = $appOptions.appContentClass
    previousFooter = $appOptions.appFooter
    $appOptions.appContentClass = 'p-0 d-flex flex-column overflow-hidden phibek-analytics-content'
    $appOptions.appFooter = false
    void loadDashboard()
    void runIntroMotion()
  })

  onDestroy(() => {
    for (const stop of motionStops.splice(0)) stop()
    $appOptions.appContentClass = previousContentClass
    $appOptions.appFooter = previousFooter
  })
</script>

<div class="system-dashboard" bind:this={dashboardRoot}>
  <section class="dashboard-hero" aria-label="System analytics heading">
    <div>
      <h1>LIVESTREAM <span>ANALYTICS</span></h1>
      <p>Realtime overview of livestream plays, viewers, camera groups, and active sessions</p>
    </div>

    <div class="dashboard-actions" aria-label="Dashboard controls">
      <button type="button" class="control-button" title="Date range">
        <i class="bi bi-calendar3"></i>
        <span>{rangeLabel}</span>
        <i class="bi bi-chevron-down"></i>
      </button>
      <button type="button" class="control-button icon-only" title="Refresh analytics" onclick={loadDashboard} disabled={loading}>
        <i class={`bi ${loading ? 'bi-arrow-repeat spin' : 'bi-arrow-clockwise'}`}></i>
      </button>
      <button type="button" class="control-button" title="Filters">
        <i class="bi bi-funnel"></i>
        <span>Filters</span>
        <i class="bi bi-chevron-down"></i>
      </button>
    </div>
  </section>

  <section class="phase-strip" aria-label="Dashboard experience phases">
    {#each phaseCards as phase}
      <article class:active={phase.active}>
        <div class="phase-icon"><i class={`bi ${phase.icon}`}></i></div>
        <div>
          <span>{phase.phase}</span>
          <strong>{phase.title}</strong>
          <small>{phase.meta}</small>
        </div>
      </article>
    {/each}
  </section>

  {#if errorMsg}
    <div class="dashboard-alert" role="status">
      <i class="bi bi-exclamation-triangle"></i>
      <span>Unable to load live analytics: {errorMsg}. Showing fallback dashboard data.</span>
    </div>
  {/if}

  <section class="status-strip" aria-label="System status">
    {#each statusTiles as tile}
      <article class="status-tile" style={`--tile-color: ${tile.color}`}>
        <div class="status-icon"><i class={`bi ${tile.icon}`}></i></div>
        <div>
          <div class="status-label">{tile.label}</div>
          <div class="status-value">
            <strong>{tile.value}</strong>
            <span>{tile.unit}</span>
          </div>
        </div>
      </article>
    {/each}
  </section>

  <section class="top-grid">
    <article class="panel campaign-panel">
      <div class="panel-header">
        <h2>VIEWS OVER TIME</h2>
        <button type="button" class="select-pill" title="Time grain">
          Daily
          <i class="bi bi-chevron-down"></i>
        </button>
      </div>

      <div class="campaign-chart" aria-label="Livestream views over time chart">
        <div class="axis axis-left">
          <span>10K</span>
          <span>8K</span>
          <span>6K</span>
          <span>4K</span>
          <span>2K</span>
          <span>0</span>
        </div>
        <div class="axis axis-right">
          <span>250 Live</span>
          <span>200</span>
          <span>150</span>
          <span>100</span>
          <span>50</span>
          <span>0</span>
        </div>
        <div class="chart-field">
          <div class="chart-grid-lines"></div>
          <div class="bar-layer">
            {#each campaignBars as bar}
              <span style={`height: ${bar}%`}></span>
            {/each}
          </div>
          <svg class="campaign-line" viewBox="0 0 960 220" preserveAspectRatio="none" aria-hidden="true">
            <polygon points={`0,220 ${campaignLine} 960,220`} class="campaign-area"></polygon>
            <polyline points={campaignLine}></polyline>
            <circle cx="336" cy="52" r="4"></circle>
            <circle cx="504" cy="80" r="4"></circle>
            <circle cx="924" cy="92" r="4"></circle>
          </svg>
          <div class="campaign-tooltip">
            <strong>{latestCategory}</strong>
            <span><i></i> Views <b>{fmt(usingFallback ? 1602 : latestPlayCount)}</b></span>
            <span><i></i> Active streams <b>{fmt(usingFallback ? 156 : latestActiveStreams)}</b></span>
          </div>
        </div>
        <div class="x-axis">
          {#each campaignTicks as tick}
            <span>{tick}</span>
          {/each}
        </div>
        <div class="chart-legend">
          <span><i></i>Views</span>
          <span><i></i>Active streams</span>
        </div>
      </div>
    </article>

    <aside class="panel insight-panel" aria-label="Top viewer locations">
      <div class="insight-heading">TOP LOCATIONS</div>
      {#each sideStats as stat}
        <div class="insight-row">
          <div>
            <div class="insight-label">{stat.label}</div>
            <div class="insight-value">{stat.value}</div>
          </div>
          <div class={`insight-delta ${stat.trend}`}>
            <i class={`bi ${stat.trend === 'up' ? 'bi-arrow-up-short' : 'bi-arrow-down-short'}`}></i>
            {stat.delta}
          </div>
          <svg class="mini-spark" viewBox="0 0 128 38" preserveAspectRatio="none" aria-hidden="true">
            <polyline points={sparkPoints(stat.points)}></polyline>
          </svg>
        </div>
      {/each}
    </aside>
  </section>

  <section class="middle-grid">
    <article class="panel sales-panel">
      <div class="panel-header compact">
        <h2>VIEWERS BY DEVICE</h2>
      </div>

      <div class="sales-metrics">
        {#each salesMetrics as metric}
          <div class="sales-row">
            <div class="metric-icon"><i class={`bi ${metric.icon}`}></i></div>
            <div class="metric-copy">
              <span>{metric.label}</span>
              <strong>{metric.value}</strong>
            </div>
            <div class="metric-delta">
              <i class="bi bi-arrow-up-short"></i>{metric.delta}
            </div>
            <svg class="mini-spark" viewBox="0 0 128 38" preserveAspectRatio="none" aria-hidden="true">
              <polyline points={sparkPoints(metric.points)}></polyline>
            </svg>
          </div>
        {/each}
      </div>

      <div class="region-list">
        {#each regions as region}
          <div class="region-row" style={`--region-width: ${region.progress}%`}>
            <span>{region.label}</span>
            <div><i></i></div>
            <strong>{region.value}</strong>
          </div>
        {/each}
      </div>
      <p class="updated-note">Last updated: 10:03:21</p>
    </article>

    <article class="panel map-panel">
      <div class="panel-header compact">
        <h2>VIEWER LOCATIONS</h2>
      </div>

      <div class="world-map" aria-label="Viewer location MapLibre map">
        <ViewerMapLibre points={viewerGeoPoints} />
      </div>

      <div class="map-summary">
        <div>
          <span>LOCATIONS</span>
          <strong>{viewerGeoPoints.length}</strong>
        </div>
        <div>
          <span>TOTAL VIEWS</span>
          <strong>{fmt(geoTotal)}</strong>
        </div>
        <div>
          <span>TOP COUNTRY</span>
          <strong>{topGeoLabel}</strong>
        </div>
      </div>
    </article>

    <div class="callout-stack">
      <article class="panel callout-card">
        <div class="callout-icon"><i class="bi bi-diagram-3"></i></div>
        <div>
          <p>VIEWS BY TRAFFIC SOURCE, MATCHING THE K-LYNX ANALYTICS BREAKDOWN.</p>
          <div class="callout-grid source-grid">
            {#each trafficRows as row}
              <span style={`--source-color: ${row.color}`}>
                <i></i>{row.label} <b>{row.value}</b>
              </span>
            {/each}
          </div>
        </div>
      </article>

      <article class="panel callout-card slim">
        <div class="callout-icon"><i class="bi bi-activity"></i></div>
        <p>
          EVENT BREAKDOWN:
          {#if eventItems.length}
            <strong>{eventItems[0]?.event}</strong> {fmt(eventItems[0]?.count)} times
            {#if eventItems[1]}, <strong>{eventItems[1]?.event}</strong> {fmt(eventItems[1]?.count)} times{/if}.
          {:else}
            <strong>klive.play.started</strong> 102 times, <strong>klive.play.ended</strong> 84 times.
          {/if}
        </p>
      </article>
    </div>
  </section>

  <section class="bottom-grid">
    <article class="panel activity-panel">
      <div class="panel-header compact">
        <h2>TOP 10 MOST VIEWED CAMERAS</h2>
      </div>

      <div class="activity-table-wrap">
        <table class="activity-table">
          <thead>
            <tr>
              <th>#</th>
              <th>CAMERA NAME</th>
              <th>CAMERA GROUP</th>
              <th>VIEWS</th>
              <th>SHARE</th>
              <th>TREND</th>
            </tr>
          </thead>
          <tbody>
            {#each activityRows as row}
              <tr>
                <td>{row.rank}</td>
                <td>{row.camera}</td>
                <td>{row.group}</td>
                <td>{row.plays}</td>
                <td>{row.share}</td>
                <td>
                  <svg class="table-spark" viewBox="0 0 112 34" preserveAspectRatio="none" aria-hidden="true">
                    <polyline points={sparkPoints(row.points, 112, 34)}></polyline>
                  </svg>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </article>

    <article class="panel donut-panel">
      <div class="panel-header compact">
        <h2>VIEWERS BY WEB BROWSER</h2>
      </div>
      <div class="donut-layout">
        <div class="donut" style={`background: ${donutGradient(channelRows)}`}>
          <div>
            <span>Total</span>
            <strong>10,245</strong>
            <small>Views</small>
          </div>
        </div>
        <div class="donut-legend">
          {#each channelRows as item}
            <div style={`--dot-color: ${item.color}`}>
              <span><i></i>{item.label}</span>
              <b>{item.value} ({item.percent})</b>
            </div>
          {/each}
        </div>
      </div>
    </article>

    <article class="panel line-panel">
      <div class="panel-header compact">
        <h2>PLAYS BY CAMERA GROUP</h2>
      </div>
      <div class="resource-line-chart">
        <svg viewBox="0 0 240 96" preserveAspectRatio="none" aria-hidden="true">
          {#each resourceGroupLines as row}
            <polyline
              points={sparkPoints(row.points, 240, 90)}
              style={`stroke: ${row.color}`}
            ></polyline>
          {/each}
        </svg>
      </div>
      <div class="line-legend">
        {#each resourceGroupLines as row}
          <div style={`--dot-color: ${row.color}`}>
            <span><i></i>{row.label}</span>
            <b>{row.value}</b>
          </div>
        {/each}
      </div>
    </article>

    <article class="panel event-feed-panel">
      <div class="panel-header compact">
        <h2>RECENT ACTIVITY</h2>
        <button type="button" class="view-all-button">VIEW ALL</button>
      </div>
      <div class="event-feed-list">
        {#each eventActivityRows as row}
          <div class={`event-feed-row ${row.tone}`}>
            <div class="event-feed-icon"><i class={`bi ${row.icon}`}></i></div>
            <div>
              <strong>{row.event}</strong>
              <span>{row.meta}</span>
            </div>
            <b>{row.count} ครั้ง</b>
          </div>
        {/each}
      </div>
    </article>
  </section>

  <section class="health-bar" aria-label="Livestream analytics status">
    <div><span>LIVESTREAM HEALTH</span><i></i><strong>Tracking</strong></div>
    <div><span>DATA WINDOW</span><i></i><strong>Last 7 Days</strong></div>
    <div><span>CAMERA GROUPS</span><i></i><strong>4 Groups</strong></div>
    <div><span>LAST UPDATED</span><i class="bi bi-clock-history"></i><strong>10:03:21</strong></div>
  </section>
</div>

<style>
  :global(.phibek-analytics-content) {
    background: transparent;
  }

  .system-dashboard {
    --dash-bg: #020a10;
    --dash-bg-soft: rgba(7, 24, 34, .86);
    --panel-bg: linear-gradient(145deg, rgba(6, 22, 32, .94), rgba(2, 12, 19, .92));
    --panel-border: rgba(89, 242, 176, .16);
    --panel-border-strong: rgba(89, 242, 176, .28);
    --dash-text: #eef9f5;
    --dash-muted: rgba(238, 249, 245, .6);
    --dash-faint: rgba(238, 249, 245, .38);
    --grid-line: rgba(93, 229, 177, .1);
    --accent: #2ee886;
    --accent-rgb: 46, 232, 134;
    --danger: #ff405a;
    --warning: #ff9f1c;
    --blue: #39a2ff;
    flex: 1;
    min-height: 100%;
    overflow: auto;
    padding: clamp(16px, 2vw, 28px);
    color: var(--dash-text);
    background:
      radial-gradient(circle at 75% -10%, rgba(57, 162, 255, .12), transparent 32%),
      radial-gradient(circle at 20% 8%, rgba(var(--accent-rgb), .14), transparent 26%),
      linear-gradient(180deg, rgba(1, 9, 15, .96), var(--dash-bg) 42%, #02080d 100%);
    text-transform: uppercase;
  }

  :global([data-bs-theme="light"]) .system-dashboard {
    --dash-bg: #edf5f2;
    --dash-bg-soft: rgba(255, 255, 255, .86);
    --panel-bg: linear-gradient(145deg, rgba(255, 255, 255, .94), rgba(235, 246, 242, .9));
    --panel-border: rgba(5, 122, 80, .18);
    --panel-border-strong: rgba(5, 122, 80, .32);
    --dash-text: #0a1d19;
    --dash-muted: rgba(10, 29, 25, .62);
    --dash-faint: rgba(10, 29, 25, .42);
    --grid-line: rgba(5, 122, 80, .12);
    background:
      radial-gradient(circle at 75% -10%, rgba(57, 162, 255, .14), transparent 32%),
      radial-gradient(circle at 20% 8%, rgba(var(--accent-rgb), .16), transparent 26%),
      linear-gradient(180deg, #f7fbf9, var(--dash-bg) 48%, #e8f2ee 100%);
  }

  .dashboard-hero,
  .dashboard-actions,
  .phase-strip,
  .status-strip,
  .top-grid,
  .middle-grid,
  .bottom-grid,
  .health-bar,
  .panel-header,
  .status-tile,
  .insight-row,
  .sales-row,
  .region-row,
  .map-summary,
  .donut-layout,
  .callout-card,
  .event-feed-row {
    display: flex;
  }

  .dashboard-hero {
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 18px;
  }

  .dashboard-hero h1 {
    margin: 0;
    color: var(--dash-text);
    font-size: clamp(24px, 2.1vw, 34px);
    font-weight: 800;
    letter-spacing: 0;
    line-height: 1.05;
  }

  .dashboard-hero h1 span {
    color: var(--dash-muted);
    font-weight: 400;
  }

  .dashboard-hero p {
    margin: 8px 0 0;
    color: var(--dash-muted);
    font-size: 13px;
    text-transform: none;
  }

  .dashboard-actions {
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 10px;
  }

  .control-button,
  .select-pill {
    min-height: 42px;
    border: 1px solid var(--panel-border-strong);
    border-radius: 8px;
    background: rgba(8, 20, 30, .62);
    color: var(--dash-text);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    padding: 0 14px;
    font-size: 13px;
    line-height: 1;
  }

  :global([data-bs-theme="light"]) .control-button,
  :global([data-bs-theme="light"]) .select-pill {
    background: rgba(255, 255, 255, .72);
  }

  .control-button:first-child {
    min-width: 252px;
  }

  .phase-strip {
    align-items: stretch;
    gap: 12px;
    margin-bottom: 14px;
  }

  .phase-strip article {
    position: relative;
    flex: 1;
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 0;
    min-height: 74px;
    padding: 14px;
    border: 1px solid var(--panel-border);
    border-radius: 8px;
    background: rgba(8, 20, 30, .42);
    color: var(--dash-muted);
    overflow: hidden;
  }

  :global([data-bs-theme="light"]) .phase-strip article {
    background: rgba(255, 255, 255, .62);
  }

  .phase-strip article.active {
    border-color: var(--panel-border-strong);
    background: linear-gradient(135deg, rgba(var(--accent-rgb), .16), rgba(8, 20, 30, .48));
    box-shadow: 0 0 30px rgba(var(--accent-rgb), .08);
  }

  :global([data-bs-theme="light"]) .phase-strip article.active {
    background: linear-gradient(135deg, rgba(var(--accent-rgb), .18), rgba(255, 255, 255, .74));
  }

  .phase-icon {
    width: 38px;
    height: 38px;
    display: grid;
    flex: 0 0 auto;
    place-items: center;
    border-radius: 8px;
    color: var(--accent);
    background: rgba(var(--accent-rgb), .12);
    font-size: 18px;
  }

  .phase-strip span,
  .phase-strip small {
    display: block;
    color: var(--dash-muted);
    font-size: 11px;
    font-weight: 700;
  }

  .phase-strip strong {
    display: block;
    margin: 2px 0;
    color: var(--dash-text);
    font-size: 13px;
    font-weight: 800;
    line-height: 1.2;
  }

  .phase-strip small {
    font-weight: 500;
    text-transform: none;
  }

  .control-button.icon-only {
    width: 46px;
    min-width: 46px;
    padding: 0;
  }

  .control-button:disabled {
    cursor: wait;
    opacity: .72;
  }

  .spin {
    animation: dashboard-spin .8s linear infinite;
  }

  @keyframes dashboard-spin {
    to {
      transform: rotate(360deg);
    }
  }

  .dashboard-alert {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 14px;
    border: 1px solid rgba(255, 159, 28, .32);
    border-radius: 8px;
    background: rgba(255, 159, 28, .1);
    color: var(--dash-text);
    padding: 10px 14px;
    font-size: 12px;
    text-transform: none;
  }

  .dashboard-alert i {
    color: var(--warning);
  }

  .status-strip {
    align-items: stretch;
    gap: 12px;
    margin-bottom: 14px;
  }

  .status-tile,
  .panel {
    position: relative;
    border: 1px solid var(--panel-border);
    border-radius: 8px;
    background: var(--panel-bg);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, .03), 0 18px 40px rgba(0, 0, 0, .16);
  }

  .status-tile {
    flex: 1;
    align-items: center;
    gap: 18px;
    min-width: 180px;
    min-height: 88px;
    padding: 16px 18px;
    overflow: hidden;
  }

  .status-tile::after {
    content: "";
    position: absolute;
    inset: auto 18px 0;
    height: 1px;
    background: linear-gradient(90deg, transparent, var(--tile-color), transparent);
    opacity: .45;
  }

  .status-icon {
    width: 48px;
    height: 48px;
    display: grid;
    place-items: center;
    border: 1px solid color-mix(in srgb, var(--tile-color) 42%, transparent);
    border-radius: 8px;
    color: var(--tile-color);
    background: color-mix(in srgb, var(--tile-color) 12%, transparent);
    box-shadow: 0 0 24px color-mix(in srgb, var(--tile-color) 18%, transparent);
    font-size: 22px;
  }

  .status-label {
    margin-bottom: 8px;
    color: var(--tile-color);
    font-size: 12px;
    font-weight: 800;
  }

  .status-value {
    display: flex;
    align-items: baseline;
    gap: 8px;
    color: var(--dash-muted);
    font-size: 12px;
    text-transform: none;
  }

  .status-value strong {
    color: var(--dash-text);
    font-size: 30px;
    font-weight: 500;
    line-height: 1;
  }

  .top-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(300px, 420px);
    gap: 14px;
    margin-bottom: 14px;
  }

  .middle-grid {
    display: grid;
    grid-template-columns: minmax(280px, .9fr) minmax(420px, 1.35fr) minmax(300px, 1.1fr);
    gap: 14px;
    margin-bottom: 14px;
  }

  .bottom-grid {
    display: grid;
    grid-template-columns: minmax(520px, 1.55fr) minmax(290px, .85fr) minmax(300px, .9fr) minmax(300px, .9fr);
    gap: 14px;
    margin-bottom: 14px;
  }

  .panel {
    min-width: 0;
    overflow: hidden;
  }

  .panel-header {
    min-height: 52px;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 14px 18px 8px;
  }

  .panel-header.compact {
    min-height: 44px;
    padding-bottom: 6px;
  }

  .panel-header h2 {
    margin: 0;
    color: var(--dash-text);
    font-size: 14px;
    font-weight: 700;
    letter-spacing: 0;
  }

  .select-pill {
    min-height: 32px;
    min-width: 112px;
    color: var(--dash-muted);
    font-size: 12px;
  }

  .campaign-chart {
    position: relative;
    min-height: 332px;
    padding: 24px 54px 58px 46px;
  }

  .axis {
    position: absolute;
    top: 24px;
    bottom: 58px;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    color: var(--dash-muted);
    font-size: 11px;
  }

  .axis-left {
    left: 18px;
  }

  .axis-right {
    right: 10px;
    text-align: right;
  }

  .chart-field {
    position: relative;
    height: 250px;
    overflow: hidden;
    border-bottom: 1px solid var(--grid-line);
  }

  .chart-grid-lines {
    position: absolute;
    inset: 0;
    background-image:
      linear-gradient(var(--grid-line) 1px, transparent 1px),
      linear-gradient(90deg, var(--grid-line) 1px, transparent 1px);
    background-size: 100% 20%, 9.1% 100%;
  }

  .bar-layer {
    position: absolute;
    inset: 0 8px 0 8px;
    display: flex;
    align-items: flex-end;
    gap: 3px;
  }

  .bar-layer span {
    flex: 1;
    min-width: 2px;
    background: linear-gradient(180deg, rgba(var(--accent-rgb), .74), rgba(var(--accent-rgb), .18));
    border-top: 1px solid rgba(128, 255, 190, .88);
    box-shadow: 0 0 14px rgba(var(--accent-rgb), .12);
  }

  .campaign-line {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
  }

  .campaign-line polyline {
    fill: none;
    stroke: #43f48c;
    stroke-width: 3;
    stroke-linejoin: round;
    stroke-linecap: round;
    filter: drop-shadow(0 0 7px rgba(var(--accent-rgb), .45));
  }

  .campaign-line circle {
    fill: #43f48c;
    stroke: rgba(255, 255, 255, .65);
    stroke-width: 1;
  }

  .campaign-area {
    fill: rgba(var(--accent-rgb), .09);
  }

  .campaign-tooltip {
    position: absolute;
    top: 42px;
    right: 52px;
    width: min(160px, 38%);
    border: 1px solid rgba(var(--accent-rgb), .36);
    border-radius: 8px;
    background: rgba(3, 18, 25, .84);
    color: var(--dash-muted);
    padding: 12px 13px;
    font-size: 11px;
    text-transform: none;
    backdrop-filter: blur(6px);
  }

  :global([data-bs-theme="light"]) .campaign-tooltip {
    background: rgba(255, 255, 255, .9);
  }

  .campaign-tooltip strong {
    display: block;
    margin-bottom: 8px;
    color: var(--dash-text);
    font-weight: 600;
  }

  .campaign-tooltip span {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    margin-top: 4px;
  }

  .campaign-tooltip i,
  .chart-legend i {
    display: inline-block;
    width: 8px;
    height: 8px;
    margin-right: 6px;
    border-radius: 2px;
    background: var(--accent);
  }

  .campaign-tooltip b {
    color: var(--dash-text);
    font-weight: 600;
  }

  .x-axis {
    display: grid;
    grid-template-columns: repeat(8, 1fr);
    gap: 6px;
    margin: 12px 8px 0;
    color: var(--dash-muted);
    font-size: 11px;
    text-align: center;
  }

  .chart-legend {
    position: absolute;
    right: 0;
    bottom: 16px;
    left: 0;
    display: flex;
    justify-content: center;
    gap: 22px;
    color: var(--dash-muted);
    font-size: 11px;
    font-weight: 700;
  }

  .chart-legend span:nth-child(2) i {
    background: rgba(var(--accent-rgb), .55);
  }

  .insight-panel {
    padding: 12px 16px;
  }

  .insight-heading {
    padding: 4px 0 10px;
    color: var(--dash-text);
    font-size: 13px;
    font-weight: 700;
    letter-spacing: 0;
  }

  .insight-row {
    position: relative;
    min-height: 73px;
    align-items: center;
    gap: 14px;
    padding: 9px 0;
    border-bottom: 1px solid var(--grid-line);
  }

  .insight-row:last-child {
    border-bottom: 0;
  }

  .insight-row > div:first-child {
    min-width: 128px;
  }

  .insight-label,
  .metric-copy span,
  .map-summary span,
  .activity-table th,
  .health-bar span,
  .updated-note {
    color: var(--dash-muted);
    font-size: 11px;
    font-weight: 600;
  }

  .insight-value {
    margin-top: 4px;
    color: var(--dash-text);
    font-size: 21px;
    line-height: 1.1;
    text-transform: none;
  }

  .insight-delta {
    width: 70px;
    color: var(--accent);
    font-size: 11px;
    font-weight: 800;
  }

  .insight-delta.down {
    color: var(--accent);
  }

  .mini-spark {
    flex: 1;
    min-width: 86px;
    height: 38px;
  }

  .mini-spark polyline {
    fill: none;
    stroke: #42f28c;
    stroke-width: 2.5;
    stroke-linecap: round;
    stroke-linejoin: round;
    filter: drop-shadow(0 0 6px rgba(var(--accent-rgb), .42));
  }

  .sales-panel {
    padding-bottom: 12px;
  }

  .sales-metrics {
    padding: 4px 16px 10px;
  }

  .sales-row {
    align-items: center;
    gap: 12px;
    min-height: 48px;
  }

  .metric-icon {
    width: 32px;
    height: 32px;
    display: grid;
    place-items: center;
    border-radius: 6px;
    color: var(--accent);
    background: rgba(var(--accent-rgb), .1);
  }

  .metric-copy {
    min-width: 84px;
  }

  .metric-copy strong {
    display: block;
    color: var(--dash-text);
    font-size: 15px;
    font-weight: 600;
    text-transform: none;
  }

  .metric-delta {
    width: 76px;
    color: var(--accent);
    font-size: 11px;
    font-weight: 800;
  }

  .region-list {
    margin: 0 16px;
    padding-top: 12px;
    border-top: 1px solid var(--grid-line);
  }

  .region-row {
    align-items: center;
    gap: 12px;
    margin-bottom: 10px;
  }

  .region-row span {
    flex: 1;
    color: var(--dash-text);
    font-size: 12px;
    font-weight: 600;
  }

  .region-row div {
    width: 120px;
    height: 5px;
    border-radius: 999px;
    background: rgba(255, 255, 255, .06);
    overflow: hidden;
  }

  :global([data-bs-theme="light"]) .region-row div {
    background: rgba(8, 36, 28, .08);
  }

  .region-row i {
    display: block;
    width: var(--region-width);
    height: 100%;
    background: linear-gradient(90deg, var(--accent), #55ffaa);
  }

  .region-row strong {
    width: 42px;
    color: var(--dash-text);
    font-size: 12px;
    font-weight: 600;
    text-align: right;
  }

  .updated-note {
    margin: 10px 16px 0;
    text-transform: none;
  }

  .map-panel {
    display: flex;
    flex-direction: column;
  }

  .world-map {
    position: relative;
    flex: 1;
    min-height: 244px;
    margin: 0 16px 10px;
    overflow: hidden;
    border-radius: 8px;
    border: 1px solid rgba(var(--accent-rgb), .1);
    background: #041019;
  }

  :global([data-bs-theme="light"]) .world-map {
    background: #edf8f3;
  }

  .map-summary {
    align-items: stretch;
    margin: 0 16px 16px;
    border: 1px solid var(--grid-line);
    border-radius: 6px;
    overflow: hidden;
  }

  .map-summary div {
    flex: 1;
    padding: 12px;
    text-align: center;
    border-right: 1px solid var(--grid-line);
  }

  .map-summary div:last-child {
    border-right: 0;
  }

  .map-summary strong {
    display: block;
    margin-top: 4px;
    color: var(--dash-text);
    font-size: 18px;
    font-weight: 600;
    text-transform: none;
  }

  .callout-stack {
    display: grid;
    gap: 14px;
  }

  .callout-card {
    align-items: flex-start;
    gap: 16px;
    min-height: 148px;
    padding: 18px;
  }

  .callout-card.slim {
    min-height: 90px;
    align-items: center;
  }

  .callout-icon {
    width: 42px;
    height: 42px;
    display: grid;
    flex: 0 0 auto;
    place-items: center;
    border-radius: 8px;
    color: var(--accent);
    background: rgba(var(--accent-rgb), .14);
    font-size: 24px;
    box-shadow: 0 0 22px rgba(var(--accent-rgb), .14);
  }

  .callout-card p {
    margin: 0;
    color: var(--dash-muted);
    font-size: 12px;
    line-height: 1.7;
  }

  .callout-card strong {
    color: var(--accent);
  }

  .callout-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px 20px;
    margin-top: 18px;
    padding-top: 14px;
    border-top: 1px solid var(--grid-line);
  }

  .callout-grid span {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    color: var(--dash-muted);
    font-size: 11px;
  }

  .source-grid span i {
    width: 8px;
    height: 8px;
    flex: 0 0 auto;
    border-radius: 50%;
    background: var(--source-color);
    box-shadow: 0 0 12px color-mix(in srgb, var(--source-color) 70%, transparent);
  }

  .source-grid span {
    justify-content: flex-start;
  }

  .source-grid b {
    margin-left: auto;
  }

  .callout-grid b {
    color: var(--dash-text);
  }

  .activity-panel {
    min-height: 224px;
  }

  .activity-table-wrap {
    overflow-x: auto;
    padding: 0 16px 16px;
  }

  .activity-table {
    width: 100%;
    min-width: 720px;
    border-collapse: collapse;
    color: var(--dash-muted);
    font-size: 12px;
    text-transform: none;
  }

  .activity-table th,
  .activity-table td {
    padding: 8px 10px;
    border-bottom: 1px solid var(--grid-line);
    white-space: nowrap;
  }

  .activity-table th {
    text-align: left;
    text-transform: uppercase;
  }

  .activity-table td:nth-child(2) {
    white-space: normal;
    min-width: 240px;
  }

  .activity-table td:nth-child(2),
  .activity-table td:nth-child(4),
  .activity-table td:nth-child(5) {
    color: var(--dash-text);
  }

  .table-spark {
    display: block;
    width: 112px;
    height: 34px;
    margin-left: auto;
  }

  .table-spark polyline {
    fill: none;
    stroke: var(--accent);
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
    filter: drop-shadow(0 0 6px rgba(var(--accent-rgb), .38));
  }

  .donut-panel {
    padding-bottom: 16px;
  }

  .donut-layout {
    align-items: center;
    gap: 20px;
    padding: 8px 18px 0;
  }

  .donut {
    width: 142px;
    aspect-ratio: 1;
    flex: 0 0 auto;
    display: grid;
    place-items: center;
    border-radius: 50%;
  }

  .donut > div {
    width: 88px;
    aspect-ratio: 1;
    display: grid;
    place-items: center;
    border-radius: 50%;
    color: var(--dash-text);
    background: var(--dash-bg);
    text-align: center;
    line-height: 1.1;
    text-transform: none;
  }

  :global([data-bs-theme="light"]) .donut > div {
    background: #f4fbf8;
  }

  .donut span {
    color: var(--dash-muted);
    font-size: 13px;
  }

  .donut strong {
    font-size: 20px;
    font-weight: 500;
  }

  .donut small {
    color: var(--dash-muted);
    font-size: 11px;
  }

  .donut-legend {
    flex: 1;
    display: grid;
    gap: 9px;
    min-width: 0;
  }

  .donut-legend div,
  .donut-legend span {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .donut-legend div {
    justify-content: space-between;
    min-width: 0;
    color: var(--dash-muted);
    font-size: 11px;
  }

  .donut-legend i,
  .line-legend i,
  .health-bar div > i:not(.bi) {
    width: 10px;
    height: 10px;
    flex: 0 0 auto;
    border-radius: 50%;
    background: var(--dot-color, var(--accent));
    box-shadow: 0 0 12px color-mix(in srgb, var(--dot-color, var(--accent)) 70%, transparent);
  }

  .donut-legend b {
    color: var(--dash-muted);
    font-size: 11px;
    font-weight: 500;
    text-align: right;
    white-space: nowrap;
  }

  .line-panel {
    padding-bottom: 16px;
  }

  .resource-line-chart {
    height: 150px;
    margin: 4px 18px 12px;
    border: 1px solid var(--grid-line);
    border-radius: 8px;
    background-image:
      linear-gradient(var(--grid-line) 1px, transparent 1px),
      linear-gradient(90deg, var(--grid-line) 1px, transparent 1px);
    background-size: 100% 25%, 25% 100%;
    overflow: hidden;
  }

  .resource-line-chart svg {
    width: 100%;
    height: 100%;
    padding: 16px;
    overflow: visible;
  }

  .resource-line-chart polyline {
    fill: none;
    stroke-width: 2.6;
    stroke-linecap: round;
    stroke-linejoin: round;
    filter: drop-shadow(0 0 6px rgba(var(--accent-rgb), .25));
  }

  .line-legend {
    display: grid;
    gap: 10px;
    padding: 0 18px;
  }

  .line-legend div,
  .line-legend span {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .line-legend div {
    justify-content: space-between;
    min-width: 0;
    color: var(--dash-muted);
    font-size: 11px;
  }

  .line-legend b {
    color: var(--dash-text);
    font-size: 11px;
    font-weight: 600;
    white-space: nowrap;
  }

  .view-all-button {
    border: 0;
    background: transparent;
    color: var(--accent);
    font-size: 11px;
    font-weight: 800;
  }

  .event-feed-panel {
    padding-bottom: 10px;
  }

  .event-feed-list {
    display: grid;
    gap: 8px;
    padding: 4px 14px 14px;
  }

  .event-feed-row {
    align-items: center;
    gap: 10px;
    min-height: 52px;
    padding: 10px;
    border: 1px solid var(--grid-line);
    border-radius: 8px;
    background: rgba(255, 255, 255, .025);
  }

  :global([data-bs-theme="light"]) .event-feed-row {
    background: rgba(255, 255, 255, .58);
  }

  .event-feed-icon {
    width: 34px;
    height: 34px;
    display: grid;
    flex: 0 0 auto;
    place-items: center;
    border-radius: 8px;
    color: var(--event-color, var(--accent));
    background: color-mix(in srgb, var(--event-color, var(--accent)) 14%, transparent);
    box-shadow: 0 0 18px color-mix(in srgb, var(--event-color, var(--accent)) 18%, transparent);
  }

  .event-feed-row.success { --event-color: var(--accent); }
  .event-feed-row.violet { --event-color: #8b5cf6; }
  .event-feed-row.cyan { --event-color: #06b6d4; }
  .event-feed-row.warning { --event-color: var(--warning); }
  .event-feed-row.blue { --event-color: var(--blue); }

  .event-feed-row > div:nth-child(2) {
    min-width: 0;
    flex: 1;
  }

  .event-feed-row strong,
  .event-feed-row span {
    display: block;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .event-feed-row strong {
    color: var(--dash-text);
    font-size: 12px;
    font-weight: 700;
    text-transform: none;
  }

  .event-feed-row span {
    margin-top: 2px;
    color: var(--dash-muted);
    font-size: 11px;
    text-transform: none;
  }

  .event-feed-row b {
    flex: 0 0 auto;
    color: var(--event-color, var(--accent));
    font-size: 12px;
    font-weight: 700;
    text-transform: none;
  }

  .health-bar {
    align-items: center;
    justify-content: space-between;
    gap: 0;
    min-height: 54px;
    border: 1px solid var(--panel-border);
    border-radius: 8px;
    background: var(--panel-bg);
    overflow: hidden;
  }

  .health-bar div {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
    min-height: 54px;
    padding: 0 16px;
    border-right: 1px solid var(--grid-line);
  }

  .health-bar div:last-child {
    border-right: 0;
  }

  .health-bar strong {
    color: var(--dash-text);
    font-size: 12px;
    font-weight: 500;
    text-transform: none;
  }

  .health-bar .bi {
    color: var(--dash-muted);
  }

  @media (max-width: 1439.98px) {
    .status-strip {
      flex-wrap: wrap;
    }

    .phase-strip {
      flex-wrap: wrap;
    }

    .phase-strip article {
      flex: 1 1 calc(33.333% - 12px);
    }

    .status-tile {
      flex: 1 1 calc(33.333% - 12px);
    }

    .middle-grid,
    .bottom-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .callout-stack,
    .activity-panel {
      grid-column: 1 / -1;
    }
  }

  @media (max-width: 1199.98px) {
    .top-grid {
      grid-template-columns: 1fr;
    }

    .insight-panel {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 0 18px;
    }
  }

  @media (max-width: 991.98px) {
    .dashboard-hero {
      align-items: flex-start;
      flex-direction: column;
    }

    .dashboard-actions {
      width: 100%;
      justify-content: stretch;
    }

    .phase-strip article {
      flex-basis: 100%;
    }

    .control-button {
      flex: 1 1 220px;
    }

    .middle-grid,
    .bottom-grid {
      grid-template-columns: 1fr;
    }

    .bottom-grid {
      grid-auto-flow: row;
    }

    .activity-panel,
    .callout-stack {
      grid-column: auto;
    }

    .donut-layout {
      justify-content: flex-start;
    }

    .health-bar {
      flex-wrap: wrap;
    }

    .health-bar div {
      flex: 1 1 50%;
    }
  }

  @media (max-width: 767.98px) {
    .system-dashboard {
      padding: 14px;
    }

    .status-tile {
      flex-basis: 100%;
      min-height: 82px;
    }

    .campaign-chart {
      min-height: 306px;
      padding: 22px 18px 68px 30px;
    }

    .axis-right,
    .campaign-tooltip {
      display: none;
    }

    .bar-layer {
      gap: 2px;
    }

    .x-axis {
      grid-template-columns: repeat(4, 1fr);
      row-gap: 8px;
    }

    .insight-panel {
      grid-template-columns: 1fr;
    }

    .insight-row {
      gap: 10px;
    }

    .insight-row > div:first-child {
      min-width: 108px;
    }

    .middle-grid,
    .top-grid,
    .bottom-grid,
    .callout-stack {
      gap: 12px;
    }

    .world-map {
      min-height: 210px;
    }

    .map-summary {
      flex-direction: column;
    }

    .map-summary div {
      border-right: 0;
      border-bottom: 1px solid var(--grid-line);
    }

    .map-summary div:last-child {
      border-bottom: 0;
    }

    .callout-card,
    .donut-layout {
      align-items: flex-start;
      flex-direction: column;
    }

    .callout-grid {
      grid-template-columns: 1fr;
    }

    .health-bar div {
      flex-basis: 100%;
      justify-content: flex-start;
      border-right: 0;
      border-bottom: 1px solid var(--grid-line);
    }

    .health-bar div:last-child {
      border-bottom: 0;
    }
  }
</style>
