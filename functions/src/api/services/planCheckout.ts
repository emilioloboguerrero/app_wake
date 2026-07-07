// Pay-first MercadoPago subscriptions via an associated plan (PreApprovalPlan).
//
// The current storefront subscription flow (payments.ts / public.ts) creates a
// per-buyer PreApproval that REQUIRES payer_email up front — so the buy page
// has to collect an email before it can even produce a checkout URL. This
// module implements the alternative MP model: a shared, buyer-agnostic
// PreApprovalPlan whose init_point is MP's own hosted "checkout externo". MP
// collects the buyer's email + card there (guest card payment, no MP account
// required) and creates the preapproval itself. No email is asked on our side.
//
// Because the plan init_point is shared across all buyers, the resulting
// preapproval carries NO per-buyer external_reference. The webhook resolves the
// buyer from the MP-collected payer_email and maps the plan back to a course via
// mp_plans/{planId}, then synthesizes the same external_reference the existing
// webhook grant path expects — so the grant + magic-link email run unchanged.

import * as admin from "firebase-admin";
import * as functions from "firebase-functions";
import {PreApprovalPlan} from "mercadopago";
import {db, FieldValue} from "../firestore.js";
import {getClient, buildExternalReference, EMAIL_RE} from "./paymentHelpers.js";

function getMPClient() {
  const token = process.env.MERCADOPAGO_ACCESS_TOKEN;
  if (!token) throw new Error("Mercado Pago access token missing");
  return getClient(token);
}

// Mirror of payments.ts resolveWebhookUrl: point MP at our webhook explicitly
// so plan-based subscription events don't silently depend on the account-level
// notification URL configured in the MP dashboard.
function resolveWebhookUrl(): string {
  const override = process.env.WAKE_NOTIFICATION_URL_OVERRIDE;
  if (override) return override;
  const project = process.env.GCLOUD_PROJECT;
  const base = project === "wake-staging" ?
    "https://wake-staging.web.app" :
    "https://wakelab.co";
  return `${base}/api/v1/payments/webhook`;
}

// MP caps `reason` at 256 chars; keep well under and never send an empty string.
function truncateReason(title: unknown, fallback: string): string {
  const t = (typeof title === "string" ? title : "").trim() || fallback;
  return t.length > 200 ? t.slice(0, 200) : t;
}

export interface EnsurePlanArgs {
  courseId: string;
  course: FirebaseFirestore.DocumentData;
  monthlyPrice: number;
  backUrl: string;
}

// Create or reuse the course's PreApprovalPlan and return its init_point.
// Idempotent per (course, price): reuses the stored plan while the course's
// subscription price is unchanged; recreates it (new plan) if the price moved,
// so buyers never get sent to a checkout quoting a stale amount.
export async function ensureCoursePlanInitPoint(args: EnsurePlanArgs): Promise<string> {
  const {courseId, course, monthlyPrice, backUrl} = args;

  const storedPlanId =
    typeof course.mp_preapproval_plan_id === "string" ? course.mp_preapproval_plan_id : null;
  const storedAmount =
    typeof course.mp_preapproval_plan_amount === "number" ? course.mp_preapproval_plan_amount : null;
  const storedInitPoint =
    typeof course.mp_preapproval_plan_init_point === "string" ?
      course.mp_preapproval_plan_init_point :
      null;
  if (storedPlanId && storedInitPoint && storedAmount === monthlyPrice) {
    return storedInitPoint;
  }

  const client = getMPClient();
  const plan = new PreApprovalPlan(client);
  const notificationUrl = resolveWebhookUrl();

  const created = await plan.create({
    body: {
      reason: truncateReason(course.title, "Suscripción"),
      auto_recurring: {
        frequency: 1,
        frequency_type: "months",
        transaction_amount: monthlyPrice,
        currency_id: "COP",
      },
      back_url: backUrl,
      payment_methods_allowed: {
        payment_types: [{id: "credit_card"}, {id: "debit_card"}],
      },
      // notification_url isn't in the SDK's PreApprovalPlanRequest type but MP
      // honors it (same as PreApproval — see payments.ts:502). Without it,
      // plan-based subscription webhooks would fall back to the account-level
      // URL and could be silently dropped.
      ...{notification_url: notificationUrl},
    },
  });

  const planId = created.id;
  const initPoint = created.init_point;
  if (!planId || !initPoint) {
    throw new Error("MercadoPago plan creation returned no init_point");
  }

  await db.collection("courses").doc(courseId).set({
    mp_preapproval_plan_id: planId,
    mp_preapproval_plan_amount: monthlyPrice,
    mp_preapproval_plan_init_point: initPoint,
    updated_at: FieldValue.serverTimestamp(),
  }, {merge: true});

  // Reverse lookup for the webhook: plan-based preapprovals only tell us the
  // preapproval_plan_id, so this is how we recover which course was bought.
  await db.collection("mp_plans").doc(planId).set({
    course_id: courseId,
    creator_id: course.creator_id ?? null,
    amount: monthlyPrice,
    created_at: FieldValue.serverTimestamp(),
  }, {merge: true});

  functions.logger.info("mp_plan.created", {courseId, planId, amount: monthlyPrice});
  return initPoint;
}

// Find or create the Firebase Auth user for an email. Mirrors the guest-start
// handler's race handling; the buyer never gets a session from this — the
// post-payment magic link is the only door in.
export async function findOrCreateUserByEmail(
  email: string
): Promise<{userId: string; displayName: string | null}> {
  const normalized = email.trim().toLowerCase();
  try {
    const existing = await admin.auth().getUserByEmail(normalized);
    return {userId: existing.uid, displayName: existing.displayName ?? null};
  } catch (err) {
    if ((err as {code?: string})?.code !== "auth/user-not-found") throw err;
  }
  try {
    const created = await admin.auth().createUser({email: normalized, emailVerified: false});
    return {userId: created.uid, displayName: null};
  } catch (createErr) {
    if ((createErr as {code?: string})?.code === "auth/email-already-exists") {
      const existing = await admin.auth().getUserByEmail(normalized);
      return {userId: existing.uid, displayName: existing.displayName ?? null};
    }
    throw createErr;
  }
}

// Resolve the synthetic external_reference for a plan-based preapproval (which
// carries none of its own). Maps preapproval_plan_id -> course via
// mp_plans/{planId}, find-or-creates the Firebase user from the MP-collected
// payer email, bootstraps/attributes the user doc exactly like
// executeStorefrontCheckout, and returns v1|{userId}|{courseId}|sub so the
// existing webhook grant path proceeds unchanged. Returns null when it can't
// resolve (unknown plan or missing/invalid payer email) — the caller should
// then 200 the webhook without granting.
export async function resolvePlanPreapprovalReference(args: {
  planId: string | null | undefined;
  payerEmail: string | null | undefined;
}): Promise<string | null> {
  const planId = typeof args.planId === "string" ? args.planId : null;
  const payerEmail =
    typeof args.payerEmail === "string" ? args.payerEmail.trim().toLowerCase() : null;
  if (!planId || !payerEmail || !EMAIL_RE.test(payerEmail)) return null;

  const planDoc = await db.collection("mp_plans").doc(planId).get();
  if (!planDoc.exists) {
    functions.logger.warn("plan preapproval: unknown mp_plans mapping", {planId});
    return null;
  }
  const courseId = planDoc.data()?.course_id as string | undefined;
  const creatorId = (planDoc.data()?.creator_id as string | undefined) ?? null;
  if (!courseId) {
    functions.logger.warn("plan preapproval: mp_plans doc missing course_id", {planId});
    return null;
  }

  const {userId, displayName} = await findOrCreateUserByEmail(payerEmail);

  // Bootstrap / attribute the user doc so a pay-first buyer is indistinguishable
  // from an email-first storefront acquisition (same fields as
  // executeStorefrontCheckout). First-touch attribution only — never overwrite.
  const userRef = db.collection("users").doc(userId);
  const existing = await userRef.get();
  const existingData = existing.data() ?? {};
  const seed: Record<string, unknown> = {
    email: payerEmail,
    updated_at: FieldValue.serverTimestamp(),
  };
  if (!existingData.acquiredVia) {
    seed.acquiredVia = "creator_storefront";
    seed.acquisitionCreator = creatorId;
    seed.acquisitionCourse = courseId;
    seed.onboardingDeferred = true;
  }
  if (!existing.exists) {
    seed.displayName = displayName;
    seed.role = "user";
    seed.created_at = FieldValue.serverTimestamp();
  }
  await userRef.set(seed, {merge: true});

  functions.logger.info("plan preapproval: resolved identity", {planId, courseId, userId});
  return buildExternalReference(userId, courseId, "sub");
}
