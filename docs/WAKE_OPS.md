# Wake Ops System

A distributed observability and ops intelligence system for Wake. Built around a **dumb collectors + smart agent** architecture so we can grow signals independently from reasoning, keep costs flat, and eventually extend the pattern across multiple projects.

---

## Why this architecture

- **Separation of concerns** — collectors collect, reasoners reason. Each side can evolve independently.
- **Cheap scaling** — every new signal is a ~30-line Cloud Function or script. No prompt refactor, no agent rewiring.
- **Cross-signal correlation** — because all signals land in one place, the smart agent can reason across them (*"error spike + payment failure + recent deploy = likely regression"*).
- **Auditable** — the Telegram group scrollback is the operational timeline. Humans can read it, the agent can re-read it.
- **Portable** — the same pattern works for future projects. `wake_ops`, `sideproject_ops`, etc.

---

## System diagram

```
  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
  │ daily pulse  │ │  heartbeat   │ │   deploys    │ │ client errs  │
  │  (cron 19h)  │ │  (cron 6h)   │ │ (post-deploy)│ │  (ingest fn) │
  │              │ │              │ │              │ │              │
  │ logs +       │ │ scheduled    │ │ per-target   │ │ PWA + creator│
  │ payments +   │ │ job freshness│ │ git commit + │ │ window errors│
  │ pwa-errors + │ │              │ │ push + post  │ │ → Firestore  │
  │ creator-err +│ │              │ │              │ │              │
  │ quota        │ │              │ │              │ │              │
  └──────┬───────┘ └──────┬───────┘ └──────┬───────┘ └──────┬───────┘
         │                │                │                │
         └────────► [ wake_ops Telegram group ] ◄────────────┘
                             │
                             ▼
                  ┌──────────────────────┐
                  │   wake-ops-agent     │
                  │  (a) daily synthesis │
                  │  (b) @mention Q&A    │
                  └──────────────────────┘
```

Dumb collectors feed the bus. The smart agent reads the bus and reasons.

---

## Components

### 1. Telegram bus — `wake_ops` group

A private Telegram group with **two bots**, reflecting the architecture:

| Member | Role |
|---|---|
| You | Human operator |
| `@signals_wake` | **Dumb bot.** Posts all collector output (log digests, deploy notifications, future signals). Only speaks, never listens. |
| `@agent_wake` | **Smart bot.** Posts the daily synthesis. Responds to @mentions. Has Claude API access. |

**Why two bots:**
- Clear visual distinction in the group (different names, different avatars)
- Unambiguous @mention target — `@agent_wake what happened at 14:30?`
- Blast radius: if one bot's token leaks, the other keeps working
- Identity layer mirrors the architecture — dumb vs smart is visible in the chat

**Role of the group:** message bus + audit log. Every operational signal passes through it.

**Message format convention** — every message is prefixed with a tag so the agent can parse group history when reasoning:

```
[wake-logs-digest] ...     ← from @signals_wake
[wake-deploys] ...         ← from @signals_wake
[wake-ops-agent] ...       ← from @agent_wake
```

### 2. Dumb collectors

Stateless modules that post raw, structured signals to the bus. No AI, no reasoning. Each lives as one file in `functions/src/ops/` with a single exported `run…(ctx)` function. The same function is invoked from a scheduled cron, from a Telegram `/command`, or from `/all` — there is no duplicated logic across entry points. To add a collector: create the module, add one line to `functions/src/ops/commands.ts`, optionally add it to a scheduled function's step list.

#### Daily pulse — `wakeDailyPulseCron`

Runs at 19:00 Bogotá and executes these collectors in sequence (each wrapped in try/catch so one failure does not cancel the rest):

| Step | Module | Purpose |
|---|---|---|
| logs | `runLogsDigest` | Cloud Logging digest, WARNING+, NEW/SPIKING/RECURRING/CHRONIC |
| payments | `runPaymentsPulse` | MercadoPago function invocations + subscription / processed-payment changes in 24h |
| pwa-errors | `runClientErrors({source: "pwa"})` | Top 10 PWA frontend errors from `ops_client_errors` |
| creator-errors | `runClientErrors({source: "creator"})` | Same for creator dashboard |
| quota | `runQuotaWatch` | Firestore reads/writes/deletes + Functions execution/error counts vs 7d baseline |

#### Heartbeat — `wakeHeartbeatCron`

Runs every 6 hours. Reads Cloud Logging for each scheduled function in `index.ts`, compares last-activity timestamp to expected cadence, posts `[wake-cron-heartbeat]` message. Staleness threshold = 3× expected interval. Covers: `wakeDailyPulseCron`, `wakeHeartbeatCron` (self-check), `processRestTimerNotifications`, `processEmailQueue`, `sendCallReminders`, `detectAbandonedSessions`, `expandWeeklyAvailability`, `cleanupVideoExchanges`.

#### `wakeClientErrorsIngest` (public HTTPS endpoint)

Receives frontend error reports from the PWA and creator dashboard. Dumb collector — no digest, just ingest.

| | |
|---|---|
| Type | Cloud Function Gen2 HTTPS onRequest |
| Auth | Public (no Firebase ID token required). Origin whitelist enforces production domains only. |
| Rate limit | In-memory per-IP, 60 reports/minute sliding window (per instance) |
| Validation | `source ∈ {"pwa", "creator"}`, batch ≤20 errors, stack ≤8KB, message ≤500 chars |
| PII stripping | Emails → `{email}`, long numeric IDs → `{n}`, token-like strings (≥24 chars, [A-Za-z0-9_-]) → `{token}` |
| Storage | One doc per error in `ops_client_errors` Firestore collection with fingerprint + TTL `expiresAt` (14 days) |
| Fingerprint | `fingerprintError(source, errorType, message)` — server-side, overrides any client-provided value |

Client reporters ship errors here as batched JSON arrays:
- PWA: [apps/pwa/src/utils/errorReporter.js](apps/pwa/src/utils/errorReporter.js) — wired into existing `window.onerror` + `unhandledrejection` handlers in [App.web.js](apps/pwa/src/App.web.js) and `componentDidCatch` in [ErrorBoundary.js](apps/pwa/src/components/ErrorBoundary.js).
- Creator: [apps/creator-dashboard/src/utils/errorReporter.js](apps/creator-dashboard/src/utils/errorReporter.js) — `installGlobalHooks()` called once at boot in `main.jsx`; ErrorBoundary now wraps `<App>` in `App.jsx`. Vite `sourcemap: true` so stacks are readable.

Both reporters dedupe in-memory by fingerprint, flush every 5s / 10 distinct errors / `visibilitychange`, and are no-ops in dev / preview.

#### State tracking — NEW / SPIKING / RECURRING / CHRONIC

Every collector that fingerprints signals (`logs`, `payments`, `quota`, `pwa-errors`, `creator-errors`) stores a per-fingerprint state doc in its own Firestore collection:

| Collector | State collection |
|---|---|
| logs | `ops_logs_state` |
| payments | `ops_payments_state` |
| quota | `ops_quota_state` |
| pwa-errors | `ops_pwa_errors_state` |
| creator-errors | `ops_creator_errors_state` |

Shape: `{ firstSeen, lastSeen, reportedAt, countsByDay: { "YYYY-MM-DD": n, ... } }`. `countsByDay` retains 14 days; older entries are pruned. On each run a fingerprint is categorised:

- **NEW** — never reported before.
- **SPIKING** — today's count ≥ max(floor, multiplier × 7-day average). Floor defaults to 5; quotaWatch uses 100 to avoid low-volume noise.
- **CHRONIC** — first seen more than 24h ago.
- **RECURRING** — everything else.

Shared implementation: [`functions/src/ops/stateTracker.ts`](functions/src/ops/stateTracker.ts).

#### Sourcemap symbolication (PWA)

Pipeline for resolving minified PWA stacks back to readable source paths:

1. `expo export --platform web --source-maps` (in `apps/pwa/package.json`) emits `.js.map` files into `hosting/app/`.
2. `firebase.json` hosting `ignore` excludes `**/*.map` from public deploy — maps are **not** served to users.
3. Hosting `postdeploy` runs `scripts/ops/upload-sourcemaps.sh`, which uploads maps to `gs://wolf-20b8b.appspot.com/ops/sourcemaps/pwa/{timestamp-sha}/`.
4. At digest time, `clientErrors.ts` calls `tryResolveTopFrame(stack)` from [`functions/src/ops/sourcemaps.ts`](functions/src/ops/sourcemaps.ts) which loads the latest deploy's sourcemap, resolves the top frame, and appends `@ src/file:line` to the digest line.

Fallback is silent — if no maps are uploaded yet or the bundle filename doesn't match, digests just show the minified message.

#### Read-only ops API — `wakeOpsApi`

HTTPS Cloud Function exposing the ops data surface as JSON. Foundation for a future web dashboard; safe to consume from scripts today.

| | |
|---|---|
| Type | Cloud Function Gen2 HTTPS onRequest |
| Auth | Shared key via `x-wake-ops-key` header or `?key=` query. Stored in `OPS_API_KEY` secret. |
| CORS | Dev (localhost:3000, 5173) + prod domains whitelisted |

Endpoints (all under `/v1/`):

- `GET /v1/health` — auth + Firestore reachability check.
- `GET /v1/summary` — 24h activity snapshot across all collectors.
- `GET /v1/state/:collector` — state docs for `logs` / `payments` / `quota` / `pwa_errors` / `creator_errors`. Supports `?limit=`.
- `GET /v1/client-errors?source=pwa&windowHours=24&limit=50` — raw error events.

#### Topic routing (Telegram supergroup Forum Mode)

The `wake_ops` supergroup runs in **Forum Mode** with three topics — separate lanes inside the single group, each with its own scrollback and independent mute/notification settings.

| Topic | Posts here | Bot |
|---|---|---|
| `#signals` | All dumb collector output (logs, heartbeat, payments, quota, pwa/creator errors) + signals-webhook acks | `@signals_wake` |
| `#deploys` | `postdeploy` notifications from `scripts/ops/notify-deploy.sh` | `@signals_wake` |
| `#agent` | Smart agent synthesis + @mention Q&A | `@agent_wake` (Phase 3) |

Thread IDs live in Secret Manager as `TELEGRAM_TOPICS` — a JSON map, e.g. `{"agent":92,"signals":93,"deploys":94}`. The secret is bound to `wakeDailyPulseCron`, `wakeHeartbeatCron`, and `wakeSignalsWebhook`. `sendTo(ctx, topic, text)` in [`telegram.ts`](functions/src/ops/telegram.ts) resolves the topic name to a `message_thread_id` at send time.

`scripts/ops/notify-deploy.sh` reads `TELEGRAM_DEPLOYS_TOPIC_ID` from `.env.ops` and includes it in the `sendMessage` POST so deploy notifications land in `#deploys`.

**Fallback:** if `TELEGRAM_TOPICS` is absent or a topic key is missing, posts land at the group root — matches pre-forum behavior. Safe default.

**Adding a new topic:**
1. Create it in Telegram; copy the message link from any message inside it; middle number = thread id.
2. `gcloud secrets versions add TELEGRAM_TOPICS --data-file=-` with the updated JSON.
3. Extend the `Topic` union type in `telegram.ts` and add the new key to `TopicMap`.
4. Redeploy the affected functions (no code change to callers that don't use the new topic).

#### `wake-logs-digest-cron` (legacy — now a step in daily pulse)

| | |
|---|---|
| Type | Cloud Function Gen1, `pubsub.schedule` |
| Trigger | Daily at 19:00 Bogotá |
| Source | Cloud Logging API, project `wolf-20b8b` |
| Scope | `severity >= WARNING` across all functions (Gen1 + Gen2 `api`), last 24h |
| Output | Full digest posted to `wake_ops` via `@signals_wake` — top error signatures grouped by function, with NEW vs SPIKING sections |
| State | `ops_logs_state` Firestore collection: one doc per fingerprint with `firstSeen`, `lastSeen`, `counts` (7-day rolling window) |
| Reports | None as files — the Telegram message IS the report. Historical browsing via Telegram scrollback + Cloud Logging queries. |

**Fingerprint rule:** `sha1({functionName} + {errorType} + normalize(message))` where `normalize` strips UUIDs, timestamps, email addresses, and long numeric IDs. Same bug recurring = same fingerprint.

**Telegram payload example:**

```
[wake-logs-digest] 2026-04-17 · prod · 3 new · 2 spiking

NEW
• createPaymentPreference — TypeError: Cannot read 'courses' of undefined (12 occurrences)
• api /workout/complete — ValidationError: setId required (4)
• nutritionFoodSearch — FatSecret timeout (3)

SPIKING (vs 7d avg)
• processPaymentWebhook — HMAC mismatch: 34 (avg 2, +1600%)
• api /nutrition/diary — Firestore DEADLINE_EXCEEDED: 18 (avg 5, +260%)

Full report: ops/reports/wake-logs/2026-04-17.md
```

#### `wake-deploys-notify`

| | |
|---|---|
| Type | Firebase `postdeploy` hooks in `firebase.json` (per target) |
| Trigger | Runs automatically after every successful `firebase deploy` — no change to your workflow |
| Per-target hooks | One postdeploy hook on `functions`, one on `hosting`. Each calls `./scripts/ops/notify-deploy.sh <target>` |
| Script behavior | See "Commit strategy" below. After commit logic, POST to Telegram with commit + scope info. |
| On failure (hook itself fails) | Best effort — never fail the deploy. The script exits 0 even on notification errors; errors go to stderr. |

**Rationale for `postdeploy` hooks (not a wrapper script):** You run `firebase deploy` directly. A wrapper (`npm run deploy`) would require changing your muscle memory and would silently miss any invocation that forgets the wrapper. Postdeploy hooks are invisible — same command, same flags, same output, plus the notification. They're also per-target: if you run `firebase deploy --only functions`, only the functions hook runs, so we naturally get the right scope without parsing flags.

**Commit strategy (hybrid — option C):**

The script inspects the working tree after the deploy succeeds:

1. **Working tree dirty** — there are uncommitted changes (i.e. you deployed work-in-progress):
   - `git add -A`
   - `git commit -m "deploy({target}): {YYYY-MM-DD HH:mm}"`
   - `git push origin HEAD`
   - Capture the new commit for Telegram

2. **Working tree clean** — your code was already committed before deploy:
   - No new commit
   - `git push origin HEAD` (no-op if already pushed; safe otherwise)
   - Capture existing HEAD for Telegram

Either way, after the script runs: **git HEAD matches what's deployed**, and the latest commit is pushed to GitHub.

**No separate deployment log file.** Git history *is* the deployment log. Deploy commits are discoverable via `git log --grep "^deploy("`. The smart agent can query this to reason about deploy history; humans can read it on GitHub.

**Multi-target deploys:** `firebase deploy` (no `--only`) fires the hook for every target in turn. The first hook may auto-commit + push; subsequent hooks for the same invocation see a clean tree and just send Telegram messages referencing the same commit. Net result: one commit per `firebase deploy` invocation, one Telegram message per target deployed.

**Telegram message:**

```
[wake-deploys] functions · deployed
commit c4f8e21 — "deploy(functions): 2026-04-17 19:03"
by emilio · wolf-20b8b
```

Fields: target (from hook arg), short commit hash, commit subject, git author, Firebase project.

#### `wake-signals-webhook` (on-demand trigger)

Sits alongside the scheduled collectors. Lets you run any collector on demand by sending a command to `@signals_wake` in the `wake_ops` group.

| | |
|---|---|
| Type | Cloud Function Gen2, HTTPS (Telegram webhook target) |
| Trigger | Telegram POSTs to this URL when someone sends a `/command` to `@signals_wake` |
| Auth | Verifies `X-Telegram-Bot-Api-Secret-Token` header against `TELEGRAM_WEBHOOK_SECRET`; rejects requests from any chat other than `TELEGRAM_CHAT_ID` |
| Available commands | `/logs`, `/heartbeat`, `/payments`, `/quota`, `/pwa_errors`, `/creator_errors`, `/all`, `/help` |
| Output | Posts the collector's normal digest output back to the group, prefixed with a `[signals_wake] running /cmd...` ack |
| Command registry | `functions/src/ops/commands.ts` — adding a new collector = one entry in this registry, and `/all` picks it up automatically |

**Why this exists:** scheduled runs are great for daily digests but no use when you want to see what's happening *right now* — especially during incident investigation or local development. The webhook gives you manual escape hatches without building separate admin tooling.

**One-time setup (after first deploy):**

```bash
bash scripts/ops/register-signals-webhook.sh
```

Script calls Telegram's `setWebhook` + `setMyCommands` so the bot's webhook URL points at the Cloud Function and commands autocomplete in the Telegram UI. Idempotent — safe to re-run if the URL changes.

### 3. Smart agent — `wake-ops-agent`

**Hybrid architecture — each mode hosted where it makes economic sense:**

#### Mode A — scheduled synthesis (runs on Claude Max subscription)

| | |
|---|---|
| Type | Claude Code scheduled trigger (via `/schedule` skill) |
| Hosting | Anthropic infra, runs under your Claude Max subscription |
| Trigger | Cron, daily at 19:30 Bogotá (30 min after log digest) |
| Input | Last 24h of `wake_ops` group messages + recent git log for deploys + recent daily reports |
| Output | One synthesized message posted to `wake_ops` as `@agent_wake` |
| Cost | Zero additional cost — rides on existing Max plan |

The synthesis message correlates signals: *"logs show X errors on `/workout/complete` starting at 14:35, which aligns with the 14:32 functions deploy (commit f6656ce). Likely regression."*

**Why on subscription, not API:** synthesis is the high-volume path (runs daily over 24h of context — biggest token cost of the system). Riding the Max plan makes it effectively free. The tradeoff is the trigger lives in Claude Code's scheduler rather than Firebase — but that's fine, it's a cron job either way.

#### Mode B — interactive @mention handler (runs on Anthropic API)

| | |
|---|---|
| Type | Cloud Function, HTTPS (Telegram webhook target) |
| Hosting | Firebase (`wolf-20b8b`) |
| Trigger | Telegram webhook fires when `@agent_wake` is mentioned in the group |
| Input | The @mention message + recent group history (via Telegram `getUpdates`) |
| Output | A reply posted to the group |
| Cost | Anthropic API tokens — realistically $1–3/mo given low @mention volume |

**Why on API, not subscription:** Telegram webhooks need a public HTTPS endpoint that responds synchronously. That requires a hosted service (Cloud Function), which requires programmatic Claude access — the API. Subscription auth is not portable into a headless runtime. The cost is trivial because @mentions are sporadic.

**How it works:** Telegram Bot API is configured with a webhook URL pointing at this function. Every group update comes in; the function filters for `@agent_wake` mentions, pulls recent group history via `getUpdates`, calls Claude via Anthropic SDK with the full context, posts the reply.

**Shared prompt/tools:** Both modes use the same system prompt, tool definitions, and behavior contract. Mode A's prompt lives in the scheduled trigger definition; Mode B's prompt lives in `functions/src/ops/agent.ts`. Keep them in sync manually — or extract to a shared doc (`docs/ops/agent-prompt.md`) that both reference.

---

## Conventions (lock in today)

These are zero-cost today and high-cost to retrofit. Following them lets the future meta-assistant "just work."

### Naming

- **Collectors:** `{project}-{signal}-{mode}` — e.g. `wake-logs-digest-cron`, `wake-deploys-notify`
- **Agents:** `{project}-ops-agent`
- **Telegram groups:** `{project}_ops`
- **Telegram bot usernames:** `{role}_{project}` — e.g. `signals_wake`, `agent_wake`. Future projects follow the same pattern (`signals_sideproject`, `agent_sideproject`), so all "signals" bots group together in your Telegram bot list, all "agent" bots group together.
- **Message tags:** `[{source-name}]` as first token in every Telegram message

### Directory layout

Wake Ops stores nothing in the repo filesystem beyond code. All runtime state lives in Firebase:

- **Deploy history:** git commits with messages matching `^deploy(...):` — query via `git log --grep "^deploy("`
- **Log digest state:** `ops_logs_state` Firestore collection — one doc per error fingerprint
- **Log digest reports:** Telegram group scrollback (messages tagged `[wake-logs-digest]`)

If a future meta-assistant needs to reason across projects, it reads git log and queries Firestore / Telegram. No filesystem sync needed.

### Secrets

Stored in **Firebase Secret Manager** (never `.env`, never committed):

| Secret | Used by | Required |
|---|---|---|
| `TELEGRAM_SIGNALS_BOT_TOKEN` | Collectors + signals webhook | Yes |
| `TELEGRAM_AGENT_BOT_TOKEN` | Agent Mode B (@mention Cloud Function) | When Phase 3 ships |
| `TELEGRAM_CHAT_ID` | Collectors + agent + signals webhook auth | Yes |
| `TELEGRAM_TOPICS` | JSON map of topic name → `message_thread_id` for the `wake_ops` supergroup. When absent, posts land at group root. | Yes (when Forum Mode is on) |
| `TELEGRAM_WEBHOOK_SECRET` | Signals webhook — verifies requests come from Telegram | Yes |
| `OPS_API_KEY` | `wakeOpsApi` read-only endpoint. Any long random string; rotated via Secret Manager. | Yes (for ops API) |
| `ANTHROPIC_API_KEY` | Agent Mode B only | When Phase 3 ships |

The local `notify-deploy.sh` script (run by the Firebase `postdeploy` hook on your machine) reads `TELEGRAM_SIGNALS_BOT_TOKEN` / `TELEGRAM_CHAT_ID` from a gitignored `.env.ops` in the repo root.

**Mode A (scheduled synthesis) doesn't need API secrets** — it runs inside Claude Code under your subscription. It does need the agent bot token + chat ID to post to Telegram, which are provided to the scheduled trigger's environment when we create it.

GCP Cloud Logging read access: the default Cloud Functions service account in `wolf-20b8b` should already have it. If not, grant `roles/logging.viewer` to `wolf-20b8b@appspot.gserviceaccount.com`.

---

## Today's build plan

Phased. Each step is independently testable.

### Phase 1 — Telegram bus

1. Create `@signals_wake` bot via @BotFather (privacy enabled — doesn't need to read messages)
2. Create `@agent_wake` bot via @BotFather (privacy disabled — needs to read group messages for @mention handling)
3. Create `wake_ops` Telegram group → add both bots as admins → capture chat ID
4. Store both tokens + chat ID in Firebase Secret Manager + local `.env.ops`

### Phase 2 — Dumb collectors

3. `wake-logs-digest-cron` Cloud Function — queries Cloud Logging, fingerprints errors, updates Firestore state, posts digest
4. `wake-deploys-notify` — `scripts/ops/notify-deploy.sh` + `postdeploy` hooks wired into `firebase.json` for `functions` and `hosting` targets; logs + commits + posts on every `firebase deploy`
5. `wake-signals-webhook` Cloud Function + `scripts/ops/register-signals-webhook.sh` — lets you run any collector on demand via `/logs`, `/all`, `/help` commands to `@signals_wake`

### Phase 3 — Smart agent (hybrid)

5. **Mode A (subscription):** Create a Claude Code scheduled trigger via the `/schedule` skill. Prompt instructs the agent to read recent group messages + git log + reports, then post synthesis to `wake_ops` via `@agent_wake`. Cron: daily 19:30 Bogotá.
6. **Mode B (API):** Cloud Function at `functions/src/ops/agentWebhook.ts` receiving Telegram webhook, filtering for `@agent_wake` mentions, calling Anthropic SDK, posting replies. Register webhook via Telegram Bot API `setWebhook`.

Phases 1 and 2 deliver value standalone — if we stop after Phase 2, we have working daily log digests + deploy notifications. Phase 3 adds the reasoning layer on top.

---

## Out of scope (explicitly not building today)

- More collectors (payment anomalies, slow queries, frontend errors, subscription churn)
- Meta-assistant across multiple project groups
- Splitting `wake_ops` into raw + digest groups
- Staging environment coverage (prod only for now)
- CI-based deployment (local wrapper for now)
- Interactive dashboards or web UI

These all layer cleanly on top of what we're building. None are blocked by today's choices.

---

## Open questions before Phase 1

None — all decisions confirmed:

- Schedule: daily 19:00 Bogotá for logs digest, 19:30 for agent synthesis
- Scope: prod only (`wolf-20b8b`), WARNING+
- Delivery: Telegram `wake_ops` group
- State/reports: committed to repo under `ops/`
- Deploy detection: Firebase `postdeploy` hooks in `firebase.json` (no workflow change — you keep running `firebase deploy` as normal)
- Agent hosting: **hybrid** — Mode A (daily synthesis) runs on Claude Code scheduled triggers under the Max subscription (no token cost); Mode B (@mention webhook) runs as a Cloud Function in `wolf-20b8b` using Anthropic API (low-volume, ~$1–3/mo)

Ready to start Phase 1 once the Telegram bot exists and the chat ID is captured.
