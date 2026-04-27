# Wake — Pending Work

Last updated: 2026-04-27. Single source of truth for all unimplemented, partial, and planned work.

---

## Status Key

`NOT STARTED` · `IN PROGRESS` · `IMPLEMENTED — NOT TESTED` · `COMPLETED`

---

## Conversion & Growth

### 3b. Subscription Management Screen `NOT STARTED`

In-app screen for users to view and manage their active subscription. Currently there is no visibility into subscription state inside the app.

**Screen (`/app/subscription`, accessible from profile):**
- Plan name, status (activo / cancelado / vencido), next billing date, amount
- Cancelar button → confirmation modal → reason selector → API call → Firestore update

**API needed:**
- `GET /payments/subscription` — current subscription status
- `POST /payments/subscription/cancel` — cancel with reason

**Checklist:**
- [ ] `GET /payments/subscription` endpoint
- [ ] `POST /payments/subscription/cancel` endpoint
- [ ] Subscription screen UI in PWA
- [ ] Cancel flow (modal + reason selector)
- [ ] Firestore update on cancel

---

### 3c. Stripe Migration `DECISION PENDING`

Potential future replacement of MercadoPago with Stripe for better subscription UX (Customer Portal, upgrade/downgrade, dunning). Not urgent — current MP flow works. Requires a business decision before any code.

| Factor | MercadoPago | Stripe |
|---|---|---|
| Colombia coverage | Native, preferred by local banks | Available, less familiar |
| Subscription management | All custom-built | Customer Portal out of the box |
| Developer experience | Moderate | Excellent |
| Migration effort | — | 2–3 weeks (new functions, webhook, keys) |

**Prerequisites:** confirm Colombian user card acceptance on Stripe, decide parallel vs hard-cutover.

**Checklist:**
- [ ] Business decision made
- [ ] Stripe account + Colombia configuration
- [ ] Cloud Functions for Stripe checkout and webhook
- [ ] Stripe Customer Portal integration
- [ ] Migrate existing subscribers
- [ ] Deprecate MercadoPago subscription functions

---

## Product Quality

### 5. PWA UI Redesign `NOT STARTED`

Systematic review of the entire PWA to establish a consistent visual identity. Current state is functional but bland — no accent color system, inconsistent animations, generic component feel.

**Goals:**
- Universal runtime accent color (extracted from active course image — already used in some screens, needs to be the standard everywhere)
- Animation consistency: all entrances use fade + translateY, spring easing `cubic-bezier(0.22,1,0.36,1)` — audit every screen
- Spacing, typography hierarchy, component patterns normalized
- Not a full rewrite — surface-level visual changes only, starting with highest-traffic screens

**Scope (screen order):**
1. Home / daily overview
2. Workout execution
3. Nutrition diary
4. Progress / Lab
5. Profile
6. Onboarding (already mostly solid — light review only)

**Components to normalize:**
- Cards (course cards, session cards, exercise cards)
- Buttons (primary, secondary, ghost)
- Input fields
- Modals and bottom sheets
- Empty states
- Loading skeletons

**Checklist:**
- [ ] Audit accent color usage — finalize universal context/hook
- [ ] Home screen
- [ ] Workout execution screen
- [ ] Nutrition diary screen
- [ ] Progress / Lab screens
- [ ] Profile screen
- [ ] Button variants normalized
- [ ] Card variants normalized
- [ ] Modal and bottom sheet patterns
- [ ] Animation audit — all screens comply
- [ ] Empty states
- [ ] `docs/STANDARDS.md` updated if system expands

---

### 5. App-wide Optimization `NOT STARTED`

Reduce Firestore read costs, bundle sizes, and initial load times across all apps. Low user count makes this the right time — fix habits before growth makes it expensive.

**PWA (Metro/Expo):**
- Bundle analysis — identify large dependencies
- Dead code removal — unused imports, legacy utilities, commented logic
- Firestore query audit — over-fetching, missing composite indexes
- Image optimization — check sizes loaded in workout/program screens
- React Query staleTime audit against actual data change frequency

**Creator Dashboard (Vite):**
- Vite bundle analysis (`vite-bundle-visualizer`)
- Lazy-load heavy routes (program builder, library)
- Firestore query audit — client list, program tree fetches
- Verify `react-window` coverage for all long lists

**Landing (Vite):**
- Lighthouse audit — performance, LCP, CLS
- Asset optimization — fonts, hero images/videos
- Verify no unnecessary Firestore reads on load

**Functions:**
- Cold start analysis — minimize bundle size in Cloud Functions
- Identify and remove unused dependencies from `functions/package.json`

**Checklist:**
- [ ] Metro bundle visualization (PWA)
- [ ] Vite bundle visualization (creator-dashboard, landing)
- [ ] Lighthouse audit (landing)
- [ ] Top 5 most expensive Firestore queries identified and optimized
- [ ] Dead code removal pass — all three apps
- [ ] Image/asset audit
- [ ] React Query staleTime audit
- [ ] Functions cold start review
- [ ] Firestore indexes reviewed (`firestore.indexes.json`)

---

## Analytics & Intelligence

### 6. PostHog Analytics `NOT STARTED`

Full-scale product analytics. Goal: understand user behavior, feature usage, funnels, and retention to inform all future product decisions.

**Locked decisions:**
- `posthog-js` in all three apps (PWA, creator-dashboard, landing)
- All apps send to the same PostHog project, distinguished by `app` super property
- US region: `https://us.i.posthog.com`
- API key per-app: `VITE_POSTHOG_KEY` / Expo `Constants.expoConfig.extra.posthogKey`
- `autocapture: false` — manual only, at service layer
- `capture_pageview: false` — fire `screen.viewed` manually on route changes
- `person_profiles: 'identified_only'`
- Event naming: `domain.action`
- No PII in event properties — userId and role only
- `posthog.identify(userId, { role })` on login; `posthog.reset()` on logout
- Super properties on every event: `{ app, platform: 'web', app_version, env }`
- `env: 'staging'` on wake-staging

**Session replay:**
- `maskAllInputs: true` always
- `data-ph-no-capture` on: body log values, readiness scores, progress photos
- Sample rates: landing 100%, creator-dashboard 50%, PWA 20%

**Event taxonomy:**

Auth (fires in `authService.js`, `googleAuthService.js`, `appleAuthService.js`):
| Event | Properties |
|---|---|
| `auth.signup_started` | `method` |
| `auth.signup_completed` | `method` |
| `auth.login` | `method: email/google/apple` |
| `auth.logout` | — |
| `auth.password_reset_requested` | — |

Onboarding PWA (fires in `OnboardingFlow.web.jsx`):
| Event | Properties |
|---|---|
| `onboarding.step_completed` | `step_index`, `step_name` |
| `onboarding.completed` | `primary_goal`, `training_experience`, `training_days_per_week`, `equipment` |

Workout PWA (fires in `sessionService.js`):
| Event | Properties |
|---|---|
| `workout.session_started` | `course_id`, `week_index`, `session_index`, `exercise_count` |
| `workout.set_completed` | `exercise_key`, `reps`, `weight`, `is_pr` |
| `workout.session_completed` | `duration_seconds`, `sets_completed`, `exercises_completed`, `course_id` |
| `workout.session_abandoned` | `duration_seconds`, `completion_pct`, `last_exercise_key` |

Note: `workout.set_completed` is the highest-volume event. Monitor quota — sample or remove if user base scales significantly.

Nutrition PWA (fires in `nutritionFirestoreService.js`):
| Event | Properties |
|---|---|
| `nutrition.diary_entry_added` | `meal_type`, `source: search/barcode/saved` |
| `nutrition.diary_entry_deleted` | `meal_type` |
| `nutrition.food_searched` | `query_length` (NOT the string) |
| `nutrition.barcode_scanned` | `success` |
| `nutrition.saved_food_used` | — |

Progress PWA (fires in `bodyProgressService.js`, `readinessService.js`, `oneRepMaxService.js`):
| Event | Properties |
|---|---|
| `progress.body_log_added` | — |
| `progress.readiness_added` | `score` |
| `progress.pr_achieved` | `exercise_key` |

Program / Purchase PWA (fires in `purchaseService.js`):
| Event | Properties |
|---|---|
| `program.viewed` | `course_id`, `delivery_type` |
| `program.purchase_started` | `course_id`, `delivery_type`, `access_duration` |
| `program.purchase_completed` | `course_id`, `delivery_type`, `access_duration` |
| `program.subscription_cancelled` | `course_id`, `reason` |

Video PWA:
| Event | Properties |
|---|---|
| `video.played` | `video_id`, `context: workout/library/exchange` |

Creator dashboard (fires in respective service files):
| Event | Properties | Service |
|---|---|---|
| `creator.client_added` | `delivery_type` | `oneOnOneService.js` |
| `creator.program_created` | `delivery_type` | `programService.js` |
| `creator.program_published` | `delivery_type` | `programService.js` |
| `creator.session_built` | `exercise_count` | library service |
| `creator.module_built` | `session_count` | library service |
| `creator.nutrition_plan_created` | — | `plansService.js` |
| `creator.nutrition_plan_assigned` | — | `plansService.js` |
| `creator.call_booked` | — | `callBookingService.js` |
| `creator.event_created` | `capacity` | `eventService.js` |

Landing:
| Event | Properties |
|---|---|
| `landing.page_viewed` | — |
| `landing.cta_clicked` | `cta_label` |
| `landing.signup_cta_clicked` | `source_section` |
| `landing.pricing_viewed` | — |

Navigation (all apps) — `screen.viewed { screen_name }` on every route change:
- PWA: history listener in `App.web.js`
- Creator dashboard: history listener in `App.jsx`
- Landing: on mount in `App.jsx`

**Feature flags:** Set up infrastructure at init, no active flags yet. Future use: `rpe-input-enabled`, `feedback-board-enabled`, new onboarding A/B.

**Key dashboards to build post-instrumentation:**
- Acquisition funnel: `landing.cta_clicked → auth.signup_completed → onboarding.completed → workout.session_completed`
- Workout completion rate: `workout.session_started → workout.session_completed`
- Growth: signups/day, method breakdown, onboarding completion rate
- Engagement: DAU/WAU/MAU, workouts/day, diary entries/day
- Retention cohort: first event `auth.signup_completed`, return event `workout.session_completed`
- Feature adoption: `screen.viewed` breakdown by `screen_name`

**Workout abandonment detection (new Cloud Function):**
- Auto-save/checkpoint is fully implemented (localStorage + API + `RecoveryModal.jsx`)
- What's missing: no "abandoned" record when a stale checkpoint expires; no `workout.session_abandoned` event
- Build: scheduled Cloud Function (hourly) scans `activeSession` docs with `savedAt` > 4h
- Per stale session: write `abandonedSessions/{userId}/{sessionId}` with `{ courseId, startedAt, savedAt, durationMs, completionPct, lastExerciseKey }`, fire `workout.session_abandoned` to PostHog via server-side SDK, delete stale `activeSession`

**Privacy (Colombia — Ley 1581 de 2012):**
- Privacy policy must name PostHog, describe anonymized behavioral data, disclose US data processing
- Opt-out toggle in profile/settings: `posthog.opt_out_capturing()` / `posthog.opt_in_capturing()`
- `maskAllInputs: true` + `data-ph-no-capture` on sensitive elements covers session replay compliance

**Implementation order:**
1. `analyticsService.js` in PWA — init, super properties, identify/reset
2. Auth events + `screen.viewed`
3. Core funnel: `auth.signup_completed`, `onboarding.completed`, `program.purchase_completed`, `workout.session_completed`
4. Verify in PostHog live view — build acquisition funnel + retention cohort
5. Remaining PWA events (nutrition, progress, video, program.viewed)
6. Replicate to creator-dashboard and landing
7. Session replay — verify masking
8. Workout abandonment detection (Cloud Function)
9. Feature flags infrastructure

---

### 7. Platform Security Audit `NOT STARTED`

Full security review before scaling. Goal: identify and mitigate all exploitable surfaces before traffic grows.

**Firestore rules:**
- Verify all collections have explicit deny-by-default
- Test cross-user isolation — creator A cannot access creator B's data
- Subcollection rules don't inherit parent over-permissions
- `api_keys` collection access controls
- Emulator-based test suite for critical paths

**API security:**
- Auth bypass attempts on all protected routes
- IDOR (Insecure Direct Object Reference) on all resource ID parameters
- Input validation completeness — every body validated before use
- Rate limiting coverage — all public/semi-public endpoints protected
- Secrets never returned in API responses (API key plaintext, tokens)

**Client security:**
- Firebase config exposure (expected — confirm no secret keys)
- XSS — any `dangerouslySetInnerHTML` usage
- Sensitive data in localStorage / sessionStorage
- Storage path enforcement — users can only write to their own paths

**Auth:**
- Token refresh behavior — expired token handling in both apps
- Role claim validation — `creator` vs `user` enforcement on all creator routes
- Admin action protection

**Payments:**
- HMAC-SHA256 webhook validation applied on all webhook paths
- `external_reference` format validated before processing
- Idempotency (`processed_payments`) working correctly
- No payment amounts accepted from client — always calculated server-side

**Output:** Security findings report by severity (Critical / High / Medium / Low) + applied fixes for Critical and High.

**Checklist:**
- [ ] Firestore rules test suite (Firebase emulator)
- [ ] API IDOR audit on all resource endpoints
- [ ] Input validation completeness review
- [ ] Rate limiting coverage review
- [ ] Auth bypass attempts on protected routes
- [ ] Storage rules review
- [ ] Payment webhook security review
- [ ] Client-side sensitive data audit
- [ ] Document findings
- [ ] Fix all Critical and High severity issues

---

## New Features

### 8. Cardio Tracking System V1 `NOT STARTED`

A parallel tracking system for cardio alongside the existing strength system. The goal is a full-stack cardio product (think TrainingPeaks / Runna within Wake) — GPS tracking, wearable integrations, history, and metrics. This is a large, multi-phase build and should be treated as its own product track.

**V1 scope:**
- Manual cardio session logging (type, duration, distance, heart rate, notes)
- GPS route tracking — web (Geolocation API) and native (`expo-location`)
- Basic cardio history and metrics (weekly volume, pace, zone distribution)
- Wearable integrations: Garmin Connect, Whoop, Oura, Fitbit (OAuth + sync)
- Cardio tab in PWA alongside the workout tab
- Creator dashboard: read-only view of client cardio data

**Out of V1:**
- AI-generated cardio plans
- Creator-assigned cardio programs
- Detailed zone training or VO2 max estimation (beyond displayed metrics)

**Data model (new Firestore collections):**
```
users/{userId}/cardioSessions/{sessionId}
  type: 'run' | 'cycle' | 'swim' | 'walk' | 'hike' | 'other'
  source: 'manual' | 'gps' | 'garmin' | 'whoop' | 'oura' | 'fitbit'
  startedAt, endedAt
  duration: number (seconds)
  distance: number (meters)
  avgHeartRate, maxHeartRate
  calories: number
  route: GeoJSON | null
  laps: []
  notes: string
  rawData: {}  // provider-specific, for future normalization

users/{userId}/wearableConnections/{provider}
  provider: 'garmin' | 'whoop' | 'oura' | 'fitbit'
  accessToken, refreshToken, tokenExpiry
  lastSyncAt: timestamp
  providerUserId: string
```

**Wearable integration approach:**
- Each provider requires OAuth 2.0 — store tokens in Firestore
- Sync strategy: webhook where provider supports push; scheduled pull (Cloud Function, daily) as fallback
- Normalize all provider data to `cardioSessions` schema on ingest
- Garmin: Health API + Connect IQ
- Whoop: WHOOP API v1
- Oura: Oura Cloud API v2
- Fitbit: Fitbit Web API

**New route file:** `functions/src/api/routes/cardio.ts`

API endpoints:
- `GET /cardio/sessions` — history, cursor-paginated (page size 20)
- `POST /cardio/sessions` — manual log
- `GET /cardio/sessions/:id` — detail with route GeoJSON
- `DELETE /cardio/sessions/:id`
- `POST /cardio/connect/:provider` — OAuth initiation
- `GET /cardio/connect/:provider/callback` — OAuth callback + token storage
- `DELETE /cardio/connect/:provider` — disconnect
- `POST /cardio/sync/:provider` — manual sync trigger

**Checklist:**
- [ ] Data model finalized and Firestore rules written
- [ ] Manual cardio logging (PWA)
- [ ] GPS tracking on web (Geolocation API)
- [ ] GPS tracking on native (`expo-location`)
- [ ] Cardio history screen with metrics
- [ ] Weekly volume and pace charts
- [ ] Cardio tab in PWA navigation
- [ ] Garmin OAuth + sync
- [ ] Whoop OAuth + sync
- [ ] Oura OAuth + sync
- [ ] Fitbit OAuth + sync
- [ ] Creator dashboard — client cardio read view
- [ ] Storage rules for route data

---

### 9. Creator Email Platform `IN PROGRESS`

Email marketing for creators — event broadcasts (built), manual campaigns, templates, and automated sequences. Built on Resend (`RESEND_API_KEY` in Secret Manager).

**Core infrastructure (implemented):**
```
email_sends/{sendId}                                — every sent email (type-agnostic: event_broadcast, campaign, flow_step)
  stats: { total, sent, delivered, opened, clicked, bounced, failed }
email_sends/{sendId}/recipients/{recipientId}       — per-recipient delivery tracking
email_unsubscribes/{hash(email+creatorId)}          — per-creator unsubscribe list
```

**Implemented (Phase 0 — Event Broadcasts):**
- [x] `email_sends` + `recipients` subcollection data model
- [x] `email_unsubscribes` collection + per-creator unsubscribe tracking
- [x] Recipient resolver for `type: "event"` (all registrations or specific IDs)
- [x] `POST /creator/email/send` — create email send job (subject, bodyHtml, recipients)
- [x] `GET /creator/email/sends` — paginated send history
- [x] `GET /creator/email/sends/:sendId` — send detail + per-recipient status
- [x] `GET /email/unsubscribe` — public one-click unsubscribe page (no auth)
- [x] `processEmailQueue` scheduled Cloud Function (every 1 min, batched Resend sends)
- [x] `{{nombre}}` merge tag personalization
- [x] `List-Unsubscribe` + `List-Unsubscribe-Post` headers (RFC 8058 one-click)
- [x] Unsubscribe filtering before every send
- [ ] Creator dashboard: compose + audience picker screen
- [ ] Creator dashboard: send history screen
- [ ] Creator dashboard: send detail with per-recipient stats

**Audience types:** `event` (implemented) · `clients` · `segment` · `program` · `all_contacts` (future)

Variables: `{{nombre}}` works now. Future: `{{evento}}`, `{{fecha}}`, `{{programa}}`.

**Email deliverability (not started):**
- [ ] Verify `wakelab.co` SPF/DKIM/DMARC DNS records in Resend dashboard
- [ ] Add `mail.wakelab.co` subdomain for marketing emails (reputation isolation from transactional)
- [ ] Monitor spam complaint rate (<0.1%) and bounce rate (<1%)

**Phase 1 — Campaigns + additional audience types:**
- [ ] Recipient resolver: `type: "clients"` (query `one_on_one_clients`)
- [ ] Recipient resolver: `type: "program"` (query `users` by `courses` map)
- [ ] `email_campaigns/{campaignId}` collection (draft/scheduled/sent status, ties to `email_sends`)
- [ ] Campaign scheduling (`scheduledAt` field, processor picks up when due)
- [ ] Resend webhook endpoint for delivery/open/click/bounce events → update recipient docs
- [ ] Creator dashboard: campaign CRUD screens

**Phase 2 — Templates + scheduling:**
- [ ] `email_templates/{templateId}` collection (creatorId, name, subject, blocks/html)
- [ ] Template CRUD API (`/creator/email/templates`)
- [ ] Template picker in compose screen
- [ ] Block-based email builder (header, text, image, button, divider)

**Phase 3 — Custom creator domains:**
- [ ] `creator_email_domains/{domainId}` collection (creatorId, domain, resendDomainId, status, dnsRecords)
- [ ] `POST /creator/email/domains` — register domain via Resend API (`POST /domains`)
- [ ] `GET /creator/email/domains` — list domains + verification status
- [ ] `POST /creator/email/domains/:id/verify` — trigger DNS verification
- [ ] Creator dashboard: domain management screen with DNS record instructions
- [ ] Fallback logic: use creator's verified domain if available, else `wakelab.co`
- [ ] Resend Scale plan (1,000 domains) required

**Phase 4 — Audience segments:**
- [ ] `audience_segments/{segmentId}` collection (creatorId, name, rules[])
- [ ] Segment rule engine (field + operator + value, e.g., "attended event X", "purchased program Y")
- [ ] Segment CRUD API + UI
- [ ] Segment-based recipient resolver (`type: "segment"`)

**Phase 5 — Automated flows (Shopify-like):**
- [ ] `email_flows/{flowId}` collection (trigger, steps[], status)
- [ ] `email_flow_enrollments/{enrollmentId}` (flowId, recipient, currentStepIndex, nextActionAt)
- [ ] Flow step types: `email` (templateId + delay), `wait` (duration), `condition` (rules + branching)
- [ ] Trigger listeners: `event_registration`, `client_created`, `program_purchased`, `subscription_cancelled`
- [ ] Flow processor Cloud Function (scheduled, every 1-5 min) — query enrollments by `nextActionAt`
- [ ] Flow builder UI in creator dashboard (visual step editor)
- [ ] Per-step analytics
- [ ] A/B split testing within flows

---

### 10. Feedback Board `NOT STARTED`

In-app feature request and bug report board. Users and creators submit items; others upvote to prioritize.

**Data model:**
```
feedback_board/{itemId}
  title, description
  type: 'feature' | 'bug'
  app: 'pwa' | 'creator'
  status: 'proposed' | 'planned' | 'in_progress' | 'shipped'
  authorId, authorRole, voteCount, createdAt, updatedAt

feedback_board/{itemId}/votes/{userId}
  votedAt: timestamp
```

**API:** `GET /feedback?app=pwa&sort=votes`, `POST /feedback`, `POST /feedback/:id/vote` (toggle), `PATCH /feedback/:id` (admin only)

**Checklist:**
- [ ] Firestore schema + rules
- [ ] API endpoints
- [ ] PWA: feedback list + submit form
- [ ] Creator dashboard: feedback list
- [ ] Vote toggle (one per user per item)
- [ ] Admin status update

---

## Platform

### 11. Third-party API Integration `NOT STARTED`

Developer portal for external integrations with the Wake API. Backend infrastructure already exists — `api_keys` Firestore collection, SHA-256 key hashing, and API key auth in `auth.ts`.

**What remains:**
- Creator dashboard UI: create/revoke API keys, view scopes, usage overview
- Webhook registration (register URLs, subscribe to events)
- Webhook delivery Cloud Function
- Per-key rate limit tracking (currently global)
- Developer documentation (endpoint reference, auth guide, webhook guide)

**Checklist:**
- [ ] Creator dashboard: API keys management screen
- [ ] Webhook registration (Firestore + UI)
- [ ] Webhook delivery Cloud Function
- [ ] Per-key rate limit tracking
- [ ] Developer docs

---

## Priority Matrix

Four dimensions scored 1–5. **Simplicity** = inverse of complexity (5 = fast to build and test, 1 = months of work). For a solo dev, simplicity weighs heavier than a team — time is the real constraint.

| Item | Leverage | UX Return | Urgency | Simplicity | **Score** |
|---|---|---|---|---|---|
| Creator Dashboard Rebuild | 5 | 5 | 5 | 1 | **4.40** |
| PWA UI Redesign | 4 | 5 | 4 | 2 | **3.95** |
| Cardio Tracking V1 | 5 | 5 | 2 | 1 | **3.65** |
| PostHog Analytics | 4 | 1 | 4 | 4 | **3.25** |
| Subscription Mgmt Screen (3b) | 3 | 4 | 3 | 3 | **3.20** |
| Security Audit | 3 | 1 | 4 | 3 | **2.75** |
| App-wide Optimization | 3 | 3 | 2 | 3 | **2.75** |
| Creator Email Platform | 3 | 3 | 2 | 2 | **2.60** | Phase 0 (event broadcasts) API done |
| Stripe Migration (3c) | 3 | 4 | 1 | 1 | **2.40** |
| Feedback Board | 2 | 2 | 1 | 4 | **2.05** |
| Third-party API | 2 | 1 | 1 | 3 | **1.65** |

Weights: Leverage 35% · UX Return 25% · Urgency 25% · Simplicity 15%.

---

## Execution Order

```
1.  PWA UI Redesign               — right time with small user base, no tech debt pressure
2.  PostHog Analytics             — before driving traffic you need visibility
3.  Security Audit                — before scaling, know your exposure
4.  App-wide Optimization         — before cardio ships, clean the foundation
5.  Cardio Tracking V1            — major differentiator; long-track build, start architecture in parallel with 2–4
6.  Subscription Mgmt Screen (3b) — status + cancel UI, contained build
7.  Creator Email Platform Ph.1   — unlocks creator marketing
8.  Stripe Migration (3c)         — decision-dependent, not urgent
9.  Feedback Board                — until user base warrants it
10. Third-party API               — premature at current user count
```

**Track notes:**
- **Cardio V1 (#5)** is a long-track build. Start architecture and wearable OAuth research during items 3–4. GPS and provider flows take time to get right.
- **Stripe Migration (#8)** is gated on a business decision — don't start until that decision is made.
- **Completed:** API Testing & QA — merged April 2026. Payment Checkout UX Fix (3a) — completed April 2026. Creator Dashboard Rebuild — completed April 2026. Recipe Videos — completed April 2026. Consumer Landing Redesign — completed 2026-04-17. Creator Landing — completed 2026-04-21. One-on-One Lock-in + Leave Flow (3d) — completed 2026-04-21. Video Exchange System — completed 2026-04-27.
