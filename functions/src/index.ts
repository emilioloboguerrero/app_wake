/**
 * Firebase Cloud Functions v1
 */

import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import * as crypto from "node:crypto";
import type {Request, Response} from "express";
import {MercadoPagoConfig, Preference, Payment, PreApproval} from "mercadopago";
import {Resend} from "resend";

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

const mercadopagoWebhookSecret = functions.params.defineSecret(
  "MERCADOPAGO_WEBHOOK_SECRET"
);

const mercadopagoAccessToken = functions.params.defineSecret(
  "MERCADOPAGO_ACCESS_TOKEN"
);

const fatSecretClientId = functions.params.defineSecret(
  "FATSECRET_CLIENT_ID"
);
const fatSecretClientSecret = functions.params.defineSecret(
  "FATSECRET_CLIENT_SECRET"
);
const resendApiKey = functions.params.defineSecret("RESEND_API_KEY");

// ─── Rate limiting (in-memory, per-userId, sliding 60s window, max 10 req) ──
const gen1RateStore = new Map<string, {count: number; resetAt: number}>();

function checkGen1RateLimit(key: string, maxPerMinute = 10): void {
  const now = Date.now();
  const entry = gen1RateStore.get(key);
  if (!entry || now >= entry.resetAt) {
    gen1RateStore.set(key, {count: 1, resetAt: now + 60_000});
    return;
  }
  entry.count++;
  if (entry.count > maxPerMinute) {
    const err = new Error("Too many requests") as Error & {statusCode: number};
    err.statusCode = 429;
    throw err;
  }
}

function isGen1RateLimitError(err: unknown): boolean {
  return err instanceof Error && (err as Error & {statusCode?: number}).statusCode === 429;
}

// ─── Input validation helpers ────────────────────────────────────────────────
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const BARCODE_RE = /^\d{8,14}$/;
const COURSE_ID_RE = /^[a-zA-Z0-9_-]{1,128}$/;

function isValidEmail(v: unknown): v is string {
  return typeof v === "string" && EMAIL_RE.test(v);
}

function isValidCourseId(v: unknown): v is string {
  return typeof v === "string" && COURSE_ID_RE.test(v);
}

function isValidBarcode(v: unknown): v is string {
  return typeof v === "string" && BARCODE_RE.test(v);
}

// ─── Gen1 auth helper ────────────────────────────────────────────────────────
async function verifyGen1Auth(request: Request): Promise<string | null> {
  const header = request.headers?.authorization;
  if (!header || typeof header !== "string" || !header.startsWith("Bearer ")) return null;
  try {
    const decoded = await admin.auth().verifyIdToken(header.slice(7));
    return decoded.uid;
  } catch {
    return null;
  }
}

function sendAuthError(res: Response): void {
  res.status(401).json({
    error: {code: "UNAUTHENTICATED", message: "Token de autenticación requerido"},
  });
}

function sendRateLimitError(res: Response): void {
  res.status(429).json({
    error: {
      code: "RATE_LIMITED",
      message: "Demasiadas solicitudes. Intenta en un momento.",
    },
  });
}

// Simple Mercado Pago client
const getClient = () => {
  const token = mercadopagoAccessToken.value();

  if (!token) {
    throw new Error(
      "Mercado Pago access token missing; configure MERCADOPAGO_ACCESS_TOKEN secret"
    );
  }

  return new MercadoPagoConfig({accessToken: token});
};

type PaymentKind = "otp" | "sub";

interface ParsedReference {
  version: string;
  userId: string;
  courseId: string;
  paymentType: PaymentKind;
  raw: string;
}

interface MercadoPagoPreapproval {
  external_reference?: string | null;
  next_payment_date?: string | null;
  auto_recurring?: {
    next_payment_date?: string | null;
    start_date?: string | null;
    transaction_amount?: number | null;
    currency_id?: string | null;
  };
  reason?: string | null;
  status?: string | null;
  payer_email?: string | null;
  payer?: {
    email?: string | null;
  };
}

const REFERENCE_VERSION = "v1";
const REFERENCE_DELIMITER = "|";
const REFERENCE_MAX_LENGTH = 256;

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  try {
    return JSON.stringify(error);
  } catch (stringifyError) {
    functions.logger.error("Failed to stringify error", stringifyError);
    return "Unknown error";
  }
}

function buildExternalReference(
  userId: string,
  courseId: string,
  paymentType: PaymentKind
): string {
  if (!userId || !courseId) {
    throw new Error("Missing userId or courseId for external reference");
  }

  if (userId.includes(REFERENCE_DELIMITER) || courseId.includes(REFERENCE_DELIMITER)) {
    throw new Error("Identifiers cannot contain the reference delimiter '|'");
  }

  const reference = [REFERENCE_VERSION, userId, courseId, paymentType].join(REFERENCE_DELIMITER);

  if (reference.length > REFERENCE_MAX_LENGTH) {
    throw new Error("external_reference exceeds Mercado Pago length limit");
  }

  return reference;
}

function parseExternalReference(reference: string): ParsedReference {
  if (!reference) {
    throw new Error("external_reference is empty");
  }

  const parts = reference.split(REFERENCE_DELIMITER);

  if (parts.length !== 4) {
    throw new Error(`Unexpected external_reference format: ${reference}`);
  }

  const [version, userId, courseId, paymentTypeRaw] = parts;

  if (version !== REFERENCE_VERSION) {
    throw new Error(`Unsupported external_reference version: ${version}`);
  }

  if (!userId || !courseId) {
    throw new Error("external_reference missing userId or courseId");
  }

  if (paymentTypeRaw !== "otp" && paymentTypeRaw !== "sub") {
    throw new Error(`Unsupported payment type in external_reference: ${paymentTypeRaw}`);
  }

  const paymentType = paymentTypeRaw as PaymentKind;

  return {
    version,
    userId,
    courseId,
    paymentType,
    raw: reference,
  };
}


// Helper: Calculate expiration date from access duration (same as app)
function calculateExpirationDate(
  accessDuration: string,
  options: {from?: Date | string} = {}
): string {
  const durations: {[key: string]: number} = {
    "monthly": 30,
    "3-month": 90,
    "6-month": 180,
    "yearly": 365,
  };

  const days = durations[accessDuration] || 30; // Default to 30 days
  const now = new Date();
  let base = options.from ? new Date(options.from) : now;

  if (Number.isNaN(base.getTime()) || base < now) {
    base = now;
  }

  const expirationDate = new Date(
    base.getTime() + (days * 24 * 60 * 60 * 1000)
  );

  return expirationDate.toISOString();
}

// Helper: Check if user already owns course (same as app)
async function checkUserOwnsCourse(
  userId: string,
  courseId: string
): Promise<boolean> {
  try {
    const userDoc = await db.collection("users").doc(userId).get();

    if (!userDoc.exists) {
      return false;
    }

    const userData = userDoc.data();
    const userCourses = userData?.courses || {};
    const courseData = userCourses[courseId];

    if (!courseData) {
      return false;
    }

    // Check: active status and not expired
    const isActive = courseData.status === "active";
    const isNotExpired = new Date(courseData.expires_at) > new Date();

    return isActive && isNotExpired;
  } catch (error) {
    functions.logger.error("Error checking course ownership:", error);
    return false;
  }
}

// Helper: Classify errors for proper handling
function classifyError(error: unknown): "RETRYABLE" | "NON_RETRYABLE" {
  if (!error || typeof error !== "object") {
    return "RETRYABLE";
  }

  const err = error as {code?: string; message?: string};

  // Network errors
  if (
    err.code === "ECONNRESET" ||
    err.code === "ETIMEDOUT" ||
    err.code === "ENOTFOUND" ||
    err.message?.includes("network") ||
    err.message?.includes("timeout")
  ) {
    return "RETRYABLE";
  }

  // Validation errors
  if (
    err.message?.includes("not found") ||
    err.message?.includes("missing") ||
    err.message?.includes("invalid") ||
    err.message?.includes("required")
  ) {
    return "NON_RETRYABLE";
  }

  // Firestore errors
  if (err.code === "permission-denied" || err.code === "not-found") {
    return "NON_RETRYABLE";
  }

  // Default to retryable for unknown errors
  return "RETRYABLE";
}

// Create unique payment preference
export const createPaymentPreference = functions
  .runWith({secrets: [mercadopagoAccessToken]})
  .https.onRequest(async (request, response) => {
    response.set("Access-Control-Allow-Origin", "*");
    response.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    response.set("Access-Control-Allow-Headers", "Content-Type, Authorization");

    if (request.method === "OPTIONS") {
      response.status(204).send("");
      return;
    }

    const userId = await verifyGen1Auth(request);
    if (!userId) {
      response.status(401).json({error: {code: "UNAUTHENTICATED", message: "Autenticación requerida"}});
      return;
    }

    try {
      checkGen1RateLimit(`createPaymentPreference_${userId}`);

      const {courseId} = request.body || {};
      if (!courseId || !COURSE_ID_RE.test(courseId)) {
        response.status(400).json({error: {code: "VALIDATION_ERROR", message: "courseId inválido", field: "courseId"}});
        return;
      }

      const courseDoc = await db.collection("courses").doc(courseId).get();
      const course = courseDoc.data();

      if (!course) {
        response.status(404).json({error: {code: "NOT_FOUND", message: "Course not found"}});
        return;
      }

      const externalReference = buildExternalReference(userId, courseId, "otp");

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

      functions.logger.info("Payment preference created", {
        userId,
        courseId,
        externalReference,
      });

      response.json({data: {init_point: result.init_point}});
    } catch (error: unknown) {
      if (isGen1RateLimitError(error)) {
        response.status(429).json({error: {code: "RATE_LIMITED", message: "Too many requests"}});
        return;
      }
      functions.logger.error("createPaymentPreference error", error);
      response.status(500).json({error: {code: "INTERNAL_ERROR", message: "Error al crear la preferencia de pago"}});
    }
  });

// Create subscription dynamically (without pre-created plan)
export const createSubscriptionCheckout = functions
  .runWith({secrets: [mercadopagoAccessToken]})
  .https.onRequest(async (request, response) => {
    response.set("Access-Control-Allow-Origin", "*");
    response.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    response.set("Access-Control-Allow-Headers", "Content-Type, Authorization");

    if (request.method === "OPTIONS") {
      response.status(204).send("");
      return;
    }

    const userId = await verifyGen1Auth(request);
    if (!userId) {
      response.status(401).json({error: {code: "UNAUTHENTICATED", message: "Autenticación requerida"}});
      return;
    }

    try {
      checkGen1RateLimit(`createSubscriptionCheckout_${userId}`);

      const {courseId, payer_email: payerEmail} = request.body || {};

      if (!courseId || !COURSE_ID_RE.test(courseId)) {
        response.status(400).json({error: {code: "VALIDATION_ERROR", message: "courseId inválido", field: "courseId"}});
        return;
      }

      if (!payerEmail || !EMAIL_RE.test(payerEmail)) {
        response.status(400).json({error: {code: "VALIDATION_ERROR", message: "Formato de email inválido", field: "payer_email"}});
        return;
      }

      const courseDoc = await db.collection("courses").doc(courseId).get();
      const course = courseDoc.data();

      if (!course) {
        response.status(404).json({error: {code: "NOT_FOUND", message: "Course not found"}});
        return;
      }

      if (!course.price) {
        response.status(400).json({error: {code: "VALIDATION_ERROR", message: "Course price not found"}});
        return;
      }

      const userDoc = await db.collection("users").doc(userId).get();
      const user = userDoc.data();

      if (!user) {
        response.status(404).json({error: {code: "NOT_FOUND", message: "User not found"}});
        return;
      }

      const client = getClient();
      const preapproval = new PreApproval(client);

      const startDate = new Date(Date.now() + 5 * 60 * 1000);

      const externalRef = buildExternalReference(userId, courseId, "sub");

      const result = await preapproval.create({
        body: {
          payer_email: payerEmail,
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

      if (result.init_point && result.id) {
        functions.logger.info(
          "Subscription created dynamically with init_point:",
          result.init_point
        );
        functions.logger.info("Subscription ID (preapproval_id):", result.id);
        functions.logger.info("External reference:", externalRef);

        let nextBillingDate: string | null = null;

        try {
          const preapprovalDetails =
            await preapproval.get({id: result.id}) as MercadoPagoPreapproval;
          nextBillingDate =
            preapprovalDetails?.next_payment_date ||
            preapprovalDetails?.auto_recurring?.next_payment_date ||
            preapprovalDetails?.auto_recurring?.start_date ||
            null;
        } catch (detailsError) {
          functions.logger.warn(
            "Failed to fetch preapproval details for next billing date",
            detailsError
          );
        }

        if (!nextBillingDate) {
          nextBillingDate = startDate.toISOString();
        }

        const subscriptionRef = db
          .collection("users")
          .doc(userId)
          .collection("subscriptions")
          .doc(result.id);

        await subscriptionRef.set(
          {
            subscription_id: result.id,
            user_id: userId,
            course_id: courseId,
            course_title: course.title || "Subscription",
            status: "pending",
            payer_email: payerEmail,
            transaction_amount: course.price,
            currency_id: "COP",
            management_url: `https://www.mercadopago.com.co/subscriptions/management?preapproval_id=${result.id}`,
            next_billing_date: nextBillingDate,
            created_at: admin.firestore.FieldValue.serverTimestamp(),
            updated_at: admin.firestore.FieldValue.serverTimestamp(),
          },
          {merge: true}
        );

        response.json({data: {init_point: result.init_point, subscription_id: result.id}});
        return;
      }

      functions.logger.error("PreApproval API did not return init_point");
      response.status(500).json({error: {code: "INTERNAL_ERROR", message: "Failed to create subscription checkout URL"}});
    } catch (error: unknown) {
      if (isGen1RateLimitError(error)) {
        response.status(429).json({error: {code: "RATE_LIMITED", message: "Too many requests"}});
        return;
      }
      const message = toErrorMessage(error);
      functions.logger.error("Error creating subscription:", error);

      const normalizedMessage = message?.toLowerCase?.() || "";
      const requiresAlternateEmail =
        normalizedMessage.includes("cannot operate between different countries") ||
        normalizedMessage.includes("cannot operate between different") ||
        normalizedMessage.includes("payer_email") ||
        normalizedMessage.includes("belongs to another user") ||
        normalizedMessage.includes("must belong to this site");

      if (requiresAlternateEmail) {
        response.status(409).json({error: {code: "CONFLICT", message: "Por favor ingresa tu correo de Mercado Pago"}});
        return;
      }

      response.status(500).json({error: {code: "INTERNAL_ERROR", message: "Error al crear la suscripción"}});
    }
  });

// Webhook handler - processes payment and assigns courses to users
export const processPaymentWebhook = functions
  .runWith({secrets: [mercadopagoWebhookSecret, mercadopagoAccessToken]})
  .https.onRequest(async (request: Request, response: Response) => {
    response.set("Access-Control-Allow-Origin", "*");
    response.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    response.set("Access-Control-Allow-Headers", "Content-Type");

    if (request.method === "OPTIONS") {
      response.status(204).send("");
      return;
    }

    try {
      const webhookSecret = mercadopagoWebhookSecret.value();

      if (!webhookSecret) {
        functions.logger.error("Missing Mercado Pago webhook secret");
        response.status(500).send("Webhook secret not configured");
        return;
      }

      const signatureHeaderLegacy =
        request.get("x-hmac-signature") ||
        request.get("x-mercadopago-signature") ||
        request.get("x-hmac-signature-256");
      const signatureHeaderNew = request.get("x-signature");

      const rawBodyValue = (request as Request & {rawBody?: unknown}).rawBody;

      const resolveRawBody = (): Buffer => {
        if (Buffer.isBuffer(rawBodyValue)) {
          return rawBodyValue;
        }
        if (typeof rawBodyValue === "string") {
          return Buffer.from(rawBodyValue);
        }
        if (rawBodyValue !== undefined && rawBodyValue !== null) {
          return Buffer.from(JSON.stringify(rawBodyValue));
        }
        const fallbackBody = request.body ?? {};
        const fallbackString = typeof fallbackBody === "string" ?
          fallbackBody :
          JSON.stringify(fallbackBody);
        return Buffer.from(fallbackString);
      };

      const validateSignatureLegacy = (provided: string): boolean => {
        const rawBodyBuffer = resolveRawBody();
        const expectedSignature = crypto
          .createHmac("sha256", webhookSecret)
          .update(rawBodyBuffer)
          .digest("hex");

        const providedSignatureBuffer = Buffer.from(provided, "utf8");
        const expectedSignatureBuffer = Buffer.from(expectedSignature, "utf8");

        if (providedSignatureBuffer.length !== expectedSignatureBuffer.length) {
          return false;
        }

        try {
          return crypto.timingSafeEqual(
            providedSignatureBuffer,
            expectedSignatureBuffer
          );
        } catch (compareError) {
          functions.logger.error("Error comparing webhook signatures", compareError);
          return false;
        }
      };

      const parseSignatureHeader = (header: string) => {
        const parts = header.split(",");
        const result: Record<string, string> = {};
        for (const part of parts) {
          const [key, value] = part.split("=");
          if (key && value) {
            result[key.trim()] = value.trim();
          }
        }
        return result;
      };

      const validateSignatureNew = (header: string): boolean => {
        const parsed = parseSignatureHeader(header);
        const timestamp = parsed["ts"];
        const signature = parsed["v1"];
        const requestId = request.get("x-request-id") ?? "";
        const dataId = request.body?.data?.id;

        if (!timestamp || !signature || !requestId || !dataId) {
          functions.logger.warn("Missing fields for Mercado Pago signature validation", {
            timestampPresent: Boolean(timestamp),
            signaturePresent: Boolean(signature),
            requestIdPresent: Boolean(requestId),
            dataIdPresent: Boolean(dataId),
          });
          return false;
        }

        const template = `id:${dataId};request-id:${requestId};ts:${timestamp};`;
        const expectedSignature = crypto
          .createHmac("sha256", webhookSecret)
          .update(template)
          .digest("hex");

        const providedSignatureBuffer = Buffer.from(signature, "utf8");
        const expectedSignatureBuffer = Buffer.from(expectedSignature, "utf8");

        if (providedSignatureBuffer.length !== expectedSignatureBuffer.length) {
          return false;
        }

        try {
          return crypto.timingSafeEqual(
            providedSignatureBuffer,
            expectedSignatureBuffer
          );
        } catch (compareError) {
          functions.logger.error("Error comparing Mercado Pago signatures", compareError);
          return false;
        }
      };

      let signatureIsValid = false;

      if (signatureHeaderNew) {
        signatureIsValid = validateSignatureNew(signatureHeaderNew);
      } else if (signatureHeaderLegacy) {
        signatureIsValid = validateSignatureLegacy(signatureHeaderLegacy);
      }

      if (!signatureIsValid) {
        functions.logger.warn("Invalid Mercado Pago webhook signature", {
          hasNewSignature: Boolean(signatureHeaderNew),
          hasLegacySignature: Boolean(signatureHeaderLegacy),
        });
        response.status(403).send("Invalid signature");
        return;
      }

      functions.logger.info("Webhook received", {
        type: request.body?.type,
        action: request.body?.action,
        dataId: request.body?.data?.id,
      });

      // Handle both payment and subscription webhooks
      const webhookType = request.body?.type;
      const webhookAction = request.body?.action;

      let paymentId: string | null = null;

      // Handle payment webhooks
      if (webhookType === "payment") {
        // Handle both payment.created and payment.updated
        if (
          webhookAction !== "payment.created" &&
          webhookAction !== "payment.updated"
        ) {
          functions.logger.info(
            "Skipping non-payment webhook action:",
            webhookAction
          );
          response.status(200).send("OK");
          return;
        }

        // Extract payment ID
        paymentId = request.body?.data?.id;
      } else if (webhookType === "subscription_authorized_payment") {
        // Handle subscription authorized payment webhook
        // This is sent when a payment is authorized for a subscription
        if (webhookAction !== "created") {
          functions.logger.info(
            "Skipping non-created subscription_authorized_payment:",
            webhookAction
          );
          response.status(200).send("OK");
          return;
        }

        // Extract payment ID from subscription_authorized_payment
        // Note: This is an authorized payment ID, not a regular payment ID
        paymentId = request.body?.data?.id;

        functions.logger.info(
          "Processing subscription authorized payment:",
          paymentId
        );
      } else if (webhookType === "subscription_preapproval") {
        const preapprovalId = request.body?.data?.id;

        if (!preapprovalId) {
          functions.logger.warn(
            "subscription_preapproval webhook missing preapproval ID"
          );
          response.status(200).send("OK");
          return;
        }

        try {
          const client = getClient();
          const preapproval = new PreApproval(client);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const preapprovalData =
            await preapproval.get({id: preapprovalId}) as MercadoPagoPreapproval;
          const externalReference = preapprovalData?.external_reference;

          if (!externalReference) {
            functions.logger.warn(
              "subscription_preapproval missing external_reference",
              preapprovalId
            );
            response.status(200).send("OK");
            return;
          }

          let parsedReference: ParsedReference | null = null;

          try {
            parsedReference = parseExternalReference(externalReference);
          } catch (parseError) {
            functions.logger.error(
              "Failed to parse external_reference for subscription_preapproval",
              parseError
            );
            response.status(200).send("OK");
            return;
          }

          const subscriptionRef = db
            .collection("users")
            .doc(parsedReference.userId)
            .collection("subscriptions")
            .doc(preapprovalId);

          const nextPaymentDate =
            preapprovalData?.next_payment_date ||
            preapprovalData?.auto_recurring?.next_payment_date ||
            null;

          const updateData: Record<string, unknown> = {
            status: preapprovalData?.status || "pending",
            transaction_amount: preapprovalData?.auto_recurring?.transaction_amount || null,
            currency_id: preapprovalData?.auto_recurring?.currency_id || null,
            reason: preapprovalData?.reason || null,
            management_url: `https://www.mercadopago.com.co/subscriptions/management?preapproval_id=${preapprovalId}`,
            next_billing_date: nextPaymentDate,
            updated_at: admin.firestore.FieldValue.serverTimestamp(),
            last_action: webhookAction,
          };

          const webhookPayerEmail =
            preapprovalData?.payer_email ??
            preapprovalData?.payer?.email ??
            null;

          if (webhookPayerEmail) {
            updateData.payer_email = webhookPayerEmail;
          }

          if (preapprovalData?.status === "cancelled") {
            updateData.cancelled_at = admin.firestore.FieldValue.serverTimestamp();
          }

          await subscriptionRef.set(updateData, {merge: true});
          functions.logger.info(
            "Subscription preapproval updated:",
            preapprovalId,
            updateData.status
          );
        } catch (preapprovalError) {
          functions.logger.error(
            "Error handling subscription_preapproval webhook:",
            preapprovalError
          );
        }

        response.status(200).send("OK");
        return;
      } else {
        // Unknown webhook type
        functions.logger.info(
          "Skipping unknown webhook type:",
          webhookType,
          webhookAction
        );
        response.status(200).send("OK");
        return;
      }

      if (!paymentId) {
        functions.logger.error("Payment ID not found in webhook");
        response.status(400).send("Payment ID required");
        return;
      }

      functions.logger.info("Processing payment:", paymentId);

      // Fix #6: Check if payment.updated/subscription.updated and
      // payment.created/subscription.created already processed
      const processedPaymentsRef = db
        .collection("processed_payments")
        .doc(paymentId);

      // Check for duplicate webhook events (updated after created)
      // Smart duplicate detection: allow reprocessing if status changed from pending to approved
      if (webhookAction === "payment.updated" || webhookAction === "updated") {
        const processedDoc = await processedPaymentsRef.get();
        if (processedDoc.exists) {
          const processedStatus = processedDoc.data()?.status;
          
          // Allow reprocessing if previous status was pending/in_process/processing (for async payments like PSE/Bancolombia)
          // "processing" status means the transaction started but payment wasn't approved yet
          // This handles the case where payment.created had status "pending" and payment.updated has status "approved"
          if (processedStatus === "pending" || processedStatus === "in_process" || processedStatus === "processing") {
            functions.logger.info(
              "Payment status changed from pending/in_process/processing, allowing reprocessing:",
              paymentId,
              "Previous status:",
              processedStatus
            );
            // Continue processing - don't skip
          } else if (processedStatus === "approved") {
            // Already processed and approved - skip to prevent duplicate processing
            functions.logger.info(
              "Payment already processed and approved, skipping:",
              paymentId
            );
            response.status(200).send("OK");
            return;
          } else {
            // Failed/rejected - don't reprocess
            functions.logger.info(
              "Payment already processed with status:",
              processedStatus,
              "skipping:",
              paymentId
            );
            response.status(200).send("OK");
            return;
          }
        } else {
          // payment.created/subscription.created was missed - process updated as fallback
          functions.logger.info(
            "Created event was missed, processing updated event as fallback:",
            paymentId,
            webhookAction
          );
        }
      }

      // Fetch payment details from Mercado Pago API FIRST
      // We need to check the status before creating any documents
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let paymentData: any;
      let paymentSource: "payment" | "authorized_payment" = "payment";

      try {
        if (webhookType === "subscription_authorized_payment") {
          const accessToken = mercadopagoAccessToken.value();

          if (!accessToken) {
            throw new Error("Missing Mercado Pago access token");
          }

          const authorizedPaymentResponse = await fetch(
            `https://api.mercadopago.com/authorized_payments/${paymentId}`,
            {
              method: "GET",
              headers: {
                "Authorization": `Bearer ${accessToken}`,
                "Content-Type": "application/json",
              },
            }
          );

          if (!authorizedPaymentResponse.ok) {
            throw new Error(
              `Failed to fetch authorized payment: ${authorizedPaymentResponse.status}`
            );
          }

          paymentData = await authorizedPaymentResponse.json();
          paymentSource = "authorized_payment";

          if (!paymentData.status) {
            paymentData.status = paymentData.payment?.status || "approved";
          }

          if (!paymentData.external_reference && paymentData.preapproval?.external_reference) {
            paymentData.external_reference = paymentData.preapproval.external_reference;
          }

          if (!paymentData.preapproval_id && paymentData.preapproval?.id) {
            paymentData.preapproval_id = paymentData.preapproval.id;
          }
        } else {
          const client = getClient();
          const payment = new Payment(client);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const result: any = await payment.get({id: paymentId});
          paymentData = result || {};
          paymentSource = "payment";
        }
      } catch (apiError: unknown) {
        const errorMessage = toErrorMessage(apiError);
        functions.logger.error("Error fetching payment from API:", apiError);

        const errorType = classifyError(apiError);

        if (errorType === "RETRYABLE") {
          response.status(500).send("Error fetching payment");
        } else {
          await processedPaymentsRef.set({
            processed_at: admin.firestore.FieldValue.serverTimestamp(),
            status: "error",
            error_type: "payment_fetch_failed",
            error_message: errorMessage,
          });
          response.status(200).send("OK");
        }
        return;
      }

      functions.logger.info("Payment data", {
        paymentId,
        paymentSource,
        status: paymentData.status,
        external_reference: paymentData.external_reference,
        preapproval_id: paymentData.preapproval_id,
      });

      // Check if payment is approved
      if (!paymentData || paymentData.status !== "approved") {
        functions.logger.info(
          "Payment not approved, status:",
          paymentData?.status,
          "Payment ID:",
          paymentId
        );
        
        // For pending/in_process payments, don't mark as processed
        // This allows the payment.updated webhook to process it when status becomes "approved"
        if (paymentData?.status === "pending" || paymentData?.status === "in_process") {
          functions.logger.info(
            "Payment is pending/in_process, waiting for approval:",
            paymentId
          );
          
          // DON'T mark as processed - allow payment.updated to process when approved
          response.status(200).send("OK");
          return;
        }
        
        // For failed/rejected payments, mark as processed to prevent reprocessing
        await processedPaymentsRef.set({
          processed_at: admin.firestore.FieldValue.serverTimestamp(),
          status: paymentData?.status || "unknown",
        });

        response.status(200).send("OK");
        return;
      }

      // Payment is approved - now check for duplicates and mark as processing
      // Use Firestore transaction for atomic idempotency check
      const alreadyProcessed = await db.runTransaction(async (transaction) => {
        const processedDoc = await transaction.get(processedPaymentsRef);

        if (processedDoc.exists) {
          const existingStatus = processedDoc.data()?.status;
          // If it was already processed and approved, skip
          if (existingStatus === "approved") {
            return true; // Already processed
          }
          // If it exists with processing/pending/in_process status, allow reprocessing
          // This handles the case where payment.created had status "pending" and payment.updated has status "approved"
          // We'll update it to "processing" and continue
        }

        // Mark as processing (atomic check-and-set)
        transaction.set(
          processedPaymentsRef,
          {
            processed_at: admin.firestore.FieldValue.serverTimestamp(),
            status: "processing",
            payment_id: paymentId,
          },
          {merge: true}
        );

        return false; // Not processed yet, continue
      });

      if (alreadyProcessed) {
        functions.logger.info(
          "Payment already processed and approved, skipping:",
          paymentId
        );
        response.status(200).send("OK");
        return;
      }

      const externalReference = paymentData.external_reference;

      if (!externalReference) {
        functions.logger.error("Missing external_reference in payment data", {
          paymentId,
          paymentSource,
        });

        await processedPaymentsRef.set({
          processed_at: admin.firestore.FieldValue.serverTimestamp(),
          status: "error",
          error_type: "missing_external_reference",
          error_message: "external_reference not provided by Mercado Pago",
        });

        response.status(200).send("OK");
        return;
      }

      let parsedReference: ParsedReference;
      try {
        parsedReference = parseExternalReference(externalReference);
      } catch (parseError: unknown) {
        const parseMessage = toErrorMessage(parseError);
        functions.logger.error("Invalid external_reference", {
          paymentId,
          paymentSource,
          externalReference,
          error: parseMessage,
        });

        await processedPaymentsRef.set({
          processed_at: admin.firestore.FieldValue.serverTimestamp(),
          status: "error",
          error_type: "invalid_external_reference",
          error_message: parseMessage,
        });

        response.status(200).send("OK");
        return;
      }

      const {userId, courseId, paymentType} = parsedReference;
      const isSubscription = paymentType === "sub";

      if (isSubscription && webhookType !== "subscription_authorized_payment" && webhookType !== "payment") {
        functions.logger.warn("Subscription reference received on unexpected webhook type", {
          webhookType,
          paymentId,
          externalReference,
        });
      }

      functions.logger.info("Parsed external reference", {
        paymentId,
        externalReference,
        paymentType,
        version: parsedReference.version,
      });

      functions.logger.info(
        "Processing approved payment:",
        paymentId,
        "User:",
        userId,
        "Course:",
        courseId,
        "Is Subscription:",
        isSubscription
      );

      // Validate user exists - Fix #5: Return 200 to prevent retries
      const userDoc = await db.collection("users").doc(userId).get();
      if (!userDoc.exists) {
        functions.logger.error("User not found:", userId);
        // Mark as processed with error status to prevent retries
        await processedPaymentsRef.set({
          processed_at: admin.firestore.FieldValue.serverTimestamp(),
          status: "error",
          error_type: "user_not_found",
          error_message: "User not found",
          payment_type: paymentType,
        });
        // Return 200 to prevent retries
        response.status(200).send("OK");
        return;
      }

      const userData = userDoc.data() || {};
      const userEmail = userData?.email ?? null;
      const userName =
        userData?.display_name ?? userData?.name ?? userData?.fullName ?? null;

      // Validate course exists - Fix #5: Return 200 to prevent retries
      const courseDoc = await db.collection("courses").doc(courseId).get();
      if (!courseDoc.exists) {
        functions.logger.error("Course not found:", courseId);
        // Mark as processed with error status to prevent retries
        await processedPaymentsRef.set({
          processed_at: admin.firestore.FieldValue.serverTimestamp(),
          status: "error",
          error_type: "course_not_found",
          error_message: "Course not found",
          payment_type: paymentType,
        });
        // Return 200 to prevent retries
        response.status(200).send("OK");
        return;
      }

      const courseDetails = courseDoc.data();
      const courseTitle = courseDetails?.title || "Untitled Course";
      const courseAccessDuration = courseDetails?.access_duration;

      // Check if user already owns course (same as app logic)
      const existingPurchase = await checkUserOwnsCourse(userId, courseId);

      // Determine if this is a subscription renewal
      const isRenewal = existingPurchase && isSubscription;

      if (isRenewal) {
        // Subscription renewal: extend expiration date
        functions.logger.info(
          "Subscription renewal detected:",
          userId,
          courseId
        );

        const currentCourse = existingPurchase ? (userDoc.data()?.courses || {})[courseId] : null;
        const currentExpiration = currentCourse?.expires_at ?? null;
        const expirationDate = calculateExpirationDate(courseAccessDuration, {
          from: currentExpiration ?? undefined,
        });
        functions.logger.info(
          "Using calculated expiration date for renewal:",
          expirationDate,
          "Base:",
          currentExpiration
        );

        // Update existing course with new expiration date
        const userRef = db.collection("users").doc(userId);
        const courses = (userData?.courses || {});

        courses[courseId] = {
          ...courses[courseId],
          expires_at: expirationDate,
          status: "active",
          // Keep existing data
        };

        await userRef.update({
          courses: courses,
        });

        functions.logger.info(
          "✅ Subscription renewed successfully:",
          paymentId,
          "New expiration:",
          expirationDate
        );

        const subscriptionId =
          paymentData.subscription_id || paymentData.preapproval_id;

        if (isSubscription && subscriptionId) {
          await db
            .collection("users")
            .doc(userId)
            .collection("subscriptions")
            .doc(subscriptionId)
            .set(
              {
                status: "authorized",
                last_payment_id: paymentId,
                last_payment_date:
                  paymentData.date_approved ||
                  paymentData.date_created ||
                  new Date().toISOString(),
                updated_at: admin.firestore.FieldValue.serverTimestamp(),
              },
              {merge: true}
            );
        }

        // Mark payment as processed
        await processedPaymentsRef.set({
          processed_at: admin.firestore.FieldValue.serverTimestamp(),
          status: "approved",
          userId: userId,
          courseId: courseId,
          isSubscription: true,
          isRenewal: true,
          payment_type: paymentType,
          userEmail,
          userName,
          courseTitle,
          state: "completed",
        });

        response.status(200).send("OK");
        return;
      }

      if (existingPurchase && !isSubscription) {
        // User already owns course (not a subscription renewal)
        functions.logger.info(
          "User already owns course, skipping assignment:",
          userId,
          courseId
        );
        // Mark as processed
        await processedPaymentsRef.set({
          processed_at: admin.firestore.FieldValue.serverTimestamp(),
          status: "already_owned",
          userId,
          courseId,
          userEmail,
          userName,
          courseTitle,
          state: "already_owned",
          payment_type: paymentType,
        });

        response.status(200).send("OK");
        return;
      }

      // Initial purchase (one-time or subscription)
      // Validate course has access_duration - Fix #5: Return 200 to prevent retries
      if (!courseAccessDuration) {
        functions.logger.error(
          "Course missing access_duration:",
          courseId
        );
        // Mark as processed with error status to prevent retries
        await processedPaymentsRef.set({
          processed_at: admin.firestore.FieldValue.serverTimestamp(),
          status: "error",
          error_type: "missing_access_duration",
          error_message: "Course missing access_duration",
          userId,
          courseId,
          userEmail,
          userName,
          courseTitle,
          state: "failed",
          payment_type: paymentType,
        });
        // Return 200 to prevent retries

        response.status(200).send("OK");
        return;
      }

      const subscriptionId =
        paymentData?.subscription_id || paymentData?.preapproval_id || null;

      const expirationDate = calculateExpirationDate(courseAccessDuration);
      functions.logger.info(
        "Using calculated expiration date for new purchase:",
        expirationDate
      );

      // Fix #3: Use Firestore transaction for atomic course assignment
      await db.runTransaction(async (transaction) => {
        // Get user document
        const userRef = db.collection("users").doc(userId);
        const userDoc = await transaction.get(userRef);

        if (!userDoc.exists) {
          throw new Error("User not found");
        }

        const userData = userDoc.data();
        const courses = userData?.courses || {};

        // Check if course already assigned (atomic check)
        if (courses[courseId]) {
          const courseData = courses[courseId];
          const isActive = courseData.status === "active";
          const isNotExpired = new Date(courseData.expires_at) > new Date();

          if (isActive && isNotExpired) {
            // Already assigned - skip
            functions.logger.info(
              "Course already assigned, skipping:",
              userId,
              courseId
            );
            return; // Exit transaction
          }
        }

        // Add course to user (atomic write)
        courses[courseId] = {
          // Access control
          access_duration: courseAccessDuration,
          expires_at: expirationDate,
          status: "active",
          purchased_at: new Date().toISOString(),

          // Delivery type: PWA uses this for one_on_one vs low_ticket (version/load path)
          deliveryType: courseDetails?.deliveryType ?? "low_ticket",

          // Minimal cached data for display
          title: courseDetails?.title || "Untitled Course",
          image_url: courseDetails?.image_url || null,
          discipline: courseDetails?.discipline || "General",
          creatorName: courseDetails?.creatorName ||
            courseDetails?.creator_name ||
            "Unknown Creator",

          // Tutorial completion tracking
          completedTutorials: {
            dailyWorkout: [],
            warmup: [],
            workoutExecution: [],
            workoutCompletion: [],
          },
        };

        // Update user document (atomic write)
        transaction.update(userRef, {
          courses: courses,
          purchased_courses: [
            ...new Set([...(userData?.purchased_courses || []), courseId]),
          ],
        });

        if (isSubscription && subscriptionId) {
          const subscriptionRef = db
            .collection("users")
            .doc(userId)
            .collection("subscriptions")
            .doc(subscriptionId);

          transaction.set(
            subscriptionRef,
            {
              status: "authorized",
              last_payment_id: paymentId,
              last_payment_date:
                paymentData.date_approved ||
                paymentData.date_created ||
                new Date().toISOString(),
              transaction_amount: paymentData.transaction_amount || null,
              currency_id: paymentData.currency_id || null,
              management_url: `https://www.mercadopago.com.co/subscriptions/management?preapproval_id=${subscriptionId}`,
              updated_at: admin.firestore.FieldValue.serverTimestamp(),
            },
            {merge: true}
          );
        }

        // Mark payment as processed (atomic write)
        transaction.set(
          processedPaymentsRef,
          {
            processed_at: admin.firestore.FieldValue.serverTimestamp(),
            status: "approved",
            userId: userId,
            courseId: courseId,
            isSubscription: isSubscription,
            isRenewal: false,
            payment_type: paymentType,
            userEmail,
            userName,
            courseTitle,
            state: "completed",
          },
          {merge: true}
        );

        functions.logger.info(
          "✅ Payment processed successfully:",
          paymentId,
          "Course assigned to user:",
          userId,
          "Is Subscription:",
          isSubscription
        );
      });

      response.status(200).send("OK");
    } catch (error: unknown) {
      const message = toErrorMessage(error);
      functions.logger.error("Error in webhook:", error);

      // Fix #4: Classify errors and return appropriate status codes
      const errorType = classifyError(error);

      switch (errorType) {
      case "RETRYABLE":
        // Network errors, API timeouts, etc.
        functions.logger.warn("Retryable error, returning 500 for retry");
        response.status(500).send("Error");
        break;

      case "NON_RETRYABLE":
        // Validation errors, missing data, etc.
        functions.logger.warn("Non-retryable error, returning 200 to prevent retry");
        // Mark as processed to prevent retries
        try {
          const processedPaymentsRef = db
            .collection("processed_payments")
            .doc(request.body?.data?.id || "unknown");
          await processedPaymentsRef.set({
            processed_at: admin.firestore.FieldValue.serverTimestamp(),
            status: "error",
            error_message: message,
          });
        } catch (writeError) {
          functions.logger.error("Error writing error status:", writeError);
        }

        response.status(200).send("OK");
        break;

      default:
        // Unknown errors - be safe and return 500
        response.status(500).send("Error");
      }
    }
  });

export const updateSubscriptionStatus = functions
  .runWith({secrets: [mercadopagoAccessToken]})
  .https.onRequest(async (request, response) => {
    response.set("Access-Control-Allow-Origin", "*");
    response.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    response.set("Access-Control-Allow-Headers", "Content-Type, Authorization");

    if (request.method === "OPTIONS") {
      response.status(204).send("");
      return;
    }

    if (request.method !== "POST") {
      response.status(405).json({error: {code: "VALIDATION_ERROR", message: "Method not allowed"}});
      return;
    }

    const userId = await verifyGen1Auth(request);
    if (!userId) {
      response.status(401).json({error: {code: "UNAUTHENTICATED", message: "Autenticación requerida"}});
      return;
    }

    try {
      checkGen1RateLimit(`updateSubscriptionStatus_${userId}`);

      const {
        subscriptionId,
        action,
        survey,
      }: {
        subscriptionId?: string;
        action?: string;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        survey?: any;
      } = request.body || {};

      if (!subscriptionId || typeof subscriptionId !== "string") {
        response.status(400).json({error: {code: "VALIDATION_ERROR", message: "subscriptionId es requerido", field: "subscriptionId"}});
        return;
      }

      if (!action || typeof action !== "string") {
        response.status(400).json({error: {code: "VALIDATION_ERROR", message: "action es requerido", field: "action"}});
        return;
      }

      const ALLOWED_ACTIONS = ["cancel", "pause", "resume"] as const;
      const actionToStatus: Record<string, string> = {
        cancel: "cancelled",
        pause: "paused",
        resume: "authorized",
      };

      if (!ALLOWED_ACTIONS.includes(action as typeof ALLOWED_ACTIONS[number])) {
        response.status(400).json({error: {code: "VALIDATION_ERROR", message: "Unsupported action. Must be cancel, pause, or resume", field: "action"}});
        return;
      }

      const targetStatus = actionToStatus[action];

      const subscriptionRef = db
        .collection("users")
        .doc(userId)
        .collection("subscriptions")
        .doc(subscriptionId);

      const subscriptionDoc = await subscriptionRef.get();

      if (!subscriptionDoc.exists) {
        response.status(404).json({error: {code: "NOT_FOUND", message: "Subscription not found for user"}});
        return;
      }

      const subscriptionData = subscriptionDoc.data() ?? {};

      const client = getClient();
      const preapproval = new PreApproval(client);

      await preapproval.update({
        id: subscriptionId,
        body: {
          status: targetStatus,
        },
      });

      const updateData: Record<string, unknown> = {
        status: targetStatus,
        last_action: action,
        updated_at: admin.firestore.FieldValue.serverTimestamp(),
      };

      if (targetStatus === "cancelled") {
        updateData.cancelled_at = admin.firestore.FieldValue.serverTimestamp();
      } else if (targetStatus === "authorized") {
        updateData.cancelled_at = admin.firestore.FieldValue.delete();
      }

      await subscriptionRef.set(updateData, {merge: true});

      if (action === "cancel" && survey?.answers) {
        try {
          const courseId =
            survey?.courseId ??
            subscriptionData?.course_id ??
            subscriptionData?.courseId ??
            subscriptionData?.program_id ??
            undefined;

          const courseTitle =
            survey?.courseTitle ??
            subscriptionData?.course_title ??
            subscriptionData?.courseTitle ??
            undefined;

          const statusBefore =
            survey?.subscriptionStatusBefore ?? subscriptionData?.status ?? undefined;

          const payerEmail = subscriptionData?.payer_email ?? survey?.payerEmail ?? undefined;

          const surveyRecord: Record<string, unknown> = {
            userId,
            subscriptionId,
            answers: survey.answers,
            source: survey?.source ?? "in_app_cancel_flow_v1",
            statusAfter: targetStatus,
            submittedAt: admin.firestore.FieldValue.serverTimestamp(),
          };

          if (courseId !== undefined) {
            surveyRecord.courseId = courseId;
          }

          if (courseTitle !== undefined) {
            surveyRecord.courseTitle = courseTitle;
          }

          if (statusBefore !== undefined) {
            surveyRecord.statusBefore = statusBefore;
          }

          if (payerEmail !== undefined) {
            surveyRecord.payerEmail = payerEmail;
          }

          await db.collection("subscription_cancellation_feedback").add(surveyRecord);
        } catch (surveyError) {
          functions.logger.error(
            "Failed to record cancellation survey feedback",
            surveyError
          );
        }
      }

      response.json({data: {status: targetStatus}});
    } catch (error: unknown) {
      if (isGen1RateLimitError(error)) {
        response.status(429).json({error: {code: "RATE_LIMITED", message: "Too many requests"}});
        return;
      }
      functions.logger.error("Error updating subscription status:", error);
      response.status(500).json({error: {code: "INTERNAL_ERROR", message: "Error al actualizar el estado de la suscripción"}});
    }
  });


/**
 * Lookup user by email or username for creator invite (one-on-one client add).
 * Only creators can call this. Returns user info for confirmation before enrollment.
 */
export const lookupUserForCreatorInvite = functions.https.onCall(
  async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "Debes iniciar sesión para buscar usuarios"
      );
    }

    const creatorId = context.auth.uid;
    const { emailOrUsername } = data || {};

    if (!emailOrUsername || typeof emailOrUsername !== "string") {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Proporciona un email o nombre de usuario"
      );
    }

    const trimmed = emailOrUsername.trim();
    if (!trimmed) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Proporciona un email o nombre de usuario"
      );
    }

    // Check caller is creator or admin
    const creatorDoc = await db.collection("users").doc(creatorId).get();
    const role = creatorDoc.exists
      ? (creatorDoc.data()?.role as string | undefined)
      : undefined;
    if (role !== "creator" && role !== "admin") {
      throw new functions.https.HttpsError(
        "permission-denied",
        "Solo creadores pueden buscar usuarios"
      );
    }

    let userId: string | null = null;
    let displayName = "";
    let email = "";
    let username = "";
    let userDocData: Record<string, unknown> | null = null;

    // If input looks like email, try Firebase Auth lookup first
    if (trimmed.includes("@")) {
      try {
        const authUser = await admin.auth().getUserByEmail(trimmed);
        userId = authUser.uid;
        email = authUser.email || trimmed;
        displayName = authUser.displayName || "";
      } catch (_err) {
        // User not found by email - fall through to username lookup
      }
    }

    // If not found by email, try Firestore username lookup
    if (!userId) {
      const usersSnapshot = await db
        .collection("users")
        .where("username", "==", trimmed.toLowerCase())
        .limit(1)
        .get();

      if (!usersSnapshot.empty) {
        const userDoc = usersSnapshot.docs[0];
        userId = userDoc.id;
        userDocData = userDoc.data() as Record<string, unknown>;
        const d = userDocData;
        displayName = String(d?.displayName || d?.name || "");
        email = String(d?.email || "");
        username = String(d?.username || trimmed);
      }
    }

    // Enrich from Firestore if we found by email (or to get full profile for any path)
    if (userId) {
      const userDoc = await db.collection("users").doc(userId).get();
      if (userDoc.exists) {
        userDocData = userDoc.data() ?? null;
        const d = userDocData as Record<string, unknown> | null;
        if (d) {
          displayName = displayName || String(d.displayName || d.name || "");
          email = email || String(d.email || "");
          username = username || String(d.username || "");
        }
      }
    }

    if (!userId) {
      throw new functions.https.HttpsError(
        "not-found",
        "No se encontró ningún usuario con ese email o nombre de usuario"
      );
    }

    // Build extra profile fields for creator preview
    let age: number | null = null;
    let gender = "";
    let country = "";
    let city = "";
    let height: number | string | null = null;
    let weight: number | string | null = null;
    if (userDocData) {
      const d = userDocData as Record<string, unknown>;
      const ageVal = d.age;
      age =
        typeof ageVal === "number" && !Number.isNaN(ageVal) ? ageVal : null;
      if (age == null && d.birthDate) {
        const raw = d.birthDate as { toDate?: () => Date } | string;
        const birthDate =
          typeof raw === "object" && raw?.toDate
            ? raw.toDate()
            : new Date(raw as string);
        if (!isNaN(birthDate.getTime())) {
          age =
            new Date().getFullYear() -
            birthDate.getFullYear();
          const monthDiff =
            new Date().getMonth() - birthDate.getMonth();
          if (
            monthDiff < 0 ||
            (monthDiff === 0 &&
              new Date().getDate() < birthDate.getDate())
          ) {
            age--;
          }
        }
      }
      gender = String(d.gender ?? "");
      country = String(d.country ?? "");
      city = String(d.city ?? d.location ?? "");
      const h = d.height;
      height =
        h != null && (typeof h === "number" || typeof h === "string")
          ? h
          : null;
      const w = d.bodyweight ?? d.weight;
      weight =
        w != null && (typeof w === "number" || typeof w === "string")
          ? w
          : null;
    }

    return {
      userId,
      displayName: displayName || undefined,
      email: email || undefined,
      username: username || undefined,
      age: age ?? null,
      gender: gender || null,
      country: country || null,
      city: city || null,
      height: height ?? null,
      weight: weight ?? null,
    };
  }
);

// ============================================
// NUTRITION (FatSecret proxy) — Step 2
// ============================================
// Optional: set this only if FatSecret requires a single whitelisted IP (then use
// Serverless VPC connector + Cloud NAT). With 0.0.0.0/0 and ::/0 in FatSecret, leave empty.
const NUTRITION_VPC_CONNECTOR = "";

const FATSECRET_TOKEN_BUFFER_MS = 5 * 60 * 1000; // refresh 5 min before expiry
const fatSecretTokenCache = new Map<
  string,
  { token: string; expiresAt: number }
>();

async function getFatSecretToken(
  clientId: string,
  clientSecret: string,
  scope: string = "basic"
): Promise<string> {
  const cached = fatSecretTokenCache.get(scope);
  if (
    cached &&
    Date.now() < cached.expiresAt - FATSECRET_TOKEN_BUFFER_MS
  ) {
    return cached.token;
  }

  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    scope,
  }).toString();

  const res = await fetch("https://oauth.fatsecret.com/connect/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Authorization": `Basic ${auth}`,
    },
    body,
  });

  if (!res.ok) {
    const text = await res.text();
    functions.logger.error("FatSecret token request failed", {
      status: res.status,
      body: text,
    });
    throw new Error("FatSecret auth failed");
  }

  const data = (await res.json()) as {
    access_token?: string;
    expires_in?: number;
  };

  if (!data?.access_token) {
    functions.logger.error("FatSecret token response missing access_token");
    throw new Error("FatSecret auth failed");
  }

  const expiresAt =
    Date.now() + (typeof data.expires_in === "number" ? data.expires_in : 86400) * 1000;
  fatSecretTokenCache.set(scope, { token: data.access_token, expiresAt });
  return data.access_token;
}

function setNutritionCors(res: Response): void {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type");
}

const nutritionRunOptions: functions.RuntimeOptions = {
  secrets: [fatSecretClientId, fatSecretClientSecret],
  ...(NUTRITION_VPC_CONNECTOR
    ? {
        vpcConnector: NUTRITION_VPC_CONNECTOR,
        vpcConnectorEgressSettings: "ALL_TRAFFIC" as const,
      }
    : {}),
};

export const nutritionFoodSearch = functions
  .runWith(nutritionRunOptions)
  .https.onRequest(async (request, response) => {
    setNutritionCors(response);
    if (request.method === "OPTIONS") {
      response.status(204).send("");
      return;
    }
    if (request.method !== "POST") {
      response.status(405).json({error: {code: "VALIDATION_ERROR", message: "Method not allowed"}});
      return;
    }

    try {
      const clientId = fatSecretClientId.value();
      const clientSecret = fatSecretClientSecret.value();
      if (!clientId || !clientSecret) {
        response.status(503).json({error: {code: "SERVICE_UNAVAILABLE", message: "Servicio de nutrición no configurado"}});
        return;
      }

      const {
        search_expression,
        page_number,
        max_results,
        region = "ES",
        language = "es",
      } = request.body || {};
      if (!search_expression || typeof search_expression !== "string") {
        response.status(400).json({error: {code: "VALIDATION_ERROR", message: "search_expression es requerido", field: "search_expression"}});
        return;
      }
      if (search_expression.length > 200) {
        response.status(400).json({error: {code: "VALIDATION_ERROR", message: "search_expression demasiado largo (máx 200 caracteres)", field: "search_expression"}});
        return;
      }

      const token = await getFatSecretToken(clientId, clientSecret, "premier");
      const params = new URLSearchParams({
        search_expression: search_expression.trim(),
        page_number: String(typeof page_number === "number" ? page_number : 0),
        max_results: String(
          typeof max_results === "number" ? Math.min(50, max_results) : 20
        ),
        format: "json",
        region: String(region),
        language: String(language),
      });

      const url = `https://platform.fatsecret.com/rest/foods/search/v4?${params}`;
      const res = await fetch(url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      if (!res.ok) {
        const text = await res.text();
        functions.logger.error("FatSecret foods.search failed", {
          status: res.status,
          body: text,
        });
        response.status(503).json({error: {code: "SERVICE_UNAVAILABLE", message: "Búsqueda de alimentos falló"}});
        return;
      }

      const json = await res.json();
      response.json(json);
    } catch (error: unknown) {
      functions.logger.error("nutritionFoodSearch error", error);
      response.status(503).json({error: {code: "SERVICE_UNAVAILABLE", message: "Búsqueda de alimentos falló"}});
    }
  });

export const nutritionFoodGet = functions
  .runWith(nutritionRunOptions)
  .https.onRequest(async (request, response) => {
    setNutritionCors(response);
    if (request.method === "OPTIONS") {
      response.status(204).send("");
      return;
    }
    if (request.method !== "POST") {
      response.status(405).json({error: {code: "VALIDATION_ERROR", message: "Method not allowed"}});
      return;
    }

    try {
      const clientId = fatSecretClientId.value();
      const clientSecret = fatSecretClientSecret.value();
      if (!clientId || !clientSecret) {
        response.status(503).json({error: {code: "SERVICE_UNAVAILABLE", message: "Servicio de nutrición no configurado"}});
        return;
      }

      const {
        food_id,
        region = "ES",
        language = "es",
        include_sub_categories,
      } = request.body || {};
      if (food_id === undefined || food_id === null || food_id === "") {
        response.status(400).json({error: {code: "VALIDATION_ERROR", message: "food_id es requerido", field: "food_id"}});
        return;
      }

      const scope =
        include_sub_categories === true ? "premier" : "basic";
      const token = await getFatSecretToken(clientId, clientSecret, scope);
      const params = new URLSearchParams({
        food_id: String(food_id),
        format: "json",
        region: String(region),
        language: String(language),
      });
      if (include_sub_categories === true) {
        params.set("include_sub_categories", "true");
      }
      const url = `https://platform.fatsecret.com/rest/food/v5?${params}`;
      const res = await fetch(url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      if (!res.ok) {
        if (res.status === 404) {
          response.status(404).json({error: {code: "NOT_FOUND", message: "Alimento no encontrado"}});
          return;
        }
        const text = await res.text();
        functions.logger.error("FatSecret food.get failed", {
          status: res.status,
          body: text,
        });
        response.status(503).json({error: {code: "SERVICE_UNAVAILABLE", message: "Detalle de alimento falló"}});
        return;
      }

      const json = await res.json();
      response.json(json);
    } catch (error: unknown) {
      functions.logger.error("nutritionFoodGet error", error);
      response.status(503).json({error: {code: "SERVICE_UNAVAILABLE", message: "Detalle de alimento falló"}});
    }
  });

export const nutritionBarcodeLookup = functions
  .runWith(nutritionRunOptions)
  .https.onRequest(async (request, response) => {
    setNutritionCors(response);
    if (request.method === "OPTIONS") {
      response.status(204).send("");
      return;
    }
    if (request.method !== "POST") {
      response.status(405).json({error: {code: "VALIDATION_ERROR", message: "Method not allowed"}});
      return;
    }

    try {
      const clientId = fatSecretClientId.value();
      const clientSecret = fatSecretClientSecret.value();
      if (!clientId || !clientSecret) {
        response.status(503).json({error: {code: "SERVICE_UNAVAILABLE", message: "Servicio de nutrición no configurado"}});
        return;
      }

      const {
        barcode,
        region = "ES",
        language = "es",
      } = request.body || {};
      if (!barcode || typeof barcode !== "string" || !BARCODE_RE.test(barcode.trim())) {
        response.status(400).json({error: {code: "VALIDATION_ERROR", message: "El código de barras debe contener entre 8 y 14 dígitos", field: "barcode"}});
        return;
      }

      const token = await getFatSecretToken(
        clientId,
        clientSecret,
        "basic barcode"
      );
      const params = new URLSearchParams({
        barcode: barcode.trim(),
        format: "json",
        region: String(region),
        language: String(language),
      });
      const url = `https://platform.fatsecret.com/rest/food/barcode/find-by-id/v2?${params}`;
      const res = await fetch(url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({})) as {error?: {code?: number}};
        if (res.status === 404 || errBody?.error?.code === 211) {
          response.status(404).json({error: {code: "NOT_FOUND", message: "Ningún alimento encontrado para ese código de barras"}});
          return;
        }
        functions.logger.error("FatSecret barcode failed", {
          status: res.status,
          body: errBody,
        });
        response.status(503).json({error: {code: "SERVICE_UNAVAILABLE", message: "Búsqueda por código de barras falló"}});
        return;
      }

      const json = await res.json();
      response.json(json);
    } catch (error: unknown) {
      functions.logger.error("nutritionBarcodeLookup error", error);
      response.status(503).json({error: {code: "SERVICE_UNAVAILABLE", message: "Búsqueda por código de barras falló"}});
    }
  });

// ─── onUserCreated ────────────────────────────────────────────────────────────
// Fires whenever a Firebase Auth user is created (client SDK, Admin SDK, OAuth).
// Creates the Firestore user doc so all downstream reads have a document to work with.
export const onUserCreated = functions.auth.user().onCreate(async (user) => {
  // Allowlisted fields only — never spread the Firebase Auth user object
  const userDoc: Record<string, unknown> = {
    role: "user",
    created_at: admin.firestore.FieldValue.serverTimestamp(),
  };
  if (user.email) userDoc.email = user.email;
  if (user.displayName) userDoc.displayName = user.displayName;

  try {
    await db.collection("users").doc(user.uid).set(userDoc, {merge: true});
    functions.logger.info("onUserCreated: user doc created", {uid: user.uid});
  } catch (err: unknown) {
    functions.logger.error("onUserCreated: failed to create user doc", {
      uid: user.uid,
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

// ─── sendEventConfirmationEmail ────────────────────────────────────────────
// Fires on every new registration and sends an HTML email with the event
// title, a personalised greeting, and a QR code the attendee can use for
// check-in. Requires RESEND_API_KEY secret and the event to have
// settings.confirmation_email set to a "from" address (e.g. "Wake Events
// <events@wakelab.co>").
export const sendEventConfirmationEmail = functions
  .runWith({secrets: ["RESEND_API_KEY"]})
  .firestore.document("event_signups/{eventId}/registrations/{regId}")
  .onCreate(async (snap, context) => {
    const {eventId, regId} = context.params;
    const reg = snap.data() as Record<string, unknown>;

    // Resolve recipient email: V2 stores responses map, V1 has flat email field
    let toEmail: string | null = null;
    if (typeof reg.email === "string" && reg.email) {
      toEmail = reg.email;
    } else if (reg.responses && typeof reg.responses === "object") {
      const responses = reg.responses as Record<string, unknown>;
      const emailVal = Object.entries(responses).find(
        ([k, v]) => k.toLowerCase().includes("email") && typeof v === "string" && (v as string).includes("@")
      );
      if (emailVal) toEmail = emailVal[1] as string;
    }

    if (!toEmail) {
      functions.logger.info("sendEventConfirmationEmail: no email found, skipping", {eventId, regId});
      return null;
    }

    // Load event doc
    const eventSnap = await db.doc(`events/${eventId}`).get();
    if (!eventSnap.exists) {
      functions.logger.warn("sendEventConfirmationEmail: event not found", {eventId});
      return null;
    }
    const event = eventSnap.data() as Record<string, unknown>;

    const eventSettings = event.settings as Record<string, unknown> | undefined;
    if (eventSettings?.send_confirmation_email !== true) {
      functions.logger.info("sendEventConfirmationEmail: email not enabled for this event, skipping", {eventId});
      return null;
    }

    const fromAddress = "Wake Eventos <eventos@wakelab.co>";
    const eventTitle = (event.title as string) ?? "Evento Wake";
    const confirmationMsg = ((event.settings as Record<string, unknown>)?.confirmation_message as string | undefined)
      ?? "¡Tu lugar está confirmado! Nos vemos en el evento.";
    const checkInToken = reg.check_in_token as string | undefined;
    const eventImageUrl = (event.image_url as string | undefined) ?? "";

    // Resolve first name
    let firstName = "";
    if (typeof reg.nombre === "string" && reg.nombre) {
      firstName = reg.nombre.split(" ")[0];
    } else if (reg.responses && typeof reg.responses === "object") {
      const responses = reg.responses as Record<string, unknown>;
      const nameEntry = Object.entries(responses).find(
        ([k]) => k.toLowerCase().includes("nombre") || k.toLowerCase().includes("name")
      );
      if (nameEntry && typeof nameEntry[1] === "string") firstName = (nameEntry[1] as string).split(" ")[0];
    }

    const greeting = firstName ? `¡Hola, ${firstName}!` : "¡Hola!";

    // QR code image URL (api.qrserver.com, no server-side dependency)
    const qrData = checkInToken
      ? encodeURIComponent(JSON.stringify({eventId, token: checkInToken}))
      : encodeURIComponent(regId);
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${qrData}&bgcolor=1a1a1a&color=ffffff&qzone=1`;

    const html = `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#1a1a1a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#fff;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#1a1a1a;padding:40px 0;">
    <tr><td align="center">
      <table width="480" cellpadding="0" cellspacing="0" style="max-width:480px;border-radius:18px;overflow:hidden;border:1px solid rgba(255,255,255,0.08);">

        <!-- Hero: background image with dark gradient overlay -->
        <tr>
          <td align="center" background="${eventImageUrl}" style="background-color:#1a1a1a;${eventImageUrl ? `background-image:url('${eventImageUrl}');background-size:cover;background-position:center top;` : ""}padding:0;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr><td style="background:linear-gradient(to bottom,rgba(10,10,10,0.55) 0%,rgba(10,10,10,0.80) 100%);padding:52px 36px 44px;text-align:center;">
                <p style="margin:0 0 18px;font-size:0.7rem;letter-spacing:0.14em;text-transform:uppercase;color:rgba(255,255,255,0.5);">Wake Eventos</p>
                <h1 style="margin:0 0 10px;font-size:1.75rem;font-weight:800;color:#fff;line-height:1.2;">${greeting}</h1>
                <p style="margin:0;font-size:1rem;color:rgba(255,255,255,0.78);line-height:1.55;">${confirmationMsg}</p>
              </td></tr>
            </table>
          </td>
        </tr>

        <!-- Body -->
        <tr><td style="background:#1e1e1e;padding:32px 36px 28px;text-align:center;">
          <div style="background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.09);border-radius:14px;padding:18px 24px;margin-bottom:${checkInToken ? "28px" : "0"};">
            <p style="margin:0 0 4px;font-size:0.7rem;text-transform:uppercase;letter-spacing:0.1em;color:rgba(255,255,255,0.35);">Evento</p>
            <p style="margin:0;font-size:1.1rem;font-weight:700;color:#fff;">${eventTitle}</p>
          </div>
          ${checkInToken ? `
          <p style="margin:0 0 14px;font-size:0.85rem;color:rgba(255,255,255,0.45);">Muestra este código QR en la entrada</p>
          <img src="${qrUrl}" alt="QR Check-in" width="180" height="180" style="border-radius:12px;display:block;margin:0 auto;" />
          ` : ""}
        </td></tr>

        <!-- Footer -->
        <tr><td style="background:#1e1e1e;padding:16px 36px 28px;text-align:center;border-top:1px solid rgba(255,255,255,0.06);">
          <p style="margin:0;font-size:0.75rem;color:rgba(255,255,255,0.22);">Enviado automáticamente por Wake · <a href="https://wakelab.co" style="color:rgba(255,255,255,0.22);text-decoration:none;">wakelab.co</a></p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

    try {
      const resend = new Resend(resendApiKey.value());
      const {error: resendError} = await resend.emails.send({
        from: fromAddress,
        to: toEmail,
        subject: `Confirmación: ${eventTitle}`,
        html,
        headers: {
          "List-Unsubscribe": "<mailto:eventos@wakelab.co?subject=unsubscribe>",
          "X-Entity-Ref-ID": `${eventId}-${regId}`,
        },
      });
      if (resendError) {
        functions.logger.error("sendEventConfirmationEmail: resend error", {eventId, regId, error: resendError});
      } else {
        functions.logger.info("sendEventConfirmationEmail: sent", {eventId, regId, toEmail});
      }
    } catch (err: unknown) {
      functions.logger.error("sendEventConfirmationEmail: failed", {eventId, regId, error: toErrorMessage(err)});
    }

    return null;
  });
