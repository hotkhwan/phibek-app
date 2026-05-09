# Customer Account Limit Repair Contract

**Date:** 2026-04-27
**Status:** Draft
**Owner Backend:** `klynx-api`
**Related Plan:** [docs/plan/proOrgLimitRepair.md](../plan/proOrgLimitRepair.md)
**Cites:** [docs/contracts/orgSubscriptionRepair.md](orgSubscriptionRepair.md) — adjacent repair endpoints (subscriptions / organizations); this contract is the customer_accounts counterpart
**Applies To Repos:** `klynx-api`
**Contract Type:** REST
**Version:** v1

---

## 1. Purpose

Defines the admin REST surface that repairs `customer_accounts.maxOrganizations`
when it has drifted from the canonical value computed by
`DefaultOrgLimitsByPlan(planId)`.

Without this endpoint, customer accounts seeded before commit `7439113`
(2026-04-24) carry stale `maxOrganizations` values that block legitimate org
creation under their plan. The migration tool at `cmd/migrate-customer-org-limits`
covers the same use case offline; this endpoint exposes it as an idempotent,
auditable runtime path that satisfies the project policy of "no Mongo runbook for
tenant policy" (memory: `feedback_no_mongo_runbook_for_policy`).

---

## 2. Ownership

### Owner Backend

- `klynx-api`

### Domain System of Record

| Domain | System of Record | Canonical Store | Notes |
|---|---|---|---|
| Per-customer org cap | `klynx-api` | `customer_accounts.maxOrganizations` | Canonical |
| Canonical limit per plan | `klynx-api` | `models/custmod/customer.go.DefaultOrgLimitsByPlan` | Code constant — ground truth for "what should this account have" |
| Plan id of the customer | `klynx-api` | `customer_accounts.planId` | Read-only by this endpoint |

### Producer / Consumers

| Surface | Producer | Consumers |
|---|---|---|
| `POST /admin/customerAccounts/{id}/repairLimits` | platform administrator | `customersvc.RepairLimits` |
| (extension) `/admin/subscriptions/reconcile` body | platform administrator | reconcile reader (ops) |

### Projection Stores

- None. `customer_accounts` is canonical.

---

## 3. Compatibility and Policy

- **Backward compatibility:** additive (new endpoint). `/admin/subscriptions/reconcile`
  body gains a new `customerAccountLimitDrift` section — additive, existing keys preserved.
- **Replay / re-sync:** the endpoint is idempotent — repeated calls return the same
  state and write at most once.
- **Write authority:** `klynx-api` is the writer of `customer_accounts.*`. This
  endpoint is the only canonical-realignment writer for `maxOrganizations`. No
  other endpoint may write `maxOrganizations` for canonical-realignment purposes;
  product flows (plan upgrade, plan downgrade) use separate endpoints with their
  own contract.

---

## 4. Surface

| Type | Path | Method | Auth |
|---|---|---|---|
| REST | `/admin/customerAccounts/{id}/repairLimits` | `POST` | `Bearer + RequireRoles(["administrator"])` |

(Bulk variant `/admin/customerAccounts/repairLimits` is **deferred** to a follow-up
plan; not part of v1.)

---

## 5. Behavior

For each call to `POST /admin/customerAccounts/{id}/repairLimits`:

1. Load `customer_accounts` by `id`. If not found → `404 NOT_FOUND`.
2. Compute `canonical := DefaultOrgLimitsByPlan(ca.planId)`.
3. Decision matrix:

| Condition | Action | Response `repaired` | Response `reason` |
|---|---|---|---|
| `canonical == -1` (e.g. `enterprise`) | no write | `false` | `plan-unlimited` |
| `ca.maxOrganizations == canonical` | no write | `false` | `already-canonical` |
| `ca.maxOrganizations > canonical` | no write | `false` | `bespoke-higher-than-canon` |
| `ca.maxOrganizations < canonical` | write `maxOrganizations := canonical` | `true` | `aligned-to-canonical` |

The "no write" outcomes preserve bespoke higher-than-canon configurations (e.g. a
Pro customer with a bespoke 100-org cap stays at 100 — not pulled down to 5).
This is a deliberate safety guard.

4. Return 200 with the structured result.

---

## 6. Request

```http
POST /admin/customerAccounts/{id}/repairLimits HTTP/1.1
Authorization: Bearer <jwt>
```

No body.

---

## 7. Response

### 7.1 Success (200 OK)

```json
{
  "code": "SUCCESS",
  "status": true,
  "message": "customer account limit repair complete",
  "details": {
    "customerAccountId": "ca_xxx",
    "planId": "pro",
    "before": 2,
    "canonical": 5,
    "after": 5,
    "repaired": true,
    "reason": "aligned-to-canonical"
  }
}
```

`before == after` when `repaired == false`.

### 7.2 Errors

| Status | Code | When |
|---|---|---|
| `401` | `UNAUTHORIZED` | missing/invalid bearer |
| `403` | `FORBIDDEN` | caller is not platform administrator |
| `404` | `NOT_FOUND` | customer account `id` does not exist |
| `500` | `INTERNAL_SERVER_ERROR` | unexpected (mongo write failure) |

---

## 8. Reconcile report extension

`POST /admin/subscriptions/reconcile` already returns a detect-only report. v1 of
this contract extends the response body with one new section. **No existing keys
change.**

```json
{
  "code": "SUCCESS",
  "details": {
    "...existing-sections": "...",
    "customerAccountLimitDrift": {
      "totalExamined": 42,
      "drifted": 3,
      "samples": [
        { "customerAccountId": "ca_xxx", "planId": "pro", "current": 2, "canonical": 5 },
        { "customerAccountId": "ca_yyy", "planId": "pro", "current": 10, "canonical": 5 }
      ]
    }
  }
}
```

The `samples` array is bounded (first 50 entries) so the report does not blow up
on large deployments. Drift is reported in **both directions** (below and above
canonical) — operations should review and decide which to repair via the per-id
endpoint.

---

## 9. Field ownership

| Field | Writer | Notes |
|---|---|---|
| `customer_accounts.maxOrganizations` | `customersvc.RepairLimits` (this endpoint) for canonical-realignment writes; existing customer-create / plan-change flows keep their authority for product writes | The two writer paths must not race; product flows take precedence — the repair endpoint reads after them |
| `customer_accounts.planId` | unchanged — out of scope; read-only here | Canonical plan id |

---

## 10. Revision history

- **rev 1 (2026-04-27):** initial. Bug #3.
