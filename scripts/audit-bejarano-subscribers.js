#!/usr/bin/env node
/**
 * audit-bejarano-subscribers.js — READ-ONLY.
 *
 * Enumerates the CURRENTLY-ACTIVE, REAL, full-price subscribers of the two
 * Bejarano subscription programs (Código ABS + Método Bejarano), split by
 * provider, and emits the exact ids + amounts + emails needed to (a) lower each
 * one's recurring price to the new price and (b) refund the difference on their
 * most recent charge.
 *
 * Excludes TEST_USER_IDS (mirror of functions/src/api/services/testData.ts) and
 * anyone whose course access is not active (access-gate mirror) or whose latest
 * charge is already refunded.
 *
 * NEVER writes. Writes a manifest JSON to the path in --out for the apply step.
 *
 * Usage (from repo root):
 *   NODE_PATH=functions/node_modules GOOGLE_CLOUD_PROJECT=wolf-20b8b \
 *     node scripts/audit-bejarano-subscribers.js \
 *     --out=/tmp/.../scratchpad/bejarano-migration-manifest.json
 */
'use strict';

const fs = require('fs');
const admin = require('firebase-admin');
admin.initializeApp({ projectId: 'wolf-20b8b' });
const db = admin.firestore();

const OUT_EQ = process.argv.find((a) => a.startsWith('--out='));
const OUT_IDX = process.argv.indexOf('--out');
const OUT = OUT_EQ ? OUT_EQ.split('=').slice(1).join('=') : (OUT_IDX !== -1 ? process.argv[OUT_IDX + 1] : null);

// New target prices (locked decision 2026-07-06).
const NEW_COP = 19000;
const NEW_USD = 6;

// The two Bejarano subscription programs.
const COURSES = {
  ezJWUr3wJvaeptIM5f86: 'Código ABS',
  NTQIWMZBOxntwmUiXQZp: 'Método Bejarano',
};

// Mirror of functions/src/api/services/testData.ts (TEST_USER_IDS) — never
// touch these (creator self-tests, QA guests, 2000-COP / $4 / $21 price tests).
const TEST_USER_IDS = new Set([
  'bUCvwdPYolPe6i8JuCaY5w2PcB53',
  'EaulLBwn79Pgn7e8RAgN6umeygU2',
  'oXKlavb5RtSOzooC3K4k4FHPlMi1',
  'XQ9NDAngzAPEIwPMjDAX8e6xYa72',
  'TI5dkYVwemUru8yRzi2lctLemO43',
  'Yh4qyL4JN6db4diMDUmVlwK7p6k2',
  'yMqKOXBcVARa6vjU7wImf3Tp85J2',
  'OBJj1ip3iEOu0q53iLW46g11wdN2',
  'wX7RQWnhj8hIBZwuVn5WrBw0z7J3',
  'Iv9LRuqDcXN5t1DkRmpkgji2bC32',
]);

// Access-gate mirror (functions workout.ts / finance-snapshot.js).
const ACCESS_EXPIRY_GRACE_MS = 3 * 24 * 60 * 60 * 1000;
const PAID_SUB_STATUS = new Set(['active', 'authorized', 'approved']);

function toMs(raw) {
  if (typeof raw === 'string') { const ms = Date.parse(raw); return Number.isFinite(ms) ? ms : null; }
  if (raw && typeof raw.toMillis === 'function') return raw.toMillis();
  if (raw && typeof raw._seconds === 'number') return raw._seconds * 1000;
  return null;
}
const iso = (r) => { const ms = toMs(r); return ms ? new Date(ms).toISOString().slice(0, 16) + 'Z' : '—'; };

function courseAccessIsActive(entry) {
  if (!entry) return false;
  const ms = toMs(entry.expires_at);
  if (ms === null) return false;
  if (ms + ACCESS_EXPIRY_GRACE_MS < Date.now()) return false;
  return entry.status === 'active' || entry.is_trial === true;
}

async function main() {
  console.log('\n=== BEJARANO REPRICE — subscriber audit (READ-ONLY) ===');
  console.log(`New price: ${NEW_COP} COP / $${NEW_USD} USD\n`);

  // 1. All subscriptions for the two courses.
  const subsSnap = await db.collectionGroup('subscriptions').get();
  const candidates = [];
  subsSnap.forEach((d) => {
    const s = d.data();
    if (!COURSES[s.course_id]) return;
    candidates.push(s);
  });

  // 2. Classify each candidate.
  const rows = [];
  const excluded = [];
  for (const s of candidates) {
    const uid = s.user_id;
    const courseId = s.course_id;
    const provider = s.provider === 'polar' ? 'polar' : 'mp';
    const label = `${COURSES[courseId]} / ${provider} / ${uid}`;

    if (TEST_USER_IDS.has(uid)) { excluded.push(`${label} — TEST account`); continue; }
    if (!PAID_SUB_STATUS.has(s.status)) { excluded.push(`${label} — sub status="${s.status}"`); continue; }

    // Access-gate: only migrate people who currently have active access.
    const userSnap = await db.collection('users').doc(uid).get();
    const userData = userSnap.data() || {};
    const entry = (userData.courses || {})[courseId];
    if (!courseAccessIsActive(entry)) { excluded.push(`${label} — access not active`); continue; }

    const currentAmount = Number(s.transaction_amount) || 0;
    const currency = provider === 'polar' ? 'USD' : (s.currency_id || 'COP');
    const newAmount = provider === 'polar' ? NEW_USD : NEW_COP;

    // Sanity: only refund the difference if they actually paid the OLD full price.
    // (Guards against migrating a 2000-COP test charge that slipped the denylist.)
    const fullPrice = provider === 'polar' ? 25 : 79000;
    const priceFlag = currentAmount === fullPrice ? 'ok' : `CHECK(paid ${currentAmount})`;
    const refundAmount = Math.max(0, currentAmount - newAmount);

    // Resolve the charge to refund.
    let refundTargetId = null; // MP payment id OR Polar order id
    if (provider === 'polar') {
      refundTargetId = typeof s.last_payment_id === 'string' ? s.last_payment_id : null;
    } else {
      // Most-recent approved, non-refunded MP payment for this uid+course.
      const ppSnap = await db.collection('processed_payments')
        .where('userId', '==', uid).where('courseId', '==', courseId).get();
      let best = null;
      ppSnap.forEach((p) => {
        const pd = p.data();
        if (!/^\d+$/.test(p.id)) return; // MP ids are numeric; skip polar_order_*
        if (pd.status === 'refunded' || pd.status === 'charged_back') return;
        const t = toMs(pd.processed_at) || 0;
        if (!best || t > best.t) best = { id: p.id, t };
      });
      refundTargetId = best ? best.id : null;
    }

    rows.push({
      course_id: courseId,
      course_title: COURSES[courseId],
      uid,
      email: userData.email || null,
      provider,
      subscription_id: s.subscription_id || null, // MP preapproval id OR Polar sub id
      current_amount: currentAmount,
      currency,
      new_amount: newAmount,
      refund_amount: refundAmount,
      refund_target_id: refundTargetId, // MP payment id OR Polar order id
      price_flag: priceFlag,
      access_expires_at: entry.expires_at || null,
      sub_created_at: iso(s.created_at),
    });
  }

  rows.sort((a, b) => (a.course_title + a.provider).localeCompare(b.course_title + b.provider));

  // 3. Report.
  console.log(`AFFECTED (active, real, will migrate + refund): ${rows.length}\n`);
  console.log(
    'PROGRAM'.padEnd(16), 'PROV'.padEnd(6), 'PAID'.padStart(8), 'REFUND'.padStart(8),
    'TARGET-CHARGE'.padEnd(38), 'EMAIL'
  );
  console.log('-'.repeat(110));
  for (const r of rows) {
    console.log(
      String(r.course_title).padEnd(16),
      r.provider.padEnd(6),
      String(r.current_amount).padStart(8),
      String(r.refund_amount).padStart(8),
      String(r.refund_target_id || 'MISSING').padEnd(38),
      `${r.email || '?'}${r.price_flag !== 'ok' ? '  [' + r.price_flag + ']' : ''}${r.refund_target_id ? '' : '  [NO CHARGE FOUND]'}`
    );
  }

  console.log(`\nEXCLUDED: ${excluded.length}`);
  for (const e of excluded) console.log(`  - ${e}`);

  // Totals per currency.
  const totals = {};
  for (const r of rows) totals[r.currency] = (totals[r.currency] || 0) + r.refund_amount;
  console.log(`\nTOTAL REFUNDS by currency: ${JSON.stringify(totals)}`);

  if (OUT) {
    fs.writeFileSync(OUT, JSON.stringify({
      generated_at: new Date().toISOString(),
      new_cop: NEW_COP, new_usd: NEW_USD,
      courses: COURSES,
      subscribers: rows,
    }, null, 2));
    console.log(`\nManifest written: ${OUT}`);
  }
  console.log('\n=== end audit (read-only) ===\n');
}

main().then(() => process.exit(0)).catch((e) => { console.error('audit error:', e); process.exit(1); });
