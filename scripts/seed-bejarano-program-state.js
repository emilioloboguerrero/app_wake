#!/usr/bin/env node
'use strict';

/**
 * Seed program_state/NTQIWMZBOxntwmUiXQZp so Mes 1 ("Base") goes live for
 * subscribers IMMEDIATELY, instead of waiting for the next monthlyDropAdvance
 * cron tick on 2026-06-01.
 *
 * Without this doc, the cron defaults current_block_index to -1 and only
 * advances on the first Monday of the month. We're seeding mid-month, so
 * we set current_block_index = 0 (M1's order) directly.
 *
 * Also denormalizes onto the course doc so PWA reads (useCoursesEnriched +
 * /workout/programs/:id/current-block) don't need an extra round-trip.
 *
 * Idempotent. Reads current state and skips fields that already match.
 *
 * Usage:
 *   NODE_PATH=functions/node_modules node scripts/seed-bejarano-program-state.js          (dry-run)
 *   NODE_PATH=functions/node_modules node scripts/seed-bejarano-program-state.js --write  (commit)
 *
 * After running, flip courses/NTQIWMZBOxntwmUiXQZp.status to "published" in
 * the dashboard to expose the MP checkout. Once a subscriber is granted access
 * (via webhook), they'll see M1 on Hoy on the next refresh.
 */

const admin = require('firebase-admin');

const PROJECT_ID = 'wolf-20b8b';
const COURSE_ID = 'NTQIWMZBOxntwmUiXQZp';
const M1_MODULE_ID = 'AHSaID03k5K1Cq3qNcIw';
const M1_ORDER = 0;
const M2_MODULE_ID = '49HKARanZMsdoW7p7yC4';
const M2_ORDER = 1;

admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  projectId: PROJECT_ID,
});
const db = admin.firestore();
const { FieldValue, Timestamp } = admin.firestore;

const WRITE = process.argv.includes('--write');
const tag = WRITE ? '[WRITE]' : '[dry-run]';

function tsEqualMillis(ts, ms) {
  if (!ts || typeof ts.toMillis !== 'function') return false;
  return Math.abs(ts.toMillis() - ms) < 1000;
}

(async () => {
  console.log(`${tag} seed-bejarano-program-state · course=${COURSE_ID}`);

  // Sanity: confirm M1 + M2 exist with the expected orders. Catches a stale
  // ID list before we write a state doc that points at a missing module.
  const courseRef = db.collection('courses').doc(COURSE_ID);
  const courseSnap = await courseRef.get();
  if (!courseSnap.exists) {
    console.error(`! course ${COURSE_ID} does not exist — aborting`);
    process.exit(2);
  }

  const m1Snap = await courseRef.collection('modules').doc(M1_MODULE_ID).get();
  const m2Snap = await courseRef.collection('modules').doc(M2_MODULE_ID).get();
  if (!m1Snap.exists) {
    console.error(`! M1 module ${M1_MODULE_ID} does not exist — aborting`);
    process.exit(2);
  }
  if (m1Snap.data().order !== M1_ORDER) {
    console.error(`! M1 order ${m1Snap.data().order} ≠ expected ${M1_ORDER} — aborting`);
    process.exit(2);
  }
  if (m1Snap.data().published_at == null) {
    console.error(`! M1 published_at is null — run publish-bejarano-modules.js --write first`);
    process.exit(2);
  }
  if (m2Snap.exists && m2Snap.data().order !== M2_ORDER) {
    console.warn(`  ! M2 order ${m2Snap.data().order} ≠ expected ${M2_ORDER} — next-block hint may be wrong`);
  }
  console.log(`  ✓ M1 verified: order=${M1_ORDER}, published_at set`);

  const stateRef = db.collection('program_state').doc(COURSE_ID);
  const stateSnap = await stateRef.get();
  const now = new Date();
  const nowMs = now.getTime();

  // ── plan program_state writes ─────────────────────────────────────────
  console.log(`\n--- program_state/${COURSE_ID} ---`);
  const stateUpdates = {};
  const cur = stateSnap.exists ? (stateSnap.data() || {}) : null;

  if (cur?.current_block_id === M1_MODULE_ID) {
    console.log(`  ✓ current_block_id already ${M1_MODULE_ID}`);
  } else {
    console.log(`  → current_block_id ${cur?.current_block_id ?? '(unset)'} → ${M1_MODULE_ID}`);
    stateUpdates.current_block_id = M1_MODULE_ID;
  }

  if (cur?.current_block_index === M1_ORDER) {
    console.log(`  ✓ current_block_index already ${M1_ORDER}`);
  } else {
    console.log(`  → current_block_index ${cur?.current_block_index ?? '(unset)'} → ${M1_ORDER}`);
    stateUpdates.current_block_index = M1_ORDER;
  }

  if (cur?.current_block_started_at && tsEqualMillis(cur.current_block_started_at, nowMs)) {
    console.log(`  ✓ current_block_started_at already set (~now)`);
  } else if (cur?.current_block_started_at) {
    console.log(`  ✓ current_block_started_at preserved (${cur.current_block_started_at.toDate?.().toISOString?.() ?? cur.current_block_started_at})`);
  } else {
    console.log(`  → current_block_started_at → ${now.toISOString()}`);
    stateUpdates.current_block_started_at = Timestamp.fromDate(now);
  }

  if (m2Snap.exists) {
    if (cur?.next_block_id === M2_MODULE_ID) {
      console.log(`  ✓ next_block_id already ${M2_MODULE_ID}`);
    } else {
      console.log(`  → next_block_id ${cur?.next_block_id ?? '(unset)'} → ${M2_MODULE_ID}`);
      stateUpdates.next_block_id = M2_MODULE_ID;
    }
    if (cur?.next_block_index === M2_ORDER) {
      console.log(`  ✓ next_block_index already ${M2_ORDER}`);
    } else {
      console.log(`  → next_block_index ${cur?.next_block_index ?? '(unset)'} → ${M2_ORDER}`);
      stateUpdates.next_block_index = M2_ORDER;
    }
  }

  if (Object.keys(stateUpdates).length > 0) {
    stateUpdates.updated_at = FieldValue.serverTimestamp();
  }

  // ── plan course-doc denorm writes ─────────────────────────────────────
  console.log(`\n--- courses/${COURSE_ID} (denorm) ---`);
  const course = courseSnap.data() || {};
  const courseUpdates = {};
  if (course.current_block_id === M1_MODULE_ID) {
    console.log(`  ✓ current_block_id already ${M1_MODULE_ID}`);
  } else {
    console.log(`  → current_block_id ${course.current_block_id ?? '(unset)'} → ${M1_MODULE_ID}`);
    courseUpdates.current_block_id = M1_MODULE_ID;
  }
  if (course.current_block_index === M1_ORDER) {
    console.log(`  ✓ current_block_index already ${M1_ORDER}`);
  } else {
    console.log(`  → current_block_index ${course.current_block_index ?? '(unset)'} → ${M1_ORDER}`);
    courseUpdates.current_block_index = M1_ORDER;
  }
  if (Object.keys(courseUpdates).length > 0) {
    courseUpdates.updated_at = FieldValue.serverTimestamp();
  }

  // ── apply ─────────────────────────────────────────────────────────────
  const totalWrites =
    (Object.keys(stateUpdates).length > 0 ? 1 : 0) +
    (Object.keys(courseUpdates).length > 0 ? 1 : 0);

  console.log(`\n${tag} planned writes: ${totalWrites}`);
  if (totalWrites === 0) {
    console.log(`${tag} nothing to do — state already correct.`);
    process.exit(0);
  }
  if (!WRITE) {
    console.log(`${tag} dry-run only. Re-run with --write to commit.`);
    process.exit(0);
  }

  if (Object.keys(stateUpdates).length > 0) {
    await stateRef.set(stateUpdates, { merge: true });
    console.log(`  ✓ program_state written`);
  }
  if (Object.keys(courseUpdates).length > 0) {
    await courseRef.update(courseUpdates);
    console.log(`  ✓ course doc denorm written`);
  }

  console.log(`\n${tag} done.`);
  process.exit(0);
})().catch((err) => {
  console.error('FATAL', err);
  process.exit(1);
});
