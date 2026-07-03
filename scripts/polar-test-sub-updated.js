#!/usr/bin/env node
/**
 * Reversibly exercises the subscription.updated webhook handler against the live
 * $4 test sub: sets cancel_at_period_end=true, waits for the webhook to land in
 * Firestore, then sets it back to false. No money moves; the sub stays active.
 *   POLAR_ACCESS_TOKEN=... POLAR_SERVER=production NODE_PATH=functions/node_modules \
 *     node scripts/polar-test-sub-updated.js
 */
'use strict';
const admin = require('firebase-admin');
admin.initializeApp({ projectId: 'wolf-20b8b' });
const db = admin.firestore();

const TOKEN = process.env.POLAR_ACCESS_TOKEN;
const BASE = process.env.POLAR_SERVER === 'sandbox' ? 'https://sandbox-api.polar.sh' : 'https://api.polar.sh';
const SUB_POLAR = '2f4f3fce-2acf-4c19-8a1e-8e5d5b72f065';
const UID = 'oXKlavb5RtSOzooC3K4k4FHPlMi1';

async function patchSub(cancelAtPeriodEnd) {
  const res = await fetch(`${BASE}/v1/subscriptions/${SUB_POLAR}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ cancel_at_period_end: cancelAtPeriodEnd }),
  });
  const t = await res.text();
  return { status: res.status, body: t.slice(0, 200) };
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function readSubDoc() {
  const d = await db.collection('users').doc(UID).collection('subscriptions').doc(SUB_POLAR).get();
  const x = d.data() || {};
  return { status: x.status, cape: x.cancel_at_period_end };
}

async function pollUntil(pred, label, tries = 8, gapMs = 3000) {
  for (let i = 0; i < tries; i++) {
    const s = await readSubDoc();
    if (pred(s)) { console.log(`  [${label}] matched after ${i * gapMs / 1000}s ->`, JSON.stringify(s)); return true; }
    await sleep(gapMs);
  }
  console.log(`  [${label}] did NOT match within ${tries * gapMs / 1000}s ->`, JSON.stringify(await readSubDoc()));
  return false;
}

async function main() {
  console.log('Before:', JSON.stringify(await readSubDoc()));

  console.log('\n1) PATCH cancel_at_period_end=true (portal-style cancel)...');
  console.log('   ', JSON.stringify(await patchSub(true)));
  await pollUntil((s) => s.status === 'cancelled' && s.cape === true, 'cancel-reflected');

  console.log('\n2) PATCH cancel_at_period_end=false (un-cancel)...');
  console.log('   ', JSON.stringify(await patchSub(false)));
  await pollUntil((s) => s.status === 'active' && s.cape === false, 'reactivate-reflected');

  console.log('\nFinal:', JSON.stringify(await readSubDoc()));
}
main().then(() => process.exit(0)).catch((e) => { console.error(String(e)); process.exit(1); });
