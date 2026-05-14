<!-- src/routes/(app)/aiSearch/+page.svelte -->
<script lang="ts">
  import { onMount } from 'svelte'
  import { setPageTitle } from '$lib/utils/title'
  import DomainStarter from '$lib/components/shared/DomainStarter.svelte'
  import ProtectedImage from '$lib/components/shared/ProtectedImage.svelte'
  import { searchInvestigation, type InvestigationCard, type InvestigationDetails, type InvestigationPagination } from '$lib/api/aiSearch'

  let prompt = $state('')
  let score = $state(0.5)
  let localFilter = $state('')
  let activeClass = $state('all')
  let loading = $state(false)
  let loadingMore = $state(false)
  let errorMsg = $state('')
  let details = $state<InvestigationDetails | null>(null)
  let pagination = $state<InvestigationPagination | null>(null)
  let zoomCard = $state<InvestigationCard | null>(null)

  const suggestions = ['รถกระบะสีแดง', 'ชายเสื้อดำ', 'คนใส่แมสก์', 'เดินวนหน้าประตู', 'Mercedes truck', 'เหตุการณ์ 9 โมงเช้า']

  const cards = $derived((details?.cards ?? []).filter((card) => {
    if (activeClass !== 'all' && card.class !== activeClass) return false
    const q = localFilter.trim().toLowerCase()
    if (!q) return true
    return [card.title, card.subtitle, card.caption, card.class, card.camera?.name, card.camera?.zone, locationLabel(card), ...(card.tags ?? [])]
      .filter(Boolean).join(' ').toLowerCase().includes(q)
  }))

  const classTabs = $derived.by(() => {
    const counts = details?.summary?.byClass ?? {}
    return [
      { key: 'all', label: 'ทั้งหมด', count: details?.summary?.total ?? details?.cards?.length ?? 0 },
      ...Object.entries(counts).map(([key, count]) => ({ key, label: classLabel(key), count }))
    ]
  })

  const hasNextPage = $derived(Boolean(pagination && pagination.page < pagination.totalPages))

  onMount(() => setPageTitle('AI Investigation Center'))

  function normalize(raw: InvestigationDetails | null | undefined): InvestigationDetails | null {
    if (!raw) return null
    const normalizedCards = (raw.cards ?? []).map((card) => ({
      ...card,
      class: card.class || 'other',
      score: Number(card.score ?? 0),
      confidenceLabel: card.confidenceLabel || `${Math.round(Number(card.score ?? 0) * 100)}%`,
      title: card.title || card.caption || card.eventId,
      caption: card.caption || card.title || '',
      media: card.media ?? {},
      tags: card.tags ?? []
    }))
    const byClass = raw.summary?.byClass ?? normalizedCards.reduce<Record<string, number>>((acc, card) => {
      acc[card.class] = (acc[card.class] ?? 0) + 1
      return acc
    }, {})
    const total = raw.summary?.total ?? raw.summary?.matchedEvents ?? normalizedCards.length
    return {
      ...raw,
      summary: {
        ...raw.summary,
        headline: raw.summary?.headline || `พบ ${total} เหตุการณ์ที่ตรงกับคำค้นหา`,
        narrative: raw.summary?.narrative || (total ? `AI พบ ${total} เหตุการณ์ที่เกี่ยวข้องกับคำค้นหา` : 'ยังไม่พบเหตุการณ์ที่เกี่ยวข้อง'),
        total,
        byClass,
        byLocation: raw.summary?.byLocation ?? {},
        topLocations: raw.summary?.topLocations ?? []
      },
      cards: normalizedCards,
      timeline: raw.timeline ?? [],
      mapPoints: raw.mapPoints ?? []
    }
  }

  function mergeDetails(current: InvestigationDetails | null, next: InvestigationDetails | null): InvestigationDetails | null {
    if (!current) return next
    if (!next) return current
    const byId = new Map<string, InvestigationCard>()
    for (const card of current.cards ?? []) byId.set(card.eventId, card)
    for (const card of next.cards ?? []) byId.set(card.eventId, card)
    const mergedCards = Array.from(byId.values())
    const byClass = mergedCards.reduce<Record<string, number>>((acc, card) => {
      const key = card.class || 'other'
      acc[key] = (acc[key] ?? 0) + 1
      return acc
    }, {})
    return {
      ...next,
      summary: { ...next.summary, total: Math.max(next.summary?.total ?? 0, mergedCards.length), byClass, headline: `พบ ${Math.max(next.summary?.total ?? 0, mergedCards.length)} เหตุการณ์ที่ตรงกับคำค้นหา` },
      cards: mergedCards,
      timeline: [...(current.timeline ?? []), ...(next.timeline ?? [])].filter((item, index, arr) => arr.findIndex((x) => x.eventId === item.eventId) === index),
      mapPoints: [...(current.mapPoints ?? []), ...(next.mapPoints ?? [])].filter((item, index, arr) => arr.findIndex((x) => x.eventId === item.eventId) === index)
    }
  }

  async function runSearch(text = prompt) {
    const query = text.trim()
    if (!query || loading) return
    prompt = query
    loading = true
    errorMsg = ''
    activeClass = 'all'
    localFilter = ''
    details = null
    pagination = null
    await fetchPage(query, 1, false)
    loading = false
  }

  async function fetchPage(query: string, page: number, append: boolean) {
    const { data, error } = await searchInvestigation({ text: query, page, perPage: 10, sortField: 'score', sortOrder: 'desc', score: score > 0 ? score : undefined, include: { summary: true, cards: true, timeline: true, mapPoints: true, diagnostics: true } })
    if (error) {
      errorMsg = error.message || 'Search failed'
      return
    }
    const next = normalize(data?.details)
    details = append ? mergeDetails(details, next) : next
    pagination = data?.pagination ?? null
  }

  async function loadMore() {
    if (!prompt.trim() || !hasNextPage || loadingMore || loading || !pagination) return
    loadingMore = true
    await fetchPage(prompt.trim(), pagination.page + 1, true)
    loadingMore = false
  }

  function onScroll(event: Event) {
    const el = event.currentTarget as HTMLElement
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 520) loadMore()
  }

  function mediaPath(value?: string) {
    const raw = (value || '').trim()
    if (!raw) return ''
    if (/^(blob|data|https?):/i.test(raw)) return raw
    if (raw.startsWith('/kapi/files/')) return raw.replace(/^\/kapi\/files/, '/api/v1/files')
    if (raw.startsWith('/kapi/')) return raw
    if (raw.startsWith('/files/')) return `/api/v1${raw}`
    if (raw.startsWith('/api/v1/files/')) return raw
    const normalized = raw.replace(/^\/+/, '')
    if (normalized.startsWith('canonical/')) return `/api/v1/files/${normalized.split('/').map(encodeURIComponent).join('/')}`
    return ''
  }

  function previewUrl(card: InvestigationCard) { return mediaPath(card.media?.previewImageUrl) || mediaPath(card.media?.previewImagePath) }
  function classLabel(value?: string) { const key = (value || '').toLowerCase(); if (key === 'vehicle') return 'รถยนต์'; if (key === 'person' || key === 'pedestrian') return 'บุคคล'; if (key === 'face') return 'ใบหน้า'; return value || 'อื่นๆ' }
  function classIcon(value?: string) { const key = (value || '').toLowerCase(); if (key === 'vehicle') return 'bi-car-front'; if (key === 'person' || key === 'pedestrian') return 'bi-person'; if (key === 'face') return 'bi-person-bounding-box'; return 'bi-radar' }
  function locationLabel(card: InvestigationCard) { return card.location?.label || card.camera?.zone || 'Unknown location' }
  function formatTime(value?: string) { if (!value) return '--:--'; const date = new Date(value); if (Number.isNaN(date.getTime())) return '--:--'; return new Intl.DateTimeFormat('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Asia/Bangkok' }).format(date) }
</script>

<DomainStarter title="AI Investigation Center" subtitle="ค้นหาบุคคล รถ เหตุการณ์ และพฤติกรรมจากกล้องวงจรปิดด้วย AI" icon="bi-search-heart" legacyName="ksearch">
  <div class="ai-investigation-shell" onscroll={onScroll}>
    <section class="command-panel">
      <div class="prompt-row">
        <i class="bi bi-search"></i>
        <textarea bind:value={prompt} rows="2" placeholder="ค้นหารถกระบะสีแดง ในช่วงเช้านี้ บริเวณลานจอดรถ" onkeydown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); runSearch() } }}></textarea>
        <button class="send-btn" type="button" aria-label="Search investigation" disabled={loading || !prompt.trim()} onclick={() => runSearch()}><i class="bi {loading ? 'bi-arrow-clockwise spin' : 'bi-send'}"></i></button>
      </div>
      <div class="tool-row">
        <button type="button"><i class="bi bi-mic"></i> Voice</button><button type="button"><i class="bi bi-image"></i> Image</button><button type="button"><i class="bi bi-camera-video"></i> Video</button>
        <label class="score-box"><i class="bi bi-speedometer2"></i> Score <input bind:value={score} type="number" min="0" max="1" step="0.05" /></label>
      </div>
    </section>

    <div class="suggestions"><span>แนะนำการค้นหา</span>{#each suggestions as item}<button type="button" onclick={() => runSearch(item)}>{item}</button>{/each}</div>
    {#if errorMsg}<div class="alert alert-danger py-2">{errorMsg}</div>{/if}

    {#if details}
      <section class="summary-panel"><div><div class="muted">AI สรุปผลการค้นหา</div><h2>{details.summary.headline}</h2><p>{details.summary.narrative}</p></div><div class="summary-cards">{#each Object.entries(details.summary.byClass ?? {}) as [name, count]}<div><i class="bi {classIcon(name)}"></i><strong>{count}</strong><span>{classLabel(name)}</span></div>{/each}</div></section>
      <section class="result-tools"><div class="tabs">{#each classTabs as tab}<button type="button" class:active={activeClass === tab.key} onclick={() => activeClass = tab.key}>{tab.label}<small>{tab.count}</small></button>{/each}</div><label class="filter-box"><i class="bi bi-search"></i><input bind:value={localFilter} type="search" placeholder="Filter results..." /></label></section>
      <section class="workspace-grid"><div class="cards-grid">{#if cards.length}{#each cards as card (card.eventId)}<article class="event-card"><div class="media-box">{#if previewUrl(card)}<ProtectedImage src={previewUrl(card)} alt={card.caption} class="event-image" /><button class="zoom-btn" type="button" onclick={() => zoomCard = card} aria-label="zoom image"><i class="bi bi-search"></i></button>{:else}<div class="image-fallback"><i class="bi {classIcon(card.class)}"></i><span>preview image unavailable</span></div>{/if}<span class="confidence">{card.confidenceLabel}</span></div><div class="event-body"><div class="event-head"><h3>{card.title}</h3><span>{classLabel(card.class)}</span></div><p>{card.caption}</p><div class="meta-grid"><div><small>Camera</small><b>{card.camera?.name || 'Unknown'}</b></div><div><small>Location</small><b>{locationLabel(card)}</b></div></div><div class="tags">{#each (card.tags ?? []).slice(0, 5) as tag}<span>{tag}</span>{/each}</div></div></article>{/each}{:else}<div class="empty-state">ไม่พบ event ในหมวดนี้</div>{/if}</div><aside class="side-panel"><section><h3>แผนที่เหตุการณ์</h3><div class="map-mock">Map point จะแสดงเมื่อ event id match location จาก canonical data</div></section><section><h3>ไทม์ไลน์เหตุการณ์</h3>{#if details.timeline?.length}<div class="timeline-list">{#each details.timeline as item}<div><time>{formatTime(item.occurredAt)}</time><span></span><p>{item.title || item.label || item.eventId}</p></div>{/each}</div>{:else}<div class="empty-mini">Timeline จะแสดงหลังค้นหา</div>{/if}</section></aside></section>
      {#if hasNextPage || loadingMore}<div class="load-more"><button class="btn btn-outline-theme" type="button" disabled={loadingMore} onclick={loadMore}>{loadingMore ? 'Loading…' : 'โหลดผลลัพธ์เพิ่ม'}</button></div>{/if}
    {:else if !loading}
      <section class="starter-grid"><div><i class="bi bi-braces-asterisk"></i><b>Natural language</b><p>พิมพ์คำค้นหาแบบคนคุยกับคน เช่น สีรถ เสื้อผ้า พื้นที่ หรือช่วงเวลา</p></div><div><i class="bi bi-map"></i><b>Geo context</b><p>ผลลัพธ์ match event id แล้วเติม camera, zone, location และ map point</p></div><div><i class="bi bi-clock-history"></i><b>Timeline first</b><p>Event intelligence ถูกจัดเรียงเป็นลำดับเหตุการณ์</p></div></section>
    {/if}
  </div>
  {#if loading}<div class="status-toast"><i class="bi bi-arrow-clockwise spin"></i>กำลังสืบค้นด้วย AI และ match event id กับ canonical data...</div>{/if}
  {#if zoomCard}<div class="zoom-modal" role="button" tabindex="0" aria-label="Close zoom image" onclick={(e) => { if (e.target === e.currentTarget) zoomCard = null }} onkeydown={(e) => { if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') zoomCard = null }}><div><header><span>{zoomCard.title}</span><button type="button" aria-label="Close zoom image" onclick={() => zoomCard = null}><i class="bi bi-x-lg"></i></button></header><ProtectedImage src={previewUrl(zoomCard)} alt={zoomCard.caption} class="zoom-image" /></div></div>{/if}
</DomainStarter>

<style lang="scss">
  .ai-investigation-shell { max-height: calc(100vh - 10rem); overflow: auto; padding-right: .25rem; }
  .command-panel, .summary-panel, .event-card, .side-panel section, .starter-grid > div { border: 1px solid rgba(255,255,255,.12); background: rgba(18,18,22,.72); border-radius: 8px; }
  .prompt-row { display: flex; gap: 1rem; padding: 1rem; border-bottom: 1px solid rgba(255,255,255,.1); align-items: center; textarea { flex: 1; resize: none; background: transparent; border: 0; color: #fff; outline: 0; } }
  .send-btn { width: 46px; height: 46px; border-radius: 999px; border: 0; background: #00d084; color: #001b12; }
  .tool-row, .suggestions, .result-tools, .tabs { display: flex; flex-wrap: wrap; gap: .5rem; align-items: center; }
  .tool-row { padding: .75rem; button, .score-box { border: 1px solid rgba(255,255,255,.12); background: rgba(255,255,255,.04); color: #c8cad1; border-radius: 6px; padding: .45rem .7rem; } input { width: 4rem; background: transparent; border: 0; color: #fff; text-align: right; } }
  .suggestions { margin: 1rem 0; button { border: 1px solid rgba(255,255,255,.12); background: transparent; color: #c8cad1; border-radius: 999px; padding: .35rem .8rem; } }
  .summary-panel { margin-top: 1rem; padding: 1rem; display: flex; justify-content: space-between; gap: 1rem; h2 { font-size: 1.1rem; } p, .muted { color: #9296a3; } }
  .summary-cards { display: flex; gap: .75rem; > div { min-width: 96px; border: 1px solid rgba(255,255,255,.1); border-radius: 6px; padding: .75rem; display: grid; gap: .2rem; } strong { font-size: 1.4rem; } span { color: #9296a3; font-size: .78rem; } }
  .result-tools { margin: 1rem 0; justify-content: space-between; .tabs button { border: 1px solid rgba(255,255,255,.12); background: rgba(255,255,255,.03); color: #c8cad1; border-radius: 6px; padding: .5rem .75rem; &.active { border-color: rgba(0,208,132,.55); color: #00d084; background: rgba(0,208,132,.12); } small { margin-left: .5rem; opacity: .7; } } }
  .filter-box { min-width: 280px; border: 1px solid rgba(255,255,255,.12); border-radius: 6px; padding: .5rem .75rem; display: flex; gap: .5rem; input { flex: 1; background: transparent; border: 0; color: #fff; outline: 0; } }
  .workspace-grid { display: grid; grid-template-columns: minmax(0, 1fr) 360px; gap: 1rem; }
  .cards-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 1rem; }
  .event-card { overflow: hidden; .media-box { position: relative; aspect-ratio: 16 / 10; background: #17181d; } .event-image { width: 100%; height: 100%; object-fit: cover; } .confidence { position: absolute; top: .75rem; left: .75rem; background: rgba(0,0,0,.72); color: #fff; border-radius: 5px; padding: .25rem .5rem; font-size: .75rem; } .zoom-btn { position: absolute; top: .75rem; right: .75rem; width: 36px; height: 36px; border-radius: 50%; border: 1px solid rgba(255,255,255,.25); color: rgba(255,255,255,.85); background: rgba(0,0,0,.22); backdrop-filter: blur(8px); } }
  .image-fallback { height: 100%; display: grid; place-content: center; gap: .5rem; color: #858996; text-align: center; }
  .event-body { padding: 1rem; p { color: #a8acb8; } .event-head { display: flex; justify-content: space-between; gap: .75rem; h3 { font-size: 1rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } span { color: #ff6b8a; border: 1px solid rgba(255,107,138,.35); border-radius: 5px; padding: .2rem .45rem; font-size: .75rem; } } }
  .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: .5rem; > div { background: rgba(255,255,255,.04); border-radius: 6px; padding: .55rem; } small { display: block; color: #858996; } b { font-size: .86rem; } }
  .tags { display: flex; flex-wrap: wrap; gap: .35rem; margin-top: .75rem; span { background: rgba(255,255,255,.08); border-radius: 4px; color: #c8cad1; padding: .2rem .45rem; font-size: .75rem; } }
  .side-panel { display: grid; gap: 1rem; align-content: start; section { padding: 1rem; } .map-mock { height: 260px; display: grid; place-items: center; text-align: center; color: #858996; border: 1px solid rgba(255,255,255,.1); border-radius: 8px; background-image: linear-gradient(rgba(255,255,255,.06) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.06) 1px, transparent 1px); background-size: 32px 32px; } }
  .timeline-list { max-height: 340px; overflow: auto; display: grid; gap: .75rem; > div { display: grid; grid-template-columns: 64px 1px 1fr; gap: .75rem; color: #c8cad1; span { background: rgba(255,255,255,.18); } time { color: #858996; font-size: .75rem; } p { margin: 0; } } }
  .starter-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem; margin-top: 2rem; > div { padding: 1rem; display: grid; gap: .5rem; p { color: #9296a3; } i { color: #00d084; font-size: 1.4rem; } } }
  .load-more { text-align: center; padding: 1.25rem; }
  .status-toast { position: fixed; left: 50%; bottom: 1rem; transform: translateX(-50%); z-index: 50; border: 1px solid rgba(0,208,132,.35); background: rgba(0,18,12,.95); color: #00d084; border-radius: 8px; padding: .75rem 1rem; }
  .spin { animation: spin 1s linear infinite; } @keyframes spin { to { transform: rotate(360deg); } }
  .zoom-modal { position: fixed; inset: 0; z-index: 80; background: rgba(0,0,0,.82); display: grid; place-items: center; padding: 1rem; > div { width: min(1100px, 96vw); border: 1px solid rgba(255,255,255,.14); border-radius: 8px; background: #0f1014; overflow: hidden; } header { display: flex; justify-content: space-between; padding: .75rem 1rem; border-bottom: 1px solid rgba(255,255,255,.12); } button { border: 0; background: transparent; color: #fff; } :global(.zoom-image) { width: 100%; max-height: 78vh; object-fit: contain; background: #000; } }
  @media (max-width: 1200px) { .workspace-grid { grid-template-columns: 1fr; } }
  @media (max-width: 760px) { .starter-grid { grid-template-columns: 1fr; } .summary-panel { display: block; } .summary-cards { margin-top: 1rem; flex-wrap: wrap; } }
</style>
