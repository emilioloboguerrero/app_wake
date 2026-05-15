#!/usr/bin/env node
'use strict';

/**
 * READ-ONLY inspection of Felipe Bejarano's exercises_library doc and the
 * gap between course exercise primary[LIB_ID] IDs and the library's keyspace.
 *
 * Goals:
 *   1. Does the library doc have an `exercises.{id}` sub-map (post-migration shape)?
 *      If yes, list its keys and a sample displayName.
 *   2. Does it have legacy top-level name-keyed entries?
 *   3. What set of `primary[LIB_ID]` values do course exercises reference, and
 *      do those keys exist in either shape?
 *   4. Same for library-session exercises.
 *
 * Usage: NODE_PATH=functions/node_modules node scripts/inspect-bejarano-lib.js
 */

const admin = require('firebase-admin');

const FELIPE_UID = 'yMqKOXBcVARa6vjU7wImf3Tp85J2';
const LIB_ID = 'jeoVyzhUrBeJofT62MOe';
const PROJECT_ID = 'wolf-20b8b';
const META = new Set(['creator_id', 'creator_name', 'title', 'created_at', 'updated_at', 'icon', 'exercises']);

admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId: PROJECT_ID });
const db = admin.firestore();

(async () => {
  console.log(`\n=== exercises_library/${LIB_ID} raw shape ===\n`);
  const libDoc = await db.collection('exercises_library').doc(LIB_ID).get();
  if (!libDoc.exists) { console.error('Library doc missing'); process.exit(1); }
  const data = libDoc.data();
  const topKeys = Object.keys(data);
  console.log(`Total top-level keys: ${topKeys.length}`);
  console.log(`Metadata keys present:`, topKeys.filter((k) => META.has(k)));
  console.log(`Has 'exercises' sub-map?  ${typeof data.exercises === 'object' && data.exercises !== null}`);
  if (data.exercises && typeof data.exercises === 'object') {
    const exIds = Object.keys(data.exercises);
    console.log(`'exercises' sub-map entries: ${exIds.length}`);
    console.log(`Sample entries (first 5):`);
    exIds.slice(0, 5).forEach((id) => {
      const e = data.exercises[id];
      console.log(`  ${id}  displayName="${e?.displayName || e?.name || '(none)'}"`);
    });
  }
  const legacyNameKeys = topKeys.filter((k) => !META.has(k) && typeof data[k] === 'object' && data[k] !== null);
  console.log(`Legacy top-level name-keyed entries: ${legacyNameKeys.length}`);
  if (legacyNameKeys.length > 0) {
    console.log(`Sample legacy names (first 5):`);
    legacyNameKeys.slice(0, 5).forEach((n) => console.log(`  "${n}"`));
  }

  // Collect referenced IDs from courses + library sessions
  console.log(`\n=== Referenced primary[${LIB_ID}] values across courses ===\n`);
  const referencedPrimary = new Map(); // id -> count
  const referencedAlts = new Map();
  const coursesSnap = await db.collection('courses').where('creator_id', '==', FELIPE_UID).get();
  for (const cDoc of coursesSnap.docs) {
    const modsSnap = await cDoc.ref.collection('modules').get();
    for (const mDoc of modsSnap.docs) {
      const sessSnap = await mDoc.ref.collection('sessions').get();
      for (const sDoc of sessSnap.docs) {
        const exSnap = await sDoc.ref.collection('exercises').get();
        for (const eDoc of exSnap.docs) {
          const e = eDoc.data();
          const pVal = e.primary?.[LIB_ID];
          if (pVal) referencedPrimary.set(pVal, (referencedPrimary.get(pVal) || 0) + 1);
          const altList = e.alternatives?.[LIB_ID];
          if (Array.isArray(altList)) altList.forEach((a) => referencedAlts.set(a, (referencedAlts.get(a) || 0) + 1));
        }
      }
    }
  }
  console.log(`Distinct primary IDs referenced by courses: ${referencedPrimary.size}`);
  console.log(`Distinct alternative IDs referenced by courses: ${referencedAlts.size}`);

  // Library sessions
  const libSessionsSnap = await db.collection('creator_libraries').doc(FELIPE_UID).collection('sessions').get();
  const libRefPrimary = new Map();
  const libRefAlts = new Map();
  for (const sDoc of libSessionsSnap.docs) {
    const exSnap = await sDoc.ref.collection('exercises').get();
    for (const eDoc of exSnap.docs) {
      const e = eDoc.data();
      const pVal = e.primary?.[LIB_ID];
      if (pVal) libRefPrimary.set(pVal, (libRefPrimary.get(pVal) || 0) + 1);
      const altList = e.alternatives?.[LIB_ID];
      if (Array.isArray(altList)) altList.forEach((a) => libRefAlts.set(a, (libRefAlts.get(a) || 0) + 1));
    }
  }
  console.log(`Distinct primary IDs referenced by library sessions: ${libRefPrimary.size}`);
  console.log(`Distinct alternative IDs referenced by library sessions: ${libRefAlts.size}`);

  // Union and resolve against existing library shapes
  const allReferenced = new Set([
    ...referencedPrimary.keys(), ...referencedAlts.keys(),
    ...libRefPrimary.keys(), ...libRefAlts.keys(),
  ]);
  console.log(`\nUnion of all referenced IDs (primary + alt, courses + lib sessions): ${allReferenced.size}`);

  const existingSubMapKeys = new Set(data.exercises ? Object.keys(data.exercises) : []);
  const existingTopKeys = new Set(legacyNameKeys);

  let inSubMap = 0;
  let inTopKeys = 0;
  let missing = [];
  for (const id of allReferenced) {
    if (existingSubMapKeys.has(id)) inSubMap++;
    else if (existingTopKeys.has(id)) inTopKeys++;
    else missing.push(id);
  }
  console.log(`  Resolvable via exercises.{id} sub-map:  ${inSubMap}`);
  console.log(`  Resolvable via legacy top-level key:    ${inTopKeys}`);
  console.log(`  UNRESOLVABLE (missing entirely):        ${missing.length}`);
  if (missing.length > 0) {
    console.log(`  First 20 missing IDs:`);
    missing.slice(0, 20).forEach((id) => {
      const cCount = referencedPrimary.get(id) || 0;
      const aCount = referencedAlts.get(id) || 0;
      const lpCount = libRefPrimary.get(id) || 0;
      const laCount = libRefAlts.get(id) || 0;
      console.log(`    ${id}  course:p=${cCount}/a=${aCount}  libSess:p=${lpCount}/a=${laCount}`);
    });
  }

  // Distinguish primary vs alt for the unresolved set (primary is what breaks display)
  const unresolvedPrimary = new Set();
  for (const id of referencedPrimary.keys()) if (!existingSubMapKeys.has(id) && !existingTopKeys.has(id)) unresolvedPrimary.add(id);
  for (const id of libRefPrimary.keys()) if (!existingSubMapKeys.has(id) && !existingTopKeys.has(id)) unresolvedPrimary.add(id);
  console.log(`\nUnresolved IDs that are PRIMARY of some exercise (display-breaking): ${unresolvedPrimary.size}`);

  // For unresolved IDs, look in other places: creator_libraries/{FELIPE_UID}/exercises ?
  console.log(`\n=== Looking for IDs elsewhere ===`);
  const creatorExercisesSnap = await db.collection('creator_libraries').doc(FELIPE_UID).collection('exercises').get().catch(() => null);
  if (creatorExercisesSnap) {
    console.log(`creator_libraries/${FELIPE_UID}/exercises: ${creatorExercisesSnap.size} docs`);
    if (creatorExercisesSnap.size > 0) {
      let hits = 0;
      creatorExercisesSnap.docs.forEach((d) => { if (allReferenced.has(d.id)) hits++; });
      console.log(`  IDs matching referenced set: ${hits}`);
    }
  }
  // Maybe a backup
  const backupDoc = await db.collection('exercises_library_pre_id_migration').doc(LIB_ID).get().catch(() => null);
  if (backupDoc && backupDoc.exists) {
    const bdata = backupDoc.data();
    const bkeys = Object.keys(bdata).filter((k) => !META.has(k) && typeof bdata[k] === 'object');
    console.log(`exercises_library_pre_id_migration/${LIB_ID}: ${bkeys.length} entries — backup exists!`);
  } else {
    console.log(`exercises_library_pre_id_migration/${LIB_ID}: not present`);
  }
  // Library subcollection?
  const libSubcolls = await db.collection('exercises_library').doc(LIB_ID).listCollections();
  console.log(`exercises_library/${LIB_ID} subcollections: [${libSubcolls.map((c) => c.id).join(', ') || '(none)'}]`);

  console.log(`\n✓ done\n`);
  process.exit(0);
})().catch((err) => { console.error(err); process.exit(1); });
