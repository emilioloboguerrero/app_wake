# Wake API — Client Layer Specification

All decisions here are locked. This document is the single source of truth for how
PWA and creator dashboard call the Wake API. It is read before writing any service wrapper.

---

## 1. Overview

Each app has its own API client module. They are not shared because their dependency
trees differ (PWA uses AsyncStorage on native, creator dashboard is web-only).

| App | Path |
|---|---|
| PWA | `apps/pwa/src/utils/apiClient.js` |
| Creator Dashboard | `apps/creator-dashboard/src/utils/apiClient.js` |

Both files export a single default instance. The shape is identical. The only
difference is how the Firebase Auth import is resolved.

The client is a thin wrapper over the native `fetch` API. No third-party HTTP
library (axios, ky, etc.) is used.

---

## 2. Authentication

### 2.1 Token Type Detection

The API accepts two token types. The client detects which to use at construction time
via a `mode` option:

```
mode: 'firebase'    → Authorization: Bearer <Firebase ID token>
mode: 'apikey'      → Authorization: Bearer wk_live_<64chars>
```

First-party clients (PWA, creator dashboard) always use `mode: 'firebase'`.
Third-party integrations always use `mode: 'apikey'` — they construct their own
client with their key, never use the first-party module.

### 2.2 Firebase Token Lifecycle

Firebase ID tokens expire after 1 hour. The client maintains an in-memory token
cache with the following policy:

```
REFRESH_MARGIN = 5 minutes

if (cachedToken && now < cachedToken.expiresAt - REFRESH_MARGIN) {
  use cachedToken.value
} else {
  fetch fresh token via auth.currentUser.getIdToken(false)
  cache { value, expiresAt: now + 3600s }
}
```

`getIdToken(false)` does NOT force a network call — Firebase SDK returns the
cached token if it is still valid. The margin exists purely as a safety buffer.

`getIdToken(true)` (forced refresh) is used only in the 401 recovery path (§4.2).

### 2.3 Unauthenticated Requests

Public endpoints (e.g. `GET /events/{id}`, `POST /events/{id}/register`) pass
`includeAuth: false` to the request helper. The `Authorization` header is omitted
entirely. Never send `Authorization: Bearer null` or `Authorization: Bearer undefined`.

---

## 3. Request Shape

### 3.1 Base URL

```
const BASE_URL = '/api/v1';
```

Relative path. Firebase Hosting serves both the app and the API from the same origin,
so no cross-origin complexity exists. Relative paths work in both dev (with proxy)
and production.

### 3.2 Default Headers

Every request includes:

```
Content-Type: application/json
Accept: application/json
Authorization: Bearer <token>          (unless includeAuth: false)
X-Wake-Client: pwa/1.0                 (or creator-dashboard/1.0)
X-Firebase-AppCheck: <appcheck_token>  (first-party only — see below)
```

`X-Wake-Client` is for server-side logging only. It is not used for auth or routing.
It identifies which app made the request in logs, but is not cryptographically verified.

`X-Firebase-AppCheck` is the App Check attestation token (see `API_STRATEGY_PRE_INVESTIGATION.md §1.14`).
This token proves the request comes from a registered Wake app, not an external caller.
The client reads it from the App Check SDK before each request:

```js
import { getToken } from 'firebase/app-check';
import { appCheck } from '../config/firebase'; // the initialized AppCheck instance

async function getAppCheckToken() {
  try {
    const result = await getToken(appCheck, /* forceRefresh= */ false);
    return result.token;
  } catch {
    return null; // emulator / local dev — server skips validation in emulator mode
  }
}
```

Third-party callers (`mode: 'apikey'`) do NOT send `X-Firebase-AppCheck`.
The header is omitted entirely for API key requests.

### 3.3 Request Method

```js
apiClient.get(path, options)
apiClient.post(path, body, options)
apiClient.patch(path, body, options)
apiClient.delete(path, options)
apiClient.put(path, body, options)
```

`options` is optional on all methods. Valid fields:

| Field | Type | Default | Description |
|---|---|---|---|
| `includeAuth` | boolean | `true` | Attach Authorization header |
| `timeout` | number | `15000` | Request timeout in ms |
| `signal` | AbortSignal | — | External cancellation signal |
| `params` | object | — | Query string params (serialized as `?key=val&...`) |

Body is always serialized as JSON. Never send `FormData` through the API client —
file uploads use signed URLs (see `API_ENDPOINTS.md §3`).

---

## 4. Response Handling

### 4.1 Success

Any 2xx response with a JSON body is returned as-is:

```js
const { data } = await apiClient.get('/users/me');
```

The client unwraps nothing. The caller receives the full parsed JSON object.
Response shape is defined per-endpoint in `API_ENDPOINTS.md`.

### 4.2 Error Handling

All non-2xx responses throw a `WakeApiError`. The client never returns a
non-2xx response as a resolved value.

```js
class WakeApiError extends Error {
  constructor(code, message, status, field = null) {
    super(message);
    this.code = code;       // string — e.g. 'NOT_FOUND', 'VALIDATION_ERROR'
    this.status = status;   // number — HTTP status code
    this.field = field;     // string | null — field name for validation errors
  }
}
```

Error construction rules:

| Scenario | `code` | `status` | `field` |
|---|---|---|---|
| API returned JSON error body | `error.code` from body | HTTP status | `error.field` from body |
| API returned non-JSON body | `'INTERNAL_ERROR'` | HTTP status | null |
| Request timed out | `'REQUEST_TIMEOUT'` | 0 | null |
| Network unreachable | `'NETWORK_ERROR'` | 0 | null |
| User not authenticated (no current user) | `'UNAUTHENTICATED'` | 401 | null |

### 4.3 401 Recovery (Token Refresh)

On a 401 response, the client attempts exactly one token refresh:

```
1. Clear token cache
2. Call auth.currentUser.getIdToken(true)  ← force network refresh
3. Retry the original request with the new token
4. If the retry also returns 401 → throw WakeApiError('UNAUTHENTICATED', ..., 401)
5. If the retry succeeds → return response normally
```

This handles the edge case where a token was revoked server-side or the clock
drifted. It does NOT loop — only one retry on 401.

### 4.4 Retryable Errors

The client retries on 500, 503, and network failures (but NOT on 401, 403, 404,
400, 409, 429). Retry policy:

```
MAX_RETRIES = 2
INITIAL_DELAY_MS = 150
BACKOFF_MULTIPLIER = 2

attempt 1 (original):  immediate
attempt 2 (retry 1):   wait 150ms
attempt 3 (retry 2):   wait 300ms
```

On 429, the client reads the `Retry-After` response header (seconds) and waits
that duration before the single allowed retry. If `Retry-After` is absent,
treat as non-retryable and throw immediately.

Retries are NOT applied to non-idempotent requests by default. `POST` requests
are only retried if the caller explicitly passes `{ idempotent: true }` in options.
All `GET`, `PUT`, `DELETE`, `PATCH` requests are retried automatically.

### 4.5 Timeout

Default timeout is 15 seconds. The client uses `AbortController` internally:

```js
const controller = new AbortController();
const timeoutId = setTimeout(() => controller.abort(), timeout);
fetch(url, { signal: controller.signal, ...rest })
  .finally(() => clearTimeout(timeoutId));
```

If the caller passes their own `signal` in options, the client merges both signals
(abort if either fires).

---

## 5. Offline Detection

Before making any request, the client checks `navigator.onLine`. If `false`:

- For read requests (`GET`): throw `WakeApiError('NETWORK_ERROR', ..., 0)`.
  React Query will serve the stale cache — the error is surfaced to the UI only if
  there is no cached data.
- For write requests (`POST`, `PATCH`, `PUT`, `DELETE`): check if the operation
  is in the queueable set (defined in `OFFLINE_ARCHITECTURE.md §3`). If yes,
  enqueue to the offline write queue and return a synthetic success response
  `{ queued: true }`. If no, throw `WakeApiError('NETWORK_ERROR', ..., 0)`.

`navigator.onLine` is not perfectly reliable. The retry path (§4.4) handles the
case where `onLine` is `true` but the network is actually unreachable.

---

## 6. Module Structure

```js
// apps/pwa/src/utils/apiClient.js

class WakeApiError extends Error { ... }

class ApiClient {
  #tokenCache = null;       // { value: string, expiresAt: number } | null
  #clientId = 'pwa/1.0';
  #mode = 'firebase';       // 'firebase' | 'apikey'
  #apiKey = null;           // only set when mode === 'apikey'

  constructor(options = {}) { ... }

  async #getToken() { ... }                            // returns string | null
  async #request(method, path, body, options) { ... } // core fetch logic
  async #withRetry(fn, isIdempotent) { ... }           // retry wrapper

  async get(path, options) { ... }
  async post(path, body, options) { ... }
  async patch(path, body, options) { ... }
  async put(path, body, options) { ... }
  async delete(path, options) { ... }
}

export const apiClient = new ApiClient();
export default apiClient;
export { WakeApiError };
```

The class uses private fields (`#`) to prevent external mutation of the token
cache or client config.

The singleton `apiClient` is what all service files import. Third-party integrations
instantiate their own: `new ApiClient({ mode: 'apikey', apiKey: 'wk_live_...' })`.

---

## 7. Usage in Service Files

Service files import `apiClient` and `WakeApiError`. They do not import `fetch`,
Firebase SDK, or Firestore directly (post-migration).

```js
// Example: apps/pwa/src/services/userService.js

import apiClient, { WakeApiError } from '../utils/apiClient';

class UserService {
  async getProfile() {
    return apiClient.get('/users/me');
  }

  async updateProfile(changes) {
    return apiClient.patch('/users/me', changes);
  }
}

export default new UserService();
```

Error handling is the caller's responsibility. Services do not catch `WakeApiError`
unless they are implementing retry logic or fallback behavior specific to that domain.
React Query's `onError` / `error` state handles display-layer errors.

User-facing error messages are always in Spanish. `WakeApiError.code` is used to
select the message — never display `WakeApiError.message` directly to users
(it is English, for server logs).

---

## 8. React Query Integration

The API client is invisible to React Query. Query functions call service methods,
which call the API client. React Query sees only resolved values and thrown errors.

```js
// Example query function
queryFn: () => userService.getProfile()

// React Query error handling
// error is a WakeApiError if the request failed
// error.code drives the user-facing message lookup
```

`WakeApiError` with `code: 'UNAUTHENTICATED'` should trigger a sign-out in the
`QueryClient` global error handler. This is wired once at app startup, not per-query.

---

## 9. Development vs Production

| Concern | Dev | Production |
|---|---|---|
| Base URL | `/api/v1` via Vite proxy to local Functions emulator | `/api/v1` same origin |
| Firebase Auth | Emulator (`localhost:9099`) | Production |
| Token caching | Same | Same |
| Retry delays | Same | Same |

The Vite proxy config routes `/api/**` to `http://localhost:5001/wolf-20b8b/us-central1/api`.
No environment variable is needed — the relative path works in both environments.

For the staging Firebase project (`wolf-dev`), the same relative path applies.
The deploy target controls which project is active, not the client code.

---

## 10. What Is Not in Scope

- Streaming / SSE — not used in Wake. Polling via `refetchInterval` in React Query
  covers the real-time use cases.
- Request deduplication — handled by React Query's built-in deduplication for reads.
  For writes, callers are responsible for preventing duplicate submissions (disable
  button on submit, `isMutating` state).
- Request logging / tracing — server-side only via `functions.logger`. The client
  does not send trace headers.
- Response compression — handled at the Firebase Hosting / CDN layer, transparent
  to the client.
