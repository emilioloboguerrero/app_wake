#!/usr/bin/env node
/**
 * Backfill `amount` and `currency_id` onto processed_payments documents that
 * were written before the webhook started storing those fields.
 *
 * Targets: documents where status == "approved" AND amount field is missing.
 *
 * Usage:
 *   MERCADOPAGO_ACCESS_TOKEN=<token> GOOGLE_APPLICATION_CREDENTIALS=<path-to-sa.json> \
 *     node scripts/backfill-payment-amounts.js [--dry-run]
 *
 * Or with firebase-tools application default credentials (if already logged in):
 *   MERCADOPAGO_ACCESS_TOKEN=<token> node scripts/backfill-payment-amounts.js
 *
 * Flags:
 *   --dry-run   Print what would be updated without writing to Firestore
 *   --limit N   Stop after processing N documents (default: no limit)
 */

'use strict';

const admin = require('firebase-admin');

const DRY_RUN = process.argv.includes('--dry-run');
const LIMIT_IDX = process.argv.indexOf('--limit');
const MAX_DOCS = LIMIT_IDX !== -1 ? parseInt(process.argv[LIMIT_IDX + 1], 10) : Infinity;

const MP_TOKEN = process.env.MERCADOPAGO_ACCESS_TOKEN;
if (!MP_TOKEN) {
  console.error('ERROR: MERCADOPAGO_ACCESS_TOKEN env var is required.');
  process.exit(1);
}

// ── Firebase init ─────────────────────────────────────────────────────────────

admin.initializeApp({ projectId: 'wolf-20b8b' });
const db = admin.firestore();

// ── MercadoPago fetch helpers ─────────────────────────────────────────────────

async function fetchPayment(paymentId) {
  const res = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
    headers: { Authorization: `Bearer ${MP_TOKEN}` },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`MP payment API ${res.status} for ${paymentId}`);
  return res.json();
}

async function fetchAuthorizedPayment(paymentId) {
  const res = await fetch(`https://api.mercadopago.com/authorized_payments/${paymentId}`, {
    headers: { Authorization: `Bearer ${MP_TOKEN}` },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`MP authorized_payments API ${res.status} for ${paymentId}`);
  return res.json();
}

// ── Rate-limit-aware fetch with exponential backoff ───────────────────────────

async function fetchWithRetry(fn, label, maxAttempts = 4) {
  let delay = 1000;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const isRateLimit = err.message?.includes('429') || err.message?.includes('Too Many');
      if (attempt === maxAttempts || !isRateLimit) throw err;
      console.warn(`  [rate limit] ${label} — retrying in ${delay}ms (attempt ${attempt}/${maxAttempts})`);
      await sleep(delay);
      delay *= 2;
    }
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\nBackfill payment amounts — project: wolf-20b8b`);
  if (DRY_RUN) console.log('DRY RUN — no writes will be made\n');

  // Query approved documents without an amount field.
  // Firestore can't query "field does not exist" directly, so we use two queries:
  // 1. amount == null  (explicitly set to null)
  // 2. All approved docs — then filter in JS for missing field
  // We use the second approach (full scan of approved) to catch both cases.
  const snap = await db.collection('processed_payments')
    .where('status', '==', 'approved')
    .get();

  const missing = snap.docs.filter((doc) => {
    const d = doc.data();
    return d.amount === undefined || d.amount === null;
  });

  console.log(`Found ${snap.size} approved documents, ${missing.length} missing amount.\n`);

  if (missing.length === 0) {
    console.log('Nothing to backfill.');
    return;
  }

  const toProcess = missing.slice(0, MAX_DOCS === Infinity ? missing.length : MAX_DOCS);
  let updated = 0;
  let skipped = 0;
  let errored = 0;

  for (let i = 0; i < toProcess.length; i++) {
    const doc = toProcess[i];
    const paymentId = doc.id;
    const data = doc.data();
    const label = `[${i + 1}/${toProcess.length}] ${paymentId}`;

    try {
      // Try regular payment first; fall back to authorized_payment for subscriptions
      let paymentData = await fetchWithRetry(() => fetchPayment(paymentId), label);

      if (!paymentData && data.isSubscription) {
        paymentData = await fetchWithRetry(() => fetchAuthorizedPayment(paymentId), label);
      }

      if (!paymentData) {
        console.warn(`  ${label} — not found in MP, skipping`);
        skipped++;
        continue;
      }

      const amount =
        paymentData.transaction_amount ??
        paymentData.transaction_details?.total_paid_amount ??
        null;

      const currency_id = paymentData.currency_id ?? null;

      if (amount === null) {
        console.warn(`  ${label} — amount not available in MP response, skipping`);
        skipped++;
        continue;
      }

      console.log(`  ${label} — amount: ${amount} ${currency_id ?? ''}`);

      if (!DRY_RUN) {
        await doc.ref.update({ amount, currency_id });
      }

      updated++;

      // Polite delay to stay within MP rate limits (50 req/s on sandbox, ~10 on prod)
      await sleep(120);

    } catch (err) {
      console.error(`  ${label} — ERROR: ${err.message}`);
      errored++;
    }
  }

  console.log(`\nDone.`);
  console.log(`  Updated : ${updated}`);
  console.log(`  Skipped : ${skipped}`);
  console.log(`  Errored : ${errored}`);
  if (DRY_RUN) console.log('\n(dry run — no Firestore writes were made)');
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
