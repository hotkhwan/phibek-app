# Deployment Profile Contract

**Date:** 2026-04-23
**Status:** Draft
**Owner Backend:** `klynx-api`
**Related Plan:** [docs/plan/deploymentProfileConsolidation.md](../plan/deploymentProfileConsolidation.md)
**Applies To Repos:** `klynx-api`
**Contract Type:** `REST (admin debug) + internal config enum`
**Version:** `v1`

---

## 1. Purpose

Defines the canonical set of `DEPLOYMENT_PROFILE` values used by `klynx-api` at startup, the alias mapping from legacy values, and the single admin debug endpoint that exposes the resolved profile.

- klynx-api publishes this contract as the source of truth for profile semantics.
- Downstream feature plans (e.g. `docs/plan/orgSubscriptionRepair.md`) must cite the canonical `Profile` values defined here; they must not branch on raw env strings.
- Operators must read this contract before configuring new deployments.
- Frontend repos do not consume this contract.

---

## 2. Ownership

### Owner Backend

- `klynx-api`

### Domain System of Record

| Domain | System of Record | Canonical Store | Notes |
|---|---|---|---|
| Profile canonical enum | `klynx-api/config.Profile` | in-process constant set | Defines the three valid runtime values |
| Profile env input | deployment platform (ops) | `DEPLOYMENT_PROFILE` env var | One read per process lifetime |
| Effective profile (resolved) | `klynx-api/config.ResolveDeploymentProfile` | in-process container field | Available via admin debug endpoint |

### Producer / Consumers

| Surface | Producer | Consumers | Notes |
|---|---|---|---|
| `DEPLOYMENT_PROFILE` env var | ops deployment manifest | klynx-api resolver at startup | Raw string input |
| `EffectiveProfile` (process-local) | klynx-api resolver | `main.go` switch, consumer startup branches, admin debug endpoint | Canonical enum after alias resolution |
| `GET /admin/system/deploymentProfile` | klynx-api admin handler | ops tooling | Read-only debug |

### Projection Stores

Not applicable — profile is process-lifetime config, not stored data.

---

## 3. Compatibility and Policy

### Backward Compatibility

- Compatibility status: **additive + alias**.
- The 3 canonical values (`appliance`, `platform`, `saas`) are new identifiers.
- The 3 canonical values plus 3 legacy aliases (`saasKlynx`, `saasPhibek`, `saasPublic`) are accepted; `appliance` is canonical and not a legacy alias. The previous `enterprise` alias was removed when `enterprise` became a canonical `LicenseMode` value (see `models/licensemod/platformLicense.go`); deployments using `DEPLOYMENT_PROFILE=enterprise` must switch to `platform`. Legacy-alias deployments emit exactly one deprecation warning per process lifetime at startup; canonical-value deployments do not warn. Alias acceptance is maintained for at least 1 release.
- Consumer requirements: downstream feature plans must reference canonical values only.
- Deprecation window: at minimum 1 release cycle. Removal is subject to a follow-up plan and requires zero deprecation log hits in production telemetry for the prior release.

### Replay / Re-sync Behavior

Not applicable — profile is a startup config value, not an event or stored record.

### Write Authority Policy

- `klynx-api/config.ResolveDeploymentProfile` is the authoritative resolver.
- No code outside `config` package may read `os.Getenv("DEPLOYMENT_PROFILE")` directly after this contract is in effect; all consumers must read `container.EffectiveProfile` or equivalent injected value.
- Downstream feature plans must branch on `EffectiveProfile` enum values, never on raw strings.

---

## 4. Surface Summary

| Type | Name | Method / Topic | Auth | Producer / Handler | Consumer / Caller |
|---|---|---|---|---|---|
| Internal enum | `config.Profile` | n/a | n/a | `klynx-api/config` | klynx-api (startup + admin handler) |
| Internal fn | `config.ResolveDeploymentProfile(raw)` | n/a | n/a | `klynx-api/config` | `main.go`, container init |
| REST | `/admin/system/deploymentProfile` | `GET` | BearerAuth + role `administrator` | `controllers/sysapi.GetDeploymentProfile` | ops tooling |

---

## 5. REST Contract

### 5.1 Get Deployment Profile (admin debug)

**Endpoint:** `/admin/system/deploymentProfile`
**Method:** `GET`
**Auth:** `BearerAuth` plus platform role `administrator` (enforced via `middleware.RequireRoles(["administrator"])`).
**Purpose:** Return the canonical profile currently in effect, the raw env input, and the resolution result. Read-only. Process-local; does not read the env var at request time.

#### Path Params

None.

#### Query Params

None.

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
    "rawProfile": "saasKlynx",
    "effectiveProfile": "platform",
    "resolveResult": "aliased"
  }
}
```

#### Success Field Definitions

| Field | Type | Description |
|---|---|---|
| `rawProfile` | string | The raw `DEPLOYMENT_PROFILE` env value observed at startup. Empty string when unset. |
| `effectiveProfile` | string enum | One of `appliance`, `platform`, `saas`. The canonical value the process is running as. |
| `resolveResult` | string enum | One of `canonical`, `aliased`, `defaulted`, `unknown`. Explains how `effectiveProfile` was derived. |

#### `resolveResult` enum semantics

| Value | Meaning |
|---|---|
| `canonical` | `rawProfile` is one of the 3 canonical values; used as-is |
| `aliased` | `rawProfile` is a legacy value; mapped to the canonical value per §5.2; deprecation warn was logged at startup |
| `defaulted` | `rawProfile` was empty/unset; resolver defaulted to `appliance` |
| `unknown` | `rawProfile` is non-empty but not in the canonical or alias set; resolver fell back to `appliance`; warn was logged at startup |

#### Error Contract

This endpoint reuses the existing `middleware.AuthBearer()` and `middleware.RequireRoles(["administrator"])` chain without a custom error wrapper. The response body therefore follows the **middleware's native shape**, which differs from the `{code, message, status}` envelope used by feature endpoints. Consumers must handle both shapes when calling this debug surface.

| HTTP | Meaning | Body Shape (verbatim from middleware) | Consumer Handling |
|---|---|---|---|
| 401 | Missing or invalid bearer token | `{"message": "Missing user context"}` (or equivalent auth-middleware message) | Standard auth retry |
| 403 | Caller authenticated but lacks platform role `administrator` | `{"message": "Forbidden"}` or `{"message": "Role not found in token"}` (whichever branch the middleware takes — see [internal/middleware/auth.go:182,204](../../internal/middleware/auth.go#L182)) | Do not retry as current user |

> **Contract note:** Aligning this endpoint to the standard `{code, message, status}` envelope would require wrapping `RequireRoles` in a custom handler or modifying the middleware itself. Both are explicitly **out of scope** for this foundation plan — it would add an auth-layer change to what should be a pure-config deliverable. A follow-up plan may unify the middleware envelope across admin endpoints; until then, this debug endpoint is documented as using the middleware's native shape to avoid promising behavior the code does not implement.

#### Error Example

```json
{
  "message": "Forbidden"
}
```

---

### 5.2 Canonical Values and Alias Table

#### Canonical Profile Enum

| Canonical Value | Intent | Plan Authority |
|---|---|---|
| `appliance` | single-customer on-prem deployment | platform license |
| `platform` | operator/reseller deployment (e.g. Klynx, Phibek, future OEM partners) | operator (per-tenant subscription) |
| `saas` | public SaaS deployment (signup/billing driven) | subscription (billing/self-service) |

> This contract defines the profile authority model **only** — i.e. which system is the source of truth for plan decisions in each profile. Concrete license↔subscription orchestration (activation flow, seed/upgrade/downgrade behavior, repair triggers, per-operation case matrices) is **out of scope here** and is owned by `docs/contracts/orgSubscriptionRepair.md` (revised). Downstream plans must cite that contract for operational behavior and cite this contract only for the canonical profile enum and authority model.

#### Alias Mapping

| Legacy Value | Canonical Value | Resolution Result | Deprecation Window |
|---|---|---|---|
| `appliance` | `appliance` | `canonical` | n/a (same name) |
| `enterprise` | `appliance` (fallback) | `unknown` | **removed** — alias dropped when `enterprise` became a canonical `LicenseMode` value. Deployments must switch to `DEPLOYMENT_PROFILE=platform`. |
| `saasKlynx` | `platform` | `aliased` | ≥ 1 release |
| `saasPhibek` | `platform` | `aliased` | ≥ 1 release |
| `saasPublic` | `saas` | `aliased` | ≥ 1 release |
| *(empty / unset)* | `appliance` | `defaulted` | n/a — default behavior preserved indefinitely |
| *(any other value)* | `appliance` | `unknown` | n/a — permanent fallback; warn-logged |

#### Deprecation Log Rule

On startup, when `resolveResult == "aliased"`, the resolver must emit exactly one warn-level log line in this shape:

```
WARN component=config source=deploymentProfile
  msg="DEPLOYMENT_PROFILE=<rawProfile> is a deprecated alias for <effectiveProfile>; update your deployment config"
  rawProfile=<raw> effectiveProfile=<canonical> deprecationWindow="≥1 release"
```

No log is emitted post-startup or per-request.

When `resolveResult == "unknown"`, the resolver must emit:

```
WARN component=config source=deploymentProfile
  msg="DEPLOYMENT_PROFILE=<rawProfile> is not a recognized value; defaulting to appliance"
  rawProfile=<raw> effectiveProfile=appliance
```

When `resolveResult == "defaulted"` or `"canonical"`, no warn is emitted. An info-level startup log with all 3 fields is always emitted regardless of result.

---

## 6. Event Contract

Not applicable — no topics emitted or consumed by this contract.

---

## 7. Canonical and Projection Mapping

Not applicable — profile is process-lifetime config, not stored data.

---

## 8. Field Ownership

Not applicable — single-writer process-local config.

---

## 9. Frontend Integration Notes

### Required FE Inputs

| FE Use Case | Contract Surface | Required Fields | Notes |
|---|---|---|---|
| none | — | — | Admin-debug only; no user-facing FE integration |

### FE Guardrails

- FE repos must not call `/admin/system/deploymentProfile`.
- If an internal admin tool later surfaces profile information, it must read `effectiveProfile` verbatim — never infer from other config.
- The documented `resolveResult` enum is closed; do not branch on undocumented values.

---

## 10. Rollout Notes

| Repo | Dependency | Required Before | Notes |
|---|---|---|---|
| `klynx-api` | Contract publication | Resolver implementation | Contract approved by Codex before `config.ResolveDeploymentProfile` ships |
| ops runbook | Alias table live in UAT | Prod cutover of legacy env values | Canonical values in deployment manifests at ops convenience during the deprecation window |
| downstream plans (`orgSubscriptionRepair` revision, future profile-aware feature plans) | Canonical enum stable | Any per-profile branching | Must depend on this contract before introducing `appliance`/`platform`/`saas` divergence |

---

## 11. Examples

### 11.1 Canonical value (no alias)

```http
GET /admin/system/deploymentProfile
Authorization: Bearer <jwt-of-administrator>
```

```json
{
  "code": "SUCCESS",
  "message": "ok",
  "status": true,
  "details": {
    "rawProfile": "appliance",
    "effectiveProfile": "appliance",
    "resolveResult": "canonical"
  }
}
```

### 11.2 Aliased value (e.g. legacy `saasKlynx`)

```json
{
  "code": "SUCCESS",
  "message": "ok",
  "status": true,
  "details": {
    "rawProfile": "saasKlynx",
    "effectiveProfile": "platform",
    "resolveResult": "aliased"
  }
}
```

### 11.3 Defaulted (empty env)

```json
{
  "code": "SUCCESS",
  "message": "ok",
  "status": true,
  "details": {
    "rawProfile": "",
    "effectiveProfile": "appliance",
    "resolveResult": "defaulted"
  }
}
```

### 11.4 Unknown value

```json
{
  "code": "SUCCESS",
  "message": "ok",
  "status": true,
  "details": {
    "rawProfile": "applince",
    "effectiveProfile": "appliance",
    "resolveResult": "unknown"
  }
}
```

### 11.5 Forbidden (non-admin caller)

Response body follows the middleware's native shape (see §5.1 Error Contract note):

```json
{
  "message": "Forbidden"
}
```

---

## 12. Checklist

- [x] Owner backend is explicit.
- [x] System of record is defined by domain.
- [x] Canonical store and projection store are documented (n/a for config).
- [x] Producers and consumers are listed.
- [x] Request, response, and error contracts are defined for the admin debug endpoint.
- [x] Field ownership (n/a for single-writer config) stated explicitly.
- [x] Backward compatibility is documented (alias + deprecation window).
- [x] Replay or re-sync behavior is documented (n/a).
- [x] FE field mapping — none required and stated.
- [x] Canonical enum values are fixed: `appliance`, `platform`, `saas`.
- [x] Alias table is exhaustive for every legacy value observed in code or docs.
- [x] Deprecation log rule is explicit (warn level, one-shot at startup).
