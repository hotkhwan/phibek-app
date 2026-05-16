# Changelog

All notable changes to the **PHIBEK · winn** SvelteKit FE.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
this project follows semantic versioning.

## [Unreleased]

## [0.13.0] — 2026-05-16

### Added
- **`/floorPlans/[id]` placement editor — drag-drop camera markers on the canvas.** Replaced the read-only detail view with a full canvas editor:
  - Click "Edit placements" → canvas enters edit mode (crosshair cursor + bottom hint banner)
  - Click empty space → camera picker modal opens (filters out cameras already placed on this plan); pick a camera → marker drops at the click coordinate
  - Drag an existing marker to reposition; PATCH fires on pointer-up so the live BE state always matches what's on screen
  - Click a marker to select; right-side panel shows the selected marker's camera + label + coordinates; in edit mode the panel exposes "Edit label" + "Remove marker" actions
  - Coordinates stored as percentages of the image (0-100) so the BE persists a resolution-independent position — matches the klynx-feature contract
- API additions in [`lib/api/floorPlan.ts`](src/lib/api/floorPlan.ts): `listPlacements`, `addPlacement`, `updatePlacement`, `removePlacement` + types `PlacementInput`, `PlacementUpdate`, `FloorPlanPlacement`. Endpoints: `GET / POST / PATCH / DELETE /kapi/floorPlans/{id}/placements[/:placementId]`.
- Types extended: `FloorPlan` now carries `buildingName`, `floorLabel`, `scaleMetersPerPx`, `lat`, `lng` (matches the create-modal fields shipped in 0.11.0 PR #40). `Camera` extended with `brand`, `district`, `user`, `lat`, `lng`, `monitorState` (the picker uses brand/district to disambiguate).

### Notes
- `bun run check` — 2771 files / 0 errors / 0 warnings.
- **Deferred follow-up slices on this surface:**
  - `suggestPlacements` (BE 4.x — heuristic auto-place for new floor plans)
  - `bulkAddPlacements` (BE 4.x — bulk import via CSV / pairing helper)
  - Yaw / direction indicator on the marker (BE schema carries `yawDeg` but the editor doesn't yet expose a rotate handle)
- This PR can land independently of PR #40 (devices+floorPlans CRUD) — the only field added by #40 that this editor uses (`scaleMetersPerPx`, `buildingName`, `floorLabel`) is also extended in this branch's `floorPlan.ts`. If #40 lands first, the merge is clean.

## [0.9.1] — 2026-05-15

### Changed
- Dashboard content now removes the Phase 1/2/3 experience strip, event-type KPI card,
  event-breakdown callout, and recent activity feed so the Livestream Analytics page stays focused.

## [0.9.0] — 2026-05-15

### Added
- System Users permission management now uses a file-manager tree UI for profiles, menu scopes,
  org-unit/user scopes, resource groups, cameras, and read-only API integration scopes.
- Sidebar organization selector now lists Klynx organizations and keeps the active workspace in
  the shared workspace store.

### Fixed
- Org unit creation now blocks duplicate unit names under the same parent before hitting the API.
- `/landing/landing` is treated as a public route and redirects back to the public landing root
  without creating an auth redirect loop.

## [0.8.1] — 2026-05-15

### Fixed
- System Users table avatars now stay at the compact 30px row size when protected images load.
- Dashboard viewer map now renders with MapLibre GL JS clusters instead of the temporary CSS map.
- Dashboard waits briefly for the auth context before firing livestream analytics API calls and uses Motion One for the initial analytics card entrance.

## [0.8.0] — 2026-05-15

### Changed
- Dashboard content now follows the Phase 1 Livestream Analytics direction: a clear Phase 1/2/3
  experience strip, cleaner analytics density, preserved camera-group line chart, and an API-driven
  activity summary panel for livestream event counts.

## [0.7.5] — 2026-05-15

### Fixed
- Dashboard now calls the livestream analytics API (`/analytics/live/overview` and `/analytics/live/events`)
  instead of rendering static-only cards; fallback demo data remains only for loading/error states.

## [0.7.0] — 2026-05-06

### Added
- Phase 7 — deploy + close: `Dockerfile` (multi-stage bun → adapter-node),
  `.dockerignore`, `.env.prod`, `k8s/deployment.yaml`, `k8s/referencegrant.yaml`,
  `Jenkinsfile`, top-level `README.md` + `CHANGELOG.md`.

## [0.6.0] — 2026-05-06

### Added
- Phase 6 — secondary surfaces: `/mqtt` (full port — subscribe + publish console),
  `/watchman` (iframe wrapper), `/videowall` (2x2/3x3/4x4 layout + click-to-start),
  `/subscription` + `/pricing` + `/biDash` placeholder + `/map` placeholder.
- Public surfaces: `(public)/landing` (CI-styled hero), `(public)/changelog` (+ `[...slug]`),
  `(public)/docs` (+ `[...slug]`).
- Tools section in sidebar: Live, Map, Video Wall, BI Dashboard, MQTT Console, Watchman.
- `lib/api/klynxSubscription.ts` — `listPackages()`, `getCurrentSubscription()`, `startCheckout()`,
  `verifyCheckout()` against `/kapi/subscriptions/*` + `/kapi/billing/*`.

### Changed
- `hooks.server.ts` — added `/changelog`, `/docs`, `/silent-check-sso.html` to public allowlist;
  fixed `comming-soon` typo to `comingsoon`.

## [0.5.0] — 2026-05-06

### Added
- Phase 5 — domain shell #3: `/edge-ai`, `/ingest` (+ `/dashboard`), `/floorPlans` (+ `[id]`),
  `/police`, `/polices` (live MQTT feed), `/admin` (+ `/licenses` + `/platform-license`).
- `lib/api/{edgeAi,klynxIngest,floorPlan,police,adminLicense}.ts`.
- Sidebar Operations + Admin sections.

## [0.4.0] — 2026-05-06

### Added
- Phase 4 — domain shell #2 (rebranded klynx domains):
  `/aiSearch` (← ksearch), `/iotWatch` (← kwatch), `/iotControl` (← kcontrol)
  with sub-pages (events / logs / map / sop), `/systemDevices/{cameras,edge,groups}`,
  `/systemUsers/{users,organizations,unit,permissions}` — 14 starter pages total.
- `lib/api/{aiSearch,iotControl,iotWatch,devices,klynxUser}.ts`.
- Shared `DomainStarter.svelte` + `DataTableStarter.svelte` components.
- `appSidebarMenus.ts` rewritten to PHIBEK navigation (Dashboard, AI Search,
  IoT Watch, IoT Control + sub, System · Devices, System · Users, Account).
  gateway-portal Events/Delivery/Workspaces menus removed.

## [0.3.0] — 2026-05-06

### Added
- Phase 3 — realtime + media + brand:
  - PHIBEK CI applied: Sass vars + CSS custom properties for navy/oracle-gold/foresight-gold/wisdom-cream.
  - `lib/stores/mqtt.ts` — singleton `MqttClient` (lazy import, browser-only)
    with `subscribeMqtt()` (`+`/`#` wildcards) + status/lastError stores.
  - `lib/utils/{streamUrl,sse}.ts` — port of `useStreamUrl` + `useSSE`.
  - Players: `FlvPlayer` / `HlsPlayer` / `WebRTCPlayer` / `VideoPlayer` (auto-detect).
  - `static/js/ZLMRTCClient.js` (298KB — copied from klynx) for ZLM WebRTC.
  - `(app)/live/+page.svelte` smoke surface.
  - `static/img/logo/phibek-mark.svg` placeholder + brand block in `AppHeader`.

### Changed
- Title is now "PHIBEK · winn" (was "PHIBEK Platform"); meta theme-color set to navy.

## [0.2.0] — 2026-05-06

### Added
- Phase 2 — domain shell #1: dashboard (5 KPI + scope toggle), profile (form),
  settings (locale + theme + branding panel).
- `lib/utils/fetch.ts` — port of `useApi` with auto Bearer + X-Active-Org +
  FormData support.
- `lib/api/{dashboard,profile,branding,workspace}.ts`.
- `lib/stores/branding.ts` (+ `lib/types/branding.ts`).
- `package.json` `i18n:compile` script (mergeI18n + paraglide compile chain).
- `.env` wired to klynx-api production (KC sso/realm/fe + api/v1 + mqtt).

## [0.1.0] — 2026-05-06

### Added
- Phase 0–1 bootstrap:
  - SvelteKit 2 + Svelte 5 + Vite 7 + adapter-node skeleton from gateway-portal pattern.
  - Cyber Admin v2.0 SCSS theme integrated (`src/scss/`).
  - Routes: root layout, redirect `/` → `/dashboard`, `(app)`/`(base)`/`(public)` groups,
    `(base)/auth/{login,callback,error,session,session/start}`, `(base)/api/auth/logout`.
  - Keycloak silent-SSO via `lib/client/keycloak.ts` + httpOnly cookie session in `hooks.server.ts`.
  - `lib/stores/{auth,notify}.ts` + `Toaster.svelte`.
  - paraglide-js i18n with `mergeI18n.js` + 1528 keys (en/th).
