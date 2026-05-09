# User Profile and Roles Contract

**Date:** 2026-05-04
**Status:** Active (consolidated — supersedes `userProfile.md` + `profileAvatarUpdate.md` + `userTableSurface.md` + `user-org-role-edit.md` + `role-naming-convention.md`)
**Owner Backend:** `klynx-api`
**Related Plan:** [docs/plan/userProfile-store.md](../plan/userProfile-store.md), [docs/plan/profileAvatarUpdate.md](../plan/profileAvatarUpdate.md), [docs/plan/done/profileResponse-role.md](../plan/done/profileResponse-role.md), [docs/plan/done/user-org-role-edit-be-phase2.md](../plan/done/user-org-role-edit-be-phase2.md), [docs/plan/role-naming-mirror-ouRole-orgRole-be.md](../plan/role-naming-mirror-ouRole-orgRole-be.md)
**Applies To Repos:** `klynx-api`, `klynx-feature`, `gateway-api` (consumer of identity only), `klynx-connector` (refId consumer — unaffected)
**Contract Type:** `REST + Sync`
**Version:** `v1` — current Keycloak-as-profile-store implementation (profileAvatarUpdate rev 3.1) + role naming convention (PR #47 + PR #55 shipped, `4.2.0` BE Phase 2; `4.2.2 → 4.3.0` for ouRole/orgRole mirror); target-state Mongo `user_profiles` migration plan documented in §13 (NOT YET IMPLEMENTED)
**Supersedes:** `userProfile.md` (target-state v1 — Draft), `profileAvatarUpdate.md` (rev 3.1 — current-state), `userTableSurface.md` (Active — FE-display-only), `user-org-role-edit.md` (Approved — Phase 2 shipped 4.2.0), `role-naming-convention.md` (Draft — PR #47 + PR #55 already shipped; ouRole/orgRole mirrors pending)

---

## 0. Domain / Flow Boundary

| Field | Value |
|---|---|
| Domain name | `user-profile-and-roles` |
| Flow name | User identity + profile + role lifecycle: KC identity ↔ klynx app data → org-role + OU-role assignment → role-name canonical surface |
| Lifecycle scope | self profile read/write → admin profile + platform-role write → org membership + role assignment → OU member listing → role-name canonical convention across all surfaces |

### Included Surfaces

| Surface Type | Name | Purpose |
|---|---|---|
| REST | `GET /users/profile` | self profile read; `platformRole` canonical (PR #47 shipped) |
| REST | `PATCH /users/profile` | self profile write — GET-merge-PUT to KC; `platformRole` mirror |
| REST | `POST /users/profile/avatar` | self avatar upload (multipart) |
| REST | `PATCH /users/{id}/profile` | admin profile update (multipart, incl. avatar); 2 distinct 403 messages |
| REST | `PATCH /users/{id}` | admin profile + platform-role update (JSON only) |
| REST | `GET /users/{id}` | admin read user with org memberships; `details.user.platformRole` + `details.organizations[].orgRole` mirrors (PR #55 shipped) |
| REST | `PATCH /orgs/users/{userId}` | org-role assignment (add or update); body `{role: "admin"\|"member"}` only |
| REST | `GET /orgs/users/members` | org members list with `username` (KC) + `orgRole` canonical (`owner > admin > member` precedence) |
| REST | `GET /orgs/units/{id}/members` | OU members list with `ouRole` + `orgRole` mirrors |
| REST | `POST /webhooks/keycloak/userUpdated` | **TARGET-STATE** — KC → klynx-api one-way identity sync (USER_UPDATE / USER_DELETE) |
| REST | `POST /admin/system/userProfile/repair` | **TARGET-STATE** — operator-triggered full re-sync from KC |
| Sync | KC ↔ `user_profiles` identity mirror (TARGET-STATE) | freshness key `identitySyncedAt`, NOT `updatedAt` |
| FE display | `/systemUsers/users` user list table | column set + Excel export shape (FE-only contract from `userTableSurface.md`) |

### Excluded Surfaces

| Surface | Why excluded | Authoritative Contract |
|---|---|---|
| Org-create policy gate (`POST /orgs`) | covered by `org-lifecycle.md` §5.1 (4-layer gate) | sibling contract |
| `PATCH /orgs/users/remove` (member cleanup) | covered by `org-lifecycle.md` §5.8 (cascade OU + REMOVE_OWNER_INVARIANT) | sibling contract |
| Permission profile camera/edge/member grants | covered by `permission-profile.md` | sibling contract |
| User inactivity notifications | sibling — daily-scan flow, separate lifecycle | `userInactivityNotification.md` (Active Draft, optional / lower priority) |
| Password change (`PATCH /users/{id}/password`) | separate endpoint, separate lifecycle | (existing, not yet documented as contract) |
| User invite / signup flow | separate KC-driven flow, not part of profile editing | (existing, not yet documented as contract) |
| Connector pairing refId (org-scoped, singleUse / multiUse / expiresAt) | future plan — current `user_profiles.refId` is opaque carry-over only | future `klynx-connector-phase1` (separate contract) |

### Related Contracts

| Contract | Relationship |
|---|---|
| [`org-lifecycle.md`](./org-lifecycle.md) | sibling — owns org-creation policy gate + member cleanup; this contract owns user-side surfaces (profile, role assignment) |
| [`permission-profile.md`](./permission-profile.md) | sibling — `platformRole` from JWT is a runtime input to permission decisions; org-role here is the user-side counterpart to `memberIds` narrowing there |
| Future `klynx-connector-phase1` | downstream — uses `user_profiles.refId` (v1 carry-over) as an opaque field; org-scoped pairing is a separate plan |
| `userInactivityNotification.md` | sibling Active Draft — reads `lastLoginAt` / `primaryOrgId` (extends profile fields) |

### Grouping Rationale

All five source contracts intersect on the **same user identity + role surfaces**:
- `userProfile.md` = future split-store architecture (target)
- `profileAvatarUpdate.md` = current Keycloak-store implementation (with explicit migration arrow to userProfile.md target)
- `userTableSurface.md` = FE display surface for the user list (consumes the same user records)
- `user-org-role-edit.md` = current 4-endpoint editing surface; uses `platformRole` naming canonical and motivates `orgRole` derivation
- `role-naming-convention.md` = canonical naming rule (`platformRole` / `orgRole` / `ouRole`) across ALL surfaces emitting role values

A reader cannot understand:
- why `PATCH /users/profile` does GET-merge-PUT (profileAvatarUpdate) without seeing the future store split (userProfile)
- why `details.user.platformRole` mirrors `details.user.role` (user-org-role-edit) without seeing the canonical naming rule (role-naming-convention)
- why `orgRole == "owner"` can diverge from `role == "admin"` on `GET /orgs/users/members` (role-naming-convention) without seeing the original silent-demotion bug context (user-org-role-edit §5.4)

Per `docs/contracts/README.md` grouping rule, these are one flow → one contract.

---

## 1. Purpose

Defines the user identity + profile + role lifecycle end-to-end:

- **Current-state implementation** (Keycloak-as-profile-store, profileAvatarUpdate rev 3.1):
  - `PATCH /users/profile` (self) and `PATCH /users/{id}/profile` (admin) use GET-merge-PUT pattern so unsent identity fields (notably `email`) are preserved — closes the field-loss bug.
  - Avatar binary in MinIO via `internal/infra/s3`; URL stored in Keycloak `attributes.avatar`.
  - Other app-level fields (locale, mapLocation, zoomLevel, perPage, department, activeOrgId) live in Keycloak `attributes.*`.
  - Admin endpoint produces **two distinct 403 message strings** (admin-required vs use-/users/profile) — controller-level enforcement, NOT `RequireRoles` middleware.
- **Role naming canonical** (role-naming-convention v1; PR #47 + PR #55 shipped, ouRole/orgRole mirrors pending):
  - 3 distinct scopes: `platformRole` (Keycloak `realm_access.roles[]`, values `administrator`/`user`), `orgRole` (Permify `organization` tuples, `owner`/`admin`/`member` with **owner-precedence**), `ouRole` (Permify `orgUnit` tuples, `admin`/`member` — no owner concept).
  - Canonical `orgRole` MAY diverge from legacy `role` on `GET /orgs/users/members` for owner users (legacy collapses owner → "admin"; canonical emits "owner").
  - Legacy bare `role` retained during deprecation window; FE migrates to canonical.
- **User-org-role-edit** (Approved, Phase 2 shipped 4.2.0):
  - 4 endpoints clearly separate: profile/identity (`PATCH /users/{id}`) vs avatar+identity (`PATCH /users/{id}/profile`) vs org-role assignment (`PATCH /orgs/users/{userId}`).
  - `GET /users/{id}` returns `details.organizations[].orgRole` per-membership (PR #55).
  - Mixed-payload side-effect documented (sending `firstName` + `role` to `PATCH /orgs/users/{userId}` silently overwrites Keycloak platform-role attribute).
- **Target-state Mongo split** (userProfile.md target — NOT YET IMPLEMENTED):
  - `user_profiles` Mongo collection owned by klynx-api stores app-level fields (`avatar`, `department`, `refId`, `activeOrgId`, `preferences.*`, `extensions.<domain>.*`).
  - Keycloak retained only for identity (`email`, `username`, `firstName`, `lastName`, `enabled`) and global realm role.
  - JWT MUST NOT carry app-level state (`activeOrgId`, permissions, `map_*`, `perPage`, `avatar`, `department`, `refId`).
  - KC → klynx-api one-way sync via webhook (`USER_UPDATE` / `USER_DELETE`); freshness key `identitySyncedAt` (NOT `updatedAt`).
- **FE display surface** (userTableSurface):
  - User list table at `/systemUsers/users` renders 8 columns (intentionally no `phone`); Excel export mirrors. The `phone` field still exists in the user data model and the row payload returned by the API; FE simply does not render it.

`klynx-api` publishes this contract; `klynx-feature` (header / settings / map prefs / users page / user-edit page / org members tab / OU members tab) consumes it. Frontend must not invent role names, infer canonical-vs-legacy semantics, or replicate KC sync logic.

---

## 2. Ownership

### Owner Backend

- `klynx-api`

### Domain System of Record

| Domain | System of Record | Canonical Store | Notes |
|---|---|---|---|
| User identity (`email`, `username`, `firstName`, `lastName`, `enabled`) | Keycloak | Keycloak realm | authoritative |
| Global platform role | Keycloak | Keycloak realm role mapping (`realm_access.roles[]`) | values `administrator` / `user`; flat `role` claim is legacy fallback only |
| Permission / org role / relationship / resource grant | Permify | Permify schema | unchanged from existing authz model |
| Avatar binary | klynx-api `internal/infra/s3` | S3 / MinIO | URL written to KC `attributes.avatar` (current state) → migrates to `user_profiles.avatar` (target state) |
| App-level profile + preferences + state (current state) | Keycloak | KC `attributes.*` | `locale`, `mapLocation`, `zoomLevel`, `perPage`, `department`, `activeOrgId` — migrates to `user_profiles.*` (target state) |
| App-level profile + preferences + state (target state) | klynx-api `userprofilerepo` | `user_profiles` collection (new) | one document per `userId`; **NOT YET IMPLEMENTED** |
| Domain-specific profile extension (target state) | klynx-api `userprofilerepo` | `user_profiles.extensions.<domain>` (subdoc) | only until extension grows its own lifecycle / permission / heavy query |
| Connector pairing refId (v1) | klynx-api | `user_profiles.refId` (single field, user-scoped, target state) | v1 carry-over only — no connector-pairing semantics; org-scoped pairing is a separate plan |
| Org membership and org role | klynx-api → Permify (ReBAC) | Permify tuples on `organization` entity | `admin` and `member` derivable from tuples; `owner` managed via promote/demote (out of scope) |
| OU membership and OU role | klynx-api → Permify (ReBAC) | Permify tuples on `orgUnit` entity | `admin` and `member` derivable; no owner concept on OUs |

### Producer / Consumers

| Surface | Producer / Handler | Consumers | Notes |
|---|---|---|---|
| `GET /users/profile` | klynx-api `usrapi.GetProfile` | klynx-feature (header, settings, map prefs) | `platformRole` canonical (PR #47 shipped) |
| `PATCH /users/profile` | klynx-api `usrapi.UpdateProfile` (existing, refactored to GET-merge-PUT) | klynx-feature settings | identity → KC; app fields → KC attributes (current state) / `user_profiles` (target) |
| `POST /users/profile/avatar` | klynx-api `usrapi.UploadUserAvatar` | klynx-feature avatar upload | unchanged surface; storage S3 |
| `PATCH /users/{id}/profile` | klynx-api `usrapi.AdminUpdateProfile` | klynx-feature edit-user page (avatar save) | multipart; explicit platform-admin check inside controller (NOT `RequireRoles`); 2 distinct 403 messages |
| `PATCH /users/{id}` | klynx-api `usrapi.UpdateUser` | klynx-feature edit-user page (profile save no avatar) | JSON only; `RequireRoles(["administrator"])` middleware |
| `GET /users/{id}` | klynx-api `usrapi.UserDetailController.GetByID` | klynx-feature edit-user page mount | `details.user.platformRole` mirror + `details.organizations[].orgRole` (PR #55 shipped) |
| `PATCH /orgs/users/{userId}` | klynx-api `authzapi.OrganizationController.UpdateMember` | klynx-feature org-add flow + per-org role edit | body `{role: "admin"\|"member"}` only — strip profile fields |
| `GET /orgs/users/members` | klynx-api `authzsvc.ListMembers` | klynx-feature org members tab | `username` (KC) + `orgRole` canonical with owner-precedence |
| `GET /orgs/units/{id}/members` | klynx-api `authzsvc.ListMembersOfOU` | klynx-feature OU members tab | `ouRole` + `orgRole` mirrors |
| `POST /webhooks/keycloak/userUpdated` | klynx-api `usrapi.KeycloakUserUpdatedWebhook` (TARGET-STATE) | KC event listener SPI | HMAC shared-secret; one-way KC → klynx-api |
| `POST /admin/system/userProfile/repair` | klynx-api `sysapi.RepairUserProfiles` (TARGET-STATE) | platform admin UI / ops | manual full re-sync |
| User list table at `/systemUsers/users` | klynx-feature | end users (admin views) | FE display surface — no API change; renders 8 columns intentionally (no `phone`) |

---

## 3. Compatibility and Policy

### Backward Compatibility

- **Current-state `PATCH /users/profile`:** non-breaking for callers. Request and response shape unchanged. The behavioral change ("fields you didn't supply are now preserved instead of being cleared") restores intended semantics — there is no FE callsite that depended on the prior data-loss behavior.
- **Current-state `PATCH /users/{id}/profile`:** **additive** (new endpoint).
- **`PATCH /users/{id}`:** unchanged surface; admin-only via `RequireRoles` middleware.
- **`GET /users/{id}`:** **additive** — new fields `details.user.platformRole` (mirror of `details.user.role`) + `details.organizations[].orgRole` per-membership. Existing FE that ignores unknown fields is unaffected. Both `role` and `platformRole` populated during deprecation cycle; FE migrates to `platformRole`; `role` will be removed in a later phase.
- **`PATCH /orgs/users/{userId}`:** unchanged surface; mixed-payload side-effect documented (FE must keep body to `{role}` only).
- **`GET /orgs/users/members`, `GET /orgs/units/{id}/members`:** **additive** — `orgRole` and `ouRole` mirror fields. Owner-precedence rule on `orgRole` may diverge from legacy `role` for owner users. Legacy `role` keeps existing semantics during deprecation window.
- **Target-state `userProfile.md`:** **breaking** for the JSON envelope of `GET /users/profile` and `PATCH /users/profile` once shipped — fields previously flat (`mapLat`, `mapLng`, `zoomLevel`, `perPage`) become nested under `preferences` / `preferences.map`. KC attribute read paths removed in same release; FE deployed in lockstep against new envelope. Path unchanged (`/users/profile`); only payload shape changes. Versioning via path (`/v2/users/profile`) is rejected — old shape was undocumented. **NOT YET IMPLEMENTED.**
- **Target-state webhook + admin repair:** additive (new endpoints) when shipped. **NOT YET IMPLEMENTED.**
- **`userTableSurface.md`:** rev 1 removed `phone` column from FE table + Excel export. The `phone` field still exists in KC + API row payload — only FE rendering removed.

### Replay / Re-sync Behavior

- **Direct user-driven writes (`PATCH /users/profile`, `PATCH /users/{id}/profile`, `PATCH /users/{id}`, `PATCH /orgs/users/{userId}`):** synchronous REST; no replay.
- **Target-state KC → `user_profiles` sync:** replay supported via `POST /admin/system/userProfile/repair`. Re-sync trigger: on first login (lazy), on Keycloak user lifecycle webhooks (`USER_UPDATE`, `USER_DELETE` — `USER_DISABLE` is delivered as `USER_UPDATE` with `enabled=false`), or via the admin repair endpoint. Duplicate delivery: idempotent upsert by `userId`. Identity fields overwrite from KC; app fields are never overwritten by repair (KC is not authoritative for them). **Idempotency / freshness key: `identitySyncedAt`** (a dedicated timestamp on the profile row tracking last applied KC identity event). Webhook handler compares `payload.occurredAt > user_profiles.identitySyncedAt` to decide whether to apply. **`updatedAt` is NOT used for sync ordering** because it also moves on app-level writes (preferences, avatar, `activeOrgId`) and would cause a real later KC change to be discarded.

### Write Authority Policy

- Keycloak is authoritative for identity (`email`, `username`, `firstName`, `lastName`, `enabled`).
- Keycloak is authoritative for global realm role (`platformRole`).
- **Current state:** Keycloak is authoritative for app-level profile (`avatar`, `locale`, `mapLocation`, `zoomLevel`, `perPage`, `department`, `activeOrgId`) — stored in `attributes.*`.
- **Target state:** klynx-api `user_profiles` is authoritative for app-level profile + preferences + state. Identity edits initiated through `PATCH /users/profile` are persisted to Keycloak first, then mirrored to `user_profiles` (no equal-authority dual-write). App-level edits write to `user_profiles` only — never round-tripped to Keycloak.
- Permify is authoritative for authz, org membership, OU membership.
- **Frontend MUST NOT** attempt to derive a user's org role from any platform attribute, and MUST NOT send platform role values into the org-role field of `PATCH /orgs/users/{userId}`.
- **Current-state avatar:** in Keycloak `attributes.avatar` exactly as the existing code does. The future migration to `user_profiles.avatar` (per target state) is its own plan.
- **`role` attribute on Keycloak user:** authoritative for platform role; only platform admin can write via `PATCH /users/{id}`.

### Revision History (preserved verbatim from source contracts)

**userProfile.md (v1, target-state Draft, NOT YET IMPLEMENTED):**
- Decision Point P-1 resolved: v1 = `user_profiles.refId` carry-over only; org-scoped pairing deferred to a separate plan.
- Decision Point P-4 resolved: `avatar` is always an absolute URL.
- Decision Point P-5 resolved: `USER_DELETE` → leave row + disable, never hard-delete.
- Identity sync freshness key is dedicated (`identitySyncedAt`), not `updatedAt`.
- `X-Active-Org` runtime semantics explicitly preserved; `user_profiles.activeOrgId` documented as UI preference only.
- Webhook scope covers `USER_UPDATE` (incl. disable via `enabled=false`) and `USER_DELETE`. `USER_DISABLE` is NOT a separate KC event.

**profileAvatarUpdate.md (rev 3.1, current-state):**
- rev 1: initial — proposed `PATCH /users/:id/profile` and merge-then-PUT framing; assumed canonical user-data split was implemented.
- rev 2: Codex review applied — reframed against canonical `userProfile.md` (split avatar to `user_profiles`, switched admin endpoint to `POST /admin/users/:id/avatar`, locked auth policy with explicit 403 messages).
- rev 3: Codex blocker resolved on canonical-vs-current-state — `userProfile.md` and `userProfile-store.md` still Draft; `userprofilerepo` does not exist in codebase. v1 must implement against current state (Keycloak attributes). This revision targets actual production code: avatar stays in `attributes.avatar`, admin endpoint reverts to `PATCH /users/:id/profile` (no `/admin/users/...` group exists). Auth message strings carried over from rev 2 verbatim. §9 captures migration target so future plan inherits contract as-is.
- rev 3.1: Codex blocker resolved on auth/route inconsistency — locked one model: route lives outside admin-role group; controller performs explicit platform-admin check (so two distinct 403 messages are producible); per-route `middleware.Audit(...)` is attached so successful platform-admin calls remain audited at parity with adjacent admin endpoints.

**user-org-role-edit.md (Approved, Phase 2 shipped 4.2.0):**
- r1 → r2: addresses BE review.
- BE owner sign-off 2026-04-29; FE Track A unblocked; FE Track B pending.
- Open follow-ups: deprecate `details.user.role` after Track B switch; `MessageOK` envelope cleanup on `PATCH /users/{id}` (1-line BE-only).

**role-naming-convention.md (v1, rev 2):**
- rev 1 → rev 2: addresses owner-precedence blocker on `OrgMember.orgRole`.
- PR #47 shipped (`platformRole` on `/users/profile`).
- PR #55 shipped (`orgRole` + `platformRole` mirror on `GET /users/{id}`).
- Phase 1 BE additive (`ouRole` value-equal mirror + `orgRole` canonical with owner-precedence on member listings) **PENDING** — version bump `4.2.2 → 4.3.0` planned.
- Phase 2 (FE consumer switch) and Phase 3 (BE deprecation of legacy bare `role`) deferred.
- **Important — canonical ≠ mirror.** On most endpoints the canonical key carries the same string as the legacy `role`. On `GET /orgs/users/members` it does **not**: the legacy `role` collapses owner into `"admin"` (with `isOwner` as a parallel flag), while the canonical `orgRole` MUST emit `"owner"` per the platform-wide enum.

**userTableSurface.md (Active):**
- rev 1 (2026-04-27): removed `phone` column from user list table and matching Excel export. Reason: product decision — phone was shown but not a routine identifier in this product, and was cluttering row width on smaller screens. The `phone` field still exists in the user data model (KC attribute) and the row payload returned by the API; FE simply does not render it. If phone needs to come back later, re-add the column definition only — no API change required.

---

## 4. Surface Summary

| Type | Name | Method | Auth / Trust | Producer / Handler | Consumer / Caller |
|---|---|---|---|---|---|
| REST | `/users/profile` | `GET` | Bearer | `usrapi.GetProfile` | klynx-feature header / settings / map prefs |
| REST | `/users/profile` | `PATCH` (multipart current-state; future JSON) | Bearer | `usrapi.UpdateProfile` (GET-merge-PUT) | klynx-feature settings |
| REST | `/users/profile/avatar` | `POST` (multipart) | Bearer | `usrapi.UploadUserAvatar` | klynx-feature avatar upload |
| REST | `/users/{id}` | `GET` | Bearer (platform admin OR org admin of `X-Active-Org` containing target user) | `usrapi.UserDetailController.GetByID` | klynx-feature edit-user page mount |
| REST | `/users/{id}` | `PATCH` (JSON only) | Bearer + `RequireRoles(["administrator"])` middleware | `usrapi.UpdateUser` | klynx-feature edit-user page (profile save) |
| REST | `/users/{id}/profile` | `PATCH` (multipart) | Bearer + **explicit platform-admin check inside controller** (NOT `RequireRoles` middleware) | `usrapi.AdminUpdateProfile` | klynx-feature edit-user page (avatar save) |
| REST | `/orgs/users/{userId}` | `PATCH` | Bearer + `manage` permission on `X-Active-Org` (or platform admin bypass) | `authzapi.OrganizationController.UpdateMember` | klynx-feature org-add flow + per-org role edit |
| REST | `/orgs/users/members` | `GET` | Bearer + org member of `X-Active-Org` | klynx-api `authzsvc.ListMembers` | klynx-feature org members tab |
| REST | `/orgs/units/{id}/members` | `GET` | Bearer + org member | klynx-api `authzsvc.ListMembersOfOU` | klynx-feature OU members tab |
| REST | `/webhooks/keycloak/userUpdated` (TARGET) | `POST` | HMAC shared-secret header `X-KC-Signature` (out of band of Bearer auth) | `usrapi.KeycloakUserUpdatedWebhook` | KC event listener SPI |
| REST | `/admin/system/userProfile/repair` (TARGET) | `POST` | Bearer + platform `administrator` role | `sysapi.RepairUserProfiles` | platform admin UI / ops |

---

## 5. REST Surfaces

### 5.1 `GET /users/profile` — self profile read

**Auth:** `Authorization: Bearer <jwt>`.
**Purpose:** Return the authenticated user's identity (mirrored from KC) + app-level profile + preferences + extensions.

#### Success Response (200) — current state (Keycloak-backed)

```json
{
  "code": "SUCCESS",
  "message": "OK",
  "status": true,
  "details": {
    "id": "<userId>",
    "username": "...", "email": "...", "firstName": "...", "lastName": "...", "enabled": true,
    "platformRole": "administrator",
    "avatar": "/files/profile/<objectKey>",
    "locale": "en",
    "mapLocation": { "lat": "13.7563", "lng": "100.5018" },
    "zoomLevel": 12,
    "perPage": 20,
    "department": "engineering",
    "activeOrgId": "org-7f3e"
  }
}
```

#### Success Response (200) — target state (Mongo-backed, NOT YET IMPLEMENTED)

```json
{
  "code": "SUCCESS",
  "message": "OK",
  "status": true,
  "details": {
    "userId": "kc-user-uuid",
    "username": "alice", "email": "alice@example.com",
    "firstName": "Alice", "lastName": "Liddell", "enabled": true,
    "platformRole": "administrator",
    "avatar": "https://cdn.klynx.io/avatars/kc-user-uuid.jpg",
    "department": "engineering",
    "refId": "RID-AB12-CD34",
    "activeOrgId": "org-7f3e",
    "preferences": {
      "perPage": 20,
      "map": { "lat": 13.7563, "lng": 100.5018, "zoomLevel": 12 }
    },
    "extensions": {
      "station": { "stationCode": "ST001", "stationName": "Bangkok Station", "position": "operator" }
    },
    "createdAt": "2026-01-15T10:00:00Z",
    "updatedAt": "2026-04-27T08:31:00Z"
  }
}
```

#### Field Definitions

| Field | Type | Owner | Description |
|---|---|---|---|
| `userId` / `id` | string | Keycloak | KC user ID (used as `_id` in `user_profiles` target) |
| `username` / `email` / `firstName` / `lastName` / `enabled` | various | Keycloak | mirrored read-through |
| `platformRole` | enum | Keycloak | runtime identity context derived from JWT's realm role list. Value is **always** one of `"administrator"` or `"user"` (auth middleware rejects requests with no recognizable role with 403 before this handler runs). **Source-of-truth (locked):** primary = JWT `realm_access.roles[]`; fallback = flat `claims["role"]` claim (legacy KC mapper, optimization only — not authoritative). **Simplified projection (locked):** if `realm_access.roles[]` contains `"administrator"` → `"administrator"`; else → `"user"`. This is **not** the user's full role list — if you need the full list, request a separate `realmRoles []string` field via a follow-up plan. **Not stored in `user_profiles`** — never persisted, never written, never projected. |
| `avatar` | string | klynx-api | **absolute URL** in target state; current state stores the S3 object key value but FE renders relative path `/files/profile/<key>`. S3 key is an internal detail and should never appear as a raw key in this field in target state |
| `department` | string | klynx-api | free-form org/team label |
| `refId` | string | klynx-api | v1 carry-over of legacy user-scoped attribute. Treated as opaque app data; no connector-pairing semantics — see Excluded Surfaces |
| `activeOrgId` | string | klynx-api | **persisted UI preference** — the org FE should pre-select on next session / page load. **Not** the runtime org context for a request. The runtime org context is the `X-Active-Org` request header validated by `ActiveOrg()` middleware (unchanged); `activeOrgId` is **never** sourced from JWT and **never** authoritative for permission checks |
| `preferences.perPage` (target) | int | klynx-api | default page size hint for FE; not enforced server-side |
| `preferences.map.lat` / `lng` / `zoomLevel` (target) | float / int | klynx-api | last-used map center / zoom |
| `extensions.<domain>.*` (target) | object | klynx-api | domain-scoped extension subdoc (e.g. `station`) |
| `createdAt`, `updatedAt` (target) | RFC3339 UTC | klynx-api | profile row timestamps. `updatedAt` moves on **any** field write (identity mirror, app fields, preferences, extensions) |
| `identitySyncedAt` (target, internal) | RFC3339 UTC | klynx-api | last applied Keycloak identity event timestamp. Updated **only** when identity mirror changes (lazy create, KC webhook, admin repair). Used for KC → `user_profiles` idempotency; never for app-level writes. **Internal field — not part of public response envelope** |

#### Errors

| HTTP | Code | Meaning | Consumer Handling |
|---|---|---|---|
| 401 | `UNAUTHORIZED` | missing or invalid JWT | redirect to login |
| 500 | `PROFILE_LOAD_FAILED` | Keycloak unreachable + profile row not in cache | retry with backoff; do not write any local fallback |

### 5.2 `PATCH /users/profile` — self profile write (GET-merge-PUT)

**Auth:** Bearer.
**Purpose:** Partial update. Identity fields written through to Keycloak first; app-level fields written to KC `attributes.*` (current state) or `user_profiles` (target state).

**Current state — multipart/form-data:**

| Field | Type | Owner store (current) | Behavior when missing |
|---|---|---|---|
| `firstName` / `lastName` / `email` | string | Keycloak top-level | preserved |
| `locale` | string | KC `attributes.locale` | preserved |
| `mapLocation` (`lat`, `lng`) | string fields | KC `attributes.mapLocation` | preserved |
| `zoomLevel` | string | KC `attributes.zoomLevel` | preserved |
| `perPage` | string | KC `attributes.perPage` | preserved |
| `department` | string | KC `attributes.department` | preserved |
| `activeOrgId` | string | KC `attributes.activeOrgId` | preserved |
| `avatar` | file | uploaded to MinIO; key written to KC `attributes.avatar` | preserved |

The contract guarantees that **any field not present in the request is not modified in Keycloak**. Empty omission = preserve. There is no convention for explicit clearing through this endpoint.

#### GET-merge-PUT pattern (current state — required for both `PATCH /users/profile` and `PATCH /users/{id}/profile`)

For both endpoints, the service layer executes:

1. If `avatar` is present, upload to MinIO via the existing helper → object key.
2. `GET /admin/realms/{realm}/users/{targetUserId}` from Keycloak — full current representation (top-level + attributes map).
3. Build merged map:
   - **Top-level identity** (`email`, `firstName`, `lastName`, `username`, `enabled`): override only when the caller supplied a non-nil value.
   - **`attributes` map**: deep-merge entry-by-entry. Caller keys (including `avatar` from step 1) overwrite; all other entries preserved exactly. Caller scalar values are coerced to Keycloak's `[]string` shape.
4. If neither identity nor attribute changes were supplied → no Keycloak write at all; return current profile via `GetUserProfile`.
5. Otherwise → `PUT /admin/realms/{realm}/users/{targetUserId}` with the merged representation.

This is the canonical safe-update pattern for Keycloak's PUT-based admin REST API. Any klynx-api flow that updates an existing Keycloak user representation MUST follow it.

**Target state — JSON body (when shipped):**

```json
{
  "firstName": "Alice", "lastName": "Liddell", "department": "engineering",
  "activeOrgId": "org-7f3e",
  "preferences": {
    "perPage": 50,
    "map": { "lat": 13.7563, "lng": 100.5018, "zoomLevel": 14 }
  },
  "extensions": { "station": { "stationCode": "ST001" } }
}
```

| Field | Owner Store | Write Path |
|---|---|---|
| `firstName` / `lastName` | Keycloak | klynx-api → KC admin API → mirror back to `user_profiles` |
| `avatar` | klynx-api | direct write to `user_profiles.avatar` (set via `/users/profile/avatar` upload — included here only when clearing) |
| `department` | klynx-api | direct write to `user_profiles.department` |
| `activeOrgId` | klynx-api | direct write to `user_profiles.activeOrgId` (no KC, no JWT) |
| `preferences.*` | klynx-api | direct write to `user_profiles.preferences.*` |
| `extensions.<domain>.*` | klynx-api | direct write to `user_profiles.extensions.<domain>.*` (deep-merge per domain key) |

`email`, `username`, `enabled`, `userId`, `createdAt`, `updatedAt`, `refId` are not editable through this endpoint.

#### Success Response

**HTTP:** `200` — same envelope as §5.1 (returns full updated profile). `platformRole` is included on every authenticated response; sourced from request's JWT, not from patch payload, never modifiable through this endpoint.

#### Errors

| HTTP | Code | Meaning | Consumer Handling |
|---|---|---|---|
| 400 | `INVALID_INPUT` / `INVALID_REQUEST` | unknown field, malformed body, immutable field present, multipart parse failure | fix client payload |
| 400 | `INVALID_ORG` | `activeOrgId` not in user's allowed org set (Permify check, target state) | force user to pick a valid org |
| 401 | `UNAUTHORIZED` | missing or invalid JWT | redirect to login |
| 409 | `KEYCLOAK_WRITE_FAILED` | identity write to KC failed (no partial commit) | retry; nothing was persisted |
| 500 | `PROFILE_WRITE_FAILED` | Mongo write failed after KC succeeded (target state) | retry; eventual consistency repair on next read |
| 502 | `KEYCLOAK_UNAVAILABLE` (current state) | Keycloak GET or PUT failed | retry |
| 502 | `STORAGE_UNAVAILABLE` (current state) | MinIO upload failed | retry |
| 500 | `INTERNAL_SERVER_ERROR` | unexpected | toast + retry |

### 5.3 `POST /users/profile/avatar` — self avatar upload

**Auth:** Bearer.
**Purpose:** Multipart upload of avatar image. Stores binary in S3, then writes resulting **absolute URL** (target state) or object key (current state) to the canonical store.

Surface unchanged from current implementation; only the storage destination of the URL string changes (Mongo instead of KC attribute) when target state ships. Body shape, validation, and S3 path are out of scope for this contract.

### 5.4 `PATCH /users/{id}` — admin profile + platform role (no avatar)

**Auth:** Bearer + platform-admin (`administrator`). Enforced by `middleware.RequireRoles([]string{"administrator"})` in `router/user.go`.
**Purpose:** Update one or more Keycloak user attributes for the target user, including platform role. **Does NOT touch org membership or org role.**

**Request:** `Content-Type: application/json` only — multipart bodies are rejected.

```json
{
  "firstName": "aliz", "lastName": "pd1", "email": "aliz@hotmail.com",
  "role": "administrator", "locale": "en", "enabled": true
}
```

| Field | Type | Required | Owner | Description |
|---|---|---|---|---|
| `firstName` / `lastName` / `email` / `locale` | string | no | FE | Keycloak fields |
| `role` | enum: `administrator` \| `user` | no | FE | **Platform role** — written to Keycloak `role` attribute. **NOT an org role.** Sending `admin` or `member` here is a contract violation |
| `enabled` | boolean | no | FE | Keycloak `enabled` flag (separate `enable`/`disable` endpoints exist; FE may send here too) |

**Field constraints:**

- FE MUST NOT send `username`, `password`, `confirmPassword`, or `avatar` on this endpoint. `username` is read-only post-creation; password has its own endpoint (`PATCH /users/{id}/password`); avatar uploads go to `PATCH /users/{id}/profile`.
- BE silently ignores unknown attributes today (free-form `map[string]any`). This contract documents the supported set above; future BE changes MAY add a strict allowlist.

**`X-Active-Org` not used by handler.** FE may auto-inject. The handler does not branch on this header. The shared `ActiveOrg` middleware may still validate the value (e.g. confirm caller is a member of the named org) before the request reaches the handler — FE should not rely on the header being silently dropped.

#### Success Response

**HTTP:** `200`

```json
{ "code": "SUCCESS", "status": true, "message": "user updated" }
```

> **BE follow-up (recommended, not blocking).** Handler currently builds the envelope by hand via `c.JSON(gmod.SuccessResponse{...})`. Switching to `httputil.MessageOK(c, "user updated")` would make the envelope shape consistent with the rest of the API surface. 1-line BE-only change with no FE impact.

#### Errors

| HTTP | Code | Meaning |
|---|---|---|
| 400 | `MISSING_ID` | `id` path param empty |
| 400 | `INVALID_BODY` | JSON parse error |
| 401 | `UNAUTHORIZED` | Missing bearer |
| 403 | (RequireRoles middleware native shape) | Caller is not platform `administrator` |
| 500 | `UPDATE_USER_FAILED` | Keycloak write failed |

### 5.5 `PATCH /users/{id}/profile` — admin profile + avatar

**Auth:** Bearer + platform-admin. **Enforced explicitly inside the controller** (`controllers/usrapi/profile.go`), NOT via `RequireRoles` middleware — controller produces two distinct 403 strings.
**Purpose:** Multipart endpoint that admins use to upload an avatar (and optionally update identity fields) for another user.

**Request:** `Content-Type: multipart/form-data`.

**Form Fields:**

| Field | Type | Required | Description |
|---|---|---|---|
| `firstName` | text | no | First name |
| `lastName` | text | no | Last name |
| `avatar` | file | no | Image file: jpg / jpeg / png / webp; max 2 MB |

**Field constraints:**
- Platform role and `enabled` flag are **NOT** updatable via this endpoint — use `PATCH /users/{id}` for those.
- See profileAvatarUpdate rev 3.1 §7.2 / §7.3 for canonical list. This is the endpoint that owns avatar uploads.

#### Auth gating (locked) — Outcome matrix

| Caller | Outcome | HTTP | Code | `message` (exact, contractual) |
|---|---|---|---|---|
| Platform `administrator` | success | 200 | `SUCCESS` | per response body |
| `administrator-tenant` (org-admin) | reject | 403 | `FORBIDDEN` | `admin profile update requires platform administrator role` |
| Authenticated non-admin user, `:id == self` | reject | 403 | `FORBIDDEN` | `use PATCH /users/profile for self profile update` |
| Authenticated non-admin user, `:id != self` | reject | 403 | `FORBIDDEN` | `admin profile update requires platform administrator role` |

The two distinct 403 message strings are part of the contract — FE may parse them to disambiguate. They MUST be returned literally; no rewording, no localization at the API layer (FE owns localization on top).

#### How the gate is enforced (contract requirement)

The gate **MUST be implemented in the controller**, not in route-level `RequireRoles` middleware. Reason: contract requires two distinct 403 message strings, which a single middleware-rejection point cannot produce.

Required implementation:
1. The route is registered **outside** any admin-role middleware group, so the controller is reached for every authenticated caller.
2. The controller reads `c.Locals("platformRole")` and `c.Locals("userId")` (both populated by `AuthBearer()` upstream) and applies the matrix above. The non-admin self case (`platformRole != "administrator" AND :id == userId`) returns the use-/users/profile message; all other non-admin cases return the platform-admin-required message.

#### Audit coverage requirement

Because the route is outside the admin-role middleware group, it does **not** automatically inherit the admin block's `middleware.Audit(...)`. To preserve audit equivalence with adjacent admin user-management endpoints (`PATCH /users/:id`, `DELETE /users/:id`, etc.), implementations MUST attach `middleware.Audit(...)` per-route on `/users/:id/profile`.

Audit middleware is attached **after** the controller's role check returns success-or-controller-reject — middleware-rejected requests are not audited; controller-handled requests, success or 403, follow the audit middleware's normal behavior.

#### Errors

| HTTP | Code | When |
|---|---|---|
| 400 | `INVALID_REQUEST` | malformed multipart, unsupported avatar mime, oversized avatar |
| 401 | `UNAUTHORIZED` | missing/invalid bearer |
| 403 | `FORBIDDEN` | per outcome matrix (exact message strings) |
| 404 | `USER_NOT_FOUND` | `:id` does not exist in Keycloak |
| 502 | `KEYCLOAK_UNAVAILABLE` | KC GET or PUT failed |
| 502 | `STORAGE_UNAVAILABLE` | MinIO upload failed |
| 500 | `INTERNAL_SERVER_ERROR` | unexpected |

### 5.6 `GET /users/{id}` — admin read user with org memberships

**Auth:** Bearer. Caller must be either platform `administrator`, **or** be an admin of the `X-Active-Org` AND that org must contain the target user.

#### Success Response (200) — post Phase 2 (PR #55 shipped)

```json
{
  "code": "SUCCESS",
  "status": true,
  "message": "ok",
  "details": {
    "user": {
      "id": "6078c979-...",
      "username": "aliz", "firstName": "aliz", "lastName": "pd1",
      "email": "aliz@hotmail.com",
      "role": "user",
      "platformRole": "user",
      "locale": "en", "enabled": true,
      "avatar": "users/6078c979.../avatar.png"
    },
    "organizations": [
      {
        "orgId": "f1...", "tenantId": "t1...",
        "name": "Org Alpha", "description": "...", "isActive": true,
        "createdAt": "2026-01-01T00:00:00Z", "updatedAt": "2026-04-01T00:00:00Z",
        "workspaceId": "...", "eventIngestUri": "...", "provisionStatus": "ready",
        "orgRole": "admin"
      }
    ]
  }
}
```

> **Note on `message`.** `httputil.Ok` defaults to literal `"ok"` (lowercase). The `code` field carries `"SUCCESS"`. FE must not branch on `message` text.

#### Required Additive Fields (PR #55 — both shipped)

| Field | Type | Owner | Description |
|---|---|---|---|
| `details.organizations[].orgRole` | enum: `owner` \| `admin` \| `member` | klynx-api | Effective org role of target user in this organization |
| `details.user.platformRole` | enum: `administrator` \| `user` | klynx-api | Mirror of `details.user.role` under the canonical platform-role name. Required to align with `profileResponse-role.md` field-naming policy. Both keys populated during deprecation cycle; FE migrates to `platformRole`; `role` will be removed in a later phase |

**Derivation rules (BE):**

`organizations[].orgRole`:

```
if IsUserOwner(tenantId, orgId, targetUserId) → "owner"
else if IsUserAdmin(tenantId, orgId, targetUserId) → "admin"
else → "member"
```

`IsUserOwner` and `IsUserAdmin` already exist on `OrganizationService` (`internal/services/authzsvc/orgValidation.go`). The `OrganizationService.List` projection in `internal/services/authzsvc/org.go` was extended to populate this field per-org via the `OrgSummary.OrgRole` field.

`details.user.platformRole`: mirror `details.user.role` exactly (the Keycloak `role` attribute already extracted by `usrsvc.GetUsersByIds`).

#### Errors

| HTTP | Code | Meaning |
|---|---|---|
| 401 | `UNAUTHORIZED` | Missing or invalid bearer |
| 403 | `FORBIDDEN` | Caller lacks org-admin scope on `X-Active-Org` |
| 404 | `USER_NOT_FOUND` | No user with that id, or user not in `X-Active-Org` for non-platform-admin caller |
| 500 | `GET_USER_FAILED` | Keycloak failure |

### 5.7 `PATCH /orgs/users/{userId}` — org-role assignment (add or update)

**Auth:** Bearer + caller has `manage` permission on `X-Active-Org` (or platform admin via bypass path).
**Purpose:** Two distinct intents collapsed into one endpoint by current BE implementation:
1. **Invite + assign role** — if target is not yet a member of `X-Active-Org`, auto-invite them with `body.role`.
2. **Update existing member's org role** — if target is already a member, change their org role between `admin` and `member`.

**The frontend MUST use this endpoint only for org-membership intents.** Profile updates and platform-role updates MUST go to `PATCH /users/{id}` or `PATCH /users/{id}/profile`.

**Request:** `Content-Type: application/json` (preferred) — multipart accepted but FE must not use it for org-only intents.

#### Request body — Org-Role-Only (Required FE Pattern)

```json
{ "role": "admin" }
```

| Field | Type | Required | Owner | Description |
|---|---|---|---|---|
| `role` | enum: `admin` \| `member` | yes | FE | **Org role only.** BE normalizes: `"admin"` → admin, anything else → `"member"` |

#### Critical FE rules

1. **NEVER send `"administrator"` or `"user"` here** — those are platform-role values. The BE normalizer treats them as "not admin" → demotes target to `member`. **This is the root cause of the silent demotion bug** that motivated this contract revision.
2. **NEVER send profile fields (`firstName`, `lastName`, `email`, `locale`, `enabled`, `avatar`) on this endpoint from the user-edit screen.** While BE currently accepts and forwards them to Keycloak, doing so reintroduces the field-collision bug because BE also writes a platform-role attribute derived from the same `role` field.
3. The FE MAY reuse this endpoint for the existing `Organizations` admin screen (where the intent is unambiguously an org role change) — but the body must remain `{ "role": "admin" | "member" }` with no profile fields.

> **⚠️ Mixed-payload side effect (read this if you ever need to deviate from rules 2 and 3 above).** Whenever this endpoint receives **any** profile attribute alongside `role` (`firstName`, `lastName`, `email`, `locale`, or `enabled` — i.e. `len(profileAttrs) > 0` at `controllers/authzapi/orgUpdateMember.go`), BE additionally writes the **Keycloak `role` attribute** (platform role) using the same `role` body field:
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
> This means a payload like `{ "firstName": "X", "role": "admin" }` will:
> 1. Set the org-role tuple to `admin` in Permify (the explicit intent).
> 2. **Silently overwrite the user's Keycloak platform-role attribute to `"user"`** (because `"admin" != "administrator"`).
>
> The reverse — `{ "lastName": "X", "role": "user" }` — silently demotes the user's org role to `member` AND writes platform role `"user"`. Both writes happen on every call. There is no FE-side workaround except to keep this endpoint's body to `{ "role": "admin" | "member" }` only. The deprecation note in §13 tracks a future BE cleanup of this coupling.

#### Deprecated FE Usage

The following request shapes are observed in the legacy frontend and are deprecated. They MUST be removed in the FE Track A fix:

```jsonc
// ❌ Sends platform role into org-role slot — silently demotes org admin
{ "username": "aliz", "firstName": "aliz", "lastName": "pd1", "email": "aliz@hotmail.com",
  "role": "user", "locale": "en", "enabled": true }
```

#### Success Response (200)

```json
{
  "code": "SUCCESS",
  "status": true,
  "message": "member updated",
  "details": { "userId": "6078c979-...", "role": "admin" }
}
```

`details.role` is the **normalized org role** that was applied — FE can use it to confirm the resulting state.

#### Errors

| HTTP | Code | Meaning |
|---|---|---|
| 400 | `BAD_REQUEST` | `userId` empty, body missing `role`, or invalid body |
| 401 | `UNAUTHORIZED` | Missing bearer |
| 403 | `FORBIDDEN` | Caller lacks `manage` on org |
| 409 | `CANNOT_REMOVE_LAST_EFFECTIVE_MANAGER` | Demoting the last effective manager |
| 500 | (varies) | Permify / Keycloak failure |

### 5.8 `GET /orgs/users/members` — org members list

**Auth:** Bearer + `X-Active-Org` (caller must be a member of the active org).

#### Success Response (200) — post role-naming Phase 1 (PENDING — `4.2.2 → 4.3.0`)

```json
{
  "code": "SUCCESS",
  "status": true,
  "message": "List member in org",
  "details": {
    "items": [
      {
        "userId": "03657045-...", "username": "admin",
        "role": "admin",
        "orgRole": "owner",
        "isOwner": true, "isAdmin": false, "isBillingOwner": true,
        "firstName": "admin", "lastName": "adminnn",
        "enabled": true
      },
      {
        "userId": "821c1a8d-...", "username": "wecom",
        "role": "admin",
        "orgRole": "admin",
        "isOwner": false, "isAdmin": true, "isBillingOwner": false,
        "email": "wecom@gmail.com", "firstName": "wecom", "lastName": "Test",
        "enabled": true
      },
      {
        "userId": "2061b216-...", "username": "wegan",
        "role": "member",
        "orgRole": "member",
        "isOwner": false, "isAdmin": false, "isBillingOwner": false,
        "email": "wegan@gmail.com", "firstName": "wegan", "lastName": "test",
        "enabled": true
      }
    ],
    "summary": { "active": 17, "inactive": 0 }
  },
  "pagination": { "page": 1, "perPage": 10, "totalRecords": 17, "totalPages": 2, "sortField": "firstName", "sortOrder": "asc" }
}
```

**Note the divergence on the owner row.** First item has `role == "admin"` (legacy collapse) but `orgRole == "owner"` (canonical precedence). FE MUST consume `orgRole` to distinguish owner from admin — do NOT branch on `role` alone, do NOT branch on `isOwner` alone if you are also rendering the role label, since those two were a workaround for the missing canonical field. The other rows show admin and member where `role == orgRole` because there is no semantic gap to bridge.

**Owner-precedence rule (canonical, all endpoints):** wherever `orgRole` appears, the BE MUST emit one of `{owner, admin, member}` using the precedence `owner > admin > member`. This is the same rule shipped for `OrgSummary.OrgRole` in PR #55 and is the value space FE relies on to render the per-org role chip / dropdown.

**`username` field** (existing, additive in `org-member-cleanup-and-username` v1):
- Source: `authgw.UserProfile.Username` (Keycloak `username` claim). Canonical rule: `OrgMember.Username = UserProfile.Username`. No trimming, lowercasing, or rename.
- Omitted when Keycloak profile is missing (soft-deleted user still in Permify) — FE must tolerate absence.
- `summary.active + summary.inactive == pagination.totalRecords` (search-scoped — Q5 global summary WITHDRAWN per `org-lifecycle.md`).

### 5.9 `GET /orgs/units/{id}/members` — OU members list

#### Success Response (200) — post role-naming Phase 1 (PENDING)

```json
{
  "code": "SUCCESS",
  "status": true,
  "message": "OU members fetched",
  "details": {
    "items": [
      {
        "userId": "821c1a8d-752c-4637-a270-a80dad9eca6e",
        "role": "member",
        "ouRole": "member",
        "orgRole": "admin",
        "email": "wecom@gmail.com",
        "firstName": "wecom", "lastName": "Test",
        "enabled": true
      }
    ]
  },
  "pagination": { "page": 1, "perPage": 10, "totalRecords": 1, "totalPages": 1, "sortField": "firstName", "sortOrder": "asc" }
}
```

`role` and `ouRole` carry the same value (value-equal mirror — no semantic gap). `orgRole` carries the user's role in the parent organization (already shipped today via Permify org-relations enrichment in `ListMembersOfOU`; derivation `owner > admin > member`).

**Future endpoints:** any new response that carries an OU-scoped role MUST use `ouRole` from day one. There is no compatibility reason to emit a bare `role` for new surfaces.

### 5.10 `POST /webhooks/keycloak/userUpdated` — KC inbound webhook (TARGET-STATE)

**Auth:** HMAC shared-secret header `X-KC-Signature` (out of band of Bearer auth).
**Purpose:** One-way Keycloak → klynx-api sync. Triggered by KC event listener SPI when a KC user changes externally (admin console, KC REST, federated IdP, account-console self-edit).

**NOT YET IMPLEMENTED.** Ship as part of the userProfile target-state migration.

#### Supported Event Types (v1)

| `eventType` | Trigger in KC | klynx-api action |
|---|---|---|
| `USER_UPDATE` | any user attribute / identity / `enabled` change | upsert identity mirror in `user_profiles`; if `enabled=false` is in the payload, this also covers the disable case |
| `USER_DELETE` | KC user deleted | mark `user_profiles.enabled=false`, set `user_profiles.deletedAt=occurredAt`, leave the row in place (Decision Point P-5: "leave row + disable" — never hard-delete) |

`USER_DISABLE` is **NOT** a separate KC event. KC delivers user disable as a `USER_UPDATE` with `enabled=false`; the handler must read `enabled` from the payload and persist it.

#### Request Body

```json
{
  "eventType": "USER_UPDATE",
  "userId": "kc-user-uuid", "username": "alice", "email": "alice@example.com",
  "firstName": "Alice", "lastName": "Liddell", "enabled": true,
  "occurredAt": "2026-04-27T08:31:00Z"
}
```

For `USER_DELETE` the payload may omit identity fields except `userId`, `eventType`, `occurredAt`.

#### Behavior

- Idempotent upsert into `user_profiles` of identity fields only.
- App-level fields are never read from this payload (KC does not own them).
- Freshness key: `payload.occurredAt > user_profiles.identitySyncedAt`. If false, the event is treated as stale and skipped (`422 STALE_EVENT`). On apply, `identitySyncedAt` is set to `payload.occurredAt`. **`updatedAt` is irrelevant to this comparison.**
- For `USER_DELETE`: same freshness rule; on apply the row's `enabled` is set to `false` and `deletedAt` is set to `occurredAt`.

#### Errors

| HTTP | Code | Meaning |
|---|---|---|
| 401 | `INVALID_SIGNATURE` | HMAC mismatch |
| 415 | `UNSUPPORTED_EVENT` | `eventType` is not in the v1 supported list |
| 422 | `STALE_EVENT` | `occurredAt` not strictly greater than current `identitySyncedAt` |

### 5.11 `POST /admin/system/userProfile/repair` — admin manual re-sync (TARGET-STATE)

**Auth:** Bearer + platform `administrator` role.
**Purpose:** Operator-triggered full re-sync. Pulls all KC users, upserts identity fields into `user_profiles`, never touches app-level fields. Supports cursor pagination internally.

**NOT YET IMPLEMENTED.**

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

## 6. Kafka / Async Event Surfaces

`N/A — not in scope.` Identity sync uses an inbound HTTP webhook from KC SPI (§5.10), not Kafka.

---

## 7. MQTT / Realtime Surfaces

`N/A — not in scope.` No realtime push for profile state.

---

## 8. Redis / Cache Surfaces

`N/A — not in scope.` No cross-service cache. Internal caches (if any) are service-private.

---

## 9. Sync / Field-Ownership Surfaces

### 9.1 The Three Role Scopes (canonical naming)

The platform exposes **three distinct role concepts**, all of which have historically been carried under the bare JSON key `role`. This contract makes the naming rule explicit.

| Scope | Canonical Key | Source of Truth | Allowed Values |
|---|---|---|---|
| **Platform** — Keycloak realm role of the human (administrator vs end-user) | `platformRole` | Keycloak (`realm_access.roles[]`, mapped per profileResponse-role.md §6) | `administrator` \| `user` |
| **Organization** — Permify membership of the user inside an organization | `orgRole` | Permify tuples on `organization` entity (`owner`, `admin`, `member`) | `owner` \| `admin` \| `member` |
| **OrgUnit (OU)** — Permify membership of the user inside an OU under an organization | `ouRole` | Permify tuples on `orgUnit` entity (`admin`, `member`) | `admin` \| `member` |

> **`owner` is reserved for `orgRole`.** OUs do not have an owner concept. Platform does not have an owner concept.
>
> **`platformRole` and `orgRole` are different value spaces.** A user can be `platformRole=user` and `orgRole=admin` (a normal org admin who is not a platform-wide administrator). They MUST never be conflated in a single field.

### 9.2 Required Response Keys

| Endpoint | Path inside response | Status | Notes |
|---|---|---|---|
| `GET /users/profile` | `details.platformRole` | ✅ Shipped (PR #47) | Source: profileResponse-role.md. Legacy bare key not present here — `platformRole` is the only key |
| `PATCH /users/profile` | `details.platformRole` | ✅ Shipped (PR #47) | Same as above |
| `GET /users/{id}` | `details.user.platformRole` | ✅ Shipped (PR #55) | Mirror of `details.user.role`. Both keys populated during deprecation window |
| `GET /users/{id}` | `details.organizations[].orgRole` | ✅ Shipped (PR #55) | No legacy key — was added directly. Derivation: `IsUserOwner > IsUserAdmin > member` |
| `GET /orgs/units/{id}/members` | `details.items[].orgRole` | ✅ Shipped | Already populated — Permify org-relations enrichment in `ListMembersOfOU`. Derivation: `owner > admin > member` |
| `GET /orgs/units/{id}/members` | `details.items[].ouRole` | 🟡 **PENDING (Phase 1)** | Currently emits only the bare `role` key. MUST add `ouRole` mirror equal to existing `role` value (value-equal — OU has no owner concept). Legacy `role` stays during deprecation window |
| `GET /orgs/users/members` | `details.items[].orgRole` | 🟡 **PENDING (Phase 1)** | Currently emits only the bare `role` key. **`orgRole` MUST be derived canonically with owner-precedence (`owner > admin > member`), NOT mirrored from `role`.** The legacy `role` field collapses owner into `"admin"` for management-UI back-compat (and uses the parallel `isOwner` boolean for the actual owner relation); the canonical `orgRole` MUST NOT inherit that collapse |

### 9.3 Producer (BE) Rules

- **MUST** emit the canonical key for the scope of the value (`platformRole` / `orgRole` / `ouRole`).
- **MUST** populate the canonical key using the canonical value space (incl. `orgRole` owner-precedence `owner > admin > member`).
- **MUST NOT** introduce a new response that uses the bare key `role` — even if the field is named after a struct named `Role`. JSON tag is part of the contract.
- **MUST** keep the legacy `role` key during the deprecation window on endpoints that currently emit it, with its **existing semantics unchanged**. The canonical key may carry a value that diverges from `role` when the legacy semantics collapse two distinct relations (e.g. `GET /orgs/users/members` collapses `owner` into `"admin"` on the legacy `role`; the canonical `orgRole` must still emit `"owner"`).
- **MUST** derive the canonical key from the same Permify / Keycloak read that already feeds the legacy field. No new round-trips. Use a separate local variable for the canonical derivation — do not reuse the legacy `role` variable as the source.
- **SHOULD** place the new canonical key adjacent to the legacy `role` field in the struct definition for readability.

### 9.4 Consumer (FE) Rules

- **MUST** read the canonical key (`platformRole` / `orgRole` / `ouRole`) when present.
- **MUST NOT** read the bare `role` key on any new code path. Existing code paths that read `role` MUST be migrated to the canonical key as a follow-up; this contract does not require a hard cutover.
- **MUST NOT** copy a `role` value from one response shape into a write-side body of a different scope. The bug class fixed in §5.7 was exactly this.
- **MUST** treat the absence of the canonical key as `null`/unknown and log a warning until the BE rollout for the corresponding endpoint completes.
- **MUST** name FE state fields explicitly as `platformRole` / `orgRole` / `ouRole` — **never** the bare name `role`. This rule is also documented in `klynx-frontend/CLAUDE.md` under "Role Naming Convention".

### 9.5 Field Ownership Matrix

| Field | Authoritative Writer | Allowed Initiator | Stored In | Notes |
|---|---|---|---|---|
| `email` | Keycloak | klynx-api `usrsvc` (admin), end user via KC account console | Keycloak (canonical) + `user_profiles` (mirror in target state) | mirror updated via KC webhook or on profile read |
| `username` | Keycloak | klynx-api `usrsvc` (admin only) | Keycloak (canonical) + `user_profiles` (mirror) | not editable by end user |
| `firstName`, `lastName` | Keycloak | end user via `PATCH /users/profile` (proxied) | Keycloak (canonical) + `user_profiles` (mirror) | KC write first, then mirror |
| `enabled` | Keycloak | klynx-api admin via `usrsvc.SetUserEnabled` | Keycloak (canonical) + `user_profiles` (mirror) | mirror is informational |
| Global realm role (`administrator`) | Keycloak | klynx-api admin | Keycloak realm role | not stored in `user_profiles`. **Exposed read-only** as `platformRole` on `GET` / `PATCH /users/profile` and `GET /users/{id}` |
| Permission, org role, resource grant | Permify | klynx-api `authzsvc` | Permify | unchanged |
| `avatar` | klynx-api | end user via avatar upload (`POST /users/profile/avatar`) | Keycloak `attributes.avatar` (current state) → `user_profiles.avatar` (target state) | absolute URL only in target state — never in KC, never an S3 key |
| `department` | klynx-api | end user via `PATCH /users/profile` | KC `attributes.department` (current state) → `user_profiles.department` (target) | never in KC in target state |
| `refId` | klynx-api | not editable through `PATCH /users/profile` (immutable from this surface in v1) | KC attribute (current) → `user_profiles.refId` (target v1) | v1 has no connector-pairing semantics on this field. Field migrated from legacy KC attribute and exposed read-only on `GET`. Org-scoped pairing (with its own write surface) is a separate plan |
| `activeOrgId` (persisted UI preference) | klynx-api | end user via `PATCH /users/profile` (org switcher) | KC `attributes.activeOrgId` (current) → `user_profiles.activeOrgId` (target) | never in KC in target state, **never in JWT**. **Distinct from runtime `X-Active-Org` header** (see row below) |
| `X-Active-Org` (runtime request header) | request caller (FE) | every request that hits an org-scoped route | request only (not stored) | validated by `ActiveOrg()` middleware against Permify on every request. Authoritative for the request's permission scope. May or may not equal the persisted `user_profiles.activeOrgId` — for example a platform admin operating on a different org will set the header to that org without changing their preference |
| `preferences.perPage` / `map.lat` / `map.lng` / `map.zoomLevel` | klynx-api | end user via `PATCH /users/profile` | KC attributes (current) → `user_profiles.preferences.*` (target) | never in KC in target state |
| `extensions.<domain>.*` | klynx-api | end user / admin via `PATCH /users/profile` (per-domain validation in service) | `user_profiles.extensions.<domain>` (target) | one subdoc per domain key; fields free-form within the subdoc |
| Platform `role` attribute (`administrator` \| `user`) | Keycloak (via klynx-api) | Platform admin via `PATCH /users/{id}` body field `role` | Keycloak | |
| Org role tuple (`admin` \| `member`) | Permify (via klynx-api) | Caller with `manage` on org via `PATCH /orgs/users/{userId}` body field `role` | Permify | Owner role managed via `PromoteUserToOwner` / `DemoteUserFromOwner` (out of scope) |
| `OUMember.ouRole` | Permify (`orgUnit#admin` / `orgUnit#member` tuples) | n/a (read-only projection) | not persisted | runtime mirror of `OUMember.role` (value-equal — OU has no owner concept) |
| `OrgMember.orgRole` | Permify (`organization#{owner,admin,member}` tuples) | n/a (read-only projection) | not persisted | runtime canonical projection — **derived independently with `owner > admin > member` precedence**, not a mirror of `OrgMember.role`. Diverges from legacy `role` for owner users |

### 9.6 JWT Claim Deny-List (locked)

The following MUST NOT appear as JWT claims and MUST NOT be mapped from Keycloak attributes:

- `activeOrgId`
- `permission` / `permissions` (any form)
- `map_lat`, `map_lng`, `zoomLevel`
- `perPage`
- `avatar`
- `department`
- `refId`

### 9.7 Conflict Resolution

- **Identity field conflict** (KC and `user_profiles` disagree, target state): KC wins. `user_profiles` identity mirror is overwritten on next read, webhook, or repair.
- **App-level field conflict** (multiple writers, target state): not possible — only `user_profiles` writes app-level fields.
- **Identity edit echo-loop prevention** (target state): `PATCH /users/profile` writes to KC first, then to Mongo with the response from KC, advancing `identitySyncedAt` to the KC response timestamp. The KC webhook will fire for the same change; the webhook handler dedupes via `payload.occurredAt > user_profiles.identitySyncedAt` — equal or older events are skipped (`422 STALE_EVENT`). **`updatedAt` is intentionally NOT used here** because app-level writes also bump it.
- **`activeOrgId` (persisted) vs `X-Active-Org` (runtime)**: not a conflict — they are different concepts. The header always wins for the current request's permission scope. The persisted value is updated only when the user explicitly switches their default org via `PATCH /users/profile`.
- **Two role fields (`platformRole` vs `orgRole`)**: live in different stores (Keycloak vs Permify) and are written through different endpoints. There is no overlap and no conflict resolution needed once the FE follows this contract. Mixed-payload side-effect in §5.7 documents the legacy coupling — FE works around it by keeping the body to `{role}` only.
- **The OU listing pair (`OUMember.role` ↔ `OUMember.ouRole`)**: MUST be derived from the same loop-local variable — value-equal by construction.
- **The org listing pair (`OrgMember.role` ↔ `OrgMember.orgRole`)**: MUST be derived from the same Permify read but via separate code paths: `role` keeps its current collapse logic (`orgListMembers.go:172-176`), `orgRole` uses canonical precedence on the same `ownerSet`/`adminSet` already in scope at the construction site. This divergence is **by design**.

---

## 10. User List Table FE Display Surface

Records what columns the user list table at `/systemUsers/users` renders, and the matching Excel export shape, so future maintainers know the displayed surface is intentional and not a regression. The underlying user data API at `/admin/users` (klynx-api) is unaffected — the row payload still contains `phone`, it is simply not rendered.

### 10.1 Displayed columns (table)

| Column | Source field |
|---|---|
| ลำดับ | derived row index |
| Avatar / fullname | `firstName + lastName` (Keycloak), `avatar` (KC `attributes.avatar` current state / `user_profiles.avatar` target) |
| Username | `username` (Keycloak) |
| Email | `email` (Keycloak) |
| Status | `enabled` (Keycloak) |
| Role | `role` (Permify global realm role) |
| Created at | `createdAt` (Keycloak) |
| Action | inline edit / delete buttons |

### 10.2 Excel export columns

`exportToExcel` in `app/pages/systemUsers/users/index.vue` mirrors the table columns above. The export sheet does **not** include `phone`.

### 10.3 Notes

- rev 1 (2026-04-27): removed `phone` column from the user list table and matching Excel export (`เบอร์โทร`). Reason: product decision — phone was shown in the table but is not a routine identifier in this product, and was cluttering the row width on smaller screens. The `phone` field still exists in the user data model (Keycloak attribute) and the row payload returned by the API; FE simply does not render it. **If phone needs to come back later, re-add the column definition only — no API change required.**
- This is an FE-display-only contract (Lite tier — no API surface change). Documented here so the column set is intentional and not a regression.

---

## 11. Frontend Integration Notes

### Required FE Inputs

| FE Use Case | Contract Surface | Required Fields | Notes |
|---|---|---|---|
| Header / nav (user menu, avatar) | `GET /users/profile` | `username`, `firstName`, `lastName`, `avatar` | replace any reads of `${profile.attributes.avatar}` from JWT |
| Org switcher | `GET /users/profile` (read), `PATCH /users/profile` (write) | `activeOrgId` | stop reading from JWT claim; this field MUST NOT be in JWT. FE writes this when user picks a default org; FE then sends that value as `X-Active-Org` on subsequent requests |
| Map page initial state | `GET /users/profile` | `preferences.map.lat`, `preferences.map.lng`, `preferences.map.zoomLevel` (target state) / `mapLocation`, `zoomLevel` (current state) | stop reading from `${profile.attributes.map_lat}` JWT mapper |
| Settings → preferences | `PATCH /users/profile` | preference fields, `department` | partial update only |
| Profile edit | `PATCH /users/profile` | `firstName`, `lastName` | identity edit; backend handles KC write |
| Station extension UI (Phibek, target state) | `GET /users/profile`, `PATCH /users/profile` | `extensions.station.stationCode`, `extensions.station.stationName`, `extensions.station.position` | rendered only when `extensions.station` is present |
| Load edit user screen | `GET /users/{id}` | `details.user.*`, `details.user.platformRole`, `details.organizations[].orgRole` | `orgRole` and `platformRole` mirror are required additive fields (PR #55 shipped) |
| Save profile (no avatar change) | `PATCH /users/{id}` | `firstName`, `lastName`, `email`, `role` (platform), `locale`, `enabled` | Strip `username`, `avatar`, password fields |
| Save profile + new avatar | `PATCH /users/{id}/profile` (multipart) **then** `PATCH /users/{id}` (JSON for non-profile fields) | per endpoint | Two calls when avatar changes — but FE optimization: skip second call if only avatar + name changed |
| Add user to org with role | `PATCH /orgs/users/{userId}` + `X-Active-Org: <orgId>` | `role: "admin" \| "member"` | Body must contain ONLY `role` |
| Change existing member's org role | `PATCH /orgs/users/{userId}` + `X-Active-Org: <orgId>` | `role: "admin" \| "member"` | Same endpoint as add — BE auto-detects membership |
| OU members tab | `GET /orgs/units/{id}/members` | `details.items[].ouRole`, `details.items[].orgRole` | `ouRole` is the new canonical key for this listing's primary role |
| Org members tab | `GET /orgs/users/members` | `details.items[].orgRole`, plus `isOwner` / `isAdmin` / `isBillingOwner` boolean flags as today | `orgRole` is the new canonical key for this listing's primary role; covers owner/admin/member without needing isOwner branching |

### Active-org header rule (locked)

- `X-Active-Org` continues to be a **required** request header on every org-scoped route. `ActiveOrg()` middleware behavior is unchanged: missing header → `400`; header present but not validated by Permify → `403`.
- `user_profiles.activeOrgId` (target state) is a **persisted UI preference**, not a fallback for the header. The backend will not silently fill a missing `X-Active-Org` from the stored profile. FE must keep sending the header.
- FE flow on app load: `GET /users/profile` → read `activeOrgId` → use it to populate the org switcher selection and to set `X-Active-Org` on subsequent requests.
- FE flow on org switch: user picks a different org → FE sends `PATCH /users/profile { activeOrgId: <new> }` and updates its in-memory `X-Active-Org` value to the new org. The two writes serve different purposes (persistence vs. immediate request scope).
- A platform admin operating across orgs may legitimately have `X-Active-Org` ≠ `user_profiles.activeOrgId`. This is intentional — the persisted field is a default, not a constraint.

### FE Guardrails (ALL surfaces)

- Do not read `${profile.attributes.X}` from JWT for any of the deny-listed fields in §9.6 — those mappers will be removed from the realm in target state.
- Do not invent new top-level profile fields. New domain-specific fields go under `extensions.<domain>.*` (target state) and require a contract update before FE renders them.
- **MUST NOT** name FE state fields with the bare name `role`. Always pick the scope-qualified name (`platformRole` / `orgRole` / `ouRole`).
- **MUST NOT** copy a `role` value from one listing into a write-side request body of a different scope.
- **MUST NOT** rely on the absence of a canonical key to mean a default value (e.g. `"member"`). Treat missing as `null` until BE rollout completes.
- **MUST NOT** send platform role values (`administrator` / `user`) in the `role` field of `PATCH /orgs/users/{userId}`.
- **MUST NOT** send profile fields (`firstName`, `lastName`, `email`, `locale`, `enabled`, `avatar`) in the body of `PATCH /orgs/users/{userId}` from the user-edit screen.
- **MUST** keep `X-Active-Org` auto-injection enabled on the `useApi` composable; BE ignores it on `PATCH /users/{id}` and `PATCH /users/{id}/profile`.
- Treat documented error codes as the only supported error contract.

---

## 12. Rollout Notes

### Current state (Phase 0) — shipped pieces

| Repo | Item | Status | Notes |
|---|---|---|---|
| `klynx-api` | profileAvatarUpdate rev 3.1 (`PATCH /users/profile` GET-merge-PUT + `PATCH /users/{id}/profile` admin endpoint with 2 distinct 403 messages + audit middleware) | ✅ Shipped | Current Keycloak-as-profile-store implementation |
| `klynx-api` | profileResponse-role (`details.platformRole` on `/users/profile`) | ✅ Shipped (PR #47) | `platformRole` canonical |
| `klynx-api` | user-org-role-edit Phase 2 (`details.user.platformRole` mirror + `details.organizations[].orgRole` per-membership on `GET /users/{id}`) | ✅ Shipped (PR #55, 4.2.0) | Both keys populated during deprecation cycle |
| `klynx-api` | role-naming-convention Phase 1 (additive `ouRole` + `orgRole` mirrors on `GET /orgs/units/{id}/members` + `GET /orgs/users/members`) | 🟡 **PENDING** | `4.2.2 → 4.3.0` planned — additive, no consumer breaks |
| `klynx-feature` | edit-user page Track A (stop sending profile fields & platform role to `/orgs/users/{id}`; switch profile updates to `PATCH /users/{id}` + `PATCH /users/{id}/profile`) | 🟡 In progress | Bug fixed at end of Track A |
| `klynx-feature` | edit-user page Track B (per-org role editor; switch reads from `details.user.role` to `details.user.platformRole`) | 🟡 Pending | Gated on PR #55 BE additive — both available |

### Target state — userProfile.md migration (NOT YET IMPLEMENTED)

| Repo | Item | Status |
|---|---|---|
| `klynx-api` | new `userprofilerepo`, `userprofilesvc`, refactored `usrsvc` | 📋 Planned |
| `klynx-api` | KC realm export update (remove deny-listed mappers per §9.6) | 📋 Planned |
| `klynx-api` | KC event listener SPI + `POST /webhooks/keycloak/userUpdated` handler | 📋 Planned |
| `klynx-api` | `POST /admin/system/userProfile/repair` admin endpoint | 📋 Planned |
| `klynx-feature` | new client against target `/users/profile` envelope (nested `preferences` + `extensions`) | 📋 Planned (lockstep with klynx-api migration) |

### Phase 3 (deferred) — legacy `role` deprecation

| Repo | Item | Required Before |
|---|---|---|
| `klynx-api` | retire legacy `role` from `GET /orgs/users/members`, `GET /orgs/units/{id}/members`, `details.user.role` from `GET /users/{id}` | After ALL FE consumers across `klynx-feature` have switched to canonical `orgRole` / `ouRole` / `platformRole` |
| Coordinated with | user-org-role-edit Phase 4 — `details.user.role` removal from supersede plan | (deferred) |

### Rollout Order

1. **Phase 0 (FE-only, no BE block) — DONE:** klynx-frontend Track A switches profile updates to `PATCH /users/{id}` + `PATCH /users/{id}/profile`; adds UI for org role choice when adding a NEW org. Bug fixed.
2. **Phase 1 (BE additive, single PR) — PENDING:** klynx-api adds (a) `ouRole` mirror to `GET /orgs/units/{id}/members`, (b) `orgRole` canonical with owner-precedence to `GET /orgs/users/members`, (c) optional 1-line `httputil.MessageOK` switch on `PATCH /users/{id}`. All additive — no consumer breaks. version.go bumps `4.2.2 → 4.3.0`.
3. **Phase 2 (FE consumer switch):** klynx-feature swaps two read sites to canonical keys (OU members tab → `ouRole`; org members tab → `orgRole`). Independent PR. No BE change required.
4. **Phase 3 (BE deprecation, deferred):** once Phase 2 has landed and observability confirms no consumer reads bare `role`, retire it from these two responses (and `details.user.role` from `GET /users/{id}` together).
5. **Phase 4 (target-state migration, deferred):** userProfile.md target state — KC mappers removed; `user_profiles` collection live; webhook + admin repair shipped; FE deployed in lockstep against new envelope.

### Backward Compatibility (rollout-aware)

- Phase 0-2: fully additive. Old FE that reads `role` keeps working.
- Phase 3: breaking on the legacy `role` key — requires Phase 2 confirmed shipped on every FE consumer first. Separate plan + Codex review will gate it.
- Phase 4: breaking on `GET /users/profile` envelope shape — FE deployed in lockstep.

---

## 13. Examples

### 13.1 Edit screen mount — read user with org roles

```http
GET /users/6078c979-6038-48e6-ad89-a5aea202df70
Authorization: Bearer <jwt>
X-Active-Org: f1...
```

```json
{
  "code": "SUCCESS", "status": true, "message": "ok",
  "details": {
    "user": {
      "id": "6078c979-...", "username": "aliz",
      "firstName": "aliz", "lastName": "pd", "email": "aliz@hotmail.com",
      "role": "user", "platformRole": "user",
      "locale": "en", "enabled": true,
      "avatar": "users/6078c979.../avatar.png"
    },
    "organizations": [
      { "orgId": "f1...", "name": "Org Alpha", "isActive": true,  "orgRole": "admin"  },
      { "orgId": "f2...", "name": "Org Beta",  "isActive": false, "orgRole": "member" }
    ]
  }
}
```

### 13.2 Save lastName-only edit (the bug scenario, fixed)

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

Org role for "Org Alpha" remains `admin` because the org-membership endpoint is not called.

### 13.3 Add user into "Org Gamma" as admin (new org with role)

```http
PATCH /orgs/users/6078c979-...
Authorization: Bearer <jwt>
X-Active-Org: f3...        <-- the org being added to
Content-Type: application/json

{ "role": "admin" }
```

```json
{
  "code": "SUCCESS", "status": true, "message": "member updated",
  "details": { "userId": "6078c979-...", "role": "admin" }
}
```

### 13.4 Save with avatar change

Two calls, in this order, **only when fields outside `firstName` / `lastName` have changed alongside the avatar**:

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

> **FE optimization — skip the second call when only the avatar (and optionally `firstName` / `lastName`) changed.** The `/users/{id}/profile` endpoint already accepts `firstName` and `lastName` in its multipart body, so a pure avatar (or avatar + name) edit needs **one** call, not two. FE should compare the form's submit payload against the originally loaded values and skip the JSON call if no field outside the `/profile` endpoint's accepted set has changed. This halves traffic on the most common admin save path and removes the race window between the two writes.

### 13.5 Org members tab — owner case explicit (Phase 1 PENDING)

```jsonc
// Single user who is org owner. FE rendering a "Role" column:
{
  "userId": "...",
  "role": "admin",       // ← legacy collapse (owner → "admin")
  "orgRole": "owner",    // ← canonical, what FE should display
  "isOwner": true,
  "isAdmin": false       // ← false! "admin" relation is not implied by "owner"
}
```

```ts
// ✅ Render label
const label = member.orgRole; // "owner" — correct

// ❌ Broken — would render "admin" for an owner
const wrongLabel = member.role;
```

**Why `orgRole` replaces the `role` + `isOwner` pairing.** Pre-contract, FE had to do `const role = member.isOwner ? "owner" : member.role` to recover the canonical three-value role. With the canonical `orgRole`, the BE does this derivation once on the server using owner-precedence and emits the result directly. FE SHOULD NOT carry the legacy pair forward into new code.

### 13.6 OU members — old vs new

```ts
// ❌ Will break in Phase 3 (legacy key removed)
const role = member.role;

// ✅ Canonical key
const ouRole = member.ouRole;
const orgRole = member.orgRole; // separate scope, separate value space
```

### 13.7 Self profile read (current state)

```http
GET /users/profile
Authorization: Bearer <jwt>
```

Response: see §5.1 current-state example.

### 13.8 Self profile write — preferences only (target state, NOT YET SHIPPED)

```http
PATCH /users/profile
Authorization: Bearer <jwt>
Content-Type: application/json

{ "preferences": { "perPage": 50, "map": { "lat": 13.7563, "lng": 100.5018, "zoomLevel": 14 } } }
```

### 13.9 Self profile write — org switch (target state)

```http
PATCH /users/profile
{ "activeOrgId": "org-7f3e" }
```

### 13.10 KC webhook — USER_UPDATE (target state)

```json
{
  "eventType": "USER_UPDATE",
  "userId": "kc-user-uuid",
  "username": "alice", "email": "alice@example.com",
  "firstName": "Alice", "lastName": "Liddell", "enabled": true,
  "occurredAt": "2026-04-27T08:31:00Z"
}
```

Idempotent upsert; freshness rule `payload.occurredAt > user_profiles.identitySyncedAt` enforced.

### 13.11 Admin manual repair (target state)

```http
POST /admin/system/userProfile/repair
{ "dryRun": false }
```

```json
{
  "code": "SUCCESS",
  "details": {
    "totalKcUsers": 412, "profilesUpserted": 410,
    "profilesCreated": 8, "profilesSkipped": 2,
    "errors": []
  }
}
```

---

## 14. Out of Scope (Not in This Contract)

- Org-create policy gate (`POST /orgs`) — covered by `org-lifecycle.md`.
- Member cleanup with OU cascade (`PATCH /orgs/users/remove`) — covered by `org-lifecycle.md` §5.8.
- Permission profile camera/edge/member grants — covered by `permission-profile.md`.
- Password change endpoint — separate flow.
- User invite / signup flow — separate KC-driven flow.
- Connector pairing refId (org-scoped, singleUse / multiUse / expiresAt / requireApproval) — future plan.
- User inactivity notifications — sibling Active Draft (`userInactivityNotification.md`).
- Promote/demote owner (`PromoteUserToOwner` / `DemoteUserFromOwner`) — out of scope here.

---

## 15. Decisions (preserved verbatim from source contracts)

**userProfile.md (target):**
- P-1: v1 = `user_profiles.refId` carry-over only; org-scoped pairing deferred.
- P-4: `avatar` always absolute URL.
- P-5: `USER_DELETE` → leave row + disable, never hard-delete.
- Identity sync freshness key dedicated (`identitySyncedAt`), not `updatedAt`.
- `X-Active-Org` runtime semantics preserved; `user_profiles.activeOrgId` is UI preference only.
- Webhook scope: `USER_UPDATE` (incl. disable via `enabled=false`) and `USER_DELETE`. `USER_DISABLE` is NOT a separate KC event.

**profileAvatarUpdate (rev 3.1):**
- Auth gate enforced in controller (NOT `RequireRoles` middleware) — required for two distinct 403 messages.
- Per-route `middleware.Audit(...)` attached after controller's role check; admin block parity preserved.
- `avatar` stays in `attributes.avatar` until `userProfile-store` ships.
- Empty omission = preserve. No convention for explicit clearing through these endpoints.

**user-org-role-edit:**
- `details.user.platformRole` mirror added (PR #55) to align with profileResponse-role.md.
- `OrgSummary.OrgRole` derived independently from Permify (`IsUserOwner > IsUserAdmin > member`).
- Mixed-payload side-effect documented inline; FE works around by keeping `PATCH /orgs/users/{userId}` body to `{role}` only.

**role-naming-convention (rev 2):**
- Canonical ≠ mirror — `GET /orgs/users/members.orgRole` MAY diverge from legacy `role` for owner users.
- Owner-precedence rule: `owner > admin > member` everywhere `orgRole` appears.
- Legacy `role` retains existing semantics during deprecation window.
- FE state fields MUST use scope-qualified names (`platformRole` / `orgRole` / `ouRole`).

**userTableSurface:**
- `phone` removed from FE table + Excel export; field still exists in API row payload.

---

## 16. Implementation evidence

| Surface | File | Note |
|---|---|---|
| `PATCH /users/profile` GET-merge-PUT | `internal/services/usrsvc/manage.go` (`mergeKeycloakUserPayload`) | pure helper extracted; 5 unit tests in `manage_test.go` |
| `PATCH /users/{id}/profile` admin | [controllers/usrapi/profile.go](../../controllers/usrapi/profile.go) (`AdminUpdateProfile`) | explicit platform-admin check inside controller; 2 distinct 403 messages |
| `internal/services/usrsvc/profile.go` (`AdminUpdateProfile`) | thin wrapper | per-route `middleware.Audit(...)` attached |
| `PATCH /users/{id}` | `controllers/usrapi/update.go` (`UpdateUser`) | `RequireRoles(["administrator"])` middleware |
| `GET /users/{id}` | `controllers/usrapi/getById.go` (`GetByID`) | `details.user.platformRole` + `details.organizations[].orgRole` populated (PR #55) |
| `OrgSummary.OrgRole` field | `internal/services/authzsvc/org.go:218` | derived from `IsUserOwner > IsUserAdmin > member` |
| `OrganizationService.List` projection | `internal/services/authzsvc/org.go:287` | populates `OrgRole` per-org |
| `IsUserOwner`, `IsUserAdmin` | `internal/services/authzsvc/orgValidation.go:33,52` | reused from `UpdateMember` |
| `OUMember.Role`, `OrgMember.Role` | `internal/services/authzsvc/orgUnitMembers.go:34`, `orgListMembers.go:16` | structs to extend with `OURole` / `OrgRole` (Phase 1 PENDING) |
| `OrgMember.Username` field | `internal/services/authzsvc/orgListMembers.go:185-191` | profile-map loop reads `UserProfile.Username` |
| Mixed-payload side effect | `controllers/authzapi/orgUpdateMember.go:96-112,148-155` | documented in §5.7; deferred BE cleanup |
| Tests | `controllers/usrapi/manage_test.go`, `controllers/authzapi/...`, `internal/services/authzsvc/orgValidation_test.go` | full `go test ./...` ✅ |

---

## 17. Checklist

- [x] Domain / flow boundary explicit (§0 — 11 REST surfaces + sync flow + FE display surface; explicit excludes for org policy, member cleanup, permission profile, password, signup, connector refId, inactivity, owner promote/demote).
- [x] Owner backend explicit (`klynx-api`).
- [x] System of record per domain (KC for identity + global role; Permify for org/OU role + permission; klynx-api S3 for avatar binary; KC `attributes.*` current state for app-level; future `user_profiles` for app-level).
- [x] Canonical store and projection store documented.
- [x] Producers and consumers listed for every surface in scope (10 REST + 1 webhook + 1 admin + FE display + sync flow).
- [x] REST request, response, and error contracts defined for all surfaces (full error matrices preserved verbatim, current state + target state).
- [x] GET-merge-PUT pattern for self/admin profile preserved.
- [x] Two distinct 403 messages on `/users/{id}/profile` preserved verbatim.
- [x] Audit middleware attachment requirement preserved.
- [x] 4-endpoint role separation preserved (profile vs avatar+identity vs platform role vs org role).
- [x] Mixed-payload side-effect documented inline.
- [x] 3 role scopes + canonical naming + owner-precedence rule preserved verbatim.
- [x] Canonical-vs-legacy divergence on `GET /orgs/users/members.orgRole` preserved.
- [x] ouRole value-equal mirror rule preserved (no owner concept on OUs).
- [x] JWT claim deny-list preserved.
- [x] Identity sync freshness key (`identitySyncedAt`, NOT `updatedAt`) preserved.
- [x] `activeOrgId` (persisted UI preference) vs `X-Active-Org` (runtime header) distinction preserved.
- [x] KC webhook scope (`USER_UPDATE` covers disable; `USER_DELETE` separate; `USER_DISABLE` NOT a separate event) preserved.
- [x] FE display surface (`/systemUsers/users` table + Excel) preserved (8 columns, no `phone`).
- [x] Field ownership matrix preserved (current state + target state).
- [x] Conflict resolution preserved (KC wins on identity; Permify wins on roles; identity edit echo-loop prevention; both role pairs derivation rules).
- [x] Kafka N/A — explained.
- [x] MQTT N/A — explained.
- [x] Redis N/A — explained.
- [x] Backward compatibility documented per phase (additive Phase 0-2; breaking Phase 3 + 4 with explicit gates).
- [x] Replay / re-sync behavior documented (KC webhook idempotent + freshness; admin repair full re-sync; direct user-driven REST not replay-based).
- [x] FE field mapping included (current state + target state + role mirrors).
- [x] Active-org header rule preserved.
- [x] FE Guardrails preserved (deny-list + role naming + bug-class avoidance).
- [x] Examples cover edit screen mount, lastName-only fix, add-to-org, avatar+identity save, owner case explicit, OU members migration, target-state webhook, target-state admin repair.
- [x] Decisions (P-1, P-4, P-5; rev 3.1 auth gate; user-org-role-edit Phase 2 BE; canonical ≠ mirror) preserved verbatim.
- [x] Implementation evidence table preserved.
