<!-- src/routes/(app)/iotControl/+page.svelte -->
<script lang="ts">
  import { onDestroy, onMount } from 'svelte'
  import { setPageTitle } from '$lib/utils/title'
  import DomainStarter from '$lib/components/shared/DomainStarter.svelte'
  import DataTableStarter from '$lib/components/shared/DataTableStarter.svelte'
  import {
    fetchOverview,
    listResources,
    type IotControlOverview,
    type IotControlResource
  } from '$lib/api/iotControl'
  import { WS_TOPICS, type WsTopic } from '$lib/realtime/wsTopics'
  import { liveBadgeClass, liveBadgeLabel } from '$lib/realtime/liveStatus'
  import {
    subscribeWsTopic,
    wsHubLastError,
    wsHubStatus
  } from '$lib/stores/wsHub'
  import type { KControlStatusPayload } from '$lib/types/realtime'
  import { m } from '$lib/i18n/messages'

  let overview = $state<IotControlOverview | null>(null)
  let resources = $state<IotControlResource[]>([])
  let loading = $state(false)
  let errorMsg = $state('')

  const stats = $derived([
    { key: 'total',   label: 'Devices',     value: overview?.totalDevices ?? 0,  icon: 'bi-cpu' },
    { key: 'online',  label: 'Online',      value: overview?.online ?? 0,        icon: 'bi-check-circle text-success' },
    { key: 'offline', label: 'Offline',     value: overview?.offline ?? 0,       icon: 'bi-x-circle text-danger' },
    { key: 'warn',    label: 'Warnings',    value: overview?.warning ?? 0,       icon: 'bi-exclamation-triangle text-warning' },
    { key: 'alarms',  label: 'Alarms (24h)',value: overview?.alarms24h ?? 0,     icon: 'bi-bell-fill text-theme' }
  ])

  let recent = $state<Array<{ key: string; t: number; topic: string; preview: string }>>([])
  let realtimeDenied = $state('')
  let unsub = $state<(() => void) | null>(null)
  let realtimeReloadTimer: ReturnType<typeof setTimeout> | null = null
  const seenStatus = new Set<string>()

  async function load() {
    loading = true
    errorMsg = ''
    const [{ data: o, error: oErr }, { data: r, error: rErr }] = await Promise.all([
      fetchOverview(),
      listResources({ perPage: 25 })
    ])
    loading = false
    overview = o?.details ?? null
    resources = r?.details?.items ?? []
    if (oErr) errorMsg = oErr.message
    else if (rErr) errorMsg = rErr.message
  }

  function scheduleRealtimeReload() {
    if (realtimeReloadTimer) clearTimeout(realtimeReloadTimer)
    realtimeReloadTimer = setTimeout(() => {
      realtimeReloadTimer = null
      void load()
    }, 1200)
  }

  function applyStatus(payload: KControlStatusPayload) {
    if (!payload?.deviceId || !payload.evaluatedAt) return
    const key = `${payload.deviceId}:${payload.evaluatedAt}`
    if (seenStatus.has(key)) return
    seenStatus.add(key)
    if (seenStatus.size > 250) {
      const keep = Array.from(seenStatus).slice(-120)
      seenStatus.clear()
      for (const item of keep) seenStatus.add(item)
    }

    resources = resources.map((row) => {
      if (row.id !== payload.deviceId) return row
      return {
        ...row,
        name: payload.name || row.name,
        online: payload.status === 'online',
        lastSeenAt: payload.evaluatedAt
      }
    })

    if (overview && payload.prevStatus && payload.prevStatus !== payload.status) {
      const next = { ...overview }
      if (payload.status === 'online') next.online = (next.online ?? 0) + 1
      if (payload.status === 'offline') next.offline = (next.offline ?? 0) + 1
      if (payload.prevStatus === 'online') next.online = Math.max(0, (next.online ?? 0) - 1)
      if (payload.prevStatus === 'offline') next.offline = Math.max(0, (next.offline ?? 0) - 1)
      overview = next
    }

    recent = [{
      key,
      t: Date.now(),
      topic: WS_TOPICS.KCONTROL_STATUS,
      preview: `${payload.name || payload.hwId || payload.deviceId} ${payload.prevStatus ?? 'unknown'} → ${payload.status}`
    }, ...recent].slice(0, 10)
    scheduleRealtimeReload()
  }

  function startSubscribe() {
    if (unsub) unsub()
    realtimeDenied = ''
    unsub = subscribeWsTopic<KControlStatusPayload>(
      [WS_TOPICS.KCONTROL_STATUS],
      (_topic: WsTopic, _ts: string, payload: KControlStatusPayload) => applyStatus(payload),
      {
        onDenied: (topic, reason) => {
          realtimeDenied = `${topic} denied: ${reason}`
        }
      }
    )
  }

  onMount(() => {
    setPageTitle(m.navIotControl())
    load()
    startSubscribe()
  })

  onDestroy(() => {
    unsub?.()
    if (realtimeReloadTimer) clearTimeout(realtimeReloadTimer)
  })

  const columns = [
    { key: 'name', label: 'Name' },
    { key: 'type', label: 'Type' },
    {
      key: 'enabled',
      label: 'Enabled',
      accessor: (r: IotControlResource) => (r.enabled ? 'Yes' : 'No')
    },
    {
      key: 'online',
      label: 'Online',
      accessor: (r: IotControlResource) => (r.online ? '✅' : '❌')
    },
    {
      key: 'lastSeenAt',
      label: 'Last Seen',
      accessor: (r: IotControlResource) =>
        r.lastSeenAt ? new Date(r.lastSeenAt).toLocaleString() : '—'
    }
  ]
</script>

<DomainStarter title={m.navIotControl()} subtitle="Sensor control plane · alarms · SOP" icon="bi-cpu" legacyName="kcontrol">
  <div class="row g-3 mb-4">
    {#each stats as s}
      <div class="col-xl col-md-6">
        <div class="card h-100">
          <div class="card-body">
            <div class="d-flex align-items-center mb-2">
              <i class="bi {s.icon} fs-4 me-2"></i>
              <div class="text-body text-opacity-50 fw-semibold small">{s.label}</div>
            </div>
            <div class="display-6 fw-bold mb-0">{s.value.toLocaleString()}</div>
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

  <div class="row g-3">
    <div class="col-lg-7">
      <div class="d-flex align-items-center justify-content-between mb-2">
        <div class="fw-bold">Resources</div>
        <button type="button" class="btn btn-outline-theme btn-sm" onclick={load} disabled={loading}>
          <i class="bi bi-arrow-clockwise me-1"></i> Refresh
        </button>
      </div>
      <DataTableStarter {columns} rows={resources} {loading} error={errorMsg} emptyText="No resources" />
    </div>

    <div class="col-lg-5">
      <div class="card h-100">
        <div class="card-header fw-bold d-flex justify-content-between align-items-center">
          <span>Live WSS status</span>
          <span class="badge {liveBadgeClass($wsHubStatus)}" title={$wsHubLastError ?? ''}>
            {liveBadgeLabel($wsHubStatus)}
          </span>
        </div>
        <div class="card-body">
          {#if realtimeDenied}
            <div class="alert alert-warning small py-2">{realtimeDenied}</div>
          {/if}
          <div class="text-body text-opacity-50 small mb-1">
            Topic: <code>kcontrol.status</code>
          </div>
          <div class="border rounded bg-black bg-opacity-25 p-2" style="max-height: 320px; overflow-y: auto; font-family: var(--bs-font-monospace); font-size: 0.75rem;">
            {#if recent.length === 0}
              <div class="text-body text-opacity-50">— waiting for messages —</div>
            {:else}
              {#each recent as r (r.key)}
                <div class="mb-1">
                  <span class="text-body text-opacity-50">[{new Date(r.t).toLocaleTimeString()}]</span>
                  <span class="text-theme">{r.topic}</span>
                  <span class="text-body text-opacity-75">{r.preview}</span>
                </div>
              {/each}
            {/if}
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
  </div>
</DomainStarter>
