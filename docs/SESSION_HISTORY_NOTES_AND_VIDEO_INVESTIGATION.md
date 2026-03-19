# Session History, Notes, and Video System — Investigation

This document summarizes the current data structures and flows for session history, and defines **session notes** (all programs) with concrete implementation steps. **User/creator video exchange** (one-on-one) is described as a future add-on, with all video-to-session/exercise/set associations **optional**.

---

## 1. Current Session History Data Structure

### 1.1 Storage location and document shape

- **Path:** `users/{userId}/sessionHistory/{sessionId}`
- **Firestore rules:** Owner can read/write; creator can **read** (for their one-on-one clients via `creator_client_access`). No subcollections under sessionHistory in current design.

**Document fields (current):**

| Field | Type | Description |
|-------|------|-------------|
| `sessionId` | string | Same as doc id (used as completion key). |
| `courseId` | string | Program ID. |
| `courseName` | string | Display name. |
| `sessionName` | string | Session title. |
| `completedAt` | string | ISO date. |
| `duration` | number | Minutes. |
| `exercises` | map | Keys = `libraryId_exerciseName`. Values = `{ exerciseName, sets: [{ reps, weight, intensity, ... }] }`. |
| `planned` | object (optional) | When present: `{ exercises: [{ id, title, name, primary, sets }] }` — snapshot of planned session at completion (immune to plan/library edits). |

There is **no** `notes` or `userNotes` field today. The doc is written **once** at completion via `setDoc` in `exerciseHistoryService.updateSessionHistory()`; there is no existing flow that updates a sessionHistory doc after creation.

### 1.2 How sessionId is determined (one-on-one vs general)

- **Low-ticket / general:** Session id = program session id from course structure; stored in the session and used as the sessionHistory doc id when the user completes.
- **One-on-one with plan:** Plan slot id `{userId}_{courseId}_{weekKey}_{session_id}` (or `client_sessions` doc id when no plan week). Set in `workoutProgressService.getCourseDataForWorkout()` as `plannedSessionIdForToday`; propagated so the creator dashboard can match completions to the calendar.

### 1.3 Completion flow (what is sent)

- **WorkoutExecutionScreen** builds `workoutWithSetData`, then calls `sessionService.completeSession(userId, courseId, workoutWithSetData, { plannedWorkout: workout })`.
- **sessionService.completeSession** normalizes payload, updates course progress, builds planned snapshot, then calls **exerciseHistoryService.addSessionData(userId, actualSessionData, plannedSnapshot)**.
- **exerciseHistoryService** writes `users/{userId}/exerciseHistory/{exerciseKey}` per exercise and **one** doc to `users/{userId}/sessionHistory/{sessionData.sessionId}` with `setDoc`.
- Creators read via **clientProgramService.getClientSessionHistory()** and **getSessionHistoryDoc()**; **SessionPerformanceModal** shows planned vs performed.

---

## 2. Session Notes — Design and Data Model

### 2.1 Goal

- **Session-scoped notes:** One notes field per completed session.
- User can add notes **during** the workout (WorkoutExecutionScreen) and/or **after** (WorkoutCompletionScreen and Session history screen).
- Notes are visible in the **Session history screen** (SessionsScreen) for each past workout, and creators see them in the session history modal (one-on-one clients).

### 2.2 Data model change

- Add one optional field to the sessionHistory document:
  - **`userNotes`** (string): optional; user-editable.
- No new collections. Same path: `users/{userId}/sessionHistory/{sessionId}`.
- **Writes:** (1) Include in the initial completion write. (2) Allow **updateDoc** later so users can add or edit notes from WorkoutCompletionScreen or from the session history screen. Firestore rules already allow owner write on sessionHistory; no change needed.

---

## 3. Session Notes — Implementation Instructions

### 3.1 Backend / service layer

**3.1.1 Include `userNotes` in the completion write**

- **File:** `apps/pwa/src/services/exerciseHistoryService.js`
- In **`updateSessionHistory(userId, sessionData, plannedSnapshot)`**:
  - When building `sessionHistoryData`, add:  
    `userNotes: sessionData.userNotes ?? ''`  
    (or omit the key when empty if you prefer not to store empty strings; then use `sessionData.userNotes != null ? sessionData.userNotes : undefined` and rely on `cleanFirestoreData` to drop undefined).
  - Ensure `cleanFirestoreData` does not strip empty string if you want to allow “cleared” notes; otherwise store only when truthy.

**3.1.2 Allow updating notes after completion**

- **File:** `apps/pwa/src/services/exerciseHistoryService.js`
- Add a new method, e.g. **`updateSessionNotes(userId, sessionId, userNotes)`**:
  - Use `updateDoc(doc(firestore, 'users', userId, 'sessionHistory', sessionId), { userNotes: userNotes ?? '' })`.
  - Export and use from WorkoutCompletionScreen (after completion) and from SessionsScreen (when user edits notes for a past session).
- **File:** `config/firebase/firestore.rules` — no change (owner already has write on `sessionHistory/{sessionId}`).

### 3.2 Pass notes from WorkoutExecutionScreen into completion

- **File:** `apps/pwa/src/screens/WorkoutExecutionScreen.js`
- **State:** Add local state for notes the user types during the workout, e.g. `const [sessionNotes, setSessionNotes] = useState('')`.
- **UI:** Add a notes entry point **during** the workout (e.g. a collapsible “Notas de la sesión” section or an icon that opens a small modal/sheet with a text area). Bind the text to `sessionNotes`.
- **On “End workout” / completion:** When building the payload for `sessionService.completeSession`, ensure the object that is passed includes notes. The completion path uses `workoutWithSetData` and then `sessionService.completeSession(..., workoutWithSetData, { plannedWorkout: workout })`. The session data that eventually becomes `actualSessionData` is derived from `workoutWithSetData` (or from `sessionManager.getCurrentSession()` in the conversion path). So either:
  - Pass `sessionNotes` in the **workout** object: e.g. when calling `sessionService.completeSession`, pass a merged object like `{ ...workoutWithSetData, userNotes: sessionNotes }`, and in **sessionService.completeSession** / **convertWorkoutToSession** ensure `userNotes` is copied onto the session payload that is sent to `exerciseHistoryService.addSessionData`, or
  - Have **sessionService.completeSession** accept an optional `options.userNotes` and merge it into `actualSessionData` before calling `addSessionData`. Then in WorkoutExecutionScreen, call `sessionService.completeSession(..., workoutWithSetData, { plannedWorkout: workout, userNotes: sessionNotes })`.
- **Recommendation:** Use `options.userNotes` in `sessionService.completeSession` and merge it into `actualSessionData` before `addSessionData`, so WorkoutExecutionScreen only passes `userNotes: sessionNotes` in options. In **exerciseHistoryService.updateSessionHistory**, read `sessionData.userNotes` (already set from options in sessionService).

**Concrete steps:**

1. In **sessionService.completeSession** (e.g. in `apps/pwa/src/services/sessionService.js`), after building `actualSessionData` (and before calling `addSessionData`), set `actualSessionData.userNotes = options.userNotes ?? actualSessionData.userNotes ?? ''`.
2. In **exerciseHistoryService.updateSessionHistory**, add `userNotes: sessionData.userNotes ?? ''` to `sessionHistoryData` (and ensure it is not stripped by `cleanFirestoreData` if you allow empty string).
3. In **WorkoutExecutionScreen**, add `sessionNotes` state, a notes UI (e.g. text area in a section or modal), and when calling `sessionService.completeSession` pass `userNotes: sessionNotes` in the options object.

### 3.3 WorkoutCompletionScreen — add or edit notes after completion

- **File:** `apps/pwa/src/screens/WorkoutCompletionScreen.js` (and if you have a web-specific wrapper, ensure the same props/state are available).
- **State:** e.g. `const [completionNotes, setCompletionNotes] = useState(route.params?.sessionData?.userNotes ?? '')` so that if notes were already passed from the execution screen they are pre-filled.
- **UI:** Add a “Notas de la sesión” (or “Añadir notas”) section with a text area bound to `completionNotes`. Optionally a primary action “Guardar notas” that:
  - Calls **exerciseHistoryService.updateSessionNotes(user.uid, sessionData.sessionId, completionNotes)**.
  - Show a short success state (e.g. “Notas guardadas”).
- **Initial value:** If the completion flow already saved notes (from WorkoutExecutionScreen), `sessionData.userNotes` may already be set on the doc; the screen can read it from `route.params.sessionData.userNotes` or fetch the session doc once. For a simpler v1, you can rely on the notes passed via route params from the completion payload (so the first write already has them), and the text area on this screen is for **editing** and then calling `updateSessionNotes`.

### 3.4 Session history screen — show and edit notes

- **File:** `apps/pwa/src/screens/SessionsScreen.js`
- **Data:** The screen already loads session history via `exerciseHistoryService.getSessionHistoryPaginated`. Each item includes the sessionHistory doc fields; after adding `userNotes`, each item will have `userNotes` (or undefined for old docs).
- **UI:** For each session in the list (or in a detail/expand view), display the notes for that workout:
  - Show `item.userNotes` when present (e.g. in a subtitle or expandable “Notas” section under the session title/date).
  - If you have a “session detail” or “view session” screen, show notes there and add an “Editar notas” that opens an input/modal and then calls **exerciseHistoryService.updateSessionNotes(userId, item.sessionId, newNotes)**. If the list is inline-only, add an “Edit” or “Add notes” control per row that toggles a text field and saves via `updateSessionNotes`.
- **Empty state:** For sessions with no notes, show a hint like “Añadir notas” that expands or focuses the notes field.

### 3.5 Creator dashboard — show user notes

- **File:** `apps/creator-dashboard/src/components/SessionPerformanceModal.jsx`
- **Data:** The modal already receives `historyDoc` (the sessionHistory doc). After the field is added, `historyDoc.userNotes` will be present when the user has set notes.
- **UI:** Add a section (e.g. “Notas del usuario” or “Notas de la sesión”) that renders `historyDoc.userNotes` when present. Read-only is sufficient for v1. Use the same modal whether the session was opened from the calendar or from history-only cards.

### 3.6 Summary of notes implementation

| Where | Action |
|-------|--------|
| **exerciseHistoryService.js** | Add `userNotes` to `sessionHistoryData` in `updateSessionHistory`; add `updateSessionNotes(userId, sessionId, userNotes)`. |
| **sessionService.js** | In `completeSession`, set `actualSessionData.userNotes` from `options.userNotes` before calling `addSessionData`. |
| **WorkoutExecutionScreen.js** | Add `sessionNotes` state and a notes UI; pass `userNotes: sessionNotes` in options to `sessionService.completeSession`. |
| **WorkoutCompletionScreen.js** | Add notes section and text area; pre-fill from `sessionData.userNotes`; “Guardar notas” calls `updateSessionNotes`. |
| **SessionsScreen.js** | For each session item, show `userNotes`; add way to edit and call `updateSessionNotes`. |
| **SessionPerformanceModal.jsx** | Show `historyDoc.userNotes` in a “Notas del usuario” section. |
| **Firestore rules** | No change. |

---

## 4. Video Features (Future Add-On)

Video features are **optional** and can be implemented later. All associations between a video and a session, exercise, or set are **optional**: a user can send a video attached only to a session, or to a session + exercise, or to a session + exercise + set, or with no association (session-only).

### 4.1 User-sent videos (one-on-one only)

- **Goal:** Client can upload a video for their creator (e.g. form check). Linking to a **specific exercise** or **set** is **optional**.
- **Storage:** e.g. `users/{userId}/session_videos/{sessionId}/{videoId}.mp4`.
- **Firestore:** e.g. subcollection `users/{userId}/sessionHistory/{sessionId}/sessionVideos/{videoId}` with:
  - Required: `storagePath`, `url`, `createdAt`, `uploadedBy`.
  - **Optional:** `exerciseKey`, `setIndex`, `exerciseId` (so the creator can show “for exercise X / set Y” when provided, or “video for this session” when not).
- **When:** During session (WorkoutExecutionScreen) or after (session history). SessionId is required; exercise/set are optional.

### 4.2 Creator response videos

- **Goal:** Creator uploads a video in response to a user video. Linking to a **specific** user video (e.g. `responseToVideoId`) is **optional** so that a creator can send a general feedback video for the session if desired.
- **Optional fields:** `responseToVideoId`, `exerciseKey`, `setIndex` so that when present the UI can show “Response to your video for Exercise X, Set Y” or “General feedback for this session”.

### 4.3 Efficient transfer (when implemented)

- Use Firebase Storage **resumable uploads** (`uploadBytesResumable`) for reliability and progress.
- Direct client → Storage; optional client-side compression (e.g. MP4, 720p) and optional thumbnails for list view.

Video implementation details (rules, subcollection shape, UI touchpoints) are left for a later phase; the notes implementation above is the first priority.

---

## 5. References in Codebase

- Session history write: `apps/pwa/src/services/exerciseHistoryService.js` — `updateSessionHistory()`.
- Completion flow: `apps/pwa/src/services/sessionService.js` — `completeSession()`; `apps/pwa/src/screens/WorkoutExecutionScreen.js` — end workout and call to `sessionService.completeSession`.
- Creator reading history: `apps/creator-dashboard/src/services/clientProgramService.js` — `getClientSessionHistory`, `getSessionHistoryDoc`; `apps/creator-dashboard/src/components/SessionPerformanceModal.jsx`.
- PWA session history list: `apps/pwa/src/screens/SessionsScreen.js` — `exerciseHistoryService.getSessionHistoryPaginated`.
- Firestore rules: `config/firebase/firestore.rules` — `users/{userId}/sessionHistory/{sessionId}` (read: owner or creatorHasClientAccess; write: owner).
