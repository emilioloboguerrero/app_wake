# Periodized nutrition programs — May 2026 archive

Archived 2026-05-01. Branch: `security-fix-campaign`. Commit: `3034647`.

This directory documents the design, implementation, and audit of the
multi-week nutrition program feature. The feature was scoped, built, and
audited in a single session before any of the code was tested in the running
app — the audit notes here are the result of three deep-dive passes over
the diff, not user-reported bugs.

## What shipped

A nutrition "plan" is now a multi-week sequence of days-of-eating, mirroring
the workout-program pattern that already exists for training. Coaches can
assign either:

- **Single day, indefinitely** (current behavior, default — back-compat for
  existing assignments).
- **Multi-week program** with a start date that loops once exhausted.

The PWA contract is unchanged. Server resolves the right day-of-eating per
date and returns the same flat `plan` shape the app already consumes.

## Vocabulary (post-rename)

| User-facing label | DB collection | What it is |
|---|---|---|
| Día de alimentación | `creator_nutrition_library/{creatorId}/plans/{planId}` | A single day with categories, meals, options. Same as before — only the UI label changed. |
| Plan nutricional | `creator_nutrition_library/{creatorId}/programs/{programId}` | New. Multi-week sequence: `{ name, description, weeks: [{ days: [dayId × 7] }] }`. |
| Asignación de plan | `nutrition_assignments/{id}` | Per-client assignment. Now carries `mode: 'single_day' \| 'program'`. |
| Snapshot | `client_nutrition_plan_content/{assignmentId}` | Frozen content at assignment time. For programs, embeds the full day content for every populated slot. |

The word "plan" was deliberately reassigned from the day-level to the
program-level. The DB collection name `plans` was kept (renaming is risky;
the data shape is unchanged).

## Architecture decisions

These were the explicit choices made up front, with the trade-off considered
in each case.

**1. Programs stored as a single document, not nested subcollections.**
Workout programs nest (`courses/.../modules/.../sessions/...`) because each
session is heavy (exercises, sets, library refs). A nutrition program is
references-only — `{ days: [dayId × 7] }` per week. A 52-week program of
references is well under Firestore's 1 MiB doc limit. One read for the
whole builder UI, atomic week reorder, no subcollection cleanup on delete.

**2. Snapshot the full day content at assignment time.**
At assignment, every populated `dayId` is dereferenced and the full day
content is embedded into `client_nutrition_plan_content`. Coach edits to
day-of-eating templates after assignment do not retroactively change a
client's past Wednesday targets. Mirrors the workout `client_plan_content`
pattern. Trade-off: snapshot size grows with program length × per-day
content. Mitigated by a 900 KB cap (see below).

**3. Default to "loop" when a program outlasts its weeks.**
A 4-week cut block restarts at week 1 indefinitely. No `repeatBehavior`
config field until a coach asks for stop-at-end. `weekIndex = floor(daysSinceStart / 7) % weeks.length`.

**4. Mode field on the assignment doc, not a synthetic single-week program.**
Could have unified single-day and program by treating single-day as a 1-week
program. Rejected: the simple case must stay simple in the UI. `mode:
'single_day' | 'program'` keeps the common-path code unchanged.

**5. PWA service unchanged.**
The resolver in `GET /nutrition/assignment` returns the same flat plan shape
regardless of mode. The PWA's `getEffectivePlanForUser` doesn't know whether
a program is involved. Day-of-eating routing is server-side.

**6. No per-day calendar override (deferred).**
The user's spec included calendar-level day swaps for one-on-one clients.
Not built in this turn. Coaches can re-assign to switch programs; per-date
overrides are a follow-up feature requiring a calendar UI extension on
`ClientNutritionTab`.

## Files changed

### Backend

| File | What changed |
|---|---|
| `functions/src/api/routes/creator.ts` | New `/creator/nutrition/programs` CRUD endpoints. Extended `POST /creator/clients/:clientId/nutrition/assignments` to accept `mode: 'program'` + `programId` + `startDate`, snapshotting full day content. Mode-aware allowlist on assignment PATCH (program-mode rejects `planId`/`planName`). PUT content endpoints reject program-mode bodies. `validateDateFormat` on PATCH `startDate`/`endDate`. Program PATCH requires all three fields explicitly. 900 KB snapshot size cap. |
| `functions/src/api/routes/nutrition.ts` | `GET /nutrition/assignment` resolver detects program-mode snapshots and substitutes today's day before building the response. Single-day path byte-identical. |
| `functions/src/api/routes/analytics.ts` | Coach dashboard per-program adherence (`/analytics/programs`) + per-client lab adherence and macro trends now use per-date target lookups for program mode. Rest-day slots excluded from adherence denominator. Aggregate `target` for non-trend display = average across populated days. |
| `functions/src/api/services/nutritionProgramResolver.ts` | New shared helper. `isProgramSnapshot`, `resolveProgramDay`, `programHasAnyMacroTarget`. Used by all three call sites above (one source of truth for the date → day math). |
| `config/firebase/firestore.rules` | Added explicit rule for `creator_nutrition_library/{creatorId}/programs/{programId}` (matches `meals`/`plans` siblings). API uses Admin SDK so default-deny would have worked; explicit rule documents intent. |

### Creator dashboard

| File | What changed |
|---|---|
| `apps/creator-dashboard/src/screens/BibliotecaScreen.jsx` | Added `programas_nutri` tab. Existing `planes_nutri` relabeled to "Días de alimentación". `createNutriProgramMutation` + create overlay. |
| `apps/creator-dashboard/src/components/biblioteca/NutritionProgramsPanel.jsx` | New. List view of programs (mirrors `NutritionPlansPanel.jsx`). |
| `apps/creator-dashboard/src/screens/NutritionProgramEditorScreen.jsx` | New. Builder: name + description + weeks list with 7-day grid per row. Slot picker over creator's day-of-eating library. Add / duplicate / delete week. Explicit save (no autosave). |
| `apps/creator-dashboard/src/screens/NutritionProgramEditorScreen.css` | Styles for the builder. Dark cinematic per `docs/STANDARDS.md`. |
| `apps/creator-dashboard/src/components/client/ClientNutritionTab.jsx` | Mode toggle ("Día único" / "Plan multi-semana") on the assign flow; date input for program start; program-mode active-assignment view shows program metadata and routes Edit to the program editor. |
| `apps/creator-dashboard/src/components/client/ClientNutritionTab.css` | Styles for mode toggle + start-date input. |
| `apps/creator-dashboard/src/services/nutritionFirestoreService.js` | `getProgramsByCreator`, `getProgramById`, `createProgram`, `updateProgram`, `deleteProgram`, `createProgramAssignment`. `getAssignmentsByUser` shape now passes through `mode`, `programId`, `programName`, `weekCount` (was stripping these — the critical bug fixed in audit pass 1). |
| `apps/creator-dashboard/src/config/queryClient.js` | Added `nutrition.programs(creatorId)` and `nutrition.program(creatorId, programId)` query keys. |
| `apps/creator-dashboard/src/App.jsx` | Route registration: `/nutrition/programs/:programId`. |

### PWA

| File | What changed |
|---|---|
| `apps/pwa/src/screens/LabScreen.js` | `nutrition.plan` query key now includes today's date, so program-mode plans refetch across midnight. No-op for single-day. |

## Audit findings (three passes)

Total: **11 issues** (1 critical, 4 high, 4 medium, 2 low/consistency). Every
issue was caught from reading the diff before any user-facing testing.

### Pass 1 — initial audit

| # | Sev | Issue | Fix |
|---|---|---|---|
| 1 | Critical | `getAssignmentsByUser` shape stripped `mode`/`programId`/`programName`/`weekCount`. Every program-mode assignment would have rendered as single-day in the client view; the `isProgramAssignment` check was dead code. | Added the four fields to the shape function with a fallback (`mode: a.mode ?? (a.programId ? 'program' : 'single_day')`) so legacy assignments without the field are also correctly inferred. |
| 2 | High | Snapshot size could exceed Firestore's 1 MiB doc limit. Realistic 12-week program with rich days (~12 KB each) reaches ~1 MB; longer or richer fails silently with no actionable error. | Added a JSON-size cap of 900 KB on the snapshot's `weeks` field with a clear error message. |
| 3 | Medium | Both `/.../content` PUT endpoints accept the single-day shape and would clobber a program snapshot if any code path posted to them. UI doesn't currently do this, but defensive guards are cheap. | Both endpoints now reject when `assignment.mode === 'program'`. |
| 4 | Medium | PATCH assignment endpoint allowlists `startDate`/`endDate` but didn't `validateDateFormat`. A bad date would crash `Date.parse` in the program-mode resolver. | `validateDateFormat` added for both fields. |

### Pass 2 — data shape consistency

| # | Sev | Issue | Fix |
|---|---|---|---|
| 5 | High | PATCH assignment allowlist included `planId` for all modes. For a program-mode assignment, `currentPlanId` is undefined, so any PATCH with `planId` would trigger the re-snapshot path and overwrite the program snapshot with single-day shape. The assignment ends up corrupted: `mode: 'program'` + `programId: 'X'` + `planId: 'Y'` + `plan: {...}`. | Allowlist now mode-aware: program-mode only accepts `status`/`startDate`/`endDate`. To switch programs, delete + reassign. |
| 6 | Medium | Program PATCH validator silently defaulted missing fields. A PATCH with `{name: 'X'}` would wipe `description` and `weeks`. Frontend always sends all three, but defensive guard cheap. | Validator requires all three fields explicitly; missing field throws `VALIDATION_ERROR`. |
| 7 | Low | Snapshot field `weekCount` was camelCase but every other field in the same doc is snake_case (`source_program_id`, `assignment_id`, `snapshot_at`, `creator_id`, `client_id`). | Renamed to `week_count`. The assignment doc keeps `weekCount` (camel) which matches its sibling fields like `startDate`/`createdAt`. Each doc now internally consistent. |
| 8 | Medium | `LabScreen.js` query key was `['nutrition', 'plan', uid]` with no date. For single-day this didn't matter (date-independent content); for program mode the resolved day changes daily. A user keeping LabScreen open across midnight would see yesterday's day until staleTime expired. | Added today's ISO date to the query key. No-op for single-day; correct for program mode. |

### Pass 3 — broader codebase audit

| # | Sev | Issue | Fix |
|---|---|---|---|
| 9 | High | `analytics.ts:601` (coach dashboard `/analytics/programs` per-program nutrition adherence) read `c.daily_calories` / `c.daily_protein_g` directly from the snapshot. Program-mode snapshots have those fields per-day inside `weeks[].days[].daily_*`, not at the top level. Result: every coach with a client on a program-mode plan saw `nutritionAdherence: null`. | Per-date target lookup via `resolveProgramDay`. Rest-day slots (no target) excluded from the adherence denominator. |
| 10 | High | `analytics.ts:1483` (per-client lab `target`) had the same bug. Cascaded into the creator-dashboard `ClientNutritionTab` showing "no data" — flagged in pass 1 as a known limitation; root cause was here. | Per-date target via `resolveProgramDay` for `caloriesTrend`/`macrosTrend`/adherence. Aggregate `target` for the non-trend display now = average across populated days. |
| 11 | Low | No explicit Firestore rule for the new `programs` subcollection. Default-deny worked (API uses Admin SDK, client direct access blocked), but inconsistent with `meals`/`plans` siblings. | Explicit rule added. |

### Audited and clean (no changes needed)

- **`validateBody`** strips unknown fields (`stripUnknown: true` default). Handler reads `mode` off `req.body` BEFORE the strip, so the field is captured.
- **`dataIntegrity.ts`** uses `source === 'program'` for the legacy workout-program-scoped concept (different from `mode === 'program'`). Program-mode assignments have `userId` set and `clientUserId` matching, so they pass the integrity scans as client-scoped.
- **`profile.ts` pinned-assignment auto-heal** is mode-agnostic.
- **`enrollmentLeave.ts`** queries by `userId` + `assignedBy` only — mode-agnostic.
- **`workout.ts` references to `assignment.planId`** are on a different collection (`client_plan_assignments`, the workout system).
- **`propagate` endpoint** queries `where('planId', '==', X)` — program-mode docs have no top-level `planId`, correctly excluded.

### Pre-existing issues flagged but not fixed

These pre-date my changes and were left alone for scope discipline:

- `LabScreen.web.js:1495` `mainQuery` key has the same date-staleness issue for diary/session counts. Pre-existing for those metrics.
- `BibliotecaScreen.jsx:336` prefetches `nutrition.plans` on domain switch but not `nutrition.programs`. Cosmetic — first click on the Planes tab shows a brief loading skeleton.
- `assignments-by-plan?sourcePlanId=X` query won't surface program-mode assignments that include the given day. Coach asking "which clients have assignments using this day-of-eating?" misses program references. Documented as a known capability gap.
- For LabScreen.web.js' `/analytics/client-lab` aggregate `target` for program mode = average across populated days. A bulking program with 5 high-cal days + 2 rest days gets an averaged target. Per-date adherence is correct; the static aggregate is an approximation.

## Known limitations and deferred work

These were intentionally deferred. Each is a cleanly scoped follow-up.

1. **Per-day calendar override on the one-on-one client view.** The user's
   original spec included a calendar where coaches could swap an individual
   date for a different day-of-eating. Coaches can assign a program but can't
   yet override a specific date. Needs the client calendar UI extension and
   a per-date override field on the snapshot.
2. **Week reorder (drag-and-drop)** in the program builder. Only add /
   duplicate / delete shipped.
3. **Propagation of day-of-eating template edits to active program
   assignments.** Coaches can re-assign to refresh, mirroring the existing
   single-day flow before the propagate endpoint existed.
4. **Mode switching via PATCH.** Coaches can't switch a client between
   single-day and program modes via PATCH — they delete + reassign. Same
   model as workout plan reassignment.
5. **Unsaved-changes warning in the editor.** Navigating away from the
   builder with unsaved state silently loses the changes.
6. **Date-range PATCH validation for `endDate < startDate`.** Range sanity
   not currently enforced on the backend.
7. **Program builder — no library prefetch.** First open of the day picker
   inside the builder may show a brief loading state if the
   day-of-eating library wasn't already in cache.

## Test plan (manual)

The user has not yet exercised any of this. Recommended test sequence,
in order:

1. **Library — create program.** Biblioteca > Nutrición > "Planes
   nutricionales" > Crear plan. Confirm program appears in the list.
2. **Library — edit program.** Open the new program. Add 4 weeks. Fill
   each week with 4–5 different days of eating. Save. Reload. Confirm
   structure persists.
3. **Library — duplicate week.** Click duplicate on Week 2. Verify Week 3
   becomes a copy of Week 2 and old Week 3 becomes Week 4.
4. **Library — delete program.** Delete the program. Verify it disappears
   from the list and the snapshot remains intact for any active
   assignments (the API blocks delete if active assignments exist).
5. **Client — single-day flow regression.** Open a one-on-one client →
   Nutrición tab. With no plan assigned, mode toggle defaults to "Día
   único". Assign a day-of-eating. Verify the active assignment renders
   correctly. Open the PWA as that client. Verify today's plan loads.
6. **Client — program flow.** Remove the assignment. Toggle to "Plan
   multi-semana". Pick a start date (today). Assign the program created
   above. Verify active assignment shows program name + week count.
7. **PWA — program day resolution.** Open the PWA as the client. Verify
   today's plan = program week 1 day 0 (Monday) — or whatever day of
   week today is. Change device date forward by 7 days, refresh.
   Verify week 2 day 0 loads.
8. **PWA — across midnight.** Leave the LabScreen open in the PWA.
   Cross midnight. Verify the displayed plan refetches and reflects the
   new day (this validates the `LabScreen.js` query-key fix).
9. **Analytics — adherence appears.** As the coach, log into the
   dashboard. Verify the per-program adherence card shows a number for
   the program-assigned client (not "—" / null).
10. **Edit program after assignment.** Open the program editor. Change
    a week. Save. Verify the existing client's snapshot is unchanged
    (deliberate: snapshots don't refresh — the user must re-assign).

## Commit reference

Single commit `3034647` on `security-fix-campaign`:

```
feat(nutrition): periodized multi-week nutrition programs

15 files changed, 1761 insertions(+), 67 deletions(-)
```

Co-authored by Claude Opus 4.7 (1M context).
