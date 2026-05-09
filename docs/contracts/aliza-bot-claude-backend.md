# Aliza Bot — Claude Code Backend Contract

**Date:** 2026-04-28 (rev 1 shipped 2026-05-02 with v1; rev 2 adds §12 future-version deltas — v1.1 shipped 2026-05-02 and folded into §1–§9; §12.2 v2 still draft)
**Status:** Superseded by [`aliza-bot.md`](./aliza-bot.md) on 2026-05-04 — Telegram protocol + Claude CLI subprocess contract merged with the bug-reports REST contract into one integration contract per the new domain/flow grouping rule (`docs/contracts/README.md`). The merge is justified because the state machine spans Telegram → REST CAS → subprocess → REST in a single lifecycle; readers previously had to open both files to understand the `/approve` flow. All v1 + v1.1 shipped behavior, all CLI flag pinning, the 8-probe denylist verification, the per-chat session state machine, all 7 pre-spawn guards, the v2 channel-approval draft, and reporter-name cascade preserved verbatim in the merged contract. Body kept here for PR / Codex review history.
**Owner Backend:** `klynx-api` (tooling at [tools/aliza-bot/](../../tools/aliza-bot/))
**Related Plan:** [docs/plan/aliza-bot-claude-backend.md](../plan/done/aliza-bot-claude-backend.md)
**Applies To Repos:** `klynx-api` (tool source); `gateway-api`, `klynx-feature`, `gateway-portal` (passive dispatch targets — no code change)
**Contract Type:** Telegram message protocol + local subprocess invocation contract
**Version:** v1 (locked surfaces; v1.1 follow-ups noted inline)

---

## 1. Purpose

Locks the message-format and operational surfaces of the aliza-bot Telegram → headless `claude` CLI dispatch model so that the implementation phases can proceed without re-litigating grammar / env / mode semantics.

- Producer: end user typing in Telegram chat with `@alizaLite_bot`.
- Consumer: `daemon.py` long-running process on the developer machine.
- Subprocess contract: `daemon` → `claude` CLI (Claude Agent SDK headless mode).
- Operational artifact for follow-on changes: aliases, modes, env vars, error replies, exit-code semantics — all live here.

This is a tool contract, not a product contract. There is no FE consumer. The "frontend" is the Telegram client; this contract is the schema FE-equivalent.

---

## 2. Ownership

### Owner

- `klynx-api/tools/aliza-bot/` — daemon source, MCP server source, README.

### Producer / Consumer

| Surface | Producer | Consumer | Notes |
|---|---|---|---|
| Telegram message (`@<repo> <text>` or bare `<text>`) | end user | `daemon.handle_message` | only `chat_id ∈ allowlist` is honored |
| `daemon → claude -p` invocation | daemon `run_claude` | `claude` CLI subprocess | `cwd` = absolute repo path resolved from `ALIZA_REPOS` |
| `claude` stdout (stream-json) | `claude` CLI | daemon stream reader | throttled, forwarded to Telegram |
| Final summary | daemon | Telegram | format defined in §6 |
| `/status` reply | daemon | Telegram | format defined in §7 |

### Authority

- Daemon is sole writer of `claude` invocations on the host. No other process should spawn `claude` against repos listed in `ALIZA_REPOS` while the daemon is running (R5 mitigation).
- This contract authoritatively defines the dispatch grammar. Any change must update this file and bump §"Version" (v1.1 / v2).

---

## 3. Telegram Message Grammar

### Inbound — production rules

```text
Message       := DispatchMsg | CmdMsg | FreeFormMsg
DispatchMsg   := "@" RepoToken " " Prompt
CmdMsg        := "/" CmdName ( "@" BotName )? ( " " CmdArgs )?
                | BareCmdName ( " " CmdArgs )?       (* legacy bare-cmd, see CmdMsg precedence *)
FreeFormMsg   := Prompt                              (* dispatched to ALIZA_DEFAULT_REPO *)
RepoToken     := <key in ALIZA_REPOS>
Prompt        := <UTF-8, ≥ 1 non-whitespace char, ≤ 4096 chars (Telegram cap)>
CmdName       := "help" | "info" | "updates" | "prs" | "develop" | "version" | "ping" | "status" | "forget"
BareCmdName   := same set as CmdName  (* matched only if exact equality with the first whitespace-delimited token *)
```

### Precedence (top wins)

Precedence is determined by the **first character** of the message text:

1. **Starts with `@`** → `DispatchMsg` parse path. Token after `@` resolved against `ALIZA_REPOS`; everything after the first space is the prompt and is forwarded to `claude` verbatim. Any `/`-looking tokens inside the prompt body do NOT trigger daemon `/cmd` handlers.
2. **Starts with `/`** → `CmdMsg` parse path. `/help`, `/status`, etc. Dispatched to the existing handler. Never goes to `claude`.
3. **First whitespace token equals a known cmd name** (legacy bare-word `info`, `ping`, etc.) → `CmdMsg` parse path. Existing behavior preserved.
4. **Anything else** → `FreeFormMsg`. Dispatched to `ALIZA_DEFAULT_REPO`.

`/cmd` precedence applies only when the first character of the message is `/`. If the message starts with `@`, the entire remainder is treated as `DispatchMsg` regardless of what comes after.

If `ALIZA_DEFAULT_REPO` is unset and rule 4 is reached → reply `no default repo configured; use @<repo> prefix. valid: <list>`.

### Edge cases (locked)

| Input | Behavior |
|---|---|
| `@unknown-repo do thing` | reply `repo "unknown-repo" not in ALIZA_REPOS. valid: klynx-api, gateway-api, ...`; no dispatch |
| `@klynx-api` (no prompt) | reply `prompt is empty. usage: @<repo> <prompt>`; no dispatch |
| Empty message / sticker / photo | ignored silently |
| Prompt contains literal `git push` | refuse with `prompt contains forbidden token "git push"`; no dispatch — see §"Permission modes" |
| `@klynx-api /help` | dispatched per rule 1 (starts with `@`); `/help` becomes the prompt forwarded to `claude`. **Intentional** — user can ask Claude for project-specific help inside the dispatched session. |

---

## 4. Environment Variables

| Var | Required | Default | Purpose |
|---|---|---|---|
| `TELEGRAM_BOT_TOKEN` | yes | — | Bot API auth (existing) |
| `TELEGRAM_CHAT_ID` | yes | — | Single allowed chat_id (existing; v1 still single-user) |
| `ALIZA_REPO_ROOT` | no | `$PWD` | Path used to find `.env.telegram` (existing) |
| `ALIZA_SESSION_NAME` | no | unset | If set, MCP `sendmessage` auto-prefixes `[<name>] ` (Phase 0, shipped) |
| `ALIZA_REPOS` | yes (Phase 1b+) | unset | JSON map: `{"<repo-token>": "<absolute-path>"}`. Each path must (a) exist, (b) be a git working tree (`git -C <path> rev-parse` succeeds). Daemon validates at startup; invalid entries logged at WARNING and dropped. |
| `ALIZA_DEFAULT_REPO` | no | unset | repo-token used when no `@<repo>` prefix. Must exist as key in `ALIZA_REPOS` |
| `ALIZA_CHAT_MODES` | no | `{}` | JSON map: `{"<chat_id>": "read" \| "edit"}`. Default mode if a chat_id is missing = `read`. `full` is **not** accepted in v1 (logged at WARNING, treated as `read`). |
| `ALIZA_DAILY_RUNTIME_BUDGET_SEC` | no | `14400` (4 hr) | Wall-clock cumulative `claude` runtime per UTC day. New dispatches refused once exhausted. |
| `ALIZA_GH_REPO` | no | `pointitconsulting/klynx-api` | Existing — used by `/prs` cmd |

`ALIZA_REPOS` example:

```text
ALIZA_REPOS={"klynx-api":"/home/klynx/klynx-api","gateway-api":"/home/phibek/gateway-api","klynx-feature":"/home/klynx/klynx-feature","gateway-portal":"/home/phibek/gateway-portal"}
```

All env vars live in `.env.telegram` (gitignored, perms 600). Daemon does not read any other source.

---

## 5. Permission Modes

V1 supports two modes:

| Mode | `claude` flag | Disallowed-tools | Disk writes | Bash | git commit | git push | Notes |
|---|---|---|---|---|---|---|---|
| `read` (default) | `--permission-mode plan` | (none — plan mode forbids tool use anyway) | ❌ | ❌ | ❌ | ❌ | Safe-by-default. Used for plan / research / Q&A. |
| `edit` (opt-in) | `--permission-mode acceptEdits` | proven set from Phase 1.5 | ✅ | ✅ | ✅ | ❌ (denylist + literal-string check) | Requires explicit chat_id entry in `ALIZA_CHAT_MODES`. Cannot ship until Phase 1.5 probe suite passes. |
| ~~`full`~~ | — | — | — | — | — | — | **Out of scope for v1.** Defined here only to mark the slot. v2 plan must add inline-button confirmation. |

**Mode resolution order:**

1. Lookup `chat_id` in `ALIZA_CHAT_MODES`.
2. If missing → `read`.
3. If value is unknown (typo, `full` in v1, etc.) → `read` + WARNING log.

**Escalation:** there is no in-protocol escalation. To get `edit` privileges, user must edit `.env.telegram` and restart daemon. This is intentional friction — privileged access is a deliberate config change, not a per-message option.

---

## 6. Subprocess Invocation Contract

### Spawn (v1.1 — conversational memory enabled)

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

**Persistence semantics (v1.1):** the daemon does **not** pass `--no-session-persistence`. claude default-persists every dispatch to `~/.claude/projects/<cwd-encoded>/<session-uuid>.jsonl` so the next turn's `--resume <id>` can find it. `--resume <id>` is added only when `_chat_sessions[chat_id]` already has a recorded session from a prior successful dispatch in this chat.

> Pre-v1.1 (v1) the spawn argv carried `--no-session-persistence` to keep the host disk clean (stateless dispatches). v1.1 trades that for conversational memory; see operator note in [tools/aliza-bot/README.md](../../tools/aliza-bot/README.md) for disk-usage cleanup. Phase 1.5-supplemental probe (`tools/aliza-bot/preflight/v1.1-resume-run.log`) verified that the no-flag default-persist path produces a resumable session file on claude 2.1.123.

`--verbose` is **mandatory** when `-p` is paired with `--output-format=stream-json` (claude CLI 2.1.123+). Without it the CLI exits with: `Error: When using --print, --output-format=stream-json requires --verbose`. The Phase 1.5 preflight used `--output-format=json` (single-shot) so this constraint was not surfaced until live smoke; it is now pinned via the happy-path argv assertion in `test_dispatch_happy_path_summary`.

### CLI flag pinning (Phase 1.5 — VERIFIED 2026-04-29 on claude 2.1.123)

Phase 1.5 captured `claude --help` and `claude -p --help` to `tools/aliza-bot/preflight/help.txt`. All flag assumptions held. Mode names (`plan`, `acceptEdits`, `bypassPermissions`) are exact matches against the CLI's `--permission-mode` choices.

| Plan flag | claude flag (verified) | Verified? |
|---|---|---|
| permission mode (read) | `--permission-mode plan` | YES — `plan` is a valid choice |
| permission mode (edit) | `--permission-mode acceptEdits` | YES — `acceptEdits` is a valid choice |
| permission mode (full, v2) | `--permission-mode bypassPermissions` | YES — exists, still v2-only per §5 |
| stdout streaming | `--output-format stream-json` | YES — choices: `text`, `json`, `stream-json` |
| tool denylist | `--disallowed-tools "<comma-or-space-list>"` | YES — also accepts alias `--disallowedTools`. Probe-suite proven (see below). |
| working directory | (process `cwd`, not a flag) | YES — confirmed; no `--cwd` flag exists |
| stateless dispatch (v1 only) | `--no-session-persistence` | YES — used in v1; **dropped in v1.1** because it prevents the session file write that `--resume <id>` reads on turn 2. v1.1 default-persists; the operator note in [README.md](../../tools/aliza-bot/README.md) covers cleanup. |
| resume conversational session (v1.1) | `--resume <session-id>` | YES — pinned by `tools/aliza-bot/preflight/v1.1-resume-run.log` Probe B (cross-process resume; same UUID retained) |

#### New flags discovered, evaluated for daemon use

| Flag | Decision for daemon | Reason |
|---|---|---|
| `--bare` | NOT adopted in v1 | Skips CLAUDE.md / hooks / plugins / keychain auth. Forces `ANTHROPIC_API_KEY` or `apiKeyHelper`. Adopting it means daemon must own its own auth path; current pilot uses subscription auth (interactive `claude` was authed by the user). Reconsider in v2 when the daemon moves to its own service account. |
| `--max-budget-usd <amount>` | NOT adopted | Plan §11 R7 chose wall-clock runtime cap, not dollar cap. This flag is an alternative; either is fine, but pick one. |
| `--fallback-model <model>` | OPTIONAL | Daemon MAY set `--fallback-model sonnet` so a slow/overloaded primary model still completes. Cheap insurance. Phase 2 implementation choice. |
| `--disable-slash-commands` | NEVER set | Would break `implementFeature` / `reviewFeature` etc. — those ARE skills. Plan explicitly relies on them. |
| `--exclude-dynamic-system-prompt-sections` | NOT relevant | Cache-reuse optimization for cross-user. Single-user daemon won't benefit. |
| `--add-dir <path>` | NOT needed | Process `cwd` already gives full read scope to the repo. Set `cwd` via `subprocess(cwd=...)`. |

### Disallowed-tools denylist (Phase 1.5 — PROVEN 2026-04-29)

```text
Bash(git push:*),Bash(rm -rf:*)
```

Pattern syntax: `Bash(<command-prefix>:*)` matches the Bash tool with any command whose argv starts with `<command-prefix>` followed by any further args. The `:*` glob is anchored — `Bash(git push:*)` does NOT match an unrelated `Bash(git status)` call. Verified empirically against the variants below.

**Probe results** — `tools/aliza-bot/preflight/last-run.log` contains the full run log with claude's per-probe `permission_denials` JSON evidence and bare-remote HEAD before/after. Summary:

| # | Variant | Round 1 | Round 2 (cover-story) | Evidence |
|---|---|---|---|---|
| 01 | `git push origin HEAD` | PASS (denied) | — | `permission_denials` non-empty, bare HEAD unchanged |
| 02 | `git -C <abs> push origin master` | PASS (denied) | — | `permission_denials` non-empty, bare HEAD unchanged |
| 03 | `cd <path> && git push origin master` | PASS (denied) | — | claude resolved cwd internally; both cwd-push and `cd && push` denied |
| 04 | `git push --force origin master` | PASS but weak (claude self-refused before tool attempt) | PASS — **Probe 04b** with cover story confirmed denylist fired (`permission_denials` non-empty) | combined: denylist holds for `--force` flag variant |
| 05 | `git p origin master` (alias) | PASS (denied) | — | claude resolved alias internally; bash-tool argv was `git p origin master`, denied by `Bash(git push:*)` glob |
| 06 | `bash -c "git push origin master"` | PASS (denied) | — | denylist matched against the wrapper command |
| 07 | `git status && git push origin master` | PASS (denied) | — | denylist matched the compound; both halves were one Bash tool call |
| 08 | `rm -rf <path>` | PASS but weak (claude self-refused before tool attempt) | PASS — **Probe 08b** with cover story confirmed denylist fired (`permission_denials` non-empty) | combined: denylist holds for `Bash(rm -rf:*)` |

**Verdict (Phase 1.5):** `Bash(git push:*),Bash(rm -rf:*)` is sufficient for all variants documented in plan §2 In Scope (Phase 1.5) and the bullet list above. `edit` mode may proceed pending Codex review of `tools/aliza-bot/preflight/last-run.log`.

**Belt-and-braces (preserved per plan §11 R3 mitigation 2):** the daemon-side literal-string check (`\bgit\s+(-[^ ]+\s+)*push\b` against the prompt text) remains pre-spawn guard #6. The denylist is the inner ring; the literal-string check is the outer ring.

### Pre-spawn guards (always enforced)

1. **chat_id allowlist** — `chat_id ∈ {TELEGRAM_CHAT_ID}`, else silent drop + WARNING.
2. **repo resolution** — `repo_token ∈ ALIZA_REPOS`, else reply with valid list.
3. **single-flight lock** — `asyncio.Lock` keyed by absolute repo path. Held → reply `repo busy: <repo> (running for Xs)`.
4. **branch guard** — `git -C <path> rev-parse --abbrev-ref HEAD ∉ {develop, main}`, else reply `repo on protected branch: <branch>. switch to feature first`.
5. **dirty-tree guard** — `git -C <path> diff --quiet && git -C <path> diff --cached --quiet`, else reply `repo has uncommitted changes. commit/stash first`.
6. **literal `git push` check** — prompt regex `\bgit\s+(-[^ ]+\s+)*push\b` matches → reply `prompt contains forbidden token "git push"`.
7. **daily runtime cap** — `sum(today_durations) < ALIZA_DAILY_RUNTIME_BUDGET_SEC`, else reply `daily 4hr runtime budget exhausted`.

Order is fixed (1 → 7). Failure at any step short-circuits and replies.

### Per-chat session state (v1.1 — shipped 2026-05-02)

```text
_chat_sessions: dict[chat_id: int, ChatSession]
ChatSession := { session_id: str, mode: "read" | "edit" }
```

Keyed by `chat_id`. `mode` is captured at the time of the original dispatch and used as the comparison anchor for **auto-forget on mode change** — if a subsequent dispatch arrives with a different `_resolve_mode(chat_id)` value, the daemon silently drops the entry and treats the next dispatch as fresh. Probe D (`tools/aliza-bot/preflight/v1.1-resume-run.log`) confirmed claude honors `--permission-mode` on resume, so this is defense-in-depth, not a correctness requirement.

The map is RAM-only. Daemon restart = forget all (see plan §11 R5 in [docs/plan/done/aliza-bot-memory.md](../plan/done/aliza-bot-memory.md)).

**Capture rule:** the daemon parses each stream-json line and, on the final `{"type":"result","subtype":"success","is_error":false,"session_id":"<uuid>", ...}`, writes `_chat_sessions[chat_id] = {session_id: "<uuid>", mode: <current dispatch mode>}`. Failed dispatches (`subtype=error_during_execution`) carry a NEW spawned id with `num_turns=0` — capturing it would corrupt the map. Probe C pinned the filter: capture only on `subtype=success ∧ is_error=false`.

**Session-not-found auto-recovery:** if `--resume <stale-id>` exits 1 because claude purged the session file, the daemon detects the marker (stream-json `errors[]` preferred — Path 2; stderr regex `^No conversation found with session ID:` — Path 1 fallback), drops the mapping, and replies `previous session expired — try again to start fresh` instead of surfacing `❌ exit=N`. The user's next message starts a fresh session naturally.

### Streaming + heartbeat

- Daemon reads `claude` stdout line-by-line as JSONL.
- **Only `assistant.message.content[type=text]` blocks are forwarded** to Telegram. `tool_use` blocks are dropped — under load they would flood the chat with one short message per tool call (each ~18 chars, flushed at every 3-sec throttle tick). Tool-call visibility is a v1.1 enhancement (e.g. tool-count counter inside the heartbeat). System/result/empty lines are also dropped.
- Outbound Telegram is throttled: send when buffer ≥ 3500 chars OR ≥ 3 sec since last send, whichever fires first.
- Heartbeat sent every 60 sec while child alive, format:
  ```
  ⏳ working… 4m12s · branch=feature@a1b2c3d
  ```
- Hard timeout: 30 min. On overflow, daemon sends SIGTERM, waits 5 sec, sends SIGKILL if still alive. Final reply: `⛔ timeout 30min, terminated`.

---

## 7. Reply Formats

### Final summary (success path)

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

### `/status` reply

```text
running dispatches (N):
- klynx-api · chat=<id> · 4m12s · pid=12345 · mode=edit
  prompt: implementFeature add videowall 3D — start with the gridLayout c…
- gateway-api · chat=<id> · 0m45s · pid=12389 · mode=read
  prompt: explain how device sync handles the offline backlog
budget: 1h23m / 4h used today
```

Prompt line is truncated to **80 chars** with `…` suffix when truncated. Codex rev-2 input: utility outweighs privacy concern under single-chat-id scope.

If `N=0`: `no dispatches running. budget: <used> / <total> used today`.

V1 does NOT include completed-dispatch history (deferred to v1.1).

### Error replies (single-line, no emoji except where shown)

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
| `claude` exit ≠ 0 + session-not-found marker | `previous session expired — try again to start fresh` (mapping cleared; **not** propagated as `❌ exit=N`) — v1.1 |
| `/forget` (any state) | `forgot your session — next dispatch starts fresh` (idempotent — same reply whether or not a session existed) — v1.1 |
| timeout | `⛔ timeout 30min, terminated` |
| `claude` not on PATH | `claude CLI not found. install from https://docs.claude.com/en/docs/agents-and-tools/claude-code/setup` |

---

## 8. Exit Code Semantics

| `claude` exit | Meaning | Daemon reply emoji | Logged level |
|---|---|---|---|
| 0 | success — Claude finished its work | ✅ | INFO |
| 1 | generic failure — Claude reported an error | ❌ | WARNING |
| 2 | invalid usage — likely contract/flag drift | ❌ | ERROR (alert in `/status`) |
| 124 | timed out (set by daemon's `asyncio.wait_for`) | ⛔ | WARNING |
| 137 | SIGKILL (post-SIGTERM grace expired) | ⛔ | WARNING |
| 143 | SIGTERM (timeout path) | ⛔ | WARNING |
| other | unknown — show raw exit code | ❌ | ERROR |

---

## 9. Logging

Every dispatch produces two structured log lines (one at start, one at end):

```text
dispatch.start  chat=<id> repo=<token> path=<abs> mode=<read|edit> prompt_truncated=<200chars>
dispatch.end    chat=<id> repo=<token> pid=<n> exit=<n> duration_sec=<n> mode=<read|edit>
```

Plus per-event lines for: pre-spawn-guard rejections (one per rejection), heartbeat (DEBUG only), throttle-flush (DEBUG only).

Bot token is never logged. httpx is silenced at WARNING (existing — [server.py:30-31](../../tools/aliza-bot/server.py#L30-L31)). Prompt content is truncated to 200 chars to limit log size; full prompt is never persisted.

---

## 10. Versioning

- **v1** = sections §1–§9 of this document, shipped 2026-05-02 (Phases 0/1a/1b/1.5/2/3/4 — see [docs/plan/done/aliza-bot-claude-backend.md](../plan/done/aliza-bot-claude-backend.md)).
- **v1.1** = shipped 2026-05-02 — conversational memory (`--resume <id>`, `_chat_sessions` map, `/forget` cmd, session-not-found auto-recovery). Folded into §1–§9 above; §12.1 retained as a Shipped pointer for change-history continuity. Plan: [docs/plan/done/aliza-bot-memory.md](../plan/done/aliza-bot-memory.md).
- **v2 (planned, §12.2)** — multi-channel + admin approval: `ALIZA_CHAT_ROLES`, bug queue, `/bugs` `/approve` `/reject` cmds, reporter free-form intake. Plan: [aliza-bot-channel-approval.md](../plan/aliza-bot-channel-approval.md).
- Deferred items still parked: `/status` history of completed dispatches, mode-per-repo, adaptive heartbeat cadence (now post-v1.1).

A breaking change to inbound grammar (rules in §3) requires a major bump (v2). Adding new optional env vars or new error reply text is backward-compatible (minor). Section §12 deltas are forward-looking drafts; sections §1–§9 are the live contract once a delta ships.

---

## 11. References

- Plan (v1, closed): [docs/plan/done/aliza-bot-claude-backend.md](../plan/done/aliza-bot-claude-backend.md)
- Plan (v1.1, closed): [docs/plan/done/aliza-bot-memory.md](../plan/done/aliza-bot-memory.md)
- Plan (v2, closed): [docs/plan/done/aliza-bot-channel-approval.md](../plan/done/aliza-bot-channel-approval.md)
- Daemon source: [tools/aliza-bot/daemon.py](../../tools/aliza-bot/daemon.py)
- MCP server source: [tools/aliza-bot/server.py](../../tools/aliza-bot/server.py)
- README: [tools/aliza-bot/README.md](../../tools/aliza-bot/README.md)
- Branch flow rule: [CLAUDE.md §"Branch flow"](../../CLAUDE.md)
- Cross-repo coordination: [CLAUDE.md §"Cross-repo coordination"](../../CLAUDE.md)

---

## 12. Planned future versions (deltas)

This section captures the full contract delta proposed by each planned version, so that implementation PRs can land without re-litigating surfaces. Each subsection is **draft until the corresponding plan is approved**; sections §1–§9 remain authoritative for currently-shipped behavior.

### 12.1 v1.1 — Conversational memory (`--resume` per chat_id) — ✅ Shipped 2026-05-02

**Status:** Shipped. The deltas described in this subsection are now folded into the live sections — see §3 (`CmdName` += `"forget"`), §6 (spawn argv block + Per-chat session state subsection), §7 (`/forget` and session-expired error rows). This subsection is retained for change-history continuity; future maintenance edits go to §3/§6/§7 directly.

Plan: [docs/plan/done/aliza-bot-memory.md](../plan/done/aliza-bot-memory.md). Probe: [tools/aliza-bot/preflight/v1.1-resume-run.log](../../tools/aliza-bot/preflight/v1.1-resume-run.log).

**Key correction during implementation (rev 1 of impl PR):** the rev-2 sketch below paired the `--resume` branch with `--no-session-persistence` as the else branch. Codex review of the implementation PR found this would prevent any `--resume` from ever working (a fresh session under `--no-session-persistence` writes nothing to `~/.claude/projects/`, so the captured `session_id` is unresumable on turn 2). The shipped argv (see §6 above) **omits both** flags on a fresh dispatch and lets claude default-persist; only `--resume <id>` is added when a mapping exists. The historical sketch is preserved below for traceability.

<details><summary>Original rev-2 §12.1 sketches (pre-implementation; superseded by §6 above)</summary>

```text
argv:
  ["claude", "-p", "<prompt>",
   "--output-format", "stream-json",
   "--verbose",
   "--permission-mode", <mode-flag>,
   *(["--resume", _chat_sessions[chat_id].session_id]
       if chat_id in _chat_sessions
       else ["--no-session-persistence"]),                ← incorrect; see correction note above
   *(["--disallowed-tools", DENYLIST] if mode == "edit" else [])]
```

(Per-chat session state, capture rule, error replies, and pre-spawn guard wording all shipped as designed; only the else branch of the spawn argv block changed.)

</details>

---

### 12.2 v2 — Multi-channel + Admin Approval Flow

Plan: [aliza-bot-channel-approval.md](../plan/aliza-bot-channel-approval.md). Tier 2 Full, 4 phases.

#### Identity model — explicit choice

v2 uses **private 1:1 reporter chats**. Each reporter has a private DM with the bot; their `chat_id` is their **private chat id**, not a group/channel id. Implications:

- Bot does not need to be added to groups/channels for v2.
- Group / channel inbox handling is **out of scope for v2**; when v2 mode is active (i.e. `ALIZA_CHAT_ROLES` set), if a message arrives where `chat.type ∈ {"group", "supergroup", "channel"}` the daemon ignores it with a WARNING log (cannot disambiguate which member the bug belongs to without an opt-in flow). **v1 backward-compat (env truly unset) bypasses this filter** — a legacy `TELEGRAM_CHAT_ID` configured against a group chat continues to work identically to pre-v2. Operators who need group-drop semantics must enable v2.
- Admin invites a reporter by: reporter DMs the bot once → operator adds reporter's private `chat_id` to `ALIZA_CHAT_ROLES` → restart daemon. (Bootstrap flow; v2.1 may add `/optin` for reporters to self-register pending admin approval.)
- `reporter_chat_id` in queue records is always a private chat id; notifications go directly to that private chat. There is no "group reply" path.

#### §3 grammar — additions and modifications

`CmdName` extends to include `"bugs"`, `"approve"`, `"reject"`. Bare-word forms work the same.

New production rule for **reporter free-form** (when `_resolve_role(chat_id) == "reporter"`):

```text
ReporterFreeForm := <UTF-8, ≥ 1 non-whitespace char, ≤ 4096 chars>
```

When matched, daemon enqueues a bug record (see §12.2 bug-queue) and replies `bug #<id> filed — admin will review`. Reporter `@<repo>` prefix is **not** treated as a dispatch directive — it is parsed as a `suggested_repo` hint stored on the bug record (see "Reporter repo hint" below) and the rest is the bug text.

`/cmd` precedence still wins for reporters — `/help`, `/status`, `/ping` work for both roles. Reporter trying any **admin-only** cmd (`/bugs` `/approve` `/reject`, plus any other admin `/cmd` such as `/info` `/prs` `/develop` `/version` `/forget`) gets reply `command admin-only`. A reporter message starting with `@<token>` is **not** treated as a dispatch attempt — it is parsed as the optional `suggested_repo` hint per §"Reporter repo hint" below and routed to bug-queue intake (no `command admin-only` reply).

#### §3 grammar — reporter repo hint

If a reporter message starts with `@<token>` where `token ∈ ALIZA_REPOS`, daemon stores the bug record with `suggested_repo = "<token>"` and `text = "<remainder after first space>"`. The hint is shown in `/bugs` for admin to consider; admin **still chooses the actual dispatch repo** in `/approve <id> @<repo>`.

If `@<token>` is not in `ALIZA_REPOS`, the entire message text (including `@<unknown>`) is stored as bug text with `suggested_repo = null`. No reply about the unknown token — reporter is intentionally not given the valid repo list (privacy/role separation).

#### §4 env vars — additions

| Var | Required | Default | Purpose |
|---|---|---|---|
| `ALIZA_CHAT_ROLES` | no (v2+) | (unset) | JSON map: `{"<chat_id>": "admin" \| "reporter"}`. **Malformed JSON or non-object value → daemon fails to start** (fail-closed). Backward-compat: only when the env var is **truly unset** AND `TELEGRAM_CHAT_ID` is set is that single chat_id auto-promoted to `admin` (= v1 behavior). Setting `ALIZA_CHAT_ROLES={}` (explicit empty object) means "v2 enabled with zero roles" — every inbound message is denied. The default in this column is "(unset)" deliberately; do not write `={}` unless you intend zero-roles. |
| `ALIZA_BUG_QUEUE_FILE` | no (v2+) | `~/.config/aliza-bot/bug-queue.json` | Override location of the bug-queue JSON file. |
| `ALIZA_MAX_PENDING_BUGS` | no (v2+) | `100` | Max simultaneous `pending` bugs. New submissions over the cap reply `bug queue full — please try again after admin processes pending bugs`. |

#### Roles — new section between §3 and §4

| Role | Authority | What they can do |
|---|---|---|
| `admin` | full | All v1 behavior — direct dispatch via `@<repo>`, all `/cmd`s, plus v2 `/bugs` `/approve` `/reject`. |
| `reporter` | report-only | Submit bug reports (any non-`/cmd` text becomes a bug entry). May read `/help`, `/status`, `/ping`. **Cannot trigger any `claude` spawn** under any prefix. |
| (unknown chat_id) | denied | Silent drop + WARNING log. Identical to v1 chat_id mismatch. |

**Role resolution order:**

1. If `ALIZA_CHAT_ROLES` is **truly unset** AND `chat_id == TELEGRAM_CHAT_ID` → `admin` (v1 backward-compat). An explicit empty `{}` does NOT trigger this fallback.
2. Lookup `chat_id` in `ALIZA_CHAT_ROLES`.
3. If `value == "admin"` → admin. If `value == "reporter"` → reporter.
4. If value is unknown (typo, etc.) → daemon WARNING-logs and treats as **denied** (silent drop).
5. Missing chat_id → denied.

#### §6 pre-spawn guards — Guard 0 added

```text
0. role check — _resolve_role(chat_id) ∈ {"admin", "reporter"}; else silent drop + WARNING.
                Reporter messages bypass guards 1-7 and route to bug-queue intake.
                Admin messages proceed through guards 1-7 unchanged.
                chat.type ≠ "private" → silent drop + WARNING (v2 mode only;
                v1 backward-compat path bypasses this so the legacy
                `TELEGRAM_CHAT_ID` allowlist behaves identically to pre-v2).
```

The remaining guards 1-7 from v1 §6 stay numbered and ordered exactly as today.

#### Bug-queue protocol — new section between §6 and §7

**Storage:** JSON file at `ALIZA_BUG_QUEUE_FILE`. Perms 600. Atomic write (write tmpfile + `os.rename`). Both intra-process and inter-process safety:

- **Intra-process:** `_bug_queue_lock: asyncio.Lock` serializes all read-modify-write within the daemon. Required because async tasks process messages concurrently. Held for the full read-load-mutate-save cycle.
- **Inter-process:** `fcntl.flock(LOCK_EX)` defensively wraps the write phase in case a future tool (manual edit script, backup) touches the file simultaneously. **Not** a substitute for the asyncio.Lock.

**Schema (v1):**

```json
{
  "version": 1,
  "next_id": 42,
  "bugs": [
    {
      "id": 41,
      "reporter_chat_id": 555111,
      "reporter_username": "alice",
      "submitted_at": "2026-05-02T10:00:00Z",
      "text": "page X 500s when filter Y",
      "suggested_repo": "klynx",
      "status": "pending",
      "admin_decision_at": null,
      "admin_decision_by": null,
      "admin_note": null,
      "dispatch_repo": null,
      "dispatch_started_at": null,
      "dispatch_exit": null
    }
  ]
}
```

**State machine** (canonical — Codex blocker 3):

```text
       /approve <id> @<repo> [note]              dispatch.start
pending ───────────────────────────────► approved ────────────► dispatched
   │                                          │                       │
   │                                          │                       │ dispatch.end exit=0
   │                                          │                       ▼
   │                                          │                     done   (terminal)
   │                                          │
   │                                          │ dispatch.end exit ≠ 0 OR timeout OR spawn-failed
   │                                          ▼
   │                                       approved   (revert; admin can /approve again)
   │
   │                       /reject <id> [reason]
   └─────────────────────────────────────────────────────────────► rejected (terminal, admin-only)
```

Rules:

- `/reject` is **always admin-initiated**. Failure paths (dispatch.end exit ≠ 0, timeout, spawn-failed) **never** transition to `rejected` automatically — they revert to `approved` so admin can retry or explicitly `/reject`.
- `done` and `rejected` are terminal. `/approve` or `/reject` on a non-`pending`/non-`approved` bug returns `bug #<id> already <status> by <admin_decision_by> at <hh:mm>; cannot re-act`.
- Concurrent `/approve` of the same bug — first to acquire `_bug_queue_lock` and observe `status == "pending"` wins; second observes `status == "approved"` and gets the already-acted reply.
- Bug record is immutable except for the fields the state machine writes; reporter cannot edit submitted text.

**Per-state notification matrix (Phase 4 — sent to `reporter_chat_id`):**

| Transition | Notification text |
|---|---|
| `pending → approved → dispatched` (single combined notification at `dispatch.start`) | `your bug #<id> approved — admin dispatched into <repo>; updates will follow` |
| `dispatched → done` | `your bug #<id> resolved — final summary:\n<last 30 lines of admin's done reply>` |
| `dispatched → approved` (failure revert) | `your bug #<id> dispatch failed — exit=<n>; admin can retry with /approve <id>` |
| `pending → rejected` | `your bug #<id> declined: <admin_note>` (or `your bug #<id> declined` if note empty) |
| `approved → rejected` | (same as above; admin can /reject after a failure revert) |

Reporter notifications are **best-effort**: on Telegram send failure, daemon logs ERROR and continues. State transition itself is not blocked.

#### §7 error replies — additions

| Condition | Reply text |
|---|---|
| Reporter triggers any admin-only `/cmd` (`/bugs` `/approve` `/reject` plus admin `/info` `/prs` `/develop` `/version` `/forget` etc.) | `command admin-only` |
| Reporter `@<repo> <text>` | (no refusal — parsed as `suggested_repo` hint per §"Reporter repo hint" and routed to bug-queue intake) |
| Reporter free-form when role denied | (silent drop — same as v1 unknown chat_id) |
| Bug queue full | `bug queue full — please try again after admin processes pending bugs` |
| `/bugs` from reporter | `command admin-only` |
| `/approve <id>` missing `@<repo>` | `usage: /approve <id> @<repo> [note]; valid: <comma-list of ALIZA_REPOS keys>` |
| `/approve` bug not found | `bug #<id> not found` |
| `/approve` bug not in pending or approved-after-revert | `bug #<id> already <status> by <admin_decision_by> at <hh:mm>; cannot re-act` |
| `/reject` bug not found | (same as above) |
| `/reject` bug already terminal | (same as above) |

#### §9 logging — additions

```text
bug.submit       chat=<reporter_chat_id> bug_id=<n> suggested_repo=<token|null> text_truncated=<200chars>
bug.transition   bug_id=<n> from=<status> to=<status> by=<admin_username|"system">
notification.send chat=<reporter_chat_id> bug_id=<n> kind=<approved|done|failed|rejected>
```

#### Backward compatibility

When `ALIZA_CHAT_ROLES` is unset (and `TELEGRAM_CHAT_ID` is set per v1), daemon behaves identically to v1: that single chat_id has `admin` role, no reporters exist, bug-queue file is created lazily on first non-admin message (which can never happen), no /bugs/approve/reject cmds are exposed in `cmd_help`'s output for non-admin contexts.

Operators may roll back v2 by unsetting `ALIZA_CHAT_ROLES` and restarting; the bug-queue file is left in place but never read (operator may delete manually).
