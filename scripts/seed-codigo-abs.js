#!/usr/bin/env node
'use strict';

/**
 * Seed "Código ABS" — Felipe Bejarano's leveled monthly subscription.
 * Model = MISMO que el Método (plan mensual), solo que con 3 planificaciones (niveles):
 *   courses/{ABS} shell (general, monthly_first_monday) + levels + level_plans
 *   plans/{planId} por nivel → 12 módulos "Mes N" → sesiones (enfoque A/B/C, dayIndex 1/3/5;
 *     avanzado suma D = sábado opcional, dayIndex 6)
 *   → ejercicios (primary → librería) → sets con rep_sequence[4] (progresión intra-mes, 4 semanas).
 *   NO weekIndex (la variedad semanal va por rep_sequence — el backend resuelve la rep de la
 *   semana vigente del bloque; ver levelResolution.repsForBlockWeek).
 *
 * 12 meses = 4 fases × 3 meses (Adaptación / Sobrecarga / Técnicas / Shock-Clímax),
 * rotando combinaciones de una base de ~25 movimientos. Meses 1–2 siguen el manuscrito
 * (Fases 1–2); 3–12 extrapolan la periodización — Felipe a refinar + videos.
 *
 * Idempotente: RESETEA (recursiveDelete) los módulos de cada plan y los reescribe.
 *   NODE_PATH=functions/node_modules node scripts/seed-codigo-abs.js              # dry-run
 *   ... --validate                                                                # check lib refs
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 ... --write                            # emulator
 *   APPLY_PROD=1 ... --write                                                      # PROD (ADC)
 */
const admin = require('firebase-admin');

const PROJECT_ID = 'wolf-20b8b';
const FELIPE_UID = 'yMqKOXBcVARa6vjU7wImf3Tp85J2';
const LIB_ID = 'jeoVyzhUrBeJofT62MOe';
const SUB_PRICE = 49000;
const CONTENT_VERSION = '2026-06';

const WRITE = process.argv.includes('--write');
const VALIDATE = process.argv.includes('--validate');
const USING_EMULATOR = !!process.env.FIRESTORE_EMULATOR_HOST;

if (USING_EMULATOR) admin.initializeApp({ projectId: PROJECT_ID });
else if (process.env.APPLY_PROD === '1') admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId: PROJECT_ID });
else if (WRITE) { console.error('Refusing prod --write without APPLY_PROD=1 (or FIRESTORE_EMULATOR_HOST).'); process.exit(1); }
else admin.initializeApp({ projectId: PROJECT_ID });

const db = admin.firestore();
const NOW = admin.firestore.FieldValue.serverTimestamp();
const log = (...a) => console.log(...a);
const newId = () => db.collection('_ids').doc().id;

const DEFAULT_DATA_TEMPLATE = {
  customMeasureLabels: {}, customObjectiveLabels: {},
  measures: ['reps', 'weight', 'intensity'], objectives: ['reps', 'intensity', 'previous'],
};

// ── Librería base (displayName -> muscle_activation). Reusada/creada en LIB_ID. ──
const MOVES = {
  'ELEVACION PELVICA RODILLAS AL PECHO': { abs: 100, obliques: 20 },
  'ELEVACIONES DE PIERNAS COLGADO':      { abs: 100, obliques: 30, hip_flexors: 40 },
  'ELEVACION DE RODILLAS EN PARALELAS':  { abs: 100, hip_flexors: 40 },
  'CRUNCH EN SUELO':                     { abs: 100 },
  'CRUNCH EN CABLE':                     { abs: 100 },
  'CRUNCH DECLINADO':                    { abs: 100, obliques: 20 },
  'CRUNCH INVERSO':                      { abs: 100, obliques: 20 },
  'CRUNCH REVERSO':                      { abs: 100 },
  'CRUNCH PESADO EN MAQUINA':            { abs: 100 },
  'SIT-UP COMPLETO':                     { abs: 100, hip_flexors: 30 },
  'V-UP':                                { abs: 100, hip_flexors: 40 },
  'PLANCHA FRONTAL':                     { abs: 90, transverse: 100, lower_back: 30 },
  'PLANCHA LATERAL':                     { obliques: 100, transverse: 80 },
  'HOLLOW BODY HOLD':                    { abs: 100, transverse: 90 },
  'DEAD BUG':                            { abs: 90, transverse: 90 },
  'GIRO RUSO':                           { obliques: 100, abs: 60 },
  'GIRO RUSO CON PESO':                  { obliques: 100, abs: 60 },
  'BICICLETAS':                          { abs: 80, obliques: 90 },
  'DUMBBELL WINDMILL':                   { obliques: 100, transverse: 70 },
  'PALLOF PRESS EN POLEA':               { obliques: 100, transverse: 90 },
  'RENEGADE ROW':                        { obliques: 90, transverse: 90, back: 50 },
  'SUITCASE CARRY':                      { obliques: 100, transverse: 90 },
  'DESLIZAMIENTO EN FITBALL':            { abs: 90, transverse: 90 },
  'AB-WHEEL':                            { abs: 100, transverse: 100, lower_back: 30 },
  'FARMER CARRY A UNA MANO':             { transverse: 100, obliques: 80 },
};
const HOLDS = new Set(['PLANCHA FRONTAL', 'PLANCHA LATERAL', 'HOLLOW BODY HOLD', 'FARMER CARRY A UNA MANO', 'SUITCASE CARRY']);
const IMPLEMENTS = {
  'CRUNCH EN CABLE': ['Polea'], 'PALLOF PRESS EN POLEA': ['Polea'], 'CRUNCH PESADO EN MAQUINA': ['Máquina'],
  'AB-WHEEL': ['Rueda Abdominal'], 'DESLIZAMIENTO EN FITBALL': ['Fitball'], 'FARMER CARRY A UNA MANO': ['Mancuerna'],
  'SUITCASE CARRY': ['Mancuerna'], 'GIRO RUSO CON PESO': ['Disco'], 'CRUNCH DECLINADO': ['Banco'],
  'DUMBBELL WINDMILL': ['Mancuerna'], 'RENEGADE ROW': ['Mancuernas'], 'CRUNCH INVERSO': ['Banco'],
};

// Pools por enfoque y nivel — el generador rota sobre estos para variar mes a mes.
const POOLS = {
  A: { // Flexión espinal (grosor del recto)
    principiante: ['CRUNCH EN SUELO', 'ELEVACION PELVICA RODILLAS AL PECHO', 'SIT-UP COMPLETO', 'CRUNCH REVERSO'],
    intermedio:   ['CRUNCH DECLINADO', 'CRUNCH INVERSO', 'SIT-UP COMPLETO', 'V-UP'],
    avanzado:     ['CRUNCH EN CABLE', 'ELEVACIONES DE PIERNAS COLGADO', 'V-UP', 'ELEVACION DE RODILLAS EN PARALELAS'],
  },
  B: { // Oblicuos y rotación
    principiante: ['GIRO RUSO', 'BICICLETAS', 'DEAD BUG', 'PLANCHA LATERAL'],
    intermedio:   ['GIRO RUSO CON PESO', 'BICICLETAS', 'DUMBBELL WINDMILL', 'PLANCHA LATERAL'],
    avanzado:     ['PALLOF PRESS EN POLEA', 'DUMBBELL WINDMILL', 'RENEGADE ROW', 'SUITCASE CARRY'],
  },
  C: { // Fuerza, densidad e isometría
    principiante: ['PLANCHA FRONTAL', 'DESLIZAMIENTO EN FITBALL', 'HOLLOW BODY HOLD', 'FARMER CARRY A UNA MANO'],
    intermedio:   ['DESLIZAMIENTO EN FITBALL', 'HOLLOW BODY HOLD', 'FARMER CARRY A UNA MANO', 'PLANCHA FRONTAL'],
    avanzado:     ['AB-WHEEL', 'CRUNCH PESADO EN MAQUINA', 'HOLLOW BODY HOLD', 'FARMER CARRY A UNA MANO'],
  },
  D: { // 4º día opcional (sábado) — solo avanzado: quema/volumen extra
    avanzado:     ['BICICLETAS', 'HOLLOW BODY HOLD', 'V-UP', 'CRUNCH INVERSO'],
  },
};
// dayIndex por enfoque (A/B/C/D). El enfoque D (sábado) solo existe en avanzado.
const ENFOQUES = {
  A: { dayIndex: 1 }, // Día 1 (Lun) — six-pack / definición
  B: { dayIndex: 3 }, // Día 2 (Mié) — V-Shape
  C: { dayIndex: 5 }, // Día 3 (Vie) — core fuerte
  D: { dayIndex: 6 }, // Día 4 (Sáb) — opcional, solo avanzado
};
// Nombres orientados al resultado, cortos, sin jerga. CAMBIAN cada mes (12) para
// que el programa se sienta fresco aunque el contenido sea parecido. Mismos en
// los 3 niveles (varían por mes, no por nivel). D = sábado opcional (avanzado),
// "(opcional)" expuesto solo en el nombre.
const SESSION_TITLES = {
  A: ['Base abdominal', 'Control core', 'Abdomen firme', 'Six-pack', 'Definición', 'Abdomen marcado', 'Línea media', 'Detalle abdominal', 'Abdomen visible', 'Máxima definición', 'Abdomen de élite', 'Six-pack total'],
  B: ['V-Shape', 'Cintura V', 'Línea V', 'V-Cut', 'V-Taper', 'Oblicuos en V', 'Rotación V', 'Cintura sólida', 'V definida', 'V de acero', 'V marcada', 'V-Shape total'],
  C: ['Core fuerte', 'Núcleo sólido', 'Blindaje', 'Core de acero', 'Densidad core', 'Núcleo firme', 'Potencia core', 'Core estable', 'Core total', 'Blindaje total', 'Núcleo de élite', 'Core sin freno'],
  D: Array(12).fill('Quema extra (opcional)'),
};
// Enfoques por nivel: avanzado suma el 4º día (sábado) opcional.
const enfoquesForLevel = (level) => (level === 'avanzado' ? ['A', 'B', 'C', 'D'] : ['A', 'B', 'C']);
const ENFOQUE_ORDER = { A: 0, B: 1, C: 2, D: 3 };

// 4 fases × 3 meses. repSeq = arco de reps de las 4 semanas; hold = duración base (seg).
const PHASES = [
  { name: 'Adaptación',          sets: 3, intensity: '7/10',  reps: '12-15', repSeq: [12, 12, 15, 15], hold: 40, note: 'Técnica perfecta. Controla la fase negativa.' },
  { name: 'Sobrecarga y densidad', sets: 4, intensity: '8/10', reps: '10-12', repSeq: [12, 10, 12, 10], hold: 50, note: 'Sube la carga. Acércate al fallo técnico.' },
  { name: 'Técnicas avanzadas',  sets: 3, intensity: '9/10',  reps: '8-10',  repSeq: [10, 8, 10, 8],   hold: 55, note: 'Última serie drop set: quita 30% y al fallo.' },
  { name: 'Shock y clímax',      sets: 4, intensity: '10/10', reps: 'AMRAP', repSeq: null,             hold: 60, note: 'AMRAP / al fallo. Máxima intensidad.' },
];
const MONTH_THEMES = [
  'Adaptación anatómica', 'Construir base', 'Consolidar el patrón',
  'Sobrecarga progresiva', 'Densidad', 'Volumen efectivo',
  'Drop sets', 'Series mecánicas', 'Intensidad máxima',
  'Shock biomecánico', 'Clímax I', 'Clímax II — AMRAP',
];

const ABS_COURSE_TITLE = 'Código ABS';
const PLAN_TITLE = (lvl) => `Código ABS — ${lvl}`;
const LEVELS = ['principiante', 'intermedio', 'avanzado'];

async function ensureLibrary() {
  const libRef = db.collection('exercises_library').doc(LIB_ID);
  const data = (await libRef.get()).data() || {};
  const byName = {};
  if (data.exercises) for (const [k, v] of Object.entries(data.exercises)) if (v?.displayName) byName[v.displayName.toUpperCase()] = k;
  const nameToKey = {}; const exAdd = {}; const legacyAdd = {};
  for (const [name, ma] of Object.entries(MOVES)) {
    const existing = byName[name.toUpperCase()] || (data[name] ? name : null);
    if (existing) { nameToKey[name] = existing; continue; }
    const key = newId(); nameToKey[name] = key;
    const entry = { muscle_activation: ma, implements: IMPLEMENTS[name] || ['Peso Corporal'], video_url: '', video_source: '', video_path: '', created_at: NOW, updated_at: NOW };
    exAdd[key] = { displayName: name, ...entry };
    legacyAdd[name] = entry;
    log(`  + lib "${name}" -> ${key}`);
  }
  // set(merge) with a NESTED {exercises:{key:...}} object: deep-merges into the
  // existing submap (keeps the 132 entries), nests correctly (no dotted keys),
  // and creates the doc if absent (works in prod AND a fresh emulator).
  if (Object.keys(exAdd).length && WRITE) await libRef.set({ exercises: exAdd, ...legacyAdd }, { merge: true });
  return nameToKey;
}

// 3 ejercicios de un enfoque/nivel para el mes m (ventana rotante sobre el pool).
function pickExercises(enf, level, m) {
  const pool = POOLS[enf][level];
  const out = [];
  for (let i = 0; i < 3; i++) out.push(pool[(m + i) % pool.length]);
  return out;
}
function setsForExercise(name, phase) {
  const out = [];
  for (let s = 0; s < phase.sets; s++) {
    const base = { id: `s${s}`, order: s, title: `Serie ${s + 1}` };
    if (HOLDS.has(name)) out.push({ ...base, duration: phase.hold, reps: null, intensity: null, restSeconds: 60 });
    else out.push({ ...base, reps: phase.reps, intensity: phase.intensity, ...(phase.repSeq ? { rep_sequence: phase.repSeq } : {}), restSeconds: 60 });
  }
  return out;
}

async function seedPlan(level, nameToKey) {
  const q = await db.collection('plans').where('creator_id', '==', FELIPE_UID).where('title', '==', PLAN_TITLE(level)).limit(1).get();
  const planRef = q.empty ? db.collection('plans').doc() : q.docs[0].ref;
  log(`  ${q.empty ? '+' : '·'} plan "${PLAN_TITLE(level)}" -> ${planRef.id}`);
  if (WRITE) {
    await planRef.set({ creator_id: FELIPE_UID, creatorName: 'Felipe Bejarano', title: PLAN_TITLE(level), description: '', discipline: 'fuerza-hipertrofia', updated_at: NOW, ...(q.empty ? { created_at: NOW } : {}) }, { merge: true });
    await db.recursiveDelete(planRef.collection('modules')); // reset months -> rebuild fresh
  }

  for (let m = 0; m < 12; m++) {
    const phase = PHASES[Math.floor(m / 3)];
    const modId = `mes-${m + 1}`;
    const modRef = planRef.collection('modules').doc(modId);
    if (WRITE) await modRef.set({ order: m, title: `Mes ${m + 1} — ${MONTH_THEMES[m]}`, published_at: null, created_at: NOW, updated_at: NOW }, { merge: true });
    for (const enf of enfoquesForLevel(level)) {
      const sRef = modRef.collection('sessions').doc(`enfoque-${enf}`);
      if (WRITE) await sRef.set({ order: ENFOQUE_ORDER[enf], title: SESSION_TITLES[enf][m], dayIndex: ENFOQUES[enf].dayIndex, isRestDay: false, image_url: null, defaultDataTemplate: DEFAULT_DATA_TEMPLATE, notes: phase.note, created_at: NOW, updated_at: NOW }, { merge: true });
      const exs = pickExercises(enf, level, m);
      for (let i = 0; i < exs.length; i++) {
        const name = exs[i]; const key = nameToKey[name];
        if (!key) throw new Error(`No lib key for "${name}"`);
        const exId = `ex${i}`;
        const eRef = sRef.collection('exercises').doc(exId);
        if (WRITE) await eRef.set({ id: exId, order: i, primary: { [LIB_ID]: key }, alternatives: {}, measures: HOLDS.has(name) ? ['duration'] : ['reps', 'weight', 'intensity'], objectives: HOLDS.has(name) ? ['reps', 'previous'] : ['reps', 'intensity', 'previous'], customMeasureLabels: {}, customObjectiveLabels: {}, created_at: NOW, updated_at: NOW }, { merge: true });
        for (const st of setsForExercise(name, phase)) if (WRITE) await eRef.collection('sets').doc(st.id).set({ ...st, created_at: NOW, updated_at: NOW }, { merge: true });
      }
    }
  }
  log(`    12 meses × 3 sesiones (A/B/C) for ${level}`);
  return planRef.id;
}

(async () => {
  log(`\n=== seed-codigo-abs (12 meses) ===  mode=${VALIDATE ? 'validate' : WRITE ? (USING_EMULATOR ? 'WRITE(emu)' : 'WRITE(prod)') : 'dry-run'}\n`);
  const nameToKey = await ensureLibrary();
  if (VALIDATE) {
    const all = []; for (const lv of LEVELS) for (const enf of enfoquesForLevel(lv)) all.push(...POOLS[enf][lv]);
    const missing = [...new Set(all)].filter((n) => !nameToKey[n]);
    if (missing.length) { log('✗ missing:', missing); process.exit(1); }
    log('✓ all pool exercises resolve'); process.exit(0);
  }

  const q = await db.collection('courses').where('creator_id', '==', FELIPE_UID).where('title', '==', ABS_COURSE_TITLE).limit(1).get();
  const courseRef = q.empty ? db.collection('courses').doc() : q.docs[0].ref;
  log(`${q.empty ? '+' : '·'} course "${ABS_COURSE_TITLE}" -> ${courseRef.id}`);

  const levelPlans = {};
  for (const level of LEVELS) levelPlans[level] = await seedPlan(level, nameToKey);

  if (WRITE) await courseRef.set({
    creator_id: FELIPE_UID, creatorName: 'Felipe Bejarano', deliveryType: 'general', title: ABS_COURSE_TITLE,
    discipline: 'fuerza-hipertrofia', status: 'draft', access_duration: 'monthly', block_cadence: 'monthly_first_monday',
    scheduling: 'weekly', weekly: false, weight_suggestions: true, subscription_price: SUB_PRICE,
    image_url: null, image_path: null, video_intro_url: null, description: '', visibility: 'both',
    free_trial: { active: false, duration_days: 0 }, tutorials: { dailyWorkout: [], workoutCompletion: [], workoutExecution: [] },
    availableLibraries: [], content_plan_id: null, version: CONTENT_VERSION, published_version: CONTENT_VERSION,
    levels: { options: LEVELS, default: 'principiante' }, level_plans: levelPlans,
    current_block_index: 0, current_block_id: 'mes-1', updated_at: NOW, last_update: NOW, ...(q.empty ? { created_at: NOW } : {}),
  }, { merge: true });
  log(`\nlevel_plans: ${JSON.stringify(levelPlans)}`);

  if (WRITE) await db.collection('program_state').doc(courseRef.id).set({ current_block_index: 0, current_block_id: 'mes-1', current_block_started_at: NOW, updated_at: NOW }, { merge: true });
  log(`\n${WRITE ? '✓ written (12 meses × 3 niveles)' : 'DRY-RUN'}  course=${courseRef.id}`);
  process.exit(0);
})().catch((e) => { console.error('FATAL', e); process.exit(2); });
