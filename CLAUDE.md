# Wake — Claude Code Briefing

## What This Project Is

Wake is a **fitness & nutrition platform** targeting Spanish-speaking users (primarily Colombia). It is a monorepo containing **three web apps + Firebase Cloud Functions**, all served from a single Firebase Hosting deployment.

- **Landing** (`/`) — Marketing landing page
- **PWA** (`/app`) — Consumer app; users track workouts and meals from programs assigned by their coaches
- **Creator Dashboard** (`/creators`) — Web dashboard for coaches/creators to manage clients, programs, libraries, nutrition plans, and bookings

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
  docs/                       ← Design/architecture markdown docs
  hosting/                    ← Assembled build output (gitignored, never edit directly)
  firebase.json
  firestore.indexes.json
  .firebaserc                 ← Firebase project alias: wolf-20b8b
  package.json                ← Root orchestrator (build:all, build:pwa, build:creator, build:landing, etc.)
```

---

## Tech Stack

### apps/pwa
- **Expo SDK ~54**, React Native 0.81.5, React 19
- **Language:** JavaScript (`.js`, `.web.js`, `.web.jsx`) — NOT TypeScript
- **Navigation:** React Navigation v7 (native); React Router v6 with `BrowserRouter` at basename `/app` (web)
- **Platform files:** Metro resolves `.web.js` over `.js` on web — many screens have both versions
- **Auth:** Firebase Auth (email/password, Google Sign-In, Apple Sign-In)
- **State:** Context API (`AuthContext`, `UserRoleContext`, `VideoContext`), no Redux
- **Data:** Firebase Firestore + AsyncStorage offline cache for downloaded programs
- **Key services (singletons):** `FirestoreService`, `PurchaseService`, `AuthService`, `courseDownloadService`, `hybridDataService`, `libraryResolutionService`, `nutritionApiService`, `nutritionFirestoreService`
- **Mobile builds:** EAS — bundle ID `com.lab.wake.co`, EAS project `de513d52-b29f-4f9c-a3b3-72da2a39d4f8`
- **PWA manifest:** `apps/pwa/public/manifest.json` — `display: standalone`, dark theme (`#1a1a1a`), lang `es`
- **Service worker:** `apps/pwa/public/sw.js` — minimal (skipWaiting + clients.claim, no caching strategy)

### apps/creator-dashboard
- **Vite 7**, React 18.2, React Router v6, `base: /creators`
- **Language:** JavaScript (JSX)
- **Data:** `@tanstack/react-query` v5 for server state; Firestore directly
- **DnD:** `@dnd-kit/core` + `@dnd-kit/sortable` for drag-and-drop content editing
- **Charts:** `recharts` v3
- **Lists:** `react-window` for virtualization

### apps/landing
- **Vite 7**, React 18.2, React Router v6, `base: /`
- **Language:** JavaScript (JSX)
- Reads `app_resources` Firestore collection for hero images/cards

### functions
- **TypeScript**, Node 22, Firebase Functions v1 (`functions.https.onRequest` / `onCall` / `pubsub.schedule`)
- **Single file:** `functions/src/index.ts` (~2483 lines)
- Secrets managed via Firebase Secret Manager (not `.env`)

---

## Firebase

- **Project ID:** `wolf-20b8b`
- **Services in use:** Auth, Firestore, Storage, Hosting (single target, multi-app), Cloud Functions (us-central1, gen1)
- **No Realtime Database, Analytics, FCM, or Remote Config**
- Firebase config object is copy-pasted into all three apps (`src/config/firebase.js`)
- Firestore rules: `config/firebase/firestore.rules`
- Storage rules: `config/firebase/storage.rules`

---

## Cloud Functions

All in `functions/src/index.ts`. Do not create separate function files — keep everything in this single file unless explicitly told otherwise.

| Function | Type | Purpose |
|---|---|---|
| `createPaymentPreference` | HTTPS onRequest | MercadoPago one-time payment preference |
| `createSubscriptionCheckout` | HTTPS onRequest | MercadoPago recurring subscription (PreApproval) |
| `processPaymentWebhook` | HTTPS onRequest | MercadoPago webhook handler (HMAC-SHA256 validated) |
| `updateSubscriptionStatus` | HTTPS onRequest | Cancel/pause/resume MP subscription |
| `markStaleCheckoutIntents` | Pub/Sub scheduled (every 3h) | Marks abandoned checkout intents |
| `verifyToken` | HTTPS onRequest | Firebase ID token → custom token (cross-platform login) |
| `lookupUserForCreatorInvite` | HTTPS onCall | Creator looks up user by email for one-on-one enrollment |
| `nutritionFoodSearch` | HTTPS onRequest | FatSecret proxy — food search |
| `nutritionFoodGet` | HTTPS onRequest | FatSecret proxy — food detail by ID |
| `nutritionBarcodeLookup` | HTTPS onRequest | FatSecret proxy — barcode lookup |

**Secrets (Firebase Secret Manager):** `MERCADOPAGO_WEBHOOK_SECRET`, `MERCADOPAGO_ACCESS_TOKEN`, `FATSECRET_CLIENT_ID`, `FATSECRET_CLIENT_SECRET`

---

## Firestore Key Collections

| Collection | Description |
|---|---|
| `users/{userId}` | User profile, role (`user`/`creator`/`admin`), `courses` map (inline access data) |
| `users/{userId}/subscriptions/{id}` | MercadoPago subscription records |
| `users/{userId}/diary/{id}` | Nutrition diary entries |
| `users/{userId}/sessionHistory/{id}` | Completed workout sessions |
| `users/{userId}/exerciseHistory/{key}` | Per-exercise PR history |
| `courses/{courseId}` | Program metadata (`deliveryType: low_ticket | one_on_one`, `access_duration`, `weekly`) |
| `courses/{courseId}/modules/{moduleId}/sessions/{sessionId}/exercises/{exerciseId}/sets/{setId}` | Full program tree |
| `plans/{planId}/modules/…` | Plans used by one-on-one delivery |
| `checkout_intents/{externalRef}` | Payment funnel tracking |
| `processed_payments/{paymentId}` | Idempotency for webhook processing |
| `creator_nutrition_library/{creatorId}/meals/{id}` | Creator meal library |
| `creator_nutrition_library/{creatorId}/plans/{id}` | Creator nutrition plans |
| `nutrition_assignments/{id}` | Nutrition plan assignments to clients |
| `one_on_one_clients/{id}` | Creator→client relationships |
| `call_bookings/{id}` | Booking slots |
| `app_resources/{id}` | Public landing/hero assets |

**`users/{userId}.courses` map structure (inline on user doc):**
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
- Colombia only (COP currency, `.com.co` domain)
- Library: `mercadopago` ^2.10.0 (server-side only, in functions)
- `external_reference` format: `v1|{userId}|{courseId}|otp` or `v1|{userId}|{courseId}|sub`
- Webhook signature validation: supports both legacy (`x-hmac-signature`) and new (`x-signature` with `ts=…,v1=…`) formats
- Payment is being **replaced in the future** — keep payment logic isolated in Cloud Functions

### FatSecret (Nutrition DB)
- PWA and creator-dashboard **never call FatSecret directly** — always go through Cloud Functions proxy
- OAuth 2.0 client_credentials, token cached in function memory
- Scopes: `premier` (search), `basic` (food get), `basic barcode` (barcode)
- Default locale: region `ES`, lang `es`
- PWA service: `apps/pwa/src/services/nutritionApiService.js`

---

## Data Delivery Patterns

- **`low_ticket` programs:** Full program downloaded to AsyncStorage via `courseDownloadService`. `hybridDataService` merges cached + live data.
- **`one_on_one` programs:** Fetched per-session from Firestore (short TTL cache).
- **`weekly: true` programs:** Modules have `week` field matching ISO week strings (e.g., `2025-W03`).
- **Library resolution:** Program docs can contain `libraryModuleRef`/`librarySessionRef` pointers resolved at load time by `libraryResolutionService`.
- **Nutrition copy-first pattern:** `client_nutrition_plan_content/{assignmentId}` stores a copy of plan content; falls back to creator library if copy doesn't exist.

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

---

## Code Style & Conventions

### Language rules
- **Functions:** TypeScript — use explicit interfaces, `unknown` for error types
- **PWA / Creator Dashboard / Landing:** JavaScript (JSX) — no TypeScript, no type annotations
- **Never add TypeScript to the PWA, creator-dashboard, or landing apps**

### Naming
- Firestore collections: `snake_case`
- JS variables and functions: `camelCase`
- React component files: `PascalCase`
- Service/utility files: `camelCase`
- User-facing strings: **Spanish** (the app is Spanish-language)

### Component patterns
- Functional React components with hooks throughout — no class components in UI
- Service classes (e.g., `FirestoreService`) are used as singletons and exported as `export default new ServiceClass()`
- Context API for global state — no Redux, no Zustand
- React Query (`@tanstack/react-query`) in creator-dashboard only

### File organization
- PWA platform splits: use `Component.web.js` / `Component.web.jsx` for web-specific versions alongside native `Component.js`
- Do not create new shared packages or workspaces — the monorepo does not use npm/yarn workspaces
- The `hosting/` directory is a build artifact — **never edit files there directly**
- Cloud Functions: **all functions stay in `functions/src/index.ts`** — do not split into multiple files

### Error handling (Cloud Functions)
- Return HTTP 500 for retryable errors (so MercadoPago retries the webhook)
- Return HTTP 200 for non-retryable errors (to stop MercadoPago from retrying)
- Use `functions.logger` for logging in functions

### Logging (PWA)
- Use `apps/pwa/src/utils/logger.js` — supports `debug`/`log`/`warn`/`error`/`prod` levels
- Debug mode enabled via `?wake_debug=1` query param or `localStorage.WAKE_DEBUG=true`
- No raw `console.log` in PWA code — use the logger

### What to avoid
- Do not add TypeScript to JS apps
- Do not install Redux or Zustand
- Do not create new Firestore collections without discussing schema first
- Do not call FatSecret or MercadoPago APIs directly from client-side code
- Do not edit `hosting/` directly — it is assembled from builds
- Do not split `functions/src/index.ts` into multiple files
- Do not add unnecessary abstractions or utility helpers for one-off operations
- Do not add comments unless the logic is genuinely non-obvious
- Do not over-engineer — keep solutions minimal and direct

---

## Important Context

- The app is targeted at **Colombian and Latin American** fitness coaches and their clients
- **MercadoPago will be replaced** in the future — keep payment logic isolated
- The PWA runs as both a web app and an installable standalone app — test both contexts when making PWA changes
- Firebase Auth is initialized differently per platform: `browserLocalPersistence` on web, `getReactNativePersistence(AsyncStorage)` on native
- The PWA requests `navigator.storage.persist()` before Firebase auth initializes
- Mobile-only features (EAS In-App Purchases, camera) are separate from web/PWA features
- When adding a new Cloud Function, add the function to the table in this file
