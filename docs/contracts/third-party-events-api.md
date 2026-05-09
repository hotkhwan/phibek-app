# Third-Party Events API Contract

**Date:** 2026-04-22
**Status:** Superseded by [`third-party-integration.md`](./third-party-integration.md) on 2026-05-04 — events surface (`POST /token/api/clientCredentials`, `GET /thirdParty/events`, `GET /thirdParty/events/:eventId`) merged with the files surface (`GET /thirdParty/files/*`) into one M2M integration contract per the new domain/flow grouping rule (`docs/contracts/README.md`). Both endpoints share `AuthServiceAccount("read:events")`, `(tenantId, clientId)` identity, and the same error envelope; files endpoint guards on event ownership via `event_refs`. Body kept here for PR / consumer history.
**Owner Backend:** `klynx-api`
**Related Plan:** [docs/plan/third-party-events-api.md](../plan/third-party-events-api.md) (r3, approved)
**Applies To Repos:** `klynx-api` (owner), third-party integrators (consumers)
**Contract Type:** REST
**Version:** v1

**Revision notes:**
- **r1:** introduced tenant-bound authentication `(tenantId, clientId)` — `tenantId` derived from JWT `iss` (Keycloak realm), must match the integration record; HTTP 502 `UPSTREAM_AUTH_REJECTED` added to the detail endpoint error contract; gRPC vs REST fetcher-path difference documented.
- **r2/r3 sync (metadata only):** plan drift was entirely on the plan side (§1, §8, §9 in r2; §2, §3 in r3). This contract's wire-level surface did not change — the approved fields, status codes, examples, and field-ownership table are identical to r1. Status label lifted to "Approved" to match the plan's approval state.

---

## 1. Purpose

Define the machine-to-machine (M2M) REST surface third-party integrators use to read events for a given organization, authenticated via an integration-token service account. This contract is the source of truth — integrators must not infer endpoint names, payload shapes, or error codes from partial implementation details or from the user-facing `/api/v3/events` endpoint.

Key distinctions from the user-facing events API:
- Authentication: OAuth2 `client_credentials` flow against Keycloak, not a user JWT.
- Identity binding: `(tenantId, clientId)`. `tenantId` is the Keycloak realm, extracted from the JWT `iss` claim. `clientId` is the JWT `client_id` claim (fallback `azp`). Both must match an active record in `integration_tokens`.
- Organization scoping: resolved server-side from the integration record — **no `X-Active-Org` header**.
- Scope: `read:events` enforced at klynx-api application layer (not Keycloak scope).
- Consumer: servers and automation clients; not consumed by klynx-feature portal or gateway-portal.

---

## 2. Ownership

### Owner Backend

- `klynx-api`

### Domain System of Record

| Domain | System of Record | Canonical Store | Notes |
|---|---|---|---|
| Integration registry (auth source of truth) | `klynx-api` | `integration_tokens` collection (MongoDB) | Authoritative `status` + `scopes` + `orgId` mapping. |
| Event index (for list) | `klynx-api` | `event_refs` collection (MongoDB) | Projection from `gw.events.normalized.v1`. |
| Event canonical detail | `gateway-api` | `event_details` | Fetched on demand via `gwgw.EventClient`. |
| OAuth2 credentials + JWT issuance | Keycloak | realm clients | Secret never stored in klynx-api. |

### Producer / Consumers

| Surface | Producer | Consumers | Notes |
|---|---|---|---|
| `POST /api/v3/token/api/clientCredentials` | klynx-api (proxy to Keycloak) | third-party | Existing; unchanged. |
| `GET /api/v3/thirdParty/events` | klynx-api | third-party | **New.** |
| `GET /api/v3/thirdParty/events/:eventId` | klynx-api | third-party | **New.** |

### Projection Stores

| Projection | Store | Consumer | Notes |
|---|---|---|---|
| Event index | `klynx-api.event_refs` | `eventsvc.ListEvents` | Shared with user-facing `/api/v3/events`. |

---

## 3. Compatibility and Policy

### Backward Compatibility

- Compatibility status: **additive** — new routes, no change to existing ones.
- Consumer requirements: HTTP/1.1 or higher, TLS 1.2+, JSON.
- Deprecation window: n/a (initial ship).

### Replay / Re-sync Behavior

- Replay supported: n/a (GET only).
- Re-sync trigger: n/a.
- Duplicate delivery rule: GET is idempotent; repeated calls return the current state.

### Write Authority Policy

- `klynx-api.integration_tokens` is the authoritative source for integration status and scope at request time. A JWT whose signature is valid but whose record is `revoked` (or missing, or belongs to a different `tenantId`) MUST be rejected with 401.
- Klynx-api resolves identity as a **tenant-scoped** lookup `(tenantId, clientId)`. This guards against cross-realm token reuse even if two realms happen to produce the same `clientId` string.
- Keycloak is authoritative for JWT issuance and signature verification.
- Third-party consumers are read-only with respect to klynx data.

---

## 4. Surface Summary

| Type | Name | Method / Topic | Auth | Producer / Handler | Consumer / Caller |
|---|---|---|---|---|---|
| REST | `/api/v3/token/api/clientCredentials` | POST | none (public) | `thirdapi.ClientCredentialsToken` | third-party |
| REST | `/api/v3/thirdParty/events` | GET | Bearer SA JWT + scope `read:events` | `thirdpartyeventapi.ListEvents` | third-party |
| REST | `/api/v3/thirdParty/events/:eventId` | GET | Bearer SA JWT + scope `read:events` | `thirdpartyeventapi.GetEvent` | third-party |

**Base URL (example, staging):** `https://aliza.k-lynx.com/api/v3`

---

## 5. REST Contract

### 5.1 Exchange Service-Account Token

**Endpoint:** `/api/v3/token/api/clientCredentials`
**Method:** `POST`
**Auth:** none (public)
**Purpose:** Existing endpoint — included here for end-to-end clarity. Proxies Keycloak `grant_type=client_credentials`.

#### Request Headers

| Header | Required | Description |
|---|---|---|
| `Content-Type` | yes | `application/json` |

#### Request Body

```json
{
  "client_id": "svc_org_9706a7",
  "client_secret": "wXahr9xxxx"
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
| 400 | `BAD_REQUEST` | client_id or client_secret missing | Fix request body and retry. |
| 401 | `UNAUTHORIZED` | Keycloak rejected credentials or unknown client | Verify credentials; if revoked, create a new integration. |

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
| `page` | int | no | `1` | 1-indexed page number. |
| `perPage` | int | no | `20` | Items per page. Max 100 (clamped). |
| `eventType` | string | no | — | Filter by event type. |
| `from` | string (RFC3339) | no | — | Lower bound on `occurredAt`. |
| `to` | string (RFC3339) | no | — | Upper bound on `occurredAt`. |
| `sortOrder` | string | no | `desc` | `asc` or `desc` on `occurredAt`. |

#### Request Headers

| Header | Required | Description |
|---|---|---|
| `Authorization` | yes | `Bearer <access_token>` from §5.1. |
| `X-Active-Org` | **no** | **Must not be sent.** Org is resolved from the integration record. |

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
| `details.items[].id` | string | Event ID. Stable across klynx and gw. |
| `details.items[].orgId` | string | Organization ID owning the event (matches integration's org). |
| `details.items[].workspaceId` | string | Gateway workspace ID. |
| `details.items[].occurredAt` | string (RFC3339) | Event occurrence time. |
| `details.items[].detail` | object (optional) | Present only when gateway-api is reachable and returned a detail object. See §5.3. |
| `pagination.*` | — | Standard page meta — see `CLAUDE.md` → Standard success envelopes. |

#### Error Contract

| HTTP | Code | Meaning | Consumer Handling |
|---|---|---|---|
| 401 | `UNAUTHORIZED` | Missing/expired/invalid JWT signature, or malformed SA token (missing `client_id`/`azp`/`iss`) | Re-exchange token at §5.1. |
| 401 | `TOKEN_REVOKED` | Integration `status=revoked` in klynx registry | Create a new integration; old token is dead. |
| 401 | `UNKNOWN_INTEGRATION` | JWT valid but no record matches `(tenantId, clientId)` — integration was deleted, or token issued by a different Keycloak realm than the one where the integration was registered | Contact org admin — integration was deleted or issued against the wrong realm. |
| 403 | `INSUFFICIENT_SCOPE` | Integration lacks `read:events` in its scopes | Request a new integration with the scope, or ask admin to rotate with correct scopes. |
| 500 | `INTERNAL_ERROR` | Unexpected server error | Retry with backoff; contact support if persistent. |

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
| `eventId` | string | yes | Event ID from list response. |

#### Request Headers

| Header | Required | Description |
|---|---|---|
| `Authorization` | yes | `Bearer <access_token>`. |
| `X-Active-Org` | no | Must not be sent (ignored if present). |

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
| 401 | `UNAUTHORIZED` / `TOKEN_REVOKED` / `UNKNOWN_INTEGRATION` | See §5.2. | Same as §5.2. |
| 403 | `INSUFFICIENT_SCOPE` | See §5.2. | Same as §5.2. |
| 404 | `EVENT_NOT_FOUND` | `eventId` does not exist or belongs to another org | Do not retry. |
| 500 | `INTERNAL_ERROR` | Unexpected server error | Retry with backoff. |
| 502 | `UPSTREAM_AUTH_REJECTED` | REST-fetcher path only: gateway-api rejected the forwarded service-account JWT (401/403 from gw) | **Not a consumer-credential issue.** Report to the klynx-api operator — gw audience/realm configuration for the deployment does not accept service-account JWTs. Retrying will not help until the deployment is fixed. |
| 503 | `SERVICE_UNAVAILABLE` | Gateway-api fetcher not configured in this deployment (e.g. `GW_API_URL` unset in saasPublic profile) | Event detail is unavailable in this profile; use list-only data. |

> **Deployment-mode note (informational, not part of the wire contract):** On deployments where klynx-api uses the gRPC fetcher (`GW_GRPC_URI` set — typically appliance/enterprise), the caller JWT is not forwarded to gateway-api, and 502 `UPSTREAM_AUTH_REJECTED` cannot occur. On REST-fetcher deployments, it can. Consumers do not need to branch on this — they only need to handle the error code.

---

## 6. Event Contract

_No Kafka or async event surfaces are added by this contract._

---

## 7. Canonical and Projection Mapping

### Canonical Store

- System: `gateway-api`
- Store: `event_details` (gw canonical)
- Canonical fields: as defined in gw `ingestmod.EventDetail`.

### Projection Store

- System: `klynx-api`
- Store: `event_refs`
- Projected fields: `eventId`, `orgId`, `workspaceId`, `deviceId`, `deviceName`, `eventType`, `eventCategory`, `eventAction`, `sourceFamily`, `displayLocationName`, `occurredAt`, `deliveryStatus`

### Field Mapping

| Canonical Field | Projection Field | Consumer Field | Notes |
|---|---|---|---|
| `eventId` | `event_refs.eventId` | `details.items[].id` | Same value across layers. |
| `source.deviceId` | `event_refs.deviceId` | `details.items[].deviceId` | Projected on ingest. |
| `source.deviceName` | `event_refs.deviceName` | `details.items[].deviceName` | Projected on ingest. |
| `occurredAt` | `event_refs.occurredAt` | `details.items[].occurredAt` | Same value. |
| (full payload) | — (not stored) | `details.items[].detail` (list) / `details` (detail endpoint) | Fetched live from gw on request. |

---

## 8. Field Ownership

### Integration Registry (auth-relevant)

| Field | Authoritative Writer | Allowed Initiator | Stored In | Notes |
|---|---|---|---|---|
| `integration_tokens.tenantId` | `klynx-api` (set at Register from caller JWT realm) | org admin via portal | MongoDB | **Used as the primary scoping key** for `AuthServiceAccount` lookup together with `clientId`. Immutable after creation. |
| `integration_tokens.status` | `klynx-api` (`IntegrationTokenService.Revoke`) | org admin via portal | MongoDB | Read by `AuthServiceAccount` middleware on every call. |
| `integration_tokens.scopes` | `klynx-api` (`IntegrationTokenService.Register`) | org admin via portal | MongoDB | Source of truth for scope check. |
| `integration_tokens.orgId` | `klynx-api` (set at Register) | org admin via portal | MongoDB | Set once; immutable after creation. |
| `integration_tokens.clientId` | `klynx-api` (generated at Register) | — | MongoDB | Looked up together with `tenantId`. Immutable after creation. |
| `integration_tokens.lastUsedAt` | `klynx-api` (`AuthServiceAccount` middleware) | M2M caller | MongoDB | Best-effort, throttled update (only writes if older than 5 min). |

### Conflict Resolution

- Single writer (klynx-api). No sync conflicts.
- `lastUsedAt` updates are best-effort; lost updates are acceptable.

---

## 9. Frontend Integration Notes

_No frontend integration. This contract is consumed by third-party servers._

Third-party implementers:
- Do not guess undocumented fields. Extra JSON fields present in responses are reserved — do not rely on them.
- Do not rely on implicit defaults unless specified here.
- Treat the documented error codes (§5.2, §5.3) as the only supported error contract.
- Persist the access token in memory with respect to `expires_in`; refresh ahead of expiry.
- Do not reuse the access token across organizations — each integration maps to exactly one org.

---

## 10. Rollout Notes

| Repo | Dependency | Required Before | Notes |
|---|---|---|---|
| `klynx-api` | new middleware + routes + repo methods + `ErrGatewayAuthRejected` sentinel | phase 1 | Only repo with code changes. Controllers on both `/api/v3/events` (user) and `/api/v3/thirdParty/events` (M2M) map the sentinel to HTTP 502. |
| `gateway-api` (gRPC fetcher deployments) | none | — | gRPC path does not forward the caller JWT; service-account JWT acceptance is a non-issue here. |
| `gateway-api` (REST fetcher deployments) | none (informational) | — | Staging verification only: confirm gw accepts forwarded service-account JWT on `GET /ingest/details/{eventId}`. If it rejects, callers observe documented 502 `UPSTREAM_AUTH_REJECTED`; follow-up work (gw-side) to adjust audience/realm trust. |

---

## 11. Examples

### Example — Exchange Token

```bash
curl -X POST 'https://aliza.k-lynx.com/api/v3/token/api/clientCredentials' \
  -H 'Content-Type: application/json' \
  -d '{
    "client_id": "svc_org_9706a7",
    "client_secret": "wXahr9xxxx"
  }'
```

### Example — List Events

```bash
curl 'https://aliza.k-lynx.com/api/v3/thirdParty/events?page=1&perPage=10&sortOrder=desc&from=2026-04-20T17:00:00Z&to=2026-04-21T16:59:59Z' \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

### Example — Get Event Detail

```bash
curl 'https://aliza.k-lynx.com/api/v3/thirdParty/events/evt_01JABCDEF' \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

### Example Success (list) — see §5.2
### Example Success (detail) — see §5.3

### Example Error — Insufficient scope

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

### Example Error — Upstream gw rejected forwarded SA JWT (REST path)

HTTP `502`:

```json
{
  "code": "UPSTREAM_AUTH_REJECTED",
  "message": "gateway-api rejected the forwarded service-account credential",
  "status": false
}
```

---

## 12. Checklist

- [x] Owner backend is explicit (`klynx-api`).
- [x] System of record is defined by domain.
- [x] Canonical store and projection store are documented.
- [x] Producers and consumers are listed.
- [x] Request, response, and error contracts are defined.
- [x] Field ownership is explicit for integration registry.
- [x] Backward compatibility is documented (additive).
- [x] Replay / re-sync behavior is documented (n/a for GET).
- [x] FE field mapping is included where applicable (n/a — third party only).
