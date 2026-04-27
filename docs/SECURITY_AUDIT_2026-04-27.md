# Wake — Security Audit (Consolidated)

**Date:** 2026-04-27
**Scope:** Full monorepo — `functions/`, `apps/pwa/`, `apps/creator-dashboard/`, `apps/landing/`, `config/firebase/`, git history
**Method:** 7 parallel read-only audits using static code analysis + reasoning
**Out of scope:** runtime/dynamic scanning, fuzzing, third-party pen test
**Status:** All findings open — no patches applied yet

---

## Executive Summary

Across 7 targeted audits, **156 distinct findings** were surfaced (after deduplication). Severity breakdown:

| Severity | Count | Exploitable today by |
|---|---:|---|
| Critical | 10 | Any authenticated user, no special access |
| High | 29 | Mostly authenticated users; some require creator role |
| Medium | 45 | Defense-in-depth; some require creator role |
| Low | 41 | Hardening; mostly creator-only or theoretical |
| Dependency CVEs | 5 critical / 38 high | Build-time mostly; one production-exposed (`protobufjs`) |

**The single most consequential finding:** Wake currently has **no production refund handling**. The Gen1 webhook (the only one MercadoPago can reach) ignores `refunded`/`charged_back` events. Refund a payment, the user keeps program access. Compliance and chargeback risk.

**The exploitable monetization-bypass cluster:** any logged-in user can grant themselves a paid program for free via several routes — `/users/me/move-course`, `/users/me/courses/:c/trial` (with unbounded duration), `/users/me/courses/:c/backfill`, `POST /purchases`, plus self-elevation to creator role via `POST /creator/register`. Each is a small fix; together they represent the worst class of bug for the business.

**The cross-tenant data leak cluster:** `/storage/download-url` bypasses Storage rules entirely — any user can read body-log photos, video exchange media, creator libraries. `GET /workout/client-session-content/:id` returns content with no ownership check. `GET /library/sessions/:sessionId?creatorId=X` lets anyone read any creator's session library.

**The trust/consent gap:** `POST /creator/clients/invite` lets any creator attach any user as a one-on-one client without acceptance, notification, or any on-platform signal to the user.

**Strengths:** HMAC validation, idempotency transactions, server-side payment amounts, prototype-pollution guards, storage-path validators, no committed secrets, no XSS sinks in client code, App Check on Gen1 payments, scoped API key support — all correctly implemented.

**Recommended action:** patch Tier 0 (10 critical issues) within 24 hours, Tier 1 (high-severity batch) within the week, Tier 2 (defense-in-depth batch) as a single follow-up PR, then commit to the Gen1→Gen2 payment migration as the next milestone.

---

## Patterns and Systemic Issues

Six recurring defect families account for the majority of findings. Each suggests a systemic fix that closes many findings at once.

### Pattern A — Monetization bypass cluster
Any authenticated user can grant themselves paid product access via:
- `POST /users/me/move-course` — assigns active enrollment with no payment check
- `POST /users/me/courses/:courseId/trial` — unbounded duration, deletable+recreatable
- `POST /users/me/courses/:courseId/backfill` — indefinite "active" with arbitrary metadata
- `POST /purchases` — fake purchase-log entries
- `PATCH /users/me/courses/:courseId/status` — set arbitrary status string
- `POST /creator/register` — self-elevate to creator role (then create courses, send emails, get API keys)

**Single fix shape:** require admin role / `processed_payments` proof / email-verified, persist tamper-resistant flags (e.g., `trial_used`).

### Pattern B — Cross-tenant reads via guessable IDs
- `GET /storage/download-url` — Admin SDK signed URL for ANY storage path (bypasses Storage rules entirely)
- `GET /workout/client-session-content/:clientSessionId` — no ownership check on parent
- `GET /library/sessions/:sessionId?creatorId=X` — no relationship check
- `GET /workout/programs/:courseId` — full course doc to any auth user

**Single fix shape:** verify ownership/relationship before returning anything ID-keyed; prefix-allowlist storage paths.

### Pattern C — Raw `req.body` writes on nested content-tree endpoints
Every PUT/PATCH that takes nested `sessions/exercises/sets` payloads bypasses `validateBody`:
- `client-sessions/:id/content` (PUT and PATCH)
- `plan-content/:weekKey` (both client and program scopes)
- `nutrition/assignments/:id/content` (both client and assignment scopes)
- `client_programs/:programId` (raw body spread)

Together these cover most of the content-tree write surface. **Single fix shape:** `pickFields` allowlist + per-domain `validateBody` schema with size caps.

### Pattern D — Cross-creator content tampering
Subcollection writes inherit insufficient parent-doc ownership checks:
- `courses/{courseId}/modules/**` — rules check `isCreator()` not creator-of-this-course
- `exercises_library` — same
- `client_sessions/{anyId}` — API endpoint validates client membership but not parent doc ownership
- `client_session_content/{anyId}` — same
- `plan-content` and `program-plan-content` — `body.deletions` is a free-form path (path-traversal risk)
- `nutrition/assignments` — similar pattern

**Single fix shape:** read parent doc, assert ownership, allowlist segments to `/^[A-Za-z0-9_-]{1,128}$/`.

### Pattern E — URL scheme validation gap
String fields that hold URLs validated for length but not scheme:
- `users.profilePictureUrl`, `users.websiteUrl`
- `call_bookings.callLink` (rendered into Wake-branded reminder emails)
- `event.image_url` (interpolated into CSS `background-image:url()` in HTML emails)

**Single fix shape:** `URL.canParse()` + `https:` scheme allowlist + domain allowlist where applicable, applied at write-time.

### Pattern F — Length caps missing on creator-controlled text fields
- `bundles.title/description`, `events.title/description` (PATCH path), `client_notes.text`, `video_exchanges/messages.note`, `subscription_cancellation_feedback.feedback`, email broadcast `bodyHtml` (50KB cap exists; reduce + sanitize)

**Single fix shape:** per-field caps in `validateBody` schemas (titles 200, descriptions 5000, notes 2000, feedback object 1KB JSON).

---

## Top-Line: Exploitable Right Now (Tier 0)

These 10 issues are exploitable by any authenticated user with no special access. Patch within 24 hours.

| # | Title | File:line | Tier 0 priority |
|---|---|---|---|
| C-01 | `/users/me/move-course` self-grants any course | [profile.ts:385-407](functions/src/api/routes/profile.ts#L385-L407) | Direct revenue bypass |
| C-06 | Trial duration unbounded (`durationInDays` from body) | [profile.ts:336-382](functions/src/api/routes/profile.ts#L336-L382) | 100-year trials trivial |
| C-09 | `/storage/download-url` returns signed URL for ANY path | [profile.ts:724-755](functions/src/api/routes/profile.ts#L724-L755) | Cross-user data exfiltration |
| H-07 | Self-grant trial to any course | [profile.ts:337-382](functions/src/api/routes/profile.ts#L337-L382) | Direct revenue bypass |
| H-09 | Self-grant active backfill | [profile.ts:410-437](functions/src/api/routes/profile.ts#L410-L437) | Direct revenue bypass |
| H-10 | Fake purchase log entries | [profile.ts:758-789](functions/src/api/routes/profile.ts#L758-L789) | Pollutes analytics/revenue |
| H-18 | Gen1 webhook ignores refunds | [index.ts:892-922](functions/src/index.ts#L892-L922) | No refund enforcement |
| H-24 | `POST /creator/register` self-elevation | [creator.ts:8671-8744](functions/src/api/routes/creator.ts#L8671-L8744) | Privilege escalation |
| H-25 | `PATCH /users/me/courses/:c/status` accepts any string | [profile.ts:651-672](functions/src/api/routes/profile.ts#L651-L672) | Trial-state gaming |
| M-34 | `GET /workout/client-session-content/:id` no ownership check | [workout.ts:2944-2958](functions/src/api/routes/workout.ts#L2944-L2958) | Cross-user planned-content read |
| Rules H-2 | `event_signups/.../waitlist` unauth public writes | [firestore.rules:391](config/firebase/firestore.rules#L391) | Spam/storage abuse |

---

## Critical Findings (10)

### C-01 — `/users/me/move-course` self-grants active enrollment to any course
**File:** [profile.ts:385-407](functions/src/api/routes/profile.ts#L385-L407)
**Source audits:** API broad, Payment deep-dive, Authorization matrix
Calls `assignCourseToUser` solely on the courseId existing — no payment check, no `processed_payments` lookup, no role check. Any authenticated user can `POST` and obtain a fully active course entry with full duration per `course.access_duration`. **Bypasses MercadoPago entirely.**
**Fix:** restrict to admin role, OR verify a `processed_payments` doc exists for `(userId, courseId)`.

### C-02 — `PUT /creator/clients/:clientId/client-sessions/:clientSessionId` cross-creator overwrite
**File:** [creator.ts:3057-3073](functions/src/api/routes/creator.ts#L3057-L3073)
**Source:** API broad audit
Validates that the creator owns `:clientId` but not that `:clientSessionId` belongs to them; writes raw `req.body` (no allowlist) to the doc. Any creator can clobber any other creator's `client_sessions` doc by combining a URL with their own clientId and another creator's sessionId.
**Fix:** read the doc first, reject if `creator_id !== auth.userId`; replace `...body` spread with `pickFields()`.

### C-03 — `PUT /creator/clients/:clientId/plan-content/:weekKey` path-traversal via `body.deletions`
**File:** [creator.ts:2910-2995](functions/src/api/routes/creator.ts#L2910-L2995)
**Source:** API broad audit
The `deletions` loop walks segment paths under `client_plan_content` with no per-segment regex validation. Length-of-segments-array even-check + `startsWith("sessions/")` is insufficient.
**Fix:** validate each segment against `/^[A-Za-z0-9_-]{1,128}$/`.

### C-04 — `PUT /creator/programs/:programId/plan-content/:weekKey` repeats C-03 pattern in sibling
**File:** [creator.ts:8301-8380](functions/src/api/routes/creator.ts#L8301-L8380)
**Source:** Authorization matrix audit (F-C3)
Same `body.deletions` walk with same insufficient validation, scoped to creator's own program. Less severe than C-03 (creator-on-self) but same class.
**Fix:** same as C-03; allowlist deletions to top-level `sessions/<id>` only, or require explicit `deleteSessionId` field.

### C-05 — `PUT /creator/nutrition/assignments/:assignmentId/content` and clients variant write raw body
**File:** [creator.ts:2261-2343](functions/src/api/routes/creator.ts#L2261-L2343)
**Source:** Authorization matrix audit (F-C4)
Both PUTs read `req.body ?? {}` and write `name/description/categories/macros/source_plan_id` plus a duplicate `plan.*` map. **No `validateBody` schema and no array/object size cap.** Creator can store 1MB blobs (Express limit) on every assignment they own, bloating client reads.
**Fix:** add `validateBody` schema; cap `categories` array length (e.g., 50), deep-validate item shape, cap `name` length.

### C-06 — Trial duration unbounded via `durationInDays` from request body
**File:** [profile.ts:336-382](functions/src/api/routes/profile.ts#L336-L382)
**Source:** Payment deep-dive audit
`durationInDays` is taken directly from the request body and multiplied into `expires_at`. Submit `durationInDays: 36500` for a 100-year trial. The "trial already exists" check is bypassed by deleting and recreating.
**Fix:** clamp ≤14 days, validate against `course.free_trial.duration_days` set by the creator, persist a `trial_used: true` flag that survives status flips.

### C-07 — Gen2 webhook is dead code in production
**File:** [app.ts:94-103](functions/src/api/app.ts#L94-L103) (PUBLIC_PATHS), [payments.ts:473](functions/src/api/routes/payments.ts#L473) (route)
**Source:** Payment deep-dive audit, also Authorization matrix M1
`/payments/webhook` is not in `PUBLIC_PATHS`, so the Gen2 webhook is gated behind `validateAuth`. MercadoPago has no Firebase ID token; every MP webhook to Gen2 gets 401'd before HMAC validation runs. **Only Gen1 `processPaymentWebhook` actually processes payments today.** Any reasoning that Gen2 is canonical was wrong. Combined with H-18 (refunds ignored in Gen1), Wake has no production refund handling.
**Fix:** add `/^\/payments\/webhook$/` to `PUBLIC_PATHS`; HMAC is the auth gate. Then either deprecate Gen1 (preferred) or accept dual webhooks. See "Gen1 → Gen2 Migration" section.

### C-08 — HMAC replay window structurally enables replay
**File:** [index.ts:548-556](functions/src/index.ts#L548-L556), [payments.ts:499-506](functions/src/api/routes/payments.ts#L499-L506)
**Source:** Payment deep-dive audit
The 5-minute replay window is anchored to the `ts` field that lives *inside* the signed `x-signature` header. Captured webhooks can be replayed for the full 5 minutes. `processed_payments` deduplication is the only protection — and it's bypassed when the prior status was `pending`/`in_process`/`processing` (see H-15). For brand-new payment IDs there is no protection at all within the window.
**Fix:** persist `(x-request-id, payment_id)` pairs for ≥10 minutes, reject replays. Tighten window to 2 minutes (MP's recommendation). Reject when `Date.now() < tsMs - 60_000` to catch clock skew abuse.

### C-09 — `/storage/download-url` returns signed URL for any storage path
**File:** [profile.ts:724-755](functions/src/api/routes/profile.ts#L724-L755)
**Source:** Authorization matrix (F-H10), Multi-tenant (C-A1, promoted to Critical)
The endpoint validates only that `path` doesn't contain `..` or start with `/`, then calls `bucket.file(path).getSignedUrl({ action: 'read' })` via Admin SDK — **bypassing Storage rules entirely**. Any authenticated user can read `progress_photos/{anyUserId}/...`, `body_log/{anyUserId}/...`, `video_exchanges/{exchangeId}/...` (videos belonging to another creator's clients), `creator_libraries/{otherCreatorId}/...`, etc., as long as they know or guess the path. Most paths are stable + partially derivable from doc IDs returned by other endpoints.
**Fix:** require an allowlist of path prefixes that must include `auth.userId` (e.g., `progress_photos/${auth.userId}/*`, `body_log/${auth.userId}/*`), OR replace with per-resource endpoints that perform the matching ownership check before signing.

### C-10 — Consent-free enrollment of arbitrary users as one-on-one clients
**Files:** [creator.ts:739-807](functions/src/api/routes/creator.ts#L739-L807), [creator.ts:810-869](functions/src/api/routes/creator.ts#L810-L869)
**Source:** Multi-tenant audit (C-A2)
Any creator can attach any user as their `one_on_one_clients` entry by email/username/userId — no acceptance step, no notification, no on-platform signal to the user. Once attached, `verifyClientAccess` returns true, opening every `/creator/clients/:clientId/*` route — assign programs, write notes, snapshot nutrition plans, view session history, view body-log photos (via lab endpoint), readiness data. Two competing creators can both enroll the same user; either side then operates on the shared `client_session_content`/`client_sessions` namespace (compounds C-02/H-12/H-13).
**Fix:** make `one_on_one_clients` writes pending (`status: 'pending'`) until the target user accepts; gate `verifyClientAccess` on `status === 'active'`. Alternatively require client-initiated invite codes.

---

## High Findings (29)

### Rules-side

#### H-01 — Cross-creator program tampering on `courses/{courseId}/modules/**`
**File:** [firestore.rules:179, 184, 189, 194](config/firebase/firestore.rules#L179)
Parent doc `courses/{courseId}` write checks `creator_id == request.auth.uid`. Subcollection writes only check `isCreator() || isAdmin()` — any creator account can mutate or delete any other creator's program content.
**Fix:** add `get(/databases/$(database)/documents/courses/$(courseId)).data.creator_id == request.auth.uid` to subcollection writes.

#### H-02 — `event_signups/.../waitlist` allows unauthenticated public writes
**File:** [firestore.rules:391](config/firebase/firestore.rules#L391)
`allow create: if true;` lets anyone write arbitrary documents to any event's waitlist subcollection without auth, capacity check, or schema constraints — abusable for storage spam/PII flooding.
**Fix:** gate on `wake_users_only` like registrations, or require minimum field shape with rejected unknown fields.

#### H-03 — `creator_availability` slots world-readable to any signed-in user [PRODUCT DECISION]
**File:** [firestore.rules:290-292](config/firebase/firestore.rules#L290-L292)
Any authenticated user can read every creator's full availability schedule. Likely intentional for booking, but exposes scheduling intelligence cross-platform.
**Fix:** confirm intent; if private, restrict reads to creator owner + users with `one_on_one_clients` relationship. See Tier 5.

#### H-04 — `exercises_library` shared writes allow cross-creator overwrite
**File:** [firestore.rules:469](config/firebase/firestore.rules#L469)
`allow create, update: if isCreator();` — a creator can update or replace another creator's exercise library docs.
**Fix:** scope writes to docs whose `creatorId`/`ownerId` field equals `request.auth.uid`.

#### H-05 — Profile pictures readable by every authenticated user [PRODUCT DECISION]
**File:** [storage.rules:6-15](config/firebase/storage.rules#L6-L15)
Any signed-in user can enumerate `profiles/{anyUserId}/{anyFileName}` and download any user's profile pictures.
**Fix:** confirm policy; if not intentional, restrict to owner + creators with active client relationship + admins. See Tier 5.

#### H-06 — Published bundles world-readable without auth [PRODUCT DECISION]
**File:** [firestore.rules:604](config/firebase/firestore.rules#L604)
`allow read: if resource.data.status == 'published' || ...` — published bundle docs are world-readable. Likely intentional for marketing, but bundles may carry pricing, internal IDs, or unpublished metadata.
**Fix:** confirm public-read intent and audit bundle schema; otherwise add `isSignedIn()` or split collection. See Tier 5.

### API self-grant cluster (Pattern A)

#### H-07 — Self-grant trial to any course with arbitrary metadata
**File:** [profile.ts:337-382](functions/src/api/routes/profile.ts#L337-L382)
Only checks course exists; client supplies `courseDetails.title/image_url/deliveryType` which is written verbatim into `users/{me}.courses[courseId]` with `status: "trial"`, then read by workout handlers as proof of access.
**Fix:** read trial config from the course doc server-side; reject when `course.free_trial.active !== true`; ignore client-supplied `courseDetails`.

#### H-08 — `/users/me/move-course` (covered by C-01 above)

#### H-09 — Self-grant indefinite "active" via backfill
**File:** [profile.ts:410-437](functions/src/api/routes/profile.ts#L410-L437)
Same shape as C-01; calls `assignCourseToUser` with no ownership/payment verification.
**Fix:** require an existing `client_programs/{userId_programId}` doc OR admin role before creating the entry.

#### H-10 — Fake `purchase_logs` entries
**File:** [profile.ts:758-789](functions/src/api/routes/profile.ts#L758-L789)
All fields (`amount`, `currency`, `paymentMethod`, `receiptId`) are user-supplied with no cross-check against `processed_payments`. If any analytics or revenue calc reads from `purchase_logs`, users can fake purchase history.
**Fix:** restrict to admin, OR stop logging client-claimed amounts.

### API content-tree cluster (Pattern C+D)

#### H-11 — `GET /workout/programs/:courseId` returns full course doc to any auth user
**File:** [workout.ts:2281-2291](functions/src/api/routes/workout.ts#L2281-L2291)
Sibling routes gate access; this one only checks the course exists. Returns `...courseDoc.data()` which may include private fields (`subscription_price`, `creator_email`, future internal fields).
**Fix:** allowlist response shape OR gate on `status === "published"`.

#### H-12 — `PATCH .../client-sessions/:clientSessionId/content/exercises/:exerciseId` raw body, no parent ownership
**File:** [creator.ts:3257-3275](functions/src/api/routes/creator.ts#L3257-L3275)
Verifies client access then writes `...req.body` to nested doc; parent `client_session_content/:clientSessionId` is never confirmed to belong to this creator/client pair.
**Fix:** read parent doc, verify `creator_id === auth.userId`, allowlist fields.

#### H-13 — `PATCH/PUT .../client-sessions/:clientSessionId/content` raw body, no parent ownership
**File:** [creator.ts:3163-3253](functions/src/api/routes/creator.ts#L3163-L3253)
Same shape as H-12. `verifyClientAccess` confirms creator/client relationship but anyone with one client can write to *any* `client_session_content/{anyId}` doc by passing that id.
**Fix:** same as H-12.

#### H-14 — `POST /workout/client-programs/:programId` raw `req.body` spread
**File:** [workout.ts:2567-2589](functions/src/api/routes/workout.ts#L2567-L2589)
Fields are spread before being overridden by `user_id`/`program_id`, so users cannot impersonate, but they can inject any other field shape (`assigned_by`, `expires_at`, `creator_id`, `status: "completed"`).
**Fix:** allowlist via `pickFields(['currentSessionId', 'currentModuleId', 'progress', ...])`.

### Payment cluster

#### H-15 — `processing` status permits unbounded re-entry under contention
**Files:** [index.ts:771-808](functions/src/index.ts#L771-L808), [payments.ts:642-654, 756-770](functions/src/api/routes/payments.ts#L642-L654)
Idempotency check explicitly allows reprocessing whenever prior status is `pending|in_process|processing`. Two concurrent webhooks for the same approved payment can both observe `processing` and proceed past the gate. The final transaction is atomic for the *first* commit, but `assignCourseToUser` runs *outside* that transaction in renewal paths — two renewals can both call it and double-extend `expires_at`.
**Fix:** move `assignCourseToUser` *inside* the same transaction in renewal paths (already accepts a transaction handle). OR set `processing` only with a lease-expires field and reject if a fresh lease exists.

#### H-16 — `assignCourseToUser` skip-on-active idempotency only fires on non-renewal
**File:** [courseAssignment.ts:36-43](functions/src/api/services/courseAssignment.ts#L36-L43)
Only short-circuits when `!isRenewal`. On renewal, two concurrent webhooks can each compute `expires_at = max(currentExpiration, now) + 30d` from a stale read and write back, sliding expiration forward by an extra cycle per duplicate. Combined with H-15: free month per duplicate `payment.updated`.
**Fix:** in renewal mode, read current `expires_at` *inside* a transaction and compare against the candidate — if on-disk value ≥ candidate, no-op.

#### H-17 — Bundle assignment is not transactional
**File:** [bundleAssignment.ts:34-174](functions/src/api/services/bundleAssignment.ts#L34-L174)
Single `userRef.update(updatePayload)` after a non-transactional `userRef.get()`. Concurrent `bundle-sub` renewal webhooks can compute new `expires_at` from same stale snapshot. The `processed_payments` write that gates this in [payments.ts:862-875](functions/src/api/routes/payments.ts#L862-L875) is *separate* from the user mutation — a crash between bundle grant and `processed_payments` finalization allows full retry.
**Fix:** wrap bundle grant + `processed_payments.set("approved")` in a single `runTransaction`.

#### H-18 — Refunds completely ignored in Gen1 (no production refund handling)
**File:** [index.ts:892-922](functions/src/index.ts#L892-L922)
Only branches on `status === "approved"`. MP `payment.updated` with `status: "refunded"` or `"charged_back"` simply records the status to `processed_payments` and returns 200 — `users/{userId}.courses[courseId]` keeps `status: "active"`. Gen2 ([payments.ts:712-739](functions/src/api/routes/payments.ts#L712-L739)) handles refunds correctly, but Gen2 is unreachable (C-07). **Today: refund a payment, keep the program.** Compliance and chargeback risk.
**Fix:** either route MP to Gen2 after fixing C-07, OR backport the Gen2 refund branch into Gen1 immediately.

#### H-19 — Gen1 honors `course.access_duration`; Gen2 hardcodes "monthly"/"yearly"
**Files:** [index.ts:1173, 1245-1255](functions/src/index.ts#L1173) vs [payments.ts:910](functions/src/api/routes/payments.ts#L910)
Gen1 reads `courseAccessDuration = courseDetails?.access_duration` (with hard error if missing). Gen2 overrides to `isSubscription ? "monthly" : "yearly"` regardless. A creator publishing a 6-month course → Gen1 grants 180 days, Gen2 grants 365 days. Same divergence applies to bundles.
**Fix:** pick course doc as source of truth, apply uniformly. Block creators from publishing courses without `access_duration` at the API level.

#### H-20 — `updateSubscriptionStatus` lacks state-machine guards
**File:** [index.ts:1332-1498](functions/src/index.ts#L1332-L1498)
Auth correctly limits to owning user, but no current-state guard before calling MP's `preapproval.update`. Drift scenarios: cancel-after-cancel rewrites `cancelled_at` (audit-trail loss); resume-after-cancel may erase original `cancelled_at` via `FieldValue.delete()`; pause-after-cancel similar drift. Gen2 cancel endpoint ([payments.ts:994-1060](functions/src/api/routes/payments.ts#L994-L1060)) has no `pause`/`resume` support at all.
**Fix:** read current status first; reject transitions outside allowed set (`pending|authorized → cancelled|paused`, `paused → authorized|cancelled`); never delete `cancelled_at`.

#### H-21 — Subscription preapproval webhook trusts `external_reference` for unknown subs
**Files:** [index.ts:689-693](functions/src/index.ts#L689-L693), [payments.ts:598-603](functions/src/api/routes/payments.ts#L598-L603)
When a `subscription_preapproval` event arrives, the handler trusts the `external_reference` returned by MP and writes `users/{parsed.userId}/subscriptions/{preapprovalId}`. Signature is HMAC-validated (safe against forgery) — but if the local subscription doc with that id doesn't exist (e.g., created off-platform via MP web UI), the code silently creates a new doc anywhere the `external_reference` points.
**Fix:** require the local `subscriptions/{preapprovalId}` doc to exist *and* match the parsed `userId` before merging the update.

### Dependency

#### H-22 — `protobufjs <7.5.5` in `functions/` — arbitrary code execution (production-exposed)
**Source:** [GHSA-xq3m-2v4x-88gg](https://github.com/advisories/GHSA-xq3m-2v4x-88gg)
Reaches `firebase-admin` in the production `api` Cloud Function. Non-breaking fix.
**Fix:** `cd functions && npm audit fix`.

### Authorization (Pattern A continued)

#### H-23 — `/storage/download-url` (covered by C-09 above)

#### H-24 — `POST /creator/register` is unauthenticated path to elevate `role: user → creator`
**File:** [creator.ts:8671-8744](functions/src/api/routes/creator.ts#L8671-L8744)
Any authenticated end-user can call this and gain creator privileges (creates courses, plans, library, API keys, requests API access email). No payment, no email confirmation, no admin approval, no captcha. The 200rpm limit allows ~12k role flips/hour from one account.
**Fix:** if self-onboarding intended — at minimum require email-verified status, add per-IP daily cap, log to audit collection. Ideally require admin approval.

#### H-25 — `PATCH /users/me/courses/:courseId/status` accepts any string
**File:** [profile.ts:651-672](functions/src/api/routes/profile.ts#L651-L672)
`vB`-validated as `string`, no enum check. User can set `courses.<courseId>.status = "trial"` or `"active"` with arbitrary `expiresAt` for a course they purchased on a 6-month plan to pretend it's still trial-eligible. Combined with H-07, gives users another lever over their own course map.
**Fix:** restrict to enum `["active", "expired", "cancelled"]`.

### Taint / output sinks

#### H-26 — Creator-controlled HTML in broadcast emails has no server-side sanitizer
**Source:** [email.ts:148-164](functions/src/api/routes/email.ts#L148-L164) → sink: [index.ts:2722](functions/src/index.ts#L2722)
`bodyHtml` accepted up to 50KB and interpolated raw into `buildEmailShell`. A creator (or attacker who phishes a creator's ID token) can send any HTML — `<form>` payloads, `<img>` tracking pixels, brand-impersonation links — under the **Wake `notificaciones@wakelab.co` From address**. Wake "From" is the brand reputation, not the creator's, so blast radius is wider than typical SaaS.
**Fix:** server-side `sanitize-html` or `DOMPurify` with marketing allowlist (`p, br, strong, em, a, img, ul, ol, li, h1-h3, blockquote`); force `target="_blank" rel="noopener"` on links; reject `<script>/<style>/<iframe>/<form>` and `on*=` attributes server-side.

#### H-27 — Push notification title/body interpolates unsanitized peer name + creator-set exercise name
**File:** [index.ts:2331-2335](functions/src/index.ts#L2331-L2335) (also [index.ts:2219](functions/src/index.ts#L2219) for rest-timer)
Title `Nuevo video de ${senderName}` and body `${exerciseName} — toca para revisar` use raw `users.displayName` (200 char cap, otherwise unrestricted) and creator-set names. Native push is plain text so no XSS, but **notification spoofing** is real — a client with `displayName = "Wake Support — refund link en la app"` shows as a system push to the coach.
**Fix:** clamp `senderName` to ~40 chars and quote it (`Nuevo video de "${senderName}"`); keep server-controlled verb prefix so user knows what kind of message it is.

### Multi-tenant

#### H-28 — `assign-plan` doesn't verify plan ownership (cross-creator plan-content read + propagation)
**Files:** [creator.ts:5754-5838](functions/src/api/routes/creator.ts#L5754-L5838), [creator.ts:8106-8162](functions/src/api/routes/creator.ts#L8106-L8162)
Both endpoints accept `planId` from body, fetch `plans/{planId}/modules/*` without checking `plans/{planId}.creatorId === auth.userId`, write the planAssignments mapping, and `ensureClientCopy` snapshots the *full* plan content into `client_plan_content`. **Creator can read any other creator's plan tree by passing a discovered planId, and bake it into their own client's content.** The check exists at [creator.ts:7015](functions/src/api/routes/creator.ts#L7015) — just not at these call sites.
**Fix:** before reading modules, fetch `plans/{planId}` and assert `creatorId === auth.userId`.

#### H-29 — `GET /library/sessions/:sessionId?creatorId=X` reads any creator's library session
**File:** [workout.ts:3011-3034](functions/src/api/routes/workout.ts#L3011-L3034)
Any authenticated user (including a competing creator) can pass an arbitrary `creatorId` query param and read `creator_libraries/{creatorId}/sessions/{sessionId}` plus its full exercise/set tree. Library sessions are creator IP. Firestore rules correctly restrict the collection to the owner; this API endpoint launders that restriction via Admin SDK.
**Fix:** require `creatorId === auth.userId` for creator role, OR for a client require that the requested session is referenced by an active program/plan they're enrolled in.

---

## Medium Findings (45)

### Rules-side

#### M-01 — `event_signups/.../registrations` create allows arbitrary `userId` field
**File:** [firestore.rules:370-375](config/firebase/firestore.rules#L370-L375)
For non-`wake_users_only` events, anyone can create registration docs claiming any `userId` value. Lets attacker pollute another user's registration listing.
**Fix:** when signed-in, require `request.resource.data.get('userId', '') == request.auth.uid`.

#### M-02 — `nutrition_assignments` and `client_nutrition_plan_content` lack `userId` check on create
**File:** [firestore.rules:328, 343](config/firebase/firestore.rules#L328)
Create allows the creator to set `userId` to any value with no validation that the target user has a relationship with this creator.
**Fix:** cross-check `one_on_one_clients` membership for `(creatorId, clientUserId)` pair on create.

#### M-03 — `client_programs/sessions/content/plan_content` don't verify creator-client relationship at create
**File:** [firestore.rules:484, 502, 514, 526](config/firebase/firestore.rules#L484)
A creator can write a doc setting any `clientId`. Combined with the data being readable by that arbitrary client, a creator could push unsolicited content into any user's app.
**Fix:** validate `one_on_one_clients` membership on create.

#### M-04 — `user_progress` and `completed_sessions` legacy collections allow caller-controlled `userId`
**File:** [firestore.rules:212-216, 225-228](config/firebase/firestore.rules#L212-L216)
Marked legacy. `request.resource.data.userId == request.auth.uid` OR'd with docId pattern still allows broad writes.
**Fix:** delete both rules and underlying collections if confirmed unused.

#### M-05 — `creator_media` Storage objects world-readable
**File:** [storage.rules:85-94](config/firebase/storage.rules#L85-L94)
Documented intentional ("URLs embedded in `<img>` tags"), but any leaked URL is permanently public. Tokens on download URLs mitigate enumeration.
**Fix:** confirm no PII/private content uploaded; consider signed URLs for sensitive assets.

#### M-06 — `event_signups/.../registrations` update permits creator to write any field
**File:** [firestore.rules:383-386](config/firebase/firestore.rules#L383-L386)
Update permits the event creator to write any field, including `userId`, `checkin_token`.
**Fix:** restrict updatable field set via `request.resource.data.diff(resource.data).affectedKeys().hasOnly(['checked_in', 'checked_in_at', ...])`.

#### M-07 — Auth state cached in AsyncStorage includes email
**File:** [authStorage.js:8-18](apps/pwa/src/utils/authStorage.js#L8-L18)
`@wake_app_auth_state` stores `{ uid, email, displayName, photoURL, providerId, lastLogin }` in AsyncStorage. On web AsyncStorage falls back to `localStorage`, XSS-readable.
**Fix:** drop `email` from cache (Firebase persistence already retains the auth session) or keep only `uid`.

### API broad

#### M-08 — `POST /creator/programs` reads unvalidated `availableLibraries` and `free_trial`
**File:** [creator.ts:1250-1267](functions/src/api/routes/creator.ts#L1250-L1267)
Type checks exist but bypass schema's `stripUnknown` guard. Acceptable but inconsistent.

#### M-09 — `POST /creator/clients/:clientId/programs/:programId` accepts unvalidated `accessDuration`/`expiresAt`
**File:** [creator.ts:5455, 5469](functions/src/api/routes/creator.ts#L5455)
Creator can set `expires_at` to far-future dates, bypassing payment-derived expiry. Limited blast radius (creator owns client).

#### M-10 — `POST /creator/clients/:clientId/notes` accepts raw `req.body.text` (no length cap)
**File:** [creator.ts:1009-1020](functions/src/api/routes/creator.ts#L1009-L1020)

#### M-11 — `POST /creator/plans` validates only `title` manually
**File:** [creator.ts:3280-3322](functions/src/api/routes/creator.ts#L3280-L3322)

#### M-12 — `POST /creator/clients/lookup` and `/invite` read body without `validateBody`
**File:** [creator.ts:694-807](functions/src/api/routes/creator.ts#L694-L807)
No length cap. Also enumeration risk — distinguishes "user found" from "not found" with no rate-limit difference.
**Fix:** tighter rate limit on `/lookup` to deter creator-scoped enumeration.

#### M-13 — `POST /creator/feedback` doesn't validate `body.type` against allowlist
**File:** [creator.ts:2449-2481](functions/src/api/routes/creator.ts#L2449-L2481)

#### M-14 — `validateAuthAndRateLimit` swallows App Check failures silently
**File:** [auth.ts:160-169, 253-265](functions/src/api/middleware/auth.ts#L160-L169)
Comment says "advisory only" but Gen1 enforces App Check. Gen2 path permanently weaker than Gen1.

#### M-15 — `nutrition_food_cache` cache key uses `md5(query)` without user/scope prefix
**File:** [nutrition.ts:253-270](functions/src/api/routes/nutrition.ts#L253-L270)
Not a security issue today (FatSecret responses are public), but key could collide if user-specific data added.

#### M-16 — `GET /workout/calendar/completed` and `/workout/calendar` cap reads at 500
**File:** [workout.ts:2800, 2848](functions/src/api/routes/workout.ts#L2800)
User with >500 sessions in a course gets truncated calendars. Correctness gap.

#### M-17 — `processPaymentWebhook` Gen1 + Gen2 both exist (duplication risk)
**Files:** [index.ts:448](functions/src/index.ts#L448), [payments.ts:473](functions/src/api/routes/payments.ts#L473)
Both validate HMAC and idempotency correctly. Duplication risky long-term — divergent fix histories. Pick one and decommission the other.

#### M-18 — `POST /payments/webhook` (Gen2) successful processing not wrapped in retryable handling
**File:** [payments.ts:961-989](functions/src/api/routes/payments.ts#L961-L989)
If `assignCourseToUser` throws inside the transaction, Express global error handler returns 500 (correct — MP retries), but `processedPaymentsRef` was already set to `processing`. Subsequent retries hit the "already processed" guard at [payments.ts:762](functions/src/api/routes/payments.ts#L762) only when status was `approved` — `processing` is allowed to re-enter (intended). Verify branch end-to-end.

#### M-19 — Gen1 `createPaymentPreference` uses `course.price` which may be undefined
**File:** [index.ts:231](functions/src/index.ts#L231)
Validates only that course doc exists, not that `price` is positive number. MP preference with `unit_price: undefined` → API error → 500.

### Payment deep-dive

#### M-20 — Gen1 `checkRateLimit` per-instance, trivially bypassed
**File:** [index.ts:62-86](functions/src/index.ts#L62-L86)
`createPaymentPreference`, `createSubscriptionCheckout`, `updateSubscriptionStatus` protected only by in-memory map. Cold starts and horizontal scaling let attackers burst hundreds of MP preference creations.
**Fix:** migrate Gen1 payment endpoints to Firestore-based limiter, OR retire them per Gen2 migration.

#### M-21 — Gen2 webhook rate-limit consideration once made public
Once C-07 is fixed, the webhook will be public and won't have an `auth.userId`. The current code doesn't call `checkRateLimit` inside the webhook handler. Any future enabling of `checkIpRateLimit` on public paths must explicitly exempt the webhook (MP retries can spike legitimately).

#### M-22 — `parseExternalReference` no `userId` cross-check against payer
**File:** [paymentHelpers.ts:71-99](functions/src/api/services/paymentHelpers.ts#L71-L99)
Currently safe (only called on already-authenticated paths), but if any future endpoint allows arbitrary `external_reference` creation, this becomes exploitable.
**Fix (defense-in-depth):** when payment arrives, cross-check `paymentData.payer.email` against `users/{userId}.email` and warn on mismatch.

#### M-23 — `course.price` not validated as positive number before MP call
**Files:** [index.ts:231](functions/src/index.ts#L231), [payments.ts:128](functions/src/api/routes/payments.ts#L128)
If `course.price` is `0`, `null`, `undefined`, or string, MP either errors (good) or accepts (bad — free course). `createSubscriptionCheckout` checks at [index.ts:318](functions/src/index.ts#L318), but `createPaymentPreference` and `/payments/preference` don't.
**Fix:** require `typeof course.price === "number" && course.price > 0`.

#### M-24 — Float arithmetic on currency
COP doesn't have decimal subunits in practice. Any future decimal support needs integer (cents).
**Fix:** add creator-side validator requiring `Number.isInteger(price)`.

#### M-25 — Webhook payload error logged in full at multiple sites
**Files:** [index.ts:1296-1297](functions/src/index.ts#L1296-L1297) and 6+ similar `logger.error("...", error)` patterns
MP SDK errors may include `payer.email`, `payer.identification`, BIN. Not strict PCI violation but worth scrubbing.
**Fix:** wrap MP errors with sanitizer that drops `payer`, `card`, `additional_info` fields before logging.

### Logging & PII

#### M-26 — Full email logged at INFO in unsubscribe events
**File:** [email.ts:429](functions/src/api/routes/email.ts#L429)
PII. Cloud Logging is searchable + retained.
**Fix:** hash or domain-only (`email.split("@")[1]`).

#### M-27 — `toEmail` of every video-exchange notification logged at INFO
**File:** [index.ts:2429](functions/src/index.ts#L2429)
Same PII concern.
**Fix:** redact recipient.

#### M-28 — `sendCallReminders` logs recipient email on failure
**File:** [index.ts:3063](functions/src/index.ts#L3063)
Acceptable in error path, but consider domain-only.

#### M-29 — `apikey:last-used-update-failed` passes raw error object
**File:** [auth.ts:222](functions/src/api/middleware/auth.ts#L222)
Could include Firestore internals.
**Fix:** convert to `{error: String(err)}`.

#### M-30 — Ops auth secret length leakage in log entry
**File:** [opsApi.ts:62](functions/src/ops/opsApi.ts#L62)
Logs `expectedLen`/`providedLen`. Minor side-channel against ops secret.
**Fix:** remove length fields from log entry.

### Authorization matrix

#### M-31 — `bookings.ts` re-declares dead routes from `creator.ts` with divergent validation
**Files:** [bookings.ts:201, 233](functions/src/api/routes/bookings.ts#L201) vs [creator.ts:6461, 6484](functions/src/api/routes/creator.ts#L6461)
Mounting order registers `creatorRouter` first, so bookings versions never run. The two implementations have **divergent validation** (bookings.ts is stricter — validates `defaultSlotDuration` against `{15,30,45,60}` and walks weeklyTemplate slot overlaps).
**Fix:** delete dead routes from `bookings.ts`, OR move stricter validators into `creator.ts`.

#### M-32 — `notifications.ts` has zero rate limiting on all 3 endpoints
**File:** [notifications.ts:28, 78, 155](functions/src/api/routes/notifications.ts#L28)
`POST /notifications/test` sends real web-push (network-bound, costs money). `POST /notifications/schedule-timer` writes a Firestore doc per call. Global daily quota only applies to API-key callers, not Firebase tokens.
**Fix:** `checkRateLimit(auth.userId, 30, "rate_limit_first_party")` on all three. Also validate `endAt` window.

#### M-33 — `GET/PATCH /creator/clients/:clientId/client-sessions/:clientSessionId` skips `verifyClientAccess`
**File:** [creator.ts:3076-3091](functions/src/api/routes/creator.ts#L3076-L3091) (also sibling PATCH)
Sibling routes call either `verifyClientAccess` or check `creator_id === auth.userId`. These rely only on `creator_id` field check, which fails open if legacy data lacks the field.
**Fix:** add `verifyClientAccess` for consistency.

#### M-34 — `GET /workout/client-session-content/:clientSessionId` no ownership check
**File:** [workout.ts:2944-2958](functions/src/api/routes/workout.ts#L2944-L2958)
Reads `client_session_content/<id>` and returns full exercises/sets tree. No check that `auth.userId === client_id` on parent `client_sessions` doc. Anyone with a guessable `clientSessionId` can read another user's planned session content.
**Fix:** load parent `client_sessions/{id}`, assert `client_id === auth.userId` (or `creator_id === auth.userId`).

#### M-35 — `GET /exercises/:libraryId(/:exerciseName)` exposes any creator's library [intentional today]
**File:** [workout.ts:2054-2125](functions/src/api/routes/workout.ts#L2054-L2125)
By design these power cross-creator library lookups. Today no notion of private libraries exists, so correct *now* but worth a comment.

#### M-36 — `GET /workout/programs/:c/modules` allows access when `status === "publicado"` (Spanish)
**File:** [workout.ts:2310](functions/src/api/routes/workout.ts#L2310)
OR clause checks `"published" || "publicado"`. [creator.ts:1367](functions/src/api/routes/creator.ts#L1367) allowlists only English status values. `"publicado"` is never written by any current endpoint. Dead branch — sign of past status drift.

### Taint / Pattern E

#### M-37 — Email queue `personalizedHtml` merge-tag escape gives false sense of pipeline sanitization
**File:** [index.ts:2594-2598](functions/src/index.ts#L2594-L2598)
Merge-tag escape is correct, but pipeline does not sanitize `bodyHtml`. Once H-26 is fixed, this is moot. Worth a comment.

#### M-38 — `event.image_url` interpolated into CSS `background-image:url('...')` after only HTML escape
**Files:** [events.ts:382-414](functions/src/api/routes/events.ts#L382-L414) → [index.ts:2112](functions/src/index.ts#L2112)
`escapeHtml` converts `'` to `&#39;`. Inside `style="..."` the HTML parser decodes the entity to literal `'` *before* CSS parser runs, so creator can break out of `url('...')` and append additional CSS declarations. Most modern email clients strip `style` aggressively, so impact is low — defense-in-depth gap.
**Fix:** `URL.canParse(eventImageUrl)` and require `https:`; otherwise omit. Also drop `'` characters from URL or use `encodeURI`.

#### M-39 — Creator-controlled text fields have no length cap (Pattern F)
**Files:** [bundles.ts:278-279](functions/src/api/routes/bundles.ts#L278-L279), [events.ts:399-401](functions/src/api/routes/events.ts#L399-L401), [creator.ts:1009-1013](functions/src/api/routes/creator.ts#L1009-L1013), [videoExchanges.ts:349](functions/src/api/routes/videoExchanges.ts#L349)
A creator can write 1MB text into a single doc; Firestore allows ~1MiB. Clients pulling the doc pay bandwidth. Cost/DoS surface.
**Fix:** cap at 5KB per text field (titles 200, descriptions 5000, notes 2000).

#### M-40 — Confirmation-email `subject` includes raw creator-controlled `eventTitleRaw`
**File:** [index.ts:2151](functions/src/index.ts#L2151)
Resend normalizes header values, so CRLF injection not exploitable. Bidi unicode override could spoof recipient inbox display.
**Fix:** trim title to sane length, strip control chars before using in `subject`.

#### M-41 — `users.profilePictureUrl` and `websiteUrl` accept any string up to 2048 chars (no scheme allowlist)
**File:** [profile.ts:151, 170](functions/src/api/routes/profile.ts#L151)
`javascript:` URLs ignored by `<img src>` in modern browsers. But attacker can set `profilePictureUrl` to `https://attacker.com/track.gif?uid=victim` as a view-tracking oracle. `websiteUrl` could be `javascript:fetch(...)` which **does** execute when clicked from `<a href>` if dashboard renders without `rel`/scheme guard.
**Fix:** validate scheme is `https:` (and `http:` if needed); enforce `target="_blank" rel="noopener noreferrer"` on every render.

#### M-42 — `call_bookings.callLink` interpolated into reminder emails with no scheme check
**Files:** [bookings.ts:555-583](functions/src/api/routes/bookings.ts#L555-L583) → [index.ts:3037](functions/src/index.ts#L3037)
Creator can set `callLink = "javascript:..."` (rendered in some webmail clients) or any phishing URL. Recipient sees Wake-branded email saying "Unirse a la llamada" pointing at attacker site.
**Fix:** validate `callLink` matches `^https://` and a domain allowlist (zoom, meet.google, daily.co, whereby) on PATCH endpoint.

### Multi-tenant

#### M-43 — Public registration endpoint bypasses `wake_users_only` event setting [PRODUCT DECISION]
**File:** [events.ts:135-234](functions/src/api/routes/events.ts#L135-L234)
Firestore rules enforce `wake_users_only` for direct-from-client writes, but the API is unauthenticated and never reads the event's `wake_users_only` field. Spammer can register arbitrary email/name pairs against any event, triggering creator-themed `sendEventConfirmationEmail` from `eventos@wakelab.co`. Brand abuse.
**Fix:** read event doc, require `validateAuth(req)` if `wake_users_only === true`. Rate-limit per (eventId, IP), dedupe by email. See Tier 5.

#### M-44 — Creator sees shared user's full session history including OTHER creators' sessions
**Files:** [creator.ts:1574-1602](functions/src/api/routes/creator.ts#L1574-L1602), [analytics.ts:840](functions/src/api/routes/analytics.ts#L840)
Query reads `users/{clientId}/sessionHistory` filtered only by `client_id`/optional `sessionId`/`courseId`, with no `creator_id` or "courseId belongs to caller" filter. If a user is enrolled with two creators, creator A sees workout history (loads, RIR, notes) from creator B's programs. Compounds C-10.
**Fix:** filter by `where("courseId", "in", <creator's courseIds>)`, OR require client opt-in to cross-program visibility.

#### M-45 — Email enumeration via `/creator/clients/lookup` and Gen1 `lookupUserForCreatorInvite`
**Files:** [creator.ts:694-736](functions/src/api/routes/creator.ts#L694-L736), [index.ts:1505-1604](functions/src/index.ts#L1505-L1604)
Returns `data: null` on miss vs populated user record on hit (email, displayName, photoURL, username). Any creator can enumerate which emails/usernames exist on Wake. Combined with C-10 (consent-free enrollment), this becomes a directory-harvesting + impose-self-as-coach chain.
**Fix:** rate-limit per creator (200rpm too lax for enumeration); return same shape on hit/miss; only return minimum needed (e.g., masked email).

---

## Low Findings (41)

### Rules/client-side

- **L-01** — `dangerouslySetInnerHTML` at [LabMuscleHeatmap.web.jsx:150](apps/pwa/src/components/LabMuscleHeatmap.web.jsx#L150) sanitized via DOMPurify with `ADD_TAGS:['style']`. SVG is bundled-static. `<style>` tags allow CSS-injection vectors against future dynamic content. Drop `ADD_TAGS:['style']` or render via `<img src>`.
- **L-02** — [SvgIcon.jsx:25](apps/creator-dashboard/src/components/SvgIcon.jsx#L25) generic component accepts arbitrary `svgString` via `dangerouslySetInnerHTML`. DOMPurify with svg profiles applied. Restrict callers to bundled icon strings; document contract.
- **L-03** — Offline queue persists request bodies in `localStorage` unencrypted ([offlineQueue.js:25-47](apps/pwa/src/utils/offlineQueue.js#L25-L47), [backgroundSync.js:16-22](apps/pwa/src/utils/backgroundSync.js#L16-L22)). Workout completion / nutrition diary mutations may include body weight, food intake. Consider IndexedDB.
- **L-04** — `target="_blank"` external link with `rel="noopener noreferrer"` at [InstallScreen.web.jsx:498](apps/pwa/src/screens/InstallScreen.web.jsx#L498). Already safe, flagged for confirmation.
- **L-05** — `getUserRole()` falls back to Firestore `get()` on every rule eval when custom claim absent ([firestore.rules:20-27](config/firebase/firestore.rules#L20-L27)). Cost issue + small consistency window. Ensure custom claims set at signup/role-change.
- **L-06** — `subscription_cancellation_feedback` create lets user set arbitrary fields ([firestore.rules:579](config/firebase/firestore.rules#L579)). Low risk (admin-only read), but user could write large payloads. Enforce `keys().hasOnly([...])`.
- **L-07** — `processed_payments` and `api_keys` correctly server-only — confirmed.
- **L-08** — `call_bookings` allows client to update creator-owned fields ([firestore.rules:304-308](config/firebase/firestore.rules#L304-L308)). Update permission grants both parties full write — client could mutate creator-owned metadata. Scope client updates to whitelist (e.g., `cancelled_by_client`, `notes`).
- **L-09** — Storage rule for `events/{eventId}/{fileName}` allows any auth user to overwrite event cover images ([storage.rules:139-144](config/firebase/storage.rules#L139-L144)). No path-scoping by creator. Enforce via signed-URL path tokens or Firestore.get check.

### API broad / Authorization

- **L-10** — `processPaymentWebhook` Gen1 sets `Access-Control-Allow-Origin: *` on a webhook endpoint ([index.ts:451](functions/src/index.ts#L451)). Meaningless for server-to-server webhooks; harmless noise.
- **L-11** — `GET /users/me/full` returns entire user document ([profile.ts:499-514](functions/src/api/routes/profile.ts#L499-L514)). Spreading `...data` is fragile; new sensitive fields would leak automatically. Allowlist response.
- **L-12** — `GET /users/:userId/public-profile` exposes `birthDate`, `city`, `country`, full `cards` object to any authenticated user ([profile.ts:305-334](functions/src/api/routes/profile.ts#L305-L334)). May be intentional for creator profiles. `birthDate` for regular users is over-shared. Gate by `role === 'creator'`.
- **L-13** — `GET /storage/download-url` path validation only blocks `..` and leading `/` ([profile.ts:723-755](functions/src/api/routes/profile.ts#L723-L755)). Same as C-09 / H-23. Storage rules don't help (Admin SDK bypasses them). Defense-in-depth: prefix-allowlist.
- **L-14** — `GET /library/sessions/:sessionId` accepts `creatorId` from query without verifying caller relationship ([workout.ts:3012-3034](functions/src/api/routes/workout.ts#L3012-L3034)). Same as H-29.
- **L-15** — `POST /creator/programs/:programId/image/upload-url` doesn't validate `contentType` against allowlist ([creator.ts:1503-1524](functions/src/api/routes/creator.ts#L1503-L1524)). Other upload endpoints check `image/jpeg|png|webp`. Inconsistent.
- **L-16, L-17, L-18** — `POST /notifications/test`, `/schedule-timer`, `/subscribe` no rate limit ([notifications.ts:28, 78, 155](functions/src/api/routes/notifications.ts#L28)). Same as M-32.
- **L-19** — `eventPage` ([index.ts:2817](functions/src/index.ts#L2817)) and `expandWeeklyAvailability` (scheduler) not deeply reviewed.
- **L-20** — `parseExternalReference` correctly validates version, delimiter count, payment-type allowlist ([paymentHelpers.ts:71](functions/src/api/services/paymentHelpers.ts#L71)). No issue.
- **L-21** — Webhook HMAC validation in both Gen1 ([index.ts:448-597](functions/src/index.ts#L448-L597)) and Gen2 ([payments.ts:473-546](functions/src/api/routes/payments.ts#L473-L546)) correctly uses `crypto.timingSafeEqual`, length-checks both buffers, enforces 5-minute timestamp window. Solid.

### Payment

- **L-22** — Gen2 `binary_mode: true` correct, `auto_return: "approved"` may strand users on `failure`/`pending` ([payments.ts:131-138](functions/src/api/routes/payments.ts#L131-L138)). Cosmetic.
- **L-23** — `next_payment_date` fallback chain may use *prior* cycle's date after MP's first charge ([payments.ts:574-586](functions/src/api/routes/payments.ts#L574-L586), [index.ts:695-698](functions/src/index.ts#L695-L698)). Display issue.
- **L-24** — `processed_payments/{paymentId}` stuck-in-`processing` state. If `assignCourseToUser` throws after `processedRef` set to `processing` ([payments.ts:762](functions/src/api/routes/payments.ts#L762), [index.ts:945](functions/src/index.ts#L945)) and error path falls through, doc stays `processing` forever. No double-grant risk; operational noise. Add 10-min TTL or ops alert.
- **L-25** — Gen2 webhook doesn't log `webhookAction` on 200-OK skip paths ([payments.ts:556, 608, 617-618, 623, 628](functions/src/api/routes/payments.ts#L556)). Less observability than Gen1 ([index.ts:599-603](functions/src/index.ts#L599-L603)).
- **L-26** — `revokeBundleAccess` no idempotency check ([bundleAssignment.ts:180-208](functions/src/api/services/bundleAssignment.ts#L180-L208)). Refund retries cheap and safe; just noting unconditional.

### Authorization

- **L-27** — `GET /creator/check-username/:username` ([creator.ts:8655](functions/src/api/routes/creator.ts#L8655)) doesn't call `requireCreator`. Any authenticated user can probe. Probably intentional (signup), but namespaced `/creator/*`. Rename or add rate limit.
- **L-28** — `PATCH /workout/courses/:courseId/progress` ([workout.ts:2202](functions/src/api/routes/workout.ts#L2202)) and `POST .../last-session` ([workout.ts:2242](functions/src/api/routes/workout.ts#L2242)) write to user's own course map without field shape validation. User can pollute their own course entry. Self-DoS only.
- **L-29** — `appResources.ts` admin gate uses `req.auth.role` directly ([appResources.ts:42-45](functions/src/api/routes/appResources.ts#L42-L45)). Inline check works, bypasses helper pattern. Factor out `requireAdmin` helper.
- **L-30** — `validateBody` `string` field max length 5000 ([validate.ts:48](functions/src/api/middleware/validate.ts#L48)) but `email.ts` overrides to 50_000 ([email.ts:163](functions/src/api/routes/email.ts#L163)). Per-route `maxBodyHtml` cap separate from generic strings.
- **L-31** — `POST /workout/prs/batch-history` validates `keys` length (max 20) but not key shape ([workout.ts:1999-2029](functions/src/api/routes/workout.ts#L1999-L2029)). Self-keyed so safe; non-string key could throw.

### Taint

- **L-32** — `escapeHtml` duplicated in two modules ([emailHelpers.ts:8](functions/src/api/services/emailHelpers.ts#L8) and `escapeHtmlSimple = sharedEscapeHtml` at [index.ts:2711](functions/src/index.ts#L2711)). Converge to prevent drift.
- **L-33** — `subscription_cancellation_feedback.feedback` accepts unrestricted object ([profile.ts:584-600](functions/src/api/routes/profile.ts#L584-L600)). No admin renderer today; if/when built, treat as untrusted, apply 1KB length cap at write-time.
- **L-34** — `eventPage` injects `data.title` and `data.description` into `<title>` and OG meta via regex ([index.ts:2847-2855](functions/src/index.ts#L2847-L2855)). `escapeOgAttr` covers `&`, `"`, `<` — missing `>` and `'`. Sufficient inside double-quoted attr; future change to single-quoted or `<script>` JSON-LD would silently become XSS sink. Switch to `escapeHtml` for parity.
- **L-35** — `processEmailQueue` logs full `error: batchErrorMsg` from Resend ([index.ts:2682](functions/src/index.ts#L2682)). Resend can echo parts of raw `from`/`subject` in error messages → Cloud Logging searchable.

### Multi-tenant

- **L-36** — `client_plan_content` docs written without `creatorId`/`clientId` fields ([creator.ts:2717-2724](functions/src/api/routes/creator.ts#L2717-L2724), [creator.ts:7933-7940](functions/src/api/routes/creator.ts#L7933-L7940)). Rule requires `resource.data.creatorId == request.auth.uid`; docs unreadable from client SDK. Works today through API only. Defense-in-depth: populate fields on every write.
- **L-37** — `/users/:userId/public-profile` exposes `birthDate`/`city`/`country` (same as L-12).
- **L-38** — Public read of `creator_media/*` (same as M-05).
- **L-39** — Storage path `creator_libraries/{creatorId}/sessions/{sessionId}/image.{ext}` not declared in storage.rules. Falls through to default deny. Combined with C-09, malicious user could fetch via `/storage/download-url` regardless. Add explicit Storage rule.

### Logging

- **L-40** — Gen1 logs `init_point` (one-time payment URL) at [index.ts:359-363](functions/src/index.ts#L359-L363). Not secret, but acts as a one-time payment link.
- **L-41** — Multiple `logger.error("...", error)` patterns pass raw error objects ([index.ts:251, 420, 1297, 1493, 1822, 1902, 1981](functions/src/index.ts#L251)). MP SDK errors may serialize whole. Wrap with `safeErrorPayload()` helper.

---

## Confirmed Strengths

The audit explicitly confirmed these are correctly implemented:

### Cryptography & idempotency
- **HMAC `timingSafeEqual`** correct in both Gen1 and Gen2 webhooks (length pre-check, same-length buffer comparison)
- **Idempotency** — `processed_payments/{paymentId}` checked atomically inside Firestore transaction in both Gen1 and Gen2 for the *new-purchase approved* path
- **`external_reference` parser** strict — version-tagged, delimiter-counted, payment-type allowlisted, max 256 chars, fail-closed

### Server-side guarantees
- **Server-side amounts** — every payment-creating endpoint reads `course.price`/`bundle.pricing` from Firestore. Client never supplies amounts (modulo M-23 zero/null edge case)
- **`validateBody` strips unknown fields by default** ([validate.ts:175-184](functions/src/api/middleware/validate.ts#L175-L184)) — eliminates wide class of mass-assignment risks
- **Prototype-pollution guards** on `__proto__/constructor/prototype` keys ([validate.ts:29, 60-65](functions/src/api/middleware/validate.ts#L29)) and parallel guard in `PATCH /workout/client-programs/:programId/overrides` ([workout.ts:2607-2614](functions/src/api/routes/workout.ts#L2607-L2614))
- **Storage-path traversal** — `validateStoragePath()` consistently used on every signed-URL confirm endpoint reviewed (`profile.ts:284`, `progress.ts:194`, `events.ts:543`, `videoExchanges.ts:142,366,525`, `creator.ts:1537,2251,4598`)
- **Webhook retry semantics** match CLAUDE.md spec: 500 only for `RETRYABLE` errors, 200 for non-retryable
- **Renewal expiration** computed from existing `expires_at` (not `now`), preserving paid-for time on early renewals
- **`bundleSnapshot` freeze on renewal** correctly grandfathers users into their original bundle composition
- **Refund branch in Gen2** correctly handles both course and bundle revocation (unreachable today due to C-07, but logic is correct)
- **One-on-one rival-creator guard** prevents purchasing a competing program while locked in
- **App Check** required on all Gen1 payment endpoints
- **Signature failure returns 403, not 200** — does not poison `processed_payments`

### Client-side
- **No XSS sinks** confirmed — every `dangerouslySetInnerHTML` in client code passes through DOMPurify or uses bundled SVG asset
- **No payment data in localStorage**
- **No third-party secrets in client code** — only Firebase web `apiKey` (public by design)
- **No `eval()` / `new Function(string)`** anywhere

### Secrets / git history
- **No credentials ever committed** to git history
- **`.gitignore` correctly covers** `.env*`, `serviceAccountKey*.json`, `firebase-adminsdk*.json`, `google-services.json`, `GoogleService-Info.plist`
- **No MercadoPago, Resend, FatSecret, Stripe, AWS keys** in any source file
- **Server-side secrets** correctly read via `process.env` from Firebase Secret Manager bindings

### Logging
- **Express global error handler** returns generic `INTERNAL_ERROR` to clients with stack only to Cloud Logging — correct pattern
- **No raw Firebase ID tokens, API keys, MercadoPago access tokens, or webhook secrets logged anywhere**
- **No `JSON.stringify(req.body)`** patterns found
- **No `err.stack` returned in HTTP responses**

### Multi-tenant boundaries (~110 reviewed)
Confirmed clean isolation:
- All `/creator/library/*`, `/creator/exercises/libraries/*` routes — scoped to `creator_libraries.doc(auth.userId)`
- All `/creator/programs/*` mutation routes — gated by `verifyProgramOwnership`
- All `/creator/plans/*` (template CRUD) — every route checks `plans/{planId}.creator_id === auth.userId` before touching subtree
- All `/creator/bundles/*` — every CRUD route checks `bundles/{bundleId}.creatorId === auth.userId`; `validateBundleConstituents` ensures only own courses added
- All `/creator/events/*` — gated by `verifyEventOwnership`; email send constrains recipients to creator's own event registrations
- `/video-exchanges/*` — every route validated through `getExchangeOrThrow`; storage upload paths re-validated via `validateStoragePath`
- `/notifications/*` — push subscriptions and rest-timer scheduling scoped to `auth.userId`
- `/bookings/*` — booking creation uses Firestore transaction on `creator_availability/{creatorId}`; cancellation requires `clientUserId === auth.userId`
- `/api-keys/*` — keys scoped by `owner_id`; `enforceScope` correctly invoked
- `sendVideoExchangeNotification` — only sends to other participant; recipient resolution from exchange doc, not user input
- `processEmailQueue`, `sendCallReminders`, `expandWeeklyAvailability` — all read documents owned by their creator; never cross tenants
- Firestore rules for `one_on_one_clients`, `video_exchanges`, `bundles`, `call_bookings`, `creator_availability`, `creator_feedback`, `plans` (top-level), `creator_nutrition_library/*`, `nutrition_assignments` — relationship checks present and consistent with API

---

## Dependency Findings

`npm audit --json` results across all package.json locations.

| Location | Total | Critical | High | Moderate | Low |
|---|---:|---:|---:|---:|---:|
| `functions/` | 26 | 2 | 6 | 16 | 2 |
| `apps/pwa/` | 33 | 1 | 11 | 21 | 0 |
| `apps/creator-dashboard/` | 15 | 1 | 10 | 4 | 0 |
| `apps/landing/` | 5 | 1 | 3 | 1 | 0 |
| repo root | 22 | 2 | 8 | 8 | 4 |

### Top concerning packages

1. **`protobufjs <7.5.5` — CRITICAL** ([GHSA-xq3m-2v4x-88gg](https://github.com/advisories/GHSA-xq3m-2v4x-88gg)) — Arbitrary code execution. Reaches `firebase-admin` in production `api` function (production-exposed). Non-breaking fix.
2. **`undici 7.x` — HIGH** — Multiple CVEs (HTTP smuggling, WebSocket OOM, CRLF injection in `upgrade`). Pulled by `firebase-admin`/`firebase-tools`. Server-side; CRLF and smuggling issues exposure-relevant since API issues outbound HTTP to MercadoPago, FatSecret, Resend.
3. **`vite 7.x` — HIGH** ([GHSA-4w7w-66w2-5vf9](https://github.com/advisories/GHSA-4w7w-66w2-5vf9), [GHSA-v2wj-q39q-566r](https://github.com/advisories/GHSA-v2wj-q39q-566r), [GHSA-p9ff-h696-f583](https://github.com/advisories/GHSA-p9ff-h696-f583)) — Dev-server path traversal / arbitrary file read. **Dev-only, not production-exposed.** Trivial fix.
4. **`uuid` (multiple ranges)** — Buffer bounds bug ([GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq)). Transitively in `mercadopago`, `gaxios`, `svix` (→ `resend`), Firebase tooling. Wake doesn't pass attacker-controlled `buf` arguments — practical exposure low. Update on next dep refresh.
5. **`rollup 4.0.0–4.58.0` — HIGH** ([GHSA-mw96-cpmx-2vgc](https://github.com/advisories/GHSA-mw96-cpmx-2vgc)) — Build-time arbitrary file write. Build-tool only.

### Recommended remediation order

1. **`cd functions && npm audit fix`** (non-breaking) — clears `protobufjs`, several `uuid` chains, `brace-expansion`, `ajv`. **Production server.**
2. **`cd apps/landing && npm audit fix`** + **`cd apps/creator-dashboard && npm audit fix`** — both non-breaking; resolves `protobufjs`, `vite`, `rollup`, `postcss`, `undici`.
3. **`cd apps/pwa && npm audit fix`** — careful, may prompt `--force` for Expo chain. Don't `--force` without testing on a branch.
4. **Root `npm audit fix --force`** would downgrade `firebase-tools` to 1.2.0 (major regression). **Do NOT run** — accept these CLI-tool vulns or upgrade `firebase-tools` to current major (15.x) manually.

---

## Product Decisions Required (Tier 5)

Each of these is "is this intentional?" — current behavior is permissive, but might be the right call.

### 5.1 — Creator availability visibility (H-03)
**Current:** Any signed-in user can read every creator's full availability schedule.
**Open:** booking flow needs availability visibility.
**Locked:** restrict to creator + active one-on-one clients; booking page reads via API instead of direct Firestore.
**Recommendation:** Lock down. Wake creators compete; BI leakage is real.

### 5.2 — Profile picture visibility (H-05)
**Current:** Any signed-in user can read any other user's profile picture.
**Open:** social-product standard.
**Locked:** owner + creators with active client relationship + admins.
**Recommendation:** Lock down. Wake isn't social; fitness photos are privacy-sensitive.

### 5.3 — Published bundles world-readable without auth (H-06)
**Current:** Bundle docs with `status: 'published'` readable without authentication.
**Open:** landing page reads bundles directly.
**Locked:** require auth, OR split collection (`bundles_public/{id}` for marketing, `bundles/{id}` for internal).
**Action needed:** audit bundle doc schema. If only marketing fields, leave open + document. If anything internal, split.

### 5.4 — `wake_users_only` enforced in event registration API (M-43)
**Current:** Rules enforce `wake_users_only` for direct writes; API endpoint ignores the flag.
**Recommendation:** Just fix the inconsistency. No real reason to keep.

---

## Project-Level Work (Tier 4)

### Gen1 → Gen2 payment migration

**Why:** No production refund handling today (Gen1 ignores refunds; Gen2 handles them but is unreachable). Two divergent code paths. Gen2 has Firestore-backed rate limits, scoped API keys, cleaner separation.

**Pre-cutover steps:**
1. Add `/^\/payments\/webhook$/` to `PUBLIC_PATHS` in `app.ts`. Verify with synthetic POST.
2. Backport Gen1's `course.access_duration` reading into Gen2 ([payments.ts:910, 835](functions/src/api/routes/payments.ts#L910)) — mirror [index.ts:1245-1255](functions/src/index.ts#L1245-L1255).
3. Add pause/resume Gen2 endpoints (currently only `/cancel`).
4. Wrap renewal `assignCourseToUser` and bundle grant inside same transaction as `processed_payments` finalization (H-15, H-16, H-17).
5. Build `(x-request-id, payment_id)` replay table outside the 5-min window (C-08).
6. End-to-end test refund webhook against staging (`wake-staging`) using MP sandbox; idempotency test (replay same webhook 5×); state-machine test for cancel→pause→resume→cancel.

**Cutover:**
7. Configure MercadoPago to send to **both** webhooks (MP supports multiple). Reconcile `processed_payments` for one full billing cycle (~30 days).
8. Migrate MP webhook URL to `https://wolf-20b8b.web.app/api/v1/payments/webhook`. Disable Gen1 webhook in MP dashboard.

**Post-cutover:**
9. Update PWA + creator dashboard to call `/api/v1/payments/*` endpoints for payment creation.
10. Delete Gen1 payment functions from [index.ts:172-1498](functions/src/index.ts#L172-L1498).

**Time:** 1-2 weeks engineering + 30-day shadow mode (calendar time).

### Firestore rules emulator test suite

**Why:** Static review (this audit) catches what auditors notice. Emulator catches what they don't, and prevents regression.

**Approach:** `@firebase/rules-unit-testing`. One test per finding above (every Critical and High becomes a "should be denied" scenario). Run in CI on every PR.

**Coverage targets:** `users/{userId}/*`, `courses/{courseId}/modules/**`, `client_sessions`, `client_session_content`, `client_plan_content`, `nutrition_assignments`, `creator_libraries`, `event_signups/*/waitlist`, `api_keys`, `processed_payments`.

**Time:** 1-2 days for a meaningful first suite.

---

## Recommended Patch Order

### Tier 0 — Patch within 24 hours (10 issues, exploitable today)
| # | Title | File:line |
|---|---|---|
| 1 | C-01 `/users/me/move-course` self-grant | profile.ts:385-407 |
| 2 | H-24 `POST /creator/register` self-elevation | creator.ts:8671-8744 |
| 3 | H-25 `PATCH /users/me/courses/:c/status` enum | profile.ts:651-672 |
| 4 | C-06 trial duration clamp | profile.ts:336-382 |
| 5 | C-09 `/storage/download-url` prefix-allowlist | profile.ts:724-755 |
| 6 | M-34 `client-session-content/:id` ownership check | workout.ts:2944-2958 |
| 7 | H-02 rules: `event_signups/.../waitlist` auth | firestore.rules:391 |
| 8 | H-18 backport Gen2 refund branch into Gen1 | index.ts:892-922 |
| 9 | H-07 trial endpoint server-controlled metadata | profile.ts:337-382 |
| 10 | H-09 `backfill` ownership check | profile.ts:410-437 |

### Tier 1 — Patch within the week (high-severity batch)
| Title |
|---|
| C-10 consent-free enrollment → `pending` status flow |
| H-28 `assign-plan` ownership check (both call sites) |
| H-29 library session cross-read fix |
| C-02 `client-sessions` cross-creator write fix |
| C-03, C-04 path traversal segment validation (both endpoints) |
| C-05 nutrition assignment validateBody schema |
| H-12, H-13 client-session content parent ownership + pickFields |
| H-14 client_programs raw-body fix |
| H-01 rules: cross-creator program tampering subcollection check |
| H-04 rules: exercises_library ownership scope |
| H-15, H-16 transactional renewal with re-read |
| H-17 transactional bundle grant |
| H-21 preapproval external_reference verification |
| H-10 fake purchase log entries → admin-only |

### Tier 2 — Defense-in-depth batch (single PR)
- URL scheme allowlist helper applied at 4 write sites (M-41, M-42, M-38, profile pic)
- Length caps on bundles/events/client_notes/video_exchange (M-39 / M-10 / M-13 / L-30)
- Server-side `sanitize-html` on email `bodyHtml` (H-26)
- Push notification spoofing fix — clamp + quote `senderName` (H-27)
- Rate limits on `/notifications/*` (M-32)
- Delete dead routes in bookings.ts (M-31)
- Filter `sessionHistory` by creator's courseIds (M-44)
- Logging cleanup: `safeErrorPayload()` helper at ~6 sites in index.ts; redact full emails in unsubscribe / video-exchange notification logs (M-26, M-27, M-28)
- Drop `email` from AsyncStorage cache (M-07)
- Tighten lookup endpoint rate limit + matched response shapes (M-45)

### Tier 3 — Quick-win infrastructure
- `cd functions && npm audit fix` (clears `protobufjs` ACE)
- `cd apps/landing && npm audit fix`
- `cd apps/creator-dashboard && npm audit fix`
- `cd apps/pwa && npm audit fix` (careful)
- **Do not** `npm audit fix --force` at root

### Tier 4 — Project-level
- Gen1 → Gen2 payment migration (1-2 weeks + 30-day shadow)
- Firestore rules emulator test suite (1-2 days)

### Tier 5 — Product decisions (blocks Tier 1 finalization)
- 5.1 Creator availability visibility
- 5.2 Profile picture visibility
- 5.3 Published bundles world-readable
- 5.4 `wake_users_only` API enforcement

---

## Audit Manifest

Audits run 2026-04-27, in parallel:

| # | Audit | Scope | Findings (C/H/M/L) |
|---|---|---|---|
| 1 | Rules + client-side security | `firestore.rules`, `storage.rules`, PWA + creator dashboard client | 0 / 6 / 7 / 9 |
| 2 | API + payment (broad) | All `functions/src/api/routes/*.ts`, payment Gen1 in `index.ts` | 2 / 8 / 12 / 12 |
| 3 | Payment system deep-dive | `index.ts` payment block, `payments.ts`, `paymentHelpers.ts`, `courseAssignment.ts`, `bundleAssignment.ts`, `enrollmentLeave.ts` | 4 / 7 / 6 / 5 |
| 4 | Secrets + deps + logging | git history, `npm audit` × 5, every `logger.*` / `console.*` call | 0 / 1 / 6 / — |
| 5 | Authorization matrix | All routes, full per-route table, systemic outliers | 2 / 4 / 6 / 6 |
| 6 | Data flow / taint tracking | 16 high-risk inputs traced source → sink | 0 / 2 / 7 / 4 |
| 7 | Multi-tenant isolation | ~110 cross-creator boundaries reviewed | 2 / 2 / 3 / 4 |

**Method:** read-only, static analysis with reasoning. No runtime testing, no fuzzing, no third-party pen test. After remediation, the next-most-valuable security investment is an **external penetration test on staging**.

---

*End of consolidated audit.*
