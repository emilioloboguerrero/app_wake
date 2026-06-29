# Visibility-Gaps Instrumentation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the PostHog visibility gaps so the purchase funnel, cancellations, and workout session-recovery are all measurable, with the minimum code change.

**Architecture:** Add/standardize client `analyticsService.track()` events across `apps/landing` and `apps/pwa`, add two server events in the existing MercadoPago webhook (`functions/src/api/routes/payments.ts`), gate the cancellation flow behind the existing survey before opening the MP portal (new record-only endpoint), and enrich the workout-execution recovery events to quantify real UX harm. No store refactor, no native work, no taxonomy redesign.

**Tech Stack:** PostHog (`posthog-js`), `analyticsService.track()` wrappers (one per app), Firebase Functions v2 (TypeScript), vitest (functions + pwa), Expo/React Native Web (pwa), Vite/React (landing).

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-06-28-visibility-gaps-instrumentation-design.md`.
- **Languages:** `functions/` is TypeScript (explicit types, `unknown` for errors). `apps/*` are JavaScript/JSX — NEVER add TypeScript.
- **Events fire only via** each app's `analyticsService.track(event, props)` (client) or `capture()` from `functions/src/lib/analytics` (server). No raw `posthog.capture` in new code; no `console.log` (use `apps/pwa/src/utils/logger.js` in pwa, `functions.logger` in functions).
- **Common client funnel props on every Stream-1 event:** `surface` (`'landing' | 'pwa_web'`), `course_id` or `bundle_id`, `kind` (`'course' | 'bundle'`), and `external_reference` when available.
- **User-facing strings:** Spanish. No emojis anywhere.
- **Reuse existing taxonomy** (`subscription.*`, `program.*`, `workout.*`). Do not rename existing events.
- **Deploy to prod (`wolf-20b8b`) requires explicit user confirmation.** Before any pwa deploy, build with `--clear` and verify the bundle contains `wolf-20b8b` (Metro cache can ship staging config).
- **Branch:** `instrumentation/visibility-gaps` (already created).

---

## File Structure

**Modify:**
- `functions/src/api/routes/payments.ts` — extract `buildCancellationSurveyRecord()` helper; add `POST /payments/subscriptions/:id/cancel-survey` (record-only); fire `subscription.cancelled` (preapproval webhook) and `subscription.payment_rejected` (payment webhook).
- `apps/pwa/src/services/purchaseService.js` — fire `subscription.checkout.created` / `.create_failed`.
- `apps/pwa/src/screens/BundleDetailScreen.web.jsx` + `apps/pwa/src/screens/CourseDetailScreen.js` — fire `subscription.checkout.redirected` before redirect.
- `apps/pwa/src/screens/PaymentSuccessScreen.web.jsx` — fire `subscription.checkout.returned` (mount) + `subscription.activated` (verifying→active).
- `apps/pwa/src/screens/SubscriptionsScreen.js` — route "Gestionar" through the survey first; fire `subscription.cancel_intent` / `.cancel_survey_submitted` / `.manage_portal_opened`; call record-only endpoint then open portal.
- `apps/landing/src/screens/CreatorProgramDetailScreen.jsx` — fire `subscription.checkout.created` / `.create_failed`.
- `apps/landing/src/screens/PostPaymentScreen.jsx` — fire `subscription.activated` on active.
- `apps/pwa/src/screens/WorkoutExecutionScreen.js` — enrich `workout.session_recovered`; add `workout.session_interrupted`.

**Create:**
- `functions/src/api/routes/__tests__/cancellationSurvey.test.ts` (or nearest existing test dir) — unit test for `buildCancellationSurveyRecord()`.
- `apps/pwa/src/services/__tests__/purchaseService.events.test.js` — unit test for checkout event firing.

**Verification-only (no code):** PostHog insights via MCP at the end.

---

## Phase A — Backend: cancellation survey helper + record-only endpoint

### Task A1: Extract `buildCancellationSurveyRecord()` (DRY, testable)

The survey-record construction is currently inlined in `POST /cancel` (payments.ts:1966-1999). Extract it so both `/cancel` and the new `/cancel-survey` reuse it, and so it is unit-testable.

**Files:**
- Modify: `functions/src/api/routes/payments.ts` (around 1966-1999)
- Test: `functions/src/api/routes/__tests__/cancellationSurvey.test.ts`

**Interfaces:**
- Produces: `buildCancellationSurveyRecord(args: { userId: string; subscriptionId: string; survey: Record<string, unknown>; subscriptionData: Record<string, unknown>; statusAfter: string; proceededToPortal?: boolean }): Record<string, unknown>` — throws `Error` on invalid answers (non-array, >20 items, or any string answer >500 chars).

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { buildCancellationSurveyRecord } from "../payments";

describe("buildCancellationSurveyRecord", () => {
  const base = {
    userId: "u1",
    subscriptionId: "s1",
    subscriptionData: { course_id: "c1", course_title: "Método Bejarano", status: "authorized", payer_email: "a@b.com" },
  };

  it("builds a record with source, status and reconciled fields", () => {
    const rec = buildCancellationSurveyRecord({
      ...base,
      survey: { answers: ["cost", "satisfied"], source: "pre_portal_survey_v1" },
      statusAfter: "intent",
      proceededToPortal: true,
    });
    expect(rec.userId).toBe("u1");
    expect(rec.subscriptionId).toBe("s1");
    expect(rec.answers).toEqual(["cost", "satisfied"]);
    expect(rec.source).toBe("pre_portal_survey_v1");
    expect(rec.statusAfter).toBe("intent");
    expect(rec.proceeded_to_portal).toBe(true);
    expect(rec.courseId).toBe("c1");
    expect(rec.courseTitle).toBe("Método Bejarano");
    expect(rec.statusBefore).toBe("authorized");
    expect(rec.payerEmail).toBe("a@b.com");
  });

  it("defaults source to in_app_cancel_flow_v1 and omits proceeded_to_portal when undefined", () => {
    const rec = buildCancellationSurveyRecord({ ...base, survey: { answers: ["other"] }, statusAfter: "cancelled" });
    expect(rec.source).toBe("in_app_cancel_flow_v1");
    expect("proceeded_to_portal" in rec).toBe(false);
  });

  it("throws on non-array answers", () => {
    expect(() => buildCancellationSurveyRecord({ ...base, survey: { answers: "nope" }, statusAfter: "cancelled" })).toThrow();
  });

  it("throws on an over-long answer", () => {
    expect(() => buildCancellationSurveyRecord({ ...base, survey: { answers: ["x".repeat(501)] }, statusAfter: "cancelled" })).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix functions run test -- cancellationSurvey`
Expected: FAIL — `buildCancellationSurveyRecord` is not exported.

- [ ] **Step 3: Implement the helper**

Add near the top-level helpers in `payments.ts` (export it so the test can import). `FieldValue` is already imported in this file.

```ts
export function buildCancellationSurveyRecord(args: {
  userId: string;
  subscriptionId: string;
  survey: Record<string, unknown>;
  subscriptionData: Record<string, unknown>;
  statusAfter: string;
  proceededToPortal?: boolean;
}): Record<string, unknown> {
  const {userId, subscriptionId, survey, subscriptionData, statusAfter, proceededToPortal} = args;
  const answers = survey.answers;
  if (!Array.isArray(answers) || answers.length > 20) {
    throw new Error("Invalid survey answers");
  }
  for (const answer of answers) {
    if (typeof answer === "string" && answer.length > 500) {
      throw new Error("Survey answer too long");
    }
  }
  const rec: Record<string, unknown> = {
    userId,
    subscriptionId,
    answers,
    source: (survey.source as string) ?? "in_app_cancel_flow_v1",
    statusAfter,
    submittedAt: FieldValue.serverTimestamp(),
  };
  if (proceededToPortal !== undefined) rec.proceeded_to_portal = proceededToPortal;
  const courseId = (survey.courseId as string | undefined) ?? subscriptionData.course_id;
  if (courseId) rec.courseId = courseId;
  const courseTitle = (survey.courseTitle as string | undefined) ?? subscriptionData.course_title;
  if (courseTitle) rec.courseTitle = courseTitle;
  const statusBefore = (survey.subscriptionStatusBefore as string | undefined) ?? subscriptionData.status;
  if (statusBefore) rec.statusBefore = statusBefore;
  const payerEmail = subscriptionData.payer_email ?? (survey.payerEmail as string | undefined);
  if (payerEmail) rec.payerEmail = payerEmail;
  return rec;
}
```

- [ ] **Step 4: Rewire the existing `/cancel` endpoint to use the helper**

Replace the inlined block at payments.ts:1966-2000 with:

```ts
  if (survey?.answers) {
    try {
      const surveyRecord = buildCancellationSurveyRecord({
        userId: auth.userId,
        subscriptionId,
        survey,
        subscriptionData,
        statusAfter: "cancelled",
      });
      await db.collection("subscription_cancellation_feedback").add(surveyRecord);
    } catch {/* non-critical */}
  }
```

- [ ] **Step 5: Run test + typecheck**

Run: `npm --prefix functions run test -- cancellationSurvey && npm --prefix functions run build`
Expected: tests PASS, `tsc` exits 0.

- [ ] **Step 6: Commit**

```bash
git add functions/src/api/routes/payments.ts functions/src/api/routes/__tests__/cancellationSurvey.test.ts
git commit -m "refactor(functions): extract buildCancellationSurveyRecord, unit-tested"
```

### Task A2: Add record-only `POST /payments/subscriptions/:id/cancel-survey`

Records the pre-portal survey without cancelling (the MP portal performs the cancel).

**Files:**
- Modify: `functions/src/api/routes/payments.ts` (add route just above `export default router;`)

**Interfaces:**
- Produces: `POST /payments/subscriptions/:subscriptionId/cancel-survey` body `{ survey: { answers: string[], source?, courseId?, courseTitle?, subscriptionStatusBefore?, payerEmail? }, proceeded_to_portal?: boolean }` → `200 { data: { recorded: boolean } }`.

- [ ] **Step 1: Implement the route**

```ts
router.post("/payments/subscriptions/:subscriptionId/cancel-survey", async (req, res) => {
  const auth = await validateAuth(req);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const {subscriptionId} = req.params;
  const survey = req.body?.survey as Record<string, unknown> | undefined;
  const proceededToPortal = req.body?.proceeded_to_portal === true;

  const subscriptionRef = db
    .collection("users").doc(auth.userId)
    .collection("subscriptions").doc(subscriptionId);
  const subscriptionDoc = await subscriptionRef.get();
  if (!subscriptionDoc.exists) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Suscripción no encontrada");
  }
  const subscriptionData = subscriptionDoc.data() ?? {};

  let recorded = false;
  if (survey?.answers) {
    try {
      const surveyRecord = buildCancellationSurveyRecord({
        userId: auth.userId,
        subscriptionId,
        survey,
        subscriptionData,
        statusAfter: "intent",
        proceededToPortal,
      });
      await db.collection("subscription_cancellation_feedback").add(surveyRecord);
      recorded = true;
    } catch (err) {
      functions.logger.warn("cancel-survey record failed (non-blocking)", {
        userId: auth.userId, subscriptionId, error: String(err),
      });
    }
  }
  res.json({data: {recorded}});
});
```

- [ ] **Step 2: Typecheck + lint**

Run: `npm --prefix functions run build && npm --prefix functions run lint`
Expected: exit 0 both.

- [ ] **Step 3: Commit**

```bash
git add functions/src/api/routes/payments.ts
git commit -m "feat(functions): record-only cancel-survey endpoint (pre-portal)"
```

### Task A3: Fire `subscription.cancelled` (server, authoritative) + `subscription.payment_rejected`

**Files:**
- Modify: `functions/src/api/routes/payments.ts` — preapproval webhook status block (~1093-1104) and the payment-not-approved branch (~1391-1402).

**Interfaces:**
- Consumes: existing `capture()` from `functions/src/lib/analytics` (same helper used at the `program.purchase_completed` call ~1908-1925). Match its call shape exactly when you wire these.

- [ ] **Step 1: Add `subscription.cancelled` in the preapproval webhook**

Immediately after the subscription doc is merged with the new status (~payments.ts:1104), where `oldStatus` and `newStatus` are in scope:

```ts
  if (newStatus === "cancelled" && oldStatus !== "cancelled") {
    const createdMs = subscriptionData.created_at?.toMillis?.() ?? null;
    const daysActive = createdMs ? Math.floor((Date.now() - createdMs) / 86400000) : null;
    let hadSurvey = false;
    try {
      const fb = await db.collection("subscription_cancellation_feedback")
        .where("subscriptionId", "==", subscriptionId)
        .limit(1).get();
      hadSurvey = !fb.empty;
    } catch {/* non-critical */}
    capture({
      distinctId: userId,
      event: "subscription.cancelled",
      properties: {
        course_id: subscriptionData.course_id ?? null,
        had_survey: hadSurvey,
        days_active: daysActive,
        source: "webhook",
      },
    });
  }
```

(Adjust `capture(...)` argument shape to match the existing call site; if `capture` takes `(distinctId, event, properties)` positionally there, use that form.)

- [ ] **Step 2: Add `subscription.payment_rejected` in the not-approved branch**

In the payment webhook where MP status is `rejected`/`cancelled` (~1391-1402), where `userId`, `courseId`, and the MP payment status are in scope:

```ts
  capture({
    distinctId: userId,
    event: "subscription.payment_rejected",
    properties: {
      course_id: courseId ?? null,
      mp_status: mpStatus ?? null,
      status_detail: statusDetail ?? null,
    },
  });
```

(Use the variable names actually in scope for `mpStatus`/`statusDetail`; they are logged in `webhook.payment.fetched` nearby.)

- [ ] **Step 3: Typecheck**

Run: `npm --prefix functions run build`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add functions/src/api/routes/payments.ts
git commit -m "feat(functions): server events subscription.cancelled + payment_rejected"
```

---

## Phase B — Client: purchase funnel events (Stream 1)

### Task B1: PWA `subscription.checkout.created` / `.create_failed` (+ unit test)

**Files:**
- Modify: `apps/pwa/src/services/purchaseService.js` (`prepareBundleSubscription` ~219-262, and the course-subscription variant it exposes)
- Test: `apps/pwa/src/services/__tests__/purchaseService.events.test.js`

**Interfaces:**
- Consumes: `analyticsService` default export (has `.track(event, props)`); `apiClient`.

- [ ] **Step 1: Write the failing test** (mock `apiClient` + `analyticsService`)

```js
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../analyticsService", () => ({ default: { track: vi.fn() } }));
vi.mock("../apiClient", () => ({ default: { post: vi.fn() } }));

import analyticsService from "../analyticsService";
import apiClient from "../apiClient";
import purchaseService from "../purchaseService";

describe("purchaseService subscription checkout events", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("fires checkout.created on success", async () => {
    apiClient.post.mockResolvedValueOnce({ data: { initPoint: "https://mp/x", subscriptionId: "sub1" } });
    await purchaseService.prepareBundleSubscription("b1", "a@b.com", "pwa_web");
    expect(analyticsService.track).toHaveBeenCalledWith(
      "subscription.checkout.created",
      expect.objectContaining({ bundle_id: "b1", surface: "pwa_web", kind: "bundle", subscription_id: "sub1" })
    );
  });

  it("fires checkout.create_failed on error", async () => {
    apiClient.post.mockRejectedValueOnce?.(new Error("boom")) ?? apiClient.post.mockRejectedValueOnce(new Error("boom"));
    await expect(purchaseService.prepareBundleSubscription("b1", "a@b.com", "pwa_web")).rejects.toThrow();
    expect(analyticsService.track).toHaveBeenCalledWith(
      "subscription.checkout.create_failed",
      expect.objectContaining({ bundle_id: "b1", surface: "pwa_web", kind: "bundle" })
    );
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm --prefix apps/pwa run test:unit -- purchaseService.events`
Expected: FAIL (events not fired).

- [ ] **Step 3: Implement** — wrap the `apiClient.post('/payments/bundle-subscription', ...)` call (~237). On success, before returning:

```js
analyticsService.track('subscription.checkout.created', {
  bundle_id: bundleId, surface, kind: 'bundle', subscription_id: result?.data?.subscriptionId ?? null,
});
```

In the catch path (add try/catch around the post if absent):

```js
analyticsService.track('subscription.checkout.create_failed', {
  bundle_id: bundleId, surface, kind: 'bundle', error_code: error?.code || error?.message || 'unknown',
});
throw error;
```

Apply the same two events to the course-subscription path (use `course_id` + `kind: 'course'`).

- [ ] **Step 4: Run test + lint**

Run: `npm --prefix apps/pwa run test:unit -- purchaseService.events && npm --prefix apps/pwa run lint`
Expected: PASS, lint clean.

- [ ] **Step 5: Commit**

```bash
git add apps/pwa/src/services/purchaseService.js apps/pwa/src/services/__tests__/purchaseService.events.test.js
git commit -m "feat(pwa): subscription.checkout.created/create_failed events"
```

### Task B2: PWA `subscription.checkout.redirected`

**Files:**
- Modify: `apps/pwa/src/screens/BundleDetailScreen.web.jsx` (where it redirects to `result.checkoutURL` after `prepareBundleSubscription`) and `apps/pwa/src/screens/CourseDetailScreen.js` (~1010, course redirect).

- [ ] **Step 1: Add the event immediately before each redirect**

```js
analyticsService.track('subscription.checkout.redirected', {
  surface: 'pwa_web', bundle_id: bundleId, kind: 'bundle', subscription_id: result?.subscriptionId ?? null,
});
// then redirect to result.checkoutURL
```

For `CourseDetailScreen.js` use `course_id` + `kind: 'course'`. Confirm `analyticsService` is imported in each file; add the import if missing.

- [ ] **Step 2: Lint + manual sanity**

Run: `npm --prefix apps/pwa run lint`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add apps/pwa/src/screens/BundleDetailScreen.web.jsx apps/pwa/src/screens/CourseDetailScreen.js
git commit -m "feat(pwa): subscription.checkout.redirected event"
```

### Task B3: PWA `subscription.checkout.returned` + `subscription.activated`

**Files:**
- Modify: `apps/pwa/src/screens/PaymentSuccessScreen.web.jsx` (mount + polling ~110-154)

- [ ] **Step 1: Fire `returned` once on mount**

In a mount `useEffect` (empty deps), read `courseId`/`mode` from the query string already parsed in this screen:

```js
analyticsService.track('subscription.checkout.returned', {
  surface: 'pwa_web', course_id: courseId ?? null, kind: 'course', status: 'verifying',
});
```

- [ ] **Step 2: Fire `activated` when polling transitions to active**

At the point the polling state becomes `'active'` (access granted), guard with a ref so it fires once:

```js
analyticsService.track('subscription.activated', {
  surface: 'pwa_web', course_id: courseId ?? null, kind: 'course',
});
```

- [ ] **Step 3: Lint**

Run: `npm --prefix apps/pwa run lint`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add apps/pwa/src/screens/PaymentSuccessScreen.web.jsx
git commit -m "feat(pwa): subscription.checkout.returned + subscription.activated events"
```

### Task B4: Landing `subscription.checkout.created` / `.create_failed` + `subscription.activated`

**Files:**
- Modify: `apps/landing/src/screens/CreatorProgramDetailScreen.jsx` (`runCheckout` ~258-315; `subscription.checkout.redirected` already at 294)
- Modify: `apps/landing/src/screens/PostPaymentScreen.jsx` (`subscription.checkout.returned` already at 101; add `activated`)

Landing has no test runner — verify via lint/build + manual PostHog confirmation (Phase E).

- [ ] **Step 1: In `runCheckout`**, after `startStorefrontCheckout()` returns `result.initPoint` successfully and before the existing `subscription.checkout.redirected` (294):

```js
track('subscription.checkout.created', {
  course_id: courseId, surface: 'landing', kind: 'course', subscription_id: result.subscriptionId ?? null,
});
```

Wrap the checkout call in try/catch (if not already) and in catch:

```js
track('subscription.checkout.create_failed', {
  course_id: courseId, surface: 'landing', kind: 'course', error_code: e?.code || e?.message || 'unknown',
});
```

(Use the same `track` helper the file already uses at line 294.)

- [ ] **Step 2: In `PostPaymentScreen.jsx`**, where polling marks access active, fire once:

```js
track('subscription.activated', { course_id: courseId, surface: 'landing', kind: 'course' });
```

- [ ] **Step 3: Build**

Run: `npm run build:landing`
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add apps/landing/src/screens/CreatorProgramDetailScreen.jsx apps/landing/src/screens/PostPaymentScreen.jsx
git commit -m "feat(landing): checkout.created/create_failed + subscription.activated events"
```

---

## Phase C — Client: cancellation survey before portal (Stream 2)

### Task C1: Route "Gestionar" through the survey, then portal; fire events

**Files:**
- Modify: `apps/pwa/src/screens/SubscriptionsScreen.js` (`handleManageSubscription` 195-213; survey submit via `performAction`/`handleCancelIntent`; `apiClient` already imported)

**Interfaces:**
- Consumes: `POST /payments/subscriptions/:id/cancel-survey` (Task A2); existing `handleCancelIntent`, `cancelSurveyAnswers`, `isSurveyComplete`.

- [ ] **Step 1: Always open the survey first; fire `cancel_intent`**

Replace `handleManageSubscription` body so it no longer opens the portal directly. Stash the `management_url` for after the survey:

```js
const handleManageSubscription = async () => {
  analyticsService.track('subscription.cancel_intent', {
    course_id: subscription.course_id ?? subscription.courseId ?? null,
    has_management_url: !!subscription.management_url,
  });
  handleCancelIntent(subscription); // opens the existing survey modal
};
```

- [ ] **Step 2: On survey submit, branch on `management_url`**

In the survey submit handler (where `isSurveyComplete` gates the action and `performAction` is currently called), build the survey payload once and branch:

```js
const surveyPayload = {
  answers: [
    cancelSurveyAnswers.reason,
    cancelSurveyAnswers.satisfaction,
    cancelSurveyAnswers.resubscribeLikelihood,
    cancelSurveyAnswers.improvement,
  ],
  source: subscription.management_url ? 'pre_portal_survey_v1' : 'in_app_cancel_flow_v1',
  courseId: subscription.course_id ?? subscription.courseId ?? null,
  courseTitle: subscription.course_title ?? null,
  subscriptionStatusBefore: subscription.status ?? null,
};

analyticsService.track('subscription.cancel_survey_submitted', {
  course_id: surveyPayload.courseId,
  reason: cancelSurveyAnswers.reason,
  satisfaction: cancelSurveyAnswers.satisfaction,
  resubscribe_likelihood: cancelSurveyAnswers.resubscribeLikelihood,
  improvement: cancelSurveyAnswers.improvement,
  proceeded_to_portal: !!subscription.management_url,
});

if (subscription.management_url) {
  // Record-only, then send the user to MP's portal to complete the cancel.
  try {
    await apiClient.post(`/payments/subscriptions/${subscription.subscription_id}/cancel-survey`, {
      survey: surveyPayload, proceeded_to_portal: true,
    });
  } catch (e) { logger.error('cancel-survey record failed', e); }
  analyticsService.track('subscription.manage_portal_opened', {
    course_id: surveyPayload.courseId,
  });
  // close modal, then open portal
  await Linking.openURL(subscription.management_url);
} else {
  // No portal: cancel via our API (records survey + cancels).
  await performAction(subscription.subscription_id, 'cancel', { survey: surveyPayload });
}
```

Wire this into the existing submit button (currently calls `performAction`). Keep the existing modal close/reset behavior.

- [ ] **Step 3: Lint**

Run: `npm --prefix apps/pwa run lint`
Expected: clean.

- [ ] **Step 4: Manual verification (documented, no harness for RN screen)**

In the running PWA: open Suscripciones → Gestionar on an MP sub → confirm the survey appears BEFORE any portal redirect; submit → confirm it then opens the MP portal. Confirm a `subscription_cancellation_feedback` doc is written with `source: 'pre_portal_survey_v1'` and `proceeded_to_portal: true`.

- [ ] **Step 5: Commit**

```bash
git add apps/pwa/src/screens/SubscriptionsScreen.js
git commit -m "feat(pwa): survey-before-portal cancellation flow + events"
```

---

## Phase D — Client: measure session-recovery harm (Stream 3)

### Task D1: Enrich `workout.session_recovered`

**Files:**
- Modify: `apps/pwa/src/screens/WorkoutExecutionScreen.js` (recovered event ~1149; checkpoint read ~892-912)

- [ ] **Step 1: Capture mount timestamp + compute render time**

At the top of the recovery code path, record `const recoveryMountTs = performance.now();` (or `Date.now()`), and when firing `workout.session_recovered` add:

```js
analyticsService.track('workout.session_recovered', {
  ...existingProps,
  recovery_render_ms: Math.round((performance.now ? performance.now() : Date.now()) - recoveryMountTs),
  lost_current_set_progress: !!lostCurrentSetProgress, // true if the in-progress set's reps/weight were not restored
  trigger: recoverySource === 'route' ? 'route' : (document.visibilityState === 'visible' ? 'reload' : 'visibility'),
});
```

Compute `lostCurrentSetProgress` by comparing the restored checkpoint's `currentSetIndex`/in-set buffer against an empty/initial set state (true when the set had logged reps that weren't restored). Keep the existing props intact.

- [ ] **Step 2: Lint**

Run: `npm --prefix apps/pwa run lint`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add apps/pwa/src/screens/WorkoutExecutionScreen.js
git commit -m "feat(pwa): enrich workout.session_recovered with harm signals"
```

### Task D2: Add `workout.session_interrupted` (denominator)

**Files:**
- Modify: `apps/pwa/src/screens/WorkoutExecutionScreen.js` (the existing `visibilitychange`/`pagehide` checkpoint-write effects ~1468-1479)

- [ ] **Step 1: Fire on interruption during an active session**

Inside the existing `pagehide` handler and the `visibilitychange` handler (when `document.visibilityState === 'hidden'`), where the checkpoint is written and the session is active:

```js
analyticsService.track('workout.session_interrupted', {
  course_id: courseId ?? null,
  session_id: sessionId ?? null,
  trigger: evtType, // 'pagehide' | 'visibility'
  exercise_index: currentExerciseIndex,
  completed_sets: completedSetsCount,
  elapsed_seconds: elapsedSeconds,
});
```

Guard so it fires at most once per hidden/pagehide transition (a ref flag reset on `visible`).

- [ ] **Step 2: Lint**

Run: `npm --prefix apps/pwa run lint`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add apps/pwa/src/screens/WorkoutExecutionScreen.js
git commit -m "feat(pwa): workout.session_interrupted event (recovery denominator)"
```

---

## Phase E — Build, deploy (gated), and PostHog verification

### Task E1: Full build + qa-fast

- [ ] **Step 1: Functions lint + build + tests**

Run: `npm --prefix functions run lint && npm --prefix functions run build && npm --prefix functions run test`
Expected: all green.

- [ ] **Step 2: App builds**

Run: `npm run build:landing && npm run build:creator` and a clean pwa export: `npm run build:pwa` (ensure `--clear`/clean export; verify bundle contains `wolf-20b8b`).
Expected: all succeed; pwa bundle references `wolf-20b8b` (not staging).

- [ ] **Step 3: Commit any build-config touchups (if needed)**

```bash
git add -A && git commit -m "chore: build verification for visibility-gaps instrumentation" --allow-empty
```

### Task E2: Deploy (REQUIRES USER CONFIRMATION)

- [ ] **Step 1: Ask the user to confirm prod deploy of `functions` + `hosting` to `wolf-20b8b`.** Do not run without explicit yes.
- [ ] **Step 2: On confirmation:** `firebase deploy --only functions,hosting`
- [ ] **Step 3:** Note new PWA bundle hash; returning users ramp over hours as service workers update.

### Task E3: Verify events land + build the funnel insight (PostHog MCP)

- [ ] **Step 1: Confirm each new event exists** via `read-data-schema` (`kind: events`): `subscription.checkout.created`, `.create_failed`, `.redirected` (now also `surface=pwa_web`), `.returned` (pwa), `subscription.activated`, `subscription.payment_rejected`, `subscription.cancelled`, `subscription.cancel_intent`, `.cancel_survey_submitted`, `.manage_portal_opened`, `workout.session_interrupted`. Generate a few real flows first if needed.
- [ ] **Step 2: Build the purchase funnel** with `query-funnel`: `$pageview` (program page) → `subscription.email_step.shown` → `subscription.checkout.redirected` → `subscription.activated` → `program.purchase_completed` → `activation.first_workout_completed`. Save as an insight and add to dashboard "Wake — Core Metrics" (id 1651049).
- [ ] **Step 3: Build a session-recovery insight** with `query-trends`: `workout.session_interrupted` (total) vs `workout.session_recovered` (total, broken down by `lost_current_set_progress`) vs `workout.recovery_failed` (total). Save + add to the dashboard.
- [ ] **Step 4: Sanity check** `subscription.cancelled` count vs Firestore `subscriptions` with status `cancelled` over the same window (use a read-only admin script if needed).

---

## Self-Review Notes

- **Spec coverage:** Stream 1 → Tasks B1-B4 + A3 (payment_rejected); Stream 2 → A1, A2, A3 (cancelled), C1; Stream 3 → D1, D2; funnel/dashboard close-out → E3. All spec sections covered.
- **Type/name consistency:** `buildCancellationSurveyRecord` signature is identical in A1 (definition), A1 Step 4, and A2. `proceeded_to_portal` (snake) is the persisted field; `proceededToPortal` (camel) is the function arg. Event names match the spec table exactly.
- **Testing reality:** real vitest tests where feasible (functions helper A1, pwa purchaseService B1); UI call-sites and server webhook events verified via lint/build + manual PostHog confirmation (E3) — landing/RN screens and the large webhook lack a unit harness and adding one is out of scope (YAGNI).
