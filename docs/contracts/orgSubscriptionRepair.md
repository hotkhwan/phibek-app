# Org Subscription Repair And Activation Orchestration Contract

**Date:** 2026-04-23
**Status:** Superseded by [`org-lifecycle.md`](./org-lifecycle.md) on 2026-05-04 — all 3 admin REST surfaces (`POST /admin/platformLicense/activate` with `subscriptionRepair` block + Cases A-E + profile matrix; `POST /orgs/{orgId}/subscription/bootstrap` with profile-aware plan resolution + D2 enterprise artifact predicate + D4 customer-resolution short-circuit; `POST /admin/subscriptions/reconcile` detect-only zero-write) preserved verbatim in §5.4-§5.6 of the merged contract. Single-sourced partial rule (`partial` when `errors > 0` OR `skippedCustomerUnresolved > 0`; `unknownFromPlanId` alone does NOT force partial), Case E unknown-plan handling (tier 0 → upgrade + warn log + `samples.unknownFromPlanId`), `planSource` profile-aware enum (`"license"` appliance-only / `"customer"`/`"enterpriseArtifact"` platform-saas only / `"existing"` any reused), tier ordering (`free=1, pro=2, max=3, enterprise=4`), and auth-middleware error shape divergence (401/403 native shape vs `{code, message, status}` envelope) all preserved. Body kept here for PR / Codex review history.
**Owner Backend:** `klynx-api`
**Related Plan:** [docs/plan/orgSubscriptionRepair.md](../plan/orgSubscriptionRepair.md)
**Cites:** [docs/contracts/deploymentProfile.md](deploymentProfile.md) — canonical profile enum
**Applies To Repos:** `klynx-api`
**Contract Type:** `REST`
**Version:** `v1` (additive — activation response gains `subscriptionRepair` block; existing fields preserved)

---

## 1. Purpose

Defines the three admin REST surfaces that, together, keep `subscriptions` consistent with platform license state and with org/customer ownership:

1. `POST /admin/platformLicense/activate` — runs a profile-aware subscription repair pass after the artifact is persisted, and returns a structured `subscriptionRepair` summary. Activation HTTP status reflects only the artifact-persist outcome; subscription-repair partial failures are reported in-body.
2. `POST /orgs/{orgId}/subscription/bootstrap` — idempotent per-org repair. API surface is unchanged from the earlier manual-repair contract; internal plan resolution is now profile-aware so it matches the license-is-authority rule in §5.1. Remains the targeted retry / per-org repair surface.
3. `POST /admin/subscriptions/reconcile` — detect-only report of legacy gaps, performs zero writes. API surface unchanged; internal implementation delegates to the same lower-level scanner that activation consumes (see §5.1).

Activation is the orchestrator: under the `appliance` profile, activation drives the seed / idempotent / upgrade / auto-downgrade matrix across all org-keyed subscriptions in the deployment. Under `platform` and `saas`, activation explicitly skips subscription writes and reports the skip — never silently diverging.

- klynx-api is the sole backend owner.
- Activation is no longer a pure license-state write under `appliance`; consumers must read the `subscriptionRepair` block to determine whether the deployment is ready for use.
- Repair and reconcile endpoints retain Revision 3 semantics.
- Consumers must not infer plan resolution, error semantics, or repair behavior from prior endpoint behavior or implementation details.

---

## 2. Ownership

### Owner Backend

- `klynx-api`

### Domain System of Record

| Domain | System of Record | Canonical Store | Notes |
|---|---|---|---|
| Per-org runtime quota | `klynx-api` | `subscriptions` keyed by `orgId` | Canonical |
| Org → customer linkage | `klynx-api` | `organizations.customerAccountId` | Authoritative on the org document |
| Commercial plan | `klynx-api` | `customer_accounts.planId` | Drives plan resolution under `platform` and `saas` only. Under `appliance`, license is plan authority and `customerAccount.planId` is not consulted for plan resolution. |
| Platform licensing mode | `klynx-api` | `platform_licenses` | Authoritative for `appliance` plan derivation; reference-only for `platform` |
| Deployment profile | `klynx-api` | `config.EffectiveProfile` (process-local) | Branch selector for activation orchestration; canonical from foundation contract |
| Tenant-keyed subscription | `klynx-api` | `subscriptions` keyed by `tenantId` | Deprecated; compatibility fallback only |

### Producer / Consumers

| Surface | Producer | Consumers | Notes |
|---|---|---|---|
| `POST /admin/platformLicense/activate` | ops admin (role `administrator`) | klynx-api licensesvc + subscriptionsvc orchestration | Existing endpoint; response shape extended with the `subscriptionRepair` block defined in §5.1 |
| `POST /orgs/{orgId}/subscription/bootstrap` | ops admin (role `administrator`) | klynx-api subscriptionsvc | Targeted retry / per-org repair (Revision 3) |
| `POST /admin/subscriptions/reconcile` | ops admin (role `administrator`) | klynx-api subscriptionsvc | Detect-only report (Revision 3) |

### Projection Stores

- None. `subscriptions` is canonical, not a projection.

---

## 3. Compatibility and Policy

### Backward Compatibility

- `/admin/platformLicense/activate`: **additive (response) + behavioral (under `appliance` only)**.
  - Added response field: `subscriptionRepair` (object).
  - Preserved response fields: `platformLicense`, `action`.
  - Behavior change: under `appliance`, activation now mutates `subscriptions` (creates/updates/downgrades) according to §5.1 case matrix. Under `platform` and `saas`, no subscription writes occur.
  - HTTP status semantics: unchanged. Activation success/failure is reflected in HTTP status; subscription-repair partial failures are reported in-body via `subscriptionRepair.status: "partial"`.
  - Auth: unchanged (`administrator` role already enforced).
- `/orgs/{orgId}/subscription/bootstrap`: **API surface unchanged; internal plan resolution now profile-aware.** Under `appliance` the plan comes from license (D2 predicate); under `platform`/`saas` the plan comes from the customer-first rule carried over from earlier revisions. Response `planSource` enum gains `"license"` for the appliance-only branch. Customer resolution rule (D4) is unchanged across profiles. Still idempotent; existing subscriptions still return `repairAction: "reused"` without plan mutation.
- `/admin/subscriptions/reconcile`: **API surface unchanged (same success shape, detect-only, zero writes).** Internal implementation delegates to the shared scanner that activation orchestration also consumes; no externally observable difference.
- Consumer requirements:
  - Callers that ignored the activation response body are unaffected.
  - Internal admin tooling that treats activation `200 OK` as "deployment ready" must read `subscriptionRepair.status` after this contract ships. Treating `200` alone as ready is incorrect under `appliance`.
- Deprecation window: none required at the contract level.

### Replay / Re-sync Behavior

- Activation under `appliance`: replay (re-activating the same artifact) re-runs the case matrix; under steady state every org is classified Case B (idempotent) and no writes occur. Repeated activation is safe.
- Repair endpoint: replay supported, idempotent by `orgId`. Re-invocation rule: if an `orgId`-keyed subscription exists, return it with `repairAction: "reused"` and perform no writes.
- Reconcile endpoint: read-only, trivially idempotent.

### Write Authority Policy

- `klynx-api` `subscriptionsvc` is the only authoritative writer for `subscriptions`. Entry paths into the writer:
  1. `bootstrap` — at org create
  2. `RepairOrgSubscription` — used by the manual `/orgs/{orgId}/subscription/bootstrap` endpoint only (profile-aware; see §5.2)
  3. `OrchestrateActivationRepair` — activation orchestration. Case A seeds subscriptions with `licensePlanId` directly via `subRepo.UpsertDefaultForOrg` (bypassing `RepairOrgSubscription` because that function's customer-plan-first rule contradicts appliance license authority). Cases C/D/E write plan updates through `subRepo.UpdatePlanIdWithAudit`.
- Under `appliance`, license activation is the canonical mechanism to change plans. Direct manual subscription overrides are not part of this contract; `UpdateOverrides` remains an emergency-only escape hatch (carried from Revision 3).
- Under `platform`, activation is forbidden from touching subscriptions. The repair endpoint is the operator's tool for individual orgs; routine plan management is operator-driven through their own surface (out of scope here).
- Under `saas`, activation is typically not used; if reached, it skips repair with `reason: "saas-profile-no-license-activation"`. Subscription writes are owned by signup/billing flows (out of scope).
- Repair must not write if customer ownership is unresolved or ambiguous. Enterprise artifact fallback is not a customer-resolution mechanism; it applies only to `planId` after customer is resolved.
- Tenant-keyed subscription rows are deprecated (compatibility fallback only) and must not be used to satisfy org-keyed quota lookups going forward.
- Read paths (`GetOrgLimits`, `GetCurrentEffectiveByOrg`) must remain non-mutating.

---

## 4. Surface Summary

| Type | Name | Method / Topic | Auth | Producer / Handler | Consumer / Caller |
|---|---|---|---|---|---|
| REST | `/admin/platformLicense/activate` | POST | BearerAuth + role `administrator` | `adminapi.PlatformActivationController.Activate` (handler) → `licensesvc.PlatformActivationService.Activate` + `subscriptionsvc.OrchestrateActivationRepair` (orchestration) | ops admin |
| REST | `/orgs/{orgId}/subscription/bootstrap` | POST | BearerAuth + role `administrator` | `subapi.OrgSubscriptionController.Bootstrap` | ops admin |
| REST | `/admin/subscriptions/reconcile` | POST | BearerAuth + role `administrator` | `subapi.AdminReconcileController` (per Revision 3) | ops admin |

---

## 5. REST Contract

### 5.1 Activate Platform License

**Endpoint:** `/admin/platformLicense/activate`
**Method:** `POST`
**Auth:** `BearerAuth` plus platform role `administrator` (enforced at `router/platformLicense.go:27`).
**Purpose:** Activate a signed license artifact and, under the `appliance` profile, run a profile-aware subscription repair pass. Return a combined response that reports both the license activation outcome and the subscription orchestration outcome.

#### Path Params

None.

#### Query Params

None.

#### Request Headers

| Header | Required | Description |
|---|---|---|
| `Authorization` | yes | `Bearer <jwt>` |

#### Request Body

```json
{
  "artifact": { "...": "SignedLicenseArtifact JSON" }
}
```

| Field | Type | Required | Owner | Description |
|---|---|---|---|---|
| `artifact` | object (raw `SignedLicenseArtifact`) | yes | issuer/backoffice | Signed payload, schema defined by `models/licensemod/SignedLicenseArtifact` |

#### Success Response

**HTTP:** `200`

```json
{
  "code": "SUCCESS",
  "message": "license activated",
  "status": true,
  "details": {
    "platformLicense": { "...": "PlatformLicense doc" },
    "action": "activate",
    "subscriptionRepair": {
      "status": "complete",
      "counts": {
        "scanned": 12,
        "created": 3,
        "reused": 9,
        "upgraded": 0,
        "downgraded": 0,
        "skippedCustomerUnresolved": 0,
        "errors": 0
      },
      "samples": {
        "created": ["org-uuid-1", "org-uuid-2", "org-uuid-3"],
        "downgraded": [],
        "skippedCustomerUnresolved": [],
        "errors": []
      },
      "generatedAt": "2026-04-23T10:15:00Z"
    }
  }
}
```

#### Success Field Definitions

| Field | Type | Description |
|---|---|---|
| `platformLicense` | object | The full `PlatformLicense` document after activation. Shape defined by `models/licensemod/PlatformLicense`. |
| `action` | string enum | `"activate"`, `"activate_idempotent"`, `"replace"`, `"replace_different_license"` — outcome of the license activation step. |
| `subscriptionRepair` | object | Outcome of the post-activation repair pass. Always present when activation succeeded; absent when activation itself failed (4xx/5xx). |
| `subscriptionRepair.status` | string enum | `"complete"` (all orgs repaired without error), `"partial"` (some orgs failed; see `samples.errors` and `samples.skippedCustomerUnresolved`), `"skipped"` (profile is `platform` or `saas`; orchestration intentionally did not run) |
| `subscriptionRepair.reason` | string enum | Present only when `status == "skipped"`. One of: `"platform-profile-operator-controlled"`, `"saas-profile-no-license-activation"` |
| `subscriptionRepair.counts.scanned` | integer | Total org count examined by the orchestration (omitted when status=`skipped`) |
| `subscriptionRepair.counts.created` | integer | Orgs that had no subscription before; one was created via the same plan-resolution rule as §5.2 (Case A) |
| `subscriptionRepair.counts.reused` | integer | Orgs whose existing subscription `planId` already matched the license-derived plan (Case B; idempotent, no write) |
| `subscriptionRepair.counts.upgraded` | integer | Orgs whose existing subscription `planId` had a strictly lower tier than the license-derived plan; subscription was updated (Case C). Audit entry written. |
| `subscriptionRepair.counts.downgraded` | integer | Orgs whose existing subscription `planId` had a strictly higher tier than the license-derived plan; subscription was updated (Case D). Audit entry + warn log written per affected org. |
| `subscriptionRepair.counts.skippedCustomerUnresolved` | integer | Orgs that fell into Case A but customer could not be resolved unambiguously; same short-circuit as §5.2 `CUSTOMER_UNRESOLVED`. No write occurred for these orgs. |
| `subscriptionRepair.counts.errors` | integer | Orgs where the orchestration encountered an unexpected error (DB failure, etc.). No write occurred for these orgs. |
| `subscriptionRepair.counts.unknownFromPlanId` | integer | Orgs whose existing subscription `planId` was not in the known tier set (see tier ordering below). These orgs were classified Case E: upgraded to `licensePlanId` (because unknown tier 0 is strictly lower than any known plan) AND surfaced via warn log + sample for operator follow-up. Counted separately from `upgraded` to keep the data-quality signal visible. |
| `subscriptionRepair.samples.created` | array of string (orgId) | Orgs newly seeded with a subscription at `licensePlanId`. |
| `subscriptionRepair.samples.upgraded` | array of `{orgId, fromPlanId, toPlanId}` | Orgs whose subscription was upgraded (Case C). |
| `subscriptionRepair.samples.downgraded` | array of `{orgId, fromPlanId, toPlanId}` | Orgs whose subscription was auto-downgraded (Case D). Being listed in this bucket IS the downgrade signal — no per-entry boolean flag is added. |
| `subscriptionRepair.samples.unknownFromPlanId` | array of `{orgId, fromPlanId}` | Orgs upgraded from an unknown/stale `fromPlanId` (Case E). Operator must investigate the source of the unknown plan id — subscription itself is now at `licensePlanId`. |
| `subscriptionRepair.samples.skippedCustomerUnresolved` | array of string (orgId) | Orgs where customer resolution failed; no subscription was created. Follow up via §5.2 after fixing customer ownership. |
| `subscriptionRepair.samples.errors` | array of `{orgId, reason}` | Orgs where orchestration encountered an unexpected error. No write. Retry via §5.2 per org. |
| `subscriptionRepair.generatedAt` | string (RFC3339 UTC) | Time the repair pass completed (omitted when `status=="skipped"`) |

Counters are exact regardless of sample bounds. Samples are capped at 100 entries per bucket; the contract does not expose a knob today.

#### Profile Behavior Matrix

| `EffectiveProfile` (from [docs/contracts/deploymentProfile.md](deploymentProfile.md)) | `subscriptionRepair.status` | Behavior |
|---|---|---|
| `appliance` | `complete` / `partial` | Run case matrix per §5.1 below; mutate `subscriptions` |
| `platform` | `skipped` (`reason: "platform-profile-operator-controlled"`) | No subscription writes |
| `saas` | `skipped` (`reason: "saas-profile-no-license-activation"`) | No subscription writes |

#### Case Matrix (`appliance` profile only)

For each org enumerated by the shared internal scanner (same lower-level enumerator that §5.3 reconcile wraps for bounded-sample reporting):

| Case | Pre-condition | Action | Counter |
|---|---|---|---|
| A | No `orgId`-keyed subscription exists | Resolve customer for the org. If unresolved/ambiguous → classify as `skippedCustomerUnresolved`, no write. Otherwise backfill `organizations.customerAccountId` when missing and create subscription with `planId = licensePlanId`. **Plan is license-derived, NOT from `customerAccount.planId` — license is the plan authority under `appliance`.** On unexpected error, classify as `errors`, no write. | `created` / `skippedCustomerUnresolved` / `errors` |
| B | Subscription exists; `planId == licensePlanId` | No-op | `reused` |
| C | Subscription exists; `tier(planId) < tier(licensePlanId)`; `planId` is a known plan | Update `subscriptions.planId` to `licensePlanId`. Write audit entry tagged `audit="subscription_repair_from_activation"`. | `upgraded` |
| D | Subscription exists; `tier(planId) > tier(licensePlanId)` | Update `subscriptions.planId` to `licensePlanId`. Write audit entry. Emit one warn-level log per affected org with `{orgId, fromPlanId, toPlanId, licenseId, source: "activation"}`. | `downgraded` |
| E | Subscription exists; `planId` is not in the known tier set | Treat tier as 0 (strictly lower than any known plan) and apply Case C's write. Additionally emit one warn-level log per affected org with `{orgId, unknownFromPlanId, licenseId, source: "activation"}` and append `{orgId, fromPlanId}` to `samples.unknownFromPlanId`. | `unknownFromPlanId` (counted separately from `upgraded`) |

`tier()` ordering, aligned to the current hardcoded plan catalog in `models/subscripmod/catalog.go`: `free=1`, `pro=2`, `max=3`, `enterprise=4`. Unknown plan ids are tier 0 and handled by Case E (NOT Case C) to preserve the data-quality signal.

`licensePlanId` derivation: from `ArtifactMeta.Edition` via the plan-tier helper. Current artifact schema constrains `Edition = "enterprise"` so under production conditions only Cases A (seed at enterprise), B (idempotent), and C (upgrade from known lower plan) are exercised by a normal deployment. Case D (downgrade) and Case E with a non-enterprise target are reserved for future artifact schemas and are test-only today.

#### Partial / Complete / Skipped rule

| `subscriptionRepair.status` | Condition |
|---|---|
| `skipped` | Profile is `platform` or `saas`; orchestration intentionally did not run |
| `complete` | Profile is `appliance` AND `counts.errors == 0` AND `counts.skippedCustomerUnresolved == 0`. Every org ended in a desired state (created, reused, upgraded, downgraded, or upgraded-from-unknown). |
| `partial` | Profile is `appliance` AND (`counts.errors > 0` OR `counts.skippedCustomerUnresolved > 0`). At least one org needs operator follow-up. |

`counts.unknownFromPlanId > 0` does **not** on its own force `partial` — the subscription was still updated to `licensePlanId`. The warn log and sample bucket are the operator's visibility into the data-quality issue.

#### Error Contract

The activation HTTP status reflects only the **license activation step**. Subscription-repair partial failures are reported in-body and never flip the HTTP status.

| HTTP | Code | Meaning | Consumer Handling |
|---|---|---|---|
| 400 | `INVALID_PAYLOAD`, `UNSUPPORTED_VERSION`, `INVALID_LICENSE_TERM`, `INVALID_LICENSE_STATUS`, `INVALID_DEPLOYMENT_TYPE`, `INVALID_DELIVERY_MODE`, `INVALID_FEATURE_COMBINATION` | License artifact failed structural or semantic validation. Carried unchanged from existing handler. | Fix the artifact; do not retry the same payload |
| 401 | (auth-middleware native shape) | Missing or invalid bearer token | Standard auth retry |
| 403 | (auth-middleware native shape) | Caller lacks `administrator` role | Do not retry as current user |
| 500 | `ACTIVATION_FAILED` | Internal failure during artifact persist | Safe to retry |

When activation succeeds (HTTP 200) but `subscriptionRepair.status == "partial"`, the operator must consume `samples.errors` and `samples.skippedCustomerUnresolved` and follow up via §5.2 manual repair per affected org.

> Auth-middleware error shape note: the activation endpoint reuses `middleware.AuthBearer()` + `middleware.RequireRoles(["administrator"])` without a custom envelope wrapper, matching the same convention as the deploymentProfile debug endpoint. The 401/403 body therefore follows the middleware's native shape (`{"message": "..."}`), not the `{code, message, status}` envelope used by 4xx/5xx errors emitted by this contract's controller logic.

#### Example — `appliance`, complete (fresh activation, all orgs seeded)

```json
{
  "code": "SUCCESS",
  "message": "license activated",
  "status": true,
  "details": {
    "platformLicense": { "licenseMode": "enterprise", "...": "..." },
    "action": "activate",
    "subscriptionRepair": {
      "status": "complete",
      "counts": {
        "scanned": 5,
        "created": 5,
        "reused": 0,
        "upgraded": 0,
        "downgraded": 0,
        "skippedCustomerUnresolved": 0,
        "errors": 0,
        "unknownFromPlanId": 0
      },
      "samples": {
        "created": ["a", "b", "c", "d", "e"],
        "upgraded": [],
        "downgraded": [],
        "unknownFromPlanId": [],
        "skippedCustomerUnresolved": [],
        "errors": []
      },
      "generatedAt": "2026-04-23T10:15:00Z"
    }
  }
}
```

#### Example — `appliance`, partial (one org missing customer)

```json
{
  "code": "SUCCESS",
  "message": "license activated",
  "status": true,
  "details": {
    "platformLicense": { "...": "..." },
    "action": "activate",
    "subscriptionRepair": {
      "status": "partial",
      "counts": {
        "scanned": 5,
        "created": 4,
        "reused": 0,
        "upgraded": 0,
        "downgraded": 0,
        "skippedCustomerUnresolved": 1,
        "errors": 0,
        "unknownFromPlanId": 0
      },
      "samples": {
        "created": ["a", "b", "c", "d"],
        "upgraded": [],
        "downgraded": [],
        "unknownFromPlanId": [],
        "skippedCustomerUnresolved": ["e"],
        "errors": []
      },
      "generatedAt": "2026-04-23T10:15:00Z"
    }
  }
}
```

#### Example — `appliance`, upgrade triggered (mixed existing tiers)

Production scenario under current artifact schema: three orgs on lower plans get upgraded to `enterprise` by license activation.

```json
{
  "code": "SUCCESS",
  "message": "license activated",
  "status": true,
  "details": {
    "platformLicense": { "...": "..." },
    "action": "replace_different_license",
    "subscriptionRepair": {
      "status": "complete",
      "counts": {
        "scanned": 4,
        "created": 0,
        "reused": 1,
        "upgraded": 3,
        "downgraded": 0,
        "skippedCustomerUnresolved": 0,
        "errors": 0,
        "unknownFromPlanId": 0
      },
      "samples": {
        "created": [],
        "upgraded": [
          { "orgId": "a", "fromPlanId": "free", "toPlanId": "enterprise" },
          { "orgId": "b", "fromPlanId": "pro", "toPlanId": "enterprise" },
          { "orgId": "c", "fromPlanId": "max", "toPlanId": "enterprise" }
        ],
        "downgraded": [],
        "unknownFromPlanId": [],
        "skippedCustomerUnresolved": [],
        "errors": []
      },
      "generatedAt": "2026-04-23T10:15:00Z"
    }
  }
}
```

#### Example — `appliance`, unknown fromPlanId surfaced

Data-quality scenario: an org has an unrecognised `planId` value. It is upgraded to `licensePlanId` and surfaced under `samples.unknownFromPlanId`; status stays `complete` because the subscription is now valid — the signal is advisory.

```json
{
  "code": "SUCCESS",
  "message": "license activated",
  "status": true,
  "details": {
    "platformLicense": { "...": "..." },
    "action": "activate",
    "subscriptionRepair": {
      "status": "complete",
      "counts": {
        "scanned": 2,
        "created": 0,
        "reused": 1,
        "upgraded": 0,
        "downgraded": 0,
        "skippedCustomerUnresolved": 0,
        "errors": 0,
        "unknownFromPlanId": 1
      },
      "samples": {
        "created": [],
        "upgraded": [],
        "downgraded": [],
        "unknownFromPlanId": [
          { "orgId": "a", "fromPlanId": "legacyTrial" }
        ],
        "skippedCustomerUnresolved": [],
        "errors": []
      },
      "generatedAt": "2026-04-23T10:15:00Z"
    }
  }
}
```

#### Example — `appliance`, downgrade triggered (future / synthetic; out of scope today)

Only exercisable once the license artifact schema supports non-enterprise editions. Included here for forward documentation of the bucket shape; current production never produces this response.

```json
{
  "code": "SUCCESS",
  "message": "license activated",
  "status": true,
  "details": {
    "platformLicense": { "...": "..." },
    "action": "replace_different_license",
    "subscriptionRepair": {
      "status": "complete",
      "counts": {
        "scanned": 3,
        "created": 0,
        "reused": 1,
        "upgraded": 0,
        "downgraded": 2,
        "skippedCustomerUnresolved": 0,
        "errors": 0,
        "unknownFromPlanId": 0
      },
      "samples": {
        "created": [],
        "upgraded": [],
        "downgraded": [
          { "orgId": "a", "fromPlanId": "enterprise", "toPlanId": "max" },
          { "orgId": "b", "fromPlanId": "enterprise", "toPlanId": "max" }
        ],
        "unknownFromPlanId": [],
        "skippedCustomerUnresolved": [],
        "errors": []
      },
      "generatedAt": "2026-04-23T10:15:00Z"
    }
  }
}
```

#### Example — `platform`, skipped

```json
{
  "code": "SUCCESS",
  "message": "license activated",
  "status": true,
  "details": {
    "platformLicense": { "...": "..." },
    "action": "activate",
    "subscriptionRepair": {
      "status": "skipped",
      "reason": "platform-profile-operator-controlled"
    }
  }
}
```

---

### 5.2 Repair Org Subscription (profile-aware)

**Endpoint:** `/orgs/{orgId}/subscription/bootstrap`
**Method:** `POST`
**Auth:** `BearerAuth` plus platform role `administrator` (enforced via `middleware.RequireRoles(["administrator"])`).
**Purpose:** Repair a single org by ensuring an `orgId`-keyed subscription exists with a resolved plan and non-null `customerAccountId`. Idempotent by `orgId`. Used as the targeted retry surface for orgs left in `skippedCustomerUnresolved` or `errors` categories by activation orchestration, and for orgs created after the most recent activation.

**Profile awareness:** the plan-resolution rule branches on `EffectiveProfile` to stay consistent with the license-is-plan-authority rule from §5.1. Customer resolution is identical across profiles (D4); only the plan source changes. On an existing subscription, `repairAction: "reused"` and no plan mutation — in either profile, this endpoint never changes the `planId` of a subscription that already exists. Upgrades/downgrades happen only through activation orchestration (§5.1).

#### Path Params

| Field | Type | Required | Description |
|---|---|---|---|
| `orgId` | string | yes | Target org UUID |

#### Query Params

None.

#### Request Headers

| Header | Required | Description |
|---|---|---|
| `Authorization` | yes | `Bearer <jwt>` |
| `X-Active-Org` | no | Ignored for admin repair; retained for middleware parity |

#### Request Body

None. All inputs are derived from the org document and platform state.

#### Success Response

**HTTP:** `200`

```json
{
  "code": "SUCCESS",
  "message": "ok",
  "status": true,
  "details": {
    "orgId": "org-uuid",
    "planId": "enterprise",
    "customerAccountId": "cust-uuid",
    "status": "active",
    "repairAction": "created",
    "planSource": "customer"
  }
}
```

#### Success Field Definitions

| Field | Type | Description |
|---|---|---|
| `orgId` | string | Repaired org id |
| `planId` | string | Resolved plan identifier persisted on the subscription |
| `customerAccountId` | string | Linked customer account. **Always non-null.** Repair short-circuits to `CUSTOMER_UNRESOLVED` before any write if customer cannot be resolved. |
| `status` | string | Subscription status (`active` on a successful repair) |
| `repairAction` | string enum | `"created"` — repair created a new row; `"reused"` — an existing row was found, nothing written |
| `planSource` | string enum | Under `appliance`: `"license"` on create (license-derived plan); `"existing"` on reused. Under `platform`/`saas`: `"customer"` on create (from `customerAccount.planId`); `"enterpriseArtifact"` on create (D2 predicate fallback); `"existing"` on reused. `"customer"` and `"enterpriseArtifact"` never appear under `appliance`; `"license"` never appears under `platform`/`saas`. |

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

| HTTP | Code | Meaning | Consumer Handling |
|---|---|---|---|
| 400 | `ORG_NOT_FOUND` | `orgId` does not match any org | Verify the id; do not retry |
| 401 | (auth-middleware native shape) | Missing or invalid bearer token | Standard auth retry |
| 403 | (auth-middleware native shape) | Caller lacks platform role `administrator` | Do not retry as current user |
| 409 | `CUSTOMER_UNRESOLVED` | Org has no `customerAccountId` and the customer cannot be resolved unambiguously | Operator must reconcile customer ownership, then retry. No subscription row is created. |
| 409 | `PLAN_UNRESOLVED` | Customer resolved, but no `customerAccount.planId` and the D2 enterprise artifact predicate does not hold | Operator must assign a customer plan or activate a conforming enterprise artifact, then retry |
| 500 | `REPAIR_FAILED` | Internal failure (DB / downstream) | Safe to retry; idempotent by `orgId` |

> Auth-middleware error shape note: same as §5.1 — 401/403 follow the middleware's native shape, not the `{code, message, status}` envelope.

#### Error Example

```json
{
  "code": "CUSTOMER_UNRESOLVED",
  "message": "cannot resolve customer for org: org.customerAccountId is missing and no unambiguous customer match was found",
  "status": false
}
```

---

### 5.3 Detect-Only Reconcile (API surface unchanged; internals delegate to shared scanner)

**Endpoint:** `/admin/subscriptions/reconcile`
**Method:** `POST`
**Auth:** `BearerAuth` plus platform role `administrator`.
**Purpose:** Enumerate orgs that need repair. Zero writes under all conditions. Activation orchestration and this endpoint share the same lower-level scanner (`scanOrgRepairState`); this endpoint wraps the scanner with bounded-sample truncation for operator reporting, while activation consumes it un-truncated for the full-deployment pass. This endpoint is the operator's read-only verification tool before and after activation.

#### Path Params

None.

#### Query Params

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `limit` | integer | no | `100` | Max number of orgIds to include in each sample list (bounded). Counters are exact regardless of `limit`. |

#### Request Headers

| Header | Required | Description |
|---|---|---|
| `Authorization` | yes | `Bearer <jwt>` |

#### Request Body

None.

#### Success Response

**HTTP:** `200`

```json
{
  "code": "SUCCESS",
  "message": "ok",
  "status": true,
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

#### Success Field Definitions

| Field | Type | Description |
|---|---|---|
| `counts.orgsMissingSubscription` | integer | Count of orgs without an `orgId`-keyed `subscriptions` row |
| `counts.orgsMissingCustomer` | integer | Count of orgs whose `organizations.customerAccountId` is unset |
| `counts.subscriptionsMissingCustomer` | integer | Count of `orgId`-keyed `subscriptions` rows whose `customerAccountId` is unset |
| `samples.*` | array of strings | Bounded sample of offending orgIds per category |
| `limit` | integer | Echo of the `limit` query param applied |
| `generatedAt` | RFC3339 UTC | Time the report was produced |

#### Error Contract

| HTTP | Code | Meaning | Consumer Handling |
|---|---|---|---|
| 401 | (auth-middleware native shape) | Missing or invalid bearer token | Standard auth retry |
| 403 | (auth-middleware native shape) | Caller lacks platform role `administrator` | Do not retry as current user |
| 500 | `RECONCILE_FAILED` | Internal failure (DB) | Safe to retry; read-only |

---

## 6. Event Contract

Not applicable. No topics emitted or consumed by this contract.

---

## 7. Canonical and Projection Mapping

### Canonical Store

- System: `klynx-api`
- Store: `subscriptions`
- Canonical fields: `orgId`, `tenantId`, `customerAccountId`, `planId`, `status`, `billingCycle`, `createdAt`, `updatedAt`

### Projection Store

- None. Read endpoints derive effective limits from canonical + plan catalog at read time.

### Field Mapping

| Canonical Field | Projection Field | Consumer Field | Notes |
|---|---|---|---|
| `subscriptions.orgId` | — | activation `subscriptionRepair.samples.*` orgId entries; repair response `orgId` | Direct |
| `subscriptions.planId` | — | repair response `planId`; activation response samples (`fromPlanId`, `toPlanId` in downgrade entries) | Direct |
| `subscriptions.customerAccountId` | — | repair response `customerAccountId` | Never null on a successful repair |
| `subscriptions.status` | — | repair response `status` | Direct |
| `platform_licenses.artifactMeta.licenseId` | — | warn-log `licenseId` field on downgrade / unknown-plan events | Cross-reference with audit entries |
| `platform_licenses.artifactMeta.edition` | — | activation orchestration internal `licensePlanId` | Drives Cases A/B/C/D/E classification |
| n/a | — | `subscriptionRepair.status`, `counts`, `samples` | Derived at orchestration time |
| n/a | — | repair response `repairAction`, `planSource` | Derived at handler time. `planSource: "license"` is an appliance-only value added in Revision 5; `"customer"` and `"enterpriseArtifact"` remain for platform/saas. |

---

## 8. Field Ownership

| Field | Authoritative Writer | Allowed Initiator | Stored In | Notes |
|---|---|---|---|---|
| `subscriptions.orgId` | `subscriptionsvc` bootstrap/repair/activation-orchestration | admin (direct or via license activation) | `subscriptions` | Immutable once set |
| `subscriptions.planId` | `subscriptionsvc` activation-orchestration (`appliance`) **OR** `subscriptionsvc` bootstrap/repair (other paths) | admin / customer plan recalc / **license activation under `appliance`** | `subscriptions` | Repair never overwrites an existing plan with a different value; activation orchestration's Cases C/D do, with audit. `UpdateOverrides` is emergency-only. |
| `subscriptions.customerAccountId` | `subscriptionsvc` bootstrap/repair/activation-orchestration | admin | `subscriptions` | Always set on create; backfilled when missing |
| `organizations.customerAccountId` | `authzsvc` org create / repair backfill / activation-orchestration backfill | admin | `organizations` | Repair only backfills when missing and unambiguous |
| `platform_licenses.artifactMeta` | `licensesvc` activation | admin | `platform_licenses` | Replaced wholesale on each activation; not modified by repair or reconcile |

### Conflict Resolution

- Idempotency key for repair (manual or activation-driven Case A): `orgId`.
- If an `orgId`-keyed subscription already exists and matches `licensePlanId` (Case B), no write occurs.
- If it exists with a different tier (Cases C/D), activation orchestration mutates `planId` only — `overrides`, `billingCycle`, `status`, `customerAccountId` are preserved.
- Customer backfill is one-way and only applied when missing; never overwrites an existing `customerAccountId`.
- Manual repair endpoint never overwrites an existing `planId` (returns `repairAction: "reused"`); only activation orchestration may change `planId` on an existing subscription, and only under `appliance`.
- Plan change for a repaired org under `appliance` happens via license activation. `UpdateOverrides` is an emergency temporary workaround only, not part of this contract.

---

## 9. Frontend Integration Notes

### Required FE Inputs

| FE Use Case | Contract Surface | Required Fields | Notes |
|---|---|---|---|
| none (FE1/FE2) | — | — | Admin-only; no user-facing FE integration |
| internal admin UI (if any) consuming activation | `/admin/platformLicense/activate` | `subscriptionRepair.status`, `counts`, `samples` | Treating activation `200` as "deployment ready" without inspecting `subscriptionRepair.status` is incorrect under `appliance` |

### FE Guardrails

- FE must not call these endpoints from user-facing flows.
- If an internal admin UI surfaces activation, it must read `subscriptionRepair.status` and surface `samples.downgraded`, `samples.errors`, and `samples.skippedCustomerUnresolved` to the operator. Silent dismissal of partial-status responses defeats the contract's transparency intent.
- If an internal admin UI surfaces repair, it must read `repairAction` and `planSource` verbatim and not infer them from the status code alone.
- If an internal admin UI surfaces reconcile, it must consume `counts` and `samples` under `details` verbatim.
- The documented error codes are the only supported contract; do not map `500 ACTIVATION_FAILED`, `500 REPAIR_FAILED`, or `500 RECONCILE_FAILED` to business logic.
- Auth-layer 401/403 follow middleware native shape, not the `{code, message, status}` envelope — handle both.

---

## 10. Rollout Notes

| Repo | Dependency | Required Before | Notes |
|---|---|---|---|
| `klynx-api` | foundation `deploymentProfileConsolidation` lands | Implementation | Activation orchestration reads `EffectiveProfile`; foundation must be in place first |
| `klynx-api` | Contract publication | Implementation | Contract approved by Codex before activation handler response shape changes |
| ops runbook | Endpoint semantics live in UAT | Prod cutover | Linked from plan §14 |

---

## 11. Examples

### 11.1 Activation under `appliance` (complete) — see §5.1 first example
### 11.2 Activation under `appliance` (partial) — see §5.1 second example
### 11.3 Activation under `appliance` (downgrade) — see §5.1 third example
### 11.4 Activation under `platform` (skipped) — see §5.1 fourth example

### 11.5 Manual Repair under `appliance` (created, license-derived plan)

```json
{
  "code": "SUCCESS",
  "message": "ok",
  "status": true,
  "details": {
    "orgId": "d1aea392-3417-47ad-af79-c9c264f574da",
    "planId": "enterprise",
    "customerAccountId": "PTY01",
    "status": "active",
    "repairAction": "created",
    "planSource": "license"
  }
}
```

### 11.6 Manual Repair under `platform` (created, customer plan)

```json
{
  "code": "SUCCESS",
  "message": "ok",
  "status": true,
  "details": {
    "orgId": "d1aea392-3417-47ad-af79-c9c264f574da",
    "planId": "pro",
    "customerAccountId": "PTY01",
    "status": "active",
    "repairAction": "created",
    "planSource": "customer"
  }
}
```

### 11.6b Manual Repair under `platform` (created, enterprise artifact fallback)

```json
{
  "code": "SUCCESS",
  "message": "ok",
  "status": true,
  "details": {
    "orgId": "d1aea392-3417-47ad-af79-c9c264f574da",
    "planId": "enterprise",
    "customerAccountId": "PTY01",
    "status": "active",
    "repairAction": "created",
    "planSource": "enterpriseArtifact"
  }
}
```

### 11.7 Manual Repair (reused)

```json
{
  "code": "SUCCESS",
  "message": "ok",
  "status": true,
  "details": {
    "orgId": "d1aea392-3417-47ad-af79-c9c264f574da",
    "planId": "enterprise",
    "customerAccountId": "PTY01",
    "status": "active",
    "repairAction": "reused",
    "planSource": "existing"
  }
}
```

### 11.8 Manual Repair Error (customer unresolved)

```json
{
  "code": "CUSTOMER_UNRESOLVED",
  "message": "cannot resolve customer for org: org.customerAccountId is missing and no unambiguous customer match was found",
  "status": false
}
```

### 11.9 Reconcile

```http
POST /admin/subscriptions/reconcile?limit=50
Authorization: Bearer <jwt-of-administrator>
```

```json
{
  "code": "SUCCESS",
  "message": "ok",
  "status": true,
  "details": {
    "counts": {
      "orgsMissingSubscription": 2,
      "orgsMissingCustomer": 1,
      "subscriptionsMissingCustomer": 0
    },
    "samples": {
      "orgsMissingSubscription": [
        "d1aea392-3417-47ad-af79-c9c264f574da",
        "a5b2c9e1-9f8a-4821-8b77-2c8a9f1d2e30"
      ],
      "orgsMissingCustomer": [
        "c3f4a1b2-5d67-4e3a-92ab-01f23de4c567"
      ],
      "subscriptionsMissingCustomer": []
    },
    "limit": 50,
    "generatedAt": "2026-04-22T09:00:00Z"
  }
}
```

---

## 12. Checklist

- [x] Owner backend is explicit.
- [x] System of record is defined by domain (including the new `EffectiveProfile` from foundation).
- [x] Canonical store and projection store are documented.
- [x] Producers and consumers are listed for all three endpoints.
- [x] Request, response, and error contracts are defined for all three endpoints.
- [x] Field ownership is explicit for synchronized fields, including the new activation-orchestration writer path.
- [x] Backward compatibility is documented (additive activation response; behavioral change scoped to `appliance` profile).
- [x] Replay or re-sync behavior is documented for all three endpoints.
- [x] FE field mapping is included where applicable (none required for FE1/FE2; internal admin UI must read `subscriptionRepair`).
- [x] Auth model references existing middleware and role convention.
- [x] D2 predicate is expressed against concrete fields in `models/licensemod/platformLicense.go`.
- [x] Customer-required invariant is stated consistently in §3, §5.2 flow, §5.2 error contract, §8, and §11.
- [x] Profile-aware behavior cites the foundation contract `docs/contracts/deploymentProfile.md` and does not re-derive profile semantics.
- [x] Activation case matrix (Cases A–E) is explicit, including the tier comparison rule and explicit unknown-plan handling (Case E with warn log + `samples.unknownFromPlanId`).
- [x] Auto-downgrade visibility is explicit (warn log per affected org + `samples.downgraded` bucket; no per-entry boolean flag — bucket membership is the signal).
- [x] Partial rule is single-sourced: `partial` when `errors > 0` OR `skippedCustomerUnresolved > 0`; `unknownFromPlanId` alone does not force partial.
- [x] Partial failure HTTP-status policy is explicit (200 + in-body `partial`, never 5xx for subscription-repair side effects).
- [x] Tier ordering aligned to actual catalog (`free=1, pro=2, max=3, enterprise=4`) in `models/subscripmod/catalog.go`; unknown plan → tier 0 handled via Case E.
- [x] `planSource` enum documents profile-aware branching: `"license"` (appliance only), `"customer"`/`"enterpriseArtifact"` (platform/saas only), `"existing"` (any profile when reused).
- [x] No `"in_progress"` status is defined; async orchestration deferred to a future follow-up plan.
- [x] Auth-middleware error shape divergence is documented (matches deploymentProfile.md convention).
