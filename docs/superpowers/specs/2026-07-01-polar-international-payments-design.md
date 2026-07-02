# Polar International Payments — Design

**Date:** 2026-07-01
**Status:** Approved design, pending implementation plan
**Branch:** `feature/polar-international-payments`

## Problem

MercadoPago works poorly for international customers and its subscription UX is bad. Wake needs to accept international card subscriptions from a global, dispersed customer base while keeping MercadoPago for Colombia (where it handles PSE/Nequi/COP that a card-first provider cannot).

## Decision (Phase 1)

Add **Polar** (merchant-of-record) for international payments, coexisting with MercadoPago. Polar is the seller of record for Wake's digital products; Wake is the single seller and coaches are paid **out-of-band** (no split — no MoR supports creator splits; that is a future Phase 2 with dLocal or Stripe Atlas+Connect, tracked separately).

Scope parity with MercadoPago:
- Recurring **subscriptions** and **one-time** purchases (1-year access).
- **Free trials** (parity with `course.free_trial`).
- Routing **automatic by country** with a manual **override toggle**.

Out of scope (Phase 1): creator/marketplace splits; migrating existing Colombian subscribers off MercadoPago; the creator dashboard triggering checkout (purchasing stays PWA-only).

## Checkout integration approach

**Polar hosted checkout (redirect).** Chosen over embedded checkout and custom card UI because it mirrors the existing MercadoPago `init_point` redirect pattern exactly, reuses the current post-purchase polling and access gate untouched, and lets Polar own cards/3DS/tax. This is the fastest, most robust path.

`userId`/`courseId`/`paymentType` are carried through Polar via checkout **metadata** (the analog of MercadoPago's `external_reference`), read back in the webhook.

## Architecture

### Cloud Functions

New route file `functions/src/api/routes/polar.ts`, mounted in `functions/src/api/app.ts`. Keeps the already-large `payments.ts` (~2000 lines) untouched and isolates the two providers over the same shared "grant access" core.

Endpoints:
- `POST /payments/polar/checkout` — create a Polar checkout session. Body `{ courseId, paymentType }` where `paymentType ∈ { "subscription", "one_time" }`.
- `POST /payments/polar/webhook` — receive and verify Polar events.
- `POST /payments/polar/subscriptions/:subscriptionId/cancel` — cancel via Polar API (keeps in-app cancel UX + cancellation feedback survey).

Reused (no changes to their contracts):
- `courseAssignment.ts` — `assignCourseToUser()` writes the course entry.
- Capacity check helpers, `calculateExpirationDate`, email senders.
- `processed_payments/{id}` collection for idempotency.

Secrets (Firebase Secret Manager), added to the `api` function's `secrets: [...]` array and read via `process.env`:
- `POLAR_ACCESS_TOKEN`
- `POLAR_WEBHOOK_SECRET`

### PWA

- `apps/pwa/src/services/purchaseService.js` gains **provider routing**. `preparePurchase` / `prepareSubscription` resolve the provider (see Routing) and, for Polar, call `POST /payments/polar/checkout`. The return contract is unchanged (`{ success, checkoutURL, subscriptionId }`) so the screen code barely changes.
- Buy screen (`CourseDetailScreen.js`): display price in COP (MercadoPago) or USD (Polar) per resolved provider, plus a discreet **toggle** to switch method/currency ("pagar con tarjeta internacional (USD)" / "pagar en Colombia (COP)").
- Post-purchase `/comprado` screen and its polling of `GET /public/checkout/status` are **reused unchanged** — the status endpoint reads the courses map, which is provider-agnostic.

### Creator dashboard

No changes. Purchasing remains PWA-only.

## Routing

Provider resolution based on `users/{userId}.country` (ISO2, set at onboarding):
- `country === "CO"` → MercadoPago (default).
- Any other value, **including empty/unknown** → Polar (default).
- A manual toggle on the buy screen always lets the user switch provider/currency, correcting a wrong or missing country.

## Data flow

### Purchase
1. User (international, or toggled to USD) → PWA calls `POST /payments/polar/checkout { courseId, paymentType }`.
2. Function validates course (exists/published/capacity — reuse existing helpers), resolves the course's Polar product, creates a Polar checkout with metadata `{ userId, courseId, paymentType }` and a success URL to `/comprado?courseId=…`, writes a `pending` doc to `users/{userId}/subscriptions/{checkoutId}`, returns `{ checkoutURL, checkoutId }`.
3. PWA opens `checkoutURL` (new tab on web / WebView on native). User pays on Polar.
4. Polar fires the webhook. Function verifies signature → idempotency check → reads metadata → in a single `db.runTransaction`: `assignCourseToUser(...)` + update the subscription doc + write `processed_payments`. Sends confirmation email.
5. Polar redirects to `/comprado?courseId=…`. PWA reuses existing polling of `GET /public/checkout/status` until access is active.

### Webhook events handled
- Order paid / checkout succeeded (one-time and first subscription charge) → grant/renew access.
- Subscription active/trialing → grant (with trial handling below).
- Subscription canceled → mark subscription cancelled; keep access until `expires_at`.
- Subscription revoked / refund / chargeback → revoke access (`courses.{courseId}.status = "cancelled"`).

Exact Polar event names and payload fields are confirmed against Polar's webhook docs during implementation; the mapping above is by semantic event type.

## Data schema

### `courses/{courseId}` — new `polar` map (manually populated from the Polar dashboard)
```
polar: {
  subscription_product_id: "prod_…",   // recurring product in Polar
  onetime_product_id: "prod_…",        // one-time product (if offered)
  price_usd_monthly: 20,               // display only
  price_usd_onetime: 180               // display only
}
```
Products are created manually in the Polar dashboard (few courses); their IDs are pasted onto the course docs. `price_usd_*` are display-only; the authoritative charge is the Polar product's price.

### `users/{userId}/subscriptions/{id}` — same fields as today, plus:
- `provider: "polar"` (distinguishes from MercadoPago records).
- `currency_id: "USD"`.
- `management_url`: the Polar customer portal URL.
- `next_billing_date`, `status`, `transaction_amount`, `last_payment_id`, `created_at`, `updated_at` — same semantics as the MercadoPago records.

### `users/{userId}.courses[courseId]` — unchanged shape
Written by the reused `assignCourseToUser()`: `status`, `expires_at`, `is_trial`, `access_duration`, `purchased_at`, and course metadata. The access gate `isCourseEntryActive()` (status active OR is_trial, and `expires_at` not past) works unchanged — it is provider-agnostic.

## Subscription management

The Polar customer portal URL is stored as `management_url`; the existing "manage subscription" UI opens it regardless of provider.

**Cancellation** uses a dedicated endpoint `POST /payments/polar/subscriptions/:subscriptionId/cancel` (mirrors the existing `updateSubscriptionStatus` for MercadoPago) so the in-app cancel UX and the `subscription_cancellation_feedback` survey are preserved. It validates the user owns the subscription, calls the Polar API to cancel, updates the subscription doc, and (optionally) records feedback. Access is retained until `expires_at`.

## Trials

The Polar product is configured with a trial period consistent with `course.free_trial.duration_days`. On a subscription webhook in trialing/active state with a trial: grant access with `is_trial: true` and `expires_at` = trial end (mirrors the MercadoPago trial grant). On the first real charge (renewal), the renewal path extends `expires_at` and sets `is_trial: false`.

## Error handling

- Checkout creation failure → standard `{ error: { code, message } }`, Spanish message in the PWA.
- Invalid webhook signature → 401, no processing.
- Transient/unexpected webhook error → 500 (Polar retries); already-processed/duplicate → 200. Idempotency via `processed_payments` prevents double-grant.
- Refund/chargeback → revoke access (`status = "cancelled"`), mirroring MercadoPago.
- Cancellation → access retained until `expires_at` (grace to period end), same as today.

## Testing

- **Polar sandbox** end-to-end: subscription purchase, one-time purchase, trial start + first charge, cancellation, refund/revoke.
- **Unit:** webhook signature verification, metadata parsing, idempotency (duplicate event → single grant).
- `qa-fast` (ESLint + `tsc` build on `functions/`) before any PR.
- PWA: verify routing (CO → MercadoPago, international → Polar, toggle override).

## Manual setup in Polar (owner task, parallel to implementation)

1. Create products (subscription + one-time) with USD prices and trial periods.
2. Configure the webhook endpoint URL and copy the signing secret → `POLAR_WEBHOOK_SECRET`.
3. Copy the access token → `POLAR_ACCESS_TOKEN`.
4. Paste product IDs onto each course's `polar` map.

## Open items to confirm during implementation
- Exact Polar webhook event names/payload shape (confirm against Polar docs).
- Whether one-time and subscription require separate Polar products or one product with multiple prices.
- Polar's trial configuration mechanism (product-level vs checkout-level override).
