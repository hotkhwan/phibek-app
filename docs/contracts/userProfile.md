# User Profile Contract

**Date:** 2026-04-27
**Status:** Superseded by [`user-profile-and-roles.md`](./user-profile-and-roles.md) on 2026-05-04 — target-state Mongo `user_profiles` migration (NOT YET IMPLEMENTED) merged with current Keycloak-store implementation, role-naming canonical, user-org-role-edit, and FE display surface into one User Profile + Roles lifecycle contract per the new domain/flow grouping rule (`docs/contracts/README.md`). All target-state architecture preserved verbatim in §1 / §5.1-5.2 / §5.10-5.11 / §9 of the merged contract: KC ↔ Mongo split with `user_profiles` collection; `extensions.<domain>.*` per-domain subdocs; nested `preferences.{perPage, map.{lat,lng,zoomLevel}}`; absolute URL `avatar` (P-4); `refId` v1 carry-over (P-1, no connector-pairing); `USER_DELETE` leave-row-disable (P-5); `identitySyncedAt` freshness key (NOT `updatedAt`); JWT claim deny-list (`activeOrgId`/`permissions`/`map_*`/`perPage`/`avatar`/`department`/`refId`); `activeOrgId` UI preference vs `X-Active-Org` runtime header; KC webhook (USER_UPDATE/USER_DELETE; USER_DISABLE NOT a separate event); admin manual repair endpoint. Body kept here for PR / Codex review history.
**Owner Backend:** `klynx-api`
**Related Plan:** [docs/plan/userProfile-store.md](../plan/userProfile-store.md)
**Applies To Repos:** `klynx-api`, `klynx-feature`, `gateway-api` (consumer of identity only), `klynx-connector` (refId consumer — unaffected)
**Contract Type:** REST
**Version:** v1

---

## 1. Purpose

Defines the canonical split for user-related data across Keycloak, Permify, and klynx-api, plus the REST surface that exposes app-level user profile to FE/BE consumers.

- klynx-api publishes this contract; FE and downstream backends read against it.
- The contract removes app-level user attributes (`avatar`, `department`, `refId`, `activeOrgId`, `perPage`, `map_lat`, `map_lng`, `zoomLevel`) from Keycloak and stores them in a new `user_profiles` Mongo collection owned by klynx-api.
- Keycloak is retained only for identity (`email`, `username`, `firstName`, `lastName`, `enabled`) and global realm role.
- Permify continues to own all permission / org-role / resource-grant decisions.
- JWT MUST NOT carry app-level state (`activeOrgId`, permissions, `map_*`, `perPage`, `avatar`, `department`, `refId`). JWT is identity, not a profile cache.

---

## 2. Ownership

### Owner Backend

- `klynx-api`

### Domain System of Record

| Domain | System of Record | Canonical Store | Notes |
|---|---|---|---|
| User identity | Keycloak | Keycloak realm | `email`, `username`, `firstName`, `lastName`, `enabled` only |
| Global platform role | Keycloak | Keycloak realm role mapping | e.g. `administrator`; not org-scoped |
| Permission / org role / relationship / resource grant | Permify | Permify schema | unchanged from existing authz model |
| User app profile + preferences + state | `klynx-api/userprofilerepo` | `user_profiles` collection (new) | one document per userId |
| Domain-specific profile extension | `klynx-api/userprofilerepo` | `user_profiles.extensions.<domain>` (subdoc) | only until the extension grows its own lifecycle / permission / heavy query |
| Avatar binary | `klynx-api/internal/infra/s3` | S3 / MinIO | URL referenced from `user_profiles.avatar` (always absolute URL — see §5.1) |
| Connector pairing refId (v1) | `klynx-api` | `user_profiles.refId` (single field, user-scoped) | **v1 decision (locked):** carry-over of the current shape only. No connector-pairing semantics (singleUse / multiUse / expiresAt / requireApproval per CLAUDE.md) are introduced by this contract. Org-scoped pairing is a separate plan + contract; until that ships, `refId` here is treated as opaque app data. |

### Producer / Consumers

| Surface | Producer | Consumers | Notes |
|---|---|---|---|
| `GET /users/profile` | `usrapi.GetProfile` | `klynx-feature` (header / settings / map preferences) | path unchanged from existing impl; payload shape changes (envelope is now nested `preferences` + `extensions`) |
| `PATCH /users/profile` | `usrapi.UpdateProfile` | `klynx-feature` (settings, map prefs, org switcher) | partial update; identity fields proxied to KC, app fields written to Mongo |
| `POST /users/profile/avatar` | `usrapi.UploadUserAvatar` | `klynx-feature` (avatar upload) | unchanged surface; storage backend (S3) unchanged; reference now lives in `user_profiles.avatar` |
| `POST /webhooks/keycloak/userUpdated` | `usrapi.KeycloakUserUpdatedWebhook` (new) | Keycloak event-listener SPI (out-of-band; see plan §9) | one-way KC → klynx-api identity sync; signed shared-secret auth |
| `POST /admin/system/userProfile/repair` | `sysapi.RepairUserProfiles` (new) | platform admin only | manual repair: re-pull all KC users, upsert identity into `user_profiles` |

### Projection Stores

Not applicable — `user_profiles` is the canonical store for app-level profile, not a projection. Identity fields mirrored from Keycloak are read-through copies, not projections (see §8 sync rules).

---

## 3. Compatibility and Policy

### Backward Compatibility

- Status: **breaking** for the JSON envelope of `GET /users/profile` and `PATCH /users/profile` — fields previously flat (`mapLat`, `mapLng`, `zoomLevel`, `perPage`) are now nested under `preferences` / `preferences.map`.
- KC attribute read paths are removed in the same release; FE must be deployed in lockstep against the new envelope.
- Path is unchanged (`/users/profile`); only payload shape changes. Versioning via path (`/v2/users/profile`) is rejected — the old shape was undocumented.

### Replay / Re-sync Behavior

- Replay supported: yes, via `POST /admin/system/userProfile/repair`.
- Re-sync trigger: on first login (lazy), on Keycloak user lifecycle webhooks (`USER_UPDATE`, `USER_DELETE` — `USER_DISABLE` is delivered as `USER_UPDATE` with `enabled=false`), or via the admin repair endpoint.
- Duplicate delivery rule: idempotent upsert by `userId`. Identity fields overwrite from KC; app fields are never overwritten by repair (KC is not authoritative for them).
- Idempotency / freshness key for KC → `user_profiles` sync: **`identitySyncedAt`** (a dedicated timestamp on the profile row that tracks the last applied KC identity event). The webhook handler compares `payload.occurredAt > user_profiles.identitySyncedAt` to decide whether to apply. **`updatedAt` is not used for sync ordering** because it also moves on app-level writes (preferences, avatar, `activeOrgId`) and would cause a real later KC change to be discarded.

### Write Authority Policy

- Keycloak is authoritative for identity (`email`, `username`, `firstName`, `lastName`, `enabled`).
- klynx-api `user_profiles` is authoritative for app-level profile + preferences + state.
- Permify is authoritative for authz.
- Identity edits initiated through `PATCH /users/profile` are persisted to Keycloak first, then mirrored to `user_profiles` (no equal-authority dual-write).
- App-level edits write to `user_profiles` only — never round-tripped to Keycloak.

---

## 4. Surface Summary

| Type | Name | Method / Topic | Auth | Producer / Handler | Consumer / Caller |
|---|---|---|---|---|---|
| REST | `/users/profile` | `GET` | `BearerAuth` | `usrapi.GetProfile` | klynx-feature |
| REST | `/users/profile` | `PATCH` | `BearerAuth` | `usrapi.UpdateProfile` | klynx-feature |
| REST | `/users/profile/avatar` | `POST` (multipart) | `BearerAuth` | `usrapi.UploadUserAvatar` | klynx-feature |
| REST | `/webhooks/keycloak/userUpdated` | `POST` | shared-secret HMAC header | `usrapi.KeycloakUserUpdatedWebhook` | Keycloak event listener SPI |
| REST | `/admin/system/userProfile/repair` | `POST` | `BearerAuth` + platform `administrator` role | `sysapi.RepairUserProfiles` | platform admin UI / ops |

---

## 5. REST Contract

### 5.1 Get Profile

**Endpoint:** `/users/profile`
**Method:** `GET`
**Auth:** `Authorization: Bearer <jwt>`
**Purpose:** Return the authenticated user's identity (mirrored from KC) + app-level profile + preferences + extensions.

#### Request Headers

| Header | Required | Description |
|---|---|---|
| `Authorization` | yes | `Bearer <jwt>` |

#### Success Response

**HTTP:** `200`

```json
{
  "code": "SUCCESS",
  "message": "OK",
  "status": true,
  "details": {
    "userId": "kc-user-uuid",
    "username": "alice",
    "email": "alice@example.com",
    "firstName": "Alice",
    "lastName": "Liddell",
    "enabled": true,
    "platformRole": "administrator",
    "avatar": "https://cdn.klynx.io/avatars/kc-user-uuid.jpg",
    "department": "engineering",
    "refId": "RID-AB12-CD34",
    "activeOrgId": "org-7f3e",
    "preferences": {
      "perPage": 20,
      "map": {
        "lat": 13.7563,
        "lng": 100.5018,
        "zoomLevel": 12
      }
    },
    "extensions": {
      "station": {
        "stationCode": "ST001",
        "stationName": "Bangkok Station",
        "position": "operator"
      }
    },
    "createdAt": "2026-01-15T10:00:00Z",
    "updatedAt": "2026-04-27T08:31:00Z"
  }
}
```

#### Success Field Definitions

| Field | Type | Owner | Description |
|---|---|---|---|
| `userId` | string | Keycloak | Keycloak user ID (used as `_id` in `user_profiles`) |
| `username` | string | Keycloak | mirrored read-through |
| `email` | string | Keycloak | mirrored read-through |
| `firstName`, `lastName` | string | Keycloak | mirrored read-through |
| `enabled` | bool | Keycloak | mirrored read-through |
| `platformRole` | string | Keycloak | runtime identity context derived from the JWT's realm role list. Value is **always** one of `"administrator"` or `"user"` (the auth middleware rejects requests with no recognizable role with `403` before this handler runs). **Source-of-truth (locked):** primary = JWT `realm_access.roles[]`; fallback = flat `claims["role"]` claim (legacy KC mapper, optimization only — not authoritative). **Simplified projection (locked):** if `realm_access.roles[]` contains `"administrator"` → `"administrator"`; else → `"user"`. This is **not** the user's full role list — if you need the full list, request a separate `realmRoles []string` field via a follow-up plan. **Not stored in `user_profiles`** — never persisted, never written, never projected. Org / app permissions remain owned by Permify; this field is platform-scoped identity context only, distinct from KC realm-role-list semantics, Permify org roles, and any FE UI gating role. |
| `avatar` | string | klynx-api | **absolute URL** (always). S3 key is an internal detail and never appears in this field. |
| `department` | string | klynx-api | free-form org/team label |
| `refId` | string | klynx-api | v1 carry-over of the legacy user-scoped attribute. Treated as opaque app data; no connector-pairing semantics are guaranteed by this contract — see §2 row "Connector pairing refId (v1)". |
| `activeOrgId` | string | klynx-api | **persisted UI preference** — the org FE should pre-select on next session / page load. **Not** the runtime org context for a request. The runtime org context is the `X-Active-Org` request header validated by `ActiveOrg()` middleware (unchanged); `activeOrgId` is **never** sourced from JWT and **never** authoritative for permission checks. |
| `preferences.perPage` | int | klynx-api | default page size hint for FE; not enforced server-side |
| `preferences.map.lat` | float | klynx-api | last-used map center latitude |
| `preferences.map.lng` | float | klynx-api | last-used map center longitude |
| `preferences.map.zoomLevel` | int | klynx-api | last-used map zoom |
| `extensions.<domain>.*` | object | klynx-api | domain-scoped extension subdoc (e.g. `station`) |
| `createdAt`, `updatedAt` | RFC3339 UTC | klynx-api | profile row timestamps. `updatedAt` moves on **any** field write (identity mirror, app fields, preferences, extensions). |
| `identitySyncedAt` | RFC3339 UTC | klynx-api | last applied Keycloak identity event timestamp. Updated **only** when the identity mirror changes (lazy create, KC webhook, admin repair). Used for KC → `user_profiles` idempotency; never for app-level writes. Internal field — not part of the public response envelope. |

#### Error Contract

| HTTP | Code | Meaning | Consumer Handling |
|---|---|---|---|
| 401 | `UNAUTHORIZED` | missing or invalid JWT | redirect to login |
| 500 | `PROFILE_LOAD_FAILED` | Keycloak unreachable + profile row not in cache | retry with backoff; do not write any local fallback |

---

### 5.2 Update Profile

**Endpoint:** `/users/profile`
**Method:** `PATCH`
**Auth:** `Authorization: Bearer <jwt>`
**Purpose:** Partial update. Identity fields are written through to Keycloak first; app-level fields are written to `user_profiles` only.

#### Request Body

```json
{
  "firstName": "Alice",
  "lastName": "Liddell",
  "department": "engineering",
  "activeOrgId": "org-7f3e",
  "preferences": {
    "perPage": 50,
    "map": { "lat": 13.7563, "lng": 100.5018, "zoomLevel": 14 }
  },
  "extensions": {
    "station": { "stationCode": "ST001" }
  }
}
```

All fields are optional. Only fields present in the request are updated. `email`, `username`, `enabled`, `userId`, `createdAt`, `updatedAt`, `refId` are not editable through this endpoint.

#### Request Field Definitions

| Field | Type | Owner Store | Write Path |
|---|---|---|---|
| `firstName`, `lastName` | string | Keycloak | klynx-api → KC admin API → mirror back to `user_profiles` |
| `avatar` | string | klynx-api | direct write to `user_profiles.avatar` (set via `/users/profile/avatar` upload — included here only when clearing) |
| `department` | string | klynx-api | direct write to `user_profiles.department` |
| `activeOrgId` | string | klynx-api | direct write to `user_profiles.activeOrgId` (no KC, no JWT) |
| `preferences.*` | object | klynx-api | direct write to `user_profiles.preferences.*` |
| `extensions.<domain>.*` | object | klynx-api | direct write to `user_profiles.extensions.<domain>.*` (deep-merge per domain key) |

#### Success Response

**HTTP:** `200` — same envelope as §5.1 (returns the full updated profile). The `platformRole` field (see §5.1 field definitions) is included on every authenticated response; it is sourced from the request's JWT, not from the patch payload, and is never modifiable through this endpoint.

#### Error Contract

| HTTP | Code | Meaning | Consumer Handling |
|---|---|---|---|
| 400 | `INVALID_INPUT` | unknown field, malformed body, immutable field present | fix client payload |
| 400 | `INVALID_ORG` | `activeOrgId` is not in user's allowed org set (Permify check) | force user to pick a valid org |
| 401 | `UNAUTHORIZED` | missing or invalid JWT | redirect to login |
| 409 | `KEYCLOAK_WRITE_FAILED` | identity write to KC failed (no partial commit) | retry; nothing was persisted |
| 500 | `PROFILE_WRITE_FAILED` | Mongo write failed after KC succeeded — see plan §11 for compensation | retry; eventual consistency repair on next read |

---

### 5.3 Upload Avatar

**Endpoint:** `/users/profile/avatar`
**Method:** `POST`
**Auth:** `Authorization: Bearer <jwt>`
**Purpose:** Multipart upload of avatar image. Stores the image binary in S3, then writes the resulting **absolute URL** to `user_profiles.avatar` (S3 keys never appear in this field — see §5.1).

Surface unchanged from current implementation; only the storage destination of the URL string changes (Mongo instead of KC attribute). Body shape, validation, and S3 path are out of scope for this contract.

---

### 5.4 Keycloak User-Lifecycle Webhook (inbound)

**Endpoint:** `/webhooks/keycloak/userUpdated`
**Method:** `POST`
**Auth:** HMAC shared-secret header `X-KC-Signature` (out of band of Bearer auth)
**Purpose:** One-way Keycloak → klynx-api sync. Triggered by KC event listener SPI when a KC user changes externally (admin console, KC REST, federated IdP, account-console self-edit).

#### Supported Event Types (v1)

| `eventType` | Trigger in KC | klynx-api action |
|---|---|---|
| `USER_UPDATE` | any user attribute / identity / `enabled` change | upsert identity mirror in `user_profiles`; if `enabled=false` is in the payload, this also covers the disable case |
| `USER_DELETE` | KC user deleted | mark `user_profiles.enabled=false`, set `user_profiles.deletedAt=occurredAt`, leave the row in place (per Decision Point P-5: "leave row + disable" — never hard-delete) |

`USER_DISABLE` is **not** a separate KC event. KC delivers user disable as a `USER_UPDATE` with `enabled=false`; the handler must read `enabled` from the payload and persist it.

#### Request Body

```json
{
  "eventType": "USER_UPDATE",
  "userId": "kc-user-uuid",
  "username": "alice",
  "email": "alice@example.com",
  "firstName": "Alice",
  "lastName": "Liddell",
  "enabled": true,
  "occurredAt": "2026-04-27T08:31:00Z"
}
```

For `USER_DELETE` the payload may omit identity fields except `userId`, `eventType`, `occurredAt`.

#### Behavior

- Idempotent upsert into `user_profiles` of identity fields only.
- App-level fields are never read from this payload (KC does not own them).
- Freshness key: `payload.occurredAt > user_profiles.identitySyncedAt`. If false, the event is treated as stale and skipped (`422 STALE_EVENT`). On apply, `identitySyncedAt` is set to `payload.occurredAt`. `updatedAt` is irrelevant to this comparison.
- For `USER_DELETE`: same freshness rule; on apply the row's `enabled` is set to `false` and `deletedAt` is set to `occurredAt`.

#### Error Contract

| HTTP | Code | Meaning |
|---|---|---|
| 401 | `INVALID_SIGNATURE` | HMAC mismatch |
| 415 | `UNSUPPORTED_EVENT` | `eventType` is not in the v1 supported list |
| 422 | `STALE_EVENT` | `occurredAt` not strictly greater than current `identitySyncedAt` |

---

### 5.5 Admin Repair (manual re-sync)

**Endpoint:** `/admin/system/userProfile/repair`
**Method:** `POST`
**Auth:** `Authorization: Bearer <jwt>` + platform `administrator` role
**Purpose:** Operator-triggered full re-sync. Pulls all KC users, upserts identity fields into `user_profiles`, never touches app-level fields. Supports cursor pagination internally.

#### Request Body

```json
{ "dryRun": false }
```

#### Success Response

```json
{
  "code": "SUCCESS",
  "details": {
    "totalKcUsers": 412,
    "profilesUpserted": 410,
    "profilesCreated": 8,
    "profilesSkipped": 2,
    "errors": []
  }
}
```

---

## 6. Event Contract

Not applicable in v1 — this contract is REST + KC inbound webhook only. No Kafka topic is added or modified.

---

## 7. Canonical and Projection Mapping

Not applicable — identity fields in `user_profiles` are a read-through mirror of Keycloak, not a projection. App-level fields are canonical in `user_profiles` with no upstream system. No projection store exists.

---

## 8. Field Ownership

### Field Ownership Matrix

| Field | Authoritative Writer | Allowed Initiator | Stored In | Notes |
|---|---|---|---|---|
| `email` | Keycloak | klynx-api `usrsvc` (admin), end user via KC account console | Keycloak (canonical) + `user_profiles` (mirror) | mirror updated via KC webhook or on profile read |
| `username` | Keycloak | klynx-api `usrsvc` (admin only) | Keycloak (canonical) + `user_profiles` (mirror) | not editable by end user |
| `firstName`, `lastName` | Keycloak | end user via `PATCH /users/profile` (proxied) | Keycloak (canonical) + `user_profiles` (mirror) | KC write first, then mirror |
| `enabled` | Keycloak | klynx-api admin via `usrsvc.SetUserEnabled` | Keycloak (canonical) + `user_profiles` (mirror) | mirror is informational |
| Global realm role (`administrator`) | Keycloak | klynx-api admin | Keycloak realm role | not stored in `user_profiles`. **Exposed read-only** as `platformRole` on `GET` / `PATCH /users/profile` — value is a simplified binary projection (`administrator` or `user`) derived runtime from the request JWT, with `realm_access.roles[]` as primary source and the legacy flat `role` claim as fallback only. See §5.1 field definitions for the locked mapping rule. Org / app permissions remain owned by Permify. |
| Permission, org role, resource grant | Permify | klynx-api `authzsvc` | Permify | unchanged |
| `avatar` | klynx-api | end user via avatar upload (`POST /users/profile/avatar`) | `user_profiles` | absolute URL only — never in KC, never an S3 key |
| `department` | klynx-api | end user via `PATCH /users/profile` | `user_profiles` | never in KC |
| `refId` | klynx-api | not editable through `PATCH /users/profile` (immutable from this surface in v1) | `user_profiles.refId` (v1) | v1 has no connector-pairing semantics on this field — see §2 row "Connector pairing refId (v1)". The field is migrated from the legacy KC attribute and exposed read-only on `GET`. Org-scoped pairing (with its own write surface) is a separate plan. |
| `activeOrgId` (persisted UI preference) | klynx-api | end user via `PATCH /users/profile` (org switcher) | `user_profiles` | never in KC, **never in JWT**. **Distinct from the runtime `X-Active-Org` header** — see row below. |
| `X-Active-Org` (runtime request header) | request caller (FE) | every request that hits an org-scoped route | request only (not stored) | validated by `ActiveOrg()` middleware against Permify on every request. Authoritative for the request's permission scope. May or may not equal the persisted `user_profiles.activeOrgId` — for example a platform admin operating on a different org will set the header to that org without changing their preference. |
| `preferences.perPage` | klynx-api | end user via `PATCH /users/profile` | `user_profiles` | never in KC |
| `preferences.map.lat`, `preferences.map.lng`, `preferences.map.zoomLevel` | klynx-api | end user via `PATCH /users/profile` | `user_profiles` | never in KC |
| `extensions.<domain>.*` | klynx-api | end user / admin via `PATCH /users/profile` (per-domain validation in service) | `user_profiles.extensions.<domain>` | one subdoc per domain key; fields free-form within the subdoc |

### JWT Claim Deny-List (locked)

The following MUST NOT appear as JWT claims and MUST NOT be mapped from Keycloak attributes:

- `activeOrgId`
- `permission` / `permissions` (any form)
- `map_lat`, `map_lng`, `zoomLevel`
- `perPage`
- `avatar`
- `department`
- `refId`

### Conflict Resolution

- **Identity field conflict** (KC and `user_profiles` disagree): KC wins. `user_profiles` identity mirror is overwritten on next read, webhook, or repair.
- **App-level field conflict** (multiple writers): not possible — only `user_profiles` writes app-level fields.
- **Identity edit echo-loop prevention**: `PATCH /users/profile` writes to KC first, then to Mongo with the response from KC, advancing `identitySyncedAt` to the KC response timestamp. The KC webhook will fire for the same change; the webhook handler dedupes via `payload.occurredAt > user_profiles.identitySyncedAt` — equal or older events are skipped (`422 STALE_EVENT`). `updatedAt` is intentionally **not** used here because app-level writes also bump it.
- **`activeOrgId` (persisted) vs `X-Active-Org` (runtime)**: not a conflict — they are different concepts. The header always wins for the current request's permission scope. The persisted value is updated only when the user explicitly switches their default org via `PATCH /users/profile`.

---

## 9. Frontend Integration Notes

### Required FE Inputs

| FE Use Case | Contract Surface | Required Fields | Notes |
|---|---|---|---|
| Header / nav (user menu, avatar) | `GET /users/profile` | `username`, `firstName`, `lastName`, `avatar` | replace any reads of `${profile.attributes.avatar}` from JWT |
| Org switcher | `GET /users/profile` (read), `PATCH /users/profile` (write) | `activeOrgId` | stop reading from JWT claim; this field MUST NOT be in JWT. FE writes this when the user picks a default org; FE then sends that value as `X-Active-Org` on subsequent requests (see "Active-org header rule" below). |
| Map page initial state | `GET /users/profile` | `preferences.map.lat`, `preferences.map.lng`, `preferences.map.zoomLevel` | stop reading from `${profile.attributes.map_lat}` JWT mapper |
| Settings → preferences | `PATCH /users/profile` | `preferences.perPage`, `preferences.map.*`, `department` | partial update only |
| Profile edit | `PATCH /users/profile` | `firstName`, `lastName` | identity edit; backend handles KC write |
| Station extension UI (Phibek) | `GET /users/profile`, `PATCH /users/profile` | `extensions.station.stationCode`, `extensions.station.stationName`, `extensions.station.position` | rendered only when `extensions.station` is present |

### Example FE Payload Mapping

| FE Field | Backend Field | Direction | Notes |
|---|---|---|---|
| `user.avatarUrl` | `details.avatar` | response | absolute URL preferred |
| `user.activeOrg` | `details.activeOrgId` | response/request | never JWT |
| `user.mapDefault.lat` | `details.preferences.map.lat` | response/request | nested |
| `user.mapDefault.zoom` | `details.preferences.map.zoomLevel` | response/request | nested |
| `user.pageSize` | `details.preferences.perPage` | response/request | hint only |

### Active-org header rule (locked)

- `X-Active-Org` continues to be a **required** request header on every org-scoped route. `ActiveOrg()` middleware behavior is unchanged: missing header → `400`; header present but not validated by Permify → `403`. This contract does **not** change runtime org resolution.
- `user_profiles.activeOrgId` is a **persisted UI preference**, not a fallback for the header. The backend will not silently fill a missing `X-Active-Org` from the stored profile. FE must keep sending the header.
- FE flow on app load: `GET /users/profile` → read `activeOrgId` → use it to populate the org switcher selection and to set `X-Active-Org` on subsequent requests.
- FE flow on org switch: user picks a different org → FE sends `PATCH /users/profile { activeOrgId: <new> }` and updates its in-memory `X-Active-Org` value to the new org. The two writes serve different purposes (persistence vs. immediate request scope).
- A platform admin operating across orgs may legitimately have `X-Active-Org` ≠ `user_profiles.activeOrgId`. This is intentional — the persisted field is a default, not a constraint.

### FE Guardrails

- Do not read `${profile.attributes.X}` from JWT for any of the deny-listed fields in §8 — those mappers will be removed from the realm.
- Do not invent new top-level profile fields. New domain-specific fields go under `extensions.<domain>.*` and require a contract update before FE renders them.
- Treat documented error codes as the only supported error contract.

---

## 10. Rollout Notes

| Repo | Dependency | Required Before | Notes |
|---|---|---|---|
| `klynx-api` | new `userprofilerepo`, `userprofilesvc`, refactored `usrsvc` | Phase 1 of plan | publish contract first |
| `klynx-api` | KC realm export update (remove deny-listed mappers) | Phase 4 of plan | coordinated with FE deploy |
| `klynx-feature` | new client against `/users/profile` envelope | Phase 3 of plan | lockstep deploy with klynx-api Phase 4 |
| `gateway-api` | none | n/a | gateway-api does not consume klynx user profile |
| `klynx-connector` | none | n/a | refId pairing flow unchanged in v1 |

---

## 11. Examples

### Example Get

**Request:** `GET /users/profile` with `Authorization: Bearer <jwt>`.

**Response:** see §5.1.

### Example Patch (preferences only)

```json
{
  "preferences": {
    "perPage": 50,
    "map": { "lat": 13.7563, "lng": 100.5018, "zoomLevel": 14 }
  }
}
```

### Example Patch (org switch)

```json
{ "activeOrgId": "org-7f3e" }
```

### Example KC Webhook

```json
{
  "eventType": "USER_UPDATE",
  "userId": "kc-user-uuid",
  "username": "alice",
  "email": "alice@example.com",
  "firstName": "Alice",
  "lastName": "Liddell",
  "enabled": true,
  "occurredAt": "2026-04-27T08:31:00Z"
}
```

---

## 12. Checklist

- [x] Owner backend is explicit (klynx-api).
- [x] System of record is defined by domain.
- [x] Canonical store is documented (`user_profiles`); no projection store applicable.
- [x] Producers and consumers are listed.
- [x] Request, response, and error contracts are defined for all REST surfaces.
- [x] Field ownership is explicit for synchronized fields (KC ↔ `user_profiles`).
- [x] JWT claim deny-list is published.
- [x] Backward compatibility is documented (breaking on envelope shape).
- [x] Replay / re-sync behavior is documented (webhook + admin repair).
- [x] FE field mapping is included.
- [x] Decision Point P-1 resolved (v1 = `user_profiles.refId` carry-over only; org-scoped pairing deferred to a separate plan).
- [x] Decision Point P-4 resolved (`avatar` is always an absolute URL).
- [x] Identity sync freshness key is dedicated (`identitySyncedAt`), not `updatedAt`.
- [x] `X-Active-Org` runtime semantics are explicitly preserved; `user_profiles.activeOrgId` is documented as a UI preference only.
- [x] Webhook scope covers `USER_UPDATE` (incl. disable via `enabled=false`) and `USER_DELETE`.
