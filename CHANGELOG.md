# Changelog

All notable changes to the **PHIBEK · winn** SvelteKit FE.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
this project follows semantic versioning.

## [Unreleased]

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
