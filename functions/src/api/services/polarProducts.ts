import {getPolarClient} from "./polarClient.js";

// Trial parity with MercadoPago (clampTrialDurationDays caps at 14).
const MAX_TRIAL_DAYS = 14;

// FX + margin used to derive the default international (USD) price from the
// course's COP price. ~3500 COP/USD, plus a 10% margin to absorb MoR fees and
// FX drift. Locked decision (see the Polar international handoff). Creators can
// override the USD amount per program, which pins it "manual" and stops the
// auto re-derivation on COP changes.
const COP_PER_USD = 3500;
const USD_MARGIN = 1.1;

/**
 * Derive the default USD price from a COP price. Whole dollars, floored at $1
 * (Polar's practical minimum). Pure — safe to reuse in the backfill script.
 */
export function deriveUsdFromCop(cop: number): number {
  return Math.max(1, Math.round((cop / COP_PER_USD) * USD_MARGIN));
}

/**
 * Archive a Polar product so a superseded product doesn't linger after a price
 * change. Existing subscribers keep billing on it; it just stops being sold.
 */
export async function archivePolarProduct(productId: string): Promise<void> {
  const polar = getPolarClient();
  await polar.products.update({id: productId, productUpdate: {isArchived: true}});
}

export type PolarProductMode = "subscription" | "one_time";

export interface PolarProvisionResult {
  subscription_product_id?: string;
  onetime_product_id?: string;
  price_usd_monthly?: number;
  price_usd_onetime?: number;
}

/**
 * Create a Polar product for a course at the given USD price and return the
 * `polar.*` fields to merge onto the course doc. For subscriptions the product
 * is recurring-monthly and inherits the course's free trial; one-time products
 * are a single fixed price.
 *
 * Throws on Polar/API errors (including an unconfigured token) — the caller
 * treats provisioning as best-effort so a failure never blocks the price save.
 * On a price change the caller provisions a fresh product and repoints the
 * course; existing subscribers keep their original price on the old product.
 */
export async function provisionPolarProduct(args: {
  courseId: string;
  course: Record<string, unknown>;
  priceUsd: number;
  mode: PolarProductMode;
}): Promise<PolarProvisionResult> {
  const {courseId, course, priceUsd, mode} = args;
  const polar = getPolarClient();
  const priceAmount = Math.round(priceUsd * 100); // Polar amounts are in cents
  const title = typeof course.title === "string" && course.title.trim() ? course.title : "Programa";

  if (mode === "subscription") {
    const freeTrial = (course.free_trial ?? {}) as { active?: boolean; duration_days?: number };
    const trialDays = freeTrial.active === true &&
      typeof freeTrial.duration_days === "number" && freeTrial.duration_days >= 1 ?
      Math.min(MAX_TRIAL_DAYS, Math.floor(freeTrial.duration_days)) :
      0;

    const product = await polar.products.create({
      name: `${title} (Suscripción)`,
      recurringInterval: "month",
      prices: [{amountType: "fixed", priceAmount, priceCurrency: "usd"}],
      ...(trialDays > 0 ? {trialInterval: "day", trialIntervalCount: trialDays} : {}),
      metadata: {wakeCourseId: courseId, kind: "subscription"},
    });
    return {subscription_product_id: product.id, price_usd_monthly: priceUsd};
  }

  const product = await polar.products.create({
    name: title,
    prices: [{amountType: "fixed", priceAmount, priceCurrency: "usd"}],
    metadata: {wakeCourseId: courseId, kind: "one_time"},
  });
  return {onetime_product_id: product.id, price_usd_onetime: priceUsd};
}
