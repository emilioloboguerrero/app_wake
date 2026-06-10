# Proactive Subscription Email + Funnel Logging — Design (minimal build)

- **Date:** 2026-06-05
- **Status:** Implemented on branch `feat/proactive-subscription-email`; pending staging test + deploy
- **Relationship:** Near-term mitigation. The full fix (transparent card form) is deferred pending the 3DS gate — see `2026-06-04-transparent-subscription-checkout-design.md`.

## Goal

Reduce subscription-checkout failures caused by the MercadoPago email/account mismatch, and instrument the funnel so that in ~2 days we can measure where it still breaks.

This does **not** eliminate the problem (the redirect still requires logging into a matching MercadoPago account) — it mitigates it by setting the right `payer_email` up front and telling the user which email to use.

## Scope

- **In:** proactive email step + funnel logging on **all three** subscription surfaces — PWA web (`CourseDetailScreen`, `BundleDetailScreen`), PWA native (same screens, RN modal), landing storefront (`CreatorProgramDetailScreen`).
- **Out:** one-time payments; the card-token/Bricks flow; any change to recurring billing, webhooks, or access grants.

## UX — one-tap confirm

Before initiating the subscription redirect (replacing the current *reactive* alt-email modal with a *proactive* step):

- Show the user's email prominently.
- Primary action: **"Continuar con este correo"** (one tap → proceeds with that email).
- Secondary action: **"Usar otro correo de Mercado Pago"** → reveals an email input.
- Instruction copy (always visible): **"Usa este mismo correo al iniciar sesión en Mercado Pago para completar tu suscripción."**
- The chosen email is sent as `payer_email` to the existing endpoints. No backend logic change beyond logging.
- The existing reactive 409 `requireAlternateEmail` path stays as a safety net (if MP still rejects at creation, we re-prompt).

Copy must follow Wake rules: Spanish, no emojis, no banned negation/contrast patterns.

## Data flow (unchanged except email source)

`email step → payerEmail → /payments/subscription | /payments/bundle-subscription | /public/checkout/start` → existing PreApproval creation → redirect → existing webhook → existing access grant. Nothing downstream changes.

## Observability contract (the point of this build)

One correlation id ties the funnel together: the **`subscriptionId`** (MP PreApproval id) where available, and the **`external_reference`** (`v1|{userId}|{courseId}|sub`) everywhere it isn't yet.

### Client (PWA `logger` + PostHog `analyticsService`; landing logger)
- `subscription.email_step.shown` — `{ courseId, surface }`
- `subscription.email_step.choice` — `{ courseId, surface, choice: "account" | "custom", emailsDiffer: boolean }`
- `subscription.checkout.redirected` — `{ courseId, surface, subscriptionId }`
- `subscription.checkout.returned` — `{ courseId, surface }` (fired on the post-payment / status screen)

Emails are never logged raw — only `emailsDiffer` and a redacted form.

### Backend (`functions.logger`, structured)
- On creation attempt: `subscription.create.attempt` — `{ userId, courseId, emailType: "account" | "custom", payerEmail: redacted, surface }`
- On success: `subscription.create.ok` — `{ userId, courseId, subscriptionId, emailType }`
- On MP failure: `subscription.create.fail` — `{ userId, courseId, emailType, mpStatus, mpMessage }` (extend the existing alt-email catch so we capture the MP error string/status, not just the alt-email branch).
- Webhook transition: `subscription.webhook.status` — `{ subscriptionId, userId, courseId, from, to, trialDays }` logged on every `subscription_preapproval` status change, especially the `pending → authorized` one.

### The key derived metric
Subscriptions logged at `create.ok` (status `pending`) that **never** log a `webhook.status … to: "authorized"` within ~30 min ≈ failed/abandoned on MercadoPago's page. That count, split by `emailType`, is the verification: did sending the right email up front reduce the `pending`-stranded rate?

## What's explicitly NOT changing
- PreApproval `auto_recurring`, trials, `external_reference` format.
- Webhook matching, access grants, idempotency, `processed_payments`.
- One-time payment flow.

## Rollout & safety
- Purely additive (new UI step + log lines). No schema changes.
- Test on **wake-staging** first (subscription create + webhook logs appear; redirect still works), then deploy to production with explicit confirmation (wolf-20b8b is production).
- No feature flag: this is a strict improvement over the current reactive flow and low-risk. (If preferred, it can be flag-gated — call it out before deploy.)

## Verification plan (run in ~2 days)
1. PostHog: funnel `email_step.shown → choice → redirected → returned`, split by `choice`.
2. Functions logs: ratio of `create.ok` to `webhook … authorized`, split by `emailType` — the stranded-at-pending rate.
3. `create.fail` grouped by `mpMessage`/`mpStatus` — what MercadoPago errors still occur and how often.
4. Decision input: if `custom`-email choosers strand far less than `account`-email choosers, the mitigation works; if everyone still strands at similar rates, escalate to the card-form / self-managed-recurrence decision.
