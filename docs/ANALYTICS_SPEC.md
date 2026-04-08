# Analytics Implementation Spec — Wake + PostHog

## Overview

PostHog Cloud (US region). One project, three apps (PWA, creator-dashboard, landing). Same API key everywhere — unified user profiles across all surfaces.

**PostHog project settings to enable:**
- Session Recording: ON
- Autocapture: ON (web only — no-op on native)
- Heatmaps: ON
- Feature Flags: ON (not used now, free to enable)

---

## Packages

```bash
# PWA
cd apps/pwa
npx expo install posthog-react-native             # native
npm install posthog-js                            # web

# Creator Dashboard
cd apps/creator-dashboard
npm install posthog-js

# Landing
cd apps/landing
npm install posthog-js
```

---

## Environment Variables

### apps/pwa/.env
```
EXPO_PUBLIC_POSTHOG_KEY=phc_xxxxxxxxxxxx
```

### apps/creator-dashboard/.env
```
VITE_POSTHOG_KEY=phc_xxxxxxxxxxxx
```

### apps/landing/.env
```
VITE_POSTHOG_KEY=phc_xxxxxxxxxxxx
```

PostHog host is always `https://us.i.posthog.com`. Do not put it in env — it never changes.

Disable in development by checking `process.env.NODE_ENV === 'development'` or `import.meta.env.DEV` in the service init.

---

## Analytics Service API

All three apps expose the same interface. Consumers never import PostHog directly.

```js
analyticsService.identify(userId, { email, role })   // call on login
analyticsService.track(event, properties)             // all events
analyticsService.screen(screenName, properties)       // native screen views
analyticsService.reset()                              // call on logout
analyticsService.setUserProperties(properties)        // update user traits
analyticsService.isReady()                            // bool — false until initialized
```

---

## Service Files

### apps/pwa/src/services/analyticsService.web.js

```js
import posthog from 'posthog-js';

const KEY = process.env.EXPO_PUBLIC_POSTHOG_KEY;

class AnalyticsService {
  #ready = false;

  init() {
    if (!KEY || process.env.NODE_ENV === 'development') return;
    posthog.init(KEY, {
      api_host: 'https://us.i.posthog.com',
      autocapture: true,
      capture_pageview: false,        // we fire screen() manually
      capture_pageleave: true,
      session_recording: {
        maskAllInputs: true,
        maskInputOptions: { password: true },
      },
      loaded: () => { this.#ready = true; },
    });
  }

  identify(userId, traits = {}) {
    if (!this.#ready) return;
    posthog.identify(userId, traits);
  }

  track(event, properties = {}) {
    if (!this.#ready) return;
    posthog.capture(event, properties);
  }

  screen(screenName, properties = {}) {
    if (!this.#ready) return;
    posthog.capture('$pageview', { $current_url: screenName, ...properties });
  }

  reset() {
    if (!this.#ready) return;
    posthog.reset();
  }

  setUserProperties(properties = {}) {
    if (!this.#ready) return;
    posthog.setPersonProperties(properties);
  }

  isReady() { return this.#ready; }
}

export default new AnalyticsService();
```

### apps/pwa/src/services/analyticsService.js  (React Native)

```js
import PostHog from 'posthog-react-native';
import Constants from 'expo-constants';

const KEY = Constants.expoConfig?.extra?.posthogKey
  ?? process.env.EXPO_PUBLIC_POSTHOG_KEY;

class AnalyticsService {
  #client = null;

  async init() {
    if (!KEY || __DEV__) return;
    this.#client = await PostHog.initAsync(KEY, {
      host: 'https://us.i.posthog.com',
    });
  }

  identify(userId, traits = {}) {
    this.#client?.identify(userId, traits);
  }

  track(event, properties = {}) {
    this.#client?.capture(event, properties);
  }

  screen(screenName, properties = {}) {
    this.#client?.screen(screenName, properties);
  }

  reset() {
    this.#client?.reset();
  }

  setUserProperties(properties = {}) {
    this.#client?.identify(undefined, properties);
  }

  isReady() { return this.#client !== null; }
}

export default new AnalyticsService();
```

### apps/creator-dashboard/src/services/analyticsService.js

```js
import posthog from 'posthog-js';

const KEY = import.meta.env.VITE_POSTHOG_KEY;

class AnalyticsService {
  #ready = false;

  init() {
    if (!KEY || import.meta.env.DEV) return;
    posthog.init(KEY, {
      api_host: 'https://us.i.posthog.com',
      autocapture: true,
      capture_pageview: false,
      capture_pageleave: true,
      session_recording: {
        maskAllInputs: true,
        maskInputOptions: { password: true },
        // mask client data fields
        maskTextSelector: '[data-ph-mask]',
      },
      loaded: () => { this.#ready = true; },
    });
  }

  identify(userId, traits = {}) {
    if (!this.#ready) return;
    posthog.identify(userId, traits);
  }

  track(event, properties = {}) {
    if (!this.#ready) return;
    posthog.capture(event, properties);
  }

  screen(screenName, properties = {}) {
    if (!this.#ready) return;
    posthog.capture('$pageview', { $current_url: screenName, ...properties });
  }

  reset() {
    if (!this.#ready) return;
    posthog.reset();
  }

  setUserProperties(properties = {}) {
    if (!this.#ready) return;
    posthog.setPersonProperties(properties);
  }

  isReady() { return this.#ready; }
}

export default new AnalyticsService();
```

### apps/landing/src/services/analyticsService.js

```js
import posthog from 'posthog-js';

const KEY = import.meta.env.VITE_POSTHOG_KEY;

class AnalyticsService {
  #ready = false;

  init() {
    if (!KEY || import.meta.env.DEV) return;
    posthog.init(KEY, {
      api_host: 'https://us.i.posthog.com',
      autocapture: true,
      capture_pageview: true,         // landing is single-page, auto is fine
      capture_pageleave: true,
      loaded: () => { this.#ready = true; },
    });
  }

  track(event, properties = {}) {
    if (!this.#ready) return;
    posthog.capture(event, properties);
  }

  isReady() { return this.#ready; }
}

export default new AnalyticsService();
```

---

## Initialization

### PWA Web — apps/pwa/src/App.web.js

Call `analyticsService.init()` before the JSX tree renders:

```js
import analyticsService from './services/analyticsService';
analyticsService.init();  // top of file, before component definition
```

### PWA Native — apps/pwa/App.js

Call inside the `useEffect` that runs on mount, before AuthProvider resolves:

```js
import analyticsService from './src/services/analyticsService';

useEffect(() => {
  analyticsService.init();
}, []);
```

### Creator Dashboard — apps/creator-dashboard/src/main.jsx

```js
import analyticsService from './services/analyticsService';
analyticsService.init();  // before ReactDOM.render
```

### Landing — apps/landing/src/main.jsx

```js
import analyticsService from './services/analyticsService';
analyticsService.init();
```

---

## User Identification

### PWA — apps/pwa/src/contexts/AuthContext.js

Inside the `onAuthStateChanged` callback, after user is resolved:

```js
import analyticsService from '../services/analyticsService';

// Inside onAuthStateChanged:
if (user) {
  analyticsService.identify(user.uid, {
    email: user.email,
    created_at: user.metadata.creationTime,
  });
} else {
  analyticsService.reset();
}
```

### Creator Dashboard — apps/creator-dashboard/src/contexts/AuthContext.jsx

Same pattern. Add `role` to traits since it's available here:

```js
import analyticsService from '../services/analyticsService';

// Inside onAuthStateChanged after userRole is resolved:
if (user) {
  analyticsService.identify(user.uid, {
    email: user.email,
    role: userRole,           // 'creator' | 'admin'
    created_at: user.metadata.creationTime,
  });
} else {
  analyticsService.reset();
}
```

---

## API Performance Tracking

Both `apps/pwa/src/utils/apiClient.js` and `apps/creator-dashboard/src/utils/apiClient.js` share the same internal `#request` method. Add timing capture there.

Inside the `#request` method, wrap the `fetch` call:

```js
// At the top of #request, before fetch:
const _start = Date.now();

// After response is processed (in finally block or after await):
analyticsService.track('api_request', {
  endpoint: path,
  method: method.toUpperCase(),
  status: response?.status ?? 0,
  duration_ms: Date.now() - _start,
  error_code: error?.code ?? null,
  client: this.#clientId,
});
```

Import `analyticsService` at the top of both apiClient files. This one change captures 100% of API performance across both apps.

---

## PWA Install Funnel

The install funnel involves both the landing page and the PWA. Users are anonymous throughout.

### Landing — capture UTMs and CTA click

On `landing_page_visited`, PostHog autocapture handles the page view. Add explicit tracking for the install CTA:

```js
// Wherever the "Descargar app" / install CTA is rendered:
analyticsService.track('install_cta_clicked', {
  cta_label: 'Descargar app',
  section: 'hero',                    // or wherever it lives
  utm_source: new URLSearchParams(window.location.search).get('utm_source'),
  utm_medium: new URLSearchParams(window.location.search).get('utm_medium'),
  utm_campaign: new URLSearchParams(window.location.search).get('utm_campaign'),
});
```

### PWA — install screen and browser events

All install logic lives in `apps/pwa/src/screens/InstallScreen.web.jsx`.

**Screen viewed** — add a `useEffect` with empty deps at the top of the component:

```js
// InstallScreen.web.jsx — inside the component, near the top
useEffect(() => {
  analyticsService.track('pwa_install_screen_viewed', {
    source: document.referrer.includes('wakelab.co') ? 'landing' : 'direct',
    browser: isSafariIOS() ? 'ios_safari'
           : isChromeOnIOS() ? 'ios_chrome'
           : isChromeAndroid() ? 'android_chrome'
           : isSamsungBrowser() ? 'android_samsung'
           : isGoogleApp() ? 'google_app'
           : 'other',
  });
}, []);
```

**`beforeinstallprompt` fires** — inside the existing `onBeforeInstall` handler (line ~350):

```js
const onBeforeInstall = (e) => {
  e.preventDefault();
  deferredPromptRef.current = e;
  setDeferredPrompt(e);
  analyticsService.track('pwa_install_prompt_available');   // add this
};
```

**`appinstalled` fires** — inside the existing `onInstalled` handler (line ~355):

```js
const onInstalled = () => {
  setInstallOutcome('accepted');
  deferredPromptRef.current = null;
  setDeferredPrompt(null);
  analyticsService.track('pwa_installed');                  // add this
};
```

**Install button tapped + outcome** — inside the existing `handleAndroidInstall` (line ~368):

```js
const handleAndroidInstall = useCallback(async () => {
  const e = deferredPromptRef.current || deferredPrompt;
  if (!e || typeof e.prompt !== 'function') return;
  analyticsService.track('pwa_install_button_clicked');     // add this
  e.prompt();
  try {
    const { outcome } = await e.userChoice;
    setDeferredPrompt(null);
    deferredPromptRef.current = null;
    if (outcome === 'accepted') {
      setInstallOutcome('accepted');
      analyticsService.track('pwa_install_accepted');       // add this
    } else {
      analyticsService.track('pwa_install_dismissed');      // add this
    }
  } catch (_) {
    setDeferredPrompt(null);
    deferredPromptRef.current = null;
  }
}, [deferredPrompt]);
```

**App opened standalone** — in `apps/pwa/src/App.web.js`, inside the initialization block:

```js
const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
analyticsService.track('app_opened', {
  source: isStandalone ? 'standalone' : 'browser',
});
```

---

## Screen Tracking (PWA Native)

On native, PostHog does not autocapture screen views. Add `analyticsService.screen()` to the navigation listener in the React Navigation setup.

```js
// In the navigator where onStateChange is available:
<NavigationContainer
  onStateChange={(state) => {
    const route = getActiveRoute(state);  // helper to get current route
    analyticsService.screen(route.name, { params: route.params });
  }}
>
```

On web, autocapture + explicit `$pageview` calls in React Router cover this. Add a `useEffect` on route changes in `App.web.js`:

```js
import { useLocation } from 'react-router-dom';

const location = useLocation();
useEffect(() => {
  analyticsService.screen(location.pathname);
}, [location.pathname]);
```

---

## Event Reference

### Notation
- `*` = required property
- All events include PostHog's automatic properties (device, browser, OS, session ID, timestamp)
- PostHog autocapture handles button clicks on web — only add `button_clicked` for native or for buttons where the label alone isn't enough context

---

### Onboarding

| Event | Properties |
|---|---|
| `onboarding_step_viewed` | `step_index*`, `step_name*` |
| `onboarding_step_completed` | `step_index*`, `step_name*`, `time_on_step_ms` |
| `onboarding_abandoned` | `step_index*`, `step_name*` |
| `onboarding_completed` | `total_duration_ms` |

Fire `onboarding_abandoned` on `beforeunload` / app background if step < final.

---

### PWA Install Funnel

| Event | Properties |
|---|---|
| `install_cta_clicked` | `cta_label`, `section`, `utm_source`, `utm_medium`, `utm_campaign` |
| `pwa_install_screen_viewed` | `source` (landing \| direct) |
| `pwa_install_prompt_available` | — |
| `pwa_install_button_clicked` | — |
| `pwa_install_accepted` | — |
| `pwa_install_dismissed` | — |
| `pwa_installed` | — |
| `app_opened` | `source` (standalone \| browser), `is_first_open` |

---

### Workout

| Event | Properties |
|---|---|
| `workout_started` | `session_id*`, `program_id`, `week`, `day`, `source` (home \| library) |
| `workout_set_logged` | `session_id*`, `exercise_id*`, `set_index`, `reps`, `weight_kg` |
| `workout_exercise_skipped` | `session_id*`, `exercise_id*`, `exercise_name` |
| `workout_rest_skipped` | `session_id*`, `exercise_id*`, `rest_duration_ms` |
| `workout_completed` | `session_id*`, `duration_ms`, `sets_completed`, `sets_total` |
| `workout_abandoned` | `session_id*`, `duration_ms`, `sets_completed`, `sets_total`, `at_exercise_index` |
| `personal_record_set` | `exercise_id*`, `exercise_name`, `metric` (weight \| reps), `previous_value`, `new_value` |

---

### Nutrition

| Event | Properties |
|---|---|
| `diary_viewed` | `date*`, `has_entries` |
| `food_searched` | `query*`, `results_count` |
| `barcode_scanned` | `success` |
| `food_added` | `food_id*`, `meal_type*`, `source` (search \| barcode \| saved) |
| `meal_logged` | `meal_type*`, `food_count`, `total_calories` |
| `diary_day_completed` | `total_calories`, `meals_logged` |

---

### Lab / Progress

| Event | Properties |
|---|---|
| `lab_viewed` | `previous_screen` |
| `body_log_added` | — |
| `readiness_logged` | `sleep_score`, `stress_score` |
| `progress_photo_added` | — |
| `chart_viewed` | `metric` (weight \| strength \| volume) |

`previous_screen` on `lab_viewed` answers "do users check the lab before or after a workout."

---

### App Navigation (PWA)

| Event | Properties |
|---|---|
| `tab_changed` | `from_tab*`, `to_tab*` |
| `app_opened` | `source` (standalone \| browser), `is_first_open` |
| `session_started` | `session_number` |

---

### Creator Dashboard

| Event | Properties |
|---|---|
| `program_creation_started` | — |
| `program_session_added` | `program_id`, `session_count_so_far` |
| `program_published` | `program_id*`, `total_sessions`, `total_exercises` |
| `program_abandoned` | `at_step` (naming \| sessions \| review) |
| `client_invited` | — |
| `client_program_assigned` | `program_id*` |
| `library_session_created` | — |
| `nutrition_plan_created` | — |
| `nutrition_plan_assigned` | — |
| `availability_set` | `slots_count` |
| `dashboard_section_viewed` | `section*` (clients \| programs \| library \| nutrition \| bookings \| analytics) |

---

### Landing Page

| Event | Properties |
|---|---|
| `landing_section_viewed` | `section*` (hero \| features \| pricing \| testimonials \| faq) |
| `landing_cta_clicked` | `cta_label*`, `section*`, `utm_source`, `utm_medium`, `utm_campaign` |
| `landing_scroll_depth` | `depth_pct*` (25 \| 50 \| 75 \| 100) |

`landing_section_viewed` is best implemented with IntersectionObserver, firing once per section per page load.

---

### Performance

| Event | Properties |
|---|---|
| `api_request` | `endpoint*`, `method*`, `status*`, `duration_ms*`, `error_code`, `client` |
| `screen_render_time` | `screen*`, `duration_ms*` |

`api_request` is fired by the apiClient wrapper (see above). `screen_render_time` is optional — add it to screens that feel slow using `Date.now()` between component mount and data-ready state.

---

### Errors

| Event | Properties |
|---|---|
| `error_shown` | `screen*`, `error_code*`, `source` (api \| validation \| unknown) |

---

## Activation & Retention Events

### first_workout_completed / first_meal_logged — localStorage flag pattern

Use a localStorage flag. Zero Firestore reads, zero cost, works offline. The only edge case is a new device resets the flag — this is fine and arguably correct (first workout on that install).

```js
// After a workout is successfully saved:
if (!localStorage.getItem('wake_first_workout_done')) {
  localStorage.setItem('wake_first_workout_done', '1');
  const signupTime = auth.currentUser?.metadata?.creationTime;
  const daysSinceSignup = signupTime
    ? Math.floor((Date.now() - new Date(signupTime).getTime()) / 86400000)
    : null;
  analyticsService.track('first_workout_completed', {
    days_since_signup: daysSinceSignup,
  });
}

// After a meal entry is successfully saved:
if (!localStorage.getItem('wake_first_meal_done')) {
  localStorage.setItem('wake_first_meal_done', '1');
  analyticsService.track('first_meal_logged', {
    days_since_signup: daysSinceSignup,
  });
}
```

Place these checks in `sessionService.js` (after workout save succeeds) and `nutritionFirestoreService.js` (after diary entry save succeeds).

### Other retention events

```js
// Streak milestones — fire after streak is updated:
analyticsService.track('streak_milestone', { streak_days: 3 | 7 | 14 | 30 });

// Week completion:
analyticsService.track('week_completed', {
  program_id,
  week_number,
  completion_pct,  // 0–100
});
```

---

## Session Replay — Creator Dashboard Masking

Add `data-ph-mask` to any element that renders client PII:

```jsx
<span data-ph-mask>{client.email}</span>
<span data-ph-mask>{client.name}</span>
```

All inputs are already masked by `maskAllInputs: true`. This only needs to be added to display elements.

---

## PostHog Dashboard — Funnels to Create on Day One

Create these saved funnels immediately after first events start flowing:

| Funnel | Steps |
|---|---|
| Acquisition → Install | `install_cta_clicked` → `pwa_install_screen_viewed` → `pwa_install_accepted` → `pwa_installed` |
| Install → Activation | `app_opened` → `onboarding_completed` → `first_workout_completed` |
| Workout Completion | `workout_started` → `workout_completed` |
| Meal Logging | `diary_viewed` → `food_searched` → `food_added` → `meal_logged` |
| Creator Activation | `dashboard_section_viewed` → `program_creation_started` → `program_published` → `client_invited` → `client_program_assigned` |
| Program Creation | `program_creation_started` → `program_session_added` → `program_published` |

---

## Implementation Phases

### Phase 1 — Foundation (blocks everything else)
1. Create PostHog account + project, copy API key
2. Add `EXPO_PUBLIC_POSTHOG_KEY` / `VITE_POSTHOG_KEY` to all three `.env` files
3. Create `analyticsService` in all three apps
4. Initialize in entry points (App.web.js, App.js, main.jsx × 2)
5. Add `identify` / `reset` in both AuthContext files
6. Verify PostHog receives events in Live Events view

### Phase 2 — High-value, low-effort
7. API performance wrapper in both `apiClient.js` files (one change, all endpoints)
8. PWA install funnel events (landing CTA + PWA browser events)
9. Screen tracking hook in React Navigation (native) and React Router (web)
10. `app_opened` with standalone detection

### Phase 3 — Workout & Nutrition
11. Workout events: `workout_started`, `workout_set_logged`, `workout_completed`, `workout_abandoned`
12. Nutrition events: `diary_viewed`, `food_searched`, `food_added`, `meal_logged`
13. Activation events: `first_workout_completed`, `first_meal_logged`

### Phase 4 — Creator Dashboard flows
14. Program creation funnel events
15. Client management events
16. `dashboard_section_viewed` on navigation

### Phase 5 — Secondary
17. Lab / progress events
18. Streak and retention milestone events
19. Landing scroll depth + section viewed
20. Creator dashboard session replay masking
21. Set up saved funnels in PostHog

---

## What Autocapture Covers (no code needed on web)

On web (PWA web + creator dashboard + landing), PostHog autocapture automatically records:
- Every button click with element text and CSS selector
- Every link click
- Every form submission
- Every input change (masked)
- Page views (when `capture_pageview: true`)

This covers the "track all buttons" requirement on web with zero manual instrumentation. Add manual `track()` calls only where you need structured properties (e.g., `workout_started` needs `session_id`, `program_id`).
