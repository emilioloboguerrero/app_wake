/**
 * Firebase Cloud Functions v1
 */

import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import * as crypto from "node:crypto";
import type {Request, Response} from "express";
import {MercadoPagoConfig, Preference, Payment, PreApproval} from "mercadopago";

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

const buildReferenceBase = (
  version: string,
  userId: string,
  courseId: string,
  paymentType: PaymentKind
): string => {
  return [version, userId, courseId, paymentType].join(REFERENCE_DELIMITER);
};

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

  const base = buildReferenceBase(REFERENCE_VERSION, userId, courseId, paymentType);
  const reference = base;

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

const CHECKOUT_INTENT_COLLECTION = "checkout_intents";

interface CheckoutIntentPayload {
  externalReference: string;
  userId: string;
  userEmail?: string | null;
  userName?: string | null;
  courseId: string;
  courseTitle?: string | null;
  paymentType: PaymentKind;
  subscriptionId?: string | null;
}

async function createCheckoutIntent(
  payload: CheckoutIntentPayload
): Promise<void> {
  const {
    externalReference,
    userId,
    userEmail = null,
    userName = null,
    courseId,
    courseTitle = null,
    paymentType,
    subscriptionId = null,
  } = payload;

  const intentRef = db
    .collection(CHECKOUT_INTENT_COLLECTION)
    .doc(externalReference);

  const timestamp = admin.firestore.FieldValue.serverTimestamp();

  await intentRef.set(
    {
      userId,
      userEmail,
      userName,
      courseId,
      courseTitle,
      paymentType,
      subscriptionId,
      status: "pending",
      state: "pending",
      startedAt: timestamp,
      updatedAt: timestamp,
    },
    {merge: true}
  );
}

async function updateCheckoutIntent(
  externalReference: string | null | undefined,
  updates: Record<string, unknown>
): Promise<void> {
  if (!externalReference) {
    return;
  }

  const intentRef = db
    .collection(CHECKOUT_INTENT_COLLECTION)
    .doc(externalReference);

  await intentRef.set(
    {
      ...updates,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    {merge: true}
  );
}

// Helper: Get human-readable description for receipt verification status codes
function getReceiptStatusDescription(status: number): string {
  const statusCodes: {[key: number]: string} = {
    0: "Valid receipt",
    21000: "The App Store could not read the JSON object you provided",
    21002: "The data in the receipt-data property was malformed or missing",
    21003: "The receipt could not be authenticated",
    21004: "The shared secret you provided does not match the shared secret on file for your account",
    21005: "The receipt server is not currently available",
    21006: "This receipt is valid but the subscription has expired",
    21007: "This receipt is from the test environment, but it was sent to the production environment for verification",
    21008: "This receipt is from the production environment, but it was sent to the test environment for verification",
    21010: "This receipt could not be authorized",
  };
  return statusCodes[status] || `Unknown status code: ${status}`;
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

// Note: addCourseToUser function removed - now using transactions for atomic operations

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

// Signature verification removed - accepting all webhooks
// WARNING: This allows anyone to send webhooks to your function
// Consider implementing signature verification for production security

// Create unique payment preference
export const createPaymentPreference = functions
  .runWith({secrets: [mercadopagoAccessToken]})
  .https.onRequest(async (request, response) => {
    response.set("Access-Control-Allow-Origin", "*");
    response.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    response.set("Access-Control-Allow-Headers", "Content-Type");

    if (request.method === "OPTIONS") {
      response.status(204).send("");
      return;
    }

    try {
      const {userId, courseId} = request.body;

      // Get course
      const courseDoc = await db.collection("courses").doc(courseId).get();
      const course = courseDoc.data();

      if (!course) {
        response.status(404).json({
          success: false,
          error: "Course not found",
        });
        return;
      }

      const userDoc = await db.collection("users").doc(userId).get();
      const userData = userDoc.data() || {};
      const userEmail = userData?.email ?? null;
      const userName =
        userData?.display_name ??
        userData?.name ??
        userData?.fullName ??
        null;

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

      try {
        await createCheckoutIntent({
          externalReference,
          userId,
          userEmail,
          userName,
          courseId,
          courseTitle: course.title || null,
          paymentType: "otp",
        });
      } catch (intentError) {
        functions.logger.error(
          "Failed to create checkout intent",
          intentError
        );
      }

      response.json({
        success: true,
        init_point: result.init_point,
      });
    } catch (error: unknown) {
      const message = toErrorMessage(error);
      response.status(500).json({
        success: false,
        error: message,
      });
    }
  });

// Create subscription dynamically (without pre-created plan)
export const createSubscriptionCheckout = functions
  .runWith({secrets: [mercadopagoAccessToken]})
  .https.onRequest(async (request, response) => {
    response.set("Access-Control-Allow-Origin", "*");
    response.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    response.set("Access-Control-Allow-Headers", "Content-Type");

    if (request.method === "OPTIONS") {
      response.status(204).send("");
      return;
    }

    try {
      const {userId, courseId, payer_email: payerEmail} = request.body;

      if (!payerEmail) {
        response.status(400).json({
          success: false,
          error: "Payer email is required for subscriptions",
        });
        return;
      }

      const courseDoc = await db.collection("courses").doc(courseId).get();
      const course = courseDoc.data();

      if (!course) {
        response.status(404).json({
          success: false,
          error: "Course not found",
        });
        return;
      }

      if (!course.price) {
        response.status(400).json({
          success: false,
          error: "Course price not found",
        });
        return;
      }

      const userDoc = await db.collection("users").doc(userId).get();
      const user = userDoc.data();

      if (!user) {
        response.status(404).json({
          success: false,
          error: "User not found",
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
        functions.logger.info(
          "Subscription created dynamically with init_point:",
          result.init_point
        );
        functions.logger.info("Subscription ID (preapproval_id):", result.id);
        functions.logger.info("External reference:", externalRef);

        try {
          await createCheckoutIntent({
            externalReference: externalRef,
            userId,
            userEmail: user?.email ?? payerEmail ?? null,
            userName:
              user?.display_name ??
              user?.name ??
              user?.fullName ??
              null,
            courseId,
            courseTitle: course.title || null,
            paymentType: "sub",
            subscriptionId: result.id,
          });
        } catch (intentError) {
          functions.logger.error(
            "Failed to create subscription checkout intent",
            intentError
          );
        }

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

        response.json({
          success: true,
          init_point: result.init_point,
          subscription_id: result.id,
        });
        return;
      }

      functions.logger.error("PreApproval API did not return init_point");
      response.status(500).json({
        success: false,
        error: "Failed to create subscription checkout URL",
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
          success: false,
          error: "Por favor ingresa tu correo de Mercado Pago",
          requireAlternateEmail: true,
        });
        return;
      }

      response.status(500).json({
        success: false,
        error: message || "Error creating subscription",
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

      // Log webhook received - log everything for debugging
      functions.logger.info("=== WEBHOOK RECEIVED ===");
      functions.logger.info("Method:", request.method);
      functions.logger.info("Headers:", JSON.stringify(request.headers, null, 2));
      functions.logger.info("Body:", JSON.stringify(request.body, null, 2));
      functions.logger.info("Query:", JSON.stringify(request.query, null, 2));
      functions.logger.info("Type:", request.body?.type);
      functions.logger.info("Action:", request.body?.action);
      functions.logger.info("Full Request:", JSON.stringify({
        method: request.method,
        headers: request.headers,
        body: request.body,
        query: request.query,
      }, null, 2));

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

      // Log all payment data for debugging
      functions.logger.info("=== PAYMENT DATA (FULL) ===");
      functions.logger.info("Payment ID:", paymentId);
      functions.logger.info("Payment Source:", paymentSource);
      functions.logger.info("Payment Status:", paymentData.status);
      functions.logger.info("Payment Data Keys:", Object.keys(paymentData));
      functions.logger.info("Payment Full Data:", JSON.stringify(paymentData, null, 2));

      // Log subscription-specific fields
      functions.logger.info("=== SUBSCRIPTION FIELDS ===");
      functions.logger.info("subscription_id:", paymentData.subscription_id);
      functions.logger.info("preapproval_id:", paymentData.preapproval_id);
      functions.logger.info("external_reference:", paymentData.external_reference);
      functions.logger.info("payer:", JSON.stringify(paymentData.payer, null, 2));
      functions.logger.info("subscription_data:", JSON.stringify(paymentData.subscription_data, null, 2));
      functions.logger.info("date_of_expiration:", paymentData.date_of_expiration);

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
          
          // Only update checkout intent, don't mark as fully processed
          try {
            await updateCheckoutIntent(paymentData?.external_reference, {
              status: paymentData.status,
              state: paymentData.status,
              paymentStatus: paymentData.status,
              paymentId,
              pendingApprovalAt: admin.firestore.FieldValue.serverTimestamp(),
            });
          } catch (intentUpdateError) {
            functions.logger.error(
              "Failed to update checkout intent for pending payment",
              intentUpdateError
            );
          }
          
          // DON'T mark as processed - allow payment.updated to process when approved
          response.status(200).send("OK");
          return;
        }
        
        // For failed/rejected payments, mark as processed to prevent reprocessing
        await processedPaymentsRef.set({
          processed_at: admin.firestore.FieldValue.serverTimestamp(),
          status: paymentData?.status || "unknown",
        });

        try {
          await updateCheckoutIntent(paymentData?.external_reference, {
            status: paymentData?.status || "failed",
            state: paymentData?.status || "failed",
            paymentStatus: paymentData?.status || null,
            paymentId,
            failedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        } catch (intentUpdateError) {
          functions.logger.error(
            "Failed to update checkout intent for non-approved payment",
            intentUpdateError
          );
        }
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

        try {
          await updateCheckoutIntent(paymentData?.external_reference, {
            status: "completed",
            state: "completed",
            completedAt: admin.firestore.FieldValue.serverTimestamp(),
            paymentId,
            paymentStatus: paymentData.status,
            userEmail,
            userName,
            courseTitle,
            subscriptionId:
              paymentData?.subscription_id ?? paymentData?.preapproval_id ?? null,
          });
        } catch (intentUpdateError) {
          functions.logger.error(
            "Failed to update checkout intent for subscription renewal",
            intentUpdateError
          );
        }

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

        try {
          await updateCheckoutIntent(externalReference, {
            status: "already_owned",
            state: "already_owned",
            completedAt: admin.firestore.FieldValue.serverTimestamp(),
            paymentId,
            paymentStatus: paymentData.status,
            userEmail,
            userName,
            courseTitle,
          });
        } catch (intentUpdateError) {
          functions.logger.error(
            "Failed to update checkout intent for already owned course",
            intentUpdateError
          );
        }

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

        try {
          await updateCheckoutIntent(externalReference, {
            status: "failed",
            state: "failed",
            failedAt: admin.firestore.FieldValue.serverTimestamp(),
            failureReason: "Course missing access_duration",
            userEmail,
            userName,
            courseTitle,
          });
        } catch (intentUpdateError) {
          functions.logger.error(
            "Failed to update checkout intent for missing access_duration",
            intentUpdateError
          );
        }

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

      try {
        const completionPayload: Record<string, unknown> = {
          status: "completed",
          state: "completed",
          completedAt: admin.firestore.FieldValue.serverTimestamp(),
          paymentId,
          paymentStatus: paymentData.status,
          userEmail,
          userName,
          courseTitle,
        };

        if (isSubscription) {
          completionPayload.subscriptionId =
            paymentData?.subscription_id ?? paymentData?.preapproval_id ?? null;
        }

        await updateCheckoutIntent(externalReference, completionPayload);
      } catch (intentUpdateError) {
        functions.logger.error(
          "Failed to update checkout intent after completion",
          intentUpdateError
        );
      }

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

        try {
          const externalReference =
            request.body?.data?.external_reference ??
            request.body?.data?.preapproval_id ??
            null;
          await updateCheckoutIntent(externalReference, {
            status: "failed",
            state: "failed",
            failedAt: admin.firestore.FieldValue.serverTimestamp(),
            failureReason: message ?? "Unknown error",
          });
        } catch (intentError) {
          functions.logger.error(
            "Failed to update checkout intent after non-retryable error",
            intentError
          );
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
    response.set("Access-Control-Allow-Headers", "Content-Type");

    if (request.method === "OPTIONS") {
      response.status(204).send("");
      return;
    }

    if (request.method !== "POST") {
      response.status(405).json({
        success: false,
        error: "Method not allowed",
      });
      return;
    }

    try {
      const {
        userId,
        subscriptionId,
        action,
        survey,
      }: {
        userId?: string;
        subscriptionId?: string;
        action?: string;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        survey?: any;
      } = request.body || {};

      if (!userId || !subscriptionId || !action) {
        response.status(400).json({
          success: false,
          error: "Missing userId, subscriptionId, or action",
        });
        return;
      }

      const actionToStatus: Record<string, string> = {
        cancel: "cancelled",
        pause: "paused",
        resume: "authorized",
      };

      const targetStatus = actionToStatus[action];

      if (!targetStatus) {
        response.status(400).json({
          success: false,
          error: "Unsupported action",
        });
        return;
      }

      const subscriptionRef = db
        .collection("users")
        .doc(userId)
        .collection("subscriptions")
        .doc(subscriptionId);

      const subscriptionDoc = await subscriptionRef.get();

      if (!subscriptionDoc.exists) {
        response.status(404).json({
          success: false,
          error: "Subscription not found for user",
        });
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

      response.json({
        success: true,
        status: targetStatus,
      });
    } catch (error: unknown) {
      const message = toErrorMessage(error);
      functions.logger.error("Error updating subscription status:", error);
      response.status(500).json({
        success: false,
        error: message,
      });
    }
  });

export const markStaleCheckoutIntents = functions.pubsub
  .schedule("every 3 hours")
  .onRun(async () => {
    const cutoffDate = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const cutoffTimestamp = admin.firestore.Timestamp.fromDate(cutoffDate);

    try {
      const snapshot = await db
        .collection(CHECKOUT_INTENT_COLLECTION)
        .where("status", "==", "pending")
        .where("startedAt", "<", cutoffTimestamp)
        .limit(200)
        .get();

      if (snapshot.empty) {
        functions.logger.info("No stale checkout intents found");
        return null;
      }

      const batch = db.batch();
      snapshot.docs.forEach((docSnap) => {
        batch.set(
          docSnap.ref,
          {
            status: "abandoned",
            state: "abandoned",
            abandonedAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          {merge: true}
        );
      });

      await batch.commit();
      functions.logger.info(
        `Marked ${snapshot.size} checkout intents as abandoned`
      );
    } catch (error) {
      functions.logger.error("Failed to mark stale checkout intents", error);
    }

    return null;
  });

// Verify Firebase ID token and return custom token for web app
// Used for auto-login when users come from mobile app
export const verifyToken = functions.https.onRequest(async (req, res) => {
  functions.logger.info("verifyToken function called", {
    method: req.method,
    headers: req.headers,
    body: req.body ? {hasToken: !!req.body.token, tokenLength: req.body.token?.length} : null,
  });

  // Enable CORS
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    functions.logger.info("OPTIONS request - returning CORS headers");
    res.status(204).send("");
    return;
  }

  if (req.method !== "POST") {
    functions.logger.warn("Invalid method", {method: req.method});
    res.status(405).json({
      success: false,
      error: "Method not allowed",
    });
    return;
  }

  try {
    const {token} = req.body;

    if (!token) {
      functions.logger.warn("No token provided in request");
      res.status(400).json({
        success: false,
        error: "Token is required",
      });
      return;
    }

    functions.logger.info("Verifying token", {tokenLength: token.length});

    // Verify the ID token from mobile app
    const decodedToken = await admin.auth().verifyIdToken(token);
    const uid = decodedToken.uid;

    functions.logger.info("Token verified", {uid});

    // Create custom token for web app
    const customToken = await admin.auth().createCustomToken(uid);

    functions.logger.info("Custom token created successfully", {
      uid,
      customTokenLength: customToken.length,
    });

    res.json({
      success: true,
      customToken,
    });
  } catch (error: unknown) {
    const message = toErrorMessage(error);
    functions.logger.error("Token verification error:", {
      error: message,
      errorType: error instanceof Error ? error.constructor.name : typeof error,
      stack: error instanceof Error ? error.stack : undefined,
    });
    res.status(401).json({
      success: false,
      error: "Invalid or expired token",
      details: message,
    });
  }
});

// IAP function removed - using MercadoPago only
    response.set("Access-Control-Allow-Origin", "*");
    response.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    response.set("Access-Control-Allow-Headers", "Content-Type");

    if (request.method === "OPTIONS") {
      response.status(204).send("");
      return;
    }

    try {
      const {receipt, transactionId, productId, userId, courseId} = request.body;

      functions.logger.info("📥 IAP receipt verification request received:", {
        transactionId,
        productId,
        userId,
        courseId,
        receiptLength: receipt?.length || 0,
        hasReceipt: !!receipt,
        hasTransactionId: !!transactionId
      });

      if (!receipt || !transactionId || !productId || !userId || !courseId) {
        functions.logger.error("❌ Missing required fields:", {
          hasReceipt: !!receipt,
          hasTransactionId: !!transactionId,
          hasProductId: !!productId,
          hasUserId: !!userId,
          hasCourseId: !!courseId
        });
        response.status(400).json({
          success: false,
          error: "Missing required fields",
        });
        return;
      }

      // Check if transaction already processed
      const processedRef = db
        .collection("processed_iap_transactions")
        .doc(transactionId);

      const processedDoc = await processedRef.get();
      if (processedDoc.exists) {
        functions.logger.info("⚠️ Transaction already processed:", {
          transactionId,
          userId: processedDoc.data()?.userId,
          courseId: processedDoc.data()?.courseId,
          status: processedDoc.data()?.status
        });
        response.json({
          success: true,
          alreadyProcessed: true,
          userId: processedDoc.data()?.userId,
          courseId: processedDoc.data()?.courseId,
        });
        return;
      }
      
      functions.logger.info("🔄 New transaction, proceeding with verification...");

      // Verify with Apple's servers
      // IMPORTANT: Always try sandbox first, then production if needed
      // Status 21007 means receipt is from production but sent to sandbox
      const sandboxURL = "https://sandbox.itunes.apple.com/verifyReceipt";
      const productionURL = "https://buy.itunes.apple.com/verifyReceipt";

      // Type definition for receipt transaction
      type ReceiptTransaction = {
        transaction_id: string;
        product_id: string;
        expires_date_ms?: string;
        expires_date?: string;
        purchase_date_ms?: string;
        purchase_date?: string;
        original_transaction_id?: string;
        is_trial_period?: string;
        is_in_intro_offer_period?: string;
      };

      type ReceiptResponse = {
        status: number;
        receipt?: {
          in_app?: ReceiptTransaction[];
          latest_receipt_info?: ReceiptTransaction[];
        };
      };

      // Get app secret from Firebase Functions secrets
      const appSecret = iapAppSecret.value();

      // Log secret info (first 4 and last 4 chars only for security)
      const secretPreview = appSecret.length > 8 
        ? `${appSecret.substring(0, 4)}...${appSecret.substring(appSecret.length - 4)}`
        : "***";
      functions.logger.info("🔐 Using shared secret:", {
        length: appSecret.length,
        preview: secretPreview,
        hasWhitespace: /\s/.test(appSecret),
        trimmedLength: appSecret.trim().length
      });

      // Apple's recommended approach: Try production first (for TestFlight and App Store)
      // Then fall back to sandbox if needed (for local testing)
      functions.logger.info("🔄 Attempting receipt verification with production URL first (Apple recommended)...");
      
      // Try production first (for TestFlight and App Store purchases)
      let verifyResponse = await fetch(productionURL, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({
          "receipt-data": receipt,
          "password": appSecret.trim(), // Trim any whitespace
          "exclude-old-transactions": true,
        }),
      });

      let verifyResult = await verifyResponse.json() as ReceiptResponse;

      functions.logger.info("📊 Production verification result:", {
        status: verifyResult.status,
        statusDescription: getReceiptStatusDescription(verifyResult.status),
        hasReceipt: !!verifyResult.receipt,
        inAppPurchasesCount: verifyResult.receipt?.in_app?.length || 0
      });

      // If production returns 21007, the receipt is from sandbox (local testing) - retry with sandbox URL
      // Status 21007: "This receipt is from the test environment, but it was sent to the production environment for verification"
      // Status 21008: "This receipt is from the production environment, but it was sent to the test environment for verification"
      if (verifyResult.status === 21007) {
        functions.logger.info("🔄 Production returned 21007 (sandbox receipt), trying sandbox URL...");
        verifyResponse = await fetch(sandboxURL, {
          method: "POST",
          headers: {"Content-Type": "application/json"},
          body: JSON.stringify({
            "receipt-data": receipt,
            "password": appSecret.trim(), // Trim any whitespace
            "exclude-old-transactions": true,
          }),
        });

        verifyResult = await verifyResponse.json() as ReceiptResponse;
        
        functions.logger.info("📊 Sandbox verification result:", {
          status: verifyResult.status,
          statusDescription: getReceiptStatusDescription(verifyResult.status),
          hasReceipt: !!verifyResult.receipt,
          inAppPurchasesCount: verifyResult.receipt?.in_app?.length || 0
        });
      }

      if (verifyResult.status !== 0) {
        functions.logger.error("Apple receipt verification failed:", {
          status: verifyResult.status,
          statusDescription: getReceiptStatusDescription(verifyResult.status)
        });
        response.status(400).json({
          success: false,
          error: "Receipt verification failed",
          status: verifyResult.status,
          statusDescription: getReceiptStatusDescription(verifyResult.status),
        });
        return;
      }

      // Check if transaction is valid
      const receiptInfo = verifyResult.receipt;
      // Use latest_receipt_info if available (more accurate for subscriptions), otherwise fall back to in_app
      const inAppPurchases = receiptInfo?.latest_receipt_info || receiptInfo?.in_app || [];

      functions.logger.info("🔍 Searching for transaction in receipt:", {
        transactionId,
        productId,
        inAppPurchasesCount: inAppPurchases.length,
        transactionIds: inAppPurchases.map(p => p.transaction_id),
        originalTransactionIds: inAppPurchases.map(p => p.original_transaction_id),
        usingLatestReceiptInfo: !!receiptInfo?.latest_receipt_info
      });

      // Try to find transaction by transaction_id first
      let transaction = inAppPurchases.find(
        (purchase: ReceiptTransaction) => purchase.transaction_id === transactionId
      ) as ReceiptTransaction | undefined;

      // If not found, try matching by product_id (for subscriptions, transaction IDs can differ)
      // This handles cases where the purchase object has a different transaction ID than the receipt
      // This is common with subscriptions where orderId might not match receipt transaction_id
      if (!transaction && productId) {
        functions.logger.warn("⚠️ Transaction ID not found, trying to match by product_id:", {
          requestedTransactionId: transactionId,
          productId,
          availableTransactions: inAppPurchases.map(p => ({
            transaction_id: p.transaction_id,
            product_id: p.product_id,
            original_transaction_id: p.original_transaction_id
          }))
        });
        
        // Find by product_id - prioritize most recent transaction for this product
        const matchingByProduct = inAppPurchases.filter(
          (purchase: ReceiptTransaction) => purchase.product_id === productId
        );
        
        if (matchingByProduct.length > 0) {
          // For subscriptions, use the most recent transaction for this product
          // Try to sort by expiration date (most recent expiration = most recent purchase)
          // If no expiration date, fall back to transaction_id comparison
          transaction = matchingByProduct.sort((a, b) => {
            const aExpires = a.expires_date_ms || a.expires_date || '0';
            const bExpires = b.expires_date_ms || b.expires_date || '0';
            if (aExpires !== '0' && bExpires !== '0') {
              return parseInt(bExpires) - parseInt(aExpires); // Most recent expiration first
            }
            // Fall back to transaction_id comparison
            return (b.transaction_id || '').localeCompare(a.transaction_id || '');
          })[0] as ReceiptTransaction;
          
          functions.logger.info("✅ Found transaction by product_id match:", {
            matchedTransactionId: transaction.transaction_id,
            requestedTransactionId: transactionId,
            productId,
            matchedExpiresDate: transaction.expires_date_ms || transaction.expires_date,
            originalTransactionId: transaction.original_transaction_id
          });
        }
      }

      // If still not found, try matching by original_transaction_id (for subscription renewals)
      // This handles cases where the purchase object's orderId matches the original_transaction_id
      if (!transaction && productId) {
        const matchingByOriginal = inAppPurchases.find(
          (purchase: ReceiptTransaction) => {
            // Check if requested transactionId matches original_transaction_id
            if (purchase.original_transaction_id === transactionId) {
              return true;
            }
            // Or if product matches and we have an original_transaction_id
            if (purchase.product_id === productId && purchase.original_transaction_id) {
              return true;
            }
            return false;
          }
        ) as ReceiptTransaction | undefined;
        
        if (matchingByOriginal) {
          transaction = matchingByOriginal;
          functions.logger.info("✅ Found transaction by original_transaction_id match:", {
            matchedTransactionId: transaction.transaction_id,
            originalTransactionId: transaction.original_transaction_id,
            requestedTransactionId: transactionId,
            productId
          });
        }
      }

      if (!transaction) {
        functions.logger.error("❌ Transaction not found in receipt:", {
          requestedTransactionId: transactionId,
          requestedProductId: productId,
          availableTransactionIds: inAppPurchases.map(p => p.transaction_id),
          availableOriginalTransactionIds: inAppPurchases.map(p => p.original_transaction_id),
          availableProductIds: inAppPurchases.map(p => p.product_id)
        });
        response.status(400).json({
          success: false,
          error: "Transaction not found in receipt",
        });
        return;
      }
      
      functions.logger.info("✅ Transaction found in receipt:", {
        transactionId: transaction.transaction_id,
        productId: transaction.product_id,
        expires_date_ms: transaction.expires_date_ms,
        expires_date: transaction.expires_date,
        purchase_date_ms: transaction.purchase_date_ms,
        purchase_date: transaction.purchase_date,
        original_transaction_id: transaction.original_transaction_id
      });

      // Extract dates from receipt (preferred over calculated dates)
      let expirationDate: string | null = null;
      let purchaseDate: string | null = null;
      let renewalDate: string | null = null;

      // Parse expiration date from receipt
      if (transaction.expires_date_ms) {
        expirationDate = new Date(parseInt(transaction.expires_date_ms)).toISOString();
      } else if (transaction.expires_date) {
        expirationDate = new Date(transaction.expires_date).toISOString();
      }

      // Parse purchase date from receipt
      if (transaction.purchase_date_ms) {
        purchaseDate = new Date(parseInt(transaction.purchase_date_ms)).toISOString();
      } else if (transaction.purchase_date) {
        purchaseDate = new Date(transaction.purchase_date).toISOString();
      }

      // Validate user exists
      const userDoc = await db.collection("users").doc(userId).get();
      if (!userDoc.exists) {
        response.status(404).json({
          success: false,
          error: "User not found",
        });
        return;
      }

      // Validate course exists
      const courseDoc = await db.collection("courses").doc(courseId).get();
      if (!courseDoc.exists) {
        response.status(404).json({
          success: false,
          error: "Course not found",
        });
        return;
      }

      const courseDetails = courseDoc.data();
      const courseAccessDuration = courseDetails?.access_duration;

      if (!courseAccessDuration) {
        response.status(400).json({
          success: false,
          error: "Course missing access_duration",
        });
        return;
      }

      // Check if access_duration is a subscription (monthly, yearly, etc. that auto-renews)
      const isSubscription = courseAccessDuration === "monthly" || courseAccessDuration === "yearly";

      // For subscriptions, renewal date is the same as expiration date (when it will renew)
      if (isSubscription && expirationDate) {
        renewalDate = expirationDate;
      }

      // Check if user already owns course
      const existingPurchase = await checkUserOwnsCourse(userId, courseId);
      const isRenewal = existingPurchase && isSubscription;

      // Use receipt dates if available, otherwise calculate
      let finalExpirationDate: string;
      let finalPurchaseDate: string;

      if (expirationDate) {
        // Use receipt expiration date (most accurate)
        finalExpirationDate = expirationDate;
        functions.logger.info("✅ Using expiration date from receipt:", finalExpirationDate);
      } else if (isRenewal) {
        // Subscription renewal: extend expiration date from current expiration
        functions.logger.info("Subscription renewal detected, calculating expiration date:", userId, courseId);
        
        const userData = userDoc.data();
        const currentCourse = (userData?.courses || {})[courseId];
        const currentExpiration = currentCourse?.expires_at ?? null;
        
        finalExpirationDate = calculateExpirationDate(courseAccessDuration, {
          from: currentExpiration ?? undefined,
        });
        
        functions.logger.info(
          "Using calculated expiration date for renewal:",
          finalExpirationDate,
          "Base:",
          currentExpiration
        );
      } else {
        // Initial purchase (subscription or non-subscription) - calculate if no receipt date
        finalExpirationDate = calculateExpirationDate(courseAccessDuration);
        functions.logger.info("Using calculated expiration date:", finalExpirationDate);
      }

      if (purchaseDate) {
        finalPurchaseDate = purchaseDate;
        functions.logger.info("✅ Using purchase date from receipt:", finalPurchaseDate);
      } else {
        finalPurchaseDate = new Date().toISOString();
        functions.logger.info("Using current date as purchase date:", finalPurchaseDate);
      }

      if (existingPurchase && !isSubscription) {
        // Non-subscription already owned - mark as processed
        functions.logger.info("User already owns course (non-subscription), marking transaction as processed");
        await processedRef.set({
          userId,
          courseId,
          productId,
          transactionId,
          processed_at: admin.firestore.FieldValue.serverTimestamp(),
          status: "already_owned",
        });
        response.json({
          success: true,
          alreadyOwned: true,
        });
        return;
      }

      // Use transaction for atomic update
      // Note: Rename receipt transaction to avoid conflict with Firestore transaction parameter
      const receiptTransaction = transaction;
      
      await db.runTransaction(async (firestoreTransaction) => {
        const userRef = db.collection("users").doc(userId);
        const userDoc = await firestoreTransaction.get(userRef);

        if (!userDoc.exists) {
          throw new Error("User not found");
        }

        const userData = userDoc.data();
        const courses = userData?.courses || {};

        // Check if course already assigned (atomic check)
        // For renewals, we want to update even if active (to extend expiration)
        if (courses[courseId] && !isRenewal) {
          const courseData = courses[courseId];
          const isActive = courseData.status === "active";
          const isNotExpired = new Date(courseData.expires_at) > new Date();

          if (isActive && isNotExpired) {
            functions.logger.info("Course already assigned, skipping");
            return;
          }
        }

        // For renewals, keep existing data and just update expiration
        if (isRenewal && courses[courseId]) {
          courses[courseId] = {
            ...courses[courseId],
            expires_at: finalExpirationDate,
            renewal_date: renewalDate || finalExpirationDate, // Store renewal date
            status: "active",
            // Keep all existing data (purchased_at, completedTutorials, etc.)
          };
        } else {
          // Initial purchase: Add course to user (atomic write)
        courses[courseId] = {
          access_duration: courseAccessDuration,
          expires_at: finalExpirationDate,
          renewal_date: renewalDate || finalExpirationDate, // Store renewal date (when subscription will renew)
          status: "active",
          purchased_at: finalPurchaseDate,
          purchase_method: "iap", // Track purchase method
          iap_transaction_id: transactionId, // Store IAP transaction ID
          iap_original_transaction_id: receiptTransaction.original_transaction_id || transactionId, // Store original transaction ID
            is_subscription: isSubscription, // Track if this is a subscription
          title: courseDetails?.title || "Untitled Course",
          image_url: courseDetails?.image_url || null,
          discipline: courseDetails?.discipline || "General",
          creatorName: courseDetails?.creatorName ||
            courseDetails?.creator_name ||
            "Unknown Creator",
          completedTutorials: {
            dailyWorkout: [],
            warmup: [],
            workoutExecution: [],
            workoutCompletion: [],
          },
        };
        }

        // For subscriptions, also create/update subscription document
        if (isSubscription) {
          const subscriptionId = receiptTransaction.original_transaction_id || transactionId;
          const subscriptionRef = db
            .collection("users")
            .doc(userId)
            .collection("subscriptions")
            .doc(subscriptionId);

          const subscriptionData = {
            subscription_id: subscriptionId,
            user_id: userId,
            course_id: courseId,
            course_title: courseDetails?.title || "Subscription",
            status: "active",
            type: "iap", // Mark as IAP subscription
            payer_email: userDoc.data()?.email || null,
            transaction_amount: null, // IAP doesn't provide amount in receipt
            currency_id: null,
            created_at: admin.firestore.FieldValue.serverTimestamp(),
            updated_at: admin.firestore.FieldValue.serverTimestamp(),
            expires_at: admin.firestore.Timestamp.fromDate(new Date(finalExpirationDate)),
            renewal_date: admin.firestore.Timestamp.fromDate(new Date(renewalDate || finalExpirationDate)),
            next_billing_date: admin.firestore.Timestamp.fromDate(new Date(renewalDate || finalExpirationDate)),
            iap_transaction_id: transactionId,
            iap_original_transaction_id: receiptTransaction.original_transaction_id || transactionId,
            iap_product_id: productId,
            purchase_date: admin.firestore.Timestamp.fromDate(new Date(finalPurchaseDate)),
          };

          firestoreTransaction.set(subscriptionRef, subscriptionData, {merge: true});
          
          functions.logger.info("📝 Created/updated IAP subscription document:", {
            subscriptionId,
            courseId,
            expires_at: finalExpirationDate,
            renewal_date: renewalDate || finalExpirationDate
          });
        }

        functions.logger.info("📝 Updating user document with course:", {
          userId,
          courseId,
          courseData: courses[courseId],
          totalCourses: Object.keys(courses).length
        });

        firestoreTransaction.update(userRef, {
          courses: courses,
          purchased_courses: [
            ...new Set([...(userData?.purchased_courses || []), courseId]),
          ],
        });

        // Mark transaction as processed (atomic write)
        firestoreTransaction.set(
          processedRef,
          {
            userId,
            courseId,
            productId,
            transactionId,
            processed_at: admin.firestore.FieldValue.serverTimestamp(),
            status: "approved",
          },
          {merge: true}
        );
      });

      functions.logger.info("✅ IAP purchase processed successfully - transaction committed:", {
        transactionId,
        userId,
        courseId,
        productId
      });

      response.json({
        success: true,
        transactionId,
        courseId,
        userId,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      const stack = error instanceof Error ? error.stack : undefined;
      functions.logger.error("❌ Error verifying IAP receipt:", {
        error: message,
        stack,
        transactionId: request.body?.transactionId,
        userId: request.body?.userId,
        courseId: request.body?.courseId
      });
      response.status(500).json({
        success: false,
        error: message,
      });
    }
  });


