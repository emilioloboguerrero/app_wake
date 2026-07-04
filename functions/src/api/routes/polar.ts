// Polar (merchant-of-record) — international card payments. Coexists with
// MercadoPago (kept for Colombia); the PWA routes provider per-country. This
// file mirrors the patterns in payments.ts (MercadoPago) but for Polar, and
// reuses the shared grant core (assignCourseToUser + processed_payments).
//
// Design: docs/superpowers/specs/2026-07-01-polar-international-payments-design.md
import {Router} from "express";
import type {Request} from "express";
import * as functions from "firebase-functions";
import {validateEvent, WebhookVerificationError} from "@polar-sh/sdk/webhooks";
import {db, FieldValue} from "../firestore.js";
import {validateAuth} from "../middleware/auth.js";
import {validateBody} from "../middleware/validate.js";
import {checkRateLimit} from "../middleware/rateLimit.js";
import {WakeApiServerError} from "../errors.js";
import {EMAIL_RE, COURSE_ID_RE, calculateExpirationDate} from "../services/paymentHelpers.js";
import {assignCourseToUser} from "../services/courseAssignment.js";
import {buildLedgerEntry, writeLedgerEntryBestEffort} from "../services/paymentLedger.js";
import {assertCourseHasSeat} from "../services/capacity.js";
import {getActiveOneOnOneLock} from "../services/enrollmentLeave.js";
import {getPolarClient} from "../services/polarClient.js";
import {buildCancellationSurveyRecord} from "./payments.js";
import {
  type PolarPaymentType,
  resolvePolarProductId,
  isPolarPaymentType,
  parsePolarMetadata,
  polarCentsToMajor,
  toIsoDate,
  isTrialingSubscription,
  POLAR_EVENTS,
} from "../services/polarHelpers.js";
import {
  sendOneTimePurchaseEmail,
  sendSubscriptionStartedEmail,
  sendTrialActivatedEmail,
  sendCancellationEmail,
} from "../services/purchaseEmails.js";

const router = Router();

// ─── Post-payment redirect (mirrors payments.ts; kept local to avoid touching
// the MercadoPago file). Buyers land on the landing's /:username/comprado
// which polls for access, falling back to the PWA success route. ──────────────
const REDIRECT_ALLOWED_ORIGINS = new Set([
  "https://wakelab.co",
  "https://www.wakelab.co",
  "https://wolf-20b8b.web.app",
  "https://wolf-20b8b.firebaseapp.com",
  "https://wake-staging.web.app",
  "https://wake-staging.firebaseapp.com",
]);
const REDIRECT_DEFAULT = "https://wakelab.co";
const USERNAME_RE = /^[a-z0-9_]{1,32}$/i;

function resolveAppBaseUrl(req: Request): string {
  const origin = req.get("origin");
  if (origin && REDIRECT_ALLOWED_ORIGINS.has(origin)) return origin;
  return REDIRECT_DEFAULT;
}

async function resolveCreatorUsername(creatorId: unknown): Promise<string | null> {
  if (typeof creatorId !== "string" || !creatorId) return null;
  try {
    const doc = await db.collection("users").doc(creatorId).get();
    const username = doc.data()?.username;
    if (typeof username === "string" && USERNAME_RE.test(username)) return username;
  } catch (err) {
    functions.logger.warn("polar.resolveCreatorUsername failed", {creatorId, error: String(err)});
  }
  return null;
}

function buildSuccessUrl(args: {
  base: string;
  username: string | null;
  courseId: string;
  mode: "subscription" | "one_time";
}): string {
  if (args.username) {
    const params = [`course=${encodeURIComponent(args.courseId)}`];
    if (args.mode === "subscription") params.push("mode=subscription");
    return `${args.base}/${args.username}/comprado?${params.join("&")}`;
  }
  const subSuffix = args.mode === "subscription" ? "&mode=subscription" : "";
  return `${args.base}/app/payment/success?courseId=${encodeURIComponent(args.courseId)}${subSuffix}`;
}

// Course fields the shared course-entry builder reads.
function buildCourseDetails(course: Record<string, unknown>, accessDuration: string): Record<string, unknown> {
  return {
    access_duration: accessDuration,
    deliveryType: course.deliveryType ?? "general",
    title: course.title ?? "Untitled Course",
    image_url: course.image_url ?? null,
    discipline: course.discipline ?? "General",
    creatorName: course.creatorName ?? course.creator_name ?? null,
    creator_id: course.creator_id ?? null,
    block_cadence: course.block_cadence ?? null,
  };
}

function recipientEmail(userData: Record<string, unknown> | null | undefined): string | null {
  const email = userData?.email;
  return typeof email === "string" && EMAIL_RE.test(email) ? email : null;
}

// ─── POST /payments/polar/checkout ───────────────────────────────────────────
router.post("/payments/polar/checkout", async (req, res) => {
  const auth = await validateAuth(req);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const body = validateBody<{ courseId: string; paymentType: string }>(
    {courseId: "string", paymentType: "string"},
    req.body
  );
  if (!COURSE_ID_RE.test(body.courseId)) {
    throw new WakeApiServerError("VALIDATION_ERROR", 400, "courseId inválido", "courseId");
  }
  if (!isPolarPaymentType(body.paymentType)) {
    throw new WakeApiServerError(
      "VALIDATION_ERROR", 400, "paymentType debe ser 'subscription' o 'one_time'", "paymentType"
    );
  }
  const paymentType: PolarPaymentType = body.paymentType;

  const courseDoc = await db.collection("courses").doc(body.courseId).get();
  if (!courseDoc.exists) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Curso no encontrado");
  }
  const course = courseDoc.data()!;

  if (course.status !== "published") {
    throw new WakeApiServerError(
      "FORBIDDEN", 403, "Este programa aún no está disponible para compra"
    );
  }

  // Block buying a rival creator's one-on-one program while locked in.
  if (course.deliveryType === "one_on_one") {
    const lock = await getActiveOneOnOneLock(auth.userId);
    if (lock && lock.creatorId !== course.creator_id) {
      throw new WakeApiServerError(
        "CONFLICT", 409,
        "Ya estás en un programa uno-a-uno. Termínalo antes de comenzar otro."
      );
    }
  }

  // Already-owned guard (parity with MP /public/checkout/start): a returning
  // buyer who still has active access must not be able to double-charge.
  const buyerDoc = await db.collection("users").doc(auth.userId).get();
  const ownedEntry = (buyerDoc.data()?.courses?.[body.courseId] ?? null) as
    { status?: string; expires_at?: string | null } | null;
  if (ownedEntry?.status === "active") {
    const exp = ownedEntry.expires_at;
    const stillValid = !exp || (typeof exp === "string" && Date.parse(exp) > Date.now());
    if (stillValid) {
      res.status(409).json({
        error: {code: "CONFLICT", message: "Ya tienes acceso a este programa"},
        alreadyPurchased: true,
        appUrl: "/app/",
      });
      return;
    }
  }

  const productId = resolvePolarProductId(course, paymentType);
  if (!productId) {
    throw new WakeApiServerError(
      "VALIDATION_ERROR", 400,
      "Este programa no está disponible para pago internacional todavía"
    );
  }

  // Beta cap: refuse checkout once the program is full.
  await assertCourseHasSeat(body.courseId, course);

  const base = resolveAppBaseUrl(req);
  const username = await resolveCreatorUsername(course.creator_id);
  const successUrl = buildSuccessUrl({base, username, courseId: body.courseId, mode: paymentType});

  const polar = getPolarClient();
  let checkout;
  try {
    checkout = await polar.checkouts.create({
      products: [productId],
      successUrl,
      // Echoed back on every webhook — how we attribute the payment.
      metadata: {userId: auth.userId, courseId: body.courseId, paymentType},
      // Ties the Polar customer to our Firebase uid for portal/reconciliation.
      externalCustomerId: auth.userId,
      ...(auth.email ? {customerEmail: auth.email} : {}),
    });
  } catch (error) {
    functions.logger.error("polar.checkout.create failed", {
      userId: auth.userId, courseId: body.courseId, paymentType, error: String(error),
    });
    throw new WakeApiServerError(
      "SERVICE_UNAVAILABLE", 503, "No pudimos crear el enlace de pago. Inténtalo de nuevo."
    );
  }

  if (!checkout?.url) {
    throw new WakeApiServerError("INTERNAL_ERROR", 500, "No se pudo crear el enlace de pago");
  }

  res.json({data: {checkout_url: checkout.url, checkout_id: checkout.id}});
});

// ─── POST /payments/polar/webhook ────────────────────────────────────────────
// Public (no Firebase auth): authenticity is the Standard Webhooks signature,
// verified below before any work. Added to PUBLIC_PATHS in app.ts.
router.post("/payments/polar/webhook", async (req, res) => {
  const secret = process.env.POLAR_WEBHOOK_SECRET;
  if (!secret) {
    functions.logger.error("polar.webhook: POLAR_WEBHOOK_SECRET missing");
    res.status(503).send("not configured");
    return;
  }

  // validateEvent verifies over the RAW body. Firebase's onRequest populates
  // req.rawBody (a Buffer) even though the global express.json() also parsed it.
  const rawBody = (req as unknown as { rawBody?: Buffer }).rawBody;
  if (!rawBody) {
    functions.logger.error("polar.webhook: missing rawBody");
    res.status(400).send("bad request");
    return;
  }

  let event: { type: string; data: Record<string, unknown> };
  try {
    event = validateEvent(
      rawBody,
      req.headers as Record<string, string>,
      secret
    ) as unknown as { type: string; data: Record<string, unknown> };
  } catch (err) {
    if (err instanceof WebhookVerificationError) {
      res.status(403).json({received: false});
      return;
    }
    functions.logger.error("polar.webhook: validate error", {error: String(err)});
    res.status(400).send("bad request");
    return;
  }

  try {
    await handlePolarEvent(event.type, event.data);
    res.status(200).json({received: true});
  } catch (err) {
    // 500 so Polar retries transient failures (Firestore blips, etc.).
    functions.logger.error("polar.webhook: handler error", {type: event.type, error: String(err)});
    res.status(500).json({received: false});
  }
});

async function handlePolarEvent(type: string, data: Record<string, unknown>): Promise<void> {
  switch (type) {
  case POLAR_EVENTS.ORDER_PAID:
    await handleOrderPaid(data);
    break;
  case POLAR_EVENTS.SUBSCRIPTION_ACTIVE:
  case POLAR_EVENTS.SUBSCRIPTION_CREATED:
    // Only the trial case is handled here — a non-trial activation always has a
    // matching order.paid that does the grant. Ignoring it avoids double work.
    if (isTrialingSubscription(data)) await handleTrialActivated(data);
    break;
  case POLAR_EVENTS.SUBSCRIPTION_UPDATED:
  case POLAR_EVENTS.SUBSCRIPTION_UNCANCELED:
    // uncanceled = the buyer reversed a scheduled cancel from the Polar portal;
    // it does not always come with a subscription.updated, so reflect the
    // reactivation (clear cancel_at_period_end, status active) here too.
    await handleSubscriptionUpdated(data);
    break;
  case POLAR_EVENTS.SUBSCRIPTION_CANCELED:
    await handleSubscriptionCanceled(data);
    break;
  case POLAR_EVENTS.SUBSCRIPTION_REVOKED:
    await handleAccessRevoked(data);
    break;
  case POLAR_EVENTS.REFUND_CREATED:
  case POLAR_EVENTS.REFUND_UPDATED:
    await handleRefund(data);
    break;
  default:
    functions.logger.info("polar.webhook: ignored event", {type});
  }
}

// order.paid fires for one-time orders AND subscription charges (first + cycles).
async function handleOrderPaid(order: Record<string, unknown>): Promise<void> {
  const meta = parsePolarMetadata(order.metadata);
  const orderId = typeof order.id === "string" ? order.id : null;
  if (!orderId) throw new Error("polar order.paid missing id");

  const subscriptionId = typeof order.subscriptionId === "string" ? order.subscriptionId : null;
  const isSubscription = !!subscriptionId;

  const processedRef = db.collection("processed_payments").doc(`polar_order_${orderId}`);

  const courseDoc = await db.collection("courses").doc(meta.courseId).get();
  if (!courseDoc.exists) throw new Error(`polar order.paid: course ${meta.courseId} not found`);
  const course = courseDoc.data()!;

  const userRef = db.collection("users").doc(meta.userId);
  const userSnap = await userRef.get();
  if (!userSnap.exists) throw new Error(`polar order.paid: user ${meta.userId} not found`);
  const userData = userSnap.data() ?? {};
  const existingEntry = (userData.courses?.[meta.courseId] ?? null) as Record<string, unknown> | null;

  const accessDuration = isSubscription ? "monthly" : "yearly";
  const subscription = (order.subscription ?? null) as Record<string, unknown> | null;
  const periodEnd = toIsoDate(subscription?.currentPeriodEnd);

  // Subscription: existing entry (from a trial or prior period) means extend —
  // the renewal path also clears the trial flag and extends from the newer of
  // on-disk vs candidate. One-time always grants a fresh yearly entry.
  const isRenewal = isSubscription && !!existingEntry;
  const expiresAt = isSubscription ?
    (periodEnd ?? calculateExpirationDate("monthly", isRenewal ? (existingEntry?.expires_at as string | undefined) : undefined)) :
    calculateExpirationDate("yearly");

  const courseDetails = buildCourseDetails(course, accessDuration);
  const amountMajor = polarCentsToMajor(order.totalAmount);
  const currency = typeof order.currency === "string" ? order.currency.toUpperCase() : "USD";
  const customerId = typeof order.customerId === "string" ? order.customerId : null;
  // Ledger money facts: gross is pre-tax (what Wake earns on); tax is remitted by
  // Polar (MoR). Fall back to totalAmount when the pre-tax amount field is absent.
  const grossMajor = polarCentsToMajor(order.amount ?? order.totalAmount);
  const taxMajor = order.taxAmount != null ? polarCentsToMajor(order.taxAmount) : null;

  let alreadyProcessed = false;
  await db.runTransaction(async (tx) => {
    const processedSnap = await tx.get(processedRef);
    if (processedSnap.exists && processedSnap.data()?.status === "approved") {
      alreadyProcessed = true;
      return;
    }

    await assignCourseToUser(meta.userId, meta.courseId, courseDetails, expiresAt, {
      transaction: tx,
      isRenewal,
      existingCourseData: existingEntry ?? undefined,
    });

    if (isSubscription && subscriptionId) {
      tx.set(
        userRef.collection("subscriptions").doc(subscriptionId),
        {
          subscription_id: subscriptionId,
          provider: "polar",
          user_id: meta.userId,
          course_id: meta.courseId,
          course_title: course.title ?? null,
          status: "active",
          access_duration: "monthly",
          currency_id: currency,
          transaction_amount: amountMajor,
          next_billing_date: periodEnd,
          last_payment_id: orderId,
          last_payment_date: new Date().toISOString(),
          customer_id: customerId,
          updated_at: FieldValue.serverTimestamp(),
          created_at: FieldValue.serverTimestamp(),
        },
        {merge: true}
      );
    }

    tx.set(processedRef, {
      processed_at: FieldValue.serverTimestamp(),
      status: "approved",
      provider: "polar",
      userId: meta.userId,
      courseId: meta.courseId,
      isSubscription,
      isRenewal,
      state: "completed",
    }, {merge: true});

    tx.set(
      db.collection("payment_ledger").doc(`polar_order_${orderId}`),
      buildLedgerEntry({
        id: `polar_order_${orderId}`,
        provider: "polar",
        type: isSubscription ? (isRenewal ? "renewal" : "initial") : "one_time",
        status: "paid",
        courseId: meta.courseId,
        userId: meta.userId,
        userEmail: recipientEmail(userData),
        subscriptionId: subscriptionId ?? null,
        externalPaymentId: orderId,
        grossAmount: grossMajor,
        currency,
        taxAmount: taxMajor,
        chargedAt: new Date().toISOString(),
        creatorId: (course.creator_id as string) ?? null,
        creatorName: (course.creatorName as string) ?? (course.creator_name as string) ?? null,
        courseTitle: (course.title as string) ?? null,
      }),
      {merge: true}
    );
  });

  if (alreadyProcessed) return;

  // Best-effort confirmation email. Skip subscription renewals (cycle) — the
  // first charge already emailed; a trial's activation emailed separately.
  try {
    const to = recipientEmail(userData);
    if (to && amountMajor && amountMajor > 0) {
      const programTitle = typeof course.title === "string" ? course.title : "tu programa";
      if (isSubscription && !isRenewal) {
        await sendSubscriptionStartedEmail({
          to,
          programTitle,
          courseId: meta.courseId,
          nextBillingDate: periodEnd ?? expiresAt,
          transactionAmount: amountMajor,
          currencyId: currency,
        });
      } else if (!isSubscription) {
        await sendOneTimePurchaseEmail({
          to,
          programTitle,
          courseId: meta.courseId,
          amount: amountMajor,
          currencyId: currency,
          accessUntil: expiresAt,
        });
      }
    }
  } catch (emailErr) {
    functions.logger.warn("polar.webhook: purchase email failed (non-blocking)", {
      userId: meta.userId, courseId: meta.courseId, error: String(emailErr),
    });
  }
}

// Trial start: no charge yet, so order.paid won't fire. Grant access with the
// trial flag and expiry = trial end (mirrors the MercadoPago trial grant).
async function handleTrialActivated(subscription: Record<string, unknown>): Promise<void> {
  const meta = parsePolarMetadata(subscription.metadata);
  const subId = typeof subscription.id === "string" ? subscription.id : null;
  if (!subId) throw new Error("polar subscription trial missing id");

  const processedRef = db.collection("processed_payments").doc(`polar_trial_${subId}`);

  const courseDoc = await db.collection("courses").doc(meta.courseId).get();
  if (!courseDoc.exists) throw new Error(`polar trial: course ${meta.courseId} not found`);
  const course = courseDoc.data()!;

  const userRef = db.collection("users").doc(meta.userId);
  const trialEnd = toIsoDate(subscription.currentPeriodEnd) ??
    toIsoDate(subscription.endsAt) ??
    calculateExpirationDate("monthly");
  const customerId = typeof subscription.customerId === "string" ? subscription.customerId : null;

  let alreadyProcessed = false;
  await db.runTransaction(async (tx) => {
    const processedSnap = await tx.get(processedRef);
    if (processedSnap.exists && processedSnap.data()?.status === "approved") {
      alreadyProcessed = true;
      return;
    }
    const freshUser = await tx.get(userRef);
    if (!freshUser.exists) throw new Error(`polar trial: user ${meta.userId} not found`);
    const freshData = freshUser.data() ?? {};
    const existing = (freshData.courses?.[meta.courseId] ?? {}) as Record<string, unknown>;

    tx.update(userRef, {
      [`courses.${meta.courseId}`]: {
        access_duration: "monthly",
        expires_at: trialEnd,
        status: "active",
        is_trial: true,
        purchased_at: existing.purchased_at ?? new Date().toISOString(),
        deliveryType: course.deliveryType ?? "general",
        title: course.title ?? "Untitled Course",
        image_url: course.image_url ?? null,
        discipline: course.discipline ?? "General",
        creatorName: course.creatorName ?? course.creator_name ?? null,
        creator_id: course.creator_id ?? null,
        block_cadence: course.block_cadence ?? null,
        completedTutorials: existing.completedTutorials ?? {
          dailyWorkout: [], warmup: [], workoutExecution: [], workoutCompletion: [],
        },
      },
      purchased_courses: FieldValue.arrayUnion(meta.courseId),
      updated_at: FieldValue.serverTimestamp(),
    });

    tx.set(userRef.collection("subscriptions").doc(subId), {
      subscription_id: subId,
      provider: "polar",
      user_id: meta.userId,
      course_id: meta.courseId,
      course_title: course.title ?? null,
      status: "trialing",
      access_duration: "monthly",
      currency_id: "USD",
      next_billing_date: trialEnd,
      is_trial: true,
      customer_id: customerId,
      updated_at: FieldValue.serverTimestamp(),
      created_at: FieldValue.serverTimestamp(),
    }, {merge: true});

    tx.set(processedRef, {
      processed_at: FieldValue.serverTimestamp(),
      status: "approved",
      provider: "polar",
      userId: meta.userId,
      courseId: meta.courseId,
      state: "trial_started",
    }, {merge: true});
  });

  if (alreadyProcessed) return;

  try {
    const userSnap = await userRef.get();
    const to = recipientEmail(userSnap.data());
    if (to) {
      const polarCfg = (course.polar ?? {}) as Record<string, unknown>;
      const priceUsd = typeof polarCfg.price_usd_monthly === "number" ? polarCfg.price_usd_monthly : 0;
      const trialDays = Math.max(1, Math.round((new Date(trialEnd).getTime() - Date.now()) / 86_400_000));
      await sendTrialActivatedEmail({
        to,
        programTitle: typeof course.title === "string" ? course.title : "tu programa",
        courseId: meta.courseId,
        trialDays,
        trialEndDate: trialEnd,
        transactionAmount: priceUsd,
        currencyId: "USD",
      });
    }
  } catch (emailErr) {
    functions.logger.warn("polar.webhook: trial email failed (non-blocking)", {
      userId: meta.userId, courseId: meta.courseId, error: String(emailErr),
    });
  }
}

// Cancel-at-period-end: keep access until expires_at, just flag the sub.
async function handleSubscriptionCanceled(subscription: Record<string, unknown>): Promise<void> {
  const meta = parsePolarMetadata(subscription.metadata);
  const subId = typeof subscription.id === "string" ? subscription.id : null;
  if (!subId) return;
  await db.collection("users").doc(meta.userId)
    .collection("subscriptions").doc(subId)
    .set({
      status: "cancelled",
      cancel_at_period_end: true,
      cancelled_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp(),
    }, {merge: true});
}

// subscription.updated fires for any change to the sub — crucially when a user
// cancels (or un-cancels) from the Polar customer portal, which does NOT emit
// subscription.canceled. Reflect the pending cancellation locally so the PWA
// card matches Polar; a re-activation (cancel_at_period_end back to false)
// flips it back to active. Access itself is unchanged here — it's retained
// until expires_at (grace to period end); revoked/refund events end access.
async function handleSubscriptionUpdated(subscription: Record<string, unknown>): Promise<void> {
  const meta = parsePolarMetadata(subscription.metadata);
  const subId = typeof subscription.id === "string" ? subscription.id : null;
  if (!subId) return;

  const status = subscription.status;
  const cancelAtPeriodEnd = subscription.cancelAtPeriodEnd === true;
  const subRef = db.collection("users").doc(meta.userId)
    .collection("subscriptions").doc(subId);

  // Terminal or scheduled-to-cancel → mark cancelled (keep access until expiry).
  if (status === "canceled" || status === "revoked" || cancelAtPeriodEnd) {
    await subRef.set({
      status: "cancelled",
      cancel_at_period_end: cancelAtPeriodEnd,
      cancelled_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp(),
    }, {merge: true});
    return;
  }

  // Active/trialing and not scheduled to cancel → (re)activate; covers an
  // un-cancel from the portal.
  if (status === "active" || status === "trialing") {
    const periodEnd = toIsoDate(subscription.currentPeriodEnd);
    await subRef.set({
      status: status === "trialing" ? "trialing" : "active",
      cancel_at_period_end: false,
      ...(periodEnd ? {next_billing_date: periodEnd} : {}),
      updated_at: FieldValue.serverTimestamp(),
    }, {merge: true});
  }
}

// Revoked = access ends now (immediate cancel, or trial abandoned).
async function handleAccessRevoked(subscription: Record<string, unknown>): Promise<void> {
  const meta = parsePolarMetadata(subscription.metadata);
  const subId = typeof subscription.id === "string" ? subscription.id : null;
  await revokeCourseAccess(meta.userId, meta.courseId);
  if (subId) {
    await db.collection("users").doc(meta.userId)
      .collection("subscriptions").doc(subId)
      .set({status: "cancelled", updated_at: FieldValue.serverTimestamp()}, {merge: true});
  }
}

// refund.created / refund.updated — Polar's real refund lifecycle events (it
// does NOT emit order.refunded). Two things happen here:
//   1. Ledger: record the refund so revenue nets it out. Previously these
//      events were unhandled, so refunds never hit payment_ledger and reports
//      overstated income.
//   2. Access: honor Polar's `revoke_benefits` decision (product decision
//      2026-07-04) — revoke access ONLY when the refund was issued WITH revoke
//      benefits. A refund that keeps benefits (revoke_benefits=false) leaves
//      access intact until expires_at, matching what Polar shows the customer.
// The refund payload carries no checkout metadata, so user/course are resolved
// from the processed_payments row written at order.paid. Idempotent: both
// events key the ledger by refund id (merge) and revokeCourseAccess is a no-op
// when already revoked. Field names are read in both camelCase (SDK-parsed) and
// snake_case (raw payload) so we're robust to how validateEvent deserializes.
async function handleRefund(refund: Record<string, unknown>): Promise<void> {
  const pick = (camel: string, snake: string): unknown => refund[camel] ?? refund[snake];
  // Only act on a settled refund; refund.created can arrive as "pending".
  if (refund.status !== "succeeded") return;

  const refundId = typeof refund.id === "string" ? refund.id : null;
  const orderIdRaw = pick("orderId", "order_id");
  const orderId = typeof orderIdRaw === "string" ? orderIdRaw : null;
  if (!refundId || !orderId) return;

  const procSnap = await db.collection("processed_payments").doc(`polar_order_${orderId}`).get();
  const proc = procSnap.data() ?? {};
  const userId = typeof proc.userId === "string" ? proc.userId : null;
  const courseId = typeof proc.courseId === "string" ? proc.courseId : null;
  if (!userId || !courseId) {
    functions.logger.warn("polar.webhook: refund could not be attributed to a user/course", {orderId, refundId});
    return;
  }

  const subIdRaw = pick("subscriptionId", "subscription_id");
  const taxRaw = pick("taxAmount", "tax_amount");
  await writeLedgerEntryBestEffort({
    id: `polar_refund_${refundId}`,
    provider: "polar",
    type: "refund",
    status: "refunded",
    courseId,
    userId,
    subscriptionId: typeof subIdRaw === "string" ? subIdRaw : null,
    externalPaymentId: refundId,
    grossAmount: polarCentsToMajor(refund.amount),
    currency: typeof refund.currency === "string" ? refund.currency.toUpperCase() : "USD",
    taxAmount: typeof taxRaw === "number" ? polarCentsToMajor(taxRaw) : null,
    chargedAt: new Date().toISOString(),
  });

  if (pick("revokeBenefits", "revoke_benefits") === true) {
    await revokeCourseAccess(userId, courseId);
  } else {
    functions.logger.info("polar.webhook: refund kept access (revoke_benefits=false)", {userId, courseId, refundId});
  }
}

async function revokeCourseAccess(userId: string, courseId: string): Promise<void> {
  await db.collection("users").doc(userId).update({
    [`courses.${courseId}.status`]: "cancelled",
    updated_at: FieldValue.serverTimestamp(),
  });
}

// ─── POST /payments/polar/subscriptions/:subscriptionId/cancel ───────────────
// Own endpoint (not the Polar portal) so the in-app cancel UX + the
// cancellation-feedback survey are preserved, mirroring MercadoPago.
router.post("/payments/polar/subscriptions/:subscriptionId/cancel", async (req, res) => {
  const auth = await validateAuth(req);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const {subscriptionId} = req.params;
  const survey = req.body?.survey as Record<string, unknown> | undefined;

  const subRef = db.collection("users").doc(auth.userId)
    .collection("subscriptions").doc(subscriptionId);
  const subDoc = await subRef.get();
  if (!subDoc.exists) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Suscripción no encontrada");
  }
  const subData = subDoc.data() ?? {};
  const polarSubId = typeof subData.subscription_id === "string" ? subData.subscription_id : subscriptionId;

  const polar = getPolarClient();
  try {
    await polar.subscriptions.update({
      id: polarSubId,
      subscriptionUpdate: {cancelAtPeriodEnd: true},
    });
  } catch (error) {
    functions.logger.warn("polar.cancel failed", {
      userId: auth.userId, subscriptionId, error: String(error),
    });
    throw new WakeApiServerError(
      "SERVICE_UNAVAILABLE", 503,
      "No pudimos cancelar la suscripción en este momento. Inténtalo de nuevo."
    );
  }

  await subRef.set({
    status: "cancelled",
    cancel_at_period_end: true,
    cancelled_at: FieldValue.serverTimestamp(),
    updated_at: FieldValue.serverTimestamp(),
  }, {merge: true});

  if (survey?.answers) {
    try {
      const record = buildCancellationSurveyRecord({
        userId: auth.userId,
        subscriptionId,
        survey,
        subscriptionData: subData,
        statusAfter: "cancelled",
      });
      await db.collection("subscription_cancellation_feedback").add(record);
    } catch {/* non-critical */}
  }

  try {
    const courseId = typeof subData.course_id === "string" ? subData.course_id : null;
    if (courseId) {
      const userDoc = await db.collection("users").doc(auth.userId).get();
      const userData = userDoc.data() ?? null;
      const courseEntry = (userData?.courses?.[courseId] ?? null) as Record<string, unknown> | null;
      const to = recipientEmail(userData);
      if (to) {
        await sendCancellationEmail({
          to,
          programTitle: (typeof courseEntry?.title === "string" ? courseEntry.title : null) ??
            (typeof subData.course_title === "string" ? subData.course_title : "tu programa"),
          courseId,
          accessUntil: typeof courseEntry?.expires_at === "string" ? courseEntry.expires_at : null,
        });
      }
    }
  } catch (emailErr) {
    functions.logger.warn("polar.cancel: email failed (non-blocking)", {
      userId: auth.userId, subscriptionId, error: String(emailErr),
    });
  }

  res.json({data: {status: "cancelled"}});
});

// ─── POST /payments/polar/subscriptions/:subscriptionId/portal ───────────────
// Returns a fresh Polar customer-portal URL (they expire, so we mint on demand)
// for the buyer to update their card / view history.
router.post("/payments/polar/subscriptions/:subscriptionId/portal", async (req, res) => {
  const auth = await validateAuth(req);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const {subscriptionId} = req.params;
  const subDoc = await db.collection("users").doc(auth.userId)
    .collection("subscriptions").doc(subscriptionId).get();
  if (!subDoc.exists) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Suscripción no encontrada");
  }
  const customerId = subDoc.data()?.customer_id;
  if (typeof customerId !== "string" || !customerId) {
    throw new WakeApiServerError("SERVICE_UNAVAILABLE", 503, "Portal no disponible para esta suscripción");
  }

  const polar = getPolarClient();
  const session = await polar.customerSessions.create({customerId});
  res.json({data: {portal_url: session.customerPortalUrl}});
});

export default router;
