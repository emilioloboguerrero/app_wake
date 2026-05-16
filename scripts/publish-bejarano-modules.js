#!/usr/bin/env node
'use strict';

/**
 * Flip `published_at` on every module of courses/NTQIWMZBOxntwmUiXQZp.
 *
 * Sets all three modules (M1/M2/M3) to a non-null timestamp so the
 * `monthlyDropAdvance` cron picks them up one-per-first-Monday. M1 is set to
 * now (already gates today). M2 / M3 are set to their respective first-Monday
 * unlock dates (matches existing `unlocks_at` set by fix-bejarano-launch.js).
 *
 * Schema note: gating + cron only check `published_at !== null`; the actual
 * value is informational (audit-trail of when the block was made available).
 *
 * Does NOT touch:
 *   - course.status (still "draft" — launch decision)
 *   - program_state/{courseId} (subscribers won't see M1 until either the
 *     2026-06-01 cron fires or program_state is seeded manually)
 *
 * Idempotent: skips modules whose published_at is already set.
 *
 * Usage:
 *   NODE_PATH=functions/node_modules node scripts/publish-bejarano-modules.js          (dry-run)
 *   NODE_PATH=functions/node_modules node scripts/publish-bejarano-modules.js --write  (commit)
 */

const admin = require('firebase-admin');

const PROJECT_ID = 'wolf-20b8b';
const COURSE_ID = 'NTQIWMZBOxntwmUiXQZp';

function firstMondayBog(year, month) {
  for (let day = 1; day <= 7; day++) {
    const probe = new Date(Date.UTC(year, month - 1, day, 5, 0, 0));
    const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota', weekday: 'short' });
    if (fmt.format(probe).startsWith('Mon')) return probe;
  }
  throw new Error(`unreachable: no Monday in first 7 days of ${year}-${month}`);
}

admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  projectId: PROJECT_ID,
});
const db = admin.firestore();
const { FieldValue, Timestamp } = admin.firestore;

const WRITE = process.argv.includes('--write');
const tag = WRITE ? '[WRITE]' : '[dry-run]';

(async () => {
  console.log(`${tag} publish-bejarano-modules · course=${COURSE_ID}`);

  const modulesSnap = await db
    .collection('courses').doc(COURSE_ID)
    .collection('modules')
    .orderBy('order', 'asc')
    .get();

  if (modulesSnap.empty) {
    console.error('! no modules found — aborting');
    process.exit(2);
  }

  // M1 → now; M2 → 2026-06-01 BOG; M3 → 2026-07-06 BOG; future months → now.
  const m2 = firstMondayBog(2026, 6);
  const m3 = firstMondayBog(2026, 7);
  const targetByIndex = [new Date(), m2, m3];

  const updates = [];
  for (let i = 0; i < modulesSnap.docs.length; i++) {
    const doc = modulesSnap.docs[i];
    const data = doc.data() || {};
    const current = data.published_at;
    if (current !== null && current !== undefined) {
      console.log(`  ✓ ${doc.id} "${data.title}" already published (${current.toDate?.().toISOString?.() ?? current})`);
      continue;
    }
    const target = targetByIndex[i] ?? new Date();
    console.log(`  → ${doc.id} "${data.title}" published_at → ${target.toISOString()}`);
    updates.push({ ref: doc.ref, target });
  }

  console.log(`\n${tag} planned writes: ${updates.length}`);
  if (!WRITE) {
    console.log(`${tag} dry-run only. Re-run with --write to commit.`);
    process.exit(0);
  }

  for (const u of updates) {
    await u.ref.update({
      published_at: Timestamp.fromDate(u.target),
      updated_at: FieldValue.serverTimestamp(),
    });
    console.log(`  ✓ ${u.ref.id} published`);
  }

  console.log(`\n${tag} done.`);
  process.exit(0);
})().catch((err) => {
  console.error('FATAL', err);
  process.exit(1);
});
