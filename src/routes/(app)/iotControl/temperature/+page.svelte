<!-- src/routes/(app)/iotControl/temperature/+page.svelte -->
<script lang="ts">
  import { onDestroy, onMount } from 'svelte'
  import DomainStarter from '$lib/components/shared/DomainStarter.svelte'
  import Modal from '$lib/components/shared/Modal.svelte'
  import { setPageTitle } from '$lib/utils/title'
  import { activeWorkspaceId } from '$lib/stores/activeWorkspace'
  import { effectiveAccess } from '$lib/stores/effectiveAccess'
  import { m } from '$lib/i18n/messages'
  import { WS_TOPICS } from '$lib/realtime/wsTopics'
  import { liveBadgeClass, liveBadgeLabel } from '$lib/realtime/liveStatus'
  import {
    subscribeWsTopic,
    wsHubLastError,
    wsHubStatus
  } from '$lib/stores/wsHub'
  import {
    getKControlConfig,
    getTemperatureHistory,
    getTemperatureSummary,
    patchKControlConfig,
    type KControlConfig,
    type TemperatureHistoryItem,
    type TemperatureOrgRollup,
    type TemperatureSummaryItem
  } from '$lib/api/iotControl'
  import type { KControlTemperaturePayload } from '$lib/types/realtime'

  type WindowPreset = '1h' | '6h' | '24h' | '7d' | '30d'

  const presets: Array<{ id: WindowPreset; label: string; hours: number }> = [
    { id: '1h', label: '1h', hours: 1 },
    { id: '6h', label: '6h', hours: 6 },
    { id: '24h', label: '24h', hours: 24 },
    { id: '7d', label: '7d', hours: 7 * 24 },
    { id: '30d', label: '30d', hours: 30 * 24 }
  ]

  let config = $state<KControlConfig | null>(null)
  let configLoading = $state(false)
  let configSaving = $state(false)
  let configError = $state('')
  let thresholdInput = $state('')
  let sampleEveryNInput = $state('')

  let rollup = $state<TemperatureOrgRollup | null>(null)
  let rows = $state<TemperatureSummaryItem[]>([])
  let threshold = $state<number | null>(null)
  let summaryLoading = $state(false)
  let summaryError = $state('')
  let windowPreset = $state<WindowPreset>('7d')

  let selectedItem = $state<TemperatureSummaryItem | null>(null)
  let historyOpen = $state(false)
  let historyLoading = $state(false)
  let historyError = $state('')
  let historyPoints = $state<TemperatureHistoryItem[]>([])
  let unsubscribeWorkspace: (() => void) | null = null
  let unsubscribeRealtime: (() => void) | null = null
  let realtimeDenied = $state('')
  let lastRealtimeAt = $state<string | null>(null)
  let realtimeRefreshTimer: ReturnType<typeof setTimeout> | null = null
  const seenReadings = new Set<string>()
  let loadSeq = 0

  const canManage = $derived($effectiveAccess.access.orgCapabilities.canManageOrganization)
  const activeOrgReady = $derived(Boolean($activeWorkspaceId))

  const rollupCards = $derived([
    { label: 'Devices', value: rollup?.totalDevices ?? 0, icon: 'bi-cpu' },
    { label: 'Above threshold', value: rollup?.devicesAboveThreshold ?? 0, icon: 'bi-thermometer-high text-warning' },
    { label: 'Samples', value: rollup?.totalSamples ?? 0, icon: 'bi-activity text-theme' },
    { label: 'Over-count', value: rollup?.totalCountAboveThreshold ?? 0, icon: 'bi-fire text-danger' }
  ])

  function windowDates() {
    const preset = presets.find((p) => p.id === windowPreset) ?? presets[3]
    const to = new Date()
    const from = new Date(to.getTime() - preset.hours * 60 * 60 * 1000)
    return { from: from.toISOString(), to: to.toISOString() }
  }

  function fmtTemp(value: number | null | undefined) {
    if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—'
    return `${Number(value).toFixed(1)}°C`
  }

  function fmtTime(value: string | null | undefined) {
    if (!value) return '—'
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return value
    return date.toLocaleString()
  }

  function num(value: string) {
    if (!value.trim()) return null
    const n = Number(value)
    return Number.isFinite(n) ? n : null
  }

  function isAboveThreshold(row: TemperatureSummaryItem) {
    return threshold !== null && row.current !== null && row.current > threshold
  }

  async function fetchConfig(seq: number) {
    configLoading = true
    configError = ''
    const { data, error } = await getKControlConfig()
    if (seq !== loadSeq) return
    configLoading = false

    if (error) {
      configError = error.message
      config = null
      thresholdInput = ''
      sampleEveryNInput = ''
      return
    }

    const detail = data?.details ?? null
    config = detail
    thresholdInput = detail?.tempThresholdC === undefined ? '' : String(detail.tempThresholdC)
    sampleEveryNInput = detail?.historySampleEveryN === undefined ? '' : String(detail.historySampleEveryN)
  }

  async function fetchSummary(seq: number) {
    summaryLoading = true
    summaryError = ''
    const { from, to } = windowDates()
    const { data, error } = await getTemperatureSummary({
      from,
      to,
      page: 1,
      perPage: 200,
      sortField: 'countAboveThreshold',
      sortOrder: 'desc'
    })
    if (seq !== loadSeq) return
    summaryLoading = false

    if (error) {
      summaryError = error.message
      rows = []
      rollup = null
      threshold = config?.tempThresholdC ?? null
      return
    }

    const details = data?.details
    rows = Array.isArray(details?.items) ? details.items : []
    rollup = details?.orgRollup ?? null
    threshold = typeof details?.threshold === 'number' ? details.threshold : (config?.tempThresholdC ?? null)
  }

  async function refreshAll() {
    if (!$activeWorkspaceId) {
      rows = []
      rollup = null
      threshold = null
      summaryError = 'Select an organization to load kControl temperature.'
      return
    }

    const seq = ++loadSeq
    await fetchConfig(seq)
    await fetchSummary(seq)
  }

  function scheduleRealtimeRefresh() {
    if (realtimeRefreshTimer) clearTimeout(realtimeRefreshTimer)
    realtimeRefreshTimer = setTimeout(() => {
      realtimeRefreshTimer = null
      void refreshAll()
    }, 1200)
  }

  function pruneSeenReadings() {
    if (seenReadings.size <= 500) return
    const keep = Array.from(seenReadings).slice(-250)
    seenReadings.clear()
    for (const key of keep) seenReadings.add(key)
  }

  function applyTemperature(payload: KControlTemperaturePayload) {
    if (!payload?.deviceId || !payload.readingAt || !Number.isFinite(Number(payload.temperature))) return
    const key = `${payload.deviceId}:${payload.readingAt}`
    if (seenReadings.has(key)) return
    seenReadings.add(key)
    pruneSeenReadings()

    lastRealtimeAt = payload.readingAt
    rows = rows.map((row) => {
      const matches = row.deviceId === payload.deviceId || (!!payload.hwId && row.hwId === payload.hwId)
      if (!matches) return row
      return {
        ...row,
        current: Number(payload.temperature),
        lastRecordedAt: payload.readingAt
      }
    })

    if (selectedItem && (selectedItem.deviceId === payload.deviceId || (!!payload.hwId && selectedItem.hwId === payload.hwId))) {
      selectedItem = {
        ...selectedItem,
        current: Number(payload.temperature),
        lastRecordedAt: payload.readingAt
      }
      if (historyOpen) {
        historyPoints = [
          ...historyPoints,
          { recordedAt: payload.readingAt, tempC: Number(payload.temperature) }
        ].slice(-5000)
      }
    }

    scheduleRealtimeRefresh()
  }

  function startRealtime() {
    if (unsubscribeRealtime) return
    realtimeDenied = ''
    unsubscribeRealtime = subscribeWsTopic<KControlTemperaturePayload>(
      [WS_TOPICS.KCONTROL_TEMPERATURE],
      (_topic, _ts, payload) => applyTemperature(payload),
      {
        onDenied: (topic, reason) => {
          realtimeDenied = `${topic} denied: ${reason}`
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

  async function saveConfig() {
    configError = ''
    if (!canManage || !$activeWorkspaceId) return

    const tempThresholdC = num(thresholdInput)
    const historySampleEveryN = num(sampleEveryNInput)

    if (tempThresholdC !== null && (tempThresholdC < -50 || tempThresholdC > 200)) {
      configError = 'Temperature threshold must be between -50 and 200°C.'
      return
    }
    if (historySampleEveryN !== null && (historySampleEveryN < 1 || historySampleEveryN > 1000)) {
      configError = 'History sampling must be between 1 and 1000.'
      return
    }

    configSaving = true
    const { data, error } = await patchKControlConfig({
      tempThresholdC,
      historySampleEveryN
    })
    configSaving = false

    if (error) {
      configError = error.message
      return
    }

    if (data?.details) {
      config = data.details
      thresholdInput = String(data.details.tempThresholdC)
      sampleEveryNInput = String(data.details.historySampleEveryN)
    }
    await refreshAll()
  }

  async function setWindow(preset: WindowPreset) {
    if (windowPreset === preset) return
    windowPreset = preset
    await refreshAll()
    if (historyOpen && selectedItem) await fetchHistory(selectedItem)
  }

  async function fetchHistory(item: TemperatureSummaryItem) {
    historyLoading = true
    historyError = ''
    const { from, to } = windowDates()
    const { data, error } = await getTemperatureHistory(item.deviceId, {
      from,
      to,
      sortOrder: 'asc',
      limit: 5000
    })
    historyLoading = false

    if (error) {
      historyError = error.message
      historyPoints = []
      return
    }

    historyPoints = Array.isArray(data?.details?.items) ? data.details.items : []
  }

  async function openHistory(item: TemperatureSummaryItem) {
    selectedItem = item
    historyOpen = true
    await fetchHistory(item)
  }

  onMount(() => {
    setPageTitle(`${m.navIotControl()} · ${m.navIotControlTemperature()}`)
    unsubscribeWorkspace = activeWorkspaceId.subscribe((orgId) => {
      if (orgId) startRealtime()
      else stopRealtime()
      void refreshAll()
    })
  })

  onDestroy(() => {
    unsubscribeWorkspace?.()
    stopRealtime()
  })
</script>

<DomainStarter title={m.navIotControlTemperature()} subtitle="kControl temperature rollup and history" icon="bi-thermometer-half" legacyName="kcontrol/temperature">
  <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
    <div class="btn-group btn-group-sm" role="group" aria-label="Temperature time window">
      {#each presets as preset}
        <button
          type="button"
          class="btn"
          class:btn-theme={windowPreset === preset.id}
          class:btn-outline-theme={windowPreset !== preset.id}
          onclick={() => setWindow(preset.id)}
          disabled={summaryLoading || configLoading}
        >
          {preset.label}
        </button>
      {/each}
    </div>
    <button type="button" class="btn btn-outline-theme btn-sm" onclick={refreshAll} disabled={summaryLoading || configLoading || !activeOrgReady}>
      <i class="bi bi-arrow-clockwise me-1"></i> Refresh
    </button>
  </div>

  <div class="d-flex flex-wrap align-items-center gap-2 mb-3">
    <span class="badge {liveBadgeClass($wsHubStatus)}" title={$wsHubLastError ?? ''}>
      <i class="bi bi-broadcast me-1"></i>{liveBadgeLabel($wsHubStatus)}
    </span>
    <span class="small text-body text-opacity-50">Topic <code>kcontrol.temperature</code></span>
    {#if lastRealtimeAt}
      <span class="small text-body text-opacity-50">last {new Date(lastRealtimeAt).toLocaleTimeString()}</span>
    {/if}
  </div>

  {#if realtimeDenied}
    <div class="alert alert-warning small py-2">{realtimeDenied}</div>
  {/if}

  {#if summaryError && !activeOrgReady}
    <div class="alert alert-warning small">{summaryError}</div>
  {/if}

  <div class="row g-3 mb-4">
    {#each rollupCards as card}
      <div class="col-xl-3 col-md-6">
        <div class="card h-100">
          <div class="card-body">
            <div class="d-flex align-items-center mb-2">
              <i class="bi {card.icon} fs-4 me-2"></i>
              <div class="text-body text-opacity-50 fw-semibold small">{card.label}</div>
            </div>
            <div class="display-6 fw-bold mb-0">{card.value.toLocaleString()}</div>
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

  <div class="row g-3 mb-4">
    <div class="col-xl-8">
      <div class="card h-100">
        <div class="card-header d-flex flex-wrap align-items-center justify-content-between gap-2">
          <div class="fw-bold">Device Summary</div>
          <div class="d-flex align-items-center gap-2">
            <span class="badge bg-warning text-dark">Threshold {fmtTemp(threshold)}</span>
            <span class="badge bg-secondary">{rows.length} devices</span>
          </div>
        </div>
        <div class="card-body p-0">
          {#if summaryError && activeOrgReady}
            <div class="alert alert-danger small m-3">{summaryError}</div>
          {/if}
          <div class="table-responsive temperature-table">
            <table class="table table-card mb-0 align-middle">
              <thead>
                <tr>
                  <th>HW ID</th>
                  <th>Name</th>
                  <th class="text-end">Current</th>
                  <th class="text-end">Avg</th>
                  <th class="text-end">Max</th>
                  <th class="text-end">P95</th>
                  <th class="text-end">Above</th>
                  <th>Last Recorded</th>
                  <th class="text-end">History</th>
                </tr>
              </thead>
              <tbody>
                {#if summaryLoading && rows.length === 0}
                  <tr>
                    <td colspan="9" class="text-center py-4">
                      <div class="spinner-border spinner-border-sm text-theme me-2"></div>
                      <span class="text-body text-opacity-50">Loading…</span>
                    </td>
                  </tr>
                {:else if rows.length === 0}
                  <tr>
                    <td colspan="9" class="text-center py-4 text-body text-opacity-50">No temperature data</td>
                  </tr>
                {:else}
                  {#each rows as row (row.deviceId)}
                    <tr class:temperature-above={isAboveThreshold(row)}>
                      <td class="font-monospace small">{row.hwId}</td>
                      <td>{row.name}</td>
                      <td class="text-end">
                        {#if isAboveThreshold(row)}
                          <span class="badge bg-danger">{fmtTemp(row.current)}</span>
                        {:else}
                          {fmtTemp(row.current)}
                        {/if}
                      </td>
                      <td class="text-end">{fmtTemp(row.avg)}</td>
                      <td class="text-end">{fmtTemp(row.max)}</td>
                      <td class="text-end">{fmtTemp(row.p95)}</td>
                      <td class="text-end">{row.countAboveThreshold.toLocaleString()}</td>
                      <td class="small text-body text-opacity-75">{fmtTime(row.lastRecordedAt)}</td>
                      <td class="text-end">
                        <button
                          type="button"
                          class="btn btn-outline-theme btn-sm"
                          aria-label={`Open temperature history for ${row.name}`}
                          title="Open history"
                          onclick={() => openHistory(row)}
                        >
                          <i class="bi bi-graph-up"></i>
                        </button>
                      </td>
                    </tr>
                  {/each}
                {/if}
              </tbody>
            </table>
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

    <div class="col-xl-4">
      <div class="card h-100">
        <div class="card-header fw-bold d-flex align-items-center gap-2">
          <i class="bi bi-sliders text-theme"></i>
          <span>Temperature Config</span>
        </div>
        <div class="card-body">
          {#if configError}
            <div class="alert alert-danger small">{configError}</div>
          {/if}

          <div class="mb-3">
            <label class="form-label" for="temp-threshold">Threshold (°C)</label>
            <input
              id="temp-threshold"
              class="form-control"
              type="number"
              min="-50"
              max="200"
              step="0.1"
              bind:value={thresholdInput}
              disabled={!canManage || configLoading || configSaving}
            />
            <div class="form-text">
              {config?.source.tempThresholdC === 'org' ? 'Organization override' : 'System default'}
            </div>
          </div>

          <div class="mb-3">
            <label class="form-label" for="temp-sample">History sample every N</label>
            <input
              id="temp-sample"
              class="form-control"
              type="number"
              min="1"
              max="1000"
              step="1"
              bind:value={sampleEveryNInput}
              disabled={!canManage || configLoading || configSaving}
            />
            <div class="form-text">
              {config?.source.historySampleEveryN === 'org' ? 'Organization override' : 'System default'}
            </div>
          </div>

          <div class="d-flex justify-content-between align-items-center">
            <div class="small text-body text-opacity-50">TTL {config?.historyTtlDays ?? '—'} days</div>
            {#if canManage}
              <button type="button" class="btn btn-theme btn-sm" onclick={saveConfig} disabled={configLoading || configSaving || !activeOrgReady}>
                {#if configSaving}
                  <span class="spinner-border spinner-border-sm me-1"></span>
                {:else}
                  <i class="bi bi-check2 me-1"></i>
                {/if}
                Save
              </button>
            {:else}
              <span class="badge bg-secondary">Read only</span>
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

<Modal bind:open={historyOpen} title={selectedItem?.name ?? 'Temperature History'} size="lg">
  {#snippet body()}
    {#if selectedItem}
      <div class="d-flex flex-wrap justify-content-between gap-2 mb-3">
        <div>
          <div class="font-monospace small text-body text-opacity-75">{selectedItem.hwId}</div>
          <div class="small text-body text-opacity-50">Current {fmtTemp(selectedItem.current)} · threshold {fmtTemp(threshold)}</div>
        </div>
        <div class="d-flex gap-2">
          <span class="badge bg-secondary">Avg {fmtTemp(selectedItem.avg)}</span>
          <span class="badge bg-secondary">Max {fmtTemp(selectedItem.max)}</span>
          <span class="badge bg-secondary">P95 {fmtTemp(selectedItem.p95)}</span>
        </div>
      </div>
    {/if}

    {#if historyError}
      <div class="alert alert-danger small">{historyError}</div>
    {/if}

    <div class="temperature-history">
      {#if historyLoading}
        <div class="text-center py-5">
          <div class="spinner-border spinner-border-sm text-theme me-2"></div>
          <span class="text-body text-opacity-50">Loading…</span>
        </div>
      {:else if historyPoints.length === 0}
        <div class="text-center py-5 text-body text-opacity-50">No history in this window</div>
      {:else}
        <div class="temperature-sparkline" aria-label="Temperature history sparkline">
          {#each historyPoints.slice(-80) as point, index (point.recordedAt)}
            <span
              title={`${fmtTime(point.recordedAt)} · ${fmtTemp(point.tempC)}`}
              style={`--bar-index:${index};--bar-value:${Math.max(4, Math.min(100, ((point.tempC + 20) / 120) * 100)).toFixed(2)}%`}
              class:bar-hot={threshold !== null && point.tempC > threshold}
            ></span>
          {/each}
        </div>
        <div class="table-responsive mt-3 temperature-history-table">
          <table class="table table-sm mb-0">
            <thead>
              <tr>
                <th>Recorded At</th>
                <th class="text-end">Temp</th>
              </tr>
            </thead>
            <tbody>
              {#each [...historyPoints.slice(-120)].reverse() as point (point.recordedAt)}
                <tr>
                  <td>{fmtTime(point.recordedAt)}</td>
                  <td class="text-end">{fmtTemp(point.tempC)}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}
    </div>
  {/snippet}
</Modal>

<style>
  .temperature-table {
    max-height: min(62vh, 46rem);
    overflow: auto;
  }

  .temperature-table :global(thead th) {
    position: sticky;
    top: 0;
    z-index: 2;
    background: rgba(var(--bs-body-bg-rgb), 0.96);
    backdrop-filter: blur(10px);
  }

  .temperature-above {
    --bs-table-bg: rgba(var(--bs-danger-rgb), 0.12);
  }

  .temperature-history {
    min-height: 16rem;
  }

  .temperature-sparkline {
    height: 13rem;
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(4px, 1fr));
    align-items: end;
    gap: 2px;
    padding: 0.75rem;
    border: 1px solid rgba(var(--bs-body-color-rgb), 0.12);
    background: rgba(var(--bs-body-bg-rgb), 0.45);
  }

  .temperature-sparkline span {
    display: block;
    min-height: 4px;
    height: var(--bar-value);
    background: rgba(var(--bs-theme-rgb), 0.76);
  }

  .temperature-sparkline span.bar-hot {
    background: rgba(var(--bs-danger-rgb), 0.86);
  }

  .temperature-history-table {
    max-height: 18rem;
    overflow: auto;
  }
</style>
