# Security audit & fix campaign — May 2026 archive

Archived 2026-05-01. Read this section before reading anything else in
this directory.

## Status

**Code work: complete.** Every actionable security finding from this
audit cycle is closed in code or explicitly accepted with audit-prose
justification. The four critical chains (privilege escalation,
free perpetual enrollment, field-path injection, cross-creator IDOR)
are closed. Round 2 closeout (the original deferred-rules list, F-OPS-05
agent removal, F-NEW-03 API key auto-revoke, system_email_budget /
rate_limit_* TTLs) shipped on the same branch.

Branch: `security-fix-campaign`, commits `2464552` → `571d11b` (plus the
docs-archive move that introduced this README).

## What's in this directory

| File | What it is |
|---|---|
| [SECURITY_AUDIT_2026-04-30.md](SECURITY_AUDIT_2026-04-30.md) | The original audit doc (~3,000 lines). Sections §0–§14 are the original findings. §15 is Phase 0 ops state. §16 is the fix-campaign execution log. §16.7 is the deploy runbook (paths updated to point at the archived migration scripts). |
| [SECURITY_FIX_CAMPAIGN_PROMPT.md](SECURITY_FIX_CAMPAIGN_PROMPT.md) | The prompt used to brief the agent that implemented Tiers 1-8. |
| [SECURITY_FIX_DECISIONS.md](SECURITY_FIX_DECISIONS.md) | Pinned decisions (canonical naming per collection, override regex, daily email ceiling, role enum). |

The independent review doc (`SECURITY_FIX_CAMPAIGN_REVIEW.md`) lives on
the `security-fix-campaign-review` branch only — it was never merged to
the main work branch.

## Open items NOT closed in code (operator action required)

These were never code work; they need you to do them in a dashboard:

1. **§15.5 — Resend reputation glance.** Log into resend.com, check
   sender reputation, bounce rate (<2%), spam rate (<0.1%). 5 min.
2. **§15.6 — MercadoPago `processed_payments` reconciliation.** Pull
   MP's payment report for the last 30-60 days, diff against
   `processed_payments` Firestore. ~30 min.
3. **§15.2 — GitHub branch protection on `main`.** Audit claims this
   was done 2026-04-30 in the GitHub UI. Verify it's still in place
   before the next high-stakes deploy.

## Post-deploy hygiene window

Items that intentionally stay live for a window after deploy and should
be removed once the window expires:

- **Legacy unkeyed-SHA unsubscribe-token branch** in
  `functions/src/api/services/emailHelpers.ts:verifyUnsubscribeToken`
  — drop ≥30 days post-deploy. Calendar reminder.
- **Legacy `assignedBy` fallback** in `nutrition_assignments` /
  `client_nutrition_plan_content` read predicates in
  `config/firebase/firestore.rules` — drop after
  `naming-drift-normalize.js --apply` runs on prod and a full week
  confirms no stragglers.
- **`purchases` Firestore collection** — has 0 docs in prod, locked
  to admin-only writes. Safe to delete from Firebase Console if you
  don't intend to use it.

## Items deliberately accepted (no rule change)

- **F-RULES-20** (bundle status state-machine): no review/approval
  workflow added; bundles can self-publish per product intent.
- **F-RULES-22** (event creator can mutate any registration field):
  audit prose says "Probably fine given it's their event."
- **F-RULES-38** (storage rule cross-service `firestore.get` perf):
  informational, not a vuln.
- **F-CFG-08** (post-deploy hook bash unsigned): low / informational.
- **`wake_users_only` event-flag mutability**: creator can change it
  on their own event; accepted.

## Migration scripts

Moved to [scripts/archive/security-2026-05/](../../../scripts/archive/security-2026-05/).
The §16.7 deploy runbook in `SECURITY_AUDIT_2026-04-30.md` references
the new path. `shape-analysis.js` is the only one designed for re-use
in future audit cycles — it's a read-only PII-redacting prod data shape
sampler.

## How to read this archive vs running a fresh audit

If you are an auditor doing a NEW audit pass: **DO NOT READ THE FILES
IN THIS DIRECTORY** until you have written your own findings against
HEAD. Anchoring bias is real. Read this archive only at the very end,
to write a "delta vs prior cycle" section comparing what you found vs
what was already on file.

Code comments throughout the repo reference finding IDs from this
audit (`F-RULES-01`, `F-API1-14`, etc.). Treat each comment as a
**claim** that needs verification, not as proof of fix. The fix may
have regressed since this audit was written.
