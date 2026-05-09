# Third-Party Files API Contract

**Date:** 2026-04-22
**Status:** Superseded by [`third-party-integration.md`](./third-party-integration.md) on 2026-05-04 — files surface (`GET /thirdParty/files/*`) merged with the events surface (`POST /token/api/clientCredentials`, `GET /thirdParty/events`, `GET /thirdParty/events/:eventId`) into one M2M integration contract per the new domain/flow grouping rule (`docs/contracts/README.md`). Path guard, error codes (BUCKET_NOT_ALLOWED, PATH_SHAPE_INVALID, FORBIDDEN_PATH_SCOPE, EVENT_NOT_FOUND, FILE_NOT_UNDER_EVENT, FILE_NOT_FOUND), and `(workspaceId, eventId)` keying preserved verbatim in §5.4 of the merged contract. Body kept here for PR / consumer history.
**Owner Backend:** `klynx-api`
**Related Plan:** [docs/plan/third-party-files-api.md](../plan/third-party-files-api.md) (r3, pending re-review)
**Applies To Repos:** `klynx-api` (owner), third-party integrators (consumers)
**Contract Type:** REST
**Version:** v1

**Revision notes:**
- **r0:** initial draft. Proposed `/thirdParty/files/:bucket/*` route shape and promised that 404/500 JSON errors would come from the reused `fileapi.ProxyFiles` handler.
- **r1 (2026-04-22):** route shape and error semantics corrected after Codex first review:
  - **Route:** now `/api/v3/thirdParty/files/*` (single wildcard). The `:bucket/*` shape in r0 was incompatible with the existing handler's `c.Params("*")` parsing; the single-wildcard shape also matches the existing `/api/v3/files/*` so the object-path format is identical across both surfaces.
  - **Error envelope:** all 4xx/5xx responses are JSON envelopes emitted by a **new** thin handler `thirdpartyfileapi.ServeEventFile` that reuses the `internal/infra/s3` download helper with explicit MinIO-error classification. r0 incorrectly promised JSON codes that `fileapi.ProxyFiles` (which maps all S3 failures to bare HTTP 502 plain-text) could not actually emit. `fileapi.ProxyFiles` and `/api/v3/files/*` remain untouched.
  - **Range support removed from contract:** the `Accept-Ranges: bytes` header is NOT set, and `Range` requests are NOT honored. A client sending `Range` receives the full object at HTTP 200. The r0 wording implied range support was available; this was an overstatement of the reused handler's behavior.
- **r2 (2026-04-22):** addresses Codex second review. No wire-surface change from r1 — all edits are clarifications of the internal implementation:
  - `EVENT_NOT_FOUND` is now explicitly keyed on `(workspaceId, eventId)`, mirroring the events surface (see plan r2 decision 12.5). Consumers do not observe any behavior change; the change ensures a file whose event `/thirdParty/events` already returned cannot 404 here due to internal key drift. Documented in §5.1 Error Contract and §7 projection mapping.
  - `FILE_NOT_FOUND` classifier now accepts both `Code == "NoSuchKey"` and `StatusCode == 404` from the MinIO SDK, matching existing repo practice. Consumers still see the same envelope; the clarification prevents backend-specific 404s from being surfaced as 500. §5.1 note added.
- **r3 (2026-04-22):** addresses Codex third review. No wire-surface change:
  - §5.1 `403 FORBIDDEN_PATH_SCOPE` row tightened to explicitly state that it applies **only** when the server resolved `org.WorkspaceID` successfully and it differs from the path-supplied value. Previously the row could be read as covering "server cannot resolve caller's workspace", which is actually a 500.
  - §5.1 `500 INTERNAL_ERROR` row enumerates the workspace-resolution failure modes (DB error, nil org, empty `WorkspaceID`) alongside the S3 failure cases, so integrators see the full set of causes under one code. The contract already mapped these to 500 from r1; this revision just makes it unambiguous.

---

## 1. Purpose

Defines the M2M REST surface by which a service-account integration fetches the binary objects referenced in event detail responses (`binaryRefs[].objectId`) from `/api/v3/thirdParty/events/:eventId`. This is a companion to the third-party events contract: both endpoints share the `AuthServiceAccount("read:events")` middleware and the `(tenantId, clientId)` identity binding, but the files endpoint adds a **strict event-bound path guard** so a given integration can only fetch binaries that correspond to events it could already read.

Integrators must not infer path shapes, bucket names, or error codes from partial implementation details or from the user-facing `/api/v3/files/*` endpoint — that endpoint uses a different middleware stack and accepts a broader set of paths.

Key properties:
- Authentication and scope model: **identical** to `/api/v3/thirdParty/events` (see that contract). Scope is `read:events`, re-used intentionally.
- Path shape: **strict**. Only `canonical/<workspaceId>/events/<eventId>/<...>` is accepted. Every other shape is rejected before any S3 call is made.
- Org-scoping: **server-resolved**. No `X-Active-Org` header. `<workspaceId>` in the path must equal `org.WorkspaceID` for the integration's org.
- Event-scoping: **enforced**. `<eventId>` must be present in `event_refs` for `(workspaceId, eventId)` — `workspaceId` resolved from the caller's org via `OrgRepo.FindById`. Matches the workspace-first preference of the events listing surface.

---

## 2. Ownership

### Owner Backend

- `klynx-api`

### Domain System of Record

| Domain | System of Record | Canonical Store | Notes |
|---|---|---|---|
| Integration registry | `klynx-api` | `integration_tokens` (MongoDB) | Same as events contract. |
| Event ownership (guard) | `klynx-api` | `event_refs` (MongoDB) | Guard existence check uses `(workspaceId, eventId)` point lookup over the existing `{workspaceId:1, occurredAt:-1}` index — matches `eventsvc.ListEvents` workspace-first semantics. The unique `{orgId:1, eventId:1}` index exists for list queries but is not used by this guard. |
| Workspace ↔ org mapping | `klynx-api` | `organizations` (MongoDB) | `OrgRepo.FindById(orgId).WorkspaceID`. |
| Binary object bytes | MinIO `canonical` bucket | — | Proxied on demand. klynx-api never writes. |

### Producer / Consumers

| Surface | Producer | Consumers | Notes |
|---|---|---|---|
| `GET /api/v3/thirdParty/files/*` | klynx-api | third-party | **New.** `ThirdPartyFileGuard` middleware + new `thirdpartyfileapi.ServeEventFile` handler. Reuses `internal/infra/s3.DownloadByKey`. |

---

## 3. Compatibility and Policy

### Backward Compatibility

- Compatibility status: **additive** — new route. `/api/v3/files/*` is untouched.
- Consumer requirements: HTTP/1.1+, TLS 1.2+, Bearer auth.
- Deprecation window: n/a.

### Replay / Re-sync Behavior

- GET only; idempotent.
- If an event's `event_refs` row is ever deleted (no current flow), subsequent file fetches for that event return 404 `EVENT_NOT_FOUND` — correct failure mode.

### Write Authority Policy

- Read-only proxy. Third-party consumers cannot upload, modify, or delete objects via this endpoint.

---

## 4. Surface Summary

| Type | Name | Method / Topic | Auth | Producer / Handler | Consumer / Caller |
|---|---|---|---|---|---|
| REST | `/api/v3/thirdParty/files/*` | GET | Bearer SA JWT + scope `read:events` + event-bound path guard | `ThirdPartyFileGuard` → `thirdpartyfileapi.ServeEventFile` | third-party |

**Base URL (example, staging):** `https://aliza.k-lynx.com/api/v3`

---

## 5. REST Contract

### 5.1 Fetch event binary (third-party)

**Endpoint:** `/api/v3/thirdParty/files/*`
**Method:** `GET`
**Auth:** Bearer service-account JWT; integration must be `active` and have scope `read:events`.
**Purpose:** Stream the bytes of a binary object that is attached to a specific event owned by the integration's organization.

#### Path Params

| Field | Type | Required | Description |
|---|---|---|---|
| `*` | string (wildcard) | yes | Full object path including the bucket as the first segment. MUST be shaped `canonical/<workspaceId>/events/<eventId>/<filename[/...]>`. |

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

Any deviation → 403/404 per §5.1 Error Contract. No S3 call is made on failure.

#### Query Params

_None._

#### Request Headers

| Header | Required | Description |
|---|---|---|
| `Authorization` | yes | `Bearer <access_token>` from the third-party events contract §5.1. |
| `X-Active-Org` | **no** | Must not be sent. Org is resolved from the integration record. |

#### Request Body

_None (GET)._

#### Success Response

**HTTP:** `200`

Response is the raw object bytes. Headers set by the handler:

| Header | Value | Notes |
|---|---|---|
| `Content-Type` | sniffed per object (e.g. `image/jpeg`) | Derived from the file extension or content sniffing; mirrors the behavior of the user-facing handler. |
| `Cache-Control` | `public, max-age=86400` | 24-hour client cache hint. |

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
| 401 | `UNAUTHORIZED` | Missing / expired / invalid JWT signature, or malformed SA token (missing `client_id`/`azp`/`iss`). | Re-exchange the token (third-party events §5.1). |
| 401 | `TOKEN_REVOKED` | Integration `status=revoked` in klynx registry. | Create a new integration; old token is dead. |
| 401 | `UNKNOWN_INTEGRATION` | JWT valid but no record matches `(tenantId, clientId)`. | Contact org admin — integration deleted or issued against the wrong realm. |
| 403 | `INSUFFICIENT_SCOPE` | Integration lacks `read:events`. | Request rotation with correct scopes. |
| 403 | `BUCKET_NOT_ALLOWED` | First path segment is not `canonical`. | Fetch only paths coming from `binaryRefs[].objectId` where `bucket == "canonical"`. Do not invent bucket names. |
| 403 | `PATH_SHAPE_INVALID` | Path does not match `canonical/<wsId>/events/<eventId>/<tail>`, or contains `..`/`.`/empty segments anywhere. | Use the `objectId` string exactly as returned by the events endpoint; do not manipulate. |
| 403 | `FORBIDDEN_PATH_SCOPE` | Server resolved the caller's `org.WorkspaceID` successfully but the path's `<workspaceId>` does not match it. Note: this code is **not** used when the server cannot resolve the caller's workspace at all — that is a server-side inconsistency and surfaces as 500 `INTERNAL_ERROR`. | Likely cross-org attempt or stale integration metadata. Do not retry. |
| 404 | `EVENT_NOT_FOUND` | `<eventId>` in the path is not present in `event_refs` for the caller's workspace. (Ownership is keyed on `workspaceId`, not `orgId` — matches the events listing surface where gw-originating events sometimes carry only `workspaceId`.) | If the event was just discovered via `/thirdParty/events`, retry with short backoff (projection lag is rare but possible). If persistent, the event is not readable by this integration. |
| 404 | `FILE_NOT_UNDER_EVENT` | Path has too few segments — cannot name a file under an event (minimum 5 segments: `canonical/<wsId>/events/<eventId>/<filename>`). | Check that `objectId` includes a filename segment. |
| 404 | `FILE_NOT_FOUND` | Guard passed but MinIO returned a not-found response for the object (either `Code="NoSuchKey"` or HTTP `StatusCode=404`). | The binary was deleted or never uploaded. Do not retry. |
| 500 | `INTERNAL_ERROR` | Unexpected server error. Includes: caller's workspace cannot be resolved (org lookup DB error, nil org without error, org with empty `WorkspaceID`); S3 network failure; any non-404 S3 error. Never a caller-side violation. | Retry with backoff. |

#### Error Example

```json
{
  "code": "FORBIDDEN_PATH_SCOPE",
  "message": "workspace in path does not match caller's org workspace",
  "status": false
}
```

---

## 6. Event Contract

_No Kafka or async event surfaces are added by this contract._

---

## 7. Canonical and Projection Mapping

### Canonical Store

- System: MinIO
- Bucket: `canonical`
- Object keys: minted by gateway-api ingest pipeline; klynx-api is a read-only proxy.

### Projection Store (for guard)

- System: klynx-api
- Store: `event_refs`
- Indexed fields used: `orgId`, `eventId` (unique composite).

### Field Mapping

| Canonical (gw) | Projection (klynx) | Third-party consumer field | Notes |
|---|---|---|---|
| `event_details.eventId` | `event_refs.eventId` | `binaryRefs[].objectId[2]` (the `<eventId>` segment) | Same value across all three. |
| `event_details.orgId` (== workspaceId in gw's terminology) | `event_refs.workspaceId` | `binaryRefs[].objectId[0]` (the `<workspaceId>` segment) | Guard compares against `organizations.workspaceId` for the caller's klynx org, then uses the same `workspaceId` as the key for the `(workspaceId, eventId)` existence check — matches the events surface which also prefers workspace-first matching. |

---

## 8. Field Ownership

Inherited from [third-party-events-api.md](third-party-events-api.md) §8. No new mutable fields introduced by this contract.

---

## 9. Third-Party Integration Notes

### Required Integrator Behavior

- Fetch file paths **only** from `binaryRefs[].objectId` returned by `/api/v3/thirdParty/events/:eventId` — do not construct paths by hand.
- Preserve the full object key verbatim. Do not URL-decode / re-encode / strip segments.
- Authorization header is the **same** Bearer token used for `/thirdParty/events`. Reuse cached tokens; obey `expires_in`.
- Cache response bytes client-side honoring `Cache-Control`. Object bytes are immutable for a given `objectId`.

### Example Flow

1. `GET /api/v3/thirdParty/events/782e2bc2-...` → receive `binaryRefs[]` including an object with `bucket=canonical, objectId=2688fa46-.../events/782e2bc2-.../pictureList_0.jpg`.
2. `GET /api/v3/thirdParty/files/canonical/2688fa46-.../events/782e2bc2-.../pictureList_0.jpg` with the same Bearer token → 200 + JPEG bytes.

### Guardrails

- Do not rely on undocumented response headers.
- Do not assume any bucket other than `canonical` is accessible.
- Treat 403 `FORBIDDEN_PATH_SCOPE` as a permanent, do-not-retry failure for the offending path.

---

## 10. Rollout Notes

| Repo | Dependency | Required Before | Notes |
|---|---|---|---|
| `klynx-api` | new middleware + route + env gate | phase 1 | Only repo with code changes. |
| `gateway-api` | none | — | Not involved. Path guard uses klynx's own projection. |

---

## 11. Examples

### Example — fetch event binary (happy path)

```bash
ACCESS_TOKEN=$(curl -s 'https://aliza.k-lynx.com/api/v3/token/api/clientCredentials' \
  -H 'Content-Type: application/json' \
  -d '{"client_id":"svc_org_9706a7","client_secret":"wXahr9xxxx"}' \
  | jq -r '.details.access_token')

curl "https://aliza.k-lynx.com/api/v3/thirdParty/files/canonical/2688fa46-00d6-4e50-b2b9-5482187b844a/events/782e2bc2-02a0-4293-a0fe-016c5aedb8b2/pictureList_0.jpg" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -o snapshot.jpg
```

### Example — cross-org attempt (rejected by guard)

```bash
# Token belongs to org A (workspace 2688fa46...), but path names org B's workspace
curl "https://aliza.k-lynx.com/api/v3/thirdParty/files/canonical/OTHER_WORKSPACE/events/abc.../pic.jpg" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
# → HTTP 403
# { "code": "FORBIDDEN_PATH_SCOPE", "message": "workspace in path does not match caller's org workspace", "status": false }
```

### Example — unknown bucket

```bash
curl "https://aliza.k-lynx.com/api/v3/thirdParty/files/analytic/2688.../events/abc/pic.jpg" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
# → HTTP 403 { "code": "BUCKET_NOT_ALLOWED", ... }
```

### Example — path-shape violation (missing "events")

```bash
curl "https://aliza.k-lynx.com/api/v3/thirdParty/files/canonical/2688.../devices/51/snap.jpg" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
# → HTTP 403 { "code": "PATH_SHAPE_INVALID", ... }
```

### Example — event unknown to this org

```bash
curl "https://aliza.k-lynx.com/api/v3/thirdParty/files/canonical/2688.../events/NOT_MY_EVENT/pic.jpg" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
# → HTTP 404 { "code": "EVENT_NOT_FOUND", ... }
```

---

## 12. Checklist

- [x] Owner backend is explicit (`klynx-api`).
- [x] System of record is defined by domain.
- [x] Canonical store and projection store are documented.
- [x] Producers and consumers are listed.
- [x] Request, response, and error contracts are defined.
- [x] Path guard rules are enumerated with failure codes.
- [x] Backward compatibility is documented (additive).
- [x] Replay / re-sync behavior is documented (n/a for GET).
- [x] Examples cover happy path + each IDOR class.
- [ ] Codex review verdict captured (pending).
