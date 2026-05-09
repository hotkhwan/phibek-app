<!-- src/routes/(app)/videowall/+page.svelte -->
<script lang="ts">
  import { onMount } from 'svelte'
  import { setPageTitle } from '$lib/utils/title'
  import DomainStarter from '$lib/components/shared/DomainStarter.svelte'
  import VideoPlayer from '$lib/components/shared/VideoPlayer.svelte'
  import { listCameras, type Camera } from '$lib/api/devices'
  import { createStream } from '$lib/utils/streamUrl'
  import { m } from '$lib/i18n/messages'

  let cams = $state<Camera[]>([])
  let urls = $state<Record<string, string>>({})
  let loading = $state(false)
  let layout = $state<'2x2' | '3x3' | '4x4'>('2x2')

  const layoutCols: Record<typeof layout, number> = { '2x2': 2, '3x3': 3, '4x4': 4 } as never
  const tileLimit = $derived(layout === '4x4' ? 16 : layout === '3x3' ? 9 : 4)
  const visible = $derived(cams.slice(0, tileLimit))

  async function load() {
    loading = true
    const { data } = await listCameras({ perPage: 16, sortField: 'name', sortOrder: 'asc' })
    loading = false
    cams = data?.details?.items ?? []
  }

  async function startTile(c: Camera) {
    if (urls[c.id]) return
    const url = await createStream({ id: c.id, url: c.url }, '/live/stream')
    if (url) urls = { ...urls, [c.id]: url }
  }

  onMount(() => {
    setPageTitle(m.navVideoWall())
    load()
  })
</script>

<DomainStarter title={m.navVideoWall()} subtitle="Multi-camera live tile grid" icon="bi-grid-3x3-gap-fill" legacyName="videowall">
  <div class="d-flex flex-wrap justify-content-between gap-2 mb-3">
    <div class="btn-group btn-group-sm" role="group" aria-label="layout">
      {#each ['2x2', '3x3', '4x4'] as l}
        <button type="button" class="btn"
          class:btn-theme={layout === l}
          class:btn-outline-theme={layout !== l}
          onclick={() => (layout = l as typeof layout)}>
          {l}
        </button>
      {/each}
    </div>
    <button type="button" class="btn btn-outline-theme btn-sm" onclick={load} disabled={loading}>
      <i class="bi bi-arrow-clockwise me-1"></i> Reload
    </button>
  </div>

  {#if loading && cams.length === 0}
    <div class="text-center py-5 text-body text-opacity-50">
      <div class="spinner-border spinner-border-sm me-2"></div>Loading cameras…
    </div>
  {:else if cams.length === 0}
    <div class="alert alert-info small">No cameras available.</div>
  {:else}
    <div class="row g-2"
      style={`--phibek-cols: ${layoutCols[layout]};`}>
      {#each visible as cam (cam.id)}
        <div class="col-{12 / layoutCols[layout]}">
          <div class="card overflow-hidden">
            <div class="ratio ratio-16x9 bg-black">
              {#if urls[cam.id]}
                <VideoPlayer source={urls[cam.id]} class="w-100 h-100" autoplay muted />
              {:else}
                <button type="button" class="btn btn-outline-theme position-absolute top-50 start-50 translate-middle btn-sm" onclick={() => startTile(cam)}>
                  <i class="bi bi-play-fill me-1"></i> Start
                </button>
              {/if}
            </div>
            <div class="card-body py-1 px-2 small text-truncate">{cam.name}</div>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</DomainStarter>
