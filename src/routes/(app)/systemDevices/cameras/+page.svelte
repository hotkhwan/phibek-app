<!-- src/routes/(app)/systemDevices/cameras/+page.svelte -->
<script lang="ts">
  import { onDestroy, onMount } from 'svelte'
  import { setPageTitle } from '$lib/utils/title'
  import DomainStarter from '$lib/components/shared/DomainStarter.svelte'
  import DataTableStarter from '$lib/components/shared/DataTableStarter.svelte'
  import { listCameras, syncCamera, syncCameraMonitor, type Camera } from '$lib/api/devices'
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

  let rows = $state<Camera[]>([])
  let loading = $state(false)
  let syncingAll = $state(false)
  let errorMsg = $state('')
  let search = $state('')
  let mapVisibility = $state<'' | 'inherit' | 'forcePublic' | 'forcePrivate'>('')
  let syncingCameraIds = $state<Set<string>>(new Set())
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
    const { data, error } = await listCameras({
      perPage: 50,
      search: search || undefined,
      mapVisibility: mapVisibility || undefined
    })
    if (seq !== loadSeq) return
    loading = false
    if (error) errorMsg = error.message
    rows = itemsFrom<Camera>(data?.details)
  }

  function rowCameraId(row: Camera) {
    return row.camId ?? row.id
  }

  function sourceLabel(row: Camera) {
    const source = row.externalSource
    if (!source?.provider) return 'local'
    return source.sourceFamily ? `${source.provider}/${source.sourceFamily}` : source.provider
  }

  function mapVisibilityLabel(value?: string) {
    if (value === 'forcePublic' || value === 'public') return 'Public'
    if (value === 'forcePrivate' || value === 'private') return 'Private'
    if (value === 'inherit') return 'Inherit'
    return '—'
  }

  function gwSyncLabel(row: Camera) {
    return row.externalSource?.gwSyncStatus ?? '—'
  }

  function cameraSyncable(row: Camera) {
    return !!row.externalSource?.provider
  }

  async function runMonitorSync() {
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
      key: 'source',
      label: 'Source',
      accessor: sourceLabel
    },
    {
      key: 'mapVisibility',
      label: 'Map',
      accessor: (r: Camera) => mapVisibilityLabel(r.mapVisibility)
    },
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
    },
    {
      key: 'gwSync',
      label: 'GW Sync',
      accessor: gwSyncLabel
    }
  ]

  const rowActions = [
    {
      label: 'Sync',
      icon: 'bi bi-arrow-repeat',
      hidden: (row: Camera) => !cameraSyncable(row),
      disabled: (row: Camera) => syncingCameraIds.has(rowCameraId(row)),
      action: runCameraSync
    }
  ]
</script>

<DomainStarter title={m.navSystemDevicesCameras()} subtitle="Cameras / RTSP / source registry" icon="bi-camera-video" legacyName="systemDevices/cameras">
  <div class="d-flex justify-content-between gap-2 mb-3 flex-wrap">
    <div class="d-flex gap-2 flex-wrap">
      <div class="input-group input-group-sm" style="max-width: 320px">
        <span class="input-group-text"><i class="bi bi-search"></i></span>
        <input class="form-control" placeholder="Search cameras…" bind:value={search} onkeydown={(e) => e.key === 'Enter' && load()} />
      </div>
      <select class="form-select form-select-sm" style="max-width: 190px" bind:value={mapVisibility} onchange={load} aria-label="Map visibility">
        <option value="">All map visibility</option>
        <option value="inherit">Inherit</option>
        <option value="forcePublic">Public</option>
        <option value="forcePrivate">Private</option>
      </select>
    </div>
    <div class="d-flex align-items-center gap-2">
      <span class="badge {liveBadgeClass($wsHubStatus)}" title={$wsHubLastError ?? ''}>
        <i class="bi bi-broadcast me-1"></i>{liveBadgeLabel($wsHubStatus)}
      </span>
      {#if lastRealtimeAt}
        <span class="text-body text-opacity-50 small">{new Date(lastRealtimeAt).toLocaleTimeString()}</span>
      {/if}
      <button type="button" class="btn btn-outline-warning btn-sm" onclick={runMonitorSync} disabled={syncingAll || loading}>
        {#if syncingAll}<span class="spinner-border spinner-border-sm me-1"></span>{:else}<i class="bi bi-hdd-network me-1"></i>{/if}Sync monitor
      </button>
      <button type="button" class="btn btn-outline-theme btn-sm" onclick={load} disabled={loading}>
        <i class="bi bi-arrow-clockwise me-1"></i> Refresh
      </button>
    </div>
  </div>
  {#if realtimeDenied}
    <div class="alert alert-warning small py-2">{realtimeDenied}</div>
  {/if}
  <DataTableStarter {columns} {rows} {loading} {rowActions} error={errorMsg} emptyText="No cameras" />
</DomainStarter>
