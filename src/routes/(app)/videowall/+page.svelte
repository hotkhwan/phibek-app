<!-- src/routes/(app)/videowall/+page.svelte -->
<script lang="ts">
  import { onDestroy, onMount } from 'svelte'
  import { setPageTitle } from '$lib/utils/title'
  import DomainStarter from '$lib/components/shared/DomainStarter.svelte'
  import VideoPlayer from '$lib/components/shared/VideoPlayer.svelte'
  import { listCameras, type Camera } from '$lib/api/devices'
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

  let cams = $state<Camera[]>([])
  let urls = $state<Record<string, string>>({})
  let loading = $state(false)
  let layout = $state<'2x2' | '3x3' | '4x4'>('2x2')
  let realtimeDenied = $state('')
  let lastRealtimeAt = $state<string | null>(null)
  let unsubscribeRealtime: (() => void) | null = null
  const seenStatus = new Set<string>()

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

  function cameraId(camera: Camera) {
    return camera.camId ?? camera.id
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
    cams = cams.map((camera) => {
      if (cameraId(camera) !== payload.cameraId) return camera
      return {
        ...camera,
        online: payload.status === 'online',
        updateAt: payload.occurredAt
      }
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
    startRealtime()
    load()
  })

  onDestroy(() => {
    unsubscribeRealtime?.()
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
    <div class="d-flex flex-wrap align-items-center gap-2">
      <span class="badge {liveBadgeClass($wsHubStatus)}" title={$wsHubLastError ?? ''}>
        <i class="bi bi-broadcast me-1"></i>{liveBadgeLabel($wsHubStatus)}
      </span>
      {#if lastRealtimeAt}
        <span class="small text-body text-opacity-50">last {new Date(lastRealtimeAt).toLocaleTimeString()}</span>
      {/if}
      <button type="button" class="btn btn-outline-theme btn-sm" onclick={load} disabled={loading}>
        <i class="bi bi-arrow-clockwise me-1"></i> Reload
      </button>
    </div>
  </div>

  {#if realtimeDenied}
    <div class="alert alert-warning small py-2">{realtimeDenied}</div>
  {/if}

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
            <div class="card-body py-1 px-2 small d-flex justify-content-between gap-2">
              <span class="text-truncate">{cam.name}</span>
              <span class="badge {cam.online ? 'bg-success' : 'bg-secondary'}">{cam.online ? 'online' : 'offline'}</span>
            </div>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</DomainStarter>
