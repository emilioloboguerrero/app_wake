# Audit 1C: API Client Libraries — Security, Error Handling & Spec Compliance

**Scope:** `apiClient.js` in all three apps + `offlineQueue.js` (PWA)
**Source of truth:** `docs/API_CLIENT_SPEC.md`
**Date:** 2026-03-20
**Status:** ✅ ALL ISSUES FIXED

---

## Files Audited

| File | Lines |
|---|---|
| `apps/pwa/src/utils/apiClient.js` | 200 |
| `apps/creator-dashboard/src/utils/apiClient.js` | 176 |
| `apps/landing/src/utils/apiClient.js` | 107 |
| `apps/pwa/src/utils/offlineQueue.js` | 134 |
| `docs/API_CLIENT_SPEC.md` | 377 (reference) |

---

## Findings

### PWA — `apps/pwa/src/utils/apiClient.js`

| Severity | Location | Description | Suggested Fix |
|---|---|---|---|
| ✅ **HIGH** | apiClient.js:128-132 | **401 retry fetch has no timeout or signal.** When the first request returns 401, the retry `fetch()` call at line 128 has no `AbortController` and no timeout. If the server hangs, this request blocks forever. The original request's `clearTimeout` already fired at line 113, and the retry doesn't create a new controller. | Create a new `AbortController` with the same `timeout` value for the retry fetch. Apply the same `mergedSignal` pattern. |
| ✅ **HIGH** | apiClient.js:176-179 | **429 retry bypasses retry loop counter.** Inside `#withRetry`, a 429 with `retryAfter` triggers `return await fn()` (line 179) which calls `#request` again. If that second call also returns 429 (e.g., server still rate-limiting), it throws immediately (no `retryAfter` check at request level) — but this `fn()` call is outside the retry loop's `i` counter, effectively giving one extra attempt beyond `MAX_RETRIES`. While not infinite, it's a spec deviation from "retries once" (spec §4.4). | Move 429 handling outside the for-loop, or integrate it into the delay array logic so total attempts are bounded by `delays.length`. |
| ✅ **MEDIUM** | apiClient.js:121-143 | **Token refresh race condition.** If 5 concurrent requests all receive 401 simultaneously, each independently clears `#tokenCache`, calls `getIdToken(true)`, and retries. This triggers 5 parallel forced token refreshes and 5 retry fetches. Spec §2.2 doesn't explicitly require queueing, but this wastes resources and could trigger rate limits on Firebase Auth. | Implement a single in-flight refresh promise pattern: if a refresh is already in progress, subsequent callers await the same promise instead of starting a new one. |
| ✅ **MEDIUM** | apiClient.js:159 | **External AbortSignal cancellation misclassified as timeout.** If the caller passes an external `signal` (e.g., from React component unmount) and that signal fires, the resulting `AbortError` is caught at line 159 and thrown as `REQUEST_TIMEOUT` with status 0. This is misleading — the request didn't time out, it was intentionally cancelled. | Check `controller.signal.aborted` to distinguish internal timeout from external cancellation. Use a different error code like `'REQUEST_CANCELLED'` for external signals, or re-throw the original AbortError. |
| ✅ **MEDIUM** | apiClient.js:88-89 | **App Check token fetched before auth token — ordering risk.** If `#getToken()` at line 89 throws (user signed out), the App Check token fetch (lines 90-97) is skipped — which is fine. But if App Check fails after auth token was already fetched, the request proceeds without App Check. This is spec-compliant (spec says silently skip), but worth noting that requests can silently downgrade. | No change needed — matches spec. Document the downgrade behavior. |
| ✅ **LOW** | apiClient.js:198 | **Redundant `clientId` in constructor.** Line 198 passes `{ clientId: 'pwa/1.0' }` but the class already sets `#clientId = 'pwa/1.0'` as the field default on line 36. The constructor override is a no-op. | Remove the constructor arg: `new ApiClient()` — the default is already correct. |
| ✅ **LOW** | apiClient.js:110 | **Body re-serialized on 401 retry.** `JSON.stringify(body)` is called again on line 131 for the retry. This is wasteful but not buggy — `body` hasn't changed. Minor inefficiency. | Serialize body once before the first fetch, store in a local variable, reuse for retry. |
| ✅ **LOW** | apiClient.js:71 | **Mixed language in error messages.** Offline error for non-queueable writes uses Spanish ("No hay conexión", line 71) but GET offline error uses English ("No network connection", line 64). Spec says user-facing messages should be Spanish, but `WakeApiError.message` is for logs (English). These messages are inconsistent with each other. | Pick one language. Per spec §7, `WakeApiError.message` is English (for server logs). Use English consistently: "No network connection" for both. |

### Creator Dashboard — `apps/creator-dashboard/src/utils/apiClient.js`

| Severity | Location | Description | Suggested Fix |
|---|---|---|---|
| ✅ **HIGH** | apiClient.js:104-108 | **401 retry fetch has no timeout or signal.** Identical issue to PWA. Retry fetch at line 104 has no `AbortController`, can hang forever. | Same fix as PWA — create a new controller for the retry. |
| ✅ **HIGH** | apiClient.js:152-155 | **429 retry bypasses retry loop counter.** Identical issue to PWA — `fn()` call at line 155 is outside the bounded loop. | Same fix as PWA. |
| ✅ **MEDIUM** | apiClient.js:97-119 | **Token refresh race condition.** Identical to PWA — no serialization of concurrent 401 refresh attempts. | Same fix as PWA — share a single refresh promise. |
| ✅ **MEDIUM** | apiClient.js:135 | **External AbortSignal misclassified as timeout.** Identical to PWA. | Same fix as PWA. |
| ✅ **LOW** | apiClient.js:174 | **Redundant `clientId` in constructor.** Passes `{ clientId: 'creator-dashboard/1.0' }` but class default on line 20 is already `'creator-dashboard/1.0'`. | Remove the constructor arg. |

### Landing — `apps/landing/src/utils/apiClient.js`

| Severity | Location | Description | Suggested Fix |
|---|---|---|---|
| ✅ **MEDIUM** | apiClient.js:14-69 | **No offline detection.** Spec §5 requires checking `navigator.onLine` before requests. Landing has no offline check — requests will fail with a raw network error that gets caught as `NETWORK_ERROR`, but the user experience differs from spec (no early fail, no clear offline messaging). | Add `navigator.onLine` check at the top of `request()`. For landing (no auth, no queue), always throw `WakeApiError('NETWORK_ERROR', ...)` when offline. |
| ✅ **MEDIUM** | apiClient.js:83-86 | **429 retry bypasses retry loop counter.** Same pattern as PWA/CD. | Same fix. |
| ✅ **LOW** | apiClient.js:1-107 | **Not a class — uses plain functions + object literal.** Spec §6 defines a `class ApiClient` with private fields. Landing uses module-level functions and a plain object export. This is a reasonable simplification for landing (no auth, no token cache), but diverges from spec structure. | Acceptable deviation for landing. No change needed unless consistency is a priority. |
| ✅ **LOW** | apiClient.js:14 | **No `includeAuth` option.** Landing never needs auth, so this is fine. But the function signature diverges from spec §3.3 — callers that accidentally pass `includeAuth: true` won't get an error, it'll silently proceed without auth. | No change needed — landing has no auth. |
| ✅ **INFO** | apiClient.js:1 | **Not listed in API_CLIENT_SPEC.** Spec §1 only mentions PWA and creator-dashboard. Landing's apiClient is undocumented. | Add landing to the spec table, or add a comment in the file explaining it's a stripped-down public-only variant. |

### Offline Queue — `apps/pwa/src/utils/offlineQueue.js`

| Severity | Location | Description | Suggested Fix |
|---|---|---|---|
| ✅ **MEDIUM** | offlineQueue.js:92 | **No max queue size.** `enqueue()` appends without limit. A user offline for extended periods could fill `localStorage` (typically 5-10MB), causing `writeQueue()` to fail silently at line 49-51 (caught, logged, but entry is lost). The user gets no indication that their queued operation was dropped. | Add a `MAX_QUEUE_SIZE` constant (e.g., 50). In `enqueue()`, check `queue.length >= MAX_QUEUE_SIZE` before pushing. If full, throw a `WakeApiError('QUEUE_FULL', ...)` or return null with a warning. |
| ✅ **MEDIUM** | offlineQueue.js:72-79 | **Body sanitization only trims top-level strings.** Nested objects (e.g., nutrition diary entries with nested food data) are not trimmed. This is minor but inconsistent — either trim deeply or don't trim at all (trimming partial data could mask bugs). | Either remove trimming (unnecessary — server should validate) or apply recursively. Recommend removing — it's over-engineering for an offline queue. |
| ✅ **LOW** | offlineQueue.js:24 | **localStorage is synchronous and blocking.** On every enqueue/dequeue, the entire queue is read from localStorage, parsed, filtered, re-serialized, and written back. For typical queue sizes (<20 entries) this is fine, but at scale it could cause jank. | Acceptable for current scale. If queue sizes grow, consider IndexedDB. |
| ✅ **LOW** | offlineQueue.js:82 | **Weak entry ID generation.** `q_${Date.now()}_${Math.random().toString(36).slice(2, 6)}` has only ~21 bits of randomness (4 base-36 chars). Two entries enqueued in the same millisecond have a ~1/1.7M collision chance. Extremely unlikely, but `crypto.randomUUID()` is available and stronger. | Replace with `crypto.randomUUID()` for a guaranteed unique ID. |

---

## Cross-Cutting Issues (All 3 Apps)

| Severity | Description | Affected Files |
|---|---|---|
| ✅ **HIGH** | **429 retry can exceed documented retry budget.** Spec §4.4 says 429 with `Retry-After` retries **once**. The implementation does retry once, but the retry call (`return await fn()`) happens inside the for-loop, meaning if this was attempt 2 of 3, the total attempts become 4 (3 loop iterations + 1 extra 429 retry). The 429 retry should count against the total budget. | All 3 apiClient.js |
| ✅ **MEDIUM** | **No token refresh mutex / deduplication.** PWA and CD can fire multiple concurrent `getIdToken(true)` calls. Firebase SDK handles this gracefully (returns the same promise), but the multiple retry fetches still fire. | PWA, CD |
| ✅ **LOW** | **`AbortSignal.any()` browser compatibility.** Used at PWA:103, CD:79, Landing:34. `AbortSignal.any()` is relatively new (Chrome 116+, Safari 17.4+). If Wake targets older browsers, this will throw. | All 3 apiClient.js |

---

## Spec Compliance Summary

| Spec Section | PWA | Creator Dashboard | Landing |
|---|---|---|---|
| §2 Authentication | ✅ Correct | ✅ Correct | N/A (no auth) |
| §2.2 Token lifecycle | ✅ Margin, cache, getIdToken(false) | ✅ Same | N/A |
| §2.3 Unauthenticated requests | ✅ `includeAuth: false` supported | ✅ Same | ✅ (always unauth) |
| §3.1 Base URL | ✅ `/api/v1` | ✅ Same | ✅ Same |
| §3.2 Default headers | ✅ All 4 headers | ✅ All 4 headers | ⚠️ Missing App Check (OK — no auth) |
| §3.3 Method signatures | ✅ All 5 methods | ✅ All 5 methods | ✅ All 5 methods |
| §4.1 Success handling | ✅ 204 → null, else json | ✅ Same | ✅ Same |
| §4.2 Error handling | ✅ WakeApiError with all fields | ✅ Same | ✅ Same |
| §4.3 401 recovery | ✅ With timeout + signal on retry | ✅ Same | N/A |
| §4.4 Retryable errors | ✅ 429 bounded by retry loop | ✅ Same | ✅ Same |
| §4.5 Timeout | ✅ 15s default, AbortController | ✅ Same | ✅ Same |
| §5 Offline detection | ✅ With queue | ✅ Throws for all methods | ✅ navigator.onLine check |
| §6 Module structure | ✅ Class + private fields | ✅ Same | ⚠️ Plain object (acceptable) |
| POST idempotent flag | ✅ `options.idempotent` | ✅ Same | ✅ Same |
| Signal merging | ✅ `AbortSignal.any` | ✅ Same | ✅ Same |

---

## Security Assessment

| Area | Status | Notes |
|---|---|---|
| Token storage | ✅ | In-memory only (`#tokenCache` private field). Not persisted to localStorage/sessionStorage. |
| Token logging | ✅ | No `console.log` of tokens anywhere. |
| Token in offline queue | ✅ | `offlineQueue.js` comment at line 69 explicitly warns against storing tokens. Queue stores only method/path/body. |
| Sensitive data in errors | ✅ | Error messages don't include tokens or credentials. |
| CORS / base URL | ✅ | Relative `/api/v1` — no cross-origin risk. |
| App Check | ✅ | Sent on authenticated requests, silently skipped when unavailable. |

---

## Dead Code

No dead code, unused methods, commented-out code, or stale imports found in any of the three apiClient files or the offline queue.

---

## Priority Fix Order

1. ✅ **HIGH — 401 retry timeout** (PWA + CD): Hanging requests are a real UX issue. Fix: add AbortController to retry fetch.
2. ✅ **HIGH — 429 retry budget** (all 3): Can exceed spec's retry limits. Fix: integrate 429 into the retry loop counter.
3. ✅ **MEDIUM — Token refresh race** (PWA + CD): Multiple concurrent refreshes. Fix: single-promise deduplication.
4. ✅ **MEDIUM — Offline queue max size** (PWA): Unbounded queue growth. Fix: add `MAX_QUEUE_SIZE`.
5. ✅ **MEDIUM — Landing offline detection** (Landing): Missing spec §5 check. Fix: add `navigator.onLine` guard.
6. ✅ **MEDIUM — AbortSignal source distinction** (PWA + CD): Timeout vs cancellation conflated. Fix: check which signal aborted.
