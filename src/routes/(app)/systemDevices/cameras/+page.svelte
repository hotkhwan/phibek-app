<!-- src/routes/(app)/systemDevices/cameras/+page.svelte -->
<script lang="ts">
  import { onDestroy, onMount } from 'svelte'
  import { setPageTitle } from '$lib/utils/title'
  import DomainStarter from '$lib/components/shared/DomainStarter.svelte'
  import DataTableStarter from '$lib/components/shared/DataTableStarter.svelte'
  import { listCameras, type Camera } from '$lib/api/devices'
  import { activeWorkspaceId } from '$lib/stores/activeWorkspace'
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

  let rows = $state<Camera[]>([])
  let loading = $state(false)
  let errorMsg = $state('')
  let search = $state('')
  let unsubscribeWorkspace: (() => void) | null = null
  let unsubscribeRealtime: (() => void) | null = null
  let realtimeDenied = $state('')
  let lastRealtimeAt = $state<string | null>(null)
  let realtimeRefreshTimer: ReturnType<typeof setTimeout> | null = null
  const seenCameraStatus = new Set<string>()
  let loadSeq = 0

  async function load() {
    const seq = ++loadSeq
    loading = true
    errorMsg = ''
    const { data, error } = await listCameras({ perPage: 50, search: search || undefined })
    if (seq !== loadSeq) return
    loading = false
    if (error) errorMsg = error.message
    rows = itemsFrom<Camera>(data?.details)
  }

  function rowCameraId(row: Camera) {
    return row.camId ?? row.id
  }

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

  function liveBadgeClass(status: LiveStatus) {
    if (status === 'on') return 'bg-success'
    if (status === 'reconnecting') return 'bg-warning text-dark'
    if (status === 'error') return 'bg-danger'
    return 'bg-secondary'
  }

  function liveBadgeLabel(status: LiveStatus) {
    if (status === 'on') return 'LIVE'
    if (status === 'reconnecting') return 'Syncing'
    if (status === 'error') return 'WSS error'
    return 'REST'
  }

  onMount(() => {
    setPageTitle(`${m.navSystemDevices()} · ${m.navSystemDevicesCameras()}`)
    unsubscribeWorkspace = activeWorkspaceId.subscribe((orgId) => {
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
    unsubscribeWorkspace?.()
    stopRealtime()
  })

  const columns = [
    { key: 'name', label: 'Name' },
    { key: 'groupName', label: 'Group' },
    {
      key: 'online',
      label: 'Online',
      accessor: (r: Camera) => (r.online ? '✅' : '❌')
    },
    {
      key: 'enabled',
      label: 'Enabled',
      accessor: (r: Camera) => (r.enabled ? 'Yes' : 'No')
    },
    {
      key: 'updateAt',
      label: 'Updated',
      accessor: (r: Camera) => (r.updateAt ? new Date(r.updateAt).toLocaleString() : '—')
    }
  ]
</script>

<DomainStarter title={m.navSystemDevicesCameras()} subtitle="Cameras / RTSP / source registry" icon="bi-camera-video" legacyName="systemDevices/cameras">
  <div class="d-flex justify-content-between gap-2 mb-3">
    <div class="input-group input-group-sm" style="max-width: 320px">
      <span class="input-group-text"><i class="bi bi-search"></i></span>
      <input class="form-control" placeholder="Search cameras…" bind:value={search} onkeydown={(e) => e.key === 'Enter' && load()} />
    </div>
    <div class="d-flex align-items-center gap-2">
      <span class="badge {liveBadgeClass($wsHubStatus)}" title={$wsHubLastError ?? ''}>
        <i class="bi bi-broadcast me-1"></i>{liveBadgeLabel($wsHubStatus)}
      </span>
      {#if lastRealtimeAt}
        <span class="text-body text-opacity-50 small">{new Date(lastRealtimeAt).toLocaleTimeString()}</span>
      {/if}
      <button type="button" class="btn btn-outline-theme btn-sm" onclick={load} disabled={loading}>
        <i class="bi bi-arrow-clockwise me-1"></i> Refresh
      </button>
    </div>
  </div>
  {#if realtimeDenied}
    <div class="alert alert-warning small py-2">{realtimeDenied}</div>
  {/if}
  <DataTableStarter {columns} {rows} {loading} error={errorMsg} emptyText="No cameras" />
</DomainStarter>
