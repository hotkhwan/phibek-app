# Canonical Pro Organization Limit Contract

**Date:** 2026-04-24 (Q5 sections withdrawn 2026-04-25)
**Status:** Superseded by [`org-lifecycle.md`](./org-lifecycle.md) on 2026-05-04 — Q1 quota canonical (`DefaultOrgLimitsByPlan(pro) = 5`) + alignment rule with subscription seed + bespoke caps preserved + over-limit policy (existing orgs never deleted; `over_limit_at_create_attempt=true` log; 403 PLAN_LIMIT_EXCEEDED via `details.cause="limit"`) all preserved verbatim in §10 + §5.1 of the merged contract. The `cmd/migrate-customer-org-limits/` 3-phase tool (dry-run → ops curate `approved.json` → `--apply --input approved.json`) with `--exclude-tenant` / `--exclude-plan` deny-list + safety invariants + report row schema + end-of-run summary preserved in §9.4. Q5 user-list global summary explicitly noted as WITHDRAWN 2026-04-25 (revert to `summary.active + summary.inactive == pagination.totalRecords` search-scoped behavior). Body kept here for PR / Codex review history.
**Owner Backend:** `klynx-api`
**Related Plan:** [docs/plan/done/plan-limit-canonical-and-list-summary-global.md](../plan/done/plan-limit-canonical-and-list-summary-global.md)
**Applies To Repos:** `klynx-api`, `klynx-feature`
**Contract Type:** `Data semantics + enforcement behavior, no API shape change`
**Version:** `v1` (semantics-compat; no field additions or removals)

---

## 1. Purpose

One behavioral clarification to klynx-api quota enforcement, driven by the 2026-04-24 frontend bug review.

**Note:** This contract originally covered two changes. The "global summary" change (Q5) was withdrawn on 2026-04-25 after the product owner reviewed the implemented behavior and asked for summary cards to track the search filter instead. Q5 is retained only as withdrawn historical context.

1. **Pro plan `maxOrganizations` canonical value is `5`.** This contract declares `DefaultOrgLimitsByPlan("pro") = 5` as the Go-side canonical, re-establishes parity with the subscription package seed (`MaxOrganizationsPerTenant = 5`), and ships a one-time migration of `customer_accounts.maxOrganizations` so that enforcement at `CheckOrgCreationAllowed` matches what the Pricing page has always displayed.
2. ~~User list `details.summary.active/inactive` is now global.~~ **WITHDRAWN 2026-04-25.** Behavior reverts to the pre-Tier 2 "summary follows search filter" semantics. `summary.active + summary.inactive == pagination.totalRecords` is restored as the invariant. No action required from FE consumers — they continue reading `details.summary` exactly as before; the cards will track the filter as the product owner requested.

The contract exists so that FE and ops can depend on exact post-change quota semantics without reading the Go source. User-list summary semantics are not active scope after Q5 withdrawal.

---

## 2. Ownership

### Owner Backend

- `klynx-api`

### Domain System of Record

Three stores, three different jobs. See plan §6 for the detailed roles and mutation paths. Abbreviated here:

| Store | Role | Writer | Reader |
|---|---|---|---|
| `DefaultOrgLimitsByPlan(planId)` (Go) | **Canonical template per plan**: the default a new `customer_accounts` row receives and the alignment target for the migration script | Developers | `customerrepo.NewCustomerAccount`; migration script |
| `customer_accounts.maxOrganizations` (Mongo) | **Effective per-tenant enforcement value**. May legitimately differ from the template for tenants with a bespoke cap | `customerrepo` (provisioning + paid upgrades); migration script (only for approved rows); ops tooling (manual bespoke overrides) | `customersvc.CheckOrgCreationAllowed` |
| `subscriptions.packages.limits.maxOrganizationsPerTenant` (Mongo, seeded) | **Catalog display value**. Must stay numerically equal to the template for the same `planId`, enforced by code review | Developers (seed change) | FE Pricing + Subscription pages |

**Alignment rule (post-migration)**:

- `DefaultOrgLimitsByPlan(planId) == subscriptions.packages.limits.maxOrganizationsPerTenant` for the same `planId` — always, by code review.
- `customer_accounts.maxOrganizations == DefaultOrgLimitsByPlan(doc.planId)` — **only for rows included in the ops-approved migration input**. Rows excluded by ops (bespoke caps) keep their existing value.
- Bespoke overrides remain a supported ops operation after this contract; the template is the default, not a forced cap.

### Producer / Consumers

| Surface | Producer | Consumers |
|---|---|---|
| `POST /orgs` enforcement | klynx-api `customersvc.CheckOrgCreationAllowed` | klynx-feature org-create UI |

### Projection Stores

- None.

---

## 3. Compatibility and Policy

### Backward Compatibility

- **Response shape**: unchanged for quota/API surfaces.
- **Field semantics**:
  - `details.summary.active/inactive` remains search-scoped after the Q5 revert. It is not changed by this contract.
  - `pagination.totalRecords` remains search-scoped.
- **Enforcement**: `POST /orgs` continues to return HTTP 403 with code `PLAN_LIMIT_EXCEEDED` when `currentOrgCount >= maxOrganizations`. The canonical limit for Pro tenants drops from whatever was previously stored (often 10, sometimes 4) to 5 after migration.
- **Data migration**: one-shot alignment of `customer_accounts.maxOrganizations` to `DefaultOrgLimitsByPlan(planId)`, gated by an ops-curated approved input. Dry-run → ops review → apply with `--input approved.json`. Rows not in the approved input are never mutated. See §6 "Migration contract" for the binary's CLI and safety rules. Idempotent; safe to re-run.

### Over-limit Policy (explicit)

- Existing orgs are **never deleted** by this contract. Tenants that legitimately had more orgs than the new canonical limit keep their orgs intact.
- Future `POST /orgs` attempts from an over-limit tenant return HTTP 403 `PLAN_LIMIT_EXCEEDED`.
- Backend logs `over_limit_at_create_attempt=true` (structured zerolog field) on each such attempt so ops can observe post-migration pressure.

### Replay / Re-sync Behavior

- Not applicable (no events).

### Deprecation Window

- None.

---

## 4. Auth & Authorization

- `POST /orgs`: `Bearer` + platform-admin or appropriate role. Unchanged.

---

## 5. Endpoint Specs

### 5.1 `POST /orgs` — `PLAN_LIMIT_EXCEEDED` semantics (reaffirmed)

**Request (unchanged):**

```http
POST /api/v3/orgs
Authorization: Bearer <jwt>
Content-Type: application/json

{ "name": "...", ... }
```

**Error Response (unchanged shape):**

```json
{
  "code": "PLAN_LIMIT_EXCEEDED",
  "message": "organization limit reached for the current plan",
  "status": false
}
```

| HTTP | Code | Trigger | Notes |
|---|---|---|---|
| 403 | `PLAN_LIMIT_EXCEEDED` | `currentOrgCount >= customer_accounts.maxOrganizations` | Applies whether the tenant was *exactly at* the limit before this contract or became *over* the limit because of the migration. Both are the same predicate. |
| 402 | `PAYMENT_REQUIRED` | Plan expired (pre-existing, unchanged) | Not modified by this contract. |

**Canonical limit mapping after this contract:**

| planId | `DefaultOrgLimitsByPlan(planId)` | Notes |
|---|---|---|
| `free` | `1` | Unchanged |
| `pro` | `5` | **Changed** (was `10`); matches Pricing page display |
| `max` | `50` | Unchanged |
| `enterprise` | `-1` (unlimited) | Unchanged |
| other / unknown | `1` (free default) | Unchanged |

## 6. Data Source & Field Mapping

### `DefaultOrgLimitsByPlan`

- Single canonical, Go-side, `models/custmod/customer.go`.
- Must stay numerically equal to `SubscriptionLimits.MaxOrganizationsPerTenant` in the subscription seed (`internal/repo/subscriprepo/subscriptionBootstrap.go`). Diff at review time will be flagged manually — no automated sync.

### Migration: `cmd/migrate-customer-org-limits/` (or equivalent repo-standard path)

#### CLI

```
migrate-customer-org-limits [flags]

  --dry-run              (default)  Emit drift report; no writes.
  --apply                           Write mode. REQUIRES --input.
  --input <path>                    Path to ops-approved JSON. Only rows in this file are written.
  --exclude-tenant <id>             Repeatable. Skip this tenantId even if present in --input.
  --exclude-plan <planId>           Repeatable. Skip every row with this planId.
  --mongo-uri <uri>                 Overrides env-resolved URI (useful for staging runs).
  --output <path>                   Write the final apply-mode stats JSON to this path.
```

#### Three-phase flow

1. Dry-run → full drift report (stdout).
2. Ops curates the drift report: removes any row that represents a legitimate bespoke cap. Saved as `approved.json` (same JSON schema). Attached to the change ticket.
3. Apply: `--apply --input approved.json`. The binary writes ONLY rows that exist in `approved.json`, AND that are not excluded via `--exclude-tenant` / `--exclude-plan`.

#### Safety invariants

| Invariant | Enforced by |
|---|---|
| `--apply` without `--input` exits non-zero | Argument parser |
| A `customer_accounts` row absent from `--input` is never written | Apply loop iterates `--input`, not the collection |
| A row already at `expected` on re-read is skipped and logged | Apply loop re-reads before write |
| `--exclude-tenant` / `--exclude-plan` override `--input` (deny-list wins) | Apply loop checks exclusion first |

#### Report row schema

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

#### End-of-run summary

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

## 7. FE Implementation Notes

- **No FE code changes required for this contract.** Q1 changes backend quota defaults and migration behavior only.
- `klynx-feature/app/pages/pricing.vue` and `subscription.vue` continue to read from subscription package endpoints; since the seed and the canonical now agree on `5`, the inconsistency with the Subscription page (which reads `subscriptions/current`) disappears automatically once the subscription package endpoint is re-read post-deploy.

---

## 8. Validation Cases

### Canonical limit + migration

- Pro tenant in approved input with `maxOrganizations = 10` pre-migration → post-migration `maxOrganizations = 5`.
- Pro tenant in approved input with `maxOrganizations = 4` pre-migration → post-migration `maxOrganizations = 5`.
- **Bespoke Pro tenant excluded from the approved input** (e.g. paid add-on at `maxOrganizations = 20`) → post-migration **unchanged** at `20`. Future `POST /orgs` uses `20`, not `5`.
- **Bespoke Pro tenant excluded via `--exclude-tenant <id>`** even though listed in the approved input → unchanged. Deny-list wins.
- Free tenant with `maxOrganizations = 1` pre-migration → no drift row emitted; no change.
- Enterprise tenant with `maxOrganizations = -1` → no drift row emitted.
- `--apply` without `--input` → exits non-zero, no writes, clear error message.
- Re-run migration after a successful apply → `examined > 0`, `drifted == 0` (or `skippedAlreadyAligned > 0`), zero writes.

### Over-limit enforcement (explicit case requested by reviewer)

- Pro tenant with **6 existing orgs** after migration (canonical limit = 5) → `GET /orgs` returns all 6; `POST /orgs` returns `403 PLAN_LIMIT_EXCEEDED`; structured log contains `over_limit_at_create_attempt=true`.
- Same tenant deletes one org → `GET /orgs` returns 5; `POST /orgs` still returns `403` (at-limit is also `>=`).
- Same tenant deletes another → 4; next `POST /orgs` succeeds.

### Non-regressions

- `PATCH /orgs/users/remove` cascade + `removedFromOuIds` (Tier 1) still works.
- `GET /orgs/users/members` item `username` (Tier 1) still present.
- FE Playwright Phase 1A suite still passes.

---

## 9. Change Log

| Version | Date | Change |
|---|---|---|
| v1 | 2026-04-24 | Initial contract — canonical Pro org limit = 5; migration Option B; user list summary becomes global while pagination stays filtered |
| v1-rev2 | 2026-04-24 | Revision 2 (Codex review fixes): migration now requires ops-curated `--input approved.json`; added `--exclude-tenant` / `--exclude-plan`; ownership table split into three distinct store roles to preserve legitimate bespoke per-tenant caps; rollout order explicitly requires the migration binary to be built from the new commit |
| v1-rev3 | 2026-04-25 | **Q5 withdrawn by product owner.** Global-summary change is reverted; user list endpoints fall back to the original "summary tracks search" behavior. Only Q1 (canonical Pro limit + migration) remains active. |
