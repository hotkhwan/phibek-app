# Klynx Function Parity For SvelteKit

## Scope

Bring the PHIBEK SvelteKit shell to functional parity with `/home/klynx/klynx` while keeping the Cyber Admin visual shell from `cyber_admin_v2.0`.

Primary domains:
- user
- permission and menu visibility
- device cameras
- edge devices
- resource groups
- organization
- org unit
- ingest
- dashboard / live / map / video wall / BI dashboard / watchman / AI search / IoT control

## Current State

The SvelteKit app already has first-pass routes and API clients for most domains, but it is not 100% parity with the Nuxt source.

Known gaps from the first inventory:
- Header search overlay CSS hook/overlap — resolved 2026-05-18 by aligning the Svelte header with
  Cyber Admin's `app-header-menu-search-toggled` overlay behavior.
- Menu visibility/effective access — resolved 2026-05-18 for the static sidebar and protected app
  layout by consuming `GET /kapi/orgs/effectiveAccess` and default-hiding grant-controlled entries.
- Several Nuxt routes are missing or collapsed in SvelteKit:
  - `/ingest/events` — resolved 2026-05-18 via route wrapper to the ported event feed.
  - `/systemUsers/permissions/menu` — covered by existing tab redirect route.
  - `/systemUsers/permissions/api` — covered by existing tab redirect route.
  - `/systemUsers/permissions/resource` — covered by existing tab redirect route.
  - `/edge-ai/summary-report` — route coverage resolved 2026-05-18; full table/detail parity blocked pending canonical contract for Nuxt `atapi` summary APIs.
  - `/edge-ai/summary/people-counting` — route coverage resolved 2026-05-18; full table/detail parity blocked pending canonical contract for Nuxt `atapi` summary APIs.
  - `/edge-ai/summary/people-blacklist` — route coverage resolved 2026-05-18; full table/detail parity blocked pending canonical contract for Nuxt `atapi` summary APIs.
  - `/edge-ai/summary/events-notification` — route coverage resolved 2026-05-18; full table/detail parity blocked pending canonical contract for Nuxt `atapi` summary APIs.
  - `/kcontrol/temperature` — REST route parity resolved 2026-05-18 via `/iotControl/temperature`
    plus a legacy redirect; Nuxt realtime WSS refresh remains a follow-up tied to
    `realtime-wss.md` §6.7.
  - create/edit/delete child routes for cameras, edge, users, police, floor plans, and licenses
    - camera child routes are covered by existing redirects; full CRUD port blocked because `device-camera-domain.md` §0 excludes Camera CRUD pending a canonical contract.
    - edge, users detail, police, floor-plan edit/new, and admin-license child routes are covered by existing redirects to their list/workbench pages.
- Dynamic edge-device menu items from `/kapi/system/edge` — partial parity resolved 2026-05-18 by
  rendering documented `url` values as external links; Nuxt Edge SSO auto-login remains blocked
  pending a canonical `.md` contract for `/kapi/system/edge/{type}/sso/{id}`.
- Some Svelte API clients still use mixed base/header conventions and must be normalized against the Nuxt `useApi` behavior.

## Ownership Model

Frontend owner: this SvelteKit repo.

Backend owner: `klynx-api` remains the default owner for `/kapi` contracts and effective access behavior.

System of record:
- menu visibility and capabilities: `klynx-api` effective access response
- user/org/permission/resource/device data: existing `klynx-api` endpoints
- device/camera identity and sync state: `gateway-api/device_management`, projected into Klynx

## Contract Summary

No new backend contract is introduced in this pass. The SvelteKit app consumes existing `klynx-api` endpoints already used by `/home/klynx/klynx`.

Critical existing contract:
- `docs/contracts/permission-profile.md` §5.7 — resource-derived menu visibility and FE default-hide policy.
- `docs/contracts/permission-profile.md` §5.6 — `/system/edge` filtered list behavior and response envelope.
- `docs/contracts/permission-profile.md` §2 — effectiveAccess producer/consumer ownership.
- `docs/contracts/org-lifecycle.md` §11 — `effectiveAccess.canCreateOrganization` frontend guardrails.
- `docs/contracts/page-permission-guards.md` FE route matrix — `/kcontrol/temperature/**`
  requires `kcontrolTemperature`.
- `docs/contracts/kcontrol-temp-menu.md` §1.1, §1.2, §1.4, §1.5, §3 — kControl
  temperature config, summary, history, and auth rules consumed by `/iotControl/temperature`.
- `docs/contracts/realtime-wss.md` §5.1, §5.2, §6.1, §6.2, §6.3 through §6.11 —
  realtime WSS negotiate/upgrade/frame lifecycle plus `camera.status`, kControl
  `status`/`alarm`/`event`/`temperature`, `ingest.event`, and `ingest.blacklist`
  payload/permission contracts consumed by `/dashboard`, `/biDash`, `/videowall`,
  `/systemDevices/cameras`, `/intDash`, `/ingest`, and `/iotControl/**`.
- `GET /kapi/orgs/effectiveAccess`
  - response `details.visibleMenuIds`
  - response `details.platformCapabilities`
  - response `details.orgCapabilities`

No new REST request/response/error schema, Kafka topic, MQTT topic, Redis-visible behavior, permission
rule, auth flow, or device/camera sync behavior is introduced by this frontend pass.

## Frontend Follow-Up Notes

Touched screens/files in this batch:
- App shell/sidebar: `src/routes/(app)/+layout.svelte`, `src/lib/components/app/AppSidebar.svelte`,
  `src/lib/components/app/AppHeader.svelte`, `src/lib/stores/appSidebarMenus.ts`,
  `src/lib/utils/pageAccess.ts`, `src/scss/_phibek-overrides.scss`.
- Runtime auth/access stores: `src/lib/stores/auth.ts`, `src/lib/stores/effectiveAccess.ts`.
- Edge device API/navigation support: `src/lib/api/devices.ts`, `src/lib/types/navigation/sidebar.ts`.
- Device/user admin surfaces: `src/routes/(app)/systemDevices/{cameras,edge}/+page.svelte`,
  `src/routes/(app)/systemUsers/{unit,permissions}/+page.svelte`.
- AI Event Intelligence surface: `src/routes/(app)/intDash/+page.svelte`, `i18n/*/nav.json`.
- Edge AI route coverage: `src/routes/(app)/edge-ai/summary-report/+page.svelte`,
  `src/routes/(app)/edge-ai/summary/{people-counting,people-blacklist,events-notification}/+page.svelte`.
- kControl temperature REST parity: `src/lib/api/iotControl.ts`,
  `src/routes/(app)/iotControl/temperature/+page.svelte`,
  `src/routes/(app)/kcontrol/temperature/+page.ts`, `i18n/*/nav.json`.
- Realtime WSS phase 1: `src/lib/stores/wsHub.ts`, `src/lib/realtime/wsTopics.ts`,
  `src/lib/types/realtime.ts`, `src/routes/(app)/systemDevices/cameras/+page.svelte`,
  `src/routes/(app)/intDash/+page.svelte`, `src/routes/(app)/ingest/+page.svelte`,
  `.env.example`, `.env.prod`, `Dockerfile`, `Jenkinsfile`, `src/app.d.ts`.
- Realtime WSS phase 2: `src/lib/realtime/liveStatus.ts`,
  `src/routes/(app)/dashboard/+page.svelte`, `src/routes/(app)/biDash/+page.svelte`,
  `src/routes/(app)/videowall/+page.svelte`, `src/routes/(app)/iotControl/+page.svelte`,
  `src/routes/(app)/iotControl/events/+page.svelte`,
  `src/routes/(app)/iotControl/map/+page.svelte`,
  `src/routes/(app)/iotControl/temperature/+page.svelte`.

FE behavior:
- Hide grant-controlled sidebar entries until `effectiveAccess` is loaded for the active organization.
- Evaluate direct-route access from backend-owned `visibleMenuIds`/capabilities, then redirect to
  `/dashboard` when allowed or `/profile` when Dashboard is not allowed.
- Keep profile, settings/profile, subscription, landing, docs, and live as authenticated-only surfaces.
- Require an active organization before loading org-scoped cameras, edge devices, and org units.
- Load dynamic Edge device sidebar links only when `systemDevicesEdge` is visible and an active
  organization exists; open only documented `http(s)` `url` values in a new tab.
- Load kControl temperature config/summary only when an active organization exists; allow config
  save only for users with `orgCapabilities.canManageOrganization`; read rows/history through the
  documented summary/history REST endpoints and gate the sidebar/direct route with
  `kcontrolTemperature`.
- When `PUBLIC_REALTIME_HUB_ENABLED=true`, negotiate WSS with the existing API helper so bearer auth
  and `X-Active-Org` follow the app-wide auth flow; re-negotiate on reconnect or active-org changes,
  answer server `ping` with `pong`, and subscribe only to contract-named topics.
- Camera realtime de-dupes by `cameraId` + `occurredAt`, patches the visible row, then schedules a
  REST refresh so the page stays canonical to backend state.
- IntDash realtime de-dupes `ingest.event` / `ingest.blacklist` by `eventId`, prepends recent rows,
  and schedules REST reload for KPI/map consistency.
- Ingest realtime listens to `ingest.event` only; `ingest.blacklist` is documented as a duplicate
  subset, so the blacklist-specific stream remains an IntDash concern unless another contract-backed
  feed behavior is needed.
- Dashboard realtime listens to `ingest.event` and debounces the canonical analytics REST reload.
- BI Dashboard realtime listens to `ingest.event`, `ingest.blacklist`, `camera.status`, and
  `kcontrol.status`; because PHIBEK's BI page is still a Metabase/placeholder surface, it exposes a
  contract-backed monitor instead of inventing Nuxt's full dashboard schema.
- Video Wall realtime listens to `camera.status` and patches visible camera badges by
  `(cameraId, occurredAt)`.
- kControl realtime listens to `kcontrol.status` on `/iotControl`, `kcontrol.event` on
  `/iotControl/events`, `kcontrol.event` + `kcontrol.alarm` + `kcontrol.status` on
  `/iotControl/map`, and `kcontrol.temperature` on `/iotControl/temperature`.

Fallback/error UX:
- Direct URLs remain backend-gated; frontend hiding is only UX, per `permission-profile.md` §5.7.
- Org-scoped list pages show a "Select an organization..." message when no active organization exists.
- Permission lookup partial failures show a warning toast while preserving any loaded picker data.
- Resource/detail response envelopes are normalized only across documented existing wrapper shapes; no
  new backend fields are invented.
- Header search is UI-only: it opens/closes locally, focuses the input, handles ESC, and prevents a
  form POST until a backend-documented search destination exists.
- Edge SSO auto-login is intentionally not ported from Nuxt yet because the SSO URL endpoint only has
  Swagger/OpenAPI coverage; the FE uses the documented §5.6 `url` field as the current external-link
  path and hides dynamic links on list load failure.
- kControl temperature shows inline REST errors, empty states, and read-only config controls when the
  caller lacks org manage capability. Realtime WSS updates from Nuxt are not ported in this slice;
  the page refresh button and time-window controls reload from the documented REST contract.
- Realtime WSS is feature-flagged off unless `PUBLIC_REALTIME_HUB_ENABLED` is exactly `true`; denied
  topic subscriptions surface a page warning and failed/closed sockets fall back to the existing REST
  refresh paths.
- kControl realtime patches only fields present in `realtime-wss.md`; aggregate KPIs, map geometry,
  and historical summaries remain REST-canonical after a short debounce.

## Rollout Order

1. Fix layout regressions that block visual use.
2. Add effective access store and apply static menu hiding.
3. Restore route coverage with redirects/stubs for missing Nuxt paths.
4. Port each domain page from Nuxt to SvelteKit in batches:
   - users / org / orgUnit / permissions
   - cameras / edge / resource groups
   - ingest
   - floor plans / live / map / dashboard surfaces
5. Normalize API clients and headers.
6. Run typecheck/build and browser smoke tests.

## Rollback

UI-only changes can be reverted by restoring `AppHeader.svelte`, `appSidebarMenus.ts`, and related route files.

## Decision Points

- Whether missing create/edit/delete paths should be full native Svelte pages or routed back to list pages until each domain is ported.
- Edge SSO auto-login needs a backend `.md` contract before SvelteKit can consume
  `/kapi/system/edge/{type}/sso/{id}`; current sidebar parity opens documented Edge `url` values in a
  new tab only.
- Full native kControl Leaflet map and full Nuxt BI dashboard parity remain page-port follow-ups;
  current WSS coverage is contract-backed live monitoring and REST re-sync, not an invented map/BI
  data schema.

## Validation Checklist

- `bun run check` — passed 2026-05-18
- `bun run lint` — passed 2026-05-18
- `bun run build` — passed 2026-05-18
- Header search overlay static validation: `check`/`lint`/`build` cover the Svelte event path and
  SCSS compilation; browser smoke remains pending for an authenticated app session.
- Dynamic Edge device links: `check`/`lint`/`build` passed after adding `/system/edge` helper and
  sidebar external-link rendering; authenticated browser/API smoke remains pending.
- kControl temperature REST page: `check`/`lint`/`build` passed 2026-05-18; fresh dev server
  HTTP smoke returned auth redirects for `/phibek/iotControl/temperature` and
  `/phibek/kcontrol/temperature`; authenticated API/browser smoke remains pending.
- Realtime WSS phase 1: `check`/`lint`/`build` passed 2026-05-18 for the shared hub and
  camera/IntDash/Ingest subscriptions; HTTP smoke on port 3002 returned auth redirects with correct
  `returnTo` for `/phibek/systemDevices/cameras`, `/phibek/intDash`, and `/phibek/ingest/events`;
  authenticated negotiate/live-frame browser smoke remains pending because it requires a logged-in
  session and backend event traffic.
- Realtime WSS phase 2: `check`/`lint`/`build` passed 2026-05-19 for dashboard/BI/videowall/kControl
  subscriptions; HTTP smoke on port 3002 returned auth redirects with correct `returnTo` for
  `/phibek/dashboard`, `/phibek/biDash`, `/phibek/videowall`, `/phibek/iotControl`,
  `/phibek/iotControl/events`, `/phibek/iotControl/map`, `/phibek/iotControl/temperature`,
  `/phibek/systemDevices/cameras`, `/phibek/intDash`, and `/phibek/ingest/events`; authenticated
  negotiate/live-frame browser smoke remains pending because it requires a logged-in session and
  backend event traffic.
- smoke `/phibek/landing`
- smoke `/phibek/dashboard`
- smoke representative protected routes after login:
  - `/systemUsers/users`
  - `/systemUsers/permissions/menu`
  - `/systemDevices/cameras`
  - `/systemDevices/groups`
  - `/systemDevices/edge`
  - `/ingest/events`
