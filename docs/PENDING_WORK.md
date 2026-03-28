# Wake — Pending & Partial Implementation Tracker

Single source of truth for everything that has been designed/specified but not yet implemented or only partially implemented. Created 2026-03-20 by consolidating all docs.

---

## 1. API Testing & QA (NOT STARTED)

The entire API infrastructure branch (`api-infrastructure`) has been built but **nothing has been tested end-to-end**. This must be validated before any new feature work begins.

### Approach
1. ~~Complete staging environment setup~~ — done, live at `https://wake-staging.web.app`
2. Walk through every domain systematically — hit each endpoint, verify responses, check error handling
3. Test both apps (PWA + creator dashboard) against the API
4. Fix bugs found during testing
5. Merge `api-infrastructure` into `main` once stable
6. (Future) Add GitHub Actions CI/CD for auto-deploy to staging on push to `main`

### Testing Checklists

**Auth & Profile:**
- [ ] Sign up new user → `onUserCreated` trigger fires → user doc created
- [ ] Login → token validation → profile fetch via API
- [ ] Profile update (name, picture, settings)
- [ ] Username availability check

**Nutrition:**
- [ ] Food search (FatSecret proxy)
- [ ] Food detail / barcode lookup
- [ ] Diary CRUD (add, edit, delete entries)
- [ ] Saved foods CRUD
- [ ] Nutrition plan assignment read

**Progress/Lab:**
- [ ] Body log CRUD
- [ ] Readiness CRUD
- [ ] Exercise history read
- [ ] Session history read with pagination

**Workout:**
- [ ] Daily workout fetch
- [ ] Session completion (sets, exercises, full session)
- [ ] Exercise last performance lookup

**Creator:**
- [ ] Client list with filtering
- [ ] Program CRUD (create, edit, duplicate, delete)
- [ ] Library sessions/modules CRUD
- [ ] Nutrition plan/meal library CRUD
- [ ] Booking/availability management
- [ ] Client enrollment (one-on-one invite)
- [ ] Cross-creator isolation (creator A cannot access creator B's data)

**Payments:**
- [ ] Payment preference creation
- [ ] Subscription checkout
- [ ] Webhook processing (use MercadoPago sandbox)
- [ ] Subscription status updates

**Cross-cutting:**
- [ ] Offline queue: queue requests while offline, replay on reconnect
- [ ] Rate limiting: verify 429 responses and client retry behavior
- [ ] API key auth: create key, use key, verify scoping
- [ ] Error responses match standard shape across all endpoints

---

## 2. PostHog Analytics System (NOT IMPLEMENTED)

Full-scale product analytics using PostHog. Goal: understand user behavior, feature usage, funnels, retention, and inform product decisions.

### Why PostHog
- Self-serve analytics (no custom dashboards needed for basic questions)
- Feature flags, session replay, and funnels built-in
- Generous free tier (1M events/month)
- JS SDK works in both Vite apps and Expo web

### Implementation Plan

**Infrastructure:**
- Install `posthog-js` in PWA, creator-dashboard, and landing
- Create shared initialization config (project API key, host)
- Identify users on login (`posthog.identify(userId, { role, creatorDeliveryType, ... })`)
- Reset on logout (`posthog.reset()`)
- Respect user privacy: no PII in event properties (no email, no name — only userId and role)

**Key Events to Track (to be refined during planning):**
- **Acquisition:** landing page views, CTA clicks, sign-up started, sign-up completed, onboarding step completions
- **Activation:** first workout completed, first diary entry, first program purchased
- **Engagement:** daily active sessions, workout completions, diary entries per day, program progress
- **Creator-specific:** client added, program created, session built, nutrition plan assigned, call booked
- **Retention signals:** days since last session, streak length, return after inactivity

**Dashboards to build (in PostHog, not in-app):**
- User funnel: landing → signup → onboarding complete → first workout
- Daily/weekly active users
- Feature usage heatmap
- Creator engagement metrics
- Retention cohorts

### Considerations
- Add analytics calls at the **service layer** (not in components) so they survive UI refactors
- Keep event naming consistent: `domain.action` format (e.g., `workout.completed`, `nutrition.diary_entry_added`)
- Don't instrument everything at once — start with the funnel events, expand based on questions

---

## 3. Feedback Board (NOT IMPLEMENTED)

In-app feature request and bug report board for both PWA and creator dashboard. Users/creators propose features, others vote to prioritize.

### Concept
- Board visible inside each app (PWA and creator dashboard, separate views)
- Anyone can submit a feature request or bug report
- Other users can upvote (one vote per user per item)
- Items sorted by vote count (most voted first)
- Optional: status labels (proposed, planned, in progress, shipped)
- Admin view for us to update statuses

### Data Model

**Firestore collection: `feedback_board/{itemId}`**
```
{
  title: string,
  description: string,
  type: "feature" | "bug",
  app: "pwa" | "creator",        // which app it was submitted from
  status: "proposed" | "planned" | "in_progress" | "shipped",
  authorId: string,
  authorRole: "user" | "creator",
  voteCount: number,
  createdAt: timestamp,
  updatedAt: timestamp
}
```

**Firestore subcollection: `feedback_board/{itemId}/votes/{oderId}`**
```
{
  oderId: string,
  votedAt: timestamp
}
```

Vote count maintained via Cloud Function or transaction (increment on vote, decrement on unvote). One vote per user per item enforced by using `userId` as the vote document ID.

### API Endpoints (under `/api/v1/feedback`)
- `GET /feedback?app=pwa&sort=votes` — list items, paginated
- `POST /feedback` — submit new item
- `POST /feedback/:id/vote` — upvote (toggle)
- `PATCH /feedback/:id` — update status (admin only)

### UI
- Simple list view with vote button, title, description preview, status badge
- Submit form: title + description + type selector
- Sorting: by votes (default), by recent
- Filtering: by type (feature/bug), by status

---

## 4. Creator Email Platform (NOT IMPLEMENTED)

Complete email marketing system for creators — manual campaigns, reusable templates, and automated sequences. Designed as a platform-level feature used across events, programs, 1:1 clients, and general marketing. Built on Resend (already integrated via `RESEND_API_KEY`).

### Where email is used across Wake

| Area | Manual campaigns | Automated sequences |
|---|---|---|
| **Events** | Post-event thanks, announcements | Confirmation on register, reminder 24h before, post-event survey, waitlist notification |
| **Programs** | Updates to all enrollees | Welcome on enrollment, weekly motivation, expiry warning |
| **1:1 clients** | Check-in messages | Onboarding sequence, progress milestones |
| **General** | Promotions, announcements | Re-engagement for inactive users |

### Data Model

**Templates:**
```
creator_emails/{creatorId}/templates/{templateId}
  name: string
  subject: string
  body: string (HTML)
  variables: string[]              // e.g. ["nombre", "evento", "fecha"]
  created_at, updated_at
```

**Campaigns (manual sends):**
```
creator_emails/{creatorId}/campaigns/{campaignId}
  templateId: string | null        // or inline subject + body
  subject: string
  body: string
  audience: {
    type: 'event_registrants' | 'program_enrollees' | 'clients' | 'all_contacts'
    resourceId: string | null      // specific event/program ID
    filters: { ... }               // e.g. { checked_in: true, field_f_genero: 'Femenino' }
  }
  status: 'draft' | 'scheduled' | 'sending' | 'sent'
  scheduled_at: timestamp | null   // null = send now
  stats: { total, sent, opened, clicked, failed }
  created_at
```

**Sequences (automated):**
```
creator_emails/{creatorId}/sequences/{sequenceId}
  name: string
  status: 'active' | 'paused' | 'draft'
  trigger: {
    type: 'event_register' | 'event_checkin' | 'program_enroll' | 'client_added' |
          'user_signup' | 'user_inactive_7d' | 'subscription_cancelled'
    resourceId: string | null
  }
  steps: [
    { delay_hours: number, subject: string, body: string, templateId?: string }
  ]
  created_at
```

**Sequence enrollments:**
```
email_sequence_enrollments/{enrollmentId}
  creatorId: string
  sequenceId: string
  recipientEmail: string
  recipientName: string
  currentStep: number
  enrolledAt: timestamp
  nextSendAt: timestamp
  status: 'active' | 'completed' | 'cancelled'
```

**Send log (single source of truth for all emails):**
```
email_sends/{sendId}
  creatorId: string
  campaignId | sequenceId: string
  recipientEmail: string
  resendMessageId: string
  status: 'queued' | 'sent' | 'delivered' | 'opened' | 'clicked' | 'bounced'
  sent_at, opened_at, clicked_at
```

### Audience Resolver

Cross-platform function that takes an audience definition and returns `{ email, name, variables }[]`. Same resolver used by campaigns and sequences.

| audience.type | Firestore source | Key filters |
|---|---|---|
| `event_registrants` | `event_signups/{resourceId}/registrations` | `checked_in`, custom field values |
| `program_enrollees` | `users` where `courses.{resourceId}` exists | `status`, `deliveryType` |
| `clients` | `one_on_one_clients` where `creatorId` matches | `status` |
| `all_contacts` | Union of all above, deduplicated by email | — |

### Phase 1: Manual Campaigns (BUILD FIRST)

**Creator dashboard UI:**
- New screen: `/creators/emails` — campaign list with status and stats
- New screen: `/creators/emails/new` — compose email
  - Subject line input
  - Rich text body (bold, italic, links, variables like `{{nombre}}`)
  - Audience picker: source type → specific resource → optional filters
  - "Enviar ahora" button
- Campaign detail: sent count, open rate, click rate (from Resend webhooks)

**API endpoints:**
- `GET /creator/emails/campaigns` — list campaigns with stats
- `POST /creator/emails/campaigns` — create campaign (draft)
- `PATCH /creator/emails/campaigns/:id` — update draft
- `POST /creator/emails/campaigns/:id/send` — trigger send
- `GET /creator/emails/campaigns/:id` — detail with per-recipient status

**Backend:**
- Cloud Function processes send: resolve audience → loop recipients → call Resend API → write `email_sends` records
- Resend webhook handler (`POST /webhooks/resend`) updates `email_sends` with delivery/open/click events
- Batch sends (Resend batch API or chunked loop with rate limiting)

**Phase 1 checklist:**
- [ ] Firestore collections: `creator_emails`, `email_sends`
- [ ] Audience resolver function (event_registrants + clients initially)
- [ ] Campaign CRUD API endpoints
- [ ] Send processor (Cloud Function)
- [ ] Resend webhook handler for delivery tracking
- [ ] Creator dashboard: campaign list screen
- [ ] Creator dashboard: compose + audience picker screen
- [ ] Creator dashboard: campaign detail with stats

### Phase 2: Templates + Scheduling

- Save any campaign as a reusable template
- Pre-built starter templates: "Confirmacion de registro", "Recordatorio 24h", "Gracias por asistir"
- Schedule picker: send at specific date/time
- Cloud Scheduler function checks for `scheduled_at` <= now and fires sends
- Template management screen in creator dashboard

**Phase 2 checklist:**
- [ ] Template CRUD (Firestore + API)
- [ ] Template picker in compose screen
- [ ] Schedule picker UI + `scheduled_at` field
- [ ] Scheduled send processor (pub/sub or Cloud Scheduler)

### Phase 3: Automated Sequences

- Sequence builder UI: list of steps with configurable delays
- Trigger system: Firestore `onCreate` / Cloud Function listeners that check for matching active sequences and create enrollments
- Execution engine: scheduled Cloud Function (runs hourly) processes enrollments where `nextSendAt` <= now
- Pause/resume sequences
- Per-step analytics (sent, opened per step)

**Trigger events (expand over time):**
- `event_register` — user registers for event
- `event_checkin` — user checks in at event
- `program_enroll` — user enrolls in program
- `client_added` — creator adds 1:1 client
- `user_signup` — new user created
- `user_inactive_7d` — no activity in 7 days
- `subscription_cancelled` — subscription cancelled

**Phase 3 checklist:**
- [ ] Sequence CRUD (Firestore + API)
- [ ] Enrollment trigger logic
- [ ] Scheduled sender for sequence steps
- [ ] Cancellation logic (unsubscribe, sequence complete, manual)
- [ ] Sequence builder UI in creator dashboard
- [ ] Per-step analytics

### Key Design Decisions

- **`email_sends` is the spine** — every email from any source (campaign or sequence) gets a record here. Analytics, billing, deliverability monitoring all read from one place.
- **Audience resolver is abstract** — adding a new audience type is one function, not a schema change.
- **Resend handles the hard parts** — deliverability, open/click tracking, bounce handling, unsubscribe compliance. We don't build email infrastructure.
- **Variables are universal** — `{{nombre}}`, `{{evento}}`, `{{fecha}}` work identically in campaigns, sequences, and templates.
- **Unsubscribe is mandatory** — store opt-out per creator per recipient (Resend manages the link). Never email someone who opted out.
- **Rate limiting** — batch sends respect Resend rate limits. Queue excess and process over time.

---

## 5. Creator Dashboard Rebuild (NOT STARTED)

Full visual and UX rebuild of `apps/creator-dashboard`. Design direction is locked — see memory file `project_creator_dashboard_rebuild.md` for complete spec including nav architecture, screen briefs, onboarding flow, copy/propagation system, and revenue display logic.

### Key Points
- Editorial/premium dark aesthetic with 21st.dev components
- Optimistic UI + debounced auto-save everywhere
- Contextual spotlight tutorial system
- Adaptive navigation (creators show/hide sections)
- All screens rebuilt: Inicio, Clientes, Programas, Biblioteca, Nutrición, Eventos, Disponibilidad, Perfil
- New creator onboarding (7-step immersive flow)

### Depends On
- Stable, tested API (Section 1)
- PostHog in place to measure creator engagement (Section 2)

---

## 6. Video Exchange System (NOT IMPLEMENTED — Future)

One-on-one only. Client uploads form-check videos, creator responds with feedback videos.

### Data Model (when built)
- Storage: `users/{userId}/session_videos/{sessionId}/{videoId}.mp4`
- Firestore: `users/{userId}/sessionHistory/{sessionId}/sessionVideos/{videoId}`
  - Required: `storagePath`, `url`, `createdAt`, `uploadedBy`
  - Optional: `exerciseKey`, `setIndex`, `exerciseId`, `responseToVideoId`
- Use Firebase Storage resumable uploads (`uploadBytesResumable`)
- Client-side compression to 720p before upload

### Priority
Low. Implement after session notes are shipped and validated.

---

## Priority Order

1. **Section 1** — Test & stabilize API infrastructure (everything depends on this)
2. **Section 2** — PostHog analytics (gives visibility into user behavior, informs all future decisions)
3. **Section 4 Phase 1** — Creator email platform: manual campaigns (immediate creator value, lays foundation for sequences)
4. **Section 3** — Feedback board (self-contained feature, gives users a voice)
5. **Section 4 Phase 2** — Email templates + scheduling
6. **Section 5** — Creator dashboard rebuild (largest effort, benefits from data + stable API)
7. **Section 4 Phase 3** — Automated email sequences (builds on stable campaign infrastructure)
8. **Section 6** — Video exchange (future)
