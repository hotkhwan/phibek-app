<!-- .claude/CLAUDE.md -->
# Gateway API — Claude Rules

## Overview

Gateway API is the central backend for the platform, built with **Go + Fiber**.

**Module:** `github.com/pointitconsulting/klynx-api`

## Planning And Review Workflow

For any feature, bug, flow change, event integration change, device/camera sync change, deploy change, or cross-repo work:

1. analyze first
2. create or update the plan artifact in `docs/plan/<name>.md`
3. create or update the shared contract in `docs/contracts/<name>.md` or `openapi/<name>.yaml` when API, event, sync, or FE integration is affected
4. do not implement until the plan has been reviewed and is ready

### Role split

- Claude = planner + implementer
- Codex = architecture manager + review gate

### Default cross-repo context

- Feature owner backend: default = `klynx-api`; override requires explicit justification
- Events system of record: `gateway-api`
- Klynx consumes normalized events from Kafka topic `gw.events.normalized.v1`
- `gateway-api/device_management` is the source of truth for device/camera identity and sync state
- `klynx/camera` is a projection/consumer model for Klynx workflows
- Frontend must follow documented contracts and must not invent API, request/response, error, or event schema

### Related repos

- `klynx-connector` — Windows desktop connector (Go, builds to signed `klynx-connector.exe`) that ingests RTSP / screen / webcam from a customer site and publishes to klynx-api over SRT (caller mode, outbound only — no public IP on the client side). Lives at `/home/klynx/klynx-connector`, module `github.com/pointitconsulting/klynx-connector`. **Positioned as systemDevices/edge Part 1** (Windows software edge; appliance + gateway integrations are Parts 2–3). Device join uses `refId` — an org-scoped reference code (format `RID-XXXX-XXXX`, policy singleUse / multiUse / expiresAt / requireApproval) issued from `systemDevices → Edge → Add device` in the web UI. klynx-api owns: refId CRUD, paired device registry (`deviceKind=connector`), source registry, SRT ingest listener, per-stream credential minting, and approve/revoke lifecycle. See `klynx-connector/docs/plan/klynx-connector-phase1.md` and `klynx-connector/docs/contracts/{pairingApi,srtUrl,processManagement,uiWireframe}.md` for the contract this repo must implement on the cloud side. Roadmap slot: `docs/plan/platform-roadmap.md` → *klynx-connector — Windows Native*.

### Planning requirements

Plans must use `docs/plan/TEMPLATE.md` and should explicitly include:
- feature owner backend
- domain system of record
- producer / consumer mapping
- canonical store / projection store
- request / response / error contract summary
- field ownership and write authority when sync is involved
- rollout order, rollback, decision points, and validation checklist

### Approval gate

If Codex review finds blocking issues or high-risk assumptions, revise the plan and contract first.
Implementation starts only after the plan is ready enough to execute and validate.

### Task budget — fast delivery guardrail

Move as fast as the scope safely allows. A task that can be fixed, validated, committed, and PR'd in **1-5 minutes** should be. The 1-hour mark is an upper-bound warning signal, not a target: if work is approaching 1 hour, shrink, bundle differently, or split so delivery stays fast.

If a task can't fit:

1. **Split by delivery slice.** A larger plan may have N phases, but only split when each phase can ship independently and the combined scope would push toward the 1-hour warning mark. Do not split tiny related edits just to satisfy ceremony.
2. **Downgrade.** A 90% plan that ships beats a 100% plan that idles. Drop nice-to-haves, file them as follow-ups.
3. **Escalate.** If neither split nor downgrade keeps the work fast, declare multi-cycle at the start so the user can pace it explicitly — never silently stretch a single task across days or sessions.

Review pacing (the part that's currently slowing us down):

- **Codex rev limit: 2.** First review + one revision should clear the gate. Hitting rev 3 means the plan is the wrong size — split or downgrade rather than do another revision round.
- **Claude self-review: batched.** Build + test once at end-of-implementation, not after every edit. Don't loop on micro-fixes — collect issues, batch the fix, re-test once.
- **Blockers > 30 min are a new task.** Close the current task with what shipped, file the remaining blockers as follow-up tasks. Don't grow the current task to absorb them.

Slowdown signal: Codex rev 3+, session > 1 hour, or stretching across days = **stop**. Re-scope or escalate before continuing. Tell the user, don't silently burn down the iteration.

This rule applies to both tiers from `feedback_planning_tiers`: Tier 1 Lite should usually close in minutes; Tier 2 Full should move fast by bundling cohesive slices and splitting only where the slice would otherwise push toward the warning mark.

### Post-task close-out (mandatory)

When a plan's backend deliverables are shipped, fully tested (`go build ./...` + `go test ./...` green), and all checklist items in §10 are complete (or explicitly noted as out-of-scope / FE follow-up):

1. **Update plan Status header** with ✅ Done + date + concrete evidence (file paths, test counts, env flags). FE-only follow-ups must be itemized.
2. **Move plan** `docs/plan/<name>.md` → `docs/plan/done/<name>.md`. (Plans are work artifacts; once shipped they become historical context.)
3. **Do NOT move the contract.** Contracts in `docs/contracts/` stay flat regardless of plan status — they remain the live source of truth for FE / 3rd-party / future maintenance. Mark a contract `**Status:** Superseded by <new>` only when it is genuinely retired.
4. **Update `docs/plan/platform-roadmap.md`:**
   - Add a row to the "Shipped in feature branch" table with the same evidence.
   - Remove the row from "Active Drafts" (or update its status if partial).
   - Add any FE / operational follow-up to the "Follow-ups from shipped plans" table.
   - Update See-also footer paths to point at `done/`.
5. **Open a PR to `develop`** from the working branch. Do not push directly. Use `gh pr create --base develop --title "<scope>: <plan-name>"` with a body that links to the moved plan, the contract, and the test commands run. Cross-repo work needs one PR per repo.

For cross-repo plans (klynx-api + gateway-api): commit each repo separately, push each branch, and open both PRs in lockstep so reviewers can match them.

### Versioning rule (`version.go`)

Bump `version.go` in the same commit that closes a plan, **before** opening the PR. Format is `major.minor.change` (semver — major / minor / patch):

| Segment | Bump when | Reset rule |
|---|---|---|
| `major` | breaking change to a public contract (REST shape, Kafka schema, gRPC method, env semantics that downstream code depends on). Always coordinate with FE / gw / 3rd-party first. | resets `minor=0`, `change=0` |
| `minor` | new feature, new endpoint, new env flag, new package — backward compatible. Closing one or more plan(s) almost always lands here. | resets `change=0` |
| `change` | bug fix, refactor, test additions, comment / doc edit, dependency bump that does not change behavior. | — |

Examples for this repo:
- `3.13.1 → 3.14.0` — closed 4 plans with new endpoints + new packages → minor.
- `3.14.0 → 3.14.1` — fixed a regression in the new endpoint → patch.
- `3.14.1 → 4.0.0` — renamed a stable endpoint → major (and update the cross-repo contract first).

When unsure, prefer the smaller bump and note in the PR body why. Never skip the bump — `version.go` is read at startup and surfaces in `/admin/system/deploymentProfile` so deploys are diffable.

### CHANGELOG.md update (mandatory)

Every commit that bumps `version.go` MUST add a corresponding entry to [CHANGELOG.md](CHANGELOG.md) in the same commit. The CHANGELOG is the human-readable counterpart to the version bump — it answers "what changed in 4.8.2 vs 4.8.1?" without forcing the reader to grep `git log` or hunt through `docs/plan/done/`.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/):

- New section header: `## [<version>] — <YYYY-MM-DD>`
- Subsection by change kind: `### Added` / `### Changed` / `### Deprecated` / `### Removed` / `### Fixed` / `### Security`
- One bullet per change with: short description, PR # reference, and a one-line "why" or risk note when not obvious from the description.
- Newest entry goes to the top, just below `## [Unreleased]`.

Rules:
- The CHANGELOG entry lives in the **same commit** as the `version.go` bump. Pre-commit hook + Codex reviewer both can see them together.
- Do NOT batch multiple version bumps into one CHANGELOG entry — one entry per version, even if shipped in the same hour.
- Patch-only commits (no version bump, e.g. test additions, doc tweaks) do NOT need CHANGELOG entries.
- Security fixes always go under `### Security`, even if they are 1-line patches — auditors and reviewers grep this header.
- Reference the canonical PR #, plan path, and contract path when applicable so readers can drill into the full design context.

Skipping the CHANGELOG.md update is a Codex-blocking issue on any PR that bumps `version.go`. Treat it on the same level as the version bump itself.

### Pre-task sync (mandatory)

After a PR is merged into `develop`, Jenkins runs and adds follow-on commits directly to `develop` (deploy artifacts, image tags, generated swagger, post-merge formatting). Those commits do not exist on the feature branch.

**Before starting the next task on the same feature branch — and before opening the next PR — pull develop back.** Skipping this step causes the next PR to either show stale "behind develop" status or, worse, surface unrelated Jenkins-generated changes as conflicts that the reviewer has to untangle.

Run from the feature branch root:

```sh
git fetch origin
git checkout feature
git merge --ff-only origin/develop || git merge origin/develop
git push origin feature
```

`--ff-only` first because Jenkins commits on top of our merge are usually a clean fast-forward; the fallback merge handles the case where someone else also merged in parallel. If a real merge commit lands, keep it — it is the audit trail of "feature picked up Jenkins commit X."

For cross-repo plans, sync each repo's feature branch independently — gateway-api Jenkins runs on its own `develop` and produces its own commits.

Only after the working branch is up-to-date do we begin the next task's planning / implementation cycle.

### Branch flow (batch model — small team, 1–2 BE devs)

```text
feature  ──merge──▶  develop  ──merge──▶  main
   │                    │                    │
direct commits        Jenkins              Jenkins
+ smoke + go test    → image push         → image push
(BE dev parallel)    → ArgoCD sync        → ArgoCD sync
                     → dev cluster        → prod cluster
                     (user UAT 1-2 hr)
```

Rules:

1. **`feature` = batch branch.** Direct commits are OK. Multiple commits accumulate on feature, then merged to develop as a batch when ready. Pre-push gate: `go build ./...` + `go test ./...` green + smoke test pass locally. **No per-commit PR review** — trade-off accepted: velocity > review surface, suited for a 1–2 BE dev team.
2. **`develop` = UAT lane.** Jenkins auto-builds + pushes image, ArgoCD syncs to dev cluster on merge. User UAT each merge batch within 1–2 hr per §"Task budget — fast delivery guardrail". Merging feature → develop is the *de-facto* review checkpoint.
3. **`release/develop-to-main`** = optional staging branch used when batching is wanted before prod (see PR #37 pattern: `release/develop-to-main → main`). Small releases may merge `develop → main` directly.
4. **`main` = production.** Jenkins auto-builds + pushes image, ArgoCD syncs to prod cluster on merge. Update only via develop or release-to-main merge — never push directly.

Sync notes:

- After every develop merge, Jenkins lands `chore(cd): update go-aliza image tag <SHA> [skip ci]` on develop. Pulling develop back into feature may need force-push (`git push --force-with-lease origin feature`) when feature's SHA history diverges. **In a batch model this is normal** — feature is a working scratchpad, not a public contract; accept the divergence.
- **PR-gated tasks — default = Flow B' (chore off feature, merge to feature).** When a task needs Codex review, has a plan + contract, or otherwise warrants an isolated review surface, branch off `origin/feature` and PR back into `feature`:

  ```text
  origin/feature ─▶ chore/<task> ─▶ PR(chore→feature) ─▶ merge ─▶ feature ─▶ PR #N(feature→develop) ─▶ develop ─▶ main
  ```

  The chore PR is the Codex review checkpoint. After merge, the work travels with the next feature → develop batch. **No sync-back step is needed** — feature already carries the chore work, so smoke tests on feature reflect the develop-bound payload exactly. This is the default for all single-repo plan/contract work.

- **Exception — Flow B (chore off develop, merge to develop directly).** Use only when one of these is true:
  1. **Cross-repo block** — FE / gateway-api / 3rd-party consumer cannot wait for the next feature → develop batch (typical SLA: 1–2 days).
  2. **Hot fix to develop/prod** — must skip the feature batch.
  3. **Safety / security gate** — work must not co-mingle with batch (e.g. denylist probes, kill-switch scaffolding).

  ```text
  origin/develop ─▶ chore/<task> ─▶ PR(chore→develop) ─▶ develop
  ```

  In this case, `feature` falls behind develop by the chore work — pull develop back into feature per §"Pre-task sync (mandatory)" before the next batch.

- **Hard rule still applies:** never commit directly on `develop` or `main`. They are merge targets only.

### Cross-repo coordination (multi-session, hub-and-spoke)

The platform spans 4 repos. The team runs **option 2 — parallel multi-session work** with `klynx-api` as the hub.

| Role | Repo | Path | Owns |
|---|---|---|---|
| BE hub (canonical) | `klynx-api` | `/home/klynx/klynx-api-feature` | plan + contract authority, feature owner backend (default) |
| BE spoke | `gateway-api` | `/home/phibek/gateway-api` | events SoT, device_management SoT |
| FE spoke | `klynx-feature` (KLynx-Platform) | `/home/klynx/klynx-feature` | klynx UI; consumes klynx-api contracts |
| FE spoke | `gateway-portal` (gateway-Platform) | `/home/phibek/gateway-portal` | gateway-api admin/operator UI |

**Authority.** `klynx-api` is the contract authority for cross-repo work. Plan + contract artifacts under `klynx-api/docs/plan/<name>.md` + `klynx-api/docs/contracts/<name>.md` are canonical. Spokes consume contracts; they do not invent schema. Override (feature owner backend ≠ `klynx-api`) requires explicit plan justification per §"Default cross-repo context".

**Session model.** One Claude Code session per repo, running in parallel:

- Session 1 — `klynx-api` hub: writes plan + contract, ships BE1, drives review.
- Session 2 — `gateway-api`: consumes contract, ships BE2 (events / device_management).
- Session 3 — `klynx-feature`: consumes contract, ships FE1.
- Session 4 — `gateway-portal`: consumes contract, ships FE2.

Each session is independent — own working tree, own §"Pre-task sync", own §"Branch flow" against its repo's `develop`.

**Order of work.**

1. `klynx-api`: plan + contract → Codex review → approved
2. `klynx-api`: BE1 implementation → batch on feature → merge develop → UAT
3. `gateway-api` (parallel from step 1 onward): consume contract, ship BE2 if affected
4. `klynx-feature` / `gateway-portal` (after BE contract is stable): ship FE
5. All sessions verify end-to-end on dev cluster before main rotation

Frontend MUST NOT start implementation before the contract is approved. Backend spokes MAY start in parallel with `klynx-api` once the contract draft is stable enough to consume.

**Sync mechanism (priority order).**

1. **Contract files** (canonical, async): spokes read `klynx-api/docs/contracts/<name>.md` directly. The contract is the source of truth. Any disagreement = open the contract, not a chat.
2. **Telegram bridge** (`@alizaLite_bot`, real-time): each session posts status / blocker / approval. Configured via `~/.claude/mcp.json` → `telegram` MCP server (env at `klynx-api/.env.telegram`, gitignored, perms 600). Tools: `send_message`, `get_updates`, `wait_for_reply`, `get_bot_info`. Use cases:
   - status: `klynx-api: PR #50 ready for UAT, contract §5.3 stable`
   - blocker: `gateway-api: contract field X type ambiguous, see PR comment`
   - approval handshake: hub asks "OK to ship batch?" → spokes ack

Telegram is for human-in-the-loop coordination and situational awareness. **Decisions still go through plan + contract artifacts**, not chat history. Telegram thread is not a decision log.

**When NOT to use multi-session.**

- Single-repo bug fixes / chores / refactors → one session, normal §"Branch flow"
- Plans with no cross-repo impact → one session, no contract authority issue
- Quick experiments → one session, throwaway branch

Multi-session pays off when 2+ repos need to ship coordinated changes within the same release rotation.

## Stack

- HTTP: Go Fiber
- DB: MongoDB (`internal/infra/mongo`)
- Cache: Redis
- MQ: Kafka
- Realtime: MQTT
- Storage: MinIO / S3 (`internal/infra/s3`)
- Auth: Keycloak
- Authz: Permify
- Tracing: OpenTelemetry
- Logging: zerolog
- Docs: Swagger (`swag`)

## Canonical Architecture

```text
HTTP:
router → middleware → controller → service
service → repo | gateways | messaging | configruntime

Async:
consumer/subscriber → extract trace → start span → service
service → repo | gateways | messaging | configruntime

Cross-cutting:
logger | traceutil | crypto/secretbox
```

All production flows must fit this model.

## Package Direction

```text
internal/
  infra/
    mongo/
    s3/
  repo/
    devicerepo/
    mediarepo/
    orgrepo/
    eventrefsrepo/      ← event index (Phase B+)
  gateways/
    gwgw/               ← gateway-api outbound adapter (Phase B+)
  services/
    eventsvc/           ← event list/detail service (Phase D+)
  controllers/
    eventapi/           ← events REST handlers (Phase D+)
```

Rules:
- `internal/infra/*` = low-level infra helpers/adapters
- `internal/repo/*` = domain repositories
- service must call repo/gateway/messaging, not infra helpers directly
- do not treat infra helpers as domain repos

## GW Integration Architecture

### DEPLOYMENT_PROFILE

`DEPLOYMENT_PROFILE` env var controls which integrations are wired at startup. Canonical values are defined in [docs/contracts/deploymentProfile.md](docs/contracts/deploymentProfile.md); do not branch on raw env strings — use `container.EffectiveProfile` from `config.ResolveDeploymentProfile` in [config/deploymentProfile.go](config/deploymentProfile.go).

#### Canonical values (3)

| Value | Plan authority | Intent |
|---|---|---|
| `appliance` | platform license | single-customer on-prem deployment; activation drives per-org subscription seed/upgrade/downgrade |
| `platform` | operator-controlled per-tenant subscription | operator/reseller deployment (e.g. Klynx, Phibek); activation does not touch subscriptions |
| `saas` | subscription via billing/self-service | public SaaS deployment; no license activation flow |

#### Deprecated aliases (accepted ≥ 1 release; emit warn at startup)

| Legacy value | Canonical value |
|---|---|
| `saasKlynx` | `platform` |
| `saasPhibek` | `platform` |
| `saasPublic` | `saas` |

> The legacy `enterprise` alias was removed when `enterprise` became a canonical
> `LicenseMode` value (see `models/licensemod/platformLicense.go`). Deployments
> still using `DEPLOYMENT_PROFILE=enterprise` must switch to `platform`; the
> value now resolves to unknown → defaults to `appliance` with a warn log.

`appliance` is canonical and not a legacy alias. Empty/unset defaults to `appliance`. Unknown values fall back to `appliance` with a warn log.

#### Canonical resolver usage

```go
// in main.go startup
rawProfile := os.Getenv("DEPLOYMENT_PROFILE")
effectiveProfile, resolveResult := config.ResolveDeploymentProfile(rawProfile)
container := appcontainer.NewContainer(rawProfile, effectiveProfile, resolveResult)

// downstream branching must read the resolved value, never the env:
switch container.EffectiveProfile {
case config.ProfileSaas:
    // register phibek webhook routes
default: // appliance | platform
    // wire gRPC provisioner + Kafka consumers + event_refs
}
```

Debug endpoint: `GET /admin/system/deploymentProfile` returns `{rawProfile, effectiveProfile, resolveResult}` (admin-role required).

### GW_API_URL

`GW_API_URL` env var is the base URL for gateway-api REST calls.

- read in `gwgw` package constructors
- if unset, constructors return `nil` with a warning log — callers must nil-check
- **never** hardcode a URL

### gwgw package

`internal/gateways/gwgw/` = outbound adapter for gateway-api.

| File | Client | Purpose |
|---|---|---|
| `deliveryTarget.go` | `DeliveryTargetClient` | register `mode=klynx` delivery target after workspace provisioning |
| `event.go` | `EventClient` | fetch full event detail from gw `GET /ingest/details/{eventId}` |

Rules:
- each client reads `GW_API_URL` in its constructor
- outbound requests must inject trace headers via `traceutil.InjectHeaders`
- in appliance mode, forward user's Bearer JWT + `X-Active-Org: {workspaceId}` to gw (same Keycloak realm)
- `mode=klynx` delivery target registration is idempotent — treat HTTP 200 (already exists) as success

### event_refs pattern

`event_refs` MongoDB collection is klynx's **lightweight index** for pagination.

Rules:
- `event_refs` contains only index fields: `eventId`, `orgId`, `workspaceId`, `deviceId`, `deviceName`, `eventType`, `sourceFamily`, `score`, `occurredAt`, `deliveryStatus`
- full event detail is **never** stored in klynx — always fetched from gw `GET /ingest/details/{eventId}`
- `ingestsvc.HandleNormalized` upserts to `event_refs` (not full event_details)
- `gwdeliverycons` updates `event_refs.deliveryStatus` from `gw.delivery.status.v1` Kafka topic

Indexes (managed in `eventrefsrepo/bootstrap.go`):
1. `{ orgId: 1, occurredAt: -1 }` — primary list query
2. `{ orgId: 1, eventId: 1 }` — unique constraint
3. `{ workspaceId: 1, occurredAt: -1 }` — workspace-scoped query

### EventDetailFetcher interface (gRPC migration path)

`eventsvc` holds an `EventDetailFetcher` interface:

```go
type EventDetailFetcher interface {
    GetEventDetail(ctx context.Context, orgId, eventId string) (*EventDetailDTO, error)
}
```

- current implementation: `gwgw.EventClient` — calls gw REST
- future implementation: gRPC client (when Phase C gw gRPC EventService is ready)
- swap implementation in container wiring — interface and service logic stay unchanged

### Optional setter pattern

Cross-cutting dependencies that are profile-dependent use **optional setter injection**:

```go
// On the service struct
type MyService struct {
    optionalDep SomeInterface  // nil-safe
}

func (s *MyService) SetSomeDep(d SomeInterface) { s.optionalDep = d }

// Usage inside service method
if s.optionalDep != nil {
    _ = s.optionalDep.DoSomething(ctx, ...)  // best-effort, non-fatal on error
}
```

Used by:
- `authzsvc.OrganizationService.SetDeliveryTargetRegistrar` — wired only for appliance/enterprise
- `ingestsvc.IngestService.SetEventRefsRepo` — wired unconditionally (event_refs always needed)
- pattern from existing: `SetWorkspaceProvisioner`, `SetOrgEventPublisher`

Rule: nil-check before calling; only inject in `main.go` after the profile branch check.

## Core Rules

### 1) Dependency direction

Allowed:

```text
router → middleware → controller → service
service → repo
service → gateways
service → messaging
service → configruntime
repo → infra
gateways → infra (only when needed internally)
```

Forbidden:

- controller → repo/gateways/messaging/infra
- router → service/repo/infra
- middleware → service/repo/infra
- service → infra directly
- repo → service/gateways/messaging
- gateways → repo/controller
- messaging → repo/controller
- service imports `fiber` / `net/http`

Only **service** may orchestrate multiple dependencies in one workflow.

### 2) Fiber boundary

`fiber.Ctx` is allowed only in:
- router
- middleware
- controller

Inner layers must use `context.Context` only.

### 3) Context contract

All public methods in service, repo, gateways, messaging, and request-scoped configruntime must accept `ctx context.Context` as the first argument.

Canonical pattern:

```go
func (s *DeviceService) Update(ctx context.Context, req UpdateDeviceRequest) error
```

### 4) HTTP boundary

#### router
- register routes
- attach middleware
- wire handlers

Router must declare allowed HTTP methods **before** the method-specific handler using `AllowMethods`:

```go
r.All("/path", middleware.AllowMethods("GET", "POST"))
r.Get("/path", controller.List)
r.Post("/path", controller.Create)
```

Do **not** use `r.All(path, middleware.AllowOnly(...), handler)` — separate the method guard from the handler.

Do **not** import or use `utils/traceutil` or `utils/httputil` in router files.

#### middleware
- validate JWT/cookie
- validate org context
- set `c.Locals(...)`
- attach trace/audit metadata
- reject invalid requests early

May call only security/boundary gateways needed for admission.

#### controller
- parse params/query/body
- validate request shape
- map DTO ↔ service input/output
- call service
- map service errors to HTTP response

Must not own workflow/business decisions or call repo/gateway/messaging/infra directly.

Controller must start a span at the top using `traceutil.StartLite` and write responses via `utils/httputil`:

```go
func MyHandler(c fiber.Ctx) error {
    ctx, end, log := traceutil.StartLite(c.Context(), "github.com/pointitconsulting/klynx-api/myapi", "myapi.MyHandler", "myapi", "MyHandler")
    defer end()
    // ...
    return httputil.Ok(c, data)
}
```

Use `traceutil.Start` when you need the `span` object directly (e.g. to record attributes). Prefer `StartLite` otherwise.

### 5) Service contract

Service owns:
- business rules
- workflow orchestration
- consistency decisions
- permission decisions
- retry/compensation policy
- mapping infra/integration failures to domain errors

Service must not:
- import Fiber
- write HTTP responses
- do raw DB / raw HTTP / raw Kafka / raw MQTT logic inline
- call `internal/infra/mongo` or `internal/infra/s3` directly

Service tracing pattern:

```go
func DoSomething(ctx context.Context, input Input) (*Result, error) {
    ctx, end, log := traceutil.StartLite(
        ctx,
        "github.com/pointitconsulting/klynx-api/mysvc",
        "mysvc.DoSomething",
        "mysvc", "DoSomething",
    )
    defer end()
    // log is already bound to traceId — use it for all logs in this scope
}
```

### 6) Repo contract

Repo is persistence only.

Rules:
- no business workflow
- no calls to service/gateway/messaging
- may use `internal/infra/mongo` internally
- regex queries must use `regexp.QuoteMeta()`
- indexes managed centrally
- timestamps crossing boundaries use RFC3339 UTC
- **MongoDB collection names use `snake_case`** — e.g. `media_stream_sessions`, `device_groups`; never `mediaStreamSessions` or `deviceGroups`

### 7) Gateway contract

`internal/gateways/*` = outbound integration adapters.

Allowed:
- HTTP/gRPC/SDK calls
- payload mapping
- wrapped integration errors
- trace propagation
- context-aware logging

Forbidden:
- domain workflow
- calling repo
- writing API responses

### 8) Messaging contract

Messaging is transport adapter only.

Allowed:
- publish/consume mechanics
- serialization boundary
- topic routing
- trace inject/extract
- transport-level retry/backoff

Forbidden:
- business workflow
- calling repo/controller
- deciding business policy

There must be exactly **one publish path per transport**:
- Kafka publish in Kafka adapter only
- MQTT publish in MQTT adapter only
- no duplicate publish helpers in `config`, `utils`, or services

Kafka consumer trace pattern:

```go
kafka.StartConsumerWithHeaders(broker, topic, groupID, func(msg MyEvent, headers map[string]string) error {
    // 1) restore parent span from producer headers
    parentCtx := traceutil.ExtractHeaders(context.Background(), headers)
    // 2) start child span — do NOT use otel.Tracer() directly
    ctx, end, log := traceutil.StartLite(parentCtx, "klynx.mycons", "topic.consume", "mycons", "handler")
    defer end()
    // log is bound to traceId; pass ctx to service
    return mysvc.Handle(ctx, msg)
})
```

### 9) Pragmatic DI rule

Full DI is **not required everywhere**.

Prioritize DI for important boundaries first:
- service → repo
- service → gateways
- service → messaging
- service → configruntime

Full DI is optional for:
- pure helpers
- mappers
- formatters
- validators without external dependencies

Migration rule:
- do not refactor the entire project at once
- new service code must not call infra helpers directly
- new flows must go through repo/gateway/messaging
- legacy package-style code can be migrated incrementally at hot spots

### 10) Domain ownership example

Choose repo by **data ownership**, not by caller package.

For camera lookup to get `rtspUrl`:
- owner = camera/device domain
- use `devicerepo`
- do **not** create it in `mediarepo`
- do **not** let `mapsvc` call mongo helper directly

Preferred repo methods:

```go
FindCameraForStream(ctx context.Context, orgId, cameraId string) (*devicemod.Camera, error)
```

or, if only a few fields are needed:

```go
GetRtspSource(ctx context.Context, orgId, cameraId string) (*CameraRtspSource, error)
```

Use the narrower method when the use case needs only stream source fields.

## Observability

### Logging

Request/message flow must use:

```go
logger.FromCtx(ctx, component, source)
```

Boot/static logger is for startup and non-request initialization only.

### Tracing

Trace must continue from entrypoint to final dependency call.

#### Tracing utilities (`utils/traceutil`)

| Function | Returns | Use when |
|---|---|---|
| `traceutil.StartLite` | `(ctx, end(), log)` | controller / webhook handler (preferred) |
| `traceutil.Start` | `(ctx, span, log)` | when span attributes/events must be set |
| `traceutil.StartScope` | `*Scope{Ctx,Span,Log}` | service methods that need timer or sub-scope |
| `traceutil.InjectHeaders` | — | inject trace into outbound Kafka/HTTP headers |
| `traceutil.ExtractHeaders` | `ctx` | extract trace from incoming Kafka/HTTP headers |
| `traceutil.DetachWithParent` | `ctx` | fire-and-forget goroutines (detach from request cancel) |

#### Full tracing loop

```text
controller  →  traceutil.StartLite / Start   →  span starts, log bound
    ↓ ctx passed down
service     →  logger.FromCtx(ctx, ...)       →  log carries traceId
    ↓ ctx passed down
repo        →  logger.FromCtx(ctx, ...)       →  log carries traceId
gateway     →  logger.FromCtx(ctx, ...)  +  traceutil.InjectHeaders   →  outbound trace
kafka pub   →  traceutil.InjectHeaders(ctx, headers)                  →  trace in header
kafka sub   →  traceutil.ExtractHeaders(parent, headers)              →  span restored
mqtt sub    →  traceutil.ExtractHeaders(parent, headers)              →  span restored
```

Rules:
- controller starts inbound span with `traceutil.StartLite` (or `Start` when span attributes needed)
- service starts its own child span with `traceutil.StartLite` — receives `ctx` from controller
- async consumer/subscriber: extract trace with `traceutil.ExtractHeaders`, then `traceutil.StartLite`
- pass same `ctx` downward — never create `context.Background()` inside a live request or service call
- Kafka/MQTT outbound must propagate trace via `traceutil.InjectHeaders`
- outbound HTTP gateways must inject trace headers via `traceutil.InjectHeaders`
- do **not** use `otel.Tracer(...).Start(...)` directly anywhere — always use `traceutil.StartLite` or `traceutil.Start`

### Correlation

`traceId` is mandatory.

Add domain IDs when useful:
- `eventId`
- `tenantId`
- `orgId`
- `camId`
- `deviceId`
- `topic`
- `sourceType` / `sourceFamily`

## Runtime / Security Contracts

### configruntime

`configruntime` is a read-only runtime dependency for service.

Rules:
- initialized once in container/bootstrap
- injected, not global
- may use TTL cache
- fault-tolerant on DB/config read failure
- not for secrets
- not a business layer
- not a persistence layer

### crypto/secretbox

All sensitive encryption/decryption must go through `internal/crypto/secretbox`.

Mandatory for:
- passwords
- API keys
- credentials
- secret tokens at rest

Failure to load crypto material at startup is fatal.

## API Contract

### Swagger documentation contract

Every controller handler **must** have a `swag` godoc block directly above the function.

Required fields:
- `@Summary` — short single-line label (≤ 10 words)
- `@Tags` — group name matching the router section (e.g. `Maps`, `Media`, `Devices`)
- `@Produce json`
- `@Success` — HTTP status matching the actual `httputil.*` call
- `@Failure 400 {object} gmod.ErrorResponse` — for validation errors
- `@Failure 401 {object} gmod.ErrorResponse` — for protected routes
- `@Failure 500 {object} gmod.ErrorResponse` — for server errors
- `@Router /path [method]`
- `@Security BearerAuth` — **only** on protected routes; omit for public routes

Optional fields:
- `@Description` — longer description when summary alone is not enough
- `@Accept json` / `@Accept multipart/form-data` — when body is expected
- `@Param` — one line per input param (path, query, body, formData)

#### `@Success` ↔ `httputil` mapping

| httputil call | Swagger annotation |
|---|---|
| `httputil.Ok(c, data)` | `@Success 200 {object} gmod.SuccessDataResponse` |
| `httputil.Ok(c, data, "msg")` | `@Success 200 {object} gmod.SuccessDataResponse` |
| `httputil.OkPaginated(c, details, pg)` | `@Success 200 {object} gmod.PaginationResponse` |
| `httputil.MessageOK(c, "msg")` | `@Success 200 {object} gmod.SuccessMessageResponse` |
| `httputil.Created(c, data, "msg")` | `@Success 201 {object} gmod.SuccessDataResponse` |
| `httputil.Accepted(c, data)` | `@Success 202 {object} gmod.SuccessDataResponse` |
| `httputil.NoContent(c)` | `@Success 204` |

#### Example godoc block

```go
// CreateFoo godoc
// @Summary      Create a new foo
// @Description  Creates a foo resource and returns the created document.
// @Tags         Foos
// @Accept       json
// @Produce      json
// @Param        body  body  CreateFooRequest  true  "Foo input"
// @Success      201   {object}  gmod.SuccessDataResponse
// @Failure      400   {object}  gmod.ErrorResponse
// @Failure      401   {object}  gmod.ErrorResponse
// @Failure      500   {object}  gmod.ErrorResponse
// @Router       /foos [post]
// @Security     BearerAuth
func CreateFoo(c fiber.Ctx) error {
```

Rules:
- HTTP status in `@Success` must match the actual `httputil.*` function used — do not write `@Success 200` when the code returns `httputil.Created`
- Public routes (no auth middleware) must **not** have `@Security BearerAuth`
- `@Tags` must match the router section name exactly (consistent casing)
- Do not annotate middleware-only functions or helper functions

### Protected route headers

```text
Authorization: Bearer <jwt>
X-Active-Org: <orgId>
```

### Common locals

Set by middleware:
- `userId`
- `tenantId`
- `activeOrg`
- `traceId`

Read locals only in middleware/controller boundary code.

### Standard success envelopes

**Single / detail response** (`httputil.Ok` with scalar or struct):
```json
{
  "code": "SUCCESS",
  "message": "...",
  "status": true,
  "details": {}
}
```

**Non-paginated collection response** (`httputil.Ok` with `fiber.Map{"items": ...}`):
```json
{
  "code": "SUCCESS",
  "message": "...",
  "status": true,
  "details": {
    "items": []
  }
}
```

**Paginated list response** (`httputil.OkPaginated`):
```json
{
  "code": "SUCCESS",
  "message": "...",
  "status": true,
  "details": {
    "items": [],
    "summary": { "totalOnline": 10, "totalOffline": 1 }
  },
  "pagination": {
    "page": 1,
    "perPage": 10,
    "totalRecords": 11,
    "totalPages": 2,
    "sortField": "createAt",
    "sortOrder": "desc"
  }
}
```

Rules:
- use `details`, not `detail`
- keep envelope stable
- **never return a bare array** as `details` — always wrap in `{ "items": [] }`
- paginated lists: `pagination` is top-level (not nested inside `details`)
- `summary` counts must reflect the full org/filter scope — not just the current page
- use `perPage` (singular) in `gmod.PageMeta` — not `perPages`
- do **not** use `gmod.SendPagination` or `gmod.SendPaginationOK` — use `httputil.OkPaginated`

### ID field convention

Public-facing response models must use `json:"id"` for the primary identifier.

- **Never** use `json:"camId"`, `json:"deviceId"`, or other domain-specific names as the ID field in a response DTO
- The internal `camId` UUID is the value; the JSON key exposed to clients is always `"id"`

Example:
```go
type PublicCameraItem struct {
    CamID string `json:"id"` // ✅ exposed as "id"
    ...
}
```

### Optional-auth route pattern

For endpoints that serve both anonymous and authenticated users:

**Router:**
```go
router.Get("/live/map", middleware.TryAuthBearer(), middleware.TryActiveOrg(), mapapi.PublicCameraMap)
```

**Controller:**
```go
orgId, _ := c.Locals("activeOrg").(string)
if orgId != "" {
    // authenticated — full org view
    items, err := svc.GetOrgMap(ctx, orgId)
    ...
    return httputil.Ok(c, fiber.Map{"items": items})
}
// anonymous — public-only view
items, err := svc.GetPublicMap(ctx)
...
return httputil.Ok(c, fiber.Map{"items": items})
```

- `TryAuthBearer()` — validates JWT if present, silently continues on failure (sets `userId`, `tenantId` locals)
- `TryActiveOrg()` — verifies Permify org membership if auth locals are set, silently continues on failure (sets `activeOrg` local only on success)
- Use `AuthBearer()` + `ActiveOrg()` (hard versions) for fully protected routes

### HTTP status contract

Default mapping:
- `200 OK` — GET, PATCH, PUT, DELETE success with body
- `201 Created` — POST create success
- `202 Accepted` — async job accepted
- `204 NoContent` — success with no response body
- `400 BadRequest` — validation / malformed input
- `401 Unauthorized` — missing or invalid auth
- `403 Forbidden` — authenticated but not allowed
- `404 NotFound` — resource not found
- `409 Conflict` — duplicate / state conflict
- `422 UnprocessableEntity` — syntactically valid but semantically invalid input, only if the API explicitly uses it
- `500 InternalServerError` — unexpected server error

Rule:
- do not return `200` for failures
- do not hide errors only in response body
- HTTP status and response body must agree

### Error contract

- service → sentinel/domain errors
- repo → wrapped storage errors
- gateways → wrapped integration errors
- messaging → wrapped transport errors
- controller → maps service errors to HTTP status + response code

Never leak raw internal/driver/SDK errors to API clients.

### Bulk CRUD contract

See `.claude/rule/code-style.md` → Bulk CRUD Contract for full rules.

Route structure per resource:
```text
CRUD:  GET / GET /:id / PATCH /:id / DELETE /:id
Bulk:  DELETE /bulk / PATCH /bulk / POST /bulk/approve
```

Rules:
- `DELETE/PATCH /bulk` for bulk CRUD
- body-based IDs (`ids`), batch max 100, partial success response
- `:id` param accepts both domain UUID and alternative key (e.g. hwId) — service resolves
- per-resource explicit patch payload with pointer fields
- delete = remove from org (soft), not hard delete for important resources

### Time rules

- use RFC3339 UTC across boundaries
- keep date/time field names consistent

## Package / File Rules

- every `.go` file must start with a path comment on line 1
- **file names use camelCase** — e.g. `publicMap.go`, `authStream.go`, `kmlUpload.go`; never `public_map.go` or `auth_stream.go`
- **URL path segments use camelCase** — e.g. `/onboardingLink`, `/:id/renewMaintenance`; never `/onboarding-link` (kebab-case) or `/renew_maintenance` (snake_case). Swagger `@Router` must match the registered path exactly. See `.claude/rule/code-style.md` → URL Path Rules.
- keep packages cohesive
- avoid dumping unrelated helpers into vague `utils` / `common`
- choose one transport package layout and keep it consistent

Example:

```go
// controllers/mapapi/publicMap.go
package mapapi
```

## Startup Order

```text
logger.Init()
→ InitMongo()
→ InitRedis()
→ InitKafka()
→ InitOtel()
→ InitSecretboxKeyring()
→ app.NewContainer()
→ start consumers/subscribers
→ router.Init()
→ app.Listen()
```

Infra must be ready before container wiring and before serving/consuming starts.

## References

Read before implementing:
- `.claude/rule/code-style.md`
- `.claude/rule/security.md`
- `.claude/rule/test.md`

Master roadmap and archived phase plans:
- `docs/plan/platform-roadmap.md` — living master roadmap (single source for in-flight + pending work)
- `docs/plan/done/gw-integration-plan.md` — archived; full gw integration phases (A–E)
- `docs/plan/done/phase-b-align-review.md` — archived; architectural decisions locked before Phase B (now codified in §GW Integration Architecture above)
- `docs/plan/done/phase-d-events-query-plan.md` — archived; events query API (REST shipped; gRPC swap = Q3)
- `docs/plan/done/phase-e-device-sync-plan.md` — archived; device sync (klynx side shipped)

## Final Rule

If code works but violates these contracts, refactor it before building more on top.
