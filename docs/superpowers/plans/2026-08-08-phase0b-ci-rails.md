# Phase 0b — CI Pipeline + TESTING.md Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every PR and main-merge runs lint, typecheck, unit suites, rules tests, web builds, secret scanning, and dependency audit automatically — plus a manual-dispatch EAS build workflow — with TESTING.md documenting every harness.

**Architecture:** One `ci.yml` workflow with parallel jobs per concern (functions, web units, web builds, security scans); emulator-dependent functions suites run via `firebase emulators:exec`; heavy API/chains suites run on main-merges only. SonarQube stays local-only by design (spec §6.3) — CI carries ESLint/tsc/vitest/gitleaks/audit. No CI job ever deploys.

**Tech Stack:** GitHub Actions (ubuntu-latest), actions/setup-node@v4 (Node 22), actions/setup-java@v4 (emulators), firebase-tools emulators:exec, gitleaks/gitleaks-action@v2, vitest, jest-expo, eas-cli.

## Global Constraints

- **CI never deploys.** No job may run `firebase deploy` or push to hosting. `deploy-prod.yml` stays untouched and manual.
- All work on branch **`phase0b-ci-rails`** — never on `main`.
- Do not modify `deploy-prod.yml`, `notify-buyers.yml`, `claude.yml`, `claude-code-review.yml`.
- JS apps stay JavaScript; functions stay TypeScript. No new dependencies in app packages (CI tooling lives in workflows only).
- Docs are canonical: every cited path/script in TESTING.md and CLAUDE.md edits must exist in the repo.
- Workflows cannot be fully verified until pushed (user's decision when). Local verification = actionlint (or `python3 -c "import yaml"`) parse + running each job's commands locally. State this honestly in reports — never claim "CI verified green" pre-push.
- Known environment facts: functions rules tests need Firestore+Auth+Storage emulators (`demo-` project id, no credentials); API/chains tests additionally need the Functions emulator, a compiled `functions/lib/`, and env `WAKE_RUN_API_TESTS=1`; creator-dashboard has `test` (vitest) and `test:rules` (own config); pwa has `test:unit` (vitest) + `test:native` (jest-expo); Playwright E2E targets prod-shaped flows — NOT run in CI this phase.

---

### Task 1: Core CI workflow — web units + web builds

**Files:**
- Create: `.github/workflows/ci.yml`

**Interfaces:**
- Produces: workflow `CI` with jobs `web-units`, `build-landing`, `build-creator`, `build-pwa` triggered on `pull_request` and `push: branches: [main]`. Task 2 appends the functions jobs to this same file; Task 3 appends scan jobs.

- [ ] **Step 1: Create the branch**

```bash
cd /Users/emilioloboguerrero/app && git checkout -b phase0b-ci-rails
```

- [ ] **Step 2: Write the workflow**

Create `.github/workflows/ci.yml`:

```yaml
name: CI

on:
  pull_request:
  push:
    branches: [main]

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

jobs:
  web-units:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
          cache-dependency-path: |
            apps/pwa/package-lock.json
            apps/creator-dashboard/package-lock.json
      - name: PWA unit tests (vitest)
        run: |
          cd apps/pwa
          npm ci
          npm run test:unit
      - name: PWA native component tests (jest-expo)
        run: |
          cd apps/pwa
          npm run test:native
      - name: Creator dashboard tests (vitest)
        run: |
          cd apps/creator-dashboard
          npm ci
          npm test

  build-landing:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
          cache-dependency-path: |
            package-lock.json
            apps/landing/package-lock.json
      - name: Build landing
        run: |
          npm ci
          cd apps/landing && npm ci && cd ../..
          npm run build:landing

  build-creator:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
          cache-dependency-path: |
            package-lock.json
            apps/creator-dashboard/package-lock.json
      - name: Build creator dashboard
        run: |
          npm ci
          cd apps/creator-dashboard && npm ci && cd ../..
          npm run build:creator

  build-pwa:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
          cache-dependency-path: |
            package-lock.json
            apps/pwa/package-lock.json
      - name: Build PWA (web export)
        run: |
          npm ci
          cd apps/pwa && npm ci && cd ../..
          npm run build:pwa
      - name: Verify prod Firebase project in bundle
        run: |
          grep -rl "wolf-20b8b" apps/pwa/dist/ | head -1 || (echo "wolf-20b8b missing from bundle (Metro cache gotcha)" && exit 1)
```

- [ ] **Step 3: Validate YAML parses**

Run: `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml'))" && echo OK`
Expected: OK. If `actionlint` is installed (`brew list actionlint`), also run `actionlint .github/workflows/ci.yml` — zero findings.

- [ ] **Step 4: Verify each job's commands locally (the honest pre-push check)**

Run each job's core command from a clean-ish state and confirm green:
```bash
cd /Users/emilioloboguerrero/app/apps/pwa && npm run test:unit && npm run test:native
cd /Users/emilioloboguerrero/app/apps/creator-dashboard && npm test
cd /Users/emilioloboguerrero/app && npm run build:landing && npm run build:creator
```
Expected: all green (skip re-running `build:pwa` — it ran minutes ago in Phase 0a's final verification; note that in the report). If creator tests fail for pre-existing reasons, STOP and report — do not mask with `continue-on-error`.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: web unit suites and build checks on PR and main"
```

---

### Task 2: Functions CI jobs — lint, typecheck, rules tests, main-only API suites

**Files:**
- Modify: `.github/workflows/ci.yml` (append jobs)

**Interfaces:**
- Consumes: Task 1's workflow skeleton.
- Produces: jobs `functions-check` (every PR: eslint + tsc + emulator rules tests) and `functions-deep` (main pushes only: API + security chains suites with the Functions emulator).

- [ ] **Step 1: Append the jobs**

Append to `.github/workflows/ci.yml` under `jobs:`:

```yaml
  functions-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
          cache-dependency-path: functions/package-lock.json
      - uses: actions/setup-java@v4
        with:
          distribution: temurin
          java-version: 21
      - name: Install
        run: cd functions && npm ci
      - name: Lint
        run: cd functions && npm run lint
      - name: Typecheck + build
        run: cd functions && npx tsc --noEmit
      - name: Rules tests (Firestore/Auth/Storage emulators)
        run: |
          cd functions
          npx firebase-tools emulators:exec --only firestore,auth,storage --project demo-wake "npm run test:rules"

  functions-deep:
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
          cache-dependency-path: functions/package-lock.json
      - uses: actions/setup-java@v4
        with:
          distribution: temurin
          java-version: 21
      - name: Install + build
        run: cd functions && npm ci && npm run build
      - name: API + chains suites (full emulator set)
        run: |
          cd functions
          WAKE_RUN_API_TESTS=1 npx firebase-tools emulators:exec --only functions,firestore,auth,storage --project demo-wake "npm run test:security:full"
```

- [ ] **Step 2: Validate YAML parses**

Run: `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml'))" && echo OK`

- [ ] **Step 3: Verify the PR-path commands locally**

```bash
cd /Users/emilioloboguerrero/app/functions && npm run lint && npx tsc --noEmit
npx firebase-tools emulators:exec --only firestore,auth,storage --project demo-wake "npm run test:rules"
```
Expected: lint + typecheck green; rules suite green under emulators. If any rules test fails pre-existing, STOP and report with the failure list (do not fix rules in this task).
Also run the deep path ONCE locally to prove the command works (it is main-only in CI): `npm run build && WAKE_RUN_API_TESTS=1 npx firebase-tools emulators:exec --only functions,firestore,auth,storage --project demo-wake "npm run test:security:full"` — record result; if it fails for environmental reasons (port conflicts with the running SonarQube Docker etc.), diagnose and document, adjusting only emulator ports via flags if needed.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: functions lint, typecheck, and emulator test suites"
```

---

### Task 3: Security scan jobs — gitleaks + npm audit

**Files:**
- Modify: `.github/workflows/ci.yml` (append jobs)
- Create: `.gitleaks.toml` (only if the baseline scan needs allowlisting — see Step 2)

**Interfaces:**
- Consumes: Task 1's workflow.
- Produces: jobs `gitleaks` (full-history secret scan) and `dep-audit` (npm audit, blocking at critical for production deps).

- [ ] **Step 1: Append the jobs**

```yaml
  gitleaks:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: gitleaks/gitleaks-action@v2
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}

  dep-audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - name: Audit production deps (blocking at critical)
        run: |
          for dir in functions apps/pwa apps/creator-dashboard apps/landing; do
            echo "== $dir =="
            (cd "$dir" && npm audit --omit=dev --audit-level=critical)
          done
```

- [ ] **Step 2: Run gitleaks locally against the repo**

```bash
brew list gitleaks >/dev/null 2>&1 || brew install gitleaks
cd /Users/emilioloboguerrero/app && gitleaks detect --source . --log-opts="--all" --verbose 2>&1 | tail -20
```
Expected: ideally zero leaks. If it flags known-benign strings (the local-only `sonar`/`postgres` docker passwords in `tools/sonar/docker-compose.yml`, Firebase client API keys in `src/config/firebase.js` — those are public client config, not secrets), create `.gitleaks.toml` with a minimal allowlist covering ONLY those paths/rules, re-run, and confirm clean. If it flags anything that looks like a REAL secret in history, STOP immediately and report BLOCKED with the finding — do not allowlist real secrets.

- [ ] **Step 3: Run the audit locally**

```bash
cd /Users/emilioloboguerrero/app && for dir in functions apps/pwa apps/creator-dashboard apps/landing; do echo "== $dir =="; (cd "$dir" && npm audit --omit=dev --audit-level=critical) || echo "AUDIT FAILED: $dir"; done
```
Expected: all pass at critical level. If a critical vulnerability exists, report it (with the advisory) rather than raising the threshold.

- [ ] **Step 4: Validate YAML + commit**

```bash
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml'))" && echo OK
git add .github/workflows/ci.yml .gitleaks.toml 2>/dev/null || git add .github/workflows/ci.yml
git commit -m "ci: gitleaks secret scan and production dependency audit"
```

---

### Task 4: Manual-dispatch EAS build workflow

**Files:**
- Create: `.github/workflows/eas-build.yml`

**Interfaces:**
- Produces: workflow `EAS Build` (workflow_dispatch only) that runs `eas build` from CI using an `EXPO_TOKEN` repo secret. The secret does not exist yet (user action) — the workflow must fail with a clear message if absent, and TESTING.md (Task 5) documents the setup.

- [ ] **Step 1: Write the workflow**

Create `.github/workflows/eas-build.yml`:

```yaml
name: EAS Build

on:
  workflow_dispatch:
    inputs:
      platform:
        description: "Platform"
        required: true
        default: ios
        type: choice
        options: [ios, android]
      profile:
        description: "EAS build profile"
        required: true
        default: development
        type: choice
        options: [development, preview, production]

jobs:
  eas-build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - name: Require EXPO_TOKEN
        run: |
          if [ -z "${{ secrets.EXPO_TOKEN }}" ]; then
            echo "::error::EXPO_TOKEN secret is not configured. Create a token with 'npx eas-cli token:create' (or expo.dev → Access tokens) and add it as a repo secret named EXPO_TOKEN."
            exit 1
          fi
      - name: Install PWA deps
        run: cd apps/pwa && npm ci
      - name: EAS build
        env:
          EXPO_TOKEN: ${{ secrets.EXPO_TOKEN }}
        run: |
          cd apps/pwa
          npx eas-cli build --platform ${{ inputs.platform }} --profile ${{ inputs.profile }} --non-interactive --no-wait
```

- [ ] **Step 2: Validate YAML parses**

Run: `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/eas-build.yml'))" && echo OK`

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/eas-build.yml
git commit -m "ci: manual-dispatch EAS build workflow (requires EXPO_TOKEN secret)"
```

---

### Task 5: docs/TESTING.md

**Files:**
- Create: `docs/TESTING.md`

**Interfaces:**
- Consumes: everything above + Phase 0a harnesses.
- Produces: the canonical testing doc (spec §8). Every command it cites must exist and run.

- [ ] **Step 1: Write the doc**

Create `docs/TESTING.md` covering, with real commands verified against package.json files (not from memory):

```markdown
# Wake Testing Guide

## Harness map
[table: layer | tool | command | where | notes — rows for:
 functions unit/rules/api/chains (vitest + emulators, the four npm scripts and what each needs),
 pwa logic (vitest, `npm run test:unit`, `*.test.js` excluding `*.native.test.*`),
 pwa native components (jest-expo+RNTL, `npm run test:native`, `*.native.test.js`),
 creator dashboard (vitest `npm test`, rules `npm run test:rules`),
 web E2E (Playwright, root `npm run test:e2e`, prod-shaped — NOT in CI),
 native E2E (Maestro, `maestro test .maestro/` from apps/pwa, committed baselines),
 code quality (SonarQube local: server boot command, `npm run sonar`, SONAR_TOKEN, gate scope = new code, why it is NOT a CI check per spec §6.3)]

## CI (GitHub Actions)
[what runs on PR vs main vs manual dispatch, per ci.yml and eas-build.yml as actually written in Tasks 1-4; the EXPO_TOKEN setup instructions; the "CI never deploys" rule]

## Conventions
[naming patterns; where each kind of test lives; per-screen workflow from spec §9 (component tests + Maestro flow + baseline per converged screen); emulator ports/prereqs (Java); the it()/it.fails() convention from functions/tests/README.md]

## Known gaps (honest)
[coverage thresholds deliberately not set on legacy code — ratchet decision deferred; Playwright not in CI; Maestro local-only cadence; native OTP sign-in smoke pending user-assisted run]
```

Write real content in every section — the bracketed text above describes what to write, not stub text to paste. Aim 120-200 lines. English, no emojis, match existing docs style.

- [ ] **Step 2: Verify every cited command**

For each command cited in the doc, confirm the script exists in the corresponding package.json (`grep` it) — list the verification in your report. Do not re-run long suites for this; existence + Phase 0a/0b run evidence suffices.

- [ ] **Step 3: Commit**

```bash
git add docs/TESTING.md
git commit -m "docs: TESTING.md — harness map, CI reference, conventions"
```

---

### Task 6: CLAUDE.md true-up

**Files:**
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: final state of Tasks 1-5 + Phase 0a deliverables.
- Produces: CLAUDE.md that matches reality (it is auto-loaded into every agent session — staleness propagates into every future task).

- [ ] **Step 1: Apply the corrections**

Verified-stale items to fix (re-verify each against the repo before editing, cite in report):
1. `docs/STANDARDS.md` reference → actual path `docs/Brand/STANDARDS.md` (file moved April 2026).
2. Monorepo structure section: add `apps/developer-portal/` (exists, has build scripts) and `tools/sonar/`; note `docs/ARCHITECTURE.md` and `docs/TESTING.md` as canonical references.
3. Build & Deploy Commands section: add a "Tests & quality" subsection listing the real commands (functions suites, pwa `test:unit`/`test:native`, creator `test`, root `test:e2e`, `maestro test .maestro/`, `npm run sonar`) and the CI workflows (`ci.yml` on PR/main, `eas-build.yml` manual, existing `deploy-prod.yml` manual).
4. Native app status note: replace any implication that native is dormant with one line — native revived in Phase 0a (see ARCHITECTURE.md), IAP commerce is Phase 1 (see spec).
Do NOT restructure CLAUDE.md or reword unrelated sections — surgical edits only.

- [ ] **Step 2: Verify no other stale path in the edited sections**

For each path/command your edit touches or sits adjacent to, `ls`/`grep` it. Report the checks.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: CLAUDE.md true-up — paths, test commands, CI, native status"
```
