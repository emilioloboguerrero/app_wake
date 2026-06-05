# Transparent Subscription Checkout (MercadoPago Bricks) — Design

- **Date:** 2026-06-04
- **Status:** Approved design, pre-implementation
- **Scope:** Web only · subscriptions only · native frozen

---

## Problem

Subscription checkouts break a lot. We create a MercadoPago **PreApproval** with a pre-bound `payer_email` (the user's Wake account email), `status: "pending"`, and redirect the user to MercadoPago's hosted page (`init_point`). MercadoPago **requires the email/account the user authorizes with to match that pre-bound `payer_email`**. Many users' real MercadoPago account email differs from their Wake email, so the flow dies at the end — on MercadoPago's page.

A reactive "enter your MercadoPago email" recovery exists (the 409 `requireAlternateEmail` path + alt-email modal), but it only fires when MercadoPago rejects at **PreApproval creation**. The common failure happens **after redirect, on MercadoPago's hosted page**, which our code cannot intercept. That's why it's frequent despite the existing recovery.

### Root cause
The failure is intrinsic to the **redirect + MercadoPago-account-login** model. We cannot know a user's MercadoPago account email ahead of time, and we cannot force them to log into the matching account. Any fix that keeps the hosted redirect can only *reduce* failures, not eliminate them.

## Decision

Switch **web** subscription creation to MercadoPago's **transparent card flow**:

- The **Card Payment Brick** (Bricks) renders a card form in MercadoPago's hosted iframe fields, tokenizes the card **in-browser**, and returns a single-use `card_token_id`. Card data never touches our Cloud Functions.
- The backend creates the PreApproval with that `card_token_id` and `status: "authorized"`. No redirect, no MercadoPago login.
- `payer_email` becomes a non-blocking label (we use the account email). **The email-match wall ceases to exist.**

Locked sub-decisions:
- **Card form:** Card Payment Brick (handles tokenization, validation, installments). **3-D Secure handling is NOT assumed** — see the 3DS go/no-go gate below; it is the first thing we prove on staging, before any UI is built.
- **Grant path:** unchanged webhook as the single source of truth + poll of the existing `/public/checkout/status`. Authorization is synchronous, but **access timing differs by trial state** (see "Grant path & timing" below) — non-trial access can lag the first-payment webhook by up to ~1 hour.
- **Native:** frozen — keeps the redirect + existing alt-email modal. No stopgap this phase. (Native opens the MercadoPago `init_point` in `EpaycoWebView` — a legacy-named generic webview, *not* the ePayco processor — so native still routes through the same `/payments/*` endpoints. The additive framing holds.)

## Scope

**In scope (web):**
- PWA web subscription purchase (`CourseDetailScreen` + `BundleDetailScreen`).
- Landing storefront subscription purchase (`CreatorProgramDetailScreen`).

**Out of scope:**
- One-time payments (no email-match problem; guest checkout already works).
- Native iOS/Android (frozen; redirect flow untouched).
- MercadoPago provider migration.

## Architecture

The landing storefront is web-only, so `/public/checkout/start` (subscription mode) can switch fully. The PWA endpoints are called by **both** PWA-web and PWA-native, so they must support both modes:

> **`card_token_id` is a new optional field on the existing endpoints.**
> - Present → transparent authorized flow (web).
> - Absent → existing redirect flow, byte-for-byte unchanged (native + web fallback).

This keeps the change **purely additive**. Even deployed to production, current behavior is identical until a client deliberately sends a token.

Affected endpoints:
- `/payments/subscription` — PWA, single course ([functions/src/api/routes/payments.ts](../../../functions/src/api/routes/payments.ts) ~L287)
- `/payments/bundle-subscription` — PWA, bundles (~L543)
- `/public/checkout/start` (subscription mode) — landing ([functions/src/api/routes/public.ts](../../../functions/src/api/routes/public.ts) ~L617)

## Backend changes

For each endpoint, add a `card_token_id` branch:

```ts
result = await preapproval.create({ body: {
  payer_email: buyerEmail,            // account email — now just a label, no match required
  card_token_id: body.card_token_id,  // NEW
  reason, external_reference,
  auto_recurring: { /* identical to today, incl. free_trial */ },
  status: "authorized",               // was "pending"
  notification_url,
  // NEW fraud signals — see "Fraud signal" below. The hosted page collected
  // these automatically; the transparent flow must send them explicitly.
  ...{device_id: body.device_id},     // MP device session fingerprint from the client
  // additional_info / payer details sent on the call for risk scoring
}});
```

- Returns **synchronously**: `{ data: { authorized: true, subscriptionId } }` — no `init_point`.
- The Firestore subscription doc is written exactly as today (same fields, `status: "pending"` until the webhook confirms, `free_trial_days`, `next_billing_date`, etc.).
- **New failure mode:** card declined / 3DS failed → return **`400` with a defined code (`CARD_DECLINED`, non-retryable)** and a Spanish message the form renders inline. (Avoids `402`, which is not in the project's standard HTTP error table — CLAUDE.md lists 400/401/403/404/409/429/500/503. If we prefer `402`, add it to that table explicitly first.) No email-mismatch branch on the card path.
- **Double-submit idempotency (new requirement):** the redirect flow dedupes recent pending rows (the CR-6 guard in `public.ts`); the synchronous authorized path has **no equivalent** and a fast double-submit or double-firing token callback could create **two authorized PreApprovals = double charge**. Add a server-side idempotency key (e.g. `userId+courseId+token`) plus disable-on-submit on the client.
- The existing `card_token_id`-absent branch (redirect, 409 alt-email string-matching) is **left intact** for native.

### Fraud signal (must-have, new)

The hosted redirect page collected MercadoPago's **device session fingerprint** and ran full hosted fraud screening automatically. The transparent flow does **not** — we must replicate it or ship blind to fraud signal (which our production dig associates with a real `high_risk` rejection tail):

- Load MercadoPago's **device fingerprint script** on the card page and pass the resulting **`device_id`** to the endpoint, which forwards it on `preapproval.create`.
- Send **`additional_info` (payer)** on the authorized call for risk scoring.
- Treat this as **in scope, not optional** — it directly affects approval rates.

## Frontend changes

PWA (Expo→web) and landing (Vite) are separate builds, so the card form is implemented **once per app** (same pattern, two thin integrations — not literally shared):

- Load **MercadoPago.js** + the **device fingerprint script**; mount the **Card Payment Brick**, styled to match Wake.
- **Recurring-consent disclosure (new, required):** before the user authorizes, the form must clearly disclose the **recurring nature, amount, billing frequency, and how to cancel**, and capture **explicit affirmative consent** with a stored record. Leaving MercadoPago's hosted page means we lose its consent artifact; under Colombian consumer law (Ley 1480, Estatuto del Consumidor) this disclosure + consent is a legal requirement, and it's also a trust/conversion element. This is part of frontend scope.
- On token callback → POST with `card_token_id` (+ `device_id`) → on success, show inline confirmation, then poll `/public/checkout/status` until access lands. The poll must **degrade gracefully** for non-trial subs whose first-payment webhook lags (show "Tu pago se está procesando, te avisaremos" instead of an endless spinner — see "Grant path & timing").
- **Retry contract (new):** MercadoPago `card_token` is **single-use and expires in ~7 days**. On a decline, the same token **cannot** be reused — the Brick must **re-tokenize** before any resubmit, or a "retry" button silently fails. Wire the retry to re-create the token.
- **PWA web:** new `.web.jsx` card-form component used by `CourseDetailScreen` + `BundleDetailScreen` on web; native keeps `EpaycoWebView` + alt-email modal.
- **Landing:** card form replaces the redirect in `CreatorProgramDetailScreen`; `needsAltEmail` modal removed there.

### Feature flag (default OFF)
The new web card form is gated behind a flag following the existing `?wake_debug=1` / `localStorage.WAKE_DEBUG` pattern — e.g. `?wake_card=1` / `localStorage.WAKE_CARD_CHECKOUT`. Real users keep the redirect flow until we deliberately flip it on. This is the primary runtime safety net.

## Grant path & timing (verify, don't assume)

Access is granted by the existing webhook (single source of truth), but timing depends on trial state — verified in [payments.ts:978](../../../functions/src/api/routes/payments.ts):

- **Trial subs:** access is granted **synchronously** when the `subscription_preapproval` webhook reports `status: "authorized"` — flips within seconds. Good.
- **Non-trial subs:** there is **no** authorized-time grant; access depends on the **first-payment webhook**, which MercadoPago may fire **up to ~1 hour after authorization**. So a non-trial user can authorize successfully and then watch the poll spin.

Implications:
- Do **not** claim "access within seconds" for non-trial. The poll must degrade gracefully (processing message + we-will-notify, not an endless spinner).
- This is a **real unknown to validate on staging**, not a formality — confirm the actual first-payment latency for non-trial authorized PreApprovals and decide whether we need an authorized-time optimistic grant for non-trial (deferred unless the lag proves bad).

## What's removed (web only)
- Landing: `needsAltEmail` modal + retry path in `CreatorProgramDetailScreen`.
- PWA web: `showEmailModal` path in `CourseDetailScreen` (kept for native).
- Backend 409 string-matching: **kept** (native), never hit on the card path.

## Recurring logic preservation (must-not-break)

The recurring engine is entirely MercadoPago's, driven by the PreApproval's `auto_recurring` config — **identical in both flows**. The resulting authorized PreApproval is indistinguishable to MercadoPago and to our webhook from a redirect-created one. Only `status` and `card_token_id` differ at creation.

**Untouched:**
- All webhook handlers (`subscription_preapproval`, payment events): `external_reference → userId` matching, access grants, trial→paid transition, `processed_payments` idempotency.
- `auto_recurring` shape, free-trial config, 30-day rolling access, monthly-drop gate, cancellation.

**Proven by:** additive code (redirect path unchanged) + staging regression test confirming a card-token subscription produces the same subscription doc, the same webhook events, and the same access grant as a redirect one — and that the redirect path still works.

## Security / PCI

Card data is tokenized in MercadoPago's hosted iframe fields and never reaches our Cloud Functions. PCI scope stays minimal (effectively **SAQ A**, self-attestation — no third-party audit). We take on client-side flow ownership (form, declines, and — pending the Phase 0 gate — 3DS results). MercadoPago.js must be loaded from MercadoPago's CDN (never self-hosted) to preserve this.

## Money flow (unchanged)

- **Charge:** first charge processes immediately and synchronously on authorization (or after the trial), same as today.
- **Settlement/payout:** a property of the MercadoPago account, not the integration. Same account, same release schedule. **No change.**
- **Customer statements:** the validation micro-charge + reversal (and the first charge) can appear on the customer's card statement — pre-empt the "¿por qué me cobraron?" support ticket with clear copy on the confirmation screen.

## Prerequisites & account state (verify, don't assume)

1. **Card processing via API enabled** (Colombia) — confirm in the MercadoPago dashboard. The redirect flow already processes cards on this account, so likely already on; 2-minute check.
2. **Seller-account maturity** — our production `/users/me` dig found the MercadoPago account is `mercadopago_account_type: personal`, `user_type: eventual`, `required_action: simple_registration`, `billing.allow: false` (address pending). This immaturity plausibly drives the observed `high_risk` rejections and could depress the authorized-card flow's approval rate. **Complete account verification in parallel** — it's independent of the build and possibly the cheapest approval-rate win available.

## Isolation & rollout strategy

Three independent safety layers:

1. **Code isolation:** dedicated branch in a **git worktree**; `main` stays clean; nothing lands on `main` until proven.
2. **Runtime isolation:** backend additive (`card_token_id` optional) + web UI behind a default-OFF feature flag. Production behavior unchanged even after deploy until we flip the flag.
3. **Payment isolation:** test on the **wake-staging** Firebase project with **MercadoPago TEST credentials** (test access token + test cards simulating approved / declined / 3DS). Production project (`wolf-20b8b`) is never touched until verified. (See `reference_staging_runbook.md`.)

## Phase 0 — 3-D Secure go/no-go gate (FIRST task, blocking)

Before building any UI, prove whether a **3DS challenge can be escalated and completed** when the card token is consumed by `preapproval.create` with `status: "authorized"`.

### Research finding (2026-06-05) — strong NO-GO signal, empirical test still required

Two independent research passes (official docs + SDK source + community) converged:

- **The MercadoPago Node SDK's `PreApprovalRequest` type has NO 3DS fields.** Its complete body is `auto_recurring`, `back_url`, `card_token_id`, `external_reference`, `payer_email`, `preapproval_plan_id`, `reason`, `status` — no `three_d_secure_mode`, no challenge/`action_required`/`pending_challenge`. (`mercadopago/sdk-nodejs`, `src/clients/preApproval/commonTypes.ts`.)
- **3DS is documented only on `POST /v1/payments`** (Checkout API / Bricks), using params (`three_d_secure_mode`, `capture`, `binary_mode`) that **don't exist on `/preapproval`**. The challenge response (`status: pending`, `status_detail: pending_challenge`, `three_ds_info.external_resource_url`) is a payments-only surface.
- The subscription `authorized` flow validates the card via an automatic **minimum-amount validation charge**; subscription rejection handling is documented as `status_detail` reasons (e.g. `cc_rejected_high_risk`) with a 4-attempt recycle — **not** a recoverable challenge. Inference: a 3DS-mandating card likely returns `cc_rejected_*`, not a completable challenge.
- The most-referenced LATAM community example (goncy) builds subscriptions with the **hosted redirect** (`status: pending` + `init_point`), sidestepping transparent 3DS entirely.

Both passes stress this is **inference from silence** — no source explicitly says "preapproval can't do 3DS." So we still run the empirical test (harness in `/poc`), but expectations should be set to **likely NO-GO**.

### The gate

- **Go:** the validation charge with a 3DS-forcing test card either authorizes (frictionless) or returns a completable challenge → proceed with the full build.
- **No-go (expected):** the 3DS-forcing card rejects (`cc_rejected_*`) with no challenge path → the clean transparent approach is not viable for 3DS-mandating Colombian issuers. Move to the fallback decision below.

### If NO-GO — fallback options (each has a real cost; decide deliberately)

1. **Hosted redirect, kept** — `status: pending` + `init_point`; MercadoPago owns 3DS. **But this reintroduces the original email-match problem** we set out to kill. Net: no progress on the core issue.
2. **`/v1/payments` (3DS-capable) + self-managed recurrence** — authenticate the first charge via Bricks (which *does* support the 3DS challenge), then run recurrence ourselves by storing the card (Customer + Cards API) and charging monthly via our own scheduler. **Eliminates the email problem AND keeps 3DS — but we take over recurring billing** (a cron charging saved cards, dunning, retries), losing the "recurrence is MercadoPago's job" guarantee. Significantly larger and riskier.
3. **Provider reconsideration** — out of scope here, but CLAUDE.md already notes MercadoPago is slated for future replacement; a NO-GO is a data point for that timeline.

This gate decides whether the whole approach is viable, and if not, which fallback we accept.

## Testing matrix (staging, MP test cards)

- Approved card → authorized → webhook → access granted.
- Declined card → inline Spanish error, no PreApproval orphaned.
- 3-D Secure challenge card → Bricks challenge → success.
- Subscription **with** free trial → no immediate charge, trial access granted, next-charge scheduled.
- Subscription **without** trial → immediate first charge.
- Bundle subscription path.
- Landing path + PWA web path.
- **Double-submit:** rapid resubmit / double-firing token callback creates exactly **one** authorized PreApproval (idempotency guard holds).
- **Retry:** after a decline, retry re-tokenizes (single-use token not reused) and succeeds.
- **Consent:** the recurring-disclosure consent record is stored on authorization.
- **Fraud signal:** `device_id` + `additional_info` reach `preapproval.create`; compare approval/`high_risk` rates vs the redirect baseline.
- **Regression:** redirect path (`card_token_id` absent) still works unchanged.
- Confirm `auto_recurring` set identically to the redirect flow; confirm subscription doc + webhook events + grant match.

## Open questions / risks

- **3-D Secure on the preapproval path — the #1 risk.** Resolved by the Phase 0 go/no-go gate above; not assumed handled. (Resolves the earlier locked-vs-open contradiction: 3DS is *unproven* until Phase 0 passes.)
- **Non-trial first-payment latency** — validate the real lag on staging (see "Grant path & timing"); decide if an authorized-time optimistic grant is needed for non-trial.
- **Seller-account maturity** — pursue verification in parallel (see Prerequisites); may be the largest approval-rate lever.
- MercadoPago account card-API enablement — verify before staging test.
- Exact synchronous response contract for the confirmation screen (success copy + poll timing + processing-fallback copy) — finalize during implementation.
