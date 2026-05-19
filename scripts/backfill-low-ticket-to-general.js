#!/usr/bin/env node
'use strict';

/**
 * Rename every `deliveryType: 'low_ticket'` to `deliveryType: 'general'`.
 *
 * Targets:
 *   1. courses/{courseId}.deliveryType
 *   2. users/{uid}.courses[courseId].deliveryType  (denormalized at purchase/grant)
 *
 * Why: `low_ticket` and `general` collapsed into one product type. New writes
 * are normalized in functions/src/api/routes/creator.ts and read-side defaults
 * now fall back to 'general'. This sweep makes existing data agree.
 *
 * Idempotent: skips docs whose deliveryType is already 'general' (or unset).
 *
 * Usage:
 *   NODE_PATH=functions/node_modules node scripts/backfill-low-ticket-to-general.js          (dry-run)
 *   NODE_PATH=functions/node_modules node scripts/backfill-low-ticket-to-general.js --write  (commit)
 */

const admin = require('firebase-admin');

const PROJECT_ID = 'wolf-20b8b';

admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  projectId: PROJECT_ID,
});
const db = admin.firestore();
const { FieldValue } = admin.firestore;

const WRITE = process.argv.includes('--write');
const tag = WRITE ? '[WRITE]' : '[dry-run]';

async function backfillCourses() {
  console.log(`\n${tag} ── courses ──────────────────────────────────────`);
  const snap = await db.collection('courses').where('deliveryType', '==', 'low_ticket').get();
  console.log(`  found ${snap.size} course doc(s) with deliveryType='low_ticket'`);
  if (snap.empty) return 0;

  if (!WRITE) {
    for (const doc of snap.docs) {
      console.log(`  → ${doc.id} "${doc.data().title ?? ''}" deliveryType → general`);
    }
    return snap.size;
  }

  // Batch in chunks of 400 (Firestore batch limit is 500; leave headroom).
  let written = 0;
  for (let i = 0; i < snap.docs.length; i += 400) {
    const chunk = snap.docs.slice(i, i + 400);
    const batch = db.batch();
    for (const doc of chunk) {
      batch.update(doc.ref, {
        deliveryType: 'general',
        updated_at: FieldValue.serverTimestamp(),
      });
    }
    await batch.commit();
    written += chunk.length;
    console.log(`  ✓ wrote chunk ${i / 400 + 1} (${chunk.length} docs)`);
  }
  return written;
}

async function backfillUserCourseEntries() {
  console.log(`\n${tag} ── users.courses entries ────────────────────────`);
  // No way to query into a map's nested field; full collection scan. Tolerable
  // for wolf-20b8b (~thousands of users). For >50k users, shard by created_at.
  const snap = await db.collection('users').get();
  console.log(`  scanning ${snap.size} user doc(s)`);

  const updatesByUser = [];
  for (const doc of snap.docs) {
    const courses = doc.data().courses;
    if (!courses || typeof courses !== 'object') continue;
    const update = {};
    for (const [courseId, entry] of Object.entries(courses)) {
      if (entry && entry.deliveryType === 'low_ticket') {
        update[`courses.${courseId}.deliveryType`] = 'general';
      }
    }
    if (Object.keys(update).length > 0) {
      updatesByUser.push({ ref: doc.ref, uid: doc.id, update });
    }
  }
  console.log(`  ${updatesByUser.length} user(s) have at least one low_ticket course entry`);

  if (!WRITE) {
    for (const u of updatesByUser.slice(0, 10)) {
      console.log(`  → ${u.uid}: ${Object.keys(u.update).length} entry/entries`);
    }
    if (updatesByUser.length > 10) console.log(`  … (${updatesByUser.length - 10} more)`);
    return updatesByUser.length;
  }

  let written = 0;
  for (let i = 0; i < updatesByUser.length; i += 400) {
    const chunk = updatesByUser.slice(i, i + 400);
    const batch = db.batch();
    for (const u of chunk) {
      batch.update(u.ref, { ...u.update, updated_at: FieldValue.serverTimestamp() });
    }
    await batch.commit();
    written += chunk.length;
    console.log(`  ✓ wrote chunk ${i / 400 + 1} (${chunk.length} users)`);
  }
  return written;
}

(async () => {
  console.log(`${tag} backfill-low-ticket-to-general · project=${PROJECT_ID}`);
  const courseCount = await backfillCourses();
  const userCount = await backfillUserCourseEntries();
  console.log(`\n${tag} summary: ${courseCount} courses + ${userCount} user entries`);
  if (!WRITE) console.log(`${tag} dry-run only. Re-run with --write to commit.`);
  process.exit(0);
})().catch((err) => {
  console.error('FATAL', err);
  process.exit(1);
});
