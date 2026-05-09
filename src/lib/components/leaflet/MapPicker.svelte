<!-- src/lib/components/leaflet/MapPicker.svelte -->
<script lang="ts">
  import { onMount, onDestroy } from 'svelte'
  import { m } from '$lib/i18n/messages'

  let {
    lat = undefined as number | undefined,
    lng = undefined as number | undefined,
    zoom = 13,
    height = '300px',
    readonly = false,
    disabled = false,
    onchange = (_lat: number, _lng: number) => {},
    showLocationButton = false
  } = $props()

  const DEFAULT_LAT = 13.72938
  const DEFAULT_LNG = 100.541382

  function resolveCoords(): [number, number] {
    const isNullish = lat == null || lng == null
    const isZeroZero = lat === 0 && lng === 0
    if (isNullish || isZeroZero) return [DEFAULT_LAT, DEFAULT_LNG]
    return [lat!, lng!]
  }

  let container: HTMLDivElement
  let map: any = null
  let marker: any = null
  let tileLayer: any = null
  let loadingLocation = $state(false)
  let isFullscreen = $state(false)
  // state นี้ใช้ bind class ใน template เพื่อให้ Svelte scoped CSS เห็น
  let darkMode = $state(false)
  let L: any = null
  let themeObserver: MutationObserver | null = null

  const TILES = {
    dark: {
      url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
      subdomains: 'abcd'
    },
    light: {
      url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
      subdomains: 'abcd'
    }
  }

  function checkDark(): boolean {
    const val = document.documentElement.getAttribute('data-bs-theme')
    if (!val) return window.matchMedia('(prefers-color-scheme: dark)').matches
    return val === 'dark'
  }

  function applyTile() {
    if (!map || !L) return
    darkMode = checkDark()
    if (tileLayer) map.removeLayer(tileLayer)
    const cfg = darkMode ? TILES.dark : TILES.light
    tileLayer = L.tileLayer(cfg.url, {
      ...(cfg.subdomains ? { subdomains: cfg.subdomains } : {}),
      maxZoom: 19
    }).addTo(map)
  }

  function createPinIcon() {
    if (!L) return null
    return L.divIcon({
      className: 'custom-map-pin',
      html: `
        <div style="
          width:28px;height:28px;
          background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);
          border:3px solid #fff;border-radius:50% 50% 50% 0;
          transform:rotate(-45deg);
          box-shadow:0 4px 14px rgba(102,126,234,0.6);
        "></div>
        <div style="
          width:10px;height:10px;background:#fff;border-radius:50%;
          position:absolute;top:6px;left:6px;
        "></div>
      `,
      iconSize: [28, 28],
      iconAnchor: [14, 28]
    })
  }

  function placeMarker(newLat: number, newLng: number) {
    if (!map || !L) return
    if (marker) {
      marker.setLatLng([newLat, newLng])
    } else {
      marker = L.marker([newLat, newLng], {
        icon: createPinIcon(),
        draggable: !readonly && !disabled
      }).addTo(map)
      if (!readonly && !disabled) {
        marker.on('dragend', () => {
          const pos = marker.getLatLng()
          onchange(pos.lat, pos.lng)
        })
      }
    }
  }

  function toggleFullscreen() {
    isFullscreen = !isFullscreen
    requestAnimationFrame(() => map?.invalidateSize({ animate: false }))
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape' && isFullscreen) toggleFullscreen()
  }

  onMount(async () => {
    if (typeof window === 'undefined') return

    await import('leaflet/dist/leaflet.css')
    const mod = await import('leaflet')
    L = mod.default

    // set initial darkMode before map init
    darkMode = checkDark()

    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
    )

    if (!container || map) return

    const [initLat, initLng] = resolveCoords()

    map = L.map(container, {
      center: [initLat, initLng],
      zoom,
      worldCopyJump: true,
      zoomControl: !readonly,
      scrollWheelZoom: !readonly && !disabled,
      doubleClickZoom: !readonly && !disabled,
      dragging: !readonly && !disabled
    })

    applyTile()
    placeMarker(initLat, initLng)
    map.invalidateSize({ animate: false })

    if (!readonly && !disabled) {
      map.on('click', (e: { latlng: { lat: number; lng: number } }) => {
        const newLat = e.latlng.lat
        const newLng = ((((e.latlng.lng + 180) % 360) + 360) % 360) - 180
        placeMarker(newLat, newLng)
        onchange(newLat, newLng)
      })
    }

    themeObserver = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.attributeName === 'data-bs-theme') {
          applyTile()
          break
        }
      }
    })
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-bs-theme']
    })

    window.addEventListener('keydown', handleKeydown)
  })

  onDestroy(() => {
    themeObserver?.disconnect()
    themeObserver = null
    if (map) {
      map.remove()
      map = null
    }
    marker = null
    tileLayer = null
    window.removeEventListener('keydown', handleKeydown)
  })

  function loadCurrentLocation() {
    if (!navigator.geolocation) {
      alert('Geolocation is not supported by your browser')
      return
    }
    loadingLocation = true
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        placeMarker(coords.latitude, coords.longitude)
        onchange(coords.latitude, coords.longitude)
        map?.setView([coords.latitude, coords.longitude], zoom)
        loadingLocation = false
      },
      (err) => {
        console.error(err)
        alert('Unable to retrieve your location')
        loadingLocation = false
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    )
  }
</script>

<div class="map-picker-wrapper">
  {#if isFullscreen}
    <!-- role="presentation" แก้ a11y_no_static_element_interactions -->
    <div
      class="fs-backdrop"
      role="presentation"
      onclick={toggleFullscreen}
    ></div>
  {/if}

  <div class="map-outer" class:fullscreen={isFullscreen}>
    {#if !readonly}
      <button
        class="map-fs-btn"
        type="button"
        onclick={toggleFullscreen}
        title={isFullscreen ? m.mapFullscreenMinimize() : m.mapFullscreenExpand()}
      >
        {#if isFullscreen}
          <i class="bi bi-fullscreen-exit"></i>
        {:else}
          <i class="bi bi-fullscreen"></i>
        {/if}
      </button>
    {/if}

    <!--
      ใช้ class:map-dark / class:map-light ใน template แทนการ toggle ด้วย JS
      เพื่อให้ Svelte scoped CSS selector เห็น class และไม่ขึ้น warning css_unused_selector
    -->
    <div
      class="map-picker"
      class:map-dark={darkMode}
      class:map-light={!darkMode}
      class:disabled
      style="height: {isFullscreen ? '100%' : height}; width: 100%;"
      bind:this={container}
    ></div>
  </div>

  {#if showLocationButton && !readonly && !disabled}
    <button
      class="btn btn-sm btn-outline-theme mt-2 w-100"
      type="button"
      onclick={loadCurrentLocation}
      disabled={loadingLocation}
    >
      {#if loadingLocation}
        <span class="spinner-border spinner-border-sm me-1"></span>
        Getting location...
      {:else}
        <i class="bi bi-geo-alt me-1"></i>Use current location
      {/if}
    </button>
  {/if}
</div>

<style>
  .map-picker-wrapper {
    position: relative;
  }

  .map-outer {
    position: relative;
    border-radius: 8px;
    overflow: hidden;
    border: 1px solid var(--bs-border-color, rgba(0, 0, 0, 0.15));
  }

  .fs-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
    z-index: 1999;
  }

  .map-outer.fullscreen {
    position: fixed;
    inset: 40px;
    z-index: 2000;
    border-radius: 12px;
    box-shadow: 0 24px 64px rgba(0, 0, 0, 0.6);
    border: 2px solid var(--bs-border-color, rgba(255, 255, 255, 0.15));
  }

  .map-fs-btn {
    position: absolute;
    top: 10px;
    right: 10px;
    z-index: 1000;
    width: 30px;
    height: 30px;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 14px;
    transition:
      background 0.15s,
      color 0.15s;
    background: var(--bs-body-bg, #fff);
    color: var(--bs-body-color, #333);
    box-shadow: 0 1px 5px rgba(0, 0, 0, 0.3);
  }
  .map-fs-btn:hover {
    background: var(--bs-secondary-bg, #e9ecef);
    color: var(--bs-emphasis-color, #000);
  }

  .map-picker {
    position: relative;
    z-index: 1;
    min-height: 200px;
  }

  .map-picker :global(.leaflet-container) {
    font-family: var(--bs-font-sans-serif, system-ui, sans-serif);
    height: 100%;
  }

  /* ── Dark zoom control ── */
  .map-picker.map-dark :global(.leaflet-bar) {
    border: 1px solid rgba(255, 255, 255, 0.2);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.5);
  }
  .map-picker.map-dark :global(.leaflet-bar a) {
    background-color: #2b3a4e;
    color: #e8edf5;
    border-color: rgba(255, 255, 255, 0.2);
    font-size: 16px;
    font-weight: 700;
    line-height: 26px;
  }
  .map-picker.map-dark :global(.leaflet-bar a:hover) {
    background-color: #3a4f6a;
    color: #fff;
  }

  /* ── Light zoom control ── */
  .map-picker.map-light :global(.leaflet-bar) {
    border: 1px solid #bbb;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
  }
  .map-picker.map-light :global(.leaflet-bar a) {
    background-color: #fff;
    color: #333;
    border-color: #bbb;
    font-size: 16px;
    font-weight: 700;
    line-height: 26px;
  }
  .map-picker.map-light :global(.leaflet-bar a:hover) {
    background-color: #f4f4f4;
    color: #000;
  }

  .map-picker :global(.leaflet-control-attribution) {
    display: none !important;
  }

  .map-picker :global(.custom-map-pin) {
    position: relative;
  }
</style>
