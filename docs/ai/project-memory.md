# Klynx Project Memory

Use this as short-lived agent memory for Klynx planning, review, and cross-repo work. Canonical decisions still belong in `docs/plan/`, `docs/contracts/`, `openapi/`, `AGENTS.md`, and `CLAUDE.md`.

## Architecture Defaults

- Feature owner backend defaults to `klynx-api`.
- Events canonical system of record is `gateway-api`.
- Normalized event topic is `gw.events.normalized.v1`.
- Event producer is `gateway-api`; event consumer is `klynx-api`.
- Klynx event projection store is `klynx-api/event_refs`.
- Device/camera identity and sync state source of truth is `gateway-api/device_management`.
- `klynx/camera` is a projection and consumer model for Klynx workflows.

## Contract Rules

- `docs/contracts/` contains cross-repo/service integration contracts, not only REST docs.
- OpenAPI/Swagger is the REST subset and may be linked from a broader domain/flow contract.
- Contracts may cover REST, Kafka, MQTT, Redis, cache, sync, field ownership, rollout, compatibility, and validation.
- Prefer grouping contracts by domain or flow when surfaces share one lifecycle.
- Do not split a flow into many contract files if consumers must read all of them to understand behavior.
- Authoring guidance: `docs/contracts/README.md` (grouping rule, FE consumption rule, when to offload to `openapi/<name>.yaml`).
- Contract consolidation work is archived in `docs/plan/done/contract-grouping-audit.md`; remaining follow-ups should be opened as focused plan files instead of reopening the audit.

## Hub-and-Spoke Contract Authority

- **Hub (canonical for cross-repo / cross-service flows):** `klynx-api/docs/contracts/<name>.md`. Grouping rule lives in `klynx-api/docs/contracts/README.md`.
- **`gateway-api` SoR:** events canonical detail and `device_management` identity / sync state. Hub contracts that touch these domains reference `gateway-api` as the canonical writer.
- **`gateway-api/docs/contracts/` (reserved):** the directory exists with a README explaining when a contract belongs there (gateway-api-owned cross-repo flows that have no klynx-api hub equivalent). Authors must reuse `klynx-api/docs/contracts/TEMPLATE.md` as the skeleton and follow the same domain-or-flow grouping rule.
- **`gateway-api/docs/swagger.yaml`:** REST schema subset only — generated from `swag` annotations; not the full contract.
- Spoke repos: `gateway-api`, `klynx-feature`, `gateway-portal`. Each has its own AGENTS.md / CLAUDE.md aligned to this model (PRs: gateway-api#17, gateway-portal#15, klynx-feature local).

## Frontend Rules

- FE consumes contracts from `klynx-api/docs/contracts/<name>.md` (canonical hub) and, when linked from the `.md`, `klynx-api/openapi/<name>.yaml` (REST subset).
- FE consuming `gateway-api` directly (e.g. `gateway-portal`) reads `gateway-api/docs/swagger.yaml` and any `gateway-api/docs/contracts/<name>.md` that exists.
- FE plan / PR description must cite the exact contract file AND section (e.g. `§7.1`), not just "see contract" or "see swagger".
- FE must not invent any schema across REST / Kafka / MQTT / Redis-visible / cache / sync / auth / permission. Network traces, screenshots, and BE source code are not contracts.
- If FE needs behavior not documented in the backend contract, update the shared contract first.

## Workflow Helpers

- Use Klynx skills for repeatable plan/contract/review/rollout flows.
- Use graphify only as discovery support; verify inferred or ambiguous graph edges against source before changing contracts.
- Use graphify for contract audits, cross-repo impact discovery, event/sync/permission/camera relationship tracing, and "which contracts are related" questions; skip it for routine small bugs or clear FE follow-ups.
- Common workflow commands are collected in `docs/ai/commands.md` so operators and agents do not have to rediscover Aliza, Graphify, git flow, validation, and PR commands.
- Aliza bot requests should stay very fast: use the plan/contract rules to avoid drift, but do not turn small bug/feature work into ceremony. If a fix can ship in 1-5 minutes, do that; deliver the cohesive slice, validate, and file only real follow-ups.

## PHIBEK SvelteKit Page Parity Tracker

Working branch: `/home/phibek/app` `chore/klynx-bug-fixes-3.54.2-3.55.0`.

Tracking rule:
- Work one route/page at a time from `docs/plan/klynx-function-parity-sveltekit.md`.
- For each route, record status, source Nuxt page, contract reference, shipped files, validation, and blockers.
- Do not invent backend schema. When a page needs undocumented API behavior, stop and request a backend contract update.

Current batch:
- `/ingest/events` — `done` on 2026-05-18. Source: `/home/klynx/klynx/app/pages/ingest/events.vue`. Contract: `docs/contracts/third-party-integration.md` §5.1/§5.2 as the documented event list/detail envelope mirror for user-facing `/api/v3/events`; PHIBEK uses existing `/kapi/events` helpers already present in `src/lib/api/klynxIngest.ts`. Implementation note: the full event feed had already been ported at `/ingest`; added `src/routes/(app)/ingest/events/+page.svelte` wrapper so the sidebar/contract route resolves without duplicating logic. Blockers: none. Validation: `bun run check` passed 2026-05-18; HTTP smoke returned auth redirect with `returnTo=/phibek/ingest/events`.
- `/systemUsers/permissions/menu`, `/systemUsers/permissions/api`, `/systemUsers/permissions/resource` — `covered` on 2026-05-18. Source: `/home/klynx/klynx/app/pages/systemUsers/permissions/{menu,api,resource}.vue`. Contract: `docs/contracts/permission-profile.md` §5.1, §5.7, §11 FE guardrails; no new schema. Implementation note: existing tracked `+page.ts` routes redirect to the combined PHIBEK permissions workbench with `?tab=menu|api|resource`; no code change needed. Blockers: none. Validation: HTTP smoke returned auth redirects with correct `returnTo` paths.
- Header search overlay — `done` on 2026-05-18. Source: Cyber Admin `cyber_admin_v2.0/template_html/src/html/partials/app-header.html` and `src/scss/app/_app-header.scss`. Contract: N/A, UI-only shell behavior; no REST/Kafka/MQTT/Redis/auth/permission schema added. Implementation note: `src/lib/components/app/AppHeader.svelte` now exposes an icon search button, removes the `d-none` overlay blocker, focuses the search input on open, closes with the icon/ESC, and prevents accidental form POST. `src/scss/_phibek-overrides.scss` now restores the overlay display/visibility/pointer-event states so the Cyber Admin `app-header-menu-search-toggled` class can reveal only the header overlay without blocking page content. Blockers: none. Validation: `bun run check`, `bun run lint`, and `bun run build` passed 2026-05-18.
- Dynamic edge-device sidebar links — `partial done` on 2026-05-18. Source: `/home/klynx/klynx/app/layouts/default.vue` dynamic `edgeDeviceMenuItems`. Contract: `/home/klynx/klynx-api/docs/contracts/permission-profile.md` §5.6 (`GET /api/v3/system/edge`) response/filter behavior and §5.7 menu visibility. Implementation note: `AppSidebar.svelte` now fetches `/system/edge` only when an active org exists and `systemDevicesEdge` is visible, then appends contract-provided `url` values as external `http(s)` sidebar children under System Devices. `src/lib/api/devices.ts` adds the documented system edge list helper, and `src/lib/types/navigation/sidebar.ts` allows local dynamic child labels/external links. Blocker: Nuxt auto-login via `/kapi/system/edge/{type}/sso/{id}` is not ported because that endpoint is only in Swagger/OpenAPI; no canonical `.md` contract section documents fallback/error/rollout behavior yet. Validation: `bun run check`, `bun run lint`, and `bun run build` passed 2026-05-18.
- `/iotControl/temperature` plus legacy `/kcontrol/temperature` redirect — `REST parity done` on 2026-05-18. Source: `/home/klynx/klynx/app/pages/kcontrol/temperature.vue`. Contracts: `/home/klynx/klynx-api/docs/contracts/kcontrol-temp-menu.md` §1.1 (`GET /orgs/kcontrol-config`), §1.2 (`PATCH /orgs/kcontrol-config`), §1.4 (`GET /resources/kcontrol/{id}/temperature/history`), §1.5 (`GET /resources/kcontrol/temperature/summary`), §3 auth rules; `/home/klynx/klynx-api/docs/contracts/page-permission-guards.md` FE route matrix for `kcontrolTemperature`. Implementation note: `src/lib/api/iotControl.ts` now exposes typed REST helpers; `src/routes/(app)/iotControl/temperature/+page.svelte` renders summary cards/table, history modal, and org threshold/sample config with contract validation ranges; sidebar/access/i18n route wiring is in place. Blockers: Nuxt realtime WSS refresh from `realtime-wss.md` §6.7 is not ported in this slice; authenticated API smoke remains pending. Validation: `bun run check`, `bun run lint`, and `bun run build` passed 2026-05-18; fresh dev server HTTP smoke on port 3002 returned auth redirects for `/phibek/iotControl/temperature` and `/phibek/kcontrol/temperature`.
- Realtime WSS phase 1 — `done` on 2026-05-18 for camera, IntDash, and Ingest. Source: `/home/klynx/klynx/app/plugins/wsHub.client.ts`, `/home/klynx/klynx/app/composables/useWsTopic.ts`, `/home/klynx/klynx/app/pages/systemDevices/cameras/index.vue`, `/home/klynx/klynx/app/components/intDash/AiEventMap.vue`. Contract: `/home/klynx/klynx-api/docs/contracts/realtime-wss.md` §5.1 negotiate, §5.2 upgrade, §6.1 frame protocol, §6.2 reconnect/lifecycle, §6.3 `camera.status`, §6.8 `ingest.event`, §6.9 `ingest.blacklist`, §6.11 topic index. Implementation note: `src/lib/stores/wsHub.ts` adds a browser-only singleton WSS hub behind `PUBLIC_REALTIME_HUB_ENABLED`; `src/lib/realtime/wsTopics.ts` and `src/lib/types/realtime.ts` hold contract topic/payload types; `/systemDevices/cameras` subscribes to `camera.status`, patches matching online/update time rows, and schedules REST refresh; `/intDash` subscribes to `ingest.event` and `ingest.blacklist`, de-dupes by `eventId`, prepends recent rows, and re-syncs REST KPIs; `/ingest` subscribes to `ingest.event` only because `ingest.blacklist` is a documented duplicate subset. Blockers: authenticated negotiate/live-frame smoke is pending; it needs a logged-in browser session plus backend WSS events. Validation: `bun run check`, `bun run lint`, and `bun run build` passed 2026-05-18; HTTP smoke on port 3002 returned auth redirects with correct `returnTo` for `/phibek/systemDevices/cameras`, `/phibek/intDash`, and `/phibek/ingest/events`.
- Realtime WSS phase 2 — `done` on 2026-05-19 for Dashboard, BI Dashboard, Video Wall, and kControl surfaces. Source: `/home/klynx/klynx/app/pages/dashboard.vue`, `/home/klynx/klynx/app/pages/biDash.vue`, `/home/klynx/klynx/app/pages/videowall.vue`, `/home/klynx/klynx/app/pages/kcontrol/events.vue`, `/home/klynx/klynx/app/pages/kcontrol/map.vue`, `/home/klynx/klynx/app/pages/kcontrol/mapif.vue`. Contract: `/home/klynx/klynx-api/docs/contracts/realtime-wss.md` §6.3 `camera.status`, §6.4 `kcontrol.status`, §6.5 `kcontrol.alarm`, §6.6 `kcontrol.event`, §6.7 `kcontrol.temperature`, §6.8 `ingest.event`, §6.9 `ingest.blacklist`, §6.10 subscribe permission semantics. Implementation note: `src/lib/types/realtime.ts` now includes typed kControl payloads and `src/lib/realtime/liveStatus.ts` centralizes badge labels; `/dashboard` subscribes to `ingest.event` and debounces REST dashboard reload; `/biDash` subscribes to `ingest.event`, `ingest.blacklist`, `camera.status`, and `kcontrol.status` with a live monitor because the full Nuxt BI dashboard is still a placeholder/Metabase surface in PHIBEK; `/videowall` subscribes to `camera.status` and patches camera online badges; `/iotControl` subscribes to `kcontrol.status` and patches resource status plus REST re-sync; `/iotControl/events` subscribes to `kcontrol.event`; `/iotControl/map` subscribes to `kcontrol.event`, `kcontrol.alarm`, and `kcontrol.status` and renders a contract-backed live feed while the full Leaflet map remains a later page-port; `/iotControl/temperature` subscribes to `kcontrol.temperature`, patches current reading/history for visible rows, and schedules REST re-sync. Blockers: authenticated WSS negotiate/live-frame browser smoke still needs a logged-in session and actual backend event traffic. Validation: `bun run check`, `bun run lint`, and `bun run build` passed 2026-05-19; HTTP smoke on port 3002 returned auth redirects with correct `returnTo` for `/phibek/dashboard`, `/phibek/biDash`, `/phibek/videowall`, `/phibek/iotControl`, `/phibek/iotControl/events`, `/phibek/iotControl/map`, `/phibek/iotControl/temperature`, `/phibek/systemDevices/cameras`, `/phibek/intDash`, and `/phibek/ingest/events`.

Route coverage / blockers:
- `/edge-ai/summary-report`, `/edge-ai/summary/people-counting`, `/edge-ai/summary/people-blacklist`, `/edge-ai/summary/events-notification` — `route coverage done` on 2026-05-18. Source: `/home/klynx/klynx/app/pages/edge-ai/{summary-report,summary/*}.vue`. Contract note: documented contracts cover dashboard summary/timeseries, but no canonical contract was found for Nuxt's `/kapi/atapi/{peopleCounting,blacklist,notification}/summary` list/detail shapes. Safe implementation added only route wrappers to the existing Edge AI summary and sidebar entries. Full table/detail parity is blocked until the backend contract documents those `atapi` request/response/error shapes. Validation: `bun run check` passed 2026-05-18; HTTP smoke returned auth redirects with correct `returnTo` paths.
- `/systemDevices/cameras/add`, `/systemDevices/cameras/edit/[id]`, `/systemDevices/cameras/delete/[id]` — `covered` on 2026-05-18. Source: `/home/klynx/klynx/app/pages/systemDevices/cameras/{add,edit,delete}/*`. Contract: `docs/contracts/device-camera-domain.md` §0 explicitly excludes Camera CRUD (`POST/PATCH/GET /kapi/resources/camera`) from this contract; §11 says FE must not invent camera fields/actions. Existing tracked `+page.ts` routes redirect back to `/systemDevices/cameras`; no code change needed. Full add/edit/delete parity is blocked pending a canonical Camera CRUD contract. Validation: `bun run check` passed 2026-05-18; HTTP smoke returned auth redirects with correct `returnTo` paths.
- `/systemDevices/edge/add`, `/systemDevices/edge/edit/[id]` — `covered` on 2026-05-18. Existing tracked `+page.ts` routes redirect back to `/systemDevices/edge`. Full add/edit parity is blocked pending an Edge device CRUD contract; current documented contract coverage is edge picker/resource grants in `permission-profile.md`, not CRUD.
- `/systemUsers/users/[id]` — `covered` on 2026-05-18. Existing tracked `+page.ts` route redirects back to the combined users workbench; source Nuxt page is `/home/klynx/klynx/app/pages/systemUsers/users/[id].vue`. The SvelteKit list page already implements create/edit with modal flows from `user-profile-and-roles.md`.
- `/police/add`, `/police/edit/[id]`, `/police/delete/[id]` — `covered` on 2026-05-18. Existing tracked `+page.ts` routes redirect back to `/police`. Full native child-page parity not started.
- `/floorPlans/new`, `/floorPlans/[id]/edit` — `covered` on 2026-05-18. Existing tracked `+page.ts` routes redirect back to `/floorPlans`; `/floorPlans/[id]` has a Svelte page.
- `/admin/licenses/create`, `/admin/licenses/[licenseId]`, `/admin/licenses/[licenseId]/edit` — `covered` on 2026-05-18. Existing tracked `+page.ts` routes redirect back to `/admin/licenses`. Full native child-page parity not started.

Next candidates:
- Validate and, if needed, port kControl realtime WSS topic `kcontrol.temperature` after reading `realtime-wss.md` §6.7 end-to-end and confirming the current Svelte websocket helper contract fit.
- Backend contract update for Edge SSO URL behavior before porting Nuxt auto-login clicks.
- Full native child-page parity for redirect-backed routes once the relevant backend contracts are explicit.
