# Wake — Phase 3 Engineering Spec

This is the implementation guide for the Phase 3 API migration. It is the single document
you read before writing any Phase 3 code. All architectural decisions are locked in the
strategy docs — this spec translates those decisions into concrete implementation steps.

**Related docs (read these first if you haven't):**
- `API_STRATEGY_PRE_INVESTIGATION.md` — locked decisions, migration order, domain cutover rules
- `API_ENDPOINTS.md` — complete endpoint reference (method, path, request, response, errors)
- `API_CLIENT_SPEC.md` — `apiClient.js` implementation contract
- `MIGRATION_ROLLOUT.md` — per-domain cutover procedure and staging validation checklists
- `OFFLINE_ARCHITECTURE.md` — offline write queue and Background Sync spec
- `COST_MODEL.md` — cost profile and optimization priorities
- `THIRD_PARTY_API_SPEC.md` — third-party developer authentication and scopes

---

## 0. Gen1 vs Gen2 Cloud Functions — Decision

**Context:** All existing Cloud Functions in `functions/src/index.ts` are Gen1
(`import * as functions from 'firebase-functions'`). The new Express API function
could be either Gen1 or Gen2.

### Gen1

**Pros:**
- Zero new patterns — consistent with the entire existing codebase
- No migration risk; same import paths, same secret handling

**Cons:**
- Max **1 concurrent request per instance**. The Express app handles every API route,
  so every simultaneous user request either hits a warm instance or spins up a cold one.
  Cold start for an Express app with Admin SDK: ~1–3 seconds.
- During gym peak hours (7–9am, 6–8pm Colombia), hundreds of concurrent requests
  means hundreds of cold starts. This latency is visible mid-workout.
- `minInstances` is available but less effective on Gen1 due to the concurrency model.

### Gen2

**Pros:**
- Up to **1000 concurrent requests per instance** — a single warm instance serves
  all concurrent users. No cold-start fan-out at peak hours.
- `minInstances: 1` keeps one instance always warm, eliminating cold starts entirely.
  Cost: ~$2–3/month at 128MB, 1 idle instance.
- Built on Cloud Run — more stable under sustained load.
- Can coexist in the same `index.ts` as Gen1 functions with no migration needed.

**Cons:**
- Different import: `import { onRequest, defineSecret } from 'firebase-functions/v2/https'`
- Secrets declared differently (see §1.3 below)
- Adds a second import style to `index.ts`

### Decision: Gen2 for the `api` function only

The Express API function is the most latency-sensitive function in the codebase.
`minInstances: 1` costs ~$2–3/month and eliminates cold starts for all user-facing
API calls. All existing Gen1 functions stay Gen1 — no changes to them.

---

## 1. One-Time Infrastructure Setup

Do all of this before writing any domain-specific endpoint code. This is the
foundation. Steps are ordered — do not skip or reorder.

---

### 1.1 Staging Project (`wake-staging`)

The `wake-staging` Firebase project does not exist yet. Create it before anything else.

**In the Firebase Console (`console.firebase.google.com`):**
1. Create project, ID: `wake-staging`
2. Enable: Firestore (Native mode, us-central1), Auth (Email/Password + Google + Apple),
   Firebase Storage, Cloud Functions

**Update `.firebaserc`:**
```json
{
  "projects": {
    "default": "wolf-20b8b",
    "production": "wolf-20b8b",
    "staging": "wake-staging"
  }
}
```

**Deploy rules to staging:**
```bash
firebase use staging
firebase deploy --only firestore:rules,firestore:indexes,storage
```

**Add secrets to `wake-staging` Secret Manager:**
```bash
firebase use staging
firebase functions:secrets:set FATSECRET_CLIENT_ID         # same as prod
firebase functions:secrets:set FATSECRET_CLIENT_SECRET     # same as prod
firebase functions:secrets:set RESEND_API_KEY              # same as prod (or test key)
firebase functions:secrets:set MERCADOPAGO_ACCESS_TOKEN    # MP sandbox: TEST-...
firebase functions:secrets:set MERCADOPAGO_WEBHOOK_SECRET  # MP sandbox webhook secret
```

**Seed staging data (manual, ~30 min one-time):**
1. Sign up as a creator in the staging app
2. Create one course: 2 modules × 3 sessions × 5 exercises × 3 sets each
3. Sign up as a user; have the creator enroll them
4. As the user: log 5 diary entries, complete 3 sessions, log 3 body weights, log 2 readiness entries
5. Verify the creator dashboard shows the user's data

---

### 1.2 `firebase.json` — API Rewrite

The `/api/**` rewrite must be added **before** the catch-all `**` rule.
Firebase evaluates rewrites top-to-bottom and stops at the first match.

In `firebase.json`, update the `hosting.rewrites` array:

```json
"rewrites": [
  { "source": "/api/**", "function": "api", "region": "us-central1" },
  { "source": "/app",     "destination": "/app/index.html" },
  { "source": "/app/**",  "destination": "/app/index.html" },
  { "source": "/creators",   "destination": "/creators/index.html" },
  { "source": "/creators/**","destination": "/creators/index.html" },
  { "source": "/landing",    "destination": "/index.html" },
  { "source": "/landing/**", "destination": "/index.html" },
  { "source": "**",          "destination": "/index.html" }
]
```

Also add the Functions emulator to `firebase.json` for local API development:
```json
"emulators": {
  "functions": { "port": 5001 },
  "firestore": { "port": 8080 },
  "auth": { "port": 9099 },
  "ui": { "enabled": false }
}
```

---

### 1.3 Express App in `functions/src/index.ts`

Install Express in the functions package:
```bash
npm --prefix functions install express
npm --prefix functions install --save-dev @types/express
```

Add to the **top** of `functions/src/index.ts` (below existing imports, before existing function exports):

```typescript
// ─── Gen2 API Function ─────────────────────────────────────────────────────

import { onRequest, defineSecret } from "firebase-functions/v2/https";
import express from "express";

// Re-declare secrets using v2 defineSecret for use in the Gen2 function
const fatSecretClientIdV2 = defineSecret("FATSECRET_CLIENT_ID");
const fatSecretClientSecretV2 = defineSecret("FATSECRET_CLIENT_SECRET");
// Add other secrets here as each domain needs them

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// CORS — allow same-origin requests and any wk_live_ API key caller
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", req.headers.origin || "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,PUT,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Authorization,Content-Type,X-Wake-Client,X-Firebase-AppCheck");
  if (req.method === "OPTIONS") return res.status(204).end();
  next();
});

// ─── Shared Middleware ──────────────────────────────────────────────────────

interface AuthResult {
  userId: string;
  role: "user" | "creator" | "admin";
  authType: "firebase" | "apikey";
}

async function validateAuth(req: express.Request): Promise<AuthResult> {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    throw apiError("UNAUTHENTICATED", "Missing Authorization header", 401);
  }
  const token = header.slice(7);

  if (token.startsWith("wk_live_") || token.startsWith("wk_test_")) {
    // API key path
    const hash = crypto.createHash("sha256").update(token).digest("hex");
    const snap = await db.collection("api_keys")
      .where("key_hash", "==", hash)
      .where("revoked", "==", false)
      .limit(1)
      .get();
    if (snap.empty) throw apiError("UNAUTHENTICATED", "Invalid or revoked API key", 401);
    const key = snap.docs[0].data();
    // Update last_used_at (fire-and-forget)
    snap.docs[0].ref.update({ last_used_at: admin.firestore.FieldValue.serverTimestamp() });
    // Rate limit check (see §1.4)
    await checkRateLimit(snap.docs[0].id, key.rate_limit_rpm ?? 60);
    const userDoc = await db.collection("users").doc(key.owner_id).get();
    return { userId: key.owner_id, role: userDoc.data()?.role ?? "user", authType: "apikey" };
  }

  // Firebase ID token path
  // App Check validation — required for all first-party requests (§1.14 of strategy doc)
  const appCheckToken = req.headers["x-firebase-appcheck"] as string | undefined;
  if (!appCheckToken) {
    throw apiError("APP_CHECK_FAILED", "Missing App Check token", 401);
  }
  try {
    await admin.appCheck().verifyToken(appCheckToken);
  } catch {
    throw apiError("APP_CHECK_FAILED", "Invalid App Check token", 401);
  }

  try {
    const decoded = await admin.auth().verifyIdToken(token);
    const userDoc = await db.collection("users").doc(decoded.uid).get();
    // First-party rate limit: 200 req/min per user (§1.15 of strategy doc)
    await checkRateLimit(`user_${decoded.uid}`, 200, "rate_limit_first_party");
    return { userId: decoded.uid, role: userDoc.data()?.role ?? "user", authType: "firebase" };
  } catch (err) {
    if (err instanceof WakeApiServerError) throw err;
    throw apiError("UNAUTHENTICATED", "Invalid or expired token", 401);
  }
}

function validateBody<T>(schema: Record<string, "string" | "number" | "boolean" | "array" | "object" | "optional_string" | "optional_number" | "optional_boolean">, body: unknown): T {
  if (typeof body !== "object" || body === null) {
    throw apiError("VALIDATION_ERROR", "Request body must be a JSON object", 400);
  }
  const b = body as Record<string, unknown>;
  for (const [field, type] of Object.entries(schema)) {
    const optional = type.startsWith("optional_");
    const baseType = optional ? type.replace("optional_", "") : type;
    if (optional && (b[field] === undefined || b[field] === null)) continue;
    if (b[field] === undefined) {
      throw apiError("VALIDATION_ERROR", `Missing required field '${field}'`, 400, field);
    }
    if (baseType === "array" && !Array.isArray(b[field])) {
      throw apiError("VALIDATION_ERROR", `Field '${field}' must be an array`, 400, field);
    } else if (baseType !== "array" && typeof b[field] !== baseType) {
      throw apiError("VALIDATION_ERROR", `Field '${field}' must be a ${baseType}`, 400, field);
    }
  }
  return b as T;
}

// ─── Rate Limiting ─────────────────────────────────────────────────────────
// Firestore transaction-based fixed-window counter. Atomic: read + write in one
// transaction prevents race conditions across concurrent function instances.
// Two collections:
//   rate_limit_windows/         — third-party API keys (60 req/min)
//   rate_limit_first_party/     — first-party users by userId (200 req/min)

async function checkRateLimit(
  id: string,
  limitRpm: number,
  collection: "rate_limit_windows" | "rate_limit_first_party" = "rate_limit_windows"
): Promise<void> {
  const windowMinute = Math.floor(Date.now() / 60000);
  const docId = `${id}_${windowMinute}`;
  const ref = db.collection(collection).doc(docId);
  const secondsUntilReset = 60 - (Date.now() / 1000 % 60);
  await db.runTransaction(async (tx) => {
    const doc = await tx.get(ref);
    const count = doc.exists ? (doc.data()?.count ?? 0) : 0;
    if (count >= limitRpm) {
      const err = apiError("RATE_LIMITED", "Rate limit exceeded", 429);
      (err as any).retryAfter = Math.ceil(secondsUntilReset);
      throw err;
    }
    tx.set(ref, { count: count + 1, expires_at: windowMinute + 2 }, { merge: true });
  });
}

// ─── Error Helpers ─────────────────────────────────────────────────────────

class WakeApiServerError extends Error {
  status: number;
  code: string;
  field?: string;
  constructor(code: string, message: string, status: number, field?: string) {
    super(message);
    this.code = code;
    this.status = status;
    this.field = field;
  }
}

function apiError(code: string, message: string, status: number, field?: string): WakeApiServerError {
  return new WakeApiServerError(code, message, status, field);
}

// Global error handler — must be last middleware registered
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (err instanceof WakeApiServerError) {
    const body: Record<string, unknown> = { error: { code: err.code, message: err.message } };
    if (err.field) (body.error as Record<string, unknown>).field = err.field;
    if (err.status === 429 && (err as any).retryAfter) {
      res.setHeader("Retry-After", String((err as any).retryAfter));
    }
    return res.status(err.status).json(body);
  }
  functions.logger.error("Unhandled API error", err);
  return res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Unexpected server error" } });
});

// ─── Export ────────────────────────────────────────────────────────────────

export const api = onRequest(
  {
    region: "us-central1",
    memory: "256MiB",
    timeoutSeconds: 60,
    minInstances: 1,        // keeps one instance warm — eliminates cold starts (~$2-3/month)
    concurrency: 80,        // max concurrent requests per instance (safe default for Firestore Admin SDK)
    secrets: [
      "FATSECRET_CLIENT_ID",
      "FATSECRET_CLIENT_SECRET",
      // Add secrets here as new domains are implemented
    ],
  },
  app
);
```

**Note on `concurrency: 80`:** The Firestore Admin SDK holds a connection pool. Setting
concurrency above ~100 can exhaust the pool. 80 is a conservative safe value. Increase
only if profiling shows it's a bottleneck.

---

### 1.4 `apiClient.js` — Both Apps

Create these two files. The spec in `API_CLIENT_SPEC.md` is complete — implement it exactly.
Key points:

**`apps/pwa/src/utils/apiClient.js`** and **`apps/creator-dashboard/src/utils/apiClient.js`**

Both files are identical except for the Firebase Auth import path and the `#clientId` value.

```js
// PWA: import { getAuth } from '../config/firebase';
// Creator Dashboard: import { auth } from '../config/firebase';
// Adjust the import to match each app's existing firebase setup.

import { auth } from '../config/firebase'; // adjust path per app

const BASE_URL = '/api/v1';
const REFRESH_MARGIN_MS = 5 * 60 * 1000; // 5 minutes

export class WakeApiError extends Error {
  constructor(code, message, status, field = null) {
    super(message);
    this.code = code;
    this.status = status;
    this.field = field;
    this.name = 'WakeApiError';
  }
}

class ApiClient {
  #tokenCache = null;  // { value: string, expiresAt: number } | null
  #clientId = 'pwa/1.0'; // or 'creator-dashboard/1.0'
  #mode = 'firebase';
  #apiKey = null;

  constructor(options = {}) {
    if (options.mode) this.#mode = options.mode;
    if (options.apiKey) this.#apiKey = options.apiKey;
    if (options.clientId) this.#clientId = options.clientId;
  }

  async #getToken() {
    if (this.#mode === 'apikey') return this.#apiKey;
    const user = auth.currentUser;
    if (!user) throw new WakeApiError('UNAUTHENTICATED', 'No authenticated user', 401);
    const now = Date.now();
    if (this.#tokenCache && now < this.#tokenCache.expiresAt - REFRESH_MARGIN_MS) {
      return this.#tokenCache.value;
    }
    const token = await user.getIdToken(false);
    this.#tokenCache = { value: token, expiresAt: now + 3600 * 1000 };
    return token;
  }

  async #request(method, path, body, options = {}) {
    const { includeAuth = true, timeout = 15000, signal, params } = options;

    // Offline check for reads
    if (!navigator.onLine && method === 'GET') {
      throw new WakeApiError('NETWORK_ERROR', 'No network connection', 0);
    }

    let url = `${BASE_URL}${path}`;
    if (params) {
      const qs = new URLSearchParams(
        Object.fromEntries(Object.entries(params).filter(([, v]) => v != null))
      ).toString();
      if (qs) url += `?${qs}`;
    }

    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'X-Wake-Client': this.#clientId,
    };

    if (includeAuth) {
      headers['Authorization'] = `Bearer ${await this.#getToken()}`;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    const mergedSignal = signal
      ? AbortSignal.any([controller.signal, signal])
      : controller.signal;

    try {
      const res = await fetch(url, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: mergedSignal,
      });

      clearTimeout(timeoutId);

      if (res.ok) {
        if (res.status === 204) return null;
        return await res.json();
      }

      // 401 recovery — force token refresh and retry once
      if (res.status === 401 && includeAuth && this.#mode === 'firebase') {
        this.#tokenCache = null;
        const user = auth.currentUser;
        if (user) {
          const fresh = await user.getIdToken(true);
          this.#tokenCache = { value: fresh, expiresAt: Date.now() + 3600 * 1000 };
          headers['Authorization'] = `Bearer ${fresh}`;
          const retry = await fetch(url, {
            method,
            headers,
            body: body !== undefined ? JSON.stringify(body) : undefined,
          });
          if (retry.ok) return retry.status === 204 ? null : await retry.json();
          const retryErr = await retry.json().catch(() => null);
          throw new WakeApiError(
            retryErr?.error?.code ?? 'UNAUTHENTICATED',
            retryErr?.error?.message ?? 'Unauthorized',
            retry.status,
            retryErr?.error?.field ?? null
          );
        }
        throw new WakeApiError('UNAUTHENTICATED', 'Session expired', 401);
      }

      let errBody = null;
      try { errBody = await res.json(); } catch { /* non-JSON */ }
      throw new WakeApiError(
        errBody?.error?.code ?? 'INTERNAL_ERROR',
        errBody?.error?.message ?? 'Unknown error',
        res.status,
        errBody?.error?.field ?? null
      );
    } catch (err) {
      clearTimeout(timeoutId);
      if (err instanceof WakeApiError) throw err;
      if (err.name === 'AbortError') {
        throw new WakeApiError('REQUEST_TIMEOUT', 'Request timed out', 0);
      }
      throw new WakeApiError('NETWORK_ERROR', 'Network request failed', 0);
    }
  }

  async #withRetry(fn, isIdempotent) {
    const delays = [0, 150, 300];
    let lastErr;
    for (let i = 0; i < delays.length; i++) {
      if (i > 0) {
        if (!isIdempotent) throw lastErr; // never retry non-idempotent without explicit opt-in
        await new Promise(r => setTimeout(r, delays[i]));
      }
      try {
        return await fn();
      } catch (err) {
        if (!(err instanceof WakeApiError)) throw err;
        if (err.status === 429) {
          // Rate limited — honor Retry-After if present (handled by caller)
          throw err;
        }
        if (err.status >= 500 || err.status === 0) {
          lastErr = err;
          continue;
        }
        throw err; // 4xx are not retried
      }
    }
    throw lastErr;
  }

  async get(path, options)              { return this.#withRetry(() => this.#request('GET', path, undefined, options), true); }
  async post(path, body, options = {})  { return this.#withRetry(() => this.#request('POST', path, body, options), options.idempotent ?? false); }
  async patch(path, body, options)      { return this.#withRetry(() => this.#request('PATCH', path, body, options), true); }
  async put(path, body, options)        { return this.#withRetry(() => this.#request('PUT', path, body, options), true); }
  async delete(path, options)           { return this.#withRetry(() => this.#request('DELETE', path, undefined, options), true); }
}

export const apiClient = new ApiClient({ clientId: 'pwa/1.0' }); // change per app
export default apiClient;
```

**`AbortSignal.any` compatibility note:** Available in all modern browsers (Chrome 116+,
Firefox 124+, Safari 17.4+). This is fine for the PWA's target audience. No polyfill needed.

---

### 1.5 Vite Proxy (Creator Dashboard Dev)

Add the proxy to `apps/creator-dashboard/vite.config.js`:

```js
server: {
  port: 3000,
  host: true,
  open: false,
  proxy: {
    '/api': {
      target: 'http://127.0.0.1:5001/wolf-20b8b/us-central1/api',
      changeOrigin: true,
      rewrite: (path) => path.replace(/^\/api/, ''),
    },
  },
},
```

**PWA dev proxy:** The PWA uses Expo's web dev server (`pwa:dev`). The Expo web
server supports a proxy via `app.config.js` or a custom dev server plugin. Add:

```js
// apps/pwa/app.config.js — add or update:
web: {
  devServer: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:5001/wolf-20b8b/us-central1/api',
        changeOrigin: true,
        pathRewrite: { '^/api': '' },
      },
    },
  },
},
```

For local development, start the Functions emulator alongside the dev server:
```bash
# Terminal 1
firebase emulators:start --only functions,firestore,auth

# Terminal 2
npm run pwa:dev          # or creator dashboard dev server
```

---

### 1.6 QueryClient Global Error Handler

Wire the `UNAUTHENTICATED` → sign-out handler once at app startup, not per-query.
This belongs in the file where `QueryClient` is instantiated (find it in each app).

```js
import { WakeApiError } from '../utils/apiClient';
import { signOut } from '../services/authService'; // adjust import

const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error) => {
      if (error instanceof WakeApiError && error.code === 'UNAUTHENTICATED') {
        signOut(); // clears auth state, redirects to login
      }
    },
  }),
  defaultOptions: {
    queries: { retry: false }, // apiClient handles retries; don't double-retry
    mutations: { retry: false },
  },
});
```

---

### 1.7 OpenAPI Spec Setup

Per `API_STRATEGY_PRE_INVESTIGATION.md §5.5`, the spec is hand-written first and
served at `/api/docs` from day one.

Install in functions:
```bash
npm --prefix functions install swagger-ui-express swagger-jsdoc
npm --prefix functions install --save-dev @types/swagger-ui-express @types/swagger-jsdoc
```

Create `functions/src/openapi.ts` — the base spec object. As endpoints are built,
add `swagger-jsdoc` JSDoc comments above each route handler. The spec is served by:

```typescript
// In the Express app, before domain routes:
import swaggerUi from 'swagger-ui-express';
import { generateOpenApiSpec } from './openapi';

app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(generateOpenApiSpec()));
```

The spec lives at `https://wakelab.co/api/docs` in production and `http://localhost:5001/.../api/docs` locally.

---

### 1.8 Firebase App Check Setup

Per `API_STRATEGY_PRE_INVESTIGATION.md §1.14`. Do this before any domain goes to production.

**Firebase Console:**
1. Go to `console.firebase.google.com` → project `wolf-20b8b` → App Check
2. Register each app:
   - PWA (web) → provider: **reCAPTCHA Enterprise**. Create a reCAPTCHA Enterprise site key for `wakelab.co`.
   - Creator Dashboard (web) → same provider, same or separate site key.
3. Enable enforcement for **Cloud Functions** in the App Check console. This is what
   makes the server-side `verifyToken()` call valid.

**Install the App Check SDK in each app:**
```bash
# PWA
npm --prefix apps/pwa install firebase   # already installed; ensure v10+

# Creator Dashboard
npm --prefix apps/creator-dashboard install firebase   # already installed
```

**Initialize App Check in each app's Firebase config (`src/config/firebase.js`):**
```js
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check';

// Must be called immediately after initializeApp(), before any other Firebase service
initializeAppCheck(app, {
  provider: new ReCaptchaEnterpriseProvider('<SITE_KEY>'),
  isTokenAutoRefreshEnabled: true,  // SDK refreshes the token automatically
});
```

The App Check SDK automatically attaches the token to calls to Firebase services.
For the API, the `apiClient.js` must read and forward it manually (see `API_CLIENT_SPEC.md §3.2`).

**Staging (`wake-staging`):**
Register both apps in `wake-staging` App Check as well, using a separate reCAPTCHA
Enterprise site key for the staging domain. Add the staging domain to the allowlist
in the Google Cloud Console for that site key.

**Local dev / emulator:**
In local development, App Check enforcement is bypassed automatically when the
Functions emulator is running — no token is required. This is Firebase's default
emulator behavior and requires no configuration.

---

## 2. React Query Pre-Work — Migration Gaps

**27 screens** have not yet been migrated to React Query. Per the strategy (§1.10 of
`API_STRATEGY_PRE_INVESTIGATION.md`), each screen's data fetching must be on React Query
before that domain's service internals can be swapped to call the API.

The list below is organized by which migration domain each screen blocks.
Complete the React Query migration for a domain's screens **before** starting that
domain's service cutover.

### Screens Blocking Domain 2 (Profile)

| Screen | File | What it fetches |
|---|---|---|
| ProfileScreen (web) | `apps/pwa/src/screens/ProfileScreen.web.js` | User profile — still useState+useEffect |

**Note:** `ProfileScreen.js` (native) is already migrated.

### Screens Blocking Domain 3 (Nutrition)

| Screen | File | What it fetches |
|---|---|---|
| NutritionScreen (native) | `apps/pwa/src/screens/NutritionScreen.js` | Nutrition assignments, diary, food data |

**Note:** `NutritionScreen.web.jsx` already uses React Query.

### Screens Blocking Domain 4 (Progress / Lab)

| Screen | File | What it fetches |
|---|---|---|
| LabScreen (native) | `apps/pwa/src/screens/LabScreen.js` | Body metrics |
| WeeklyVolumeHistoryScreen | `...WeeklyVolumeHistoryScreen.js` + `.web.js` | Weekly muscle volume — reads `firestoreService` directly |
| WorkoutCompletionScreen | `...WorkoutCompletionScreen.js` + `.web.js` | Muscle volume data, completion analytics |

### Screens Blocking Domain 5 (Workout)

| Screen | File | What it fetches | Priority |
|---|---|---|---|
| MainScreen (web) | `apps/pwa/src/screens/MainScreen.web.js` | Uses `consolidatedDataService` — most critical | **Critical** |
| DailyWorkoutScreen (native) | `...DailyWorkoutScreen.js` | Daily workout data | High |
| WorkoutExecutionScreen | `...WorkoutExecutionScreen.js` + `.web.jsx` | Session service, course data | High |
| SessionsScreen (web) | `apps/pwa/src/screens/SessionsScreen.web.js` | Session history list | High |

**`MainScreen.web.js` and `consolidatedDataService`:**
`consolidatedDataService` orchestrates `purchaseService` + `hybridDataService` +
`courseDownloadService` into one cached call. When MainScreen is migrated:

1. Replace the `consolidatedDataService` call with two parallel React Query hooks:
   - `useQuery(['courses', 'purchased', userId])` → `purchaseService.getUserPurchasedCourses()`
   - `useQuery(['courses', 'list'])` → (this call disappears after Domain 5; course detail
     comes from the API)
2. Once MainScreen no longer calls `consolidatedDataService`, check if any other screen
   still imports it. If not, delete it.

### Screens That Can Be Deferred (Low Priority)

These screens either have minimal data fetching, use route params only, or deal with
static data. They do not block any domain migration and can be migrated later:

- `CommunityScreen.js` — tutorials only (static JSON)
- `PRDetailScreen.js` / `.web.js` — mostly static display, no Firestore calls
- `SessionDetailScreen.js` / `.web.js` — data passed via route params
- `WarmupScreen.js` / `.web.js` — static JSON data

### Remaining Web Variants of Already-Migrated Native Screens

These are `.web.js` counterparts of screens already on React Query. They follow the
exact same pattern as their `.js` sibling — copy the hook structure, adjust any
web-specific UI differences:

- `AllPurchasedCoursesScreen.web.js`
- `CreatorProfileScreen.web.js`
- `PRsScreen.web.js`
- `ProfileScreen.web.js` (already listed above)
- `ProgramLibraryScreen.web.js`
- `SubscriptionsScreen.web.js`
- `UpcomingCallDetailScreen.web.js`

---

## 3. Domain 1 — Auth + Infrastructure

**React Query pre-work:** None — auth screens don't use React Query.

**Purpose of this domain:**
- Prove the stack works end-to-end (Express → Firestore Admin SDK → response)
- Give third-party developers a working auth mechanism from day one
- Establish the API key system that all Creator domain endpoints depend on

**Note on auth endpoints:** `/auth/login`, `/auth/signup`, `/auth/logout` are intentionally
implemented even though the PWA and creator dashboard use Firebase Auth SDK directly.
These routes serve third-party developers who need programmatic authentication without
the Firebase client SDK — AI agents, wearable integrations, external tools. For first-party
apps, these endpoints are never called.

---

### Endpoints to Implement

All from `API_ENDPOINTS.md §2`. Implement in this order:

**Infrastructure / health:**
```
GET /api/v1/health           → { status: "ok", timestamp: ISO }   (no auth, used for uptime checks)
```

**Auth (third-party path):**
```
POST /api/v1/auth/signup     → creates Firebase Auth user + Firestore doc, returns { userId, token }
POST /api/v1/auth/login      → verifies email/password via Firebase Auth REST API, returns { token }
GET  /api/v1/auth/me         → validates Bearer token, returns { userId, role, email }
POST /api/v1/auth/logout     → revokes Firebase refresh tokens for the user
```

**API key management (creator-only):**
```
GET    /api/v1/api-keys           → list all active keys for the creator
POST   /api/v1/api-keys           → create key (returns plaintext once)
DELETE /api/v1/api-keys/{keyId}   → revoke key
```

---

### Implementation Notes

**`POST /auth/login`** — Firebase does not expose password verification in the Admin SDK.
Use the Firebase Auth REST API:
```typescript
const FIREBASE_API_KEY = process.env.FIREBASE_API_KEY; // add as Gen2 secret
const res = await fetch(
  `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_API_KEY}`,
  { method: 'POST', body: JSON.stringify({ email, password, returnSecureToken: true }) }
);
```
Add `FIREBASE_API_KEY` (the client-facing web API key, not a service account) as a Secret Manager secret.

**`POST /auth/signup`** — `admin.auth().createUser({ email, password })`, then write
the initial `users/{userId}` document. Return the ID token by calling the REST API
`signInWithPassword` immediately after creation.

**`POST /api-keys`** — Key generation:
```typescript
const rawKey = `wk_live_${crypto.randomBytes(32).toString('hex')}`;
const hash = crypto.createHash('sha256').update(rawKey).digest('hex');
// store hash in api_keys/{keyId}, return rawKey to caller (never store it)
```

**Rate limiting** — `checkRateLimit()` (defined in §1.3) is called inside `validateAuth()`
for API key callers only. First-party Firebase token callers are not rate-limited.

---

### Service File Changes — Domain 1

No existing service files change in Domain 1. The API key management UI (creator dashboard)
is new work — add the self-service key management page to the creator dashboard after
the endpoints are live.

**New file:** `apps/creator-dashboard/src/screens/ApiKeysScreen.jsx`
- Lists keys via `GET /api-keys`
- Create button → `POST /api-keys` → shows the full key once in a modal ("Copy this now — it won't be shown again")
- Revoke button per key → `DELETE /api-keys/{keyId}`
- Add to creator dashboard routing

---

## 4. Domain 2 — Profile

**React Query pre-work:** Migrate `ProfileScreen.web.js` to React Query before starting.

**Service files to update:**
- `apps/pwa/src/services/hybridDataService.js` — `loadUserProfile()`, `updateUserProfile()`
- `apps/creator-dashboard/src/services/` — whatever handles creator profile reads/writes

**Endpoints (from `API_ENDPOINTS.md §3`):**
```
GET   /api/v1/users/me
PATCH /api/v1/users/me
POST  /api/v1/users/me/profile-picture/upload-url
POST  /api/v1/users/me/profile-picture/confirm
GET   /api/v1/users/{userId}/public-profile          (used by CreatorProfileScreen)
PATCH /api/v1/creator/profile                        (creator-specific fields like cards)
```

---

### Implementation Notes

**Username uniqueness:** Currently done client-side with a collection scan. Move to
server-side: query `users` collection where `username == requested` (requires a Firestore
index on `username`). Add the index to `firestore.indexes.json`.

**Profile picture upload flow:**
1. `POST /upload-url` — Admin SDK generates signed URL:
   ```typescript
   const bucket = admin.storage().bucket();
   const file = bucket.file(`profiles/${userId}/profile.jpg`);
   const [url] = await file.getSignedUrl({
     action: 'write',
     expires: Date.now() + 15 * 60 * 1000, // 15 minutes
     contentType: req.body.contentType,
   });
   ```
2. Client uploads directly to Storage (file never touches Cloud Function)
3. `POST /confirm` — Admin SDK gets the download URL and writes it to `users/{userId}.profilePictureUrl`

**`bodyweight` alias:** The Firestore field may be stored as `bodyweight` in existing documents.
When reading for `GET /users/me`, normalize: return `weight: doc.bodyweight ?? doc.weight`.
When writing via `PATCH /users/me`, always write to `weight`.

---

### Service File Changes — Domain 2

```js
// hybridDataService.js (or a new userService.js — either works)

async loadUserProfile(userId) {
  const { data } = await apiClient.get('/users/me');
  return data;
}

async updateUserProfile(userId, changes) {
  await apiClient.patch('/users/me', changes);
}
```

The `userId` parameter is kept in the method signature so all callers continue to work.
The API ignores it (auth token determines the user). Remove after Domain 6 when
`hybridDataService` is deleted.

---

## 5. Domain 3 — Nutrition

**React Query pre-work:** Migrate `NutritionScreen.js` (native) to React Query.

**Service files to update:**
- `apps/pwa/src/services/nutritionApiService.js` — FatSecret proxy calls
- `apps/pwa/src/services/nutritionFirestoreService.js` — diary CRUD
- Creator dashboard nutrition services

**Endpoints (from `API_ENDPOINTS.md §4`):**
```
GET    /api/v1/nutrition/diary                      ?date=YYYY-MM-DD
POST   /api/v1/nutrition/diary
PATCH  /api/v1/nutrition/diary/{entryId}
DELETE /api/v1/nutrition/diary/{entryId}
GET    /api/v1/nutrition/foods/search               ?q=query&pageToken=...
GET    /api/v1/nutrition/foods/{foodId}
GET    /api/v1/nutrition/foods/barcode/{barcode}
GET    /api/v1/nutrition/saved-foods
POST   /api/v1/nutrition/saved-foods
DELETE /api/v1/nutrition/saved-foods/{savedFoodId}
GET    /api/v1/nutrition/assignment                 (active assignment for user)
GET    /api/v1/creator/nutrition/plans
POST   /api/v1/creator/nutrition/plans
PATCH  /api/v1/creator/nutrition/plans/{planId}
DELETE /api/v1/creator/nutrition/plans/{planId}
POST   /api/v1/creator/nutrition/assign             (assign plan to client)
```

---

### FatSecret Server-Side Cache — Build From Day One

**This is the highest-priority cost optimization.** Without it, FatSecret costs
~$400/month at 1,000 users. With it, costs drop below $10/month at that scale.

**Implementation:**

```typescript
// In the food search handler:
async function searchFoodWithCache(query: string, page: number) {
  const cacheKey = crypto.createHash('md5').update(`${query}_${page}`).digest('hex');
  const cacheRef = db.collection('nutrition_food_cache').doc(cacheKey);
  const cached = await cacheRef.get();

  if (cached.exists) {
    const data = cached.data()!;
    // TTL: 30 days. If within TTL, return cached result.
    if (data.expires_at.toDate() > new Date()) {
      return data.results;
    }
  }

  // Cache miss — call FatSecret
  const results = await callFatSecret(query, page);

  // Write to cache (fire-and-forget — don't await)
  cacheRef.set({
    results,
    query,
    cached_at: admin.firestore.FieldValue.serverTimestamp(),
    expires_at: admin.firestore.Timestamp.fromDate(
      new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
    ),
  });

  return results;
}
```

**New Firestore collection:** `nutrition_food_cache/{md5(query_page)}`
- No security rules needed (server-only collection; add `allow read, write: if false;` in rules)
- No index needed (always lookup by document ID)
- TTL cleanup: add a `pubsub.schedule('every 24 hours')` Gen1 function that deletes expired cache docs
  (or accept that stale docs pile up — at ~1KB per entry and thousands of unique queries,
  storage cost is negligible for Phase 3)

The FatSecret proxy functions in `functions/src/index.ts` (`nutritionFoodSearch`,
`nutritionFoodGet`, `nutritionBarcodeLookup`) are **migrated into the Express app routes**
during Domain 3. The original Gen1 function exports are removed after the API rewrite takes over.

---

### Nutrition Assignment Read

`GET /nutrition/assignment` returns the user's active nutrition plan content:
```typescript
// 1. Read users/{userId}.pinnedNutritionAssignmentId
// 2. Read nutrition_assignments/{assignmentId}
// 3. Read client_nutrition_plan_content/{assignmentId} for the full plan content
// Return combined response
```

---

### Service File Changes — Domain 3

```js
// nutritionApiService.js

async searchFoods(query, pageToken = null) {
  return apiClient.get('/nutrition/foods/search', { params: { q: query, pageToken } });
}

async getFoodById(foodId) {
  return apiClient.get(`/nutrition/foods/${foodId}`);
}

async lookupBarcode(barcode) {
  return apiClient.get(`/nutrition/foods/barcode/${barcode}`);
}

// nutritionFirestoreService.js

async getDiaryForDate(userId, date) {
  const { data } = await apiClient.get('/nutrition/diary', { params: { date } });
  return data;
}

async addDiaryEntry(userId, entry) {
  return apiClient.post('/nutrition/diary', entry);
}

async updateDiaryEntry(userId, entryId, changes) {
  return apiClient.patch(`/nutrition/diary/${entryId}`, changes);
}

async deleteDiaryEntry(userId, entryId) {
  return apiClient.delete(`/nutrition/diary/${entryId}`);
}
```

---

## 6. Domain 4 — Progress / Lab

**React Query pre-work:** Migrate `LabScreen.js`, `WeeklyVolumeHistoryScreen.js`,
`WeeklyVolumeHistoryScreen.web.js`, `WorkoutCompletionScreen.js`, `WorkoutCompletionScreen.web.js`.

**Service files to update:**
- `apps/pwa/src/services/hybridDataService.js` — body log, readiness methods
- Any service handling progress photo uploads

**Endpoints (from `API_ENDPOINTS.md §5`):**
```
PUT    /api/v1/progress/readiness/{date}
GET    /api/v1/progress/readiness/{date}
GET    /api/v1/progress/body-log                    (cursor-paginated, default 30/page)
POST   /api/v1/progress/body-log
DELETE /api/v1/progress/body-log/{entryId}
GET    /api/v1/progress/prs
POST   /api/v1/progress/photos/upload-url
POST   /api/v1/progress/photos/confirm
DELETE /api/v1/progress/photos/{photoId}
```

---

### Implementation Notes

**Body log — `PUT` vs `POST` for readiness:** `PUT /readiness/{date}` is idempotent —
calling it twice with the same date overwrites the first. This maps to a Firestore `set()`
with `{ merge: false }`. Use the date string as the document ID.

**PR endpoint:** `GET /progress/prs` reads from `users/{userId}/exerciseHistory/`
and returns the max weight per exercise key. This is what `consolidatedDataService`
currently does for the Lab screen. The endpoint replaces that unbounded read with a
server-side aggregation — only the latest PR per exercise key is returned, not the
full history.

**Progress photos:** Follow the same signed URL pattern as profile pictures. Storage
path: `progress/{userId}/{timestamp}.jpg`. Enforce ≤500KB in Storage security rules.

---

## 7. Domain 5 — Workout

This is the most complex domain. Read `OFFLINE_ARCHITECTURE.md` fully before
implementing any of it.

**React Query pre-work:**
- `MainScreen.web.js` (critical — uses `consolidatedDataService`)
- `DailyWorkoutScreen.js` (native)
- `WorkoutExecutionScreen.js` + `.web.jsx`
- `SessionsScreen.web.js`

**Service files to update:**
- `apps/pwa/src/services/sessionService.js` — `completeSession()`
- `apps/pwa/src/services/courseDownloadService.js` — replaced by React Query + IndexedDB
- `apps/pwa/src/data-management/workoutProgressService.js` — checkpoint writes

**Endpoints (from `API_ENDPOINTS.md §6`):**
```
GET  /api/v1/workout/daily                     ?courseId=...&date=YYYY-MM-DD
POST /api/v1/workout/complete
GET  /api/v1/workout/history                   (cursor-paginated, 20/page)
GET  /api/v1/workout/history/{sessionId}
GET  /api/v1/workout/streak
PUT  /api/v1/workout/checkpoint                (save mid-session state)
GET  /api/v1/workout/checkpoint                (resume after crash/reload)
DELETE /api/v1/workout/checkpoint              (clear after completion)
GET  /api/v1/workout/exercises/{key}/history   (cursor-paginated, 50/page)
GET  /api/v1/analytics/weekly-volume           ?weeks=8
GET  /api/v1/analytics/muscle-breakdown        ?sessionId=...
```

---

### `GET /workout/daily` — Server-Side Tree Assembly

This endpoint replaces the ~426 Firestore reads currently triggered by `DailyWorkoutScreen`.

```typescript
// Server assembles the full workout tree:
// 1. Read users/{userId}.courses to find the pinned course
// 2. Read courses/{courseId} for program metadata
// 3. Read courses/{courseId}/modules/* (batch)
// 4. Find the correct module for this week
// 5. Find the correct session for today within that module
// 6. Read the session's exercises subcollection
// 7. Read each exercise's sets subcollection
// 8. Return a flat denormalized response with all data

// Response shape (abbreviated):
{
  "data": {
    "courseId": "...",
    "sessionId": "...",
    "weekNumber": 3,
    "dayNumber": 2,
    "title": "Día 2 — Empuje",
    "exercises": [
      {
        "exerciseId": "...",
        "name": "Sentadilla",
        "sets": [{ "setId": "...", "reps": 8, "weight": null, "rir": 2 }]
      }
    ]
  }
}
```

Use `Promise.all()` for parallel subcollection reads where possible. The `staleTime`
for this query on the client is `0` (always refetch on mount) per `queryConfig.js`.

---

### `POST /workout/complete` — Atomic Session Completion

All 4 writes in a single `writeBatch()`:
```typescript
const batch = db.batch();

// 1. Session history
batch.set(db.collection('users').doc(userId).collection('sessionHistory').doc(), sessionData);

// 2. Exercise history (one write per exercise)
for (const exercise of exercises) {
  batch.set(
    db.collection('users').doc(userId).collection('exerciseHistory').doc(exercise.key),
    { sets: admin.firestore.FieldValue.arrayUnion(...exercise.sets) },
    { merge: true }
  );
}

// 3. exerciseLastPerformance (quick lookup — one write per exercise)
for (const exercise of exercises) {
  batch.set(
    db.collection('users').doc(userId).collection('exerciseLastPerformance').doc(exercise.key),
    exercise.lastSet,
    { merge: false }
  );
}

// 4. Streak + progress on users doc
batch.update(db.collection('users').doc(userId), {
  streak: newStreak,
  lastSessionDate: today,
  [`courses.${courseId}.lastCompletedSession`]: sessionId,
});

await batch.commit();

// Delete checkpoint (separate write — not in batch since completion succeeded)
await db.collection('users').doc(userId).collection('activeSession').doc('current').delete();
```

If the batch fails: the client queues the completion in the Background Sync offline queue
(per `OFFLINE_ARCHITECTURE.md §3`) and retries automatically when connectivity restores.

---

### Session Checkpoint System

The checkpoint system replaces `sessionRecoveryService` **for web**. For native,
`sessionRecoveryService` remains as-is and is replaced only during a future native rebuild.

**New Firestore path:** `users/{userId}/activeSession/current`

```typescript
// PUT /workout/checkpoint
// Called every 30 seconds during an active session and after each set completion
batch.set(
  db.collection('users').doc(userId).collection('activeSession').doc('current'),
  {
    courseId, sessionId, startedAt, lastSaved: serverTimestamp(),
    completedSets: req.body.completedSets, // full set state
  }
);
```

```typescript
// GET /workout/checkpoint
// Called on DailyWorkoutScreen mount (after daily workout query resolves)
// Returns the checkpoint if one exists for this session, null otherwise
const doc = await db.collection('users').doc(userId)
  .collection('activeSession').doc('current').get();
if (!doc.exists) return res.json({ data: null });
const data = doc.data()!;
// If checkpoint is >24h old, delete it and return null
if (new Date() - data.lastSaved.toDate() > 24 * 60 * 60 * 1000) {
  await doc.ref.delete();
  return res.json({ data: null });
}
return res.json({ data });
```

**Client-side recovery flow (web):**
1. `DailyWorkoutScreen` mounts → `GET /workout/daily` resolves
2. Immediately after: `GET /workout/checkpoint`
3. If checkpoint exists and matches today's session → show recovery modal:
   "Tienes una sesión sin terminar. ¿Continuar?"
4. User confirms → restore `completedSets` state from checkpoint
5. User declines → `DELETE /workout/checkpoint`

**`sessionRecoveryService` — web transition:**
`workoutProgressService.initialize()` calls `sessionRecoveryService.initializeRecovery()`
on app startup. Once the checkpoint API is live:
1. Remove the `initializeRecovery()` call from `workoutProgressService.initialize()` for web
2. Use platform detection: `if (Platform.OS !== 'web') sessionRecoveryService.initializeRecovery()`
3. `sessionRecoveryService` itself stays unchanged — it continues to serve native

---

### Analytics Endpoints

`GET /analytics/weekly-volume` replaces `consolidatedDataService`'s unbounded session
history read. Implementation:

```typescript
// Read only sessionHistory docs from the last N weeks (not all history)
const since = new Date();
since.setDate(since.getDate() - weeks * 7);

const sessions = await db.collection('users').doc(userId)
  .collection('sessionHistory')
  .where('completedAt', '>=', since)
  .orderBy('completedAt', 'desc')
  .get();

// Aggregate server-side: group by week, sum volume per muscle group
// Return summary — client receives ~200 bytes instead of triggering 600 reads
```

---

## 8. Domain 6 — Creator

**React Query pre-work:** Creator dashboard screens. The strategy doc (§1.11) confirmed
5 screens were cleaned up. Verify no remaining Firestore-direct screens before starting.

**Service files to update:** All creator dashboard services.

**Endpoints (from `API_ENDPOINTS.md §7–10`):**
```
# Programs
GET/POST                /api/v1/creator/programs
GET/PATCH/DELETE        /api/v1/creator/programs/{programId}
POST                    /api/v1/creator/programs/{programId}/duplicate
GET/POST/PATCH/DELETE   /api/v1/creator/programs/{programId}/...  (full module/session/exercise/set hierarchy)

# Clients
GET                     /api/v1/creator/clients                   (paginated 50/page)
GET                     /api/v1/creator/clients/{clientId}
POST                    /api/v1/creator/clients/invite
DELETE                  /api/v1/creator/clients/{clientId}

# Library
GET/POST/PATCH/DELETE   /api/v1/creator/library/sessions
GET/POST/PATCH/DELETE   /api/v1/creator/library/modules

# Nutrition
GET/POST/PATCH/DELETE   /api/v1/creator/nutrition/plans
POST                    /api/v1/creator/nutrition/assign

# Events
GET/POST/PATCH/DELETE   /api/v1/creator/events
POST                    /api/v1/creator/events/{eventId}/checkin
GET                     /api/v1/creator/events/{eventId}/registrations

# Availability & Bookings
GET/PUT                 /api/v1/creator/availability
GET                     /api/v1/creator/bookings
PATCH                   /api/v1/creator/bookings/{bookingId}
```

**The `lookupUserForCreatorInvite` Cloud Function** (currently Gen1 onCall) is migrated
into the Express app as `POST /api/v1/creator/clients/lookup`. Remove the old onCall
export after the creator dashboard is updated.

---

## 9. Third-Party API

**When to activate:** The third-party API is live from Domain 1 onwards — any creator
with an API key can start using it immediately. Document endpoints in OpenAPI as each
domain goes live.

**What third-party callers can access (by domain completion):**
- After Domain 1: API key management only
- After Domain 2: `GET /users/me`, `GET /users/{userId}/public-profile`
- After Domain 3: Nutrition diary reads (with `read` scope)
- After Domain 4: Progress data reads (PRs, body log)
- After Domain 5: Workout history, exercise history, analytics
- After Domain 6: Creator data (with `creator` scope)

**`THIRD_PARTY_API_SPEC.md`** is the external-facing reference. As each domain ships,
update that doc to mark those endpoints as available. The OpenAPI spec at `/api/docs`
is the machine-readable version of the same information.

**Scopes enforced in `validateAuth()`:**
```typescript
// After resolving userId and role, check scopes for API key callers
if (auth.authType === 'apikey') {
  const requiredScope = getRequiredScope(req.method, req.path); // e.g. 'write' for POST
  if (!auth.scopes.includes(requiredScope)) {
    throw apiError('FORBIDDEN', `This key requires the '${requiredScope}' scope`, 403);
  }
}
```

---

## 10. `hybridDataService` Deletion

Delete only after **all 6 domains are confirmed stable in production**. Do not
partially gut it during migration — unused methods are harmless until the final delete.

```bash
# After Domain 6 is confirmed stable:
rm apps/pwa/src/services/hybridDataService.js
grep -r "hybridDataService" apps/pwa/src/  # must return zero results
# Also check webStorageService — delete if only hybridDataService used it
firebase deploy --only hosting
```

---

## 11. Cost Optimization Timeline

These are ordered by priority. All except item 1 come for free as part of the
migration — they require no extra work.

| Priority | Optimization | When | Est. monthly savings at 1K users |
|---|---|---|---|
| 1 | FatSecret server-side cache | Domain 3, day one | ~$390/month |
| 2 | Remove `onSnapshot` listeners | Ongoing during migration | Eliminates fan-out reads |
| 3 | React Query `staleTime` discipline | Already enforced via `queryConfig.js` | Prevents unnecessary refetches |
| 4 | Service worker image caching | Part of offline arch | Eliminates ~$32/month Storage bandwidth |
| 5 | Analytics server-side aggregation | Domain 5 | ~$10/month |
| 6 | Cursor-based pagination | Domain 3–5 endpoints | Prevents unbounded reads |

**The FatSecret cache is the only item that requires deliberate extra work.
Everything else is a natural outcome of the migration. Do not defer the cache.**

---

## 12. Execution Checklist

```
§1.1  ☐ Create wake-staging Firebase project                              ← MANUAL: Firebase Console
§1.1  ✅ Update .firebaserc with staging alias                        (alias "staging" → wake-staging)
§1.1  ☐ Deploy rules/indexes to staging                               ← MANUAL: firebase deploy --only firestore:rules,firestore:indexes --project staging
§1.1  ☐ Add all secrets to wake-staging Secret Manager                    ← MANUAL: MERCADOPAGO_*, FATSECRET_*, RESEND_API_KEY
§1.1  ☐ Seed staging data (30 min)                                    ← MANUAL: npm run seed:staging
§1.2  ✅ Add /api/** rewrite to firebase.json
§1.2  ✅ Add Functions emulator to firebase.json
§1.3  ✅ Install express + @types/express in functions/
§1.3  ✅ Add Express app + Gen2 export to index.ts
§1.3  ✅ Implement validateAuth() with App Check + first-party rate limit
§1.3  ✅ Implement validateBody(), checkRateLimit() (two collections)
§1.3  ✅ Implement WakeApiServerError + global error handler (Retry-After on 429)
§1.4  ✅ Create apps/pwa/src/utils/apiClient.js (with X-Firebase-AppCheck header)
§1.4  ✅ Create apps/creator-dashboard/src/utils/apiClient.js (with X-Firebase-AppCheck header)
§1.5  ✅ Add /api proxy to creator-dashboard vite.config.js
§1.5  ✅ Add /api proxy to PWA Expo config
§1.6  ✅ Wire UNAUTHENTICATED + APP_CHECK_FAILED → signOut in QueryClient (both apps)
§1.7  ✅ Install swagger-ui-express + swagger-jsdoc in functions/
§1.7  ✅ Create functions/src/openapi.ts base spec
§1.7  ✅ Wire /api/docs route in Express app
§1.8  ☐ Enable App Check in Firebase Console (prod + staging) — reCAPTCHA Enterprise  ← MANUAL: Firebase Console → App Check
§1.8  ☐ Enable App Check enforcement for Cloud Functions                               ← MANUAL: Firebase Console → App Check → enforce
§1.8  ✅ Initialize App Check SDK in PWA firebase.js (ReCaptchaEnterpriseProvider)     (site key TODO placeholder in place)
§1.8  ✅ Initialize App Check SDK in creator-dashboard firebase.js                     (site key TODO placeholder in place)
§1.8  ✅ Add X-Firebase-AppCheck token to apiClient.js request headers (both apps)

§2    ✅ Migrate ProfileScreen.web.js to React Query
§3    ✅ Implement Domain 1 endpoints + health check
§3    ✅ Build ApiKeysScreen in creator dashboard
§3    ☐ Validate on staging (MIGRATION_ROLLOUT.md §4 Auth checklist)   ← MANUAL: npm run validate:staging
§3    ☐ Deploy to production                                            ← MANUAL: firebase deploy --only functions,hosting
§4    ✅ Migrate NutritionScreen.js to React Query
§4    ✅ Implement Domain 2 endpoints
§4    ✅ Add username index to firestore.indexes.json
§4    ✅ Update hybridDataService profile methods                        (hybridDataService deleted — callers migrated)
§4    ☐ Validate on staging (Profile checklist)                         ← MANUAL
§4    ☐ Deploy to production                                            ← MANUAL
§5    ✅ Migrate NutritionScreen.js (if not done)
§5    ✅ Implement Domain 3 endpoints + FatSecret cache
§5    ✅ Migrate nutritionApiService + nutritionFirestoreService
§5    ✅ Remove old nutritionFoodSearch/Get/Barcode Gen1 exports
§5    ☐ Validate on staging (Nutrition checklist)                       ← MANUAL
§5    ☐ Deploy to production                                            ← MANUAL
§6    ✅ Migrate LabScreen.js, WeeklyVolumeHistoryScreen, WorkoutCompletionScreen
§6    ✅ Implement Domain 4 endpoints
§6    ☐ Validate on staging (Progress/Lab checklist)                    ← MANUAL
§6    ☐ Deploy to production                                            ← MANUAL
§7    ✅ Migrate MainScreen.web.js (consolidatedDataService replacement)
§7    ✅ Migrate DailyWorkoutScreen.js, WorkoutExecutionScreen, SessionsScreen.web.js
§7    ✅ Implement Domain 5 endpoints
§7    ✅ Implement session checkpoint (activeSession/current)
§7    ✅ Update workoutProgressService — platform-gate sessionRecoveryService
§7    ✅ Implement POST /workout/complete with writeBatch
§7    ☐ Validate on staging (Workout checklist — including offline tests)  ← MANUAL
§7    ☐ Deploy to production                                               ← MANUAL
§8    ✅ Verify no remaining Firestore-direct creator dashboard screens
§8    ✅ Implement Domain 6 endpoints
§8    ✅ Migrate lookupUserForCreatorInvite → POST /creator/clients/lookup
§8    ☐ Validate on staging (Creator checklist)                         ← MANUAL
§8    ☐ Deploy to production                                            ← MANUAL
§10   ✅ Delete hybridDataService + webStorageService
§10   ✅ Delete consolidatedDataService
§10   ☐ Final deploy                                                    ← MANUAL: after all domains validated
```
