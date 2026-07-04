// Shared MercadoPago refund application, used by BOTH the payment webhook
// (routes/payments.ts) and the daily reconciliation cron (index.ts). MP refunds
// issued from the MP dashboard don't reliably fire a `payment.updated` webhook,
// so the cron polls recent MP sales and applies any refund the webhook missed.
import {Payment} from "mercadopago";
import * as functions from "firebase-functions";
import {db, FieldValue} from "../firestore.js";
import {getClient} from "./paymentHelpers.js";
import {writeLedgerEntryBestEffort} from "./paymentLedger.js";
import {revokeBundleAccess} from "./bundleAssignment.js";

export interface RefundGrant {
  userId?: string | null;
  courseId?: string | null;
  bundleId?: string | null;
}

// Revoke the granted access and write a refund row to payment_ledger for a
// MercadoPago refund/chargeback. Idempotent: the course/bundle revoke is a
// no-op when already revoked and writeLedgerEntryBestEffort merges on the doc
// id. Bundles are not ledgered (consistent with the sale path skipping bundle
// rows), but their access IS revoked.
export async function applyMpRefund(args: {
  paymentId: string;
  grant: RefundGrant;
  grossAmount: number;
  currency: string;
}): Promise<void> {
  const {paymentId, grant, grossAmount, currency} = args;

  if (grant.bundleId && grant.userId) {
    await revokeBundleAccess(grant.userId, grant.bundleId);
  } else if (grant.courseId && grant.userId) {
    await db.collection("users").doc(grant.userId).update({
      [`courses.${grant.courseId}.status`]: "cancelled",
      [`courses.${grant.courseId}.cancelled_at`]: new Date().toISOString(),
      updated_at: FieldValue.serverTimestamp(),
    });
  }

  if (grant.courseId && grant.userId && !grant.bundleId) {
    await writeLedgerEntryBestEffort({
      id: `mp_refund_${paymentId}`,
      provider: "mercadopago",
      type: "refund",
      status: "refunded",
      courseId: grant.courseId,
      userId: grant.userId,
      externalPaymentId: paymentId,
      grossAmount,
      currency,
      chargedAt: new Date().toISOString(),
    });
  }
}

const REFUND_STATUSES = new Set(["refunded", "charged_back"]);
const RECONCILE_WINDOW_MS = 90 * 24 * 60 * 60 * 1000;

export interface ReconcileResult {
  scanned: number;
  checked: number;
  reconciled: number;
  hits: Array<{paymentId: string; status: string; userId: string; courseId: string | null; bundleId: string | null}>;
}

// Poll recent MP sales for refunds the webhook missed. For each granted MP sale
// in the last 90 days not already marked refunded, fetch the live MP payment;
// if it's now refunded/charged_back, apply the refund and stamp the
// processed_payments doc. `dryRun` reports the hits without writing anything —
// used to validate against prod before deploying.
export async function reconcileMpRefunds(
  accessToken: string,
  opts: {dryRun?: boolean} = {}
): Promise<ReconcileResult> {
  const dryRun = opts.dryRun === true;
  const payment = new Payment(getClient(accessToken));
  // processed_at is a serverTimestamp; the Admin SDK auto-coerces this Date for
  // the range comparison. A single-field inequality needs no composite index.
  const cutoff = new Date(Date.now() - RECONCILE_WINDOW_MS);
  const snap = await db.collection("processed_payments").where("processed_at", ">=", cutoff).get();

  const result: ReconcileResult = {scanned: snap.size, checked: 0, reconciled: 0, hits: []};

  for (const doc of snap.docs) {
    const d = doc.data();
    const paymentId = doc.id;
    // MP payment processed-docs are keyed by the bare numeric MP payment id;
    // Polar docs are `polar_order_*`. Only MP ids are fetchable here.
    if (!/^\d+$/.test(paymentId)) continue;
    // Already handled (by the webhook or a prior run).
    if (typeof d.status === "string" && REFUND_STATUSES.has(d.status)) continue;
    const userId = typeof d.userId === "string" ? d.userId : null;
    const courseId = typeof d.courseId === "string" ? d.courseId : null;
    const bundleId = typeof d.bundleId === "string" ? d.bundleId : null;
    if (!userId || (!courseId && !bundleId)) continue; // not a completed grant

    result.checked++;
    let mp: {status?: string; transaction_amount?: number; currency_id?: string};
    try {
      mp = (await payment.get({id: paymentId})) as {status?: string; transaction_amount?: number; currency_id?: string};
    } catch {
      continue; // 404 / transient — skip this payment this run
    }
    if (!mp || typeof mp.status !== "string" || !REFUND_STATUSES.has(mp.status)) continue;

    result.hits.push({paymentId, status: mp.status, userId, courseId, bundleId});
    if (dryRun) continue;

    try {
      await applyMpRefund({
        paymentId,
        grant: {userId, courseId, bundleId},
        grossAmount: typeof mp.transaction_amount === "number" ? mp.transaction_amount : 0,
        currency: typeof mp.currency_id === "string" ? mp.currency_id : "COP",
      });
      await doc.ref.set(
        {status: mp.status, refunded_at: new Date().toISOString(), reconciled_by: "cron"},
        {merge: true}
      );
      result.reconciled++;
    } catch (err) {
      functions.logger.error("reconcileMpRefunds: apply failed", {paymentId, error: String(err)});
    }
  }

  functions.logger.info("reconcileMpRefunds done", {
    dryRun, scanned: result.scanned, checked: result.checked, reconciled: result.reconciled, hits: result.hits.length,
  });
  return result;
}
