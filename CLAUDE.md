# Wake — Claude Code Briefing

## Engineering Principles

These apply to every decision, every file, every line of code:

- **Performance first** — be deliberate with Firestore reads/writes, Cloud Function invocations, and Storage operations. They all cost money and affect UX. Don't optimize prematurely, but never write obviously wasteful code.
- **UI/UX quality** — every interaction must feel intentional and polished. Loading states, error states, transitions, and empty states all matter.
- **Simplest solution always** — the right amount of complexity is the minimum needed. Three similar lines of code is better than a premature abstraction. Don't build for hypothetical future requirements.
- **No speculative work** — only make changes that are directly requested or clearly necessary. Don't add features, refactor, or "improve" things that weren't asked about.
- **Debugging discipline** — before fixing any bug, check for context first (what state/props/data is actually flowing in), look for duplicate sections or conflicting logic, and always remove the old broken code when applying a fix. Never leave dead code behind after debugging.
- **Read `docs/STANDARDS.md` before writing any UI code** — it contains the visual system, animation language, component patterns, and data structure reference.

---

## What This Project Is

Wake is a **fitness & nutrition platform** targeting Spanish-speaking users (primarily Colombia). It is a monorepo containing **three web apps + Firebase Cloud Functions**, all served from a single Firebase Hosting deployment.

- **Landing** (`/`) — Marketing landing page
- **PWA** (`/app`) — Consumer app; users track workouts and meals from programs assigned by coaches
- **Creator Dashboard** (`/creators`) — Web dashboard for coaches to manage clients, programs, libraries, nutrition plans, and bookings

---

## Monorepo Structure

```
/app                          ← repo root (project name: "wake")
  apps/
    landing/                  ← Vite + React 18, base: /
    pwa/                      ← Expo SDK 54 + React Native 0.81.5, exported as web PWA, base: /app
    creator-dashboard/        ← Vite + React 18, base: /creators
  functions/                  ← Firebase Cloud Functions (TypeScript, Node 22)
  config/
    firebase/                 ← firestore.rules, storage.rules, google-services.json, GoogleService-Info.plist
  scripts/                    ← Build orchestration Node.js scripts
  docs/                       ← Design/architecture standards docs
  hosting/                    ← Assembled build output (gitignored, never edit directly)
  firebase.json
  firestore.indexes.json
  .firebaserc                 ← Firebase project alias: wolf-20b8b
  package.json                ← Root orchestrator
```

---

## Tech Stack

### apps/pwa
- **Expo SDK ~54**, React Native 0.81.5, React 19
- **Language:** JavaScript (`.js`, `.web.js`, `.web.jsx`) — NOT TypeScript
- **Navigation:** React Navigation v7 (native); React Router v6 with `BrowserRouter` at basename `/app` (web)
- **Platform files:** Metro resolves `.web.js` over `.js` on web. Default: one file for both platforms. Create `.web.jsx` only when web behavior meaningfully diverges from native — never preemptively.
- **Auth:** Firebase Auth (email/password, Google Sign-In, Apple Sign-In)
- **State:** Context API (`AuthContext`, `UserRoleContext`, `VideoContext`), React Query for server state
- **Data:** Firebase Firestore + React Query (replacing legacy cache systems in migration)
- **Key services (singletons):** `FirestoreService`, `PurchaseService`, `AuthService`, `courseDownloadService`, `hybridDataService`, `libraryResolutionService`, `nutritionApiService`, `nutritionFirestoreService`
- **Mobile builds:** EAS — bundle ID `com.lab.wake.co`, EAS project `de513d52-b29f-4f9c-a3b3-72da2a39d4f8`
- **PWA manifest:** `apps/pwa/public/manifest.json` — `display: standalone`, dark theme (`#1a1a1a`), lang `es`

### apps/creator-dashboard
- **Vite 7**, React 18.2, React Router v6, `base: /creators`
- **Language:** JavaScript (JSX)
- **Data:** `@tanstack/react-query` v5 for server state; Firestore directly (being migrated to API)
- **DnD:** `@dnd-kit/core` + `@dnd-kit/sortable`
- **Charts:** `recharts` v3
- **Lists:** `react-window` for virtualization

### apps/landing
- **Vite 7**, React 18.2, React Router v6, `base: /`
- **Language:** JavaScript (JSX)
- Reads `app_resources` Firestore collection for hero images/cards

### functions
- **TypeScript**, Node 22, Firebase Functions v1 (`functions.https.onRequest` / `onCall` / `pubsub.schedule`)
- **Single file:** `functions/src/index.ts` — all functions stay here, never split
- Secrets managed via Firebase Secret Manager (not `.env`)

---

## Firebase

- **Project ID:** `wolf-20b8b`
- **Services:** Auth, Firestore, Storage, Hosting, Cloud Functions (us-central1, gen1)
- **No** Realtime Database, Analytics, FCM, or Remote Config
- Firebase config object is copy-pasted into all three apps (`src/config/firebase.js`)
- Firestore rules: `config/firebase/firestore.rules`
- Storage rules: `config/firebase/storage.rules`
- Firebase Auth initialized differently per platform: `browserLocalPersistence` on web, `getReactNativePersistence(AsyncStorage)` on native

---

## Cloud Functions

All in `functions/src/index.ts`. Do not create separate function files. When adding a new function, add it to this table.

| Function | Type | Purpose |
|---|---|---|
| `createPaymentPreference` | HTTPS onRequest | MercadoPago one-time payment preference |
| `createSubscriptionCheckout` | HTTPS onRequest | MercadoPago recurring subscription (PreApproval) |
| `processPaymentWebhook` | HTTPS onRequest | MercadoPago webhook handler (HMAC-SHA256 validated) |
| `updateSubscriptionStatus` | HTTPS onRequest | Cancel/pause/resume MP subscription |
| `lookupUserForCreatorInvite` | HTTPS onCall | Creator looks up user by email for one-on-one enrollment |
| `nutritionFoodSearch` | HTTPS onRequest | FatSecret proxy — food search |
| `nutritionFoodGet` | HTTPS onRequest | FatSecret proxy — food detail by ID |
| `nutritionBarcodeLookup` | HTTPS onRequest | FatSecret proxy — barcode lookup |
| `sendEventConfirmationEmail` | Firestore onCreate | HTML confirmation email with QR on `event_signups/{eventId}/registrations/{regId}` |
| `onUserCreated` | Auth user().onCreate | Bootstraps `users/{userId}` document (`role: "user"`, `created_at`, email, displayName) on Firebase Auth user creation |

**Secrets (Firebase Secret Manager):** `MERCADOPAGO_WEBHOOK_SECRET`, `MERCADOPAGO_ACCESS_TOKEN`, `FATSECRET_CLIENT_ID`, `FATSECRET_CLIENT_SECRET`, `RESEND_API_KEY`

---

## Firestore Key Collections

| Collection | Description |
|---|---|
| `users/{userId}` | User profile, role (`user`/`creator`/`admin`), `courses` map |
| `users/{userId}/subscriptions/{id}` | MercadoPago subscription records |
| `users/{userId}/diary/{id}` | Nutrition diary entries |
| `users/{userId}/sessionHistory/{id}` | Completed workout sessions |
| `users/{userId}/exerciseHistory/{key}` | Per-exercise PR history |
| `users/{userId}/exerciseLastPerformance/{key}` | Last performance per exercise (quick lookup) |
| `users/{userId}/saved_foods/{id}` | User's saved foods |
| `users/{userId}/readiness/{id}` | Daily readiness/wellbeing entries |
| `users/{userId}/bodyLog/{id}` | Body weight/composition log |
| `courses/{courseId}` | Program metadata (`deliveryType: low_ticket \| one_on_one`, `weekly`) |
| `courses/{courseId}/modules/{moduleId}/sessions/{sessionId}/exercises/{exerciseId}/sets/{setId}` | Full program tree |
| `plans/{planId}/modules/…` | Plans used by one-on-one delivery |
| `creator_libraries/{creatorId}/sessions/{sessionId}` | Reusable library sessions |
| `creator_libraries/{creatorId}/modules/{moduleId}` | Reusable library modules |
| `processed_payments/{paymentId}` | Idempotency for webhook processing |
| `creator_nutrition_library/{creatorId}/meals/{id}` | Creator meal library |
| `creator_nutrition_library/{creatorId}/plans/{id}` | Creator nutrition plans |
| `nutrition_assignments/{id}` | Nutrition plan assignments to clients |
| `client_nutrition_plan_content/{assignmentId}` | Per-assignment copy of plan content |
| `one_on_one_clients/{id}` | Creator→client relationships |
| `call_bookings/{id}` | Booking slots |
| `creator_availability/{creatorId}` | Creator time slots for calls |
| `app_resources/{id}` | Public landing/hero assets |
| `events/{eventId}` | Event metadata (title, status, fields, capacity) |
| `event_signups/{eventId}/registrations/{regId}` | Registrations with check-in data |
| `event_signups/{eventId}/waitlist/{waitId}` | Waitlist entries |
| `subscription_cancellation_feedback/{id}` | Feedback on subscription cancellations |
| `api_keys/{keyId}` | Third-party API keys (Phase 3+) |

**`users/{userId}.courses` map entry:**
```json
{
  "courseId": {
    "status": "active",
    "access_duration": "monthly | 3-month | 6-month | yearly",
    "expires_at": "ISO date string",
    "purchased_at": "ISO date string",
    "deliveryType": "low_ticket | one_on_one",
    "title": "...",
    "image_url": "...",
    "is_trial": false,
    "trial_consumed": false
  }
}
```

---

## Integrations

### MercadoPago (Payments)
- Colombia only (COP currency, `.com.co` domain) — server-side only, never from client code
- `external_reference` format: `v1|{userId}|{courseId}|otp` or `v1|{userId}|{courseId}|sub`
- Webhook: return HTTP 500 for retryable errors (MP retries), HTTP 200 for non-retryable (stops retries)
- MercadoPago will be **replaced in the future** — keep payment logic isolated in Cloud Functions

### FatSecret (Nutrition DB)
- PWA and creator-dashboard **never call FatSecret directly** — always through Cloud Functions proxy
- PWA service: `apps/pwa/src/services/nutritionApiService.js`

### Firebase Storage — Signed URL Pattern
All file uploads use this flow — files never pass through a Cloud Function:
1. Client calls API: `POST /{resource}/upload-url`
2. API returns a short-lived signed URL
3. Client uploads directly to Firebase Storage
4. Client calls API: `POST /{resource}/upload-url/confirm` with storage path

Image compression required before upload: profile pictures ≤ 200KB, progress photos ≤ 500KB.

---

## Code Architecture

### Screen Anatomy

Every screen follows this structure (top to bottom):

```
1. Imports
2. Constants / static config (outside component)
3. Component declaration
4. React Query hooks / data fetching
5. Derived state (useMemo)
6. Event handlers (useCallback where reused)
7. Effects (useEffect — keep minimal)
8. Render
```

No data fetching inside `useEffect`. No raw `useState + useEffect` for async data — use React Query.

---

### React Query

All data fetching goes through React Query. No exceptions after migration.

**Custom hooks:**
- Live in `src/hooks/{domain}/` — e.g., `hooks/workout/`, `hooks/nutrition/`, `hooks/creator/`
- Extract to a custom hook when a query is reused across 2+ screens
- Inline `useQuery` inside a screen component is acceptable for single-use queries
- Hook file naming: `useResourceName.js` — e.g., `useUserProfile.js`, `useDailyWorkout.js`

**staleTime — always reference `src/config/queryConfig.js`, never hardcode:**

| Data domain | staleTime | Reason |
|---|---|---|
| Today's workout | 0 | Coach may update program at any time |
| User profile | 5 min | Changes rarely |
| Program structure | 30 min | Stable within a session |
| Nutrition diary | 30 sec | User actively edits throughout the day |
| Exercise history | 15 min | Append-only, historical |
| Session history | 10 min | Append-only |
| Client list (creator) | 2 min | New clients enroll occasionally |
| Body log | 5 min | One entry per day |

**Query key format:** `[domain, resource, ...params]` — e.g., `['workout', 'daily', userId, date]`

**Error handling:** Let React Query manage error state. Show user-facing errors in Spanish. Don't wrap `useQuery` calls in try/catch.

No `onSnapshot` listeners anywhere — all replaced by React Query with background refetch on window focus.

---

### Service Layer

- Components never import Firestore SDK directly — all data operations go through service singletons
- Services live in `src/services/` and follow the singleton pattern: `export default new ServiceClass()`
- During Phase 3 migration: only the *inside* of service functions changes (Firestore → API call). Hooks, query keys, and components stay unchanged.
- New Phase 3 services are thin HTTP wrappers: `return apiClient.get('/v1/resource')`
- `hybridDataService` is a migration target — do not use it in new code

---

### Component Organization

- **New components:** `src/components/{domain}/ComponentName.jsx`
  - Domain examples: `workout/`, `nutrition/`, `creator/`, `events/`, `ui/` (generic reusables)
- **Existing flat components:** leave in place until touched; migrate to domain folder then
- No forced migration — existing screens work, don't reorganize them just to reorganize

---

### Cloud Function Structure (Phase 3 endpoints)

Every new endpoint follows this anatomy:

```ts
// 1. Auth validation
const userId = await validateAuth(req);

// 2. Input validation
const body = validateBody(schema, req.body);

// 3. Domain logic

// 4. Response
res.status(200).json({ data: result });
```

**Shared middleware** (defined once at top of `index.ts`, reused by all endpoints):
- `validateAuth(req)` — validates Firebase ID token or API key, returns `userId`. Throws on failure.
- `validateBody(schema, body)` — validates request body. Throws `VALIDATION_ERROR` on failure.

**Standard error shape:**
```json
{ "error": { "code": "ERROR_CODE", "message": "...", "field": "fieldName" } }
```

**HTTP status codes:**
| Status | Code | Retryable |
|---|---|---|
| 400 | `VALIDATION_ERROR` | No |
| 401 | `UNAUTHENTICATED` | No |
| 403 | `FORBIDDEN` | No |
| 404 | `NOT_FOUND` | No |
| 409 | `CONFLICT` | Yes (backoff) |
| 429 | `RATE_LIMITED` | Yes (after Retry-After) |
| 500 | `INTERNAL_ERROR` | Yes |
| 503 | `SERVICE_UNAVAILABLE` | Yes |

Clients retry on 5xx and 429. Never on 4xx.

---

### Phase 3 API — Locked Decisions

- **Style:** REST, URL versioning (`/api/v1/`)
- **Auth:** Firebase ID token for first-party (PWA + creator dashboard); scoped API keys (`wk_live_…`) for third-party
- **App is just another client:** PWA and creator dashboard call the API exactly like any third-party — no special internal paths
- **No onSnapshot** — React Query refetch on window focus is sufficient for all Wake features
- **Pagination:** cursor-based with opaque `nextPageToken`. Page sizes: diary 30, session history 20, exercise history 50, client list 50
- **Migration order:** Auth → Profile → Nutrition → Progress/Lab → Workout → Creator
- **API key storage:** `api_keys` Firestore collection; SHA-256 hash only, never plaintext; shown once at creation

---

## Code Style & Conventions

### Language rules
- **Functions:** TypeScript — explicit interfaces, `unknown` for error types
- **PWA / Creator Dashboard / Landing:** JavaScript (JSX) — no TypeScript, no type annotations
- **Never add TypeScript to the PWA, creator-dashboard, or landing apps**

### Naming
- Firestore collections: `snake_case`
- JS variables and functions: `camelCase`
- React component files: `PascalCase`
- Service/utility files: `camelCase`
- User-facing strings: **Spanish**

### Component patterns
- Functional components with hooks — no class components
- Service classes are singletons: `export default new ServiceClass()`
- Context API for global state — no Redux, no Zustand
- React Query for all server state

### Logging
- **PWA:** `apps/pwa/src/utils/logger.js` — never raw `console.log`. Debug via `?wake_debug=1` or `localStorage.WAKE_DEBUG=true`
- **Creator Dashboard:** `console.error` for errors only
- **Functions:** `functions.logger` always

### What to avoid
- TypeScript in JS apps
- Redux or Zustand
- New Firestore collections without discussing schema first
- Calling FatSecret or MercadoPago from client-side code
- Editing `hosting/` directly
- Splitting `functions/src/index.ts`
- `onSnapshot` listeners in new code
- `hybridDataService` in new code
- Unnecessary abstractions for one-off operations
- Comments unless the logic is genuinely non-obvious
- Backwards-compatibility shims or unused re-exports

---

## Build & Deploy Commands

```bash
# Build individual apps
npm run build:pwa          # Expo export → hosting/app/
npm run build:creator      # Vite build → hosting/creators/
npm run build:landing      # Vite build → hosting/
npm run build:all          # All three + assemble-hosting

# Dev
npm run pwa:dev            # Expo web dev server with PWA proxy shell

# Hosting
npm run assemble-hosting   # Copies all build outputs into hosting/
npm run serve:hosting      # Local HTTP server for assembled hosting/

# Deploy
firebase deploy                    # Everything
firebase deploy --only functions   # Functions only
firebase deploy --only hosting     # Hosting only

# Functions (must build first)
npm --prefix functions run build   # Compile TypeScript → lib/

# Mobile (EAS)
eas build --profile production --platform ios
eas build --profile production --platform android
```
