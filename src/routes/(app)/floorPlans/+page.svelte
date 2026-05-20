<!-- src/routes/(app)/floorPlans/+page.svelte
     Floor plan grid + CRUD modals.
     /floorPlans (metadata + cover image) — BE: /kapi/floorPlans
     Per-plan placements (camera markers on canvas) are managed on the
     /floorPlans/[id] detail page (placement editor) — defer-iterating. -->
<script lang="ts">
  import { onMount } from 'svelte'
  import { setPageTitle } from '$lib/utils/title'
  import Modal from '$lib/components/shared/Modal.svelte'
  import ConfirmDialog from '$lib/components/shared/ConfirmDialog.svelte'
  import {
    createFloorPlan,
    deleteFloorPlan,
    listFloorPlans,
    updateFloorPlan,
    type FloorPlan,
    type FloorPlanCreateInput,
    type FloorPlanUpdateInput
  } from '$lib/api/floorPlan'
  import { notify } from '$lib/stores/notify'
  import { m } from '$lib/i18n/messages'

  // ─────────── data ───────────
  let plans = $state<FloorPlan[]>([])
  let loading = $state(false)
  let errorMsg = $state('')
  let search = $state('')

  // ─────────── modal state ───────────
  type FormMode = 'create' | 'edit'
  let formOpen = $state(false)
  let formMode = $state<FormMode>('create')
  let formBusy = $state(false)
  let editingId = $state<string | null>(null)
  let imageFile = $state<File | null>(null)
  let imagePreview = $state('')
  let form = $state({
    name: '',
    buildingName: '',
    floorLabel: '',
    description: '',
    scaleMetersPerPx: 0.05,
    lat: null as number | null,
    lng: null as number | null
  })

  // ─────────── delete dialog ───────────
  let deleteOpen = $state(false)
  let deleteBusy = $state(false)
  let deleteTarget = $state<FloorPlan | null>(null)

  // ─────────── form validity ───────────
  const isFormValid = $derived.by(() => {
    if (!form.name.trim()) return false
    if (typeof form.scaleMetersPerPx !== 'number' || !Number.isFinite(form.scaleMetersPerPx) || form.scaleMetersPerPx <= 0) return false
    if (formMode === 'create' && !imageFile) return false
    return true
  })

  // ─────────── load ───────────
  async function load() {
    if (loading) return
    loading = true
    errorMsg = ''
    const { data, error } = await listFloorPlans({ perPage: 50, search: search.trim() || undefined })
    loading = false
    if (error) {
      errorMsg = error.message
      plans = []
      return
    }
    plans = data?.details?.items ?? []
  }

  // ─────────── form ───────────
  function resetForm() {
    form = {
      name: '',
      buildingName: '',
      floorLabel: '',
      description: '',
      scaleMetersPerPx: 0.05,
      lat: null,
      lng: null
    }
    imageFile = null
    imagePreview = ''
  }

  function openCreate() {
    resetForm()
    formMode = 'create'
    editingId = null
    formOpen = true
  }

  function openEdit(plan: FloorPlan) {
    resetForm()
    formMode = 'edit'
    editingId = plan.id
    form = {
      name: plan.name ?? '',
      buildingName: plan.buildingName ?? '',
      floorLabel: plan.floorLabel ?? '',
      description: plan.description ?? '',
      scaleMetersPerPx: typeof plan.scaleMetersPerPx === 'number' ? plan.scaleMetersPerPx : 0.05,
      lat: typeof plan.lat === 'number' ? plan.lat : null,
      lng: typeof plan.lng === 'number' ? plan.lng : null
    }
    imagePreview = plan.imageUrl ?? ''
    formOpen = true
  }

  function onImageChange(e: Event) {
    const input = e.target as HTMLInputElement
    const f = input.files?.[0]
    if (!f) return
    if (!/^image\/(png|jpe?g|webp|gif)$/i.test(f.type)) {
      notify.warning('ไฟล์ไม่ถูกต้อง', 'รองรับเฉพาะ PNG / JPG / WEBP / GIF')
      input.value = ''
      return
    }
    if (f.size > 20 * 1024 * 1024) {
      notify.warning('ไฟล์ใหญ่เกินไป', 'จำกัด 20 MB')
      input.value = ''
      return
    }
    imageFile = f
    const reader = new FileReader()
    reader.onload = () => (imagePreview = String(reader.result ?? ''))
    reader.readAsDataURL(f)
  }

  async function submitForm() {
    if (formBusy || !isFormValid) return
    formBusy = true
    try {
      if (formMode === 'create') {
        if (!imageFile) throw new Error('Image required')
        const input: FloorPlanCreateInput = {
          image: imageFile,
          name: form.name.trim(),
          scaleMetersPerPx: form.scaleMetersPerPx,
          buildingName: form.buildingName.trim() || undefined,
          floorLabel: form.floorLabel.trim() || undefined,
          description: form.description.trim() || undefined,
          lat: form.lat,
          lng: form.lng
        }
        const { error } = await createFloorPlan(input)
        if (error) throw new Error(error.message)
        notify.success('เพิ่มผังพื้นสำเร็จ', form.name)
      } else if (editingId) {
        const body: FloorPlanUpdateInput = {
          name: form.name.trim(),
          buildingName: form.buildingName.trim() || undefined,
          floorLabel: form.floorLabel.trim() || undefined,
          description: form.description.trim() || undefined,
          scaleMetersPerPx: form.scaleMetersPerPx,
          lat: form.lat,
          lng: form.lng
        }
        const { error } = await updateFloorPlan(editingId, body)
        if (error) throw new Error(error.message)
        notify.success('อัปเดตผังพื้นสำเร็จ', form.name)
      }

      formOpen = false
      await load()
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      notify.error('บันทึกไม่สำเร็จ', msg)
    } finally {
      formBusy = false
    }
  }

  function openDelete(plan: FloorPlan) {
    deleteTarget = plan
    deleteOpen = true
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    deleteBusy = true
    try {
      await deleteFloorPlan(deleteTarget.id)
      notify.success('ลบผังพื้นแล้ว', deleteTarget.name)
      deleteOpen = false
      deleteTarget = null
      await load()
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      notify.error('ลบไม่สำเร็จ', msg)
    } finally {
      deleteBusy = false
    }
  }

  onMount(() => {
    setPageTitle(m.navFloorPlans())
    void load()
  })
</script>

<div class="page-shell">
  <div class="d-flex flex-wrap align-items-center justify-content-between gap-3 mb-3">
    <div>
      <h1 class="page-header mb-1">
        <i class="bi bi-bounding-box text-theme me-2"></i>{m.navFloorPlans()}
      </h1>
      <div class="text-body text-opacity-50 small">Digital-twin layouts · upload an image, then place camera markers on the detail page.</div>
    </div>
    <button type="button" class="btn btn-theme btn-sm" onclick={openCreate}>
      <i class="bi bi-plus-lg me-1"></i> Add floor plan
    </button>
  </div>

  <div class="card mb-3">
    <div class="card-body py-3">
      <div class="d-flex flex-wrap gap-2 align-items-center">
        <div class="input-group input-group-sm" style="max-width: 320px">
          <span class="input-group-text"><i class="bi bi-search"></i></span>
          <input class="form-control" placeholder="Search floor plans…" bind:value={search} onkeydown={(e) => { if (e.key === 'Enter') void load() }} />
          {#if search}
            <button type="button" class="btn btn-outline-secondary" aria-label="Clear" title="Clear" onclick={() => { search = ''; void load() }}>
              <i class="bi bi-x"></i>
            </button>
          {/if}
        </div>
        <div class="ms-auto">
          <button type="button" class="btn btn-outline-theme btn-sm" onclick={load} disabled={loading}>
            <i class="bi {loading ? 'bi-arrow-clockwise spin' : 'bi-arrow-clockwise'} me-1"></i> Refresh
          </button>
        </div>
      </div>
    </div>
    <div class="card-arrow">
      <div class="card-arrow-top-left"></div>
      <div class="card-arrow-top-right"></div>
      <div class="card-arrow-bottom-left"></div>
      <div class="card-arrow-bottom-right"></div>
    </div>
  </div>

  {#if errorMsg}
    <div class="alert alert-danger small mb-3">{errorMsg}</div>
  {/if}

  {#if loading && plans.length === 0}
    <div class="text-center py-5 text-body text-opacity-50">
      <div class="spinner-border spinner-border-sm me-2"></div>Loading…
    </div>
  {:else if plans.length === 0}
    <div class="card">
      <div class="card-body text-center text-body text-opacity-50 py-5">
        ยังไม่มีผังพื้น คลิก "Add floor plan" เพื่อเริ่มต้น
      </div>
      <div class="card-arrow">
        <div class="card-arrow-top-left"></div>
        <div class="card-arrow-top-right"></div>
        <div class="card-arrow-bottom-left"></div>
        <div class="card-arrow-bottom-right"></div>
      </div>
    </div>
  {:else}
    <div class="row g-3">
      {#each plans as p (p.id)}
        <div class="col-lg-4 col-md-6">
          <div class="card h-100">
            <a href={`/floorPlans/${p.id}`} class="text-decoration-none text-body">
              <div class="ratio ratio-16x9 bg-black bg-opacity-25 rounded-top overflow-hidden">
                {#if p.imageUrl}
                  <img src={p.imageUrl} alt={p.name} style="object-fit: cover; width: 100%; height: 100%;" />
                {:else}
                  <div class="d-flex align-items-center justify-content-center text-body text-opacity-25">
                    <i class="bi bi-image fs-1"></i>
                  </div>
                {/if}
              </div>
            </a>
            <div class="card-body">
              <div class="d-flex align-items-start justify-content-between gap-2">
                <div class="min-w-0">
                  <h5 class="fw-bold mb-1 text-truncate">{p.name}</h5>
                  {#if p.buildingName || p.floorLabel}
                    <div class="small text-body text-opacity-65 text-truncate">
                      {[p.buildingName, p.floorLabel].filter(Boolean).join(' · ')}
                    </div>
                  {/if}
                  {#if p.description}
                    <p class="small text-body text-opacity-50 mb-2 text-truncate" style="max-width: 100%">{p.description}</p>
                  {/if}
                  <div class="small text-body text-opacity-75">
                    <i class="bi bi-camera-video me-1"></i> {p.cameraCount ?? 0} cameras
                  </div>
                </div>
                <div class="btn-group btn-group-sm flex-shrink-0">
                  <button type="button" class="btn btn-outline-secondary" title="Edit" aria-label="Edit" onclick={() => openEdit(p)}>
                    <i class="bi bi-pencil"></i>
                  </button>
                  <button type="button" class="btn btn-outline-danger" title="Delete" aria-label="Delete" onclick={() => openDelete(p)}>
                    <i class="bi bi-trash"></i>
                  </button>
                </div>
              </div>
            </div>
            <div class="card-arrow">
              <div class="card-arrow-top-left"></div>
              <div class="card-arrow-top-right"></div>
              <div class="card-arrow-bottom-left"></div>
              <div class="card-arrow-bottom-right"></div>
            </div>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>

<Modal bind:open={formOpen} title={formMode === 'create' ? 'Add floor plan' : 'Edit floor plan'} size="lg" dismissible={!formBusy}>
  {#snippet body()}
    <form class="row g-3" onsubmit={(e) => { e.preventDefault(); void submitForm() }}>
      <div class="col-12">
        <label class="form-label" for="fp-image">Cover image {formMode === 'create' ? '*' : ''}</label>
        <input id="fp-image" class="form-control form-control-sm" type="file" accept="image/png,image/jpeg,image/webp,image/gif" onchange={onImageChange} disabled={formMode === 'edit'} />
        {#if imagePreview}
          <div class="mt-2 ratio ratio-16x9 bg-black bg-opacity-25 rounded overflow-hidden" style="max-width: 100%">
            <img src={imagePreview} alt="preview" style="object-fit: contain; width: 100%; height: 100%;" />
          </div>
        {/if}
        {#if formMode === 'edit'}
          <div class="form-text">Image cannot be replaced from this dialog — create a new plan to swap base image.</div>
        {/if}
      </div>

      <div class="col-md-8">
        <label class="form-label" for="fp-name">Name *</label>
        <input id="fp-name" class="form-control form-control-sm" bind:value={form.name} required />
      </div>
      <div class="col-md-4">
        <label class="form-label" for="fp-scale">Scale (m / px) *</label>
        <input id="fp-scale" class="form-control form-control-sm font-monospace" type="number" step="any" min="0.0001" bind:value={form.scaleMetersPerPx} required />
        <div class="form-text">e.g. 0.05 = 1 px ≈ 5 cm in the real world.</div>
      </div>

      <div class="col-md-6">
        <label class="form-label" for="fp-building">Building</label>
        <input id="fp-building" class="form-control form-control-sm" bind:value={form.buildingName} />
      </div>
      <div class="col-md-6">
        <label class="form-label" for="fp-floor">Floor</label>
        <input id="fp-floor" class="form-control form-control-sm" bind:value={form.floorLabel} placeholder="L1 / 2F / B1…" />
      </div>

      <div class="col-md-6">
        <label class="form-label" for="fp-lat">Latitude</label>
        <input id="fp-lat" class="form-control form-control-sm font-monospace" type="number" step="any" bind:value={form.lat} />
      </div>
      <div class="col-md-6">
        <label class="form-label" for="fp-lng">Longitude</label>
        <input id="fp-lng" class="form-control form-control-sm font-monospace" type="number" step="any" bind:value={form.lng} />
      </div>

      <div class="col-12">
        <label class="form-label" for="fp-description">Description</label>
        <textarea id="fp-description" class="form-control form-control-sm" rows="2" bind:value={form.description}></textarea>
      </div>
    </form>
  {/snippet}
  {#snippet footer()}
    <button type="button" class="btn btn-outline-secondary btn-sm" onclick={() => (formOpen = false)} disabled={formBusy}>Cancel</button>
    <button type="button" class="btn btn-theme btn-sm" onclick={submitForm} disabled={formBusy || !isFormValid}>
      {#if formBusy}<span class="spinner-border spinner-border-sm me-1"></span>{/if}
      {formMode === 'create' ? 'Add plan' : 'Save changes'}
    </button>
  {/snippet}
</Modal>

<ConfirmDialog
  bind:open={deleteOpen}
  title="Delete floor plan?"
  message={`This permanently removes "${deleteTarget?.name ?? ''}" and all its camera placements. This action cannot be undone.`}
  confirmLabel="Delete"
  cancelLabel="Cancel"
  danger
  busy={deleteBusy}
  onConfirm={confirmDelete}
/>

<style>
  .page-shell { padding: 1rem; }
  .page-header { font-size: 1.4rem; font-weight: 700; }
  .spin { animation: spin 1s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
</style>
