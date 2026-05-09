# Klynx Kafka Consumer Surface Contract

**Date:** 2026-05-04
**Status:** Active (new — graphify-surfaced gap from `docs/plan/done/contract-grouping-audit.md` §"Graphify Findings 2026-05-04 — 3. Klynx Kafka Consumer Surface Needs Coverage Check")
**Owner Backend:** `klynx-api`
**Related Plan:** N/A (this contract documents existing shipped consumer wiring; no new BE work required)
**Cites:** [docs/contracts/delivery-topic-unification.md](delivery-topic-unification.md) — gateway-api side of `gw.events.normalized.v1` migration; [docs/contracts/org-lifecycle.md](org-lifecycle.md) §6 — `gw.workspace.provisioned.v1` is referenced but documented in detail here
**Applies To Repos:** `klynx-api` (consumer + bridge); `gateway-api` (producer of all `gw.*` topics — out of scope here)
**Contract Type:** `Kafka`
**Version:** `v1` — documents shipped 4.x consumer wiring

---

## 0. Domain / Flow Boundary

| Field | Value |
|---|---|
| Domain name | `klynx-kafka-consumer` |
| Flow name | klynx-api consumer-side wiring for all gw-produced Kafka topics + the kctrl status bridge |
| Lifecycle scope | `gateway-api` produces → klynx-api consumer (with W3C trace propagation via Kafka headers) → projection write into klynx Mongo / Redis / commonmon |

### Included Surfaces

| Surface Type | Name | Purpose |
|---|---|---|
| Kafka consumer | `gw.events.normalized.v1` (`gweventscons`) | normalized event delivery → `event_refs` upsert via `IngestFacade.HandleEvent` → `ingestsvc.HandleNormalized` |
| Kafka consumer | `gw.delivery.status.v1` (`gwdeliverycons`) | delivery status updates → `event_refs.UpdateDeliveryStatus` + audit |
| Kafka consumer | `gw.sources.changed.v1` (`gwsourcecons`) | source config changes → `OrgSourceConfigService.UpdateSourceConfig` |
| Kafka consumer | `gw.devices.changed.v1` (`gwdevicecons`) | device sync from gw → `DeviceSyncService.SyncFromGW` |
| Kafka consumer | `gw.assets.changed.v1` (`gwassetcons`) | asset sync from gw → `AssetSyncService.SyncFromGW` |
| Kafka consumer | `gw.workspace.provisioned.v1` (`workspaceprovcons`) | saasPublic workspace provisioning ack → `OrgWorkspaceService.UpdateWorkspaceRef` |
| Kafka consumer (bridge) | `kcontrol.statusChanged` (`kctrlcons.StartKafkaStatusChangedBridge`) | klynx-internal kcontrol state → `commonmonsvc.HandleKctrlStatusChanged` (commonmon binary; bridges into `camera_monitor_status_history`) |
| Sync rule | `KAFKA_GROUP` env naming pattern (`<base>.<topic>` vs per-consumer fallback group ID) | locked group-id pattern shared across all 7 consumers |
| Sync rule | Consumer error semantics (`commit-and-continue` on handler error; no retry; no DLQ in v1) | locked behavior of the shared `kafka.StartConsumerWithHeaders` helper |

### Excluded Surfaces

| Surface | Why excluded | Authoritative Contract |
|---|---|---|
| `gateway-api` producer-side wiring (which service emits each topic, payload schema authority, delivery semantics) | upstream — gateway-api owns all `gw.*` topics on the producer side | (gateway-api documentation) |
| `delivery-topic-unification.md` — gw-side delivery topic migration plan | sibling — covers the gw-side switch from `normalized.events` → `gw.events.normalized.v1`; klynx-side consumer is documented here | sibling contract |
| Klynx-internal Kafka consumers NOT consuming `gw.*` topics | different lifecycle (klynx-only Kafka transport) — `authzcons` (membership / relationship), `iwowncons` (iboc events), `kwatchcons` (watchlist), `kaicons` (KAI detect), `atacons` (ATA), `kschcorns` (schedule), `klivecorns` (klive event sink), `kctrlcons/{health,alarm,sensor,event}` (kcontrol-internal sub-topics) | (separate contracts; not in scope of this audit) |
| Klynx Kafka producers (`kwatchpub`, `orgpub`, `entitlementpub`, klive event publishers in `streamzkt`) | producer-side surface — separate contract scope | (separate contracts; future audit) |
| `klive.*` event topics produced from `streamzkt` (`klive.play.started`, `klive.play.denied`, `media.hook.on_play`, `media.hook.on_publish`) | producer-side; sibling to media-stream-redis surface | future `klynx-klive-events.md` (graphify gap follow-up if needed) |
| `gw.events.normalized.v1` payload schema (`eventbridge.NormalizedEvent` shape) | upstream — gateway-api authoritative; klynx-api `eventbridge` package has the deserialization mirror | (gateway-api ingestmod / gw documentation) |
| `event_refs` collection schema | covered by Klynx event projection store rules in code; not a cross-repo contract surface | (internal — documented in code via `eventrefsrepo`) |
| Camera identity sync state | sibling — `device-camera-domain.md` (Cluster #1 merged) | sibling contract |

### Related Contracts

| Contract | Relationship |
|---|---|
| [`delivery-topic-unification.md`](./delivery-topic-unification.md) | upstream gw-side — documents `gw.events.normalized.v1` migration and the canonical wire shape. This contract documents the klynx-api consumer that subscribes to it |
| [`org-lifecycle.md`](./org-lifecycle.md) §6 | upstream / consumer pair — `gw.workspace.provisioned.v1` is produced by klynx-api itself under saasPublic and consumed by `workspaceprovcons` (round-trip); the producer-side is in §5.7 of org-lifecycle, the consumer-side is detailed here |
| [`media-stream-redis.md`](./media-stream-redis.md) | sibling producer surface — `streamzkt` webhooks publish `klive.*` events via `publishKliveEvent`. This contract does NOT consume them; documented for cross-reference |
| Future `device-camera-domain.md` | sibling — `gw.devices.changed.v1` consumer (`gwdevicecons`) feeds the camera projection; see Cluster #1 merge for the camera-side projection rules |

### Grouping Rationale

All 7 consumer surfaces share:
- the **same shared helper** (`kafka.StartConsumerWithHeaders` in `internal/kafka/consumer.go`)
- the **same group-ID pattern** (`KAFKA_GROUP` env-driven with per-consumer fallback)
- the **same trace propagation** (W3C-compatible header extract via `traceutil.ExtractHeaders`)
- the **same error semantics** (commit-and-continue on handler error; no retry; no DLQ in v1)
- the **same long-poll behavior** (`MaxWait: 10s`, `MinBytes: 1KB`, `MaxBytes: 10MB`, manual commit, `CommitInterval: 0`)
- the **same wiring rule** (all enabled under `DEPLOYMENT_PROFILE=appliance`; default switch branch also covers `platform`; the `saasPublic` profile may skip subset)

A reader / operator who wants to understand "what topics does klynx-api consume from gw and what happens to each message" needs all 7 documented together. Per `docs/contracts/README.md` grouping rule, these are one consumer surface → one contract.

The kctrl status bridge is included because it shares the same shared helper and trace propagation; it is the only **klynx-internal** topic on this contract — included as a "bridge" because it crosses the main → commonmon binary boundary. All other klynx-internal topics are out of scope (sibling contracts).

---

## 1. Purpose

Documents the consumer-side wiring for all 7 Kafka topics consumed by klynx-api binaries:
- 6 cross-repo consumers receiving from `gateway-api` (`gw.*` prefix)
- 1 klynx-internal bridge that crosses the `main` ↔ `commonmon` binary boundary

This was a **graphify-surfaced gap** — the consumers were shipped in 4.x and individually documented in code, but never collected into one cross-repo contract. Operators tuning consumer group IDs need this; gateway-api authors changing producer topics need to know which klynx consumers will be affected; FE/3rd-party engineers debugging delivery status updates need to understand the consumer chain.

Key surface properties:

- **W3C trace propagation** via Kafka headers — every consumer extracts trace context using `traceutil.ExtractHeaders` and starts a child span.
- **Group ID pattern** — when `KAFKA_GROUP` env is set, group ID is `<KAFKA_GROUP>.<topic>` (or `.<topic>.bridge` for the kctrl bridge); otherwise per-consumer fallback ID is used.
- **Topic env override** — every consumer accepts a `KAFKA_TOPIC_GW_*` env override; defaults to the canonical `gw.*` name.
- **Commit-and-continue on error** — handler errors are logged but the offset is committed and processing continues. **No retry, no DLQ in v1.** Operators must monitor logs for handler-error rates.
- **Decode-failure same** — JSON unmarshal failure (poison pill) commits and skips. Logged but not retried.
- **DEPLOYMENT_PROFILE wiring** — all 6 gw consumers + workspace consumer are wired under `appliance` and `platform` profiles. `saasPublic` profile selectively wires only the consumers it needs.
- **kctrl status bridge** runs in the **`commonmon` binary**, not the main API binary. Different consumer group (`.bridge` suffix) so it does not interfere with potential future main-side consumers of the same topic.

`klynx-api` publishes this contract; `gateway-api` is the producer of 6 of the 7 topics (out of scope here). Operators consume the wiring rules; FE consumes the indirect effects through `event_refs.deliveryStatus`, camera projection, workspace provisioning callback, etc.

---

## 2. Ownership

### Owner Backend

- `klynx-api` (consumer side; the producer of every `gw.*` topic is `gateway-api` — out of scope of this contract)

### Domain System of Record

| Domain | System of Record | Canonical Store | Notes |
|---|---|---|---|
| Normalized event canonical | `gateway-api` | gateway-api `event_details` | klynx-api consumes via `gweventscons` and projects index into `event_refs` |
| Event delivery status | `gateway-api` | `gw.delivery.status.v1` is the wire; klynx-api is the consumer-side projection writer | mirrored into `event_refs.deliveryStatus` |
| Source config (camera / sensor source) | `gateway-api` | gateway-api source registry | klynx-api consumes via `gwsourcecons` and updates `OrgSourceConfig` |
| Device identity (camera / kcontrol from gw) | `gateway-api/device_management` | klynx-api `klynx.camera` / `klynx.kctrl` (projection) | klynx-api consumes via `gwdevicecons` and projects into camera/kcontrol tables |
| Asset state | `gateway-api` | klynx-api asset projection (when asset domain ships) | klynx-api consumes via `gwassetcons` (svc currently optional / unwired in some deployments) |
| Workspace provisioning ack | `gateway-api` (saasPublic) | klynx-api `organizations.workspaceId` + `eventIngestUri` mirror | klynx-api consumes via `workspaceprovcons` |
| kcontrol current status (klynx-internal Kafka transport) | `kctrlsvc.HandleStatusChanged` (main binary) | `klynx.kctrl` + `klynx.kcontrol_status_history` | bridge consumer in commonmon binary forwards into `commonmonsvc.HandleKctrlStatusChanged` for `camera_monitor_status_history` |
| Trace context (W3C traceparent / tracestate) | OTel SDK | Kafka headers | extracted via `traceutil.ExtractHeaders` on every consumer; child span started |

### Producer / Consumers

| Surface | Producer (out of scope) | Consumer (this contract) | Handler entrypoint | klynx-api binary |
|---|---|---|---|---|
| `gw.events.normalized.v1` | `gateway-api` ingest pipeline | `gweventscons.StartNormalizedEventsConsumer` | `IngestFacade.HandleEvent` → `ingestsvc.HandleNormalized` | `main` |
| `gw.delivery.status.v1` | `gateway-api` deliverycons (downstream of normalized event dispatch) | `gwdeliverycons.StartDeliveryStatusConsumer` | `EventRefsUpdater.UpdateDeliveryStatus` (`*eventrefsrepo.EventRefsRepo`) + optional `AuditService.RecordDeliveryStatus` | `main` |
| `gw.sources.changed.v1` | `gateway-api` source registry | `gwsourcecons.StartSourceChangedConsumer` | `OrgSourceConfigService.UpdateSourceConfig` | `main` |
| `gw.devices.changed.v1` | `gateway-api/device_management` | `gwdevicecons.StartDeviceChangedConsumer` | `DeviceSyncService.SyncFromGW` (`gwdevicesync.Service`) | `main` |
| `gw.assets.changed.v1` | `gateway-api` asset registry | `gwassetcons.StartAssetChangedConsumer` | `AssetSyncService.SyncFromGW` (svc may be nil → no-op) | `main` |
| `gw.workspace.provisioned.v1` | `gateway-api` workspace provisioner (under saasPublic profile of klynx-api itself per `org-lifecycle.md` §5.7 — this is the round-trip ack) | `workspaceprovcons.StartWorkspaceProvisionedConsumer` | `OrgWorkspaceService.UpdateWorkspaceRef` | `main` |
| `kcontrol.statusChanged` (klynx-internal — env `KAFKA_TOPIC_KCTRL_STATUS_CHANGED`) | `kctrlsvc.HandleStatusChanged` (main binary) — Kafka publish via separate producer | `kctrlcons.StartKafkaStatusChangedBridge` | `commonmonsvc.HandleKctrlStatusChanged` → `kctrlBridge` (camera_monitor_status_history append + camera_monitor_status update) | `commonmon` (NOT main) |

### Projection Stores (writer paths from each consumer)

| Topic | Projection write target | Notes |
|---|---|---|
| `gw.events.normalized.v1` | `klynx.event_refs` (upsert per event) | sibling per `delivery-topic-unification.md`; index for klynx event list |
| `gw.delivery.status.v1` | `klynx.event_refs.deliveryStatus` (update field) + audit log | klynx list queries reflect delivery state |
| `gw.sources.changed.v1` | `klynx.org_source_config` (or equivalent) — implementation-private | depends on `OrgSourceConfigService.UpdateSourceConfig` impl |
| `gw.devices.changed.v1` | `klynx.camera` / `klynx.kctrl` (and related projections) — see `gwdevicesync` | full sync per change; svc decides upsert vs delete based on `msg.ChangeType` |
| `gw.assets.changed.v1` | klynx asset projection (when wired) | currently optional — `assetSvc` may be nil → no-op |
| `gw.workspace.provisioned.v1` | `klynx.organizations.{workspaceId, eventIngestUri}` | round-trip ack with klynx itself when running under saasPublic |
| `kcontrol.statusChanged` | `klynx.camera_monitor_status` + `klynx.camera_monitor_status_history` (via `commonmonsvc.HandleKctrlStatusChanged`) | bridge mode controlled by `CAMMONITOR_KCTRL_BRIDGE_MODE` (Phase B `compare` / Phase C `cutover`) |

---

## 3. Compatibility and Policy

### Backward Compatibility

- **Compatibility status:** documenting shipped 4.x consumer wiring. No breaking change introduced by this contract.
- **Topic name changes** require coordinated env-var rollout (`KAFKA_TOPIC_GW_*`) across both producer (gateway-api) and consumer (klynx-api). Without the env override, both sides default to canonical names — operators must avoid mixing override with default.
- **Group ID changes** are semi-breaking: a different `KAFKA_GROUP` value resets the consumer offset (Kafka treats it as a new group). Operators MUST coordinate group-ID changes with the operations runbook to avoid duplicate processing.
- **Schema (payload) changes** are gateway-api producer-side concerns; klynx-api consumers use `eventbridge.*Event` deserialization mirrors. New fields are tolerated (Go struct binder ignores unknown fields). Required-field removal is breaking and requires producer/consumer lockstep deploy.

### Replay / Re-sync Behavior

- **Replay supported:** YES via Kafka offset reset on the consumer group. `KAFKA_GROUP` env value determines the group; resetting offset (manual operator action via Kafka admin tooling) re-processes from earliest.
- **Re-sync trigger:** none built-in. Operators must use Kafka admin tooling (e.g. `kafka-consumer-groups.sh --reset-offsets --to-earliest`).
- **Idempotency:** every consumer's handler MUST be idempotent. Specifically:
  - `gweventscons` → `event_refs` upsert (idempotent by `eventId`)
  - `gwdeliverycons` → `event_refs.deliveryStatus` last-write-wins (idempotent for repeated same-status updates)
  - `gwsourcecons` → `OrgSourceConfigService.UpdateSourceConfig` (responsibility of the service impl; current behavior is upsert)
  - `gwdevicecons` → `DeviceSyncService.SyncFromGW` (idempotent — see `device-camera-domain.md` related sync rules; `msg.ChangeType` drives the operation)
  - `gwassetcons` → asset svc-impl-specific (currently no-op when svc nil)
  - `workspaceprovcons` → `UpdateWorkspaceRef` (idempotent — sets fields if missing or matching)
  - `kctrlcons` bridge → `commonmonsvc.HandleKctrlStatusChanged` (idempotent via `(deviceId, transitionAt, status)` unique index on `kcontrol_status_history` — same rule as `dashboard-timeseries.md` §9.3)
- **Duplicate delivery rule:** Kafka at-least-once delivery is the contract floor. All handlers must accept duplicates without producing user-visible side-effects; this is baked into the projection-store choices above (last-write-wins / unique index / upsert).

### Write Authority Policy

- **Cross-repo write authority:** `gateway-api` is the canonical SoR for events / sources / devices / assets / workspace. klynx-api consumers write **projection stores** only — never write back to gateway-api via Kafka.
- **klynx-api `event_refs` is canonical** for the index (klynx's projection of normalized events). Writes via:
  - `gweventscons` (initial upsert with full event metadata)
  - `gwdeliverycons` (deliveryStatus field update only — `UpdateDeliveryStatus`)
- **`event_refs.deliveryStatus` last-writer-wins** — there is no version field. Race window between two delivery-status messages for the same eventId resolves to whichever Kafka message is processed last.
- **kctrl bridge** is the bridge-mode-controlled writer of `camera_monitor_status_history` for the kctrl-derived path. When `CAMMONITOR_KCTRL_BRIDGE_MODE = shadow`, both probe orchestrator and kctrl bridge write history (compare); `compare` mode logs differences; `cutover` mode is the production target.
- **Workspace ack idempotency:** when the workspace ack arrives via Kafka, klynx-api `OrgWorkspaceService.UpdateWorkspaceRef` updates `organizations.{workspaceId, eventIngestUri}` if not already set OR if the values match (re-fire safety). Conflicting values reject as service error.

### Revision History

This contract is new (graphify-surfaced gap, 2026-05-04). Each consumer's individual revision history lives in its companion contract or in code — see §15 implementation evidence. Notable cross-cutting changes:

- **2026-04-21 — `delivery-topic-unification` Phase A-E** (gw side): klynx-side consumer of `gw.events.normalized.v1` was already shipped; gw side migrated FROM stripped `normalized.events` TO canonical. klynx consumer group ID and topic env unchanged across the migration.
- **2026-04-24 — `commonmonsvc/kctrlBridge.go` Phase B → C cutover** (commonmon side): bridge mode changed from `compare` to `cutover`; the Kafka consumer wiring did NOT change (same group ID, same topic, same handler).
- **`gwassetcons` shipped but unwired** in production today — `AssetSyncService` is nil in the container default. Documented here as a future hook; the consumer goroutine still subscribes but no-ops on every message.

---

## 4. Surface Summary

| Type | Topic | Group ID (when `KAFKA_GROUP` set / unset) | Consumer Package | Handler | Binary |
|---|---|---|---|---|---|
| Kafka | `gw.events.normalized.v1` | `<base>.<topic>` / `klynx-gw-events-grp` | `gweventscons` | `IngestFacade.HandleEvent` → `ingestsvc.HandleNormalized` | `main` |
| Kafka | `gw.delivery.status.v1` | `<base>.<topic>` / `klynx-gw-delivery-grp` | `gwdeliverycons` | `EventRefsUpdater.UpdateDeliveryStatus` + optional `AuditService.RecordDeliveryStatus` | `main` |
| Kafka | `gw.sources.changed.v1` | `<base>.<topic>` / `klynx-gw-sources-grp` | `gwsourcecons` | `OrgSourceConfigService.UpdateSourceConfig` | `main` |
| Kafka | `gw.devices.changed.v1` | `<base>.<topic>` / `klynx-gw-devices-grp` | `gwdevicecons` | `DeviceSyncService.SyncFromGW` | `main` |
| Kafka | `gw.assets.changed.v1` | `<base>.<topic>` / `klynx-gw-assets-grp` | `gwassetcons` | `AssetSyncService.SyncFromGW` (may be nil → no-op) | `main` |
| Kafka | `gw.workspace.provisioned.v1` | `<base>.<topic>` / `klynx-gw-workspace-prov-grp` | `workspaceprovcons` | `OrgWorkspaceService.UpdateWorkspaceRef` | `main` |
| Kafka (bridge) | `kcontrol.statusChanged` (env `KAFKA_TOPIC_KCTRL_STATUS_CHANGED`) | `<base>.<topic>.bridge` / `kctrl.statusChanged.bridge` | `kctrlcons.StartKafkaStatusChangedBridge` | `commonmonsvc.HandleKctrlStatusChanged` | `commonmon` |

---

## 5. REST Surfaces

`N/A — not in scope.` This contract documents the Kafka consumer surface only. Producer endpoints (e.g. `POST /admin/platformLicense/activate` triggers under saasPublic) are documented in their respective contracts (`org-lifecycle.md` §5.4 / §6).

---

## 6. Kafka / Async Event Surfaces

### 6.1 `gw.events.normalized.v1` — normalized event delivery

**Producer:** `gateway-api` ingest pipeline (out of scope here).
**Consumer:** `gweventscons.StartNormalizedEventsConsumer` (`internal/kafka/gweventscons/consumer.go`).
**Trigger:** every event normalized by gateway-api ingest.
**Delivery Semantics:** at-least-once.

#### Topic resolution

```text
KAFKA_TOPIC_GW_NORMALIZED env override
  → defaults to "gw.events.normalized.v1"
```

#### Group ID resolution

```text
KAFKA_GROUP env (base):
  set     → "<base>.<topic>"            (e.g. "klynx-prod.gw.events.normalized.v1")
  unset   → "klynx-gw-events-grp"        (per-consumer fallback)
```

#### Message envelope (consumer-side mirror)

`eventbridge.NormalizedEvent` — full schema in `internal/eventbridge/types.go`. Fields used by klynx consumer:
- `EventID` — required; primary key for `event_refs` upsert
- `WorkspaceID`, `OrgID` — required for scoping
- `DeviceID`, `DeviceName` — projected into `event_refs`
- `EventType`, `EventCategory`, `EventAction`, `SourceFamily` — index fields
- `OccurredAt`, `Score` — metadata
- (other fields per upstream `gateway-api/ingestmod.NormalizedEvent` shape)

#### Handler logic

```go
func handler(msg eventbridge.NormalizedEvent, headers map[string]string) error {
    parentCtx := traceutil.ExtractHeaders(context.Background(), headers)
    ctx, end, log := traceutil.StartLite(parentCtx, "...gweventscons", "gweventscons.normalized.consume", "gweventscons", "events")
    defer end()
    log.Info().Str("eventId", msg.EventID).Str("workspaceId", msg.WorkspaceID).Str("orgId", msg.OrgID).Msg(...)
    return facade.HandleEvent(ctx, msg)  // → ingestsvc.HandleNormalized → eventRefsRepo upsert
}
```

#### Idempotency / Replay

- Idempotency key: `eventId`. Repeat delivery → upsert into `event_refs` (no-op if no fields changed; updates if fields changed).
- Replay (Kafka offset reset): safe — re-processes all events; `event_refs` end-state is identical.

### 6.2 `gw.delivery.status.v1` — delivery status updates

**Producer:** `gateway-api` deliverycons (downstream of normalized event dispatch).
**Consumer:** `gwdeliverycons.StartDeliveryStatusConsumer` (`internal/kafka/gwdeliverycons/consumer.go`).
**Trigger:** every delivery attempt status update from gw.
**Delivery Semantics:** at-least-once.

#### Topic resolution

```text
KAFKA_TOPIC_GW_DELIVERY_STATUS env override
  → defaults to "gw.delivery.status.v1"
```

#### Group ID resolution

```text
KAFKA_GROUP set     → "<base>.<topic>"
            unset   → "klynx-gw-delivery-grp"
```

#### Message envelope

`eventbridge.DeliveryStatusEvent`. Fields used:
- `EventID` — required; FK into `event_refs`
- `WorkspaceID` — for scoping
- `Status` — string (delivery status enum from gw)
- (other fields per upstream gateway-api shape)

#### Handler logic

```go
func handler(msg eventbridge.DeliveryStatusEvent, headers map[string]string) error {
    parentCtx := traceutil.ExtractHeaders(...)
    ctx, end, log := traceutil.StartLite(...)
    defer end()
    log.Debug().Str("eventId", msg.EventID).Str("workspaceId", msg.WorkspaceID).Str("status", msg.Status).Msg(...)

    // 1. Update event_refs.deliveryStatus
    if eventRefsUpdater != nil && msg.EventID != "" {
        if err := eventRefsUpdater.UpdateDeliveryStatus(ctx, msg.EventID, msg.Status); err != nil {
            log.Error().Err(err).Msg(...)
            return err  // commit-and-continue applies; offset still committed by helper
        }
    }
    // 2. Optional audit
    if auditSvc != nil {
        return auditSvc.RecordDeliveryStatus(ctx, msg)
    }
    return nil
}
```

#### Idempotency / Replay

- Idempotency: `event_refs.deliveryStatus` is last-write-wins (no version field). Repeated same-status updates are no-ops; out-of-order delivery may transiently flip status but converges.
- Replay: safe — final state after replay matches steady-state.

### 6.3 `gw.sources.changed.v1` — source config changes

**Producer:** `gateway-api` source registry.
**Consumer:** `gwsourcecons.StartSourceChangedConsumer` (`internal/kafka/gwsourcecons/consumer.go`).

#### Topic / Group

```text
KAFKA_TOPIC_GW_SOURCES env override → defaults to "gw.sources.changed.v1"
KAFKA_GROUP set → "<base>.<topic>"; unset → "klynx-gw-sources-grp"
```

#### Message envelope

`eventbridge.SourceChangedEvent`. Fields used: `SourceID`, `WorkspaceID`, `ChangeType`.

#### Handler

```go
return orgSvc.UpdateSourceConfig(ctx, msg)  // svc-impl-specific upsert; nil-safe (no-op if orgSvc is nil)
```

### 6.4 `gw.devices.changed.v1` — device sync

**Producer:** `gateway-api/device_management`.
**Consumer:** `gwdevicecons.StartDeviceChangedConsumer` (`internal/kafka/gwdevicecons/consumer.go`).

#### Topic / Group

```text
KAFKA_TOPIC_GW_DEVICES env override → defaults to "gw.devices.changed.v1"
KAFKA_GROUP set → "<base>.<topic>"; unset → "klynx-gw-devices-grp"
```

#### Message envelope

`eventbridge.DeviceChangedEvent`. Fields used: `RemoteDeviceID`, `GWWorkspaceID`, `ChangeType`, `OrgID` (and other fields depending on `ChangeType`).

#### Handler

```go
return svc.SyncFromGW(ctx, msg)  // gwdevicesync.Service — idempotent
```

The `DeviceSyncService.SyncFromGW` is the projection writer for camera identity in klynx — see future `device-camera-domain.md` for the full sync rules. This consumer is the only entry point; all other camera CRUD goes through klynx-api REST surfaces (which do not write Kafka).

### 6.5 `gw.assets.changed.v1` — asset sync (currently unwired)

**Producer:** `gateway-api` asset registry.
**Consumer:** `gwassetcons.StartAssetChangedConsumer` (`internal/kafka/gwassetcons/consumer.go`).

#### Topic / Group

```text
KAFKA_TOPIC_GW_ASSETS env override → defaults to "gw.assets.changed.v1"
KAFKA_GROUP set → "<base>.<topic>"; unset → "klynx-gw-assets-grp"
```

#### Handler

```go
if assetSvc == nil {
    return nil  // no-op (asset domain not wired in production)
}
return assetSvc.SyncFromGW(ctx, msg)
```

**Status note:** consumer goroutine is started (subscribes to topic, commits offsets) but the handler no-ops on every message in deployments where `AssetSyncService` is nil. This is by design — the topic is reserved for future asset domain.

### 6.6 `gw.workspace.provisioned.v1` — workspace ack

**Producer:** `gateway-api` workspace provisioner. Under saasPublic, klynx-api itself publishes this when `EnablePhibekWorkspaceForUser` runs (see `org-lifecycle.md` §5.7); it is then consumed back by the same klynx-api fleet to update the org mirror. Round-trip ack pattern.
**Consumer:** `workspaceprovcons.StartWorkspaceProvisionedConsumer`.

#### Topic / Group

```text
KAFKA_TOPIC_GW_WORKSPACE_PROVISIONED env override → defaults to "gw.workspace.provisioned.v1"
KAFKA_GROUP set → "<base>.<topic>"; unset → "klynx-gw-workspace-prov-grp"
```

#### Message envelope

`eventbridge.WorkspaceProvisionedEvent`. Fields used: `KlynxOrgID`, `WorkspaceID`, `EventIngestURI`.

#### Handler

```go
return orgSvc.UpdateWorkspaceRef(ctx, msg.KlynxOrgID, msg.WorkspaceID, msg.EventIngestURI)
// ↑ writes klynx.organizations.{workspaceId, eventIngestUri} via OrgRepo.UpdateWorkspaceRef
```

The 202 Accepted from `POST /api/v3/ingest/reprovisionWorkspace` (under saasPublic) returns BEFORE this consumer runs — caller polls `GET /api/v3/ingest/` until `provisionStatus="active"` to observe completion.

### 6.7 `kcontrol.statusChanged` — kctrl status bridge (klynx-internal)

**Producer:** `kctrlsvc.HandleStatusChanged` in the **main** binary (Kafka publish via separate producer).
**Consumer:** `kctrlcons.StartKafkaStatusChangedBridge` in the **commonmon** binary.
**Purpose:** bridges kctrl state changes (consumed by main binary) into the camera-monitor history (managed by commonmon binary).

#### Topic / Group

```text
KAFKA_TOPIC_KCTRL_STATUS_CHANGED env (no canonical default in this consumer; topic is passed in directly to StartKafkaStatusChangedBridge)
KAFKA_GROUP set     → "<base>.<topic>.bridge"      (NOTE: ".bridge" suffix to differentiate from main-side consumers)
            unset   → "kctrl.statusChanged.bridge"
```

The `.bridge` suffix is **load-bearing** — it ensures the bridge consumer in commonmon does not interfere with potential future main-side consumers of the same topic. Both consumers (if they exist) would receive every message independently because they are in different consumer groups.

#### Message envelope

`kctrlmod.StatusChangedMessage`. Fields used: `HwID`, `DeviceID`, `NewStatus`, `PrevStatus`, `Name`, `Ip`, `EvaluatedAt`, `InactiveForMs`.

#### Handler

```go
svc.HandleKctrlStatusChanged(bridgeCtx, commonmonsvc.KctrlStatusMsg{
    HwID:          msg.HwID,
    DeviceID:      msg.DeviceID,
    NewStatus:     msg.NewStatus,
    PrevStatus:    msg.PrevStatus,
    Name:          msg.Name,
    Ip:            msg.Ip,
    EvaluatedAt:   msg.EvaluatedAt,
    InactiveForMs: msg.InactiveForMs,
})
return nil  // handler does NOT propagate errors (logged via traceutil if span fires)
```

#### Bridge mode (`CAMMONITOR_KCTRL_BRIDGE_MODE`)

- `shadow` — both probe orchestrator and kctrl bridge write `camera_monitor_status_history`; bridge writes are compared against probe writes and divergences logged.
- `compare` — bridge writes are taken as authoritative for kctrl-derived devices; probe writes still happen for camera-derived.
- `cutover` — bridge is the only writer for kctrl-derived devices in `camera_monitor_status_history`; probe orchestrator stops writing kctrl entries.

The mode is process-local (read at startup); rolling change requires commonmon restart.

#### Idempotency / Replay

- Idempotency: `kcontrol_status_history` unique index `(deviceId, transitionAt, status)` makes duplicate inserts no-ops (per `dashboard-timeseries.md` §9.3).
- Replay: safe — final history rows after replay are identical.

### 6.8 Shared consumer behavior (`kafka.StartConsumerWithHeaders`)

The shared helper at [`internal/kafka/consumer.go`](../../internal/kafka/consumer.go) implements all 7 consumer goroutines.

#### Reader configuration (locked, not configurable per-consumer)

```go
kafka.NewReader(kafka.ReaderConfig{
    Brokers:        []string{broker},      // from KAFKA_BROKER env
    Topic:          topic,                  // per-consumer topic
    GroupID:        groupID,                // per-consumer group
    MinBytes:       1e3,                    // 1 KB
    MaxBytes:       10e6,                   // 10 MB
    MaxWait:        10 * time.Second,       // long-poll
    CommitInterval: 0,                      // manual commit
})
```

#### Loop semantics

1. `FetchMessage(context.Background())` — blocking long-poll.
2. On `context.DeadlineExceeded` → debug log, continue (idle / rebalance / poll timeout — normal).
3. On other fetch error → error log, sleep 1s, continue.
4. JSON decode `m.Value` into `T` (the typed message struct).
5. **Decode failure** → error log, **commit offset and skip** (no DLQ, no retry).
6. Extract `m.Headers` into `map[string]string` for trace propagation.
7. Call handler `func(T, map[string]string) error`.
8. **Handler error** → error log, **commit offset and continue** (no retry, no DLQ).
9. **Handler success** → commit offset.
10. Loop forever (no graceful shutdown wired in v1; pod SIGTERM kills the goroutine).

#### Critical operator-visible behaviors

- **No retry on handler error.** Operators MUST monitor logs (`❌ Kafka handler failed`) for failed handlers. The offset is still committed; the message is not re-delivered.
- **No DLQ.** Failed messages are dropped (logged but not preserved). Future enhancement could add a DLQ topic; not in v1.
- **No graceful shutdown.** SIGTERM kills the goroutine mid-processing; the in-flight offset MAY commit or NOT depending on timing. Re-deploy may cause one duplicate or one missing message per partition. Acceptable given at-least-once + idempotent handlers.
- **Manual commit only.** `CommitInterval = 0` means commits happen explicitly per-message via `reader.CommitMessages(...)`. No background batch commit.
- **Long-poll with 10s MaxWait.** Idle pods do not consume CPU on tight loops; Kafka long-polls for new messages.

---

## 7. MQTT / Realtime Surfaces

`N/A — not in scope.` Kafka is the only async transport documented here. MQTT surfaces (e.g. device telemetry) are out of scope of this consumer audit.

---

## 8. Redis / Cache Surfaces

`N/A — not in scope.` This contract is Kafka-only. Stream-session Redis is documented in `media-stream-redis.md`.

---

## 9. Sync / Field-Ownership Surfaces

### 9.1 Cross-Surface Lifecycle

```
┌───────────────┐     produces     ┌───────────────────┐     consumes     ┌────────────────────┐
│  gateway-api  │ ───────────────▶ │  Kafka cluster    │ ───────────────▶ │  klynx-api (main)   │
│  ingest pipeline│                  │ gw.events.norm... │                  │  gweventscons       │
└───────────────┘                   │ gw.delivery.statu │                  │  gwdeliverycons     │
                                    │ gw.sources.chan...│                  │  gwsourcecons       │
                                    │ gw.devices.chan...│                  │  gwdevicecons       │
                                    │ gw.assets.chan... │                  │  gwassetcons        │
                                    │ gw.workspace.prov │                  │  workspaceprovcons  │
                                    └───────────────────┘                  └─────────┬──────────┘
                                                                                     │
                                                                                     ▼
                                                                  klynx Mongo projections:
                                                                    - event_refs (index + delivery status)
                                                                    - org_source_config
                                                                    - camera, kctrl projection
                                                                    - asset projection (when wired)
                                                                    - organizations.{workspaceId, eventIngestUri}

┌───────────────┐  klynx-internal Kafka ┌───────────────────┐ consumes ┌────────────────────┐
│ klynx-api main│ ────────────────────▶ │  Kafka cluster    │ ───────▶ │ klynx-api commonmon │
│  kctrlsvc     │                       │ kcontrol.status...│          │  kctrlcons (bridge) │
└───────────────┘                       └───────────────────┘          └─────────┬──────────┘
                                                                                  │
                                                                                  ▼
                                                                   klynx Mongo:
                                                                    - camera_monitor_status_history
                                                                    - camera_monitor_status (kctrl-derived)
                                                                   (mode controlled by
                                                                    CAMMONITOR_KCTRL_BRIDGE_MODE)
```

### 9.2 Field Ownership

| Field | Authoritative Writer | Allowed Initiator | Stored In | Notes |
|---|---|---|---|---|
| `event_refs.{eventId, workspaceId, orgId, deviceId, deviceName, eventType, ...}` | `gweventscons` | gw normalized event delivery | klynx Mongo `event_refs` | upsert by eventId; gw is canonical for the event itself |
| `event_refs.deliveryStatus` | `gwdeliverycons` | gw delivery dispatch | klynx Mongo `event_refs` | last-write-wins; no version |
| `org_source_config.*` | `gwsourcecons` (via `OrgSourceConfigService.UpdateSourceConfig`) | gw source registry | klynx Mongo (svc-impl-specific) | upsert per change |
| `klynx.camera` / `klynx.kctrl` (gw-derived fields) | `gwdevicecons` (via `DeviceSyncService.SyncFromGW`) | gw `device_management` | klynx Mongo (camera / kctrl projection) | sync-direction one-way (gw → klynx) on this surface; klynx-side CRUD is REST (separate path) |
| Asset projection | `gwassetcons` (via `AssetSyncService.SyncFromGW` — if wired) | gw asset registry | (klynx asset projection, when implemented) | currently no-op when svc nil |
| `organizations.{workspaceId, eventIngestUri}` | `workspaceprovcons` (via `OrgWorkspaceService.UpdateWorkspaceRef`) | gw workspace provisioner (or klynx self under saasPublic round-trip) | klynx Mongo `organizations` | round-trip ack with klynx itself |
| `camera_monitor_status_history` (kctrl-derived rows) | `kctrlcons` bridge → `commonmonsvc.HandleKctrlStatusChanged` | klynx-internal kctrl Kafka | klynx Mongo | unique index `(deviceId, transitionAt, status)` makes duplicates no-ops; bridge mode controls writer authority vs probe orchestrator |
| Kafka offset (consumer position) | `kafka.StartConsumerWithHeaders` (per-consumer goroutine) | per-message `CommitMessages` after handler success or skip | Kafka consumer-group `__consumer_offsets` topic | manual commit (CommitInterval=0) |

### 9.3 Conflict Resolution

- **`event_refs` upsert race** (`gweventscons` vs `gwdeliverycons` for the same eventId): `gweventscons` writes are full-record upserts; `gwdeliverycons` writes are field-level updates of `deliveryStatus` only. The two paths do not overwrite each other's fields.
- **`event_refs.deliveryStatus` last-write-wins:** repeated delivery-status messages for the same eventId are processed in arrival order; the last one wins. Out-of-order delivery may cause transient flapping but converges.
- **Workspace ack idempotency:** `UpdateWorkspaceRef` updates `organizations.{workspaceId, eventIngestUri}` if not set OR if values match the request. Conflicting values surface as service error (logged; offset committed; no retry — operator must reconcile via admin tools).
- **Bridge mode resolution:** when `CAMMONITOR_KCTRL_BRIDGE_MODE = shadow`, both probe orchestrator and kctrl bridge can write `camera_monitor_status_history`. The unique index `(deviceId, transitionAt, status)` resolves duplicates as no-ops; divergences (different `state` for same `(deviceId, transitionAt)`) are logged.
- **Consumer group rebalance:** Kafka rebalancing during pod scale-up / scale-down triggers the `context.DeadlineExceeded` debug-log path; consumer continues seamlessly. No message loss or duplicate processing within the at-least-once guarantee.
- **Cross-binary kctrl bridge:** main binary publishes; commonmon binary consumes. Both must be deployed before the publishing path is exercised — see `dashboard-timeseries.md` §3 binary deploy order (commonmon first, main second).
- **No DLQ → operator monitoring required:** failed messages are committed and skipped. Operators MUST monitor logs (`❌ Kafka handler failed`) and reconcile state via admin tooling (e.g. `POST /admin/subscriptions/reconcile` for the subscription side; admin reprovision endpoints for workspace; reset offsets via Kafka admin to replay).

### 9.4 Trace Propagation

All 7 consumers extract trace context using `traceutil.ExtractHeaders(context.Background(), headers)`. The producer side (gateway-api or klynx-api main binary) MUST inject traceparent / tracestate via `traceutil.InjectHeaders(ctx, headers)` before publishing. Without producer-side injection, klynx consumer starts a fresh root span (orphaned from the producer's call chain).

This propagation is critical for observability — a single normalized event traced end-to-end goes:
- gateway-api ingest → produce `gw.events.normalized.v1` (traceparent injected)
- klynx-api `gweventscons` → consume + extract traceparent → child span "gweventscons.normalized.consume"
- klynx-api `ingestsvc.HandleNormalized` → child span (continues trace)
- klynx-api `event_refs.Upsert` → child span (continues trace)

Same for delivery status, devices, sources, etc.

---

## 10. Frontend Integration Notes

This is a backend / ops contract. FE consumers see this surface indirectly through:

- `event_refs.deliveryStatus` field on klynx event-list responses (`GET /api/v3/events`) — populated by `gwdeliverycons`.
- Camera availability / sync state in klynx-side projection — populated by `gwdevicecons`.
- Workspace `provisionStatus` transitioning to `active` after Kafka round-trip under saasPublic — populated by `workspaceprovcons`.

### FE Guardrails

- Do not assume Kafka delivery is synchronous. The 202 response on saasPublic `POST /api/v3/ingest/reprovisionWorkspace` returns BEFORE the workspace mirror is updated — caller polls via `GET /api/v3/ingest/`.
- Do not retry aggressively on stale `deliveryStatus` — at-least-once delivery means status updates may arrive seconds-minutes after the actual event.
- Do not query Kafka directly from FE. All consumer effects are observable only through klynx REST surfaces (event lists, camera sync state, etc.).

---

## 11. Rollout Notes

| Repo | Dependency | Required | Notes |
|---|---|---|---|
| `klynx-api` | this contract | n/a | documents shipped behavior; no new BE work |
| `gateway-api` | continues producing all `gw.*` topics | required | klynx consumers depend on producers being live |
| Kafka cluster | available + connection-pool config tuned for long-poll consumers | required | `MinBytes 1KB / MaxBytes 10MB / MaxWait 10s` |
| `klynx-api` deployment | `KAFKA_BROKER` env required | required | `KAFKA_GROUP` env optional (per-consumer fallback applies) |
| `klynx-api` deployment | `KAFKA_TOPIC_GW_*` env optional (per-topic override) | optional | when not set, consumers default to canonical `gw.*` names |
| `klynx-api` deployment | DEPLOYMENT_PROFILE wiring | required | `appliance` and `platform` profiles wire all 6 gw consumers + workspace consumer; `saasPublic` may skip subset |
| `klynx-api` commonmon binary | `KAFKA_TOPIC_KCTRL_STATUS_CHANGED` env (passed to `StartKafkaStatusChangedBridge`) | required for kctrl bridge | bridge mode `CAMMONITOR_KCTRL_BRIDGE_MODE` controls writer authority |

**Status:** all 7 consumers shipped in 4.x. This contract is documentation-only.

### Operator runbook items

- **To replay a single consumer:** use Kafka admin tooling (`kafka-consumer-groups.sh --reset-offsets --to-earliest --group <groupID> --topic <topic> --execute`). Group IDs follow the pattern in §4.
- **To monitor handler errors:** grep logs for `❌ Kafka handler failed` (per-topic + per-partition + per-offset). Errors do NOT block the consumer — operator must follow up manually.
- **To verify trace propagation:** check that consumer spans (`gweventscons.normalized.consume`, etc.) in OTel collector show the producer trace ID as parent. Orphaned consumer spans indicate producer-side traceparent injection is missing.
- **To check consumer lag:** Kafka admin tooling (`kafka-consumer-groups.sh --describe --group <groupID>`). Healthy lag < 100 messages typically.
- **For kctrl bridge mode change:** update `CAMMONITOR_KCTRL_BRIDGE_MODE` env on the commonmon deployment and restart. The mode is read once at startup; rolling restart applies the new mode.
- **For asset domain wiring:** when asset svc is implemented, replace `nil` with an `AssetSyncService` impl in the container; consumer goroutine continues unchanged. Backfill is the responsibility of the new service (the consumer only handles new events).

---

## 12. Examples

### 12.1 Happy path — normalized event end-to-end

```text
T=0    gateway-api ingest receives webhook from device
       gateway-api normalizes event → eventId=E1, workspaceId=W1, orgId=O1
       gateway-api Kafka produce gw.events.normalized.v1 (traceparent injected)

T=10ms klynx-api gweventscons consumes (group=klynx-prod.gw.events.normalized.v1)
       extracts traceparent → child span "gweventscons.normalized.consume"
       calls IngestFacade.HandleEvent → ingestsvc.HandleNormalized
       writes event_refs upsert: {eventId: E1, workspaceId: W1, orgId: O1, deliveryStatus: ""}
       commits Kafka offset

T=50ms gateway-api delivery dispatch finds delivery target for W1
       sends webhook → success
       gateway-api Kafka produce gw.delivery.status.v1 (eventId=E1, status="delivered")

T=60ms klynx-api gwdeliverycons consumes (group=klynx-prod.gw.delivery.status.v1)
       calls EventRefsUpdater.UpdateDeliveryStatus(ctx, "E1", "delivered")
       event_refs[eventId=E1].deliveryStatus = "delivered"
       commits Kafka offset

T=70ms klynx-feature: GET /api/v3/events → returns E1 with deliveryStatus="delivered"
```

### 12.2 Consumer-side handler error (commit-and-continue)

```text
gwdeliverycons receives delivery status for eventId=E2 (not yet in event_refs because gweventscons hasn't processed normalized event yet)
EventRefsUpdater.UpdateDeliveryStatus → returns ErrEventNotFound
log: "❌ gwdeliverycons: update event_refs deliveryStatus failed"
helper commits offset + continues to next message

E2's delivery status is LOST (not retried, not DLQ'd).
Operator monitoring catches the error log, reconciles via reset offset OR accepts loss
   (subsequent re-delivery from gw will arrive via Kafka if gw-side retry logic exists).
```

### 12.3 Decode failure (poison pill)

```text
gateway-api accidentally produces a malformed JSON message to gw.events.normalized.v1
gweventscons consumer:
  json.Unmarshal fails
  log: "❌ Failed to decode Kafka message" (with topic, partition, offset)
  helper commits offset + continues

Message is dropped (no DLQ in v1).
Operator sees the log, must reconcile by:
  1. Identifying the source eventId from gateway-api logs
  2. Manually re-publishing the corrected message OR re-running the gateway ingest path
```

### 12.4 Multi-replica consumer group

```text
Three klynx-api replicas all subscribed with group="klynx-prod.gw.events.normalized.v1":
  Replica A: assigned partition 0, 1
  Replica B: assigned partition 2, 3
  Replica C: assigned partition 4

Each replica consumes ONLY its assigned partitions; Kafka rebalances on scale-up/down.
At-least-once delivery within each partition.
```

### 12.5 Workspace provisioning round-trip (saasPublic)

```text
T=0    User: POST /api/v3/ingest/reprovisionWorkspace (saasPublic profile)
       klynx-api OrganizationService.EnablePhibekWorkspaceForUser:
         1. organizations[orgId].provisionStatus = "provisioning"
         2. Kafka produce gw.workspace.provisioned.v1 (klynxOrgID, workspaceID, eventIngestURI)
       Response: 202 ACCEPTED with provisionStatus="provisioning"

T=50ms gateway-api receives workspace.provisioned message → updates gw-side state
       (no further response on this Kafka topic from gw — klynx itself is producer)

       Wait — actually under saasPublic, klynx-api is BOTH producer AND consumer of this topic.
       The round-trip is: klynx publishes → klynx consumes back → updates own org mirror.

T=100ms klynx-api workspaceprovcons consumes the message it just produced:
        calls OrgWorkspaceService.UpdateWorkspaceRef(orgId, workspaceId, eventIngestURI)
        organizations[orgId].{workspaceId, eventIngestUri, provisionStatus="active"}

T=200ms FE polls GET /api/v3/ingest/ → provisionStatus="active" → user sees workspace ready
```

### 12.6 Kafka offset reset (manual replay)

```text
Operator: kafka-consumer-groups.sh --reset-offsets --to-earliest \
            --group klynx-prod.gw.events.normalized.v1 \
            --topic gw.events.normalized.v1 \
            --execute

klynx-api gweventscons restarts consumption from earliest offset:
  re-processes ALL events since topic creation
  event_refs upserts are idempotent — final state matches steady-state
  trace IDs are NEW for each replay (replays don't preserve original traces)
```

### 12.7 kctrl bridge mode change (compare → cutover)

```text
Operator: edit commonmon deployment manifest
  CAMMONITOR_KCTRL_BRIDGE_MODE: "compare" → "cutover"
  rolling restart commonmon pods

After restart: kctrlcons.StartKafkaStatusChangedBridge reads mode at startup
  "cutover" mode tells commonmonsvc.HandleKctrlStatusChanged to write
   camera_monitor_status_history without comparison against probe writes;
   probe orchestrator stops writing kctrl-derived rows.
```

### 12.8 Asset consumer no-op (current state)

```text
klynx-api startup wires: assetSvc = nil (asset domain not yet implemented)
gwassetcons.StartAssetChangedConsumer goroutine starts:
  subscribes to gw.assets.changed.v1
  receives every message, calls handler, handler returns nil (svc is nil)
  commits offset, continues

No data is written; consumer is effectively a "tap that drains the topic".
When asset domain ships, replace nil with real impl; consumer behavior changes seamlessly.
```

### 12.9 Consumer group lag alert

```text
Operator monitoring: kafka-consumer-groups.sh --describe --group klynx-prod.gw.delivery.status.v1
  Topic                       Partition  Current  LogEnd   Lag
  gw.delivery.status.v1       0          1234     1500     266

Lag = 266 messages → klynx-api is processing slower than gateway-api is producing.
Possible causes: handler error rate spike, Mongo write contention, replica scale insufficient.
Operator action: scale klynx-api replicas, or check `❌ Kafka handler failed` log rate.
```

### 12.10 Trace orphan (producer missed traceparent injection)

```text
gateway-api makes a code change that publishes gw.events.normalized.v1 WITHOUT calling
  traceutil.InjectHeaders(ctx, headers).

klynx-api gweventscons consumer:
  traceutil.ExtractHeaders(context.Background(), headers) finds no traceparent
  starts a NEW root span "gweventscons.normalized.consume" (not child of gw producer)

OTel collector shows orphan span (no parent_span_id) → ops grep alerts on this.
Fix: revert producer-side change to ensure traceparent is always injected.
```

---

## 13. Out of Scope (Not in This Contract)

- Producer-side wiring on `gateway-api` for any of the 6 `gw.*` topics — owned by gateway-api.
- Payload schema authority (`eventbridge.NormalizedEvent`, `DeliveryStatusEvent`, `SourceChangedEvent`, `DeviceChangedEvent`, `AssetChangedEvent`, `WorkspaceProvisionedEvent`) — gateway-api / `eventbridge` package documentation owns the wire shape.
- Klynx Kafka producers (`kwatchpub`, `orgpub`, `entitlementpub`, `streamzkt.publishKliveEvent`, kctrl status `kafka.publish` from `kctrlsvc.HandleStatusChanged`) — separate producer audit.
- Klynx-internal Kafka consumers NOT consuming `gw.*` topics (`authzcons`, `iwowncons`, `kwatchcons`, `kaicons`, `atacons`, `kschcorns`, `klivecorns`, `kctrlcons/{health,alarm,sensor,event}`) — separate contracts; not in this audit.
- DLQ implementation — deferred.
- Graceful shutdown / SIGTERM handling — deferred.
- Backpressure / circuit breaker — deferred.
- Retry-with-backoff on handler error — deferred (current behavior is commit-and-continue).
- `gw.events.normalized.v1` payload schema migration history — covered by `delivery-topic-unification.md` (gw-side).
- Klive event topics produced from `streamzkt` (`klive.play.started`, `klive.play.denied`, `media.hook.on_play`, `media.hook.on_publish`) — sibling producer surface; future contract if needed.
- ZLM webhook handlers — covered by `media-stream-redis.md` §5.

---

## 14. Decisions

- **Group ID pattern locked:** `<KAFKA_GROUP>.<topic>` when env set; per-consumer fallback otherwise. The kctrl bridge appends `.bridge` suffix to ensure isolation from any future main-side consumer of the same topic.
- **Commit-and-continue on handler error:** baked into the shared helper. No retry, no DLQ in v1. Operators must monitor logs.
- **Decode-failure same:** JSON unmarshal failure commits and skips. Logged but not retried.
- **W3C trace propagation MANDATORY:** all consumers extract via `traceutil.ExtractHeaders`. Producers MUST inject via `traceutil.InjectHeaders` (orphaned spans indicate producer-side defect).
- **No graceful shutdown in v1:** SIGTERM kills goroutines mid-processing. At-least-once + idempotent handlers absorb the resulting one-duplicate-or-one-miss-per-partition.
- **`gwassetcons` shipped but unwired:** consumer goroutine subscribes and no-ops when `assetSvc == nil`. Reserved for future asset domain.
- **kctrl bridge runs in `commonmon` binary, NOT `main`:** different consumer group (`.bridge` suffix), different deploy unit.
- **Manual commit only:** `CommitInterval = 0` ensures per-message commit. No background batch commit.
- **Long-poll 10s:** balances latency and Kafka load.
- **No retry-with-backoff:** acceptable given idempotent projection writes + last-write-wins / unique index resolution rules.

---

## 15. Implementation evidence

| Surface | File | Note |
|---|---|---|
| Shared helper | [internal/kafka/consumer.go](../../internal/kafka/consumer.go) | `StartConsumerWithHeaders[T any]`, manual commit, commit-and-continue on error, decode-failure skip, header extraction |
| `gw.events.normalized.v1` consumer | [internal/kafka/gweventscons/consumer.go](../../internal/kafka/gweventscons/consumer.go) | `StartNormalizedEventsConsumer(facade *eventbridge.IngestFacade)` |
| `gw.delivery.status.v1` consumer | [internal/kafka/gwdeliverycons/consumer.go](../../internal/kafka/gwdeliverycons/consumer.go) | `StartDeliveryStatusConsumer(auditSvc, eventRefsUpdater)`; updates `event_refs.deliveryStatus` |
| `gw.sources.changed.v1` consumer | [internal/kafka/gwsourcecons/consumer.go](../../internal/kafka/gwsourcecons/consumer.go) | `StartSourceChangedConsumer(orgSvc OrgSourceConfigService)` |
| `gw.devices.changed.v1` consumer | [internal/kafka/gwdevicecons/consumer.go](../../internal/kafka/gwdevicecons/consumer.go) | `StartDeviceChangedConsumer(svc DeviceSyncService)`; testable via `makeHandler` extraction |
| `gw.assets.changed.v1` consumer | [internal/kafka/gwassetcons/consumer.go](../../internal/kafka/gwassetcons/consumer.go) | `StartAssetChangedConsumer(assetSvc AssetSyncService)`; nil-safe (no-op when svc nil) |
| `gw.workspace.provisioned.v1` consumer | [internal/kafka/workspaceprovcons/consumer.go](../../internal/kafka/workspaceprovcons/consumer.go) | `StartWorkspaceProvisionedConsumer(orgSvc OrgWorkspaceService)`; round-trip ack with klynx-api itself under saasPublic |
| `kcontrol.statusChanged` bridge consumer | [internal/kafka/kctrlcons/statusChangedBridge.go](../../internal/kafka/kctrlcons/statusChangedBridge.go) | `StartKafkaStatusChangedBridge(broker, topic, *commonmonsvc.Service)`; `.bridge` group suffix; commonmon binary |
| Trace propagation | `utils/traceutil/InjectHeaders` (producer) + `traceutil.ExtractHeaders` (consumer) | W3C-compatible |
| `eventbridge` types | [internal/eventbridge/types.go](../../internal/eventbridge/types.go) | `NormalizedEvent`, `DeliveryStatusEvent`, `SourceChangedEvent`, `DeviceChangedEvent`, `AssetChangedEvent`, `WorkspaceProvisionedEvent` mirrors |
| Tests | `internal/kafka/gwdevicecons/consumer_test.go` (only consumer with shipped tests) | demonstrates testable handler extraction pattern |

---

## 16. Checklist

- [x] Domain / flow boundary explicit (§0 — 7 consumer surfaces; explicit excludes for producer-side, klynx-internal non-gw consumers, klynx producers, ZLM webhooks, payload schemas).
- [x] Owner backend explicit (`klynx-api` consumer side; `gateway-api` producer side out of scope).
- [x] System of record per domain (gw is canonical for events / delivery / sources / devices / assets / workspace; klynx writes projections only).
- [x] Producers and consumers listed for every surface (7 topics + group-ID pattern + handler entrypoint + binary).
- [x] All Kafka topics documented (topic resolution, group ID resolution, message envelope, handler logic, idempotency, replay).
- [x] Group ID `.bridge` suffix on kctrl bridge preserved.
- [x] Cross-binary deployment of kctrl bridge (main produces, commonmon consumes) preserved.
- [x] saasPublic round-trip pattern for workspace provisioned preserved.
- [x] `gwassetcons` shipped-but-unwired-pending-asset-domain status preserved.
- [x] Shared helper behavior locked (long-poll 10s, manual commit, commit-and-continue, decode-failure skip, no DLQ, no graceful shutdown).
- [x] W3C trace propagation rule preserved.
- [x] Idempotency rules per-handler preserved (event_refs upsert, deliveryStatus last-write-wins, unique index on history).
- [x] At-least-once delivery acknowledgement preserved.
- [x] Replay via offset reset preserved + operator runbook.
- [x] Bridge mode (`CAMMONITOR_KCTRL_BRIDGE_MODE`) enumerated (shadow / compare / cutover).
- [x] DEPLOYMENT_PROFILE wiring rules preserved (appliance + platform default; saasPublic selective).
- [x] REST surfaces N/A — explained.
- [x] MQTT N/A — explained.
- [x] Redis N/A — explained.
- [x] Field ownership table preserved.
- [x] Conflict resolution rules preserved (event_refs race; deliveryStatus last-write-wins; workspace ack idempotency; bridge mode; consumer group rebalance; cross-binary kctrl deploy; no DLQ).
- [x] Backward compatibility documented (n/a — new contract).
- [x] Replay / re-sync behavior documented per surface.
- [x] FE integration notes preserved.
- [x] Operator runbook preserved (replay, monitor errors, verify trace, check lag, bridge mode change, asset wiring).
- [x] Examples cover happy path, handler error, poison pill, multi-replica, saasPublic round-trip, manual replay, bridge mode change, asset consumer no-op, lag alert, trace orphan.
- [x] Decisions preserved (group ID pattern, commit-and-continue, no retry / DLQ / graceful shutdown, mandatory trace propagation, asset reserved, bridge in commonmon binary).
- [x] Implementation evidence table preserved.
