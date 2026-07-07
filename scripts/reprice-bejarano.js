#!/usr/bin/env node
/**
 * reprice-bejarano.js — catalog price change for the two Bejarano subscription
 * programs. Sets COP -> 19000 and international USD -> $6, provisioning a fresh
 * Polar product at $6 and archiving the old one (mirrors syncPolarProduct in
 * functions/src/api/routes/creator.ts + provisionPolarProduct).
 *
 * This affects NEW buyers only. Existing subscribers are handled separately by
 * scripts/migrate-bejarano-subscribers.js (which reads the new product id this
 * script writes to courses/{id}.polar.subscription_product_id).
 *
 * DEFAULTS TO DRY-RUN. Pass --apply to write Firestore + create/archive Polar
 * products. Run the dry-run first.
 *
 * Usage (from repo root):
 *   POLAR_ACCESS_TOKEN="$(gcloud secrets versions access latest \
 *     --secret=POLAR_ACCESS_TOKEN --project=wolf-20b8b)" \
 *   POLAR_SERVER=production NODE_PATH=functions/node_modules \
 *   GOOGLE_CLOUD_PROJECT=wolf-20b8b \
 *     node scripts/reprice-bejarano.js            # dry-run
 *     node scripts/reprice-bejarano.js --apply    # live
 */
'use strict';

const admin = require('firebase-admin');
const { Polar } = require('@polar-sh/sdk');

const APPLY = process.argv.includes('--apply');
const TOKEN = process.env.POLAR_ACCESS_TOKEN;
const SERVER = process.env.POLAR_SERVER === 'sandbox' ? 'sandbox' : 'production';

const NEW_COP = 19000;
const NEW_USD = 6;

// Per-course plan. `pinUsd` writes the top-level price_usd too (Código ABS has
// a legacy manual pin there; Método derives cleanly and has none).
const PLAN = [
  { id: 'ezJWUr3wJvaeptIM5f86', title: 'Código ABS', pinUsd: true },
  { id: 'NTQIWMZBOxntwmUiXQZp', title: 'Método Bejarano', pinUsd: false },
];

if (APPLY && !TOKEN) {
  console.error('ERROR: POLAR_ACCESS_TOKEN required for --apply.');
  process.exit(1);
}

admin.initializeApp({ projectId: 'wolf-20b8b' });
const db = admin.firestore();
const polar = APPLY ? new Polar({ accessToken: TOKEN, server: SERVER }) : null;

async function createSubscriptionProduct(courseId, course, priceUsd) {
  const priceAmount = Math.round(priceUsd * 100); // cents
  const title = typeof course.title === 'string' && course.title.trim() ? course.title : 'Programa';
  const product = await polar.products.create({
    name: `${title} (Suscripción)`,
    recurringInterval: 'month',
    prices: [{ amountType: 'fixed', priceAmount, priceCurrency: 'usd' }],
    metadata: { wakeCourseId: courseId, kind: 'subscription' },
  });
  return product.id;
}

async function main() {
  console.log(`\n=== BEJARANO REPRICE — ${APPLY ? 'LIVE' : 'DRY-RUN'} — server=${SERVER} ===`);
  console.log(`Target: ${NEW_COP} COP / $${NEW_USD} USD\n`);

  for (const p of PLAN) {
    const ref = db.collection('courses').doc(p.id);
    const snap = await ref.get();
    if (!snap.exists) { console.error(`  MISSING course ${p.id}`); continue; }
    const c = snap.data();
    const oldPolar = c.polar || {};
    console.log(`${p.title} (${p.id})`);
    console.log(`  COP:  ${c.subscription_price} -> ${NEW_COP}`);
    console.log(`  USD:  ${oldPolar.price_usd_monthly ?? c.price_usd ?? '?'} -> ${NEW_USD}`);
    console.log(`  Polar product: ${oldPolar.subscription_product_id || '(none)'} -> NEW (old archived)`);

    if (!APPLY) { console.log(''); continue; }

    // 1. New Polar product at $6.
    const newProductId = await createSubscriptionProduct(p.id, c, NEW_USD);
    // 2. Archive the old one (existing subs keep billing on it until migrated).
    if (typeof oldPolar.subscription_product_id === 'string' && oldPolar.subscription_product_id) {
      await polar.products.update({ id: oldPolar.subscription_product_id, productUpdate: { isArchived: true } });
    }
    // 3. Firestore.
    const update = {
      subscription_price: NEW_COP,
      'polar.subscription_product_id': newProductId,
      'polar.price_usd_monthly': NEW_USD,
      'polar.price_source_monthly': 'auto',
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
    };
    if (p.pinUsd) update.price_usd = NEW_USD;
    await ref.update(update);
    console.log(`  DONE -> new product ${newProductId}\n`);
  }

  if (!APPLY) console.log('DRY-RUN — nothing written. Re-run with --apply.\n');
  else console.log('Reprice complete.\n');
}

main().then(() => process.exit(0)).catch((e) => { console.error('reprice error:', e); process.exit(1); });
