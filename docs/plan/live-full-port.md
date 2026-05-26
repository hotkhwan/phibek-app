# `/live` ← `klynx/live.vue` Full Port Plan

**Date:** 2026-05-26
**Status:** Draft (multi-session)
**Type:** FE-only port (no BE / contract changes)
**Source:** [klynx/app/pages/live.vue](/home/klynx/klynx/app/pages/live.vue) (~4,058 LOC)
**Target:** `phibek/src/routes/(public)/live/+page.svelte` (currently the Phase-3 smoke page kept as a placeholder while this port lands)
**Visibility:** Public — must work without an authenticated session

---

## 1. Why multi-session

live.vue rivals biDash.vue in size (4,058 LOC) and shares most of the same heavy deps:

- Google Maps SDK + `MarkerClusterer`
- WebRTCPlayer + FlvPlayer
- `useStreamUrl`, `useStreamTicket`, `useStreamSession`, `useStreamPlayerPageEvents`, `useStreamSettings`, `useCameraPlayerStrategy`, `mountStreamOverlay`, `buildOfflineCardHtml`, `kliveEmitter`, `useResourceGroupPicker`, `useWsTopic`
- `vuedraggable` for the left/right card dock (same as biDash)
- 1500+ LOC of script logic + 1000+ LOC of template
- Public-only filter (`mapVisibility = public | forcePublic`) — already present on `phibek/src/lib/api/devices.ts:listCameras`

The key wrinkle vs `/map`: `/live` is **public** — no auth, no `activeWorkspaceId`, no `effectiveAccess`. The Phase-3 smoke page that lives there today (post-Slice B-lite) carries no auth-required code, but a real port must explicitly skip every store / API helper that assumes an authenticated session.

---

## 2. Scope

### In scope

- Public camera map at `/live` rendering only cameras with `mapVisibility ∈ { 'public', 'forcePublic' }`
- Map shell: same Leaflet pattern as `/map`, dark / light tile swap on `data-bs-theme`
- Marker layer using marker-cluster with status-driven coloring (online / offline / unknown)
- Marker click → camera preview lightbox using `WebRTCPlayer` / `FlvPlayer` / `HlsPlayer` (existing in tree)
- Stream tickets via the same `getStreamTicket(camera)` path the `/map` port introduces — must work with an anonymous ticket (klynx-api allows ticket mint for public cameras without bearer)
- Realtime status updates for public cameras via `subscribeWsTopic(WS_TOPICS.CAMERA_STATUS, ...)` on the public negotiate path
- Mobile-friendly: full-width map on `< 992px` with a bottom-sheet preview instead of a side lightbox
- "Open admin app" link in the top-right that deep-links to `/intDash` (gated by auth — the landing nav already handles this)

### Out of scope

- Authenticated-only features: ownership filter, resource-group multi-pick, klive analytics, drag-and-drop dock, full-screen tour mode
- `vuedraggable` card dock — single column, no rearranging
- Klynx legacy klive batch emitter (`kliveEmitter`)
- Anything that requires `useEffectiveAccessStore` / `useAuthStore` / `activeWorkspaceId`

### Success criteria

- `/live` renders without a session cookie or Keycloak token
- Map shows only `mapVisibility=public|forcePublic` cameras
- Stream preview plays within 3s of clicking a marker on a healthy camera
- WSS status updates propagate within 2s (using the public `subscribeWsTopic` path)
- Page bundle is shareable on a public link (lighthouse score acceptable; no Keycloak SDK pulled into the initial bundle)

---

## 3. Pre-requisite — Slice 0 (anonymous WSS + ticket paths)

Before this port can start, three small BE-adjacent items must be confirmed in **klynx-api** by the BE owner (no work for phibek FE in Slice 0 — just confirm/test):

| Item | Required behavior | Where to verify |
|---|---|---|
| `POST /ws/v1/negotiate` for anonymous callers | Returns a ticket scoped to public cameras only when no Bearer is sent | `klynx-api/docs/contracts/realtime-wss.md` §3 |
| `GET /stream/ticket/:camId` for public cameras | Mints a ticket for cameras with `mapVisibility=public\|forcePublic` even when no Bearer is sent | `klynx-api/docs/contracts/streamTicket.md` |
| `GET /resources/camera?scope=public` without Bearer | Returns the public camera list; existing endpoint already supports this per the existing optional-auth route pattern in CLAUDE.md | `klynx-api/router/cameraapi.go` |

If any one of these is not yet contract-supported, the port stops at Slice 0 and a separate plan is opened against `klynx-api`.

---

## 4. Sub-slice breakdown (after Slice 0 is confirmed)

### Slice 1 — Public route shell + camera list (~45 min)

- Replace the Phase-3 smoke `/live` content with a real shell:
  - Top bar: PHIBEK brand mark, language toggle, "Open app" link (→ `/auth/login?returnTo=/intDash`)
  - Leaflet container fills the rest of the viewport
- Use `apiSafe('/resources/camera', { params: { scope: 'public' }, skipAuth: true })`
- Render markers without clustering or realtime (same shape as `/map` Slice 1)
- `bun run check` + smoke pass + PR

### Slice 2 — Clustering + public realtime (~45 min)

- Add cluster group (same pattern as `/map` Slice 2)
- Connect the wsHub via `/ws/v1/negotiate` without Bearer; treat denies gracefully (offline indicator chip)
- Live-update marker color on `camera.status.v1` frames
- PR

### Slice 3 — Marker click → public stream preview (~45 min)

- Marker click opens the new `CameraStreamLightbox.svelte` (reuse from `/map` slice 3) — same player strategy resolution
- Ticket mint via `getStreamTicket(camera, { skipAuth: true })` — public tickets only
- ESC / outside-click closes; URL hash `#cam=<camId>` records the open camera so a refresh restores it
- PR

### Slice 4 — Public landing integration + mobile UX + polish (~45 min)

- The landing page's `LIVE` nav link already points at `/live` (post-Slice B-lite)
- Add a hero-style intro banner above the map for first-time anonymous visitors (with a "Hide" toggle stored in `localStorage`)
- Mobile bottom-sheet for marker preview
- Lighthouse pass: no Keycloak SDK in the initial chunk; map tile + cluster bundles deferred until container mount
- PR + close-out

---

## 5. Files touched (estimate)

| File | Slice 1 | Slice 2 | Slice 3 | Slice 4 |
|---|---|---|---|---|
| `src/routes/(public)/live/+page.svelte` | rewrite ~280 LOC | +90 | +120 | +90 |
| `src/lib/components/map/PublicMapShell.svelte` (new) | ~160 | — | — | — |
| `src/lib/components/shared/CameraStreamLightbox.svelte` | — | — | shared w/ `/map` (no net new) | +20 (mobile sheet variant) |
| `src/lib/api/publicCameras.ts` (new) | ~50 | — | — | — |
| `src/lib/utils/fetch.ts` | — | — | — | maybe +10 (skipAuth fallback) |

No backend contract changes; no `klynx-api/docs/contracts/*.md` updates beyond Slice 0 verification.

---

## 6. Risks

| Risk | Mitigation |
|---|---|
| WSS negotiate without Bearer is rejected at runtime | Slice 0 verifies this is contract-supported; if not, fall back to REST polling every 30s until BE adds the public path |
| Keycloak SDK gets pulled into the initial chunk via SvelteKit's code splitting | Audit with `bun run build && bunx vite-bundle-visualizer`; lazy-import `keycloak-js` only inside `(app)` routes (already the case as of Slice B-lite) |
| Public stream ticket abuse | BE rate-limits ticket mint per IP per camera; no FE mitigation needed |
| Page accessibility behind corporate firewalls that block WSS | REST polling fallback per the existing `wsHubLastError` chip behavior |

---

## 7. Validation checklist (final slice)

- [ ] `/live` loads in an incognito window with cookies cleared — no redirect to `/auth/login`
- [ ] Network panel: no `/api/v1/keycloak` calls; no Bearer on `/resources/camera`, `/ws/v1/negotiate`, or `/stream/ticket/*`
- [ ] Map shows ≥1 public camera; markers cluster as expected
- [ ] Click a marker → lightbox opens with the right player kind; stream plays within 3s
- [ ] Publish a `camera.status.v1=offline` frame for a public camera → marker re-tints red within 2s
- [ ] Lighthouse "Performance" ≥ 75 on a cold load over a throttled 3G connection
- [ ] Hash deep-link `/live#cam=<camId>` restores the open camera on refresh
- [ ] Mobile: bottom-sheet preview opens; map remains pannable; close gesture returns focus to the marker

---

## 8. Open questions

- Anonymous WSS negotiate — is the contract path approved by BE? (Slice 0 gate)
- Should `/live` reuse `MapShell.svelte` from `/map` Slice 1 by gating the auth-required toolbar pieces with a `public` prop? Recommendation: build `PublicMapShell.svelte` separately first; if the two shells stabilize, refactor toward a shared component in a follow-up slice
- Should the public page surface a "Sign in to see your cameras" CTA on the empty state? Recommendation: yes — drives conversion to the authenticated app and matches the landing-nav LIVE entry
