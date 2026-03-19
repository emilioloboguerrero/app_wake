# Wake — Cost Model & Optimization Reference

This document models Firebase costs at current scale (2–3 active users) and
projected scale (1,000+ users), identifies the most expensive operations in
the current codebase, and describes how the Phase 3 API migration changes the
cost profile. It is a reference, not a contract — prices are Google's published
rates as of 2026-03 and are subject to change.

---

## 1. Firebase Free Tier (Spark Plan) vs. Pay-As-You-Go (Blaze)

Wake is on the **Blaze (Pay-As-You-Go)** plan. Blaze includes the same free
allotment as Spark, then bills beyond that.

| Resource | Free tier | Blaze overage rate |
|---|---|---|
| Firestore reads | 50,000 / day | $0.06 per 100K |
| Firestore writes | 20,000 / day | $0.18 per 100K |
| Firestore deletes | 20,000 / day | $0.02 per 100K |
| Firestore storage | 1 GiB | $0.18 / GiB / month |
| Cloud Functions invocations | 2M / month | $0.40 per 1M |
| Cloud Functions compute (128MB, 200ms) | 400K GHz-sec / month | $0.0000025 / GHz-sec |
| Firebase Hosting bandwidth | 10 GiB / month | $0.15 / GiB |
| Firebase Auth | Unlimited (email/pw, Google, Apple) | Free |
| Firebase Storage | 5 GiB storage, 1 GiB/day download | $0.026 / GiB, $0.12 / GiB download |

At 2–3 active users, Wake stays comfortably within the free tier for virtually
every resource. This document focuses on the 1,000+ user projection.

---

## 2. Current Firestore Cost Profile (Before Phase 3)

### 2.1 The Expensive Operations

The current codebase has several patterns that multiply Firestore reads beyond
what is necessary. These are ordered by impact:

---

#### 2.1.1 consolidatedDataService — Unbounded History Reads

**File:** `apps/pwa/src/services/consolidatedDataService.js`

`consolidatedDataService` fetches the user's complete session history and
complete exercise history on every invocation. There is no pagination or
time-bounding.

A user with 6 months of daily training has ~180 session documents. Each session
document references 4–8 exercises, each stored as a separate sub-document. A
single call to this service can easily trigger **400–600 Firestore reads** for
one user loading the analytics screen.

At 1,000 users each viewing analytics once per day:

```
600 reads × 1,000 users × 30 days = 18,000,000 reads/month
18,000,000 / 100,000 × $0.06 = $10.80/month from this one service
```

This is not catastrophic but it compounds. At 10,000 users it is $108/month
from a single analytics fetch.

**Fix (Phase 3):** `GET /analytics/weekly-volume` and `GET /analytics/muscle-breakdown`
in `API_ENDPOINTS.md §11` aggregate server-side, reading only the necessary
documents, and return pre-computed summaries. Client receives ~200 bytes of JSON
instead of triggering 600 reads.

---

#### 2.1.2 Program Tree Reads — Deep Subcollection Traversal

**Pattern:** Loading a course program currently requires reading:
- `courses/{courseId}` (1 read)
- `courses/{courseId}/modules/*` (N reads for each module)
- `courses/{courseId}/modules/{id}/sessions/*` (N reads for each session)
- `courses/{courseId}/modules/{id}/sessions/{id}/exercises/*` (N reads per session)
- `courses/{courseId}/modules/{id}/sessions/{id}/exercises/{id}/sets/*` (N reads per exercise)

A typical program with 4 weeks × 5 days × 5 exercises × 3 sets:
```
1 course + 4 modules + 20 sessions + 100 exercises + 300 sets = ~426 reads
```

This fires every time `DailyWorkoutScreen` loads without a warm React Query cache.

At 1,000 users each opening the workout screen once per day (cache miss ~20%
of the time):

```
426 reads × 200 users (cache miss) × 30 days = 2,556,000 reads/month
= $1.53/month
```

Modest now, but this pattern is not sustainable at 10K+ users or with more
complex programs.

**Fix (Phase 3):** `GET /workout/daily` in `API_ENDPOINTS.md §6.1` returns the
full day's workout as a single denormalized response. The Cloud Function performs
one query that assembles the tree server-side. Client receives one HTTP response
instead of triggering 426 reads per screen load.

---

#### 2.1.3 Session Completion — Non-Atomic Multi-Write

**File:** `apps/pwa/src/services/sessionService.js` — `completeSession()`

Session completion currently executes 5+ sequential Firestore writes:
1. `updateCourseProgress` — writes to `users/{uid}`
2. `getCourseDataForWorkout` — reads `courses/{courseId}` (a read in the middle of a write flow)
3. `addSessionData` — writes to `users/{uid}/sessionHistory/{id}`
4. `updateOneRepMax` — writes to `users/{uid}/exerciseHistory/{key}` (one write per exercise, up to 8)
5. Streak update — writes to `users/{uid}`
6. Volume update — writes to `users/{uid}`

For a session with 8 exercises:
```
Reads: ~1 (course data)
Writes: 1 + 1 + 8 + 1 + 1 = 12
```

These are not batched. Each is a separate Firestore round trip.

At 1,000 users completing one session per day:
```
12 writes × 1,000 × 30 = 360,000 writes/month
= $0.65/month
```

Cost is modest. The real problem is reliability — a crash between steps leaves
the user's data partially written. The batching fix is for correctness, not cost.

**Fix (Phase 3):** `POST /workout/complete` uses a single `writeBatch()` for all
completion writes. Same Firestore cost, but atomic.

---

#### 2.1.4 `onSnapshot` Listeners (Legacy — Being Removed)

The codebase has `onSnapshot` listeners in several places (flagged in
`PART2_INVESTIGATION_REPORT.txt`). Each active `onSnapshot` listener keeps an
open WebSocket connection to Firestore and bills a read every time the document
changes server-side (from any source).

If a creator updates a program while a user has an active listener on that
program, the user's device receives the update and bills a read. With 1,000
users all listening to the same popular program:

```
1 program update by coach × 1,000 listeners = 1,000 reads billed
```

This is the classic fan-out problem. React Query's `refetchOnWindowFocus` is a
correct replacement: reads happen only when the user returns to the app, not on
every server-side change.

**Fix:** `onSnapshot` is banned in new code per `CLAUDE.md`. React Query replaces
all listeners during migration.

---

#### 2.1.5 Nutrition Diary — Repeated FatSecret Proxy Calls

**File:** `apps/pwa/src/services/nutritionApiService.js`

Food search calls the Cloud Function proxy on every keystroke (debounced, but
still frequent). Each invocation:
1. Calls Cloud Functions (billed)
2. Calls FatSecret API (billed)

FatSecret pricing is per-call above the free tier. At 1,000 users each performing
5 food searches per day (each search = ~3 debounced API calls):

```
15 Cloud Function calls × 1,000 users × 30 days = 450,000 function invocations
= well within the 2M free tier
```

FatSecret cost depends on the plan. The free tier is 500 calls/day. At 1,000
users with 15 calls/day each, that's 15,000 calls/day — far above the free tier.
FatSecret pricing: ~$0.001/call above free tier = $13.50/day = $405/month.

**This is the highest projected cost item after Phase 3 migration.**

Mitigation strategies (in priority order):
1. **Client-side result cache:** Cache food search results in React Query for
   the session (`staleTime: 60 sec`). Repeated searches for the same query don't
   hit FatSecret again.
2. **Server-side result cache:** Cache FatSecret responses in Firestore
   (`nutrition_food_cache/{query_hash}`) with a 30-day TTL. Searches for common
   foods (chicken, rice, egg) hit the cache, not FatSecret.
3. **User saved foods:** Users who frequently log the same foods use their saved
   foods list (`users/{uid}/saved_foods`) — zero FatSecret calls.

The server-side cache is the highest-leverage mitigation and should be implemented
before launching to >100 users.

---

### 2.2 Summary Table — Current Cost at 1,000 Users

| Operation | Reads/month | Writes/month | Est. cost |
|---|---|---|---|
| Analytics (consolidatedDataService) | 18,000,000 | 0 | $10.80 |
| Program tree loads (20% cache miss) | 2,556,000 | 0 | $1.53 |
| Session completion | ~30,000 | 360,000 | $0.65 |
| Food search (FatSecret proxy) | 0 | 0 | $405 (FatSecret) |
| All other operations | ~5,000,000 | ~1,000,000 | ~$4.80 |
| **Total (est.)** | | | **~$423/month** |

The FatSecret cost dominates. Everything else is cheap.

---

## 3. Cost Profile After Phase 3 Migration

Phase 3 changes the cost profile in three ways:

### 3.1 Aggregation Server-Side

Analytics endpoints compute summaries in the Cloud Function. A user viewing
the analytics screen triggers 1 Cloud Function invocation instead of 600 Firestore
reads. At 1,000 users/day:

```
Before:  18,000,000 reads/month = $10.80
After:   30,000 function invocations/month = within free tier
```

Net savings: ~$10.80/month. Small but the pattern doesn't compound at scale.

### 3.2 Denormalized Daily Workout Response

`GET /workout/daily` assembles the day's workout in one Cloud Function call.
The function reads the Firestore tree once (server-side) and returns a flat JSON
response to the client. React Query caches this response for the session.

The Cloud Function reads the same Firestore documents — it doesn't reduce the
Firestore read count. But it does eliminate client-side read fan-out from cached
network inconsistencies and eliminates the subcollection listener pattern.

### 3.3 React Query Cache Replaces Firestore Listeners

Every `onSnapshot` removed = one fewer always-on Firestore connection per user.
At 1,000 users with 3 active listeners each = 3,000 persistent connections eliminated.

Firestore charges for document reads triggered by listeners. With React Query,
reads happen only on mount + window focus — typically 1–3 reads per session
instead of continuous.

### 3.4 Cost After Phase 3 (1,000 Users Estimate)

| Resource | Before | After |
|---|---|---|
| Firestore reads | ~25,586,000/month ($15) | ~8,000,000/month ($4.80) |
| Firestore writes | ~1,360,000/month ($2.45) | ~1,200,000/month ($2.16) |
| Cloud Functions | ~450,000 invocations (free) | ~2,000,000 invocations (free) |
| FatSecret | $405/month | $405/month (unchanged without cache) |
| Hosting bandwidth | ~5 GiB/month (free) | ~5 GiB/month (free) |
| **Total** | **~$422/month** | **~$412/month** |

Phase 3 migration alone doesn't dramatically change costs. The big lever is the
FatSecret server-side cache (§2.1.5), which is independent of the API migration.

---

## 4. Firebase Storage Costs

Profile pictures and exercise images live in Firebase Storage.

| Asset | Size (avg) | Volume | Storage cost |
|---|---|---|---|
| Profile pictures | 150 KB | 1,000 users | 150 MB = ~$0.004/month |
| Program/exercise images | 500 KB | 500 images | 250 MB = ~$0.006/month |
| Progress photos | 400 KB | 10 photos/user | 4 GB = ~$0.10/month |

Storage cost is negligible. Download bandwidth is the larger concern:

- Each app load renders ~10 images = ~5 MB of image downloads
- At 1,000 users × 2 sessions/day × 5 MB = 10 GB/day = well above the 1 GiB/day
  free tier = $0.12 × (10 - 1) = $1.08/day = $32/month

**Mitigation:** The service worker caches exercise/program images with a 30-day
TTL (per `OFFLINE_ARCHITECTURE.md §5.2`). After the first load, images are served
from cache. Daily bandwidth drops to near zero for returning users.

---

## 5. Cloud Functions Compute Cost

All Wake Cloud Functions run at 128 MB memory, gen1, us-central1.

| Function | Avg duration | Invocations/day at 1K users | Monthly cost |
|---|---|---|---|
| API handler (Express) | 200ms | 10,000 | Within free tier |
| nutritionFoodSearch | 300ms | 15,000 | Within free tier |
| processPaymentWebhook | 100ms | 10 | Negligible |
| sendEventConfirmationEmail | 500ms | 50 | Negligible |

Total invocations at 1,000 users: ~750,000/month. Free tier is 2,000,000.
No function compute cost until ~2,700 daily active users.

---

## 6. Cost Scaling Table

Estimated total monthly cost at different user scales:

| Daily Active Users | Est. Total/month | Primary cost driver |
|---|---|---|
| 10 | $0 (free tier) | — |
| 100 | $0–$5 | FatSecret (if no cache) |
| 1,000 | ~$50–$420 | FatSecret without cache; <$50 with cache |
| 5,000 | ~$200–$2,000 | FatSecret + Firestore reads |
| 10,000 | ~$400–$4,000 | FatSecret + Functions compute |

The wide range at each scale reflects whether the FatSecret server-side cache
is implemented. It is the single most impactful cost optimization.

---

## 7. Cost Optimization Priority List

In priority order:

1. **Implement FatSecret server-side cache** — saves ~$400/month at 1K users.
   Cache `nutrition_food_cache/{md5(query)}` with 30-day TTL. Implement before
   reaching 100 users.

2. **Remove `onSnapshot` listeners** — done as part of Phase 3 migration.
   Eliminates continuous Firestore reads. No extra work needed.

3. **Add React Query `staleTime` discipline** — already enforced via `queryConfig.js`.
   Prevents unnecessary re-fetches. No extra work needed.

4. **Service worker image caching** — done as part of offline architecture spec.
   Eliminates Storage bandwidth cost for returning users. No extra work needed.

5. **Analytics server-side aggregation** — `GET /analytics/weekly-volume` and
   `GET /analytics/muscle-breakdown` in Phase 3. Eliminates consolidatedDataService
   fan-out reads.

6. **Cursor-based pagination** — already in Phase 3 design. Prevents unbounded
   list reads. No extra work needed.

---

## 8. What This Document Does Not Cover

- **MercadoPago fees** — transaction fees are a business cost, not infrastructure.
  Colombia rates: ~3.49% + COP 900 per transaction. Not optimizable via engineering.
- **Resend email costs** — free tier is 3,000 emails/month. At 1,000 users,
  this covers event confirmations comfortably. No cost concern at this scale.
- **EAS build costs** — EAS free tier covers low-volume mobile builds. No cost
  concern until continuous deployment at high frequency.
