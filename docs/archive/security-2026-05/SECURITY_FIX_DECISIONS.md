# Wake security fix campaign — decisions log

Pinned decisions referenced by the migration scripts in `scripts/security/`
and the rules / API code in Tiers 1-8 of the campaign described in
[`SECURITY_FIX_CAMPAIGN_PROMPT.md`](SECURITY_FIX_CAMPAIGN_PROMPT.md).

Every decision below was made on **2026-04-30** based on the production
shape findings in [`SECURITY_AUDIT_2026-04-30.md`](SECURITY_AUDIT_2026-04-30.md)
§11. Each row gives the choice + 1-3 sentences of rationale.

---

## 1. F-DATA-01 canonical naming per collection

| Collection | Field group | Canonical | Why |
|---|---|---|---|
| `events` | creator id | `creator_id` (snake) | 73% of prod docs already match (§11.1.4). Cheaper to rewrite the 27% than to swap the rule. |
| `events` | timestamps | `created_at` / `updated_at` (snake) | Matches the rest of Wake's snake-case convention (`courses`, `plans`, `client_sessions`). |
| `events` | capacity | `max_registrations` (snake) | Same convention. |
| `events` | access model | `access` (existing field) | F-DATA-03: `wake_users_only` was rule-only and never written by code. We adopt the actually-written field; rule fix in Tier 6 references `access`. |
| `events` | status enum | `active \| closed \| draft` | §11.1.6: the three values present in prod. Rule must accept all three. |
| `bundles` | creator id | `creatorId` (camel) | 100% of prod docs match (§11.1.4). No data churn; would just create new drift. |
| `bundles` | course list | `courseIds` (camel) | F-DATA-08: only one shape in prod. |
| `courses` | creator id | `creator_id` (snake) | 100% of prod docs match. |
| `courses` | status | `draft \| published` (English) | §11.1.8: the actual prod values. The rule reference to `'publicado'` is dead code and gets fixed in Tier 1 alongside F-RULES-19. |
| `plans` | creator id | `creator_id` (snake) | 100% of prod docs match. |
| `nutrition_assignments` | creator id | `creator_id` (snake) | 100% have it; `assignedBy` is a duplicate (§11.1.4 / F-DATA-06) and gets dropped. |
| `nutrition_assignments` | client id | `userId` (camel) | 100% have it; `clientUserId` only on 85% and is a duplicate (F-DATA-06). |
| `processed_payments` | user / course | `userId` / `courseId` (camel) | Dominant shape today. |
| `processed_payments` | payment id / time | `payment_id` / `processed_at` (snake) | Already canonical per §11.1.4. |
| `one_on_one_clients` | creator id | `creatorId` (camel) | 100% camel in prod. |
| `one_on_one_clients` | status | `active \| inactive` enum, mandatory | F-DATA-07: 60% missing today; backfill writes `active` (or `inactive` if `endedAt` set). |
| `event_signups/{eventId}/registrations` | full schema | snake/Spanish (`nombre`, `responses`, `checked_in`, `created_at`) | F-DATA-12: 90% already this shape. Rewriting the 10% camel/English is one migration script. |

Anything not listed above keeps its current convention; the audit didn't
flag it as drifted in §11.1.4.

---

## 2. F-DATA-13 — courses auth-gating

**Decision: keep the auth gate (current state).** `allow read: if isSignedIn()`
on `courses/{courseId}` stays as-is.

**Why:** the landing page currently reads marketing assets from
`app_resources/*` (a separate, public collection). It does not read
`courses/*` directly. The PWA + creator dashboard always have an authed
user. Loosening to `allow read: if true` for `status: 'published'` would
add complexity (status values drift — see §11.1.8 — `'published'` is only
1/15 docs today) and unblock a use case nobody is asking for.

If a public course-discovery surface is ever built, expose it via a
dedicated Cloud Function returning a curated DTO via Admin SDK, not by
opening the rule.

---

## 3. F-API1-15 override-path allowlist regex

**Pinned regex:**
```
^overrides\.[A-Za-z0-9_-]{1,64}\.[A-Za-z0-9_-]{1,64}$
```

**Why:** the legitimate write path is `overrides.<weekKey>.<exerciseId>`,
where weekKey is `YYYY-WW` and exerciseId is a Firestore-generated id —
both 7-30 chars, alphanumerics + dashes. Capping at 64 bounds the path
length. Rejecting `..`, `/`, spaces, and special characters blocks every
field-path injection variant in the audit's §3 fuzz set. Two segments
exactly — no nested-arbitrary-depth.

---

## 4. F-NEW-02 daily email ceiling

**Pinned:** **5,000 emails/day** system-wide.

**Why:** Wake has 65 users and Resend free tier is 3,000/day plus per-day
spike capacity. 5k gives 6× headroom on the free tier and ~75× current
real send volume (event confirmations are <100/day even on launch days).
Implementation note: hard-stop in transaction means a single attacker
trying to flood the queue burns the budget for the day rather than
running up the bill — explicit exposure cap.

---

## 5. Custom-claim role canonical values

**Pinned:** `["user", "creator", "admin"]`. Empty string and missing
claim default to `"user"`.

**Why:** matches the existing Firestore `role` enum. No code anywhere
writes a fourth value. Defaulting missing/empty to `"user"` is the
existing safe behaviour and matches §11.1.2's "100% empty claims" reality
on the day of deploy — every existing user becomes `"user"` until
phase1-claim-backfill stamps creators / admins.

---

## 6. `processed_payments.state` vs `.status` (F-DATA-05)

**Decision:** keep both for now. **Out of scope** for Tier 8.

**Why:** the audit flagged this as Low / informational. The webhook code
writes both atomically; nothing reads the divergence. Picking one and
migrating is cleanup work that doesn't close a finding — defer to Round 2.

---

## 7. `courses.deliveryType: "general"` (§11.1.7)

**Decision:** treat `general` as `low_ticket` for the purposes of every
fix in this campaign. **No data migration.**

**Why:** only 2 prod courses use it; the F-API1-19 fix changes truthy
checks to `=== 'active'`, which is orthogonal to deliveryType. Renaming
`general` → `low_ticket` would touch user-visible course pages without
clearing a finding. Defer.
