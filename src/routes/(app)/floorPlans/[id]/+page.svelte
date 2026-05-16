<!-- src/routes/(app)/floorPlans/[id]/+page.svelte
     Floor plan placement editor.
     - Click on the canvas to add a marker (camera picker opens)
     - Drag an existing marker to reposition (debounced PATCH per move)
     - Click a marker to select; sidebar action removes / edits label
     - Coords stored as % of the image (0..100) so the BE persists
       a resolution-independent position.
     BE: GET / POST / PATCH / DELETE /kapi/floorPlans/{id}/placements -->
<script lang="ts">
  import { onMount, tick } from 'svelte'
  import { page } from '$app/state'
  import { setPageTitle } from '$lib/utils/title'
  import Modal from '$lib/components/shared/Modal.svelte'
  import ConfirmDialog from '$lib/components/shared/ConfirmDialog.svelte'
  import {
    addPlacement,
    getFloorPlan,
    listPlacements,
    removePlacement,
    updatePlacement,
    type FloorPlanDetail,
    type FloorPlanPlacement
  } from '$lib/api/floorPlan'
  import { listCameras, type Camera } from '$lib/api/devices'
  import { notify } from '$lib/stores/notify'
  import { m } from '$lib/i18n/messages'

  let plan = $state<FloorPlanDetail | null>(null)
  let placements = $state<FloorPlanPlacement[]>([])
  let cameras = $state<Camera[]>([])
  let camerasLoading = $state(false)
  let loading = $state(false)
  let saving = $state(false)
  let errorMsg = $state('')
  let editMode = $state(false)
  let selectedPlacementId = $state<string | null>(null)
  let imageEl = $state<HTMLImageElement | null>(null)
  let canvasEl = $state<HTMLDivElement | null>(null)

  // Pending click → camera picker
  let pickerOpen = $state(false)
  let pickerSearch = $state('')
  let pendingCoord = $state<{ x: number; y: number } | null>(null)

  // Delete confirm
  let deleteOpen = $state(false)
  let deleteBusy = $state(false)
  let deleteTarget = $state<FloorPlanPlacement | null>(null)

  // Label edit modal
  let labelOpen = $state(false)
  let labelBusy = $state(false)
  let labelTarget = $state<FloorPlanPlacement | null>(null)
  let labelValue = $state('')

  // Drag state
  let dragId = $state<string | null>(null)
  let dragStartXY = $state<{ x: number; y: number } | null>(null)
  let dragMoved = $state(false)

  const id = $derived(page.params.id ?? '')
  const cameraNameById = $derived(new Map(cameras.map((c) => [c.camId ?? c.id, c.name])))
  const placementsCount = $derived(placements.length)
  const selected = $derived(placements.find((p) => p.id === selectedPlacementId) ?? null)
  const cameraIdsInUse = $derived(new Set(placements.map((p) => p.cameraId).filter((x): x is string => !!x)))
  const filteredCameras = $derived.by(() => {
    const q = pickerSearch.trim().toLowerCase()
    return cameras
      .filter((c) => !cameraIdsInUse.has(c.camId ?? c.id))
      .filter((c) => !q || (c.name + ' ' + (c.brand ?? '') + ' ' + (c.district ?? '')).toLowerCase().includes(q))
  })

  async function load() {
    if (!id) return
    loading = true
    errorMsg = ''
    const [planRes, placementsRes] = await Promise.all([
      getFloorPlan(id),
      listPlacements(id)
    ])
    loading = false
    if (planRes.error) {
      errorMsg = planRes.error.message
      return
    }
    plan = planRes.data?.details ?? null
    if (placementsRes.data?.details?.items) {
      placements = placementsRes.data.details.items
    } else if (planRes.data?.details?.placements) {
      placements = planRes.data.details.placements
    } else if (planRes.data?.details?.markers) {
      placements = planRes.data.details.markers
    } else {
      placements = []
    }
  }

  async function loadCameras() {
    if (cameras.length > 0 || camerasLoading) return
    camerasLoading = true
    const { data } = await listCameras({ perPage: 500 })
    camerasLoading = false
    cameras = data?.details?.items ?? []
  }

  function coordFromEvent(e: MouseEvent | PointerEvent): { x: number; y: number } | null {
    if (!canvasEl) return null
    const rect = canvasEl.getBoundingClientRect()
    if (!rect.width || !rect.height) return null
    const x = ((e.clientX - rect.left) / rect.width) * 100
    const y = ((e.clientY - rect.top) / rect.height) * 100
    return { x: clamp(x, 0, 100), y: clamp(y, 0, 100) }
  }

  function clamp(v: number, min: number, max: number) {
    return Math.min(Math.max(v, min), max)
  }

  function onCanvasClick(e: MouseEvent) {
    if (!editMode || dragId) return
    const target = e.target as HTMLElement
    // Ignore clicks on existing markers — they have their own handlers
    if (target.closest('.placement-marker')) return
    const coord = coordFromEvent(e)
    if (!coord) return
    pendingCoord = coord
    pickerSearch = ''
    pickerOpen = true
    void loadCameras()
  }

  function selectPlacement(id: string) {
    selectedPlacementId = selectedPlacementId === id ? null : id
  }

  // ── Drag handlers ─────────────────────────────────────────────────────────
  function onMarkerPointerDown(p: FloorPlanPlacement, e: PointerEvent) {
    if (!editMode) return
    e.stopPropagation()
    dragId = p.id
    dragMoved = false
    dragStartXY = { x: e.clientX, y: e.clientY }
    selectedPlacementId = p.id
    ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
  }

  function onMarkerPointerMove(p: FloorPlanPlacement, e: PointerEvent) {
    if (dragId !== p.id || !dragStartXY) return
    const dx = e.clientX - dragStartXY.x
    const dy = e.clientY - dragStartXY.y
    if (!dragMoved && Math.hypot(dx, dy) < 3) return
    dragMoved = true
    const coord = coordFromEvent(e)
    if (!coord) return
    placements = placements.map((pl) => (pl.id === p.id ? { ...pl, x: coord.x, y: coord.y } : pl))
  }

  async function onMarkerPointerUp(p: FloorPlanPlacement, e: PointerEvent) {
    if (dragId !== p.id) return
    ;(e.target as HTMLElement).releasePointerCapture?.(e.pointerId)
    dragId = null
    dragStartXY = null
    if (!dragMoved) return
    const updated = placements.find((pl) => pl.id === p.id)
    if (!updated) return
    saving = true
    const { error } = await updatePlacement(id, p.id, { x: updated.x, y: updated.y })
    saving = false
    if (error) notify.error('บันทึกตำแหน่งไม่สำเร็จ', error.message)
  }

  // ── Add via picker ────────────────────────────────────────────────────────
  async function pickCamera(c: Camera) {
    if (!pendingCoord) return
    saving = true
    const cameraId = c.camId ?? c.id
    const { data, error } = await addPlacement(id, {
      cameraId,
      x: pendingCoord.x,
      y: pendingCoord.y
    })
    saving = false
    if (error) {
      notify.error('เพิ่มหมุดไม่สำเร็จ', error.message)
      return
    }
    if (data?.details) {
      placements = [...placements, data.details]
      selectedPlacementId = data.details.id
    } else {
      // Fallback if BE doesn't echo the placement back
      await load()
    }
    pickerOpen = false
    pendingCoord = null
    notify.success('เพิ่มหมุดสำเร็จ', c.name)
  }

  function cancelPicker() {
    pickerOpen = false
    pendingCoord = null
  }

  // ── Delete ────────────────────────────────────────────────────────────────
  function openDelete(p: FloorPlanPlacement) {
    deleteTarget = p
    deleteOpen = true
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    deleteBusy = true
    try {
      await removePlacement(id, deleteTarget.id)
      placements = placements.filter((pl) => pl.id !== deleteTarget!.id)
      if (selectedPlacementId === deleteTarget.id) selectedPlacementId = null
      notify.success('ลบหมุดแล้ว', cameraNameById.get(deleteTarget.cameraId ?? '') ?? '')
      deleteOpen = false
      deleteTarget = null
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      notify.error('ลบไม่สำเร็จ', msg)
    } finally {
      deleteBusy = false
    }
  }

  // ── Label edit ────────────────────────────────────────────────────────────
  function openLabelEdit(p: FloorPlanPlacement) {
    labelTarget = p
    labelValue = p.label ?? ''
    labelOpen = true
  }

  async function saveLabel() {
    if (!labelTarget) return
    labelBusy = true
    try {
      const { error } = await updatePlacement(id, labelTarget.id, { label: labelValue.trim() || undefined })
      if (error) throw new Error(error.message)
      placements = placements.map((pl) => (pl.id === labelTarget!.id ? { ...pl, label: labelValue.trim() || undefined } : pl))
      labelOpen = false
      labelTarget = null
      notify.success('อัปเดตป้ายกำกับสำเร็จ', '')
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      notify.error('อัปเดตป้ายไม่สำเร็จ', msg)
    } finally {
      labelBusy = false
    }
  }

  onMount(() => {
    setPageTitle(`${m.navFloorPlans()} · ${id}`)
    void load()
    void loadCameras()
  })
</script>

<div class="page-shell">
  <div class="d-flex flex-wrap align-items-center justify-content-between gap-3 mb-3">
    <div>
      <a href="/floorPlans" class="btn btn-link btn-sm p-0 mb-1">
        <i class="bi bi-chevron-left me-1"></i> All floor plans
      </a>
      <h1 class="page-header mb-0">
        <i class="bi bi-bounding-box text-theme me-2"></i>{plan?.name ?? `Floor Plan · ${id}`}
      </h1>
      {#if plan?.buildingName || plan?.floorLabel}
        <div class="text-body text-opacity-50 small">
          {[plan?.buildingName, plan?.floorLabel].filter(Boolean).join(' · ')}
        </div>
      {/if}
    </div>
    <div class="d-flex gap-2">
      {#if saving}
        <span class="badge bg-secondary align-self-center"><span class="spinner-border spinner-border-sm me-1"></span>Saving…</span>
      {/if}
      <button type="button" class="btn btn-sm" class:btn-theme={!editMode} class:btn-outline-theme={editMode} onclick={() => (editMode = !editMode)}>
        <i class="bi {editMode ? 'bi-check2-circle' : 'bi-pencil'} me-1"></i>
        {editMode ? 'Done editing' : 'Edit placements'}
      </button>
    </div>
  </div>

  {#if errorMsg}
    <div class="alert alert-danger small mb-3">{errorMsg}</div>
  {/if}

  {#if loading && !plan}
    <div class="text-center py-5 text-body text-opacity-50">
      <div class="spinner-border spinner-border-sm me-2"></div>Loading…
    </div>
  {:else if !plan}
    <div class="alert alert-warning small">Floor plan not found.</div>
  {:else}
    <div class="row g-3">
      <div class="col-lg-9">
        <div class="card">
          <div class="card-body p-2">
            {#if plan.imageUrl}
              <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
              <div
                class="placement-canvas position-relative bg-black bg-opacity-50 rounded overflow-hidden"
                class:edit-mode={editMode}
                bind:this={canvasEl}
                onclick={onCanvasClick}
                onkeydown={(e) => { if (e.key === 'Escape') selectedPlacementId = null }}
                role="application"
                tabindex="-1"
              >
                <img src={plan.imageUrl} alt={plan.name} class="w-100 d-block" bind:this={imageEl} draggable="false" />
                {#each placements as p (p.id)}
                  <!-- svelte-ignore a11y_click_events_have_key_events -->
                  <div
                    class="placement-marker"
                    class:selected={selectedPlacementId === p.id}
                    style="left: {p.x}%; top: {p.y}%;"
                    onpointerdown={(e) => onMarkerPointerDown(p, e)}
                    onpointermove={(e) => onMarkerPointerMove(p, e)}
                    onpointerup={(e) => onMarkerPointerUp(p, e)}
                    onclick={(e) => { e.stopPropagation(); selectPlacement(p.id) }}
                    onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectPlacement(p.id) } }}
                    role="button"
                    tabindex="0"
                    aria-label={`Camera marker ${cameraNameById.get(p.cameraId ?? '') ?? p.cameraId ?? p.id}`}
                  >
                    <i class="bi bi-camera-video"></i>
                    {#if p.label}
                      <span class="placement-label">{p.label}</span>
                    {/if}
                  </div>
                {/each}
                {#if editMode}
                  <div class="edit-hint">
                    <i class="bi bi-info-circle me-1"></i> Click empty space to add · drag marker to move
                  </div>
                {/if}
              </div>
            {:else}
              <div class="ratio ratio-16x9 bg-black bg-opacity-25 d-flex align-items-center justify-content-center text-body text-opacity-25">
                <i class="bi bi-image fs-1"></i>
              </div>
            {/if}
          </div>
          <div class="card-arrow">
            <div class="card-arrow-top-left"></div>
            <div class="card-arrow-top-right"></div>
            <div class="card-arrow-bottom-left"></div>
            <div class="card-arrow-bottom-right"></div>
          </div>
        </div>
      </div>

      <div class="col-lg-3">
        <div class="card mb-3">
          <div class="card-header fw-bold">Plan details</div>
          <div class="card-body small">
            <dl class="mb-0">
              <dt class="fw-semibold">Name</dt>
              <dd class="mb-2">{plan.name}</dd>
              {#if plan.description}
                <dt class="fw-semibold">Description</dt>
                <dd class="mb-2">{plan.description}</dd>
              {/if}
              <dt class="fw-semibold">Markers</dt>
              <dd class="mb-2">{placementsCount}</dd>
              {#if plan.scaleMetersPerPx}
                <dt class="fw-semibold">Scale</dt>
                <dd class="mb-2">{plan.scaleMetersPerPx} m/px</dd>
              {/if}
              {#if plan.updatedAt}
                <dt class="fw-semibold">Updated</dt>
                <dd class="mb-0">{new Date(plan.updatedAt).toLocaleString()}</dd>
              {/if}
            </dl>
          </div>
          <div class="card-arrow">
            <div class="card-arrow-top-left"></div>
            <div class="card-arrow-top-right"></div>
            <div class="card-arrow-bottom-left"></div>
            <div class="card-arrow-bottom-right"></div>
          </div>
        </div>

        {#if selected}
          <div class="card">
            <div class="card-header fw-bold d-flex justify-content-between align-items-center">
              <span>Selected marker</span>
              <button type="button" class="btn-close btn-close-sm" aria-label="Close" onclick={() => (selectedPlacementId = null)}></button>
            </div>
            <div class="card-body small">
              <div class="fw-semibold mb-1">{cameraNameById.get(selected.cameraId ?? '') ?? selected.cameraId ?? '—'}</div>
              {#if selected.label}
                <div class="text-body text-opacity-65 mb-2">{selected.label}</div>
              {/if}
              <div class="font-monospace text-body text-opacity-50">
                x: {selected.x.toFixed(2)}% · y: {selected.y.toFixed(2)}%
              </div>
              {#if editMode}
                <div class="d-grid gap-2 mt-3">
                  <button type="button" class="btn btn-outline-theme btn-sm" onclick={() => openLabelEdit(selected!)}>
                    <i class="bi bi-pencil me-1"></i> Edit label
                  </button>
                  <button type="button" class="btn btn-outline-danger btn-sm" onclick={() => openDelete(selected!)}>
                    <i class="bi bi-trash me-1"></i> Remove marker
                  </button>
                </div>
              {/if}
            </div>
            <div class="card-arrow">
              <div class="card-arrow-top-left"></div>
              <div class="card-arrow-top-right"></div>
              <div class="card-arrow-bottom-left"></div>
              <div class="card-arrow-bottom-right"></div>
            </div>
          </div>
        {/if}
      </div>
    </div>
  {/if}
</div>

<!-- Camera picker (opens when user clicks empty canvas in edit mode) -->
<Modal bind:open={pickerOpen} title="Pick camera for this marker" size="md" dismissible={!saving} onClose={cancelPicker}>
  {#snippet body()}
    <div>
      <div class="input-group input-group-sm mb-2">
        <span class="input-group-text"><i class="bi bi-search"></i></span>
        <input class="form-control" placeholder="Search cameras…" bind:value={pickerSearch} />
      </div>
      <div class="text-body text-opacity-50 small mb-2">
        Showing cameras not already placed on this plan.
        {#if camerasLoading}<span class="ms-2 spinner-border spinner-border-sm"></span>{/if}
      </div>
      <div class="camera-list">
        {#if filteredCameras.length === 0}
          <div class="text-center py-4 text-body text-opacity-50">
            {camerasLoading ? 'Loading…' : 'No cameras available.'}
          </div>
        {:else}
          {#each filteredCameras as c (c.id || c.camId)}
            <button type="button" class="camera-item" disabled={saving} onclick={() => pickCamera(c)}>
              <i class="bi bi-camera-video"></i>
              <div class="min-w-0 text-start">
                <div class="fw-semibold text-truncate">{c.name}</div>
                <div class="small text-body text-opacity-50 text-truncate">{[c.brand, c.district].filter(Boolean).join(' · ') || '—'}</div>
              </div>
            </button>
          {/each}
        {/if}
      </div>
    </div>
  {/snippet}
  {#snippet footer()}
    <button type="button" class="btn btn-outline-secondary btn-sm" onclick={cancelPicker} disabled={saving}>Cancel</button>
  {/snippet}
</Modal>

<!-- Edit label -->
<Modal bind:open={labelOpen} title="Marker label" size="sm" dismissible={!labelBusy}>
  {#snippet body()}
    <div>
      <label class="form-label" for="placement-label">Label</label>
      <input id="placement-label" class="form-control form-control-sm" bind:value={labelValue} placeholder="e.g. Lobby entrance" />
      <div class="form-text">Optional. Shown above the marker on the canvas.</div>
    </div>
  {/snippet}
  {#snippet footer()}
    <button type="button" class="btn btn-outline-secondary btn-sm" onclick={() => (labelOpen = false)} disabled={labelBusy}>Cancel</button>
    <button type="button" class="btn btn-theme btn-sm" onclick={saveLabel} disabled={labelBusy}>
      {#if labelBusy}<span class="spinner-border spinner-border-sm me-1"></span>{/if}
      Save label
    </button>
  {/snippet}
</Modal>

<ConfirmDialog
  bind:open={deleteOpen}
  title="Remove marker?"
  message={`Remove this camera marker from the plan? The camera itself is not deleted.`}
  confirmLabel="Remove"
  cancelLabel="Cancel"
  danger
  busy={deleteBusy}
  onConfirm={confirmDelete}
/>

<style>
  .page-shell { padding: 1rem; }
  .page-header { font-size: 1.4rem; font-weight: 700; }

  .placement-canvas {
    position: relative;
    user-select: none;
    touch-action: none;
  }

  .placement-canvas.edit-mode {
    cursor: crosshair;
  }

  .placement-canvas img {
    pointer-events: none;
    user-select: none;
  }

  .placement-marker {
    position: absolute;
    transform: translate(-50%, -50%);
    display: inline-flex;
    align-items: center;
    gap: .35rem;
    padding: .25rem .55rem;
    border-radius: 999px;
    background: var(--bs-warning);
    color: var(--bs-dark);
    border: 2px solid #fff;
    box-shadow: 0 2px 6px rgba(0, 0, 0, .3);
    cursor: pointer;
    font-size: .82rem;
    line-height: 1;
    transition: box-shadow .15s, transform .15s;
    z-index: 2;
  }

  .placement-marker:hover {
    box-shadow: 0 4px 12px rgba(0, 0, 0, .4);
  }

  .placement-marker.selected {
    box-shadow: 0 0 0 3px rgba(var(--bs-primary-rgb), .6), 0 4px 12px rgba(0, 0, 0, .4);
    z-index: 3;
  }

  .placement-canvas.edit-mode .placement-marker {
    cursor: grab;
  }

  .placement-label {
    font-size: .72rem;
    font-weight: 600;
  }

  .edit-hint {
    position: absolute;
    left: 50%;
    bottom: .75rem;
    transform: translateX(-50%);
    z-index: 4;
    padding: .35rem .75rem;
    border-radius: 999px;
    background: rgba(0, 0, 0, .65);
    color: rgba(255, 255, 255, .9);
    font-size: .78rem;
    pointer-events: none;
  }

  .camera-list {
    max-height: 360px;
    overflow-y: auto;
    display: grid;
    gap: .35rem;
  }

  .camera-item {
    display: flex;
    align-items: center;
    gap: .65rem;
    padding: .55rem .65rem;
    border: 1px solid var(--bs-border-color);
    border-radius: 6px;
    background: var(--bs-body-bg);
    text-align: left;
    width: 100%;
    cursor: pointer;
    transition: border-color .15s, background .15s;
    min-width: 0;
  }

  .camera-item:hover:not(:disabled) {
    border-color: var(--bs-primary);
    background: rgba(var(--bs-primary-rgb), .04);
  }

  .camera-item i {
    flex: 0 0 auto;
    color: var(--bs-primary);
    font-size: 1.1rem;
  }

  .camera-item .min-w-0 {
    min-width: 0;
    flex: 1 1 auto;
  }
</style>
