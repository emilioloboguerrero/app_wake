# Wake Ops System

> **2026-05-01 — LLM agent layer removed.** The "smart agent" (Claude-powered
> synthesis, Q&A, auto-issue creation, `agent_pause`/`agent_resume` commands)
> was deleted to close F-OPS-05 (LLM prompt-injection through ingested errors).
> The dumb collectors + Telegram bus + GitHub issues / `@claude` manual loop
> remain intact and continue running on cron. Anything below that references
> `@agent_wake`, `agentSynthesis`, `agentDispatch`, `agentAssessment`,
> `agent_pause`, `agent_resume`, `ops_agent_state`, or autonomous synthesis
> is **historical** — that surface no longer exists in `functions/src/ops/`.
> The `@anthropic-ai/sdk` dependency was uninstalled.

A distributed observability and ops system for Wake. Built around a **dumb
collectors + Telegram bus + manual triage** architecture: signals land in
Telegram, humans triage, and `@claude` on GitHub executes any code work.

---

## Why this architecture

- **Separation of concerns** — collectors collect, reasoners reason, executors execute. Each side evolves independently.
- **Cheap scaling** — every new signal is a ~30-line Cloud Function. No prompt refactor, no agent rewiring.
- **Cross-signal correlation** — all signals land in one place, so the smart agent can reason across them (*"error spike + payment failure + recent deploy = likely regression"*).
- **Auditable** — the Telegram scrollback + GitHub issue history is the operational timeline. Humans and agents can re-read it.
- **Bounded autonomy** — the loop has multiple gates (issue triage, PR review, merge, deploy). Autonomy level is a one-const flip, not a rewrite.
- **Portable** — the same pattern works for future projects. `wake_ops`, `sideproject_ops`, etc.

---

## System diagram

```
  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
  │ daily pulse  │ │  heartbeat   │ │   deploys    │ │ client errs  │
  │  (cron 19h)  │ │  (cron 6h)   │ │ (post-deploy)│ │  (ingest fn) │
  └──────┬───────┘ └──────┬───────┘ └──────┬───────┘ └──────┬───────┘
         │                │                │                │
         └────────► [ wake_ops Telegram group ] ◄────────────┘
                              │
                              ▼
                   ┌────────────────────────┐
                   │      @agent_wake       │
                   │ (a) daily synthesis    │
                   │ (b) @mention Q&A       │
                   └───────────┬────────────┘
                               │ create_github_issue
                               ▼
                   ┌────────────────────────┐         @claude mention
                   │     GitHub Issues      │◄──────  (manual in Option 1,
                   └───────────┬────────────┘         auto in Option 2)
                               │ @claude triggers
                               ▼
                   ┌────────────────────────┐
                   │   Claude on GitHub     │
                   │   (GitHub Actions)     │
                   │   + qa-fast subagent   │
                   └───────────┬────────────┘
                               │ opens PR
                               ▼
                   ┌────────────────────────┐
                   │  Human: review + merge │
                   │  + firebase deploy     │
                   └───────────┬────────────┘
                               │ postdeploy → Telegram
                               ▼
             [loop closes — next daily pulse confirms resolution]
```

Dumb collectors feed the bus. The smart agent reads the bus, reasons, and hands off code-change work to GitHub. `@claude` on GitHub executes. Human reviews and deploys. Agent confirms.

---

## Components

### 1. Telegram bus — `wake_ops` group

A private Telegram group (Forum Mode) with **two bots**:

| Member | Role |
|---|---|
| You | Human operator |
| `@signals_wake` | **Dumb bot.** Posts all collector output. Responds to `/commands`. Only speaks + runs collectors, never reasons. |
| `@agent_wake` | **Smart bot.** Posts daily synthesis. Responds to @mentions. Opens GitHub issues. Has Claude API access. |

**Why two bots:**
- Clear visual distinction (different names, avatars)
- Unambiguous @mention target — `@agent_wake what happened at 14:30?`
- Blast radius — if one bot's token leaks, the other keeps working
- Identity layer mirrors architecture — dumb vs smart is visible in the chat

**Topics (Forum Mode):**

| Topic | Posts here | Bot |
|---|---|---|
| `#signals` | Collector output (logs, heartbeat, payments, quota, pwa/creator errors) + signals-webhook acks | `@signals_wake` |
| `#deploys` | `postdeploy` notifications from `scripts/ops/notify-deploy.sh` | `@signals_wake` |
| `#agent` | Smart agent synthesis + @mention Q&A | `@agent_wake` |

Thread IDs live in Secret Manager as `TELEGRAM_TOPICS` (JSON map). `sendTo(ctx, topic, text)` in [`telegram.ts`](../functions/src/ops/telegram.ts) resolves topic name → `message_thread_id` at send time. Fallback when absent: posts land at group root.

**Message tag convention** — every message is prefixed so agents can parse group history:

```
[wake-logs-digest] ...     ← from @signals_wake
[wake-deploys] ...         ← from @signals_wake
[wake-ops-agent] ...       ← from @agent_wake
```

### 2. Dumb collectors

Stateless modules that post raw, structured signals to the bus. No AI, no reasoning. Each lives as one file in `functions/src/ops/` with a single exported `run…(ctx)` function. Same function is invoked from scheduled cron, from Telegram `/command`, or from `/all` — no duplicated logic. Adding a collector: create module, add one line to `commands.ts`, optionally add to a scheduled function's step list.

#### Daily pulse — `wakeDailyPulseCron`

Runs at 19:00 Bogotá. Executes these collectors in sequence (each try/catch wrapped):

| Step | Module | Purpose |
|---|---|---|
| logs | `runLogsDigest` | Cloud Logging digest, WARNING+, NEW/SPIKING/RECURRING/CHRONIC |
| payments | `runPaymentsPulse` | MercadoPago function invocations + subscription / processed-payment changes in 24h |
| pwa-errors | `runClientErrors({source: "pwa"})` | Top 10 PWA frontend errors from `ops_client_errors` |
| creator-errors | `runClientErrors({source: "creator"})` | Same for creator dashboard |
| quota | `runQuotaWatch` | Firestore reads/writes/deletes + Functions execution/error counts vs 7d baseline |

#### Heartbeat — `wakeHeartbeatCron`

Runs every 6 hours. Reads Cloud Logging for each scheduled function in `index.ts`, compares last-activity timestamp to expected cadence, posts `[wake-cron-heartbeat]` message. Staleness threshold = 3× expected interval.

#### `wakeClientErrorsIngest`

Public HTTPS endpoint receiving frontend error reports. Dumb collector — just ingest + fingerprint + store.

| | |
|---|---|
| Type | Cloud Function Gen2 HTTPS onRequest |
| Auth | Public. Origin whitelist enforces production domains only. |
| Rate limit | In-memory per-IP, 60 reports/min sliding window |
| Validation | `source ∈ {"pwa", "creator"}`, batch ≤20, stack ≤8KB, message ≤500 chars |
| PII stripping | Emails → `{email}`, long numeric IDs → `{n}`, token-like strings → `{token}` |
| Storage | `ops_client_errors` with fingerprint + TTL 14 days |

Reporters:
- PWA: [apps/pwa/src/utils/errorReporter.js](../apps/pwa/src/utils/errorReporter.js) — wired into `window.onerror`, `unhandledrejection`, `ErrorBoundary`
- Creator: [apps/creator-dashboard/src/utils/errorReporter.js](../apps/creator-dashboard/src/utils/errorReporter.js) — `installGlobalHooks()` in `main.jsx`, ErrorBoundary wraps `<App>`

#### State tracking — NEW / SPIKING / RECURRING / CHRONIC

Every collector that fingerprints stores a per-fingerprint state doc:

| Collector | State collection |
|---|---|
| logs | `ops_logs_state` |
| payments | `ops_payments_state` |
| quota | `ops_quota_state` |
| pwa-errors | `ops_pwa_errors_state` |
| creator-errors | `ops_creator_errors_state` |

Shape: `{ firstSeen, lastSeen, reportedAt, countsByDay: { "YYYY-MM-DD": n, ... } }`. 14-day retention, older pruned.

Categorisation:
- **NEW** — never reported before
- **SPIKING** — today ≥ max(floor, multiplier × 7-day avg). Floor = 5 (quotaWatch: 100)
- **CHRONIC** — first seen >24h ago
- **RECURRING** — everything else

Shared impl: [`functions/src/ops/stateTracker.ts`](../functions/src/ops/stateTracker.ts).

#### Sourcemap symbolication (PWA)

1. `expo export --platform web --source-maps` emits `.js.map` into `hosting/app/`
2. `firebase.json` hosting `ignore` excludes `**/*.map` from public deploy
3. Hosting `postdeploy` runs `scripts/ops/upload-sourcemaps.sh` — uploads maps to `gs://wolf-20b8b.appspot.com/ops/sourcemaps/pwa/{timestamp-sha}/`
4. At digest time, `tryResolveTopFrame(stack)` in [`functions/src/ops/sourcemaps.ts`](../functions/src/ops/sourcemaps.ts) resolves top frame, appends `@ src/file:line`

Silent fallback: if no maps uploaded or bundle filename doesn't match, digests show minified message.

#### Read-only ops API — `wakeOpsApi`

HTTPS function exposing ops data as JSON. Foundation for future dashboards; agent consumes this.

| | |
|---|---|
| Type | Cloud Function Gen2 HTTPS onRequest |
| Auth | `x-wake-ops-key` header or `?key=`. Stored in `OPS_API_KEY` secret. |
| CORS | Dev (localhost:3000, 5173) + prod domains |

Endpoints (all under `/v1/`):
- `GET /v1/health`
- `GET /v1/summary` — 24h activity snapshot
- `GET /v1/state/:collector` — state docs for logs/payments/quota/pwa_errors/creator_errors
- `GET /v1/client-errors?source=pwa&windowHours=24&limit=50` — raw errors

#### `wake-signals-webhook`

Lets you run any collector on demand via `/command` to `@signals_wake`.

| | |
|---|---|
| Type | Cloud Function Gen2 HTTPS |
| Auth | `X-Telegram-Bot-Api-Secret-Token` + chat allowlist |
| Commands | `/logs`, `/heartbeat`, `/payments`, `/quota`, `/pwa_errors`, `/creator_errors`, `/all`, `/help` |
| Registry | `functions/src/ops/commands.ts` — add collector = one entry, `/all` picks up automatically |

One-time setup: `bash scripts/ops/register-signals-webhook.sh`.

#### `wake-deploys-notify`

Runs automatically after every `firebase deploy` via `postdeploy` hooks in `firebase.json`. Each calls `./scripts/ops/notify-deploy.sh <target>`.

Commit strategy (hybrid):
- **Working tree dirty** → `git add -A`, commit `deploy({target}): {YYYY-MM-DD HH:mm}`, push, post commit to Telegram
- **Working tree clean** → no new commit, push (no-op if already pushed), post existing HEAD to Telegram

Either way: git HEAD matches deployed code, latest commit pushed. Git history *is* the deployment log. Query via `git log --grep "^deploy("`.

### 3. Smart agent — `@agent_wake`

The reasoning layer. Reads the bus, correlates signals, opens GitHub issues, confirms resolution. Two entry modes.

#### Mode A — scheduled synthesis

| | |
|---|---|
| Type | Cloud Function Gen2, `pubsub.schedule` |
| Trigger | Daily 19:30 Bogotá (30 min after daily pulse) |
| Hosting | Firebase (`wolf-20b8b`) |
| Input | Last 24h of `wake_ops` archive + ops API state + recent git commits + open `ops-agent` issues |
| Output | Synthesis posted to `#agent`. May open / comment on GitHub issues. |
| Cost | ~$0.30/day max via Anthropic API, hard-capped |

Correlates signals: *"logs show X errors on `/workout/complete` starting at 14:35, aligns with the 14:32 functions deploy (commit `f6656ce`). Likely regression. Opened #47."*

Skip rule: if no NEW errors, no SPIKING errors, no open issues with status changes, post one-liner *"all quiet"* instead of a full synthesis.

#### Mode B — @mention handler

| | |
|---|---|
| Type | Cloud Function Gen2 HTTPS (Telegram webhook) |
| Trigger | Telegram webhook on `@agent_wake` mention |
| Input | Mention text + recent archive + ops API + open issues |
| Output | Reply in `#agent`. May open / comment on GitHub issues. |
| Cost | ~$0.03/call, capped at 50 calls/day |

Ad-hoc Q&A and manual investigation. Examples:
- *"@agent_wake is there an open issue for this error?"*
- *"@agent_wake why did payments spike today?"*
- *"@agent_wake open an issue for the top PWA error from today"*

**Shared prompt/tools.** Both modes use the same system prompt, tool definitions, and behavior contract. Prompt lives in `functions/src/ops/agentPrompt.ts` as a const; canonical description in `docs/ops/agent-prompt.md`. Keep in sync on each edit.

### 4. Executor — `@claude` on GitHub

GitHub App (`anthropics/claude-code-action@v1`) that runs Claude Code inside a GitHub Actions runner when `@claude` is mentioned on an issue or PR.

| | |
|---|---|
| Workflow | `.github/workflows/claude.yml` |
| Trigger | `@claude` mention in issue / PR / review |
| Runtime | GitHub-hosted Ubuntu runner with repo checked out |
| Auth | `CLAUDE_CODE_OAUTH_TOKEN` (rides Max subscription — no API cost) |
| Tools | Read, Edit, Write, Grep, Glob, Task + `Bash(npm:*),Bash(npx:*),Bash(node:*),Bash(git:*),Bash(gh:*)` |
| Default behavior | `--append-system-prompt` forces `qa-fast` subagent before any PR on code changes |

Automatic PR review: `.github/workflows/claude-code-review.yml` runs on every PR open/sync using the `code-review` plugin.

#### Subagents

Committed to `.claude/agents/*.md`. Main agent spawns via `Task` tool. Each gets its own context window.

| Subagent | Purpose |
|---|---|
| `qa-fast` | Runs `npm --prefix functions run lint` + `npm --prefix functions run build`. Reports PASS/FAIL. Does not fix. |
| (future) `qa-full` | qa-fast + Playwright E2E on built PWA |
| (future) `qa-security` | Wraps `/security-review` skill over the diff |
| (future) `qa-firestore-rules` | Tests rule changes against emulator |

---

## The full loop

**Normal operation, Option 1 (issue_only autonomy):**

1. Error fires in prod → `wakeClientErrorsIngest` stores to Firestore. **AUTO.**
2. 19:00 daily pulse → `@signals_wake` posts digest to `#signals`. **AUTO.**
3. 19:30 agent synthesis → `@agent_wake` reads archive + ops API + git log → computes `AgentAssessment` for each notable fingerprint → opens GitHub issue for fingerprints meeting thresholds. Posts synthesis to `#agent`. **AUTO.**
4. GitHub notification → you open the issue → read Agent Assessment block (confidence, deploy correlation, "would auto-@claude: YES/NO"). **MANUAL.**
5. If you agree: comment `@claude`. **MANUAL in Option 1 / AUTO in Option 2 for high-confidence issues.**
6. `@claude` workflow fires → explores repo → spawns `qa-fast` → opens PR commenting back on the issue. **AUTO.**
7. You review PR, possibly iterate with `@claude` comments, merge. **MANUAL.**
8. `firebase deploy` → postdeploy hook posts commit to `#deploys`. **MANUAL (deploy) + AUTO (notify).**
9. Next daily synthesis → `@agent_wake` sees fingerprint count dropped to 0 → comments on the issue: *"Errors cleared after commit `<sha>` — likely resolved, feel free to close."* Never auto-closes. **AUTO.**
10. You close the issue when satisfied. **MANUAL.**

Gates the human always controls: issue triage (in Option 1), PR review, merge, deploy, issue close.

---

## Autonomy model

Single switch controls how aggressive the loop is.

```ts
// functions/src/ops/agentConfig.ts
export const AGENT_AUTONOMY:
  | "issue_only"           // Option 1 — ship here
  | "high_confidence_auto" // Option 3 middle ground — ramp target
  | "full_auto"            // Option 2 — later
  = "issue_only";
```

### `AgentAssessment` — computed on every issue-worthy finding

Included in every issue body, regardless of autonomy level. Also emitted in shadow stats for review.

```ts
type AgentAssessment = {
  confidence: "high" | "medium" | "low";
  correlatedDeploy: { sha: string; minutesAgo: number } | null;
  touchesSensitivePaths: boolean;
  firstSeenHoursAgo: number;
  occurrenceCount: number;
  fingerprint: string;
  wouldAutoMention: boolean;   // Option 2 would use this
  reason: string;              // plain-language justification
};
```

### `shouldAutoMention()` — single decision point

```ts
export function shouldAutoMention(a: AgentAssessment): boolean {
  if (AGENT_AUTONOMY === "issue_only") return false;
  if (AGENT_AUTONOMY === "full_auto") return true;
  // high_confidence_auto
  return a.confidence === "high"
      && !!a.correlatedDeploy
      && !a.touchesSensitivePaths;
}
```

Flipping autonomy = change the const. No rewrites, no prompt changes.

### Issue body template (Option 1)

```markdown
## Problem

{stack trace / error summary, from Ops API}

- Fingerprint: {fp}
- First seen: {firstSeen} ({firstSeenHoursAgo}h ago)
- Occurrences: {count} (today: {todayCount}, 7d avg: {avg})
- Affected surface: {source} ({pwa|creator})

## Correlation

{correlatedDeploy ? "Introduced shortly after commit <sha> — see diff" : "No deploy in last 6h"}

## Agent assessment (autonomy: issue_only)

- Confidence: {high|medium|low}
- Deploy correlation: {yes/no + sha}
- Sensitive paths touched: {yes/no}
- **Would auto-@claude if full_auto: {YES/NO}** — {reason}

## Next step

{ Option 1: "Review this issue. If you agree, comment @claude to trigger a fix." }
{ Option 2: "@claude implement this fix. Include qa-fast before PR." }
```

### Labels applied on every agent-opened issue

- `ops-agent` — opened by agent, not human
- `confidence-high` / `confidence-medium` / `confidence-low`
- `deploy-regression` (if correlated)
- `auto-claude-eligible` — `shouldAutoMention` returned true. Option 1 ignores. Option 2 acts on it.

### Autonomy ramp

| Phase | Mode | Entry criteria |
|---|---|---|
| Weeks 1–2 | `issue_only` | Ship. Observe. |
| Weeks 3–4 | `issue_only` + shadow stats reviewed | "Would have auto-@claude'd" column right on ≥90% of issues. |
| Weeks 5+ | `high_confidence_auto` | Run clean for ≥2 weeks with no false auto-mentions. |
| Later | `full_auto` | Sustained clean run on `high_confidence_auto` for 4+ weeks. |

### Kill switch

`/agent_pause` command to `@signals_wake` sets a flag in Firestore (`ops_agent_state/pause`). Next synthesis run reads the flag and skips work. `/agent_resume` clears it. Mandatory for `full_auto`, useful in `issue_only`.

### Cost caps

Enforced in code. Breaches post a Telegram message and skip the call.

- Mode A: hard cap 20k input tokens/day
- Mode B: hard cap 50 @mentions/day

### Sensitive paths

Committed at [.claude/ops/sensitive-paths.json](../.claude/ops/sensitive-paths.json). In `issue_only` this is advisory (shown in assessment). In `high_confidence_auto`+ it's a hard block on auto-mention.

Starter list:
- `functions/src/api/routes/payments.ts`
- `functions/src/api/middleware/auth.ts`
- `functions/src/api/services/enrollmentLeave.ts`
- `config/firebase/firestore.rules`
- `config/firebase/storage.rules`

Maintained by hand — add files as you touch them.

### Thresholds

Centralized in [functions/src/ops/agentConfig.ts](../functions/src/ops/agentConfig.ts):

```ts
export const ISSUE_THRESHOLDS = {
  minOccurrencesForNew: 5,
  spikingMultiplier: 3,
  deployCorrelationWindowMinutes: 360, // 6h
  resolutionQuietHours: 72,
};
```

---

## Fingerprint → GitHub issue mapping

New Firestore collection `ops_issues`. One doc per fingerprint.

```ts
type OpsIssue = {
  fingerprint: string;
  issueNumber: number;
  issueUrl: string;
  source: "logs" | "payments" | "pwa_errors" | "creator_errors" | "quota";
  firstOpened: Timestamp;
  lastOccurrence: Timestamp;
  occurrenceCount: number;
  state: "open" | "resolved_pending_close" | "closed";
  resolutionNoteAddedAt?: Timestamp;
  resolutionCommitSha?: string;
};
```

Synthesis flow per active fingerprint:

1. Does `ops_issues/{fp}` exist?
   - **No** + meets `ISSUE_THRESHOLDS` → `create_github_issue` → write mapping
   - **Yes + state=open** → `comment_on_issue` only if severity changed (new spike, new correlation)
   - **Yes + state=resolved_pending_close** and still 0 errors → noop
   - **Yes + state=open** and 0 errors for `resolutionQuietHours` → `comment_on_issue` resolution note, flip to `resolved_pending_close`

Never auto-closes. Human closes.

---

## Conventions

### Naming

- Collectors: `{project}-{signal}-{mode}` — e.g. `wake-logs-digest-cron`
- Agents: `{project}-ops-agent`
- Telegram groups: `{project}_ops`
- Telegram bot usernames: `{role}_{project}` — `signals_wake`, `agent_wake`
- Message tags: `[{source-name}]` first token of every message

### Directory layout

Runtime state lives in Firebase — filesystem stores only code + config:

- Deploy history: git commits matching `^deploy(`
- Collector state: `ops_*_state` Firestore collections
- Message archive: `ops_group_messages` Firestore collection (14-day TTL)
- Fingerprint → issue map: `ops_issues` Firestore collection
- Agent pause flag: `ops_agent_state/pause`
- Collector reports: Telegram scrollback

### Secrets — Firebase Secret Manager

| Secret | Used by | Required |
|---|---|---|
| `TELEGRAM_SIGNALS_BOT_TOKEN` | Collectors + signals webhook | Yes |
| `TELEGRAM_AGENT_BOT_TOKEN` | Agent Mode A + Mode B | Phase 3 |
| `TELEGRAM_CHAT_ID` | All | Yes |
| `TELEGRAM_TOPICS` | All (JSON topic map) | Yes |
| `TELEGRAM_WEBHOOK_SECRET` | signals webhook | Yes |
| `TELEGRAM_AGENT_WEBHOOK_SECRET` | agent Mode B webhook | Phase 3 |
| `OPS_API_KEY` | `wakeOpsApi`; agent calls itself | Yes |
| `ANTHROPIC_API_KEY` | Agent Mode A + B | Phase 3 |
| `GITHUB_OPS_TOKEN` | Agent GitHub tools (fine-grained PAT, `issues:RW contents:R pull_requests:R` on `wake` only) | Phase 3 |
| `CLAUDE_CODE_OAUTH_TOKEN` | GitHub Actions `@claude` workflow | Done |

Local `notify-deploy.sh` reads `TELEGRAM_SIGNALS_BOT_TOKEN` / `TELEGRAM_CHAT_ID` from gitignored `.env.ops`.

GCP Cloud Logging read: default CF service account `wolf-20b8b@appspot.gserviceaccount.com` should have `roles/logging.viewer`.

---

## Build plan

Phase status:
- **Phase 1** — Telegram bus — **DONE**
- **Phase 2** — Dumb collectors — **DONE**
- **Phase 3** — Smart agent (full loop) — **IN PROGRESS**
- **Phase 4** — Autonomy ramp — **PENDING (passive observation starts with Phase 3 ship)**

### Phase 3 — Smart agent (the full loop)

Six sub-phases. Each independently shippable. Total ~5–7 focused hours.

#### 3A · Identities and secrets

1. Create `@agent_wake` via @BotFather (privacy **disabled** — needs to read all group messages).
2. Add `@agent_wake` to `wake_ops` group, capture token.
3. Generate fine-grained GitHub PAT scoped to `wake` repo: `Issues: RW`, `Contents: R`, `Pull requests: R`.
4. Add secrets to Firebase Secret Manager: `TELEGRAM_AGENT_BOT_TOKEN`, `TELEGRAM_AGENT_WEBHOOK_SECRET`, `GITHUB_OPS_TOKEN`, `ANTHROPIC_API_KEY`.

**Shippable when:** secrets exist, bot is in group, PAT verified.

#### 3B · Message archive

1. New file: `functions/src/ops/messageArchive.ts` with `archiveMessage(msg)` + `readArchive(hours, filter?)`.
2. New Firestore collection `ops_group_messages` with field `expiresAt` (TTL 14 days, configure policy).
3. Extend `sendTo()` in `telegram.ts` to mirror every outgoing message to the archive (captures `@signals_wake` output).
4. New Cloud Function `wakeAgentWebhook` (skeleton) — receives every Telegram update for `@agent_wake`, archives incoming message, no reasoning yet.
5. Register webhook via `scripts/ops/register-agent-webhook.sh`.

**Shippable when:** send a test message to `wake_ops`, verify it appears in `ops_group_messages` within seconds.

#### 3C · Tool layer

1. `functions/src/ops/github.ts` — Octokit or fetch wrapper with `GITHUB_OPS_TOKEN`. Functions: `createIssue`, `commentOnIssue`, `findIssueByLabel`, `getRecentCommits`, `getCommit`.
2. `functions/src/ops/opsApi.ts` — internal client for `wakeOpsApi` using `OPS_API_KEY`.
3. `functions/src/ops/agentTools.ts` — typed tool definitions for the Claude tool-calling loop:
   - `read_archive(hours, filter?)`
   - `get_ops_state(collector)`
   - `get_client_errors(source, hours)`
   - `get_recent_commits(count)`
   - `find_issue_by_fingerprint(fp)` — reads `ops_issues` then GitHub
   - `create_github_issue(title, body, labels, fingerprint, source)` — writes `ops_issues`
   - `comment_on_issue(issueNumber, body)` — also updates `ops_issues` state
   - `send_telegram(text)`
4. Each tool has a JSON schema + unit-testable implementation.
5. `functions/src/ops/agentAssessment.ts` — `computeAssessment(fingerprint, stateDoc, recentCommits)` returning `AgentAssessment`.

**Shippable when:** each tool runs standalone in a test harness. No agent yet.

#### 3D · Agent core

1. `functions/src/ops/agentPrompt.ts` — exported const with system prompt. Also write `docs/ops/agent-prompt.md` with canonical human-readable description; reference the latter from the former's docstring.
2. `functions/src/ops/agent.ts` — `runAgent(mode, input)` that:
   - Builds context (archive + ops state + open ops-agent issues + recent commits)
   - Starts Claude tool-calling loop with `agentTools`
   - Enforces token budget per `ISSUE_THRESHOLDS` config
   - Returns final output (Telegram text + list of issue actions taken)
3. `functions/src/ops/agentConfig.ts` — `AGENT_AUTONOMY`, `ISSUE_THRESHOLDS`, `shouldAutoMention()`.
4. Commit `.claude/ops/sensitive-paths.json` with starter list.

**Shippable when:** `runAgent("test", "hello")` returns a sensible reply locally via emulator.

#### 3E · Mode B — @mention webhook

1. Extend `wakeAgentWebhook` (from 3B) to detect `@agent_wake` mentions in incoming messages.
2. On mention, call `runAgent("mention", messageText)`.
3. Respond synchronously to Telegram webhook with 200, run agent async (Cloud Run CPU-after-response caveat — use blocking pattern like `signalsWebhook.ts`).
4. Post agent reply to `#agent` topic.
5. Enforce per-day @mention cap.

**Shippable when:** `@agent_wake what's the top PWA error today?` returns a correct answer referencing real state.

**Test before moving to Mode A.** Dial in the prompt here — it's cheap, fast, and you see every response.

#### 3F · GitHub issue loop (exercise via Mode B)

1. First real exercise: `@agent_wake open an issue for the top PWA error from today`. Verify:
   - Issue appears with correct title, body template, labels
   - `ops_issues/{fp}` written
   - Agent posts Telegram ack with issue link
2. Second exercise: say `@claude` on that issue, confirm `@claude` picks it up, runs `qa-fast`, opens PR.
3. Third exercise: re-run `@agent_wake open an issue for the same error`. Verify dedupe — agent comments on existing issue instead of creating duplicate.

**Shippable when:** all three exercises pass end-to-end.

#### 3G · Mode A — daily synthesis

1. `wakeAgentSynthesisCron` scheduled function (daily 19:30 Bogotá) in `index.ts`.
2. Calls `runAgent("synthesis", null)` with system prompt variant instructing full-day synthesis behavior.
3. Skip rule: if agent returns empty assessment list, post `[wake-ops-agent] all quiet.`
4. Resolution detection: for each open `ops_issues` with `state=open`, query current `occurrenceCount` — if 0 for `resolutionQuietHours`, post resolution comment + flip state.
5. Shadow stats footer on synthesis post:

```
Issues opened today: 3
Would have auto-@claude'd (shadow): 2
Confidence breakdown: 1 high · 1 medium · 1 low
Autonomy: issue_only
```

**Shippable when:** two consecutive days run clean — sensible synthesis each day, no false issues, resolution comment posted after a real merge.

### Phase 4 — Autonomy ramp

Not code, mostly observation. Gated on Phase 3 running clean.

1. **Weeks 1–2 after 3G ships** — observe. Read every synthesis. Count how often "Would auto-@claude" matches what you'd have done.
2. **Review gate** — if ≥90% match on ≥20 issues, proceed. If not, iterate on the assessment logic until it does.
3. **Flip to `high_confidence_auto`** — change const, deploy. Auto-@claude fires only on high-confidence + deploy-correlated + non-sensitive.
4. **Observe for 2 weeks** — any false auto-PR is a signal to revert and tune. Real false-positive rate target: <5%.
5. **Flip to `full_auto`** — only after sustained clean run. Add daily cap on auto-PRs to limit damage from a runaway state.

Each flip is a one-line config change + deploy. No code rewrites.

---

## Out of scope (not building now)

- Multi-project meta-assistant across project groups
- Splitting `wake_ops` into raw vs digest groups
- Staging environment coverage (prod only)
- Interactive web dashboard (ops API exists as foundation)
- Agent writing its own code changes without going through `@claude` — hard architectural boundary; agent only opens issues
- Agent merging PRs — human-only gate forever

---

## Open questions

None — all decisions locked:

- **Hosting** — both agent modes run as Cloud Functions in `wolf-20b8b`. Uniform infra. Anthropic API billing, ~$15/mo cap.
- **Archive ownership** — `@agent_wake` webhook archives all incoming; `sendTo()` mirrors outgoing. Both bots' messages captured.
- **Fingerprint strategy** — reuse existing collector fingerprints (already in state docs)
- **Issue closure** — agent comments only, human closes. True even in `full_auto`.
- **GitHub auth** — fine-grained PAT, rotated annually. `GITHUB_OPS_TOKEN`.
- **Autonomy ramp** — start `issue_only`, observe, graduate to `high_confidence_auto`, later `full_auto`.
- **Sensitive paths** — committed list, maintained by hand.
- **Prompt location** — const in TS + canonical doc, kept in sync.
