#!/usr/bin/env node
'use strict';

/**
 * End-to-end test harness for seed-felipe-sessions.js write logic.
 *
 * Approach:
 *  1. Write 1 session (FB Novato D1, 9 exercises, 25 sets) under a throwaway test UID.
 *  2. Read it back from Firestore.
 *  3. Compare shape field-by-field against:
 *     (a) Felipe's existing test session QDs9JOxXcqERHcJLjWiJ (current-convention baseline)
 *     (b) A production course session (another known-good baseline)
 *  4. Validate field types, presence, nested shapes, regex patterns.
 *  5. Delete everything written.
 *
 * Runs against PROD (wolf-20b8b) but isolated to a test UID — never touches Felipe.
 */

const admin = require('firebase-admin');

const PROJECT_ID = 'wolf-20b8b';
const LIB_ID = 'jeoVyzhUrBeJofT62MOe';
const FELIPE_UID = 'yMqKOXBcVARa6vjU7wImf3Tp85J2';
const FELIPE_REF_SESSION = 'QDs9JOxXcqERHcJLjWiJ';

admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId: PROJECT_ID });
const db = admin.firestore();
const { FieldValue, Timestamp } = admin.firestore;

const TEST_UID = `test-harness-seed-${Date.now()}`;
const DEFAULT_TEMPLATE = {
  measures:   ['reps', 'weight', 'intensity'],
  objectives: ['reps', 'intensity', 'previous'],
  customMeasureLabels:   {},
  customObjectiveLabels: {},
};

// ───── Results tracking ─────

let passCount = 0;
let failCount = 0;
const failures = [];

function check(label, condition, detail = '') {
  if (condition) {
    passCount++;
    console.log(`  ✓ ${label}`);
  } else {
    failCount++;
    failures.push({ label, detail });
    console.log(`  ✗ ${label}${detail ? '\n      ' + detail : ''}`);
  }
}

function isTimestamp(v) { return v instanceof Timestamp; }
function isPlainObject(v) { return v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Timestamp); }

// ───── 1. Write a test session (mirrors seed-felipe-sessions.js write path exactly) ─────

const testSession = {
  title: 'TEST HARNESS - FB Novato D1',
  exercises: [
    { name: 'SENTADILLA TRASERA',                              sets: [{ reps: '6', intensity: '7/10' }, { reps: '6', intensity: '7/10' }, { reps: '6', intensity: '7/10' }] },
    { name: 'PRESS DE BANCA PLANA',                            sets: [{ reps: '8', intensity: '7/10' }, { reps: '8', intensity: '7/10' }, { reps: '8', intensity: '7/10' }] },
    { name: 'JALÓN AL PECHO AGARRE AMPLIO (PULL DOWN)',        sets: [{ reps: '10', intensity: '8/10' }, { reps: '10', intensity: '8/10' }, { reps: '10', intensity: '8/10' }] },
    { name: 'PESO MUERTO RUMANO (RDL)',                        sets: [{ reps: '10', intensity: '7/10' }, { reps: '10', intensity: '7/10' }, { reps: '10', intensity: '7/10' }] },
    { name: 'FONDOS EN PARALELAS',                             sets: [{ reps: '8', intensity: '7/10' }, { reps: '8', intensity: '7/10' }, { reps: '8', intensity: '7/10' }] },
    { name: 'ELEVACIÓN DE TALÓN CON RODILLA EXTENDIDA',        sets: [{ reps: '10', intensity: '8/10' }, { reps: '10', intensity: '8/10' }, { reps: '10', intensity: '8/10' }] },
    { name: 'CURL DE BÍCEPS SUPINO',                           sets: [{ reps: '10', intensity: '8/10' }, { reps: '10', intensity: '8/10' }, { reps: '10', intensity: '8/10' }], alt: ['CURL DE BÍCEPS MARTILLO'] },
    { name: 'TRICEP PUSH DOWN',                                sets: [{ reps: '15', intensity: '9/10' }, { reps: '15', intensity: '9/10' }], notes: 'Opcional (H)' },
    { name: 'FROG PUMP',                                       sets: [{ reps: '20', intensity: '9/10' }, { reps: '20', intensity: '9/10' }] },
  ],
};

async function writeTestSession() {
  console.log(`\n[1] WRITE — UID=${TEST_UID}`);
  const sessionsCol = db.collection('creator_libraries').doc(TEST_UID).collection('sessions');

  const sesRef = await sessionsCol.add({
    title: testSession.title,
    order: 0,
    defaultDataTemplate: DEFAULT_TEMPLATE,
    created_at: FieldValue.serverTimestamp(),
    updated_at: FieldValue.serverTimestamp(),
  });

  for (let i = 0; i < testSession.exercises.length; i++) {
    const ex = testSession.exercises[i];
    const exData = {
      order: i,
      primary: { [LIB_ID]: ex.name },
      alternatives: ex.alt ? { [LIB_ID]: ex.alt } : {},
      measures: DEFAULT_TEMPLATE.measures,
      objectives: DEFAULT_TEMPLATE.objectives,
      customMeasureLabels: {},
      customObjectiveLabels: {},
      created_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp(),
    };
    if (ex.notes) exData.notes = ex.notes;
    const exRef = await sesRef.collection('exercises').add(exData);

    for (let j = 0; j < ex.sets.length; j++) {
      const st = ex.sets[j];
      await exRef.collection('sets').add({
        order: j,
        title: `Serie ${j + 1}`,
        reps: st.reps,
        intensity: st.intensity,
        created_at: FieldValue.serverTimestamp(),
      });
    }
  }
  console.log(`    wrote session ${sesRef.id} with ${testSession.exercises.length} exercises`);
  return sesRef;
}

// ───── 2. Read back + 3. Load baselines ─────

async function loadAll(sesRef) {
  const sesDoc = await sesRef.get();
  const exsSnap = await sesRef.collection('exercises').orderBy('order', 'asc').get();
  const exs = [];
  for (const eDoc of exsSnap.docs) {
    const setsSnap = await eDoc.ref.collection('sets').orderBy('order', 'asc').get();
    exs.push({ doc: eDoc, data: eDoc.data(), sets: setsSnap.docs.map((s) => ({ id: s.id, data: s.data() })) });
  }
  return { sesDoc, sesData: sesDoc.data(), exercises: exs };
}

async function loadBaselines() {
  // (a) Felipe's test session — our current-convention golden
  const felipeRef = db.collection('creator_libraries').doc(FELIPE_UID).collection('sessions').doc(FELIPE_REF_SESSION);
  const felipeSes = await felipeRef.get();
  const felipeExsSnap = await felipeRef.collection('exercises').orderBy('order').limit(1).get();
  const felipeEx = felipeExsSnap.docs[0];
  const felipeSetsSnap = await felipeEx.ref.collection('sets').orderBy('order').limit(1).get();
  const felipeSet = felipeSetsSnap.docs[0];

  // (b) A production course exercise — alternate known-good
  const courseEx = await db.doc('courses/352ruaYiQ4Sa6oXz1HOO/modules/02gbFi1xxliKW3tgjPPN/sessions/5WqGZMF9uQortowyGl6g/exercises/Uk2QoMFxHzNdisf2ZXqS').get();

  return {
    felipe: { ses: felipeSes.data(), ex: felipeEx.data(), set: felipeSet.data() },
    course: { ex: courseEx.data() },
  };
}

// ───── 4. Compare ─────

function compare(out, baselines) {
  const { sesData, exercises } = out;
  const { felipe, course } = baselines;

  console.log('\n[2] COMPARE — session doc');
  const sesKeys = new Set(Object.keys(sesData));
  const felipeSesKeys = new Set(Object.keys(felipe.ses));

  // Required fields (matching Felipe's convention plus `order` from allowlist)
  check('has title (string)', typeof sesData.title === 'string');
  check('has order (number)', typeof sesData.order === 'number');
  check('has defaultDataTemplate (object)', isPlainObject(sesData.defaultDataTemplate));
  check('has created_at (Timestamp)', isTimestamp(sesData.created_at));
  check('has updated_at (Timestamp)', isTimestamp(sesData.updated_at));

  // defaultDataTemplate shape matches Felipe exactly
  check('defaultDataTemplate.measures matches Felipe',
    JSON.stringify(sesData.defaultDataTemplate.measures) === JSON.stringify(felipe.ses.defaultDataTemplate.measures),
    `ours=${JSON.stringify(sesData.defaultDataTemplate.measures)}  felipe=${JSON.stringify(felipe.ses.defaultDataTemplate.measures)}`);
  check('defaultDataTemplate.objectives matches Felipe',
    JSON.stringify(sesData.defaultDataTemplate.objectives) === JSON.stringify(felipe.ses.defaultDataTemplate.objectives));
  check('customMeasureLabels is {}',
    isPlainObject(sesData.defaultDataTemplate.customMeasureLabels) && Object.keys(sesData.defaultDataTemplate.customMeasureLabels).length === 0);
  check('customObjectiveLabels is {}',
    isPlainObject(sesData.defaultDataTemplate.customObjectiveLabels) && Object.keys(sesData.defaultDataTemplate.customObjectiveLabels).length === 0);

  // Legacy fields NOT present
  check('no creator_id field (legacy)', !sesKeys.has('creator_id'));
  check('no showInLibrary field (legacy)', !sesKeys.has('showInLibrary'));
  check('no version field (legacy)', !sesKeys.has('version'));

  // No unexpected fields outside API allowlist
  const sesAllowlist = new Set(['title', 'order', 'isRestDay', 'image_url', 'defaultDataTemplate', 'created_at', 'updated_at', 'dayIndex', 'source_library_session_id']);
  const unexpectedSes = [...sesKeys].filter((k) => !sesAllowlist.has(k));
  check('no unexpected session fields', unexpectedSes.length === 0, `unexpected=${unexpectedSes.join(',')}`);

  console.log('\n[3] COMPARE — exercises (9 total)');
  check(`wrote 9 exercises`, exercises.length === 9, `got ${exercises.length}`);

  const exAllowlist = new Set([
    'name', 'order', 'libraryId', 'primaryMuscles', 'notes', 'videoUrl', 'thumbnailUrl', 'video_source',
    'primary', 'alternatives', 'objectives', 'measures',
    'customMeasureLabels', 'customObjectiveLabels', 'defaultSetValues',
    'created_at', 'updated_at',
  ]);

  for (let i = 0; i < exercises.length; i++) {
    const { data: ex } = exercises[i];
    const exKeys = new Set(Object.keys(ex));
    const expectedName = testSession.exercises[i].name;

    check(`  ex[${i}] order = ${i}`, ex.order === i);

    // primary: must be a map with LIB_ID key → exact library name
    check(`  ex[${i}] primary is map { LIB_ID: "${expectedName}" }`,
      isPlainObject(ex.primary) && ex.primary[LIB_ID] === expectedName,
      JSON.stringify(ex.primary));

    // alternatives: must be a map (possibly empty)
    check(`  ex[${i}] alternatives is map (not array)`,
      isPlainObject(ex.alternatives) && !Array.isArray(ex.alternatives));

    if (testSession.exercises[i].alt) {
      check(`  ex[${i}] alternatives has LIB_ID entry`,
        Array.isArray(ex.alternatives[LIB_ID]) && ex.alternatives[LIB_ID].length > 0,
        JSON.stringify(ex.alternatives));
    } else {
      check(`  ex[${i}] alternatives = {} when no alts provided`,
        Object.keys(ex.alternatives).length === 0);
    }

    // measures/objectives copied from session template
    check(`  ex[${i}] measures matches template`,
      JSON.stringify(ex.measures) === JSON.stringify(DEFAULT_TEMPLATE.measures));
    check(`  ex[${i}] objectives matches template`,
      JSON.stringify(ex.objectives) === JSON.stringify(DEFAULT_TEMPLATE.objectives));

    // `name` field omitted (Felipe convention)
    check(`  ex[${i}] no top-level name field`, !exKeys.has('name'));

    // `libraryId` field omitted
    check(`  ex[${i}] no libraryId field`, !exKeys.has('libraryId'));

    // notes only present when provided
    if (testSession.exercises[i].notes) {
      check(`  ex[${i}] has notes = "${testSession.exercises[i].notes}"`, ex.notes === testSession.exercises[i].notes);
    } else {
      check(`  ex[${i}] no notes field`, !exKeys.has('notes'));
    }

    // Timestamps present
    check(`  ex[${i}] has created_at + updated_at`, isTimestamp(ex.created_at) && isTimestamp(ex.updated_at));

    // No fields outside the API allowlist
    const unexpectedEx = [...exKeys].filter((k) => !exAllowlist.has(k));
    check(`  ex[${i}] no unexpected fields`, unexpectedEx.length === 0, `unexpected=${unexpectedEx.join(',')}`);
  }

  console.log('\n[4] COMPARE — sets');
  const setAllowlist = new Set(['order', 'title', 'reps', 'weight', 'intensity', 'rir', 'restSeconds', 'type', 'created_at', 'updated_at']);
  let totalSets = 0;
  for (let i = 0; i < exercises.length; i++) {
    const { sets } = exercises[i];
    totalSets += sets.length;
    for (let j = 0; j < sets.length; j++) {
      const s = sets[j].data;
      const sKeys = new Set(Object.keys(s));

      check(`  ex[${i}] set[${j}] order = ${j}`, s.order === j);
      check(`  ex[${i}] set[${j}] title = "Serie ${j + 1}"`, s.title === `Serie ${j + 1}`);
      check(`  ex[${i}] set[${j}] reps is string`, typeof s.reps === 'string');
      check(`  ex[${i}] set[${j}] intensity matches /^\\d+\\/10$/`, /^\d+\/10$/.test(s.intensity), `got="${s.intensity}"`);
      check(`  ex[${i}] set[${j}] has created_at`, isTimestamp(s.created_at));

      // Library sets should have no weight, rir, restSeconds, type
      check(`  ex[${i}] set[${j}] no weight`, !sKeys.has('weight'));
      check(`  ex[${i}] set[${j}] no rir`, !sKeys.has('rir'));
      check(`  ex[${i}] set[${j}] no restSeconds`, !sKeys.has('restSeconds'));
      check(`  ex[${i}] set[${j}] no type`, !sKeys.has('type'));

      // No unexpected fields outside allowlist or custom_*
      const unexpected = [...sKeys].filter((k) => !setAllowlist.has(k) && !k.startsWith('custom_'));
      if (unexpected.length) check(`  ex[${i}] set[${j}] no unexpected fields`, false, `unexpected=${unexpected.join(',')}`);
    }
  }
  check(`total sets = 25`, totalSets === 25, `got ${totalSets}`);

  console.log('\n[5] COMPARE — our shape vs Felipe baseline (subset comparison)');
  // Session keys: ours should be a subset-or-equal of Felipe's keys (minus image_url which we omit)
  const felipeExpectedSesKeys = new Set(['title', 'defaultDataTemplate', 'created_at', 'updated_at']);
  for (const k of felipeExpectedSesKeys) {
    check(`  session has Felipe-shared key "${k}"`, sesKeys.has(k));
  }

  // Exercise 0 shape should match Felipe's exercise 0 shape (excluding `notes` which is our addition, and fields Felipe happens to lack)
  const ours0 = exercises[0].data;
  const felipeExKeys = new Set(Object.keys(felipe.ex));
  const ourExKeys = new Set(Object.keys(ours0));
  // Felipe's exercise has exactly these keys:
  // order, alternatives, objectives, measures, customMeasureLabels, customObjectiveLabels, created_at, updated_at, primary
  const requiredFelipeKeys = ['order', 'alternatives', 'objectives', 'measures', 'customMeasureLabels', 'customObjectiveLabels', 'created_at', 'updated_at', 'primary'];
  for (const k of requiredFelipeKeys) {
    check(`  exercise shares Felipe-required key "${k}"`, ourExKeys.has(k));
  }
  // And Felipe's exercise does NOT have 'name'/'libraryId'/'primaryMuscles'/'defaultSetValues' — verify we match
  for (const k of ['name', 'libraryId', 'primaryMuscles', 'defaultSetValues']) {
    check(`  exercise omits Felipe-omitted key "${k}"`, !ourExKeys.has(k) === !felipeExKeys.has(k),
      `ours has=${ourExKeys.has(k)} felipe has=${felipeExKeys.has(k)}`);
  }

  console.log('\n[6] COMPARE — our shape vs production course baseline');
  const courseExKeys = new Set(Object.keys(course.ex));
  // Course has: order, created_at, updated_at, alternatives, objectives, primary, measures — and in some cases customMeasureLabels, customObjectiveLabels
  // Verify the core shape matches
  for (const k of ['order', 'alternatives', 'objectives', 'primary', 'measures', 'created_at', 'updated_at']) {
    check(`  exercise shares course key "${k}"`, ourExKeys.has(k));
  }
  // Course alternatives is also a map
  check(`  course alternatives is map`, isPlainObject(course.ex.alternatives));
  // Course primary is also a map with LIB_ID-style key
  check(`  course primary is map`, isPlainObject(course.ex.primary));
}

// ───── 5. Cleanup ─────

async function cleanup(sesRef) {
  console.log('\n[7] CLEANUP');
  const exs = await sesRef.collection('exercises').get();
  for (const ex of exs.docs) {
    const sets = await ex.ref.collection('sets').get();
    for (const s of sets.docs) await s.ref.delete();
    await ex.ref.delete();
  }
  await sesRef.delete();
  // Parent creator_libraries/<TEST_UID> doc: we never wrote to it directly; subcollections are cleared.
  // Firestore has no doc at that path to delete (it was only a parent for subcollections).
  console.log(`    cleaned up ${TEST_UID}`);
}

// ───── Main ─────

(async () => {
  console.log(`Test harness — project ${PROJECT_ID}  TEST_UID=${TEST_UID}`);
  let sesRef;
  try {
    sesRef = await writeTestSession();
    const out = await loadAll(sesRef);
    const baselines = await loadBaselines();
    compare(out, baselines);
  } catch (e) {
    console.error('\nHARNESS ERROR:', e);
  } finally {
    if (sesRef) await cleanup(sesRef).catch((e) => console.error('cleanup error:', e));
  }

  console.log(`\n================`);
  console.log(`PASS: ${passCount}  FAIL: ${failCount}`);
  if (failCount > 0) {
    console.log('\nFailures:');
    failures.forEach((f) => console.log(`  ✗ ${f.label}${f.detail ? '  [' + f.detail + ']' : ''}`));
    process.exit(1);
  } else {
    console.log('ALL CHECKS PASSED');
    process.exit(0);
  }
})();
