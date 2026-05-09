# Org Member Cleanup And Username Contract

**Date:** 2026-04-24
**Status:** Superseded by [`org-lifecycle.md`](./org-lifecycle.md) on 2026-05-04 — `PATCH /orgs/users/remove` cascade OU cleanup with `removedFromOuIds[]` per success item + `REMOVE_OWNER_INVARIANT` 409 + idempotent OU tuple delete, and `GET /orgs/users/members` `username` field from Keycloak `UserProfile.Username` (omitted when KC profile missing — soft-deleted user still in Permify) all preserved verbatim in §5.8 + §5.9 of the merged contract. The `summary.active + summary.inactive == pagination.totalRecords` invariant preserved (Q5 global summary WITHDRAWN 2026-04-25). Body kept here for PR / Codex review history.
**Owner Backend:** `klynx-api`
**Related Plan:** [docs/plan/done/org-member-cleanup-and-username.md](../plan/done/org-member-cleanup-and-username.md)
**Applies To Repos:** `klynx-api`, `klynx-feature`
**Contract Type:** `REST`
**Version:** `v1` (additive)

---

## 1. Purpose

Two additive changes to org-membership REST surfaces owned by `klynx-api`:

1. `PATCH /orgs/users/remove` — cascades to remove the user's `orgUnit.{member,admin}` Permify tuples before deleting org-level tuples. Response gains `removedFromOuIds` per user.
2. `GET /orgs/users/members` — response items gain `username` sourced from the Keycloak `UserProfile`.

Consumers (klynx-feature admin views) stop needing to fall back to email for the username column and gain a reliable signal that OU cleanup happened.

---

## 2. Ownership

### Owner Backend

- `klynx-api`

### Domain System of Record

| Domain | System of Record | Canonical Store |
|---|---|---|
| Org and OU membership | `klynx-api` | Permify (`organization` and `orgUnit` entities) |
| User profile | Keycloak | `authgw.UserProfile` |

### Producer / Consumers

| Surface | Producer | Consumers |
|---|---|---|
| `PATCH /orgs/users/remove` | caller with `manage/user` on target org | `klynx-feature` users page |
| `GET /orgs/users/members` | org-admin caller | `klynx-feature` users page (admin org view) |

### Projection Stores

- None.

---

## 3. Compatibility and Policy

### Backward Compatibility

- `PATCH /orgs/users/remove`:
  - **Behavior (additive + cascade)**: cascade over OU tuples now runs prior to org-level delete. Previously no OU tuples were touched. Historical rows stay orphaned; this contract covers go-forward behavior only.
  - **Response (additive)**: each successful item in `details[]` gains `removedFromOuIds: string[]`. Absent field on error items.
  - **Error contract**: unchanged — individual failures still land in `details[].error`, HTTP status unchanged.
- `GET /orgs/users/members`:
  - **Response (additive)**: each item in `details.items[]` may contain a `username` field. Field is omitted when the Keycloak profile is unavailable.
  - **No behavioral change** to pagination, filter, or summary semantics.

### Replay / Re-sync Behavior

- Not applicable (no events).
- Historical drift: users removed from an org before this contract lands may still appear in OU listings. Sweep tooling is out of scope; a separate admin job can be added later if drift is observed in production.

### Deprecation Window

- None.

---

## 4. Auth & Authorization

- `PATCH /orgs/users/remove`: `Bearer` token + `X-Active-Org`; caller must have `manage/user` on the active org. Unchanged.
- `GET /orgs/users/members`: `Bearer` token + `X-Active-Org`; caller must be a member of the active org. Unchanged.

---

## 5. Endpoint Specs

### 5.1 `PATCH /orgs/users/remove`

**Request (unchanged):**

```http
PATCH /api/v3/orgs/users/remove
Authorization: Bearer <jwt>
X-Active-Org: <orgId>
Content-Type: application/json

{
  "users": [
    { "userId": "user-123", "role": "admin" },
    { "userId": "user-456" }
  ]
}
```

- `users[*].role` is ignored on the remove path (accepted for symmetry with invite).

**Success Response (additive):**

```json
{
  "code": "SUCCESS",
  "message": "removed 2, not_member 0, error 0",
  "status": true,
  "details": [
    {
      "userId": "user-123",
      "success": true,
      "removedFromOuIds": ["ou-aaa", "ou-bbb"]
    },
    {
      "userId": "user-456",
      "success": true,
      "removedFromOuIds": []
    }
  ]
}
```

- `removedFromOuIds` is present **only on items with `success: true`**.
- Value is the OU IDs whose `orgUnit.{member,admin}` tuples were attempted for delete (the delete itself is idempotent, so "attempted" and "removed-or-already-gone" are indistinguishable — both are safe).
- Empty array means the user had no OU memberships under this org.

**Partial / Error Item (unchanged shape):**

```json
{
  "userId": "user-789",
  "success": false,
  "error": "user is not a member of this organization"
}
```

| HTTP Status | Code | Meaning | FE Handling |
|---|---|---|---|
| 200 | `SUCCESS` | Per-user results in `details[]` | Read `details[*].success`; show toast with aggregate from `message` |
| 400 | `INVALID_REQUEST` | Missing `users[]` or malformed body | Toast error |
| 401 | `UNAUTHORIZED` | Missing / invalid token | Re-auth |
| 403 | `FORBIDDEN` | Caller lacks `manage/user` on org | Toast error |
| 409 | `REMOVE_OWNER_INVARIANT` | Would leave org without any owner | Toast; ask caller to transfer ownership first |

### 5.2 `GET /orgs/users/members`

**Request (unchanged):**

```http
GET /api/v3/orgs/users/members?page=1&perPage=10&search=<term>&sortField=role&sortOrder=desc
Authorization: Bearer <jwt>
X-Active-Org: <orgId>
```

**Success Response (additive):**

```json
{
  "code": "SUCCESS",
  "status": true,
  "details": {
    "items": [
      {
        "userId": "user-123",
        "username": "somchai",
        "role": "member",
        "isOwner": false,
        "isAdmin": false,
        "isBillingOwner": false,
        "email": "somchai@example.com",
        "firstName": "Somchai",
        "lastName": "Sritrakul",
        "avatar": "https://.../avatar.png",
        "enabled": true
      }
    ],
    "summary": { "active": 35, "inactive": 15 }
  },
  "pagination": { "page": 1, "perPage": 10, "totalRecords": 50, "totalPages": 5 }
}
```

- `username` is present on every item where the Keycloak profile exposes it.
- `username` is **omitted** when the Keycloak profile is missing (soft-deleted user still in Permify) — FE must tolerate absence.
- `summary`, `pagination`, and all other fields are unchanged.

| HTTP Status | Code | Meaning | FE Handling |
|---|---|---|---|
| 200 | `SUCCESS` | Paginated result | Render items; use `summary` for aggregate counts |
| 401 | `UNAUTHORIZED` | Missing / invalid token | Re-auth |
| 403 | `FORBIDDEN` | Caller is not a member | Toast error |

---

## 6. Data Source & Field Mapping

### `username`

- Source: `authgw.UserProfile.Username` (Keycloak `username` claim).
- Populated in: `internal/services/authzsvc/orgListMembers.go` profile-map loop (line 185-191 today).
- Canonical rule: `OrgMember.Username = UserProfile.Username`. No trimming, lowercasing, or rename.

### `removedFromOuIds`

- Source: enumerated via `orgUnitRepo.ListByOrg(ctx, tenantId, orgId)`; each resulting `unit.UnitId` is added to the response array when the cascade loop touches it.
- Canonical rule: OU IDs appear in repository-list order; no dedupe needed (list is already unique per OU).

---

## 7. FE Implementation Notes

- `klynx-feature` remap in `app/pages/systemUsers/users/index.vue`:
  - Change `username: u.email || ''` → `username: u.username || ''`.
  - Do **not** fall back to `email` locally; the column is a username column and should render empty (or `-`) when the field is missing.
- `klynx-feature` does **not** need to read `removedFromOuIds` to render the happy path, but it MAY use the array length to write a friendlier toast (e.g., "Removed from org (also removed from 2 organization units)"). Not required for Phase 2.
- No schema inference: both fields are documented here. If FE needs anything else from the member DTO (e.g., orgRole alongside role), open a separate contract revision.

---

## 8. Validation Cases

- **Happy remove with OU**: user in org + 2 OUs → `PATCH /orgs/users/remove` returns 200 with `removedFromOuIds` length 2; `GET /orgs/units/{ouId}/members` for both OUs returns user absent.
- **Happy remove without OU**: user in org only → response `removedFromOuIds = []`.
- **Cross-org isolation**: user is member of `org A` + OU under org A, AND member of `org B` + OU under org B → remove from org A → user still present in org B's OU.
- **Not-member**: `details[].success = false`, `error = "user is not a member of this organization"`, no `removedFromOuIds`.
- **Owner invariant**: removing the last owner returns 409 `REMOVE_OWNER_INVARIANT`; no cascade occurs.
- **Member list**: org with a user that has `username = "somchai"` in Keycloak returns `"username": "somchai"`.
- **Member list — missing profile**: user exists in Permify but not in Keycloak (race or soft-delete) → `username` is omitted entirely; other fields present as before.

---

## 9. Change Log

| Version | Date | Change |
|---|---|---|
| v1 | 2026-04-24 | Initial contract — cascade OU removal + `username` field |
