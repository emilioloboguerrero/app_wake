# Audit: API Middleware, Express App & Gen1 Cloud Functions

**Date:** 2026-03-20
**Scope:** `functions/src/index.ts`, `functions/src/api/app.ts`, `functions/src/api/errors.ts`, `functions/src/api/middleware/auth.ts`, `functions/src/api/middleware/validate.ts`, `functions/src/api/middleware/rateLimit.ts`, `functions/src/openapi.ts`
**Type:** Security & cleanup (read-only)

---

## Summary

| Severity | Count |
|----------|-------|
| CRITICAL | 0 |
| HIGH | 4 |
| MEDIUM | 7 |
| LOW | 4 |

---

## Findings by File

### auth.ts

| Severity | Location | Description | Suggested Fix |
|----------|----------|-------------|---------------|
| MEDIUM | auth.ts:123 | ✅ `verifyIdToken(token)` does not pass `checkRevoked: true`. If a user's session is revoked (compromised account), the old token continues working until its ~1-hour expiry. | Pass `true` as the second argument: `admin.auth().verifyIdToken(token, true)`. |
| MEDIUM | auth.ts:138 | ✅ App Check is only validated when the `x-firebase-appcheck` header is present. An attacker can omit it entirely to skip verification. Provides zero protection until enforcement is mandatory. | When ready, reject requests missing the header (outside emulator). Until then, document this as an accepted risk. |
| LOW | auth.ts:27-29 | ✅ `req.auth` caching: if any preceding middleware or proxy sets `req.auth`, all validation is bypassed. Low practical risk since nothing in the Express pipeline does this today. | Consider deleting the early-return cache or prefixing with a private symbol (`req._wakeAuth`). |

### validate.ts

| Severity | Location | Description | Suggested Fix |
|----------|----------|-------------|---------------|
| HIGH | validate.ts:57 | ✅ Required `string` fields accept empty strings (`""`) because `typeof "" === "string"` passes the type check. Critical fields like `courseId` or `email` can be submitted as empty. | After the null/undefined check, add: if `baseType === "string" && !isOptional && typeof value === "string" && value.trim() === ""`, throw `VALIDATION_ERROR` with `"${field} no puede estar vacío"`. |
| MEDIUM | validate.ts:67 | ✅ No rejection of unexpected/extra fields in the request body. If route handlers spread validated body into Firestore, an attacker can inject arbitrary fields. | Add an option to strip or reject fields not declared in the schema. At minimum, return only declared fields from the cast. |
| LOW | validate.ts:48-64 | ✅ No nested object validation or array item type checking. Arrays and objects are verified at the top-level type only; their contents are unvalidated. | Acceptable if route handlers validate deeper structures. Consider adding `array_of_string`, `array_of_object` types if needed. |

### rateLimit.ts

| Severity | Location | Description | Suggested Fix |
|----------|----------|-------------|---------------|
| MEDIUM | rateLimit.ts:20-23, 58-61 | ✅ Documents have an `expires_at` field but no Firestore TTL policy is configured. Rate limit documents accumulate forever, causing unbounded storage growth and cost. | Configure a [Firestore TTL policy](https://firebase.google.com/docs/firestore/ttl) on the `expires_at` field for `rate_limit_windows` and `rate_limit_first_party` collections. |
| LOW | rateLimit.ts:40-41, 80-81 | ✅ `retryAfter` is attached to the error via an unsafe type assertion cast (`as WakeApiServerError & { retryAfter: number }`). Works but is fragile. | Add `retryAfter?: number` as an optional property on `WakeApiServerError` and pass it via the constructor. |

**Positive notes:** Firestore transactions correctly handle concurrent counter increments (no race conditions). Rate limiting keys on userId/keyId (not IP), so X-Forwarded-For spoofing is irrelevant. Retry-After header is correctly emitted by the global error handler.

### app.ts

| Severity | Location | Description | Suggested Fix |
|----------|----------|-------------|---------------|
| HIGH | app.ts:29-31 | ✅ CORS reflects any request origin via `req.headers.origin \|\| "*"`. Any website's JavaScript can call the API with a user's Bearer token. While `Access-Control-Allow-Credentials` is not set (cookies not forwarded), this is still overly permissive. | Whitelist known origins (`https://wakelab.co`, `https://www.wakelab.co`, etc.). Allow any origin only in emulator mode (`process.env.FUNCTIONS_EMULATOR === "true"`). Always set `Vary: Origin` when reflecting. |
| MEDIUM | app.ts:21-47 | ✅ No security headers. Missing `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`. | Add a middleware after the body parser that sets these headers. Alternatively, add `helmet` as a dependency. |
| LOW | app.ts:55 | ✅ Swagger UI at `/docs` is publicly accessible without authentication. Exposes the full API surface (all endpoints, parameters, auth schemes) to anyone. | Gate behind emulator check, or add basic auth for production. |

**Positive notes:** Body size limit (1MB) is reasonable. Middleware ordering is correct (auth before routes, error handler last). Global error handler correctly hides internals for unexpected errors, returning a generic Spanish message. 404 catch-all is properly placed.

### index.ts — Gen1 Functions

| Severity | Location | Description | Suggested Fix |
|----------|----------|-------------|---------------|
| HIGH | index.ts:38-54 | ✅ In-memory rate limiting (`rateLimitStore` Map) is ineffective in Cloud Functions. Each instance has its own empty Map, instances cold-start frequently, and horizontal scaling means requests hit different instances. Provides essentially zero protection for payment/subscription endpoints. | Replace with Firestore-based rate limiting (same pattern as `api/middleware/rateLimit.ts`), or accept this gap until Gen1 functions are retired in Phase 3 migration. |
| HIGH | index.ts:477 | ✅ `createPaymentPreference` catch block returns `toErrorMessage(error)` to the client. Raw MercadoPago API errors can leak internal URLs, token fragments, or implementation details. | Replace with a generic message: `"Error al crear la preferencia de pago"`. Log the real error server-side (already done). |
| HIGH | index.ts:666 | ✅ `createSubscriptionCheckout` catch block (non-alternate-email path) returns `message \|\| "Error al crear la suscripción"` — same internal leak as above. | Replace with: `"Error al crear la suscripción"`. |
| HIGH | index.ts:1753-1755 | ✅ `updateSubscriptionStatus` catch block returns `toErrorMessage(error)` to the client. Same class of internal error message leak. | Replace with: `"Error al actualizar la suscripción"`. |
| MEDIUM | index.ts:755-793 | ✅ No webhook replay protection. The new MercadoPago signature format includes a `ts` timestamp used in HMAC computation, but the timestamp is never validated for freshness. A captured valid webhook payload could be replayed. The idempotency check on `processed_payments` partially mitigates this for already-processed payment IDs only. | Inside `validateSignatureNew`, parse `ts` as seconds-since-epoch, reject if `abs(Date.now() - ts*1000) > 300_000` (5 minutes). |
| MEDIUM | index.ts:2342-2347 | ✅ HTML injection in `sendEventConfirmationEmail`. `greeting`, `confirmationMsg`, and `eventTitle` are interpolated into the email HTML template without escaping. A malicious creator could inject phishing links or misleading content via event title or confirmation message fields. | Add an `escapeHtml()` helper (replace `&`, `<`, `>`, `"`, `'`) and apply it to all interpolated strings in the email template. |
| MEDIUM | index.ts:2000-2235 | ✅ Nutrition proxy functions (`nutritionFoodSearch`, `nutritionFoodGet`, `nutritionBarcodeLookup`) only require App Check — no Firebase Auth. Any client with a valid App Check token can query FatSecret without being logged in. The only abuse protection is the in-memory rate limiter, which is ineffective (see above). | Add Firebase Auth verification to nutrition proxies, or accept the risk and document it. Consider adding Firestore-based rate limiting keyed by IP as a fallback. |
| LOW | index.ts:134-163 | ✅ App Check behavior inconsistency between Gen1 and Gen2. Gen1 functions **require** App Check (`verifyAppCheck` returns false when header is missing, causing 401). Gen2 auth middleware treats App Check as **optional** (only verified if header is present). | Align behavior across generations. Document the intended policy. |

**Positive notes on Gen1:**
- `processPaymentWebhook` HMAC validation uses `crypto.timingSafeEqual` correctly with proper buffer length checks (lines 726-740, 786-793).
- Idempotency via `processed_payments` collection with Firestore transactions is well-implemented.
- `onUserCreated` uses `set(doc, {merge: true})` which correctly handles race conditions if the user doc is created simultaneously by another process.
- FatSecret proxy parameters are passed via `URLSearchParams`, properly encoding them — no SSRF risk.
- `parseExternalReference` validates format strictly; `buildExternalReference` checks for delimiter injection.
- Error classification for webhook retries (`classifyError`) is reasonable.

### errors.ts

| Severity | Location | Description | Suggested Fix |
|----------|----------|-------------|---------------|
| — | — | ✅ No issues found. Clean, minimal class. Serialization in app.ts only outputs `code`, `message`, and optionally `field`. No internals leaked. | Consider adding `retryAfter?: number` as an optional constructor parameter to eliminate the type-assertion hack in rateLimit.ts. |

### openapi.ts

| Severity | Location | Description | Suggested Fix |
|----------|----------|-------------|---------------|
| MEDIUM | openapi.ts:64-67 | ✅ API key auth location mismatch. Spec declares keys in `X-API-Key` header (`type: "apiKey", in: "header"`), but the actual auth middleware reads them from `Authorization: Bearer wk_live_...`. Third-party developers using the docs will send keys in the wrong header and get 401 errors. | Change to `type: "http", scheme: "bearer", bearerFormat: "wk_live_... or wk_test_..."` to match actual implementation. |

---

## Dead Code & Cleanup

| Category | Location | Description |
|----------|----------|-------------|
| TODO/FIXME/HACK | — | None found in scoped files. |
| Unused imports | — | None found. All imports are used. |
| Commented-out code | — | None found. |
| Duplicate logic | index.ts vs api/middleware/ | `verifyAppCheck()` and `verifyGen1Auth()` in index.ts duplicate logic from `auth.ts` middleware. Expected for Gen1/Gen2 split — track for removal when Gen1 functions are retired. |
| Duplicate logic | index.ts Gen1 payment functions vs api/routes/payments.ts | Gen1 payment endpoints and Gen2 `/payments/*` routes likely duplicate payment logic. Expected during migration. |

---

## Recommended Fix Priority

1. **Error message leaks** (index.ts lines 477, 666, 1753) — Simplest fix, highest immediate security value. Replace three `toErrorMessage(error)` returns with generic Spanish messages.
2. **CORS origin whitelist** (app.ts line 29) — Replace origin reflection with a `Set` of allowed origins.
3. **Empty string validation** (validate.ts line 57) — Add trim+empty check for required string fields.
4. **Gen1 rate limiting** (index.ts line 38-54) — Replace in-memory Map with Firestore-based transactions, or accept until Gen1 retirement.
5. **Security headers** (app.ts) — Add `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`.
6. **OpenAPI key mismatch** (openapi.ts line 64) — Fix `ApiKeyAuth` scheme to match Bearer implementation.
7. **Webhook replay protection** (index.ts) — Add timestamp freshness check in `validateSignatureNew`.
8. **Email HTML escaping** (index.ts line 2342) — Add `escapeHtml()` to email template interpolations.
9. **Rate limit TTL** (rateLimit.ts) — Configure Firestore TTL policies on rate limit collections.
10. **Token revocation check** (auth.ts line 123) — Pass `checkRevoked: true` to `verifyIdToken`.
