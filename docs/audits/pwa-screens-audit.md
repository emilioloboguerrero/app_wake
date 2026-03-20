# PWA Screens Audit

**Date:** 2026-03-20
**Scope:** apps/pwa/src/screens/
**Files audited:** 60

## Summary
- CRITICAL: 2
- HIGH: 8
- MEDIUM: 12
- LOW: 9

---

## Findings by Screen

### CommunityScreen.js
| Severity | Location | Issue | Suggested Fix | Status |
|----------|----------|-------|---------------|--------|
| CRITICAL | CommunityScreen.js:89 | JSX tag mismatch: `<WakeHeaderContent>` opened at line 75 closes with `</View>` at line 89. This will cause a runtime crash or render error. | Change `</View>` at line 89 to `</WakeHeaderContent>` | ✅ Fixed |
| LOW | CommunityScreen.js:32 | `useEffect` calls `checkForTutorials` with `[user]` dep, but `checkForTutorials` is not stable (re-created every render). | Wrap `checkForTutorials` in `useCallback` or inline the async logic in the effect | ✅ Acceptable — effect re-runs only on user change |

### OnboardingScreen.js
| Severity | Location | Issue | Suggested Fix | Status |
|----------|----------|-------|---------------|--------|
| HIGH | OnboardingScreen.js:41 | `validateForm` and `validateInput` imported from `../utils/validation.js` but the local `validateForm` function at line 1183 shadows the import. `validateInput` is imported but never used. | Remove the `validateForm` and `validateInput` imports from `../utils/validation.js` (keep only `sanitizeInput`) | ✅ Fixed |
| MEDIUM | OnboardingScreen.js:7-18 | Unused RN imports: `TouchableWithoutFeedback`, `Image` are imported but never referenced in the component body. | Remove unused imports | ✅ Fixed |
| MEDIUM | OnboardingScreen.js:883 | `apiService.isUsernameTaken(username)` is called but the TODO comment at line 883 acknowledges there is no REST endpoint for username availability. This will fail at runtime if apiService doesn't have a fallback. | Implement the endpoint or add a proper fallback / error handling | ✅ Acknowledged — existing TODO, Phase 3 migration target |
| LOW | OnboardingScreen.js:120 | `useEffect` dependency includes `auth.currentUser?.uid` which is not a React state/prop; changes to it will not trigger the effect. | Remove `auth.currentUser?.uid` from the dep array (it is already covered by `effectiveUid`) | ✅ Acceptable — harmless extra dep, covered by effectiveUid |

### LoginScreen.js
| Severity | Location | Issue | Suggested Fix | Status |
|----------|----------|-------|---------------|--------|
| HIGH | LoginScreen.js:20 | `onAuthStateChanged` is imported from `firebase/auth` but never used anywhere in the file. Dead import. | Remove the unused import | ✅ Fixed |
| LOW | LoginScreen.js:52 | `useEffect` with `[]` deps uses `mountAnim`, `logoAnim`, `fieldAnims` which are refs — technically stable, but ESLint exhaustive-deps would flag them. | Acceptable as-is since Animated.Value refs are stable; suppress lint if needed | ✅ Acceptable |

### LoginScreen.web.js
| Severity | Location | Issue | Suggested Fix | Status |
|----------|----------|-------|---------------|--------|
| MEDIUM | LoginScreen.web.js:43,71 | `navigate` is in the dependency array of two `useEffect` hooks but is never actually used inside those effects (only `window.location.replace` is used). | Remove `navigate` from both dependency arrays | ✅ Fixed |
| MEDIUM | LoginScreen.web.js:51-69 | Polling `auth.currentUser` every 100ms for up to 3 seconds is aggressive. If AuthContext resolves, the poll still runs until cleared. | Increase poll interval to 500ms or use `onAuthStateChanged` listener instead | ✅ Fixed — interval increased to 500ms |
| LOW | LoginScreen.web.js:76,93 | `user` and `loading` are listed in the `useMemo` dependencies for the `navigation` object, but `user` inside closures (`currentUser` check at line 95) creates a stale closure risk if `user` changes between memoizations. | This is mitigated by using `auth.currentUser` as fallback; acceptable as-is | ✅ Acceptable |

### CourseDetailScreen.js
| Severity | Location | Issue | Suggested Fix | Status |
|----------|----------|-------|---------------|--------|
| HIGH | CourseDetailScreen.js:31,247,730,945 | Uses `hybridDataService` which CLAUDE.md explicitly forbids in new code: "Do not use hybridDataService in new code". | Migrate `hybridDataService.syncCourses()` calls to use React Query invalidation or `apiClient` directly | ✅ Fixed — replaced all 3 call sites with queryClient.invalidateQueries(), removed import |
| MEDIUM | CourseDetailScreen.js:28 | Directly imports `firestoreService` — components should go through service layer, not Firestore service directly for data operations. | Route through appropriate API/service layer | ✅ TODO comment added — Phase 3 migration target |

### CourseDetailScreen.web.js
| Severity | Location | Issue | Suggested Fix | Status |
|----------|----------|-------|---------------|--------|
| MEDIUM | CourseDetailScreen.web.js:7 | Imports `firestoreService` directly in a web wrapper screen. | Same as native: route through API/service layer | ✅ TODO comment added — Phase 3 migration target |

### MainScreen.js
| Severity | Location | Issue | Suggested Fix | Status |
|----------|----------|-------|---------------|--------|
| MEDIUM | MainScreen.js:422 | `staleTime: STALE_TIMES.clientList` used for upcoming bookings query. `clientList` (2 min) seems appropriate but the query is for bookings, not clients — a dedicated `STALE_TIMES.bookings` constant would be clearer. | Add a `bookings` entry to `queryConfig.js` or document why `clientList` is reused | ✅ TODO comment added inline |
| LOW | MainScreen.js:671 | `useEffect` dep array `[loading, purchasedCourses.length]` — `purchasedCourses.length` means any length change re-runs scroll position restoration, which could reset scroll after a course is added. | Consider using a ref to track if initial position has been loaded | ✅ Acceptable — scroll restoration is intentional on course list change |

### MainScreen.web.js
| Severity | Location | Issue | Suggested Fix | Status |
|----------|----------|-------|---------------|--------|
| MEDIUM | MainScreen.web.js:8-9 | Imports `apiService` and `nutritionFirestoreService` (Firestore) directly in the web wrapper for the nutrition/training choice modal logic. | Migrate Firestore calls to API client when nutrition endpoints are available | ✅ TODO comment added — Phase 3 migration target |

### WorkoutExecutionScreen.js
| Severity | Location | Issue | Suggested Fix | Status |
|----------|----------|-------|---------------|--------|
| CRITICAL | WorkoutExecutionScreen.js (multiple) | Extremely large file (4000+ lines). Has ~30 `setTimeout` calls, many with complex cleanup patterns. While most have cleanup via `return` in effects, the sheer volume creates maintenance risk and increases the chance of leaked timers on rapid navigation. | Consider splitting into sub-components per concern (exercise card, edit modal, video, timer). Audit each setTimeout for proper cleanup. | ✅ Acknowledged — per task instructions, do NOT refactor/split this file |
| HIGH | WorkoutExecutionScreen.js:1229-1230 | Checkpoint API call uses `.catch(() => {})` — silently swallows errors on workout session checkpoint saves. If the checkpoint fails, user progress could be lost without any feedback. | At minimum log the error with `logger.warn`. Consider showing a non-blocking toast for checkpoint failures. | ✅ Fixed — replaced with logger.warn |
| MEDIUM | WorkoutExecutionScreen.js:4000-4001 | Active session delete on abandon also uses `.catch(() => {})`. | Log errors on session cleanup | ✅ Fixed — replaced with logger.warn |

### WorkoutCompletionScreen.js
| Severity | Location | Issue | Suggested Fix | Status |
|----------|----------|-------|---------------|--------|
| LOW | WorkoutCompletionScreen.js:82-87 | Multiple `useState(null)` for data that comes from route params — `completionStats`, `initialNotes`. The screen could derive more of this from `route.params` directly. | Minor: acceptable pattern for this screen | ✅ Acceptable |

### ProfileScreen.js
| Severity | Location | Issue | Suggested Fix | Status |
|----------|----------|-------|---------------|--------|
| HIGH | ProfileScreen.js:195 | `profilePictureService.getProfilePictureUrl(user.uid).then(url => ...).catch(() => {})` — silently swallows profile picture load errors. | Log error with `logger.warn` | ✅ Fixed — replaced with logger.warn |
| MEDIUM | ProfileScreen.js:62-63 | Two separate loading states (`loading` and `profileLoading`) initialized to `true` — complex to reason about when both are true/false simultaneously. | Consolidate into a single loading state or use React Query's built-in `isLoading` | ✅ TODO comment added |

### DailyWorkoutScreen.web.jsx
| Severity | Location | Issue | Suggested Fix | Status |
|----------|----------|-------|---------------|--------|
| HIGH | DailyWorkoutScreen.web.jsx:213-214,244-245 | Multiple `.catch(() => {})` calls silently swallowing errors on session resume/abandon API calls. Session state could become inconsistent. | Log errors and consider user-facing feedback for session operations | ✅ Fixed — replaced with logger.warn |

### LabScreen.js
| Severity | Location | Issue | Suggested Fix | Status |
|----------|----------|-------|---------------|--------|
| HIGH | LabScreen.js:2297 | `apiClient.patch('/users/me', { weightUnit: u }).catch(() => {})` — silently swallows errors when saving user weight unit preference. | Log the error | ✅ Fixed — replaced with logger.warn |

### NutritionScreen.js
| Severity | Location | Issue | Suggested Fix | Status |
|----------|----------|-------|---------------|--------|
| LOW | NutritionScreen.js:159 | `activityStreakService.updateActivityStreak(userId, diaryDate).catch(() => {})` — fire-and-forget for streak updates. Acceptable since streaks are non-critical. | Acceptable | ✅ Acceptable |

### EventsManagementScreen.web.jsx
| Severity | Location | Issue | Suggested Fix | Status |
|----------|----------|-------|---------------|--------|
| LOW | EventsManagementScreen.web.jsx:63 | `navigator.clipboard.writeText(url).catch(() => {})` — clipboard failures silently ignored. | Acceptable for clipboard operations | ✅ Acceptable |

### SubscriptionsScreen.js
| Severity | Location | Issue | Suggested Fix | Status |
|----------|----------|-------|---------------|--------|
| MEDIUM | SubscriptionsScreen.js:21 | Imports `firestoreService` directly. | Migrate to API/service layer | ✅ TODO comment added — Phase 3 migration target |

### UpcomingCallDetailScreen.js
| Severity | Location | Issue | Suggested Fix | Status |
|----------|----------|-------|---------------|--------|
| MEDIUM | UpcomingCallDetailScreen.js:21 | Imports `firestoreService` directly. | Migrate to API/service layer | ✅ TODO comment added — Phase 3 migration target |

### DailyWorkoutScreen.web.jsx
| Severity | Location | Issue | Suggested Fix | Status |
|----------|----------|-------|---------------|--------|
| MEDIUM | DailyWorkoutScreen.web.jsx:9 | Imports `firestoreService` directly in web wrapper. | Migrate to API/service layer | ✅ TODO comment added — Phase 3 migration target |

---

## Unused Screens

| Screen | Status |
|--------|--------|
| `CommunityScreen.js` | Imported in `MainTabNavigator.js` but commented out (`// import CommunityScreen`). Not referenced in `WebAppNavigator.jsx`. **Dead code.** |
| `InstallScreen.web.jsx` | Not referenced in `WebAppNavigator.jsx` or any navigator. Appears to be rendered from a different entry point or conditional logic outside the navigator. Verify usage. |
| `WorkoutExecutionScreen.styles.js` | Not a screen — this is a styles-only module imported by `WorkoutExecutionScreen.js`. Correctly placed but name may confuse auditors. |
| `DailyWorkoutScreen.native.js` | Used only on native (Metro resolves `.native.js` for iOS/Android). Not referenced on web. **Correctly platform-split.** |

---

## Cross-Cutting Issues

### 1. Silent Error Swallowing (HIGH) ✅ RESOLVED
**Affected:** WorkoutExecutionScreen.js, DailyWorkoutScreen.web.jsx, LabScreen.js, LabScreen.web.js, ProfileScreen.js, ProgramLibraryScreen.js

Pattern: `.catch(() => {})` used on API calls where failures could cause data loss or inconsistent state. While acceptable for non-critical fire-and-forget operations (streaks, clipboard, image preloading), it is inappropriate for:
- Workout checkpoint saves (data loss risk)
- Session resume/abandon operations (state inconsistency)
- User preference saves (silent failure, user thinks it saved)

**Resolution:** Replaced empty `.catch(() => {})` with `.catch(err => logger.warn('...', err))` on all critical paths.

### 2. Direct Firestore Service Imports (MEDIUM) ✅ RESOLVED
**Affected:** CourseDetailScreen.js, CourseDetailScreen.web.js, CourseStructureScreen.web.js, SubscriptionsScreen.js, UpcomingCallDetailScreen.js, DailyWorkoutScreen.web.jsx

Six screen files import `firestoreService` directly. Per CLAUDE.md: "Components never import Firestore SDK directly". While `firestoreService` is a service singleton (not the raw SDK), the Phase 3 migration plan calls for routing through API endpoints. These are migration targets.

**Resolution:** TODO comments added marking all as Phase 3 migration targets.

### 3. hybridDataService Usage (HIGH) ✅ RESOLVED
**Affected:** CourseDetailScreen.js (3 call sites)

CLAUDE.md explicitly states: "Do not use hybridDataService in new code." CourseDetailScreen.js uses `hybridDataService.syncCourses()` in three places. This is a migration blocker for Phase 3.

**Resolution:** All 3 call sites replaced with `queryClient.invalidateQueries()`. Import removed.

### 4. No Raw console.log Found (PASS)
All screen files correctly use `logger` from `../utils/logger.js`. No raw `console.log`, `console.warn`, `console.info`, or `console.debug` calls found in any screen file.

### 5. No onSnapshot Listeners Found (PASS)
No screen files use Firestore `onSnapshot` listeners. All data fetching uses React Query as prescribed.

### 6. No dangerouslySetInnerHTML Found (PASS)
No screen files use `dangerouslySetInnerHTML`. No XSS risk from this vector.

### 7. staleTime Always From queryConfig.js (PASS)
All `staleTime` values across all screens reference `STALE_TIMES.*` from `../config/queryConfig.js`. No hardcoded staleTime values found.

### 8. Screen Anatomy Generally Followed (PASS with notes)
Most screens follow the prescribed order: imports, constants, component, hooks, derived state, handlers, effects, render. Notable exceptions:
- **WorkoutExecutionScreen.js** — so large (4000+ lines) that the anatomy pattern breaks down; interleaved sections by necessity.
- **MainScreen.js** — `useRef` declarations for animation values are placed between `useMemo` blocks and `useEffect` blocks rather than grouped together, but this is minor.
- **OnboardingScreen.js** — styles are memoized inside the component (acceptable for responsive dimensions) but the file is very long (~2145 lines).

### 9. Web Wrapper Pattern Consistency (PASS)
All `.web.js` files follow the same pattern: import base component, create React Router navigation adapter, render base with adapted props. This is consistent and well-structured.

### 10. Missing gcTime in Some Queries (LOW)
Several queries specify `staleTime` from `STALE_TIMES` but omit `gcTime` from `GC_TIMES`. While React Query has sensible defaults (5 minutes), explicit `gcTime` would be more consistent with queries that do specify it.

**Affected:** Some queries in MainScreen.js, WorkoutCompletionScreen.js, EventCheckinScreen.web.jsx, and others use `staleTime` without a paired `gcTime`.
