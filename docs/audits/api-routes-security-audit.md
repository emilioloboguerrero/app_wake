# API Routes — Security, Input Validation & Rate Limiting Audit

**Date:** 2026-03-20
**Scope:** `functions/src/api/routes/*.ts`, `functions/src/api/middleware/rateLimit.ts`
**Auditor:** Claude Code (Agent 1A)
**Firebase Project:** wolf-20b8b (production)

---

## Executive Summary

The API layer has solid foundations — auth is centralized, ownership checks exist on most creator endpoints, and rate limiting is broadly applied. However, there is a **systemic mass-assignment vulnerability** across ~30 endpoints where `...req.body` is spread directly into Firestore documents without field allowlisting. Two public endpoints lack authentication AND rate limiting, creating abuse vectors. Storage path confirmation endpoints are vulnerable to path traversal.

**Findings:** 8 CRITICAL, 14 HIGH, 12 MEDIUM, 6 LOW

---

## Per-File Findings

### `routes/profile.ts`

| Severity | Location | Description | Suggested Fix |
|----------|----------|-------------|---------------|
| [CRITICAL] ✅ | profile.ts:121-132 | **Storage path traversal in profile-picture confirm.** Client-supplied `storagePath` is used directly — attacker can pass any bucket path (e.g., `body_log/otherUser/photo.jpg`) to link another user's file as their profile picture. | Validate `storagePath` starts with `profile_pictures/${auth.userId}/` before accepting. |
| [HIGH] ✅ | profile.ts:61-66 | **No type/length validation on PATCH /users/me fields.** Allowlisted fields pass through without type checks — `displayName` could be 100KB string, `height` could be a string, `pinnedTrainingCourseId` could be an object. | Add per-field type/length validation: strings max 200 chars, numbers bounded, etc. |
| [MEDIUM] ✅ | profile.ts:177-193 | **PATCH /creator/profile `cards` object has no depth/size validation.** Any nested object is accepted and written to Firestore. An attacker could write a deeply nested or very large object. | Validate `cards` has max depth 3, max total size 10KB, string values only. |
| [LOW] ✅ | profile.ts:83-86 | **Profile picture upload-url rate limit is 200 RPM.** Signed URL generation should have tighter limits (e.g., 10 RPM) to prevent Storage abuse. | Reduce to `checkRateLimit(auth.userId, 10, ...)`. |

### `routes/nutrition.ts`

| Severity | Location | Description | Suggested Fix |
|----------|----------|-------------|---------------|
| [CRITICAL] ✅ | nutrition.ts:85 | **Mass assignment in PATCH /nutrition/diary/:entryId.** `{ ...req.body }` is spread directly into Firestore update. Attacker can overwrite `created_at`, inject arbitrary fields, or set `__proto__`/`constructor` keys. | Use `validateBody()` with explicit schema, or allowlist fields like profile PATCH does. |
| [CRITICAL] ✅ | nutrition.ts:331-334 | **Mass assignment in POST /nutrition/saved-foods.** `...req.body` is spread into Firestore `.add()` with no validation whatsoever. Any field, any type, any size. | Add `validateBody()` with explicit field schema and max array/string lengths. |
| [HIGH] ✅ | nutrition.ts:307-320 | **GET /nutrition/saved-foods has no pagination.** Fetches ALL saved_foods with no `.limit()`. A user with thousands of saved foods would cause a massive read and response. | Add `.limit(200)` and cursor-based pagination. |
| [HIGH] ✅ | nutrition.ts:16 | **No date format validation on diary query params.** `date`, `startDate`, `endDate` are used directly in Firestore queries without format validation. Invalid dates could produce unexpected query behavior. | Validate date format matches `YYYY-MM-DD` regex before querying. |
| [MEDIUM] ✅ | nutrition.ts:47-53 | **POST /nutrition/diary validates structure but not content.** `foods` array accepted as `unknown[]` — no max length, no item validation. A single diary entry could contain millions of food items. | Add `foods` max length (e.g., 100), validate each item has required fields. |

### `routes/workout.ts`

| Severity | Location | Description | Suggested Fix |
|----------|----------|-------------|---------------|
| [HIGH] ✅ | workout.ts:365-375 | **GET /workout/courses/:courseId exposes full course data to any authenticated user.** No check that the user owns/has access to the course. Returns all course data including creator-private fields. | Verify `auth.userId` has the course in their `courses` map, or is the creator. |
| [HIGH] ✅ | workout.ts:382-401 | **POST /workout/complete `exercises` array has no max length.** An attacker could send thousands of exercises, each with thousands of sets, causing a massive Firestore batch write and costly 1RM computation. | Cap `exercises` at 50, sets per exercise at 20. Validate exercises array items have required fields. |
| [HIGH] ✅ | workout.ts:97-115 | **GET /workout/daily performs unbounded sequential Firestore reads.** For each module, it reads all sessions. A course with 50 modules × 50 sessions = 2500 reads per request. | Add guard: max 20 modules, max 50 sessions per module. Consider denormalizing session counts. |
| [MEDIUM] ✅ | workout.ts:314-319 | **Duplicate sessionHistory query in /workout/daily.** `completedForProgress` on line 314 re-queries the same collection already queried on line 133, wasting reads. | Reuse `completedSnap` from line 133 if available, or compute progress from the first query. |
| [MEDIUM] ✅ | workout.ts:725 | **Exercise history pageToken parsed as integer.** `parseInt(req.query.pageToken)` — if pageToken is not a number, `parseInt` returns `NaN`, and `|| 0` fallback resets pagination. Not a security issue but violates cursor-based pagination contract. | Use proper validation; reject non-numeric pageTokens with 400. |
| [LOW] ✅ | workout.ts:620-625 | **Checkpoint deletion after workout completion is fire-and-forget.** If it fails, stale checkpoint persists. Not a security issue but could cause UX confusion. | Log the error via `functions.logger`. |

### `routes/progress.ts`

| Severity | Location | Description | Suggested Fix |
|----------|----------|-------------|---------------|
| [CRITICAL] ✅ | progress.ts:80-87 | **Mass assignment in PUT /progress/body-log/:date.** `...req.body` spread into Firestore `set()` with `merge: true`. Attacker can inject any field name/value. | Add `validateBody()` with explicit schema: `{ weight, bodyFat, notes, photos }` etc. |
| [CRITICAL] ✅ | progress.ts:280-287 | **Mass assignment in PUT /progress/readiness/:date.** Same pattern — `...req.body` with no validation. | Add `validateBody()` with readiness-specific fields: `{ sleep, stress, energy, soreness, mood }`. |
| [CRITICAL] ✅ | progress.ts:151-162 | **Storage path traversal in body-log photo confirm.** Client supplies `storagePath` with no prefix validation. Can link any file in bucket. | Validate `storagePath` starts with `body_log/${auth.userId}/${req.params.date}/`. |
| [HIGH] ✅ | progress.ts:50-58 | **`req.params.date` used as Firestore doc ID without validation.** Any string is accepted — could be empty, very long, or contain path separators. | Validate `req.params.date` matches `YYYY-MM-DD` format: `/^\d{4}-\d{2}-\d{2}$/`. |
| [HIGH] ✅ | progress.ts:229 | **GET /progress/readiness date params not validated.** `startDate`/`endDate` from query string used in Firestore range query without format validation. | Validate ISO date format. |
| [MEDIUM] ✅ | progress.ts:113-143 | **Photo upload-url rate limit is 200 RPM.** Progress photo upload should be tighter. | Reduce to 20 RPM. |

### `routes/creator.ts`

| Severity | Location | Description | Suggested Fix |
|----------|----------|-------------|---------------|
| [CRITICAL] ✅ | creator.ts:144-147 | **Mass assignment in PATCH /creator/programs/:programId.** `...req.body` spread — attacker can overwrite `creatorId` to hijack program ownership, set `status` to bypass approval, etc. | Allowlist fields: `{ title, description, deliveryType, weekly, price, access_duration, discipline, image_url }`. |
| [CRITICAL] ✅ | creator.ts:377-380 | **Mass assignment in PATCH /creator/nutrition/meals/:mealId.** `...req.body` spread. | Allowlist meal fields. |
| [CRITICAL] ✅ | creator.ts:481-484 | **Mass assignment in PATCH /creator/nutrition/plans/:planId.** Same pattern. | Allowlist plan fields. |
| [CRITICAL] ✅ | creator.ts:793 | **Mass assignment in PATCH /creator/plans/:planId.** `...req.body` spread can overwrite `creatorId`. | Allowlist fields. |
| [CRITICAL] ✅ | creator.ts:882 | **Mass assignment in PATCH /creator/plans/:planId/modules/:moduleId.** | Allowlist: `{ title, order }`. |
| [CRITICAL] ✅ | creator.ts:997 | **Mass assignment in PATCH session.** | Allowlist: `{ title, order, isRestDay }`. |
| [CRITICAL] ✅ | creator.ts:1079 | **Mass assignment in PATCH exercise.** | Allowlist exercise fields. |
| [CRITICAL] ✅ | creator.ts:1145 | **Mass assignment in PATCH set.** | Allowlist set fields. |
| [HIGH] ✅ | creator.ts:1058 | **POST exercise — `...req.body` with no validateBody.** Creates exercise with arbitrary data. | Add `validateBody()` with exercise schema. |
| [HIGH] ✅ | creator.ts:1123 | **POST set — `...req.body` with no validateBody.** | Add `validateBody()` with set schema. |
| [HIGH] ✅ | creator.ts:120-128 | **POST /creator/programs spreads `...body` after partial validation.** `validateBody` checks `title` and `deliveryType` exist, but the spread includes ALL other req.body fields. | Only destructure validated fields: `{ title, deliveryType }`. |
| [HIGH] ✅ | creator.ts:347-355 | **POST /creator/nutrition/meals — `...req.body` with no validation.** | Add `validateBody()`. |
| [HIGH] ✅ | creator.ts:430-441 | **POST /creator/nutrition/plans — `...req.body` after only checking for existence.** | Only spread validated fields. |
| [HIGH] ✅ | creator.ts:1235, 1278, 1310, 1326, 1397 | **Library session/exercise/set PATCH/POST endpoints all spread `...req.body`.** Five more mass-assignment instances. | Allowlist fields in each. |
| [HIGH] ✅ | creator.ts:262 | **Program image confirm — `storagePath` from client not validated.** Can point to any file. | Validate starts with `course_images/${req.params.programId}/`. |
| [MEDIUM] ✅ | creator.ts:1417-1511 | **Library session propagation is unbounded.** Reads ALL plans for the creator, ALL modules in each plan, ALL sessions in each module. No guard against extremely large plan libraries. | Add max plan count guard (e.g., 100 plans). Log warning if exceeded. |
| [MEDIUM] ✅ | creator.ts:1513-1621 | **Library module propagation is similarly unbounded.** | Same mitigation. |
| [MEDIUM] ✅ | creator.ts:98-107 | **GET /creator/programs has no pagination.** Returns all programs. | Add `.limit()` and pagination. |
| [LOW] ✅ | creator.ts:158-161 | **PATCH /creator/programs/:programId/status accepts any string.** | Validate `status` against allowlist: `["draft", "active", "archived"]`. |
| [LOW] ✅ | creator.ts:702-707 | **POST /creator/plans spreads `...body` after validateBody.** `validateBody` only checks `title`, but spread includes extra fields. | Only use `{ title: body.title }`. |

### `routes/apiKeys.ts`

| Severity | Location | Description | Suggested Fix |
|----------|----------|-------------|---------------|
| [MEDIUM] ✅ | apiKeys.ts:50-53 | **API key name has no length limit.** `name` is validated as "string" but could be arbitrarily long. | Add max length check: `body.name.length > 100`. |
| [MEDIUM] ✅ | apiKeys.ts:56 | **Scope array has no max length.** Could send thousands of scope entries. | Cap at 10 entries. |
| [LOW] ✅ | apiKeys.ts:76 | **`useCase` extracted from `req.body` directly, bypassing validateBody.** Line 76 reads `req.body.useCase` outside the validated schema. | Include `useCase: "optional_string"` in the schema. |

### `routes/events.ts`

| Severity | Location | Description | Suggested Fix |
|----------|----------|-------------|---------------|
| [CRITICAL] ✅ | events.ts:67-136 | **POST /events/:eventId/register — NO auth, NO rate limiting, NO input validation.** `...req.body` spread directly into Firestore. Any anonymous user can: (1) flood registrations, (2) write arbitrary data into registration docs, (3) DDoS the capacity check. This is the most dangerous endpoint in the API. | Add rate limiting by IP (e.g., 10 RPM). Add `validateBody()` with explicit registration fields (email, displayName, fieldValues). Never spread `...req.body`. |
| [CRITICAL] ✅ | events.ts:100-103 | **Waitlist entry also spreads `...req.body` with no validation.** Same mass-assignment issue. | Validate and allowlist fields. |
| [HIGH] ✅ | events.ts:32-64 | **GET /events/:eventId — no rate limiting.** Public endpoint with no protection. Could be scraped or DDoS'd. | Add IP-based rate limiting (60 RPM). |
| [HIGH] ✅ | events.ts:193-199 | **POST /creator/events spreads `...body` beyond validated fields.** `validateBody` checks only `title`, but `...body` includes everything from `req.body`. Attacker can inject `creatorId` to impersonate another creator. | Only use `{ title: body.title }`, add other validated fields explicitly. |
| [HIGH] ✅ | events.ts:227-229 | **PATCH /creator/events/:eventId — `...req.body` spread.** Can overwrite `creatorId`, `status`, `created_at`. | Allowlist editable fields: `{ title, description, date, location, maxRegistrations, fields, capacity }`. |

### `routes/payments.ts`

| Severity | Location | Description | Suggested Fix |
|----------|----------|-------------|---------------|
| [HIGH] ✅ | payments.ts:263-329 | **Webhook signature validation returns 403 JSON but doesn't `return` early in all branches.** While the `if (!signatureIsValid)` block does return, the complexity of the dual signature validation (new + legacy) makes it fragile — a future refactor could accidentally skip validation. | Consider extracting signature validation into a dedicated middleware function for clarity. |
| [HIGH] ✅ | payments.ts:440-461 | **`paymentData` typed as `any`.** The MercadoPago response is cast to `any` and accessed without null checks throughout. If MP changes their API response shape, fields could be `undefined` and written to Firestore. | Define a strict interface for payment data; validate critical fields exist before use. |
| [MEDIUM] ✅ | payments.ts:697 | **Subscription cancel survey has no size limit.** `survey.answers` is written to Firestore with no validation — could be an arbitrarily large object. | Validate `survey.answers` is an array with max 20 entries, each max 500 chars. |
| [MEDIUM] ✅ | payments.ts:52-57 | **`parseExternalReference` leaks internal format in error message.** `throw new Error(\`Invalid external_reference: ${reference}\`)` — if this propagates to the client, it reveals the reference format. | Use generic error message. The existing code catches this, but defense-in-depth. |
| [LOW] ✅ | payments.ts:387 | **Subscription preapproval error silently swallowed.** `catch { /* log and continue */ }` — should at least log. | Add `functions.logger.error()`. |

### `routes/analytics.ts`

| Severity | Location | Description | Suggested Fix |
|----------|----------|-------------|---------------|
| [MEDIUM] ✅ | analytics.ts:15-17 | **No date format validation.** `startDate`/`endDate` from query string used in Firestore range queries without ISO date validation. | Validate `YYYY-MM-DD` format. |
| [MEDIUM] ✅ | analytics.ts:27-28 | **Date range validation uses `new Date()` which is lenient.** `new Date("not-a-date")` returns `Invalid Date`, and arithmetic with it produces `NaN`, bypassing the 12-week limit check. | Check `isNaN(start.getTime())` and reject invalid dates. |
| [LOW] ✅ | analytics.ts:65 | **Week key calculation could be inaccurate.** ISO week number calculation uses a simplified formula that may produce wrong week numbers at year boundaries. | Use a proper ISO week calculation or accept the minor inaccuracy. |

### `routes/appResources.ts`

| Severity | Location | Description | Suggested Fix |
|----------|----------|-------------|---------------|
| [HIGH] ✅ | appResources.ts:12 | **No rate limiting on public endpoint.** `/app-resources` has no authentication and no rate limiting. Can be hit unlimited times. | Add IP-based rate limiting (60 RPM) or rely on CDN caching. |
| [LOW] ✅ | appResources.ts:8-9 | **In-memory cache not bounded.** If `app_resources` grows large, the cached data stays in memory permanently. | Add max cache size check. |

### `routes/bookings.ts`

| Severity | Location | Description | Suggested Fix |
|----------|----------|-------------|---------------|
| [HIGH] ✅ | bookings.ts:334-415 | **Booking creation has race condition.** `POST /bookings` reads availability doc, checks `!slot.booked`, then updates. Two concurrent requests for the same slot can both pass the check and create duplicate bookings. | Use a Firestore transaction to atomically check and mark the slot as booked. |
| [HIGH] ✅ | bookings.ts:64-67 | **Availability slot generation has no max slot count guard.** If `durationMinutes` is 1 and time range is 24 hours, it generates 1440 slots in memory. If `durationMinutes` is 0, infinite loop (guarded by `< 5` check, but 1-4 would still generate many). | Enforce minimum `durationMinutes >= 15`, cap total slots per day at 100. |
| [MEDIUM] ✅ | bookings.ts:64 | **Time parsing doesn't validate HH:MM format.** `body.startTime.split(":").map(Number)` — if format is invalid, produces `NaN` values, which could lead to unexpected behavior. | Validate `HH:MM` format with regex before parsing. |
| [MEDIUM] ✅ | bookings.ts:454-496 | **Booking cancellation doesn't check booking status.** A cancelled booking can be cancelled again, and the slot freed multiple times. | Check `data.status === "scheduled"` before cancelling. |
| [LOW] ✅ | bookings.ts:93 | **Slot times labeled "UTC" but computed from local time inputs.** `startUtc`/`endUtc` are constructed from `body.date` + local time, but no timezone conversion occurs. Misleading field names. | Either perform actual UTC conversion using the `timezone` field, or rename to `startLocal`/`endLocal`. |

---

## Cross-Cutting Findings

### `middleware/rateLimit.ts`

| Severity | Location | Description | Suggested Fix |
|----------|----------|-------------|---------------|
| [HIGH] ✅ | rateLimit.ts (architecture) | **No rate limiting by IP for unauthenticated endpoints.** `checkRateLimit` requires an ID (userId or keyId). Public endpoints (`GET /events/:id`, `POST /events/:id/register`, `GET /app-resources`) have no way to rate-limit. | Add an `checkIpRateLimit(req, limitRpm)` variant that uses `req.ip` or `x-forwarded-for`. |
| [MEDIUM] ✅ | rateLimit.ts:22-23 | **Rate limit window docs have `expires_at` but no TTL cleanup.** Documents accumulate in `rate_limit_windows` and `rate_limit_first_party` collections forever. | Add a Firestore TTL policy on `expires_at`, or a scheduled function to clean up expired docs. |

### `middleware/validate.ts`

| Severity | Location | Description | Suggested Fix |
|----------|----------|-------------|---------------|
| [HIGH] ✅ | validate.ts (architecture) | **No string length limits, no number bounds, no array max-length.** `validateBody` only checks type existence — a "string" field passes even if 10MB long, a "number" passes even if `Infinity` or `NaN`, an "array" passes even if 100K items. | Extend schema format to support constraints: `"string:200"` for max length, `"number:0:1000"` for bounds, `"array:100"` for max items. Or add a second validation step. |
| [MEDIUM] ✅ | validate.ts:29 | **Body cast to `Record<string, unknown>` allows `__proto__` keys.** While Firestore SDK likely strips these, the pattern is risky if any intermediate code accesses spread objects. | Filter out `__proto__`, `constructor`, `prototype` keys from body before validation. |

### `middleware/auth.ts` — `enforceScope`

| Severity | Location | Description | Suggested Fix |
|----------|----------|-------------|---------------|
| [HIGH] ✅ | auth.ts:65-82 | **`enforceScope` function exists but is never called.** API key scope enforcement is defined but unused — an API key with `read` scope can perform POST/PATCH/DELETE operations on any endpoint. | Call `enforceScope(req)` in the global middleware chain in `app.ts`, after auth validation. |

---

## Summary by Severity

### CRITICAL (8 findings — fix immediately)

1. **Mass assignment across ~25 endpoints** — `...req.body` spread into Firestore without field allowlisting. Attackers can overwrite ownership fields (`creatorId`, `userId`), inject arbitrary data, or write unbounded payloads.
   - Files: `nutrition.ts`, `progress.ts`, `creator.ts`, `events.ts`
2. **Storage path traversal in 4 confirm endpoints** — Client-supplied `storagePath` accepted without prefix validation.
   - Files: `profile.ts:121`, `progress.ts:151`, `creator.ts:249`, `events.ts:352`
3. **Public event registration with zero validation** — `POST /events/:eventId/register` has no auth, no rate limiting, no input validation, and spreads `...req.body`.
   - File: `events.ts:67-136`

### HIGH (14 findings — fix soon)

1. No rate limiting on public endpoints (`GET /events/:id`, `GET /app-resources`)
2. No IP-based rate limiting infrastructure for unauthenticated requests
3. `enforceScope` never called — API key scope not enforced
4. `validateBody` has no string length / number bounds / array length limits
5. Missing input validation on many PATCH/POST endpoints
6. Date format not validated before Firestore queries (5 files)
7. No pagination on `GET /nutrition/saved-foods`
8. `GET /workout/courses/:courseId` lacks access control
9. Booking creation race condition (double-booking possible)
10. Availability slot generation has no max count guard
11. Unbounded `exercises` array in workout completion
12. Unbounded sequential Firestore reads in `GET /workout/daily`

### MEDIUM (12 findings)

1. Rate limit window docs never cleaned up
2. No prototype pollution guard in `validateBody`
3. `cards` object in creator profile has no size/depth validation
4. API key `name` has no length limit
5. Scope array has no max length
6. Subscription cancel survey has no size limit
7. Propagation endpoints are unbounded
8. Missing pagination on several GET-all endpoints
9. Invalid dates bypass range validation (NaN arithmetic)
10. Time format not validated in bookings
11. Booking re-cancellation allowed
12. Upload URL rate limits too generous (200 RPM)

### LOW (6 findings)

1. `useCase` bypasses `validateBody` in API keys
2. Week key calculation may be inaccurate at year boundaries
3. Checkpoint deletion error silently swallowed
4. Subscription preapproval error silently swallowed
5. In-memory app resources cache unbounded
6. Slot UTC labels misleading (no actual timezone conversion)

---

## Recommended Fix Priority

**Sprint 1 (immediate — blocks production safety):**
1. Add field allowlisting to all `...req.body` spread endpoints (or create a `pickFields()` utility)
2. Validate `storagePath` prefix in all confirm endpoints
3. Add rate limiting + validation to `POST /events/:eventId/register`
4. Call `enforceScope` in middleware chain

**Sprint 2 (next iteration):**
1. Add IP-based rate limiting for public endpoints
2. Extend `validateBody` with length/bounds constraints
3. Add date format validation everywhere
4. Fix booking race condition with transaction
5. Add access control to `GET /workout/courses/:courseId`
6. Add pagination to unbounded GET endpoints

**Sprint 3 (hardening):**
1. Add TTL cleanup for rate limit docs
2. Add prototype pollution guard
3. Tighten upload URL rate limits
4. Add guards to propagation endpoints
5. Validate all remaining unvalidated inputs
