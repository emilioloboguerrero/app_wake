#!/usr/bin/env node
'use strict';

/**
 * F-API2-05 cleanup. Audit §11.1.3 confirmed exercises_library docs in
 * production carry user-supplied exercise names as TOP-LEVEL Firestore
 * fields (e.g. "Bench press", "press banca", "ok"). The legacy dual-write
 * at functions/src/api/routes/creator.ts:8232 is being removed, but old
 * docs still carry the artifact.
 *
 * For every exercises_library/* doc:
 *   1. Inspect top-level keys.
 *   2. Anything outside the canonical set is a "stray" key.
 *   3. If the stray value looks like an exercise entry (object with at
 *      least one of: id, name, image_url, sets, reps, demonstration) AND
 *      a `exercises[<key>]` slot is unset, move it under exercises.
 *   4. Delete the stray top-level field via FieldValue.delete().
 *
 * Usage:
 *   node scripts/security/exercises-library-cleanup.js                    # dry-run, staging
 *   node scripts/security/exercises-library-cleanup.js --apply
 *   node scripts/security/exercises-library-cleanup.js --project wolf-20b8b --confirm-prod --apply
 */

const {parseFlags, assertSafeTarget, maybePause, banner, initAdmin} = require('./_lib');

const SCRIPT = 'exercises-library-cleanup';
const CANONICAL_KEYS = new Set([
  'exercises',
  'creator_id',
  'creator_name',
  'title',
  'created_at',
  'updated_at',
  'image_url',
]);
const EXERCISE_SHAPE_HINTS = ['id', 'name', 'image_url', 'sets', 'reps', 'demonstration', 'video_url'];

function looksLikeExercise(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return EXERCISE_SHAPE_HINTS.some((k) => k in value);
}

async function main() {
  const flags = parseFlags(process.argv);
  assertSafeTarget(flags, SCRIPT);
  banner(SCRIPT, flags);
  await maybePause(flags);

  const admin = initAdmin(flags);
  const db = admin.firestore();
  const FieldValue = admin.firestore.FieldValue;

  const snap = await db.collection('exercises_library').get();
  console.log(`Inspecting ${snap.size} exercises_library docs.`);

  let dirty = 0;
  let cleaned = 0;
  let droppedKeys = 0;

  for (const doc of snap.docs) {
    const data = doc.data() || {};
    const exercises = data.exercises && typeof data.exercises === 'object' ? {...data.exercises} : {};
    const stray = Object.keys(data).filter((k) => !CANONICAL_KEYS.has(k));
    if (stray.length === 0) continue;
    dirty++;

    const update = {};
    let movedAny = false;

    for (const key of stray) {
      const value = data[key];
      if (looksLikeExercise(value) && !(key in exercises)) {
        exercises[key] = value;
        movedAny = true;
        console.log(`  [MOVE] ${doc.id}: top-level "${key}" -> exercises["${key}"]`);
      } else {
        console.log(`  [DROP] ${doc.id}: top-level "${key}" (non-exercise shape)`);
      }
      update[key] = FieldValue.delete();
      droppedKeys++;
    }

    if (movedAny) update.exercises = exercises;

    if (flags.apply) {
      await doc.ref.update(update);
      console.log(`  [WRITE] ${doc.id}: cleaned ${stray.length} stray key(s).`);
    } else {
      console.log(`  [DRY]   ${doc.id}: would clean ${stray.length} stray key(s).`);
    }
    cleaned++;
  }

  console.log(`\nSummary: ${dirty} dirty doc(s), ${cleaned} ${flags.apply ? 'cleaned' : 'would-clean'}, ${droppedKeys} stray field(s) ${flags.apply ? 'deleted' : 'pending delete'}.`);
}

main().catch((e) => {
  console.error('Fatal:', e);
  process.exit(1);
});
