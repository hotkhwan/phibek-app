<!-- src/routes/(app)/floorPlans/[id]/+page.svelte -->
<script lang="ts">
  import { onMount } from 'svelte'
  import { page } from '$app/state'
  import { setPageTitle } from '$lib/utils/title'
  import DomainStarter from '$lib/components/shared/DomainStarter.svelte'
  import { getFloorPlan, type FloorPlanDetail } from '$lib/api/floorPlan'
  import { m } from '$lib/i18n/messages'

  let plan = $state<FloorPlanDetail | null>(null)
  let loading = $state(false)
  let errorMsg = $state('')

  const id = $derived(page.params.id ?? '')

  async function load() {
    if (!id) return
    loading = true
    errorMsg = ''
    const { data, error } = await getFloorPlan(id)
    loading = false
    if (error) {
      errorMsg = error.message
      return
    }
    plan = data?.details ?? null
  }

  onMount(() => {
    setPageTitle(`${m.navFloorPlans()} · ${id}`)
    load()
  })
</script>

<DomainStarter title={plan?.name ?? `Floor Plan · ${id}`} subtitle="Layout + camera marker positions" icon="bi-bounding-box" legacyName="floorPlans/[id]">
  <div class="mb-3">
    <a href="/floorPlans" class="btn btn-link btn-sm p-0">
      <i class="bi bi-chevron-left me-1"></i> Back to all floor plans
    </a>
  </div>

  {#if errorMsg}
    <div class="alert alert-danger small mb-3">{errorMsg}</div>
  {/if}

  {#if loading}
    <div class="text-center py-5 text-body text-opacity-50">
      <div class="spinner-border spinner-border-sm me-2"></div>Loading…
    </div>
  {:else if !plan}
    <div class="alert alert-warning small">Floor plan not found.</div>
  {:else}
    <div class="row g-3">
      <div class="col-lg-8">
        <div class="card">
          <div class="card-body p-2">
            {#if plan.imageUrl}
              <div class="position-relative bg-black bg-opacity-50 rounded overflow-hidden">
                <img src={plan.imageUrl} alt={plan.name} class="w-100 d-block" />
                {#each plan.markers ?? [] as marker (marker.id)}
                  <div
                    class="position-absolute translate-middle"
                    style="left: {marker.x}%; top: {marker.y}%;"
                  >
                    <span class="badge rounded-pill bg-warning text-dark border border-2 border-light">
                      <i class="bi bi-camera-video"></i>
                    </span>
                  </div>
                {/each}
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

      <div class="col-lg-4">
        <div class="card h-100">
          <div class="card-header fw-bold">Details</div>
          <div class="card-body">
            <dl class="mb-0">
              <dt class="small fw-semibold">Name</dt>
              <dd class="mb-2">{plan.name}</dd>
              {#if plan.description}
                <dt class="small fw-semibold">Description</dt>
                <dd class="mb-2">{plan.description}</dd>
              {/if}
              <dt class="small fw-semibold">Camera markers</dt>
              <dd class="mb-2">{plan.markers?.length ?? plan.cameraCount ?? 0}</dd>
              {#if plan.updatedAt}
                <dt class="small fw-semibold">Updated</dt>
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
      </div>
    </div>
  {/if}
</DomainStarter>
