# Changelog

All notable changes to the **PHIBEK · winn** SvelteKit FE.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
this project follows semantic versioning.

## [Unreleased]

### Added
- Added `/intDash` as the AI Event Intelligence surface and sidebar entry, backed by the existing
  ingest dashboard/events APIs.
- Added the contract-backed realtime WSS hub behind `PUBLIC_REALTIME_HUB_ENABLED`, with first live
  bindings for camera status, IntDash ingest events, and the Ingest event feed.
- Extended realtime WSS bindings across Dashboard, BI Dashboard, Video Wall, and kControl surfaces
  (`status`, `alarm`, `event`, and `temperature`) using the shared contract-backed hub.
- Added Edge AI summary route entries for `/edge-ai/summary-report` and the summary sub-pages, with
  sidebar entries gated by the existing Edge AI menu IDs.
- Added contract-gated dynamic Edge device links in the sidebar from `/system/edge`, opening only
  documented `http(s)` device URLs while Edge SSO auto-login remains contract-blocked.
- Added `/iotControl/temperature` with kControl temperature summary, per-device history, and org
  threshold configuration from the documented kControl temperature REST contract.

### Changed
- Sidebar and protected app routes now consume `GET /kapi/orgs/effectiveAccess` before exposing
  grant-controlled pages, including a safe redirect to Dashboard/Profile when a direct URL is not
  allowed.
- System Users permission trees now handle nested/list response shapes more defensively and include
  clearer selected/partial-selected states plus expand/collapse controls.

### Fixed
- Header search now opens the Cyber Admin overlay correctly, focuses the search input, closes via
  icon/ESC, and no longer relies on a hidden `d-none` form that defeated the shell toggle class.
- Added the missing `/ingest/events` route entry so the sidebar's ingest event link resolves to the
  already-ported event feed instead of depending on the collapsed `/ingest` path.
- Cameras, edge devices, and org units now wait for an active organization before loading and tolerate
  both tree and list response envelopes from the existing Klynx APIs.

## [0.9.3] — 2026-05-17

### Fixed
- **MapLibre blank-tiles on first paint (Dashboard viewer map).** Defensive port of klynx 3.54.2 / 3.43.6 — parent flex/grid layouts can settle the canvas width AFTER MapLibre measured at construct time, leaving the tile layer painted at `0 × height` even though the visible card is the right size. Added `requestAnimationFrame(() => map.resize())` inside the `map.on('load')` handler in [`ViewerMapLibre.svelte`](src/lib/components/dashboard/ViewerMapLibre.svelte) so MapLibre remeasures once the page layout settles. Tiles paint correctly on first load now.
- **`/systemUsers/users` CSV-export filename was one day off near midnight Bangkok.** Pre-fix the filename used `new Date().toISOString().slice(0, 10)` which converts to UTC. In Asia/Bangkok past 17:00 the UTC date is already the next day → the export of "today's users" landed on a file named tomorrow's date, and vice-versa around midnight. Switched to local-timezone `getFullYear / getMonth / getDate` Y-M-D stamp. Mirrors klynx 3.43.4's `useAnalytics.formatDateRange` fix — same root cause class, different surface.

### Notes
- `bun run check` — 2771 files / 0 errors / 0 warnings.
- **Companion fix applies once PR #39 lands**: `IntDashMap.svelte` (in PR #39) has the same construct-time-measure pattern. Will add a follow-up commit on that branch (or stack a small chore on top of the merged develop) to apply the same `rAF resize` defensive pattern.
- **klynx 3.55.0 fixes audited but mostly N/A on phibek:**
  - **ResourceGroupIconSelector 128px resize** — phibek RG groups page (PR #45) uses plain URL input for icons (no selector with upload), so no resize logic to add yet. When phibek ships an icon selector, mirror klynx's `targetIconSize` helper.
  - **Google Maps API key optional** — phibek doesn't use Google Maps anywhere (MapLibre + Leaflet only); no equivalent throw-sites to remove.
  - **`/settings/map` save validation** — phibek `/settings` is a starter without map-provider validation; nothing to relax.

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
