# Wake — Migration Rollout Plan

This document defines how the Phase 3 API migration is executed in production.
It covers the domain-by-domain cutover strategy, what happens during and after
each cutover, what to validate on staging first, and how to roll back if
something goes wrong.

Read `API_STRATEGY_PRE_INVESTIGATION.md` and `API_ENDPOINTS.md` before this
document. This document is about sequencing and execution, not API design.

---

## 1. Guiding Principles

- **Hard cut per domain.** When a domain migrates, every call within that domain
  switches from the old path (Firestore SDK / legacy service) to the new path
  (API client + Cloud Function). There is no period where both paths are active
  simultaneously.
- **No feature flags.** Adding a feature flag for the migration would mean
  maintaining two code paths indefinitely. The staging environment validates
  correctness before production. The flag is the staging deploy.
- **No parallel-write period.** Writing to both Firestore directly AND through
  the API at the same time introduces dual-write inconsistency. Avoid it.
- **Downtime is acceptable.** With 2–3 active users, a brief period of degraded
  functionality during a cutover is acceptable. Do not over-engineer for zero
  downtime at this scale.
- **Staging validates before prod.** Every domain is fully exercised on staging
  (`wolf-dev`) before the production deploy. If staging fails, production does
  not change.
- **One domain at a time.** Do not begin the next domain's migration until the
  previous domain is confirmed stable in production.

---

## 2. Migration Order

The migration proceeds in this order. Each domain is a unit of work:

| Phase | Domain | Key endpoints | Current state |
|---|---|---|---|
| 1 | **Auth** | `/auth/login`, `/auth/signup`, `/auth/me`, `/auth/logout` | Firebase Auth SDK calls scattered across services |
| 2 | **Profile** | `/users/me`, `/users/me/photo` | `hybridDataService.updateUserProfile` + direct Firestore |
| 3 | **Nutrition** | `/nutrition/diary/*`, `/nutrition/foods/*`, `/nutrition/saved-foods/*` | `nutritionApiService`, `nutritionFirestoreService`, direct Firestore |
| 4 | **Progress / Lab** | `/progress/readiness/*`, `/progress/body-log/*`, `/progress/prs` | `hybridDataService`, direct Firestore |
| 5 | **Workout** | `/workout/daily`, `/workout/complete`, `/workout/session/*`, `/workout/streak`, `/analytics/*` | `sessionService`, `courseDownloadService`, `consolidatedDataService` |
| 6 | **Creator** | `/creator/programs/*`, `/creator/clients/*`, `/creator/library/*`, `/creator/nutrition/*` | All `creatorDashboard` services, direct Firestore |

Auth is first because every other domain depends on a valid auth token. Creator
is last because it is the most complex and least time-sensitive (coaches are
desktop users who tolerate brief downtime more easily than gym users mid-workout).

---

## 3. Per-Domain Cutover Procedure

For each domain, follow this procedure exactly. Do not skip steps.

### Step 1 — Write the Cloud Function endpoint(s)

Add the new endpoint(s) to `functions/src/index.ts`. Follow the standard
endpoint anatomy from `CLAUDE.md`:

```ts
// 1. Auth validation
const userId = await validateAuth(req);

// 2. Input validation
const body = validateBody(schema, req.body);

// 3. Domain logic (Firestore Admin SDK)

// 4. Response
res.status(200).json({ data: result });
```

Build and test the function locally using the Firebase emulator suite.

### Step 2 — Deploy to staging

```bash
firebase use wolf-dev
firebase deploy --only functions
```

Run the staging validation checklist (§4) for this domain.

### Step 3 — Rewrite the service file(s)

Replace the existing service method implementations with `apiClient` calls.
The service file's public interface (method names, parameters, return shapes)
does not change. Only the implementation changes.

```js
// Before (Phase 2 — direct Firestore):
async getProfile() {
  const doc = await db.collection('users').doc(uid).get();
  return doc.data();
}

// After (Phase 3 — API client):
async getProfile() {
  return apiClient.get('/users/me');
}
```

The calling code (React Query hooks, screens) does not change.

### Step 4 — Smoke test locally

Run the PWA and creator dashboard locally against the staging Cloud Function
(`pwa:dev` proxies to the local emulator; point it at staging for this test).
Verify the domain works end-to-end with real data from staging.

### Step 5 — Deploy to staging (full stack)

```bash
firebase use wolf-dev
firebase deploy --only functions,hosting
```

Perform the full staging validation for this domain (§4).

### Step 6 — Deploy to production

```bash
firebase use wolf-20b8b
firebase deploy --only functions,hosting
```

### Step 7 — Verify in production

Open the production app. Perform the smoke test for this domain (§4 — quick
version, just the happy path). Confirm no errors in Firebase Functions logs.

### Step 8 — Mark domain as migrated

Update the migration status table in `API_STRATEGY_PRE_INVESTIGATION.md` to
reflect the completed domain. Commit and push.

---

## 4. Staging Validation Checklist

For each domain, complete this checklist on staging before deploying to production.

### Auth
- [ ] Login with email/password succeeds, token is returned
- [ ] Login with invalid credentials returns `INVALID_CREDENTIALS` (401)
- [ ] Signup creates a new user in Firebase Auth and Firestore
- [ ] Duplicate email returns `EMAIL_IN_USE` (409)
- [ ] `/auth/me` returns the correct profile for the authenticated user
- [ ] Logout invalidates the session (subsequent requests return 401)
- [ ] Token refresh works after 1 hour (manual test: force expire the token)

### Profile
- [ ] `GET /users/me` returns full profile
- [ ] `PATCH /users/me` updates display name, country, city
- [ ] Profile photo upload flow: request signed URL → upload to Storage → confirm
- [ ] Duplicate username returns `USERNAME_TAKEN` (409)
- [ ] Profile changes are reflected immediately on next `GET /users/me`

### Nutrition
- [ ] Food search returns results (FatSecret proxy works)
- [ ] Food search results are cached (second search for same term = faster)
- [ ] Barcode lookup returns a food result
- [ ] Log food entry: `POST /nutrition/diary`
- [ ] Diary entry appears in `GET /nutrition/diary?date=today`
- [ ] Edit diary entry: `PATCH /nutrition/diary/{id}`
- [ ] Delete diary entry: `DELETE /nutrition/diary/{id}`
- [ ] Saved foods: add, list, remove
- [ ] Offline diary logging: go offline, log food, reconnect, verify sync

### Progress / Lab
- [ ] `PUT /progress/readiness/{date}` creates or updates the entry
- [ ] `GET /progress/readiness/{date}` returns the entry
- [ ] Body weight log: create, list, paginate
- [ ] PR history: `GET /progress/prs` returns correct PRs
- [ ] Offline body log: go offline, log weight, reconnect, verify sync

### Workout
- [ ] `GET /workout/daily` returns today's session with full exercise/set tree
- [ ] Session checkpoint: complete a set, verify `localStorage` is written
- [ ] Session checkpoint: quit app mid-session, reopen, verify recovery modal
- [ ] `POST /workout/complete` completes session atomically
- [ ] Session appears in `GET /workout/history` after completion
- [ ] Streak is updated correctly after completion
- [ ] Analytics: `GET /analytics/weekly-volume` returns correct data
- [ ] Offline completion: complete workout offline, reconnect, verify sync
- [ ] Cross-device checkpoint: complete sets on device A, open on device B, verify recovery

### Creator
- [ ] Client list: `GET /creator/clients`
- [ ] Client detail: session history, progress, activity
- [ ] Program list, create, edit, duplicate
- [ ] Library session: create, edit, delete
- [ ] Nutrition plan assignment
- [ ] Booking management
- [ ] Creator cannot access another creator's data (verify with two test accounts)

---

## 5. Rollback Procedure

A rollback means reverting the service file(s) to the previous implementation.
The Cloud Function endpoints remain deployed — they are additive and do not
break anything by being present even if unused.

### When to roll back

- A staging validation item cannot be made to pass within a reasonable debugging
  session (> 2 hours of investigation without root cause)
- A production deploy introduces a regression visible to users

### How to roll back

```bash
# 1. Revert the service file(s) to the previous version
git revert <commit> --no-edit

# 2. Deploy only hosting (function stays deployed — it's harmless)
firebase use wolf-20b8b
firebase deploy --only hosting

# 3. Verify the revert resolved the issue
```

The reverted service file calls Firestore directly again. The Cloud Function
endpoint remains in `functions/src/index.ts` — do not delete it. It will be
debugged and re-deployed.

### Root cause before retry

Do not re-attempt the migration for a domain until the root cause of the failure
is understood and fixed. Document the issue and the fix. A second failed deploy
for the same domain undermines confidence in the migration process.

---

## 6. Data Migration

There is no data migration. The Phase 3 migration is a **code migration**, not
a schema migration. The Firestore documents remain exactly as they are. Cloud
Functions read and write the same Firestore schema that the direct SDK calls used.

The API layer is a thin wrapper over the existing Firestore structure. Do not
restructure Firestore documents during the migration. If a Firestore schema
change is needed, it is a separate project, discussed separately.

The one exception is new data created by new Phase 3 endpoints (e.g.,
`users/{userId}/activeSession/current` for session checkpoints). This new data
has no legacy equivalent and does not require migration.

---

## 7. `hybridDataService` Deletion

`hybridDataService` is the legacy offline cache. It is not deleted during any
individual domain migration. It is deleted only when **all domains** have been
migrated — after Phase 6 (Creator) is confirmed stable in production.

Until then, `hybridDataService` remains intact and functional. Do not partially
gut it. If a domain's service file no longer calls `hybridDataService`, the
method may remain unused but is not removed until the full deletion.

At the end of Phase 6:

```bash
# 1. Delete hybridDataService
rm apps/pwa/src/services/hybridDataService.js

# 2. Search for any remaining imports and remove
grep -r "hybridDataService" apps/pwa/src/

# 3. Delete webStorageService if it was only used by hybridDataService
# (verify first)

# 4. Deploy
firebase deploy --only hosting
```

---

## 8. Timeline Expectations

No timeline is set. This migration is driven by correctness and architecture
quality, not a deadline. Each domain migration is complete when its staging
validation checklist passes fully — not before.

A rough effort estimate per domain for a single developer:

| Domain | Estimated effort |
|---|---|
| Auth | 1–2 days |
| Profile | 1 day |
| Nutrition | 2–3 days (FatSecret cache adds work) |
| Progress / Lab | 1 day |
| Workout | 3–4 days (session checkpoint, offline, analytics) |
| Creator | 3–5 days (most endpoints, most test cases) |

Total: approximately 2–3 weeks of focused development, plus staging validation
time. These estimates do not account for debugging.
