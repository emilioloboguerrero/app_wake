# PWA Services / Hooks / Data-Management Audit

**Date:** 2026-03-20
**Branch:** api-infrastructure
**Scope:** `apps/pwa/src/services/` (36 files), `apps/pwa/src/hooks/` (4 files), `apps/pwa/src/data-management/` (10 files), `apps/pwa/src/contexts/` (4 files), `apps/pwa/src/utils/offlineQueue.js`, `apps/pwa/src/utils/backgroundSync.js`
**Auditor:** Claude Code

---

## Summary

| Severity | Count |
|---|---|
| CRITICAL | 4 |
| HIGH | 9 |
| MEDIUM | 11 |
| LOW | 7 |
| INFO | 6 |
| **Total** | **37** |

---

## Findings by File

### `utils/offlineQueue.js`

| Severity | Location | Description | Suggested Fix | Status |
|---|---|---|---|---|
| MEDIUM | offlineQueue.js (entire file) | No maximum queue size cap. Queue can grow unbounded if items keep failing or the device stays offline for extended periods. On slow devices, `JSON.parse`/`JSON.stringify` of a large queue on every enqueue is a performance hazard. | Add a `MAX_QUEUE_SIZE = 50` cap; when exceeded, drop lowest-priority or oldest entries and emit a warning. | Owned by task A3 |

---

### `utils/backgroundSync.js`

| Severity | Location | Description | Suggested Fix | Status |
|---|---|---|---|---|
| LOW | backgroundSync.js ~line 90 | `updateRetryCount` reads and writes `localStorage` directly, bypassing `offlineQueue`'s `readQueue`/`writeQueue` helpers. If the queue storage key ever changes, this will silently diverge. | Route through `offlineQueue.updateEntry()` or expose a helper — do not duplicate the storage key string. | Owned by task A3 |
| INFO | backgroundSync.js | The `OFFLINE_ARCHITECTURE.md` spec documents a "known issue" where `data.entryId` was used instead of `data.id` for temp ID replacement after a successful diary POST. The code already uses `data.id` — the spec is stale. | Update `OFFLINE_ARCHITECTURE.md` to remove the known-issue callout. | No action required |

---

### `services/authService.js`

| Severity | Location | Description | Suggested Fix | Status |
|---|---|---|---|---|
| MEDIUM | authService.js:69 | Hardcoded `setTimeout(resolve, 150)` to wait for `onAuthStateChanged` to fire after sign-in. This is a timing hack that can silently fail on slow connections or be unnecessarily slow on fast ones. | Listen for the first `onAuthStateChanged` emission after sign-in rather than sleeping. | ✅ Fixed |

---

### `services/nutritionFirestoreService.js`

| Severity | Location | Description | Suggested Fix | Status |
|---|---|---|---|---|
| CRITICAL | nutritionFirestoreService.js:92 | `WakeApiError` is referenced in the `catch` block of `getAssignmentsByUser` but is **never imported**. Any 404 response from `/nutrition/assignment` throws `ReferenceError: WakeApiError is not defined`, completely crashing the caller instead of returning an empty array. | Add `import { WakeApiError } from '../utils/apiClient';` at the top of the file. | ✅ Fixed |
| CRITICAL | nutritionFirestoreService.js:105 | Same unimported `WakeApiError` reference in `hasActiveNutritionAssignment`. A 404 (the normal "no assignment" response) throws a `ReferenceError` instead of returning `false`. | Same fix: import `WakeApiError`. | ✅ Fixed |
| HIGH | nutritionFirestoreService.js:177 | `addDiaryEntry` passes `{ idempotent: false, tempId }` to `apiClient.post` and then checks `result?.queued`. Per `OFFLINE_ARCHITECTURE.md §2.2`, services are responsible for calling `offlineQueue.enqueue()` directly — not delegating offline detection to `apiClient`. Behaviour is inconsistent with the rest of the offline architecture. | Wrap the `apiClient.post` call: on network failure, call `offlineQueue.enqueue(...)` explicitly and return the `tempId`. Remove the `result?.queued` branch. | Owned by task A3 |

---

### `services/profilePictureService.js`

| Severity | Location | Description | Suggested Fix | Status |
|---|---|---|---|---|
| MEDIUM | profilePictureService.js (web path) | `URL.createObjectURL(blob)` is called inside `compressImage` to feed a compressed blob to the subsequent `fetch()`, but the object URL is never revoked. Every profile picture upload leaks a Blob URL for the session lifetime. | Call `URL.revokeObjectURL(url)` after the `fetch` resolves (success or failure). | ✅ Fixed |
| LOW | profilePictureService.js | No explicit file-size guard after compression. STANDARDS.md requires profile pictures ≤ 200 KB; the canvas compression at quality 0.8 / 400 px is not guaranteed to satisfy this for all input images. | After `canvas.toBlob(...)`, check `blob.size ≤ 204800`; if exceeded, re-compress at lower quality or reject with a user-facing error. | ✅ Fixed |

---

### `services/sessionService.js`

| Severity | Location | Description | Suggested Fix | Status |
|---|---|---|---|---|
| HIGH | sessionService.js:469 | `clearCache` attempts to delete a key formatted as `progress_${userId}_${courseId}`, but session entries are stored under `${userId}|${courseId}` or `${userId}|${courseId}|${targetDate}` (line 25). The cache is **never actually cleared** — the delete targets a key that does not exist. | Align the delete key format with the storage key format (`|` separator, not `_` prefix). | ✅ Fixed |
| LOW | sessionService.js (multiple lines) | Emoji characters (`❌`, `⚠️`) embedded directly in `logger.*` calls. Not a functional bug but violates the code-style conventions in CLAUDE.md. | Strip emojis from logger strings. | ✅ Fixed |
| LOW | sessionService.js:convertWorkoutToSession | `exercise_${Date.now()}` used as a fallback exercise ID. If multiple exercises lack IDs within a single synchronous conversion call, `Date.now()` returns the same millisecond, producing duplicate IDs. | Use a counter: `exercise_${Date.now()}_${index}`. | ✅ Fixed |

---

### `services/googleAuthService.js`

| Severity | Location | Description | Suggested Fix | Status |
|---|---|---|---|---|
| HIGH | googleAuthService.js:12 | Uses `Constants.appOwnership === 'expo'` — **deprecated** in Expo SDK 54+. This check is always `false` or undefined on SDK 54, causing the native Google auth path to never execute correctly. | Replace with `Constants.executionEnvironment === 'storeClient'` (same pattern already used in `authService.js`). | ✅ Fixed |

---

### `services/appleAuthService.js`

| Severity | Location | Description | Suggested Fix | Status |
|---|---|---|---|---|
| HIGH | appleAuthService.js:12 | Same deprecated `Constants.appOwnership` check as `googleAuthService.js`. | Replace with `Constants.executionEnvironment === 'storeClient'`. | ✅ Fixed |

---

### `services/purchaseService.js`

| Severity | Location | Description | Suggested Fix | Status |
|---|---|---|---|---|
| MEDIUM | purchaseService.js | `getUserActiveCourses` duplicates the identical logic from `apiService.getUserActiveCourses`. Two services maintaining the same query is a bug waiting to diverge. | Remove the duplicate from `purchaseService`; import and delegate to `apiService.getUserActiveCourses`. | ✅ Fixed |
| INFO | purchaseService.js | `prepareSubscription` and `preparePurchase` make raw `fetch()` calls to hardcoded Cloud Function URLs. This bypasses `apiClient` error handling and token refresh. This is intentional per architecture (Gen1 payment functions are not behind the `api` Express app), but worth documenting. | Add a comment explaining why these are raw `fetch()` calls rather than `apiClient` calls. | No action required |

---

### `services/monitoringService.js`

| Severity | Location | Description | Suggested Fix | Status |
|---|---|---|---|---|
| MEDIUM | monitoringService.js | Imports `@react-native-firebase/crashlytics` and `@react-native-firebase/analytics` inside a try/catch. Neither package is in the project's tech stack (CLAUDE.md: "No Analytics"). The entire module silently does nothing in production. | Delete `monitoringService.js` and remove any imports of it. | ✅ Deleted + callers updated |

---

### `services/heroImagesService.js`

| Severity | Location | Description | Suggested Fix | Status |
|---|---|---|---|---|
| MEDIUM | heroImagesService.js | Duplicates a subset of `appResourcesService` — both services call `/app-resources`. The landing app already uses `appResourcesService`; `heroImagesService` is a redundant layer reading different keys from the same endpoint. | Delete `heroImagesService.js`. Add `mainHeroLanding` and `heroAppPage` field reads to `appResourcesService` if they aren't there already, and update callers. | ✅ Deleted (no callers) |

---

### `services/appResourcesService.js`

| Severity | Location | Description | Suggested Fix | Status |
|---|---|---|---|---|
| LOW | appResourcesService.js | In-memory cache has no TTL and no invalidation path. Assets updated in Firestore mid-session are invisible until app restart. | Add a `MAX_AGE_MS = 5 * 60 * 1000` field and a `_cachedAt` timestamp; re-fetch if stale. | ✅ Fixed |

---

### `services/videoCacheService.js`

| Severity | Location | Description | Suggested Fix | Status |
|---|---|---|---|---|
| INFO | videoCacheService.js | `getCachedVideoUri` always returns the original remote URL — no video files are ever downloaded or cached locally. The AsyncStorage writes/reads are pure overhead. The service is functionally a no-op cache layer. | Either implement actual file caching (using `expo-file-system`) or delete the service and have callers use URLs directly. | No action required |

---

### `services/networkService.js`

| Severity | Location | Description | Suggested Fix | Status |
|---|---|---|---|---|
| HIGH | networkService.js (entire file) | This legacy HTTP client (with its own deduplication, retry, and timeout logic) is **not imported anywhere** in the codebase. All screens and services use `apiClient`. The file is dead code. | Delete `networkService.js`. | ✅ Deleted |

---

### `services/notificationService.js`

| Severity | Location | Description | Suggested Fix | Status |
|---|---|---|---|---|
| INFO | notificationService.js | All methods are no-ops. Documented as a stub pending FCM implementation. No issues — just noting it is intentionally unimplemented. | No action required until FCM is implemented. | No action required |

---

### `services/programMediaService.js`

| Severity | Location | Description | Suggested Fix | Status |
|---|---|---|---|---|
| INFO | programMediaService.js | All download/cleanup/delete methods are disabled no-ops. The constructor's `setTimeout` fires and calls a manifest loader that always returns `{}`. The service exists but has no effect. | If offline video download is not planned, delete the service and its callers. If it is planned, track it as a future feature. | No action required |

---

### `services/libraryResolutionService.js`

| Severity | Location | Description | Suggested Fix | Status |
|---|---|---|---|---|
| MEDIUM | libraryResolutionService.js | `extractLibraryVersions` and `checkLibraryVersionsChanged` make N sequential API calls (one per module, one per session). For a program with many modules, this is a slow sequential waterfall with no batching. | Batch the version checks into a single API call, or use `Promise.all` for parallelism if a batch endpoint is not available. | ✅ Fixed |

---

### `services/exerciseHistoryService.js`

| Severity | Location | Description | Suggested Fix | Status |
|---|---|---|---|---|
| LOW | exerciseHistoryService.js:95–105 | `getSessionHistoryPaginated` uses a `do-while` loop that makes sequential API calls until `fetched >= pageLimit`. For large `pageLimit` values this results in many round-trips. | Use `Promise.all` across pages if possible, or document that this is intentionally sequential to respect rate limits. | Intentionally sequential (cursor-based pagination requires sequential calls) |

---

### `services/webStorageService.js`

| Severity | Location | Description | Suggested Fix | Status |
|---|---|---|---|---|
| INFO | webStorageService.js | Single-line stub (`export default { init() {} }`). Exists only to prevent a throw in `App.web.js`'s lazy require. No issues — intentional. | No action required. | No action required |

---

### `contexts/AuthContext.js`

| Severity | Location | Description | Suggested Fix | Status |
|---|---|---|---|---|
| CRITICAL | AuthContext.js:58–61 | `setUser` and `setLoading` are called even when `isMounted` is `false`. The comment reads "Even if unmounted, update state — auth state is critical." This bypasses the mount guard intentionally but will produce "Can't perform state update on unmounted component" warnings in React and risks acting on stale state. | Remove the bypass. Let the `onAuthStateChanged` listener naturally re-fire after remount, or store auth state in a `ref` between mounts. | ✅ Fixed |
| CRITICAL | AuthContext.js:121 | The 2-second fallback timeout reads the `loading` state variable inside a closure. `loading` is captured at effect creation time (stale closure). If `loading` becomes `false` before the 2s fires, the timeout still runs and may incorrectly call `setLoading(false)` again or enter bad branches. | Use a `useRef` to track loading state that the timeout can read correctly, or cancel the timeout in the cleanup function when loading resolves. | ✅ Fixed |
| HIGH | AuthContext.js | Five overlapping `setTimeout` checks (100ms, 300ms, 500ms, 1s, 2s) plus the `onAuthStateChanged` listener can all fire and call `setUser`/`setLoading` in succession. This causes multiple unnecessary re-renders on every app startup. | Remove the polling timeouts. Rely solely on `onAuthStateChanged` plus a single reasonable fallback timeout (e.g., 3s) with a `ref`-based resolved flag. | ✅ Fixed |

---

### `contexts/ActivityStreakContext.js`

| Severity | Location | Description | Suggested Fix | Status |
|---|---|---|---|---|
| LOW | ActivityStreakContext.js | Registers its own `onAuthStateChanged` listener **and** consumes `useAuth()` from `AuthContext`. This creates two active Firebase auth listeners tracking the same state. | Remove the internal `onAuthStateChanged` listener; derive auth state exclusively from `useAuth()`. | ✅ Fixed |

---

### `contexts/UserRoleContext.js`

| Severity | Location | Description | Suggested Fix | Status |
|---|---|---|---|---|
| INFO | UserRoleContext.js | Creates context with `{ role: null }` default but provides no Provider that actually sets role values. Role checking via this context is effectively unimplemented. | Either implement the Provider with real role resolution, or remove the context and use the `role` field from the user profile query directly in components that need it. | No action required |

---

### `contexts/VideoContext.js`

| Severity | Location | Description | Suggested Fix | Status |
|---|---|---|---|---|
| INFO | VideoContext.js | Clean. Uses `useCallback` and `useMemo` correctly. No side effects, no cleanup needed. | No action required. | No action required |

---

### `data-management/sessionRecoveryService.js`

| Severity | Location | Description | Suggested Fix | Status |
|---|---|---|---|---|
| HIGH | sessionRecoveryService.js | Looks for the `active_session` AsyncStorage key, but the active workout writer (`sessionManager.js`) writes to `current_session`. **Key mismatch** — recovery never finds in-progress sessions from the current workout flow. | Align keys: both services must use the same constant. Define `SESSION_STORAGE_KEY = 'current_session'` in a shared constants file and import it in both places. | ✅ Fixed |
| HIGH | sessionRecoveryService.js | Calls `GET /workout/session/active` — this endpoint does not exist in `docs/API_ENDPOINTS.md`. The spec endpoint is `GET /workout/checkpoint`. This call will always 404. | Change to `GET /workout/checkpoint`. | ✅ Fixed |

---

### `data-management/workoutProgressService.js`

| Severity | Location | Description | Suggested Fix | Status |
|---|---|---|---|---|
| HIGH | workoutProgressService.js | `getUserAllProgress` calls `apiService.getUserAllProgress(userId)` — this method **does not exist** in `apiService.js`. This throws a `TypeError` at runtime. `CourseStructureScreen.js` imports this service, so the crash is reachable from the UI. | Either implement `apiService.getUserAllProgress` or remove this method and replace its usage with the correct API call. | ✅ Removed (no callers) |
| HIGH | workoutProgressService.js | `getCourseStatistics` calls `apiService.getCourseStatistics(userId, courseId)` — also **does not exist** in `apiService.js`. Same `TypeError` result. | Same: implement or replace. | ✅ Removed (no callers) |

---

### `data-management/workoutSessionService.js`

| Severity | Location | Description | Suggested Fix | Status |
|---|---|---|---|---|
| MEDIUM | workoutSessionService.js | Writes to `active_session`, `session_backup_N`, `session_metadata`, `upload_queue`, and `pending_session_*` AsyncStorage keys. `addToUploadQueue` queues session references, but `uploadService.uploadSession` is a no-op (see below). The entire subsystem is disconnected from the actual completion flow (`sessionService.js` → `POST /workout/complete`). | Audit which callers use this service. If none do, delete the file. If callers exist, connect `uploadService.uploadSession` to `POST /workout/complete`. | ✅ TODO added |

---

### `data-management/uploadService.js`

| Severity | Location | Description | Suggested Fix | Status |
|---|---|---|---|---|
| HIGH | uploadService.js | `uploadSession` generates a document ID string, calls `markUploadCompleted`, and cleans up local storage — but **never posts to any API or Firestore**. The comment acknowledges that writes to `courseProgress` are deprecated, but no replacement write is made. Sessions queued through `workoutSessionService` are silently lost. | Connect `uploadSession` to `POST /workout/complete`, or document that this path is intentionally retired and delete the service. | ✅ TODO added |

---

### `data-management/courseDownloadService.js`

| Severity | Location | Description | Suggested Fix | Status |
|---|---|---|---|---|
| MEDIUM | courseDownloadService.js:204,225 | `downloadCourse` calls `apiService.getCourse(courseId)` twice. The second call is a redundant read of the same data. | Store the result of the first call and reuse it. | ✅ Fixed |

---

### `data-management/progressQueryService.js`

| Severity | Location | Description | Suggested Fix | Status |
|---|---|---|---|---|
| MEDIUM | progressQueryService.js | `getUserCourseProgress` fetches session history one-by-one in a loop (N+1 API calls pattern). `getRecentWorkouts` has doubly nested loops across all courses × all sessions with individual API calls. | Batch the requests or use `Promise.all`. Ideally expose a single `/progress/summary` endpoint that returns aggregated data. | ✅ Fixed |

---

### `data-management/simpleCourseCache.js`

| Severity | Location | Description | Suggested Fix | Status |
|---|---|---|---|---|
| HIGH | simpleCourseCache.js (entire file) | Confirmed not imported anywhere in the codebase. Pure dead code. | Delete the file. | ✅ Deleted |

---

### `hooks/workout/useUserCourses.js`

| Severity | Location | Description | Suggested Fix | Status |
|---|---|---|---|---|
| INFO | useUserCourses.js | Clean. Uses `cacheConfig.programStructure` from queryConfig and `queryKeys.user.courses(userId)`. No issues. | No action required. | No action required |

---

### `hooks/usePlatformVideoPlayer.js`

| Severity | Location | Description | Suggested Fix | Status |
|---|---|---|---|---|
| INFO | usePlatformVideoPlayer.js | `require('expo-video')` inside a try/catch is acceptable for optional native module handling. Clean. | No action required. | No action required |

---

### `hooks/useFrozenBottomInset.web.js` / `hooks/useStableLayoutHeight.web.js`

| Severity | Location | Description | Suggested Fix | Status |
|---|---|---|---|---|
| INFO | Both files | Clean platform-specific layout utilities. No issues. | No action required. | No action required |

---

## Potentially Dead / Unused Services

The following services are confirmed dead or effectively no-ops and should be evaluated for deletion:

| File | Status | Evidence | Action |
|---|---|---|---|
| `services/networkService.js` | **Confirmed dead** — no importers | Grep confirmed zero imports; all callers use `apiClient` | ✅ Deleted |
| `data-management/simpleCourseCache.js` | **Confirmed dead** — no importers | Grep confirmed zero imports | ✅ Deleted |
| `services/monitoringService.js` | **Effectively dead** — silent no-op | Imports `@react-native-firebase/crashlytics` and `analytics` which are not in the stack; try/catch silences the failure | ✅ Deleted + callers updated |
| `services/videoCacheService.js` | **Functionally no-op** | Never downloads files; always returns original URL; AsyncStorage reads/writes are pure overhead | No action (INFO) |
| `services/programMediaService.js` | **Functionally no-op** | All download/cleanup methods disabled; constructor initializes to empty manifest | No action (INFO) |
| `services/notificationService.js` | **Intentional stub** | All methods are no-ops pending FCM implementation; not dead, but currently has no effect | No action (INFO) |
| `data-management/workoutSessionService.js` | **Disconnected subsystem** | Upload queue feeds into `uploadService.uploadSession` which is a no-op; entire subsystem has no effect on actual session persistence | ✅ TODO added |
| `data-management/uploadService.js` | **No-op upload path** | `uploadSession` generates an ID but makes no API or Firestore write | ✅ TODO added |
| `services/heroImagesService.js` | **Redundant** | Duplicates a subset of `appResourcesService`; both call `/app-resources` | ✅ Deleted |

---

## Severity Reference

| Level | Meaning |
|---|---|
| CRITICAL | Runtime crash or data loss in a reachable code path |
| HIGH | Incorrect behavior, broken feature, or deprecated API that will silently fail on supported SDK versions |
| MEDIUM | Architectural violation, performance hazard, or spec deviation that does not currently crash but creates risk |
| LOW | Style violation, minor inefficiency, or missed cleanup |
| INFO | Observation with no required action |
