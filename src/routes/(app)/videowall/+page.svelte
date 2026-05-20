<!-- src/routes/(app)/videowall/+page.svelte -->
<script lang="ts">
  import { onDestroy, onMount, tick } from 'svelte'
  import { setPageTitle } from '$lib/utils/title'
  import DomainStarter from '$lib/components/shared/DomainStarter.svelte'
  import VideoPlayer from '$lib/components/shared/VideoPlayer.svelte'
  import { listCameras, listResourceGroups, type Camera, type ResourceGroup } from '$lib/api/devices'
  import { createStream } from '$lib/utils/streamUrl'
  import { WS_TOPICS } from '$lib/realtime/wsTopics'
  import { liveBadgeClass, liveBadgeLabel } from '$lib/realtime/liveStatus'
  import {
    subscribeWsTopic,
    wsHubLastError,
    wsHubStatus
  } from '$lib/stores/wsHub'
  import type { CameraStatusPayload } from '$lib/types/realtime'
  import { m } from '$lib/i18n/messages'

  type StatusT = 'online' | 'warning' | 'offline' | 'alarm'
  type Slot = {
    index: number
    camera: Camera | null
    status: StatusT
    loading: boolean
    error: string
    url: string
    kind: 'flv' | 'webrtc'
  }

  const layoutOptions = [1, 4, 9, 16] as const
  const SEARCH_MAX_LEN = 128

  let cameras = $state<Camera[]>([])
  let groups = $state<ResourceGroup[]>([])
  let slots = $state<Slot[]>([])
  let loading = $state(false)
  let sidebarVisible = $state(true)
  let searchQuery = $state('')
  let ownershipFilter = $state<'all' | 'managed' | 'public'>('all')
  let selectedGroupId = $state('')
  let layoutCount = $state<(typeof layoutOptions)[number]>(9)
  let realtimeDenied = $state('')
  let lastRealtimeAt = $state<string | null>(null)
  let unsubscribeRealtime: (() => void) | null = null
  const seenStatus = new Set<string>()

  const side = $derived(Math.round(Math.sqrt(layoutCount)))
  const filteredCameras = $derived(cameras.filter((camera) => {
    const query = searchQuery.trim().toLowerCase()
    if (query) {
      const haystack = `${camera.name ?? ''} ${camera.district ?? ''} ${camera.location ?? ''} ${camera.camId ?? camera.id ?? ''}`.toLowerCase()
      if (!haystack.includes(query)) return false
    }
    if (selectedGroupId && camera.groupId !== selectedGroupId) return false
    const visibility = String(camera.mapVisibility ?? '').toLowerCase()
    const isPublic = visibility === 'public' || visibility === 'forcepublic'
    if (ownershipFilter === 'managed') return camera.isOwner === true || camera.isOwener === true
    if (ownershipFilter === 'public') return isPublic
    return true
  }))

  function savedLayout(): (typeof layoutOptions)[number] {
    if (typeof localStorage === 'undefined') return 9
    const saved = Number(localStorage.getItem('phibek_vw_layout_count') ?? '')
    return layoutOptions.includes(saved as (typeof layoutOptions)[number])
      ? (saved as (typeof layoutOptions)[number])
      : 9
  }

  function saveLayoutCount(n: (typeof layoutOptions)[number]) {
    layoutCount = n
    localStorage.setItem('phibek_vw_layout_count', String(n))
    reconcileSlots()
  }

  function makeSlot(index: number): Slot {
    return { index, camera: null, status: 'offline', loading: false, error: '', url: '', kind: 'webrtc' }
  }

  function reconcileSlots() {
    const next = slots.slice(0, layoutCount)
    while (next.length < layoutCount) next.push(makeSlot(next.length))
    slots = next.map((slot, index) => ({ ...slot, index }))
  }

  function cameraKey(camera: Camera) {
    return String(camera.camId ?? camera.id)
  }

  function isAta(camera: Camera) {
    return String(camera.brand ?? '').toUpperCase() === 'ATA'
  }

  function getLocationStatus(camera: Camera): StatusT {
    if (camera.alarm === true) return 'alarm'
    if (camera.monitorState === 'online' || camera.online === true || camera.status === true || camera.status === 'online') return 'online'
    if (camera.monitorState === 'suspect') return 'warning'
    return 'offline'
  }

  function statusColor(status: StatusT) {
    if (status === 'online') return '#22c55e'
    if (status === 'warning') return '#f59e0b'
    if (status === 'alarm') return '#ef4444'
    return '#6b7280'
  }

  function setSlot(index: number, patch: Partial<Slot>) {
    slots = slots.map((slot) => (slot.index === index ? { ...slot, ...patch } : slot))
  }

  async function load() {
    loading = true
    const [cameraRes, groupRes] = await Promise.all([
      listCameras({ perPage: 250, sortField: 'name', sortOrder: 'asc' }),
      listResourceGroups({ perPage: 250 })
    ])
    loading = false
    cameras = cameraRes.data?.details?.items ?? []
    groups = groupRes.data?.details?.items ?? []
  }

  async function startSlot(index: number) {
    const slot = slots.find((item) => item.index === index)
    const camera = slot?.camera
    if (!slot || !camera) return

    setSlot(index, { loading: true, error: '' })
    try {
      if (isAta(camera)) {
        const flvUrl = camera.ataWsFlvUrl || camera.streamUrl || camera.url
        if (!flvUrl) throw new Error('ไม่พบ FLV URL สำหรับกล้อง ATA')
        setSlot(index, { url: flvUrl, kind: 'flv' })
        return
      }

      const url = await createStream({ id: cameraKey(camera), url: camera.url ?? camera.streamUrl })
      if (!url) throw new Error('ไม่สามารถสร้าง WebRTC stream ได้')
      setSlot(index, { url, kind: 'webrtc' })
    } catch (err) {
      setSlot(index, { error: err instanceof Error ? err.message : 'เริ่ม stream ไม่สำเร็จ' })
    } finally {
      setSlot(index, { loading: false })
    }
  }

  async function assignToSlot(index: number, camera: Camera) {
    setSlot(index, {
      camera,
      status: getLocationStatus(camera),
      loading: false,
      error: '',
      url: '',
      kind: isAta(camera) ? 'flv' : 'webrtc'
    })
    await tick()
    await startSlot(index)
  }

  function assignToNextEmpty(camera: Camera) {
    const empty = slots.find((slot) => !slot.camera)
    void assignToSlot(empty?.index ?? 0, camera)
  }

  function clearSlot(index: number) {
    setSlot(index, makeSlot(index))
  }

  function clearAllSlots() {
    slots = slots.map((_, index) => makeSlot(index))
  }

  async function retrySlot(index: number) {
    setSlot(index, { url: '', error: '' })
    await tick()
    await startSlot(index)
  }

  function onDragStartCamera(event: DragEvent, camera: Camera) {
    event.dataTransfer?.setData('application/json', JSON.stringify(camera))
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'copy'
  }

  function onDropToSlot(index: number, event: DragEvent) {
    event.preventDefault()
    const raw = event.dataTransfer?.getData('application/json')
    if (!raw) return
    try {
      void assignToSlot(index, JSON.parse(raw) as Camera)
    } catch (err) {
      console.warn('[videowall] drop parse failed', err)
    }
  }

  function applyCameraStatus(payload: CameraStatusPayload) {
    if (!payload?.cameraId || !payload.occurredAt) return
    const key = `${payload.cameraId}:${payload.occurredAt}`
    if (seenStatus.has(key)) return
    seenStatus.add(key)
    if (seenStatus.size > 250) {
      const keep = Array.from(seenStatus).slice(-120)
      seenStatus.clear()
      for (const item of keep) seenStatus.add(item)
    }

    lastRealtimeAt = payload.occurredAt
    cameras = cameras.map((camera) => {
      if (cameraKey(camera) !== payload.cameraId) return camera
      return { ...camera, online: payload.status === 'online', monitorState: payload.status, updateAt: payload.occurredAt }
    })
    slots = slots.map((slot) => {
      if (!slot.camera || cameraKey(slot.camera) !== payload.cameraId) return slot
      const camera = { ...slot.camera, online: payload.status === 'online', monitorState: payload.status, updateAt: payload.occurredAt }
      return { ...slot, camera, status: getLocationStatus(camera) }
    })
  }

  function startRealtime() {
    if (unsubscribeRealtime) return
    realtimeDenied = ''
    unsubscribeRealtime = subscribeWsTopic<CameraStatusPayload>(
      [WS_TOPICS.CAMERA_STATUS],
      (_topic, _ts, payload) => applyCameraStatus(payload),
      {
        onDenied: (topic, reason) => {
          realtimeDenied = `${topic} denied: ${reason}`
        }
      }
    )
  }

  onMount(() => {
    setPageTitle(m.navVideoWall())
    layoutCount = savedLayout()
    reconcileSlots()
    startRealtime()
    void load()
  })

  onDestroy(() => {
    unsubscribeRealtime?.()
  })
</script>

<DomainStarter title={m.navVideoWall()} subtitle="Multi-camera live wall" icon="bi-grid-3x3-gap-fill" legacyName="videowall">
  <div class="videowall-page">
    <section class="videowall-toolbar">
      <div class="layout-picker" aria-label="layout">
        <span>Layout</span>
        {#each layoutOptions as n}
          <button
            type="button"
            class="btn btn-sm"
            class:btn-theme={layoutCount === n}
            class:btn-outline-theme={layoutCount !== n}
            title={`${side}x${side}`}
            onclick={() => saveLayoutCount(n)}
          >
            {n}
          </button>
        {/each}
      </div>
      <div class="toolbar-actions">
        <span class="badge {liveBadgeClass($wsHubStatus)}" title={$wsHubLastError ?? ''}>
          <i class="bi bi-broadcast me-1"></i>{liveBadgeLabel($wsHubStatus)}
        </span>
        {#if lastRealtimeAt}
          <span class="small text-body text-opacity-50">last {new Date(lastRealtimeAt).toLocaleTimeString()}</span>
        {/if}
        <button type="button" class="btn btn-outline-theme btn-sm" onclick={() => (sidebarVisible = !sidebarVisible)}>
          <i class="bi bi-list me-1"></i>{sidebarVisible ? 'Hide cameras' : 'Show cameras'}
        </button>
        <button type="button" class="btn btn-outline-theme btn-sm" onclick={load} disabled={loading}>
          <i class="bi bi-arrow-clockwise me-1"></i>Reload
        </button>
        <button type="button" class="btn btn-outline-secondary btn-sm" onclick={clearAllSlots}>
          <i class="bi bi-eraser me-1"></i>Clear
        </button>
      </div>
    </section>

    {#if realtimeDenied}
      <div class="alert alert-warning small py-2 mb-3">{realtimeDenied}</div>
    {/if}

    <div class="videowall-shell" class:sidebar-hidden={!sidebarVisible}>
      <section
        class="videowall-grid"
        style={`grid-template-columns: repeat(${side}, minmax(0, 1fr)); grid-template-rows: repeat(${side}, minmax(0, 1fr));`}
      >
        {#each slots as slot (slot.index)}
          <article
            class="vw-slot"
            ondragover={(event) => event.preventDefault()}
            ondrop={(event) => onDropToSlot(slot.index, event)}
          >
            {#if !slot.camera}
              <div class="vw-empty">
                <i class="bi bi-camera-video"></i>
                <b>Drop camera</b>
                <span>Slot {slot.index + 1}</span>
              </div>
            {:else}
              <div class="vw-header">
                <div class="vw-title">
                  <span class="status-dot" style={`background:${statusColor(slot.status)}`}></span>
                  <span>{slot.camera.name ?? 'Unknown camera'}</span>
                </div>
                <div class="vw-actions">
                  <button type="button" class="icon-btn" aria-label="Retry" disabled={slot.loading} onclick={() => retrySlot(slot.index)}>
                    <i class="bi bi-arrow-clockwise"></i>
                  </button>
                  <button type="button" class="icon-btn" aria-label="Clear" onclick={() => clearSlot(slot.index)}>
                    <i class="bi bi-x-lg"></i>
                  </button>
                </div>
              </div>
              <div class="vw-player">
                {#if slot.url}
                  <VideoPlayer source={slot.url} kind={slot.kind} class="w-100 h-100" autoplay muted />
                {:else}
                  <button type="button" class="btn btn-outline-theme btn-sm" disabled={slot.loading} onclick={() => startSlot(slot.index)}>
                    {#if slot.loading}<span class="spinner-border spinner-border-sm me-1"></span>{/if}
                    Play
                  </button>
                {/if}
                {#if slot.error}
                  <div class="vw-error">{slot.error}</div>
                {/if}
              </div>
            {/if}
          </article>
        {/each}
      </section>

      {#if sidebarVisible}
        <aside class="camera-sidebar">
          <div class="sidebar-head">
            <b>กล้อง</b>
            <span>{filteredCameras.length}</span>
          </div>
          <div class="sidebar-filters">
            <input
              class="form-control form-control-sm"
              bind:value={searchQuery}
              maxlength={SEARCH_MAX_LEN}
              placeholder="Search camera..."
            />
            <select class="form-select form-select-sm" bind:value={ownershipFilter}>
              <option value="all">All cameras</option>
              <option value="managed">Managed</option>
              <option value="public">Public</option>
            </select>
            <select class="form-select form-select-sm" bind:value={selectedGroupId}>
              <option value="">All groups</option>
              {#each groups as group (group.id)}
                <option value={group.id}>{group.name}</option>
              {/each}
            </select>
          </div>
          <div class="camera-list">
            {#if loading && cameras.length === 0}
              <div class="text-body text-opacity-50 small p-3">Loading cameras...</div>
            {:else if filteredCameras.length === 0}
              <div class="text-body text-opacity-50 small p-3">No cameras found.</div>
            {:else}
              {#each filteredCameras as camera (cameraKey(camera))}
                {@const status = getLocationStatus(camera)}
                <button
                  type="button"
                  class="camera-item"
                  draggable="true"
                  ondragstart={(event) => onDragStartCamera(event, camera)}
                  onclick={() => assignToNextEmpty(camera)}
                >
                  <span class="status-dot" style={`background:${statusColor(status)}`}></span>
                  <span class="camera-name">{camera.name ?? cameraKey(camera)}</span>
                  <small>{camera.district || camera.location || camera.groupName || 'N/A'}</small>
                  <i class="bi bi-arrows-move"></i>
                </button>
              {/each}
            {/if}
          </div>
        </aside>
      {/if}
    </div>
  </div>
</DomainStarter>

<style>
  .videowall-page {
    min-height: calc(100vh - 10rem);
  }

  .videowall-toolbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    margin-bottom: 0.75rem;
  }

  .layout-picker,
  .toolbar-actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
  }

  .layout-picker {
    padding: 0.45rem 0.55rem;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(var(--bs-body-bg-rgb), 0.62);
  }

  .layout-picker span {
    font-weight: 700;
    color: rgba(var(--bs-body-color-rgb), 0.72);
  }

  .videowall-shell {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 20rem;
    gap: 0.75rem;
    height: calc(100vh - 14rem);
    min-height: 32rem;
  }

  .videowall-shell.sidebar-hidden {
    grid-template-columns: minmax(0, 1fr);
  }

  .videowall-grid {
    display: grid;
    gap: 0.5rem;
    min-width: 0;
    min-height: 0;
  }

  .vw-slot {
    position: relative;
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 0.5rem;
    background: #030506;
  }

  .vw-empty {
    display: grid;
    place-items: center;
    align-content: center;
    gap: 0.35rem;
    height: 100%;
    color: rgba(255, 255, 255, 0.45);
    text-align: center;
  }

  .vw-empty i {
    font-size: 2rem;
  }

  .vw-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    min-height: 2.25rem;
    padding: 0.35rem 0.5rem;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    background: rgba(12, 18, 22, 0.9);
  }

  .vw-title {
    display: flex;
    align-items: center;
    gap: 0.45rem;
    min-width: 0;
    font-size: 0.85rem;
    font-weight: 700;
  }

  .vw-title span:last-child {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .vw-actions {
    display: flex;
    gap: 0.25rem;
  }

  .icon-btn {
    display: grid;
    place-items: center;
    width: 1.65rem;
    height: 1.65rem;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(255, 255, 255, 0.04);
    color: rgba(255, 255, 255, 0.75);
  }

  .icon-btn:hover {
    color: #fff;
    border-color: rgba(var(--bs-theme-rgb), 0.6);
  }

  .vw-player {
    position: relative;
    display: grid;
    place-items: center;
    flex: 1;
    min-height: 0;
    background: #000;
  }

  .vw-error {
    position: absolute;
    left: 0.5rem;
    right: 0.5rem;
    bottom: 0.5rem;
    padding: 0.45rem 0.55rem;
    border: 1px solid rgba(239, 68, 68, 0.45);
    background: rgba(69, 10, 10, 0.9);
    color: #fecaca;
    font-size: 0.75rem;
  }

  .camera-sidebar {
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(var(--bs-body-bg-rgb), 0.64);
  }

  .sidebar-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.75rem;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  }

  .sidebar-head span {
    padding: 0.15rem 0.5rem;
    background: rgba(var(--bs-theme-rgb), 0.18);
    color: rgb(var(--bs-theme-rgb));
    font-weight: 700;
  }

  .sidebar-filters {
    display: grid;
    gap: 0.5rem;
    padding: 0.75rem;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  }

  .camera-list {
    overflow-y: auto;
    min-height: 0;
  }

  .camera-item {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    grid-template-rows: auto auto;
    column-gap: 0.55rem;
    row-gap: 0.1rem;
    align-items: center;
    width: 100%;
    padding: 0.65rem 0.75rem;
    border: 0;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    background: transparent;
    color: inherit;
    text-align: left;
  }

  .camera-item:hover {
    background: rgba(var(--bs-theme-rgb), 0.1);
  }

  .camera-item .status-dot {
    grid-row: 1 / span 2;
  }

  .camera-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: 700;
  }

  .camera-item small {
    overflow: hidden;
    color: rgba(var(--bs-body-color-rgb), 0.52);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .camera-item i {
    grid-row: 1 / span 2;
    color: rgba(var(--bs-body-color-rgb), 0.48);
  }

  .status-dot {
    display: inline-block;
    width: 0.65rem;
    height: 0.65rem;
    border-radius: 999px;
    box-shadow: 0 0 0 0.2rem rgba(255, 255, 255, 0.05);
  }

  @media (max-width: 991.98px) {
    .videowall-shell {
      grid-template-columns: 1fr;
      height: auto;
    }

    .videowall-grid {
      min-height: 34rem;
      aspect-ratio: 1;
    }

    .camera-sidebar {
      max-height: 24rem;
    }
  }
</style>
