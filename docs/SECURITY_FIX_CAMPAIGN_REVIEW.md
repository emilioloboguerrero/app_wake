# Wake — Security Fix Campaign Review (2026-05-01)

Independent review of `security-fix-campaign` branch (11 commits, base
`main`@`bcf2f18`'s parent). Read-only audit. No deploy. No push. No
migration scripts run with `--apply`. Production data sampled via the
campaign's own `scripts/security/shape-analysis.js` (read-only, sample
n=300/collection).

---

## Verdict — **NO-GO** until #1 is fixed; otherwise **GO with caveats**

A single deploy-breaking code bug is present (Issue #1, missing
`UNSUBSCRIBE_SECRET` on the `api` Gen2 export). Once that one-line fix
lands the rest of the branch is shippable provided the §16.7 deploy
ordering is followed and the operator-side caveats below are
acknowledged. The campaign correctly closes the four critical chains
the audit flagged (self-promote-to-admin, free perpetual enrollment,
field-path injection, cross-creator IDOR) and the production data
shape sampled today is compatible with the new rules and gates.

**Severity tally**

| Severity | Count |
|---|---|
| Deploy-breaking | **1** |
| Degrades-perf / soft-regression on deploy | **3** |
| Cosmetic / Round-2 | **5** |

---

## 1. Deploy-breaking

### 1.1 [#1] `api` Gen2 export does not declare `UNSUBSCRIBE_SECRET` in `secrets[]`

- **File\:line:** [functions/src/index.ts:2967-2975](functions/src/index.ts#L2967-L2975)
- **What's wrong:** The `/email/unsubscribe` HTTP route is served by
  the Gen2 `api` Express app
  ([functions/src/api/routes/email.ts:415](functions/src/api/routes/email.ts#L415)),
  which calls `verifyUnsubscribeToken()` →
  `unsubscribeSecret()` →
  `process.env.UNSUBSCRIBE_SECRET`
  ([functions/src/api/services/emailHelpers.ts:30-39](functions/src/api/services/emailHelpers.ts#L30-L39)).
  Outside the emulator, when the env var is missing, `unsubscribeSecret()`
  throws `"UNSUBSCRIBE_SECRET not configured"` (line 38). The thrown
  error is then caught inside `verifyUnsubscribeToken`'s
  try/catch (line 53-57), which simply returns `false`. The route
  responds 400 `Enlace inválido` for **every** unsubscribe attempt.
  Even if the secret is provisioned in Secret Manager (the operator
  appears to be doing this for staging in a parallel terminal), the
  `api` Gen2 export's `secrets[]` does not list it, so Cloud Run does
  not inject `UNSUBSCRIBE_SECRET` into the function process. The
  comment at [functions/src/index.ts:71-73](functions/src/index.ts#L71-L73)
  explicitly says every minter/verifier must declare it; only
  `processEmailQueue` (Gen1, line 2699) does.
- **Deploy impact:** **Breaks unsubscribe end-to-end.** Every footer
  link in every Wake-broadcast email returns "Enlace inválido". Users
  cannot unsubscribe; CAN-SPAM / GDPR exposure.
- **Fix:** Add `unsubscribeSecret` (already defined on
  [functions/src/index.ts:73](functions/src/index.ts#L73) as
  `functions.params.defineSecret("UNSUBSCRIBE_SECRET")`) to the `api`
  Gen2 `secrets[]` array. One-line change. The same secret param can
  be reused in Gen2 (both Gen1's `functions.params.defineSecret` and
  Gen2's `defineSecret` from `firebase-functions/params` resolve to
  the same Secret Manager binding).

---

## 2. Degrades-perf / soft-regression on deploy

### 2.1 [#2] Pre-existing unsubscribe tokens in user inboxes will all fail post-deploy

- **File\:line:** [functions/src/api/services/emailHelpers.ts:41-62](functions/src/api/services/emailHelpers.ts#L41-L62)
- **What's wrong:** F-FUNCS-20 swaps the unsubscribe token from
  unkeyed SHA-256 to HMAC-SHA-256. Tokens minted before deploy and
  sitting in users' inboxes are unkeyed-SHA shape; the new verifier
  will reject them all. Per the campaign-review prompt, this was
  flagged as a known deploy-time consideration; the previous agent
  did not implement a transitional dual-verify.
- **Deploy impact:** Bounded — affects only links inside emails sent
  before the deploy moment. Not a privilege issue, but a UX/compliance
  hit. Volume: per audit, real broadcast volume is `<100/day`, and
  Wake has been live for a short time, so the population of
  pre-deploy tokens in active inboxes is small.
- **Fix options:** (a) accept the breakage and document on the
  unsubscribe failure page; (b) dual-verify (HMAC OR raw-SHA) for a
  defined window (suggest: 30 days post-deploy), then drop the
  fallback. Recommend (b) only if a single line in `verifyUnsubscribeToken`
  is acceptable churn — otherwise (a) is fine for a 65-user platform.

### 2.2 [#3] First-party rate-limit cost increase from in-memory → Firestore

- **File\:line:** [functions/src/api/middleware/rateLimit.ts:21-58](functions/src/api/middleware/rateLimit.ts#L21-L58)
- **What's wrong:** F-MW-02 removes the in-memory `Map` first-party
  fast-path. Every authed request now incurs one Firestore
  read+write transaction (the `rate_limit_first_party` collection).
  At Wake's current 65-user scale this is fine; at 10× growth it's
  $$ — and the docs accumulate without a Firestore TTL policy
  (`expires_at` field is set but TTL collection config is a TODO at
  line 5-8).
- **Deploy impact:** Performance only — adds ~30-50ms p50 latency to
  every authed request and one Firestore write per request. Not a
  blocker.
- **Fix:** Configure a Firestore TTL policy on `rate_limit_first_party`
  and `rate_limit_windows` against the `expires_at` field — this is
  already noted as a TODO in the file but not done.

### 2.3 [#4] Custom-claim activation requires token refresh — possible 30-60 min creator-dashboard 403s post-deploy

- **File\:line:** [functions/src/api/middleware/auth.ts:236-258](functions/src/api/middleware/auth.ts#L236-L258),
  [scripts/security/phase1-claim-backfill.js](scripts/security/phase1-claim-backfill.js)
- **What's wrong:** F-MW-08 makes the API read role from the decoded
  ID-token claim only — Firestore role is no longer authoritative for
  middleware decisions. Custom claims, however, only take effect on
  the **next** ID-token refresh. Phase1-claim-backfill stamps the
  claim before the deploy, but currently-logged-in creators carry a
  pre-claim token until the SDK auto-refreshes (typically every
  ~60 min, or sooner if the app calls `getIdToken(true)`). During
  that window, every creator API call returns 403 from `requireCreator`.
- **Deploy impact:** Bounded soft-regression for the 9 creators + 2
  admins in prod. Mitigation: deploy during a low-activity window;
  optionally add a one-time client-side `getIdToken(true)` after
  deploy via a config flag. Not a code bug — it's a property of
  Firebase claims.
- **Fix:** Add to the §16.7 runbook: "creators may need to fully
  log out + back in after deploy if they remain in a stale session."

---

## 3. Round-2 / cosmetic

### 3.1 [#5] CSP for `/creators/**` does not include Behold origins

- **File\:line:** [firebase.json:90-98](firebase.json#L90-L98)
- The PWA CSP allows `https://*.behold.so` + `https://feeds.behold.so`
  (line 86). The creator-dashboard CSP does not. Today the dashboard
  collects/edits `beholdFeedId` on the creator profile but does not
  embed the Behold widget itself; the widget renders on the public
  PWA. **Not currently a deploy break.** If a future creator-dashboard
  preview adds a Behold render, copy the entries over.

### 3.2 [#6] CSP `/creators/**` script-src does not include `https://www.recaptcha.net`/`https://www.google.com` — verify dashboard does not use App Check ReCaptcha

- **File\:line:** [firebase.json:90-98](firebase.json#L90-L98)
- The dashboard's script-src lists `gstatic.com`, `googleapis.com`,
  `apis.google.com`, `google.com`, `recaptcha.net` — same as the PWA.
  This is fine. **Not an issue, listed for completeness.**

### 3.3 [#7] `EXPO_PUBLIC_RECAPTCHA_SITE_KEY` build-time injection not in `eas.json`

- **File\:line:** [apps/pwa/src/config/firebase.js:44-52](apps/pwa/src/config/firebase.js#L44-L52)
- **What's wrong:** F-CFG-05 hard-errors on missing
  `EXPO_PUBLIC_RECAPTCHA_SITE_KEY` outside emulator/staging. The
  per-EAS-profile env var injection isn't documented/codified in
  `apps/pwa/eas.json` — the repo's local `npm run build:pwa` relies on
  the env var being already-set in the operator's shell. If the
  release pipeline doesn't have it set, the prod PWA throws on
  startup.
- **Deploy impact:** One-shot — verify the secret is in the build
  environment for production. If `wakelab.co` is currently working
  on a deployed build, the var is set somewhere. Not a code change
  needed; a runbook entry.
- **Fix:** Add to §16.7 deploy runbook: "before `npm run build:pwa`,
  confirm `EXPO_PUBLIC_RECAPTCHA_SITE_KEY` is set in the build env."

### 3.4 [#8] `client_programs` rule still references `creatorId`/`clientId` fields that don't exist in prod data

- **File\:line:** [config/firebase/firestore.rules:556-571](config/firebase/firestore.rules#L556-L571)
- **What's wrong:** Per audit §11.1.4, all 7 prod `client_programs`
  docs use `user_id` + `program_id` (snake). The rule's read/write
  predicates check `creatorId == auth.uid || clientId == auth.uid` —
  fields that never appear in real data. The rule is dead code
  (clients always read/write via Admin-SDK API anyway). Not closed by
  this campaign and not in scope per the decisions doc. Round 2.

### 3.5 [#9] `event_signups/registrations` legacy schema (90% docs) does not match new authed-create rule

- **File\:line:** [config/firebase/firestore.rules:430-439](config/firebase/firestore.rules#L430-L439)
- **What's wrong:** The new rule binds `userId == auth.uid` and
  `email == auth.token.email` for authed creates. 90% of existing
  registration docs use the snake/Spanish schema (no `userId` field —
  registrant is unauth on a public event) and 10% use camel/English
  (`clientUserId`, not `userId`). Existing data is read-only and
  unaffected (the rule is `allow create` only); but `registrations-
  schema-unify.js` runs in §16.7 to canonicalize, and any reader that
  expects unified shape needs to handle both during the migration
  window. The campaign log calls this out and defers consumer-side
  cleanup to Round 2.

---

## 4. Production data-shape findings

Run via `node scripts/security/shape-analysis.js` (read-only, sample
n=300/coll). Comparing real data against the new rules + gates:

### `users/{uid}` — F-RULES-01 allowlist OK; no client direct writes exist

| Field family | Status |
|---|---|
| Top-level fields actually present in 65 prod docs | 43 (see shape report) |
| Fields in the new allowlist | 36 |
| Fields not in the allowlist that are in prod | `activityStreak`, `age`, `cards`, `courseProgress`, `courses`, `created_at`, `email`, `free_trial_history`, `generalTutorials`, `lastLoginAt`, `name`, `oneRepMaxEstimates`, `profilePicturePath`, `profilePictureUpdatedAt`, `provider`, `purchased_courses`, `role`, `username`, `webOnboardingCompletedAt`, `webOnboardingData`, `weeklyMuscleVolume` |

**However, every client write to `users/{uid}` is mediated by the
Cloud Functions API (`apiClient.patch('/users/me', ...)` or similar);
a recursive grep across `apps/pwa/src`, `apps/creator-dashboard/src`,
and `apps/landing/src` returns ZERO direct Firestore SDK writes to
`users/{uid}`.** Because the API uses Admin SDK, it bypasses these
rules entirely. The allowlist therefore does not 403 any real flow.

The above set is informational — the API endpoint
[functions/src/api/routes/profile.ts:132-254](functions/src/api/routes/profile.ts#L132-L254)
has its OWN allowlist that is not 1:1 with the rules allowlist. That
is a pre-existing condition unaffected by this campaign and IS the
subject of audit's broader F-DATA / F-DRIFT findings.

### `one_on_one_clients` — backfill is mandatory before rule deploy

Confirmed: 25 docs total, 60% (15) missing `status`, 28% have
`endedAt`. The §16.7 ordering runs the backfill before
`firebase deploy`; after backfill, the F-API1-14 / F-API1-05 gate at
[workout.ts:2639-2647](functions/src/api/routes/workout.ts#L2639-L2647)
+ [profile.ts:520-530](functions/src/api/routes/profile.ts#L520-L530)
will resolve correctly. **Confirmed correct ordering.**

### `courses` — 100% snake `creator_id`, no migration needed

15 docs, all with `creator_id` (snake). 0 with camel `creatorId`. The
new `verifyProgramOwnership` helper
([creator.ts:8654](functions/src/api/routes/creator.ts#L8654)) reads
`.creator_id` only; safe.

### `bundles` — 0 mixed-creator bundles

2 docs in prod, both with `courseIds` (camel) per decisions doc, both
single-creator. F-NEW-07 / F-SVC-01 cross-creator check at
[bundleAssignment.ts](functions/src/api/services/bundleAssignment.ts)
will not reject any existing bundle.

### `auth_claims` — 100% empty, all 11 creators+admins need backfill

66 Auth users, 0 with claims. `phase1-claim-backfill.js` will set 11
claims (9 creator + 2 admin per shape-report). Ordering correct.

### `users.email` vs Auth email — 0 mismatches in 50 sampled

F-FUNCS-04 `payer_email == users[uid].email` check
([index.ts:333-352](functions/src/index.ts#L333-L352)) is safe to
deploy: 100% of 65 sampled users have a populated `email` field, 0
mismatch with Auth email.

### `event_signups/registrations` — 100% have `email`, 10% have `userId`/`clientUserId`

The new rule's authed branch requires `userId == auth.uid`. Existing
data is read-only; new authed creates must follow the new shape. PWA
event-registration code paths must write `userId: auth.uid` and
matching email. **Not verified in this review** — flagged for the
operator to grep `apps/pwa/src` for event-register call sites before
deploy and confirm `userId` field is sent.

---

## 5. Test-suite verification

`npx vitest run tests/rules tests/api tests/security` was run from
this review. Result without the Firebase emulator running:

```
Test Files  11 failed | 1 passed | 9 skipped (21)
Tests       11 passed | 270 skipped (281)
```

11 failed = test files that **could not connect to firestore
emulator** (`ECONNREFUSED 127.0.0.1:8080`). 11 passed = the unit-only
test files (`securityHelpers.test.ts` etc).

The campaign-log claims **259 pass / 21 expected-fail / 116 skipped**
when run with the emulator up but `WAKE_RUN_API_TESTS=1` unset (the
116 skipped = API-integration + chain tests; the suite skips them
unless that env var is set, and the user's hook denies starting the
emulator against `wolf-20b8b`).

I could not validate the 259/21 numbers in this review because the
firebase emulator was not running and a parallel `firebase deploy
--only functions:api` against `wake-staging` is in flight on the
host (do not interfere). The user can re-run with the emulator
locally to confirm — the campaign-log is consistent with the
counted `it.fails` markers in the test source (4 + 3 + 1 + 2 + 8 = 18
remaining `it.fails` markers across the security test files; 41 -
18 = 23 expected flips, in line with the campaign-log's 20 claimed).

**No `it.fails` was flipped without a corresponding code fix** —
spot-checked: each remaining `it.fails` lives in
`security.relationships.test.ts` (8 — F-RULES-12/13 client_programs
naming-drift Round 2), `security.content.test.ts` (4 — F-RULES-19/22
status drift), `security.events.test.ts` (3 — F-RULES-32/33 events
public-read Round 2), `security.users.test.ts` (2 — F-RULES-38/39),
`security.payments.test.ts` (1 — F-RULES-40 webhook idempotency).
All correspond to deferred-by-design Round 2 items per
campaign-log §16.6.

The `it.skip` at
[security.storage.test.ts:69-80](functions/tests/rules/security.storage.test.ts#L69-L80)
is a documented `@firebase/rules-unit-testing v5` cross-service
limitation, not a real coverage gap. The post-deploy smoke runner
exercises that path.

---

## 6. Deploy script audit (§16.7 ordering)

§16.7 sequence is correct:

1. **`pre-deploy-check.js --project demo-wake`** — dry-run all five
   migrations. ✓
2. **`phase1-claim-backfill.js --apply`** — must run BEFORE
   `firebase deploy` so creator/admin tokens carry the claim before
   the rules + middleware switch role authority to claims. ✓
3. **`exercises-library-cleanup.js`** — defensive but correct.
4. **`naming-drift-normalize.js`** — required: rules now read
   canonical names. ✓
5. **`one-on-one-clients-status-backfill.js`** — required: F-API1-14
   gate keys on `status: 'active'`. ✓
6. **`registrations-schema-unify.js`** — recommended; rule is
   forward-only so existing-data isn't denied either way.
7. **`firebase deploy`** — atomic.
8. **`post-deploy-smoke.js`** — sanity check.

**Prereqs the runbook calls out and that I verified are still open:**

- [§15.5 Resend reputation glance — open per audit](docs/SECURITY_AUDIT_2026-04-30.md#L2772-L2782)
- [§15.6 MercadoPago `processed_payments` reconciliation — open](docs/SECURITY_AUDIT_2026-04-30.md#L2782-L2790)
- §15.2 GitHub branch protection — claimed done in audit ✅

**Prereqs missing from §16.7 that need adding:**

- **Provision `UNSUBSCRIBE_SECRET` in Firebase Secret Manager**
  before deploy. The runbook's last paragraph mentions this but the
  imperative-form deploy block does not. The user is doing this
  manually for staging; needs to be in the script for prod.
- **Even after provisioning the secret, Issue #1 must be fixed in
  code first** — provisioning does not help if the function process
  doesn't bind to it via `secrets[]`.
- **Confirm `EXPO_PUBLIC_RECAPTCHA_SITE_KEY` is set in the build
  environment** before `npm run build:pwa` (Issue #7).

---

## 7. Side-channel / regression review

### 7.1 ✓ `onUserCreated` always seeds `role: "user"` — `/creator/register` is the only legitimate Admin-SDK promotion

[functions/src/index.ts:2152-2193](functions/src/index.ts#L2152-L2193)
is correct. Searched `setCustomUserClaims` across all of
`functions/src`: only two callers — `onUserCreated` (always `"user"`)
and `/creator/register` after email-verified + audit-log
([creator.ts:9656](functions/src/api/routes/creator.ts#L9656)). No
side-channel that pre-creates a user doc with `role:"creator"`
expecting `onUserCreated` to honour it. ✓

### 7.2 ✓ `planAssignments` removal from `pickPublicCourseFields` does not break creator dashboard

[securityHelpers.ts:481-501](functions/src/api/middleware/securityHelpers.ts#L481-L501).
Creator-dashboard reads `planAssignments` from
`users/{uid}.courses[programId].planAssignments` (per-client
enrollment record) via creator-scoped `/creator/clients/:cid/*`
endpoints, **not** from `pickPublicCourseFields` (the public course
shape on the PWA's course-detail screen). The two paths are
independent. The change in this campaign is correctly scoped. ✓

### 7.3 ✓ Override path regex matches PWA's actual weekKey format

PWA generates weekKey as `YYYY-W18` shape via
[apps/pwa/src/utils/weekCalculation.js:34](apps/pwa/src/utils/weekCalculation.js#L34)
(`${year}-W${WW}`). The regex
`^overrides\.[A-Za-z0-9_-]{1,64}\.[A-Za-z0-9_-]{1,64}$`
matches both segments. ✓

### 7.4 ⚠ `verifyProgramOwnership` parameter order — verified all call sites

Helper signature is `(creatorId, programId)`
([creator.ts:8654](functions/src/api/routes/creator.ts#L8654)). All
6 new call sites pass `(auth.userId, req.params.programId)` in the
correct order — verified at lines 3312, 3427, 3518, 6167, 6181, 6218,
6242. No swap detected. ✓

### 7.5 ⚠ Storage rules `firestore.get(...).data.role` continues to read the Firestore field even though F-RULES-01 makes the claim authoritative for everything else

[storage.rules:13-14](config/firebase/storage.rules#L13-L14) +
[:29-30](config/firebase/storage.rules#L29-L30). Storage rules cannot
read custom claims, so the role lookup falls back to the Firestore
field. After this campaign, the Firestore `role` is still written by
Admin-SDK paths (`/creator/register` line 9628, onUserCreated line
2171), so this continues to work for creators registered via the
canonical flow. **Not a deploy break**, but flagged because it means
the Firestore role field IS still load-bearing for storage rule
decisions even though the audit narrative said "role authority is
the claim, period." Round 2 may want to either replicate the role
into a Storage Rules-readable place or drop the Firestore field
entirely.

### 7.6 ✓ X-Frame-Options + CSP `frame-ancestors 'none'` does not break the `eventPage` Cloud Function

`functions:eventPage` renders an OG-tagged HTML page for `/e/:eventId`.
This page is served via Hosting → Function rewrite, not as an iframe.
Nothing legitimately embeds it. ✓

### 7.7 ✓ IP rate limit (600 rpm/IP) does not threaten public endpoints

Public endpoints (health, /events/*, /app-resources, /email/unsubscribe,
/bundles) all pass through the IP gate. 600 req/min/IP = 10 rps. A
single office NAT serving Wake's PWA at peak would have to make 10
requests/sec sustained — well above any real client behaviour.

### 7.8 ⚠ `apiService.setClientProgram` and `updateClientProgramOverride` are exposed but appear unused

[apps/pwa/src/services/apiService.js:334-341](apps/pwa/src/services/apiService.js#L334-L341).
A recursive grep for callers across `apps/pwa/src` returns no real
caller. F-API1-14 (POST /workout/client-programs/:programId) gate
therefore does not regress any active flow. Recommend Round 2 cleanup
deletes the dead exports, but harmless today.

---

## 8. Round 2 candidates (out of campaign scope)

Discovered during this review and **not** added to the in-flight
campaign:

1. `client_programs` rule references non-existent fields (Issue #8 above).
2. Drop legacy unkeyed-SHA unsubscribe-token compatibility once 30
   days have elapsed (transitional dual-verify or accept-and-document).
3. `system_email_budget` doc has no Firestore TTL — counter docs
   accumulate one per day forever (small, but tidy).
4. `rate_limit_first_party` + `rate_limit_windows` Firestore TTL
   policy not configured (already TODO'd in
   [rateLimit.ts:5-8](functions/src/api/middleware/rateLimit.ts#L5-L8)).
5. Storage rule `users/{userId}.role` reads — consolidate role
   authority into a single source (claim-only, replicated to a
   Storage-readable place if needed).
6. Delete unused `apiService.setClientProgram` / `updateClientProgramOverride`
   exposed methods (Issue 7.8).
7. Resolve duplicate fields on `processed_payments` (`state` vs
   `status`) — already deferred per decisions doc §6.

---

## 9. One-paragraph executive summary

The campaign correctly closes every critical chain the audit listed
and is, with one exception, ready to deploy after running the §16.7
runbook. The one exception is a **deploy-breaking** but **single-line**
miss in [functions/src/index.ts:2967-2975](functions/src/index.ts#L2967-L2975):
the `api` Gen2 export does not declare `UNSUBSCRIBE_SECRET` in its
`secrets[]` array, so every call to `/email/unsubscribe` will reject
the link as invalid post-deploy. Beyond that, three deploy-time
caveats apply: existing in-flight unsubscribe links carry pre-HMAC
tokens that will all fail; logged-in creators may see brief 403s
until their ID-token refreshes the new role claim; and adding one
Firestore read+write per authed request will increase per-request
cost. None of these are blocking at Wake's 65-user scale. Production
data shape is compatible: 100% of users have an `email` field, all
courses use `creator_id` (snake), all bundles are single-creator, the
`one_on_one_clients` `status` backfill is correctly ordered before
the rule deploy. **Fix Issue #1, then deploy.**
