# Wake — Security Remediation Progress

**Audit:** [SECURITY_AUDIT_2026-04-27.md](SECURITY_AUDIT_2026-04-27.md) — 156 findings (10 C, 29 H, 45 M, 41 L)
**Branch:** `security-hardening`
**Status:** Tier 0 SHIPPED to production. Tier 1 not started.
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

## Tier 1 — pending (next milestone)

Higher-severity batch. Cross-tenant boundaries, content-tree write hardening, payment race fixes. Roughly 12 patches, 2-3 days.

| ID | Title | File:line |
|---|---|---|
| C-02 | client-sessions cross-creator overwrite — needs ownership check + pickFields | creator.ts:3057 |
| C-03 | plan-content path-traversal via body.deletions | creator.ts:2910 |
| C-04 | Same path-traversal in /creator/programs sibling | creator.ts:8301 |
| C-05 | Nutrition assignments PUT raw body — needs validateBody schema + size cap | creator.ts:2261 |
| C-10 | Consent-free enrollment — add `status: 'pending'` + acceptance flow | creator.ts:739 |
| H-01 | Rules: cross-creator program tampering on courses/{id}/modules/** | firestore.rules:179 |
| H-04 | Rules: exercises_library cross-creator tampering | firestore.rules:469 |
| H-12, H-13 | client-session content writes — parent ownership + pickFields | creator.ts:3163, 3257 |
| H-14 | client_programs raw body spread — pickFields | workout.ts:2567 |
| H-15, H-16 | Renewal double-extend race — wrap assignCourseToUser in transaction | index.ts:771, courseAssignment.ts:36 |
| H-17 | Bundle assignment not transactional | bundleAssignment.ts:34 |
| H-21 | Subscription preapproval webhook — verify subscriptionId belongs to userId | index.ts:689 |
| H-28 | assign-plan ownership check (both call sites) | creator.ts:5754, 8106 |
| H-29 | /library/sessions/:id?creatorId=X — ownership check | workout.ts:3011 |

---

## Tier 2 — defense-in-depth batch (single PR)

Pattern-based fixes that close many findings at once. Roughly 1 day.

- **URL scheme allowlist** at 4 write sites (M-41 profilePictureUrl/websiteUrl, M-42 callLink, M-38 event.image_url) — single helper
- **Length caps** on creator-controlled text (M-39 bundles/events/client_notes/video_exchange notes)
- **Server-side sanitize-html** on broadcast email bodyHtml (H-26) — closes phishing-via-Wake-domain risk
- **Push notification spoofing** fix (H-27) — clamp + quote senderName
- **Rate limits** on /notifications/* (M-32) — currently zero
- **Logging cleanup**: safeErrorPayload helper at ~6 sites in index.ts; redact emails at M-26/M-27/M-28
- **Drop AsyncStorage email cache** (M-07) — Firebase persistence already retains session
- **Filter sessionHistory by creator's courseIds** (M-44) — close cross-creator history leak
- **Tighten lookup endpoint rate limit + matched response shapes** (M-45) — close enumeration
- **Delete dead bookings.ts routes** (M-31)

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
