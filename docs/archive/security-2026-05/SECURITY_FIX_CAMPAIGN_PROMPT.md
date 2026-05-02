# Wake security fix campaign — agent prompt

Copy this entire document into a fresh chat. It is a self-contained brief
for an agent that will implement every code change required by the
security audit, with full test coverage, on a single feature branch, and
**without deploying anything to production.**

---

## Mission

Implement every code-level fix called for in the Wake security audit at
[`docs/SECURITY_AUDIT_2026-04-30.md`](SECURITY_AUDIT_2026-04-30.md), keep
the existing test suite at `functions/tests/` green throughout, and write
the migration scripts that Phase B execution will eventually need.

You are not deploying. You are not pushing to remote. You are not running
migration scripts against production. You are building a feature branch
that, when later approved by the user, can be deployed in one atomic
session.

## Hard constraints — never violate

1. **NO `firebase deploy`** in any form. Not functions, not hosting,
   not rules, not storage. The user runs the deploy themselves later.
2. **NO `git push`** unless the user explicitly says push. Stay on a
   single feature branch (suggest `security-fix-campaign`).
3. **NO `gh pr create`** until the user requests it.
4. **NO Admin SDK writes against the production project.** Migration
   scripts must default to `--dry-run`, log what they would do, and only
   touch the emulator unless explicitly invoked against `wolf-20b8b`.
5. **NO new findings expanded into the campaign.** The audit doc is the
   spec. If you discover something new, add it to a `docs/SECURITY_ROUND_2.md`
   file for a future cycle. Do not silently expand scope.
6. **NO refactoring beyond what each fix requires.** A bug fix doesn't
   need surrounding cleanup; a one-shot operation doesn't need a helper.
   Three similar lines is better than a premature abstraction.
7. **NO speculative defense.** Only close the findings the audit lists.
   Future hardening is a separate campaign.
8. **NO scope creep onto Phase 7 / cleanup items.** Tiers 1-6 (and the
   F-DATA-01 naming-drift sweep) are in scope. Tier 7 cleanup, F-DRIFT-01
   data-model consolidation, and the deferred-by-design items in §13.5
   are out of scope.

## Read these first (in order)

1. **`docs/SECURITY_AUDIT_2026-04-30.md`** — the audit doc. ~2,725 lines.
   Sections to skim: §7 (chains), §9.5 (priority list), §11 (prod data
   shape), §13 (corrections), §15 (Phase 0 done state). The per-finding
   prose in §1-§10 is reference, not required reading.
2. **`functions/tests/README.md`** — test suite layout + how to run.
3. **`functions/tests/rules/_helper.ts`** and **`functions/tests/api/_helper.ts`** —
   shared test scaffolding patterns. Match this style for any new tests.
4. **`CLAUDE.md`** — project conventions. Do not violate the engineering
   principles section (no TypeScript in PWA/dashboard/landing, no
   Redux/Zustand, single `index.ts` for Firebase exports, etc.).
5. **`scripts/security/shape-analysis.js`** — production data-shape tool.
   Re-run before any rule lockdown PR to confirm no shape regressions.

## Current state (2026-04-30 baseline)

- **278 tests** across 21 test files; pre-fix run: 237 passed + 41
  expected-fail (`it.fails(...)` BUG-asserts) + 0 unexpected failures.
  Full suite runs in ~46s against the full emulator stack.
- **~229 findings** cataloged in the audit doc.
- **Phase 0 ops items:** Object Versioning + 90-day lifecycle done; branch
  protection done; Auth custom claims confirmed empty (66 users, 0 claims);
  `APP_CHECK_ENFORCE` confirmed unset (safe default).
- **Production data is small:** 65 users, 15 courses, 14 plans, 2 bundles,
  25 one_on_one_clients, 2 processed_payments, 0 purchases.

## Order of work — execute in this exact sequence

Each tier ends with all its `it.fails` tests flipped to passing. Run the
test suite at the end of each tier; do not advance to the next until the
expected number of tests have flipped.

### Tier 0 — Migration script scaffolding (1 PR-equivalent commit)

Write but do not execute:

1. **`scripts/security/phase1-claim-backfill.js`** — Admin SDK script that
   reads `users/{uid}` where `role in ['creator', 'admin']`, calls
   `setCustomUserClaims(uid, {role: data.role})`, logs the count.
   Defaults to `--dry-run`; requires explicit `--apply`. Refuses to run
   against `wolf-20b8b` without `--confirm-prod`.
2. **`scripts/security/exercises-library-cleanup.js`** — F-API2-05 legacy
   data cleanup. For each `exercises_library/*` doc, identify top-level
   keys outside the canonical set (`exercises`, `creator_id`, `creator_name`,
   `title`, `created_at`, `updated_at`, `image_url`); move them under
   `exercises[<originalKey>]` if they look like exercise entries; delete
   the top-level field. Same `--dry-run` / `--apply` / `--confirm-prod`
   pattern.
3. **`scripts/security/naming-drift-normalize.js`** — F-DATA-01 sweep.
   Picks one canonical naming convention per collection (decide and
   document in `docs/SECURITY_FIX_DECISIONS.md`):
   - `events`: pick `creator_id` (snake) — 73% of docs already match.
     Rewrite the 27% that have `creatorId`.
   - `events`: pick `created_at`/`updated_at`/`max_registrations` (snake).
   - `nutrition_assignments`: keep `creator_id` and `userId` as canonical;
     drop `assignedBy` and `clientUserId` duplicates.
   - All others: document the choice.
   Same dry-run pattern.
4. **`scripts/security/one-on-one-clients-status-backfill.js`** — F-DATA-07.
   Sets `status: 'active'` (or `'inactive'` if `endedAt` is set) on the
   ~15 of 25 docs missing it.
5. **`scripts/security/registrations-schema-unify.js`** — F-DATA-12.
   Picks canonical schema (suggest snake/Spanish since 90% match).
   Rewrites 10% camelCase to snake.
6. **`scripts/security/pre-deploy-check.js`** — runs all migrations in
   `--dry-run` against the local emulator with redacted prod-snapshot data
   imported. Catches "rule denies legacy doc" before deploy.
7. **`scripts/security/post-deploy-smoke.js`** — fires ~30 attack payloads
   at the emulator to confirm fixes are in.

Each script: `--dry-run` is the default. `--apply` writes. `--confirm-prod`
is required for `wolf-20b8b` target. Without `--confirm-prod`, the script
refuses to run against the prod project ID (matches the existing pattern
in `scripts/clone-to-staging.js`).

### Tier 1 — Identity / role lockdown (chain-killers)

Order matters. Ship F-FUNCS-14 BEFORE F-RULES-01 in deploy sequence; in
this branch, both land together but the audit doc's deploy-script will
order them.

- **F-FUNCS-14** — `functions/src/index.ts` `onUserCreated` handler:
  always seed `role: "user"`. Remove the read of `users/{uid}.role`
  before the create. The handler must NEVER call `setCustomUserClaims`
  with anything other than `{role: "user"}` (or no call at all). Promotion
  to creator/admin happens via a separate Admin-SDK-only path.
- **F-RULES-01 / F-RULES-02** — `config/firebase/firestore.rules`,
  `users/{uid}` update rule. Replace the current permissive update with
  a `affectedKeys().hasOnly([allowlist])` rule. The allowlist must NOT
  include `role`, `courses`, `subscriptions`, `email`, `email_verified`,
  `trial_used`, `purchased_courses`, `username`, `created_at`. It SHOULD
  include `displayName`, `photoURL`, `onboardingData`, `creatorOnboardingData`,
  `socialLinks`, `creatorNavPreferences`, `pinnedTrainingCourseId`,
  `weightUnit`, `bodyweight`, `goalWeight`, `lastSessionDate`, etc.
  Audit the full set against §11.1.4 production fields. Also remove the
  Firestore `users/{uid}.role` fallback in `getUserRole()` — read only
  from custom claim.
- **F-MW-08** — `functions/src/api/middleware/auth.ts:303-307` and `:219-222`.
  Replace `userData.role` reads with `decoded.role`. Token must carry the
  claim; if not, default to `"user"` (no Firestore fallback).

After Tier 1: ~12 of the 41 `it.fails` tests should flip to passing.
Specifically the F-RULES-01 mass-assignment tests, F-NEW-01/05/06,
F-DRIFT-04/06 vulnerability tests in `tests/rules/security.users.test.ts`,
plus F-RULES-01 property-based tests in `tests/rules/security.property.test.ts`,
plus the C-01 chain assertion in `tests/security/chains.test.ts`.

Drop `.fails` from each test that should now pass; re-run; confirm 12+
flips with no regressions to the 237 passing tests.

### Tier 2 — Monetization bypass

- **F-API1-14** — `functions/src/api/routes/workout.ts:2617-2646`:
  `POST /workout/client-programs/:programId` must verify caller has an
  active `one_on_one_clients/{creatorId}_{auth.userId}` row where
  `creatorId == courses/{programId}.creator_id` AND `status == 'active'`.
  Reject otherwise.
- **F-API1-05** — `functions/src/api/routes/profile.ts:503-542`:
  backfill must check the same `one_on_one_clients` membership instead of
  the self-creatable `client_programs` row. Match Tier 2's F-API1-14 fix.
- **F-API1-08** — `functions/src/api/routes/profile.ts:933-953`:
  block `DELETE /users/me/courses/:courseId` when the entry's
  `bundlePurchaseId` exists in `processed_payments` (i.e., webhook-granted
  active courses cannot be deleted).
- **F-NEW-07 / F-SVC-01** — `functions/src/api/services/bundleAssignment.ts`
  lines 70-83: after the `db.getAll(...courseRefs)` call, assert each
  `courseDoc.data().creator_id === bundleData.creatorId`. If any mismatch,
  refuse the entire grant and log a warning.

After Tier 2: ~6 more `it.fails` flip. Specifically the F-API1-05/14/08
tests in `tests/api/security.workout.test.ts` and `tests/security/chains.test.ts`
(C-02, C-04 step-1), plus F-NEW-07 in `tests/api/security.bundle.test.ts`.

### Tier 3 — Cross-creator IDOR sweep

Single PR-equivalent commit applying `verifyProgramOwnership` everywhere
it's missing in `functions/src/api/routes/creator.ts`:

- Lines 6160-6170 (DELETE program from client courses map)
- Lines 6173-6206 (PATCH expires_at)
- Lines 6209-6242 (PUT/DELETE schedule/:weekKey)
- Lines 3303-3413 / 3416-3504 / 3507-3538 (client_plan_content GET/PUT/PATCH)

For each, before the mutation, fetch `courses/{programId}.creator_id` and
require it to match `auth.userId`. Use a helper:
```ts
async function verifyProgramOwnership(programId: string, callerUid: string) {
  const c = await db.collection("courses").doc(programId).get();
  if (!c.exists || c.data().creator_id !== callerUid) {
    throw new WakeApiServerError("FORBIDDEN", 403, "Program not owned");
  }
}
```

Also Tier 3 — field-path injection:

- **F-API2-05** — `functions/src/api/routes/creator.ts:8214-8237`:
  validate `body.name` against `/^[\w\s-]+$/` (alphanumeric + space + hyphen
  + underscore only). Reject reserved Firestore fields (`creator_id`,
  `creator_name`, `title`, `exercises`, `created_at`, `updated_at`,
  `image_url`). Drop the legacy dual-write at line 8232 — write only into
  `exercises[<id>]`.
- **F-API1-15** — `functions/src/api/routes/workout.ts:2649-2687`:
  validate `body.path` against an allowlist regex (e.g.,
  `^overrides\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/`).

After Tier 3: ~14 more `it.fails` flip. Plus the F-API2-05 fuzz tests
in `tests/api/security.fieldpath-fuzz.test.ts` should mostly transition
from "200/500 (bug)" to "400 (fix)".

### Tier 4 — Content theft

- **F-API1-17** — `functions/src/api/routes/workout.ts:3057-3077`:
  add ownership check. Caller must be: plan creator OR have an active
  enrollment in some `users/{uid}.courses[*]` whose `planAssignments`
  references this `planId` OR admin.
- **F-API1-16** — drop `planAssignments` from `pickPublicCourseFields`
  (`functions/src/api/middleware/securityHelpers.ts:481-501`). Or move it
  to a creator-only response shape.
- **F-API1-18** — `functions/src/api/routes/workout.ts:3029-3055`:
  assert `users/{auth.userId}.courses[programId].status === 'active'`
  before returning.
- **F-API1-19** — every override endpoint (workout.ts:2452-2560): change
  the truthy check to `=== 'active'`.

After Tier 4: ~5 more `it.fails` flip.

### Tier 5 — External attack surface

- **F-CFG-01** — add Content-Security-Policy headers in `firebase.json`
  hosting.headers section. One CSP per app prefix (`/app/**`, `/creators/**`,
  `/`). Use the strict template from §8.4.
- **F-CFG-02** — add `X-Frame-Options: DENY` in the global headers block.
- **F-CFG-05** — `apps/pwa/src/config/firebase.js:44-52`: change
  `if (RECAPTCHA_SITE_KEY) { … }` to a hard error in production:
  `throw new Error('RECAPTCHA_SITE_KEY missing — refusing to start')`.
  Allow only when `EXPO_PUBLIC_FIREBASE_ENV === 'staging'` or emulator.
- **F-RULES-26 / F-RULES-27 / F-RULES-28** — `config/firebase/storage.rules`:
  bind writes to program/event creator via
  `firestore.get(/databases/(default)/documents/courses/$(programId)).data.creator_id == request.auth.uid`
  for course paths, and analogous for events. For tutorials path use the
  4-segment match (per §13.3).

After Tier 5: storage rule tests in `tests/rules/security.storage.test.ts`
flip; F-CFG-* tests don't exist in the suite (config tests are out of
emulator scope), so verify by inspection of `firebase.json`.

### Tier 6 — Email abuse + per-system budget

- **F-FUNCS-17** + **F-RULES-06** + **F-RULES-41** — bind event registration
  email to authed user. In the rule: when authed,
  `request.resource.data.userId == request.auth.uid && request.resource.data.email == request.auth.token.email`.
  When unauthed, force `userId == null` and rate-limit at the trigger
  function (already drafted as F-NEW-02 below).
- **F-FUNCS-04** — `functions/src/index.ts:304`: require
  `payer_email == users[uid].email` (read from Firestore via Admin SDK).
- **F-FUNCS-20** — HMAC the unsubscribe token with a server secret
  (`UNSUBSCRIBE_SECRET` via Firebase Secret Manager). Verify with
  `crypto.timingSafeEqual` in the unsubscribe endpoint.
- **F-API2-09** — `functions/src/api/routes/email.ts:116-125`: drop the
  fallback to `responses[*email*]`. Use only authoritative
  `registration.email`.
- **F-NEW-02** — system-wide email budget. Add a Firestore counter at
  `system_email_budget/{YYYYMMDD}` decremented in a transaction before
  every Resend send (across F-FUNCS-17, F-FUNCS-04, F-API2-07/16,
  F-API2-09 paths). Hard-stop at a per-day ceiling (suggest 5,000/day for
  Wake's current scale).

After Tier 6: ~4 `it.fails` flip + chain test C-15 should transition.

### Tier 7 — Middleware hardening

- **F-MW-01** — `functions/src/api/middleware/appCheck.ts:29-34, 50-60`:
  pin enforcement on outside emulator. The escape hatch should require
  `process.env.FUNCTIONS_EMULATOR === 'true'`.
- **F-MW-02** — wire first-party rate limiter to Firestore-backed
  `checkRateLimit` (existing helper). Drop the in-memory `Map`.
- **F-MW-03** — add IP-based rate limit BEFORE `validateAuth` runs.
  `functions/src/api/app.ts` sequence: IP-rate-limit → CORS → auth.
- **F-MW-04** — `functions/src/api/app.ts`: `app.set('trust proxy', 1)`.
  Read IP via `req.ips[0]`.
- **F-MW-06** — `functions/src/api/middleware/auth.ts:14-35`: cache TTL
  becomes `Math.min(5 * 60_000, decoded.exp * 1000 - Date.now())`. Use
  full SHA-256 (32 bytes) as the cache key.

After Tier 7: time-travel tests in `tests/security/time-travel.test.ts`
all already pass (they're logic tests); the relevant integration tests
in `tests/api/` may flip status codes.

### Tier 8 — F-DATA-01 naming drift sweep

Runs LAST because the rules and API code from Tiers 1-7 already assume
canonical names. This is the data migration that makes that assumption true.

- Run `scripts/security/naming-drift-normalize.js --dry-run` against an
  emulator-imported prod snapshot. Verify the diff is reasonable.
- Update Firestore rules to canonical names (e.g., `events.creator_id`
  not `creatorId`).
- Update relevant API routes if they read the non-canonical name today.
- The actual data migration runs in Phase B execution. The script must
  be idempotent (running twice has the same effect as once).

## Per-fix discipline (applies to every commit)

For every fix:

1. **Find every reader/writer first.** Before changing a field's
   read/write shape, grep:
   ```bash
   grep -rn "users/.*\.role\|users.*role\|\.role" functions/src apps/*/src --include="*.ts" --include="*.js" --include="*.tsx" --include="*.jsx"
   ```
   Each hit must be classified: legitimate (Admin SDK from API), legitimate
   (current code path), or "must update". Document in the commit message.
2. **Update the corresponding test.** For every fix, the matching `it.fails`
   should flip to passing. Drop `.fails` in the same commit. If the test
   doesn't exist, write one in the appropriate `tests/rules/` or `tests/api/`
   file matching the existing pattern.
3. **Run the relevant test suite.** Before committing, run the test file
   that covers the fix. After the full tier ships, run the entire suite.
4. **Don't refactor.** Smallest possible diff. Cleanup is Round 2.
5. **Match existing style.** TypeScript in `functions/`, JavaScript in
   `apps/`. Snake_case for Firestore field naming where the data already
   uses snake. Spanish for user-facing strings.
6. **Comment the WHY only when non-obvious.** Default to no comment.

## How to run tests during the campaign

```bash
# Boot the full emulator stack (one-time, leave running)
cd functions
npm run emu:start

# Re-run after each commit. Adjust the suite scope to match what you
# changed:
WAKE_RUN_API_TESTS=1 npx vitest run tests           # everything (~46s)
npx vitest run tests/rules                          # rules-only (~5s)
npx vitest run tests/rules/security.users.test.ts   # one file
```

Expected after each tier:

| After tier | Total expected flips of `it.fails` to pass |
|---|---|
| 1 | ~12 |
| 2 | ~6 (cumulative ~18) |
| 3 | ~14 (cumulative ~32) |
| 4 | ~5 (cumulative ~37) |
| 5 | varies (storage tests flip) |
| 6 | ~4 |
| 7 | varies (some integration tests flip) |
| 8 | naming-drift tests pass on canonical-shape data |

Final state target: **0 `it.fails` markers remaining** for fixed findings.
The ones for genuinely deferred items (Tier 7 cleanup, F-DRIFT-01) stay.

## Decisions you must make + document

Create `docs/SECURITY_FIX_DECISIONS.md`. For each, write 1-3 sentences of
rationale:

1. **F-DATA-01 canonical naming per collection.** Per the §11 data, suggest:
   - `events`: snake (`creator_id`, `created_at`, `max_registrations`).
   - `bundles`: keep `creatorId` (camel) — 100% of docs.
   - `nutrition_assignments`: snake `creator_id`, drop `assignedBy`.
   - `processed_payments`: pick `userId`/`courseId` (camel) since it's the
     dominant shape.
   Make the call, document it.
2. **F-DATA-13 — courses auth-gating.** The rule requires `isSignedIn()`
   for course reads. If the landing/marketing surface needs anonymous
   reads, options are:
   - Loosen the rule to `allow read: if true` for `status:'published'`.
   - Or expose a public Cloud Function that reads via Admin SDK.
   - Or accept the auth gate (current state).
   Pick one and document.
3. **F-API1-15 override path allowlist regex.** Pin the exact regex.
4. **F-NEW-02 daily email ceiling.** Pin the number (suggest 5000).
5. **Custom claim role canonical values.** `["user", "creator", "admin"]`
   — confirm. Empty string and missing claim default to `"user"`.

## Out of scope (do NOT implement)

- F-DRIFT-01 source-of-truth consolidation (requires product decisions; defer).
- F-NEW-03 API key auto-revoke (architectural decision; defer).
- Most F-OPS-* findings except F-OPS-05 (LLM injection) — defer to Round 2.
- Anything in the §10.3 ops files not already covered.
- F-RULES-04, F-RULES-05 community/events public-read decisions.
- The bundle co-creator collaboration feature design.
- Future co-author program flow design.
- Any test classified as Tier 4-9 in §12 (auth-token edges, mutation
  testing, API fuzzer general, stress) beyond what's already in the suite.

## Done criteria

The branch is ready for the user to deploy when ALL of these hold:

1. **All 8 tiers committed** on a single feature branch (one commit per
   tier minimum, ideally one commit per finding cluster within each tier).
2. **Test suite green:** `WAKE_RUN_API_TESTS=1 npx vitest run tests`
   shows ~278 pass, ~5-10 expected-fail (only the deferred Round 2 items),
   0 unexpected failures.
3. **All 7 migration scripts written** in `scripts/security/` with
   working `--dry-run` mode tested against an emulator-imported prod snapshot.
4. **`scripts/security/pre-deploy-check.js`** runs clean against the
   emulator + redacted snapshot.
5. **`scripts/security/post-deploy-smoke.js`** would pass against a
   post-fix emulator state (you can verify against a local fixture).
6. **`docs/SECURITY_FIX_DECISIONS.md`** documents every decision listed
   in the "Decisions" section above.
7. **`docs/SECURITY_AUDIT_2026-04-30.md`** updated with §16 ("Fix
   campaign execution log") that lists every commit, every test flipped,
   and the final test-run state.
8. **No commits to main.** Everything on the feature branch.
9. **No prod writes.** `git log --all` should show zero pushes;
   `firebase deploy` should not appear in any shell history of this work.

## When you finish

Reply with:

- The branch name.
- Commit log summary (one line per commit).
- Final test-run result (X passed / Y expected-fail / 0 failures).
- A short paragraph naming any decisions made and any deferrals.
- The single command the user runs to deploy:
  ```bash
  # The actual deploy is the user's responsibility, not yours. Just tell
  # them: "Branch ready. To deploy, run scripts/security/pre-deploy-check.js,
  # then firebase deploy --project wolf-20b8b, then the migration scripts
  # with --apply --confirm-prod, in that order. See §15 of the audit doc
  # for the full Phase B runbook."
  ```

Do not deploy. Do not push. Do not run migration scripts against
production. Stop and ask the user when in doubt.

Begin.
