# Changelog

All notable changes to the **PHIBEK · winn** SvelteKit FE.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
this project follows semantic versioning.

## [Unreleased]

## [0.11.0] — 2026-05-16

### Added
- **`systemDevices/cameras` upgraded from starter to full CRUD.** Replaced the 60-line `DomainStarter` + `DataTableStarter` view with a 600+ line phibek-native page modeled on the existing `systemUsers/users` pattern: 4 KPI summary cards by monitor state (online / offline / suspect / unknown) — click a card to toggle the filter, click again to clear; search input with Enter-to-fire; per-page selector (10 / 20 / 50 / 100) and windowed pagination footer; inline create/edit modal with name / brand / RTSP URL / user / password (with show-hide toggle) / lat / lng / district / angle / map visibility / description / offline note; password field shows "Leave blank to keep current" placeholder in edit mode; delete confirm dialog with explicit name in the message; "Sync monitor" button calls `POST /kapi/resources/camera/syncMonitor` and surfaces the `registered/skipped/failed` counts in a toast. Endpoints: `GET/POST/PATCH/DELETE /kapi/resources/camera`. **Out of scope (deferred follow-ups):** Google Maps marker placement on the lat/lng panel (klynx has a `loadGoogleMapsOnce()` interactive map picker), ROI shape drawing, WebRTC live preview in the form, Excel/CSV import + download-template flows, multi-select bulk enable/disable/public/private toggles, the detail-panel side drawer that surfaces resource-group + permission-profile bindings.
- **`systemDevices/edge` upgraded from starter to full CRUD.** Same pattern as cameras: 3 KPI tiles by type (SVMS / ATA / IBOC) — clickable filters, search, per-page + pagination, inline create/edit modal with type-conditional fields (ATA shows `apiKey` + `apiSecret`), edit mode keeps password unless re-entered (matches klynx-feature edge edit semantics), TLS toggle, delete confirm. Endpoints corrected: `/kapi/system/edge` (klynx-managed SVMS / ATA / IBOC nodes) — the previous starter pointed at `/kapi/resources/edge` (refId-paired connector edges), which is a different concept per [klynx-connector pairing contract](https://github.com/pointitconsulting/klynx-connector/blob/develop/docs/contracts/pairingApi.md). `lib/api/devices.ts` `EdgeDevice` shape now reflects the real `/system/edge` schema (`type`, `username`, `url`, `tls`).
- **`floorPlans` index upgraded with create / edit / delete modals.** The grid card layout from 0.7.x is kept but now wraps a per-card action bar (Edit / Delete) and a top-of-page "Add floor plan" button. Create modal does multipart `POST /kapi/floorPlans` with `image` + `name` + `scaleMetersPerPx` + optional `buildingName` / `floorLabel` / `description` / `lat` / `lng` (mirrors `useFloorPlanApi.create()` from klynx-feature). Edit modal does JSON `PATCH /kapi/floorPlans/{id}` for metadata — image swap is intentionally not supported from the inline modal (klynx-feature has the same constraint; replacement = new plan). Delete dialog warns that placements are removed with the plan. **Out of scope (deferred):** placement editor (drag-drop camera markers on the canvas) — the `/floorPlans/[id]` detail page is the natural home and is a separate slice given the canvas + suggest-placements + bulk-placement flows.

### Changed
- `lib/api/devices.ts` — added `createCamera`, `updateCamera`, `syncCameraMonitor`; corrected edge endpoint family to `/system/edge`; added `createEdgeDevice` / `updateEdgeDevice` / `deleteEdgeDevice` / `getEdgeDevice`. New types: `MonitorState`, `CameraInput`, `EdgeDeviceType`, `EdgeDeviceInput`, `EdgeListParams`. Existing types fleshed out with the fields the form layer needs (`brand`, `district`, `user`, `password`, `lat`, `lng`, `angle`, `mapVisibility`, `monitorState`, `monitorReasonCode`, `lastProbeAt`, `offlineDescription`, `dateTimeCreate`, `dateTimeUpdate`, `relations`).
- `lib/api/floorPlan.ts` — added `createFloorPlan` (multipart), `updateFloorPlan`, `FloorPlanCreateInput`, `FloorPlanUpdateInput`. Type `FloorPlan` extended with `buildingName`, `floorLabel`, `scaleMetersPerPx`, `lat`, `lng`. `FloorPlanDetail` now carries `placements` alongside the legacy `markers` alias.

### Notes
- All three new pages typecheck clean (`bun run check`: 2771 files / 0 errors / 0 warnings).
- Patterns are deliberately uniform with the existing `systemUsers/users` page so future starter upgrades (police, admin/licenses, edge-ai summary) can copy-paste the layout (KPI cards → toolbar → table → pagination → Modal + ConfirmDialog).
- The `[id]/edit`, `add`, `delete/[id]` stub routes for cameras / edge / floor plans intentionally **remain 307 redirects to the list page** — inline modal on the index replaces the per-id detail/edit page pattern from klynx (which lives on Nuxt's pages directory rather than route components).

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
