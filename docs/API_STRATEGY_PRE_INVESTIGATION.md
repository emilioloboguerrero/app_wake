# API Strategy — Decision Document

This document records every architectural decision and investigation finding made before
Phase 3 implementation begins. All decisions are locked unless explicitly revisited.
No Phase 3 code is written until the Part 2 investigation is complete.

---

## Part 1 — Architectural Decisions

### 1.1 API Style

**DECISION: REST**

- Third-party developer integration (wearables, AI agents, external tools) is a confirmed
  future requirement. REST has the best interop story — clear URLs, standard HTTP,
  no query language for integrators to learn.
- GraphQL is eliminated. Wake's clients are known and finite; the schema + resolver
  overhead is not justified. Overfetching is solved through disciplined endpoint design
  (lean response shapes per endpoint), not a new query layer.
- tRPC is eliminated. The PWA is JavaScript — no TypeScript, no tRPC.

---

### 1.2 Endpoint Granularity Strategy

**DECISION: Pure granular endpoints. App is just another client.**

The PWA and creator dashboard call the API exactly like any third-party would.
No special internal paths, no Firestore shortcuts, no screen-shaped compound endpoints.

- Sparse fieldsets (`?fields=id,name`) are not built from day one. Lean response shapes
  per endpoint solve overfetching without the parsing complexity. Add sparse fieldsets
  later if a real third-party integration demands it.
- Compound/aggregate endpoints (e.g., `GET /dashboard`) are not built. They couple the
  API to UI layout, are useless to third parties, and violate the "app as client" principle.
- If multi-request latency becomes a measured problem on a specific screen, address it
  then — not preemptively.

---

### 1.3 Real-Time Data Strategy

**DECISION: All Firestore `onSnapshot` listeners are removed. No hybrid model.**

Investigation of current usage found that no Wake feature actually requires real-time
push updates:
- Workout execution: the user is the only writer — local state is sufficient.
- Nutrition diary: user edits their own data — no external writer.
- Creator client list: a 60-second poll is not needed either — React Query background
  refetch on window focus is sufficient.

All `onSnapshot` usage is replaced by React Query with appropriate `staleTime` values
and background refetch on window focus. No screen retains a Firestore listener after
migration. No hybrid (some API + some Firestore direct) is accepted — this pattern
would never get cleaned up.

---

### 1.4 Firebase Storage Strategy

**DECISION: Signed upload URL pattern for all file operations.**

Flow:
1. Client calls API: `POST /{resource}/upload-url`
2. API generates a short-lived signed URL via Firebase Admin SDK
3. Client uploads directly to Firebase Storage using that URL (file never passes
   through a Cloud Function)
4. Client calls API: `POST /{resource}/upload-url/confirm` with the storage path
5. API updates Firestore with the new URL

This applies to: profile pictures, progress photos, and future video content.

**File size optimization is required from day one:**
- Images (profile pictures, progress photos): compress and resize client-side before
  upload. Target: profile pictures ≤ 200KB, progress photos ≤ 500KB.
- The API's upload-url endpoint specifies allowed content types and max sizes.
  Uploads that exceed limits are rejected at the Storage security rules level.
- Video (deferred to a later phase): signed URL is essential — files will be hundreds
  of MB and must never pass through a Cloud Function.

Firebase Storage security rules remain the access control layer. The API controls
who gets a signed URL and for what path.

---

### 1.5 Offline Support Strategy

**DECISION: Replace mobile-era cache with React Query. No legacy offline system preserved.**

The current offline stack (`hybridDataService`, `courseDownloadService`, AsyncStorage
layers) was designed for a native mobile app. It is not working well for the PWA and
will not be preserved.

Replacement strategy:
- React Query replaces `hybridDataService` entirely. React Query is cache-first,
  stale-while-revalidate, and supports background refresh — it is the correct tool.
- For programs that need to survive app close/reopen: React Query with IndexedDB
  persistence (`@tanstack/query-persist-client-core`) replaces `courseDownloadService`
  for web. No explicit download step.
- If a native mobile rebuild happens in the future, revisit offline strategy then.

**Mid-workout API failure behavior:**
- Show a clear error to the user immediately.
- Queue the pending write in IndexedDB via the Service Worker Background Sync API.
- Automatically retry when connectivity restores — no user action required.
- Session data is never lost.

---

### 1.6 Migration Strategy

**DECISION: Domain-by-domain incremental migration. No hard deadline.**

Recommended migration order (validates the stack incrementally from simple to complex):

1. **Auth + infrastructure** — Firebase ID token validation, API key system, error
   contract, rate limiting. No domain logic yet — just proves the stack works end to end.
2. **Profile domain** — Simplest read/write. Validates the full auth → API → Firestore
   → response cycle.
3. **Nutrition domain** — Self-contained. FatSecret proxy already lives in Cloud
   Functions, migration is straightforward. No real-time requirements.
4. **Progress / Lab domain** — Body log, readiness, progress photos. Simple operations.
5. **Workout domain** — Most complex. Atomic session completion, exercise history,
   PRs, streak. Tackle after confidence is built from simpler domains.
6. **Creator domain** — Parallel track to PWA migration. Program management, client
   assignment, library, nutrition plans, events.

No operation stays Firestore-direct permanently. The end state is: all data operations
go through the API. No exceptions.

---

### 1.7 API Authentication Strategy

**DECISION: Firebase ID token for first-party. Scoped API keys for third-party.
Self-service key issuance in creator dashboard. Security is non-negotiable from day one.**

**First-party (PWA + creator dashboard):**
- User authenticates via Firebase Auth (existing flow, unchanged).
- App calls `user.getIdToken()` and sends as `Authorization: Bearer <token>`.
- API validates with Firebase Admin SDK `verifyIdToken()`.
- Firebase SDK auto-refreshes the token every hour — no additional mechanism needed.
- First-party calls are not rate-limited initially.

**Third-party (wearables, AI agents, external tools):**
- API keys generated and managed via a self-service page in the creator dashboard.
  No manual issuance. No developer portal needed yet.
- Key format: `wk_live_<64 random chars>` (production), `wk_test_<64 random chars>` (test).
- Sent as `Authorization: Bearer wk_live_...` — same header as first-party; server
  detects type by prefix.

**Key scopes:**
- `read` — read any data the key owner can access
- `write` — write operations
- `creator` — creator-specific endpoints
- `admin` — internal use only

**Key storage — `api_keys` Firestore collection:**
```
api_keys/{keyId}:
  key_prefix:      string    // first 8 chars, shown in UI
  key_hash:        string    // SHA-256 of the actual key — NEVER store plaintext
  owner_id:        string
  scopes:          string[]
  name:            string    // human label, e.g. "My Garmin Integration"
  created_at:      timestamp
  last_used_at:    timestamp
  revoked:         boolean
  revoked_at:      timestamp | null
  rate_limit_rpm:  number
```
The actual key is shown once at creation time and never again. If lost, generate a new one.

**Rate limiting — Firestore fixed-window counter:**
- Per API key, per minute window.
- Collection: `rate_limit_windows/{keyId}_{windowMinute}` with `count` and TTL.
- Approximate (Cloud Functions are stateless across instances) but sufficient for Phase 3.
- Cloud Armor added when real traffic scale demands it.

---

### 1.8 Versioning Strategy

**DECISION: URL versioning (`/api/v1/`). 12-month support window. Automated deprecation notices.**

- URL versioning: `/api/v1/`, `/api/v2/` — explicit, easy to reason about, easy
  for third-party developers.
- No third parties will integrate before Wake's own apps finish migrating.
- Previous API versions supported for a minimum of 12 months after a new version ships.
- Breaking changes announced with at least 6 months notice.
- Deprecation communication: simple for now (direct contact). Automated changelog
  and email notification added when there are real third-party integrators.

---

### 1.9 Service Layer Unification — PWA

**DECISION: Fix direct Firestore screens before API migration begins.**

Screens that import Firestore SDK directly, bypassing the service layer, must be
fixed before migration starts:
- ✅ `EventCheckinScreen.web.jsx`
- ✅ `EventRegistrationsScreen.web.jsx`
- ✅ `LabScreen.web.js`
- ✅ `LabScreen.js`
- ✅ `OnboardingScreen.js`

**DECISION: Create a new `eventService.js` in the PWA that calls the API directly.**

Do not copy the creator-dashboard's `eventService.js`. The PWA needs only consumer-side
event operations (check-in, registration viewing). Both services will become thin HTTP
wrappers over the same API endpoints. Scope them separately from day one.

✅ `apps/pwa/src/services/eventService.js` created.

---

### 1.10 React Query in PWA

**DECISION: Migrate PWA screens to React Query before API migration, not simultaneously.**

React Query adoption is a prerequisite, not a parallel track. Migrating state management
and API calls at the same time on the same screen introduces too much risk.

Order:
1. Add React Query hooks to each screen (still calling services which call Firestore).
2. Then swap the service internals to call the API instead of Firestore.

**PWA screens migrated to React Query (Step 1 complete):**
- ✅ `CourseDetailScreen.web.js` — `staleTime: 30min`
- ✅ `CourseStructureScreen.web.js` — `staleTime: 2min`
- ✅ `DailyWorkoutScreen.web.jsx` — course + prefetch dates
- ✅ `EventsManagementScreen.web.jsx` — `useQuery` + `useMutation` with optimistic update
- ✅ `LabScreen.web.js` — `useQuery` + `cacheConfig.analytics`
- ✅ `EventCheckinScreen.web.jsx` — `useQuery` for event fetch + access status derived
- ✅ `EventRegistrationsScreen.web.jsx` — `useQuery` + `useMutation` with optimistic checkin/delete
- ✅ `PRsScreen.js` — `useQuery` fetching PRs + exercise keys in parallel, `cacheConfig.analytics`
- ✅ `SubscriptionsScreen.js` — `useQuery` via new `firestoreService.getUserSubscriptions()` (replaces `onSnapshot`)
- ✅ `SessionsScreen.js` — `useInfiniteQuery` with cursor pagination, replaces custom ref/timer system
- ✅ `AllPurchasedCoursesScreen.js` — `useQuery` via `purchaseService.getUserPurchasedCourses()`
- ✅ `UpcomingCallDetailScreen.js` — `useQuery` for booking + creator profile + course data
- ✅ `ProfileScreen.js` — `useQuery` via `hybridDataService.loadUserProfile()`, sync useEffect populates form state
- ✅ `ProgramLibraryScreen.js` — `useQuery` for user role + courses, sync useEffect populates UI state
- ✅ `CreatorProfileScreen.js` — `useQuery` parallelizes creator doc + programs + image, all state derived

**`staleTime` configuration — defined per data domain in a shared `queryConfig.js`:**

| Data domain | staleTime | Reasoning |
|---|---|---|
| Today's workout | 0 | Always fetch fresh — coach may have updated program |
| User profile | 5 minutes | Changes rarely |
| Program structure | 30 minutes | Rarely changes mid-week |
| Nutrition diary | 30 seconds | User actively edits throughout the day |
| Exercise history | 15 minutes | Append-only, historical |
| Session history | 10 minutes | Append-only |
| Client list (creator) | 2 minutes | New clients enroll occasionally |
| Body log | 5 minutes | One entry per day |

React Query replaces `hybridDataService` entirely — not coexistence. Once all screens
are migrated, `hybridDataService` is deleted.

---

### 1.11 Creator Dashboard — Completing React Query Migration

**DECISION: Clean up remaining Firestore-direct screens before API work begins.**

Screens confirmed as still using Firestore directly (require cleanup):
- ✅ `EventsScreen.jsx`
- ✅ `EventEditorScreen.jsx`
- ✅ `EventResultsScreen.jsx`
- ✅ `LibrarySessionDetailScreen.jsx`
- ✅ `ProfileScreen.jsx`

`EventAnalyticsScreen` does not exist — it was referenced in planning docs but was
never built and has no route or import anywhere. Not relevant.

---

### 1.12 Error Handling Contract

**DECISION: Standard HTTP status codes. English error messages. Field-level validation.**

**Standard error shape:**
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid value for field 'email'",
    "field": "email"
  }
}
```

**Error codes (standard + domain-specific):**
- `UNAUTHENTICATED` — missing or invalid auth token / API key
- `FORBIDDEN` — authenticated but not authorized for this resource
- `NOT_FOUND` — resource does not exist
- `VALIDATION_ERROR` — request body or params failed validation
- `CONFLICT` — Firestore transaction conflict (retryable)
- `RATE_LIMITED` — API key rate limit exceeded
- `SERVICE_UNAVAILABLE` — Firestore or external dependency temporarily down
- `INTERNAL_ERROR` — unexpected server error
- Domain-specific codes added per endpoint as needed (e.g., `TRIAL_ALREADY_CONSUMED`)

**HTTP status code mapping:**
- `400` — VALIDATION_ERROR (not retryable)
- `401` — UNAUTHENTICATED (not retryable)
- `403` — FORBIDDEN (not retryable)
- `404` — NOT_FOUND (not retryable)
- `409` — CONFLICT (retryable with backoff)
- `429` — RATE_LIMITED (retryable after `Retry-After` header duration)
- `500` — INTERNAL_ERROR (retryable)
- `503` — SERVICE_UNAVAILABLE (retryable)

Clients retry on 5xx and 429. Never retry on 4xx.

**Note:** The existing CLAUDE.md rule (500 = retryable, 200 = non-retryable) applies
only to MercadoPago webhook responses and is unrelated to this contract.

---

### 1.13 Pagination Strategy

**DECISION: Cursor-based pagination with opaque page tokens.**

Firestore cannot efficiently skip N documents (offset pagination costs money and is
slow). Cursor-based pagination using `startAfter()` is Firestore-native, stable under
concurrent writes, and the correct choice.

**Response shape for paginated endpoints:**
```json
{
  "data": [...],
  "nextPageToken": "eyJpZCI6ImFiYzEyMyJ9",
  "hasMore": true
}
```
The cursor is base64-encoded and opaque to the caller.

**Default page sizes:**
- Diary entries: 30 (roughly one month)
- Session history: 20
- Exercise history: 50
- Client list: 50

**Needs pagination from day one:**
- Session history (years of data)
- Exercise history (hundreds of sets per exercise)
- Nutrition diary (years of entries)
- Client list (creators with 50+ clients)

**Does not need pagination initially (return full list):**
- Program list (creators have < 20 programs)
- Nutrition plan list (small)
- Events list (small)
- Body log (fetch by date range, not cursor)

---

### 1.14 App Integrity — Firebase App Check

**DECISION: Firebase App Check enabled on all first-party apps from day one.**

The `X-Wake-Client` header identifies which app makes a request but is not
cryptographically verified — any caller can send `X-Wake-Client: pwa/1.0`.
App Check is the mechanism that proves a request originates from a genuine registered
Wake app (PWA or creator dashboard), not an external script or stolen token.

**How it works:**
- Firebase App Check is initialized in both first-party apps (PWA, creator dashboard).
- On web, it uses the **reCAPTCHA Enterprise** attestation provider.
- The App Check SDK automatically obtains a short-lived attestation token.
- The client sends this token in the `X-Firebase-AppCheck` header on every request.
- The server validates it with `admin.appCheck().verifyToken(token)` inside `validateAuth()`.
- Invalid or missing tokens on protected endpoints are rejected with `401 APP_CHECK_FAILED`.

**Enforcement policy:**
- **PWA + creator dashboard (Firebase ID token path):** App Check token required on all
  non-public endpoints. Missing or invalid token → `401 APP_CHECK_FAILED`.
- **Third-party API key callers:** App Check is NOT required. Third-party integrations
  are not registered Wake apps — the API key is their proof of identity.
- **Public endpoints** (`GET /health`, `GET /events/{id}`, `POST /events/{id}/register`):
  App Check not required — intentionally open.

**Important:** App Check is a probabilistic signal, not a guarantee. A determined
attacker could bypass reCAPTCHA Enterprise given sufficient effort. It is a strong
deterrent, not an impenetrable barrier. `validateAuth()` remains the primary access
control — App Check is an additional layer, not a replacement.

---

### 1.15 First-Party Rate Limiting

**DECISION: First-party users (Firebase ID token) are rate-limited per user, per minute.**

§1.7 deferred first-party rate limiting ("not rate-limited initially"). This is
insufficient for v1 — a compromised token or a runaway client bug could hammer
the API without any limit.

**Limits:**
- **First-party (Firebase ID token):** 200 requests per minute per `userId`
- **Third-party (API key):** 60 requests per minute, 1,000 per day per key (unchanged from §1.7)

200 req/min is generous enough that no legitimate user action ever triggers it
(even rapid workout logging at maximum speed is ~10 req/min). It only fires for
bugs or abuse.

**Implementation:**
- Firestore transaction counter at `rate_limit_first_party/{userId}_{windowMinute}`.
- Same mechanism as third-party rate limiting (`db.runTransaction()` — atomic read + write).
- Called inside `validateAuth()` after the Firebase ID token is verified.
- Returns `429 RATE_LIMITED` with `Retry-After: <seconds until next minute boundary>`.

**Why not IP-based:** Client IPs are not reliably available across Firebase Hosting +
Cloud Functions request paths. User-based limiting is more accurate and simpler.

---

## Part 2 — Investigation Items

**Status: PENDING. The full code audit below must be completed before Part 3
endpoint design is finalized.**

The following screens and services need to be inventoried in detail (data read,
data written, onSnapshot usage, direct Firestore usage, offline behavior, web/native
split). See original investigation task list for the full checklist.

### 2.1 PWA — Auth Flow Audit: ✅ COMPLETE
See PART2_INVESTIGATION_REPORT.txt section 2.1.

### 2.2 PWA — Navigation / Route Structure: ✅ COMPLETE
See PART2_INVESTIGATION_REPORT.txt section 2.2.

### 2.3 PWA — State Management + Write Operations Catalog: ✅ COMPLETE
See PART2_INVESTIGATION_REPORT.txt sections 2.3, 2.10.

### 2.4 PWA — Real-Time Listener Audit: ✅ COMPLETE
4 onSnapshot listeners found (1 PWA, 3 Creator Dashboard). All have proper cleanup.
See PART2_INVESTIGATION_REPORT.txt section 2.4.

### 2.5 PWA — Cache System Audit: ✅ COMPLETE
6 caching layers documented. See PART2_INVESTIGATION_REPORT.txt section 2.6.
Replacement plan confirmed:
- `hybridDataService` → React Query
- `courseDownloadService` → React Query + IndexedDB persistence (web)
- In-memory caches → React Query
- `sessionRecoveryService` → Background Sync + IndexedDB queue
- `videoCacheService` → deferred (video is Phase 4+)

### 2.6 Creator Dashboard — Screen Inventory: ✅ COMPLETE
36 screens audited. See PART2_INVESTIGATION_REPORT.txt supplement section S1.

### 2.7 Creator Dashboard — Service Inventory: ✅ COMPLETE
See PART2_INVESTIGATION_REPORT.txt section 2.5.

### 2.8 Creator Dashboard — React Query Usage Audit: ✅ COMPLETE
11 of ~36 screens use React Query. See PART2_INVESTIGATION_REPORT.txt supplement section S2.
Cache key bug found in ProductsScreen.jsx — fixed.

### 2.9 Creator Dashboard — Write Operations Catalog: ✅ COMPLETE
All writes per collection documented. See PART2_INVESTIGATION_REPORT.txt section 2.10.

### 2.10 Cloud Functions — Complete Catalog: ✅ COMPLETE
10 active functions (verifyToken removed). All documented.
See PART2_INVESTIGATION_REPORT.txt section 2.8.

### 2.11 Firestore Collections — Schema Audit: ✅ COMPLETE
~30 collections documented with fields, writers, readers, rules.
See PART2_INVESTIGATION_REPORT.txt section 2.10.
Undocumented collections added to CLAUDE.md: exerciseLastPerformance, saved_foods,
readiness, bodyLog, subscription_cancellation_feedback, creator_libraries.

### 2.12 Firebase Storage — Path Audit: ✅ COMPLETE
All storage paths documented. See PART2_INVESTIGATION_REPORT.txt section 2.11.

### 2.13 Firestore Security Rules Audit: ✅ COMPLETE
Critical gaps identified and fixed. See PART2_INVESTIGATION_REPORT.txt section 2.12.
Catch-all rule changed to `if false` after adding explicit rules for all collections.

### 2.14 Duplicate Logic Audit: ✅ COMPLETE
See PART2_INVESTIGATION_REPORT.txt supplement section S3.
Key findings:
- nutritionFirestoreService.js diary path bug in creator-dashboard (dead code, removed)
- getAllExerciseKeysFromExerciseHistory defined twice in exerciseHistoryService.js (fixed)
- ProductsScreen cache key mismatch (fixed)

### 2.15 Navigation Audit — PWA: ✅ COMPLETE
See PART2_INVESTIGATION_REPORT.txt sections 2.2 and 2.15.

### 2.16 Auth Flow Audit: ✅ COMPLETE
See PART2_INVESTIGATION_REPORT.txt section 2.1.

### 2.17 Notification System Audit: ✅ COMPLETE
notificationService.js is a full stub — FCM not active. Not a blocker for Phase 3.
See PART2_INVESTIGATION_REPORT.txt supplement section S4.

### 2.18 Analytics and Monitoring Audit: ✅ COMPLETE
- `monitoringService.js` active in 3 places. Preserved and cleaned up during migration.
- `consolidatedDataService.js` active in 3 screens. Migration target.
- Analytics stays client-side. No server-side analytics firing.
See PART2_INVESTIGATION_REPORT.txt section 2.17.

---

## Part 3 — API Endpoint Design

**Status: DOMAINS DEFINED. Full endpoint design pending Part 2 investigation.**

### 3.1 Endpoint Domains

✅ Full endpoint design complete. See `docs/API_ENDPOINTS.md`.

Domains covered (in migration order):
1. Auth + Infrastructure (API key CRUD)
2. Profile (user + creator public profile, picture upload)
3. Nutrition (diary, FatSecret proxy, saved foods, assignment, creator meal/plan library, client assignment)
4. Progress / Lab (body log, progress photos, readiness)
5. Workout (daily resolution, session completion, history, exercise history, PRs)
6. Creator (programs, plans full hierarchy, library, clients, client scheduling, events, availability, bookings)
7. Events public (registration)
8. Bookings client-side
9. Payments (migrated from Cloud Functions)

### 3.2 Atomic Operations — Decisions Made

**Session completion** (writes to `sessionHistory`, `exerciseHistory`,
`oneRepMaxHistory`, `activityStreak`):
- **Decision: Firestore batch write.** All 4 writes committed atomically. If the
  batch fails, the client queues locally via Background Sync and retries automatically.

**Program assignment** (writes to `one_on_one_clients` + `users/{userId}.courses`):
- **Decision: Firestore batch write.** Both writes or neither.

**Event check-in + confirmation email:**
- **Decision: Check-in write is atomic. Email is a best-effort side effect.**
  If the email fails, the check-in still registers. Email failure does not roll back
  a successful check-in.

### 3.3 Endpoints to Deprecate or Remove

- ✅ `verifyToken` Cloud Function: removed from `functions/src/index.ts`.
- ✅ `autoLogin.js` utility in creator-dashboard: deleted.
- ✅ `LoginScreen.jsx` auto-login dead code: removed.
- Any additional dead code identified during Part 2 investigation.

---

## Part 4 — Cost Model

**Status: PENDING. To be estimated after endpoint design is complete.**

---

## Part 5 — Unaddressed Strategy Items

### 5.1 MCP Server

**DECISION: Separate standalone Node.js service (not a Cloud Function).**
- Start as simple as possible — minimal read tools only.
- Build up gradually as real use cases emerge.
- Pre-built Spanish prompts: none to start.
- Full design deferred until API layer is stable.

### 5.2 Webhook System

**DECISION: Retry policy, secret generation, and subscription schema defined.**

- Webhook secrets are auto-generated on subscription creation (HMAC, subscriber does
  not provide their own).
- Retry policy: 5 attempts with exponential backoff.
  - Attempt 1: immediate
  - Attempt 2: 5 seconds
  - Attempt 3: 30 seconds
  - Attempt 4: 5 minutes
  - Attempt 5: 30 minutes
  - After 5 failures: mark as `failed`, store in `webhook_delivery_log`.
- Event list (which events emit webhooks): defined after Part 2 investigation completes.
- Full webhook subscription schema: pending.

### 5.3 Creator Revenue Share Infrastructure

**DECISION: Deferred. Not in scope for Phase 3.**

### 5.4 API Key Management System

**DECISION: Defined in section 1.7.**
- Stored in `api_keys` Firestore collection (schema in 1.7).
- Self-service issuance via creator dashboard. No manual key generation.
- No developer portal needed yet.
- Rate limiting via Firestore fixed-window counter (section 1.7).

### 5.5 OpenAPI Specification

**DECISION: Hand-written first, auto-generated after implementation.**
- The spec is written before implementation as part of the engineering spec.
  This forces all endpoint shapes, request/response schemas, and error codes to be
  defined before any code is written.
- Once implementation exists: `swagger-jsdoc` annotations match the hand-written spec,
  auto-generation takes over.
- Served publicly at `/api/docs` from day one.

### 5.6 WhatsApp Bot

**DECISION: Deferred. Out of scope.**

---

## Part 6 — Implementation Quality Findings

### 6.1 PWA

- No screens are known to be broken or partially implemented.
- `sessionRecoveryService` reliability in production: unknown — needs investigation
  during Part 2 audit.
- `consolidatedDataService.js`: active, used by 3 screens. Migration target.
- `monitoringService.js`: active, used by 3 files. Preserved and cleaned up.
- `videoCacheService.js`: status unknown — Part 2 investigation.
- Dead code and previous feature iterations: identified during Part 2 investigation.

### 6.2 Creator Dashboard

- `EventAnalyticsScreen`: does not exist. Not referenced anywhere. Not relevant.
- Which screens are in active use by real coaches: to be determined during Part 2.
- ✅ `autoLogin.js`: removed.

### 6.3 Cloud Functions

- No dead Cloud Functions. All 11 are active or correctly server-triggered.
- ✅ `verifyToken`: removed from `functions/src/index.ts`. `LoginScreen.jsx` dead code also removed.
- Shared logic duplication: to be identified during Part 2 audit.
- All secrets confirmed present in Firebase Secret Manager (per CLAUDE.md).

---

## Part 7 — Market Context Decisions

### 7.1 Wearable Priority

**DECISION: Deferred. Not a priority for Phase 3.**
No wearable integration is in scope. Revisit when a specific device and use case
are confirmed.

### 7.2 Latin American Market Constraints

- No specific network reliability concerns for Colombia that require changes to API design.
- No data residency requirements. Cloud Functions remain in `us-central1`.
- MercadoPago webhook infrastructure: reliable enough to use as source of truth for
  subscription state. No polling backup needed.

### 7.3 Language and Localization

- API error messages (`message` field): **English.**
- Response language: **fixed for now.** `Accept-Language` header support added later
  if multi-market expansion requires it.

---

## Execution Order

```
Step 1  ✅ Part 1 architectural decisions — COMPLETE
Step 1b ✅ Pre-investigation cleanup — COMPLETE
         - All PWA direct-Firestore screens fixed (1.9)
         - PWA eventService.js created
         - Creator dashboard Firestore-direct screens fixed (1.11 complete)
         - React Query adopted in 5 PWA screens (1.10 in progress)
         - verifyToken + autoLogin.js removed (3.3)
Step 2  ✅ Part 2 investigation — COMPLETE (see PART2_INVESTIGATION_REPORT.txt)
Step 3  ✅ Part 3 endpoint design — COMPLETE (see docs/API_ENDPOINTS.md)
Step 4  ✅ Part 4 cost model — COMPLETE (see docs/COST_MODEL.md)
Step 5  ✅ Part 5 strategy items — COMPLETE (where applicable; some deferred)
Step 6  ✅ Part 6 implementation quality — COMPLETE (preliminary; details in Part 2)
Step 7  ✅ Part 7 market decisions — COMPLETE
Step 8  ✅ Write Phase 3 engineering spec — COMPLETE (see docs/PHASE3_ENGINEERING_SPEC.md)
```

Only after Step 8 is complete should any Phase 3 code be written.
