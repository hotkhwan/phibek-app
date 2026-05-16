<!-- src/lib/components/intDash/IntDashMap.svelte -->
<script lang="ts">
  import { onDestroy, onMount } from 'svelte'
  import 'maplibre-gl/dist/maplibre-gl.css'
  import type { IntDashEvent, IntDashEventLocation } from '$lib/api/intDash'

  type Props = {
    events?: IntDashEvent[]
    loading?: boolean
  }

  let { events = [], loading = false }: Props = $props()

  type Marker = {
    id: string
    lat: number
    lng: number
    severity: string
    eventClass: string
    eventType: string
    deviceName: string
    occurredAt: string
  }

  let container: HTMLDivElement | null = null
  let map: import('maplibre-gl').Map | null = null
  let maplibre: typeof import('maplibre-gl') | null = null
  let loaded = $state(false)
  let usedLocalStyle = false

  const sourceId = 'intdash-events'
  const styleUrl = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json'
  const localDarkStyle = {
    version: 8,
    sources: {},
    layers: [
      {
        id: 'background',
        type: 'background',
        paint: { 'background-color': '#061018' }
      }
    ]
  }

  function toValidCoord(latIn: unknown, lngIn: unknown): { lat: number; lng: number } | null {
    if (
      typeof latIn !== 'number' ||
      typeof lngIn !== 'number' ||
      !Number.isFinite(latIn) ||
      !Number.isFinite(lngIn) ||
      latIn === 0 ||
      lngIn === 0 ||
      latIn < -90 ||
      latIn > 90 ||
      lngIn < -180 ||
      lngIn > 180
    ) return null
    return { lat: latIn, lng: lngIn }
  }

  function normalizeSeverity(severity?: string): 'high' | 'medium' | 'low' | 'info' | 'none' {
    if (severity === 'high' || severity === 'medium' || severity === 'low' || severity === 'info' || severity === 'none') {
      return severity
    }
    return 'none'
  }

  function markerFromEvent(ev: IntDashEvent): Marker | null {
    const directLocation = (ev as IntDashEvent & { location?: IntDashEventLocation }).location
    const coord = toValidCoord(ev.detail?.location?.lat ?? directLocation?.lat, ev.detail?.location?.lng ?? directLocation?.lng)
    if (!coord) return null
    return {
      id: ev.id || ev.eventId || `${coord.lat}:${coord.lng}:${ev.occurredAt ?? ''}`,
      lat: coord.lat,
      lng: coord.lng,
      severity: normalizeSeverity(ev.severity),
      eventClass: ev.eventClass || '',
      eventType: ev.eventType || '(unspecified)',
      deviceName: ev.deviceName || ev.deviceId || '—',
      occurredAt: ev.occurredAt || ''
    }
  }

  const markers = $derived(events.map(markerFromEvent).filter((item): item is Marker => item !== null))

  function toCollection(items: Marker[]) {
    return {
      type: 'FeatureCollection',
      features: items.map((marker) => ({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [marker.lng, marker.lat]
        },
        properties: marker
      }))
    }
  }

  function escapeHtml(s: string): string {
    return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c)
  }

  function ensureSourceAndLayers() {
    if (!map || !map.isStyleLoaded()) return

    if (!map.getSource(sourceId)) {
      map.addSource(sourceId, {
        type: 'geojson',
        data: toCollection(markers) as GeoJSON.FeatureCollection,
        cluster: true,
        clusterMaxZoom: 8,
        clusterRadius: 52
      })
    }

    if (!map.getLayer('intdash-cluster-halo')) {
      map.addLayer({
        id: 'intdash-cluster-halo',
        type: 'circle',
        source: sourceId,
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': 'rgba(248, 250, 252, .2)',
          'circle-radius': ['step', ['get', 'point_count'], 28, 10, 38, 50, 52],
          'circle-blur': .55
        }
      })
    }

    if (!map.getLayer('intdash-cluster-core')) {
      map.addLayer({
        id: 'intdash-cluster-core',
        type: 'circle',
        source: sourceId,
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': '#f8fafc',
          'circle-radius': ['step', ['get', 'point_count'], 13, 10, 17, 50, 23],
          'circle-stroke-color': 'rgba(15, 23, 42, .8)',
          'circle-stroke-width': 2
        }
      })
    }

    if (!map.getLayer('intdash-cluster-count')) {
      map.addLayer({
        id: 'intdash-cluster-count',
        type: 'symbol',
        source: sourceId,
        filter: ['has', 'point_count'],
        layout: {
          'text-field': ['get', 'point_count_abbreviated'],
          'text-size': 11,
          'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold']
        },
        paint: { 'text-color': '#0f172a' }
      })
    }

    if (!map.getLayer('intdash-event-halo')) {
      map.addLayer({
        id: 'intdash-event-halo',
        type: 'circle',
        source: sourceId,
        filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-color': [
            'match',
            ['get', 'severity'],
            'high',
            '#ef4444',
            'medium',
            '#f97316',
            'low',
            '#3b82f6',
            'info',
            '#9ca3af',
            '#6b7280'
          ],
          'circle-opacity': .18,
          'circle-radius': 20,
          'circle-blur': .6
        }
      })
    }

    if (!map.getLayer('intdash-event-core')) {
      map.addLayer({
        id: 'intdash-event-core',
        type: 'circle',
        source: sourceId,
        filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-color': [
            'match',
            ['get', 'severity'],
            'high',
            '#ef4444',
            'medium',
            '#f97316',
            'low',
            '#3b82f6',
            'info',
            '#9ca3af',
            '#6b7280'
          ],
          'circle-radius': 7,
          'circle-stroke-color': '#f8fafc',
          'circle-stroke-width': 1.2
        }
      })
    }

    updateSource()
  }

  function updateSource() {
    const source = map?.getSource(sourceId) as import('maplibre-gl').GeoJSONSource | undefined
    source?.setData(toCollection(markers) as GeoJSON.FeatureCollection)
  }

  function fitMarkers(animate = true) {
    if (!map || !maplibre || markers.length === 0) return
    const bounds = new maplibre.LngLatBounds()
    for (const marker of markers) bounds.extend([marker.lng, marker.lat])
    map.fitBounds(bounds, { padding: 62, maxZoom: 10, duration: animate ? 650 : 0 })
  }

  function bindInteractions() {
    if (!map || !maplibre) return
    const ml = maplibre
    const m = map
    m.on('click', 'intdash-event-core', (event) => {
      const feature = event.features?.[0]
      const props = feature?.properties as Partial<Marker> | undefined
      const coords = (feature?.geometry as GeoJSON.Point | undefined)?.coordinates
      if (!props || !coords) return
      const html = `
        <div class="intdash-popup">
          <strong>${escapeHtml(props.eventType ?? '(unspecified)')}</strong>
          <span>${escapeHtml(props.deviceName ?? '—')}</span>
          <small>${escapeHtml(props.severity ?? 'none')} · ${escapeHtml(props.eventClass ?? '—')}</small>
        </div>
      `
      new ml.Popup({ closeButton: false, offset: 12 })
        .setLngLat(coords as [number, number])
        .setHTML(html)
        .addTo(m)
    })

    for (const layer of ['intdash-event-core', 'intdash-cluster-core']) {
      map.on('mouseenter', layer, () => {
        if (map) map.getCanvas().style.cursor = 'pointer'
      })
      map.on('mouseleave', layer, () => {
        if (map) map.getCanvas().style.cursor = ''
      })
    }
  }

  async function initMap() {
    if (!container || map) return
    maplibre = await import('maplibre-gl')
    map = new maplibre.Map({
      container,
      style: styleUrl,
      center: [100.5018, 13.7563],
      zoom: 4.2,
      minZoom: 1,
      maxZoom: 16,
      attributionControl: false,
      cooperativeGestures: true
    })

    map.addControl(new maplibre.NavigationControl({ showCompass: false }), 'top-left')
    map.addControl(new maplibre.AttributionControl({ compact: true }), 'bottom-left')

    map.on('error', () => {
      if (!map || loaded || usedLocalStyle) return
      usedLocalStyle = true
      map.setStyle(localDarkStyle as import('maplibre-gl').StyleSpecification)
    })

    map.on('load', () => {
      loaded = true
      ensureSourceAndLayers()
      bindInteractions()
      fitMarkers(false)
    })

    map.on('styledata', () => {
      ensureSourceAndLayers()
    })
  }

  $effect(() => {
    if (!loaded) return
    ensureSourceAndLayers()
    if (markers.length > 0) fitMarkers()
  })

  onMount(() => {
    void initMap()
  })

  onDestroy(() => {
    map?.remove()
    map = null
  })
</script>

<div class="intdash-map-shell">
  <div class="intdash-map" bind:this={container} aria-label="AI event map"></div>
  <div class="map-counter">
    <i class="bi bi-broadcast-pin"></i>
    <span>{markers.length} หมุด</span>
  </div>
  {#if markers.length === 0}
    <div class="map-empty">
      <i class="bi {loading ? 'bi-arrow-clockwise spin' : 'bi-geo-alt'}"></i>
      <span>{loading ? 'กำลังโหลดตำแหน่งเหตุการณ์...' : 'ยังไม่มีเหตุการณ์ที่มีพิกัด'}</span>
    </div>
  {/if}
</div>

<style>
  .intdash-map-shell {
    position: relative;
    width: 100%;
    height: 100%;
    min-height: 430px;
    overflow: hidden;
    border-radius: 8px;
    background:
      linear-gradient(rgba(59, 130, 246, .08) 1px, transparent 1px),
      linear-gradient(90deg, rgba(16, 185, 129, .07) 1px, transparent 1px),
      #061018;
    background-size: 42px 42px;
  }

  .intdash-map {
    width: 100%;
    height: 100%;
    min-height: inherit;
  }

  .map-counter {
    position: absolute;
    top: .85rem;
    right: .85rem;
    z-index: 2;
    display: inline-flex;
    align-items: center;
    gap: .45rem;
    border: 1px solid rgba(248, 250, 252, .16);
    border-radius: 999px;
    background: rgba(2, 6, 23, .72);
    color: rgba(248, 250, 252, .88);
    padding: .38rem .72rem;
    font-size: .78rem;
    backdrop-filter: blur(12px);
  }

  .map-empty {
    position: absolute;
    inset: 0;
    z-index: 1;
    display: grid;
    gap: .6rem;
    place-items: center;
    align-content: center;
    pointer-events: none;
    color: rgba(203, 213, 225, .72);
    font-size: .9rem;
  }

  .map-empty i {
    font-size: 1.7rem;
  }

  .spin {
    animation: intdash-spin .8s linear infinite;
  }

  @keyframes intdash-spin {
    to {
      transform: rotate(360deg);
    }
  }

  :global(.intdash-popup) {
    display: grid;
    gap: .2rem;
    color: #0f172a;
    min-width: 170px;
  }

  :global(.intdash-popup strong) {
    font-size: .84rem;
  }

  :global(.intdash-popup span),
  :global(.intdash-popup small) {
    color: #475569;
    font-size: .75rem;
  }

  :global(.intdash-map-shell .maplibregl-canvas) {
    outline: none;
  }

  :global(.intdash-map-shell .maplibregl-ctrl-group) {
    overflow: hidden;
    border: 1px solid rgba(148, 163, 184, .24);
    border-radius: 6px;
    background: rgba(2, 6, 23, .78);
  }

  :global(.intdash-map-shell .maplibregl-ctrl-attrib) {
    color: rgba(226, 232, 240, .72);
    background: rgba(2, 6, 23, .7);
  }
</style>
