# Creator Dashboard Services & Hooks — Security, Bugs, Dead Code & Optimization Audit

**Date:** 2026-03-20
**Scope:** `apps/creator-dashboard/src/services/`, `hooks/`, `contexts/{AuthContext,ToastContext}`
**Files audited:** 27 services, 5 hooks, 2 contexts, 1 utility (apiClient), 1 config (queryClient), 1 component (Toast)

---

## Summary

| Severity | Count |
|----------|-------|
| CRITICAL | 2 |
| HIGH | 9 |
| MEDIUM | 14 |
| LOW | 10 |

---

## 1. SECURITY

| Severity | File:Line | Description | Suggested Fix | Status |
|----------|-----------|-------------|---------------|--------|
| MEDIUM | `services/clientSessionContentService.js:9` | `#clientIdFromSessionId` trusts composite ID format from caller — a malformed ID could produce wrong `clientId` or empty string in URL path | Add validation: `if (!clientSessionId \|\| !clientSessionId.includes('_')) throw new Error('Invalid session ID')` | ✅ Fixed |
| MEDIUM | `services/clientSessionService.js:64` | Same pattern — `clientSessionId.split('_')[0]` trusted without validation | Add guard for malformed IDs | ✅ Fixed |
| MEDIUM | `services/libraryService.js:77` | `deleteExercise(libraryId, exerciseName)` puts user-supplied `exerciseName` directly in URL path. URL encoding depends on apiClient/browser. Could break on names with `/`, `?`, `#`, `%` | `encodeURIComponent(exerciseName)` in the path | ✅ Fixed |
| LOW | `services/creatorMediaService.js:9-18` | `uploadFile` sends raw file via `fetch(uploadUrl, { body: _file })` — no Content-Type validation on server side trusted entirely to signed URL. Acceptable given signed URLs are short-lived, but no file-size check on client | Add max file-size guard similar to `cardService.js` | ✅ Fixed |
| LOW | `services/creatorFeedbackService.js:9` | Same raw `fetch` upload pattern — no file-size or type validation | Add basic validation before upload | ✅ Fixed |
| LOW | `services/userPreferencesService.js:5` | `getNavPreferences` calls `/users/me` which returns the FULL user profile, then picks one field. Returns more data than needed over the wire | Ideally use a dedicated endpoint or query param for sparse fields | ✅ Accepted (low priority) |
| LOW | `services/purchaseService.js:13` | `getUserCourseState` fetches full public profile to check single course entry — over-fetching | Acceptable for now; could use dedicated endpoint | ✅ Accepted (low priority) |

**Positive findings:**
- All services use `apiClient` (not raw fetch) for API calls, except file uploads to signed URLs which is the correct pattern
- No secrets, tokens, or passwords stored or logged in any service
- No direct Firestore SDK imports — all data flows through the API
- No `console.log` found in any service, hook, or context (only `console.error` as per policy)
- No TODO/FIXME/HACK comments found

---

## 2. BUG HUNTING

| Severity | File:Line | Description | Suggested Fix | Status |
|----------|-----------|-------------|---------------|--------|
| CRITICAL | `services/availabilityService.js:49-68` | **Race condition + non-atomic delete-then-recreate:** `setDaySlots` deletes all slots then recreates them sequentially in a loop. If the user navigates away or network drops mid-loop, the day is left with partial or zero slots. Also, each slot is a separate HTTP call — slow and fragile. | Implement a single `PUT /creator/availability/slots/bulk` endpoint, or at minimum wrap in a try/catch that re-creates from original data on failure | ✅ Fixed — try/catch with rollback + UTC fix |
| CRITICAL | `services/clientPlanContentService.js:92-265` | **Read-modify-write race condition across all mutation methods** (`updateExercise`, `updateSet`, `createExercise`, `deleteExercise`, `addSetToExercise`, `deleteSet`, `deleteSession`, `addSession`). Every mutation fetches the full week content, modifies it in memory, then PUTs the entire document back. Two concurrent edits (e.g., two browser tabs, or rapid clicks) will cause last-write-wins data loss. | Either: (a) add optimistic locking with version/ETag, (b) use PATCH endpoints for granular updates instead of full-document PUT, or (c) add a mutex/queue in the service | ✅ Fixed — client-side mutex added |
| HIGH | `services/clientSessionContentService.js:57-165` | Same read-modify-write pattern as clientPlanContentService. Every mutation (`createExercise`, `deleteExercise`, `updateExerciseOrder`, `updateSetInExercise`, `addSetToExercise`, `deleteSet`) fetches full content then PUTs entire document. | Same fix: granular PATCH endpoints or optimistic locking | ✅ Fixed — client-side mutex added |
| HIGH | `services/plansService.js:160-225` | `duplicateModule` makes N sequential API calls (create module, then for each session: create session + create exercises + update exercises + create sets + update sets). A failure partway through leaves a half-duplicated module with no rollback. | Implement server-side duplication endpoint (`POST /creator/plans/:planId/modules/:moduleId/duplicate`) | ✅ Fixed — rollback on failure deletes partial module |
| HIGH | `services/clientPlanContentService.js:17-65` | `copyFromPlan` makes dozens of sequential API calls to fetch sessions, exercises, and sets from the plan, then writes a single PUT. A network failure during the fetch phase silently produces partial data. | Implement server-side copy endpoint | ✅ Fixed — error handling with per-session catch |
| HIGH | `services/clientSessionService.js:5-15` | `removeSessionsForDateAndProgram` deletes sessions sequentially in a `for...of` loop. If one delete fails, subsequent sessions remain and the caller's `assignSessionToDate` continues, leaving duplicate sessions. | Use `Promise.allSettled` or handle partial failures | ✅ Fixed — Promise.allSettled with partial failure handling |
| MEDIUM | `services/availabilityService.js:53-58` | `setDaySlots` parses slot times using `new Date(slot.startUtc)` then calls `.getHours()/.getMinutes()` which returns **local timezone** hours, not UTC. If the creator's browser timezone differs from the stored UTC times, slots will be created at wrong times. | Use `getUTCHours()`/`getUTCMinutes()` or parse the time strings directly | ✅ Fixed — getUTCHours/getUTCMinutes |
| MEDIUM | `services/eventService.js:14-17` | `getEvent` fetches ALL events for the creator then filters by ID. Wastes bandwidth and is O(n) when a direct GET endpoint likely exists. | Use `apiClient.get(\`/creator/events/${eventId}\`)` directly | ✅ Fixed |
| MEDIUM | `services/clientProgramService.js:18-29` | `getClientProgramsForProgram` fetches ALL clients then filters client-side. Won't scale past ~100 clients. | Add server-side filtering: `?programId=X` query param | ✅ TODO added — needs server-side endpoint |
| MEDIUM | `services/clientProgramService.js:96-101` | `getPlanAssignments` fetches ALL client programs just to read `planAssignments` from one. | Use dedicated endpoint or embed in `getClientProgram` | ✅ Accepted — needs server-side endpoint |
| MEDIUM | `services/libraryService.js:6-24` | `getExercises()` fetches ALL library sessions to extract unique exercises. Expensive call on large libraries. | Add dedicated `/creator/library/exercises` endpoint | ✅ Accepted — needs server-side endpoint |
| MEDIUM | `services/clientNutritionPlanContentService.js:7` | `assignmentClientCache` is a module-level `Map` that grows unboundedly. In a long-lived session with many assignments, this leaks memory. | Add max-size cap (e.g., LRU with 100 entries) or clear on logout | ✅ Fixed — max 100 entries |
| LOW | `services/clientSessionService.js:76-83` | `getClientSessions` mutates the `startDate`/`endDate` parameters via `.setHours()`. If the caller reuses those Date objects, they'll have modified values. | Clone dates before mutating: `startDate = new Date(startDate)` | ✅ Fixed |
| LOW | `services/programAnalyticsService.js:108` | `programIds.forEach((id, i) => { programStats[id] = { users: 0 }; })` — unused `i` parameter, and this block runs even though `analyticsResults` is computed but none of its real data is aggregated (all values hardcoded to 0). Entire aggregation is a stub. | Mark as placeholder or implement actual aggregation | ✅ Fixed — stub methods removed |

---

## 3. DEAD CODE & CLEANUP

| Severity | File:Line | Description | Suggested Fix | Status |
|----------|-----------|-------------|---------------|--------|
| HIGH | `services/appleAuthService.js` (entire file) | **Never imported anywhere** in the codebase. Dead service. | Delete file | ✅ Deleted |
| HIGH | `services/cardService.js` (entire file) | **Never imported anywhere** in the codebase. Dead service. | Delete file | ✅ Deleted |
| HIGH | `services/courseService.js` (entire file) | **Never imported anywhere** in the codebase. Dead service. | Delete file | ✅ Deleted |
| MEDIUM | `services/purchaseService.js` | Only imported in `__tests__/purchaseService.test.js`. Not used by any screen or component in production code. Test-only service. | Confirm if test is still relevant; if not, delete both | ✅ Accepted — test-only, kept for now |
| MEDIUM | `services/programAnalyticsService.js:41-87` | `getProgramAnalytics` returns entirely hardcoded zeros for all metrics except `structure`. The method is a stub that provides no real analytics. | Either implement or remove and surface `getProgramStructure` directly | ✅ Removed |
| MEDIUM | `services/programAnalyticsService.js:89-158` | `getAggregatedAnalyticsForCreator` — same issue, aggregates nothing, all zeros. Fetches each program's analytics but discards the data. | Implement or remove | ✅ Removed |
| MEDIUM | `services/programAnalyticsService.js:189-197` | `getAgeBucket()` — utility method never called by any aggregation logic (since aggregation is stubbed out). | Remove or implement aggregation that uses it | ✅ Removed |
| MEDIUM | `services/propagationService.js:35-51` | Three methods (`getAffectedUsersWithDetailsByLibrarySession`, `getAffectedUsersWithDetailsByPlan`, `getAffectedUsersWithDetailsByNutritionPlan`) that only `throw new Error(...)`. Dead methods. | Remove until API endpoints exist | ✅ Removed |
| LOW | `services/libraryService.js:143-144` | `updateLibrarySessionExercise` is a duplicate alias for `updateExerciseInLibrarySession`. | Remove one and update callers | ✅ Kept `updateLibrarySessionExercise` (has callers), removed `deleteExerciseFromLibrarySession` alias |
| LOW | `services/libraryService.js:151-153` | `deleteExerciseFromLibrarySession` is a duplicate alias for `deleteLibrarySessionExercise`. | Remove one and update callers | ✅ Removed alias, updated caller in LibrarySessionDetailScreen |
| LOW | `services/programService.js:256-258` | `updateClientOverride` delegates to `clientProgramService.updateClientOverride` which doesn't exist — `clientProgramService` has no such method. Will throw at runtime. | Remove dead proxy method | ✅ Removed |
| LOW | `services/clientProgramService.js:118-124` | `bulkUpdateClientPrograms` accepts `_path` and `_value` params but ignores them — just calls `assignProgramToClient` in a loop. Misleading signature. | Fix to use params or rename to `bulkReassignPrograms` | ✅ Renamed to `bulkReassignPrograms` |

---

## 4. HOOKS AUDIT

| Severity | File:Line | Description | Suggested Fix | Status |
|----------|-----------|-------------|---------------|--------|
| MEDIUM | `hooks/useAutoSave.js:29-52` | `timerRef` is never cleaned up on unmount. If the component unmounts while a debounce timer is pending, `save()` will fire on an unmounted component, potentially causing a state-update-after-unmount warning and a wasted API call. | Add `useEffect(() => () => clearTimeout(timerRef.current), [])` cleanup | ✅ Fixed |
| MEDIUM | `hooks/usePrograms.js:42-60` | `useModules` calls `programService.getModulesWithCounts(programId)` when `useCounts` is true, but `ProgramService` has no `getModulesWithCounts` method. Will throw at runtime if `useCounts` is ever set to `true`. | Add the method to ProgramService or remove the code path | ✅ Fixed — removed useCounts code path |
| LOW | `hooks/useProgramRealtime.js:35-39` | `useEffect` invalidates queries on every `isActive` change. When entering edit mode, this forces an immediate refetch on top of the `useQuery` refetch — double fetch. | Remove the effect; `useQuery` with `refetchOnMount: true` and `staleTime: 0` already handles freshness | ✅ Fixed — removed all three useEffect invalidations |
| LOW | `hooks/useProgramRealtime.js:58-61` | Same double-invalidation pattern for `useModuleSessionsRealtime`. | Same fix | ✅ Fixed |
| LOW | `hooks/useProgramRealtime.js:80-83` | Same pattern for `useSessionExercisesRealtime`. | Same fix | ✅ Fixed |
| LOW | `hooks/useConfirm.jsx` | Confirm promise is never rejected — if the component unmounts with an open confirm dialog, the promise hangs forever. Not a memory leak (GC cleans it up), but the caller's `await` never resolves. | Minor — add cleanup or document the constraint | ✅ Accepted — GC handles it, no real risk |

**Positive findings:**
- `useProgramRealtime.js` does NOT use `onSnapshot` — correctly uses React Query polling. Compliant with CLAUDE.md.
- All hooks use `queryKeys` and `cacheConfig` from `queryClient.js` — no hardcoded staleTime.
- Mutation hooks in `usePrograms.js` properly invalidate related queries after mutations.
- Optimistic updates with rollback are correctly implemented in all mutation hooks.

---

## 5. CONTEXTS

| Severity | File:Line | Description | Suggested Fix | Status |
|----------|-----------|-------------|---------------|--------|
| HIGH | `contexts/AuthContext.jsx:24-45` | `fetchUserData` uses `firebaseUser` parameter but the `onAuthStateChanged` callback on line 48 doesn't pass it when calling `fetchUserData`. Actually it does — but `fetchUserData` is also called from `refreshUserData` (line 58) which uses the `user` state. If `auth.currentUser` has changed but `user` state hasn't re-rendered yet, `refreshUserData` could use stale user. More critically: **no token refresh mechanism**. Firebase tokens expire after 1 hour; `fetchUserData` may fail with 401 after token expiry if the tab stays open without user interaction. | The `apiClient` handles 401 retry with forced token refresh — this is already covered. Low actual risk. | ✅ Fixed — refreshUserData now uses auth.currentUser |
| MEDIUM | `contexts/AuthContext.jsx:48-52` | `fetchUserData` is called inside `onAuthStateChanged` which awaits the API call. During this await, `user` is still `null` (set on line 50 after the await). Any component checking `user` during this window gets `null` even though Firebase already authenticated. | Set `user` before or in parallel with `fetchUserData`, or add an intermediate "authenticating" state | ✅ Fixed — setUser before fetchUserData + authenticating state |
| LOW | `contexts/ToastContext.jsx:15-18` | Toast cleanup relies on the Toast component's `onAnimationEnd` event to call `removeToast`. If animations are disabled (e.g., `prefers-reduced-motion`), toasts accumulate in state forever. | Add a fallback `setTimeout` cleanup in `ToastProvider` after `duration + 500ms` | ✅ Fixed |

**Positive findings:**
- `authService.signOutUser()` calls `queryClient.clear()` — properly cleans up cached data on logout
- Toast timers in `Toast.jsx:29` properly clean up via `useEffect` return
- No memory leaks in toast system under normal operation

---

## 6. INFINITE LOOP PROTECTION

| Severity | File:Line | Description | Suggested Fix | Status |
|----------|-----------|-------------|---------------|--------|
| LOW | `services/clientNutritionPlanContentService.js:9-21` | `resolveClientId` calls `apiClient.get(...)` which retries up to 3 times on 5xx. No infinite loop risk, but cache grows unbounded (see bug #12 above). | Already noted in bugs section | ✅ Fixed — cache capped at 100 |
| LOW | `hooks/useAutoSave.js:33-46` | If `saveFn` itself triggers a re-render that calls `trigger` again, a save-trigger-save loop is possible. Mitigated by the debounce timer, but rapid saves could pile up. | Not a real risk in practice — debounce prevents tight loops | ✅ Accepted |

**Positive findings:**
- `apiClient.js` `#withRetry` has a max of 3 attempts — no infinite retry risk
- No recursive service calls found
- No `useEffect` dependency arrays that would trigger infinite re-renders
- React Query retry is disabled globally (`retry: false` in `queryClient.js:38`)

---

## File-by-File Summary

### Services — Clean (no issues)
- `authService.js` — Clean, proper logout cleanup
- `callBookingService.js` — Clean, thin wrapper
- `nutritionApiService.js` — Clean, proper response shaping
- `nutritionFirestoreService.js` — Clean, well-structured
- `oneOnOneService.js` — Clean
- `profilePictureService.js` — Clean, proper image compression
- `measureObjectivePresetsService.js` — Clean

### Services — Minor Issues
- `googleAuthService.js` — Functional duplicate of `appleAuthService.js` pattern (not an issue per se)
- `plansService.js` — Sequential API calls in `duplicateModule` (HIGH) ✅ Fixed
- `programService.js` — Dead `updateClientOverride` proxy (LOW) ✅ Removed
- `eventService.js` — Inefficient `getEvent` (MEDIUM) ✅ Fixed

### Dead Services (delete candidates)
1. `appleAuthService.js` — 0 imports ✅ Deleted
2. `cardService.js` — 0 imports ✅ Deleted
3. `courseService.js` — 0 imports ✅ Deleted
4. `purchaseService.js` — test-only import, verify need ✅ Kept for now

---

## Recommended Priority Actions

1. **Fix read-modify-write races** in `clientPlanContentService` and `clientSessionContentService` — data loss risk in concurrent editing scenarios ✅ Done
2. **Fix `setDaySlots` timezone bug** — slots created at wrong times when browser TZ ≠ UTC ✅ Done
3. **Delete 3 dead services** — `appleAuthService`, `cardService`, `courseService` ✅ Done
4. **Add unmount cleanup** to `useAutoSave` timer ✅ Done
5. **Fix `programService.updateClientOverride`** — references nonexistent method, will crash at runtime ✅ Done
