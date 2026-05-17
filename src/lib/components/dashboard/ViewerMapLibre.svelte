<script lang="ts">
  import { onDestroy, onMount } from 'svelte'
  import 'maplibre-gl/dist/maplibre-gl.css'
  import type { AnalyticsGeoMapPoint } from '$lib/api/dashboard'

  type Props = {
    points?: AnalyticsGeoMapPoint[]
  }

  let { points = [] }: Props = $props()

  let container: HTMLDivElement | null = null
  let map: import('maplibre-gl').Map | null = null
  let maplibre: typeof import('maplibre-gl') | null = null
  let loaded = $state(false)
  let usedLocalStyle = false

  const sourceId = 'viewer-location-points'
  const styleUrl = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json'
  const localDarkStyle = {
    version: 8,
    sources: {},
    layers: [
      {
        id: 'background',
        type: 'background',
        paint: {
          'background-color': '#041019'
        }
      }
    ]
  }

  const safePoints = $derived((points ?? []).filter((point) =>
    Number.isFinite(point.lat) && Number.isFinite(point.lon)
  ))

  function toCollection(items: AnalyticsGeoMapPoint[]) {
    return {
      type: 'FeatureCollection',
      features: items.map((point) => ({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [point.lon, point.lat]
        },
        properties: {
          count: point.count || 0,
          label: point.label || 'Unknown'
        }
      }))
    }
  }

  function ensureSourceAndLayers() {
    if (!map || !map.isStyleLoaded()) return

    if (!map.getSource(sourceId)) {
      map.addSource(sourceId, {
        type: 'geojson',
        data: toCollection(safePoints) as GeoJSON.FeatureCollection,
        cluster: true,
        clusterMaxZoom: 7,
        clusterRadius: 54
      })
    }

    if (!map.getLayer('viewer-cluster-halo')) {
      map.addLayer({
        id: 'viewer-cluster-halo',
        type: 'circle',
        source: sourceId,
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': 'rgba(46, 242, 125, 0.16)',
          'circle-radius': ['step', ['get', 'point_count'], 34, 20, 48, 80, 64],
          'circle-blur': 0.65
        }
      })
    }

    if (!map.getLayer('viewer-cluster-core')) {
      map.addLayer({
        id: 'viewer-cluster-core',
        type: 'circle',
        source: sourceId,
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': '#2ef27d',
          'circle-opacity': 0.72,
          'circle-radius': ['step', ['get', 'point_count'], 14, 20, 20, 80, 28],
          'circle-stroke-color': 'rgba(220, 255, 235, 0.76)',
          'circle-stroke-width': 1
        }
      })
    }

    if (!map.getLayer('viewer-point-halo')) {
      map.addLayer({
        id: 'viewer-point-halo',
        type: 'circle',
        source: sourceId,
        filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-color': 'rgba(46, 242, 125, 0.2)',
          'circle-radius': ['interpolate', ['linear'], ['get', 'count'], 1, 14, 50, 38, 500, 60],
          'circle-blur': 0.55
        }
      })
    }

    if (!map.getLayer('viewer-point-core')) {
      map.addLayer({
        id: 'viewer-point-core',
        type: 'circle',
        source: sourceId,
        filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-color': '#54ff9a',
          'circle-radius': ['interpolate', ['linear'], ['get', 'count'], 1, 6, 50, 10, 500, 15],
          'circle-stroke-color': 'rgba(220, 255, 235, 0.86)',
          'circle-stroke-width': 1
        }
      })
    }

    updateSource()
  }

  function updateSource() {
    const source = map?.getSource(sourceId) as import('maplibre-gl').GeoJSONSource | undefined
    source?.setData(toCollection(safePoints) as GeoJSON.FeatureCollection)
  }

  function fitPoints(animate = true) {
    if (!map || !maplibre || !safePoints.length) return
    const bounds = new maplibre.LngLatBounds()
    for (const point of safePoints) bounds.extend([point.lon, point.lat])
    map.fitBounds(bounds, {
      padding: 52,
      maxZoom: 5,
      duration: animate ? 650 : 0
    })
  }

  async function initMap() {
    if (!container || map) return
    maplibre = await import('maplibre-gl')
    map = new maplibre.Map({
      container,
      style: styleUrl,
      center: [100.5018, 13.7563],
      zoom: 2.2,
      minZoom: 1,
      maxZoom: 10,
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
      fitPoints(false)
      // Defensive: parent flex/grid layouts can settle width AFTER MapLibre
      // measured the canvas at construct time, leaving tiles painted at
      // 0×height. rAF-resize forces a remeasure once the page layout settles.
      // Mirrors klynx 3.54.2 / 3.43.6 fix for AnalyticsGeoMap blank-tiles.
      requestAnimationFrame(() => map?.resize())
    })

    map.on('styledata', () => {
      ensureSourceAndLayers()
    })
  }

  $effect(() => {
    if (!loaded) return
    ensureSourceAndLayers()
    if (!safePoints.length) return
    fitPoints()
  })

  onMount(() => {
    void initMap()
  })

  onDestroy(() => {
    map?.remove()
    map = null
  })
</script>

<div class="viewer-maplibre" bind:this={container} aria-label="Viewer location MapLibre map"></div>

<style>
  .viewer-maplibre {
    position: relative;
    width: 100%;
    height: 100%;
    min-height: 244px;
    overflow: hidden;
    border-radius: 8px;
    background:
      linear-gradient(rgba(46, 242, 125, .06) 1px, transparent 1px),
      linear-gradient(90deg, rgba(46, 242, 125, .06) 1px, transparent 1px),
      #041019;
    background-size: 38px 38px;
  }

  :global(.viewer-maplibre .maplibregl-canvas) {
    outline: none;
  }

  :global(.viewer-maplibre .maplibregl-ctrl-group) {
    overflow: hidden;
    border: 1px solid rgba(84, 255, 154, .22);
    border-radius: 6px;
    background: rgba(3, 14, 21, .82);
    box-shadow: 0 12px 30px rgba(0, 0, 0, .26);
  }

  :global(.viewer-maplibre .maplibregl-ctrl button) {
    color: #dfffea;
    background: transparent;
  }

  :global(.viewer-maplibre .maplibregl-ctrl button + button) {
    border-top: 1px solid rgba(84, 255, 154, .16);
  }

  :global(.viewer-maplibre .maplibregl-ctrl-attrib) {
    color: rgba(227, 255, 237, .72);
    background: rgba(3, 14, 21, .72);
  }

  :global(.viewer-maplibre .maplibregl-ctrl-attrib a) {
    color: #54ff9a;
  }

  :global([data-bs-theme="light"] .viewer-maplibre) {
    background:
      linear-gradient(rgba(5, 122, 80, .06) 1px, transparent 1px),
      linear-gradient(90deg, rgba(5, 122, 80, .06) 1px, transparent 1px),
      #edf8f3;
  }
</style>
