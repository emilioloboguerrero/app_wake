#!/usr/bin/env node
'use strict';

/**
 * Combined audit fixes for Felipe Bejarano's library + courses.
 *
 * Changes:
 *   1. HIP THRUST CON BARRA / UNILATERAL CON MANCUERNA / EN MÁQUINA —
 *      correct muscle_activation (glutes primary) and implements.
 *   2. Add library entries:
 *        - SENTADILLA TRASERA CON PAUSA
 *        - PRESS DE BANCA PLANA PIES ELEVADOS
 *   3. Re-point session exercise #1 in two sessions from the base variant
 *      to the new variant library entries:
 *        - aGa0ichtGs4c73KMWAje "Pierna — back squat y RDL"  (ex order 1)
 *        - 58FfmvbK4NcbEqHOalOO "Empuje — banca pies arriba" (ex order 1)
 *   4. Replace duplicate PRESS FRANCES CON MANCUERNAS at order #7 with
 *      TRICEP PUSH DOWN in three sessions:
 *        - JMad5yWbQQg8rs7zM41j "Full body gym — pulldown y lunge"
 *        - ZdOIN1RA7tlGWskrp7EP "Tren superior — incline y dominada"
 *        - urjMc1sMUwe8nL6Ctbx8 "Tren superior — completo"
 *   5. Propagate changes (3) and (4) to all course-copies that reference
 *      those library sessions via librarySessionRef.
 *
 * All exercise docs keep their sets subcollection untouched.
 * Usage:
 *   node scripts/fix-bejarano-audit-all.js           # dry run
 *   node scripts/fix-bejarano-audit-all.js --write   # apply
 */

const admin = require('firebase-admin');

const PROJECT_ID = 'wolf-20b8b';
const FELIPE_UID = 'yMqKOXBcVARa6vjU7wImf3Tp85J2';
const LIB_ID = 'jeoVyzhUrBeJofT62MOe';
const WRITE = process.argv.includes('--write');

admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  projectId: PROJECT_ID,
});
const db = admin.firestore();
const FV = admin.firestore.FieldValue;

// ─────────────────── 1. HIP THRUST MUSCLE FIXES ───────────────────

const HIP_THRUST_MUSCLES = {
  glutes: 100,
  hamstrings: 55,
  lower_back: 30,
};

const HIP_THRUST_FIXES = [
  { name: 'HIP THRUST CON BARRA',              implements: ['Barra', 'Banco'] },
  { name: 'HIP THRUST UNILATERAL CON MANCUERNA', implements: ['Mancuernas', 'Banco'] },
  { name: 'HIP THRUST EN MÁQUINA',             implements: ['Máquina'] },
];

// ─────────────────── 2. NEW LIBRARY ENTRIES ───────────────────

const NEW_EXERCISES = {
  'SENTADILLA TRASERA CON PAUSA': {
    implements: ['Barra'],
    muscle_activation: {
      quads: 100,
      glutes: 60,
      hamstrings: 30,
      calves: 20,
    },
  },
  'PRESS DE BANCA PLANA PIES ELEVADOS': {
    implements: ['Barra', 'Banco'],
    muscle_activation: {
      pecs: 100,
      front_delts: 30,
      triceps: 50,
    },
  },
};

// ─────────────────── 3/4. SESSION EXERCISE CHANGES ───────────────────

// Each change: in library session `sessionId` find exercise at `order` whose
// primary name is `fromName`; change primary to `toName`; optionally clear notes.
const SESSION_EXERCISE_CHANGES = [
  {
    sessionId: 'aGa0ichtGs4c73KMWAje',
    sessionTitle: 'Pierna — back squat y RDL',
    order: 1,
    fromName: 'SENTADILLA TRASERA',
    toName: 'SENTADILLA TRASERA CON PAUSA',
    clearNotes: true,  // "Pausa abajo (menos peso)" — no longer needed; new entry carries the semantics
  },
  {
    sessionId: '58FfmvbK4NcbEqHOalOO',
    sessionTitle: 'Empuje — banca pies arriba',
    order: 1,
    fromName: 'PRESS DE BANCA PLANA',
    toName: 'PRESS DE BANCA PLANA PIES ELEVADOS',
    clearNotes: true,
  },
  {
    sessionId: 'JMad5yWbQQg8rs7zM41j',
    sessionTitle: 'Full body gym — pulldown y lunge',
    order: 7,
    fromName: 'PRESS FRANCES CON MANCUERNAS',
    toName: 'TRICEP PUSH DOWN',
    clearNotes: false,  // preserve any existing notes (there are none, but be safe)
  },
  {
    sessionId: 'ZdOIN1RA7tlGWskrp7EP',
    sessionTitle: 'Tren superior — incline y dominada',
    order: 7,
    fromName: 'PRESS FRANCES CON MANCUERNAS',
    toName: 'TRICEP PUSH DOWN',
    clearNotes: false,
  },
  {
    sessionId: 'urjMc1sMUwe8nL6Ctbx8',
    sessionTitle: 'Tren superior — completo',
    order: 7,
    fromName: 'PRESS FRANCES CON MANCUERNAS',
    toName: 'TRICEP PUSH DOWN',
    clearNotes: false,
  },
];

// ─────────────────── Helpers ───────────────────

function fmt(obj) { return JSON.stringify(obj); }

function log(action, detail) {
  console.log(`${WRITE ? '[WRITE]' : '[DRY] '} ${action}${detail ? ' — ' + detail : ''}`);
}

async function findExerciseDoc(sessionRef, order, fromName) {
  const snap = await sessionRef.collection('exercises').where('order', '==', order).get();
  for (const doc of snap.docs) {
    const d = doc.data();
    const pname = d.primary ? Object.values(d.primary)[0] : null;
    if (pname === fromName) return doc;
  }
  return null;
}

// ─────────────────── Main ───────────────────

(async () => {
  console.log(WRITE ? '\n═══ APPLYING FIXES ═══\n' : '\n═══ DRY RUN ═══\n');
  let writes = 0;

  // 1. HIP THRUST muscle fixes (library doc update)
  console.log('── 1. Hip thrust muscle_activation + implements ──');
  {
    const libRef = db.collection('exercises_library').doc(LIB_ID);
    const libSnap = await libRef.get();
    const libData = libSnap.data() || {};
    const patch = {};
    for (const { name, implements: impls } of HIP_THRUST_FIXES) {
      const cur = libData[name];
      if (!cur) { console.log(`  SKIP: ${name} not in library`); continue; }
      patch[`${name}.muscle_activation`] = HIP_THRUST_MUSCLES;
      patch[`${name}.implements`]        = impls;
      patch[`${name}.updated_at`]        = FV.serverTimestamp();
      log('UPDATE', `${name}: muscle_activation → ${fmt(HIP_THRUST_MUSCLES)}, implements → ${fmt(impls)}`);
    }
    if (WRITE && Object.keys(patch).length) {
      await libRef.update(patch);
      writes++;
    }
  }

  // 2. Add new library entries
  console.log('\n── 2. New library entries ──');
  {
    const libRef = db.collection('exercises_library').doc(LIB_ID);
    const libSnap = await libRef.get();
    const libData = libSnap.data() || {};
    const patch = {};
    for (const [name, def] of Object.entries(NEW_EXERCISES)) {
      if (libData[name]) {
        console.log(`  SKIP: ${name} already exists — will reuse`);
        continue;
      }
      patch[name] = {
        ...def,
        created_at: FV.serverTimestamp(),
        updated_at: FV.serverTimestamp(),
      };
      log('CREATE', `${name}: ${fmt(def)}`);
    }
    if (WRITE && Object.keys(patch).length) {
      await libRef.update(patch);
      writes++;
    }
  }

  // 3/4. Re-point exercises in library sessions AND their course copies
  console.log('\n── 3/4. Exercise repointing (library + course copies) ──');
  for (const change of SESSION_EXERCISE_CHANGES) {
    console.log(`\n  Library session: [${change.sessionId}] "${change.sessionTitle}"`);
    console.log(`    order=${change.order}  ${change.fromName} → ${change.toName}`);

    // 3a. Library session exercise doc
    const libSessionRef = db.collection('creator_libraries').doc(FELIPE_UID)
      .collection('sessions').doc(change.sessionId);
    const libExDoc = await findExerciseDoc(libSessionRef, change.order, change.fromName);
    if (!libExDoc) {
      console.log(`    ✗ exercise not found in library session — skipping (manual check needed)`);
      continue;
    }
    const libPatch = {
      primary: { [LIB_ID]: change.toName },
      updated_at: FV.serverTimestamp(),
    };
    if (change.clearNotes) libPatch.notes = FV.delete();
    log('UPDATE', `library/${change.sessionId}/exercises/${libExDoc.id} primary → "${change.toName}"${change.clearNotes ? ' + clear notes' : ''}`);
    if (WRITE) {
      await libExDoc.ref.update(libPatch);
      writes++;
    }

    // 3b. Find all course/plan sessions with librarySessionRef == change.sessionId.
    // Enumerate Felipe's courses + plans directly (no collectionGroup index required).
    const [coursesSnap, plansSnap] = await Promise.all([
      db.collection('courses').where('creator_id', '==', FELIPE_UID).get(),
      db.collection('plans').where('creator_id', '==', FELIPE_UID).get(),
    ]);
    const courseSessions = [];
    for (const parentDoc of [...coursesSnap.docs, ...plansSnap.docs]) {
      const modulesSnap = await parentDoc.ref.collection('modules').get();
      for (const mDoc of modulesSnap.docs) {
        const sSnap = await mDoc.ref.collection('sessions')
          .where('librarySessionRef', '==', change.sessionId).get();
        for (const s of sSnap.docs) courseSessions.push(s);
      }
    }
    if (courseSessions.length === 0) {
      console.log(`    (no course copies reference this session)`);
    } else {
      console.log(`    ${courseSessions.length} course copies to update`);
    }
    for (const csDoc of courseSessions) {
      const courseExDoc = await findExerciseDoc(csDoc.ref, change.order, change.fromName);
      if (!courseExDoc) {
        console.log(`    ✗ course copy ${csDoc.ref.path} — exercise not found at order ${change.order} with name "${change.fromName}" — skipping`);
        continue;
      }
      const coursePatch = {
        primary: { [LIB_ID]: change.toName },
        updated_at: FV.serverTimestamp(),
      };
      if (change.clearNotes) coursePatch.notes = FV.delete();
      log('UPDATE', `${csDoc.ref.path}/exercises/${courseExDoc.id} primary → "${change.toName}"`);
      if (WRITE) {
        await courseExDoc.ref.update(coursePatch);
        writes++;
      }
    }
  }

  console.log(`\n═══ ${WRITE ? 'WROTE' : 'WOULD WRITE'} ${writes} changes ═══`);
  if (!WRITE) console.log('(re-run with --write to apply)');
})().catch((err) => {
  console.error('ERROR:', err);
  process.exit(1);
});
