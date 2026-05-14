<!-- src/routes/(app)/ingest/+page.svelte
     Aggregated event feed (klynx ingest/events.vue port). Adds a detail
     modal with payload + delivery targets, plus date-range + source filters. -->
<script lang="ts">
  import { onMount } from 'svelte'
  import { setPageTitle } from '$lib/utils/title'
  import DomainStarter from '$lib/components/shared/DomainStarter.svelte'
  import Modal from '$lib/components/shared/Modal.svelte'
  import ProtectedImage from '$lib/components/shared/ProtectedImage.svelte'
  import {
    listIngestEvents,
    getIngestEventDetail,
    type IngestBinaryRef,
    type IngestEvent,
    type IngestPictureCoordinate
  } from '$lib/api/klynxIngest'
  import { notify } from '$lib/stores/notify'
  import { m } from '$lib/i18n/messages'

  type Detail = Awaited<ReturnType<typeof getIngestEventDetail>>['data'] extends infer T
    ? T extends { details: infer D } ? D : never
    : never

  let rows = $state<IngestEvent[]>([])
  let loading = $state(false)
  let errorMsg = $state('')

  // Filters
  let typeFilter = $state('')
  let sourceFilter = $state('')
  let deviceFilter = $state('')
  let fromInput = $state('')
  let toInput = $state('')
  let pageNumber = $state(1)
  const PER_PAGE = 50

  // Detail modal
  let detailOpen = $state(false)
  let detailLoading = $state(false)
  let detailEvent = $state<Detail | null>(null)
  let zoomImage = $state<{ src: string; alt: string; bbox?: IngestPictureCoordinate | null } | null>(null)
  let zoomOpen = $state(false)

  function toIso(input: string): string | undefined {
    if (!input) return undefined
    const d = new Date(input)
    return Number.isNaN(d.getTime()) ? undefined : d.toISOString()
  }

  async function load() {
    loading = true
    errorMsg = ''
    const { data, error } = await listIngestEvents({
      page: pageNumber,
      perPage: PER_PAGE,
      type: typeFilter || undefined,
      deviceId: deviceFilter || undefined,
      from: toIso(fromInput),
      to: toIso(toInput)
    })
    loading = false
    if (error) errorMsg = error.message
    let items = data?.details?.items ?? []
    if (sourceFilter) {
      const needle = sourceFilter.toLowerCase()
      items = items.filter((e) => (e.source ?? '').toLowerCase().includes(needle))
    }
    rows = items
  }

  function clearFilters() {
    typeFilter = ''
    sourceFilter = ''
    deviceFilter = ''
    fromInput = ''
    toInput = ''
    pageNumber = 1
    load()
  }

  async function openDetail(event: IngestEvent) {
    detailOpen = true
    detailLoading = true
    detailEvent = null
    const id = event.eventId ?? event.id
    if (!id) {
      detailLoading = false
      return
    }
    const { data, error } = await getIngestEventDetail(id)
    detailLoading = false
    if (error) {
      notify.error('Event detail', error.message)
      return
    }
    detailEvent = (data?.details ?? null) as Detail
  }

  function refsFor(event: IngestEvent | Detail | null | undefined): IngestBinaryRef[] {
    if (!event) return []
    return (event.binaryRefs ?? event.detail?.binaryRefs ?? []).filter((ref) => ref.kind === 'image' || ref.contentType?.startsWith('image/'))
  }

  function coordinatesFor(event: IngestEvent | Detail | null | undefined): IngestPictureCoordinate[] {
    if (!event) return []
    return event.payload?.pictureCoordinates ?? event.detail?.payload?.pictureCoordinates ?? []
  }

  function imageUrl(ref?: IngestBinaryRef) {
    if (!ref?.bucket || !ref.objectId) return ''
    return `/api/v1/files/${encodeURIComponent(ref.bucket)}/${ref.objectId.split('/').map(encodeURIComponent).join('/')}`
  }

  function firstImage(event: IngestEvent | Detail | null | undefined) {
    return imageUrl(refsFor(event)[0])
  }

  function bboxFor(event: IngestEvent | Detail | null | undefined, index = 0) {
    return coordinatesFor(event)[index] ?? coordinatesFor(event)[0] ?? null
  }

  function eventTypeLabel(event: IngestEvent) {
    return event.type ?? event.eventType ?? '—'
  }

  function eventSourceLabel(event: IngestEvent) {
    return event.source ?? event.sourceFamily ?? '—'
  }

  function openZoom(src: string, alt: string, bbox?: IngestPictureCoordinate | null) {
    zoomImage = { src, alt, bbox }
    zoomOpen = true
  }

  function closeZoom() {
    zoomOpen = false
    zoomImage = null
  }

  function pageNext() {
    pageNumber += 1
    load()
  }
  function pagePrev() {
    if (pageNumber > 1) {
      pageNumber -= 1
      load()
    }
  }

  onMount(() => {
    setPageTitle(`${m.navIngest()} · ${m.navIngestEvents()}`)
    load()
  })
</script>

<DomainStarter
  title={m.navIngestEvents()}
  subtitle="Aggregated event feed (filterable + detail drilldown)"
  icon="bi-collection"
  legacyName="ingest/events"
>
  <!-- Filter bar -->
  <div class="card mb-3">
    <div class="card-body">
      <div class="row g-2 align-items-end">
        <div class="col-md-3">
          <label class="form-label small text-body text-opacity-75 mb-1" for="ingest-type">
            <i class="bi bi-funnel me-1"></i>Type
          </label>
          <input id="ingest-type" class="form-control form-control-sm" placeholder="ata.detection, …"
            bind:value={typeFilter}
            onkeydown={(e) => e.key === 'Enter' && load()} />
        </div>
        <div class="col-md-3">
          <label class="form-label small text-body text-opacity-75 mb-1" for="ingest-source">
            <i class="bi bi-broadcast me-1"></i>Source
          </label>
          <input id="ingest-source" class="form-control form-control-sm" placeholder="ata, kdetect, …"
            bind:value={sourceFilter}
            onkeydown={(e) => e.key === 'Enter' && load()} />
        </div>
        <div class="col-md-2">
          <label class="form-label small text-body text-opacity-75 mb-1" for="ingest-device">
            <i class="bi bi-cpu me-1"></i>Device
          </label>
          <input id="ingest-device" class="form-control form-control-sm" placeholder="deviceId"
            bind:value={deviceFilter}
            onkeydown={(e) => e.key === 'Enter' && load()} />
        </div>
        <div class="col-md-2">
          <label class="form-label small text-body text-opacity-75 mb-1" for="ingest-from">
            <i class="bi bi-calendar me-1"></i>From
          </label>
          <input id="ingest-from" type="datetime-local" class="form-control form-control-sm" bind:value={fromInput} />
        </div>
        <div class="col-md-2">
          <label class="form-label small text-body text-opacity-75 mb-1" for="ingest-to">
            <i class="bi bi-calendar-check me-1"></i>To
          </label>
          <input id="ingest-to" type="datetime-local" class="form-control form-control-sm" bind:value={toInput} />
        </div>
      </div>

      <div class="d-flex justify-content-end gap-2 mt-3">
        <button type="button" class="btn btn-outline-secondary btn-sm" onclick={clearFilters}>
          <i class="bi bi-x-lg me-1"></i>Clear
        </button>
        <button type="button" class="btn btn-outline-theme btn-sm" onclick={load} disabled={loading}>
          <i class="bi bi-arrow-clockwise me-1"></i>
          {loading ? 'Loading…' : 'Apply / Refresh'}
        </button>
      </div>
    </div>
    <div class="card-arrow">
      <div class="card-arrow-top-left"></div>
      <div class="card-arrow-top-right"></div>
      <div class="card-arrow-bottom-left"></div>
      <div class="card-arrow-bottom-right"></div>
    </div>
  </div>

  <!-- Events table -->
  {#if errorMsg}
    <div class="alert alert-danger small mb-3">{errorMsg}</div>
  {/if}

  <div class="card">
    <div class="card-body p-0">
      <div class="table-responsive">
        <table class="table table-card table-hover mb-0">
          <thead>
            <tr>
              <th style="width: 180px">When</th>
              <th>Type</th>
              <th>Source</th>
              <th>Device</th>
              <th style="width: 120px">Image</th>
              <th style="width: 280px">Event ID</th>
              <th class="text-end" style="width: 90px"></th>
            </tr>
          </thead>
          <tbody>
            {#if loading && rows.length === 0}
              <tr><td colspan="7" class="text-center py-4">
                <div class="spinner-border spinner-border-sm text-theme me-2"></div>Loading…
              </td></tr>
            {:else if rows.length === 0}
              <tr><td colspan="7" class="text-center py-4 text-body text-opacity-50">No events</td></tr>
            {:else}
              {#each rows as r (r.eventId ?? r.id)}
                <tr>
                  <td class="small">{r.occurredAt ? new Date(r.occurredAt).toLocaleString() : '—'}</td>
                  <td><span class="badge bg-theme bg-opacity-25 text-theme">{eventTypeLabel(r)}</span></td>
                  <td class="small">{eventSourceLabel(r)}</td>
                  <td class="small">{r.deviceName ?? r.deviceId ?? '—'}</td>
                  <td>
                    {#if firstImage(r)}
                      <button
                        type="button"
                        class="event-thumb-btn"
                        aria-label="Open event image"
                        onclick={() => openZoom(firstImage(r), eventTypeLabel(r), bboxFor(r))}
                      >
                        <ProtectedImage src={firstImage(r)} alt={eventTypeLabel(r)} class="event-thumb" bbox={bboxFor(r)} />
                      </button>
                    {:else}
                      <span class="text-body text-opacity-25">—</span>
                    {/if}
                  </td>
                  <td class="font-monospace small text-body text-opacity-75">{r.eventId ?? r.id ?? '—'}</td>
                  <td class="text-end">
                    <button type="button" class="btn btn-sm btn-outline-theme" aria-label="View detail" onclick={() => openDetail(r)}>
                      <i class="bi bi-zoom-in"></i>
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

  <!-- Pagination -->
  <div class="d-flex justify-content-between align-items-center mt-3">
    <div class="text-body text-opacity-50 small">
      Page <strong>{pageNumber}</strong> · {rows.length} record{rows.length === 1 ? '' : 's'}
    </div>
    <div class="d-flex gap-1">
      <button type="button" class="btn btn-sm btn-outline-secondary" onclick={pagePrev} disabled={pageNumber <= 1 || loading}>
        <i class="bi bi-chevron-left"></i> Prev
      </button>
      <button type="button" class="btn btn-sm btn-outline-secondary" onclick={pageNext} disabled={loading || rows.length < PER_PAGE}>
        Next <i class="bi bi-chevron-right"></i>
      </button>
    </div>
  </div>
</DomainStarter>

<!-- Detail modal -->
<Modal bind:open={detailOpen} title="Event Detail" size="lg">
  {#snippet body()}
    {#if detailLoading}
      <div class="text-center py-5 text-body text-opacity-50">
        <div class="spinner-border spinner-border-sm me-2"></div>Loading…
      </div>
    {:else if !detailEvent}
      <div class="alert alert-warning small mb-0">Event not found.</div>
    {:else}
      <dl class="row mb-3">
        <dt class="col-sm-4 fw-semibold">Event ID</dt>
        <dd class="col-sm-8 mb-2 font-monospace small">{detailEvent.eventId ?? detailEvent.id}</dd>

        <dt class="col-sm-4 fw-semibold">Type</dt>
        <dd class="col-sm-8 mb-2">{detailEvent.type ?? '—'}</dd>

        <dt class="col-sm-4 fw-semibold">Source</dt>
        <dd class="col-sm-8 mb-2">{detailEvent.source ?? '—'}</dd>

        <dt class="col-sm-4 fw-semibold">Device</dt>
        <dd class="col-sm-8 mb-2">{detailEvent.deviceName ?? detailEvent.deviceId ?? '—'}</dd>

        <dt class="col-sm-4 fw-semibold">Occurred</dt>
        <dd class="col-sm-8 mb-2">{detailEvent.occurredAt ? new Date(detailEvent.occurredAt).toLocaleString() : '—'}</dd>

        {#if detailEvent.sourceIp}
          <dt class="col-sm-4 fw-semibold">Source IP</dt>
          <dd class="col-sm-8 mb-2 font-monospace small">{detailEvent.sourceIp}</dd>
        {/if}

        {#if detailEvent.lat && detailEvent.lng}
          <dt class="col-sm-4 fw-semibold">Lat / Lng</dt>
          <dd class="col-sm-8 mb-2 font-monospace small">{detailEvent.lat}, {detailEvent.lng}</dd>
        {/if}
      </dl>

      {#if refsFor(detailEvent).length}
        <div class="fw-bold small mb-2">Captures ({refsFor(detailEvent).length})</div>
        <div class="event-captures mb-3">
          {#each refsFor(detailEvent) as ref, index (`${ref.objectId}-${index}`)}
            {@const src = imageUrl(ref)}
            <button
              type="button"
              class="event-capture"
              aria-label="Open capture image"
              onclick={() => openZoom(src, `${detailEvent?.eventType ?? detailEvent?.type ?? 'event'} capture ${index + 1}`, bboxFor(detailEvent, index))}
            >
              <ProtectedImage src={src} alt="Event capture" class="event-capture-image" bbox={bboxFor(detailEvent, index)} />
              <span>{index + 1}</span>
            </button>
          {/each}
        </div>
      {/if}

      {#if detailEvent.payload}
        <div class="fw-bold small mb-1">Payload</div>
        <pre
          class="border rounded bg-black bg-opacity-25 p-2 font-monospace small text-body text-opacity-75 mb-3"
          style="max-height: 240px; overflow-y: auto; white-space: pre-wrap; word-break: break-word;"
        >{JSON.stringify(detailEvent.payload, null, 2)}</pre>
      {/if}

      {#if detailEvent.targets?.length}
        <div class="fw-bold small mb-1">Delivery Targets ({detailEvent.targets.length})</div>
        <div class="table-responsive">
          <table class="table table-sm table-card mb-0">
            <thead>
              <tr><th>Name</th><th>Status</th><th>Delivered</th></tr>
            </thead>
            <tbody>
              {#each detailEvent.targets as t (t.id)}
                <tr>
                  <td>{t.name ?? t.id}</td>
                  <td>
                    <span class="badge" class:bg-success={t.status === 'delivered'} class:bg-warning={t.status === 'pending'} class:bg-danger={t.status === 'failed'}>
                      {t.status ?? '—'}
                    </span>
                  </td>
                  <td class="small">{t.deliveredAt ? new Date(t.deliveredAt).toLocaleString() : '—'}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}

      {#if detailEvent.rawBody}
        <div class="fw-bold small mt-3 mb-1">Raw Body</div>
        <pre
          class="border rounded bg-black bg-opacity-25 p-2 font-monospace small text-body text-opacity-75 mb-0"
          style="max-height: 200px; overflow-y: auto; white-space: pre-wrap; word-break: break-word;"
        >{detailEvent.rawBody}</pre>
      {/if}
    {/if}
  {/snippet}
  {#snippet footer()}
    <button type="button" class="btn btn-outline-secondary btn-sm" onclick={() => (detailOpen = false)}>Close</button>
  {/snippet}
</Modal>

<Modal bind:open={zoomOpen} title="Capture Preview" size="xl" onClose={closeZoom}>
  {#snippet body()}
    {#if zoomImage}
      <ProtectedImage src={zoomImage.src} alt={zoomImage.alt} class="event-zoom-image" bbox={zoomImage.bbox} />
    {/if}
  {/snippet}
  {#snippet footer()}
    <button type="button" class="btn btn-outline-secondary btn-sm" onclick={closeZoom}>Close</button>
  {/snippet}
</Modal>

<style lang="scss">
  .event-thumb-btn {
    display: block;
    width: 72px;
    height: 46px;
    border: 1px solid rgba(255, 255, 255, .18);
    border-radius: 6px;
    overflow: hidden;
    padding: 0;
    background: rgba(0, 0, 0, .28);
  }

  :global(.event-thumb) {
    width: 100%;
    height: 100%;
    background: #050607;
  }

  .event-captures {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
    gap: .75rem;
  }

  .event-capture {
    position: relative;
    aspect-ratio: 16 / 9;
    border: 1px solid rgba(255, 255, 255, .14);
    border-radius: 8px;
    overflow: hidden;
    padding: 0;
    background: rgba(0, 0, 0, .35);

    span {
      position: absolute;
      top: .4rem;
      right: .4rem;
      min-width: 1.5rem;
      height: 1.5rem;
      display: grid;
      place-items: center;
      border-radius: 999px;
      background: rgba(0, 208, 132, .92);
      color: #001b12;
      font-size: .75rem;
      font-weight: 700;
    }
  }

  :global(.event-capture-image),
  :global(.event-zoom-image) {
    width: 100%;
    height: 100%;
    background: #050607;
  }

  :global(.event-zoom-image) {
    max-height: 76vh;
  }
</style>
