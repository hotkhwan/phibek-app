<!-- src/routes/(app)/floorPlans/+page.svelte -->
<script lang="ts">
  import { onMount } from 'svelte'
  import { setPageTitle } from '$lib/utils/title'
  import { asset } from '$lib/utils/asset'
  import DomainStarter from '$lib/components/shared/DomainStarter.svelte'
  import { listFloorPlans, type FloorPlan } from '$lib/api/floorPlan'
  import { m } from '$lib/i18n/messages'

  let plans = $state<FloorPlan[]>([])
  let loading = $state(false)
  let errorMsg = $state('')
  let search = $state('')

  async function load() {
    loading = true
    errorMsg = ''
    const { data, error } = await listFloorPlans({ perPage: 50, search: search || undefined })
    loading = false
    if (error) errorMsg = error.message
    plans = data?.details?.items ?? []
  }

  onMount(() => {
    setPageTitle(m.navFloorPlans())
    load()
  })
</script>

<DomainStarter title={m.navFloorPlans()} subtitle="Floor plan layouts with camera markers" icon="bi-bounding-box" legacyName="floorPlans">
  <div class="d-flex justify-content-between gap-2 mb-3">
    <div class="input-group input-group-sm" style="max-width: 320px">
      <span class="input-group-text"><i class="bi bi-search"></i></span>
      <input class="form-control" placeholder="Search floor plans…" bind:value={search} onkeydown={(e) => e.key === 'Enter' && load()} />
    </div>
    <button type="button" class="btn btn-outline-theme btn-sm" onclick={load} disabled={loading}>
      <i class="bi bi-arrow-clockwise me-1"></i> Refresh
    </button>
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
        No floor plans yet
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
          <a href={`/floorPlans/${p.id}`} class="text-decoration-none text-body">
            <div class="card h-100">
              <div class="card-body">
                <div class="ratio ratio-16x9 bg-black bg-opacity-25 rounded overflow-hidden mb-3">
                  {#if p.imageUrl}
                    <img src={p.imageUrl} alt={p.name} style="object-fit: cover; width: 100%; height: 100%;" />
                  {:else}
                    <div class="d-flex align-items-center justify-content-center text-body text-opacity-25">
                      <i class="bi bi-image fs-1"></i>
                    </div>
                  {/if}
                </div>
                <h5 class="fw-bold mb-1">{p.name}</h5>
                {#if p.description}
                  <p class="small text-body text-opacity-50 mb-2">{p.description}</p>
                {/if}
                <div class="small text-body text-opacity-75">
                  <i class="bi bi-camera-video me-1"></i> {p.cameraCount ?? 0} cameras
                </div>
              </div>
              <div class="card-arrow">
                <div class="card-arrow-top-left"></div>
                <div class="card-arrow-top-right"></div>
                <div class="card-arrow-bottom-left"></div>
                <div class="card-arrow-bottom-right"></div>
              </div>
            </div>
          </a>
        </div>
      {/each}
    </div>
  {/if}
</DomainStarter>
