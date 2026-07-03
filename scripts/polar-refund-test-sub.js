#!/usr/bin/env node
/**
 * One-off: refund the $4 test order and verify the order.refunded webhook
 * revoked access + wrote the refund ledger row. Real money (small).
 *   POLAR_ACCESS_TOKEN=... POLAR_SERVER=production NODE_PATH=functions/node_modules \
 *     node scripts/polar-refund-test-sub.js
 */
'use strict';
const admin = require('firebase-admin');
admin.initializeApp({ projectId: 'wolf-20b8b' });
const db = admin.firestore();

const TOKEN = process.env.POLAR_ACCESS_TOKEN;
const BASE = process.env.POLAR_SERVER === 'sandbox' ? 'https://sandbox-api.polar.sh' : 'https://api.polar.sh';
const ORDER_ID = '540b5044-e650-41a8-91fc-e818f20c76fb';
const UID = 'oXKlavb5RtSOzooC3K4k4FHPlMi1';
const COURSE = 'ezJWUr3wJvaeptIM5f86';

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function main() {
  if (!TOKEN) { console.error('POLAR_ACCESS_TOKEN required'); process.exit(1); }

  console.log('Refunding order', ORDER_ID, '($4, revoke_benefits)...');
  const res = await fetch(`${BASE}/v1/refunds`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    // No revoke_benefits: Polar rejects it unless the sub is already cancelled,
    // and our order.refunded webhook revokes access on our side anyway.
    body: JSON.stringify({
      order_id: ORDER_ID,
      reason: 'customer_request',
      amount: 400,
    }),
  });
  const body = await res.json();
  console.log('  refund status:', res.status, '| id:', body.id, '| amount:', body.amount, body.currency, '| refund status:', body.status);
  if (res.status >= 300) { console.error('  refund failed:', JSON.stringify(body).slice(0, 300)); }

  console.log('\nWaiting for order.refunded webhook to land...');
  for (let i = 0; i < 10; i++) {
    await sleep(3000);
    const u = await db.collection('users').doc(UID).get();
    const entry = (u.data()?.courses || {})[COURSE];
    const led = await db.collection('payment_ledger').doc(`polar_refund_${ORDER_ID}`).get();
    console.log(`  [${(i + 1) * 3}s] course.status=${entry?.status} | refund ledger=${led.exists ? 'written' : 'pending'}`);
    if (entry?.status === 'cancelled' && led.exists) {
      console.log('\n  Refund ledger:', JSON.stringify(led.data()));
      console.log('\nDONE — access revoked + refund ledger written.');
      return;
    }
  }
  console.log('\nWebhook effects not fully observed within 30s — check logs / Firestore manually.');
}
main().then(() => process.exit(0)).catch((e) => { console.error(String(e)); process.exit(1); });
