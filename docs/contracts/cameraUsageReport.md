# Camera Usage Report Contract

**Date:** 2026-04-25 (revised 2026-04-28 — additive enrichment fields)
**Status:** Superseded by [`device-camera-domain.md`](./device-camera-domain.md) on 2026-05-04 — `GET /admin/analytics/cameraUsage{,/export}` merged into one Camera Domain operations contract per the new domain/flow grouping rule (`docs/contracts/README.md`). Full v1.1 enrichment fields preserved verbatim in §5.3 + §5.4 of the merged contract: all 14 row fields (id, name, location, brand, scope, playCount, lat, lng, district, mapVisibility, lastUsedAt, isOnline, type, resourceGroups); org-wide vs filter-scoped summary distinction (`totalCameras` / `usedCameras` / `unusedCameras` / `totalPlayCount` are org-wide denominators that must NOT change with filters; `filteredCameras` / `filteredPlayCount` are filter-scoped); 10k truncation rule (JSON soft via `truncated:true` includes summary computed before truncation; export hard via `400 RESULT_TRUNCATED` with no body); XLSX layout (5 preamble rows + headers + data); CSV UTF-8 BOM for Excel Thai support; resourceGroups `; `-flatten in tabular formats; lat/lng plain-decimal rendering with `0,0` → empty cell; FE Guardrails (no `id → cameraId` aliasing; null `lastUsedAt` → "—"; `0,0` → "—" not plotted); error contract (`BAD_REQUEST` for window > 366 days, `RESULT_TRUNCATED` as hard error). Body kept here for PR / Codex review history.
**Owner Backend:** `klynx-api`
**Related Plan:** [docs/plan/cameraUsageReport.md](../plan/cameraUsageReport.md)
**Applies To Repos:** `klynx-api`, `klynx-feature`
**Contract Type:** REST
**Version:** v1.1

---

## 1. Purpose

This contract defines the REST surface for the **Camera Usage Report** — a per-org list of every camera with how many times it was "called" (live-played) inside a chosen window, plus a summary of total / used / unused cameras and a downloadable XLSX/CSV file.

- klynx-api publishes this contract; klynx-feature consumes it.
- FE renders the JSON endpoint as a paginated table and wires the export endpoint to a download button.
- FE must not invent fields or alias names — read what is documented here.

---

## 2. Ownership

### Owner Backend

- `klynx-api`

### Domain System of Record

| Domain | System of Record | Canonical Store | Notes |
|---|---|---|---|
| Camera identity | `gateway-api/device_management` | `device_management.cameras` | unchanged |
| Klynx camera projection | `klynx-api/devicerepo` | `cameras` collection | report joins this projection to surface zero-use cameras |
| Play / "call" events | `gateway-api` ingest | `klynx-api/klive_events` (projection) | report aggregates here |

### Producer / Consumers

| Surface | Producer | Consumers | Notes |
|---|---|---|---|
| `GET /admin/analytics/cameraUsage` | `analyticsapi.CameraUsageHandler` | `klynx-feature` admin analytics page | new |
| `GET /admin/analytics/cameraUsage/export` | `analyticsapi.CameraUsageExportHandler` | `klynx-feature` "Download" button | new |

### Projection Stores

| Projection | Store | Consumer | Notes |
|---|---|---|---|
| Per-camera play count for a window | derived in-memory at request time (no projection collection) | `analyticsvc` | aggregate of `klive_events` |

---

## 3. Compatibility and Policy

### Backward Compatibility

- Status: **additive**. New endpoints only; nothing removed or renamed.
- Consumer requirements: none — older FE versions continue to work; only the new admin page calls these endpoints.
- Deprecation window: n/a.

### Replay / Re-sync Behavior

- Stateless aggregation per request. Replay is "call the endpoint again" — there is no projection to rebuild.

### Write Authority Policy

- Read-only. No write authority assigned.

---

## 4. Surface Summary

| Type | Name | Method / Topic | Auth | Producer / Handler | Consumer / Caller |
|---|---|---|---|---|---|
| REST | List camera usage | `GET /admin/analytics/cameraUsage` | BearerAuth + ActiveOrg + admin role | `analyticsapi.CameraUsageHandler` | `klynx-feature` |
| REST | Export camera usage | `GET /admin/analytics/cameraUsage/export` | BearerAuth + ActiveOrg + admin role | `analyticsapi.CameraUsageExportHandler` | `klynx-feature` |

---

## 5. REST Contract

### 5.1 List camera usage (JSON)

**Endpoint:** `/admin/analytics/cameraUsage`
**Method:** `GET`
**Auth:** Bearer JWT + `X-Active-Org`. Caller must hold either platform `administrator` role OR org-admin role on the active org.
**Purpose:** Return the org's camera roster paired with per-camera play counts in the requested window, plus an org-level summary.

#### Path Params

(none)

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

#### Request Headers

| Header | Required | Description |
|---|---|---|
| `Authorization` | yes | `Bearer <jwt>` |
| `X-Active-Org` | yes | active org id |

#### Request Body

(none — GET)

#### Success Response

**HTTP:** `200`

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
    "page": 1,
    "perPage": 50,
    "totalRecords": 312,
    "totalPages": 7,
    "sortField": "playCount",
    "sortOrder": "desc"
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
| `details.items[].resourceGroups` | string[] | resource group names this camera belongs to, sorted ascending. Always present (never null); empty array when the camera is not in any group or the resolver is unavailable. Source: Permify `camera → parentGroup → resourceGroup` tuples joined to `resource_groups.name`. |
| `details.summary.totalCameras` | int | **org-wide** — every camera in the active org regardless of `scope`, `cameraIds`, or `q` filters. This is the report's denominator and must not change when filters narrow the row list. |
| `details.summary.usedCameras` | int | **org-wide** — cameras in the active org with `playCount > 0` in the window. Independent of row filters. |
| `details.summary.unusedCameras` | int | `summary.totalCameras - summary.usedCameras` (org-wide). |
| `details.summary.totalPlayCount` | int | **org-wide** — sum of every camera's plays in the window across the whole org, not just the current page or the filtered row set. |
| `details.summary.filteredCameras` | int | **filter-scoped** — number of cameras matching `scope`, `cameraIds`, and `q` (i.e. the size of the row set across all pages). FE uses this to render "showing X of Y" labels. |
| `details.summary.filteredPlayCount` | int | **filter-scoped** — sum of `playCount` over the filtered row set. |
| `details.summary.windowFrom` / `windowTo` | string | echo of accepted window (UTC) |
| `details.truncated` | bool | true if the filtered row set exceeded 10,000 rows and the response was capped. The org-wide `summary.total*` fields and the filter-scoped `summary.filtered*` fields **always reflect the full counts** (they are computed before truncation). Only `details.items[]` is truncated. |

#### Error Contract

| HTTP | Code | Meaning | Consumer Handling |
|---|---|---|---|
| 400 | `BAD_REQUEST` | missing/invalid `from`/`to`, range > 366 days, invalid `format`, invalid sort field | show field-level error |
| 401 | `UNAUTHORIZED` | missing/invalid bearer | redirect to login |
| 403 | `FORBIDDEN` | not platform admin and not org admin on active org | hide the page from menu, show 403 fallback |
| 500 | `INTERNAL_ERROR` | aggregation failure | show retry banner |

#### Error Example

```json
{
  "code": "BAD_REQUEST",
  "message": "from must be before to and the range must be ≤ 366 days"
}
```

---

### 5.2 Export camera usage (XLSX / CSV)

**Endpoint:** `/admin/analytics/cameraUsage/export`
**Method:** `GET`
**Auth:** same as 5.1
**Purpose:** Return the same row set as 5.1 but as a downloadable file. Pagination params are ignored — the file contains every matching row up to the 10,000-row cap.

#### Query Params

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `format` | string | yes | — | `xlsx` or `csv` |
| `from`, `to`, `tz`, `scope`, `cameraIds`, `q`, `sortField`, `sortOrder` | — | — | — | same as 5.1 |

#### Success Response

**HTTP:** `200`

Headers:

```
Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet   # for xlsx
Content-Type: text/csv; charset=utf-8                                              # for csv
Content-Disposition: attachment; filename="cameraUsage_<orgSlug>_<from>_<to>.<ext>"
```

Body: binary file bytes.

**Truncation rule (export):** the export endpoint **never returns a partial file**. If the filtered row set would exceed the 10,000-row cap, the endpoint responds `400 RESULT_TRUNCATED` with no body — the caller must narrow the window or filters and retry. This differs from the JSON endpoint, which returns the first 10,000 rows with `details.truncated=true` so the on-screen table stays usable.

XLSX layout (sheet `Camera Usage`):

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

`resourceGroups` is a JSON array. In XLSX/CSV it is flattened into a single
cell joined by `; ` (semicolon + space). Example: `Front zone; Public live`.
Why semicolon: CSV's field delimiter is `,`; while Go's `csv.Writer`
auto-quotes fields that contain `,`, downstream consumers (Excel under
regional list-separator settings, naive parsers) handle a non-`,` separator
more reliably. The XLSX cell uses the same separator for consistency.

#### lat / lng in tabular formats

Rendered as plain decimals (e.g. `13.6178196`) — never scientific notation.
A camera with `lat=0` and `lng=0` (typical "no location" placeholder)
renders as empty cells in CSV/XLSX to avoid implying a real location at
0°N/0°E.

#### Error Contract

| HTTP | Code | Meaning | Consumer Handling |
|---|---|---|---|
| 400 | `BAD_REQUEST` | missing/invalid `format`, invalid window | show inline error |
| 400 | `RESULT_TRUNCATED` | matching rows exceed 10,000 — operator must narrow the window | prompt to narrow date range |
| 401, 403, 500 | (same as 5.1) | | |

---

## 6. Event Contract

Not applicable — REST only.

---

## 7. Canonical and Projection Mapping

### Canonical Store

- System: `gateway-api` (events) + `gateway-api/device_management` (cameras)
- Stores: gateway-api ingest pipeline; `device_management.cameras`

### Projection Store

- System: `klynx-api`
- Stores: `klive_events` (event projection); `cameras` (camera projection)

### Field Mapping

| Canonical Field | Projection Field | Consumer Field | Notes |
|---|---|---|---|
| `device_management.cameras._id` | `klynx-api/cameras.camId` | `details.items[].id` | exposed as `id` per CLAUDE.md ID rule |
| `device_management.cameras.name` | `klynx-api/cameras.name` | `details.items[].name` | direct |
| `gw.events.normalized.v1` (eventType=play_started) | `klynx-api/klive_events` rows where `eventType = klive.play.started` | aggregated to `playCount` and `lastUsedAt` | aggregated per `(orgId, stream, occurredAt)` |

---

## 8. Field Ownership

Read-only — not applicable.

---

## 9. Frontend Integration Notes

### Required FE Inputs

| FE Use Case | Contract Surface | Required Fields | Notes |
|---|---|---|---|
| Admin analytics → Camera usage table | `GET /admin/analytics/cameraUsage` | `id`, `name`, `playCount`, `lastUsedAt`, `scope` | sort by `playCount desc` by default |
| Admin analytics → Download | `GET /admin/analytics/cameraUsage/export` | same query as table + `format` | trigger browser download from the response |

### Example FE Payload Mapping

| FE Field | Backend Field | Direction | Notes |
|---|---|---|---|
| table column "ID" | `details.items[].id` | response | render as plain text; not clickable in v1 |
| table column "Camera" | `details.items[].name` | response | |
| table column "Plays" | `details.items[].playCount` | response | right-align |
| table column "Last used" | `details.items[].lastUsedAt` | response | format in `tz`; show "—" when null |
| summary chip "Used / Total" | `details.summary.usedCameras` / `details.summary.totalCameras` | response | |
| filter date range | `from`, `to` | request | from existing analytics filter |

### FE Guardrails

- Do not alias `id` back to `cameraId` in the FE store — use `id` everywhere as documented.
- Do not assume `lastUsedAt` is non-null — render `"—"` for unused cameras.
- Treat `RESULT_TRUNCATED` as a real error (not a soft warning) — block the download and ask the user to narrow.
- `resourceGroups` is always an array — never `null`. Treat empty array as "camera not assigned to any group".
- `lat`/`lng` of `0` should be rendered as "—" or hidden, not plotted at 0°N/0°E.

---

## 10. Rollout Notes

| Repo | Dependency | Required Before | Notes |
|---|---|---|---|
| `klynx-api` | new endpoints | shipped first | additive, no migration |
| `klynx-feature` | contract published | after klynx-api endpoints reach develop | wires the page |

---

## 11. Examples

### Example Request

```
GET /admin/analytics/cameraUsage?from=2026-03-26T00:00:00Z&to=2026-04-25T00:00:00Z&tz=Asia/Bangkok&page=1&perPage=50&sortField=playCount&sortOrder=desc
Authorization: Bearer …
X-Active-Org: org-1234
```

### Example Success Response

(see §5.1)

### Example Export Request

```
GET /admin/analytics/cameraUsage/export?format=xlsx&from=2026-03-26T00:00:00Z&to=2026-04-25T00:00:00Z&tz=Asia/Bangkok
Authorization: Bearer …
X-Active-Org: org-1234
```

→ HTTP 200, body is the xlsx bytes, file name `cameraUsage_acme_2026-03-26_2026-04-25.xlsx`.

---

## 12. Checklist

- [x] Owner backend explicit (`klynx-api`).
- [x] System of record defined per domain.
- [x] Canonical store and projection store documented.
- [x] Producers and consumers listed.
- [x] Request, response, and error contracts defined.
- [x] Field ownership: n/a (read-only).
- [x] Backward compatibility documented (additive).
- [x] Replay / re-sync behavior documented (stateless).
- [x] FE field mapping included.
