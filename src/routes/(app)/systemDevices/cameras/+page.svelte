<!-- src/routes/(app)/systemDevices/cameras/+page.svelte
     Cameras / RTSP / source registry — ports klynx app/pages/systemDevices/cameras/*.
     Layout mirrors systemDevices/edge/+page.svelte (cyber_admin v2.0):
       breadcrumb · header + Add camera · KPI cards · map-visibility filter + search toolbar
       · multi-select table · pagination · combined Add/Edit modal · delete confirm.
     Realtime status (wsHub camera.status), per-row force/sync, monitor sync, and GW sync
     status are preserved from the prior scaffold. CRUD lives here as Bootstrap modals;
     the add/edit/delete sub-routes 307-redirect back to this list. -->
<script lang="ts">
  import { onDestroy, onMount } from 'svelte'
  import { resolve } from '$app/paths'
  import { setPageTitle } from '$lib/utils/title'
  import { appOptions } from '$lib/stores/appOptions'
  import Modal from '$lib/components/shared/Modal.svelte'
  import ConfirmDialog from '$lib/components/shared/ConfirmDialog.svelte'
  import MapPicker from '$lib/components/leaflet/MapPicker.svelte'
  import WebRTCPlayer from '$lib/components/shared/WebRTCPlayer.svelte'
  import {
    listCameras,
    getCamera,
    createCamera,
    updateCamera,
    deleteCamera,
    getCameraGwSyncStatus,
    syncCamera,
    syncCameraMonitor,
    startMediaStream,
    type Camera,
    type CameraInput,
    type RoiPoint,
    type RoiShape,
    type RoiDetail,
    type RoiItem,
    type RoiWire
  } from '$lib/api/devices'
  import { buildWebRTCUrlByIdStrict } from '$lib/utils/streamUrl'
  import { activeWorkspaceId } from '$lib/stores/activeWorkspace'
  import { notify } from '$lib/stores/notify'
  import { m } from '$lib/i18n/messages'
  import { itemsFrom } from '$lib/utils/apiShape'
  import { WS_TOPICS } from '$lib/realtime/wsTopics'
  import {
    subscribeWsTopic,
    wsHubLastError,
    wsHubStatus,
    type LiveStatus
  } from '$lib/stores/wsHub'
  import type { CameraStatusPayload } from '$lib/types/realtime'

  type VisFilter = '' | 'inherit' | 'forcePublic' | 'forcePrivate'

  // ─────────── data ───────────
  let rows = $state<Camera[]>([])
  let loading = $state(false)
  let exporting = $state(false)
  let errorMsg = $state('')
  let activeOrgId = $state('')

  // ─────────── filters ───────────
  let search = $state('')
  let mapVisibility = $state<VisFilter>('')
  let perPage = $state(10)
  const PER_PAGE_OPTIONS = [10, 25, 50, 100]
  let pageIndex = $state(1)

  // ─────────── selection / per-row sync ───────────
  let selectedIds = $state<Set<string>>(new Set())
  let syncingCameraIds = $state<Set<string>>(new Set())
  let syncingAll = $state(false)
  let gwStatusLoading = $state(false)

  // ─────────── realtime ───────────
  let unsubscribeWorkspace: (() => void) | null = null
  let unsubscribeRealtime: (() => void) | null = null
  let realtimeDenied = $state('')
  let lastRealtimeAt = $state<string | null>(null)
  let realtimeRefreshTimer: ReturnType<typeof setTimeout> | null = null
  const seenCameraStatus = new Set<string>()

  // ─────────── modal state ───────────
  type FormMode = 'create' | 'edit'
  let formOpen = $state(false)
  let formMode = $state<FormMode>('create')
  let formBusy = $state(false)
  let editingId = $state<string | null>(null)
  let form = $state<Required<Pick<CameraInput, 'name' | 'url' | 'brand' | 'district' | 'user' | 'password' | 'angle' | 'description' | 'offlineDescription'>> & {
    lat: number | null
    lng: number | null
    mapVisibility: NonNullable<CameraInput['mapVisibility']>
  }>({
    name: '',
    url: '',
    brand: '',
    district: '',
    user: '',
    password: '',
    angle: '',
    description: '',
    offlineDescription: '',
    lat: null,
    lng: null,
    mapVisibility: 'public'
  })

  // Defer mounting the leaflet MapPicker until the modal has finished animating
  // open — leaflet measures 0×0 if it mounts inside a hidden/animating modal.
  let showMap = $state(false)
  $effect(() => {
    if (formOpen) {
      const t = setTimeout(() => (showMap = true), 300)
      return () => clearTimeout(t)
    }
    showMap = false
  })

  // ─────────── stream preview + ROI editor ───────────
  // Ports klynx systemDevices/cameras/{add,edit}.vue: a WebRTC "Test stream"
  // preview plus a click-to-draw polygon/line ROI editor over the video frame.
  let webrtcRef = $state<{ start: (url: string) => Promise<void>; stop: () => void } | null>(null)
  let videoContainerEl = $state<HTMLDivElement | null>(null)
  let previewUrl = $state<string | null>(null)
  let previewError = $state('')
  let previewLoading = $state(false)
  // Defer mounting the WebRTC <video> until the modal animation settles, so the
  // ROI overlay measures a non-zero frame (mirrors the showMap gate).
  let showPreview = $state(false)

  // ROI normalized-frame layout (excludes letterbox bars) — recomputed on each
  // click from the video element's intrinsic aspect ratio.
  type FrameLayout = { widthPct: number; heightPct: number; offsetLeftPct: number; offsetTopPct: number }
  let videoFrameLayout = $state<FrameLayout | null>(null)
  let videoFrameSize = $state<{ width: number; height: number } | null>(null)
  let videoResolution = $state<{ width: number; height: number } | null>(null)

  // Current in-progress shape + the saved ROI list.
  let drawingShape = $state<RoiShape>('poly')
  let drawingPoints = $state<RoiPoint[]>([])
  let isDrawingClosed = $state(false)
  let roiItems = $state<RoiItem[]>([])

  $effect(() => {
    if (formOpen) {
      const t = setTimeout(() => (showPreview = true), 300)
      return () => clearTimeout(t)
    }
    showPreview = false
    void stopPreview()
  })

  function resetRoiState() {
    drawingShape = 'poly'
    drawingPoints = []
    isDrawingClosed = false
    roiItems = []
    previewUrl = null
    previewError = ''
    videoFrameLayout = null
    videoFrameSize = null
    videoResolution = null
  }

  // Map a normalized ROI point into 0–100 SVG viewBox coords, accounting for
  // letterbox offset/scale when the video aspect differs from the container.
  function getSvgPoint(p: RoiPoint): { x: number; y: number } {
    const layout = videoFrameLayout
    if (!layout) return { x: p.x * 100, y: p.y * 100 }
    return {
      x: (layout.offsetLeftPct + p.x * layout.widthPct) * 100,
      y: (layout.offsetTopPct + p.y * layout.heightPct) * 100
    }
  }

  function toSvgPoints(points: RoiPoint[]): string {
    return points
      .filter((p) => p && Number.isFinite(p.x) && Number.isFinite(p.y))
      .map((p) => {
        const { x, y } = getSvgPoint(p)
        return `${x},${y}`
      })
      .join(' ')
  }

  function onRoiClick(e: MouseEvent) {
    const el = videoContainerEl
    if (!el) return
    const rect = el.getBoundingClientRect()
    if (!rect.width || !rect.height) return

    const videoEl = el.querySelector('video') as HTMLVideoElement | null
    const vw = videoEl?.videoWidth ?? 0
    const vh = videoEl?.videoHeight ?? 0
    if (vw && vh) videoResolution = { width: vw, height: vh }

    let frameWidth = rect.width
    let frameHeight = rect.height
    let offsetLeft = 0
    let offsetTop = 0
    if (vw && vh) {
      const videoAspect = vw / vh
      const containerAspect = rect.width / rect.height
      if (videoAspect > containerAspect) {
        frameWidth = rect.width
        frameHeight = frameWidth / videoAspect
        offsetTop = (rect.height - frameHeight) / 2
      } else {
        frameHeight = rect.height
        frameWidth = frameHeight * videoAspect
        offsetLeft = (rect.width - frameWidth) / 2
      }
    }

    videoFrameSize = { width: frameWidth, height: frameHeight }
    videoFrameLayout = {
      widthPct: frameWidth / rect.width,
      heightPct: frameHeight / rect.height,
      offsetLeftPct: offsetLeft / rect.width,
      offsetTopPct: offsetTop / rect.height
    }

    const localX = e.clientX - rect.left - offsetLeft
    const localY = e.clientY - rect.top - offsetTop
    // Ignore clicks that land on the letterbox bars.
    if (localX < 0 || localX > frameWidth || localY < 0 || localY > frameHeight) return

    drawingPoints = [...drawingPoints, { x: localX / frameWidth, y: localY / frameHeight }]
    isDrawingClosed = false
  }

  function setDrawingShape(shape: RoiShape) {
    if (drawingShape === shape) return
    drawingShape = shape
    drawingPoints = []
    isDrawingClosed = false
  }

  function finishPolygon() {
    if (drawingShape === 'poly' && drawingPoints.length >= 3) isDrawingClosed = true
  }

  function undoPoint() {
    if (!drawingPoints.length) return
    drawingPoints = drawingPoints.slice(0, -1)
    isDrawingClosed = false
  }

  function clearDrawing() {
    drawingPoints = []
    isDrawingClosed = false
  }

  function saveCurrentAsPolygon() {
    if (drawingPoints.length < 3) {
      notify.warning('Polygon needs more points', 'A polygon ROI requires at least 3 points.')
      return
    }
    const idx = roiItems.length + 1
    roiItems = [
      ...roiItems,
      { id: `roi-poly-${idx}`, shape: 'poly', points: [...drawingPoints], title: `ROI-${idx}`, detail: 'in' }
    ]
    clearDrawing()
  }

  function saveCurrentAsLine() {
    if (drawingPoints.length !== 4) {
      notify.warning('Line needs 4 points', 'Click 4 points to define 2 in/out lines.')
      return
    }
    const idx = roiItems.length + 1
    roiItems = [
      ...roiItems,
      { id: `roi-line-${idx}`, shape: 'line', points: [...drawingPoints], title: `ROI-${idx}`, detail: 'in-out' }
    ]
    clearDrawing()
  }

  function removeRoi(id: string) {
    roiItems = roiItems.filter((r) => r.id !== id)
  }

  // ─── serialize / hydrate (matches klynx serializeRoiItems + hydrate) ───
  function serializeRoiItems(items: RoiItem[]): RoiWire {
    return items.map((item, idx) => {
      const coords = item.points
        .map((p) => `${Math.round(p.x * 1000)},${Math.round(p.y * 1000)}`)
        .join(',')
      const title = item.title || `ROI-${idx + 1}`
      const detail = item.detail || (item.shape === 'line' ? 'in-out' : 'in')
      return [{ shape: item.shape }, { coords }, { title }, { 'data-detail': detail }]
    })
  }

  function hydrateRoiFromCamera(roiWire: unknown): RoiItem[] {
    if (!Array.isArray(roiWire)) return []

    // New wire shape: [[{shape},{coords},{title},{data-detail}], …]
    if (Array.isArray(roiWire[0])) {
      return (roiWire as Record<string, unknown>[][])
        .map((entry, idx) => {
          const flat = Array.isArray(entry) ? entry : []
          const shape = (flat.find((o) => o?.shape)?.shape as RoiShape) ?? 'poly'
          const coordsStr = (flat.find((o) => o?.coords)?.coords as string | undefined) ?? ''
          const title = (flat.find((o) => o?.title)?.title as string | undefined) ?? `ROI-${idx + 1}`
          const detail =
            (flat.find((o) => o?.['data-detail'])?.['data-detail'] as RoiDetail | undefined) ??
            (shape === 'line' ? 'in-out' : 'in')
          const nums = coordsStr
            .split(',')
            .map((s) => Number(s.trim()))
            .filter((n) => Number.isFinite(n))
          const points: RoiPoint[] = []
          for (let i = 0; i + 1 < nums.length; i += 2) {
            points.push({ x: (nums[i] as number) / 1000, y: (nums[i + 1] as number) / 1000 })
          }
          if (!points.length) return null
          return { id: `roi-${idx + 1}`, shape, title, detail, points } as RoiItem
        })
        .filter((x): x is RoiItem => !!x)
    }

    // Legacy shape: a single flat polygon [{x,y}, …].
    const points: RoiPoint[] = (roiWire as Record<string, unknown>[])
      .map((p) => ({ x: Number(p?.x), y: Number(p?.y) }))
      .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y))
    if (!points.length) return []
    return [{ id: 'roi-1', shape: 'poly', title: 'ROI-1', detail: 'in', points }]
  }

  async function stopPreview() {
    try {
      webrtcRef?.stop()
    } catch {
      /* noop */
    }
  }

  async function resetPreview() {
    await stopPreview()
    previewUrl = null
    previewError = ''
    clearDrawing()
  }

  // Test the stream URL the operator typed: provision a temp ZLMediaKit stream
  // keyed by name/url, then play the built WebRTC URL. Mirrors klynx
  // ensureStreamAndBuildPlayUrl (POST /media/stream { stream, url } → WebRTC).
  async function startPreview() {
    const url = form.url.trim()
    if (!url) {
      previewError = 'Enter a stream URL first.'
      return
    }
    const streamKey = (form.name.trim() || url || 'new-camera-preview').replace(/[^A-Za-z0-9_-]/g, '_')
    previewLoading = true
    previewError = ''
    try {
      const { error } = await startMediaStream({ stream: streamKey, url })
      if (error) throw new Error(error.message)
      const playUrl = buildWebRTCUrlByIdStrict(streamKey)
      if (!playUrl) {
        previewError = 'Could not build a playable stream URL (no browser origin).'
        return
      }
      previewUrl = playUrl
      await webrtcRef?.start(playUrl)
    } catch (err) {
      previewError = (err as { message?: string })?.message ?? 'Failed to start the camera stream.'
    } finally {
      previewLoading = false
    }
  }

  // ─────────── delete confirm ───────────
  let deleteOpen = $state(false)
  let deleteBusy = $state(false)
  let deleteTarget = $state<Camera | null>(null)

  // ─────────── helpers ───────────
  function rowCameraId(row: Camera): string {
    return row.camId ?? row.id
  }

  function sourceLabel(row: Camera): string {
    const source = row.externalSource
    if (!source?.provider) return 'local'
    return source.sourceFamily ? `${source.provider}/${source.sourceFamily}` : source.provider
  }

  function mapVisibilityLabel(value?: string): string {
    if (value === 'forcePublic' || value === 'public') return 'Public'
    if (value === 'forcePrivate' || value === 'private') return 'Private'
    if (value === 'inherit') return 'Inherit'
    return '—'
  }

  function mapVisibilityClass(value?: string): string {
    if (value === 'forcePublic' || value === 'public') return 'text-info'
    if (value === 'forcePrivate' || value === 'private') return 'text-body text-opacity-50'
    return 'text-body text-opacity-75'
  }

  function gwSyncLabel(row: Camera): string {
    return row.externalSource?.gwSyncStatus ?? '—'
  }

  function gwSyncClass(status?: string): string {
    if (status === 'synced') return 'text-success'
    if (status === 'failed') return 'text-danger'
    if (status === 'deferred' || status === 'pending') return 'text-warning'
    if (status === 'localOnly') return 'text-body text-opacity-50'
    return 'text-body text-opacity-50'
  }

  function cameraSyncable(row: Camera): boolean {
    return !!row.externalSource?.provider
  }

  // ─────────── derived ───────────
  const totalCameras = $derived(rows.length)
  const onlineCount = $derived(rows.filter((c) => c.online === true).length)
  const offlineCount = $derived(rows.filter((c) => c.online === false).length)
  const syncedCount = $derived(rows.filter((c) => c.externalSource?.gwSyncStatus === 'synced').length)

  // Map-visibility filter is applied client-side as well as sent to the backend.
  const filtered = $derived(
    rows.filter((c) => {
      if (mapVisibility) {
        const vis = c.mapVisibility ?? ''
        if (mapVisibility === 'forcePublic' && vis !== 'forcePublic' && vis !== 'public') return false
        if (mapVisibility === 'forcePrivate' && vis !== 'forcePrivate' && vis !== 'private') return false
        if (mapVisibility === 'inherit' && vis !== 'inherit') return false
      }
      return true
    })
  )

  const totalEntries = $derived(filtered.length)
  const totalPages = $derived(Math.max(1, Math.ceil(totalEntries / perPage)))
  const safePage = $derived(Math.min(Math.max(1, pageIndex), totalPages))
  const offset = $derived((safePage - 1) * perPage)
  const paged = $derived(filtered.slice(offset, offset + perPage))
  const showingFrom = $derived(totalEntries === 0 ? 0 : offset + 1)
  const showingTo = $derived(Math.min(offset + perPage, totalEntries))

  const pageNumbers = $derived.by(() => {
    const list: number[] = []
    const max = Math.min(totalPages, 6)
    let start = Math.max(1, safePage - 2)
    const end = Math.min(totalPages, start + max - 1)
    start = Math.max(1, end - max + 1)
    for (let i = start; i <= end; i++) list.push(i)
    return list
  })

  const allSelected = $derived(paged.length > 0 && paged.every((c) => selectedIds.has(rowCameraId(c))))
  const someSelected = $derived(paged.some((c) => selectedIds.has(rowCameraId(c))) && !allSelected)

  function visFilterLabel(): string {
    if (!mapVisibility) return 'MAP: ALL'
    if (mapVisibility === 'forcePublic') return 'MAP: PUBLIC'
    if (mapVisibility === 'forcePrivate') return 'MAP: PRIVATE'
    return 'MAP: INHERIT'
  }

  // ─────────── load ───────────
  let searchToken = 0
  async function load() {
    loading = true
    errorMsg = ''
    const myToken = ++searchToken
    try {
      const { data, error } = await listCameras({
        perPage: 250,
        search: search.trim() || undefined,
        mapVisibility: mapVisibility || undefined
      })
      if (myToken !== searchToken) return
      if (error) {
        errorMsg = error.message
        rows = []
      } else {
        rows = itemsFrom<Camera>(data?.details)
      }
      pageIndex = 1
      clearSelection()
    } catch (err) {
      if (myToken !== searchToken) return
      errorMsg = (err as Error)?.message ?? 'Failed to load cameras'
      rows = []
    } finally {
      if (myToken === searchToken) loading = false
    }
  }

  let searchTimer: ReturnType<typeof setTimeout> | null = null
  function onSearchInput() {
    pageIndex = 1
    if (searchTimer) clearTimeout(searchTimer)
    searchTimer = setTimeout(() => load(), 350)
  }

  // ─────────── selection helpers ───────────
  function toggleRow(id: string, checked: boolean) {
    const next = new Set(selectedIds)
    if (checked) next.add(id)
    else next.delete(id)
    selectedIds = next
  }
  function toggleAll(checked: boolean) {
    const next = new Set(selectedIds)
    for (const c of paged) {
      const id = rowCameraId(c)
      if (checked) next.add(id)
      else next.delete(id)
    }
    selectedIds = next
  }
  function clearSelection() {
    selectedIds = new Set()
  }

  // ─────────── create / edit ───────────
  function resetForm() {
    form = {
      name: '',
      url: '',
      brand: '',
      district: '',
      user: '',
      password: '',
      angle: '',
      description: '',
      offlineDescription: '',
      lat: null,
      lng: null,
      mapVisibility: 'public'
    }
  }

  function openCreate() {
    if (!activeOrgId) {
      notify.warning('Select an organization', 'New cameras are added to the active organization. Switch to one first.')
      return
    }
    formMode = 'create'
    editingId = null
    resetForm()
    resetRoiState()
    formOpen = true
  }

  async function openEdit(row: Camera) {
    formMode = 'edit'
    editingId = rowCameraId(row)
    // Seed from the list row first so the modal opens instantly, then hydrate
    // from GET /resources/camera/:id for fields the list omits (url/user/etc).
    form = {
      name: row.name ?? '',
      url: row.url ?? '',
      brand: row.brand ?? '',
      district: row.district ?? '',
      user: row.user ?? '',
      password: '',
      angle: row.angle ?? '',
      description: row.description ?? '',
      offlineDescription: row.offlineDescription ?? '',
      lat: typeof row.lat === 'number' ? row.lat : null,
      lng: typeof row.lng === 'number' ? row.lng : null,
      mapVisibility: (row.mapVisibility as CameraInput['mapVisibility']) ?? 'inherit'
    }
    resetRoiState()
    // Seed ROI from the list row if it already carries it; the full GET below
    // overrides with the authoritative value.
    roiItems = hydrateRoiFromCamera(row.roi)
    formOpen = true
    const id = editingId
    const { data, error } = await getCamera(id)
    if (error || !data?.details || editingId !== id) return
    const d = data.details
    roiItems = hydrateRoiFromCamera(d.roi)
    form = {
      name: d.name ?? form.name,
      url: d.url ?? form.url,
      brand: d.brand ?? form.brand,
      district: d.district ?? form.district,
      user: d.user ?? form.user,
      password: '',
      angle: d.angle ?? form.angle,
      description: d.description ?? form.description,
      offlineDescription: d.offlineDescription ?? form.offlineDescription,
      lat: typeof d.lat === 'number' ? d.lat : form.lat,
      lng: typeof d.lng === 'number' ? d.lng : form.lng,
      mapVisibility: (d.mapVisibility as CameraInput['mapVisibility']) ?? form.mapVisibility
    }
  }

  const formValid = $derived.by(() => {
    if (!form.name.trim()) return false
    if (!form.url.trim()) return false
    return true
  })

  function buildPayload(): CameraInput {
    const body: CameraInput = {
      name: form.name.trim(),
      url: form.url.trim(),
      brand: form.brand.trim() || undefined,
      district: form.district.trim() || undefined,
      user: form.user.trim() || undefined,
      angle: form.angle.trim() || undefined,
      description: form.description.trim() || undefined,
      offlineDescription: form.offlineDescription.trim() || undefined,
      mapVisibility: form.mapVisibility
    }
    if (form.lat !== null && Number.isFinite(form.lat)) body.lat = form.lat
    if (form.lng !== null && Number.isFinite(form.lng)) body.lng = form.lng
    // On edit, only send the password when the operator typed a new one.
    if (form.password) body.password = form.password
    else if (formMode === 'create') body.password = ''
    // Serialized ROI (klynx wire format) — only when shapes are drawn.
    if (roiItems.length) body.roi = serializeRoiItems(roiItems)
    return body
  }

  async function saveForm() {
    if (formBusy) return
    if (!formValid) {
      notify.warning('Missing fields', 'Camera name and stream URL are required.')
      return
    }
    formBusy = true
    try {
      const body = buildPayload()
      if (formMode === 'create') {
        const { error } = await createCamera(body)
        if (error) throw new Error(error.message)
        notify.success('Camera added', form.name.trim())
      } else if (editingId) {
        const { error } = await updateCamera(editingId, body)
        if (error) throw new Error(error.message)
        notify.success('Camera updated', form.name.trim())
      }
      formOpen = false
      await load()
    } catch (err) {
      notify.error('Save failed', (err as { message?: string })?.message ?? 'Unknown error')
    } finally {
      formBusy = false
    }
  }

  // ─────────── per-row sync ───────────
  async function runCameraSync(row: Camera) {
    const id = rowCameraId(row)
    if (!cameraSyncable(row)) {
      notify.warning('Camera is not syncable', 'Local cameras have no externalSource and are rejected by the contract.')
      return
    }
    const next = new Set(syncingCameraIds)
    next.add(id)
    syncingCameraIds = next
    try {
      const res = await syncCamera(id)
      const d = res.details
      const message = d.reason ? `${d.status}: ${d.reason}` : d.status
      if (d.status === 'failed') notify.warning('Camera sync failed', message)
      else if (d.status === 'skipped') notify.info('Camera sync skipped', message)
      else notify.success('Camera synced', message)
      await load()
    } catch (err) {
      notify.error('Camera sync failed', (err as { message?: string })?.message ?? 'Unknown error')
    } finally {
      const cleared = new Set(syncingCameraIds)
      cleared.delete(id)
      syncingCameraIds = cleared
    }
  }

  async function runMonitorSync() {
    if (syncingAll) return
    syncingAll = true
    try {
      const res = await syncCameraMonitor()
      const d = res.details
      const message = `registered ${d.registered} · skipped ${d.skipped} · failed ${d.failed}`
      if (d.failed > 0) notify.warning('Camera monitor sync completed with warnings', message)
      else notify.success('Camera monitor sync complete', message)
      await load()
    } catch (err) {
      notify.error('Camera monitor sync failed', (err as { message?: string })?.message ?? 'Unknown error')
    } finally {
      syncingAll = false
    }
  }

  async function checkGwSyncStatus() {
    gwStatusLoading = true
    const { data, error } = await getCameraGwSyncStatus()
    gwStatusLoading = false
    if (error) {
      notify.warning('GW sync status unavailable', error.message)
      return
    }
    const details = data?.details
    const items = Array.isArray(details) ? details : itemsFrom<Camera>(details)
    const summary = !Array.isArray(details) ? details?.summary : undefined
    const total = summary?.total ?? items.length
    const failed = summary?.failed ?? items.filter((row) => row.externalSource?.gwSyncStatus === 'failed').length
    const deferred = summary?.deferred ?? items.filter((row) => row.externalSource?.gwSyncStatus === 'deferred').length
    notify.info('GW sync status', `non-synced ${total} · failed ${failed} · deferred ${deferred}`)
  }

  // ─────────── delete ───────────
  function openDelete(row: Camera) {
    deleteTarget = row
    deleteOpen = true
  }
  async function confirmDelete() {
    if (!deleteTarget) return
    deleteBusy = true
    const removedId = rowCameraId(deleteTarget)
    const removedName = deleteTarget.name
    try {
      await deleteCamera(removedId)
      notify.success('Camera deleted', removedName)
      rows = rows.filter((r) => rowCameraId(r) !== removedId)
      await load()
    } catch (err) {
      notify.error('Delete failed', (err as { message?: string })?.message ?? 'Unknown error')
    } finally {
      deleteBusy = false
      deleteOpen = false
      deleteTarget = null
    }
  }

  // ─────────── export ───────────
  function exportCsv() {
    if (exporting) return
    exporting = true
    try {
      const exportRows =
        selectedIds.size > 0 ? filtered.filter((c) => selectedIds.has(rowCameraId(c))) : filtered
      const header = ['#', 'Name', 'Brand', 'District', 'Lat', 'Lng', 'Source', 'Map', 'Online', 'GW Sync', 'Updated']
      const lines = exportRows.map((c, i) =>
        [
          i + 1,
          c.name ?? '',
          c.brand ?? '',
          c.district ?? '',
          c.lat ?? '',
          c.lng ?? '',
          sourceLabel(c),
          mapVisibilityLabel(c.mapVisibility),
          c.online ? 'Online' : 'Offline',
          gwSyncLabel(c),
          c.updateAt ?? ''
        ]
          .map((v) => `"${String(v).replace(/"/g, '""')}"`)
          .join(',')
      )
      const csv = [header.join(','), ...lines].join('\n')
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const dt = new Date()
      const stamp = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
      a.download = `cameras-${stamp}.csv`
      a.click()
      URL.revokeObjectURL(url)
      notify.success('Cameras exported', `${exportRows.length} camera${exportRows.length === 1 ? '' : 's'}`)
    } catch (err) {
      notify.error('Export failed', (err as { message?: string })?.message ?? 'Unknown error')
    } finally {
      exporting = false
    }
  }

  function gotoPage(p: number) {
    if (p < 1 || p > totalPages || p === safePage) return
    pageIndex = p
  }

  // ─────────── realtime status (camera.status WSS) ───────────
  function pruneSeenStatus() {
    if (seenCameraStatus.size <= 250) return
    const keep = Array.from(seenCameraStatus).slice(-120)
    seenCameraStatus.clear()
    for (const key of keep) seenCameraStatus.add(key)
  }

  function scheduleRealtimeRefresh() {
    if (realtimeRefreshTimer) clearTimeout(realtimeRefreshTimer)
    realtimeRefreshTimer = setTimeout(() => {
      realtimeRefreshTimer = null
      void load()
    }, 1500)
  }

  function applyCameraStatus(payload: CameraStatusPayload) {
    if (!payload?.cameraId || !payload.occurredAt) return
    const dedupeKey = `${payload.cameraId}:${payload.occurredAt}`
    if (seenCameraStatus.has(dedupeKey)) return
    seenCameraStatus.add(dedupeKey)
    pruneSeenStatus()

    lastRealtimeAt = payload.occurredAt
    rows = rows.map((row) => {
      if (rowCameraId(row) !== payload.cameraId) return row
      return {
        ...row,
        online: payload.status === 'online',
        updateAt: payload.occurredAt
      }
    })
    scheduleRealtimeRefresh()
  }

  function startRealtime() {
    if (unsubscribeRealtime) return
    realtimeDenied = ''
    unsubscribeRealtime = subscribeWsTopic<CameraStatusPayload>(
      [WS_TOPICS.CAMERA_STATUS],
      (_topic, _ts, payload) => applyCameraStatus(payload),
      {
        onDenied: (_topic, reason) => {
          realtimeDenied = `Camera realtime denied: ${reason}`
        }
      }
    )
  }

  function stopRealtime() {
    unsubscribeRealtime?.()
    unsubscribeRealtime = null
    if (realtimeRefreshTimer) clearTimeout(realtimeRefreshTimer)
    realtimeRefreshTimer = null
  }

  function liveBadgeClass(status: LiveStatus): string {
    if (status === 'on') return 'bg-success'
    if (status === 'reconnecting') return 'bg-warning text-dark'
    if (status === 'error') return 'bg-danger'
    return 'bg-secondary'
  }

  function liveBadgeLabel(status: LiveStatus): string {
    if (status === 'on') return 'LIVE'
    if (status === 'reconnecting') return 'Syncing'
    if (status === 'error') return 'WSS error'
    return 'REST'
  }

  // ─────────── lifecycle ───────────
  onMount(() => {
    setPageTitle(`${m.navSystemDevices()} · ${m.navSystemDevicesCameras()}`)
    $appOptions.appContentClass = 'p-0 d-flex flex-column'
    unsubscribeWorkspace = activeWorkspaceId.subscribe((orgId) => {
      activeOrgId = orgId ?? ''
      if (!orgId) {
        stopRealtime()
        rows = []
        errorMsg = 'Select an organization to load cameras.'
        return
      }
      startRealtime()
      void load()
    })
  })

  onDestroy(() => {
    $appOptions.appContentClass = ''
    unsubscribeWorkspace?.()
    stopRealtime()
    if (searchTimer) clearTimeout(searchTimer)
  })
</script>

<div class="cameras-page d-flex flex-column">
  <!-- Breadcrumb -->
  <ul class="breadcrumb border-bottom px-3 py-2 m-0">
    <li class="breadcrumb-item"><a href="#/" onclick={(e) => e.preventDefault()}>{m.navSystemDevices()}</a></li>
    <li class="breadcrumb-item active">{m.navSystemDevicesCameras()}</li>
  </ul>

  <!-- Device-type tabs: edge devices live here in the device list, not as a sidebar link -->
  <ul class="nav nav-tabs px-3 pt-2">
    <li class="nav-item"><a class="nav-link active" href={resolve('/systemDevices/cameras')}><i class="bi bi-camera-video me-1"></i> {m.navSystemDevicesCameras()}</a></li>
    <li class="nav-item"><a class="nav-link" href={resolve('/systemDevices/edge')}><i class="bi bi-hdd-stack me-1"></i> {m.navSystemDevicesEdge()}</a></li>
  </ul>

  <!-- Header -->
  <div class="app-content-header d-flex align-items-end p-3 pb-0 flex-wrap gap-2">
    <div class="page-header mb-0">
      {m.navSystemDevicesCameras()}
      <small>{totalCameras} camera{totalCameras === 1 ? '' : 's'} · RTSP / source registry</small>
    </div>
    <div class="ms-auto d-flex align-items-center gap-2 flex-wrap">
      <span class="badge {liveBadgeClass($wsHubStatus)}" title={$wsHubLastError ?? ''}>
        <i class="bi bi-broadcast me-1"></i>{liveBadgeLabel($wsHubStatus)}
      </span>
      {#if lastRealtimeAt}
        <span class="text-body text-opacity-50 small">{new Date(lastRealtimeAt).toLocaleTimeString()}</span>
      {/if}
      <button type="button" class="btn btn-outline-warning btn-sm" onclick={runMonitorSync} disabled={syncingAll || loading}>
        {#if syncingAll}<span class="spinner-border spinner-border-sm me-1"></span>{:else}<i class="bi bi-hdd-network me-1"></i>{/if}Sync monitor
      </button>
      <button type="button" class="btn btn-outline-secondary btn-sm" onclick={checkGwSyncStatus} disabled={gwStatusLoading}>
        {#if gwStatusLoading}<span class="spinner-border spinner-border-sm me-1"></span>{:else}<i class="bi bi-diagram-3 me-1"></i>{/if}GW status
      </button>
      <button
        type="button"
        class="btn btn-outline-theme text-uppercase"
        onclick={openCreate}
        disabled={!activeOrgId}
        title={activeOrgId ? '' : 'Select an active organization first'}
      >
        <i class="bi bi-plus-lg me-1"></i> Add camera
      </button>
    </div>
  </div>

  <!-- KPI summary cards -->
  <div class="px-3 pt-3">
    <div class="row g-3">
      <div class="col-xl-3 col-md-6">
        <div class="card h-100">
          <div class="card-body d-flex align-items-center justify-content-between py-3">
            <div>
              <div class="text-body text-opacity-50 small text-uppercase fw-semibold">Total</div>
              <div class="display-6 mb-0">{totalCameras.toLocaleString()}</div>
            </div>
            <i class="bi bi-camera-video fs-2 text-body text-opacity-25"></i>
          </div>
          <div class="card-arrow"><div class="card-arrow-top-left"></div><div class="card-arrow-top-right"></div><div class="card-arrow-bottom-left"></div><div class="card-arrow-bottom-right"></div></div>
        </div>
      </div>
      <div class="col-xl-3 col-md-6">
        <div class="card h-100">
          <div class="card-body d-flex align-items-center justify-content-between py-3">
            <div>
              <div class="text-body text-opacity-50 small text-uppercase fw-semibold">Online</div>
              <div class="display-6 mb-0 text-success">{onlineCount.toLocaleString()}</div>
            </div>
            <i class="bi bi-power fs-2 text-success opacity-50"></i>
          </div>
          <div class="card-arrow"><div class="card-arrow-top-left"></div><div class="card-arrow-top-right"></div><div class="card-arrow-bottom-left"></div><div class="card-arrow-bottom-right"></div></div>
        </div>
      </div>
      <div class="col-xl-3 col-md-6">
        <div class="card h-100">
          <div class="card-body d-flex align-items-center justify-content-between py-3">
            <div>
              <div class="text-body text-opacity-50 small text-uppercase fw-semibold">Offline</div>
              <div class="display-6 mb-0 text-danger">{offlineCount.toLocaleString()}</div>
            </div>
            <i class="bi bi-plug fs-2 text-danger opacity-50"></i>
          </div>
          <div class="card-arrow"><div class="card-arrow-top-left"></div><div class="card-arrow-top-right"></div><div class="card-arrow-bottom-left"></div><div class="card-arrow-bottom-right"></div></div>
        </div>
      </div>
      <div class="col-xl-3 col-md-6">
        <div class="card h-100">
          <div class="card-body d-flex align-items-center justify-content-between py-3">
            <div>
              <div class="text-body text-opacity-50 small text-uppercase fw-semibold">GW Synced</div>
              <div class="display-6 mb-0 text-info">{syncedCount.toLocaleString()}</div>
            </div>
            <i class="bi bi-diagram-3 fs-2 text-info opacity-50"></i>
          </div>
          <div class="card-arrow"><div class="card-arrow-top-left"></div><div class="card-arrow-top-right"></div><div class="card-arrow-bottom-left"></div><div class="card-arrow-bottom-right"></div></div>
        </div>
      </div>
    </div>
  </div>

  <!-- Toolbar -->
  <div class="cameras-toolbar p-3 border-bottom">
    <div class="input-group mb-3">
      <button class="btn btn-outline-secondary dropdown-toggle text-uppercase" type="button" data-bs-toggle="dropdown" aria-expanded="false">
        {visFilterLabel()} &nbsp;
      </button>
      <div class="dropdown-menu">
        <button type="button" class="dropdown-item text-uppercase" onclick={() => { mapVisibility = ''; pageIndex = 1; load() }}>All</button>
        <button type="button" class="dropdown-item text-uppercase" onclick={() => { mapVisibility = 'forcePublic'; pageIndex = 1; load() }}>Public</button>
        <button type="button" class="dropdown-item text-uppercase" onclick={() => { mapVisibility = 'forcePrivate'; pageIndex = 1; load() }}>Private</button>
        <button type="button" class="dropdown-item text-uppercase" onclick={() => { mapVisibility = 'inherit'; pageIndex = 1; load() }}>Inherit</button>
      </div>
      <div class="flex-fill position-relative">
        <div class="input-group">
          <div class="input-group-text position-absolute top-0 bottom-0 bg-none border-0 pe-0">
            <i class="fa fa-search opacity-5"></i>
          </div>
          <input
            type="text"
            class="form-control ps-30px border-start-0"
            placeholder="Search cameras…"
            bind:value={search}
            oninput={onSearchInput}
            onkeydown={(e) => {
              if (e.key === 'Enter') {
                if (searchTimer) { clearTimeout(searchTimer); searchTimer = null }
                load()
              }
            }}
          />
        </div>
      </div>
    </div>

    <div class="d-flex flex-wrap gap-4 text-uppercase text-nowrap mb-n2 small">
      <button
        type="button"
        class="btn btn-link p-0 fw-semibold text-body text-opacity-75 d-flex align-items-center gap-2 text-decoration-none"
        onclick={exportCsv}
        disabled={loading || exporting || rows.length === 0}
        title={selectedIds.size > 0 ? `Export ${selectedIds.size} selected` : 'Export all (filtered)'}
      >
        <i class={`fa ${exporting ? 'fa-spinner fa-spin' : 'fa-download'} fa-fw text-body text-opacity-25`}></i>
        {exporting ? 'Exporting…' : 'Export'}
      </button>
      <button type="button" class="btn btn-link p-0 fw-semibold text-body text-opacity-75 d-flex align-items-center gap-2 text-decoration-none" onclick={load} disabled={loading}>
        <i class="fa fa-arrows-rotate fa-fw text-body text-opacity-25"></i>
        {loading ? 'Loading…' : 'Refresh'}
      </button>
      {#if search || mapVisibility}
        <button type="button" class="btn btn-link p-0 fw-semibold text-body text-opacity-75 d-flex align-items-center gap-2 text-decoration-none" onclick={() => { search = ''; mapVisibility = ''; pageIndex = 1; load() }}>
          <i class="fa fa-xmark fa-fw text-body text-opacity-25"></i> Clear
        </button>
      {/if}
      <div class="ms-auto text-body text-opacity-50 d-flex align-items-center gap-2">
        <span>Per page</span>
        <select class="form-select form-select-sm" style="width: auto" bind:value={perPage} onchange={() => (pageIndex = 1)}>
          {#each PER_PAGE_OPTIONS as n}
            <option value={n}>{n}</option>
          {/each}
        </select>
      </div>
    </div>
  </div>

  {#if errorMsg}
    <div class="alert alert-danger small mx-3 mt-3 mb-0">{errorMsg}</div>
  {/if}
  {#if realtimeDenied}
    <div class="alert alert-warning small mx-3 mt-3 mb-0">{realtimeDenied}</div>
  {/if}

  <!-- Table -->
  <div class="cameras-table-region">
    <div class="table-responsive cameras-table-scroll">
      <table class="table table-striped table-sm table-card text-nowrap mb-1 align-middle">
        <thead>
          <tr>
            <th style="width: 36px;">
              <input
                type="checkbox"
                class="form-check-input"
                aria-label="Select all"
                checked={allSelected}
                indeterminate={someSelected}
                onchange={(e) => toggleAll(e.currentTarget.checked)}
              />
            </th>
            <th style="width: 44px;" class="text-center">#</th>
            <th>Name</th>
            <th>Brand</th>
            <th>District</th>
            <th>Lat / Lng</th>
            <th>Source</th>
            <th>Map</th>
            <th class="text-center">Online</th>
            <th>GW Sync</th>
            <th>Updated</th>
            <th class="text-end" style="width: 132px;">Actions</th>
          </tr>
        </thead>
        <tbody>
          {#if loading && rows.length === 0}
            <tr><td colspan="12" class="text-center py-4 text-uppercase text-body text-opacity-50">
              <div class="spinner-border spinner-border-sm text-theme me-2"></div>Loading…
            </td></tr>
          {:else if paged.length === 0}
            <tr><td colspan="12" class="text-center py-4 text-uppercase text-body text-opacity-50">No cameras</td></tr>
          {:else}
            {#each paged as c, i (rowCameraId(c))}
              <tr>
                <td>
                  <input
                    type="checkbox"
                    class="form-check-input"
                    aria-label={`Select ${c.name}`}
                    checked={selectedIds.has(rowCameraId(c))}
                    onchange={(e) => toggleRow(rowCameraId(c), e.currentTarget.checked)}
                  />
                </td>
                <td class="text-center text-body text-opacity-50">{offset + i + 1}</td>
                <td class="fw-semibold">{c.name || '—'}</td>
                <td class="text-body text-opacity-75">{c.brand || '—'}</td>
                <td class="text-body text-opacity-75">{c.district || '—'}</td>
                <td class="text-body text-opacity-50">
                  {#if typeof c.lat === 'number' && typeof c.lng === 'number'}
                    {c.lat.toFixed(5)}, {c.lng.toFixed(5)}
                  {:else}
                    —
                  {/if}
                </td>
                <td><span class="text-body text-opacity-75">{sourceLabel(c)}</span></td>
                <td><span class={mapVisibilityClass(c.mapVisibility)}>{mapVisibilityLabel(c.mapVisibility)}</span></td>
                <td class="text-center">
                  {#if c.online}
                    <i class="bi bi-circle-fill text-success" title="Online"></i>
                  {:else}
                    <i class="bi bi-circle-fill text-body text-opacity-25" title="Offline"></i>
                  {/if}
                </td>
                <td><span class={`small fw-semibold ${gwSyncClass(c.externalSource?.gwSyncStatus)}`}>{gwSyncLabel(c)}</span></td>
                <td class="text-body text-opacity-75">{c.updateAt ? new Date(c.updateAt).toLocaleString() : '—'}</td>
                <td class="text-end">
                  <div class="btn-group btn-group-sm cameras-row-actions" role="group" aria-label={`Actions for ${c.name}`}>
                    <button type="button" class="btn btn-outline-secondary" title="Sync" aria-label={`Sync ${c.name}`} onclick={() => runCameraSync(c)} disabled={!cameraSyncable(c) || syncingCameraIds.has(rowCameraId(c))}>
                      {#if syncingCameraIds.has(rowCameraId(c))}<span class="spinner-border spinner-border-sm"></span>{:else}<i class="bi bi-arrow-repeat"></i>{/if}
                    </button>
                    <button type="button" class="btn btn-outline-secondary" title="Edit" aria-label={`Edit ${c.name}`} onclick={() => openEdit(c)}>
                      <i class="bi bi-pencil"></i>
                    </button>
                    <button type="button" class="btn btn-outline-danger" title="Delete" aria-label={`Delete ${c.name}`} onclick={() => openDelete(c)}>
                      <i class="bi bi-trash"></i>
                    </button>
                  </div>
                </td>
              </tr>
            {/each}
          {/if}
        </tbody>
      </table>
    </div>
  </div>

  <!-- Pagination footer -->
  <div class="p-3 border-top">
    <div class="d-lg-flex align-items-center gap-3">
      <div class="text-body text-opacity-50 flex-1 text-lg-start text-center mb-2 mb-lg-0">
        Showing <span class="text-body">{showingFrom} to {showingTo}</span> of <span class="text-body">{totalEntries}</span> entries
        {#if selectedIds.size > 0}<span class="ms-2 text-theme">· {selectedIds.size} selected</span>{/if}
      </div>
      <ul class="pagination pagination-sm mb-0 justify-content-center">
        <li class="page-item" class:disabled={safePage <= 1}>
          <button type="button" class="page-link" onclick={() => gotoPage(safePage - 1)} disabled={safePage <= 1}>Previous</button>
        </li>
        {#each pageNumbers as p}
          <li class="page-item" class:active={p === safePage}>
            <button type="button" class="page-link" onclick={() => gotoPage(p)}>{p}</button>
          </li>
        {/each}
        <li class="page-item" class:disabled={safePage >= totalPages}>
          <button type="button" class="page-link" onclick={() => gotoPage(safePage + 1)} disabled={safePage >= totalPages}>Next</button>
        </li>
      </ul>
    </div>
  </div>
</div>

<!-- Create / Edit modal -->
<Modal bind:open={formOpen} title={formMode === 'create' ? 'Add camera' : 'Edit camera'} size="lg" dismissible={!formBusy}>
  {#snippet body()}
    <div class="cameras-form">
      <div class="row g-3">
        <div class="col-md-8">
          <label class="form-label" for="cam-name">Camera name <span class="text-danger">*</span></label>
          <input id="cam-name" class="form-control form-control-sm" bind:value={form.name} placeholder="e.g. Front entrance — Building A" />
        </div>
        <div class="col-md-4">
          <label class="form-label" for="cam-vis">Map visibility</label>
          <select id="cam-vis" class="form-select form-select-sm" bind:value={form.mapVisibility}>
            <option value="public">Public</option>
            <option value="forcePublic">Force public</option>
            <option value="forcePrivate">Force private</option>
            <option value="inherit">Inherit</option>
            <option value="internal">Internal</option>
          </select>
        </div>

        <div class="col-12">
          <label class="form-label" for="cam-url">Stream URL <span class="text-danger">*</span></label>
          <input id="cam-url" class="form-control form-control-sm" bind:value={form.url} placeholder="rtsp://… or http://…" />
        </div>

        <div class="col-md-6">
          <label class="form-label" for="cam-brand">Brand</label>
          <input id="cam-brand" class="form-control form-control-sm" bind:value={form.brand} placeholder="e.g. Hikvision, Dahua" />
        </div>
        <div class="col-md-6">
          <label class="form-label" for="cam-district">District</label>
          <input id="cam-district" class="form-control form-control-sm" bind:value={form.district} placeholder="e.g. Din Daeng" />
        </div>

        <!-- Map pin picker — click or drag the marker to set lat/lng (writes form.lat/lng). -->
        <div class="col-12">
          <div class="form-label">Location · click or drag the pin to set coordinates</div>
          {#if showMap}
            <MapPicker
              lat={form.lat ?? undefined}
              lng={form.lng ?? undefined}
              height="260px"
              showLocationButton
              onchange={(la: number, ln: number) => { form.lat = la; form.lng = ln }}
            />
          {:else}
            <div class="cam-map-placeholder d-flex align-items-center justify-content-center text-body text-opacity-50">
              <span class="spinner-border spinner-border-sm me-2"></span> Loading map…
            </div>
          {/if}
        </div>
        <div class="col-md-6">
          <label class="form-label" for="cam-lat">Latitude</label>
          <input id="cam-lat" type="number" step="any" inputmode="decimal" class="form-control form-control-sm" bind:value={form.lat} placeholder="e.g. 13.7563" />
        </div>
        <div class="col-md-6">
          <label class="form-label" for="cam-lng">Longitude</label>
          <input id="cam-lng" type="number" step="any" inputmode="decimal" class="form-control form-control-sm" bind:value={form.lng} placeholder="e.g. 100.5018" />
        </div>

        <div class="col-md-6">
          <label class="form-label" for="cam-angle">Camera angle (0–359)</label>
          <input id="cam-angle" class="form-control form-control-sm" bind:value={form.angle} placeholder="e.g. 0, 90, 180" />
        </div>
        <div class="col-md-6">
          <label class="form-label" for="cam-user">Camera user</label>
          <input id="cam-user" class="form-control form-control-sm" bind:value={form.user} autocomplete="off" placeholder="e.g. admin" />
        </div>

        <div class="col-md-6">
          <label class="form-label" for="cam-password">
            Camera password
            {#if formMode === 'edit'}<span class="text-body text-opacity-50 text-lowercase fw-normal">(leave blank to keep)</span>{/if}
          </label>
          <input id="cam-password" type="password" class="form-control form-control-sm" bind:value={form.password} autocomplete="new-password" placeholder="Enter password if any" />
        </div>

        <div class="col-12">
          <label class="form-label" for="cam-desc">Description</label>
          <textarea id="cam-desc" rows="2" class="form-control form-control-sm" bind:value={form.description} placeholder="Install notes, admin contact, etc."></textarea>
        </div>
        <div class="col-12">
          <label class="form-label" for="cam-offline">Offline description</label>
          <textarea id="cam-offline" rows="2" class="form-control form-control-sm" bind:value={form.offlineDescription} placeholder="e.g. testing, power outage, cabling maintenance…"></textarea>
        </div>

        <!-- Stream test + ROI editor — ports klynx add/edit. Click the video to
             drop ROI points; save as polygon (≥3) or line (4 pts = 2 in/out). -->
        <div class="col-12">
          <div class="roi-panel border rounded p-3">
            <div class="d-flex flex-wrap align-items-center gap-2 mb-2">
              <span class="form-label mb-0">Stream preview &amp; ROI</span>
              <button type="button" class="btn btn-outline-theme btn-sm ms-auto" onclick={startPreview} disabled={previewLoading || !form.url.trim()}>
                {#if previewLoading}<span class="spinner-border spinner-border-sm me-1"></span>{:else}<i class="bi bi-play-fill me-1"></i>{/if}Test stream
              </button>
              <button type="button" class="btn btn-outline-secondary btn-sm" onclick={resetPreview} disabled={previewLoading}>
                <i class="bi bi-eraser me-1"></i>Reset
              </button>
            </div>
            <p class="text-body text-opacity-50 small mb-2">
              Load the stream above, then click on the frame to add ROI points (normalized 0–1). Save multiple polygons, or a line (4 points for 2 in/out lines).
            </p>

            {#if previewError}
              <div class="alert alert-warning small py-1 px-2 mb-2">{previewError}</div>
            {/if}

            <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
            <div
              bind:this={videoContainerEl}
              class="roi-stage position-relative bg-black rounded overflow-hidden"
              onclick={onRoiClick}
            >
              {#if showPreview}
                <WebRTCPlayer bind:this={webrtcRef} class="w-100 h-100" autoplay muted />
              {/if}

              {#if roiItems.length || drawingPoints.length}
                <svg class="roi-overlay position-absolute top-0 start-0 w-100 h-100" viewBox="0 0 100 100" preserveAspectRatio="none">
                  <!-- Saved ROI -->
                  {#each roiItems as item (item.id)}
                    {#if item.shape === 'poly'}
                      <polyline points={toSvgPoints(item.points)} fill="rgba(34,197,94,0.25)" stroke="#22c55e" stroke-width="0.8" />
                    {:else}
                      {#if item.points.length >= 2}
                        <line x1={getSvgPoint(item.points[0]).x} y1={getSvgPoint(item.points[0]).y} x2={getSvgPoint(item.points[1]).x} y2={getSvgPoint(item.points[1]).y} stroke="#f97316" stroke-width="0.8" stroke-dasharray="1.5 1.5" />
                      {/if}
                      {#if item.points.length >= 4}
                        <line x1={getSvgPoint(item.points[2]).x} y1={getSvgPoint(item.points[2]).y} x2={getSvgPoint(item.points[3]).x} y2={getSvgPoint(item.points[3]).y} stroke="#f97316" stroke-width="0.8" stroke-dasharray="1.5 1.5" />
                      {/if}
                    {/if}
                    {#each item.points as p, pi (`${item.id}-${pi}`)}
                      <circle cx={getSvgPoint(p).x} cy={getSvgPoint(p).y} r="1.4" fill={item.shape === 'poly' ? '#22c55e' : '#f97316'} stroke="#ffffff" stroke-width="0.4" />
                    {/each}
                  {/each}

                  <!-- In-progress shape -->
                  {#if drawingShape === 'poly'}
                    {#if drawingPoints.length >= 2}
                      <polyline points={toSvgPoints(drawingPoints)} fill={isDrawingClosed ? 'rgba(59,130,246,0.25)' : 'none'} stroke="#3b82f6" stroke-width="0.8" />
                    {/if}
                    {#if !isDrawingClosed && drawingPoints.length >= 2}
                      <line x1={getSvgPoint(drawingPoints[0]).x} y1={getSvgPoint(drawingPoints[0]).y} x2={getSvgPoint(drawingPoints[drawingPoints.length - 1]).x} y2={getSvgPoint(drawingPoints[drawingPoints.length - 1]).y} stroke="#3b82f6" stroke-width="0.5" stroke-dasharray="2 2" />
                    {/if}
                  {:else}
                    {#if drawingPoints.length >= 2}
                      <line x1={getSvgPoint(drawingPoints[0]).x} y1={getSvgPoint(drawingPoints[0]).y} x2={getSvgPoint(drawingPoints[1]).x} y2={getSvgPoint(drawingPoints[1]).y} stroke="#f97316" stroke-width="0.8" stroke-dasharray="1.5 1.5" />
                    {/if}
                    {#if drawingPoints.length >= 4}
                      <line x1={getSvgPoint(drawingPoints[2]).x} y1={getSvgPoint(drawingPoints[2]).y} x2={getSvgPoint(drawingPoints[3]).x} y2={getSvgPoint(drawingPoints[3]).y} stroke="#f97316" stroke-width="0.8" stroke-dasharray="1.5 1.5" />
                    {/if}
                  {/if}
                  {#each drawingPoints as p, di (`drawing-${di}`)}
                    <circle cx={getSvgPoint(p).x} cy={getSvgPoint(p).y} r="1.6" fill="#f97316" stroke="#ffffff" stroke-width="0.5" />
                  {/each}
                </svg>
              {/if}

              {#if !previewUrl}
                <div class="position-absolute top-50 start-50 translate-middle text-body text-opacity-50 small text-center px-3">
                  Enter a stream URL and click “Test stream”
                </div>
              {/if}
            </div>

            <!-- Tools -->
            <div class="d-flex flex-wrap align-items-center gap-2 mt-2">
              <div class="btn-group btn-group-sm" role="group" aria-label="ROI shape">
                <button type="button" class="btn btn-outline-secondary" class:active={drawingShape === 'poly'} onclick={() => setDrawingShape('poly')}>
                  <i class="bi bi-bounding-box me-1"></i>Polygon
                </button>
                <button type="button" class="btn btn-outline-secondary" class:active={drawingShape === 'line'} onclick={() => setDrawingShape('line')}>
                  <i class="bi bi-slash-lg me-1"></i>Line
                </button>
              </div>
              {#if drawingShape === 'poly'}
                <button type="button" class="btn btn-outline-secondary btn-sm" onclick={finishPolygon} disabled={drawingPoints.length < 3}>
                  <i class="bi bi-check2 me-1"></i>Finish
                </button>
                <button type="button" class="btn btn-outline-success btn-sm" onclick={saveCurrentAsPolygon} disabled={drawingPoints.length < 3}>
                  <i class="bi bi-plus-lg me-1"></i>Save polygon
                </button>
              {:else}
                <button type="button" class="btn btn-outline-warning btn-sm" onclick={saveCurrentAsLine} disabled={drawingPoints.length !== 4}>
                  <i class="bi bi-plus-lg me-1"></i>Save line (4 pts)
                </button>
              {/if}
              <button type="button" class="btn btn-outline-secondary btn-sm" onclick={undoPoint} disabled={drawingPoints.length === 0}>
                <i class="bi bi-arrow-counterclockwise me-1"></i>Undo point
              </button>
              <button type="button" class="btn btn-outline-secondary btn-sm" onclick={clearDrawing} disabled={drawingPoints.length === 0}>
                <i class="bi bi-x-lg me-1"></i>Clear
              </button>
              <span class="text-body text-opacity-50 small ms-auto">
                drawing: {drawingPoints.length} pts · saved: {roiItems.length}
                {#if videoFrameSize}· frame {Math.round(videoFrameSize.width)}×{Math.round(videoFrameSize.height)}{/if}
                {#if videoResolution}· src {videoResolution.width}×{videoResolution.height}{/if}
              </span>
            </div>

            <!-- Saved ROI list -->
            {#if roiItems.length}
              <div class="roi-list border-top mt-2 pt-2 d-flex flex-column gap-1">
                {#each roiItems as item (item.id)}
                  <div class="d-flex align-items-center justify-content-between gap-2 small">
                    <span class="text-body text-opacity-75">
                      {item.title}
                      <span class="mx-1 text-opacity-50">·</span>
                      <span class="text-uppercase">{item.shape}</span>
                      <span class="mx-1 text-opacity-50">·</span>{item.detail}
                      <span class="mx-1 text-opacity-50">·</span>{item.points.length} pts
                    </span>
                    <button type="button" class="btn btn-outline-danger btn-sm py-0 px-1" aria-label={`Remove ${item.title}`} onclick={() => removeRoi(item.id)}>
                      <i class="bi bi-x"></i>
                    </button>
                  </div>
                {/each}
              </div>
            {/if}
          </div>
        </div>
      </div>
    </div>
  {/snippet}
  {#snippet footer()}
    <button type="button" class="btn btn-outline-secondary btn-sm text-uppercase" onclick={() => (formOpen = false)} disabled={formBusy}>
      Cancel
    </button>
    <button type="button" class="btn btn-outline-theme btn-sm text-uppercase" onclick={saveForm} disabled={formBusy || !formValid}>
      {#if formBusy}<span class="spinner-border spinner-border-sm me-1"></span>{/if}
      {formMode === 'create' ? 'Create' : 'Save'}
    </button>
  {/snippet}
</Modal>

<!-- Delete confirm -->
<ConfirmDialog
  bind:open={deleteOpen}
  title="Delete camera?"
  message={deleteTarget ? `"${deleteTarget.name}" will be removed from this organization. This cannot be undone.` : ''}
  confirmLabel="Delete"
  cancelLabel="Cancel"
  danger
  busy={deleteBusy}
  onConfirm={confirmDelete}
/>

<style>
  .cameras-page {
    height: 100%;
    min-height: 0;
    font-size: 0.8125rem;
  }

  .cameras-toolbar {
    flex: 0 0 auto;
    background: rgba(var(--bs-body-bg-rgb), 0.84);
    backdrop-filter: blur(10px);
  }

  .cameras-table-region {
    flex: 1 1 auto;
    min-height: 0;
    display: flex;
  }

  .cameras-table-scroll {
    flex: 1 1 auto;
    min-height: 0;
    overflow: auto;
  }

  .cameras-table-scroll :global(thead th) {
    position: sticky;
    top: 0;
    z-index: 3;
    background: rgba(var(--bs-body-bg-rgb), 0.96);
    backdrop-filter: blur(10px);
  }

  .cameras-page :global(.page-header) {
    font-size: 1.25rem;
  }

  .cameras-page :global(.page-header small) {
    font-size: 0.6875rem;
  }

  .cameras-page :global(.display-6) {
    font-size: 1.75rem;
  }

  .cameras-page :global(.table) {
    font-size: 0.78125rem;
  }

  .cameras-page :global(.table thead th) {
    font-size: 0.65625rem;
  }

  .cameras-row-actions :global(.btn) {
    width: 2rem;
    padding-inline: 0;
  }

  .cameras-form :global(.form-label) {
    margin-bottom: 0.3rem;
    font-size: 0.72rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .cam-map-placeholder {
    height: 260px;
    border: 1px solid var(--bs-border-color, rgba(0, 0, 0, 0.15));
    border-radius: 8px;
    background: rgba(var(--bs-body-bg-rgb), 0.4);
  }

  .roi-stage {
    height: 260px;
    cursor: crosshair;
    border: 1px solid var(--bs-border-color, rgba(0, 0, 0, 0.15));
  }

  .roi-overlay {
    pointer-events: none;
  }

  /* Let clicks pass through the <video> to the ROI container (klynx parity). */
  .roi-stage :global(video) {
    pointer-events: none;
  }
</style>
