# PHIBEK FE ↔ Klynx FE Parity Audit

**Date:** 2026-05-16
**Author:** Claude (overnight autonomous slice)
**Phibek FE current versions in flight:** `0.9.2` (PR #38), `0.10.0` (PR #39), `0.11.0` (PR #40), `0.12.0` (PR #41)
**Klynx FE reference:** `3.54.2` on main

This document maps every klynx FE page / domain to the phibek FE state, calls out what's already at parity, what was shipped overnight, and what remains as deferred follow-up work.

---

## TL;DR

| Domain (user-named) | Parity status | Open work |
|---|---|---|
| **user** | ✅ ~80% | avatar lightbox edge cases; role + org bulk assignment workflow |
| **permission** | ✅ ~90% | per-scope access probe widget on detail tabs; klynx-API 4.53.0 403 path is already guarded (PR #38) |
| **org** | 🟡 ~60% | ingest provisioning UI exists; klynx has 2× more lines (org-unit picker, bulk member migration, csv export) |
| **orgUnit** | 🟡 ~40% | base CRUD works; klynx has tree drag-drop, member move, csv export, 1286-line page |
| **device** | ✅ shipped tonight (PR #40) | Google Maps marker picker, ROI drawing, WebRTC preview, Excel import — deferred follow-ups |
| **ingest** | ✅ ~85% | 691-line page already implemented; missing minor klynx tweaks (bulk approve flow) |
| **floorplan** | ✅ shipped tonight (PR #40) | placement editor on `/floorPlans/[id]` canvas — deferred (`suggest-placements`, drag-drop markers, bulk placement) |

Plus a bonus slice that wasn't explicitly named but is closely adjacent:

| Domain | Parity status | Open work |
|---|---|---|
| **admin/licenses** | ✅ lifecycle shipped tonight (PR #41) | per-id detail page (entitlement / audit log / artifact issue+reissue) — deferred |

---

## Overnight PRs

### PR #39 — `feat(intDash)` 0.10.0 (already open)
- New `/intDash` AI Event Intelligence page (KPIs, MapLibre cluster map, event feed, 4-widget chart.js analytics)
- Consumes `/kapi/events` + `/kapi/events/aggregate` (klynx-api 4.55.0)

### PR #40 — `feat(devices,floorPlans)` 0.11.0 (this session)
- `systemDevices/cameras` 60 → ~620 lines: monitor-state KPI filter, search, pagination, create/edit/delete modal, sync-monitor
- `systemDevices/edge` 47 → ~470 lines: endpoint corrected to `/system/edge`, type KPI filter, create/edit (ATA-conditional fields), delete
- `floorPlans` 97 → ~410 lines: grid + per-card edit/delete + multipart create modal
- API surface filled in `devices.ts` + `floorPlan.ts`

### PR #41 — `feat(admin)` 0.12.0 (this session)
- `/admin/licenses` upgraded with 4 KPI tiles, per-row Activate / Suspend / Renew / Terminate buttons, modal-confirmed lifecycle actions
- `adminLicense.ts` adds `updateLicense`, `renewLicense`, `activateLicense`, `suspendLicense`, `terminateLicense`

---

## Page-by-page status

Legend:
- ✅ shipped at parity (within scope agreed)
- 🟡 partial — base CRUD works, klynx has 2× more lines
- 🛑 stub (`+page.ts` redirect to parent only)
- ⛔ N/A on phibek (klynx-specific or different brand)

### `(app)` group

| Route | Klynx lines | Phibek state | Notes |
|---|---|---|---|
| `/dashboard` | 1900+ | ✅ shipped (livestream analytics 0.7.5 → 0.9.0) | scope toggle + viewer map + camera-group line chart |
| `/intDash` | 1100+ | ✅ shipped (0.10.0 PR #39) | All 4 layers (KPI, feed, MapLibre map, chart.js analytics) |
| `/biDash` | 1500+ | 🟡 placeholder card | klynx has 4-widget BI dash; phibek currently placeholder per `0.6.0` notes |
| `/aiSearch` (← `/ksearch`) | 600+ | 🟡 starter | the underlying `/kapi/ksearch` BE is klynx-only; phibek may stay starter |
| `/iotWatch` (← `/kwatch`) | 800+ | 🟡 starter | same as above |
| `/iotControl` (← `/kcontrol`) | 700+ | 🟡 starter | klynx-specific KControl IOT command surface |
| `/iotControl/{events,logs,map,mapif,sop}` | 200–600 each | 🛑 stubs | per-id `+page.ts` redirects to `/iotControl` |
| `/systemDevices/cameras` | 1663 | ✅ shipped tonight (PR #40) | KPIs/filter/search/pagination/CRUD inline modal. **Deferred:** Maps marker, ROI, WebRTC, Excel import, bulk select |
| `/systemDevices/cameras/{add,edit,delete}` | 1431/1466/225 | 🛑 stubs (intentional) | inline modal replaces per-id pages |
| `/systemDevices/edge` | 534 | ✅ shipped tonight (PR #40) | type KPI filter, ATA-conditional fields, create/edit/delete. **Endpoint corrected to `/system/edge`** |
| `/systemDevices/edge/{add,edit}` | 338/462 | 🛑 stubs (intentional) | inline modal replaces per-id pages |
| `/systemDevices/groups` | 1203 | 🟡 starter (~50 lines) | RG tree edit + parent-child move + permission propagation = deferred slice |
| `/systemUsers/users` | 1566 | ✅ ~80% (1307 lines, inline modal) | Add/edit/disable/delete + avatar + multi-org assignment. **Klynx delta:** bulk role change, csv import |
| `/systemUsers/users/[id]` | 1108 | 🛑 redirect → inline modal | klynx has per-id page; phibek uses inline modal (acceptable diff) |
| `/systemUsers/organizations` | 823 | 🟡 ~60% (289 lines) | Base CRUD + member add/remove + ingest provisioning. **Klynx delta:** org-unit picker integration, bulk member migration, csv export, default-role on add |
| `/systemUsers/unit` | 1286 | 🟡 ~40% (209 lines) | Base CRUD. **Klynx delta:** tree drag-drop, member move-to-unit, csv export |
| `/systemUsers/permissions` | (parent) | ✅ ~90% (1121 lines, file-manager tree) | 0.9.0 ship + 0.9.2 403 guard (PR #38). Page guards properly when org-manage cap is missing |
| `/systemUsers/permissions/{menu,resource,api}` | 600–800 each | 🛑 stubs (intentional) | parent file-manager tree covers all three; klynx has per-type detail panels |
| `/ingest` (root) | (parent) | ✅ ~85% (691 lines, 5 modals) | event feed + detail modal + filters. **Klynx delta:** bulk approve flow |
| `/ingest/dashboard` | 329 | ✅ shipped | ingest dashboard KPIs |
| `/ingest/events` | 939 | 🛑 redirect → `/ingest` (intentional) | parent page covers this; klynx has separate tab |
| `/floorPlans` | 281 | ✅ shipped tonight (PR #40) | grid + per-card actions + multipart create. **Deferred:** placement editor on `[id]` |
| `/floorPlans/[id]` | 1220 | ✅ exists | klynx has canvas + drag-drop markers + suggest-placements. **Deferred:** placement editor upgrade |
| `/floorPlans/{new,[id]/edit}` | 783/1220 | 🛑 stubs (intentional) | inline modal on index replaces these |
| `/edge-ai` | 600+ | ✅ exists | base page |
| `/edge-ai/summary-report` | 800+ | 🛑 stub | redirect; klynx has KPI + chart of summary reports |
| `/edge-ai/summary/{events-notification,people-blacklist,people-counting}` | 400–600 each | 🛑 stubs | redirect; klynx has per-summary sub-pages |
| `/police` | 1451 | 🟡 starter (69 lines) | **Deferred — out of stated scope.** 30+ field watchlist form is a multi-hour port. Klynx-specific. |
| `/police/{add,edit,delete}` | 1100/900/(small) | 🛑 stubs | as above |
| `/polices` (plural — different surface) | 700+ | ✅ shipped | live MQTT alarm feed |
| `/admin` | (parent) | ✅ exists | basic overview |
| `/admin/licenses` | 700+ | ✅ shipped tonight (PR #41) | KPIs + lifecycle (activate/suspend/terminate/renew). **Deferred:** entitlement + audit log + artifact issue/reissue on `[id]` |
| `/admin/licenses/{create,[id],[id]/edit}` | 1000/800/700 | 🛑 stubs | follow-up |
| `/admin/platform-license` | 600+ | ✅ exists | activate / validate / display |
| `/profile` | 700+ | ✅ exists | basic profile form |
| `/profile/{map,password}` | 200/100 each | 🛑 stubs | small follow-ups |
| `/settings` | 600+ | ✅ exists | locale + theme + branding panel |
| `/settings/{platform,map,stream,profile/*}` | 300–600 each | 🛑 stubs | follow-ups |
| `/live` | 1300+ | ✅ shipped (0.3.0) | players + WebRTC + RG picker |
| `/map` | 1000+ | 🟡 placeholder per `0.6.0` notes | leaflet building blocks exist; full Leaflet wire-up deferred |
| `/videowall` | 600+ | ✅ shipped (0.6.0) | 2x2/3x3/4x4 + click-to-start |
| `/mqtt` | 600+ | ✅ shipped (0.6.0) | full subscribe + publish console |
| `/watchman` | 50 | ✅ shipped (0.6.0) | iframe wrapper |
| `/subscription` + `/pricing` | 800+ | ✅ shipped (0.6.0) | full klynx-subscription integration |

### `(public)` group

| Route | Klynx | Phibek state |
|---|---|---|
| `/landing` | – | ✅ phibek CI applied (0.6.0) |
| `/changelog` + `[...slug]` | ✅ in klynx | ✅ shipped (0.6.0) |
| `/docs` + `[...slug]` | ✅ in klynx | ✅ shipped (0.6.0) |
| `/comingsoon` | ✅ | ✅ shipped (0.6.0) |
| `/error` | ✅ | ✅ shipped |
| `/landing/landing` | – | 🛑 redirect (intentional) per 0.9.0 fix |

---

## Recommended follow-up slice order

If we want to keep closing the gap with klynx FE on the user-named domains, the next 5 slices in priority order:

1. **`/floorPlans/[id]` placement editor** (~4 hr) — canvas pan/zoom, drag-drop camera markers, label edit, save via `/floorPlans/[id]/placements` bulk + single endpoints. Highest value remaining on the floorplan domain.
2. **`/admin/licenses/[licenseId]` detail page** (~3 hr) — entitlement view + audit log table + artifact issue / reissue / download. BE surface exists (`useLicense.ts` in klynx-feature is a 1:1 reference).
3. **`/systemDevices/groups` upgrade** (~3 hr) — RG tree edit + parent-child move + cameras assignment per-group. Currently 50-line starter; klynx is 1203 lines but the core tree + assignment is ~400 lines achievable.
4. **`/systemUsers/unit` upgrade** (~3 hr) — close the 209 → ~700 line gap by adding tree drag-drop reorder + member move-between-unit modal. Skip csv export and audit log per scope.
5. **`/systemUsers/organizations` upgrade** (~2 hr) — add org-unit picker on member-add modal + bulk role-change tab + default-role-on-org-add.

Total ~15 hr if all five ship. Practical batch: do 1+2 in one session (one PR each), 3 in a second, 4+5 in a third.

---

## Deferred-permanently (scope choices)

Items that are listed here are intentionally **not** scheduled — either they're klynx-specific (kcontrol / ksearch / kwatch / police), or they replace pages with simpler patterns (inline modal vs. per-id page).

- **`/{kcontrol,ksearch,kwatch}/*`** — klynx-branded KControl / KSearch / KWatch are not part of the phibek IA. The current redirect-stub pattern is the correct shape.
- **`/police/*`** — phibek may or may not adopt the kwatch-backed police-mode watchlist. Deferred until product decides.
- **`/systemDevices/cameras/{add,edit,delete}` per-id pages** — phibek has chosen inline-modal-on-index for CRUD. The redirect stubs are correct.
- **`/floorPlans/{new,[id]/edit}` per-id pages** — same as above; metadata edit lives in the index modal.
- **`/admin/licenses/{create}`** — eventually upgrade to inline modal too, or keep as a multi-step wizard page (klynx's create.vue is 1000+ lines because the wizard does deployment-type / delivery-mode / feature combination validation; defer to product on which pattern phibek wants).

---

## Klynx changelog items already covered on phibek

Cross-checked against klynx CHANGELOG 3.50.0 → 3.54.2 (the most recent batch):

| Klynx version | Subject | Phibek status |
|---|---|---|
| 3.50.0 | Permission catalog 403 guard | ✅ shipped 0.9.2 (PR #38) |
| 3.50.0 | `/intDash` sidebar entry + default landing pivot | ✅ shipped 0.10.0 (PR #39) sidebar; default-landing pivot is optional, deferred |
| 3.51.0 | `/intDash` Layer B-3a (MapLibre + markers) | ✅ shipped 0.10.0 (PR #39) — MapLibre native cluster instead of klynx HTML DOM markers |
| 3.52.0 | `/intDash` Layer B-3b (deck.gl pulse + heatmap) | ⛔ scope choice: phibek uses MapLibre native cluster, no deck.gl dependency |
| 3.53.0 | `/intDash` Layer B-3c (supercluster) | ⛔ scope choice: MapLibre native cluster covers the use case |
| 3.53.1 | RG filter unify on dashboard / biDash / live / videowall | ⛔ N/A: phibek doesn't have a RG picker on those pages yet |
| 3.53.2 | RG custom icons on `/map` | ⛔ N/A: phibek `/map` is a placeholder |
| 3.54.0 | `/intDash` Layer B-4 analytics (ECharts) | ✅ shipped 0.10.0 (PR #39) — chart.js equivalents |
| 3.54.1 | Dead-code removal | ⛔ N/A on phibek |
| 3.54.2 | `/intDash` scroll fix | ⛔ N/A: phibek `/intDash` uses the correct app-shell pattern from the start |

---

## API wrapper surface — current coverage

Files in `src/lib/api/`:

| File | Endpoints covered |
|---|---|
| `adminLicense.ts` | list / get / create / update / renew / activate / suspend / terminate / platformLicense (validate / activate / get) |
| `aiMapping.ts` | AI mapping templates |
| `aiSearch.ts` | ksearch surface (starter only) |
| `authGuard.ts` | auth-guard wrappers |
| `branding.ts` | branding |
| `dashboard.ts` | dashboard analytics |
| `devices.ts` | camera list/get/create/update/delete/syncMonitor + edge list/get/create/update/delete + resource groups |
| `edgeAi.ts` | edge-AI summary |
| `effectiveAccess.ts` | effective-access store |
| `entitlement.ts` | entitlement |
| `floorPlan.ts` | list / get / create (multipart) / update / delete + placement types |
| `ingest.ts` | gateway-portal-shaped ingest (not consumed by phibek today) |
| `iotControl.ts` | starter |
| `iotWatch.ts` | starter |
| `klynxIngest.ts` | klynx ingest events + dashboard |
| `klynxSubscription.ts` | subscription packages + checkout |
| `klynxUser.ts` | users + orgs + memberships |
| `org.ts` | org domain |
| `police.ts` | kwatch watchlist (read-only — `delete` only) |
| `profile.ts` | user profile |
| `settings.ts` | settings |
| `subscription.ts` | gateway-portal subscription |
| `target.ts` | delivery target |
| `user.ts` | user |
| `workspace.ts` | workspace |

**Gaps** vs klynx-feature `app/composables/`:
- `useFloorPlanApi.ts` — `addPlacement` / `updatePlacement` / `removePlacement` / `bulkAddPlacements` / `suggestPlacements` (deferred with the placement-editor slice)
- `useLicense.ts` — `fetchEntitlement` / `fetchAuditLog` / `fetchArtifact` / `issueLicense` / `reissueLicense` / `downloadArtifactAsFile` (deferred with the license-detail slice)
- `useRoleProfile.ts` — full role-profile CRUD (klynx has a separate profile-edit page; phibek covers via permission tree)
- `useAdminCameraCredentials.ts` — admin-only `GET /resources/camera/{camId}/credentials` (deferred with cameras detail panel)

---

## Sign-off

**Definition of done for tonight's batch:** all three open PRs (#39 intDash, #40 devices+floorPlans, #41 admin/licenses) pass `bun run check` clean and are reviewable. The user-named domains (`device`, `floorplan`, plus the bonus admin/licenses) are at functional parity for the core CRUD + lifecycle surface.

User-named domains that did **not** ship a new slice tonight: `user`, `permission`, `org`, `orgUnit`, `ingest`. These are all already at ≥60% parity per the table above — the largest single gap is `/systemUsers/unit` at 40% (tree drag-drop is missing), which is the recommended slice #4 for next session.

Tag this audit `v1` — it will go stale as we keep merging. Refresh after each slice ships.
