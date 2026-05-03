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
import {assignBundleToUser, revokeBundleAccess} from "../services/bundleAssignment.js";
import {cancelMpSubscription, getActiveOneOnOneLock} from "../services/enrollmentLeave.js";

const router = Router();

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
      back_urls: (() => {
        const base = resolveAppBaseUrl(req);
        return {
          success: `${base}/app/payment/success?courseId=${courseId}`,
          failure: `${base}/app/payment/cancelled?courseId=${courseId}`,
          pending: `${base}/app/payment/cancelled?courseId=${courseId}`,
        };
      })(),
      auto_return: "approved",
    },
  });

  res.json({data: {init_point: result.init_point}});
});

// ─── POST /payments/subscription ──────────���───────────────────────────────

router.post("/payments/subscription", async (req, res) => {
  const auth = await validateAuth(req);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const body = validateBody<{ courseId: string; payer_email: string }>(
    {courseId: "string", payer_email: "string"},
    req.body
  );

  if (!COURSE_ID_RE.test(body.courseId)) {
    throw new WakeApiServerError("VALIDATION_ERROR", 400, "courseId inv��lido", "courseId");
  }
  if (!EMAIL_RE.test(body.payer_email)) {
    throw new WakeApiServerError("VALIDATION_ERROR", 400, "Email de pago inválido", "payer_email");
  }

  const courseDoc = await db.collection("courses").doc(body.courseId).get();
  if (!courseDoc.exists) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Curso no encontrado");
  }

  const course = courseDoc.data()!;

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

  const userDoc = await db.collection("users").doc(auth.userId).get();
  if (!userDoc.exists) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Usuario no encontrado");
  }

  const client = getMPClient();
  const preapproval = new PreApproval(client);
  const startDate = new Date(Date.now() + 5 * 60 * 1000);
  const externalRef = buildExternalReference(auth.userId, body.courseId, "sub");

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
        },
        status: "pending",
        back_url: "https://www.mercadopago.com.co/subscriptions",
      },
    });
  } catch (error: unknown) {
    const msg = (error instanceof Error ? error.message : String(error)).toLowerCase();
    const needsAltEmail =
      msg.includes("cannot operate between different") ||
      msg.includes("payer_email") ||
      msg.includes("belongs to another user") ||
      msg.includes("must belong to this site");

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
      course_id: body.courseId,
      course_title: course.title || "Subscription",
      status: "pending",
      payer_email: body.payer_email,
      transaction_amount: monthlyPrice,
      access_duration: "monthly",
      currency_id: "COP",
      management_url: `https://www.mercadopago.com.co/subscriptions/management?preapproval_id=${result.id}`,
      next_billing_date: nextBillingDate,
      created_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp(),
    }, {merge: true});

  res.json({data: {init_point: result.init_point, subscription_id: result.id}});
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
      back_urls: (() => {
        const base = resolveAppBaseUrl(req);
        return {
          success: `${base}/app/payment/success?bundleId=${body.bundleId}`,
          failure: `${base}/app/payment/cancelled?bundleId=${body.bundleId}`,
          pending: `${base}/app/payment/cancelled?bundleId=${body.bundleId}`,
        };
      })(),
      auto_return: "approved",
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
  }>({
    bundleId: "string",
    payer_email: "string",
  }, req.body);

  if (!COURSE_ID_RE.test(body.bundleId)) {
    throw new WakeApiServerError("VALIDATION_ERROR", 400, "bundleId inválido", "bundleId");
  }
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
        back_url: "https://www.mercadopago.com.co/subscriptions",
      },
    });
  } catch (error: unknown) {
    const msg = (error instanceof Error ? error.message : String(error)).toLowerCase();
    const needsAltEmail =
      msg.includes("cannot operate between different") ||
      msg.includes("payer_email") ||
      msg.includes("belongs to another user") ||
      msg.includes("must belong to this site");

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

  res.json({data: {init_point: result.init_point, subscription_id: result.id}});
});

// ─── POST /payments/webhook ────────────────────────────────────────────────

router.post("/payments/webhook", async (req: Request, res) => {
  const webhookSecret = process.env.MERCADOPAGO_WEBHOOK_SECRET;
  if (!webhookSecret) {
    throw new WakeApiServerError("SERVICE_UNAVAILABLE", 503, "Webhook secret no configurado");
  }

  // ── Validate signature ──
  const signatureHeaderNew = req.get("x-signature");
  const signatureHeaderLegacy =
    req.get("x-hmac-signature") ||
    req.get("x-mercadopago-signature") ||
    req.get("x-hmac-signature-256");

  let signatureIsValid = false;

  if (signatureHeaderNew) {
    const parsed: Record<string, string> = {};
    for (const part of signatureHeaderNew.split(",")) {
      const [key, value] = part.split("=");
      if (key && value) parsed[key.trim()] = value.trim();
    }
    const ts = parsed["ts"];
    const sig = parsed["v1"];
    const requestId = req.get("x-request-id") ?? "";
    const dataId = req.body?.data?.id;

    if (ts && sig && requestId && dataId) {
      const tsMs = Number(ts) * 1000;
      if (isNaN(tsMs) || Math.abs(Date.now() - tsMs) > 300_000) {
        res.status(403).json({
          error: {code: "FORBIDDEN", message: "Webhook timestamp expirado"},
        });
        return;
      }

      const template = `id:${dataId};request-id:${requestId};ts:${ts};`;
      const expected = crypto.createHmac("sha256", webhookSecret).update(template).digest("hex");
      if (sig.length === expected.length) {
        try {
          signatureIsValid = crypto.timingSafeEqual(
            Buffer.from(sig, "utf8"),
            Buffer.from(expected, "utf8")
          );
        } catch {/* length mismatch */}
      }
    }
  } else if (signatureHeaderLegacy) {
    const rawBodyValue = (req as Request & { rawBody?: unknown }).rawBody;
    let rawBodyBuffer: Buffer;
    if (Buffer.isBuffer(rawBodyValue)) {
      rawBodyBuffer = rawBodyValue;
    } else if (typeof rawBodyValue === "string") {
      rawBodyBuffer = Buffer.from(rawBodyValue);
    } else {
      rawBodyBuffer = Buffer.from(JSON.stringify(req.body ?? {}));
    }

    const expected = crypto.createHmac("sha256", webhookSecret).update(rawBodyBuffer).digest("hex");
    if (signatureHeaderLegacy.length === expected.length) {
      try {
        signatureIsValid = crypto.timingSafeEqual(
          Buffer.from(signatureHeaderLegacy, "utf8"),
          Buffer.from(expected, "utf8")
        );
      } catch {/* length mismatch */}
    }
  }

  if (!signatureIsValid) {
    res.status(403).json({
      error: {code: "FORBIDDEN", message: "Firma de webhook inválida"},
    });
    return;
  }

  const webhookType = req.body?.type;
  const webhookAction = req.body?.action;

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
      const existingSub = await subRef.get();
      if (!existingSub.exists) {
        functions.logger.warn("Skipping preapproval for unknown subscription", {
          preapprovalId, userId: parsed.userId,
        });
        res.status(200).send("OK");
        return;
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

      await subRef.set(updateData, {merge: true});
    } catch (err) {
      functions.logger.error("Error processing subscription_preapproval webhook", err);
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

  // Idempotency check for updated events
  if (webhookAction === "payment.updated" || webhookAction === "updated") {
    const processedDoc = await processedRef.get();
    if (processedDoc.exists) {
      const prevStatus = processedDoc.data()?.status;
      if (prevStatus === "approved") {
        res.status(200).send("OK");
        return;
      }
      if (prevStatus !== "pending" && prevStatus !== "in_process" && prevStatus !== "processing") {
        res.status(200).send("OK");
        return;
      }
    }
  }

  // Fetch payment from MercadoPago
  interface MercadoPagoPaymentData {
    status?: string;
    external_reference?: string;
    subscription_id?: string;
    preapproval_id?: string;
    date_approved?: string;
    date_created?: string;
    transaction_amount?: number;
    currency_id?: string;
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

  // Refund or chargeback — revoke access
  if (paymentData && (paymentData.status === "refunded" || paymentData.status === "charged_back")) {
    try {
      const prev = await processedRef.get();
      const prevData = prev.exists ? prev.data()! : null;
      if (prevData?.bundleId && prevData?.userId) {
        const revoked = await revokeBundleAccess(prevData.userId as string, prevData.bundleId as string);
        functions.logger.info("Bundle access revoked via refund", {
          paymentId, bundleId: prevData.bundleId, revoked,
        });
      } else if (prevData?.courseId && prevData?.userId) {
        await db.collection("users").doc(prevData.userId as string).update({
          [`courses.${prevData.courseId}.status`]: "cancelled",
          [`courses.${prevData.courseId}.cancelled_at`]: new Date().toISOString(),
          updated_at: FieldValue.serverTimestamp(),
        });
      }
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

    try {
      // Security (audit H-17): bundle grant + processed_payments finalization
      // run in a single runTransaction. Without this, a crash between the
      // grant and the processed_payments write enabled full retry, and two
      // concurrent renewal webhooks could both compute new expires_at off the
      // same stale snapshot.
      const result = await db.runTransaction(async (tx) => {
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
          tx.set(
            db.collection("users").doc(userId)
              .collection("subscriptions").doc(subscriptionId),
            {
              status: "authorized",
              last_payment_id: paymentId,
              last_payment_date:
                paymentData.date_approved || paymentData.date_created || new Date().toISOString(),
              transaction_amount: paymentData.transaction_amount || null,
              currency_id: paymentData.currency_id || null,
              management_url:
                `https://www.mercadopago.com.co/subscriptions/management?preapproval_id=${subscriptionId}`,
              updated_at: FieldValue.serverTimestamp(),
            },
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
      void result;
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

  // ── Renewal ─��
  if (isRenewal) {
    const currentExpiration = existingCourseData?.expires_at ?? undefined;
    const expirationDate = calculateExpirationDate(courseAccessDuration, currentExpiration);

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
        tx.set(
          db.collection("users").doc(userId).collection("subscriptions").doc(subscriptionId),
          {
            status: "authorized",
            last_payment_id: paymentId,
            last_payment_date: paymentData.date_approved || paymentData.date_created || new Date().toISOString(),
            updated_at: FieldValue.serverTimestamp(),
          },
          {merge: true}
        );
      }

      tx.set(processedRef, {
        processed_at: FieldValue.serverTimestamp(),
        status: "approved", userId, courseId, isSubscription: true, isRenewal: true,
        payment_type: paymentType, courseTitle, state: "completed",
      });
    });

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
  const expirationDate = calculateExpirationDate(courseAccessDuration);

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

  if (survey?.answers) {
    try {
      const answers = survey.answers;
      if (!Array.isArray(answers) || answers.length > 20) {
        throw new Error("Invalid survey answers");
      }
      for (const answer of answers) {
        if (typeof answer === "string" && answer.length > 500) {
          throw new Error("Survey answer too long");
        }
      }

      const surveyRecord: Record<string, unknown> = {
        userId: auth.userId,
        subscriptionId,
        answers,
        source: (survey.source as string) ?? "in_app_cancel_flow_v1",
        statusAfter: "cancelled",
        submittedAt: FieldValue.serverTimestamp(),
      };

      const courseId = (survey.courseId as string | undefined) ?? subscriptionData.course_id;
      if (courseId) surveyRecord.courseId = courseId;

      const courseTitle = (survey.courseTitle as string | undefined) ?? subscriptionData.course_title;
      if (courseTitle) surveyRecord.courseTitle = courseTitle;

      const statusBefore = (survey.subscriptionStatusBefore as string | undefined) ?? subscriptionData.status;
      if (statusBefore) surveyRecord.statusBefore = statusBefore;

      const payerEmail = subscriptionData.payer_email ?? (survey.payerEmail as string | undefined);
      if (payerEmail) surveyRecord.payerEmail = payerEmail;

      await db.collection("subscription_cancellation_feedback").add(surveyRecord);
    } catch {/* non-critical */}
  }

  res.json({data: {status: "cancelled"}});
});

export default router;
