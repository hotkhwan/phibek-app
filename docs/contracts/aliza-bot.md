# Aliza Bot Integration Contract

**Date:** 2026-05-04
**Status:** Active (consolidated — supersedes `aliza-bot-claude-backend.md` + `aliza-bot-bug-reports.md`). Version markers from source contracts preserved: §6 (Telegram protocol) and §7 (subprocess) at v1 + v1.1 shipped + v2 draft for §12.2; §5 (REST) targets 4.15.0 A2.1 BE foundation.
**Owner Backend:** `klynx-api` (REST + tool source under `tools/aliza-bot/`); aliza-daemon as the bridge consumer
**Related Plan:** [docs/plan/done/aliza-bot-claude-backend.md](../plan/done/aliza-bot-claude-backend.md), [docs/plan/done/aliza-bot-memory.md](../plan/done/aliza-bot-memory.md), [docs/plan/done/aliza-bot-channel-approval.md](../plan/done/aliza-bot-channel-approval.md), [docs/plan/done/aliza-bot-v2.1-bug-reports-mongo-foundation.md](../plan/done/aliza-bot-v2.1-bug-reports-mongo-foundation.md), [docs/plan/done/aliza-A2.3-admin-triage.md](../plan/done/aliza-A2.3-admin-triage.md), [docs/plan/aliza-A2.4-standalone-persistence.md](../plan/aliza-A2.4-standalone-persistence.md)
**Applies To Repos:** `klynx-api` (tool source + REST owner); `gateway-api`, `klynx-feature`, `gateway-portal` (passive dispatch targets — no code change)
**Contract Type:** `REST + Subprocess + Telegram Protocol`
**Version:** `v1.1 shipped (Telegram/CLI) + v2 draft (multi-channel + admin) + REST API foundation (4.15.0)`
**Supersedes:** `aliza-bot-claude-backend.md` (rev 3 — Telegram protocol + Claude CLI subprocess, v1+v1.1 shipped 2026-05-02, v2 draft), `aliza-bot-bug-reports.md` (rev 2 — REST persistent storage for the bug queue, targeting 4.15.0 A2.1 BE foundation)

---

## 0. Domain / Flow Boundary

| Field | Value |
|---|---|
| Domain name | `aliza-bot` |
| Flow name | Telegram bot → admin/reporter intake → bug queue (REST) → AI CLI dispatch → done |
| Lifecycle scope | inbound message → role/grammar parse → (admin: pre-spawn guards → configured AI subprocess → final summary) OR (reporter: bug record persisted via REST → admin /approve → configured AI dispatch → status notifications) |

### Included Surfaces

| Surface Type | Name | Purpose |
|---|---|---|
| REST | `POST /admin/aliza/bug-reports` | submit bug record (m2m service-account auth) |
| REST | `GET /admin/aliza/bug-reports` | list / filter bug records (incl. `displayId` resolver) |
| REST | `GET /admin/aliza/bug-reports/{bugId}` | detail by UUID |
| REST | `PATCH /admin/aliza/bug-reports/{bugId}` | state-machine transitions (CAS on status) |
| Telegram protocol | inbound `@<repo> <prompt>` / `/cmd` / free-form / reporter intake | aliza-daemon consumer; grammar locked in §7.1 |
| Subprocess | `claude -p <prompt> --output-format stream-json --verbose ...` | daemon → claude CLI (Anthropic Claude Agent SDK headless mode) |

### Excluded Surfaces

| Surface | Why excluded | Authoritative Contract |
|---|---|---|
| `/orgs/integrations` (operator token issuance) | separate org-admin surface; daemon merely consumes the issued token | (separate admin contract / docs in code) |
| `gw.events.normalized.v1` | unrelated upstream Kafka — not consumed by daemon | (gateway-api SoR) |
| Future analytics FE for bug reports | not built yet (A2 ships no FE consumer) | TBD |

### Related Contracts

| Contract | Relationship |
|---|---|
| Future `tools/aliza-bot/`-emitted MCP tools | child — daemon hosts `sendmessage`/`waitforreply` MCP server; not part of this contract surface |
| `dashboard-timeseries.md` | unrelated sibling |

### Grouping Rationale

The two source contracts are explicitly cross-referenced:
- `aliza-bot-bug-reports.md` opens with "Companion contract: aliza-bot-claude-backend.md §12.2 owns the Telegram-side state machine, notification matrix, and reporter intake grammar; this contract owns the persistent storage + REST surface those flows now talk to."
- `aliza-bot-claude-backend.md §12.2 v2 plan` invented the JSON-file bug queue that bug-reports.md REST then replaces in v2.1.

The state machine spans both: a Telegram `/approve <id> @<repo>` triggers two REST PATCHes (`pending → approved` → spawn → `approved → dispatched`), and `dispatch.end` triggers a third (`dispatched → done` or failure-revert). Per `docs/contracts/README.md` grouping rule, these are one flow → one contract.

---

## 1. Purpose

Locks the Aliza-bot integration end-to-end:

- **Telegram message grammar + role/mode resolution** for `@alizaLite_bot` (private chats only in v2; v1 backward-compat single chat_id).
- **Pre-spawn guard chain** that all admin-initiated dispatches must pass.
- **Claude CLI subprocess invocation contract** (argv, env, permission modes, denylist, exit codes, streaming).
- **REST persistent storage for bug records** (replaces the JSON-file bug queue from v2's original design, ships at klynx-api 4.15.0 as the A2.1 BE foundation).
- **State machine that spans Telegram + REST + subprocess** so reporter bugs flow through admin approval into a tracked dispatch.

This is a **tool + storage contract**. The "frontend" is the Telegram client; there is no klynx-feature consumer in A2. When klynx-feature builds a future analytics page, it consumes the same REST surface. Future phases (media-group, smoke-result, root-cause classifier, multi-admin work-queue) revise this contract additively.

---

## 2. Ownership

### Owner Backend

- `klynx-api` — REST endpoints (`/admin/aliza/bug-reports`), Mongo `bug_reports` + `bug_report_counters` collections, all middleware, daemon source under `tools/aliza-bot/`.

### Domain System of Record

| Domain | System of Record | Canonical Store | Notes |
|---|---|---|---|
| Bug record | active Aliza persistence adapter | `bug_reports` (MongoDB) | REST mode scopes via integration token; Mongo mode scopes via `ALIZA_TENANT_ID` + `ALIZA_ORG_ID` |
| `displayId` allocator (per org monotonic) | active Aliza persistence adapter | `bug_report_counters` (MongoDB) | atomic `findAndModify` / `find_one_and_update` |
| Integration token | `klynx-api` | `integration_tokens` (MongoDB) | `(tenantId, clientId)` identity binding; same as third-party-integration |
| Daemon dispatch state (single-flight, runtime budget, per-chat session) | aliza-daemon RAM | — | not persisted; daemon restart = forget |
| Telegram chat allowlist + roles | `.env.telegram` (gitignored, perms 600) | env vars | `TELEGRAM_CHAT_ID` + `ALIZA_CHAT_ROLES` (v2) / `ALIZA_CHAT_MODES` |

### Producer / Consumers

| Surface | Producer | Consumers | Notes |
|---|---|---|---|
| Telegram inbound message | end user | `daemon.handle_message` | only allowlisted chats; role-based routing |
| Aliza bug-store adapter | aliza-daemon | REST adapter or Mongo adapter | reporter/admin bug persistence; selected by `ALIZA_PERSISTENCE_MODE` |
| `POST /admin/aliza/bug-reports` | aliza-daemon REST adapter | klynx-api | compatibility/default reporter free-form intake |
| `GET /admin/aliza/bug-reports?status=pending` | aliza-daemon REST adapter | klynx-api | compatibility/default admin `/bugs` rendering |
| `GET /admin/aliza/bug-reports?displayId=N` | aliza-daemon REST adapter | klynx-api | compatibility/default `displayId` → `bugId` resolver |
| `PATCH /admin/aliza/bug-reports/{bugId}` | aliza-daemon REST adapter | klynx-api | compatibility/default state-machine transitions, CAS on status |
| `claude -p ... --permission-mode ...` subprocess | daemon `run_claude` | claude CLI | `cwd` = absolute repo path resolved from `ALIZA_REPOS`; stdin closed |
| stream-json stdout | claude CLI | daemon stream reader | throttled, forwarded to Telegram |
| Final summary | daemon | Telegram | format defined in §10.4 |
| Reporter notifications (v2) | daemon | Telegram (private DM) | best-effort; per-state notification matrix in §9.4 |

### Authority

- Daemon is the **sole writer** of `claude` invocations on the host. No other process should spawn `claude` against repos listed in `ALIZA_REPOS` while the daemon is running (R5 mitigation).
- Exactly one Aliza persistence mode is active per daemon process. `rest` mode keeps klynx-api as the bug-report writer; `mongo` mode makes aliza-daemon the writer of the same canonical Mongo collections. Both modes must preserve the same state-machine and idempotency contract.
- This contract authoritatively defines the dispatch grammar and bug-record schema. Any change must update this file and bump the relevant version marker.

---

## 3. Compatibility and Policy

### Backward Compatibility

- **Pre-A2.1 deployment:** REST endpoints don't exist. Daemon stays on JSON queue. No-op for klynx-api.
- **A2.1 deployed but A2.2 not yet:** REST endpoints live; daemon doesn't call them. No data flows yet. Cluster validates endpoints with curl/postman before A2.2 ships.
- **A2.2 deployed:** daemon writes to REST. Backfill script run once → JSON archived. After this point: old `bug-queue.json` is in `.bak`, not loaded; daemon `cmd_bugs` reads from REST; all v2 user-facing UX is identical.
- **A2.4 deployed:** daemon defaults to `ALIZA_PERSISTENCE_MODE=rest` for backward compatibility. Operators may switch to `ALIZA_PERSISTENCE_MODE=mongo` to let the daemon write `bug_reports` / `bug_report_counters` directly; this requires `ALIZA_MONGO_URI`, `ALIZA_MONGO_DATABASE`, `ALIZA_TENANT_ID`, and `ALIZA_ORG_ID`.
- **v1 → v2 mode toggle:** when `ALIZA_CHAT_ROLES` is unset (and `TELEGRAM_CHAT_ID` is set per v1), daemon behaves identically to v1 — that single chat_id has `admin` role, no reporters exist, bug-queue file is created lazily on first non-admin message (which can never happen). Setting `ALIZA_CHAT_ROLES={}` (explicit empty object) means "v2 enabled with zero roles" — every inbound message is denied.
- **Grammar changes** to §7.1 require a major bump (v2). Adding new optional env vars or new error reply text is backward-compatible (minor).

### Replay / Re-sync Behavior

- **REST:** GET-only paths are idempotent. `POST` with `idempotencyKey` returns the existing record (`200 OK` instead of `201 Created`) on duplicate. `PATCH` with body identical to current doc state returns 200 with current doc.
- **Daemon dispatch:** not replay-safe at the subprocess layer (claude makes commits/edits). The pre-spawn guards (especially dirty-tree and single-flight) prevent accidental re-runs.
- **Re-sync trigger:** A2.2 backfill script reads `~/.config/aliza-bot/bug-queue.json` and POSTs each entry; idempotency key dedupes re-submits. Re-runnable.
- **Rollback (A2.2 → pre-A2.2):** stop daemon → `mv bug-queue.json.bak.YYYYMMDD bug-queue.json` → revert daemon PR → start daemon. **Lossy:** bugs filed during the A2.2 deployment window (after backfill, before rollback) sit in Mongo; daemon won't see them.

### Write Authority Policy

- In REST mode, `bug_reports.{tenantId, orgId}` are derived from the m2m token's integration record at the middleware layer, set once at POST, immutable thereafter.
- In Mongo mode, `bug_reports.{tenantId, orgId}` are derived from explicit daemon config (`ALIZA_TENANT_ID`, `ALIZA_ORG_ID`), set once at submit, immutable thereafter. The daemon must fail startup if either value is missing.
- All reads/writes scope by `(tenantId, orgId)` in the active adapter.
- Reporter cannot edit submitted bug text; bug record is immutable except for fields the state machine writes.

### Revision History (preserved verbatim from source contracts)

**Telegram + Subprocess (`aliza-bot-claude-backend.md`):**
- **v1** = §1–§9, shipped 2026-05-02 (Phases 0/1a/1b/1.5/2/3/4 — see [done/aliza-bot-claude-backend.md](../plan/done/aliza-bot-claude-backend.md)).
- **v1.1** = shipped 2026-05-02 — conversational memory (`--resume <id>`, `_chat_sessions` map, `/forget` cmd, session-not-found auto-recovery). Plan: [done/aliza-bot-memory.md](../plan/done/aliza-bot-memory.md). Probe: [tools/aliza-bot/preflight/v1.1-resume-run.log](../../tools/aliza-bot/preflight/v1.1-resume-run.log).
- **v1.1 implementation correction (rev 1 of impl PR):** the original sketch paired the `--resume` branch with `--no-session-persistence` as the else branch. Codex review found this would prevent any `--resume` from ever working (a fresh session under `--no-session-persistence` writes nothing to `~/.claude/projects/`, so the captured `session_id` is unresumable on turn 2). The shipped argv (see §7.2) **omits both** flags on a fresh dispatch and lets claude default-persist; only `--resume <id>` is added when a mapping exists.
- **v2 (planned, draft)** — multi-channel + admin approval: `ALIZA_CHAT_ROLES`, bug queue, `/bugs` `/approve` `/reject` cmds, reporter free-form intake. Plan: [done/aliza-bot-channel-approval.md](../plan/done/aliza-bot-channel-approval.md). The JSON-file bug queue originally specified in v2 was replaced by the REST API in this contract's §5 (A2.1 BE foundation, klynx-api 4.15.0).

**REST persistent storage (`aliza-bot-bug-reports.md`):**
- **rev 1:** original draft, single PATCH transition, file-based daemon migration.
- **rev 2 (Codex rev 1 blockers addressed):** `AuthServiceAccount` + `/orgs/integrations` auth alignment, PATCH state-machine canonical flow (TWO PATCHes for `/approve`: pending→approved then approved→dispatched), `displayId → bugId` resolution via `?displayId=N` filter, DELETE removed entirely (terminal states only via state machine).
- **klynx-api 4.18.0 fix:** `approved → approved` self-transition added to allow the daemon's `/approve <id> @<repo> [note]` retry path to update admin metadata + clear the prior `dispatchExit` before kicking off a new dispatch (Codex PR #154 rev 1 blocker fix). Without it, the retry PATCH would 409 INVALID_TRANSITION.

---

## 4. Surface Summary

| Type | Name | Method / Topic / Key | Auth / Trust | Producer / Handler | Consumer / Caller |
|---|---|---|---|---|---|
| REST | `/admin/aliza/bug-reports` | `POST` | Bearer SA JWT + scope `aliza:bug-reports` | klynx-api `bugreportapi.Submit` | aliza-daemon `_enqueue_bug` |
| REST | `/admin/aliza/bug-reports` | `GET` | Bearer SA JWT + scope `aliza:bug-reports` | klynx-api `bugreportapi.List` | aliza-daemon `cmd_bugs`, `/approve` resolver |
| REST | `/admin/aliza/bug-reports/{bugId}` | `GET` | Bearer SA JWT + scope `aliza:bug-reports` | klynx-api `bugreportapi.Detail` | future analytics page |
| REST | `/admin/aliza/bug-reports/{bugId}` | `PATCH` | Bearer SA JWT + scope `aliza:bug-reports` + state-machine CAS | klynx-api `bugreportapi.Update` | aliza-daemon (TWO PATCHes per `/approve`, single PATCH per `/reject`/`dispatch.end`/failure-revert) |
| Telegram protocol | inbound message | `@<repo> <prompt>` / `/cmd` / free-form | `chat_id ∈ TELEGRAM_CHAT_ID` (v1) / `ALIZA_CHAT_ROLES` (v2) + `chat.type == "private"` (v2 only) | end user | `daemon.handle_message` |
| Subprocess | `claude -p ...` | local fork+exec | `cwd` ∈ `ALIZA_REPOS`; mode-gated env; stdin closed | `daemon.run_claude` | claude CLI |

**Base URL (REST, example, staging):** `https://aliza.k-lynx.com/admin/aliza/bug-reports`
**Telegram bot:** `@alizaLite_bot`

---

## 5. REST Surfaces

All REST endpoints under `/admin/aliza/bug-reports` use **Keycloak service-account JWT** validated by `middleware.AuthServiceAccount(c.IntegrationTokenRepo, "aliza:bug-reports")` — the same middleware mounted on third-party-integration endpoints (see [`third-party-integration.md`](./third-party-integration.md)). `tenantId` + `orgId` are derived from the m2m token's integration record, never from request body / query params.

Daemon-side token use:
1. `KLYNX_API_BASE_URL`, `KLYNX_API_SA_CLIENT_ID`, `KLYNX_API_SA_CLIENT_SECRET` from `.env.telegram` (perms 600).
2. POST to Keycloak `/realms/<tenantId>/protocol/openid-connect/token` with `grant_type=client_credentials`.
3. Receive short-lived SA JWT; cache in memory until 60s before expiry.
4. Forward as `Authorization: Bearer <jwt>` on every klynx-api request.
5. On 401 `TOKEN_REVOKED` or `UNAUTHORIZED`, daemon logs + retries the KC token grant once; if that fails too, daemon replies to admin via Telegram and stops queue ops until next restart.
6. Token revocation: admin revokes via existing `DELETE /orgs/integrations/{id}` → next daemon JWT validation hits 401 `TOKEN_REVOKED`.
7. Scope failure: missing `aliza:bug-reports` scope on the integration → 403 `INSUFFICIENT_SCOPE`.

Operators mint the daemon service account through the existing org-admin integration surface. The FE scope picker reads the BE-owned list from `GET /orgs/integrations/scopes`; that response includes `aliza:bug-reports` alongside third-party read scopes. `POST /orgs/integrations` validates submitted scopes against the same BE list, so unsupported typo scopes are rejected before Keycloak client creation.

### 5.1 `POST /admin/aliza/bug-reports` — submit

**Caller:** aliza-daemon `_enqueue_bug` on reporter free-form intake.

**Request body:**

```json
{
  "reporterChatId": 8745841477,
  "reporterUsername": "Prapawadee Phawanram",
  "text": "หน้า biDash widget ไม่แสดงครับ",
  "suggestedRepo": null,
  "idempotencyKey": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "attachmentFileIds": ["AgACAgUAAxkBA..."]
}
```

- **Required:** `reporterChatId`, `reporterUsername` (cascade-resolved per §7.1 reporter-name cascade), `text`.
- **Optional:** `suggestedRepo` (the `@<token>` hint from reporter, if any); `idempotencyKey` (UUID v4 generated by the daemon per submit attempt); `attachmentFileIds` (Telegram `file_id` values captured from screenshot/document/video/voice submissions).
- **NOT in body:** `tenantId`, `orgId` — derived from token's integration record.

**Idempotency** (priority order):
1. **`idempotencyKey` (client-supplied, recommended)** — UUID v4 per submit attempt. On retry, daemon resends the SAME key; server returns the existing record. Strongest guarantee; survives second-boundary crossings.
2. **`(tenantId, orgId, reporterChatId, submittedAt rounded to 1 sec, sha256(text))` (server-derived fallback)** — used when `idempotencyKey` is omitted. Subject to second-boundary edge case.

Duplicate POST returns `200 OK` (not `201 Created`) with the existing record so the daemon distinguishes "first write" from "deduped retry."

**Success (`201 Created`):** full document (see §5 Mongo shape) including server-assigned `bugId` (UUID) + `displayId` (per-tenant monotonic int, used by `/bugs` rendering as `#3`; never resets, survives backfill — continues from `max existing displayId + 1`).

**Errors:**

| HTTP | Code | Cause |
|---|---|---|
| 400 | `BAD_REQUEST` | malformed body, missing required fields, text exceeds limit (16KB) |
| 401 | `UNAUTHORIZED` | missing or invalid m2m token |
| 401 | `TOKEN_REVOKED` | integration `status=revoked` |
| 401 | `UNKNOWN_INTEGRATION` | JWT valid but no record matches `(tenantId, clientId)` |
| 403 | `INSUFFICIENT_SCOPE` | integration lacks `aliza:bug-reports` |
| 500 | `INTERNAL` | Mongo write failure |

### 5.2 `GET /admin/aliza/bug-reports` — list

**Caller:** aliza-daemon `cmd_bugs` (`status=pending`); `/approve` resolver (`displayId=N`); future analytics page.

**Query parameters:**

| Param | Type | Required | Notes |
|---|---|---|---|
| `status` | string (`pending\|approved\|dispatched\|done\|rejected\|all`) | no, default `all` | filter by state |
| `reporterChatId` | int64 | no | filter by reporter |
| `dispatchRepo` | string | no | filter by repo (e.g. `kapi`) |
| `displayId` | int | no | **filter by `displayId`. Daemon's canonical resolution path: `/approve N` → `GET ?displayId=N` → response `items[0].bugId` for the PATCH.** Always returns 0 or 1 item per `(tenantId, orgId)` |
| `submittedAfter` | RFC3339 | no | submission window start |
| `submittedBefore` | RFC3339 | no | submission window end |
| `page` | int | no, default 1 | pagination |
| `perPage` | int | no, default 20, max 100 | pagination (clamped) |
| `sortField` | string | no, default `submittedAt` | `submittedAt` \| `displayId` |
| `sortOrder` | string (`asc\|desc`) | no, default `desc` | sort direction |

`tenantId` + `orgId` are NOT query parameters — derived from token.

**Success (`200`):** standard `httputil.OkPaginated` envelope with `details.items[]` + `pagination.{page,perPage,totalRecords,totalPages,sortField,sortOrder}`.

**Errors:** 400 `BAD_REQUEST` (invalid query e.g. `perPage=200`, `status=foo`); 401 family per §5.1; 500 `INTERNAL`.

### 5.3 `GET /admin/aliza/bug-reports/{bugId}` — detail

**Caller:** future analytics page; daemon does not call this in A2.

**Path parameter:** `bugId` (UUID, server-assigned).

**Success (`200`):** full document.

**Errors:** 401 family per §5.1; 404 `NOT_FOUND` (unknown `bugId`); 500 `INTERNAL`.

### 5.4 `PATCH /admin/aliza/bug-reports/{bugId}` — state transitions

**Caller:** aliza-daemon on `/approve` (TWO PATCHes), `/reject` (one), `dispatch.end` (one), failure-revert (one).

**Allowed `from → to` transitions** (server-validated CAS on `status` per Decision D5):

| From → To | Allowed mutable fields | Trigger |
|---|---|---|
| `pending → approved` | `status`, `dispatchRepo`, `adminDecisionBy`, `adminDecisionAt`, `adminNote` | admin `/approve N @repo` PATCH 1 |
| `approved → dispatched` | `status`, `dispatchStartedAt` | daemon spawn succeeded; PATCH 2 of `/approve` |
| `dispatched → done` | `status`, `dispatchExit`, `dispatchEndedAt` | claude exits 0 |
| `dispatched → approved` (failure revert) | `status`, `dispatchExit`, `dispatchEndedAt` | claude exits non-zero |
| `approved → approved` (failure-revert retry, klynx-api 4.18.0) | `status`, `dispatchRepo`, `adminDecisionBy`, `adminDecisionAt`, `adminNote`, `dispatchExit` (typically `null` to clear) | admin `/approve` retry after failure |
| `* → rejected` | `status`, `adminDecisionBy`, `adminDecisionAt`, `adminNote` | admin `/reject` (any non-terminal status) |

**State machine:**

```
pending → approved (via /approve admin cmd)
       → rejected (via /reject admin cmd)
approved → dispatched (when daemon spawn succeeds)
        → rejected (admin late-rejects before dispatch)
dispatched → done (claude exits 0)
          → approved (failure revert: claude exits non-zero)
done → (terminal)
rejected → (terminal)
```

**`approved → approved` self-transition rationale (klynx-api 4.18.0):** when a dispatched run fails and reverts to `approved` with non-zero `dispatchExit`, the daemon's retry path needs to update admin metadata + clear the prior exit code before kicking off a new dispatch. Without this self-transition, the retry PATCH would 409 INVALID_TRANSITION and the daemon would silently fail (Codex PR #154 rev 1 blocker fix).

**Idempotency:** PATCH with body identical to current doc state returns 200 with current doc.

**Errors:**

| HTTP | Code | Message |
|---|---|---|
| 400 | `BAD_REQUEST` | `"invalid body"` |
| 400 | `INVALID_FIELD_FOR_STATUS` | `"field <X> not allowed for transition <from→to>"` |
| 401 | `UNAUTHORIZED` / `TOKEN_REVOKED` / `UNKNOWN_INTEGRATION` | per §5.1 |
| 403 | `INSUFFICIENT_SCOPE` | per §5.1 |
| 404 | `NOT_FOUND` | `"bug not found: <bugId>"` |
| 409 | `INVALID_TRANSITION` | `"cannot transition from <from> to <to>"` |
| 409 | `STALE_STATE` | `"current status is <X>, request expected <Y>"` (CAS failed — concurrent update) |
| 500 | `INTERNAL` | `"mongo update failed: ..."` |

### 5.5 Mongo Document Shape

Collection: `bug_reports`.

```jsonc
{
  "_id":              ObjectId,
  "bugId":            "f47ac10b-58cc-4372-a567-0e02b2c3d479",  // UUID, server-assigned
  "displayId":        3,                                         // per-org monotonic int
  "schemaVersion":    1,

  // Reporter identity snapshot (immutable after submit; D3 — embed not FK)
  "reporterChatId":     8745841477,
  "reporterUsername":   "Prapawadee Phawanram",                  // cascade-resolved at intake

  // Bug content
  "text":             "หน้า biDash widget ไม่แสดงครับ",
  "suggestedRepo":    null,

  // State machine
  "status":           "pending",                                 // pending|approved|dispatched|done|rejected
  "submittedAt":      ISODate("2026-05-03T05:03:25.947Z"),
  "updatedAt":        ISODate("2026-05-03T05:03:25.947Z"),

  // Admin decision metadata
  "adminDecisionBy":  null,                                      // admin chat_id (string)
  "adminDecisionAt":  null,
  "adminNote":        null,

  // Dispatch metadata
  "dispatchRepo":      null,                                     // "kapi", "kapp", etc.
  "dispatchStartedAt": null,
  "dispatchEndedAt":   null,
  "dispatchExit":      null,                                     // 0 | non-zero | null (in-flight)

  // Idempotency key (server-side dedup; not editable)
  "idempotencyKey":   "8745841477:1746246205:5d41402abc4b2a76b9719d911017c592",

  // ============================================================
  // Reserved for v2.1 later phases (D4 — populated null in A2):
  // ============================================================
  "attachmentFileIds": [],                                       // media-group phase
  "smokeResult": null,                                           // Playwright pre-smoke phase
                                                                 // {status:"pass"|"fail"|"skipped", completedAt, stepFailed, tracePath}
  "rootCause": null,                                             // root-cause classifier phase
                                                                 // {hypothesis, source:"rule"|"llm"|"manual", confidence:0..1, details}
  "claimedBy":   null,                                           // multi-admin work-queue phase
  "claimedAt":   null,

  // Tenancy / authority binding (set at POST, immutable)
  "tenantId":    "klynx",
  "orgId":       "c84f9958-1ba6-467d-8129-2a7453ebba6e"
}
```

**Indexes** (all `(tenantId, orgId, ...)`-prefixed to keep queries scope-bound):

| Index | Fields | Purpose |
|---|---|---|
| `idx_bug_reports_bugId_unique` | `{bugId: 1}` unique | API path lookups |
| `idx_bug_reports_displayId_per_org_unique` | `{tenantId: 1, orgId: 1, displayId: 1}` unique | per-org monotonic `displayId` |
| `idx_bug_reports_status_submitted` | `{tenantId: 1, orgId: 1, status: 1, submittedAt: -1}` | primary list query |
| `idx_bug_reports_reporter_submitted` | `{tenantId: 1, orgId: 1, reporterChatId: 1, submittedAt: -1}` | reporter history (analytics) |
| `idx_bug_reports_idempotency_unique` | `{tenantId: 1, orgId: 1, idempotencyKey: 1}` unique | dedup at submit |
| `idx_bug_reports_dispatch_repo` | `{tenantId: 1, orgId: 1, dispatchRepo: 1, status: 1, submittedAt: -1}` | "show me dispatched bugs for repo X" |

A separate small `bug_report_counters` collection holds `(tenantId, orgId) → maxDisplayId` for atomic `findAndModify`-based displayId allocation. Seeded lazily on first POST per scope.

---

## 6. Kafka / Async Event Surfaces

`N/A — not in scope.` Aliza bot does not produce or consume Kafka. The `gw.events.normalized.v1` topic is unrelated.

---

## 7. Telegram Protocol + Subprocess Surfaces

This contract treats the **Telegram message protocol** and the **claude CLI subprocess invocation** as the realtime/messaging surfaces (the TEMPLATE's §7 slot). Together they form the daemon's two external interfaces.

### 7.1 Telegram Message Grammar

#### Inbound — production rules

```text
Message       := DispatchMsg | CmdMsg | FreeFormMsg
DispatchMsg   := "@" RepoToken " " Prompt
CmdMsg        := "/" CmdName ( "@" BotName )? ( " " CmdArgs )?
                | BareCmdName ( " " CmdArgs )?       (* legacy bare-cmd, see CmdMsg precedence *)
FreeFormMsg   := Prompt                              (* admin: dispatched to ALIZA_DEFAULT_REPO; reporter (v2): bug-queue intake *)
RepoToken     := <key in ALIZA_REPOS>
Prompt        := <UTF-8, ≥ 1 non-whitespace char, ≤ 4096 chars (Telegram cap)>
CmdName       := "help" | "info" | "updates" | "prs" | "develop" | "version" | "ping" | "status" | "forget"
                | "bugs" | "smoke" | "approve" | "reject"     (* v2 admin-only *)
BareCmdName   := same set as CmdName  (* matched only if exact equality with the first whitespace-delimited token *)
```

#### Precedence (top wins, determined by **first character** of message)

1. **Starts with `@`** → `DispatchMsg` parse path. Token after `@` resolved against `ALIZA_REPOS`; everything after the first space is the prompt and is forwarded to `claude` verbatim. `/`-looking tokens inside the prompt body do NOT trigger daemon `/cmd` handlers. **Reporter exception (v2):** if `_resolve_role(chat_id) == "reporter"` and `<token> ∈ ALIZA_REPOS`, daemon stores the bug record with `suggestedRepo = "<token>"` and `text = "<remainder after first space>"` (no dispatch). If `<token>` is not in `ALIZA_REPOS`, the entire message text (incl. `@<unknown>`) is stored as bug text with `suggestedRepo = null` (no reply about the unknown token).
2. **Starts with `/`** → `CmdMsg` parse path. Existing handler. Never goes to `claude`.
3. **First whitespace token equals a known cmd name** (legacy bare-word `info`, `ping`, etc.) → `CmdMsg` parse path.
4. **Anything else** → `FreeFormMsg`. Admin: dispatched to `ALIZA_DEFAULT_REPO`. Reporter (v2): bug-queue intake.

If `ALIZA_DEFAULT_REPO` is unset and rule 4 is reached for an admin → reply `no default repo configured; use @<repo> prefix. valid: <list>`.

#### Edge cases (locked)

| Input | Behavior |
|---|---|
| `@unknown-repo do thing` (admin) | reply `repo "unknown-repo" not in ALIZA_REPOS. valid: klynx-api, gateway-api, ...`; no dispatch |
| `@klynx-api` (no prompt) | reply `prompt is empty. usage: @<repo> <prompt>`; no dispatch |
| Empty message / sticker / attachment with no text/caption | ignored silently |
| Reporter photo/document/video/voice with caption | caption is the bug text; daemon stores Telegram `file_id` values in `attachmentFileIds` |
| Reporter replies to an older report and Telegram omits quoted caption | daemon falls back to its persistent reporter-context cache keyed by quoted `chat_id:message_id` |
| Admin replies to `new bug #N ...` with `reject [reason]` or `/reject [reason]` | daemon infers `N` from the quoted bot notification; equivalent to `/reject N [reason]` |
| Admin replies to `new bug #N ...` with plain non-command text | daemon replies with shortcut usage and does not dispatch the text to Claude |
| Prompt contains literal `git push` | refuse with `prompt contains forbidden token "git push"`; no dispatch |
| `@klynx-api /help` | dispatched per rule 1 (starts with `@`); `/help` becomes the prompt forwarded to `claude` (intentional — user can ask Claude for project-specific help inside the dispatched session) |

#### Reporter-name cascade (v2, post-#144)

Daemon resolves `reporterUsername` at intake time using the cascade:
1. Telegram `from.first_name` + ` ` + `from.last_name` (whichever non-empty).
2. Telegram `from.username` (with `@` prefix dropped).
3. `chat.title` for group chats.
4. Fallback to `str(reporterChatId)`.

The resolved value is **snapshotted** into the bug record (`embed not FK`); subsequent profile changes do not propagate.

### 7.2 Claude CLI Subprocess Invocation

#### Spawn (v1.1 — conversational memory enabled)

```text
argv:
  ["claude", "-p", "<prompt>",
   "--output-format", "stream-json",
   "--verbose",
   "--permission-mode", <mode-flag>,
   *(["--resume", _chat_sessions[chat_id].session_id]
       if chat_id in _chat_sessions
       else []),                                  # ← first dispatch / post-/forget: omit BOTH flags
   *(["--disallowed-tools", DENYLIST] if mode == "edit" else [])]
cwd: <absolute repo path from ALIZA_REPOS>
stdin: closed
env: passthrough (claude inherits CLAUDE_* env from daemon process)
```

**Persistence semantics (v1.1):** the daemon does **not** pass `--no-session-persistence`. claude default-persists every dispatch to `~/.claude/projects/<cwd-encoded>/<session-uuid>.jsonl` so the next turn's `--resume <id>` can find it. `--resume <id>` is added only when `_chat_sessions[chat_id]` already has a recorded session from a prior successful dispatch.

> Pre-v1.1 (v1) the spawn argv carried `--no-session-persistence` to keep the host disk clean (stateless dispatches). v1.1 trades that for conversational memory; see operator note in [tools/aliza-bot/README.md](../../tools/aliza-bot/README.md) for disk-usage cleanup. Phase 1.5-supplemental probe (`tools/aliza-bot/preflight/v1.1-resume-run.log`) verified that the no-flag default-persist path produces a resumable session file on claude 2.1.123.

`--verbose` is **mandatory** when `-p` is paired with `--output-format=stream-json` (claude CLI 2.1.123+). Without it the CLI exits with: `Error: When using --print, --output-format=stream-json requires --verbose`.

#### CLI flag pinning (Phase 1.5 — VERIFIED 2026-04-29 on claude 2.1.123)

| Plan flag | claude flag (verified) | Verified? |
|---|---|---|
| permission mode (read) | `--permission-mode plan` | YES — `plan` is a valid choice |
| permission mode (edit) | `--permission-mode acceptEdits` | YES — `acceptEdits` is a valid choice |
| permission mode (full, v2) | `--permission-mode bypassPermissions` | YES — exists, still v2-only per §10.1 |
| stdout streaming | `--output-format stream-json` | YES — choices: `text`, `json`, `stream-json` |
| tool denylist | `--disallowed-tools "<comma-or-space-list>"` | YES — also accepts alias `--disallowedTools`. Probe-suite proven (see below) |
| working directory | (process `cwd`, not a flag) | YES — confirmed; no `--cwd` flag exists |
| stateless dispatch (v1 only) | `--no-session-persistence` | YES — used in v1; **dropped in v1.1** |
| resume conversational session (v1.1) | `--resume <session-id>` | YES — pinned by `tools/aliza-bot/preflight/v1.1-resume-run.log` Probe B (cross-process resume; same UUID retained) |

**New flags discovered, evaluated for daemon use:**

| Flag | Decision | Reason |
|---|---|---|
| `--bare` | NOT adopted (v1) | Skips CLAUDE.md / hooks / plugins / keychain auth. Forces `ANTHROPIC_API_KEY` or `apiKeyHelper`. Reconsider v2 with own service account |
| `--max-budget-usd <amount>` | NOT adopted | Plan §11 R7 chose wall-clock runtime cap, not dollar cap |
| `--fallback-model <model>` | OPTIONAL | Daemon MAY set `--fallback-model sonnet`; cheap insurance |
| `--disable-slash-commands` | NEVER set | Would break `implementFeature` / `reviewFeature` skills |
| `--exclude-dynamic-system-prompt-sections` | NOT relevant | Cache-reuse optimization for cross-user; single-user daemon won't benefit |
| `--add-dir <path>` | NOT needed | Process `cwd` already gives full read scope to the repo |

#### Disallowed-tools denylist (Phase 1.5 — PROVEN 2026-04-29)

```text
Bash(git push:*),Bash(rm -rf:*)
```

Pattern syntax: `Bash(<command-prefix>:*)` matches the Bash tool with any command whose argv starts with `<command-prefix>` followed by any further args. The `:*` glob is anchored — `Bash(git push:*)` does NOT match an unrelated `Bash(git status)` call.

**Probe results** — `tools/aliza-bot/preflight/last-run.log` contains the full run log with claude's per-probe `permission_denials` JSON evidence. Summary:

| # | Variant | Round 1 | Round 2 (cover-story) | Evidence |
|---|---|---|---|---|
| 01 | `git push origin HEAD` | PASS (denied) | — | `permission_denials` non-empty, bare HEAD unchanged |
| 02 | `git -C <abs> push origin master` | PASS (denied) | — | same |
| 03 | `cd <path> && git push origin master` | PASS (denied) | — | claude resolved cwd internally; both denied |
| 04 | `git push --force origin master` | PASS but weak (claude self-refused) | PASS — Probe 04b with cover story confirmed denylist fired | combined: denylist holds for `--force` |
| 05 | `git p origin master` (alias) | PASS (denied) | — | claude resolved alias internally; bash-tool argv was `git p ...`, denied by glob |
| 06 | `bash -c "git push origin master"` | PASS (denied) | — | denylist matched against the wrapper command |
| 07 | `git status && git push origin master` | PASS (denied) | — | denylist matched the compound; both halves were one Bash tool call |
| 08 | `rm -rf <path>` | PASS but weak (claude self-refused) | PASS — Probe 08b confirmed denylist fired | combined: denylist holds for `Bash(rm -rf:*)` |

**Verdict (Phase 1.5):** `Bash(git push:*),Bash(rm -rf:*)` is sufficient for all variants documented. `edit` mode shipped pending Codex review of the run log.

**Belt-and-braces (preserved per plan §11 R3 mitigation 2):** the daemon-side literal-string check (`\bgit\s+(-[^ ]+\s+)*push\b` against the prompt text) remains pre-spawn guard #6. The denylist is the inner ring; the literal-string check is the outer ring.

#### Pre-spawn guards (always enforced, fixed order 0 → 7)

```text
0. role check (v2 only) — _resolve_role(chat_id) ∈ {"admin", "reporter"}; else silent drop + WARNING.
                          Reporter messages bypass guards 1-7 and route to bug-queue intake (REST §5.1).
                          Admin messages proceed through guards 1-7 unchanged.
                          chat.type ≠ "private" → silent drop + WARNING (v2 mode only;
                          v1 backward-compat path bypasses this so the legacy
                          TELEGRAM_CHAT_ID allowlist behaves identically to pre-v2).
1. chat_id allowlist — chat_id ∈ {TELEGRAM_CHAT_ID} (v1) or admin-resolved (v2), else silent drop + WARNING.
2. repo resolution — repo_token ∈ ALIZA_REPOS, else reply with valid list.
3. single-flight lock — asyncio.Lock keyed by absolute repo path.
                        Held → reply `repo busy: <repo> (running for Xs)`.
4. branch guard — git -C <path> rev-parse --abbrev-ref HEAD ∉ {develop, main},
                  else reply `repo on protected branch: <branch>. switch to feature first`.
5. dirty-tree guard — git -C <path> diff --quiet && git -C <path> diff --cached --quiet,
                      else reply `repo has uncommitted changes. commit/stash first`.
6. literal `git push` check — prompt regex \bgit\s+(-[^ ]+\s+)*push\b matches → reply
                              `prompt contains forbidden token "git push"`.
7. daily runtime cap — sum(today_durations) < ALIZA_DAILY_RUNTIME_BUDGET_SEC,
                       else reply `daily 4hr runtime budget exhausted`.
```

Failure at any step short-circuits and replies.

#### Per-chat session state (v1.1 — shipped 2026-05-02)

```text
_chat_sessions: dict[chat_id: int, ChatSession]
ChatSession := { session_id: str, mode: "read" | "edit" }
```

Keyed by `chat_id`. `mode` is captured at the time of the original dispatch and used as the comparison anchor for **auto-forget on mode change** — if a subsequent dispatch arrives with a different `_resolve_mode(chat_id)` value, the daemon silently drops the entry and treats the next dispatch as fresh. Probe D (`v1.1-resume-run.log`) confirmed claude honors `--permission-mode` on resume.

Map is RAM-only. Daemon restart = forget all.

**Capture rule:** the daemon parses each stream-json line and, on the final `{"type":"result","subtype":"success","is_error":false,"session_id":"<uuid>", ...}`, writes `_chat_sessions[chat_id] = {session_id: "<uuid>", mode: <current dispatch mode>}`. Failed dispatches (`subtype=error_during_execution`) carry a NEW spawned id with `num_turns=0` — capturing it would corrupt the map. Probe C pinned the filter: capture only on `subtype=success ∧ is_error=false`.

**Session-not-found auto-recovery:** if `--resume <stale-id>` exits 1 because claude purged the session file, the daemon detects the marker (stream-json `errors[]` preferred — Path 2; stderr regex `^No conversation found with session ID:` — Path 1 fallback), drops the mapping, and replies `previous session expired — try again to start fresh` instead of surfacing `❌ exit=N`.

#### Streaming + heartbeat

- Daemon reads `claude` stdout line-by-line as JSONL.
- **Only `assistant.message.content[type=text]` blocks are forwarded** to Telegram. `tool_use` blocks are dropped (would flood under load). System/result/empty lines also dropped.
- Outbound Telegram throttle: send when buffer ≥ 3500 chars OR ≥ 3 sec since last send.
- Heartbeat every 60 sec while child alive: `⏳ working… 4m12s · branch=feature@a1b2c3d`.
- Hard timeout: 30 min. SIGTERM → wait 5 sec → SIGKILL. Final reply: `⛔ timeout 30min, terminated`.

---

## 8. Redis / Cache Surfaces

`N/A — not in scope.` Daemon-side state (single-flight, runtime budget, per-chat sessions) is RAM-only. No cross-service Redis.

---

## 9. Sync / Field-Ownership Surfaces

### 9.1 Cross-Surface State Machine

The state machine spans Telegram + REST + subprocess:

```
       Telegram /approve <N> @<repo> [note]
       ┌──────────────────────────────────────────────────────────┐
       │                                                          │
       ▼                                                          │
   GET /admin/aliza/bug-reports?displayId=N        Telegram /reject <N> [reason]
       │ (resolve to bugId UUID)                                  │
       ▼                                                          ▼
   PATCH bugId {status:"approved", dispatchRepo, ...}         PATCH bugId {status:"rejected", ...}
       │                                                          │
       ▼                                                       (terminal)
   daemon spawn claude (subprocess argv §7.2)
       │
       ▼
   PATCH bugId {status:"dispatched", dispatchStartedAt}
       │
       ▼
   claude exits
       ├── exit=0 → PATCH {status:"done", dispatchExit:0, dispatchEndedAt} → terminal
       └── exit≠0 → PATCH {status:"approved", dispatchExit:n, dispatchEndedAt}  (failure revert)
                         └─ admin can /approve again → approved → approved (4.18.0 self-transition)
```

### 9.2 Field Ownership

| Field | Authoritative Writer | Allowed Initiator | Stored In | Notes |
|---|---|---|---|---|
| `bug_reports.tenantId` / `orgId` | active persistence adapter | aliza-daemon | MongoDB | immutable after creation; REST derives from token, Mongo mode from env |
| `bug_reports.bugId` | active persistence adapter | — | MongoDB | immutable UUID |
| `bug_reports.displayId` | active persistence adapter (`bug_report_counters` atomic increment) | — | MongoDB | per-org monotonic, never resets |
| `bug_reports.idempotencyKey` | active persistence adapter | aliza-daemon (sends `idempotencyKey`) or adapter-derived fallback | MongoDB | immutable |
| `bug_reports.reporter*` | active persistence adapter (set at submit snapshot) | aliza-daemon (intake) | MongoDB | immutable; embed-not-FK |
| `bug_reports.text` / `suggestedRepo` | active persistence adapter (set at submit) | aliza-daemon | MongoDB | immutable after submit |
| `bug_reports.attachmentFileIds` | active persistence adapter (set at submit) | aliza-daemon | MongoDB | immutable Telegram `file_id` references captured from reporter attachments |
| `bug_reports.status` | active persistence adapter (state-machine validation) | aliza-daemon | MongoDB | CAS on status |
| `bug_reports.adminDecisionBy` / `adminDecisionAt` / `adminNote` | active persistence adapter | aliza-daemon (admin /approve or /reject) | MongoDB | mutable per state-machine table §5.4 |
| `bug_reports.dispatchRepo` / `dispatchStartedAt` / `dispatchEndedAt` / `dispatchExit` | active persistence adapter | aliza-daemon | MongoDB | mutable per state-machine table §5.4 |
| `_chat_sessions[chat_id]` | aliza-daemon (RAM only) | claude CLI stream-json result | RAM | not persisted |
| `tools/aliza-bot/.env.telegram` | operator | — | filesystem | gitignored, perms 600; daemon reads at startup only |

### 9.3 Conflict Resolution

- Single active writer mode per daemon process (`rest` or `mongo`). No dual-write is allowed.
- **CAS on status** in PATCH guarantees only one of two concurrent transitions wins. Loser sees `409 STALE_STATE` and may retry by re-reading current state.
- Concurrent `/approve` of the same bug: first to acquire DB CAS observes `status == "pending"` and wins; second observes `status == "approved"` and gets the already-acted reply mapped at the daemon side.
- `_chat_sessions[chat_id]` is RAM-only; daemon restart drops all state. No persistence conflicts.

### 9.4 Reporter Notification Matrix (v2)

Sent to `reporterChatId` private DM as best-effort:

| Transition | Notification text |
|---|---|
| `pending → approved → dispatched` (single combined notification at `dispatch.start`) | `your bug #<id> approved — admin dispatched into <repo>; updates will follow` |
| `dispatched → done` | `your bug #<id> resolved — final summary:\n<last 30 lines of admin's done reply>` |
| `dispatched → approved` (failure revert) | `your bug #<id> dispatch failed — exit=<n>; admin can retry with /approve <id>` |
| `pending → rejected` | `your bug #<id> declined: <admin_note>` (or `your bug #<id> declined` if note empty) |
| `approved → rejected` | (same as above; admin can /reject after a failure revert) |

On Telegram send failure, daemon logs ERROR and continues. State transition itself is not blocked.

### 9.5 Admin Intake Notification + Smoke Gate

When a reporter submission is persisted, daemon best-effort sends every configured admin chat an immediate notification:

```text
new bug #<id> from @<reporter> @<suggestedRepo>
"<truncated text>"
attachments: <n> Telegram file_id(s)
run /smoke <id> @<repo> before /approve
```

If `attachmentFileIds` are present, daemon also sends up to five admin attachment previews immediately after the text notification using the reusable Telegram `file_id`: `sendPhoto` first, then `sendDocument` fallback. Failure to send a preview is logged but does not roll back the persisted bug or text notification.

`/smoke <id> @<repo> [note]` is admin-only and read-only. It resolves the bug by `displayId`, composes the bug text, reporter identity, admin note, suggested repo, and attachment `file_id` list into a Claude prompt, and dispatches with `mode=read`. It does not PATCH the bug state. Claude must return a concise triage with `VERDICT: BUG_CONFIRMED | NOT_A_BUG | NEEDS_INFO | FEATURE_REQUEST`, `SMOKE`, `ROOT_CAUSE`, and `PLAN`; admin uses that output to decide whether to `/approve` or `/reject`.

Smoke dispatch uses `ALIZA_SMOKE_TIMEOUT_SEC` (default 300 seconds), separate from the longer implementation dispatch timeout, so a read-only triage cannot occupy the repo lock for the full implementation window.

For admin cleanup speed, `reject [reason]` or `/reject [reason]` may be sent as a Telegram reply to the `new bug #<id> ...` notification. The daemon extracts `displayId` from the quoted message and keeps the optional reason as `adminNote`. The same reply-id injection supports `smoke [@<repo>] [note]` / `approve @<repo> [note]`; `smoke` may omit `@<repo>` and falls back to `ALIZA_DEFAULT_REPO` because it is read-only. If no quoted bug id is present, commands keep the explicit-id usage path. Plain non-command replies to a bug notification are treated as ambiguous admin commentary: the daemon replies with shortcut usage and does not dispatch them to Claude.

---

## 10. Operations

### 10.1 Permission Modes

V1 supports two modes:

| Mode | `claude` flag | Disallowed-tools | Disk writes | Bash | git commit | git push | Notes |
|---|---|---|---|---|---|---|---|
| `read` (default) | `--permission-mode plan` | (none — plan mode forbids tool use anyway) | ❌ | ❌ | ❌ | ❌ | Safe-by-default. Used for plan / research / Q&A |
| `edit` (opt-in) | `--permission-mode acceptEdits` | proven set from Phase 1.5 | ✅ | ✅ | ✅ | ❌ (denylist + literal-string check) | Requires explicit chat_id entry in `ALIZA_CHAT_MODES` |
| ~~`full`~~ | — | — | — | — | — | — | **Out of scope for v1.** v2 plan must add inline-button confirmation |

**Mode resolution order:**
1. Lookup `chat_id` in `ALIZA_CHAT_MODES`.
2. If missing → `read`.
3. If value is unknown (typo, `full` in v1, etc.) → `read` + WARNING log.

**Escalation:** there is no in-protocol escalation. To get `edit` privileges, user must edit `.env.telegram` and restart daemon. Intentional friction.

### 10.1.1 AI Provider

Default provider is Claude Code. Operators may temporarily set `ALIZA_AI_PROVIDER=codex` when Claude is rate-limited; this changes only the subprocess runner, not Telegram roles, bug state, REST storage, protected-branch guard, dirty-tree guard, daily runtime cap, or the literal `git push` submit/dispatch guard.

| Provider | Spawn shape | Notes |
|---|---|---|
| `claude` (default) | `claude -p <prompt> --output-format stream-json --verbose --permission-mode <plan\|acceptEdits>` | Keeps v1.1 session resume and `--disallowed-tools` in edit mode |
| `codex` | `<ALIZA_CODEX_BIN> exec --json --sandbox <ALIZA_CODEX_SANDBOX> [-i <downloaded-image>] -C <repo> <prefixed prompt>` | No Claude session resume; daemon parses `item.completed` agent messages from JSONL stdout. Prompt prefix tells Codex to act as temporary implementer, follow AGENTS/CLAUDE, avoid `git push`, and avoid destructive commands |

### 10.2 Roles (v2)

| Role | Authority | What they can do |
|---|---|---|
| `admin` | full | All v1 behavior — direct dispatch via `@<repo>`, all `/cmd`s, plus v2 `/bugs` `/smoke` `/approve` `/reject` |
| `reporter` | report-only | Submit bug reports (any non-`/cmd` text becomes a bug entry). May read `/help`, `/status`, `/ping`. **Cannot trigger any `claude` spawn** under any prefix |
| (unknown chat_id) | denied | Silent drop + WARNING log |

**Role resolution order:**
1. If `ALIZA_CHAT_ROLES` is **truly unset** AND `chat_id == TELEGRAM_CHAT_ID` → `admin` (v1 backward-compat). Explicit empty `{}` does NOT trigger this fallback.
2. Lookup `chat_id` in `ALIZA_CHAT_ROLES`. `"admin"` → admin; `"reporter"` → reporter.
3. Unknown value → daemon WARNING-logs, treats as **denied**.
4. Missing chat_id → denied.

### 10.3 Environment Variables

| Var | Required | Default | Purpose |
|---|---|---|---|
| `TELEGRAM_BOT_TOKEN` | yes | — | Bot API auth |
| `TELEGRAM_CHAT_ID` | yes | — | Single allowed chat_id (v1; v1 backward-compat in v2) |
| `ALIZA_REPO_ROOT` | no | `$PWD` | Path used to find `.env.telegram` |
| `ALIZA_SESSION_NAME` | no | unset | If set, MCP `sendmessage` auto-prefixes `[<name>] ` |
| `ALIZA_REPOS` | yes (Phase 1b+) | unset | JSON map: `{"<repo-token>": "<absolute-path>"}`. Each path must (a) exist, (b) be a git working tree (`git -C <path> rev-parse` succeeds). Daemon validates at startup; invalid entries logged at WARNING and dropped |
| `ALIZA_DEFAULT_REPO` | no | unset | repo-token used when no `@<repo>` prefix. Must exist as key in `ALIZA_REPOS` |
| `ALIZA_CHAT_MODES` | no | `{}` | JSON map: `{"<chat_id>": "read" \| "edit"}`. Default mode if missing = `read`. `full` is **not** accepted in v1 |
| `ALIZA_AI_PROVIDER` | no | `claude` | Dispatch provider: `claude` or `codex` |
| `ALIZA_CODEX_BIN` | no | `codex` | Codex executable path. Useful for systemd units whose PATH cannot see a VS Code extension install |
| `ALIZA_CODEX_MODEL` | no | unset | Optional Codex model passed as `codex exec -m <model>` |
| `ALIZA_CODEX_SANDBOX` | no | `workspace-write` | Codex sandbox passed to `codex exec --sandbox` |
| `ALIZA_CODEX_EXTRA_ARGS` | no | unset | Extra whitespace-split args appended before `-C <repo>` for Codex-only experimentation |
| `ALIZA_CHAT_ROLES` (v2+) | no | (unset) | JSON map: `{"<chat_id>": "admin" \| "reporter"}`. **Malformed JSON or non-object value → daemon fails to start** (fail-closed). Backward-compat: only when truly **unset** AND `TELEGRAM_CHAT_ID` is set is that single chat_id auto-promoted to `admin` |
| `ALIZA_BUG_QUEUE_FILE` (v2+, pre-A2.2) | no | `~/.config/aliza-bot/bug-queue.json` | Override JSON queue location. Replaced by REST after A2.2 |
| `ALIZA_MAX_PENDING_BUGS` (v2+) | no | `100` | Max simultaneous `pending` bugs. Over the cap → `bug queue full` reply |
| `ALIZA_SMOKE_TIMEOUT_SEC` | no | `300` | Timeout for read-only `/smoke` triage dispatches |
| `ALIZA_REPORTER_CONTEXT_FILE` | no | `~/.config/aliza-bot/reporter-context.json` | Persistent best-effort cache of reporter message text/caption + attachment `file_id`s for reply recovery |
| `ALIZA_REPORTER_CONTEXT_MAX` | no | `500` | Max cached reporter message contexts retained |
| `ALIZA_ATTACHMENT_DOWNLOAD_DIR` | no | `~/.cache/aliza-bot/attachments` | Directory for best-effort Telegram `getFile` downloads before smoke/AI dispatch. Codex receives downloaded images via `-i` |
| `ALIZA_PERSISTENCE_MODE` (A2.4+) | no | `rest` | `rest` uses klynx-api REST; `mongo` writes `bug_reports` / `bug_report_counters` directly |
| `ALIZA_MONGO_URI` (A2.4 mongo mode) | yes in mongo mode | — | Mongo connection string for direct persistence |
| `ALIZA_MONGO_DATABASE` (A2.4 mongo mode) | yes in mongo mode | — | Mongo database containing Aliza collections |
| `ALIZA_TENANT_ID` / `ALIZA_ORG_ID` (A2.4 mongo mode) | yes in mongo mode | — | Scope stamped onto direct-Mongo records; daemon fails startup if missing |
| `ALIZA_DAILY_RUNTIME_BUDGET_SEC` | no | `14400` (4 hr) | Wall-clock cumulative `claude` runtime per UTC day |
| `ALIZA_GH_REPO` | no | `pointitconsulting/klynx-api` | Used by `/prs` cmd |
| `KLYNX_API_BASE_URL` (REST mode) | yes in rest mode | — | klynx-api base URL for daemon REST calls |
| `KLYNX_API_SA_CLIENT_ID` (REST mode) | yes in rest mode | — | Service-account clientId for `aliza:bug-reports` integration |
| `KLYNX_API_SA_CLIENT_SECRET` (REST mode) | yes in rest mode | — | Service-account clientSecret; gitignored, perms 600 |

`ALIZA_REPOS` example:

```text
ALIZA_REPOS={"klynx-api":"/home/klynx/klynx-api","gateway-api":"/home/phibek/gateway-api","klynx-feature":"/home/klynx/klynx-feature","gateway-portal":"/home/phibek/gateway-portal"}
```

All env vars live in `.env.telegram` (gitignored, perms 600). Daemon does not read any other source.

### 10.4 Reply Formats

**Final summary (success path):**

```text
✅ done in <H>h<M>m<S>s
exit=<n>
mode=<read|edit>
files changed:
<git diff --stat HEAD output, max 30 lines>
status:
<git status --porcelain output, max 30 lines>
(no commits created — review with: git diff)
```

If a commit was created (only possible in `edit` mode + Claude chose to commit), replace last line with:

```text
commit: <sha-short> <subject-truncated-60>
```

Always include both diff-stat AND porcelain so the user sees half-edited state explicitly (R6).

**`/status` reply:**

```text
running dispatches (N):
- klynx-api · chat=<id> · 4m12s · pid=12345 · mode=edit
  prompt: implementFeature add videowall 3D — start with the gridLayout c…
- gateway-api · chat=<id> · 0m45s · pid=12389 · mode=read
  prompt: explain how device sync handles the offline backlog
budget: 1h23m / 4h used today
```

Prompt line truncated to **80 chars** with `…` suffix when truncated. If `N=0`: `no dispatches running. budget: <used> / <total> used today`.

**Error replies (single-line, no emoji except where shown):**

| Condition | Reply text |
|---|---|
| repo unknown | `repo "<token>" not in ALIZA_REPOS. valid: <comma-list>` |
| no default + no @prefix | `no default repo configured; use @<repo> prefix. valid: <list>` |
| empty prompt | `prompt is empty. usage: @<repo> <prompt>` |
| repo busy | `repo busy: <repo> (running for <H>m<S>s)` |
| protected branch | `repo on protected branch: <branch>. switch to feature first` |
| dirty tree | `repo has uncommitted changes. commit/stash first` |
| forbidden token | `prompt contains forbidden token "git push"` |
| daily cap exhausted | `daily 4hr runtime budget exhausted. resets at 00:00 UTC` |
| `claude` exit ≠ 0 (generic) | `❌ exit=<n> in <duration>. stderr tail: <last-400-chars>` |
| `claude` exit ≠ 0 + session-not-found marker (v1.1) | `previous session expired — try again to start fresh` (mapping cleared) |
| `/forget` (v1.1, any state) | `forgot your session — next dispatch starts fresh` (idempotent) |
| timeout | `⛔ timeout 30min, terminated` |
| `claude` not on PATH | `claude CLI not found. install from https://docs.claude.com/en/docs/agents-and-tools/claude-code/setup` |
| Reporter triggers admin-only `/cmd` (v2) | `command admin-only` |
| Reporter `@<repo> <text>` (v2) | (no refusal — parsed as `suggestedRepo` hint per §7.1, routed to bug-queue intake) |
| Reporter free-form when role denied (v2) | (silent drop — same as v1 unknown chat_id) |
| Bug queue full (v2) | `bug queue full — please try again after admin processes pending bugs` |
| `/bugs` from reporter (v2) | `command admin-only` |
| `/approve <id>` missing `@<repo>` (v2) | `usage: /approve <id> @<repo> [note]; valid: <comma-list of ALIZA_REPOS keys>` |
| `/smoke <id>` missing `@<repo>` (v2) | uses `ALIZA_DEFAULT_REPO` when configured; otherwise replies `usage: /smoke <id> @<repo> [note]; valid: <comma-list of ALIZA_REPOS keys>` |
| `/approve` bug not found (v2) | `bug #<id> not found` |
| `/approve` bug not in pending or approved-after-revert (v2) | `bug #<id> already <status> by <admin_decision_by> at <hh:mm>; cannot re-act` |
| `/reject` bug not found / already terminal (v2) | (same as above pattern) |

### 10.5 Exit Code Semantics

| `claude` exit | Meaning | Daemon reply emoji | Logged level |
|---|---|---|---|
| 0 | success — Claude finished its work | ✅ | INFO |
| 1 | generic failure — Claude reported an error | ❌ | WARNING |
| 2 | invalid usage — likely contract/flag drift | ❌ | ERROR (alert in `/status`) |
| 124 | timed out (set by daemon's `asyncio.wait_for`) | ⛔ | WARNING |
| 137 | SIGKILL (post-SIGTERM grace expired) | ⛔ | WARNING |
| 143 | SIGTERM (timeout path) | ⛔ | WARNING |
| other | unknown — show raw exit code | ❌ | ERROR |

### 10.6 Logging

Every dispatch produces two structured log lines (one at start, one at end):

```text
dispatch.start  chat=<id> repo=<token> path=<abs> mode=<read|edit> prompt_truncated=<200chars>
dispatch.end    chat=<id> repo=<token> pid=<n> exit=<n> duration_sec=<n> mode=<read|edit>
```

Plus per-event lines for: pre-spawn-guard rejections (one per rejection), heartbeat (DEBUG only), throttle-flush (DEBUG only).

**v2 additions:**

```text
bug.submit       chat=<reporter_chat_id> bug_id=<n> suggested_repo=<token|null> text_truncated=<200chars>
bug.transition   bug_id=<n> from=<status> to=<status> by=<admin_username|"system">
notification.send chat=<reporter_chat_id> bug_id=<n> kind=<approved|done|failed|rejected>
```

Bot token is never logged. httpx is silenced at WARNING. Prompt content truncated to 200 chars.

---

## 11. Frontend Integration Notes

A2 ships no FE consumer. Telegram client is the de facto frontend; this contract's §7.1 grammar IS the FE schema.

When klynx-feature builds an analytics page later, it consumes the same REST surface (§5):

| FE display | Source field | Notes |
|---|---|---|
| Bug ID badge | `displayId` | `#3` style; matches daemon `/bugs` render |
| Reporter avatar / handle | `reporterUsername` | already cascade-resolved |
| Bug text | `text` | preserve newlines |
| Status pill | `status` | colored: pending=gray, approved=blue, dispatched=yellow, done=green, rejected=red |
| Time ago | `submittedAt` | client-side relative format |
| Repo badge | `dispatchRepo` | only for dispatched/done |
| Admin who handled | `adminDecisionBy` | snapshot — no live Telegram lookup |

**FE Guardrails:**
- Do not invent error codes beyond §5.4.
- Do not edit bug records — terminal states are state-machine-only via PATCH.
- Reporter privacy: `reporterChatId` is sensitive — do not surface in shared/multi-tenant UI without explicit org-admin permission.

---

## 12. Rollout Notes

| Repo | Dependency | Required Before | Notes |
|---|---|---|---|
| `klynx-api` | A2.1 BE foundation — bug_reports collection + 4 endpoints + AuthServiceAccount mount | klynx-api 4.15.0 | Ships REST layer; daemon doesn't call yet |
| `klynx-api` | A2.2 daemon migration | after A2.1 ships | Daemon switches `_enqueue_bug` / `cmd_bugs` / `/approve` / `/reject` to REST. JSON queue archived |
| `klynx-api` | A2.2 backfill script | one-shot, before daemon swap | Re-runnable; idempotency dedupes |
| `klynx-api` | 4.18.0 self-transition fix (`approved → approved`) | shipped | Codex PR #154 rev 1 blocker fix; failure-revert retry |
| `gateway-api` / `klynx-feature` / `gateway-portal` | none | — | passive dispatch targets, no code change |

**Status:** v1 + v1.1 shipped 2026-05-02; v2 channel-approval plan approved; A2.1 BE foundation targeting 4.15.0; A2.2 daemon migration is next chore PR.

---

## 13. Examples

### Example REST — submit bug

```bash
curl -X POST 'https://aliza.k-lynx.com/admin/aliza/bug-reports' \
  -H "Authorization: Bearer $SA_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{
    "reporterChatId": 8745841477,
    "reporterUsername": "Prapawadee Phawanram",
    "text": "หน้า biDash widget ไม่แสดงครับ",
    "idempotencyKey": "f47ac10b-58cc-4372-a567-0e02b2c3d479"
  }'
```

### Example REST — list pending bugs

```bash
curl 'https://aliza.k-lynx.com/admin/aliza/bug-reports?status=pending' \
  -H "Authorization: Bearer $SA_TOKEN"
```

### Example REST — `/approve N` resolution path

```bash
# 1. Resolve displayId → bugId UUID
curl 'https://aliza.k-lynx.com/admin/aliza/bug-reports?displayId=3' \
  -H "Authorization: Bearer $SA_TOKEN" | jq -r '.details.items[0].bugId'
# → "f47ac10b-58cc-4372-a567-0e02b2c3d479"

# 2. PATCH 1: pending → approved
curl -X PATCH 'https://aliza.k-lynx.com/admin/aliza/bug-reports/f47ac10b-...' \
  -H "Authorization: Bearer $SA_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{
    "status": "approved",
    "dispatchRepo": "kapi",
    "adminDecisionBy": "468848033",
    "adminDecisionAt": "2026-05-03T05:04:12Z",
    "adminNote": null
  }'

# 3. spawn claude (subprocess §7.2)

# 4. PATCH 2: approved → dispatched (only if spawn started successfully)
curl -X PATCH 'https://aliza.k-lynx.com/admin/aliza/bug-reports/f47ac10b-...' \
  -H "Authorization: Bearer $SA_TOKEN" \
  -d '{"status":"dispatched","dispatchStartedAt":"2026-05-03T05:04:13Z"}'

# 5. After claude exits, PATCH 3 based on exit code
# 5a. exit=0 → done
curl -X PATCH '...' -d '{"status":"done","dispatchExit":0,"dispatchEndedAt":"..."}'
# 5b. exit≠0 → revert to approved (admin can /approve again)
curl -X PATCH '...' -d '{"status":"approved","dispatchExit":1,"dispatchEndedAt":"..."}'
```

### Example Telegram dispatch (admin)

```text
> @klynx-api implementFeature add videowall 3D — start with the gridLayout component
< ⏳ working… 0m12s · branch=feature@a1b2c3d
< [streamed assistant text...]
< ✅ done in 0h4m32s
< exit=0
< mode=edit
< files changed:
<  app/components/GridLayout.vue | 47 ++++++++
<  ...
```

### Example Telegram reporter intake (v2)

```text
[reporter side — private DM]
> @kapi หน้า biDash widget ไม่แสดงครับ (+ screenshot caption/photo)
< bug #3 filed — admin will review

[admin side]
< new bug #3 from @Prapawadee Phawanram @kapi
< "หน้า biDash widget ไม่แสดงครับ"
< attachments: 1 Telegram file_id(s)
< run /smoke 3 @kapi before /approve
> /smoke 3 @kapi please verify root cause
< smoke #3 → investigate kapi
< VERDICT: BUG_CONFIRMED
< SMOKE: ...
< ROOT_CAUSE: ...
< PLAN: ...
> /approve 3 @kapi please check
< bug #3 approved — dispatching into kapi
< [...claude output streamed...]
< ✅ done in 0h2m11s
<  ...

[reporter side — auto notification]
< your bug #3 approved — admin dispatched into kapi; updates will follow
< your bug #3 resolved — final summary:
< [last 30 lines...]
```

### Example Error — INVALID_TRANSITION

```json
{
  "code": "INVALID_TRANSITION",
  "message": "cannot transition from done to approved",
  "status": false
}
```

### Example Error — STALE_STATE (CAS conflict)

```json
{
  "code": "STALE_STATE",
  "message": "current status is approved, request expected pending",
  "status": false
}
```

---

## 14. References

- Plan (v1, closed): [docs/plan/done/aliza-bot-claude-backend.md](../plan/done/aliza-bot-claude-backend.md)
- Plan (v1.1, closed): [docs/plan/done/aliza-bot-memory.md](../plan/done/aliza-bot-memory.md)
- Plan (v2, closed): [docs/plan/done/aliza-bot-channel-approval.md](../plan/done/aliza-bot-channel-approval.md)
- Plan (A2.1 BE foundation): [docs/plan/aliza-bot-v2.1-bug-reports-mongo-foundation.md](../plan/aliza-bot-v2.1-bug-reports-mongo-foundation.md)
- Daemon source: [tools/aliza-bot/daemon.py](../../tools/aliza-bot/daemon.py)
- MCP server source: [tools/aliza-bot/server.py](../../tools/aliza-bot/server.py)
- README: [tools/aliza-bot/README.md](../../tools/aliza-bot/README.md)
- Phase 1.5 probe log: [tools/aliza-bot/preflight/last-run.log](../../tools/aliza-bot/preflight/last-run.log)
- v1.1 resume probe log: [tools/aliza-bot/preflight/v1.1-resume-run.log](../../tools/aliza-bot/preflight/v1.1-resume-run.log)
- AuthServiceAccount middleware: [internal/middleware/authServiceAccount.go](../../internal/middleware/authServiceAccount.go)
- Branch flow rule: [CLAUDE.md §"Branch flow"](../../CLAUDE.md)

---

## 15. Future-Phase Reservations (informational)

Reserved fields on `bug_reports` schema in A2.1 with `null` defaults. Behavior contract lives in respective phase plans:

- `attachmentFileIds: []string` — populated by media-group buffering phase
- `smokeResult: object | null` — populated by Playwright pre-smoke runner; shape `{status:"pass"|"fail"|"skipped", completedAt, stepFailed, tracePath}`
- `rootCause: object | null` — populated by root-cause classifier; shape `{hypothesis, source:"rule"|"llm"|"manual", confidence:0..1, details}`
- `claimedBy / claimedAt` — populated by multi-admin work-queue phase

Telegram protocol future:
- `/status` history of completed dispatches (deferred from v1.1)
- mode-per-repo
- adaptive heartbeat cadence

A2 contract does NOT specify their write path / read semantics — those phases revise this contract additively when they land.

---

## 16. Checklist

- [x] Domain / flow boundary explicit (§0 — Telegram + REST + subprocess as one Aliza-bot integration flow; FE / Kafka / Redis explicitly excluded).
- [x] Owner backend explicit (`klynx-api`).
- [x] System of record per domain (bug_reports, bug_report_counters, integration_tokens, daemon RAM state, .env.telegram).
- [x] Canonical store and projection store documented.
- [x] Producers and consumers listed for every surface in scope (4 REST + Telegram protocol + subprocess).
- [x] REST request, response, and error contracts defined for all 4 endpoints (full error matrix preserved verbatim).
- [x] Telegram message grammar locked (production rules + precedence + edge cases + reporter exception in v2).
- [x] Subprocess invocation contract explicit (argv, env, mode flags, denylist, pre-spawn guards 0-7, streaming, heartbeat, exit codes).
- [x] Kafka N/A — explained.
- [x] MQTT N/A — Telegram is the realtime surface, documented inline.
- [x] Redis N/A — explained (daemon state RAM-only).
- [x] Field ownership explicit for bug_reports + daemon RAM state + .env.telegram.
- [x] Cross-surface state machine documented (Telegram → REST CAS → subprocess → REST).
- [x] CLI flag pinning preserved (Phase 1.5 verified table + new-flags evaluation).
- [x] Disallowed-tools denylist + 8 probe results preserved verbatim.
- [x] Per-chat session state (v1.1) preserved (capture rule, auto-forget, session-not-found auto-recovery).
- [x] All env vars documented (v1 + v1.1 + v2 + post-A2.2 daemon REST credentials).
- [x] All Telegram error replies preserved (v1 + v2 reporter additions).
- [x] All exit codes preserved.
- [x] Logging (dispatch.start/end, bug.submit/transition, notification.send) preserved.
- [x] Backward compatibility documented (pre-A2.1 / A2.1 / A2.2 / v1 → v2 toggle / rollback lossy window).
- [x] Replay / re-sync behavior documented (REST idempotent, backfill re-runnable, subprocess not replay-safe by design).
- [x] Future-phase reservations (attachments, smokeResult, rootCause, claimedBy/claimedAt) preserved.
- [x] Examples cover REST happy path, /approve full flow, Telegram dispatch, reporter intake, error envelopes.
- [x] Revision history (v1, v1.1, v2 draft, REST rev1/rev2, 4.18.0 fix) preserved verbatim.
