# Polar International Payments — Status & Handoff (2026-07-03)

Companion to the design spec: `docs/superpowers/specs/2026-07-01-polar-international-payments-design.md`.

## TL;DR

Phase 1 of the Polar (merchant-of-record) integration is **LIVE IN PRODUCTION with real money** (`wolf-20b8b`, `POLAR_SERVER=production`, live secrets, Polar org approved). MercadoPago (Colombia) is untouched. International USD pricing is now **ON BY DEFAULT for every published course** (USD auto-derived from the COP price), the public buy page surfaces the COP↔USD toggle on both the hero and the landing-section CTA block, and portal-side cancellations are reflected via the `subscription.updated` webhook. The full E2E purchase path (checkout → grant → subscription → ledger → idempotency) and the cancel/re-activate webhook path are **verified live**. See "2026-07-03 update" below for the current state.

---

## 2026-07-03 update — international-by-default + go-live verified

Shipped + deployed to prod (commit `6dd670f`, `functions:api` + hosting):

- **International USD on by default.** `creator.ts` PATCH `/creator/programs/:id` now auto-provisions a Polar product for any **published** course with a COP price, deriving USD via `deriveUsdFromCop(cop) = max(1, round((cop/3500)*1.10))` (in `polarProducts.ts`). An explicit `price_usd` from the creator pins it **manual** (`courses.{id}.polar.price_source_monthly|_onetime = "manual"`) and stops auto re-derivation; auto prices re-derive + re-provision when the COP price changes. Re-provisioning **archives the superseded product** (`archivePolarProduct` → `products.update {isArchived:true}`). Legacy products (a `polar` id with no `price_source`) are treated as manual — never auto-overridden.
- **`subscription.updated` webhook handler** (`polar.ts`). Reflects portal-side cancels/re-activations: `cancel_at_period_end` (or `canceled`/`revoked` status) → local sub `cancelled` (access retained until `expires_at`); back to active/not-scheduled → `active`. Polar was already delivering this event; only the handler was missing. **Verified live** (reversible cancel→cancelled→un-cancel→active, ~3s each).
- **Public buy page.** `CreatorProgramDetailScreen.jsx` — the hero COP↔USD toggle is mirrored on the creator-authored landing-section CTA block (e.g. "Empieza hoy"), which shows the active provider's price and switches both surfaces in sync. The earlier standalone "Suscríbete con precio internacional" card below the hero (and its `handleInternationalBuy`) was removed 2026-07-05.
- **Backfill.** `scripts/backfill-polar-international.js` (dry-run default, `--live`) provisioned: **Método Bejarano `NTQIWMZBOxntwmUiXQZp` → $25/mo** (product `330a1109-44df-4c45-995b-64dbd47c090d`) and **BOOST X JFF `352ruaYiQ4Sa6oXz1HOO` → $41 one-time** (product `6402bf4a-2431-42a8-adf5-2bf9eeea7a15`), both `price_source: "auto"`.
- **Código ABS** (`ezJWUr3wJvaeptIM5f86`) is **already at $25/mo** (product `1f10c144-9da8-40d6-91e0-2fb276151045` charges $25.00). The earlier "$4" was a separate orphaned test product `d14bd62f-9881-47ec-95ea-b8e9eab14793`.
- **E2E purchase — validated** via the live $4 test purchase (order `540b5044…`, user `oXKlavb5…`/emilioprieva): course active (expires 2026-08-03), `provider:"polar"` sub doc, `payment_ledger/polar_order_540b5044…` (`initial`, gross $4 / net $3.24 / provider_fee $0.76 estimate, `platform_commission_rate: null`), `processed_payments` approved.
- **Polar sub management = single "Gestionar suscripción" → Polar portal** (`2afefe4`). PWA `SubscriptionsScreen.js`: dropped the Polar in-app cancel + card-update buttons for one portal action (cancel, resume/un-cancel, card, invoices; org `allow_customer_updates:true`). Portal actions sync back via `subscription.updated`. MP keeps its in-app cancel. `e30c0ab`: show that button for cancelled-at-period-end Polar subs (was hidden by a `status==='cancelled' → null` early-return) and relabel "Próximo cobro" → "Acceso hasta" when cancelled. **In-app cancel verified live** (200 → Firestore `cancelled` + Polar `cancel_at_period_end:true`).
- **Hosting cache fix** (`firebase.json`): the service worker was served `max-age=31536000` (frozen) and the PWA entry `/app/` fell to the default `max-age=3600`, so deploys weren't reaching installed PWAs. Firebase Hosting = **last-matching header rule wins**; reordered so SPA scopes + `sw.js` + HTML are `no-cache` and hashed assets stay 1-year. Verified live.

**DONE (this session, later):**
- **$4 test sub refunded** — order `540b5044…` refunded ($4, `succeeded`); the `order.refunded` webhook revoked access (course `cancelled`) and wrote `payment_ledger/polar_refund_540b5044…` (net $3.24). All Polar webhook paths now verified live (order.paid, subscription.updated, subscription.canceled, order.refunded).
- **apiClient App Check resilience** — fixed + deployed (`#withTimeout` on token fetches, bounded App Check getter, force-refresh App Check on 401 retry).
- **Hosting cache-header bug** — fixed + verified (frozen `sw.js` / `/app/` at 3600 → deploys now reach installed PWAs).
- **Cancellation-reason** — NO config needed: Polar captures it natively in the portal cancel flow (`customer_cancellation_reason` on the subscription, visible in the Polar dashboard).

**Still OPEN:**
- **`PLATFORM_COMMISSION_RATE`** still `null` (fill when the owner decides Polar vs MP commission).
- Trial CTA on the Polar path — intentionally not built (no Polar course uses a free trial today; would be speculative).
- Dev helpers in `scripts/`: `backfill-polar-international.js`, `polar-inspect.js`, `polar-test-sub-updated.js`, `polar-refund-test-sub.js`.

---

## What was built

**Branch:** `feature/polar-international-payments` → merged (fast-forward) into `main`.
Key commits: `3d0aa0d` (core checkout/webhook/cancel/portal + PWA), `1d943c5` (auto-provision from creator editor), `a598ca6` (gitignore per-project env), `14610bc` (follow-up notes), plus `deploy(...)` commits from the `notify-deploy` postdeploy hook.

### Functions (`functions/src/api/`)
- **`routes/polar.ts`** — new. Endpoints (mounted under `/api/v1`):
  - `POST /payments/polar/checkout` — creates a Polar hosted checkout with metadata `{userId, courseId, paymentType}`; returns `{ checkout_url, checkout_id }`. Auth-gated (Firebase token). Validates course published + capacity + one_on_one lock; resolves `course.polar.*_product_id`.
  - `POST /payments/polar/webhook` — **public** (in `PUBLIC_PATHS`); verifies Standard-Webhooks signature via `validateEvent(req.rawBody, headers, secret)`; idempotent via `processed_payments`. Grants: `order.paid` (grant/renew via `assignCourseToUser`), subscription `trialing` (trial grant with `is_trial`). Revokes: `subscription.revoked`, full `order.refunded`. `subscription.canceled` keeps access until `expires_at`.
  - `POST /payments/polar/subscriptions/:id/cancel` — own endpoint (cancel-at-period-end via Polar API) + cancellation-feedback survey (mirrors MercadoPago).
  - `POST /payments/polar/subscriptions/:id/portal` — returns a fresh Polar customer-portal URL.
- **`services/polarClient.ts`** — `getPolarClient()`; reads `POLAR_ACCESS_TOKEN`, selects base by `POLAR_SERVER` (`sandbox`|`production`).
- **`services/polarProducts.ts`** — `provisionPolarProduct()` (create), `deriveUsdFromCop()` (USD from COP), `archivePolarProduct()` (archive superseded product). Subscription = recurring `month`; one-time = single price; fixed USD cents; trial from `course.free_trial` capped 14d. On a price change the caller provisions a fresh product, repoints the course, and **archives the old product** (fixed 2026-07-03).
- **`services/polarHelpers.ts`** + **`polarHelpers.test.ts`** — pure helpers (product resolution, metadata parse, cents→major, date normalize, renewal/trial classification) + **22 unit tests**.
- **`routes/creator.ts`** — `PATCH /creator/programs/:programId` now accepts **`price_usd`** (whole USD ≥ 1). After the doc write it **auto-provisions** the Polar product and writes `courses/{id}.polar.*`. Best-effort: a Polar failure (or unconfigured token) never blocks the price save; response includes `polar_provisioning: "ok" | "failed"`.
- **`index.ts`** — `POLAR_ACCESS_TOKEN`, `POLAR_WEBHOOK_SECRET` secrets defined + bound to the `api` function.
- **`app.ts`** — mounts `polarRouter`; `/payments/polar/webhook` added to `PUBLIC_PATHS`.

### PWA (`apps/pwa/`)
- **`services/purchaseService.js`** — `resolveDefaultProvider(country)` (`CO`→`mercadopago`, else/unknown→`polar`), `preparePolarCheckout(courseId, paymentType)`, and provider routing inside `preparePurchase`.
- **`screens/CourseDetailScreen.js`** — provider by `userDocData.country` + a **toggle both ways** ("Pagar con tarjeta internacional (USD)" / "Pagar en Colombia (COP)"), USD price display for the Polar path, and the Polar path **skips the MercadoPago email step**.

### Creator dashboard (`apps/creator-dashboard/`)
- **`components/program/GroupProgramView.jsx`** — new **"Precio internacional"** field (prefills a suggested default = COP ÷ 4000; editable). Saves `{ price_usd }` via `PATCH /creator/programs/:id`.

### Data model
- `courses/{id}.polar = { subscription_product_id, onetime_product_id, price_usd_monthly, price_usd_onetime }`; plus flat `price_usd` (creator input).
- `users/{id}/subscriptions/{polarSubId}`: `provider:"polar"`, `status`, `currency_id:"USD"`, `next_billing_date`, `management_url`, `customer_id`, …
- `users/{id}.courses[courseId]`: **unchanged shape**; the access gate `isCourseEntryActive()` is provider-agnostic.
- `processed_payments/polar_order_{orderId}`, `polar_trial_{subId}`: idempotency keys.

---

## Deployed state (production `wolf-20b8b`) — LIVE, real money

- **`functions:api`** deployed with **live** `POLAR_ACCESS_TOKEN` (v3, full-scope) + `POLAR_WEBHOOK_SECRET` (v2) in Secret Manager, and **`POLAR_SERVER=production`** via `functions/.env.wolf-20b8b` (gitignored). Read the token for ops: `gcloud secrets versions access latest --secret=POLAR_ACCESS_TOKEN --project=wolf-20b8b` (curl not on PATH — use node fetch; never echo the token).
- **`hosting`** deployed. Cache headers fixed 2026-07-03 (SPA entry + `sw.js` are `no-cache`, hashed assets 1-year) so deploys reach installed PWAs.
- Note: `firebase deploy` runs a **`notify-deploy` postdeploy hook** that commits + pushes `main` and posts to `wake_ops` — the source of the "mystery" deploy commits.

## Polar account (PRODUCTION)

- Org **"Wake"** (id `cea4c447-2c0f-4b3c-a26a-8dc16c0d29f2`, slug `wake`), **approved**, production environment, real payout connected.
- **Access/webhook secrets**: live values in Secret Manager (see above). Prod webhook → `https://wakelab.co/api/v1/payments/polar/webhook`, subscribed to `order.paid|refunded`, `subscription.active|created|updated|canceled|revoked|uncanceled`, etc.
- `subscription_settings.allow_customer_updates: true` (portal allows cancel/resume/card). Cancellation reason captured natively (`customer_cancellation_reason` on the subscription).
- Dashboard: `https://polar.sh`; docs `https://docs.polar.sh`.

## Validated live (2026-07-02 sandbox → 2026-07-03 production)

- **Full E2E purchase confirmed on prod** (real $4 card charge): `checkouts.create` → metadata round-trip → `order.paid` → `assignCourseToUser` grant + `provider:"polar"` sub doc + `payment_ledger` (initial, gross $4 / net $3.24) + `processed_payments` approved. MoR tax computed by Polar at checkout.
- **All webhook side-effect paths verified live:** `order.paid` (grant), `subscription.updated` (portal cancel→reactivate reflection), in-app `cancel` (Firestore + Polar `cancel_at_period_end`), `order.refunded` (revoke access + `payment_ledger/polar_refund_…`). Signature verification rejects unsigned (403).

## Código ABS (the program used for testing)

- `courseId = ezJWUr3wJvaeptIM5f86`, **published**, `creator_id = yMqKOXBcVARa6vjU7wImf3Tp85J2`.
- **$25/mo** — `polar.subscription_product_id = 1f10c144-9da8-40d6-91e0-2fb276151045` (charges $25.00). (Earlier sandbox/test products $20/$21/$4 — e.g. orphan `d14bd62f` — are superseded.)

---

## Known gaps / follow-ups

1. ~~**Public buy page NOT wired for Polar**~~ — **DONE (deployed 2026-07-02).** `apps/landing/src/screens/CreatorProgramDetailScreen.jsx` now has provider selection (timezone/locale heuristic default + COP↔USD toggle when both methods exist), USD price display from `program.polar`, and calls `POST /payments/polar/checkout`. Backend: `shapePublicProgramDetail` exposes `program.polar` (display prices + availability booleans, never product IDs); the Polar checkout endpoint gained an already-owned 409 guard (parity with MP). Landing service: `startPolarCheckout` in `storefrontCheckoutService.js`. See "Public buy page — DONE" below.
> **NOTE:** the numbered follow-ups below were the 2026-07-02 sandbox-era gaps. Most are now DONE — see the "2026-07-03 update" section at the top of this doc for the authoritative current state. Kept for history.

2. ~~**Product cleanup on price change**~~ — **DONE.** `archivePolarProduct` archives the superseded product on re-provision.
3. **Trial CTA on the Polar path** — still open, intentionally deferred (cosmetic; no Polar course uses a free trial today, so building it would be speculative).
4. ~~**Portal button not wired in UI**~~ — **DONE.** The Polar sub row is now a single "Gestionar suscripción" that opens the portal.
5. ~~**Go-live flip**~~ — **DONE 2026-07-03** (`POLAR_SERVER=production`, live secrets, prod org approved, real payment verified).
6. **Owner/creator/admin accounts free-grant their own programs** → you cannot test the buy flow from the program owner's account; use a regular non-CO account (testing caveat below still applies).

### Testing caveat
To test a purchase you need a **non-CO, non-owner** account (or the currency toggle). The program owner (creator/admin) gets free access to their own program, so no buy button appears.

---

## Public buy page — DONE (deployed 2026-07-02)

Wired `apps/landing/src/screens/CreatorProgramDetailScreen.jsx` (+ `.css`) for Polar.

**Auth crux — resolved:** the public storefront is NOT anonymous. The buyer signs up / logs in via `AuthModal` (Google or email/password → real Firebase account) BEFORE checkout, so `startStorefrontCheckout` already sends a Firebase ID token + App Check. Both the MP `/public/checkout/start` and `/payments/polar/checkout` sit behind the SAME `validateAuth` + `enforceAppCheck` gate (the `/public/` prefix is just naming, not an auth bypass). So the landing calls the existing Polar checkout endpoint with the exact auth it already uses for MP — no anonymous/magic-link checkout path. The magic-link on `/comprado` is post-payment account recovery, not checkout auth. `/comprado` polling (`getCheckoutStatus`) is provider-agnostic and unchanged; the Polar checkout already builds the `/{username}/comprado` success URL.

**Shipped:**
- Backend `public.ts`: `shapePublicProgramDetail` exposes `program.polar = { priceUsdMonthly, priceUsdOnetime, hasSubscription, hasOnetime }` — display prices + availability booleans only, never product IDs.
- Backend `polar.ts`: already-owned 409 guard on `/payments/polar/checkout` (parity with MP's `alreadyPurchased`), to stop a returning buyer double-charging.
- Landing `storefrontCheckoutService.js`: `startPolarCheckout({ courseId, paymentType })` — same transport as the MP storefront checkout.
- Landing screen: provider selection via a timezone/locale heuristic default (`America/Bogota` or `es-CO` → COP; else → USD), clamped to available methods, with a COP↔USD toggle shown only when both exist; USD price display; Polar CTAs that skip the MP email step and redirect to `checkout_url`.

**Verified live:** `GET /public/creators/bejaranofit/programs/ezJWUr3wJvaeptIM5f86` returns `polar:{priceUsdMonthly:21,hasSubscription:true}` alongside `subscriptionPrice:79000` (so Código ABS shows the toggle); `/payments/polar/checkout` 401s without auth; health 200.

**Remaining:** human E2E card test (a person completes the Polar checkout with `4242 4242 4242 4242` — the Stripe Payment Element needs a real browser) and confirms the webhook granted access in Firestore. Note: the heuristic keys off the BROWSER timezone/locale, not the account country — a Bogotá browser defaults to COP even for a non-CO account, so click "Pagar con tarjeta internacional (USD)" (or test from a non-Bogotá browser) to exercise the Polar path.
