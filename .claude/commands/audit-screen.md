# Screen Efficiency Audit

You are performing a deep efficiency audit of a screen in the Wake PWA.

The screen to audit is: **$ARGUMENTS**

## Context

Wake is a fitness/nutrition PWA built on top of a React Native (Expo) app that was originally designed for mobile. The mobile app had an offline-first caching architecture using AsyncStorage. The app has now been pivoted to a PWA, which means:

- AsyncStorage is now backed by web storage (not a real offline store)
- Many caching strategies designed for mobile (download once, read from cache) now create overhead instead of helping
- Firestore listeners and fetches that were fine on mobile are now causing excessive DB reads on web
- Some systems may have been designed with mobile assumptions that don't apply to web

**Key services in the PWA:**
- `hybridDataService` — merges AsyncStorage cache + live Firestore data for `low_ticket` programs
- `courseDownloadService` — downloads entire programs to AsyncStorage (mobile-first pattern)
- `libraryResolutionService` — resolves `libraryModuleRef`/`librarySessionRef` pointers in program docs
- `firestoreService` — raw Firestore operations
- `consolidatedDataService` — aggregates data from multiple sources
- `sessionService` / `sessionManager` — workout session state
- `nutritionFirestoreService` / `nutritionApiService` — nutrition diary and food search
- `purchaseService` — MercadoPago payment + subscription state
- `userProgressService` — exercise PR history and progress
- `networkService` — online/offline detection
- `webStorageService` — web-specific localStorage wrapper
- `storageService` — AsyncStorage abstraction
- `data-management/` — `courseDownloadService`, `workoutProgressService`, `workoutSessionService`, `progressQueryService`, `sessionRecoveryService`, `storageManagementService`, `uploadService`

**Contexts:** `AuthContext`, `UserRoleContext`, `VideoContext`

## Your Task

### Step 1: Locate and read all screen files

Find both the native and web versions of the screen:
- `apps/pwa/src/screens/{ScreenName}.js`
- `apps/pwa/src/screens/{ScreenName}.web.js` or `.web.jsx`

If only one version exists, read that one.

### Step 2: Trace the full dependency tree

For every import in the screen files (services, hooks, components, contexts), read those files too. Then for each of those files, read their imports as well — go **at least 2 levels deep**. Focus on:
- All services being called
- All hooks being used
- All contexts being consumed
- Any components that themselves fetch data or use services
- Data management files in `data-management/`
- Navigation patterns and how data is passed between screens

Do NOT stop at the screen — the inefficiency is usually in the service layer.

### Step 3: Understand the intent

Before labeling anything as a problem, understand WHY it was built that way. Ask yourself:
- Was this designed for mobile offline-first and now runs on web?
- Does this caching layer add latency or reduce it in the web context?
- Is this data ever stale on web without a manual refresh?
- Is this fetching data that another service or context already has?
- Is this listener/subscription necessary or is a one-time fetch sufficient?
- Is the AsyncStorage cache actually being populated correctly on web?

### Step 4: Identify inefficiency patterns

Look for ALL of the following:

**Firestore over-fetching:**
- Fetching data on every screen mount without checking if it's already loaded
- Multiple components fetching the same Firestore documents independently
- Real-time listeners (onSnapshot) used where a one-time get() would suffice
- No deduplication of concurrent identical requests
- Fetching entire collections when only specific docs are needed
- Fetching data before it's needed (no lazy loading)

**Cache problems:**
- AsyncStorage reads that always miss on web because the cache was never populated
- Cache invalidation logic that never triggers on web
- Multiple layers of caching for the same data that add latency without benefit
- Cache checks that take longer than just fetching from Firestore
- Data being written to AsyncStorage on every render

**State & re-render inefficiency:**
- Missing `useMemo`/`useCallback` for expensive computations or callbacks passed as props
- Missing `React.memo` on pure components that re-render on every parent update
- State changes that cascade unnecessary re-renders through the component tree
- Context values that update too frequently, causing all consumers to re-render
- `useEffect` with missing or incorrect dependencies causing infinite loops or stale closures

**Waterfall / sequential fetching:**
- Data fetches that block each other when they could run in parallel (`Promise.all`)
- Navigation patterns that fetch data after arriving at a screen instead of prefetching
- Services that fetch A, then use A to fetch B, then use B to fetch C (avoidable waterfall)

**Duplicate work:**
- Two services or hooks fetching the same Firestore document
- The same data transformed/filtered multiple times in different places
- Event listeners or subscriptions set up multiple times (e.g., component mounts multiple times)

**Mobile-only systems running on web:**
- Download/cache managers that add overhead but don't work correctly on web
- Offline detection logic that changes app behavior when it shouldn't on web
- Background sync or prefetch logic that makes sense on mobile but wastes resources on web

**Memory leaks and cleanup:**
- Firestore `onSnapshot` listeners not being unsubscribed on unmount
- Timers / intervals not cleared on unmount
- Promises that update state after the component has unmounted

### Step 5: Produce the audit report

Write a comprehensive report with the following sections:

---

## AUDIT REPORT: {Screen Name}

### Architecture Overview
A concise description of what this screen does, its data dependencies, and how it fits into the app.

### System Map
List every file involved (screen, services, hooks, components, contexts), what it does, and its role for this screen. Note which ones were designed for mobile-offline-first.

### Findings

For each finding:
- **[SEVERITY: CRITICAL | HIGH | MEDIUM | LOW]** — Short title
- File and approximate line reference
- What is happening
- Why it is a problem in the PWA web context
- The original intent (why it was built this way)

Group findings by category: Firestore Over-fetching, Cache Problems, Re-render Inefficiency, Waterfall Fetching, Duplicate Work, Mobile-only Systems, Memory Leaks.

### Optimization Plan

A prioritized, step-by-step plan to fix the issues. For each step:
- What to change
- Which files are affected
- Expected impact (reduce DB reads, improve load time, eliminate re-renders, etc.)
- Complexity (Low | Medium | High)
- Whether it requires a new pattern or just cleanup

Order by: highest impact + lowest complexity first.

### What to Preserve
List any systems that look redundant but serve a real purpose and should NOT be removed.

### Summary
One paragraph summary of the overall state and the most important things to fix.

---

Be direct and specific. Reference actual file paths and service method names. Don't summarize vaguely — name the exact functions, hooks, and Firestore calls causing problems.
