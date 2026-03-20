# Wake — Pending & Partial Implementation Tracker

Single source of truth for everything that has been designed/specified but not yet implemented or only partially implemented. Created 2026-03-20 by consolidating all docs.

---

## 1. API Migration — Remaining Screen Migrations

The Phase 3 API infrastructure is complete (Express app, all routes, middleware, API clients, offline queue). Auth, Profile, and Nutrition domains are migrated. These screens still bypass the API with direct `firestoreService` calls:

### PWA Screens

| Screen | Direct Calls | API Domain | Status |
|---|---|---|---|
| `CourseDetailScreen.js` | `getCourse()` | Workout | Pending |
| `CourseDetailScreen.web.js` | `getCourse()` | Workout | Pending |
| `CourseStructureScreen.web.js` | `getCourse()` | Workout | Pending |
| `DailyWorkoutScreen.web.jsx` | `getCourse()`, `getDatesWithPlannedSessions()`, `getDatesWithCompletedPlannedSessions()` | Workout | Pending |
| `SubscriptionsScreen.js` | subscription reads | Payments | Pending |
| `UpcomingCallDetailScreen.js` | booking reads | Creator/Bookings | Pending |

### Migration Domain Status

| # | Domain | Status |
|---|---|---|
| 1 | Auth | Done |
| 2 | Profile | Done |
| 3 | Nutrition | Done |
| 4 | Progress/Lab | Pending |
| 5 | Workout | Pending — CourseDetail, CourseStructure, DailyWorkout screens migrate here |
| 6 | Creator | Pending — UpcomingCallDetail migrates here |
| 7 | Payments | Pending — SubscriptionsScreen migrates here |

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

**Progress / Lab:**
- [ ] `PUT /progress/readiness/{date}` creates or updates entry
- [ ] `GET /progress/readiness/{date}` returns entry
- [ ] Body weight log: create, list, paginate
- [ ] PR history: `GET /progress/prs` returns correct PRs
- [ ] Offline body log: go offline, log weight, reconnect, verify sync

**Workout:**
- [ ] `GET /workout/daily` returns today's session with full exercise/set tree
- [ ] Session checkpoint: complete a set, verify localStorage is written
- [ ] Session checkpoint: quit app mid-session, reopen, verify recovery modal
- [ ] `POST /workout/complete` completes session atomically
- [ ] Session appears in `GET /workout/history` after completion
- [ ] Streak updated correctly after completion
- [ ] `GET /analytics/weekly-volume` returns correct data
- [ ] Offline completion: complete workout offline, reconnect, verify sync
- [ ] Cross-device checkpoint: complete sets on device A, open on device B, verify recovery

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

## 3. FatSecret Server-Side Cache (DONE)

Implemented in `functions/src/api/routes/nutrition.ts` on the food search endpoint (`GET /nutrition/foods/search`):
- Collection: `nutrition_food_cache/{md5(query + "_" + page)}`
- TTL: 30 days
- Cache hit/miss logging via `functions.logger`
- Common foods served from Firestore cache after first search

---

## 4. Offline Architecture — Remaining Gaps

The core offline system is implemented (offlineQueue, backgroundSync, apiClient offline detection). These items are not yet confirmed complete:

### Service Worker Caching (Unverified)

Per the original spec, the service worker at `/app/sw.js` should implement:

| Resource | Strategy |
|---|---|
| App shell (JS, CSS, fonts) | Cache-first, update in background (Workbox precache) |
| Static images from Storage | Cache-first, 30-day TTL |
| API responses (`/api/v1/**`) | Network-first, no SW cache (React Query handles this) |
| Firebase Auth requests | Network-only |
| FatSecret/MercadoPago proxies | Network-only |

**Action:** Verify the current `sw.js` implements Workbox precaching and image caching. If not, this needs to be built.

### React Query IndexedDB Persistence (Unverified)

For programs to survive app close/reopen without network, React Query should use `@tanstack/query-persist-client-core` with IndexedDB storage. This replaces the old `courseDownloadService` for web.

**Action:** Check if `persistQueryClient` is configured in the PWA's QueryClient setup. If not, add it.

---

## 5. Web Notification System (NOT IMPLEMENTED)

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

## 6. Session Notes (NOT IMPLEMENTED)

Session-level notes for completed workouts. No code exists yet.

### Data Model
- Add `userNotes` (string, optional) to `users/{userId}/sessionHistory/{sessionId}` documents
- No new collections. No Firestore rules change needed (owner already has write).

### Implementation Steps

1. **`exerciseHistoryService.js`**: Add `userNotes: sessionData.userNotes ?? ''` to `sessionHistoryData` in `updateSessionHistory()`. Add new method `updateSessionNotes(userId, sessionId, userNotes)` using `updateDoc`.

2. **`sessionService.js`**: In `completeSession()`, set `actualSessionData.userNotes = options.userNotes ?? ''` before calling `addSessionData`.

3. **`WorkoutExecutionScreen.js`**: Add `sessionNotes` state. Add collapsible "Notas de la sesion" section with text area. Pass `userNotes: sessionNotes` in options to `sessionService.completeSession`.

4. **`WorkoutCompletionScreen.js`**: Add notes text area, pre-fill from `sessionData.userNotes`. "Guardar notas" button calls `exerciseHistoryService.updateSessionNotes()`.

5. **`SessionsScreen.js`**: Show `item.userNotes` for each session. Add "Editar notas" / "Anadir notas" control.

6. **`SessionPerformanceModal.jsx`** (creator dashboard): Show `historyDoc.userNotes` in a read-only "Notas del usuario" section.

---

## 7. Video Exchange System (NOT IMPLEMENTED — Future)

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

## 8. Developer Portal (NOT BUILT)

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

## 9. Staging Environment — Incomplete Setup

`.firebaserc` has both aliases (`wolf-20b8b` + `wake-staging`). Environment-based Firebase config selection is implemented. Outstanding:

- [ ] Verify `wake-staging` Firebase project actually exists and has all services enabled (Firestore, Auth, Storage, Functions)
- [ ] Add secrets to staging Secret Manager: `FATSECRET_CLIENT_ID`, `FATSECRET_CLIENT_SECRET`, `RESEND_API_KEY`, MercadoPago sandbox credentials
- [ ] Populate staging with test data (2 users, 1 course, diary entries, session history, body log, readiness)
- [ ] Validate staging deploy works end-to-end before first domain migration
- [ ] (Future) Add GitHub Actions CI/CD for auto-deploy to staging on push to `main`

---

## 10. hybridDataService Deletion

`hybridDataService` is the legacy offline cache. It stays intact until ALL domains are migrated (after section 1 is complete). Once all 7 domains are confirmed stable:

```bash
rm apps/pwa/src/services/hybridDataService.js
grep -r "hybridDataService" apps/pwa/src/  # remove all remaining imports
# Also delete webStorageService if only used by hybridDataService
firebase deploy --only hosting
```

---

## 11. Audit Findings — Deferred Architectural Items

All 330 audit findings (23 CRITICAL, 76 HIGH, 128 MEDIUM, 103 LOW) have been resolved. These items were intentionally deferred as Phase 3 migration targets:

| Item | Current State | Resolves When |
|---|---|---|
| 6 PWA screens with direct `firestoreService` imports | TODO comments in code | Section 1 migrations complete |
| `clientProgramService` server-side filtering | Client-side filtering works at current scale | Section 2 endpoints built |
| `libraryService.getExercises()` batch endpoint | Client-side extraction works at current scale | Section 2 endpoints built |

---

## Priority Order

1. **Section 3** — FatSecret cache (highest cost impact, implement before 100 users)
2. **Section 1** — Continue domain migrations (Progress/Lab → Workout → Creator → Payments)
3. **Section 6** — Session notes (high user value, well-scoped)
4. **Section 4** — Verify offline gaps (service worker, IndexedDB persistence)
5. **Section 9** — Complete staging setup (needed before production migrations)
6. **Section 5** — Web notifications (nice-to-have, not blocking)
7. **Section 10** — Delete hybridDataService (after all migrations)
8. **Section 8** — Developer portal (when third-party devs need it)
9. **Section 7** — Video exchange (future feature)
