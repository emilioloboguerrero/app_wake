# Wake — Pending & Partial Implementation Tracker

Single source of truth for everything that has been designed/specified but not yet implemented or only partially implemented. Created 2026-03-20 by consolidating all docs.

---

## 1. API Migration — Complete

The Phase 3 API infrastructure is complete (Express app, all routes, middleware, API clients, offline queue). **All seven domains are fully migrated.** Codebase audit (2026-03-20) confirmed zero direct Firestore SDK calls in PWA or creator dashboard services/screens/components (only `firebase/auth` and config imports remain, as expected). Zero `onSnapshot` listeners remain.

### PWA Screens

All screens migrated. No direct Firestore calls remain.

| Screen | Direct Calls | API Domain | Status |
|---|---|---|---|
| `UpcomingCallDetailScreen.js` | booking reads | Creator/Bookings | Done |

### Migration Domain Status

| # | Domain | Status |
|---|---|---|
| 1 | Auth | Done |
| 2 | Profile | Done |
| 3 | Nutrition | Done |
| 4 | Progress/Lab | Done |
| 5 | Workout | Done |
| 6 | Creator | Done |
| 7 | Payments | Done |

### Migration Procedure (per domain)

For each remaining domain, follow this sequence:
1. Deploy Cloud Function endpoint(s) to staging (`firebase use staging && firebase deploy --only functions`)
2. Run staging validation (see checklists below)
3. Rewrite service file internals: replace Firestore SDK calls with `apiClient` calls (keep same public interface)
4. Smoke test locally against staging
5. Deploy full stack to staging, validate
6. Deploy to production (`firebase use wolf-20b8b && firebase deploy`)
7. Verify in production

### Staging Validation Checklists

**Creator:**
- [ ] Client list: `GET /creator/clients`
- [ ] Client detail: session history, progress, activity
- [ ] Program list, create, edit, duplicate
- [ ] Library session: create, edit, delete
- [ ] Nutrition plan assignment
- [ ] Booking management
- [ ] Creator cannot access another creator's data (verify with two test accounts)

### Rollback

If a migration fails: `git revert <commit>` the service file, deploy hosting only. Cloud Function endpoints stay deployed (harmless). Debug root cause before retrying.

---

## 2. Creator Dashboard — Server-Side Filtering Needed

Acceptable at current scale. Need server-side endpoints when creators grow past thresholds.

| Service Method | Current Pattern | Endpoint Needed | Trigger |
|---|---|---|---|
| `clientProgramService.getClientProgramsForProgram(programId)` | Fetches ALL clients, filters client-side | `GET /creator/clients?programId=X` | Creator has 200+ clients |
| `libraryService.getExercises()` | Fetches ALL sessions, extracts exercises | `GET /creator/library/exercises` | Creator has 200+ library sessions |

---

## 3. Web Notification System (NOT IMPLEMENTED)

Entire system is specced but not started. No code exists. Required pieces:

### Infrastructure
- Generate VAPID keys (`npx web-push generate-vapid-keys`), store in Firebase Secret Manager
- Add `web-push` to `functions/package.json`

### Firestore Collections (new)
- `users/{userId}/web_push_subscriptions/{subscriptionId}` — endpoint, keys, userAgent, isActive
- `workout_timers/{timerId}` — userId, type, metadata, endAt, status (pending/sent/cancelled)

### Cloud Functions (new, add to `functions/src/index.ts`)
- `registerWebPushSubscription` — stores push subscription per user
- `sendTestWebPush` — sends test notification to all user's active subscriptions
- `scheduleRestTimerNotification` — creates a workout_timers doc with endAt timestamp
- `processRestTimerNotifications` — Pub/Sub scheduled function (every 1 minute), queries pending timers where `endAt <= now + 30s`, sends web push, marks as sent

### Client (new)
- `apps/pwa/src/services/notificationService.web.js` — requests permission, creates push subscription, registers with backend, exposes `scheduleRestTimerNotification()`
- Update `sw.js` with `push` and `notificationclick` event handlers
- Wire `initializeNotifications` in AuthContext on login

### Firestore Index
- Collection: `workout_timers`, Fields: `status` (Asc), `endAt` (Asc)

### Integration Point
- WorkoutExecutionScreen rest timer: on timer start, call `scheduleRestTimerNotification({ endAtIso, metadata: { exerciseName, durationMs } })`
- User gets OS notification "Descanso terminado — Vuelve a {exerciseName}" when PWA is backgrounded

---

## 4. Video Exchange System (NOT IMPLEMENTED — Future)

One-on-one only. Client uploads form-check videos, creator responds with feedback videos.

### Data Model (when built)
- Storage: `users/{userId}/session_videos/{sessionId}/{videoId}.mp4`
- Firestore: `users/{userId}/sessionHistory/{sessionId}/sessionVideos/{videoId}`
  - Required: `storagePath`, `url`, `createdAt`, `uploadedBy`
  - Optional: `exerciseKey`, `setIndex`, `exerciseId`, `responseToVideoId`
- Use Firebase Storage resumable uploads (`uploadBytesResumable`)
- Client-side compression to 720p before upload

### Priority
Low. Implement after session notes are shipped and validated.

---

## 5. Developer Portal (NOT BUILT)

API key management backend is complete (CRUD, SHA-256 storage, scope enforcement, rate limiting). But the developer portal UI is not built.

### What exists
- `ApiKeysScreen` in creator dashboard — basic key management works

### What's planned but not built
- Separate app at `apps/developer-portal/` (Vite + React 18, base: `/developers`)
- Pages: Home/Docs, API Reference, API Keys, Write Access Request form, Changelog
- Auth: Firebase Auth, restricted to `role: creator` or `role: admin`
- Interactive endpoint reference with request/response examples

### Priority
Low. The creator dashboard's ApiKeysScreen covers the functional need. Build the full portal when third-party developers actually need it.

---

## 6. Staging Environment — Incomplete Setup

`.firebaserc` has both aliases (`wolf-20b8b` + `wake-staging`). Environment-based Firebase config selection is implemented. Outstanding:

- [ ] Verify `wake-staging` Firebase project actually exists and has all services enabled (Firestore, Auth, Storage, Functions)
- [ ] Add secrets to staging Secret Manager: `FATSECRET_CLIENT_ID`, `FATSECRET_CLIENT_SECRET`, `RESEND_API_KEY`, MercadoPago sandbox credentials
- [ ] Populate staging with test data (2 users, 1 course, diary entries, session history, body log, readiness)
- [ ] Validate staging deploy works end-to-end before first domain migration
- [ ] (Future) Add GitHub Actions CI/CD for auto-deploy to staging on push to `main`

---

## 7. hybridDataService Deletion

`hybridDataService` is the legacy offline cache. **Ready to execute** — all 7 domains are confirmed migrated (section 1 complete). Deletion steps:

```bash
rm apps/pwa/src/services/hybridDataService.js
grep -r "hybridDataService" apps/pwa/src/  # remove all remaining imports
# Also delete webStorageService if only used by hybridDataService
firebase deploy --only hosting
```

---

## 8. Audit Findings — Deferred Architectural Items

All 330 audit findings (23 CRITICAL, 76 HIGH, 128 MEDIUM, 103 LOW) have been resolved. These items were intentionally deferred as Phase 3 migration targets:

| Item | Current State | Resolves When |
|---|---|---|
| ~~PWA screens with direct `firestoreService` imports~~ | Resolved — zero direct Firestore calls remain | Section 1 complete |
| `clientProgramService` server-side filtering | Client-side filtering works at current scale | Section 2 endpoints built |
| `libraryService.getExercises()` batch endpoint | Client-side extraction works at current scale | Section 2 endpoints built |

---

## Priority Order

1. **Section 7** — Delete hybridDataService (ready to execute now that all migrations are complete)
2. **Section 6** — Complete staging setup (needed for QA validation)
3. **Section 2** — Server-side filtering (when creators hit scale thresholds)
4. **Section 3** — Web notifications (nice-to-have, not blocking)
5. **Section 5** — Developer portal (when third-party devs need it)
6. **Section 4** — Video exchange (future feature)
