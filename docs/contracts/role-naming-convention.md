# Role Naming Convention Contract

**Date:** 2026-04-30 (rev 2 — addresses owner-precedence blocker on `OrgMember.orgRole`)
**Status:** Superseded by [`user-profile-and-roles.md`](./user-profile-and-roles.md) on 2026-05-04 — canonical naming rule (`platformRole` / `orgRole` / `ouRole`) merged with target-state Mongo migration, current-state Keycloak implementation, user-org-role-edit, and FE display surface into one User Profile + Roles lifecycle contract per the new domain/flow grouping rule (`docs/contracts/README.md`). All rev 2 rule preserved verbatim in §9.1-9.4 / §5.8-5.9 / §13.5-13.6 of the merged contract: 3 distinct scopes with locked allowed values; owner-precedence rule (`owner > admin > member`) on every endpoint emitting `orgRole`; **canonical ≠ mirror** divergence on `GET /orgs/users/members.orgRole` for owner users (legacy collapses owner → "admin" with `isOwner` parallel flag; canonical emits "owner" directly); ouRole value-equal mirror (no owner concept on OUs); BE producer rules (canonical key required for new responses; legacy `role` retained during deprecation; separate code paths for `role` collapse vs `orgRole` precedence); FE consumer rules (no bare `role` reads; no cross-scope `role` copying; never copy from one listing into a write-side body of a different scope); 3-phase rollout (additive BE Phase 1 → FE consumer switch Phase 2 → BE legacy `role` deprecation Phase 3 deferred). PR #47 + PR #55 already shipped status preserved in §3 / §12 of the merged contract; Phase 1 ouRole/orgRole mirrors on member listings still PENDING (`4.2.2 → 4.3.0`). Body kept here for PR / Codex review history.
**Owner Backend:** `klynx-api`
**Applies To Repos:** `klynx-api`, `klynx-feature`
**Contract Type:** `naming-convention` (cross-cutting; documents required JSON keys on existing REST surfaces)
**Version:** `v1`
**Aligns with:**

- [docs/plan/done/profileResponse-role.md](../plan/done/profileResponse-role.md) — `platformRole` rename on `/users/profile`
- [docs/plan/done/user-org-role-edit-be-phase2.md](../plan/done/user-org-role-edit-be-phase2.md) — `orgRole` + `platformRole` mirror on `GET /users/{id}`
- [docs/contracts/user-org-role-edit.md](user-org-role-edit.md) §9 FE Guardrails — "MUST name FE state fields explicitly as `platformRole` and `orgRole` — never the bare name `role`"
- `klynx-frontend/CLAUDE.md` → Role Naming Convention section

**Implementation Plan:** [docs/plan/role-naming-mirror-ouRole-orgRole-be.md](../plan/role-naming-mirror-ouRole-orgRole-be.md)

---

## 1. Purpose

The platform exposes **three distinct role concepts**, all of which have historically been carried under the bare JSON key `role`. This caused at least one production bug — see [docs/contracts/user-org-role-edit.md §5.4](user-org-role-edit.md) for the silent org-admin demotion incident.

This contract makes the naming rule explicit, names the canonical key for each scope, and lists the responses where each key is required. Backends MUST emit the canonical key. Frontends MUST consume the canonical key. The legacy bare `role` key remains during a deprecation cycle on each endpoint where it currently exists, and will be removed in a follow-up phase per the per-endpoint Rollout Notes.

> **Important — canonical ≠ mirror.** On most endpoints the canonical key carries the same string as the legacy `role`. On `GET /orgs/users/members` it does **not**: the legacy `role` collapses owner into `"admin"` (with `isOwner` as a parallel flag), while the canonical `orgRole` MUST emit `"owner"` per the platform-wide enum. See §3.2, §5.2, §10.5.

---

## 2. The Three Scopes

| Scope | Canonical Key | Source of Truth | Allowed Values |
|---|---|---|---|
| **Platform** — Keycloak realm role of the human (administrator vs end-user) | `platformRole` | Keycloak (`realm_access.roles[]`, mapped per [profileResponse-role.md §6](../plan/done/profileResponse-role.md)) | `administrator` \| `user` |
| **Organization** — Permify membership of the user inside an organization | `orgRole` | Permify tuples on `organization` entity (`owner`, `admin`, `member`) | `owner` \| `admin` \| `member` |
| **OrgUnit (OU)** — Permify membership of the user inside an OU under an organization | `ouRole` | Permify tuples on `orgUnit` entity (`admin`, `member`) | `admin` \| `member` |

> **`owner` is reserved for `orgRole`.** OUs do not have an owner concept. Platform does not have an owner concept.

> **`platformRole` and `orgRole` are different value spaces.** A user can be `platformRole=user` and `orgRole=admin` (a normal org admin who is not a platform-wide administrator). They MUST never be conflated in a single field.

---

## 3. Required Response Keys

The following response surfaces MUST emit the canonical key. Where a legacy `role` key currently exists, the contract Rollout Notes (§7) document the deprecation cadence. The relationship between the legacy `role` and the canonical key is **per-endpoint**: most endpoints expose a value-equal mirror, but `GET /orgs/users/members` requires a canonical derivation that diverges from `role` for the owner case (see §3.2 and §5.2).

### 3.1 Platform Role — `platformRole`

| Endpoint | Path inside response | Status | Notes |
|---|---|---|---|
| `GET /users/profile` | `details.platformRole` | ✅ Shipped (PR #47) | Source: [profileResponse-role.md](../plan/done/profileResponse-role.md). Legacy bare key not present here — `platformRole` is the only key. |
| `PATCH /users/profile` | `details.platformRole` | ✅ Shipped (PR #47) | Same as above. |
| `GET /users/{id}` | `details.user.platformRole` | ✅ Shipped (PR #55) | Mirror of `details.user.role`. Both keys populated during the deprecation window. |

### 3.2 Organization Role — `orgRole`

| Endpoint | Path inside response | Status | Notes |
|---|---|---|---|
| `GET /users/{id}` | `details.organizations[].orgRole` | ✅ Shipped (PR #55) | No legacy key — was added directly per [user-org-role-edit.md §5.1](user-org-role-edit.md). Derivation: `IsUserOwner > IsUserAdmin > member`. |
| `GET /orgs/units/{id}/members` | `details.items[].orgRole` | ✅ Shipped | Already populated — Permify org-relations enrichment in `ListMembersOfOU`. Derivation: `owner > admin > member`. |
| `GET /orgs/users/members` | `details.items[].orgRole` | 🟡 **Required additive — this contract** | Currently emits only the bare `role` key. **`orgRole` MUST be derived canonically with owner-precedence (`owner > admin > member`), NOT mirrored from `role`.** The legacy `role` field on this endpoint collapses owner into `"admin"` for management-UI back-compat (and uses the parallel `isOwner` boolean for the actual owner relation); the canonical `orgRole` MUST NOT inherit that collapse. See §7 and §10. Legacy `role` stays unchanged during deprecation window. |
| `GET /users/{userId}` (any user-fetch surface returning `organizations[]`) | `details.organizations[].orgRole` | ✅ Shipped | Inherited from `OrgSummary.OrgRole`. |

> **Owner-precedence rule (canonical, all endpoints).** Wherever `orgRole` appears, the BE MUST emit one of `{owner, admin, member}` using the precedence `owner > admin > member`. This is the same rule shipped for `OrgSummary.OrgRole` in PR #55 ([authzsvc/org.go](../../internal/services/authzsvc/org.go)) and is the value space FE relies on to render the per-org role chip / dropdown.

### 3.3 OrgUnit Role — `ouRole`

| Endpoint | Path inside response | Status | Notes |
|---|---|---|---|
| `GET /orgs/units/{id}/members` | `details.items[].ouRole` | 🟡 **Required additive — this contract** | Currently emits only the bare `role` key, whose value is OU-scoped (`admin` \| `member` of the orgUnit). MUST add `ouRole` mirror equal to the existing `role` value. Legacy `role` stays during deprecation window. See §7. |

> **Future endpoints:** any new response that carries an OU-scoped role MUST use `ouRole` from day one. There is no compatibility reason to emit a bare `role` for new surfaces.

---

## 4. Producer / Consumer Rules

### Producer (BE) Rules

- **MUST** emit the canonical key for the scope of the value (`platformRole` / `orgRole` / `ouRole`).
- **MUST** populate the canonical key using the canonical value space:
  - `platformRole ∈ {administrator, user}` per [profileResponse-role.md §6](../plan/done/profileResponse-role.md)
  - `orgRole ∈ {owner, admin, member}` with **owner-precedence** `owner > admin > member`
  - `ouRole ∈ {admin, member}` (no owner concept on OUs)
- **MUST NOT** introduce a new response that uses the bare key `role` — even if the field is named after a struct named `Role`. JSON tag is part of the contract.
- **MUST** keep the legacy `role` key during the deprecation window on endpoints that currently emit it, with its **existing semantics unchanged**. The canonical key may carry a value that diverges from `role` when the legacy semantics collapse two distinct relations (e.g. `GET /orgs/users/members` collapses `owner` into `"admin"` on the legacy `role`; the canonical `orgRole` must still emit `"owner"`).
- **MUST** derive the canonical key from the same Permify / Keycloak read that already feeds the legacy field. No new round-trips. Use a separate local variable for the canonical derivation — do not reuse the legacy `role` variable as the source.
- **SHOULD** place the new canonical key adjacent to the legacy `role` field in the struct definition for readability (cosmetic only — JSON consumers are tolerant of order).

### Consumer (FE) Rules

- **MUST** read the canonical key (`platformRole` / `orgRole` / `ouRole`) when present.
- **MUST NOT** read the bare `role` key on any new code path. Existing code paths that read `role` MUST be migrated to the canonical key as a follow-up; this contract does not require a hard cutover.
- **MUST NOT** copy a `role` value from one response shape into a write-side body of a different scope. The bug class fixed in [user-org-role-edit.md §5.4](user-org-role-edit.md) was exactly this.
- **MUST** treat the absence of the canonical key as `null`/unknown and log a warning until the BE rollout for the corresponding endpoint completes.

---

## 5. Example Payloads After This Contract Lands

### 5.1 `GET /orgs/units/{id}/members`

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
        "firstName": "wecom",
        "lastName": "Test",
        "enabled": true
      }
    ]
  },
  "pagination": {
    "page": 1,
    "perPage": 10,
    "totalRecords": 1,
    "totalPages": 1,
    "sortField": "firstName",
    "sortOrder": "asc"
  }
}
```

`role` and `ouRole` carry the same value. `orgRole` carries the user's role in the parent organization (already shipped today).

### 5.2 `GET /orgs/users/members`

```json
{
  "code": "SUCCESS",
  "status": true,
  "message": "List member in org",
  "details": {
    "items": [
      {
        "userId": "03657045-...",
        "username": "admin",
        "role": "admin",
        "orgRole": "owner",
        "isOwner": true,
        "isAdmin": false,
        "isBillingOwner": true,
        "firstName": "admin",
        "lastName": "adminnn",
        "enabled": true
      },
      {
        "userId": "821c1a8d-...",
        "username": "wecom",
        "role": "admin",
        "orgRole": "admin",
        "isOwner": false,
        "isAdmin": true,
        "isBillingOwner": false,
        "email": "wecom@gmail.com",
        "firstName": "wecom",
        "lastName": "Test",
        "enabled": true
      },
      {
        "userId": "2061b216-...",
        "username": "wegan",
        "role": "member",
        "orgRole": "member",
        "isOwner": false,
        "isAdmin": false,
        "isBillingOwner": false,
        "email": "wegan@gmail.com",
        "firstName": "wegan",
        "lastName": "test",
        "enabled": true
      }
    ],
    "summary": { "active": 17, "inactive": 0 }
  },
  "pagination": {
    "page": 1,
    "perPage": 10,
    "totalRecords": 17,
    "totalPages": 2,
    "sortField": "firstName",
    "sortOrder": "asc"
  }
}
```

**Note the divergence on the owner row.** The first item has `role == "admin"` (legacy collapse) but `orgRole == "owner"` (canonical precedence). FE MUST consume `orgRole` to distinguish owner from admin — do NOT branch on `role` alone, do NOT branch on `isOwner` alone if you are also rendering the role label, since those two were a workaround for the missing canonical field. The other rows show admin and member where `role == orgRole` because there is no semantic gap to bridge.

---

## 6. Error Contract

No new error codes. The mirror is purely additive on the success response shape — no validation logic, no auth change, no failure mode introduced.

---

## 7. Rollout Notes

| Repo | Dependency | Required Before | Notes |
|---|---|---|---|
| `klynx-api` | Add `OURole` to `OUMember` struct ([internal/services/authzsvc/orgUnitMembers.go:34](../../internal/services/authzsvc/orgUnitMembers.go#L34)) and populate alongside `Role` at [orgUnitMembers.go:128](../../internal/services/authzsvc/orgUnitMembers.go#L128) | This contract sign-off | Additive — no consumer breaks |
| `klynx-api` | Add `OrgRole` to `OrgMember` struct ([internal/services/authzsvc/orgListMembers.go:16](../../internal/services/authzsvc/orgListMembers.go#L16)). At the construction site ([orgListMembers.go:170-184](../../internal/services/authzsvc/orgListMembers.go#L170-L184)), derive `orgRole` independently with owner-precedence (`ownerSet > adminSet > member`) — do NOT mirror legacy `role`. Legacy `role` keeps its admin-collapse semantics unchanged. | This contract sign-off | Additive — no consumer breaks. Owner case will diverge from legacy `role` by design (see §5.2). |
| `klynx-feature` | Switch OU members tab read from `member.role` to `member.ouRole` | After `klynx-api` ships the mirror | Both keys populated during transition |
| `klynx-feature` | Switch org members tab read from `member.role` to `member.orgRole` | After `klynx-api` ships the mirror | Both keys populated during transition |
| `klynx-api` (deferred) | Phase 2 deprecation: remove the legacy bare `role` key from both listings + `details.user.role` from `GET /users/{id}` | After all FE consumers across `klynx-feature` have switched to canonical keys | Tracked as a follow-up plan; coordinated with [user-org-role-edit-be-phase2.md §12](../plan/done/user-org-role-edit-be-phase2.md) deprecation phase |

### Rollout Order

1. **Phase 1 (BE additive, single PR — this contract):** klynx-api adds `ouRole` to `OUMember` (value-equal mirror of `role`) and `orgRole` to `OrgMember` (canonical `owner > admin > member` derivation; diverges from legacy `role` for owner users per §3.2). version.go bumps `4.2.2 → 4.3.0`.
2. **Phase 2 (FE consumer switch):** klynx-feature swaps the two read sites to the canonical keys. Independent PR. No BE change required.
3. **Phase 3 (BE deprecation, deferred):** once Phase 2 has landed and observability confirms no consumer reads the bare `role`, retire it from these two responses (and `details.user.role` from `GET /users/{id}` together).

### Backward Compatibility

- Phase 1: fully additive. Old FE that reads `role` keeps working.
- Phase 2: FE-only — no BE coupling.
- Phase 3: breaking on the legacy key — requires Phase 2 confirmed shipped on every FE consumer first. A separate plan + Codex review will gate it.

---

## 8. Field Ownership

| Field | Authoritative Writer | Allowed Initiator | Stored In | Notes |
|---|---|---|---|---|
| `OUMember.ouRole` | Permify (`orgUnit#admin` / `orgUnit#member` tuples) | n/a (read-only projection) | not persisted | runtime mirror of `OUMember.role` (value-equal — OU has no owner concept) |
| `OrgMember.orgRole` | Permify (`organization#{owner,admin,member}` tuples) | n/a (read-only projection) | not persisted | runtime canonical projection — **derived independently with `owner > admin > member` precedence**, not a mirror of `OrgMember.role`. Diverges from legacy `role` for owner users. |

### Conflict Resolution

- The OU listing pair (`OUMember.role` ↔ `OUMember.ouRole`) MUST be derived from the same loop-local variable — value-equal by construction.
- The org listing pair (`OrgMember.role` ↔ `OrgMember.orgRole`) MUST be derived from the same Permify read but via separate code paths: `role` keeps its current collapse logic ([orgListMembers.go:172-176](../../internal/services/authzsvc/orgListMembers.go#L172-L176)), `orgRole` uses canonical precedence on the same `ownerSet`/`adminSet` already in scope at the construction site. This divergence is **by design** — see §10 examples.
- Both invariants are enforced by the unit tests in §10 of the implementation plan.

---

## 9. Frontend Integration Notes

### Required FE Inputs

| FE Use Case | Contract Surface | Required Fields | Notes |
|---|---|---|---|
| OU members tab | `GET /orgs/units/{id}/members` | `details.items[].ouRole`, `details.items[].orgRole` | `ouRole` is the new canonical key for this listing's primary role |
| Org members tab | `GET /orgs/users/members` | `details.items[].orgRole`, plus `isOwner` / `isAdmin` / `isBillingOwner` boolean flags as today | `orgRole` is the new canonical key for this listing's primary role |
| User edit page | `GET /users/{id}` | `details.user.platformRole`, `details.organizations[].orgRole` | Already shipped via PR #55 |
| Profile page | `GET /users/profile` | `details.platformRole` | Already shipped via PR #47 |

### Example FE State Mapping

| FE State | Backend Field | Direction | Notes |
|---|---|---|---|
| `state.platformRole` | `details.platformRole` (or `details.user.platformRole`) | response | Platform scope only |
| `userOrgs[i].orgRole` | `details.organizations[i].orgRole` | response | Org scope |
| `orgMember[i].orgRole` | `details.items[i].orgRole` (in `/orgs/users/members`) | response | Org scope (this contract) |
| `ouMember[i].ouRole` | `details.items[i].ouRole` (in `/orgs/units/{id}/members`) | response | OU scope (this contract) |

### FE Guardrails

- **MUST NOT** name FE state fields with the bare name `role`. Always pick the scope-qualified name. This rule is also documented in `klynx-frontend/CLAUDE.md` → Role Naming Convention.
- **MUST NOT** copy a `role` value from one listing into a write-side request body of a different scope (the bug class from `user-org-role-edit.md §5.4`).
- **MUST NOT** rely on the absence of a canonical key to mean a default value (e.g. `"member"`). Treat missing as `null` until BE rollout completes.

---

## 10. Examples — Buggy vs Correct FE Reads

### 10.1 OU members — old (broken once `role` is removed in Phase 3)

```ts
// ❌ Will break in Phase 3 (legacy key removed)
const role = member.role;
```

### 10.2 OU members — new

```ts
// ✅ Canonical key
const ouRole = member.ouRole;
const orgRole = member.orgRole; // separate scope, separate value space
```

### 10.3 Org members — old (broken once `role` is removed in Phase 3)

```ts
// ❌ Will break in Phase 3 (legacy key removed)
const role = member.role;
```

### 10.4 Org members — new

```ts
// ✅ Canonical key — covers owner/admin/member without needing isOwner branching
const orgRole = member.orgRole;          // "owner" | "admin" | "member"
const isBillingOwner = member.isBillingOwner; // separate concept, retained
```

> **Why `orgRole` replaces the `role` + `isOwner` pairing.** Pre-contract, FE had to do
> `const role = member.isOwner ? "owner" : member.role` to recover the canonical
> three-value role. With the canonical `orgRole`, the BE does this derivation
> once on the server using owner-precedence and emits the result directly. FE
> SHOULD NOT carry the legacy pair forward into new code.

### 10.5 Org members — owner case explicit

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

---

## 11. Checklist

- [x] Owner backend is explicit (`klynx-api`).
- [x] System of record is defined per scope (Keycloak vs Permify org vs Permify OU).
- [x] Producers and consumers are listed per endpoint.
- [x] Request, response, and error contract are defined (no error change).
- [x] Field ownership is explicit for synced data (no overlap by design — different stores; mirrors within a single store and a single response).
- [x] Backward compatibility is documented (additive; deprecation deferred to a separate plan).
- [n/a] Replay or re-sync behavior — not applicable (sync REST).
- [x] FE field mapping is included.
- [ ] **Open: BE owner sign-off on adding `ouRole` to `OUMember` and `orgRole` to `OrgMember`.** Pending — same Phase 1 PR.
- [ ] **Open: FE owner sign-off on swapping the two `member.role` read sites to canonical keys** once BE ships.
- [ ] **Open: defer Phase 3 deprecation to a separate plan once both FE consumers have switched.**
