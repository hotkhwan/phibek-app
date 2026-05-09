# Third-Party Integration API Contract

**Date:** 2026-05-04
**Status:** Active (consolidated — supersedes `third-party-events-api.md` + `third-party-files-api.md`)
**Owner Backend:** `klynx-api`
**Related Plan:** [docs/plan/third-party-events-api.md](../plan/third-party-events-api.md), [docs/plan/third-party-files-api.md](../plan/third-party-files-api.md)
**Applies To Repos:** `klynx-api` (owner), third-party integrators (consumers)
**Contract Type:** `REST`
**Version:** `v1`
**Supersedes:** `third-party-events-api.md` (Approved r1/r2/r3 metadata sync), `third-party-files-api.md` (Draft r3)

---

## 0. Domain / Flow Boundary

| Field | Value |
|---|---|
| Domain name | `third-party-integration` |
| Flow name | M2M (machine-to-machine) integration consumer surface |
| Lifecycle scope | OAuth2 token exchange → list events → fetch event detail → fetch event binaries |

### Included Surfaces

| Surface Type | Name | Purpose |
|---|---|---|
| REST | `POST /api/v3/token/api/clientCredentials` | OAuth2 client_credentials token exchange (proxy to Keycloak) |
| REST | `GET /api/v3/thirdParty/events` | paginated event list scoped to integration's org |
| REST | `GET /api/v3/thirdParty/events/:eventId` | full event detail proxied from gateway-api |
| REST | `GET /api/v3/thirdParty/files/*` | binary object fetch with event-bound path guard |

### Excluded Surfaces

| Surface | Why excluded | Authoritative Contract |
|---|---|---|
| `/api/v3/events` (user-facing) | different middleware (user JWT + `X-Active-Org`), not M2M | (user-facing API, documented in code) |
| `/api/v3/files/*` (user-facing) | different middleware stack, broader path acceptance | (user-facing API, documented in code) |
| `gw.events.normalized.v1` Kafka topic | upstream ingest pipeline owned by gateway-api | (gateway-api SoR) |
| Integration token CRUD (`/integrations` admin endpoints) | org-admin portal surface, not M2M consumer surface | (separate admin contract) |

### Related Contracts

| Contract | Relationship |
|---|---|
| (gateway-api `event_details` schema in `ingestmod`) | upstream — provides the event detail shape proxied by §5.3 |
| Future `media-stream-redis.md` (graphify gap) | unrelated — different cache lifecycle |

### Grouping Rationale

Both endpoints share the `AuthServiceAccount("read:events")` middleware, the same `(tenantId, clientId)` identity binding, the same error envelope, and the same scope. Files endpoint is a strict consumer of events endpoint output (`binaryRefs[].objectId` from event detail). A reader that opens the events contract without the files contract cannot understand how an integrator fetches images attached to alerts. Per `docs/contracts/README.md` grouping rule, these are one flow → one contract.

---

## 1. Purpose

Define the machine-to-machine (M2M) REST surface third-party integrators use to read events for a given organization, authenticated via an integration-token service account, including the binary objects (`binaryRefs[].objectId`) attached to those events.

This contract is the source of truth — integrators must not infer endpoint names, payload shapes, error codes, or path shapes from partial implementation details, from the user-facing `/api/v3/events` / `/api/v3/files/*` endpoints, or from network traces.

Key distinctions from the user-facing events / files API:
- **Authentication:** OAuth2 `client_credentials` flow against Keycloak, not a user JWT.
- **Identity binding:** `(tenantId, clientId)`. `tenantId` = Keycloak realm, extracted from JWT `iss` claim; `clientId` = JWT `client_id` claim (fallback `azp`). Both must match an active record in `integration_tokens`.
- **Organization scoping:** resolved server-side from the integration record — **no `X-Active-Org` header**.
- **Scope:** `read:events` enforced at klynx-api application layer (not Keycloak scope).
- **File path scoping:** strict — only `canonical/<workspaceId>/events/<eventId>/<filename>` accepted; every other shape rejected before any S3 call.
- **Consumer:** servers and automation clients; not consumed by klynx-feature portal or gateway-portal.

---

## 2. Ownership

### Owner Backend

- `klynx-api`

### Domain System of Record

| Domain | System of Record | Canonical Store | Notes |
|---|---|---|---|
| Integration registry (auth source of truth) | `klynx-api` | `integration_tokens` (MongoDB) | Authoritative `status` + `scopes` + `orgId` mapping |
| Event index (for list) | `klynx-api` | `event_refs` (MongoDB) | Projection from `gw.events.normalized.v1` |
| Event canonical detail | `gateway-api` | `event_details` | Fetched on demand via `gwgw.EventClient` (gRPC) or REST fallback |
| Workspace ↔ org mapping | `klynx-api` | `organizations` (MongoDB) | `OrgRepo.FindById(orgId).WorkspaceID` |
| Binary object bytes | MinIO `canonical` bucket | — | Proxied on demand. klynx-api never writes |
| OAuth2 credentials + JWT issuance | Keycloak | realm clients | Secret never stored in klynx-api |

### Producer / Consumers

| Surface | Producer | Consumers | Notes |
|---|---|---|---|
| `POST /api/v3/token/api/clientCredentials` | klynx-api (proxy to Keycloak) | third-party | Existing endpoint, included for end-to-end clarity |
| `GET /api/v3/thirdParty/events` | klynx-api | third-party | `thirdpartyeventapi.ListEvents` |
| `GET /api/v3/thirdParty/events/:eventId` | klynx-api | third-party | `thirdpartyeventapi.GetEvent` |
| `GET /api/v3/thirdParty/files/*` | klynx-api | third-party | `ThirdPartyFileGuard` middleware → `thirdpartyfileapi.ServeEventFile`. Reuses `internal/infra/s3.DownloadByKey` |

### Projection Stores

| Projection | Store | Consumer | Notes |
|---|---|---|---|
| Event index | `klynx-api.event_refs` | `eventsvc.ListEvents`, `ThirdPartyFileGuard` | Shared with user-facing `/api/v3/events`. Files-guard does point lookup over the existing `{workspaceId:1, occurredAt:-1}` index |

---

## 3. Compatibility and Policy

### Backward Compatibility

- Compatibility status: **additive** — new routes, no change to existing user-facing routes.
- Consumer requirements: HTTP/1.1+, TLS 1.2+, JSON.
- Deprecation window: n/a (initial ship for both surfaces).

### Replay / Re-sync Behavior

- Replay supported: n/a (GET-only).
- Re-sync trigger: n/a.
- Duplicate delivery rule: GET is idempotent; repeated calls return current state. If an event's `event_refs` row is ever deleted (no current flow), subsequent file fetches for that event return 404 `EVENT_NOT_FOUND` — correct failure mode.

### Write Authority Policy

- `klynx-api.integration_tokens` is the authoritative source for integration status and scope at request time. A JWT whose signature is valid but whose record is `revoked` (or missing, or belongs to a different `tenantId`) MUST be rejected with 401.
- Klynx-api resolves identity as a **tenant-scoped** lookup `(tenantId, clientId)`. This guards against cross-realm token reuse even if two realms happen to produce the same `clientId` string.
- Keycloak is authoritative for JWT issuance and signature verification.
- Third-party consumers are read-only with respect to klynx data. Read-only proxy on files; cannot upload, modify, or delete objects via this endpoint.

### Revision History (preserved verbatim from source contracts)

**Events surface (`third-party-events-api.md`):**
- **r1:** introduced tenant-bound authentication `(tenantId, clientId)` — `tenantId` derived from JWT `iss` (Keycloak realm), must match the integration record; HTTP 502 `UPSTREAM_AUTH_REJECTED` added to the detail endpoint error contract; gRPC vs REST fetcher-path difference documented.
- **r2/r3 sync (metadata only):** plan drift was entirely on the plan side (§1, §8, §9 in r2; §2, §3 in r3). Wire-level surface did not change — approved fields, status codes, examples, and field-ownership table identical to r1. Status label lifted to "Approved" to match the plan's approval state.

**Files surface (`third-party-files-api.md`):**
- **r0:** initial draft. Proposed `/thirdParty/files/:bucket/*` route shape and reused `fileapi.ProxyFiles` handler.
- **r1 (2026-04-22):** route shape and error semantics corrected after Codex first review:
  - **Route:** now `/api/v3/thirdParty/files/*` (single wildcard). The `:bucket/*` shape in r0 was incompatible with the existing handler's `c.Params("*")` parsing; the single-wildcard shape also matches the existing `/api/v3/files/*` so the object-path format is identical across both surfaces.
  - **Error envelope:** all 4xx/5xx responses are JSON envelopes emitted by a **new** thin handler `thirdpartyfileapi.ServeEventFile` that reuses the `internal/infra/s3` download helper with explicit MinIO-error classification. r0 incorrectly promised JSON codes that `fileapi.ProxyFiles` (which maps all S3 failures to bare HTTP 502 plain-text) could not actually emit. `fileapi.ProxyFiles` and `/api/v3/files/*` remain untouched.
  - **Range support removed from contract:** `Accept-Ranges: bytes` header is NOT set, and `Range` requests are NOT honored. A client sending `Range` receives the full object at HTTP 200.
- **r2 (2026-04-22):** addresses Codex second review. No wire-surface change from r1:
  - `EVENT_NOT_FOUND` is now explicitly keyed on `(workspaceId, eventId)`, mirroring the events surface (see plan r2 decision 12.5). A file whose event `/thirdParty/events` already returned cannot 404 here due to internal key drift.
  - `FILE_NOT_FOUND` classifier accepts both `Code == "NoSuchKey"` and `StatusCode == 404` from the MinIO SDK.
- **r3 (2026-04-22):** addresses Codex third review. No wire-surface change:
  - §5.4 `403 FORBIDDEN_PATH_SCOPE` row tightened to apply **only** when the server resolved `org.WorkspaceID` successfully and it differs from the path-supplied value.
  - §5.4 `500 INTERNAL_ERROR` row enumerates the workspace-resolution failure modes (DB error, nil org, empty `WorkspaceID`) alongside the S3 failure cases.

---

## 4. Surface Summary

| Type | Name | Method / Topic / Key | Auth / Trust | Producer / Handler | Consumer / Caller |
|---|---|---|---|---|---|
| REST | `/api/v3/token/api/clientCredentials` | `POST` | none (public) | `thirdapi.ClientCredentialsToken` | third-party |
| REST | `/api/v3/thirdParty/events` | `GET` | Bearer SA JWT + scope `read:events` | `thirdpartyeventapi.ListEvents` | third-party |
| REST | `/api/v3/thirdParty/events/:eventId` | `GET` | Bearer SA JWT + scope `read:events` | `thirdpartyeventapi.GetEvent` | third-party |
| REST | `/api/v3/thirdParty/files/*` | `GET` | Bearer SA JWT + scope `read:events` + event-bound path guard | `ThirdPartyFileGuard` → `thirdpartyfileapi.ServeEventFile` | third-party |

**Base URL (example, staging):** `https://aliza.k-lynx.com/api/v3`

---

## 5. REST Surfaces

### 5.1 Exchange Service-Account Token

**Endpoint:** `/api/v3/token/api/clientCredentials`
**Method:** `POST`
**Auth:** none (public)
**Purpose:** Existing endpoint — included for end-to-end clarity. Proxies Keycloak `grant_type=client_credentials`.

#### Request Headers

| Header | Required | Description |
|---|---|---|
| `Content-Type` | yes | `application/json` |

#### Request Body

```json
{
  "client_id": "<client_id>",
  "client_secret": "<client_secret>"
}
```

> `scope` field is accepted but currently Keycloak-level scopes are not used; the klynx-api scope check (`read:events`) uses the `integration_tokens.scopes` record instead. Omitting `scope` defaults to `openid` in [controllers/thirdapi/token.go](../../controllers/thirdapi/token.go).

#### Success Response

**HTTP:** `200`

```json
{
  "code": "SUCCESS",
  "message": "ok",
  "status": true,
  "details": {
    "access_token": "eyJhbGciOi...",
    "expires_in": 86400,
    "token_type": "Bearer",
    "scope": "openid email profile"
  }
}
```

#### Error Contract

| HTTP | Code | Meaning | Consumer Handling |
|---|---|---|---|
| 400 | `BAD_REQUEST` | client_id or client_secret missing | Fix request body and retry |
| 401 | `UNAUTHORIZED` | Keycloak rejected credentials or unknown client | Verify credentials; if revoked, create a new integration |

---

### 5.2 List Events (third-party)

**Endpoint:** `/api/v3/thirdParty/events`
**Method:** `GET`
**Auth:** Bearer service-account JWT; integration must be `active` and have scope `read:events`.
**Purpose:** List paginated events for the organization that owns the integration.

#### Path Params

_None._

#### Query Params

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `page` | int | no | `1` | 1-indexed page number |
| `perPage` | int | no | `20` | Items per page. Max 100 (clamped) |
| `eventType` | string | no | — | Filter by event type |
| `from` | string (RFC3339) | no | — | Lower bound on `occurredAt` |
| `to` | string (RFC3339) | no | — | Upper bound on `occurredAt` |
| `sortOrder` | string | no | `desc` | `asc` or `desc` on `occurredAt` |

#### Request Headers

| Header | Required | Description |
|---|---|---|
| `Authorization` | yes | `Bearer <access_token>` from §5.1 |
| `X-Active-Org` | **no** | **Must not be sent.** Org is resolved from the integration record |

#### Request Body

_None (GET)._

#### Success Response

**HTTP:** `200`

Same envelope as user-facing `/api/v3/events` — paginated response via `httputil.OkPaginated`.

```json
{
  "code": "SUCCESS",
  "message": "",
  "status": true,
  "details": {
    "items": [
      {
        "id": "evt_01J...",
        "orgId": "390ac6ec-073b-4265-99da-9c17b7a2c4f5",
        "workspaceId": "ws_...",
        "deviceId": "cam_...",
        "eventType": "motion.detected",
        "eventCategory": "motion",
        "eventAction": "detected",
        "sourceFamily": "camera",
        "deviceName": "Front Gate Cam",
        "displayLocationName": "HQ / Lobby",
        "occurredAt": "2026-04-21T03:12:44Z",
        "deliveryStatus": "delivered",
        "detail": { "…": "EventDetailDTO — see §5.3" }
      }
    ]
  },
  "pagination": {
    "page": 1,
    "perPage": 20,
    "totalRecords": 137,
    "totalPages": 7,
    "sortField": "occurredAt",
    "sortOrder": "desc"
  }
}
```

#### Success Field Definitions

| Field | Type | Description |
|---|---|---|
| `details.items[].id` | string | Event ID. Stable across klynx and gw |
| `details.items[].orgId` | string | Organization ID owning the event (matches integration's org) |
| `details.items[].workspaceId` | string | Gateway workspace ID |
| `details.items[].occurredAt` | string (RFC3339) | Event occurrence time |
| `details.items[].detail` | object (optional) | Present only when gateway-api is reachable and returned a detail object. See §5.3 |
| `pagination.*` | — | Standard page meta — see `CLAUDE.md` → Standard success envelopes |

#### Error Contract

| HTTP | Code | Meaning | Consumer Handling |
|---|---|---|---|
| 401 | `UNAUTHORIZED` | Missing/expired/invalid JWT signature, or malformed SA token (missing `client_id`/`azp`/`iss`) | Re-exchange token at §5.1 |
| 401 | `TOKEN_REVOKED` | Integration `status=revoked` in klynx registry | Create a new integration; old token is dead |
| 401 | `UNKNOWN_INTEGRATION` | JWT valid but no record matches `(tenantId, clientId)` — integration was deleted, or token issued by a different Keycloak realm than the one where the integration was registered | Contact org admin — integration was deleted or issued against the wrong realm |
| 403 | `INSUFFICIENT_SCOPE` | Integration lacks `read:events` in its scopes | Request a new integration with the scope, or ask admin to rotate with correct scopes |
| 500 | `INTERNAL_ERROR` | Unexpected server error | Retry with backoff; contact support if persistent |

#### Error Example

```json
{
  "code": "INSUFFICIENT_SCOPE",
  "message": "integration is missing required scope: read:events",
  "status": false
}
```

---

### 5.3 Get Event Detail (third-party)

**Endpoint:** `/api/v3/thirdParty/events/:eventId`
**Method:** `GET`
**Auth:** Bearer service-account JWT; integration must be `active` and have scope `read:events`.
**Purpose:** Fetch full event detail proxied from gateway-api by `eventId`.

#### Path Params

| Field | Type | Required | Description |
|---|---|---|---|
| `eventId` | string | yes | Event ID from list response |

#### Request Headers

| Header | Required | Description |
|---|---|---|
| `Authorization` | yes | `Bearer <access_token>` |
| `X-Active-Org` | no | Must not be sent (ignored if present) |

#### Success Response

**HTTP:** `200`

```json
{
  "code": "SUCCESS",
  "message": "",
  "status": true,
  "details": {
    "eventId": "evt_01J...",
    "eventType": "motion.detected",
    "eventCategory": "motion",
    "eventAction": "detected",
    "source": {
      "deviceId": "cam_...",
      "deviceName": "Front Gate Cam",
      "deviceType": "camera",
      "vendor": "axis"
    },
    "location": { "lat": 13.75, "lng": 100.5, "site": "HQ", "zone": "Lobby" },
    "geo": { "countryCode": "TH", "adminLevel": 1, "adminName": "Bangkok" },
    "payload": { "…": "vendor-specific, see gw contract" },
    "binaryRefs": [
      { "objectId": "…", "contentType": "image/jpeg", "kind": "image", "role": "snapshot", "sourceIndex": 0 }
    ],
    "occurredAt": "2026-04-21T03:12:44Z",
    "meta": { "schemaVersion": "…", "normalizedAt": "2026-04-21T03:12:44.500Z", "templateId": "…" }
  }
}
```

Detail shape mirrors [internal/services/eventsvc/events.go](../../internal/services/eventsvc/events.go) `EventDetailDTO` which in turn mirrors gateway-api's `ingestmod.EventDetail`.

#### Error Contract

| HTTP | Code | Meaning | Consumer Handling |
|---|---|---|---|
| 401 | `UNAUTHORIZED` / `TOKEN_REVOKED` / `UNKNOWN_INTEGRATION` | See §5.2 | Same as §5.2 |
| 403 | `INSUFFICIENT_SCOPE` | See §5.2 | Same as §5.2 |
| 404 | `EVENT_NOT_FOUND` | `eventId` does not exist or belongs to another org | Do not retry |
| 500 | `INTERNAL_ERROR` | Unexpected server error | Retry with backoff |
| 502 | `UPSTREAM_AUTH_REJECTED` | REST-fetcher path only: gateway-api rejected the forwarded service-account JWT (401/403 from gw) | **Not a consumer-credential issue.** Report to the klynx-api operator — gw audience/realm configuration for the deployment does not accept service-account JWTs. Retrying will not help until the deployment is fixed |
| 503 | `SERVICE_UNAVAILABLE` | Gateway-api fetcher not configured in this deployment (e.g. `GW_API_URL` unset in saasPublic profile) | Event detail is unavailable in this profile; use list-only data |

> **Deployment-mode note (informational, not part of the wire contract):** On deployments where klynx-api uses the gRPC fetcher (`GW_GRPC_URI` set — typically appliance/enterprise), the caller JWT is not forwarded to gateway-api, and 502 `UPSTREAM_AUTH_REJECTED` cannot occur. On REST-fetcher deployments, it can. Consumers do not need to branch on this — they only need to handle the error code.

---

### 5.4 Fetch Event Binary (third-party)

**Endpoint:** `/api/v3/thirdParty/files/*`
**Method:** `GET`
**Auth:** Bearer service-account JWT; integration must be `active` and have scope `read:events`.
**Purpose:** Stream the bytes of a binary object that is attached to a specific event owned by the integration's organization.

#### Path Params

| Field | Type | Required | Description |
|---|---|---|---|
| `*` | string (wildcard) | yes | Full object path including the bucket as the first segment. MUST be shaped `canonical/<workspaceId>/events/<eventId>/<filename[/...]>` |

##### `*` wildcard shape (required, 5+ segments)

```
canonical  /  <workspaceId>  /  events  /  <eventId>  /  <filename>[/<more>...]
    │              │               │             │              │
    │              │               │             │              └── any non-empty path ending at a single object
    │              │               │             │                   (no ".." / "." / empty segments anywhere)
    │              │               │             └── must exist in event_refs for the caller's workspace (workspace-keyed)
    │              │               └── literal string "events"
    │              └── must equal org.WorkspaceID for the caller's org (resolved via OrgRepo.FindById)
    └── literal string "canonical" (v1 only allowed bucket)
```

Any deviation → 403/404 per Error Contract below. No S3 call is made on failure.

#### Query Params

_None._

#### Request Headers

| Header | Required | Description |
|---|---|---|
| `Authorization` | yes | `Bearer <access_token>` from §5.1 |
| `X-Active-Org` | **no** | Must not be sent. Org is resolved from the integration record |

#### Request Body

_None (GET)._

#### Success Response

**HTTP:** `200`

Response is the raw object bytes. Headers set by the handler:

| Header | Value | Notes |
|---|---|---|
| `Content-Type` | sniffed per object (e.g. `image/jpeg`) | Derived from file extension or content sniffing; mirrors user-facing handler |
| `Cache-Control` | `public, max-age=86400` | 24-hour client cache hint |

No JSON envelope — the body is the object itself.

**Headers explicitly NOT set / behavior explicitly NOT supported:**

- `Accept-Ranges` is NOT advertised.
- `Range` requests are NOT honored; a client that sends `Range: bytes=...` receives the full object at HTTP 200 (no `206 Partial Content`).
- `Content-Length` is left to the framework's default handling — do not depend on it being present or accurate for streaming clients. If byte-accurate size is needed, fetch metadata from the `binaryRefs[]` side rather than relying on this response header.

#### Error Contract

All error responses are JSON envelopes emitted by the third-party handler — consistent with the envelope used elsewhere in `/api/v3/thirdParty/*`. Response body shape:

```json
{ "code": "<ERROR_CODE>", "message": "<human readable>", "status": false }
```

| HTTP | Code | Meaning | Consumer Handling |
|---|---|---|---|
| 401 | `UNAUTHORIZED` | Missing / expired / invalid JWT signature, or malformed SA token (missing `client_id`/`azp`/`iss`) | Re-exchange the token (§5.1) |
| 401 | `TOKEN_REVOKED` | Integration `status=revoked` in klynx registry | Create a new integration; old token is dead |
| 401 | `UNKNOWN_INTEGRATION` | JWT valid but no record matches `(tenantId, clientId)` | Contact org admin — integration deleted or issued against the wrong realm |
| 403 | `INSUFFICIENT_SCOPE` | Integration lacks `read:events` | Request rotation with correct scopes |
| 403 | `BUCKET_NOT_ALLOWED` | First path segment is not `canonical` | Fetch only paths coming from `binaryRefs[].objectId` where `bucket == "canonical"`. Do not invent bucket names |
| 403 | `PATH_SHAPE_INVALID` | Path does not match `canonical/<wsId>/events/<eventId>/<tail>`, or contains `..`/`.`/empty segments anywhere | Use the `objectId` string exactly as returned by the events endpoint; do not manipulate |
| 403 | `FORBIDDEN_PATH_SCOPE` | Server resolved the caller's `org.WorkspaceID` successfully but the path's `<workspaceId>` does not match it. Note: this code is **not** used when the server cannot resolve the caller's workspace at all — that is a server-side inconsistency and surfaces as 500 `INTERNAL_ERROR` | Likely cross-org attempt or stale integration metadata. Do not retry |
| 404 | `EVENT_NOT_FOUND` | `<eventId>` in the path is not present in `event_refs` for the caller's workspace. (Ownership is keyed on `workspaceId`, not `orgId` — matches the events listing surface where gw-originating events sometimes carry only `workspaceId`) | If the event was just discovered via §5.2, retry with short backoff (projection lag is rare but possible). If persistent, the event is not readable by this integration |
| 404 | `FILE_NOT_UNDER_EVENT` | Path has too few segments — cannot name a file under an event (minimum 5 segments: `canonical/<wsId>/events/<eventId>/<filename>`) | Check that `objectId` includes a filename segment |
| 404 | `FILE_NOT_FOUND` | Guard passed but MinIO returned a not-found response for the object (either `Code="NoSuchKey"` or HTTP `StatusCode=404`) | The binary was deleted or never uploaded. Do not retry |
| 500 | `INTERNAL_ERROR` | Unexpected server error. Includes: caller's workspace cannot be resolved (org lookup DB error, nil org without error, org with empty `WorkspaceID`); S3 network failure; any non-404 S3 error. Never a caller-side violation | Retry with backoff |

#### Error Example

```json
{
  "code": "FORBIDDEN_PATH_SCOPE",
  "message": "workspace in path does not match caller's org workspace",
  "status": false
}
```

---

## 6. Kafka / Async Event Surfaces

`N/A — not in scope.` This contract is REST-only. Upstream `gw.events.normalized.v1` ingest is a separate flow owned by gateway-api; klynx-api consumes it into `event_refs` but the M2M surface here only reads the projection.

---

## 7. MQTT / Realtime Surfaces

`N/A — not in scope.` No realtime push for third-party integrators. Polling §5.2 is the only consumption pattern.

---

## 8. Redis / Cache Surfaces

`N/A — not in scope.` No cross-service-visible Redis keys in this surface. The `Cache-Control: public, max-age=86400` header on §5.4 binary responses is a *client-side* HTTP cache hint, not a Redis key.

---

## 9. Sync / Field-Ownership Surfaces

### 9.1 Canonical and Projection Mapping

**Canonical Stores**

- Event detail: `gateway-api.event_details` (gw canonical; defined in `ingestmod.EventDetail`).
- Binary objects: MinIO `canonical` bucket. Object keys minted by gateway-api ingest pipeline; klynx-api is a read-only proxy.

**Projection Stores**

- `klynx-api.event_refs` — index used by `eventsvc.ListEvents` (events list) AND by `ThirdPartyFileGuard` (file guard existence check).

**Field Mapping**

| Canonical (gw / MinIO) | Projection (klynx) | Consumer Field | Notes |
|---|---|---|---|
| `event_details.eventId` | `event_refs.eventId` | `details.items[].id`, `binaryRefs[].objectId[2]` (the `<eventId>` segment) | Same value across all three |
| `event_details.source.deviceId` | `event_refs.deviceId` | `details.items[].deviceId` | Projected on ingest |
| `event_details.source.deviceName` | `event_refs.deviceName` | `details.items[].deviceName` | Projected on ingest |
| `event_details.occurredAt` | `event_refs.occurredAt` | `details.items[].occurredAt` | Same value |
| `event_details.orgId` (== gw workspaceId) | `event_refs.workspaceId` | `binaryRefs[].objectId[0]` (the `<workspaceId>` segment) | Files-guard compares against `organizations.workspaceId` for the caller's klynx org, then uses the same `workspaceId` as the key for the `(workspaceId, eventId)` existence check — matches the events surface which also prefers workspace-first matching |
| (full event payload) | — (not stored) | `details.items[].detail` (list) / `details` (§5.3 detail) | Fetched live from gw on request |
| (binary bytes) | — (not stored) | response body of §5.4 | Streamed live from MinIO on request |

### 9.2 Field Ownership — Integration Registry (auth-relevant)

| Field | Authoritative Writer | Allowed Initiator | Stored In | Notes |
|---|---|---|---|---|
| `integration_tokens.tenantId` | `klynx-api` (set at Register from caller JWT realm) | org admin via portal | MongoDB | **Used as the primary scoping key** for `AuthServiceAccount` lookup together with `clientId`. Immutable after creation |
| `integration_tokens.status` | `klynx-api` (`IntegrationTokenService.Revoke`) | org admin via portal | MongoDB | Read by `AuthServiceAccount` middleware on every call |
| `integration_tokens.scopes` | `klynx-api` (`IntegrationTokenService.Register`) | org admin via portal | MongoDB | Source of truth for scope check |
| `integration_tokens.orgId` | `klynx-api` (set at Register) | org admin via portal | MongoDB | Set once; immutable after creation |
| `integration_tokens.clientId` | `klynx-api` (generated at Register) | — | MongoDB | Looked up together with `tenantId`. Immutable after creation |
| `integration_tokens.lastUsedAt` | `klynx-api` (`AuthServiceAccount` middleware) | M2M caller | MongoDB | Best-effort, throttled update (only writes if older than 5 min) |

No new mutable fields are introduced by the files surface; it inherits the same registry.

### 9.3 Conflict Resolution

- Single writer (klynx-api) for all integration registry fields. No sync conflicts.
- `lastUsedAt` updates are best-effort; lost updates are acceptable.

---

## 10. Frontend Integration Notes

_No frontend integration. This contract is consumed by third-party servers only._

### Required Integrator Behavior (events + files)

- Persist the access token in memory with respect to `expires_in`; refresh ahead of expiry.
- Do not reuse the access token across organizations — each integration maps to exactly one org.
- Do not guess undocumented fields. Extra JSON fields present in responses are reserved — do not rely on them.
- Do not rely on implicit defaults unless specified here.
- Treat the documented error codes (§5.2 / §5.3 / §5.4) as the only supported error contract.

### Required Integrator Behavior (files-specific)

- Fetch file paths **only** from `binaryRefs[].objectId` returned by §5.3 — do not construct paths by hand.
- Preserve the full object key verbatim. Do not URL-decode / re-encode / strip segments.
- Authorization header is the **same** Bearer token used for §5.2 / §5.3. Reuse cached tokens; obey `expires_in`.
- Cache response bytes client-side honoring `Cache-Control`. Object bytes are immutable for a given `objectId`.
- Treat 403 `FORBIDDEN_PATH_SCOPE` as a permanent, do-not-retry failure for the offending path.

### Example Flow (events → files)

1. `POST /api/v3/token/api/clientCredentials` → receive `access_token`.
2. `GET /api/v3/thirdParty/events?page=1&perPage=20` → list events in date range.
3. `GET /api/v3/thirdParty/events/<eventId>` → receive `binaryRefs[]` including an object with `bucket=canonical, objectId=<wsId>/events/<eventId>/pictureList_0.jpg`.
4. `GET /api/v3/thirdParty/files/canonical/<wsId>/events/<eventId>/pictureList_0.jpg` with the same Bearer token → 200 + JPEG bytes.

---

## 11. Rollout Notes

| Repo | Dependency | Required Before | Notes |
|---|---|---|---|
| `klynx-api` | events surface — new middleware + routes + repo methods + `ErrGatewayAuthRejected` sentinel | phase 1 | Only repo with code changes for events surface. Controllers on both `/api/v3/events` (user) and `/api/v3/thirdParty/events` (M2M) map the sentinel to HTTP 502 |
| `klynx-api` | files surface — `ThirdPartyFileGuard` middleware + new `thirdpartyfileapi.ServeEventFile` handler + env gate | phase 1 | Only repo with code changes for files surface. Reuses `internal/infra/s3.DownloadByKey` |
| `gateway-api` (gRPC fetcher deployments) | none | — | gRPC path does not forward the caller JWT; service-account JWT acceptance is a non-issue here |
| `gateway-api` (REST fetcher deployments) | none (informational) | — | Staging verification only: confirm gw accepts forwarded service-account JWT on `GET /ingest/details/{eventId}`. If it rejects, callers observe documented 502 `UPSTREAM_AUTH_REJECTED`; follow-up work (gw-side) to adjust audience/realm trust |

**Status:** Both surfaces shipped 2026-04-22 (events: Approved r1/r2/r3 metadata sync; files: Draft r3 → Active via this consolidation).

---

## 12. Examples

### Example REST Request — Exchange Token

```bash
curl -X POST 'https://aliza.k-lynx.com/api/v3/token/api/clientCredentials' \
  -H 'Content-Type: application/json' \
  -d '{
    "client_id": "<client_id>",
    "client_secret": "<client_secret>"
  }'
```

### Example REST Request — List Events

```bash
curl 'https://aliza.k-lynx.com/api/v3/thirdParty/events?page=1&perPage=10&sortOrder=desc&from=2026-04-20T17:00:00Z&to=2026-04-21T16:59:59Z' \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

### Example REST Request — Get Event Detail

```bash
curl 'https://aliza.k-lynx.com/api/v3/thirdParty/events/evt_01JABCDEF' \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

### Example REST Request — Fetch Event Binary (happy path)

```bash
ACCESS_TOKEN=$(curl -s 'https://aliza.k-lynx.com/api/v3/token/api/clientCredentials' \
  -H 'Content-Type: application/json' \
  -d '{"client_id":"<client_id>","client_secret":"<client_secret>"}' \
  | jq -r '.details.access_token')

curl "https://aliza.k-lynx.com/api/v3/thirdParty/files/canonical/2688fa46-00d6-4e50-b2b9-5482187b844a/events/782e2bc2-02a0-4293-a0fe-016c5aedb8b2/pictureList_0.jpg" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -o snapshot.jpg
```

### Example REST Success Responses

See §5.2 (list), §5.3 (detail). §5.4 returns raw bytes (no JSON envelope).

### Example Error — Insufficient scope (events or files)

```json
{
  "code": "INSUFFICIENT_SCOPE",
  "message": "integration is missing required scope: read:events",
  "status": false
}
```

### Example Error — Revoked integration

```json
{
  "code": "TOKEN_REVOKED",
  "message": "integration has been revoked",
  "status": false
}
```

### Example Error — Unknown integration (cross-realm or deleted)

```json
{
  "code": "UNKNOWN_INTEGRATION",
  "message": "no active integration for this tenant and client",
  "status": false
}
```

### Example Error — Upstream gw rejected forwarded SA JWT (§5.3 REST path)

HTTP `502`:

```json
{
  "code": "UPSTREAM_AUTH_REJECTED",
  "message": "gateway-api rejected the forwarded service-account credential",
  "status": false
}
```

### Example Error — Cross-org file attempt (§5.4 path guard)

```bash
# Token belongs to org A (workspace 2688fa46...), but path names org B's workspace
curl "https://aliza.k-lynx.com/api/v3/thirdParty/files/canonical/OTHER_WORKSPACE/events/abc.../pic.jpg" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
# → HTTP 403
# { "code": "FORBIDDEN_PATH_SCOPE", "message": "workspace in path does not match caller's org workspace", "status": false }
```

### Example Error — Unknown bucket (§5.4)

```bash
curl "https://aliza.k-lynx.com/api/v3/thirdParty/files/analytic/2688.../events/abc/pic.jpg" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
# → HTTP 403 { "code": "BUCKET_NOT_ALLOWED", ... }
```

### Example Error — Path-shape violation (missing "events", §5.4)

```bash
curl "https://aliza.k-lynx.com/api/v3/thirdParty/files/canonical/2688.../devices/51/snap.jpg" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
# → HTTP 403 { "code": "PATH_SHAPE_INVALID", ... }
```

### Example Error — Event unknown to this org (§5.4)

```bash
curl "https://aliza.k-lynx.com/api/v3/thirdParty/files/canonical/2688.../events/NOT_MY_EVENT/pic.jpg" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
# → HTTP 404 { "code": "EVENT_NOT_FOUND", ... }
```

---

## 13. Smoke Checklist

### Contract-Read Smoke

- [x] Happy path can be followed from client credentials token to event list/detail and binary fetch.
- [x] Auth / token revocation / scope failure paths are documented.
- [x] Event not found and file not found paths are documented.
- [x] Path guard, workspace scoping, and file-under-event checks are documented.
- [x] Kafka / MQTT / Redis behavior is explicitly `N/A` for this REST-only M2M flow.

### Runtime Smoke

| Case | Surface | Expected Result | Evidence |
|---|---|---|---|
| Token issue | `POST /api/v3/token/api/clientCredentials` | `200 SUCCESS` with `access_token` | Example §12 |
| Event list/detail | `GET /api/v3/thirdParty/events`, `GET /api/v3/thirdParty/events/{id}` | `200 SUCCESS` with documented envelopes | Examples §12 |
| Binary fetch | `GET /api/v3/thirdParty/files/{path}` | Raw bytes, no JSON envelope, no range support | §5.4 + examples §12 |
| Scope/token failure | token or third-party endpoints | Documented `UNAUTHORIZED`, `TOKEN_REVOKED`, `UNKNOWN_INTEGRATION`, or `INSUFFICIENT_SCOPE` | Error matrix §5 |
| IDOR/path guard | file endpoint | Documented 403/404 codes for bucket, path shape, workspace, event, and file checks | §5.4 + examples §12 |

---

## 14. Checklist

- [x] Domain / flow boundary explicit (§0 — token + list + detail + files as one M2M flow; user-facing surfaces explicitly excluded).
- [x] Owner backend explicit (`klynx-api`).
- [x] System of record per domain (integration_tokens, event_refs, gw event_details, MinIO canonical, organizations).
- [x] Canonical store and projection store documented.
- [x] Producers and consumers listed for every surface in scope (4 REST endpoints).
- [x] REST request, response, and error contracts defined for all 4 endpoints (full error matrix preserved verbatim).
- [x] Kafka N/A — explained.
- [x] MQTT N/A — explained.
- [x] Redis N/A — explained.
- [x] Field ownership explicit for integration registry (immutability + writer per field).
- [x] Path guard rules enumerated with failure codes (BUCKET_NOT_ALLOWED, PATH_SHAPE_INVALID, FORBIDDEN_PATH_SCOPE, EVENT_NOT_FOUND, FILE_NOT_UNDER_EVENT, FILE_NOT_FOUND, INTERNAL_ERROR).
- [x] gRPC vs REST fetcher deployment difference documented (502 only on REST path; 503 when GW_API_URL unset).
- [x] Backward compatibility documented (additive — both surfaces).
- [x] Replay / re-sync behavior documented (n/a for GET, projection-lag retry for §5.4).
- [x] Smoke checklist is included and runnable for this domain/flow.
- [x] Examples cover happy path + each IDOR class (cross-org, unknown bucket, path-shape, unknown event).
- [x] Revision history of both source contracts preserved verbatim.
