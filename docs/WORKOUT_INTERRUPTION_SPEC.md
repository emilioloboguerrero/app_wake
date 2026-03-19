# Wake — Workout Session Interruption & Recovery Specification

All decisions here are locked. This document covers:
1. The session checkpoint schema (what is persisted and where)
2. The persistence strategy (when and how state is saved)
3. The recovery flow (how interrupted sessions are detected and restored)
4. The three new API endpoints that support cross-device recovery
5. The UI/UX of the recovery experience

Read this before modifying `WorkoutExecutionScreen`, `sessionService`, or the
`/workout/session/*` API endpoints.

---

## 1. Problem Statement

Session state in `WorkoutExecutionScreen` is entirely in-memory (`useState`).
Any interruption — phone call, accidental tab close, browser refresh, background
kill on mobile — destroys all in-progress data. The user loses every set they
logged and must start over.

This is the highest-impact reliability gap in the PWA. Users who lose sessions
mid-workout are the most likely to churn.

---

## 2. Design Principles

- **Local-first.** The primary persistence mechanism is `localStorage`. It is
  synchronous, always available, and survives tab closes. The API is secondary.
- **Zero-latency checkpoints.** Saving a checkpoint must not block the UI or
  cause a re-render. It is a fire-and-forget side effect.
- **Single recovery moment.** The recovery prompt is shown exactly once: when
  the user opens the app and a stale checkpoint exists. It is never shown during
  an active session.
- **No forced continuation.** The user can always discard the checkpoint and
  start fresh. Recovery is an offer, not a requirement.
- **Cross-device is best-effort.** `localStorage` is per-device. The API
  checkpoint endpoint enables cross-device recovery as an enhancement, but the
  local path is the primary one and must work without network.

---

## 3. Checkpoint Schema

### 3.1 localStorage Key

```
wake_session_checkpoint
```

One key, one value. Only one session can be in progress at a time. If a new
session starts while a checkpoint exists, the old checkpoint is overwritten.

### 3.2 Schema

```json
{
  "version": 1,
  "userId": "firebase-uid",
  "courseId": "course-abc123",
  "sessionId": "session-xyz789",
  "sessionName": "Día A — Empuje",
  "startedAt": "2026-03-15T14:23:00.000Z",
  "savedAt": "2026-03-15T14:31:47.000Z",
  "currentExerciseIndex": 2,
  "currentSetIndex": 1,
  "exercises": [
    {
      "exerciseId": "ex-001",
      "exerciseName": "Press de banca",
      "sets": [
        { "reps": null, "weight": null, "intensity": null }
      ]
    }
  ],
  "completedSets": {
    "0_0": { "reps": 10, "weight": 80, "intensity": null },
    "0_1": { "reps": 9,  "weight": 80, "intensity": null },
    "1_0": { "reps": 12, "weight": 60, "intensity": null },
    "2_0": { "reps": 8,  "weight": 100, "intensity": null }
  },
  "userNotes": "",
  "elapsedSeconds": 512
}
```

### 3.3 Field Definitions

| Field | Type | Description |
|---|---|---|
| `version` | number | Schema version. Currently `1`. Used for forward compatibility. |
| `userId` | string | Firebase UID. Used to reject stale checkpoints from other accounts on shared devices. |
| `courseId` | string | Firestore course ID. Used to reload the full program context on recovery. |
| `sessionId` | string | Firestore session ID within the program. |
| `sessionName` | string | Display name shown in the recovery modal. |
| `startedAt` | ISO string | When the session was first initiated. Used to compute elapsed time on resume. |
| `savedAt` | ISO string | When this checkpoint was written. Used to detect stale checkpoints (>24h discarded automatically). |
| `currentExerciseIndex` | number | Index into the `exercises` array at the moment of save. |
| `currentSetIndex` | number | Index into the current exercise's sets at the moment of save. |
| `exercises` | array | Full exercise list (name, exerciseId, sets template). Stored here so recovery does not require a Firestore read. |
| `completedSets` | object | Map of `"{exerciseIndex}_{setIndex}"` → `{ reps, weight, intensity }`. Only completed sets are stored. |
| `userNotes` | string | Notes the user typed before interruption. |
| `elapsedSeconds` | number | Active elapsed seconds at the moment of save (excluding rest timer). |

### 3.4 Stale Checkpoint Policy

A checkpoint older than **24 hours** (`savedAt`) is silently discarded on app
load. It is removed from `localStorage` without prompting the user. A 24-hour
session is not recoverable in a meaningful way.

---

## 4. When Checkpoints Are Written

Checkpoints are written (fire-and-forget, synchronous `localStorage.setItem`)
on the following events:

| Event | Trigger |
|---|---|
| **Set completed** | User taps the "Completar" button for any set |
| **Exercise advanced** | User moves to the next exercise |
| **Notes updated** | User stops typing in the notes field (debounced 2s) |
| **Page visibility change** | `document.addEventListener('visibilitychange')` — fires when tab is hidden or phone screen locks |
| **Page hide** | `window.addEventListener('pagehide')` — fires on tab close, navigation away, or mobile kill |

The `beforeunload` event is intentionally **not** used. It is unreliable on mobile
browsers and fires for too many false positives (form submissions, link clicks).
`pagehide` is the correct event for this use case.

Checkpoint writes are **not** debounced on set completion. The user has just
performed a set — persisting immediately is correct.

### 4.1 Session Initiation

When `WorkoutExecutionScreen` mounts and begins a new session, it writes an
initial checkpoint immediately (before the user completes any set). This ensures
even a session that is abandoned after mounting has a recoverable state.

The initial checkpoint has `completedSets: {}` and `currentExerciseIndex: 0`.

### 4.2 Session Completion

On successful `POST /workout/complete` (or the current `sessionService.completeSession`
pre-migration), the checkpoint is **deleted** from `localStorage`:

```js
localStorage.removeItem('wake_session_checkpoint');
```

This is the only path that removes the checkpoint. If completion fails, the
checkpoint is preserved so the user can retry.

---

## 5. Recovery Flow

### 5.1 Where Recovery Is Checked

Recovery is checked in `DailyWorkoutScreen` on mount, not in `WorkoutExecutionScreen`.
This is intentional: the user navigates to the daily workout first, and the recovery
prompt intercepts that navigation.

Checking in `DailyWorkoutScreen` means:
- The user sees the recovery prompt in a calm, non-active context.
- `WorkoutExecutionScreen` does not need to handle two states (new session vs resumed session).

### 5.2 Recovery Check Logic

```
On DailyWorkoutScreen mount:

1. Read localStorage.getItem('wake_session_checkpoint')
2. If null → no recovery, proceed normally
3. Parse JSON. If malformed → delete key, proceed normally
4. If checkpoint.userId !== currentUser.uid → delete key, proceed normally
5. If now - checkpoint.savedAt > 24h → delete key, proceed normally
6. If checkpoint.courseId !== this course's courseId → ignore (different course)
7. Otherwise → show RecoveryModal
```

Step 6 is important: if the user is viewing a different course than the one in
the checkpoint, the recovery prompt does not show. The checkpoint persists until
the user views the matching course.

### 5.3 Recovery Modal

A modal overlay (not a full screen) with:

```
┌─────────────────────────────────────────────────────┐
│                                                     │
│   Sesión incompleta                                 │
│                                                     │
│   Tienes una sesión de "{sessionName}"              │
│   iniciada hace {timeAgo}. ¿Continuar?              │
│                                                     │
│   Progreso: {N} series completadas                  │
│                                                     │
│          [Descartar]    [Continuar sesión]           │
│                                                     │
└─────────────────────────────────────────────────────┘
```

- `{timeAgo}` — human-readable: "hace 12 minutos", "hace 2 horas"
- `{N} series completadas` — `Object.keys(checkpoint.completedSets).length`
- **Descartar** — deletes checkpoint, proceeds to DailyWorkoutScreen normally
- **Continuar sesión** — navigates to WorkoutExecutionScreen with checkpoint data
  passed in navigation state

### 5.4 State Restoration in WorkoutExecutionScreen

When `WorkoutExecutionScreen` receives a checkpoint in its route params:

```js
// route.params.checkpoint is the parsed checkpoint object, or null

if (route.params?.checkpoint) {
  // Restore all state from checkpoint
  setWorkout(buildWorkoutFromCheckpoint(checkpoint));
  setSetData(checkpoint.completedSets);
  setCurrentExerciseIndex(checkpoint.currentExerciseIndex);
  setCurrentSetIndex(checkpoint.currentSetIndex);
  setUserNotes(checkpoint.userNotes);
  setElapsedSeconds(checkpoint.elapsedSeconds);
  // sessionStartedAt is set to checkpoint.startedAt (not now)
}
```

`buildWorkoutFromCheckpoint` reconstructs the full workout object from the stored
`exercises` array. Because exercises are stored in the checkpoint, no Firestore
read is needed for restoration — the screen renders immediately.

---

## 6. API Endpoints for Cross-Device Recovery

These three endpoints enable a user who starts a session on one device to recover
on another. They are secondary to `localStorage` — the local path always takes
precedence if a checkpoint exists locally.

All three require `Authorization: Bearer <Firebase ID token>`.

---

### 6.1 Save Checkpoint

```
POST /workout/session/checkpoint
```

**When called:** On every set completion (debounced to at most once per 10 seconds
to avoid Firestore write spam). Not called on `pagehide` or `visibilitychange`
— those paths write to `localStorage` only (synchronous, no network latency).

**Auth:** Firebase ID token

**Request body:**
```json
{
  "courseId": "course-abc123",
  "sessionId": "session-xyz789",
  "sessionName": "Día A — Empuje",
  "startedAt": "2026-03-15T14:23:00.000Z",
  "currentExerciseIndex": 2,
  "currentSetIndex": 1,
  "exercises": [ ... ],
  "completedSets": {
    "0_0": { "reps": 10, "weight": 80, "intensity": null }
  },
  "userNotes": "",
  "elapsedSeconds": 512
}
```

**Behavior:**
- Upserts a single document at `users/{userId}/activeSession/current`.
- Overwrites the previous checkpoint entirely.
- Adds server-side `savedAt` timestamp.

**Response (200):**
```json
{ "saved": true }
```

**Errors:**

| Code | Status | Meaning |
|---|---|---|
| `VALIDATION_ERROR` | 400 | Missing required fields |
| `UNAUTHENTICATED` | 401 | Invalid token |

---

### 6.2 Get Active Session (Cross-Device Recovery)

```
GET /workout/session/active
```

**When called:** On `DailyWorkoutScreen` mount, after the `localStorage` check.
If `localStorage` has no checkpoint, the app queries this endpoint to check for
a checkpoint saved from another device.

**Auth:** Firebase ID token

**Response (200 — checkpoint exists):**
```json
{
  "checkpoint": {
    "courseId": "course-abc123",
    "sessionId": "session-xyz789",
    "sessionName": "Día A — Empuje",
    "startedAt": "2026-03-15T14:23:00.000Z",
    "savedAt": "2026-03-15T14:31:47.000Z",
    "currentExerciseIndex": 2,
    "currentSetIndex": 1,
    "exercises": [ ... ],
    "completedSets": { ... },
    "userNotes": "",
    "elapsedSeconds": 512
  }
}
```

**Response (200 — no active checkpoint):**
```json
{ "checkpoint": null }
```

**Errors:**

| Code | Status | Meaning |
|---|---|---|
| `UNAUTHENTICATED` | 401 | Invalid token |

**Notes:**
- Stale checkpoints (> 24h) are returned as `null`. The server applies the same
  24-hour policy as the client.
- The `courseId` filter is not applied server-side. The client applies the
  same course-matching logic described in §5.2 step 6.

---

### 6.3 Delete Active Session

```
DELETE /workout/session/active
```

**When called:**
1. When the user taps "Descartar" in the recovery modal (both local and API checkpoint deleted).
2. On successful workout completion (alongside the `localStorage` removal).

**Auth:** Firebase ID token

**Response (200):**
```json
{ "deleted": true }
```

**Response (200 — nothing to delete):**
```json
{ "deleted": false }
```

Returns 200 in both cases. Idempotent.

**Errors:**

| Code | Status | Meaning |
|---|---|---|
| `UNAUTHENTICATED` | 401 | Invalid token |

---

## 7. Firestore Document

The active session checkpoint is stored at:

```
users/{userId}/activeSession/current
```

Fields match the checkpoint schema (§3.2) plus a server-side `savedAt` timestamp.
The `activeSession` subcollection has a single document `current`. It is created
on first checkpoint, overwritten on each subsequent checkpoint, and deleted on
completion or discard.

Security rule:
```
match /users/{userId}/activeSession/{doc} {
  allow read, write: if request.auth.uid == userId;
}
```

---

## 8. Elapsed Time Across Interruptions

`elapsedSeconds` in the checkpoint is the number of seconds the user was actively
in the session (not counting rest timer). On resume:

```
displayedElapsedTime = checkpoint.elapsedSeconds
sessionResumedAt = now
currentElapsed = checkpoint.elapsedSeconds + (now - sessionResumedAt)
```

The gap between `savedAt` and `now` (the interruption duration) is **not** added
to `elapsedSeconds`. The displayed timer reflects active workout time only.

---

## 9. Edge Cases

| Scenario | Behavior |
|---|---|
| App crashes during `localStorage.setItem` | Atomic in all modern browsers. No partial writes. |
| User completes session on device A, then opens device B which has the API checkpoint | `GET /workout/session/active` returns the checkpoint. But the daily workout screen shows the session as already completed (from `GET /workout/daily`). DailyWorkoutScreen detects this and does not show the recovery modal. |
| Two tabs open simultaneously | Both tabs write to the same `localStorage` key. Last write wins. No coordination needed. |
| User clears browser storage | Checkpoint is lost. Recovery modal never appears. Session is lost. Acceptable — this is an explicit user action. |
| Checkpoint `version` is unknown | Silently discard. A future spec version bump requires handling old checkpoints. |
| Session completion API call fails | Checkpoint is preserved. User can retry completion. The screen shows an error state with a "Intentar de nuevo" button. |
