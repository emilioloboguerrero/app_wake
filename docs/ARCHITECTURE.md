# Wake Architecture

System map for the Wake monorepo, kept current as the canonical reference. Phases 1–7 of the native app revival (see `docs/superpowers/specs/2026-08-07-native-app-revival-design.md`) update this doc as their exit criterion — do not let it drift from the code.

---

## 1. Apps and entry points

| App | Path | Stack | Base | Entry |
|---|---|---|---|---|
| Landing | `apps/landing/` | Vite + React 18, JS | `/` | `npm run build` (Vite) |
| PWA | `apps/pwa/` | Expo SDK 54, React Native 0.81.5, React 19, JS | `/app` (web) | `index.js` — `Platform.OS === 'web'` branch: web loads `src/App.web.js`, native loads `App.js` (Expo's default entry is `index.js`, so the branch happens there instead of relying on `index.web.js`) |
| Creator Dashboard | `apps/creator-dashboard/` | Vite + React 18, JS | `/creators` | `npm run build` (Vite) |
| Functions | `functions/` | TypeScript, Node 22, Firebase Functions v1 (Gen1 exports) + v2 (`api` Express app) | — | `functions/src/index.ts` (all exports) |

Landing, PWA, and creator dashboard build to `hosting/` and deploy as a single Firebase Hosting site (`scripts/assemble-hosting.js`). Functions deploy separately via `firebase deploy --only functions`.

---

## 2. PWA provider tree (both platforms)

Native (`apps/pwa/App.js`) and web (`apps/pwa/src/App.web.js`) mount the same core provider stack — this parity was established in Phase 0a (native previously lacked React Query persistence and safe-area context entirely):

```
ErrorBoundary
  PersistQueryClientProvider (queryClient + persistOptions)
    SafeAreaProvider
      AuthProvider
        ActivityStreakProvider
          VideoProvider
            AppNavigator (native) / WebAppNavigator (web)
```

**Rule: `App.js` and `App.web.js` must keep provider parity for this core stack.** A provider added to one platform's root belongs in the other's too, unless it depends on a platform-only capability (see below) — in which case it's a sanctioned platform-split addition, not a silent divergence.

**Sanctioned web-only additions**, layered around/outside the shared core because they depend on browser APIs or web-only UX: `BrowserRouter` (outermost — web routing), `OfflineBanner`, `FrozenBottomWrapper`, `WakeDebugPanel`, `VideoUploadProvider` (video upload flow doesn't exist natively), and `StatusBar`/`VideoUploadStatusPill` placement driven by lazy-loaded web chunks. These are why `App.web.js`'s JSX looks deeper than `App.js` — the core five providers are still present and in the same relative order inside it.

**Query persistence is platform-split by storage backend**, not by policy — same cache key, max age, and buster, different underlying store:
- `apps/pwa/src/config/queryPersistence.js` (native) — `@react-native-async-storage/async-storage`, `STORAGE_KEY = 'wake-react-query-cache'`, `MAX_AGE_MS = 24h`.
- `apps/pwa/src/config/queryPersistence.web.js` (web) — `idb-keyval` (IndexedDB), same key and max age; also exports `initQueryPersistence()` used by the sync-mounted web root.
- Both persisters JSON-round-trip the client (`JSON.parse(JSON.stringify(...))`) before storing — `apiService._wrapTimestamp` attaches `toDate`/`toMillis` closures to cached objects, and IndexedDB's structured clone rejects functions outright; the round-trip strips them so callers checking `typeof x.toDate === 'function'` fall through safely on restore. Both sides share the same `BUSTER` string (`api-migration-v8-idb-clone-fix`) — bump it in both files together when the cache shape changes.

---

## 3. Navigation shells

Two independent navigation trees, one per platform — this is a sanctioned split, not a gap to close by unifying them.

**Web — React Router**, `apps/pwa/src/navigation/WebAppNavigator.jsx`: ~35 routes under `<Routes>`, most wrapped in `AuthenticatedLayout` (auth gate, onboarding redirect, readiness modal, portal-mounted `BottomTabBar`). A handful bypass the auth gate for email-CTA and payment-redirect landings (`/library/manage/:courseId`, `/course/:courseId`, `/bundle/:bundleId`, `/video-exchange/:exchangeId` via `UnauthAccessGate`; `/payment/success`, `/payment/cancelled` fully public). `/login` and `/email-link` are isolated outside the layout entirely.

**Native — React Navigation**, stack-of-stacks:
```
AppNavigator (root Stack: auth gate + onboarding gate — one of five mutually exclusive screens)
  Auth              → AuthNavigator → LoginScreen
  OnboardingProfile → OnboardingScreen (base profile step)
  Onboarding        → OnboardingNavigator → OnboardingQuestion1–7, OnboardingComplete
  MainApp           → MainTabNavigator (bottom tabs: Main, Profile)
    MainStackNavigator     → MainScreen, ProgramLibrary, CourseDetail, CreatorProfile,
                              DailyWorkout, Warmup, WorkoutExecution, WorkoutCompletion,
                              CourseStructure, UpcomingCallDetail
    ProfileStackNavigator  → ProfileHome, AllPurchasedCourses, Subscriptions, CourseDetail,
                              ExercisePanel (PRs), ExerciseDetail (PRDetail),
                              WeeklyVolumeHistory, Sessions, SessionDetail
```

**Route-parity rule (spec §4): every web route gets a native registration.** Native is currently behind. Screens reachable on web with **no native route at all** (per the Phase 0 audit): **Nutrition, Lab, Support, Bundles, Resources, VideoExchange, Events management/checkin/registrations**. Their screens live in `WebAppNavigator.jsx` only, most as `.web.js`/`.web.jsx` files with no native counterpart. Compounding this, several native screens already **navigate to route names that don't exist in any native navigator** — dead buttons, confirmed in source:
- `ProfileScreen.js:1601` → `navigation.navigate('Library')`
- `ProfileScreen.js:1628` → `navigation.navigate('CreatorEvents')`
- `CreatorProfileScreen.js:1672` → `navigation.navigate('BundleDetail', { bundle })`
- `PRDetailScreen.js:65` → `navigation.navigate('ExerciseHistory', ...)`

(`ProfileScreen.js:1581`'s "Soporte" button is *not* one of these — it's correctly branched on `Platform.OS === 'web'`, calling `navigation.navigate('Support')` only on web and falling back to a working `Linking.openURL(whatsappUrl(...))` on native. It's the pattern the four dead buttons above should follow until their native routes exist.)

Phase 2+ closes these gaps screen-by-screen (add native route, remove the dead-button state, converge shared logic) — not a big-bang rewrite.

---

## 4. Platform-split registry (sanctioned exceptions)

Per CLAUDE.md's "one file, both platforms" default: everything converges to a single shared file unless it depends on a genuinely platform-only capability. The sanctioned exceptions (spec §4):

- **Navigation shell** — React Router (web) vs React Navigation (native); see §3.
- **`BottomTabBar`** — portal-mounted DOM overlay on web vs a React Navigation tab bar on native.
- **Modal / toast / overlay primitives** — e.g. `WakeModalOverlay.web` — web uses DOM portals, native uses RN modal primitives.
- **PDF viewer** — web renders in-app via `pdf.js` on `<canvas>` (`components/resources/PdfViewerOverlay.web.jsx`, shipped fix for the mobile-browser blank-iframe bug — see `docs/PENDING_WORK.md`). `ResourcesScreen` (the PDF/YouTube/link "Recursos" card) has no native route yet (§3) — when it converges, native needs its own PDF library behind the same data interface, not a port of `pdf.js`.
- **Charts layer** (Lab) — DOM-based charts on web vs `react-native-svg` equivalents on native, behind a shared data interface.
- **`InstallScreen`** — web-only (PWA install gate; no native equivalent needed).
- **`EmailLinkSignInScreen`** — web-only (magic-link consumption from an email client; native uses in-app auth instead).
- **Payment redirect screens** (`PaymentSuccessScreen`, `PaymentCancelledScreen`) — web-only (MercadoPago browser checkout redirect targets).

**Everything else in shared (non-`.web.js`) files must be native-safe** — no unguarded `window.*`/`document.*` calls. The Task 5 sweep (90 raw grep hits across 32 files, triaged individually — full log absorbed from the now-deleted `apps/pwa/docs-notes-phase0a.md`) found **zero violations**:

| Category | Files | Line-hits |
|---|---|---|
| GUARDED — existing `isWeb` / `typeof window !== 'undefined'` idiom already wraps the call | 22 | 68 |
| UNREACHABLE-FROM-NATIVE-NAV — only imported by `App.web.js` or a web-only screen (e.g. `LabScreen.js`, `NutritionScreen.js`, reached only via `WebAppNavigator.jsx`) | 8 | 17 |
| FALSE-POSITIVE — comment/identifier text matched the grep, not an actual API call | 4 | 5 |
| **VIOLATION** | **0** | **0** |

The canonical guard idiom, used throughout: a module-level `isWeb` const (`typeof window !== 'undefined' && typeof document !== 'undefined'`, e.g. `src/utils/platform.js:4`) gating each platform-dependent branch, or an inline `typeof window === 'undefined'` / `typeof document === 'undefined'` early return. New shared code should follow this pattern rather than reach for a `.web.js` split by default.

---

## 5. Thin-client policy

**Rule (spec §5): new business rules live in the API. The client renders server state and queues mutations.**

- The Phase 3 API already embodies this — "the app is just another client," no special internal paths for PWA/creator-dashboard vs third-party API-key consumers.
- As each screen converges between platforms, business logic found embedded in screens (access gating, calculations, derived domain state) gets extracted: server-appropriate logic moves behind existing/new `/api/v1/*` endpoints; interaction logic moves to hooks/services. Screens end as rendering + event wiring.
- **Sanctioned exception — offline workout execution.** Set-by-set logging cannot require a network round trip per set: gyms have unreliable signal, and per-set Firestore/function invocations cost money at scale. `WorkoutExecutionScreen` keeps local interaction state plus an offline mutation queue that syncs via the API; the server stays the source of truth on completion (`POST /workout/complete`).
- Target surfaces for this extraction: `WorkoutExecutionScreen` (~7.4k lines) and `NutritionScreen` carry the most embedded domain logic today. They shed it incrementally as their phases converge — no big-bang rewrite.

---

## 6. Test harnesses

| Suite | Command | Scope / config |
|---|---|---|
| Functions — unit | `npm --prefix functions test` (`vitest run`) | Route handlers, services |
| Functions — Firestore rules | `npm --prefix functions run test:rules` | `functions/tests/rules/` — per-collection access matrix (`@firebase/rules-unit-testing`) |
| Functions — API/authz | `npm --prefix functions run test:api` (`WAKE_RUN_API_TESTS=1 vitest run tests/api`) | `functions/tests/api/` — creator IDOR, PII, bookings/events, fieldpath fuzz, etc. against emulators |
| Functions — security suite | `npm --prefix functions run test:security` / `test:security:full` | `functions/tests/rules` + `tests/api` + `tests/security` (chains, **concurrency** — webhook idempotency, event capacity vs. `max_registrations`, purchase-cap/waitlist races, monthly-drops cron atomicity — prod-shape replay, time-travel) |
| Functions — emulators | `npm --prefix functions run emu:start` | Firestore + Auth + Storage + Functions, project `wolf-20b8b` |
| PWA — pure logic | `npm run test:unit --prefix apps/pwa` (`vitest run`) | `apps/pwa/vitest.config.js` — `src/**/*.test.{js,jsx}`, excludes `*.native.test.{js,jsx}` |
| PWA — native component | `npm run test:native --prefix apps/pwa` (`jest`) | `apps/pwa/jest.config.js` — jest-expo preset + React Native Testing Library, `**/*.native.test.@(js|jsx)`. Seed: `src/components/__tests__/ErrorBoundary.native.test.js` |
| Web E2E | `npm run test:e2e` (root) | Playwright, `tests/e2e/playwright.config.js` — PWA + creator dashboard flows and screenshots |
| Native E2E | *pending* | Maestro, planned at `apps/pwa/.maestro/` (YAML flows on iOS simulator). **Not yet created** — parked in Task 6 because this dev machine has no Xcode.app installed (only Command Line Tools); `expo run:ios` halts non-interactively without it. Re-run once Xcode is installed. |
| Static quality gate | `npm run sonar` (root) | SonarQube Community Build, self-hosted via `tools/sonar/docker-compose.yml` (`localhost:9000`). Clean-as-You-Code: gate enforced on new/changed code only; legacy issues (5,151 at first scan) are informational and burn down as surfaces converge. Run locally in the dev loop, not as a GitHub-hosted PR check (Community Build has no branch analysis, and CI runners can't reach a laptop-local server). |

---

## Related docs

- `docs/superpowers/specs/2026-08-07-native-app-revival-design.md` — full design: commerce model, CI/CD, phase plan.
- `docs/API_ENDPOINTS.md` — endpoint reference.
- `docs/Brand/STANDARDS.md` — UI/visual system.
- `docs/PENDING_WORK.md` — tracker for unimplemented/partial features.
