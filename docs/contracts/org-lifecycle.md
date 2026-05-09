# Organization Lifecycle Contract

**Date:** 2026-05-04
**Status:** Active (consolidated — supersedes `org-creation-policy-alignment.md` + `org-member-cleanup-and-username.md` + `orgSubscriptionRepair.md` + `org-workspace-reprovision.md` + `plan-limit-canonical-and-list-summary-global.md`)
**Owner Backend:** `klynx-api`
**Cites:** [docs/contracts/deploymentProfile.md](deploymentProfile.md) — canonical profile enum
**Applies To Repos:** `klynx-api`, `klynx-feature`
**Contract Type:** `REST + Sync`
**Version:** `v1` — combined: org-creation policy alignment (rev 2 — Codex blockers resolved); workspace reprovision (r1); subscription repair Revision 5 (Codex review fixes); quota canonical + migration v1-rev3 (Q1 shipped + Q5 withdrawn 2026-04-25); member cleanup + username v1
**Supersedes:** `org-creation-policy-alignment.md` (rev 2), `org-member-cleanup-and-username.md` (v1), `orgSubscriptionRepair.md` (Revision 5), `org-workspace-reprovision.md` (r1), `plan-limit-canonical-and-list-summary-global.md` (v1-rev3)

---

## 0. Domain / Flow Boundary

| Field | Value |
|---|---|
| Domain name | `org-lifecycle` |
| Flow name | Organization lifecycle: pre-creation policy gate → workspace provisioning → subscription consistency → quota enforcement → member cleanup |
| Lifecycle scope | admin/operator surfaces for creating, repairing, and tearing down organizations end-to-end, plus the policy gate that controls who can create them |

### Included Surfaces

| Surface Type | Name | Purpose |
|---|---|---|
| REST | `POST /orgs` | org creation with 4-layer policy gate (additive `details.cause` discriminator on 403) |
| REST | `GET /me/effectiveAccess` | tightened `canCreateOrganization` semantics (Layer 1 ∧ Layer 2 only) |
| REST | `GET /admin/tenantPolicies/:tenantId` | Layer 2 admin surface — read tenant policy |
| REST | `PATCH /admin/tenantPolicies/:tenantId` | Layer 2 admin surface — read-merge-upsert |
| REST | `POST /admin/platformLicense/activate` | activation orchestration with profile-aware subscription repair (Cases A-E) |
| REST | `POST /orgs/{orgId}/subscription/bootstrap` | profile-aware single-org subscription repair |
| REST | `POST /admin/subscriptions/reconcile` | detect-only zero-write report |
| REST | `POST /api/v3/ingest/reprovisionWorkspace` (+ alias `/api/v3/ingest/enableWebhook`) | re-provision phibek workspace for stuck orgs |
| REST | `PATCH /orgs/users/remove` | cascade OU cleanup; response gains `removedFromOuIds` |
| REST | `GET /orgs/users/members` | response items gain `username` from Keycloak `UserProfile` |
| Kafka | `gw.workspace.provisioned.v1` (saasPublic profile only) | workspace provisioning async path; klynx publishes, `workspaceprovcons` consumes |
| Sync | quota enforcement migration (`cmd/migrate-customer-org-limits/`) | one-shot alignment of `customer_accounts.maxOrganizations` to `DefaultOrgLimitsByPlan(planId)` |

### Excluded Surfaces

| Surface | Why excluded | Authoritative Contract |
|---|---|---|
| Org-admin permission profile (camera/edge/member grants) | covered by `permission-profile.md` | sibling contract |
| Resource group hierarchy + icons | covered by `resource-group.md` | sibling contract |
| Camera CRUD + monitor + usage | covered by `device-camera-domain.md` | sibling contract |
| Customer account CRUD beyond `selfServiceOrgCreationEnabled` flag (Layer 3) | separate `/admin/customers` surface | (separate admin contract) |
| Customer-account org-limit repair admin tooling | sibling — handles backfill of legacy orgs with empty `customerAccountId` | `customerAccountLimitRepair.md` |
| User policy CRUD beyond `canCreateOrganization` flag (Layer 4) | separate `/admin/customerPolicies` surface | (separate admin contract) |
| User profile / avatar | covered by `userProfile.md` + `profileAvatarUpdate.md` | sibling contracts (Cluster #7) |
| Org-role editing (member/admin/owner) | covered by `user-org-role-edit.md` | sibling contract (Cluster #7) |
| User inactivity notifications | sibling | `userInactivityNotification.md` |
| Q5 user list global summary | **WITHDRAWN 2026-04-25** by product owner — summary reverts to search-scoped (`summary.active + summary.inactive == pagination.totalRecords`); kept here as historical context only | n/a (withdrawn) |

### Related Contracts

| Contract | Relationship |
|---|---|
| [`deploymentProfile.md`](./deploymentProfile.md) | upstream — `EffectiveProfile` enum that activation orchestration branches on (`appliance` / `platform` / `saas`) |
| `customerAccountLimitRepair.md` | sibling — backfill admin surface for legacy orgs with empty `customerAccountId`; complements §5.1 Layer 3 limit gate |
| `userProfile.md` (and Cluster #7 merge) | sibling — user identity store split (KC vs Mongo); §5.9 reads Keycloak `UserProfile.Username` directly |
| Future `device-camera-domain.md` | sibling — sync semantics for org → workspace → camera projection |
| Future `gw-integration` umbrella | sibling — `gw.workspace.provisioned.v1` Kafka topic owned by gateway-api side |

### Grouping Rationale

All five source contracts mutate or read the same five Mongo stores (`organizations`, `customer_accounts`, `subscriptions`, `tenant_policies`, `platform_license`) at different stages of the org lifecycle:

- **Pre-creation policy gate** (`org-creation-policy-alignment`) — 4-layer enforcement on `POST /orgs`
- **Creation-time workspace provisioning** (`org-workspace-reprovision`) — recovery for orgs stuck in `provisionFailed`
- **Steady-state subscription consistency** (`orgSubscriptionRepair`) — activation orchestration + manual repair + detect-only reconcile
- **Steady-state quota enforcement** (`plan-limit-canonical-and-list-summary-global`) — `DefaultOrgLimitsByPlan` canonical + migration
- **Steady-state member cleanup** (`org-member-cleanup-and-username`) — cascade OU removal + username surfacing

A reader who wants to operate org lifecycle end-to-end (admin creates an org → workspace provisions → subscription seeds → quota enforces on next `POST /orgs` → eventually member cleanup) needs all five. They share the same `EffectiveProfile`-aware branching (`appliance` / `platform` / `saas`), the same `MapSvcError` envelope mapping, and the same admin/role-based auth pattern. Per `docs/contracts/README.md` grouping rule, these are one flow → one contract.

---

## 1. Purpose

Defines the full lifecycle of `organizations`:

- **Layer 1-4 policy gate** on `POST /orgs`: license `selfServiceOrgCreationEnabled` (Layer 1) → tenant policy `allowSelfServiceOrgCreation` (Layer 2) → customer account `selfServiceOrgCreationEnabled` (Layer 3) → user policy `canCreateOrganization` (Layer 4). 403 deny path keeps existing top-level `code: "FORBIDDEN"` and adds additive `details.cause` discriminator (`license` | `tenantPolicy` | `customer` | `limit` | `user`).
- **`effectiveAccess.canCreateOrganization`** tightens to deployment-level visibility (Layer 1 ∧ Layer 2 only). Layer 3/4 may still 403; documented behavior, not a defect.
- **Tenant policy admin surface** (`GET/PATCH /admin/tenantPolicies/:tenantId`) — read-merge-upsert; first-PATCH defaults to `DefaultTenantPolicy`; preserves admin overrides on re-activation.
- **Activation orchestration** (`POST /admin/platformLicense/activate`) under `appliance`: profile-aware subscription repair Cases A-E (create / reuse / upgrade / downgrade / unknown-from-plan); status `complete` / `partial` / `skipped`.
- **Manual subscription repair** (`POST /orgs/{orgId}/subscription/bootstrap`) — profile-aware plan resolution; idempotent by `orgId`; never overwrites existing planId.
- **Detect-only reconcile** (`POST /admin/subscriptions/reconcile`) — bounded-sample report; zero writes.
- **Workspace reprovisioning** — `POST /api/v3/ingest/reprovisionWorkspace` (alias `/enableWebhook`); idempotent when active; locked guarantee no force-recreate; saasPublic uses async 202 + Kafka.
- **Member cleanup with OU cascade** — `PATCH /orgs/users/remove` returns `removedFromOuIds[]` per success item; `REMOVE_OWNER_INVARIANT` 409 when removing last owner.
- **Member list with username** — `GET /orgs/users/members` items gain `username` from Keycloak `UserProfile` (omitted when KC profile missing).
- **Quota enforcement** — `DefaultOrgLimitsByPlan(pro) = 5` (canonical) aligned with subscription seed; one-shot migration of `customer_accounts.maxOrganizations` gated by ops-approved input; bespoke caps preserved via deny-list (`--exclude-tenant` / `--exclude-plan`); existing orgs never deleted by migration.

`klynx-api` publishes this contract; `klynx-feature` (org-create button, admin tenant policy page, sync recovery button, members list) consumes it. Frontend must not invent error codes, infer cause discriminators, or replicate quota enforcement on FE.

---

## 2. Ownership

### Owner Backend

- `klynx-api`

### Domain System of Record

| Domain | System of Record | Canonical Store | Notes |
|---|---|---|---|
| Platform license (Layer 1) | `klynx-api` | `platform_license` (singleton, MongoDB) | read by `OrganizationService.Create` and `effectiveAccess`; written by `adminapi.PlatformLicenseController.Update` / activation flow |
| Tenant deployment policy (Layer 2) | `klynx-api` | `tenant_policies` (per `tenantId`, MongoDB) | read by `OrganizationService.Create` and `effectiveAccess`; written by activation seed, startup backfill, and the new admin endpoints (read-merge-upsert) |
| Customer account self-service flag (Layer 3) | `klynx-api` | `customer_accounts.selfServiceOrgCreationEnabled` | unchanged; read by Layer 3 gate |
| Customer account org limit (Layer 3 limit) | `klynx-api` | `customer_accounts.maxOrganizations` | per-`customerAccountId` count vs limit; backfilled by migration; bespoke caps preserved |
| User policy (Layer 4) | `klynx-api` | `customer_account_policies.canCreateOrganization` | unchanged |
| Tenant enumeration source | Keycloak realms (via `authgw.ListRealms`) | — | used by activation seed and startup backfill |
| Per-org runtime quota | `klynx-api` | `subscriptions` keyed by `orgId` | canonical |
| Org → customer linkage | `klynx-api` | `organizations.customerAccountId` | authoritative on the org document |
| Commercial plan | `klynx-api` | `customer_accounts.planId` | drives plan resolution under `platform` and `saas` only. Under `appliance`, license is plan authority |
| Org / OU membership | `klynx-api` | Permify (`organization` and `orgUnit` entities) | read/write tuples for membership |
| User profile (username, name, email) | Keycloak | `authgw.UserProfile` | read-only for member list surface |
| Workspace identity | `gateway-api/WorkspaceService` | gateway-api | klynx-api mirrors via `UpdateWorkspaceRef` |
| Deployment profile | `klynx-api` | `config.EffectiveProfile` (process-local) | branch selector for activation orchestration; canonical from `deploymentProfile.md` |
| Tenant-keyed subscription | `klynx-api` | `subscriptions` keyed by `tenantId` | **deprecated**; compatibility fallback only |

### Producer / Consumers

| Surface | Producer / Handler | Consumers | Notes |
|---|---|---|---|
| `POST /orgs` | klynx-api `orgapi.Create` → `authzsvc.OrganizationService.Create` | klynx-feature org-create page; 3rd-party API | 4-layer gate, additive `details.cause` |
| `GET /me/effectiveAccess` | klynx-api `authzsvc.EffectiveAccess.Resolve` | klynx-feature sidebar + org-create button | tightened `canCreateOrganization` semantics |
| `GET /admin/tenantPolicies/:tenantId` | klynx-api `adminapi.TenantPolicyController.Get` | klynx-feature admin UI | new |
| `PATCH /admin/tenantPolicies/:tenantId` | klynx-api `adminapi.TenantPolicyController.Patch` (read-merge-upsert) | klynx-feature admin UI | new |
| `POST /admin/platformLicense/activate` | klynx-api `adminapi.PlatformActivationController.Activate` → `licensesvc.PlatformActivationService.Activate` + `subscriptionsvc.OrchestrateActivationRepair` | ops admin (role `administrator`) | extended response with `subscriptionRepair` block |
| `POST /orgs/{orgId}/subscription/bootstrap` | klynx-api `subapi.OrgSubscriptionController.Bootstrap` | ops admin | targeted retry; profile-aware |
| `POST /admin/subscriptions/reconcile` | klynx-api `subapi.AdminReconcileController` | ops admin | detect-only zero-write |
| `POST /api/v3/ingest/reprovisionWorkspace` (+ alias `/enableWebhook`) | klynx-api `OrgController.EnablePhibekWorkspace` → `OrganizationService.EnablePhibekWorkspaceForUser` | klynx-feature admin UI; ops/SRE | 2 routes share same handler |
| `PATCH /orgs/users/remove` | klynx-api | klynx-feature users page | cascade OU |
| `GET /orgs/users/members` | klynx-api | klynx-feature users page (admin org view) | username field |
| `gw.workspace.provisioned.v1` (Kafka) | klynx-api (saasPublic profile) | `workspaceprovcons` (klynx-api side) | 202 returns BEFORE consumer round-trip |
| `cmd/migrate-customer-org-limits/` | klynx-api ops binary | one-shot operator | 3-phase: dry-run → ops curate `approved.json` → `--apply --input approved.json` |

---

## 3. Compatibility and Policy

### Backward Compatibility

- **Org creation policy alignment:** **additive**, with one behavior change (Layer 1 enforcement). No breaking schema or HTTP changes. Top-level `code` for 403 deny path stays as `"FORBIDDEN"` for all five causes. `details.cause` is the only addition. Existing FE consumers of `effectiveAccess.canCreateOrganization` keep working without code changes — the semantics tighten (now deployment-level only); the shape and value type are unchanged.
- **Activation response (`/admin/platformLicense/activate`):** **additive (response) + behavioral (under `appliance` only)**. Added response field: `subscriptionRepair` (object). Preserved response fields: `platformLicense`, `action`. Behavior change: under `appliance`, activation now mutates `subscriptions`. Under `platform` and `saas`, no subscription writes occur. HTTP status semantics: unchanged. Internal admin tooling that treats activation `200 OK` as "deployment ready" must read `subscriptionRepair.status` after this contract ships. Treating `200` alone as ready is incorrect under `appliance`.
- **Manual repair (`/orgs/{orgId}/subscription/bootstrap`):** API surface unchanged; internal plan resolution now profile-aware. Response `planSource` enum gains `"license"` for the appliance-only branch.
- **Reconcile (`/admin/subscriptions/reconcile`):** API surface unchanged.
- **Workspace reprovision:** new endpoint + alias; aliasing existing `/enableWebhook` for backward compatibility (deprecated in swagger).
- **Member cleanup:** **additive** — cascade now runs prior to org-level delete (was: no OU tuples touched). Response gains `removedFromOuIds[]` per success item. Historical drift: users removed from an org before this contract lands may still appear in OU listings. Sweep tooling is out of scope.
- **Member list:** **additive** — items may contain `username` field. Field is omitted when the Keycloak profile is unavailable (soft-deleted user still in Permify).
- **Quota canonical + migration:** **additive (semantics-compat, no field additions)**. Pro plan canonical drops from previously-stored value (often 10) to 5 after migration. Existing orgs never deleted; over-limit tenants get `403 PLAN_LIMIT_EXCEEDED` on next `POST /orgs`. Q5 user-list summary change WITHDRAWN 2026-04-25 — `summary.active + summary.inactive == pagination.totalRecords` (search-scoped) preserved.

### Replay / Re-sync Behavior

- **Org creation policy:** synchronous REST; no replay.
- **Activation under `appliance`:** replay (re-activating the same artifact) re-runs the case matrix; under steady state every org is classified Case B (idempotent) and no writes occur. Repeated activation is safe.
- **Manual repair endpoint:** replay supported, idempotent by `orgId`. Re-invocation rule: if an `orgId`-keyed subscription exists, return it with `repairAction: "reused"` and perform no writes.
- **Reconcile endpoint:** read-only, trivially idempotent.
- **Workspace reprovision:** idempotent when `provisionStatus == "active"` (returns `idempotent: true` with no gw call). Concurrent calls do not double-provision (second observes `provisioning` and is told to wait).
- **Member cleanup:** OU tuple delete is idempotent — "attempted" and "removed-or-already-gone" are indistinguishable; both are safe.
- **Quota migration:** idempotent (`approved.json`-gated; rows already at `expected` are skipped on re-read; safe to re-run).

### Write Authority Policy

- `klynx-api` is the only authoritative writer for all 5 stores.
- **`tenant_policies` writers** (priority order):
  1. **Admin PATCH** (`PATCH /admin/tenantPolicies/:tenantId`) — explicit override; always wins after the document exists. Read-merge-upsert preserves absent fields.
  2. **Activation seed** — at `POST /admin/platformLicense/activate`, after the license is persisted, enumerate Keycloak realms and insert `DefaultTenantPolicy` for any tenant that has no row. Re-activation does **not** overwrite existing rows. No reset flag in v1.
  3. **Startup backfill** — same idempotent insert as activation seed; safe to run on every boot. Synchronous (blocks container ready).
- Activation seed and startup backfill always write `DefaultTenantPolicy` (open). They do **not** mirror the license value. Layer 1 absolute guarantees that a permissive tenant policy cannot leak through when the license is false.
- Direct MongoDB mutation is not part of this contract.
- **`subscriptions` writers** (`subscriptionsvc` is the only authoritative writer):
  1. `bootstrap` — at org create
  2. `RepairOrgSubscription` — used by manual `/orgs/{orgId}/subscription/bootstrap` only (profile-aware)
  3. `OrchestrateActivationRepair` — activation orchestration. Case A seeds with `licensePlanId` directly via `subRepo.UpsertDefaultForOrg` (bypassing `RepairOrgSubscription` because customer-plan-first contradicts appliance license authority). Cases C/D/E write via `subRepo.UpdatePlanIdWithAudit`.
- Under `appliance`, license activation is the canonical mechanism to change plans. `UpdateOverrides` remains an emergency-only escape hatch (carried from Revision 3).
- Under `platform`, activation is forbidden from touching subscriptions. The repair endpoint is the operator's tool for individual orgs.
- Under `saas`, activation is typically not used; if reached, it skips with `reason: "saas-profile-no-license-activation"`. Subscription writes are owned by signup/billing flows (out of scope).
- Repair must not write if customer ownership is unresolved or ambiguous. Enterprise artifact fallback is not a customer-resolution mechanism; it applies only to `planId` after customer is resolved.
- Tenant-keyed subscription rows are deprecated and must not be used to satisfy org-keyed quota lookups going forward.
- Read paths (`GetOrgLimits`, `GetCurrentEffectiveByOrg`) must remain non-mutating.
- **Workspace reprovision authority:** only via the documented service path (`EnablePhibekWorkspaceForUser`). The repo layer (`OrgRepo.UpdateWorkspaceRef`) does NOT enforce the "no overwrite while active" rule — it would happily overwrite if called directly. Callers MUST go through the service.
- **Member cleanup invariant:** removing the last owner returns `409 REMOVE_OWNER_INVARIANT`; no cascade occurs.

### Revision History (preserved verbatim from source contracts)

**org-creation-policy-alignment.md (rev 2):**
- rev 1 → rev 2: Codex rev 1 blockers resolved — top-level `code` for 403 deny path stays `"FORBIDDEN"` for all five causes (no new gmod codes); `details.cause` is the only addition; first-PATCH defaults explicit; activation seed and startup backfill always write `DefaultTenantPolicy` (do not mirror license).
- Scope note for `details.cause: "limit"` (added 2026-04-29): count compared against `customer_accounts.MaxOrganizations` is **per `customerAccountId`**, not per tenant. Tenant-wide caps are a separate concern enforced via `subscription.limits.maxOrganizationsPerTenant`. Legacy orgs with empty/missing `customerAccountId` are NOT included in this gate's count; backfill is the responsibility of `customerAccountLimitRepair.md`.

**org-member-cleanup-and-username.md (v1):**
- Initial — cascade OU removal + `username` field.

**orgSubscriptionRepair.md (Revision 5):**
- rev 5: Codex review fixes applied. `planSource` enum gains `"license"` for the appliance-only branch; Cases A-E case matrix; Case E (unknown `fromPlanId`) treated as tier 0 → upgrade + warn log + `samples.unknownFromPlanId`; counters distinguish `unknownFromPlanId` from `upgraded`; `partial` rule single-sourced (`errors > 0` OR `skippedCustomerUnresolved > 0`; `unknownFromPlanId` alone does not force partial); auth-middleware error shape divergence documented (401/403 follow native shape, not the `{code, message, status}` envelope).

**org-workspace-reprovision.md (r1):**
- r0 (2026-04-23): initial draft.
- r1 (2026-04-23): wire-surface corrections after Codex first review (no behavior change). `X-Active-Org` missing → `400 BAD_REQUEST` (was r0: 401). 404 envelope uses generic `code="NOT_FOUND"` (was r0: `ORG_NOT_FOUND`). 202 envelope uses `code="ACCEPTED"`, `message="accepted"` (was r0: `SUCCESS`/`ok`). §1 false claim removed about service-account JWTs. §3 auth model rewritten. §6 audit dependency on `auditPrefixes` entries.
- r2 alignment (no wire change): plan r2 changed service-internal auth design from options struct to two named methods (`EnablePhibekWorkspace` internal, `EnablePhibekWorkspaceForUser` user-facing).

**plan-limit-canonical-and-list-summary-global.md (v1-rev3):**
- v1 (2026-04-24): initial — canonical Pro org limit = 5; migration Option B; user list summary becomes global while pagination stays filtered.
- v1-rev2 (2026-04-24): Revision 2 (Codex review fixes) — migration now requires ops-curated `--input approved.json`; added `--exclude-tenant` / `--exclude-plan`; ownership table split into three distinct store roles; rollout order requires migration binary built from new commit.
- v1-rev3 (2026-04-25): **Q5 WITHDRAWN** by product owner. Global-summary change reverted; user list endpoints fall back to original "summary tracks search" behavior. Only Q1 (canonical Pro limit + migration) remains active.

---

## 4. Surface Summary

| Type | Name | Method | Auth / Trust | Producer / Handler | Consumer / Caller |
|---|---|---|---|---|---|
| REST | `/orgs` | `POST` | Bearer + `X-Active-Org` | klynx-api `orgapi.Create` → `authzsvc.OrganizationService.Create` | klynx-feature org-create |
| REST | `/me/effectiveAccess` | `GET` | Bearer + `X-Active-Org` | klynx-api `authzsvc.EffectiveAccess.Resolve` | klynx-feature sidebar + org-create button |
| REST | `/admin/tenantPolicies/:tenantId` | `GET`, `PATCH` | Bearer + platformRole=administrator | klynx-api `adminapi.TenantPolicyController` | klynx-feature admin UI |
| REST | `/admin/platformLicense/activate` | `POST` | Bearer + role `administrator` | klynx-api `adminapi.PlatformActivationController.Activate` + orchestration | ops admin |
| REST | `/orgs/{orgId}/subscription/bootstrap` | `POST` | Bearer + role `administrator` | klynx-api `subapi.OrgSubscriptionController.Bootstrap` | ops admin |
| REST | `/admin/subscriptions/reconcile` | `POST` | Bearer + role `administrator` | klynx-api `subapi.AdminReconcileController` | ops admin |
| REST | `/api/v3/ingest/reprovisionWorkspace` (+ alias `/enableWebhook`) | `POST` | Bearer + `X-Active-Org` + `manage` (or platform admin bypass) | klynx-api `OrgController.EnablePhibekWorkspace` | klynx-feature admin; ops/SRE |
| REST | `/orgs/users/remove` | `PATCH` | Bearer + `X-Active-Org` + `manage/user` | klynx-api | klynx-feature users page |
| REST | `/orgs/users/members` | `GET` | Bearer + `X-Active-Org` (org member) | klynx-api | klynx-feature users page (admin org view) |
| Kafka | `gw.workspace.provisioned.v1` | publish | (saasPublic profile only) | klynx-api | `workspaceprovcons` |

---

## 5. REST Surfaces

### 5.1 `POST /orgs` — 4-layer policy gate (additive `details.cause`)

**Endpoint:** `/orgs`
**Method:** `POST`
**Auth:** Bearer JWT + `X-Active-Org: <tenantId>`.
**Purpose:** Create an organization under the active tenant. Subject to the four-layer gate.

The request and success contract are unchanged. The 403 deny path **keeps the existing top-level `code: "FORBIDDEN"`** and adds an additive `details.cause` discriminator. **No new gmod codes.** No controller mapping rewrite — the existing `MapSvcError` flow continues to map every layer's `errors.Is(err, ErrOrgCreationDisabled / ErrOrgLimitReached / ErrUserNotEnabled / ErrForbidden)` to `403 FORBIDDEN`. The cause is attached as a separate `details` field (via `WithDetail` or an equivalent helper).

#### 4-layer policy decision tree

```
Layer 1: platform_license.selfServiceOrgCreationEnabled
  ↓ (if false → 403 FORBIDDEN, details.cause="license")
Layer 2: tenant_policies.allowSelfServiceOrgCreation
  ↓ (if false → 403 FORBIDDEN, details.cause="tenantPolicy")
Layer 3a: customer_accounts.selfServiceOrgCreationEnabled
  ↓ (if false → 403 FORBIDDEN, details.cause="customer")
Layer 3b: count(orgs WHERE customerAccountId == this.customerAccountId) < customer_accounts.maxOrganizations
  ↓ (if exceeded → 403 FORBIDDEN, details.cause="limit"; logs over_limit_at_create_attempt=true)
Layer 4: customer_account_policies.canCreateOrganization for the calling user
  ↓ (if false → 403 FORBIDDEN, details.cause="user")
→ create org
```

**Layer 3b scope note (added 2026-04-29):** the count compared against `customer_accounts.MaxOrganizations` is **per `customerAccountId`**, not per tenant. Counting tenant-wide is a contract violation — it causes cross-customer bleed where customer A is blocked because customers B/C in the same tenant have orgs. Legacy orgs with empty/missing `customerAccountId` are NOT included; backfill via [`customerAccountLimitRepair.md`](./customerAccountLimitRepair.md). Tenant-wide caps are enforced separately via `subscription.limits.maxOrganizationsPerTenant`.

#### Updated Error Contract (deny path only)

All five causes return identical top-level shape:

```text
HTTP:    403
code:    "FORBIDDEN"
status:  false
message: "<layer-specific message>"
details: { "cause": "<cause>" }
```

| HTTP | Top-level `code` | `details.cause` | Layer | Message | Recovery |
|---|---|---|---|---|---|
| 403 | `FORBIDDEN` | `"license"` | Layer 1 | `"organization creation is disabled by deployment policy"` | platform admin: `PATCH /admin/platformLicense {selfServiceOrgCreationEnabled: true}` |
| 403 | `FORBIDDEN` | `"tenantPolicy"` | Layer 2 | `"organization creation is disabled by deployment policy"` | platform admin: `PATCH /admin/tenantPolicies/:tenantId {allowSelfServiceOrgCreation: true}` (Layer 1 must already be true) |
| 403 | `FORBIDDEN` | `"customer"` | Layer 3a | `"organization creation is disabled for this customer account"` | use existing `/admin/customers` surface |
| 403 | `FORBIDDEN` | `"limit"` | Layer 3b | `"organization limit reached for this customer plan"` | upgrade plan or use `/admin/customers` to raise `MaxOrganizations` |
| 403 | `FORBIDDEN` | `"user"` | Layer 4 | `"user is not enabled under this customer account"` | enable the user via existing customer-policy flow |

`details.cause` is **additive**. Clients that ignore it see the same shape as today. `details.cause` is **not** a substitute for the top-level `code` — use top-level `code` for routing, `details.cause` for diagnostic / message specialization.

**Quota canonical (Layer 3b limit):** Pro plan canonical = `5` (changed from previously-stored value, often 10; matches Pricing page display). See §11 for full plan map and migration. Existing orgs are never deleted; over-limit tenants get `403 FORBIDDEN details.cause="limit"` on subsequent attempts.

#### Updated Error Example

```json
{
  "code": "FORBIDDEN",
  "message": "organization creation is disabled by deployment policy",
  "status": false,
  "details": { "cause": "license" }
}
```

### 5.2 `GET /me/effectiveAccess` — deployment-level visibility signal

**Endpoint:** `/me/effectiveAccess`
**Method:** `GET`
**Auth:** Bearer JWT + `X-Active-Org: <tenantId>`.
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
- The user may not yet have a customer account (auto-provisioned on first attempt; if Layer 3 is disabled, 403 follows).
- The user's customer account may have hit `MaxOrganizations`.
- The user's customer-policy may have `canCreateOrganization=false`.

These cases are **documented behavior**, not defects. FE handles them via the existing 403 toast (with optional `details.cause` branching).

The reason Layer 3/4 are excluded: Layer 3 requires a customer-account lookup (and may auto-create one); Layer 4 requires per-user policy. Including them turns a cheap `effectiveAccess` call into an expensive one. The pragmatic split is: Layer 1+2 = "show the button"; Layer 3+4 = "the button click might still 403, handle in toast".

### 5.3 `GET / PATCH /admin/tenantPolicies/:tenantId` — Layer 2 admin surface

#### `GET /admin/tenantPolicies/:tenantId`

**Auth:** Bearer + `platformRole == "administrator"`. `X-Active-Org` not required.
**Purpose:** Return the deployment policy for a tenant. If no document exists, return the `DefaultTenantPolicy` for that tenantId (does not insert).

**Success (`200`):**

```json
{
  "code": "SUCCESS",
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

| Field | Type | Description |
|---|---|---|
| `deploymentMode` | enum | one of `selfServiceSaas`, `controlledSaas`, `enterpriseManaged`, `onPrem` |
| `allowSelfServiceOrgCreation` | bool | Layer 2 self-service flag |
| `allowOrgAdminManageMenuPerm` | bool | unrelated to org-creation; documented for completeness |
| `allowOrgAdminManageResPerm` | bool | unrelated; documented for completeness |
| `isDefault` | bool | `true` when no document exists in MongoDB and the response is `DefaultTenantPolicy`; `false` when persisted |

**Errors:** 401 `UNAUTHORIZED`; 403 `FORBIDDEN` (not platform admin); 500 `INTERNAL_ERROR`.

#### `PATCH /admin/tenantPolicies/:tenantId`

**Auth:** same as GET.
**Purpose:** Apply partial updates via **read-merge-upsert**.

**Read-Merge-Upsert Semantics:**
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

**Errors:** 400 `INVALID_BODY` (empty body, unknown enum, wrong type); 401, 403, 500 (same as GET). Empty body or body with no recognized fields → 400. Unknown fields are ignored.

### 5.4 `POST /admin/platformLicense/activate` — orchestration with `subscriptionRepair`

**Auth:** `BearerAuth` + role `administrator` (enforced at `router/platformLicense.go:27`).
**Purpose:** Activate a signed license artifact and, under the `appliance` profile, run a profile-aware subscription repair pass.

#### Request body

```json
{ "artifact": { "...": "SignedLicenseArtifact JSON" } }
```

#### Success Response (200)

```json
{
  "code": "SUCCESS",
  "details": {
    "platformLicense": { "...": "PlatformLicense doc" },
    "action": "activate",
    "subscriptionRepair": {
      "status": "complete",
      "counts": {
        "scanned": 12, "created": 3, "reused": 9,
        "upgraded": 0, "downgraded": 0,
        "skippedCustomerUnresolved": 0, "errors": 0,
        "unknownFromPlanId": 0
      },
      "samples": {
        "created": ["org-uuid-1", "org-uuid-2", "org-uuid-3"],
        "upgraded": [], "downgraded": [],
        "unknownFromPlanId": [], "skippedCustomerUnresolved": [], "errors": []
      },
      "generatedAt": "2026-04-23T10:15:00Z"
    }
  }
}
```

#### Field definitions

| Field | Description |
|---|---|
| `action` | `"activate"`, `"activate_idempotent"`, `"replace"`, `"replace_different_license"` |
| `subscriptionRepair.status` | `"complete"` / `"partial"` / `"skipped"` |
| `subscriptionRepair.reason` | present only when `status == "skipped"`; `"platform-profile-operator-controlled"` or `"saas-profile-no-license-activation"` |
| `subscriptionRepair.counts.scanned` | total org count examined (omitted when `skipped`) |
| `subscriptionRepair.counts.created` | Case A — orgs that had no subscription before |
| `subscriptionRepair.counts.reused` | Case B — existing matched `licensePlanId` |
| `subscriptionRepair.counts.upgraded` | Case C — known lower tier upgraded |
| `subscriptionRepair.counts.downgraded` | Case D — strictly higher tier auto-downgraded |
| `subscriptionRepair.counts.skippedCustomerUnresolved` | customer could not be resolved unambiguously |
| `subscriptionRepair.counts.errors` | unexpected error during orchestration |
| `subscriptionRepair.counts.unknownFromPlanId` | Case E — unknown plan id, treated as tier 0; upgraded + warn |
| `subscriptionRepair.samples.*` | bounded sample (cap 100) of orgIds per bucket; counters are exact |
| `subscriptionRepair.samples.upgraded[]` / `downgraded[]` | array of `{orgId, fromPlanId, toPlanId}` |
| `subscriptionRepair.samples.unknownFromPlanId[]` | array of `{orgId, fromPlanId}` |
| `subscriptionRepair.samples.errors[]` | array of `{orgId, reason}` |

Counters are exact regardless of sample bounds. Samples are capped at 100 entries per bucket; the contract does not expose a knob today.

#### Profile Behavior Matrix

| `EffectiveProfile` | `subscriptionRepair.status` | Behavior |
|---|---|---|
| `appliance` | `complete` / `partial` | Run case matrix; mutate `subscriptions` |
| `platform` | `skipped` (`reason: "platform-profile-operator-controlled"`) | No subscription writes |
| `saas` | `skipped` (`reason: "saas-profile-no-license-activation"`) | No subscription writes |

#### Case Matrix (`appliance` profile only)

For each org enumerated by the shared internal scanner (same lower-level enumerator that §5.6 reconcile wraps):

| Case | Pre-condition | Action | Counter |
|---|---|---|---|
| A | No `orgId`-keyed subscription exists | Resolve customer. If unresolved → `skippedCustomerUnresolved`, no write. Otherwise backfill `organizations.customerAccountId` when missing and create subscription with `planId = licensePlanId`. **Plan is license-derived, NOT from `customerAccount.planId` — license is plan authority under `appliance`.** Errors → `errors`, no write | `created` / `skippedCustomerUnresolved` / `errors` |
| B | Subscription exists; `planId == licensePlanId` | No-op | `reused` |
| C | Subscription exists; `tier(planId) < tier(licensePlanId)`; `planId` is a known plan | Update to `licensePlanId`; audit `subscription_repair_from_activation` | `upgraded` |
| D | Subscription exists; `tier(planId) > tier(licensePlanId)` | Update to `licensePlanId`; audit + emit one warn-level log per affected org with `{orgId, fromPlanId, toPlanId, licenseId, source: "activation"}` | `downgraded` |
| E | Subscription exists; `planId` is not in known tier set | Treat tier as 0 (strictly lower than any known plan); apply Case C's write. Additionally emit warn-log per org with `{orgId, unknownFromPlanId, licenseId, source: "activation"}` and append to `samples.unknownFromPlanId` | `unknownFromPlanId` (counted separately from `upgraded`) |

`tier()` ordering, aligned to the current hardcoded plan catalog in `models/subscripmod/catalog.go`: `free=1`, `pro=2`, `max=3`, `enterprise=4`. Unknown plan ids are tier 0 and handled by Case E (NOT Case C) to preserve the data-quality signal.

`licensePlanId` derivation: from `ArtifactMeta.Edition` via the plan-tier helper. Current artifact schema constrains `Edition = "enterprise"` so under production conditions only Cases A (seed at enterprise), B (idempotent), and C (upgrade from known lower plan) are exercised by a normal deployment. Case D (downgrade) and Case E with a non-enterprise target are reserved for future artifact schemas and are test-only today.

#### Partial / Complete / Skipped rule (single-sourced)

| `subscriptionRepair.status` | Condition |
|---|---|
| `skipped` | Profile is `platform` or `saas` |
| `complete` | Profile is `appliance` AND `counts.errors == 0` AND `counts.skippedCustomerUnresolved == 0` |
| `partial` | Profile is `appliance` AND (`counts.errors > 0` OR `counts.skippedCustomerUnresolved > 0`) |

**`counts.unknownFromPlanId > 0` does NOT on its own force `partial`** — the subscription was still updated. The warn log and sample bucket are the operator's visibility into the data-quality issue.

#### Error Contract

The activation HTTP status reflects only the **license activation step**. Subscription-repair partial failures are reported in-body and never flip the HTTP status.

| HTTP | Code | Meaning |
|---|---|---|
| 400 | `INVALID_PAYLOAD`, `UNSUPPORTED_VERSION`, `INVALID_LICENSE_TERM`, `INVALID_LICENSE_STATUS`, `INVALID_DEPLOYMENT_TYPE`, `INVALID_DELIVERY_MODE`, `INVALID_FEATURE_COMBINATION` | License artifact failed validation |
| 401 | (auth-middleware native shape) | Missing or invalid bearer |
| 403 | (auth-middleware native shape) | Caller lacks `administrator` role |
| 500 | `ACTIVATION_FAILED` | Internal failure during artifact persist |

> **Auth-middleware error shape note:** the activation endpoint reuses `middleware.AuthBearer()` + `middleware.RequireRoles(["administrator"])` without a custom envelope wrapper. The 401/403 body therefore follows the middleware's native shape (`{"message": "..."}`), not the `{code, message, status}` envelope used by 4xx/5xx errors emitted by this contract's controller logic.

When activation succeeds (HTTP 200) but `subscriptionRepair.status == "partial"`, the operator must consume `samples.errors` and `samples.skippedCustomerUnresolved` and follow up via §5.5 manual repair per affected org.

### 5.5 `POST /orgs/{orgId}/subscription/bootstrap` — profile-aware single-org repair

**Auth:** `BearerAuth` + role `administrator`.
**Purpose:** Repair a single org by ensuring an `orgId`-keyed subscription exists with a resolved plan and non-null `customerAccountId`. Idempotent by `orgId`. Used as the targeted retry surface for orgs left in `skippedCustomerUnresolved` or `errors` categories by activation orchestration, and for orgs created after the most recent activation.

**Profile awareness:** the plan-resolution rule branches on `EffectiveProfile` to stay consistent with the license-is-plan-authority rule from §5.4. Customer resolution is identical across profiles (D4); only the plan source changes. On an existing subscription, `repairAction: "reused"` and no plan mutation — in either profile, this endpoint never changes the `planId` of a subscription that already exists. Upgrades/downgrades happen only through activation orchestration (§5.4).

#### Success (200)

```json
{
  "code": "SUCCESS",
  "details": {
    "orgId": "org-uuid",
    "planId": "enterprise",
    "customerAccountId": "cust-uuid",
    "status": "active",
    "repairAction": "created",
    "planSource": "license"
  }
}
```

| Field | Description |
|---|---|
| `repairAction` | `"created"` (new row) or `"reused"` (existed; no write) |
| `planSource` | Under `appliance`: `"license"` on create, `"existing"` on reused. Under `platform`/`saas`: `"customer"` (from `customerAccount.planId`) or `"enterpriseArtifact"` (D2 fallback) on create, `"existing"` on reused. `"customer"` and `"enterpriseArtifact"` never appear under `appliance`; `"license"` never appears under `platform`/`saas` |

#### Plan Resolution Rule (authoritative; profile-aware)

Customer ownership is resolved first in every profile. Repair short-circuits before any write if that step fails (D4).

After customer is resolved, `planId` is chosen by profile:

**Under `appliance` (license is plan authority):**
1. If the D2 enterprise artifact predicate holds on `platform_licenses`, use the license-derived `licensePlanId` → `planSource: "license"`.
   - `licenseMode == "enterprise"` (legacy `"enterpriseOnPrem"` accepted for ≥1 release; repo normalizes on read)
   - `ArtifactMeta != nil`
   - `ArtifactMeta.Source == "artifact"`
   - `ArtifactMeta.ActivatedAt` is non-zero
2. Else → `409 PLAN_UNRESOLVED`, no writes.

`customerAccount.planId` is **not consulted** under `appliance`; a stale customer plan cannot override the license.

**Under `platform` / `saas` (customer-first rule):**
1. `customerAccount.planId` if set → `planSource: "customer"`.
2. Else, if the D2 enterprise artifact predicate holds → use `"enterprise"` → `planSource: "enterpriseArtifact"`.
3. Else → `409 PLAN_UNRESOLVED`, no writes.

#### Error Contract

| HTTP | Code | Meaning |
|---|---|---|
| 400 | `ORG_NOT_FOUND` | `orgId` does not match any org |
| 401 | (auth-middleware native shape) | Missing or invalid bearer |
| 403 | (auth-middleware native shape) | Caller lacks `administrator` role |
| 409 | `CUSTOMER_UNRESOLVED` | Org has no `customerAccountId` and customer cannot be resolved unambiguously. No subscription row created |
| 409 | `PLAN_UNRESOLVED` | Customer resolved, but no `customerAccount.planId` and the D2 enterprise artifact predicate does not hold |
| 500 | `REPAIR_FAILED` | Internal failure (DB / downstream) |

### 5.6 `POST /admin/subscriptions/reconcile` — detect-only

**Auth:** `BearerAuth` + role `administrator`.
**Purpose:** Enumerate orgs that need repair. **Zero writes** under all conditions. Activation orchestration and this endpoint share the same lower-level scanner (`scanOrgRepairState`); this endpoint wraps the scanner with bounded-sample truncation for operator reporting.

#### Query

| Field | Type | Default | Description |
|---|---|---|---|
| `limit` | int | `100` | Max orgIds in each sample list. Counters are exact regardless of `limit` |

#### Success (200)

```json
{
  "code": "SUCCESS",
  "details": {
    "counts": {
      "orgsMissingSubscription": 3,
      "orgsMissingCustomer": 1,
      "subscriptionsMissingCustomer": 0
    },
    "samples": {
      "orgsMissingSubscription": ["org-uuid-1", "org-uuid-2", "org-uuid-3"],
      "orgsMissingCustomer": ["org-uuid-4"],
      "subscriptionsMissingCustomer": []
    },
    "limit": 100,
    "generatedAt": "2026-04-22T09:00:00Z"
  }
}
```

#### Errors

401 (native shape); 403 (native shape, not platform admin); 500 `RECONCILE_FAILED`.

### 5.7 `POST /api/v3/ingest/reprovisionWorkspace` (+ alias `/enableWebhook`)

**Auth:** Bearer + `X-Active-Org`. Two-layer auth:
1. **`ActiveOrg()` middleware** — Permify `organization.view` (platform admin bypass via `c.Locals("platformRole") == "administrator"`).
2. **Service-layer `manage` check** added by plan r1 — `CheckPermissionWithSchemaVersion(... "organization", orgId, "manage", "user", userId)`. Platform admins bypass entirely (decision 12.7) — NOT required to hold a Permify `manage` tuple.

In short: an org owner (or admin) holding the Permify `manage` tuple succeeds. A platform admin succeeds without any Permify tuple. A plain org member with only `view` is rejected at layer 2.

**Two routes share this contract** (identical wire behavior):
- `POST /api/v3/ingest/reprovisionWorkspace` (preferred)
- `POST /api/v3/ingest/enableWebhook` (alias, deprecated in swagger; kept for backward compat indefinitely)

**Request body:** empty. All inputs are derived from headers/locals.

#### Behavior matrix (eligibility)

| Org state at request time | gw call made? | HTTP | Response `idempotent` | Final `provisionStatus` |
|---|---|---|---|---|
| `workspaceId="", provisionStatus="provisionFailed"` | yes | 200 (appliance, sync) / 202 (saasPublic, async) | `false` | `active` (sync) / `provisioning` (async) |
| `workspaceId="", provisionStatus=""` (newly created, never provisioned) | yes | 200 / 202 | `false` | `active` / `provisioning` |
| `workspaceId="", provisionStatus="provisioning"` | no | 200 | `false` | `provisioning` (unchanged) |
| `workspaceId="ws_x", provisionStatus="active"` | **no** | 200 | `true` | `active` (unchanged) |
| `workspaceId="ws_x", provisionStatus="provisioning"` | no | 200 | `false` | `provisioning` (unchanged) |
| `workspaceId="ws_x", provisionStatus="provisionFailed"` (stale workspaceId) | yes | 200 / 202 | `false` | `active` / `provisioning` |

**Locked guarantee (decision 12.3):** for any input where `provisionStatus == "active"`, the handler MUST NOT call gw and MUST return `idempotent: true`. There is no override flag; force-recreate is **not** in scope.

#### Response envelopes

**Synchronous success (appliance, newly provisioned, `200`):**

```json
{
  "code": "SUCCESS",
  "details": {
    "orgId": "...", "workspaceId": "ws-uuid",
    "eventIngestUri": "/events/ws-uuid/",
    "provisionStatus": "active", "idempotent": false
  }
}
```

**Idempotent (`200`):** same shape, `idempotent: true`.

**Async (saasPublic, newly triggered, `202`):**

```json
{
  "code": "ACCEPTED",
  "message": "accepted",
  "status": true,
  "details": {
    "orgId": "...", "workspaceId": "", "eventIngestUri": "",
    "provisionStatus": "provisioning", "idempotent": false
  }
}
```

Note the envelope: `code="ACCEPTED"` and `message="accepted"` (NOT `SUCCESS`/`ok`) — emitted by `httputil.Accepted`. Caller polls `GET /api/v3/ingest/` until `provisionStatus="active"` to observe completion. Push notification is out of scope.

#### Error envelope

| HTTP | Code | When |
|---|---|---|
| 400 | `BAD_REQUEST` | (a) `X-Active-Org` header missing — emitted by `ActiveOrg()` middleware. (b) Neither `workspaceProvisioner` (gRPC) nor `orgEventPublisher` (Kafka) is configured for the deployment profile — server cannot complete the request |
| 401 | `UNAUTHORIZED` | Missing or invalid bearer JWT, or `userId`/`tenantId` could not be derived |
| 403 | `FORBIDDEN` | (a) Caller lacks `organization.view` AND is not platform admin (rejected by `ActiveOrg()`). (b) `view` passed but caller lacks `organization.manage` AND is not platform admin |
| 404 | `NOT_FOUND` | `activeOrg` does not match any org in the caller's tenant — generic code, no domain subtype |
| 500 | `INTERNAL_ERROR` | gw `WorkspaceService.ProvisionFromOrg` returned an error (appliance), or the Kafka publish failed (saasPublic), or the Permify gRPC call for the manage check errored. `provisionStatus` flips to `"provisionFailed"` (gw failure case only) before this response is returned |

#### Side effects

| Effect | Trigger condition | Notes |
|---|---|---|
| `organizations.provisionStatus` updated | Always when gw call is attempted | Flips to `"provisioning"` before gw call, then to `"active"` (success) or `"provisionFailed"` (error). No update on idempotent skip |
| `organizations.workspaceId` updated | Only on gw success | via `UpdateWorkspaceRef` |
| `organizations.eventIngestUri` updated | Only on gw success | Same write as `workspaceId` |
| Audit log row written | Always (after plan r1 §10 ships) | via `middleware.Audit(auditCfg)`; **requires the two `auditPrefixes` entries (`ingestReprovisionWorkspace`, `ingestEnableWebhook`)** — without those entries the middleware silently skips this route |
| gw delivery target registration | Best-effort, after `UpdateWorkspaceRef` succeeds | Only when `deliveryTargetRegistrar` is wired (appliance profile). Failure is non-fatal |
| `gw.workspace.provisioned.v1` Kafka message | saasPublic profile only | klynx publishes; `workspaceprovcons` updates the mirror on consumption. The 202 response is returned **before** that Kafka round-trip completes |

#### Status & eligibility reference

**Client branching guidance:** branch primarily on `details.provisionStatus`, **not** on `details.idempotent`. The `idempotent` field is informational only — `true` = "the server short-circuited because the org was already active"; `false` = "the server reached its decision through normal flow". It does NOT distinguish "newly provisioned" from "in-progress / no-op": both return `idempotent: false`.

```text
switch details.provisionStatus:
  "active"        → workspace ready; if details.idempotent, you can suppress a "success" toast
  "provisioning"  → poll GET /ingest/ until "active" (saasPublic async, or another caller already in flight)
  "provisionFailed" → gw call failed; treat as user-visible error; show retry CTA
  ""              → unexpected for a successful response; treat as error
```

**`provisionStatus` values:**

| Value | Meaning | Eligible for reprovision call? |
|---|---|---|
| `""` (empty) | Org never went through provisioning | yes |
| `"provisioning"` | gw call in progress | no — call returns current state, no double-trigger |
| `"active"` | Workspace exists and is healthy | **no — locked guarantee, never re-provisioned via this surface** |
| `"provisionFailed"` | Last gw call returned an error | yes |

**`workspaceId` semantics:**
- Empty string `""` means "no workspace mirror" — gw never confirmed one for this org.
- Non-empty value means "klynx believes this org has workspace X in gw" — may be stale if gw lost the workspace, but this surface does not re-validate against gw.
- The "no overwrite while active" property is a **service-layer guarantee** provided by the idempotency short-circuit at `internal/services/authzsvc/org.go:909-922` — `EnablePhibekWorkspace` returns immediately when `WorkspaceID != "" && provisionStatus == "active"` and never reaches the `UpdateWorkspaceRef` call. The repo layer does **not** enforce this and would happily overwrite if called directly. **Callers MUST go through the service.**

### 5.8 `PATCH /orgs/users/remove` — cascade OU cleanup

**Auth:** Bearer + `X-Active-Org`; caller must have `manage/user` on the active org.

**Request (unchanged):**

```json
{
  "users": [
    { "userId": "user-123", "role": "admin" },
    { "userId": "user-456" }
  ]
}
```

`users[*].role` is ignored on the remove path (accepted for symmetry with invite).

**Success Response (additive `removedFromOuIds`):**

```json
{
  "code": "SUCCESS",
  "message": "removed 2, not_member 0, error 0",
  "status": true,
  "details": [
    { "userId": "user-123", "success": true, "removedFromOuIds": ["ou-aaa", "ou-bbb"] },
    { "userId": "user-456", "success": true, "removedFromOuIds": [] }
  ]
}
```

- `removedFromOuIds` is present **only on items with `success: true`**.
- Value is the OU IDs whose `orgUnit.{member,admin}` tuples were attempted for delete (the delete itself is idempotent, so "attempted" and "removed-or-already-gone" are indistinguishable — both are safe).
- Empty array means the user had no OU memberships under this org.
- Source: enumerated via `orgUnitRepo.ListByOrg(ctx, tenantId, orgId)`; OU IDs appear in repository-list order.

**Partial / Error Item (unchanged shape):**

```json
{ "userId": "user-789", "success": false, "error": "user is not a member of this organization" }
```

| HTTP | Code | Meaning | FE Handling |
|---|---|---|---|
| 200 | `SUCCESS` | Per-user results in `details[]` | Read `details[*].success`; show toast with aggregate from `message` |
| 400 | `INVALID_REQUEST` | Missing `users[]` or malformed body | Toast error |
| 401 | `UNAUTHORIZED` | Missing / invalid token | Re-auth |
| 403 | `FORBIDDEN` | Caller lacks `manage/user` on org | Toast error |
| 409 | `REMOVE_OWNER_INVARIANT` | Would leave org without any owner | Toast; ask caller to transfer ownership first |

### 5.9 `GET /orgs/users/members` — username field

**Auth:** Bearer + `X-Active-Org`; caller must be a member of the active org.

**Request (unchanged):**

```http
GET /api/v3/orgs/users/members?page=1&perPage=10&search=<term>&sortField=role&sortOrder=desc
```

**Success Response (additive `username`):**

```json
{
  "code": "SUCCESS",
  "details": {
    "items": [
      {
        "userId": "user-123",
        "username": "somchai",
        "role": "member",
        "isOwner": false, "isAdmin": false, "isBillingOwner": false,
        "email": "somchai@example.com",
        "firstName": "Somchai", "lastName": "Sritrakul",
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
- Source: `authgw.UserProfile.Username` (Keycloak `username` claim). Populated in `internal/services/authzsvc/orgListMembers.go` profile-map loop. Canonical rule: `OrgMember.Username = UserProfile.Username`. No trimming, lowercasing, or rename.
- `summary`, `pagination`, and all other fields are unchanged. **`summary.active + summary.inactive == pagination.totalRecords`** (search-scoped — Q5 global summary WITHDRAWN 2026-04-25).

| HTTP | Code | Meaning | FE Handling |
|---|---|---|---|
| 200 | `SUCCESS` | Paginated result | Render items; use `summary` for aggregate counts |
| 401 | `UNAUTHORIZED` | Missing / invalid token | Re-auth |
| 403 | `FORBIDDEN` | Caller is not a member | Toast error |

---

## 6. Kafka / Async Event Surfaces

### `gw.workspace.provisioned.v1` (saasPublic profile only)

**Producer:** klynx-api (publishes during `EnablePhibekWorkspaceForUser` under saasPublic).
**Consumer:** `workspaceprovcons` (klynx-api side; updates the org `workspaceId` + `eventIngestUri` mirror on receipt).
**Trigger:** §5.7 reprovision under saasPublic; the 202 response is returned **before** this Kafka round-trip completes. Caller polls `GET /api/v3/ingest/` until `provisionStatus="active"` to observe completion.

This contract does not document the topic schema in detail — it is owned by the gateway-api side as part of the gw-integration umbrella. Klynx-api consumers should treat the message as advisory ("reconciliation hint"); the source of truth for `workspaceId` is still the gw `WorkspaceService` and its mirror updates via `UpdateWorkspaceRef`.

Note: under appliance profile, workspace provisioning is synchronous via gRPC `WorkspaceService.ProvisionFromOrg` and **does not** publish a Kafka message.

---

## 7. MQTT / Realtime Surfaces

`N/A — not in scope.` No realtime push for org lifecycle state. Workspace provisioning under saasPublic uses Kafka (above); under appliance it is synchronous. Push notification when saasPublic 202 finally completes is deferred (caller polls).

---

## 8. Redis / Cache Surfaces

`N/A — not in scope.` `TenantPolicyRepo` uses an in-process cache (not Redis); invalidated by `Upsert` so a PATCH is reflected on the next `POST /orgs` without a process restart.

---

## 9. Sync / Field-Ownership Surfaces

### 9.1 Canonical Stores

- `klynx-api.platform_license` (singleton)
- `klynx-api.tenant_policies` (per `tenantId`)
- `klynx-api.customer_accounts` (per `customerAccountId`)
- `klynx-api.customer_account_policies` (per user)
- `klynx-api.organizations` (per `orgId`)
- `klynx-api.subscriptions` (keyed by `orgId`; tenant-keyed deprecated)
- Permify (`organization`, `orgUnit` entity tuples)
- Keycloak realms (read by `authgw.ListRealms` + `UserProfile`)
- `gateway-api/WorkspaceService` (workspace identity; klynx-api mirrors via `UpdateWorkspaceRef`)

No projection store: all four policy layers read directly from canonical; subscription is canonical not a projection.

### 9.2 Field Ownership

| Field | Authoritative Writer | Allowed Initiator | Stored In | Notes |
|---|---|---|---|---|
| `platform_license.selfServiceOrgCreationEnabled` | `adminapi.PlatformLicenseController.Update` / activation flow | platform admin | `platform_license` | unchanged write path |
| `tenant_policies.allowSelfServiceOrgCreation` | `adminapi.TenantPolicyController.Patch` (read-merge-upsert) | platform admin (PATCH); activation flow (insert-only); startup (insert-only) | `tenant_policies` | preserve admin overrides on re-activation |
| `tenant_policies` (whole document) | `adminapi.TenantPolicyController.Patch` | platform admin (PATCH); activation flow (insert-only); startup (insert-only) | `tenant_policies` | seed/backfill always write `DefaultTenantPolicy`, never mirror license value |
| `subscriptions.orgId` | `subscriptionsvc` bootstrap/repair/activation-orchestration | admin (direct or via license activation) | `subscriptions` | Immutable once set |
| `subscriptions.planId` | `subscriptionsvc` activation-orchestration (`appliance`) **OR** `subscriptionsvc` bootstrap/repair (other paths) | admin / customer plan recalc / **license activation under `appliance`** | `subscriptions` | Repair never overwrites; activation orchestration's Cases C/D do, with audit. `UpdateOverrides` is emergency-only |
| `subscriptions.customerAccountId` | `subscriptionsvc` bootstrap/repair/activation-orchestration | admin | `subscriptions` | Always set on create; backfilled when missing |
| `organizations.customerAccountId` | `authzsvc` org create / repair backfill / activation-orchestration backfill | admin | `organizations` | Repair only backfills when missing and unambiguous; never overwrites |
| `organizations.workspaceId` | `OrgRepo.UpdateWorkspaceRef` only via service `EnablePhibekWorkspaceForUser` | service-layer idempotency guarded | `organizations` | Repo would overwrite if called directly — must go through service |
| `organizations.provisionStatus` | `OrganizationService.EnablePhibekWorkspaceForUser` | service-layer flow | `organizations` | Flips to `"provisioning"` before gw call, then `"active"` / `"provisionFailed"` |
| `organizations.eventIngestUri` | `OrgRepo.UpdateWorkspaceRef` via service | service-layer flow | `organizations` | Same write as `workspaceId` |
| `customer_accounts.maxOrganizations` | `customerrepo` (provisioning + paid upgrades); migration script (only for approved rows); ops tooling (manual bespoke overrides) | admin / migration / ops | `customer_accounts` | Bespoke caps preserved; not forced |
| Permify `organization.member`/`admin`/`owner` tuples | org create / `PATCH /orgs/users/remove` (delete) | admin | Permify | cascade over OU tuples runs prior to org-level delete (post-this contract) |
| Permify `orgUnit.member`/`admin` tuples | org-unit management surfaces; `PATCH /orgs/users/remove` (cascade delete) | admin | Permify | enumerated via `orgUnitRepo.ListByOrg` for cascade |
| `platform_licenses.artifactMeta` | `licensesvc` activation | admin | `platform_licenses` | Replaced wholesale on each activation; not modified by repair or reconcile |

### 9.3 Conflict Resolution

- **Tenant policy:** Admin PATCH wins over activation seed and startup backfill, because seed and backfill skip rows that already exist. No bidirectional sync. No echo loop. Last-write-wins among admin PATCH calls. The in-process cache in `TenantPolicyRepo` is invalidated by `Upsert` so a PATCH is reflected on the next `POST /orgs` without a process restart.
- **Subscriptions:** idempotency key for repair (manual or activation-driven Case A) is `orgId`. If an `orgId`-keyed subscription already exists and matches `licensePlanId` (Case B), no write occurs. If it exists with a different tier (Cases C/D), activation orchestration mutates `planId` only — `overrides`, `billingCycle`, `status`, `customerAccountId` are preserved. Customer backfill is one-way and only applied when missing; never overwrites an existing `customerAccountId`. Manual repair endpoint never overwrites an existing `planId` (returns `repairAction: "reused"`); only activation orchestration may change `planId` on an existing subscription, and only under `appliance`. Plan change for a repaired org under `appliance` happens via license activation. `UpdateOverrides` is an emergency temporary workaround only.
- **Workspace:** "no overwrite while active" guarantee via service-layer idempotency short-circuit. Concurrent calls do not double-provision; second observes `provisioning` and is told to wait.
- **Member cleanup:** OU tuple delete is idempotent; cascade is enumerated then executed in repo-list order.

### 9.4 Quota Enforcement Migration (one-shot)

**Tool:** `cmd/migrate-customer-org-limits/` (or equivalent repo-standard path).

**3-phase flow:**
1. Dry-run → full drift report (stdout).
2. Ops curates the drift report: removes any row that represents a legitimate bespoke cap. Saved as `approved.json` (same JSON schema). Attached to the change ticket.
3. Apply: `--apply --input approved.json`. The binary writes ONLY rows that exist in `approved.json`, AND that are not excluded via `--exclude-tenant` / `--exclude-plan`.

**CLI:**

```text
migrate-customer-org-limits [flags]

  --dry-run              (default)  Emit drift report; no writes.
  --apply                           Write mode. REQUIRES --input.
  --input <path>                    Path to ops-approved JSON. Only rows in this file are written.
  --exclude-tenant <id>             Repeatable. Skip this tenantId even if present in --input.
  --exclude-plan <planId>           Repeatable. Skip every row with this planId.
  --mongo-uri <uri>                 Overrides env-resolved URI.
  --output <path>                   Write the final apply-mode stats JSON to this path.
```

**Safety invariants:**

| Invariant | Enforced by |
|---|---|
| `--apply` without `--input` exits non-zero | Argument parser |
| A `customer_accounts` row absent from `--input` is never written | Apply loop iterates `--input`, not the collection |
| A row already at `expected` on re-read is skipped and logged | Apply loop re-reads before write |
| `--exclude-tenant` / `--exclude-plan` override `--input` (deny-list wins) | Apply loop checks exclusion first |

**Report row schema:**

```json
{
  "tenantId": "tenant-123",
  "planId": "pro",
  "oldValue": 10,
  "newValue": 5,
  "currentOrgCount": 7,
  "willBeOverLimit": true
}
```

`willBeOverLimit := currentOrgCount > newValue`.

**End-of-run summary:**

```json
{
  "mode": "apply",
  "examined": 120,
  "drifted": 37,
  "approvedForApply": 30,
  "excluded": 7,
  "applied": 30,
  "skippedAlreadyAligned": 0,
  "willBeOverLimit": 4
}
```

`approvedForApply + excluded == drifted` when ops curated correctly; dry-run mode fills `approvedForApply = 0, excluded = 0, applied = 0`.

---

## 10. Quota Canonical (Layer 3b enforcement table)

`DefaultOrgLimitsByPlan(planId)` (Go-side canonical, `models/custmod/customer.go`) must stay numerically equal to `SubscriptionLimits.MaxOrganizationsPerTenant` in the subscription seed (`internal/repo/subscriprepo/subscriptionBootstrap.go`). Diff at review time will be flagged manually — no automated sync.

| planId | `DefaultOrgLimitsByPlan(planId)` | Notes |
|---|---|---|
| `free` | `1` | Unchanged |
| `pro` | `5` | **Changed** (was `10`); matches Pricing page display |
| `max` | `50` | Unchanged |
| `enterprise` | `-1` (unlimited) | Unchanged |
| other / unknown | `1` (free default) | Unchanged |

**Alignment rule (post-migration):**
- `DefaultOrgLimitsByPlan(planId) == subscriptions.packages.limits.maxOrganizationsPerTenant` for the same `planId` — always, by code review.
- `customer_accounts.maxOrganizations == DefaultOrgLimitsByPlan(doc.planId)` — **only for rows included in the ops-approved migration input**. Rows excluded by ops (bespoke caps) keep their existing value.
- Bespoke overrides remain a supported ops operation after this contract; the template is the default, not a forced cap.

**Over-limit policy (explicit):**
- Existing orgs are **never deleted** by this contract.
- Future `POST /orgs` attempts from an over-limit tenant return HTTP 403 `details.cause="limit"`.
- Backend logs `over_limit_at_create_attempt=true` (structured zerolog field) on each such attempt so ops can observe post-migration pressure.

---

## 11. Frontend Integration Notes

### Required FE Inputs

| FE Use Case | Contract Surface | Required Fields | Notes |
|---|---|---|---|
| Org-create button visibility | `GET /me/effectiveAccess` | `canCreateOrganization` (bool) | no change required; tightened to deployment-level. Clicking may still 403 |
| Org-create error toast | `POST /orgs` 403 | `code`, `message`, `details.cause` (optional) | display `message` as-is; optionally branch on `details.cause` ∈ `{license, tenantPolicy, customer, limit, user}` for clearer helper copy |
| Admin "Tenant deployment settings" page (deferred) | `GET/PATCH /admin/tenantPolicies/:tenantId` | `tenantId`, `deploymentMode`, `allowSelfServiceOrgCreation`, `isDefault`, `updatedAt` | gate visibility on `platformRole=administrator`; show "Default" badge when `isDefault=true`; PATCH may send only changed fields |
| Workspace recovery button | `POST /api/v3/ingest/reprovisionWorkspace` | none (no body) | branch on `details.provisionStatus`; show toast based on outcome |
| Members page (admin org view) | `GET /orgs/users/members` | `username`, `role`, `email`, `enabled`, `avatar` | `username` may be omitted (KC profile missing) — show `-` / fall back to email |
| Remove user(s) | `PATCH /orgs/users/remove` | `users[]` | optionally surface `removedFromOuIds.length` in toast |
| Pricing / Subscription pages | (existing subscription package endpoints) | unchanged | post-deploy re-fetch shows aligned `5` for Pro |
| Admin license activation tooling (internal) | `POST /admin/platformLicense/activate` | `subscriptionRepair.status`, `counts`, `samples` | Treating activation `200` as "deployment ready" without inspecting `subscriptionRepair.status` is incorrect under `appliance` |

### FE Field Mapping

| FE Field | Backend Field | Direction | Notes |
|---|---|---|---|
| `tenantPolicy.allowSelfServiceOrgCreation` | `details.allowSelfServiceOrgCreation` | response (GET) | toggle in admin UI |
| `tenantPolicy.allowSelfServiceOrgCreation` | request body field, same name | request (PATCH) | optional; absent = preserve (read-merge-upsert) |
| `tenantPolicy.isDefault` | `details.isDefault` | response (GET) | "this tenant has no persisted policy yet" badge |
| `errorCause` | `details.cause` | response (POST /orgs 403) | optional UI branch |
| `workspaceState` | `details.provisionStatus` + `details.idempotent` | response (POST reprovision) | branch on `provisionStatus` primarily |
| `username` column | `details.items[].username` | response (GET members) | render empty when missing — do NOT fall back to `email` |
| `removedFromOuIds[]` | `details[].removedFromOuIds` | response (PATCH remove) | optional toast detail |

### FE Guardrails

- Do not guess `TenantPolicy` field names — read from this contract.
- Do not assume `details.cause` is always present on 403 — it is additive; absence = legacy / pre-rollout response.
- Do not switch on `details.cause` for routing — use top-level `code: "FORBIDDEN"` for routing, `details.cause` for message specialization.
- Treat `effectiveAccess.canCreateOrganization=true` as "show the button"; the API may still 403 — handle in toast.
- Do NOT fall back to `email` locally for the username column; render empty when `username` is absent.
- Do NOT branch reprovision logic on `details.idempotent` alone — use `details.provisionStatus`.
- For activation response, **must read `subscriptionRepair.status`** in any internal admin tooling. Treating `200` alone as "deployment ready" is incorrect under `appliance`.
- FE must not call activation / repair / reconcile from user-facing flows — they are admin-only.
- The documented error codes are the only supported contract; do not map `500 ACTIVATION_FAILED`, `500 REPAIR_FAILED`, or `500 RECONCILE_FAILED` to business logic.
- Auth-layer 401/403 follow middleware native shape, not the `{code, message, status}` envelope — handle both.
- klynx-feature does **not** need to read `removedFromOuIds` for the happy path, but it MAY use the array length for a friendlier toast.

---

## 12. Rollout Notes

| Repo | Dependency | Required Before | Notes |
|---|---|---|---|
| `klynx-api` | foundation `deploymentProfileConsolidation` | — | Activation orchestration reads `EffectiveProfile`; foundation must be in place first. Already shipped |
| `klynx-api` | this contract | Phase 1 implementation | BE ships first; bumps `version.go` minor |
| `klynx-feature` | new admin `tenantPolicies` endpoints | Phase 3 (deferred) | Additive UI; no API breakage if delayed |
| `klynx-api` | reprovisionWorkspace + audit prefixes | shipped (r1+r2) | Audit middleware requires `auditPrefixes` entries to capture this surface |
| `klynx-api` | member cleanup OU cascade | shipped | Tier 1 fix |
| `klynx-api` | username on member list | shipped | Tier 1 |
| `klynx-api` | quota canonical + migration | shipped (Q1; Q5 withdrawn) | Migration is one-shot ops binary; existing orgs preserved |
| ops runbook | Endpoint semantics live in UAT | Prod cutover | Activation `subscriptionRepair.status` must be inspected before declaring deployment ready |

---

## 13. Examples

### 13.1 First-PATCH on a tenant with no row (single field)

```http
PATCH /admin/tenantPolicies/pattaya
Authorization: Bearer <admin-jwt>
{
  "allowSelfServiceOrgCreation": false
}
```

Response (note: absent fields fall back to `DefaultTenantPolicy`):

```json
{
  "code": "SUCCESS",
  "details": {
    "tenantId": "pattaya",
    "deploymentMode": "selfServiceSaas",
    "allowSelfServiceOrgCreation": false,
    "allowOrgAdminManageMenuPerm": true,
    "allowOrgAdminManageResPerm": true,
    "isDefault": false
  }
}
```

### 13.2 POST /orgs denied by license (Layer 1)

```json
{
  "code": "FORBIDDEN",
  "message": "organization creation is disabled by deployment policy",
  "status": false,
  "details": { "cause": "license" }
}
```

Recovery: `PATCH /admin/platformLicense {"selfServiceOrgCreationEnabled": true}`.

### 13.3 POST /orgs denied by customer-account limit (Layer 3b)

```json
{
  "code": "FORBIDDEN",
  "message": "organization limit reached for this customer plan",
  "status": false,
  "details": { "cause": "limit" }
}
```

Recovery: out of scope here — handled by `/admin/customers` surface (raise `MaxOrganizations`) or by upgrading the plan.

### 13.4 Activation under `appliance` (complete, fresh activation)

```json
{
  "code": "SUCCESS",
  "details": {
    "platformLicense": { "licenseMode": "enterprise", "...": "..." },
    "action": "activate",
    "subscriptionRepair": {
      "status": "complete",
      "counts": {
        "scanned": 5, "created": 5, "reused": 0,
        "upgraded": 0, "downgraded": 0,
        "skippedCustomerUnresolved": 0, "errors": 0,
        "unknownFromPlanId": 0
      },
      "samples": { "created": ["a", "b", "c", "d", "e"], "upgraded": [], "downgraded": [], "unknownFromPlanId": [], "skippedCustomerUnresolved": [], "errors": [] },
      "generatedAt": "2026-04-23T10:15:00Z"
    }
  }
}
```

### 13.5 Activation under `appliance` (partial, one org missing customer)

`subscriptionRepair.status: "partial"`, `counts.skippedCustomerUnresolved: 1`, `samples.skippedCustomerUnresolved: ["e"]`. Operator must follow up via §5.5 manual repair per affected org after fixing customer ownership.

### 13.6 Activation under `platform` (skipped)

```json
{
  "code": "SUCCESS",
  "details": {
    "platformLicense": { "...": "..." },
    "action": "activate",
    "subscriptionRepair": { "status": "skipped", "reason": "platform-profile-operator-controlled" }
  }
}
```

### 13.7 Manual repair under `appliance` (created, license-derived plan)

```json
{
  "code": "SUCCESS",
  "details": {
    "orgId": "d1aea392-...",
    "planId": "enterprise",
    "customerAccountId": "PTY01",
    "status": "active",
    "repairAction": "created",
    "planSource": "license"
  }
}
```

### 13.8 Manual repair (CUSTOMER_UNRESOLVED — short-circuit before write)

```json
{
  "code": "CUSTOMER_UNRESOLVED",
  "message": "cannot resolve customer for org: org.customerAccountId is missing and no unambiguous customer match was found",
  "status": false
}
```

### 13.9 Workspace reprovision — recover stuck org (curl)

```bash
curl -X POST "https://aliza.k-lynx.com/api/v3/ingest/reprovisionWorkspace" \
  -H "Authorization: Bearer $JWT" \
  -H "X-Active-Org: 390ac6ec-073b-4265-99da-9c17b7a2c4f5"
```

First call (stuck → recovered, appliance):

```json
{
  "code": "SUCCESS",
  "details": {
    "orgId": "390ac6ec-...", "workspaceId": "2688fa46-...",
    "eventIngestUri": "/events/2688fa46-.../",
    "provisionStatus": "active", "idempotent": false
  }
}
```

Second call (already active):

```json
{
  "code": "SUCCESS",
  "details": {
    "orgId": "390ac6ec-...", "workspaceId": "2688fa46-...",
    "eventIngestUri": "/events/2688fa46-.../",
    "provisionStatus": "active", "idempotent": true
  }
}
```

After recovery: `GET /api/v3/thirdParty/files/canonical/2688fa46-.../events/<eventId>/<filename>` should stop returning 500 INTERNAL_ERROR (200 if file exists, 404 `EVENT_NOT_FOUND` / `FILE_NOT_FOUND` otherwise — but not 500).

### 13.10 Reconcile

```http
POST /admin/subscriptions/reconcile?limit=50
Authorization: Bearer <jwt-of-administrator>
```

```json
{
  "code": "SUCCESS",
  "details": {
    "counts": {
      "orgsMissingSubscription": 2,
      "orgsMissingCustomer": 1,
      "subscriptionsMissingCustomer": 0
    },
    "samples": {
      "orgsMissingSubscription": ["d1aea392-...", "a5b2c9e1-..."],
      "orgsMissingCustomer": ["c3f4a1b2-..."],
      "subscriptionsMissingCustomer": []
    },
    "limit": 50,
    "generatedAt": "2026-04-22T09:00:00Z"
  }
}
```

### 13.11 Member remove — happy path with OU cascade

```http
PATCH /api/v3/orgs/users/remove
{ "users": [{"userId": "user-123"}, {"userId": "user-456"}] }
```

```json
{
  "code": "SUCCESS",
  "message": "removed 2, not_member 0, error 0",
  "details": [
    { "userId": "user-123", "success": true, "removedFromOuIds": ["ou-aaa", "ou-bbb"] },
    { "userId": "user-456", "success": true, "removedFromOuIds": [] }
  ]
}
```

### 13.12 Member remove — REMOVE_OWNER_INVARIANT

Removing the last owner returns `409 REMOVE_OWNER_INVARIANT`; no cascade occurs.

### 13.13 Member list — username present

```json
{
  "code": "SUCCESS",
  "details": {
    "items": [
      { "userId": "user-123", "username": "somchai", "role": "member", "email": "somchai@example.com", "enabled": true }
    ],
    "summary": { "active": 35, "inactive": 15 }
  },
  "pagination": { "page": 1, "perPage": 10, "totalRecords": 50, "totalPages": 5 }
}
```

### 13.14 Member list — username omitted (KC profile missing)

```json
{
  "items": [
    { "userId": "user-soft-deleted", "role": "member", "email": "" }
  ]
}
```

`username` is absent — FE must tolerate. Other fields present as before.

### 13.15 Quota — Pro tenant at-limit after migration

```text
Pro tenant has 6 existing orgs after migration (canonical limit = 5).
GET /orgs returns all 6 (existing orgs are preserved).
POST /orgs returns 403 FORBIDDEN details.cause="limit"; structured log over_limit_at_create_attempt=true.
After delete one org → GET /orgs returns 5 → POST /orgs still returns 403 (at-limit is also >=).
After delete another → 4 → next POST /orgs succeeds.
```

---

## 14. Out of Scope (Not in This Contract)

- Tenant-level "list all stuck orgs" admin endpoint.
- Bulk reprovision across multiple orgs in one request.
- Background reconciler / startup auto-reprovision (deferred).
- Force-recreate of an active workspace (locked out by §5.7 guarantee).
- Async push notification when saasPublic 202 finally completes — caller polls `GET /api/v3/ingest/`.
- Sweep tooling for historical OU drift (users removed from an org before this contract lands may still appear in OU listings).
- "in_progress" subscription status; async orchestration deferred.
- Q5 user-list global summary (WITHDRAWN 2026-04-25 by product owner).
- Customer-account limit repair / backfill admin tooling — covered by `customerAccountLimitRepair.md`.
- Permify schema additive (`@user` relations on org/orgUnit) — separate hardening plan if needed.

---

## 15. Decisions (preserved verbatim from source contracts)

**org-creation-policy-alignment:**
- D1 (Codex rev 1): top-level `code` for 403 deny path stays `"FORBIDDEN"` for all five causes — no new gmod codes; `details.cause` is the only addition. Matches existing `MapSvcError` flow without controller mapping rewrite.
- D2 (rollback safety): activation seed and startup backfill always write `DefaultTenantPolicy` (open). They do **not** mirror the license value. Layer 1 absolute guarantees that a permissive tenant policy cannot leak through when the license is false.

**orgSubscriptionRepair (Revision 5):**
- D2 enterprise artifact predicate: `licenseMode == "enterprise"` AND `ArtifactMeta != nil` AND `ArtifactMeta.Source == "artifact"` AND `ArtifactMeta.ActivatedAt is non-zero`.
- D4 (customer resolution short-circuit): repair must short-circuit to `CUSTOMER_UNRESOLVED` before any write if customer cannot be resolved unambiguously.
- Case E unknown-plan handling: tier 0 → upgrade + warn log + `samples.unknownFromPlanId`; counted separately from `upgraded`.
- Partial rule single-sourced: `partial` when `errors > 0` OR `skippedCustomerUnresolved > 0`; `unknownFromPlanId` alone does not force partial.

**org-workspace-reprovision (r1):**
- 12.3 (locked guarantee): no force-recreate when `provisionStatus == "active"`. Future force-recreate flow MUST be a separate route with its own contract version and explicit safeguards.
- 12.7 (platform admin bypass): platform admin (`platformRole=administrator`) bypasses both the Permify `view` check AND the service-layer `manage` check. NOT required to hold a Permify `manage` tuple.

**plan-limit-canonical (v1-rev3):**
- Q1: canonical Pro limit = 5; one-shot migration with ops-curated `--input approved.json`; bespoke caps preserved via deny-list.
- Q5 WITHDRAWN 2026-04-25: global summary reverted; user list endpoints fall back to original "summary tracks search" behavior.

---

## 16. Implementation evidence

| Surface | File | Note |
|---|---|---|
| `POST /orgs` 4-layer gate | [internal/services/authzsvc/org.go](../../internal/services/authzsvc/org.go) (`OrganizationService.Create`) | sentinel errors `ErrOrgCreationDisabled` / `ErrOrgLimitReached` / `ErrUserNotEnabled` / `ErrForbidden` mapped via `MapSvcError` |
| `details.cause` cause carrier | [internal/services/authzsvc/errors.go](../../internal/services/authzsvc/errors.go) | `WithCause` cause carrier + `ErrorDetails` propagates through `mapCustomerGateErr` |
| `effectiveAccess.canCreateOrganization` | [internal/services/authzsvc/effectiveAccess.go](../../internal/services/authzsvc/effectiveAccess.go) | ANDs license + tenant policy as deployment-level visibility signal |
| `tenantPolicies` admin surface | `internal/services/policysvc/tenantPolicy.go`, `controllers/adminapi/tenantPolicy.go` | New `policysvc.TenantPolicyService` + `adminapi.TenantPolicyController`; read-merge-upsert via `subscriprepo.TenantPolicyRepo` |
| Activation seed + startup backfill | [internal/services/licensesvc/](../../internal/services/licensesvc/) (`PlatformActivationService.runTenantPolicySeed`), `Container.RunStartupBackfill` in `main.go` | non-fatal partial result on `ActivateResult.TenantPolicySeed`; tenant enumeration via `customerrepo.ListAllTenantIds` (G1.b — `authgw.ListRealms` doesn't exist) |
| Subscription orchestration | [internal/services/subscriptionsvc/orchestration.go](../../internal/services/subscriptionsvc/orchestration.go), `repair.go` | profile-aware Cases A-E |
| Workspace reprovision service | [internal/services/authzsvc/org.go:909-922](../../internal/services/authzsvc/org.go#L909-L922) | idempotency short-circuit for active workspace |
| Reprovision routes | `router/ingest.go`, `controllers/orgapi/EnablePhibekWorkspace` | dual route (reprovisionWorkspace + enableWebhook alias) |
| Workspace mirror update | [internal/repo/authzrepo/org.go:278-288](../../internal/repo/authzrepo/org.go#L278-L288) | `UpdateWorkspaceRef` |
| Member cleanup cascade | `internal/services/authzsvc/orgRemove.go` (`RemoveUser`) | cascades `orgUnit.{member,admin}` tuple deletes via `orgUnitRepo.ListByOrg` before org-level delete |
| Member list username | [internal/services/authzsvc/orgListMembers.go:185-191](../../internal/services/authzsvc/orgListMembers.go#L185-L191) | profile-map loop reads `UserProfile.Username` |
| Quota canonical | [models/custmod/customer.go](../../models/custmod/customer.go) (`DefaultOrgLimitsByPlan`) | Go-side canonical |
| Quota seed | [internal/repo/subscriprepo/subscriptionBootstrap.go](../../internal/repo/subscriprepo/subscriptionBootstrap.go) | `SubscriptionLimits.MaxOrganizationsPerTenant` |
| Migration binary | [cmd/migrate-customer-org-limits/](../../cmd/migrate-customer-org-limits/) | 3-phase dry-run → curate → apply |
| Tests | `orgCreatePolicy_test.go`, `tenantPolicy_test.go` (cause-matrix + license fail-open + read-merge-upsert + seed idempotency + admin-override preservation) | `go build ./...` + `go test ./...` ✅ |

---

## 17. Checklist

- [x] Domain / flow boundary explicit (§0 — 10 REST surfaces + 1 Kafka topic + migration tool; explicit excludes for permission-profile, resource-group, camera CRUD, customer/policy CRUD, user profile, role editing, inactivity).
- [x] Owner backend explicit (`klynx-api`).
- [x] System of record per domain (5 Mongo stores + Permify + Keycloak + gateway-api Workspace + EffectiveProfile + tenant-keyed deprecated).
- [x] Canonical store and projection store documented.
- [x] Producers and consumers listed for every surface in scope.
- [x] REST request, response, and error contracts defined for all 10 endpoints (full error matrices preserved verbatim).
- [x] 4-layer policy gate + 5 cause discriminators preserved with messages and recovery paths.
- [x] Layer 3b per-customerAccountId scope note preserved (added 2026-04-29).
- [x] Tenant policy read-merge-upsert + first-PATCH defaults preserved.
- [x] Activation orchestration profile matrix (`appliance` / `platform` / `saas`) + Cases A-E + tier ordering + Case E unknown-plan handling preserved.
- [x] Partial rule single-sourced (errors > 0 OR skippedCustomerUnresolved > 0; unknownFromPlanId alone does NOT force partial).
- [x] Manual repair profile-aware plan resolution preserved (license under appliance; customer-first under platform/saas; D2 predicate; D4 short-circuit).
- [x] Workspace reprovision dual routes (alias) + idempotency guarantee + locked no-force-recreate + 2-layer auth + r1 wire-surface corrections preserved.
- [x] Side effects table preserved (provisionStatus / workspaceId / eventIngestUri / audit / delivery target / Kafka).
- [x] Member cleanup OU cascade + REMOVE_OWNER_INVARIANT + idempotent delete preserved.
- [x] Member list username field + KC-missing-omit semantics preserved.
- [x] Quota canonical map + alignment rule + bespoke override preservation + over-limit policy preserved.
- [x] Migration tool 3-phase flow + safety invariants + report schema + end-of-run summary preserved.
- [x] Q5 WITHDRAWN explicitly noted in revision history + §3 + §0 excluded surfaces.
- [x] Kafka `gw.workspace.provisioned.v1` documented as included surface (saasPublic only).
- [x] MQTT N/A — explained.
- [x] Redis N/A — explained (in-process cache only).
- [x] Field ownership table preserved.
- [x] Backward compatibility documented per-source (additive policy with one Layer 1 enforcement change; additive activation response with appliance behavioral change; additive workspace alias; additive remove cascade; additive member username; additive quota canonical change with migration).
- [x] Replay / re-sync behavior documented per surface.
- [x] FE field mapping included.
- [x] Examples cover policy gate (license/limit), activation (complete/partial/platform-skipped), manual repair (created/CUSTOMER_UNRESOLVED), reprovision (recover/idempotent), reconcile, member remove with cascade, member list with username present/omitted, quota at-limit.
- [x] Decisions (D1, D2 license-not-mirrored, D2 enterprise predicate, D4, Case E, partial rule, 12.3 locked guarantee, 12.7 admin bypass, Q1, Q5 withdrawn) preserved verbatim.
- [x] Implementation evidence table preserved.
