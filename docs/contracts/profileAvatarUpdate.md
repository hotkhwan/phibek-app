# Profile Avatar Update Contract

**Date:** 2026-04-27
**Status:** Superseded by [`user-profile-and-roles.md`](./user-profile-and-roles.md) on 2026-05-04 — current-state Keycloak-as-profile-store implementation (rev 3.1) merged with target-state Mongo migration, role-naming canonical, user-org-role-edit, and FE display surface into one User Profile + Roles lifecycle contract per the new domain/flow grouping rule (`docs/contracts/README.md`). All rev 3.1 implementation behavior preserved verbatim in §5.1-5.5 / §13.4 of the merged contract: GET-merge-PUT pattern for both `PATCH /users/profile` (self) and `PATCH /users/{id}/profile` (admin) — preserves unsent identity fields (notably `email`); deep-merge of attributes map preserves all unrelated entries; Keycloak's `[]string` shape coercion; controller-level platform-admin check (NOT `RequireRoles` middleware) producing two distinct 403 messages (`admin profile update requires platform administrator role` vs `use PATCH /users/profile for self profile update`); per-route `middleware.Audit(...)` attachment for parity with adjacent admin user-management endpoints; "no Keycloak write at all when neither identity nor attribute changes supplied" optimization; rev 3.1 §9 migration arrow to target-state preserved (avatar migrates KC `attributes.avatar` → `user_profiles.avatar` when userProfile-store ships). Body kept here for PR / Codex review history.
**Owner Backend:** `klynx-api`
**Related Plan:** [docs/plan/profileAvatarUpdate.md](../plan/profileAvatarUpdate.md)
**Cites:**
- [docs/contracts/userProfile.md](userProfile.md) — **target-state** canonical contract; **NOT yet implemented**. v1 explicitly does not depend on it. Tracked in §9.
**Applies To Repos:** `klynx-api`, `klynx-feature`
**Contract Type:** REST
**Version:** v1 (current-state — Keycloak as profile store)

---

## 1. Purpose

Defines the two endpoints affected by this fix in the **current** Keycloak-as-profile-store implementation:

1. `PATCH /users/profile` — self profile update (existing). Surface unchanged. The internal write is upgraded from full-replace PUT to GET-merge-PUT so unsent identity fields (notably `email`) are preserved.
2. `PATCH /users/:id/profile` — **new** admin profile update. Platform-administrator-only; mirrors the self endpoint's request shape but targets `:id`.

Avatar in v1 is written to **Keycloak `attributes.avatar`**, exactly as the current code does. The future migration to `user_profiles.avatar` (per [userProfile.md](userProfile.md)) is its own plan. Until that ships, this contract is authoritative for avatar writes.

---

## 2. Ownership

### Owner Backend

- `klynx-api`

### Domain System of Record (v1)

| Domain | System of Record | Canonical Store | Notes |
|---|---|---|---|
| Identity (`email`, `username`, `firstName`, `lastName`, `enabled`) | Keycloak | realm user representation | Authoritative |
| Avatar (v1) | Keycloak | `attributes.avatar` (object key into MinIO) | **v1 only — migrates to `user_profiles.avatar` when [userProfile-store](../plan/userProfile-store.md) ships** |
| Other app-level (locale, mapLocation, zoomLevel, perPage, department, activeOrgId) | Keycloak | `attributes.*` | **v1 only — same migration target as avatar** |
| Realm role | Keycloak | realm role mapping | Read-only by these endpoints |

### Producer / Consumers

| Surface | Producer (caller) | Handler |
|---|---|---|
| `PATCH /users/profile` | authenticated user | `usrapi.UpdateProfile` (existing, refactored) |
| `PATCH /users/:id/profile` | platform administrator | `usrapi.AdminUpdateProfile` (new) |

### Projection Stores

- None.

---

## 3. Compatibility and Policy

- **Backward compatibility — `PATCH /users/profile`:** non-breaking for callers. Request and response shape are unchanged. The behavioral change ("fields you didn't supply are now preserved instead of being cleared") restores intended semantics — there is no FE callsite that depended on the prior data-loss behavior.
- **Backward compatibility — `PATCH /users/:id/profile`:** additive (new endpoint).
- **Re-sync / replay:** not applicable — direct user-driven writes.
- **Write authority:** unchanged. Keycloak owns identity. Avatar is **temporarily** stored in Keycloak (v1) and migrates per §9.

---

## 4. Surface Summary

| Type | Path | Method | Auth | Audit |
|---|---|---|---|---|
| REST | `/users/profile` | `PATCH` | `Bearer` (any authenticated) | not applicable |
| REST | `/users/:id/profile` | `PATCH` (multipart) | `Bearer` + **explicit platform administrator check in handler** (not via `RequireRoles` middleware — see §7 for the rationale) | per-route `middleware.Audit(...)` attached on the route registration; audits successful admin calls and any controller-level rejection |

---

## 5. Request shape (both endpoints — multipart/form-data)

| Field | Type | Owner store (v1) | Behavior when missing |
|---|---|---|---|
| `firstName` | string | Keycloak top-level | preserved |
| `lastName` | string | Keycloak top-level | preserved |
| `email` | string | Keycloak top-level | preserved |
| `locale` | string | Keycloak `attributes.locale` | preserved |
| `mapLocation` (`lat`, `lng`) | string fields | Keycloak `attributes.mapLocation` | preserved |
| `zoomLevel` | string | Keycloak `attributes.zoomLevel` | preserved |
| `perPage` | string | Keycloak `attributes.perPage` | preserved |
| `department` | string | Keycloak `attributes.department` | preserved |
| `activeOrgId` | string | Keycloak `attributes.activeOrgId` | preserved |
| `avatar` | file | uploaded to MinIO; key written to Keycloak `attributes.avatar` | preserved |

The contract guarantees that **any field not present in the request is not modified in Keycloak**. Empty omission = preserve. There is no convention for explicit clearing through these endpoints.

---

## 6. Behavior — GET-merge-PUT

For both endpoints, the service layer executes:

1. If `avatar` is present, upload to MinIO via the existing helper → object key.
2. `GET /admin/realms/{realm}/users/{targetUserId}` from Keycloak — full current representation (top-level + attributes map).
3. Build merged map:
   - **Top-level identity** (`email`, `firstName`, `lastName`, `username`, `enabled`): override only when the caller supplied a non-nil value.
   - **`attributes` map**: deep-merge entry-by-entry. Caller keys (including `avatar` from step 1) overwrite; all other entries preserved exactly. Caller scalar values are coerced to Keycloak's `[]string` shape.
4. If neither identity nor attribute changes were supplied → no Keycloak write at all; return current profile via `GetUserProfile`.
5. Otherwise → `PUT /admin/realms/{realm}/users/{targetUserId}` with the merged representation.

This is the canonical safe-update pattern for Keycloak's PUT-based admin REST API. Any klynx-api flow that updates an existing Keycloak user representation MUST follow it.

---

## 7. Auth gating — `PATCH /users/:id/profile` (locked)

### 7.1 Outcome matrix

| Caller | Outcome | HTTP | Code | `message` (exact, contractual) |
|---|---|---|---|---|
| Platform `administrator` | success | 200 | `SUCCESS` | per response body |
| `administrator-tenant` (org-admin) | reject | 403 | `FORBIDDEN` | `admin profile update requires platform administrator role` |
| Authenticated non-admin user, `:id == self` | reject | 403 | `FORBIDDEN` | `use PATCH /users/profile for self profile update` |
| Authenticated non-admin user, `:id != self` | reject | 403 | `FORBIDDEN` | `admin profile update requires platform administrator role` |

The two distinct 403 message strings are part of the contract — FE may parse them to disambiguate. They MUST be returned literally; no rewording, no localization at the API layer (FE owns localization on top).

### 7.2 How the gate is enforced (contract requirement)

The gate **MUST be implemented in the controller**, not in route-level `RequireRoles` middleware. Reason: the contract requires two distinct 403 message strings (admin-required vs use-/users/profile), which a single middleware-rejection point cannot produce. Implementations that try to use `RequireRoles` will collapse the two cases into one message and break this contract.

Required implementation:

1. The route is registered **outside** any admin-role middleware group, so the controller is reached for every authenticated caller (admin or not).
2. The controller reads `c.Locals("platformRole")` and `c.Locals("userId")` (both populated by `AuthBearer()` upstream) and applies the matrix above. The non-admin self case (`platformRole != "administrator" AND :id == userId`) returns the use-/users/profile message; all other non-admin cases return the platform-admin-required message.

### 7.3 Audit coverage requirement

Because §7.2 puts the route outside the admin-role middleware group, the route does **not** automatically inherit the admin block's `middleware.Audit(...)`. To preserve audit equivalence with adjacent admin user-management endpoints (`PATCH /users/:id`, `DELETE /users/:id`, etc.), implementations MUST attach `middleware.Audit(...)` per-route on `/users/:id/profile`.

Audit middleware is attached **after** the controller's role check returns success-or-controller-reject — semantics match the existing admin block (middleware-rejected requests are not audited; controller-handled requests, success or 403, follow the audit middleware's normal behavior).

---

## 8. Response

### 8.1 Success — `200 OK` (both endpoints)

```json
{
  "code": "SUCCESS",
  "status": true,
  "message": "profile updated successfully",
  "details": {
    "id": "<userId>",
    "username": "...",
    "email": "...",
    "firstName": "...",
    "lastName": "...",
    "locale": "...",
    "avatar": "/files/profile/<objectKey>",
    "mapLocation": { "lat": "...", "lng": "..." },
    "zoomLevel": 1,
    "perPage": 10,
    "department": "...",
    "activeOrgId": "..."
  }
}
```

The `details` shape mirrors `usrmod.ProfileResponse` from `mapRawToProfile` and is identical for both endpoints.

### 8.2 Errors

| Status | Code | When |
|---|---|---|
| `400` | `INVALID_REQUEST` | malformed multipart, unsupported avatar mime, oversized avatar |
| `401` | `UNAUTHORIZED` | missing/invalid bearer |
| `403` | `FORBIDDEN` | per §7 (exact message strings) |
| `404` | `USER_NOT_FOUND` | `:id` does not exist in Keycloak |
| `502` | `KEYCLOAK_UNAVAILABLE` | Keycloak GET or PUT failed |
| `502` | `STORAGE_UNAVAILABLE` | MinIO upload failed |
| `500` | `INTERNAL_SERVER_ERROR` | unexpected |

---

## 9. Transition — when `userProfile-store.md` ships

This contract is **v1, current-state**. When the canonical user-profile migration plan [userProfile-store.md](../plan/userProfile-store.md) ships and `userprofilerepo` becomes available:

1. **Avatar writer migrates** from `attributes.avatar` (Keycloak) to `user_profiles.avatar` (Mongo) for both endpoints. The merge-then-PUT helper stops including avatar in the Keycloak attribute merge.
2. **Other app-level fields** (locale, mapLocation, zoomLevel, perPage, department, activeOrgId) similarly migrate to `user_profiles.*` per [userProfile.md §8](userProfile.md).
3. **Merge-then-PUT scope narrows** to identity fields only (email, firstName, lastName, username, enabled).
4. **`PATCH /users/:id/profile`** MAY be replaced by canonical-aligned endpoints (`POST /users/profile/avatar` self, `POST /admin/users/:id/avatar` admin) at that time. Until then, this contract's `:id/profile` endpoint is the only admin avatar path.
5. A successor contract revision (or replacement) will track the migration with `Supersedes: profileAvatarUpdate.md (rev 3)`. Until that revision lands, **rev 3 is authoritative**.

---

## 10. Revision history

- **rev 1 (2026-04-27):** initial — proposed `PATCH /users/:id/profile` and merge-then-PUT framing; assumed canonical user-data split was implemented.
- **rev 2 (2026-04-27):** Codex review applied — reframed against canonical `userProfile.md` (split avatar to `user_profiles`, switched admin endpoint to `POST /admin/users/:id/avatar`, locked auth policy with explicit 403 messages).
- **rev 3 (2026-04-27):** Codex blocker resolved on canonical-vs-current-state — `userProfile.md` and `userProfile-store.md` are still Draft; `userprofilerepo` does not exist in the codebase. v1 must implement against current state (Keycloak attributes). This revision targets the actual production code: avatar stays in `attributes.avatar`, admin endpoint reverts to `PATCH /users/:id/profile` (no `/admin/users/...` group exists). Auth message strings carried over from rev 2 verbatim. §9 captures the migration target so the future plan inherits the contract as-is.
- **rev 3.1 (2026-04-27):** Codex blocker resolved on auth/route inconsistency — rev 3 simultaneously claimed the route was both inside the admin-role middleware group and gated by the handler. Locked one model: route lives outside the admin-role group; controller performs an explicit platform-admin check (so two distinct 403 messages are producible); per-route `middleware.Audit(...)` is attached so successful platform-admin calls remain audited at parity with adjacent admin user-management endpoints. Surface summary §4 updated with the audit column. §7 split into 7.1 (matrix), 7.2 (handler-enforcement requirement), 7.3 (audit coverage requirement). Same overall scope as rev 3 — only the implementation contract changes.
