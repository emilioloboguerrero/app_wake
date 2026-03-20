# Migration Tracker

Single source of truth for all deferred migration work (Firestore direct calls → Phase 3 API).

---

## 1. PWA Screens — Direct firestoreService Imports

These screens bypass the API layer with direct `firestoreService` calls.

| Screen | firestoreService calls | API Domain | Priority | Status |
|---|---|---|---|---|
| `CourseDetailScreen.js` | `getCourse()` | Workout | Migrate with Workout domain | Pending |
| `CourseDetailScreen.web.js` | `getCourse()` | Workout | Migrate with Workout domain | Pending |
| `CourseStructureScreen.web.js` | `getCourse()` | Workout | Migrate with Workout domain | Pending |
| `DailyWorkoutScreen.web.jsx` | `getCourse()`, `getDatesWithPlannedSessions()`, `getDatesWithCompletedPlannedSessions()` | Workout | Migrate with Workout domain | Pending |
| `SubscriptionsScreen.js` | subscription reads | Payments | Migrate with Payments domain | Pending |
| `UpcomingCallDetailScreen.js` | booking reads | Creator/Bookings | Migrate with Creator domain | Pending |

---

## 2. Creator Dashboard — Server-Side Filtering Needed

Acceptable at current scale. Need server-side endpoints when creators grow past thresholds.

| Service Method | Current Pattern | Endpoint Needed | Trigger | Status |
|---|---|---|---|---|
| `clientProgramService.getClientProgramsForProgram(programId)` | Fetches ALL clients, filters client-side | `GET /creator/clients?programId=X` | Creator has 200+ clients | Pending |
| `libraryService.getExercises()` | Fetches ALL sessions, extracts exercises | `GET /creator/library/exercises` | Creator has 200+ library sessions | Pending |

---

## 3. Migration Order Reference

| # | Domain | Status |
|---|---|---|
| 1 | Auth | Done |
| 2 | Profile | Done |
| 3 | Nutrition | Done |
| 4 | Progress/Lab | Pending |
| 5 | Workout | Pending — CourseDetail, CourseStructure, DailyWorkout screens migrate here |
| 6 | Creator | Pending — UpcomingCallDetail migrates here |
| 7 | Payments | Pending — SubscriptionsScreen migrates here |

---

## 4. Completed Deferred Items (Audit Log)

| Item | Resolution | Date |
|---|---|---|
| `workoutSessionService.js` + `uploadService.js` | Deleted (disconnected subsystem, never posted to API) | 2026-03 |
| `clientProgramService.getPlanAssignments` | Deleted (zero callers) | 2026-03 |
| `offlineQueue.js` max queue size | Fixed | 2026-03 |
| `backgroundSync.js` storage key coupling | Fixed | 2026-03 |
