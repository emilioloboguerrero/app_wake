#!/usr/bin/env node
'use strict';

/**
 * Opt the Método Bejarano course into per-weekday scheduling so the Hoy
 * carousel resolves today's session by dayIndex (1..7 = Lun..Dom) and the
 * WeekCoachCard surfaces planned/completed dots per day.
 *
 * Sets `scheduling: 'weekly'` on:
 *   1. courses/{bejaranoCourseId}
 *   2. users/{uid}.courses[bejaranoCourseId]  (denormalized at purchase/grant)
 *
 * Sessions themselves already carry dayIndex 1..5 (seeded by
 * scripts/seed-metodo-bejarano.js) so no session backfill is needed.
 *
 * Idempotent: skips docs whose scheduling is already 'weekly'.
 *
 * Usage:
 *   NODE_PATH=functions/node_modules node scripts/backfill-bejarano-weekly-scheduling.js          (dry-run)
 *   NODE_PATH=functions/node_modules node scripts/backfill-bejarano-weekly-scheduling.js --write  (commit)
 */

const admin = require('firebase-admin');

const PROJECT_ID = 'wolf-20b8b';
// Pinned in memory/project_metodo_bejarano_course.md.
const COURSE_ID = 'NTQIWMZBOxntwmUiXQZp';

admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  projectId: PROJECT_ID,
});
const db = admin.firestore();
const { FieldValue } = admin.firestore;

const WRITE = process.argv.includes('--write');
const tag = WRITE ? '[WRITE]' : '[dry-run]';

async function backfillCourse() {
  console.log(`\n${tag} ── courses/${COURSE_ID} ──────────────────────`);
  const ref = db.collection('courses').doc(COURSE_ID);
  const doc = await ref.get();
  if (!doc.exists) {
    console.log('  course not found — aborting');
    return 0;
  }
  const current = doc.data().scheduling ?? null;
  if (current === 'weekly') {
    console.log('  already scheduling=weekly — skipping');
    return 0;
  }
  console.log(`  scheduling: ${current ?? 'null'} → weekly`);
  if (!WRITE) return 1;
  await ref.update({
    scheduling: 'weekly',
    updated_at: FieldValue.serverTimestamp(),
    last_update: FieldValue.serverTimestamp(),
  });
  return 1;
}

async function backfillEnrolledUsers() {
  console.log(`\n${tag} ── users.courses[${COURSE_ID}].scheduling ────`);
  // Match the per-user sync pattern used by PATCH /creator/programs/:programId.
  const snap = await db
    .collection('users')
    .where(`courses.${COURSE_ID}.status`, '==', 'active')
    .get();
  console.log(`  found ${snap.size} enrolled user(s)`);
  if (snap.empty) return 0;

  let toWrite = 0;
  for (const userDoc of snap.docs) {
    const current = userDoc.data()?.courses?.[COURSE_ID]?.scheduling ?? null;
    if (current === 'weekly') continue;
    toWrite++;
    if (!WRITE) {
      console.log(`  → ${userDoc.id} scheduling: ${current ?? 'null'} → weekly`);
    }
  }

  if (!WRITE) return toWrite;

  let written = 0;
  for (let i = 0; i < snap.docs.length; i += 400) {
    const chunk = snap.docs.slice(i, i + 400);
    const batch = db.batch();
    let pending = 0;
    for (const userDoc of chunk) {
      const current = userDoc.data()?.courses?.[COURSE_ID]?.scheduling ?? null;
      if (current === 'weekly') continue;
      batch.update(userDoc.ref, {
        [`courses.${COURSE_ID}.scheduling`]: 'weekly',
      });
      pending++;
    }
    if (pending > 0) {
      await batch.commit();
      written += pending;
    }
  }
  return written;
}

(async () => {
  try {
    const courseTouched = await backfillCourse();
    const usersTouched = await backfillEnrolledUsers();
    console.log(`\n${tag} done — course updates: ${courseTouched}, user updates: ${usersTouched}`);
    if (!WRITE) console.log('  re-run with --write to commit');
    process.exit(0);
  } catch (err) {
    console.error('FAILED:', err);
    process.exit(1);
  }
})();
