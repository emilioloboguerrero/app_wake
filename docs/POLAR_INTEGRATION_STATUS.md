# Polar International Payments — Status & Handoff (2026-07-02)

Companion to the design spec: `docs/superpowers/specs/2026-07-01-polar-international-payments-design.md`.

## TL;DR

Phase 1 of the Polar (merchant-of-record) integration is **BUILT, MERGED to `main`, and DEPLOYED to production** (`wolf-20b8b`), running in **SANDBOX mode** (`POLAR_SERVER=sandbox` + sandbox secrets) so it can be tested on prod infrastructure with test cards and **no real money**. MercadoPago (Colombia) is untouched and fully working. Everything up to the final card payment is validated live. **Remaining: wire the public storefront buy page, finish the E2E card test, then the go-live flip to real money.**

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
- **`services/polarProducts.ts`** — `provisionPolarProduct()`; creates a Polar product (recurring `month` or one-time; fixed USD cents; trial from `course.free_trial`, capped 14d), returns the `polar.*` fields. ⚠️ Creates a **fresh product on every price change** and orphans the old one (see follow-ups).
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

## Deployed state (production `wolf-20b8b`)

- **`functions:api`** deployed with `POLAR_ACCESS_TOKEN` + `POLAR_WEBHOOK_SECRET` (**sandbox** values, in Secret Manager) + **`POLAR_SERVER=sandbox`** via `functions/.env.wolf-20b8b` (gitignored — see `.gitignore`).
- **`hosting`** deployed (PWA toggle/USD + creator dashboard USD field). Verified the PWA bundle uses **production** Firebase config (`wolf-20b8b`), not staging (metro-cache check passed).
- Smoke tests: `/api/v1/health` 200, polar checkout 401 (auth-gated), polar webhook 403 (signature-gated); `/app`, `/creators`, `/` all 200.
- Note: `firebase deploy` runs a **`notify-deploy` postdeploy hook** that commits + pushes `main` and posts to `wake_ops` — this is the source of the "mystery" deploy commits/branch moves seen earlier.

## Polar account (SANDBOX)

- Org **"Wake"**, country **CO**, sandbox environment. Payout connected (Stripe **test** account).
- **Access token**: organization token (sandbox) — set in Secret Manager. **ROTATE at/before go-live** (it was shared in chat).
- **Webhook**: sandbox endpoint → `https://wakelab.co/api/v1/payments/polar/webhook`; signing secret set.
- Dashboards: sandbox `https://sandbox.polar.sh`, production `https://polar.sh`, docs `https://docs.polar.sh`.

## Validated live (2026-07-02)

- `products.create` payload accepted (recurring `month`, fixed USD cents, trial, metadata).
- `checkouts.create` returns hosted URL; **metadata round-trips** (`userId/courseId/paymentType`).
- **MoR tax calc works**: $21 → $22.86 (NY sales tax computed by Polar at checkout).
- Checkout form renders + accepts email/name/full billing address (Playwright).
- **Webhook signature verification is live** (rejects unsigned → 403).
- ❗ **NOT yet completed:** final card payment → `order.paid` → access grant. Blocked in automation because the **Stripe Payment Element doesn't render/fill in headless Chrome** (a Stripe test-tooling limitation, not a Wake bug). To be confirmed via a **human manual purchase**.

## Código ABS test state (the program used for testing)

- `courseId = ezJWUr3wJvaeptIM5f86`, **published**, `creator_id = yMqKOXBcVARa6vjU7wImf3Tp85J2`.
- `price_usd = 21`, `polar.subscription_product_id = 2e48089f-8c72-4ec3-b1c1-923e9cc5a684` ($21/mo). No trial.
- Orphaned $20 product (from an earlier save) was archived.

---

## Known gaps / follow-ups

1. **Public buy page NOT wired for Polar** — `apps/landing/src/screens/CreatorProgramDetailScreen.jsx` (the shareable storefront buy page) has zero Polar handling. The international routing/USD/toggle exist ONLY in the in-app PWA `CourseDetailScreen`. **This is the next task** and is required for a real international launch.
2. **Product cleanup on price change** — `provisionPolarProduct` orphans the old product; should archive it (`PATCH /v1/products/{id}` `{is_archived:true}`) after repointing.
3. **Trial CTA on the Polar path** — Polar branch shows a single "Comprar - $X/mes" button, no "Empezar prueba de N días". Cosmetic.
4. **Portal button not wired in UI** — the `/subscriptions/:id/portal` endpoint exists but no button calls it.
5. **Go-live flip** — see below.
6. **Owner/creator/admin accounts free-grant their own programs** → you cannot test the buy flow from the program owner's account; use a regular non-CO account.

### Testing caveat
To test a purchase you need a **non-CO, non-owner** account (or the toggle). The program owner (creator/admin) gets free access to their own program, so no buy button appears.

### Go-live flip (to charge real money)
1. In **production** Polar (`polar.sh`, not sandbox): complete org details, connect the **real** payout (Colombian bank via Stripe Connect, KYC), create a **production access token** + **production webhook** (→ `wakelab.co/api/v1/payments/polar/webhook`).
2. Swap `POLAR_ACCESS_TOKEN` / `POLAR_WEBHOOK_SECRET` secrets to the live values.
3. Set `POLAR_SERVER=production` (edit `functions/.env.wolf-20b8b`, or delete the file — default is production).
4. Redeploy `functions:api`.
5. Re-enter the international prices in the dashboard (provisions **live** products).

---

## Next task (new chat): wire the public buy page for Polar

**File:** `apps/landing/src/screens/CreatorProgramDetailScreen.jsx` (+ its `.css`).

**Crux to investigate first:** the `/payments/polar/checkout` endpoint requires `validateAuth` (a Firebase ID token). The public storefront buyer may not be logged in. **Determine how the existing public MercadoPago buy flow authenticates** (it appears to use a magic-link / `/comprado` polling flow) and mirror it for Polar — or add a public Polar checkout path. Do NOT assume; read the current public buy flow end to end before designing.

**Then add:** USD price display from `program.polar.price_usd_monthly` / `price_usd_onetime`, provider selection (by buyer country if known, else a clear method choice/toggle), a call to the Polar checkout, and open the returned `checkout_url`. Keep MercadoPago as the Colombian path.

**Verify:** `qa-fast` on `functions/` if touched; babel-parse the landing JSX; build `build:landing`; then a full-stack deploy (`build:all` + `firebase deploy --only hosting`) — remember to keep `POLAR_SERVER=sandbox` for continued testing.
