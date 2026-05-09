# `docs/contracts/` — Cross-Repo / Cross-Service Integration Contracts

This directory holds the **shared integration contracts** for the platform. Anything published here is consumed by other repos — `klynx-feature` (FE), `gateway-api` (BE peer), `gateway-portal` (FE peer), 3rd-party integrators — and is treated as the source of truth for that integration.

## What a contract here is — and is not

A contract here is **not** a Swagger / OpenAPI dump. OpenAPI is *one slice* of one kind of contract (the REST schema). A contract here is the full cross-repo agreement, which can include any combination of:

- REST endpoint shape (request, response, error, headers, auth)
- OpenAPI reference for the REST schema (when large or codegen-driven — store the YAML in [`openapi/`](../../openapi/) and link from the contract)
- Kafka topic schema, partition key, ordering, idempotency, replay
- MQTT topic pattern, payload, QoS, retain, ACL, reconnect/resubscribe rules
- Redis key pattern, value shape, owner/writer, TTL, invalidation triggers, stale-read behavior
- Sync rules — write authority, field ownership, projection store, conflict resolution
- Cache invalidation hooks across the flow
- Rollout / compatibility window for deploys that span multiple repos

If a behavior is observable across repo boundaries, it belongs in a contract here. If it is private to one service, it does not.

## Group by domain or flow — not by surface

The default unit of grouping is **one contract per domain or per flow**, not one contract per endpoint or per topic.

A "domain or flow" means: a set of surfaces that share a lifecycle, a write authority, or an invalidation trigger — anything a reader has to read **together** to understand the behavior.

### Examples of good grouping

| File | Why it is one file |
|---|---|
| `docs/contracts/device-camera-sync.md` | Device + camera identity / sync state spans REST CRUD + Kafka events + sync rules. Splitting them hides write-authority and ordering. |
| `docs/contracts/events-normalized-v1.md` | Normalized event delivery is a single Kafka contract (topic + envelope + projection store + replay). |
| `docs/contracts/media-access-control.md` | Media access policy is REST + permission rules + cache invalidation in one lifecycle. |
| `docs/contracts/aliza-bot-backend.md` | Aliza bot REST API + state machine + Telegram delivery is one bounded flow. |
| `docs/contracts/gateway-klynx-realtime.md` | Realtime data delivery from gateway-api → klynx-api → FE is REST snapshot + MQTT push + Redis presence + reconnect rule. They must live together to stay consistent. |

### When to split into separate contracts

Split when the surfaces belong to **different domains** or to **flows that can change independently** — e.g. permission policy can change without changing event delivery, so they are siblings, not sub-sections.

### Anti-pattern — per-endpoint or per-topic micro-contracts

Do **not** create `cameraListEndpoint.md`, `cameraDetailEndpoint.md`, `cameraStatusKafkaTopic.md` as three separate files when they are three views of the same camera lifecycle. Fragmented contracts let drift accumulate between surfaces that must stay consistent.

Heuristic: **if a reader has to open more than one contract to understand a single user-facing flow, the split was wrong.** Merge.

## REST schema in OpenAPI vs in the contract

For small or stable REST surfaces, the field tables inside the contract are sufficient.

For large REST surfaces that benefit from machine-readable codegen, mirror the schema under [`openapi/<name>.yaml`](../../openapi/) and **link to it** from the contract's `§5. REST Surfaces` section. The contract still owns the cross-repo behavior, ownership, and async surfaces — only the REST field shapes are offloaded.

Do not duplicate field tables across the contract and the YAML. Pick one home per field and link.

## Frontend rule (and 3rd-party integrators)

Frontend repos consume contracts from this directory. They must:

- treat the contract file in `klynx-api/docs/contracts/` (and the linked `openapi/*.yaml`, when present) as the source of truth
- cite the exact contract file and section in their FE plan / PR description
- not infer schema, error codes, MQTT topics, Redis-visible behavior, or sync rules from backend code, network captures, or screenshots
- not invent a request / response / error / event / cache / MQTT shape that the contract does not list
- not duplicate the contract in their own repo when consuming it exactly — link to it instead

If a frontend (or a 3rd-party) needs a behavior the contract does not cover, the workflow is:

1. Stop FE implementation.
2. Request a backend contract update.
3. Wait until the contract is approved.
4. Resume FE implementation against the updated contract.

This applies in particular to MQTT topics, Redis-visible behavior, realtime / event subscriptions, permission rules, auth flow, and any device / camera sync behavior — these are the surfaces where guesswork fails silently and corrupts state.

## Authoring a new contract

1. Copy `TEMPLATE.md` to `<your-domain-or-flow-name>.md`.
2. Fill in `§0 Domain / Flow Boundary` first — included surfaces, excluded surfaces, related contracts. If you cannot list these in one short table, the scope is wrong.
3. Pick `Contract Type` from: `REST | OpenAPI | Kafka | MQTT | Redis | Sync | Cache | REST + Kafka | REST + MQTT | REST + Redis | REST + Kafka + Redis | Full Flow`.
4. Use only the surface sections (§5–§9) that apply. Mark unused sections `N/A` with a one-line reason.
5. Link the contract from `docs/plan/<name>.md` and from `docs/plan/platform-roadmap.md` when shipping.
6. Do **not** move the contract to a `done/` subfolder when the plan ships — contracts stay flat in `docs/contracts/` because they remain the live source of truth for FE / 3rd-party / future maintenance. Only mark a contract `**Status:** Superseded by <new>` when it is genuinely retired.

## See also

- [`TEMPLATE.md`](./TEMPLATE.md) — the canonical contract skeleton
- [`../plan/TEMPLATE.md`](../plan/TEMPLATE.md) — the matching plan skeleton
- [`../plan/platform-roadmap.md`](../plan/platform-roadmap.md) — living master roadmap that links plans + contracts + shipped versions
- [`../../openapi/`](../../openapi/) — formal REST schemas, referenced from contracts when present
