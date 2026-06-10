#!/usr/bin/env node
'use strict';

/**
 * Seed "Código ABS" — Felipe Bejarano's leveled monthly abs subscription
 * (shell → 3 plans, one per level). Reuses Felipe's existing exercise library.
 * Documents are written to FULL PARITY with real prod data (Método Bejarano +
 * real plans) so the workout walker, Hoy card, execution screen and creator
 * dashboard all render correctly.
 *
 * Model (docs/superpowers/specs/2026-06-09-codigo-abs-niveles-design.md):
 *   courses/{ABS} shell (general, monthly_first_monday) + levels + level_plans
 *   plans/{planId} per level → module "mes-1" → sessions (weekIndex 0..3 ×
 *   dayIndex 1/3/5 = enfoque A/B/C) → exercises (primary → library) → sets.
 *
 * Mes 1 (Fase 1) authored from the manuscript (R1–R10). Intermedio is a sensible
 * middle (Felipe to refine). Meses 2–12 + videos = Felipe's homework: extend MES_1.
 *
 * Idempotent (always merges full parity field set; safe to re-run).
 *   NODE_PATH=functions/node_modules node scripts/seed-codigo-abs.js              # dry-run
 *   ... --validate                                                                # check lib refs
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 ... --write                            # emulator write
 *   APPLY_PROD=1 ... --write                                                      # PROD write (ADC + confirmation)
 */
const admin = require('firebase-admin');

const PROJECT_ID = 'wolf-20b8b';
const FELIPE_UID = 'yMqKOXBcVARa6vjU7wImf3Tp85J2';
const LIB_ID = 'jeoVyzhUrBeJofT62MOe';
const SUB_PRICE = 49000; // COP/mes (placeholder — Felipe to confirm)
const CONTENT_VERSION = '2026-06';

const WRITE = process.argv.includes('--write');
const VALIDATE = process.argv.includes('--validate');
const USING_EMULATOR = !!process.env.FIRESTORE_EMULATOR_HOST;

if (USING_EMULATOR) {
  admin.initializeApp({ projectId: PROJECT_ID });
} else if (process.env.APPLY_PROD === '1') {
  admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId: PROJECT_ID });
} else if (WRITE) {
  console.error('Refusing to --write to prod without APPLY_PROD=1 (or set FIRESTORE_EMULATOR_HOST).');
  process.exit(1);
} else {
  admin.initializeApp({ projectId: PROJECT_ID });
}
const db = admin.firestore();
const NOW = admin.firestore.FieldValue.serverTimestamp();
const log = (...a) => console.log(...a);

// Session-level default template the execution screen reads (parity with prod).
const DEFAULT_DATA_TEMPLATE = {
  customMeasureLabels: {}, customObjectiveLabels: {},
  measures: ['reps', 'weight', 'intensity'], objectives: ['reps', 'intensity', 'previous'],
};
// RIR (reps in reserve) -> RPE "N/10" string, the format prod sets use.
const rirToIntensity = (rir) => `${Math.max(1, Math.min(10, 10 - rir))}/10`;

const MOVES = {
  'ELEVACION PELVICA RODILLAS AL PECHO': { abs: 100, obliques: 20 },
  'ELEVACIONES DE PIERNAS COLGADO':      { abs: 100, obliques: 30, hip_flexors: 40 },
  'CRUNCH EN SUELO':                     { abs: 100 },
  'CRUNCH EN CABLE':                     { abs: 100 },
  'CRUNCH DECLINADO':                    { abs: 100, obliques: 20 },
  'PLANCHA FRONTAL':                     { abs: 90, transverse: 100, lower_back: 30 },
  'GIRO RUSO':                           { obliques: 100, abs: 60 },
  'GIRO RUSO CON PESO':                  { obliques: 100, abs: 60 },
  'PALLOF PRESS EN POLEA':               { obliques: 100, transverse: 90 },
  'PLANCHA LATERAL':                     { obliques: 100, transverse: 80 },
  'BICICLETAS':                          { abs: 80, obliques: 90 },
  'DESLIZAMIENTO EN FITBALL':            { abs: 90, transverse: 90 },
  'AB-WHEEL':                            { abs: 100, transverse: 100, lower_back: 30 },
  'CRUNCH PESADO EN MAQUINA':            { abs: 100 },
  'FARMER CARRY A UNA MANO':             { transverse: 100, obliques: 80 },
};
const IMPLEMENTS = {
  'CRUNCH EN CABLE': ['Polea'], 'PALLOF PRESS EN POLEA': ['Polea'],
  'CRUNCH PESADO EN MAQUINA': ['Máquina'], 'AB-WHEEL': ['Rueda Abdominal'],
  'DESLIZAMIENTO EN FITBALL': ['Fitball'], 'FARMER CARRY A UNA MANO': ['Mancuerna'],
  'GIRO RUSO CON PESO': ['Disco'], 'CRUNCH DECLINADO': ['Banco'],
};

const ENFOQUES = {
  A: { title: 'Flexión espinal (grosor)', dayIndex: 1 },
  B: { title: 'Oblicuos y rotación (V-shape)', dayIndex: 3 },
  C: { title: 'Fuerza, densidad e isometría', dayIndex: 5 },
};
const R = (name, reps = '12-15') => ({ name, kind: 'reps', reps });
const H = (name) => ({ name, kind: 'hold' });

const EX = {
  principiante: {
    A: [R('ELEVACION PELVICA RODILLAS AL PECHO', '10-12'), R('CRUNCH EN SUELO', '12-15'), H('PLANCHA FRONTAL')],
    B: [R('GIRO RUSO', '12 c/l'), H('PLANCHA LATERAL'), R('BICICLETAS', '20')],
    C: [R('DESLIZAMIENTO EN FITBALL', '8-10'), R('CRUNCH EN SUELO', '10-12'), H('FARMER CARRY A UNA MANO')],
  },
  intermedio: {
    A: [R('ELEVACION PELVICA RODILLAS AL PECHO', '12-15'), R('CRUNCH DECLINADO', '12-15'), H('PLANCHA FRONTAL')],
    B: [R('GIRO RUSO CON PESO', '12 c/l'), H('PLANCHA LATERAL'), R('BICICLETAS', '24')],
    C: [R('DESLIZAMIENTO EN FITBALL', '10-12'), R('CRUNCH DECLINADO', '10-12'), H('FARMER CARRY A UNA MANO')],
  },
  avanzado: {
    A: [R('ELEVACIONES DE PIERNAS COLGADO', '10-12'), R('CRUNCH EN CABLE', '12-15'), H('PLANCHA FRONTAL')],
    B: [R('PALLOF PRESS EN POLEA', '12 c/l'), H('PLANCHA LATERAL'), R('BICICLETAS', '24')],
    C: [R('AB-WHEEL', '8-10'), R('CRUNCH PESADO EN MAQUINA', '10-12'), H('FARMER CARRY A UNA MANO')],
  },
};
const WEEKS = [
  { sets: 3, rir: 3, holdP: 40, holdA: 45, restSeconds: 90 },
  { sets: 4, rir: 2, holdP: 45, holdA: 55, restSeconds: 75 },
  { sets: 3, rir: 1, holdP: 50, holdA: 60, restSeconds: 60 },
  { sets: 4, rir: 1, holdP: 55, holdA: 70, restSeconds: 60 },
];

const ABS_COURSE_TITLE = 'Código ABS';
const PLAN_TITLE = (lvl) => `Código ABS — ${lvl}`;
const newId = () => db.collection('_ids').doc().id;

async function ensureLibrary() {
  const libRef = db.collection('exercises_library').doc(LIB_ID);
  const data = (await libRef.get()).data() || {};
  const byName = {};
  if (data.exercises) for (const [k, v] of Object.entries(data.exercises)) {
    if (v?.displayName) byName[v.displayName.toUpperCase()] = k;
  }
  const nameToKey = {}; const updates = {};
  for (const [name, ma] of Object.entries(MOVES)) {
    const existing = byName[name.toUpperCase()] || (data[name] ? name : null);
    if (existing) { nameToKey[name] = existing; continue; }
    const key = newId(); nameToKey[name] = key;
    const impl = IMPLEMENTS[name] || ['Peso Corporal'];
    const entry = { muscle_activation: ma, implements: impl, video_url: '', video_source: '', video_path: '', created_at: NOW, updated_at: NOW };
    updates[`exercises.${key}`] = { displayName: name, ...entry };
    updates[name] = entry;
    log(`  + library exercise "${name}" -> ${key}`);
  }
  // update() (not set+merge) so dotted keys "exercises.{key}" nest properly.
  if (Object.keys(updates).length && WRITE) await libRef.update(updates);
  return nameToKey;
}

function setsFor(ex, week, level) {
  const w = WEEKS[week]; const out = [];
  for (let s = 0; s < w.sets; s++) {
    const id = `s${s}`;
    if (ex.kind === 'hold') {
      const dur = level === 'avanzado' ? w.holdA : w.holdP;
      out.push({ id, order: s, title: `Serie ${s + 1}`, duration: dur, reps: null, intensity: null, restSeconds: w.restSeconds });
    } else {
      out.push({ id, order: s, title: `Serie ${s + 1}`, reps: ex.reps, rir: w.rir, intensity: rirToIntensity(w.rir), restSeconds: w.restSeconds });
    }
  }
  return out;
}

async function findOrCreateRef(coll, title) {
  const q = await db.collection(coll).where('creator_id', '==', FELIPE_UID).where('title', '==', title).limit(1).get();
  if (!q.empty) return { ref: q.docs[0].ref, created: false };
  return { ref: db.collection(coll).doc(), created: true };
}

async function createPlan(level, nameToKey) {
  const { ref: planRef, created } = await findOrCreateRef('plans', PLAN_TITLE(level));
  log(`  ${created ? '+' : '·'} plan "${PLAN_TITLE(level)}" -> ${planRef.id}`);
  if (WRITE) await planRef.set({
    creator_id: FELIPE_UID, creatorName: 'Felipe Bejarano', title: PLAN_TITLE(level),
    description: '', discipline: 'fuerza-hipertrofia', updated_at: NOW,
    ...(created ? { created_at: NOW } : {}),
  }, { merge: true });

  const modId = 'mes-1';
  const modRef = planRef.collection('modules').doc(modId);
  if (WRITE) await modRef.set({ order: 0, title: 'Mes 1 — Adaptación', published_at: null, updated_at: NOW, created_at: NOW }, { merge: true });

  for (let week = 0; week < 4; week++) {
    for (const enf of ['A', 'B', 'C']) {
      const sesId = `w${week}-${enf}`;
      const sRef = modRef.collection('sessions').doc(sesId);
      if (WRITE) await sRef.set({
        order: week * 3 + ({ A: 0, B: 1, C: 2 }[enf]),
        title: ENFOQUES[enf].title, weekIndex: week, dayIndex: ENFOQUES[enf].dayIndex,
        isRestDay: false, image_url: null, defaultDataTemplate: DEFAULT_DATA_TEMPLATE,
        updated_at: NOW, created_at: NOW,
      }, { merge: true });
      const exs = EX[level][enf];
      for (let i = 0; i < exs.length; i++) {
        const ex = exs[i]; const key = nameToKey[ex.name];
        if (!key) throw new Error(`No library key for "${ex.name}"`);
        const exId = `ex${i}`;
        const eRef = sRef.collection('exercises').doc(exId);
        if (WRITE) await eRef.set({
          id: exId, order: i, primary: { [LIB_ID]: key }, alternatives: {},
          measures: ex.kind === 'hold' ? ['duration'] : ['reps', 'weight', 'intensity'],
          objectives: ex.kind === 'hold' ? ['reps', 'previous'] : ['reps', 'intensity', 'previous'],
          customMeasureLabels: {}, customObjectiveLabels: {}, updated_at: NOW, created_at: NOW,
        }, { merge: true });
        for (const st of setsFor(ex, week, level)) {
          if (WRITE) await eRef.collection('sets').doc(st.id).set({ ...st, updated_at: NOW, created_at: NOW }, { merge: true });
        }
      }
    }
  }
  log(`    Mes 1: 12 sesiones (4 sem × A/B/C) for ${level}`);
  return planRef.id;
}

(async () => {
  log(`\n=== seed-codigo-abs ===  mode=${VALIDATE ? 'validate' : WRITE ? (USING_EMULATOR ? 'WRITE(emulator)' : 'WRITE(prod)') : 'dry-run'}\n`);
  const nameToKey = await ensureLibrary();

  if (VALIDATE) {
    const missing = Object.values(EX).flatMap((lv) => Object.values(lv)).flat().map((e) => e.name).filter((n) => !nameToKey[n]);
    if (missing.length) { log('✗ missing:', [...new Set(missing)]); process.exit(1); }
    log('✓ all exercise references resolve'); process.exit(0);
  }

  const { ref: courseRef, created: courseCreated } = await findOrCreateRef('courses', ABS_COURSE_TITLE);
  log(`${courseCreated ? '+' : '·'} course "${ABS_COURSE_TITLE}" -> ${courseRef.id}`);

  const levelPlans = {};
  for (const level of ['principiante', 'intermedio', 'avanzado']) levelPlans[level] = await createPlan(level, nameToKey);

  if (WRITE) await courseRef.set({
    creator_id: FELIPE_UID, creatorName: 'Felipe Bejarano', deliveryType: 'general',
    title: ABS_COURSE_TITLE, discipline: 'fuerza-hipertrofia', status: 'draft',
    access_duration: 'monthly', block_cadence: 'monthly_first_monday', scheduling: 'weekly',
    weekly: false, weight_suggestions: true, subscription_price: SUB_PRICE,
    image_url: null, image_path: null, video_intro_url: null, description: '', visibility: 'both',
    free_trial: { active: false, duration_days: 0 },
    tutorials: { dailyWorkout: [], workoutCompletion: [], workoutExecution: [] },
    availableLibraries: [], content_plan_id: null,
    version: CONTENT_VERSION, published_version: CONTENT_VERSION,
    levels: { options: ['principiante', 'intermedio', 'avanzado'], default: 'principiante' },
    level_plans: levelPlans,
    current_block_index: 0, current_block_id: 'mes-1',
    updated_at: NOW, last_update: NOW, ...(courseCreated ? { created_at: NOW } : {}),
  }, { merge: true });
  log(`\nlevel_plans: ${JSON.stringify(levelPlans)}`);

  if (WRITE) await db.collection('program_state').doc(courseRef.id).set({
    current_block_index: 0, current_block_id: 'mes-1', current_block_started_at: NOW, updated_at: NOW,
  }, { merge: true });

  log(`\n${WRITE ? '✓ written' : 'DRY-RUN'}  course=${courseRef.id}`);
  process.exit(0);
})().catch((e) => { console.error('FATAL', e); process.exit(2); });
