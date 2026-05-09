# <Feature Name> Plan

**Date:** <YYYY-MM-DD>
**Status:** Draft
**Review Status:** Pending Codex Review
**Feature Owner Backend:** `default = klynx-api` `<override only with explicit justification>`
**Related Repos:** `klynx-api`, `gateway-api`, `klynx-feature`, `gateway-portal`
**Related Contract:** [docs/contracts/<feature-name>.md](../contracts/<feature-name>.md) — group by domain or flow per [docs/contracts/README.md](../contracts/README.md); a contract may cover REST + Kafka + MQTT + Redis + sync together when they are one lifecycle, with OpenAPI in [openapi/<feature-name>.yaml](../../openapi/) only when the REST schema is large or codegen-driven.
**Supersedes:** `<older-plan-if-any>`
**Depends on:** `<prerequisite phases / contracts / migrations>`

---

## 1. Executive Summary

Briefly describe the feature, bug, or flow change in 3-6 sentences.

- Why this change is needed
- Which backend owns the feature flow
- Which repos consume the resulting contract
- Whether the change is REST-only, event-driven, or hybrid

---

## 2. Scope

### In Scope

- <item>
- <item>
- <item>

### Out of Scope

- <item>
- <item>

### Success Criteria

- <measurable outcome>
- <measurable outcome>

---

## 2A. Standard Cross-Repo Context

Use this section to declare the baseline ownership model for the change. If any default does not apply, replace it explicitly and explain why.

| Context | Default Value | Applies? | Notes |
|---|---|---|---|
| Feature owner backend | `klynx-api` | `<yes/no>` | `<override reason if no>` |
| Events system of record | `gateway-api` | `<yes/no>` | `<notes>` |
| Klynx normalized event consumer | `klynx-api` via `gw.events.normalized.v1` | `<yes/no>` | `<notes>` |
| Device/camera identity and sync state source of truth | `gateway-api/device_management` | `<yes/no>` | `<notes>` |
| Klynx camera model | projection / consumer model | `<yes/no>` | `<notes>` |
| Frontend contract rule | FE must not guess schema | `yes` | `required unless no frontend impact` |

---

## 3. Current State

Describe the current behavior before changes.

### Current Backend Flow

```text
<existing request / event flow>
```

### Current Constraints

- <technical limitation>
- <contract gap>
- <cross-repo dependency>

### Current Risks

- <risk>
- <risk>

---

## 4. Ownership Model

This section is mandatory. Do not write only "owner backend = klynx" without domain detail.

### Feature Owner Backend

- `<owner backend repo>` owns the feature workflow and publishes the contract used by downstream repos.
- If this is not `klynx-api`, explain why the override is correct.

### System of Record by Domain

| Domain | System of Record | Notes |
|---|---|---|
| `Events canonical detail` | `gateway-api` | `default canonical event store` |
| `Klynx event projection` | `klynx-api/event_refs` | `projection only, not canonical` |
| `Device/camera identity and sync state` | `gateway-api/device_management` | `authoritative write side by default` |
| `Klynx camera workflow data` | `klynx-api/camera` | `projection / consumer model for Klynx workflows` |
| `<additional domain>` | `<repo/service/store>` | `<notes>` |

### Producer / Consumer Mapping

| Asset | Producer | Consumer | Notes |
|---|---|---|---|
| `<topic or endpoint>` | `<service>` | `<service>` | `<why it exists>` |
| `<topic or endpoint>` | `<service>` | `<service>` | `<why it exists>` |

### Canonical Store / Projection Store

| Data | Canonical Store | Projection Store | Notes |
|---|---|---|---|
| `<entity>` | `<repo.table/collection>` | `<repo.table/collection>` | `<summary>` |

---

## 5. Proposed Architecture

### Target Flow

```text
<proposed request / event / sync flow>
```

### API / Event Surface

- Added REST endpoints: `<list>`
- Updated REST endpoints: `<list>`
- Added Kafka topics: `<list>`
- Updated Kafka topics: `<list>`
- Added MQTT topics: `<list>`
- Added/updated Redis keys (cross-service-visible): `<list>`
- Added/updated sync rules: `<list>`

### Artifact Output

- Plan: `docs/plan/<feature-name>.md`
- Contract: `docs/contracts/<feature-name>.md` (canonical, covers REST + Kafka + MQTT + Redis + sync + cache + rollout for this domain/flow)
- OpenAPI (optional): `openapi/<feature-name>.yaml`, only when the REST schema is large or codegen-driven; link from the contract `§5. REST Surfaces` and do not duplicate field tables
- Grouping rule: see [docs/contracts/README.md](../contracts/README.md). Default to one contract per domain or flow; do not split per endpoint or per topic if consumers must read all parts together.

Frontend and other consumers must read these artifacts instead of inferring schema from implementation details, network traces, or screenshots — across all surfaces (REST, Kafka, MQTT, Redis-visible behavior, permission, auth, sync).

---

## 6. Contract Summary

Summarize the contract at plan level. Full payload shape belongs in the contract artifact.

| Surface | Method / Topic | Auth | Request | Success Response | Error Contract |
|---|---|---|---|---|---|
| `<endpoint/topic>` | `<verb or topic>` | `<auth rule>` | `<summary>` | `<summary>` | `<summary>` |

### Frontend Impact Summary

- FE must not guess endpoint or payload shape.
- FE must use fields defined in the backend contract artifact.
- Required FE changes:
  - `<screen or client module>`
  - `<query param / field mapping / status handling>`
- If FE1 and FE2 do not change, state why they are unaffected.

---

## 7. Field Ownership and Sync Rules

This section is required for any mirrored, synchronized, or dual-system data.

### Field Ownership Matrix

| Field | Authoritative Writer | Allowed Initiator | Replicated To | Conflict Rule |
|---|---|---|---|---|
| `<field>` | `<service>` | `<service>` | `<service>` | `<rule>` |
| `<field>` | `<service>` | `<service>` | `<service>` | `<rule>` |

### Write Authority Policy

- `<system>` is the authoritative writer for `<domain>`.
- `<secondary system>` may initiate updates but must write through `<authoritative system>` first.
- `<projection system>` must not persist competing canonical values directly.
- For camera/device sync, the default safe policy is:
  - `gateway-api/device_management` persists first
  - `klynx-api` updates projection after sync

### Sync Ownership Rules

- Any update initiated from `<consumer system>` must be written to `<system of record>` first.
- The authoritative system persists the change, emits the sync event or exposes the updated API response, and only then downstream projections update.
- Prevent equal-authority dual write.

### Conflict Resolution / Idempotency

- Primary freshness key: `<sourceVersion | revision | updatedAt>`
- Fallback freshness key: `<occurredAt | updatedAt>`
- Duplicate detection: `<eventId | canonical hash | idempotency key>`
- Replay behavior: `<how repeated delivery is handled>`

---

## 8. Cross-Repo Impact

### Backend Repos

| Repo | Change Type | Required Work |
|---|---|---|
| `<repo>` | `<api / event / storage / consumer>` | `<summary>` |
| `<repo>` | `<api / event / storage / consumer>` | `<summary>` |

### Frontend Repos

| Repo | Change Type | Required Work |
|---|---|---|
| `<repo>` | `<api client / UI / validation>` | `<summary>` |
| `<repo>` | `<api client / UI / validation>` | `<summary>` |

### Breaking Change Assessment

- Is this backward compatible? `<yes/no/partial>`
- If not, what compatibility window is required? `<answer>`
- Which repo can roll out first without breaking others? `<answer>`

---

## 9. Rollout Plan

### Phase Sequencing

1. `<phase 1>`
2. `<phase 2>`
3. `<phase 3>`
4. `<phase 4>`

### Cross-Repo Rollout Order

1. Update backend owner repo and publish contract.
2. Update producing or upstream systems.
3. Update consuming backends and projection logic.
4. Update frontend repos against the published contract.
5. Enable rollout gates or cleanup compatibility code.

### Review Gate

- Codex review status: `<pending / requires revision / approved>`
- Blocking issues: `<list or none>`
- High-risk assumptions: `<list or none>`
- Implementation may start only when review status is `approved`.

### Deployment / Migration Notes

- `<migration>`
- `<index/backfill/replay>`
- `<feature flag>`

---

## 10. Implementation Checklist

### Backend Owner Repo

- [ ] Create or update contract artifact
- [ ] Implement controller / service / repo / gateway changes
- [ ] Add or update producer / consumer wiring
- [ ] Add or update validation and error mapping
- [ ] Add or update tests

### Upstream / Peer Backends

- [ ] `<task>`
- [ ] `<task>`

### Frontend

- [ ] Update API client against contract
- [ ] Update request payload mapping
- [ ] Update success and error handling
- [ ] Validate field usage against contract examples

---

## 11. Risks and Rollback

### Key Risks

- <risk>
- <risk>
- <risk>

### Mitigations

- <mitigation>
- <mitigation>

### Rollback Strategy

- Roll back in reverse rollout order where possible.
- Preserve compatibility for consumers until rollback is complete.
- Define what data requires backfill, replay, or cleanup.
- Explicit rollback steps:
  1. `<step>`
  2. `<step>`
  3. `<step>`

---

## 12. Decision Points

Record unresolved design choices before implementation starts.

| Decision | Options | Recommended | Reason |
|---|---|---|---|
| `<question>` | `<a / b / c>` | `<choice>` | `<tradeoff>` |
| `<question>` | `<a / b / c>` | `<choice>` | `<tradeoff>` |

---

## 13. Validation Checklist

- [ ] Plan names the feature owner backend explicitly.
- [ ] System of record is declared per domain, not globally hand-waved.
- [ ] Contract artifact exists and is linked from the plan.
- [ ] Request, response, and error behavior are defined.
- [ ] Producer, consumer, canonical store, and projection store are identified.
- [ ] Field ownership and write authority are documented for synced data.
- [ ] Cross-repo rollout order is explicit.
- [ ] Rollback path is defined.
- [ ] Tests and verification points are listed.
- [ ] Codex review verdict is captured.
- [ ] FE impact is explicit for FE1 and FE2.

---

## 14. Open Questions

- <question>
- <question>
