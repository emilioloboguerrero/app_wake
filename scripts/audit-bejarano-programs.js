#!/usr/bin/env node
'use strict';

/**
 * READ-ONLY audit of Felipe Bejarano's programs (courses), sessions, and exercises.
 *
 * Schema notes (verified against prod doc 2026-05-14):
 *   - course exercise doc has NO `name` or `libraryId` field
 *   - identity lives in `primary: { [libraryDocId]: exerciseKeyInLibrary }`
 *     and `alternatives: { [libraryDocId]: [exerciseKey, ...] }`
 *   - the library doc (`exercises_library/{LIB_ID}`) holds the exercise data
 *     keyed by exerciseKey (these are 20-char IDs, NOT human names)
 *   - course session doc references its library session via `librarySessionRef`
 *
 * Walks every course where creator_id == FELIPE_UID, plus any linked plans,
 * and reports structural problems:
 *   - Missing required course metadata (title, deliveryType)
 *   - Modules with no sessions, sessions with no exercises, exercises with no sets
 *   - Sessions missing librarySessionRef or title
 *   - Exercises whose primary[LIB_ID] is missing or points to a non-existent
 *     library exercise key
 *   - Library exercises that exercises depend on but that don't exist (orphans)
 *   - Sets with no work prescription (no reps / rep_sequence / duration)
 *   - Duplicate orders within a container
 *
 * Writes NOTHING. Uses only .get() / .where().
 *
 * Usage:
 *   NODE_PATH=functions/node_modules node scripts/audit-bejarano-programs.js
 *   NODE_PATH=functions/node_modules node scripts/audit-bejarano-programs.js --verbose
 */

const admin = require('firebase-admin');

const EMAIL = 'fbejaranofit@gmail.com';
const FELIPE_UID = 'yMqKOXBcVARa6vjU7wImf3Tp85J2';
const LIB_ID = 'jeoVyzhUrBeJofT62MOe';
const PROJECT_ID = 'wolf-20b8b';
const VERBOSE = process.argv.includes('--verbose');

admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  projectId: PROJECT_ID,
});
const db = admin.firestore();

// ─────────────────────────────────────────────────────────────────────
// Issue tracking

const issues = [];
function flag(severity, scope, msg) {
  issues.push({ severity, scope, msg });
}

// ─────────────────────────────────────────────────────────────────────
// Validation helpers

function checkCourseDoc(courseId, data) {
  const scope = `courses/${courseId}`;
  if (!data.title || typeof data.title !== 'string') flag('error', scope, 'missing title');
  if (!data.deliveryType) flag('error', scope, 'missing deliveryType');
  else if (!['low_ticket', 'general', 'one_on_one'].includes(data.deliveryType)) {
    flag('error', scope, `invalid deliveryType "${data.deliveryType}"`);
  }
  if (!data.image_url) flag('warn', scope, 'missing image_url');
  if (data.creator_id && data.creator_id !== FELIPE_UID) {
    flag('error', scope, `creator_id mismatch: ${data.creator_id}`);
  }
}

function checkSet(setId, data, scope) {
  const s = `${scope}/sets/${setId}`;
  const reps = data.reps;
  const repSeq = data.rep_sequence;
  const duration = data.duration;
  const intensity = data.intensity;

  const hasReps = reps !== undefined && reps !== null && reps !== '';
  const hasRepSeq = Array.isArray(repSeq) && repSeq.length > 0;
  const hasDuration = typeof duration === 'number' && duration > 0;
  const hasIntensity = intensity !== undefined && intensity !== null && intensity !== '';

  // A set should at least have reps OR duration OR rep_sequence — intensity alone is not a prescription
  if (!hasReps && !hasRepSeq && !hasDuration) {
    flag('error', s, 'no reps / rep_sequence / duration — empty work prescription');
  }

  if (hasReps && typeof reps !== 'number' && reps !== 'AMRAP' && typeof reps !== 'string') {
    flag('error', s, `reps has invalid type: ${typeof reps}`);
  }
  if (typeof reps === 'string' && reps !== 'AMRAP' && !/^\d+([+-]\d+)?$/.test(reps) && !/^\d+\s*c\s*\/\s*u$/i.test(reps)) {
    flag('warn', s, `reps string not a number, "N-N" range, "AMRAP", or "N c/u": "${reps}"`);
  }

  if (hasRepSeq && !repSeq.every((n) => typeof n === 'number' && n > 0)) {
    flag('error', s, `rep_sequence has bad values: ${JSON.stringify(repSeq)}`);
  }

  if (typeof data.order !== 'number') {
    flag('warn', s, 'missing/invalid order');
  }
  return { hasReps, hasRepSeq, hasDuration, hasIntensity };
}

function checkOrderDupes(docs, scope) {
  const seen = new Map();
  docs.forEach((d) => {
    const order = d.data().order;
    if (typeof order !== 'number') return;
    if (seen.has(order)) {
      flag('warn', scope, `duplicate order ${order} on ${d.id} and ${seen.get(order)}`);
    } else seen.set(order, d.id);
  });
}

// ─────────────────────────────────────────────────────────────────────
// Walkers

async function walkSessionTree(sessionRef, scope, libraryExerciseKeys, libNamesByKey) {
  const sessionSnap = await sessionRef.get();
  if (!sessionSnap.exists) {
    flag('error', scope, 'session document missing');
    return { exerciseCount: 0, setCount: 0 };
  }
  const data = sessionSnap.data();
  const isRest = data.isRestDay === true;

  if (!data.title && !isRest) flag('warn', scope, 'session missing title');
  // Course sessions are expected to have librarySessionRef; library sessions are not.
  const isCourseSession = scope.startsWith('courses/') || scope.startsWith('plans/');
  if (isCourseSession && !isRest && !data.librarySessionRef) {
    flag('info', scope, 'session has no librarySessionRef (not linked to a library session)');
  }

  const exSnap = await sessionRef.collection('exercises').orderBy('order', 'asc').get();
  if (exSnap.empty && !isRest) {
    flag('warn', scope, 'session has 0 exercises (not flagged as rest day)');
    return { exerciseCount: 0, setCount: 0 };
  }
  checkOrderDupes(exSnap.docs, `${scope}/exercises`);

  let setCount = 0;
  for (const eDoc of exSnap.docs) {
    const e = eDoc.data();
    const exScope = `${scope}/exercises/${eDoc.id}`;

    // Identity check — primary[LIB_ID] is the canonical "what is this exercise"
    const primary = e.primary || {};
    const primaryKey = primary[LIB_ID];
    if (!primaryKey) {
      // Some library sessions may use a different libraryDocId — only flag for course sessions.
      const otherLibs = Object.keys(primary);
      if (otherLibs.length === 0) {
        flag('error', exScope, 'exercise has no primary identity (no primary map at all)');
      } else if (isCourseSession) {
        flag('warn', exScope, `primary references unexpected library(ies): ${otherLibs.join(',')} (expected ${LIB_ID})`);
      }
    } else if (libraryExerciseKeys && !libraryExerciseKeys.has(primaryKey)) {
      flag('error', exScope, `primary key "${primaryKey}" not found in exercises_library/${LIB_ID}`);
    }

    // Alternatives sanity: each entry should also resolve
    if (e.alternatives && typeof e.alternatives === 'object') {
      const altsForLib = e.alternatives[LIB_ID];
      if (Array.isArray(altsForLib)) {
        altsForLib.forEach((key) => {
          if (!libraryExerciseKeys.has(key)) {
            flag('warn', exScope, `alternative key "${key}" not found in library`);
          }
        });
      }
    }

    // measures/objectives sanity (the doc-level data template)
    if (!Array.isArray(e.measures) || e.measures.length === 0) {
      flag('info', exScope, 'no measures array (will inherit from session/default)');
    }

    const setsSnap = await eDoc.ref.collection('sets').orderBy('order', 'asc').get();
    if (setsSnap.empty) {
      flag('error', exScope, 'exercise has 0 sets');
    } else {
      checkOrderDupes(setsSnap.docs, `${exScope}/sets`);
      setsSnap.docs.forEach((sd) => checkSet(sd.id, sd.data(), exScope));
    }
    setCount += setsSnap.size;
  }

  return { exerciseCount: exSnap.size, setCount };
}

async function walkModuleTree(moduleRef, scope, libraryExerciseKeys, libNamesByKey) {
  const sessionsSnap = await moduleRef.collection('sessions').orderBy('order', 'asc').get();
  if (sessionsSnap.empty) {
    flag('warn', scope, 'module has 0 sessions');
    return { sessionCount: 0, exerciseCount: 0, setCount: 0 };
  }
  checkOrderDupes(sessionsSnap.docs, `${scope}/sessions`);

  let exerciseCount = 0;
  let setCount = 0;
  for (const sDoc of sessionsSnap.docs) {
    const sScope = `${scope}/sessions/${sDoc.id}`;
    const out = await walkSessionTree(sDoc.ref, sScope, libraryExerciseKeys, libNamesByKey);
    exerciseCount += out.exerciseCount;
    setCount += out.setCount;
  }
  return { sessionCount: sessionsSnap.size, exerciseCount, setCount };
}

async function walkContainerTree(containerRef, scope, libraryExerciseKeys, libNamesByKey) {
  const modulesSnap = await containerRef.collection('modules').orderBy('order', 'asc').get();
  if (modulesSnap.empty) {
    flag('warn', scope, 'container has 0 modules');
    return { moduleCount: 0, sessionCount: 0, exerciseCount: 0, setCount: 0 };
  }
  checkOrderDupes(modulesSnap.docs, `${scope}/modules`);

  let sessionCount = 0;
  let exerciseCount = 0;
  let setCount = 0;
  for (const mDoc of modulesSnap.docs) {
    const mScope = `${scope}/modules/${mDoc.id}`;
    const m = mDoc.data();
    if (!m.title) flag('info', mScope, 'module missing title');
    const out = await walkModuleTree(mDoc.ref, mScope, libraryExerciseKeys, libNamesByKey);
    sessionCount += out.sessionCount;
    exerciseCount += out.exerciseCount;
    setCount += out.setCount;
  }
  return { moduleCount: modulesSnap.size, sessionCount, exerciseCount, setCount };
}

// ─────────────────────────────────────────────────────────────────────
// Main

(async () => {
  console.log(`\nProject: ${PROJECT_ID}`);
  console.log(`Auditing Felipe Bejarano's programs (uid=${FELIPE_UID})\n`);

  const userDoc = await db.collection('users').doc(FELIPE_UID).get();
  if (!userDoc.exists || userDoc.data().email !== EMAIL) {
    console.error('ERROR: user lookup failed');
    process.exit(1);
  }

  // Build library exercise key set + names
  const libDoc = await db.collection('exercises_library').doc(LIB_ID).get();
  if (!libDoc.exists) {
    console.error(`ERROR: exercises_library/${LIB_ID} not found`);
    process.exit(1);
  }
  const libData = libDoc.data();
  // 'exercises' is the post-migration sub-map (keyed by 20-char IDs).
  // Legacy top-level keys (keyed by display name) remain for forward compat.
  const META = new Set(['creator_id', 'creator_name', 'title', 'created_at', 'updated_at', 'icon', 'exercises']);
  const libraryExerciseKeys = new Set();
  const libNamesByKey = new Map();
  const exercisesWithoutVideo = [];
  const exercisesWithoutMuscles = [];

  // Prefer the post-migration sub-map when present; it carries canonical IDs.
  const subMap = (libData.exercises && typeof libData.exercises === 'object') ? libData.exercises : null;
  if (subMap) {
    Object.keys(subMap).forEach((id) => {
      const e = subMap[id];
      if (!e || typeof e !== 'object') return;
      libraryExerciseKeys.add(id);
      const name = e.displayName || e.name || '(unnamed)';
      libNamesByKey.set(id, name);
      if (!e.video_url && !e.videoUrl) exercisesWithoutVideo.push({ key: id, name });
      if (!e.muscle_activation || Object.keys(e.muscle_activation).length === 0) {
        exercisesWithoutMuscles.push({ key: id, name });
      }
    });
  }
  // Also accept legacy name-keyed entries so unmigrated libraries still audit.
  Object.keys(libData).forEach((k) => {
    if (META.has(k)) return;
    if (!libData[k] || typeof libData[k] !== 'object') return;
    if (libraryExerciseKeys.has(k)) return;
    libraryExerciseKeys.add(k);
    const name = libData[k].name || k;
    libNamesByKey.set(k, name);
    if (!subMap) {
      if (!libData[k].video_url) exercisesWithoutVideo.push({ key: k, name });
      if (!libData[k].muscle_activation || Object.keys(libData[k].muscle_activation).length === 0) {
        exercisesWithoutMuscles.push({ key: k, name });
      }
    }
  });
  console.log(`Library exercises_library/${LIB_ID} title="${libData.title || '(none)'}"  exercises=${libraryExerciseKeys.size}  (subMap=${subMap ? Object.keys(subMap).length : 0}, legacy=${Object.keys(libData).filter((k) => !META.has(k) && libData[k] && typeof libData[k] === 'object').length})`);
  console.log(`  - without video_url:        ${exercisesWithoutVideo.length}`);
  console.log(`  - without muscle_activation:${exercisesWithoutMuscles.length}\n`);

  // Courses
  const coursesSnap = await db.collection('courses').where('creator_id', '==', FELIPE_UID).get();
  console.log(`=== COURSES owned by Felipe: ${coursesSnap.size} ===\n`);

  const summary = [];
  const planIdsToAudit = new Set();
  const referencedKeysAcrossCourses = new Set();

  for (const cDoc of coursesSnap.docs) {
    const data = cDoc.data();
    const cScope = `courses/${cDoc.id}`;
    console.log(`• ${cDoc.id}  "${data.title || '(no title)'}"  deliveryType=${data.deliveryType || '?'}  status=${data.status || '?'}  visibility=${data.visibility || '?'}`);
    if (data.access_durations) {
      console.log(`  access_durations: ${JSON.stringify(data.access_durations)}`);
    }
    checkCourseDoc(cDoc.id, data);

    let stats;
    if (data.deliveryType === 'one_on_one') {
      if (Array.isArray(data.plan_ids)) data.plan_ids.forEach((pid) => planIdsToAudit.add(pid));
      stats = await walkContainerTree(cDoc.ref, cScope, libraryExerciseKeys, libNamesByKey);
    } else {
      stats = await walkContainerTree(cDoc.ref, cScope, libraryExerciseKeys, libNamesByKey);
    }

    summary.push({ id: cDoc.id, title: data.title, deliveryType: data.deliveryType, status: data.status, ...stats });
    console.log(`  modules=${stats.moduleCount} sessions=${stats.sessionCount} exercises=${stats.exerciseCount} sets=${stats.setCount}\n`);
  }

  // Cross-check library
  const libSessionsSnap = await db.collection('creator_libraries').doc(FELIPE_UID).collection('sessions').get();
  console.log(`=== LIBRARY (creator_libraries/${FELIPE_UID}/sessions): ${libSessionsSnap.size} sessions ===\n`);
  let libSessionExercises = 0;
  let libSessionSets = 0;
  for (const sDoc of libSessionsSnap.docs) {
    const out = await walkSessionTree(sDoc.ref, `creator_libraries/${FELIPE_UID}/sessions/${sDoc.id}`, libraryExerciseKeys, libNamesByKey);
    libSessionExercises += out.exerciseCount;
    libSessionSets += out.setCount;
    if (VERBOSE) {
      console.log(`  • ${sDoc.id}  "${sDoc.data().title || '(no title)'}"  exercises=${out.exerciseCount} sets=${out.setCount}`);
    }
  }
  console.log(`Library sessions totals: ${libSessionExercises} exercises, ${libSessionSets} sets\n`);

  // Modules in library
  const libModulesSnap = await db.collection('creator_libraries').doc(FELIPE_UID).collection('modules').get();
  console.log(`Library modules: ${libModulesSnap.size}`);
  let modulesWithMissingSessionRefs = 0;
  libModulesSnap.docs.forEach((m) => {
    const d = m.data();
    const refs = Array.isArray(d.sessionRefs) ? d.sessionRefs : [];
    if (refs.length === 0) modulesWithMissingSessionRefs++;
  });
  if (modulesWithMissingSessionRefs > 0) {
    flag('warn', `creator_libraries/${FELIPE_UID}/modules`, `${modulesWithMissingSessionRefs} module(s) have empty sessionRefs`);
  }

  // Plans (one-on-one — Felipe had 0 in this run, but keep coverage)
  console.log(`\n=== PLANS (one-on-one) to audit: ${planIdsToAudit.size} ===`);
  for (const pid of planIdsToAudit) {
    const pRef = db.collection('plans').doc(pid);
    const pDoc = await pRef.get();
    if (!pDoc.exists) {
      flag('error', `plans/${pid}`, 'plan missing');
      continue;
    }
    console.log(`• plans/${pid}  "${pDoc.data().title || ''}"`);
    const stats = await walkContainerTree(pRef, `plans/${pid}`, libraryExerciseKeys, libNamesByKey);
    console.log(`  modules=${stats.moduleCount} sessions=${stats.sessionCount} exercises=${stats.exerciseCount} sets=${stats.setCount}`);
  }

  // Final report
  console.log('\n' + '='.repeat(64));
  console.log('AUDIT SUMMARY');
  console.log('='.repeat(64));
  console.log(`Library exercises:    ${libraryExerciseKeys.size}`);
  console.log(`  - no video_url:     ${exercisesWithoutVideo.length}`);
  console.log(`  - no muscle data:   ${exercisesWithoutMuscles.length}`);
  console.log(`Library sessions:     ${libSessionsSnap.size}`);
  console.log(`Library modules:      ${libModulesSnap.size}`);
  console.log(`Courses audited:      ${coursesSnap.size}`);
  console.log('');

  const errors = issues.filter((i) => i.severity === 'error');
  const warns = issues.filter((i) => i.severity === 'warn');
  const infos = issues.filter((i) => i.severity === 'info');

  console.log(`Issues: ${errors.length} errors, ${warns.length} warnings, ${infos.length} info`);
  console.log('');

  if (errors.length) {
    console.log('--- ERRORS ---');
    errors.slice(0, 200).forEach((i) => console.log(`  [ERR] ${i.scope}: ${i.msg}`));
    if (errors.length > 200) console.log(`  ... and ${errors.length - 200} more`);
    console.log('');
  }
  if (warns.length) {
    console.log('--- WARNINGS ---');
    warns.slice(0, 200).forEach((i) => console.log(`  [WARN] ${i.scope}: ${i.msg}`));
    if (warns.length > 200) console.log(`  ... and ${warns.length - 200} more`);
    console.log('');
  }
  if (VERBOSE && infos.length) {
    console.log('--- INFO ---');
    infos.forEach((i) => console.log(`  [info] ${i.scope}: ${i.msg}`));
    console.log('');
  } else if (infos.length) {
    console.log(`(${infos.length} info-level notes hidden — rerun with --verbose to see)`);
    console.log('');
  }

  console.log('Per-course totals:');
  summary.forEach((s) => {
    console.log(`  ${s.id}  "${s.title}"  ${s.deliveryType}/${s.status}  → ${s.moduleCount}m / ${s.sessionCount}s / ${s.exerciseCount}e / ${s.setCount}sets`);
  });

  // List library exercises without video / muscle data (these are real audit findings)
  if (exercisesWithoutVideo.length) {
    console.log(`\nLibrary exercises without video_url (${exercisesWithoutVideo.length}):`);
    exercisesWithoutVideo.slice(0, 50).forEach((e) => console.log(`  - ${e.name}  (${e.key})`));
    if (exercisesWithoutVideo.length > 50) console.log(`  ... and ${exercisesWithoutVideo.length - 50} more`);
  }
  if (exercisesWithoutMuscles.length) {
    console.log(`\nLibrary exercises without muscle_activation (${exercisesWithoutMuscles.length}):`);
    exercisesWithoutMuscles.slice(0, 50).forEach((e) => console.log(`  - ${e.name}  (${e.key})`));
    if (exercisesWithoutMuscles.length > 50) console.log(`  ... and ${exercisesWithoutMuscles.length - 50} more`);
  }

  console.log('\n✓ done (read-only)\n');
  process.exit(errors.length ? 2 : 0);
})().catch((err) => {
  console.error('ERROR:', err);
  process.exit(1);
});
