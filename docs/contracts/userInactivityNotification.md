# User Inactivity Notification Contract

**Date:** 2026-04-26
**Status:** Draft
**Owner Backend:** `klynx-api`
**Related Plan:** [docs/plan/userInactivityNotification.md](../plan/userInactivityNotification.md)
**Applies To Repos:** `klynx-api`, `klynx-feature`
**Contract Type:** REST + Email (outbound, internal gateway)
**Version:** v1

---

## 1. Purpose

Defines (a) two new admin REST endpoints exposing the user-inactivity scanner, (b) the persisted user fields that drive it, and (c) the email envelope sent to users / platform admins / org admins when an account has been inactive for ≥ 1 year (counting from the configured policy start date — default 2026-05-01).

- klynx-api publishes this contract.
- klynx-feature renders a small admin settings panel against the REST surface.
- The email envelope is documented so future migration to a different transport (SES, SendGrid) keeps the same recipient grouping and template variables.

---

## 2. Ownership

### Owner Backend

- `klynx-api`

### Domain System of Record

| Domain | System of Record | Canonical Store | Notes |
|---|---|---|---|
| Auth identity | Keycloak | Keycloak realm | unchanged |
| User profile (within klynx) | `klynx-api/usersrepo` | `users` collection | `lastLoginAt`, `primaryOrgId`, `lastInactivityNotifiedAt` are owned here |
| Notification dispatch / idempotency | `klynx-api/inactivitydispatchrepo` | `user_inactivity_dispatches` (new) | one row per `(userId, periodKey)`; holds claim, durable intent, attempt count, terminal `sent`/`failed` state — see plan §5.2 |
| Fleet scan lease | `klynx-api/leaserepo` | `inactivity_scan_leases` (new) | one row keyed by scan name |
| Admin role lookup | Permify (via `authzsvc`) | Permify | role = `administrator` (platform), org-scoped `admin` relation per org |
| Email delivery | new `internal/gateways/emailgw/` | external SMTP | first email sender in this repo |

### Producer / Consumers

| Surface | Producer | Consumers | Notes |
|---|---|---|---|
| `GET /admin/system/userInactivity/summary` | `sysapi.UserInactivitySummary` | `klynx-feature` admin settings | new |
| `POST /admin/system/userInactivity/runNow` | `sysapi.UserInactivityRunNow` | `klynx-feature` admin settings | new, idempotent (cooldown) |
| Email envelope `klynx.user.inactivity.v1` | `emailgw.SendInactivityNotice` | external mail server | not a kafka/REST surface — email body template |

### Projection Stores

| Projection | Store | Consumer | Notes |
|---|---|---|---|
| Dispatch history (also serves as the idempotency anchor — not just a projection) | `user_inactivity_dispatches` | summary endpoint + scanner | TTL 2 years on `intentAt` |

---

## 3. Compatibility and Policy

### Backward Compatibility

- Status: **additive**. New fields, new endpoints, new gateway. No existing surface changes.
- Consumer requirements: none for existing FE; new admin panel reads new endpoints.
- Deprecation window: n/a.

### Replay / Re-sync Behavior

- Re-running the scanner is safe — the cooldown field (`lastInactivityNotifiedAt`) suppresses duplicate notifications within `INACTIVITY_NOTIFY_COOLDOWN_DAYS` (default 30 days).
- Dry-run mode does not write `lastInactivityNotifiedAt` and sends no email.

### Write Authority Policy

- klynx-api is the authoritative writer for `lastLoginAt` and `lastInactivityNotifiedAt`.
- Email address is **read** from the Keycloak JWT on each login and cached in the user record. Keycloak remains authoritative for the email itself.
- The scanner never writes to Keycloak.

---

## 4. Surface Summary

| Type | Name | Method / Topic | Auth | Producer / Handler | Consumer / Caller |
|---|---|---|---|---|---|
| REST | Inactivity scan summary | `GET /admin/system/userInactivity/summary` | Bearer + platform admin | `sysapi.UserInactivitySummary` | `klynx-feature` |
| REST | Run inactivity scan now | `POST /admin/system/userInactivity/runNow` | Bearer + platform admin | `sysapi.UserInactivityRunNow` | `klynx-feature` |
| Email | Inactivity notice | (email body template) | n/a | `emailgw.SendInactivityNotice` | end users + admins |

---

## 5. REST Contract

### 5.1 Inactivity scan summary

**Endpoint:** `/admin/system/userInactivity/summary`
**Method:** `GET`
**Auth:** Bearer JWT; caller must hold platform `administrator` role.
**Purpose:** Show the most recent scanner run (timestamp, counts, recently notified users) so a platform admin can verify the feature is healthy.

#### Path Params

(none)

#### Query Params

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `recentLimit` | int | no | 20 | how many most-recent notification audit rows to return (max 200) |

#### Request Headers

| Header | Required | Description |
|---|---|---|
| `Authorization` | yes | `Bearer <jwt>` |
| `X-Active-Org` | no | not used by this endpoint |

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
    "policyStart": "2026-05-01T00:00:00Z",
    "thresholdDays": 365,
    "cooldownDays": 30,
    "scannerEnabled": true,
    "emailEnabled": true,
    "lastScanAt": "2026-04-25T19:00:00Z",
    "lastScanHolder": "klynx-api-7c4f-xyz",
    "lastScanResult": {
      "candidates": 0,
      "notified": 0,
      "skippedCooldown": 0,
      "skippedReason": null,
      "errors": 0,
      "durationMs": 412
    },
    "recentNotifications": [
      {
        "userId": "kc-…",
        "userEmail": "alice@acme.example",
        "orgId": "org-…",
        "periodKey": 619,
        "status": "sent",
        "attemptCount": 1,
        "lastLoginAt": "2025-04-23T09:11:00Z",
        "intentAt": "2026-05-01T00:05:09Z",
        "sentAt": "2026-05-01T00:05:13Z",
        "lastError": null,
        "recipients": {
          "user": "alice@acme.example",
          "platformAdmins": ["root@acme.example"],
          "orgAdmins": ["ops@acme.example"]
        }
      }
    ]
  }
}
```

#### Success Field Definitions

| Field | Type | Description |
|---|---|---|
| `policyStart` | string (RFC3339 UTC) | configured `INACTIVITY_POLICY_START`; scanner refuses to act before this date |
| `thresholdDays` | int | inactivity threshold (default 365) |
| `cooldownDays` | int | suppression window (default 30) |
| `scannerEnabled` | bool | whether the ticker is wired (depends on profile and `INACTIVITY_SCANNER_ENABLED`) |
| `emailEnabled` | bool | `false` when SMTP creds are missing — scanner still runs but dispatches nothing (dry-run-only mode); see §10 |
| `lastScanAt` | string \| null | most recent scanner run on **any pod**; `null` if never run |
| `lastScanHolder` | string \| null | pod id that held the lease for the most recent scan; informational, helps ops correlate logs in multi-pod deploys |
| `lastScanResult.candidates` | int | users matching the inactivity filter |
| `lastScanResult.notified` | int | candidates we actually emailed |
| `lastScanResult.skippedCooldown` | int | candidates skipped because already notified within cooldown OR another pod won the per-user CAS |
| `lastScanResult.skippedReason` | string \| null | non-null when the entire scan was skipped — currently only `"scan-already-running"` (another pod or invocation holds the fleet lease) |
| `lastScanResult.errors` | int | per-user dispatch failures (these are retried next cycle) |
| `lastScanResult.durationMs` | int | wall time of the last scan |
| `recentNotifications[]` | array | most recent N rows from `user_inactivity_dispatches` (sorted by `intentAt` desc) |
| `recentNotifications[].status` | string | one of `intent`, `sent`, `failed`. Rows still in `intent` are visible — they are dispatches that have not yet completed (in-flight, expired-claim-pending-resume, or persistent-failure-not-yet-terminal). |
| `recentNotifications[].periodKey` | int | cooldown bucket id; same formula as plan §5.4 |
| `recentNotifications[].attemptCount` | int | how many times this row has been claimed; `> 1` means a previous attempt crashed mid-dispatch (the locked accepted-risk case). FE may render this as a warning indicator. |
| `recentNotifications[].lastError` | string \| null | populated when the most recent send returned an error; cleared on success |

#### Error Contract

| HTTP | Code | Meaning | Consumer Handling |
|---|---|---|---|
| 401 | `UNAUTHORIZED` | missing/invalid bearer | redirect to login |
| 403 | `FORBIDDEN` | not platform admin | hide panel |
| 500 | `INTERNAL_ERROR` | unexpected | show retry |

---

### 5.2 Run inactivity scan now

**Endpoint:** `/admin/system/userInactivity/runNow`
**Method:** `POST`
**Auth:** Bearer JWT; caller must hold platform `administrator` role.
**Purpose:** Manually trigger one scan cycle. Honors the cooldown — repeated calls in the same 30-day window will report `skippedCooldown` for already-notified users and notify nobody else.

#### Request Body

```json
{
  "dryRun": false
}
```

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `dryRun` | bool | no | `false` | if `true`, computes candidates and recipients but **does not** send email or update `lastInactivityNotifiedAt` |

#### Success Response

**HTTP:** `200`

```json
{
  "code": "SUCCESS",
  "message": "scan complete",
  "status": true,
  "details": {
    "dryRun": false,
    "candidates": 3,
    "notified": 3,
    "skippedCooldown": 0,
    "skippedReason": null,
    "errors": 0,
    "durationMs": 1182,
    "previewUserIds": ["kc-…", "kc-…", "kc-…"]
  }
}
```

#### Error Contract

| HTTP | Code | Meaning | Consumer Handling |
|---|---|---|---|
| 401 | `UNAUTHORIZED` | missing/invalid bearer | redirect |
| 403 | `FORBIDDEN` | not platform admin | hide panel |
| 500 | `INTERNAL_ERROR` | unexpected | show retry |

**Lease-held is not an error.** When the fleet-wide lease (`inactivity_scan_leases._id="inactivity-scan"`) is held by another pod or another invocation, `runNow` responds `200` with `details.skippedReason="scan-already-running"` and `details.notified=0`. There is no `409` path. FE renders the response with the same envelope shape as a normal run; a `skippedReason` value is the signal to display "scan already in progress" without treating it as a transient client error.

#### Skipped-Run Example (success envelope, not an error)

```json
{
  "code": "SUCCESS",
  "message": "scan already running on another pod or invocation",
  "status": true,
  "details": {
    "dryRun": false,
    "candidates": 0,
    "notified": 0,
    "skippedCooldown": 0,
    "skippedReason": "scan-already-running",
    "errors": 0,
    "durationMs": 12,
    "previewUserIds": []
  }
}
```

---

## 6. Event Contract

### 6.1 Email envelope `klynx.user.inactivity.v1` (outbound email, not kafka)

**Producer:** `emailgw.SendInactivityNotice`
**Consumers:** end users (the inactive user, platform admins, org admins of the user's primary org)
**Trigger:** scanner finds a user with `now - lastLoginAt ≥ thresholdDays` and **no terminal `user_inactivity_dispatches` row** for the current `periodKey`
**Delivery Semantics:** at-most-`INACTIVITY_MAX_ATTEMPTS` per `(userId, periodKey)`. The dispatch state machine in `user_inactivity_dispatches` (plan §5.2) makes this guarantee observable via `attemptCount` and the row's `intent → sent` / `intent → failed` transitions. **Note:** because SMTP send is not transactional with the Mongo write that records "send happened," a process crash in the narrow window between SMTP send and `status=sent` write can produce a duplicate email. This is documented and accepted — see plan §5.2 "Accepted risk."

#### Recipient Grouping (locked)

| Recipient | Source | Resolution rule |
|---|---|---|
| **To** | `users.email` (cached from Keycloak JWT on last login) | single address; if blank or invalid, the user is skipped and the audit row records `userEmailMissing=true` |
| **Cc — platform admins** | Permify: subject `user:*`, relation `administrator`, object `platform:root` | dedupe by lowercased email, sort ascending, cap at 10 (deterministic across pods) |
| **Cc — org admins** | Permify: subject `user:*`, relation `admin`, object `org:{primaryOrgId}` | same dedupe + sort + cap |

#### Primary org resolution (locked)

`primaryOrgId` is read from the `users` collection. It is written on each successful login from the active tenant binding in the Keycloak JWT. If `primaryOrgId` is empty when the scan reaches the user, the scanner re-resolves it via `authzsvc.ResolvePrimaryOrg(ctx, userId)`:

1. Read the user's org memberships from Permify (subject `user:{userId}` × relation `member` × object `org:*`).
2. Pick the membership with the **earliest** `joinedAt` (deterministic across pods; ties broken by `orgId` ascending).
3. Persist the result back to `users.primaryOrgId` so the next scan can skip the lookup.
4. If the user has zero memberships, the audit row records `noOrgFound=true` and **only platform admins** are Cc'd.

If the resolved `primaryOrgId` exists but yields zero org admins (membership but no admin role), the audit row records `noOrgAdminFound=true` and only platform admins are Cc'd.

#### Hard caps and overflow behavior

- The recipient cap (10 per group) is a safety valve, not a feature. If exceeded, the audit row records `platformAdminTruncated=true` and/or `orgAdminTruncated=true` so ops can spot orgs that need a different governance pattern. The cap is configurable via env (`INACTIVITY_RECIPIENT_CAP`, default 10).

#### Subject

`[Klynx] Account inactive for over a year — <user.email>`

#### Body Template Variables

```
{
  "userEmail":          "<inactive user's email>",
  "userDisplayName":    "<best-effort display name from JWT claims>",
  "lastLoginAt":        "<RFC3339 UTC>",
  "thresholdDays":      365,
  "policyStartUtc":     "2026-05-01T00:00:00Z",
  "orgName":            "<primary org name>",
  "platformAdminCount": <int>,
  "orgAdminCount":      <int>
}
```

The template renders bilingual (TH + EN) plaintext + HTML and is shipped in the repo at `internal/gateways/emailgw/templates/inactivityNotice.{txt,html}`.

#### Idempotency

- Idempotency anchor: `user_inactivity_dispatches._id = "<userId>:<periodKey>"`.
- Canonical `periodKey` definition (locked, single source of truth): `floor(now.Unix() / (cooldownDays * 86400))` with `cooldownDays = INACTIVITY_NOTIFY_COOLDOWN_DAYS` (default 30). A user is notified at most `INACTIVITY_MAX_ATTEMPTS` (default 3) times per `periodKey`. Earlier draft wording referred to "calendar month" — that wording is obsolete and must not be re-introduced.
- Duplicate handling: the dispatch state machine (plan §5.2) gates re-attempts on the row's `status` and `claimedUntil`. A row in `sent` is terminal until `periodKey` rolls over.

#### Replay / Recovery

- A failed dispatch leaves the row in `intent` state with `claimedUntil` released early; the next scan cycle (≤ 24h later by default) re-claims and retries, incrementing `attemptCount`.
- After `INACTIVITY_MAX_ATTEMPTS` cycles the row transitions to `failed` (terminal until next `periodKey`); `failed` rows are surfaced in the summary endpoint for ops.

---

## 7. Canonical and Projection Mapping

### Canonical Store

- System: `klynx-api`
- Stores:
  - `users` (Mongo collection) — fields `lastLoginAt`, `primaryOrgId`, `lastInactivityNotifiedAt`
  - `user_inactivity_dispatches` (Mongo collection) — the dispatch state machine described in plan §5.2 (`_id = "<userId>:<periodKey>"`, `status ∈ {intent, sent, failed}`, `attemptCount`, `claimedUntil`, `holderPodId`, `recipients`, `intentAt`, `sentAt`, `lastError`)
  - `inactivity_scan_leases` (Mongo collection) — fleet-wide scan mutex

### Projection Store

- The dispatch collection serves dual duty: it is the idempotency anchor (not a separate projection) **and** the source for the summary endpoint's `recentNotifications[]`. There is no separate audit-only projection.

### Field Mapping

| Canonical Field | Consumer Field | Notes |
|---|---|---|
| `users.lastLoginAt` | `recentNotifications[].lastLoginAt` | direct |
| `users.lastInactivityNotifiedAt` | (internal fast-filter for candidate selection) | not exposed in `recentNotifications` — the dispatch row is the authoritative anchor |
| `user_inactivity_dispatches.intentAt` | `recentNotifications[].intentAt` | direct |
| `user_inactivity_dispatches.sentAt` | `recentNotifications[].sentAt` | direct (null while `intent`/`failed`) |
| `user_inactivity_dispatches.attemptCount` | `recentNotifications[].attemptCount` | direct |
| `user_inactivity_dispatches.status` | `recentNotifications[].status` | direct |
| `user_inactivity_dispatches.lastError` | `recentNotifications[].lastError` | direct |
| `user_inactivity_dispatches.recipients` | `recentNotifications[].recipients` | direct |

---

## 8. Field Ownership

| Field | Authoritative Writer | Allowed Initiator | Stored In | Notes |
|---|---|---|---|---|
| `users.lastLoginAt` | `authsvc.AuthenticateOAuthCode` | login flow only | `users` | overwrite each successful login |
| `users.lastInactivityNotifiedAt` | `inactivitysvc` (set when dispatch row transitions `intent → sent`) | scanner only | `users` | informational long-window cooldown — the dispatch row is the authoritative idempotency anchor |
| `users.primaryOrgId` | `authsvc.AuthenticateOAuthCode` (writes from active tenant binding on each login); `authzsvc.ResolvePrimaryOrg` reconcile fallback at scan time | login flow + scanner reconcile | `users` | deterministic earliest-`joinedAt` rule when re-resolving; never written by FE |
| `inactivity_scan_leases.{holder,expiresAt}` | `inactivitysvc.leaseRepo` | scanner ticker / `runNow` only | `inactivity_scan_leases` | CAS on expired lease; one writer at a time across the fleet |
| `user_inactivity_dispatches._id = "<userId>:<periodKey>"` and all per-row fields (`status`, `attemptCount`, `claimedUntil`, `holderPodId`, `recipients`, `intentAt`, `sentAt`, `lastError`) | `inactivitysvc` | scanner only | `user_inactivity_dispatches` | natural-key uniqueness via `_id`; CAS upsert is the **claim, the durable intent record, and the idempotency anchor** in one row. State machine `intent → sent` (or `intent → failed` after `INACTIVITY_MAX_ATTEMPTS`). |
| `users.email`, `users.displayName` | Keycloak | sync from JWT on login | `users` | klynx caches; Keycloak is authoritative |

### Conflict Resolution

- Single writer per field — no conflict possible at the field level.
- **Cross-pod scanning races** are resolved by:
  1. Fleet lease CAS on `inactivity_scan_leases` (only one pod scans at a time per `INACTIVITY_LEASE_TTL_MINUTES` window).
  2. Per-`(userId, periodKey)` CAS via the atomic upsert on `user_inactivity_dispatches._id` (only one pod can claim a given user within the claim TTL — the row is the claim, the intent record, and the idempotency anchor).
- **Accepted duplicate risk (locked):** a crash between SMTP send and the `status=sent` write can produce a duplicate email; bounded to **at most `INACTIVITY_MAX_ATTEMPTS - 1` duplicates per `(userId, periodKey)`** (default 2). The `attemptCount` field on the dispatch row makes every such event observable. See plan §5.2 "Accepted risk."
- Email caching: if Keycloak email changes, klynx record updates on the next login. Acceptable lag for an annual notification.
- No echo-loop concern (no bidirectional sync).

---

## 9. Frontend Integration Notes

### Required FE Inputs

| FE Use Case | Contract Surface | Required Fields | Notes |
|---|---|---|---|
| Admin settings → "User Inactivity" panel | `GET /admin/system/userInactivity/summary` | `policyStart`, `thresholdDays`, `cooldownDays`, `scannerEnabled`, `lastScanAt`, `lastScanResult.*` | render readonly summary |
| Admin settings → "Run scan" button | `POST /admin/system/userInactivity/runNow` | request: `{dryRun}`; response: counts | show toast with counts |

### Example FE Payload Mapping

| FE Field | Backend Field | Direction | Notes |
|---|---|---|---|
| "Last scan" timestamp | `details.lastScanAt` | response | format in user tz; show "—" when null |
| "Notified" count | `details.lastScanResult.notified` | response | number badge |
| "Run dry" toggle | `dryRun` | request | sent in body |

### FE Guardrails

- Do not poll faster than 30s — the underlying scanner runs daily.
- A `runNow` response with `details.skippedReason="scan-already-running"` is a normal `200` envelope, not an error. Render the response as "scan already in progress" and continue showing the prior `lastScanResult` numbers — do not show an error toast or retry banner.
- A `recentNotifications[]` row with `attemptCount > 1` indicates a previous attempt crashed mid-dispatch (the locked accepted-risk case in plan §5.2). FE may render a small warning indicator next to those rows so ops can spot duplicate-email events.
- Do not display recipient email lists from `recentNotifications[]` to non-admin users (the endpoint is admin-only by auth, but UI should not echo emails into shared screenshots — recommend masking after `@`).

---

## 10. Rollout Notes

| Repo | Dependency | Required Before | Notes |
|---|---|---|---|
| `klynx-api` | new fields, gateway, scanner, endpoints | shipped first | scanner gated to platform/saas profiles |
| `klynx-feature` | endpoints reachable on develop | after backend rollout | small admin panel only |

Operational notes:

- Required env when email dispatch is desired: `EMAIL_SMTP_HOST`, `EMAIL_SMTP_PORT`, `EMAIL_SMTP_USERNAME`, `EMAIL_SMTP_PASSWORD`, `EMAIL_FROM`.
- Optional env: `INACTIVITY_THRESHOLD_DAYS=365`, `INACTIVITY_POLICY_START=2026-05-01`, `INACTIVITY_SCAN_INTERVAL_HOURS=24`, `INACTIVITY_NOTIFY_COOLDOWN_DAYS=30`, `INACTIVITY_SCANNER_ENABLED=true`, `INACTIVITY_RECIPIENT_CAP=10`, `INACTIVITY_CLAIM_TTL_MINUTES=5`, `INACTIVITY_LEASE_TTL_MINUTES=15`, `INACTIVITY_MAX_ATTEMPTS=3`.
- **Missing SMTP creds (locked across plan and contract):** if `EMAIL_SMTP_HOST` is empty, the scanner stays wired and continues to tick on schedule, but it operates in **dry-run-only** mode — it computes candidates and recipients, exposes them via the summary endpoint, and writes **no** dispatch rows or `lastInactivityNotifiedAt`. Startup logs `emailgw.smtp.disabled=true`. The summary response sets `scannerEnabled=true, emailEnabled=false`. This is the exact same behavior as `dryRun=true` on `runNow`. `INACTIVITY_SCANNER_ENABLED=false` overrides this and stops the ticker entirely.
- **Multi-pod deployments:** the fleet lease (`inactivity_scan_leases`) makes the scanner safe to run with N replicas — the first pod to acquire the lease runs that cycle, others receive a `200` response with `skippedReason=scan-already-running`. The per-`(userId, periodKey)` CAS upsert on `user_inactivity_dispatches` is a second safety net: a row in `intent` (claim held) or `sent` (terminal) blocks any other pod from re-attempting that user in the same `periodKey`.

---

## 11. Examples

### Example dry-run request

```
POST /admin/system/userInactivity/runNow
Authorization: Bearer …

{ "dryRun": true }
```

### Example success response

```json
{
  "code": "SUCCESS",
  "details": {
    "dryRun": true,
    "candidates": 5,
    "notified": 0,
    "skippedCooldown": 0,
    "errors": 0,
    "durationMs": 87,
    "previewUserIds": ["kc-1", "kc-2", "kc-3", "kc-4", "kc-5"]
  }
}
```

### Example email subject

```
[Klynx] Account inactive for over a year — alice@acme.example
```

---

## 12. Checklist

- [x] Owner backend explicit (`klynx-api`).
- [x] System of record defined per domain.
- [x] Canonical store and projection store documented.
- [x] Producers and consumers listed.
- [x] Request, response, and error contracts defined.
- [x] Field ownership explicit for synchronized fields (`email` cached from Keycloak; klynx-owned policy fields).
- [x] Backward compatibility documented (additive).
- [x] Replay / re-sync behavior documented (cooldown + dry-run).
- [x] FE field mapping included.
