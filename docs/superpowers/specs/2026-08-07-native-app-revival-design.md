# Native App Revival + App Store Commerce — Design

**Date:** 2026-08-07
**Status:** Draft — pending user review
**Scope:** Revive the native iOS/Android app to full PWA parity, add App Store IAP commerce alongside MercadoPago/Polar, and build the quality rails (tests, CI/CD, docs) the codebase currently lacks.

---

## 1. Context

- Only the PWA (`/app`) is live. The native app has not shipped since Dec 2025 (buildNumber 54, commit "progress towards iap") and is structurally dead: native boots the legacy pre-Hoy home, `App.js` lacks the React Query provider tree, ~50 components exist only as `.web.*`, Nutrition is a hard fork (947-line native relic vs 6,539-line web version), and shared purchase code calls `window.open` unguarded.
- Acquisition happens via creator Instagram → web buy page. The native app's primary job is retention (push notifications, offline, native UX); the App Store becomes a secondary sales channel.
- App Store policy (verified 2026-08): the "cheaper on web" link-out is US-storefront only — Colombian users never see it. Guideline 3.1.3(b) lets web purchases unlock in-app, but reviewers commonly demand IAP for consumer digital content. Decision: **IAP from day one**. Apple's cut for Wake is **15%** (Small Business Program, <$1M/yr), not 30%.

## 2. Locked decisions

| Decision | Choice |
|---|---|
| Monetization | IAP from day one, alongside unchanged web checkout (MP CO / Polar intl) |
| IAP catalog | **Full parity** — every published program auto-creates App Store products via ASC API |
| iOS pricing | Derived: web COP ÷ 0.85 → nearest Apple COP price point. Buyer pays the Apple premium; creator/Wake net ~same per channel. Creators never configure Apple anything |
| Native v1 scope | **Full PWA parity** (minus web-inherent screens: PWA install, email-link landing, payment redirect pages) + push notifications |
| Architecture | **Converge + exceptions** — shared implementations for product surfaces; platform splits only where earned |
| Client weight | **Thin client** — business rules live in the API; client renders state and queues mutations (see §5) |
| Quality bar | SonarQube quality gate on new/changed code; concurrency, security, and frontend tests as first-class deliverables (see §6) |
| Docs | Docs-as-code: same-PR updates, per-phase docs exit criteria (see §8) |
| Release strategy | **Early App Review**: submit at training core + IAP (quiet or unlisted launch, no announcement); updates iterate to parity; public launch at parity. De-risks first-review rejection cycles early |
| Execution model | Fast path: minimal blocking foundation, then parallel tracks via isolated worktrees (commerce backend ∥ frontend surfaces); Apple's external clocks fired in week 1 (see §9) |

## 3. Commerce model

### 3.1 Channels
Web checkout (MercadoPago for CO, Polar for international) stays exactly as-is — primary channel, ~5% fees, fed by creator funnels. iOS IAP is added as a third channel; Google Play Billing follows as a fourth (same code via RevenueCat; Google small-business tier is also 15%).

### 3.2 Product automation (ASC API)
On program publish, a Cloud Function calls the App Store Connect API (JWT auth, key in Secret Manager):
1. Create a subscription group per program; an auto-renewable subscription for monthly pricing; non-renewing products for fixed-duration access (3/6/12-month) — mirroring what the program sells on web.
2. Set the derived COP price; Apple auto-derives other storefronts.
3. Submit products for review; poll status.
4. Course doc gets `ios_purchasable: true` only on approval (new products clear in ~24–48h, so drops go live on iOS with a small lag). Rejections alert via Wake Ops Telegram.

### 3.3 Entitlements — single writer
- Client side: **RevenueCat** (`react-native-purchases`) handles StoreKit, receipts, Restore Purchases. The deprecated `expo-in-app-purchases` dependency is deleted.
- Server side: RevenueCat webhook → new internal route in the `api` function → writes the **same** `users/{uid}.courses` map and `subscriptions` records as MP/Polar webhooks, with `channel: 'mercadopago' | 'polar' | 'apple'` and net proceeds recorded for the payout ledger (finance-snapshot extended).
- Identity: purchases tagged with Firebase UID via `appAccountToken` — web-vs-app ownership never fragments; already-owned programs show as owned on iOS, no double-buy.
- Refunds: Apple refund server notification revokes access (mirrors `applyMpRefund`).

### 3.4 Exclusions and compliance
- `one_on_one` programs: off the iOS storefront (creator-invited, custom-priced); content unlocks under multiplatform access. Live 1:1 call bookings may keep external payment (realtime person-to-person exception, 3.1.3(d)).
- Bundles: iOS only if trivially mappable to products; otherwise web-only at first.
- Zero mention of web pricing anywhere in the iOS app. IAP subs manage via Apple's sheet; web subs shown neutrally as managed elsewhere.
- Action item: enroll in the App Store Small Business Program in App Store Connect.

## 4. Native architecture — converge + exceptions

- **Root:** one shared app root; `App.js` mounts the same provider tree as `App.web.js` (React Query + persistence, `UserRoleContext`, all contexts) with a platform-split shell.
- **Navigation:** two shells stay (React Router web / React Navigation native) with a **route-parity rule** — every web route gets a native registration. Kills the current dead buttons (`Support`, `Library`, `BundleDetail`, etc.).
- **Sanctioned platform splits:** nav shell, BottomTabBar, modal/toast/overlay primitives, PDF viewer, charts layer (Lab web charts are DOM-based; native uses `react-native-svg` equivalents behind a shared data interface). Everything else converges to single files per CLAUDE.md's "one file both platforms" default.
- **Known repairs:** unguarded DOM calls in shared files (`CourseDetailScreen.js:990,1101` confirmed; audit `profilePictureService`, `PRsScreen`, `analyticsService`, `sessionManager`); `LabScreen.js:33` imports `WakeModalOverlay.web` explicitly; duplicate `WakeHeader.web.js`/`.web.jsx`; fresh SDK 54 `expo prebuild`.
- **Push notifications:** `expo-notifications`, token registry in Firestore, sends from functions. v1 minimal: workout reminders + coach-update notifications.

## 5. Thin-client policy

**Rule: new business rules live in the API. The client renders server state and queues mutations.**

- The Phase 3 API already embodies this ("the app is just another client"). Converging native onto the same services/hooks gets thin-client largely for free.
- As each surface converges, business logic found in screens (gating, calculations, derived domain state) is extracted: server-appropriate logic moves behind existing/new API endpoints; interaction logic moves to hooks/services. Screens end as rendering + event wiring.
- **Sanctioned exception — offline workout execution:** set-by-set logging cannot require a network round trip per set (gyms have bad signal; Firestore/function invocations cost money). The execution flow keeps local interaction state and an offline mutation queue that syncs via the API. The server remains the source of truth on completion (`/workout/complete`).
- Target: `WorkoutExecutionScreen` (7.4k lines) and `NutritionScreen` shed embedded domain logic as they converge — no big-bang rewrite, extraction happens per phase.

## 6. Testing strategy

Standard we aim at: **SonarQube quality gate passing on all new/changed code**, plus the suites below. Retrofit strategy is "Clean as You Code": the gate applies to new code; legacy issues burn down as surfaces converge — the whole repo is not required to pass day one (that would stall everything).

### 6.1 Backend (functions/)
- **Unit tests:** vitest against route handlers with Firebase emulators (Firestore + Auth). Coverage priority: entitlement webhooks (MP, Polar, Apple/RevenueCat), access gating, checkout endpoints.
- **Concurrency tests** (emulator + parallel invocation bursts):
  - Webhook idempotency: N identical concurrent deliveries → exactly one entitlement write (`processed_payments` guard).
  - Event registration vs `max_registrations` (regression for the SHAKEOUT capacity bug).
  - Purchase cap / waitlist admission race (`courses.capacity`).
  - Monthly-drops cron atomicity.
- **Security tests:**
  - Firestore rules tests (`@firebase/rules-unit-testing`): per-collection access matrix — cross-user subcollection denial, nutrition assignee read rule, `course_private_resources` gating (regression for the resources leak).
  - API authz: creator endpoints reject non-owners (IDOR regression), rate-limit behavior, App Check posture documented.
  - CI static checks: Sonar security hotspots, `npm audit`/OSV, gitleaks secret scanning.

### 6.2 Frontend
- **Component/logic tests:** vitest + React Native Testing Library for shared code (runs for both platforms).
- **Web E2E:** Playwright — flows + screenshots on the PWA and creator dashboard.
- **Native E2E:** **Maestro** — YAML flows on the iOS simulator with screenshot steps. Flows live in `.maestro/` and accumulate into the regression suite.
- **Per-screen visual loop (the working method):** when a screen converges, the agent runs the web version (Playwright screenshot = reference), runs the native app in the simulator, drives a Maestro flow to the screen, screenshots it, visually compares against the web reference and STANDARDS.md, adjusts, repeats. The final flow + screenshots are committed as the screen's regression baseline. Every converged screen ships with: component tests, a Maestro flow, and baseline screenshots.

### 6.3 SonarQube — DECIDED: self-hosted Community Build, local-first
- **Server:** SonarQube Community Build (free) via Docker Compose on the dev Mac (sonarqube + postgres, persistent volumes so analysis history and the new-code baseline survive restarts).
- **Primary enforcement point — the agent dev loop, not CI:** after each slice, the agent runs `sonar-scanner` locally, waits on the quality gate (`sonar.qualitygate.wait=true`), reads findings via the Web API, and fixes them before the slice is considered done. This is where findings actually get fixed immediately.
- **Community Build limitation (accepted):** no PR decoration / branch analysis — it analyzes one branch (main). Clean-as-You-Code still works via the new-code period on main with persistent history. GitHub-hosted runners cannot reach a laptop-local server, and an ephemeral Sonar container inside CI loses history (breaking new-code scoping), so Sonar is deliberately **not** a GitHub-hosted PR check.
- **CI carries the rest:** ESLint, `tsc`, vitest coverage thresholds, gitleaks, npm audit remain the GitHub Actions gates.
- **Optional upgrade later:** a self-hosted GitHub Actions runner on the same Mac can make the Sonar gate a required PR check (workflow reaches localhost); revisit if/when a second developer joins.

## 7. CI/CD (GitHub Actions)

- **Every PR:** ESLint + `tsc` build (functions) · vitest unit suites (functions, pwa, creator) · Firestore rules tests · web builds (landing, creator, PWA export) · Sonar scan + quality gate · gitleaks · npm audit.
- **Merge to main:** all of the above + full concurrency suite (emulators).
- **Release (manual dispatch):** EAS build → Maestro E2E suite on macOS runner → `eas submit` to TestFlight. Native builds are not per-PR (EAS/macOS runner cost); Maestro runs locally in the dev loop and in CI at release + nightly.
- **Deploys unchanged:** local `firebase deploy` primary, `deploy-prod.yml` backup. Deploys always require explicit confirmation — CI never auto-deploys to prod.

## 8. Documentation policy

**Rule: documentation updates ship in the same PR as the change they describe. A phase is not done until its docs exit criterion is met.**

Canonical set (anything else is disposable and may be deleted when stale):
- `CLAUDE.md` — agent/ops briefing. Updated when structure, commands, or integrations change.
- `docs/STANDARDS.md` — UI system (existing).
- `docs/API_ENDPOINTS.md` — every endpoint, updated with any route change.
- `docs/PAYMENTS.md` — **new, consolidates** POLAR_INTEGRATION_STATUS + MP notes + Apple/RevenueCat: channels, webhooks, product automation, ledger, refund semantics.
- `docs/TESTING.md` — **new**: how to run/write each suite, emulator setup, Maestro/Playwright conventions, Sonar gate.
- `docs/ARCHITECTURE.md` — **new**: system map including native (provider tree, navigation shells, platform-split registry, thin-client rules, offline queue).
- Phase 0 includes a true-up pass of the existing canonical docs (they are currently outdated).

## 9. Phase plan (fast path)

**Key porting insight:** the PWA is Expo web, so `.web.jsx` forks are already React Native code (RN primitives via react-native-web). Converging a surface is mostly swapping web-only sub-components and guarding DOM calls — not rewriting. This compresses Nutrition from ~3–4 weeks to ~1–1.5, and similarly for Hoy. Genuine rewrites remain only where DOM is structural: Lab charts, PDF viewer, some overlay primitives.

**Week-1 external clocks** (fired immediately, in parallel with all dev — these run on Apple's calendar, not ours):
1. Paid Apps agreement + banking/tax setup in App Store Connect (never needed before — web sales only; blocks even sandbox IAP products).
2. Small Business Program enrollment.
3. ASC API key, RevenueCat account, Sonar account.
4. One test IAP product submitted early to measure real product-review latency before automation depends on it.

**Parallelization:** Phase 0a is the only serial bottleneck. After it, commerce (Phase 1) shares zero files with frontend convergence and runs fully parallel; frontend surfaces touch disjoint files and run as parallel worktree slices, integrated per-slice. Each slice lands on TestFlight as it completes.

**Early submission:** App Review submission happens when training core + IAP are green (target ~week 4–6), as a quiet or unlisted release with no announcement. Subsequent updates iterate to parity; public launch only at parity.

| Phase | Deliverable | Docs exit criterion |
|---|---|---|
| **0a. Blocking foundation (~1 wk)** | Provider-tree convergence, DOM-call audit, delete `expo-in-app-purchases`, SDK 54 prebuild, EAS build green, test harnesses (vitest+emulators, RNTL, Playwright, Maestro) proven with one seed test each | ARCHITECTURE.md created |
| **0b. Rails (parallel with 2+)** | Full CI pipeline live (§7), Sonar wired as required check, remaining seed suites, existing-docs true-up | TESTING.md created; docs true-up |
| **1. Commerce backend** | ASC product automation, RevenueCat + webhook route, `channel` field + ledger, refund revocation, Small Business Program enrollment. Testable in sandbox without the native storefront | PAYMENTS.md created (consolidation) |
| **2. Hoy + navigation** | Native Hoy (converged), route-parity registry, dead buttons fixed | ARCHITECTURE.md nav section |
| **3. Workout flow + push** | Shared flow verified native (warmup/execution/completion), offline queue formalized, push notifications v1 | ARCHITECTURE.md offline/push sections |
| **4. Storefront + IAP client** | Library/course detail purchase via RevenueCat sheet, Restore Purchases, owned-state parity | PAYMENTS.md client section |
| **5. Nutrition convergence** | Web fork reconciled to shared implementation; 947-line relic deleted; logic extraction per §5 | API_ENDPOINTS.md nutrition true-up |
| **6. Lab + charts** | Shared data interface; native `react-native-svg` chart layer | STANDARDS.md charts section |
| **7. Remaining surfaces** | Resources (native PDF viewer), bundles, video exchange, support, events tooling | per-surface notes |
| **R1. Early submission (after 3+4)** | App Review submission with training core + IAP (QA account as demo, review notes on multiplatform model); quiet or unlisted release | PAYMENTS.md compliance section |
| **8. Parity + public launch** | Full Maestro regression pass, parity update shipped, public announcement, Android fast-follow via Play Billing | CLAUDE.md final true-up |

**Per-screen workflow (applies to every slice in phases 2–7):**
converge code → extract logic per thin-client policy (§5) → component tests → visual loop (§6.2: simulator + Maestro + screenshots vs web reference) → Maestro flow + baselines committed → docs updated → Sonar gate green → TestFlight.

## 10. Effort and risks

- Fast-path targets: Phase 0a ~1 week · commerce track ~3–4 weeks (fully parallel) · early App Review submission ~week 4–6 · parity ~week 8–12. Serial fallback if parallelization underdelivers: 3–5 months. TestFlight usable continuously from Phase 2.
- **Risks:** App Review rejection cycles (mitigated by early submission — cycles run in parallel with remaining dev) · Paid Apps agreement/banking latency in week 1 · ASC automation review latency per product (measured early via test product) · charts rebuild underestimation · integration overhead of parallel worktree slices (mitigate: disjoint-file slicing, per-slice integration) · CI macOS runner cost (release/nightly cadence) · Sonar pricing tier (open decision §6.3).

## 11. Out of scope

- Changing the web business model, pricing, or MP/Polar integrations.
- Playbook-style single app-wide subscription.
- TCAC Colombian foods phase, and any feature work not already in the PWA.
- US-storefront external purchase links (revisit if/when US users matter; legal landscape still moving — SCOTUS pending).
