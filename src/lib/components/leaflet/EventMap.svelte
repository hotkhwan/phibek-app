<!-- src/lib/components/leaflet/EventMap.svelte -->
<script lang="ts">
  import { onMount, onDestroy } from 'svelte'
  import type { CircleMarker } from 'leaflet'

  // Props
  let {
    geoCells = [], // Array of { cell, count, lat, lng }
    height = '300px',
    zoom = 6,
    readonly = false,
    onCellClick = () => {}
  } = $props()

  // Default center: ใจกลางประเทศไทย (Bangkok)
  const DEFAULT_CENTER: [number, number] = [13.7563, 100.5018]
  // ค่า zoom สูงสุดเมื่อ fitBounds จุด marker (กันไม่ให้ zoom เข้าจนหลุดบริบทประเทศ)
  const FIT_BOUNDS_MAX_ZOOM = 8

  // Map ready state
  let mapReady = $state(false)

  type GeoCell = { cell: string; count: number; lat: number; lng: number }

  let container: HTMLDivElement
  let map: any = null
  let markers: Array<{ marker: CircleMarker; cell: GeoCell }> = []
  let L: any = null

  // Theme color
  const themeColor = '#0d6efd'

  // รัศมี base (px) จากจำนวน event — ตัวคูณ scale ตาม zoom อีกที
  // cap max 20 (เดิม 30) เพื่อกันจุดใหญ่เกินตอน zoom in
  function baseRadius(count: number): number {
    return Math.min(Math.max(Math.sqrt(count) * 3, 5), 20)
  }

  // Scale factor ตาม zoom: zoom ต่ำ → จุดเล็ก, zoom สูง → จุดโตนิดเดียว
  // slope ลาดกว่าเดิม เพื่อไม่ให้ zoom in จุดโตเกินไป
  // zoom 6 ≈ 0.5, zoom 10 ≈ 0.7, zoom 14+ clamp ที่ 1.0
  function zoomScale(currentZoom: number): number {
    return Math.max(0.3, Math.min(1.0, 0.5 + (currentZoom - 6) * 0.05))
  }

  // Create circle marker for geohash cell
  function createCellMarker(cell: GeoCell): CircleMarker {
    const currentZoom = map?.getZoom() ?? zoom
    const radius = baseRadius(cell.count) * zoomScale(currentZoom)
    // Opacity based on count
    const opacity = Math.min(Math.max(cell.count / 50, 0.3), 0.8)

    const marker = L.circleMarker([cell.lat, cell.lng], {
      radius,
      color: themeColor,
      fillColor: themeColor,
      fillOpacity: opacity,
      weight: 1,
      opacity: 1
    })

    // Add tooltip on hover
    marker.bindTooltip(
      `
        <div style="
          font-family: var(--bs-font-sans-serif);
          padding: 4px 8px;
          background: rgba(15, 26, 46, 0.95);
          border-radius: 4px;
          color: #fff;
        ">
          <strong>${cell.count} events</strong><br/>
          <small>Lat: ${cell.lat.toFixed(4)}</small><br/>
          <small>Lng: ${cell.lng.toFixed(4)}</small>
        </div>
      `,
      {
        direction: 'top',
        offset: [0, -radius - 5],
        className: 'custom-map-tooltip'
      }
    )

    // Click handler
    marker.on('click', () => {
      onCellClick(cell)
    })

    return marker
  }

  function updateMarkers() {
    if (!map || !L) return

    // Remove existing markers
    markers.forEach(({ marker }) => marker.remove())
    markers = []

    // Add new markers
    if (geoCells.length > 0) {
      geoCells.forEach((cell) => {
        const marker = createCellMarker(cell)
        marker.addTo(map)
        markers.push({ marker, cell })
      })

      // Fit bounds to show all markers — แต่จำกัด maxZoom ไว้ไม่ให้ลึกเกินจะยังเห็นบริบทประเทศไทย
      const group = L.featureGroup(markers.map((m) => m.marker))
      const bounds = group.getBounds()
      if (bounds.isValid()) {
        map.fitBounds(bounds, {
          padding: [40, 40],
          maxZoom: FIT_BOUNDS_MAX_ZOOM,
          animate: true
        })
      }
    }
  }

  // ปรับขนาด marker ทุกจุดตาม zoom ปัจจุบัน (เรียกเมื่อ zoomend)
  function rescaleMarkers() {
    if (!map) return
    const scale = zoomScale(map.getZoom())
    markers.forEach(({ marker, cell }) => {
      marker.setRadius(baseRadius(cell.count) * scale)
    })
  }

  onMount(async () => {
    // Only run on client side
    if (typeof window === 'undefined') return

    // Load Leaflet CSS + module (same pattern as MapPicker.svelte)
    await import('leaflet/dist/leaflet.css')
    const leafletModule = await import('leaflet')
    L = leafletModule.default

    // Small delay to ensure DOM is ready
    setTimeout(() => {
      if (!container || map) return

      // Initialize map
      map = L.map(container, {
        center: DEFAULT_CENTER,
        zoom,
        worldCopyJump: true,
        zoomControl: true,
        scrollWheelZoom: !readonly,
        doubleClickZoom: !readonly,
        dragging: !readonly
      })

      // Add CartoDB Dark Matter tiles
      L.tileLayer(
        'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
        {
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
          subdomains: 'abcd',
          maxZoom: 19
        }
      ).addTo(map)

      // ปรับขนาด marker ทุกครั้งที่ zoom เปลี่ยน
      map.on('zoomend', rescaleMarkers)

      // Add markers
      updateMarkers()

      // Ensure proper rendering and mark as ready
      setTimeout(() => {
        map?.invalidateSize({ animate: false })
        mapReady = true
      }, 100)
    }, 50)
  })

  onDestroy(() => {
    if (map) {
      map.remove()
      map = null
      mapReady = false
    }
    markers = []
  })

  // Handle prop changes - update markers
  $effect(() => {
    if (mapReady) {
      updateMarkers()
    }
  })
</script>

<div class="event-map-wrapper" style="height: {height}; width: 100%;">
  <div class="event-map" bind:this={container}></div>
</div>

<style>
  .event-map-wrapper {
    position: relative;
    height: 100%;
  }

  .event-map {
    position: relative;
    z-index: 1;
    height: 100%;
    width: 100%;
    min-height: 200px;
    border-radius: 8px;
    overflow: hidden;
    border: 1px solid var(--border, rgba(255, 255, 255, 0.08));
  }

  .event-map :global(.leaflet-container) {
    height: 100%;
    background: var(--panel, #0f1a2e);
    font-family: var(
      --bs-font-sans-serif,
      system-ui,
      -apple-system,
      'Segoe UI',
      Roboto,
      'Helvetica Neue',
      Arial,
      sans-serif
    );
  }

  .event-map :global(.leaflet-bar) {
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  }

  .event-map :global(.leaflet-bar a) {
    background-color: var(--panel2, #0c1629);
    color: var(--text, #d8e1ff);
    border-color: var(--border, rgba(255, 255, 255, 0.08));
  }

  .event-map :global(.leaflet-bar a:hover) {
    background-color: var(--bg, #0b1220);
  }

  /* Custom tooltip styling */
  .event-map :global(.custom-map-tooltip) {
    background: transparent !important;
    border: none !important;
    box-shadow: none !important;
  }

  .event-map :global(.leaflet-tooltip-left:before) {
    border-left-color: transparent;
  }

  .event-map :global(.leaflet-tooltip-right:before) {
    border-right-color: transparent;
  }

  /* Ensure markers are visible */
  .event-map :global(.leaflet-interactive) {
    cursor: pointer;
  }

  .event-map :global(.leaflet-container a) {
    color: var(--text, #d8e1ff);
  }

  .event-map :global(.leaflet-control-zoom a) {
    background-color: var(--panel, #0f1a2e);
    color: var(--text, #d8e1ff);
  }

  .event-map :global(.leaflet-control-container) {
    display: flex !important;
  }

  .event-map :global(.leaflet-control-zoom) {
    margin-left: auto !important;
    margin-right: auto !important;
  }

  .event-map :global(.leaflet-control-zoom-in) {
    border-radius: 4px !important;
    background-color: var(--bg, #0b1220) !important;
    color: #fff !important;
    border: 1px solid var(--border, rgba(255, 255, 255, 0.08)) !important;
  }

  .event-map :global(.leaflet-control-zoom-out) {
    border-radius: 4px !important;
    background-color: var(--bg, #0b1220) !important;
    color: #fff !important;
    border: 1px solid var(--border, rgba(255, 255, 255, 0.08)) !important;
  }

  .event-map :global(.leaflet-control-attribution) {
    display: none !important;
  }
</style>
