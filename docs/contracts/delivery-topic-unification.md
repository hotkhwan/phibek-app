# Delivery Topic Unification Contract

**Date:** 2026-04-21
**Status:** Draft (authored for Phase-0 gate of plan r2)
**Owner Backend:** `gateway-api`
**Related Plan:** [docs/plan/delivery-topic-unification.md](../plan/delivery-topic-unification.md) (r2 compressed rollout for test env)
**Applies To Repos:** `gateway-api`, `klynx-api`
**Contract Type:** `Kafka + internal Go adapter`
**Version:** `v1` (covers Phase-A through Phase-E of r2)

---

## 1. Purpose

Delivery dispatch on `gateway-api.deliverycons` migrates from the stripped `normalized.events` topic to the canonical `gw.events.normalized.v1`. This contract documents:

- The single authoritative wire shape (`eventschema.NormalizedEvent`).
- The internal adapter that lets existing `ingestmod.NormalizedEvent`-based dispatch code keep its signature without refactor.
- Consumer group / offset semantics that prevent duplicate dispatch during migration.
- Explicit retirement points for the bridges added by prior narrow slices.

After Phase-C, `normalized.events` receives zero writes. After Phase-D, the topic is deleted. After Phase-E, all bridge code (hydrate, canonical block, schemaVersion flag) is removed.

---

## 2. Ownership

### Owner Backend

- `gateway-api` owns the producer (`normalizedcons`), the new consumer (v2), and the retired consumer (v1).
- `klynx-api` owns its `event_refs` consumer of `gw.events.normalized.v1` (unchanged) and removes its republish to `normalized.events` at Phase-C.

### Domain System of Record

| Domain | System of Record | Canonical Store | Notes |
|---|---|---|---|
| Normalized event on the wire | `gateway-api.normalizedcons` | `gw.events.normalized.v1` | Only producer. |
| Delivery dispatch | `gateway-api.deliverycons` v2 | none (stateless) | Reads from canonical topic; converts internally via adapter. |
| `event_refs` projection | `klynx-api` | `klynx-api` Mongo | Unchanged. |

### Producer / Consumers

| Surface | Producer | Consumers | Notes |
|---|---|---|---|
| `gw.events.normalized.v1` | `gateway-api.normalizedcons` | `klynx-api.gweventscons` (event_refs); `gateway-api.deliverycons` v2 (group `gateway-delivery-v2-group`) | Only authoritative path. |
| `normalized.events` | **retired at Phase-C** | `gateway-api.deliverycons` v1 (group `gateway-delivery-group`) — kept log-only during Phase-B, deleted at Phase-D | Do not add new consumers. |

### Projection Stores

| Projection | Store | Consumer | Notes |
|---|---|---|---|
| `event_details` | `gateway-api` Mongo | internal (search, dashboards) | Unchanged shape — still `ingestmod.NormalizedEvent`. |
| `event_refs` | `klynx-api` Mongo | klynx workflows | Unchanged. |

---

## 3. Compatibility and Policy

### Backward Compatibility

- Compatibility status: `additive` during Phase-A/B (both consumers observe); `breaking-internal` at Phase-C (topic `normalized.events` receives no writes); `breaking-internal` at Phase-D (topic deleted).
- No consumer requirements change externally. Webhook receivers may observe richer `canonical` block (narrow-v2 behavior) throughout Phases A–D; at Phase-E the webhook body becomes raw `eventschema.NormalizedEvent` (see §5.5).
- No deprecation window on external APIs — no external consumer reads `normalized.events`.

### Replay / Re-sync Behavior

- New consumer group `gateway-delivery-v2-group` starts at `kafka.LastOffset`. No replay of pre-cutover history.
- Old consumer group's offsets become irrelevant after Phase-D deletion.
- `event_details` remains the idempotency key; replay via DLQ drainer unchanged.

### Write Authority Policy

- `gateway-api.normalizedcons` is the ONLY producer of `gw.events.normalized.v1`.
- `klynx-api` MUST NOT publish any event that `gateway-api.deliverycons` reads (enforced structurally by Phase-C retirement).

---

## 4. Surface Summary

| Type | Name | Direction | Schema | Consumer |
|---|---|---|---|---|
| Kafka | `gw.events.normalized.v1` | publish | `eventschema.NormalizedEvent` JSON | `klynx-api.gweventscons` + `gateway-api.deliverycons` v2 |
| Kafka | `normalized.events` | **retired** | n/a | n/a |
| Internal Go | `FromEventSchema(*eventschema.NormalizedEvent) *ingestmod.NormalizedEvent` | adapter | pure | called at `deliverycons` v2 consumer boundary |
| Env var | `DELIVERY_V2_ENABLED` | config | `"true"` / `"false"` | gateway-api startup |

---

## 5. Contract Details

### 5.1 Kafka `gw.events.normalized.v1`

- Wire shape: `eventschema.NormalizedEvent` (see `internal/eventschema/normalized.go` in gateway-api).
- Partition key: `workspaceId`.
- Headers set by producer: `eventId`, `eventType`, `workspaceId`, `tenantId`, `templateId`.
- Delivery semantics: at-least-once. Idempotency key: `eventId`. DLQ de-duplicates via `{eventId}:deliver:{targetId}`.

### 5.2 Internal Adapter `FromEventSchema`

Located at `gateway-api/internal/kafka/deliverycons/schemaadapter.go`. Pure function. No I/O.

Signature:

```go
func FromEventSchema(src *eventschema.NormalizedEvent) *ingestmod.NormalizedEvent
```

Field mapping (canonical wire → internal):

| eventschema field | ingestmod target | Notes |
|---|---|---|
| `EventID` | `EventId` | direct |
| `OrgID` | `TenantId` | cross-service tenant maps to internal tenant |
| `SourceType` | `EventType` | direct |
| `SourceCategory` | `EventCategory` | direct |
| `SourceAction` | `EventAction` | direct |
| `SourceFamily` | `Source.DeviceType` | kept per narrow-v2 convention; also mirrored to `Source.Vendor` if empty |
| `WorkspaceID` (root) | `Source.WorkspaceId` | ingestmod has no root workspaceId |
| `OccurredAt` | `OccurredAt` | direct |
| `ReceivedAt` | `Meta.NormalizedAt` | |
| `SchemaVersion` | `Meta.SchemaVersion` | |
| `TemplateID` | `Meta.TemplateId` | |
| `TraceID` | `Meta.TraceId` | |
| `Source.DeviceID` | `Source.DeviceId` | |
| `Source.DeviceMgmtID` | `Source.DeviceMgmtId` | NEW field on `ingestmod.SourceInfo` — added in Phase-A |
| `Source.SN` | `Source.SN` | NEW field |
| `Source.EdgeName` | `Source.EdgeName` | NEW field |
| `Source.OrgID` | `Source.OrgId` | NEW field |
| `Source.WorkspaceID` | `Source.WorkspaceId` | |
| `Source.SourceType` | — | already at `EventType`; not duplicated internally |
| `Source.SourceFamily` | — | already at `Source.DeviceType` |
| `Location.*` | `Location.*` | direct |
| `Geo.*` | `Geo.*` | direct |
| `GeoCell.*` | `GeoCell.*` | direct |
| `ByAdminArea` | `ByAdminArea` | direct |
| `Payload` | `Payload` | direct |
| `BinaryRefs[]` | `BinaryRefs[]` | map element-by-element; `FieldName` left empty |
| `RawPayloadRef` | — | not stored on ingestmod |

After Phase-A, `ingestmod.SourceInfo` gains `SN`, `DeviceMgmtId`, `EdgeName`, `OrgId` — additive struct change, backwards compatible for existing JSON/BSON.

### 5.3 Consumer Group Contract

| Attribute | Value | Why |
|---|---|---|
| Group ID | `gateway-delivery-v2-group` | Separate offset space from old group. New id never reused. |
| Topic | `gw.events.normalized.v1` | Canonical shape. |
| Start offset | `kafka.LastOffset` | Never replay history. LINE spam risk. |
| Min / Max bytes | matches old consumer | 1e3 / 10e6 |
| Max wait | 10s | matches old consumer |
| Commit interval | 0 (sync) | matches old consumer |

### 5.4 Flag Contract

| Attribute | Value |
|---|---|
| Name | `DELIVERY_V2_ENABLED` |
| Type | bool (`"true"` / `"false"`) |
| Default | `"false"` |
| Read | once at gateway-api startup via `os.Getenv`. No runtime flip. |

Behavior matrix:

| Flag | Old consumer (`gateway-delivery-group`) | New consumer v2 (`gateway-delivery-v2-group`) |
|---|---|---|
| `false` | dispatches (authoritative) | dry-run (decode + log only, no target dispatch) |
| `true` | short-circuits handler (log only, no dispatch) | dispatches (authoritative) |

### 5.5 Outbound Webhook Body (transition)

| Phase | Webhook body shape | Note |
|---|---|---|
| Phase-A | `ingestmod` root + `canonical` block | narrow-v2 default, unchanged |
| Phase-B | `ingestmod` root + `canonical` block | unchanged — switching consumer doesn't change outbound shape |
| Phase-C | `ingestmod` root + `canonical` block | unchanged |
| Phase-D | `ingestmod` root + `canonical` block | unchanged |
| **Phase-E** | **raw `eventschema.NormalizedEvent`** | canonical IS the body; narrow-v2 bridge deleted |

At Phase-E, receivers parsing legacy `eventType` / `eventCategory` / `eventAction` at root will break. In test env this is acceptable — confirm receivers tolerate shape change before Phase-E applies.

### 5.6 Render Context (transition)

| Phase | Template context |
|---|---|
| Phase-A–D | legacy keys (`.eventAction`, `.source.workspaceId`, etc.) + additive `.canonical.*` |
| **Phase-E** | legacy keys kept; `.canonical` block replaced with pass-through raw eventschema (no adapter round-trip) |

Author-facing keys remain stable across all phases — the only change at Phase-E is where `.canonical.*` values come from.

### 5.7 Dual-Publish Contract (Phase-A–C)

Normalizer publishes to **BOTH** topics for the duration of Phase-A and Phase-B:

| Workspace type | Phase-A/B publish targets |
|---|---|
| klynx-mapped | `gw.events.normalized.v1` (unchanged) + `normalized.events` (via klynx-api republish, unchanged) |
| standalone | `gw.events.normalized.v1` (**NEW** — added in Phase-A) + `normalized.events` (unchanged) |

At Phase-C, `normalized.events` publish paths are removed from both repos. After Phase-C, `gw.events.normalized.v1` is the only published topic.

---

## 6. REST Contract

Not applicable — this contract is internal to Kafka + Go.

---

## 7. Canonical and Projection Mapping

### Canonical Store

- System: Kafka cluster, topic `gw.events.normalized.v1`.
- Retention: per broker defaults; not changed by this slice.

### Projection Store

- `event_details` (Mongo, owned by gateway-api) — unchanged. `hydrate.go` helpers are retired at Phase-E since payload arrives complete.
- `event_refs` (Mongo, owned by klynx-api) — unchanged.

### Field Mapping

See §5.2 for adapter mapping. No projection-layer mapping changes in this slice.

---

## 8. Field Ownership

| Field | Authoritative Writer | Stored In | Notes |
|---|---|---|---|
| All `eventschema.NormalizedEvent` fields | `gateway-api.normalizedcons` | `gw.events.normalized.v1` | single producer |
| `ingestmod.SourceInfo.{SN,DeviceMgmtId,EdgeName,OrgId}` (NEW) | `gateway-api.normalizedcons` via `FromEventSchema` at consumer | in-memory (`event_details` if persisted) | additive additions; old docs simply have empty values |

### Conflict Resolution

- `eventId` idempotency applies throughout. Consumer group `gateway-delivery-v2-group` commits offsets synchronously like the old group.

---

## 9. Frontend Integration Notes

Not applicable — no FE consumes either topic directly.

---

## 10. Rollout Notes

| Repo | Dependency | Required Before | Notes |
|---|---|---|---|
| `gateway-api` | contract | Phase-A | Adapter + v2 consumer + flag. |
| `klynx-api` | contract | Phase-C | Republish removal PR. |
| infra | — | Phase-D | Delete consumer group + topic (Kafka admin). |

See plan r2 §9 for full phase sequencing.

---

## 11. Examples

### Example adapter round-trip

Input (`eventschema.NormalizedEvent`, excerpt):
```json
{
  "eventId": "evt-1",
  "orgId": "org-1",
  "workspaceId": "ws-1",
  "sourceType": "pedestrian.detected",
  "sourceCategory": "pedestrian",
  "sourceAction": "detected",
  "sourceFamily": "AIBOX",
  "source": {
    "deviceId": "51",
    "deviceMgmtId": "dm-1",
    "sn": "6016600d",
    "edgeName": "EDGEAI-8ch",
    "workspaceId": "ws-1",
    "orgId": "org-1"
  }
}
```

Output (`ingestmod.NormalizedEvent` via `FromEventSchema`, excerpt):
```json
{
  "eventId": "evt-1",
  "tenantId": "org-1",
  "eventType": "pedestrian.detected",
  "eventCategory": "pedestrian",
  "eventAction": "detected",
  "source": {
    "deviceId": "51",
    "deviceType": "AIBOX",
    "deviceMgmtId": "dm-1",
    "sn": "6016600d",
    "edgeName": "EDGEAI-8ch",
    "workspaceId": "ws-1",
    "orgId": "org-1"
  }
}
```

### Example flag flip (Phase-B)

Before: `DELIVERY_V2_ENABLED=false` → old consumer dispatches, v2 dry-runs.
After: `DELIVERY_V2_ENABLED=true` → v2 dispatches, old consumer dry-runs.

---

## 12. Checklist

- [x] Owner backend is explicit (`gateway-api`).
- [x] Canonical wire shape documented (`eventschema.NormalizedEvent`).
- [x] Internal adapter signature + field mapping fully enumerated.
- [x] Consumer group / offset strategy locked (§5.3).
- [x] Flag behavior matrix locked (§5.4).
- [x] Outbound shape transition documented per phase (§5.5).
- [x] Render context transition documented (§5.6).
- [x] Dual-publish semantics locked (§5.7).
- [x] Retirement points for narrow bridges cross-linked (Phase-E in plan).
- [x] Backwards compatibility assessment included.
- [x] Replay / idempotency policy documented.
