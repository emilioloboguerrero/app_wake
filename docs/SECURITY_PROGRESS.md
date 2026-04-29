# Wake — Security Remediation Progress

**Audit:** [SECURITY_AUDIT_2026-04-27.md](SECURITY_AUDIT_2026-04-27.md) — 156 findings (10 C, 29 H, 45 M, 41 L)
**Branches:** `security-hardening` (Tier 0, shipped) → `tier-1-security` (Tier 1, awaiting staging deploy)
**Status:** Tier 0 SHIPPED to production. Tier 1 patches written + tested locally; awaiting deploy approval.
**Last updated:** 2026-04-27

---

## Tier 0 — SHIPPED to production 2026-04-27

11 patches closing the most exploitable findings. Staging validated → production deployed → 10/10 smoke tests passed live.

| ID | Title | File | Ship status |
|---|---|---|---|
| C-01 | move-course self-grant (refined: admin/creator-owns/draft/free) | profile.ts:385 | ✅ live |
| C-06 | Trial duration clamp + course-config validation | profile.ts:336 | ✅ live |
| C-09 | /storage/download-url per-user prefix allowlist | profile.ts:724 | ✅ live |
| H-02 | event_signups/.../waitlist requires auth + userId binding | firestore.rules:391 | ✅ live |
| H-07 | Trial server-controlled metadata + trial_used flag | profile.ts:336 | ✅ live |
| H-09 | /backfill requires existing client_programs doc | profile.ts:410 | ✅ live |
| H-10 | POST /purchases admin-only + audit | profile.ts:758 | ✅ live |
| H-18 | Backport Gen2 refund handler into Gen1 | index.ts:892 | ✅ live |
| H-24 | /creator/register requires verified email + audit log | creator.ts:8671 | ✅ live |
| H-25 | PATCH /status enum + expiresAt restriction | profile.ts:651 | ✅ live |
| M-34 | client-session-content ownership check | workout.ts:2944 | ✅ live |

**Supporting commits on `security-hardening`:**
- `c617187` — initial 11 patches
- `05635fb` — vitest unit suite + rules emulator + production discovery script
- `c25d2f6` — refined move-course (admin-only was too aggressive) + dead PWA method removal
- `219dbf5` — production-ready smoke test (10/10 passing)
- Auto-deploy commits: `440cc9a`, `4c497d1`, `d492386`, `9bf1861` (deploy notifier auto-pushes after each deploy)

**Test infrastructure added:**
- `functions/vitest.config.ts` + `npm test` script
- `functions/src/api/middleware/securityHelpers.ts` (shared validators) + `securityHelpers.test.ts` (48 tests)
- `functions/tests/rules/waitlist.test.ts` (7 emulator tests)
- `scripts/security/tier0-discovery.js` (read-only production survey)
- `scripts/security/tier0-smoke.js` (API smoke suite — uses signUp to bypass enum protection)

**Production discovery confirmed clean baseline:**
- 0 status enum violations across 28 course entries
- 0 trials > 14 days
- 0 historical refunds (no backfill needed)
- 1/8 sampled creators with unverified email (existing creators retained)

---

## Tier 1 — written, tested locally, awaiting deploy (`tier-1-security` branch)

Higher-severity batch. Cross-tenant boundaries, content-tree write hardening, payment race fixes, preapproval verification, plus three Tier 5 product decisions resolved by investigation. **15 patches.**

| ID | Title | File | Status |
|---|---|---|---|
| **Rules-side** | | | |
| H-01 | Cross-creator program tampering on `courses/{id}/modules/**` | firestore.rules:177 | ✅ patched + 4 emulator tests |
| H-04 | `exercises_library` writes scoped to `creator_id` field | firestore.rules:474 | ✅ patched + 5 emulator tests |
| H-03 / 5.1 | `creator_availability` reads owner-only (clients use API, not direct reads) | firestore.rules:290 | ✅ patched + 5 emulator tests |
| **Cross-tenant API** | | | |
| C-02 | client-sessions PUT — parent ownership + pickFields | creator.ts:3070 | ✅ patched |
| H-12, H-13 | client-session content PUT/PATCH + content/exercises PATCH — `verifyClientSessionOwnership` helper + pickFields | creator.ts:3214, 3274, 3300 | ✅ patched |
| H-14 | `POST /workout/client-programs/:programId` raw body → pickFields | workout.ts:2570 | ✅ patched |
| H-28 | `assign-plan` ownership check (both call sites) | creator.ts:5856, 8210 | ✅ patched |
| H-29 | `/library/sessions/:id?creatorId=X` — owner OR active 1-on-1 client OR enrolled course | workout.ts:3054 | ✅ patched |
| **Content-tree path-traversal** | | | |
| C-03, C-04 | `body.deletions` segment regex via shared `validateDeletionPath` helper | creator.ts:2974, 8429 | ✅ patched + 10 unit tests |
| C-05 | nutrition assignments PUT — `validateNutritionContentBody` schema + 50-array + 5KB-per-item cap | creator.ts:2300, 2342 | ✅ patched |
| **Consent** | | | |
| C-10 | `one_on_one_clients` writes default to `status: 'pending'`; `verifyClientAccess` requires `active`/missing; new accept/decline endpoints at `/users/me/client-relationships/:id/{accept,decline}`; list endpoint at `GET /users/me/client-relationships` | creator.ts:861, 919, profile.ts:548 | ✅ backend gate (acceptance UI is a Tier 6 follow-up) |
| **Payment race fixes** | | | |
| H-15, H-16 | Renewal double-extend race — Gen1 + Gen2 wrapped in `runTransaction`; `courseAssignment.ts` re-reads on-disk `expires_at` inside transaction and no-ops if `onDisk ≥ candidate` | index.ts:1255, payments.ts:920, courseAssignment.ts:54 | ✅ patched |
| H-17 | Bundle assignment transactional — `bundleAssignment.ts` accepts a `Transaction`; both webhook paths wrap grant + sub update + `processed_payments` finalization atomically | index.ts:1142, payments.ts:838, bundleAssignment.ts:34 | ✅ patched |
| H-21 | Preapproval webhook verifies local `subscriptions/{preapprovalId}` exists AND its `userId` matches the parsed `external_reference` before merging | index.ts:687, payments.ts:598 | ✅ patched |
| **API enforcement bug** | | | |
| M-43 / 5.4 | `wake_users_only` enforced in public `POST /events/:eventId/register` (was only enforced by Firestore rules for direct writes) | events.ts:166 | ✅ patched |

**Helpers added (Tier 1):**
- `securityHelpers.ts::validateDeletionPath()` — strict path validator for content-tree deletions (closes C-03/C-04 systemically; reusable by future content-tree endpoints).
- `creator.ts::verifyClientSessionOwnership()` — local helper used by H-12/H-13.
- `creator.ts::validateNutritionContentBody()` — local helper used by C-05.
- `verifyClientAccess()` extended in-place to gate on `status === 'active'` (the C-10 backend gate).

**Test infrastructure:**
- `functions/tests/rules/crossCreator.test.ts` — 14 emulator tests for H-01 / H-04 / H-03.
- `functions/src/api/middleware/securityHelpers.test.ts` — +10 unit tests for `validateDeletionPath`.
- Total: 53 unit tests pass; 21 rules emulator tests pass under `firebase emulators:exec --only firestore`.
- `functions/.eslintrc.js` — added `/tests/**/*` and `vitest.config.ts` to `ignorePatterns` (config drift cleanup; both were errored on Tier 0 too).

**Tier 5 product decisions resolved by investigation:**
- **5.1** Lock down — done in Tier 1 via H-03 above (clients use the API path; rule was unused).
- **5.2** Profile picture lockdown — defer to **early Tier 2** (storage-rule change + needs verification of creator-discovery flow).
- **5.3** Bundle reads — leave open; bundle schema is marketing-shaped (`pricing` is a price tag). Defer the response-shape allowlist tightening (`...data` spread at bundles.ts:187) to Tier 2.
- **5.4** `wake_users_only` API — done in Tier 1 via M-43 above.

**Out of Tier 1:** H-10 (already shipped in Tier 0). C-10 acceptance UI (UX-shaped, separate milestone). Payment migration (Tier 4.1). 5.2 / 5.3 cleanup (early Tier 2).

**Pre-existing lint error preserved:** `analytics.ts:1079` (`prefer-as-const`) was on `security-hardening` before Tier 1 and is out of scope for security work.

---

## Tier 2 — defense-in-depth batch (split into 2a + 2b)

Pattern-based fixes that close many findings at once. Split into two sub-batches
on the `tier-2-security` branch so the input-hardening half ships independently
of the email/log half.

### 2a — input hardening + cross-tenant scoping (written, tested locally, awaiting staging deploy)

13 patches. Branch `tier-2-security` off `main`.

| ID | Title | File | Status |
|---|---|---|---|
| M-41 | https-only on `profilePictureUrl` / `websiteUrl` | profile.ts:177 | ✅ patched |
| M-42 | callLink scheme + vendor-domain allowlist (Zoom/Meet/Jitsi/Daily/Whereby/Teams) | bookings.ts:561 | ✅ patched |
| M-38 | `event.image_url` scheme check on PATCH | events.ts:419 | ✅ patched |
| M-39 | length caps (titles 200, descriptions 5000, notes 2000) | bundles.ts:286/336, events.ts:323/422, creator.ts:1071, videoExchanges.ts:362 | ✅ patched |
| M-44 | sessionHistory filtered to creator's owned courseIds (closes cross-creator leak) | creator.ts:1635, analytics.ts:840 | ✅ patched |
| M-45 | lookup tightened: 30rpm, matched `{found: bool, ...}` shape, masked email, photoURL/PII dropped (Gen2 + Gen1) | creator.ts:746, index.ts:1603 | ✅ patched + dashboard client updated |
| M-07 | AsyncStorage email cache removed (saveAuthState/getAuthState/hasAuthState dead, only clearAuthState retained for legacy scrub) | apps/pwa/src/utils/authStorage.js | ✅ patched |
| M-31 | dead `GET /creator/availability` + `PUT /creator/availability/template` deleted from bookings.ts; stricter weeklyTemplate validators ported into creator.ts | bookings.ts (delete), creator.ts:6660 | ✅ patched |
| Tier 5.2 | profile picture storage lockdown — owner OR target user is creator/admin OR caller is admin (covers `profiles/` legacy + `profile_pictures/` current path) | config/firebase/storage.rules:6 | ✅ patched (creator-discovery flow needs staging UAT) |
| Tier 5.3 | `normalizeBundleResponse` switched from `...data` spread to explicit field allowlist | bundles.ts:183 | ✅ patched |

**Helpers added to `securityHelpers.ts`:**
- `assertHttpsUrl()` now returns the parsed URL for reuse.
- `assertAllowedCallLinkUrl()` — scheme + suffix-match against `CALL_LINK_DOMAIN_SUFFIXES`.
- `assertTextLength()` + `TEXT_CAP_TITLE` / `TEXT_CAP_DESCRIPTION` / `TEXT_CAP_NOTE` constants.
- `maskEmail()` — `alex@example.com → al***@example.com`.
- `loadCreatorOwnedCourseIds(db, creatorId)` — returns `Set<string>` of courses the caller owns.

**Tests:**
- 20 new vitest unit tests in `securityHelpers.test.ts` (callLink allowlist, length caps, masked email, course-id loader). 73 total unit tests pass.
- All 21 existing rules emulator tests still pass against the firestore emulator.
- Storage emulator test for 5.2 deferred — rule logic is straightforward; creator-discovery flow will be verified by staging UAT.

**Out of 2a (deferred to 2b or later tiers):** H-26, H-27, M-32, log hygiene (M-25/M-26/M-27/M-28/L-41) — those are 2b. C-10 PWA acceptance UI — pushed to Tier 6 (UX milestone).

### 2b — email sanitization + ops/log hygiene (planned; same `tier-2-security` branch)

- **Server-side sanitize-html** on broadcast email bodyHtml (H-26) — closes phishing-via-Wake-domain risk
- **Push notification spoofing** fix (H-27) — clamp + quote senderName
- **Rate limits** on /notifications/* (M-32) — currently zero
- **Logging cleanup**: `safeErrorPayload()` helper at ~6 sites in index.ts; redact emails at M-26/M-27/M-28

---

## Tier 3 — quick-win infrastructure pass

- `cd functions && npm audit fix` — clears `protobufjs` ACE in production. Non-breaking.
- `cd apps/landing && npm audit fix` + `cd apps/creator-dashboard && npm audit fix` — non-breaking
- `cd apps/pwa && npm audit fix` — careful, may need testing for Expo chain
- **DO NOT** `npm audit fix --force` at root (would downgrade firebase-tools to v1.2.0)

15 minutes.

---

## Tier 4 — project-level (separate milestones)

### 4.1 Gen1 → Gen2 payment migration
1-2 weeks engineering + 30-day shadow mode. Eliminates the "Wake has no production refund handling" risk fully. Steps:
1. Add `/^\/payments\/webhook$/` to PUBLIC_PATHS (audit C-07)
2. Backport `course.access_duration` reading into Gen2 (audit H-19)
3. Add pause/resume Gen2 endpoints
4. Wrap renewal grants in transactions (audit H-15, H-16, H-17)
5. Build (x-request-id, payment_id) replay table (audit C-08)
6. Configure MercadoPago shadow webhooks (both Gen1 + Gen2)
7. Reconcile `processed_payments` for ~30 days
8. Cut over MP to Gen2-only
9. Update PWA + dashboard to call /api/v1/payments/* endpoints
10. Delete Gen1 payment functions (functions/src/index.ts:172-1498)

### 4.2 Firestore rules emulator suite expansion
1-2 days. Convert every audit Critical + High rules finding into a "should be denied" test. Already started for waitlist; expand to: cross-creator program tampering, exercises_library, nutrition_assignments, etc. Run in CI.

---

## Tier 5 — Product decisions REQUIRED to finalize Tier 1

These four answers shape rules patches and need user input.

| # | Decision | Recommendation |
|---|---|---|
| 5.1 | Lock down creator availability visibility? | Backlog — booking UI depends on it. Not exploitable. Defer until post-Tier 1. |
| 5.2 | Lock down profile picture visibility? | **Lock down** — Wake isn't social, fitness photos are sensitive. Owner + clients-of-creators only. |
| 5.3 | Lock down public bundle reads? | **Audit schema first** — if marketing-only fields, leave open + document. If internal fields, split collection. |
| 5.4 | Fix `wake_users_only` API enforcement? | **Yes, just fix it** — it's a bug not a question. Inconsistency between rules and API. |

---

## Operational notes from Tier 0 deploy

These came up during the Tier 0 deploy and are worth fixing during Tier 1 work:

1. **Staging missing 10 wake_ops secrets** — Tier 0 set placeholders. Replace with real staging values when wake_ops on staging is needed.
2. **`WAKE_WEB_API_KEY` in staging Secret Manager holds the PRODUCTION value** — config drift. Real staging key: `AIzaSyAcBpsxXfW77qlikRQvhvGRoxSBAtGl8L0`. Update the secret.
3. **Sourcemap upload script (`scripts/ops/upload-sourcemaps.sh`) defaults to prod bucket** even when deploying to staging. Minor cleanup.
4. **Staging email enumeration protection on** — blocks `accounts:signInWithPassword`. Smoke test uses `accounts:signUp` workaround. If running other API tests, either disable enum protection on staging OR use signUp pattern.

---

## Workflow used (and recommended for future tiers)

1. **Discovery** — run a read-only production query to find edge cases before patching. Extends `tier0-discovery.js` for new fields.
2. **Patches** — write fixes with audit IDs in commit messages. Reference findings by their ID (C-01, H-25, etc.) for traceability.
3. **Unit tests** — pure-function logic (validators, helpers) in vitest. Aim for 100% coverage of security-critical decisions.
4. **Rules emulator tests** — for any Firestore rule change, codify as `assertSucceeds`/`assertFails` tests in `functions/tests/rules/`.
5. **TS build + ESLint clean** — `npm --prefix functions run build` must pass.
6. **Deploy to staging** — `firebase use wake-staging && firebase deploy --only ...`. Watch logs ~5 min.
7. **Smoke tests** — extend `tier0-smoke.js` for new endpoints. Run against staging URL.
8. **Manual UAT** — human in browser, ~10-15 min of critical flows.
9. **Deploy to production** — only after explicit user OK. Same order: rules → functions → hosting.
10. **Smoke tests against production** — final validation.
11. **Update this document** — mark tier as shipped, record commit SHAs.

Production deploys NEVER happen without explicit user "deploy to production" greenlight, even in auto mode.
