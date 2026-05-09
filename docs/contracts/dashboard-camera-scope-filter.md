# Dashboard Camera Scope Filter Contract

**Date:** 2026-04-20
**Status:** Draft
**Owner Backend:** `klynx-api`
**Related Plan:** [docs/plan/dashboard-camera-scope-filter.md](../plan/dashboard-camera-scope-filter.md), [docs/plan/resource-permission-menu-scope-alignment.md](../plan/resource-permission-menu-scope-alignment.md)
**Applies To Repos:** `klynx-api`, `klynx-feature`
**Contract Type:** `REST`
**Version:** `v1`

---

## 1. Purpose

Defines the `scope` query parameter added to `GET /analytics/live/overview`. `klynx-api` publishes this as the source of truth; the klynx-feature dashboard must implement against it and must not infer default or allowed values from implementation.

---

## 2. Ownership

### Owner Backend

- `klynx-api`

### Domain System of Record

| Domain | System of Record | Canonical Store | Notes |
|---|---|---|---|
| `camera.orgId`, `camera.mapVisibility` | `gateway-api/device_management` | `device_management.camera` | klynx reads projected copy |
| `klive_events` | `klynx-api` | `klynx-api.klive_events` | no `orgId` field |

### Producer / Consumers

| Surface | Producer | Consumers | Notes |
|---|---|---|---|
| `GET /analytics/live/overview` | `klynx-api` | `klynx-feature` | dashboard page |

### Projection Stores

| Projection | Store | Consumer | Notes |
|---|---|---|---|
| Per-org camera dim | Redis `deviceDim:{orgId}` + Mongo `camera` | `klynx-api analyticsvc` | used for `owner` scope |
| Public camera dim | Redis `deviceDimPublic` + Mongo `camera` | `klynx-api analyticsvc` | used for `public` scope |

---

## 3. Compatibility and Policy

### Backward Compatibility

- Compatibility status: **additive param, default semantics change**.
  - The `scope` query param is optional.
  - Previous default was implicitly `public`. New default is `all`.
  - Consumers must send `scope=public` explicitly if they want the legacy behavior.
- Consumer requirements: klynx-feature must pass `scope` on every request after adoption.
- Deprecation window: none — single release cutover gated by FE.

### Replay / Re-sync Behavior

- Not applicable (read-only analytics query).

### Write Authority Policy

- Not applicable (read-only).

---

## 4. Surface Summary

| Type | Name | Method / Topic | Auth | Producer / Handler | Consumer / Caller |
|---|---|---|---|---|---|
| REST | `/analytics/live/overview` | `GET` | `BearerAuth + X-Active-Org` | `analyticsapi.OverviewHandler.Handle` | `klynx-feature /dashboard` |

---

## 5. REST Contract

### 5.1 Overview

**Endpoint:** `/analytics/live/overview`
**Method:** `GET`
**Auth:** `Authorization: Bearer <jwt>` + `X-Active-Org: <orgId>`
**Purpose:** Return KPIs, timeseries, breakdowns, and top cameras for the dashboard, filtered by the chosen camera scope.

#### Path Params

| Field | Type | Required | Description |
|---|---|---|---|
| — | — | — | — |

#### Query Params

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `dateTime` | string | yes | — | Range `from,to`; RFC3339 or `YYYY-MM-DD` |
| `tz` | string | no | `Asia/Bangkok` | IANA timezone |
| `groupBy` | string | no | auto | `hour`, `day`, `month` |
| `limit` | int | no | `10` | Top-N limit |
| `streamIds` | string | no | — | Comma-separated stream IDs |
| `source` | string | no | — | Filter by `clientInfo.origin` |
| `mediaServerId` | string | no | — | Filter by `mediaServerId` |
| `protocol` | string | no | — | Filter by protocol |
| `userType` | string | no | — | `staff` \| `public` \| omitted = all |
| `resourceGroups` | string | no | — | Comma-separated resource-group UUIDs |
| `scope` | string | no | `all` | `public` \| `owner` \| `all`; see below |

#### `scope` values

| Value | Meaning | Source of stream IDs |
|---|---|---|
| `owner` | Cameras the caller owns for this request scope | admin/platform-admin: all active-org cameras; regular member: `ResolveViewableEntityIDs(..., "camera")` intersected with active-org cameras |
| `public` | Public cameras visible to the caller that are not already in `owner` | `mapVisibility ∈ {public, forcePublic}` minus owner set |
| `all` | Union of `owner` + `public`, deduplicated by `camId` | owner wins when a camera belongs to both sets |

Invalid values produce **HTTP 400** with `message` = `scope must be 'public', 'owner', 'all', or omitted`.

#### Owner wins / no double count

If a public camera is also granted to the user by ResourcePermissionProfile, it is counted as `owner`, not `public`. This keeps counters stable:

```text
front1 = public
fl2    = private
profile grants front1 + fl2

scope=owner  -> 2
scope=public -> 0 for those two cameras
scope=all    -> 2
```

#### ResourceGroup filter ordering

Apply camera scope first, then apply `resourceGroups`. A regular member must never recover a scoped-out owner camera by selecting a resourceGroup filter. ResourceGroup descendant behavior follows the permission resolver and `includeResourceGroupChildren` where the filter is used as a permission-bound resource tree.

#### Request Headers

| Header | Required | Description |
|---|---|---|
| `Authorization` | yes | `Bearer <jwt>` |
| `X-Active-Org` | yes | active org / workspace ID |

#### Request Body

Not applicable — GET.

#### Success Response

**HTTP:** `200`

```json
{
  "code": "SUCCESS",
  "status": true,
  "message": "ok",
  "details": {
    "range": {
      "start": "2026-04-13T00:00:00Z",
      "end":   "2026-04-20T00:00:00Z",
      "groupBy": "day",
      "tz": "Asia/Bangkok"
    },
    "kpis": {
      "plays": 0,
      "uniqueSessions": 0,
      "uniqueViewersApprox": 0,
      "activeStreamsApprox": 0
    },
    "charts": {
      "playsSeries":          { "type": "timeseries", "categories": [], "series": [] },
      "activeStreamsSeries":  { "type": "timeseries", "categories": [], "series": [] },
      "byResourceGroupSeries":{ "type": "spline",     "categories": [], "series": [] }
    },
    "breakdowns": {
      "byDevice":  { "type": "bar",   "categories": [], "series": [] },
      "byBrowser": { "type": "donut", "labels": [],     "series": [] },
      "bySource":  { "type": "bar",   "categories": [], "series": [] }
    },
    "topCameras": []
  }
}
```

Response shape is unchanged from the current endpoint. Only the stream-ID set that feeds the metrics changes with `scope`.

#### Success Field Definitions

Unchanged from the existing overview contract (see `analyticsmod.OverviewDetails`). No new response fields are added by this change.

#### Error Contract

| HTTP | Code | Meaning | Consumer Handling |
|---|---|---|---|
| `400` | `BAD_REQUEST` | Missing `dateTime`, bad format, or invalid `scope` | Show validation error; do not retry |
| `401` | `UNAUTHORIZED` | Missing or invalid bearer | Re-authenticate |
| `500` | `INTERNAL_SERVER_ERROR` | Repo/aggregation failure | Show generic error; retry allowed |

#### Error Example

```json
{
  "code": "BAD_REQUEST",
  "status": false,
  "message": "scope must be 'public', 'owner', 'all', or omitted"
}
```

---

## 6. Event Contract

Not applicable — REST-only.

---

## 7. Canonical and Projection Mapping

### Canonical Store

- System: `gateway-api/device_management`
- Store: `camera`
- Canonical fields (read side): `camId`, `orgId`, `mapVisibility`

### Projection Store

- System: `klynx-api`
- Store: `klynx-api.camera` (Mongo) + Redis caches `deviceDim:{orgId}` / `deviceDimPublic`
- Projected fields used here: `camId`, `orgId`, `mapVisibility`, `name`, `district`, `lat`, `lng`, `location`, `remark`, `brand`

### Field Mapping

| Canonical Field | Projection Field | Consumer Field | Notes |
|---|---|---|---|
| `camera.camId` | `camera.camId` | `topCameras[].streamId` | ID exposed as `streamId` in this response |
| `camera.orgId` | `camera.orgId` | (internal filter only) | admin owner scope; regular-member owner scope also requires resolver membership |
| `camera.mapVisibility` | `camera.mapVisibility` | (internal filter only) | drives `public` scope after owner subtraction |

---

## 8. Field Ownership

Not applicable — read-only query. No synced writes.

---

## 9. Frontend Integration Notes

### Required FE Inputs

| FE Use Case | Contract Surface | Required Fields | Notes |
|---|---|---|---|
| `/dashboard` overview | `GET /analytics/live/overview` | `dateTime`, `tz`, `scope`, optional `resourceGroups` | FE should always send `scope` explicitly after adoption |

### Example FE Payload Mapping

| FE Field | Backend Field | Direction | Notes |
|---|---|---|---|
| `scopeFilter` (UI selector) | `scope` query param | request | map `All`→`all`, `Public`→`public`, `My Org`→`owner` |
| `resourceGroupFilter[]` (UUIDs) | `resourceGroups` query param | request | comma-separated UUIDs, unchanged |

### FE Guardrails

- Do not guess undocumented `scope` values. Backend returns 400.
- Do not rely on the default behavior — the default is `all` and may change only via a new contract version.
- Treat the documented error codes as the only supported error contract.
- For regular members, do not compute owner/public locally from active org alone. Backend scope is authoritative and must include ResourcePermissionProfile resolver rules.
- Hide dashboard / report resource-type filters whose menu IDs are absent from `visibleMenuIds`; for example hide edgeDevice filters when `systemDevicesEdge` is absent.

---

## 10. Rollout Notes

| Repo | Dependency | Required Before | Notes |
|---|---|---|---|
| `klynx-api` | adds `scope` parsing + resolver | before FE sends `scope` | backward-compatible if FE omits (= `all`) |
| `klynx-feature` | sends `scope` and exposes selector | after backend ships | cut over in the same release window to avoid KPI-number surprise |

---

## 11. Examples

### Example Request — public only

```
GET /analytics/live/overview?dateTime=2026-04-13,2026-04-20&tz=Asia/Bangkok&scope=public
Authorization: Bearer <jwt>
X-Active-Org: <orgId>
```

### Example Request — owner scope

```
GET /analytics/live/overview?dateTime=2026-04-13,2026-04-20&tz=Asia/Bangkok&scope=owner
Authorization: Bearer <jwt>
X-Active-Org: <orgId>
```

### Example Request — all (union) with resource group filter

```
GET /analytics/live/overview?dateTime=2026-04-13,2026-04-20&tz=Asia/Bangkok&scope=all&resourceGroups=7954d06c-fee7-4bc5-8c75-6844e916558b
Authorization: Bearer <jwt>
X-Active-Org: <orgId>
```

### Example Error Response — invalid scope

```json
{
  "code": "BAD_REQUEST",
  "status": false,
  "message": "scope must be 'public', 'owner', 'all', or omitted"
}
```

---

## 12. Checklist

- [x] Owner backend is explicit.
- [x] System of record is defined by domain.
- [x] Canonical store and projection store are documented.
- [x] Producers and consumers are listed.
- [x] Request, response, and error contracts are defined.
- [x] Field ownership n/a noted.
- [x] Backward compatibility is documented (additive param, default behavior shift).
- [x] Replay / re-sync behavior n/a noted.
- [x] FE field mapping is included.
