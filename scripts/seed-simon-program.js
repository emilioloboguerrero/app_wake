#!/usr/bin/env node
'use strict';

/**
 * Simon Angel — "Gym" library + Split Upper/Lower 6 días (3 meses) plan seed.
 *
 * Targets prod (wolf-20b8b) and writes:
 *   1. exercises_library/<NEW_LIB_ID>           ← new library titled "Gym"
 *   2. creator_libraries/<SIMON_UID>/sessions/* ← 5 library sessions
 *   3. plans/<NEW_PLAN_ID>                      ← plan with 12 modules × 5 sessions
 *
 * Schema reference: scripts/seed-felipe-sessions.js, functions/src/api/routes/creator.ts.
 *
 * Usage:
 *   node scripts/seed-simon-program.js --validate
 *   node scripts/seed-simon-program.js --all                  (dry-run)
 *   node scripts/seed-simon-program.js --all --write
 *
 * Requires: NODE_PATH=functions/node_modules and gcloud ADC.
 */

const admin = require('firebase-admin');

const SIMON_UID = 'qW3sKo8B1lfGpUG6d4YD4JrqUT53';
const SIMON_NAME = 'Simon Angel';
const PROJECT_ID = 'wolf-20b8b';
const LIBRARY_TITLE = 'Gym';
const PLAN_TITLE = 'Split Upper/Lower 6 días — 3 meses';
const PLAN_DESCRIPTION =
  'Upper / Lower / Upper / Rest / Lower / Upper / Rest. Repite 12 semanas. Reemplazos: mismo joint action.';
const PLAN_DISCIPLINE = 'Fuerza / Hipertrofia';
const TOTAL_WEEKS = 12;
// Mon=0, Tue=1, Wed=2, Thu=3 (rest, no session), Fri=4, Sat=5, Sun=6 (rest, no session)
const DAY_INDEXES = [0, 1, 2, 4, 5];

admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  projectId: PROJECT_ID,
});
const db = admin.firestore();
const { FieldValue } = admin.firestore;

// ─────────────────────────────────────────────────────────────────────
// Default data template — includes `notes` (first-class objective per phase 1).

const DEFAULT_TEMPLATE = {
  measures: ['reps', 'weight', 'intensity'],
  objectives: ['reps', 'intensity', 'previous', 'notes'],
  customMeasureLabels: {},
  customObjectiveLabels: {},
};

// ─────────────────────────────────────────────────────────────────────
// 30 exercises — Spanish title-case names, muscle_activation 0-100 (primary=100).
// Implements drawn from the live 15-value enum in apps/creator-dashboard/src/constants/exerciseConstants.js.

const NEW_EXERCISES = {
  // ── Pulldowns / vertical pull ──
  'Frontal Plane Pulldown': {
    implements: ['Cable'],
    muscle_activation: { lats: 100, biceps: 40, rear_delts: 30, rhomboids: 25 },
  },
  'Unilateral Sagital Plane Pulldown': {
    implements: ['Cable'],
    muscle_activation: { lats: 100, biceps: 45, rear_delts: 25 },
  },

  // ── Horizontal push ──
  'Press Plano Máquina': {
    implements: ['Máquina'],
    muscle_activation: { pecs: 100, front_delts: 35, triceps: 40 },
  },
  'Press Plano': {
    implements: ['Barra', 'Banco'],
    muscle_activation: { pecs: 100, front_delts: 35, triceps: 40 },
  },
  'Press Inclinado Codos Pegados': {
    implements: ['Banco Inclinado', 'Mancuernas'],
    muscle_activation: { pecs: 100, front_delts: 45, triceps: 50 },
  },
  'Pec Deck': {
    implements: ['Máquina'],
    muscle_activation: { pecs: 100, front_delts: 25 },
  },
  'Upper Pec Fly': {
    implements: ['Cable'],
    muscle_activation: { pecs: 100, front_delts: 40 },
  },

  // ── Vertical push ──
  'Press Militar Máquina': {
    implements: ['Máquina'],
    muscle_activation: { front_delts: 100, side_delts: 40, triceps: 35, traps: 25 },
  },

  // ── Horizontal pull / row ──
  'Remo Codos Pegados': {
    implements: ['Cable', 'Máquina'],
    muscle_activation: { lats: 100, biceps: 45, rhomboids: 35, rear_delts: 20 },
  },
  'Remo Codos Abiertos': {
    implements: ['Cable', 'Máquina'],
    muscle_activation: { rear_delts: 100, rhomboids: 70, traps: 50, lats: 40, biceps: 30 },
  },

  // ── Shoulders — laterals / rear ──
  'Elevaciones Laterales en Polea': {
    implements: ['Cable'],
    muscle_activation: { side_delts: 100, front_delts: 25, traps: 18 },
  },
  'Vuelos Laterales con Mancuerna': {
    implements: ['Mancuernas'],
    muscle_activation: { side_delts: 100, front_delts: 25, traps: 18 },
  },
  'Rear Delt Fly': {
    implements: ['Máquina', 'Mancuernas'],
    muscle_activation: { rear_delts: 100, rhomboids: 40, traps: 25 },
  },

  // ── Traps / shrugs ──
  'Kelso Shrug': {
    implements: ['Banco Inclinado', 'Mancuernas'],
    muscle_activation: { traps: 100, rhomboids: 70, rear_delts: 40 },
  },

  // ── Biceps ──
  'Curl de Bíceps Supinado': {
    implements: ['Mancuernas', 'Barra'],
    muscle_activation: { biceps: 100, forearms: 35 },
  },
  'Curl Supinado Apoyado Unilateral': {
    implements: ['Banco', 'Mancuernas'],
    muscle_activation: { biceps: 100, forearms: 30 },
  },
  'Curl Martillo': {
    implements: ['Mancuernas'],
    muscle_activation: { biceps: 100, forearms: 50, brachialis: 80 },
  },
  'Curl Pronado': {
    implements: ['Barra', 'Cable'],
    muscle_activation: { forearms: 100, biceps: 60, brachialis: 50 },
  },

  // ── Triceps ──
  'JM Press': {
    implements: ['Barra', 'Banco'],
    muscle_activation: { triceps: 100, pecs: 40, front_delts: 30 },
  },
  'Extensiones de Tríceps': {
    implements: ['Cable'],
    muscle_activation: { triceps: 100, forearms: 20 },
  },

  // ── Posterior chain ──
  'Peso Muerto Rumano (RDL)': {
    implements: ['Barra', 'Mancuernas'],
    muscle_activation: { hamstrings: 100, glutes: 70, lower_back: 45, traps: 20 },
  },
  'Hyper Extensions': {
    implements: ['Máquina'],
    muscle_activation: { lower_back: 100, glutes: 70, hamstrings: 60 },
  },

  // ── Quads / glute compounds ──
  'Prensa': {
    implements: ['Máquina'],
    muscle_activation: { quads: 100, glutes: 60, hamstrings: 35, calves: 20 },
  },
  'Prensa Wide': {
    implements: ['Máquina'],
    muscle_activation: { glutes: 100, quads: 70, hamstrings: 40, adductors: 50 },
  },
  'Extensiones de Cuádriceps': {
    implements: ['Máquina'],
    muscle_activation: { quads: 100 },
  },
  'Curl de Pierna': {
    implements: ['Máquina'],
    muscle_activation: { hamstrings: 100, glutes: 25, calves: 15 },
  },

  // ── Hip abductors / adductors ──
  'Aductor': {
    implements: ['Máquina'],
    muscle_activation: { adductors: 100, glutes: 30 },
  },
  'Abductor': {
    implements: ['Máquina'],
    muscle_activation: { glutes: 100, abductors: 60 },
  },

  // ── Calves ──
  'Pantorrilla': {
    implements: ['Máquina'],
    muscle_activation: { calves: 100 },
  },

  // ── Core ──
  'Crunch Abdominal': {
    implements: ['Peso Corporal'],
    muscle_activation: { abs: 100, obliques: 25 },
  },
};

// ─────────────────────────────────────────────────────────────────────
// ALTERNATIVES — same joint action, per "Remplazos hacer el mismo joint action".
// Each value is an array of names that all exist in NEW_EXERCISES.

const ALTERNATIVES = {
  'Frontal Plane Pulldown': ['Unilateral Sagital Plane Pulldown', 'Remo Codos Pegados'],
  'Unilateral Sagital Plane Pulldown': ['Frontal Plane Pulldown', 'Remo Codos Pegados'],

  'Press Plano Máquina': ['Press Plano', 'Press Inclinado Codos Pegados'],
  'Press Plano': ['Press Plano Máquina', 'Press Inclinado Codos Pegados'],
  'Press Inclinado Codos Pegados': ['Press Plano', 'Press Plano Máquina'],
  'Pec Deck': ['Upper Pec Fly'],
  'Upper Pec Fly': ['Pec Deck'],

  'Press Militar Máquina': ['Vuelos Laterales con Mancuerna', 'Elevaciones Laterales en Polea'],

  'Remo Codos Pegados': ['Frontal Plane Pulldown', 'Remo Codos Abiertos'],
  'Remo Codos Abiertos': ['Rear Delt Fly', 'Remo Codos Pegados'],

  'Elevaciones Laterales en Polea': ['Vuelos Laterales con Mancuerna'],
  'Vuelos Laterales con Mancuerna': ['Elevaciones Laterales en Polea'],
  'Rear Delt Fly': ['Remo Codos Abiertos'],

  'Kelso Shrug': ['Remo Codos Abiertos'],

  'Curl de Bíceps Supinado': ['Curl Supinado Apoyado Unilateral', 'Curl Martillo'],
  'Curl Supinado Apoyado Unilateral': ['Curl de Bíceps Supinado', 'Curl Martillo'],
  'Curl Martillo': ['Curl Pronado', 'Curl de Bíceps Supinado'],
  'Curl Pronado': ['Curl Martillo', 'Curl de Bíceps Supinado'],

  'JM Press': ['Extensiones de Tríceps'],
  'Extensiones de Tríceps': ['JM Press'],

  'Peso Muerto Rumano (RDL)': ['Hyper Extensions'],
  'Hyper Extensions': ['Peso Muerto Rumano (RDL)'],

  'Prensa': ['Prensa Wide', 'Extensiones de Cuádriceps'],
  'Prensa Wide': ['Prensa', 'Abductor'],
  'Extensiones de Cuádriceps': ['Prensa'],
  'Curl de Pierna': ['Peso Muerto Rumano (RDL)', 'Hyper Extensions'],

  'Aductor': ['Prensa Wide'],
  'Abductor': ['Prensa Wide'],

  'Pantorrilla': [],
  'Crunch Abdominal': [],
};

// ─────────────────────────────────────────────────────────────────────
// Set helpers.

// "F" — to failure.
function setF() {
  return { reps: 'AMRAP', intensity: '10/10' };
}

// "Nx<reps> RPE <rpe>"
function setRPE(reps, rpe) {
  return { reps: String(reps), intensity: `${rpe}/10` };
}

// nSets identical sets.
function reps(n, mk) {
  return Array.from({ length: n }, () => ({ ...mk() }));
}

// ─────────────────────────────────────────────────────────────────────
// 5 SESSIONS

const SESSIONS = [
  // ── Lunes — Upper A (pecho + dorsal) ──
  {
    title: 'Upper A — Pecho y Dorsal',
    dayIndex: 0,
    exercises: [
      { name: 'Frontal Plane Pulldown',         sets: reps(3, setF) },
      { name: 'Press Plano Máquina',            sets: reps(2, setF) },
      { name: 'Remo Codos Pegados',             sets: reps(2, setF) },
      { name: 'Press Inclinado Codos Pegados',  sets: reps(2, setF) },
      { name: 'Elevaciones Laterales en Polea', sets: reps(2, setF) },
      { name: 'Curl de Bíceps Supinado',        sets: reps(2, setF) },
      { name: 'Extensiones de Tríceps',         sets: reps(2, setF) },
      { name: 'Crunch Abdominal',               sets: reps(2, setF) },
    ],
  },

  // ── Martes — Lower A ──
  {
    title: 'Lower A',
    dayIndex: 1,
    exercises: [
      { name: 'Peso Muerto Rumano (RDL)',  sets: reps(2, () => setRPE('6-8',  9)) },
      { name: 'Prensa',                    sets: reps(2, () => setRPE('8-12', 9)) },
      { name: 'Curl de Pierna',            sets: reps(2, () => setRPE('6-10', 9)) },
      { name: 'Extensiones de Cuádriceps', sets: reps(3, () => setRPE('6-10', 10)) },
      { name: 'Aductor',                   sets: reps(2, () => setRPE('6-10', 10)) },
      { name: 'Abductor',                  sets: reps(2, () => setRPE('8-12', 10)) },
      { name: 'Pantorrilla',               sets: reps(2, setF) },
    ],
  },

  // ── Miércoles — Upper B (arm-focused + accesorios) ──
  {
    title: 'Upper B — Brazos y Accesorios',
    dayIndex: 2,
    exercises: [
      {
        name: 'JM Press',
        sets: reps(3, setF),
        notes: 'Variante skullcrusher / press francés híbrido',
      },
      { name: 'Curl Supinado Apoyado Unilateral', sets: reps(2, setF) },
      { name: 'Vuelos Laterales con Mancuerna',   sets: reps(2, setF) },
      {
        name: 'Remo Codos Pegados',
        sets: reps(2, setF),
        notes: 'Seguir con 1xF de Kelso shrug',
      },
      {
        name: 'Kelso Shrug',
        sets: reps(1, setF),
        notes: 'Finisher tras el remo',
      },
      { name: 'Curl Martillo',     sets: reps(1, setF) },
      { name: 'Curl Pronado',      sets: reps(2, setF) },
      {
        name: 'Pec Deck',
        sets: reps(2, setF),
        notes: 'Alternativa: Upper Pec Fly',
      },
      { name: 'Rear Delt Fly',     sets: reps(2, setF) },
      { name: 'Crunch Abdominal',  sets: reps(2, setF) },
    ],
  },

  // ── Viernes — Lower 2 ──
  {
    title: 'Lower 2',
    dayIndex: 4,
    exercises: [
      { name: 'Extensiones de Cuádriceps', sets: reps(3, () => setRPE('6-10', 10)) },
      {
        name: 'Prensa Wide',
        sets: reps(2, () => setRPE('6-10', 10)),
        notes: 'Stance ancho — énfasis en glúteos / aductores',
      },
      { name: 'Curl de Pierna',  sets: reps(2, () => setRPE('6-10', 10)) },
      { name: 'Aductor',         sets: reps(2, () => setRPE('6-10', 10)) },
      { name: 'Hyper Extensions', sets: reps(3, () => setRPE('6-10', 10)) },
      { name: 'Pantorrilla',     sets: reps(2, setF) },
    ],
  },

  // ── Sábado — Upper C (hombros + espalda alta) ──
  {
    title: 'Upper C — Hombros y Espalda Alta',
    dayIndex: 5,
    exercises: [
      { name: 'Press Militar Máquina', sets: reps(2, setF) },
      {
        name: 'Remo Codos Abiertos',
        sets: reps(2, setF),
        notes: 'Codos hacia afuera — énfasis en deltoides posteriores y trapecios medios',
      },
      {
        name: 'Kelso Shrug',
        sets: [{ ...setF(), notes: '+ parciales hasta fallo' }],
      },
      { name: 'Press Plano',                       sets: reps(2, setF) },
      { name: 'Unilateral Sagital Plane Pulldown', sets: reps(2, setF) },
      { name: 'Elevaciones Laterales en Polea',    sets: reps(2, setF) },
      { name: 'Extensiones de Tríceps',            sets: reps(2, setF) },
      { name: 'Curl Pronado',                      sets: reps(2, () => setRPE('6-10', 9)) },
      { name: 'Crunch Abdominal',                  sets: reps(2, setF) },
    ],
  },
];

// ─────────────────────────────────────────────────────────────────────
// VALIDATION

function validate() {
  const exNames = new Set(Object.keys(NEW_EXERCISES));
  const errors = [];

  for (const s of SESSIONS) {
    for (const ex of s.exercises) {
      if (!exNames.has(ex.name)) errors.push(`session "${s.title}" → exercise not in NEW_EXERCISES: "${ex.name}"`);
      if (!Array.isArray(ex.sets) || ex.sets.length === 0) errors.push(`session "${s.title}" → exercise "${ex.name}" has no sets`);
    }
  }
  for (const [src, alts] of Object.entries(ALTERNATIVES)) {
    if (!exNames.has(src)) errors.push(`ALT key "${src}" not in NEW_EXERCISES`);
    for (const a of alts) if (!exNames.has(a)) errors.push(`ALT["${src}"] → "${a}" not in NEW_EXERCISES`);
  }

  console.log('\n=== VALIDATE ===');
  console.log(`exercises:  ${exNames.size}`);
  console.log(`sessions:   ${SESSIONS.length}`);
  let exCount = 0;
  let setCount = 0;
  SESSIONS.forEach((s) => {
    exCount += s.exercises.length;
    s.exercises.forEach((ex) => { setCount += ex.sets.length; });
  });
  console.log(`exercise refs: ${exCount}`);
  console.log(`total sets: ${setCount}`);
  console.log(`alt entries:   ${Object.keys(ALTERNATIVES).length}`);
  console.log(`plan modules:  ${TOTAL_WEEKS}  × ${SESSIONS.length} sessions = ${TOTAL_WEEKS * SESSIONS.length} plan sessions`);

  if (errors.length) {
    console.log(`\nERRORS (${errors.length}):`);
    errors.forEach((e) => console.log(`  ✗ ${e}`));
    return false;
  }
  console.log('✓ all references resolve');
  return true;
}

// ─────────────────────────────────────────────────────────────────────
// WRITERS

async function writeLibrary({ write }) {
  console.log('\n=== WRITE LIBRARY (Gym) ===');

  // Idempotency: if Simon already has a "Gym" library, reuse it.
  const existing = await db.collection('exercises_library')
    .where('creator_id', '==', SIMON_UID)
    .where('title', '==', LIBRARY_TITLE)
    .limit(1).get();

  if (!existing.empty) {
    const ref = existing.docs[0].ref;
    console.log(`reusing existing library: ${ref.id}`);
    if (write) await maybeWriteExercises(ref, existing.docs[0].data(), { write });
    else maybeWriteExercises(ref, existing.docs[0].data(), { write });
    return ref.id;
  }

  const newRef = db.collection('exercises_library').doc();
  const docData = {
    creator_id: SIMON_UID,
    creator_name: SIMON_NAME,
    title: LIBRARY_TITLE,
    exercises: {}, // post-migration shape: stable-ID exercises live here
    created_at: FieldValue.serverTimestamp(),
    updated_at: FieldValue.serverTimestamp(),
  };
  console.log(`new library doc: ${newRef.id}`);
  console.log(`  title: ${LIBRARY_TITLE}  creator: ${SIMON_UID}  exercises: ${Object.keys(NEW_EXERCISES).length}`);

  if (!write) {
    Object.keys(NEW_EXERCISES).forEach((n) => {
      const p = NEW_EXERCISES[n];
      const m = Object.entries(p.muscle_activation).map(([k, v]) => `${k}:${v}`).join(', ');
      console.log(`  + ${n}  [${p.implements.join('/')}]  {${m}}`);
    });
    return newRef.id;
  }

  // Build exercises map under `exercises` (post-migration stable-ID shape).
  // For backward compat with the legacy reader, we ALSO write each exercise at the top-level
  // by displayName, matching seed-felipe-sessions.js behavior.
  const exercisesMap = {};
  for (const [name, props] of Object.entries(NEW_EXERCISES)) {
    const exId = newRef.collection('_exid_gen').doc().id; // generate stable doc ID
    exercisesMap[exId] = {
      displayName: name,
      implements: props.implements,
      muscle_activation: props.muscle_activation,
      created_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp(),
    };
    // Mirror legacy top-level shape so resolveLibraryExercise() works for both readers.
    docData[name] = {
      implements: props.implements,
      muscle_activation: props.muscle_activation,
      created_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp(),
    };
  }
  docData.exercises = exercisesMap;

  await newRef.set(docData);
  console.log(`  ✓ library written (${newRef.id})`);
  return newRef.id;
}

async function maybeWriteExercises(ref, currentData, { write }) {
  // Adds any missing exercises to an existing library.
  const META = new Set(['creator_id', 'creator_name', 'title', 'created_at', 'updated_at', 'icon', 'image_url', 'exercises']);
  const present = new Set(Object.keys(currentData).filter((k) => !META.has(k)));
  const newExercisesMap = currentData.exercises || {};
  const presentByDisplayName = new Set(Object.values(newExercisesMap).map((e) => e?.displayName).filter(Boolean));

  const updates = {};
  const toAdd = [];
  for (const [name, props] of Object.entries(NEW_EXERCISES)) {
    if (present.has(name) || presentByDisplayName.has(name)) continue;
    toAdd.push(name);
    updates[name] = {
      implements: props.implements,
      muscle_activation: props.muscle_activation,
      created_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp(),
    };
    const exId = ref.collection('_exid_gen').doc().id;
    updates[`exercises.${exId}`] = {
      displayName: name,
      implements: props.implements,
      muscle_activation: props.muscle_activation,
      created_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp(),
    };
  }
  console.log(`  exercises to add: ${toAdd.length}`);
  toAdd.forEach((n) => console.log(`    + ${n}`));
  if (!write) return;
  if (toAdd.length === 0) return;
  await ref.update(updates);
  console.log(`  ✓ added ${toAdd.length} exercises to existing library`);
}

async function writeLibrarySessions(libId, { write }) {
  console.log('\n=== WRITE LIBRARY SESSIONS ===');
  const sessionsCol = db.collection('creator_libraries').doc(SIMON_UID).collection('sessions');
  const sessionIdByTitle = {};

  for (let i = 0; i < SESSIONS.length; i++) {
    const s = SESSIONS[i];
    // Idempotency by title within Simon's library, gated on `seed_complete`
    // so a session that died mid-write isn't silently skipped on retry.
    const existing = await sessionsCol.where('title', '==', s.title).limit(1).get();
    if (!existing.empty) {
      const existingDoc = existing.docs[0];
      if (existingDoc.data()?.seed_complete === true) {
        console.log(`  SKIP (complete): [${i}] ${s.title} (${existingDoc.id})`);
        sessionIdByTitle[s.title] = existingDoc.id;
        continue;
      }
      console.log(`  ⚠ PARTIAL (no seed_complete): [${i}] ${s.title} (${existingDoc.id})`);
      console.log('    Delete this session manually before re-running, or pass --force to overwrite');
      throw new Error(`partial session "${s.title}" — refusing to silently skip`);
    }

    console.log(`  SESSION [${i}] ${s.title}  dayIndex=${s.dayIndex}  ex=${s.exercises.length}`);
    s.exercises.forEach((ex, ei) => {
      const tags = [];
      if (ex.notes) tags.push(`notes:"${ex.notes}"`);
      const altList = ALTERNATIVES[ex.name] || [];
      if (altList.length) tags.push(`alt:[${altList.join(' | ')}]`);
      console.log(`    [${ei}] ${ex.name}${tags.length ? '  ' + tags.join(' ') : ''}`);
      ex.sets.forEach((st, si) => {
        const noteTag = st.notes ? `  notes:"${st.notes}"` : '';
        console.log(`        • set ${si + 1}: reps=${st.reps} intensity=${st.intensity}${noteTag}`);
      });
    });

    if (!write) continue;

    const sesRef = await sessionsCol.add({
      title: s.title,
      order: i,
      defaultDataTemplate: DEFAULT_TEMPLATE,
      created_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp(),
    });
    sessionIdByTitle[s.title] = sesRef.id;

    for (let ei = 0; ei < s.exercises.length; ei++) {
      const ex = s.exercises[ei];
      const altNames = ALTERNATIVES[ex.name] || [];
      const exDataObj = {
        order: ei,
        primary: { [libId]: ex.name },
        alternatives: altNames.length > 0 ? { [libId]: altNames } : {},
        measures: DEFAULT_TEMPLATE.measures,
        objectives: DEFAULT_TEMPLATE.objectives,
        customMeasureLabels: {},
        customObjectiveLabels: {},
        created_at: FieldValue.serverTimestamp(),
        updated_at: FieldValue.serverTimestamp(),
      };
      if (ex.notes) exDataObj.notes = ex.notes;
      const exRef = await sesRef.collection('exercises').add(exDataObj);

      for (let si = 0; si < ex.sets.length; si++) {
        const st = ex.sets[si];
        const setData = {
          order: si,
          title: `Serie ${si + 1}`,
          reps: st.reps ?? null,
          intensity: st.intensity ?? null,
          created_at: FieldValue.serverTimestamp(),
        };
        if (st.notes) setData.notes = st.notes;
        await exRef.collection('sets').add(setData);
      }
    }
    // Mark complete so retries can distinguish a finished session from a
    // partial one. Without this, the title-based dedup would skip damaged docs.
    await sesRef.update({ seed_complete: true, seed_completed_at: FieldValue.serverTimestamp() });
    console.log(`    ✓ session written (${sesRef.id})`);
  }
  return sessionIdByTitle;
}

async function writePlan(sessionIdByTitle, { write }) {
  console.log('\n=== WRITE PLAN ===');

  const existing = await db.collection('plans')
    .where('creator_id', '==', SIMON_UID)
    .where('title', '==', PLAN_TITLE)
    .limit(1).get();

  if (!existing.empty) {
    const existingDoc = existing.docs[0];
    if (existingDoc.data()?.seed_complete === true) {
      console.log(`  SKIP (plan complete): ${existingDoc.id} "${PLAN_TITLE}"`);
      return existingDoc.id;
    }
    console.log(`  ⚠ PARTIAL plan (no seed_complete): ${existingDoc.id} "${PLAN_TITLE}"`);
    console.log('    Delete this plan manually before re-running');
    throw new Error(`partial plan "${PLAN_TITLE}" — refusing to silently skip`);
  }

  console.log(`  plan: "${PLAN_TITLE}" (${TOTAL_WEEKS} modules × ${SESSIONS.length} sessions)`);
  if (!write) return null;

  const planRef = await db.collection('plans').add({
    title: PLAN_TITLE,
    description: PLAN_DESCRIPTION,
    discipline: PLAN_DISCIPLINE,
    creator_id: SIMON_UID,
    creatorName: SIMON_NAME,
    created_at: FieldValue.serverTimestamp(),
    updated_at: FieldValue.serverTimestamp(),
  });
  console.log(`  ✓ plan written (${planRef.id})`);

  for (let week = 0; week < TOTAL_WEEKS; week++) {
    const moduleRef = await planRef.collection('modules').add({
      title: `Semana ${week + 1}`,
      order: week,
      created_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp(),
    });

    // Within each week, write 5 plan sessions on the dayIndex schedule.
    for (let i = 0; i < SESSIONS.length; i++) {
      const s = SESSIONS[i];
      const srcSessionId = sessionIdByTitle[s.title];
      if (!srcSessionId) {
        console.log(`    ⚠ Semana ${week + 1}: missing source session for "${s.title}", skipping`);
        continue;
      }
      await deepCopyLibrarySessionIntoPlan({
        planRef,
        moduleRef,
        sourceSessionId: srcSessionId,
        order: i,
        dayIndex: DAY_INDEXES[i],
      });
    }
    if ((week + 1) % 3 === 0) console.log(`    ✓ Semana ${week + 1} written`);
  }
  await planRef.update({ seed_complete: true, seed_completed_at: FieldValue.serverTimestamp() });
  console.log(`  ✓ plan + ${TOTAL_WEEKS} modules + ${TOTAL_WEEKS * SESSIONS.length} sessions written`);
  return planRef.id;
}

async function deepCopyLibrarySessionIntoPlan({ planRef, moduleRef, sourceSessionId, order, dayIndex }) {
  const libSessionRef = db.collection('creator_libraries').doc(SIMON_UID).collection('sessions').doc(sourceSessionId);
  const libDoc = await libSessionRef.get();
  if (!libDoc.exists) throw new Error(`library session not found: ${sourceSessionId}`);
  const libData = libDoc.data();

  const planSessionRef = await moduleRef.collection('sessions').add({
    title: libData.title,
    order,
    dayIndex,
    source_library_session_id: sourceSessionId,
    defaultDataTemplate: libData.defaultDataTemplate || DEFAULT_TEMPLATE,
    created_at: FieldValue.serverTimestamp(),
    updated_at: FieldValue.serverTimestamp(),
  });

  const exSnap = await libSessionRef.collection('exercises').orderBy('order', 'asc').get();
  let batch = db.batch();
  let batchCount = 0;
  for (const eDoc of exSnap.docs) {
    const exRef = planSessionRef.collection('exercises').doc();
    batch.set(exRef, {
      ...eDoc.data(),
      id: exRef.id,
      created_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp(),
    });
    batchCount++;
    const setSnap = await eDoc.ref.collection('sets').orderBy('order', 'asc').get();
    for (const sDoc of setSnap.docs) {
      const sRef = exRef.collection('sets').doc();
      batch.set(sRef, {
        ...sDoc.data(),
        id: sRef.id,
        created_at: FieldValue.serverTimestamp(),
        updated_at: FieldValue.serverTimestamp(),
      });
      batchCount++;
    }
    if (batchCount >= 450) { await batch.commit(); batch = db.batch(); batchCount = 0; }
  }
  if (batchCount > 0) await batch.commit();
}

// ─────────────────────────────────────────────────────────────────────
// CLI

(async () => {
  const argv = process.argv.slice(2);
  const args = new Set(argv);
  const write = args.has('--write');
  const all = args.has('--all');
  const doValidate = all || args.has('--validate') || args.has('--write-library') || args.has('--write-sessions') || args.has('--write-plan');
  const doLibrary = all || args.has('--write-library');
  const doSessions = all || args.has('--write-sessions');
  const doPlan = all || args.has('--write-plan');

  if (!doValidate && !doLibrary && !doSessions && !doPlan) {
    console.log('Usage:  node scripts/seed-simon-program.js [flags]');
    console.log('  --validate         verify references resolve');
    console.log('  --write-library    create/update Gym library');
    console.log('  --write-sessions   create 5 library sessions');
    console.log('  --write-plan       create plan + 12 modules');
    console.log('  --all              everything');
    console.log('  --write            commit changes (default is dry-run)');
    process.exit(0);
  }

  console.log(`Project: ${PROJECT_ID}  uid: ${SIMON_UID}`);
  console.log(`Mode: ${write ? 'WRITE' : 'DRY RUN'}   flags: ${[...args].join(' ')}`);

  if (doValidate) {
    const ok = validate();
    if (!ok) { console.log('\nFix errors before --write. Aborting.'); process.exit(1); }
  }

  let libId = null;
  let sessionIds = {};
  if (doLibrary) {
    libId = await writeLibrary({ write });
  } else {
    // For sessions/plan we still need the library ID — find it.
    const lib = await db.collection('exercises_library')
      .where('creator_id', '==', SIMON_UID)
      .where('title', '==', LIBRARY_TITLE).limit(1).get();
    if (!lib.empty) libId = lib.docs[0].id;
  }

  if (doSessions) {
    if (!libId) { console.log('\nNo library ID — cannot write sessions. Run --write-library first.'); process.exit(1); }
    sessionIds = await writeLibrarySessions(libId, { write });
  } else if (doPlan) {
    // Plan needs session IDs — load them.
    const sessionsCol = db.collection('creator_libraries').doc(SIMON_UID).collection('sessions');
    for (const s of SESSIONS) {
      const ex = await sessionsCol.where('title', '==', s.title).limit(1).get();
      if (!ex.empty) sessionIds[s.title] = ex.docs[0].id;
    }
  }

  if (doPlan) {
    if (Object.keys(sessionIds).length < SESSIONS.length && write) {
      console.log('\n⚠ Plan needs all 5 sessions to exist. Run --write-sessions first or use --all.');
      process.exit(1);
    }
    await writePlan(sessionIds, { write });
  }

  console.log(`\n${write ? 'DONE.' : 'DRY RUN complete. Re-run with --write to commit.'}`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
