#!/usr/bin/env node
'use strict';

/**
 * Seed "Código ABS" — Felipe Bejarano's leveled monthly abs subscription
 * (shell → 3 plans, one per level). Reuses Felipe's existing exercise library.
 *
 * Model (see docs/superpowers/specs/2026-06-09-codigo-abs-niveles-design.md):
 *   - courses/{ABS}  shell: deliveryType general, monthly_first_monday,
 *       levels {options,default}, level_plans {nivel: planId}
 *   - plans/{planId} per level, each with a "Mes 1" module
 *   - sessions carry weekIndex (0..3) + dayIndex (1/3/5 = Lun/Mié/Vie, enfoque A/B/C)
 *   - exercises -> primary {[LIB_ID]: key}; sets -> reps/rir/restSeconds/duration
 *
 * Mes 1 (Fase 1 — Adaptación) is authored from the manuscript (R1–R10).
 * Meses 2–12 + final Intermedio prescriptions are Felipe's homework — extend MES_1
 * into a MONTHS array and re-run. Intermedio here is a sensible middle, flagged.
 *
 * Dry-run by default. Modes:
 *   NODE_PATH=functions/node_modules node scripts/seed-codigo-abs.js              # dry-run
 *   NODE_PATH=functions/node_modules node scripts/seed-codigo-abs.js --validate   # check lib refs
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 NODE_PATH=functions/node_modules node scripts/seed-codigo-abs.js --write   # emulator write
 *   APPLY_PROD=1 NODE_PATH=functions/node_modules node scripts/seed-codigo-abs.js --write   # PROD write (needs creds + confirmation)
 *
 * Idempotent: skips the course/plans if they already exist for Felipe by title;
 * upserts modules by order.
 */
const admin = require('firebase-admin');

const PROJECT_ID = 'wolf-20b8b';
const FELIPE_UID = 'yMqKOXBcVARa6vjU7wImf3Tp85J2';
const LIB_ID = 'jeoVyzhUrBeJofT62MOe'; // Felipe's existing library (already holds some abs moves)
const SUB_PRICE = 49000; // COP/mes (placeholder — Felipe to confirm)

const WRITE = process.argv.includes('--write');
const VALIDATE = process.argv.includes('--validate');
const USING_EMULATOR = !!process.env.FIRESTORE_EMULATOR_HOST;

if (USING_EMULATOR) {
  admin.initializeApp({ projectId: PROJECT_ID });
} else if (process.env.APPLY_PROD === '1') {
  admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId: PROJECT_ID });
} else if (WRITE) {
  console.error('Refusing to --write to prod without APPLY_PROD=1 (or set FIRESTORE_EMULATOR_HOST for emulator).');
  process.exit(1);
} else {
  admin.initializeApp({ projectId: PROJECT_ID });
}
const db = admin.firestore();
const NOW = admin.firestore.FieldValue.serverTimestamp();
const log = (...a) => console.log(...a);

// ── Abs movement library (displayName -> metadata). Reused/created in LIB_ID. ──
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

// ── Enfoques (A/B/C) and the 3 exercises each, per level. From the manuscript. ──
// kind 'reps' uses reps+rir; kind 'hold' uses duration (seconds), no rir.
const R = (name, kind = 'reps', reps = '12-15') => ({ name, kind, reps });
const H = (name) => ({ name, kind: 'hold' });

const ENFOQUES = {
  A: { title: 'Flexión espinal (grosor)', dayIndex: 1 },
  B: { title: 'Oblicuos y rotación (V-shape)', dayIndex: 3 },
  C: { title: 'Fuerza, densidad e isometría', dayIndex: 5 },
};

// EX[level][enfoque] = [ex, ex, ex]
const EX = {
  principiante: {
    A: [R('ELEVACION PELVICA RODILLAS AL PECHO', 'reps', '10-12'), R('CRUNCH EN SUELO', 'reps', '12-15'), H('PLANCHA FRONTAL')],
    B: [R('GIRO RUSO', 'reps', '12 c/l'), H('PLANCHA LATERAL'), R('BICICLETAS', 'reps', '20')],
    C: [R('DESLIZAMIENTO EN FITBALL', 'reps', '8-10'), R('CRUNCH EN SUELO', 'reps', '10-12'), R('FARMER CARRY A UNA MANO', 'hold')],
  },
  intermedio: { // sensible middle — Felipe to refine
    A: [R('ELEVACION PELVICA RODILLAS AL PECHO', 'reps', '12-15'), R('CRUNCH DECLINADO', 'reps', '12-15'), H('PLANCHA FRONTAL')],
    B: [R('GIRO RUSO CON PESO', 'reps', '12 c/l'), H('PLANCHA LATERAL'), R('BICICLETAS', 'reps', '24')],
    C: [R('DESLIZAMIENTO EN FITBALL', 'reps', '10-12'), R('CRUNCH DECLINADO', 'reps', '10-12'), R('FARMER CARRY A UNA MANO', 'hold')],
  },
  avanzado: {
    A: [R('ELEVACIONES DE PIERNAS COLGADO', 'reps', '10-12'), R('CRUNCH EN CABLE', 'reps', '12-15'), H('PLANCHA FRONTAL')],
    B: [R('PALLOF PRESS EN POLEA', 'reps', '12 c/l'), H('PLANCHA LATERAL'), R('BICICLETAS', 'reps', '24')],
    C: [R('AB-WHEEL', 'reps', '8-10'), R('CRUNCH PESADO EN MAQUINA', 'reps', '10-12'), R('FARMER CARRY A UNA MANO', 'hold')],
  },
};

// 4-week microcycle (Fase 1): same moves, intensity climbs. Holds grow per week.
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
  const nameToKey = {};
  const updates = {};
  for (const [name, ma] of Object.entries(MOVES)) {
    const existing = byName[name.toUpperCase()] || (data[name] ? name : null);
    if (existing) { nameToKey[name] = existing; continue; }
    const key = newId();
    nameToKey[name] = key;
    const entry = { muscle_activation: ma, implements: ['Peso Corporal'], video_url: '', video_source: '', video_path: '', created_at: NOW, updated_at: NOW };
    updates[`exercises.${key}`] = { displayName: name, ...entry };
    updates[name] = entry;
    log(`  + library exercise "${name}" -> ${key}`);
  }
  if (Object.keys(updates).length && WRITE) await libRef.set(updates, { merge: true });
  return nameToKey;
}

function setsFor(ex, week, level) {
  const w = WEEKS[week];
  const out = [];
  for (let s = 0; s < w.sets; s++) {
    if (ex.kind === 'hold') {
      const dur = level === 'avanzado' ? w.holdA : w.holdP;
      out.push({ order: s, title: `Serie ${s + 1}`, duration: dur, reps: null, intensity: null, restSeconds: w.restSeconds });
    } else {
      out.push({ order: s, title: `Serie ${s + 1}`, reps: ex.reps, rir: w.rir, restSeconds: w.restSeconds });
    }
  }
  return out;
}

async function createPlan(level, nameToKey) {
  // idempotent: reuse plan by title+creator
  const existing = await db.collection('plans')
    .where('creator_id', '==', FELIPE_UID).where('title', '==', PLAN_TITLE(level)).limit(1).get();
  let planRef;
  if (!existing.empty) { planRef = existing.docs[0].ref; log(`  plan "${PLAN_TITLE(level)}" exists -> ${planRef.id}`); }
  else {
    planRef = db.collection('plans').doc();
    if (WRITE) await planRef.set({ creator_id: FELIPE_UID, creatorName: 'Felipe Bejarano', title: PLAN_TITLE(level), discipline: 'fuerza-hipertrofia', created_at: NOW, updated_at: NOW });
    log(`  + plan "${PLAN_TITLE(level)}" -> ${planRef.id}`);
  }

  // Mes 1 module (order 0)
  const modId = 'mes-1';
  const modRef = planRef.collection('modules').doc(modId);
  if (WRITE) await modRef.set({ order: 0, title: 'Mes 1 — Adaptación', published_at: null, created_at: NOW, updated_at: NOW }, { merge: true });

  // 4 weeks × 3 enfoques sessions
  for (let week = 0; week < 4; week++) {
    for (const enf of ['A', 'B', 'C']) {
      const sesId = `w${week}-${enf}`;
      const sRef = modRef.collection('sessions').doc(sesId);
      if (WRITE) await sRef.set({
        order: week * 3 + ({ A: 0, B: 1, C: 2 }[enf]),
        title: `${ENFOQUES[enf].title}`,
        weekIndex: week, dayIndex: ENFOQUES[enf].dayIndex, isRestDay: false,
        created_at: NOW, updated_at: NOW,
      }, { merge: true });
      const exs = EX[level][enf];
      for (let i = 0; i < exs.length; i++) {
        const ex = exs[i];
        const key = nameToKey[ex.name];
        if (!key) throw new Error(`No library key for "${ex.name}"`);
        const eRef = sRef.collection('exercises').doc(`ex${i}`);
        if (WRITE) await eRef.set({
          order: i, primary: { [LIB_ID]: key }, alternatives: {},
          measures: ex.kind === 'hold' ? ['duration'] : ['reps', 'weight', 'intensity'],
          objectives: ['reps', 'previous'], customMeasureLabels: {}, customObjectiveLabels: {},
          created_at: NOW, updated_at: NOW,
        }, { merge: true });
        const sets = setsFor(ex, week, level);
        for (const st of sets) {
          const stRef = eRef.collection('sets').doc(`s${st.order}`);
          if (WRITE) await stRef.set({ ...st, created_at: NOW, updated_at: NOW }, { merge: true });
        }
      }
    }
  }
  log(`    authored Mes 1: 12 sessions (4 weeks × A/B/C) for ${level}`);
  return { planId: planRef.id, mes1ModuleId: modId };
}

(async () => {
  log(`\n=== seed-codigo-abs ===  mode=${VALIDATE ? 'validate' : WRITE ? (USING_EMULATOR ? 'WRITE(emulator)' : 'WRITE(prod)') : 'dry-run'}  project=${PROJECT_ID}\n`);
  const nameToKey = await ensureLibrary();

  if (VALIDATE) {
    const missing = Object.values(EX).flatMap((lv) => Object.values(lv)).flat().map((e) => e.name).filter((n) => !nameToKey[n]);
    if (missing.length) { log('✗ missing library refs:', [...new Set(missing)]); process.exit(1); }
    log('✓ all exercise references resolve to library keys'); process.exit(0);
  }

  // Shell course (idempotent by title+creator)
  const existing = await db.collection('courses')
    .where('creator_id', '==', FELIPE_UID).where('title', '==', ABS_COURSE_TITLE).limit(1).get();
  let courseRef;
  if (!existing.empty) { courseRef = existing.docs[0].ref; log(`course "${ABS_COURSE_TITLE}" exists -> ${courseRef.id}`); }
  else {
    courseRef = db.collection('courses').doc();
    if (WRITE) await courseRef.set({
      creator_id: FELIPE_UID, creatorName: 'Felipe Bejarano', deliveryType: 'general',
      title: ABS_COURSE_TITLE, discipline: 'fuerza-hipertrofia', status: 'draft',
      access_duration: 'monthly', block_cadence: 'monthly_first_monday', scheduling: 'weekly',
      subscription_price: SUB_PRICE, image_url: null, image_path: null, video_intro_url: null,
      visibility: 'both', created_at: NOW, updated_at: NOW,
    });
    log(`+ course "${ABS_COURSE_TITLE}" -> ${courseRef.id}`);
  }

  const levelPlans = {};
  for (const level of ['principiante', 'intermedio', 'avanzado']) {
    const { planId } = await createPlan(level, nameToKey);
    levelPlans[level] = planId;
  }

  if (WRITE) await courseRef.set({
    levels: { options: ['principiante', 'intermedio', 'avanzado'], default: 'principiante' },
    level_plans: levelPlans, updated_at: NOW,
  }, { merge: true });
  log(`\nlevel_plans: ${JSON.stringify(levelPlans)}`);

  // program_state -> Mes 1 live (index 0)
  if (WRITE) await db.collection('program_state').doc(courseRef.id).set({
    current_block_index: 0, current_block_id: 'mes-1', current_block_started_at: NOW, updated_at: NOW,
  }, { merge: true });

  log(`\n${WRITE ? '✓ written' : 'DRY-RUN (no writes). Re-run with --write.'}  course=${courseRef.id}`);
  process.exit(0);
})().catch((e) => { console.error('FATAL', e); process.exit(2); });
