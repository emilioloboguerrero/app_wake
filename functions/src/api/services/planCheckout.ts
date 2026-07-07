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
import {PreApprovalPlan, PreApproval} from "mercadopago";
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

// Map a plan id to its course via mp_plans/{planId}.
async function lookupCourseByPlan(
  planId: string
): Promise<{courseId: string; creatorId: string | null} | null> {
  const planDoc = await db.collection("mp_plans").doc(planId).get();
  if (!planDoc.exists) {
    functions.logger.warn("plan lookup: unknown mp_plans mapping", {planId});
    return null;
  }
  const courseId = planDoc.data()?.course_id as string | undefined;
  if (!courseId) {
    functions.logger.warn("plan lookup: mp_plans doc missing course_id", {planId});
    return null;
  }
  return {courseId, creatorId: (planDoc.data()?.creator_id as string | undefined) ?? null};
}

// Find-or-create the buyer, bootstrap/attribute the user doc exactly like
// executeStorefrontCheckout, and return the v1|{userId}|{courseId}|sub reference
// so the existing webhook grant path proceeds unchanged.
async function synthesizeRefForCourse(
  courseId: string, creatorId: string | null, payerEmail: string
): Promise<{userId: string; ref: string}> {
  const {userId, displayName} = await findOrCreateUserByEmail(payerEmail);

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

  return {userId, ref: buildExternalReference(userId, courseId, "sub")};
}

// Materialize the local subscription doc for a pay-first plan subscription.
// The normal (email-first) flow writes this rich doc at checkout time, which
// pay-first skips — without it the manage screen has no cancel button, next
// billing date, or status. Fetches the preapproval for the accurate next-charge
// date + amount (the `payment` payload doesn't carry them); falls back to +30d.
async function ensurePlanSubscriptionDoc(args: {
  userId: string;
  courseId: string;
  subscriptionId: string;
  courseTitle: string | null;
  payerEmail: string;
  transactionAmount: number | null;
  currency: string | null;
}): Promise<void> {
  const subRef = db.collection("users").doc(args.userId)
    .collection("subscriptions").doc(args.subscriptionId);
  const existing = await subRef.get();

  let nextBilling: string | null = null;
  let amount = args.transactionAmount;
  let currency = args.currency;
  try {
    const client = getClient(process.env.MERCADOPAGO_ACCESS_TOKEN ?? "");
    const pre = await new PreApproval(client).get({id: args.subscriptionId}) as unknown as {
      next_payment_date?: string | null;
      auto_recurring?: {
        next_payment_date?: string | null;
        transaction_amount?: number | null;
        currency_id?: string | null;
      };
    };
    nextBilling = pre?.next_payment_date ?? pre?.auto_recurring?.next_payment_date ?? null;
    if (typeof pre?.auto_recurring?.transaction_amount === "number") {
      amount = pre.auto_recurring.transaction_amount;
    }
    if (typeof pre?.auto_recurring?.currency_id === "string") {
      currency = pre.auto_recurring.currency_id;
    }
  } catch (err) {
    functions.logger.warn("ensurePlanSubscriptionDoc: preapproval fetch failed", {
      subscriptionId: args.subscriptionId, error: String(err),
    });
  }
  if (!nextBilling) {
    nextBilling = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  }

  await subRef.set({
    subscription_id: args.subscriptionId,
    user_id: args.userId,
    userId: args.userId,
    course_id: args.courseId,
    course_title: args.courseTitle ?? "Suscripción",
    status: "authorized",
    payer_email: args.payerEmail,
    transaction_amount: amount,
    currency_id: currency,
    access_duration: "monthly",
    management_url:
      `https://www.mercadopago.com.co/subscriptions/management?preapproval_id=${args.subscriptionId}`,
    next_billing_date: nextBilling,
    ...(existing.exists ? {} : {created_at: FieldValue.serverTimestamp()}),
    updated_at: FieldValue.serverTimestamp(),
  }, {merge: true});
}

// Stash a pending plan-subscription keyed by MP payer id. MP's
// subscription_preapproval events carry the plan (-> course) + payer id but an
// EMPTY payer_email, while the `payment` charge event carries the real
// payer.email but no plan/course link. payer_id is the only key present in both,
// so the preapproval webhook writes this record and the payment webhook reads it.
async function recordPendingPlanSub(args: {
  payerId: string; courseId: string; creatorId: string | null;
}): Promise<void> {
  await db.collection("mp_plan_pending").doc(args.payerId).set({
    course_id: args.courseId,
    creator_id: args.creatorId,
    updated_at: FieldValue.serverTimestamp(),
  }, {merge: true});
}

// Preapproval-webhook resolution. Maps plan -> course, always stashes the
// pending (payerId -> course) record for the payment webhook to pick up, and
// only synthesizes a reference (grants now) when MP happened to include a
// payer_email — which it usually does NOT at preapproval-create time.
export async function resolvePlanPreapprovalReference(args: {
  planId: string | null | undefined;
  payerEmail: string | null | undefined;
  payerId: string | number | null | undefined;
}): Promise<string | null> {
  const planId = typeof args.planId === "string" ? args.planId : null;
  if (!planId) return null;
  const mapped = await lookupCourseByPlan(planId);
  if (!mapped) return null;

  const payerId = args.payerId != null ? String(args.payerId) : null;
  if (payerId) {
    await recordPendingPlanSub({
      payerId, courseId: mapped.courseId, creatorId: mapped.creatorId,
    });
  }

  const payerEmail =
    typeof args.payerEmail === "string" ? args.payerEmail.trim().toLowerCase() : null;
  if (payerEmail && EMAIL_RE.test(payerEmail)) {
    functions.logger.info("plan preapproval: resolved with email", {planId, courseId: mapped.courseId});
    return (await synthesizeRefForCourse(mapped.courseId, mapped.creatorId, payerEmail)).ref;
  }
  functions.logger.info("plan preapproval: no email yet, pending stashed", {planId, payerId});
  return null;
}

// Payment-webhook resolution. The MP `payment` charge event carries the real
// payer.email but no course link, so recover the course from the pending record
// the preapproval webhook stashed (keyed by payer id), then grant.
export async function resolvePlanPaymentReference(args: {
  payerEmail: string | null | undefined;
  payerId: string | number | null | undefined;
  subscriptionId?: string | null;
  transactionAmount?: number | null;
  currency?: string | null;
  courseTitle?: string | null;
}): Promise<string | null> {
  const payerEmail =
    typeof args.payerEmail === "string" ? args.payerEmail.trim().toLowerCase() : null;
  const payerId = args.payerId != null ? String(args.payerId) : null;
  if (!payerEmail || !EMAIL_RE.test(payerEmail) || !payerId) return null;

  const pendingDoc = await db.collection("mp_plan_pending").doc(payerId).get();
  if (!pendingDoc.exists) {
    functions.logger.warn("plan payment: no pending record for payer", {payerId});
    return null;
  }
  const courseId = pendingDoc.data()?.course_id as string | undefined;
  const creatorId = (pendingDoc.data()?.creator_id as string | undefined) ?? null;
  if (!courseId) return null;

  const {userId, ref} = await synthesizeRefForCourse(courseId, creatorId, payerEmail);
  functions.logger.info("plan payment: resolved from pending", {payerId, courseId, userId});

  // Create the subscription doc the manage screen reads (cancel + billing).
  const subscriptionId = typeof args.subscriptionId === "string" ? args.subscriptionId : null;
  if (subscriptionId) {
    await ensurePlanSubscriptionDoc({
      userId,
      courseId,
      subscriptionId,
      courseTitle: args.courseTitle ?? null,
      payerEmail,
      transactionAmount: args.transactionAmount ?? null,
      currency: args.currency ?? null,
    });
  }
  return ref;
}
