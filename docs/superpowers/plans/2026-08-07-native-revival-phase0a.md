# Native Revival Phase 0a — Blocking Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the native iOS app buildable, bootable, and testable again — provider parity with web, no dead dependencies, all four test harnesses proven — so parallel surface convergence (Phases 1–7) can start.

**Architecture:** Native root (`App.js`) gets the same provider tree as the web root without touching the battle-tested `App.web.js`. A native React Query persister mirrors the web IndexedDB one on AsyncStorage. Harnesses: vitest (exists, functions+pwa), jest-expo+RNTL (new, RN components), Playwright (exists, root), Maestro (new, native E2E), SonarQube Community local (new).

**Tech Stack:** Expo SDK 54 / RN 0.81.5 / React 19, @tanstack/react-query v5, jest-expo, @testing-library/react-native, Maestro, SonarQube Community Build (Docker), vitest.

## Global Constraints

- PWA is JavaScript — **never add TypeScript** to `apps/pwa` (CLAUDE.md).
- User-facing strings in **Spanish**. No emojis anywhere.
- PWA logging via `src/utils/logger.js`, never raw `console.log`.
- All work on branch **`native-revival-phase0`** — never on `main` (auto-deploy hazard: automated deploys have fired from `main` mid-session).
- **Do not modify `src/App.web.js`** in this phase — it is battle-tested prod code.
- No deploys of any kind in this phase. `firebase deploy` always requires explicit user confirmation.
- Firestore/API behavior unchanged — this phase touches only client wiring, tests, and tooling.

## User-owned Week-1 actions (parallel, not agent-executable)

These run on Apple's calendar and must start immediately; the agent tasks below do not depend on them, but Phase 1 (commerce) does:

1. App Store Connect: accept **Paid Apps agreement**, complete banking + tax (never done — web sales only until now). Blocks even sandbox IAP.
2. Enroll in the **Small Business Program** (15%).
3. Create an **ASC API key** (Users and Access → Integrations) — store in Firebase Secret Manager as `ASC_API_KEY` (+ key ID and issuer ID).
4. Create a **RevenueCat** account (free tier), project "Wake", iOS app `com.lab.wake.co`.
5. After (1) clears: create **one manual test IAP product** and submit it, to measure real product-review latency.

---

### Task 1: Branch + remove dead purchase dependency

**Files:**
- Modify: `apps/pwa/package.json` (remove `expo-in-app-purchases` dep; remove stale `eject` and `build:android` scripts)

**Interfaces:**
- Produces: a dependency tree with no deprecated IAP package; Task 5's prebuild depends on this.

- [ ] **Step 1: Create the branch**

```bash
cd /Users/emilioloboguerrero/app && git checkout -b native-revival-phase0
```

- [ ] **Step 2: Confirm nothing imports the package**

Run: `grep -rn "expo-in-app-purchases" apps/pwa/src apps/pwa/App.js apps/pwa/index.js apps/pwa/app.config.js`
Expected: no matches (audit already confirmed; if a match appears, stop and report).

- [ ] **Step 3: Remove dep and stale scripts**

In `apps/pwa/package.json`: delete the line `"expo-in-app-purchases": "~14.5.0",` from dependencies; delete scripts `"eject": "expo eject",` and `"build:android": "expo build:android",` (both removed from modern Expo). Then:

```bash
cd apps/pwa && npm install
```

- [ ] **Step 4: Verify web export still builds**

Run: `cd apps/pwa && npx expo export --platform web --clear`
Expected: export completes, `dist/` produced, bundle contains `wolf-20b8b` (`grep -rl "wolf-20b8b" dist/_expo | head -1` non-empty — Metro cache gotcha).

- [ ] **Step 5: Commit**

```bash
git add apps/pwa/package.json apps/pwa/package-lock.json
git commit -m "chore(pwa): drop deprecated expo-in-app-purchases and stale scripts"
```

---

### Task 2: Native React Query persister (AsyncStorage)

**Files:**
- Create: `apps/pwa/src/config/queryPersistence.js`
- Create: `apps/pwa/vitest.config.js`
- Test: `apps/pwa/src/__tests__/queryPersistence.native.unit.test.js`

**Interfaces:**
- Consumes: `@react-native-async-storage/async-storage` (installed), constants mirrored from `src/config/queryPersistence.web.js` (`MAX_AGE_MS = 24h`, `BUSTER = 'api-migration-v8-idb-clone-fix'`).
- Produces: `export const persistOptions = { persister, maxAge, buster }` — Task 3's `App.js` imports `{ persistOptions } from './src/config/queryPersistence'` (Metro resolves `.web.js` on web, this file on native — same import specifier both platforms).

- [ ] **Step 1: Create vitest config so native-suite patterns stay separated**

Create `apps/pwa/vitest.config.js` (pwa currently runs vitest with defaults; jest-expo tests in Task 4 must not be picked up):

```js
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.{js,jsx}'],
    exclude: ['**/node_modules/**', '**/*.native.test.{js,jsx}'],
  },
});
```

Note: this unit test file is named `.unit.test.js` (matches vitest include, not jest's `*.native.test` pattern from Task 4).

- [ ] **Step 2: Write the failing test**

Create `apps/pwa/src/__tests__/queryPersistence.native.unit.test.js`:

```js
import { describe, it, expect, vi, beforeEach } from 'vitest';

const store = new Map();
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    setItem: vi.fn(async (k, v) => { store.set(k, v); }),
    getItem: vi.fn(async (k) => store.get(k) ?? null),
    removeItem: vi.fn(async (k) => { store.delete(k); }),
  },
}));

import { asyncStoragePersister, persistOptions } from '../config/queryPersistence';

describe('native query persistence', () => {
  beforeEach(() => store.clear());

  it('round-trips a client and strips function props (parity with web JSON round-trip)', async () => {
    const client = {
      clientState: { queries: [{ data: { toDate: () => 1, amount: 19000 } }] },
    };
    await asyncStoragePersister.persistClient(client);
    const restored = await asyncStoragePersister.restoreClient();
    expect(restored.clientState.queries[0].data.amount).toBe(19000);
    expect(restored.clientState.queries[0].data.toDate).toBeUndefined();
  });

  it('returns undefined when nothing persisted', async () => {
    expect(await asyncStoragePersister.restoreClient()).toBeUndefined();
  });

  it('removeClient clears the stored cache', async () => {
    await asyncStoragePersister.persistClient({ a: 1 });
    await asyncStoragePersister.removeClient();
    expect(await asyncStoragePersister.restoreClient()).toBeUndefined();
  });

  it('exposes persistOptions with the shared buster', () => {
    expect(persistOptions.buster).toBe('api-migration-v8-idb-clone-fix');
    expect(persistOptions.maxAge).toBe(24 * 60 * 60 * 1000);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd apps/pwa && npx vitest run src/__tests__/queryPersistence.native.unit.test.js`
Expected: FAIL — cannot resolve `../config/queryPersistence`.

- [ ] **Step 4: Write the implementation**

Create `apps/pwa/src/config/queryPersistence.js`:

```js
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'wake-react-query-cache';
const MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours — parity with queryPersistence.web.js
const BUSTER = 'api-migration-v8-idb-clone-fix';

// JSON round-trip mirrors the web persister: apiService._wrapTimestamp attaches
// toDate/toMillis closures to cached objects; serializing strips them so callers
// that check `typeof x.toDate === 'function'` fall through safely on restore.
export const asyncStoragePersister = {
  persistClient: async (client) => {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(client));
  },
  restoreClient: async () => {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : undefined;
  },
  removeClient: async () => {
    await AsyncStorage.removeItem(STORAGE_KEY);
  },
};

export const persistOptions = {
  persister: asyncStoragePersister,
  maxAge: MAX_AGE_MS,
  buster: BUSTER,
};
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd apps/pwa && npx vitest run`
Expected: new suite PASS, existing suites (`sessionCacheKey`, `levelGate`, `courseAccess`, `activityStreakService`, `purchaseService.events`) still PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/pwa/vitest.config.js apps/pwa/src/config/queryPersistence.js apps/pwa/src/__tests__/queryPersistence.native.unit.test.js
git commit -m "feat(pwa): native AsyncStorage persister for React Query, parity with web"
```

---

### Task 3: Native root provider parity

**Files:**
- Modify: `apps/pwa/App.js` (render tree only, lines 85–97; keep the init `useEffect` untouched)

**Interfaces:**
- Consumes: `queryClient` from `src/config/queryClient`, `persistOptions` from `src/config/queryPersistence` (Task 2), existing providers (`AuthContext`, `ActivityStreakContext`, `VideoContext`), `SafeAreaProvider` from `react-native-safe-area-context`.
- Produces: native provider tree matching web root order (`PersistQueryClientProvider > SafeAreaProvider > AuthProvider > ActivityStreakProvider > VideoProvider`) — every modern shared hook (`hooks/hoy/*`, `useUserCourses`) becomes mountable on native. Phase 2 (Hoy) depends on this exact tree.

- [ ] **Step 1: Add imports**

In `apps/pwa/App.js`, add after the existing imports:

```js
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { queryClient } from './src/config/queryClient';
import { persistOptions } from './src/config/queryPersistence';
```

- [ ] **Step 2: Replace the render tree**

Replace the current return block (lines 85–96: `ErrorBoundary > AuthProvider > ActivityStreakProvider > VideoProvider > AppNavigator + StatusBar`) with the web-parity order (web root: `PersistQueryClientProvider > SafeAreaProvider > AuthProvider > ActivityStreakProvider > VideoProvider`, per `src/App.web.js:878-892`):

```jsx
  return (
    <ErrorBoundary>
      <PersistQueryClientProvider client={queryClient} persistOptions={persistOptions}>
        <SafeAreaProvider>
          <AuthProvider>
            <ActivityStreakProvider>
              <VideoProvider>
                <AppNavigator />
                <StatusBar style="light" />
              </VideoProvider>
            </ActivityStreakProvider>
          </AuthProvider>
        </SafeAreaProvider>
      </PersistQueryClientProvider>
    </ErrorBoundary>
  );
```

- [ ] **Step 3: Verify the native bundle compiles**

Run: `cd apps/pwa && npx expo export --platform ios --clear`
Expected: bundling completes with no module-resolution errors. (This catches import mistakes without needing a device build.)

- [ ] **Step 4: Verify web untouched**

Run: `git diff --stat -- apps/pwa/src/App.web.js`
Expected: empty (constraint: web root unmodified).

- [ ] **Step 5: Commit**

```bash
git add apps/pwa/App.js
git commit -m "feat(pwa): native root mounts React Query + SafeArea provider tree (web parity)"
```

---

### Task 4: jest-expo + RNTL harness with seed test

**Files:**
- Create: `apps/pwa/jest.config.js`
- Modify: `apps/pwa/package.json` (devDeps + `test:native` script; fix broken `"test": "jest"` script)
- Test: `apps/pwa/src/components/__tests__/ErrorBoundary.native.test.js`

**Interfaces:**
- Produces: `npm run test:native` runs jest-expo suites matching `**/*.native.test.{js,jsx}`. Every converged screen in Phases 2–7 adds component tests under this pattern. Vitest (`npm run test:unit`) and jest-expo do not overlap (Task 2's vitest config excludes `*.native.test.*`).

- [ ] **Step 1: Install harness**

```bash
cd apps/pwa && npm install --save-dev jest-expo jest @testing-library/react-native react-test-renderer@19.1.0
```

- [ ] **Step 2: Create jest config**

Create `apps/pwa/jest.config.js`:

```js
module.exports = {
  preset: 'jest-expo',
  testMatch: ['**/*.native.test.@(js|jsx)'],
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|react-native-svg|react-native-reanimated|react-native-gesture-handler|react-native-safe-area-context))',
  ],
};
```

In `apps/pwa/package.json` scripts: change `"test": "jest"` to `"test:native": "jest"` (the old `test` script referenced jest without it being installed).

- [ ] **Step 3: Write the failing seed test**

Create `apps/pwa/src/components/__tests__/ErrorBoundary.native.test.js`:

```js
import React from 'react';
import { Text } from 'react-native';
import { render } from '@testing-library/react-native';
import ErrorBoundary from '../ErrorBoundary';

describe('ErrorBoundary (native harness seed)', () => {
  it('renders children when no error occurs', () => {
    const { getByText } = render(
      <ErrorBoundary>
        <Text>contenido visible</Text>
      </ErrorBoundary>
    );
    expect(getByText('contenido visible')).toBeTruthy();
  });

  it('renders fallback instead of children when a child throws', () => {
    const Bomb = () => {
      throw new Error('boom');
    };
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const { queryByText } = render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>
    );
    expect(queryByText('contenido visible')).toBeNull();
    spy.mockRestore();
  });
});
```

- [ ] **Step 4: Run to verify state**

Run: `cd apps/pwa && npm run test:native`
Expected: both tests PASS on first run if harness is correctly configured (the "failing" state here is the harness itself — any preset/transform error means the config is wrong; fix config, not test). If `ErrorBoundary`'s imports (`analyticsService`, `errorReporter`, `environment`) pull web-only globals under jest, mock them at the top of the test file with `jest.mock('../../services/analyticsService', () => ({ track: jest.fn(), init: jest.fn() }))` and equivalents — record any mocks added.

- [ ] **Step 5: Verify vitest still green and does not pick up the native test**

Run: `cd apps/pwa && npx vitest run`
Expected: PASS; suite list does NOT include `ErrorBoundary.native.test.js`.

- [ ] **Step 6: Commit**

```bash
git add apps/pwa/jest.config.js apps/pwa/package.json apps/pwa/package-lock.json apps/pwa/src/components/__tests__/ErrorBoundary.native.test.js
git commit -m "test(pwa): jest-expo + RNTL harness with ErrorBoundary seed"
```

---

### Task 5: DOM-call sweep + prebuild + simulator boot

**Files:**
- Modify: any shared `.js` under `apps/pwa/src` with unguarded `window.`/`document.` reachable from the native nav tree (33 candidate files — most will be legitimately guarded; fix only real violations)
- Create: `apps/pwa/docs-notes-phase0a.md` (temporary sweep log, consumed by Task 8 then deleted)

**Interfaces:**
- Consumes: Task 3's provider tree (app must mount it to boot).
- Produces: a bootable native app on the iOS simulator — Task 6 (Maestro) drives it. Sweep log feeds ARCHITECTURE.md (Task 8).

- [ ] **Step 1: Enumerate candidates**

Run:
```bash
cd apps/pwa && grep -rn "window\.\|document\." src --include="*.js" | grep -v "\.web\.js" | grep -v "__tests__" | grep -v "typeof window" | grep -v "isWeb" | grep -v "Platform.OS === 'web'" > docs-notes-phase0a.md
```

- [ ] **Step 2: Triage each hit**

For each line in the log, check whether an enclosing guard exists (`isWeb`, `Platform.OS === 'web'`, `typeof window !== 'undefined'` earlier in the function/module). Known state from audit: `CourseDetailScreen.js` checkout paths ARE guarded (`mode === 'web'` at :989, `isWeb` at :880) — do not "fix" guarded code. Annotate each hit in the log: `GUARDED`, `UNREACHABLE-FROM-NATIVE-NAV` (e.g., `LabScreen.js` — not in any native navigator), or `VIOLATION`.

- [ ] **Step 3: Fix violations**

For each `VIOLATION` in a file reachable from the native tree (`AppNavigator` → `MainTabNavigator` → `MainStackNavigator`/`ProfileStackNavigator` routes, plus services imported by those screens): wrap with the file's existing platform idiom. Standard fix (matches codebase style, e.g. `WorkoutExecutionScreen.js:1482`):

```js
import { Platform } from 'react-native';
const isWeb = Platform.OS === 'web';
// ...
if (isWeb) {
  // window./document. usage stays here
}
```

Services with module-scope DOM access get `if (typeof window !== 'undefined')` guards instead (module load must not throw on native).

- [ ] **Step 4: Native bundle check**

Run: `cd apps/pwa && npx expo export --platform ios --clear`
Expected: completes without errors.

- [ ] **Step 5: Prebuild and boot the simulator**

```bash
cd apps/pwa && npx expo prebuild --clean --platform ios && npx expo run:ios
```

Expected: app builds and boots to the login screen ("Entra a Wake" visible) on the iOS simulator with no red screen. If a runtime DOM crash appears, its stack identifies a missed violation — return to Step 3. (First prebuild against SDK 54 may surface config-plugin issues — e.g., `GoogleService-Info.plist` path from `app.config.js`; fix within `app.config.js`, never edit `ios/` by hand — it is generated and disposable.)

- [ ] **Step 6: Sign-in smoke by hand**

In the simulator: sign in with the QA account (credentials in the usual place; do not commit them). Expected: reaches home (legacy `MainScreen` — Hoy comes in Phase 2) without crashing. Log any crash + stack in the sweep log; fix if caused by an unguarded DOM call, otherwise record as a Phase 2 item.

- [ ] **Step 7: Commit**

```bash
git add -A apps/pwa/src apps/pwa/docs-notes-phase0a.md
git commit -m "fix(pwa): guard web-only DOM access in shared files; native boots on SDK 54"
```

(`ios/` remains untracked — check `.gitignore` covers `apps/pwa/ios` and `apps/pwa/android`; if not, add them in this commit.)

---

### Task 6: Maestro harness + login smoke flow

**Files:**
- Create: `apps/pwa/.maestro/smoke-login.yaml`
- Create: `apps/pwa/.maestro/README.md`

**Interfaces:**
- Consumes: bootable simulator app (Task 5).
- Produces: `maestro test .maestro/smoke-login.yaml` as the native E2E entry point. Phases 2–7 add one flow + screenshot baseline per converged screen in `.maestro/`.

- [ ] **Step 1: Install Maestro**

```bash
brew install maestro || curl -fsSL "https://get.maestro.mobile.dev" | bash
maestro --version
```

Expected: version prints.

- [ ] **Step 2: Write the smoke flow**

Create `apps/pwa/.maestro/smoke-login.yaml`:

```yaml
appId: com.lab.wake.co
---
- launchApp
- assertVisible: "Entra a Wake"
- takeScreenshot: .maestro/screenshots/smoke-login
```

- [ ] **Step 3: Run it against the simulator**

With the Task 5 build installed on the booted simulator:

```bash
cd apps/pwa && maestro test .maestro/smoke-login.yaml
```

Expected: PASS; screenshot file created. View the screenshot (Read the PNG) and confirm the login screen renders correctly (dark canvas `#1a1a1a`, Inter font, no layout breakage).

- [ ] **Step 4: Document the loop**

Create `apps/pwa/.maestro/README.md`:

```markdown
# Maestro flows

Native E2E flows. One flow + screenshot baseline per converged screen.

Run all: `maestro test .maestro/`
Run one: `maestro test .maestro/<flow>.yaml`

Prereqs: app built and installed on a booted iOS simulator
(`npx expo run:ios`). Screenshots land in `.maestro/screenshots/` and are
committed as visual baselines — regenerate deliberately, review diffs.
```

Add `.maestro/screenshots/` contents to git (baselines are committed by design).

- [ ] **Step 5: Verify the existing Playwright harness still resolves** (spec requires all four harnesses proven)

Run: `cd /Users/emilioloboguerrero/app && npx playwright test --config=tests/e2e/playwright.config.js --list`
Expected: test list prints without config errors. If browsers are missing: `npx playwright install chromium`. Do not run the full suite here (it targets prod-shaped flows); listing proves the harness. Record its status in the sweep log for ARCHITECTURE.md.

- [ ] **Step 6: Commit**

```bash
git add apps/pwa/.maestro
git commit -m "test(pwa): Maestro harness with login smoke flow + baseline screenshot"
```

---

### Task 7: Local SonarQube + first scan

**Files:**
- Create: `tools/sonar/docker-compose.yml`
- Create: `sonar-project.properties` (repo root)
- Modify: root `package.json` (add `sonar` script + `@sonar/scan` devDep)
- Modify: root `.gitignore` (add `.scannerwork/`)

**Interfaces:**
- Produces: `npm run sonar` scans the monorepo against `http://localhost:9000` and fails on quality-gate failure (`sonar.qualitygate.wait=true`). The per-slice dev loop in Phases 2–7 ends with this command green. Token lives in `SONAR_TOKEN` env var (never committed).

- [ ] **Step 1: Compose file**

Create `tools/sonar/docker-compose.yml`:

```yaml
services:
  sonarqube:
    image: sonarqube:community
    depends_on: [db]
    ports: ["9000:9000"]
    environment:
      SONAR_JDBC_URL: jdbc:postgresql://db:5432/sonar
      SONAR_JDBC_USERNAME: sonar
      SONAR_JDBC_PASSWORD: sonar
    volumes:
      - sonarqube_data:/opt/sonarqube/data
      - sonarqube_extensions:/opt/sonarqube/extensions
      - sonarqube_logs:/opt/sonarqube/logs
  db:
    image: postgres:15
    environment:
      POSTGRES_USER: sonar
      POSTGRES_PASSWORD: sonar
      POSTGRES_DB: sonar
    volumes:
      - postgresql_data:/var/lib/postgresql/data
volumes:
  sonarqube_data:
  sonarqube_extensions:
  sonarqube_logs:
  postgresql_data:
```

- [ ] **Step 2: Boot the server**

```bash
docker compose -f tools/sonar/docker-compose.yml up -d
```

Wait until `curl -s http://localhost:9000/api/system/status` returns `"status":"UP"` (first boot takes 1–3 min). Then (user action, browser): log in `admin`/`admin`, change password, create a user token → export as `SONAR_TOKEN` in the shell profile.

- [ ] **Step 3: Scanner config**

Create `sonar-project.properties` at repo root:

```properties
sonar.projectKey=wake
sonar.projectName=Wake
sonar.host.url=http://localhost:9000
sonar.sources=apps/pwa/src,apps/creator-dashboard/src,apps/landing/src,functions/src
sonar.exclusions=**/node_modules/**,**/dist/**,**/build/**,functions/lib/**,**/__tests__/**,**/*.test.*
sonar.tests=functions/tests
sonar.test.inclusions=**/*.test.*
sonar.javascript.environments=browser,node
sonar.qualitygate.wait=true
```

Root `package.json`: add devDep via `npm install --save-dev @sonar/scan` and script `"sonar": "sonar"`. Add `.scannerwork/` to root `.gitignore`.

- [ ] **Step 4: First scan**

```bash
SONAR_TOKEN=$SONAR_TOKEN npm run sonar
```

Expected: scan completes and the quality gate evaluates (first scan on default "Sonar way" gate — new-code period starts here; the legacy issue count is informational, the gate governs new code from this baseline forward). Verify: `curl -s -u "$SONAR_TOKEN:" "http://localhost:9000/api/qualitygates/project_status?projectKey=wake"` returns a status.

- [ ] **Step 5: Commit**

```bash
git add tools/sonar/docker-compose.yml sonar-project.properties package.json package-lock.json .gitignore
git commit -m "chore: local SonarQube Community server + monorepo scanner config"
```

---

### Task 8: ARCHITECTURE.md

**Files:**
- Create: `docs/ARCHITECTURE.md`
- Delete: `apps/pwa/docs-notes-phase0a.md` (content absorbed)

**Interfaces:**
- Consumes: sweep log (Task 5), provider tree (Task 3), harness map (Tasks 2/4/6/7).
- Produces: the canonical system map per spec §8. Phases 2–7 update it as their docs exit criterion.

- [ ] **Step 1: Write the doc**

Create `docs/ARCHITECTURE.md` with these sections (write real content from this phase's outcomes, not stubs):

```markdown
# Wake Architecture

## Apps and entry points
[monorepo table: landing / pwa (web + native entries via index.js Platform branch) / creator-dashboard / functions]

## PWA provider tree (both platforms)
[the converged tree from Task 3, and the rule: App.web.js and App.js must keep provider parity; queryPersistence is platform-split (IndexedDB web / AsyncStorage native)]

## Navigation shells
[React Router (web, WebAppNavigator ~35 routes) vs React Navigation (native, AppNavigator). Route-parity rule: every web route gets a native registration — current native gaps listed from the Phase 0 audit (Nutrition, Lab, Support, Bundles, Resources, VideoExchange, Events). Phase 2 begins closing them.]

## Platform-split registry (sanctioned exceptions)
[nav shell, BottomTabBar, modal/toast/overlay primitives, PDF viewer, charts layer, InstallScreen (web-only), EmailLink (web-only), payment redirect screens (web-only). Everything else: one shared file. Findings from the Task 5 sweep with GUARDED/UNREACHABLE/FIXED annotations.]

## Thin-client policy
[rule from spec §5: business rules in the API, client renders state and queues mutations; sanctioned offline exception for workout execution]

## Test harnesses
[vitest (functions: unit/rules/api/security/concurrency — see functions/package.json scripts; pwa: pure logic), jest-expo+RNTL (`npm run test:native`, `*.native.test.js`), Playwright (root `npm run test:e2e`), Maestro (`apps/pwa/.maestro/`), SonarQube local (`npm run sonar`, gate on new code)]
```

- [ ] **Step 2: Delete the temp sweep log, commit**

```bash
git rm apps/pwa/docs-notes-phase0a.md
git add docs/ARCHITECTURE.md
git commit -m "docs: ARCHITECTURE.md — system map, platform-split registry, harness map"
```

---

### Task 9: EAS development build (final gate)

**Files:** none (remote build)

**Interfaces:**
- Consumes: everything above merged into `native-revival-phase0`.
- Produces: proof that the cloud build path works — Phases 2–7 ship TestFlight builds through it.

- [ ] **Step 1: Kick off the build** (requires user's EAS auth; may prompt for credentials)

```bash
cd apps/pwa && npx eas-cli build --platform ios --profile development
```

- [ ] **Step 2: Verify green**

Expected: build completes on EAS servers. If it fails, the log identifies the config-plugin or dependency issue — fix in `app.config.js`/`package.json` (never in generated `ios/`), commit, re-run.

- [ ] **Step 3: Report Phase 0a complete**

Summarize to the user: what boots, what's fixed, harness commands, sweep findings, and the Phase 1/2 readiness state. Do not merge to `main` without explicit user confirmation.
