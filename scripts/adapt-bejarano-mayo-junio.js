#!/usr/bin/env node
'use strict';

/**
 * Temporal adaptation for Mayo (M1 + M4) and Junio (M2) so every exercise in those
 * months has a video. Julio (M3) is intentionally NOT touched — espera videos completos.
 *
 * Strategy: for each exercise without video_url, swap primary[LIB_ID] to a fallback
 * that DOES have video. If all fallbacks would duplicate an exercise already in the
 * same session, the original is deleted (and its sets cascaded).
 *
 * Phase 0: assume video #11 = ELEVACIONES LATERALES MANCUERNA, #15 = PRESS MÁQ PLANO
 *           (provisional — flip later if Felipe says different).
 *
 * Dry-run by default. APPLY=1 to write.
 */

const admin = require('firebase-admin');

const PROJECT_ID = 'wolf-20b8b';
const COURSE_ID = 'NTQIWMZBOxntwmUiXQZp';
const LIB_ID = 'jeoVyzhUrBeJofT62MOe';
const APPLY = process.env.APPLY === '1';

admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId: PROJECT_ID });
const db = admin.firestore();

// Modules to touch (Mayo + Junio) — leave M3 (Julio) alone
const TARGET_MODULES = new Set([
  'AHSaID03k5K1Cq3qNcIw', // M1 — Base (Mayo)
  '5AzbfP4fAyUeG4tiOTUD', // M4 — Mayo
  '49HKARanZMsdoW7p7yC4', // M2 — Volumen (Junio)
]);

// ---------- Phase 0: provisional video assignments ----------
const PROVISIONAL_VIDEOS = [
  ['pKQWf5ojChxE5HPflIW4', 'ELEVACIONES LATERALES DE HOMBRO MANCUERNA', 'https://youtube.com/shorts/vAvj29fVnb0'],
  ['71oOvCCO2Rc7sZjd8lRI', 'PRESS EN MÁQUINA PLANO',                    'https://youtube.com/shorts/CD7OI48jGko'],
];

// ---------- Fallback map: libKey → ordered list of replacement libKeys ----------
// `null` means delete the exercise (no equivalent with video exists).
const FALLBACKS = {
  // Squat patterns (extended with HIP THRUST + ABDUCCIÓN as last-resort to avoid empty leg days)
  'q7J4Z2CLWLFdfgVTTe9A': ['ofJSLJQOrdDrTGMsqmOQ', 'mgp6tyIVwxVE5mXgznpX', 'kUVJHnuuySUfMR7KDQZw', '8hsR8FEHmzXtbdX212P0'], // SENTADILLA TRASERA
  'OdL4xrrRdOQQ68RMfRx3': ['ofJSLJQOrdDrTGMsqmOQ', 'mgp6tyIVwxVE5mXgznpX', 'kUVJHnuuySUfMR7KDQZw', '8hsR8FEHmzXtbdX212P0'], // SENTADILLA HACK
  'wMDmdeZJC7tOQvQgHxwt': ['mgp6tyIVwxVE5mXgznpX', 'ofJSLJQOrdDrTGMsqmOQ', 'kUVJHnuuySUfMR7KDQZw', '8hsR8FEHmzXtbdX212P0'], // SISSY SQUAT
  'xS6mPWedG9T83mT2lh8S': ['ofJSLJQOrdDrTGMsqmOQ', 'mgp6tyIVwxVE5mXgznpX', '8hsR8FEHmzXtbdX212P0'],                         // PRENSA UNI
  'OREdF6L718owGlPbIpNJ': ['ofJSLJQOrdDrTGMsqmOQ', 'mgp6tyIVwxVE5mXgznpX', 'kUVJHnuuySUfMR7KDQZw', '8hsR8FEHmzXtbdX212P0'], // ESTOCADA CAMINANDO
  'cqBLjH7Fm4DxIH3ZxlL0': ['8hsR8FEHmzXtbdX212P0'],                                                                          // ELEV TALÓN EXT → ABDUCCIÓN (sustituto débil)
  'H7jqP5vHaFwPawtvAbwn': ['8hsR8FEHmzXtbdX212P0'],                                                                          // ELEV TALÓN FLEX → ABDUCCIÓN

  // Bench / chest pressing
  '7iP8iaYU499RhFWYU4fO': ['qoJ763RPCYF2lRZaKsoQ', 'MSraEoAeWwZMjwvcH3Eu'],                 // PRESS BANCA PLANA (barra)
  'OrtgwiLRb8bu1paOzRpP': ['qoJ763RPCYF2lRZaKsoQ', 'MSraEoAeWwZMjwvcH3Eu'],                 // PRESS BANCA INCLINADO (barra)
  'vWeVbPk83AugI7lPYI8G': ['qoJ763RPCYF2lRZaKsoQ', 'MSraEoAeWwZMjwvcH3Eu'],                 // PRESS MÁQ INCLINADO
  'CdwFxpUCcHzzDmNicaBO': ['MSraEoAeWwZMjwvcH3Eu', 'qoJ763RPCYF2lRZaKsoQ'],                 // VUELOS POLEA ARRIBA-ABAJO

  // Shoulder pressing
  'RQ9umdgKc5WvO8ofTED7': ['haKIClVsDggOSoshwVxt', 'sqMOVOo0dIbDQjgr1dFB'],                 // PRESS MIL BARRA SENTADO
  'nuuNvx8ChxZt9EtBHkup': ['haKIClVsDggOSoshwVxt', 'sqMOVOo0dIbDQjgr1dFB'],                 // PRESS MIL MANC SENTADO
  'qYrKmSzXsycaFP2ahWwJ': ['sqMOVOo0dIbDQjgr1dFB', 'haKIClVsDggOSoshwVxt'],                 // PRESS MIL MANC PARADO

  // Lateral / posterior
  'c1PBvmJ27YibxA2D8mVQ': ['pKQWf5ojChxE5HPflIW4'],                                          // ELEV LATERAL CABLE → MANCUERNA

  // Pulls
  'Aye4DrXK3U1OgOGlFpqk': ['RTouYZQLAEoQ9nhxhaEr', 'lVQlAzdR7wsqOTnKGMOW', 'u4bjBzuTC624kytl2JGp'], // DOMINADA PRONO
  'A8tmt7eqQs28ghSSlqmF': ['RTouYZQLAEoQ9nhxhaEr', 'lVQlAzdR7wsqOTnKGMOW', 'u4bjBzuTC624kytl2JGp'], // CHIN UPS
  'NaocISX76GUIbQflhhdD': ['RTouYZQLAEoQ9nhxhaEr', 'lVQlAzdR7wsqOTnKGMOW', 'u4bjBzuTC624kytl2JGp'], // DOMINADA NEUTRA
  'wg1q02AdfZQPSL2LBvTN': ['RTouYZQLAEoQ9nhxhaEr', 'lVQlAzdR7wsqOTnKGMOW', 'u4bjBzuTC624kytl2JGp'], // JALÓN CERRADO
  'h8FOINldOEjsaWdGRIGU': ['RTouYZQLAEoQ9nhxhaEr', 'lVQlAzdR7wsqOTnKGMOW', 'u4bjBzuTC624kytl2JGp'], // JALÓN POLEA SUPINA

  // Rows
  'kuEfJ1fj3OBojrBSITt9': ['DDKffK1Lkd4WBiUVU0Bk', 'hQpacsv2hS5uXUK5O05E', '2ihv3R2crY3gIE1kTd4n'], // REMO BARRA HORIZONTAL
  'wb2oC1g4VrLzi4xwsoda': ['DDKffK1Lkd4WBiUVU0Bk', 'hQpacsv2hS5uXUK5O05E', '2ihv3R2crY3gIE1kTd4n'], // REMO UNI MANC
  'DIvGiDU89H7Bdmo746Pc': ['2ihv3R2crY3gIE1kTd4n', 'DDKffK1Lkd4WBiUVU0Bk', 'hQpacsv2hS5uXUK5O05E'], // REMO CABLE ABIERTO
  'aAIZ4q0dnargwUul2rWn': ['2ihv3R2crY3gIE1kTd4n', 'DDKffK1Lkd4WBiUVU0Bk', 'hQpacsv2hS5uXUK5O05E'], // REMO CABLE CERRADO

  // Arms
  'uUPeDXYb9lq1JNYR5aPE': ['L5Lx7MVpY6wyxC2JXfQV'],                                          // TRICEP PUSH DOWN
  'XNu3ZYXuqYXzh8gi8SpQ': ['L5Lx7MVpY6wyxC2JXfQV'],                                          // EXT TRICEPS SOBRE CABEZA
  'jpBMXLmpRXiRuSTx7UVv': ['RjcVedX9zUmGZGzcZIwS', 'yPmeRXKI9eXNC9fuq291', 'q4AnYsS1RY6HbFJBPdCA'], // CURL SPIDERMAN

  // Posterior chain (extended)
  'drgddxMswyPUo6Dtn5Na': ['kUVJHnuuySUfMR7KDQZw', 'tOHbgYOgFnurnN86f2eU', '8hsR8FEHmzXtbdX212P0', 'ofJSLJQOrdDrTGMsqmOQ'], // PESO MUERTO RUMANO
  'zyxV7iivVuM3lUraRAsv': ['kUVJHnuuySUfMR7KDQZw', 'tOHbgYOgFnurnN86f2eU', '8hsR8FEHmzXtbdX212P0', 'ofJSLJQOrdDrTGMsqmOQ'], // PESO MUERTO
  '67g35B5EUJ3JN19eNc7p': ['kUVJHnuuySUfMR7KDQZw', 'tOHbgYOgFnurnN86f2eU', '8hsR8FEHmzXtbdX212P0'],                          // HIP THRUST MÁQ
  'Fe1ncsIIA9MAAEANc0Lr': ['kUVJHnuuySUfMR7KDQZw', 'tOHbgYOgFnurnN86f2eU', '8hsR8FEHmzXtbdX212P0'],                          // HIP THRUST UNI
  'wyHrCgeyBvxm2rhlWpMw': ['kUVJHnuuySUfMR7KDQZw', 'tOHbgYOgFnurnN86f2eU', '8hsR8FEHmzXtbdX212P0'],                          // GLUTE HAM
  'vInhCwQUIxSLvtXSjpWN': ['kUVJHnuuySUfMR7KDQZw', 'tOHbgYOgFnurnN86f2eU', '8hsR8FEHmzXtbdX212P0'],                          // PULL THROUGH
  'BStSRy6RXRD3KOQdwe9y': ['tOHbgYOgFnurnN86f2eU', 'kUVJHnuuySUfMR7KDQZw'],                                                  // CURL PIERNA ACOSTADO
  'qDImVDFwQDseCnAVKmb5': ['tOHbgYOgFnurnN86f2eU', 'kUVJHnuuySUfMR7KDQZw'],                                                  // CURL PIERNA ACOSTADO UNI
  'EsXECZHIYrwAP0IWRQoc': ['8hsR8FEHmzXtbdX212P0', 'kUVJHnuuySUfMR7KDQZw'],                                                  // PATADA GLÚTEO POLEA
  '21ToISAdrlcNPDPUAWmC': ['kUVJHnuuySUfMR7KDQZw', '8hsR8FEHmzXtbdX212P0', 'tOHbgYOgFnurnN86f2eU'],                          // HIPEREXTENSIÓN 45°
};

const META = new Set(['creator_id', 'creator_name', 'title', 'created_at', 'updated_at', 'icon', 'exercises']);
const NOW = admin.firestore.FieldValue.serverTimestamp();

function log(...a) { console.log(...a); }

(async () => {
  log(`\n=== adapt-bejarano-mayo-junio ===  APPLY=${APPLY ? 'YES' : 'no'}  project=${PROJECT_ID}\n`);

  // Load library to know which keys have video
  const libRef = db.collection('exercises_library').doc(LIB_ID);
  const libSnap = await libRef.get();
  const libData = libSnap.data() || {};
  const hasVideoByKey = new Map();
  const nameByKey = new Map();
  if (libData.exercises) {
    for (const [k, v] of Object.entries(libData.exercises)) {
      hasVideoByKey.set(k, !!(v?.video_url || v?.videoUrl));
      nameByKey.set(k, v?.displayName || v?.name || k);
    }
  }
  for (const k of Object.keys(libData)) {
    if (META.has(k)) continue;
    const v = libData[k];
    if (v && typeof v === 'object' && !hasVideoByKey.has(k)) {
      hasVideoByKey.set(k, !!v.video_url);
      nameByKey.set(k, v.name || k);
    }
  }

  // ----- Phase 0 -----
  log('--- Phase 0: provisional video assignments (#11, #15) ---');
  for (const [key, displayName, videoUrl] of PROVISIONAL_VIDEOS) {
    const updates = {};
    if (libData.exercises?.[key]) {
      updates[`exercises.${key}.video_url`] = videoUrl;
      updates[`exercises.${key}.video_source`] = 'youtube';
      updates[`exercises.${key}.updated_at`] = NOW;
    }
    if (libData[displayName]) {
      updates[`${displayName}.video_url`] = videoUrl;
      updates[`${displayName}.video_source`] = 'youtube';
      updates[`${displayName}.updated_at`] = NOW;
    }
    log(` ${displayName} ← ${videoUrl}`);
    if (APPLY) await libRef.update(updates);
    hasVideoByKey.set(key, true);
  }

  // ----- Phase 1: walk M1, M2, M4 sessions and adapt -----
  log('\n--- Phase 1: adapt sessions in M1, M2, M4 ---');
  const modSnap = await db.collection(`courses/${COURSE_ID}/modules`).orderBy('order', 'asc').get();

  const stats = { replaced: 0, deleted: 0, untouched: 0, kept: 0 };

  for (const modDoc of modSnap.docs) {
    if (!TARGET_MODULES.has(modDoc.id)) continue;
    const mTitle = modDoc.data().title;
    log(`\n=== ${mTitle} ===`);
    const sessSnap = await modDoc.ref.collection('sessions').orderBy('order', 'asc').get();
    for (const sDoc of sessSnap.docs) {
      const sTitle = sDoc.data().title;
      const exSnap = await sDoc.ref.collection('exercises').orderBy('order', 'asc').get();
      const usedKeys = new Set(exSnap.docs.map((d) => (d.data().primary || {})[LIB_ID]).filter(Boolean));
      log(`\n  ${sTitle}  (${exSnap.size} ej)`);
      const ops = [];
      for (const eDoc of exSnap.docs) {
        const k = (eDoc.data().primary || {})[LIB_ID];
        if (!k) continue;
        const name = nameByKey.get(k) || k;
        if (hasVideoByKey.get(k)) {
          stats.kept++;
          continue;
        }
        const fb = FALLBACKS[k];
        if (fb === undefined) {
          log(`     ? ${name} — sin fallback configurado, dejar como está`);
          stats.untouched++;
          continue;
        }
        if (fb === null) {
          log(`     ✗ DELETE ${name}  (id=${eDoc.id})`);
          ops.push({ type: 'delete', exRef: eDoc.ref, fromKey: k, fromName: name });
          usedKeys.delete(k);
          continue;
        }
        // try fallbacks in order
        let chosen = null;
        for (const candidate of fb) {
          if (!hasVideoByKey.get(candidate)) continue;
          if (!usedKeys.has(candidate)) { chosen = candidate; break; }
        }
        if (chosen) {
          log(`     → ${name}  →  ${nameByKey.get(chosen)}`);
          ops.push({ type: 'replace', exRef: eDoc.ref, fromKey: k, fromName: name, toKey: chosen, toName: nameByKey.get(chosen) });
          usedKeys.delete(k);
          usedKeys.add(chosen);
        } else {
          // all fallbacks would duplicate → delete
          log(`     ✗ DELETE ${name} (todos los fallbacks ya están en la sesión)`);
          ops.push({ type: 'delete', exRef: eDoc.ref, fromKey: k, fromName: name });
          usedKeys.delete(k);
        }
      }

      // apply ops
      for (const op of ops) {
        if (op.type === 'replace') {
          stats.replaced++;
          if (APPLY) {
            await op.exRef.update({ [`primary.${LIB_ID}`]: op.toKey, updated_at: NOW });
          }
        } else if (op.type === 'delete') {
          stats.deleted++;
          if (APPLY) {
            // cascade delete sets
            const setsSnap = await op.exRef.collection('sets').get();
            const batch = db.batch();
            for (const sd of setsSnap.docs) batch.delete(sd.ref);
            batch.delete(op.exRef);
            await batch.commit();
          }
        }
      }
      // Renumber `order` field of remaining exercises (only if APPLY and we deleted any)
      const deletedInSession = ops.filter((o) => o.type === 'delete').length;
      if (APPLY && deletedInSession > 0) {
        const after = await sDoc.ref.collection('exercises').orderBy('order', 'asc').get();
        for (let i = 0; i < after.docs.length; i++) {
          if (after.docs[i].data().order !== i) {
            await after.docs[i].ref.update({ order: i, updated_at: NOW });
          }
        }
      }
    }
  }

  log(`\n=== STATS ===`);
  log(`Replaced: ${stats.replaced}`);
  log(`Deleted:  ${stats.deleted}`);
  log(`Kept (had video already): ${stats.kept}`);
  log(`Untouched (no fallback configured): ${stats.untouched}`);
  log(`\nAPPLY=${APPLY ? 'YES (changes written)' : 'no (dry-run only)'}`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
