#!/usr/bin/env node
'use strict';

/**
 * Patch NO DESTRUCTIVO para Código ABS (no resetea nada, a diferencia del seed):
 *   1) Renombra títulos de sesión (matriz por mes) en enfoque-A/B/C de los 3 planes
 *      — merge de {title}, preserva order/dayIndex/ejercicios/sets/etc.
 *   2) Agrega enfoque-D (sábado, opcional) a los 12 meses de AVANZADO
 *      (sesión + ejercicios + sets), merge — crea si falta, no toca A/B/C.
 * NO toca el curso shell ni program_state.
 *
 *   NODE_PATH=functions/node_modules node scripts/patch-codigo-abs-names-saturday.js            # dry-run
 *   APPLY_PROD=1 NODE_PATH=functions/node_modules node scripts/patch-codigo-abs-names-saturday.js --write   # PROD
 */
const admin = require('firebase-admin');

const PROJECT_ID = 'wolf-20b8b';
const LIB_ID = 'jeoVyzhUrBeJofT62MOe';
const WRITE = process.argv.includes('--write');

if (process.env.FIRESTORE_EMULATOR_HOST) admin.initializeApp({ projectId: PROJECT_ID });
else if (process.env.APPLY_PROD === '1') admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId: PROJECT_ID });
else if (WRITE) { console.error('Refusing prod --write without APPLY_PROD=1.'); process.exit(1); }
else admin.initializeApp({ projectId: PROJECT_ID });

const db = admin.firestore();
const NOW = admin.firestore.FieldValue.serverTimestamp();

const PLANS = {
  principiante: 'T36ekPP74xxXGvzcEeTD',
  intermedio: 'SJZ3Exve41jBmt20V6m2',
  avanzado: 'dCvTp1BW2Yc5lomXCE9x',
};

// Nombres por mes (mes-1..mes-12), iguales en los 3 niveles. Misma matriz que el seed.
const SESSION_TITLES = {
  A: ['Base abdominal', 'Control core', 'Abdomen firme', 'Six-pack', 'Definición', 'Abdomen marcado', 'Línea media', 'Detalle abdominal', 'Abdomen visible', 'Máxima definición', 'Abdomen de élite', 'Six-pack total'],
  B: ['V-Shape', 'Cintura V', 'Línea V', 'V-Cut', 'V-Taper', 'Oblicuos en V', 'Rotación V', 'Cintura sólida', 'V definida', 'V de acero', 'V marcada', 'V-Shape total'],
  C: ['Core fuerte', 'Núcleo sólido', 'Blindaje', 'Core de acero', 'Densidad core', 'Núcleo firme', 'Potencia core', 'Core estable', 'Core total', 'Blindaje total', 'Núcleo de élite', 'Core sin freno'],
};

// Sábado (solo avanzado) — enfoque-D, dayIndex 6
const D_POOL = ['BICICLETAS', 'HOLLOW BODY HOLD', 'V-UP', 'CRUNCH INVERSO'];
const HOLDS = new Set(['HOLLOW BODY HOLD']); // único hold del pool D
const PHASES = [
  { sets: 3, intensity: '7/10', reps: '12-15', repSeq: [12, 12, 15, 15], hold: 40, note: 'Técnica perfecta. Controla la fase negativa.' },
  { sets: 4, intensity: '8/10', reps: '10-12', repSeq: [12, 10, 12, 10], hold: 50, note: 'Sube la carga. Acércate al fallo técnico.' },
  { sets: 3, intensity: '9/10', reps: '8-10', repSeq: [10, 8, 10, 8], hold: 55, note: 'Última serie drop set: quita 30% y al fallo.' },
  { sets: 4, intensity: '10/10', reps: 'AMRAP', repSeq: null, hold: 60, note: 'AMRAP / al fallo. Máxima intensidad.' },
];
const DEFAULT_DATA_TEMPLATE = {
  customMeasureLabels: {}, customObjectiveLabels: {},
  measures: ['reps', 'weight', 'intensity'], objectives: ['reps', 'intensity', 'previous'],
};

async function libKeys() {
  const data = (await db.collection('exercises_library').doc(LIB_ID).get()).data() || {};
  const byName = {};
  if (data.exercises) for (const [k, v] of Object.entries(data.exercises)) if (v?.displayName) byName[v.displayName.toUpperCase()] = k;
  const map = {};
  for (const n of D_POOL) {
    const key = byName[n.toUpperCase()] || (data[n] ? n : null);
    if (!key) throw new Error(`No lib key for "${n}"`);
    map[n] = key;
  }
  return map;
}

function setsFor(name, phase) {
  const out = [];
  for (let s = 0; s < phase.sets; s++) {
    const base = { id: `s${s}`, order: s, title: `Serie ${s + 1}` };
    if (HOLDS.has(name)) out.push({ ...base, duration: phase.hold, reps: null, intensity: null, restSeconds: 60 });
    else out.push({ ...base, reps: phase.reps, intensity: phase.intensity, ...(phase.repSeq ? { rep_sequence: phase.repSeq } : {}), restSeconds: 60 });
  }
  return out;
}
const pickD = (m) => [0, 1, 2].map((i) => D_POOL[(m + i) % D_POOL.length]);

(async () => {
  console.log(`\npatch-codigo-abs ${WRITE ? '(WRITE prod)' : '(DRY-RUN)'}\n`);

  // 1) Renombrar A/B/C (merge solo title) en los 3 planes × 12 meses
  let renamed = 0;
  for (const [lvl, planId] of Object.entries(PLANS)) {
    for (let m = 0; m < 12; m++) {
      for (const enf of ['A', 'B', 'C']) {
        const ref = db.collection('plans').doc(planId).collection('modules').doc(`mes-${m + 1}`).collection('sessions').doc(`enfoque-${enf}`);
        if (WRITE) await ref.set({ title: SESSION_TITLES[enf][m], updated_at: NOW }, { merge: true });
        renamed++;
      }
    }
    console.log(`  · ${lvl}: 36 títulos`);
  }
  console.log(`  ${WRITE ? 'renombrados' : 'renombraría'} ${renamed} títulos (A/B/C × 12 × 3 planes)\n`);

  // 2) Sábado enfoque-D solo en avanzado
  const keys = await libKeys();
  console.log(`  D lib keys: ${JSON.stringify(keys)}`);
  const planId = PLANS.avanzado;
  let dCount = 0;
  for (let m = 0; m < 12; m++) {
    const phase = PHASES[Math.floor(m / 3)];
    const sRef = db.collection('plans').doc(planId).collection('modules').doc(`mes-${m + 1}`).collection('sessions').doc('enfoque-D');
    if (WRITE) await sRef.set({ order: 3, title: 'Quema extra (opcional)', dayIndex: 6, isRestDay: false, image_url: null, defaultDataTemplate: DEFAULT_DATA_TEMPLATE, notes: phase.note, created_at: NOW, updated_at: NOW }, { merge: true });
    const exs = pickD(m);
    for (let i = 0; i < exs.length; i++) {
      const name = exs[i]; const key = keys[name];
      const exId = `ex${i}`;
      const eRef = sRef.collection('exercises').doc(exId);
      if (WRITE) await eRef.set({ id: exId, order: i, primary: { [LIB_ID]: key }, alternatives: {}, measures: HOLDS.has(name) ? ['duration'] : ['reps', 'weight', 'intensity'], objectives: HOLDS.has(name) ? ['reps', 'previous'] : ['reps', 'intensity', 'previous'], customMeasureLabels: {}, customObjectiveLabels: {}, created_at: NOW, updated_at: NOW }, { merge: true });
      for (const st of setsFor(name, phase)) if (WRITE) await eRef.collection('sets').doc(st.id).set({ ...st, created_at: NOW, updated_at: NOW }, { merge: true });
    }
    dCount++;
  }
  console.log(`  ${WRITE ? 'escritas' : 'escribiría'} ${dCount} sesiones enfoque-D (sábado, avanzado)`);
  console.log(`\n${WRITE ? '✓ patch aplicado' : 'DRY-RUN ok'}\n`);
  process.exit(0);
})().catch((e) => { console.error('FATAL', e); process.exit(2); });
