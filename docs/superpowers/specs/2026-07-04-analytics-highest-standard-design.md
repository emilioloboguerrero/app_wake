# Analytics & Error Detection — Highest Standard

**Date:** 2026-07-04
**Scope approved by:** Emilio — "defectos + zonas ciegas web; nativo aparte; alertas a Telegram #signals + email; digests silencio-cuando-limpio"

## Context

Full audit (2026-07-04) found the observability stack is two systems — PostHog (product analytics, replay, client exceptions, server events) and Wake Ops (Cloud Logging digests → Telegram, client-error ingest with sourcemaps). Seven concrete defects and several web blind spots were identified. Native app instrumentation is explicitly out of scope (separate project).

## Workstreams

### W1 — Clean signal

1. **Fix `dropBenignAbortErrors`** in `apps/pwa/src/services/analyticsService.js`. Real exceptions arrive as `$exception_types: ["DOMException"]` with values starting `"AbortError: …"`; the filter matches `type === 'AbortError'` and therefore never drops anything. New matcher: drop `$exception` events where any `$exception_list` entry has `type === 'AbortError'` OR (`type === 'DOMException'` AND value/message starts with `'AbortError'`). `NotSupportedError` stays visible (possible real codec signal).
2. **Backlog cleanup in PostHog:** suppress the existing AbortError issues; resolve the two `LevelPlan*` ReferenceErrors (came from a local dev session) and stale one-offs, so Error Tracking starts from zero.
3. **Quiet-when-clean digests:** `functions/src/ops/clientErrors.ts` (`snap.empty` branch, ~L218) and `functions/src/ops/logsDigest.ts` (~L620) stop posting "All quiet" to Telegram; they post only when there is something to report. The 12h heartbeat already proves liveness. Log a `functions.logger.info` marker instead so the run is still traceable.

### W2 — Real-time alerts (PostHog → Telegram + email)

- New export `wakePosthogAlertsWebhook` in `functions/src/index.ts`, handler in `functions/src/ops/posthogAlerts.ts`. Validates a shared secret (Secret Manager: `POSTHOG_ALERTS_SECRET`), formats the PostHog error-tracking webhook payload, posts to Telegram `#signals` with a `[posthog-alerts]` source tag per Wake Ops conventions. Invalid secret → 401; malformed → 200 (don't make PostHog retry forever) with a warn log.
- PostHog config (via MCP, after deploy): error-tracking alerts for **issue created**, **issue reopened**, **issue spiking** → two destinations each: the webhook + email to Emilio.

### W3 — PWA instrumentation defects

1. **`workout.session_started`** fires exactly once per physical session on every entry path (Hoy→warmup currently bypasses it; only DailyWorkoutScreen fires it). Add `entry_path` prop; dedup guard keyed on session identity so remounts/refreshes don't re-fire. Exact insertion points per investigation.
2. **Magic-link auth tracking:** `auth.login` / `auth.signup_completed` with `method: 'email_link'` in `EmailLinkSignInScreen.web.jsx`, using `getAdditionalUserInfo(...).isNewUser` to distinguish.
3. **PII scrub:** in the same screen, capture `window.location.href` to memory then `history.replaceState` to a clean path immediately on mount, before PostHog replay/pageview can persist the `oobCode`/email URL. Defense in depth: `sanitize_properties` in all three apps' `analyticsService.js` redacting `oobCode|apiKey|email|token` query params from `$current_url`, `$referrer`, and any string prop that is a URL with those params.
4. **errorReporter identity:** wire `setUserIdProvider(() => firebaseAuth.currentUser?.uid ?? null)`; consolidate global handlers to a single registration path (today `installGlobalHooks` is exported-unused and App.web.js has manual handlers).
5. **Web onboarding funnel:** `onboarding.started`, `onboarding.step_completed {step, step_id}`, `onboarding.completed {…answers summary}` fired from the real web flow. Native call site stays (harmless no-op).

### W4 — Web blind spots (minimal, durable events)

- Nutrition: `nutrition.meal_logged {meal_type, source}`, `nutrition.entry_deleted`, `nutrition.food_searched {result_count}` (user-initiated searches only).
- Booking: `booking.call_booked {creator_id}`, `booking.call_cancelled`.
- Purchase funnel top: `program.viewed {course_id, surface}` on PWA CourseDetailScreen + landing CreatorProgramDetailScreen (+ bundle equivalent).
- `subscription.checkout.cancelled {surface}` on PaymentCancelledScreen.
- Landing: diagnose and fix `landing.cta_clicked` (0 events despite traffic); wire tracking to the CTAs actually rendered today.
- Explicitly out: settings events, native app.

### W5 — Verification & rollout

- functions: `npm --prefix functions run build` + lint (qa-fast agent).
- Apps: babel parse + vitest (pwa/creator) + `build:landing` (no eslint in apps).
- Deploy to **staging** (wake-staging) first; validate the alerts webhook end-to-end (simulated PostHog payload → Telegram).
- Prod deploy only with explicit user confirmation (wolf-20b8b is production). PWA build with cleared Metro cache; verify bundle contains `wolf-20b8b`.
- After prod deploy: create PostHog alerts via MCP pointing at the prod webhook URL; suppress/resolve backlog issues; smoke-test one simulated alert.

## Decisions log

- Alerts channel: Telegram `#signals` + email (two independent channels).
- Empty digests: quiet-when-clean (not removal) — sourcemap-symbolicated client-error digests remain for days with real errors.
- Daily pulse cron stays fully enabled (payments/quota/integrity/drops are not covered by PostHog).
- Event naming follows existing `domain.action` convention; staleTime/queryConfig untouched (analytics only, no data-fetch changes).
