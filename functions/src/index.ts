/**
 * Firebase Cloud Functions v1 + Gen2 API
 */

import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import * as crypto from "node:crypto";
import type {Request, Response} from "express";
import {Preference, Payment, PreApproval} from "mercadopago";
import {Resend} from "resend";
import {onRequest} from "firebase-functions/v2/https";
import {onSchedule} from "firebase-functions/v2/scheduler";
import {defineSecret} from "firebase-functions/params";
import * as webpush from "web-push";
import "./init.js";
import {app} from "./api/app.js";
import {runLogsDigest} from "./ops/logsDigest.js";
import {runCronHeartbeat} from "./ops/cronHeartbeat.js";
import {runPaymentsPulse} from "./ops/paymentsPulse.js";
import {runQuotaWatch} from "./ops/quotaWatch.js";
import {runClientErrors} from "./ops/clientErrors.js";
import {handleClientErrorsIngest} from "./ops/clientErrorsIngest.js";
import {handleOpsApi} from "./ops/opsApi.js";
import {handleSignalsWebhook} from "./ops/signalsWebhook.js";
import {handleAgentWebhook} from "./ops/agentWebhook.js";
import {dispatchMention} from "./ops/agentDispatch.js";
import {runSynthesis} from "./ops/agentSynthesis.js";
import {handleGithubWebhook} from "./ops/githubWebhook.js";
import {parseTopicMap} from "./ops/telegram.js";
import {
  type ParsedReference,
  type MercadoPagoPreapproval,
  buildExternalReference as sharedBuildExternalReference,
  parseExternalReference as sharedParseExternalReference,
  calculateExpirationDate as sharedCalculateExpirationDate,
  classifyError as sharedClassifyError,
  getClient as sharedGetClient,
  toErrorMessage as sharedToErrorMessage,
} from "./api/services/paymentHelpers.js";
import {assignCourseToUser} from "./api/services/courseAssignment.js";
import {assignBundleToUser} from "./api/services/bundleAssignment.js";
import {escapeHtml as sharedEscapeHtml} from "./api/services/emailHelpers.js";

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
// Accepted gap: in-memory rate limiting is ineffective in Cloud Functions
// because each instance has its own empty Map, instances cold-start frequently,
// and horizontal scaling means requests hit different instances. This provides
// minimal protection. A Firestore-based rate limiter (like api/middleware/rateLimit.ts)
// would be correct, but these Gen1 functions are being retired in Phase 3
// migration, so the effort is not justified. The Gen2 API already uses
// Firestore-based rate limiting.
const rateLimitStore = new Map<string, {count: number; resetAt: number}>();

function checkRateLimit(key: string): boolean {
  const now = Date.now();
  const window = 60_000;
  const max = 10;
  const entry = rateLimitStore.get(key);
  if (!entry || now >= entry.resetAt) {
    rateLimitStore.set(key, {count: 1, resetAt: now + window});
    return true;
  }
  if (entry.count >= max) {
    return false;
  }
  entry.count += 1;
  return true;
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

// ─── Shared helpers (delegated to api/services/) ─────────────────────────────
const getClient = () => sharedGetClient(mercadopagoAccessToken.value());
const buildExternalReference = sharedBuildExternalReference;
const parseExternalReference = sharedParseExternalReference;
const classifyError = sharedClassifyError;
const toErrorMessage = sharedToErrorMessage;
function calculateExpirationDate(
  accessDuration: string,
  options: {from?: string} = {}
): string {
  return sharedCalculateExpirationDate(accessDuration, options.from);
}


// ─── App Check helper ─────────────────────────────────────────────────────────
// Note: Gen1 functions **require** App Check (verifyAppCheck returns false when
// header is missing, causing 401). Gen2 auth middleware treats App Check as
// **optional** (only verified if header is present). This inconsistency is
// intentional during migration — Gen1 clients always send the header, while
// Gen2 also serves third-party API-key clients that never will. Align behavior
// when Gen1 functions are retired.
async function verifyAppCheck(request: Request): Promise<boolean> {
  const token = request.headers["x-firebase-appcheck"] as string | undefined;
  if (!token) return false;
  try {
    await admin.appCheck().verifyToken(token);
    return true;
  } catch {
    return false;
  }
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

function sendAppCheckError(res: Response): void {
  res.status(401).json({
    error: {code: "UNAUTHENTICATED", message: "App Check token inválido"},
  });
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


// Create unique payment preference
export const createPaymentPreference = functions
  .runWith({secrets: [mercadopagoAccessToken]})
  .https.onRequest(async (request, response) => {
    response.set("Access-Control-Allow-Origin", "*");
    response.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    response.set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Firebase-AppCheck");

    if (request.method === "OPTIONS") {
      response.status(204).send("");
      return;
    }

    if (!(await verifyAppCheck(request))) {
      sendAppCheckError(response);
      return;
    }

    const userId = await verifyGen1Auth(request);
    if (!userId) {
      sendAuthError(response);
      return;
    }

    if (!checkRateLimit(userId)) {
      sendRateLimitError(response);
      return;
    }

    const {courseId} = request.body || {};

    if (!isValidCourseId(courseId)) {
      response.status(400).json({
        error: {code: "VALIDATION_ERROR", message: "courseId inválido", field: "courseId"},
      });
      return;
    }

    try {
      const courseDoc = await db.collection("courses").doc(courseId).get();
      const course = courseDoc.data();

      if (!course) {
        response.status(404).json({
          error: {code: "NOT_FOUND", message: "Curso no encontrado"},
        });
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
          back_urls: {
            success: `https://wolf-20b8b.web.app/app/course/${courseId}`,
            failure: `https://wolf-20b8b.web.app/app/course/${courseId}`,
            pending: `https://wolf-20b8b.web.app/app/course/${courseId}`,
          },
          auto_return: "approved",
        },
      });

      functions.logger.info("Payment preference created", {
        userId,
        courseId,
        externalReference,
      });

      response.json({data: {init_point: result.init_point}});
    } catch (error: unknown) {
      functions.logger.error("createPaymentPreference error", error);
      response.status(500).json({
        error: {code: "INTERNAL_ERROR", message: "Error al crear la preferencia de pago"},
      });
    }
  });

// Create subscription dynamically (without pre-created plan)
export const createSubscriptionCheckout = functions
  .runWith({secrets: [mercadopagoAccessToken]})
  .https.onRequest(async (request, response) => {
    response.set("Access-Control-Allow-Origin", "*");
    response.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    response.set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Firebase-AppCheck");

    if (request.method === "OPTIONS") {
      response.status(204).send("");
      return;
    }

    if (!(await verifyAppCheck(request))) {
      sendAppCheckError(response);
      return;
    }

    const userId = await verifyGen1Auth(request);
    if (!userId) {
      sendAuthError(response);
      return;
    }

    if (!checkRateLimit(userId)) {
      sendRateLimitError(response);
      return;
    }

    const {courseId, payer_email: payerEmail} = request.body || {};

    if (!isValidCourseId(courseId)) {
      response.status(400).json({
        error: {code: "VALIDATION_ERROR", message: "courseId inválido", field: "courseId"},
      });
      return;
    }

    if (!payerEmail || !isValidEmail(payerEmail)) {
      response.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          message: "Se requiere un email de pago válido",
          field: "payer_email",
        },
      });
      return;
    }

    try {
      const courseDoc = await db.collection("courses").doc(courseId).get();
      const course = courseDoc.data();

      if (!course) {
        response.status(404).json({
          error: {code: "NOT_FOUND", message: "Curso no encontrado"},
        });
        return;
      }

      if (!course.price) {
        response.status(400).json({
          error: {code: "VALIDATION_ERROR", message: "Precio del curso no encontrado"},
        });
        return;
      }

      const userDoc = await db.collection("users").doc(userId).get();

      if (!userDoc.exists) {
        response.status(404).json({
          error: {code: "NOT_FOUND", message: "Usuario no encontrado"},
        });
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
        functions.logger.info("Subscription created", {
          init_point: result.init_point,
          subscription_id: result.id,
          external_reference: externalRef,
        });

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
      response.status(500).json({
        error: {code: "INTERNAL_ERROR", message: "No se pudo crear el enlace de pago"},
      });
    } catch (error: unknown) {
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
        response.status(409).json({
          error: {
            code: "CONFLICT",
            message: "Por favor ingresa tu correo de Mercado Pago",
          },
          requireAlternateEmail: true,
        });
        return;
      }

      response.status(500).json({
        error: {code: "INTERNAL_ERROR", message: "Error al crear la suscripción"},
      });
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

        // Reject replayed webhooks: timestamp must be within 5 minutes of now
        const tsMs = Number(timestamp) * 1000;
        if (isNaN(tsMs) || Math.abs(Date.now() - tsMs) > 300_000) {
          functions.logger.warn("Webhook timestamp too old or invalid", {
            timestamp,
            ageMs: isNaN(tsMs) ? "NaN" : Date.now() - tsMs,
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
      const alreadyProcessed = await db.runTransaction(async (transaction: admin.firestore.Transaction) => {
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

      const {userId, paymentType} = parsedReference;
      const isSubscription = paymentType === "sub" || paymentType === "bundle-sub";
      const isBundle = paymentType === "bundle-otp" || paymentType === "bundle-sub";

      if (isSubscription && webhookType !== "subscription_authorized_payment" && webhookType !== "payment") {
        functions.logger.warn("Subscription reference received on unexpected webhook type", {
          webhookType,
          paymentId,
          externalReference,
        });
      }

      functions.logger.info("Processing approved payment", {
        paymentId,
        userId,
        courseId: parsedReference.courseId ?? null,
        bundleId: parsedReference.bundleId ?? null,
        isSubscription,
        paymentType,
      });

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

      const subscriptionIdForBundle =
        paymentData?.subscription_id || paymentData?.preapproval_id || null;

      // ── Bundle branch ──
      if (isBundle) {
        const bundleId = parsedReference.bundleId!;
        const bundleDoc = await db.collection("bundles").doc(bundleId).get();
        if (!bundleDoc.exists) {
          functions.logger.error("Bundle not found:", bundleId);
          await processedPaymentsRef.set({
            processed_at: admin.firestore.FieldValue.serverTimestamp(),
            status: "error",
            error_type: "bundle_not_found",
            error_message: "Bundle not found",
            userId,
            payment_type: paymentType,
          });
          response.status(200).send("OK");
          return;
        }

        const existingCourses = (userData.courses ?? {}) as Record<string, Record<string, unknown>>;
        const hasPriorBundleGrant = Object.values(existingCourses).some(
          (entry) => entry.bundleId === bundleId && entry.status === "active"
        );
        const isBundleRenewal = hasPriorBundleGrant && isSubscription;

        let accessDuration: string | undefined;
        if (isSubscription && subscriptionIdForBundle) {
          const subDoc = await db.collection("users").doc(userId)
            .collection("subscriptions").doc(subscriptionIdForBundle).get();
          accessDuration = subDoc.exists ?
            (subDoc.data()!.access_duration as string | undefined) :
            undefined;
        }
        if (!accessDuration) {
          const metadata = (paymentData?.metadata && typeof paymentData.metadata === "object") ?
            paymentData.metadata as Record<string, unknown> :
            {};
          accessDuration = (metadata.access_duration as string | undefined) ?? "monthly";
        }

        try {
          const result = await assignBundleToUser({
            userId,
            bundleId,
            accessDuration,
            paymentId,
            subscriptionId: subscriptionIdForBundle,
            isRenewal: isBundleRenewal,
          });

          if (isSubscription && subscriptionIdForBundle) {
            await db.collection("users").doc(userId)
              .collection("subscriptions").doc(subscriptionIdForBundle).set({
                status: "authorized",
                last_payment_id: paymentId,
                last_payment_date:
                  paymentData.date_approved || paymentData.date_created || new Date().toISOString(),
                transaction_amount: paymentData.transaction_amount || null,
                currency_id: paymentData.currency_id || null,
                management_url:
                  `https://www.mercadopago.com.co/subscriptions/management?preapproval_id=${subscriptionIdForBundle}`,
                updated_at: admin.firestore.FieldValue.serverTimestamp(),
              }, {merge: true});
          }

          await processedPaymentsRef.set({
            processed_at: admin.firestore.FieldValue.serverTimestamp(),
            status: "approved",
            userId,
            bundleId,
            courseIds: result.courseIdsGranted,
            isSubscription,
            isRenewal: isBundleRenewal,
            payment_type: paymentType,
            userEmail,
            userName,
            bundleTitle: result.bundleTitle,
            state: "completed",
            amount: paymentData.transaction_amount ??
              paymentData.transaction_details?.total_paid_amount ?? null,
            currency_id: paymentData.currency_id ?? null,
          });
        } catch (bundleError) {
          functions.logger.error("Bundle assignment failed", bundleError);
          const errType = classifyError(bundleError);
          if (errType === "RETRYABLE") {
            response.status(500).send("Error");
            return;
          }
          await processedPaymentsRef.set({
            processed_at: admin.firestore.FieldValue.serverTimestamp(),
            status: "error",
            error_type: "bundle_assignment_failed",
            error_message: toErrorMessage(bundleError),
            userId, bundleId, payment_type: paymentType,
          });
        }

        response.status(200).send("OK");
        return;
      }

      const courseId = parsedReference.courseId!;

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

      // Check if user already owns course
      const userCourses = userData?.courses || {};
      const existingCourseData = userCourses[courseId];
      const existingPurchase =
        existingCourseData?.status === "active" &&
        new Date(existingCourseData.expires_at) > new Date();
      const isRenewal = existingPurchase && isSubscription;

      const subscriptionId =
        paymentData?.subscription_id || paymentData?.preapproval_id || null;

      // ── Renewal ──
      if (isRenewal) {
        functions.logger.info("Subscription renewal detected:", userId, courseId);

        const currentExpiration = existingCourseData?.expires_at ?? undefined;
        let expirationDate: string;
        try {
          expirationDate = calculateExpirationDate(courseAccessDuration, {
            from: currentExpiration,
          });
        } catch {
          functions.logger.warn("Invalid expires_at on renewal, falling back to now", {
            userId, courseId, currentExpiration,
          });
          expirationDate = calculateExpirationDate(courseAccessDuration);
        }

        await assignCourseToUser(userId, courseId, courseDetails || {}, expirationDate, {
          isRenewal: true,
          existingCourseData,
        });

        if (isSubscription && subscriptionId) {
          await db
            .collection("users").doc(userId)
            .collection("subscriptions").doc(subscriptionId)
            .set({
              status: "authorized",
              last_payment_id: paymentId,
              last_payment_date: paymentData.date_approved || paymentData.date_created || new Date().toISOString(),
              updated_at: admin.firestore.FieldValue.serverTimestamp(),
            }, {merge: true});
        }

        await processedPaymentsRef.set({
          processed_at: admin.firestore.FieldValue.serverTimestamp(),
          status: "approved", userId, courseId, isSubscription: true, isRenewal: true,
          payment_type: paymentType, userEmail, userName, courseTitle, state: "completed",
          amount: paymentData.transaction_amount ?? paymentData.transaction_details?.total_paid_amount ?? null,
          currency_id: paymentData.currency_id ?? null,
        });

        response.status(200).send("OK");
        return;
      }

      // ── Already owned (one-time duplicate) ──
      if (existingPurchase && !isSubscription) {
        functions.logger.info("User already owns course, skipping:", userId, courseId);
        await processedPaymentsRef.set({
          processed_at: admin.firestore.FieldValue.serverTimestamp(),
          status: "already_owned", userId, courseId, userEmail, userName,
          courseTitle, state: "already_owned", payment_type: paymentType,
        });
        response.status(200).send("OK");
        return;
      }

      // ── New purchase ──
      if (!courseAccessDuration) {
        functions.logger.error("Course missing access_duration:", courseId);
        await processedPaymentsRef.set({
          processed_at: admin.firestore.FieldValue.serverTimestamp(),
          status: "error", error_type: "missing_access_duration",
          error_message: "Course missing access_duration",
          userId, courseId, userEmail, userName, courseTitle,
          state: "failed", payment_type: paymentType,
        });
        response.status(200).send("OK");
        return;
      }

      const expirationDate = calculateExpirationDate(courseAccessDuration);

      await db.runTransaction(async (transaction: admin.firestore.Transaction) => {
        await assignCourseToUser(userId, courseId, courseDetails || {}, expirationDate, {
          transaction,
        });

        if (isSubscription && subscriptionId) {
          transaction.set(
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
            {merge: true}
          );
        }

        transaction.set(
          processedPaymentsRef,
          {
            processed_at: admin.firestore.FieldValue.serverTimestamp(),
            status: "approved", userId, courseId, isSubscription, isRenewal: false,
            payment_type: paymentType, userEmail, userName, courseTitle, state: "completed",
            amount: paymentData.transaction_amount ?? paymentData.transaction_details?.total_paid_amount ?? null,
            currency_id: paymentData.currency_id ?? null,
          },
          {merge: true}
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
      }
    }
  });

export const updateSubscriptionStatus = functions
  .runWith({secrets: [mercadopagoAccessToken]})
  .https.onRequest(async (request, response) => {
    response.set("Access-Control-Allow-Origin", "*");
    response.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    response.set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Firebase-AppCheck");

    if (request.method === "OPTIONS") {
      response.status(204).send("");
      return;
    }

    if (request.method !== "POST") {
      response.status(405).json({error: {code: "VALIDATION_ERROR", message: "Method not allowed"}});
      return;
    }

    if (!(await verifyAppCheck(request))) {
      sendAppCheckError(response);
      return;
    }

    const userId = await verifyGen1Auth(request);
    if (!userId) {
      sendAuthError(response);
      return;
    }

    if (!checkRateLimit(userId)) {
      sendRateLimitError(response);
      return;
    }

    try {
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
            undefined;

          const courseTitle =
            survey?.courseTitle ??
            subscriptionData?.course_title ??
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
      functions.logger.error("Error updating subscription status:", error);
      response.status(500).json({
        error: {code: "INTERNAL_ERROR", message: "Error al actualizar la suscripción"},
      });
    }
  });


/**
 * Lookup user by email or username for creator invite (one-on-one client add).
 * Only creators can call this. Returns user info for confirmation before enrollment.
 */
export const lookupUserForCreatorInvite = functions.https.onCall(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async (data: any, context: functions.https.CallableContext) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "Debes iniciar sesión para buscar usuarios"
      );
    }

    const creatorId = context.auth.uid;
    const {emailOrUsername} = data || {};

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
    const role = creatorDoc.exists ?
      (creatorDoc.data()?.role as string | undefined) :
      undefined;
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
      } catch {
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

    // Enrich from Firestore only if found via Auth email lookup (username path already has the doc)
    if (userId && !userDocData) {
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
          typeof raw === "object" && raw?.toDate ?
            raw.toDate() :
            new Date(raw as string);
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
        h != null && (typeof h === "number" || typeof h === "string") ?
          h :
          null;
      const w = d.bodyweight ?? d.weight;
      weight =
        w != null && (typeof w === "number" || typeof w === "string") ?
          w :
          null;
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
// Accepted risk: Nutrition proxies only require App Check — no Firebase Auth.
// Any client with a valid App Check token can query FatSecret without being
// logged in. The only abuse protection is the in-memory rate limiter, which
// is ineffective (see note above). Adding Firebase Auth would break the
// current client flow. These Gen1 functions will be retired when the Gen2
// /nutrition/* API routes are fully migrated — those require Firebase Auth.

const FATSECRET_TOKEN_BUFFER_MS = 5 * 60 * 1000; // refresh 5 min before expiry
const fatSecretTokenCache = new Map<
  string,
  { token: string; expiresAt: number }
>();

async function getFatSecretToken(
  clientId: string,
  clientSecret: string,
  scope = "basic"
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
  fatSecretTokenCache.set(scope, {token: data.access_token, expiresAt});
  return data.access_token;
}

function setNutritionCors(res: Response): void {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type, X-Firebase-AppCheck");
}

const nutritionRunOptions: functions.RuntimeOptions = {
  secrets: [fatSecretClientId, fatSecretClientSecret],
};

/* eslint-disable camelcase -- FatSecret API wire format requires snake_case keys */
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

    if (!(await verifyAppCheck(request))) {
      sendAppCheckError(response);
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
          "Authorization": `Bearer ${token}`,
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

    if (!(await verifyAppCheck(request))) {
      sendAppCheckError(response);
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
          "Authorization": `Bearer ${token}`,
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
/* eslint-enable camelcase */

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

    if (!(await verifyAppCheck(request))) {
      sendAppCheckError(response);
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
      if (!isValidBarcode(barcode)) {
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
          "Authorization": `Bearer ${token}`,
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
export const onUserCreated = functions.auth.user().onCreate(async (user: admin.auth.UserRecord) => {
  try {
    const docRef = db.collection("users").doc(user.uid);
    const existing = await docRef.get();

    // If the doc already exists (e.g. /creator/register ran first), only fill
    // in missing fields — never overwrite role or other data set by registration.
    if (existing.exists) {
      const data = existing.data() || {};
      const patch: Record<string, unknown> = {};
      if (!data.email) patch.email = user.email ?? null;
      if (!data.displayName) patch.displayName = user.displayName ?? null;
      if (!data.created_at) patch.created_at = admin.firestore.FieldValue.serverTimestamp();
      if (Object.keys(patch).length > 0) {
        await docRef.update(patch);
      }
      functions.logger.info("onUserCreated: doc already existed, patched missing fields", {uid: user.uid});
      return;
    }

    // No doc yet — bootstrap with role: "user"
    await docRef.set({
      role: "user",
      email: user.email ?? null,
      displayName: user.displayName ?? null,
      created_at: admin.firestore.FieldValue.serverTimestamp(),
    });
    functions.logger.info("onUserCreated: bootstrapped user doc", {uid: user.uid});
  } catch (error) {
    functions.logger.error("onUserCreated: failed to bootstrap user doc", {
      uid: user.uid,
      error: toErrorMessage(error),
    });
  }
});

const escapeHtml = sharedEscapeHtml;

// ─── sendEventConfirmationEmail ────────────────────────────────────────────
// Fires on every new registration and sends an HTML email with the event
// title, a personalised greeting, and a QR code the attendee can use for
// check-in. Requires RESEND_API_KEY secret and the event to have
// settings.confirmation_email set to a "from" address (e.g. "Wake Events
// <events@wakelab.co>").
export const sendEventConfirmationEmail = functions
  .runWith({secrets: ["RESEND_API_KEY"]})
  .firestore.document("event_signups/{eventId}/registrations/{regId}")
  .onCreate(async (snap: functions.firestore.QueryDocumentSnapshot, context: functions.EventContext) => {
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
    const eventTitleRaw = (event.title as string) ?? "Evento Wake";
    const eventTitle = escapeHtml(eventTitleRaw);
    const confirmationMsg = escapeHtml(
      ((event.settings as Record<string, unknown>)?.confirmation_message as string | undefined) ??
        "¡Tu lugar está confirmado! Nos vemos en el evento."
    );
    const checkInToken = reg.check_in_token as string | undefined;
    const eventImageUrl = escapeHtml((event.image_url as string | undefined) ?? "");

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

    const greeting = firstName ? `¡Hola, ${escapeHtml(firstName)}!` : "¡Hola!";

    // QR code image URL (api.qrserver.com, no server-side dependency)
    const qrData = checkInToken ?
      encodeURIComponent(JSON.stringify({eventId, token: checkInToken})) :
      encodeURIComponent(regId);
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
        subject: `Confirmación: ${eventTitleRaw}`,
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

// ─── VAPID keys for web push ──────────────────────────────────────────────
const vapidPublicKey = defineSecret("VAPID_PUBLIC_KEY");
const vapidPrivateKey = defineSecret("VAPID_PRIVATE_KEY");

// ─── Scheduled: process rest timer notifications every 1 minute ───────────
export const processRestTimerNotifications = onSchedule(
  {
    schedule: "every 1 minutes",
    region: "us-central1",
    secrets: [vapidPublicKey, vapidPrivateKey],
  },
  async () => {
    const now = admin.firestore.Timestamp.now();
    const windowEnd = admin.firestore.Timestamp.fromMillis(
      now.toMillis() + 30_000
    );

    const pendingSnap = await db
      .collection("workout_timers")
      .where("status", "==", "pending")
      .where("endAt", "<=", windowEnd)
      .get();

    if (pendingSnap.empty) return;

    const pub = vapidPublicKey.value().trim().replace(/=+$/, "");
    const priv = vapidPrivateKey.value().trim().replace(/=+$/, "");
    if (!pub || !priv) {
      functions.logger.error("VAPID keys not configured");
      return;
    }

    webpush.setVapidDetails("mailto:soporte@wakelab.co", pub, priv);

    for (const timerDoc of pendingSnap.docs) {
      const timer = timerDoc.data();
      const userId = timer.userId as string;
      const metadata = (timer.metadata || {}) as Record<string, unknown>;
      const exerciseName = (metadata.exerciseName as string) || "tu ejercicio";

      const subsSnap = await db
        .collection("users")
        .doc(userId)
        .collection("web_push_subscriptions")
        .where("isActive", "==", true)
        .get();

      const payload = JSON.stringify({
        title: "Descanso terminado",
        body: `Vuelve a ${exerciseName}`,
      });

      const deactivateIds: string[] = [];

      await Promise.all(
        subsSnap.docs.map(async (subDoc) => {
          const sub = subDoc.data();
          try {
            await webpush.sendNotification(
              {endpoint: sub.endpoint, keys: sub.keys},
              payload
            );
          } catch (err: unknown) {
            const status = (err as { statusCode?: number }).statusCode;
            if (status === 410 || status === 404) {
              deactivateIds.push(subDoc.id);
            }
          }
        })
      );

      // Mark timer as sent
      await timerDoc.ref.update({status: "sent"});

      // Deactivate expired subscriptions
      if (deactivateIds.length > 0) {
        const batch = db.batch();
        for (const id of deactivateIds) {
          batch.update(
            db.collection("users").doc(userId)
              .collection("web_push_subscriptions").doc(id),
            {isActive: false}
          );
        }
        await batch.commit();
      }
    }

    functions.logger.info(
      `Processed ${pendingSnap.size} rest timer notification(s)`
    );
  }
);

// ─── sendVideoExchangeNotification ────────────────────────────────────────
// Fires on every new message in video_exchanges/*/messages/*.
// Notifies the OTHER party (coach on client submission, client on coach
// response) via web-push and email. Reads recipient from the parent
// video_exchange doc; stays silent on missing email / no push subs.
export const sendVideoExchangeNotification = functions
  .runWith({secrets: ["RESEND_API_KEY", "VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY"]})
  .firestore.document("video_exchanges/{exchangeId}/messages/{messageId}")
  .onCreate(async (snap: functions.firestore.QueryDocumentSnapshot, context: functions.EventContext) => {
    const {exchangeId, messageId} = context.params;
    const msg = snap.data() as Record<string, unknown>;
    const senderRole = msg.senderRole as string;
    if (senderRole !== "client" && senderRole !== "creator") {
      functions.logger.warn("sendVideoExchangeNotification: unknown senderRole, skipping", {exchangeId, messageId});
      return null;
    }

    const exchangeSnap = await db.doc(`video_exchanges/${exchangeId}`).get();
    if (!exchangeSnap.exists) {
      functions.logger.warn("sendVideoExchangeNotification: exchange not found", {exchangeId});
      return null;
    }
    const exchange = exchangeSnap.data() as Record<string, unknown>;

    const recipientUserId = senderRole === "client" ?
      (exchange.creatorId as string) :
      (exchange.clientId as string);
    const senderUserId = senderRole === "client" ?
      (exchange.clientId as string) :
      (exchange.creatorId as string);

    if (!recipientUserId) {
      functions.logger.warn("sendVideoExchangeNotification: no recipient", {exchangeId});
      return null;
    }

    const exerciseName = (exchange.exerciseName as string) || "tu entrenamiento";
    const isToCoach = senderRole === "client";

    let senderName = isToCoach ? "tu cliente" : "tu coach";
    try {
      const senderUser = await db.doc(`users/${senderUserId}`).get();
      if (senderUser.exists) {
        const d = senderUser.data() as Record<string, unknown>;
        const dn = (d.displayName as string) || "";
        if (dn.trim()) senderName = dn.trim();
      }
    } catch (err: unknown) {
      functions.logger.warn("sendVideoExchangeNotification: failed to load sender", {err: toErrorMessage(err)});
    }

    // ─── Web push ───────────────────────────────────────────────────────
    try {
      const pub = vapidPublicKey.value().trim().replace(/=+$/, "");
      const priv = vapidPrivateKey.value().trim().replace(/=+$/, "");
      if (pub && priv) {
        webpush.setVapidDetails("mailto:soporte@wakelab.co", pub, priv);

        const subsSnap = await db
          .collection("users")
          .doc(recipientUserId)
          .collection("web_push_subscriptions")
          .where("isActive", "==", true)
          .get();

        if (!subsSnap.empty) {
          const title = isToCoach ?
            `Nuevo video de ${senderName}` :
            "Tu coach respondió tu video";
          const body = isToCoach ?
            `${exerciseName} — toca para revisar` :
            `${exerciseName} — toca para ver la respuesta`;
          const payload = JSON.stringify({
            title,
            body,
            url: isToCoach ? "/creators/inbox" : "/app",
          });

          const deactivateIds: string[] = [];
          await Promise.all(
            subsSnap.docs.map(async (subDoc) => {
              const sub = subDoc.data();
              try {
                await webpush.sendNotification(
                  {endpoint: sub.endpoint as string, keys: sub.keys as {p256dh: string; auth: string}},
                  payload
                );
              } catch (err: unknown) {
                const status = (err as { statusCode?: number }).statusCode;
                if (status === 410 || status === 404) deactivateIds.push(subDoc.id);
              }
            })
          );
          if (deactivateIds.length > 0) {
            const batch = db.batch();
            for (const id of deactivateIds) {
              batch.update(
                db.collection("users").doc(recipientUserId)
                  .collection("web_push_subscriptions").doc(id),
                {isActive: false}
              );
            }
            await batch.commit();
          }
        }
      }
    } catch (err: unknown) {
      functions.logger.error("sendVideoExchangeNotification: push failed", {exchangeId, messageId, error: toErrorMessage(err)});
    }

    // ─── Email ──────────────────────────────────────────────────────────
    try {
      const recipientUser = await db.doc(`users/${recipientUserId}`).get();
      if (!recipientUser.exists) return null;
      const toEmail = (recipientUser.data()?.email as string) || null;
      if (!toEmail) {
        functions.logger.info("sendVideoExchangeNotification: recipient has no email, skipping email", {recipientUserId});
        return null;
      }

      const fromAddress = "Wake <no-reply@wakelab.co>";
      const ctaUrl = isToCoach ? "https://wakelab.co/creators/inbox" : "https://wakelab.co/app";
      const subject = isToCoach ?
        `Nuevo video de ${senderName}` :
        `${senderName} respondió tu video`;
      const greeting = isToCoach ? "¡Nuevo video por revisar!" : "¡Tu coach respondió!";
      const intro = isToCoach ?
        `${escapeHtml(senderName)} te envió un video de <strong>${escapeHtml(exerciseName)}</strong>.` :
        `${escapeHtml(senderName)} respondió tu video de <strong>${escapeHtml(exerciseName)}</strong>.`;
      const ctaLabel = isToCoach ? "Ver bandeja de videos" : "Ver respuesta";

      const html = `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#1a1a1a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#fff;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#1a1a1a;padding:40px 0;">
    <tr><td align="center">
      <table width="480" cellpadding="0" cellspacing="0" style="max-width:480px;border-radius:18px;overflow:hidden;border:1px solid rgba(255,255,255,0.08);background:#1e1e1e;">
        <tr><td style="padding:48px 36px 28px;text-align:center;">
          <p style="margin:0 0 16px;font-size:0.7rem;letter-spacing:0.14em;text-transform:uppercase;color:rgba(255,255,255,0.5);">Wake</p>
          <h1 style="margin:0 0 14px;font-size:1.6rem;font-weight:800;color:#fff;line-height:1.25;">${greeting}</h1>
          <p style="margin:0 0 28px;font-size:0.98rem;color:rgba(255,255,255,0.78);line-height:1.55;">${intro}</p>
          <a href="${ctaUrl}" style="display:inline-block;background:#fff;color:#1a1a1a;padding:12px 28px;border-radius:999px;font-weight:700;text-decoration:none;font-size:0.95rem;">${ctaLabel}</a>
        </td></tr>
        <tr><td style="padding:8px 36px 28px;text-align:center;border-top:1px solid rgba(255,255,255,0.06);">
          <p style="margin:0;font-size:0.75rem;color:rgba(255,255,255,0.22);">Enviado automáticamente por Wake · <a href="https://wakelab.co" style="color:rgba(255,255,255,0.22);text-decoration:none;">wakelab.co</a></p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

      const resend = new Resend(resendApiKey.value());
      const {error: resendError} = await resend.emails.send({
        from: fromAddress,
        to: toEmail,
        subject,
        html,
        headers: {"X-Entity-Ref-ID": `${exchangeId}-${messageId}`},
      });
      if (resendError) {
        functions.logger.error("sendVideoExchangeNotification: resend error", {exchangeId, messageId, error: resendError});
      } else {
        functions.logger.info("sendVideoExchangeNotification: email sent", {exchangeId, messageId, toEmail});
      }
    } catch (err: unknown) {
      functions.logger.error("sendVideoExchangeNotification: email failed", {exchangeId, messageId, error: toErrorMessage(err)});
    }

    return null;
  });

// ─── Scheduled: process email send queue every 1 minute ─────────────────
//
// Uses the Resend batch API (up to 100 emails per API call) so we stay under
// the 5 req/sec rate limit automatically. Each tick processes up to
// MAX_BATCHES_PER_TICK batches per send doc, draining large sends quickly.
//
// Retry behavior: transient Resend errors (rate limit, quota, timeout, 5xx,
// network) keep the recipient in "pending" state with attemptCount++ and a
// nextRetryAt timestamp. On the next tick where nextRetryAt <= now, the
// recipient is retried. After MAX_ATTEMPTS total attempts, the recipient is
// marked "failed" permanently.
//
// Permanent errors (validation, invalid email, unauthorized, sender-not-
// verified) skip retries and go straight to "failed".
//
// Future improvement (not done per user request): move the broadcast sender
// to a separate subdomain like broadcasts.wakelab.co so marketing reputation
// is isolated from apex transactional reputation. Requires DNS verification
// in Resend; skipped to avoid extra ops work.

const RETRY_BACKOFF_MINUTES = [2, 5, 15, 60]; // entries[i] = wait after attempt i
const MAX_ATTEMPTS = RETRY_BACKOFF_MINUTES.length + 1; // first attempt + 4 retries = 5
const BATCH_SIZE = 100; // Resend batch API max
const PENDING_FETCH_LIMIT = 200; // oversample so we can filter out in-backoff docs
const MAX_BATCHES_PER_TICK = 5; // bounds tick duration; 500 emails/tick/send

type TransientOrPermanent = "transient" | "permanent";

function classifyResendError(message: string | null | undefined): TransientOrPermanent {
  if (!message) return "transient";
  const m = message.toLowerCase();
  // Clearly permanent — retrying won't help
  if (m.includes("validation")) return "permanent";
  if (m.includes("invalid") && (m.includes("email") || m.includes("address") || m.includes("from"))) {
    return "permanent";
  }
  if (m.includes("not verified") || m.includes("domain is not verified")) return "permanent";
  if (m.includes("forbidden") || m.includes("unauthorized") || m.includes("api key")) {
    return "permanent";
  }
  if (m.includes("not found")) return "permanent";
  // Clearly transient — worth retrying
  if (m.includes("rate") || m.includes("too many")) return "transient";
  if (m.includes("quota")) return "transient";
  if (m.includes("timeout") || m.includes("timed out")) return "transient";
  if (m.includes("temporarily")) return "transient";
  if (m.includes("network")) return "transient";
  if (/\b5\d\d\b/.test(m)) return "transient"; // 500, 502, 503, etc.
  // Default: retry. Better to try again than lose a valid email on an
  // unexpected error message we haven't seen before.
  return "transient";
}

function computeNextRetryAt(attemptCount: number): admin.firestore.Timestamp {
  // attemptCount is the number of attempts *already made* (post-increment).
  // RETRY_BACKOFF_MINUTES[0] is the wait after the 1st attempt, etc.
  const idx = Math.min(attemptCount - 1, RETRY_BACKOFF_MINUTES.length - 1);
  const minutes = RETRY_BACKOFF_MINUTES[Math.max(0, idx)];
  return admin.firestore.Timestamp.fromMillis(Date.now() + minutes * 60_000);
}

export const processEmailQueue = onSchedule(
  {
    schedule: "every 1 minutes",
    region: "us-central1",
    secrets: [resendApiKey],
    memory: "256MiB",
    timeoutSeconds: 120,
  },
  async () => {
    // Find queued or processing sends
    const sendsSnap = await db
      .collection("email_sends")
      .where("status", "in", ["queued", "processing"])
      .limit(5)
      .get();

    if (sendsSnap.empty) return;

    const {Resend} = await import("resend");
    const apiKey = resendApiKey.value();
    if (!apiKey) {
      functions.logger.error("processEmailQueue: RESEND_API_KEY not configured");
      return;
    }
    const resend = new Resend(apiKey);

    for (const sendDoc of sendsSnap.docs) {
      const sendData = sendDoc.data();

      // Mark as processing
      if (sendData.status === "queued") {
        await sendDoc.ref.update({status: "processing"});
      }

      const creatorId = sendData.creatorId as string;
      const subject = sendData.subject as string;
      const bodyHtml = sendData.bodyHtml as string;
      const fromAddress = (sendData.fromAddress as string) || "Wake <notificaciones@wakelab.co>";
      const sendType = (sendData.type as string) || "event_broadcast";

      let sentThisTick = 0;
      let failedThisTick = 0;
      let retriedThisTick = 0;
      let batchesThisTick = 0;

      for (let b = 0; b < MAX_BATCHES_PER_TICK; b++) {
        // Fetch pending recipients (oversample, then filter by nextRetryAt
        // in memory to avoid needing a composite index).
        const pendingSnap = await sendDoc.ref
          .collection("recipients")
          .where("status", "==", "pending")
          .limit(PENDING_FETCH_LIMIT)
          .get();

        if (pendingSnap.empty) {
          // No more pending — mark send completed
          await sendDoc.ref.update({
            status: "completed",
            completedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
          functions.logger.info("processEmailQueue: send completed", {sendId: sendDoc.id});
          break;
        }

        const nowMs = Date.now();
        const readyDocs = pendingSnap.docs.filter((d) => {
          const nra = d.data().nextRetryAt as admin.firestore.Timestamp | null | undefined;
          if (!nra) return true; // legacy doc or fresh — ready
          return nra.toMillis() <= nowMs;
        });

        if (readyDocs.length === 0) {
          // All pending docs are in backoff — stop this tick, wait for next
          functions.logger.info("processEmailQueue: all pending in backoff", {
            sendId: sendDoc.id,
            pendingCount: pendingSnap.size,
          });
          break;
        }

        const batchDocs = readyDocs.slice(0, BATCH_SIZE);
        batchesThisTick++;

        // Build the Resend batch payload
        const batchPayload = batchDocs.map((doc) => {
          const r = doc.data();
          const email = r.email as string;
          const name = (r.name as string) || "";

          const unsubToken = crypto.createHash("sha256")
            .update(`${email}:${creatorId}`)
            .digest("hex");
          const unsubUrl = `https://wakelab.co/api/v1/email/unsubscribe?token=${unsubToken}&email=${encodeURIComponent(email)}&creatorId=${creatorId}`;

          const firstName = name.split(" ")[0] || "";
          let personalizedHtml = bodyHtml;
          personalizedHtml = personalizedHtml.replace(
            /\{\{nombre\}\}/g,
            firstName ? escapeHtmlSimple(firstName) : ""
          );
          const fullHtml = buildEmailShell(personalizedHtml, unsubUrl);

          return {
            from: fromAddress,
            to: email,
            subject,
            html: fullHtml,
            headers: {
              "List-Unsubscribe": `<${unsubUrl}>`,
              "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
            },
            tags: [
              {name: "category", value: sendType === "event_broadcast" ? "broadcast" : "transactional"},
              {name: "send_id", value: sendDoc.id},
              {name: "creator_id", value: creatorId},
            ],
          };
        });

        // Fire the batch. Resend SDK returns { data, error } on the single
        // send path; batch.send follows the same convention. We also wrap in
        // try/catch in case the SDK throws on network failure.
        let batchErrorMsg: string | null = null;
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const response: any = await resend.batch.send(batchPayload as any);
          if (response && response.error) {
            batchErrorMsg = response.error.message || "Resend batch error";
          }
        } catch (err: unknown) {
          batchErrorMsg = err instanceof Error ? err.message : "Unknown batch error";
        }

        // Apply results to all recipient docs in this batch atomically
        const writeBatch = db.batch();
        if (!batchErrorMsg) {
          // All succeeded
          for (const doc of batchDocs) {
            writeBatch.update(doc.ref, {
              status: "sent",
              sentAt: admin.firestore.FieldValue.serverTimestamp(),
            });
          }
          await writeBatch.commit();
          sentThisTick += batchDocs.length;
        } else {
          // Classify and either schedule retry or mark failed
          const errorKind = classifyResendError(batchErrorMsg);
          let retriedNow = 0;
          let failedNow = 0;
          for (const doc of batchDocs) {
            const data = doc.data();
            const prevAttempts = (data.attemptCount as number | undefined) || 0;
            const newAttemptCount = prevAttempts + 1;

            if (errorKind === "transient" && newAttemptCount < MAX_ATTEMPTS) {
              writeBatch.update(doc.ref, {
                // Stay pending, but push out nextRetryAt
                attemptCount: newAttemptCount,
                nextRetryAt: computeNextRetryAt(newAttemptCount),
                lastError: batchErrorMsg,
              });
              retriedNow++;
            } else {
              writeBatch.update(doc.ref, {
                status: "failed",
                attemptCount: newAttemptCount,
                error: batchErrorMsg,
                lastError: batchErrorMsg,
              });
              failedNow++;
            }
          }
          await writeBatch.commit();
          retriedThisTick += retriedNow;
          failedThisTick += failedNow;

          functions.logger.warn("processEmailQueue: batch failed", {
            sendId: sendDoc.id,
            batchSize: batchDocs.length,
            errorKind,
            retried: retriedNow,
            failed: failedNow,
            error: batchErrorMsg,
          });

          // If the error was transient and everything got retried, stop this
          // tick — no point burning through more batches when Resend is
          // already rate-limiting/throttling us. Next tick, backoff kicks in.
          if (errorKind === "transient") break;
        }
      }

      // Aggregate stats update — one write at the end of all batches
      if (sentThisTick > 0 || failedThisTick > 0) {
        await sendDoc.ref.update({
          "stats.sent": admin.firestore.FieldValue.increment(sentThisTick),
          "stats.failed": admin.firestore.FieldValue.increment(failedThisTick),
        });
      }

      functions.logger.info("processEmailQueue: tick processed", {
        sendId: sendDoc.id,
        batches: batchesThisTick,
        sent: sentThisTick,
        failed: failedThisTick,
        retried: retriedThisTick,
      });
    }
  }
);

const escapeHtmlSimple = sharedEscapeHtml;

function buildEmailShell(bodyHtml: string, unsubscribeUrl: string): string {
  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#1a1a1a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#fff;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#1a1a1a;padding:40px 0;">
    <tr><td align="center">
      <table width="480" cellpadding="0" cellspacing="0" style="max-width:480px;border-radius:18px;overflow:hidden;border:1px solid rgba(255,255,255,0.08);">
        <tr><td style="background:#1e1e1e;padding:48px 36px 40px;">
          ${bodyHtml}
        </td></tr>
        <tr><td style="background:#1e1e1e;padding:16px 36px 28px;text-align:center;border-top:1px solid rgba(255,255,255,0.06);">
          <p style="margin:0;font-size:0.75rem;color:rgba(255,255,255,0.22);">
            <a href="${unsubscribeUrl}" style="color:rgba(255,255,255,0.35);text-decoration:underline;">Cancelar suscripción</a>
            &middot; Enviado por Wake &middot; <a href="https://wakelab.co" style="color:rgba(255,255,255,0.22);text-decoration:none;">wakelab.co</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ─── Gen2 API ─────────────────────────────────────────────────────────────
// Single Gen2 function export — Express routes live in src/api/routes/

const fatSecretClientIdV2 = defineSecret("FATSECRET_CLIENT_ID");
const fatSecretClientSecretV2 = defineSecret("FATSECRET_CLIENT_SECRET");
const resendApiKeyV2 = defineSecret("RESEND_API_KEY");
const mercadopagoAccessTokenV2 = defineSecret("MERCADOPAGO_ACCESS_TOKEN");
const mercadopagoWebhookSecretV2 = defineSecret("MERCADOPAGO_WEBHOOK_SECRET");

export const api = onRequest(
  {
    region: "us-central1",
    // 512MiB ≈ doubles CPU per request vs 256MiB. The lab endpoint
    // parallelizes 7 Firestore queries + a 30-doc library batch + photo
    // signing + JSON serialization; tighter memory was a measurable bottleneck.
    memory: "512MiB",
    timeoutSeconds: 60,
    concurrency: 80,
    minInstances: 1,
    secrets: [
      fatSecretClientIdV2,
      fatSecretClientSecretV2,
      resendApiKeyV2,
      mercadopagoAccessTokenV2,
      mercadopagoWebhookSecretV2,
      vapidPublicKey,
      vapidPrivateKey,
    ],
  },
  app
);

// ─── Event page with dynamic OG tags ────────────────────────────────────────

let cachedIndexHtml: string | null = null;

async function getIndexHtml(): Promise<string> {
  if (cachedIndexHtml) return cachedIndexHtml;

  // Fetch live from hosting — always in sync with deployed assets
  try {
    const resp = await fetch("https://wakelab.co/index.html");
    if (resp.ok) {
      cachedIndexHtml = await resp.text();
      return cachedIndexHtml;
    }
  } catch {
    // fall through to redirect fallback
  }

  // Fallback: redirect to homepage if fetch fails
  cachedIndexHtml = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Wake</title>
</head>
<body>
  <script>window.location.replace("https://wakelab.co");</script>
</body>
</html>`;
  return cachedIndexHtml;
}

function formatEventDate(value: unknown): string {
  if (!value) return "";
  let d: Date;
  if (typeof value === "string") {
    d = new Date(value);
  } else if (typeof value === "object" && value !== null && "_seconds" in value) {
    d = new Date((value as {_seconds: number})._seconds * 1000);
  } else if (typeof value === "object" && value !== null && "toDate" in value) {
    d = (value as {toDate: () => Date}).toDate();
  } else {
    return "";
  }
  return d.toLocaleDateString("es-CO", {day: "numeric", month: "long", year: "numeric"});
}

export const eventPage = onRequest(
  {
    region: "us-central1",
    memory: "256MiB",
    timeoutSeconds: 10,
    concurrency: 80,
  },
  async (req, res) => {
    // Extract eventId from path: /e/{eventId} or /e/{eventId}/anything
    const match = req.path.match(/^\/e\/([a-zA-Z0-9_-]+)/);
    if (!match) {
      res.status(404).send("Not found");
      return;
    }
    const eventId = match[1];

    let html = await getIndexHtml();

    try {
      const eventDoc = await db.collection("events").doc(eventId).get();
      if (eventDoc.exists) {
        const data = eventDoc.data()!;
        const title = data.title || "Evento Wake";
        const dateStr = formatEventDate(data.date);
        const description = dateStr ?
          `${dateStr}${data.location ? ` — ${data.location}` : ""}` :
          (data.description?.slice(0, 160) || "Evento en Wake");
        const ogImage = data.og_image_url || data.image_url || "/app_icon.png";

        // Replace OG meta tags
        html = html
          .replace(/<meta property="og:title"[^>]*>/, `<meta property="og:title" content="${escapeOgAttr(title)}" />`)
          .replace(/<meta property="og:description"[^>]*>/, `<meta property="og:description" content="${escapeOgAttr(description)}" />`)
          .replace(/<meta property="og:image"[^>]*>/, `<meta property="og:image" content="${escapeOgAttr(ogImage)}" />`)
          .replace(/<meta property="og:url"[^>]*>/, `<meta property="og:url" content="https://wakelab.co/e/${eventId}" />`)
          .replace(/<meta name="twitter:title"[^>]*>/, `<meta name="twitter:title" content="${escapeOgAttr(title)}" />`)
          .replace(/<meta name="twitter:description"[^>]*>/, `<meta name="twitter:description" content="${escapeOgAttr(description)}" />`)
          .replace(/<meta name="twitter:image"[^>]*>/, `<meta name="twitter:image" content="${escapeOgAttr(ogImage)}" />`)
          .replace(/<title>[^<]*<\/title>/, `<title>${escapeHtml(title)} — Wake</title>`);
      }
    } catch (err) {
      functions.logger.error("eventPage Firestore read failed:", err);
      // Serve fallback HTML without dynamic tags
    }

    res.set("Cache-Control", "public, max-age=300, s-maxage=600");
    res.status(200).send(html);
  }
);

function escapeOgAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

// ─── Scheduled: expand weekly availability templates into concrete slots ───
export const expandWeeklyAvailability = onSchedule(
  {
    schedule: "every day 03:00",
    region: "us-central1",
    timeoutSeconds: 300,
    memory: "256MiB",
  },
  async () => {
    const snapshot = await db.collection("creator_availability").get();
    let totalExpanded = 0;

    for (const doc of snapshot.docs) {
      const data = doc.data();
      const template = data.weeklyTemplate;
      if (!template || typeof template !== "object") continue;

      const hasAnySlots = Object.values(template).some(
        (slots) => Array.isArray(slots) && (slots as unknown[]).length > 0
      );
      if (!hasAnySlots) continue;

      const creatorId = doc.id;
      const disabledDates = new Set<string>(
        Array.isArray(data.disabledDates) ? data.disabledDates : []
      );
      const existingDays: Record<string, unknown> = data.days ?? {};

      const updates: Record<string, unknown> = {};
      const today = new Date();

      // Generate slots for the next 14 days
      for (let offset = 0; offset < 14; offset++) {
        const d = new Date(today);
        d.setDate(today.getDate() + offset);
        const dateStr = d.toISOString().slice(0, 10);

        if (disabledDates.has(dateStr)) continue;
        if (existingDays[dateStr]) continue;

        // JS getDay: 0=Sun..6=Sat → template key: 1=Mon..7=Sun
        const jsDay = d.getDay();
        const templateKey = String(jsDay === 0 ? 7 : jsDay);
        const dayTemplate = template[templateKey];
        if (!Array.isArray(dayTemplate) || dayTemplate.length === 0) continue;

        const slots: Array<{
          startLocal: string;
          endLocal: string;
          durationMinutes: number;
          booked: boolean;
        }> = [];

        for (const entry of dayTemplate as Array<{startTime: string; durationMinutes: number}>) {
          const [h, m] = entry.startTime.split(":").map(Number);
          const endMinutes = h * 60 + m + entry.durationMinutes;
          const endH = Math.floor(endMinutes / 60);
          const endM = endMinutes % 60;

          const startLocal = `${dateStr}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00.000Z`;
          const endLocal = `${dateStr}T${String(endH).padStart(2, "0")}:${String(endM).padStart(2, "0")}:00.000Z`;

          slots.push({
            startLocal,
            endLocal,
            durationMinutes: entry.durationMinutes,
            booked: false,
          });
        }

        if (slots.length > 0) {
          updates[`days.${dateStr}`] = {slots};
          totalExpanded += slots.length;
        }
      }

      // Prune days older than 30 days
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 30);
      const cutoffStr = cutoff.toISOString().slice(0, 10);
      for (const dateKey of Object.keys(existingDays)) {
        if (dateKey < cutoffStr) {
          updates[`days.${dateKey}`] = admin.firestore.FieldValue.delete();
        }
      }

      if (Object.keys(updates).length > 0) {
        updates["updated_at"] = admin.firestore.FieldValue.serverTimestamp();
        await db.collection("creator_availability").doc(creatorId).update(updates);
      }
    }

    functions.logger.info("expandWeeklyAvailability: done", {totalExpanded});
  }
);

// ─── Scheduled: send call reminders (24h and 1h before) ───────────────────
export const sendCallReminders = onSchedule(
  {
    schedule: "every 15 minutes",
    region: "us-central1",
    timeoutSeconds: 120,
    memory: "256MiB",
    secrets: [resendApiKeyV2],
  },
  async () => {
    const now = Date.now();
    const h25FromNow = new Date(now + 25 * 60 * 60 * 1000).toISOString();

    const snapshot = await db
      .collection("call_bookings")
      .where("status", "==", "scheduled")
      .where("slotStartUtc", "<=", h25FromNow)
      .orderBy("slotStartUtc", "asc")
      .get();

    if (snapshot.empty) return;

    let sent24h = 0;
    let sent1h = 0;

    // Cache user lookups
    const userCache = new Map<string, {email: string; displayName: string}>();
    async function getUser(userId: string) {
      if (userCache.has(userId)) return userCache.get(userId)!;
      const doc = await db.collection("users").doc(userId).get();
      const data = doc.data();
      const entry = {
        email: data?.email || "",
        displayName: data?.displayName || "",
      };
      userCache.set(userId, entry);
      return entry;
    }

    function buildReminderHtml(
      recipientName: string,
      otherName: string,
      callLink: string,
      dateTimeStr: string,
      isCreator: boolean
    ): string {
      const bodyText = isCreator ?
        `Tienes una llamada programada con ${otherName}.` :
        `Tienes una llamada con ${otherName}.`;
      const greeting = recipientName ?
        `¡Hola, ${recipientName.split(" ")[0]}!` :
        "¡Hola!";

      return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#1a1a1a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#fff;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#1a1a1a;padding:40px 0;">
    <tr><td align="center">
      <table width="480" cellpadding="0" cellspacing="0" style="max-width:480px;border-radius:18px;overflow:hidden;border:1px solid rgba(255,255,255,0.08);">
        <tr><td style="background:#1a1a1a;padding:52px 36px 44px;text-align:center;">
          <p style="margin:0 0 18px;font-size:0.7rem;letter-spacing:0.14em;text-transform:uppercase;color:rgba(255,255,255,0.5);">Wake Coaching</p>
          <h1 style="margin:0 0 10px;font-size:1.75rem;font-weight:800;color:#fff;line-height:1.2;">${escapeHtml(greeting)}</h1>
          <p style="margin:0;font-size:1rem;color:rgba(255,255,255,0.78);line-height:1.55;">${escapeHtml(bodyText)}</p>
        </td></tr>
        <tr><td style="background:#1e1e1e;padding:32px 36px 28px;text-align:center;">
          <div style="background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.09);border-radius:14px;padding:18px 24px;margin-bottom:24px;">
            <p style="margin:0 0 4px;font-size:0.7rem;text-transform:uppercase;letter-spacing:0.1em;color:rgba(255,255,255,0.35);">Fecha y hora</p>
            <p style="margin:0;font-size:1.1rem;font-weight:700;color:#fff;">${escapeHtml(dateTimeStr)}</p>
          </div>
          ${callLink ? `<a href="${escapeHtml(callLink)}" style="display:inline-block;padding:14px 32px;background:rgba(255,255,255,0.12);color:#fff;font-size:0.95rem;font-weight:600;text-decoration:none;border-radius:10px;border:1px solid rgba(255,255,255,0.15);">Unirse a la llamada</a>` : ""}
        </td></tr>
        <tr><td style="background:#1e1e1e;padding:16px 36px 28px;text-align:center;border-top:1px solid rgba(255,255,255,0.06);">
          <p style="margin:0;font-size:0.75rem;color:rgba(255,255,255,0.22);">Enviado automáticamente por Wake · <a href="https://wakelab.co" style="color:rgba(255,255,255,0.22);text-decoration:none;">wakelab.co</a></p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
    }

    async function sendReminderEmail(to: string, subject: string, html: string) {
      if (!to) return;
      try {
        const resend = new Resend(resendApiKeyV2.value());
        await resend.emails.send({
          from: "Wake Coaching <coaching@wakelab.co>",
          to,
          subject,
          html,
          headers: {
            "List-Unsubscribe": "<mailto:soporte@wakelab.co?subject=unsubscribe>",
          },
        });
      } catch (err) {
        functions.logger.error("sendCallReminders: email failed", {to, error: String(err)});
      }
    }

    function formatDateTime(isoUtc: string): string {
      const d = new Date(isoUtc);
      return d.toLocaleString("es-CO", {
        timeZone: "America/Bogota",
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      });
    }

    for (const doc of snapshot.docs) {
      const booking = doc.data();
      const slotStart = new Date(booking.slotStartUtc).getTime();
      const msUntilCall = slotStart - now;

      // 24h reminder: 23-25h window
      if (
        msUntilCall >= 23 * 60 * 60 * 1000 &&
        msUntilCall <= 25 * 60 * 60 * 1000 &&
        !booking.reminderSent24h
      ) {
        const client = await getUser(booking.clientUserId);
        const creator = await getUser(booking.creatorId);
        const dateTimeStr = formatDateTime(booking.slotStartUtc);
        const callLink = booking.callLink || "";

        if (client.email) {
          const html = buildReminderHtml(client.displayName, creator.displayName || "tu coach", callLink, dateTimeStr, false);
          await sendReminderEmail(client.email, "Tu llamada es mañana", html);
        }
        if (creator.email) {
          const html = buildReminderHtml(creator.displayName, client.displayName || "tu cliente", callLink, dateTimeStr, true);
          await sendReminderEmail(creator.email, "Llamada mañana", html);
        }

        await doc.ref.update({reminderSent24h: true});
        sent24h++;
      }

      // 1h reminder: 45min-75min window
      if (
        msUntilCall >= 45 * 60 * 1000 &&
        msUntilCall <= 75 * 60 * 1000 &&
        !booking.reminderSent1h
      ) {
        const client = await getUser(booking.clientUserId);
        const creator = await getUser(booking.creatorId);
        const dateTimeStr = formatDateTime(booking.slotStartUtc);
        const callLink = booking.callLink || "";

        if (client.email) {
          const html = buildReminderHtml(client.displayName, creator.displayName || "tu coach", callLink, dateTimeStr, false);
          await sendReminderEmail(client.email, "Tu llamada es en 1 hora", html);
        }
        if (creator.email) {
          const html = buildReminderHtml(creator.displayName, client.displayName || "tu cliente", callLink, dateTimeStr, true);
          await sendReminderEmail(creator.email, "Llamada en 1 hora", html);
        }

        await doc.ref.update({reminderSent1h: true});
        sent1h++;
      }
    }

    functions.logger.info("sendCallReminders: done", {total: snapshot.size, sent24h, sent1h});
  }
);

// ─── Scheduled: cleanup old video exchange messages (30-day retention) ────

export const detectAbandonedSessions = onSchedule(
  {
    schedule: "every 6 hours",
    region: "us-central1",
    timeoutSeconds: 300,
    memory: "256MiB",
  },
  async () => {
    const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString();

    const snapshot = await db.collectionGroup("activeSession").get();
    if (snapshot.empty) return;

    const batch = db.batch();
    let count = 0;

    for (const doc of snapshot.docs) {
      if (doc.id !== "current") continue;
      const data = doc.data();
      const savedAt = data.savedAt as string | undefined;
      if (!savedAt || savedAt >= fourHoursAgo) continue;

      const userId = doc.ref.parent.parent?.id;
      if (!userId) continue;

      const completedSetsCount = data.completedSets ?
        Object.keys(data.completedSets as Record<string, unknown>).length :
        0;

      batch.set(
        db
          .collection("users")
          .doc(userId)
          .collection("abandonedSessions")
          .doc((data.sessionId as string) || doc.id),
        {
          sessionId: (data.sessionId as string) || null,
          courseId: (data.courseId as string) || null,
          sessionName: (data.sessionName as string) || null,
          startedAt: (data.startedAt as string) || null,
          elapsedSeconds: (data.elapsedSeconds as number) || 0,
          completedSetsCount,
          completionPct: null,
          userId,
          abandonedAt: new Date().toISOString(),
          detectedBy: "scheduled_scan",
          created_at: admin.firestore.FieldValue.serverTimestamp(),
        },
        {merge: true}
      );

      batch.delete(doc.ref);
      count++;
      if (count >= 400) break;
    }

    if (count > 0) {
      await batch.commit();
      functions.logger.info(`detectAbandonedSessions: recorded ${count} abandoned sessions`);
    }
  }
);

export const cleanupVideoExchanges = onSchedule(
  {
    schedule: "every day 04:00",
    region: "us-central1",
    timeoutSeconds: 300,
    memory: "256MiB",
  },
  async () => {
    const cutoff = admin.firestore.Timestamp.fromMillis(
      Date.now() - 30 * 24 * 60 * 60 * 1000
    );
    const bucket = admin.storage().bucket();

    const exchangesSnap = await db
      .collection("video_exchanges")
      .where("lastMessageAt", "<", cutoff)
      .get();

    if (exchangesSnap.empty) {
      functions.logger.info("cleanupVideoExchanges: nothing to clean");
      return;
    }

    let messagesDeleted = 0;
    let messagesSaved = 0;
    let exchangesDeleted = 0;

    for (const exchangeDoc of exchangesSnap.docs) {
      const messagesSnap = await exchangeDoc.ref.collection("messages").get();

      let savedCount = 0;
      let latestSavedAt: FirebaseFirestore.Timestamp | null = null;

      for (const msgDoc of messagesSnap.docs) {
        const msg = msgDoc.data();

        if (msg.savedByCreator === true) {
          savedCount++;
          messagesSaved++;
          const msgCreatedAt = msg.createdAt as FirebaseFirestore.Timestamp | undefined;
          if (msgCreatedAt && (!latestSavedAt || msgCreatedAt.toMillis() > latestSavedAt.toMillis())) {
            latestSavedAt = msgCreatedAt;
          }
          continue;
        }

        // Delete storage files
        if (msg.videoPath) {
          try {
            await bucket.file(msg.videoPath).delete();
          } catch (_e) {/* file may already be gone */}
        }
        if (msg.thumbnailPath) {
          try {
            await bucket.file(msg.thumbnailPath).delete();
          } catch (_e) {/* file may already be gone */}
        }

        await msgDoc.ref.delete();
        messagesDeleted++;
      }

      if (savedCount === 0) {
        // No saved messages — delete the exchange doc
        await exchangeDoc.ref.delete();
        exchangesDeleted++;
      } else {
        // Some saved — update exchange
        const updates: Record<string, unknown> = {status: "closed"};
        if (latestSavedAt) {
          updates.lastMessageAt = latestSavedAt;
        }
        await exchangeDoc.ref.update(updates);
      }
    }

    functions.logger.info("cleanupVideoExchanges: done", {
      exchangesProcessed: exchangesSnap.size,
      exchangesDeleted,
      messagesDeleted,
      messagesSaved,
    });
  }
);

// ─── Wake ops: secrets ─────────────────────────────────────────────────────
const telegramSignalsBotToken = defineSecret("TELEGRAM_SIGNALS_BOT_TOKEN");
const telegramChatId = defineSecret("TELEGRAM_CHAT_ID");
const telegramWebhookSecret = defineSecret("TELEGRAM_WEBHOOK_SECRET");
const telegramAgentBotToken = defineSecret("TELEGRAM_AGENT_BOT_TOKEN");
const telegramAgentWebhookSecret = defineSecret("TELEGRAM_AGENT_WEBHOOK_SECRET");
const anthropicApiKey = defineSecret("ANTHROPIC_API_KEY");
const githubOpsToken = defineSecret("GITHUB_OPS_TOKEN");
const githubWebhookSecret = defineSecret("GITHUB_WEBHOOK_SECRET");
const opsApiKey = defineSecret("OPS_API_KEY");

const AGENT_BOT_USERNAME = "agent_wake_bot";
const GITHUB_OPS_OWNER = "emilioloboguerrero";
const GITHUB_OPS_REPO = "wake";

// Topic routing for the wake_ops supergroup. JSON map from topic name →
// message_thread_id, e.g. {"agent":92,"signals":93,"deploys":94}.
// If the secret is absent or a key is missing, posts fall back to the
// group root (pre-forum behavior).
const telegramTopics = defineSecret("TELEGRAM_TOPICS");

function readTopics(): import("./ops/telegram.js").TopicMap {
  // Lazy import to keep this file cheap; parseTopicMap is pure.
  return parseTopicMap(telegramTopics.value());
}

// ─── Scheduled: wake ops daily pulse (logs + payments + client errors + quota) ──
export const wakeDailyPulseCron = onSchedule(
  {
    schedule: "every day 19:00",
    timeZone: "America/Bogota",
    region: "us-central1",
    secrets: [telegramSignalsBotToken, telegramChatId, telegramTopics],
    memory: "512MiB",
    timeoutSeconds: 300,
  },
  async () => {
    const ctx = {
      botToken: telegramSignalsBotToken.value(),
      chatId: telegramChatId.value(),
      topics: readTopics(),
      projectId: process.env.GCLOUD_PROJECT || "wolf-20b8b",
    };
    const steps: Array<[string, () => Promise<void>]> = [
      ["logs", () => runLogsDigest(ctx)],
      ["payments", () => runPaymentsPulse(ctx)],
      ["pwa-errors", () => runClientErrors(ctx, {source: "pwa"})],
      ["creator-errors", () => runClientErrors(ctx, {source: "creator"})],
      ["quota", () => runQuotaWatch(ctx)],
    ];
    for (const [name, fn] of steps) {
      try {
        await fn();
      } catch (err) {
        // Put the step name in the log message itself so each failing step
        // gets its own fingerprint in the logs digest (instead of all steps
        // collapsing into one generic "step failed" entry). Pass the error
        // object so its stack survives and condenseStack can point at the
        // app frame that threw.
        const errMsg = err instanceof Error ? err.message : String(err);
        functions.logger.error(
          `wakeDailyPulseCron[${name}] step failed: ${errMsg}`,
          {
            step: name,
            err,
            error: errMsg,
            stack: err instanceof Error ? err.stack : undefined,
          }
        );
      }
    }
  }
);

// ─── Scheduled: wake ops heartbeat (scheduled-job freshness) ──────────────
export const wakeHeartbeatCron = onSchedule(
  {
    schedule: "every 12 hours",
    timeZone: "America/Bogota",
    region: "us-central1",
    secrets: [telegramSignalsBotToken, telegramChatId, telegramTopics],
    memory: "256MiB",
    timeoutSeconds: 60,
  },
  async () => {
    try {
      await runCronHeartbeat({
        botToken: telegramSignalsBotToken.value(),
        chatId: telegramChatId.value(),
        topics: readTopics(),
        projectId: process.env.GCLOUD_PROJECT || "wolf-20b8b",
      });
    } catch (err) {
      functions.logger.error("wakeHeartbeatCron failed", err);
      throw err;
    }
  }
);

// ─── HTTPS: client-error ingest endpoint (PWA + creator dashboard) ────────
export const wakeClientErrorsIngest = onRequest(
  {
    region: "us-central1",
    memory: "256MiB",
    timeoutSeconds: 15,
    cors: false,
  },
  async (req, res) => {
    await handleClientErrorsIngest(req, res);
  }
);

// ─── HTTPS: read-only ops API (foundation for a future web dashboard) ─────
export const wakeOpsApi = onRequest(
  {
    region: "us-central1",
    secrets: [opsApiKey],
    memory: "256MiB",
    timeoutSeconds: 30,
    cors: false,
  },
  async (req, res) => {
    await handleOpsApi(req, res, {
      apiKey: opsApiKey.value(),
      projectId: process.env.GCLOUD_PROJECT || "wolf-20b8b",
    });
  }
);

// ─── Webhook: signals bot command handler ──────────────────────────────────
export const wakeSignalsWebhook = onRequest(
  {
    region: "us-central1",
    secrets: [
      telegramSignalsBotToken,
      telegramChatId,
      telegramWebhookSecret,
      telegramTopics,
    ],
    memory: "256MiB",
    timeoutSeconds: 120,
    cors: false,
  },
  async (req, res) => {
    await handleSignalsWebhook(req, res, {
      botToken: telegramSignalsBotToken.value(),
      allowedChatId: telegramChatId.value(),
      webhookSecret: telegramWebhookSecret.value(),
      topics: readTopics(),
      projectId: process.env.GCLOUD_PROJECT || "wolf-20b8b",
    });
  }
);

// ─── Webhook: GitHub activity mirror ──────────────────────────────────────
export const wakeGithubWebhook = onRequest(
  {
    region: "us-central1",
    secrets: [
      telegramSignalsBotToken,
      telegramChatId,
      telegramTopics,
      githubWebhookSecret,
    ],
    memory: "256MiB",
    timeoutSeconds: 30,
    cors: false,
  },
  async (req, res) => {
    await handleGithubWebhook(req, res, {
      webhookSecret: githubWebhookSecret.value(),
      allowedRepo: `${GITHUB_OPS_OWNER}/${GITHUB_OPS_REPO}`,
      telegram: {
        botToken: telegramSignalsBotToken.value(),
        chatId: telegramChatId.value(),
        topics: readTopics(),
        botUsername: "signals_wake_bot",
        botRole: "signals",
      },
    });
  }
);

// ─── Scheduled: agent daily synthesis (Mode A) ────────────────────────────
export const wakeAgentSynthesisCron = onSchedule(
  {
    schedule: "every day 19:30",
    timeZone: "America/Bogota",
    region: "us-central1",
    secrets: [
      telegramAgentBotToken,
      telegramChatId,
      telegramTopics,
      anthropicApiKey,
      githubOpsToken,
    ],
    memory: "512MiB",
    timeoutSeconds: 540,
  },
  async () => {
    await runSynthesis({
      agentBotUsername: AGENT_BOT_USERNAME,
      agentBotToken: telegramAgentBotToken.value(),
      chatId: telegramChatId.value(),
      topics: readTopics(),
      anthropicApiKey: anthropicApiKey.value(),
      githubToken: githubOpsToken.value(),
      githubOwner: GITHUB_OPS_OWNER,
      githubRepo: GITHUB_OPS_REPO,
    });
  }
);

// ─── Webhook: agent bot receiver (archive + @mention dispatch) ────────────
export const wakeAgentWebhook = onRequest(
  {
    region: "us-central1",
    secrets: [
      telegramAgentBotToken,
      telegramChatId,
      telegramAgentWebhookSecret,
      telegramTopics,
      anthropicApiKey,
      githubOpsToken,
    ],
    memory: "512MiB",
    timeoutSeconds: 300,
    cors: false,
  },
  async (req, res) => {
    await handleAgentWebhook(req, res, {
      webhookSecret: telegramAgentWebhookSecret.value(),
      allowedChatId: telegramChatId.value(),
      topics: readTopics(),
      onMessage: async (message) => {
        await dispatchMention({
          message,
          agentBotUsername: AGENT_BOT_USERNAME,
          agentBotToken: telegramAgentBotToken.value(),
          chatId: telegramChatId.value(),
          topics: readTopics(),
          anthropicApiKey: anthropicApiKey.value(),
          githubToken: githubOpsToken.value(),
          githubOwner: GITHUB_OPS_OWNER,
          githubRepo: GITHUB_OPS_REPO,
        });
      },
    });
  }
);
