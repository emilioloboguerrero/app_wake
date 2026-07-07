#!/usr/bin/env node
/**
 * migrate-bejarano-subscribers.js — lower each existing Bejarano subscriber to
 * the new price AND refund the difference on their most recent charge. Reads the
 * manifest produced by scripts/audit-bejarano-subscribers.js.
 *
 * Per subscriber:
 *   MercadoPago:
 *     1. PreApproval.update -> auto_recurring.transaction_amount = 19000  (future renewals)
 *     2. PaymentRefund.create -> refund 60000 COP of the last charge      (partial; keeps access)
 *     3. write payment_ledger refund row (MP partial refunds fire no webhook)
 *   Polar:
 *     1. subscriptions.update -> productId = new $6 product, prorationBehavior 'next_period'
 *     2. POST /v1/refunds -> refund $19 of the last order (no revoke_benefits -> keeps access)
 *        (the refund.created webhook writes the ledger row automatically)
 *
 * DEFAULTS TO DRY-RUN. --apply to execute. --only=<email|uid> for a canary.
 *
 * Usage (from repo root):
 *   MERCADOPAGO_ACCESS_TOKEN="$(gcloud secrets versions access latest \
 *     --secret=MERCADOPAGO_ACCESS_TOKEN --project=wolf-20b8b)" \
 *   POLAR_ACCESS_TOKEN="$(gcloud secrets versions access latest \
 *     --secret=POLAR_ACCESS_TOKEN --project=wolf-20b8b)" \
 *   POLAR_SERVER=production NODE_PATH=functions/node_modules \
 *   GOOGLE_CLOUD_PROJECT=wolf-20b8b \
 *     node scripts/migrate-bejarano-subscribers.js --manifest=/path/manifest.json --only=lsvg1997@gmail.com --apply
 */
'use strict';

const fs = require('fs');
const admin = require('firebase-admin');
const { MercadoPagoConfig, PreApproval, PaymentRefund } = require('mercadopago');

const APPLY = process.argv.includes('--apply');
const arg = (name) => { const p = process.argv.find((a) => a.startsWith(`--${name}=`)); return p ? p.split('=').slice(1).join('=') : null; };
const MANIFEST = arg('manifest');
const ONLY = arg('only');
const PROVIDER = arg('provider'); // optional: 'mp' | 'polar'

const NEW_COP = 19000;
const NEW_USD = 6;
const POLAR_OLD_SUBTOTAL_USD = 25; // pre-tax subtotal the Polar sub was billed
const POLAR_REFUND_CENTS = Math.round((POLAR_OLD_SUBTOTAL_USD - NEW_USD) * 100); // 1900

const MP_TOKEN = process.env.MERCADOPAGO_ACCESS_TOKEN;
const POLAR_TOKEN = process.env.POLAR_ACCESS_TOKEN;
const POLAR_BASE = process.env.POLAR_SERVER === 'sandbox' ? 'https://sandbox-api.polar.sh' : 'https://api.polar.sh';

if (!MANIFEST) { console.error('ERROR: --manifest=<path> required'); process.exit(1); }
const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));

admin.initializeApp({ projectId: 'wolf-20b8b' });
const db = admin.firestore();
const round2 = (n) => Math.round(n * 100) / 100;

const mpClient = APPLY && MP_TOKEN ? new MercadoPagoConfig({ accessToken: MP_TOKEN }) : null;

async function polarFetch(path, init) {
  const res = await fetch(`${POLAR_BASE}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${POLAR_TOKEN}`, 'Content-Type': 'application/json', Accept: 'application/json', ...(init && init.headers) },
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

// Write an MP partial-refund ledger row (mirrors buildLedgerEntry; MP partial
// refunds do NOT fire a webhook, so we record it here for dashboard honesty).
async function writeMpRefundLedger(row, creator) {
  const gross = row.refund_amount;
  const fee = round2(gross * 0.0329); // MP estimate (buildLedgerEntry MP_FEE_FALLBACK)
  const id = `mp_refund_${row.refund_target_id}`;
  await db.collection('payment_ledger').doc(id).set({
    id,
    provider: 'mercadopago',
    type: 'refund',
    status: 'refunded',
    creator_id: creator.id,
    creator_name: creator.name,
    course_id: row.course_id,
    course_title: row.course_title,
    user_id: row.uid,
    user_email: row.email || null,
    subscription_id: row.subscription_id || null,
    external_payment_id: String(row.refund_target_id),
    gross_amount: gross,
    currency: 'COP',
    tax_amount: null,
    provider_fee: fee,
    provider_fee_basis: 'estimate',
    net_amount: round2(gross - fee),
    platform_commission_rate: null,
    platform_fee: null,
    creator_net: null,
    charged_at: new Date().toISOString(),
    created_at: admin.firestore.FieldValue.serverTimestamp(),
    note: 'partial refund of price-drop difference (reprice-bejarano 2026-07-06)',
  }, { merge: true });
}

async function creatorFor(courseId) {
  const c = (await db.collection('courses').doc(courseId).get()).data() || {};
  return { id: c.creator_id || null, name: c.creatorName || c.creator_name || null,
    polarProductId: (c.polar || {}).subscription_product_id || null };
}

async function doMp(row, creator) {
  console.log(`  [MP] ${row.email} — preapproval ${row.subscription_id} -> ${NEW_COP} COP; refund ${row.refund_amount} on payment ${row.refund_target_id}`);
  if (!row.refund_target_id) { console.log('    SKIP — no charge id'); return { skipped: true }; }
  if (!APPLY) return { dryRun: true };

  // 1. Lower future renewals.
  await new PreApproval(mpClient).update({
    id: row.subscription_id,
    body: { auto_recurring: { transaction_amount: NEW_COP, currency_id: 'COP' } },
  });
  // 2. Partial refund (idempotencyKey guards double-runs).
  await new PaymentRefund(mpClient).create({
    payment_id: row.refund_target_id,
    body: { amount: row.refund_amount },
    requestOptions: { idempotencyKey: `bejarano-refund-${row.refund_target_id}` },
  });
  // 3. Ledger.
  await writeMpRefundLedger(row, creator);
  console.log('    OK — amount lowered + refunded + ledgered');
  return { ok: true };
}

async function doPolar(row, creator) {
  const newProductId = creator.polarProductId;
  console.log(`  [Polar] ${row.email} — sub ${row.subscription_id} -> product ${newProductId} (next_period); refund $${POLAR_REFUND_CENTS / 100} on order ${row.refund_target_id}`);
  if (!newProductId) { console.log('    SKIP — course has no new Polar product id yet (run reprice first)'); return { skipped: true }; }
  if (!row.refund_target_id) { console.log('    SKIP — no order id'); return { skipped: true }; }
  if (!APPLY) return { dryRun: true };

  // Guard: skip refund if this order already has a succeeded refund.
  const existing = await polarFetch(`/v1/refunds/?order_id=${row.refund_target_id}`, { method: 'GET' });
  const already = Array.isArray(existing.body.items) && existing.body.items.some((r) => r.status === 'succeeded');

  // 1. Switch product for future renewals.
  const upd = await polarFetch(`/v1/subscriptions/${row.subscription_id}`, {
    method: 'PATCH',
    body: JSON.stringify({ product_id: newProductId, proration_behavior: 'next_period' }),
  });
  console.log(`    switch status ${upd.status}${upd.status >= 300 ? ' — ' + JSON.stringify(upd.body).slice(0, 200) : ''}`);

  // 2. Partial refund (no revoke_benefits -> access kept).
  if (already) { console.log('    refund SKIP — order already refunded'); return { ok: true }; }
  const ref = await polarFetch('/v1/refunds', {
    method: 'POST',
    body: JSON.stringify({ order_id: row.refund_target_id, reason: 'customer_request', amount: POLAR_REFUND_CENTS }),
  });
  console.log(`    refund status ${ref.status} | id ${ref.body.id} | $${(ref.body.amount || 0) / 100} ${ref.body.status || ''}`);
  return { ok: ref.status < 300 };
}

async function main() {
  console.log(`\n=== BEJARANO MIGRATE + REFUND — ${APPLY ? 'LIVE' : 'DRY-RUN'} ===`);
  if (ONLY) console.log(`Filter --only=${ONLY}`);
  if (PROVIDER) console.log(`Filter --provider=${PROVIDER}`);
  if (APPLY && !MP_TOKEN) console.log('WARN: MERCADOPAGO_ACCESS_TOKEN missing — MP rows will fail');
  if (APPLY && !POLAR_TOKEN) console.log('WARN: POLAR_ACCESS_TOKEN missing — Polar rows will fail');
  console.log('');

  const creatorCache = {};
  let done = 0; let skipped = 0;
  for (const row of manifest.subscribers) {
    if (ONLY && row.email !== ONLY && row.uid !== ONLY) continue;
    if (PROVIDER && row.provider !== PROVIDER) continue;
    if (!creatorCache[row.course_id]) creatorCache[row.course_id] = await creatorFor(row.course_id);
    const creator = creatorCache[row.course_id];
    const res = row.provider === 'polar' ? await doPolar(row, creator) : await doMp(row, creator);
    if (res.skipped) skipped++; else if (res.ok) done++;
  }
  console.log(`\n${APPLY ? 'Applied' : 'Would apply'}: ${done} | skipped: ${skipped}`);
  if (!APPLY) console.log('DRY-RUN — nothing changed. Re-run with --apply.\n');
}

main().then(() => process.exit(0)).catch((e) => { console.error('migrate error:', e); process.exit(1); });
