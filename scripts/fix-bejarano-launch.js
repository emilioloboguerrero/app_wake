#!/usr/bin/env node
'use strict';

/**
 * Fix-script for Método Bejarano launch (audit findings 2026-05-15).
 *
 * Applies the following idempotent fixes to courses/NTQIWMZBOxntwmUiXQZp:
 *
 *   C1a. Renumber modules 1/2/3 → 0/1/2 so the cron's `-1` sentinel and the
 *        gating contract (order = block_index, 0-indexed) align with reality.
 *        See project_monthly_drops.md and audit Critical/C1.
 *   S2.  Add `discipline: 'fuerza-hipertrofia'` so the storefront card pill
 *        renders.
 *   S3.  Set `unlocks_at` on M2 (2026-06-01 BOG) and M3 (2026-07-06 BOG) so
 *        subscribers see "se desbloquea el lunes X" in the current-block UI.
 *        First Mondays are computed in BOG (00:00 BOG = 05:00 UTC).
 *   B1.  Add a brief `description` to the course doc so the storefront card
 *        is not blank. Cover image / video must still be supplied separately.
 *
 * Does NOT touch:
 *   - course.status (still "draft" — launch decision)
 *   - module.published_at (still null on all three — Felipe's call per month)
 *   - program_state/{courseId} (depends on launch timing — see runbook)
 *
 * Idempotent: every write is a no-op if the value already matches.
 *
 * Usage:
 *   NODE_PATH=functions/node_modules node scripts/fix-bejarano-launch.js          (dry-run)
 *   NODE_PATH=functions/node_modules node scripts/fix-bejarano-launch.js --write  (commit)
 */

const admin = require('firebase-admin');

const PROJECT_ID = 'wolf-20b8b';
const COURSE_ID = 'NTQIWMZBOxntwmUiXQZp';

// First Monday of a given (year, month) in BOG, expressed as a UTC Date at
// 05:00 (= 00:00 BOG). Months are 1-indexed.
function firstMondayBog(year, month) {
  for (let day = 1; day <= 7; day++) {
    const probe = new Date(Date.UTC(year, month - 1, day, 5, 0, 0));
    const fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Bogota', weekday: 'short',
    });
    if (fmt.format(probe).startsWith('Mon')) return probe;
  }
  throw new Error(`unreachable: no Monday in first 7 days of ${year}-${month}`);
}

const M2_UNLOCKS_AT = firstMondayBog(2026, 6); // 2026-06-01 00:00 BOG
const M3_UNLOCKS_AT = firstMondayBog(2026, 7); // 2026-07-06 00:00 BOG

const DESCRIPTION =
  'Doce meses de fuerza e hipertrofia diseñados por Felipe Bejarano. ' +
  'División de cinco días: empuje, jalón, pierna (cuádriceps), superior, ' +
  'pierna (posterior). Cada mes trae su prescripción y su microciclo semanal.';

const DISCIPLINE = 'fuerza-hipertrofia';

admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  projectId: PROJECT_ID,
});
const db = admin.firestore();
const { FieldValue, Timestamp } = admin.firestore;

const WRITE = process.argv.includes('--write');
const tag = WRITE ? '[WRITE]' : '[dry-run]';

function describeUnlocks(d) {
  return d.toISOString();
}

(async () => {
  console.log(`${tag} fix-bejarano-launch · course=${COURSE_ID}`);
  console.log(`${tag} M2 unlocks_at: ${describeUnlocks(M2_UNLOCKS_AT)}`);
  console.log(`${tag} M3 unlocks_at: ${describeUnlocks(M3_UNLOCKS_AT)}`);

  const courseRef = db.collection('courses').doc(COURSE_ID);
  const courseSnap = await courseRef.get();
  if (!courseSnap.exists) {
    console.error(`! course ${COURSE_ID} does not exist — aborting`);
    process.exit(2);
  }
  const course = courseSnap.data() || {};

  // ── C1a: renumber modules ─────────────────────────────────────────────
  const modulesSnap = await courseRef.collection('modules').orderBy('order', 'asc').get();
  console.log(`\n--- modules (${modulesSnap.size}) ---`);
  const moduleUpdates = [];
  for (let i = 0; i < modulesSnap.docs.length; i++) {
    const doc = modulesSnap.docs[i];
    const data = doc.data() || {};
    const targetOrder = i; // 0-indexed by current sort position
    if (data.order === targetOrder) {
      console.log(`  ✓ ${doc.id} "${data.title}" already order=${targetOrder}`);
    } else {
      console.log(`  → ${doc.id} "${data.title}" order ${data.order} → ${targetOrder}`);
      moduleUpdates.push({ ref: doc.ref, order: targetOrder, title: data.title });
    }
  }

  // ── S3: unlocks_at on M2/M3 (by current sort position; M1 stays unset) ──
  const unlocksTargets = new Map();
  if (modulesSnap.docs[1]) unlocksTargets.set(modulesSnap.docs[1].id, M2_UNLOCKS_AT);
  if (modulesSnap.docs[2]) unlocksTargets.set(modulesSnap.docs[2].id, M3_UNLOCKS_AT);

  console.log(`\n--- unlocks_at ---`);
  const unlocksUpdates = [];
  for (const doc of modulesSnap.docs) {
    const target = unlocksTargets.get(doc.id);
    if (!target) continue;
    const current = doc.data().unlocks_at;
    const currentMs = current && typeof current.toMillis === 'function' ? current.toMillis() : null;
    if (currentMs === target.getTime()) {
      console.log(`  ✓ ${doc.id} unlocks_at already ${describeUnlocks(target)}`);
    } else {
      console.log(`  → ${doc.id} unlocks_at → ${describeUnlocks(target)}`);
      unlocksUpdates.push({ ref: doc.ref, unlocks_at: Timestamp.fromDate(target) });
    }
  }

  // ── S2 + B1: course doc fields ────────────────────────────────────────
  console.log(`\n--- course doc ---`);
  const courseUpdates = {};
  if (course.discipline === DISCIPLINE) {
    console.log(`  ✓ discipline already "${DISCIPLINE}"`);
  } else {
    console.log(`  → discipline ${course.discipline ?? '(missing)'} → "${DISCIPLINE}"`);
    courseUpdates.discipline = DISCIPLINE;
  }
  if (course.description === DESCRIPTION) {
    console.log(`  ✓ description already set (${DESCRIPTION.length} chars)`);
  } else {
    console.log(`  → description ${course.description ? '(replacing)' : '(adding)'} → ${DESCRIPTION.length} chars`);
    courseUpdates.description = DESCRIPTION;
  }

  // ── Apply ─────────────────────────────────────────────────────────────
  const totalWrites = moduleUpdates.length + unlocksUpdates.length + Object.keys(courseUpdates).length;
  console.log(`\n${tag} planned writes: ${totalWrites}`);
  if (!WRITE) {
    console.log(`${tag} dry-run only. Re-run with --write to commit.`);
    process.exit(0);
  }

  // Renumbers via a transaction so concurrent module reads see a consistent
  // ordering — the modules collection is small (3 docs) so a single tx is fine.
  if (moduleUpdates.length > 0) {
    await db.runTransaction(async (tx) => {
      for (const u of moduleUpdates) {
        tx.update(u.ref, { order: u.order, updated_at: FieldValue.serverTimestamp() });
      }
    });
    console.log(`  ✓ renumbered ${moduleUpdates.length} module(s)`);
  }
  for (const u of unlocksUpdates) {
    await u.ref.update({ unlocks_at: u.unlocks_at, updated_at: FieldValue.serverTimestamp() });
    console.log(`  ✓ ${u.ref.id} unlocks_at set`);
  }
  if (Object.keys(courseUpdates).length > 0) {
    await courseRef.update({ ...courseUpdates, updated_at: FieldValue.serverTimestamp() });
    console.log(`  ✓ course doc updated (${Object.keys(courseUpdates).join(', ')})`);
  }

  console.log(`\n${tag} done.`);
  process.exit(0);
})().catch((err) => {
  console.error('FATAL', err);
  process.exit(1);
});
