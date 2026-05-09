# Dashboard Timeseries Contract

**Date:** 2026-05-04
**Status:** Active (consolidated — supersedes `bidash-card-graph-toggle-phase1.md` + `bidash-status-history-phase2.md`)
**Owner Backend:** `klynx-api`
**Related Plan:** [docs/plan/done/bidash-card-graph-toggle-phase1.md](../plan/done/bidash-card-graph-toggle-phase1.md), [docs/plan/done/bidash-status-history-phase2.md](../plan/done/bidash-status-history-phase2.md)
**Applies To Repos:** `klynx-api`, `klynx-feature`
**Contract Type:** `REST`
**Version:** `v1`
**Supersedes:** `bidash-card-graph-toggle-phase1.md` (Phase 1 metrics), `bidash-status-history-phase2.md` (Phase 2 device-state metrics)

---

## 0. Domain / Flow Boundary

| Field | Value |
|---|---|
| Domain name | `dashboard-timeseries` |
| Flow name | `/biDash` chart-mode rendering |
| Lifecycle scope | metric query → bucketed aggregation → ApexCharts-shaped response |

### Included Surfaces

| Surface Type | Name | Purpose |
|---|---|---|
| REST | `GET /dashboard/timeseries` | single endpoint serving all timeseries metrics — alerts, pedestrian, notifications, blacklist, camera state, kcontrol state |

### Excluded Surfaces

| Surface | Why excluded | Authoritative Contract |
|---|---|---|
| `/dashboard` snapshot endpoint | different lifecycle (point-in-time vs timeseries); intentionally diverges in `alerts.total` and `*.online` semantics — see §5 footnotes | (snapshot is documented in code) |
| `kcontrol.statusChanged` Kafka topic | private internal transport; not consumed cross-repo | (private, documented in code) |
| `camera` projection writes (gateway-api → klynx-api) | upstream sync flow, separate domain | future `device-camera-domain.md` (audit Cluster #1) |

### Related Contracts

| Contract | Relationship |
|---|---|
| [`phase3-dashboard-videowall.md`](./phase3-dashboard-videowall.md) | sibling — Phase 3 dashboard work (counters / videowall) consumes the same endpoint |
| [`dashboard-camera-scope-filter.md`](./dashboard-camera-scope-filter.md) | sibling — scope filter applies to dashboard analytics, not to this timeseries endpoint |

---

## 1. Purpose

Defines the unified `GET /dashboard/timeseries` endpoint that powers the `/biDash` "stats ↔ chart" toggle. One endpoint, one response shape, one error contract; the `metric` query parameter selects which time-bucketed series to render. `klynx-api` publishes this as source of truth; `klynx-feature` must implement against it and must not infer metric names or response shape from code or from network traces.

---

## 2. Ownership

### Owner Backend

- `klynx-api`

### Domain System of Record

| Domain | System of Record | Canonical Store | Notes |
|---|---|---|---|
| `ata_events` (alerts, pedestrian, notifications, blacklist) | `klynx-api` | `klynx-api.ata_events` | directly queried for Phase 1 metrics |
| Camera identity (`orgId`, `MapVisibility`, `Revision`) | `gateway-api/device_management`, projected into `klynx-api.camera` | `klynx-api.camera` | read-only here; ownership join only |
| Camera monitor current state | `klynx-api.camera_monitor_status` | single row per camera; `state ∈ {online, offline, suspect, unknown}` | local probe evaluation, not a gw mirror |
| Kcontrol current status | `klynx-api.kctrl` | `status ∈ {online, warning, offline}` | |
| Camera monitor status history | `klynx-api.camera_monitor_status_history` | append-only transition log | projection — read in this contract |
| Kcontrol status history | `klynx-api.kcontrol_status_history` | append-only transition log | projection — read in this contract |

### Producer / Consumers

`klynx-api` runs as two binaries: `main` (API + kctrl consumer) and `cmd/commonmon` (probe orchestrator + kctrl bridge). The append sites for the history projections live in different binaries.

| Surface | Producer (binary) | Consumer (binary) | Notes |
|---|---|---|---|
| `camera_monitor_status_history` append | `commonmonsvc/probeOrchestrator.go:255` **and** `commonmonsvc/kctrlBridge.go:160` (**commonmon**) | `dashsvc.GetTimeseries` (**main**) | no shared helper — both writer sites instrumented independently |
| `kcontrol_status_history` append | `kctrlsvc.HandleStatusChanged` (**main**) | `dashsvc.GetTimeseries` (**main**) | append happens in same main process as `kctrl` update |
| `GET /dashboard/timeseries` | `dashapi.GetTimeseries` (**main**) | `klynx-feature /biDash` | REST |

### Projection Stores

| Projection | Store | Consumer | Notes |
|---|---|---|---|
| Camera monitor status history | `klynx-api.camera_monitor_status_history` | `dashsvc.GetTimeseries` | one row per transition |
| Kcontrol status history | `klynx-api.kcontrol_status_history` | `dashsvc.GetTimeseries` | one row per transition |

---

## 3. Compatibility and Policy

### Backward Compatibility

- Compatibility status: **additive across both phases**. No breaking change between Phase 1 (alerts/pedestrian/notifications/blacklist) and Phase 2 (camera/kcontrol device state).
- Consumer requirements: none — FE may call any metric in the enum at any time.
- Pre-backfill behavior: device-state metrics return HTTP 200 with empty `series` if no history rows exist in range. There is no 400 for "feature not yet enabled".
- Deprecation window: n/a.

### Binary Deploy Order

Backend is split across two binaries. Ship in this order so history rows accumulate before the endpoint is widely used:

1. Deploy **commonmon** first — camera history writers live here.
2. Deploy **main** second — kcontrol history writer + extended `/dashboard/timeseries` metric enum live here.
3. Run the one-shot backfill (`cmd/backfill-device-status-history` or admin endpoint) after both are live.
4. FE may roll out at any time; the endpoint always returns HTTP 200 with (possibly empty) series for known metrics.

### Replay / Re-sync Behavior

- Read-only at the API surface (no replay needed for the endpoint itself).
- Repo-level: re-running `commonmonsvc.HandleKctrlStatusChanged` with the same input is idempotent via the history unique index. `kctrlstatushistrepo.Append` same.
- Re-sync trigger: re-run the backfill script.
- Duplicate handling: absorbed by unique index; no merge logic needed.

### Write Authority Policy

- `camera_monitor_status` is the authoritative current-state store. History is a projection.
- `kctrl` is the authoritative kcontrol current-state store. History is a projection.
- No external writer is allowed to append to either history collection.
- The `ata_events` collection is read-only for this contract.

---

## 4. Surface Summary

| Type | Name | Method / Topic / Key | Auth / Trust | Producer / Handler | Consumer / Caller |
|---|---|---|---|---|---|
| REST | `/dashboard/timeseries` | `GET` | `BearerAuth + X-Active-Org` | `dashapi.GetTimeseries` | `klynx-feature /biDash` |

---

## 5. REST Surfaces

### 5.1 `Dashboard Timeseries`

**Endpoint:** `/dashboard/timeseries`
**Method:** `GET`
**Auth:** `Authorization: Bearer <jwt>` + `X-Active-Org: <orgId>`
**Purpose:** Return a time-bucketed series for one dashboard metric, suitable for direct rendering into an ApexCharts `line` / `area` / `spline` config. Single response shape across all metrics.

#### Path Params

| Field | Type | Required | Description |
|---|---|---|---|
| — | — | — | — |

#### Query Params

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `metric` | string | yes | — | One of the enum below (Phase 1 + Phase 2 combined) |
| `dateTime` | string | yes | — | `from,to` range; RFC3339 or `YYYY-MM-DD` |
| `tz` | string | no | `Asia/Bangkok` | IANA timezone |
| `groupBy` | string | no | auto | `hour` \| `day` \| `month` |
| `limit` | int | no | `10` | For `notifications.byType`: cap series count (top-N + "other") |

#### `metric` enum — full canonical list

##### Phase 1 — `ata_events`-backed metrics

Each metric is backed by an exact filter against `ata_events`. Filters match the discriminators used by `internal/services/dashsvc/events.go`, so FE and BE share the same event vocabulary. Where snapshot behavior intentionally differs, it is called out explicitly.

| Value | Canonical filter on `ata_events` | Bucket key | Series name(s) |
|---|---|---|---|
| `alerts.face` | `isDeleted != true` AND `type == "Face Capture"` | `dateTimeCreate` | `face` |
| `alerts.vehicle` | `isDeleted != true` AND `type =~ /Vehicle/i` (case-insensitive regex) | `dateTimeCreate` | `vehicle` |
| `alerts.total` | `isDeleted != true` AND (`alerts.face` filter OR `alerts.vehicle` filter) — **union of face and vehicle only** | `dateTimeCreate` | `total` |
| `pedestrian.in` | `isDeleted != true` AND `type == "Pedestrian Traffic Statistics"` AND `"in" ∈ regionNames` | `dateTimeCreate` | `in` |
| `pedestrian.out` | `isDeleted != true` AND `type == "Pedestrian Traffic Statistics"` AND `"out" ∈ regionNames` | `dateTimeCreate` | `out` |
| `notifications.byType` | `isDeleted != true` AND (`type != "Face Capture"` OR `eventAttribute.listType == 0` OR `eventAttribute.listType` does not exist) | `dateTimeCreate`, grouped by `type` | one series per `type`; top-N by total + `"other"` |
| `blacklist.total` | `isDeleted != true` AND `type == "Face Capture"` AND `eventAttribute.listType != 0` | `dateTimeCreate` | `blacklist` |

**`alerts.total` is deliberately narrower than `/dashboard`'s `details.Event.Total`.** The snapshot's `Event.Total` (`events.go:152`) is a count of **all** `ata_events` in range — every type, including pedestrian, notifications, blacklist. That is the wrong meaning for the Alerts card. The chart's `alerts.total` is instead the sum line that matches what the Alerts card displays: face + vehicle. Callers must not use `alerts.total` as a proxy for "all events in range".

**Acknowledgement handling.** The `/dashboard` snapshot filters `notifications` and `blacklist` to `acknowledged != true` and caps the result at 5 rows. The time-series chart deliberately **drops** the `acknowledged` filter so it answers "how much is happening over time" (event volume) rather than "what needs attention right now" (queue depth). Do not expect sums to match.

**Face / blacklist overlap.** `alerts.face` includes events with `eventAttribute.listType != 0`, so those same events also count in `blacklist.total`. This is deliberate and matches the snapshot: a listType-match face event is both an alert and a blacklist hit.

##### Phase 2 — Camera monitor metrics (source: `camera_monitor_status_history.state`)

Enum: `online | offline | suspect | unknown`. Counts cameras whose **most recent history row with `transitionAt ≤ bucket_end`** has the matching state.

| Value | Series name(s) | Meaning |
|---|---|---|
| `camera.online` | `online` | count of cameras whose most recent history row at bucket end has `state == "online"` |
| `camera.offline` | `offline` | same with `state == "offline"` |
| `camera.byState` | `online`, `offline`, `suspect`, `unknown` | 4-series split across all camera-monitor states |
| `camera.byOwnership` | see "ownership bucket mapping" below | multi-series split by (ownership × state) |

##### Phase 2 — Kcontrol metrics (source: `kcontrol_status_history.status`)

Enum: `online | warning | offline`.

| Value | Series name(s) | Meaning |
|---|---|---|
| `kcontrol.online` | `online` | count of kcontrols whose most recent history row at bucket end has `status == "online"` |
| `kcontrol.offline` | `offline` | same with `status == "offline"` |
| `kcontrol.byState` | `online`, `warning`, `offline` | 3-series split across all kcontrol states |

##### Ownership bucket mapping for `camera.byOwnership`

The mapping **exactly matches** the existing `/dashboard` snapshot rules in `internal/services/dashsvc/events.go:290-358`. Do not reinterpret.

Given the active org `A = X-Active-Org`:

| Camera condition | Bucket |
|---|---|
| `camera.orgId == A` (regardless of `MapVisibility` — includes `inherit`, `forcePrivate`, `forcePublic`) | `owner` |
| `camera.orgId != A` AND `MapVisibility IN ("public", "forcePublic")` | `public` |
| `camera.orgId != A` AND `MapVisibility IN ("inherit", "forcePrivate", "private")` or any other value | **excluded** (not counted in this chart) |

The `owner` and `public` buckets are disjoint because the `orgId` filter is mutually exclusive.

Series emitted for `camera.byOwnership`:

```
owner.online, owner.offline, owner.suspect, owner.unknown,
public.online, public.offline, public.suspect, public.unknown
```

State values come from camera-monitor history (4-state enum). Cross-org cameras not meeting the `public` condition contribute to **none** of the series.

**Deliberate deviation from `/dashboard` snapshot.** The snapshot derives online/offline from `camera.status` (bool — 2-state). The chart intentionally uses `camera_monitor_status.state` (4-state). Consequences:

- The chart's `*.online` count is not guaranteed to equal the snapshot's online count for the same instant. A camera reporting `suspect` or `unknown` is counted in `*.suspect` / `*.unknown` here, but as whatever its last boolean flip was in the snapshot.
- This is the correct behavior for a time-series chart. FE release notes should explain the discrepancy.
- Moving the snapshot itself to the 4-state view is a separate contract change; out of scope here.

##### Pre-rollout / pre-backfill behavior

**Single rule:** if the `metric` is in the enum, the response is **always** HTTP 200 with the standard envelope. If no rows exist in the requested range, `series` is returned as an empty array (or with all-zero data, at the backend's discretion), and `categories` still reflects the requested range. There is no 400 for "feature not yet enabled" and no `warning` metadata field. FE treats empty series the same as "no data in range".

Invalid `metric` values return HTTP 400 with the standard error body and the full enum in the message.

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

For `camera.byOwnership` series follow `{ownership}.{state}` format — see §5.1 ownership mapping for the 8-series shape.

For `kcontrol.byState`:

```json
"series": [
  { "name": "online",  "data": [60, 58, 59, 60, 61, 60, 62] },
  { "name": "warning", "data": [ 1,  3,  2,  1,  0,  1,  0] },
  { "name": "offline", "data": [ 2,  2,  2,  2,  2,  2,  1] }
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
| `details.chart.type` | string | always `line` in v1 |
| `details.chart.categories[]` | string[] | bucket labels (local tz) |
| `details.chart.series[].name` | string | series label |
| `details.chart.series[].data[]` | int64[] | count per bucket (0-filled for gaps) |

#### Error Contract

| HTTP | Code | Meaning | Consumer Handling |
|---|---|---|---|
| `400` | `BAD_REQUEST` | Missing/invalid `dateTime`, invalid `metric`, invalid `groupBy` | Show validation error; do not retry |
| `401` | `UNAUTHORIZED` | Missing/invalid bearer | Re-authenticate |
| `500` | `INTERNAL_SERVER_ERROR` | Repo/aggregation failure | Show generic error; retry allowed |

400 is returned **only** for unknown metric names or invalid range. It is never returned because backfill has not run or because a collection is empty.

#### Error Example

```json
{
  "code": "BAD_REQUEST",
  "status": false,
  "message": "metric must be one of: alerts.face, alerts.vehicle, alerts.total, pedestrian.in, pedestrian.out, notifications.byType, blacklist.total, camera.online, camera.offline, camera.byState, camera.byOwnership, kcontrol.online, kcontrol.offline, kcontrol.byState"
}
```

---

## 6. Kafka / Async Event Surfaces

`N/A — not in scope.` This contract is REST-only. The existing `kcontrol.statusChanged` Kafka topic that drives the kcontrol history append is a private internal transport owned by klynx-api and documented in code; no cross-repo consumer reads it.

---

## 7. MQTT / Realtime Surfaces

`N/A — not in scope.` Real-time push for the dashboard is deferred (Phase 3c per `phase3-dashboard-videowall.md`); v1 polls the REST endpoint.

---

## 8. Redis / Cache Surfaces

`N/A — not in scope.` No cross-service-visible Redis behavior in this contract. Internal caching, if any, is a service-private optimization.

---

## 9. Sync / Field-Ownership Surfaces

### 9.1 Canonical and Projection Mapping

**Canonical Stores**

- `klynx-api.camera_monitor_status` — single row per camera (current state).
- `klynx-api.kctrl` — single row per device (current kcontrol status).

**Projection Stores (read by this contract)**

- `klynx-api.camera_monitor_status_history` — append-only transition log.
- `klynx-api.kcontrol_status_history` — append-only transition log.

**Field Mapping**

| Canonical Source | Projection Field | Notes |
|---|---|---|
| `camera_monitor_status.cameraId` | `camera_monitor_status_history.cameraId` | |
| `camera_monitor_status.orgId` | `camera_monitor_status_history.orgId` | snapshot at transition time |
| `camera_monitor_status.state` | `camera_monitor_status_history.state` | enum `online\|offline\|suspect\|unknown` |
| `camera_monitor_status.prevState` | `camera_monitor_status_history.prevState` | may be empty on baseline |
| `camera_monitor_status.transitionAt` | `camera_monitor_status_history.transitionAt` | UTC |
| `camera_monitor_status.reasonCode` / `decisionSource` (optional) | `camera_monitor_status_history.*` | informational |
| `kctrl.deviceId` | `kcontrol_status_history.deviceId` | |
| `kctrl.orgId` | `kcontrol_status_history.orgId` | |
| `kctrl.status` (new value) | `kcontrol_status_history.status` | enum `online\|warning\|offline` |
| (previous value before transition) | `kcontrol_status_history.prevStatus` | empty on baseline |
| `kctrl.LastStatusChange` (or emit time) | `kcontrol_status_history.transitionAt` | UTC |

**Ownership join for `camera.byOwnership`**

At query time `dashsvc.GetTimeseries` joins `camera_monitor_status_history` with the `camera` projection to resolve `orgId` and `MapVisibility`. The join uses `cameraId`. Implications:

- Changes to `camera.MapVisibility` after the transition are reflected in current-bucket counts (latest ownership, not ownership at transition time). Matches `/dashboard` snapshot semantics.
- A camera deleted from the `camera` projection disappears from both `owner` and `public` series.

### 9.2 Field Ownership

| Field | Authoritative Writer | Allowed Initiator | Stored In | Notes |
|---|---|---|---|---|
| `camera_monitor_status.*` | commonmon binary (`probeOrchestrator.go:255`, `kctrlBridge.go:160`) | probe + kcontrol bridge | `klynx-api.camera_monitor_status` | current state |
| `camera_monitor_status_history.*` | commonmon binary (same two sites) | same | `klynx-api.camera_monitor_status_history` | insert-only |
| `kctrl.status` | main binary (`kctrlsvc/handleStatusChanged.go:33`) | `kcontrol.statusChanged` consumer | `klynx-api.kctrl` | current state |
| `kcontrol_status_history.*` | main binary (same site) | same | `klynx-api.kcontrol_status_history` | insert-only |

No external writers. The `kcontrol.statusChanged` Kafka topic is consumed independently by both binaries but this contract does not speak for it.

### 9.3 Idempotency

| Collection | Unique index | Retry behavior |
|---|---|---|
| `camera_monitor_status_history` | `(cameraId, transitionAt, state)` | duplicate insert → no-op |
| `kcontrol_status_history` | `(deviceId, transitionAt, status)` | duplicate insert → no-op |

### 9.4 Conflict Resolution

- The append sites are independent across binaries; no cross-binary conflict can occur because each writer owns a distinct collection (commonmon writes camera history; main writes kcontrol history).
- Same-collection conflicts are resolved by the unique index → duplicate insert → no-op. No merge logic is needed.

---

## 10. Frontend Integration Notes

### Required FE Inputs

| FE Use Case | Contract Surface | Required Fields | Notes |
|---|---|---|---|
| `/biDash` Alerts card (chart mode) | `GET /dashboard/timeseries` | `metric=alerts.face` + `metric=alerts.vehicle` (two calls) or `metric=alerts.total` | Render 2-series line |
| `/biDash` Pedestrian card (chart mode) | `GET /dashboard/timeseries` | `metric=pedestrian.in` + `metric=pedestrian.out` | Render 2-series line |
| `/biDash` Notifications card (chart mode) | `GET /dashboard/timeseries` | `metric=notifications.byType`, optional `limit` | Multi-series line |
| `/biDash` Blacklist card (chart mode) | `GET /dashboard/timeseries` | `metric=blacklist.total` | Single-series line |
| `/biDash` Camera Ownership (chart mode) | `GET /dashboard/timeseries` | `metric=camera.byOwnership` + `dateTime` + optional `groupBy` | 8-series line |
| `/biDash` Device Status (chart mode) | `GET /dashboard/timeseries` | `metric=kcontrol.byState` OR `metric=kcontrol.online`+`metric=kcontrol.offline` | Pick one per card; `byState` is one round trip |
| `/biDash` Camera Ownership / Device cards (stats mode) | (none — reuse `/dashboard` snapshot) | snapshot counts | Render donut from existing snapshot |
| `/biDash` Weather card | (none — external) | existing forecast | Render spline from `useWeather()` |

### Example FE Payload Mapping

| FE Field | Backend Field | Direction | Notes |
|---|---|---|---|
| `dateRange` picker | `dateTime` | request | `from,to` |
| Camera Ownership chart | `metric=camera.byOwnership` | request | series names follow `{ownership}.{state}` |
| Device Status chart | `metric=kcontrol.byState` | request | |
| ApexCharts `options.xaxis.categories` | `details.chart.categories` | response | direct copy |
| ApexCharts `series[].name` | `details.chart.series[].name` | response | |
| ApexCharts `series[].data` | `details.chart.series[].data` | response | |

### FE Guardrails

- Do not call unknown metrics — backend returns 400.
- Do not cache responses longer than the selected range; user may change the date picker.
- On chart-mode toggle, show a loading skeleton while the request is in flight.
- Respect the contract's pagination of `notifications.byType` (top-N + "other"); do not attempt to fetch all types.
- Do not attempt to map kcontrol `warning` → "suspect" on the client. The two enums are contractually distinct.
- Empty `series` means "no data in range" — render the standard "no data" caption; do not branch on rollout state.
- Do not rely on ownership-at-transition; the chart reflects current ownership (latest `MapVisibility`).

---

## 11. Rollout Notes

| Repo / Binary | Dependency | Required Before | Notes |
|---|---|---|---|
| `klynx-api` — `cmd/commonmon` | camera history writers at two sites (`probeOrchestrator.go:255`, `kctrlBridge.go:160`) | before running backfill | deploy first |
| `klynx-api` — `main` | kcontrol history writer (`kctrlsvc/handleStatusChanged.go:33`) + `/dashboard/timeseries` metric enum + read-side aggregation | before FE switches card metric | deploy second |
| `klynx-api` — `cmd/backfill-device-status-history` | seeds baseline rows per camera/kcontrol | before FE relies on pre-rollout coverage | one-shot; safe to re-run |
| `klynx-feature` | metric name swap on `/biDash` | at any time after main ships | response stays HTTP 200 whether or not history has data |

**Status:** All three binaries shipped 2026-04 (Phase 1 + Phase 2). Backfill executed. FE consumes both metric families in production.

---

## 12. Examples

### Example REST Request — Phase 1 (alerts.face)

```
GET /dashboard/timeseries?metric=alerts.face&dateTime=2026-04-14,2026-04-21&tz=Asia/Bangkok&groupBy=day
Authorization: Bearer <jwt>
X-Active-Org: <orgId>
```

### Example REST Request — Phase 2 (camera.byOwnership)

```
GET /dashboard/timeseries?metric=camera.byOwnership&dateTime=2026-04-14,2026-04-21&tz=Asia/Bangkok&groupBy=day
Authorization: Bearer <jwt>
X-Active-Org: <orgId>
```

### Example Success Response

See §5.1 for the canonical response shape. Both Phase 1 and Phase 2 metrics return the same envelope.

### Example Empty Response — metric known, no history yet

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
    "metric": "camera.byOwnership",
    "chart": {
      "type":       "line",
      "categories": ["2026-04-14", "2026-04-15", "...", "2026-04-20"],
      "series":     []
    }
  }
}
```

### Example Error — unknown metric

```json
{
  "code": "BAD_REQUEST",
  "status": false,
  "message": "metric must be one of: alerts.face, alerts.vehicle, alerts.total, pedestrian.in, pedestrian.out, notifications.byType, blacklist.total, camera.online, camera.offline, camera.byState, camera.byOwnership, kcontrol.online, kcontrol.offline, kcontrol.byState"
}
```

---

## 13. Smoke Checklist

### Contract-Read Smoke

- [x] Happy path can be followed from metric selection to `GET /dashboard/timeseries` response rendering.
- [x] Unknown metric failure path is documented (`400 BAD_REQUEST` with canonical metric list).
- [x] Empty history / pre-rollout path is documented (`200 SUCCESS` with empty `series`).
- [x] Kafka / MQTT / Redis behavior is explicitly `N/A` for this read-only REST contract.
- [x] FE fallback for empty series and chart loading behavior is documented.

### Runtime Smoke

| Case | Surface | Expected Result | Evidence |
|---|---|---|---|
| Phase 1 metric | `GET /dashboard/timeseries?metric=alerts.face...` | `200 SUCCESS`, chart envelope | Existing production behavior; examples in §12 |
| Phase 2 metric | `GET /dashboard/timeseries?metric=camera.byOwnership...` | `200 SUCCESS`, chart envelope; empty `series` allowed | Existing production behavior; examples in §12 |
| Unknown metric | `GET /dashboard/timeseries?metric=unknown...` | `400 BAD_REQUEST` with canonical metric list | Error contract §5.1 |

---

## 14. Checklist

- [x] Domain / flow boundary explicit (§0 — single endpoint, all metrics; explicit excluded surfaces).
- [x] Owner backend explicit (klynx-api).
- [x] System of record per domain (`ata_events`, `camera_monitor_status`, `kctrl`, plus history projections).
- [x] Canonical store and projection store documented.
- [x] Producers and consumers listed for every surface in scope.
- [x] REST request, response, and error contracts defined (full unified metric enum).
- [x] Kafka N/A — explained.
- [x] MQTT N/A — explained.
- [x] Redis N/A — explained.
- [x] Field ownership explicit for projections (history collections).
- [x] Backward compatibility documented (additive Phase 1 + Phase 2).
- [x] Replay / re-sync behavior documented (idempotent inserts via unique index, backfill runnable).
- [x] FE field mapping included.
- [x] Smoke checklist is included and runnable for this domain/flow.
- [x] Pre-rollout behavior unified (single rule: always 200 for known metrics).
