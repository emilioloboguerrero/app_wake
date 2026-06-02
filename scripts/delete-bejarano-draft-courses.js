#!/usr/bin/env node
'use strict';

/**
 * Delete Felipe Bejarano's three leveled draft programs:
 *   - 1GSmDghjfDy1nqysXEvc  (Novatos — Full Body)
 *   - QSmzuUYxeU7MFXmMl4Lq  (Avanzados — PPL)
 *   - RANAb46wKhzOEIVaWOez  (Intermedios — Torso-Pierna)
 *
 * Replaces them with the single monthly-drop program (see
 * memory/project_monthly_drops.md). Removes for each course:
 *   - the course doc itself
 *   - all modules under courses/{id}/modules/{*}
 *   - all sessions under each module
 *   - all exercises under each session
 *   - all sets under each exercise
 *
 * DOES NOT touch:
 *   - creator_libraries/{FELIPE_UID}/sessions/*  (library sessions Felipe reuses)
 *   - exercises_library/jeoVyzhUrBeJofT62MOe     (the exercises library doc)
 *   - users/{uid}.courses[id]                    (entries on user docs — if any
 *                                                 user is enrolled in a draft,
 *                                                 we abort)
 *
 * Defaults to dry-run. Pass --write to commit. Pass --force to skip the
 * "no users enrolled" guard (NOT recommended).
 *
 * Usage:
 *   NODE_PATH=functions/node_modules node scripts/delete-bejarano-draft-courses.js
 *   NODE_PATH=functions/node_modules node scripts/delete-bejarano-draft-courses.js --write
 */

const admin = require('firebase-admin');

const PROJECT_ID = 'wolf-20b8b';
const FELIPE_UID = 'yMqKOXBcVARa6vjU7wImf3Tp85J2';
const LIB_ID = 'jeoVyzhUrBeJofT62MOe';
const COURSE_IDS = [
  { id: '1GSmDghjfDy1nqysXEvc', label: 'Novatos — Full Body' },
  { id: 'QSmzuUYxeU7MFXmMl4Lq', label: 'Avanzados — PPL' },
  { id: 'RANAb46wKhzOEIVaWOez', label: 'Intermedios — Torso-Pierna' },
];

const WRITE = process.argv.includes('--write');
const FORCE = process.argv.includes('--force');

admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId: PROJECT_ID });
const db = admin.firestore();

async function countTree(courseRef) {
  let modules = 0;
  let sessions = 0;
  let exercises = 0;
  let sets = 0;
  const modulesSnap = await courseRef.collection('modules').get();
  modules = modulesSnap.size;
  for (const mDoc of modulesSnap.docs) {
    const sessionsSnap = await mDoc.ref.collection('sessions').get();
    sessions += sessionsSnap.size;
    for (const sDoc of sessionsSnap.docs) {
      const exSnap = await sDoc.ref.collection('exercises').get();
      exercises += exSnap.size;
      for (const eDoc of exSnap.docs) {
        const setsSnap = await eDoc.ref.collection('sets').get();
        sets += setsSnap.size;
      }
    }
  }
  return { modules, sessions, exercises, sets };
}

async function deleteTree(courseRef) {
  // Delete bottom-up to avoid leaving orphaned subcollections (Firestore
  // does not cascade — deleting a parent doc keeps child collections).
  const modulesSnap = await courseRef.collection('modules').get();
  for (const mDoc of modulesSnap.docs) {
    const sessionsSnap = await mDoc.ref.collection('sessions').get();
    for (const sDoc of sessionsSnap.docs) {
      const exSnap = await sDoc.ref.collection('exercises').get();
      for (const eDoc of exSnap.docs) {
        const setsSnap = await eDoc.ref.collection('sets').get();
        const batch1 = db.batch();
        setsSnap.docs.forEach((d) => batch1.delete(d.ref));
        await batch1.commit();
        await eDoc.ref.delete();
      }
      await sDoc.ref.delete();
    }
    await mDoc.ref.delete();
  }
  await courseRef.delete();
}

async function findEnrolledUsers(courseId) {
  // users/{uid}.courses[courseId] is a map field — search by mapfield path.
  const snap = await db
    .collection('users')
    .where(`courses.${courseId}.status`, '==', 'active')
    .limit(10)
    .get();
  return snap.docs.map((d) => ({ uid: d.id, email: d.data().email }));
}

(async () => {
  console.log(`\nProject: ${PROJECT_ID}`);
  console.log(`Mode: ${WRITE ? 'WRITE (destructive)' : 'DRY-RUN (read-only)'}`);
  console.log(`Targets:`);
  COURSE_IDS.forEach((c) => console.log(`  - courses/${c.id}  "${c.label}"`));
  console.log('');

  // Sanity: ensure the library doc + library sessions are NOT in our delete set.
  console.log('Untouched references (verifying paths are outside the delete blast radius):');
  console.log(`  exercises_library/${LIB_ID}                              — left alone`);
  console.log(`  creator_libraries/${FELIPE_UID}/sessions/*                — left alone`);
  console.log(`  creator_libraries/${FELIPE_UID}/modules/*                 — left alone`);
  console.log('');

  let abort = false;
  const summaries = [];
  for (const { id, label } of COURSE_IDS) {
    const courseRef = db.collection('courses').doc(id);
    const courseDoc = await courseRef.get();
    if (!courseDoc.exists) {
      console.log(`courses/${id} ("${label}"): DOES NOT EXIST — skipping`);
      continue;
    }
    const data = courseDoc.data() || {};
    if (data.creator_id !== FELIPE_UID) {
      console.log(`courses/${id} ("${label}"): creator_id mismatch (${data.creator_id}) — ABORTING`);
      abort = true;
      continue;
    }

    const counts = await countTree(courseRef);

    const enrolled = await findEnrolledUsers(id);
    if (enrolled.length > 0 && !FORCE) {
      console.log(`courses/${id} ("${label}"): ${enrolled.length} ACTIVE user(s) enrolled — ABORTING`);
      enrolled.slice(0, 5).forEach((u) => console.log(`    enrolled: ${u.email || u.uid}`));
      if (enrolled.length > 5) console.log(`    … plus ${enrolled.length - 5} more`);
      console.log(`    Pass --force to delete anyway (NOT recommended).`);
      abort = true;
    }

    summaries.push({ id, label, status: data.status, ...counts, enrolled: enrolled.length });
    console.log(`courses/${id} ("${label}")  status=${data.status || '?'}`);
    console.log(`  → ${counts.modules} modules, ${counts.sessions} sessions, ${counts.exercises} exercises, ${counts.sets} sets`);
    console.log(`  → ${enrolled.length} user(s) currently active on this course`);
  }

  console.log('\nTotals:');
  const t = summaries.reduce((acc, s) => ({
    modules: acc.modules + s.modules,
    sessions: acc.sessions + s.sessions,
    exercises: acc.exercises + s.exercises,
    sets: acc.sets + s.sets,
  }), { modules: 0, sessions: 0, exercises: 0, sets: 0 });
  console.log(`  ${summaries.length} courses, ${t.modules} modules, ${t.sessions} sessions, ${t.exercises} exercises, ${t.sets} sets to delete`);

  if (!WRITE) {
    console.log('\n— Dry-run only. Pass --write to actually delete. —\n');
    process.exit(0);
  }

  if (abort) {
    console.error('\nABORTING due to safety check failure (see above). No deletions performed.');
    process.exit(2);
  }

  console.log('\nDeleting…');
  for (const { id, label } of COURSE_IDS) {
    const courseRef = db.collection('courses').doc(id);
    const courseDoc = await courseRef.get();
    if (!courseDoc.exists) continue;
    if (courseDoc.data()?.creator_id !== FELIPE_UID) continue;
    console.log(`  courses/${id} ("${label}") — deleting tree…`);
    await deleteTree(courseRef);
    console.log(`  courses/${id} — done`);
  }
  console.log('\n✓ All deletions complete.');
  process.exit(0);
})().catch((err) => {
  console.error('ERROR:', err);
  process.exit(1);
});
