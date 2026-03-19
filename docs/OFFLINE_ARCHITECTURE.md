# Wake PWA — Offline Architecture Specification

All decisions here are locked. This document defines how the PWA behaves when
the network is unavailable or unreliable. It replaces the legacy `hybridDataService`
offline strategy entirely.

Read `API_CLIENT_SPEC.md` before this document. The API client's offline detection
(§5) is the integration point between this spec and the request layer.

---

## 1. Design Principles

- **Read offline is free.** React Query's in-memory + IndexedDB persistence cache
  serves stale reads without any additional work. The cache IS the offline read layer.
- **Writes are scoped.** Not all write operations are queued offline. Only the ones
  a user realistically performs in a gym without connectivity. Everything else fails
  fast and tells the user to reconnect.
- **Last-write-wins for user-owned data.** Diary entries, readiness, body log — the
  user's most recent action is always correct. No merge logic.
- **Server-wins for completion events.** A workout session that was already completed
  server-side is never overwritten by a queued completion from offline.
- **Creator dashboard is always online.** No offline support for the creator dashboard.
  Coaches manage programs and clients at a desk. Offline queueing adds complexity
  with no meaningful benefit.
- **No service worker on `/creators`.** Service worker scope is `/app` only.

---

## 2. What Works Offline

### 2.1 Reads (Served from Cache)

These work offline because React Query's `gcTime` keeps the data alive after
the last successful fetch. No extra code is needed — this is automatic.

| Data | staleTime | gcTime | Offline behavior |
|---|---|---|---|
| Daily workout program | 0 | 30 min | Served from cache. Shows "Última actualización: X" banner. |
| Session history | 10 min | 60 min | Served from cache. New sessions appear after reconnect. |
| User profile | 5 min | 60 min | Served from cache. |
| Nutrition diary (today) | 30 sec | 30 min | Served from cache. Queued writes merged on reconnect. |
| PRs / exercise history | 15 min | 60 min | Served from cache. |
| Body log | 5 min | 60 min | Served from cache. |
| Readiness (today) | 0 | 30 min | Served from cache. Queued writes merged on reconnect. |

`gcTime` values in this table override the defaults in `queryConfig.js` for
these specific query keys. They are longer than default because offline resilience
is a priority for these data types.

### 2.2 Writes (Queued)

These write operations are queued when offline and replayed on reconnect:

| Operation | Endpoint | Notes |
|---|---|---|
| Log food entry | `POST /nutrition/diary` | Queued with client-generated temp ID |
| Edit food entry | `PATCH /nutrition/diary/{id}` | Queued with full body |
| Delete food entry | `DELETE /nutrition/diary/{id}` | Queued |
| Log readiness | `PUT /progress/readiness/{date}` | Idempotent — last write wins |
| Log body weight | `POST /progress/body-log` | Queued |
| Save session checkpoint | `POST /workout/session/checkpoint` | Queued (low priority) |
| Complete workout | `POST /workout/complete` | Queued (high priority — see §4.3) |

### 2.3 Writes (Not Queued — Fail Fast)

These operations require a live server response and cannot be safely deferred:

| Operation | Reason |
|---|---|
| Auth (login, signup) | Requires server-issued token |
| Purchase / subscription | Payment state must be authoritative |
| Profile update (username, photo) | Conflict detection requires server check |
| Nutrition food search | FatSecret proxy — no local dataset |
| Creator operations (all) | Always online scope |
| Event registration | Capacity must be checked server-side |
| Call booking | Availability must be checked server-side |

When these are attempted offline, the API client throws `WakeApiError('NETWORK_ERROR')`,
which the calling screen handles by showing a Spanish error message:
"Sin conexión. Conéctate a internet para continuar."

---

## 3. Offline Write Queue

### 3.1 Storage

The queue is stored in `localStorage` under the key `wake_offline_queue`.

```json
[
  {
    "id": "q_1741234567890_abc",
    "method": "POST",
    "path": "/nutrition/diary",
    "body": { "foodId": "123", "mealType": "lunch", "servings": 1.5, "date": "2026-03-15" },
    "enqueuedAt": "2026-03-15T14:45:00.000Z",
    "retryCount": 0,
    "priority": "normal"
  },
  {
    "id": "q_1741234999999_xyz",
    "method": "POST",
    "path": "/workout/complete",
    "body": { ... },
    "enqueuedAt": "2026-03-15T15:01:00.000Z",
    "retryCount": 0,
    "priority": "high"
  }
]
```

### 3.2 Queue Entry Schema

| Field | Type | Description |
|---|---|---|
| `id` | string | `q_{timestamp}_{random4}`. Used for deduplication. |
| `method` | string | HTTP method: `POST`, `PATCH`, `PUT`, `DELETE` |
| `path` | string | API path (no base URL): `/nutrition/diary` |
| `body` | object | Full request body. Serialized at enqueue time — body is immutable. |
| `enqueuedAt` | ISO string | When the request was queued. Entries older than 7 days are discarded. |
| `retryCount` | number | Number of replay attempts that have failed. Max 3 — discarded after. |
| `priority` | string | `'high'` or `'normal'`. High-priority items replay first. |

### 3.3 Priority

`priority: 'high'` is used for:
- `POST /workout/complete` — loss of a completed workout is the worst possible outcome.

All other queued operations use `priority: 'normal'`.

High-priority items are replayed before normal-priority items within the same
flush cycle.

---

## 4. Queue Replay

### 4.1 When Replay Fires

Replay is triggered by:

1. `window.addEventListener('online')` — browser detects network restoration
2. App focus (`visibilitychange` → `document.visibilityState === 'visible'`) — covers
   mobile case where the app resumes from background
3. Manual trigger — user taps "Reintentar" in the offline banner UI

Replay does NOT fire on a timer/interval. It fires on the events above only.

### 4.2 Replay Algorithm

```
function replayQueue():
  queue = read from localStorage
  if queue is empty → return

  sort by priority (high first), then by enqueuedAt (oldest first)

  for each entry in queue:
    if entry.retryCount >= 3 → remove from queue, skip
    if now - entry.enqueuedAt > 7 days → remove from queue, skip

    try:
      response = await apiClient.post/patch/put/delete(entry.path, entry.body)
      if success → remove entry from queue
    catch WakeApiError:
      if error.status >= 400 and error.status < 500:
        // 4xx = permanent failure (e.g. entry was deleted on server, conflict)
        remove entry from queue  ← do not retry 4xx
      else:
        entry.retryCount++
        update queue in localStorage

  if queue is empty → hide offline banner
  else → show partial failure UI
```

### 4.3 Workout Completion Replay

`POST /workout/complete` is the most critical queued operation. Additional handling:

- If the server returns `409 CONFLICT` (session already completed): remove from
  queue silently. Do not show an error — the data is already saved.
- If the server returns `200`: remove from queue and invalidate the session
  history React Query cache so the completion screen shows correctly.
- If the replay succeeds after the user has already navigated away: no UI update
  needed. The data is saved — the user will see it next time they view session history.

### 4.4 Temp IDs

When a diary entry is created offline, the client has no server-assigned ID yet.
The queue entry uses a client-generated temp ID (`temp_xyz`) in the body.
The optimistic React Query update uses the same temp ID in the cache.

On successful replay, the server returns the real document ID. The client:
1. Removes the temp entry from the React Query cache
2. Inserts the real entry with the server ID
3. Invalidates the diary query to trigger a re-fetch

Temp IDs are prefixed `temp_` and are never sent to the server as document IDs.
They are only used in the local React Query cache.

---

## 5. Service Worker

### 5.1 Scope

The service worker is registered at `/app/sw.js` and scoped to `/app/`.
It does NOT cover `/` (landing) or `/creators` (creator dashboard).

### 5.2 Caching Strategy

| Resource | Strategy | Notes |
|---|---|---|
| App shell (JS, CSS, fonts) | Cache-first, update in background | Precached at install time via Workbox |
| Static images (program/exercise images from Storage) | Cache-first, 30-day TTL | Cached on first access |
| API responses (`/api/v1/**`) | Network-first, fallback to nothing | React Query cache handles offline reads — the SW does not cache API responses |
| Firebase Auth requests | Network-only | Never cache auth tokens |
| FatSecret / MercadoPago proxies | Network-only | Third-party — never cache |

The service worker does **not** implement Background Sync API for write queueing.
Background Sync has inconsistent browser support and requires a service worker
with complex coordination. The `localStorage` queue + `window.online` event
replay is simpler, more predictable, and sufficient for Wake's offline write volume.

### 5.3 App Shell Precache

The app shell includes:
- Main JS bundle
- Vendor chunk
- CSS
- Fonts (Geist, if self-hosted)
- `/app/index.html`
- PWA manifest icons

Precache happens at service worker install time via Workbox's `precacheAndRoute`.
The Expo web build output is compatible with Workbox's glob patterns.

### 5.4 Update Strategy

When a new service worker is available:
- Install in the background (don't interrupt the user mid-workout)
- On the next app load, activate the new worker and clear old caches
- Do NOT use `skipWaiting()` + `clients.claim()` — this can cause a mid-session
  cache/bundle version mismatch

---

## 6. Offline UI

### 6.1 Offline Banner

A persistent banner shown at the top of every screen when `navigator.onLine === false`
or when the API client has received consecutive `NETWORK_ERROR` responses:

```
┌────────────────────────────────────────────────────────────────┐
│  Sin conexión — trabajando sin internet       [Reintentar]     │
└────────────────────────────────────────────────────────────────┘
```

The banner disappears when connectivity is restored and the pending queue is
flushed successfully.

### 6.2 Queued Write Indicator

When there are items in the offline queue, show a subtle indicator in the
navigation bar (a small dot or count badge on a sync icon). This tells the user
their data is saved locally but not yet synced.

### 6.3 Non-Queueable Action Feedback

When a user attempts a non-queueable operation while offline (§2.3), show an
inline error message in Spanish beneath the action button:

```
Sin conexión. Conéctate a internet para continuar.
```

Do not show a modal or toast for this. Inline is less disruptive.

### 6.4 Workout Execution (Offline)

During an active workout session, if connectivity is lost:
- Show a small "Sin conexión" badge in the workout header (not a blocking modal)
- Continue the session normally — all state is in memory and checkpoints go to localStorage
- On completion, queue `POST /workout/complete` and show:

```
Sesión guardada localmente. Se sincronizará cuando recuperes la conexión.
```

Navigate to the completion screen normally. The stats are computed locally
from the in-memory session data — no server response needed for the completion
screen content.

---

## 7. `hybridDataService` Migration

`hybridDataService` is the legacy offline cache. It is deleted as part of the
Phase 3 migration, not before. The migration path:

1. Each domain migrates to the API (Auth → Profile → Nutrition → ...).
2. When a domain migrates, its service file is rewritten to call the API client.
   The offline write queue handles the offline write case.
3. React Query's `gcTime` handles the offline read case.
4. Once ALL domains are migrated, `hybridDataService` is deleted.

Do not partially gut `hybridDataService`. It stays intact until it is fully
replaced by the combination of React Query cache + offline write queue.

---

## 8. What Is Not Covered

- **Background data sync while app is closed.** The service worker does not
  implement periodic background sync. Queue replay requires the app to be open.
  This is acceptable — fitness data logging is an active-session activity.
- **Conflict resolution for concurrent edits.** Multiple devices editing the same
  diary entry simultaneously is not a supported use case. Last-write-wins is sufficient.
- **Offline nutrition search.** No local food database. Nutrition search requires
  connectivity. This is a known limitation, not a bug.
- **Offline program browsing.** Reading program structure requires the React Query
  cache to have been populated from a prior online session. If the user has never
  loaded a course, they cannot view it offline. This is acceptable.
