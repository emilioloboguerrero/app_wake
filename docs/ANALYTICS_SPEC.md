# Analytics — Wake + PostHog

Source of truth for what Wake captures, how, and where. Reflects current implementation as of 2026-05-15. Pair with PostHog Live Events to verify behavior.

## Architecture

- **One PostHog Cloud project (US region)** shared by all surfaces. Key is the same everywhere.
- **`app` super property** distinguishes events: `pwa`, `creator-dashboard`, `landing`, `functions` (server-side).
- **`env` super property** is `production`, `staging`, `development`, or `unknown`. Derived from hostname on web; from `GCLOUD_PROJECT` on functions.
- **Identified-only profiles** (`person_profiles: 'identified_only'`). Anonymous events still flow but no person profile is created until `identify()` is called.
- **Naming convention: `dot.case` with a domain prefix** — e.g. `workout.session_started`, `creator.program_created`. Always lowercase. No underscores.
- **Identify is done in ONE place per app: the AuthContext.** Other auth services must not call `identify()`; they only call `track()` for the auth.* event.
- **No autocapture.** Every event is an explicit `track()`. The only "automatic" events are PostHog defaults: `$pageleave`, `$web_vitals`, `$identify`, `$exception`.

## Env vars

- `apps/pwa/.env` → `EXPO_PUBLIC_POSTHOG_KEY`
- `apps/creator-dashboard/.env` → `VITE_POSTHOG_KEY`
- `apps/landing/.env` → `VITE_POSTHOG_KEY`
- Cloud Functions → `POSTHOG_API_KEY` (Firebase Secret Manager)
- Host is hardcoded `https://us.i.posthog.com`. Override with `*_POSTHOG_HOST` only for testing.

## Service files

- [apps/pwa/src/services/analyticsService.js](apps/pwa/src/services/analyticsService.js) — uses static `import posthog from 'posthog-js'`. `init()` sets `initialized = true` synchronously after `posthog.init()` returns. **Do not gate on the `loaded` callback** — posthog-js queues events from the moment init() is called, and gating dropped every pre-load event silently.
- [apps/creator-dashboard/src/services/analyticsService.js](apps/creator-dashboard/src/services/analyticsService.js)
- [apps/landing/src/services/analyticsService.js](apps/landing/src/services/analyticsService.js)
- [functions/src/lib/analytics.ts](functions/src/lib/analytics.ts) — `posthog-node` singleton. Stamps `app: "functions"` on every event.

All four expose the same shape: `init`, `identify`, `track`, `screenViewed`/`screen`, `reset`, `setSuperProps`, `optOut`, `optIn`, `isOptedOut`. Safe to call before init or after opt-out.

## Identify pattern

Each web app has exactly one identify call, in its AuthContext, on `onAuthStateChanged`:

```js
if (authUser?.uid) {
  analyticsService.identify(authUser.uid, {
    email_domain: authUser.email ? String(authUser.email).split('@')[1] || null : null,
  });
}
```

Auth services (`authService.js`, `googleAuthService.js`, `appleAuthService.js`) **only fire `auth.login` / `auth.signup_completed`** — they do not identify. PII (full email, name) is intentionally not sent; `email_domain` is the only domain attribute.

Logout: AuthContext does not reset. The auth service that triggered the sign-out fires `auth.logout` and calls `analyticsService.reset()`.

## Session replay

PWA: 20% sample. Creator dashboard: 50%. Landing: 100%. All apps mask inputs by default (`maskAllInputs: true`) and mask elements tagged with `[data-ph-no-capture]`.

## Event reference (current state)

Notation: `*` = required property. Every event also carries `app`, `platform`, `env`, `app_version` super properties.

### Auth (PWA + creator-dashboard)

| Event | Properties |
|---|---|
| `auth.signup_completed` | `method*` (email \| google \| apple) |
| `auth.login` | `method*` |
| `auth.logout` | — |

### Onboarding (PWA)

| Event | Properties |
|---|---|
| `onboarding.completed` | (none today) |

> Gap: per-step viewed/completed/abandoned events are not yet wired. Add them in `apps/pwa/src/components/OnboardingFlow.web.jsx` if onboarding conversion analysis is needed.

### Workout (PWA)

| Event | Properties |
|---|---|
| `workout.session_started` | `course_id*`, `session_id` |
| `workout.session_completed` | `course_id*`, `duration_seconds*`, `sets_completed*`, `exercises_completed*`, `had_pr*` |
| `workout.session_abandoned` | `course_id*`, `session_id*`, `duration_seconds`, `sets_completed`, `sets_total`, `at_exercise_index` (server-emitted via abandonment cron) |

### Progress (PWA)

| Event | Properties |
|---|---|
| `progress.body_log_added` | — |
| `progress.readiness_added` | `sleep_score`, `stress_score` |

### Activation (PWA)

Fired exactly once per device install. Gated by `localStorage` flags `wake_first_workout_done` / `wake_first_meal_done`.

| Event | Properties |
|---|---|
| `activation.first_workout_completed` | `course_id` |
| `activation.first_meal_logged` | — |

### Purchase (PWA)

| Event | Properties |
|---|---|
| `program.purchase_started` | `course_id*`, `flow*` |

> The three call sites in [purchaseService.js](apps/pwa/src/services/purchaseService.js) at lines 159 / 197 / 218 represent three distinct purchase entry flows. If a single user goes through more than one in the same session the count is overstated — keep an eye on the per-distinct_id count.

### Creator dashboard

| Event | Properties |
|---|---|
| `creator.program_created` | `program_id*`, `delivery_type` |
| `creator.program_published` | — |
| `creator.client_added` | `method*` (direct \| invite) |
| `creator.event_created` | `event_id*` |
| `creator.nutrition_plan_created` | — |

### Landing

| Event | Properties |
|---|---|
| `landing.cta_clicked` | `section*`, `cta_label*`, `utm_source`, `utm_medium`, `utm_campaign` |

`section` values: `nav`, `hero_pill`, `hero`, `allinone`, `final`.

### Screen views

All three web apps fire `screen.viewed` on every React Router path change. Property: `screen_name` (the pathname).

### Server-side (Cloud Functions, `app: "functions"`)

| Event | Properties |
|---|---|
| `api.request_completed` | `endpoint*`, `method*`, `status*`, `duration_ms*`, `error_code`, `client` — emitted by Express middleware in [functions/src/api/middleware/analytics.ts](functions/src/api/middleware/analytics.ts). Fires for every API call. |
| `workout.session_abandoned` | (see Workout) — emitted by the scheduled abandonment-detection cron. |

## Activation event pattern

Fire-once-per-install events use `localStorage` flags. No Firestore read, works offline, automatically resets if the user clears storage (acceptable — "first workout on this device" is a valid definition of activation).

```js
if (typeof window !== 'undefined' && window.localStorage) {
  if (!window.localStorage.getItem('wake_first_workout_done')) {
    window.localStorage.setItem('wake_first_workout_done', '1');
    analyticsService.track('activation.first_workout_completed', { course_id });
  }
}
```

Add new activation events with the same shape and a unique `wake_first_*_done` key.

## API performance tracking

Currently **server-side only** — the Express middleware fires `api.request_completed` for every Cloud Function API call. The PWA's apiClient does not also fire this event (would double-count). If client-side latency is needed separately, add a new event name (e.g. `client.api_request`) — do not reuse `api.request_completed`.

## Funnels to keep in PostHog

Wire these as saved funnels in the PostHog UI once activation events accumulate volume.

- **Install → Activation:** `screen.viewed` (where `screen_name = '/'`) → `auth.signup_completed` → `onboarding.completed` → `activation.first_workout_completed`
- **Workout completion:** `workout.session_started` → `workout.session_completed`
- **Acquisition (landing → install):** `landing.cta_clicked` (any section) → `screen.viewed` with `app = 'pwa'`
- **Creator activation:** `auth.signup_completed` (creator) → `creator.program_created` → `creator.program_published` → `creator.client_added`

## Known gaps (intentionally unimplemented)

Documented here so future engineers don't re-invent. Each one needs a discrete decision to add — they are not blocking anything today.

- Per-step onboarding events
- PWA install funnel (`pwa.install_*`, `landing.install_cta_clicked`)
- Workout set/exercise granularity (`workout.set_logged`, `workout.exercise_skipped`, `workout.rest_skipped`, `workout.personal_record_set`)
- Nutrition (`nutrition.diary_viewed`, `nutrition.food_searched`, `nutrition.barcode_scanned`, `nutrition.food_added`, `nutrition.meal_logged`)
- Lab/progress photo/chart views
- Creator funnel granularity (`creator.program_session_added`, `creator.client_program_assigned`, `creator.library_session_created`, `creator.nutrition_plan_assigned`, `creator.availability_set`, `creator.dashboard_section_viewed`)
- Streak / week-completion milestones
- Client-side `error.shown`
- `screen.render_time`
- Landing scroll depth and section-viewed (IntersectionObserver)

## Operational notes

- **Opt-out:** any user can set `localStorage.setItem('wake_analytics_opt_out', '1')` (Profile screen exposes a toggle). All `track()`/`identify()` calls silently no-op while this flag is set.
- **Dev builds:** opt-out is not auto-set. If you want to test the PWA without polluting production data, opt out manually in DevTools, or build with an empty `EXPO_PUBLIC_POSTHOG_KEY`.
- **Build pitfall:** Metro caches aggressively. After changing `analyticsService.js` always rebuild with `--clear` or wipe `apps/pwa/dist/` — see `feedback_pwa_build_metro_cache`.
- **Verify deploys:** the production bundle hash is in `hosting/app/index.html`. After a deploy, `curl -s https://wakelab.co/app/index.html | grep -oE 'index-[a-f0-9]+\.js'` returns the live bundle. Open DevTools → Network and confirm `posthog.com/decide` and `posthog.com/e/` requests fire.
