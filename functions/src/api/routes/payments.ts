import {Router} from "express";
import type {Request} from "express";
import * as crypto from "node:crypto";
import * as functions from "firebase-functions";
import {Preference, Payment, PreApproval} from "mercadopago";
import {db, FieldValue} from "../firestore.js";
import {validateAuth} from "../middleware/auth.js";
import {validateBody} from "../middleware/validate.js";
import {checkRateLimit} from "../middleware/rateLimit.js";
import {WakeApiServerError} from "../errors.js";
import {
  type ParsedReference,
  type MercadoPagoPreapproval,
  EMAIL_RE, COURSE_ID_RE,
  buildExternalReference, parseExternalReference,
  calculateExpirationDate, classifyError, getClient,
} from "../services/paymentHelpers.js";
import {assignCourseToUser} from "../services/courseAssignment.js";
import {writeLedgerEntryBestEffort, sumMercadoPagoFee} from "../services/paymentLedger.js";
import {applyMpRefund} from "../services/refunds.js";
import {assertCourseHasSeat} from "../services/capacity.js";
import {assignBundleToUser} from "../services/bundleAssignment.js";
import {cancelMpSubscription, getActiveOneOnOneLock} from "../services/enrollmentLeave.js";
import {clampTrialDurationDays} from "../middleware/securityHelpers.js";
import {capture as analyticsCapture} from "../../lib/analytics.js";
import {
  sendOneTimePurchaseEmail,
  sendSubscriptionStartedEmail,
  sendChargeReceiptEmail,
  sendTrialActivatedEmail,
  sendCancellationEmail,
} from "../services/purchaseEmails.js";

const router = Router();

// Email priority: user.email is the account they actually use; payer_email is
// what they used at MP checkout (may differ). Prefer the account email so
// emails reach them where they read other product comms; fall back to payer.
function pickRecipientEmail(
  userData: Record<string, unknown> | null | undefined,
  payerEmail?: string | null
): string | null {
  const candidates = [
    typeof userData?.email === "string" ? userData.email : null,
    payerEmail,
  ];
  for (const c of candidates) {
    if (typeof c === "string" && EMAIL_RE.test(c)) return c;
  }
  return null;
}

// ── Cancellation survey record builder (exported for unit tests) ─────────
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

// ── Checkout observability ────────────────────────────────────────────────
// Full-fidelity logging so any subscription checkout can be reconstructed end
// to end from Cloud Logging. Every step emits a structured entry under
// `checkout.<step>` tagged with `flow:"checkout"` and a correlation id
// (subscriptionId / external_reference). MercadoPago request + response
// payloads are logged VERBATIM under `mp` — they carry no card data (neither
// the redirect nor the transparent flow exposes a PAN to us) and no secrets
// (access token / webhook secret never appear in MP payloads). The buyer email
// IS present in MP payloads and in `payerEmail`/`accountEmail` fields: this is
// intentional — the whole investigation is an account-vs-payer email mismatch,
// so the addresses are the signal. Keep these logs access-controlled.
function logCheckout(step: string, data: Record<string, unknown>): void {
  functions.logger.info(`checkout.${step}`, {flow: "checkout", step, ...data});
}

// Pull a usable {status, message, raw} out of whatever MP threw. The SDK throws
// plain objects ({message, status, cause}) as often as Error instances.
function describeMpError(error: unknown): {
  mpStatus: number | string | null;
  mpMessage: string;
  mpRaw: unknown;
} {
  if (error instanceof Error) {
    return {mpStatus: null, mpMessage: error.message, mpRaw: {name: error.name, message: error.message}};
  }
  if (error && typeof error === "object") {
    const o = error as {message?: unknown; status?: unknown; cause?: unknown; error?: unknown};
    return {
      mpStatus: (typeof o.status === "number" || typeof o.status === "string") ? o.status : null,
      mpMessage: typeof o.message === "string" ? o.message : JSON.stringify(o),
      mpRaw: o,
    };
  }
  return {mpStatus: null, mpMessage: String(error), mpRaw: String(error)};
}

// MercadoPago redirects the buyer back to one of these URLs after checkout.
// We derive the host from the caller's Origin header when it's in the trusted
// allowlist (so staging redirects to staging, custom-domain redirects to the
// custom domain) and fall back to the canonical production host otherwise.
const PAYMENT_REDIRECT_ALLOWED_ORIGINS = new Set([
  "https://wakelab.co",
  "https://www.wakelab.co",
  "https://wolf-20b8b.web.app",
  "https://wolf-20b8b.firebaseapp.com",
  "https://wake-staging.web.app",
  "https://wake-staging.firebaseapp.com",
]);
const PAYMENT_REDIRECT_DEFAULT = "https://wakelab.co";

function resolveAppBaseUrl(req: Request): string {
  const origin = req.get("origin");
  if (origin && PAYMENT_REDIRECT_ALLOWED_ORIGINS.has(origin)) return origin;
  return PAYMENT_REDIRECT_DEFAULT;
}

// Resolve a creator's storefront username so MercadoPago can redirect buyers
// back to the landing's PostPaymentScreen at `/{username}/comprado`. That
// screen runs entirely on the landing app (no PWA install required), polls
// for access, and auto-sends a magic-link to the buyer — none of which works
// if we drop the buyer on MP's own dashboard. Returns null when the creator
// has no username set, in which case the caller falls back to the PWA route.
const USERNAME_RE = /^[a-z0-9_]{1,32}$/i;
async function resolveCreatorUsername(creatorId: unknown): Promise<string | null> {
  if (typeof creatorId !== "string" || !creatorId) return null;
  try {
    const doc = await db.collection("users").doc(creatorId).get();
    const username = doc.data()?.username;
    if (typeof username === "string" && USERNAME_RE.test(username)) return username;
  } catch (err) {
    functions.logger.warn("resolveCreatorUsername failed", {creatorId, error: String(err)});
  }
  return null;
}

// Build the post-payment redirect URL MercadoPago sends the buyer to after
// checkout. Prefers the landing's `/:username/comprado` (auto-magic-link,
// no PWA install gate) and falls back to the PWA's `/app/payment/success`
// when the creator has no username — that route's InstallScreen bypass
// keeps it reachable from any browser.
function buildPostPaymentUrl(args: {
  base: string;
  username: string | null;
  courseId?: string | null;
  bundleId?: string | null;
  mode: "one_time" | "subscription";
}): string {
  const subSuffix = args.mode === "subscription" ? "&mode=subscription" : "";
  if (args.username) {
    const params: string[] = [];
    if (args.courseId) params.push(`course=${encodeURIComponent(args.courseId)}`);
    if (args.bundleId) params.push(`bundle=${encodeURIComponent(args.bundleId)}`);
    if (args.mode === "subscription") params.push("mode=subscription");
    const qs = params.length > 0 ? `?${params.join("&")}` : "";
    return `${args.base}/${args.username}/comprado${qs}`;
  }
  if (args.courseId) {
    return `${args.base}/app/payment/success?courseId=${encodeURIComponent(args.courseId)}${subSuffix}`;
  }
  if (args.bundleId) {
    return `${args.base}/app/payment/success?bundleId=${encodeURIComponent(args.bundleId)}${subSuffix}`;
  }
  return `${args.base}/acceso`;
}

// MercadoPago calls this server-to-server (no Origin header), so we can't
// derive from the request. Pin to the project: prod → wakelab.co, staging →
// wake-staging.web.app. Override stays available for ngrok/tunnel testing.
function resolveWebhookUrl(): string {
  const override = process.env.WAKE_NOTIFICATION_URL_OVERRIDE;
  if (override) return override;
  const project = process.env.GCLOUD_PROJECT;
  const base = project === "wake-staging" ?
    "https://wake-staging.web.app" :
    "https://wakelab.co";
  return `${base}/api/v1/payments/webhook`;
}

function getMPClient() {
  const token = process.env.MERCADOPAGO_ACCESS_TOKEN;
  if (!token) {
    throw new WakeApiServerError("SERVICE_UNAVAILABLE", 503, "Servicio de pagos no configurado");
  }
  return getClient(token);
}

// Pick the OTP price from a bundle's pricing object. Tolerates both the
// simplified scalar form ({otp: number}) and the legacy duration-map form
// ({otp: {yearly: N, ...}}), preferring the yearly bucket when present.
function resolveBundleOtpPrice(pricing: unknown): number | null {
  const p = (pricing ?? {}) as Record<string, unknown>;
  const raw = p.otp;
  if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) return raw;
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const map = raw as Record<string, unknown>;
    const preferred = map.yearly;
    if (typeof preferred === "number" && Number.isFinite(preferred) && preferred > 0) return preferred;
    for (const v of Object.values(map)) {
      if (typeof v === "number" && Number.isFinite(v) && v > 0) return v;
    }
  }
  return null;
}

// Same tolerance for subscription price; prefers monthly bucket.
function resolveBundleSubscriptionPrice(pricing: unknown): number | null {
  const p = (pricing ?? {}) as Record<string, unknown>;
  const raw = p.subscription;
  if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) return raw;
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const map = raw as Record<string, unknown>;
    const preferred = map.monthly;
    if (typeof preferred === "number" && Number.isFinite(preferred) && preferred > 0) return preferred;
    for (const v of Object.values(map)) {
      if (typeof v === "number" && Number.isFinite(v) && v > 0) return v;
    }
  }
  return null;
}

// ─── GET /users/me/subscriptions ──────────────────────────────────────────

router.get("/users/me/subscriptions", async (req, res) => {
  const auth = await validateAuth(req);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const snapshot = await db
    .collection("users")
    .doc(auth.userId)
    .collection("subscriptions")
    .orderBy("created_at", "desc")
    .get();

  res.json({
    data: snapshot.docs.map((d) => ({...d.data(), id: d.id})),
  });
});

// ─��─ POST /payments/preference ────────────────��───────────────────────────

router.post("/payments/preference", async (req, res) => {
  const auth = await validateAuth(req);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const {courseId} = validateBody<{ courseId: string }>(
    {courseId: "string"},
    req.body
  );

  if (!COURSE_ID_RE.test(courseId)) {
    throw new WakeApiServerError("VALIDATION_ERROR", 400, "courseId inválido", "courseId");
  }

  const courseDoc = await db.collection("courses").doc(courseId).get();
  if (!courseDoc.exists) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Curso no encontrado");
  }

  const course = courseDoc.data()!;

  // Block one-time checkout for non-published courses. Catalog routes filter
  // by `status == "published"` but this endpoint accepts a direct courseId,
  // so without this check a leaked draft id could be paid for.
  if (course.status !== "published") {
    throw new WakeApiServerError(
      "FORBIDDEN", 403,
      "Este programa aún no está disponible para compra"
    );
  }

  // Block buying a rival creator's one-on-one program while locked in
  if (course.deliveryType === "one_on_one") {
    const lock = await getActiveOneOnOneLock(auth.userId);
    if (lock && lock.creatorId !== course.creator_id) {
      throw new WakeApiServerError(
        "CONFLICT", 409,
        "Ya estás en un programa uno-a-uno. Termínalo antes de comenzar otro."
      );
    }
  }

  // Audit M-23: course.price must be a positive integer (COP, no subunits).
  if (typeof course.price !== "number" ||
      !Number.isInteger(course.price) ||
      course.price <= 0) {
    throw new WakeApiServerError(
      "VALIDATION_ERROR", 400,
      "El precio del curso no es válido", "course.price"
    );
  }

  // Beta cap: refuse checkout once the program is full. Real lock — the UI also
  // hides the button, but a client could call this directly.
  await assertCourseHasSeat(courseId, course);

  const externalReference = buildExternalReference(auth.userId, courseId, "otp");

  const client = getMPClient();
  const preference = new Preference(client);
  const result = await preference.create({
    body: {
      binary_mode: true,
      items: [{
        id: courseId,
        title: course.title,
        quantity: 1,
        unit_price: course.price,
      }],
      external_reference: externalReference,
      back_urls: await (async () => {
        const base = resolveAppBaseUrl(req);
        const username = await resolveCreatorUsername(course.creator_id);
        const successUrl = buildPostPaymentUrl({base, username, courseId, mode: "one_time"});
        // Failure/pending always land on the PWA's cancelled screen so the
        // copy matches the user's actual state ("no se completó") instead of
        // a generic "thanks for buying" panel.
        const cancelledUrl = `${base}/app/payment/cancelled?courseId=${encodeURIComponent(courseId)}`;
        return {success: successUrl, failure: cancelledUrl, pending: cancelledUrl};
      })(),
      // auto_return:"all" so a rejected/abandoned checkout also auto-redirects
      // back to /payment/cancelled instead of stranding the user on MP. With
      // binary_mode:true above, MP only returns approved or rejected — never
      // pending — so the pending back_url is just a defensive fallback.
      auto_return: "all",
    },
  });

  res.json({data: {init_point: result.init_point}});
});

// ─── POST /payments/subscription ──────────���───────────────────────────────

router.post("/payments/subscription", async (req, res) => {
  const auth = await validateAuth(req);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const body = validateBody<{ courseId: string; payer_email: string; surface?: string }>(
    {courseId: "string", payer_email: "string", surface: "optional_string"},
    req.body
  );
  const surface = typeof body.surface === "string" ? body.surface : "unknown";

  if (!COURSE_ID_RE.test(body.courseId)) {
    throw new WakeApiServerError("VALIDATION_ERROR", 400, "courseId inválido", "courseId");
  }
  // Normalize at validation time — case + whitespace differences between
  // checkout and sign-in break pickRecipientEmail's downstream matching.
  body.payer_email = body.payer_email.trim().toLowerCase();
  if (!EMAIL_RE.test(body.payer_email)) {
    throw new WakeApiServerError("VALIDATION_ERROR", 400, "Email de pago inválido", "payer_email");
  }

  const courseDoc = await db.collection("courses").doc(body.courseId).get();
  if (!courseDoc.exists) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Curso no encontrado");
  }

  const course = courseDoc.data()!;

  // Block subscription checkout for non-published courses. Catalog-discovery
  // routes already filter `status == "published"`, but this endpoint accepts a
  // direct courseId so a leaked/draft id could otherwise create a billable
  // PreApproval against a course no real subscriber should see. Creators
  // previewing their own draft can self-grant via /users/me/move-course
  // (isFreeGrantAllowed allows draft + own course).
  if (course.status !== "published") {
    throw new WakeApiServerError(
      "FORBIDDEN", 403,
      "Este programa aún no está disponible para suscripción"
    );
  }

  // Subscription uses the dedicated monthly price; falls back to course.price
  // for 1:1 programs (which are subscription-only by design) and legacy docs.
  const monthlyPrice = typeof course.subscription_price === "number" && course.subscription_price > 0 ?
    course.subscription_price :
    (course.deliveryType === "one_on_one" && typeof course.price === "number" ? course.price : null);
  if (monthlyPrice === null || monthlyPrice <= 0) {
    throw new WakeApiServerError("VALIDATION_ERROR", 400, "Este programa no ofrece suscripción");
  }

  // Block buying a rival creator's one-on-one program while locked in
  if (course.deliveryType === "one_on_one") {
    const lock = await getActiveOneOnOneLock(auth.userId);
    if (lock && lock.creatorId !== course.creator_id) {
      throw new WakeApiServerError(
        "CONFLICT", 409,
        "Ya estás en un programa uno-a-uno. Termínalo antes de comenzar otro."
      );
    }
  }

  // Beta cap: refuse checkout once the program is full. Real lock — the UI also
  // hides the button, but a client could call this directly.
  await assertCourseHasSeat(body.courseId, course);

  const userDoc = await db.collection("users").doc(auth.userId).get();
  if (!userDoc.exists) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Usuario no encontrado");
  }

  // Classify the email the client chose so we can later compare strand-rates of
  // "account" vs "custom" choosers. Account email comes from the verified user
  // doc; payer_email is whatever the proactive email step sent.
  const accountEmail =
    typeof userDoc.data()?.email === "string" ?
      (userDoc.data()?.email as string).trim().toLowerCase() :
      null;
  const emailType: "account" | "custom" =
    accountEmail && accountEmail === body.payer_email ? "account" : "custom";

  const client = getMPClient();
  const preapproval = new PreApproval(client);
  const startDate = new Date(Date.now() + 5 * 60 * 1000);
  const externalRef = buildExternalReference(auth.userId, body.courseId, "sub");

  const courseFreeTrial = (course.free_trial ?? {}) as { active?: boolean; duration_days?: number };
  // clampTrialDurationDays caps at MAX_TRIAL_DURATION_DAYS (14). Skip the call
  // for invalid configs (active but missing/zero/negative duration) — those
  // would throw and fail the whole subscription request; treat as no trial.
  const rawTrialDays = courseFreeTrial.active === true ? courseFreeTrial.duration_days : undefined;
  const trialDays = typeof rawTrialDays === "number" && rawTrialDays >= 1 ?
    clampTrialDurationDays(rawTrialDays) :
    0;

  // Webhook URL: prefer explicit override (used by ad-hoc tests / tunnels);
  // otherwise default to the project's Hosting rewrite to /api/v1/payments/webhook.
  // Without this, MP falls back to the account-level URL configured in the
  // dashboard — silently dropping webhooks if that URL is wrong/missing.
  const notificationUrl = resolveWebhookUrl();

  logCheckout("subscription.create.attempt", {
    userId: auth.userId,
    courseId: body.courseId,
    externalReference: externalRef,
    surface,
    emailType,
    payerEmail: body.payer_email,
    accountEmail,
    monthlyPrice,
    trialDays,
    deliveryType: course.deliveryType ?? null,
  });

  let result;
  try {
    result = await preapproval.create({
      body: {
        payer_email: body.payer_email,
        reason: course.title || "Subscription",
        external_reference: externalRef,
        auto_recurring: {
          frequency: 1,
          frequency_type: "months",
          transaction_amount: monthlyPrice,
          currency_id: "COP",
          start_date: startDate.toISOString(),
          ...(trialDays > 0 ? {
            free_trial: {frequency: trialDays, frequency_type: "days"},
          } : {}),
        },
        status: "pending",
        back_url: buildPostPaymentUrl({
          base: resolveAppBaseUrl(req),
          username: await resolveCreatorUsername(course.creator_id),
          courseId: body.courseId,
          mode: "subscription",
        }),
        // notification_url isn't in the SDK's PreApprovalRequest type but MP
        // does honor it. Spread keeps TS happy without an explicit `as any`.
        ...{notification_url: notificationUrl},
      },
    });
  } catch (error: unknown) {
    // MP SDK throws plain objects ({message, status}), not Error instances.
    const {mpStatus, mpMessage, mpRaw} = describeMpError(error);
    const msg = mpMessage.toLowerCase();
    const needsAltEmail =
      msg.includes("cannot operate between different") ||
      msg.includes("payer_email") ||
      msg.includes("belongs to another user") ||
      msg.includes("must belong to this site");

    logCheckout("subscription.create.fail", {
      userId: auth.userId,
      courseId: body.courseId,
      externalReference: externalRef,
      surface,
      emailType,
      payerEmail: body.payer_email,
      needsAltEmail,
      mpStatus,
      mpMessage,
      mp: mpRaw,
    });

    if (needsAltEmail) {
      res.status(409).json({
        error: {code: "CONFLICT", message: "Por favor ingresa tu correo de Mercado Pago"},
        requireAlternateEmail: true,
      });
      return;
    }
    throw error;
  }

  logCheckout("subscription.create.mp_response", {
    userId: auth.userId,
    courseId: body.courseId,
    externalReference: externalRef,
    subscriptionId: result.id ?? null,
    surface,
    emailType,
    mp: result,
  });

  if (!result.init_point || !result.id) {
    throw new WakeApiServerError("INTERNAL_ERROR", 500, "No se pudo crear el enlace de pago");
  }

  interface PreapprovalDetails {
    next_payment_date?: string | null;
    auto_recurring?: { next_payment_date?: string | null; start_date?: string | null };
  }
  let nextBillingDate: string | null = null;
  try {
    const details = await preapproval.get({id: result.id}) as PreapprovalDetails;
    nextBillingDate =
      details?.next_payment_date ||
      details?.auto_recurring?.next_payment_date ||
      details?.auto_recurring?.start_date ||
      null;
  } catch {/* non-critical */}

  if (!nextBillingDate) nextBillingDate = startDate.toISOString();

  await db
    .collection("users")
    .doc(auth.userId)
    .collection("subscriptions")
    .doc(result.id)
    .set({
      subscription_id: result.id,
      user_id: auth.userId,
      course_id: body.courseId,
      course_title: course.title || "Subscription",
      status: "pending",
      payer_email: body.payer_email,
      transaction_amount: monthlyPrice,
      access_duration: "monthly",
      currency_id: "COP",
      management_url: `https://www.mercadopago.com.co/subscriptions/management?preapproval_id=${result.id}`,
      next_billing_date: nextBillingDate,
      free_trial_days: trialDays,
      created_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp(),
    }, {merge: true});

  logCheckout("subscription.create.ok", {
    userId: auth.userId,
    courseId: body.courseId,
    externalReference: externalRef,
    subscriptionId: result.id,
    surface,
    emailType,
    status: result.status ?? null,
    trialDays,
    nextBillingDate,
  });

  res.json({data: {init_point: result.init_point, subscription_id: result.id, free_trial_days: trialDays}});
});

// ─── POST /payments/bundle-preference ─────────────────────────────────────

router.post("/payments/bundle-preference", async (req, res) => {
  const auth = await validateAuth(req);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const body = validateBody<{ bundleId: string }>(
    {bundleId: "string"},
    req.body,
  );

  if (!COURSE_ID_RE.test(body.bundleId)) {
    throw new WakeApiServerError("VALIDATION_ERROR", 400, "bundleId inválido", "bundleId");
  }

  const bundleDoc = await db.collection("bundles").doc(body.bundleId).get();
  if (!bundleDoc.exists) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Bundle no encontrado");
  }
  const bundle = bundleDoc.data()!;
  if (bundle.status !== "published") {
    throw new WakeApiServerError("NOT_FOUND", 404, "Bundle no disponible");
  }

  const price = resolveBundleOtpPrice(bundle.pricing);
  if (price === null) {
    throw new WakeApiServerError(
      "VALIDATION_ERROR", 400,
      "Este bundle no ofrece pago único",
      "bundleId",
    );
  }

  const externalReference = buildExternalReference(auth.userId, body.bundleId, "bundle-otp");

  const client = getMPClient();
  const preference = new Preference(client);
  const result = await preference.create({
    body: {
      binary_mode: true,
      items: [{
        id: body.bundleId,
        title: bundle.title,
        quantity: 1,
        unit_price: price,
      }],
      external_reference: externalReference,
      metadata: {access_duration: "yearly"},
      back_urls: await (async () => {
        const base = resolveAppBaseUrl(req);
        const username = await resolveCreatorUsername(bundle.creator_id);
        const successUrl = buildPostPaymentUrl({base, username, bundleId: body.bundleId, mode: "one_time"});
        const cancelledUrl = `${base}/app/payment/cancelled?bundleId=${encodeURIComponent(body.bundleId)}`;
        return {success: successUrl, failure: cancelledUrl, pending: cancelledUrl};
      })(),
      // See /payments/preference above: "all" so abandoned checkouts redirect
      // to /payment/cancelled instead of stranding the user on MP.
      auto_return: "all",
    },
  });

  res.json({data: {init_point: result.init_point}});
});

// ─── POST /payments/bundle-subscription ───────────────────────────────────

router.post("/payments/bundle-subscription", async (req, res) => {
  const auth = await validateAuth(req);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const body = validateBody<{
    bundleId: string;
    payer_email: string;
    surface?: string;
  }>({
    bundleId: "string",
    payer_email: "string",
    surface: "optional_string",
  }, req.body);
  const surface = typeof body.surface === "string" ? body.surface : "unknown";

  if (!COURSE_ID_RE.test(body.bundleId)) {
    throw new WakeApiServerError("VALIDATION_ERROR", 400, "bundleId inválido", "bundleId");
  }
  body.payer_email = body.payer_email.trim().toLowerCase();
  if (!EMAIL_RE.test(body.payer_email)) {
    throw new WakeApiServerError("VALIDATION_ERROR", 400, "Email de pago inválido", "payer_email");
  }

  const bundleDoc = await db.collection("bundles").doc(body.bundleId).get();
  if (!bundleDoc.exists) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Bundle no encontrado");
  }
  const bundle = bundleDoc.data()!;
  if (bundle.status !== "published") {
    throw new WakeApiServerError("NOT_FOUND", 404, "Bundle no disponible");
  }

  const price = resolveBundleSubscriptionPrice(bundle.pricing);
  if (price === null) {
    throw new WakeApiServerError(
      "VALIDATION_ERROR", 400,
      "Este bundle no ofrece suscripción",
      "bundleId",
    );
  }

  const userDoc = await db.collection("users").doc(auth.userId).get();
  if (!userDoc.exists) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Usuario no encontrado");
  }

  const client = getMPClient();
  const preapproval = new PreApproval(client);
  const startDate = new Date(Date.now() + 5 * 60 * 1000);
  const externalRef = buildExternalReference(auth.userId, body.bundleId, "bundle-sub");

  const frequencyType = "months";
  const frequency = 1;

  const accountEmail =
    typeof userDoc.data()?.email === "string" ?
      (userDoc.data()?.email as string).trim().toLowerCase() :
      null;
  const emailType: "account" | "custom" =
    accountEmail && accountEmail === body.payer_email ? "account" : "custom";

  logCheckout("subscription.create.attempt", {
    userId: auth.userId,
    bundleId: body.bundleId,
    externalReference: externalRef,
    kind: "bundle",
    surface,
    emailType,
    payerEmail: body.payer_email,
    accountEmail,
    monthlyPrice: price,
  });

  let result;
  try {
    result = await preapproval.create({
      body: {
        payer_email: body.payer_email,
        reason: bundle.title || "Bundle subscription",
        external_reference: externalRef,
        auto_recurring: {
          frequency,
          frequency_type: frequencyType,
          transaction_amount: price,
          currency_id: "COP",
          start_date: startDate.toISOString(),
        },
        status: "pending",
        back_url: buildPostPaymentUrl({
          base: resolveAppBaseUrl(req),
          username: await resolveCreatorUsername(bundle.creator_id),
          bundleId: body.bundleId,
          mode: "subscription",
        }),
      },
    });
  } catch (error: unknown) {
    const {mpStatus, mpMessage, mpRaw} = describeMpError(error);
    const msg = mpMessage.toLowerCase();
    const needsAltEmail =
      msg.includes("cannot operate between different") ||
      msg.includes("payer_email") ||
      msg.includes("belongs to another user") ||
      msg.includes("must belong to this site");

    logCheckout("subscription.create.fail", {
      userId: auth.userId,
      bundleId: body.bundleId,
      externalReference: externalRef,
      kind: "bundle",
      surface,
      emailType,
      payerEmail: body.payer_email,
      needsAltEmail,
      mpStatus,
      mpMessage,
      mp: mpRaw,
    });

    if (needsAltEmail) {
      res.status(409).json({
        error: {code: "CONFLICT", message: "Por favor ingresa tu correo de Mercado Pago"},
        requireAlternateEmail: true,
      });
      return;
    }
    throw error;
  }

  if (!result.init_point || !result.id) {
    throw new WakeApiServerError("INTERNAL_ERROR", 500, "No se pudo crear el enlace de pago");
  }

  interface PreapprovalDetails {
    next_payment_date?: string | null;
    auto_recurring?: { next_payment_date?: string | null; start_date?: string | null };
  }
  let nextBillingDate: string | null = null;
  try {
    const details = await preapproval.get({id: result.id}) as PreapprovalDetails;
    nextBillingDate =
      details?.next_payment_date ||
      details?.auto_recurring?.next_payment_date ||
      details?.auto_recurring?.start_date ||
      null;
  } catch {/* non-critical */}

  if (!nextBillingDate) nextBillingDate = startDate.toISOString();

  await db
    .collection("users")
    .doc(auth.userId)
    .collection("subscriptions")
    .doc(result.id)
    .set({
      subscription_id: result.id,
      user_id: auth.userId,
      bundle_id: body.bundleId,
      bundle_title: bundle.title || "Bundle",
      course_id: null,
      access_duration: "monthly",
      status: "pending",
      payer_email: body.payer_email,
      transaction_amount: price,
      currency_id: "COP",
      management_url: `https://www.mercadopago.com.co/subscriptions/management?preapproval_id=${result.id}`,
      next_billing_date: nextBillingDate,
      created_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp(),
    }, {merge: true});

  logCheckout("subscription.create.ok", {
    userId: auth.userId,
    bundleId: body.bundleId,
    externalReference: externalRef,
    subscriptionId: result.id,
    kind: "bundle",
    surface,
    emailType,
    status: result.status ?? null,
    nextBillingDate,
    mp: result,
  });

  res.json({data: {init_point: result.init_point, subscription_id: result.id}});
});

// ─── POST /payments/webhook ────────────────────────────────────────────────

router.post("/payments/webhook", async (req: Request, res) => {
  const webhookSecret = process.env.MERCADOPAGO_WEBHOOK_SECRET;
  if (!webhookSecret) {
    // Missing secret is a deploy-config problem — MP retrying for 24h while
    // we wait for a re-deploy doesn't change anything and floods logs. Log
    // loudly so on-call notices, then 200 so MP stops retrying. Reconcile
    // will sweep up any missed state once the secret returns.
    functions.logger.error("CRITICAL: Webhook secret missing — webhook dropped without processing", {
      webhookType: req.body?.type, webhookAction: req.body?.action,
    });
    res.status(200).send("OK");
    return;
  }

  // ── Validate signature ──
  const signatureHeaderNew = req.get("x-signature");
  const signatureHeaderLegacy =
    req.get("x-hmac-signature") ||
    req.get("x-mercadopago-signature") ||
    req.get("x-hmac-signature-256");

  let signatureIsValid = false;
  // Diagnostic state surfaced on rejection so we can tell signature-mismatch
  // apart from missing-header / stale-timestamp / wrong-secret without leaking
  // the actual signature or secret to logs.
  let signatureFailReason: string | null = null;

  if (signatureHeaderNew) {
    const parsed: Record<string, string> = {};
    for (const part of signatureHeaderNew.split(",")) {
      const [key, value] = part.split("=");
      if (key && value) parsed[key.trim()] = value.trim();
    }
    const ts = parsed["ts"];
    const sig = parsed["v1"];
    const requestId = req.get("x-request-id") ?? "";
    // MP's signature template uses data.id from the URL query string, not the
    // body. Both usually hold the same value, but the dashboard test webhook
    // and some integration variants only set the query parameter. Try query
    // first to match what MP actually signs, with body as fallback.
    const queryDataId =
      (req.query?.["data.id"] as string | undefined) ??
      (req.query?.id as string | undefined);
    const bodyDataId = req.body?.data?.id;
    const dataId = queryDataId ?? bodyDataId;

    if (!ts || !sig || !requestId || !dataId) {
      signatureFailReason = "v2_missing_components";
    } else {
      // MP sends ts in milliseconds since epoch (~13 digits at current dates).
      // Older docs/examples show ts in seconds (10 digits); handle both so we
      // don't blow the window if MP ever changes formats again.
      const tsNum = Number(ts);
      const tsMs = isNaN(tsNum) ? NaN : tsNum > 1e12 ? tsNum : tsNum * 1000;
      // 24h tolerance: MP retries failed webhooks with exponential backoff
      // for up to ~24 hours, signing each retry with the ORIGINAL send time.
      // A 5-min window meant every retry past that mark rejected as
      // "timestamp expirado", defeating the entire retry contract. HMAC
      // verification + processed_payments idempotency provide replay
      // protection — the timestamp check is at best a defense-in-depth
      // signal that we can afford to widen.
      if (isNaN(tsMs) || Math.abs(Date.now() - tsMs) > 24 * 60 * 60 * 1000) {
        functions.logger.warn("Webhook signature: timestamp out of range", {
          tsRaw: ts, tsMs, nowMs: Date.now(), skewMs: Date.now() - tsMs,
        });
        res.status(403).json({
          error: {code: "FORBIDDEN", message: "Webhook timestamp expirado"},
        });
        return;
      }

      // Compute against both candidates so we tolerate either MP convention.
      const candidates = bodyDataId && bodyDataId !== queryDataId ?
        [dataId, bodyDataId] :
        [dataId];
      for (const candidate of candidates) {
        const template = `id:${candidate};request-id:${requestId};ts:${ts};`;
        const expected = crypto.createHmac("sha256", webhookSecret).update(template).digest("hex");
        if (sig.length === expected.length) {
          try {
            if (crypto.timingSafeEqual(
              Buffer.from(sig, "utf8"),
              Buffer.from(expected, "utf8")
            )) {
              signatureIsValid = true;
              break;
            }
          } catch {/* length mismatch */}
        }
      }
      if (!signatureIsValid) {
        signatureFailReason = "v2_hmac_mismatch";
      }
    }
  } else if (signatureHeaderLegacy) {
    // Legacy HMAC signs the raw request body. Express's json() parser has
    // already consumed and discarded the original bytes by this point, so
    // we MUST read from req.rawBody (preserved by the Firebase Functions
    // wrapper). JSON.stringify(req.body) does NOT round-trip byte-for-byte
    // — key ordering, whitespace, numeric formatting, and unicode escapes
    // all differ — so the old fallback silently rejected every legacy-
    // signed payload. Refuse loudly instead so on-call can spot it.
    const rawBodyValue = (req as Request & { rawBody?: unknown }).rawBody;
    let rawBodyBuffer: Buffer | null = null;
    if (Buffer.isBuffer(rawBodyValue)) {
      rawBodyBuffer = rawBodyValue;
    } else if (typeof rawBodyValue === "string") {
      rawBodyBuffer = Buffer.from(rawBodyValue);
    }

    if (!rawBodyBuffer) {
      signatureFailReason = "legacy_rawbody_missing";
    } else {
      const expected = crypto.createHmac("sha256", webhookSecret).update(rawBodyBuffer).digest("hex");
      if (signatureHeaderLegacy.length === expected.length) {
        try {
          signatureIsValid = crypto.timingSafeEqual(
            Buffer.from(signatureHeaderLegacy, "utf8"),
            Buffer.from(expected, "utf8")
          );
        } catch {/* length mismatch */}
      }
      if (!signatureIsValid) {
        signatureFailReason = "legacy_hmac_mismatch";
      }
    }
  } else {
    signatureFailReason = "no_signature_header";
  }

  if (!signatureIsValid) {
    // Diagnostic: log header presence + reason but NOT the secret or the
    // signature bytes. Lets us distinguish "MP didn't sign" from "secret
    // mismatch" from "stale timestamp" without leaking sensitive material.
    functions.logger.warn("Webhook signature rejected", {
      reason: signatureFailReason,
      hasXSignature: Boolean(signatureHeaderNew),
      hasLegacy: Boolean(signatureHeaderLegacy),
      hasRequestId: Boolean(req.get("x-request-id")),
      queryKeys: Object.keys(req.query ?? {}),
      bodyType: typeof req.body,
      bodyHasDataId: Boolean(req.body?.data?.id),
      contentType: req.get("content-type") ?? null,
      userAgent: req.get("user-agent") ?? null,
    });
    res.status(403).json({
      error: {code: "FORBIDDEN", message: "Firma de webhook inválida"},
    });
    return;
  }

  const webhookType = req.body?.type;
  const webhookAction = req.body?.action;

  // Full raw capture of every signature-valid webhook MercadoPago sends, so a
  // checkout can be reconstructed from logs. Correlation id is the MP resource
  // id in data.id (a preapproval or payment id depending on type).
  logCheckout("webhook.received", {
    webhookType,
    webhookAction,
    dataId: req.body?.data?.id ?? null,
    liveMode: req.body?.live_mode ?? null,
    query: req.query ?? null,
    mp: req.body,
  });

  // ── subscription_preapproval (status updates only) ──
  if (webhookType === "subscription_preapproval") {
    const preapprovalId = req.body?.data?.id;
    if (!preapprovalId) {
      res.status(200).send("OK");
      return;
    }
    try {
      const client = getMPClient();
      const preapproval = new PreApproval(client);
      const preapprovalData = await preapproval.get({id: preapprovalId}) as unknown as MercadoPagoPreapproval;
      const externalReference = preapprovalData?.external_reference;
      logCheckout("webhook.preapproval.fetched", {
        preapprovalId,
        externalReference: externalReference ?? null,
        mpStatus: preapprovalData?.status ?? null,
        payerEmail: preapprovalData?.payer_email ?? null,
        mp: preapprovalData,
      });
      if (!externalReference) {
        res.status(200).send("OK");
        return;
      }
      let parsed: ParsedReference;
      try {
        parsed = parseExternalReference(externalReference);
      } catch {
        res.status(200).send("OK"); return;
      }

      const autoRecurring = preapprovalData?.auto_recurring;
      const nextPaymentDate =
        preapprovalData?.next_payment_date ||
        autoRecurring?.next_payment_date ||
        null;

      const updateData: Record<string, unknown> = {
        status: preapprovalData?.status || "pending",
        transaction_amount: autoRecurring?.transaction_amount ?? null,
        currency_id: autoRecurring?.currency_id ?? null,
        reason: preapprovalData?.reason ?? null,
        management_url: `https://www.mercadopago.com.co/subscriptions/management?preapproval_id=${preapprovalId}`,
        next_billing_date: nextPaymentDate,
        updated_at: FieldValue.serverTimestamp(),
        last_action: webhookAction,
      };

      const payerEmail = preapprovalData?.payer_email ?? preapprovalData?.payer?.email ?? null;
      if (payerEmail) updateData.payer_email = payerEmail;

      if (preapprovalData?.status === "cancelled") {
        updateData.cancelled_at = FieldValue.serverTimestamp();
      }

      // Security (audit H-21): require existing local subscription doc with
      // matching userId. Without this, an off-platform preapproval with a
      // crafted external_reference can cause us to merge writes into an
      // arbitrary user's subscriptions namespace.
      const subRef = db
        .collection("users")
        .doc(parsed.userId)
        .collection("subscriptions")
        .doc(preapprovalId);
      let existingSub = await subRef.get();
      // Materialize the local sub doc when MP says a preapproval exists for
      // this user+course but our Firestore write failed during checkout.
      // Without this, the recurring webhook would keep arriving for a
      // preapproval we have no record of — MP bills the buyer monthly, Wake
      // never grants access, and reconcileSubscriptions can't help (it only
      // walks docs that already exist). The materialized doc is tagged with
      // last_action: "materialized_from_webhook" so we can see how often
      // this path fires. Only safe because we've already validated the MP
      // preapproval is real (preapproval.get above) and that
      // external_reference's userId matches parsed.userId.
      if (!existingSub.exists) {
        const payerEmailForMaterialize =
          preapprovalData?.payer_email ?? preapprovalData?.payer?.email ?? null;
        const trialDaysFromMp = Number(autoRecurring?.free_trial?.frequency ?? 0);
        await subRef.set({
          subscription_id: preapprovalId,
          user_id: parsed.userId,
          userId: parsed.userId,
          course_id: parsed.courseId ?? null,
          bundle_id: parsed.bundleId ?? null,
          status: preapprovalData?.status || "pending",
          payer_email: payerEmailForMaterialize,
          transaction_amount: autoRecurring?.transaction_amount ?? null,
          currency_id: autoRecurring?.currency_id ?? null,
          free_trial_days: Number.isFinite(trialDaysFromMp) && trialDaysFromMp > 0 ? trialDaysFromMp : 0,
          created_at: FieldValue.serverTimestamp(),
          updated_at: FieldValue.serverTimestamp(),
          last_action: "materialized_from_webhook",
        }, {merge: true});
        functions.logger.warn("Materialized missing subscription doc from webhook", {
          preapprovalId, userId: parsed.userId, courseId: parsed.courseId ?? null,
        });
        existingSub = await subRef.get();
      }
      const existingSubData = existingSub.data() ?? {};
      const existingUserId = (existingSubData.user_id ?? existingSubData.userId ?? parsed.userId) as string;
      if (existingUserId !== parsed.userId) {
        functions.logger.error("Preapproval external_reference userId mismatch", {
          preapprovalId, claimedUserId: parsed.userId, actualUserId: existingUserId,
        });
        res.status(200).send("OK");
        return;
      }

      logCheckout("webhook.preapproval.status", {
        subscriptionId: preapprovalId,
        userId: parsed.userId,
        courseId: parsed.courseId ?? null,
        bundleId: parsed.bundleId ?? null,
        from: existingSubData.status ?? null,
        to: preapprovalData?.status ?? null,
        payerEmail: preapprovalData?.payer_email ?? null,
        trialDays: Number(existingSubData.free_trial_days) || 0,
      });

      await subRef.set(updateData, {merge: true});

      // Analytics: fire subscription.cancelled when status transitions to cancelled
      if (preapprovalData?.status === "cancelled" && existingSubData.status !== "cancelled") {
        const createdMs = (existingSubData.created_at as {toMillis?: () => number} | null)?.toMillis?.() ?? null;
        const daysActive = createdMs ? Math.floor((Date.now() - createdMs) / 86400000) : null;
        let hadSurvey = false;
        try {
          const fb = await db.collection("subscription_cancellation_feedback")
            .where("subscriptionId", "==", preapprovalId)
            .limit(1).get();
          hadSurvey = !fb.empty;
        } catch {/* non-critical */}
        try {
          analyticsCapture({
            distinctId: parsed.userId,
            event: "subscription.cancelled",
            properties: {
              course_id: existingSubData.course_id ?? null,
              had_survey: hadSurvey,
              days_active: daysActive,
              source: "webhook",
            },
          });
        } catch {/* non-critical */}
      }

      // Trial-grant: when a free-trial preapproval becomes authorized, grant
      // course access immediately so the user has the program during the
      // trial window. The first real charge fires only after the trial,
      // so without this the user has paid but sees no course. Idempotent —
      // re-firing of the same webhook is a no-op once access exists.
      //
      // Errors here are NOT swallowed: classify and return 5xx for retryable
      // failures so MP retries the webhook. Otherwise the user has signed up
      // for a trial, has been billed (or will be), and silently has no access
      // until the daily reconcile cron catches up.
      const trialDays = Number(existingSubData.free_trial_days);
      const courseIdForGrant =
        typeof existingSubData.course_id === "string" ? existingSubData.course_id : "";
      // Bundle-trial-grant is a known gap: this block only runs for
      // single-course subs (courseIdForGrant must be non-empty). Bundle
      // trial purchases rely on the daily reconcileSubscriptions cron to
      // materialize access entries from bundle.course_ids — slower but
      // safe. Trial-grant via webhook for bundles would require fetching
      // the bundle and looping; deferred until bundle-trials see real
      // volume.
      // Synthesize the trial expiry when MP omits next_payment_date on the
      // first authorized webhook (common on initial authorization — the
      // billing schedule isn't computed until the trial timer starts). The
      // local sub doc has free_trial_days, and MP gives us start_date in
      // auto_recurring; either is enough to derive a deterministic expiry.
      // Last-resort: now + trialDays days. Without this fallback the entire
      // trial grant block silently skipped and the buyer paid for access
      // they never received — see P0-9 in the audit.
      let trialEndIso: string | null = null;
      if (preapprovalData?.status === "authorized" && trialDays > 0 && courseIdForGrant) {
        const candidates: Array<string | null | undefined> = [
          nextPaymentDate,
          autoRecurring?.start_date,
        ];
        for (const candidate of candidates) {
          if (typeof candidate !== "string") continue;
          const ms = Date.parse(candidate);
          if (!Number.isFinite(ms)) continue;
          // MP's start_date is the trial START (= now). The trial END is
          // start + trialDays. Distinguish from next_payment_date which IS
          // the trial end. Heuristic: if the candidate is within 24h of
          // now, treat it as start; otherwise treat as end.
          if (Math.abs(ms - Date.now()) < 24 * 60 * 60 * 1000) {
            trialEndIso = new Date(ms + trialDays * 86400000).toISOString();
          } else {
            trialEndIso = new Date(ms).toISOString();
          }
          break;
        }
        if (!trialEndIso) {
          trialEndIso = new Date(Date.now() + trialDays * 86400000).toISOString();
        }
      }

      if (preapprovalData?.status === "authorized" && trialDays > 0 && courseIdForGrant && trialEndIso) {
        try {
          const userRef = db.collection("users").doc(parsed.userId);
          const userDoc = await userRef.get();
          const userData = userDoc.exists ? (userDoc.data() ?? null) : null;
          const existing = (userData?.courses?.[courseIdForGrant] ?? null) as
            Record<string, unknown> | null;
          const alreadyActive = existing?.status === "active" &&
            typeof existing?.expires_at === "string" &&
            new Date(existing.expires_at as string) > new Date();
          if (!alreadyActive) {
            const courseDoc = await db.collection("courses").doc(courseIdForGrant).get();
            const course = (courseDoc.exists ? courseDoc.data() : {}) as Record<string, unknown>;
            // Preserve purchased_at across re-grants (e.g. re-trial). The
            // dotted update() syntax replaces the whole sub-object, so we
            // need to explicitly carry it forward. Matters for funnel
            // analytics that key on first acquisition.
            const purchasedAt =
              (typeof existing?.purchased_at === "string" ? existing.purchased_at : null) ??
              new Date().toISOString();
            await userRef.update({
              [`courses.${courseIdForGrant}`]: {
                access_duration: course.access_duration ?? "monthly",
                expires_at: trialEndIso,
                status: "active",
                is_trial: true,
                purchased_at: purchasedAt,
                deliveryType: course.deliveryType ?? "general",
                title: course.title ?? "Untitled Course",
                image_url: course.image_url ?? null,
                discipline: course.discipline ?? "General",
                creatorName: course.creatorName ?? course.creator_name ?? null,
                creator_id: course.creator_id ?? null,
              },
              // Count trial grants toward the beta cap. arrayUnion keeps this
              // set-unique, so the cap's seat count (see capacity.ts) includes
              // trial users from the moment access is granted, not their first
              // charge.
              purchased_courses: FieldValue.arrayUnion(courseIdForGrant),
              updated_at: FieldValue.serverTimestamp(),
            });

            const recipient = pickRecipientEmail(userData, payerEmail);
            const transactionAmount = autoRecurring?.transaction_amount ?? 0;
            const currency = autoRecurring?.currency_id ?? "COP";
            if (recipient && transactionAmount > 0) {
              await sendTrialActivatedEmail({
                to: recipient,
                programTitle: (course.title as string) ?? "tu programa",
                courseId: courseIdForGrant,
                trialDays,
                trialEndDate: trialEndIso,
                transactionAmount,
                currencyId: currency,
              });
            }
          }
        } catch (trialErr) {
          functions.logger.error("Trial grant failed", trialErr);
          if (classifyError(trialErr) === "RETRYABLE") {
            res.status(500).json({
              error: {code: "INTERNAL_ERROR", message: "Error procesando trial"},
            });
            return;
          }
          // NON_RETRYABLE: fall through to 200 so MP stops retrying.
        }
      }
    } catch (err) {
      // Outer try guards the preapproval fetch + sub doc set. Classify
      // similarly so dropped webhooks don't go silent.
      functions.logger.error("Error processing subscription_preapproval webhook", err);
      if (classifyError(err) === "RETRYABLE") {
        res.status(500).json({
          error: {code: "INTERNAL_ERROR", message: "Error procesando preapproval"},
        });
        return;
      }
    }

    res.status(200).send("OK");
    return;
  }

  // ── Payment processing ──
  let paymentId: string | null = null;

  if (webhookType === "payment") {
    if (webhookAction !== "payment.created" && webhookAction !== "payment.updated") {
      res.status(200).send("OK");
      return;
    }
    paymentId = req.body?.data?.id;
  } else if (webhookType === "subscription_authorized_payment") {
    if (webhookAction !== "created") {
      res.status(200).send("OK");
      return;
    }
    paymentId = req.body?.data?.id;
  } else {
    res.status(200).send("OK");
    return;
  }

  if (!paymentId) {
    res.status(400).json({
      error: {code: "VALIDATION_ERROR", message: "Payment ID requerido"},
    });
    return;
  }

  const processedRef = db.collection("processed_payments").doc(paymentId);

  // Idempotency check for updated events.
  //
  // Reprocess allowlist: any prior state that can legitimately transition
  // to "approved" via a later MP event. Some card flows land at "authorized"
  // first (held but not captured) and only emit a payment.updated with
  // "approved" later — without "authorized" in the allowlist, that second
  // event short-circuited and the buyer never got access.
  if (webhookAction === "payment.updated" || webhookAction === "updated") {
    const processedDoc = await processedRef.get();
    if (processedDoc.exists) {
      const prevStatus = processedDoc.data()?.status;
      if (prevStatus === "approved") {
        res.status(200).send("OK");
        return;
      }
      const reprocessable = new Set(["pending", "in_process", "processing", "authorized"]);
      if (!reprocessable.has(prevStatus)) {
        res.status(200).send("OK");
        return;
      }
    }
  }

  // Fetch payment from MercadoPago
  interface MercadoPagoPaymentData {
    status?: string;
    status_detail?: string;
    external_reference?: string;
    subscription_id?: string;
    preapproval_id?: string;
    date_approved?: string;
    date_created?: string;
    transaction_amount?: number;
    currency_id?: string;
    fee_details?: unknown;
    payer?: { email?: string };
    preapproval?: { id?: string; external_reference?: string };
    payment?: { status?: string };
  }

  let paymentData: MercadoPagoPaymentData | null = null;

  try {
    if (webhookType === "subscription_authorized_payment") {
      const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN!;
      const resp = await fetch(
        `https://api.mercadopago.com/authorized_payments/${paymentId}`,
        {headers: {"Authorization": `Bearer ${accessToken}`, "Content-Type": "application/json"}}
      );
      if (!resp.ok) throw new Error(`Fetch authorized payment failed: ${resp.status}`);
      const rawData = (await resp.json()) as MercadoPagoPaymentData;
      if (!rawData.status) rawData.status = rawData.payment?.status || "approved";
      if (!rawData.external_reference && rawData.preapproval?.external_reference) {
        rawData.external_reference = rawData.preapproval.external_reference;
      }
      if (!rawData.preapproval_id && rawData.preapproval?.id) {
        rawData.preapproval_id = rawData.preapproval.id;
      }
      paymentData = rawData;
    } else {
      const client = getMPClient();
      const payment = new Payment(client);
      paymentData = (await payment.get({id: paymentId}) as MercadoPagoPaymentData) || {};
      logCheckout("webhook.payment.fetched", {
        paymentId,
        externalReference: paymentData?.external_reference ?? null,
        mpStatus: paymentData?.status ?? null,
        statusDetail: paymentData?.status_detail ?? null,
        payerEmail: paymentData?.payer?.email ?? null,
        mp: paymentData,
      });
    }
  } catch (apiError: unknown) {
    const errType = classifyError(apiError);
    if (errType === "RETRYABLE") {
      res.status(500).json({
        error: {code: "INTERNAL_ERROR", message: "Error obteniendo pago"},
      });
    } else {
      await processedRef.set({
        processed_at: FieldValue.serverTimestamp(),
        status: "error",
        error_type: "payment_fetch_failed",
      });
      res.status(200).send("OK");
    }
    return;
  }

  // Refund or chargeback — revoke access + ledger. Shared with the daily
  // reconciliation cron (applyMpRefund) so a webhook-delivered refund and a
  // polled one are applied identically.
  if (paymentData && (paymentData.status === "refunded" || paymentData.status === "charged_back")) {
    try {
      const prev = await processedRef.get();
      const prevData = prev.exists ? prev.data()! : null;
      await applyMpRefund({
        paymentId,
        grant: {
          userId: prevData?.userId as string | undefined,
          courseId: prevData?.courseId as string | undefined,
          bundleId: prevData?.bundleId as string | undefined,
        },
        grossAmount: paymentData.transaction_amount ?? 0,
        currency: paymentData.currency_id ?? "COP",
      });
    } catch (refundErr) {
      functions.logger.error("Refund revocation failed", refundErr);
    }
    await processedRef.set({
      processed_at: FieldValue.serverTimestamp(),
      status: paymentData.status,
      refunded_at: new Date().toISOString(),
    }, {merge: true});
    res.status(200).send("OK");
    return;
  }

  // Not approved?
  if (!paymentData || paymentData.status !== "approved") {
    if (paymentData?.status === "pending" || paymentData?.status === "in_process") {
      res.status(200).send("OK");
      return;
    }
    await processedRef.set({
      processed_at: FieldValue.serverTimestamp(),
      status: paymentData?.status || "unknown",
    });
    // Fire payment_rejected for terminal non-approved statuses (rejected / cancelled)
    if (paymentData?.status === "rejected" || paymentData?.status === "cancelled") {
      let rejectedCourseId: string | null = null;
      let rejectedUserId: string | null = null;
      try {
        const ref = paymentData?.external_reference;
        if (ref) {
          const p = parseExternalReference(ref);
          rejectedCourseId = p.courseId ?? null;
          rejectedUserId = p.userId ?? null;
        }
      } catch {/* non-critical */}
      try {
        analyticsCapture({
          distinctId: rejectedUserId ?? "anonymous",
          event: "subscription.payment_rejected",
          properties: {
            course_id: rejectedCourseId,
            mp_status: paymentData?.status ?? null,
            status_detail: paymentData?.status_detail ?? null,
          },
        });
      } catch {/* non-critical */}
    }
    res.status(200).send("OK");
    return;
  }

  // Atomic idempotency check
  const alreadyProcessed = await db.runTransaction(async (tx) => {
    const doc = await tx.get(processedRef);
    if (doc.exists && doc.data()?.status === "approved") return true;
    tx.set(processedRef, {
      processed_at: FieldValue.serverTimestamp(),
      status: "processing",
      payment_id: paymentId,
    }, {merge: true});
    return false;
  });

  if (alreadyProcessed) {
    res.status(200).send("OK");
    return;
  }

  const externalReference = paymentData.external_reference;
  if (!externalReference) {
    await processedRef.set({
      processed_at: FieldValue.serverTimestamp(),
      status: "error",
      error_type: "missing_external_reference",
    });
    res.status(200).send("OK");
    return;
  }

  let parsed: ParsedReference;
  try {
    parsed = parseExternalReference(externalReference);
  } catch {
    await processedRef.set({
      processed_at: FieldValue.serverTimestamp(),
      status: "error",
      error_type: "invalid_external_reference",
    });
    res.status(200).send("OK");
    return;
  }

  const {userId, paymentType} = parsed;
  const isSubscription = paymentType === "sub" || paymentType === "bundle-sub";
  const isBundle = paymentType === "bundle-otp" || paymentType === "bundle-sub";

  // Validate user exists
  const userDoc = await db.collection("users").doc(userId).get();
  if (!userDoc.exists) {
    await processedRef.set({
      processed_at: FieldValue.serverTimestamp(),
      status: "error", error_type: "user_not_found",
    });
    res.status(200).send("OK");
    return;
  }

  const subscriptionId = paymentData.subscription_id || paymentData.preapproval_id || null;

  // ── Bundle branch ──
  if (isBundle) {
    const bundleId = parsed.bundleId!;
    const bundleDoc = await db.collection("bundles").doc(bundleId).get();
    if (!bundleDoc.exists) {
      await processedRef.set({
        processed_at: FieldValue.serverTimestamp(),
        status: "error", error_type: "bundle_not_found",
      });
      res.status(200).send("OK");
      return;
    }

    const userDataForBundle = userDoc.data()!;
    const existingCoursesForBundle =
      (userDataForBundle.courses ?? {}) as Record<string, Record<string, unknown>>;
    const hasPriorBundleGrant = Object.values(existingCoursesForBundle).some(
      (entry) => entry.bundleId === bundleId && entry.status === "active"
    );
    const isBundleRenewal = hasPriorBundleGrant && isSubscription;

    // Simplified model: subscriptions renew monthly, OTP grants 1 year.
    const accessDuration: string = isSubscription ? "monthly" : "yearly";

    // Refresh preapproval's next_payment_date on each recurring charge so the
    // local sub doc tracks MP truth (see matching block in the course renewal
    // branch below for the full rationale).
    let bundleRefreshedNextBilling: string | null = null;
    let bundleRefreshedAmount: number | null = null;
    let bundleRefreshedCurrency: string | null = null;
    if (isSubscription && subscriptionId) {
      try {
        const client = getMPClient();
        const preapproval = new PreApproval(client);
        const pre = (await preapproval.get({id: subscriptionId})) as unknown as MercadoPagoPreapproval;
        bundleRefreshedNextBilling =
          pre?.next_payment_date ||
          pre?.auto_recurring?.next_payment_date ||
          null;
        bundleRefreshedAmount = typeof pre?.auto_recurring?.transaction_amount === "number" ?
          pre.auto_recurring.transaction_amount : null;
        bundleRefreshedCurrency = typeof pre?.auto_recurring?.currency_id === "string" ?
          pre.auto_recurring.currency_id : null;
      } catch (err) {
        functions.logger.warn("Failed to refresh preapproval on bundle renewal", {
          subscriptionId, error: String(err),
        });
      }
    }

    let bundleResult: Awaited<ReturnType<typeof assignBundleToUser>> | null = null;
    try {
      // Security (audit H-17): bundle grant + processed_payments finalization
      // run in a single runTransaction. Without this, a crash between the
      // grant and the processed_payments write enabled full retry, and two
      // concurrent renewal webhooks could both compute new expires_at off the
      // same stale snapshot.
      bundleResult = await db.runTransaction(async (tx) => {
        const r = await assignBundleToUser({
          userId,
          bundleId,
          accessDuration,
          paymentId: paymentId!,
          subscriptionId,
          isRenewal: isBundleRenewal,
          transaction: tx,
        });

        if (isSubscription && subscriptionId) {
          const subUpdate: Record<string, unknown> = {
            status: "authorized",
            last_payment_id: paymentId,
            last_payment_date:
              paymentData.date_approved || paymentData.date_created || new Date().toISOString(),
            transaction_amount: bundleRefreshedAmount ?? paymentData.transaction_amount ?? null,
            currency_id: bundleRefreshedCurrency ?? paymentData.currency_id ?? null,
            management_url:
              `https://www.mercadopago.com.co/subscriptions/management?preapproval_id=${subscriptionId}`,
            updated_at: FieldValue.serverTimestamp(),
          };
          if (bundleRefreshedNextBilling) {
            subUpdate.next_billing_date = bundleRefreshedNextBilling;
          }
          tx.set(
            db.collection("users").doc(userId)
              .collection("subscriptions").doc(subscriptionId),
            subUpdate,
            {merge: true}
          );
        }

        tx.set(processedRef, {
          processed_at: FieldValue.serverTimestamp(),
          status: "approved",
          userId,
          bundleId,
          courseIds: r.courseIdsGranted,
          isSubscription,
          isRenewal: isBundleRenewal,
          payment_type: paymentType,
          bundleTitle: r.bundleTitle,
          state: "completed",
          amount: paymentData.transaction_amount ?? null,
          currency_id: paymentData.currency_id ?? null,
        });
        return r;
      });
    } catch (bundleErr) {
      functions.logger.error("Bundle assignment failed", bundleErr);
      const errType = classifyError(bundleErr);
      if (errType === "RETRYABLE") {
        res.status(500).json({error: {code: "INTERNAL_ERROR", message: "Error asignando bundle"}});
        return;
      }
      await processedRef.set({
        processed_at: FieldValue.serverTimestamp(),
        status: "error", error_type: "bundle_assignment_failed",
      });
    }

    // Best-effort: bundle confirmation email + analytics. Pick the first
    // granted course as the deep-link target so the CTA lands on a real
    // program; falls back to /library when no courses were granted.
    if (bundleResult && bundleResult.courseIdsGranted.length > 0) {
      try {
        const recipient = pickRecipientEmail(userDoc.data() ?? null, null);
        const amount = bundleRefreshedAmount ?? paymentData.transaction_amount ?? null;
        const currency = bundleRefreshedCurrency ?? paymentData.currency_id ?? "COP";
        const firstCourseId = bundleResult.courseIdsGranted[0];
        if (recipient && amount && amount > 0) {
          if (isSubscription) {
            if (isBundleRenewal) {
              await sendChargeReceiptEmail({
                to: recipient,
                programTitle: bundleResult.bundleTitle,
                courseId: firstCourseId,
                amount,
                currencyId: currency,
                chargeDate: paymentData.date_approved || paymentData.date_created || new Date().toISOString(),
                nextBillingDate: bundleRefreshedNextBilling ?? null,
              });
            } else {
              await sendSubscriptionStartedEmail({
                to: recipient,
                programTitle: bundleResult.bundleTitle,
                courseId: firstCourseId,
                nextBillingDate: bundleRefreshedNextBilling ?? bundleResult.expiresAt,
                transactionAmount: amount,
                currencyId: currency,
              });
            }
          } else {
            await sendOneTimePurchaseEmail({
              to: recipient,
              programTitle: bundleResult.bundleTitle,
              courseId: firstCourseId,
              amount,
              currencyId: currency,
              accessUntil: bundleResult.expiresAt,
            });
          }
        }
      } catch (emailErr) {
        functions.logger.warn("Bundle email send failed (non-blocking)", {
          userId, bundleId, error: String(emailErr),
        });
      }

      try {
        analyticsCapture({
          distinctId: userId,
          event: "program.purchase_completed",
          properties: {
            bundle_id: bundleId,
            course_ids: bundleResult.courseIdsGranted,
            is_subscription: isSubscription,
            is_renewal: isBundleRenewal,
            access_duration: accessDuration,
            amount: bundleRefreshedAmount ?? paymentData.transaction_amount ?? null,
            currency: bundleRefreshedCurrency ?? paymentData.currency_id ?? null,
            payment_type: paymentType,
          },
        });
      } catch {/* best-effort */}
    }

    res.status(200).send("OK");
    return;
  }

  // ── Single-course branch ──
  const courseId = parsed.courseId!;
  const courseDoc = await db.collection("courses").doc(courseId).get();
  if (!courseDoc.exists) {
    await processedRef.set({
      processed_at: FieldValue.serverTimestamp(),
      status: "error", error_type: "course_not_found",
    });
    res.status(200).send("OK");
    return;
  }

  const userData = userDoc.data()!;
  const courseDetails = courseDoc.data()!;
  const courseTitle = courseDetails.title || "Untitled Course";
  // Simplified model: every subscription is monthly, every OTP is 1 year.
  // 1:1 programs are subscription-only so they land on monthly too.
  const courseAccessDuration = isSubscription ? "monthly" : "yearly";
  courseDetails.access_duration = courseAccessDuration;
  const userCourses = userData.courses ?? {};
  const existingCourseData = userCourses[courseId];
  const existingPurchase =
    existingCourseData?.status === "active" &&
    new Date(existingCourseData.expires_at) > new Date();
  const isRenewal = existingPurchase && isSubscription;

  // For subscriptions, MP's next_payment_date is the source of truth for when
  // access ends (= when the next charge happens). The subscription_preapproval
  // webhook stores it as next_billing_date on the local subscription doc. Read
  // it here and fall back to calculateExpirationDate for one-time payments,
  // when MP didn't return a date, or when the date fails sanity checks (must
  // be in the future, within ~13 months — guards against stale/garbled values).
  let subscriptionNextBilling: string | null = null;
  if (isSubscription && subscriptionId) {
    const subDoc = await db
      .collection("users").doc(userId)
      .collection("subscriptions").doc(subscriptionId)
      .get();
    const v = subDoc.data()?.next_billing_date;
    if (typeof v === "string" && v) {
      const parsed = new Date(v);
      const now = Date.now();
      const maxFuture = now + 400 * 24 * 60 * 60 * 1000; // ~13 months
      if (!isNaN(parsed.getTime()) && parsed.getTime() > now && parsed.getTime() < maxFuture) {
        subscriptionNextBilling = v;
      } else {
        functions.logger.warn("next_billing_date failed sanity check", {
          userId, courseId, subscriptionId, value: v,
        });
      }
    }
  }

  // ── Renewal ─��
  if (isRenewal) {
    // On a recurring charge, MP advances the preapproval's next_payment_date.
    // Refetch it now so (a) local next_billing_date reflects MP truth and
    // (b) expires_at extends to the actual next charge date rather than a
    // stale value. Without this refresh, subscriptionNextBilling (read from
    // the local doc above) is one cycle behind; the sanity check at L-1094
    // either falls back to calculateExpirationDate (best case) or, if MP's
    // old next_payment_date is still narrowly in the future, sets expires_at
    // to a date that lapses within hours — locking the user out despite paying.
    let refreshedNextBilling: string | null = null;
    let refreshedAmount: number | null = null;
    let refreshedCurrency: string | null = null;
    if (isSubscription && subscriptionId) {
      try {
        const client = getMPClient();
        const preapproval = new PreApproval(client);
        const pre = (await preapproval.get({id: subscriptionId})) as unknown as MercadoPagoPreapproval;
        refreshedNextBilling =
          pre?.next_payment_date ||
          pre?.auto_recurring?.next_payment_date ||
          null;
        refreshedAmount = typeof pre?.auto_recurring?.transaction_amount === "number" ?
          pre.auto_recurring.transaction_amount : null;
        refreshedCurrency = typeof pre?.auto_recurring?.currency_id === "string" ?
          pre.auto_recurring.currency_id : null;
      } catch (err) {
        functions.logger.warn("Failed to refresh preapproval on renewal", {
          subscriptionId, error: String(err),
        });
      }
    }

    const currentExpiration = existingCourseData?.expires_at ?? undefined;
    const expirationDate = refreshedNextBilling ??
      subscriptionNextBilling ??
      calculateExpirationDate(courseAccessDuration, currentExpiration);

    // Security (audit H-15 / H-16): wrap renewal grant + subscription update +
    // processed_payments finalization in a single transaction. The on-disk
    // expires_at compare lives in assignCourseToUser when run with a transaction.
    await db.runTransaction(async (tx) => {
      await assignCourseToUser(userId, courseId, courseDetails, expirationDate, {
        isRenewal: true,
        existingCourseData,
        transaction: tx,
      });

      if (isSubscription && subscriptionId) {
        const subUpdate: Record<string, unknown> = {
          status: "authorized",
          last_payment_id: paymentId,
          last_payment_date: paymentData.date_approved || paymentData.date_created || new Date().toISOString(),
          updated_at: FieldValue.serverTimestamp(),
        };
        if (refreshedNextBilling) subUpdate.next_billing_date = refreshedNextBilling;
        if (refreshedAmount !== null) subUpdate.transaction_amount = refreshedAmount;
        if (refreshedCurrency !== null) subUpdate.currency_id = refreshedCurrency;
        tx.set(
          db.collection("users").doc(userId).collection("subscriptions").doc(subscriptionId),
          subUpdate,
          {merge: true}
        );
      }

      tx.set(processedRef, {
        processed_at: FieldValue.serverTimestamp(),
        status: "approved", userId, courseId, isSubscription: true, isRenewal: true,
        payment_type: paymentType, courseTitle, state: "completed",
      });
    });

    // Best-effort: receipt email + analytics. Both run after the transaction
    // commits so a flaky email/PostHog cannot roll back the renewal grant.
    // Idempotency is enforced by processed_payments above — duplicate webhooks
    // never reach this point, so duplicate emails aren't a concern.
    try {
      const recipient = pickRecipientEmail(userData, null);
      const finalAmount = refreshedAmount ?? paymentData.transaction_amount ?? null;
      const finalCurrency = refreshedCurrency ?? paymentData.currency_id ?? "COP";
      if (recipient && finalAmount && finalAmount > 0) {
        await sendChargeReceiptEmail({
          to: recipient,
          programTitle: courseTitle,
          courseId,
          amount: finalAmount,
          currencyId: finalCurrency,
          chargeDate: paymentData.date_approved || paymentData.date_created || new Date().toISOString(),
          nextBillingDate: refreshedNextBilling ?? null,
        });
      }
    } catch (emailErr) {
      functions.logger.warn("Renewal email send failed (non-blocking)", {
        userId, courseId, error: String(emailErr),
      });
    }

    try {
      analyticsCapture({
        distinctId: userId,
        event: "program.purchase_completed",
        properties: {
          course_id: courseId,
          is_subscription: true,
          is_renewal: true,
          access_duration: courseAccessDuration,
          delivery_type: courseDetails?.deliveryType || null,
          amount: refreshedAmount ?? paymentData.transaction_amount ?? null,
          currency: refreshedCurrency ?? paymentData.currency_id ?? null,
          payment_type: paymentType,
        },
      });
    } catch {/* best-effort */}

    if (!isBundle) {
      await writeLedgerEntryBestEffort({
        id: `mp_${paymentId}`,
        provider: "mercadopago",
        type: "renewal",
        status: "paid",
        courseId,
        userId,
        userEmail: paymentData.payer?.email ?? null,
        subscriptionId: subscriptionId ?? null,
        externalPaymentId: paymentId,
        grossAmount: refreshedAmount ?? paymentData.transaction_amount ?? 0,
        currency: refreshedCurrency ?? paymentData.currency_id ?? "COP",
        providerFeeActual: sumMercadoPagoFee(paymentData.fee_details),
        chargedAt: paymentData.date_approved ?? paymentData.date_created ?? new Date().toISOString(),
        creatorId: (courseDetails.creator_id as string) ?? null,
        creatorName: (courseDetails.creatorName as string) ?? (courseDetails.creator_name as string) ?? null,
        courseTitle,
      });
    }

    res.status(200).send("OK");
    return;
  }

  // ── Already owned (one-time duplicate) ──
  if (existingPurchase && !isSubscription) {
    await processedRef.set({
      processed_at: FieldValue.serverTimestamp(),
      status: "already_owned", userId, courseId, state: "already_owned",
    });
    res.status(200).send("OK");
    return;
  }

  // ── New purchase ──
  const expirationDate = subscriptionNextBilling ??
    calculateExpirationDate(courseAccessDuration);

  await db.runTransaction(async (tx) => {
    await assignCourseToUser(userId, courseId, courseDetails, expirationDate, {
      transaction: tx,
    });

    if (isSubscription && subscriptionId) {
      tx.set(
        db.collection("users").doc(userId).collection("subscriptions").doc(subscriptionId),
        {
          status: "authorized",
          last_payment_id: paymentId,
          last_payment_date: paymentData.date_approved || paymentData.date_created || new Date().toISOString(),
          transaction_amount: paymentData.transaction_amount || null,
          currency_id: paymentData.currency_id || null,
          management_url: `https://www.mercadopago.com.co/subscriptions/management?preapproval_id=${subscriptionId}`,
          updated_at: FieldValue.serverTimestamp(),
        },
        {merge: true}
      );
    }

    tx.set(processedRef, {
      processed_at: FieldValue.serverTimestamp(),
      status: "approved", userId, courseId, isSubscription, isRenewal: false,
      payment_type: paymentType, courseTitle, state: "completed",
    }, {merge: true});
  });

  // Best-effort confirmation email. Subscription with a trial already
  // fired sendTrialActivatedEmail in the subscription_preapproval handler,
  // so don't double-send: only email here when free_trial_days isn't set
  // on the local sub doc (= no trial path).
  try {
    const recipient = pickRecipientEmail(userData, null);
    const amount = paymentData.transaction_amount || null;
    const currency = paymentData.currency_id || "COP";

    if (recipient && amount && amount > 0) {
      if (isSubscription && subscriptionId) {
        const subDoc = await db
          .collection("users").doc(userId)
          .collection("subscriptions").doc(subscriptionId)
          .get();
        const subFreeTrialDays = Number(subDoc.data()?.free_trial_days || 0);
        if (subFreeTrialDays === 0) {
          await sendSubscriptionStartedEmail({
            to: recipient,
            programTitle: courseTitle,
            courseId,
            nextBillingDate: subscriptionNextBilling || expirationDate,
            transactionAmount: amount,
            currencyId: currency,
          });
        }
      } else {
        await sendOneTimePurchaseEmail({
          to: recipient,
          programTitle: courseTitle,
          courseId,
          amount,
          currencyId: currency,
          accessUntil: expirationDate,
        });
      }
    }
  } catch (emailErr) {
    functions.logger.warn("Purchase email send failed (non-blocking)", {
      userId, courseId, error: String(emailErr),
    });
  }

  try {
    analyticsCapture({
      distinctId: userId,
      event: "program.purchase_completed",
      properties: {
        course_id: courseId,
        is_subscription: isSubscription,
        is_renewal: false,
        access_duration: courseAccessDuration,
        delivery_type: courseDetails?.deliveryType || null,
        amount: paymentData.transaction_amount || null,
        currency: paymentData.currency_id || null,
        payment_type: paymentType,
      },
    });
  } catch {
    // ignore — analytics is best-effort
  }

  if (!isBundle) {
    await writeLedgerEntryBestEffort({
      id: `mp_${paymentId}`,
      provider: "mercadopago",
      type: isSubscription ? "initial" : "one_time",
      status: "paid",
      courseId,
      userId,
      userEmail: paymentData.payer?.email ?? null,
      subscriptionId: isSubscription ? (subscriptionId ?? null) : null,
      externalPaymentId: paymentId,
      grossAmount: paymentData.transaction_amount ?? 0,
      currency: paymentData.currency_id ?? "COP",
      providerFeeActual: sumMercadoPagoFee(paymentData.fee_details),
      chargedAt: paymentData.date_approved ?? paymentData.date_created ?? new Date().toISOString(),
      creatorId: (courseDetails.creator_id as string) ?? null,
      creatorName: (courseDetails.creatorName as string) ?? (courseDetails.creator_name as string) ?? null,
      courseTitle,
    });
  }

  res.status(200).send("OK");
});

// ─── POST /payments/subscriptions/:subscriptionId/cancel ���─────────────────

router.post("/payments/subscriptions/:subscriptionId/cancel", async (req, res) => {
  const auth = await validateAuth(req);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const {subscriptionId} = req.params;
  const survey = req.body?.survey as Record<string, unknown> | undefined;

  const subscriptionRef = db
    .collection("users")
    .doc(auth.userId)
    .collection("subscriptions")
    .doc(subscriptionId);

  const subscriptionDoc = await subscriptionRef.get();
  if (!subscriptionDoc.exists) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Suscripción no encontrada");
  }

  const subscriptionData = subscriptionDoc.data() ?? {};

  const cancelResult = await cancelMpSubscription(auth.userId, subscriptionId);
  if (cancelResult === "failed") {
    throw new WakeApiServerError(
      "SERVICE_UNAVAILABLE", 503,
      "No pudimos cancelar la suscripción en este momento. Inténtalo de nuevo."
    );
  }
  // "already_cancelled": return success silently — desired end state holds.
  // Don't write a survey row for a redundant cancel.
  if (cancelResult === "already_cancelled") {
    res.json({data: {status: "cancelled"}});
    return;
  }

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

  // Best-effort cancellation email. Access remains until expires_at on the
  // course entry (= MP's last next_billing_date). If the sub was cancelled
  // before any non-trial charge fired, expires_at may be undefined — in
  // that case, skip the email rather than tell the user a wrong date.
  try {
    const courseIdForEmail =
      typeof subscriptionData.course_id === "string" ? subscriptionData.course_id : null;
    if (courseIdForEmail) {
      const userDoc = await db.collection("users").doc(auth.userId).get();
      const userData = userDoc.exists ? (userDoc.data() ?? null) : null;
      const courseEntry = (userData?.courses?.[courseIdForEmail] ?? null) as
        Record<string, unknown> | null;
      const accessUntil = typeof courseEntry?.expires_at === "string" ?
        (courseEntry.expires_at as string) : null;
      const recipient = pickRecipientEmail(
        userData,
        typeof subscriptionData.payer_email === "string" ? subscriptionData.payer_email : null,
      );
      const programTitle =
        (typeof courseEntry?.title === "string" ? (courseEntry.title as string) : null) ??
        (typeof subscriptionData.course_title === "string" ? subscriptionData.course_title : "tu programa");
      // Always send the cancellation email when we have a recipient — even
      // when accessUntil is missing (e.g. cancel during a botched-trial
      // before any non-trial charge fired). The template handles the null
      // case with softer copy so the buyer at least gets confirmation.
      if (recipient) {
        await sendCancellationEmail({
          to: recipient,
          programTitle,
          courseId: courseIdForEmail,
          accessUntil,
        });
      }
    }
  } catch (emailErr) {
    functions.logger.warn("Cancel email send failed (non-blocking)", {
      userId: auth.userId, subscriptionId, error: String(emailErr),
    });
  }

  res.json({data: {status: "cancelled"}});
});

// ─── POST /payments/subscriptions/:subscriptionId/cancel-survey ──────────────
// Records the pre-portal survey without cancelling. The MercadoPago portal
// performs the actual cancel; this endpoint captures intent + reasons only.

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

export default router;
