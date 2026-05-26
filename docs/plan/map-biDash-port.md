# `/map` ← `klynx/biDash.vue` Port Plan

**Date:** 2026-05-26
**Status:** Draft (multi-session)
**Type:** FE-only port (no BE / contract changes)
**Source:** [klynx/app/pages/biDash.vue](/home/klynx/klynx/app/pages/biDash.vue) (~4,140 LOC)
**Target:** `phibek/src/routes/(app)/map/+page.svelte` (currently a 37-line placeholder)

---

## 1. Why multi-session

biDash.vue is the largest single page in klynx (~4.1k LOC). It pulls in:

- `@googlemaps/js-api-loader` + `@googlemaps/markerclusterer`
- Leaflet + `leaflet.markercluster` (alt path)
- `useMapBootstrap`, `useBiDashTimeseries`, `useStreamUrl`, `useStreamSession`, `useStreamPlayerPageEvents`, `useStreamTicket`, `useCameraPlayerStrategy`, `useStreamSettings`, `useWsTopic`, `useEffectiveAccessStore` — 10+ composables
- `WebRTCPlayer.vue`, `FlvPlayer.vue` (already ported to phibek as `$lib/components/shared/WebRTCPlayer.svelte` + `FlvPlayer.svelte`)
- `vuedraggable` for left/right card dock
- 6 type modules (`devices`, `event`, `analytics`, `klivePlayerEvent`, `resoures`, `i18n`)
- ~2,500 LOC of script logic + ~600 LOC of template + ~750 LOC of scoped CSS

A 1:1 port in one slice would push beyond the 1-hour task budget in CLAUDE.md. The plan below splits it into 4 sub-slices that each ship independently and stay within budget.

The phibek deploy already uses `PUBLIC_API_BASE_URL` directly (no `/kapi/*` proxy), and the WSS hub is contract-driven via `/ws/v1/negotiate` — so the port can drop the klynx `~/utils/api` indirection and call `apiSafe` from `$lib/utils/fetch` directly.

---

## 2. Scope

### In scope (across all 4 sub-slices)

- Camera map at `/map`: Leaflet (primary) base layer with CARTO Dark / Light tiles per phibek brand
- Marker layer using `@googlemaps/markerclusterer` or `leaflet.markercluster` — markers colored by camera `monitorState` (online / offline / unknown)
- Camera-status realtime via the existing `subscribeWsTopic('camera.status.v1' / `WS_TOPICS.CAMERA_STATUS`)
- Hover / click popup showing camera name + last status + a "Watch live" CTA
- Stream player popup using the existing `$lib/components/shared/WebRTCPlayer.svelte` + `FlvPlayer.svelte` (already in tree)
- Resource-group picker + ownership scope filter (`all` / `owner` / `public`) using `$lib/api/devices.listCameras({ scope })`
- Date-range picker for the time-series strip
- Responsive — collapses to single-column on `< 992px`

### Out of scope (deferred or omitted)

- `vuedraggable` card dock — replace with a fixed left rail (single-orientation) to drop the dep
- Google Maps SDK provider — pick Leaflet-only to drop the SDK dep + key handling (klynx supports both)
- BiDash-specific composables that bundle stream-session lifecycle, ticket fetch, etc. — collapse into `$lib/components/shared/CameraStreamLightbox.svelte` (new) that internally chooses player kind via `resolveCameraPlayerStrategy` (already ported)
- Klive batch emitter / `kliveEmitter` — defer; first slice does direct WSS subscribe
- Multi-language SVG glyphs / klynx-specific i18n utils — phibek uses paraglide

### Success criteria

- `/map` opens within 1.5s on a cold load (Leaflet bundle + tiles)
- 100+ camera markers cluster cleanly at default zoom; clicking a cluster zooms in
- Online camera markers turn red within 2s of `camera.status.v1` going offline
- "Watch live" opens an HLS/FLV/WebRTC stream within 3s

---

## 3. Sub-slice breakdown

Each sub-slice ends with `bun run check` green + a focused `/map` smoke pass + a PR `chore/map-<slice>-<date>` → `develop`.

### Slice 1 — Map shell + camera fetch (~45 min)

- Replace `(app)/map/+page.svelte` placeholder with monitor-mode shell (same pattern as `/intDash` and `/floorPlans`: `appContentClass` override, flex column)
- Header: page title + scope toggle (all / owner / public) + group picker + refresh
- Leaflet container fills available height; mount once on `onMount`
- Fetch `listCameras({ perPage: 500, scope })` from `$lib/api/devices`
- Render markers using the existing `placement-marker` SVG camera (ported in this PR) — color from `monitorState`
- Empty state when 0 cameras
- No clustering, no realtime, no player yet — verifies the shell + fetch path
- Stop at this point and PR for UAT

### Slice 2 — Clustering + realtime status (~45 min)

- Add `leaflet.markercluster` (`.markercluster-default.css` + `MarkerClusterGroup`) — already used by `IntDashMap.svelte`, so copy the init code
- Re-tint markers when WSS frame arrives for `camera.status.v1` via existing `wsHub`
- Add a "LIVE / Syncing / WSS error" chip in the top-left of the map (same component shape as `IntDashMap`)
- Status legend (online / offline / unknown) — bottom-left chip
- Stop and PR for UAT

### Slice 3 — Hover popup + camera detail card (~45 min)

- Marker click opens a Bootstrap popover (Leaflet `bindPopup`) — name, status, last-status timestamp, resource group, district
- "Watch live" button opens a new `CameraStreamLightbox.svelte` wrapper in `$lib/components/shared/`:
  - Calls `getStreamTicket(camera)` (already in `$lib/api/devices` or a new `cameraStream.ts`) to mint a fresh ticket
  - Picks player via existing `resolveCameraPlayerStrategy` helper (already in tree)
  - Renders `WebRTCPlayer`, `FlvPlayer`, or `HlsPlayer` accordingly
- ESC closes lightbox; clicking outside closes
- Stop and PR for UAT

### Slice 4 — Polish + responsive + UAT cleanup (~30 min)

- Pan + zoom controls themed to phibek
- `< 992px` collapses the right rail (analytics strip) and uses bottom-sheet for popup
- Dark / light theme toggle hooks into existing `data-bs-theme` so the tile layer swaps (CARTO Dark ↔ CARTO Voyager)
- Bundle inspection — confirm Leaflet + cluster + maplibre-gl (if pulled by `ViewerMapLibre`) don't double-up

---

## 4. Files touched (estimate)

| File | Slice 1 | Slice 2 | Slice 3 | Slice 4 |
|---|---|---|---|---|
| `src/routes/(app)/map/+page.svelte` | rewrite ~250 LOC | +80 | +120 | +60 |
| `src/lib/components/map/MapShell.svelte` (new) | ~180 LOC | — | — | — |
| `src/lib/components/map/CameraMarker.svelte` (new, reuses placement SVG) | ~80 | — | — | — |
| `src/lib/components/shared/CameraStreamLightbox.svelte` (new) | — | — | ~150 | +30 |
| `src/lib/api/devices.ts` | — | — | maybe +20 (getStreamTicket) | — |
| `src/lib/api/mapOptions.ts` (new — `listMapOptions`) | ~40 | — | — | — |

No backend contract changes; no `klynx-api/docs/contracts/*.md` updates.

---

## 5. Risks

| Risk | Mitigation |
|---|---|
| Leaflet's `invalidateSize()` race when the page is inside a flex-1 container | Mirror the `IntDashMap.svelte` pattern: call `requestAnimationFrame(() => map.invalidateSize())` + a 300ms backup `setTimeout` after the parent grid finishes layout |
| WebRTC player init in popup can take 2-3s on cold load | Show a skeleton inside the lightbox; preload the HLS fallback URL when the popup opens |
| Marker cluster bundle size (~30KB gzipped) | Acceptable — same dep already used by `IntDashMap` |
| 500+ camera DOM markers tank panning FPS | Use cluster group's `chunkedLoading: true` + `disableClusteringAtZoom: 18` |

---

## 6. Validation checklist (final slice)

- [ ] `bun run check` clean
- [ ] `/map` loads with 0 cameras → shows empty state, no console errors
- [ ] `/map` with > 100 cameras → cluster bubbles render; click expands; no DOM lag
- [ ] Toggling scope re-queries `/resources/camera?scope=` and re-tints markers
- [ ] Going offline on a single camera (publish a status WSS frame from `wscat`) flips its marker color within 2s
- [ ] Click marker → popup; click "Watch live" → lightbox opens with the right player kind
- [ ] Light / dark theme tile swap on `data-bs-theme` change
- [ ] No regression on `/intDash`, `/floorPlans` (both share Leaflet/cluster bundles)

---

## 7. Open questions

- Should `/map` and `/intDash` share a single Leaflet shell component or stay separate? Recommendation: stay separate for now — `IntDashMap` is event-pin focused, `/map` is camera-pin focused, the data flow + marker symbology diverge enough that a shared abstraction would be premature
- Where does `getStreamTicket` live — extend `$lib/api/devices.ts` or new `$lib/api/cameraStream.ts`? Recommendation: new file (separation of concerns; matches klynx's `composables/useStreamTicket.ts`)
- Should `vuedraggable` card dock be ported (= add a Svelte drag-and-drop lib like `svelte-dnd-action`) or dropped? Recommendation: drop — it's a power-user nicety that adds 20KB; if operators ask later, file as a follow-up
