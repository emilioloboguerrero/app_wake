import { Router } from "express";
import type { Request } from "express";
import * as admin from "firebase-admin";
import * as crypto from "node:crypto";
import { MercadoPagoConfig, Preference, Payment, PreApproval } from "mercadopago";
import { validateAuth } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import { checkRateLimit } from "../middleware/rateLimit.js";
import { WakeApiServerError } from "../errors.js";

const router = Router();
const db = admin.firestore();

// ─── Helpers ──────────────────────────────────────────────────────────────

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const COURSE_ID_RE = /^[a-zA-Z0-9_-]{1,128}$/;
const REFERENCE_VERSION = "v1";
const REFERENCE_DELIMITER = "|";

type PaymentKind = "otp" | "sub";

interface ParsedReference {
  userId: string;
  courseId: string;
  paymentType: PaymentKind;
}

function getClient(): MercadoPagoConfig {
  const token = process.env.MERCADOPAGO_ACCESS_TOKEN;
  if (!token) {
    throw new WakeApiServerError(
      "SERVICE_UNAVAILABLE", 503,
      "Servicio de pagos no configurado"
    );
  }
  return new MercadoPagoConfig({ accessToken: token });
}

function buildExternalReference(
  userId: string,
  courseId: string,
  paymentType: PaymentKind
): string {
  return [REFERENCE_VERSION, userId, courseId, paymentType].join(REFERENCE_DELIMITER);
}

function parseExternalReference(reference: string): ParsedReference {
  const parts = reference.split(REFERENCE_DELIMITER);
  if (parts.length !== 4 || parts[0] !== REFERENCE_VERSION) {
    throw new Error(`Invalid external_reference: ${reference}`);
  }
  const [, userId, courseId, paymentTypeRaw] = parts;
  if (paymentTypeRaw !== "otp" && paymentTypeRaw !== "sub") {
    throw new Error(`Invalid payment type: ${paymentTypeRaw}`);
  }
  return { userId, courseId, paymentType: paymentTypeRaw };
}

function calculateExpirationDate(accessDuration: string, fromDate?: string): string {
  const durations: Record<string, number> = {
    monthly: 30, "3-month": 90, "6-month": 180, yearly: 365,
  };
  const days = durations[accessDuration] || 30;
  const now = new Date();
  let base = now;
  if (fromDate) {
    const parsed = new Date(fromDate);
    if (!isNaN(parsed.getTime()) && parsed > now) base = parsed;
  }
  return new Date(base.getTime() + days * 86400000).toISOString();
}

function classifyError(error: unknown): "RETRYABLE" | "NON_RETRYABLE" {
  if (!error || typeof error !== "object") return "RETRYABLE";
  const err = error as { code?: string; message?: string };
  if (err.code === "ECONNRESET" || err.code === "ETIMEDOUT" || err.code === "ENOTFOUND") return "RETRYABLE";
  if (err.code === "permission-denied" || err.code === "not-found") return "NON_RETRYABLE";
  if (err.message?.includes("not found") || err.message?.includes("invalid")) return "NON_RETRYABLE";
  return "RETRYABLE";
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
    data: snapshot.docs.map((d) => ({ id: d.id, ...d.data() })),
  });
});

// ─── POST /payments/preference ────────────────────────────────────────────

router.post("/payments/preference", async (req, res) => {
  const auth = await validateAuth(req);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const { courseId } = validateBody<{ courseId: string }>(
    { courseId: "string" },
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
  const externalReference = buildExternalReference(auth.userId, courseId, "otp");

  const client = getClient();
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
    },
  });

  res.json({ data: { init_point: result.init_point } });
});

// ─── POST /payments/subscription ──────────────────────────────────────────

router.post("/payments/subscription", async (req, res) => {
  const auth = await validateAuth(req);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const body = validateBody<{ courseId: string; payer_email: string }>(
    { courseId: "string", payer_email: "string" },
    req.body
  );

  if (!COURSE_ID_RE.test(body.courseId)) {
    throw new WakeApiServerError("VALIDATION_ERROR", 400, "courseId inválido", "courseId");
  }
  if (!EMAIL_RE.test(body.payer_email)) {
    throw new WakeApiServerError("VALIDATION_ERROR", 400, "Email de pago inválido", "payer_email");
  }

  const courseDoc = await db.collection("courses").doc(body.courseId).get();
  if (!courseDoc.exists) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Curso no encontrado");
  }

  const course = courseDoc.data()!;
  if (!course.price) {
    throw new WakeApiServerError("VALIDATION_ERROR", 400, "Precio del curso no encontrado");
  }

  const userDoc = await db.collection("users").doc(auth.userId).get();
  if (!userDoc.exists) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Usuario no encontrado");
  }

  const client = getClient();
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
          transaction_amount: course.price,
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
        error: { code: "CONFLICT", message: "Por favor ingresa tu correo de Mercado Pago" },
        requireAlternateEmail: true,
      });
      return;
    }
    throw error;
  }

  if (!result.init_point || !result.id) {
    throw new WakeApiServerError("INTERNAL_ERROR", 500, "No se pudo crear el enlace de pago");
  }

  // Fetch next billing date
  interface PreapprovalDetails {
    next_payment_date?: string | null;
    auto_recurring?: { next_payment_date?: string | null; start_date?: string | null };
  }
  let nextBillingDate: string | null = null;
  try {
    const details = await preapproval.get({ id: result.id }) as PreapprovalDetails;
    nextBillingDate =
      details?.next_payment_date ||
      details?.auto_recurring?.next_payment_date ||
      details?.auto_recurring?.start_date ||
      null;
  } catch { /* non-critical */ }

  if (!nextBillingDate) nextBillingDate = startDate.toISOString();

  // Store subscription record
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
      transaction_amount: course.price,
      currency_id: "COP",
      management_url: `https://www.mercadopago.com.co/subscriptions/management?preapproval_id=${result.id}`,
      next_billing_date: nextBillingDate,
      created_at: admin.firestore.FieldValue.serverTimestamp(),
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

  res.json({ data: { init_point: result.init_point, subscription_id: result.id } });
});

// ─── POST /payments/webhook ───────────────────────────────────────────────

router.post("/payments/webhook", async (req: Request, res) => {
  const webhookSecret = process.env.MERCADOPAGO_WEBHOOK_SECRET;
  if (!webhookSecret) {
    throw new WakeApiServerError("SERVICE_UNAVAILABLE", 503, "Webhook secret no configurado");
  }

  // Validate signature
  const signatureHeaderNew = req.get("x-signature");
  const signatureHeaderLegacy =
    req.get("x-hmac-signature") ||
    req.get("x-mercadopago-signature") ||
    req.get("x-hmac-signature-256");

  let signatureIsValid = false;

  if (signatureHeaderNew) {
    // New MP signature format: ts=...,v1=...
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
      const template = `id:${dataId};request-id:${requestId};ts:${ts};`;
      const expected = crypto.createHmac("sha256", webhookSecret).update(template).digest("hex");
      if (sig.length === expected.length) {
        try {
          signatureIsValid = crypto.timingSafeEqual(
            Buffer.from(sig, "utf8"),
            Buffer.from(expected, "utf8")
          );
        } catch { /* length mismatch */ }
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
      } catch { /* length mismatch */ }
    }
  }

  if (!signatureIsValid) {
    res.status(403).json({
      error: { code: "FORBIDDEN", message: "Firma de webhook inválida" },
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
      const client = getClient();
      const preapproval = new PreApproval(client);
      const preapprovalData = await preapproval.get({ id: preapprovalId }) as unknown as Record<string, unknown>;
      const externalReference = preapprovalData?.external_reference as string | undefined;
      if (!externalReference) {
        res.status(200).send("OK");
        return;
      }
      let parsed: ParsedReference;
      try { parsed = parseExternalReference(externalReference); }
      catch { res.status(200).send("OK"); return; }

      const autoRecurring = preapprovalData?.auto_recurring as Record<string, unknown> | undefined;
      const nextPaymentDate =
        (preapprovalData?.next_payment_date as string | null) ||
        (autoRecurring?.next_payment_date as string | null) ||
        null;

      const updateData: Record<string, unknown> = {
        status: (preapprovalData?.status as string) || "pending",
        transaction_amount: autoRecurring?.transaction_amount ?? null,
        currency_id: autoRecurring?.currency_id ?? null,
        reason: (preapprovalData?.reason as string | null) ?? null,
        management_url: `https://www.mercadopago.com.co/subscriptions/management?preapproval_id=${preapprovalId}`,
        next_billing_date: nextPaymentDate,
        updated_at: admin.firestore.FieldValue.serverTimestamp(),
        last_action: webhookAction,
      };

      const payerEmail =
        (preapprovalData?.payer_email as string | null) ??
        ((preapprovalData?.payer as Record<string, unknown> | undefined)?.email as string | null) ??
        null;
      if (payerEmail) updateData.payer_email = payerEmail;

      if (preapprovalData?.status === "cancelled") {
        updateData.cancelled_at = admin.firestore.FieldValue.serverTimestamp();
      }

      await db
        .collection("users")
        .doc(parsed.userId)
        .collection("subscriptions")
        .doc(preapprovalId)
        .set(updateData, { merge: true });
    } catch { /* log and continue */ }

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
      error: { code: "VALIDATION_ERROR", message: "Payment ID requerido" },
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let paymentData: any;

  try {
    if (webhookType === "subscription_authorized_payment") {
      const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN!;
      const resp = await fetch(
        `https://api.mercadopago.com/authorized_payments/${paymentId}`,
        { headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" } }
      );
      if (!resp.ok) throw new Error(`Fetch authorized payment failed: ${resp.status}`);
      paymentData = await resp.json();
      if (!paymentData.status) paymentData.status = paymentData.payment?.status || "approved";
      if (!paymentData.external_reference && paymentData.preapproval?.external_reference) {
        paymentData.external_reference = paymentData.preapproval.external_reference;
      }
      if (!paymentData.preapproval_id && paymentData.preapproval?.id) {
        paymentData.preapproval_id = paymentData.preapproval.id;
      }
    } else {
      const client = getClient();
      const payment = new Payment(client);
      paymentData = await payment.get({ id: paymentId }) || {};
    }
  } catch (apiError: unknown) {
    const errType = classifyError(apiError);
    if (errType === "RETRYABLE") {
      res.status(500).json({
        error: { code: "INTERNAL_ERROR", message: "Error obteniendo pago" },
      });
    } else {
      await processedRef.set({
        processed_at: admin.firestore.FieldValue.serverTimestamp(),
        status: "error",
        error_type: "payment_fetch_failed",
      });
      res.status(200).send("OK");
    }
    return;
  }

  // Not approved?
  if (!paymentData || paymentData.status !== "approved") {
    if (paymentData?.status === "pending" || paymentData?.status === "in_process") {
      res.status(200).send("OK");
      return;
    }
    await processedRef.set({
      processed_at: admin.firestore.FieldValue.serverTimestamp(),
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
      processed_at: admin.firestore.FieldValue.serverTimestamp(),
      status: "processing",
      payment_id: paymentId,
    }, { merge: true });
    return false;
  });

  if (alreadyProcessed) {
    res.status(200).send("OK");
    return;
  }

  const externalReference = paymentData.external_reference;
  if (!externalReference) {
    await processedRef.set({
      processed_at: admin.firestore.FieldValue.serverTimestamp(),
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
      processed_at: admin.firestore.FieldValue.serverTimestamp(),
      status: "error",
      error_type: "invalid_external_reference",
    });
    res.status(200).send("OK");
    return;
  }

  const { userId, courseId, paymentType } = parsed;
  const isSubscription = paymentType === "sub";

  // Validate user and course exist
  const userDoc = await db.collection("users").doc(userId).get();
  if (!userDoc.exists) {
    await processedRef.set({
      processed_at: admin.firestore.FieldValue.serverTimestamp(),
      status: "error", error_type: "user_not_found",
    });
    res.status(200).send("OK");
    return;
  }

  const courseDoc = await db.collection("courses").doc(courseId).get();
  if (!courseDoc.exists) {
    await processedRef.set({
      processed_at: admin.firestore.FieldValue.serverTimestamp(),
      status: "error", error_type: "course_not_found",
    });
    res.status(200).send("OK");
    return;
  }

  const userData = userDoc.data()!;
  const courseDetails = courseDoc.data()!;
  const courseTitle = courseDetails.title || "Untitled Course";
  const courseAccessDuration = courseDetails.access_duration;
  const userCourses = userData.courses ?? {};
  const existingCourseData = userCourses[courseId];
  const existingPurchase =
    existingCourseData?.status === "active" &&
    new Date(existingCourseData.expires_at) > new Date();
  const isRenewal = existingPurchase && isSubscription;

  const subscriptionId = paymentData.subscription_id || paymentData.preapproval_id || null;

  if (isRenewal) {
    // Subscription renewal — extend expiration
    const currentExpiration = existingCourseData?.expires_at ?? undefined;
    const expirationDate = calculateExpirationDate(courseAccessDuration, currentExpiration);

    await db.collection("users").doc(userId).update({
      [`courses.${courseId}`]: {
        access_duration: existingCourseData.access_duration ?? courseAccessDuration,
        expires_at: expirationDate,
        status: "active",
        purchased_at: existingCourseData.purchased_at ?? new Date().toISOString(),
        deliveryType: existingCourseData.deliveryType ?? courseDetails.deliveryType ?? "low_ticket",
        title: existingCourseData.title ?? courseTitle,
        image_url: existingCourseData.image_url ?? courseDetails.image_url ?? null,
        discipline: existingCourseData.discipline ?? courseDetails.discipline ?? "General",
        creatorName: existingCourseData.creatorName ?? courseDetails.creatorName ?? courseDetails.creator_name ?? "Unknown Creator",
        completedTutorials: existingCourseData.completedTutorials ?? {
          dailyWorkout: [], warmup: [], workoutExecution: [], workoutCompletion: [],
        },
      },
    });

    if (isSubscription && subscriptionId) {
      await db.collection("users").doc(userId).collection("subscriptions").doc(subscriptionId).set({
        status: "authorized",
        last_payment_id: paymentId,
        last_payment_date: paymentData.date_approved || paymentData.date_created || new Date().toISOString(),
        updated_at: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
    }

    await processedRef.set({
      processed_at: admin.firestore.FieldValue.serverTimestamp(),
      status: "approved", userId, courseId, isSubscription: true, isRenewal: true,
      payment_type: paymentType, courseTitle, state: "completed",
    });

    res.status(200).send("OK");
    return;
  }

  if (existingPurchase && !isSubscription) {
    await processedRef.set({
      processed_at: admin.firestore.FieldValue.serverTimestamp(),
      status: "already_owned", userId, courseId, state: "already_owned",
    });
    res.status(200).send("OK");
    return;
  }

  // New purchase
  if (!courseAccessDuration) {
    await processedRef.set({
      processed_at: admin.firestore.FieldValue.serverTimestamp(),
      status: "error", error_type: "missing_access_duration",
    });
    res.status(200).send("OK");
    return;
  }

  const expirationDate = calculateExpirationDate(courseAccessDuration);

  await db.runTransaction(async (tx) => {
    const userRef = db.collection("users").doc(userId);
    const freshUserDoc = await tx.get(userRef);
    if (!freshUserDoc.exists) throw new Error("User not found");

    const freshData = freshUserDoc.data()!;
    const courses = freshData.courses ?? {};

    if (courses[courseId]?.status === "active" && new Date(courses[courseId].expires_at) > new Date()) {
      return; // Already assigned
    }

    courses[courseId] = {
      access_duration: courseAccessDuration,
      expires_at: expirationDate,
      status: "active",
      purchased_at: new Date().toISOString(),
      deliveryType: courseDetails.deliveryType ?? "low_ticket",
      title: courseTitle,
      image_url: courseDetails.image_url || null,
      discipline: courseDetails.discipline || "General",
      creatorName: courseDetails.creatorName || courseDetails.creator_name || "Unknown Creator",
      completedTutorials: { dailyWorkout: [], warmup: [], workoutExecution: [], workoutCompletion: [] },
    };

    tx.update(userRef, {
      courses,
      purchased_courses: [...new Set([...(freshData.purchased_courses || []), courseId])],
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
          updated_at: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    }

    tx.set(processedRef, {
      processed_at: admin.firestore.FieldValue.serverTimestamp(),
      status: "approved", userId, courseId, isSubscription, isRenewal: false,
      payment_type: paymentType, courseTitle, state: "completed",
    }, { merge: true });
  });

  res.status(200).send("OK");
});

// ─── POST /payments/subscriptions/:subscriptionId/cancel ──────────────────

router.post("/payments/subscriptions/:subscriptionId/cancel", async (req, res) => {
  const auth = await validateAuth(req);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const { subscriptionId } = req.params;
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

  // Cancel in MercadoPago
  const client = getClient();
  const preapproval = new PreApproval(client);
  await preapproval.update({ id: subscriptionId, body: { status: "cancelled" } });

  // Update Firestore
  await subscriptionRef.set({
    status: "cancelled",
    last_action: "cancel",
    cancelled_at: admin.firestore.FieldValue.serverTimestamp(),
    updated_at: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });

  // Record cancellation feedback if provided
  if (survey?.answers) {
    try {
      const surveyRecord: Record<string, unknown> = {
        userId: auth.userId,
        subscriptionId,
        answers: survey.answers,
        source: (survey.source as string) ?? "in_app_cancel_flow_v1",
        statusAfter: "cancelled",
        submittedAt: admin.firestore.FieldValue.serverTimestamp(),
      };

      const courseId =
        (survey.courseId as string | undefined) ??
        subscriptionData.course_id;
      if (courseId) surveyRecord.courseId = courseId;

      const courseTitle =
        (survey.courseTitle as string | undefined) ??
        subscriptionData.course_title;
      if (courseTitle) surveyRecord.courseTitle = courseTitle;

      const statusBefore =
        (survey.subscriptionStatusBefore as string | undefined) ??
        subscriptionData.status;
      if (statusBefore) surveyRecord.statusBefore = statusBefore;

      const payerEmail = subscriptionData.payer_email ?? (survey.payerEmail as string | undefined);
      if (payerEmail) surveyRecord.payerEmail = payerEmail;

      await db.collection("subscription_cancellation_feedback").add(surveyRecord);
    } catch { /* non-critical */ }
  }

  res.json({ data: { status: "cancelled" } });
});

export default router;
