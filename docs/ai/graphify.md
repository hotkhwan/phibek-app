# Graphify for Klynx

Graphify is an optional architecture-discovery helper. It is not a decision log and does not replace `AGENTS.md`, `CLAUDE.md`, `docs/plan/`, `docs/contracts/`, or `openapi/`.

## Install

Preferred team install:

```sh
scripts/install-graphify.sh
```

The installer uses:

1. `uv tool install graphifyy` when `uv` exists.
2. `pipx install graphifyy` when `pipx` exists.
3. A persistent venv at `$HOME/.local/share/klynx-tools/graphify` as fallback.

It creates a stable wrapper:

```sh
$HOME/.local/bin/klynx-graphify
```

On this machine, Graphify is installed at:

```sh
/home/klynx/.local/share/klynx-tools/graphify/bin/graphify
/home/klynx/.local/bin/klynx-graphify
/usr/local/bin/klynx-graphify
```

## Usage

Use narrow corpora first:

```sh
klynx-graphify update .
```

Then ask focused questions:

```sh
klynx-graphify query "device camera sync flow"
klynx-graphify query "Kafka producer consumer mapping"
klynx-graphify query "permission profile camera grants"
```

If `$HOME/.local/bin` is not on PATH, call the wrapper directly:

```sh
/usr/local/bin/klynx-graphify update .
/home/klynx/.local/bin/klynx-graphify update .
/usr/local/bin/klynx-graphify query "device camera sync flow"
/home/klynx/.local/bin/klynx-graphify query "device camera sync flow"
```

## When To Use

Graphify is not a daily required step. Use it when the task needs relationship discovery:

- auditing old contracts to see which files should merge by domain or flow
- finding cross-repo or cross-surface impact before a plan is written
- tracing event, sync, permission, camera, MQTT, Redis, or Kafka relationships
- asking which contracts or plans are related to a feature or bug

Skip Graphify for small bug reports, narrow doc edits, simple PR reviews, and FE follow-ups where the backend contract is already clear.

Useful contract-audit prompts:

```sh
klynx-graphify query "camera sync flow"
klynx-graphify query "which contracts mention Redis TTL"
klynx-graphify query "Kafka producer consumer mapping"
klynx-graphify query "which contract files should be merged by domain or flow"
```

## Klynx Rules

- Keep `.graphifyignore` updated before scanning new sensitive paths.
- Do not run `graphify claude install` or `graphify codex install` without a team decision; those commands can edit `CLAUDE.md`, `AGENTS.md`, and hooks.
- Treat `EXTRACTED` edges as source-backed but still verify important architecture claims.
- Treat `INFERRED` edges as hypotheses.
- Treat `AMBIGUOUS` edges as plan/contract clarification questions.
- Never update contracts from graph output alone; confirm against code or canonical docs.
