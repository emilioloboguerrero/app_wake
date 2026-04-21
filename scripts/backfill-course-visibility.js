#!/usr/bin/env node
/**
 * Backfill `visibility` field onto courses documents that were created before
 * the Program Bundles feature shipped. Default value: "both" — zero-friction
 * so every existing course is immediately bundle-eligible.
 *
 * Idempotent: docs with `visibility` already set are skipped.
 *
 * Usage (staging):
 *   GOOGLE_APPLICATION_CREDENTIALS=<path-to-sa.json> \
 *     node scripts/backfill-course-visibility.js [--dry-run] [--limit N] [--project PROJECT_ID]
 *
 * Flags:
 *   --dry-run      Print what would be updated without writing to Firestore
 *   --limit N      Stop after processing N documents (default: no limit)
 *   --project ID   Firebase project ID (default: wake-staging)
 */

'use strict';

const admin = require('firebase-admin');

const DRY_RUN = process.argv.includes('--dry-run');
const LIMIT_IDX = process.argv.indexOf('--limit');
const MAX_DOCS = LIMIT_IDX !== -1 ? parseInt(process.argv[LIMIT_IDX + 1], 10) : Infinity;
const PROJECT_IDX = process.argv.indexOf('--project');
const PROJECT_ID = PROJECT_IDX !== -1 ? process.argv[PROJECT_IDX + 1] : 'wake-staging';

const BATCH_MAX = 450;
const DEFAULT_VISIBILITY = 'both';

admin.initializeApp({ projectId: PROJECT_ID });
const db = admin.firestore();

async function main() {
  console.log(`\nBackfill course visibility — project: ${PROJECT_ID}`);
  console.log(`Default value: "${DEFAULT_VISIBILITY}"`);
  if (DRY_RUN) console.log('DRY RUN — no writes will be made');
  console.log('');

  const snap = await db.collection('courses').get();

  const missing = snap.docs.filter((doc) => {
    const d = doc.data();
    return d.visibility === undefined || d.visibility === null;
  });

  console.log(`Scanned : ${snap.size} course docs`);
  console.log(`Missing : ${missing.length}`);

  if (missing.length === 0) {
    console.log('\nNothing to backfill.');
    return;
  }

  const toProcess = missing.slice(0, MAX_DOCS === Infinity ? missing.length : MAX_DOCS);
  let updated = 0;
  let batch = db.batch();
  let batchCount = 0;

  for (const doc of toProcess) {
    console.log(`  updating courses/${doc.id}`);
    if (!DRY_RUN) {
      batch.update(doc.ref, { visibility: DEFAULT_VISIBILITY });
      batchCount++;
      if (batchCount >= BATCH_MAX) {
        await batch.commit();
        batch = db.batch();
        batchCount = 0;
      }
    }
    updated++;
  }

  if (!DRY_RUN && batchCount > 0) {
    await batch.commit();
  }

  console.log(`\nDone.`);
  console.log(`  Scanned : ${snap.size}`);
  console.log(`  Updated : ${updated}`);
  console.log(`  Skipped : ${snap.size - missing.length} (already had visibility)`);
  if (DRY_RUN) console.log('\n(dry run — no Firestore writes were made)');
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
