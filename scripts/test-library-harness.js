#!/usr/bin/env node
'use strict';

/**
 * Harness for add-missing library-write path.
 *
 *  1. Create a throwaway exercises_library doc.
 *  2. Write one of the 12 NEW_EXERCISES into it (same write call as seed script).
 *  3. Read back, compare shape against Felipe's existing entries.
 *  4. Delete the throwaway doc.
 */

const admin = require('firebase-admin');

const PROJECT_ID = 'wolf-20b8b';
const FELIPE_LIB_ID = 'jeoVyzhUrBeJofT62MOe';

admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId: PROJECT_ID });
const db = admin.firestore();
const { FieldValue, Timestamp } = admin.firestore;

let passCount = 0;
let failCount = 0;
const failures = [];

function check(label, cond, detail = '') {
  if (cond) { passCount++; console.log(`  ✓ ${label}`); }
  else { failCount++; failures.push({ label, detail }); console.log(`  ✗ ${label}${detail ? '\n      ' + detail : ''}`); }
}

const isTimestamp = (v) => v instanceof Timestamp;
const isPlainObject = (v) => v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Timestamp);

const TEST_NAME = 'TEST_HARNESS_SENTADILLA_BOX';
const TEST_ENTRY = {
  implements: ['Barra', 'Banco'],
  muscle_activation: { quads: 85, glutes: 70, hamstrings: 35, calves: 15 },
};

const VALID_IMPLEMENTS = new Set(['Agarre Amplio', 'Agarre Cerrado', 'Agarre en "V"', 'Banco', 'Banco Inclinado', 'Bandas de Resistencia', 'Barra', 'Barra T', 'Cable', 'Mancuernas', 'Máquina', 'Máquina Smith', 'Otro', 'Paralelas', 'Peso Corporal', 'Silla de Predicador']);
const VALID_MUSCLES = new Set(['abs', 'biceps', 'calves', 'forearms', 'front_delts', 'glutes', 'hamstrings', 'hip_flexors', 'lats', 'lower_back', 'obliques', 'pecs', 'quads', 'rear_delts', 'rhomboids', 'side_delts', 'traps', 'triceps']);

(async () => {
  const docRef = db.collection('exercises_library').doc(); // auto-id
  const TEST_DOC_ID = docRef.id;
  console.log(`Test harness — library write — TEST_DOC_ID=${TEST_DOC_ID}`);

  try {
    console.log('\n[1] Create throwaway library doc');
    await docRef.set({
      title: '__test_harness_library',
      creator_id: '__test_harness__',
      created_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp(),
    });

    console.log('\n[2] Write new exercise via update() (same path as seed script)');
    await docRef.update({
      [TEST_NAME]: {
        implements: TEST_ENTRY.implements,
        muscle_activation: TEST_ENTRY.muscle_activation,
        created_at: FieldValue.serverTimestamp(),
        updated_at: FieldValue.serverTimestamp(),
      },
    });

    console.log('\n[3] Read back');
    const snap = await docRef.get();
    const got = snap.data()[TEST_NAME];

    console.log('\n[4] Compare shape to Felipe reference entries');
    const felipeLib = (await db.collection('exercises_library').doc(FELIPE_LIB_ID).get()).data();
    const felipeRef = felipeLib['SENTADILLA TRASERA']; // known-good reference

    check('entry is object', isPlainObject(got));
    check('has implements (array)', Array.isArray(got.implements));
    check('has muscle_activation (object)', isPlainObject(got.muscle_activation));
    check('has created_at (Timestamp)', isTimestamp(got.created_at));
    check('has updated_at (Timestamp)', isTimestamp(got.updated_at));

    // No video fields (we intentionally omit to match older library entries)
    check('no video_url field', !('video_url' in got));
    check('no video_source field', !('video_source' in got));
    check('no video_path field', !('video_path' in got));

    // Implements values all in enum
    for (const imp of got.implements) {
      check(`implement "${imp}" is in enum`, VALID_IMPLEMENTS.has(imp));
    }

    // Muscle keys all in enum, values 0-100 integers
    for (const [k, v] of Object.entries(got.muscle_activation)) {
      check(`muscle "${k}" is in enum`, VALID_MUSCLES.has(k));
      check(`muscle "${k}" value ${v} is 0-100 int`, Number.isInteger(v) && v >= 0 && v <= 100);
    }

    // Felipe ref shape comparison: our keys should equal Felipe's
    const ourKeys = Object.keys(got).sort();
    const felipeKeys = Object.keys(felipeRef).sort();
    check(`shape matches Felipe "SENTADILLA TRASERA"`,
      JSON.stringify(ourKeys) === JSON.stringify(felipeKeys),
      `ours=[${ourKeys.join(',')}]  felipe=[${felipeKeys.join(',')}]`);

    // Values round-trip correctly
    check('implements round-trip', JSON.stringify(got.implements) === JSON.stringify(TEST_ENTRY.implements));
    check('muscle_activation round-trip',
      JSON.stringify(got.muscle_activation) === JSON.stringify(TEST_ENTRY.muscle_activation));
  } catch (e) {
    console.error('\nHARNESS ERROR:', e);
  } finally {
    console.log('\n[5] Cleanup');
    await docRef.delete().catch((e) => console.error('cleanup:', e));
    console.log(`    deleted ${TEST_DOC_ID}`);
  }

  console.log(`\n================`);
  console.log(`PASS: ${passCount}  FAIL: ${failCount}`);
  if (failCount > 0) {
    failures.forEach((f) => console.log(`  ✗ ${f.label}${f.detail ? '  [' + f.detail + ']' : ''}`));
    process.exit(1);
  }
  console.log('ALL CHECKS PASSED');
  process.exit(0);
})();
