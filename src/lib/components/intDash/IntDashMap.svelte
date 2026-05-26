<!-- src/lib/components/intDash/IntDashMap.svelte -->
<script lang="ts">
  import { onDestroy, onMount } from 'svelte'
  import { browser } from '$app/environment'
  import { WS_TOPICS } from '$lib/realtime/wsTopics'
  import { subscribeWsTopic, wsHubStatus } from '$lib/stores/wsHub'
  import type { WssIngestEventPayload } from '$lib/types/realtime'

  type EventLike = {
    id?: string
    eventId?: string
    eventType?: string
    type?: string
    eventClass?: string
    deviceName?: string
    deviceId?: string
    occurredAt?: string
    severity?: string
    location?: { lat?: unknown; lng?: unknown }
    detail?: {
      location?: { lat?: unknown; lng?: unknown }
      payload?: Record<string, unknown> & { location?: { lat?: unknown; lng?: unknown } }
    }
    payload?: Record<string, unknown>
  }

  type Props = {
    events?: EventLike[]
    loading?: boolean
  }

  let { events = [], loading = false }: Props = $props()

  type MapMarker = {
    id: string
    lat: number
    lng: number
    severity: string
    eventClass?: string
    eventType?: string
    deviceName?: string
    deviceId?: string
    occurredAt: string
    occurredAtMs: number
  }

  const MAX_MARKERS = 200
  const PULSE_WINDOW_MS = 10_000
  const SEVERITY_COLOR: Record<string, string> = {
    high: '#ef4444',
    medium: '#f97316',
    low: '#3b82f6',
    info: '#9ca3af',
    none: '#9ca3af'
  }

  let mapEl: HTMLDivElement | null = null
  let L: typeof import('leaflet') | null = null
  let map: import('leaflet').Map | null = null
  let clusterGroup: import('leaflet').MarkerClusterGroup | null = null
  let currentTileLayer: import('leaflet').TileLayer | null = null
  let markerById = new Map<string, import('leaflet').Marker>()
  let markerMetaById = new Map<string, MapMarker>()
  let insertionOrder: string[] = []
  let sawAnyMarker = $state(false)
  let markerCount = $state(0)
  let liveStatusLabel = $derived($wsHubStatus === 'on' ? 'LIVE' : $wsHubStatus === 'reconnecting' ? 'Syncing' : $wsHubStatus === 'error' ? 'WSS error' : 'REST')
  let unsubscribeRealtime: (() => void) | null = null
  let tick: ReturnType<typeof setInterval> | null = null
  let initPromise: Promise<void> | null = null

  function severityHex(severity?: string | null) {
    if (!severity) return SEVERITY_COLOR.none
    return SEVERITY_COLOR[severity] ?? SEVERITY_COLOR.none
  }

  function parseTs(ts?: string) {
    if (!ts) return Date.now()
    const t = Date.parse(ts)
    return Number.isFinite(t) ? t : Date.now()
  }

  function escapeHtml(s = '') {
    return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c)
  }

  function validCoord(latIn: unknown, lngIn: unknown): { lat: number; lng: number } | null {
    const lat = Number(latIn)
    const lng = Number(lngIn)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
    if (lat === 0 || lng === 0) return null
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null
    return { lat, lng }
  }

  function normalizeSeverity(value: unknown) {
    const v = typeof value === 'string' ? value.toLowerCase() : ''
    return v === 'high' || v === 'medium' || v === 'low' || v === 'info' ? v : 'none'
  }

  function payloadValue(event: EventLike, key: string) {
    return event.payload?.[key] ?? event.detail?.payload?.[key]
  }

  function markerFromEvent(event: EventLike): MapMarker | null {
    const direct = event.location
    const detail = event.detail?.location
    const payloadLocation = payloadValue(event, 'location') as { lat?: unknown; lng?: unknown } | undefined
    const coord =
      validCoord(detail?.lat ?? direct?.lat ?? payloadLocation?.lat, detail?.lng ?? direct?.lng ?? payloadLocation?.lng) ??
      validCoord(payloadValue(event, 'lat') ?? payloadValue(event, 'latitude'), payloadValue(event, 'lng') ?? payloadValue(event, 'longitude'))
    if (!coord) return null
    const occurredAt = event.occurredAt ?? new Date().toISOString()
    return {
      id: event.eventId ?? event.id ?? `${coord.lat}:${coord.lng}:${occurredAt}`,
      lat: coord.lat,
      lng: coord.lng,
      severity: normalizeSeverity(event.severity ?? payloadValue(event, 'severity') ?? payloadValue(event, 'level')),
      eventClass: event.eventClass,
      eventType: event.eventType ?? event.type ?? '(unspecified)',
      deviceName: event.deviceName,
      deviceId: event.deviceId,
      occurredAt,
      occurredAtMs: parseTs(occurredAt)
    }
  }

  function buildMarkerIcon(marker: MapMarker) {
    if (!L) throw new Error('Leaflet not loaded')
    const color = severityHex(marker.severity)
    const pulse = Date.now() - marker.occurredAtMs < PULSE_WINDOW_MS ? ' ai-event-marker--pulse' : ''
    return L.divIcon({
      html: `<div class="ai-event-marker${pulse}" data-occurred-at="${marker.occurredAtMs}" style="--ev-color:${color}"></div>`,
      className: 'ai-event-marker-wrapper',
      iconSize: [16, 16],
      iconAnchor: [8, 8]
    })
  }

  function buildPopupHtml(marker: MapMarker) {
    const severity = marker.severity || 'none'
    const color = severityHex(severity)
    const eventClass = marker.eventClass ? `<div style="font-size:11px;opacity:.7">${escapeHtml(marker.eventClass)}</div>` : ''
    return `<div style="padding:4px 2px;min-width:180px;font-family:inherit">
      <div style="font-weight:600;font-size:13px;line-height:1.3">${escapeHtml(marker.eventType || '(unspecified)')}</div>
      ${eventClass}
      <div style="font-size:11px;opacity:.72;margin-top:4px">${escapeHtml(marker.deviceName || marker.deviceId || '—')}</div>
      <div style="font-size:11px;margin-top:4px;color:${color}">● ${escapeHtml(severity)}</div>
      <div style="font-size:11px;opacity:.55;margin-top:4px">${escapeHtml(marker.occurredAt)}</div>
    </div>`
  }

  function upsertMarker(marker: MapMarker) {
    if (!L || !clusterGroup) return
    const existing = markerById.get(marker.id)
    markerMetaById.set(marker.id, marker)
    if (existing) {
      existing.setLatLng([marker.lat, marker.lng])
      existing.setIcon(buildMarkerIcon(marker))
      existing.setPopupContent(buildPopupHtml(marker))
      return
    }

    const leafMarker = L.marker([marker.lat, marker.lng], { icon: buildMarkerIcon(marker) })
      .bindPopup(buildPopupHtml(marker))
    clusterGroup.addLayer(leafMarker)
    markerById.set(marker.id, leafMarker)
    insertionOrder.push(marker.id)
    sawAnyMarker = true

    while (insertionOrder.length > MAX_MARKERS) {
      const oldId = insertionOrder.shift()
      if (!oldId) break
      const old = markerById.get(oldId)
      if (old) clusterGroup.removeLayer(old)
      markerById.delete(oldId)
      markerMetaById.delete(oldId)
    }
    markerCount = markerById.size
  }

  function fitToMarkers() {
    if (!map || !L || markerById.size === 0) return
    const latLngs = [...markerById.values()].map((marker) => marker.getLatLng())
    if (latLngs.length === 1) {
      map.setView(latLngs[0], 13, { animate: false })
      return
    }
    map.fitBounds(L.latLngBounds(latLngs), { padding: [28, 28], maxZoom: 15, animate: false })
  }

  function seedFromRest(items: EventLike[]) {
    for (const event of items) {
      const marker = markerFromEvent(event)
      if (marker) upsertMarker(marker)
    }
    fitToMarkers()
  }

  async function ensureInit() {
    if (!browser || map || !mapEl) return
    if (initPromise) return initPromise

    initPromise = (async () => {
      await import('leaflet/dist/leaflet.css')
      await import('leaflet.markercluster/dist/MarkerCluster.css')
      await import('leaflet.markercluster/dist/MarkerCluster.Default.css')
      const leaflet = await import('leaflet')
      await import('leaflet.markercluster')
      L = leaflet.default
      if (!mapEl || !L) return

      map = L.map(mapEl, {
        center: [13.7563, 100.5018],
        zoom: 5,
        zoomControl: true,
        attributionControl: true,
        preferCanvas: false
      })

      currentTileLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        maxZoom: 19,
        attribution: '© <a href="https://carto.com/">CARTO</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        subdomains: ['a', 'b', 'c', 'd']
      }).addTo(map)

      clusterGroup = L.markerClusterGroup({
        maxClusterRadius: 60,
        spiderfyOnMaxZoom: true,
        showCoverageOnHover: false,
        zoomToBoundsOnClick: true,
        iconCreateFunction: (cluster) => {
          const count = cluster.getChildCount()
          const size = count < 10 ? 'small' : count < 50 ? 'medium' : 'large'
          return L!.divIcon({
            html: `<div><span>${count}</span></div>`,
            className: `marker-cluster marker-cluster-${size}`,
            iconSize: L!.point(40, 40)
          })
        }
      })
      map.addLayer(clusterGroup)

      requestAnimationFrame(() => map?.invalidateSize())
      setTimeout(() => map?.invalidateSize(), 300)
      seedFromRest(events)
    })()

    return initPromise
  }

  function applyRealtime(data: WssIngestEventPayload) {
    const named = data as WssIngestEventPayload & { deviceName?: string }
    const marker = markerFromEvent({
      id: data.eventId,
      eventId: data.eventId,
      eventType: data.eventType,
      eventClass: data.eventClass,
      deviceName: named.deviceName,
      deviceId: data.deviceId,
      occurredAt: data.occurredAt,
      severity: data.severity,
      location: data.location
    })
    if (marker) upsertMarker(marker)
  }

  $effect(() => {
    if (!map) return
    seedFromRest(events)
  })

  onMount(() => {
    void ensureInit()
    unsubscribeRealtime = subscribeWsTopic<WssIngestEventPayload>(
      [WS_TOPICS.INGEST_EVENT, WS_TOPICS.INGEST_BLACKLIST],
      (_topic, _ts, payload) => applyRealtime(payload)
    )
    tick = setInterval(() => {
      for (const [id, leafMarker] of markerById.entries()) {
        const marker = markerMetaById.get(id)
        if (!marker) continue
        const el = leafMarker.getElement?.()?.querySelector('.ai-event-marker') as HTMLElement | null
        if (el && Date.now() - marker.occurredAtMs > PULSE_WINDOW_MS) el.classList.remove('ai-event-marker--pulse')
      }
    }, 1000)
  })

  onDestroy(() => {
    unsubscribeRealtime?.()
    if (tick) clearInterval(tick)
    tick = null
    if (clusterGroup && map) map.removeLayer(clusterGroup)
    currentTileLayer?.remove()
    map?.remove()
    map = null
    clusterGroup = null
    markerById.clear()
    markerMetaById.clear()
    insertionOrder = []
  })
</script>

<div class="intdash-leaflet-shell">
  <div bind:this={mapEl} class="intdash-leaflet-map"></div>

  <div class="intdash-map-chip intdash-map-live">
    <span class="status-dot" class:on={$wsHubStatus === 'on'} class:warn={$wsHubStatus === 'reconnecting'} class:error={$wsHubStatus === 'error'}></span>
    <span>{liveStatusLabel}</span>
    <span class="opacity-50">·</span>
    <span>{markerCount} หมุด</span>
  </div>

  <div class="intdash-map-chip intdash-map-legend">
    <span><i style="background:#ef4444"></i>รุนแรง</span>
    <span><i style="background:#f97316"></i>ปานกลาง</span>
    <span><i style="background:#3b82f6"></i>ต่ำ</span>
    <span><i style="background:#9ca3af"></i>ข้อมูล / ไม่ระบุ</span>
  </div>

  {#if !sawAnyMarker && !loading}
    <div class="intdash-map-empty">ยังไม่มีเหตุการณ์ที่มีพิกัด — รอข้อมูลจากกล้องที่เปิด geo enrichment</div>
  {/if}
</div>

<style>
  .intdash-leaflet-shell {
    position: relative;
    height: 100%;
    min-height: 0;
    overflow: hidden;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 0.35rem;
    background: #111827;
  }

  .intdash-leaflet-map {
    position: absolute;
    inset: 0;
  }

  .intdash-leaflet-map :global(.leaflet-container) {
    height: 100%;
    background: #111827;
    font-family: var(--bs-font-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif);
  }

  .intdash-map-chip {
    position: absolute;
    z-index: 1000;
    display: flex;
    align-items: center;
    gap: 0.55rem;
    padding: 0.35rem 0.55rem;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 0.25rem;
    background: rgba(var(--bs-body-bg-rgb), 0.86);
    color: rgba(var(--bs-body-color-rgb), 0.76);
    font-size: 0.75rem;
    box-shadow: 0 0.25rem 1rem rgba(0, 0, 0, 0.22);
  }

  .intdash-map-live {
    top: 0.75rem;
    left: 0.75rem;
  }

  .intdash-map-legend {
    left: 0.75rem;
    bottom: 0.75rem;
    flex-wrap: wrap;
  }

  .intdash-map-legend i,
  .status-dot {
    display: inline-block;
    width: 0.5rem;
    height: 0.5rem;
    border-radius: 999px;
    margin-right: 0.25rem;
    background: #9ca3af;
  }

  .status-dot.on { background: #22c55e; }
  .status-dot.warn { background: #f59e0b; }
  .status-dot.error { background: #ef4444; }

  .intdash-map-empty {
    position: absolute;
    z-index: 999;
    top: 50%;
    left: 50%;
    max-width: min(24rem, calc(100% - 2rem));
    transform: translate(-50%, -50%);
    padding: 0.6rem 0.75rem;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 0.25rem;
    background: rgba(var(--bs-body-bg-rgb), 0.86);
    color: rgba(var(--bs-body-color-rgb), 0.7);
    font-size: 0.75rem;
    text-align: center;
    pointer-events: none;
  }

  :global(.ai-event-marker-wrapper) {
    background: transparent;
    border: 0;
  }

  :global(.ai-event-marker) {
    width: 16px;
    height: 16px;
    border: 2px solid rgba(255, 255, 255, 0.9);
    border-radius: 50%;
    background: var(--ev-color, #9ca3af);
    box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.25), 0 1px 2px rgba(0, 0, 0, 0.35);
  }

  :global(.ai-event-marker--pulse) {
    animation: ai-event-pulse 1.6s ease-out infinite;
  }

  @keyframes ai-event-pulse {
    0% { box-shadow: 0 0 0 0 var(--ev-color, #9ca3af), 0 1px 2px rgba(0, 0, 0, 0.35); }
    70% { box-shadow: 0 0 0 12px rgba(0, 0, 0, 0), 0 1px 2px rgba(0, 0, 0, 0.35); }
    100% { box-shadow: 0 0 0 0 rgba(0, 0, 0, 0), 0 1px 2px rgba(0, 0, 0, 0.35); }
  }

  :global(.leaflet-control-attribution) {
    background: rgba(0, 0, 0, 0.5) !important;
    color: rgba(255, 255, 255, 0.8) !important;
  }

  :global(.leaflet-control-attribution a) {
    color: rgba(255, 255, 255, 0.95) !important;
  }
</style>
