# Klynx Commands Cheat Sheet

Common commands for Klynx workflow, local tooling, Graphify, Aliza bot, git flow, and validation.

Do not paste secrets into this file. `.env.telegram`, `.mcp.json`, certs, keys, and local settings stay gitignored.

## Graphify

Install or refresh the persistent team wrapper:

```sh
scripts/install-graphify.sh
```

Build/update the graph:

```sh
klynx-graphify update .
```

If the wrapper is not on PATH:

```sh
/usr/local/bin/klynx-graphify update .
/home/klynx/.local/bin/klynx-graphify update .
```

Useful queries:

```sh
klynx-graphify query "camera sync flow"
klynx-graphify query "which contracts mention Redis TTL"
klynx-graphify query "Kafka producer consumer mapping"
klynx-graphify query "which contract files should be merged by domain or flow"
klynx-graphify query "permission profile camera grants"
```

Check hook status:

```sh
klynx-graphify hook status
```

Klynx default: do not install Graphify hooks unless the team decides to. Use explicit `update` and `query` commands.

## Aliza Bot

Setup / refresh dependencies:

```sh
bash tools/aliza-bot/setup.sh
```

Run daemon in foreground for testing:

```sh
ALIZA_REPO_ROOT=$(pwd) tools/aliza-bot/venv/bin/python tools/aliza-bot/daemon.py
```

Run daemon in background manually:

```sh
nohup tools/aliza-bot/venv/bin/python tools/aliza-bot/daemon.py > /tmp/aliza-daemon.log 2>&1 &
echo $! > /tmp/aliza-daemon.pid
```

Install and start the systemd user service:

```sh
mkdir -p ~/.config/systemd/user
sed "s|@REPO@|$(pwd)|g" tools/aliza-bot/systemd/aliza-daemon.service > ~/.config/systemd/user/aliza-daemon.service
systemctl --user daemon-reload
systemctl --user enable --now aliza-daemon
systemctl --user status aliza-daemon
```

Live logs:

```sh
journalctl --user -u aliza-daemon -f
```

Restart / stop / start:

```sh
systemctl --user restart aliza-daemon
systemctl --user stop aliza-daemon
systemctl --user start aliza-daemon
```

Recent logs:

```sh
journalctl --user -u aliza-daemon --since "30 seconds ago" --no-pager
```

Optional keep-running-after-logout:

```sh
sudo loginctl enable-linger $(whoami)
```

Run tests:

```sh
tools/aliza-bot/venv/bin/python tools/aliza-bot/test_daemon.py
tools/aliza-bot/venv/bin/python -m pytest tools/aliza-bot
```

Run preflight probes:

```sh
bash tools/aliza-bot/preflight/probes/run-all.sh
bash tools/aliza-bot/preflight/probes/run-followup.sh
```

Inspect bug queue:

```sh
cat ~/.config/aliza-bot/bug-queue.json
jq '.bugs[] | select(.status=="done") | .id' ~/.config/aliza-bot/bug-queue.json
```

Common Telegram commands:

```text
/help
/info
/updates
/prs
/develop
/version
/ping
/status
/forget
/bugs
/approve <id> @<repo> [note]
/reject <id> [reason]
```

Free-form Telegram dispatch examples:

```text
@klynx-api explain how device sync handles offline
@klynx-api review plan docs/plan/<name>.md
@klynx-api implement approved plan docs/plan/<name>.md
```

Do not send secrets, tokens, passwords, customer data, or private keys through Telegram.

## Git Flow

Pre-task sync from `develop` into `feature`:

```sh
git fetch origin
git checkout feature
git merge --ff-only origin/develop || git merge origin/develop
git push origin feature
```

Open PR to develop:

```sh
gh pr create --base develop --head feature --title "<scope>: <plan-name>" --body "<summary>"
```

View PRs:

```sh
gh pr list
gh pr view <number>
gh pr diff <number>
```

Release rotation PR:

```sh
gh pr create --base main --head develop --title "release: develop to main" --body "<batch summary>"
```

Rules:

- Do not push directly to `develop` or `main`.
- Jenkins commits on `develop` are CI artifacts; sync them back before the next PR.
- Cross-repo work needs one PR per repo, each citing the canonical contract.

## Backend Validation

Standard build/test:

```sh
go build ./...
go test ./...
```

Focused tests:

```sh
go test ./internal/services/<package>
go test ./controllers/<package>
go test ./tests/... -tags=integration
```

Race test when risk justifies it:

```sh
go test -race ./...
```

Pre-commit hook script:

```sh
scripts/hooks/pre-commit
```

Infra import check:

```sh
scripts/check-infra-imports.sh
```

## Deploy / Runtime Helpers

Feature pod deploy helper:

```sh
scripts/deploy-feature.sh
```

Kubernetes quick checks vary by namespace/pod; use the script when possible instead of ad hoc deploy commands.

## Docs / Contract Workflow

Check changed/new contracts:

```sh
scripts/check-contracts.sh
scripts/check-contracts.sh docs/contracts/<name>.md
```

Start a cross-repo plan:

```text
Use .codex/prompts/start-cross-repo-plan.md
```

Review a plan:

```text
Use .codex/prompts/review-plan.md
```

Revise a plan:

```text
Use .codex/prompts/revise-plan.md
```

Implement an approved plan:

```text
Use .codex/prompts/implement-approved-plan.md
```

Key files:

```text
docs/plan/TEMPLATE.md
docs/contracts/TEMPLATE.md
docs/contracts/README.md
docs/ai/project-memory.md
docs/ai/commands.md
docs/ai/skills-catalog.md
docs/ai/graphify.md
```

## Quick Safety Checks

Check what is about to be tracked:

```sh
git status --short
git ls-files --others --exclude-standard
```

Check ignored files:

```sh
git check-ignore -v <path>
```

Secret-ish sweep for new docs/skills:

```sh
rg -n "(token|password|secret|api[_-]?key|TELEGRAM|bearer|BEGIN.*PRIVATE)" docs/ai .codex/skills .claude/skills
```
