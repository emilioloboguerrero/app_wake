# Wake — Third-Party API Specification

All decisions here are locked. This document covers how third-party developers
(AI agents, custom apps, external developers) access the Wake API, how keys are
issued and revoked, what scopes exist, and how the developer portal is structured.

Read `API_CLIENT_SPEC.md` and `API_ENDPOINTS.md` before this document.
The API client's `mode: 'apikey'` path (§6 of `API_CLIENT_SPEC.md`) is the
integration point for third-party callers.

---

## 1. Who Uses the Third-Party API

Third-party consumers of the Wake API are:

| Type | Example use case |
|---|---|
| AI agents | An AI coach assistant that reads a user's workout history to generate personalized advice |
| Custom apps | A personal dashboard built by a coach pulling their clients' progress data |
| Third-party developers | A developer building a plugin or companion app on top of Wake |

These callers are NOT the PWA or creator dashboard. First-party apps always use
Firebase ID tokens (`mode: 'firebase'`). Third-party callers always use API keys
(`mode: 'apikey'`).

---

## 2. Authentication

Third-party callers authenticate with a static API key:

```
Authorization: Bearer wk_live_<64 hex chars>
```

The key is passed in the `Authorization: Bearer` header — the same header format
used by Firebase ID tokens. The server distinguishes key type by the `wk_live_`
prefix.

### 2.1 Key Storage (Server Side)

API keys are stored in the `api_keys` Firestore collection:

```
api_keys/{keyId}
```

```json
{
  "keyId": "key_abc123",
  "creatorId": "firebase-uid-of-creator",
  "name": "My Coaching Dashboard",
  "scope": ["read"],
  "keyHash": "sha256-of-the-full-key",
  "createdAt": "2026-03-15T10:00:00.000Z",
  "lastUsedAt": "2026-03-15T14:22:00.000Z",
  "revokedAt": null,
  "status": "active"
}
```

**The plaintext key is never stored.** Only the SHA-256 hash is stored.
The full key (`wk_live_...`) is shown exactly once — at creation — and never
retrievable again. If lost, the key must be revoked and a new one created.

### 2.2 Key Validation (Server Side)

On each request:

```
1. Extract Bearer token from Authorization header
2. If token starts with 'wk_live_' → API key path
3. SHA-256 hash the token
4. Query api_keys where keyHash == hash AND status == 'active'
5. If no match → throw UNAUTHENTICATED (401)
6. Set request context: { creatorId, scope, keyId }
7. Update lastUsedAt (async, fire-and-forget — do not await)
```

`lastUsedAt` is updated asynchronously on every request. This is informational
only — it is shown in the developer portal so creators can see if a key is
actively being used before revoking it.

---

## 3. Scopes

Wake uses **coarse scopes** for simplicity. Three scopes exist:

| Scope | What it allows |
|---|---|
| `read` | GET access to all endpoints the creator can access. Read their profile, clients, programs, session history, nutrition data for their clients. No writes. |
| `write` | All `read` permissions + POST/PATCH/PUT/DELETE for all endpoints the creator can access. |
| `creator` | Reserved for future use. Currently identical to `write`. |

Scope is checked server-side against the authenticated creator's permissions.
The API key does not expand permissions — it cannot access data the creator
themselves cannot access. The scope only restricts the method (GET-only for `read`).

### 3.1 Data Access Boundary

A third-party key is scoped to:
- The **creator who created the key** — their profile, programs, library
- The **creator's enrolled clients** — their workout sessions, nutrition, progress

A key holder cannot access:
- Any user not enrolled with the creator
- Another creator's data
- Admin endpoints
- Payment processing

Permissions are enforced server-side on every request using `creatorId` from the
key record, not from a claim in the token.

### 3.2 Scope Approval Flow

| Scope | How to get it |
|---|---|
| `read` | **Self-serve.** Creator creates the key from the developer portal immediately. No review. |
| `write` | **Manual approval.** Creator submits a request with their use case. Wake admin reviews and approves within 48 hours. Creator receives an email when approved. |

When a `write` key request is submitted:
1. A Firestore document is created at `api_keys/{keyId}` with `status: 'pending_approval'`
2. Wake admin sees the pending request in the creator dashboard admin panel
3. Admin approves → `status` changes to `active`, creator is notified
4. Admin rejects → `status` changes to `rejected`, creator is notified with reason

A `read` key goes directly to `status: 'active'` — no review step.

---

## 4. Rate Limiting

### 4.1 Current Limits (Free Tier)

All third-party API keys are currently subject to:

| Limit | Value |
|---|---|
| Requests per day | 1,000 |
| Requests per minute (burst) | 60 |

These limits are per API key, not per creator. A creator with two keys gets 1,000
req/day per key.

When a limit is exceeded, the server returns:

```
HTTP 429
Retry-After: <seconds until limit resets>
{ "error": { "code": "RATE_LIMITED", "message": "Rate limit exceeded." } }
```

### 4.2 Limit Enforcement

Rate limiting is enforced server-side using Firestore transaction-based counters.
A Firestore transaction performs the read and write atomically — two concurrent
requests cannot both read `count=59` and both pass a limit of 60.

```
rate_limit_windows/{keyId}_{windowMinute}
  count: number          — requests in this minute window
  expires_at: number     — windowMinute + 2 (for TTL cleanup)
```

The minute window is derived from `Math.floor(Date.now() / 60000)`. The document
auto-expires after 2 minutes (checked at cleanup time, not enforced by Firestore TTL —
a background task or the next cold start cleans stale documents).

**First-party users** (Firebase ID token) are rate limited separately:
```
rate_limit_first_party/{userId}_{windowMinute}
  count: number
  expires_at: number
```

Limit: 200 req/min per user. Same transaction mechanism. See `API_STRATEGY_PRE_INVESTIGATION.md §1.15`.

### 4.3 Future Tiers

When Wake has production-scale traffic, rate limits will be tiered by plan. The
exact tiers are not defined here — the enforcement mechanism (Firestore counters)
is designed to support different limits per key without code changes.

---

## 5. Key Lifecycle

### 5.1 Creating a Key

Creator visits the developer portal (`/developers`) → "New API key":

1. Creator enters a name for the key (e.g. "My Coaching Dashboard")
2. Creator selects scope: `read` or `write`
3. If `read`: key is generated immediately
4. If `write`: request is submitted for approval
5. Once active: key is displayed **once** in full (`wk_live_...`). Creator must copy it now.

Key generation:
```
keyId = "key_" + nanoid(12)
rawKey = "wk_live_" + randomHex(64)
keyHash = sha256(rawKey)
```

### 5.2 Revoking a Key

Creator visits developer portal → key list → "Revocar":

1. `api_keys/{keyId}.status` is set to `revoked`
2. `api_keys/{keyId}.revokedAt` is set to now
3. All subsequent requests using this key return `401 UNAUTHENTICATED` immediately
4. An email notification is sent to the key owner (the creator) confirming revocation

Revocation is **immediate** — there is no grace period. Any in-flight requests
using the revoked key that arrive after the Firestore write will be rejected.

Keys cannot be un-revoked. A new key must be created to restore access.

### 5.3 Key Expiry

Keys do not expire automatically. They remain valid indefinitely until manually
revoked. The developer portal shows `lastUsedAt` so creators can identify and
revoke stale keys.

### 5.4 Key Rotation

There is no built-in rotation mechanism. To rotate a key:
1. Create a new key
2. Update the third-party application to use the new key
3. Revoke the old key

This is the recommended rotation approach. The developer portal documents this
procedure.

---

## 6. Developer Portal

The developer portal is a dedicated web app built on Vite + React (same stack as
the creator dashboard). It lives at `/developers` within the Wake monorepo.

```
apps/developer-portal/     ← Vite + React 18, base: /developers
```

It is a separate app from the creator dashboard, served from the same Firebase
Hosting deployment. Creators log in using their existing Firebase credentials.

### 6.1 Pages

| Page | Path | Description |
|---|---|---|
| Home / Docs | `/developers` | API overview, getting started guide, authentication explanation |
| API Reference | `/developers/reference` | Auto-generated or hand-written endpoint docs |
| API Keys | `/developers/keys` | List keys, create new key, revoke keys, see lastUsedAt |
| Write Access Request | `/developers/keys/request-write` | Form to request `write` scope |
| Changelog | `/developers/changelog` | API version history and breaking changes |

### 6.2 Authentication

The developer portal uses Firebase Auth — same accounts as the PWA and creator
dashboard. Only users with `role: 'creator'` or `role: 'admin'` can access it.
Regular user accounts (`role: 'user'`) are redirected away with an explanation.

### 6.3 API Key UI

The key list shows:

| Column | Description |
|---|---|
| Name | Creator-assigned label |
| Scope | `read` or `write` |
| Status | `active`, `pending_approval`, `rejected`, `revoked` |
| Created | Human-readable date |
| Last used | Human-readable date or "Never" |
| Actions | "Revocar" button (active keys only) |

The "New API key" button opens a form. After creation, the full raw key is shown
in a one-time display modal with a "Copiar" button and a warning:
"Esta clave no se puede volver a mostrar. Guárdala en un lugar seguro."

### 6.4 Documentation

The portal hosts documentation in two places:

1. **In the portal** (`/developers/reference`): Interactive reference for all
   public endpoints with request/response examples. Scope requirements clearly
   labeled per endpoint.

2. **On GitHub** (`/docs/API_ENDPOINTS.md` and supporting docs): Same information,
   formatted for developers reading the repo directly. Keep both in sync when
   endpoints change.

---

## 7. API Versioning for Third Parties

The API is versioned at `/api/v1/`. Breaking changes require a new version
(`/api/v2/`). Non-breaking changes (new fields, new endpoints) are added to
the current version without a version bump.

**Breaking change definition** (requires version bump):
- Removing a field from a response
- Changing a field name
- Changing a field type
- Removing an endpoint
- Changing authentication requirements

**Non-breaking** (safe to add to current version):
- New optional fields in requests
- New fields in responses
- New endpoints
- New error codes for existing error conditions

Third-party developers must specify the version they are targeting. Wake
maintains the current version (`v1`) until a `v2` is stable and all third-party
developers have been given a migration window (minimum 90 days notice).

---

## 8. Error Responses

Third-party callers receive the same error format as first-party apps:

```json
{ "error": { "code": "ERROR_CODE", "message": "...", "field": "fieldName" } }
```

Additional codes relevant to third-party callers:

| Code | Status | Meaning |
|---|---|---|
| `UNAUTHENTICATED` | 401 | Key is invalid, revoked, or missing |
| `FORBIDDEN` | 403 | Key scope does not allow this operation |
| `RATE_LIMITED` | 429 | Rate limit exceeded. Check `Retry-After` header |
| `KEY_PENDING_APPROVAL` | 403 | Key exists but is awaiting write scope approval |

`FORBIDDEN` (403) is returned when:
- A `read`-scoped key attempts a write operation
- A creator key attempts to access another creator's data
- A regular user's key attempts to access creator endpoints

---

## 9. Firestore Security Rules

Third-party API access goes entirely through Cloud Functions — never directly
to Firestore. Firestore security rules do not need to accommodate API keys.

All Firestore rules remain written for Firebase Auth UID claims only:
```
allow read: if request.auth.uid == userId;
```

API key validation happens in `validateAuth()` in `functions/src/index.ts`. The
server uses the Firebase Admin SDK (service account) to read/write Firestore,
bypassing security rules entirely.

---

## 10. What Is Not in Scope

- **Webhooks** — not in this version. Third-party callers poll via GET endpoints.
  Wake will add webhook support when there is demand. The design will be added
  to this document.
- **OAuth / delegated user auth** — not supported. API keys are creator-scoped.
  A user cannot grant a third party access to their account via OAuth. This is
  a future consideration.
- **Public (unauthenticated) API** — not supported. All third-party access
  requires a valid API key with an active creator account.
- **SDK libraries** — no official client SDKs. Third parties use standard HTTP.
  The API is simple enough that an SDK adds no meaningful value at this stage.
- **Sandbox / test environment** — third parties test against the `wolf-dev`
  staging environment using a staging API key. There is no separate sandbox mode.
