#!/usr/bin/env node
'use strict';

/**
 * READ-ONLY structured dump of Felipe's library + courses for audit.
 * Emits JSON to stdout. Writes NOTHING.
 *
 * Usage: node scripts/audit-bejarano-dump.js > /tmp/bejarano-audit.json
 */

const admin = require('firebase-admin');

const FELIPE_UID = 'yMqKOXBcVARa6vjU7wImf3Tp85J2';
const LIB_ID = 'jeoVyzhUrBeJofT62MOe';
const PROJECT_ID = 'wolf-20b8b';

admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  projectId: PROJECT_ID,
});

const db = admin.firestore();

const META_KEYS = new Set([
  'creator_id', 'creator_name', 'title', 'created_at', 'updated_at', 'icon',
]);

function stripTimestamps(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(stripTimestamps);
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (k === 'created_at' || k === 'updated_at') continue;
    out[k] = stripTimestamps(v);
  }
  return out;
}

async function dumpSessionSubtree(sessionRef) {
  const sDoc = await sessionRef.get();
  const sData = sDoc.data() || {};
  const exSnap = await sessionRef.collection('exercises').orderBy('order', 'asc').get();
  const exercises = [];
  for (const eDoc of exSnap.docs) {
    const eData = eDoc.data();
    const setsSnap = await eDoc.ref.collection('sets').orderBy('order', 'asc').get();
    exercises.push({
      exerciseId: eDoc.id,
      ...stripTimestamps(eData),
      sets: setsSnap.docs.map((sd) => stripTimestamps(sd.data())),
    });
  }
  return {
    sessionId: sDoc.id,
    ...stripTimestamps(sData),
    exercises,
  };
}

(async () => {
  const out = {
    generated_at: new Date().toISOString(),
    felipeUid: FELIPE_UID,
    libId: LIB_ID,
  };

  // Library exercises
  const libDoc = await db.collection('exercises_library').doc(LIB_ID).get();
  const libData = libDoc.data() || {};
  const exerciseEntries = {};
  for (const [k, v] of Object.entries(libData)) {
    if (META_KEYS.has(k)) continue;
    if (typeof v !== 'object' || v === null) continue;
    exerciseEntries[k] = stripTimestamps(v);
  }
  out.library = {
    id: LIB_ID,
    title: libData.title || null,
    creator_id: libData.creator_id || null,
    exerciseCount: Object.keys(exerciseEntries).length,
    exercises: exerciseEntries,
  };

  // Library sessions
  const sessionsSnap = await db
    .collection('creator_libraries').doc(FELIPE_UID)
    .collection('sessions').orderBy('order', 'asc').get();
  out.sessions = [];
  for (const sDoc of sessionsSnap.docs) {
    out.sessions.push(await dumpSessionSubtree(sDoc.ref));
  }

  // Courses (Felipe's)
  const coursesSnap = await db
    .collection('courses').where('creator_id', '==', FELIPE_UID).get();
  out.courses = [];
  for (const cDoc of coursesSnap.docs) {
    const cData = cDoc.data();
    const modulesSnap = await cDoc.ref.collection('modules').orderBy('order', 'asc').get();
    const modules = [];
    for (const mDoc of modulesSnap.docs) {
      const mData = mDoc.data();
      const msSnap = await mDoc.ref.collection('sessions').orderBy('order', 'asc').get();
      const ms = [];
      for (const msDoc of msSnap.docs) {
        ms.push(await dumpSessionSubtree(msDoc.ref));
      }
      modules.push({
        moduleId: mDoc.id,
        ...stripTimestamps(mData),
        sessions: ms,
      });
    }
    out.courses.push({
      courseId: cDoc.id,
      ...stripTimestamps(cData),
      modules,
    });
  }

  // Plans (full subtree)
  const plansSnap = await db
    .collection('plans').where('creator_id', '==', FELIPE_UID).get();
  out.plans = [];
  for (const pDoc of plansSnap.docs) {
    const pData = pDoc.data();
    const modulesSnap = await pDoc.ref.collection('modules').orderBy('order', 'asc').get();
    const modules = [];
    for (const mDoc of modulesSnap.docs) {
      const mData = mDoc.data();
      const msSnap = await mDoc.ref.collection('sessions').orderBy('order', 'asc').get();
      const ms = [];
      for (const msDoc of msSnap.docs) {
        ms.push(await dumpSessionSubtree(msDoc.ref));
      }
      modules.push({
        moduleId: mDoc.id,
        ...stripTimestamps(mData),
        sessions: ms,
      });
    }
    out.plans.push({
      planId: pDoc.id,
      ...stripTimestamps(pData),
      modules,
    });
  }

  process.stdout.write(JSON.stringify(out, null, 2));
})().catch((err) => {
  console.error('ERROR:', err);
  process.exit(1);
});
