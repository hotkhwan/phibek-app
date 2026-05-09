# Template Delivery Gate Contract

**Date:** 2026-04-21
**Status:** Implemented
**Revision:** r1 — contract aligned to delivered implementation (error code `BAD_REQUEST`, `sourceFamily` removed from delivery bag, `source*` fields documented as aliases of `event*`)
**Owner Backend:** `gateway-api`
**Related Plan:** [docs/plan/template-delivery-gate.md](../plan/template-delivery-gate.md)
**Applies To Repos:** `gateway-api`, `gateway-portal`, `klynx-feature` (FE admin if it exposes template editing)
**Contract Type:** `REST`
**Version:** `v1`

---

## 1. Purpose

This contract adds template-level delivery gating to the `MappingTemplate` admin surface. It does not change any event topic shape.

- `gateway-api` publishes this document as the source of truth.
- Frontend admin UIs (gateway-portal, klynx-feature admin) must implement against it.
- Consumers must not infer field semantics from partial code behavior; in particular, consumers must not assume `matchAll` / `matchAny` gate delivery — they do not.

Two distinct rule sets exist on a template:

| Rule Set | Field | Evaluated At | Purpose |
|---|---|---|---|
| **Normalization Selector** | `matchAll`, `matchAny` | Ingest (raw payload → raw.events) | Selects which template applies to a raw event for normalization. |
| **Delivery Filter** | `deliveryMatchAll`, `deliveryMatchAny` | Delivery dispatch (normalized event → targets) | Gates whether the template's delivery targets fire for a given normalized event. |

These rule sets are independent. Setting one has no effect on the other.

In addition, `enabled` acts as a master gate **at delivery only**. When `enabled=false`, ingest-time template selection and normalization still occur (so audit trails and `event_details` are preserved), but the delivery consumer dispatches no targets.

---

## 2. Ownership

### Owner Backend

- `gateway-api`

### Domain System of Record

| Domain | System of Record | Canonical Store | Notes |
|---|---|---|---|
| Template definition | `gateway-api` | `mongo.mapping_templates` | Single-writer. No projection. |
| Delivery eligibility decision | `gateway-api/deliverycons` | none (stateless) | Derived per event from template + normalized event. |

### Producer / Consumers

| Surface | Producer | Consumers | Notes |
|---|---|---|---|
| `POST /ingest/mappingTemplates` | `gateway-api` admin controller | gateway-portal, klynx-feature admin FE | Adds new fields; existing behavior unchanged. |
| `PATCH /ingest/mappingTemplates/{templateId}` | `gateway-api` admin controller | gateway-portal, klynx-feature admin FE | Adds new fields; existing behavior unchanged. |
| `GET /ingest/mappingTemplates/{templateId}` | `gateway-api` admin controller | same | Returns new fields. |
| `GET /ingest/mappingTemplates` | `gateway-api` admin controller | same | List endpoint returns new fields per item. |

### Projection Stores

| Projection | Store | Consumer | Notes |
|---|---|---|---|
| none | n/a | n/a | Template definition is not projected. |

---

## 3. Compatibility and Policy

### Backward Compatibility

- Compatibility status: `additive`
- Consumer requirements: tolerate unknown fields on read (existing FE builds already do).
- Deprecation window: none. No field is removed or renamed.
- `matchAll` and `matchAny` semantics are unchanged. Any FE that currently reads these fields keeps working.

### Replay / Re-sync Behavior

- Replay supported: n/a (REST surface, not event).
- Re-sync trigger: n/a.
- Duplicate delivery rule: n/a.

### Write Authority Policy

- `gateway-api` is the sole authoritative writer for `mapping_templates.*`.
- FE must never persist template fields outside of gateway-api admin endpoints.
- Backfill for `enabled` is an internal gateway-api deploy step (see plan §9).

---

## 4. Surface Summary

| Type | Name | Method / Topic | Auth | Producer / Handler | Consumer / Caller |
|---|---|---|---|---|---|
| REST | Create Template | `POST /ingest/mappingTemplates` | BearerAuth + ActiveOrg | `gateway-api/controllers/ingestapi.Create` | Admin UI |
| REST | Update Template | `PATCH /ingest/mappingTemplates/{templateId}` | BearerAuth + ActiveOrg | `gateway-api/controllers/ingestapi.Update` | Admin UI |
| REST | Get Template | `GET /ingest/mappingTemplates/{templateId}` | BearerAuth + ActiveOrg | `gateway-api/controllers/ingestapi.Get` | Admin UI |
| REST | List Templates | `GET /ingest/mappingTemplates` | BearerAuth + ActiveOrg | `gateway-api/controllers/ingestapi.List` | Admin UI |

---

## 5. REST Contract

### 5.1 Create Template

**Endpoint:** `/ingest/mappingTemplates`
**Method:** `POST`
**Auth:** `Authorization: Bearer <jwt>`, `X-Active-Org: <orgId>`
**Purpose:** Create a new mapping template. Adds optional `deliveryMatchAll`, `deliveryMatchAny`.

#### Request Headers

| Header | Required | Description |
|---|---|---|
| `Authorization` | yes | `Bearer <jwt>` |
| `X-Active-Org` | yes | org scoping |
| `Content-Type` | yes | `application/json` |

#### Request Body

```json
{
  "name": "AIBOX General Detect",
  "sourceFamily": "AIBOX",
  "finalEventType": "AIBOX",
  "priority": 100,
  "enabled": true,
  "matchAll": [
    { "field": "raw.type", "operator": "eq", "values": ["person"] }
  ],
  "matchAny": [],
  "deliveryMatchAll": [
    { "field": "sourceAction", "operator": "eq", "values": ["captured"] }
  ],
  "deliveryMatchAny": [],
  "mappings": [],
  "dlq": { "enabled": true, "maxRetries": 3, "retryTimeoutSeconds": 60 },
  "defaultLocale": "en",
  "messageTemplates": [],
  "classificationRules": [],
  "deliveryTargets": [
    { "targetId": "dc005af5-...", "filter": [], "eventClasses": [], "eventSeverities": [] }
  ]
}
```

#### Request Field Definitions

| Field | Type | Required | Owner | Description |
|---|---|---|---|---|
| `name` | string | yes | gateway-api | Display name. |
| `sourceFamily` | string | yes | gateway-api | e.g. `AIBOX`. |
| `finalEventType` | string | no | gateway-api | Canonical event type override. |
| `priority` | int | no | gateway-api | Ingest-time selector priority, higher first. |
| `enabled` | bool | no (default `true` on create) | gateway-api | Master gate at delivery. `false` = normalize but do not dispatch. |
| `matchAll` | `MatchCondition[]` | no | gateway-api | **Normalization selector** (AND). Ingest-time only. |
| `matchAny` | `MatchCondition[]` | no | gateway-api | **Normalization selector** (OR). Ingest-time only. |
| `deliveryMatchAll` | `MatchCondition[]` | no | gateway-api | **Delivery filter** (AND). Delivery-time only. |
| `deliveryMatchAny` | `MatchCondition[]` | no | gateway-api | **Delivery filter** (OR). Delivery-time only. |
| `mappings` | `FieldMapping[]` | no | gateway-api | Field mappings applied during normalization. |
| `dlq` | `DLQConfig` | no | gateway-api | Per-template DLQ behavior. |
| `deliveryTargets` | `TemplateDeliveryTarget[]` | no | gateway-api | Per-target filters and whitelists; evaluated **after** `deliveryMatchAll`/`deliveryMatchAny`. |
| `messageTemplates` | `MessageTemplate[]` | no | gateway-api | Locale-aware notification text. |
| `classificationRules` | `ClassificationRule[]` | no | gateway-api | Sets `eventClass`, `eventSeverity` during delivery. |

`MatchCondition`:

| Field | Type | Required | Description |
|---|---|---|---|
| `field` | string | yes | Dotted path. See §5.5 for supported namespaces per evaluation stage. |
| `operator` | enum | yes | `eq`, `in`, `contains`, `prefix`. |
| `values` | string[] | yes | Values to compare against. |

#### Success Response

**HTTP:** `201`

```json
{
  "code": "SUCCESS",
  "status": true,
  "message": "Template created",
  "details": { "templateId": "tmpl-..." }
}
```

#### Error Contract

| HTTP | Code | Meaning | Consumer Handling |
|---|---|---|---|
| 400 | `BAD_REQUEST` | Malformed body, unknown operator on `deliveryMatchAll` / `deliveryMatchAny`, or `raw.*` field supplied at the delivery stage. The `message` field pinpoints the offending entry (e.g. `deliveryMatchAll[0]: field 'raw.sn' not available at delivery stage; use a canonical field (see contract §5.5)`). | Show field-level error. |
| 401 | `UNAUTHORIZED` | Missing/invalid token. | Redirect to login. |
| 409 | `CONFLICT` | Duplicate template if enforced. | Ask user to change name. |
| 500 | `INTERNAL_ERROR` | Storage failure. | Retry or escalate. |

### 5.2 Update Template

**Endpoint:** `/ingest/mappingTemplates/{templateId}`
**Method:** `PATCH`
**Auth:** same as 5.1
**Purpose:** Partial update. All fields optional; only supplied fields are persisted.

#### Path Params

| Field | Type | Required | Description |
|---|---|---|---|
| `templateId` | string | yes | Template identifier. |

#### Request Body

Any subset of the fields listed in 5.1. Example — toggle delivery behavior without touching normalization:

```json
{
  "enabled": true,
  "deliveryMatchAll": [
    { "field": "sourceAction", "operator": "eq", "values": ["captured", "detected"] }
  ]
}
```

#### Semantics — Partial Update Rules

- Sending `"deliveryMatchAll": []` clears the rule → delivery filter passes for all events (see §5.4).
- Sending `"deliveryMatchAll": [ ... ]` replaces the entire array.
- Omitting a field leaves current value untouched.
- Updating `enabled` does not trigger any reprocessing; new value applies to events evaluated after the admin request completes.

#### Success Response

**HTTP:** `200`

```json
{
  "code": "SUCCESS",
  "status": true,
  "message": "Template updated",
  "details": { "templateId": "tmpl-..." }
}
```

#### Error Contract

| HTTP | Code | Meaning | Consumer Handling |
|---|---|---|---|
| 400 | `BAD_REQUEST` | Same validation rules as 5.1. `message` carries the pinpoint reason. | Show field-level error. |
| 401 | `UNAUTHORIZED` | Missing/invalid token. | Redirect to login. |
| 404 | `NOT_FOUND` | Template id not in active org. | Show not-found UI. |
| 500 | `INTERNAL_ERROR` | Storage failure. | Retry or escalate. |

### 5.3 Get / List Template

**Endpoints:**
- `GET /ingest/mappingTemplates/{templateId}` → single template.
- `GET /ingest/mappingTemplates?page=…&perPage=…&sortField=…&sortOrder=…` → paginated.

**Response detail shape:** mirrors the request body from 5.1 plus `templateId`, `workspaceId`, `createdAt`, `updatedAt`, `enabled`, `matchAll`, `matchAny`, `deliveryMatchAll`, `deliveryMatchAny`, and all nested structures.

Consumers must rely on the presence of `deliveryMatchAll` / `deliveryMatchAny` keys to distinguish delivery rules from normalization rules. Empty arrays are valid and carry the semantics defined in §5.4.

### 5.4 Default Behavior When Rule Is Empty

| State | Runtime Behavior |
|---|---|
| `enabled` absent or `false` | Delivery consumer skips all targets for this template. Normalization still runs. Logged as `skipReason=disabled`. |
| `enabled=true` and `deliveryMatchAll=[]` and `deliveryMatchAny=[]` | Delivery gate passes unconditionally. Per-target filters still apply. This matches pre-change behavior. |
| `enabled=true` and `deliveryMatchAll` non-empty | All conditions (AND) must evaluate true against the delivery match bag. |
| `enabled=true` and `deliveryMatchAny` non-empty | At least one condition (OR) must evaluate true. |
| `enabled=true` and both set | Both the AND set and the OR set must pass. |
| Any delivery rule fails | No targets for this template fire. Logged as `skipReason=delivery_rule_miss`. |

These semantics are identical in shape to `matchAll`/`matchAny` at ingest, but evaluated against a different match bag (§5.5).

### 5.5 Supported Field Namespaces (per evaluation stage)

The `field` in a `MatchCondition` is a dotted path into a stage-specific match bag. The bag differs between ingest and delivery; FE must not assume parity.

#### Ingest — `matchAll` / `matchAny`

Bag sources:
- `raw.*` — vendor-specific raw payload keys (UI badge: `raw`).
- Canonical top-level fields resolved during ingest: `source.deviceId`, `source.deviceType`, `source.sn`, `source.workspaceId`, `sourceFamily`, `eventType`.

FE surface: ingest-time dropdown may show `raw` and `canonical` namespaces, matching current behavior.

#### Delivery — `deliveryMatchAll` / `deliveryMatchAny`

Bag sources (built from `ingestmod.NormalizedEvent` at dispatch time):
- Top-level canonical: `eventId`, `tenantId`, `eventType`, `eventCategory`, `eventAction`, `eventClass`, `eventSeverity`, `occurredAt`, `templateId`, `workspaceId`.
- **Source aliases** (FE-facing; map one-to-one to the `event*` counterparts):
  - `sourceType`  ↔ `eventType`
  - `sourceCategory` ↔ `eventCategory`
  - `sourceAction` ↔ `eventAction`
  A rule may use either form interchangeably.
- `source.*`: `source.deviceId`, `source.deviceType`, `source.deviceName`, `source.deviceDescription`, `source.subType`, `source.vendor`, `source.protocol`, `source.workspaceId`.
- `payload.*`: every key in `NormalizedEvent.Payload`, flattened one level.
- `geo.*`: `geo.countryCode`, `geo.adminLevel`, `geo.adminCode`, `geo.adminName`, `geo.idScheme`.
- `location.*`: `location.lat`, `location.lng`, `location.zone`, `location.site`.
- `geoCell.*`: `geoCell.cell`, `geoCell.precision`, `geoCell.scheme`.

Explicitly **not** in the delivery bag:
- `raw.*` — does not exist at delivery time. Admin API rejects any `deliveryMatchAll` / `deliveryMatchAny` entry whose `field` starts with `raw.` (or equals `raw`) with `400 BAD_REQUEST`.
- `sourceFamily` (top-level) — not propagated to the normalized event at delivery time in this slice. Filter on `source.vendor` or a `payload.*` key if needed. A future slice may promote `sourceFamily` onto `NormalizedEvent`; until then it is not evaluable.
- `orgId` (top-level) — not carried on the ingest-internal `NormalizedEvent`. Use `workspaceId` (which is authoritative at this layer) instead.

FE surface: delivery-time dropdown must show only the namespaces listed above.

### 5.6 Operators

`eq`, `in`, `contains`, `prefix`. Same set as ingest matching. Type coercion: string comparison is case-sensitive unless a consumer explicitly normalizes. For numeric comparison semantics, rely on current gateway-api behavior (see plan test plan; no change in this slice).

---

## 6. Event Contract

Not applicable. No Kafka topic is added, removed, or changed by this contract.

---

## 7. Canonical and Projection Mapping

### Canonical Store

- System: `gateway-api`
- Store: `mongo.mapping_templates`
- Canonical fields (new): `enabled`, `deliveryMatchAll`, `deliveryMatchAny`. All existing fields preserved.

### Projection Store

- None.

### Field Mapping

| Canonical Field | Projection Field | Consumer Field | Notes |
|---|---|---|---|
| `enabled` | n/a | FE `enabled` toggle | Master delivery gate. |
| `deliveryMatchAll` | n/a | FE `Delivery Filter (AND)` tab | New field. |
| `deliveryMatchAny` | n/a | FE `Delivery Filter (OR)` tab | New field. |
| `matchAll` | n/a | FE `Normalization Selector (AND)` tab | Existing field, relabeled in FE. |
| `matchAny` | n/a | FE `Normalization Selector (OR)` tab | Existing field, relabeled in FE. |

---

## 8. Field Ownership

| Field | Authoritative Writer | Allowed Initiator | Stored In | Notes |
|---|---|---|---|---|
| `enabled` | gateway-api | gateway-api admin UI | `mapping_templates.enabled` | Last-write-wins. |
| `matchAll`, `matchAny` | gateway-api | gateway-api admin UI | `mapping_templates` | Unchanged. |
| `deliveryMatchAll`, `deliveryMatchAny` | gateway-api | gateway-api admin UI | `mapping_templates` | New. |

### Conflict Resolution

- Admin PATCH is last-write-wins. No concurrent multi-writer scenario exists.
- Echo-loop prevention: n/a (no sync bus).

---

## 9. Frontend Integration Notes

### Required FE Inputs

| FE Use Case | Contract Surface | Required Fields | Notes |
|---|---|---|---|
| Template editor — Basic tab | `PATCH /ingest/mappingTemplates/{id}` | `enabled`, `name`, `sourceFamily`, `priority` | Surface clarified enabled copy: "If off, this template still runs normalization but sends no messages." |
| Template editor — Normalization Selector tab | `matchAll`, `matchAny` | same | Helper text: "Pick which incoming events this template applies to (for normalization)." Allow `raw.*` fields. |
| Template editor — Delivery Filter tab | `deliveryMatchAll`, `deliveryMatchAny` | same | Helper text: "Pick which normalized events are sent to this template's delivery targets. Leave empty to send all that pass per-target filters." Do not expose `raw.*`. |
| Template editor — Targets tab | `deliveryTargets` | existing | Per-target filters still evaluated after the Delivery Filter tab's rules. |

### Example FE Payload Mapping

| FE Field | Backend Field | Direction | Notes |
|---|---|---|---|
| Enabled toggle | `enabled` | request + response | Boolean. |
| Normalization Selector (AND) | `matchAll` | request + response | Existing. |
| Normalization Selector (OR) | `matchAny` | request + response | Existing. |
| Delivery Filter (AND) | `deliveryMatchAll` | request + response | New. |
| Delivery Filter (OR) | `deliveryMatchAny` | request + response | New. |

### FE Guardrails

- Do not rename, merge, or hide `deliveryMatchAll` / `deliveryMatchAny` behind the same UI control as `matchAll` / `matchAny`. The two rule sets have distinct semantics.
- Do not expose `raw.*` as a selectable field namespace in the Delivery Filter tab.
- Do not assume the backend will coerce empty → unset. Sending `[]` is an explicit clear.
- Error codes listed in §5 are the only supported contract. Do not parse error strings.

---

## 10. Rollout Notes

| Repo | Dependency | Required Before | Notes |
|---|---|---|---|
| `gateway-api` | contract | Phase 1 | Accept new fields on CRUD; no enforcement yet. |
| `gateway-api` | backfill `enabled=true` | Phase 3 | Before enforcement deploy. |
| `gateway-api` | enforcement | Phase 4 | Delivery consumer reads new fields. |
| `gateway-portal` FE | contract stable | After enforcement deployed | Expose both tabs. |
| `klynx-feature` FE admin | contract stable | After enforcement deployed | Expose both tabs if editor is included. |

---

## 11. Examples

### Example Create Request — delivery filter by sourceAction

```json
{
  "name": "AIBOX Captured Only",
  "sourceFamily": "AIBOX",
  "enabled": true,
  "matchAll": [
    { "field": "raw.type", "operator": "eq", "values": ["person"] }
  ],
  "deliveryMatchAll": [
    { "field": "sourceAction", "operator": "eq", "values": ["captured"] }
  ],
  "deliveryTargets": [
    { "targetId": "tgt-line-001", "filter": [], "eventClasses": [], "eventSeverities": [] }
  ]
}
```

### Example Update Request — disable delivery without deleting the template

```json
{ "enabled": false }
```

### Example Success Response

```json
{
  "code": "SUCCESS",
  "status": true,
  "message": "Template updated",
  "details": { "templateId": "tmpl-abc123" }
}
```

### Example Error — `raw.*` used at delivery stage

Request:

```json
{ "deliveryMatchAll": [ { "field": "raw.sn", "operator": "eq", "values": ["X"] } ] }
```

Response:

```json
{
  "code": "BAD_REQUEST",
  "status": false,
  "message": "deliveryMatchAll[0]: field 'raw.sn' not available at delivery stage; use a canonical field (see contract §5.5)"
}
```

---

## 12. Checklist

- [x] Owner backend is explicit (`gateway-api`).
- [x] System of record is defined by domain.
- [x] Canonical store documented; no projection store.
- [x] Producers and consumers listed.
- [x] Request, response, and error contracts defined for all four endpoints.
- [x] Field ownership documented for new and existing synced fields.
- [x] Backward compatibility documented as `additive`.
- [x] Replay / re-sync declared N/A (REST-only).
- [x] FE field mapping included with distinct UI controls per rule set.
- [x] Default behavior when delivery rule is empty documented (§5.4).
- [x] Supported field namespaces per evaluation stage documented (§5.5).
- [x] Distinction between normalization selector and delivery filter documented (§1, §5.5).
