# Wake — Full Codebase Cleanup & Documentation Plan

**Created:** 2026-02-22
**Skill to use:** `/cleanup-screen <target>`
**Goal:** Remove unused/dead code, mark mobile-only sections, add documentation comments, fix known web gaps — while preserving 100% of current functionality.

---

## Before You Start: Key Rules

1. **Never remove mobile-only code.** Mark it with `// [MOBILE-ONLY]` and preserve it.
2. **Never delete a screen file just because it looks unreferenced.** Route strings like `'WorkoutExecution'` are used dynamically.
3. **Never remove Firestore collection strings** — they are referenced as strings, not imports.
4. **AsyncStorage template keys** like `` `progress_${userId}_${courseId}` `` are runtime-generated — don't assume a key is unused just because you can't find its exact literal.
5. **Both `.js` and `.web.js` versions of a screen must be kept.** The web version is served on PWA; the native version is for future mobile builds.

---

## Investigation Findings (Pre-compiled)

These were discovered in a pre-audit investigation and inform the priorities below.

### A. Broken Web Features (actual bugs, not cosmetic)

| Issue | File | Lines | Status |
|---|---|---|---|
| `AppState.addEventListener()` used on web — session tracking (30-min timeout, cold start detection) silently fails on web | `data-management/appSessionManager.js` | 3, 100–116 | **Fix in Phase 0** |
| `Linking.canOpenURL()` always returns false on web — subscription management button shows error even for valid URLs | `screens/SubscriptionsScreen.js` | 246–248 | **Fix in Phase 0** |

### B. Intentionally Disabled / Gracefully Handled (do not touch)

| Feature | File | Status |
|---|---|---|
| File system / local media caching | `services/programMediaService.js` | Returns null stubs on web — correct |
| Google Sign-In | `services/googleAuthService.js` | Native uses `@react-native-google-signin`, web uses `signInWithPopup` — correct |
| Profile picture picker | `services/profilePictureService.js` | Native uses `expo-image-picker`, web uses HTML file input — correct |
| Video pause on app background | `screens/CourseDetailScreen.js` | Guarded with `isWeb` — correct |
| Apple Sign-In | `screens/ProfileScreen.js` | Intentionally disabled, throws user-facing error message |
| Firebase Crashlytics / Analytics | `services/monitoringService.js` | Silently no-ops on web — expected behavior |
| `react-native-linear-gradient` | `screens/CreatorProfileScreen.js` | Conditionally required, evaluates to null on web — correct |

### C. Unused / Potentially Unused npm Packages

#### PWA (`apps/pwa/`)

| Package | Finding | Recommended Action |
|---|---|---|
| `expo-sharing` | Zero references in source | Remove |
| `expo-video` | Zero references (`expo-av` is used instead) | Remove |
| `expo-crypto` | Zero references | Remove |
| `@sendgrid/mail` | Server-side only — should only be in Cloud Functions | Remove from PWA |
| `webidl-conversions` | Zero references, unclear purpose | Remove |
| `react-native-linear-gradient` | Zero standard import references (conditionally `require`d in 1 place) | Investigate before removing |
| `expo-constants` | Zero runtime references | Likely transitive Expo dep — check before removing |
| `expo-dev-client` | Build-time only, not runtime | Move to devDependencies |
| `react-native-worklets` | No direct imports | Likely peer dep of `react-native-reanimated` — do not remove |
| `typescript` | In `dependencies`, not `devDependencies`, and PWA is JS-only | Move to devDependencies |
| `@types/react` | In `dependencies` instead of `devDependencies` | Move to devDependencies |
| `recharts` | Only used in `NutritionScreen.web.jsx` (1 file) | Keep — it's used |
| `react-native-keyboard-aware-scroll-view` | Only 2 files | Keep — it's used |

#### Creator Dashboard (`apps/creator-dashboard/`)

| Package | Finding | Recommended Action |
|---|---|---|
| `lodash` | No imports found anywhere in source | Remove |
| `react-window` | Installed, never implemented | Remove |

#### Landing (`apps/landing/`)

| Package | Finding | Recommended Action |
|---|---|---|
| `firebase` | No imports found in landing src | Investigate — may be used indirectly; remove if confirmed unused |

### D. Orphaned / Empty Files

| File | Issue | Action |
|---|---|---|
| `services/notificationService.js` | 0 lines — completely empty | Delete |
| `utils/useAuthGuard.js` | 0 lines — completely empty | Delete |
| `navigation/WebAppNavigator.test1.jsx` | 36 lines — appears to be a scratch/test artifact | Review and delete if confirmed |
| `screens/BibliotecaScreen.css` | CSS with no matching `.jsx` | Investigate — might be for a renamed/deleted screen |
| `screens/CoursePurchaseScreen.css` | CSS with no matching `.jsx` | Investigate — might be for a renamed/deleted screen |
| `screens/LibrariesScreen.css` | CSS with no matching `.jsx` | Investigate |
| `screens/UserOnboardingScreen.css` | CSS with no matching `.jsx` | Investigate |

*(All creator-dashboard paths above are relative to `apps/creator-dashboard/src/`)*

### E. Dynamic References (Static Scanners Would Miss These)

The `/cleanup-screen` skill is already aware of these, but document them here for reference:

- **25 native navigation route strings:** `'MainScreen'`, `'CourseDetail'`, `'WorkoutExecution'`, `'DailyWorkout'`, `'Sessions'`, `'WorkoutExercises'`, `'WorkoutCompletion'`, `'WarmupScreen'`, `'PRsScreen'`, `'ProfileScreen'`, `'AllPurchasedCourses'`, `'CourseStructure'`, `'SessionDetail'`, `'ExerciseDetail'`, `'ExerciseHistory'`, `'ExercisePanel'`, `'Library'`, `'ProgramLibrary'`, `'CreatorProfile'`, `'Subscriptions'`, `'UpcomingCallDetail'`, `'Warmup'`, `'WeeklyVolumeHistory'`, `'OnboardingQuestion2–5'`
- **12 web route strings:** `/`, `/profile`, `/library`, `/nutrition`, `/progress`, `/prs`, `/sessions`, `/subscriptions`, `/volume`, `/warmup`, `/onboarding/questions`, `/courses`
- **20+ Firestore collection strings** across 8 service files
- **Template-literal AsyncStorage keys:** `` `profile_${userId}` ``, `` `progress_${userId}_${courseId}` ``, `` `onboarding_status_${uid}` ``, `` `pending_session_${sessionId}` ``

---

## Phase 0 — One-Time Pre-Cleanup Tasks
*Do these manually (not via `/cleanup-screen`) before starting the phased work.*

### 0.1 Fix broken web features (2 actual bugs)

**Bug 1 — AppState on web (`data-management/appSessionManager.js`)**
The service imports `AppState` from React Native and calls `AppState.addEventListener()` unconditionally. On web, `AppState` does not exist. The session tracking (30-min background timeout, cold start detection) silently breaks.
- Fix: Wrap the `AppState` usage in a platform check. If `Platform.OS === 'web'`, skip the AppState listener entirely or use `document.addEventListener('visibilitychange', ...)` as a web equivalent.

**Bug 2 — Linking.canOpenURL on web (`screens/SubscriptionsScreen.js`)**
`Linking.canOpenURL()` always returns false in browsers. The current code checks `canOpen` before calling `Linking.openURL()`, meaning the subscription management URL never opens on web.
- Fix: On web, skip the `canOpenURL()` check and call `Linking.openURL()` directly (or use `window.open()`).

### 0.2 Delete empty files

```bash
# Review and delete these:
apps/pwa/src/services/notificationService.js       # 0 lines
apps/pwa/src/utils/useAuthGuard.js                 # 0 lines
apps/pwa/src/navigation/WebAppNavigator.test1.jsx  # scratch file — review first
```

### 0.3 Investigate orphaned CSS files (creator-dashboard)

Check whether these CSS files are referenced by any JSX file. If not, delete them:
- `apps/creator-dashboard/src/screens/BibliotecaScreen.css`
- `apps/creator-dashboard/src/screens/CoursePurchaseScreen.css`
- `apps/creator-dashboard/src/screens/LibrariesScreen.css`
- `apps/creator-dashboard/src/screens/UserOnboardingScreen.css`

### 0.4 Remove unused packages

**PWA — safe to remove (confirm with build first):**
```bash
cd apps/pwa
npm uninstall expo-sharing expo-video expo-crypto @sendgrid/mail webidl-conversions
```

**PWA — investigate before removing:**
- `expo-constants` — check if any Expo internal depends on it
- `react-native-linear-gradient` — only conditionally `require()`d in `CreatorProfileScreen.js`; if web never loads it, may be safe to remove from PWA

**PWA — move to devDependencies:**
- `typescript`, `@types/react`, `expo-dev-client`

**Creator Dashboard:**
```bash
cd apps/creator-dashboard
npm uninstall lodash react-window
```

**Landing:**
```bash
# Investigate first:
grep -r "firebase" apps/landing/src/ --include="*.js" --include="*.jsx"
# If nothing found:
cd apps/landing && npm uninstall firebase
```

### 0.5 Create the audit-reports directory

```bash
mkdir -p apps/pwa/audit-reports
mkdir -p apps/creator-dashboard/audit-reports
mkdir -p apps/landing/audit-reports
```

---

## Phase 1 — PWA: Shared Foundation
*Run `/cleanup-screen` on shared files that all screens depend on. Cleaning these first means every subsequent screen audit starts from a clean baseline.*

### Order:

| Step | Target | Why First |
|---|---|---|
| 1.1 | `src/config/firebase.js` | Every service imports this |
| 1.2 | `src/config/environment.js` | Platform/env flags used everywhere |
| 1.3 | `src/config/fonts.js` + `fonts.web.js` | Loaded at app root |
| 1.4 | `src/utils/logger.js` | Every file uses this — sets the pattern |
| 1.5 | `src/utils/platform.js` | `isWeb`, `isExpoGo` used in ~every screen |
| 1.6 | `src/utils/errorHandler.js` | Used by services and screens |
| 1.7 | `src/utils/security.js` | Auth-related utils |
| 1.8 | `src/utils/cache.js` | Cache helpers used by services |
| 1.9 | `src/utils/dataValidation.js` | Used by multiple screens |
| 1.10 | `src/utils/validation.js` | Form validation utils |
| 1.11 | `src/utils/webUtils.js` | Web-specific helpers |
| 1.12 | `src/utils/authStorage.js` | Auth token storage |
| 1.13 | `src/utils/storageAdapter.js` | AsyncStorage wrapper |
| 1.14 | `src/utils/weekCalculation.js` | Used in workout/session screens |
| 1.15 | `src/utils/sessionFilter.js` | Session filtering logic |
| 1.16 | `src/utils/roleHelper.js` | User role checks |
| 1.17 | `src/utils/responsiveStyles.js` | PWA layout helpers |
| 1.18 | `src/utils/muscleColorUtils.js` | Chart color logic |
| 1.19 | `src/utils/durationHelper.js` | Time formatting |
| 1.20 | `src/utils/notificationUtils.js` | Notification helpers |
| 1.21 | `src/utils/withErrorBoundary.js` | HOC used in navigation |
| 1.22 | `src/utils/freezeDetector.js` | UI hang detection |
| 1.23 | `src/utils/layoutViewportDimensions.web.js` | Web viewport hooks |
| 1.24 | `src/utils/safariVideoOverlayDebug.web.js` | Safari-specific debug |
| 1.25 | `src/contexts/AuthContext.js` | Core auth state, used everywhere |
| 1.26 | `src/contexts/UserRoleContext.js` | Role-based access |
| 1.27 | `src/contexts/VideoContext.js` | Video playback state |

---

## Phase 2 — PWA: Core Services
*Services are the backbone. Audit them before the screens that call them.*

### Order:

| Step | Target | Lines | Why This Priority |
|---|---|---|---|
| 2.1 | `services/firestoreService.js` | 2254 | Foundation — all data goes through here |
| 2.2 | `services/hybridDataService.js` | 542 | Most screens call this |
| 2.3 | `services/authService.js` | 250 | Auth flow |
| 2.4 | `services/googleAuthService.js` | 308 | Google auth |
| 2.5 | `services/appleAuthService.js` | 409 | Apple auth |
| 2.6 | `services/purchaseService.js` | 464 | Payments, subscriptions |
| 2.7 | `services/sessionService.js` | 1308 | Workout execution core |
| 2.8 | `services/sessionManager.js` | 1035 | Session state management |
| 2.9 | `services/nutritionFirestoreService.js` | 184 | Nutrition data |
| 2.10 | `services/nutritionApiService.js` | 53 | FatSecret proxy |
| 2.11 | `services/libraryResolutionService.js` | 558 | Program content resolution |
| 2.12 | `services/consolidatedDataService.js` | 247 | Multi-source aggregation |
| 2.13 | `services/exerciseHistoryService.js` | 533 | PR/history tracking |
| 2.14 | `services/userProgressService.js` | 129 | Progress data |
| 2.15 | `services/oneRepMaxService.js` | 512 | 1RM calculations |
| 2.16 | `services/profilePictureService.js` | 321 | Profile image (has web/native split) |
| 2.17 | `services/networkService.js` | 381 | Online/offline detection |
| 2.18 | `services/webStorageService.js` | 434 | Web localStorage wrapper |
| 2.19 | `services/storageService.js` | 56 | AsyncStorage abstraction |
| 2.20 | `services/monitoringService.js` | 158 | Crash/error reporting |
| 2.21 | `services/programMediaService.js` | 292 | Media paths (stubbed on web) |
| 2.22 | `services/callBookingService.js` | 223 | Call booking |
| 2.23 | `services/tutorialManager.js` | 239 | Tutorial overlay logic |
| 2.24 | `services/appResourcesService.js` | 206 | Public app assets |
| 2.25 | `services/disciplineImagesService.js` | 126 | Discipline image cache |
| 2.26 | `services/videoCacheService.js` | 160 | Video URL caching |
| 2.27 | `services/assetBundleService.js` | 279 | Asset bundle management |
| 2.28 | `services/heroImagesService.js` | 34 | Hero image fetching |
| 2.29 | `services/exerciseLibraryService.js` | 160 | Exercise library access |
| 2.30 | `services/muscleVolumeInfoService.js` | 63 | Muscle volume metadata |
| 2.31 | `services/objectivesInfoService.js` | 84 | Objectives metadata |
| 2.32 | `services/purchaseEventManager.js` | 54 | Purchase event bus |
| 2.33 | `services/updateEventManager.js` | 51 | Update event bus |

---

## Phase 3 — PWA: Data Management
*These are the mobile-offline-first services — highest concentration of mobile-only patterns.*

| Step | Target | Lines | Notes |
|---|---|---|---|
| 3.1 | `data-management/appSessionManager.js` | 149 | Has the AppState web bug — fix already applied in Phase 0 |
| 3.2 | `data-management/workoutSessionService.js` | 507 | Session state persistence |
| 3.3 | `data-management/workoutProgressService.js` | 877 | Progress tracking |
| 3.4 | `data-management/uploadService.js` | 367 | Session upload queue |
| 3.5 | `data-management/sessionRecoveryService.js` | 313 | Crash recovery |
| 3.6 | `data-management/progressQueryService.js` | 318 | Progress queries |
| 3.7 | `data-management/localCourseCache.js` | 435 | Local program cache |
| 3.8 | `data-management/simpleCourseCache.js` | 138 | Simplified cache variant |
| 3.9 | `data-management/storageManagementService.js` | 330 | Storage quota/cleanup |
| 3.10 | `data-management/courseDownloadService.js` | 1275 | Full program downloader — heavy mobile-only patterns |

---

## Phase 4 — PWA: Navigation
*The navigation layer wires everything together — audit before screens.*

| Step | Target | Lines | Notes |
|---|---|---|---|
| 4.1 | `navigation/WebAppNavigator.jsx` | 736 | Web PWA entry point — most important |
| 4.2 | `navigation/AppNavigator.js` | 169 | Native app root |
| 4.3 | `navigation/MainTabNavigator.js` | 144 | Native tab navigation |
| 4.4 | `navigation/MainStackNavigator.js` | 48 | Native stack |
| 4.5 | `navigation/OnboardingNavigator.js` | 141 | Onboarding flow |
| 4.6 | `navigation/AuthNavigator.js` | 23 | Auth routing |
| 4.7 | `navigation/ProfileStackNavigator.js` | 40 | Profile stack |
| 4.8 | `App.web.js` | 865 | PWA root — initializes everything |

---

## Phase 5 — PWA: Shared Components
*Audit components before screens so screen audits are not confused by shared component issues.*

### 5A — Icon System

| Step | Target | Notes |
|---|---|---|
| 5A.1 | `components/icons/index.js` | Main icon exports — check for unused exports |
| 5A.2 | `components/icons/` (all SVG icon components) | Quick scan for any that are imported but never used in screens |
| 5A.3 | `components/icons/vectors_fig/` (all categories) | Same — check for orphaned icon components |
| 5A.4 | `components/Icon.js` | Icon wrapper component |

### 5B — Foundation Components

| Step | Target | Lines |
|---|---|---|
| 5B.1 | `components/LoadingSpinner.js` | 32 |
| 5B.2 | `components/Text.js` | 71 |
| 5B.3 | `components/Button.js` | 152 |
| 5B.4 | `components/TextInput.js` | 22 |
| 5B.5 | `components/Input.js` | 171 |
| 5B.6 | `components/Input.fixed.js` | 167 |
| 5B.7 | `components/Input.simple.js` | 127 |
| 5B.8 | `components/BackButton.js` | 40 |
| 5B.9 | `components/ErrorBoundary.js` | 159 |
| 5B.10 | `components/KeyboardAwareView.js` | 74 |

### 5C — Navigation / Layout Components

| Step | Target | Lines |
|---|---|---|
| 5C.1 | `components/BottomSpacer.js` + `BottomSpacer.web.jsx` | 17 + 24 |
| 5C.2 | `components/BottomTabBar.web.js` | 289 |
| 5C.3 | `components/BottomNavigation.web.jsx` | 121 |
| 5C.4 | `components/WakeHeader.js` + `WakeHeader.web.js` + `WakeHeader.web.jsx` | 260 + 4 + 288 |
| 5C.5 | `components/WakeDebugPanel.web.jsx` | 63 |

### 5D — Video Wrappers (web-specific)

| Step | Target | Lines |
|---|---|---|
| 5D.1 | `components/VideoCardWebWrapper.js` + `.web.js` | 5 + 30 |
| 5D.2 | `components/VideoOverlayWebWrapper.js` + `.web.js` | 5 + 28 |
| 5D.3 | `hooks/usePlatformVideoPlayer.js` | 29 |

### 5E — Data Visualization Components

| Step | Target | Lines |
|---|---|---|
| 5E.1 | `components/VolumeChart.js` | 132 |
| 5E.2 | `components/PRHistoryChart.js` | 305 |
| 5E.3 | `components/WeeklyVolumeTrendChart.js` | 202 |
| 5E.4 | `components/ExerciseProgressChart.js` | 705 |
| 5E.5 | `components/MuscleVolumeStats.js` | 623 |
| 5E.6 | `components/WeeklyMuscleVolumeCard.js` | 256 |
| 5E.7 | `components/SessionMuscleVolumeCard.js` | 86 |
| 5E.8 | `components/RepEstimatesCard.js` | 111 |
| 5E.9 | `components/PeriodFilter.js` | 226 |
| 5E.10 | `components/MuscleSilhouette.js` | 418 |
| 5E.11 | `components/MuscleSilhouetteSVG.js` | 429 |
| 5E.12 | `components/WorkoutMuscleSVG.js` | 78 |

### 5F — Modal / Overlay Components

| Step | Target | Lines |
|---|---|---|
| 5F.1 | `components/InsightsModal.js` | 152 |
| 5F.2 | `components/ExerciseDetailModal.js` | 203 |
| 5F.3 | `components/ExerciseDetailContent.js` | 722 |
| 5F.4 | `components/ExerciseHistoryCard.js` | 306 |
| 5F.5 | `components/BookCallSlotModal.js` | 707 |
| 5F.6 | `components/TutorialOverlay.js` | 592 |

### 5G — Miscellaneous Components

| Step | Target | Lines |
|---|---|---|
| 5G.1 | `components/WorkoutHorizontalCards.js` | 69 |
| 5G.2 | `components/WorkoutTopCardSection.js` | 69 |
| 5G.3 | `components/WorkoutExerciseList.js` | 12 |
| 5G.4 | `components/EpaycoWebView.js` | 391 |
| 5G.5 | `components/LegalDocumentsWebView.js` | 265 |
| 5G.6 | `hooks/useFrozenBottomInset.web.js` | 12 |
| 5G.7 | `hooks/useStableLayoutHeight.web.js` | 19 |

---

## Phase 6 — PWA: Screens

*Ordered from smallest/simplest to largest. Each screen should be run as: `/cleanup-screen ScreenName`*

*For screens that have both `.js` and `.web.js` versions, the skill will read both. Run the skill once per screen (not once per file).*

### 6A — Simple Screens (< 200 lines)

| Step | Target | Lines (native + web) | Notes |
|---|---|---|---|
| 6A.1 | `LoadingScreen` | 43 | Entry loading state |
| 6A.2 | `PRDetailScreen` | 127 + 99 | Single PR display |
| 6A.3 | `WeeklyVolumeHistoryScreen` | 634 + 38 | Volume chart view |
| 6A.4 | `UpcomingCallDetailScreen` | 516 + 29 | Call detail page — has Linking bug fixed in Phase 0 |
| 6A.5 | `CommunityScreen` | 161 | Likely placeholder or minimal |
| 6A.6 | `SessionsScreen` (web wrapper) | 47 web | Small web wrapper |

### 6B — Onboarding Flow

| Step | Target | Lines | Notes |
|---|---|---|---|
| 6B.1 | `OnboardingScreen.js` | 2200 | Main onboarding container |
| 6B.2 | `onboarding/OnboardingQuestion1.js` | 312 | First question |
| 6B.3 | `onboarding/OnboardingQuestion2.js` | 315 | Second question |
| 6B.4 | `onboarding/OnboardingQuestion3.js` | 262 | Third question |
| 6B.5 | `onboarding/OnboardingQuestion4.js` | 268 | Fourth question |
| 6B.6 | `onboarding/OnboardingQuestion5.js` | 274 | Fifth question |
| 6B.7 | `onboarding/OnboardingComplete.js` | 139 | Completion screen |

### 6C — Authentication

| Step | Target | Lines | Notes |
|---|---|---|---|
| 6C.1 | `LoginScreen` | 723 + 163 web | Auth entry — has both native and web versions |

### 6D — Medium Screens (200–700 lines native)

| Step | Target | Lines (native + web) | Notes |
|---|---|---|---|
| 6D.1 | `CourseStructureScreen` | 464 + 122 | Program structure tree |
| 6D.2 | `SessionDetailScreen` | 421 + 54 | Single session view |
| 6D.3 | `WarmupScreen` | 787 + 99 | Pre-workout warmup |
| 6D.4 | `PRsScreen` | 580 + 104 | All PRs list |
| 6D.5 | `WorkoutExercisesScreen` | 929 + 122 | Exercise list in session |
| 6D.6 | `SessionsScreen` | 662 + 47 | Session history |

### 6E — Large Screens (700–2000 lines native)

| Step | Target | Lines (native + web) | Notes |
|---|---|---|---|
| 6E.1 | `InstallScreen.web.jsx` | 778 | PWA install prompt (web-only) |
| 6E.2 | `AllPurchasedCoursesScreen` | 675 + 55 | Course library |
| 6E.3 | `SubscriptionsScreen` | 1240 + 58 | Has Linking bug fixed in Phase 0 |
| 6E.4 | `ProgramLibraryScreen` | 1531 + 53 | Full program browser |
| 6E.5 | `NutritionScreen` | 947 native + 1064 web | Both versions are large — run together |
| 6E.6 | `DailyWorkoutScreen` | 2075 + 135 | Today's workout overview |
| 6E.7 | `MainScreen` | 1734 + 53 | App home/dashboard |

### 6F — Giant Screens (2000+ lines)

*These are the most complex files. Run them after you've established the cleanup pattern from smaller screens.*

| Step | Target | Lines | Notes |
|---|---|---|---|
| 6F.1 | `WorkoutCompletionScreen` | 2069 + 62 | Post-workout summary |
| 6F.2 | `ProfileScreen` | 2390 + 62 | User profile (has Apple auth disabled) |
| 6F.3 | `CourseDetailScreen` | 2600 + 181 | Program detail page |
| 6F.4 | `CreatorProfileScreen` | 3465 + 103 | Creator public profile |
| 6F.5 | `WorkoutExecutionScreen` | 6743 + 75 + styles (2561) | **Largest file in project** — plan for multiple sessions |

> **Note on `WorkoutExecutionScreen`:** At 6743 lines + 2561 lines of styles, this is a day-long audit by itself. Consider splitting it into two sessions: one for the main screen logic, one for the styles file.

---

## Phase 7 — Creator Dashboard: Shared Foundation

| Step | Target | Lines | Notes |
|---|---|---|---|
| 7.1 | `src/config/firebase.js` | — | Same pattern as PWA |
| 7.2 | `utils/durationHelper.js` | 125 | Time helpers |
| 7.3 | `utils/weekCalculation.js` | 109 | Week calculation |
| 7.4 | `utils/muscleColorUtils.js` | 33 | Color utils |
| 7.5 | `utils/plannedVolumeUtils.js` | 86 | Volume math |
| 7.6 | `utils/libraryIcons.jsx` | 73 | Icon map |
| 7.7 | `utils/autoLogin.js` | 124 | Dev auto-login |

---

## Phase 8 — Creator Dashboard: Services

| Step | Target | Lines | Notes |
|---|---|---|---|
| 8.1 | `services/firestoreService.js` | 228 | Core data layer |
| 8.2 | `services/authService.js` | 106 | Auth |
| 8.3 | `services/googleAuthService.js` | 98 | Google auth |
| 8.4 | `services/appleAuthService.js` | 109 | Apple auth |
| 8.5 | `services/programService.js` | 2211 | Program CRUD — largest service |
| 8.6 | `services/libraryService.js` | 1627 | Exercise/session library |
| 8.7 | `services/programAnalyticsService.js` | 1307 | Program analytics |
| 8.8 | `services/clientProgramService.js` | 933 | Client-assigned programs |
| 8.9 | `services/plansService.js` | 688 | Nutrition plans |
| 8.10 | `services/clientPlanContentService.js` | 553 | Client plan content |
| 8.11 | `services/clientSessionContentService.js` | 328 | Client session content |
| 8.12 | `services/clientSessionService.js` | 330 | Client sessions |
| 8.13 | `services/oneOnOneService.js` | 337 | One-on-one management |
| 8.14 | `services/propagationService.js` | 334 | Content propagation |
| 8.15 | `services/purchaseService.js` | 317 | Payments |
| 8.16 | `services/availabilityService.js` | 128 | Call availability |
| 8.17 | `services/callBookingService.js` | 66 | Bookings |
| 8.18 | `services/nutritionFirestoreService.js` | 248 | Nutrition data |
| 8.19 | `services/nutritionApiService.js` | 58 | FatSecret proxy |
| 8.20 | `services/cardService.js` | 192 | Creator card data |
| 8.21 | `services/courseService.js` | 80 | Course access |
| 8.22 | `services/creatorMediaService.js` | 139 | Creator media |
| 8.23 | `services/profilePictureService.js` | 142 | Profile image |
| 8.24 | `services/clientNutritionPlanContentService.js` | 111 | Client nutrition content |
| 8.25 | `services/creatorFeedbackService.js` | 96 | Feedback |
| 8.26 | `services/measureObjectivePresetsService.js` | 121 | Measure/objective presets |

---

## Phase 9 — Creator Dashboard: Hooks

| Step | Target | Lines |
|---|---|---|
| 9.1 | `hooks/useProgramRealtime.js` | 427 |
| 9.2 | `hooks/usePrograms.js` | 397 |

---

## Phase 10 — Creator Dashboard: Components

| Step | Target | Lines | Notes |
|---|---|---|---|
| 10.1 | `components/SvgIcon.jsx` | 29 | Icon wrapper |
| 10.2 | `components/Button.jsx` | 86 | Core button |
| 10.3 | `components/Input.jsx` | 31 | Core input |
| 10.4 | `components/Modal.jsx` | 33 | Modal shell |
| 10.5 | `components/ProtectedRoute.jsx` | 69 | Auth guard |
| 10.6 | `components/StickyHeader.jsx` | 151 | Sticky page header |
| 10.7 | `components/DashboardLayout.jsx` | 410 | Main layout shell |
| 10.8 | `components/PlanStructureSidebar.jsx` | 123 | Plan sidebar |
| 10.9 | `components/PlansSidebar.jsx` | 128 | Plans list sidebar |
| 10.10 | `components/PlanningLibrarySidebar.jsx` | 273 | Planning library |
| 10.11 | `components/PlanningSidebar.jsx` | 285 | Planning sidebar |
| 10.12 | `components/FindUserModal.jsx` | 196 | User search modal |
| 10.13 | `components/FeedbackModal.jsx` | 179 | Feedback modal |
| 10.14 | `components/MediaPickerModal.jsx` | 148 | Media picker |
| 10.15 | `components/PaymentModal.jsx` | 147 | Payment modal |
| 10.16 | `components/PlanningModal.jsx` | 69 | Planning modal |
| 10.17 | `components/PropagateChangesModal.jsx` | 120 | Propagation confirm |
| 10.18 | `components/PropagateNavigateModal.jsx` | 129 | Propagation navigation |
| 10.19 | `components/SessionAssignmentModal.jsx` | 230 | Session assign |
| 10.20 | `components/SessionCreationModal.jsx` | 261 | Session create |
| 10.21 | `components/SessionPerformanceModal.jsx` | 408 | Session performance |
| 10.22 | `components/AssignProgramModal.jsx` | 214 | Program assign |
| 10.23 | `components/DatePicker.jsx` | 379 | Date picker |
| 10.24 | `components/MuscleSilhouetteSVG.jsx` | 333 | Muscle diagram |
| 10.25 | `components/WeekVolumeDrawer.jsx` | 378 | Volume drawer |
| 10.26 | `components/SortableModuleCard.jsx` | 84 | DnD module card |
| 10.27 | `components/PlanWeeksGrid.jsx` | 629 | Plan weeks grid |
| 10.28 | `components/ProgramWeeksGrid.jsx` | 925 | Program weeks grid |
| 10.29 | `components/CalendarView.jsx` | 1204 | Full calendar |
| 10.30 | `components/ContentManager/ContentManager.jsx` | 599 | Content drag-and-drop |
| 10.31 | `components/MeasuresObjectivesEditorModal.jsx` | 361 | Measures editor |

---

## Phase 11 — Creator Dashboard: Screens

### 11A — Small Screens

| Step | Target | Lines |
|---|---|---|
| 11A.1 | `DashboardScreen.jsx` | 38 |
| 11A.2 | `ProgramsAndClientsScreen.jsx` | 110 |
| 11A.3 | `PlanSessionDetailScreen.jsx` | 137 |
| 11A.4 | `CreateLibraryModuleScreen.jsx` | 143 |
| 11A.5 | `onboarding/OnboardingComplete.jsx` | 37 |
| 11A.6 | `onboarding/OnboardingQuestion1–5.jsx` | 108–164 each |

### 11B — Medium Screens

| Step | Target | Lines |
|---|---|---|
| 11B.1 | `NutritionScreen.jsx` | 354 |
| 11B.2 | `LoginScreen.jsx` | 530 |
| 11B.3 | `OneOnOneScreen.jsx` | 496 |
| 11B.4 | `AvailabilityDayScreen.jsx` | 210 |
| 11B.5 | `CreatorOnboardingScreen.jsx` | 399 |
| 11B.6 | `CreateLibrarySessionScreen.jsx` | 260 |
| 11B.7 | `LibraryManagementScreen.jsx` | 328 |
| 11B.8 | `ProductsScreen.jsx` | 224 |

### 11C — Large Screens

| Step | Target | Lines |
|---|---|---|
| 11C.1 | `PlanDetailScreen.jsx` | 507 |
| 11C.2 | `LibraryModuleDetailScreen.jsx` | 562 |
| 11C.3 | `LabScreen.jsx` | 631 |
| 11C.4 | `MealEditorScreen.jsx` | 753 |
| 11C.5 | `ProfileScreen.jsx` | 1224 |
| 11C.6 | `ContentHubScreen.jsx` | 1019 |
| 11C.7 | `AvailabilityCalendarScreen.jsx` | 993 |
| 11C.8 | `PlanEditorScreen.jsx` | 1492 |

### 11D — Giant Screens

| Step | Target | Lines |
|---|---|---|
| 11D.1 | `LibraryExercisesScreen.jsx` | 2024 |
| 11D.2 | `ClientProgramScreen.jsx` | 2368 |
| 11D.3 | `LibrarySessionDetailScreen.jsx` | 3986 |
| 11D.4 | `LibraryContentScreen.jsx` | 3736 |
| 11D.5 | `ProgramDetailScreen.jsx` | 9088 | **Largest in creator dashboard** |
| 11D.6 | `ProgramsScreen.jsx` | 1263 |

---

## Phase 12 — Landing App

The landing app is simple. Run all in one session.

| Step | Target | Lines |
|---|---|---|
| 12.1 | `config/firebase.js` | 20 |
| 12.2 | `services/heroImagesService.js` | 49 |
| 12.3 | `components/Header.jsx` | 132 |
| 12.4 | `components/Footer.jsx` | 31 |
| 12.5 | `screens/CreatorsPage.jsx` | 12 |
| 12.6 | `screens/LegalDocumentsScreen.jsx` | 129 |
| 12.7 | `screens/SupportScreen.jsx` | 334 |
| 12.8 | `main.jsx` | 10 |
| 12.9 | `App.jsx` | 433 |

---

## Summary: Total File Count

| App | Files to audit | Approximate total lines |
|---|---|---|
| PWA — utils/config/contexts | 27 files | ~4,000 lines |
| PWA — services | 33 files | ~12,000 lines |
| PWA — data-management | 10 files | ~5,000 lines |
| PWA — navigation | 8 files | ~2,300 lines |
| PWA — components | ~55 files | ~14,000 lines |
| PWA — screens | ~50 files (native + web pairs) | ~45,000 lines |
| Creator Dashboard | ~80 files | ~50,000 lines |
| Landing | 9 files | ~1,500 lines |
| **Total** | **~272 files** | **~133,000 lines** |

---

## Tips

- **Run one `/cleanup-screen` per session.** Do not queue multiple in a row without reviewing the output first.
- **Review each audit report** before asking to apply changes. The report is your safety net.
- **Start with Phase 0** — fixing the two web bugs and deleting empty files is a 10-minute win with zero risk.
- **The giant screens (WorkoutExecutionScreen, ProgramDetailScreen)** should each be split across multiple sessions. Do not attempt those in a single pass.
- **After every apply**, do a quick manual test of that screen in the browser before moving on.
- **The order matters.** Auditing a service before the screen that uses it means you won't have to revisit the service's issues when you're looking at the screen.
