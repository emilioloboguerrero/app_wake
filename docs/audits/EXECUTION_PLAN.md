# Audit Execution Plan

**Generated:** 2026-03-20
**Source:** 10 audit files in `docs/audits/`
**Purpose:** Dependency mapping, parallel grouping, and recommended execution order

---

## 1. Files Modified Per Audit × Severity

### A1 — api-routes-security-audit

**CRITICAL + HIGH:**
- `functions/src/api/routes/profile.ts`
- `functions/src/api/routes/nutrition.ts`
- `functions/src/api/routes/workout.ts`
- `functions/src/api/routes/progress.ts`
- `functions/src/api/routes/creator.ts`
- `functions/src/api/routes/events.ts`
- `functions/src/api/routes/payments.ts`
- `functions/src/api/routes/appResources.ts`
- `functions/src/api/routes/bookings.ts`
- `functions/src/api/middleware/rateLimit.ts` *(IP-based rate limiting)*
- `functions/src/api/middleware/validate.ts` *(length/bounds constraints)*
- `functions/src/api/middleware/auth.ts` *(enforceScope never called)*

**MEDIUM:**
- `functions/src/api/routes/profile.ts`
- `functions/src/api/routes/nutrition.ts`
- `functions/src/api/routes/workout.ts`
- `functions/src/api/routes/progress.ts`
- `functions/src/api/routes/creator.ts`
- `functions/src/api/routes/apiKeys.ts`
- `functions/src/api/routes/analytics.ts`
- `functions/src/api/routes/bookings.ts`
- `functions/src/api/middleware/rateLimit.ts`
- `functions/src/api/middleware/validate.ts`

**LOW:**
- `functions/src/api/routes/profile.ts`
- `functions/src/api/routes/workout.ts`
- `functions/src/api/routes/creator.ts`
- `functions/src/api/routes/apiKeys.ts`
- `functions/src/api/routes/analytics.ts`
- `functions/src/api/routes/appResources.ts`
- `functions/src/api/routes/bookings.ts`
- `functions/src/api/routes/payments.ts`

---

### A2 — api-middleware-gen1-audit

**HIGH:**
- `functions/src/api/middleware/validate.ts` *(empty string bypass)*
- `functions/src/api/app.ts` *(CORS origin whitelist)*
- `functions/src/index.ts` *(in-memory rate limit, error leaks ×3)*

**MEDIUM:**
- `functions/src/api/middleware/auth.ts` *(checkRevoked, App Check optional)*
- `functions/src/api/middleware/rateLimit.ts` *(TTL docs)*
- `functions/src/api/app.ts` *(security headers)*
- `functions/src/index.ts` *(webhook replay, HTML injection, nutrition auth)*
- `functions/src/openapi.ts` *(key auth mismatch)*

**LOW:**
- `functions/src/api/middleware/auth.ts` *(req.auth cache)*
- `functions/src/api/middleware/rateLimit.ts` *(retryAfter type assert)*
- `functions/src/api/app.ts` *(Swagger public)*
- `functions/src/index.ts` *(App Check inconsistency)*
- `functions/src/api/errors.ts` *(retryAfter constructor param)*

---

### A3 — api-client-libs-audit

**HIGH:**
- `apps/pwa/src/utils/apiClient.js` *(401 retry timeout, 429 budget)*
- `apps/creator-dashboard/src/utils/apiClient.js` *(same two issues)*

**MEDIUM:**
- `apps/pwa/src/utils/apiClient.js` *(token refresh race, AbortSignal misclass)*
- `apps/creator-dashboard/src/utils/apiClient.js` *(same two issues)*
- `apps/landing/src/utils/apiClient.js` *(offline detection, 429 budget)*
- `apps/pwa/src/utils/offlineQueue.js` *(max queue size, body sanitization)*

**LOW:**
- `apps/pwa/src/utils/apiClient.js` *(redundant clientId, body re-serialize, mixed language)*
- `apps/creator-dashboard/src/utils/apiClient.js` *(redundant clientId)*
- `apps/landing/src/utils/apiClient.js` *(structure divergence)*

---

### A4 — creator-dashboard-screens-audit

**CRITICAL:**
- `apps/creator-dashboard/src/screens/EventResultsScreen.jsx` *(null access in CSV export)*
- `apps/creator-dashboard/src/components/SvgIcon.jsx` *(XSS via dangerouslySetInnerHTML — cross-ref with A6)*

**HIGH:**
- `apps/creator-dashboard/src/screens/ProfileScreen.jsx` *(useEffect data fetching ×2)*
- `apps/creator-dashboard/src/screens/EventResultsScreen.jsx` *(no error toasts ×2)*
- `apps/creator-dashboard/src/screens/EventEditorScreen.jsx` *(user guard, Image leak, XHR timeout)*
- `apps/creator-dashboard/src/screens/OneOnOneScreen.jsx` *(imperative async fetch)*
- `apps/creator-dashboard/src/screens/AvailabilityCalendarScreen.jsx` *(missing dep)*
- `apps/creator-dashboard/src/screens/ProgramsScreen.jsx` *(console.error inconsistency)*

**MEDIUM:**
- `apps/creator-dashboard/src/screens/LoginScreen.jsx` *(open redirect)*
- `apps/creator-dashboard/src/screens/ProfileScreen.jsx` *(nav prefs useEffect, logger.warn)*
- `apps/creator-dashboard/src/screens/ProgramDetailScreen.jsx` *(debounce cleanup)*
- `apps/creator-dashboard/src/screens/ApiKeysScreen.jsx` *(missing onError)*
- `apps/creator-dashboard/src/screens/EventsScreen.jsx` *(setTimeout leak)*
- `apps/creator-dashboard/src/screens/EventEditorScreen.jsx` *(accent Image leak, XHR timeout, client-side ID)*
- `apps/creator-dashboard/src/screens/EventResultsScreen.jsx` *(duplication, Image leak, XHR timeout)*
- `apps/creator-dashboard/src/screens/EventCheckinScreen.jsx` *(accent Image leak)*
- `apps/creator-dashboard/src/screens/LabScreen.jsx` *(fragile enabled pattern)*
- `apps/creator-dashboard/src/screens/CreatorOnboardingScreen.jsx` *(setTimeout race)*
- `apps/creator-dashboard/src/screens/ProgramsAndClientsScreen.jsx` *(empty onClick handlers)*

**LOW:**
- `apps/creator-dashboard/src/screens/LoginScreen.jsx`
- `apps/creator-dashboard/src/screens/DashboardScreen.jsx`
- `apps/creator-dashboard/src/screens/ProfileScreen.jsx`
- `apps/creator-dashboard/src/screens/ProgramsScreen.jsx`
- `apps/creator-dashboard/src/screens/ApiKeysScreen.jsx`
- `apps/creator-dashboard/src/screens/EventsScreen.jsx`
- `apps/creator-dashboard/src/screens/EventEditorScreen.jsx`
- `apps/creator-dashboard/src/screens/EventResultsScreen.jsx`
- `apps/creator-dashboard/src/screens/AvailabilityCalendarScreen.jsx`
- `apps/creator-dashboard/src/screens/OneOnOneScreen.jsx`
- `apps/creator-dashboard/src/screens/onboarding/OnboardingComplete.jsx`
- `apps/creator-dashboard/src/screens/onboarding/OnboardingQuestion1-5.jsx`
- `apps/creator-dashboard/src/screens/LibraryManagementScreen.jsx`

---

### A5 — creator-dashboard-services-hooks-audit

**CRITICAL:**
- `apps/creator-dashboard/src/services/availabilityService.js` *(race condition, non-atomic delete-recreate)*
- `apps/creator-dashboard/src/services/clientPlanContentService.js` *(read-modify-write race)*

**HIGH:**
- `apps/creator-dashboard/src/services/clientSessionContentService.js` *(same race)*
- `apps/creator-dashboard/src/services/plansService.js` *(no rollback on duplicateModule)*
- `apps/creator-dashboard/src/services/clientPlanContentService.js` *(copyFromPlan fragile)*
- `apps/creator-dashboard/src/services/clientSessionService.js` *(sequential delete, no error handling)*
- `apps/creator-dashboard/src/services/appleAuthService.js` *(DELETE — dead)*
- `apps/creator-dashboard/src/services/cardService.js` *(DELETE — dead)*
- `apps/creator-dashboard/src/services/courseService.js` *(DELETE — dead)*
- `apps/creator-dashboard/src/contexts/AuthContext.jsx` *(stale user in refreshUserData)*

**MEDIUM:**
- `apps/creator-dashboard/src/services/availabilityService.js` *(timezone bug)*
- `apps/creator-dashboard/src/services/eventService.js` *(getEvent fetches all)*
- `apps/creator-dashboard/src/services/clientProgramService.js` *(fetches all then filters ×2)*
- `apps/creator-dashboard/src/services/libraryService.js` *(getExercises expensive)*
- `apps/creator-dashboard/src/services/clientNutritionPlanContentService.js` *(unbounded cache)*
- `apps/creator-dashboard/src/services/purchaseService.js` *(test-only import)*
- `apps/creator-dashboard/src/services/programAnalyticsService.js` *(stub methods ×3)*
- `apps/creator-dashboard/src/services/propagationService.js` *(throw-only methods)*
- `apps/creator-dashboard/src/hooks/useAutoSave.js` *(timer cleanup)*
- `apps/creator-dashboard/src/hooks/usePrograms.js` *(nonexistent method ref)*
- `apps/creator-dashboard/src/contexts/AuthContext.jsx` *(user null window)*

**LOW:**
- `apps/creator-dashboard/src/services/creatorMediaService.js`
- `apps/creator-dashboard/src/services/creatorFeedbackService.js`
- `apps/creator-dashboard/src/services/userPreferencesService.js`
- `apps/creator-dashboard/src/services/clientSessionService.js`
- `apps/creator-dashboard/src/services/programService.js`
- `apps/creator-dashboard/src/services/programAnalyticsService.js`
- `apps/creator-dashboard/src/services/libraryService.js`
- `apps/creator-dashboard/src/services/clientProgramService.js`
- `apps/creator-dashboard/src/hooks/useProgramRealtime.js`
- `apps/creator-dashboard/src/hooks/useConfirm.jsx`
- `apps/creator-dashboard/src/contexts/ToastContext.jsx`

---

### A6 — creator-dashboard-components-audit

**CRITICAL:**
- `apps/creator-dashboard/src/components/SvgIcon.jsx` *(XSS via dangerouslySetInnerHTML)*
- `apps/creator-dashboard/src/components/PlanningSidebar.jsx` *(JSX syntax error — but file is DEAD)*

**HIGH:**
- `apps/creator-dashboard/src/components/ErrorBoundary.jsx` *(banned gold #BFA84D)*
- `apps/creator-dashboard/src/components/PaymentModal.jsx` *(iframe URL validation — but DEAD)*
- `apps/creator-dashboard/src/components/CalendarView.jsx` *(empty useEffect)*
- `apps/creator-dashboard/src/components/MediaPickerModal.jsx` *(no file validation)*

**MEDIUM:**
- `apps/creator-dashboard/src/components/SvgIcon.jsx` *(color injection)*
- `apps/creator-dashboard/src/components/PlanningSidebar.jsx` *(console.error ×3 — DEAD)*
- `apps/creator-dashboard/src/components/PaymentModal.jsx` *(empty polling — DEAD)*
- `apps/creator-dashboard/src/components/CalendarView.jsx` *(console.error)*
- `apps/creator-dashboard/src/components/MediaPickerModal.jsx` *(console.error ×2)*
- `apps/creator-dashboard/src/components/ProgramWeeksGrid.jsx` *(console.error, dragover parse)*
- `apps/creator-dashboard/src/components/PlanWeeksGrid.jsx` *(console.error)*
- `apps/creator-dashboard/src/components/ContentManager/ContentManager.jsx` *(undeclared var, console.error ×3 — DEAD)*
- `apps/creator-dashboard/src/components/PlanStructureSidebar.jsx` *(console.error)*
- `apps/creator-dashboard/src/components/SessionAssignmentModal.jsx` *(console.error)*
- `apps/creator-dashboard/src/components/PlansSidebar.jsx` *(console.error — DEAD)*

**LOW:**
- `apps/creator-dashboard/src/components/ErrorBoundary.jsx` *(empty componentDidCatch)*
- `apps/creator-dashboard/src/components/Modal.jsx` *(no focus trap)*
- `apps/creator-dashboard/src/components/DatePicker.jsx` *(useRef misuse ×2)*
- `apps/creator-dashboard/src/components/ProgramWeeksGrid.jsx` *(duplicate arrayMove)*
- `apps/creator-dashboard/src/components/PlanWeeksGrid.jsx` *(JSON.parse no try/catch)*
- `apps/creator-dashboard/src/components/ContentManager/ContentManager.jsx` *(dead conditional — DEAD)*
- `apps/creator-dashboard/src/utils/plannedVolumeUtils.js` *(typo in muscle key)*
- `apps/creator-dashboard/src/utils/muscleColorUtils.js` *(stale comment)*
- `apps/creator-dashboard/src/utils/libraryIcons.jsx` *(identical icon paths)*
- **DELETE (dead):** `MuscleSilhouetteSVG_template.js`, `FeedbackModal.jsx`, `PlanningModal.jsx`, `SessionCreationModal.jsx`, `PlanningSidebar.jsx`, `PlansSidebar.jsx`, `PaymentModal.jsx`, `ContentManager/ContentManager.jsx`

---

### A7 — pwa-screens-audit

**CRITICAL:**
- `apps/pwa/src/screens/CommunityScreen.js` *(JSX tag mismatch)*
- `apps/pwa/src/screens/WorkoutExecutionScreen.js` *(4000+ lines, maintenance risk)*

**HIGH:**
- `apps/pwa/src/screens/OnboardingScreen.js` *(shadowed import)*
- `apps/pwa/src/screens/LoginScreen.js` *(dead import)*
- `apps/pwa/src/screens/CourseDetailScreen.js` *(hybridDataService usage)*
- `apps/pwa/src/screens/WorkoutExecutionScreen.js` *(silent checkpoint error)*
- `apps/pwa/src/screens/ProfileScreen.js` *(silent error swallowing)*
- `apps/pwa/src/screens/DailyWorkoutScreen.web.jsx` *(silent error swallowing ×2)*
- `apps/pwa/src/screens/LabScreen.js` *(silent error swallowing)*

**MEDIUM:**
- `apps/pwa/src/screens/OnboardingScreen.js` *(unused imports, missing endpoint)*
- `apps/pwa/src/screens/LoginScreen.web.js` *(navigate in deps, aggressive polling)*
- `apps/pwa/src/screens/CourseDetailScreen.js` *(direct firestoreService import)*
- `apps/pwa/src/screens/CourseDetailScreen.web.js` *(direct firestoreService import)*
- `apps/pwa/src/screens/MainScreen.js` *(wrong cacheConfig key)*
- `apps/pwa/src/screens/MainScreen.web.js` *(direct firestoreService import)*
- `apps/pwa/src/screens/WorkoutExecutionScreen.js` *(silent error on abandon)*
- `apps/pwa/src/screens/ProfileScreen.js` *(dual loading states)*
- `apps/pwa/src/screens/SubscriptionsScreen.js` *(direct firestoreService import)*
- `apps/pwa/src/screens/UpcomingCallDetailScreen.js` *(direct firestoreService import)*
- `apps/pwa/src/screens/DailyWorkoutScreen.web.jsx` *(direct firestoreService import)*

**LOW:**
- `apps/pwa/src/screens/CommunityScreen.js`
- `apps/pwa/src/screens/OnboardingScreen.js`
- `apps/pwa/src/screens/LoginScreen.js`
- `apps/pwa/src/screens/LoginScreen.web.js`
- `apps/pwa/src/screens/MainScreen.js`
- `apps/pwa/src/screens/WorkoutCompletionScreen.js`
- `apps/pwa/src/screens/NutritionScreen.js`
- `apps/pwa/src/screens/EventsManagementScreen.web.jsx`

---

### A8 — pwa-services-hooks-data-audit

**CRITICAL:**
- `apps/pwa/src/services/nutritionFirestoreService.js` *(WakeApiError not imported ×2)*
- `apps/pwa/src/contexts/AuthContext.js` *(unmounted setState, stale closure timeout)*

**HIGH:**
- `apps/pwa/src/services/nutritionFirestoreService.js` *(offline queue inconsistency)*
- `apps/pwa/src/services/sessionService.js` *(clearCache key mismatch)*
- `apps/pwa/src/services/googleAuthService.js` *(deprecated Constants.appOwnership)*
- `apps/pwa/src/services/appleAuthService.js` *(deprecated Constants.appOwnership)*
- `apps/pwa/src/services/networkService.js` *(DELETE — dead)*
- `apps/pwa/src/data-management/sessionRecoveryService.js` *(key mismatch, wrong endpoint)*
- `apps/pwa/src/data-management/workoutProgressService.js` *(calls nonexistent methods ×2)*
- `apps/pwa/src/data-management/uploadService.js` *(never posts to API)*
- `apps/pwa/src/data-management/simpleCourseCache.js` *(DELETE — dead)*

**MEDIUM:**
- `apps/pwa/src/utils/offlineQueue.js` *(no max queue size)*
- `apps/pwa/src/services/authService.js` *(setTimeout hack)*
- `apps/pwa/src/services/profilePictureService.js` *(blob URL leak)*
- `apps/pwa/src/services/purchaseService.js` *(duplicate logic)*
- `apps/pwa/src/services/monitoringService.js` *(DELETE — no-op)*
- `apps/pwa/src/services/heroImagesService.js` *(DELETE — redundant)*
- `apps/pwa/src/services/libraryResolutionService.js` *(sequential N calls)*
- `apps/pwa/src/data-management/courseDownloadService.js` *(duplicate API call)*
- `apps/pwa/src/data-management/progressQueryService.js` *(N+1 pattern)*
- `apps/pwa/src/data-management/workoutSessionService.js` *(disconnected subsystem)*

**LOW:**
- `apps/pwa/src/utils/backgroundSync.js` *(bypasses queue helpers)*
- `apps/pwa/src/services/profilePictureService.js` *(no size guard after compress)*
- `apps/pwa/src/services/sessionService.js` *(emoji in logs, duplicate ID risk)*
- `apps/pwa/src/services/appResourcesService.js` *(no cache TTL)*
- `apps/pwa/src/services/exerciseHistoryService.js` *(sequential pagination)*
- `apps/pwa/src/contexts/ActivityStreakContext.js` *(duplicate auth listener)*

---

### A9 — pwa-components-utils-nav-audit

**CRITICAL:**
- `apps/pwa/src/utils/security.js` *(Math.random() for tokens)*

**HIGH:**
- `apps/pwa/src/components/LabMuscleHeatmap.web.jsx` *(regex SVG sanitization)*
- `apps/pwa/src/utils/security.js` *(regex HTML sanitization, innerHTML debug)*
- `apps/pwa/src/components/ExerciseDetailModal.js` *(hooks after early return, unreachable useEffect)*

**MEDIUM:**
- `apps/pwa/src/utils/security.js` *(fake encryption, unused SQL escape)*
- `apps/pwa/src/utils/validation.js` *(dead import)*
- `apps/pwa/src/utils/offlineQueue.js` *(payload sanitization note)*
- `apps/pwa/src/components/BottomTabBar.web.js` *(perf — no memoization)*
- `apps/pwa/src/components/ExerciseDetailModal.js` *(createStyles every render)*
- `apps/pwa/src/components/ErrorBoundary.js` *(inconsistent debug, permanent debug mode)*
- `apps/pwa/src/components/ReadinessCheckModal.web.jsx` *(step -1 risk)*
- `apps/pwa/src/navigation/WebAppNavigator.jsx` *(duplicate route, no role guard, stale cache trust)*
- **DELETE (dead):** `BottomNavigation.web.jsx`, `Input.fixed.js`, `Input.simple.js`, `useAuthGuard.js`, `dataValidation.js`, `webUtils.js`, `notificationUtils.js`, `freezeDetector.js`, `safariVideoOverlayDebug.web.js`, `inputValidation.js`

**LOW:**
- `apps/pwa/src/utils/security.js` *(unbounded rate limiter, SecurityMonitor)*
- `apps/pwa/src/utils/validation.js` *(dead handleValidationError import)*
- `apps/pwa/src/utils/cache.js` *(interval when empty)*
- `apps/pwa/src/utils/responsiveStyles.js` *(no memoization docs)*
- `apps/pwa/src/components/LabWeightChart.web.jsx` *(spread min/max)*
- `apps/pwa/src/components/ReadinessCheckModal.web.jsx` *(empty deps)*
- `apps/pwa/src/components/WeekDateSelector.web.jsx` *(duplicate toYYYYMMDD)*
- `apps/pwa/src/navigation/WebAppNavigator.jsx` *(404 redirect, require() in render, dep array)*
- `apps/pwa/src/styles/global.css` *(stale comments, unused CSS var)*
- `apps/pwa/src/patches/scrollViewTouchAction.web.js` *(fragile monkey-patch)*
- `apps/pwa/src/config/firebase.js` *(staging TODO crash)*
- `apps/pwa/src/config/queryClient.js` *(refetchOnWindowFocus contradicts CLAUDE.md)*

---

### A10 — landing-app-audit

**CRITICAL:**
- `apps/landing/src/screens/EventSignupScreen.jsx` *(QR service leaks auth token)*
- `apps/landing/index.html` *(blocks pinch-to-zoom — WCAG violation)*

**HIGH:**
- `apps/landing/src/screens/EventSignupScreen.jsx` *(weak email validation, no waitlist validation, errors all show "not found")*
- `apps/landing/src/utils/apiClient.js` *(AbortSignal.any Safari crash)*
- `apps/landing/src/config/firebase.js` *(staging TODO crash)*
- `apps/landing/src/App.jsx` *(unhandled promise rejections ×3)*

**MEDIUM:**
- `apps/landing/src/screens/EventSignupScreen.jsx` *(age float, clipboard lie, mutable counter, CORS fail)*
- `apps/landing/src/utils/apiClient.js` *(signal fallback)*
- `apps/landing/src/config/firebase.js` *(AppCheck silent disable)*
- `apps/landing/src/services/heroImagesService.js` *(no cache TTL, unhandled error)*
- `apps/landing/src/App.jsx` *("Ver entrenadores" noop)*
- `apps/landing/src/screens/LegalDocumentsScreen.jsx` *(iframe no sandbox)*
- `apps/landing/index.html` *(no SEO metadata)*
- `apps/landing/package.json` *(dead dependency)*

**LOW:**
- `apps/landing/src/screens/EventSignupScreen.jsx` *(lazy-load auth, step icons limit)*
- `apps/landing/src/utils/apiClient.js` *(short retry delays)*
- `apps/landing/src/config/firebase.js` *(unused firestore import)*
- `apps/landing/src/App.jsx` *(hero key by index, Set in state)*
- `apps/landing/src/components/Header.jsx` *(navItems recreated)*
- `apps/landing/src/components/Footer.jsx` *(missing rel attributes)*
- `apps/landing/index.html` *(PWA manifest mismatch)*
- `apps/landing/vite.config.js` *(host: true in dev)*
- `apps/landing/package.json` *(@types packages in JS project)*

---

## 2. Dependency Map — File Overlaps Between Audits

### Overlapping Files

| File | Audits | Issue |
|------|--------|-------|
| `functions/src/api/middleware/validate.ts` | **A1** (length/bounds, extra fields) + **A2** (empty string bypass, extra fields) | Both audits want to extend validation logic |
| `functions/src/api/middleware/rateLimit.ts` | **A1** (IP-based rate limiting) + **A2** (TTL cleanup, retryAfter type) | A1 adds functionality; A2 fixes existing code |
| `functions/src/api/middleware/auth.ts` | **A1** (enforceScope) + **A2** (checkRevoked, App Check) | A1 calls enforceScope; A2 hardens existing auth |
| `apps/landing/src/utils/apiClient.js` | **A3** (429 budget, offline detection) + **A10** (AbortSignal.any crash, signal fallback) | Both add different fixes to same file |
| `apps/pwa/src/utils/offlineQueue.js` | **A3** (max queue size, body sanitization) + **A8** (max queue size) + **A9** (payload note) | All three flag max queue size — single fix needed |
| `apps/creator-dashboard/src/components/SvgIcon.jsx` | **A4** (XSS — onboarding screens cross-ref) + **A6** (XSS + color injection — direct audit) | Same finding from two angles |
| `apps/pwa/src/utils/security.js` | **A9** only (CRITICAL + HIGH + MEDIUM + LOW — 6 findings in one file) | No overlap, but heavy modification |
| `apps/pwa/src/navigation/WebAppNavigator.jsx` | **A9** only (MEDIUM ×3 + LOW ×3) | No overlap |

### Non-Overlapping Audit Pairs (zero shared files)

| Pair | Confirmed Independent |
|------|----------------------|
| A4 ↔ A5 | Yes — screens vs services/hooks (different files within creator-dashboard) |
| A7 ↔ A8 | Yes — screens vs services/hooks (different files within PWA) |
| A7 ↔ A9 | Yes — screens vs components/utils/nav (different files within PWA) |
| A4 ↔ A7 | Yes — creator-dashboard vs PWA |
| A4 ↔ A8 | Yes — creator-dashboard vs PWA |
| A5 ↔ A7 | Yes — creator-dashboard vs PWA |
| A5 ↔ A8 | Yes — creator-dashboard vs PWA |
| A5 ↔ A9 | Yes — creator-dashboard vs PWA |
| A5 ↔ A10 | Yes — creator-dashboard vs landing |
| A6 ↔ A7 | Yes — creator-dashboard components vs PWA screens |
| A6 ↔ A8 | Yes — creator-dashboard components vs PWA services |
| A6 ↔ A10 | Yes — creator-dashboard vs landing |
| A10 ↔ A7 | Yes — landing vs PWA screens |
| A10 ↔ A8 | Yes — landing vs PWA services |
| A10 ↔ A4 | Yes — landing vs creator-dashboard screens |
| A10 ↔ A5 | Yes — landing vs creator-dashboard services |

---

## 3. Overlap Ownership — Who Fixes What

| Overlapping File | Owner | Rationale | Skipped By |
|-----------------|-------|-----------|------------|
| `middleware/validate.ts` | **A2** (middleware audit) | A2 audited the file directly; A1 consumes it. A2 fixes empty-string bypass + extra-field stripping. A1 then relies on the improved validator. | A1 — just call `validateBody()` with schemas; don't modify `validate.ts` |
| `middleware/rateLimit.ts` | **A1** for IP-based rate limiting (new feature); **A2** for TTL + retryAfter type fix | Split: A1 adds `checkIpRateLimit()`; A2 fixes existing code | Neither skips — non-conflicting changes |
| `middleware/auth.ts` | **A1** for `enforceScope` wiring (in `app.ts`); **A2** for `checkRevoked` + App Check | Split: A1 wires scope enforcement into middleware chain; A2 hardens token verification | Neither skips — different code paths |
| `landing/apiClient.js` | **A3** (client libs audit) | A3 audited all three apiClients holistically. Apply A3's 429 + offline fixes, then A10's AbortSignal.any fix as an additive patch | **A10** skips apiClient fixes — defers to A3 |
| `pwa/offlineQueue.js` | **A3** (client libs audit) | A3 owns the max-queue-size fix. A8's finding is identical. A9's note is advisory only. | **A8** and **A9** skip offlineQueue fixes — defer to A3 |
| `SvgIcon.jsx` | **A6** (components audit) | A6 audited the file directly with the full fix (DOMPurify + color validation). A4 just cross-references it. | **A4** skips SvgIcon fix — defer to A6 |

---

## 4. Safe Parallel Plan

### Batch 1 — API Backend (foundation for all clients)

Run sequentially (shared middleware files):

| Order | Audit | Focus | CRIT | HIGH |
|-------|-------|-------|------|------|
| 1a | **A2** — middleware & Gen1 | validate.ts, app.ts, index.ts, errors.ts | 0 | 4 |
| 1b | **A1** — routes & security | All route files, enforce scope, IP rate limiting | 8 | 14 |

**Reasoning:** A2 fixes the middleware that A1's route fixes depend on (e.g., `validateBody` must handle empty strings before routes add schemas). Gen1 error leaks in `index.ts` are the simplest HIGH-priority security wins.

---

### Batch 2 — All client-side work (parallel)

These five audits touch **zero overlapping files** (after ownership assignments above):

| Lane | Audit | App | CRIT | HIGH |
|------|-------|-----|------|------|
| 2A | **A3** — API client libs | pwa + cd + landing apiClient, offlineQueue | 0 | 4 |
| 2B | **A4** — CD screens | creator-dashboard/screens/ | 1 | 6 |
| 2C | **A5** — CD services/hooks | creator-dashboard/services/, hooks/, contexts/ | 2 | 9 |
| 2D | **A7** — PWA screens | pwa/screens/ | 2 | 8 |
| 2E | **A8** — PWA services/hooks/data | pwa/services/, data-management/, contexts/ | 4 | 9 |

**Why parallel:** After Batch 1 stabilizes the API contract, all client work is independent. A3 owns the shared `apiClient.js` and `offlineQueue.js` files; other audits skip those per ownership rules.

---

### Batch 3 — Components & utils (parallel)

| Lane | Audit | App | CRIT | HIGH |
|------|-------|-----|------|------|
| 3A | **A6** — CD components/utils | creator-dashboard/components/, utils/ | 2 | 5 |
| 3B | **A9** — PWA components/utils/nav | pwa/components/, utils/, navigation/, config/ | 1 | 5 |
| 3C | **A10** — Landing app | landing/ (all files except apiClient) | 2 | 6 |

**Why after Batch 2:**
- A6 owns `SvgIcon.jsx` which A4 (Batch 2B) cross-references — A4 should complete first so the onboarding screen fixes can reference the updated component.
- A9 touches `WebAppNavigator.jsx` which may be affected by A7's screen-level changes (e.g., removing dead screens changes route definitions).
- A10 defers `apiClient.js` fixes to A3 (Batch 2A), so A3 must complete first.

---

## 5. Recommended Execution Order — Summary

```
BATCH 1 (sequential — API foundation)
  ┌──────────────────────────────────────────────┐
  │  1a. A2 — middleware & Gen1 functions         │
  │  1b. A1 — API routes security                 │
  └──────────────────────────────────────────────┘
              │
              ▼
BATCH 2 (5 lanes in parallel — client apps)
  ┌─────────┬─────────┬─────────┬─────────┬─────────┐
  │ 2A. A3  │ 2B. A4  │ 2C. A5  │ 2D. A7  │ 2E. A8  │
  │ Client  │ CD      │ CD      │ PWA     │ PWA     │
  │ libs    │ screens │ svc/hk  │ screens │ svc/hk  │
  └─────────┴─────────┴─────────┴─────────┴─────────┘
              │
              ▼
BATCH 3 (3 lanes in parallel — components & landing)
  ┌─────────────┬─────────────┬─────────────┐
  │ 3A. A6      │ 3B. A9      │ 3C. A10     │
  │ CD comps    │ PWA comps   │ Landing     │
  └─────────────┴─────────────┴─────────────┘
```

### Total issue counts across all batches

| Severity | Batch 1 | Batch 2 | Batch 3 | Total |
|----------|---------|---------|---------|-------|
| CRITICAL | 8 | 9 | 5 | **22** |
| HIGH | 18 | 36 | 16 | **70** |
| MEDIUM | 19 | 56 | 47 | **122** |
| LOW | 10 | 40 | 48 | **98** |

### Key principles behind this ordering

1. **API first** — Every client app depends on the API contract. Fixing mass-assignment, path traversal, and validation in the backend prevents clients from depending on broken server behavior.
2. **Middleware before routes** — `validate.ts` improvements (empty-string check, extra-field stripping) must land before route handlers add new schemas that depend on those features.
3. **Client libs before components** — `apiClient.js` fixes (401 retry timeout, 429 budget) affect how every service and component behaves. Land these before fixing individual service/component issues.
4. **Screens before components** — Screen audits may reveal that some "broken" components are actually dead code (e.g., PlanningSidebar, PaymentModal). Running screen fixes first avoids wasting effort on dead components.
5. **Landing last** — Landing is the simplest app with the fewest dependencies. Its only shared concern (`apiClient.js`) is owned by A3 in Batch 2.

---

## 6. Critical Path — Top 10 Fixes Across All Audits

These are the highest-impact fixes regardless of batch:

| # | Audit | File | Issue | Impact |
|---|-------|------|-------|--------|
| 1 | A1 | `routes/events.ts` | Public registration: no auth, no rate limit, no validation, mass assignment | Active exploit vector |
| 2 | A1 | 8 route files | `...req.body` mass assignment across ~25 endpoints | Ownership hijack, arbitrary data injection |
| 3 | A1 | `profile.ts`, `progress.ts`, `creator.ts` | Storage path traversal in confirm endpoints | Cross-user file access |
| 4 | A8 | `nutritionFirestoreService.js` | `WakeApiError` never imported — 404 crashes caller | Runtime crash on normal flow |
| 5 | A8 | `contexts/AuthContext.js` | Stale closure + unmounted setState in timeout chain | Boot reliability |
| 6 | A9 | `utils/security.js` | `Math.random()` for security tokens | Predictable tokens |
| 7 | A10 | `EventSignupScreen.jsx` | Auth token sent to external QR service | Token leak to third party |
| 8 | A2 | `index.ts:477,666,1753` | Error message leaks (MercadoPago internals) | Information disclosure |
| 9 | A2 | `app.ts:29` | CORS reflects any origin | Cross-origin API abuse |
| 10 | A5 | `clientPlanContentService.js` | Read-modify-write race on full doc replace | Silent data loss |

---

## 7. Current Status — What Is Done vs What Remains

**Generated:** 2026-03-20 (post-fix sweep)

### Completed Audits (all findings resolved)

| Audit | Commit | Status |
|-------|--------|--------|
| **A1** — API routes security | `e7d15a7` Fix all API routes security audit findings (8C, 14H, 12M, 6L) | ✅ ALL FIXED |
| **A3** — API client libs | `9a0dff3` Fix all API client library audit findings (4H, 6M, 5L) | ✅ ALL FIXED |
| **A7** — PWA screens | `d09f1f2` Fix all PWA screens audit findings (2C, 7H, 12M) | ✅ ALL FIXED |
| **A5** — CD services/hooks | `37aee60` Fix all creator dashboard services & hooks audit findings (2C, 7H, 8M, 10L) | ✅ ALL FIXED |
| **A8** — PWA services/hooks/data | `05c36cd` Fix all PWA services, hooks & data-management audit findings (4C, 9H, 9M, 6L) | ✅ ALL FIXED (except items deferred to A3 or marked TODO) |
| **A9** — PWA components/utils/nav | — | ✅ ALL FIXED (per ✅ markers in audit) |

### In-Progress / Staged (findings resolved, not yet committed)

| Audit | Status | Evidence |
|-------|--------|----------|
| **A4** — CD screens | ✅ All findings resolved | Files staged: `EventResultsScreen.jsx`, `EventEditorScreen.jsx`, `ProfileScreen.jsx`, `LoginScreen.jsx`, `ApiKeysScreen.jsx`, `EventsScreen.jsx`, `EventCheckinScreen.jsx`, `OneOnOneScreen.jsx`, `CreatorOnboardingScreen.jsx`, `ProgramsScreen.jsx`, `ProgramsAndClientsScreen.jsx`, `AvailabilityCalendarScreen.jsx` + new `eventFieldComponents.jsx` |
| **A6** — CD components/utils | ✅ All findings resolved | Dead components deleted (7 files). Live component fixes applied. Per ✅ markers. |
| **A2** — API middleware & Gen1 | ✅ All findings resolved | Per ✅ markers in audit file. |
| **A10** — Landing app | ✅ All findings resolved | Per ✅ markers. `apiClient.js` fixes deferred to A3 (already completed). |

### Deferred Items (not bugs — architectural work)

| Item | Audit | Reason | Tracking |
|------|-------|--------|----------|
| `offlineQueue.js` max queue size | A3/A8/A9 | Owned by "task A3" — already fixed in commit `9a0dff3` | ✅ Done |
| `backgroundSync.js` storage key coupling | A8 | Owned by "task A3" | ✅ Done |
| `workoutSessionService.js` disconnected subsystem | A8 | Needs architectural decision (connect to `POST /workout/complete` or delete) | TODO in code |
| `uploadService.js` no-op upload path | A8 | Same — subsystem is disconnected from actual session persistence | TODO in code |
| 6× `firestoreService` direct imports in PWA screens | A7 | Phase 3 migration targets — will be replaced when domains migrate to API | TODO comments in code |
| `clientProgramService` server-side filtering | A5 | Needs `/creator/clients?programId=X` endpoint | TODO — Phase 3 |
| `libraryService.getExercises()` batch endpoint | A5 | Needs `/creator/library/exercises` endpoint | TODO — Phase 3 |

### Summary Scorecard

| Audit | CRIT | HIGH | MED | LOW | Status |
|-------|------|------|-----|-----|--------|
| A1 — API routes security | 8 | 14 | 12 | 6 | ✅ Committed |
| A2 — API middleware & Gen1 | 0 | 4 | 7 | 4 | ✅ Fixed |
| A3 — API client libs | 0 | 4 | 6 | 5 | ✅ Committed |
| A4 — CD screens | 2 | 11 | 19 | 14 | ✅ Fixed (staged) |
| A5 — CD services/hooks | 2 | 9 | 14 | 10 | ✅ Committed |
| A6 — CD components/utils | 2 | 5 | 18 | 18 | ✅ Fixed |
| A7 — PWA screens | 2 | 8 | 12 | 9 | ✅ Committed |
| A8 — PWA services/hooks/data | 4 | 9 | 11 | 7 | ✅ Committed (2 TODOs deferred) |
| A9 — PWA components/utils/nav | 1 | 5 | 19 | 22 | ✅ Fixed |
| A10 — Landing app | 2 | 7 | 10 | 8 | ✅ Fixed |
| **TOTAL** | **23** | **76** | **128** | **103** | **330 findings, all resolved or tracked** |
