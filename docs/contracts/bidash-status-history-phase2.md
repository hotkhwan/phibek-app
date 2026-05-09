# biDash Status History Infrastructure — Phase 2 Contract

**Date:** 2026-04-21
**Status:** Superseded by [`dashboard-timeseries.md`](./dashboard-timeseries.md) on 2026-05-04 — Phase 1 (`alerts.*`, `pedestrian.*`, `notifications.byType`, `blacklist.total`) and Phase 2 (`camera.*`, `kcontrol.*`) merged into one canonical contract per the new domain/flow grouping rule (`docs/contracts/README.md`). Kept here for PR / consumer history.
**Owner Backend:** `klynx-api`
**Related Plan:** [docs/plan/bidash-status-history-phase2.md](../plan/bidash-status-history-phase2.md)
**Applies To Repos:** `klynx-api`, `klynx-feature`
**Contract Type:** `REST`
**Version:** `v1`
**Supersedes previous revision:** the earlier rev that proposed a new `gw.device.status.v1` Kafka topic produced by gateway-api. This rev uses the existing internal klynx-api pipeline and the actual per-domain canonical stores; no gateway-api involvement.

---

## 1. Purpose

Publishes the new metric values added to the existing `GET /dashboard/timeseries` endpoint so the `/biDash` Camera Ownership and Device Status cards can render time-series charts. All state transitions originate inside klynx-api; the contract is REST-only.

---

## 2. Ownership

### Owner Backend

- `klynx-api` — producer, consumer, writer, and query.

### Domain System of Record

| Domain | System of Record | Canonical Store | Notes |
|---|---|---|---|
| Camera identity (`orgId`, `MapVisibility`, `Revision`) | `gateway-api/device_management`, projected into `klynx-api.camera` | `klynx-api.camera` | read-only in Phase 2 |
| Camera monitor current state | `klynx-api.camera_monitor_status` | single-row-per-camera; `state ∈ {online, offline, suspect, unknown}` | klynx-api local evaluation, not a gw mirror |
| Kcontrol current status | `klynx-api.kctrl` | `status ∈ {online, warning, offline}` | |
| Camera monitor status history (new) | `klynx-api.camera_monitor_status_history` | append-only transition log | projection |
| Kcontrol status history (new) | `klynx-api.kcontrol_status_history` | append-only transition log | projection |

### Producer / Consumers

Binary is labelled because klynx-api runs as two separate processes: `main` (API, dashboard endpoint, kctrl consumer that writes `kctrl`) and `cmd/commonmon` (probe orchestrator + kctrl bridge that write `camera_monitor_status`).

| Surface | Producer (binary) | Consumers (binary) | Notes |
|---|---|---|---|
| `camera_monitor_status_history` append | `commonmonsvc/probeOrchestrator.go:255` **and** `commonmonsvc/kctrlBridge.go:160` (**commonmon**) | `dashsvc.GetTimeseries` (**main**) | no shared helper — both writer sites instrumented independently; both appends happen in the same commonmon process as the corresponding `camera_monitor_status` upsert |
| `kcontrol_status_history` append | `kctrlsvc.HandleStatusChanged` (**main**) | `dashsvc.GetTimeseries` (**main**) | append happens in the same main process as the `kctrl` update |
| `GET /dashboard/timeseries` (extended) | `dashapi` (**main**) | `klynx-feature /biDash` | REST |

### Projection Stores

| Projection | Store | Consumer | Notes |
|---|---|---|---|
| Camera monitor status history | `klynx-api.camera_monitor_status_history` | `dashsvc.GetTimeseries` | one row per transition |
| Kcontrol status history | `klynx-api.kcontrol_status_history` | `dashsvc.GetTimeseries` | one row per transition |

---

## 3. Compatibility and Policy

### Backward Compatibility

- Compatibility status: **additive**. No Phase 1 metric semantics or response shape changes.
- Consumer requirements: none. FE may call the new metrics at any time; before backfill, results are empty series (HTTP 200).
- Deprecation window: n/a.

### Binary Deploy Order (klynx-api runs two binaries)

The backend is split across `main` and `cmd/commonmon` processes. Ship in this order so history rows start accumulating before the endpoint is widely used:

1. Deploy **commonmon** first — new camera history writers live here.
2. Deploy **main** second — new kcontrol history writer **and** the extended `/dashboard/timeseries` metric enum live here.
3. Run the one-shot backfill (either `cmd/backfill-device-status-history` or an admin endpoint) after both are live.

FE may roll out at any time; the endpoint always returns HTTP 200 with (possibly empty) series.

### Replay / Re-sync Behavior

- Replay supported at the repo level: re-running `commonmonsvc.HandleKctrlStatusChanged` with the same input is idempotent via the history unique index. `kctrlstatushistrepo.Append` same.
- Re-sync trigger: re-run the backfill script.
- Duplicate handling: absorbed by unique index; no merge logic needed.

### Write Authority Policy

- `camera_monitor_status` remains the authoritative current-state store. History is a projection.
- `kctrl` remains the authoritative kcontrol current-state store. History is a projection.
- No external writer is allowed to append to either history collection.

---

## 4. Surface Summary

| Type | Name | Method | Auth | Producer / Handler | Consumer |
|---|---|---|---|---|---|
| REST | `/dashboard/timeseries` (extended) | `GET` | `BearerAuth + X-Active-Org` | `dashapi.GetTimeseries` | `klynx-feature /biDash` |

---

## 5. REST Contract

### 5.1 Dashboard Timeseries — New Metric Values

**Endpoint:** `/dashboard/timeseries` (same as Phase 1)
**Method:** `GET`
**Auth:** `BearerAuth + X-Active-Org` (same)
**Purpose:** Return time-bucketed device counts sampled at end-of-bucket using the new history projections. Answers "how many cameras/kcontrols were in state X at the end of each bucket within the requested range".

#### Path Params

| Field | Type | Required | Description |
|---|---|---|---|
| — | — | — | — |

#### Query Params

Same as Phase 1. Only the `metric` enum is extended.

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `metric` | string | yes | — | Phase 1 values **plus** the new Phase 2 values below |
| `dateTime`, `tz`, `groupBy`, `limit` | — | — | — | same as Phase 1 |

#### New `metric` values (Phase 2)

Taxonomy is **per-domain** — the two domains use different enums matching the actual evaluator outputs.

##### Camera monitor (source: `camera_monitor_status_history.state`)

Enum: `online | offline | suspect | unknown`.

| Value | Series name(s) | Meaning |
|---|---|---|
| `camera.online` | `online` | count of cameras whose most recent history row with `transitionAt ≤ bucket_end` has `state == "online"` |
| `camera.offline` | `offline` | same with `state == "offline"` |
| `camera.byState` | `online`, `offline`, `suspect`, `unknown` | 4-series split across all camera-monitor states |
| `camera.byOwnership` | see "ownership bucket mapping" below | multi-series split by (ownership × state) |

##### Kcontrol raw (source: `kcontrol_status_history.status`)

Enum: `online | warning | offline`.

| Value | Series name(s) | Meaning |
|---|---|---|
| `kcontrol.online` | `online` | count of kcontrols whose most recent history row with `transitionAt ≤ bucket_end` has `status == "online"` |
| `kcontrol.offline` | `offline` | same with `status == "offline"` |
| `kcontrol.byState` | `online`, `warning`, `offline` | 3-series split across all kcontrol states |

#### Ownership bucket mapping for `camera.byOwnership`

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

State values come from the camera-monitor history (4-state enum). Cross-org cameras not meeting the `public` condition contribute to **none** of the series — this matches the current snapshot behavior.

**Deliberate deviation from `/dashboard` snapshot.** The `/dashboard` snapshot currently derives online/offline from `camera.status` (bool) — a 2-state view (`events.go:304,309-312,325,339`). The chart intentionally uses `camera_monitor_status.state` (4-state: `online|offline|suspect|unknown`) instead. Consequences for callers:

- The chart's `*.online` count is not guaranteed to equal the snapshot's online count for the same instant. A camera that reports `suspect` or `unknown` on the probe is counted in `*.suspect` / `*.unknown` in the chart, but counted in the 2-state bool as whatever its last boolean flip was.
- This is the correct behavior for a time-series chart: the probe evaluation is more accurate, and the richer taxonomy was never wired into the snapshot. FE release notes should explain the discrepancy.
- If future work moves the snapshot itself to the 4-state view, that is a separate contract change; it is out of scope here.

#### Pre-rollout / pre-backfill behavior

**Single rule:** if the `metric` is in the enum, the response is **always** HTTP 200 with a `TimeseriesChart` envelope. If no history rows exist in the requested range, `series` is returned as an empty array (or with all-zero data, at the backend's discretion), and `categories` still reflects the requested range. There is no 400 for "feature not yet enabled" and no `warning` metadata field. FE treats empty series the same as "no data in range".

Invalid `metric` values return HTTP 400 with the standard error body.

#### Request Headers

Same as Phase 1.

#### Request Body

Not applicable.

#### Success Response

Same shape as Phase 1. Example for `camera.byOwnership` over a 7-day range:

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
      "series": [
        { "name": "owner.online",   "data": [42, 44, 43, 45, 45, 44, 46] },
        { "name": "owner.offline",  "data": [ 3,  1,  2,  0,  0,  1,  0] },
        { "name": "owner.suspect",  "data": [ 0,  1,  0,  0,  0,  2,  0] },
        { "name": "owner.unknown",  "data": [ 0,  0,  0,  0,  0,  0,  1] },
        { "name": "public.online",  "data": [17, 18, 18, 18, 19, 19, 19] },
        { "name": "public.offline", "data": [ 1,  0,  0,  1,  0,  0,  1] },
        { "name": "public.suspect", "data": [ 0,  0,  0,  0,  0,  0,  0] },
        { "name": "public.unknown", "data": [ 0,  0,  0,  0,  0,  0,  0] }
      ]
    }
  }
}
```

Example for `kcontrol.byState`:

```json
"series": [
  { "name": "online",  "data": [60, 58, 59, 60, 61, 60, 62] },
  { "name": "warning", "data": [ 1,  3,  2,  1,  0,  1,  0] },
  { "name": "offline", "data": [ 2,  2,  2,  2,  2,  2,  1] }
]
```

#### Success Field Definitions

Same as Phase 1.

#### Error Contract

| HTTP | Code | Meaning | Consumer Handling |
|---|---|---|---|
| `400` | `BAD_REQUEST` | `metric` not in the enum | show validation error; do not retry |
| `401` | `UNAUTHORIZED` | same as Phase 1 | re-auth |
| `500` | `INTERNAL_SERVER_ERROR` | aggregation failure | retry allowed |

**Note:** 400 is returned **only** for unknown metric names. It is never returned because backfill has not run or because the collection is empty. Those cases return 200 with empty series.

#### Error Example

```json
{
  "code": "BAD_REQUEST",
  "status": false,
  "message": "metric must be one of: alerts.face, alerts.vehicle, alerts.total, pedestrian.in, pedestrian.out, notifications.byType, blacklist.total, camera.online, camera.offline, camera.byState, camera.byOwnership, kcontrol.online, kcontrol.offline, kcontrol.byState"
}
```

---

## 6. Event Contract

Not applicable — Phase 2 uses no new Kafka topic. The existing `kcontrol.statusChanged` topic is out of scope for this contract; it is a private internal transport owned by klynx-api and documented in code.

---

## 7. Canonical and Projection Mapping

### Canonical Stores

- Camera monitor current: `klynx-api.camera_monitor_status` — single row per camera.
- Kcontrol current: `klynx-api.kctrl` — single row per device.

### Projection Stores

- `klynx-api.camera_monitor_status_history` — append-only transition log.
- `klynx-api.kcontrol_status_history` — append-only transition log.

### Field Mapping

| Canonical Source | Projection Field | Notes |
|---|---|---|
| `camera_monitor_status.cameraId` | `camera_monitor_status_history.cameraId` | |
| `camera_monitor_status.orgId` | `camera_monitor_status_history.orgId` | snapshot at transition time |
| `camera_monitor_status.state` | `camera_monitor_status_history.state` | enum `online\|offline\|suspect\|unknown` |
| `camera_monitor_status.prevState` | `camera_monitor_status_history.prevState` | may be empty on baseline |
| `camera_monitor_status.transitionAt` | `camera_monitor_status_history.transitionAt` | UTC |
| `camera_monitor_status.reasonCode` / `decisionSource` (optional) | `camera_monitor_status_history.*` (carried through) | informational |
| `kctrl.deviceId` | `kcontrol_status_history.deviceId` | |
| `kctrl.orgId` | `kcontrol_status_history.orgId` | |
| `kctrl.status` (new value) | `kcontrol_status_history.status` | enum `online\|warning\|offline` |
| (previous value before transition) | `kcontrol_status_history.prevStatus` | empty on baseline |
| `kctrl.LastStatusChange` (or the time of emit) | `kcontrol_status_history.transitionAt` | UTC |

### Ownership join for `camera.byOwnership`

At query time `dashsvc.GetTimeseries` joins `camera_monitor_status_history` with the `camera` projection to resolve `orgId` and `MapVisibility` for the active request. The join uses `cameraId`. This means:

- Changes to `camera.MapVisibility` after the transition are reflected in current-bucket counts (latest ownership, not ownership at transition time). This matches `/dashboard` snapshot semantics.
- A camera deleted from the `camera` projection disappears from both `owner` and `public` series.

---

## 8. Field Ownership

See section 7 of the plan for the full matrix. Short form, with binaries:

- `camera_monitor_status.*` and `camera_monitor_status_history.*` are both written by the **commonmon** binary at two sites: `commonmonsvc/probeOrchestrator.go:255` (probe-driven) and `commonmonsvc/kctrlBridge.go:160` (kcontrol bridge). The history is insert-only.
- `kctrl.status` and `kcontrol_status_history.*` are both written by the **main** binary at `kctrlsvc/handleStatusChanged.go:33`. The history is insert-only.
- No external writers. `kcontrol.statusChanged` Kafka topic is consumed independently by both binaries but this contract does not speak for it.

### Idempotency

| Collection | Unique index | Retry behavior |
|---|---|---|
| `camera_monitor_status_history` | `(cameraId, transitionAt, state)` | duplicate insert → no-op |
| `kcontrol_status_history` | `(deviceId, transitionAt, status)` | duplicate insert → no-op |

---

## 9. Frontend Integration Notes

### Required FE Inputs

| FE Use Case | Contract Surface | Required Fields | Notes |
|---|---|---|---|
| `/biDash` Camera Ownership (chart mode) | `GET /dashboard/timeseries` | `metric=camera.byOwnership` + `dateTime` + optional `groupBy` | 8-series line |
| `/biDash` Device Status (chart mode) | `GET /dashboard/timeseries` | `metric=kcontrol.byState` OR `metric=kcontrol.online`+`metric=kcontrol.offline` | pick one per card; `byState` is one round trip |

### Example FE Payload Mapping

| FE Field | Backend Field | Direction | Notes |
|---|---|---|---|
| Camera Ownership chart | `metric=camera.byOwnership` | request | series names follow `{ownership}.{state}` |
| Device Status chart | `metric=kcontrol.byState` | request | |

### FE Guardrails

- Do not attempt to map kcontrol `warning` → "suspect" on the client. The two enums are contractually distinct.
- Empty series means "no data in range" — render the Phase 1 "no data" caption; do not branch on rollout state.
- Do not rely on ownership-at-transition; the chart reflects current ownership.

---

## 10. Rollout Notes

| Repo / Binary | Dependency | Required Before | Notes |
|---|---|---|---|
| `klynx-api` — `cmd/commonmon` | camera history writers at two sites (`probeOrchestrator.go:255`, `kctrlBridge.go:160`) | before running backfill | deploy first |
| `klynx-api` — `main` | kcontrol history writer (`kctrlsvc/handleStatusChanged.go:33`) + `/dashboard/timeseries` metric enum + read-side aggregation | before FE switches card metric | deploy second |
| `klynx-api` — `cmd/backfill-device-status-history` | seeds baseline rows per camera/kcontrol | before FE relies on pre-rollout coverage | one-shot; safe to re-run |
| `klynx-feature` | metric name swap on `/biDash` | at any time after main ships | response stays HTTP 200 whether or not history has data |

---

## 11. Examples

### Example Request — camera.byOwnership

```
GET /dashboard/timeseries?metric=camera.byOwnership&dateTime=2026-04-14,2026-04-21&tz=Asia/Bangkok&groupBy=day
Authorization: Bearer <jwt>
X-Active-Org: <orgId>
```

### Example Response

See section 5.1.

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

## 12. Checklist

- [x] Owner backend is explicit (klynx-api only).
- [x] System of record defined by domain using the actual canonical stores in code.
- [x] Canonical stores and projection stores documented.
- [x] Producers and consumers listed — all internal.
- [x] Request, response, and error contracts defined.
- [x] Event contract n/a (no new topics).
- [x] Field ownership explicit for synchronized fields.
- [x] Backward compatibility documented (additive).
- [x] Replay / re-sync behavior documented.
- [x] FE field mapping included.
- [x] Pre-rollout behavior unified (single rule: always 200 for known metrics).
