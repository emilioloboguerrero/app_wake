/**
 * Firebase Cloud Functions v1
 */

import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import * as crypto from "node:crypto";
import type {Request, Response} from "express";
import {MercadoPagoConfig, Preference, Payment, PreApproval} from "mercadopago";
import {Resend} from "resend";
import swaggerUi from "swagger-ui-express";
import { generateOpenApiSpec } from "./openapi";

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

const ALLOWED_ORIGINS = [
  "https://wolf-20b8b.web.app",
  "https://wolf-20b8b.firebaseapp.com",
  "http://localhost:3000",
  "http://localhost:5173",
  "http://localhost:8080",
  "http://localhost:19006",
];

function setCorsHeaders(req: { headers: { origin?: string } }, res: { set: (k: string, v: string) => void }): void {
  const origin = req.headers.origin ?? "";
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.set("Access-Control-Allow-Origin", origin);
  }
  res.set("Vary", "Origin");
}

const gen1RateStore = new Map<string, { count: number; resetAt: number }>();
class Gen1RateLimitError extends Error {
  readonly statusCode = 429;
  constructor() { super("Too many requests"); }
}
function checkGen1RateLimit(key: string, maxPerMinute: number): void {
  const now = Date.now();
  const entry = gen1RateStore.get(key);
  if (!entry || now > entry.resetAt) {
    gen1RateStore.set(key, { count: 1, resetAt: now + 60_000 });
    return;
  }
  entry.count++;
  if (entry.count > maxPerMinute) {
    throw new Gen1RateLimitError();
  }
}

async function verifyGen1Auth(request: Request): Promise<string | null> {
  const header = request.headers.authorization;
  if (!header?.startsWith("Bearer ")) return null;
  try {
    const decoded = await admin.auth().verifyIdToken(header.slice(7));
    return decoded.uid;
  } catch {
    return null;
  }
}

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
    throw error;
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
    setCorsHeaders(request, response);
    response.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    response.set("Access-Control-Allow-Headers", "Content-Type, Authorization");

    if (request.method === "OPTIONS") {
      response.status(204).send("");
      return;
    }

    const userId = await verifyGen1Auth(request);
    if (!userId) {
      response.status(401).json({ error: { code: "UNAUTHENTICATED", message: "Autenticación requerida" } });
      return;
    }

    try {
      checkGen1RateLimit(`createPaymentPreference_${userId}`, 10);
      const {courseId} = request.body;
      if (!courseId || typeof courseId !== "string" || courseId.length > 128) {
        response.status(400).json({ error: { code: "VALIDATION_ERROR", message: "courseId inválido" } });
        return;
      }

      // Get course
      const courseDoc = await db.collection("courses").doc(courseId).get();
      const course = courseDoc.data();

      if (!course) {
        response.status(404).json({ error: { code: "NOT_FOUND", message: "Course not found" } });
        return;
      }

      const externalReference = buildExternalReference(userId, courseId, "otp");

      // Create preference
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

      response.json({ data: { init_point: result.init_point } });
    } catch (error: unknown) {
      if (error instanceof Gen1RateLimitError) {
        response.status(429).json({ error: { code: "RATE_LIMITED", message: "Demasiadas solicitudes. Intenta de nuevo en un momento." } });
        return;
      }
      functions.logger.error("createPaymentPreference error", error);
      response.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Error al crear la preferencia de pago" } });
    }
  });

// Create subscription dynamically (without pre-created plan)
export const createSubscriptionCheckout = functions
  .runWith({secrets: [mercadopagoAccessToken]})
  .https.onRequest(async (request, response) => {
    setCorsHeaders(request, response);
    response.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    response.set("Access-Control-Allow-Headers", "Content-Type, Authorization");

    if (request.method === "OPTIONS") {
      response.status(204).send("");
      return;
    }

    const userId = await verifyGen1Auth(request);
    if (!userId) {
      response.status(401).json({ error: { code: "UNAUTHENTICATED", message: "Autenticación requerida" } });
      return;
    }

    try {
      checkGen1RateLimit(`createSubscriptionCheckout_${userId}`, 10);
      const {courseId, payer_email: payerEmail} = request.body;
      if (!courseId || typeof courseId !== "string" || courseId.length > 128) {
        response.status(400).json({ error: { code: "VALIDATION_ERROR", message: "courseId inválido" } });
        return;
      }

      if (!payerEmail) {
        response.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Payer email is required for subscriptions" } });
        return;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payerEmail)) {
        response.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Formato de email inválido" } });
        return;
      }

      const courseDoc = await db.collection("courses").doc(courseId).get();
      const course = courseDoc.data();

      if (!course) {
        response.status(404).json({ error: { code: "NOT_FOUND", message: "Course not found" } });
        return;
      }

      if (!course.price) {
        response.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Course price not found" } });
        return;
      }

      const userDoc = await db.collection("users").doc(userId).get();
      const user = userDoc.data();

      if (!user) {
        response.status(404).json({ error: { code: "NOT_FOUND", message: "User not found" } });
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
            created_at: FieldValue.serverTimestamp(),
            updated_at: FieldValue.serverTimestamp(),
          },
          {merge: true}
        );

        response.json({ data: { init_point: result.init_point, subscription_id: result.id } });
        return;
      }

      functions.logger.error("PreApproval API did not return init_point");
      response.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Failed to create subscription checkout URL" } });
    } catch (error: unknown) {
      if (error instanceof Gen1RateLimitError) {
        response.status(429).json({ error: { code: "RATE_LIMITED", message: "Demasiadas solicitudes. Intenta de nuevo en un momento." } });
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
        response.status(409).json({ error: { code: "CONFLICT", message: "Por favor ingresa tu correo de Mercado Pago", requireAlternateEmail: true } });
        return;
      }

      response.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Error al crear la suscripción" } });
    }
  });

// Webhook handler - processes payment and assigns courses to users
export const processPaymentWebhook = functions
  .runWith({secrets: [mercadopagoWebhookSecret, mercadopagoAccessToken]})
  .https.onRequest(async (request: Request, response: Response) => {
    setCorsHeaders(request, response);
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
            updated_at: FieldValue.serverTimestamp(),
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
            updateData.cancelled_at = FieldValue.serverTimestamp();
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
            processed_at: FieldValue.serverTimestamp(),
            status: "error",
            error_type: "payment_fetch_failed",
            error_message: errorMessage,
          });
          response.status(200).send("OK");
        }
        return;
      }

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
          processed_at: FieldValue.serverTimestamp(),
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
            processed_at: FieldValue.serverTimestamp(),
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
          processed_at: FieldValue.serverTimestamp(),
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
          processed_at: FieldValue.serverTimestamp(),
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
          processed_at: FieldValue.serverTimestamp(),
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
          processed_at: FieldValue.serverTimestamp(),
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

        // Update existing course + subscription + idempotency key atomically
        const userRef = db.collection("users").doc(userId);
        const subscriptionId =
          paymentData.subscription_id || paymentData.preapproval_id;

        await db.runTransaction(async (tx) => {
          tx.update(userRef, {
            [`courses.${courseId}.expires_at`]: expirationDate,
            [`courses.${courseId}.status`]: "active",
          });
          if (isSubscription && subscriptionId) {
            tx.set(
              db.collection("users").doc(userId).collection("subscriptions").doc(subscriptionId),
              {
                status: "authorized",
                last_payment_id: paymentId,
                last_payment_date:
                  paymentData.date_approved ||
                  paymentData.date_created ||
                  new Date().toISOString(),
                updated_at: FieldValue.serverTimestamp(),
              },
              { merge: true }
            );
          }
          tx.set(processedPaymentsRef, {
            processed_at: FieldValue.serverTimestamp(),
            status: "approved",
            userId,
            courseId,
            isSubscription: true,
            isRenewal: true,
            payment_type: paymentType,
            userEmail,
            userName,
            courseTitle,
            state: "completed",
          });
        });

        functions.logger.info("✅ Subscription renewed successfully:", paymentId, "New expiration:", expirationDate);
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
          processed_at: FieldValue.serverTimestamp(),
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
          processed_at: FieldValue.serverTimestamp(),
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
              updated_at: FieldValue.serverTimestamp(),
            },
            {merge: true}
          );
        }

        // Mark payment as processed (atomic write)
        transaction.set(
          processedPaymentsRef,
          {
            processed_at: FieldValue.serverTimestamp(),
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
            processed_at: FieldValue.serverTimestamp(),
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
    setCorsHeaders(request, response);
    response.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    response.set("Access-Control-Allow-Headers", "Content-Type, Authorization");

    if (request.method === "OPTIONS") {
      response.status(204).send("");
      return;
    }

    if (request.method !== "POST") {
      response.status(405).json({ error: { code: "VALIDATION_ERROR", message: "Method not allowed" } });
      return;
    }

    const userId = await verifyGen1Auth(request);
    if (!userId) {
      response.status(401).json({ error: { code: "UNAUTHENTICATED", message: "Autenticación requerida" } });
      return;
    }

    try {
      checkGen1RateLimit(`updateSubscriptionStatus_${userId}`, 10);
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

      if (!subscriptionId || !action) {
        response.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Missing subscriptionId or action" } });
        return;
      }

      const actionToStatus: Record<string, string> = {
        cancel: "cancelled",
        pause: "paused",
        resume: "authorized",
      };

      const targetStatus = actionToStatus[action];

      if (!targetStatus) {
        response.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Unsupported action" } });
        return;
      }

      const subscriptionRef = db
        .collection("users")
        .doc(userId)
        .collection("subscriptions")
        .doc(subscriptionId);

      const subscriptionDoc = await subscriptionRef.get();

      if (!subscriptionDoc.exists) {
        response.status(404).json({ error: { code: "NOT_FOUND", message: "Subscription not found for user" } });
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
        updated_at: FieldValue.serverTimestamp(),
      };

      if (targetStatus === "cancelled") {
        updateData.cancelled_at = FieldValue.serverTimestamp();
      } else if (targetStatus === "authorized") {
        updateData.cancelled_at = FieldValue.delete();
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
            submittedAt: FieldValue.serverTimestamp(),
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

      response.json({ data: { status: targetStatus } });
    } catch (error: unknown) {
      if (error instanceof Gen1RateLimitError) {
        response.status(429).json({ error: { code: "RATE_LIMITED", message: "Demasiadas solicitudes. Intenta de nuevo en un momento." } });
        return;
      }
      functions.logger.error("Error updating subscription status:", error);
      response.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Error al actualizar el estado de la suscripción" } });
    }
  });

// ============================================
// NUTRITION (FatSecret proxy) — Step 2
// ============================================
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

// ─── Auth: user document bootstrap ───────────────────────────────────────────
// Fires whenever a Firebase Auth user is created (client SDK, Admin SDK, OAuth).
// Creates the Firestore user doc so all downstream reads have a document to work with.

export const onUserCreated = functions.auth.user().onCreate(async (user) => {
  try {
    const data: Record<string, unknown> = {
      role: "user",
      created_at: FieldValue.serverTimestamp(),
    };
    if (user.email) data.email = user.email;
    if (user.displayName) data.displayName = user.displayName;
    await db.collection("users").doc(user.uid).set(data, { merge: true });
    functions.logger.info("onUserCreated: user doc created", { uid: user.uid });
  } catch (err: unknown) {
    functions.logger.error("onUserCreated: failed to create user doc", {
      uid: user.uid,
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// Gen2 Express API
// ═══════════════════════════════════════════════════════════════════════════════

import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import express from "express";

const firebaseApiKey = defineSecret("WAKE_WEB_API_KEY");

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// ─── Path normalization ───────────────────────────────────────────────────────
// Firebase Hosting rewrites preserve the full path (e.g. /api/v1/api-keys).
// The Functions emulator strips the function name, so Express receives /v1/...
// This middleware re-adds /api so routes resolve identically in both environments.
app.use((req, _res, next) => {
  if (!req.url.startsWith("/api/")) req.url = "/api" + req.url;
  next();
});

// ─── CORS ────────────────────────────────────────────────────────────────────

app.use((req, res, next) => {
  const origin = req.headers.origin ?? "";
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,PUT,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Authorization,Content-Type,X-Wake-Client,X-Firebase-AppCheck");
  if (req.method === "OPTIONS") { res.status(204).end(); return; }
  next();
});

app.use("/api/v1/docs", swaggerUi.serve);
app.get("/api/v1/docs", swaggerUi.setup(generateOpenApiSpec()));

// ─── Error helpers ───────────────────────────────────────────────────────────

class WakeApiServerError extends Error {
  status: number;
  code: string;
  field?: string;
  retryAfter?: number;
  constructor(code: string, message: string, status: number, field?: string) {
    super(message);
    this.code = code;
    this.status = status;
    this.field = field;
  }
}

function apiError(code: string, message: string, status: number, field?: string): WakeApiServerError {
  return new WakeApiServerError(code, message, status, field);
}

// ─── Rate limiting ────────────────────────────────────────────────────────────

async function checkRateLimit(
  id: string,
  limitRpm: number,
  collection: "rate_limit_windows" | "rate_limit_first_party" = "rate_limit_windows"
): Promise<void> {
  const windowMinute = Math.floor(Date.now() / 60000);
  const docId = `${id}_${windowMinute}`;
  const ref = db.collection(collection).doc(docId);
  const secondsUntilReset = 60 - (Date.now() / 1000 % 60);
  await db.runTransaction(async (tx) => {
    const doc = await tx.get(ref);
    const count = doc.exists ? (doc.data()?.count ?? 0) : 0;
    if (count >= limitRpm) {
      const err = apiError("RATE_LIMITED", "Rate limit exceeded", 429);
      err.retryAfter = Math.ceil(secondsUntilReset);
      throw err;
    }
    tx.set(ref, { count: count + 1, expires_at: windowMinute + 2 }, { merge: true });
  });
}

// ─── Auth middleware ──────────────────────────────────────────────────────────

interface AuthResult {
  userId: string;
  role: string;
  authType: "firebase" | "apikey";
}

async function validateAuth(req: express.Request): Promise<AuthResult> {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    throw apiError("UNAUTHENTICATED", "Missing Authorization header", 401);
  }
  const token = header.slice(7);

  if (token.startsWith("wk_live_") || token.startsWith("wk_test_")) {
    const hash = crypto.createHash("sha256").update(token).digest("hex");
    const snap = await db.collection("api_keys")
      .where("key_hash", "==", hash)
      .where("revoked", "==", false)
      .limit(1)
      .get();
    if (snap.empty) throw apiError("UNAUTHENTICATED", "Invalid or revoked API key", 401);
    const keyDoc = snap.docs[0];
    const keyData = keyDoc.data();
    keyDoc.ref.update({ last_used_at: FieldValue.serverTimestamp() }).catch((e: unknown) => {
      functions.logger.warn("validateAuth: failed to update last_used_at", { error: e instanceof Error ? e.message : String(e) });
    });
    await checkRateLimit(keyDoc.id, keyData.rate_limit_rpm ?? 60);
    const userDoc = await db.collection("users").doc(keyData.owner_id).get();
    return { userId: keyData.owner_id, role: userDoc.data()?.role ?? "user", authType: "apikey" };
  }

  try {
    const decoded = await admin.auth().verifyIdToken(token, true);
    const userDoc = await db.collection("users").doc(decoded.uid).get();
    await checkRateLimit(`user_${decoded.uid}`, 200, "rate_limit_first_party");
    return { userId: decoded.uid, role: userDoc.data()?.role ?? "user", authType: "firebase" };
  } catch (err) {
    if (err instanceof WakeApiServerError) throw err;
    throw apiError("UNAUTHENTICATED", "Invalid or expired token", 401);
  }
}

// ─── Body validation ──────────────────────────────────────────────────────────

type FieldType = "string" | "number" | "boolean" | "array" | "object" |
  "optional_string" | "optional_number" | "optional_boolean" | "optional_array" | "optional_object";

function validateBody<T>(schema: Record<string, FieldType>, body: unknown): T {
  if (typeof body !== "object" || body === null) {
    throw apiError("VALIDATION_ERROR", "Request body must be a JSON object", 400);
  }
  const b = body as Record<string, unknown>;
  for (const [field, type] of Object.entries(schema)) {
    const optional = type.startsWith("optional_");
    const baseType = optional ? type.replace("optional_", "") : type;
    if (optional && (b[field] === undefined || b[field] === null)) continue;
    if (b[field] === undefined) {
      throw apiError("VALIDATION_ERROR", `Missing required field '${field}'`, 400, field);
    }
    if (baseType === "array" && !Array.isArray(b[field])) {
      throw apiError("VALIDATION_ERROR", `Field '${field}' must be an array`, 400, field);
    } else if (baseType !== "array" && typeof b[field] !== baseType) {
      throw apiError("VALIDATION_ERROR", `Field '${field}' must be a ${baseType}`, 400, field);
    }
  }
  return b as T;
}

// ─── Routes: Health ───────────────────────────────────────────────────────────

app.get("/api/v1/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ─── Routes: Auth ─────────────────────────────────────────────────────────────

app.post("/api/v1/auth/signup", async (req, res, next) => {
  try {
    const body = validateBody<{ email: string; password: string; displayName?: string }>(
      { email: "string", password: "string", displayName: "optional_string" },
      req.body
    );
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email.trim())) {
      throw apiError("VALIDATION_ERROR", "Formato de email inválido", 400, "email");
    }
    if (body.password.length < 8) {
      throw apiError("VALIDATION_ERROR", "La contraseña debe tener al menos 8 caracteres", 400, "password");
    }
    await checkRateLimit(`auth_signup_${body.email.trim().toLowerCase()}`, 5);
    const userRecord = await admin.auth().createUser({
      email: body.email,
      password: body.password,
      displayName: body.displayName,
    });
    await db.collection("users").doc(userRecord.uid).set({
      email: body.email,
      displayName: body.displayName ?? "",
      role: "user",
      created_at: FieldValue.serverTimestamp(),
    });
    const signInRes = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${firebaseApiKey.value()}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: body.email, password: body.password, returnSecureToken: true }),
      }
    );
    const signInData = await signInRes.json() as { idToken?: string; error?: { message: string } };
    if (!signInData.idToken) throw apiError("INTERNAL_ERROR", "Failed to sign in after signup", 500);
    res.status(201).json({ userId: userRecord.uid, token: signInData.idToken });
  } catch (err) { next(err); }
});

app.post("/api/v1/auth/login", async (req, res, next) => {
  try {
    const body = validateBody<{ email: string; password: string }>(
      { email: "string", password: "string" },
      req.body
    );
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email.trim())) {
      throw apiError("VALIDATION_ERROR", "Formato de email inválido", 400, "email");
    }
    await checkRateLimit(`auth_login_${body.email.trim().toLowerCase()}`, 10);
    const signInRes = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${firebaseApiKey.value()}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: body.email, password: body.password, returnSecureToken: true }),
      }
    );
    const signInData = await signInRes.json() as { idToken?: string; error?: { message: string } };
    if (!signInData.idToken) throw apiError("UNAUTHENTICATED", "Invalid email or password", 401);
    res.json({ token: signInData.idToken });
  } catch (err) { next(err); }
});

app.get("/api/v1/auth/me", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    const userDoc = await db.collection("users").doc(auth.userId).get();
    const d = userDoc.data();
    res.json({
      data: {
        uid: auth.userId,
        email: d?.email ?? null,
        displayName: d?.displayName ?? d?.name ?? null,
        role: auth.role,
        photoURL: d?.photoURL ?? d?.profilePictureUrl ?? null,
      },
    });
  } catch (err) { next(err); }
});

app.post("/api/v1/auth/logout", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    await admin.auth().revokeRefreshTokens(auth.userId);
    res.status(204).end();
  } catch (err) { next(err); }
});

// ─── Routes: API Keys ─────────────────────────────────────────────────────────

app.get("/api/v1/api-keys", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    if (auth.role !== "creator" && auth.role !== "admin") {
      throw apiError("FORBIDDEN", "Only creators can manage API keys", 403);
    }
    const snap = await db.collection("api_keys")
      .where("owner_id", "==", auth.userId)
      .where("revoked", "==", false)
      .orderBy("createdAt", "desc")
      .get();
    const keys = snap.docs.map((d) => {
      const data = d.data();
      return {
        keyId: d.id,
        keyPrefix: data.key_prefix,
        name: data.name,
        scopes: data.scopes,
        createdAt: data.created_at?.toDate().toISOString() ?? null,
        lastUsedAt: data.last_used_at?.toDate().toISOString() ?? null,
        rateLimitRpm: data.rate_limit_rpm ?? 60,
      };
    });
    res.json({ data: keys });
  } catch (err) { next(err); }
});

app.post("/api/v1/api-keys", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    if (auth.role !== "creator" && auth.role !== "admin") {
      throw apiError("FORBIDDEN", "Only creators can manage API keys", 403);
    }
    const body = validateBody<{ name: string; scopes: string[] }>(
      { name: "string", scopes: "array" },
      req.body
    );
    const validScopes = ["read", "write"];
    const scopes = (body.scopes as string[]).filter(s => validScopes.includes(s));
    if (scopes.length === 0) {
      throw apiError("VALIDATION_ERROR", "At least one valid scope (read, write) is required", 400, "scopes");
    }
    const rawKey = `wk_live_${crypto.randomBytes(32).toString("hex")}`;
    const hash = crypto.createHash("sha256").update(rawKey).digest("hex");
    const keyPrefix = rawKey.slice(0, 16);
    const docRef = db.collection("api_keys").doc();
    await docRef.set({
      key_prefix: keyPrefix,
      key_hash: hash,
      owner_id: auth.userId,
      scopes,
      name: body.name,
      created_at: FieldValue.serverTimestamp(),
      last_used_at: null,
      revoked: false,
      revoked_at: null,
      rate_limit_rpm: 60,
    });
    res.status(201).json({ keyId: docRef.id, key: rawKey, name: body.name, scopes });
  } catch (err) { next(err); }
});

app.delete("/api/v1/api-keys/:keyId", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    if (auth.role !== "creator" && auth.role !== "admin") {
      throw apiError("FORBIDDEN", "Only creators can manage API keys", 403);
    }
    const keyDoc = await db.collection("api_keys").doc(req.params.keyId).get();
    if (!keyDoc.exists) throw apiError("NOT_FOUND", "API key not found", 404);
    if (keyDoc.data()?.owner_id !== auth.userId) throw apiError("FORBIDDEN", "Not your API key", 403);
    await keyDoc.ref.update({
      revoked: true,
      revoked_at: FieldValue.serverTimestamp(),
    });
    res.status(204).end();
  } catch (err) { next(err); }
});

// ─── Profile ──────────────────────────────────────────────────────────────────

app.get("/api/v1/users/me", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    const userDoc = await db.collection("users").doc(auth.userId).get();
    if (!userDoc.exists) throw apiError("NOT_FOUND", "User not found", 404);
    const d = userDoc.data()!;

    let birthDate: string | null = null;
    if (d.birthDate) {
      const bd = d.birthDate.toDate ? d.birthDate.toDate() : new Date(d.birthDate);
      birthDate = bd.toISOString().split("T")[0];
    }

    res.json({
      data: {
        id: auth.userId,
        userId: auth.userId,
        email: d.email ?? null,
        role: auth.role,
        displayName: d.displayName ?? d.name ?? null,
        username: d.username ?? null,
        gender: d.gender ?? null,
        city: d.city ?? d.location ?? null,
        country: d.country ?? null,
        height: d.height ?? null,
        weight: d.weight ?? d.bodyweight ?? null,
        birthDate,
        birthdate: birthDate,
        photoURL: d.photoURL ?? d.profilePictureUrl ?? null,
        profilePictureUrl: d.profilePictureUrl ?? d.photoURL ?? null,
        phoneNumber: d.phoneNumber ?? null,
        phone: d.phone ?? d.phoneNumber ?? null,
        pinnedTrainingCourseId: d.pinnedTrainingCourseId ?? null,
        pinnedNutritionAssignmentId: d.pinnedNutritionAssignmentId ?? null,
        profileCompleted: d.profileCompleted ?? false,
        onboardingCompleted: d.onboardingCompleted ?? false,
        webOnboardingCompleted: d.webOnboardingCompleted ?? false,
        createdAt: d.created_at?.toDate().toISOString() ?? new Date().toISOString(),
        goalWeight: d.goalWeight ?? null,
        weightUnit: d.weightUnit ?? "kg",
        oneRepMaxEstimates: d.oneRepMaxEstimates ?? null,
        weeklyMuscleVolume: d.weeklyMuscleVolume ?? null,
        courses: d.courses ?? null,
        onboardingData: d.onboardingData ?? null,
        generalTutorials: d.generalTutorials ?? null,
        activityStreak: d.activityStreak ?? null,
      },
    });
  } catch (err) { next(err); }
});

app.patch("/api/v1/users/me", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    const body = validateBody<{
      displayName?: string;
      username?: string;
      gender?: string;
      city?: string;
      country?: string;
      height?: number;
      weight?: number;
      bodyweight?: number;
      birthDate?: string;
      phoneNumber?: string;
      profileCompleted?: boolean;
      onboardingCompleted?: boolean;
      webOnboardingCompleted?: boolean;
    }>({
      displayName: "optional_string",
      username: "optional_string",
      gender: "optional_string",
      city: "optional_string",
      country: "optional_string",
      height: "optional_number",
      weight: "optional_number",
      bodyweight: "optional_number",
      goalWeight: "optional_number",
      birthDate: "optional_string",
      phoneNumber: "optional_string",
      profileCompleted: "optional_boolean",
      onboardingCompleted: "optional_boolean",
      webOnboardingCompleted: "optional_boolean",
      weightUnit: "optional_string",
    }, req.body);

    if (body.username !== undefined) {
      const existing = await db.collection("users")
        .where("username", "==", body.username.toLowerCase())
        .limit(1)
        .get();
      if (!existing.empty && existing.docs[0].id !== auth.userId) {
        throw apiError("CONFLICT", "Username already taken", 409, "username");
      }
    }

    const update: Record<string, unknown> = { updated_at: FieldValue.serverTimestamp() };
    if (body.displayName !== undefined) update.displayName = body.displayName;
    if (body.username !== undefined) update.username = body.username.toLowerCase();
    if (body.gender !== undefined) update.gender = body.gender;
    if (body.city !== undefined) update.city = body.city;
    if (body.country !== undefined) update.country = body.country;
    if (body.height !== undefined) update.height = body.height;
    if (body.weight !== undefined) update.weight = body.weight;
    else if (body.bodyweight !== undefined) update.weight = body.bodyweight;
    if ((body as Record<string, unknown>).goalWeight !== undefined) update.goalWeight = (body as Record<string, unknown>).goalWeight;
    if (body.phoneNumber !== undefined) update.phoneNumber = body.phoneNumber;
    if ((body as Record<string, unknown>).weightUnit !== undefined) update.weightUnit = (body as Record<string, unknown>).weightUnit;
    if (body.profileCompleted !== undefined) update.profileCompleted = body.profileCompleted;
    if (body.onboardingCompleted !== undefined) update.onboardingCompleted = body.onboardingCompleted;
    if (body.webOnboardingCompleted !== undefined) update.webOnboardingCompleted = body.webOnboardingCompleted;
    const rb = req.body as Record<string, unknown>;
    if ("onboardingData" in rb && rb.onboardingData !== null && typeof rb.onboardingData === "object") update.onboardingData = rb.onboardingData;
    if ("webOnboardingData" in rb && rb.webOnboardingData !== null && typeof rb.webOnboardingData === "object") update.webOnboardingData = rb.webOnboardingData;
    if (body.birthDate !== undefined) {
      const d = new Date(body.birthDate);
      if (isNaN(d.getTime())) throw apiError("VALIDATION_ERROR", "Invalid birthDate format", 400, "birthDate");
      update.birthDate = d;
    }

    const rawBody = req.body as Record<string, unknown>;
    if ("pinnedTrainingCourseId" in rawBody) {
      const v = rawBody.pinnedTrainingCourseId;
      if (v !== null && typeof v !== "string") throw apiError("VALIDATION_ERROR", "pinnedTrainingCourseId must be string or null", 400, "pinnedTrainingCourseId");
      update.pinnedTrainingCourseId = v ?? null;
    }
    if ("pinnedNutritionAssignmentId" in rawBody) {
      const v = rawBody.pinnedNutritionAssignmentId;
      if (v !== null && typeof v !== "string") throw apiError("VALIDATION_ERROR", "pinnedNutritionAssignmentId must be string or null", 400, "pinnedNutritionAssignmentId");
      update.pinnedNutritionAssignmentId = v ?? null;
    }

    if ("generalTutorials" in rawBody && rawBody.generalTutorials !== null && typeof rawBody.generalTutorials === "object") {
      update.generalTutorials = rawBody.generalTutorials;
    }

    if ("courseProgress" in rawBody && rawBody.courseProgress !== null && typeof rawBody.courseProgress === "object") {
      const userDocForProgress = await db.collection("users").doc(auth.userId).get();
      const enrolledForProgress = (userDocForProgress.data()?.courses as Record<string, unknown> | undefined) ?? {};
      const cp = rawBody.courseProgress as Record<string, unknown>;
      for (const [courseId, progressVal] of Object.entries(cp)) {
        if (!Object.prototype.hasOwnProperty.call(enrolledForProgress, courseId)) continue;
        update[`courseProgress.${courseId}`] = progressVal;
      }
    }

    if ("courses" in rawBody && rawBody.courses !== null && typeof rawBody.courses === "object") {
      const userDocForCourses = await db.collection("users").doc(auth.userId).get();
      const enrolledForCourses = (userDocForCourses.data()?.courses as Record<string, unknown> | undefined) ?? {};
      const coursesMap = rawBody.courses as Record<string, unknown>;
      for (const [courseId, courseVal] of Object.entries(coursesMap)) {
        if (!Object.prototype.hasOwnProperty.call(enrolledForCourses, courseId)) continue;
        if (courseVal !== null && typeof courseVal === "object") {
          const cv = courseVal as Record<string, unknown>;
          if ("completedTutorials" in cv) {
            update[`courses.${courseId}.completedTutorials`] = cv.completedTutorials;
          } else {
            update[`courses.${courseId}`] = courseVal;
          }
        }
      }
    }

    if (body.displayName !== undefined) {
      admin.auth().updateUser(auth.userId, { displayName: body.displayName }).catch((e: unknown) => {
        functions.logger.warn("PATCH /users/me: auth().updateUser skipped (non-fatal)", { error: e instanceof Error ? e.message : String(e) });
      });
    }

    await db.collection("users").doc(auth.userId).update(update);
    res.json({ data: { userId: auth.userId, updatedAt: new Date().toISOString() } });
  } catch (err) { next(err); }
});

app.get("/api/v1/users/me/username-check", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    const username = req.query.username as string | undefined;
    if (!username) throw apiError("VALIDATION_ERROR", "username es requerido", 400, "username");
    const snap = await db.collection("users").where("username", "==", username.toLowerCase()).limit(2).get();
    const takenByOther = snap.docs.some((d) => d.id !== auth.userId);
    res.json({ data: { available: !takenByOther } });
  } catch (err) { next(err); }
});

app.get("/api/v1/users/me/tutorials", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    const { screenName, programId } = req.query as Record<string, string | undefined>;
    if (!screenName) throw apiError("VALIDATION_ERROR", "screenName es requerido", 400, "screenName");

    const userDoc = await db.collection("users").doc(auth.userId).get();
    const userData = userDoc.data() as Record<string, unknown> | undefined;

    let tutorials: Array<{ videoUrl: string }> = [];
    if (programId) {
      const programDoc = await db.collection("courses").doc(programId).get();
      const programData = programDoc.data() as Record<string, unknown> | undefined;
      const screenTutorials = ((programData?.tutorials as Record<string, unknown> | undefined)?.[screenName] as string[] | undefined) ?? [];
      const completedMap = ((userData?.courses as Record<string, unknown> | undefined)?.[programId] as Record<string, unknown> | undefined)?.completedTutorials as Record<string, string[]> | undefined;
      const completed = completedMap?.[screenName] ?? [];
      tutorials = screenTutorials.filter((url: string) => url && url.trim() && !completed.includes(url)).map((url: string) => ({ videoUrl: url }));
    } else if (!(userData?.generalTutorials as Record<string, unknown> | undefined)?.[screenName]) {
      const tutorialsDoc = await db.collection("app_resources").doc("tutorials").get();
      const screenTutorials = ((tutorialsDoc.data()?.general as Record<string, unknown> | undefined)?.[screenName] as string[] | undefined) ?? [];
      tutorials = screenTutorials.filter((url: string) => url && url.trim()).map((url: string) => ({ videoUrl: url }));
    }
    res.json({ data: tutorials });
  } catch (err) { next(err); }
});

app.post("/api/v1/users/me/tutorials/complete", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    const { screenName, videoUrl, programId } = req.body as { screenName?: string; videoUrl?: string; programId?: string };
    if (!screenName) throw apiError("VALIDATION_ERROR", "screenName es requerido", 400, "screenName");
    if (!videoUrl) throw apiError("VALIDATION_ERROR", "videoUrl es requerido", 400, "videoUrl");

    const userRef = db.collection("users").doc(auth.userId);
    if (programId) {
      const userDoc = await userRef.get();
      const courses = (userDoc.data()?.courses as Record<string, unknown> | undefined) ?? {};
      if (!Object.prototype.hasOwnProperty.call(courses, programId)) {
        throw apiError("FORBIDDEN", "No tienes acceso a este programa", 403, "programId");
      }
      await userRef.update({ [`courses.${programId}.completedTutorials.${screenName}`]: FieldValue.arrayUnion(videoUrl) });
    } else {
      await userRef.update({ [`generalTutorials.${screenName}`]: true });
    }
    res.json({ data: { success: true } });
  } catch (err) { next(err); }
});

app.post("/api/v1/users/me/profile-picture/upload-url", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    const body = validateBody<{ contentType: string }>({ contentType: "string" }, req.body);

    const allowed = ["image/jpeg", "image/png", "image/webp"];
    if (!allowed.includes(body.contentType)) {
      throw apiError("VALIDATION_ERROR", "contentType must be image/jpeg, image/png, or image/webp", 400, "contentType");
    }

    const storagePath = `profiles/${auth.userId}/profile.jpg`;
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    let uploadUrl: string;
    try {
      [uploadUrl] = await admin.storage().bucket().file(storagePath).getSignedUrl({
        version: "v4",
        action: "write",
        expires: expiresAt,
        contentType: body.contentType,
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      functions.logger.error("getSignedUrl failed — missing ADC? Run: gcloud auth application-default login", { error: msg });
      throw apiError("INTERNAL_ERROR", "Storage signing failed", 500);
    }

    res.json({ data: { uploadUrl, storagePath, expiresAt: expiresAt.toISOString() } });
  } catch (err) { next(err); }
});

app.post("/api/v1/users/me/profile-picture/confirm", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    const body = validateBody<{ storagePath: string }>({ storagePath: "string" }, req.body);

    if (!body.storagePath.startsWith(`profiles/${auth.userId}/`)) {
      throw apiError("FORBIDDEN", "Storage path does not belong to this user", 403);
    }

    const file = admin.storage().bucket().file(body.storagePath);
    const [exists] = await file.exists();
    if (!exists) throw apiError("NOT_FOUND", "File not found in storage", 404);

    const downloadToken = crypto.randomUUID();
    await file.setMetadata({ metadata: { firebaseStorageDownloadTokens: downloadToken } });

    const bucketName = admin.storage().bucket().name;
    const encodedPath = encodeURIComponent(body.storagePath);
    const profilePictureUrl = `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodedPath}?alt=media&token=${downloadToken}`;

    admin.auth().updateUser(auth.userId, { photoURL: profilePictureUrl }).catch((e: unknown) => {
      functions.logger.warn("confirm profile-picture: auth().updateUser skipped (non-fatal)", { error: e instanceof Error ? e.message : String(e) });
    });
    await db.collection("users").doc(auth.userId).update({
      profilePictureUrl,
      profilePicturePath: body.storagePath,
      profilePictureUpdatedAt: FieldValue.serverTimestamp(),
    });

    res.json({ data: { profilePictureUrl } });
  } catch (err) { next(err); }
});

app.patch("/api/v1/creator/profile", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    if (auth.role !== "creator" && auth.role !== "admin") {
      throw apiError("FORBIDDEN", "Only creators can update creator profile", 403);
    }
    const rb = req.body as Record<string, unknown>;
    const update: Record<string, unknown> = { updated_at: FieldValue.serverTimestamp() };
    if ("cards" in rb && rb.cards !== null && typeof rb.cards === "object") update.cards = rb.cards;
    await db.collection("users").doc(auth.userId).update(update);
    res.json({ data: { userId: auth.userId, updatedAt: new Date().toISOString() } });
  } catch (err) { next(err); }
});

app.post("/api/v1/creator/profile/card-media/upload-url", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    assertCreator(auth);
    const body = validateBody<{ contentType: string; filename?: string }>({ contentType: "string" }, req.body);
    const allowedImage = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    const allowedVideo = ["video/mp4", "video/x-m4v", "video/quicktime"];
    const allowed = [...allowedImage, ...allowedVideo];
    if (!allowed.includes(body.contentType)) {
      throw apiError("VALIDATION_ERROR", "Unsupported contentType for card media", 400, "contentType");
    }
    const isVideo = allowedVideo.includes(body.contentType);
    const ext = isVideo ? "mp4" : body.contentType.split("/")[1] ?? "jpg";
    const timestamp = Date.now();
    const storagePath = `cards/${auth.userId}/${timestamp}.${ext}`;
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
    let uploadUrl: string;
    try {
      [uploadUrl] = await admin.storage().bucket().file(storagePath).getSignedUrl({
        version: "v4",
        action: "write",
        expires: expiresAt,
        contentType: body.contentType,
      });
    } catch (e: unknown) {
      functions.logger.error("getSignedUrl failed (card-media)", { error: e instanceof Error ? e.message : String(e) });
      throw apiError("INTERNAL_ERROR", "Storage signing failed", 500);
    }
    res.json({ data: { uploadUrl, storagePath, expiresAt: expiresAt.toISOString() } });
  } catch (err) { next(err); }
});

app.post("/api/v1/creator/profile/card-media/confirm", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    assertCreator(auth);
    const body = validateBody<{ storagePath: string }>({ storagePath: "string" }, req.body);
    if (!body.storagePath.startsWith(`cards/${auth.userId}/`)) {
      throw apiError("FORBIDDEN", "Storage path does not belong to this user", 403);
    }
    const file = admin.storage().bucket().file(body.storagePath);
    const [exists] = await file.exists();
    if (!exists) throw apiError("NOT_FOUND", "File not found in storage", 404);
    const downloadToken = crypto.randomUUID();
    await file.setMetadata({ metadata: { firebaseStorageDownloadTokens: downloadToken } });
    const bucketName = admin.storage().bucket().name;
    const encodedPath = encodeURIComponent(body.storagePath);
    const mediaUrl = `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodedPath}?alt=media&token=${downloadToken}`;
    res.json({ data: { mediaUrl } });
  } catch (err) { next(err); }
});

app.get("/api/v1/creator/profile", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    assertCreator(auth);
    const doc = await db.collection("users").doc(auth.userId).get();
    if (!doc.exists) throw apiError("NOT_FOUND", "Perfil no encontrado", 404);
    const e = doc.data()!;
    res.json({
      data: {
        userId: auth.userId,
        displayName: e.displayName ?? e.name ?? null,
        email: e.email ?? null,
        bio: e.bio ?? null,
        photoUrl: e.photoUrl ?? e.photoURL ?? null,
        cards: e.cards ?? null,
        createdAt: e.createdAt?.toDate?.()?.toISOString() ?? null,
      },
    });
  } catch (err) { next(err); }
});

// ─── Nutrition helpers ────────────────────────────────────────────────────────

function parseDateParam(v: unknown, field: string): string {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) {
    throw apiError("VALIDATION_ERROR", `${field} must be YYYY-MM-DD`, 400, field);
  }
  return v;
}

function normalizeFoodDetail(food: Record<string, unknown>) {
  const rawServings = (food.servings as { serving?: unknown } | undefined)?.serving ?? [];
  const servingList: Array<Record<string, unknown>> = Array.isArray(rawServings)
    ? rawServings as Array<Record<string, unknown>>
    : [rawServings as Record<string, unknown>];
  return {
    foodId: String(food.food_id ?? ""),
    name: String(food.food_name ?? ""),
    brandName: food.brand_name ? String(food.brand_name) : null,
    servings: servingList.map((s) => ({
      servingId: String(s.serving_id ?? ""),
      description: String(s.serving_description ?? ""),
      calories: s.calories !== undefined ? Number(s.calories) : null,
      protein: s.protein !== undefined ? Number(s.protein) : null,
      carbs: s.carbohydrate !== undefined ? Number(s.carbohydrate) : null,
      fat: s.fat !== undefined ? Number(s.fat) : null,
      gramsPerUnit: s.grams_per_unit !== undefined ? Number(s.grams_per_unit) : null,
      metricServingAmount: s.metric_serving_amount !== undefined ? Number(s.metric_serving_amount) : null,
      metricServingUnit: s.metric_serving_unit ? String(s.metric_serving_unit) : null,
    })),
  };
}

async function queryDiaryDocs(userId: string, date?: string, startDate?: string, endDate?: string) {
  const base = db.collection("users").doc(userId).collection("diary");
  if (date) {
    return (await base.where("date", "==", parseDateParam(date, "date")).get()).docs;
  }
  if (startDate && endDate) {
    const sd = parseDateParam(startDate, "startDate");
    const ed = parseDateParam(endDate, "endDate");
    if ((new Date(ed).getTime() - new Date(sd).getTime()) / 86400000 > 90) {
      throw apiError("VALIDATION_ERROR", "Date range cannot exceed 90 days", 400);
    }
    return (await base.where("date", ">=", sd).where("date", "<=", ed).orderBy("date", "asc").get()).docs;
  }
  throw apiError("VALIDATION_ERROR", "Provide date or startDate+endDate", 400);
}

function shapeDiaryEntry(d: admin.firestore.QueryDocumentSnapshot) {
  const e = d.data();
  return {
    entryId: d.id,
    date: e.date ?? null,
    meal: e.meal ?? null,
    foodId: e.food_id ?? e.foodId ?? null,
    servingId: e.serving_id ?? e.servingId ?? null,
    numberOfUnits: e.number_of_units ?? e.numberOfUnits ?? 1,
    name: e.name ?? null,
    foodCategory: e.food_category ?? e.foodCategory ?? null,
    calories: e.calories ?? null,
    protein: e.protein ?? null,
    carbs: e.carbs ?? null,
    fat: e.fat ?? null,
    servingUnit: e.serving_unit ?? e.servingUnit ?? null,
    gramsPerUnit: e.grams_per_unit ?? e.gramsPerUnit ?? null,
    createdAt: e.createdAt?.toDate?.()?.toISOString() ?? null,
  };
}

async function assertCreatorHasClient(creatorId: string, clientId: string): Promise<void> {
  const s1 = await db.collection("one_on_one_clients")
    .where("creatorId", "==", creatorId)
    .where("clientId", "==", clientId)
    .limit(1).get();
  if (!s1.empty) return;
  const s2 = await db.collection("one_on_one_clients")
    .where("creatorId", "==", creatorId)
    .where("userId", "==", clientId)
    .limit(1).get();
  if (s2.empty) throw apiError("FORBIDDEN", "Client not found or not accessible", 403);
}

// ─── 4.1 Diary ────────────────────────────────────────────────────────────────

app.get("/api/v1/nutrition/diary", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    const { date, startDate, endDate } = req.query as Record<string, string | undefined>;
    const docs = await queryDiaryDocs(auth.userId, date, startDate, endDate);
    res.json({ data: docs.map(shapeDiaryEntry) });
  } catch (err) { next(err); }
});

app.post("/api/v1/nutrition/diary", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    const body = validateBody<{
      date: string; meal: string; foodId: string; servingId: string;
      numberOfUnits: number; name: string; foodCategory?: string;
      calories?: number; protein?: number; carbs?: number; fat?: number;
      servingUnit?: string; gramsPerUnit?: number; servings?: unknown[];
    }>({
      date: "string", meal: "string", foodId: "string", servingId: "string",
      numberOfUnits: "number", name: "string",
      foodCategory: "optional_string", calories: "optional_number",
      protein: "optional_number", carbs: "optional_number", fat: "optional_number",
      servingUnit: "optional_string", gramsPerUnit: "optional_number", servings: "optional_array",
    }, req.body);

    parseDateParam(body.date, "date");
    if (!["breakfast", "lunch", "dinner", "snack"].includes(body.meal)) {
      throw apiError("VALIDATION_ERROR", "meal must be breakfast, lunch, dinner, or snack", 400, "meal");
    }

    const docRef = await db.collection("users").doc(auth.userId).collection("diary").add({
      userId: auth.userId,
      date: body.date, meal: body.meal,
      food_id: body.foodId, serving_id: body.servingId,
      number_of_units: body.numberOfUnits, name: body.name,
      food_category: body.foodCategory ?? null,
      calories: body.calories ?? null, protein: body.protein ?? null,
      carbs: body.carbs ?? null, fat: body.fat ?? null,
      serving_unit: body.servingUnit ?? null, grams_per_unit: body.gramsPerUnit ?? null,
      ...(body.servings ? { servings: body.servings } : {}),
      createdAt: FieldValue.serverTimestamp(),
    });
    res.status(201).json({ data: { entryId: docRef.id, createdAt: new Date().toISOString() } });
  } catch (err) { next(err); }
});

app.patch("/api/v1/nutrition/diary/:entryId", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    const ref = db.collection("users").doc(auth.userId).collection("diary").doc(req.params.entryId);
    if (!(await ref.get()).exists) throw apiError("NOT_FOUND", "Diary entry not found", 404);
    const body = validateBody<{
      servingId?: string; numberOfUnits?: number;
      calories?: number; protein?: number; carbs?: number; fat?: number;
    }>({
      servingId: "optional_string", numberOfUnits: "optional_number",
      calories: "optional_number", protein: "optional_number",
      carbs: "optional_number", fat: "optional_number",
    }, req.body);
    const update: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
    if (body.servingId !== undefined) update.serving_id = body.servingId;
    if (body.numberOfUnits !== undefined) update.number_of_units = body.numberOfUnits;
    if (body.calories !== undefined) update.calories = body.calories;
    if (body.protein !== undefined) update.protein = body.protein;
    if (body.carbs !== undefined) update.carbs = body.carbs;
    if (body.fat !== undefined) update.fat = body.fat;
    await ref.update(update);
    res.json({ data: { entryId: req.params.entryId, updatedAt: new Date().toISOString() } });
  } catch (err) { next(err); }
});

app.delete("/api/v1/nutrition/diary/:entryId", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    const ref = db.collection("users").doc(auth.userId).collection("diary").doc(req.params.entryId);
    if (!(await ref.get()).exists) throw apiError("NOT_FOUND", "Diary entry not found", 404);
    await ref.delete();
    res.status(204).end();
  } catch (err) { next(err); }
});

// ─── 4.2 Food Search (FatSecret proxy) ───────────────────────────────────────

const FATSECRET_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

app.get("/api/v1/nutrition/foods/search", async (req, res, next) => {
  try {
    await validateAuth(req);
    const { q, page } = req.query as Record<string, string | undefined>;
    if (!q?.trim()) throw apiError("VALIDATION_ERROR", "q is required", 400, "q");
    if (q.trim().length > 200) throw apiError("VALIDATION_ERROR", "q exceeds 200 characters", 400, "q");
    const pageNum = page ? Math.max(0, parseInt(page, 10) - 1) : 0;
    if (isNaN(pageNum)) throw apiError("VALIDATION_ERROR", "page must be a number", 400, "page");

    const cacheKey = `search_${encodeURIComponent(q.trim().toLowerCase())}_20_${pageNum}`;
    const cacheRef = db.collection("fatsecret_cache").doc(cacheKey);
    const cacheDoc = await cacheRef.get();
    if (cacheDoc.exists) {
      const cacheData = cacheDoc.data()!;
      if (Date.now() - cacheData.cachedAt.toMillis() < FATSECRET_CACHE_TTL_MS) {
        res.json({ data: cacheData.payload });
        return;
      }
    }

    const clientId = fatSecretClientId.value();
    const clientSecret = fatSecretClientSecret.value();
    if (!clientId || !clientSecret) throw apiError("SERVICE_UNAVAILABLE", "Nutrition service not configured", 503);

    const token = await getFatSecretToken(clientId, clientSecret, "premier");
    const params = new URLSearchParams({
      search_expression: q.trim(), page_number: String(pageNum),
      max_results: "20", format: "json", region: "ES", language: "es",
    });
    const fsRes = await fetch(`https://platform.fatsecret.com/rest/foods/search/v4?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!fsRes.ok) {
      functions.logger.error("FatSecret search failed", { status: fsRes.status });
      throw apiError("SERVICE_UNAVAILABLE", "Food search service unavailable", 503);
    }
    const json = await fsRes.json() as { foods?: { food?: unknown; total_results?: string; page_number?: string } };
    const foodsData = json?.foods;
    const raw = foodsData?.food ?? [];
    const foodList = (Array.isArray(raw) ? raw : [raw]) as Array<Record<string, unknown>>;
    const payload = {
      foods: foodList.map((f) => ({
        foodId: String(f.food_id ?? ""),
        name: String(f.food_name ?? ""),
        brandName: f.brand_name ? String(f.brand_name) : null,
        foodType: String(f.food_type ?? "Generic"),
        servingDescription: String(f.food_description ?? ""),
        calories: f.calories !== undefined ? Number(f.calories) : null,
        protein: f.protein !== undefined ? Number(f.protein) : null,
        carbs: f.carbohydrate !== undefined ? Number(f.carbohydrate) : null,
        fat: f.fat !== undefined ? Number(f.fat) : null,
      })),
      totalResults: Number(foodsData?.total_results ?? 0),
      pageNumber: Number(foodsData?.page_number ?? 0) + 1,
      maxResults: 20,
    };
    cacheRef.set({ payload, cachedAt: FieldValue.serverTimestamp() }).catch((e: unknown) => {
      functions.logger.warn("fatsecret_cache write failed", { cacheKey, error: e instanceof Error ? e.message : String(e) });
    });
    res.json({ data: payload });
  } catch (err) { next(err); }
});

// barcode route must precede /:foodId to avoid Express treating "barcode" as a foodId param
app.get("/api/v1/nutrition/foods/barcode/:barcode", async (req, res, next) => {
  try {
    await validateAuth(req);
    const { barcode } = req.params;
    if (!/^\d{8,14}$/.test(barcode)) throw apiError("VALIDATION_ERROR", "Código de barras inválido", 400, "barcode");
    const cacheKey = `barcode_${barcode.trim()}`;
    const cacheRef = db.collection("fatsecret_cache").doc(cacheKey);
    const cacheDoc = await cacheRef.get();
    if (cacheDoc.exists) {
      const cacheData = cacheDoc.data()!;
      if (Date.now() - cacheData.cachedAt.toMillis() < FATSECRET_CACHE_TTL_MS) {
        res.json({ data: cacheData.payload });
        return;
      }
    }
    const clientId = fatSecretClientId.value();
    const clientSecret = fatSecretClientSecret.value();
    if (!clientId || !clientSecret) throw apiError("SERVICE_UNAVAILABLE", "Nutrition service not configured", 503);
    const token = await getFatSecretToken(clientId, clientSecret, "basic barcode");
    const params = new URLSearchParams({
      barcode: barcode.trim(), format: "json", region: "ES", language: "es",
    });
    const fsRes = await fetch(`https://platform.fatsecret.com/rest/food/barcode/find-by-id/v2?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!fsRes.ok) {
      const errBody = await fsRes.json().catch(() => ({})) as { error?: { code?: number } };
      if (fsRes.status === 404 || errBody?.error?.code === 211) throw apiError("NOT_FOUND", "No food found for barcode", 404);
      throw apiError("SERVICE_UNAVAILABLE", "Barcode lookup service unavailable", 503);
    }
    const json = await fsRes.json() as { food?: Record<string, unknown> };
    const payload = normalizeFoodDetail(json?.food ?? {});
    cacheRef.set({ payload, cachedAt: FieldValue.serverTimestamp() }).catch((e: unknown) => {
      functions.logger.warn("fatsecret_cache write failed", { cacheKey, error: e instanceof Error ? e.message : String(e) });
    });
    res.json({ data: payload });
  } catch (err) { next(err); }
});

app.get("/api/v1/nutrition/foods/:foodId", async (req, res, next) => {
  try {
    await validateAuth(req);
    const cacheKey = `food_${req.params.foodId}`;
    const cacheRef = db.collection("fatsecret_cache").doc(cacheKey);
    const cacheDoc = await cacheRef.get();
    if (cacheDoc.exists) {
      const cacheData = cacheDoc.data()!;
      if (Date.now() - cacheData.cachedAt.toMillis() < FATSECRET_CACHE_TTL_MS) {
        res.json({ data: cacheData.payload });
        return;
      }
    }

    const clientId = fatSecretClientId.value();
    const clientSecret = fatSecretClientSecret.value();
    if (!clientId || !clientSecret) throw apiError("SERVICE_UNAVAILABLE", "Nutrition service not configured", 503);
    const token = await getFatSecretToken(clientId, clientSecret, "premier");
    const params = new URLSearchParams({
      food_id: req.params.foodId, format: "json", region: "ES", language: "es",
    });
    const fsRes = await fetch(`https://platform.fatsecret.com/rest/food/v5?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!fsRes.ok) {
      if (fsRes.status === 404) throw apiError("NOT_FOUND", "Food not found", 404);
      throw apiError("SERVICE_UNAVAILABLE", "Food detail service unavailable", 503);
    }
    const json = await fsRes.json() as { food?: Record<string, unknown> };
    const payload = normalizeFoodDetail(json?.food ?? {});
    cacheRef.set({ payload, cachedAt: FieldValue.serverTimestamp() }).catch((e: unknown) => {
      functions.logger.warn("fatsecret_cache write failed", { cacheKey, error: e instanceof Error ? e.message : String(e) });
    });
    res.json({ data: payload });
  } catch (err) { next(err); }
});

// ─── 4.3 Saved Foods ──────────────────────────────────────────────────────────

app.get("/api/v1/nutrition/saved-foods", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    const snap = await db.collection("users").doc(auth.userId).collection("saved_foods")
      .orderBy("savedAt", "desc").get();
    res.json({
      data: snap.docs.map((d) => {
        const e = d.data();
        return {
          savedFoodId: d.id,
          foodId: e.foodId ?? e.food_id ?? null,
          name: e.name ?? null,
          calories: e.calories ?? null, protein: e.protein ?? null,
          carbs: e.carbs ?? null, fat: e.fat ?? null,
          servingUnit: e.servingUnit ?? e.serving_unit ?? null,
          savedAt: e.savedAt?.toDate?.()?.toISOString() ?? null,
        };
      }),
    });
  } catch (err) { next(err); }
});

app.post("/api/v1/nutrition/saved-foods", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    const body = validateBody<{
      foodId: string; name: string;
      calories?: number; protein?: number; carbs?: number; fat?: number; servingUnit?: string;
    }>({
      foodId: "string", name: "string",
      calories: "optional_number", protein: "optional_number",
      carbs: "optional_number", fat: "optional_number", servingUnit: "optional_string",
    }, req.body);
    const existing = await db.collection("users").doc(auth.userId).collection("saved_foods")
      .where("foodId", "==", body.foodId).limit(1).get();
    if (!existing.empty) throw apiError("CONFLICT", "Food already saved", 409);
    const docRef = await db.collection("users").doc(auth.userId).collection("saved_foods").add({
      foodId: body.foodId, name: body.name,
      calories: body.calories ?? null, protein: body.protein ?? null,
      carbs: body.carbs ?? null, fat: body.fat ?? null,
      servingUnit: body.servingUnit ?? null,
      savedAt: FieldValue.serverTimestamp(),
    });
    res.status(201).json({ data: { savedFoodId: docRef.id } });
  } catch (err) { next(err); }
});

app.delete("/api/v1/nutrition/saved-foods/:savedFoodId", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    const ref = db.collection("users").doc(auth.userId).collection("saved_foods").doc(req.params.savedFoodId);
    if (!(await ref.get()).exists) throw apiError("NOT_FOUND", "Saved food not found", 404);
    await ref.delete();
    res.status(204).end();
  } catch (err) { next(err); }
});

// ─── 4.4 Nutrition Assignment (user) ─────────────────────────────────────────

app.get("/api/v1/nutrition/assignment", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    const dateStr = (req.query.date as string | undefined) ?? new Date().toISOString().split("T")[0];
    parseDateParam(dateStr, "date");

    const snap = await db.collection("nutrition_assignments")
      .where("userId", "==", auth.userId)
      .orderBy("startDate", "desc")
      .get();
    const matching = snap.docs.find((d) => {
      const a = d.data();
      if (a.startDate && dateStr < a.startDate) return false;
      if (a.endDate && dateStr > a.endDate) return false;
      return true;
    });
    if (!matching) throw apiError("NOT_FOUND", "No active nutrition assignment for this date", 404);

    const assignment = matching.data();
    const assignmentId = matching.id;

    // Priority 1: client_nutrition_plan_content copy
    let planContent: admin.firestore.DocumentData | null = null;
    const contentDoc = await db.collection("client_nutrition_plan_content").doc(assignmentId).get();
    if (contentDoc.exists) {
      planContent = contentDoc.data() ?? null;
    } else if (assignment.plan && typeof assignment.plan === "object") {
      // Priority 2: snapshot stored on assignment
      planContent = assignment.plan as admin.firestore.DocumentData;
    } else if (assignment.planId) {
      // Priority 3: fetch from library
      const planDoc = await db.collection("creator_nutrition_library")
        .doc(assignment.assignedBy ?? auth.userId)
        .collection("plans").doc(assignment.planId).get();
      if (planDoc.exists) planContent = planDoc.data() ?? null;
    }
    if (!planContent) throw apiError("NOT_FOUND", "No active nutrition assignment for this date", 404);

    res.json({
      data: {
        assignmentId,
        startDate: assignment.startDate ?? null,
        endDate: assignment.endDate ?? null,
        plan: {
          name: planContent.name ?? "",
          dailyCalories: planContent.daily_calories ?? planContent.dailyCalories ?? null,
          dailyProteinG: planContent.daily_protein_g ?? planContent.dailyProteinG ?? null,
          dailyCarbsG: planContent.daily_carbs_g ?? planContent.dailyCarbsG ?? null,
          dailyFatG: planContent.daily_fat_g ?? planContent.dailyFatG ?? null,
          categories: planContent.categories ?? [],
        },
      },
    });
  } catch (err) { next(err); }
});

// ─── 4.5 Creator Meal Library ─────────────────────────────────────────────────

app.get("/api/v1/creator/nutrition/meals", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    if (auth.role !== "creator" && auth.role !== "admin") throw apiError("FORBIDDEN", "Only creators can access this", 403);
    const snap = await db.collection("creator_nutrition_library").doc(auth.userId)
      .collection("meals").orderBy("createdAt", "desc").get();
    res.json({
      data: snap.docs.map((d) => {
        const e = d.data();
        return {
          mealId: d.id,
          name: e.name ?? "",
          description: e.description ?? null,
          calories: e.calories ?? null, protein: e.protein ?? null,
          carbs: e.carbs ?? null, fat: e.fat ?? null,
          videoUrl: e.videoUrl ?? null,
          items: e.items ?? [],
          createdAt: e.createdAt?.toDate?.()?.toISOString() ?? null,
        };
      }),
    });
  } catch (err) { next(err); }
});

app.post("/api/v1/creator/nutrition/meals", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    if (auth.role !== "creator" && auth.role !== "admin") throw apiError("FORBIDDEN", "Only creators can access this", 403);
    const body = validateBody<{ name: string; description?: string; videoUrl?: string; items?: unknown[] }>({
      name: "string", description: "optional_string", videoUrl: "optional_string", items: "optional_array",
    }, req.body);
    const docRef = await db.collection("creator_nutrition_library").doc(auth.userId)
      .collection("meals").add({
        name: body.name, creatorId: auth.userId,
        description: body.description ?? null, videoUrl: body.videoUrl ?? null,
        items: body.items ?? [],
        createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
      });
    res.status(201).json({ data: { mealId: docRef.id, createdAt: new Date().toISOString() } });
  } catch (err) { next(err); }
});

app.patch("/api/v1/creator/nutrition/meals/:mealId", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    if (auth.role !== "creator" && auth.role !== "admin") throw apiError("FORBIDDEN", "Only creators can access this", 403);
    const ref = db.collection("creator_nutrition_library").doc(auth.userId)
      .collection("meals").doc(req.params.mealId);
    if (!(await ref.get()).exists) throw apiError("NOT_FOUND", "Meal not found", 404);
    const body = validateBody<{ name?: string; description?: string; videoUrl?: string; items?: unknown[] }>({
      name: "optional_string", description: "optional_string",
      videoUrl: "optional_string", items: "optional_array",
    }, req.body);
    const update: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
    if (body.name !== undefined) update.name = body.name;
    if (body.description !== undefined) update.description = body.description;
    if (body.videoUrl !== undefined) update.videoUrl = body.videoUrl;
    if (body.items !== undefined) update.items = body.items;
    await ref.update(update);
    res.json({ data: { mealId: req.params.mealId, updatedAt: new Date().toISOString() } });
  } catch (err) { next(err); }
});

app.delete("/api/v1/creator/nutrition/meals/:mealId", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    if (auth.role !== "creator" && auth.role !== "admin") throw apiError("FORBIDDEN", "Only creators can access this", 403);
    const ref = db.collection("creator_nutrition_library").doc(auth.userId)
      .collection("meals").doc(req.params.mealId);
    if (!(await ref.get()).exists) throw apiError("NOT_FOUND", "Meal not found", 404);
    await ref.delete();
    res.status(204).end();
  } catch (err) { next(err); }
});

// ─── 4.6 Creator Plan Library ─────────────────────────────────────────────────

app.get("/api/v1/creator/nutrition/plans", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    if (auth.role !== "creator" && auth.role !== "admin") throw apiError("FORBIDDEN", "Only creators can access this", 403);
    const snap = await db.collection("creator_nutrition_library").doc(auth.userId)
      .collection("plans").orderBy("createdAt", "desc").get();
    res.json({
      data: snap.docs.map((d) => {
        const e = d.data();
        return {
          planId: d.id,
          name: e.name ?? "",
          description: e.description ?? null,
          dailyCalories: e.daily_calories ?? e.dailyCalories ?? null,
          dailyProteinG: e.daily_protein_g ?? e.dailyProteinG ?? null,
          dailyCarbsG: e.daily_carbs_g ?? e.dailyCarbsG ?? null,
          dailyFatG: e.daily_fat_g ?? e.dailyFatG ?? null,
          createdAt: e.createdAt?.toDate?.()?.toISOString() ?? null,
          updatedAt: e.updatedAt?.toDate?.()?.toISOString() ?? null,
        };
      }),
    });
  } catch (err) { next(err); }
});

app.post("/api/v1/creator/nutrition/plans", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    if (auth.role !== "creator" && auth.role !== "admin") throw apiError("FORBIDDEN", "Only creators can access this", 403);
    const body = validateBody<{
      name: string; description?: string;
      dailyCalories?: number; dailyProteinG?: number; dailyCarbsG?: number; dailyFatG?: number;
      categories?: unknown[];
    }>({
      name: "string", description: "optional_string",
      dailyCalories: "optional_number", dailyProteinG: "optional_number",
      dailyCarbsG: "optional_number", dailyFatG: "optional_number", categories: "optional_array",
    }, req.body);
    const docRef = await db.collection("creator_nutrition_library").doc(auth.userId)
      .collection("plans").add({
        name: body.name, creatorId: auth.userId,
        description: body.description ?? null, tags: [],
        daily_calories: body.dailyCalories ?? null, daily_protein_g: body.dailyProteinG ?? null,
        daily_carbs_g: body.dailyCarbsG ?? null, daily_fat_g: body.dailyFatG ?? null,
        categories: body.categories ?? [],
        createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
      });
    res.status(201).json({ data: { planId: docRef.id, createdAt: new Date().toISOString() } });
  } catch (err) { next(err); }
});

app.get("/api/v1/creator/nutrition/plans/:planId", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    if (auth.role !== "creator" && auth.role !== "admin") throw apiError("FORBIDDEN", "Only creators can access this", 403);
    const planDoc = await db.collection("creator_nutrition_library").doc(auth.userId)
      .collection("plans").doc(req.params.planId).get();
    if (!planDoc.exists) throw apiError("NOT_FOUND", "Plan not found", 404);
    const e = planDoc.data()!;
    res.json({
      data: {
        planId: planDoc.id, name: e.name ?? "",
        description: e.description ?? null,
        dailyCalories: e.daily_calories ?? e.dailyCalories ?? null,
        dailyProteinG: e.daily_protein_g ?? e.dailyProteinG ?? null,
        dailyCarbsG: e.daily_carbs_g ?? e.dailyCarbsG ?? null,
        dailyFatG: e.daily_fat_g ?? e.dailyFatG ?? null,
        categories: e.categories ?? [],
        createdAt: e.createdAt?.toDate?.()?.toISOString() ?? null,
        updatedAt: e.updatedAt?.toDate?.()?.toISOString() ?? null,
      },
    });
  } catch (err) { next(err); }
});

app.patch("/api/v1/creator/nutrition/plans/:planId", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    if (auth.role !== "creator" && auth.role !== "admin") throw apiError("FORBIDDEN", "Only creators can access this", 403);
    const ref = db.collection("creator_nutrition_library").doc(auth.userId)
      .collection("plans").doc(req.params.planId);
    if (!(await ref.get()).exists) throw apiError("NOT_FOUND", "Plan not found", 404);
    const body = validateBody<{
      name?: string; description?: string;
      dailyCalories?: number; dailyProteinG?: number; dailyCarbsG?: number; dailyFatG?: number;
      categories?: unknown[];
    }>({
      name: "optional_string", description: "optional_string",
      dailyCalories: "optional_number", dailyProteinG: "optional_number",
      dailyCarbsG: "optional_number", dailyFatG: "optional_number", categories: "optional_array",
    }, req.body);
    const update: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
    if (body.name !== undefined) update.name = body.name;
    if (body.description !== undefined) update.description = body.description;
    if (body.dailyCalories !== undefined) update.daily_calories = body.dailyCalories;
    if (body.dailyProteinG !== undefined) update.daily_protein_g = body.dailyProteinG;
    if (body.dailyCarbsG !== undefined) update.daily_carbs_g = body.dailyCarbsG;
    if (body.dailyFatG !== undefined) update.daily_fat_g = body.dailyFatG;
    if (body.categories !== undefined) update.categories = body.categories;
    await ref.update(update);
    res.json({ data: { planId: req.params.planId, updatedAt: new Date().toISOString() } });
  } catch (err) { next(err); }
});

app.delete("/api/v1/creator/nutrition/plans/:planId", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    if (auth.role !== "creator" && auth.role !== "admin") throw apiError("FORBIDDEN", "Only creators can access this", 403);
    const ref = db.collection("creator_nutrition_library").doc(auth.userId)
      .collection("plans").doc(req.params.planId);
    if (!(await ref.get()).exists) throw apiError("NOT_FOUND", "Plan not found", 404);
    await ref.delete();
    res.status(204).end();
  } catch (err) { next(err); }
});

// ─── 4.7 Creator Client Nutrition ─────────────────────────────────────────────

app.get("/api/v1/creator/clients/:clientId/nutrition/assignments", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    if (auth.role !== "creator" && auth.role !== "admin") throw apiError("FORBIDDEN", "Only creators can access this", 403);
    await assertCreatorHasClient(auth.userId, req.params.clientId);
    const snap = await db.collection("nutrition_assignments")
      .where("userId", "==", req.params.clientId)
      .where("assignedBy", "==", auth.userId)
      .orderBy("createdAt", "desc")
      .get();
    res.json({
      data: snap.docs.map((d) => {
        const e = d.data();
        return {
          assignmentId: d.id,
          planId: e.planId ?? null,
          planName: e.plan?.name ?? e.planName ?? null,
          startDate: e.startDate ?? null,
          endDate: e.endDate ?? null,
          createdAt: e.createdAt?.toDate?.()?.toISOString() ?? null,
        };
      }),
    });
  } catch (err) { next(err); }
});

app.post("/api/v1/creator/clients/:clientId/nutrition/assignments", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    if (auth.role !== "creator" && auth.role !== "admin") throw apiError("FORBIDDEN", "Only creators can access this", 403);
    await assertCreatorHasClient(auth.userId, req.params.clientId);
    const body = validateBody<{ planId: string; startDate?: string; endDate?: string }>({
      planId: "string", startDate: "optional_string", endDate: "optional_string",
    }, req.body);
    if (body.startDate) parseDateParam(body.startDate, "startDate");
    if (body.endDate) parseDateParam(body.endDate, "endDate");

    const planDoc = await db.collection("creator_nutrition_library").doc(auth.userId)
      .collection("plans").doc(body.planId).get();
    if (!planDoc.exists) throw apiError("NOT_FOUND", "Plan not found", 404);

    const docRef = await db.collection("nutrition_assignments").add({
      userId: req.params.clientId,
      planId: body.planId,
      plan: planDoc.data(),
      assignedBy: auth.userId,
      source: "one_on_one",
      startDate: body.startDate ?? null,
      endDate: body.endDate ?? null,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    res.status(201).json({ data: { assignmentId: docRef.id, createdAt: new Date().toISOString() } });
  } catch (err) { next(err); }
});

app.delete("/api/v1/creator/clients/:clientId/nutrition/assignments/:assignmentId", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    if (auth.role !== "creator" && auth.role !== "admin") throw apiError("FORBIDDEN", "Only creators can access this", 403);
    await assertCreatorHasClient(auth.userId, req.params.clientId);
    const assignRef = db.collection("nutrition_assignments").doc(req.params.assignmentId);
    const assignDoc = await assignRef.get();
    if (!assignDoc.exists) throw apiError("NOT_FOUND", "Assignment not found", 404);
    if (assignDoc.data()?.assignedBy !== auth.userId) throw apiError("FORBIDDEN", "Not your assignment", 403);
    const batch = db.batch();
    batch.delete(assignRef);
    const contentRef = db.collection("client_nutrition_plan_content").doc(req.params.assignmentId);
    if ((await contentRef.get()).exists) batch.delete(contentRef);
    await batch.commit();
    res.status(204).end();
  } catch (err) { next(err); }
});

app.get("/api/v1/creator/clients/:clientId/nutrition/diary", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    if (auth.role !== "creator" && auth.role !== "admin") throw apiError("FORBIDDEN", "Only creators can access this", 403);
    await assertCreatorHasClient(auth.userId, req.params.clientId);
    const { date, startDate, endDate } = req.query as Record<string, string | undefined>;
    const docs = await queryDiaryDocs(req.params.clientId, date, startDate, endDate);
    res.json({ data: docs.map(shapeDiaryEntry) });
  } catch (err) { next(err); }
});

app.post("/api/v1/creator/nutrition/plans/:planId/propagate", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    if (auth.role !== "creator" && auth.role !== "admin") throw apiError("FORBIDDEN", "Only creators can access this", 403);
    const planDoc = await db.collection("creator_nutrition_library").doc(auth.userId)
      .collection("plans").doc(req.params.planId).get();
    if (!planDoc.exists) throw apiError("NOT_FOUND", "Plan not found", 404);
    const planData = planDoc.data()!;

    const assignmentsSnap = await db.collection("nutrition_assignments")
      .where("planId", "==", req.params.planId)
      .where("assignedBy", "==", auth.userId).get();

    let clientsAffected = 0;
    let copiesDeleted = 0;
    for (const assignDoc of assignmentsSnap.docs) {
      const batch = db.batch();
      batch.update(assignDoc.ref, { plan: planData, updatedAt: FieldValue.serverTimestamp() });
      const contentRef = db.collection("client_nutrition_plan_content").doc(assignDoc.id);
      if ((await contentRef.get()).exists) { batch.delete(contentRef); copiesDeleted++; }
      await batch.commit();
      clientsAffected++;
    }
    res.json({ data: { clientsAffected, copiesDeleted } });
  } catch (err) { next(err); }
});

// ─── Domain 4: Progress / Lab ─────────────────────────────────────────────────

// ── 5.1 Body Log ──────────────────────────────────────────────────────────────

app.get("/api/v1/progress/body-log", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    const limitVal = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? "30"), 10) || 30));
    const pageToken = req.query.pageToken as string | undefined;

    let q: FirebaseFirestore.Query = db.collection("users").doc(auth.userId)
      .collection("bodyLog").orderBy("date", "desc").limit(limitVal + 1);

    if (pageToken) {
      const decoded = Buffer.from(pageToken, "base64").toString("utf8");
      q = q.startAfter(decoded);
    }

    const snap = await q.get();
    const hasMore = snap.docs.length > limitVal;
    const docs = hasMore ? snap.docs.slice(0, limitVal) : snap.docs;

    const entries = docs.map((d) => {
      const e = d.data();
      return {
        date: d.id,
        weight: e.weight ?? null,
        note: e.note ?? null,
        photos: e.photos ?? [],
        updatedAt: e.updatedAt?.toDate?.()?.toISOString() ?? null,
      };
    });

    res.json({
      data: entries,
      nextPageToken: hasMore ? Buffer.from(docs[docs.length - 1].id).toString("base64") : null,
    });
  } catch (err) { next(err); }
});

app.get("/api/v1/progress/body-log/:date", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    parseDateParam(req.params.date, "date");
    const snap = await db.collection("users").doc(auth.userId)
      .collection("bodyLog").doc(req.params.date).get();
    if (!snap.exists) throw apiError("NOT_FOUND", "No body log entry for this date", 404);
    const e = snap.data()!;
    res.json({
      data: {
        date: snap.id,
        weight: e.weight ?? null,
        note: e.note ?? null,
        photos: e.photos ?? [],
        updatedAt: e.updatedAt?.toDate?.()?.toISOString() ?? null,
      },
    });
  } catch (err) { next(err); }
});

app.put("/api/v1/progress/body-log/:date", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    const dateStr = parseDateParam(req.params.date, "date");
    const body = validateBody<{ weight?: number; note?: string }>({
      weight: "optional_number", note: "optional_string",
    }, req.body);
    const update: Record<string, unknown> = { date: dateStr, updatedAt: FieldValue.serverTimestamp() };
    if (body.weight !== undefined) update.weight = body.weight;
    if (body.note !== undefined) update.note = body.note;
    await db.collection("users").doc(auth.userId).collection("bodyLog").doc(dateStr)
      .set(update, { merge: true });
    res.json({ data: { date: dateStr, updatedAt: new Date().toISOString() } });
  } catch (err) { next(err); }
});

app.delete("/api/v1/progress/body-log/:date", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    parseDateParam(req.params.date, "date");
    const docRef = db.collection("users").doc(auth.userId).collection("bodyLog").doc(req.params.date);
    const snap = await docRef.get();
    if (!snap.exists) throw apiError("NOT_FOUND", "No body log entry for this date", 404);
    const photos: Array<{ storagePath?: string }> = snap.data()?.photos ?? [];
    await docRef.delete();
    await Promise.allSettled(
      photos.filter((p) => p.storagePath).map((p) =>
        admin.storage().bucket().file(p.storagePath!).delete().catch(() => { /* best-effort */ })
      )
    );
    res.status(204).end();
  } catch (err) { next(err); }
});

app.post("/api/v1/progress/body-log/:date/photos/upload-url", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    const dateStr = parseDateParam(req.params.date, "date");
    const body = validateBody<{ angle: string; contentType: string }>({
      angle: "string", contentType: "string",
    }, req.body);

    const allowedAngles = ["front", "side", "back"];
    if (!allowedAngles.includes(body.angle)) {
      throw apiError("VALIDATION_ERROR", "angle must be front, side, or back", 400, "angle");
    }
    const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!allowedTypes.includes(body.contentType)) {
      throw apiError("VALIDATION_ERROR", "contentType must be image/jpeg, image/png, or image/webp", 400, "contentType");
    }

    const photoId = crypto.randomUUID();
    const storagePath = `progress_photos/${auth.userId}/${dateStr}/${body.angle}_${photoId}.jpg`;
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    let uploadUrl: string;
    try {
      [uploadUrl] = await admin.storage().bucket().file(storagePath).getSignedUrl({
        version: "v4",
        action: "write",
        expires: expiresAt,
        contentType: body.contentType,
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      functions.logger.error("getSignedUrl failed", { error: msg });
      throw apiError("INTERNAL_ERROR", "Storage signing failed", 500);
    }

    res.json({ data: { uploadUrl, storagePath, photoId, expiresAt: expiresAt.toISOString() } });
  } catch (err) { next(err); }
});

app.post("/api/v1/progress/body-log/:date/photos/confirm", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    const dateStr = parseDateParam(req.params.date, "date");
    const body = validateBody<{ photoId: string; storagePath: string; angle: string }>({
      photoId: "string", storagePath: "string", angle: "string",
    }, req.body);

    if (!body.storagePath.startsWith(`progress_photos/${auth.userId}/${dateStr}/`)) {
      throw apiError("FORBIDDEN", "Storage path does not belong to this user/date", 403);
    }

    const file = admin.storage().bucket().file(body.storagePath);
    const [exists] = await file.exists();
    if (!exists) throw apiError("NOT_FOUND", "File not found in storage", 404);

    const downloadToken = crypto.randomUUID();
    await file.setMetadata({ metadata: { firebaseStorageDownloadTokens: downloadToken } });
    const bucketName = admin.storage().bucket().name;
    const encodedPath = encodeURIComponent(body.storagePath);
    const storageUrl = `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodedPath}?alt=media&token=${downloadToken}`;

    const photo = { id: body.photoId, angle: body.angle, storageUrl, storagePath: body.storagePath };
    await db.collection("users").doc(auth.userId).collection("bodyLog").doc(dateStr)
      .set({ photos: FieldValue.arrayUnion(photo), date: dateStr, updatedAt: FieldValue.serverTimestamp() }, { merge: true });

    res.json({ data: { date: dateStr, photoId: body.photoId } });
  } catch (err) { next(err); }
});

app.delete("/api/v1/progress/body-log/:date/photos/:photoId", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    parseDateParam(req.params.date, "date");
    const docRef = db.collection("users").doc(auth.userId).collection("bodyLog").doc(req.params.date);
    const snap = await docRef.get();
    if (!snap.exists) throw apiError("NOT_FOUND", "No body log entry for this date", 404);
    const photos: Array<{ id?: string; storagePath?: string }> = snap.data()?.photos ?? [];
    const photo = photos.find((p) => p.id === req.params.photoId);
    if (!photo) throw apiError("NOT_FOUND", "Photo not found", 404);

    if (photo.storagePath) {
      await admin.storage().bucket().file(photo.storagePath).delete().catch(() => { /* best-effort */ });
    }
    await docRef.update({ photos: FieldValue.arrayRemove(photo), updatedAt: FieldValue.serverTimestamp() });
    res.status(204).end();
  } catch (err) { next(err); }
});

// ── 5.2 Readiness ─────────────────────────────────────────────────────────────

app.get("/api/v1/progress/readiness", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    const { startDate, endDate } = req.query as Record<string, string | undefined>;
    if (!startDate || !endDate) throw apiError("VALIDATION_ERROR", "startDate and endDate are required", 400);
    const sd = parseDateParam(startDate, "startDate");
    const ed = parseDateParam(endDate, "endDate");
    const diffDays = (new Date(ed).getTime() - new Date(sd).getTime()) / (1000 * 60 * 60 * 24);
    if (diffDays < 0) throw apiError("VALIDATION_ERROR", "endDate must be after startDate", 400);
    if (diffDays > 90) throw apiError("VALIDATION_ERROR", "Date range cannot exceed 90 days", 400);

    const snap = await db.collection("users").doc(auth.userId).collection("readiness")
      .where("date", ">=", sd).where("date", "<=", ed).orderBy("date", "asc").get();

    res.json({
      data: snap.docs.map((d) => {
        const e = d.data();
        return {
          date: d.id,
          energy: e.energy ?? null,
          soreness: typeof e.soreness === "number" ? 11 - e.soreness : null,
          sleep: e.sleep ?? null,
          completedAt: e.completedAt?.toDate?.()?.toISOString() ?? null,
        };
      }),
    });
  } catch (err) { next(err); }
});

app.get("/api/v1/progress/readiness/:date", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    parseDateParam(req.params.date, "date");
    const snap = await db.collection("users").doc(auth.userId)
      .collection("readiness").doc(req.params.date).get();
    if (!snap.exists) throw apiError("NOT_FOUND", "No readiness entry for this date", 404);
    const e = snap.data()!;
    res.json({
      data: {
        date: snap.id,
        energy: e.energy ?? null,
        soreness: typeof e.soreness === "number" ? 11 - e.soreness : null,
        sleep: e.sleep ?? null,
        completedAt: e.completedAt?.toDate?.()?.toISOString() ?? null,
      },
    });
  } catch (err) { next(err); }
});

app.put("/api/v1/progress/readiness/:date", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    const dateStr = parseDateParam(req.params.date, "date");
    const body = validateBody<{ energy: number; soreness: number; sleep: number }>({
      energy: "number", soreness: "number", sleep: "number",
    }, req.body);

    for (const [field, val] of Object.entries({ energy: body.energy, soreness: body.soreness, sleep: body.sleep })) {
      if ((val as number) < 1 || (val as number) > 10) {
        throw apiError("VALIDATION_ERROR", `${field} must be between 1 and 10`, 400, field);
      }
    }

    await db.collection("users").doc(auth.userId).collection("readiness").doc(dateStr).set({
      userId: auth.userId,
      date: dateStr,
      energy: body.energy,
      soreness: 11 - body.soreness, // stored inverted for legacy compatibility (1=fresh, 10=sore)
      sleep: body.sleep,
      completedAt: FieldValue.serverTimestamp(),
    });
    res.json({ data: { date: dateStr, completedAt: new Date().toISOString() } });
  } catch (err) { next(err); }
});

app.delete("/api/v1/progress/readiness/:date", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    parseDateParam(req.params.date, "date");
    const docRef = db.collection("users").doc(auth.userId).collection("readiness").doc(req.params.date);
    if (!(await docRef.get()).exists) throw apiError("NOT_FOUND", "No readiness entry for this date", 404);
    await docRef.delete();
    res.status(204).end();
  } catch (err) { next(err); }
});

// ── 5.3 Course Progress ───────────────────────────────────────────────────────

app.get("/api/v1/workout/progress", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    const userDoc = await db.collection("users").doc(auth.userId).get();
    const courseProgress = (userDoc.data() as Record<string, unknown>)?.courseProgress ?? {};
    res.json({ data: courseProgress });
  } catch (err) { next(err); }
});

app.get("/api/v1/workout/courses/:courseId/progress", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    const { courseId } = req.params;
    const userDoc = await db.collection("users").doc(auth.userId).get();
    const userData = userDoc.data() as Record<string, unknown> | undefined;
    const courseProgress = (userData?.courseProgress as Record<string, unknown> | undefined)?.[courseId] ?? null;
    res.json({ data: courseProgress });
  } catch (err) { next(err); }
});

app.patch("/api/v1/workout/courses/:courseId/progress", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    const { courseId } = req.params;
    const body = validateBody<{
      currentWeek?: number;
      currentDay?: number;
      lastSessionId?: string;
      completedSessions?: number;
    }>({
      currentWeek: "optional_number",
      currentDay: "optional_number",
      lastSessionId: "optional_string",
      completedSessions: "optional_number",
    }, req.body);
    const userDoc = await db.collection("users").doc(auth.userId).get();
    const enrolledCourses = (userDoc.data()?.courses as Record<string, unknown> | undefined) ?? {};
    if (!Object.prototype.hasOwnProperty.call(enrolledCourses, courseId)) {
      throw apiError("FORBIDDEN", "No tienes acceso a este programa", 403);
    }
    const progress: Record<string, unknown> = { lastActivity: new Date().toISOString() };
    if (body.currentWeek !== undefined) progress.currentWeek = body.currentWeek;
    if (body.currentDay !== undefined) progress.currentDay = body.currentDay;
    if (body.lastSessionId !== undefined) progress.lastSessionId = body.lastSessionId;
    if (body.completedSessions !== undefined) progress.completedSessions = body.completedSessions;
    await db.collection("users").doc(auth.userId).update({
      [`courseProgress.${courseId}`]: progress,
    });
    res.json({ data: { success: true } });
  } catch (err) { next(err); }
});

app.post("/api/v1/workout/courses/:courseId/progress/last-session", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    const { courseId } = req.params;
    const { sessionId, sessionData } = req.body as { sessionId?: string; sessionData?: unknown };
    if (!sessionId) throw apiError("VALIDATION_ERROR", "sessionId es requerido", 400);
    await db.collection("users").doc(auth.userId).update({
      [`courseProgress.${courseId}.lastSessionPerformed.${sessionId}`]: sessionData ?? null,
    });
    res.json({ data: { success: true } });
  } catch (err) { next(err); }
});

// ── 5.3 PRs / Exercise History ────────────────────────────────────────────────

app.get("/api/v1/progress/prs", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    const snap = await db.collection("users").doc(auth.userId).collection("exerciseHistory").get();

    const prs = snap.docs.map((d) => {
      const sessions: Array<{ date?: string; sets?: Array<{ weight?: unknown; reps?: unknown }> }> =
        d.data().sessions ?? [];

      let bestWeight: number | null = null;
      let bestReps: number | null = null;
      let bestDate: string | null = null;

      for (const session of sessions) {
        for (const set of (session.sets ?? [])) {
          const w = parseFloat(String(set.weight ?? ""));
          const r = parseFloat(String(set.reps ?? ""));
          if (!isNaN(w) && (bestWeight === null || w > bestWeight)) {
            bestWeight = w;
            bestReps = isNaN(r) ? null : r;
            bestDate = session.date ?? null;
          }
        }
      }

      const underscoreIdx = d.id.indexOf("_");
      const libraryId = underscoreIdx > -1 ? d.id.slice(0, underscoreIdx) : null;
      const exerciseName = underscoreIdx > -1 ? d.id.slice(underscoreIdx + 1) : d.id;

      return { exerciseKey: d.id, exerciseName, libraryId, bestWeight, bestReps, bestDate, sessionsCount: sessions.length };
    }).filter((pr) => pr.bestWeight !== null || pr.bestReps !== null);

    res.json({ data: prs });
  } catch (err) { next(err); }
});

// ── 5.4 Progress Photos (standalone — user-level, not tied to a body-log date) ─

app.post("/api/v1/progress/photos/upload-url", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    const body = validateBody<{ contentType: string }>({ contentType: "string" }, req.body);
    const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!allowedTypes.includes(body.contentType)) {
      throw apiError("VALIDATION_ERROR", "contentType must be image/jpeg, image/png, or image/webp", 400, "contentType");
    }
    const storagePath = `progress/${auth.userId}/${Date.now()}.jpg`;
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
    let uploadUrl: string;
    try {
      [uploadUrl] = await admin.storage().bucket().file(storagePath).getSignedUrl({
        version: "v4",
        action: "write",
        expires: expiresAt,
        contentType: body.contentType,
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      functions.logger.error("getSignedUrl failed", { error: msg });
      throw apiError("INTERNAL_ERROR", "Storage signing failed", 500);
    }
    res.json({ data: { uploadUrl, storagePath, expiresAt: expiresAt.toISOString() } });
  } catch (err) { next(err); }
});

app.post("/api/v1/progress/photos/confirm", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    const body = validateBody<{ storagePath: string }>({ storagePath: "string" }, req.body);
    if (!body.storagePath.startsWith(`progress/${auth.userId}/`)) {
      throw apiError("FORBIDDEN", "Storage path does not belong to this user", 403);
    }
    const file = admin.storage().bucket().file(body.storagePath);
    const [exists] = await file.exists();
    if (!exists) throw apiError("NOT_FOUND", "File not found in storage", 404);
    const downloadToken = crypto.randomUUID();
    await file.setMetadata({ metadata: { firebaseStorageDownloadTokens: downloadToken } });
    const bucketName = admin.storage().bucket().name;
    const encodedPath = encodeURIComponent(body.storagePath);
    const photoUrl = `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodedPath}?alt=media&token=${downloadToken}`;
    const photoId = crypto.randomUUID();
    const photo = { id: photoId, storagePath: body.storagePath, photoUrl, addedAt: new Date().toISOString() };
    await db.collection("users").doc(auth.userId).update({
      progressPhotos: FieldValue.arrayUnion(photo),
    });
    res.json({ data: { photoId, photoUrl } });
  } catch (err) { next(err); }
});

app.delete("/api/v1/progress/photos/:photoId", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    const { photoId } = req.params;
    const userRef = db.collection("users").doc(auth.userId);
    const userSnap = await userRef.get();
    const photos: Array<{ id?: string; storagePath?: string; photoUrl?: string; addedAt?: string }> =
      userSnap.data()?.progressPhotos ?? [];
    const photo = photos.find((p) => p.id === photoId);
    if (!photo) throw apiError("NOT_FOUND", "Photo not found", 404);
    if (photo.storagePath) {
      await admin.storage().bucket().file(photo.storagePath).delete().catch(() => { /* best-effort */ });
    }
    await userRef.update({ progressPhotos: FieldValue.arrayRemove(photo) });
    res.status(204).end();
  } catch (err) { next(err); }
});

// ── 6. Workout ─────────────────────────────────────────────────────────────────

// Helper: keep only sets that have a reps or weight value
function filterValidSets(
  sets: Array<{ reps?: unknown; weight?: unknown; [k: string]: unknown }>
) {
  return sets.filter((s) => {
    const hasReps = s.reps != null && s.reps !== "" && !isNaN(parseFloat(String(s.reps)));
    const hasWeight = s.weight != null && s.weight !== "" && !isNaN(parseFloat(String(s.weight)));
    return hasReps || hasWeight;
  });
}

// Helper: pick the best set (weight × 1000 + reps scoring, matching client logic)
function pickBestSet(sets: Array<{ reps?: unknown; weight?: unknown; [k: string]: unknown }>) {
  if (!sets.length) return null;
  const score = (s: { reps?: unknown; weight?: unknown }) => {
    const w = parseFloat(String(s.weight ?? ""));
    const r = parseFloat(String(s.reps ?? ""));
    return (isNaN(w) ? 0 : w) * 1000 + (isNaN(r) ? 0 : r);
  };
  return sets.reduce((best, s) => (score(s) > score(best) ? s : best), sets[0]);
}

// ── 6.1 Session History ───────────────────────────────────────────────────────

app.get("/api/v1/workout/sessions", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    const limitVal = Math.min(50, Math.max(1, parseInt(String(req.query.limit ?? "20"), 10) || 20));
    const pageToken = req.query.pageToken as string | undefined;

    let q: FirebaseFirestore.Query = db.collection("users").doc(auth.userId)
      .collection("sessionHistory")
      .orderBy("completedAt", "desc")
      .limit(limitVal + 1);

    if (pageToken) {
      const decoded = Buffer.from(pageToken, "base64").toString("utf8");
      q = q.startAfter(decoded);
    }

    const snap = await q.get();
    const hasMore = snap.docs.length > limitVal;
    const docs = hasMore ? snap.docs.slice(0, limitVal) : snap.docs;

    const sessions = docs.map((d) => {
      const s = d.data();
      return {
        sessionId: d.id,
        completionDocId: d.id,
        courseId: s.courseId ?? null,
        courseName: s.courseName ?? null,
        sessionName: s.sessionName ?? null,
        completedAt: s.completedAt ?? null,
        duration: s.duration ?? 0,
        userNotes: s.userNotes ?? "",
        exercises: s.exercises ?? {},
      };
    });

    const lastCompletedAt = docs.length > 0 ? (docs[docs.length - 1].data().completedAt ?? docs[docs.length - 1].id) : null;
    res.json({
      data: sessions,
      nextPageToken: hasMore && lastCompletedAt ? Buffer.from(String(lastCompletedAt)).toString("base64") : null,
    });
  } catch (err) { next(err); }
});

app.get("/api/v1/workout/sessions/:sessionId", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    const snap = await db.collection("users").doc(auth.userId)
      .collection("sessionHistory").doc(req.params.sessionId).get();
    if (!snap.exists) throw apiError("NOT_FOUND", "Session not found", 404);
    const s = snap.data()!;
    res.json({
      data: {
        sessionId: snap.id,
        completionDocId: snap.id,
        courseId: s.courseId ?? null,
        courseName: s.courseName ?? null,
        sessionName: s.sessionName ?? null,
        completedAt: s.completedAt ?? null,
        duration: s.duration ?? 0,
        userNotes: s.userNotes ?? "",
        exercises: s.exercises ?? {},
        planned: s.planned ?? null,
      },
    });
  } catch (err) { next(err); }
});

app.patch("/api/v1/workout/sessions/:sessionId/notes", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    const body = validateBody<{ userNotes: string }>({ userNotes: "string" }, req.body);
    const docRef = db.collection("users").doc(auth.userId)
      .collection("sessionHistory").doc(req.params.sessionId);
    if (!(await docRef.get()).exists) throw apiError("NOT_FOUND", "Session not found", 404);
    await docRef.update({ userNotes: body.userNotes });
    res.json({ data: { sessionId: req.params.sessionId, userNotes: body.userNotes } });
  } catch (err) { next(err); }
});

// ── 6.2 Session Completion ────────────────────────────────────────────────────

app.post("/api/v1/workout/complete", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    const body = req.body as {
      sessionId?: unknown;
      courseId?: unknown;
      courseName?: unknown;
      sessionName?: unknown;
      completedAt?: unknown;
      duration?: unknown;
      userNotes?: unknown;
      exercises?: unknown;
      planned?: unknown;
    };

    if (!body.sessionId || typeof body.sessionId !== "string") {
      throw apiError("VALIDATION_ERROR", "sessionId is required", 400, "sessionId");
    }
    if (!Array.isArray(body.exercises)) {
      throw apiError("VALIDATION_ERROR", "exercises must be an array", 400, "exercises");
    }

    const sessionId = body.sessionId;
    const completedAt = typeof body.completedAt === "string" ? body.completedAt : new Date().toISOString();
    const courseId = typeof body.courseId === "string" ? body.courseId : "";
    const courseName = typeof body.courseName === "string" ? body.courseName : "Unknown Course";
    const sessionName = typeof body.sessionName === "string" ? body.sessionName : "Workout Session";
    const duration = typeof body.duration === "number" ? body.duration : 0;
    const userNotes = typeof body.userNotes === "string" ? body.userNotes : "";

    type RawSet = { reps?: unknown; weight?: unknown; intensity?: unknown; [k: string]: unknown };
    type RawExercise = { exerciseId?: unknown; exerciseName?: unknown; libraryId?: unknown; sets?: unknown[] };
    const exercises = body.exercises as RawExercise[];

    // Build sessionHistory document
    const sessionHistoryData: Record<string, unknown> = {
      sessionId,
      courseId,
      courseName,
      sessionName,
      completedAt,
      duration,
      userNotes,
      exercises: {},
    };

    // Add planned snapshot if provided
    const planned = body.planned;
    if (planned && typeof planned === "object" && Array.isArray((planned as { exercises?: unknown[] }).exercises)) {
      const p = planned as { exercises: Array<{ id?: unknown; title?: unknown; name?: unknown; primary?: unknown; sets?: RawSet[] }> };
      sessionHistoryData.planned = {
        exercises: p.exercises.map((ex) => ({
          id: ex.id ?? "",
          title: ex.title ?? ex.name ?? "",
          name: ex.name ?? ex.title ?? "",
          primary: ex.primary ?? {},
          sets: (ex.sets ?? []).map((s) => ({ reps: s.reps, weight: s.weight, intensity: s.intensity })),
        })),
      };
    }

    // Identify valid exercises (matching client-side filtering rules)
    type ValidExercise = {
      exerciseId: string;
      exerciseName: string;
      libraryId: string;
      exerciseKey: string;
      filteredSets: RawSet[];
    };
    const validExercises: ValidExercise[] = [];

    for (const ex of exercises) {
      const libraryId = typeof ex.libraryId === "string" ? ex.libraryId : "";
      const exerciseName = typeof ex.exerciseName === "string" ? ex.exerciseName : "";
      if (!libraryId || libraryId === "unknown") continue;
      if (!exerciseName || exerciseName === "Unknown Exercise") continue;
      const exerciseKey = `${libraryId}_${exerciseName}`;
      if (exerciseKey.toLowerCase().includes("unknown")) continue;

      const rawSets = (Array.isArray(ex.sets) ? ex.sets : []) as RawSet[];
      const filteredSets = filterValidSets(rawSets);

      validExercises.push({
        exerciseId: typeof ex.exerciseId === "string" ? ex.exerciseId : "",
        exerciseName,
        libraryId,
        exerciseKey,
        filteredSets,
      });

      if (filteredSets.length > 0) {
        (sessionHistoryData.exercises as Record<string, unknown>)[exerciseKey] = {
          exerciseName,
          sets: filteredSets,
        };
      }
    }

    const userRef = db.collection("users").doc(auth.userId);

    // Read exerciseHistory, exerciseLastPerformance, and user doc in parallel
    const histRefs = validExercises.map((ex) =>
      userRef.collection("exerciseHistory").doc(ex.exerciseKey)
    );
    const lastPerfRefs = validExercises.map((ex) =>
      userRef.collection("exerciseLastPerformance").doc(ex.exerciseKey)
    );

    const [histSnaps, lastPerfSnaps, userDoc] = await Promise.all([
      Promise.all(histRefs.map((r) => r.get())),
      Promise.all(lastPerfRefs.map((r) => r.get())),
      userRef.get(),
    ]);

    const userData = userDoc.exists ? userDoc.data()! : {};

    // Atomic batch write
    const batch = db.batch();

    // sessionHistory
    batch.set(
      userRef.collection("sessionHistory").doc(sessionId),
      sessionHistoryData
    );

    // exerciseHistory + exerciseLastPerformance per exercise
    for (let i = 0; i < validExercises.length; i++) {
      const ex = validExercises[i];

      // exerciseHistory: prepend new session to existing sessions array
      const existingSessions: Array<{ date?: string; sessionId?: string; sets?: unknown[] }> =
        histSnaps[i].exists ? (histSnaps[i].data()?.sessions ?? []) : [];
      batch.set(histRefs[i], {
        sessions: [{ date: completedAt, sessionId, sets: ex.filteredSets }, ...existingSessions],
      });

      // exerciseLastPerformance: update only if this session is newer
      if (ex.filteredSets.length > 0) {
        let shouldUpdate = true;
        if (lastPerfSnaps[i].exists) {
          const existingLastPerf = lastPerfSnaps[i].data()!;
          const existingDate = existingLastPerf.lastPerformedAt ? new Date(String(existingLastPerf.lastPerformedAt)) : null;
          const newDate = new Date(completedAt);
          if (existingDate && !isNaN(existingDate.getTime()) && existingDate >= newDate) {
            shouldUpdate = false;
          }
        }
        if (shouldUpdate) {
          batch.set(lastPerfRefs[i], {
            exerciseId: ex.exerciseId,
            exerciseName: ex.exerciseName,
            libraryId: ex.libraryId,
            lastSessionId: sessionId,
            lastPerformedAt: completedAt,
            totalSets: ex.filteredSets.length,
            bestSet: pickBestSet(ex.filteredSets),
          });
        }
      }
    }

    // ── 1RM computation ───────────────────────────────────────────────────────
    type EstimateMap = Record<string, { current?: number; lastUpdated?: string; achievedWith?: { weight: number; reps: number } }>;
    const existingEstimates = (userData.oneRepMaxEstimates ?? {}) as EstimateMap;
    const userDocUpdates: Record<string, unknown> = {};
    const personalRecords: Array<{ exerciseKey: string; exerciseName: string; newEstimate1RM: number; achievedWith: { weight: number; reps: number; intensity: string | null } }> = [];
    const historyEntries: Array<{ exerciseKey: string; estimate1RM: number; date: string }> = [];

    for (const ex of validExercises) {
      if (ex.filteredSets.length === 0) continue;
      let highestEstimate = 0;
      let bestAchievedWith: { weight: number; reps: number; intensity: string | null } | null = null;

      for (const s of ex.filteredSets) {
        const w = parseFloat(String(s.weight ?? ""));
        const r = parseFloat(String(s.reps ?? ""));
        if (isNaN(w) || isNaN(r) || w <= 0 || r <= 0) continue;

        let objectiveIntensity: number | null = null;
        if (s.intensity && typeof s.intensity === "string") {
          const m = String(s.intensity).trim().replace(/\s+/g, "").match(/^(\d+)\/10$/);
          if (m) {
            const lvl = parseInt(m[1]);
            if (lvl >= 1 && lvl <= 10) objectiveIntensity = lvl;
          }
        }

        const estimate = objectiveIntensity !== null
          ? (w * (1 + 0.0333 * r)) / (1 - 0.025 * (10 - objectiveIntensity))
          : w * (1 + 0.0333 * r);

        if (estimate > highestEstimate) {
          highestEstimate = estimate;
          bestAchievedWith = { weight: w, reps: r, intensity: s.intensity ? String(s.intensity) : null };
        }
      }

      if (highestEstimate <= 0 || !bestAchievedWith) continue;
      const rounded = Math.round(highestEstimate * 10) / 10;
      const current = existingEstimates[ex.exerciseKey]?.current ?? 0;

      if (rounded > current) {
        userDocUpdates[`oneRepMaxEstimates.${ex.exerciseKey}`] = {
          current: rounded,
          lastUpdated: completedAt,
          achievedWith: { weight: bestAchievedWith.weight, reps: bestAchievedWith.reps },
        };
        historyEntries.push({ exerciseKey: ex.exerciseKey, estimate1RM: rounded, date: completedAt });
        if (current > 0) {
          personalRecords.push({
            exerciseKey: ex.exerciseKey,
            exerciseName: ex.exerciseName,
            newEstimate1RM: rounded,
            achievedWith: bestAchievedWith,
          });
        }
      }
    }

    // ── Course progress update ────────────────────────────────────────────────
    if (courseId) {
      const existingProgress = (userData.courseProgress?.[courseId] ?? {}) as Record<string, unknown>;
      const allSessionsCompleted: string[] = Array.isArray(existingProgress.allSessionsCompleted)
        ? [...existingProgress.allSessionsCompleted as string[]]
        : [];
      if (!allSessionsCompleted.includes(sessionId)) allSessionsCompleted.push(sessionId);
      const prevTotal = typeof existingProgress.totalSessionsCompleted === "number"
        ? existingProgress.totalSessionsCompleted : 0;
      userDocUpdates[`courseProgress.${courseId}`] = {
        ...existingProgress,
        lastSessionCompleted: sessionId,
        allSessionsCompleted,
        totalSessionsCompleted: prevTotal + 1,
        lastActivity: completedAt,
      };
    }

    // ── Streak update ─────────────────────────────────────────────────────────
    const activityDate = completedAt.slice(0, 10);
    const existingStreak = (userData.activityStreak ?? {}) as Record<string, unknown>;
    const lastActivityDate = workoutToYMD(existingStreak.lastActivityDate);
    const streakStartDate = workoutToYMD(existingStreak.streakStartDate);

    if (!lastActivityDate || activityDate >= lastActivityDate) {
      const daysSinceLast = lastActivityDate
        ? Math.round((new Date(activityDate + "T12:00:00").getTime() - new Date(lastActivityDate + "T12:00:00").getTime()) / 86400000)
        : null;
      const isDead = daysSinceLast !== null && daysSinceLast >= 4;
      const nextStart = (!streakStartDate || isDead) ? activityDate : streakStartDate;
      const currentLength = Math.round(
        (new Date(activityDate + "T12:00:00").getTime() - new Date(nextStart + "T12:00:00").getTime()) / 86400000
      ) + 1;
      const currentLongest = typeof existingStreak.longestStreak === "number" ? existingStreak.longestStreak : 0;
      const newStreakData: Record<string, unknown> = { streakStartDate: nextStart, lastActivityDate: activityDate };
      if (currentLength > currentLongest) {
        newStreakData.longestStreak = currentLength;
        newStreakData.longestStreakStartDate = nextStart;
        newStreakData.longestStreakEndDate = activityDate;
      } else {
        if (existingStreak.longestStreak != null) newStreakData.longestStreak = existingStreak.longestStreak;
        if (existingStreak.longestStreakStartDate != null) newStreakData.longestStreakStartDate = workoutToYMD(existingStreak.longestStreakStartDate);
        if (existingStreak.longestStreakEndDate != null) newStreakData.longestStreakEndDate = workoutToYMD(existingStreak.longestStreakEndDate);
      }
      userDocUpdates.activityStreak = newStreakData;
    }

    // Apply user doc updates to batch
    if (Object.keys(userDocUpdates).length > 0) {
      batch.update(userRef, userDocUpdates);
    }

    await batch.commit();

    // Add 1RM history entries (outside batch — subcollection addDoc)
    if (historyEntries.length > 0) {
      await Promise.all(historyEntries.map(({ exerciseKey, estimate1RM, date }) =>
        userRef.collection("oneRepMaxHistory").doc(exerciseKey)
          .collection("records").add({ estimate: estimate1RM, date })
      ));
    }

    // Build streak for response
    const finalStreakData = (userDocUpdates.activityStreak ?? existingStreak) as Record<string, unknown>;
    const finalStreakStart = workoutToYMD(finalStreakData.streakStartDate);
    const finalLastActivity = workoutToYMD(finalStreakData.lastActivityDate);
    const { currentStreak, flameLevel } = workoutComputeStreak(finalStreakStart, finalLastActivity, activityDate);

    res.json({
      data: {
        completionId: sessionId,
        personalRecords,
        streak: {
          currentStreak,
          longestStreak: typeof finalStreakData.longestStreak === "number" ? finalStreakData.longestStreak : 0,
          lastActivityDate: finalLastActivity,
          flameLevel,
        },
        exercisesWritten: validExercises.length,
      },
    });
  } catch (err) { next(err); }
});

// ─── 7. Creator Domain ───────────────────────────────────────────────────────

// Helper: ensure caller is creator/admin
function assertCreator(auth: AuthResult): void {
  if (auth.role !== "creator" && auth.role !== "admin") {
    throw apiError("FORBIDDEN", "Only creators can access this", 403);
  }
}

// Helper: find one_on_one_clients doc for creator + clientUserId, throw FORBIDDEN if missing
async function requireClientRelationship(
  creatorId: string,
  clientUserId: string
): Promise<FirebaseFirestore.QueryDocumentSnapshot> {
  const snap = await db.collection("one_on_one_clients")
    .where("creatorId", "==", creatorId)
    .where("clientUserId", "==", clientUserId)
    .limit(1).get();
  if (snap.empty) throw apiError("FORBIDDEN", "Client not found or not accessible", 403);
  return snap.docs[0];
}

// Helper: verify creator owns plan, returns plan doc
async function assertPlanOwner(
  creatorId: string,
  planId: string
): Promise<FirebaseFirestore.DocumentSnapshot> {
  const ref = db.collection("plans").doc(planId);
  const doc = await ref.get();
  if (!doc.exists) throw apiError("NOT_FOUND", "Plan not found", 404);
  if (doc.data()?.creatorId !== creatorId) throw apiError("FORBIDDEN", "Not your plan", 403);
  return doc;
}

// ── 7.1 Client Management ─────────────────────────────────────────────────────

app.post("/api/v1/creator/clients/lookup", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    assertCreator(auth);
    const body = validateBody<{ emailOrUsername: string }>({ emailOrUsername: "string" }, req.body);
    const trimmed = body.emailOrUsername.trim();
    if (!trimmed) throw apiError("VALIDATION_ERROR", "Proporciona un email o nombre de usuario", 400, "emailOrUsername");

    let userId: string | null = null;
    let displayName = "";
    let email = "";
    let username = "";
    let userDocData: Record<string, unknown> | null = null;

    if (trimmed.includes("@")) {
      try {
        const authUser = await admin.auth().getUserByEmail(trimmed);
        userId = authUser.uid;
        email = authUser.email ?? trimmed;
        displayName = authUser.displayName ?? "";
      } catch (_) {
        // not found by email, fall through
      }
    }

    if (!userId) {
      const snap = await db.collection("users")
        .where("username", "==", trimmed.toLowerCase())
        .limit(1).get();
      if (!snap.empty) {
        const uDoc = snap.docs[0];
        userId = uDoc.id;
        userDocData = uDoc.data() as Record<string, unknown>;
        displayName = String(userDocData.displayName ?? userDocData.name ?? "");
        email = String(userDocData.email ?? "");
        username = String(userDocData.username ?? trimmed);
      }
    }

    if (userId) {
      const uDoc = await db.collection("users").doc(userId).get();
      if (uDoc.exists) {
        userDocData = uDoc.data() as Record<string, unknown>;
        displayName = displayName || String(userDocData.displayName ?? userDocData.name ?? "");
        email = email || String(userDocData.email ?? "");
        username = username || String(userDocData.username ?? "");
      }
    }

    if (!userId) throw apiError("NOT_FOUND", "No se encontró ningún usuario con ese email o nombre de usuario", 404);

    let age: number | null = null;
    let gender: string | null = null;
    let country: string | null = null;
    let city: string | null = null;
    let height: number | string | null = null;
    let weight: number | string | null = null;
    if (userDocData) {
      const d = userDocData;
      const ageVal = d.age;
      age = typeof ageVal === "number" && !isNaN(ageVal) ? ageVal : null;
      if (age === null && d.birthDate) {
        const raw = d.birthDate as { toDate?: () => Date } | string;
        const bd = typeof raw === "object" && raw?.toDate ? raw.toDate() : new Date(raw as string);
        if (!isNaN(bd.getTime())) {
          age = new Date().getFullYear() - bd.getFullYear();
          const md = new Date().getMonth() - bd.getMonth();
          if (md < 0 || (md === 0 && new Date().getDate() < bd.getDate())) age--;
        }
      }
      gender = String(d.gender ?? "") || null;
      country = String(d.country ?? "") || null;
      city = String(d.city ?? d.location ?? "") || null;
      const h = d.height;
      height = h != null && (typeof h === "number" || typeof h === "string") ? h : null;
      const w = d.bodyweight ?? d.weight;
      weight = w != null && (typeof w === "number" || typeof w === "string") ? w : null;
    }

    res.json({
      data: {
        userId,
        displayName: displayName || null,
        email: email || null,
        username: username || null,
        age,
        gender,
        country,
        city,
        height,
        weight,
      },
    });
  } catch (err) { next(err); }
});

app.get("/api/v1/creator/clients", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    assertCreator(auth);
    const PAGE_SIZE = 50;
    const { pageToken } = req.query as Record<string, string | undefined>;

    let q: FirebaseFirestore.Query = db.collection("one_on_one_clients")
      .where("creatorId", "==", auth.userId)
      .orderBy("createdAt", "desc")
      .limit(PAGE_SIZE + 1);

    if (pageToken) {
      const cursor = Buffer.from(pageToken, "base64").toString("utf8");
      q = q.startAfter(cursor);
    }

    const snap = await q.get();
    const hasMore = snap.docs.length > PAGE_SIZE;
    const docs = hasMore ? snap.docs.slice(0, PAGE_SIZE) : snap.docs;

    const data = docs.map((d) => {
      const e = d.data();
      return {
        clientId: e.clientUserId ?? d.id,
        displayName: e.clientName ?? "",
        profilePictureUrl: null as string | null,
        email: e.clientEmail ?? "",
        enrolledPrograms: [] as Array<{ courseId: string; title: string; assignedAt: string }>,
        addedAt: e.createdAt?.toDate?.()?.toISOString() ?? null,
      };
    });

    const lastCreatedAt = docs.length > 0
      ? (docs[docs.length - 1].data().createdAt?.toDate?.()?.toISOString() ?? docs[docs.length - 1].id)
      : null;

    res.json({
      data,
      nextPageToken: hasMore && lastCreatedAt ? Buffer.from(lastCreatedAt).toString("base64") : null,
      hasMore,
    });
  } catch (err) { next(err); }
});

app.post("/api/v1/creator/clients", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    assertCreator(auth);
    const body = validateBody<{ email: string }>({ email: "string" }, req.body);
    const email = body.email.trim().toLowerCase();
    if (!email) throw apiError("VALIDATION_ERROR", "email is required", 400, "email");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw apiError("VALIDATION_ERROR", "Formato de email inválido", 400, "email");

    // Lookup user by email via Firebase Auth
    let clientUserId: string;
    let displayName = "";
    let clientEmail = email;
    try {
      const authUser = await admin.auth().getUserByEmail(email);
      clientUserId = authUser.uid;
      displayName = authUser.displayName ?? "";
      clientEmail = authUser.email ?? email;
    } catch (_) {
      throw apiError("NOT_FOUND", "No se encontró ningún usuario con ese email", 404);
    }

    // Check already a client
    const existingSnap = await db.collection("one_on_one_clients")
      .where("creatorId", "==", auth.userId)
      .where("clientUserId", "==", clientUserId)
      .limit(1).get();
    if (!existingSnap.empty) throw apiError("CONFLICT", "Este usuario ya es tu cliente", 409);

    // Enrich name from Firestore user doc
    const userDoc = await db.collection("users").doc(clientUserId).get();
    if (userDoc.exists) {
      const ud = userDoc.data()!;
      displayName = displayName || String(ud.displayName ?? ud.name ?? "");
    }

    const batch = db.batch();
    const clientRef = db.collection("one_on_one_clients").doc();
    batch.set(clientRef, {
      creatorId: auth.userId,
      clientUserId,
      clientName: displayName,
      clientEmail,
      courseId: [],
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    const accessRef = db.collection("creator_client_access").doc(`${auth.userId}_${clientUserId}`);
    batch.set(accessRef, { creatorId: auth.userId, userId: clientUserId, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    await batch.commit();

    res.status(201).json({ data: { clientId: clientUserId, displayName, email: clientEmail } });
  } catch (err) { next(err); }
});

app.get("/api/v1/creator/clients/:clientId", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    assertCreator(auth);
    const clientDoc = await requireClientRelationship(auth.userId, req.params.clientId);
    const e = clientDoc.data();
    const userDoc = await db.collection("users").doc(req.params.clientId).get();
    const u = userDoc.exists ? userDoc.data()! : {} as Record<string, unknown>;
    res.json({
      data: {
        clientId: req.params.clientId,
        displayName: e.clientName ?? "",
        email: e.clientEmail ?? "",
        profilePictureUrl: (u.profilePictureUrl ?? u.profile_picture_url ?? null) as string | null,
        name: (u.name ?? u.displayName ?? "") as string,
        username: (u.username ?? "") as string,
        age: (u.age ?? null) as number | null,
        gender: (u.gender ?? "") as string,
        country: (u.country ?? "") as string,
        city: (u.city ?? "") as string,
        height: (u.height ?? null) as number | null,
        addedAt: e.createdAt?.toDate?.()?.toISOString() ?? null,
      },
    });
  } catch (err) { next(err); }
});

app.delete("/api/v1/creator/clients/:clientId", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    assertCreator(auth);
    const clientDoc = await requireClientRelationship(auth.userId, req.params.clientId);
    const batch = db.batch();
    batch.delete(clientDoc.ref);
    const accessRef = db.collection("creator_client_access").doc(`${auth.userId}_${req.params.clientId}`);
    if ((await accessRef.get()).exists) batch.delete(accessRef);
    await batch.commit();
    res.status(204).end();
  } catch (err) { next(err); }
});

// ── 7.2 Client Workout Data (read-only) ────────────────────────────────────────

app.get("/api/v1/creator/clients/:clientId/workout/sessions", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    assertCreator(auth);
    await requireClientRelationship(auth.userId, req.params.clientId);
    const PAGE_SIZE = 20;
    const { pageToken } = req.query as Record<string, string | undefined>;

    let q: FirebaseFirestore.Query = db.collection("users").doc(req.params.clientId)
      .collection("sessionHistory")
      .orderBy("completedAt", "desc")
      .limit(PAGE_SIZE + 1);

    if (pageToken) {
      const decoded = Buffer.from(pageToken, "base64").toString("utf8");
      q = q.startAfter(decoded);
    }

    const snap = await q.get();
    const hasMore = snap.docs.length > PAGE_SIZE;
    const docs = hasMore ? snap.docs.slice(0, PAGE_SIZE) : snap.docs;

    const sessions = docs.map((d) => {
      const s = d.data();
      return {
        sessionId: d.id,
        courseId: s.courseId ?? null,
        courseName: s.courseName ?? null,
        sessionName: s.sessionName ?? null,
        completedAt: s.completedAt ?? null,
        duration: s.duration ?? 0,
        userNotes: s.userNotes ?? "",
      };
    });

    const lastCompletedAt = docs.length > 0
      ? (docs[docs.length - 1].data().completedAt ?? docs[docs.length - 1].id)
      : null;

    res.json({
      data: sessions,
      nextPageToken: hasMore && lastCompletedAt ? Buffer.from(String(lastCompletedAt)).toString("base64") : null,
      hasMore,
    });
  } catch (err) { next(err); }
});

app.get("/api/v1/creator/clients/:clientId/workout/sessions/:sessionId", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    assertCreator(auth);
    await requireClientRelationship(auth.userId, req.params.clientId);
    const snap = await db.collection("users").doc(req.params.clientId)
      .collection("sessionHistory").doc(req.params.sessionId).get();
    if (!snap.exists) throw apiError("NOT_FOUND", "Session not found", 404);
    const s = snap.data()!;
    res.json({
      data: {
        sessionId: snap.id,
        courseId: s.courseId ?? null,
        courseName: s.courseName ?? null,
        sessionName: s.sessionName ?? null,
        completedAt: s.completedAt ?? null,
        duration: s.duration ?? 0,
        userNotes: s.userNotes ?? "",
        exercises: s.exercises ?? {},
      },
    });
  } catch (err) { next(err); }
});

app.get("/api/v1/creator/clients/:clientId/progress/body-log", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    assertCreator(auth);
    await requireClientRelationship(auth.userId, req.params.clientId);
    const PAGE_SIZE = 30;
    const { pageToken } = req.query as Record<string, string | undefined>;

    let q: FirebaseFirestore.Query = db.collection("users").doc(req.params.clientId)
      .collection("bodyLog").orderBy("date", "desc").limit(PAGE_SIZE + 1);

    if (pageToken) {
      const decoded = Buffer.from(pageToken, "base64").toString("utf8");
      q = q.startAfter(decoded);
    }

    const snap = await q.get();
    const hasMore = snap.docs.length > PAGE_SIZE;
    const docs = hasMore ? snap.docs.slice(0, PAGE_SIZE) : snap.docs;

    res.json({
      data: docs.map((d) => {
        const e = d.data();
        return {
          date: d.id,
          weight: e.weight ?? null,
          note: e.note ?? null,
          updatedAt: e.updatedAt?.toDate?.()?.toISOString() ?? null,
        };
      }),
      nextPageToken: hasMore ? Buffer.from(docs[docs.length - 1].id).toString("base64") : null,
      hasMore,
    });
  } catch (err) { next(err); }
});

app.get("/api/v1/creator/clients/:clientId/progress/readiness", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    assertCreator(auth);
    await requireClientRelationship(auth.userId, req.params.clientId);
    const { startDate, endDate, date } = req.query as Record<string, string | undefined>;

    let q: FirebaseFirestore.Query = db.collection("users").doc(req.params.clientId)
      .collection("readiness").orderBy("date", "desc");

    if (date) {
      q = q.where("date", "==", parseDateParam(date, "date"));
    } else {
      if (startDate) q = q.where("date", ">=", parseDateParam(startDate, "startDate"));
      if (endDate) q = q.where("date", "<=", parseDateParam(endDate, "endDate"));
    }
    q = q.limit(60);

    const snap = await q.get();
    res.json({
      data: snap.docs.map((d) => {
        const e = d.data();
        return {
          date: e.date ?? d.id,
          fatigue: e.fatigue ?? null,
          mood: e.mood ?? null,
          sleep: e.sleep ?? null,
          stress: e.stress ?? null,
          notes: e.notes ?? null,
          createdAt: e.createdAt?.toDate?.()?.toISOString() ?? null,
        };
      }),
    });
  } catch (err) { next(err); }
});

// ── 7.3 Plans (Reusable Training Content) ──────────────────────────────────────

app.get("/api/v1/creator/plans", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    assertCreator(auth);
    const snap = await db.collection("plans")
      .where("creatorId", "==", auth.userId)
      .orderBy("createdAt", "desc")
      .get();
    res.json({
      data: snap.docs.map((d) => {
        const e = d.data();
        return {
          planId: d.id,
          title: e.title ?? "",
          description: e.description ?? null,
          discipline: e.discipline ?? null,
          moduleCount: e.moduleCount ?? 0,
          createdAt: e.createdAt?.toDate?.()?.toISOString() ?? null,
        };
      }),
    });
  } catch (err) { next(err); }
});

app.post("/api/v1/creator/plans", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    assertCreator(auth);
    const body = validateBody<{ title: string; description?: string; discipline?: string }>(
      { title: "string" }, req.body
    );
    const planRef = db.collection("plans").doc();
    const moduleRef = planRef.collection("modules").doc();
    const batch = db.batch();
    const now = FieldValue.serverTimestamp();
    batch.set(planRef, {
      title: body.title,
      description: body.description ?? null,
      discipline: body.discipline ?? null,
      creatorId: auth.userId,
      moduleCount: 1,
      createdAt: now,
      updatedAt: now,
    });
    batch.set(moduleRef, {
      title: "Semana 1",
      order: 0,
      createdAt: now,
      updatedAt: now,
    });
    await batch.commit();
    res.status(201).json({ data: { planId: planRef.id, firstModuleId: moduleRef.id, createdAt: new Date().toISOString() } });
  } catch (err) { next(err); }
});

app.get("/api/v1/creator/plans/:planId", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    assertCreator(auth);
    const planDoc = await assertPlanOwner(auth.userId, req.params.planId);
    const e = planDoc.data()!;
    const modulesSnap = await db.collection("plans").doc(req.params.planId)
      .collection("modules").orderBy("order", "asc").get();
    const modules = await Promise.all(modulesSnap.docs.map(async (modDoc) => {
      const sessionsSnap = await modDoc.ref.collection("sessions").orderBy("order", "asc").get();
      const sessions = await Promise.all(sessionsSnap.docs.map(async (sDoc) => {
        const exSnap = await sDoc.ref.collection("exercises").get();
        const s = sDoc.data();
        return {
          sessionId: sDoc.id,
          title: s.title ?? "",
          order: s.order ?? 0,
          librarySessionRef: s.librarySessionRef ?? null,
          exerciseCount: exSnap.size,
        };
      }));
      const m = modDoc.data();
      return { moduleId: modDoc.id, title: m.title ?? "", order: m.order ?? 0, sessions };
    }));
    res.json({
      data: {
        planId: planDoc.id,
        title: e.title ?? "",
        description: e.description ?? null,
        discipline: e.discipline ?? null,
        modules,
      },
    });
  } catch (err) { next(err); }
});

app.patch("/api/v1/creator/plans/:planId", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    assertCreator(auth);
    await assertPlanOwner(auth.userId, req.params.planId);
    const { title, description, discipline } = req.body as Record<string, unknown>;
    const update: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
    if (title !== undefined) update.title = title;
    if (description !== undefined) update.description = description;
    if (discipline !== undefined) update.discipline = discipline;
    await db.collection("plans").doc(req.params.planId).update(update);
    res.json({ data: { planId: req.params.planId, updatedAt: new Date().toISOString() } });
  } catch (err) { next(err); }
});

app.delete("/api/v1/creator/plans/:planId", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    assertCreator(auth);
    await assertPlanOwner(auth.userId, req.params.planId);
    const planRef = db.collection("plans").doc(req.params.planId);
    const modulesSnap = await planRef.collection("modules").get();
    for (const modDoc of modulesSnap.docs) {
      const sessionsSnap = await modDoc.ref.collection("sessions").get();
      for (const sDoc of sessionsSnap.docs) {
        const exSnap = await sDoc.ref.collection("exercises").get();
        const batch = db.batch();
        for (const exDoc of exSnap.docs) {
          const setsSnap = await exDoc.ref.collection("sets").get();
          setsSnap.docs.forEach((s) => batch.delete(s.ref));
          batch.delete(exDoc.ref);
        }
        batch.delete(sDoc.ref);
        await batch.commit();
      }
      await modDoc.ref.delete();
    }
    await planRef.delete();
    res.status(204).end();
  } catch (err) { next(err); }
});

app.post("/api/v1/creator/plans/:planId/modules", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    assertCreator(auth);
    await assertPlanOwner(auth.userId, req.params.planId);
    const body = validateBody<{ title: string; order: number }>(
      { title: "string", order: "number" }, req.body
    );
    const ref = await db.collection("plans").doc(req.params.planId)
      .collection("modules").add({
        title: body.title,
        order: body.order,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    await db.collection("plans").doc(req.params.planId).update({
      moduleCount: FieldValue.increment(1),
      updatedAt: FieldValue.serverTimestamp(),
    });
    res.status(201).json({ data: { moduleId: ref.id } });
  } catch (err) { next(err); }
});

app.patch("/api/v1/creator/plans/:planId/modules/:moduleId", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    assertCreator(auth);
    await assertPlanOwner(auth.userId, req.params.planId);
    const ref = db.collection("plans").doc(req.params.planId)
      .collection("modules").doc(req.params.moduleId);
    if (!(await ref.get()).exists) throw apiError("NOT_FOUND", "Module not found", 404);
    const { title, order } = req.body as Record<string, unknown>;
    const update: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
    if (title !== undefined) update.title = title;
    if (order !== undefined) update.order = order;
    await ref.update(update);
    res.json({ data: { moduleId: req.params.moduleId, updatedAt: new Date().toISOString() } });
  } catch (err) { next(err); }
});

app.delete("/api/v1/creator/plans/:planId/modules/:moduleId", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    assertCreator(auth);
    await assertPlanOwner(auth.userId, req.params.planId);
    const modRef = db.collection("plans").doc(req.params.planId)
      .collection("modules").doc(req.params.moduleId);
    if (!(await modRef.get()).exists) throw apiError("NOT_FOUND", "Module not found", 404);
    const sessionsSnap = await modRef.collection("sessions").get();
    for (const sDoc of sessionsSnap.docs) {
      const exSnap = await sDoc.ref.collection("exercises").get();
      const batch = db.batch();
      for (const exDoc of exSnap.docs) {
        const setsSnap = await exDoc.ref.collection("sets").get();
        setsSnap.docs.forEach((s) => batch.delete(s.ref));
        batch.delete(exDoc.ref);
      }
      batch.delete(sDoc.ref);
      await batch.commit();
    }
    await modRef.delete();
    await db.collection("plans").doc(req.params.planId).update({
      moduleCount: FieldValue.increment(-1),
      updatedAt: FieldValue.serverTimestamp(),
    });
    res.status(204).end();
  } catch (err) { next(err); }
});

app.post("/api/v1/creator/plans/:planId/modules/:moduleId/sessions", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    assertCreator(auth);
    await assertPlanOwner(auth.userId, req.params.planId);
    const modRef = db.collection("plans").doc(req.params.planId)
      .collection("modules").doc(req.params.moduleId);
    if (!(await modRef.get()).exists) throw apiError("NOT_FOUND", "Module not found", 404);
    const body = validateBody<{ title: string; order: number; librarySessionRef?: string | null }>(
      { title: "string", order: "number" }, req.body
    );
    const ref = await modRef.collection("sessions").add({
      title: body.title,
      order: body.order,
      librarySessionRef: body.librarySessionRef ?? null,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    res.status(201).json({ data: { sessionId: ref.id } });
  } catch (err) { next(err); }
});

app.get("/api/v1/creator/plans/:planId/modules/:moduleId/sessions/:sessionId", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    assertCreator(auth);
    await assertPlanOwner(auth.userId, req.params.planId);
    const sessionRef = db.collection("plans").doc(req.params.planId)
      .collection("modules").doc(req.params.moduleId)
      .collection("sessions").doc(req.params.sessionId);
    const sessionDoc = await sessionRef.get();
    if (!sessionDoc.exists) throw apiError("NOT_FOUND", "Session not found", 404);
    const s = sessionDoc.data()!;

    let exercises: unknown[] = [];
    if (s.librarySessionRef) {
      const libRef = db.collection("creator_libraries").doc(auth.userId)
        .collection("sessions").doc(s.librarySessionRef);
      const libDoc = await libRef.get();
      if (libDoc.exists) {
        const exSnap = await libRef.collection("exercises").get();
        exercises = await Promise.all(exSnap.docs.map(async (exDoc) => {
          const setsSnap = await exDoc.ref.collection("sets").orderBy("order", "asc").get();
          const ex = exDoc.data();
          return {
            exerciseId: exDoc.id,
            name: ex.name ?? "",
            libraryId: ex.libraryId ?? null,
            primaryMuscles: ex.primaryMuscles ?? [],
            order: ex.order ?? 0,
            sets: setsSnap.docs.map((setDoc) => ({ setId: setDoc.id, ...setDoc.data() })),
          };
        }));
        exercises.sort((a, b) =>
          ((a as Record<string, unknown>).order as number ?? 0) -
          ((b as Record<string, unknown>).order as number ?? 0)
        );
      }
    } else {
      const exSnap = await sessionRef.collection("exercises").get();
      exercises = await Promise.all(exSnap.docs.map(async (exDoc) => {
        const setsSnap = await exDoc.ref.collection("sets").orderBy("order", "asc").get();
        const ex = exDoc.data();
        return {
          exerciseId: exDoc.id,
          name: ex.name ?? "",
          libraryId: ex.libraryId ?? null,
          primaryMuscles: ex.primaryMuscles ?? [],
          order: ex.order ?? 0,
          sets: setsSnap.docs.map((setDoc) => ({ setId: setDoc.id, ...setDoc.data() })),
        };
      }));
      exercises.sort((a, b) =>
        ((a as Record<string, unknown>).order as number ?? 0) -
        ((b as Record<string, unknown>).order as number ?? 0)
      );
    }

    res.json({
      data: {
        sessionId: sessionDoc.id,
        title: s.title ?? "",
        librarySessionRef: s.librarySessionRef ?? null,
        exercises,
      },
    });
  } catch (err) { next(err); }
});

app.patch("/api/v1/creator/plans/:planId/modules/:moduleId/sessions/:sessionId", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    assertCreator(auth);
    await assertPlanOwner(auth.userId, req.params.planId);
    const sessionRef = db.collection("plans").doc(req.params.planId)
      .collection("modules").doc(req.params.moduleId)
      .collection("sessions").doc(req.params.sessionId);
    if (!(await sessionRef.get()).exists) throw apiError("NOT_FOUND", "Session not found", 404);
    const { title, order, librarySessionRef } = req.body as Record<string, unknown>;
    const update: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
    if (title !== undefined) update.title = title;
    if (order !== undefined) update.order = order;
    if (librarySessionRef !== undefined) update.librarySessionRef = librarySessionRef;
    await sessionRef.update(update);
    res.json({ data: { sessionId: req.params.sessionId, updatedAt: new Date().toISOString() } });
  } catch (err) { next(err); }
});

app.delete("/api/v1/creator/plans/:planId/modules/:moduleId/sessions/:sessionId", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    assertCreator(auth);
    await assertPlanOwner(auth.userId, req.params.planId);
    const sessionRef = db.collection("plans").doc(req.params.planId)
      .collection("modules").doc(req.params.moduleId)
      .collection("sessions").doc(req.params.sessionId);
    if (!(await sessionRef.get()).exists) throw apiError("NOT_FOUND", "Session not found", 404);
    const exSnap = await sessionRef.collection("exercises").get();
    const batch = db.batch();
    for (const exDoc of exSnap.docs) {
      const setsSnap = await exDoc.ref.collection("sets").get();
      setsSnap.docs.forEach((s) => batch.delete(s.ref));
      batch.delete(exDoc.ref);
    }
    batch.delete(sessionRef);
    await batch.commit();
    res.status(204).end();
  } catch (err) { next(err); }
});

app.post("/api/v1/creator/plans/:planId/modules/:moduleId/sessions/:sessionId/exercises", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    assertCreator(auth);
    await assertPlanOwner(auth.userId, req.params.planId);
    const body = validateBody<{ name: string; order: number; libraryId?: string | null; primaryMuscles?: string[] }>(
      { name: "string", order: "number" }, req.body
    );
    const sessionRef = db.collection("plans").doc(req.params.planId)
      .collection("modules").doc(req.params.moduleId)
      .collection("sessions").doc(req.params.sessionId);
    if (!(await sessionRef.get()).exists) throw apiError("NOT_FOUND", "Session not found", 404);
    const ref = await sessionRef.collection("exercises").add({
      name: body.name,
      order: body.order,
      libraryId: body.libraryId ?? null,
      primaryMuscles: body.primaryMuscles ?? [],
      createdAt: FieldValue.serverTimestamp(),
    });
    res.status(201).json({ data: { exerciseId: ref.id } });
  } catch (err) { next(err); }
});

app.patch("/api/v1/creator/plans/:planId/modules/:moduleId/sessions/:sessionId/exercises/:exerciseId", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    assertCreator(auth);
    await assertPlanOwner(auth.userId, req.params.planId);
    const exRef = db.collection("plans").doc(req.params.planId)
      .collection("modules").doc(req.params.moduleId)
      .collection("sessions").doc(req.params.sessionId)
      .collection("exercises").doc(req.params.exerciseId);
    if (!(await exRef.get()).exists) throw apiError("NOT_FOUND", "Exercise not found", 404);
    const { name, order, primaryMuscles, libraryId } = req.body as Record<string, unknown>;
    const update: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
    if (name !== undefined) update.name = name;
    if (order !== undefined) update.order = order;
    if (primaryMuscles !== undefined) update.primaryMuscles = primaryMuscles;
    if (libraryId !== undefined) update.libraryId = libraryId;
    await exRef.update(update);
    res.json({ data: { exerciseId: req.params.exerciseId, updatedAt: new Date().toISOString() } });
  } catch (err) { next(err); }
});

app.delete("/api/v1/creator/plans/:planId/modules/:moduleId/sessions/:sessionId/exercises/:exerciseId", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    assertCreator(auth);
    await assertPlanOwner(auth.userId, req.params.planId);
    const exRef = db.collection("plans").doc(req.params.planId)
      .collection("modules").doc(req.params.moduleId)
      .collection("sessions").doc(req.params.sessionId)
      .collection("exercises").doc(req.params.exerciseId);
    if (!(await exRef.get()).exists) throw apiError("NOT_FOUND", "Exercise not found", 404);
    const setsSnap = await exRef.collection("sets").get();
    const batch = db.batch();
    setsSnap.docs.forEach((s) => batch.delete(s.ref));
    batch.delete(exRef);
    await batch.commit();
    res.status(204).end();
  } catch (err) { next(err); }
});

app.post("/api/v1/creator/plans/:planId/modules/:moduleId/sessions/:sessionId/exercises/:exerciseId/sets", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    assertCreator(auth);
    await assertPlanOwner(auth.userId, req.params.planId);
    const body = validateBody<{ reps: string; order: number; weight?: number | null; intensity?: string | null; rir?: number | null }>(
      { reps: "string", order: "number" }, req.body
    );
    const exRef = db.collection("plans").doc(req.params.planId)
      .collection("modules").doc(req.params.moduleId)
      .collection("sessions").doc(req.params.sessionId)
      .collection("exercises").doc(req.params.exerciseId);
    if (!(await exRef.get()).exists) throw apiError("NOT_FOUND", "Exercise not found", 404);
    const ref = await exRef.collection("sets").add({
      reps: body.reps,
      order: body.order,
      weight: body.weight ?? null,
      intensity: body.intensity ?? null,
      rir: body.rir ?? null,
      createdAt: FieldValue.serverTimestamp(),
    });
    res.status(201).json({ data: { setId: ref.id } });
  } catch (err) { next(err); }
});

app.patch("/api/v1/creator/plans/:planId/modules/:moduleId/sessions/:sessionId/exercises/:exerciseId/sets/:setId", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    assertCreator(auth);
    await assertPlanOwner(auth.userId, req.params.planId);
    const setRef = db.collection("plans").doc(req.params.planId)
      .collection("modules").doc(req.params.moduleId)
      .collection("sessions").doc(req.params.sessionId)
      .collection("exercises").doc(req.params.exerciseId)
      .collection("sets").doc(req.params.setId);
    if (!(await setRef.get()).exists) throw apiError("NOT_FOUND", "Set not found", 404);
    const { reps, order, weight, intensity, rir } = req.body as Record<string, unknown>;
    const update: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
    if (reps !== undefined) update.reps = reps;
    if (order !== undefined) update.order = order;
    if (weight !== undefined) update.weight = weight;
    if (intensity !== undefined) update.intensity = intensity;
    if (rir !== undefined) update.rir = rir;
    await setRef.update(update);
    res.json({ data: { setId: req.params.setId, updatedAt: new Date().toISOString() } });
  } catch (err) { next(err); }
});

app.delete("/api/v1/creator/plans/:planId/modules/:moduleId/sessions/:sessionId/exercises/:exerciseId/sets/:setId", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    assertCreator(auth);
    await assertPlanOwner(auth.userId, req.params.planId);
    const setRef = db.collection("plans").doc(req.params.planId)
      .collection("modules").doc(req.params.moduleId)
      .collection("sessions").doc(req.params.sessionId)
      .collection("exercises").doc(req.params.exerciseId)
      .collection("sets").doc(req.params.setId);
    if (!(await setRef.get()).exists) throw apiError("NOT_FOUND", "Set not found", 404);
    await setRef.delete();
    res.status(204).end();
  } catch (err) { next(err); }
});

// ── 7.4 Creator Library — Sessions ─────────────────────────────────────────────

app.get("/api/v1/creator/library/sessions", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    assertCreator(auth);
    const snap = await db.collection("creator_libraries").doc(auth.userId)
      .collection("sessions").orderBy("created_at", "desc").get();
    res.json({
      data: snap.docs
        .filter((d) => d.data().showInLibrary !== false)
        .map((d) => {
          const e = d.data();
          return {
            sessionId: d.id,
            title: e.title ?? "",
            exerciseCount: 0,
            primaryMuscles: [] as string[],
            createdAt: e.created_at?.toDate?.()?.toISOString() ?? null,
            updatedAt: e.updated_at?.toDate?.()?.toISOString() ?? null,
          };
        }),
    });
  } catch (err) { next(err); }
});

app.post("/api/v1/creator/library/sessions", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    assertCreator(auth);
    const body = validateBody<{ title: string }>({ title: "string" }, req.body);
    const ref = await db.collection("creator_libraries").doc(auth.userId)
      .collection("sessions").add({
        title: body.title,
        creator_id: auth.userId,
        showInLibrary: true,
        version: 1,
        created_at: FieldValue.serverTimestamp(),
        updated_at: FieldValue.serverTimestamp(),
      });
    res.status(201).json({ data: { sessionId: ref.id, createdAt: new Date().toISOString() } });
  } catch (err) { next(err); }
});

app.get("/api/v1/creator/library/sessions/:sessionId", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    assertCreator(auth);
    const sessionRef = db.collection("creator_libraries").doc(auth.userId)
      .collection("sessions").doc(req.params.sessionId);
    const sessionDoc = await sessionRef.get();
    if (!sessionDoc.exists) throw apiError("NOT_FOUND", "Library session not found", 404);
    if ((sessionDoc.data()?.creator_id ?? auth.userId) !== auth.userId) {
      throw apiError("FORBIDDEN", "Not your library session", 403);
    }

    const exercisesSnap = await sessionRef.collection("exercises").get();
    const exercises = await Promise.all(exercisesSnap.docs.map(async (exDoc) => {
      const setsSnap = await exDoc.ref.collection("sets").orderBy("order", "asc").get();
      return {
        exerciseId: exDoc.id,
        ...exDoc.data(),
        sets: setsSnap.docs.map((s) => ({ setId: s.id, ...s.data() })),
      };
    }));
    exercises.sort((a, b) => ((a as Record<string, unknown>).order as number ?? 0) - ((b as Record<string, unknown>).order as number ?? 0));

    const e = sessionDoc.data()!;
    res.json({
      data: {
        sessionId: sessionDoc.id,
        title: e.title ?? "",
        exercises,
        createdAt: e.created_at?.toDate?.()?.toISOString() ?? null,
        updatedAt: e.updated_at?.toDate?.()?.toISOString() ?? null,
      },
    });
  } catch (err) { next(err); }
});

app.patch("/api/v1/creator/library/sessions/:sessionId", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    assertCreator(auth);
    const ref = db.collection("creator_libraries").doc(auth.userId)
      .collection("sessions").doc(req.params.sessionId);
    const doc = await ref.get();
    if (!doc.exists) throw apiError("NOT_FOUND", "Library session not found", 404);
    const body = validateBody<{ title: string }>({ title: "string" }, req.body);
    await ref.update({ title: body.title, updated_at: FieldValue.serverTimestamp() });
    res.json({ data: { updatedAt: new Date().toISOString() } });
  } catch (err) { next(err); }
});

app.delete("/api/v1/creator/library/sessions/:sessionId", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    assertCreator(auth);
    const ref = db.collection("creator_libraries").doc(auth.userId)
      .collection("sessions").doc(req.params.sessionId);
    if (!(await ref.get()).exists) throw apiError("NOT_FOUND", "Library session not found", 404);
    // Delete exercises and their sets, then the session doc
    const exSnap = await ref.collection("exercises").get();
    const batch = db.batch();
    for (const exDoc of exSnap.docs) {
      const setsSnap = await exDoc.ref.collection("sets").get();
      setsSnap.docs.forEach((s) => batch.delete(s.ref));
      batch.delete(exDoc.ref);
    }
    batch.delete(ref);
    await batch.commit();
    res.status(204).end();
  } catch (err) { next(err); }
});

// ── 7.3 Creator Library — Modules ──────────────────────────────────────────────

app.get("/api/v1/creator/library/modules", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    assertCreator(auth);
    const snap = await db.collection("creator_libraries").doc(auth.userId)
      .collection("modules").orderBy("created_at", "desc").get();
    res.json({
      data: snap.docs.map((d) => {
        const e = d.data();
        return {
          moduleId: d.id,
          title: e.title ?? "",
          sessionCount: Array.isArray(e.sessionRefs) ? e.sessionRefs.length : 0,
          createdAt: e.created_at?.toDate?.()?.toISOString() ?? null,
          updatedAt: e.updated_at?.toDate?.()?.toISOString() ?? null,
        };
      }),
    });
  } catch (err) { next(err); }
});

app.post("/api/v1/creator/library/modules", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    assertCreator(auth);
    const body = validateBody<{ title: string }>({ title: "string" }, req.body);
    const ref = await db.collection("creator_libraries").doc(auth.userId)
      .collection("modules").add({
        title: body.title,
        creator_id: auth.userId,
        sessionRefs: [],
        version: 1,
        created_at: FieldValue.serverTimestamp(),
        updated_at: FieldValue.serverTimestamp(),
      });
    res.status(201).json({ data: { moduleId: ref.id, createdAt: new Date().toISOString() } });
  } catch (err) { next(err); }
});

app.get("/api/v1/creator/library/modules/:moduleId", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    assertCreator(auth);
    const ref = db.collection("creator_libraries").doc(auth.userId)
      .collection("modules").doc(req.params.moduleId);
    const moduleDoc = await ref.get();
    if (!moduleDoc.exists) throw apiError("NOT_FOUND", "Library module not found", 404);
    const e = moduleDoc.data()!;
    res.json({
      data: {
        moduleId: moduleDoc.id,
        title: e.title ?? "",
        sessionRefs: e.sessionRefs ?? [],
        createdAt: e.created_at?.toDate?.()?.toISOString() ?? null,
        updatedAt: e.updated_at?.toDate?.()?.toISOString() ?? null,
      },
    });
  } catch (err) { next(err); }
});

app.patch("/api/v1/creator/library/modules/:moduleId", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    assertCreator(auth);
    const ref = db.collection("creator_libraries").doc(auth.userId)
      .collection("modules").doc(req.params.moduleId);
    if (!(await ref.get()).exists) throw apiError("NOT_FOUND", "Library module not found", 404);
    const body = validateBody<{ title: string }>({ title: "string" }, req.body);
    await ref.update({ title: body.title, updated_at: FieldValue.serverTimestamp() });
    res.json({ data: { updatedAt: new Date().toISOString() } });
  } catch (err) { next(err); }
});

app.delete("/api/v1/creator/library/modules/:moduleId", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    assertCreator(auth);
    const ref = db.collection("creator_libraries").doc(auth.userId)
      .collection("modules").doc(req.params.moduleId);
    if (!(await ref.get()).exists) throw apiError("NOT_FOUND", "Library module not found", 404);
    await ref.delete();
    res.status(204).end();
  } catch (err) { next(err); }
});

// ── 7.4 Library Sessions — Exercise & Set CRUD ─────────────────────────────────

app.post("/api/v1/creator/library/sessions/:sessionId/exercises", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    assertCreator(auth);
    const sessionRef = db.collection("creator_libraries").doc(auth.userId)
      .collection("sessions").doc(req.params.sessionId);
    if (!(await sessionRef.get()).exists) throw apiError("NOT_FOUND", "Library session not found", 404);
    const body = validateBody<{ name: string; order: number; libraryId?: string | null; primaryMuscles?: string[] }>(
      { name: "string", order: "number" }, req.body
    );
    const ref = await sessionRef.collection("exercises").add({
      name: body.name,
      order: body.order,
      libraryId: body.libraryId ?? null,
      primaryMuscles: body.primaryMuscles ?? [],
      createdAt: FieldValue.serverTimestamp(),
    });
    await sessionRef.update({ updated_at: FieldValue.serverTimestamp() });
    res.status(201).json({ data: { exerciseId: ref.id } });
  } catch (err) { next(err); }
});

app.patch("/api/v1/creator/library/sessions/:sessionId/exercises/:exerciseId", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    assertCreator(auth);
    const sessionRef = db.collection("creator_libraries").doc(auth.userId)
      .collection("sessions").doc(req.params.sessionId);
    if (!(await sessionRef.get()).exists) throw apiError("NOT_FOUND", "Library session not found", 404);
    const exRef = sessionRef.collection("exercises").doc(req.params.exerciseId);
    if (!(await exRef.get()).exists) throw apiError("NOT_FOUND", "Exercise not found", 404);
    const { name, order, primaryMuscles, libraryId } = req.body as Record<string, unknown>;
    const update: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
    if (name !== undefined) update.name = name;
    if (order !== undefined) update.order = order;
    if (primaryMuscles !== undefined) update.primaryMuscles = primaryMuscles;
    if (libraryId !== undefined) update.libraryId = libraryId;
    await exRef.update(update);
    await sessionRef.update({ updated_at: FieldValue.serverTimestamp() });
    res.json({ data: { exerciseId: req.params.exerciseId, updatedAt: new Date().toISOString() } });
  } catch (err) { next(err); }
});

app.delete("/api/v1/creator/library/sessions/:sessionId/exercises/:exerciseId", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    assertCreator(auth);
    const sessionRef = db.collection("creator_libraries").doc(auth.userId)
      .collection("sessions").doc(req.params.sessionId);
    if (!(await sessionRef.get()).exists) throw apiError("NOT_FOUND", "Library session not found", 404);
    const exRef = sessionRef.collection("exercises").doc(req.params.exerciseId);
    if (!(await exRef.get()).exists) throw apiError("NOT_FOUND", "Exercise not found", 404);
    const setsSnap = await exRef.collection("sets").get();
    const batch = db.batch();
    setsSnap.docs.forEach((s) => batch.delete(s.ref));
    batch.delete(exRef);
    await batch.commit();
    await sessionRef.update({ updated_at: FieldValue.serverTimestamp() });
    res.status(204).end();
  } catch (err) { next(err); }
});

app.post("/api/v1/creator/library/sessions/:sessionId/exercises/:exerciseId/sets", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    assertCreator(auth);
    const sessionRef = db.collection("creator_libraries").doc(auth.userId)
      .collection("sessions").doc(req.params.sessionId);
    if (!(await sessionRef.get()).exists) throw apiError("NOT_FOUND", "Library session not found", 404);
    const exRef = sessionRef.collection("exercises").doc(req.params.exerciseId);
    if (!(await exRef.get()).exists) throw apiError("NOT_FOUND", "Exercise not found", 404);
    const body = validateBody<{ reps: string; order: number; weight?: number | null; intensity?: string | null; rir?: number | null }>(
      { reps: "string", order: "number" }, req.body
    );
    const ref = await exRef.collection("sets").add({
      reps: body.reps,
      order: body.order,
      weight: body.weight ?? null,
      intensity: body.intensity ?? null,
      rir: body.rir ?? null,
      createdAt: FieldValue.serverTimestamp(),
    });
    await sessionRef.update({ updated_at: FieldValue.serverTimestamp() });
    res.status(201).json({ data: { setId: ref.id } });
  } catch (err) { next(err); }
});

app.patch("/api/v1/creator/library/sessions/:sessionId/exercises/:exerciseId/sets/:setId", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    assertCreator(auth);
    const sessionRef = db.collection("creator_libraries").doc(auth.userId)
      .collection("sessions").doc(req.params.sessionId);
    if (!(await sessionRef.get()).exists) throw apiError("NOT_FOUND", "Library session not found", 404);
    const setRef = sessionRef.collection("exercises").doc(req.params.exerciseId)
      .collection("sets").doc(req.params.setId);
    if (!(await setRef.get()).exists) throw apiError("NOT_FOUND", "Set not found", 404);
    const { reps, order, weight, intensity, rir } = req.body as Record<string, unknown>;
    const update: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
    if (reps !== undefined) update.reps = reps;
    if (order !== undefined) update.order = order;
    if (weight !== undefined) update.weight = weight;
    if (intensity !== undefined) update.intensity = intensity;
    if (rir !== undefined) update.rir = rir;
    await setRef.update(update);
    await sessionRef.update({ updated_at: FieldValue.serverTimestamp() });
    res.json({ data: { setId: req.params.setId, updatedAt: new Date().toISOString() } });
  } catch (err) { next(err); }
});

app.delete("/api/v1/creator/library/sessions/:sessionId/exercises/:exerciseId/sets/:setId", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    assertCreator(auth);
    const sessionRef = db.collection("creator_libraries").doc(auth.userId)
      .collection("sessions").doc(req.params.sessionId);
    if (!(await sessionRef.get()).exists) throw apiError("NOT_FOUND", "Library session not found", 404);
    const setRef = sessionRef.collection("exercises").doc(req.params.exerciseId)
      .collection("sets").doc(req.params.setId);
    if (!(await setRef.get()).exists) throw apiError("NOT_FOUND", "Set not found", 404);
    await setRef.delete();
    await sessionRef.update({ updated_at: FieldValue.serverTimestamp() });
    res.status(204).end();
  } catch (err) { next(err); }
});

// ── 7.4 Library Sessions — Propagate ───────────────────────────────────────────

app.post("/api/v1/creator/library/sessions/:sessionId/propagate", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    assertCreator(auth);
    const sessionRef = db.collection("creator_libraries").doc(auth.userId)
      .collection("sessions").doc(req.params.sessionId);
    const sessionDoc = await sessionRef.get();
    if (!sessionDoc.exists) throw apiError("NOT_FOUND", "Library session not found", 404);

    // Find all plan sessions that reference this library session
    const plansSnap = await db.collection("plans")
      .where("creatorId", "==", auth.userId)
      .get();

    let plansAffected = 0;

    for (const planDoc of plansSnap.docs) {
      const modulesSnap = await planDoc.ref.collection("modules").get();
      for (const moduleDoc of modulesSnap.docs) {
        const sessionsSnap = await moduleDoc.ref.collection("sessions")
          .where("librarySessionRef", "==", req.params.sessionId)
          .get();
        if (!sessionsSnap.empty) {
          plansAffected++;
          // Detach refs so next GET resolves fresh from library
          const batch = db.batch();
          sessionsSnap.docs.forEach((s) => {
            batch.update(s.ref, { updatedAt: FieldValue.serverTimestamp() });
          });
          await batch.commit();
        }
      }
    }

    // Bump library session version so clients know to refetch
    await sessionRef.update({
      version: FieldValue.increment(1),
      updated_at: FieldValue.serverTimestamp(),
    });

    res.json({ data: { plansAffected, copiesDeleted: 0 } });
  } catch (err) { next(err); }
});

// ── 7.4 Library Modules — Propagate ────────────────────────────────────────────

app.post("/api/v1/creator/library/modules/:moduleId/propagate", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    assertCreator(auth);
    const ref = db.collection("creator_libraries").doc(auth.userId)
      .collection("modules").doc(req.params.moduleId);
    const moduleDoc = await ref.get();
    if (!moduleDoc.exists) throw apiError("NOT_FOUND", "Library module not found", 404);

    // Bump version to signal all referencing plans should refetch
    await ref.update({
      version: FieldValue.increment(1),
      updated_at: FieldValue.serverTimestamp(),
    });

    res.json({ data: { plansAffected: 0, copiesDeleted: 0 } });
  } catch (err) { next(err); }
});

// ── 7.5 Client Programs — Schedule ─────────────────────────────────────────────

app.put("/api/v1/creator/clients/:clientId/programs/:programId/schedule/:weekKey", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    assertCreator(auth);
    await requireClientRelationship(auth.userId, req.params.clientId);
    await requireOwnProgram(auth.userId, req.params.programId);

    const body = validateBody<{ planId: string; moduleId: string; moduleIndex?: number }>(
      { planId: "string", moduleId: "string", moduleIndex: "optional_number" },
      req.body
    );

    // Verify plan ownership
    const planDoc = await db.collection("plans").doc(body.planId).get();
    if (!planDoc.exists) throw apiError("NOT_FOUND", "Plan not found", 404);
    if ((planDoc.data()?.creator_id ?? planDoc.data()?.creatorId) !== auth.userId) {
      throw apiError("FORBIDDEN", "Not your plan", 403);
    }

    // Verify module exists in plan
    const moduleDoc = await db.collection("plans").doc(body.planId)
      .collection("modules").doc(body.moduleId).get();
    if (!moduleDoc.exists) throw apiError("NOT_FOUND", "Module not found in plan", 404);

    const moduleTitle = moduleDoc.data()?.title ?? "";
    const planTitle = planDoc.data()?.title ?? "";

    // Find the client_programs doc
    const cpSnap = await db.collection("client_programs")
      .where("creatorId", "==", auth.userId)
      .where("clientId", "==", req.params.clientId)
      .where("courseId", "==", req.params.programId)
      .limit(1).get();

    if (cpSnap.empty) throw apiError("NOT_FOUND", "Program not assigned to this client", 404);

    const assignedAt = new Date().toISOString();
    await cpSnap.docs[0].ref.update({
      [`planAssignments.${req.params.weekKey}`]: {
        planId: body.planId,
        planTitle,
        moduleId: body.moduleId,
        moduleTitle,
        moduleIndex: body.moduleIndex ?? 0,
        assignedAt,
      },
    });

    res.json({ data: { weekKey: req.params.weekKey, assignedAt } });
  } catch (err) { next(err); }
});

app.delete("/api/v1/creator/clients/:clientId/programs/:programId/schedule/:weekKey", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    assertCreator(auth);
    await requireClientRelationship(auth.userId, req.params.clientId);

    const cpSnap = await db.collection("client_programs")
      .where("creatorId", "==", auth.userId)
      .where("clientId", "==", req.params.clientId)
      .where("courseId", "==", req.params.programId)
      .limit(1).get();

    if (!cpSnap.empty) {
      await cpSnap.docs[0].ref.update({
        [`planAssignments.${req.params.weekKey}`]: FieldValue.delete(),
      });
    }

    res.status(204).end();
  } catch (err) { next(err); }
});

// ── 7.5 Client Sessions & Activity ─────────────────────────────────────────────

app.get("/api/v1/creator/clients/:clientId/sessions", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    assertCreator(auth);
    await requireClientRelationship(auth.userId, req.params.clientId);

    const PAGE_SIZE = 20;
    const { courseId, pageToken } = req.query as Record<string, string | undefined>;

    let q: FirebaseFirestore.Query = db.collection("users")
      .doc(req.params.clientId)
      .collection("sessionHistory")
      .orderBy("completedAt", "desc")
      .limit(PAGE_SIZE + 1);

    if (courseId) {
      q = db.collection("users")
        .doc(req.params.clientId)
        .collection("sessionHistory")
        .where("courseId", "==", courseId)
        .orderBy("completedAt", "desc")
        .limit(PAGE_SIZE + 1);
    }

    if (pageToken) {
      const cursorTs = Buffer.from(pageToken, "base64").toString("utf8");
      const cursorDoc = await db.collection("users")
        .doc(req.params.clientId)
        .collection("sessionHistory")
        .doc(cursorTs)
        .get();
      if (cursorDoc.exists) q = q.startAfter(cursorDoc);
    }

    const snap = await q.get();
    const hasMore = snap.docs.length > PAGE_SIZE;
    const docs = hasMore ? snap.docs.slice(0, PAGE_SIZE) : snap.docs;

    const toIso = (v: unknown): string | null => {
      if (v == null) return null;
      if (typeof v === "string") return v;
      if (typeof (v as Record<string, unknown>).toDate === "function") {
        return (v as { toDate: () => Date }).toDate().toISOString();
      }
      return null;
    };

    const sessions = docs.map((d) => {
      const e = d.data();
      return {
        completionId: d.id,
        sessionId: e.sessionId ?? null,
        courseId: e.courseId ?? null,
        sessionTitle: e.sessionTitle ?? e.title ?? null,
        completedAt: toIso(e.completedAt),
        durationMs: e.durationMs ?? null,
        exerciseCount: Array.isArray(e.exercises) ? e.exercises.length : (e.exerciseCount ?? 0),
        muscleVolumes: e.muscleVolumes ?? {},
      };
    });

    const nextPageToken = hasMore && docs.length > 0
      ? Buffer.from(docs[docs.length - 1].id).toString("base64")
      : null;

    res.json({ data: sessions, nextPageToken, hasMore });
  } catch (err) { next(err); }
});

app.get("/api/v1/creator/clients/:clientId/activity", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    assertCreator(auth);
    await requireClientRelationship(auth.userId, req.params.clientId);

    const clientDoc = await db.collection("users").doc(req.params.clientId).get();
    if (!clientDoc.exists) throw apiError("NOT_FOUND", "Client not found", 404);
    const d = clientDoc.data()!;

    // Read denormalized streak data
    const activityStreak = d.activityStreak ?? {};
    const currentStreak = activityStreak.currentStreak ?? 0;
    const lastActivityDate = activityStreak.lastActivityDate ?? null;
    const totalSessionsAllTime = d.sessionCount ?? 0;

    // Get most recent session from sessionHistory
    const recentSnap = await db.collection("users")
      .doc(req.params.clientId)
      .collection("sessionHistory")
      .orderBy("completedAt", "desc")
      .limit(1)
      .get();

    let lastSessionCompletedAt: string | null = null;
    let lastSessionTitle: string | null = null;

    if (!recentSnap.empty) {
      const s = recentSnap.docs[0].data();
      const completedAt = s.completedAt;
      if (completedAt?.toDate) {
        lastSessionCompletedAt = completedAt.toDate().toISOString();
      } else if (typeof completedAt === "string") {
        lastSessionCompletedAt = completedAt;
      }
      lastSessionTitle = s.sessionTitle ?? s.title ?? null;
    }

    // Build assigned courses summary from users.courses map
    const courses = d.courses ?? {};
    const assignedCourses = Object.entries(courses as Record<string, Record<string, unknown>>)
      .map(([courseId, courseData]) => {
        const expiresAt = courseData.expires_at
          ? (typeof courseData.expires_at === "string" ? courseData.expires_at : null)
          : null;
        const isActive = courseData.status === "active" &&
          (expiresAt === null || new Date(expiresAt) > new Date());
        return {
          courseId,
          title: courseData.title ?? "",
          status: isActive ? "active" : "expired",
          expiresAt,
        };
      })
      .filter((c) => c.status === "active" || c.status === "expired");

    res.json({
      data: {
        clientId: req.params.clientId,
        lastSessionCompletedAt,
        lastSessionTitle,
        totalSessionsAllTime,
        currentStreak,
        lastActivityDate,
        assignedCourses,
      },
    });
  } catch (err) { next(err); }
});

// ── 7.4 Availability & Bookings ────────────────────────────────────────────────

app.get("/api/v1/creator/availability", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    assertCreator(auth);
    const snap = await db.collection("creator_availability").doc(auth.userId).get();
    const d = snap.exists ? snap.data()! : {};
    res.json({
      data: {
        timezone: d.timezone ?? "America/Bogota",
        days: d.days ?? {},
      },
    });
  } catch (err) { next(err); }
});

app.post("/api/v1/creator/availability/slots", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    assertCreator(auth);
    const body = validateBody<{
      date: string; startTime: string; endTime: string; durationMinutes: number; timezone: string;
    }>({
      date: "string", startTime: "string", endTime: "string",
      durationMinutes: "number", timezone: "string",
    }, req.body);

    parseDateParam(body.date, "date");
    const timeRe = /^\d{2}:\d{2}$/;
    if (!timeRe.test(body.startTime)) throw apiError("VALIDATION_ERROR", "startTime must be HH:MM", 400, "startTime");
    if (!timeRe.test(body.endTime)) throw apiError("VALIDATION_ERROR", "endTime must be HH:MM", 400, "endTime");
    if (body.durationMinutes < 5 || body.durationMinutes > 480) {
      throw apiError("VALIDATION_ERROR", "durationMinutes must be between 5 and 480", 400, "durationMinutes");
    }

    // Generate slots: parse times as local (timezone) to UTC
    const [startH, startM] = body.startTime.split(":").map(Number);
    const [endH, endM] = body.endTime.split(":").map(Number);
    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;
    if (startMinutes >= endMinutes) throw apiError("VALIDATION_ERROR", "startTime must be before endTime", 400, "startTime");

    // Build UTC ISO strings by treating input times as UTC (client passes UTC-equivalent)
    const slots: Array<{ startUtc: string; endUtc: string; durationMinutes: number }> = [];
    const [y, mo, dayStr] = body.date.split("-").map(Number);
    for (let cur = startMinutes; cur + body.durationMinutes <= endMinutes; cur += body.durationMinutes) {
      const startUtcDate = new Date(Date.UTC(y, mo - 1, dayStr, Math.floor(cur / 60), cur % 60));
      const endUtcDate = new Date(startUtcDate.getTime() + body.durationMinutes * 60_000);
      slots.push({
        startUtc: startUtcDate.toISOString(),
        endUtc: endUtcDate.toISOString(),
        durationMinutes: body.durationMinutes,
      });
    }

    const docRef = db.collection("creator_availability").doc(auth.userId);
    const existing = await docRef.get();
    const existingData = existing.exists ? existing.data()! : {};
    const days = { ...(existingData.days ?? {}) } as Record<string, { slots: typeof slots }>;
    const existingSlots = days[body.date]?.slots ?? [];
    // Merge, deduplicating by startUtc
    const merged = [...existingSlots];
    for (const s of slots) {
      if (!merged.find((e) => e.startUtc === s.startUtc)) merged.push(s);
    }
    merged.sort((a, b) => a.startUtc.localeCompare(b.startUtc));
    days[body.date] = { slots: merged };

    await docRef.set({
      timezone: body.timezone,
      days,
      updatedAt: new Date().toISOString(),
    });

    res.status(201).json({ data: { date: body.date, slotsCreated: slots.length } });
  } catch (err) { next(err); }
});

app.delete("/api/v1/creator/availability/slots", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    assertCreator(auth);
    const body = validateBody<{ date: string; startUtc?: string }>({
      date: "string", startUtc: "optional_string",
    }, req.body);
    parseDateParam(body.date, "date");

    const docRef = db.collection("creator_availability").doc(auth.userId);
    const existing = await docRef.get();
    if (!existing.exists) { res.status(204).end(); return; }
    const existingData = existing.data()!;
    const days = { ...(existingData.days ?? {}) } as Record<string, { slots: Array<{ startUtc: string }> }>;

    if (body.startUtc) {
      // Remove specific slot
      const daySlots = days[body.date]?.slots ?? [];
      days[body.date] = { slots: daySlots.filter((s) => s.startUtc !== body.startUtc) };
      if (days[body.date].slots.length === 0) delete days[body.date];
    } else {
      // Delete entire day
      delete days[body.date];
    }

    await docRef.set({ ...existingData, days, updatedAt: new Date().toISOString() });
    res.status(204).end();
  } catch (err) { next(err); }
});

app.get("/api/v1/creator/bookings", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    assertCreator(auth);
    const { date, pageToken } = req.query as Record<string, string | undefined>;
    const PAGE_SIZE = 50;

    let q: FirebaseFirestore.Query = db.collection("call_bookings")
      .where("creatorId", "==", auth.userId)
      .orderBy("slotStartUtc", "asc")
      .limit(PAGE_SIZE + 1);

    if (date) {
      parseDateParam(date, "date");
      const dayStart = `${date}T00:00:00.000Z`;
      const dayEnd = `${date}T23:59:59.999Z`;
      q = db.collection("call_bookings")
        .where("creatorId", "==", auth.userId)
        .where("slotStartUtc", ">=", dayStart)
        .where("slotStartUtc", "<=", dayEnd)
        .orderBy("slotStartUtc", "asc")
        .limit(PAGE_SIZE + 1);
    }

    if (pageToken) {
      const cursor = Buffer.from(pageToken, "base64").toString("utf8");
      q = q.startAfter(cursor);
    }

    const snap = await q.get();
    const hasMore = snap.docs.length > PAGE_SIZE;
    const docs = hasMore ? snap.docs.slice(0, PAGE_SIZE) : snap.docs;

    const toIso = (v: unknown): string | null => {
      if (v == null) return null;
      if (typeof v === "string") return v;
      if (typeof (v as Record<string, unknown>).toDate === "function") return (v as { toDate: () => Date }).toDate().toISOString();
      return null;
    };

    const bookings = docs.map((d) => {
      const e = d.data();
      return {
        bookingId: d.id,
        clientUserId: e.clientUserId ?? e.userId ?? null,
        clientDisplayName: e.clientDisplayName ?? null,
        slotStartUtc: toIso(e.slotStartUtc),
        slotEndUtc: toIso(e.slotEndUtc),
        status: e.status ?? "scheduled",
        callLink: e.callLink ?? null,
        courseId: e.courseId ?? null,
        createdAt: toIso(e.createdAt),
      };
    });

    const lastStart = docs.length > 0 ? toIso(docs[docs.length - 1].data().slotStartUtc) : null;
    res.json({
      data: bookings,
      nextPageToken: hasMore && lastStart ? Buffer.from(lastStart).toString("base64") : null,
      hasMore,
    });
  } catch (err) { next(err); }
});

app.patch("/api/v1/creator/bookings/:bookingId", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    assertCreator(auth);
    const body = validateBody<{ callLink: string | null }>({ callLink: "optional_string" }, req.body);
    const ref = db.collection("call_bookings").doc(req.params.bookingId);
    const bookingDoc = await ref.get();
    if (!bookingDoc.exists) throw apiError("NOT_FOUND", "Booking not found", 404);
    if (bookingDoc.data()?.creatorId !== auth.userId) throw apiError("FORBIDDEN", "Not your booking", 403);
    await ref.update({ callLink: body.callLink ?? null, updatedAt: new Date().toISOString() });
    res.json({ data: { bookingId: req.params.bookingId, updatedAt: new Date().toISOString() } });
  } catch (err) { next(err); }
});

// ── 7.2 Programs ──────────────────────────────────────────────────────────────

async function requireOwnProgram(
  creatorId: string,
  programId: string
): Promise<FirebaseFirestore.DocumentSnapshot> {
  const doc = await db.collection("courses").doc(programId).get();
  if (!doc.exists) throw apiError("NOT_FOUND", "Program not found", 404);
  if (doc.data()?.creatorId !== creatorId) throw apiError("FORBIDDEN", "Not your program", 403);
  return doc;
}

async function deleteProgramTree(programId: string): Promise<void> {
  const courseRef = db.collection("courses").doc(programId);
  const modulesSnap = await courseRef.collection("modules").get();
  for (const moduleDoc of modulesSnap.docs) {
    const sessionsSnap = await moduleDoc.ref.collection("sessions").get();
    for (const sessionDoc of sessionsSnap.docs) {
      const exercisesSnap = await sessionDoc.ref.collection("exercises").get();
      for (const exerciseDoc of exercisesSnap.docs) {
        const setsSnap = await exerciseDoc.ref.collection("sets").get();
        if (!setsSnap.empty) {
          const batch = db.batch();
          setsSnap.docs.forEach((d) => batch.delete(d.ref));
          await batch.commit();
        }
        await exerciseDoc.ref.delete();
      }
      await sessionDoc.ref.delete();
    }
    await moduleDoc.ref.delete();
  }
  await courseRef.delete();
}

app.get("/api/v1/creator/programs", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    assertCreator(auth);
    const snap = await db.collection("courses")
      .where("creatorId", "==", auth.userId)
      .orderBy("createdAt", "desc")
      .get();
    const programs = snap.docs.map((d) => {
      const e = d.data();
      return {
        programId: d.id,
        title: e.title ?? "",
        description: (e.description ?? null) as string | null,
        imageUrl: (e.imageUrl ?? e.image_url ?? null) as string | null,
        discipline: (e.discipline ?? null) as string | null,
        deliveryType: e.deliveryType ?? "low_ticket",
        status: e.status ?? "draft",
        createdAt: e.createdAt?.toDate?.()?.toISOString() ?? null,
        updatedAt: e.updatedAt?.toDate?.()?.toISOString() ?? null,
      };
    });
    res.json({ data: programs });
  } catch (err) { next(err); }
});

app.post("/api/v1/creator/programs", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    assertCreator(auth);
    const body = validateBody<{
      title: string;
      description?: string | null;
      imageUrl?: string | null;
      discipline?: string | null;
      deliveryType: string;
    }>({
      title: "string",
      description: "optional_string",
      imageUrl: "optional_string",
      discipline: "optional_string",
      deliveryType: "string",
    }, req.body);
    if (!["low_ticket", "one_on_one"].includes(body.deliveryType)) {
      throw apiError("VALIDATION_ERROR", "deliveryType must be low_ticket or one_on_one", 400, "deliveryType");
    }
    const ref = db.collection("courses").doc();
    await ref.set({
      title: body.title,
      description: body.description ?? null,
      imageUrl: body.imageUrl ?? null,
      discipline: body.discipline ?? null,
      deliveryType: body.deliveryType,
      status: "draft",
      creatorId: auth.userId,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    res.status(201).json({ data: { programId: ref.id, createdAt: new Date().toISOString() } });
  } catch (err) { next(err); }
});

app.patch("/api/v1/creator/programs/:programId", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    assertCreator(auth);
    const doc = await requireOwnProgram(auth.userId, req.params.programId);
    const b = req.body as Record<string, unknown>;
    const updates: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
    if (b.title !== undefined) {
      if (typeof b.title !== "string") throw apiError("VALIDATION_ERROR", "title must be a string", 400, "title");
      updates.title = b.title;
    }
    if (b.description !== undefined) updates.description = b.description ?? null;
    if (b.imageUrl !== undefined) updates.imageUrl = b.imageUrl ?? null;
    if (b.discipline !== undefined) updates.discipline = b.discipline ?? null;
    if (b.deliveryType !== undefined) {
      if (!["low_ticket", "one_on_one"].includes(b.deliveryType as string)) {
        throw apiError("VALIDATION_ERROR", "deliveryType must be low_ticket or one_on_one", 400, "deliveryType");
      }
      updates.deliveryType = b.deliveryType;
    }
    await doc.ref.update(updates);
    res.json({ data: { programId: req.params.programId, updatedAt: new Date().toISOString() } });
  } catch (err) { next(err); }
});

app.patch("/api/v1/creator/programs/:programId/status", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    assertCreator(auth);
    const doc = await requireOwnProgram(auth.userId, req.params.programId);
    const body = validateBody<{ status: string }>({ status: "string" }, req.body);
    if (!["draft", "published"].includes(body.status)) {
      throw apiError("VALIDATION_ERROR", "status must be draft or published", 400, "status");
    }
    await doc.ref.update({ status: body.status, updatedAt: FieldValue.serverTimestamp() });
    res.json({ data: { programId: req.params.programId, status: body.status } });
  } catch (err) { next(err); }
});

app.delete("/api/v1/creator/programs/:programId", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    assertCreator(auth);
    await requireOwnProgram(auth.userId, req.params.programId);
    await deleteProgramTree(req.params.programId);
    res.status(204).end();
  } catch (err) { next(err); }
});

app.post("/api/v1/creator/programs/:programId/duplicate", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    assertCreator(auth);
    const srcDoc = await requireOwnProgram(auth.userId, req.params.programId);
    const srcData = srcDoc.data()!;
    const b = req.body as Record<string, unknown>;
    const newTitle = (typeof b.title === "string" && b.title.trim())
      ? b.title.trim()
      : `Copia de ${srcData.title ?? ""}`;

    const newRef = db.collection("courses").doc();
    await newRef.set({
      ...srcData,
      title: newTitle,
      status: "draft",
      creatorId: auth.userId,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    const modulesSnap = await srcDoc.ref.collection("modules").get();
    for (const moduleDoc of modulesSnap.docs) {
      const newModRef = newRef.collection("modules").doc();
      await newModRef.set({ ...moduleDoc.data() });
      const sessionsSnap = await moduleDoc.ref.collection("sessions").get();
      for (const sessionDoc of sessionsSnap.docs) {
        const newSessRef = newModRef.collection("sessions").doc();
        await newSessRef.set({ ...sessionDoc.data() });
        const exercisesSnap = await sessionDoc.ref.collection("exercises").get();
        for (const exerciseDoc of exercisesSnap.docs) {
          const newExRef = newSessRef.collection("exercises").doc();
          await newExRef.set({ ...exerciseDoc.data() });
          const setsSnap = await exerciseDoc.ref.collection("sets").get();
          if (!setsSnap.empty) {
            const batch = db.batch();
            setsSnap.docs.forEach((setDoc) => {
              batch.set(newExRef.collection("sets").doc(), { ...setDoc.data() });
            });
            await batch.commit();
          }
        }
      }
    }

    res.status(201).json({ data: { programId: newRef.id, title: newTitle, createdAt: new Date().toISOString() } });
  } catch (err) { next(err); }
});

app.post("/api/v1/creator/programs/:programId/image/upload-url", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    assertCreator(auth);
    await requireOwnProgram(auth.userId, req.params.programId);
    const body = validateBody<{ contentType: string }>({ contentType: "string" }, req.body);
    const allowed = ["image/jpeg", "image/png", "image/webp"];
    if (!allowed.includes(body.contentType)) {
      throw apiError("VALIDATION_ERROR", "contentType must be image/jpeg, image/png, or image/webp", 400, "contentType");
    }
    const storagePath = `programs/${req.params.programId}/cover.jpg`;
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
    let uploadUrl: string;
    try {
      [uploadUrl] = await admin.storage().bucket().file(storagePath).getSignedUrl({
        version: "v4",
        action: "write",
        expires: expiresAt,
        contentType: body.contentType,
      });
    } catch (e: unknown) {
      functions.logger.error('getSignedUrl failed', { error: e instanceof Error ? e.message : String(e) });
      throw apiError("INTERNAL_ERROR", "Storage signing failed", 500);
    }
    res.json({ data: { uploadUrl, storagePath, expiresAt: expiresAt.toISOString() } });
  } catch (err) { next(err); }
});

app.post("/api/v1/creator/programs/:programId/image/confirm", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    assertCreator(auth);
    const programDoc = await requireOwnProgram(auth.userId, req.params.programId);
    const body = validateBody<{ storagePath: string }>({ storagePath: "string" }, req.body);
    if (!body.storagePath.startsWith(`programs/${req.params.programId}/`)) {
      throw apiError("FORBIDDEN", "Storage path does not belong to this program", 403);
    }
    const file = admin.storage().bucket().file(body.storagePath);
    const [exists] = await file.exists();
    if (!exists) throw apiError("NOT_FOUND", "File not found in storage", 404);
    const downloadToken = crypto.randomUUID();
    await file.setMetadata({ metadata: { firebaseStorageDownloadTokens: downloadToken } });
    const bucketName = admin.storage().bucket().name;
    const encodedPath = encodeURIComponent(body.storagePath);
    const imageUrl = `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodedPath}?alt=media&token=${downloadToken}`;
    await programDoc.ref.update({ imageUrl, updatedAt: FieldValue.serverTimestamp() });
    res.json({ data: { programId: req.params.programId, imageUrl } });
  } catch (err) { next(err); }
});

app.get("/api/v1/creator/programs/:programId", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    assertCreator(auth);
    const doc = await requireOwnProgram(auth.userId, req.params.programId);
    const e = doc.data()!;
    const modulesSnap = await doc.ref.collection("modules").orderBy("order", "asc").get();
    const modules = modulesSnap.docs.map((m) => {
      const md = m.data();
      return { moduleId: m.id, title: md.title ?? "", order: md.order ?? 0 };
    });
    res.json({
      data: {
        programId: doc.id,
        title: e.title ?? "",
        description: e.description ?? null,
        imageUrl: e.imageUrl ?? e.image_url ?? null,
        discipline: e.discipline ?? null,
        deliveryType: e.deliveryType ?? "low_ticket",
        status: e.status ?? "draft",
        modules,
        createdAt: e.createdAt?.toDate?.()?.toISOString() ?? null,
        updatedAt: e.updatedAt?.toDate?.()?.toISOString() ?? null,
      },
    });
  } catch (err) { next(err); }
});

app.get("/api/v1/creator/programs/:programId/modules", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    assertCreator(auth);
    const doc = await requireOwnProgram(auth.userId, req.params.programId);
    const snap = await doc.ref.collection("modules").orderBy("order", "asc").get();
    const data = snap.docs.map((m) => {
      const md = m.data();
      return { moduleId: m.id, title: md.title ?? "", order: md.order ?? 0 };
    });
    res.json({ data });
  } catch (err) { next(err); }
});

app.post("/api/v1/creator/programs/:programId/modules", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    assertCreator(auth);
    const doc = await requireOwnProgram(auth.userId, req.params.programId);
    const body = validateBody<{ title: string; order: number }>(
      { title: "string", order: "number" }, req.body
    );
    const ref = await doc.ref.collection("modules").add({
      title: body.title,
      order: body.order,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    await doc.ref.update({ updatedAt: FieldValue.serverTimestamp() });
    res.status(201).json({ data: { moduleId: ref.id } });
  } catch (err) { next(err); }
});

app.get("/api/v1/creator/programs/:programId/modules/:moduleId", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    assertCreator(auth);
    const programDoc = await requireOwnProgram(auth.userId, req.params.programId);
    const modRef = programDoc.ref.collection("modules").doc(req.params.moduleId);
    const modDoc = await modRef.get();
    if (!modDoc.exists) throw apiError("NOT_FOUND", "Module not found", 404);
    const md = modDoc.data()!;
    const sessionsSnap = await modRef.collection("sessions").orderBy("order", "asc").get();
    const sessions = sessionsSnap.docs.map((s) => {
      const sd = s.data();
      return { sessionId: s.id, title: sd.title ?? "", order: sd.order ?? 0 };
    });
    res.json({ data: { moduleId: modDoc.id, title: md.title ?? "", order: md.order ?? 0, sessions } });
  } catch (err) { next(err); }
});

app.patch("/api/v1/creator/programs/:programId/modules/:moduleId", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    assertCreator(auth);
    const programDoc = await requireOwnProgram(auth.userId, req.params.programId);
    const modRef = programDoc.ref.collection("modules").doc(req.params.moduleId);
    if (!(await modRef.get()).exists) throw apiError("NOT_FOUND", "Module not found", 404);
    const { title, order } = req.body as Record<string, unknown>;
    const update: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
    if (title !== undefined) update.title = title;
    if (order !== undefined) update.order = order;
    await modRef.update(update);
    res.json({ data: { moduleId: req.params.moduleId, updatedAt: new Date().toISOString() } });
  } catch (err) { next(err); }
});

app.delete("/api/v1/creator/programs/:programId/modules/:moduleId", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    assertCreator(auth);
    const programDoc = await requireOwnProgram(auth.userId, req.params.programId);
    const modRef = programDoc.ref.collection("modules").doc(req.params.moduleId);
    if (!(await modRef.get()).exists) throw apiError("NOT_FOUND", "Module not found", 404);
    const sessionsSnap = await modRef.collection("sessions").get();
    for (const sDoc of sessionsSnap.docs) {
      const exSnap = await sDoc.ref.collection("exercises").get();
      const batch = db.batch();
      for (const exDoc of exSnap.docs) {
        const setsSnap = await exDoc.ref.collection("sets").get();
        setsSnap.docs.forEach((s) => batch.delete(s.ref));
        batch.delete(exDoc.ref);
      }
      batch.delete(sDoc.ref);
      await batch.commit();
    }
    await modRef.delete();
    await programDoc.ref.update({ updatedAt: FieldValue.serverTimestamp() });
    res.status(204).end();
  } catch (err) { next(err); }
});

app.get("/api/v1/creator/programs/:programId/modules/:moduleId/sessions", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    assertCreator(auth);
    const programDoc = await requireOwnProgram(auth.userId, req.params.programId);
    const modRef = programDoc.ref.collection("modules").doc(req.params.moduleId);
    if (!(await modRef.get()).exists) throw apiError("NOT_FOUND", "Module not found", 404);
    const snap = await modRef.collection("sessions").orderBy("order", "asc").get();
    const data = snap.docs.map((s) => {
      const sd = s.data();
      return { sessionId: s.id, title: sd.title ?? "", order: sd.order ?? 0, librarySessionRef: sd.librarySessionRef ?? null };
    });
    res.json({ data });
  } catch (err) { next(err); }
});

app.post("/api/v1/creator/programs/:programId/modules/:moduleId/sessions", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    assertCreator(auth);
    const programDoc = await requireOwnProgram(auth.userId, req.params.programId);
    const modRef = programDoc.ref.collection("modules").doc(req.params.moduleId);
    if (!(await modRef.get()).exists) throw apiError("NOT_FOUND", "Module not found", 404);
    const body = validateBody<{ title: string; order: number; librarySessionRef?: string | null }>(
      { title: "string", order: "number" }, req.body
    );
    const ref = await modRef.collection("sessions").add({
      title: body.title,
      order: body.order,
      librarySessionRef: body.librarySessionRef ?? null,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    res.status(201).json({ data: { sessionId: ref.id } });
  } catch (err) { next(err); }
});

app.get("/api/v1/creator/programs/:programId/modules/:moduleId/sessions/:sessionId", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    assertCreator(auth);
    const programDoc = await requireOwnProgram(auth.userId, req.params.programId);
    const sessionRef = programDoc.ref
      .collection("modules").doc(req.params.moduleId)
      .collection("sessions").doc(req.params.sessionId);
    const sessionDoc = await sessionRef.get();
    if (!sessionDoc.exists) throw apiError("NOT_FOUND", "Session not found", 404);
    const s = sessionDoc.data()!;
    let exercises: unknown[] = [];
    if (s.librarySessionRef) {
      const libRef = db.collection("creator_libraries").doc(auth.userId)
        .collection("sessions").doc(s.librarySessionRef);
      const libDoc = await libRef.get();
      if (libDoc.exists) {
        const exSnap = await libRef.collection("exercises").get();
        exercises = await Promise.all(exSnap.docs.map(async (exDoc) => {
          const setsSnap = await exDoc.ref.collection("sets").orderBy("order", "asc").get();
          const ex = exDoc.data();
          return {
            exerciseId: exDoc.id,
            name: ex.name ?? "",
            libraryId: ex.libraryId ?? null,
            primaryMuscles: ex.primaryMuscles ?? [],
            order: ex.order ?? 0,
            sets: setsSnap.docs.map((setDoc) => ({ setId: setDoc.id, ...setDoc.data() })),
          };
        }));
        exercises.sort((a, b) =>
          ((a as Record<string, unknown>).order as number ?? 0) -
          ((b as Record<string, unknown>).order as number ?? 0)
        );
      }
    } else {
      const exSnap = await sessionRef.collection("exercises").get();
      exercises = await Promise.all(exSnap.docs.map(async (exDoc) => {
        const setsSnap = await exDoc.ref.collection("sets").orderBy("order", "asc").get();
        const ex = exDoc.data();
        return {
          exerciseId: exDoc.id,
          name: ex.name ?? "",
          libraryId: ex.libraryId ?? null,
          primaryMuscles: ex.primaryMuscles ?? [],
          order: ex.order ?? 0,
          sets: setsSnap.docs.map((setDoc) => ({ setId: setDoc.id, ...setDoc.data() })),
        };
      }));
      exercises.sort((a, b) =>
        ((a as Record<string, unknown>).order as number ?? 0) -
        ((b as Record<string, unknown>).order as number ?? 0)
      );
    }
    res.json({
      data: {
        sessionId: sessionDoc.id,
        title: s.title ?? "",
        order: s.order ?? 0,
        librarySessionRef: s.librarySessionRef ?? null,
        exercises,
      },
    });
  } catch (err) { next(err); }
});

app.patch("/api/v1/creator/programs/:programId/modules/:moduleId/sessions/:sessionId", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    assertCreator(auth);
    const programDoc = await requireOwnProgram(auth.userId, req.params.programId);
    const sessionRef = programDoc.ref
      .collection("modules").doc(req.params.moduleId)
      .collection("sessions").doc(req.params.sessionId);
    if (!(await sessionRef.get()).exists) throw apiError("NOT_FOUND", "Session not found", 404);
    const { title, order, librarySessionRef } = req.body as Record<string, unknown>;
    const update: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
    if (title !== undefined) update.title = title;
    if (order !== undefined) update.order = order;
    if (librarySessionRef !== undefined) update.librarySessionRef = librarySessionRef;
    await sessionRef.update(update);
    res.json({ data: { sessionId: req.params.sessionId, updatedAt: new Date().toISOString() } });
  } catch (err) { next(err); }
});

app.delete("/api/v1/creator/programs/:programId/modules/:moduleId/sessions/:sessionId", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    assertCreator(auth);
    const programDoc = await requireOwnProgram(auth.userId, req.params.programId);
    const sessionRef = programDoc.ref
      .collection("modules").doc(req.params.moduleId)
      .collection("sessions").doc(req.params.sessionId);
    if (!(await sessionRef.get()).exists) throw apiError("NOT_FOUND", "Session not found", 404);
    const exSnap = await sessionRef.collection("exercises").get();
    const batch = db.batch();
    for (const exDoc of exSnap.docs) {
      const setsSnap = await exDoc.ref.collection("sets").get();
      setsSnap.docs.forEach((s) => batch.delete(s.ref));
      batch.delete(exDoc.ref);
    }
    batch.delete(sessionRef);
    await batch.commit();
    res.status(204).end();
  } catch (err) { next(err); }
});

app.get("/api/v1/creator/programs/:programId/modules/:moduleId/sessions/:sessionId/exercises", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    assertCreator(auth);
    const programDoc = await requireOwnProgram(auth.userId, req.params.programId);
    const sessionRef = programDoc.ref
      .collection("modules").doc(req.params.moduleId)
      .collection("sessions").doc(req.params.sessionId);
    if (!(await sessionRef.get()).exists) throw apiError("NOT_FOUND", "Session not found", 404);
    const exSnap = await sessionRef.collection("exercises").orderBy("order", "asc").get();
    const data = await Promise.all(exSnap.docs.map(async (exDoc) => {
      const setsSnap = await exDoc.ref.collection("sets").orderBy("order", "asc").get();
      const ex = exDoc.data();
      return {
        exerciseId: exDoc.id,
        name: ex.name ?? "",
        libraryId: ex.libraryId ?? null,
        primaryMuscles: ex.primaryMuscles ?? [],
        order: ex.order ?? 0,
        sets: setsSnap.docs.map((setDoc) => ({ setId: setDoc.id, ...setDoc.data() })),
      };
    }));
    res.json({ data });
  } catch (err) { next(err); }
});

app.post("/api/v1/creator/programs/:programId/modules/:moduleId/sessions/:sessionId/exercises", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    assertCreator(auth);
    const programDoc = await requireOwnProgram(auth.userId, req.params.programId);
    const sessionRef = programDoc.ref
      .collection("modules").doc(req.params.moduleId)
      .collection("sessions").doc(req.params.sessionId);
    if (!(await sessionRef.get()).exists) throw apiError("NOT_FOUND", "Session not found", 404);
    const body = validateBody<{ name: string; order: number; libraryId?: string | null; primaryMuscles?: string[] }>(
      { name: "string", order: "number" }, req.body
    );
    const ref = await sessionRef.collection("exercises").add({
      name: body.name,
      order: body.order,
      libraryId: body.libraryId ?? null,
      primaryMuscles: body.primaryMuscles ?? [],
      createdAt: FieldValue.serverTimestamp(),
    });
    res.status(201).json({ data: { exerciseId: ref.id } });
  } catch (err) { next(err); }
});

app.patch("/api/v1/creator/programs/:programId/modules/:moduleId/sessions/:sessionId/exercises/:exerciseId", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    assertCreator(auth);
    const programDoc = await requireOwnProgram(auth.userId, req.params.programId);
    const exRef = programDoc.ref
      .collection("modules").doc(req.params.moduleId)
      .collection("sessions").doc(req.params.sessionId)
      .collection("exercises").doc(req.params.exerciseId);
    if (!(await exRef.get()).exists) throw apiError("NOT_FOUND", "Exercise not found", 404);
    const { name, order, primaryMuscles, libraryId } = req.body as Record<string, unknown>;
    const update: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
    if (name !== undefined) update.name = name;
    if (order !== undefined) update.order = order;
    if (primaryMuscles !== undefined) update.primaryMuscles = primaryMuscles;
    if (libraryId !== undefined) update.libraryId = libraryId;
    await exRef.update(update);
    res.json({ data: { exerciseId: req.params.exerciseId, updatedAt: new Date().toISOString() } });
  } catch (err) { next(err); }
});

app.delete("/api/v1/creator/programs/:programId/modules/:moduleId/sessions/:sessionId/exercises/:exerciseId", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    assertCreator(auth);
    const programDoc = await requireOwnProgram(auth.userId, req.params.programId);
    const exRef = programDoc.ref
      .collection("modules").doc(req.params.moduleId)
      .collection("sessions").doc(req.params.sessionId)
      .collection("exercises").doc(req.params.exerciseId);
    if (!(await exRef.get()).exists) throw apiError("NOT_FOUND", "Exercise not found", 404);
    const setsSnap = await exRef.collection("sets").get();
    const batch = db.batch();
    setsSnap.docs.forEach((s) => batch.delete(s.ref));
    batch.delete(exRef);
    await batch.commit();
    res.status(204).end();
  } catch (err) { next(err); }
});

app.post("/api/v1/creator/programs/:programId/modules/:moduleId/sessions/:sessionId/exercises/:exerciseId/sets", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    assertCreator(auth);
    const programDoc = await requireOwnProgram(auth.userId, req.params.programId);
    const exRef = programDoc.ref
      .collection("modules").doc(req.params.moduleId)
      .collection("sessions").doc(req.params.sessionId)
      .collection("exercises").doc(req.params.exerciseId);
    if (!(await exRef.get()).exists) throw apiError("NOT_FOUND", "Exercise not found", 404);
    const body = validateBody<{ reps: string; order: number; weight?: number | null; intensity?: string | null; rir?: number | null }>(
      { reps: "string", order: "number" }, req.body
    );
    const ref = await exRef.collection("sets").add({
      reps: body.reps,
      order: body.order,
      weight: body.weight ?? null,
      intensity: body.intensity ?? null,
      rir: body.rir ?? null,
      createdAt: FieldValue.serverTimestamp(),
    });
    res.status(201).json({ data: { setId: ref.id } });
  } catch (err) { next(err); }
});

app.patch("/api/v1/creator/programs/:programId/modules/:moduleId/sessions/:sessionId/exercises/:exerciseId/sets/:setId", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    assertCreator(auth);
    const programDoc = await requireOwnProgram(auth.userId, req.params.programId);
    const setRef = programDoc.ref
      .collection("modules").doc(req.params.moduleId)
      .collection("sessions").doc(req.params.sessionId)
      .collection("exercises").doc(req.params.exerciseId)
      .collection("sets").doc(req.params.setId);
    if (!(await setRef.get()).exists) throw apiError("NOT_FOUND", "Set not found", 404);
    const { reps, order, weight, intensity, rir } = req.body as Record<string, unknown>;
    const update: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
    if (reps !== undefined) update.reps = reps;
    if (order !== undefined) update.order = order;
    if (weight !== undefined) update.weight = weight;
    if (intensity !== undefined) update.intensity = intensity;
    if (rir !== undefined) update.rir = rir;
    await setRef.update(update);
    res.json({ data: { setId: req.params.setId, updatedAt: new Date().toISOString() } });
  } catch (err) { next(err); }
});

app.delete("/api/v1/creator/programs/:programId/modules/:moduleId/sessions/:sessionId/exercises/:exerciseId/sets/:setId", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    assertCreator(auth);
    const programDoc = await requireOwnProgram(auth.userId, req.params.programId);
    const setRef = programDoc.ref
      .collection("modules").doc(req.params.moduleId)
      .collection("sessions").doc(req.params.sessionId)
      .collection("exercises").doc(req.params.exerciseId)
      .collection("sets").doc(req.params.setId);
    if (!(await setRef.get()).exists) throw apiError("NOT_FOUND", "Set not found", 404);
    await setRef.delete();
    res.status(204).end();
  } catch (err) { next(err); }
});

// ── 7.5 Client Programs ────────────────────────────────────────────────────────

app.get("/api/v1/creator/clients/:clientId/programs", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    assertCreator(auth);
    await requireClientRelationship(auth.userId, req.params.clientId);
    const snap = await db.collection("client_programs")
      .where("creatorId", "==", auth.userId)
      .where("clientId", "==", req.params.clientId)
      .orderBy("assignedAt", "desc")
      .get();
    const courseIds = snap.docs.map((d) => d.data().courseId).filter(Boolean) as string[];
    const courseRefs = courseIds.map((id) => db.collection("courses").doc(id));
    const courseDocs = courseRefs.length > 0 ? await db.getAll(...courseRefs) : [];
    const courseTitleMap = new Map(courseDocs.map((d) => [d.id, d.exists ? (d.data()?.title ?? "") : ""]));
    const data = snap.docs.map((d) => {
      const e = d.data();
      return {
        courseId: e.courseId,
        title: courseTitleMap.get(e.courseId) ?? "",
        assignedAt: e.assignedAt?.toDate?.()?.toISOString() ?? null,
        planAssignments: (e.planAssignments ?? {}) as Record<string, unknown>,
      };
    });
    res.json({ data });
  } catch (err) { next(err); }
});

app.post("/api/v1/creator/clients/:clientId/programs/:programId", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    assertCreator(auth);
    await requireClientRelationship(auth.userId, req.params.clientId);
    const programDoc = await requireOwnProgram(auth.userId, req.params.programId);
    const programData = programDoc.data()!;

    const existing = await db.collection("client_programs")
      .where("creatorId", "==", auth.userId)
      .where("clientId", "==", req.params.clientId)
      .where("courseId", "==", req.params.programId)
      .limit(1).get();
    if (!existing.empty) throw apiError("CONFLICT", "Program already assigned to this client", 409);

    const b = req.body as Record<string, unknown>;
    const expiresAt = (typeof b.expiresAt === "string" ? b.expiresAt : null) as string | null;

    const now = new Date().toISOString();
    const batch = db.batch();

    const cpRef = db.collection("client_programs").doc();
    batch.set(cpRef, {
      creatorId: auth.userId,
      clientId: req.params.clientId,
      courseId: req.params.programId,
      assignedAt: FieldValue.serverTimestamp(),
      expiresAt: expiresAt ?? null,
      planAssignments: {},
    });

    const userRef = db.collection("users").doc(req.params.clientId);
    batch.update(userRef, {
      [`courses.${req.params.programId}`]: {
        status: "active",
        deliveryType: programData.deliveryType ?? "one_on_one",
        title: programData.title ?? "",
        image_url: programData.imageUrl ?? programData.image_url ?? null,
        purchased_at: now,
        expires_at: expiresAt ?? null,
        is_trial: false,
        trial_consumed: false,
      },
    });

    await batch.commit();
    res.status(201).json({ data: { assignedAt: now } });
  } catch (err) { next(err); }
});

app.delete("/api/v1/creator/clients/:clientId/programs/:programId", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    assertCreator(auth);
    await requireClientRelationship(auth.userId, req.params.clientId);
    const snap = await db.collection("client_programs")
      .where("creatorId", "==", auth.userId)
      .where("clientId", "==", req.params.clientId)
      .where("courseId", "==", req.params.programId)
      .limit(1).get();
    if (snap.empty) throw apiError("NOT_FOUND", "Assignment not found", 404);
    await snap.docs[0].ref.delete();
    res.status(204).end();
  } catch (err) { next(err); }
});

// ── 6.3 Checkpoint ────────────────────────────────────────────────────────────

app.put("/api/v1/workout/checkpoint", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    const body = validateBody<{
      sessionId?: string; courseId?: string; moduleId?: string; sessionTitle?: string;
      exerciseStates?: unknown; currentExerciseIndex?: number; currentSetIndex?: number;
    }>({
      sessionId: "optional_string", courseId: "optional_string", moduleId: "optional_string",
      sessionTitle: "optional_string", exerciseStates: "optional_object",
      currentExerciseIndex: "optional_number", currentSetIndex: "optional_number",
    }, req.body);
    await db.collection("users").doc(auth.userId)
      .collection("workoutCheckpoint").doc("current")
      .set({ ...body, savedAt: FieldValue.serverTimestamp() });
    res.json({ data: { savedAt: new Date().toISOString() } });
  } catch (err) { next(err); }
});

app.get("/api/v1/workout/checkpoint", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    const snap = await db.collection("users").doc(auth.userId)
      .collection("workoutCheckpoint").doc("current").get();
    res.json({ data: snap.exists ? snap.data() : null });
  } catch (err) { next(err); }
});

app.delete("/api/v1/workout/checkpoint", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    await db.collection("users").doc(auth.userId)
      .collection("workoutCheckpoint").doc("current").delete();
    res.status(204).end();
  } catch (err) { next(err); }
});

// ── 6.4 Personal Records ─────────────────────────────────────────────────────

app.get("/api/v1/workout/prs", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    const userDoc = await db.collection("users").doc(auth.userId).get();
    const oneRepMaxEstimates = (userDoc.data()?.oneRepMaxEstimates ?? {}) as Record<string, {
      current: number;
      lastUpdated: string;
      achievedWith?: { weight: number; reps: number };
    }>;
    const data = Object.entries(oneRepMaxEstimates).map(([exerciseKey, val]) => {
      const parts = exerciseKey.split("_");
      return {
        exerciseKey,
        libraryId: parts[0] ?? exerciseKey,
        exerciseName: parts.slice(1).join("_") || exerciseKey,
        estimate1RM: val.current,
        achievedWith: val.achievedWith ?? null,
        lastUpdated: val.lastUpdated ?? null,
      };
    });
    res.json({ data });
  } catch (err) { next(err); }
});

app.get("/api/v1/workout/prs/:exerciseKey/history", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    const exerciseKey = req.params.exerciseKey;
    const snap = await db.collection("users").doc(auth.userId)
      .collection("oneRepMaxHistory").doc(exerciseKey)
      .collection("records")
      .orderBy("date", "desc")
      .get();
    const data = snap.docs.map(d => {
      const docData = d.data();
      let date: unknown = docData.date;
      if (date && typeof (date as { toDate?: () => Date }).toDate === "function") {
        date = (date as { toDate: () => Date }).toDate().toISOString();
      } else if (typeof date !== "string") {
        date = new Date(date as string).toISOString();
      }
      return { estimate1RM: docData.estimate as number, date };
    });
    res.json({ data });
  } catch (err) { next(err); }
});

app.delete("/api/v1/workout/prs/:exerciseKey", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    const exerciseKey = req.params.exerciseKey;
    const userRef = db.collection("users").doc(auth.userId);
    const updates: Record<string, unknown> = {};
    updates[`oneRepMaxEstimates.${exerciseKey}`] = FieldValue.delete();
    await userRef.update(updates);
    res.status(204).send();
  } catch (err) { next(err); }
});

// ── 6.5 Exercise History ──────────────────────────────────────────────────────

app.get("/api/v1/workout/exercises/:exerciseKey/history", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    const exerciseKey = req.params.exerciseKey;
    const docSnap = await db.collection("users").doc(auth.userId)
      .collection("exerciseHistory").doc(exerciseKey).get();
    if (!docSnap.exists) {
      return res.json({ data: [], nextPageToken: null, hasMore: false });
    }
    const sessions = Array.isArray(docSnap.data()!.sessions) ? docSnap.data()!.sessions : [];
    const normalized = (sessions as Array<Record<string, unknown>>)
      .map(s => {
        let date: unknown = s.date;
        if (date && typeof (date as { toDate?: () => Date }).toDate === "function") {
          date = (date as { toDate: () => Date }).toDate().toISOString();
        } else if (date instanceof Date) {
          date = (date as Date).toISOString();
        }
        return { ...s, date };
      })
      .sort((a, b) => {
        const dateA = typeof a.date === "string" ? new Date(a.date).getTime() : 0;
        const dateB = typeof b.date === "string" ? new Date(b.date).getTime() : 0;
        return dateB - dateA;
      });
    return res.json({ data: normalized, nextPageToken: null, hasMore: false });
  } catch (err) { next(err); return; }
});

// ── 6.6 Streak ────────────────────────────────────────────────────────────────

function workoutToYMD(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  let d: Date;
  if (typeof (value as { toDate?: () => Date }).toDate === "function") {
    d = (value as { toDate: () => Date }).toDate();
  } else {
    d = new Date(value as string);
  }
  if (isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function workoutComputeStreak(
  streakStartDate: string | null,
  lastActivityDate: string | null,
  today: string
): { currentStreak: number; flameLevel: number } {
  if (!lastActivityDate || !streakStartDate) return { currentStreak: 0, flameLevel: 0 };
  const daysSinceLast = Math.round(
    (new Date(today + "T12:00:00").getTime() - new Date(lastActivityDate + "T12:00:00").getTime()) / 86400000
  );
  if (daysSinceLast >= 4) return { currentStreak: 0, flameLevel: 0 };
  const currentStreak =
    Math.round(
      (new Date(today + "T12:00:00").getTime() - new Date(streakStartDate + "T12:00:00").getTime()) / 86400000
    ) + 1;
  const flameLevel = Math.max(1, 3 - Math.max(0, daysSinceLast - 1));
  return { currentStreak, flameLevel };
}

app.get("/api/v1/workout/streak", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    const userDoc = await db.collection("users").doc(auth.userId).get();
    const as = (userDoc.data()?.activityStreak ?? {}) as Record<string, unknown>;
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const lastActivityDate = workoutToYMD(as.lastActivityDate);
    const streakStartDate = workoutToYMD(as.streakStartDate);
    const { currentStreak, flameLevel } = workoutComputeStreak(streakStartDate, lastActivityDate, today);
    res.json({
      data: {
        currentStreak,
        longestStreak: typeof as.longestStreak === "number" ? as.longestStreak : 0,
        lastActivityDate,
        flameLevel,
      },
    });
  } catch (err) { next(err); }
});

// ── 6.7 Calendar ──────────────────────────────────────────────────────────────

app.get("/api/v1/workout/calendar", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    const courseId = typeof req.query.courseId === "string" ? req.query.courseId : null;
    const startDate = typeof req.query.startDate === "string" ? req.query.startDate : null;
    const endDate = typeof req.query.endDate === "string" ? req.query.endDate : null;
    if (!courseId) throw apiError("VALIDATION_ERROR", "courseId is required", 400, "courseId");
    if (!startDate) throw apiError("VALIDATION_ERROR", "startDate is required", 400, "startDate");
    if (!endDate) throw apiError("VALIDATION_ERROR", "endDate is required", 400, "endDate");
    const startTs = new Date(startDate + "T00:00:00");
    const endTs = new Date(endDate + "T23:59:59.999");
    const snap = await db.collection("users").doc(auth.userId)
      .collection("sessionHistory")
      .where("courseId", "==", courseId)
      .where("completedAt", ">=", startTs)
      .where("completedAt", "<=", endTs)
      .orderBy("completedAt", "asc")
      .get();
    const dates = new Set<string>();
    snap.forEach(d => {
      const data = d.data();
      let completedAt: Date;
      if (data.completedAt && typeof data.completedAt.toDate === "function") {
        completedAt = data.completedAt.toDate();
      } else {
        completedAt = new Date(data.completedAt);
      }
      if (isNaN(completedAt.getTime())) return;
      if (completedAt < startTs || completedAt > endTs) return;
      dates.add(
        `${completedAt.getFullYear()}-${String(completedAt.getMonth() + 1).padStart(2, "0")}-${String(completedAt.getDate()).padStart(2, "0")}`
      );
    });
    res.json({ data: Array.from(dates) });
  } catch (err) { next(err); }
});

app.get("/api/v1/workout/calendar/planned", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    const { courseId, startDate, endDate } = req.query as Record<string, string | undefined>;
    if (!courseId || !startDate || !endDate) throw apiError("VALIDATION_ERROR", "courseId, startDate y endDate son requeridos", 400);

    const start = new Date(startDate + "T00:00:00.000Z");
    const end = new Date(endDate + "T23:59:59.999Z");
    const toYMD = (ts: FirebaseFirestore.Timestamp | null): string | null => {
      if (!ts) return null;
      const d = ts.toDate();
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    };
    const dates = new Set<string>();

    let usedIndexed = false;
    try {
      const snap = await db.collection("client_sessions")
        .where("client_id", "==", auth.userId)
        .where("program_id", "==", courseId)
        .where("date_timestamp", ">=", start)
        .where("date_timestamp", "<=", end)
        .orderBy("date_timestamp", "asc").get();
      if (!snap.empty) {
        snap.forEach((d) => { const ymd = toYMD(d.data().date_timestamp ?? null); if (ymd) dates.add(ymd); });
        usedIndexed = true;
      }
    } catch { /* index may not exist, fall through */ }

    if (!usedIndexed) {
      const fallback = await db.collection("client_sessions")
        .where("client_id", "==", auth.userId)
        .where("program_id", "==", courseId)
        .orderBy("date_timestamp", "desc").limit(200).get()
        .catch(() => null);
      if (fallback) {
        fallback.forEach((d) => {
          const ymd = toYMD(d.data().date_timestamp ?? null);
          if (ymd) {
            const t = new Date(ymd + "T12:00:00Z").getTime();
            if (t >= start.getTime() && t <= end.getTime()) dates.add(ymd);
          }
        });
      }
    }
    res.json({ data: Array.from(dates) });
  } catch (err) { next(err); }
});

app.get("/api/v1/workout/calendar/completed", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    const { courseId, startDate, endDate } = req.query as Record<string, string | undefined>;
    if (!courseId || !startDate || !endDate) throw apiError("VALIDATION_ERROR", "courseId, startDate y endDate son requeridos", 400);

    const start = new Date(startDate + "T00:00:00.000Z");
    const end = new Date(endDate + "T23:59:59.999Z");

    const completedIds = new Set<string>();
    const userSnap = await db.collection("users").doc(auth.userId).get();
    const arr = (userSnap.data()?.courseProgress as Record<string, unknown> | undefined)?.[courseId] as Record<string, unknown> | undefined;
    if (Array.isArray(arr?.allSessionsCompleted)) (arr!.allSessionsCompleted as string[]).forEach((id: string) => completedIds.add(id));
    const historySnap = await db.collection("users").doc(auth.userId).collection("sessionHistory").where("courseId", "==", courseId).get().catch(() => null);
    if (historySnap) historySnap.docs.forEach((d) => { if (d.id) completedIds.add(d.id); });

    const toYMD = (ts: FirebaseFirestore.Timestamp | null): string | null => {
      if (!ts) return null;
      const d = ts.toDate();
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    };
    const getMondayKey = (d: Date): string => {
      const day = d.getDay();
      const monday = new Date(d);
      monday.setDate(d.getDate() - day + (day === 0 ? -6 : 1));
      return `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, "0")}-${String(monday.getDate()).padStart(2, "0")}`;
    };

    const dates = new Set<string>();
    let docsSnap: FirebaseFirestore.QuerySnapshot | null = null;
    try {
      docsSnap = await db.collection("client_sessions")
        .where("client_id", "==", auth.userId)
        .where("program_id", "==", courseId)
        .where("date_timestamp", ">=", start)
        .where("date_timestamp", "<=", end)
        .orderBy("date_timestamp", "asc").get();
    } catch { /* fall through */ }
    if (!docsSnap || docsSnap.empty) {
      docsSnap = await db.collection("client_sessions")
        .where("client_id", "==", auth.userId)
        .where("program_id", "==", courseId)
        .orderBy("date_timestamp", "desc").limit(200).get()
        .catch(() => null);
    }
    if (docsSnap) {
      docsSnap.docs.forEach((docSnap) => {
        const data = docSnap.data();
        const ymd = toYMD(data.date_timestamp ?? null);
        if (!ymd) return;
        const t = new Date(ymd + "T12:00:00Z").getTime();
        if (t < start.getTime() || t > end.getTime()) return;
        const ts = data.date_timestamp?.toDate?.() ?? null;
        const weekKey = ts ? getMondayKey(ts) : null;
        const slotId = data.plan_id && data.session_id && weekKey ? `${auth.userId}_${courseId}_${weekKey}_${data.session_id}` : docSnap.id;
        if (completedIds.has(slotId) || completedIds.has(docSnap.id)) dates.add(ymd);
      });
    }
    res.json({ data: Array.from(dates) });
  } catch (err) { next(err); }
});

// ── 6.5 Daily Session ─────────────────────────────────────────────────────────

// Helper: get the Monday date key for a given date (YYYY-MM-DD)
function getMondayKey(d: Date): string {
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1 - day);
  const mon = new Date(d);
  mon.setDate(d.getDate() + diff);
  const y = mon.getFullYear();
  const m = String(mon.getMonth() + 1).padStart(2, "0");
  const dd = String(mon.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

// Helper: batch-read exercises_library docs for a set of libraryIds
async function batchReadExerciseLibraries(libraryIds: string[]): Promise<Record<string, Record<string, any>>> {
  const result: Record<string, Record<string, any>> = {};
  await Promise.all(libraryIds.map(async (libId) => {
    try {
      const doc = await db.collection("exercises_library").doc(libId).get();
      if (doc.exists) result[libId] = doc.data() as Record<string, any>;
    } catch (_) { /* ignore missing */ }
  }));
  return result;
}

// Helper: batch-read exerciseLastPerformance docs for a set of keys
async function batchReadLastPerformance(userId: string, keys: string[]): Promise<Record<string, any>> {
  const result: Record<string, any> = {};
  await Promise.all(keys.map(async (key) => {
    try {
      const doc = await db.collection("users").doc(userId)
        .collection("exerciseLastPerformance").doc(key).get();
      if (doc.exists) result[key] = doc.data();
    } catch (_) { /* ignore */ }
  }));
  return result;
}

// Helper: resolve exercise data from library and build resolved exercise shape
function resolveExercise(
  ex: any,
  libraryDocs: Record<string, Record<string, any>>,
  lpDocs: Record<string, any>
): any {
  const libId: string | null = ex.primary ? Object.keys(ex.primary)[0] : null;
  const exerciseName: string | null = libId && ex.primary ? ex.primary[libId] : (ex.name ?? null);
  const libData = libId ? libraryDocs[libId] : null;
  const exerciseLibData = libData && exerciseName ? libData[exerciseName] : null;
  const lpKey = libId && exerciseName ? `${libId}_${exerciseName}` : null;
  const lp = lpKey ? (lpDocs[lpKey] ?? null) : null;

  return {
    exerciseId: ex.id,
    libraryId: libId,
    name: exerciseLibData?.title ?? exerciseName ?? ex.name ?? "Exercise",
    description: exerciseLibData?.description ?? "",
    video_url: exerciseLibData?.video_url ?? null,
    muscle_activation: exerciseLibData?.muscle_activation ?? null,
    implements: Array.isArray(exerciseLibData?.implements) ? exerciseLibData.implements : [],
    order: ex.order ?? 0,
    primary: ex.primary ?? null,
    alternatives: ex.alternatives ?? {},
    objectives: ex.objectives ?? [],
    measures: ex.measures ?? [],
    customMeasureLabels: ex.customMeasureLabels ?? {},
    customObjectiveLabels: ex.customObjectiveLabels ?? {},
    sets: (ex.sets ?? []).map((s: any) => ({
      setId: s.id,
      reps: s.reps ?? "",
      weight: s.weight ?? null,
      intensity: s.intensity ?? null,
      rir: s.rir ?? null,
      title: s.title ?? null,
      order: s.order ?? 0,
    })),
    lastPerformance: lp ? {
      sessionId: lp.sessionId ?? null,
      date: lp.date ?? null,
      sets: (lp.sets ?? []).map((s: any) => ({ reps: s.reps, weight: s.weight })),
      bestSet: lp.bestSet ?? null,
    } : null,
  };
}

// Helper: read full exercise+sets tree for a session from courses collection
async function readCourseSessionExercises(courseId: string, moduleId: string, sessionId: string): Promise<any[]> {
  const exercisesSnap = await db.collection("courses").doc(courseId)
    .collection("modules").doc(moduleId)
    .collection("sessions").doc(sessionId)
    .collection("exercises").orderBy("order", "asc").get();
  return await Promise.all(exercisesSnap.docs.map(async (exDoc) => {
    const exData: any = { id: exDoc.id, ...exDoc.data() };
    try {
      const setsSnap = await db.collection("courses").doc(courseId)
        .collection("modules").doc(moduleId)
        .collection("sessions").doc(sessionId)
        .collection("exercises").doc(exDoc.id)
        .collection("sets").orderBy("order", "asc").get();
      exData.sets = setsSnap.docs.map((s) => ({ id: s.id, ...s.data() }));
    } catch (_) { exData.sets = []; }
    return exData;
  }));
}

// Helper: read creator_libraries session exercises+sets
async function readCreatorLibrarySessionExercises(creatorId: string, sessionId: string): Promise<any[]> {
  const exercisesSnap = await db.collection("creator_libraries").doc(creatorId)
    .collection("sessions").doc(sessionId)
    .collection("exercises").orderBy("order", "asc").get();
  return await Promise.all(exercisesSnap.docs.map(async (exDoc) => {
    const exData: any = { id: exDoc.id, ...exDoc.data() };
    try {
      const setsSnap = await db.collection("creator_libraries").doc(creatorId)
        .collection("sessions").doc(sessionId)
        .collection("exercises").doc(exDoc.id)
        .collection("sets").orderBy("order", "asc").get();
      exData.sets = setsSnap.docs.map((s) => ({ id: s.id, ...s.data() }));
    } catch (_) { exData.sets = []; }
    return exData;
  }));
}

app.get("/api/v1/workout/daily", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    const userId = auth.userId;
    const courseId = typeof req.query.courseId === "string" ? req.query.courseId : null;
    const dateParam = typeof req.query.date === "string" ? req.query.date : null;
    const manualSessionId = typeof req.query.sessionId === "string" ? req.query.sessionId : null;

    if (!courseId) throw apiError("VALIDATION_ERROR", "courseId is required", 400, "courseId");

    const effectiveDate = dateParam ? new Date(dateParam + "T12:00:00") : new Date();
    const todayStr = effectiveDate.toISOString().slice(0, 10);

    // 1. Verify enrollment + read course progress from user doc
    const userDoc = await db.collection("users").doc(userId).get();
    if (!userDoc.exists) throw apiError("NOT_FOUND", "User not found", 404);
    const userData = userDoc.data()!;
    const courseEntry = userData.courses?.[courseId];
    if (!courseEntry) throw apiError("NOT_FOUND", "Course not found or user not enrolled", 404);
    const courseProgress = userData.courseProgress?.[courseId] ?? null;

    // 2. Read course metadata
    const courseDoc = await db.collection("courses").doc(courseId).get();
    if (!courseDoc.exists) throw apiError("NOT_FOUND", "Course not found", 404);
    const courseData = courseDoc.data()!;
    const deliveryType: string = courseEntry.deliveryType ?? courseData.deliveryType ?? "low_ticket";
    const creatorId: string | null = courseData.creator_id ?? courseData.creatorId ?? null;

    // ── LOW TICKET path ──────────────────────────────────────────────────────
    if (deliveryType !== "one_on_one") {
      // 3. Read all modules + sessions (metadata only for session list)
      const modulesSnap = await db.collection("courses").doc(courseId)
        .collection("modules").orderBy("order", "asc").get();

      type SessionMeta = { id: string; sessionId: string; title: string; order: number; moduleId: string; moduleTitle: string; image_url: string | null };
      const allSessions: SessionMeta[] = [];

      await Promise.all(modulesSnap.docs.map(async (moduleDoc) => {
        const mData: any = { id: moduleDoc.id, ...moduleDoc.data() };
        const sessionsSnap = await db.collection("courses").doc(courseId)
          .collection("modules").doc(moduleDoc.id)
          .collection("sessions").orderBy("order", "asc").get();
        sessionsSnap.docs.forEach((sDoc) => {
          const sData: any = sDoc.data();
          allSessions.push({
            id: sDoc.id,
            sessionId: sDoc.id,
            title: sData.title ?? "",
            order: sData.order ?? 0,
            moduleId: moduleDoc.id,
            moduleTitle: mData.title ?? "",
            image_url: sData.image_url ?? null,
          });
        });
      }));

      // Sort sessions by module order then session order
      allSessions.sort((a, b) => {
        const modOrderA = modulesSnap.docs.findIndex(d => d.id === a.moduleId);
        const modOrderB = modulesSnap.docs.findIndex(d => d.id === b.moduleId);
        if (modOrderA !== modOrderB) return modOrderA - modOrderB;
        return a.order - b.order;
      });

      if (allSessions.length === 0) {
        return res.json({ data: { hasSession: false, isRestDay: false, emptyReason: "no_sessions", session: null, allSessions: [], progress: null, courseTitle: courseData.title ?? null, courseImageUrl: courseData.image_url ?? null } });
      }

      // 4. Select current session
      let currentSession: SessionMeta;
      if (manualSessionId) {
        currentSession = allSessions.find(s => s.id === manualSessionId) ?? allSessions[0];
      } else {
        const lastCompleted: string | null = courseProgress?.lastSessionCompleted ?? null;
        if (!lastCompleted) {
          currentSession = allSessions[0];
        } else {
          const lastIdx = allSessions.findIndex(s => s.id === lastCompleted);
          currentSession = (lastIdx >= 0 && lastIdx + 1 < allSessions.length)
            ? allSessions[lastIdx + 1]
            : allSessions[0];
        }
      }

      // 5. Load full exercise + sets tree for current session
      const rawExercises = await readCourseSessionExercises(courseId, currentSession.moduleId, currentSession.id);

      // 6. Batch-read exercise library data
      const libraryIds = [...new Set(rawExercises.filter(ex => ex.primary).map(ex => Object.keys(ex.primary)[0] as string))];
      const libraryDocs = await batchReadExerciseLibraries(libraryIds);

      // 7. Batch-read last performance
      const lpKeys = rawExercises
        .filter(ex => ex.primary)
        .map(ex => { const libId = Object.keys(ex.primary)[0]; return `${libId}_${ex.primary[libId]}`; });
      const lpDocs = await batchReadLastPerformance(userId, lpKeys);

      // 8. Build resolved exercises
      const resolvedExercises = rawExercises.map(ex => resolveExercise(ex, libraryDocs, lpDocs));

      // 9. Compute todaySessionAlreadyCompleted
      const lastActivity = courseProgress?.lastActivity;
      let isCompletedToday = false;
      if (lastActivity) {
        const lastDate = lastActivity.toDate ? lastActivity.toDate() : new Date(lastActivity);
        isCompletedToday = lastDate.toISOString().slice(0, 10) === todayStr;
      }
      const completedSet = new Set<string>(courseProgress?.allSessionsCompleted ?? []);
      const todaySessionAlreadyCompleted = !manualSessionId && completedSet.has(currentSession.id) && isCompletedToday;

      const progressData = courseProgress ? {
        lastSessionCompleted: courseProgress.lastSessionCompleted ?? null,
        totalSessionsCompleted: courseProgress.totalSessionsCompleted ?? 0,
        allSessionsCompleted: courseProgress.allSessionsCompleted ?? [],
        lastActivity: courseProgress.lastActivity ?? null,
        completed: courseProgress.totalSessionsCompleted ?? 0,
        total: allSessions.length,
      } : null;

      return res.json({
        data: {
          hasSession: true,
          isRestDay: false,
          emptyReason: null,
          todaySessionAlreadyCompleted,
          courseTitle: courseData.title ?? null,
          courseImageUrl: courseData.image_url ?? null,
          session: {
            sessionId: currentSession.id,
            title: currentSession.title,
            order: currentSession.order,
            deliveryType,
            moduleId: currentSession.moduleId,
            moduleTitle: currentSession.moduleTitle,
            image_url: currentSession.image_url,
            exercises: resolvedExercises,
          },
          allSessions: allSessions.map(s => ({ sessionId: s.id, title: s.title, moduleId: s.moduleId, moduleTitle: s.moduleTitle, order: s.order })),
          progress: progressData,
        },
      });
    }

    // ── ONE-ON-ONE path ──────────────────────────────────────────────────────
    const weekKey = getMondayKey(effectiveDate);
    const dayStart = new Date(effectiveDate); dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(effectiveDate); dayEnd.setHours(23, 59, 59, 999);

    // 3. Find today's planned session slot from client_sessions
    let plannedSlot: any = null;
    try {
      let q = db.collection("client_sessions")
        .where("client_id", "==", userId)
        .where("program_id", "==", courseId)
        .where("date_timestamp", ">=", dayStart)
        .where("date_timestamp", "<=", dayEnd)
        .orderBy("date_timestamp", "asc")
        .limit(1);
      const slotSnap = await q.get();
      if (!slotSnap.empty) plannedSlot = { id: slotSnap.docs[0].id, ...slotSnap.docs[0].data() };
    } catch (_) { /* composite index may be missing */ }

    // 4. Get week's sessions for session list (all client_sessions in week)
    const weekStart = new Date(weekKey + "T00:00:00");
    const weekEnd = new Date(weekStart); weekEnd.setDate(weekEnd.getDate() + 6); weekEnd.setHours(23, 59, 59, 999);
    type OOOSession = { id: string; sessionId: string; title: string; order: number; moduleId: string; moduleTitle: string; image_url: string | null; plannedDate: string | null; session_id?: string; plan_id?: string };
    const weekSessions: OOOSession[] = [];
    try {
      const weekSnap = await db.collection("client_sessions")
        .where("client_id", "==", userId)
        .where("program_id", "==", courseId)
        .where("date_timestamp", ">=", weekStart)
        .where("date_timestamp", "<=", weekEnd)
        .orderBy("date_timestamp", "asc")
        .get();
      weekSnap.docs.forEach((d) => {
        const data = d.data();
        const ts = data.date_timestamp?.toDate?.() ?? null;
        weekSessions.push({
          id: d.id,
          sessionId: d.id,
          title: data.title ?? data.session_name ?? "Sesión",
          order: 0,
          moduleId: weekKey,
          moduleTitle: `Semana ${weekKey}`,
          image_url: data.image_url ?? null,
          plannedDate: ts ? ts.toISOString() : null,
          session_id: data.session_id ?? null,
          plan_id: data.plan_id ?? null,
        });
      });
    } catch (_) { /* ignore */ }

    if (weekSessions.length === 0) {
      return res.json({
        data: {
          hasSession: false,
          isRestDay: false,
          emptyReason: "no_planning_this_week",
          todaySessionAlreadyCompleted: false,
          courseTitle: courseData.title ?? null,
          courseImageUrl: courseData.image_url ?? null,
          session: null,
          allSessions: [],
          progress: null,
        },
      });
    }

    // Determine which session to show
    let currentOOOSession: OOOSession | null = null;
    if (manualSessionId) {
      currentOOOSession = weekSessions.find(s => s.id === manualSessionId) ?? null;
    } else if (plannedSlot) {
      currentOOOSession = weekSessions.find(s => s.id === plannedSlot.id) ?? null;
    }

    if (!currentOOOSession) {
      return res.json({
        data: {
          hasSession: false,
          isRestDay: false,
          emptyReason: "no_session_today",
          todaySessionAlreadyCompleted: false,
          courseTitle: courseData.title ?? null,
          courseImageUrl: courseData.image_url ?? null,
          session: null,
          allSessions: weekSessions.map(s => ({ sessionId: s.id, title: s.title, moduleId: s.moduleId, moduleTitle: s.moduleTitle, order: s.order, plannedDate: s.plannedDate })),
          progress: null,
        },
      });
    }

    // 5. Load full exercise content — prefer creator_libraries via session_id
    let rawExercisesOOO: any[] = [];
    const targetSessionId: string | null = currentOOOSession.session_id ?? null;
    if (targetSessionId && creatorId) {
      try {
        rawExercisesOOO = await readCreatorLibrarySessionExercises(creatorId, targetSessionId);
        if (rawExercisesOOO.length === 0 && currentOOOSession.plan_id) {
          // Try plans collection fallback
          const planSnap = await db.collection("plans").doc(currentOOOSession.plan_id)
            .collection("modules").limit(50).get();
          for (const mDoc of planSnap.docs) {
            const sessionsSnap = await db.collection("plans").doc(currentOOOSession.plan_id)
              .collection("modules").doc(mDoc.id)
              .collection("sessions").get();
            const matchingSession = sessionsSnap.docs.find(s => s.id === targetSessionId);
            if (matchingSession) {
              const exSnap = await db.collection("plans").doc(currentOOOSession.plan_id)
                .collection("modules").doc(mDoc.id)
                .collection("sessions").doc(matchingSession.id)
                .collection("exercises").orderBy("order", "asc").get();
              rawExercisesOOO = await Promise.all(exSnap.docs.map(async (exDoc) => {
                const exData: any = { id: exDoc.id, ...exDoc.data() };
                try {
                  const setsSnap = await db.collection("plans").doc(currentOOOSession!.plan_id!)
                    .collection("modules").doc(mDoc.id)
                    .collection("sessions").doc(matchingSession.id)
                    .collection("exercises").doc(exDoc.id)
                    .collection("sets").orderBy("order", "asc").get();
                  exData.sets = setsSnap.docs.map(s => ({ id: s.id, ...s.data() }));
                } catch (_) { exData.sets = []; }
                return exData;
              }));
              break;
            }
          }
        }
        // Enrich session metadata from creator library if title/image missing
        if (creatorId && targetSessionId) {
          try {
            const libSessionDoc = await db.collection("creator_libraries").doc(creatorId)
              .collection("sessions").doc(targetSessionId).get();
            if (libSessionDoc.exists) {
              const libData = libSessionDoc.data()!;
              currentOOOSession.title = currentOOOSession.title || libData.title;
              currentOOOSession.image_url = currentOOOSession.image_url ?? libData.image_url ?? null;
            }
          } catch (_) { /* ignore */ }
        }
      } catch (_) { rawExercisesOOO = []; }
    }

    // 6. Batch-read exercise library data
    const libraryIdsOOO = [...new Set(rawExercisesOOO.filter(ex => ex.primary).map(ex => Object.keys(ex.primary)[0] as string))];
    const libraryDocsOOO = await batchReadExerciseLibraries(libraryIdsOOO);

    // 7. Batch-read last performance
    const lpKeysOOO = rawExercisesOOO
      .filter(ex => ex.primary)
      .map(ex => { const libId = Object.keys(ex.primary)[0]; return `${libId}_${ex.primary[libId]}`; });
    const lpDocsOOO = await batchReadLastPerformance(userId, lpKeysOOO);

    // 8. Build resolved exercises
    const resolvedExercisesOOO = rawExercisesOOO.map(ex => resolveExercise(ex, libraryDocsOOO, lpDocsOOO));

    // 9. todaySessionAlreadyCompleted
    const lastActivityOOO = courseProgress?.lastActivity;
    let isCompletedTodayOOO = false;
    if (lastActivityOOO) {
      const lastDate = lastActivityOOO.toDate ? lastActivityOOO.toDate() : new Date(lastActivityOOO);
      isCompletedTodayOOO = lastDate.toISOString().slice(0, 10) === todayStr;
    }
    const completedSetOOO = new Set<string>(courseProgress?.allSessionsCompleted ?? []);
    const todaySessionAlreadyCompletedOOO = !manualSessionId && completedSetOOO.has(currentOOOSession.id) && isCompletedTodayOOO;

    return res.json({
      data: {
        hasSession: true,
        isRestDay: false,
        emptyReason: null,
        todaySessionAlreadyCompleted: todaySessionAlreadyCompletedOOO,
        courseTitle: courseData.title ?? null,
        courseImageUrl: courseData.image_url ?? null,
        session: {
          sessionId: currentOOOSession.id,
          title: currentOOOSession.title,
          order: currentOOOSession.order,
          deliveryType,
          moduleId: currentOOOSession.moduleId,
          moduleTitle: currentOOOSession.moduleTitle,
          image_url: currentOOOSession.image_url,
          plannedDate: currentOOOSession.plannedDate,
          exercises: resolvedExercisesOOO,
        },
        allSessions: weekSessions.map(s => ({ sessionId: s.id, title: s.title, moduleId: s.moduleId, moduleTitle: s.moduleTitle, order: s.order, plannedDate: s.plannedDate })),
        progress: null,
      },
    });
  } catch (err) { return next(err); }
});

// ── 7.6 Creator Events ────────────────────────────────────────────────────────

interface EventField {
  fieldId: string;
  fieldName: string;
  fieldType: string;
  required: boolean;
}

async function requireOwnEvent(
  creatorId: string,
  eventId: string
): Promise<FirebaseFirestore.DocumentSnapshot> {
  const doc = await db.collection("events").doc(eventId).get();
  if (!doc.exists) throw apiError("NOT_FOUND", "Event not found", 404);
  if (doc.data()?.creatorId !== creatorId) throw apiError("FORBIDDEN", "Not your event", 403);
  return doc;
}

app.get("/api/v1/creator/events", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    assertCreator(auth);
    const snap = await db.collection("events")
      .where("creatorId", "==", auth.userId)
      .orderBy("createdAt", "desc")
      .get();
    const data = snap.docs.map((d) => {
      const e = d.data();
      return {
        eventId: d.id,
        title: e.title ?? "",
        description: (e.description ?? null) as string | null,
        imageUrl: (e.imageUrl ?? null) as string | null,
        date: e.date ?? null,
        location: (e.location ?? null) as string | null,
        status: e.status ?? "draft",
        maxRegistrations: (e.maxRegistrations ?? null) as number | null,
        registrationCount: (e.registration_count ?? 0) as number,
        fields: (e.fields ?? []) as EventField[],
        createdAt: e.createdAt?.toDate?.()?.toISOString() ?? null,
      };
    });
    res.json({ data });
  } catch (err) { next(err); }
});

app.post("/api/v1/creator/events", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    assertCreator(auth);
    const body = validateBody<{
      title: string;
      description?: string | null;
      date: string;
      location?: string | null;
      maxRegistrations?: number | null;
      fields?: unknown[];
    }>({
      title: "string",
      description: "optional_string",
      date: "string",
      location: "optional_string",
      maxRegistrations: "optional_number",
      fields: "optional_array",
    }, req.body);
    const fields: EventField[] = ((body.fields ?? []) as Array<Record<string, unknown>>).map((f, i) => ({
      fieldId: `field_${i}_${Date.now()}`,
      fieldName: String(f.fieldName ?? ""),
      fieldType: String(f.fieldType ?? "text"),
      required: Boolean(f.required ?? false),
    }));
    const ref = db.collection("events").doc();
    await ref.set({
      title: body.title,
      description: body.description ?? null,
      date: body.date,
      location: body.location ?? null,
      maxRegistrations: body.maxRegistrations ?? null,
      fields,
      status: "draft",
      creatorId: auth.userId,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    res.status(201).json({ data: { eventId: ref.id, createdAt: new Date().toISOString() } });
  } catch (err) { next(err); }
});

app.patch("/api/v1/creator/events/:eventId", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    assertCreator(auth);
    const doc = await requireOwnEvent(auth.userId, req.params.eventId);
    const status = doc.data()?.status;
    if (status === "closed") throw apiError("CONFLICT", "Cannot update a closed event", 409);
    const b = req.body as Record<string, unknown>;
    const updates: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
    if (b.title !== undefined) {
      if (typeof b.title !== "string") throw apiError("VALIDATION_ERROR", "title must be a string", 400, "title");
      updates.title = b.title;
    }
    if (b.description !== undefined) updates.description = b.description ?? null;
    if (b.date !== undefined) updates.date = b.date;
    if (b.location !== undefined) updates.location = b.location ?? null;
    if (b.maxRegistrations !== undefined) updates.maxRegistrations = b.maxRegistrations ?? null;
    if (b.fields !== undefined && Array.isArray(b.fields)) {
      updates.fields = (b.fields as Array<Record<string, unknown>>).map((f, i) => ({
        fieldId: String(f.fieldId ?? `field_${i}_${Date.now()}`),
        fieldName: String(f.fieldName ?? ""),
        fieldType: String(f.fieldType ?? "text"),
        required: Boolean(f.required ?? false),
      }));
    }
    await doc.ref.update(updates);
    res.json({ data: { eventId: req.params.eventId, updatedAt: new Date().toISOString() } });
  } catch (err) { next(err); }
});

app.patch("/api/v1/creator/events/:eventId/status", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    assertCreator(auth);
    const doc = await requireOwnEvent(auth.userId, req.params.eventId);
    const body = validateBody<{ status: string }>({ status: "string" }, req.body);
    if (!["draft", "active", "closed"].includes(body.status)) {
      throw apiError("VALIDATION_ERROR", "status must be draft, active, or closed", 400, "status");
    }
    await doc.ref.update({ status: body.status, updatedAt: FieldValue.serverTimestamp() });
    res.json({ data: { eventId: req.params.eventId, status: body.status } });
  } catch (err) { next(err); }
});

app.delete("/api/v1/creator/events/:eventId", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    assertCreator(auth);
    const doc = await requireOwnEvent(auth.userId, req.params.eventId);
    const status = doc.data()?.status;
    if (status !== "draft") {
      const regSnap = await db.collection("event_signups").doc(req.params.eventId)
        .collection("registrations").limit(1).get();
      if (!regSnap.empty) {
        throw apiError("CONFLICT", "Cannot delete event with existing registrations", 409);
      }
    }
    await doc.ref.delete();
    res.status(204).end();
  } catch (err) { next(err); }
});

app.post("/api/v1/creator/events/:eventId/image/upload-url", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    assertCreator(auth);
    await requireOwnEvent(auth.userId, req.params.eventId);
    const body = validateBody<{ contentType: string }>({ contentType: "string" }, req.body);
    const allowed = ["image/jpeg", "image/png", "image/webp"];
    if (!allowed.includes(body.contentType)) {
      throw apiError("VALIDATION_ERROR", "contentType must be image/jpeg, image/png, or image/webp", 400, "contentType");
    }
    const ext = body.contentType === "image/png" ? "png" : body.contentType === "image/webp" ? "webp" : "jpg";
    const storagePath = `events/${req.params.eventId}/cover.${ext}`;
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
    let uploadUrl: string;
    try {
      [uploadUrl] = await admin.storage().bucket().file(storagePath).getSignedUrl({
        version: "v4",
        action: "write",
        expires: expiresAt,
        contentType: body.contentType,
      });
    } catch (e: unknown) {
      functions.logger.error('getSignedUrl failed', { error: e instanceof Error ? e.message : String(e) });
      throw apiError("INTERNAL_ERROR", "Storage signing failed", 500);
    }
    res.json({ data: { uploadUrl, storagePath, expiresAt: expiresAt.toISOString() } });
  } catch (err) { next(err); }
});

app.post("/api/v1/creator/events/:eventId/image/confirm", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    assertCreator(auth);
    const doc = await requireOwnEvent(auth.userId, req.params.eventId);
    const body = validateBody<{ storagePath: string }>({ storagePath: "string" }, req.body);
    if (!body.storagePath.startsWith(`events/${req.params.eventId}/`)) {
      throw apiError("FORBIDDEN", "Storage path does not belong to this event", 403);
    }
    const file = admin.storage().bucket().file(body.storagePath);
    const [exists] = await file.exists();
    if (!exists) throw apiError("NOT_FOUND", "File not found in storage", 404);
    const downloadToken = crypto.randomUUID();
    await file.setMetadata({ metadata: { firebaseStorageDownloadTokens: downloadToken } });
    const bucketName = admin.storage().bucket().name;
    const encodedPath = encodeURIComponent(body.storagePath);
    const imageUrl = `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodedPath}?alt=media&token=${downloadToken}`;
    await doc.ref.update({ imageUrl, updatedAt: FieldValue.serverTimestamp() });
    res.json({ data: { imageUrl } });
  } catch (err) { next(err); }
});

app.get("/api/v1/creator/events/:eventId/registrations", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    assertCreator(auth);
    await requireOwnEvent(auth.userId, req.params.eventId);
    const PAGE_SIZE = 50;
    const { pageToken, checkedIn } = req.query as Record<string, string | undefined>;
    let q: FirebaseFirestore.Query = db.collection("event_signups").doc(req.params.eventId)
      .collection("registrations")
      .orderBy("createdAt", "desc")
      .limit(PAGE_SIZE + 1);
    if (pageToken) {
      const cursor = Buffer.from(pageToken, "base64").toString("utf8");
      q = q.startAfter(cursor);
    }
    const snap = await q.get();
    let allDocs = snap.docs;
    if (checkedIn === "true") allDocs = allDocs.filter((d) => d.data().checkedIn === true);
    else if (checkedIn === "false") allDocs = allDocs.filter((d) => d.data().checkedIn !== true);
    const hasMore = allDocs.length > PAGE_SIZE;
    const docs = hasMore ? allDocs.slice(0, PAGE_SIZE) : allDocs;
    const data = docs.map((d) => {
      const e = d.data();
      return {
        registrationId: d.id,
        clientUserId: (e.clientUserId ?? null) as string | null,
        email: e.email ?? "",
        displayName: (e.displayName ?? null) as string | null,
        checkedIn: e.checkedIn ?? false,
        checkedInAt: (e.checkedInAt?.toDate?.()?.toISOString() ?? null) as string | null,
        fieldValues: (e.fieldValues ?? {}) as Record<string, unknown>,
        createdAt: e.createdAt?.toDate?.()?.toISOString() ?? null,
      };
    });
    const lastCreatedAt = docs.length > 0
      ? (docs[docs.length - 1].data().createdAt?.toDate?.()?.toISOString() ?? docs[docs.length - 1].id)
      : null;
    res.json({
      data,
      nextPageToken: hasMore && lastCreatedAt ? Buffer.from(lastCreatedAt).toString("base64") : null,
      hasMore,
    });
  } catch (err) { next(err); }
});

app.post("/api/v1/creator/events/:eventId/registrations/:registrationId/check-in", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    assertCreator(auth);
    await requireOwnEvent(auth.userId, req.params.eventId);
    const ref = db.collection("event_signups").doc(req.params.eventId)
      .collection("registrations").doc(req.params.registrationId);
    const doc = await ref.get();
    if (!doc.exists) throw apiError("NOT_FOUND", "Registration not found", 404);
    if (doc.data()?.checkedIn === true) throw apiError("CONFLICT", "Already checked in", 409);
    const checkedInAt = new Date().toISOString();
    await ref.update({ checkedIn: true, checkedInAt: FieldValue.serverTimestamp() });
    res.json({ data: { registrationId: req.params.registrationId, checkedInAt } });
  } catch (err) { next(err); }
});

app.delete("/api/v1/creator/events/:eventId/registrations/:registrationId", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    assertCreator(auth);
    await requireOwnEvent(auth.userId, req.params.eventId);
    const ref = db.collection("event_signups").doc(req.params.eventId)
      .collection("registrations").doc(req.params.registrationId);
    const doc = await ref.get();
    if (!doc.exists) throw apiError("NOT_FOUND", "Registration not found", 404);
    await ref.delete();
    res.status(204).end();
  } catch (err) { next(err); }
});

app.get("/api/v1/creator/events/:eventId/waitlist", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    assertCreator(auth);
    await requireOwnEvent(auth.userId, req.params.eventId);
    const snap = await db.collection("event_signups").doc(req.params.eventId)
      .collection("waitlist")
      .orderBy("createdAt", "asc")
      .get();
    const data = snap.docs.map((d) => {
      const e = d.data();
      return {
        registrationId: d.id,
        clientUserId: (e.clientUserId ?? null) as string | null,
        email: e.email ?? "",
        displayName: (e.displayName ?? null) as string | null,
        checkedIn: false,
        checkedInAt: null as string | null,
        fieldValues: (e.fieldValues ?? {}) as Record<string, unknown>,
        createdAt: e.createdAt?.toDate?.()?.toISOString() ?? null,
      };
    });
    res.json({ data, nextPageToken: null, hasMore: false });
  } catch (err) { next(err); }
});

app.post("/api/v1/creator/events/:eventId/waitlist/:waitlistId/admit", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    assertCreator(auth);
    await requireOwnEvent(auth.userId, req.params.eventId);
    const waitRef = db.collection("event_signups").doc(req.params.eventId)
      .collection("waitlist").doc(req.params.waitlistId);
    const waitDoc = await waitRef.get();
    if (!waitDoc.exists) throw apiError("NOT_FOUND", "Waitlist entry not found", 404);
    const waitData = waitDoc.data()!;
    const regRef = db.collection("event_signups").doc(req.params.eventId)
      .collection("registrations").doc();
    const batch = db.batch();
    batch.set(regRef, {
      email: waitData.email,
      displayName: waitData.displayName ?? null,
      clientUserId: waitData.clientUserId ?? null,
      fieldValues: waitData.fieldValues ?? {},
      checkedIn: false,
      checkedInAt: null,
      admittedFromWaitlist: true,
      createdAt: FieldValue.serverTimestamp(),
    });
    batch.delete(waitRef);
    await batch.commit();
    res.json({ data: { registrationId: regRef.id } });
  } catch (err) { next(err); }
});

// ── §8 Events (Public / PWA) ──────────────────────────────────────────────────

app.get("/api/v1/events/:eventId", async (req, res, next) => {
  try {
    await checkRateLimit(`event_get_${req.params.eventId}`, 30);
    const doc = await db.collection("events").doc(req.params.eventId).get();
    if (!doc.exists) throw apiError("NOT_FOUND", "Event not found", 404);
    const e = doc.data()!;
    if (e.status === "draft") throw apiError("NOT_FOUND", "Event not found", 404);
    let spotsRemaining: number | null = null;
    if (e.maxRegistrations != null) {
      const regSnap = await db.collection("event_signups").doc(req.params.eventId)
        .collection("registrations").get();
      spotsRemaining = Math.max(0, (e.maxRegistrations as number) - regSnap.size);
    }
    res.json({
      data: {
        eventId: doc.id,
        title: e.title ?? "",
        description: (e.description ?? null) as string | null,
        imageUrl: (e.imageUrl ?? null) as string | null,
        date: e.date ?? null,
        location: (e.location ?? null) as string | null,
        status: e.status,
        maxRegistrations: (e.maxRegistrations ?? null) as number | null,
        spotsRemaining,
        wakeUsersOnly: Boolean(e.wakeUsersOnly ?? false),
        settings: (e.settings ?? null) as Record<string, unknown> | null,
        fields: (e.fields ?? []) as EventField[],
      },
    });
  } catch (err) { next(err); }
});

app.post("/api/v1/events/:eventId/register", async (req, res, next) => {
  try {
    await checkRateLimit(`event_reg_${req.params.eventId}`, 10);
    const doc = await db.collection("events").doc(req.params.eventId).get();
    if (!doc.exists) throw apiError("NOT_FOUND", "Event not found", 404);
    const e = doc.data()!;
    if (e.status !== "active") throw apiError("FORBIDDEN", "Event is not accepting registrations", 403);
    const body = validateBody<{ email: string; displayName?: string | null; fieldValues?: Record<string, unknown> }>({
      email: "string",
      displayName: "optional_string",
      fieldValues: "optional_object",
    }, req.body);
    const email = body.email.trim().toLowerCase();
    if (!email) throw apiError("VALIDATION_ERROR", "email is required", 400, "email");
    const fields = (e.fields ?? []) as EventField[];
    const fieldValues = body.fieldValues ?? {};
    for (const field of fields) {
      if (field.required && !fieldValues[field.fieldId]) {
        throw apiError("VALIDATION_ERROR", `Field '${field.fieldName}' is required`, 400, field.fieldId);
      }
    }
    const signupsRef = db.collection("event_signups").doc(req.params.eventId);
    const existingReg = await signupsRef.collection("registrations")
      .where("email", "==", email).limit(1).get();
    if (!existingReg.empty) throw apiError("CONFLICT", "Already registered with this email", 409);
    const existingWait = await signupsRef.collection("waitlist")
      .where("email", "==", email).limit(1).get();
    if (!existingWait.empty) throw apiError("CONFLICT", "Already on the waitlist with this email", 409);
    let clientUserId: string | null = null;
    try {
      const authHeader = req.headers.authorization;
      if (authHeader?.startsWith("Bearer ")) {
        const token = authHeader.slice(7);
        if (!token.startsWith("wk_live_") && !token.startsWith("wk_test_")) {
          const decoded = await admin.auth().verifyIdToken(token);
          clientUserId = decoded.uid;
        }
      }
    } catch (_) { /* unauthenticated is fine */ }
    const qrEnabled = (e.settings as Record<string, unknown> | null)?.enableQrCheckin === true;
    const checkInToken = qrEnabled ? crypto.randomUUID() : null;
    const result = await db.runTransaction(async (tx) => {
      const regSnap = await tx.get(signupsRef.collection("registrations"));
      const atCapacity = e.maxRegistrations != null && regSnap.size >= (e.maxRegistrations as number);
      if (atCapacity) {
        const waitSnap = await tx.get(signupsRef.collection("waitlist"));
        const waitRef = signupsRef.collection("waitlist").doc();
        tx.set(waitRef, {
          email,
          displayName: body.displayName ?? null,
          clientUserId,
          fieldValues,
          createdAt: FieldValue.serverTimestamp(),
        });
        return { registrationId: waitRef.id, status: "waitlisted" as const, waitlistPosition: waitSnap.size + 1, checkInToken: null };
      } else {
        const regRef = signupsRef.collection("registrations").doc();
        tx.set(regRef, {
          email,
          displayName: body.displayName ?? null,
          clientUserId,
          fieldValues,
          checkInToken,
          checkedIn: false,
          checkedInAt: null,
          createdAt: FieldValue.serverTimestamp(),
        });
        return { registrationId: regRef.id, status: "registered" as const, waitlistPosition: null, checkInToken };
      }
    });

    res.json({ data: result });
  } catch (err) { next(err); }
});

app.post("/api/v1/events/:eventId/waitlist", async (req, res, next) => {
  try {
    await checkRateLimit(`event_waitlist_${req.params.eventId}`, 10);
    const doc = await db.collection("events").doc(req.params.eventId).get();
    if (!doc.exists) throw apiError("NOT_FOUND", "Event not found", 404);
    const body = validateBody<{ contact: string }>({ contact: "string" }, req.body);
    const contact = body.contact.trim();
    if (!contact) throw apiError("VALIDATION_ERROR", "contact is required", 400, "contact");
    const ref = db.collection("event_signups").doc(req.params.eventId)
      .collection("waitlist").doc();
    await ref.set({ contact, createdAt: FieldValue.serverTimestamp() });
    res.json({ data: { waitlistId: ref.id } });
  } catch (err) { next(err); }
});

// ── §9 Bookings (PWA — Client Side) ──────────────────────────────────────────

app.get("/api/v1/creator/:creatorId/availability", async (req, res, next) => {
  try {
    await validateAuth(req);
    const { startDate, endDate } = req.query as Record<string, string | undefined>;
    if (!startDate || !endDate) {
      throw apiError("VALIDATION_ERROR", "startDate and endDate are required", 400);
    }
    const creatorDoc = await db.collection("users").doc(req.params.creatorId).get();
    if (!creatorDoc.exists) throw apiError("NOT_FOUND", "Creator not found", 404);
    if (creatorDoc.data()?.role !== "creator" && creatorDoc.data()?.role !== "admin") {
      throw apiError("FORBIDDEN", "User is not a creator", 403);
    }
    const availDoc = await db.collection("creator_availability").doc(req.params.creatorId).get();
    const timezone = availDoc.exists ? (availDoc.data()?.timezone ?? "America/Bogota") : "America/Bogota";
    const allDays = (availDoc.exists ? (availDoc.data()?.days ?? {}) : {}) as Record<string, { slots: Array<{ startUtc: string; endUtc: string; durationMinutes: number; booked?: boolean }> }>;
    const bookedSnap = await db.collection("call_bookings")
      .where("creatorId", "==", req.params.creatorId)
      .where("status", "==", "scheduled")
      .get();
    const bookedSlots = new Set(bookedSnap.docs.map((d) => d.data().slotStartUtc));
    const start = new Date(startDate);
    const end = new Date(endDate);
    const diffMs = end.getTime() - start.getTime();
    if (diffMs > 60 * 24 * 60 * 60 * 1000) {
      throw apiError("VALIDATION_ERROR", "Date range cannot exceed 60 days", 400);
    }
    const filteredDays: Record<string, { availableSlots: Array<{ startUtc: string; endUtc: string; durationMinutes: number }> }> = {};
    for (const [date, dayData] of Object.entries(allDays)) {
      if (date < startDate || date > endDate) continue;
      const availableSlots = (dayData.slots ?? [])
        .filter((s) => !s.booked && !bookedSlots.has(s.startUtc))
        .map((s) => ({ startUtc: s.startUtc, endUtc: s.endUtc, durationMinutes: s.durationMinutes }));
      if (availableSlots.length > 0) {
        filteredDays[date] = { availableSlots };
      }
    }
    res.json({ data: { timezone, days: filteredDays } });
  } catch (err) { next(err); }
});

app.get("/api/v1/bookings", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    const { creatorId, courseId, clientUserId } = req.query as Record<string, string | undefined>;
    const now = new Date().toISOString();

    if (creatorId && courseId && clientUserId) {
      if (auth.userId !== clientUserId && auth.userId !== creatorId) {
        throw apiError("FORBIDDEN", "No autorizado", 403);
      }
      const snap = await db.collection("call_bookings")
        .where("clientUserId", "==", clientUserId)
        .where("courseId", "==", courseId)
        .where("status", "==", "scheduled")
        .get();
      const match = snap.docs.find((d) => {
        const e = d.data();
        return e.creatorId === creatorId && (e.slotEndUtc ?? "") > now;
      });
      const booking = match
        ? (() => { const e = match.data(); return { id: match.id, creatorId: e.creatorId ?? null, clientUserId: e.clientUserId ?? null, courseId: e.courseId ?? null, slotStartUtc: e.slotStartUtc ?? null, slotEndUtc: e.slotEndUtc ?? null, callLink: e.callLink && String(e.callLink).trim() ? String(e.callLink).trim() : null, status: e.status ?? "scheduled" }; })()
        : null;
      res.json({ data: booking });
      return;
    }

    const snap = await db.collection("call_bookings")
      .where("clientUserId", "==", auth.userId)
      .where("status", "==", "scheduled")
      .orderBy("slotStartUtc", "asc")
      .get();
    const list = snap.docs
      .filter((d) => (d.data().slotEndUtc ?? "") > now)
      .map((d) => {
        const e = d.data();
        return {
          id: d.id,
          creatorId: e.creatorId ?? null,
          clientUserId: e.clientUserId ?? null,
          courseId: e.courseId ?? null,
          slotStartUtc: e.slotStartUtc ?? null,
          slotEndUtc: e.slotEndUtc ?? null,
          callLink: e.callLink && String(e.callLink).trim() ? String(e.callLink).trim() : null,
          status: e.status ?? "scheduled",
        };
      });
    res.json({ data: list });
  } catch (err) { next(err); }
});

app.post("/api/v1/bookings", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    const body = validateBody<{
      creatorId: string;
      courseId?: string | null;
      slotStartUtc: string;
      slotEndUtc: string;
    }>({
      creatorId: "string",
      courseId: "optional_string",
      slotStartUtc: "string",
      slotEndUtc: "string",
    }, req.body);
    if (isNaN(new Date(body.slotStartUtc).getTime())) throw apiError("VALIDATION_ERROR", "slotStartUtc is not a valid date", 400, "slotStartUtc");
    if (isNaN(new Date(body.slotEndUtc).getTime())) throw apiError("VALIDATION_ERROR", "slotEndUtc is not a valid date", 400, "slotEndUtc");
    const creatorDoc = await db.collection("users").doc(body.creatorId).get();
    if (!creatorDoc.exists) throw apiError("NOT_FOUND", "Creator not found", 404);
    const availDoc = await db.collection("creator_availability").doc(body.creatorId).get();
    if (!availDoc.exists) throw apiError("NOT_FOUND", "Creator has no availability configured", 404);
    const allDays = (availDoc.data()?.days ?? {}) as Record<string, { slots: Array<{ startUtc: string; endUtc: string; durationMinutes: number; booked?: boolean }> }>;
    let slotDuration = 0;
    const slotDate = body.slotStartUtc.slice(0, 10);
    const dayData = allDays[slotDate];
    const matchedSlot = dayData
      ? dayData.slots.find((s) => s.startUtc === body.slotStartUtc && s.endUtc === body.slotEndUtc)
      : undefined;
    if (!matchedSlot) throw apiError("NOT_FOUND", "Slot not found or not available", 404);
    if (matchedSlot.booked) throw apiError("CONFLICT", "Slot already booked", 409);
    slotDuration = matchedSlot.durationMinutes;
    const existingBooking = await db.collection("call_bookings")
      .where("creatorId", "==", body.creatorId)
      .where("slotStartUtc", "==", body.slotStartUtc)
      .where("status", "==", "scheduled")
      .limit(1).get();
    if (!existingBooking.empty) throw apiError("CONFLICT", "Slot already booked", 409);
    const clientDoc = await db.collection("users").doc(auth.userId).get();
    const clientDisplayName = clientDoc.data()?.displayName ?? clientDoc.data()?.name ?? "";
    const bookingRef = db.collection("call_bookings").doc();
    const createdAt = new Date().toISOString();
    await db.runTransaction(async (tx) => {
      const freshAvailDoc = await tx.get(db.collection("creator_availability").doc(body.creatorId));
      const freshDays = (freshAvailDoc.data()?.days ?? {}) as typeof allDays;
      if (!freshDays[slotDate]) throw apiError("CONFLICT", "Slot no longer available", 409);
      const freshSlot = freshDays[slotDate].slots.find((s) => s.startUtc === body.slotStartUtc);
      if (!freshSlot || freshSlot.booked) throw apiError("CONFLICT", "Slot already booked", 409);
      freshDays[slotDate].slots = freshDays[slotDate].slots.map((s) =>
        s.startUtc === body.slotStartUtc ? { ...s, booked: true } : s
      );
      tx.update(freshAvailDoc.ref, { days: freshDays });
      tx.set(bookingRef, {
        creatorId: body.creatorId,
        clientUserId: auth.userId,
        clientDisplayName,
        slotStartUtc: body.slotStartUtc,
        slotEndUtc: body.slotEndUtc,
        durationMinutes: slotDuration,
        status: "scheduled",
        callLink: null,
        courseId: body.courseId ?? null,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    });
    res.status(201).json({ data: { bookingId: bookingRef.id, status: "scheduled", createdAt } });
  } catch (err) { next(err); }
});

app.get("/api/v1/bookings/:bookingId", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    const doc = await db.collection("call_bookings").doc(req.params.bookingId).get();
    if (!doc.exists) throw apiError("NOT_FOUND", "Booking not found", 404);
    const e = doc.data()!;
    if (e.clientUserId !== auth.userId && e.creatorId !== auth.userId) {
      throw apiError("FORBIDDEN", "Not your booking", 403);
    }
    const creatorDoc = await db.collection("users").doc(e.creatorId).get();
    const creatorDisplayName = creatorDoc.data()?.displayName ?? creatorDoc.data()?.name ?? "";
    res.json({
      data: {
        bookingId: doc.id,
        creatorId: e.creatorId,
        creatorDisplayName,
        slotStartUtc: e.slotStartUtc,
        slotEndUtc: e.slotEndUtc,
        status: e.status,
        callLink: (e.callLink ?? null) as string | null,
        courseId: (e.courseId ?? null) as string | null,
      },
    });
  } catch (err) { next(err); }
});

app.delete("/api/v1/bookings/:bookingId", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    const ref = db.collection("call_bookings").doc(req.params.bookingId);
    const doc = await ref.get();
    if (!doc.exists) throw apiError("NOT_FOUND", "Booking not found", 404);
    const e = doc.data()!;
    if (e.clientUserId !== auth.userId) throw apiError("FORBIDDEN", "Not your booking", 403);
    await db.runTransaction(async (tx) => {
      const availDoc = await tx.get(db.collection("creator_availability").doc(e.creatorId));
      if (availDoc.exists) {
        const days = (availDoc.data()?.days ?? {}) as Record<string, { slots: Array<{ startUtc: string; booked?: boolean }> }>;
        const slotDate = (e.slotStartUtc as string).slice(0, 10);
        if (days[slotDate]) {
          days[slotDate].slots = days[slotDate].slots.map((s) =>
            s.startUtc === e.slotStartUtc ? { ...s, booked: false } : s
          );
          tx.update(availDoc.ref, { days });
        }
      }
      tx.update(ref, { status: "cancelled", updatedAt: FieldValue.serverTimestamp() });
    });
    res.status(204).end();
  } catch (err) { next(err); }
});

// ── §10 Payments ─────────────────────────────────────────────────────────────

app.post("/api/v1/payments/preference", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    const body = validateBody<{ courseId: string; accessDuration?: string }>(
      { courseId: "string", accessDuration: "optional_string" },
      req.body
    );
    const courseDoc = await db.collection("courses").doc(body.courseId).get();
    if (!courseDoc.exists) throw apiError("NOT_FOUND", "Course not found", 404);
    const token = mercadopagoAccessToken.value();
    if (!token) throw apiError("SERVICE_UNAVAILABLE", "Payment service not configured", 503);
    const course = courseDoc.data()!;
    const externalReference = buildExternalReference(auth.userId, body.courseId, "otp");
    const client = new MercadoPagoConfig({ accessToken: token });
    const preference = new Preference(client);
    const result = await preference.create({
      body: {
        binary_mode: true,
        items: [{ id: body.courseId, title: course.title, quantity: 1, unit_price: course.price }],
        external_reference: externalReference,
      },
    });
    functions.logger.info("API payment preference created", { userId: auth.userId, courseId: body.courseId });
    res.status(201).json({ data: { preferenceId: result.id ?? null, initPoint: result.init_point ?? null } });
  } catch (err) { next(err); }
});

app.post("/api/v1/payments/subscription", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    const body = validateBody<{ courseId: string; payerEmail: string; accessDuration?: string }>(
      { courseId: "string", payerEmail: "string", accessDuration: "optional_string" },
      req.body
    );
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.payerEmail.trim())) {
      throw apiError("VALIDATION_ERROR", "Formato de email inválido", 400, "payerEmail");
    }
    const courseDoc = await db.collection("courses").doc(body.courseId).get();
    if (!courseDoc.exists) throw apiError("NOT_FOUND", "Course not found", 404);
    const token = mercadopagoAccessToken.value();
    if (!token) throw apiError("SERVICE_UNAVAILABLE", "Payment service not configured", 503);
    const course = courseDoc.data()!;
    if (!course.price) throw apiError("VALIDATION_ERROR", "Course price not configured", 400);
    const externalRef = buildExternalReference(auth.userId, body.courseId, "sub");
    const client = new MercadoPagoConfig({ accessToken: token });
    const preapproval = new PreApproval(client);
    const startDate = new Date(Date.now() + 5 * 60 * 1000);
    const result = await preapproval.create({
      body: {
        payer_email: body.payerEmail,
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
    if (!result.init_point || !result.id) {
      throw apiError("SERVICE_UNAVAILABLE", "Failed to create subscription checkout URL", 503);
    }
    let nextBillingDate: string | null = null;
    try {
      const details = await preapproval.get({ id: result.id }) as MercadoPagoPreapproval;
      nextBillingDate = details?.next_payment_date || details?.auto_recurring?.next_payment_date || details?.auto_recurring?.start_date || null;
    } catch (e) {
      functions.logger.warn("Failed to fetch preapproval details for next billing date", e);
    }
    if (!nextBillingDate) nextBillingDate = startDate.toISOString();
    await db.collection("users").doc(auth.userId).collection("subscriptions").doc(result.id).set({
      subscription_id: result.id,
      user_id: auth.userId,
      course_id: body.courseId,
      course_title: course.title || "Subscription",
      status: "pending",
      payer_email: body.payerEmail,
      transaction_amount: course.price,
      currency_id: "COP",
      management_url: `https://www.mercadopago.com.co/subscriptions/management?preapproval_id=${result.id}`,
      next_billing_date: nextBillingDate,
      created_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp(),
    }, { merge: true });
    functions.logger.info("API subscription created", { userId: auth.userId, courseId: body.courseId, subscriptionId: result.id });
    res.status(201).json({ data: { subscriptionId: result.id, initPoint: result.init_point } });
  } catch (err) { next(err); }
});

app.post("/api/v1/payments/webhook", async (req, res, next) => {
  // Delegate to the processPaymentWebhook logic reused inline via shared helpers.
  // This endpoint is called by MercadoPago — no Firebase auth, HMAC-validated.
  try {
    const webhookSecret = mercadopagoWebhookSecret.value();
    if (!webhookSecret) {
      functions.logger.error("Missing Mercado Pago webhook secret on API route");
      res.status(500).send("Webhook secret not configured");
      return;
    }

    const signatureHeaderLegacy =
      req.get("x-hmac-signature") || req.get("x-mercadopago-signature") || req.get("x-hmac-signature-256");
    const signatureHeaderNew = req.get("x-signature");

    const rawBodyValue = (req as express.Request & { rawBody?: unknown }).rawBody;
    const resolveRawBody = (): Buffer => {
      if (Buffer.isBuffer(rawBodyValue)) return rawBodyValue;
      if (typeof rawBodyValue === "string") return Buffer.from(rawBodyValue);
      if (rawBodyValue !== undefined && rawBodyValue !== null) return Buffer.from(JSON.stringify(rawBodyValue));
      const fallback = req.body ?? {};
      return Buffer.from(typeof fallback === "string" ? fallback : JSON.stringify(fallback));
    };

    const validateSigLegacy = (provided: string): boolean => {
      const buf = resolveRawBody();
      const expected = crypto.createHmac("sha256", webhookSecret).update(buf).digest("hex");
      const pBuf = Buffer.from(provided, "utf8");
      const eBuf = Buffer.from(expected, "utf8");
      if (pBuf.length !== eBuf.length) return false;
      try { return crypto.timingSafeEqual(pBuf, eBuf); } catch { return false; }
    };

    const validateSigNew = (header: string): boolean => {
      const parts = header.split(",");
      const parsed: Record<string, string> = {};
      for (const p of parts) { const [k, v] = p.split("="); if (k && v) parsed[k.trim()] = v.trim(); }
      const { ts: timestamp, v1: signature } = parsed;
      const requestId = req.get("x-request-id") ?? "";
      const dataId = req.body?.data?.id;
      if (!timestamp || !signature || !requestId || !dataId) return false;
      const template = `id:${dataId};request-id:${requestId};ts:${timestamp};`;
      const expected = crypto.createHmac("sha256", webhookSecret).update(template).digest("hex");
      const pBuf = Buffer.from(signature, "utf8");
      const eBuf = Buffer.from(expected, "utf8");
      if (pBuf.length !== eBuf.length) return false;
      try { return crypto.timingSafeEqual(pBuf, eBuf); } catch { return false; }
    };

    let signatureIsValid = false;
    if (signatureHeaderNew) signatureIsValid = validateSigNew(signatureHeaderNew);
    else if (signatureHeaderLegacy) signatureIsValid = validateSigLegacy(signatureHeaderLegacy);

    if (!signatureIsValid) {
      functions.logger.warn("Invalid webhook signature on API route");
      res.status(403).send("Invalid signature");
      return;
    }

    const webhookType = req.body?.type;
    const webhookAction = req.body?.action;

    if (webhookType === "subscription_preapproval") {
      const preapprovalId = req.body?.data?.id;
      if (!preapprovalId) { res.status(200).send("OK"); return; }
      try {
        const token = mercadopagoAccessToken.value();
        if (!token) throw new Error("Missing MP token");
        const client = new MercadoPagoConfig({ accessToken: token });
        const preapproval = new PreApproval(client);
        const preapprovalData = await preapproval.get({ id: preapprovalId }) as MercadoPagoPreapproval;
        const externalReference = preapprovalData?.external_reference;
        if (!externalReference) { res.status(200).send("OK"); return; }
        let parsedRef: ParsedReference | null = null;
        try { parsedRef = parseExternalReference(externalReference); } catch { res.status(200).send("OK"); return; }
        const subscriptionRef = db.collection("users").doc(parsedRef.userId).collection("subscriptions").doc(preapprovalId);
        const nextPaymentDate = preapprovalData?.next_payment_date || preapprovalData?.auto_recurring?.next_payment_date || null;
        const updateData: Record<string, unknown> = {
          status: preapprovalData?.status || "pending",
          transaction_amount: preapprovalData?.auto_recurring?.transaction_amount || null,
          currency_id: preapprovalData?.auto_recurring?.currency_id || null,
          reason: preapprovalData?.reason || null,
          management_url: `https://www.mercadopago.com.co/subscriptions/management?preapproval_id=${preapprovalId}`,
          next_billing_date: nextPaymentDate,
          updated_at: FieldValue.serverTimestamp(),
          last_action: webhookAction,
        };
        const payerEmail = preapprovalData?.payer_email ?? preapprovalData?.payer?.email ?? null;
        if (payerEmail) updateData.payer_email = payerEmail;
        if (preapprovalData?.status === "cancelled") updateData.cancelled_at = FieldValue.serverTimestamp();
        await subscriptionRef.set(updateData, { merge: true });
      } catch (e) { functions.logger.error("Error handling subscription_preapproval on API route:", e); }
      res.status(200).send("OK");
      return;
    }

    if (webhookType !== "payment" && webhookType !== "subscription_authorized_payment") {
      res.status(200).send("OK");
      return;
    }

    if (webhookType === "payment" && webhookAction !== "payment.created" && webhookAction !== "payment.updated") {
      res.status(200).send("OK");
      return;
    }

    if (webhookType === "subscription_authorized_payment" && webhookAction !== "created") {
      res.status(200).send("OK");
      return;
    }

    const paymentId: string | null = req.body?.data?.id;
    if (!paymentId) { res.status(400).send("Payment ID required"); return; }

    const processedPaymentsRef = db.collection("processed_payments").doc(paymentId);

    if (webhookAction === "payment.updated" || webhookAction === "updated") {
      const processedDoc = await processedPaymentsRef.get();
      if (processedDoc.exists) {
        const processedStatus = processedDoc.data()?.status;
        if (processedStatus === "approved") { res.status(200).send("OK"); return; }
        if (processedStatus !== "pending" && processedStatus !== "in_process" && processedStatus !== "processing") {
          res.status(200).send("OK"); return;
        }
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let paymentData: any;
    try {
      if (webhookType === "subscription_authorized_payment") {
        const accessToken = mercadopagoAccessToken.value();
        if (!accessToken) throw new Error("Missing MP access token");
        const apRes = await fetch(`https://api.mercadopago.com/authorized_payments/${paymentId}`, {
          method: "GET",
          headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        });
        if (!apRes.ok) throw new Error(`Failed to fetch authorized payment: ${apRes.status}`);
        paymentData = await apRes.json();
        if (!paymentData.status) paymentData.status = paymentData.payment?.status || "approved";
        if (!paymentData.external_reference && paymentData.preapproval?.external_reference) paymentData.external_reference = paymentData.preapproval.external_reference;
        if (!paymentData.preapproval_id && paymentData.preapproval?.id) paymentData.preapproval_id = paymentData.preapproval.id;
      } else {
        const token = mercadopagoAccessToken.value();
        if (!token) throw new Error("Missing MP access token");
        const client = new MercadoPagoConfig({ accessToken: token });
        const payment = new Payment(client);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result: any = await payment.get({ id: paymentId });
        paymentData = result || {};
      }
    } catch (fetchErr: unknown) {
      const classification = classifyError(fetchErr);
      if (classification === "RETRYABLE") { res.status(500).send("Error fetching payment"); }
      else {
        await processedPaymentsRef.set({ processed_at: FieldValue.serverTimestamp(), status: "error", error_type: "payment_fetch_failed", error_message: toErrorMessage(fetchErr) });
        res.status(200).send("OK");
      }
      return;
    }

    if (!paymentData || paymentData.status !== "approved") {
      if (paymentData?.status === "pending" || paymentData?.status === "in_process") { res.status(200).send("OK"); return; }
      await processedPaymentsRef.set({ processed_at: FieldValue.serverTimestamp(), status: paymentData?.status || "unknown" });
      res.status(200).send("OK");
      return;
    }

    const alreadyProcessed = await db.runTransaction(async (tx) => {
      const doc = await tx.get(processedPaymentsRef);
      if (doc.exists && doc.data()?.status === "approved") return true;
      tx.set(processedPaymentsRef, { processed_at: FieldValue.serverTimestamp(), status: "processing", payment_id: paymentId }, { merge: true });
      return false;
    });
    if (alreadyProcessed) { res.status(200).send("OK"); return; }

    const externalReference = paymentData.external_reference;
    if (!externalReference) {
      await processedPaymentsRef.set({ processed_at: FieldValue.serverTimestamp(), status: "error", error_type: "missing_external_reference" });
      res.status(200).send("OK");
      return;
    }

    let parsedRef: ParsedReference;
    try { parsedRef = parseExternalReference(externalReference); }
    catch (parseErr: unknown) {
      await processedPaymentsRef.set({ processed_at: FieldValue.serverTimestamp(), status: "error", error_type: "invalid_external_reference", error_message: toErrorMessage(parseErr) });
      res.status(200).send("OK");
      return;
    }

    const { userId: pUserId, courseId: pCourseId } = parsedRef;
    const userDoc = await db.collection("users").doc(pUserId).get();
    if (!userDoc.exists) {
      await processedPaymentsRef.set({ processed_at: FieldValue.serverTimestamp(), status: "error", error_type: "user_not_found" });
      res.status(200).send("OK");
      return;
    }
    const courseDoc2 = await db.collection("courses").doc(pCourseId).get();
    if (!courseDoc2.exists) {
      await processedPaymentsRef.set({ processed_at: FieldValue.serverTimestamp(), status: "error", error_type: "course_not_found" });
      res.status(200).send("OK");
      return;
    }
    const course2 = courseDoc2.data()!;
    const accessDuration = course2.access_duration || "monthly";
    const expiresAt = calculateExpirationDate(accessDuration);
    const userRef = db.collection("users").doc(pUserId);
    await db.runTransaction(async (tx) => {
      tx.update(userRef, {
        [`courses.${pCourseId}`]: {
          status: "active",
          access_duration: accessDuration,
          expires_at: expiresAt,
          purchased_at: new Date().toISOString(),
          deliveryType: course2.deliveryType || "low_ticket",
          title: course2.title || "",
          image_url: course2.image_url || null,
          is_trial: false,
          trial_consumed: false,
        },
      });
      tx.set(processedPaymentsRef, { processed_at: FieldValue.serverTimestamp(), status: "approved", payment_id: paymentId, user_id: pUserId, course_id: pCourseId });
    });
    functions.logger.info("API webhook: course granted", { paymentId, userId: pUserId, courseId: pCourseId });
    res.status(200).send("OK");
  } catch (err) { next(err); }
});

app.post("/api/v1/payments/subscriptions/:subscriptionId/cancel", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    const body = validateBody<{ action: string }>(
      { action: "string" },
      req.body
    );
    const { subscriptionId } = req.params;
    const validActions = ["cancel", "pause", "resume"];
    if (!validActions.includes(body.action)) {
      throw apiError("VALIDATION_ERROR", "action must be cancel, pause, or resume", 400, "action");
    }
    const subscriptionRef = db.collection("users").doc(auth.userId).collection("subscriptions").doc(subscriptionId);
    const subscriptionDoc = await subscriptionRef.get();
    if (!subscriptionDoc.exists) throw apiError("NOT_FOUND", "Subscription not found", 404);
    if (subscriptionDoc.data()?.user_id && subscriptionDoc.data()?.user_id !== auth.userId) {
      throw apiError("FORBIDDEN", "Not your subscription", 403);
    }
    const token = mercadopagoAccessToken.value();
    if (!token) throw apiError("SERVICE_UNAVAILABLE", "Payment service not configured", 503);
    const actionToStatus: Record<string, string> = { cancel: "cancelled", pause: "paused", resume: "authorized" };
    const targetStatus = actionToStatus[body.action];
    const client = new MercadoPagoConfig({ accessToken: token });
    const preapproval = new PreApproval(client);
    await preapproval.update({ id: subscriptionId, body: { status: targetStatus } });
    const updateData: Record<string, unknown> = {
      status: targetStatus,
      last_action: body.action,
      updated_at: FieldValue.serverTimestamp(),
    };
    if (targetStatus === "cancelled") updateData.cancelled_at = FieldValue.serverTimestamp();
    else if (targetStatus === "authorized") updateData.cancelled_at = FieldValue.delete();
    await subscriptionRef.set(updateData, { merge: true });
    functions.logger.info("API subscription status updated", { userId: auth.userId, subscriptionId, action: body.action });
    res.json({ data: { subscriptionId, status: targetStatus } });
  } catch (err) { next(err); }
});

app.get("/api/v1/users/me/subscriptions", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    const snap = await db.collection("users").doc(auth.userId).collection("subscriptions").orderBy("created_at", "desc").get();
    const tsObj = (ts: FirebaseFirestore.Timestamp | null | undefined) => {
      if (!ts || typeof ts.seconds !== "number") return null;
      return { _seconds: ts.seconds, _nanoseconds: ts.nanoseconds ?? 0 };
    };
    const subs = snap.docs.map((d) => {
      const e = d.data();
      return {
        id: d.id,
        subscriptionId: d.id,
        courseId: e.course_id ?? null,
        courseTitle: e.course_title ?? null,
        status: e.status ?? null,
        amount: e.transaction_amount ?? null,
        currency: e.currency_id ?? "COP",
        preapproval_id: e.preapproval_id ?? null,
        management_url: e.management_url ?? null,
        created_at: tsObj(e.created_at),
        updated_at: tsObj(e.updated_at),
        next_billing_date: tsObj(e.next_billing_date),
        expires_at: tsObj(e.expires_at),
        renewal_date: tsObj(e.renewal_date),
      };
    });
    res.json({ data: subs });
  } catch (err) { next(err); }
});

// ── Client Content (session & plan copies) ────────────────────────────────────

app.get("/api/v1/workout/client-session-content/:clientSessionId", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    const { clientSessionId } = req.params;
    const snap = await db.collection("client_session_content").doc(clientSessionId).get();
    if (!snap.exists) throw apiError("NOT_FOUND", "Sesión no encontrada", 404);
    const d = snap.data() as Record<string, unknown>;
    const owner = d.userId ?? d.clientUserId ?? d.client_id;
    if (owner && owner !== auth.userId) throw apiError("FORBIDDEN", "No autorizado", 403);
    const exercisesSnap = await db.collection("client_session_content").doc(clientSessionId).collection("exercises").orderBy("order").get();
    const exercises = await Promise.all(exercisesSnap.docs.map(async (exDoc) => {
      const setsSnap = await exDoc.ref.collection("sets").orderBy("order").get();
      return { id: exDoc.id, ...exDoc.data(), sets: setsSnap.docs.map((s) => ({ id: s.id, ...s.data() })) };
    }));
    res.json({ data: { id: snap.id, ...d, exercises } });
  } catch (err) { next(err); }
});

app.get("/api/v1/workout/client-plan-content/:userId/:programId/:weekKey", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    const { userId, programId, weekKey } = req.params;
    if (auth.userId !== userId) throw apiError("FORBIDDEN", "No autorizado", 403);
    const docId = `${userId}_${programId}_${weekKey}`;
    const snap = await db.collection("client_plan_content").doc(docId).get();
    if (!snap.exists) throw apiError("NOT_FOUND", "Plan no encontrado", 404);
    const sessionsSnap = await db.collection("client_plan_content").doc(docId).collection("sessions").orderBy("order").get();
    const sessions = await Promise.all(sessionsSnap.docs.map(async (sDoc) => {
      const exSnap = await sDoc.ref.collection("exercises").orderBy("order").get();
      const exercises = await Promise.all(exSnap.docs.map(async (exDoc) => {
        const setsSnap = await exDoc.ref.collection("sets").orderBy("order").get();
        return { id: exDoc.id, ...exDoc.data(), sets: setsSnap.docs.map((s) => ({ id: s.id, ...s.data() })) };
      }));
      return { id: sDoc.id, ...sDoc.data(), exercises };
    }));
    res.json({ data: { id: snap.id, ...snap.data(), sessions } });
  } catch (err) { next(err); }
});

// ── §11 Analytics ─────────────────────────────────────────────────────────────

function getWeekKey(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay();
  const diff = (day === 0 ? -6 : 1 - day);
  d.setUTCDate(d.getUTCDate() + diff);
  const year = d.getUTCFullYear();
  const startOfYear = new Date(Date.UTC(year, 0, 1));
  const weekNo = Math.ceil(((d.getTime() - startOfYear.getTime()) / 86400000 + startOfYear.getUTCDay() + 1) / 7);
  return `${year}-W${String(weekNo).padStart(2, "0")}`;
}

function getMondayOfWeek(date: Date): Date {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay();
  const diff = (day === 0 ? -6 : 1 - day);
  d.setUTCDate(d.getUTCDate() + diff);
  return d;
}

function getSundayOfWeek(monday: Date): Date {
  const d = new Date(monday);
  d.setUTCDate(d.getUTCDate() + 6);
  return d;
}

const MUSCLE_GROUPS = ["push", "pull", "legs", "shoulders", "core"] as const;
type MuscleGroup = typeof MUSCLE_GROUPS[number];

function classifyMuscle(exerciseName: string): MuscleGroup | null {
  const name = (exerciseName || "").toLowerCase();
  if (/press|pecho|chest|tricep|dip|push/.test(name)) return "push";
  if (/row|jalón|pull|curl|bicep|remo|espalda|back|lat/.test(name)) return "pull";
  if (/sentadill|squat|leg|pierna|femoral|glute|lunge|calf|pantorrilla|deadlift|peso muerto/.test(name)) return "legs";
  if (/hombro|shoulder|lateral|deltoid|military|press de hombro|overhead/.test(name)) return "shoulders";
  if (/core|abdomi|plank|crunch|obliq|abdo/.test(name)) return "core";
  return null;
}

function classifyMuscleGranular(exerciseName: string): string | null {
  const n = (exerciseName || "").toLowerCase();
  if (/lower.back|lumbar|back.ext|hiperext|extensi[oó]n de espalda/.test(n)) return "lower_back";
  if (/deadlift|peso muerto|romanian|rumana/.test(n)) return "lower_back";
  if (/face pull|posterior|rear delt/.test(n)) return "rear_delts";
  if (/lateral raise|alzada lateral|elevaci[oó]n lateral/.test(n)) return "side_delts";
  if (/front raise|alzada frontal|elevaci[oó]n frontal/.test(n)) return "front_delts";
  if (/overhead press|press militar|military press|arnold press|press de hombro|shoulder press/.test(n)) return "front_delts";
  if (/shrug|encogimiento|trap/.test(n)) return "traps";
  if (/tricep|extension de trícep|pushdown|jalón de trícep|tric/.test(n)) return "triceps";
  if (/dip|fondos/.test(n)) return "triceps";
  if (/press|pecho|chest|fly|apert/.test(n)) return "pecs";
  if (/pull.up|chin.up|jalón|lat pulldown|pulldown|dominad/.test(n)) return "lats";
  if (/row|remo|rhomboid|romboid/.test(n)) return "lats";
  if (/curl|bicep|bícep/.test(n)) return "biceps";
  if (/forearm|antebrazo|wrist|muñeca/.test(n)) return "forearms";
  if (/hip thrust|empuje de cadera|glute bridge|puente/.test(n)) return "glutes";
  if (/leg curl|femoral|isquio|hamstring/.test(n)) return "hamstrings";
  if (/calf|gemelo|pantorrilla/.test(n)) return "calves";
  if (/hip flex|flexor de cadera/.test(n)) return "hip_flexors";
  if (/squat|sentadill|leg press|lunge|zancada|split squat|pistol/.test(n)) return "quads";
  if (/leg ext|extensi[oó]n de pierna|quad/.test(n)) return "quads";
  if (/glute|glúteo/.test(n)) return "glutes";
  if (/russian twist|oblique|oblicuo/.test(n)) return "obliques";
  if (/plank|plancha|crunch|situp|sit.up|leg raise|elevaci[oó]n de piernas|abdomi|ab /.test(n)) return "abs";
  if (/neck|cuello/.test(n)) return "neck";
  return null;
}

app.get("/api/v1/analytics/weekly-volume", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    const { startDate, endDate } = req.query as Record<string, string | undefined>;
    if (!startDate || !endDate) {
      throw apiError("VALIDATION_ERROR", "startDate and endDate are required", 400);
    }
    const start = new Date(startDate + "T00:00:00.000Z");
    const end = new Date(endDate + "T23:59:59.999Z");
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      throw apiError("VALIDATION_ERROR", "startDate and endDate must be YYYY-MM-DD", 400);
    }
    const diffWeeks = (end.getTime() - start.getTime()) / (7 * 24 * 60 * 60 * 1000);
    if (diffWeeks > 12) throw apiError("VALIDATION_ERROR", "Date range cannot exceed 12 weeks", 400);

    const snap = await db.collection("users").doc(auth.userId).collection("sessionHistory")
      .where("completedAt", ">=", start.toISOString())
      .where("completedAt", "<=", end.toISOString())
      .orderBy("completedAt", "asc")
      .get();

    interface WeekBucket {
      weekKey: string;
      weekStartDate: string;
      weekEndDate: string;
      totalSessions: number;
      muscleVolumes: Record<MuscleGroup, number>;
      muscleBreakdown: Record<string, number>;
      totalSets: number;
    }
    const weekMap = new Map<string, WeekBucket>();

    for (const doc of snap.docs) {
      const session = doc.data();
      const sessionDate = new Date(session.completedAt ?? session.created_at ?? "");
      if (isNaN(sessionDate.getTime())) continue;
      const weekKey = getWeekKey(sessionDate);
      const monday = getMondayOfWeek(sessionDate);
      const sunday = getSundayOfWeek(monday);
      const mondayStr = monday.toISOString().slice(0, 10);
      const sundayStr = sunday.toISOString().slice(0, 10);
      if (!weekMap.has(weekKey)) {
        weekMap.set(weekKey, {
          weekKey,
          weekStartDate: mondayStr,
          weekEndDate: sundayStr,
          totalSessions: 0,
          muscleVolumes: { push: 0, pull: 0, legs: 0, shoulders: 0, core: 0 },
          muscleBreakdown: {},
          totalSets: 0,
        });
      }
      const bucket = weekMap.get(weekKey)!;
      bucket.totalSessions += 1;
      const exercises = Array.isArray(session.exercises) ? session.exercises : [];
      for (const ex of exercises) {
        const sets = Array.isArray(ex.sets) ? ex.sets : [];
        const validSets = sets.filter((s: Record<string, unknown>) => {
          const reps = parseFloat(String(s.reps ?? ""));
          return !isNaN(reps) && reps > 0;
        });
        if (validSets.length === 0) continue;
        bucket.totalSets += validSets.length;
        const exName = ex.exerciseName ?? ex.name ?? "";
        const muscle = classifyMuscle(exName);
        if (muscle) bucket.muscleVolumes[muscle] += validSets.length;
        const granular = classifyMuscleGranular(exName);
        if (granular) bucket.muscleBreakdown[granular] = (bucket.muscleBreakdown[granular] ?? 0) + validSets.length;
      }
    }

    const data = Array.from(weekMap.values()).sort((a, b) => a.weekKey.localeCompare(b.weekKey));
    res.json({ data });
  } catch (err) { next(err); }
});

app.get("/api/v1/analytics/muscle-breakdown", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    const { startDate, endDate } = req.query as Record<string, string | undefined>;
    if (!startDate || !endDate) {
      throw apiError("VALIDATION_ERROR", "startDate and endDate are required", 400);
    }
    const start = new Date(startDate + "T00:00:00.000Z");
    const end = new Date(endDate + "T23:59:59.999Z");
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      throw apiError("VALIDATION_ERROR", "startDate and endDate must be YYYY-MM-DD", 400);
    }
    const diffDays = (end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000);
    if (diffDays > 90) throw apiError("VALIDATION_ERROR", "Date range cannot exceed 90 days", 400);

    const snap = await db.collection("users").doc(auth.userId).collection("sessionHistory")
      .where("completedAt", ">=", start.toISOString())
      .where("completedAt", "<=", end.toISOString())
      .orderBy("completedAt", "asc")
      .get();

    const muscles: Record<MuscleGroup, number> = { push: 0, pull: 0, legs: 0, shoulders: 0, core: 0 };
    let totalSessions = 0;
    let totalSets = 0;

    for (const doc of snap.docs) {
      const session = doc.data();
      totalSessions += 1;
      const exercises = Array.isArray(session.exercises) ? session.exercises : [];
      for (const ex of exercises) {
        const sets = Array.isArray(ex.sets) ? ex.sets : [];
        const validSets = sets.filter((s: Record<string, unknown>) => {
          const reps = parseFloat(String(s.reps ?? ""));
          return !isNaN(reps) && reps > 0;
        });
        if (validSets.length === 0) continue;
        totalSets += validSets.length;
        const muscle = classifyMuscle(ex.exerciseName ?? ex.name ?? "");
        if (muscle) muscles[muscle] += validSets.length;
      }
    }

    res.json({
      data: {
        period: { startDate, endDate },
        muscles,
        totalSessions,
        totalSets,
      },
    });
  } catch (err) { next(err); }
});

// ── §12 App Resources ─────────────────────────────────────────────────────────

app.get("/api/v1/app-resources", async (_req, res, next) => {
  try {
    const snap = await db.collection("app_resources").get();

    let hero: { imageUrl: string | null; headline: string | null; subheadline: string | null } = {
      imageUrl: null,
      headline: null,
      subheadline: null,
    };
    const programCards: Array<{
      resourceId: string;
      title: string;
      imageUrl: string | null;
      discipline: string | null;
      order: number;
    }> = [];
    let mainHeroLanding: unknown[] = [];
    let heroAppPage: unknown[] = [];
    let cards: unknown[] = [];
    let dosFormas: string | null = null;
    let assets: Record<string, unknown> | null = null;
    let disciplineImages: Record<string, string> = {};

    for (const doc of snap.docs) {
      const e = doc.data();
      if (e.type === "hero" || doc.id === "hero") {
        hero = {
          imageUrl: e.imageUrl ?? e.image_url ?? null,
          headline: e.headline ?? e.title ?? null,
          subheadline: e.subheadline ?? e.subtitle ?? null,
        };
      } else if (e.title === "assets") {
        assets = { library: e.library ?? null, warmup: e.warmup ?? {}, intensity: e.intensity ?? {}, version: e.version ?? null };
      } else if (e.title === "discipline_img") {
        for (const [k, v] of Object.entries(e)) {
          if (k !== "title" && typeof v === "string" && v.trim() !== "") {
            disciplineImages[k] = v;
          }
        }
      } else {
        if (!mainHeroLanding.length && Array.isArray(e.main_hero_landing)) mainHeroLanding = e.main_hero_landing;
        if (!heroAppPage.length && Array.isArray(e.hero_app_page)) heroAppPage = e.hero_app_page;
        if (!cards.length && Array.isArray(e.cards)) cards = e.cards;
        if (!dosFormas && typeof e.dos_formas === "string") dosFormas = e.dos_formas;
        programCards.push({
          resourceId: doc.id,
          title: e.title ?? "",
          imageUrl: e.imageUrl ?? e.image_url ?? null,
          discipline: e.discipline ?? e.category ?? null,
          order: typeof e.order === "number" ? e.order : 0,
        });
      }
    }

    programCards.sort((a, b) => a.order - b.order);

    res.setHeader("Cache-Control", "public, max-age=300");
    res.json({ data: { hero, programCards, mainHeroLanding, heroAppPage, cards, dosFormas, assets, disciplineImages } });
  } catch (err) { next(err); }
});

app.get("/api/v1/exercises/:libraryId", async (req, res, next) => {
  try {
    const snap = await db.collection("exercises_library").doc(req.params.libraryId).get();
    if (!snap.exists) throw apiError("NOT_FOUND", "Library not found", 404);
    res.json({ data: { id: snap.id, ...snap.data() } });
  } catch (err) { next(err); }
});

app.get("/api/v1/exercises/:libraryId/:exerciseName", async (req, res, next) => {
  try {
    const snap = await db.collection("exercises_library").doc(req.params.libraryId).get();
    if (!snap.exists) throw apiError("NOT_FOUND", "Library not found", 404);
    const exerciseData = (snap.data() as Record<string, unknown>)?.[req.params.exerciseName];
    if (!exerciseData) throw apiError("NOT_FOUND", "Exercise not found", 404);
    res.json({ data: exerciseData });
  } catch (err) { next(err); }
});

// ── §13 Client Session Records ────────────────────────────────────────────────

app.get("/api/v1/creator/clients/:clientId/client-sessions", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    assertCreator(auth);
    await requireClientRelationship(auth.userId, req.params.clientId);

    const { startDate, endDate, programId } = req.query as Record<string, string | undefined>;

    let q: FirebaseFirestore.Query = db.collection("client_sessions")
      .where("client_id", "==", req.params.clientId);

    if (programId) q = q.where("program_id", "==", programId);
    if (startDate) q = q.where("date", ">=", startDate);
    if (endDate) q = q.where("date", "<=", endDate);
    q = q.orderBy("date", "asc");

    const snap = await q.get();
    const sessions = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    res.json({ data: sessions });
  } catch (err) { next(err); }
});

app.get("/api/v1/creator/clients/:clientId/client-sessions/:sessionId", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    assertCreator(auth);
    await requireClientRelationship(auth.userId, req.params.clientId);

    const snap = await db.collection("client_sessions").doc(req.params.sessionId).get();
    if (!snap.exists) throw apiError("NOT_FOUND", "Sesión de cliente no encontrada", 404);
    const data = snap.data()!;
    if (data.client_id !== req.params.clientId) throw apiError("FORBIDDEN", "No tiene acceso a esta sesión", 403);

    res.json({ data: { id: snap.id, ...data } });
  } catch (err) { next(err); }
});

app.put("/api/v1/creator/clients/:clientId/client-sessions/:sessionId", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    assertCreator(auth);
    await requireClientRelationship(auth.userId, req.params.clientId);

    const ref = db.collection("client_sessions").doc(req.params.sessionId);
    const existing = await ref.get();
    if (existing.exists && existing.data()!.client_id !== req.params.clientId) {
      throw apiError("FORBIDDEN", "No tiene acceso a esta sesión", 403);
    }

    const { id: _id, ...data } = req.body as Record<string, unknown>;
    const payload = {
      ...data,
      client_id: req.params.clientId,
      updated_at: FieldValue.serverTimestamp(),
      ...(!existing.exists && { created_at: FieldValue.serverTimestamp() }),
    };
    await ref.set(payload, { merge: true });
    res.json({ data: { id: ref.id } });
  } catch (err) { next(err); }
});

app.patch("/api/v1/creator/clients/:clientId/client-sessions/:sessionId", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    assertCreator(auth);
    await requireClientRelationship(auth.userId, req.params.clientId);

    const snap = await db.collection("client_sessions").doc(req.params.sessionId).get();
    if (!snap.exists) throw apiError("NOT_FOUND", "Sesión de cliente no encontrada", 404);
    if (snap.data()!.client_id !== req.params.clientId) throw apiError("FORBIDDEN", "No tiene acceso a esta sesión", 403);

    const { id: _id, client_id: _cid, created_at: _ca, ...updates } = req.body as Record<string, unknown>;
    await snap.ref.update({ ...updates, updated_at: FieldValue.serverTimestamp() });
    res.json({ data: { id: snap.id } });
  } catch (err) { next(err); }
});

app.delete("/api/v1/creator/clients/:clientId/client-sessions/:sessionId", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    assertCreator(auth);
    await requireClientRelationship(auth.userId, req.params.clientId);

    const snap = await db.collection("client_sessions").doc(req.params.sessionId).get();
    if (!snap.exists) throw apiError("NOT_FOUND", "Sesión de cliente no encontrada", 404);
    if (snap.data()!.client_id !== req.params.clientId) throw apiError("FORBIDDEN", "No tiene acceso a esta sesión", 403);

    await snap.ref.delete();
    res.status(204).end();
  } catch (err) { next(err); }
});

// ── §14 Client Session Content ─────────────────────────────────────────────────

app.get("/api/v1/creator/clients/:clientId/client-sessions/:sessionId/content", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    assertCreator(auth);
    await requireClientRelationship(auth.userId, req.params.clientId);

    const COLLECTION = "client_session_content";
    const sessionRef = db.collection(COLLECTION).doc(req.params.sessionId);
    const sessionSnap = await sessionRef.get();
    if (!sessionSnap.exists) {
      res.json({ data: null });
      return;
    }

    const exercisesSnap = await sessionRef.collection("exercises").orderBy("order", "asc").get();
    const exercises = await Promise.all(
      exercisesSnap.docs.map(async (exDoc) => {
        const setsSnap = await exDoc.ref.collection("sets").orderBy("order", "asc").get();
        return {
          id: exDoc.id,
          ...exDoc.data(),
          sets: setsSnap.docs.map((s) => ({ id: s.id, ...s.data() })),
        };
      })
    );

    res.json({ data: { id: sessionSnap.id, ...sessionSnap.data(), exercises } });
  } catch (err) { next(err); }
});

app.put("/api/v1/creator/clients/:clientId/client-sessions/:sessionId/content", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    assertCreator(auth);
    await requireClientRelationship(auth.userId, req.params.clientId);

    const body = req.body as {
      title?: string; image_url?: string; source_session_id?: string;
      exercises?: Array<{ id?: string; sets?: Array<{ id?: string; [k: string]: unknown }>; [k: string]: unknown }>;
    };

    const COLLECTION = "client_session_content";
    const sessionRef = db.collection(COLLECTION).doc(req.params.sessionId);
    const exercises = Array.isArray(body.exercises) ? body.exercises : [];
    const sessionFields: Record<string, unknown> = {};
    if (body.title !== undefined) sessionFields.title = body.title;
    if (body.image_url !== undefined) sessionFields.image_url = body.image_url;
    if (body.source_session_id !== undefined) sessionFields.source_session_id = body.source_session_id;

    const batch = db.batch();
    batch.set(sessionRef, {
      ...sessionFields,
      updated_at: FieldValue.serverTimestamp(),
    }, { merge: false });

    for (const ex of exercises) {
      const { sets = [], id: exId, ...exFields } = ex;
      const exerciseRef = exId
        ? sessionRef.collection("exercises").doc(exId)
        : sessionRef.collection("exercises").doc();
      batch.set(exerciseRef, { ...exFields, updated_at: FieldValue.serverTimestamp() });
      for (const set of sets) {
        const { id: setId, ...setFields } = set;
        const setRef = setId
          ? exerciseRef.collection("sets").doc(setId)
          : exerciseRef.collection("sets").doc();
        batch.set(setRef, { ...setFields, updated_at: FieldValue.serverTimestamp() });
      }
    }

    await batch.commit();
    res.json({ data: { id: req.params.sessionId } });
  } catch (err) { next(err); }
});

app.patch("/api/v1/creator/clients/:clientId/client-sessions/:sessionId/content/exercises/:exerciseId", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    assertCreator(auth);
    await requireClientRelationship(auth.userId, req.params.clientId);

    const COLLECTION = "client_session_content";
    const exerciseRef = db.collection(COLLECTION)
      .doc(req.params.sessionId)
      .collection("exercises")
      .doc(req.params.exerciseId);

    const snap = await exerciseRef.get();
    if (!snap.exists) throw apiError("NOT_FOUND", "Ejercicio no encontrado", 404);

    const { id: _id, ...updates } = req.body as Record<string, unknown>;
    await exerciseRef.update({ ...updates, updated_at: FieldValue.serverTimestamp() });
    res.json({ data: { id: req.params.exerciseId } });
  } catch (err) { next(err); }
});

// ── §15 Client Plan Content ────────────────────────────────────────────────────

app.get("/api/v1/creator/clients/:clientId/plan-content/:weekKey", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    assertCreator(auth);
    await requireClientRelationship(auth.userId, req.params.clientId);

    const { programId } = req.query as Record<string, string | undefined>;
    if (!programId) throw apiError("VALIDATION_ERROR", "programId es requerido", 400, "programId");

    const COLLECTION = "client_plan_content";
    const docId = `${req.params.clientId}_${programId}_${req.params.weekKey}`;
    const ref = db.collection(COLLECTION).doc(docId);
    const snap = await ref.get();

    if (!snap.exists) {
      res.json({ data: null });
      return;
    }

    const sessionsSnap = await ref.collection("sessions").orderBy("order", "asc").get();
    const sessions = await Promise.all(
      sessionsSnap.docs.map(async (sDoc) => {
        const exSnap = await sDoc.ref.collection("exercises").orderBy("order", "asc").get();
        const exercises = await Promise.all(
          exSnap.docs.map(async (eDoc) => {
            const setsSnap = await eDoc.ref.collection("sets").orderBy("order", "asc").get();
            return { id: eDoc.id, ...eDoc.data(), sets: setsSnap.docs.map((s) => ({ id: s.id, ...s.data() })) };
          })
        );
        return { id: sDoc.id, ...sDoc.data(), exercises };
      })
    );

    res.json({ data: { id: snap.id, ...snap.data(), sessions } });
  } catch (err) { next(err); }
});

app.put("/api/v1/creator/clients/:clientId/plan-content/:weekKey", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    assertCreator(auth);
    await requireClientRelationship(auth.userId, req.params.clientId);

    const body = validateBody<{ programId: string; sessions?: unknown[] }>(
      { programId: "string", sessions: "optional_array" },
      req.body
    );

    const COLLECTION = "client_plan_content";
    const docId = `${req.params.clientId}_${body.programId}_${req.params.weekKey}`;
    const ref = db.collection(COLLECTION).doc(docId);
    const { sessions = [], programId: _pid, ...meta } = body as Record<string, unknown>;

    const batch = db.batch();
    batch.set(ref, { ...meta, updated_at: FieldValue.serverTimestamp() }, { merge: false });

    for (const session of (sessions as Array<Record<string, unknown>>)) {
      const { exercises = [], id: sessionId, sets: _s, ...sessionFields } = session;
      const sessionRef = sessionId
        ? ref.collection("sessions").doc(sessionId as string)
        : ref.collection("sessions").doc();
      batch.set(sessionRef, { ...sessionFields, updated_at: FieldValue.serverTimestamp() });
      for (const ex of (exercises as Array<Record<string, unknown>>)) {
        const { sets = [], id: exId, ...exFields } = ex;
        const exRef = exId
          ? sessionRef.collection("exercises").doc(exId as string)
          : sessionRef.collection("exercises").doc();
        batch.set(exRef, { ...exFields, updated_at: FieldValue.serverTimestamp() });
        for (const set of (sets as Array<Record<string, unknown>>)) {
          const { id: setId, ...setFields } = set;
          const setRef = setId
            ? exRef.collection("sets").doc(setId as string)
            : exRef.collection("sets").doc();
          batch.set(setRef, { ...setFields, updated_at: FieldValue.serverTimestamp() });
        }
      }
    }

    await batch.commit();
    res.json({ data: { id: docId } });
  } catch (err) { next(err); }
});

app.patch("/api/v1/creator/clients/:clientId/plan-content/:weekKey/sessions/:sessionId", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    assertCreator(auth);
    await requireClientRelationship(auth.userId, req.params.clientId);

    const { programId } = req.query as Record<string, string | undefined>;
    if (!programId) throw apiError("VALIDATION_ERROR", "programId es requerido", 400, "programId");

    const COLLECTION = "client_plan_content";
    const docId = `${req.params.clientId}_${programId}_${req.params.weekKey}`;
    const sessionRef = db.collection(COLLECTION).doc(docId).collection("sessions").doc(req.params.sessionId);

    const snap = await sessionRef.get();
    if (!snap.exists) throw apiError("NOT_FOUND", "Sesión no encontrada", 404);

    const { id: _id, ...updates } = req.body as Record<string, unknown>;
    await sessionRef.update({ ...updates, updated_at: FieldValue.serverTimestamp() });
    res.json({ data: { id: req.params.sessionId } });
  } catch (err) { next(err); }
});

// ── §15.5 Assignment lookup (resolve assignmentId → clientId) ─────────────────

app.get("/api/v1/creator/nutrition/assignments/:assignmentId", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    assertCreator(auth);

    const assignSnap = await db.collection("nutrition_assignments").doc(req.params.assignmentId).get();
    if (!assignSnap.exists) throw apiError("NOT_FOUND", "Asignación no encontrada", 404);
    const data = assignSnap.data()!;
    if (data.assignedBy !== auth.userId) throw apiError("FORBIDDEN", "No tiene acceso a esta asignación", 403);

    res.json({ data: { assignmentId: assignSnap.id, clientId: data.userId ?? null, planId: data.planId ?? null } });
  } catch (err) { next(err); }
});

// ── §16 Client Nutrition Plan Content ─────────────────────────────────────────

app.get("/api/v1/creator/clients/:clientId/nutrition/assignments/:assignmentId/content", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    assertCreator(auth);
    await requireClientRelationship(auth.userId, req.params.clientId);

    const snap = await db.collection("client_nutrition_plan_content").doc(req.params.assignmentId).get();
    if (!snap.exists) {
      res.json({ data: null });
      return;
    }

    res.json({ data: { id: snap.id, ...snap.data() } });
  } catch (err) { next(err); }
});

app.put("/api/v1/creator/clients/:clientId/nutrition/assignments/:assignmentId/content", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    assertCreator(auth);
    await requireClientRelationship(auth.userId, req.params.clientId);

    const body = req.body as Record<string, unknown>;
    const allowedFields = ["categories", "dailyCalories", "dailyProteinG", "dailyCarbsG", "dailyFatG", "days", "notes", "title"];
    const data: Record<string, unknown> = {};
    for (const field of allowedFields) {
      if (body[field] !== undefined) data[field] = body[field];
    }

    await db.collection("client_nutrition_plan_content").doc(req.params.assignmentId).set({
      ...data,
      assignment_id: req.params.assignmentId,
      updated_at: FieldValue.serverTimestamp(),
    });

    res.json({ data: { id: req.params.assignmentId } });
  } catch (err) { next(err); }
});

app.patch("/api/v1/creator/clients/:clientId/nutrition/assignments/:assignmentId/content/days/:dayKey", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    assertCreator(auth);
    await requireClientRelationship(auth.userId, req.params.clientId);

    const snap = await db.collection("client_nutrition_plan_content").doc(req.params.assignmentId).get();
    if (!snap.exists) throw apiError("NOT_FOUND", "Contenido de plan nutricional no encontrado", 404);

    const { id: _id, ...updates } = req.body as Record<string, unknown>;
    await snap.ref.update({
      [`days.${req.params.dayKey}`]: updates,
      updated_at: FieldValue.serverTimestamp(),
    });
    res.json({ data: { id: req.params.assignmentId } });
  } catch (err) { next(err); }
});

// ── §17 Measure Objective Presets ──────────────────────────────────────────────

app.get("/api/v1/creator/library/objective-presets", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    assertCreator(auth);

    const snap = await db.collection("creator_libraries").doc(auth.userId)
      .collection("measure_objective_presets")
      .orderBy("name", "asc")
      .get();

    const presets = snap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        name: data.name ?? "",
        measures: Array.isArray(data.measures) ? data.measures : [],
        objectives: Array.isArray(data.objectives) ? data.objectives : [],
        customMeasureLabels: (data.customMeasureLabels && typeof data.customMeasureLabels === "object") ? data.customMeasureLabels : {},
        customObjectiveLabels: (data.customObjectiveLabels && typeof data.customObjectiveLabels === "object") ? data.customObjectiveLabels : {},
      };
    });

    res.json({ data: presets });
  } catch (err) { next(err); }
});

app.post("/api/v1/creator/library/objective-presets", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    assertCreator(auth);

    const body = validateBody<{ name: string; measures?: unknown[]; objectives?: unknown[]; customMeasureLabels?: object; customObjectiveLabels?: object }>(
      { name: "string", measures: "optional_array", objectives: "optional_array", customMeasureLabels: "optional_object", customObjectiveLabels: "optional_object" },
      req.body
    );

    if (!body.name.trim()) throw apiError("VALIDATION_ERROR", "El nombre del preset es requerido", 400, "name");

    const docRef = await db.collection("creator_libraries").doc(auth.userId)
      .collection("measure_objective_presets")
      .add({
        name: body.name.trim(),
        measures: Array.isArray(body.measures) ? body.measures : [],
        objectives: Array.isArray(body.objectives) ? body.objectives : [],
        customMeasureLabels: (body.customMeasureLabels && typeof body.customMeasureLabels === "object") ? body.customMeasureLabels : {},
        customObjectiveLabels: (body.customObjectiveLabels && typeof body.customObjectiveLabels === "object") ? body.customObjectiveLabels : {},
        created_at: FieldValue.serverTimestamp(),
        updated_at: FieldValue.serverTimestamp(),
      });

    res.status(201).json({ data: { id: docRef.id } });
  } catch (err) { next(err); }
});

app.patch("/api/v1/creator/library/objective-presets/:presetId", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    assertCreator(auth);

    const presetRef = db.collection("creator_libraries").doc(auth.userId)
      .collection("measure_objective_presets")
      .doc(req.params.presetId);

    const snap = await presetRef.get();
    if (!snap.exists) throw apiError("NOT_FOUND", "Preset no encontrado", 404);

    const body = req.body as Record<string, unknown>;
    const updateData: Record<string, unknown> = { updated_at: FieldValue.serverTimestamp() };
    if (body.name !== undefined) updateData.name = String(body.name).trim();
    if (body.measures !== undefined) updateData.measures = Array.isArray(body.measures) ? body.measures : [];
    if (body.objectives !== undefined) updateData.objectives = Array.isArray(body.objectives) ? body.objectives : [];
    if (body.customMeasureLabels !== undefined) updateData.customMeasureLabels = (body.customMeasureLabels && typeof body.customMeasureLabels === "object") ? body.customMeasureLabels : {};
    if (body.customObjectiveLabels !== undefined) updateData.customObjectiveLabels = (body.customObjectiveLabels && typeof body.customObjectiveLabels === "object") ? body.customObjectiveLabels : {};

    await presetRef.update(updateData);
    res.json({ data: { id: req.params.presetId } });
  } catch (err) { next(err); }
});

app.delete("/api/v1/creator/library/objective-presets/:presetId", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    assertCreator(auth);

    const presetRef = db.collection("creator_libraries").doc(auth.userId)
      .collection("measure_objective_presets")
      .doc(req.params.presetId);

    const snap = await presetRef.get();
    if (!snap.exists) throw apiError("NOT_FOUND", "Preset no encontrado", 404);

    await presetRef.delete();
    res.status(204).end();
  } catch (err) { next(err); }
});

// ── 6.8 Enrolled Courses ──────────────────────────────────────────────────────

app.get("/api/v1/workout/courses", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    const userDoc = await db.collection("users").doc(auth.userId).get();
    if (!userDoc.exists) throw apiError("NOT_FOUND", "User not found", 404);
    const coursesMap = (userDoc.data()?.courses ?? {}) as Record<string, Record<string, unknown>>;
    const courseEntries = Object.entries(coursesMap);
    const courseDocResults = await Promise.all(
      courseEntries.map(([courseId]) => db.collection("courses").doc(courseId).get())
    );
    const data = courseEntries.map(([courseId, entry], i) => {
      const courseDoc = courseDocResults[i];
      const courseData = courseDoc.exists ? courseDoc.data()! : {};
      return {
        courseId,
        status: entry.status,
        access_duration: entry.access_duration,
        expires_at: entry.expires_at,
        purchased_at: entry.purchased_at,
        deliveryType: entry.deliveryType,
        title: entry.title,
        image_url: entry.image_url,
        is_trial: entry.is_trial ?? false,
        trial_consumed: entry.trial_consumed ?? false,
        courseData,
      };
    });
    res.json({ data });
  } catch (err) { next(err); }
});

app.get("/api/v1/workout/courses/:courseId", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    const { courseId } = req.params;

    const userDoc = await db.collection("users").doc(auth.userId).get();
    if (!userDoc.exists) throw apiError("NOT_FOUND", "User not found", 404);
    const coursesMap = (userDoc.data()?.courses ?? {}) as Record<string, unknown>;
    if (!coursesMap[courseId]) throw apiError("FORBIDDEN", "Access denied to this course", 403);

    const courseDoc = await db.collection("courses").doc(courseId).get();
    if (!courseDoc.exists) throw apiError("NOT_FOUND", "Course not found", 404);

    res.json({ data: { id: courseId, ...courseDoc.data() } });
  } catch (err) { next(err); }
});

app.get("/api/v1/workout/courses/:courseId/modules", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    const { courseId } = req.params;

    const userDoc = await db.collection("users").doc(auth.userId).get();
    if (!userDoc.exists) throw apiError("NOT_FOUND", "User not found", 404);
    const coursesMap = (userDoc.data()?.courses ?? {}) as Record<string, unknown>;
    if (!coursesMap[courseId]) throw apiError("FORBIDDEN", "Access denied to this course", 403);

    const courseDoc = await db.collection("courses").doc(courseId).get();
    if (!courseDoc.exists) throw apiError("NOT_FOUND", "Course not found", 404);

    const modulesSnap = await db.collection("courses").doc(courseId)
      .collection("modules").orderBy("order", "asc").get();

    const modules = await Promise.all(modulesSnap.docs.map(async (moduleDoc) => {
      const sessionsSnap = await db.collection("courses").doc(courseId)
        .collection("modules").doc(moduleDoc.id)
        .collection("sessions").orderBy("order", "asc").get();
      const sessions = sessionsSnap.docs.map((sessionDoc) => ({ id: sessionDoc.id, ...sessionDoc.data() }));
      return { id: moduleDoc.id, ...moduleDoc.data(), sessions };
    }));

    res.json({ data: modules });
  } catch (err) { next(err); }
});

// ── 6.9 Active Session Checkpoint ─────────────────────────────────────────────

app.get("/api/v1/workout/session/active", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    const snap = await db.collection("users").doc(auth.userId)
      .collection("workoutCheckpoint").doc("current").get();
    res.json({ data: snap.exists ? snap.data() : null });
  } catch (err) { next(err); }
});

app.post("/api/v1/workout/session/checkpoint", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    const body = validateBody<{
      sessionId?: string; courseId?: string; moduleId?: string; sessionTitle?: string;
      exerciseStates?: unknown; currentExerciseIndex?: number; currentSetIndex?: number;
    }>({
      sessionId: "optional_string", courseId: "optional_string", moduleId: "optional_string",
      sessionTitle: "optional_string", exerciseStates: "optional_object",
      currentExerciseIndex: "optional_number", currentSetIndex: "optional_number",
    }, req.body);
    await db.collection("users").doc(auth.userId)
      .collection("workoutCheckpoint").doc("current")
      .set({ ...body, savedAt: FieldValue.serverTimestamp() });
    res.json({ data: { savedAt: new Date().toISOString() } });
  } catch (err) { next(err); }
});

app.delete("/api/v1/workout/session/active", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    await db.collection("users").doc(auth.userId)
      .collection("workoutCheckpoint").doc("current").delete();
    res.status(204).end();
  } catch (err) { next(err); }
});

// ── Public Profiles ────────────────────────────────────────────────────────────

app.get("/api/v1/users/:userId/public-profile", async (req, res, next) => {
  try {
    await validateAuth(req);
    const { userId } = req.params;
    const userDoc = await db.collection("users").doc(userId).get();
    if (!userDoc.exists) throw apiError("NOT_FOUND", "User not found", 404);
    const d = userDoc.data()!;
    res.json({
      data: {
        userId,
        displayName: d.displayName ?? d.name ?? null,
        bio: d.bio ?? null,
        profilePictureUrl: d.profilePictureUrl ?? d.photoUrl ?? d.photoURL ?? null,
      },
    });
  } catch (err) { next(err); }
});

// ─── 4.8 User Meals ───────────────────────────────────────────────────────────

app.get("/api/v1/nutrition/user-meals", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    const snap = await db.collection("users").doc(auth.userId)
      .collection("meals").orderBy("createdAt", "desc").get();
    res.json({
      data: snap.docs.map((d) => {
        const e = d.data();
        return {
          mealId: d.id,
          name: e.name ?? "",
          items: e.items ?? [],
          createdAt: e.createdAt?.toDate?.()?.toISOString() ?? null,
          updatedAt: e.updatedAt?.toDate?.()?.toISOString() ?? null,
        };
      }),
    });
  } catch (err) { next(err); }
});

app.post("/api/v1/nutrition/user-meals", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    const body = validateBody<{ name: string; items?: unknown[] }>({
      name: "string", items: "optional_array",
    }, req.body);
    const docRef = await db.collection("users").doc(auth.userId)
      .collection("meals").add({
        name: body.name,
        items: body.items ?? [],
        userId: auth.userId,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    res.status(201).json({ data: { mealId: docRef.id } });
  } catch (err) { next(err); }
});

app.patch("/api/v1/nutrition/user-meals/:mealId", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    const ref = db.collection("users").doc(auth.userId)
      .collection("meals").doc(req.params.mealId);
    const doc = await ref.get();
    if (!doc.exists) throw apiError("NOT_FOUND", "Meal not found", 404);
    const body = validateBody<{ name?: string; items?: unknown[] }>({
      name: "optional_string", items: "optional_array",
    }, req.body);
    const update: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
    if (body.name !== undefined) update.name = body.name;
    if (body.items !== undefined) update.items = body.items;
    await ref.update(update);
    res.json({ data: { mealId: req.params.mealId } });
  } catch (err) { next(err); }
});

app.delete("/api/v1/nutrition/user-meals/:mealId", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    const ref = db.collection("users").doc(auth.userId)
      .collection("meals").doc(req.params.mealId);
    if (!(await ref.get()).exists) throw apiError("NOT_FOUND", "Meal not found", 404);
    await ref.delete();
    res.status(204).end();
  } catch (err) { next(err); }
});

// ─── 4.9 Saved Foods PATCH ────────────────────────────────────────────────────

app.patch("/api/v1/nutrition/saved-foods/:savedFoodId", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    const ref = db.collection("users").doc(auth.userId)
      .collection("saved_foods").doc(req.params.savedFoodId);
    const doc = await ref.get();
    if (!doc.exists) throw apiError("NOT_FOUND", "Saved food not found", 404);
    const body = validateBody<{
      name?: string; calories?: number; protein?: number;
      carbs?: number; fat?: number; servingUnit?: string;
    }>({
      name: "optional_string", calories: "optional_number", protein: "optional_number",
      carbs: "optional_number", fat: "optional_number", servingUnit: "optional_string",
    }, req.body);
    const update: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
    if (body.name !== undefined) update.name = body.name;
    if (body.calories !== undefined) update.calories = body.calories;
    if (body.protein !== undefined) update.protein = body.protein;
    if (body.carbs !== undefined) update.carbs = body.carbs;
    if (body.fat !== undefined) update.fat = body.fat;
    if (body.servingUnit !== undefined) update.servingUnit = body.servingUnit;
    await ref.update(update);
    res.json({ data: { savedFoodId: req.params.savedFoodId } });
  } catch (err) { next(err); }
});

// ─── 5.0 Creator Meal GET by ID ───────────────────────────────────────────────

app.get("/api/v1/creator/nutrition/meals/:mealId", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    assertCreator(auth);
    const doc = await db.collection("creator_nutrition_library").doc(auth.userId)
      .collection("meals").doc(req.params.mealId).get();
    if (!doc.exists) throw apiError("NOT_FOUND", "Meal not found", 404);
    const e = doc.data()!;
    res.json({
      data: {
        mealId: doc.id,
        name: e.name ?? "",
        description: e.description ?? null,
        items: e.items ?? [],
        videoUrl: e.videoUrl ?? null,
        createdAt: e.createdAt?.toDate?.()?.toISOString() ?? null,
        updatedAt: e.updatedAt?.toDate?.()?.toISOString() ?? null,
      },
    });
  } catch (err) { next(err); }
});

// ─── 5.1 Creator Nutrition Assignments (cross-client list) ────────────────────

app.get("/api/v1/creator/nutrition/assignments", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    assertCreator(auth);
    const snap = await db.collection("nutrition_assignments")
      .where("assignedBy", "==", auth.userId)
      .orderBy("createdAt", "desc")
      .get();
    res.json({
      data: snap.docs.map((d) => {
        const e = d.data();
        return {
          assignmentId: d.id,
          planId: e.planId ?? null,
          planName: e.plan?.name ?? e.planName ?? null,
          clientId: e.userId ?? null,
          startDate: e.startDate ?? null,
          endDate: e.endDate ?? null,
          createdAt: e.createdAt?.toDate?.()?.toISOString() ?? null,
        };
      }),
    });
  } catch (err) { next(err); }
});

app.patch("/api/v1/creator/nutrition/assignments/:assignmentId", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    assertCreator(auth);
    const ref = db.collection("nutrition_assignments").doc(req.params.assignmentId);
    const doc = await ref.get();
    if (!doc.exists) throw apiError("NOT_FOUND", "Assignment not found", 404);
    if (doc.data()?.assignedBy !== auth.userId) throw apiError("FORBIDDEN", "Not your assignment", 403);
    const body = validateBody<{ planId?: string; startDate?: string; endDate?: string }>({
      planId: "optional_string", startDate: "optional_string", endDate: "optional_string",
    }, req.body);
    const update: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
    if (body.planId !== undefined) update.planId = body.planId;
    if (body.startDate !== undefined) update.startDate = body.startDate;
    if (body.endDate !== undefined) update.endDate = body.endDate;
    await ref.update(update);
    res.json({ data: { assignmentId: req.params.assignmentId } });
  } catch (err) { next(err); }
});

// ─── 5.2 Creator — Write client diary ─────────────────────────────────────────

app.post("/api/v1/creator/clients/:clientId/nutrition/diary", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    assertCreator(auth);
    await requireClientRelationship(auth.userId, req.params.clientId);
    const body = validateBody<{
      date: string; meal: string; foodId: string; servingId: string;
      numberOfUnits: number; name: string; foodCategory?: string;
      calories?: number; protein?: number; carbs?: number; fat?: number;
      servingUnit?: string; gramsPerUnit?: number; servings?: unknown[];
    }>({
      date: "string", meal: "string", foodId: "string", servingId: "string",
      numberOfUnits: "number", name: "string",
      foodCategory: "optional_string", calories: "optional_number",
      protein: "optional_number", carbs: "optional_number", fat: "optional_number",
      servingUnit: "optional_string", gramsPerUnit: "optional_number", servings: "optional_array",
    }, req.body);
    parseDateParam(body.date, "date");
    if (!["breakfast", "lunch", "dinner", "snack"].includes(body.meal)) {
      throw apiError("VALIDATION_ERROR", "meal must be breakfast, lunch, dinner, or snack", 400, "meal");
    }
    const docRef = await db.collection("users").doc(req.params.clientId).collection("diary").add({
      userId: req.params.clientId,
      date: body.date, meal: body.meal,
      food_id: body.foodId, serving_id: body.servingId,
      number_of_units: body.numberOfUnits, name: body.name,
      food_category: body.foodCategory ?? null,
      calories: body.calories ?? null, protein: body.protein ?? null,
      carbs: body.carbs ?? null, fat: body.fat ?? null,
      serving_unit: body.servingUnit ?? null, grams_per_unit: body.gramsPerUnit ?? null,
      ...(body.servings ? { servings: body.servings } : {}),
      createdAt: FieldValue.serverTimestamp(),
    });
    res.status(201).json({ data: { entryId: docRef.id, createdAt: new Date().toISOString() } });
  } catch (err) { next(err); }
});

app.delete("/api/v1/creator/clients/:clientId/nutrition/diary/:entryId", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    assertCreator(auth);
    await requireClientRelationship(auth.userId, req.params.clientId);
    const ref = db.collection("users").doc(req.params.clientId)
      .collection("diary").doc(req.params.entryId);
    if (!(await ref.get()).exists) throw apiError("NOT_FOUND", "Diary entry not found", 404);
    await ref.delete();
    res.json({ data: { deleted: true } });
  } catch (err) { next(err); }
});

// ─── 5.3 Creator Feedback ─────────────────────────────────────────────────────

app.post("/api/v1/creator/feedback/upload-url", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    const body = validateBody<{ filename: string; contentType: string }>({
      filename: "string", contentType: "string",
    }, req.body);
    const ALLOWED_CONTENT_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    if (!ALLOWED_CONTENT_TYPES.includes(body.contentType)) {
      throw apiError("VALIDATION_ERROR", "contentType must be an image (jpeg, png, webp, or gif)", 400, "contentType");
    }
    const safeFilename = body.filename.replace(/[^a-zA-Z0-9._-]/g, "_");
    const timestamp = Date.now();
    const storagePath = `creator_feedback/${auth.userId}/${timestamp}_${safeFilename}`;
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
    let uploadUrl: string;
    try {
      [uploadUrl] = await admin.storage().bucket().file(storagePath).getSignedUrl({
        version: "v4",
        action: "write",
        expires: expiresAt,
        contentType: body.contentType,
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      functions.logger.error("getSignedUrl failed", { error: msg });
      throw apiError("INTERNAL_ERROR", "Storage signing failed", 500);
    }
    res.json({ data: { uploadUrl, storagePath } });
  } catch (err) { next(err); }
});

app.post("/api/v1/creator/feedback", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    const body = validateBody<{
      type: string; text: string; storagePath?: string;
      creatorEmail?: string; creatorDisplayName?: string;
    }>({
      type: "string", text: "string",
      storagePath: "optional_string", creatorEmail: "optional_string",
      creatorDisplayName: "optional_string",
    }, req.body);
    const docRef = await db.collection("creator_feedback").add({
      creatorId: auth.userId,
      type: body.type,
      text: body.text,
      imagePath: body.storagePath ?? null,
      creatorEmail: body.creatorEmail ?? null,
      creatorDisplayName: body.creatorDisplayName ?? null,
      createdAt: FieldValue.serverTimestamp(),
    });
    res.status(201).json({ data: { feedbackId: docRef.id } });
  } catch (err) { next(err); }
});

// ─── 5.4 Creator Media ────────────────────────────────────────────────────────

app.get("/api/v1/creator/media", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    assertCreator(auth);
    const snap = await db.collection("creator_media").doc(auth.userId)
      .collection("files").orderBy("createdAt", "desc").get();
    res.json({
      data: snap.docs.map((d) => {
        const e = d.data();
        return {
          fileId: d.id,
          name: e.name ?? null,
          url: e.url ?? null,
          contentType: e.contentType ?? null,
          size: e.size ?? null,
          storagePath: e.storagePath ?? null,
          createdAt: e.createdAt?.toDate?.()?.toISOString() ?? null,
        };
      }),
    });
  } catch (err) { next(err); }
});

app.post("/api/v1/creator/media/upload-url", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    assertCreator(auth);
    const body = validateBody<{ filename: string; contentType: string }>({
      filename: "string", contentType: "string",
    }, req.body);
    const ALLOWED_CONTENT_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "video/mp4", "video/quicktime"];
    if (!ALLOWED_CONTENT_TYPES.includes(body.contentType)) {
      throw apiError("VALIDATION_ERROR", "contentType must be an image or video file", 400, "contentType");
    }
    const safeFilename = body.filename.replace(/[^a-zA-Z0-9._-]/g, "_");
    const timestamp = Date.now();
    const storagePath = `creator_media/${auth.userId}/${timestamp}_${safeFilename}`;
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
    let uploadUrl: string;
    try {
      [uploadUrl] = await admin.storage().bucket().file(storagePath).getSignedUrl({
        version: "v4",
        action: "write",
        expires: expiresAt,
        contentType: body.contentType,
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      functions.logger.error("getSignedUrl failed", { error: msg });
      throw apiError("INTERNAL_ERROR", "Storage signing failed", 500);
    }
    res.json({ data: { uploadUrl, storagePath } });
  } catch (err) { next(err); }
});

app.delete("/api/v1/creator/media/:fileId", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    assertCreator(auth);
    const ref = db.collection("creator_media").doc(auth.userId)
      .collection("files").doc(req.params.fileId);
    const doc = await ref.get();
    if (!doc.exists) throw apiError("NOT_FOUND", "File not found", 404);
    const storagePath: string | undefined = doc.data()?.storagePath;
    if (storagePath) {
      await admin.storage().bucket().file(storagePath).delete().catch(() => { /* best-effort */ });
    }
    await ref.delete();
    res.json({ data: { deleted: true } });
  } catch (err) { next(err); }
});

// ─── Workout: Active session checkpoints ─────────────────────────────────────

app.post("/api/v1/workout/sessions/current/checkpoints", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    const body = validateBody<{
      sessionId: string;
      exerciseId: string;
      setIndex: number;
      setData: object;
    }>({
      sessionId: "string",
      exerciseId: "string",
      setIndex: "number",
      setData: "object",
    }, req.body);

    const checkpointId = `${body.exerciseId}_${body.setIndex}`;
    await db.collection("users").doc(auth.userId)
      .collection("activeSession").doc(body.sessionId)
      .collection("checkpoints").doc(checkpointId)
      .set({
        ...(body.setData as Record<string, unknown>),
        savedAt: FieldValue.serverTimestamp(),
      });

    res.json({ data: { saved: true } });
  } catch (err) { next(err); }
});

app.get("/api/v1/workout/sessions/current", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    const snap = await db.collection("users").doc(auth.userId)
      .collection("activeSession")
      .orderBy("savedAt", "desc")
      .limit(1)
      .get();

    if (snap.empty) {
      res.json({ data: null });
      return;
    }

    const sessionDoc = snap.docs[0];
    const checkpointsSnap = await sessionDoc.ref.collection("checkpoints").get();
    const checkpoints = checkpointsSnap.docs.map((d) => ({ checkpointId: d.id, ...d.data() }));

    res.json({ data: { sessionId: sessionDoc.id, checkpoints } });
  } catch (err) { next(err); }
});

app.delete("/api/v1/workout/sessions/current", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    const body = validateBody<{ sessionId: string }>({ sessionId: "string" }, req.body);

    const sessionRef = db.collection("users").doc(auth.userId)
      .collection("activeSession").doc(body.sessionId);

    const checkpointsSnap = await sessionRef.collection("checkpoints").get();
    const batch = db.batch();
    checkpointsSnap.docs.forEach((d) => batch.delete(d.ref));
    batch.delete(sessionRef);
    await batch.commit();

    res.json({ data: { deleted: true } });
  } catch (err) { next(err); }
});

// ─── Library: PWA read-only endpoints ────────────────────────────────────────

app.get("/api/v1/library/modules/:moduleId", async (req, res, next) => {
  try {
    await validateAuth(req);
    const { moduleId } = req.params;
    const { creatorId } = req.query as Record<string, string | undefined>;
    if (!creatorId) throw apiError("VALIDATION_ERROR", "creatorId es requerido", 400);
    const moduleRef = db.collection("creator_libraries").doc(creatorId)
      .collection("modules").doc(moduleId);
    const moduleDoc = await moduleRef.get();
    if (!moduleDoc.exists) { res.json({ data: null }); return; }
    const moduleData = moduleDoc.data()!;
    const sessionRefs: string[] = Array.isArray(moduleData.sessionRefs) ? moduleData.sessionRefs : [];
    const sessions = (await Promise.all(sessionRefs.map(async (sessionId, index) => {
      try {
        const sessionRef = db.collection("creator_libraries").doc(creatorId)
          .collection("sessions").doc(sessionId);
        const sessionDoc = await sessionRef.get();
        if (!sessionDoc.exists) return null;
        const exercisesSnap = await sessionRef.collection("exercises").orderBy("order", "asc").get();
        const exercises = await Promise.all(exercisesSnap.docs.map(async (exDoc) => {
          const setsSnap = await exDoc.ref.collection("sets").orderBy("order", "asc").get();
          return { id: exDoc.id, ...exDoc.data(), sets: setsSnap.docs.map((s) => ({ id: s.id, ...s.data() })) };
        }));
        return { id: sessionId, ...sessionDoc.data(), order: index, exercises };
      } catch { return null; }
    }))).filter(Boolean);
    res.json({ data: { id: moduleDoc.id, ...moduleData, sessions } });
  } catch (err) { next(err); }
});

app.get("/api/v1/library/sessions/:sessionId", async (req, res, next) => {
  try {
    await validateAuth(req);
    const { sessionId } = req.params;
    const { creatorId } = req.query as Record<string, string | undefined>;
    if (!creatorId) throw apiError("VALIDATION_ERROR", "creatorId es requerido", 400);
    const sessionRef = db.collection("creator_libraries").doc(creatorId)
      .collection("sessions").doc(sessionId);
    const sessionDoc = await sessionRef.get();
    if (!sessionDoc.exists) { res.json({ data: null }); return; }
    const exercisesSnap = await sessionRef.collection("exercises").orderBy("order", "asc").get();
    const exercises = await Promise.all(exercisesSnap.docs.map(async (exDoc) => {
      const setsSnap = await exDoc.ref.collection("sets").orderBy("order", "asc").get();
      return { id: exDoc.id, ...exDoc.data(), sets: setsSnap.docs.map((s) => ({ id: s.id, ...s.data() })) };
    }));
    res.json({ data: { id: sessionDoc.id, ...sessionDoc.data(), exercises } });
  } catch (err) { next(err); }
});

// ─── Events: check-in by token ───────────────────────────────────────────────

app.post("/api/v1/events/:eventId/check-in-by-token", async (req, res, next) => {
  try {
    await validateAuth(req);
    const { eventId } = req.params;
    const { token } = req.body as { token?: string };
    if (!token) throw apiError("VALIDATION_ERROR", "token es requerido", 400);
    const snap = await db.collection("event_signups").doc(eventId)
      .collection("registrations").where("check_in_token", "==", token).limit(1).get();
    if (snap.empty) throw apiError("NOT_FOUND", "Token no encontrado", 404);
    const regDoc = snap.docs[0];
    await regDoc.ref.update({
      checked_in: true,
      checked_in_at: admin.firestore.FieldValue.serverTimestamp(),
    });
    res.json({ data: { registrationId: regDoc.id, checkedIn: true } });
  } catch (err) { next(err); }
});

// ─── Workout: client programs + planned session ───────────────────────────────

app.get("/api/v1/workout/client-programs/:programId", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    const { programId } = req.params;
    const docId = `${auth.userId}_${programId}`;
    const snap = await db.collection("client_programs").doc(docId).get();
    if (!snap.exists) {
      res.json({ data: null });
      return;
    }
    res.json({ data: { id: snap.id, ...snap.data() } });
  } catch (err) { next(err); }
});

app.get("/api/v1/workout/planned-session", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    const { courseId, date } = req.query as Record<string, string | undefined>;
    if (!courseId || !date) throw apiError("VALIDATION_ERROR", "courseId y date son requeridos", 400);
    const d = new Date(date);
    const start = new Date(d); start.setHours(0, 0, 0, 0);
    const end = new Date(d); end.setHours(23, 59, 59, 999);
    const snap = await db.collection("client_sessions")
      .where("client_id", "==", auth.userId)
      .where("program_id", "==", courseId)
      .where("date_timestamp", ">=", start)
      .where("date_timestamp", "<=", end)
      .orderBy("date_timestamp", "asc")
      .limit(1)
      .get();
    if (snap.empty) {
      res.json({ data: null });
      return;
    }
    const docSnap = snap.docs[0];
    res.json({ data: { id: docSnap.id, ...docSnap.data() } });
  } catch (err) { next(err); }
});

// ─── User full document endpoints ────────────────────────────────────────────

app.get("/api/v1/users/me/full", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    const snap = await db.collection("users").doc(auth.userId).get();
    if (!snap.exists) {
      res.json({ data: null });
      return;
    }
    res.json({ data: { id: auth.userId, ...snap.data() } });
  } catch (err) { next(err); }
});

app.patch("/api/v1/users/me/full", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    const body = { ...req.body };
    const BLOCKED = ["courses", "subscriptions", "role", "created_at"];
    for (const key of BLOCKED) delete body[key];
    await db.collection("users").doc(auth.userId).set(body, { merge: true });
    res.json({ data: { updated: true } });
  } catch (err) { next(err); }
});

// ── Workout Programs (new /programs path) ─────────────────────────────────────

app.get("/api/v1/workout/programs/:courseId", async (req, res, next) => {
  try {
    await validateAuth(req);
    const { courseId } = req.params;
    const snap = await db.collection("courses").doc(courseId).get();
    if (!snap.exists) {
      res.json({ data: null });
      return;
    }
    res.json({ data: { id: snap.id, ...snap.data() } });
  } catch (err) { next(err); }
});

app.get("/api/v1/workout/programs/:courseId/modules", async (req, res, next) => {
  try {
    await validateAuth(req);
    const { courseId } = req.params;
    const snap = await db.collection("courses").doc(courseId)
      .collection("modules").orderBy("order", "asc").get();
    res.json({ data: snap.docs.map(d => ({ id: d.id, ...d.data() })) });
  } catch (err) { next(err); }
});

app.get("/api/v1/workout/programs/:courseId/modules/:moduleId/sessions/:sessionId/overrides", async (req, res, next) => {
  try {
    await validateAuth(req);
    const { courseId, moduleId, sessionId } = req.params;
    const docRef = db.collection("courses").doc(courseId)
      .collection("modules").doc(moduleId)
      .collection("sessions").doc(sessionId)
      .collection("overrides").doc("data");
    const snap = await docRef.get();
    res.json({ data: snap.exists ? snap.data() : null });
  } catch (err) { next(err); }
});

app.get("/api/v1/workout/programs/:courseId/modules/:moduleId/sessions/:sessionId/exercises/:exerciseId/overrides", async (req, res, next) => {
  try {
    await validateAuth(req);
    const { courseId, moduleId, sessionId, exerciseId } = req.params;
    const docRef = db.collection("courses").doc(courseId)
      .collection("modules").doc(moduleId)
      .collection("sessions").doc(sessionId)
      .collection("exercises").doc(exerciseId)
      .collection("overrides").doc("data");
    const snap = await docRef.get();
    res.json({ data: snap.exists ? snap.data() : null });
  } catch (err) { next(err); }
});

app.get("/api/v1/workout/programs/:courseId/modules/:moduleId/sessions/:sessionId/exercises/:exerciseId/sets/:setId/overrides", async (req, res, next) => {
  try {
    await validateAuth(req);
    const { courseId, moduleId, sessionId, exerciseId, setId } = req.params;
    const docRef = db.collection("courses").doc(courseId)
      .collection("modules").doc(moduleId)
      .collection("sessions").doc(sessionId)
      .collection("exercises").doc(exerciseId)
      .collection("sets").doc(setId)
      .collection("overrides").doc("data");
    const snap = await docRef.get();
    res.json({ data: snap.exists ? snap.data() : null });
  } catch (err) { next(err); }
});

app.post("/api/v1/workout/client-programs/:programId", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    const { programId } = req.params;
    const body = req.body ?? {};
    const docId = `${auth.userId}_${programId}`;
    await db.collection("client_programs").doc(docId).set(
      { program_id: programId, user_id: auth.userId, ...body, updated_at: admin.firestore.FieldValue.serverTimestamp() },
      { merge: true }
    );
    res.json({ data: { id: docId } });
  } catch (err) { next(err); }
});

app.patch("/api/v1/workout/client-programs/:programId/overrides", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    const { programId } = req.params;
    const { path, value } = req.body ?? {};
    if (!path || typeof path !== "string") throw apiError("VALIDATION_ERROR", "path is required", 400, "path");
    if (!path.startsWith("overrides.")) throw apiError("VALIDATION_ERROR", "path must start with 'overrides.'", 400, "path");
    const docId = `${auth.userId}_${programId}`;
    await db.collection("client_programs").doc(docId).update({
      [path]: value,
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
    });
    res.json({ data: { updated: true } });
  } catch (err) { next(err); }
});

app.delete("/api/v1/workout/client-programs/:programId", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    const { programId } = req.params;
    const docId = `${auth.userId}_${programId}`;
    await db.collection("client_programs").doc(docId).delete();
    res.status(204).send();
  } catch (err) { next(err); }
});

app.get("/api/v1/workout/plans/:planId/modules/:moduleId/sessions/:sessionId/full", async (req, res, next) => {
  try {
    await validateAuth(req);
    const { planId, moduleId, sessionId } = req.params;
    const sessionRef = db.collection("plans").doc(planId)
      .collection("modules").doc(moduleId)
      .collection("sessions").doc(sessionId);
    const sessionDoc = await sessionRef.get();
    if (!sessionDoc.exists) { res.json({ data: null }); return; }
    const exercisesSnap = await sessionRef.collection("exercises").orderBy("order", "asc").get();
    const exercises = await Promise.all(exercisesSnap.docs.map(async (exDoc) => {
      const setsSnap = await exDoc.ref.collection("sets").orderBy("order", "asc").get();
      return { id: exDoc.id, ...exDoc.data(), sets: setsSnap.docs.map((s) => ({ id: s.id, ...s.data() })) };
    }));
    res.json({ data: { id: sessionDoc.id, ...sessionDoc.data(), exercises } });
  } catch (err) { next(err); }
});

app.get("/api/v1/workout/client-programs", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    const { orphaned } = req.query as Record<string, string | undefined>;
    const snap = await db.collection("client_programs").where("user_id", "==", auth.userId).get();
    if (!orphaned) {
      res.json({ data: snap.docs.map(d => ({ id: d.id, ...d.data() })) });
      return;
    }
    const userSnap = await db.collection("users").doc(auth.userId).get();
    const activeCourseIds = new Set(Object.keys((userSnap.data()?.courses ?? {}) as Record<string, unknown>));
    const courseChecks = await Promise.all(
      snap.docs.map(d => {
        const programId = (d.data() as Record<string, unknown>).program_id as string | undefined;
        if (!programId || activeCourseIds.has(programId)) return Promise.resolve(null);
        return db.collection("courses").doc(programId).get().then(courseSnap => ({ programId, courseSnap }));
      })
    );
    const farFuture = new Date();
    farFuture.setFullYear(farFuture.getFullYear() + 10);
    const result = courseChecks
      .filter((item): item is { programId: string; courseSnap: FirebaseFirestore.DocumentSnapshot } =>
        item !== null && item.courseSnap.exists && (item.courseSnap.data() as Record<string, unknown>).deliveryType === "one_on_one"
      )
      .map(({ programId, courseSnap }) => {
        const courseData = courseSnap.data() as Record<string, unknown>;
        return {
          id: `${auth.userId}-${programId}`,
          courseId: programId,
          courseData: {
            access_duration: "one_on_one",
            expires_at: farFuture.toISOString(),
            status: "active",
            purchased_at: new Date().toISOString(),
            deliveryType: "one_on_one",
            title: courseData.title || "Untitled Program",
            image_url: courseData.image_url || null,
            discipline: courseData.discipline || "General",
            creatorName: courseData.creatorName || courseData.creator_name || "Unknown Creator",
          },
          courseDetails: {
            id: programId,
            title: courseData.title || "Curso sin título",
            image_url: courseData.image_url || "",
            discipline: courseData.discipline || "General",
            creatorName: courseData.creatorName || courseData.creator_name || null,
          },
          isActive: true,
          isExpired: false,
          isCompleted: false,
          status: "active",
          expires_at: farFuture.toISOString(),
        };
      });
    res.json({ data: result });
  } catch (err) { next(err); }
});

// ── User init ─────────────────────────────────────────────────────────────────

app.post("/api/v1/users/me/init", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    const userRef = db.collection("users").doc(auth.userId);
    const existing = await userRef.get();
    if (existing.exists) {
      res.json({ data: { created: false } });
      return;
    }
    const raw = (req.body ?? {}) as Record<string, unknown>;
    const safeFields: Record<string, unknown> = {};
    if (typeof raw.displayName === "string") safeFields.displayName = raw.displayName.trim().slice(0, 100);
    if (typeof raw.email === "string") safeFields.email = raw.email.trim().toLowerCase().slice(0, 254);
    if (typeof raw.photoURL === "string") safeFields.photoURL = raw.photoURL.slice(0, 500);
    await userRef.set({ ...safeFields, role: "user", created_at: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    res.json({ data: { created: true } });
  } catch (err) { next(err); }
});

app.post("/api/v1/progress", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    const body = (req.body ?? {}) as Record<string, unknown>;
    const ref = await db.collection("progress").add({
      ...body,
      user_id: auth.userId,
      created_at: admin.firestore.FieldValue.serverTimestamp(),
    });
    res.json({ data: { id: ref.id } });
  } catch (err) { next(err); }
});

app.patch("/api/v1/progress/:progressId", async (req, res, next) => {
  try {
    await validateAuth(req);
    const { progressId } = req.params;
    const body = (req.body ?? {}) as Record<string, unknown>;
    await db.collection("progress").doc(progressId).update({
      ...body,
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
    });
    res.json({ data: { updated: true } });
  } catch (err) { next(err); }
});

app.get("/api/v1/progress/user-sessions", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    const { courseId, limitParam } = req.query as { courseId?: string; limitParam?: string };
    const limitVal = limitParam ? parseInt(limitParam, 10) : 50;
    let ref: FirebaseFirestore.Query = db.collection("progress")
      .where("user_id", "==", auth.userId);
    if (courseId) ref = ref.where("course_id", "==", courseId);
    ref = ref.orderBy("completed_at", "desc").limit(limitVal);
    const snap = await ref.get();
    res.json({ data: snap.docs.map((d) => ({ id: d.id, ...d.data() })) });
  } catch (err) { next(err); }
});

app.get("/api/v1/progress/session/:sessionId", async (req, res, next) => {
  try {
    await validateAuth(req);
    const { sessionId } = req.params;
    const docSnap = await db.collection("progress").doc(sessionId).get();
    if (!docSnap.exists) {
      res.json({ data: null });
      return;
    }
    res.json({ data: { id: docSnap.id, ...docSnap.data() } });
  } catch (err) { next(err); }
});

// ── Exercise library ───────────────────────────────────────────────────────────

app.get("/api/v1/library/exercises/:exerciseId", async (req, res, next) => {
  try {
    await validateAuth(req);
    const { exerciseId } = req.params;
    const docSnap = await db.collection("exercises_library").doc(exerciseId).get();
    if (!docSnap.exists) {
      res.json({ data: null });
      return;
    }
    res.json({ data: { id: docSnap.id, ...docSnap.data() } });
  } catch (err) { next(err); }
});

// ─── Purchases ────────────────────────────────────────────────────────────────

app.post("/api/v1/purchases", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    const body = validateBody<{ courseId: string; amount: number; currency?: string }>(
      { courseId: "string", amount: "number", currency: "optional_string" },
      req.body
    );
    const ref = await db.collection("purchases").add({
      courseId: body.courseId,
      amount: body.amount,
      currency: body.currency ?? "COP",
      user_id: auth.userId,
      created_at: FieldValue.serverTimestamp(),
    });
    res.json({ data: { id: ref.id } });
  } catch (err) { next(err); }
});

// ─── Community ────────────────────────────────────────────────────────────────

app.get("/api/v1/community/posts", async (req, res, next) => {
  try {
    await validateAuth(req);
    const snap = await db.collection("community").orderBy("created_at", "desc").limit(50).get();
    res.json({ data: snap.docs.map((d) => ({ id: d.id, ...d.data() })) });
  } catch (err) { next(err); }
});

app.post("/api/v1/community/posts", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    const body = validateBody<{ content: string; mediaUrl?: string }>(
      { content: "string", mediaUrl: "optional_string" },
      req.body
    );
    if (body.content.trim().length === 0) throw apiError("VALIDATION_ERROR", "content cannot be empty", 400, "content");
    if (body.content.length > 2000) throw apiError("VALIDATION_ERROR", "content exceeds 2000 characters", 400, "content");
    const ref = await db.collection("community").add({
      content: body.content.trim(),
      ...(body.mediaUrl ? { mediaUrl: body.mediaUrl } : {}),
      user_id: auth.userId,
      created_at: FieldValue.serverTimestamp(),
    });
    res.json({ data: { id: ref.id } });
  } catch (err) { next(err); }
});

// ─── Account deletion ─────────────────────────────────────────────────────────

app.post("/api/v1/users/me/delete-feedback", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    const body = validateBody<{ reason: string; details?: string }>(
      { reason: "string", details: "optional_string" },
      req.body
    );
    const ref = await db.collection("account_deletion_feedback").add({
      reason: body.reason.trim().slice(0, 500),
      ...(body.details ? { details: body.details.trim().slice(0, 2000) } : {}),
      user_id: auth.userId,
      created_at: FieldValue.serverTimestamp(),
    });
    res.json({ data: { id: ref.id } });
  } catch (err) { next(err); }
});

app.delete("/api/v1/users/me", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    const userId = auth.userId;
    const userRef = db.collection("users").doc(userId);

    const deleteSubcollection = async (subcollection: string) => {
      const snap = await userRef.collection(subcollection).get();
      if (snap.empty) return;
      const batchSize = 500;
      for (let i = 0; i < snap.docs.length; i += batchSize) {
        const b = db.batch();
        snap.docs.slice(i, i + batchSize).forEach((d) => b.delete(d.ref));
        await b.commit();
      }
    };

    await deleteSubcollection("exerciseHistory");
    await deleteSubcollection("sessionHistory");

    const progressSnap = await db.collection("progress")
      .where("user_id", "==", userId).get();
    if (!progressSnap.empty) {
      const batchSize = 500;
      for (let i = 0; i < progressSnap.docs.length; i += batchSize) {
        const b = db.batch();
        progressSnap.docs.slice(i, i + batchSize).forEach((d) => b.delete(d.ref));
        await b.commit();
      }
    }

    const userProgressSnap = await db.collection("user_progress")
      .where("user_id", "==", userId).get();
    if (!userProgressSnap.empty) {
      const batchSize = 500;
      for (let i = 0; i < userProgressSnap.docs.length; i += batchSize) {
        const b = db.batch();
        userProgressSnap.docs.slice(i, i + batchSize).forEach((d) => b.delete(d.ref));
        await b.commit();
      }
    }

    await userRef.delete();
    res.json({ data: { deleted: true } });
  } catch (err) { next(err); }
});

// ─── Course management ────────────────────────────────────────────────────────

app.post("/api/v1/users/me/move-course", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    const { courseId, expirationDate, accessDuration, courseDetails } = req.body as {
      courseId?: string;
      expirationDate?: string;
      accessDuration?: string;
      courseDetails?: Record<string, unknown>;
    };
    if (!courseId) throw apiError("VALIDATION_ERROR", "courseId is required", 400, "courseId");

    const courseDoc = await db.collection("courses").doc(courseId).get();
    if (!courseDoc.exists) throw apiError("NOT_FOUND", "Course not found", 404);

    const courseData = courseDoc.data() ?? {};
    const courseEntry: Record<string, unknown> = {
      access_duration: accessDuration ?? courseData.access_duration ?? "monthly",
      expires_at: expirationDate ?? null,
      status: "active",
      purchased_at: new Date().toISOString(),
      deliveryType: courseDetails?.deliveryType ?? courseData.deliveryType ?? "low_ticket",
      title: courseDetails?.title ?? courseData.title ?? "Untitled Course",
      image_url: courseDetails?.image_url ?? courseData.image_url ?? null,
      discipline: courseDetails?.discipline ?? courseData.discipline ?? "General",
      creatorName: courseDetails?.creatorName ?? courseDetails?.creator_name ?? courseData.creatorName ?? courseData.creator_name ?? "Unknown Creator",
      completedTutorials: {
        dailyWorkout: [],
        warmup: [],
        workoutExecution: [],
        workoutCompletion: [],
      },
    };

    const userRef = db.collection("users").doc(auth.userId);
    const userDoc = await userRef.get();
    const userData = userDoc.data() ?? {};
    const purchasedCourses: string[] = Array.isArray(userData.purchased_courses)
      ? [...new Set([...userData.purchased_courses, courseId])]
      : [courseId];

    await userRef.update({
      [`courses.${courseId}`]: courseEntry,
      purchased_courses: purchasedCourses,
    });

    res.json({ data: { added: true } });
  } catch (err) { next(err); }
});

app.delete("/api/v1/users/me/courses/:courseId", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    const { courseId } = req.params;
    await db.collection("users").doc(auth.userId).update({
      [`courses.${courseId}`]: FieldValue.delete(),
    });
    res.json({ data: { removed: true } });
  } catch (err) { next(err); }
});

app.patch("/api/v1/users/me/courses/:courseId/status", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    const { courseId } = req.params;
    const body = validateBody<{ status: string; expiresAt?: string }>({
      status: "string",
      expiresAt: "optional_string",
    }, req.body);

    const update: Record<string, unknown> = {
      [`courses.${courseId}.status`]: body.status,
      [`courses.${courseId}.status_updated_at`]: new Date().toISOString(),
    };
    if (body.expiresAt !== undefined) {
      update[`courses.${courseId}.expires_at`] = body.expiresAt;
    }

    await db.collection("users").doc(auth.userId).update(update);
    res.json({ data: { updated: true } });
  } catch (err) { next(err); }
});

// ── Courses ───────────────────────────────────────────────────────────────────

app.get("/api/v1/courses", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    if (auth.role === "creator" || auth.role === "admin") {
      const snap = await db.collection("courses").where("creator_id", "==", auth.userId).get();
      const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      res.json({ data });
      return;
    }
    const userDoc = await db.collection("users").doc(auth.userId).get();
    if (!userDoc.exists) { res.json({ data: [] }); return; }
    const coursesMap = (userDoc.data()?.courses ?? {}) as Record<string, unknown>;
    const courseIds = Object.keys(coursesMap);
    if (courseIds.length === 0) { res.json({ data: [] }); return; }
    const courseSnaps = await Promise.all(courseIds.map((id) => db.collection("courses").doc(id).get()));
    const data = courseSnaps
      .filter((s) => s.exists)
      .map((s) => ({ id: s.id, ...s.data() }));
    res.json({ data });
  } catch (err) { next(err); }
});

app.get("/api/v1/creator/courses", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    assertCreator(auth);
    const snap = await db.collection("courses").where("creator_id", "==", auth.userId).get();
    res.json({ data: snap.docs.map((d) => ({ id: d.id, ...d.data() })) });
  } catch (err) { next(err); }
});

app.patch("/api/v1/users/me/courses/:courseId/version", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    const { courseId } = req.params;
    const body = validateBody<{
      versionId: string;
      completedAt?: string;
      downloaded_version?: string;
      lastUpdated?: string;
    }>({
      versionId: "string",
      completedAt: "optional_string",
      downloaded_version: "optional_string",
      lastUpdated: "optional_string",
    }, req.body);

    const update: Record<string, unknown> = {
      [`courses.${courseId}.update_status`]: body.versionId,
      [`courses.${courseId}.last_version_check`]: FieldValue.serverTimestamp(),
    };
    if (body.downloaded_version !== undefined) {
      update[`courses.${courseId}.downloaded_version`] = body.downloaded_version;
    }
    if (body.lastUpdated !== undefined) {
      update[`courses.${courseId}.lastUpdated`] = body.lastUpdated;
    }

    await db.collection("users").doc(auth.userId).update(update);
    res.json({ data: { updated: true } });
  } catch (err) { next(err); }
});

app.post("/api/v1/users/me/courses/:courseId/trial", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    const { courseId } = req.params;
    const body = validateBody<{
      durationInDays: number;
      title?: string;
      image_url?: string;
      deliveryType?: string;
      discipline?: string;
      creatorName?: string;
    }>({
      durationInDays: "number",
      title: "optional_string",
      image_url: "optional_string",
      deliveryType: "optional_string",
      discipline: "optional_string",
      creatorName: "optional_string",
    }, req.body);

    if (body.durationInDays <= 0) {
      throw apiError("VALIDATION_ERROR", "durationInDays debe ser mayor a 0", 400, "durationInDays");
    }

    const userRef = db.collection("users").doc(auth.userId);
    const userDoc = await userRef.get();
    if (!userDoc.exists) throw apiError("NOT_FOUND", "Usuario no encontrado", 404);

    const userData = userDoc.data()!;
    const trialHistory = (userData.free_trial_history ?? {}) as Record<string, Record<string, unknown>>;
    const existingCourse = (userData.courses ?? {})[courseId] as Record<string, unknown> | undefined;

    if (trialHistory[courseId]?.consumed) {
      throw apiError("CONFLICT", "Trial ya consumido para este curso", 409);
    }

    if (existingCourse?.is_trial) {
      const expiresAt = existingCourse.expires_at as string | undefined;
      if (expiresAt && new Date(expiresAt) > new Date()) {
        throw apiError("CONFLICT", "Ya tienes un trial activo para este curso", 409);
      }
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + body.durationInDays * 24 * 60 * 60 * 1000);

    const courseEntry: Record<string, unknown> = {
      access_duration: `${body.durationInDays}_days_trial`,
      expires_at: expiresAt.toISOString(),
      trial_expires_at: expiresAt.toISOString(),
      trial_started_at: now.toISOString(),
      status: "active",
      is_trial: true,
      trial_duration_days: body.durationInDays,
      trial_state: "active",
      purchased_at: now.toISOString(),
      deliveryType: body.deliveryType ?? "low_ticket",
      title: body.title ?? "",
      image_url: body.image_url ?? null,
      discipline: body.discipline ?? null,
      creatorName: body.creatorName ?? null,
      completedTutorials: {
        dailyWorkout: [],
        warmup: [],
        workoutExecution: [],
        workoutCompletion: [],
      },
    };

    const trialEntry: Record<string, unknown> = {
      consumed: true,
      last_started_at: now.toISOString(),
      last_expires_at: expiresAt.toISOString(),
    };

    await userRef.update({
      [`courses.${courseId}`]: courseEntry,
      [`free_trial_history.${courseId}`]: trialEntry,
    });

    res.json({ data: { started: true } });
  } catch (err) { next(err); }
});

app.post("/api/v1/users/me/courses/:courseId/backfill", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    const { courseId } = req.params;
    const body = (req.body ?? {}) as Record<string, unknown>;

    const userRef = db.collection("users").doc(auth.userId);
    const userDoc = await userRef.get();
    if (!userDoc.exists) { res.json({ data: { backfilled: false } }); return; }

    const userData = userDoc.data()!;
    const coursesMap = (userData.courses ?? {}) as Record<string, unknown>;
    if (coursesMap[courseId]) {
      res.json({ data: { backfilled: false } });
      return;
    }

    const now = new Date();
    const farFuture = new Date(now);
    farFuture.setFullYear(farFuture.getFullYear() + 10);

    const courseEntry: Record<string, unknown> = {
      access_duration: "one_on_one",
      expires_at: farFuture.toISOString(),
      status: "active",
      purchased_at: now.toISOString(),
      deliveryType: "one_on_one",
      assigned_at: now.toISOString(),
      title: body.title ?? "",
      image_url: body.image_url ?? null,
      discipline: body.discipline ?? null,
      creatorName: body.creatorName ?? null,
      completedTutorials: {
        dailyWorkout: [],
        warmup: [],
        workoutExecution: [],
        workoutCompletion: [],
      },
    };

    await userRef.update({
      [`courses.${courseId}`]: courseEntry,
    });

    res.json({ data: { backfilled: true } });
  } catch (err) { next(err); }
});

app.get("/api/v1/sessions/:sessionId/content", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    const { sessionId } = req.params;
    const { courseId, creatorId: queryCreatorId } = req.query as Record<string, string | undefined>;

    const contentSnap = await db.collection("client_session_content").doc(sessionId).get();
    if (contentSnap.exists) {
      const d = contentSnap.data() as Record<string, unknown>;
      const owner = d.userId ?? d.clientUserId ?? d.client_id;
      if (owner && owner !== auth.userId) throw apiError("FORBIDDEN", "No autorizado", 403);
      const exercisesSnap = await db.collection("client_session_content").doc(sessionId)
        .collection("exercises").orderBy("order", "asc").get();
      const exercises = await Promise.all(exercisesSnap.docs.map(async (exDoc) => {
        const setsSnap = await exDoc.ref.collection("sets").orderBy("order", "asc").get();
        return { id: exDoc.id, ...exDoc.data(), sets: setsSnap.docs.map((s) => ({ id: s.id, ...s.data() })) };
      }));
      res.json({ data: { resolvedContent: { id: contentSnap.id, ...d, exercises } } });
      return;
    }

    const clientSessionSnap = await db.collection("client_sessions").doc(sessionId).get();
    if (!clientSessionSnap.exists) {
      res.json({ data: { resolvedContent: null } });
      return;
    }
    const clientSession = clientSessionSnap.data() as Record<string, unknown>;

    if (clientSession.plan_id && clientSession.session_id && clientSession.module_id) {
      const userId = clientSession.client_id as string;
      const planId = clientSession.plan_id as string;
      const weekKey = clientSession.week_key as string | undefined;
      const moduleId = clientSession.module_id as string;
      const planSessionId = clientSession.session_id as string;

      if (weekKey) {
        const docId = `${userId}_${planId}_${weekKey}`;
        const planContentSnap = await db.collection("client_plan_content").doc(docId).get();
        if (planContentSnap.exists) {
          const sessionsSnap = await db.collection("client_plan_content").doc(docId)
            .collection("sessions").orderBy("order", "asc").get();
          const targetSession = sessionsSnap.docs.find((s) => {
            const d = s.data() as Record<string, unknown>;
            return s.id === planSessionId || d.source_session_id === planSessionId;
          });
          if (targetSession) {
            const exSnap = await targetSession.ref.collection("exercises").orderBy("order", "asc").get();
            const exercises = await Promise.all(exSnap.docs.map(async (exDoc) => {
              const setsSnap = await exDoc.ref.collection("sets").orderBy("order", "asc").get();
              return { id: exDoc.id, ...exDoc.data(), sets: setsSnap.docs.map((s) => ({ id: s.id, ...s.data() })) };
            }));
            res.json({ data: { resolvedContent: { id: targetSession.id, ...targetSession.data(), exercises } } });
            return;
          }
        }
      }

      const planSessionRef = db.collection("plans").doc(planId)
        .collection("modules").doc(moduleId)
        .collection("sessions").doc(planSessionId);
      const planSessionSnap = await planSessionRef.get();
      if (planSessionSnap.exists) {
        const exercisesSnap = await planSessionRef.collection("exercises").orderBy("order", "asc").get();
        const exercises = await Promise.all(exercisesSnap.docs.map(async (exDoc) => {
          const setsSnap = await exDoc.ref.collection("sets").orderBy("order", "asc").get();
          return { id: exDoc.id, ...exDoc.data(), sets: setsSnap.docs.map((s) => ({ id: s.id, ...s.data() })) };
        }));
        res.json({ data: { resolvedContent: { id: planSessionSnap.id, ...planSessionSnap.data(), exercises } } });
        return;
      }
    }

    if (clientSession.library_session_ref && clientSession.session_id) {
      const libSessionId = clientSession.session_id as string;
      let effectiveCreatorId = queryCreatorId;
      if (!effectiveCreatorId && courseId) {
        const courseDoc = await db.collection("courses").doc(courseId).get();
        if (courseDoc.exists) {
          const cData = courseDoc.data() as Record<string, unknown>;
          effectiveCreatorId = (cData.creator_id ?? cData.creatorId) as string | undefined;
        }
      }
      if (!effectiveCreatorId) {
        res.json({ data: { resolvedContent: null } });
        return;
      }
      const libSessionRef = db.collection("creator_libraries").doc(effectiveCreatorId)
        .collection("sessions").doc(libSessionId);
      const libSessionSnap = await libSessionRef.get();
      if (!libSessionSnap.exists) { res.json({ data: { resolvedContent: null } }); return; }
      const exercisesSnap = await libSessionRef.collection("exercises").orderBy("order", "asc").get();
      const exercises = await Promise.all(exercisesSnap.docs.map(async (exDoc) => {
        const setsSnap = await exDoc.ref.collection("sets").orderBy("order", "asc").get();
        return { id: exDoc.id, ...exDoc.data(), sets: setsSnap.docs.map((s) => ({ id: s.id, ...s.data() })) };
      }));
      res.json({ data: { resolvedContent: { id: libSessionSnap.id, ...libSessionSnap.data(), exercises } } });
      return;
    }

    res.json({ data: { resolvedContent: null } });
  } catch (err) { next(err); }
});

// ─── Storage ──────────────────────────────────────────────────────────────────

app.get("/api/v1/storage/download-url", async (req, res, next) => {
  try {
    await validateAuth(req);
    const path = req.query.path as string | undefined;
    if (!path) throw apiError("VALIDATION_ERROR", "path is required", 400, "path");
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
    let url: string;
    try {
      [url] = await admin.storage().bucket().file(path).getSignedUrl({
        version: "v4",
        action: "read",
        expires: expiresAt,
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      functions.logger.error("getSignedUrl failed", { error: msg });
      throw apiError("INTERNAL_ERROR", "Storage signing failed", 500);
    }
    res.json({ data: { url } });
  } catch (err) { next(err); }
});

// ─── Global error handler (must be last) ─────────────────────────────────────

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (err instanceof WakeApiServerError) {
    const body: Record<string, unknown> = { error: { code: err.code, message: err.message } };
    if (err.field) (body.error as Record<string, unknown>).field = err.field;
    if (err.status === 429 && err.retryAfter) res.setHeader("Retry-After", String(err.retryAfter));
    res.status(err.status).json(body);
    return;
  }
  functions.logger.error("Unhandled API error", err);
  res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Unexpected server error" } });
});

// ─── Export ───────────────────────────────────────────────────────────────────

export const api = onRequest(
  {
    region: "us-central1",
    memory: "256MiB",
    timeoutSeconds: 60,
    minInstances: 1,
    concurrency: 80,
    secrets: [
      "WAKE_WEB_API_KEY",
      "FATSECRET_CLIENT_ID",
      "FATSECRET_CLIENT_SECRET",
      "MERCADOPAGO_ACCESS_TOKEN",
      "MERCADOPAGO_WEBHOOK_SECRET",
    ],
  },
  app
);
