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

## 4. Email Sequence Infrastructure (NOT IMPLEMENTED)

Event-driven email automation system. Goal: lay the infrastructure and trigger framework, not write all sequences yet.

### Architecture

**Trigger system (Cloud Functions):**
- Email sequences are triggered by **events** (user sign-up, inactivity, purchase, etc.)
- Each trigger creates a **sequence enrollment** document in Firestore
- A scheduled Cloud Function (runs every hour or so) checks for pending emails in active sequences and sends them

**Firestore collections:**

`email_sequences/{sequenceId}` — sequence definitions
```
{
  name: string,
  triggerEvent: string,           // e.g., "user.signup", "user.inactive_7d"
  steps: [
    { delayHours: 0, templateId: "welcome_1" },
    { delayHours: 48, templateId: "welcome_2" },
    { delayHours: 168, templateId: "welcome_3" }
  ],
  active: boolean,
  targetRole: "user" | "creator" | "all"
}
```

`email_sequence_enrollments/{enrollmentId}` — active enrollments
```
{
  sequenceId: string,
  userId: string,
  email: string,
  currentStep: number,
  enrolledAt: timestamp,
  nextSendAt: timestamp,
  status: "active" | "completed" | "cancelled",
  history: [{ step: 0, sentAt: timestamp, templateId: "welcome_1" }]
}
```

**Sending:** Use Resend (already integrated for event confirmation emails). Email templates as HTML in Cloud Functions code or stored in Firestore.

### Trigger Events (initial set — expand over time)
- `user.signup` — new user created
- `user.inactive_7d` — no workout or diary entry in 7 days
- `user.first_purchase` — first program purchased
- `creator.signup` — new creator onboarding completed
- `creator.first_client` — creator enrolls their first client
- `user.subscription_cancelled` — subscription cancelled (already have cancellation feedback collection)

### Implementation Scope (infrastructure only)
- [ ] Sequence and enrollment Firestore collections
- [ ] Enrollment trigger logic (Cloud Function that listens for events and creates enrollments)
- [ ] Scheduled sender function (checks `nextSendAt`, sends email, advances step)
- [ ] Cancellation logic (user unsubscribes, sequence completes, or manual cancel)
- [ ] One test sequence (e.g., welcome email on signup) to validate the pipeline
- [ ] Admin endpoint to list/create/deactivate sequences

### Considerations
- Resend handles deliverability, bounce tracking, and unsubscribe links
- Keep templates simple — plain HTML, no heavy templating engine
- Unsubscribe must be respected (store opt-out flag on user doc or in Resend)
- Rate limit sending to avoid Resend limits on free tier
- This replaces no existing system — it's net-new infrastructure

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
3. **Section 4** — Email sequence infrastructure (lay the trigger framework while API is fresh)
4. **Section 3** — Feedback board (self-contained feature, gives users a voice)
5. **Section 5** — Creator dashboard rebuild (largest effort, benefits from data + stable API)
6. **Section 6** — Video exchange (future)
