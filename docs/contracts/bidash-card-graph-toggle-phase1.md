# biDash Card Graph Toggle — Phase 1 Contract

**Date:** 2026-04-21
**Status:** Superseded by [`dashboard-timeseries.md`](./dashboard-timeseries.md) on 2026-05-04 — Phase 1 (`alerts.*`, `pedestrian.*`, `notifications.byType`, `blacklist.total`) and Phase 2 (`camera.*`, `kcontrol.*`) merged into one canonical contract per the new domain/flow grouping rule (`docs/contracts/README.md`). Kept here for PR / consumer history.
**Owner Backend:** `klynx-api`
**Related Plan:** [docs/plan/bidash-card-graph-toggle-phase1.md](../plan/bidash-card-graph-toggle-phase1.md)
**Applies To Repos:** `klynx-api`, `klynx-feature`
**Contract Type:** `REST`
**Version:** `v1`

---

## 1. Purpose

Defines the `GET /dashboard/timeseries` endpoint that powers the new "stats ↔ chart" toggle on `/biDash`. `klynx-api` publishes this as source of truth; `klynx-feature` must implement against it and must not infer metric names or response shape from code.

---

## 2. Ownership

### Owner Backend

- `klynx-api`

### Domain System of Record

| Domain | System of Record | Canonical Store | Notes |
|---|---|---|---|
| `ata_events` (alerts, pedestrian, notifications, blacklist) | `klynx-api` | `klynx-api.ata_events` | directly queried |

### Producer / Consumers

| Surface | Producer | Consumers | Notes |
|---|---|---|---|
| `GET /dashboard/timeseries` | `klynx-api (dashapi)` | `klynx-feature /biDash` | read-only |

### Projection Stores

| Projection | Store | Consumer | Notes |
|---|---|---|---|
| — | — | — | no separate projection in Phase 1 |

---

## 3. Compatibility and Policy

### Backward Compatibility

- Compatibility status: **additive** (new endpoint, no change to `/dashboard`).
- Consumer requirements: none — FE may call it optionally.
- Deprecation window: n/a.

### Replay / Re-sync Behavior

- Not applicable — read-only query.

### Write Authority Policy

- Not applicable — read-only.

---

## 4. Surface Summary

| Type | Name | Method | Auth | Producer / Handler | Consumer |
|---|---|---|---|---|---|
| REST | `/dashboard/timeseries` | `GET` | `BearerAuth + X-Active-Org` | `dashapi.GetTimeseries` | `klynx-feature /biDash` |

---

## 5. REST Contract

### 5.1 Dashboard Timeseries

**Endpoint:** `/dashboard/timeseries`
**Method:** `GET`
**Auth:** `Authorization: Bearer <jwt>` + `X-Active-Org: <orgId>`
**Purpose:** Return a time-bucketed series for one dashboard metric, suitable for direct rendering into an ApexCharts `line` / `area` / `spline` config.

#### Path Params

| Field | Type | Required | Description |
|---|---|---|---|
| — | — | — | — |

#### Query Params

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `metric` | string | yes | — | One of the enum below |
| `dateTime` | string | yes | — | `from,to` range; RFC3339 or `YYYY-MM-DD` |
| `tz` | string | no | `Asia/Bangkok` | IANA timezone |
| `groupBy` | string | no | auto | `hour` \| `day` \| `month` |
| `limit` | int | no | `10` | For `notifications.byType`: cap series count (top-N + "other") |

#### `metric` enum

Each metric is backed by an exact filter against `ata_events`. These filters match the discriminators used by `internal/services/dashsvc/events.go` today, so the FE and the backend use the same event vocabulary. Where the snapshot behavior intentionally differs, it is called out explicitly.

| Value | Canonical filter on `ata_events` | Bucket key | Series name(s) |
|---|---|---|---|
| `alerts.face` | `isDeleted != true` AND `type == "Face Capture"` | `dateTimeCreate` | `face` |
| `alerts.vehicle` | `isDeleted != true` AND `type =~ /Vehicle/i` (case-insensitive regex) | `dateTimeCreate` | `vehicle` |
| `alerts.total` | `isDeleted != true` AND (`alerts.face` filter OR `alerts.vehicle` filter) — **union of face and vehicle only** | `dateTimeCreate` | `total` |

**`alerts.total` is deliberately narrower than `/dashboard`'s `details.Event.Total`.** The snapshot's `Event.Total` (`events.go:152`) is a count of **all** `ata_events` in range — every type, including pedestrian, notifications, blacklist, etc. That is the wrong meaning for the Alerts card. The chart's `alerts.total` is instead the sum line that matches what the Alerts card displays: face + vehicle. Callers must not use `alerts.total` as a proxy for "all events in range".
| `pedestrian.in` | `isDeleted != true` AND `type == "Pedestrian Traffic Statistics"` AND `"in" ∈ regionNames` | `dateTimeCreate` | `in` |
| `pedestrian.out` | `isDeleted != true` AND `type == "Pedestrian Traffic Statistics"` AND `"out" ∈ regionNames` | `dateTimeCreate` | `out` |
| `notifications.byType` | `isDeleted != true` AND (`type != "Face Capture"` OR `eventAttribute.listType == 0` OR `eventAttribute.listType` does not exist) | `dateTimeCreate`, grouped by `type` | one series per `type`; top-N by total + `"other"` |
| `blacklist.total` | `isDeleted != true` AND `type == "Face Capture"` AND `eventAttribute.listType != 0` | `dateTimeCreate` | `blacklist` |

**Acknowledgement handling.** The `/dashboard` snapshot filters `notifications` and `blacklist` to `acknowledged != true` and caps the result at 5 rows. The time-series chart deliberately **drops** the `acknowledged` filter so it answers "how much is happening over time" (event volume) rather than "what needs attention right now" (queue depth). Do not expect sums to match.

**Face / blacklist overlap.** `alerts.face` includes events with `eventAttribute.listType != 0`, so those same events also count in `blacklist.total`. This is deliberate and matches the snapshot: a listType-match face event is both an alert and a blacklist hit.

Invalid `metric` values return **HTTP 400** with `message` = `metric must be one of: alerts.face, alerts.vehicle, alerts.total, pedestrian.in, pedestrian.out, notifications.byType, blacklist.total`.

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
      "start":   "2026-04-14T00:00:00Z",
      "end":     "2026-04-21T00:00:00Z",
      "groupBy": "day",
      "tz":      "Asia/Bangkok"
    },
    "metric": "alerts.face",
    "chart": {
      "type":       "line",
      "categories": ["2026-04-14", "2026-04-15", "...", "2026-04-20"],
      "series":     [
        { "name": "face", "data": [3, 8, 1, 0, 4, 12, 7] }
      ]
    }
  }
}
```

For `notifications.byType` the `series` array contains one entry per `type` value, capped by `limit` + "other":

```json
"series": [
  { "name": "face.match",   "data": [1, 3, 2, 0, 1, 2, 5] },
  { "name": "vehicle.speed","data": [0, 1, 0, 2, 1, 0, 1] },
  { "name": "other",        "data": [0, 0, 1, 0, 0, 1, 0] }
]
```

#### Success Field Definitions

| Field | Type | Description |
|---|---|---|
| `details.range.start` | string (RFC3339 UTC) | requested range start |
| `details.range.end` | string (RFC3339 UTC) | requested range end |
| `details.range.groupBy` | string | bucket granularity actually used |
| `details.range.tz` | string | timezone used for bucket labels |
| `details.metric` | string | echo of requested `metric` |
| `details.chart.type` | string | always `line` in Phase 1 |
| `details.chart.categories[]` | string[] | bucket labels (local tz) |
| `details.chart.series[].name` | string | series label |
| `details.chart.series[].data[]` | int64[] | count per bucket (0-filled for gaps) |

#### Error Contract

| HTTP | Code | Meaning | Consumer Handling |
|---|---|---|---|
| `400` | `BAD_REQUEST` | Missing/invalid `dateTime`, invalid `metric`, invalid `groupBy` | Show validation error; do not retry |
| `401` | `UNAUTHORIZED` | Missing/invalid bearer | Re-authenticate |
| `500` | `INTERNAL_SERVER_ERROR` | Repo/aggregation failure | Show generic error; retry allowed |

#### Error Example

```json
{
  "code": "BAD_REQUEST",
  "status": false,
  "message": "metric must be one of: alerts.face, alerts.vehicle, alerts.total, pedestrian.in, pedestrian.out, notifications.byType, blacklist.total"
}
```

---

## 6. Event Contract

Not applicable — REST-only in Phase 1.

---

## 7. Canonical and Projection Mapping

### Canonical Store

- System: `klynx-api`
- Store: `ata_events`
- Canonical fields used: `dateTimeCreate`, `type`, `isDeleted`, `regionNames` (array; contains `"in"` or `"out"` for pedestrian direction), `eventAttribute.listType` (for face capture / blacklist classification)

### Projection Store

- None in Phase 1.

### Field Mapping

| Canonical Field | Consumer Field | Notes |
|---|---|---|
| `ata_events.dateTimeCreate` (bucketed via `$dateTrunc`) | `details.chart.categories[]` | formatted in `tz` |
| `count(*)` per bucket | `details.chart.series[].data[]` | |
| `ata_events.type` | `details.chart.series[].name` (for `notifications.byType`) | |

---

## 8. Field Ownership

Not applicable — read-only.

---

## 9. Frontend Integration Notes

### Required FE Inputs

| FE Use Case | Contract Surface | Required Fields | Notes |
|---|---|---|---|
| `/biDash` Alerts card (chart mode) | `GET /dashboard/timeseries` | `metric=alerts.face` + `metric=alerts.vehicle` (two calls) or `metric=alerts.total` | Render 2-series line |
| `/biDash` Pedestrian card (chart mode) | `GET /dashboard/timeseries` | `metric=pedestrian.in` + `metric=pedestrian.out` | Render 2-series line |
| `/biDash` Notifications card (chart mode) | `GET /dashboard/timeseries` | `metric=notifications.byType`, optional `limit` | Multi-series line |
| `/biDash` Blacklist card (chart mode) | `GET /dashboard/timeseries` | `metric=blacklist.total` | Single-series line |
| `/biDash` Camera Ownership / Device cards (chart mode) | (none — reuse `/dashboard` snapshot) | snapshot counts | Render donut from existing snapshot |
| `/biDash` Weather card (chart mode) | (none — external) | existing forecast | Render spline from `useWeather()` |

### FE Payload Mapping

| FE Field | Backend Field | Direction | Notes |
|---|---|---|---|
| `dateRange` picker | `dateTime` | request | `from,to` |
| ApexCharts `options.xaxis.categories` | `details.chart.categories` | response | direct copy |
| ApexCharts `series[].name` | `details.chart.series[].name` | response | |
| ApexCharts `series[].data` | `details.chart.series[].data` | response | |

### FE Guardrails

- Do not call unknown metrics — backend returns 400.
- Do not cache responses longer than the selected range; user may change the date picker.
- On chart-mode toggle, show a loading skeleton while the request is in flight.
- Respect the contract's pagination of `notifications.byType` (top-N + "other"); do not attempt to fetch all types.

---

## 10. Rollout Notes

| Repo | Dependency | Required Before | Notes |
|---|---|---|---|
| `klynx-api` | new endpoint | before FE ships chart mode | additive |
| `klynx-feature` | toggle UI + composable | after backend is live | progressive enhancement; card still works in stats mode if backend is missing |

---

## 11. Examples

### Example Request

```
GET /dashboard/timeseries?metric=alerts.face&dateTime=2026-04-14,2026-04-21&tz=Asia/Bangkok&groupBy=day
Authorization: Bearer <jwt>
X-Active-Org: <orgId>
```

### Example Success Response

See section 5.1.

### Example Error — invalid metric

```json
{
  "code": "BAD_REQUEST",
  "status": false,
  "message": "metric must be one of: alerts.face, alerts.vehicle, alerts.total, pedestrian.in, pedestrian.out, notifications.byType, blacklist.total"
}
```

---

## 12. Checklist

- [x] Owner backend is explicit.
- [x] System of record is defined by domain.
- [x] Canonical store documented.
- [x] Producers and consumers listed.
- [x] Request, response, and error contracts defined.
- [x] Field ownership n/a.
- [x] Backward compatibility (additive) documented.
- [x] Replay / re-sync n/a noted.
- [x] FE field mapping included.
