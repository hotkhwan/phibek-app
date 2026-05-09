# Org Creation Policy Alignment Contract

**Date:** 2026-04-27 (rev 2)
**Status:** Superseded by [`org-lifecycle.md`](./org-lifecycle.md) on 2026-05-04 — 4-layer policy gate (license / tenantPolicy / customer / user), additive `details.cause` discriminator on 403 (no new gmod codes), tightened `effectiveAccess.canCreateOrganization` semantics (Layer 1 ∧ Layer 2 only — Layer 3/4 may still 403), `GET/PATCH /admin/tenantPolicies/:tenantId` admin surface with read-merge-upsert + first-PATCH `DefaultTenantPolicy` defaults, and Layer 3b per-`customerAccountId` scope note (added 2026-04-29) all preserved verbatim in §5.1-§5.3 / §9 of the merged contract. Body kept here for PR / Codex review history.
**Owner Backend:** `klynx-api`
**Related Plan:** [docs/plan/org-creation-policy-alignment.md](../plan/org-creation-policy-alignment.md)
**Applies To Repos:** `klynx-api`, `klynx-feature`
**Contract Type:** REST
**Version:** v1

---

## 1. Purpose

Document the four-layer org-creation gate (license → tenant policy → customer account → user policy), wire the previously-cosmetic Layer 1 (`platform_license.selfServiceOrgCreationEnabled`) into actual enforcement, and add the missing admin REST surface for Layer 2 (`tenant_policies`) so platform admins can manage the deployment policy without direct MongoDB mutation.

- klynx-api owns all four layers and publishes this document.
- klynx-feature consumes the new admin endpoints for the "Tenant deployment settings" page (deferred to a follow-up FE PR).
- klynx-feature continues to consume `effectiveAccess.canCreateOrganization` for the "Create Organization" button visibility — the field semantics tighten to **deployment-level visibility** but the field name and shape do not change.
- Direct MongoDB mutation of `tenant_policies` is **no longer the supported runbook** for production deployments.
- Top-level error `code` for every layer's deny path stays as the existing `gmod.CodeForbidden` (`"FORBIDDEN"`). The `details.cause` field is the only addition — additive, optional for FE consumers.

---

## 2. Ownership

### Owner Backend

- `klynx-api`

### Domain System of Record

| Domain | System of Record | Canonical Store | Notes |
|---|---|---|---|
| Platform license (Layer 1) | `klynx-api` | `platform_license` (singleton, MongoDB) | Read by `OrganizationService.Create` and `effectiveAccess` |
| Tenant deployment policy (Layer 2) | `klynx-api` | `tenant_policies` (per `tenantId`, MongoDB) | Read by `OrganizationService.Create` and `effectiveAccess`; written by activation seed, startup backfill, and the new admin endpoints (read-merge-upsert) |
| Customer account self-service flag (Layer 3) | `klynx-api` | `customer_accounts.selfServiceOrgCreationEnabled` | Unchanged in this contract |
| User policy (Layer 4) | `klynx-api` | `customer_account_policies.canCreateOrganization` | Unchanged in this contract |
| Tenant enumeration source | Keycloak realms (via `authgw.ListRealms`) | — | Used by activation seed and startup backfill |

### Producer / Consumers

| Surface | Producer | Consumers | Notes |
|---|---|---|---|
| `GET /admin/tenantPolicies/:tenantId` | klynx-api | klynx-feature admin UI | New |
| `PATCH /admin/tenantPolicies/:tenantId` | klynx-api | klynx-feature admin UI | New (read-merge-upsert) |
| `POST /orgs` | klynx-api | klynx-feature org-create page; 3rd-party API consumers | Updated error semantics (additive `details.cause`); top-level `code` unchanged |
| `GET /me/effectiveAccess` | klynx-api | klynx-feature org-create button + sidebar | `canCreateOrganization` semantics tightened to deployment-level (Layer 1 ∧ Layer 2) |

### Projection Stores

- None. All four layers read directly from the canonical store.

---

## 3. Compatibility and Policy

### Backward Compatibility

- Compatibility status: **additive**, with one behavior change (Layer 1 enforcement). No breaking schema or HTTP changes.
- Top-level `code` for 403 deny path on `POST /orgs` stays as the existing `"FORBIDDEN"` for all five causes (`license`, `tenantPolicy`, `customer`, `limit`, `user`). `details.cause` is the only addition.
- Consumer requirements:
  - Existing FE consumers of `effectiveAccess.canCreateOrganization` keep working without code changes. The semantics tighten (now deployment-level only); the shape and value type are unchanged.
  - Existing FE consumers of `POST /orgs` 403 continue to receive `code: "FORBIDDEN"`. The new `details.cause` field is **additive** — clients that ignore it are unaffected.
- Deprecation window: not required.

### Replay / Re-sync Behavior

- Not applicable. All flows are synchronous REST.

### Write Authority Policy

- `klynx-api` is the only authoritative writer for all four layers.
- `tenant_policies` writers, in priority order:
  1. **Admin PATCH** (`PATCH /admin/tenantPolicies/:tenantId`) — explicit override; always wins after the document exists. Read-merge-upsert preserves absent fields.
  2. **Activation seed** — at `POST /admin/platformLicense/activate`, after the license is persisted, enumerate Keycloak realms and insert `DefaultTenantPolicy` for any tenant that has no row. Re-activation does **not** overwrite existing rows. No reset flag in v1.
  3. **Startup backfill** — same idempotent insert as activation seed; safe to run on every boot. Synchronous (blocks container ready).
- Activation seed and startup backfill always write `DefaultTenantPolicy` (open). They do **not** mirror the license value. Layer 1 absolute guarantees that a permissive tenant policy cannot leak through when the license is false.
- Direct MongoDB mutation is not part of this contract. Any operator action taken outside the documented endpoints is unsupported.

---

## 4. Surface Summary

| Type | Name | Method / Topic | Auth | Producer / Handler | Consumer / Caller |
|---|---|---|---|---|---|
| REST | `/admin/tenantPolicies/:tenantId` | GET | Bearer + platformRole=administrator | `adminapi.TenantPolicyController.Get` | klynx-feature admin UI |
| REST | `/admin/tenantPolicies/:tenantId` | PATCH | Bearer + platformRole=administrator | `adminapi.TenantPolicyController.Patch` (read-merge-upsert) | klynx-feature admin UI |
| REST | `/orgs` | POST | Bearer + ActiveOrg | `orgapi.Create` → `authzsvc.OrganizationService.Create` | klynx-feature org-create flow; 3rd-party API |
| REST | `/me/effectiveAccess` | GET | Bearer + ActiveOrg | `authzsvc.EffectiveAccess.Resolve` | klynx-feature sidebar + org-create button |

---

## 5. REST Contract

### 5.1 Get Tenant Policy

**Endpoint:** `/admin/tenantPolicies/:tenantId`
**Method:** `GET`
**Auth:** `Authorization: Bearer <jwt>`; user must have `platformRole == "administrator"`. `X-Active-Org` not required (this is a platform-admin endpoint, not org-scoped).
**Purpose:** Return the deployment policy for a tenant. If no document exists, return the `DefaultTenantPolicy` for that tenantId (does not insert).

#### Path Params

| Field | Type | Required | Description |
|---|---|---|---|
| `tenantId` | string | yes | Keycloak realm / tenantId |

#### Query Params

(none)

#### Request Headers

| Header | Required | Description |
|---|---|---|
| `Authorization` | yes | `Bearer <jwt>` of a user with `platformRole=administrator` |

#### Request Body

(none)

#### Success Response

**HTTP:** `200`

```json
{
  "code": "SUCCESS",
  "message": "ok",
  "status": true,
  "details": {
    "tenantId": "pattaya",
    "deploymentMode": "onPrem",
    "allowSelfServiceOrgCreation": false,
    "allowOrgAdminManageMenuPerm": true,
    "allowOrgAdminManageResPerm": true,
    "createdAt": "2026-04-25T15:32:51.852Z",
    "updatedAt": "2026-04-27T09:10:00.000Z",
    "isDefault": false
  }
}
```

#### Success Field Definitions

| Field | Type | Description |
|---|---|---|
| `tenantId` | string | echo of the path param |
| `deploymentMode` | enum | one of `selfServiceSaas`, `controlledSaas`, `enterpriseManaged`, `onPrem` |
| `allowSelfServiceOrgCreation` | bool | Layer 2 self-service flag for `POST /orgs` |
| `allowOrgAdminManageMenuPerm` | bool | unrelated to this plan; documented for completeness |
| `allowOrgAdminManageResPerm` | bool | unrelated to this plan; documented for completeness |
| `createdAt` | RFC3339 UTC | document creation time; null/zero when `isDefault=true` |
| `updatedAt` | RFC3339 UTC | last write; null/zero when `isDefault=true` |
| `isDefault` | bool | `true` when no document exists in MongoDB and the response is `DefaultTenantPolicy`; `false` when persisted |

#### Error Contract

| HTTP | Code | Meaning | Consumer Handling |
|---|---|---|---|
| 401 | `UNAUTHORIZED` | missing or invalid JWT | redirect to login |
| 403 | `FORBIDDEN` | authenticated but `platformRole != administrator` | hide the admin UI |
| 500 | `INTERNAL_ERROR` | repo / DB failure | show generic error toast |

#### Error Example

```json
{
  "code": "FORBIDDEN",
  "message": "platform administrator role required",
  "status": false
}
```

---

### 5.2 Patch Tenant Policy

**Endpoint:** `/admin/tenantPolicies/:tenantId`
**Method:** `PATCH`
**Auth:** `Authorization: Bearer <jwt>`; user must have `platformRole == "administrator"`.
**Purpose:** Apply partial updates to the tenant policy via **read-merge-upsert**. The controller MUST load the existing row (or `DefaultTenantPolicy` when missing), apply only the fields present in the request body, then upsert the merged document. Absent fields are preserved.

#### Read-Merge-Upsert Semantics

1. Controller calls `repo.FindByTenantID(ctx, tenantId)` → returns existing row, or `DefaultTenantPolicy` when missing.
2. Controller applies only the fields present in the request body onto the loaded policy.
3. Controller calls `repo.Upsert(ctx, mergedPolicy)` — the repo writes the full document via Mongo `$set` and `$setOnInsert`, and invalidates its in-process cache.
4. Controller returns the merged document with `isDefault: false`.

**First-PATCH defaults** (when no row exists yet and the PATCH only sends a subset of fields):

| Field | Default value (from `DefaultTenantPolicy`) | Persisted when absent from PATCH |
|---|---|---|
| `deploymentMode` | `"selfServiceSaas"` | `"selfServiceSaas"` |
| `allowSelfServiceOrgCreation` | `true` | `true` |
| `allowOrgAdminManageMenuPerm` | `true` | `true` |
| `allowOrgAdminManageResPerm` | `true` | `true` |

Worked example: on a tenant with no row, `PATCH {"allowSelfServiceOrgCreation": false}` writes a row with `{deploymentMode: "selfServiceSaas", allowSelfServiceOrgCreation: false, allowOrgAdminManageMenuPerm: true, allowOrgAdminManageResPerm: true}`. Operators who want a different `deploymentMode` must include it in the PATCH body.

PATCH is idempotent at the field level: passing the same body twice yields the same merged document.

#### Path Params

| Field | Type | Required | Description |
|---|---|---|---|
| `tenantId` | string | yes | Keycloak realm / tenantId |

#### Request Headers

| Header | Required | Description |
|---|---|---|
| `Authorization` | yes | `Bearer <jwt>` of a user with `platformRole=administrator` |
| `Content-Type` | yes | `application/json` |

#### Request Body

```json
{
  "deploymentMode": "onPrem",
  "allowSelfServiceOrgCreation": true,
  "allowOrgAdminManageMenuPerm": true,
  "allowOrgAdminManageResPerm": true
}
```

#### Request Field Definitions

| Field | Type | Required | Owner | Description |
|---|---|---|---|---|
| `deploymentMode` | enum | no | platform admin | one of `selfServiceSaas`, `controlledSaas`, `enterpriseManaged`, `onPrem` |
| `allowSelfServiceOrgCreation` | bool | no | platform admin | Layer 2 flag |
| `allowOrgAdminManageMenuPerm` | bool | no | platform admin | unrelated to this plan |
| `allowOrgAdminManageResPerm` | bool | no | platform admin | unrelated to this plan |

Empty body or body with no recognized fields → `400 INVALID_BODY`. Unknown fields are ignored.

#### Success Response

**HTTP:** `200`

```json
{
  "code": "SUCCESS",
  "message": "tenant policy updated",
  "status": true,
  "details": {
    "tenantId": "pattaya",
    "deploymentMode": "onPrem",
    "allowSelfServiceOrgCreation": true,
    "allowOrgAdminManageMenuPerm": true,
    "allowOrgAdminManageResPerm": true,
    "createdAt": "2026-04-25T15:32:51.852Z",
    "updatedAt": "2026-04-27T09:15:00.000Z",
    "isDefault": false
  }
}
```

#### Error Contract

| HTTP | Code | Meaning | Consumer Handling |
|---|---|---|---|
| 400 | `INVALID_BODY` | empty body, unknown enum, or wrong type | show validation errors |
| 401 | `UNAUTHORIZED` | missing or invalid JWT | redirect to login |
| 403 | `FORBIDDEN` | not platform admin | hide the admin UI |
| 500 | `INTERNAL_ERROR` | repo / DB failure | show generic error toast |

#### Error Example

```json
{
  "code": "INVALID_BODY",
  "message": "deploymentMode must be one of: selfServiceSaas, controlledSaas, enterpriseManaged, onPrem",
  "status": false
}
```

---

### 5.3 POST /orgs (additive `details.cause`)

**Endpoint:** `/orgs`
**Method:** `POST`
**Auth:** `Authorization: Bearer <jwt>`, `X-Active-Org: <tenantId>`
**Purpose:** Create an organization under the active tenant. Subject to the four-layer gate.

The request and success contract are unchanged. The 403 deny path **keeps the existing top-level `code: "FORBIDDEN"`** and adds an additive `details.cause` discriminator. **No new gmod codes.** No controller mapping rewrite — the existing `MapSvcError` flow continues to map every layer's `errors.Is(err, ErrOrgCreationDisabled / ErrOrgLimitReached / ErrUserNotEnabled / ErrForbidden)` to `403 FORBIDDEN`. The cause is attached as a separate `details` field (via `WithDetail` or an equivalent helper).

#### Updated Error Contract (deny path only)

All five causes return identical top-level shape:

```text
HTTP:    403
code:    "FORBIDDEN"
status:  false
message: "organization creation is disabled by deployment policy" (or layer-specific message — see below)
details: { "cause": "<cause>" }
```

| HTTP | Top-level `code` | `details.cause` | Layer | Message (existing) | Recovery |
|---|---|---|---|---|---|
| 403 | `FORBIDDEN` | `"license"` | Layer 1 | `"organization creation is disabled by deployment policy"` | platform admin: `PATCH /admin/platformLicense {selfServiceOrgCreationEnabled: true}` |
| 403 | `FORBIDDEN` | `"tenantPolicy"` | Layer 2 | `"organization creation is disabled by deployment policy"` | platform admin: `PATCH /admin/tenantPolicies/:tenantId {allowSelfServiceOrgCreation: true}` (requires Layer 1 already true) |
| 403 | `FORBIDDEN` | `"customer"` | Layer 3 | `"organization creation is disabled for this customer account"` | use existing `/admin/customers` surface |
| 403 | `FORBIDDEN` | `"limit"` | Layer 3 | `"organization limit reached for this customer plan"` | upgrade plan or use existing `/admin/customers` surface to raise `MaxOrganizations` |

> **Scope note for `details.cause: "limit"` (added 2026-04-29):** the count
> compared against `customer_accounts.MaxOrganizations` is **per
> `customerAccountId`**, not per tenant. Implementations MUST count only orgs
> whose `customerAccountId` matches the calling user's customer account. Counting
> tenant-wide is a contract violation — it causes cross-customer bleed where
> customer A is blocked because customers B/C/… in the same tenant have orgs.
> Legacy orgs with empty/missing `customerAccountId` are NOT included in this
> gate's count; backfill is the responsibility of the
> [customerAccountLimitRepair](customerAccountLimitRepair.md) admin surface.
> Tenant-wide caps are a separate concern enforced via
> `subscription.limits.maxOrganizationsPerTenant` in `subscriptionsvc`. See
> [docs/plan/orgCreateCustomerScopeFix.md](../plan/orgCreateCustomerScopeFix.md).
| 403 | `FORBIDDEN` | `"user"` | Layer 4 | `"user is not enabled under this customer account"` (or similar) | enable the user via existing customer-policy flow |

`details.cause` is **additive**. Clients that ignore it see the same shape as today.

`details.cause` value is a stable identifier; FE may safely branch on it. `details.cause` is **not** a substitute for the top-level `code` — use top-level `code` for routing, `details.cause` for diagnostic / message specialization.

#### Updated Error Example

```json
{
  "code": "FORBIDDEN",
  "message": "organization creation is disabled by deployment policy",
  "status": false,
  "details": {
    "cause": "license"
  }
}
```

---

### 5.4 GET /me/effectiveAccess (deployment-level visibility signal)

**Endpoint:** `/me/effectiveAccess`
**Method:** `GET`
**Auth:** `Authorization: Bearer <jwt>`, `X-Active-Org: <tenantId>`
**Purpose:** Return the calling user's capabilities, including whether the "Create Organization" button should be visible **based on deployment policy**.

The response shape is unchanged. The `canCreateOrganization` field semantics tighten:

```text
canCreateOrganization
  = isPlatformAdmin
    OR (
         platform_license.selfServiceOrgCreationEnabled
         AND tenant_policies.allowSelfServiceOrgCreation
       )
```

#### Semantics — deployment-level visibility, not API guarantee

`canCreateOrganization=true` means: **the deployment allows self-service org creation for this tenant**. It does **not** guarantee `POST /orgs` will succeed.

`POST /orgs` may still return 403 with `details.cause` ∈ `{"customer", "limit", "user"}` because:
- The user may not yet have a customer account (one is auto-provisioned on first attempt; if Layer 3 is disabled on it, 403 follows).
- The user's customer account may have hit `MaxOrganizations`.
- The user's customer-policy may have `canCreateOrganization=false`.

These cases are **documented behavior**, not defects. FE handles them via the existing 403 toast (with optional `details.cause` branching).

The reason Layer 3/4 are excluded: Layer 3 requires a customer-account lookup (and may auto-create one); Layer 4 requires per-user policy. Including them turns a cheap effectiveAccess call into an expensive one and creates UX coupling the auto-provisioning of customer accounts. The pragmatic split is: Layer 1+2 = "show the button"; Layer 3+4 = "the button click might still 403, handle in toast".

FE behavior: if the BE already trusts this field for button visibility, no FE code change is required. Optionally branch on `POST /orgs` 403 `details.cause` for clearer error copy.

---

## 6. Event Contract

Not applicable. No Kafka, no async events.

---

## 7. Canonical and Projection Mapping

### Canonical Store

- System: `klynx-api`
- Stores:
  - `platform_license` (singleton): `selfServiceOrgCreationEnabled`
  - `tenant_policies` (per `tenantId`): `allowSelfServiceOrgCreation`, `deploymentMode`, `allowOrgAdminManageMenuPerm`, `allowOrgAdminManageResPerm`

### Projection Store

- None.

### Field Mapping

| Canonical Field | Projection Field | Consumer Field | Notes |
|---|---|---|---|
| `platform_license.selfServiceOrgCreationEnabled` | — | included in `effectiveAccess.canCreateOrganization` derivation; surfaced as `details.cause="license"` on 403 | not directly exposed to non-admin users |
| `tenant_policies.allowSelfServiceOrgCreation` | — | `details.allowSelfServiceOrgCreation` on the new admin endpoints; included in `effectiveAccess.canCreateOrganization` derivation; surfaced as `details.cause="tenantPolicy"` on 403 | exposed only to platform admins via the new endpoints |

---

## 8. Field Ownership

| Field | Authoritative Writer | Allowed Initiator | Stored In | Notes |
|---|---|---|---|---|
| `platform_license.selfServiceOrgCreationEnabled` | `adminapi.PlatformLicenseController.Update` / activation flow | platform admin | `platform_license` | unchanged write path; new read consumers added |
| `tenant_policies.allowSelfServiceOrgCreation` | `adminapi.TenantPolicyController.Patch` (read-merge-upsert) | platform admin (PATCH); activation flow (insert-only); startup (insert-only) | `tenant_policies` | preserve admin overrides on re-activation |
| `tenant_policies` (whole document) | `adminapi.TenantPolicyController.Patch` | platform admin (PATCH); activation flow (insert-only); startup (insert-only) | `tenant_policies` | seed/backfill always write `DefaultTenantPolicy`, never mirror license value |

### Conflict Resolution

- Admin PATCH wins over activation seed and startup backfill, because seed and backfill skip rows that already exist.
- No bidirectional sync. No echo loop. Last-write-wins among admin PATCH calls.
- The in-process cache in `TenantPolicyRepo` is invalidated by `Upsert` ([tenantPolicyRepo.go:94-97](../../internal/repo/subscriprepo/tenantPolicyRepo.go#L94-L97)) so a PATCH is reflected on the next `POST /orgs` without a process restart.

---

## 9. Frontend Integration Notes

### Required FE Inputs

| FE Use Case | Contract Surface | Required Fields | Notes |
|---|---|---|---|
| Admin "Tenant deployment settings" page (deferred) | `GET /admin/tenantPolicies/:tenantId`, `PATCH /admin/tenantPolicies/:tenantId` | `tenantId`, `deploymentMode`, `allowSelfServiceOrgCreation`, `isDefault`, `updatedAt` | gate visibility on `platformRole=administrator`; show "Default" badge when `isDefault=true`; PATCH may send only changed fields |
| Org-create button visibility | `GET /me/effectiveAccess` → `canCreateOrganization` | `canCreateOrganization` (bool) | no change required; field name unchanged. Deployment-level signal — clicking may still 403 |
| Org-create error toast | `POST /orgs` 403 | `code`, `message`, `details.cause` (optional) | display `message` as-is; optionally branch on `details.cause` ∈ `{license, tenantPolicy, customer, limit, user}` for clearer helper copy |

### Example FE Payload Mapping

| FE Field | Backend Field | Direction | Notes |
|---|---|---|---|
| `tenantPolicy.allowSelfServiceOrgCreation` | `details.allowSelfServiceOrgCreation` | response (GET) | toggle in admin UI |
| `tenantPolicy.allowSelfServiceOrgCreation` | request body field with the same name | request (PATCH) | optional; absent = preserve (read-merge-upsert) |
| `tenantPolicy.isDefault` | `details.isDefault` | response (GET) | "this tenant has no persisted policy yet" badge |
| `errorCause` | `details.cause` | response (POST /orgs 403) | optional UI branch |

### FE Guardrails

- Do not guess `TenantPolicy` field names — read from this contract.
- Do not assume `details.cause` is always present on 403 — it is additive; absence = legacy / pre-rollout response.
- Do not switch on `details.cause` for routing — use top-level `code: "FORBIDDEN"` for routing, `details.cause` for message specialization.
- Treat `effectiveAccess.canCreateOrganization=true` as "show the button"; the API may still 403, in which case display the toast as today.

---

## 10. Rollout Notes

| Repo | Dependency | Required Before | Notes |
|---|---|---|---|
| `klynx-api` | this contract | Phase 1 implementation | BE ships first; bumps `version.go` minor |
| `klynx-feature` | the new admin endpoints | Phase 3 (deferred) | additive UI; no API breakage if delayed |

Operator recovery flow (cause-conditional) is documented in the related plan §9 Phase 2.

---

## 11. Examples

### Example: Get tenant policy (no document yet)

Request:

```http
GET /admin/tenantPolicies/pattaya HTTP/1.1
Authorization: Bearer <admin-jwt>
```

Response:

```json
{
  "code": "SUCCESS",
  "message": "ok",
  "status": true,
  "details": {
    "tenantId": "pattaya",
    "deploymentMode": "selfServiceSaas",
    "allowSelfServiceOrgCreation": true,
    "allowOrgAdminManageMenuPerm": true,
    "allowOrgAdminManageResPerm": true,
    "createdAt": "0001-01-01T00:00:00Z",
    "updatedAt": "0001-01-01T00:00:00Z",
    "isDefault": true
  }
}
```

### Example: First-PATCH on a tenant with no row (single field)

Request:

```http
PATCH /admin/tenantPolicies/pattaya HTTP/1.1
Authorization: Bearer <admin-jwt>
Content-Type: application/json

{
  "allowSelfServiceOrgCreation": false
}
```

Response (note: absent fields fall back to `DefaultTenantPolicy`):

```json
{
  "code": "SUCCESS",
  "message": "tenant policy updated",
  "status": true,
  "details": {
    "tenantId": "pattaya",
    "deploymentMode": "selfServiceSaas",
    "allowSelfServiceOrgCreation": false,
    "allowOrgAdminManageMenuPerm": true,
    "allowOrgAdminManageResPerm": true,
    "createdAt": "2026-04-27T09:15:00.000Z",
    "updatedAt": "2026-04-27T09:15:00.000Z",
    "isDefault": false
  }
}
```

### Example: Subsequent PATCH (preserve other fields)

Request:

```http
PATCH /admin/tenantPolicies/pattaya HTTP/1.1
Authorization: Bearer <admin-jwt>
Content-Type: application/json

{
  "allowSelfServiceOrgCreation": true
}
```

Response (other fields preserved from previous state):

```json
{
  "code": "SUCCESS",
  "message": "tenant policy updated",
  "status": true,
  "details": {
    "tenantId": "pattaya",
    "deploymentMode": "selfServiceSaas",
    "allowSelfServiceOrgCreation": true,
    "allowOrgAdminManageMenuPerm": true,
    "allowOrgAdminManageResPerm": true,
    "createdAt": "2026-04-27T09:15:00.000Z",
    "updatedAt": "2026-04-27T09:30:00.000Z",
    "isDefault": false
  }
}
```

### Example: POST /orgs denied by license

Request:

```http
POST /orgs HTTP/1.1
Authorization: Bearer <user-jwt>
X-Active-Org: pattaya
Content-Type: application/json

{ "name": "My new org" }
```

Response:

```json
{
  "code": "FORBIDDEN",
  "message": "organization creation is disabled by deployment policy",
  "status": false,
  "details": {
    "cause": "license"
  }
}
```

Recovery: platform admin runs `PATCH /admin/platformLicense {"selfServiceOrgCreationEnabled": true}`. PATCHing the tenant policy is **not** a recovery action for this cause — it persists but Layer 1 still denies.

### Example: POST /orgs denied by tenant policy

Response:

```json
{
  "code": "FORBIDDEN",
  "message": "organization creation is disabled by deployment policy",
  "status": false,
  "details": {
    "cause": "tenantPolicy"
  }
}
```

Recovery: platform admin runs `PATCH /admin/tenantPolicies/:tenantId {"allowSelfServiceOrgCreation": true}`. (License must already be true; if license is false, the deny upgrades to `cause="license"` after the next request.)

### Example: POST /orgs denied by customer-account limit

Response:

```json
{
  "code": "FORBIDDEN",
  "message": "organization limit reached for this customer plan",
  "status": false,
  "details": {
    "cause": "limit"
  }
}
```

Recovery: out of scope for this contract — handled by existing `/admin/customers` surface (raise `MaxOrganizations`) or by upgrading the plan.

---

## 12. Checklist

- [ ] Owner backend is explicit (`klynx-api`).
- [ ] System of record is defined per layer (4 layers, 4 stores, 1 enumeration source).
- [ ] Canonical stores documented; no projection store.
- [ ] Producers and consumers listed (klynx-api → klynx-feature admin UI; klynx-api → org-create flow).
- [ ] Request, response, and error contracts defined for all 4 surfaces (2 new admin + 2 updated semantics).
- [ ] PATCH read-merge-upsert semantics + first-PATCH defaults explicit.
- [ ] Top-level error `code` stays `"FORBIDDEN"` for every layer's deny path; `details.cause` is the only addition.
- [ ] `effectiveAccess.canCreateOrganization` defined as deployment-level visibility signal (Layer 1 ∧ Layer 2); Layer 3/4 may still 403 — documented, not a defect.
- [ ] Cause-conditional recovery documented (license → flip license; tenantPolicy → PATCH tenant; customer/limit/user → existing surfaces).
- [ ] Field ownership explicit for `tenant_policies` writes (admin PATCH > activation seed > startup backfill).
- [ ] Backward compatibility documented (additive; one enforcement change for license Layer 1; no new gmod codes).
- [ ] Replay / re-sync N/A (synchronous REST).
- [ ] FE field mapping included for the deferred admin page and the existing `effectiveAccess` consumer.
