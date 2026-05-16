# Changelog

All notable changes to the **PHIBEK · winn** SvelteKit FE.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
this project follows semantic versioning.

## [Unreleased]

## [0.10.0] — 2026-05-16

### Added
- **`/intDash` AI Event Intelligence page** — new SvelteKit port of klynx FE intDash, consuming klynx-api 4.55.0's `/events` + `/events/aggregate` contracts without FE-side schema invention. Route at `src/routes/(app)/intDash/+page.svelte` with sidebar entry under main navigation (between Dashboard and AI Search). Renders 5 KPI tiles (totalEvents / highSeverity / aiCamerasReporting / aiAccuracy / eventsToday), live event feed (top-20 most-recent, severity-coded badges), MapLibre cluster map of geolocated events from the latest feed, and a 4-widget analytics row (60-minute severity timeline, top-5 devices, camera health donut, event-category donut) backed by chart.js. Refresh every 60s; `/events/aggregate` is the primary source with a graceful fallback to client-side bucketing from the feed if the aggregate endpoint errors. New api wrapper at `src/lib/api/intDash.ts` types `IntDashEvent`, `IntDashAggregateDetails`, `IntDashDatasets`, and `IntDashTimeline` strictly per BE contract; new components `IntDashCharts.svelte` (chart.js 4-widget grid) and `IntDashMap.svelte` (MapLibre cluster source + popup) live under `src/lib/components/intDash/`.
- i18n key `navIntDash` ("AI Intelligence (Beta)" en/th) in `i18n/{en,th}/nav.json`; sidebar entry registered in `src/lib/stores/appSidebarMenus.ts` with `menuId: 'intDash'` for future permission-tree gating.

### Notes
- Mirrors klynx FE 3.51.0 minus the deck.gl heat overlay and supercluster (MapLibre native `cluster: true` is used instead — simpler, no new dependency surface). vue-echarts widgets in klynx are rendered here with chart.js, the existing phibek chart plugin, so no new dep added.
- Status pill in the header reflects which dataset path was used: `aggregate` (green, BE-owned bucketing) vs `fallback` (orange, client-side bucketing from the event feed). `scope=org-only` pill surfaces when the BE applied workspace→org fallback.
- BE pair: klynx-api 4.51.0 (events query) + 4.52.0 (extra fields) + 4.55.0 (`/events/aggregate`). Contract: klynx-api `docs/contracts/intdash-analytics-aggregate.md`.

## [0.9.2] — 2026-05-16

### Security
- **Permission catalog page guard** — defense-in-depth port of klynx FE 3.50.0 on top of klynx-api 4.53.0's `Get`/`List` permission gate. Pre-fix the BE returned 403 on `/orgs/(menu|resource)/permissions/` when the caller lacked `organization.manage`, but the page surfaced it as a generic red alert string under the management UI (`guardAuth` is not on the `apiSafe` path used by `listMenuPermissions` / `listResourcePermissions`, so no re-auth redirect either). Now: when **both** endpoints respond with 403, `src/routes/(app)/systemUsers/permissions/+page.svelte` short-circuits to a "ไม่มีสิทธิ์เข้าหน้านี้" panel with a back-to-home link (i18n keys `permissionsNoAccess{Title,Description,BackHome}` in `i18n/{en,th}/permission.json`).
- **Sidebar gate** — `src/lib/stores/appSidebarMenus.ts` entry `systemUsersPermissions` declares a new `requireCapability: 'organization.manage'` field (added to `SidebarChild` + `SidebarMenuLink` types in `src/lib/types/navigation/sidebar.ts`). `AppSidebar.svelte` `canSeeMenu()` AND's this against the existing `visibleMenuIds[]` check via a new `meetsCapability()` helper — the entry hides when the active org's `effectiveAccess.access.orgCapabilities.canManageOrganization` is false. Mirrors klynx FE 3.50.0 `layout/default.vue` sidebar gate.

### Notes
- Three klynx FE features were considered but found N/A on phibek today: (1) **resource-group picker unify** — no picker exists on phibek's dashboard / biDash / live / videowall; (2) **RG custom icons on `/map`** — phibek `/map/+page.svelte` is a 37-line placeholder; building blocks live in `lib/components/leaflet/*` but the full Leaflet wire-up is deferred; (3) **`/intDash` AI Event Intelligence page** — does not exist on phibek; a from-scratch SvelteKit build (multi-hour, deferred to a separate session). Only the permission guard had an existing surface to attach to.
- Contract source of truth: `/home/klynx/klynx-api/docs/contracts/permission-profile.md §5.2 + §5.2.1` (klynx-api 4.53.0 tightening).

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
