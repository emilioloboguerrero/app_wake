/**
 * Firebase Cloud Functions v1 + Gen2 API
 */

import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import type {Request, Response} from "express";
import {PreApproval} from "mercadopago";
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
import {runDataIntegrity} from "./ops/dataIntegrity.js";
import {runMonthlyDropsPulse} from "./ops/monthlyDropsPulse.js";
import {handleClientErrorsIngest} from "./ops/clientErrorsIngest.js";
import {handleOpsApi} from "./ops/opsApi.js";
import {handleSignalsWebhook} from "./ops/signalsWebhook.js";
import {handleGithubWebhook} from "./ops/githubWebhook.js";
import {handlePosthogAlert} from "./ops/posthogAlerts.js";
import {parseTopicMap, sendTo} from "./ops/telegram.js";
import {
  getClient as sharedGetClient,
  toErrorMessage as sharedToErrorMessage,
} from "./api/services/paymentHelpers.js";
import {
  assertAllowedCallLinkUrl,
  clampPushSenderName,
  redactEmailForLog,
} from "./api/middleware/securityHelpers.js";
import {
  escapeHtml as sharedEscapeHtml,
  generateUnsubscribeToken,
  releaseEmailBudget,
  reserveEmailBudget,
} from "./api/services/emailHelpers.js";
import {buildSignInUrl as buildPurchaseSignInUrl} from "./api/services/purchaseEmails.js";
import {capture as analyticsCapture, flushAnalytics} from "./lib/analytics.js";
import {allLevelPlansPublishAt} from "./api/services/levelResolution.js";
import {reconcileMpRefunds} from "./api/services/refunds.js";

const db = admin.firestore();

const mercadopagoAccessToken = functions.params.defineSecret(
  "MERCADOPAGO_ACCESS_TOKEN"
);

// PostHog server-side analytics. Declared near the top because
// processEmailQueue references it before the other *V2 secret declarations
// further down. `const` is not hoisted; declaration order matters.
const posthogApiKeyV2 = defineSecret("POSTHOG_API_KEY");

const fatSecretClientId = functions.params.defineSecret(
  "FATSECRET_CLIENT_ID"
);
const fatSecretClientSecret = functions.params.defineSecret(
  "FATSECRET_CLIENT_SECRET"
);
const resendApiKey = functions.params.defineSecret("RESEND_API_KEY");
// F-FUNCS-20 + F-NEW-02: HMAC-signed unsubscribe tokens + system email
// budget. Emitted/read by emailHelpers.ts; provisioned in Firebase Secret
// Manager. Each function that mints / verifies the token (any sender +
// the /api/email/unsubscribe route) declares this in its secrets[] list.
const unsubscribeSecret = functions.params.defineSecret("UNSUBSCRIBE_SECRET");

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
const BARCODE_RE = /^\d{8,14}$/;

function isValidBarcode(v: unknown): v is string {
  return typeof v === "string" && BARCODE_RE.test(v);
}

// ─── Shared helpers (delegated to api/services/) ─────────────────────────────
const toErrorMessage = sharedToErrorMessage;


// ─── App Check helper ─────────────────────────────────────────────────────────
// Gen1 first-party callers must present a valid App Check token (M-14). Gen2
// auth middleware skips the check only for the API-key path (third-party
// callers can't obtain App Check tokens) and for the emulator. The two paths
// now share enforcement semantics.
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

function sendAppCheckError(res: Response): void {
  res.status(401).json({
    error: {code: "UNAUTHENTICATED", message: "App Check token inválido"},
  });
}

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
    // Audit M-45: cap input length to prevent denial via huge queries.
    if (emailOrUsername.length > 256) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Consulta demasiado larga"
      );
    }

    // Check caller is creator or admin. Role is sourced from the verified
    // ID-token custom claim (F-MW-08), matching the rest of the codebase.
    // The Firestore users/{uid}.role field is no longer authoritative, and
    // reading it here would (a) cost an extra Firestore read and (b) diverge
    // from the claim-based check used by the Gen2 API.
    const role = (context.auth.token as { role?: string }).role;
    if (role !== "creator" && role !== "admin") {
      throw new functions.https.HttpsError(
        "permission-denied",
        "Solo creadores pueden buscar usuarios"
      );
    }

    // Audit M-45: tighten rate limit on this enumeration-prone endpoint.
    // Gen1 in-memory limiter (10rpm, see checkRateLimit above) is a best-effort
    // backstop while this Gen1 callable is awaiting Phase 3 retirement.
    if (!checkRateLimit(`lookup_${creatorId}`)) {
      throw new functions.https.HttpsError(
        "resource-exhausted",
        "Demasiadas búsquedas. Intenta en un momento."
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

    // Audit M-45: return only userId + display fields + masked email. The
    // previous response shipped age/gender/country/city/height/weight to a
    // creator-scoped lookup, which combined with C-10 made the endpoint a
    // directory-harvester. The dashboard's invite flow only needs enough
    // information to confirm the right person.
    let emailMasked: string | null = null;
    if (email) {
      const at = email.indexOf("@");
      if (at > 0 && at < email.length - 1) {
        const local = email.slice(0, at);
        const domain = email.slice(at + 1);
        const visible = local.length <= 2 ? local.slice(0, 1) : local.slice(0, 2);
        emailMasked = `${visible}***@${domain}`;
      }
    }
    // Reference userDocData so the eslint unused-var rule passes after the
    // PII calc block was removed.
    void userDocData;
    return {
      userId,
      displayName: displayName || undefined,
      username: username || undefined,
      emailMasked,
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
//
// F-FUNCS-14: ALWAYS seed role: "user" and stamp claim {role: "user"}.
// Privilege escalation prereq closed — even if an attacker pre-writes a role
// onto a stub Firestore user doc (which F-RULES-01 also prevents), this
// handler does not read that field. Promotion to creator/admin happens via a
// separate, Admin-SDK-only path (e.g. /creator/register issuing claims after
// gating checks), never inferred from existing Firestore state.
export const onUserCreated = functions.auth.user().onCreate(async (user: admin.auth.UserRecord) => {
  try {
    const docRef = db.collection("users").doc(user.uid);
    const existing = await docRef.get();

    if (existing.exists) {
      // Doc may exist if /creator/register or another bootstrap ran first.
      // Patch only stub fields — never read or trust an existing role.
      const data = existing.data() || {};
      const patch: Record<string, unknown> = {};
      if (!data.email) patch.email = user.email ?? null;
      if (!data.displayName) patch.displayName = user.displayName ?? null;
      if (!data.created_at) patch.created_at = admin.firestore.FieldValue.serverTimestamp();
      if (Object.keys(patch).length > 0) {
        await docRef.update(patch);
      }
      functions.logger.info("onUserCreated: doc already existed, patched missing fields", {uid: user.uid});
    } else {
      await docRef.set({
        role: "user",
        email: user.email ?? null,
        displayName: user.displayName ?? null,
        created_at: admin.firestore.FieldValue.serverTimestamp(),
      });
      functions.logger.info("onUserCreated: bootstrapped user doc", {uid: user.uid});
    }
  } catch (error) {
    functions.logger.error("onUserCreated: failed to bootstrap user doc", {
      uid: user.uid,
      error: toErrorMessage(error),
    });
  }

  try {
    await admin.auth().setCustomUserClaims(user.uid, {role: "user"});
  } catch (err) {
    functions.logger.warn("onUserCreated: setCustomUserClaims failed", {
      uid: user.uid,
      error: toErrorMessage(err),
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
    // Audit M-40: strip control + bidi-override chars from event title before
    // using in the email Subject header. Resend normalizes header values, so
    // CRLF injection isn't exploitable, but bidi overrides can spoof the
    // recipient's inbox display. Cap length to keep the subject readable.
    const rawTitle = (event.title as string) ?? "Evento Wake";
    const sanitizedTitle = Array.from(rawTitle)
      .filter((ch) => {
        const code = ch.charCodeAt(0);
        if (code < 0x20 || (code >= 0x7f && code <= 0x9f)) return false;
        // Bidi override range: U+202A-U+202E, U+2066-U+2069
        if (code >= 0x202A && code <= 0x202E) return false;
        if (code >= 0x2066 && code <= 0x2069) return false;
        return true;
      })
      .join("")
      .trim()
      .slice(0, 120) || "Evento Wake";
    const eventTitleRaw = sanitizedTitle;
    const eventTitle = escapeHtml(eventTitleRaw);
    const confirmationMsg = escapeHtml(
      ((event.settings as Record<string, unknown>)?.confirmation_message as string | undefined) ??
        "¡Tu lugar está confirmado! Nos vemos en el evento."
    );
    const checkInToken = reg.check_in_token as string | undefined;
    // F-2026-05-02: events.image_url is interpolated into a CSS
    // background-image url('...') context. escapeHtml-only made the email a
    // CSS-injection sink — once the browser HTML-decodes the style attribute,
    // a single quote turns back into a CSS string terminator.
    //
    // The PATCH /creator/events/:eventId path already enforces assertHttpsUrl
    // (events.ts:444), but the events firestore rule has no shape constraint
    // on image_url, so a creator with a Firebase ID token can write the
    // malicious value directly via the JS SDK and bypass the API guard.
    // Re-validate here at email-send time, drop the URL on any failure, and
    // skip escaping (URL spec already forbids `'` and `)` in components a
    // server emits, so the URL is safe to interpolate inside url('…') as-is).
    const eventImageUrl = (() => {
      const raw = event.image_url;
      if (typeof raw !== "string" || !raw) return "";
      try {
        const u = new URL(raw);
        if (u.protocol !== "https:") return "";
        if (u.username || u.password) return "";
        const href = u.toString();
        // Final paranoia stop: reject any character that would break out of
        // the url('…') CSS string or the HTML attribute. Standards-compliant
        // URLs never contain these unencoded.
        if (/['")<>]/.test(href)) return "";
        if (href.length > 2048) return "";
        return href;
      } catch {
        return "";
      }
    })();

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
      // F-NEW-02: reserve 1 email from the system-wide daily budget. If the
      // ceiling is hit, this throws and the catch below logs the failure
      // without sending. Stops a single attacker / runaway loop from running
      // up the Resend bill for the whole platform.
      await reserveEmailBudget(1);
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
        await releaseEmailBudget(1);
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

    // Per-timer try/catch + claim-first prevents two failure modes that drove
    // the April 2026 17% 5xx rate on this cron:
    //   1) A single bad timer (missing userId, doc deleted concurrently, sub
    //      query failure) used to throw out of the for-loop and 5xx the whole
    //      tick — every other valid timer in the batch was silently dropped
    //      and Cloud Scheduler retried the run. Now each timer is isolated.
    //   2) The 30s look-ahead window plus a slow tick let the next minute's
    //      run pick up the same pending timer before the previous run flipped
    //      `status: "sent"`. Claiming the timer before sending pushes
    //      ("processing"→"sent") makes it single-shot regardless of timing.
    let processed = 0;
    let failed = 0;
    for (const timerDoc of pendingSnap.docs) {
      try {
        const timer = timerDoc.data();
        const userId = timer.userId as string | undefined;
        if (!userId) {
          // Malformed timer — flip to skipped so we don't see it again.
          await timerDoc.ref.update({status: "skipped"});
          functions.logger.warn(
            "processRestTimerNotifications: timer missing userId",
            {timerId: timerDoc.id}
          );
          continue;
        }

        // Claim the timer first. If two ticks race, only one will see
        // status="pending" — the other's transactional read will treat it as
        // already-claimed and skip it. Push send happens after the claim,
        // so worst case is a missed notification (better than a duplicate
        // "Descanso terminado" arriving 60s later).
        const claimed = await db.runTransaction(async (tx) => {
          const fresh = await tx.get(timerDoc.ref);
          if (!fresh.exists) return false;
          if ((fresh.data()?.status as string) !== "pending") return false;
          tx.update(timerDoc.ref, {status: "sent"});
          return true;
        });
        if (!claimed) continue;

        const metadata = (timer.metadata || {}) as Record<string, unknown>;
        const exerciseName =
          (metadata.exerciseName as string) || "tu ejercicio";

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
        processed++;
      } catch (err: unknown) {
        // Don't let one bad timer 5xx the whole tick.
        failed++;
        functions.logger.error(
          "processRestTimerNotifications: timer failed",
          {
            timerId: timerDoc.id,
            err: err instanceof Error ? err.message : String(err),
          }
        );
      }
    }

    functions.logger.info(
      `Processed ${processed} rest timer notification(s), ${failed} failed`
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
        if (dn.trim()) senderName = clampPushSenderName(dn);
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
          // Audit H-27: quote senderName so a creator-controlled display name
          // can't impersonate a system verb ("Wake admin: tu cuenta..."). The
          // display name was already clamped to PUSH_SENDER_NAME_MAX above.
          const title = isToCoach ?
            `Nuevo video de "${senderName}"` :
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
      // Client recipient: bake a magic-link so the bare URL doesn't land them
      // on the InstallScreen with no path back. Deep-link to the specific
      // exchange so a tap on the email opens the thread, not just home.
      // App.web.js's bypass list includes /video-exchange/* so the
      // unauthenticated browser doesn't get the install gate.
      // Coach recipient stays on the creator dashboard (its own SPA, its
      // own auth flow).
      const ctaUrl = isToCoach ?
        "https://wakelab.co/creators/inbox" :
        await buildPurchaseSignInUrl(toEmail, `/video-exchange/${exchangeId}`);
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
        // Audit M-27: redact recipient email in info log (PII).
        functions.logger.info("sendVideoExchangeNotification: email sent", {exchangeId, messageId, toEmail: redactEmailForLog(toEmail)});
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

// Spans ~10h so a send survives a provider daily-quota exhaustion. The old
// [2, 5, 15, 60] burned every attempt inside 82 minutes, which is shorter than
// any daily quota window — a quota hit at 19:00 permanently failed recipients
// that would have gone out fine after the reset.
const RETRY_BACKOFF_MINUTES = [2, 5, 15, 60, 180, 360]; // entries[i] = wait after attempt i
const MAX_ATTEMPTS = RETRY_BACKOFF_MINUTES.length + 1; // first attempt + 6 retries = 7
const BATCH_SIZE = 100; // Resend batch API max
const PENDING_FETCH_LIMIT = 200; // oversample so we can filter out in-backoff docs
const MAX_BATCHES_PER_TICK = 5; // bounds tick duration; 500 emails/tick/send

type TransientOrPermanent = "transient" | "permanent";

function classifyResendError(
  message: string | null | undefined,
  // True when every address in the failed batch passed our own EMAIL_RE check.
  // Resend intermittently rejects whole batches of well-formed addresses with
  // an "Invalid `to` field" message (observed in prod: batches of 100 and 65
  // rejected, the same addresses delivered fine in batches of 16). Since a
  // batch call is all-or-nothing, believing that message drops every valid
  // recipient in the batch on the first attempt. When we have already verified
  // the shape of all of them, the complaint cannot be true — retry instead.
  addressesPreValidated = false
): TransientOrPermanent {
  if (!message) return "transient";
  const m = message.toLowerCase();
  const addressShaped =
    m.includes("invalid") && (m.includes("email") || m.includes("address") || m.includes("from"));
  if (addressShaped && addressesPreValidated) return "transient";
  // Clearly permanent — retrying won't help
  if (m.includes("validation")) return "permanent";
  if (addressShaped) return "permanent";
  if (m.includes("not verified") || m.includes("domain is not verified")) return "permanent";
  if (m.includes("forbidden") || m.includes("unauthorized") || m.includes("api key") || m.includes("api token")) {
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
    // Was "every 1 minutes" — that produced ~28k invocations / month for
    // creator broadcast email sends, which are not time-critical (recipients
    // do not notice 5 minutes). 5-minute cadence cuts invocations 5× while
    // batched retries + Resend's own backoff still drain queues promptly.
    schedule: "every 5 minutes",
    region: "us-central1",
    secrets: [resendApiKey, unsubscribeSecret, posthogApiKeyV2],
    memory: "512MiB",
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

        // Resend rejects the ENTIRE batch call if a single recipient address is
        // malformed, which previously failed all ~100 valid recipients in the
        // batch. Partition out invalid addresses, mark just those failed, and
        // send only the valid ones.
        const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        const isValidEmail = (d: admin.firestore.QueryDocumentSnapshot) =>
          EMAIL_RE.test(String(d.data().email ?? "").trim());
        const invalidDocs = batchDocs.filter((d) => !isValidEmail(d));
        const validDocs = batchDocs.filter(isValidEmail);

        if (invalidDocs.length > 0) {
          const invalidBatch = db.batch();
          for (const doc of invalidDocs) {
            invalidBatch.update(doc.ref, {
              status: "failed",
              attemptCount: ((doc.data().attemptCount as number | undefined) || 0) + 1,
              error: "Correo inválido",
              lastError: "Correo inválido",
            });
          }
          await invalidBatch.commit();
          failedThisTick += invalidDocs.length;
        }

        if (validDocs.length === 0) {
          // Nothing sendable in this slice; the invalid docs are now failed and
          // won't be re-fetched as pending. Move to the next batch.
          continue;
        }

        // Build the Resend batch payload
        const batchPayload = validDocs.map((doc) => {
          const r = doc.data();
          const email = r.email as string;
          const name = (r.name as string) || "";

          // F-FUNCS-20: HMAC-signed token via the shared helper (reads
          // UNSUBSCRIBE_SECRET from this function's secrets[] env).
          const unsubToken = generateUnsubscribeToken(email, creatorId);
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

        // F-NEW-02: reserve N emails from the daily budget before firing
        // the batch. If exhausted, mark every doc in this batch as failed
        // with a budget error so the queue can resume tomorrow.
        let batchErrorMsg: string | null = null;
        let budgetReserved = false;
        try {
          await reserveEmailBudget(batchPayload.length);
          budgetReserved = true;
        } catch (err: unknown) {
          batchErrorMsg = err instanceof Error ? err.message : "Email budget error";
        }
        if (!batchErrorMsg) {
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const response: any = await resend.batch.send(batchPayload as any);
            if (response && response.error) {
              batchErrorMsg = response.error.message || "Resend batch error";
            }
          } catch (err: unknown) {
            batchErrorMsg = err instanceof Error ? err.message : "Unknown batch error";
          }
        }

        // Apply results to all recipient docs in this batch atomically
        const writeBatch = db.batch();
        if (!batchErrorMsg) {
          // All succeeded
          for (const doc of validDocs) {
            writeBatch.update(doc.ref, {
              status: "sent",
              sentAt: admin.firestore.FieldValue.serverTimestamp(),
            });
          }
          await writeBatch.commit();
          sentThisTick += validDocs.length;
        } else {
          // Nothing left Resend, so give the reservation back — otherwise the
          // daily ceiling counts attempts and a retry loop starves every other
          // sender on the platform. Skipped when the reservation itself was
          // what failed; there is nothing to return in that case.
          if (budgetReserved) await releaseEmailBudget(batchPayload.length);
          // validDocs all passed EMAIL_RE above, so an address-shaped complaint
          // from Resend is not attributable to any of them.
          const errorKind = classifyResendError(batchErrorMsg, true);
          let retriedNow = 0;
          let failedNow = 0;
          for (const doc of validDocs) {
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

          // L-35: Resend echoes parts of raw from/subject in error messages.
          // Truncate + redact email-shaped substrings before they hit Cloud
          // Logging where they'd be searchable + retained.
          const safeBatchErr = batchErrorMsg ?
            batchErrorMsg
              .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "***@***")
              .slice(0, 240) :
            null;
          functions.logger.warn("processEmailQueue: batch failed", {
            sendId: sendDoc.id,
            batchSize: batchDocs.length,
            errorKind,
            retried: retriedNow,
            failed: failedNow,
            error: safeBatchErr,
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

      if (sentThisTick > 0 && creatorId) {
        try {
          analyticsCapture({
            distinctId: creatorId,
            event: "email.batch_sent",
            properties: {
              send_id: sendDoc.id,
              type: sendType,
              count: sentThisTick,
              failed: failedThisTick,
            },
          });
        } catch {
          // ignore — analytics is best-effort
        }
      }

      functions.logger.info("processEmailQueue: tick processed", {
        sendId: sendDoc.id,
        batches: batchesThisTick,
        sent: sentThisTick,
        failed: failedThisTick,
        retried: retriedThisTick,
      });
    }
    await flushAnalytics();
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
// Polar (merchant-of-record) — international card subscriptions. MercadoPago
// stays for Colombia; provider is routed per-country in the PWA. See
// docs/superpowers/specs/2026-07-01-polar-international-payments-design.md
const polarAccessTokenV2 = defineSecret("POLAR_ACCESS_TOKEN");
const polarWebhookSecretV2 = defineSecret("POLAR_WEBHOOK_SECRET");

export const api = onRequest(
  {
    region: "us-central1",
    // 512MiB ≈ doubles CPU per request vs 256MiB. The lab endpoint
    // parallelizes 7 Firestore queries + a 30-doc library batch + photo
    // signing + JSON serialization; tighter memory was a measurable bottleneck.
    memory: "512MiB",
    timeoutSeconds: 60,
    concurrency: 80,
    // Was minInstances=1 in prod (~$44–85/mo idle keep-warm for ~31 req/hr).
    // Cold start on this Express app is ~1–2s; not worth the spend.
    minInstances: 0,
    secrets: [
      fatSecretClientIdV2,
      fatSecretClientSecretV2,
      resendApiKeyV2,
      mercadopagoAccessTokenV2,
      mercadopagoWebhookSecretV2,
      polarAccessTokenV2,
      polarWebhookSecretV2,
      vapidPublicKey,
      vapidPrivateKey,
      // F-FUNCS-20: /email/unsubscribe lives in this Gen2 export and calls
      // verifyUnsubscribeToken → emailHelpers.unsubscribeSecret(), which
      // throws if process.env.UNSUBSCRIBE_SECRET is absent. Without this
      // binding, every unsubscribe link returns "Enlace inválido" in prod.
      unsubscribeSecret,
      // Cost/behavior telemetry — server-side PostHog. Optional: when the
      // secret is unset the analytics module silently no-ops.
      posthogApiKeyV2,
    ],
  },
  app
);

// ─── Event / creator page shared HTML loader ────────────────────────────────

// 5-minute TTL — long enough to absorb most cold-start savings, short enough
// that a hosting deploy propagates to long-lived function instances quickly.
const INDEX_HTML_TTL_MS = 5 * 60 * 1000;
// Hard timeout on the upstream fetch so a stuck hosting deploy can't pin a
// 256MiB function instance for the platform default (~30s) and exceed our
// configured timeoutSeconds.
const INDEX_HTML_FETCH_TIMEOUT_MS = 3000;

let cachedIndexHtml: string | null = null;
let cachedIndexHtmlAt = 0;

async function getIndexHtml(): Promise<string | null> {
  if (cachedIndexHtml && Date.now() - cachedIndexHtmlAt < INDEX_HTML_TTL_MS) {
    return cachedIndexHtml;
  }

  // Fetch live from hosting — always in sync with deployed assets
  try {
    const resp = await fetch("https://wakelab.co/index.html", {
      signal: AbortSignal.timeout(INDEX_HTML_FETCH_TIMEOUT_MS),
    });
    if (resp.ok) {
      cachedIndexHtml = await resp.text();
      cachedIndexHtmlAt = Date.now();
      return cachedIndexHtml;
    }
  } catch {
    // fall through; null signals "serve a 503"
  }

  // If we have a previously-cached copy, serve it stale rather than 503ing.
  if (cachedIndexHtml) return cachedIndexHtml;
  return null;
}

// CR-7: function-rewritten responses bypass the Firebase Hosting `headers`
// rules (those apply only to static content), so every function that returns
// SPA HTML must emit the same security headers itself. Mirrors the `/app/**`
// CSP in firebase.json since the served bundle IS the SPA and runs the same
// Firebase Auth, App Check, and reCAPTCHA code paths.
const STOREFRONT_HTML_CSP =
  "default-src 'self'; " +
  "script-src 'self' 'unsafe-inline' https://www.gstatic.com https://www.googleapis.com https://apis.google.com https://www.google.com https://www.recaptcha.net; " +
  "connect-src 'self' https://*.googleapis.com https://*.firebaseio.com https://*.cloudfunctions.net https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://firebaseinstallations.googleapis.com https://firebaseappcheck.googleapis.com https://firebasestorage.googleapis.com wss://*.firebaseio.com; " +
  "img-src 'self' data: blob: https://firebasestorage.googleapis.com https://lh3.googleusercontent.com https://*.googleusercontent.com; " +
  "style-src 'self' 'unsafe-inline'; " +
  "font-src 'self' data: https://fonts.gstatic.com; " +
  "frame-src 'self' https://www.google.com https://www.recaptcha.net https://wakelab.firebaseapp.com https://wolf-20b8b.firebaseapp.com https://accounts.google.com; " +
  "frame-ancestors 'none'; base-uri 'self'; form-action 'self';";

function setStorefrontHtmlSecurityHeaders(res: {set(k: string, v: string): unknown}): void {
  res.set("Content-Security-Policy", STOREFRONT_HTML_CSP);
  res.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  res.set("X-Content-Type-Options", "nosniff");
  res.set("Referrer-Policy", "strict-origin-when-cross-origin");
  res.set("X-Frame-Options", "DENY");
  res.set(
    "Permissions-Policy",
    "interest-cohort=(), geolocation=(), microphone=(), camera=(), payment=(self), usb=()"
  );
}

// H-1: lightweight per-IP throttle on the OG-rewriting functions. They sit
// outside the Express api function (no checkIpRateLimit), so without this an
// attacker can grind /aaaa, /aaab, ... at near-zero cost while burning
// Firestore reads. 60 req/min/IP per function is generous for legit traffic
// (one IP-bound IG bot scraping previews) and catches enumeration loops.
const PAGE_FN_IP_RATE_WINDOW_MS = 60_000;
const PAGE_FN_IP_RATE_LIMIT = 60;
const pageFnIpHits = new Map<string, {count: number; reset: number}>();

function clientIpFromReq(req: {ip?: string; ips?: string[]; get(k: string): string | undefined}): string {
  if (req.ips && req.ips.length > 0) return req.ips[0];
  if (req.ip) return req.ip;
  const fwd = req.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return "unknown";
}

function pageFnRateLimited(
  req: {ip?: string; ips?: string[]; get(k: string): string | undefined}
): boolean {
  const ip = clientIpFromReq(req);
  const now = Date.now();
  const entry = pageFnIpHits.get(ip);
  if (!entry || now > entry.reset) {
    pageFnIpHits.set(ip, {count: 1, reset: now + PAGE_FN_IP_RATE_WINDOW_MS});
    // Opportunistic GC so the Map doesn't grow unbounded across cold instances.
    if (pageFnIpHits.size > 5000) {
      for (const [k, v] of pageFnIpHits) {
        if (now > v.reset) pageFnIpHits.delete(k);
      }
    }
    return false;
  }
  entry.count += 1;
  return entry.count > PAGE_FN_IP_RATE_LIMIT;
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
    memory: "512MiB",
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
    if (pageFnRateLimited(req)) {
      res.set("Retry-After", "60");
      res.status(429).send("Too many requests");
      return;
    }
    const eventId = match[1];

    let html = await getIndexHtml();
    if (!html) {
      // Hosting unreachable AND no stale cache. Tell the caller to retry.
      res.set("Retry-After", "5");
      res.status(503).send("Service temporarily unavailable");
      return;
    }

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

    setStorefrontHtmlSecurityHeaders(res);
    res.set("Cache-Control", "public, max-age=300, s-maxage=600");
    res.status(200).send(html);
  }
);

// Serves /d/{docId} with the document's own OG tags baked in, so a link
// pasted into WhatsApp or Instagram previews the cover and title instead of the
// generic landing card. Same shape as eventPage: on any read failure it falls
// through to the untouched index.html rather than failing the page.
export const documentPage = onRequest(
  {
    region: "us-central1",
    memory: "512MiB",
    timeoutSeconds: 10,
    concurrency: 80,
  },
  async (req, res) => {
    const match = req.path.match(/^\/d\/([a-zA-Z0-9_-]+)/);
    if (!match) {
      res.status(404).send("Not found");
      return;
    }
    if (pageFnRateLimited(req)) {
      res.set("Retry-After", "60");
      res.status(429).send("Too many requests");
      return;
    }
    const docId = match[1];

    let html = await getIndexHtml();
    if (!html) {
      res.set("Retry-After", "5");
      res.status(503).send("Service temporarily unavailable");
      return;
    }

    try {
      const snap = await db.collection("public_documents").doc(docId).get();
      const data = snap.data();
      if (snap.exists && data?.status === "active") {
        const title = (data.title as string) || "Documento Wake";
        let description = "Descárgalo gratis en Wake";
        if (typeof data.creator_id === "string" && data.creator_id) {
          const creatorSnap = await db.collection("users").doc(data.creator_id).get();
          const creator = creatorSnap.data();
          const name = (creator?.displayName as string) || (creator?.name as string) || null;
          if (name) description = `Un documento de ${name}. Descárgalo gratis.`;
        }
        const coverPath = typeof data.cover_path === "string" ? data.cover_path : null;
        const rawCover = coverPath ?
          `https://firebasestorage.googleapis.com/v0/b/${admin.storage().bucket().name}` +
            `/o/${encodeURIComponent(coverPath)}?alt=media` :
          null;
        const ogImage = safeImageUrl(rawCover, "/app_icon.png");

        html = html
          .replace(/<meta property="og:title"[^>]*>/, `<meta property="og:title" content="${escapeOgAttr(title)}" />`)
          .replace(/<meta property="og:description"[^>]*>/, `<meta property="og:description" content="${escapeOgAttr(description)}" />`)
          .replace(/<meta property="og:image"[^>]*>/, `<meta property="og:image" content="${escapeOgAttr(ogImage)}" />`)
          .replace(/<meta property="og:url"[^>]*>/, `<meta property="og:url" content="https://wakelab.co/d/${docId}" />`)
          .replace(/<meta name="twitter:title"[^>]*>/, `<meta name="twitter:title" content="${escapeOgAttr(title)}" />`)
          .replace(/<meta name="twitter:description"[^>]*>/, `<meta name="twitter:description" content="${escapeOgAttr(description)}" />`)
          .replace(/<meta name="twitter:image"[^>]*>/, `<meta name="twitter:image" content="${escapeOgAttr(ogImage)}" />`)
          .replace(/<title>[^<]*<\/title>/, `<title>${escapeOgAttr(title)} — Wake</title>`);
      }
    } catch (err) {
      functions.logger.error("documentPage Firestore read failed:", err);
    }

    setStorefrontHtmlSecurityHeaders(res);
    res.set("Cache-Control", "public, max-age=300, s-maxage=600");
    res.status(200).send(html);
  }
);

function escapeOgAttr(s: string): string {
  // L-34: cover the full HTML special-char set so the helper stays safe if
  // a future change moves any of these meta values into a single-quoted attr
  // or inline JSON-LD where >, ' would otherwise turn into XSS sinks.
  // Also strip ASCII control chars / null bytes which can prematurely
  // terminate attribute parsing in some HTML parsers.
  return s
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x1F\x7F]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Reject non-https URLs in places that would be rendered as <img src> or
// crawled by social bots. A creator-controlled `image_url` set to e.g.
// "javascript:..." would otherwise render as `<meta property="og:image"
// content="javascript:..." />` and some crawlers do dereference it.
function safeImageUrl(raw: unknown, fallback: string): string {
  if (typeof raw !== "string") return fallback;
  const trimmed = raw.trim();
  if (!trimmed.startsWith("https://")) return fallback;
  return trimmed;
}

// ─── Creator storefront page with dynamic OG tags ───────────────────────────
//
// Serves wakelab.co/{username} and wakelab.co/{username}/{programId}.
// Looks up the creator (and optionally a program), rewrites OG meta tags so
// shared links render rich previews on WhatsApp / IG / Twitter, then returns
// the SPA HTML for the landing app to hydrate.

import {isReservedUsername} from "./api/utils/reservedUsernames.js";

const CREATOR_USERNAME_RE = /^[a-z0-9_-]{1,50}$/;
const CREATOR_PROGRAM_ID_RE = /^[A-Za-z0-9_-]{1,128}$/;

function applyOgTags(
  html: string,
  opts: {
    title: string;
    description: string;
    image: string;
    url: string;
  }
): string {
  return html
    .replace(/<meta property="og:title"[^>]*>/, `<meta property="og:title" content="${escapeOgAttr(opts.title)}" />`)
    .replace(/<meta property="og:description"[^>]*>/, `<meta property="og:description" content="${escapeOgAttr(opts.description)}" />`)
    .replace(/<meta property="og:image"[^>]*>/, `<meta property="og:image" content="${escapeOgAttr(opts.image)}" />`)
    .replace(/<meta property="og:url"[^>]*>/, `<meta property="og:url" content="${escapeOgAttr(opts.url)}" />`)
    .replace(/<meta name="twitter:title"[^>]*>/, `<meta name="twitter:title" content="${escapeOgAttr(opts.title)}" />`)
    .replace(/<meta name="twitter:description"[^>]*>/, `<meta name="twitter:description" content="${escapeOgAttr(opts.description)}" />`)
    .replace(/<meta name="twitter:image"[^>]*>/, `<meta name="twitter:image" content="${escapeOgAttr(opts.image)}" />`)
    .replace(/<title>[^<]*<\/title>/, `<title>${escapeHtml(opts.title)} — Wake</title>`);
}

export const creatorPage = onRequest(
  {
    region: "us-central1",
    memory: "512MiB",
    timeoutSeconds: 10,
    concurrency: 80,
  },
  async (req, res) => {
    if (pageFnRateLimited(req)) {
      res.set("Retry-After", "60");
      res.status(429).send("Too many requests");
      return;
    }

    // Match /{username} OR /{username}/{programId}.
    // Reject any deeper path so reserved sub-routes (/comprado etc.) handled
    // by the SPA don't accidentally trigger this function — Hosting only
    // rewrites two-segment paths to us anyway, but defense in depth.
    const match = req.path.match(/^\/([^/]+)(?:\/([^/]+))?\/?$/);

    // H-12: hosting rewrites accept upper- and lowercase, but usernames are
    // canonicalized to lowercase. 301-redirect any path that contains capital
    // letters in the username segment so OG bots see one canonical URL.
    if (match) {
      const rawUser = match[1] || "";
      if (rawUser !== rawUser.toLowerCase()) {
        const canonicalPath = "/" + rawUser.toLowerCase() +
          (match[2] ? "/" + match[2] : "");
        res.set("Cache-Control", "public, max-age=86400");
        res.redirect(301, canonicalPath);
        return;
      }
    }

    let html = await getIndexHtml();
    if (!html) {
      res.set("Retry-After", "5");
      res.status(503).send("Service temporarily unavailable");
      return;
    }

    const fallbackImage = "https://wakelab.co/app_icon.png";
    const send = (status = 200) => {
      setStorefrontHtmlSecurityHeaders(res);
      // No `Vary: User-Agent` — the response body is identical for all UAs and
      // varying on it would shred the CDN hit rate.
      res.set("Cache-Control", "public, max-age=60, s-maxage=300, stale-while-revalidate=86400");
      res.status(status).send(html);
    };

    if (!match) {
      send();
      return;
    }

    // H-12: hosting accepts only [a-z0-9_-] but defense-in-depth lowercase
    // here lets us still match if a future hosting rewrite admits uppercase.
    const usernameRaw = (match[1] || "").toLowerCase();
    const programId = match[2] || null;

    if (!CREATOR_USERNAME_RE.test(usernameRaw) || isReservedUsername(usernameRaw)) {
      send();
      return;
    }
    if (programId && !CREATOR_PROGRAM_ID_RE.test(programId)) {
      send();
      return;
    }

    try {
      const userSnap = await db
        .collection("users")
        .where("username", "==", usernameRaw)
        .limit(1)
        .get();
      if (userSnap.empty) {
        send();
        return;
      }
      const userDoc = userSnap.docs[0];
      const userData = userDoc.data();
      if (userData.role !== "creator" && userData.role !== "admin") {
        send();
        return;
      }

      const displayName = (userData.displayName as string) ||
        (userData.name as string) || usernameRaw;
      const profileImage = safeImageUrl(
        userData.profilePictureUrl ?? userData.profile_picture_url,
        fallbackImage
      );
      const bio = (userData.bio as string) || "";

      if (!programId) {
        // Profile page
        html = applyOgTags(html, {
          title: `${displayName} — Wake`,
          description: bio.slice(0, 160) || `Programas de ${displayName} en Wake`,
          image: profileImage,
          url: `https://wakelab.co/${usernameRaw}`,
        });
        send();
        return;
      }

      // Program detail page
      const programDoc = await db.collection("courses").doc(programId).get();
      if (!programDoc.exists) {
        send();
        return;
      }
      const programData = programDoc.data() ?? {};
      if (
        programData.creator_id !== userDoc.id ||
        programData.status !== "published"
      ) {
        send();
        return;
      }

      const programTitle = (programData.title as string) || "Programa";
      const programDescription = (programData.description as string) || "";
      const programImage = safeImageUrl(programData.image_url, profileImage);

      html = applyOgTags(html, {
        title: `${programTitle} — ${displayName}`,
        description: programDescription.slice(0, 160) ||
          `${programTitle} en Wake con ${displayName}`,
        image: programImage,
        url: `https://wakelab.co/${usernameRaw}/${programId}`,
      });
      send();
    } catch (err) {
      functions.logger.error("creatorPage failed:", err);
      send();
    }
  }
);

// ─── Scheduled: expand weekly availability templates into concrete slots ───
export const expandWeeklyAvailability = onSchedule(
  {
    schedule: "every day 03:00",
    region: "us-central1",
    timeoutSeconds: 300,
    memory: "512MiB",
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
    memory: "512MiB",
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
        // Audit M-28: redact recipient email in error log.
        functions.logger.error("sendCallReminders: email failed", {to: redactEmailForLog(to), error: String(err)});
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

    // F-2026-05-03: callLink is creator-controlled and rendered as <a href>
    // in the branded reminder email. POST /v1/creator/bookings/.../callLink
    // already runs assertAllowedCallLinkUrl, but the call_bookings firestore
    // rule lets the creator update arbitrary fields directly via the JS SDK
    // — which would let a creator slip a phishing or javascript: URL past the
    // API guard. Re-validate per booking here; on failure drop the URL so the
    // CTA button is omitted but the rest of the reminder still goes out.
    function safeCallLink(raw: unknown): string {
      if (typeof raw !== "string" || !raw) return "";
      try {
        assertAllowedCallLinkUrl(raw, "callLink");
        return raw;
      } catch {
        return "";
      }
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
        const callLink = safeCallLink(booking.callLink);
        if (booking.callLink && !callLink) {
          functions.logger.warn("sendCallReminders: dropped invalid callLink", {
            bookingId: doc.id,
            creatorId: booking.creatorId,
          });
        }

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
        // F-2026-05-03: see safeCallLink note above the 24h block.
        const callLink = safeCallLink(booking.callLink);

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
    memory: "512MiB",
    secrets: [posthogApiKeyV2],
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

      try {
        analyticsCapture({
          distinctId: userId,
          event: "workout.session_abandoned",
          properties: {
            course_id: (data.courseId as string) || null,
            elapsed_seconds: (data.elapsedSeconds as number) || 0,
            completed_sets: completedSetsCount,
            detected_by: "scheduled_scan",
          },
        });
      } catch {
        // ignore — analytics is best-effort
      }

      batch.delete(doc.ref);
      count++;
      if (count >= 400) break;
    }

    if (count > 0) {
      await batch.commit();
      functions.logger.info(`detectAbandonedSessions: recorded ${count} abandoned sessions`);
    }
    await flushAnalytics();
  }
);

export const cleanupVideoExchanges = onSchedule(
  {
    schedule: "every day 04:00",
    region: "us-central1",
    timeoutSeconds: 300,
    memory: "512MiB",
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

// ─── Scheduled: event signup attachment retention ─────────────────────────
// Photos submitted through signup forms are sensitive (payment receipts, IDs),
// so they are kept on a short leash. Two sweeps, both over Storage only:
//   uploads/       an upload nobody ever registered — deleted after 24h
//   registrations/ and waitlist/ — deleted 30 days after the event date
// The Firestore record survives either way; only the object goes, and the
// creator's viewer reports "eliminado por retención" from then on.

function eventDateMillis(value: unknown): number | null {
  if (!value) return null;
  if (typeof value === "string") {
    const ms = Date.parse(value);
    return Number.isFinite(ms) ? ms : null;
  }
  if (typeof value === "object") {
    const ts = value as { toMillis?: () => number; _seconds?: number };
    if (typeof ts.toMillis === "function") return ts.toMillis();
    if (typeof ts._seconds === "number") return ts._seconds * 1000;
  }
  return null;
}

export const cleanupEventAttachments = onSchedule(
  {
    schedule: "every day 04:30",
    timeZone: "America/Bogota",
    region: "us-central1",
    timeoutSeconds: 540,
    memory: "512MiB",
  },
  async () => {
    const bucket = admin.storage().bucket();
    const now = Date.now();
    const ORPHAN_MS = 24 * 60 * 60 * 1000;
    const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

    const [files] = await bucket.getFiles({prefix: "events/"});
    type BucketFile = (typeof files)[number];

    const attachmentsByEvent = new Map<string, BucketFile[]>();
    let orphansDeleted = 0;

    for (const file of files) {
      // events/{eventId}/{kind}/... — covers and OG renders sit one level up
      // (events/{eventId}/cover.jpg) and are never touched here.
      const parts = file.name.split("/");
      if (parts.length < 4) continue;
      const [, eventId, kind] = parts;

      if (kind === "uploads") {
        const created = Date.parse(String(file.metadata.timeCreated ?? ""));
        if (Number.isFinite(created) && now - created > ORPHAN_MS) {
          await file.delete().catch(() => undefined);
          orphansDeleted++;
        }
        continue;
      }

      if (kind === "registrations" || kind === "waitlist") {
        const list = attachmentsByEvent.get(eventId) ?? [];
        list.push(file);
        attachmentsByEvent.set(eventId, list);
      }
    }

    let expiredDeleted = 0;

    if (attachmentsByEvent.size > 0) {
      const eventIds = [...attachmentsByEvent.keys()];
      const eventDocs = await db.getAll(
        ...eventIds.map((id) => db.collection("events").doc(id))
      );

      for (const eventDoc of eventDocs) {
        const eventFiles = attachmentsByEvent.get(eventDoc.id) ?? [];
        const eventDate = eventDoc.exists ? eventDateMillis(eventDoc.data()?.date) : null;

        for (const file of eventFiles) {
          // A deleted event makes every file under it an orphan. An event with
          // no usable date falls back to the object's own age.
          const reference = !eventDoc.exists ?
            0 :
            eventDate ?? Date.parse(String(file.metadata.timeCreated ?? ""));

          if (!Number.isFinite(reference)) continue;
          if (now - reference > RETENTION_MS) {
            await file.delete().catch(() => undefined);
            expiredDeleted++;
          }
        }
      }
    }

    functions.logger.info("cleanupEventAttachments: done", {
      scanned: files.length,
      orphansDeleted,
      expiredDeleted,
    });
  }
);

// ─── Scheduled: reconcile MP subscriptions ────────────────────────────────
// Backstop for dropped webhooks. MP only retries 5xx for ~3 days; after that,
// any unfired status change (typically: user cancelled in MP portal, or a
// recurring charge whose webhook bounced) is lost forever. This cron walks
// every active-ish subscription daily and pulls the canonical state from MP.
//
// Specifically protects against:
// - "charged after cancel": user cancels in MP portal, webhook drops → Wake
//   shows authorized indefinitely, but more importantly Wake never sees the
//   cancel and may surface an outdated "still active" UI.
// - "paid but no access": authorized_payment webhook drops → Wake never
//   extends expires_at → user paid for the month but loses access.
//
// Conservative scope: only touches subscriptions in {pending, authorized,
// paused}. Reads MP preapproval, then either syncs status/next_billing_date
// or, if MP says the preapproval is gone (404), marks the doc cancelled.
export const reconcileSubscriptions = onSchedule(
  {
    schedule: "every day 03:00",
    timeZone: "America/Bogota",
    region: "us-central1",
    secrets: [mercadopagoAccessToken],
    memory: "512MiB",
    timeoutSeconds: 540,
  },
  async () => {
    const token = mercadopagoAccessToken.value();
    if (!token) {
      functions.logger.error("reconcileSubscriptions: missing access token");
      return;
    }
    const client = sharedGetClient(token);
    const preapproval = new PreApproval(client);

    // Only fetch subs in states that can change. cancelled/expired are terminal.
    const snap = await db
      .collectionGroup("subscriptions")
      .where("status", "in", ["pending", "authorized", "paused"])
      .get();

    if (snap.empty) {
      functions.logger.info("reconcileSubscriptions: nothing to reconcile");
      return;
    }

    let synced = 0;
    let driftFixed = 0;
    let errors = 0;

    // Best-effort helper: given a bundle id, return the list of course ids
    // it grants. Cached per-cron-tick to avoid re-reading the same bundle.
    const bundleCourseCache = new Map<string, string[]>();
    const resolveBundleCourseIds = async (bundleId: string): Promise<string[]> => {
      if (bundleCourseCache.has(bundleId)) return bundleCourseCache.get(bundleId)!;
      try {
        const bDoc = await db.collection("bundles").doc(bundleId).get();
        const raw = bDoc.data()?.course_ids;
        const ids = Array.isArray(raw) ?
          raw.filter((v): v is string => typeof v === "string" && v.length > 0) :
          [];
        bundleCourseCache.set(bundleId, ids);
        return ids;
      } catch {
        bundleCourseCache.set(bundleId, []);
        return [];
      }
    };

    for (const doc of snap.docs) {
      const data = doc.data() ?? {};
      const subscriptionId = doc.id;
      const localStatus = data.status as string | undefined;
      const localNextBilling = data.next_billing_date as string | undefined;
      const courseId = typeof data.course_id === "string" ? data.course_id : null;
      const bundleId = typeof data.bundle_id === "string" ? data.bundle_id : null;
      const userId = (typeof data.user_id === "string" ? data.user_id :
        (typeof data.userId === "string" ? data.userId : null));

      try {
        const pre = (await preapproval.get({id: subscriptionId})) as unknown as {
          status?: string | null;
          next_payment_date?: string | null;
          auto_recurring?: {
            next_payment_date?: string | null;
            transaction_amount?: number | null;
            currency_id?: string | null;
          };
        };

        const mpStatus = pre?.status ?? null;
        const mpNextBilling =
          pre?.next_payment_date ?? pre?.auto_recurring?.next_payment_date ?? null;

        const update: Record<string, unknown> = {};
        if (mpStatus && mpStatus !== localStatus) {
          update.status = mpStatus;
          if (mpStatus === "cancelled" && !data.cancelled_at) {
            update.cancelled_at = admin.firestore.FieldValue.serverTimestamp();
          }
        }
        if (mpNextBilling && mpNextBilling !== localNextBilling) {
          update.next_billing_date = mpNextBilling;
        }
        if (typeof pre?.auto_recurring?.transaction_amount === "number") {
          update.transaction_amount = pre.auto_recurring.transaction_amount;
        }
        if (typeof pre?.auto_recurring?.currency_id === "string") {
          update.currency_id = pre.auto_recurring.currency_id;
        }

        if (Object.keys(update).length > 0) {
          update.updated_at = admin.firestore.FieldValue.serverTimestamp();
          update.last_action = "reconcile";
          await doc.ref.set(update, {merge: true});
          driftFixed++;
        }

        // CRITICAL: when MP advances next_billing_date but the renewal webhook
        // dropped, we still need to extend access on the user's course entry —
        // otherwise the user paid, MP confirms, and Wake locks them out at
        // /current-block until the next charge clears. Only bump forward
        // (never shorten access). Skip cancelled subs so we don't extend
        // someone who just cancelled.
        //
        // Also materializes the missing entry from courses/{id} when MP says
        // authorized but the local user.courses[id] is missing entirely —
        // covers the "paid but never granted access" failure mode where the
        // initial trial-grant / payment-webhook never wrote to the user doc.
        // Walks course_ids[] for bundle subscriptions too, since the sub doc
        // for a bundle carries bundle_id but no course_id.
        if (mpStatus === "authorized" && mpNextBilling && userId) {
          const targetCourseIds: string[] = courseId ?
            [courseId] :
            (bundleId ? await resolveBundleCourseIds(bundleId) : []);
          for (const targetCourseId of targetCourseIds) {
            try {
              const userRef = db.collection("users").doc(userId);
              const mpNextMs = Date.parse(mpNextBilling);
              if (!Number.isFinite(mpNextMs)) continue;
              await db.runTransaction(async (tx) => {
                const userSnap = await tx.get(userRef);
                if (!userSnap.exists) return;
                const courses = (userSnap.data()?.courses ?? {}) as Record<string, Record<string, unknown>>;
                const entry = courses[targetCourseId];
                if (entry) {
                  // Existing entry: only bump expires_at forward.
                  if (entry.status !== "active" && entry.status !== "expired") return;
                  const onDiskRaw = entry.expires_at;
                  let onDiskMs: number | null = null;
                  if (typeof onDiskRaw === "string") {
                    const ms = Date.parse(onDiskRaw);
                    if (Number.isFinite(ms)) onDiskMs = ms;
                  }
                  if (onDiskMs !== null && onDiskMs >= mpNextMs) return;
                  tx.update(userRef, {
                    [`courses.${targetCourseId}.expires_at`]: mpNextBilling,
                    [`courses.${targetCourseId}.status`]: "active",
                    updated_at: admin.firestore.FieldValue.serverTimestamp(),
                  });
                } else {
                  // No entry: materialize from courses/{id} so the buyer who
                  // paid but never had access actually gets it. Last-resort
                  // safety net — this is the buyer whose webhook dropped.
                  // Carry the local sub doc's access_duration (defaults to
                  // monthly only when truly unknown) and use the sub doc's
                  // created_at as purchased_at when present, so the funnel
                  // analytics keep the correct acquisition timestamp.
                  void userSnap;
                  const subAccessDuration = typeof data.access_duration === "string" ?
                    data.access_duration :
                    "monthly";
                  // sub.created_at is a Firestore Timestamp (.toDate()) or
                  // missing for very old docs — fall back to mpNextBilling -
                  // 30d as a stable approximation, then to now() as last
                  // resort.
                  let purchasedAtIso: string;
                  const createdAt = data.created_at;
                  if (createdAt && typeof createdAt === "object" && typeof (createdAt as {toDate?: () => Date}).toDate === "function") {
                    try {
                      purchasedAtIso = (createdAt as {toDate: () => Date}).toDate().toISOString();
                    } catch {
                      purchasedAtIso = new Date(Math.max(0, mpNextMs - 30 * 86400000)).toISOString();
                    }
                  } else if (typeof createdAt === "string") {
                    purchasedAtIso = createdAt;
                  } else {
                    purchasedAtIso = new Date(Math.max(0, mpNextMs - 30 * 86400000)).toISOString();
                  }
                  tx.update(userRef, {
                    [`courses.${targetCourseId}`]: {
                      access_duration: subAccessDuration,
                      expires_at: mpNextBilling,
                      status: "active",
                      is_trial: false,
                      purchased_at: purchasedAtIso,
                      title: "",
                      image_url: null,
                      // Deferred metadata fill — these get hydrated by the
                      // next charge webhook or by /users/me reads. The
                      // important thing is that access is granted now.
                      _materialized_from: "reconcile",
                    },
                    updated_at: admin.firestore.FieldValue.serverTimestamp(),
                  });
                }
              });
              // Hydrate metadata on a freshly-materialized entry outside the
              // transaction. If this fails the user still has access.
              try {
                const courseDoc = await db.collection("courses").doc(targetCourseId).get();
                const c = courseDoc.data();
                if (c) {
                  const userRef2 = db.collection("users").doc(userId);
                  await userRef2.update({
                    [`courses.${targetCourseId}.title`]: c.title ?? "Untitled Course",
                    [`courses.${targetCourseId}.image_url`]: c.image_url ?? null,
                    [`courses.${targetCourseId}.deliveryType`]: c.deliveryType ?? "general",
                    [`courses.${targetCourseId}.creator_id`]: c.creator_id ?? null,
                    [`courses.${targetCourseId}.creatorName`]: c.creatorName ?? c.creator_name ?? null,
                  });
                }
              } catch {/* best-effort hydrate */}
            } catch (extErr) {
              functions.logger.warn("reconcileSubscriptions: course materialize/bump failed", {
                subscriptionId, userId, courseId: targetCourseId, error: sharedToErrorMessage(extErr),
              });
            }
          }
        }
        synced++;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        // 404 from MP → preapproval no longer exists. Mark cancelled so we
        // stop trying to reconcile.
        if (/404|not.found/i.test(msg)) {
          await doc.ref.set({
            status: "cancelled",
            last_action: "reconcile_orphan",
            cancelled_at: data.cancelled_at ?? admin.firestore.FieldValue.serverTimestamp(),
            updated_at: admin.firestore.FieldValue.serverTimestamp(),
          }, {merge: true});
          driftFixed++;
        } else {
          functions.logger.warn("reconcileSubscriptions: fetch failed", {
            subscriptionId, error: msg,
          });
          errors++;
        }
      }
    }

    functions.logger.info("reconcileSubscriptions: done", {
      total: snap.size, synced, driftFixed, errors,
    });
  }
);

// ─── Scheduled: monthly-drop block advance ───────────────────────────────
//
// Calendar-anchored content drops for `block_cadence: 'monthly_first_monday'`
// courses. On the first Monday of each month at 00:00 America/Bogota, advance
// `program_state/{courseId}.current_block_id` to the next module with
// `published_at != null` and a higher `order`. Denormalizes the new
// block onto the course doc so PWA fast-path reads stay single-doc.
//
// If no next published module exists, emits a signals alert (Felipe forgot to
// publish). The advance is idempotent — re-runs in the same window are no-ops.
//
// Required Firestore schema (documented in
// memory/project_monthly_drops.md):
//   courses/{id}:                block_cadence, current_block_id, current_block_index
//   courses/{id}/modules/{id}:   order (number), unlocks_at (Timestamp),
//                                published_at (Timestamp | null)
//   program_state/{courseId}:    current_block_id, current_block_index,
//                                current_block_started_at, next_block_id,
//                                next_block_index, updated_at
//
// Secrets and `readTopics()` are declared further down in the "Wake ops"
// section; the cron registrations live below that block.

// Returns YYYY-MM-DD for `d` in America/Bogota. Used both to gate
// first-Monday-of-month (date-of-month 1–7) and to make the advance
// idempotent within a single BOG calendar day (manual re-trigger + scheduled
// fire on the same day must not double-advance).
function bogotaDateParts(d: Date): {year: number; month: number; day: number; weekday: number} {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric", month: "2-digit", day: "2-digit", weekday: "short",
  });
  const parts = Object.fromEntries(fmt.formatToParts(d).map((p) => [p.type, p.value]));
  const weekdayMap: Record<string, number> = {Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6};
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    weekday: weekdayMap[parts.weekday] ?? -1,
  };
}

function isFirstMondayOfMonth(d: Date): boolean {
  // Day-of-month 1–7 AND weekday Monday, both evaluated in America/Bogota.
  const {day, weekday} = bogotaDateParts(d);
  return day <= 7 && weekday === 1;
}

// Tolerant gate: returns true when `d` is the first Monday of the month in
// BOG OR within 24h after it. Cloud Scheduler can fire seconds before the
// nominal wallclock; without this window an invocation at 23:59:59 BOG of
// Sunday would compute weekday=Sunday and skip the advance for an entire
// month. Idempotence is preserved by `current_block_started_at` — re-runs
// within the same BOG day are no-ops.
function isWithinFirstMondayWindow(d: Date): boolean {
  if (isFirstMondayOfMonth(d)) return true;
  // Check the BOG calendar day that "yesterday" would land on.
  const yesterday = new Date(d.getTime() - 24 * 60 * 60 * 1000);
  return isFirstMondayOfMonth(yesterday);
}

async function advanceMonthlyDropCourse(
  courseRef: admin.firestore.DocumentReference,
  signalsCtx: {botToken: string; chatId: string; topics: import("./ops/telegram.js").TopicMap} | null
): Promise<{
  courseId: string;
  outcome: "advanced" | "no_next_published" | "no_modules" | "already_current";
  fromBlock: number;
  toBlock: number | null;
  toModuleId: string | null;
}> {
  const courseId = courseRef.id;
  const stateRef = db.collection("program_state").doc(courseId);
  const stateSnap = await stateRef.get();
  const state = stateSnap.exists ? stateSnap.data() ?? {} : {};
  // Sentinel: -1 means "no block live yet". Modules are 0-indexed on `order`
  // (dashboard's createModule writes `order = existing.length`), so the first
  // advance must pick order=0. Using 0 as the default would skip block 0.
  const currentBlockIndex = typeof state.current_block_index === "number" ?
    state.current_block_index :
    -1;

  // Idempotence guard: once this course has advanced anywhere in the current
  // BOG month, the cron is done for the month. BOG-month keying (rather than
  // BOG-day) is what makes the tolerant first-Monday window safe — without
  // it, a Mon-01:00 advance followed by a Tue-01:00 re-fire (both within the
  // tolerant window) would double-advance. Manual mid-month re-fires are
  // also no-ops, which is the desired behavior (the cron should advance
  // exactly once per month).
  const startedAt = state.current_block_started_at;
  if (startedAt && typeof (startedAt as {toDate?: () => Date}).toDate === "function") {
    const startedDate = (startedAt as {toDate: () => Date}).toDate();
    const startedParts = bogotaDateParts(startedDate);
    const nowParts = bogotaDateParts(new Date());
    if (startedParts.year === nowParts.year && startedParts.month === nowParts.month) {
      return {
        courseId,
        outcome: "already_current",
        fromBlock: currentBlockIndex,
        toBlock: currentBlockIndex,
        toModuleId: (state.current_block_id as string | null) ?? null,
      };
    }
  }

  // ── Level-plans branch ───────────────────────────────────────────────────
  // Courses with `level_plans` carry per-level plan trees (plans/{planId}).
  // The advance gate requires every level's plan to have a published module at
  // the next index before any user sees a new block.
  const courseSnap = await courseRef.get();
  const courseDoc = courseSnap.exists ? courseSnap.data() ?? {} : {};
  const levelPlans = courseDoc.level_plans as Record<string, string> | undefined;

  if (levelPlans && typeof levelPlans === "object" && Object.keys(levelPlans).length > 0) {
    const nextIndex = currentBlockIndex + 1;

    // Query each level plan's modules collection for a doc at nextIndex.
    const perPlanPublished: Record<string, boolean> = {};
    await Promise.all(
      Object.entries(levelPlans).map(async ([level, planId]) => {
        const snap = await db
          .collection("plans")
          .doc(planId)
          .collection("modules")
          .where("order", "==", nextIndex)
          .limit(1)
          .get();
        const moduleExists = !snap.empty;
        const published = moduleExists && snap.docs[0].data().published_at != null;
        perPlanPublished[level] = published;
      })
    );

    if (!allLevelPlansPublishAt(perPlanPublished)) {
      functions.logger.info("monthlyDropAdvance: level_plans gate blocked", {
        courseId,
        nextIndex,
        perPlanPublished,
      });
      return {
        courseId,
        outcome: "no_next_published",
        fromBlock: currentBlockIndex,
        toBlock: null,
        toModuleId: null,
      };
    }

    // All level plans have the next block published. Use the default level's
    // plan module id as the canonical block id (by convention all level plans
    // share the same module doc-id per month, e.g. "mes-2").
    const defaultLevel = (courseDoc.levels as {default?: string} | undefined)?.default;
    const defaultPlanId = defaultLevel ? levelPlans[defaultLevel] : Object.values(levelPlans)[0];
    const defaultModuleSnap = await db
      .collection("plans")
      .doc(defaultPlanId)
      .collection("modules")
      .where("order", "==", nextIndex)
      .limit(1)
      .get();
    const canonicalModuleId = defaultModuleSnap.empty ? `block-${nextIndex}` : defaultModuleSnap.docs[0].id;

    // Look one further ahead for the next-block chip on Hoy. All level plans
    // share the same module doc-id per month, so the default plan is representative.
    const lookaheadSnap = await db
      .collection("plans")
      .doc(defaultPlanId)
      .collection("modules")
      .where("order", "==", nextIndex + 1)
      .limit(1)
      .get();
    const lookaheadNextBlockId = lookaheadSnap.empty ? null : lookaheadSnap.docs[0].id;
    const lookaheadNextBlockIndex = lookaheadSnap.empty ? null : nextIndex + 1;

    const now = admin.firestore.FieldValue.serverTimestamp();
    const batch = db.batch();
    batch.set(
      stateRef,
      {
        current_block_id: canonicalModuleId,
        current_block_index: nextIndex,
        current_block_started_at: now,
        next_block_id: lookaheadNextBlockId,
        next_block_index: lookaheadNextBlockIndex,
        updated_at: now,
      },
      {merge: true}
    );
    batch.set(
      courseRef,
      {current_block_id: canonicalModuleId, current_block_index: nextIndex, updated_at: now},
      {merge: true}
    );
    await batch.commit();

    functions.logger.info("monthlyDropAdvance: level_plans advanced", {
      courseId,
      from: currentBlockIndex,
      to: nextIndex,
      moduleId: canonicalModuleId,
    });

    if (signalsCtx) {
      try {
        await sendTo(
          signalsCtx,
          "signals",
          `[monthly-drops] ${courseId} (level_plans): block ${currentBlockIndex} → ${nextIndex} ` +
            `("${canonicalModuleId}")`
        );
      } catch (err) {
        functions.logger.warn("monthlyDropAdvance: signals send failed (level_plans)", {
          courseId,
          err: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return {
      courseId,
      outcome: "advanced",
      fromBlock: currentBlockIndex,
      toBlock: nextIndex,
      toModuleId: canonicalModuleId,
    };
  }
  // ── End level-plans branch ───────────────────────────────────────────────

  // One server-side inequality (order) + orderBy on that field is the
  // simplest Firestore-safe query. Filter unpublished modules client-side.
  // Programs have ~12 blocks; 50 is a generous cap that survives long gaps
  // of unpublished modules between current and the next published one.
  const forwardSnap = await courseRef
    .collection("modules")
    .where("order", ">", currentBlockIndex)
    .orderBy("order", "asc")
    .limit(50)
    .get();

  const published = forwardSnap.docs.filter((d) => {
    const p = d.data().published_at;
    return p !== null && p !== undefined;
  });

  if (published.length === 0) {
    if (currentBlockIndex === -1 && forwardSnap.empty) {
      return {courseId, outcome: "no_modules", fromBlock: -1, toBlock: null, toModuleId: null};
    }
    return {
      courseId,
      outcome: "no_next_published",
      fromBlock: currentBlockIndex,
      toBlock: null,
      toModuleId: null,
    };
  }

  const advanceDoc = published[0];
  const advanceData = advanceDoc.data();
  const newIndex = advanceData.order as number;
  const lookahead = published[1];
  const nextBlockId = lookahead ? lookahead.id : null;
  const nextBlockIndex = lookahead ?
    (lookahead.data().order as number) :
    null;

  // Atomic write: program_state and the course-doc mirror MUST advance
  // together. If only program_state advances and the course-doc write fails,
  // PWA fast-path reads keep returning the old block forever (the mirror is
  // what HoyScreen + the workout walker consult). Batched writes commit
  // together or not at all.
  const now = admin.firestore.FieldValue.serverTimestamp();
  const batch = db.batch();
  batch.set(
    stateRef,
    {
      current_block_id: advanceDoc.id,
      current_block_index: newIndex,
      current_block_started_at: now,
      next_block_id: nextBlockId,
      next_block_index: nextBlockIndex,
      updated_at: now,
    },
    {merge: true}
  );
  batch.set(
    courseRef,
    {current_block_id: advanceDoc.id, current_block_index: newIndex, updated_at: now},
    {merge: true}
  );
  await batch.commit();

  functions.logger.info("monthlyDropAdvance: advanced", {
    courseId,
    from: currentBlockIndex,
    to: newIndex,
    moduleId: advanceDoc.id,
  });

  if (signalsCtx) {
    try {
      await sendTo(
        signalsCtx,
        "signals",
        `[monthly-drops] ${courseId}: block ${currentBlockIndex} → ${newIndex} ` +
          `("${advanceData.title ?? advanceDoc.id}")` +
          (nextBlockId ? ` · next queued: ${nextBlockIndex}` : " · no next block queued")
      );
    } catch (err) {
      functions.logger.warn("monthlyDropAdvance: signals send failed", {
        courseId,
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return {
    courseId,
    outcome: "advanced",
    fromBlock: currentBlockIndex,
    toBlock: newIndex,
    toModuleId: advanceDoc.id,
  };
}

// Cron registrations are placed below the Wake-ops secret declarations so
// that `telegramSignalsBotToken`, `telegramChatId`, `telegramTopics`, and
// `readTopics()` are in scope.

// ─── Wake ops: secrets ─────────────────────────────────────────────────────
const telegramSignalsBotToken = defineSecret("TELEGRAM_SIGNALS_BOT_TOKEN");
const telegramChatId = defineSecret("TELEGRAM_CHAT_ID");
const telegramWebhookSecret = defineSecret("TELEGRAM_WEBHOOK_SECRET");
const githubWebhookSecret = defineSecret("GITHUB_WEBHOOK_SECRET");
const opsApiKey = defineSecret("OPS_API_KEY");
const posthogAlertsSecret = defineSecret("POSTHOG_ALERTS_SECRET");

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

// ─── Monthly-drop cron registrations ──────────────────────────────────────
// Helper functions `isFirstMondayOfMonth` and `advanceMonthlyDropCourse` are
// declared earlier in this file; secrets and `readTopics()` are right above.

export const monthlyDropAdvance = onSchedule(
  {
    // 01:00 BOG instead of 00:00 — buffers against Cloud Scheduler firing
    // a few seconds before the wallclock day boundary, which previously
    // could shift the BOG date back to Sunday and silently skip the advance
    // for the entire month.
    schedule: "every monday 01:00",
    timeZone: "America/Bogota",
    region: "us-central1",
    secrets: [telegramSignalsBotToken, telegramChatId, telegramTopics],
    memory: "512MiB",
    timeoutSeconds: 120,
  },
  async () => {
    // Cron triggers every Monday; tolerant gate accepts the first Monday OR
    // the 24h after it, so a near-boundary invocation can still advance.
    // Idempotence in advanceMonthlyDropCourse prevents double-advance.
    if (!isWithinFirstMondayWindow(new Date())) {
      functions.logger.info("monthlyDropAdvance: not within first-Monday window, skipping");
      return;
    }

    const coursesSnap = await db
      .collection("courses")
      .where("block_cadence", "==", "monthly_first_monday")
      .get();

    if (coursesSnap.empty) {
      functions.logger.info("monthlyDropAdvance: no monthly-drop courses configured");
      return;
    }

    // Only advance published courses. Drafts/paused/archived may have stale
    // current_block_index that would otherwise be mirrored onto the course
    // doc and exposed to anyone who can read the course (creator, admin,
    // or — if a draft is later flipped published — actual subscribers).
    // In-memory filter; composite index isn't worth it for ~12 cadenced courses.
    const eligibleDocs = coursesSnap.docs.filter((d) => d.data()?.status === "published");
    if (eligibleDocs.length === 0) {
      functions.logger.info("monthlyDropAdvance: no published monthly-drop courses; skipping");
      return;
    }

    const signalsCtx = telegramSignalsBotToken.value() && telegramChatId.value() ?
      {
        botToken: telegramSignalsBotToken.value(),
        chatId: telegramChatId.value(),
        topics: readTopics(),
      } :
      null;

    const results: Array<Awaited<ReturnType<typeof advanceMonthlyDropCourse>>> = [];
    for (const doc of eligibleDocs) {
      try {
        results.push(await advanceMonthlyDropCourse(doc.ref, signalsCtx));
      } catch (err) {
        functions.logger.error("monthlyDropAdvance: course advance failed", {
          courseId: doc.id,
          err: err instanceof Error ? err.message : String(err),
        });
        if (signalsCtx) {
          try {
            await sendTo(
              signalsCtx,
              "signals",
              `[monthly-drops] ${doc.id}: advance FAILED — ${err instanceof Error ? err.message : String(err)}`
            );
          } catch {
            // already-degraded path; logging above is sufficient
          }
        }
      }
    }

    if (signalsCtx) {
      // Carry-over: no next published block is now a normal state, not an
      // alert. A coach may intentionally let a drop run for multiple months
      // (memory/project_monthly_drops.md). We still emit one INFO line per
      // course so the ops bus has a paper trail, but stop paging.
      const carried = results.filter((r) => r.outcome === "no_next_published");
      for (const c of carried) {
        try {
          await sendTo(
            signalsCtx,
            "signals",
            `[monthly-drops] ${c.courseId}: carry-over · current block ${c.fromBlock} continues this month`
          );
        } catch {
          // best-effort
        }
      }
    }
  }
);

// Cron-fired assertion. Re-purposed from the old day-25 publication-readiness
// sweep (carry-over makes unauthored next blocks WAI). Now it verifies the
// monthlyDropAdvance cron actually ran this BOG month for every published
// cadenced course: if `program_state.current_block_started_at` is older than
// the first day of the current BOG month, the advance silently missed and
// every subscriber is stuck on the previous block. Emits a Telegram signal
// so ops can manually re-fire the advance.
//
// Runs daily at 09:00 BOG starting day 2 of the month (so the first-Monday
// cron has had business hours to land before we alert). A weekly cron would
// risk waiting up to 7 days to notice a miss.
export const monthlyDropReadinessCheck = onSchedule(
  {
    schedule: "0 9 2-8 * *",
    timeZone: "America/Bogota",
    region: "us-central1",
    secrets: [telegramSignalsBotToken, telegramChatId, telegramTopics],
    memory: "512MiB",
    timeoutSeconds: 60,
  },
  async () => {
    const {year: bogYear, month: bogMonth} = bogotaDateParts(new Date());
    // First instant of the current BOG month, expressed as a UTC ms epoch.
    // BOG = UTC-5, so 00:00 BOG of day 1 = 05:00 UTC of day 1. Anything before
    // this means the advance is one or more months behind.
    const monthStartMs = Date.UTC(bogYear, bogMonth - 1, 1) + 5 * 60 * 60 * 1000;

    const coursesSnap = await db
      .collection("courses")
      .where("block_cadence", "==", "monthly_first_monday")
      .get();
    const published = coursesSnap.docs.filter((d) => d.data()?.status === "published");
    if (published.length === 0) return;

    const signalsCtx = telegramSignalsBotToken.value() && telegramChatId.value() ?
      {
        botToken: telegramSignalsBotToken.value(),
        chatId: telegramChatId.value(),
        topics: readTopics(),
      } :
      null;

    for (const courseDoc of published) {
      const stateDoc = await db.collection("program_state").doc(courseDoc.id).get();
      // Freshly-cadenced courses have no program_state yet; the next cron
      // run will create it. Treat as "not behind" — alerting daily for a
      // brand-new course would be noise the creator can't act on.
      if (!stateDoc.exists) continue;
      const startedAt = stateDoc.data()?.current_block_started_at as
        | {toMillis?: () => number} | undefined;
      const startedMs = startedAt && typeof startedAt.toMillis === "function" ?
        startedAt.toMillis() :
        null;
      if (startedMs === null) continue;
      if (startedMs >= monthStartMs) continue;

      functions.logger.warn("monthlyDropReadinessCheck: cron missed this month", {
        courseId: courseDoc.id,
        startedMs,
        monthStartMs,
      });
      if (signalsCtx) {
        try {
          await sendTo(
            signalsCtx,
            "signals",
            `[monthly-drops] ${courseDoc.id}: advance MISSED — current_block_started_at` +
              " is older than the first day of this BOG month. Manually trigger" +
              " monthlyDropAdvance or investigate scheduler logs."
          );
        } catch {
          // already-degraded path; log above is sufficient
        }
      }
    }
  }
);

// ─── Scheduled: lapse-flip ───────────────────────────────────────────────
// Walks every user once a day and stamps `status: "expired"` on any
// `users/{uid}.courses[id]` entry whose `expires_at` is past the access
// grace window AND is not already in a terminal state. Without this, a
// `status: "active"` entry survives indefinitely after expires_at lapses,
// and the only thing locking the user out is whatever code happens to also
// check expires_at — which is now uniform (workout.ts) but historically
// drifted across surfaces. The flip lets every gate reduce to a simple
// "status active?" check and gives monthlyDropsPulse / paymentsPulse an
// honest count of lapsed access.
//
// Grace window must match /current-block + /programs/:id (3 days) so we
// don't flip a paying user out from under MP's billing retries.
//
// Cost: one read of the users collection daily + targeted updates only on
// users with expirations. With wolf-20b8b's user count (~thousands), this
// is a cheap operation; if the collection grows past ~50k, replace with
// a sharded sweep keyed off `next_expiry_at` denormalized at write time.
export const lapsedCoursesFlip = onSchedule(
  {
    schedule: "every day 04:00",
    timeZone: "America/Bogota",
    region: "us-central1",
    memory: "512MiB",
    timeoutSeconds: 540,
  },
  async () => {
    const ACCESS_GRACE_MS = 3 * 24 * 60 * 60 * 1000;
    const cutoffMs = Date.now() - ACCESS_GRACE_MS;

    const snap = await db.collection("users").get();
    let usersChecked = 0;
    let usersUpdated = 0;
    let coursesFlipped = 0;
    let trialsFlipped = 0;

    for (const doc of snap.docs) {
      usersChecked++;
      const courses = (doc.data().courses ?? {}) as Record<string, Record<string, unknown>>;
      const updates: Record<string, unknown> = {};
      for (const [courseId, entry] of Object.entries(courses)) {
        if (!entry || typeof entry !== "object") continue;
        const status = entry.status;
        // Only flip entries that are still nominally usable. Skip terminal
        // states (cancelled / expired / refunded) and bundle-derived entries
        // — bundles are revoked atomically by the bundle subscription path.
        if (status !== "active" && status !== undefined) continue;
        const exp = entry.expires_at;
        if (typeof exp !== "string") continue;
        const expMs = Date.parse(exp);
        if (!Number.isFinite(expMs)) continue;
        if (expMs >= cutoffMs) continue;

        updates[`courses.${courseId}.status`] = "expired";
        updates[`courses.${courseId}.expired_at`] = new Date().toISOString();
        if (entry.is_trial === true) trialsFlipped++;
        coursesFlipped++;
      }
      if (Object.keys(updates).length > 0) {
        updates.updated_at = admin.firestore.FieldValue.serverTimestamp();
        try {
          await doc.ref.update(updates);
          usersUpdated++;
        } catch (err) {
          functions.logger.warn("lapsedCoursesFlip: user update failed", {
            userId: doc.id, error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    }

    functions.logger.info("lapsedCoursesFlip: done", {
      usersChecked, usersUpdated, coursesFlipped, trialsFlipped,
    });
  }
);

// ─── Scheduled: reconcile MercadoPago refunds the webhook missed ─────────────
// MP refunds issued from the MP dashboard don't reliably fire a payment.updated
// webhook, so a refund can revoke nothing and never hit payment_ledger. Daily,
// re-check recent MP sales against the live MP payment status and apply any
// refund/chargeback the webhook missed (revoke access + ledger row). Idempotent
// and safe to run repeatedly. Polar refunds arrive via refund.* webhooks and
// are not covered here.
export const reconcileMpRefundsCron = onSchedule(
  {
    schedule: "every day 05:00",
    timeZone: "America/Bogota",
    region: "us-central1",
    secrets: [mercadopagoAccessToken],
    memory: "512MiB",
    timeoutSeconds: 540,
  },
  async () => {
    const token = process.env.MERCADOPAGO_ACCESS_TOKEN;
    if (!token) {
      functions.logger.error("reconcileMpRefundsCron: MERCADOPAGO_ACCESS_TOKEN missing");
      return;
    }
    const {scanned, checked, reconciled, hits} = await reconcileMpRefunds(token);
    functions.logger.info("reconcileMpRefundsCron: done", {scanned, checked, reconciled, hits: hits.length});
  }
);

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
      ["data-integrity", () => runDataIntegrity(ctx)],
      ["monthly-drops", () => runMonthlyDropsPulse(ctx)],
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
    memory: "512MiB",
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
    memory: "512MiB",
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
    memory: "512MiB",
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
    memory: "512MiB",
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
    memory: "512MiB",
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

// ─── Webhook: PostHog error-tracking alerts → #signals + email ────────────
export const wakePosthogAlertsWebhook = onRequest(
  {
    region: "us-central1",
    secrets: [
      telegramSignalsBotToken,
      telegramChatId,
      telegramTopics,
      posthogAlertsSecret,
      resendApiKeyV2,
    ],
    // 256MiB OOMed on cold start (267MiB observed 2026-07-04) — the shared
    // index.ts module graph plus Resend pushes past the floor.
    memory: "512MiB",
    timeoutSeconds: 30,
    cors: false,
  },
  async (req, res) => {
    await handlePosthogAlert(req, res, {
      webhookSecret: posthogAlertsSecret.value(),
      botToken: telegramSignalsBotToken.value(),
      chatId: telegramChatId.value(),
      topics: readTopics(),
      resendApiKey: resendApiKeyV2.value(),
      alertEmail: "emilioloboguerrero@gmail.com",
    });
  }
);

