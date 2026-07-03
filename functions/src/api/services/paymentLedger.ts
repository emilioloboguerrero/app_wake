// Payment ledger — one immutable row per money event (sale, renewal, one-time,
// refund) across BOTH providers (Polar + MercadoPago). This is the accounting
// source of truth for "how much entered, per creator, per program, per method,
// and what fee each provider charged". Written by the payment webhooks.
//
// Design: docs/POLAR_INTEGRATION_STATUS.md ("payment_ledger"). Rows are keyed by
// a deterministic doc id (e.g. polar_order_{id}, mp_{paymentId}) so a retried
// webhook merges instead of double-counting. Provider fee is the REAL settled
// fee when the provider hands it to us (MercadoPago fee_details), otherwise an
// estimate from the fee schedule below (flagged via provider_fee_basis).
import {db, FieldValue} from "../firestore.js";
import * as functions from "firebase-functions";

export type LedgerProvider = "polar" | "mercadopago";
export type LedgerType = "initial" | "renewal" | "one_time" | "refund";

// Platform commission = the share Wake keeps from what it RECEIVES (net of the
// provider fee), per provider. International (Polar) is expected to be higher.
// Left null until the business sets the rates — when a rate is set, each new
// row snapshots it so later changes don't rewrite history. Reports can also
// apply rates retroactively from gross/net when these are null.
const PLATFORM_COMMISSION_RATE: Record<LedgerProvider, number | null> = {
  polar: null, // e.g. 0.20 once decided
  mercadopago: null, // e.g. 0.15 once decided
};

// Fee schedule for ESTIMATING the processor/MoR fee when the webhook doesn't
// carry the settled fee. Polar: current plan (Starter 5% + 50¢) + international
// card surcharge (all Polar sales are non-CO cards). MercadoPago: fallback only
// — we prefer the real fee from the payment's fee_details.
const POLAR_FEE = {percent: 0.05, fixed: 0.5, intlSurcharge: 0.015};
const MP_FEE_FALLBACK = {percent: 0.0329, fixed: 0};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function estimateProviderFee(provider: LedgerProvider, gross: number): number {
  if (!(gross > 0)) return 0;
  if (provider === "polar") {
    return round2(gross * (POLAR_FEE.percent + POLAR_FEE.intlSurcharge) + POLAR_FEE.fixed);
  }
  return round2(gross * MP_FEE_FALLBACK.percent + MP_FEE_FALLBACK.fixed);
}

// Sum the real MercadoPago fee from a payment's fee_details array. Returns null
// when absent (subscription_authorized_payment often omits it) so the caller
// falls back to the estimate.
export function sumMercadoPagoFee(feeDetails: unknown): number | null {
  if (!Array.isArray(feeDetails) || feeDetails.length === 0) return null;
  let total = 0;
  let found = false;
  for (const f of feeDetails) {
    const amount = (f as {amount?: unknown})?.amount;
    if (typeof amount === "number" && Number.isFinite(amount)) {
      total += amount;
      found = true;
    }
  }
  return found ? round2(total) : null;
}

export interface LedgerInput {
  id: string; // deterministic doc id
  provider: LedgerProvider;
  type: LedgerType;
  status: "paid" | "refunded";
  courseId: string;
  userId: string;
  userEmail?: string | null;
  subscriptionId?: string | null;
  externalPaymentId: string;
  grossAmount: number | null; // major units, pre-tax (coerced to 0 when null)
  currency: string;
  taxAmount?: number | null;
  chargedAt?: string | null;
  // Denormalized from the course doc the caller already holds (avoids a join).
  creatorId?: string | null;
  creatorName?: string | null;
  courseTitle?: string | null;
  // Real settled provider fee when available (MercadoPago fee_details).
  providerFeeActual?: number | null;
}

export function buildLedgerEntry(input: LedgerInput): Record<string, unknown> {
  const gross = typeof input.grossAmount === "number" && Number.isFinite(input.grossAmount) ?
    input.grossAmount : 0;
  const feeActual = typeof input.providerFeeActual === "number" ? round2(input.providerFeeActual) : null;
  const providerFee = feeActual !== null ? feeActual : estimateProviderFee(input.provider, gross);
  const netAmount = round2(gross - providerFee);
  const rate = PLATFORM_COMMISSION_RATE[input.provider];
  const platformFee = rate !== null ? round2(netAmount * rate) : null;
  const creatorNet = platformFee !== null ? round2(netAmount - platformFee) : null;
  return {
    id: input.id,
    provider: input.provider,
    type: input.type,
    status: input.status,
    creator_id: input.creatorId ?? null,
    creator_name: input.creatorName ?? null,
    course_id: input.courseId,
    course_title: input.courseTitle ?? null,
    user_id: input.userId,
    user_email: input.userEmail ?? null,
    subscription_id: input.subscriptionId ?? null,
    external_payment_id: input.externalPaymentId,
    gross_amount: gross,
    currency: input.currency,
    tax_amount: input.taxAmount ?? null,
    provider_fee: providerFee,
    provider_fee_basis: feeActual !== null ? "actual" : "estimate",
    net_amount: netAmount,
    platform_commission_rate: rate,
    platform_fee: platformFee,
    creator_net: creatorNet,
    charged_at: input.chargedAt ?? null,
    created_at: FieldValue.serverTimestamp(),
  };
}

// Standalone best-effort write (MercadoPago path + all refunds). NEVER throws —
// a ledger failure must never break a payment grant. When creator fields aren't
// passed (refunds), self-enriches from the course doc.
export async function writeLedgerEntryBestEffort(input: LedgerInput): Promise<void> {
  try {
    let enriched = input;
    if (!input.creatorId && input.courseId) {
      try {
        const c = await db.collection("courses").doc(input.courseId).get();
        const cd = c.data();
        if (cd) {
          enriched = {
            ...input,
            creatorId: (cd.creator_id as string) ?? null,
            creatorName: (cd.creatorName as string) ?? (cd.creator_name as string) ?? null,
            courseTitle: input.courseTitle ?? (cd.title as string) ?? null,
          };
        }
      } catch {
        // course read is best-effort — fall through with what we have
      }
    }
    await db.collection("payment_ledger").doc(input.id).set(buildLedgerEntry(enriched), {merge: true});
  } catch (err) {
    functions.logger.warn("payment_ledger write failed (non-blocking)", {
      id: input.id, provider: input.provider, error: String(err),
    });
  }
}
