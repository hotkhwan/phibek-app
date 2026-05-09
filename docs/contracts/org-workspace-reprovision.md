# Org Workspace Reprovision Contract

**Date:** 2026-04-23
**Status:** Superseded by [`org-lifecycle.md`](./org-lifecycle.md) on 2026-05-04 — `POST /api/v3/ingest/reprovisionWorkspace` (+ deprecated alias `/enableWebhook`) with full r1 wire-surface corrections preserved verbatim in §5.7 of the merged contract: 2-layer auth (`ActiveOrg()` view + service-layer `manage` check; platform admin bypass via `c.Locals("platformRole")` per decision 12.7); 7-row eligibility matrix with locked guarantee 12.3 (no force-recreate when `provisionStatus="active"`); 5 response envelopes (sync 200, idempotent, async 202 with `code="ACCEPTED"`, in-progress 200, error); 5 side effects (provisionStatus / workspaceId / eventIngestUri / audit / delivery target / Kafka `gw.workspace.provisioned.v1`); `400` for missing `X-Active-Org` (was r0 incorrectly 401); 404 generic `NOT_FOUND` (was r0 `ORG_NOT_FOUND`); audit middleware requires `auditPrefixes` entries; client branching primarily on `details.provisionStatus` not `details.idempotent`. Body kept here for PR / Codex review history.
**Owner Backend:** `klynx-api`
**Related Plan:** [docs/plan/org-workspace-reprovision.md](../plan/org-workspace-reprovision.md) (r2, pending Codex re-review)
**Applies To Repos:** `klynx-api` (owner), `klynx-feature` (admin UI consumer), ops/SRE (manual triggers)
**Contract Type:** REST
**Version:** v1

**Revision notes:**
- **r0 (2026-04-23):** initial draft. Lifted `EnablePhibekWorkspace` idempotency rules into a public contract; introduced `POST /api/v3/ingest/reprovisionWorkspace` as a discoverable alias.
- **r1 (2026-04-23):** wire-surface corrections after Codex first review (no behavior change, just contract truthfulness). The r0 envelopes promised codes/messages the handler does not emit:
  - **Auth failure shapes:** missing `X-Active-Org` is `400 BAD_REQUEST` (was r0: 401), per [internal/middleware/activeorg.go:88-95](../../internal/middleware/activeorg.go#L88-L95). 401 is reserved for missing/invalid bearer or missing `userId`/`tenantId` locals.
  - **404 envelope:** uses generic `code="NOT_FOUND"` (was r0: `ORG_NOT_FOUND`). `MapSvcError` ([internal/services/authzsvc/errors.go:106-108](../../internal/services/authzsvc/errors.go#L106-L108)) maps `ErrNotFound` → `gmod.CodeNotFound` — there is no domain subtype.
  - **202 envelope:** uses `code="ACCEPTED"`, `message="accepted"` (was r0: `SUCCESS`/`ok`), per `httputil.Accepted` ([utils/httputil/success.go:41-53](../../utils/httputil/success.go#L41-L53)).
  - **§1 false claim removed:** "service-account JWTs ... use `enableWebhook` only" was wrong — both routes share the same `AuthBearer` + `ActiveOrg` middleware stack, so SA tokens that pass `AuthBearer` would pass through both routes equally (subject to the new `manage` check added in plan r1).
  - **§3 auth model rewritten** to reflect the actual stack: `ActiveOrg()` enforces `view`, plan r1 adds an explicit `manage` check inside `EnablePhibekWorkspace`, and platform-admin bypass works via `c.Locals("platformRole")` shortcut (no Permify tuple required — see plan decision 12.7).
  - **§7 client guidance:** added explicit instruction to branch primarily on `details.provisionStatus`; `details.idempotent` is informational.
  - **§7 "never overwrites" guarantee** softened to a service-layer guarantee provided by the idempotency short-circuit at [internal/services/authzsvc/org.go:909-922](../../internal/services/authzsvc/org.go#L909-L922) — `UpdateWorkspaceRef` is not the enforcement point; do not bypass the service.
  - **§6 audit dependency:** notes that audit coverage requires the two `auditPrefixes` entries that plan r1 §10 adds; without them the existing middleware silently skips this surface.
- **r2 alignment (no wire change):** plan r2 changed the service-internal auth design from an options struct (fail-open) to two named methods (`EnablePhibekWorkspace` internal, `EnablePhibekWorkspaceForUser` user-facing). The wire surface this contract describes is unchanged. §3 still correctly says "service-layer `manage` check inside `EnablePhibekWorkspace`" — readers should now interpret that as the `EnablePhibekWorkspaceForUser` variant per plan r2 §10. No envelopes, codes, or status mappings were affected.

---

## 1. Purpose

Defines the REST surface by which an org owner (or platform admin) triggers re-provisioning of a phibek workspace for an org whose provisioning previously failed or never completed (`workspaceId == ""` OR `provisionStatus != "active"`). This is the **only** documented operator-driven recovery path for orgs stuck in `provisionFailed` state; the third-party files surface (`/api/v3/thirdParty/files/*`) intentionally fails closed with `500 INTERNAL_ERROR` for such orgs (per [docs/contracts/third-party-files-api.md](third-party-files-api.md) r3) and does not self-heal.

Two routes share this contract:

- `POST /api/v3/ingest/reprovisionWorkspace` — preferred, name communicates intent.
- `POST /api/v3/ingest/enableWebhook` — pre-existing alias, kept for backward compatibility, deprecated in swagger.

Both routes are wired to the same handler (`OrgController.EnablePhibekWorkspace`) and produce identical wire behavior including the auth model described in §3. Consumers should prefer `reprovisionWorkspace` for new code.

Key properties (locked guarantees, not implementation details):

- **Idempotent.** Calling against an org where `workspaceId != "" AND provisionStatus == "active"` returns `200` with `idempotent: true` and **does not** call gw. The contract forbids this surface from forcing recreation of an active workspace.
- **Eligibility.** A re-provisioning gw call happens only when `workspaceId == ""` OR `provisionStatus != "active"`. This intentionally covers the stuck-state shapes the file guard ([internal/middleware/thirdPartyFileGuard.go:124-130](../../internal/middleware/thirdPartyFileGuard.go#L124-L130)) treats as "no workspace".
- **Concurrency-safe.** Two simultaneous calls do not double-provision; the second receives the current `provisioning` status without re-triggering gw.
- **Audited.** Every call is captured by the existing `/ingest` audit middleware ([router/ingest.go:34](../../router/ingest.go#L34)).

---

## 2. Ownership

| Aspect | Owner |
|---|---|
| Route handler | `klynx-api/controllers/authzapi.OrgController.EnablePhibekWorkspace` |
| Service logic | `klynx-api/internal/services/authzsvc.OrganizationService.EnablePhibekWorkspace` |
| Workspace identity | `gateway-api/WorkspaceService` (klynx-api mirrors via `UpdateWorkspaceRef`) |
| Audit trail | `klynx-api/audit_logs` via existing `middleware.Audit(auditCfg)` |
| Deprecation policy for `enableWebhook` | `klynx-api` (this contract) |

---

## 3. Authentication & Authorization

### Required headers

```text
Authorization: Bearer <jwt>
X-Active-Org: <orgId>
```

### Auth model (two-layer)

This surface is gated by **two** auth layers, both of which must pass:

1. **`ActiveOrg()` middleware** ([internal/middleware/activeorg.go:72-166](../../internal/middleware/activeorg.go#L72-L166)) — requires `userId` + `tenantId` from a valid bearer (set by `AuthBearer`), `X-Active-Org` header present, and a Permify check for `organization.view` on `activeOrg`. Platform admins (`c.Locals("platformRole") == "administrator"`, set from JWT `role` claim by `AuthBearer` at [internal/middleware/auth.go:114](../../internal/middleware/auth.go#L114)) bypass the Permify view check.
2. **Service-layer `manage` check** added by plan r1 inside `OrganizationService.EnablePhibekWorkspace`. Calls `s.authzClient.CheckPermissionWithSchemaVersion(ctx, tenantId, version, "organization", orgId, "manage", "user", userId)`. If `platformRole == "administrator"`, this check is **bypassed entirely** — the platform admin is **not** required to hold a Permify `manage` tuple (decision 12.7).

In short: an org owner (or admin) holding the Permify `manage` tuple succeeds. A platform admin succeeds without any Permify tuple. A plain org member with only `view` is rejected at layer 2 (would have passed layer 1).

### Auth failure modes

| Condition | HTTP Status | Wire `code` | Source |
|---|---|---|---|
| Missing or invalid bearer | 401 | `UNAUTHORIZED` | `AuthBearer` |
| Bearer valid but `userId`/`tenantId` locals empty | 401 | `UNAUTHORIZED` | `ActiveOrg()` line 81-86 |
| `X-Active-Org` header missing | **400** | **`BAD_REQUEST`** | `ActiveOrg()` line 88-95 (note: r0 incorrectly listed this as 401) |
| Caller has neither `view` tuple nor `platformRole=administrator` | 403 | `FORBIDDEN` | `ActiveOrg()` line 155-161 |
| `view` passed but caller lacks `manage` and not platform admin | 403 | `FORBIDDEN` | new service-layer check (plan r1) → `MapSvcError(ErrForbidden)` |

---

## 4. Routes

### 4.1 `POST /api/v3/ingest/reprovisionWorkspace` (preferred)

**Purpose:** Trigger or no-op re-provision of the phibek workspace for `activeOrg`.

**Request body:** empty. All inputs are derived from headers/locals.

**Behavior matrix (eligibility):**

| Org state at request time | gw call made? | HTTP | Response `idempotent` | Final `provisionStatus` |
|---|---|---|---|---|
| `workspaceId="", provisionStatus="provisionFailed"` | yes | 200 (appliance, sync) / 202 (saasPublic, async) | `false` | `active` (sync) / `provisioning` (async) |
| `workspaceId="", provisionStatus=""` (newly created, never provisioned) | yes | 200 / 202 | `false` | `active` / `provisioning` |
| `workspaceId="", provisionStatus="provisioning"` | no | 200 | `false` | `provisioning` (unchanged) |
| `workspaceId="ws_x", provisionStatus="active"` | **no** | 200 | `true` | `active` (unchanged) |
| `workspaceId="ws_x", provisionStatus="provisioning"` | no | 200 | `false` | `provisioning` (unchanged) |
| `workspaceId="ws_x", provisionStatus="provisionFailed"` (stale workspaceId) | yes | 200 / 202 | `false` | `active` / `provisioning` (gw may issue same or new workspaceId; klynx mirror updated) |

**Locked guarantee (decision 12.3):** For any input where `provisionStatus == "active"`, the handler MUST NOT call gw and MUST return `idempotent: true`. There is no override flag; force-recreate is **not** in scope.

### 4.2 `POST /api/v3/ingest/enableWebhook` (alias, deprecated)

Identical wire behavior to §4.1. Marked `Deprecated` in swagger as of this contract release. No removal date set; existing callers continue to work indefinitely.

---

## 5. Response Envelopes

### 5.1 Success — synchronous (appliance), newly provisioned

```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "code": "SUCCESS",
  "message": "ok",
  "status": true,
  "details": {
    "orgId": "390ac6ec-073b-4265-99da-9c17b7a2c4f5",
    "workspaceId": "2688fa46-00d6-4e50-b2b9-5482187b844a",
    "eventIngestUri": "/events/2688fa46-00d6-4e50-b2b9-5482187b844a/",
    "provisionStatus": "active",
    "idempotent": false
  }
}
```

### 5.2 Success — idempotent (org already active)

```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "code": "SUCCESS",
  "message": "ok",
  "status": true,
  "details": {
    "orgId": "390ac6ec-073b-4265-99da-9c17b7a2c4f5",
    "workspaceId": "2688fa46-00d6-4e50-b2b9-5482187b844a",
    "eventIngestUri": "/events/2688fa46-00d6-4e50-b2b9-5482187b844a/",
    "provisionStatus": "active",
    "idempotent": true
  }
}
```

Distinguish "newly provisioned" vs "no-op" by reading `details.idempotent`. Do not infer from response time — both paths return < 1s on a healthy system.

### 5.3 Accepted — async (saasPublic profile, newly triggered)

```http
HTTP/1.1 202 Accepted
Content-Type: application/json

{
  "code": "ACCEPTED",
  "message": "accepted",
  "status": true,
  "details": {
    "orgId": "390ac6ec-073b-4265-99da-9c17b7a2c4f5",
    "workspaceId": "",
    "eventIngestUri": "",
    "provisionStatus": "provisioning",
    "idempotent": false
  }
}
```

Note the envelope: `code="ACCEPTED"` and `message="accepted"` (NOT `SUCCESS`/`ok`) — emitted by `httputil.Accepted` ([utils/httputil/success.go:41-53](../../utils/httputil/success.go#L41-L53)). Caller polls `GET /api/v3/ingest/` until `provisionStatus="active"` to observe completion. (Push notification is out of contract scope; see plan §14.)

### 5.4 In-progress (org already provisioning)

```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "code": "SUCCESS",
  "message": "ok",
  "status": true,
  "details": {
    "orgId": "390ac6ec-073b-4265-99da-9c17b7a2c4f5",
    "workspaceId": "",
    "eventIngestUri": "",
    "provisionStatus": "provisioning",
    "idempotent": false
  }
}
```

`idempotent` is `false` here because no skip-decision was made — the second caller observed an in-progress operation and was told to wait. Treat as "wait + poll" same as §5.3.

### 5.5 Error envelope (all 4xx/5xx)

```json
{
  "code": "<ERROR_CODE>",
  "message": "<human-readable explanation>",
  "status": false
}
```

| Status | Code | When |
|---|---|---|
| 400 | `BAD_REQUEST` | (a) `X-Active-Org` header missing — emitted by `ActiveOrg()` middleware. (b) Neither `workspaceProvisioner` (gRPC) nor `orgEventPublisher` (Kafka) is configured for the deployment profile — server cannot complete the request. Returned by `EnablePhibekWorkspace` Path 3 ([internal/services/authzsvc/org.go:983-1000](../../internal/services/authzsvc/org.go#L983-L1000)). |
| 401 | `UNAUTHORIZED` | Missing or invalid bearer JWT, or `userId`/`tenantId` could not be derived from the token. |
| 403 | `FORBIDDEN` | (a) Caller lacks `organization.view` AND is not platform admin (rejected by `ActiveOrg()`). (b) `view` passed but caller lacks `organization.manage` AND is not platform admin (rejected by service-layer check added in plan r1). |
| 404 | `NOT_FOUND` | `activeOrg` does not match any org in the caller's tenant — generic code, no domain subtype. |
| 500 | `INTERNAL_ERROR` | gw `WorkspaceService.ProvisionFromOrg` returned an error (appliance), or the Kafka publish failed (saasPublic), or the Permify gRPC call for the manage check errored. `provisionStatus` flips to `"provisionFailed"` (gw failure case only) before this response is returned. Caller may retry once the dependency is healthy. |

The exact `code` strings come from `authzsvc.MapSvcError` ([internal/services/authzsvc/errors.go:97-150](../../internal/services/authzsvc/errors.go#L97-L150)) and the controller's `httputil` envelope helpers — consumers MUST match on `code`, not on `message` (which may be improved over time). There is no domain-subtyped `ORG_NOT_FOUND` code; r0 of this contract incorrectly listed one.

---

## 6. Side Effects

| Effect | Trigger condition | Notes |
|---|---|---|
| `organizations.provisionStatus` updated | Always when gw call is attempted | Flips to `"provisioning"` before gw call, then to `"active"` (success) or `"provisionFailed"` (error). No update on idempotent skip. |
| `organizations.workspaceId` updated | Only on gw success | via `UpdateWorkspaceRef` ([internal/repo/authzrepo/org.go:278-288](../../internal/repo/authzrepo/org.go#L278-L288)). |
| `organizations.eventIngestUri` updated | Only on gw success | Same write as `workspaceId`. |
| Audit log row written | Always (after plan r1 §10 ships) | via `middleware.Audit(auditCfg)` on the `/ingest` group. **Requires the two `auditPrefixes` entries (`ingestReprovisionWorkspace`, `ingestEnableWebhook`) added in plan r1 §10** — without those entries the middleware silently skips this route (see [internal/middleware/audit.go:138-147](../../internal/middleware/audit.go#L138-L147)). Captures `orgId`, `userId`, route, HTTP status, response code. |
| gw delivery target registration | Best-effort, after `UpdateWorkspaceRef` succeeds | Only when `deliveryTargetRegistrar` is wired (appliance profile). Failure is non-fatal and does not change the response — see [internal/services/authzsvc/org.go:967-980](../../internal/services/authzsvc/org.go#L967-L980). |
| `gw.workspace.provisioned.v1` Kafka message | saasPublic profile only | klynx publishes; `workspaceprovcons` updates the mirror on consumption. The 202 response is returned **before** that Kafka round-trip completes. |

---

## 7. Status & Eligibility Reference

### Client branching guidance

Branch primarily on `details.provisionStatus`, **not** on `details.idempotent`. The `idempotent` field is informational only — it tells you "the server short-circuited because the org was already active" (`true`) or "the server reached its decision through normal flow" (`false`). It does NOT distinguish "newly provisioned" from "in-progress / no-op": both return `idempotent: false`. The reliable signal for "did anything change?" is `provisionStatus` against your prior known value.

Recommended client branching:

```text
switch details.provisionStatus:
  "active"        → workspace ready; if details.idempotent, you can suppress a "success" toast
  "provisioning"  → poll GET /ingest/ until "active" (saasPublic async, or another caller already in flight)
  "provisionFailed" → gw call failed; treat as user-visible error; show retry CTA
  ""              → unexpected for a successful response; treat as error
```

### `provisionStatus` values

Defined in [models/authzmod/org.go](../../models/authzmod/org.go). Consumers should treat any unknown string as a fail-safe "not active".

| Value | Meaning | Eligible for reprovision call? |
|---|---|---|
| `""` (empty) | Org never went through provisioning (legacy or freshly created before provisioner wired) | yes |
| `"provisioning"` | gw call in progress | no — call returns current state, no double-trigger |
| `"active"` | Workspace exists and is healthy | **no — locked guarantee, never re-provisioned via this surface** |
| `"provisionFailed"` | Last gw call returned an error | yes |

### `workspaceId` semantics

- Empty string `""` means "no workspace mirror" — gw never confirmed one for this org.
- Non-empty value means "klynx believes this org has workspace X in gw" — may be stale if gw lost the workspace, but this surface does not re-validate against gw.
- The "no overwrite while active" property is a **service-layer guarantee** provided by the idempotency short-circuit at [internal/services/authzsvc/org.go:909-922](../../internal/services/authzsvc/org.go#L909-L922) — `EnablePhibekWorkspace` returns immediately when `WorkspaceID != "" && provisionStatus == "active"` and never reaches the `UpdateWorkspaceRef` call. The repo layer (`OrgRepo.UpdateWorkspaceRef`) does **not** enforce this and would happily overwrite if called directly. Callers MUST go through `EnablePhibekWorkspace`; do not bypass the service for these writes.

---

## 8. Examples

### 8.1 Recover a stuck org (curl)

```bash
curl -X POST "https://aliza.k-lynx.com/api/v3/ingest/reprovisionWorkspace" \
  -H "Authorization: Bearer $JWT" \
  -H "X-Active-Org: 390ac6ec-073b-4265-99da-9c17b7a2c4f5"
```

Expected on first call (stuck → recovered, appliance):

```json
{
  "code": "SUCCESS",
  "status": true,
  "details": {
    "orgId": "390ac6ec-073b-4265-99da-9c17b7a2c4f5",
    "workspaceId": "2688fa46-00d6-4e50-b2b9-5482187b844a",
    "eventIngestUri": "/events/2688fa46-00d6-4e50-b2b9-5482187b844a/",
    "provisionStatus": "active",
    "idempotent": false
  }
}
```

Expected on second call (already active):

```json
{
  "code": "SUCCESS",
  "status": true,
  "details": {
    "orgId": "390ac6ec-073b-4265-99da-9c17b7a2c4f5",
    "workspaceId": "2688fa46-00d6-4e50-b2b9-5482187b844a",
    "eventIngestUri": "/events/2688fa46-00d6-4e50-b2b9-5482187b844a/",
    "provisionStatus": "active",
    "idempotent": true
  }
}
```

### 8.2 Verify recovery downstream

After §8.1 returns `provisionStatus="active"`, the third-party files surface for the same org should stop returning 500 INTERNAL_ERROR:

```bash
curl -X GET "https://aliza.k-lynx.com/api/v3/thirdParty/files/canonical/2688fa46-00d6-4e50-b2b9-5482187b844a/events/<eventId>/<filename>" \
  -H "Authorization: Bearer $SA_JWT"
```

Should return 200 (object found), 404 (`EVENT_NOT_FOUND` or `FILE_NOT_FOUND` — depends on actual data), but not 500 `INTERNAL_ERROR`.

---

## 9. Versioning & Deprecation

- **v1 (this document):** introduces `reprovisionWorkspace`; aliases `enableWebhook`; locks no-force-when-active guarantee.
- `enableWebhook` is marked deprecated in swagger as of v1. No removal scheduled. New consumers MUST use `reprovisionWorkspace`.
- Future force-recreate flow (if ever needed) MUST be a separate route with its own contract version and explicit safeguards. It will not be added to this surface.

---

## 10. Out of Scope

The following are explicitly **not** covered by this contract and require a separate plan/contract if needed:

- Tenant-level "list all stuck orgs" admin endpoint.
- Bulk reprovision across multiple orgs in one request.
- Background reconciler / startup auto-reprovision (deferred to Phase 2, see plan §14).
- Force-recreate of an active workspace (locked out by §4.1 guarantee).
- Async push notification when saasPublic 202 finally completes — caller polls `GET /api/v3/ingest/`.
