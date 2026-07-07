# Wake — Pending Work

Last updated: 2026-07-07. Single source of truth for all unimplemented, partial, and planned work.

---

## Status Key

`NOT STARTED` · `IN PROGRESS` · `IMPLEMENTED — NOT TESTED` · `COMPLETED`

---

## Product Quality

### Recursos adicionales — visor PDF en móvil `COMPLETED`

Feature "Recursos adicionales" (PDF / YouTube / link por programa, tarjeta "Recursos" en el carrusel del Hoy → pantalla de lista → visor) **SHIPPED a prod 2026-06-30**. Visor PDF **in-app con pdf.js** desplegado 2026-06-30.

- **Modelo:** array `additional_resources` en `courses/{courseId}` → `{ id, type:'pdf'|'youtube'|'link', title, url, storage_path?, order }`. Endpoint gateado `GET /workout/courses/:id/resources`; campo público `additional_resources_count` dispara la tarjeta. Creador lo edita en el subtab "Recursos" de `ProgramResourcesTab.jsx`. PDFs suben por `/creator/media/upload-url` (acepta `application/pdf`, `storage.rules` permite <25MB).
- **Datos sembrados:** curso `ezJWUr3wJvaeptIM5f86` (Código ABS, Felipe Bejarano) tiene el "Manuscrito" (PDF 13.8MB, 17 páginas).
- **Root cause del bug:** el dispositivo del usuario servía el bundle **v1** cacheado por el PWA instalado. v1 abría el PDF en un `<iframe>` (blanco en móvil WebKit/Chrome — limitación del navegador, no bug de Wake) y su barra de cierre no usaba `env(safe-area-inset-top)` → quedaba bajo el notch. Las "correcciones" posteriores (gview, luego `window.open` externo) nunca fueron lo que el usuario quería (quería dentro de la app) y además no habían propagado al dispositivo.
- **Fix desplegado:** visor in-app con **pdf.js** (`pdfjs-dist` 3.x legacy) que renderiza el PDF en `<canvas>` — única forma confiable de verlo dentro de la app en móvil. Sin terceros.
  - Componente: `apps/pwa/src/components/resources/PdfViewerOverlay.web.jsx`. Carga pdf.js on-demand desde assets estáticos same-origin (`/app/pdf.min.js` + worker), copiados de `node_modules` por `apps/pwa/scripts/copy-pdf-assets.js` (via `postinstall` + `build:pwa`; gitignored, fuera del bundle principal → main bundle sigue en ~7MB).
  - Renderizado lazy por página (IntersectionObserver, ventana ±1.5 viewports, DPR≤2) → memoria acotada para el PDF de 13.8MB. Barra superior notch-safe. Fallback "Abrir en el navegador" si algo falla.
  - CSP: no requirió cambios — el worker es same-origin (cubierto por `default-src 'self'`) y el fetch del PDF va a `firebasestorage.googleapis.com` (ya en `connect-src`; CORS del bucket permite `wakelab.co` + Range).
- **Verificado:** build de prod OK; Playwright renderizó el Manuscrito real (17 páginas, canvas no-blanco). Assets live en `wakelab.co/app/pdf.min.js` + worker (200). **Pendiente confirmación on-device:** el usuario debe cerrar y reabrir (o reinstalar) el PWA instalado para soltar el bundle v1 cacheado y recibir el visor nuevo.

Archivos: `apps/pwa/src/components/resources/PdfViewerOverlay.web.jsx`, `apps/pwa/src/screens/ResourcesScreen.web.jsx`.

---

### Guest checkout del storefront `COMPLETED` — follow-ups abiertos

**SHIPPED a prod 2026-07-05/06** (commits `38c5027`, `6604149`). El buy page ya no exige cuenta antes de pagar: CTA → un campo de correo → `POST /public/checkout/guest-start` (público, rate-limited por IP+correo) hace find-or-create del usuario de Firebase Auth y crea el checkout (MP `init_point` o Polar, `provider:'polar'`). Correo ya-dueño → magic link en vez de doble cobro. Post-pago: magic link automático al correo stashed (`wake_email_for_sign_in`); al consumirlo, `EmailLinkSignInScreen` ofrece vincular Google (`linkWithPopup`, opcional, nunca bloquea). AuthModal quedó solo para `book_call`. Contexto completo: memoria del funnel ManyChat 2026-07-05 (~96% moría en el AuthModal) y `docs/API_ENDPOINTS.md` §10.

**Follow-ups abiertos:**
- **Primer pago real por la vía guest** — E2E verificado hasta el formulario de tarjeta (MP invitado + Polar) con Playwright; falta que un comprador orgánico complete el cobro (el primero llegó hasta MP a los ~10s del CTA la noche del 2026-07-06).
- **App Check dentro del webview real de IG** — la vía guest lo esquiva (endpoint público), pero la vía authed (usuarios con sesión) sigue dependiendo de él; nunca se ha verificado en el webview real.
- **Google-link completado** — el popup abre y cancelar es inocuo (verificado); completar el login requiere un humano con cuenta Google real.
- **`/public/checkout/status` es auth-gated** — los guests no pueden hacer poll post-pago; hoy ven el estado suave + magic link. Considerar variante pública firmada si molesta.
- **Fase 2 MP sin redirect** — preapproval por API con `card_token_id` (Bricks embebido) eliminaría también el redirect a MP; verificar disponibilidad en Colombia antes de diseñar.
- **Limpieza de artefactos QA** — auth user `wake.qa.guest.jul05@gmail.com` (preapprovals pending, sin compras); cuenta QA `emilioloboguerrero+wakeqa0703@` (ojo: MP rechaza ese alias del collector con 500 — no sirve para probar compras MP).
- **Medición** — funnel "Guest checkout — funnel del buy page" (PostHog `4VMIdXbS`, dashboard Core Metrics); comparar contra el baseline 0.19% viewer→pago del blast 2026-07-05 cuando salga el próximo blast.

---

### Buy-page conversión + velocidad `SHIPPED 2026-07-06/07` — un follow-up abierto

Pase de conversión sobre `CreatorProgramDetailScreen` (genérico para el builder, seedeado y live para Código ABS). Detalle técnico completo en la memoria `project_landing_sections.md`. Resumen: **hero "carátula con texto"** (campo nuevo `courses.hero_headline` → `program.heroHeadline`, overlay sobre la portada), **YouTube click-to-load facade** (portada + play; el iframe carga al tocar), **App Check/reCAPTCHA diferido** (ya NO es eager en el landing — se calienta en la primera interacción; ~2 MB fuera del render inicial), **barra de compra sticky** (móvil), **secciones más grandes**, **sección "Así se ve por dentro"** con 3 screenshots de la app en abanico con forma de teléfono (`SectionFan` detecta imágenes verticales con un `new Image()` probe — NO `onLoad`, que no dispara con imágenes cacheadas), chip "Precio de lanzamiento" + línea "Cancela cuando quieras", y ancla de precio `compare_at_price` 79k vs `subscription_price` 19k.

**Follow-up abierto:**
- **Editor del `hero_headline` en el dashboard** — hoy el titular del hero se seedea vía datos (Firestore); falta agregar el campo al editor de programas (`GroupProgramView`/`ProgramLandingSectionsEditor` o su config) para que el creador lo edite. Las imágenes de la sección "Así se ve por dentro" YA son editables desde el editor de secciones.

---

### 5b. Download Screen Refresh `NOT STARTED`

The course download screen (driven by `courseDownloadService` in the PWA) is the first sustained moment of attention after purchase — currently a generic loading UI. Two changes:

1. **Add a new explainer/intro video** that plays during the download. Sets expectations for the program, builds anticipation, makes the wait feel intentional.
2. **Optimize the existing video asset** — re-encode for smaller size, modern codec (H.265/AV1 with H.264 fallback), poster frame, lazy load, and ensure no jank during the download progress updates.

**Scope:**
- Audit the current download screen UI and animation quality (entrances, progress feel)
- Re-encode the existing video — target ~50% size reduction without visible quality loss; verify on slow connections
- Source/produce the new intro video; coordinate with creators if it's per-program or global
- Decide: one global intro video, or per-creator/per-program (latter implies a `introVideoUrl` field on `courses/{courseId}`)
- Storage path: Firebase Storage with appropriate cache headers (long max-age, immutable)
- Preload strategy: start video fetch in parallel with course assets, not after
- Fallback if video fails: skip silently to existing UI, no error state shown to user

**Checklist:**
- [ ] Audit current download screen — measure time-to-first-frame, total download time on 3G/4G/wifi
- [ ] Re-encode existing video — H.264 baseline + H.265/AV1, document final sizes
- [ ] Decide global vs per-program intro video (recommend global for V1)
- [ ] Source/produce the new intro video
- [ ] Add `introVideoUrl` field if going per-program
- [ ] Update download screen UI with video playback
- [ ] Cache headers + Firebase Storage upload
- [ ] Lazy/parallel preload alongside course asset download
- [ ] Graceful fallback when video fails to load
- [ ] Verify autoplay works on iOS Safari (muted, playsinline)
- [ ] Test on slow connections — video must not block course download

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

### 6. PostHog Analytics `IMPLEMENTED — NOT TESTED`

All 5 layers shipped 2026-05-10 in one pass. Goal: behavior, usage, **cost per user/coach**, and optimization opportunities. Free-tier safe: session-level events only, server cost events sampled at 10% (5xx always captured).

**What shipped:**

| Layer | Where |
|---|---|
| 1 — Behavioral analytics | `apps/{pwa,creator-dashboard,landing}/src/services/analyticsService.js` |
| 2 — Cost telemetry (server) | `functions/src/lib/analytics.ts` + `functions/src/api/middleware/analytics.ts` |
| 3 — Performance (web vitals) | `capture_performance: { web_vitals: true }` in all 3 client services |
| 4 — Multi-coach attribution | `functions/src/api/services/coachAttribution.ts` (10-min in-memory cache) |
| 5 — Quota / sampling | Session-level events only, 10% API request sample, all cost events 100% |

**Server emits (cost-attribution stamped with `primary_coach_id` + `coach_ids[]`):**
- `api.request_completed` — sampled 10%, all 5xx — includes `route`, `method`, `status`, `duration_ms`, `fatsecret_calls`, `emails_sent`
- `program.purchase_completed` — MercadoPago webhook (`functions/src/api/routes/payments.ts`)
- `email.batch_sent` — `processEmailQueue` in `functions/src/index.ts`
- `workout.session_abandoned` — `detectAbandonedSessions` cron

**Client emits (PWA web, creator dashboard, landing):**
- `screen.viewed` — one per route change via `useLocation` listener
- `auth.login`, `auth.signup_completed`, `auth.logout` — email + google + apple in PWA; email in creator dashboard
- `workout.session_started`, `workout.session_completed { sets_completed, exercises_completed, had_pr, duration_seconds }`
- `program.purchase_started`
- `onboarding.completed { primary_goal, training_experience, training_days_per_week, equipment }`
- `progress.body_log_added`, `progress.readiness_added`
- Creator: `creator.client_added`, `creator.program_created`, `creator.program_published`, `creator.nutrition_plan_created`, `creator.event_created`
- `$web_vitals` — automatic per page

**Multi-coach handling:** server resolves `coachIds[]` from `one_on_one_clients where clientId=userId` (for users) or trivially `[userId]` (for creators). PostHog person properties hydrated on identify (deduped 10 min per function instance) so client events inherit attribution via PostHog cohort filters.

**Quota math:** at 1k DAU → ~10 screen.viewed + 2 workout + 1 progress + 1 auth + sampled api.request_completed ≈ 15–20 events/user/day → ~500k events/month. Free tier 1M comfortably accommodates 2× growth before hitting paid.

**Secrets:** add `POSTHOG_API_KEY` to Firebase Secret Manager before deploy. Already bound in `api`, `processEmailQueue`, `detectAbandonedSessions` secret arrays. Client env vars: `EXPO_PUBLIC_POSTHOG_KEY` (PWA), `VITE_POSTHOG_KEY` (creator + landing). Service silently no-ops when key missing.

**Privacy:** opt-out toggle in PWA `apps/pwa/src/screens/ProfileScreen.js` ("Compartir uso anónimo"). `localStorage.wake_analytics_opt_out=1` persists across sessions. `maskAllInputs: true` + `data-ph-no-capture` selector applied site-wide. Privacy policy update (Ley 1581 disclosure) still pending — coordinate with legal before flipping on production.

**Pre-deploy checklist:**
- [ ] Create PostHog project, copy project API key (client) and server API key
- [ ] Bind `POSTHOG_API_KEY` secret in Firebase Secret Manager (production + staging)
- [ ] Set `EXPO_PUBLIC_POSTHOG_KEY` in `apps/pwa/.env`
- [ ] Set `VITE_POSTHOG_KEY` in `apps/creator-dashboard/.env` and `apps/landing/.env`
- [ ] Update privacy policy with PostHog disclosure
- [ ] Verify in PostHog live view: signup → onboarding → workout funnel
- [ ] Build acquisition funnel + cost-per-coach cohort dashboards

**Original spec retained below for reference:**

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

### Frontend load-time performance — code-splitting `IN PROGRESS`

Pase de tiempo-de-carga sobre las tres apps web (2026-07-06/07). Detalle completo y gotchas de deploy: memoria `project_landing_perf_codesplit_20260707`.

- **Landing `COMPLETED` (live):** todas las pantallas de ruta en `apps/landing/src/App.jsx` → `lazy()` + `Suspense`; PostHog con import dinámico + init en idle + cola de eventos; `firebase/auth` diferido fuera del Header; 11 imágenes de `landing_sections` recomprimidas a WebP. Entry **830 → 189 KB raw / 225 → 53 KB brotli**.
- **Creator-dashboard `COMPLETED` (live):** las ~28 pantallas de `apps/creator-dashboard/src/App.jsx` (antes 0 `lazy()`) → `lazy()` + un `Suspense` sobre `<Routes>`. Entry **2895 → 652 KB raw / 186 KB brotli**; recharts/react-query/dnd-kit fuera del entry. Login arranca limpio.
- **PWA (`apps/pwa`, `/app`) `NOT STARTED`:** bundle único de Metro de **6.9 MB** (+1.5 MB pdf.js, ya lazy en archivos aparte). No hay win rápido/seguro: los levers reales son (a) crear variantes `.web.jsx` con recharts para que `react-native-chart-kit` + `react-native-svg` salgan del bundle web — 4 componentes sin `.web`: `ExerciseProgressChart`, `MuscleVolumeStats`, `PRHistoryChart`, `VolumeChart`; y/o (b) code-splitting de rutas en Metro. Ambos requieren pruebas de paridad nativa → esfuerzo dedicado. `react-native-gifted-charts` es dep muerta (0 usos).
- **Videos de `app_resources` (homepage) `NOT STARTED`:** la colección referencia **~675 MB de videos `.mov`** (QuickTime, 40–113 MB c/u) + PNGs de 2–3 MB. Probablemente el mayor problema de carga de la homepage, pero es migración de datos/transcoding (no rápido/seguro). Verificar primero si realmente se cargan en la home.

---

### 12. Platform Mapping & Documentation Refresh `NOT STARTED`

A complete, end-to-end audit and re-documentation of the entire Wake platform. Done **after** Cardio V1 ships, when the platform's surface area is at its largest and the cumulative drift between docs and reality is at its worst. Goal: a single coherent picture of the system that any future contributor (or future Claude session) can load and trust.

**Why it goes last (not first):** the platform is still gaining major surfaces — public buy pages, cardio, wearable integrations, email phases. Mapping now means re-mapping after every shipment. Doing it once after Cardio V1 captures the platform in a relatively stable state.

**What "everything" means — scope:**

1. **Cloud Functions (every export)**
   - For each function in `functions/src/index.ts`: signature, trigger, secrets used, inputs, outputs, side effects, error modes, callers
   - For each Express route in `functions/src/api/routes/*`: method, path, auth requirements, validation schema, response shape, error codes
   - Cron/scheduled functions: cadence, what they read, what they write
   - Webhooks: source, validation method, idempotency strategy

2. **Firestore (every collection)**
   - Schema for every document type, including subcollections
   - Read/write rules per collection (cross-reference `firestore.rules`)
   - Composite indexes (cross-reference `firestore.indexes.json`)
   - Lifecycle: who creates, who updates, who deletes, retention
   - Hot vs cold collections (read frequency)

3. **Storage (every path)**
   - Path conventions per resource type (profile pics, progress photos, course assets, route GeoJSON, email assets, intro videos, etc.)
   - Upload flow per type (signed URL? direct? size limit? compression?)
   - Storage rules per path
   - Cache headers and CDN behavior

4. **PWA (every screen)**
   - Screen inventory: route, file, purpose, primary user goal
   - Data dependencies per screen (which queries, which services)
   - Navigation graph — which screens link to which
   - Web vs native divergence (`.web.jsx` files and why)
   - Empty states, error states, loading states inventoried

5. **Creator Dashboard (every screen)**
   - Same inventory as PWA
   - Permission requirements per screen (creator-only, admin-only)
   - Data dependencies and write paths

6. **Landing (every page)**
   - Inventory: `/`, `/creadores`, `/c/:creatorSlug`, program pages, etc.
   - SEO meta, OG images, sitemap coverage
   - Public Firestore reads (`app_resources`, public storefronts)

7. **End-to-end flows**
   - Each major flow documented as a sequence diagram or numbered narrative — every screen, every API call, every Firestore write, every email/notification
   - Critical flows to map:
     - Signup → onboarding → first workout
     - Public buy page → guest checkout → magic link claim → first workout
     - In-app purchase → checkout → access grant
     - Subscription renewal (auto + cancel + refund)
     - One-on-one client enrollment (creator-initiated and lookup)
     - Workout session: start → in-progress → checkpoint → complete (and abandoned recovery)
     - Nutrition diary entry: search/barcode/saved → log → daily totals
     - Body log + readiness + PR detection
     - Cardio session: manual log, GPS-tracked, wearable-synced
     - Event creation → registration → confirmation email → check-in
     - Email broadcast: compose → queue → Resend → delivery webhooks → unsubscribe
     - Creator program build: library → modules → sessions → publish → assign

8. **Integrations**
   - MercadoPago (or Stripe by then): full lifecycle, every state transition, every webhook event mapped
   - FatSecret: proxy paths, auth, caching
   - Resend: send paths, webhook events, suppression lists
   - Each wearable provider (Garmin/Whoop/Oura/Fitbit): OAuth flow, token storage, sync cadence, normalization
   - PostHog: every event with properties, super properties, identify behavior

9. **Auth and authorization matrix**
   - Every role (`user`, `creator`, `admin`, third-party API key, public)
   - Every protected resource and which roles can read/write
   - Token refresh and expiration behavior
   - API key scopes

10. **Build, deploy, environments**
    - Production vs staging: differences, switching procedure
    - EAS builds: profiles, channels, OTA update behavior
    - Hosting deploy: assembly, rollback procedure
    - Secrets inventory: where each secret is used

**Output — what gets produced:**

Re-write or fresh-write the docs that future sessions actually load:

- `CLAUDE.md` — refreshed: current accurate engineering principles, structure, tech stack, locked decisions
- `docs/STANDARDS.md` — refreshed: visual + animation system as it actually exists post-redesign
- `docs/API_ENDPOINTS.md` — full regenerated reference (every route, every shape, every error)
- `docs/FIRESTORE_SCHEMA.md` (new) — every collection, every doc shape, every rule, every index
- `docs/STORAGE_PATHS.md` (new) — every path convention, every rule
- `docs/SCREENS.md` (new, possibly split per-app) — screen inventory + navigation graph
- `docs/FLOWS.md` (new) — every end-to-end flow diagrammed
- `docs/INTEGRATIONS.md` (new) — every external service and how Wake talks to it
- `docs/AUTHZ_MATRIX.md` (new) — role × resource × action grid
- Existing pending docs reconciled — anything in `PENDING_WORK.md` that shipped during the audit gets moved out

**Approach:**
1. Inventory pass first — list every file, every export, every route, every screen, every collection. Pure enumeration, no prose
2. Per-section deep audit — read source, document reality (not aspirations)
3. Flow mapping — pick one flow, trace it end-to-end through code, write it down, repeat
4. Reconcile against existing docs — flag every drift, every stale claim
5. Rewrite the canonical docs from scratch where drift is severe

**Discipline rules during the audit:**
- Document what the code does, not what it should do — surface divergences as findings, don't silently "fix" them in docs
- Every claim citable to a file path + line range
- No "TODO" entries in the new docs — if something's incomplete, it goes in `PENDING_WORK.md`, not the schema doc
- Use Explore subagents heavily — this is exactly the kind of broad enumeration they're built for

**Checklist:**
- [ ] Cloud Function inventory (Gen1 + Express routes)
- [ ] Firestore collection inventory + schema docs
- [ ] Storage path inventory
- [ ] PWA screen inventory + navigation graph
- [ ] Creator dashboard screen inventory + permission map
- [ ] Landing page inventory
- [ ] All major flows mapped end-to-end
- [ ] Integration documentation (MP/Stripe, FatSecret, Resend, wearables, PostHog)
- [ ] Auth × resource × action matrix
- [ ] Build/deploy/environment runbook refresh
- [ ] `CLAUDE.md` rewrite
- [ ] `docs/STANDARDS.md` refresh
- [ ] `docs/API_ENDPOINTS.md` regenerated
- [ ] New canonical docs created (`FIRESTORE_SCHEMA`, `STORAGE_PATHS`, `SCREENS`, `FLOWS`, `INTEGRATIONS`, `AUTHZ_MATRIX`)
- [ ] `PENDING_WORK.md` reconciled — shipped items removed, new gaps surfaced
- [ ] All drift findings logged and resolved (either docs corrected or code fixed)

---

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
| Cardio Tracking V1 | 5 | 5 | 2 | 1 | **3.65** |
| PostHog Analytics | 4 | 1 | 4 | 4 | **3.25** |
| Download Screen Refresh (5b) | 2 | 4 | 3 | 4 | **3.05** |
| App-wide Optimization | 3 | 3 | 2 | 3 | **2.75** |
| Creator Email Platform | 3 | 3 | 2 | 2 | **2.60** | Phase 0 (event broadcasts) API done |
| Platform Mapping (12) | 4 | 1 | 1 | 1 | **2.10** |
| Feedback Board | 2 | 2 | 1 | 4 | **2.05** |
| Third-party API | 2 | 1 | 1 | 3 | **1.65** |

Weights: Leverage 35% · UX Return 25% · Urgency 25% · Simplicity 15%.

---

## Execution Order

```
1. Download Screen Refresh (5b)  — new intro video + optimize existing asset
2. PostHog Analytics             — before driving traffic you need visibility
3. App-wide Optimization         — before cardio ships, clean the foundation
4. Cardio Tracking V1            — major differentiator; long-track build, start architecture in parallel with 2–3
5. Platform Mapping (12)         — full audit + canonical docs once the platform's surface is at its largest
6. Creator Email Platform Ph.1   — unlocks creator marketing
7. Feedback Board                — until user base warrants it
8. Third-party API               — premature at current user count
```

**Track notes:**
- **Cardio V1 (#4)** is a long-track build. Start architecture and wearable OAuth research during items 2–3. GPS and provider flows take time to get right.
- **Platform Mapping (#5)** is intentionally scheduled after Cardio V1, when surface area is largest and most stable. Doing it earlier means re-doing it after every major shipment.
- **Completed:** API Testing & QA — merged April 2026. Payment Checkout UX Fix (3a) — completed April 2026. Recipe Videos — completed April 2026. Consumer Landing Redesign — completed 2026-04-17. Creator Landing — completed 2026-04-21. One-on-One Lock-in + Leave Flow (3d) — completed 2026-04-21. Video Exchange System — completed 2026-04-27. Platform Security Audit — completed 2026-05-03. PWA UI Redesign — completed 2026-05-05. Subscription Management Screen (3b) — completed 2026-05-10. Creator Public Buy Page (3e) — completed 2026-05-10. **Polar international payments (Phase 1) — LIVE in prod with real money 2026-07-03** (MoR for international cards, coexists with MercadoPago; international USD on by default; single "Gestionar suscripción" → Polar portal; `payment_ledger`; see `docs/POLAR_INTEGRATION_STATUS.md`).
- **Stripe Migration (3c):** removed from roadmap 2026-05-10. International payments are now handled by **Polar (merchant-of-record)** alongside MercadoPago (Colombia) — see `docs/POLAR_INTEGRATION_STATUS.md`. Phase 2 (marketplace split-at-source: dLocal vs Stripe Atlas+Connect) remains future/undecided.
- **Payments OPEN:** `PLATFORM_COMMISSION_RATE` (in `payment_ledger`) still `null` — fill when the owner decides the Polar vs MP platform commission.
