# Device / Camera Domain Contract

**Date:** 2026-05-04
**Status:** Active (consolidated — supersedes `cameraListOrgAdminScope.md` + `camerasSyncMonitor.md` + `cameraUsageReport.md`. Camera CSV import path is covered by [`resource-group.md`](./resource-group.md) §5.6.)
**Owner Backend:** `klynx-api`
**Related Plan:** [docs/plan/done/cameraListOrgAdminScope.md](../plan/done/cameraListOrgAdminScope.md), [docs/plan/cameraUsageReport.md](../plan/cameraUsageReport.md), [docs/plan/resource-permission-menu-scope-alignment.md](../plan/resource-permission-menu-scope-alignment.md)
**Applies To Repos:** `klynx-api`, `klynx-feature`
**Contract Type:** `REST`
**Version:** `v1` — visibility alignment shipped 2026-04-27 (Bug #2); syncMonitor shipped 2026-04-25 rev 3; usage report shipped (4.15.0); camera Phase 1+2+3 monitor shipped (existing baseline)
**Supersedes:** `cameraListOrgAdminScope.md` (rev 1 — visibility scope alignment), `camerasSyncMonitor.md` (rev 3 — recovery endpoint), `cameraUsageReport.md` (v1.1 — usage report XLSX/CSV)

---

## 0. Domain / Flow Boundary

| Field | Value |
|---|---|
| Domain name | `device-camera-domain` |
| Flow name | Camera operational lifecycle: list visibility (read scope) → monitor recovery (sync) → usage analytics (report rollup) |
| Lifecycle scope | admin/operator-side surfaces that read or refresh camera state, complementing the camera CRUD that lives in `gateway-api/device_management` (canonical) and is projected into `klynx.camera` |

### Included Surfaces

| Surface Type | Name | Purpose |
|---|---|---|
| REST | `GET /resources/camera`, `GET /map/camera` | camera list visibility (alignment doc — no schema change) |
| REST | camera create/update/delete/import/export/mapVisibility actions | relation-based enforcement for regular members |
| REST | `POST /resources/camera/syncMonitor` (alias `/resources/cameras/syncMonitor`) | org-scoped recovery — re-register every non-deleted camera in active org with commonmon probe scheduler |
| REST | `GET /admin/analytics/cameraUsage` | per-org camera usage list with org-wide + filter-scoped summary, paginated |
| REST | `GET /admin/analytics/cameraUsage/export` | XLSX / CSV download of usage report (no pagination; 10k row cap with `RESULT_TRUNCATED` rejection) |

### Excluded Surfaces

| Surface | Why excluded | Authoritative Contract |
|---|---|---|
| Camera CRUD (`POST/PATCH/GET /kapi/resources/camera`) | canonical lifecycle covered by `gateway-api/device_management` projected into `klynx.camera`; not yet a klynx-api contract — full camera CRUD audit deferred | (gateway-api SoR; future klynx-api camera lifecycle contract if needed) |
| Camera CSV import | superseded by `resource-group.md` §5.6 round-trip | [`resource-group.md`](./resource-group.md) |
| Permission profile camera grants | covered by `permission-profile.md` (Phase 2 typed `cameras` field + Permify Cartesian-product tuple writes) | [`permission-profile.md`](./permission-profile.md) |
| Stream endpoint resolver gate | covered by `permission-profile.md` §5.5 | [`permission-profile.md`](./permission-profile.md) |
| Camera icon resolution + `IconBundle` | covered by `resource-group.md` §5.3 | [`resource-group.md`](./resource-group.md) |
| Dashboard timeseries metrics (`GET /dashboard/timeseries`) | covered by `dashboard-timeseries.md` | sibling contract |
| `/analytics/live/overview` scope filter | sibling — different surface (`dashboard-camera-scope-filter.md`) | standalone |
| Phase 3 dashboard / videowall | archived umbrella plan; shipped slices live in their focused contracts/plans | `docs/plan/done/phase3-dashboard-videowall.md` |

### Related Contracts

| Contract | Relationship |
|---|---|
| [`resource-group.md`](./resource-group.md) | sibling — RG↔camera membership, camera response icon resolution, camera CSV import (round-trip) |
| [`permission-profile.md`](./permission-profile.md) | sibling — camera direct grants + stream endpoint resolver gate |
| [`dashboard-timeseries.md`](./dashboard-timeseries.md) | sibling — timeseries metrics including `camera.byOwnership` and `camera.byState` |
| `dashboard-camera-scope-filter.md` | sibling — different endpoint (`/analytics/live/overview`); standalone |
| `phase3-dashboard-videowall.md` | sibling — archived umbrella plan with stream-security + counters + videowall |
| `camera-import-canonical.md` | predecessor — superseded by `resource-group.md` §5.6 |

### Grouping Rationale

The three source contracts (`cameraListOrgAdminScope`, `camerasSyncMonitor`, `cameraUsageReport`) all serve the **same camera entity** at different operational stages — read visibility, state recovery, analytics rollup. They share the camera projection (`klynx.camera`), the same auth pattern (Bearer + X-Active-Org + admin probe), and the same resolver / Permify visibility model. A reader who wants to operate the camera fleet end-to-end (admin sees full list → diagnoses unknown-state cameras via syncMonitor → exports usage report) needs all three. Per `docs/contracts/README.md` grouping rule, these are one operational flow → one contract.

Camera CSV import (predecessor `camera-import-canonical.md`) was originally listed in this cluster, but the v2 round-trip (`resource-import-export-roundtrip.md` → now `resource-group.md` §5.6) supersedes its import semantics. This contract references resource-group.md for that surface and does not duplicate the sheet schema.

`docs/plan/done/phase3-dashboard-videowall.md` covers Phase 3 umbrella work (stream-security hardening, `/dashboard/counters`, real-time push, videowall layouts) — only the stream-security piece is camera-adjacent and is already covered by `permission-profile.md` §5.5. The umbrella has been archived after shipped/follow-up slices were split out.

---

## 1. Purpose

Defines three camera-operational REST surfaces that complement the canonical camera CRUD (which lives in `gateway-api/device_management` and is projected into `klynx.camera`):

- **Visibility scope rule** for `GET /resources/camera` (CCTV list) and `GET /map/camera` (Map view) — both endpoints must apply the same decision tree so org-admins see identical camera counts on the two surfaces. Bug #2 surfaced because they had drifted apart; this contract is the canonical alignment.
- **Sync recovery endpoint** `POST /resources/camera/syncMonitor` — an org-scoped self-service action that re-registers every non-deleted camera in the caller's active org with the commonmon probe scheduler. Replaces the previous "restart commonmon process" workaround.
- **Camera Usage Report** `GET /admin/analytics/cameraUsage` (+ export) — per-org camera roster paired with per-camera play counts in a chosen window, plus org-wide + filter-scoped summary. Used by admin analytics page for utilization tracking.

`klynx-api` publishes this contract; `klynx-feature` (admin analytics + sync button + camera list) consumes it. Frontend must not invent fields, alias names, or scope semantics from implementation.

---

## 2. Ownership

### Owner Backend

- `klynx-api`

### Domain System of Record

| Domain | System of Record | Canonical Store | Notes |
|---|---|---|---|
| Camera identity | `gateway-api/device_management` | `device_management.cameras` | unchanged |
| Klynx camera projection | `klynx-api/devicerepo` | `klynx.camera` collection | report/list joins this projection |
| Play / "call" events | `gateway-api` ingest | `klynx-api/klive_events` (projection) | usage report aggregates here |
| Camera monitor state | `klynx-api/camstatusrepo` | `klynx.camera_monitor_status` | sync endpoint refreshes commonmon's Redis schedule (a projection of `klynx.camera`) |
| commonmon probe schedule | commonmon service | Redis (in commonmon) | klynx-api → commonmon direction only via `commonmongw.RegisterCamera` |
| Org-admin Permify tuples | Permify | `organization:{orgId}#manage@user:{userId}` | read by visibility decision tree |

### Producer / Consumers

| Surface | Producer / Handler | Consumers | Notes |
|---|---|---|---|
| `GET /resources/camera` | klynx-api `controllers/deviceapi/CameraController.List` → `internal/services/devicesvc/CameraService.List` | klynx-feature CCTV list | visibility rule applied at service layer |
| `GET /map/camera` | klynx-api `controllers/mapapi/CameraMap` → `internal/services/mapsvc/MapService.GetCameraMap` | klynx-feature Map view | same visibility rule |
| `POST /resources/camera/syncMonitor` | klynx-api `CameraController.SyncMonitor` | klynx-feature sync button | best-effort re-registration |
| `GET /admin/analytics/cameraUsage` | klynx-api `analyticsapi.CameraUsageHandler` | klynx-feature admin analytics | paginated table |
| `GET /admin/analytics/cameraUsage/export` | klynx-api `analyticsapi.CameraUsageExportHandler` | klynx-feature "Download" button | no pagination; 10k cap with hard reject |
| `commonmongw.RegisterCamera` (outbound) | klynx-api | commonmon service (in-cluster) | adapter; bounded fan-out cap 8 |

### Projection Stores

| Projection | Store | Consumer | Notes |
|---|---|---|---|
| Per-camera play count for a window | derived in-memory at request time | `analyticsvc.GetCameraUsageReport` | aggregate of `klive_events` (`event = klive.play.started`) |
| Camera roster | `klynx.camera` | `analyticsvc` left-joins to surface zero-use cameras | |
| commonmon probe schedule | Redis (commonmon) | commonmon scheduler | refreshed by syncMonitor |

---

## 3. Compatibility and Policy

### Backward Compatibility

- **cameraListOrgAdminScope (visibility alignment):** breaking for non-admin members who currently see no cameras and could not have created the cameras themselves — they continue to see none. **Additive** for org-admins who previously saw a strict subset on one surface but the union on the other; they now see the union on both. No callers should regress. Bug #2.
- **camerasSyncMonitor:** additive — new endpoint. No existing surface changed. Best-effort recovery; partial failure reported in-body (`failed > 0` does NOT raise HTTP error).
- **cameraUsageReport:** additive — new endpoints. Older FE versions continue to work; only the new admin page calls these endpoints.

### Replay / Re-sync Behavior

- **Visibility:** read-only; no replay needed.
- **syncMonitor:** repeat calls with the same `cameraId` are upsert-style — `commonmon POST /commonmon/cameras` re-writes the schedule entry and config blob. Calling syncMonitor multiple times in a row is safe.
- **Usage report:** stateless aggregation per request. Replay is "call the endpoint again" — there is no projection to rebuild.

### Write Authority Policy

- **Visibility surfaces** are read-only; no write authority assigned.
- **syncMonitor** is the **klynx-api → commonmon** direction only. It does NOT modify the `cameras` collection. The canonical store of camera identity remains `cameras`; commonmon's Redis schedule is a projection that this endpoint refreshes.
- **Usage report** is read-only.
- **Permify check failure on visibility:** if the Permify `organization:manage` check returns an error (network down, Permify unavailable, malformed tuple data), the service path MUST propagate the error up the call stack and return HTTP `502 Bad Gateway` with code `PERMIFY_UNAVAILABLE`. It MUST NOT silently treat the caller as org-admin (security regression risk) and MUST NOT silently treat them as a non-admin (would resurrect Bug #2).

### Revision History (preserved verbatim from source contracts)

**cameraListOrgAdminScope:**
- rev 1 (2026-04-27): initial — aligns CCTV list to Map's existing org-admin branch. Bug #2.

**camerasSyncMonitor:**
- rev 1 (2026-04-25): initial — `POST /resources/camera/syncMonitor` + FE button.
- rev 2 (2026-04-25): discovered first-call returned `failed=4` for all 4 cameras. Root cause: `POST /commonmon/cameras` and `DELETE /commonmon/cameras/:id` were registered behind `AuthBearer + ActiveOrg`, but the outbound `commonmongw.RegisterCamera` / `DeregisterCamera` adapter never sent `Authorization` or `X-Active-Org` headers. All Create / Update / BulkCreate / Delete commonmon registrations had been silently 401-ing since commit `2983421` (2026-04-24). Initial fix: reorganized `router/commonmon.go` so only the user-scoped GET `/cameraStatuses/*` reads remain authed; the server-to-server register/deregister endpoints run without auth (commonmon Service is ClusterIP-only — no external Ingress, callers are klynx-api in-cluster).
- rev 3 (2026-04-25): rev 2's router-only fix did not roll out — production commonmon pod runs an old image (`commonmon:1.0.7`, 5d19h uptime per kubectl) that still requires auth, so klynx-api kept getting 401. Added forwarding in `commonmongw.RegisterCamera` / `DeregisterCamera`: both now accept `userJWT` and `activeOrg` parameters and set them on the outbound request. The `CameraMonitorRegistrar` interface in `devicesvc` matches. SyncMonitor (the only caller with a request JWT in scope) plumbs the bearer all the way through; Create / Update / BulkCreate / Delete still pass empty strings — they will start working once commonmon is rebuilt with rev 2's router change. Plumbing JWT through the goroutine paths is a follow-up.

**cameraUsageReport:**
- v1.0 (2026-04-25): initial.
- v1.1 (2026-04-28 revision): additive enrichment fields — `lat`, `lng`, `district`, `mapVisibility`, `lastUsedAt`, `isOnline`, `type`, `resourceGroups`. `truncated` flag added; export-side `RESULT_TRUNCATED` 10k cap rule.

### syncMonitor Follow-ups (not blocking sync button)

1. Rebuild and roll out commonmon image with the rev 2 router change. Once live, the auth headers we now send become harmless extras and the goroutine paths (Create / Update / BulkCreate / Delete) start succeeding too.
2. Plumb userJWT through `CreateCameraInput` / `PatchCameraInput` so the goroutine paths can also call commonmon successfully on stacks that still require auth. Lower priority — once (1) ships, (2) is no longer needed.

---

## 4. Surface Summary

| Type | Name | Method | Auth / Trust | Producer / Handler | Consumer / Caller |
|---|---|---|---|---|---|
| REST | `/resources/camera` | `GET` | Bearer + `X-Active-Org` | `controllers/deviceapi/CameraController.List` → `CameraService.List` | klynx-feature CCTV list |
| REST | `/map/camera` | `GET` | Bearer + `X-Active-Org` | `controllers/mapapi/CameraMap` → `MapService.GetCameraMap` | klynx-feature Map |
| REST | camera create/update/delete/import/export/mapVisibility actions | mixed | Bearer + `X-Active-Org` + relation gate for regular members | camera controllers/services | klynx-feature CCTV management |
| REST | `/resources/camera/syncMonitor` (alias `/resources/cameras/syncMonitor`) | `POST` | Bearer + `X-Active-Org` | `CameraController.SyncMonitor` | klynx-feature sync button |
| REST | `/admin/analytics/cameraUsage` | `GET` | Bearer + `X-Active-Org` + admin role (platform `administrator` OR org-admin) | `analyticsapi.CameraUsageHandler` | klynx-feature admin analytics |
| REST | `/admin/analytics/cameraUsage/export` | `GET` | Bearer + `X-Active-Org` + admin role | `analyticsapi.CameraUsageExportHandler` | klynx-feature Download button |

---

## 5. REST Surfaces

### 5.1 Camera List Visibility Scope (alignment doc — no schema change)

The HTTP request/response of `GET /resources/camera` and `GET /map/camera` is **not changed by this contract**. Only the internal visibility computation is contractualized so the two paths cannot silently re-diverge.

#### Visibility scope decision tree

Given a caller with `userId`, an active `orgId`, and a global `platformRole`, the set of cameras returned is determined by this decision tree, applied identically by both endpoints:

```text
if platformRole == "administrator":
    return all cameras in orgId
else if Permify Check(subject="user:{userId}", relation="manage", entity="organization:{orgId}") == true:
    return all cameras in orgId           ← org-admin: bypasses resource-group filter
else:
    allowedIds = MemberAccessService.ResolveViewableEntityIDs(..., "camera")
    return cameras in orgId WHERE camId IN allowedIds
```

In plain English:
- **Platform administrator** sees everything in the active org. (No Permify check needed; the realm role is authoritative.)
- **Org administrator** (Permify `organization:{orgId}:manage`) sees everything in their active org, regardless of resource-group membership.
- **Regular org member** sees only cameras returned by the permission resolver. The resolver includes ResourceGroup-mediated grants, `includeResourceGroupChildren`, direct camera grants, `includeOrgUnitChildren`, and `memberIds` narrowing.

#### Producer / Consumer mapping

| Surface | Handler | Visibility rule applied at |
|---|---|---|
| `GET /resources/camera` | `controllers/deviceapi/CameraController.List` | `internal/services/devicesvc/CameraService.List` |
| `GET /map/camera` | `controllers/mapapi/CameraMap` | `internal/services/mapsvc/MapService.GetCameraMap` |

Both call sites MUST follow the decision tree above. Future endpoints that surface camera lists for an org-scoped caller MUST also follow this rule unless they document an explicit override in their own contract.

#### Permify check failure

If the Permify `organization:manage` check returns an error, return HTTP `502 Bad Gateway` with code `PERMIFY_UNAVAILABLE`. Do NOT silently treat the caller as org-admin OR non-admin.

#### Tuple authority (read-only)

| Tuple | Written by | Used by decision tree |
|---|---|---|
| `organization:{orgId}#manage@user:{userId}` | org-admin grant flow | yes — the "org-admin" branch |
| `camera:{camId}#viewer@user:{userId}` (via resource-group expansion) | resource-group membership flow | yes — the "regular member" branch |
| `camera:{camId}#parentOrg@organization:{orgId}` | `CameraService.Create` | indirect — via "all cameras in orgId" repo filter |

### 5.2 Sync Monitor — `POST /resources/camera/syncMonitor`

**Endpoint:** `/resources/camera/syncMonitor` (alias `/resources/cameras/syncMonitor`)
**Method:** `POST`
**Auth:** Bearer + `X-Active-Org` (org-scoped — callers cannot sync another org's cameras).
**Purpose:** Re-register every non-deleted camera in the caller's active org with the commonmon probe scheduler.

#### Why this exists

Solves the recurring case where cameras stay at `monitorState=unknown` even though their RTSP URL is reachable, because the scheduler fell out of sync with the device collection. Known triggers:

- Bulk imports performed before commit `2983421` (lifecycle sync fix on 2026-04-24) did not call `RegisterCamera`. Affected cameras stay unknown until the next commonmon process restart re-runs the seed flow.
- klynx-api's `commonmongw.RegisterCamera` is best-effort (warn-only on failure). If commonmon was offline during a CRUD burst, the affected cameras silently fall out of the scheduler.

This endpoint replaces the previous "restart commonmon process" workaround with a self-service action the org administrator can trigger from the UI.

#### Request

```http
POST /resources/camera/syncMonitor HTTP/1.1
Authorization: Bearer <jwt>
X-Active-Org: <orgId>
```

No body. Handler reads `tenantId` and `activeOrg` from middleware locals.

#### Success Response (200)

```json
{
  "code": "SUCCESS",
  "status": true,
  "message": "camera monitor sync complete",
  "details": {
    "registered": 12,
    "skipped": 1,
    "failed": 0
  }
}
```

| Field | Meaning |
|---|---|
| `registered` | `commonmon.RegisterCamera` calls that returned 2xx |
| `skipped` | Cameras with no RTSP URL — commonmon rejects empty `rtspUrl`, so klynx-api filters them out before the call |
| `failed` | Calls that returned an error (commonmon down, timeout, non-2xx) |

#### Error Responses

| Status | Code | When |
|---|---|---|
| `401` | `UNAUTHORIZED` | missing / invalid bearer |
| `503` | `MONITOR_NOT_CONFIGURED` | `COMMONMON_BASE_URL` is unset on this klynx-api process — no registrar wired |
| `500` | `INTERNAL_SERVER_ERROR` | mongo query failed, unrecoverable iteration error |

`failed > 0` does **not** raise an HTTP error. The endpoint is best-effort — partial failure is reported in-body so the UI can surface it. Callers that need strict "all or nothing" semantics must inspect the body.

#### Behavior

1. Reject with `MONITOR_NOT_CONFIGURED` if `CameraService.monitorRegister` is nil.
2. Iterate `cameras` collection where `orgId == activeOrg AND isDeleted != true` via `CameraRepo.IterateOrgActive`.
3. For each camera, resolve RTSP URL: prefer `cam.url`, fall back to `cam.streamUrl`. If both empty → increment `skipped`, do not call commonmon.
4. Call `commonmongw.RegisterCamera(camId, orgId, "", "", url)` with bounded fan-out (cap 8, reused from `monitorRegisterFanOutLimit`) so a large org does not burst commonmon.
5. Wait for all in-flight calls to complete before returning. Per-call success increments `registered`; per-call error increments `failed`.

#### Idempotency

`commonmon POST /commonmon/cameras` is upsert-style — repeat calls with the same `cameraId` re-write the schedule entry and config blob. Calling syncMonitor multiple times in a row is safe.

#### Authority

This endpoint is the **klynx-api → commonmon** direction only. It does not modify the `cameras` collection. The canonical store of camera identity remains `cameras`; commonmon's Redis schedule is a projection that this endpoint refreshes.

#### Frontend integration

The button calls this endpoint and displays a toast with `registered / skipped / failed`. Pages to surface the action on (per agreed scope 2026-04-25):

- `/feature/systemDevices/cameras` — primary location, near "เพิ่มกล้อง" / "Bulk import"
- `/feature/biDash` — when camera health charts show stale data
- `/feature/videowall` — when tiles are stuck on unknown
- `/feature/floorPlans` — when placed cameras show monitor=unknown

### 5.3 Camera Usage Report — List (JSON)

**Endpoint:** `/admin/analytics/cameraUsage`
**Method:** `GET`
**Auth:** Bearer JWT + `X-Active-Org`. Caller must hold either platform `administrator` role OR org-admin role on the active org.
**Purpose:** Return the org's camera roster paired with per-camera play counts in the requested window, plus an org-level summary.

#### Query Params

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `from` | string (RFC3339 UTC) | yes | — | window start, inclusive |
| `to` | string (RFC3339 UTC) | yes | — | window end, exclusive |
| `tz` | string (IANA, e.g. `Asia/Bangkok`) | no | `UTC` | display timezone for `lastUsedAt` and for default file naming |
| `scope` | string | no | `all` | one of `all` / `owner` / `public`; same semantics as the analytics overview |
| `cameraIds` | string (comma-separated) | no | — | optional filter; when present, only listed cameras are returned (still join with counts) |
| `q` | string | no | — | name substring filter (case-insensitive, regex-quoted in repo) |
| `page` | int | no | 1 | 1-based page index |
| `perPage` | int | no | 50 | page size, max 500 |
| `sortField` | string | no | `playCount` | one of `playCount`, `name`, `lastUsedAt` |
| `sortOrder` | string | no | `desc` | `asc` or `desc` |

#### Success Response (200)

```json
{
  "code": "SUCCESS",
  "message": "ok",
  "status": true,
  "details": {
    "items": [
      {
        "id": "cam-7c2a-…",
        "name": "Front gate 01",
        "location": "Main building, north wing",
        "brand": "Dahua",
        "scope": "owner",
        "playCount": 184,
        "lat": 13.6178196,
        "lng": 100.6956348,
        "district": "Prawet",
        "mapVisibility": "public",
        "lastUsedAt": "2026-04-23T11:08:42Z",
        "isOnline": true,
        "type": "PTZ",
        "resourceGroups": ["Front zone", "Public live"]
      }
    ],
    "summary": {
      "totalCameras": 312,
      "usedCameras": 207,
      "unusedCameras": 105,
      "totalPlayCount": 18432,
      "filteredCameras": 312,
      "filteredPlayCount": 18432,
      "windowFrom": "2026-03-26T00:00:00Z",
      "windowTo": "2026-04-25T00:00:00Z"
    },
    "truncated": false
  },
  "pagination": {
    "page": 1, "perPage": 50, "totalRecords": 312, "totalPages": 7,
    "sortField": "playCount", "sortOrder": "desc"
  }
}
```

#### Success Field Definitions

| Field | Type | Description |
|---|---|---|
| `details.items[].id` | string | camera id (CamId) — exposed as `id` per CLAUDE.md ID rule |
| `details.items[].name` | string | camera display name |
| `details.items[].location` | string | free-text location (`camera.location`); empty string when unset |
| `details.items[].brand` | string | camera brand (`camera.brand`); empty string when unset |
| `details.items[].scope` | string | `owner` or `public` (camera privacy scope) |
| `details.items[].playCount` | int | number of `klive.play.started` events for this camera in the window |
| `details.items[].lat` | number | latitude (`camera.lat`); `0` when unset |
| `details.items[].lng` | number | longitude (`camera.lng`); `0` when unset |
| `details.items[].district` | string | district (`camera.district`); empty string when unset |
| `details.items[].mapVisibility` | string | `inherit` \| `forcePublic` \| `forcePrivate` (`camera.mapVisibility`) |
| `details.items[].lastUsedAt` | string \| null | most recent play event timestamp (UTC, RFC3339), or `null` if zero |
| `details.items[].isOnline` | bool | current online state from `cam_status` (informational only) |
| `details.items[].type` | string | camera type (`camera.type` — e.g. `IP`, `PTZ`, `fisheye`); empty when unset |
| `details.items[].resourceGroups` | string[] | resource group names this camera belongs to, sorted ascending. Always present (never null); empty array when the camera is not in any group or the resolver is unavailable. Source: Permify `camera → parentGroup → resourceGroup` tuples joined to `resource_groups.name` |
| `details.summary.totalCameras` | int | **org-wide** — every camera in the active org regardless of `scope`, `cameraIds`, or `q` filters. This is the report's denominator and must not change when filters narrow the row list |
| `details.summary.usedCameras` | int | **org-wide** — cameras in the active org with `playCount > 0` in the window. Independent of row filters |
| `details.summary.unusedCameras` | int | `summary.totalCameras - summary.usedCameras` (org-wide) |
| `details.summary.totalPlayCount` | int | **org-wide** — sum of every camera's plays in the window across the whole org, not just the current page or the filtered row set |
| `details.summary.filteredCameras` | int | **filter-scoped** — number of cameras matching `scope`, `cameraIds`, and `q` (i.e. the size of the row set across all pages). FE uses this to render "showing X of Y" labels |
| `details.summary.filteredPlayCount` | int | **filter-scoped** — sum of `playCount` over the filtered row set |
| `details.summary.windowFrom` / `windowTo` | string | echo of accepted window (UTC) |
| `details.truncated` | bool | true if the filtered row set exceeded 10,000 rows and the response was capped. The org-wide `summary.total*` fields and the filter-scoped `summary.filtered*` fields **always reflect the full counts** (computed before truncation). Only `details.items[]` is truncated |

#### Error Contract

| HTTP | Code | Meaning | Consumer Handling |
|---|---|---|---|
| 400 | `BAD_REQUEST` | missing/invalid `from`/`to`, range > 366 days, invalid `format`, invalid sort field | show field-level error |
| 401 | `UNAUTHORIZED` | missing/invalid bearer | redirect to login |
| 403 | `FORBIDDEN` | not platform admin and not org admin on active org | hide the page from menu, show 403 fallback |
| 500 | `INTERNAL_ERROR` | aggregation failure | show retry banner |

### 5.4 Camera Usage Report — Export (XLSX / CSV)

**Endpoint:** `/admin/analytics/cameraUsage/export`
**Method:** `GET`
**Auth:** same as 5.3.
**Purpose:** Return the same row set as 5.3 but as a downloadable file. Pagination params are ignored — the file contains every matching row up to the 10,000-row cap.

#### Query Params

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `format` | string | yes | — | `xlsx` or `csv` |
| `from`, `to`, `tz`, `scope`, `cameraIds`, `q`, `sortField`, `sortOrder` | — | — | — | same as 5.3 |

#### Success Response (200)

Headers:

```text
Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet   # for xlsx
Content-Type: text/csv; charset=utf-8                                              # for csv
Content-Disposition: attachment; filename="cameraUsage_<orgSlug>_<from>_<to>.<ext>"
```

Body: binary file bytes.

**Truncation rule (export):** the export endpoint **never returns a partial file**. If the filtered row set would exceed the 10,000-row cap, the endpoint responds `400 RESULT_TRUNCATED` with no body — the caller must narrow the window or filters and retry. This differs from the JSON endpoint, which returns the first 10,000 rows with `details.truncated=true` so the on-screen table stays usable.

#### XLSX layout (sheet `Camera Usage`)

| Row | Content |
|---|---|
| 1 | Title: `Camera Usage Report — <orgName>` |
| 2 | Window: `<from> → <to> (<tz>)` |
| 3 | Summary: `Total <n> · Used <n> · Unused <n> · Total Plays <n>` |
| 4 | (blank) |
| 5 | Header row: `id`, `name`, `location`, `brand`, `scope`, `playCount`, `lat`, `lng`, `district`, `mapVisibility`, `lastUsedAt`, `isOnline`, `type`, `resourceGroups` |
| 6+ | data rows |

CSV layout: header row identical to XLSX row 5, data rows only (no title/summary preamble — the FE renders the summary on screen). UTF-8 BOM prepended so Excel opens Thai characters correctly.

#### resourceGroups in tabular formats

`resourceGroups` is a JSON array. In XLSX/CSV it is flattened into a single cell joined by `; ` (semicolon + space). Example: `Front zone; Public live`. Why semicolon: CSV's field delimiter is `,`; while Go's `csv.Writer` auto-quotes fields that contain `,`, downstream consumers (Excel under regional list-separator settings, naive parsers) handle a non-`,` separator more reliably. The XLSX cell uses the same separator for consistency.

#### lat / lng in tabular formats

Rendered as plain decimals (e.g. `13.6178196`) — never scientific notation. A camera with `lat=0` and `lng=0` (typical "no location" placeholder) renders as empty cells in CSV/XLSX to avoid implying a real location at 0°N/0°E.

#### Error Contract

| HTTP | Code | Meaning | Consumer Handling |
|---|---|---|---|
| 400 | `BAD_REQUEST` | missing/invalid `format`, invalid window | show inline error |
| 400 | `RESULT_TRUNCATED` | matching rows exceed 10,000 — operator must narrow the window | prompt to narrow date range |
| 401, 403, 500 | (same as 5.3) | | |

### 5.5 Camera Action Enforcement for Resource-Permission Members (planned)

This section applies to regular org members who are not platform admins and do not have `organization.manage` on the active org. Admin bypass behavior is unchanged.

The camera list is a read surface, but the camera management page also exposes write actions. FE button visibility and BE authorization MUST use the union of relations from all active ResourcePermissionProfiles that match the caller and the target camera.

| Camera operation | Required relation | FE behavior | BE behavior |
|---|---|---|---|
| list / detail / stream | `viewer` or higher matching resolver path | show read-only row/tile | allow only cameras in resolver set |
| export camera list | `viewer` unless product later defines export as admin-only | show export only when read allowed | deny if caller has no readable cameras |
| create camera | `creator` | show "add camera" | `403 FORBIDDEN` without `creator` |
| bulk import creates | `creator` | show import only if create is allowed; split create/update warnings if FE can detect | reject create rows without `creator` |
| update camera fields | `editor` | show edit | `403 FORBIDDEN` without `editor` |
| mapVisibility toggle | `editor` | show toggle | `403 FORBIDDEN` without `editor` |
| bulk import updates | `editor` | allow update import only with `editor` | reject update rows without `editor` |
| delete camera | `deleter` | show delete | `403 FORBIDDEN` without `deleter` |

Multiple profiles union relations per target camera. Missing relation means deny. FE hiding is a UX rule; backend enforcement is authoritative and must return `403 FORBIDDEN` for direct API calls.

#### Menu dependency

The CCTV management page is reachable for a regular member only when effectiveAccess includes `systemDevicesCameras`. See [`permission-profile.md`](./permission-profile.md) §5.7 for resource-derived menu visibility and option/tab hiding.

---

## 6. Kafka / Async Event Surfaces

`N/A — not in scope.` Camera operations are REST-only at this layer. The upstream `klive_events` projection is fed from `gw.events.normalized.v1` which is owned by gateway-api and consumed by the existing klynx-api `gweventscons` (separate flow).

---

## 7. MQTT / Realtime Surfaces

`N/A — not in scope.` Camera-related MQTT (telemetry, presence) is not part of this contract. Realtime push for camera health is deferred to Phase 3 (`phase3-dashboard-videowall.md` 3c).

---

## 8. Redis / Cache Surfaces

`N/A — not in scope.` The commonmon scheduler uses its own Redis but that store is internal to commonmon — not visible to klynx-api consumers. syncMonitor refreshes commonmon's schedule via REST `POST /commonmon/cameras`, not directly.

---

## 9. Sync / Field-Ownership Surfaces

### 9.1 Canonical and Projection Mapping

**Canonical Stores**
- Camera identity: `gateway-api/device_management.cameras` (gw canonical)
- Play events: `gateway-api` ingest pipeline → `gw.events.normalized.v1`

**Projection Stores (read by this contract)**
- Camera roster: `klynx.camera` (projected from gw)
- Play events: `klynx.klive_events` (projected from gw)
- Camera monitor state: `klynx.camera_monitor_status` (klynx-local, not a gw mirror)
- commonmon schedule: Redis in commonmon (not directly visible; refreshed via REST)

**Field Mapping (usage report)**

| Canonical Field | Projection Field | Consumer Field | Notes |
|---|---|---|---|
| `device_management.cameras._id` | `klynx-api/cameras.camId` | `details.items[].id` | exposed as `id` per CLAUDE.md ID rule |
| `device_management.cameras.name` | `klynx-api/cameras.name` | `details.items[].name` | direct |
| `gw.events.normalized.v1` (eventType=play_started) | `klynx-api/klive_events` rows where `eventType = klive.play.started` | aggregated to `playCount` and `lastUsedAt` | aggregated per `(orgId, stream, occurredAt)` |

### 9.2 Field Ownership

| Field | Authoritative Writer | Allowed Initiator | Stored In | Notes |
|---|---|---|---|---|
| `klynx.camera.*` | gateway-api → klynx-api projection writer | gw canonical | klynx Mongo | read-only here |
| `klynx.klive_events.*` | klynx-api `gweventscons` | gw normalized event consumer | klynx Mongo | read-only here |
| `klynx.camera_monitor_status.*` | klynx-api `camstatusrepo` (commonmon binary) | commonmon probe | klynx Mongo | not written by this contract; informational on usage report (`isOnline`) |
| commonmon Redis schedule | commonmon service | klynx-api `commonmongw.RegisterCamera` (refresh-only) | Redis (commonmon) | syncMonitor refreshes; never deletes (commonmon manages its own GC) |
| Permify `organization:{orgId}#manage@user:{userId}` | org-admin grant flow | (separate org-admin surface) | Permify | read by visibility decision tree (§5.1) |

### 9.3 Conflict Resolution

- **Visibility:** read-only; no conflict.
- **syncMonitor:** upsert-style refresh; commonmon owns its Redis schedule and applies last-write-wins on its own cells. klynx-api does not delete schedule entries (commonmon GC handles that on camera delete via `DeregisterCamera` adapter).
- **Usage report:** stateless aggregation; concurrent requests are independent.

---

## 10. Frontend Integration Notes

### Required FE Inputs

| FE Use Case | Contract Surface | Required Fields | Notes |
|---|---|---|---|
| CCTV list (`/feature/systemDevices/cameras`) | `GET /resources/camera` | (existing list shape) | visibility rule applied at BE; FE reads what BE returns |
| Map view | `GET /map/camera` | (existing map shape) | same visibility rule |
| Sync button | `POST /resources/camera/syncMonitor` | none (no body) | display toast with `registered / skipped / failed` |
| Admin analytics → Camera usage table | `GET /admin/analytics/cameraUsage` | `id`, `name`, `playCount`, `lastUsedAt`, `scope` | sort by `playCount desc` by default |
| Admin analytics → Download | `GET /admin/analytics/cameraUsage/export` | same query as table + `format` | trigger browser download from the response |

### Example FE Payload Mapping

| FE Field | Backend Field | Direction | Notes |
|---|---|---|---|
| Sync toast — `อัปเดต n รายการ` | `details.registered` | response | |
| Sync toast — `ข้ามไป n` | `details.skipped` | response | render only when `> 0` |
| Sync toast — `ล้มเหลว n` | `details.failed` | response | render as warning when `> 0` |
| Usage table column "ID" | `details.items[].id` | response | render as plain text; not clickable in v1 |
| Usage table column "Camera" | `details.items[].name` | response | |
| Usage table column "Plays" | `details.items[].playCount` | response | right-align |
| Usage table column "Last used" | `details.items[].lastUsedAt` | response | format in `tz`; show "—" when null |
| Usage summary chip "Used / Total" | `details.summary.usedCameras` / `details.summary.totalCameras` | response | |
| Usage filter date range | `from`, `to` | request | from existing analytics filter |

### FE Guardrails

- Visibility scope is BE-authoritative. Do NOT replicate the decision tree on FE — read what BE returns.
- Do not render the CCTV menu, camera select option, camera tab, or camera filter if `systemDevicesCameras` is absent from `visibleMenuIds`.
- Hide add/edit/delete/import/mapVisibility controls unless the target camera relation set contains the required relation from §5.5.
- For sync button: do NOT block on `failed > 0` — the endpoint is best-effort and partial failure is reported in body. Surface as warning toast, not error.
- Do not alias `id` back to `cameraId` in the FE store — use `id` everywhere as documented.
- Do not assume `lastUsedAt` is non-null — render `"—"` for unused cameras.
- Treat `RESULT_TRUNCATED` as a real error (not a soft warning) — block the download and ask the user to narrow.
- `resourceGroups` is always an array — never `null`. Treat empty array as "camera not assigned to any group".
- `lat`/`lng` of `0` should be rendered as "—" or hidden, not plotted at 0°N/0°E.

---

## 11. Rollout Notes

| Repo | Dependency | Required Before | Notes |
|---|---|---|---|
| `klynx-api` | visibility alignment (Bug #2 fix) | shipped 2026-04-27 | breaking for non-admin members who saw nothing on one surface; additive for org-admins |
| `klynx-api` | syncMonitor endpoint (rev 3) | shipped 2026-04-25 | self-service recovery; commonmon image rebuild is a follow-up (not blocking) |
| `klynx-api` | usage report endpoints | shipped (4.15.0 region) | additive |
| `klynx-feature` | sync button + usage table | after BE shipped | wires the page |

**Status:** all three surfaces shipped. Visibility alignment closed Bug #2. syncMonitor self-service replaces the previous "restart commonmon process" workaround. Usage report v1.1 is in production with the additive enrichment fields.

---

## 12. Examples

### 12.1 Visibility scope — admin sees union

Setup. Org has 312 cameras. Caller is org-admin (`organization:org-1234#manage@user:admin-1`).

```http
GET /resources/camera?perPage=50
Authorization: Bearer <admin-jwt>
X-Active-Org: org-1234
```

Decision tree: Permify Check returns `true` → return all cameras in orgId. Response: `pagination.totalRecords: 312`.

Same admin on `GET /map/camera` returns the same 312 cameras (post-fix). Pre-fix Bug #2 had the two surfaces drifting — list returned subset, map returned all.

### 12.2 Visibility scope — regular member

Setup. Caller is OU member with a permission profile granting access to RG "Front zone" (3 cameras).

```http
GET /resources/camera?perPage=50
Authorization: Bearer <member-jwt>
X-Active-Org: org-1234
```

Decision tree: not platform admin; Permify org.manage check `false`; `ResolveViewableEntityIDs(..., "camera")` returns the 3 cameras in RG "Front zone". Response: `pagination.totalRecords: 3`.

### 12.3 Visibility scope — Permify down

Permify network failure during the org.manage check.

→ `502 Bad Gateway` `{ "code": "PERMIFY_UNAVAILABLE", ... }`.

NO silent fallback to admin or non-admin.

### 12.4 syncMonitor happy path

```http
POST /resources/camera/syncMonitor
Authorization: Bearer <jwt>
X-Active-Org: org-1234
```

Org has 13 cameras, 1 with empty RTSP URL.

```json
{
  "code": "SUCCESS",
  "details": { "registered": 12, "skipped": 1, "failed": 0 }
}
```

### 12.5 syncMonitor partial failure

commonmon is reachable but rejects 2 cameras (e.g. RTSP URL malformed):

```json
{
  "code": "SUCCESS",
  "details": { "registered": 10, "skipped": 1, "failed": 2 }
}
```

HTTP 200 — the endpoint is best-effort. FE renders as warning toast: `อัปเดต 10 รายการ · ล้มเหลว 2 รายการ`.

### 12.6 syncMonitor — commonmon not configured

```http
POST /resources/camera/syncMonitor
```

`COMMONMON_BASE_URL` is unset on this klynx-api process.

→ `503 Service Unavailable` `{ "code": "MONITOR_NOT_CONFIGURED", ... }`.

### 12.7 Usage report — happy path

```http
GET /admin/analytics/cameraUsage?from=2026-03-26T00:00:00Z&to=2026-04-25T00:00:00Z&tz=Asia/Bangkok&page=1&perPage=50&sortField=playCount&sortOrder=desc
Authorization: Bearer <admin-jwt>
X-Active-Org: org-1234
```

Response: see §5.3 Success Response example.

### 12.8 Usage report export — XLSX

```http
GET /admin/analytics/cameraUsage/export?format=xlsx&from=2026-03-26T00:00:00Z&to=2026-04-25T00:00:00Z&tz=Asia/Bangkok
```

→ `200 OK`, body is xlsx bytes, file name `cameraUsage_acme_2026-03-26_2026-04-25.xlsx`.

### 12.9 Usage report export — RESULT_TRUNCATED

Org has 12,000 matching cameras (broad window).

→ `400 Bad Request` `{ "code": "RESULT_TRUNCATED", "message": "matching rows exceed 10,000 — narrow the window or filters and retry" }`.

FE blocks the download and prompts the user to narrow the date range.

### 12.10 Usage report — non-admin denied

Caller is regular OU member, not an org-admin.

→ `403 Forbidden` `{ "code": "FORBIDDEN", ... }`.

FE hides the analytics page from the menu and shows the 403 fallback.

---

## 13. Out of Scope (Not in This Contract)

- Camera CRUD (create / update / delete). Canonical lifecycle in `gateway-api/device_management`; klynx-api projection is read-only at this layer.
- Camera CSV import / round-trip. Covered by `resource-group.md` §5.6.
- Permission profile camera grants. Covered by `permission-profile.md`.
- Stream endpoint resolver gate. Covered by `permission-profile.md` §5.5.
- Camera response icon resolution + `IconBundle`. Covered by `resource-group.md` §5.3.
- Dashboard timeseries metrics. Covered by `dashboard-timeseries.md`.
- Phase 3 dashboard / videowall. Archived umbrella `docs/plan/done/phase3-dashboard-videowall.md` (BE deltas: 3a stream-security via signed URLs; 3b `/dashboard/counters`; 3c real-time push deferred).
- Plumbing userJWT through goroutine paths (Create / Update / BulkCreate / Delete commonmon registrations). Lower priority — once commonmon is rebuilt with rev 2 router change, the goroutine paths start succeeding without JWT.

---

## 14. Compatibility Matrix

| Caller / FE state | This BE deployed | Behavior |
|---|---|---|
| Org-admin on `/resources/camera` | yes | sees full org list (post-Bug #2 alignment) |
| Org-admin on `/map/camera` | yes | sees full org list (matches `/resources/camera`) |
| Regular member with RG-scoped profile | yes | sees only cameras in granted RGs (unchanged) |
| Member without any active profile (post-permission-profile.md tightening) | yes | sees nothing (existing behavior) |
| Pre-Bug-2-fix FE | yes (BE alignment) | FE may see different counts on list vs map; bug surfaced this drift; FE itself didn't change |
| Sync button — first call after rev 3 deploy | yes | succeeds (auth headers forwarded to commonmon) |
| Sync button — pre-rev-3 BE | n/a (rev 3 already shipped) | (historical) failed=4 because commonmon required auth that wasn't forwarded |
| Usage report — modern admin FE | yes | full table + summary + export |
| Usage report — pre-feature FE | yes | doesn't call new endpoints; no impact |

---

## 15. Implementation evidence

| Surface | File | Note |
|---|---|---|
| Camera list visibility | [internal/services/devicesvc/camera.go](../../internal/services/devicesvc/camera.go) (`CameraService.List`) | decision tree applied at service layer |
| Map list visibility | [internal/services/mapsvc/](../../internal/services/mapsvc/) (`MapService.GetCameraMap`) | same decision tree |
| syncMonitor controller | [controllers/deviceapi/](../../controllers/deviceapi/) (`CameraController.SyncMonitor`) | rev 3 plumbs userJWT + activeOrg through `commonmongw.RegisterCamera` |
| commonmon adapter | [internal/gateways/commonmongw/client.go](../../internal/gateways/commonmongw/client.go) | `RegisterCamera` / `DeregisterCamera` accept userJWT + activeOrg parameters |
| commonmon router | [router/commonmon.go](../../router/commonmon.go) | rev 2 split — user-scoped GET cameraStatuses authed; server-to-server register/deregister un-authed |
| Usage report aggregator | [internal/repo/analyticrepo/cameraUsage.go](../../internal/repo/analyticrepo/cameraUsage.go) (`AggregateCameraPlayCounts`) | aggregates `klive_events` by `$stream` |
| Usage report service | [internal/services/analyticsvc/cameraUsage.go](../../internal/services/analyticsvc/cameraUsage.go) (`GetCameraUsageReport`, `ExportCameraUsageReport`) | left-joins scoped camera roster; org-wide vs filter-scoped summary; 10k cap |
| Usage report controllers | [controllers/analyticsapi/cameraUsage.go](../../controllers/analyticsapi/cameraUsage.go) | JSON + export handlers |
| Usage report router | [router/adminAnalytics.go](../../router/adminAnalytics.go) | mounts `/admin/analytics/cameraUsage{,/export}` |
| Tests | [internal/services/analyticsvc/cameraUsage_test.go](../../internal/services/analyticsvc/cameraUsage_test.go) | 13 unit tests covering merge / filter / sort / paginate / CSV/XLSX round-trip |

---

## 16. Checklist

- [x] Domain / flow boundary explicit (§0 — 5 REST surfaces; explicit excludes for camera CRUD, CSV import, perm profile, stream gate, icons, dashboard, Phase 3).
- [x] Owner backend explicit (`klynx-api`).
- [x] System of record per domain (gw cameras canonical; klynx projection; klive_events; camera_monitor_status; commonmon Redis).
- [x] Canonical store and projection store documented.
- [x] Producers and consumers listed for every surface in scope (5 REST + commonmon outbound adapter).
- [x] REST request, response, and error contracts defined (full error matrix preserved verbatim).
- [x] Visibility scope decision tree preserved (3 branches: platform admin / org admin / regular member; Permify-down → 502 PERMIFY_UNAVAILABLE).
- [x] syncMonitor full revision history preserved (rev 1 / rev 2 router fix / rev 3 adapter forwarding).
- [x] syncMonitor follow-ups preserved (commonmon image rebuild; goroutine JWT plumbing).
- [x] Usage report v1.1 enrichment fields preserved (`lat`, `lng`, `district`, `mapVisibility`, `lastUsedAt`, `isOnline`, `type`, `resourceGroups`).
- [x] Usage report org-wide vs filter-scoped summary distinction preserved.
- [x] Usage report 10k truncation rule preserved (JSON soft via `truncated:true`; export hard via `RESULT_TRUNCATED`).
- [x] Usage report XLSX/CSV layout preserved verbatim.
- [x] Kafka N/A — explained.
- [x] MQTT N/A — explained.
- [x] Redis N/A — explained (commonmon's internal Redis is not a klynx-visible surface).
- [x] Field ownership table preserved.
- [x] Backward compatibility documented (visibility alignment breaking for one branch / additive for admin; syncMonitor / usage report fully additive).
- [x] FE field mapping included.
- [x] Examples cover visibility (admin / member / Permify down), syncMonitor (happy / partial fail / not configured), usage report (happy / export / truncated / forbidden).
- [x] Implementation evidence table preserved.
