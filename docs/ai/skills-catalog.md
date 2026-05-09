# Klynx Agent Skills Catalog

Klynx uses small repo-local skills instead of importing a large external skill library wholesale. External skill repositories are useful references, but Klynx-specific ownership, contract, rollout, and validation rules remain canonical here.

## Core Klynx Skills

| Skill | Use When |
|---|---|
| `klynx-contract-authoring` | Creating or revising `docs/plan` and `docs/contracts` for cross-repo/API/event/sync/cache work. |
| `klynx-architecture-review` | Codex review gate for ownership, SoR, contract drift, rollout risk, and validation readiness. |
| `klynx-fe-contract-consumer` | FE work consuming backend contracts from `klynx-api/docs/contracts` or `openapi`. |
| `klynx-cross-repo-rollout` | Work spanning `klynx-api`, `gateway-api`, `klynx`, or `gateway-portal`. |
| `klynx-graphify-discovery` | Optional architecture graph discovery with Graphify. |
| `klynx-backend-implementation` | Backend implementation after an approved plan/contract. |
| `klynx-frontend-implementation` | FE implementation after a stable backend contract. |
| `klynx-security-review` | Auth, permission, secret, token, webhook, sync, and tenant-boundary review. |
| `klynx-qa-validation` | Test/smoke checklist design and validation reporting. |
| `klynx-devops-release` | Jenkins/ArgoCD/env/version/changelog/release-rotation checks. |

## External Skills To Borrow From

Good external references from `alirezarezvani/claude-skills`:

- `senior-architect`
- `senior-backend`
- `senior-frontend`
- `code-reviewer`
- `senior-qa`
- `playwright-pro`
- `senior-security`
- `senior-devops`
- `self-improving-agent`

Borrow patterns and checklists only. Do not replace Klynx rules with external defaults.
