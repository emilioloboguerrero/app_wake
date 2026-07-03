#!/usr/bin/env node
/**
 * Backfill international (USD / Polar) pricing onto published courses that have
 * a COP price but no Polar product yet. Derives the USD price from the COP
 * price (deriveUsdFromCop: max(1, round((cop/3500) * 1.10))), creates a Polar
 * product, and writes `courses/{id}.polar.*` (+ price_source_* = "auto").
 *
 * Mirrors provisionPolarProduct() in functions/src/api/services/polarProducts.ts.
 *
 * DEFAULTS TO DRY-RUN. Pass --live to actually create Polar products and write
 * Firestore. Always run the dry-run first and confirm the per-program USD.
 *
 * Usage (from repo root):
 *   POLAR_ACCESS_TOKEN="$(gcloud secrets versions access latest \
 *     --secret=POLAR_ACCESS_TOKEN --project=wolf-20b8b)" \
 *   POLAR_SERVER=production NODE_PATH=functions/node_modules \
 *     node scripts/backfill-polar-international.js            # dry-run
 *
 *   ...same env... node scripts/backfill-polar-international.js --live
 *
 * Flags:
 *   --live          Actually create products + write Firestore (default: dry-run)
 *   --course <id>   Restrict to a single courseId (controlled first run)
 *   --limit N       Stop after N eligible courses
 */

'use strict';

const admin = require('firebase-admin');
const { Polar } = require('@polar-sh/sdk');

const LIVE = process.argv.includes('--live');
const COURSE_IDX = process.argv.indexOf('--course');
const ONLY_COURSE = COURSE_IDX !== -1 ? process.argv[COURSE_IDX + 1] : null;
const LIMIT_IDX = process.argv.indexOf('--limit');
const MAX = LIMIT_IDX !== -1 ? parseInt(process.argv[LIMIT_IDX + 1], 10) : Infinity;

const TOKEN = process.env.POLAR_ACCESS_TOKEN;
// The dry-run is read-only (no Polar calls) — token only required for --live.
if (LIVE && !TOKEN) {
  console.error('ERROR: POLAR_ACCESS_TOKEN env var is required for --live.');
  console.error('  POLAR_ACCESS_TOKEN="$(gcloud secrets versions access latest --secret=POLAR_ACCESS_TOKEN --project=wolf-20b8b)"');
  process.exit(1);
}
const SERVER = process.env.POLAR_SERVER === 'sandbox' ? 'sandbox' : 'production';

const COP_PER_USD = 3500;
const USD_MARGIN = 1.1;
const MAX_TRIAL_DAYS = 14;

function deriveUsdFromCop(cop) {
  return Math.max(1, Math.round((cop / COP_PER_USD) * USD_MARGIN));
}

admin.initializeApp({ projectId: 'wolf-20b8b' });
const db = admin.firestore();
const polar = LIVE ? new Polar({ accessToken: TOKEN, server: SERVER }) : null;

async function createPolarProduct(courseId, course, priceUsd, mode) {
  const priceAmount = Math.round(priceUsd * 100);
  const title = typeof course.title === 'string' && course.title.trim() ? course.title : 'Programa';
  if (mode === 'subscription') {
    const ft = course.free_trial || {};
    const trialDays = ft.active === true && typeof ft.duration_days === 'number' && ft.duration_days >= 1
      ? Math.min(MAX_TRIAL_DAYS, Math.floor(ft.duration_days))
      : 0;
    const product = await polar.products.create({
      name: `${title} (Suscripción)`,
      recurringInterval: 'month',
      prices: [{ amountType: 'fixed', priceAmount, priceCurrency: 'usd' }],
      ...(trialDays > 0 ? { trialInterval: 'day', trialIntervalCount: trialDays } : {}),
      metadata: { wakeCourseId: courseId, kind: 'subscription' },
    });
    return { subscription_product_id: product.id, price_usd_monthly: priceUsd };
  }
  const product = await polar.products.create({
    name: title,
    prices: [{ amountType: 'fixed', priceAmount, priceCurrency: 'usd' }],
    metadata: { wakeCourseId: courseId, kind: 'one_time' },
  });
  return { onetime_product_id: product.id, price_usd_onetime: priceUsd };
}

async function main() {
  console.log(`\nPolar international backfill — ${LIVE ? 'LIVE' : 'DRY-RUN'} — server=${SERVER}`);
  if (ONLY_COURSE) console.log(`Restricted to course: ${ONLY_COURSE}`);
  console.log('');

  const snap = await db.collection('courses').where('status', '==', 'published').get();

  const plan = [];
  const skipped = [];
  for (const doc of snap.docs) {
    if (ONLY_COURSE && doc.id !== ONLY_COURSE) continue;
    const c = doc.data() || {};
    const isSub = (typeof c.subscription_price === 'number' && c.subscription_price > 0) ||
      c.access_duration === 'monthly';
    const mode = isSub ? 'subscription' : 'one_time';
    const copPrice = isSub
      ? (typeof c.subscription_price === 'number' ? c.subscription_price : null)
      : (typeof c.price === 'number' ? c.price : null);

    if (typeof copPrice !== 'number' || copPrice <= 0) {
      skipped.push({ id: doc.id, title: c.title, reason: 'no COP price' });
      continue;
    }
    const existing = c.polar || {};
    const storedId = isSub ? existing.subscription_product_id : existing.onetime_product_id;
    if (typeof storedId === 'string' && storedId.trim() !== '') {
      skipped.push({ id: doc.id, title: c.title, reason: `already has polar ${mode} product` });
      continue;
    }
    plan.push({
      id: doc.id,
      title: c.title || '(sin título)',
      mode,
      copPrice,
      usd: deriveUsdFromCop(copPrice),
      creatorId: c.creator_id || null,
      course: c,
      docRef: doc.ref,
    });
    if (plan.length >= MAX) break;
  }

  console.log(`Eligible: ${plan.length}    Skipped: ${skipped.length}\n`);
  console.log('COURSE ID'.padEnd(24), 'MODE'.padEnd(13), 'COP'.padStart(12), 'USD'.padStart(6), ' TITLE');
  console.log('-'.repeat(90));
  for (const p of plan) {
    console.log(
      p.id.padEnd(24),
      p.mode.padEnd(13),
      String(p.copPrice).padStart(12),
      String('$' + p.usd).padStart(6),
      ' ' + String(p.title).slice(0, 40)
    );
  }
  if (skipped.length) {
    console.log('\nSkipped:');
    for (const s of skipped) console.log(`  ${s.id}  (${s.reason})  ${s.title || ''}`);
  }

  if (!LIVE) {
    console.log('\nDRY-RUN — no products created, no writes. Re-run with --live to apply.\n');
    return;
  }

  console.log('\nLIVE — creating Polar products + writing Firestore...\n');
  let ok = 0;
  let failed = 0;
  for (const p of plan) {
    try {
      const provisioned = await createPolarProduct(p.id, p.course, p.usd, p.mode);
      const update = {};
      for (const [k, v] of Object.entries(provisioned)) update[`polar.${k}`] = v;
      update[p.mode === 'subscription' ? 'polar.price_source_monthly' : 'polar.price_source_onetime'] = 'auto';
      await p.docRef.update(update);
      ok++;
      console.log(`  OK  ${p.id}  $${p.usd}/${p.mode}  ->  ${provisioned.subscription_product_id || provisioned.onetime_product_id}`);
    } catch (err) {
      failed++;
      console.error(`  FAIL  ${p.id}  ${String(err)}`);
    }
  }
  console.log(`\nDone. Provisioned ${ok}, failed ${failed}.\n`);
}

main().then(() => process.exit(0)).catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
