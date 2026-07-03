// Pure, dependency-free helpers for the Polar (merchant-of-record) integration.
// Kept separate from the route handler so the branching logic (metadata,
// product resolution, amount/date normalization, renewal classification) is
// unit-testable without the Polar SDK, Firestore, or Express.
//
// See docs/superpowers/specs/2026-07-01-polar-international-payments-design.md

export type PolarPaymentType = "subscription" | "one_time";

export interface PolarCheckoutMetadata {
  userId: string;
  courseId: string;
  paymentType: PolarPaymentType;
}

// Webhook event `type` strings we act on. Full list is larger; these are the
// only ones with side effects. Grant on order.paid (charges) and the trialing
// subscription; revoke on subscription.revoked and refunds.
export const POLAR_EVENTS = {
  ORDER_PAID: "order.paid",
  ORDER_REFUNDED: "order.refunded",
  REFUND_CREATED: "refund.created",
  SUBSCRIPTION_CREATED: "subscription.created",
  SUBSCRIPTION_ACTIVE: "subscription.active",
  SUBSCRIPTION_UPDATED: "subscription.updated",
  SUBSCRIPTION_CANCELED: "subscription.canceled",
  SUBSCRIPTION_REVOKED: "subscription.revoked",
} as const;

const COURSE_ID_RE = /^[a-zA-Z0-9_-]{1,128}$/;

/**
 * Resolve the Polar product id configured on a course for the given payment
 * type. Returns null when the course has no Polar mapping for that type.
 *
 * Course shape: `courses/{id}.polar = { subscription_product_id, onetime_product_id }`.
 */
export function resolvePolarProductId(
  course: Record<string, unknown> | null | undefined,
  paymentType: PolarPaymentType
): string | null {
  const polar = (course?.polar ?? null) as Record<string, unknown> | null;
  if (!polar || typeof polar !== "object") return null;
  const key = paymentType === "subscription" ?
    "subscription_product_id" :
    "onetime_product_id";
  const value = polar[key];
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

/** True when `value` is a valid PolarPaymentType. */
export function isPolarPaymentType(value: unknown): value is PolarPaymentType {
  return value === "subscription" || value === "one_time";
}

/**
 * Validate and normalize the metadata we round-trip through Polar checkout.
 * Polar returns metadata values as string | number | boolean, so we coerce to
 * string and validate. Throws on anything missing/invalid — the webhook treats
 * a throw as "can't attribute this event" and skips the grant.
 */
export function parsePolarMetadata(raw: unknown): PolarCheckoutMetadata {
  if (!raw || typeof raw !== "object") {
    throw new Error("Polar metadata missing");
  }
  const md = raw as Record<string, unknown>;
  const userId = coerceString(md.userId);
  const courseId = coerceString(md.courseId);
  const paymentType = coerceString(md.paymentType);

  if (!userId) throw new Error("Polar metadata missing userId");
  if (!courseId || !COURSE_ID_RE.test(courseId)) {
    throw new Error("Polar metadata missing/invalid courseId");
  }
  if (!isPolarPaymentType(paymentType)) {
    throw new Error(`Polar metadata invalid paymentType: ${paymentType}`);
  }
  return {userId, courseId, paymentType};
}

function coerceString(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

/**
 * Polar reports monetary amounts in minor units (cents). Convert to the major
 * unit for storage/display, matching how MercadoPago amounts are stored (major
 * COP). Returns null for non-finite input.
 */
export function polarCentsToMajor(cents: unknown): number | null {
  if (typeof cents !== "number" || !Number.isFinite(cents)) return null;
  return Math.round(cents) / 100;
}

/**
 * Normalize a Polar date field (SDK may hand back a Date, an ISO string, or a
 * timestamp) to an ISO string. Returns null when unparseable.
 */
export function toIsoDate(value: unknown): string | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }
  if (typeof value === "string" || typeof value === "number") {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  return null;
}

/**
 * Classify a subscription-charge order as a renewal vs the first charge, from
 * Polar's `billingReason`. `subscription_cycle` = recurring renewal; anything
 * else (subscription_create, purchase) = first/new.
 */
export function isRenewalBillingReason(billingReason: unknown): boolean {
  return billingReason === "subscription_cycle";
}

/** True when a subscription payload represents a trial (not yet charged). */
export function isTrialingSubscription(subscription: Record<string, unknown> | null | undefined): boolean {
  return subscription?.status === "trialing";
}
