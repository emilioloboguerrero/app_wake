# Silent Saves/Uploads Sweep — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface a Spanish user-facing error when a save/upload that currently fails silently fails, so day-1 users never lose a workout note, weigh-in, photo, or recipe edit without knowing.

**Architecture:** Every fix is a 1–3 line addition inside an *existing* `catch` block (or a reorder of one success-only state update). PWA screens call the existing `wakeAlert(title, message)` helper (renders a non-blocking toast; auto-detects error styling by regex). Creator screens call the already-in-scope `showToast(message, 'error')` from `ToastContext`. No new dependencies, no new components, no behavior change on the success path.

**Tech Stack:** React Native Web (PWA, `.js`/`.web.jsx`, JavaScript), React + Vite (creator-dashboard, `.jsx`, JavaScript). No TypeScript in these apps.

## Global Constraints

- **User-facing strings: Spanish** (Colombian tuteo). Include one of the words `error / fall / no se pudo / no pudimos / intenta` so the PWA `wakeAlert.web.js` `looksLikeError` regex renders the red error dot.
- **Never block the success path.** Only add to the failure path (or gate a success-only visual). Onboarding completion must still proceed even if the photo upload fails.
- **No emojis** in code or copy (`feedback_no_emojis`).
- **No new files, no new imports where the helper is already imported.** Only `WorkoutCompletionScreen.js` needs a new import.
- **PWA `wakeAlert` import (named form, matches existing usage):** `import { wakeAlert } from '<rel>/utils/wakeAlert';`
- **Creator toast:** `showToast(msg, 'error')` — already destructured from `useToast()` in every creator file touched here.
- **Do NOT deploy.** Prod is `wolf-20b8b` (real money). Deploy only after explicit user confirmation. Deploy order when approved: rules → functions → migration → hosting. This change is **hosting-only** (no rules/functions/migration).

---

## Scope reconciliation (verified against code 2026-07-03)

The two UI/UX audits were code-only and not adversarially verified. Each finding below was checked against real code by parallel verification agents. Result: **5 genuinely-silent sites**, several audit flags already handled.

| Audit claim | Reality | In this plan? |
|---|---|---|
| Workout notes save silent (`WorkoutCompletionScreen`) | REAL — catch logs only, `wakeAlert` not imported | **Task 1** |
| Lab photo upload / weigh-in / goal save silent (`LabScreen.web.js`) | REAL ×3 — all log-only; `wakeAlert` already imported | **Task 2** |
| Onboarding photo save silent (`OnboardingEducation.web.jsx`) | REAL — inner catch swallows; `wakeAlert` already imported | **Task 3** |
| Creator nutrition autosave silent (`MealEditorScreen.jsx`) | REAL — catch logs only; `showToast` already in scope | **Task 4** |
| Event mutation misleading success (`EventsScreen.jsx` copyLink) | REAL — "✓ Copiado" shows even on clipboard failure | **Task 5** |
| `ProfileScreen.js` (PWA) profile save silent | FALSE — already `wakeAlert`s on CONFLICT + generic failure | No |
| `PlanEditorScreen.jsx` autosave silent | FALSE — already `showToast('Error guardando el plan…')` in catch | No |
| `NutritionProgramEditorScreen.jsx` autosave silent | FALSE — `useMutation` with `onError` `showToast` | No |
| `EventRegistrationsScreen.web.jsx` mutations hang | FALSE (phantom filename) — real `EventResultsScreen.jsx`, all handlers have try/catch + `showToast` | No |
| `EventsManagementScreen.web.jsx` status flip reverts silently | FALSE (phantom filename) — real `EventsScreen.jsx` `toggleMutation` is non-optimistic + `onError` toast | No |

**Out of scope (real but different bug class — see Decisions section):** PWA `ProfileScreen.js` email field editable-but-not-persisted; `EventResultsScreen.jsx` "Admitir" button has no loading/disabled state; `LabScreen.web.js` post-confirm photo-delete failure toast.

---

## File Structure

All five tasks are edits to existing files. No files created.

- Modify: `apps/pwa/src/screens/WorkoutCompletionScreen.js` — add `wakeAlert` import + one call in the notes-save catch.
- Modify: `apps/pwa/src/screens/LabScreen.web.js` — three `wakeAlert` calls (photo upload, weigh-in save, goal save catches).
- Modify: `apps/pwa/src/screens/onboarding/education/OnboardingEducation.web.jsx` — one `wakeAlert` call in the photo-upload inner catch.
- Modify: `apps/creator-dashboard/src/screens/MealEditorScreen.jsx` — one `showToast` call in the autosave catch.
- Modify: `apps/creator-dashboard/src/screens/EventsScreen.jsx` — reorder `setCopiedId` into the clipboard success branch.

Each task ends with a syntax/parse check on the changed file(s). A single reviewer could accept/reject any one task independently, so each is its own task; commits are grouped by app (Step "Commit" appears once per app at the end).

**Deliberate deviation from strict TDD:** these screens (2 000–5 000-line RN-web / creator components) have **no existing per-screen unit-test harness**, and the changes are error-path additions that would require heavy mocking to unit-test — disproportionate, and not the codebase pattern (`CLAUDE.md`: "Simplest solution always / No speculative work"). Verification is therefore: (a) babel-parse the changed PWA files, (b) `vite build` + `vitest run` for the changed creator files, (c) optional live drive of each flow via the prod E2E harness. This is a considered trade-off, stated explicitly per the skill's honesty requirement.

---

## Task 1: WorkoutCompletionScreen — notes save

**Files:**
- Modify: `apps/pwa/src/screens/WorkoutCompletionScreen.js` (import ~line 28; catch at lines 599–601)

**Interfaces:**
- Consumes: `wakeAlert(title, message)` from `apps/pwa/src/utils/wakeAlert` (named export; `.web.js` resolves on web, `.js` on native).
- Produces: nothing consumed by later tasks.

**Current code (verified):**
```js
28	import logger from '../utils/logger.js';
```
```js
594	    try {
595	      await exerciseHistoryService.updateSessionNotes(currentUser.uid, completionId, completionNotes);
596	      setNotesSaved(true);
597	      setInitialNotes(completionNotes);
598	      setTimeout(() => setNotesSaved(false), 2500);
599	    } catch (error) {
600	      logger.error('Error saving session notes:', error);
601	    } finally {
602	      setNotesSaving(false);
603	    }
```

- [ ] **Step 1: Add the `wakeAlert` import** (this file has none yet)

Add immediately after line 28:
```js
import { wakeAlert } from '../utils/wakeAlert';
```

- [ ] **Step 2: Surface the error in the notes-save catch**

Replace:
```js
    } catch (error) {
      logger.error('Error saving session notes:', error);
    } finally {
```
with:
```js
    } catch (error) {
      logger.error('Error saving session notes:', error);
      wakeAlert('No se pudo guardar la nota', 'Revisa tu conexión e inténtalo de nuevo.');
    } finally {
```

(The failure path already leaves `completionNotes` in state and does not set `notesSaved`, so the note is preserved for retry — no other change needed.)

- [ ] **Step 3: Parse-check the file** (see Task 6 for the exact command; run it now for this one file)

---

## Task 2: LabScreen — photo upload, weigh-in save, goal save

**Files:**
- Modify: `apps/pwa/src/screens/LabScreen.web.js` (catches at 432–434, 459–462, 764–767)

**Interfaces:**
- Consumes: `wakeAlert` — **already imported** at line 44: `import { wakeAlert } from '../utils/wakeAlert';` (no new import).

**Current code (verified):**
```js
432	    } catch (err) {
433	      logger.error('[BodyEntryModal] photo upload error', err?.message);
434	    } finally {
```
```js
459	    } catch (err) {
460	      logger.error('[BodyEntryModal] save error', err?.message);
461	      setSaving(false);
462	    }
```
```js
764	    } catch (err) {
765	      logger.error('[GoalWeightModal] save error', err?.message);
766	      setSaving(false);
767	    }
```

- [ ] **Step 1: Photo-upload catch** — replace:
```js
    } catch (err) {
      logger.error('[BodyEntryModal] photo upload error', err?.message);
    } finally {
```
with:
```js
    } catch (err) {
      logger.error('[BodyEntryModal] photo upload error', err?.message);
      wakeAlert('No se pudo subir la foto', 'Revisa tu conexión e inténtalo de nuevo.');
    } finally {
```

- [ ] **Step 2: Weigh-in / body-log save catch** — replace:
```js
    } catch (err) {
      logger.error('[BodyEntryModal] save error', err?.message);
      setSaving(false);
    }
```
with:
```js
    } catch (err) {
      logger.error('[BodyEntryModal] save error', err?.message);
      wakeAlert('No se pudo guardar', 'Revisa tu conexión e inténtalo de nuevo.');
      setSaving(false);
    }
```
(The modal stays open on failure — `onClose()` is only called on success — so the entry is preserved.)

- [ ] **Step 3: Goal-weight save catch** — replace:
```js
    } catch (err) {
      logger.error('[GoalWeightModal] save error', err?.message);
      setSaving(false);
    }
```
with:
```js
    } catch (err) {
      logger.error('[GoalWeightModal] save error', err?.message);
      wakeAlert('No se pudo guardar tu meta', 'Revisa tu conexión e inténtalo de nuevo.');
      setSaving(false);
    }
```
(The two `'[BodyEntryModal] save error'` vs `'[GoalWeightModal] save error'` anchors are unique, so Steps 2 and 3 do not collide.)

- [ ] **Step 4: Parse-check the file** (command in Task 6)

---

## Task 3: OnboardingEducation — photo upload

**Files:**
- Modify: `apps/pwa/src/screens/onboarding/education/OnboardingEducation.web.jsx` (inner catch at 483–485)

**Interfaces:**
- Consumes: `wakeAlert` — **already imported** at line 12: `import { wakeAlert } from '../../../utils/wakeAlert';` (no new import).

**Current code (verified):**
```jsx
479	      // Upload photo if selected
480	      if (profile.photoPreview) {
481	        try {
482	          await profilePictureService.uploadProfilePicture(uid, profile.photoPreview);
483	        } catch (err) {
484	          logger.error('[ONBOARDING_EDU] Photo upload error:', err);
485	        }
486	      }
```

- [ ] **Step 1: Surface the photo-upload failure without blocking completion** — replace:
```jsx
        } catch (err) {
          logger.error('[ONBOARDING_EDU] Photo upload error:', err);
        }
```
with:
```jsx
        } catch (err) {
          logger.error('[ONBOARDING_EDU] Photo upload error:', err);
          wakeAlert('No se pudo subir tu foto', 'Tu perfil se guardó, pero la foto no. Puedes agregarla luego desde tu perfil.');
        }
```
**Critical:** keep the swallow (do NOT re-throw). The outer `saveProfile` catch re-throws and drives the "No pudimos guardar tu perfil" alert for a *general* failure; the photo is intentionally non-blocking so onboarding still completes. The reassurance copy tells the user the profile itself is safe.

- [ ] **Step 2: Parse-check the file** (command in Task 6)

- [ ] **Step 3: Commit the PWA changes (Tasks 1–3)**
```bash
git add apps/pwa/src/screens/WorkoutCompletionScreen.js \
        apps/pwa/src/screens/LabScreen.web.js \
        apps/pwa/src/screens/onboarding/education/OnboardingEducation.web.jsx
git commit -m "fix(uiux): surface silent save/upload failures in PWA (notes, Lab, onboarding photo)"
```

---

## Task 4: MealEditorScreen — nutrition autosave

**Files:**
- Modify: `apps/creator-dashboard/src/screens/MealEditorScreen.jsx` (catch at 181–184)

**Interfaces:**
- Consumes: `showToast` — **already destructured** at line 94 (`const { showToast } = useToast();`), already in the effect's dep array (line 189). No new import, no new hook.

**Current code (verified):**
```jsx
177	      try {
178	        await nutritionDb.updateMeal(creatorId, mealId, { name, items: mealFormItems, video_url: video_url || null, video_source });
179	        lastSavedRef.current = { name, itemsJson, video_url };
180	        queryClient.invalidateQueries({ queryKey: queryKeys.nutrition.meals(creatorId) });
181	      } catch (e) {
182	        queryClient.invalidateQueries({ queryKey: queryKeys.nutrition.meal(creatorId, mealId) });
183	        logger.error(e);
184	      }
```

- [ ] **Step 1: Surface the autosave failure** — replace:
```jsx
      } catch (e) {
        queryClient.invalidateQueries({ queryKey: queryKeys.nutrition.meal(creatorId, mealId) });
        logger.error(e);
      }
```
with:
```jsx
      } catch (e) {
        queryClient.invalidateQueries({ queryKey: queryKeys.nutrition.meal(creatorId, mealId) });
        logger.error(e);
        showToast('No pudimos guardar la receta. Intenta de nuevo.', 'error');
      }
```
(This matches the sibling `PlanEditorScreen.jsx` catch, which already toasts. The `showToast` reference is already covered by the effect's dependency array, so no lint/stale-closure issue.)

- [ ] **Step 2: Parse-check via build** (command in Task 6)

---

## Task 5: EventsScreen — copy-link misleading success

**Files:**
- Modify: `apps/creator-dashboard/src/screens/EventsScreen.jsx` (`copyLink` at 465–477)

**Interfaces:**
- Consumes: `showToast` — already destructured at line 375. No new import.

**Current code (verified):**
```jsx
465	  async function copyLink(ev) {
466	    const url = `https://wakelab.co/e/${ev.id}`;
467	    try {
468	      await navigator.clipboard.writeText(url);
469	      showToast('Enlace copiado', 'success');
470	    } catch {
471	      showToast('No se pudo copiar el enlace', 'error');
472	    }
473	    setCopiedId(ev.id);
474	    if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
475	    copiedTimerRef.current = setTimeout(() => setCopiedId(null), 2000);
476	    setMenuOpenId(null);
477	  }
```

- [ ] **Step 1: Gate the "✓ Copiado" visual on actual clipboard success** — replace the whole function body with:
```jsx
  async function copyLink(ev) {
    const url = `https://wakelab.co/e/${ev.id}`;
    try {
      await navigator.clipboard.writeText(url);
      showToast('Enlace copiado', 'success');
      setCopiedId(ev.id);
      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
      copiedTimerRef.current = setTimeout(() => setCopiedId(null), 2000);
    } catch {
      showToast('No se pudo copiar el enlace', 'error');
    }
    setMenuOpenId(null);
  }
```
(`setCopiedId` + timer now run only on success; `setMenuOpenId(null)` stays unconditional so the menu always closes. On failure the button no longer flashes the green checkmark while the error toast says it failed.)

- [ ] **Step 2: Build-check (command in Task 6)**

- [ ] **Step 3: Commit the creator changes (Tasks 4–5)**
```bash
git add apps/creator-dashboard/src/screens/MealEditorScreen.jsx \
        apps/creator-dashboard/src/screens/EventsScreen.jsx
git commit -m "fix(uiux): surface silent meal autosave failure + fix misleading copy-link success"
```

---

## Task 6: Verification

**Files:** none (verification only).

- [ ] **Step 1: Parse-check the three changed PWA files** (jest won't touch un-imported screens, so parse directly with the project's babel)

Run (from `apps/pwa`, so `babel-preset-expo` resolves):
```bash
cd apps/pwa && node -e "const b=require('@babel/core');['src/screens/WorkoutCompletionScreen.js','src/screens/LabScreen.web.js','src/screens/onboarding/education/OnboardingEducation.web.jsx'].forEach(f=>{b.transformFileSync(f,{presets:['babel-preset-expo']});console.log('OK',f)})"
```
Expected: three `OK <path>` lines, no `SyntaxError`.

- [ ] **Step 2: Build + test the creator app** (catches JSX/syntax in the two changed files)
```bash
npm run build --prefix apps/creator-dashboard
npm run test --prefix apps/creator-dashboard
```
Expected: vite build completes (`✓ built in …`); vitest `Test Files … passed` (the 4 existing creator tests still pass — no regression).

- [ ] **Step 3 (optional, recommended before deploy): live-drive each flow via the E2E harness**

Per the handoff, `scratchpad/e2e/run.js` spoofs `display-mode: standalone` to drive the prod PWA; grant a course to the QA account (`scratchpad/grant-qa.js 352ruaYiQ4Sa6oXz1HOO`) to reach write flows. Manually force each save to fail (offline the tab / block the request) and confirm the toast appears for: workout notes, Lab photo, Lab weigh-in, Lab goal, onboarding photo. For the creator paths, drive MealEditor autosave-offline and EventsScreen copy-link with clipboard denied. **Delete any temporary App Check debug token and revoke the QA course when done.**

---

## Self-Review

- **Spec coverage:** all 5 verified-silent sites → Tasks 1–5. The 5 audit false-positives are explicitly excluded with reasons. ✅
- **Placeholder scan:** every step contains the exact before/after code — no TBD / "add error handling" placeholders. ✅
- **Type/name consistency:** PWA uses `wakeAlert(title, message)` throughout; creator uses `showToast(msg, 'error')` throughout — matches each file's existing helper. Only Task 1 adds an import; all other helpers already imported (verified). ✅
- **Success path untouched:** every edit is inside a `catch` or gates a success-only visual; onboarding completion still proceeds on photo failure. ✅

---

## Decisions for the user (not in this plan unless approved)

1. **PWA `ProfileScreen.js` email field** is editable and enables the Save button (`emailChanged`), but the save payload omits `email`, so the edit is silently discarded (no error, just no persist). Different bug class (editable-but-not-persisted). Options: make the field read-only, or drop it from the editable set. — Fix in this pass?
2. **`EventResultsScreen.jsx` "Admitir" button** has no disabled/loading state → double-click can double-admit. Not silent (errors do toast). — Add a loading guard?
3. **`LabScreen.web.js` post-confirm photo-delete failure** (the inner `onPress` after the existing `wakeAlert` confirm) still logs-only if the Storage delete itself throws. Same class as this sweep, same file. — Add a `wakeAlert` there too (one more line)?
