<!-- src/routes/(app)/iotControl/+page.svelte -->
<script lang="ts">
  import { onMount } from 'svelte'
  import { setPageTitle } from '$lib/utils/title'
  import DomainStarter from '$lib/components/shared/DomainStarter.svelte'
  import DataTableStarter from '$lib/components/shared/DataTableStarter.svelte'
  import {
    fetchOverview,
    listResources,
    type IotControlOverview,
    type IotControlResource
  } from '$lib/api/iotControl'
  import {
    subscribeMqtt,
    decodeJson,
    mqttStatus,
    getMqttClient
  } from '$lib/stores/mqtt'
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

  let recent = $state<Array<{ t: number; topic: string; preview: string }>>([])
  let unsub = $state<(() => void) | null>(null)

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

  function startSubscribe() {
    if (unsub) unsub()
    unsub = subscribeMqtt(['kcontrol.alarms', 'kcontrol.health'], (topic, payload) => {
      const json = decodeJson(payload)
      const preview = json
        ? JSON.stringify(json).slice(0, 120)
        : new TextDecoder().decode(payload).slice(0, 120)
      recent = [{ t: Date.now(), topic, preview }, ...recent].slice(0, 10)
    })
  }

  onMount(() => {
    setPageTitle(m.navIotControl())
    load()
    void getMqttClient()
    startSubscribe()
    return () => unsub?.()
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
          <span>Live MQTT</span>
          <span class="badge bg-secondary">{$mqttStatus}</span>
        </div>
        <div class="card-body">
          <div class="text-body text-opacity-50 small mb-1">
            Topics: <code>kcontrol.alarms</code> · <code>kcontrol.health</code>
          </div>
          <div class="border rounded bg-black bg-opacity-25 p-2" style="max-height: 320px; overflow-y: auto; font-family: var(--bs-font-monospace); font-size: 0.75rem;">
            {#if recent.length === 0}
              <div class="text-body text-opacity-50">— waiting for messages —</div>
            {:else}
              {#each recent as r (r.t)}
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
