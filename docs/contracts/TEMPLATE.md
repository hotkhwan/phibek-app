# <Domain / Flow Name> Contract

**Date:** <YYYY-MM-DD>
**Status:** Draft
**Owner Backend:** `<owner-backend-repo>`
**Related Plan:** [docs/plan/<name>.md](../plan/<name>.md)
**Applies To Repos:** `<repo-a>`, `<repo-b>`, `<repo-c>`
**Contract Type:** `<REST | OpenAPI | Kafka | MQTT | Redis | Sync | Cache | REST + Kafka | REST + MQTT | REST + Redis | REST + Kafka + Redis | Full Flow>`
**Version:** `<v1>`

> **Contracts in `docs/contracts/` are shared cross-repo / cross-service integration contracts. They are NOT a Swagger / OpenAPI dump.**
>
> A contract may cover any combination of surfaces — REST, Kafka, MQTT, Redis cache, sync flow, idempotency, replay, write authority, field ownership, rollout compatibility — as long as those surfaces belong to the same domain or the same flow. OpenAPI / Swagger is one *subset* (the REST schema). When the REST schema is large or needs formal codegen, mirror it under [openapi/<name>.yaml](../../openapi/) and link to it from this file — but the cross-repo behavior, ownership, and async surfaces still live here.

---

## 0. Domain / Flow Boundary

This section defines what the contract owns and — equally important — what it does **not** own. A reader should be able to tell from this section alone whether they are in the right file.

| Field | Value |
|---|---|
| Domain name | `<e.g. device-camera-sync, events-normalized, media-access-control>` |
| Flow name | `<e.g. camera onboarding, normalized event delivery, MQTT presence sync>` |
| Lifecycle scope | `<e.g. create → activate → publish → revoke>` |

### Included Surfaces

List every surface (REST endpoint, Kafka topic, MQTT topic, Redis key pattern, sync rule, cache invalidation hook) that belongs to this contract.

| Surface Type | Name | Purpose |
|---|---|---|
| `<REST>` | `<METHOD /path>` | `<purpose>` |
| `<Kafka>` | `<topic-name>` | `<purpose>` |
| `<MQTT>` | `<topic-pattern>` | `<purpose>` |
| `<Redis>` | `<key-pattern>` | `<purpose>` |
| `<Sync rule>` | `<rule name>` | `<purpose>` |

### Excluded Surfaces

List surfaces that *look* related but are intentionally **not** covered here, with a pointer to the contract that does cover them.

| Surface | Why excluded | Authoritative Contract |
|---|---|---|
| `<surface>` | `<different domain / different flow / different lifecycle>` | [`<other-contract.md>`](./<other-contract>.md) |

### Related Contracts

| Contract | Relationship |
|---|---|
| [`<contract-a.md>`](./<contract-a>.md) | `<upstream / downstream / sibling / supersedes / superseded by>` |
| [`<contract-b.md>`](./<contract-b>.md) | `<relationship>` |

### Grouping Rule (read before splitting this contract)

A contract should hold **all surfaces that must be read together to understand the flow**. Specifically:

- **Group together** when the surfaces share lifecycle, write authority, or invalidation triggers — e.g. `POST /foo` that writes Mongo → emits `foo.created.v1` Kafka → invalidates `cache:foo:*` Redis → publishes `gw/foo/{id}/state` MQTT. Splitting this into 4 files forces the reader to chase pointers and miss ordering rules.
- **Split into separate contracts** when the surfaces belong to different domains or to flows that can change independently — e.g. `media-access-control.md` (REST + permission policy) is a sibling, not a sub-section, of `events-normalized-v1.md` (Kafka + projection store).
- **Default to one file per domain/flow.** Per-endpoint or per-topic micro-contracts are an anti-pattern: they fragment ownership and let drift accumulate between surfaces that must stay consistent.
- **OpenAPI offload:** if the REST surface is large and benefits from machine-readable codegen, put the schema in [openapi/<name>.yaml](../../openapi/) and reference it from §"REST Surfaces" below. Do not duplicate field tables — link.

---

## 1. Purpose

Describe what this contract exists for and which systems must consume it.

- Backend owner publishes this document as the source of truth.
- Frontend, peer backends, and 3rd-party integrators must implement against this contract.
- Consumers must not infer endpoint names, payload shape, error schema, cache keys, MQTT topics, or sync rules from partial code behavior, network traces, or screenshots.

---

## 2. Ownership

### Owner Backend

- `<owner backend repo>`

### Domain System of Record

| Domain | System of Record | Canonical Store | Notes |
|---|---|---|---|
| `<domain>` | `<repo/service>` | `<table/collection>` | `<why canonical>` |
| `<domain>` | `<repo/service>` | `<table/collection>` | `<projection note>` |

### Producer / Consumers

| Surface | Producer | Consumers | Notes |
|---|---|---|---|
| `<endpoint/topic/key>` | `<service>` | `<repo/service>` | `<purpose>` |
| `<endpoint/topic/key>` | `<service>` | `<repo/service>` | `<purpose>` |

### Projection Stores

| Projection | Store | Consumer | Notes |
|---|---|---|---|
| `<projection>` | `<table/collection/cache key>` | `<service>` | `<summary>` |

---

## 3. Compatibility and Policy

### Backward Compatibility

- Compatibility status: `<compatible | additive | breaking>`
- Consumer requirements: `<minimum version or behavior>`
- Deprecation window: `<if any>`

### Replay / Re-sync Behavior

- Replay supported: `<yes/no>`
- Re-sync trigger: `<how>`
- Duplicate delivery rule: `<how duplicates are ignored>`

### Write Authority Policy

- `<authoritative system>` is the source of truth for `<domain>`.
- `<secondary system>` may initiate change requests but is not the authoritative writer.
- Projection stores and caches must not be treated as canonical stores.

---

## 4. Surface Summary

Restate every endpoint, topic, key pattern, and sync rule covered by this contract — one row per surface. This is the quick-reference index; details live in §5–§9 below.

| Type | Name | Method / Topic / Key | Auth / Trust | Producer / Handler | Consumer / Caller |
|---|---|---|---|---|---|
| `<REST>` | `<path>` | `<GET/POST/etc.>` | `<auth>` | `<handler>` | `<caller>` |
| `<Kafka>` | `<topic>` | `<topic-name>` | `<producer trust boundary>` | `<producer>` | `<consumer>` |
| `<MQTT>` | `<topic-pattern>` | `<topic-pattern>` | `<auth / ACL>` | `<publisher>` | `<subscriber>` |
| `<Redis>` | `<key-pattern>` | `<key-pattern>` | `<owner>` | `<writer>` | `<reader>` |

> Use only the subsections below that are listed in §0 "Included Surfaces". Mark unused subsections `N/A — not in scope` and explain why in one line.

---

## 5. REST Surfaces

> **Optional.** Use only when this contract covers REST endpoints. If the schema is large enough to warrant OpenAPI, write it in [openapi/<name>.yaml](../../openapi/) and link here instead of duplicating field tables.

Duplicate §5.x per endpoint as needed.

### 5.1 `<Endpoint Name>`

**Endpoint:** `<path>`
**Method:** `<GET | POST | PUT | PATCH | DELETE>`
**Auth:** `<headers / roles / token rules>`
**Purpose:** `<what it does>`

#### Path Params

| Field | Type | Required | Description |
|---|---|---|---|
| `<field>` | `<type>` | `<yes/no>` | `<description>` |

#### Query Params

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `<field>` | `<type>` | `<yes/no>` | `<value>` | `<description>` |

#### Request Headers

| Header | Required | Description |
|---|---|---|
| `Authorization` | yes | `Bearer <jwt>` |
| `X-Active-Org` | yes | `<org or workspace scoping>` |
| `<header>` | `<yes/no>` | `<description>` |

#### Request Body

```json
{
  "<field>": "<value>"
}
```

#### Request Field Definitions

| Field | Type | Required | Owner | Description |
|---|---|---|---|---|
| `<field>` | `<type>` | `<yes/no>` | `<owner>` | `<description>` |

#### Success Response

**HTTP:** `<200/201/etc.>`

```json
{
  "code": "SUCCESS",
  "details": {
    "<field>": "<value>"
  }
}
```

#### Success Field Definitions

| Field | Type | Description |
|---|---|---|
| `<field>` | `<type>` | `<description>` |

#### Error Contract

| HTTP | Code | Meaning | Consumer Handling |
|---|---|---|---|
| `<400>` | `<ERROR_CODE>` | `<meaning>` | `<what FE/consumer should do>` |
| `<404>` | `<ERROR_CODE>` | `<meaning>` | `<what FE/consumer should do>` |
| `<409>` | `<ERROR_CODE>` | `<meaning>` | `<what FE/consumer should do>` |

#### Error Example

```json
{
  "code": "<ERROR_CODE>",
  "message": "<human readable message>"
}
```

---

## 6. Kafka / Async Event Surfaces

> **Optional.** Use only when this contract covers Kafka topics or other at-least-once event streams.

Duplicate §6.x per topic as needed.

### 6.1 `<Topic Name>`

**Topic:** `<topic-name>`
**Producer:** `<service>`
**Consumers:** `<services>`
**Trigger:** `<when emitted>`
**Delivery Semantics:** `<at-least-once / best-effort / etc.>`

#### Message Envelope

```json
{
  "<field>": "<value>"
}
```

#### Event Field Definitions

| Field | Type | Required | Owner | Description |
|---|---|---|---|---|
| `<field>` | `<type>` | `<yes/no>` | `<owner>` | `<description>` |

#### Ordering / Idempotency

- Ordering key: `<workspaceId / entityId / partition key>`
- Freshness key: `<sourceVersion / occurredAt>`
- Idempotency key: `<eventId / entityId + revision>`
- Duplicate handling: `<ignore / merge / overwrite>`

#### Replay / Recovery

- Consumer behavior on replay: `<expected behavior>`
- Bootstrap or re-sync path: `<backfill / replay job / rebuild projection>`

---

## 7. MQTT / Realtime Surfaces

> **Optional.** Use only when this contract covers MQTT topics or another fan-out realtime channel that the FE or peer services subscribe to. MQTT is a contract surface in its own right — FE must not infer topic patterns or payload shapes from network captures.

Duplicate §7.x per topic pattern as needed.

### 7.1 `<Topic Pattern>`

**Topic Pattern:** `<topic/pattern/with/{placeholders}>`
**Publisher:** `<service / device-class>`
**Subscribers:** `<FE app / service>`
**Trigger:** `<when published>`

#### Topic Variables

| Placeholder | Source | Required | Description |
|---|---|---|---|
| `{orgId}` | `<auth context>` | yes | `<org scoping>` |
| `{deviceId}` | `<device registry>` | yes | `<device scoping>` |
| `<placeholder>` | `<source>` | `<yes/no>` | `<description>` |

#### Payload Schema

```json
{
  "<field>": "<value>"
}
```

| Field | Type | Required | Owner | Description |
|---|---|---|---|---|
| `<field>` | `<type>` | `<yes/no>` | `<owner>` | `<description>` |

#### QoS / Retain Policy

- QoS level: `<0 | 1 | 2>` and reason
- Retain: `<true | false>` and reason
- Last-will: `<topic + payload>` if applicable
- Clean session: `<true | false>` and reason

#### Auth / ACL

- Connection auth: `<JWT / username+password / mTLS>`
- Topic ACL rule: `<who may publish, who may subscribe, scoped by what>`

#### Reconnect / Resubscribe Behavior

- On reconnect: `<must FE resubscribe? does broker replay missed messages?>`
- On resubscribe: `<is there a snapshot/REST endpoint FE must call to backfill state?>`
- Stale-state risk: `<what payload version / sequence field guards against stale messages?>`
- Drop policy: `<does FE drop out-of-order messages, or merge by sequence?>`

#### Fallback Path

- If MQTT is unavailable, the contract defines a REST fallback or polling path: `<endpoint or N/A>`.
- FE must not implement its own fallback shape — it must call the documented fallback or surface the outage.

---

## 8. Redis / Cache Surfaces

> **Optional.** Use only when this contract covers Redis keys (or another shared cache) that more than one service reads or writes, OR a cache whose stale-read behavior is observable to the FE/3rd-party. Internal-only caches that are private to one service do not need a contract entry.

Duplicate §8.x per key pattern as needed.

### 8.1 `<Key Pattern>`

**Key Pattern:** `<namespace:scope:{placeholder}>`
**Value Shape:** `<JSON | string | hash | sorted-set | list>`
**Owner / Writer:** `<service that owns the key>`
**Readers:** `<services that read the key>`

#### Key Variables

| Placeholder | Source | Required | Description |
|---|---|---|---|
| `{orgId}` | `<auth context>` | yes | `<org scoping>` |
| `<placeholder>` | `<source>` | `<yes/no>` | `<description>` |

#### Value Schema

```json
{
  "<field>": "<value>"
}
```

| Field | Type | Required | Owner | Description |
|---|---|---|---|---|
| `<field>` | `<type>` | `<yes/no>` | `<owner>` | `<description>` |

#### TTL Policy

- TTL: `<duration or "no expiry">`
- Refresh-on-read: `<yes / no>` — if yes, by how much
- TTL alignment: `<aligned with upstream source freshness? aligned with token TTL? aligned with realtime tick?>`

#### Invalidation Trigger

| Trigger | Source | Effect | Notes |
|---|---|---|---|
| `<event>` | `<service or topic>` | `<DEL / HDEL / overwrite>` | `<why>` |
| `<event>` | `<service or topic>` | `<DEL / HDEL / overwrite>` | `<why>` |

#### Stale-Read Behavior

- What does a reader see between invalidation and re-fill? `<empty / last value / fallback to canonical store>`
- Is stale-read observable to the user? `<yes / no>` and `<how it should be presented>`
- How does the consumer detect a stale value? `<version field / occurredAt / hash>`
- What does the consumer do on stale-detect? `<ignore / fall back to REST canonical / wait>`

#### Concurrency

- Lock pattern: `<SETNX / Redlock / N/A>`
- Race window: `<expected race conditions and how they are handled>`

---

## 9. Sync / Field-Ownership Surfaces

> **Optional.** Use only when this contract covers data that exists in more than one store and may be written by more than one initiator. This is the section that prevents dual-write disasters — if synchronized data is in scope, it is **not** optional.

### 9.1 Canonical and Projection Mapping

#### Canonical Store

- System: `<repo/service>`
- Store: `<table/collection>`
- Canonical fields: `<list>`

#### Projection Store

- System: `<repo/service>`
- Store: `<table/collection/cache>`
- Projected fields: `<list>`

#### Field Mapping

| Canonical Field | Projection Field | Consumer Field | Notes |
|---|---|---|---|
| `<canonical>` | `<projection>` | `<frontend/backend field>` | `<transform>` |
| `<canonical>` | `<projection>` | `<frontend/backend field>` | `<transform>` |

### 9.2 Field Ownership

| Field | Authoritative Writer | Allowed Initiator | Stored In | Notes |
|---|---|---|---|---|
| `<field>` | `<service>` | `<service>` | `<store>` | `<rule>` |
| `<field>` | `<service>` | `<service>` | `<store>` | `<rule>` |

### 9.3 Conflict Resolution

- If multiple systems can initiate changes, define which system persists first.
- Define whether consumers ignore stale revisions, compare hashes, or merge conditionally.
- Define how echo-loop prevention works if sync is bidirectional at the initiation layer.
- Define the order of operations across REST → Kafka → Redis → MQTT when one user-facing action touches all four.

---

## 10. Frontend Integration Notes

### Required FE Inputs

| FE Use Case | Contract Surface | Required Fields | Notes |
|---|---|---|---|
| `<screen>` | `<endpoint/topic/key>` | `<fields>` | `<notes>` |
| `<screen>` | `<endpoint/topic/key>` | `<fields>` | `<notes>` |

### Example FE Payload Mapping

| FE Field | Backend Field | Direction | Notes |
|---|---|---|---|
| `<fe field>` | `<backend field>` | `<request/response>` | `<notes>` |
| `<fe field>` | `<backend field>` | `<request/response>` | `<notes>` |

### FE Guardrails

- Do not guess undocumented fields, undocumented MQTT topics, or undocumented Redis-visible behavior.
- Do not rely on implicit defaults unless specified here.
- Treat the documented error codes as the only supported error contract.
- For realtime / MQTT surfaces, follow the documented reconnect + resubscribe rules; do not implement private fallback or polling shapes.
- For permission, auth, or sync behavior, follow this contract — not implementation guesswork from network traces.

---

## 11. Rollout Notes

| Repo | Dependency | Required Before | Notes |
|---|---|---|---|
| `<repo>` | `<contract / endpoint / topic / key>` | `<phase>` | `<notes>` |
| `<repo>` | `<contract / endpoint / topic / key>` | `<phase>` | `<notes>` |

---

## 12. Examples

### Example REST Request

```json
{
  "<field>": "<value>"
}
```

### Example REST Success Response

```json
{
  "code": "SUCCESS",
  "details": {
    "<field>": "<value>"
  }
}
```

### Example Kafka Event

```json
{
  "<field>": "<value>"
}
```

### Example MQTT Payload

```json
{
  "<field>": "<value>"
}
```

### Example Redis Value

```json
{
  "<field>": "<value>"
}
```

---

## 13. Smoke Checklist

Use this section as the first-pass validation checklist for the domain/flow. Keep it short enough to run quickly during PR validation. Expand only when the flow is high risk.

### Contract-Read Smoke

- [ ] Happy path can be followed from this contract alone.
- [ ] Auth / scope / permission failure path is documented.
- [ ] Not-found / stale projection path is documented.
- [ ] Cache / retry / replay / reconnect behavior is documented or marked `N/A`.
- [ ] FE fallback / error UX is documented where FE consumes this contract.

### Runtime Smoke

| Case | Surface | Expected Result | Evidence |
|---|---|---|---|
| `<happy path>` | `<REST/Kafka/MQTT/Redis/sync>` | `<expected>` | `<command / screenshot / log / N/A>` |
| `<auth/scope failure>` | `<surface>` | `<expected error>` | `<evidence>` |
| `<not found / stale>` | `<surface>` | `<expected>` | `<evidence>` |

---

## 14. Checklist

- [ ] Domain / flow boundary is explicit (§0 — included surfaces, excluded surfaces, related contracts).
- [ ] Owner backend is explicit.
- [ ] System of record is defined per domain.
- [ ] Canonical store and projection store are documented.
- [ ] Producers and consumers are listed for every surface in scope.
- [ ] REST request, response, and error contracts are defined (or linked from `openapi/<name>.yaml`).
- [ ] Kafka topic schema, ordering key, idempotency, and replay behavior are defined.
- [ ] MQTT topic pattern, payload schema, QoS, retain, ACL, and reconnect/resubscribe behavior are defined.
- [ ] Redis key pattern, value shape, TTL, invalidation triggers, and stale-read behavior are defined.
- [ ] Field ownership is explicit for synchronized fields.
- [ ] Backward compatibility is documented.
- [ ] Replay or re-sync behavior is documented.
- [ ] FE field mapping is included where applicable.
- [ ] Smoke checklist is included and runnable for this domain/flow.
- [ ] Sections that do not apply are explicitly marked `N/A` with a one-line reason.
