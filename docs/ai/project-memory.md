# Klynx Project Memory

Use this as short-lived agent memory for Klynx planning, review, and cross-repo work. Canonical decisions still belong in `docs/plan/`, `docs/contracts/`, `openapi/`, `AGENTS.md`, and `CLAUDE.md`.

## Architecture Defaults

- Feature owner backend defaults to `klynx-api`.
- Events canonical system of record is `gateway-api`.
- Normalized event topic is `gw.events.normalized.v1`.
- Event producer is `gateway-api`; event consumer is `klynx-api`.
- Klynx event projection store is `klynx-api/event_refs`.
- Device/camera identity and sync state source of truth is `gateway-api/device_management`.
- `klynx/camera` is a projection and consumer model for Klynx workflows.

## Contract Rules

- `docs/contracts/` contains cross-repo/service integration contracts, not only REST docs.
- OpenAPI/Swagger is the REST subset and may be linked from a broader domain/flow contract.
- Contracts may cover REST, Kafka, MQTT, Redis, cache, sync, field ownership, rollout, compatibility, and validation.
- Prefer grouping contracts by domain or flow when surfaces share one lifecycle.
- Do not split a flow into many contract files if consumers must read all of them to understand behavior.
- Authoring guidance: `docs/contracts/README.md` (grouping rule, FE consumption rule, when to offload to `openapi/<name>.yaml`).
- Contract consolidation work is archived in `docs/plan/done/contract-grouping-audit.md`; remaining follow-ups should be opened as focused plan files instead of reopening the audit.

## Hub-and-Spoke Contract Authority

- **Hub (canonical for cross-repo / cross-service flows):** `klynx-api/docs/contracts/<name>.md`. Grouping rule lives in `klynx-api/docs/contracts/README.md`.
- **`gateway-api` SoR:** events canonical detail and `device_management` identity / sync state. Hub contracts that touch these domains reference `gateway-api` as the canonical writer.
- **`gateway-api/docs/contracts/` (reserved):** the directory exists with a README explaining when a contract belongs there (gateway-api-owned cross-repo flows that have no klynx-api hub equivalent). Authors must reuse `klynx-api/docs/contracts/TEMPLATE.md` as the skeleton and follow the same domain-or-flow grouping rule.
- **`gateway-api/docs/swagger.yaml`:** REST schema subset only — generated from `swag` annotations; not the full contract.
- Spoke repos: `gateway-api`, `klynx-feature`, `gateway-portal`. Each has its own AGENTS.md / CLAUDE.md aligned to this model (PRs: gateway-api#17, gateway-portal#15, klynx-feature local).

## Frontend Rules

- FE consumes contracts from `klynx-api/docs/contracts/<name>.md` (canonical hub) and, when linked from the `.md`, `klynx-api/openapi/<name>.yaml` (REST subset).
- FE consuming `gateway-api` directly (e.g. `gateway-portal`) reads `gateway-api/docs/swagger.yaml` and any `gateway-api/docs/contracts/<name>.md` that exists.
- FE plan / PR description must cite the exact contract file AND section (e.g. `§7.1`), not just "see contract" or "see swagger".
- FE must not invent any schema across REST / Kafka / MQTT / Redis-visible / cache / sync / auth / permission. Network traces, screenshots, and BE source code are not contracts.
- If FE needs behavior not documented in the backend contract, update the shared contract first.

## Workflow Helpers

- Use Klynx skills for repeatable plan/contract/review/rollout flows.
- Use graphify only as discovery support; verify inferred or ambiguous graph edges against source before changing contracts.
- Use graphify for contract audits, cross-repo impact discovery, event/sync/permission/camera relationship tracing, and "which contracts are related" questions; skip it for routine small bugs or clear FE follow-ups.
- Common workflow commands are collected in `docs/ai/commands.md` so operators and agents do not have to rediscover Aliza, Graphify, git flow, validation, and PR commands.
- Aliza bot requests should stay very fast: use the plan/contract rules to avoid drift, but do not turn small bug/feature work into ceremony. If a fix can ship in 1-5 minutes, do that; deliver the cohesive slice, validate, and file only real follow-ups.
