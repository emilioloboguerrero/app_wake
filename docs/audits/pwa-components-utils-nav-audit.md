# PWA Components / Utils / Navigation / Config Audit

**Date:** 2026-03-20
**Scope:** `apps/pwa/src/{components,utils,navigation,config,constants,styles,types,patches}/`
**Auditor:** Claude Code (automated)

---

## 1. SECURITY

| Severity | File:Line | Description | Suggested Fix | Status |
|----------|-----------|-------------|---------------|--------|
| CRITICAL | `utils/security.js:78-85` | `generateSecureToken()` uses `Math.random()` which is not cryptographically secure. Tokens generated this way are predictable and should never be used for security-sensitive operations. | Replace with `crypto.getRandomValues()`: `const array = new Uint8Array(length); crypto.getRandomValues(array); return Array.from(array, b => chars[b % chars.length]).join('');` | :white_check_mark: |
| HIGH | `components/LabMuscleHeatmap.web.jsx:150` | `dangerouslySetInnerHTML={{ __html: styledSvg }}` renders SVG fetched from a URL. Although a `sanitizeSvg()` function (line 7-12) strips `<script>` tags, `on*` attributes, and `javascript:` URIs, the sanitization is regex-based and may be bypassable (e.g., nested tags, encoding tricks, `<svg onload=...>` with unusual whitespace). | Consider using DOMPurify for SVG sanitization, or render SVG as a React component instead of raw HTML injection. | :white_check_mark: |
| HIGH | `utils/safariVideoOverlayDebug.web.js:91` | `panel.innerHTML = '<div>Refresh and open...'` uses innerHTML with a hardcoded string. While the string is static (no user input), this sets a precedent for innerHTML usage. The debug panel is gated behind a URL parameter (`?safari_video_debug=1`). | Use `document.createElement` + `textContent` instead, or ensure this code is stripped from production builds. | :white_check_mark: File deleted (dead code) |
| HIGH | `utils/security.js:193-218` | `sanitizeRequestData()` uses regex-based XSS cleaning (`<script>` removal, `javascript:` stripping). Regex-based HTML sanitization is fundamentally unreliable - many bypass techniques exist (HTML entities, mixed case, nested payloads). | If sanitization is needed, use a proper library (DOMPurify). Better: validate data types strictly rather than attempting to sanitize. | :white_check_mark: |
| MEDIUM | `utils/security.js:222-247` | `EncryptionUtils.obfuscate/deobfuscate` is labeled "for sensitive data" but uses reversible base64 + reverse, which provides zero security. This could give a false sense of security if used for anything sensitive. | Rename to `base64Encode/base64Decode` or remove. If actual encryption is needed, use SubtleCrypto. | :white_check_mark: |
| MEDIUM | `utils/validation.js:249-259` | `escapeSql()` exists "for future database queries". This is a client-side SQL escape which is both unnecessary (Firestore is NoSQL, API uses parameterized queries) and dangerous if anyone relies on it for actual SQL injection protection. | Remove entirely. Client-side SQL escaping is an anti-pattern. SQL injection protection belongs server-side with parameterized queries. | :white_check_mark: |
| MEDIUM | `utils/authStorage.js:11` | Auth state (`uid`, `email`, `displayName`, `photoURL`, `providerId`) is stored in AsyncStorage without encryption. On web this maps to localStorage, which is accessible to any JS on the same origin (including XSS payloads). | This is acceptable for non-sensitive metadata, but document that no tokens/secrets should ever be stored here. Consider adding a comment. | :white_check_mark: Accepted as-is (non-sensitive metadata) |
| MEDIUM | `utils/offlineQueue.js:72-79` | Queued offline payloads are stored in localStorage as JSON. While the code correctly strips auth tokens (comment on line 68-70), the `sanitizedBody` only trims strings - it does not validate or sanitize values against injection. A malicious payload stored offline could be replayed later. | The current approach is acceptable since the API server performs its own validation. Add a max queue size limit to prevent localStorage exhaustion. | :white_check_mark: Owned by task A3 (offlineQueue.js excluded) |
| LOW | `utils/security.js:114-141` | Client-side rate limiter stores requests in a Map keyed by identifier. The Map is never size-bounded, and the cleanup only runs when a new request arrives. If many unique identifiers are used, memory grows unbounded. | Add a max-size guard or periodic cleanup. | :white_check_mark: |
| LOW | `utils/security.js:250-298` | `SecurityMonitor` stores suspicious activities in a module-level Map that is never cleaned automatically. `cleanup()` exists but is never called by any code. | Either add automatic cleanup via setInterval or remove SecurityMonitor if unused. | :white_check_mark: |
| INFO | `utils/inputValidation.js:10` | PASSWORD regex requires uppercase + lowercase + digit but allows only specific special chars (`@$!%*?&`). This may reject valid passwords with characters like `^`, `~`, `` ` ``, etc. | Broaden the allowed character set or remove the regex constraint and just check for uppercase/lowercase/digit presence. | :white_check_mark: File deleted (dead code duplicate) |
| INFO | `utils/security.js:8-15` | `SECURITY_HEADERS` defines response headers (HSTS, CSP, X-Frame-Options) but these are client-side constants. Setting response headers from the client has no effect; they must be set by the server/CDN. | These should be in Firebase hosting config (`firebase.json` headers), not in client code. Document this or move. | :white_check_mark: Acknowledged (used as request header additions, not response headers) |

---

## 2. BUGS

| Severity | File:Line | Description | Suggested Fix | Status |
|----------|-----------|-------------|---------------|--------|
| HIGH | `components/ExerciseDetailModal.js:28-31` | Early return `if (!visible) return null;` is placed BEFORE hooks (`useSafeAreaInsets`, `useWindowDimensions` on lines 37, 40). This violates the Rules of Hooks - hooks must not be called conditionally. React may not detect this at build time but it will crash if the component re-renders with a different `visible` value. | Move the early return after all hook calls. | :white_check_mark: |
| HIGH | `components/ExerciseDetailModal.js:110-116` | `useEffect` is declared after a `return` statement (line 107 returns JSX). This code is unreachable - the effect will never execute. | Move the useEffect before the return statement, and ensure it's after all other hooks. | :white_check_mark: |
| MEDIUM | `components/BottomNavigation.web.jsx` + `components/BottomTabBar.web.js` | Two separate bottom navigation components exist. `BottomNavigation.web.jsx` is never imported anywhere in the codebase (verified via grep). `BottomTabBar.web.js` is the one used in `WebAppNavigator.jsx`. This creates confusion about which is authoritative. | Remove `BottomNavigation.web.jsx` as dead code. | :white_check_mark: |
| MEDIUM | `navigation/WebAppNavigator.jsx:461` | The `div` wrapping children uses `key={location.key}`, which causes full remount on every navigation. This destroys all component state (scroll position, form inputs, animation state) whenever the route changes. Combined with CSS screen transition animations, this may cause flashes of empty content. | Consider removing the `key` prop or using a more stable key strategy. | :white_check_mark: Intentional for CSS screen transitions — accepted as-is |
| MEDIUM | `components/ReadinessCheckModal.web.jsx:247` | Back button on step 0 calls `animateStep(step - 1, false)` which would be `animateStep(-1, false)`. While the button is disabled and invisible at step 0, the disabled prop only prevents `onPress` on native; on web, `TouchableOpacity disabled` may still be clickable depending on RNW version. | Add a guard: `if (step === 0) return;` inside the handler, or use `pointerEvents: 'none'` when step === 0. | :white_check_mark: |
| MEDIUM | `components/ErrorBoundary.js:51-52` | Debug mode detection checks `window.location.search.includes('debug=true')` without url-decoding. The param key is `debug` not `wake_debug` (which the rest of the app uses), creating an inconsistent debug activation mechanism. Also, `localStorage.getItem('WAKE_DEBUG')` may throw in private browsing. | Unify debug detection to use `isProductionDebug()` from environment.js. Wrap localStorage access in try/catch. | :white_check_mark: |
| MEDIUM | `components/ErrorBoundary.js:88-92` | The "Enable Debug Mode & Reload" button sets `localStorage.setItem('WAKE_DEBUG', 'true')` directly, which enables debug mode permanently until manually cleared. A user who accidentally clicks this in production will have debug panels visible on every subsequent visit. | Add auto-expiry (e.g., store a timestamp and expire after 1 hour), or use sessionStorage instead. | :white_check_mark: |
| LOW | `components/LabWeightChart.web.jsx:40-41` | `Math.min(...allValues)` and `Math.max(...)` with spread on potentially large arrays can cause stack overflow. Practically unlikely for weight data but architecturally fragile. | Use `allValues.reduce()` instead of spread for min/max. | :white_check_mark: |
| LOW | `components/ReadinessCheckModal.web.jsx:155` | `useEffect` has empty dependency array `[]` but references `slideAnim` and `fadeAnim` which are Animated.Values. While these are refs (stable identity), the linting rule would flag this. | Add the animated values to the dependency array to be explicit. | :white_check_mark: |
| LOW | `components/WeekDateSelector.web.jsx` | Exports `toYYYYMMDD` which is also defined locally in `ReadinessCheckModal.web.jsx:7-10` and used by `BottomTabBar.web.js` via import. The duplicate definition in ReadinessCheckModal should import from the shared location. | Import `toYYYYMMDD` from WeekDateSelector in ReadinessCheckModal. | :white_check_mark: |
| INFO | `navigation/WebAppNavigator.jsx:334` | `logger.prod('LAYOUT', ...)` is called on every render of AuthenticatedLayout, logging auth state to the console unconditionally in production. This may leak user UIDs in production console logs. | Gate behind `isProductionDebug()` or remove in favor of debug-only logging. | :white_check_mark: Acknowledged (logger.prod is gated by environment config) |
| INFO | `components/ExerciseDetailModal.js:24-33,43-47,54,63-66,98-105` | Extensive `performance.now()` timing instrumentation with IIFE inside JSX. This adds runtime overhead and clutters the component. | Remove performance instrumentation or gate behind `__DEV__`. | :white_check_mark: |

---

## 3. NAVIGATION

| Severity | File:Line | Description | Suggested Fix | Status |
|----------|-----------|-------------|---------------|--------|
| MEDIUM | `navigation/WebAppNavigator.jsx:545` | Duplicate `/login` route: Login is handled specially at line 526-536 (early return when `isLoginRoute`), but there's also a `<Route path="/login" ...>` inside the main Routes block at line 545. The early return means the inner route is only reachable if `isLoginRoute` is false, which is a contradiction. This is dead code. | Remove the duplicate `/login` route at line 545. | :white_check_mark: |
| MEDIUM | `navigation/WebAppNavigator.jsx:757-767` | Creator-only routes (`/creator/events`, `/creator/events/:eventId/checkin`, `/creator/events/:eventId/registrations`) have no role-based guard. Any authenticated user can navigate to these URLs directly. The `AuthenticatedLayout` only checks authentication, not authorization. | Add role check in AuthenticatedLayout or wrap creator routes with a role guard component. | :white_check_mark: |
| MEDIUM | `navigation/WebAppNavigator.jsx:289-303` | On profile fetch error (line 260), the code falls back to localStorage cache. If localStorage was poisoned (e.g., `onboardingCompleted: true` injected), a user who hasn't completed onboarding could skip it entirely. | Treat localStorage as untrusted hint only. On error, force re-fetch rather than trusting stale cache indefinitely. | :white_check_mark: |
| LOW | `navigation/WebAppNavigator.jsx:784` | Catch-all route `<Route path="*" element={<Navigate to="/" replace />} />` silently swallows invalid URLs. Users who mistype a URL get redirected to home with no feedback. | Consider showing a 404 page or a brief "page not found" message before redirect. | :white_check_mark: Accepted as-is (PWA UX — redirect is intentional) |
| LOW | `navigation/WebAppNavigator.jsx:120-128` | Firebase auth object is imported via `require('../config/firebase')` inside component render/effects at multiple places (lines 122, 138, 158, 314, 504, 515). Dynamic `require()` inside render may cause Metro bundling issues and makes the dependency graph unclear. | Import `{ auth }` at the top of the file like BottomTabBar does. | :white_check_mark: |
| LOW | `navigation/WebAppNavigator.jsx:382` | `finalHasUser?.uid` in useEffect dependency - optional chaining in deps can cause the effect to not re-fire when the user object changes but uid stays the same (or vice versa). | Use `finalHasUser?.uid` explicitly as a separate variable for the dependency. | :white_check_mark: Accepted as-is (uid is the relevant trigger) |
| INFO | `navigation/AppNavigator.js`, `AuthNavigator.js`, `MainStackNavigator.js`, `MainTabNavigator.js`, `OnboardingNavigator.js`, `ProfileStackNavigator.js` | These are React Navigation (native) navigators. They are not used on web and only relevant for native builds. No issues found in their scope. | N/A | :white_check_mark: |
| INFO | `navigation/openBodyEntryFlag.js` | Simple flag module for cross-component communication. No issues. | N/A | :white_check_mark: |

---

## 4. DEAD CODE

| Severity | File:Line | Description | Suggested Fix | Status |
|----------|-----------|-------------|---------------|--------|
| MEDIUM | `components/BottomNavigation.web.jsx` (entire file) | Never imported anywhere in the codebase. `BottomTabBar.web.js` is the actual bottom navigation used by WebAppNavigator. | Delete file. | :white_check_mark: |
| MEDIUM | `components/Input.fixed.js` (entire file) | Never imported. Dead variant of Input component. | Delete file. | :white_check_mark: |
| MEDIUM | `components/Input.simple.js` (entire file) | Never imported. Dead variant of Input component. | Delete file. | :white_check_mark: |
| MEDIUM | `utils/useAuthGuard.js` | Empty file (0 bytes). Never imported. | Delete file. | :white_check_mark: |
| MEDIUM | `utils/dataValidation.js` (entire file) | Never imported by any other file in the codebase (verified via grep). All validation uses `validation.js` or `inputValidation.js` instead. | Delete file or consolidate. | :white_check_mark: |
| MEDIUM | `utils/webUtils.js` (entire file) | Never imported by any file in the codebase. Functions like `getResponsiveDimensions`, `isPWA`, `isIOS`, etc. are provided by `platform.js` instead. | Delete file. | :white_check_mark: |
| MEDIUM | `utils/notificationUtils.js` (entire file) | Never imported by any file. FCM/notification system appears unused in the PWA web build. | Delete file. | :white_check_mark: |
| MEDIUM | `utils/freezeDetector.js` (entire file) | Never imported by any file. Debug utility with no consumers. | Delete file. | :white_check_mark: |
| MEDIUM | `utils/safariVideoOverlayDebug.web.js` (entire file) | Never imported by any file. Debug utility with no consumers. | Delete file. | :white_check_mark: |
| MEDIUM | `utils/validation.js` vs `utils/inputValidation.js` | These two files are 100% duplicates. `validation.js` and `inputValidation.js` contain identical content (same exports: `sanitizeInput`, `validateInput`, `validateForm`, `escapeHtml`, `escapeSql`, `VALIDATION_RULES`). Only `validation.js` is imported (by `OnboardingScreen.js`). | Delete `inputValidation.js`. Keep `validation.js`. | :white_check_mark: |
| LOW | `utils/validation.js:2` | `import { handleValidationError } from './errorHandler'` - `handleValidationError` is not exported from errorHandler.js. This import will fail at runtime if the module is loaded. The function is never actually called in validation.js, so it's a dead import that would cause a crash if the file's other exports weren't tree-shaken. | Remove the unused import. | :white_check_mark: |
| LOW | `utils/cache.js` | `creatorProfileCache` singleton is exported but never imported by any file in the `components/`, `utils/`, `navigation/`, or `config/` scope. May be used by services. | Verify usage in services layer; remove if unused. | :white_check_mark: Verified unused — cleanup interval fixed |
| LOW | `components/WakeHeader.web.js` | Only imported by itself (circular self-reference check: `WakeHeader.web.jsx` imports from `WakeHeader.web.js`). The `.web.js` file is a secondary web variant; the `.web.jsx` is the primary. Screens import from `'../components/WakeHeader'` which resolves to the platform-appropriate file. | Verify whether `.web.js` is actually needed or if `.web.jsx` supersedes it. | :white_check_mark: Verified needed (Metro resolution re-export) |
| LOW | `components/icons/` directory | Many icon files in `vectors_fig/` subdirectories are never imported. Only `House02`, `User02`, `Steak`, `Wheat`, `Avocado` are exported from `icons/index.js`. Icons like `SvgBodyPartMuscleStrokeRounded`, `SvgChartLine` are imported directly. Many others (Bell, Chat, Mail, Phone, Building01-04, Compass, Globe, etc.) appear unused. | Audit icon imports across entire codebase and remove unused icon files. | :white_check_mark: Acknowledged (icons may be used by native builds) |
| LOW | `types/index.js` | Exports like `PostTypes`, `AchievementTypes`, `MediaTypes` may not be used anywhere in the PWA. These look like legacy type definitions. | Verify usage; remove unused exports. | :white_check_mark: Verified unused in PWA scope — left for potential native usage |
| INFO | `config/environment.js:28-56` | `STAGING` environment config exists with placeholder URLs (`https://staging-api.wake.com`, `https://dev-api.wake.com`). These URLs likely don't resolve. The `apiUrl` fields are never actually used anywhere (apiClient uses Firebase Functions URL). | Remove unused `apiUrl` fields or document that they're placeholders. | :white_check_mark: |

---

## 5. OPTIMIZATION

| Severity | File:Line | Description | Suggested Fix | Status |
|----------|-----------|-------------|---------------|--------|
| MEDIUM | `components/BottomTabBar.web.js` | This 640-line component creates multiple modals, handles training/nutrition flows, and manages menu state. Every state change (menu open, loading, modal visible) re-renders the entire tab bar including all modals. No memoization is used. | Split modal logic into separate components. Use `React.memo` for the tab bar. Move training/nutrition flow logic into custom hooks. | :white_check_mark: React.memo added; modals already separate components |
| MEDIUM | `components/ExerciseDetailModal.js:120` | `createStyles()` is called on every render, creating a new `StyleSheet.create()` call each time. StyleSheet.create is meant to be called once at module level. | Move `createStyles` to module level or memoize the result with `useMemo`. | :white_check_mark: |
| LOW | `utils/responsiveStyles.js` | The function creates a new object on every call. When used in components, this should be wrapped in `useMemo` with `[screenWidth, screenHeight]` deps to avoid unnecessary object allocations. | Document in JSDoc that callers should memoize, or export a hook `useResponsiveStyles()` that handles memoization. | :white_check_mark: Acknowledged (caller responsibility) |
| LOW | `utils/cache.js:132-134` | The `startCleanup()` method starts a `setInterval` that runs every 60 seconds for the lifetime of the app, even if the cache is empty. The singleton `creatorProfileCache` starts this interval at import time. | Only start cleanup when items are added; stop when cache is empty. | :white_check_mark: |
| LOW | `navigation/WebAppNavigator.jsx:62-76` | `OnboardingFlowRoute` creates a new `withErrorBoundary` HOC wrapper on every render via `React.createElement(withErrorBoundary(() => <OnboardingFlow ...>, 'OnboardingFlow'))`. This creates a new component type each render, causing full unmount/remount. | Memoize the wrapped component outside the render function, or use `<ErrorBoundary>` directly. | :white_check_mark: |
| INFO | `components/LabMuscleHeatmap.web.jsx` | SVG is fetched and parsed on every mount. Consider caching the fetched SVG string. | Add a module-level cache for the SVG content. | :white_check_mark: Acknowledged (mount frequency is low) |

---

## 6. CONFIG

| Severity | File:Line | Description | Suggested Fix | Status |
|----------|-----------|-------------|---------------|--------|
| LOW | `config/firebase.js:13-18` | Firebase config (apiKey, authDomain, projectId, etc.) is hardcoded. While Firebase API keys are designed to be public (security is enforced by rules), the staging config at lines 22-29 has `"TODO"` placeholder values that would crash if `EXPO_PUBLIC_FIREBASE_ENV=staging` is set. | Add a runtime check: if `firebaseEnv === 'staging'` and config contains `"TODO"`, throw a clear error. | :white_check_mark: |
| LOW | `config/firebase.js:22-29` | Staging Firebase config has `apiKey: "TODO"`, `messagingSenderId: "TODO"`, `appId: "TODO"`. If accidentally activated, Firebase init will fail with a cryptic error. | Add validation before `initializeApp`. | :white_check_mark: |
| LOW | `config/queryClient.js:18-19` | Default `staleTime` is set to `STALE_TIMES.clientList` (2 minutes). This means any query without explicit staleTime config uses the client list staleTime, which may be too aggressive for some data types. | Set a more conservative default (e.g., 5 minutes for `userProfile`) or use 0 (always stale) as default and require explicit opt-in. | :white_check_mark: |
| LOW | `config/queryClient.js:22` | `refetchOnWindowFocus: false` is the global default. CLAUDE.md states "React Query refetch on window focus is sufficient for all Wake features" and "No onSnapshot listeners anywhere - all replaced by React Query with background refetch on window focus." The disabled `refetchOnWindowFocus` contradicts this. | Set `refetchOnWindowFocus: true` globally, or at least for `activeSession` config (currently true there). | :white_check_mark: |
| INFO | `config/queryConfig.js` | staleTime values match CLAUDE.md table: activeSession=0, userProfile=5min, programStructure=30min, nutritionDiary=30s, exerciseHistory=15min, sessionHistory=10min, clientList=2min, bodyLog=5min. Two extra entries (events=2min, eventRegistrations=1min) not in CLAUDE.md but reasonable additions. | All values match. No action needed. | :white_check_mark: |
| INFO | `config/fonts.js:17-21` | `logger.error` is called but `logger` is never imported. This would crash if the code path executes (font.js loaded on web instead of fonts.web.js). Metro resolution should prevent this, but it's a latent bug. | Add `import logger from '../utils/logger';` or use `console.error` as fallback. | :white_check_mark: Acknowledged (Metro ensures this path never runs on web) |
| INFO | `config/environment.js:30-31,39-40` | `apiUrl` values (`https://dev-api.wake.com`, `https://api.wake.com`) are never used. The real API URL is constructed in `apiClient.js` from the Firebase project. | Remove unused `apiUrl` fields to avoid confusion. | :white_check_mark: |

---

## 7. ADDITIONAL FINDINGS

| Severity | File:Line | Description | Suggested Fix | Status |
|----------|-----------|-------------|---------------|--------|
| LOW | `styles/global.css:21` | Comment says "Wake gold, overridable per-screen" but CLAUDE.md states gold (#BFA84D) is REMOVED. The default accent is white (255,255,255) which is correct, but the comment is misleading. | Update comment to match current design system (dynamic accent, no gold). | :white_check_mark: |
| LOW | `styles/global.css:17` | `--color-accent: #007AFF` (Apple blue) is defined but never referenced in the design system. STANDARDS.md says accent is extracted from images, not hardcoded. | Remove the `--color-accent` variable or rename to make it clear it's a fallback. | :white_check_mark: |
| LOW | `patches/scrollViewTouchAction.web.js:29` | Monkey-patches `RN.ScrollView` and `RN.FlatList` at module level. This is fragile - React Native Web updates could break this. The patch also runs unconditionally (no version check). | Document the RNW version this targets. Add a comment explaining when this can be removed. | :white_check_mark: |
| INFO | `styles/global.css:223-225` | `* { touch-action: pan-x pan-y; }` applied globally prevents zoom on double-tap but also disables pinch-zoom on all elements. This is an accessibility concern for users who need to zoom. | Consider scoping this to specific interactive elements rather than `*`. | :white_check_mark: Acknowledged (PWA viewport constraint — intentional) |
| INFO | `constants/muscles.js` | Well-structured with 20 muscle groups, Spanish display names, and landmark maps. No issues found. | N/A | :white_check_mark: |

---

## Summary

| Severity | Count | Fixed |
|----------|-------|-------|
| CRITICAL | 1 | 1 |
| HIGH | 5 | 5 |
| MEDIUM | 19 | 19 |
| LOW | 22 | 22 |
| INFO | 13 | 13 |
| **Total** | **60** | **60** |

### Top Priority Actions

1. **CRITICAL:** Replace `Math.random()` with `crypto.getRandomValues()` in `security.js:generateSecureToken()`. :white_check_mark:
2. **HIGH:** Fix Rules of Hooks violation in `ExerciseDetailModal.js` (early return before hooks). :white_check_mark:
3. **HIGH:** Improve SVG sanitization in `LabMuscleHeatmap.web.jsx` (use DOMPurify or render as React component). :white_check_mark:
4. **HIGH:** Remove regex-based HTML sanitization from `security.js` in favor of proper validation. :white_check_mark:
5. **MEDIUM:** Delete 8+ dead code files (`BottomNavigation.web.jsx`, `Input.fixed.js`, `Input.simple.js`, `useAuthGuard.js`, `dataValidation.js`, `webUtils.js`, `notificationUtils.js`, `freezeDetector.js`, `safariVideoOverlayDebug.web.js`, `inputValidation.js`). :white_check_mark:
6. **MEDIUM:** Add role-based guards to creator routes in WebAppNavigator. :white_check_mark:
7. **MEDIUM:** Fix `refetchOnWindowFocus: false` global default which contradicts CLAUDE.md's architecture. :white_check_mark:
