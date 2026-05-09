# User Org Role Edit Contract

**Date:** 2026-04-29 (r2 — addresses BE review)
**Status:** Superseded by [`user-profile-and-roles.md`](./user-profile-and-roles.md) on 2026-05-04 — 4-endpoint editing surface + role disambiguation + Phase 2 deliverables (PR #55, 4.2.0) merged with target-state Mongo migration, current-state Keycloak implementation, role-naming canonical, and FE display surface into one User Profile + Roles lifecycle contract per the new domain/flow grouping rule (`docs/contracts/README.md`). All Approved Phase 2 behavior preserved verbatim in §5.4-5.7 / §9 of the merged contract: `details.organizations[].orgRole` per-membership with `IsUserOwner > IsUserAdmin > member` derivation; `details.user.platformRole` mirror of `details.user.role`; 4-endpoint clear separation (`PATCH /users/{id}` JSON-only profile + platform role / `PATCH /users/{id}/profile` multipart avatar + identity / `PATCH /orgs/users/{userId}` org-role only / `GET /users/{id}` read with org memberships); silent-demotion bug context (FE was sending platform role values into org-role slot); critical FE rules (NEVER send `administrator`/`user` to org endpoint; NEVER send profile fields to org endpoint); mixed-payload side-effect callout (sending `firstName` + `role` to `/orgs/users/{userId}` silently overwrites Keycloak platform-role attribute); `httputil.MessageOK` envelope cleanup recommendation; full Phase 1-4 rollout order with deprecation gates. Body kept here for PR / Codex review history.
**Aligns with:** [docs/plan/profileResponse-role.md](../plan/profileResponse-role.md) — `platformRole` naming convention on profile responses
**Owner Backend:** `klynx-api`
**Related Plan:** [klynx-frontend/docs/plan/fix-user-edit-org-role-reset.md](../../klynx-frontend/docs/plan/fix-user-edit-org-role-reset.md)
**Applies To Repos:** `klynx-api`, `klynx-frontend`
**Contract Type:** `REST`
**Version:** `v1`

---

## 1. Purpose

Define the canonical contract that the user-edit screen
(`/systemUsers/users/[id]`) must use when:

1. Updating a target user's **profile fields** (firstName, lastName, email,
   locale, enabled, avatar) and **platform role** (`administrator` | `user`).
2. **Adding** a target user into an organization with an explicit org role
   (`admin` | `member`) — used by admins importing/inviting external
   identities (e.g. LDAP-federated users).
3. **Editing the org role** of an existing membership for users that already
   belong to one or more organizations — needed so admins can promote/demote
   per-org without leaving the user-edit screen.

The frontend has been observed sending the platform role value `"user"` to the
org-membership endpoint, which the backend then normalized to org role
`"member"` — silently demoting org admins. This contract removes that
ambiguity by **separating platform-role updates from org-role updates** at the
endpoint and field level, and by giving the frontend a documented way to read
the current org role of every membership for a given user.

---

## 2. Ownership

### Owner Backend

- `klynx-api`

### Domain System of Record

| Domain | System of Record | Canonical Store | Notes |
|---|---|---|---|
| Platform user identity (firstName, lastName, email, locale, enabled, avatar key, platform role attribute) | `klynx-api` → Keycloak | Keycloak | `role` attribute on the user holds platform role (`administrator` \| `user`) |
| Organization membership and org role (`admin` \| `member` \| `owner`) | `klynx-api` → Permify (ReBAC) | Permify tuples on `organization` entity | `admin` and `member` are derivable from tuples; `owner` is managed via promote/demote flow only |
| Avatar binary | `klynx-api` → S3 | S3 object keyed by user id | Key written back into Keycloak user attribute `avatar` |

### Producer / Consumers

| Surface | Producer | Consumers | Notes |
|---|---|---|---|
| `GET /users/{id}` | `klynx-api` (`UserDetailController.GetByID`) | `klynx-frontend` (user edit page) | Returns user + organizations the user belongs to |
| `PATCH /users/{id}` | `klynx-api` (`usrapi.UpdateUser`) | `klynx-frontend` (user edit page profile save) | Admin-only Keycloak attribute updater |
| `PATCH /users/{id}/profile` | `klynx-api` (`usrapi.AdminUpdateProfile`) | `klynx-frontend` (user edit page avatar save) | Admin-only multipart for avatar + identity |
| `PATCH /orgs/users/{userId}` | `klynx-api` (`authzapi.OrganizationController.UpdateMember`) | `klynx-frontend` (org-add flow + per-org role edit) | Adds user to org or updates existing membership role |

### Projection Stores

None. All canonical data is read directly from Keycloak (identity) and Permify
(memberships). No projection cache is involved in this surface.

---

## 3. Compatibility and Policy

### Backward Compatibility

- Compatibility status: **additive**
- The only required additive change is **a new field `orgRole` on each
  element of `organizations[]` returned by `GET /users/{id}`**. Existing
  consumers that ignore unknown fields are unaffected.
- The remaining clarifications in this contract are **documentation-only** —
  they describe the existing endpoint behavior so the frontend stops conflating
  platform role with org role.

### Replay / Re-sync Behavior

- Not applicable — these are synchronous REST endpoints.

### Write Authority Policy

- **Keycloak** is the source of truth for platform identity, including the
  `role` attribute interpreted as platform role (`administrator` | `user`).
- **Permify** is the source of truth for org membership and org role
  (`admin` | `member` | `owner`).
- Frontend MUST NOT attempt to derive a user's org role from any platform
  attribute, and MUST NOT send platform role values into the org-role field of
  `PATCH /orgs/users/{userId}`.

---

## 4. Surface Summary

| Type | Name | Method / Topic | Auth | Producer / Handler | Consumer / Caller |
|---|---|---|---|---|---|
| REST | `/users/{id}` | `GET` | Bearer (platform admin OR org admin of `X-Active-Org` containing target user) | `usrapi.UserDetailController.GetByID` | FE: edit user page on mount |
| REST | `/users/{id}` | `PATCH` | Bearer + platform-admin (`administrator`) | `usrapi.UpdateUser` | FE: edit user profile save (no avatar) |
| REST | `/users/{id}/profile` | `PATCH` | Bearer + platform-admin (`administrator`) | `usrapi.AdminUpdateProfile` | FE: edit user avatar save (multipart) |
| REST | `/orgs/users/{userId}` | `PATCH` | Bearer + caller has `manage` on `X-Active-Org` (or platform-admin) | `authzapi.OrganizationController.UpdateMember` | FE: add to org / change org role |

---

## 5. REST Contract

### 5.1 `GET /users/{id}` — read user with org memberships

**Endpoint:** `/users/{id}`
**Method:** `GET`
**Auth:** Bearer. Caller must be either platform `administrator`, **or** be an
admin of the `X-Active-Org` AND that org must contain the target user
(see `controllers/usrapi/getById.go` lines 108–129).
**Purpose:** Return the target user identity plus the list of organizations the
target belongs to, including the **current org role** of each membership.

#### Path Params

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | string | yes | Target user id (Keycloak user id / UUID) |

#### Request Headers

| Header | Required | Description |
|---|---|---|
| `Authorization` | yes | `Bearer <jwt>` |
| `X-Active-Org` | conditional | Required when caller is **not** platform admin — used to scope the org-admin permission check |

#### Success Response — Required Shape (after this contract is implemented)

**HTTP:** `200`

```json
{
  "code": "SUCCESS",
  "status": true,
  "message": "ok",
  "details": {
    "user": {
      "id": "6078c979-6038-48e6-ad89-a5aea202df70",
      "username": "aliz",
      "firstName": "aliz",
      "lastName": "pd1",
      "email": "aliz@hotmail.com",
      "role": "user",
      "platformRole": "user",
      "locale": "en",
      "enabled": true,
      "avatar": "users/6078c979.../avatar.png"
    },
    "organizations": [
      {
        "orgId": "f1...",
        "tenantId": "t1...",
        "name": "Org Alpha",
        "description": "...",
        "isActive": true,
        "createdAt": "2026-01-01T00:00:00Z",
        "updatedAt": "2026-04-01T00:00:00Z",
        "workspaceId": "...",
        "eventIngestUri": "...",
        "provisionStatus": "ready",
        "orgRole": "admin"
      }
    ]
  }
}
```

> **Note on `message`.** `httputil.Ok` defaults to literal `"ok"` (lowercase),
> see `utils/httputil/success.go` line 12. The `code` field carries
> `"SUCCESS"`. FE must not branch on `message` text.

#### Required Additive Fields

| Field | Type | Required | Owner | Description |
|---|---|---|---|---|
| `details.organizations[].orgRole` | string enum: `admin` \| `member` \| `owner` | **yes (after Phase 2 rollout)** | klynx-api | Effective org role of the target user in this organization |
| `details.user.platformRole` | string enum: `administrator` \| `user` | **yes (after Phase 2 rollout)** | klynx-api | Mirror of `details.user.role` under the canonical platform-role name. Required to align with [docs/plan/profileResponse-role.md](../plan/profileResponse-role.md) which renames the platform-role surface across `/users/profile`. Both `role` and `platformRole` are populated during the deprecation cycle; FE consumes `platformRole` going forward, and `role` will be removed in a later phase per the supersede plan |

**Derivation rules (BE):**

`organizations[].orgRole`:

```
if IsUserOwner(tenantId, orgId, targetUserId) → "owner"
else if IsUserAdmin(tenantId, orgId, targetUserId) → "admin"
else → "member"
```

`IsUserOwner` and `IsUserAdmin` already exist on `OrganizationService`
(`internal/services/authzsvc/orgValidation.go` lines 33, 52) and are used by
`UpdateMember` (see `internal/services/authzsvc/orgUpdateMember.go` lines
110, 123). The `OrganizationService.List` projection in
`internal/services/authzsvc/org.go` (line 287) must be extended to populate
this field per-org. The current `OrgSummary` struct (line 218) must gain an
`OrgRole string` field with json tag `orgRole`.

`details.user.platformRole`:

```
mirror details.user.role exactly (the Keycloak `role` attribute already
extracted by usrsvc.GetUsersByIds and surfaced today as details.user.role).
```

Implementation note: `controllers/usrapi/getById.go` line 132 currently
returns `fiber.Map{"user": user, "organizations": orgs}`. To populate the
mirror field, either set `user.PlatformRole = user.Role` before the return,
or wrap the user payload in a small projection struct. No source-of-truth
change — purely a name-alignment surface.

#### Why This Field Is Required

Without `orgRole`, the frontend cannot:

- Show the current role next to each org chip in the edit screen.
- Drive a per-org role dropdown for promote/demote without making N additional
  RPC calls per org.
- Detect which orgs need role changes vs profile-only saves.

The frontend will refuse to render a per-org role editor until BE returns this
field. There is no acceptable client-side fallback — querying Permify directly
from the browser is not a permitted path.

#### Error Contract (unchanged)

| HTTP | Code | Meaning | Consumer Handling |
|---|---|---|---|
| 401 | `UNAUTHORIZED` | Missing or invalid bearer | Re-auth |
| 403 | `FORBIDDEN` | Caller lacks org-admin scope on `X-Active-Org` | Show "no access" |
| 404 | `USER_NOT_FOUND` | No user with that id, or user not in `X-Active-Org` for non-platform-admin caller | Show 404 page |
| 500 | `GET_USER_FAILED` | Keycloak failure | Toast + retry |

---

### 5.2 `PATCH /users/{id}` — update profile + platform role (no avatar)

**Endpoint:** `/users/{id}`
**Method:** `PATCH`
**Auth:** Bearer + platform-admin (`administrator`). Enforced by
`middleware.RequireRoles([]string{"administrator"})` in `router/user.go`
line 51.
**Purpose:** Update one or more Keycloak user attributes for the target user,
including platform role. **Does NOT touch org membership or org role.**

#### Path Params

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | string | yes | Target user id |

#### Request Headers

| Header | Required | Description |
|---|---|---|
| `Authorization` | yes | `Bearer <jwt>` |
| `X-Active-Org` | not used by handler | FE may auto-inject. The handler in `controllers/usrapi/update.go` does not branch on this header. The shared `ActiveOrg` middleware may still validate the value (e.g. confirm caller is a member of the named org) before the request reaches the handler — FE should not rely on the header being silently dropped |
| `Content-Type` | yes | `application/json` only — multipart bodies are rejected |

#### Request Body

```json
{
  "firstName": "aliz",
  "lastName": "pd1",
  "email": "aliz@hotmail.com",
  "role": "administrator",
  "locale": "en",
  "enabled": true
}
```

#### Request Field Definitions

| Field | Type | Required | Owner | Description |
|---|---|---|---|---|
| `firstName` | string | no | FE | Keycloak `firstName` |
| `lastName` | string | no | FE | Keycloak `lastName` |
| `email` | string | no | FE | Keycloak `email` |
| `role` | string enum: `administrator` \| `user` | no | FE | **Platform role** — written to Keycloak `role` attribute. NOT an org role. Sending `admin` or `member` here is a contract violation |
| `locale` | string | no | FE | Keycloak `locale` |
| `enabled` | boolean | no | FE | Keycloak `enabled` flag (separate `enable`/`disable` endpoints exist; FE may send here too) |

**Field constraints:**

- FE MUST NOT send `username`, `password`, `confirmPassword`, or `avatar` on
  this endpoint. `username` is read-only post-creation; password has its own
  endpoint (`PATCH /users/{id}/password`); avatar uploads go to
  `PATCH /users/{id}/profile`.
- BE silently ignores unknown attributes today (free-form `map[string]any`).
  This contract documents the supported set above; future BE changes MAY add
  a strict allowlist.

#### Success Response

**HTTP:** `200`

```json
{
  "code": "SUCCESS",
  "status": true,
  "message": "user updated"
}
```

> **BE follow-up (recommended, not blocking).** The handler in
> `controllers/usrapi/update.go` lines 53–55 builds the envelope by hand via
> `c.JSON(gmod.SuccessResponse{...})`. Switching to
> `httputil.MessageOK(c, "user updated")` would make the envelope shape
> consistent with the rest of the API surface (and with `MessageOK`'s
> `gmod.SuccessMessageResponse` type). This is a 1-line BE change with no FE
> impact.

#### Error Contract

| HTTP | Code | Meaning | Consumer Handling |
|---|---|---|---|
| 400 | `MISSING_ID` | `id` path param empty | FE bug — validate before sending |
| 400 | `INVALID_BODY` | JSON parse error | FE bug |
| 401 | `UNAUTHORIZED` | Missing bearer | Re-auth |
| 403 | (RequireRoles middleware) | Caller is not platform `administrator` | Show "platform admin required" |
| 500 | `UPDATE_USER_FAILED` | Keycloak write failed | Toast + retry |

---

### 5.3 `PATCH /users/{id}/profile` — update profile + avatar (admin)

**Endpoint:** `/users/{id}/profile`
**Method:** `PATCH`
**Auth:** Bearer + platform-admin (`administrator`). Enforced **explicitly
inside the controller** (`controllers/usrapi/profile.go` lines 244–249),
NOT via `RequireRoles` middleware — the controller produces two distinct
403 strings, see `docs/contracts/profileAvatarUpdate.md` §7.
**Purpose:** Multipart endpoint that admins use to upload an avatar (and
optionally update identity fields) for another user.

#### Path Params

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | string | yes | Target user id |

#### Request Headers

| Header | Required | Description |
|---|---|---|
| `Authorization` | yes | `Bearer <jwt>` |
| `Content-Type` | yes | `multipart/form-data` |

#### Form Fields

| Field | Type | Required | Description |
|---|---|---|---|
| `firstName` | text | no | First name |
| `lastName` | text | no | Last name |
| `avatar` | file | no | Image file: jpg / jpeg / png / webp; max 2 MB |

**Field constraints:**

- See `docs/contracts/profileAvatarUpdate.md` §7.2 / §7.3 for the canonical
  list. This contract does **not** redefine that surface — it is referenced
  here so the FE knows which endpoint owns avatar uploads.
- Platform role and `enabled` flag are **not** updatable via this endpoint —
  use `PATCH /users/{id}` for those.

#### Error Contract (relevant subset)

| HTTP | Code | Meaning | FE Handling |
|---|---|---|---|
| 403 | (string body) `"admin profile update requires platform administrator role"` | Caller is not platform admin | Show error |
| 403 | (string body) `"use PATCH /users/profile for self profile update"` | Caller is non-admin trying to edit self via admin endpoint | FE should never trigger this — admin edit page is admin-only |
| 400 | (varies) | Avatar format / size / missing extension | Surface message |

---

### 5.4 `PATCH /orgs/users/{userId}` — add user to org or change org role

**Endpoint:** `/orgs/users/{userId}`
**Method:** `PATCH`
**Auth:** Bearer + caller has `manage` permission on `X-Active-Org` (or is
platform admin via the platform-admin bypass path).
**Purpose:** Two distinct intents collapsed into one endpoint by current BE
implementation:

1. **Invite + assign role** — if target is not yet a member of `X-Active-Org`,
   auto-invite them with `body.role`.
2. **Update existing member's org role** — if target is already a member,
   change their org role between `admin` and `member`.

The frontend MUST use this endpoint **only** for org-membership intents.
**Profile updates and platform-role updates MUST go to `PATCH /users/{id}`
or `PATCH /users/{id}/profile`.**

#### Path Params

| Field | Type | Required | Description |
|---|---|---|---|
| `userId` | string | yes | Target user id |

#### Request Headers

| Header | Required | Description |
|---|---|---|
| `Authorization` | yes | `Bearer <jwt>` |
| `X-Active-Org` | yes | Org id whose membership is being added/updated |
| `Content-Type` | yes | `application/json` (preferred) — multipart accepted but FE must not use it for org-only intents |

#### Request Body — Org-Role-Only (Required FE Pattern)

```json
{
  "role": "admin"
}
```

#### Request Field Definitions

| Field | Type | Required | Owner | Description |
|---|---|---|---|---|
| `role` | string enum: `admin` \| `member` | **yes** | FE | **Org role only.** BE normalizes: `"admin"` → admin, anything else → `"member"` (`controllers/authzapi/orgUpdateMember.go` lines 87–94) |

**Critical FE rules:**

1. **NEVER send `"administrator"` or `"user"` here** — those are platform-role
   values. The BE normalizer treats them as "not admin" → demotes target to
   `member`. This is the root cause of the bug this contract addresses.
2. **NEVER send profile fields (`firstName`, `lastName`, `email`, `locale`,
   `enabled`, `avatar`) on this endpoint from the user-edit screen.** While
   the BE currently accepts and forwards them to Keycloak (lines 96–112,
   148–155 of the same file), doing so reintroduces the field-collision bug
   because BE also writes a platform-role attribute derived from the same
   `role` field.
3. The FE MAY reuse this endpoint for the existing
   `Organizations` admin screen (where the intent is unambiguously an org
   role change) — but the body must remain `{ "role": "admin" | "member" }`
   with no profile fields.

> **⚠️ Mixed-payload side effect (read this if you ever need to deviate
> from rules 2 and 3 above).** Whenever this endpoint receives **any** profile
> attribute alongside `role` (`firstName`, `lastName`, `email`, `locale`, or
> `enabled` — i.e. `len(profileAttrs) > 0` at
> `controllers/authzapi/orgUpdateMember.go` lines 96–112), BE additionally
> writes the **Keycloak `role` attribute** (platform role) using the same
> `role` body field via lines 148–155:
>
> ```go
> if len(profileAttrs) > 0 {
>     platformRole := strings.ToLower(strings.TrimSpace(body.Role))
>     if platformRole == "administrator" {
>         profileAttrs["role"] = "administrator"
>     } else {
>         profileAttrs["role"] = "user"
>     }
> }
> ```
>
> This means a payload like
> `{ "firstName": "X", "role": "admin" }` will:
>
> 1. Set the org-role tuple to `admin` in Permify (the explicit intent).
> 2. **Silently overwrite the user's Keycloak platform-role attribute to
>    `"user"`** (because `"admin" != "administrator"` at line 150).
>
> The reverse — `{ "lastName": "X", "role": "user" }` — silently demotes the
> user's org role to `member` AND writes platform role `"user"`. Both writes
> happen on every call. There is no FE-side workaround except to keep this
> endpoint's body to `{ "role": "admin" | "member" }` only, which is rule 2
> above. The deprecation note in §10 tracks a future BE cleanup of this
> coupling.

#### Deprecated FE Usage

The following request shapes are observed in the current frontend and are
hereby deprecated. They MUST be removed in the FE Track A fix:

```jsonc
// ❌ Sends platform role into org-role slot — silently demotes org admin
{
  "username": "aliz",
  "firstName": "aliz",
  "lastName": "pd1",
  "email": "aliz@hotmail.com",
  "role": "user",
  "locale": "en",
  "enabled": true
}
```

```text
❌ Multipart with role=administrator + avatar — same field-collision plus
   side-effect on org role. Replace with PATCH /users/{id}/profile for avatar
   and PATCH /users/{id} for platform role.
```

#### Success Response

**HTTP:** `200`

```json
{
  "code": "SUCCESS",
  "status": true,
  "message": "member updated",
  "details": {
    "userId": "6078c979-...",
    "role": "admin"
  }
}
```

`details.role` is the **normalized org role** that was applied — FE can use
it to confirm the resulting state.

#### Error Contract

| HTTP | Code | Meaning | Consumer Handling |
|---|---|---|---|
| 400 | `BAD_REQUEST` | `userId` empty, body missing `role`, or invalid body | FE bug |
| 401 | `UNAUTHORIZED` | Missing bearer | Re-auth |
| 403 | `FORBIDDEN` | Caller lacks `manage` on org | Show "no access" |
| 409 | `CANNOT_REMOVE_LAST_EFFECTIVE_MANAGER` | Demoting the last effective manager | FE: warn user, refuse demotion |
| 500 | (varies) | Permify / Keycloak failure | Toast + retry |

---

## 6. Event Contract

Not applicable — this is a synchronous REST surface only. No Kafka events are
emitted by these endpoints in scope of this contract. (If org membership
events are emitted by `klynx-api` elsewhere, they are out of scope.)

---

## 7. Canonical and Projection Mapping

### Canonical Stores

- **Identity (Keycloak):** `firstName`, `lastName`, `email`, `username`,
  `enabled`, `locale`, `avatar` attribute (S3 key), `role` attribute (platform
  role)
- **Org membership (Permify):** tuples on `organization` entity with relations
  `member`, `admin`, `owner`

### Projections

- `GET /users/{id}` returns a **read-time projection** that combines Keycloak
  identity with a Permify-derived list of orgs and their roles. There is no
  persisted projection store.

### Field Mapping

| Canonical Field | Projection Field (in `GET /users/{id}` response) | FE Field | Notes |
|---|---|---|---|
| Keycloak `role` attribute | `details.user.role` | `state.platformRole` | Values: `administrator` \| `user` |
| Permify `organization:{id}#admin@user:{userId}` (presence) | `details.organizations[i].orgRole = "admin"` | `userOrgs[i].orgRole` | Derived |
| Permify `organization:{id}#member@user:{userId}` (presence, no admin) | `details.organizations[i].orgRole = "member"` | `userOrgs[i].orgRole` | Default |
| Permify `organization:{id}#owner@user:{userId}` (presence) | `details.organizations[i].orgRole = "owner"` | `userOrgs[i].orgRole` (read-only) | FE must not offer to change to/from `owner` via this contract |

---

## 8. Field Ownership

| Field | Authoritative Writer | Allowed Initiator | Stored In | Notes |
|---|---|---|---|---|
| `firstName`, `lastName`, `email`, `locale`, `enabled` | Keycloak (via `klynx-api`) | Platform admin via `PATCH /users/{id}` or `PATCH /users/{id}/profile` | Keycloak | |
| `avatar` (S3 key) | Keycloak (via `klynx-api`) after S3 upload | Platform admin via `PATCH /users/{id}/profile` (multipart) | Keycloak attribute + S3 binary | |
| Platform `role` attribute (`administrator` \| `user`) | Keycloak (via `klynx-api`) | Platform admin via `PATCH /users/{id}` body field `role` | Keycloak | |
| Org role tuple (`admin` \| `member`) | Permify (via `klynx-api`) | Caller with `manage` on org via `PATCH /orgs/users/{userId}` body field `role` | Permify | Owner role managed via `PromoteUserToOwner` / `DemoteUserFromOwner` (out of scope) |

### Conflict Resolution

- The two role fields (`platformRole` vs `orgRole`) live in different stores
  (Keycloak vs Permify) and are written through different endpoints. There is
  no overlap and no conflict resolution needed once the FE follows this
  contract.
- If a request arrives at `PATCH /orgs/users/{userId}` with a body that sets
  both org role AND profile attrs (legacy FE behavior), BE applies both
  changes today. **This contract deprecates that mixed usage from the FE side
  only** — the BE behavior is left as-is to preserve compatibility with
  existing org-admin invitation flows.

---

## 9. Frontend Integration Notes

### Required FE Inputs

| FE Use Case | Contract Surface | Required Fields | Notes |
|---|---|---|---|
| Load edit screen | `GET /users/{id}` | `details.user.*`, `details.organizations[].orgRole` | `orgRole` is the new field this contract requires |
| Save profile (no avatar change) | `PATCH /users/{id}` | `firstName`, `lastName`, `email`, `role` (platform), `locale`, `enabled` | Strip `username`, `avatar`, password fields |
| Save profile + new avatar | `PATCH /users/{id}/profile` (multipart) **then** `PATCH /users/{id}` (JSON for non-profile fields) | per endpoint | Two calls when avatar changes |
| Add user to org with role | `PATCH /orgs/users/{userId}` + `X-Active-Org: <orgId>` | `role: "admin" \| "member"` | Body must contain ONLY `role` |
| Change existing member's org role | `PATCH /orgs/users/{userId}` + `X-Active-Org: <orgId>` | `role: "admin" \| "member"` | Same endpoint as add — BE auto-detects membership |
| Remove user from org | `PATCH /orgs/users/remove` + `X-Active-Org: <orgId>` | `users: [{ userId }]` | Out of scope — unchanged |

### Example FE Payload Mapping

| FE State | Backend Field | Direction | Notes |
|---|---|---|---|
| `state.platformRole: "administrator" \| "user"` | `PATCH /users/{id}` body `role` | request | Platform-only |
| `userOrgs[i].orgRole: "admin" \| "member" \| "owner"` | `GET /users/{id}` `details.organizations[i].orgRole` | response | New field |
| Per-org pending role change | `PATCH /orgs/users/{userId}` body `role` + `X-Active-Org: orgId` | request | One call per org being changed |
| Newly added org with chosen role | `PATCH /orgs/users/{userId}` body `role` + `X-Active-Org: orgId` | request | Same as above — BE auto-invites if not yet a member |

### FE Guardrails

- **MUST NOT** send platform role values (`administrator` / `user`) in the
  `role` field of `PATCH /orgs/users/{userId}`.
- **MUST NOT** send profile fields (`firstName`, `lastName`, `email`,
  `locale`, `enabled`, `avatar`) in the body of
  `PATCH /orgs/users/{userId}` from the user-edit screen.
- **MUST NOT** rely on the absence of `orgRole` to mean `"member"` — once BE
  ships the additive field, treat missing as `null`/unknown and log a warning.
- **MUST** keep `X-Active-Org` auto-injection enabled on the `useApi`
  composable; BE ignores it on `PATCH /users/{id}` and `PATCH /users/{id}/profile`.
- **MUST** name FE state fields explicitly as `platformRole` and `orgRole` — never the bare name `role`. This rule
  is also documented in `klynx-frontend/CLAUDE.md` under
  "Role Naming Convention".

---

## 10. Rollout Notes

| Repo | Dependency | Required Before | Notes |
|---|---|---|---|
| `klynx-api` | Add `OrgRole` field to `OrgSummary` (`internal/services/authzsvc/org.go` line 218) and populate it in `OrganizationService.List` (line 287) using existing `IsUserOwner` / `IsUserAdmin` helpers | Track B FE — per-org role editor in user-edit screen | Additive — no existing consumer breaks |
| `klynx-api` | Add `platformRole` mirror field to `details.user` in `GET /users/{id}` response (`controllers/usrapi/getById.go` line 132) — populate from `user.role` | Phase 2 (alongside `orgRole`) | Aligns with [docs/plan/profileResponse-role.md](../plan/profileResponse-role.md) — same naming convention applied to `/users/profile` and `/users/{id}` |
| `klynx-api` | (Recommended, 1-line) Switch `controllers/usrapi/update.go` lines 53–55 to `httputil.MessageOK(c, "user updated")` for envelope consistency | Phase 2 | No FE impact — message text and code unchanged |
| `klynx-api` | (Optional) Document the existing field-collision behavior on `PATCH /orgs/users/{userId}` in OpenAPI / swagger so future consumers don't repeat the FE bug | Track A FE merges | Doc-only — call-out box in §5.4 of this contract is the canonical reference |
| `klynx-frontend` | Track A FE fix: stop sending profile fields & platform role to `/orgs/users/{id}` | This contract draft signed off | See `docs/plan/fix-user-edit-org-role-reset.md` |
| `klynx-frontend` | Track B FE: render per-org role editor on user-edit page | After `klynx-api` ships `orgRole` field | Track B is gated on the additive BE change above |
| `klynx-frontend` | Track B FE: switch `details.user.role` reads to `details.user.platformRole` in user-edit screen | After `klynx-api` ships `platformRole` mirror field | Both fields populated during the deprecation cycle; FE can switch independently of BE removing `role` |

### Rollout Order

1. **Phase 1 (FE-only, no BE block):** klynx-frontend Track A — switch profile
   updates to `PATCH /users/{id}` + `PATCH /users/{id}/profile`; add UI for
   org role choice when adding a NEW org (existing endpoint already supports
   it). The bug is fixed at the end of phase 1.
2. **Phase 2 (BE additive, single PR):** klynx-api adds (a) `orgRole` to
   `GET /users/{id}` organizations[], and (b) `platformRole` mirror to
   `details.user`. Optional 1-line `httputil.MessageOK` switch on `PATCH
   /users/{id}` in the same PR. All additive — no consumer breaks. BE owner
   has signaled this fits a < 1-hour task per `klynx-api/CLAUDE.md`.
3. **Phase 3 (FE Track B):** klynx-frontend renders per-org role editor in
   the edit screen; uses the `orgRole` field to seed initial state and
   `PATCH /orgs/users/{userId}` to commit changes per-org. Switches reads
   from `details.user.role` to `details.user.platformRole`.
4. **Phase 4 (BE deprecation, deferred):** once both FE consumers
   (`/users/profile` and the user-edit screen) read `platformRole`, retire
   `details.user.role` from the GET response per the supersede plan in
   [docs/plan/profileResponse-role.md](../plan/profileResponse-role.md).

---

## 11. Examples

### 11.1 Edit screen mount — read user with org roles

**Request**

```http
GET /users/6078c979-6038-48e6-ad89-a5aea202df70
Authorization: Bearer <jwt>
X-Active-Org: f1...
```

**Response**

```json
{
  "code": "SUCCESS",
  "status": true,
  "message": "ok",
  "details": {
    "user": {
      "id": "6078c979-6038-48e6-ad89-a5aea202df70",
      "username": "aliz",
      "firstName": "aliz",
      "lastName": "pd",
      "email": "aliz@hotmail.com",
      "role": "user",
      "platformRole": "user",
      "locale": "en",
      "enabled": true,
      "avatar": "users/6078c979.../avatar.png"
    },
    "organizations": [
      { "orgId": "f1...", "name": "Org Alpha", "isActive": true,  "orgRole": "admin"  },
      { "orgId": "f2...", "name": "Org Beta",  "isActive": false, "orgRole": "member" }
    ]
  }
}
```

### 11.2 Save lastName-only edit (the bug scenario, fixed)

**Old (broken) request — must NOT be sent any more:**

```http
PATCH /orgs/users/6078c979-... 
X-Active-Org: f1...
Content-Type: application/json

{ "username":"aliz","firstName":"aliz","lastName":"pd1","email":"aliz@hotmail.com","role":"user","locale":"en","enabled":true }
```

**New request:**

```http
PATCH /users/6078c979-...
Authorization: Bearer <jwt>
Content-Type: application/json

{ "firstName": "aliz", "lastName": "pd1", "email": "aliz@hotmail.com", "role": "user", "locale": "en", "enabled": true }
```

Org role for "Org Alpha" remains `admin` because the org-membership endpoint
is not called.

### 11.3 Add user into "Org Gamma" as admin (new org with role)

```http
PATCH /orgs/users/6078c979-...
Authorization: Bearer <jwt>
X-Active-Org: f3...        <-- the org being added to
Content-Type: application/json

{ "role": "admin" }
```

**Response**

```json
{
  "code": "SUCCESS",
  "status": true,
  "message": "member updated",
  "details": { "userId": "6078c979-...", "role": "admin" }
}
```

### 11.4 Change existing member's role from admin → member in "Org Alpha"

Same shape as 11.3 — `X-Active-Org` selects the org, body carries the new
role. BE detects existing membership and updates the tuple.

### 11.5 Save with avatar change

Two calls, in this order, **only when fields outside `firstName` / `lastName`
have changed alongside the avatar**:

```http
PATCH /users/6078c979-.../profile
Authorization: Bearer <jwt>
Content-Type: multipart/form-data; boundary=...

(firstName, lastName, avatar=<file>)
```

```http
PATCH /users/6078c979-...
Authorization: Bearer <jwt>
Content-Type: application/json

{ "email": "...", "role": "user", "locale": "en", "enabled": true }
```

> **FE optimization — skip the second call when only the avatar (and
> optionally `firstName` / `lastName`) changed.** The `/users/{id}/profile`
> endpoint already accepts `firstName` and `lastName` in its multipart body,
> so a pure avatar (or avatar + name) edit needs **one** call, not two. FE
> should compare the form's submit payload against the originally loaded
> values and skip the JSON call if no field outside the `/profile`
> endpoint's accepted set has changed. This halves traffic on the most
> common admin save path and removes the race window between the two
> writes.

---

## 12. Checklist

- [x] Owner backend is explicit (`klynx-api`).
- [x] System of record is defined by domain (Keycloak vs Permify split).
- [x] Canonical store and projection store are documented.
- [x] Producers and consumers are listed.
- [x] Request, response, and error contracts are defined.
- [x] Field ownership is explicit for synchronized fields (no overlap by
      design — different stores).
- [x] Backward compatibility is documented (additive only).
- [n/a] Replay or re-sync behavior — not applicable (sync REST).
- [x] FE field mapping is included.
- [x] BE owner sign-off on adding `orgRole` to `OrgSummary` — accepted as
      additive, < 1-hour task (BE review r2).
- [x] BE owner sign-off on the deprecation note in §5.4 (mixed
      profile + org-role usage from FE) — accepted; callout box added to §5.4
      to make the side-effect visible in-line.
- [ ] **Open: BE owner sign-off on adding `platformRole` mirror field to
      `details.user` in `GET /users/{id}` (Phase 2).** Aligns with
      `docs/plan/profileResponse-role.md` field-naming policy. Pending owner
      ack — same Phase 2 PR as `orgRole`.
- [ ] **Open: FE owner sign-off on Track B switching reads from
      `details.user.role` to `details.user.platformRole`** once BE ships the
      mirror.
