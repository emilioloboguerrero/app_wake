#!/usr/bin/env node
'use strict';

/**
 * Idempotent multi-phase update for Método Bejarano:
 *
 *   1. Create 3 new library exercises (CRUNCH DECLINADO, JALÓN AL PECHO UNILATERAL,
 *      PRESS MILITAR EN SMITH MACHINE) with their video_url.
 *   2. Assign video_url to 21 existing library exercises (subMap + legacy).
 *   3. Replace 2 plan exercises:
 *        - M3 Empuje:  VUELOS PARA PECTORAL CON MANCUERNAS  →  PEC DEC
 *        - M2 Superior: VUELOS INVERTIDOS EN MÁQUINA        →  VUELOS INVERTIDOS CON MANCUERNA
 *   4. Append 1 abdominal exercise at the end of every session in M1..M4 (20 sessions),
 *      rotating across CRUNCH DECLINADO, CRUNCH EN CABLE, ELEVACIONES DE PIERNAS (ABS).
 *      Skip if a session already has one of those at the end (idempotent re-run).
 *
 * Dry-run by default. Apply with APPLY=1.
 * Usage: NODE_PATH=functions/node_modules APPLY=0 node scripts/apply-bejarano-videos-and-abs.js
 */

const admin = require('firebase-admin');

const PROJECT_ID = 'wolf-20b8b';
const COURSE_ID = 'NTQIWMZBOxntwmUiXQZp';
const LIB_ID = 'jeoVyzhUrBeJofT62MOe';
const APPLY = process.env.APPLY === '1';

admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId: PROJECT_ID });
const db = admin.firestore();

// -------- Phase 1: new library exercises ----------
const NEW_EXERCISES = [
  {
    placeholder: 'CRUNCH_DECLINADO',
    displayName: 'CRUNCH DECLINADO',
    video_url: 'https://youtube.com/shorts/qbQO8sIW__o',
    muscle_activation: { abs: 100, obliques: 90, lower_back: 20 },
    implements: ['Peso Corporal'],
  },
  {
    placeholder: 'JALON_UNILATERAL',
    displayName: 'JALÓN AL PECHO UNILATERAL',
    video_url: 'https://youtube.com/shorts/Z-ZLo79trC0',
    muscle_activation: { lats: 100, biceps: 40, rear_delts: 30, traps: 20 },
    implements: ['Polea'],
  },
  {
    placeholder: 'PRESS_MILITAR_SMITH',
    displayName: 'PRESS MILITAR EN SMITH MACHINE',
    video_url: 'https://youtube.com/shorts/9W3hd8SRADg',
    muscle_activation: { front_delts: 100, side_delts: 60, triceps: 40, upper_chest: 20 },
    implements: ['Máquina Smith'],
  },
];

// -------- Phase 2: assign videos to existing library entries ----------
const VIDEO_ASSIGNMENTS = [
  // [libKey, displayName (for legacy key), video_url]
  ['8hsR8FEHmzXtbdX212P0', 'ABDUCCIÓN DE CADERA SENTADO EN MÁQUINA', 'https://youtube.com/shorts/CNjQhxDIc-w'],
  ['MSraEoAeWwZMjwvcH3Eu', 'PEC DEC (APERTURAS EN MÁQUINA)',          'https://youtube.com/shorts/gRHSqxBd12Q'],
  ['RjcVedX9zUmGZGzcZIwS', 'CURL DE BÍCEPS INCLINADO',                'https://youtube.com/shorts/D-qw97XTrkA'],
  ['qoJ763RPCYF2lRZaKsoQ', 'PRESS DE BANCA INCLINADO CON MANCUERNAS', 'https://youtube.com/shorts/-xJqnVuoX8M'],
  ['3qCzKVBxIUS4fAmEOVZ4', 'CRUNCH EN CABLE',                          'https://youtube.com/shorts/iJ9oJjZFFV4'],
  ['De1fjw3BcrEN4vN7lwT9', 'CURL DE BÍCEPS EN BARRA',                  'https://youtube.com/shorts/dX4fkJofB00'],
  ['q4AnYsS1RY6HbFJBPdCA', 'CURL DE BÍCEPS MARTILLO',                  'https://youtube.com/shorts/XqeG9xSO4f0'],
  ['yPmeRXKI9eXNC9fuq291', 'CURL DE BÍCEPS BAYESIAN',                  'https://youtube.com/shorts/KjvseB1E8_4'],
  ['CfI3apmrYRjsCr7DQsxf', 'ELEVACIONES DE PIERNAS (ABS)',             'https://youtube.com/shorts/cmA18K-T0Zk'],
  ['7qGPNvWXW88oIUdWGnWL', 'VUELOS INVERTIDOS CON MANCUERNA',          'https://youtube.com/shorts/vOoCvWy3wOU'],
  ['RTouYZQLAEoQ9nhxhaEr', 'JALÓN AL PECHO AGARRE AMPLIO (PULL DOWN)', 'https://youtube.com/shorts/GgMMrrvB1Ts'],
  ['haKIClVsDggOSoshwVxt', 'PRESS MILITAR EN MÁQUINA',                 'https://youtube.com/shorts/2pco4qClNX4'],
  ['mgp6tyIVwxVE5mXgznpX', 'EXTENSION DE CUADRICEPS',                  'https://youtube.com/shorts/rFYe8fjqA5w'],
  ['tOHbgYOgFnurnN86f2eU', 'CURL DE PIERNA SENTADO',                   'https://youtube.com/shorts/FcEwTb6khco'],
  ['L5Lx7MVpY6wyxC2JXfQV', 'PRESS FRANCES CON MANCUERNAS',             'https://youtube.com/shorts/kBl6dr4I7fI'],
  ['lVQlAzdR7wsqOTnKGMOW', 'PULL OVER EN POLEA',                       'https://youtube.com/shorts/qanBYpZJL94'],
  ['2ihv3R2crY3gIE1kTd4n', 'REMO EN CABLE AGARRE NEUTRO',              'https://youtube.com/shorts/84kgXVExIOI'],
  ['hQpacsv2hS5uXUK5O05E', 'REMO CON APOYO EN PECHO EN MÁQUINA',       'https://youtube.com/shorts/zEL_pf1ne0E'],
  ['DDKffK1Lkd4WBiUVU0Bk', 'SEAL ROW',                                  'https://youtube.com/shorts/c3DXopqR7V8'],
  ['ofJSLJQOrdDrTGMsqmOQ', 'PRENSA DE PIERNA',                          'https://youtube.com/shorts/dr7Ccd_etvo'],
  ['kUVJHnuuySUfMR7KDQZw', 'HIP THRUST CON BARRA',                      'https://youtube.com/shorts/KlC0Y5GA1XQ'],
];

// -------- Phase 3: replacements ----------
// Format: { moduleId, sessionId, fromKey, toKey }
const REPLACEMENTS = [
  {
    label: 'M3 Empuje: VUELOS PECTORAL MANCUERNAS → PEC DEC',
    moduleId: '7Rt7Zryp7Gf3KWH79htO',
    sessionId: 'OE4T7s4u8fJtIaSrwBBT',
    fromKey: 'SvoQj7PeUHoaqUMpyGLN',
    toKey: 'MSraEoAeWwZMjwvcH3Eu',
  },
  {
    label: 'M2 Superior: VUELOS INVERTIDOS EN MÁQUINA → VUELOS INVERTIDOS CON MANCUERNA',
    moduleId: '49HKARanZMsdoW7p7yC4',
    sessionId: 'Zzeo2XA6rsF0cvr03ljJ',
    fromKey: 'Ti7UWZeoROKQTNH0aVxy',
    toKey: '7qGPNvWXW88oIUdWGnWL',
  },
];

// -------- Phase 4: abdominal rotation ----------
// Three slots; each row = one module's 5 sessions (Empuje, Jalón, Quads, Superior, Posterior).
// Rotate so the same day doesn't repeat the same ab across months.
const AB_KEYS = {
  CRUNCH_DECLINADO_PLACEHOLDER: 'placeholder will be replaced after Phase 1',
  CRUNCH_EN_CABLE: '3qCzKVBxIUS4fAmEOVZ4',
  ELEVACIONES_DE_PIERNAS: 'CfI3apmrYRjsCr7DQsxf',
};

// Module ordinal → rotation pattern (will be filled with real key after Phase 1 creates CRUNCH DECLINADO)
const AB_ROTATION_BY_MONTH = {
  0: ['CD', 'CC', 'EP', 'CD', 'CC'], // M1: Empuje, Jalón, Quads, Superior, Posterior
  1: ['CC', 'EP', 'CD', 'CC', 'EP'], // M2
  2: ['EP', 'CD', 'CC', 'EP', 'CD'], // M3
  3: ['CD', 'CC', 'EP', 'CD', 'CC'], // M4 (same as M1)
};

const AB_SETS_BY_MONTH = {
  0: { count: 3, reps: '15', repSequence: [15, 15, 12, 20], rest: 60 },
  1: { count: 4, reps: '20', repSequence: [20, 20, 15, 25], rest: 45 },
  2: { count: 3, reps: '15', repSequence: [15, 15, 12, 20], rest: 45 },
  3: { count: 3, reps: '15', repSequence: [15, 15, 12, 20], rest: 60 },
};

const NOW = admin.firestore.FieldValue.serverTimestamp();

function log(...args) { console.log(...args); }
async function maybe(promiseFactory, msg) {
  if (APPLY) {
    await promiseFactory();
    log(`   ✓ APPLIED: ${msg}`);
  } else {
    log(`   ◇ DRY-RUN: ${msg}`);
  }
}

(async () => {
  log(`\n=== apply-bejarano-videos-and-abs ===  APPLY=${APPLY ? 'YES' : 'no'}  project=${PROJECT_ID}\n`);

  // -------- Phase 1 --------
  log('--- Phase 1: create new library exercises ---');
  const libRef = db.collection('exercises_library').doc(LIB_ID);
  const libSnap = await libRef.get();
  const libData = libSnap.data() || {};
  const placeholderToKey = {};
  for (const ex of NEW_EXERCISES) {
    // Check if already exists by displayName in either shape
    let existingKey = null;
    if (libData.exercises) {
      for (const [k, v] of Object.entries(libData.exercises)) {
        if ((v?.displayName || '').toUpperCase() === ex.displayName.toUpperCase()) { existingKey = k; break; }
      }
    }
    if (!existingKey && libData[ex.displayName]) existingKey = ex.displayName;

    if (existingKey) {
      log(` already exists "${ex.displayName}" → ${existingKey} (will reuse, ensure video_url)`);
      placeholderToKey[ex.placeholder] = existingKey;
      await maybe(
        () => libRef.update({
          [`exercises.${existingKey}.video_url`]: ex.video_url,
          [`exercises.${existingKey}.video_source`]: 'youtube',
          [`exercises.${existingKey}.updated_at`]: NOW,
          [`${ex.displayName}.video_url`]: ex.video_url,
          [`${ex.displayName}.video_source`]: 'youtube',
          [`${ex.displayName}.updated_at`]: NOW,
        }),
        `set video_url on existing ${existingKey}`,
      );
      continue;
    }

    const newKey = libRef.collection('_ids').doc().id; // 20-char Firestore-style ID
    placeholderToKey[ex.placeholder] = newKey;
    log(` create "${ex.displayName}" → newKey=${newKey}`);
    const subMapEntry = {
      displayName: ex.displayName,
      muscle_activation: ex.muscle_activation,
      implements: ex.implements,
      video_url: ex.video_url,
      video_source: 'youtube',
      video_path: '',
      created_at: NOW,
      updated_at: NOW,
    };
    const legacyEntry = {
      muscle_activation: ex.muscle_activation,
      implements: ex.implements,
      video_url: ex.video_url,
      video_source: 'youtube',
      video_path: '',
      created_at: NOW,
      updated_at: NOW,
    };
    await maybe(
      () => libRef.update({
        [`exercises.${newKey}`]: subMapEntry,
        [ex.displayName]: legacyEntry,
      }),
      `create library entries (subMap + legacy) for ${ex.displayName}`,
    );
  }

  // Resolve placeholder for CRUNCH DECLINADO key now
  const CRUNCH_DECLINADO_KEY = placeholderToKey['CRUNCH_DECLINADO'];

  // -------- Phase 2 --------
  log('\n--- Phase 2: assign video_url to 21 existing library exercises ---');
  for (const [key, displayName, videoUrl] of VIDEO_ASSIGNMENTS) {
    const subMapHasIt = !!libData.exercises?.[key];
    const legacyHasIt = !!libData[displayName];
    if (!subMapHasIt && !legacyHasIt) {
      log(` WARN: ${displayName} (${key}) — neither subMap nor legacy entry found. SKIP.`);
      continue;
    }
    const updates = {};
    if (subMapHasIt) {
      updates[`exercises.${key}.video_url`] = videoUrl;
      updates[`exercises.${key}.video_source`] = 'youtube';
      updates[`exercises.${key}.updated_at`] = NOW;
    }
    if (legacyHasIt) {
      updates[`${displayName}.video_url`] = videoUrl;
      updates[`${displayName}.video_source`] = 'youtube';
      updates[`${displayName}.updated_at`] = NOW;
    }
    await maybe(() => libRef.update(updates), `${displayName} ← ${videoUrl}`);
  }

  // -------- Phase 3 --------
  log('\n--- Phase 3: replace exercises in plan ---');
  for (const r of REPLACEMENTS) {
    const exColRef = db.collection(`courses/${COURSE_ID}/modules/${r.moduleId}/sessions/${r.sessionId}/exercises`);
    const exSnap = await exColRef.get();
    const target = exSnap.docs.find((d) => (d.data().primary || {})[LIB_ID] === r.fromKey);
    if (!target) {
      // Already replaced?
      const alreadyDone = exSnap.docs.find((d) => (d.data().primary || {})[LIB_ID] === r.toKey);
      if (alreadyDone) log(` ${r.label} — already replaced, skipping`);
      else log(` ${r.label} — fromKey NOT found, skipping`);
      continue;
    }
    log(` ${r.label}  (exDocId=${target.id})`);
    await maybe(
      () => target.ref.update({
        [`primary.${LIB_ID}`]: r.toKey,
        updated_at: NOW,
      }),
      `set primary.${LIB_ID} = ${r.toKey}`,
    );
  }

  // -------- Phase 4 --------
  log('\n--- Phase 4: append 1 abdominal at the end of each session ---');
  const moduleSnap = await db.collection(`courses/${COURSE_ID}/modules`).orderBy('order', 'asc').get();
  for (const modDoc of moduleSnap.docs) {
    const mOrder = modDoc.data().order;
    const mTitle = modDoc.data().title;
    const rotation = AB_ROTATION_BY_MONTH[mOrder];
    const setSpec = AB_SETS_BY_MONTH[mOrder];
    if (!rotation || !setSpec) { log(` skip module order=${mOrder} (no rotation defined)`); continue; }

    const sessSnap = await modDoc.ref.collection('sessions').orderBy('order', 'asc').get();
    for (let i = 0; i < sessSnap.docs.length; i++) {
      const sDoc = sessSnap.docs[i];
      const sTitle = sDoc.data().title;
      const slotCode = rotation[i];
      const abKey = slotCode === 'CD' ? CRUNCH_DECLINADO_KEY
                  : slotCode === 'CC' ? AB_KEYS.CRUNCH_EN_CABLE
                  : slotCode === 'EP' ? AB_KEYS.ELEVACIONES_DE_PIERNAS : null;
      if (!abKey) { log(`  skip ${mTitle}/${sTitle} (unknown slot ${slotCode})`); continue; }

      const exSnap = await sDoc.ref.collection('exercises').orderBy('order', 'asc').get();
      const abPrimaryKeys = new Set([CRUNCH_DECLINADO_KEY, AB_KEYS.CRUNCH_EN_CABLE, AB_KEYS.ELEVACIONES_DE_PIERNAS]);
      const alreadyHasAb = exSnap.docs.some((d) => abPrimaryKeys.has((d.data().primary || {})[LIB_ID]));
      if (alreadyHasAb) {
        log(`  ${mTitle} / ${sTitle}: already has an ab, skip`);
        continue;
      }
      const lastOrder = exSnap.docs.length
        ? Math.max(...exSnap.docs.map((d) => d.data().order ?? -1))
        : -1;
      const newOrder = lastOrder + 1;
      const others = [CRUNCH_DECLINADO_KEY, AB_KEYS.CRUNCH_EN_CABLE, AB_KEYS.ELEVACIONES_DE_PIERNAS].filter((k) => k !== abKey);

      log(`  ${mTitle} / ${sTitle}: append [${slotCode}=${abKey}] order=${newOrder}`);

      const exDocRef = sDoc.ref.collection('exercises').doc();
      const exData = {
        order: newOrder,
        primary: { [LIB_ID]: abKey },
        alternatives: { [LIB_ID]: others },
        measures: ['reps', 'weight', 'intensity'],
        objectives: ['reps', 'intensity', 'previous'],
        customMeasureLabels: {},
        customObjectiveLabels: {},
        created_at: NOW,
        updated_at: NOW,
      };
      await maybe(async () => {
        await exDocRef.set(exData);
        // Create sets
        for (let setIdx = 0; setIdx < setSpec.count; setIdx++) {
          const setRef = exDocRef.collection('sets').doc();
          await setRef.set({
            order: setIdx,
            title: `Serie ${setIdx + 1}`,
            reps: setSpec.reps,
            intensity: '7/10',
            restSeconds: setSpec.rest,
            rep_sequence: setSpec.repSequence,
            created_at: NOW,
          });
        }
      }, `create exercise doc + ${setSpec.count} sets`);
    }
  }

  log(`\nDone. APPLY=${APPLY ? 'YES (changes written)' : 'no (dry-run only)'}`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
