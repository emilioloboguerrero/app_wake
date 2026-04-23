#!/usr/bin/env node
'use strict';

/**
 * READ-ONLY dump of Felipe Bejarano's creator library state.
 * Writes NOTHING. Only uses .get() / .where() / .listCollections().
 *
 * Usage: node scripts/dump-felipe-library.js
 */

const admin = require('firebase-admin');

const EMAIL = 'fbejaranofit@gmail.com';
const PROJECT_ID = 'wolf-20b8b';

admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  projectId: PROJECT_ID,
});

const db = admin.firestore();

function short(obj, max = 400) {
  const s = JSON.stringify(obj, null, 2);
  return s.length > max ? s.slice(0, max) + '\n... [truncated]' : s;
}

(async () => {
  console.log(`\nProject: ${PROJECT_ID}`);
  console.log(`Looking up user by email: ${EMAIL}\n`);

  // 1) UID
  const userQuery = await db.collection('users').where('email', '==', EMAIL).limit(1).get();
  if (userQuery.empty) {
    console.error('ERROR: no user found with that email');
    process.exit(1);
  }
  const userDoc = userQuery.docs[0];
  const uid = userDoc.id;
  const userData = userDoc.data();
  console.log('=== USER ===');
  console.log(`uid:        ${uid}`);
  console.log(`email:      ${userData.email}`);
  console.log(`role:       ${userData.role}`);
  console.log(`name:       ${userData.displayName || userData.name || '(none)'}`);
  console.log('');

  // 2) objective_presets
  console.log('=== OBJECTIVE PRESETS ===');
  const presetsSnap = await db
    .collection('creator_libraries').doc(uid)
    .collection('objective_presets')
    .orderBy('created_at', 'desc')
    .get();
  console.log(`count: ${presetsSnap.size}`);
  presetsSnap.docs.forEach((d, i) => {
    console.log(`\n[preset ${i}] id=${d.id}`);
    console.log(short(d.data(), 800));
  });
  console.log('');

  // 3) exercises_library
  console.log('=== EXERCISES LIBRARY ===');
  const libSnap = await db
    .collection('exercises_library')
    .where('creator_id', '==', uid)
    .get();
  console.log(`library docs: ${libSnap.size}`);
  const META_KEYS = new Set(['creator_id', 'creator_name', 'title', 'created_at', 'updated_at', 'icon']);
  for (const libDoc of libSnap.docs) {
    const data = libDoc.data();
    const exerciseNames = Object.keys(data).filter((k) => !META_KEYS.has(k) && typeof data[k] === 'object' && data[k] !== null);
    console.log(`\n[library ${libDoc.id}]`);
    console.log(`  title:       ${data.title || '(none)'}`);
    console.log(`  exercises:   ${exerciseNames.length}`);
    exerciseNames.forEach((name) => {
      const ex = data[name] || {};
      const muscles = ex.muscle_activation ? Object.keys(ex.muscle_activation) : [];
      const implements_ = Array.isArray(ex.implements) ? ex.implements : [];
      const hasVideo = Boolean(ex.video_url);
      console.log(`    - ${name}  [video:${hasVideo ? 'Y' : 'N'}, muscles:${muscles.length}, implements:${implements_.length > 0 ? implements_.join('/') : '-'}]`);
    });
  }
  console.log('');

  // 4) library sessions (brief)
  console.log('=== LIBRARY SESSIONS ===');
  const sessionsSnap = await db
    .collection('creator_libraries').doc(uid)
    .collection('sessions')
    .get();
  console.log(`sessions: ${sessionsSnap.size}`);
  for (const sDoc of sessionsSnap.docs) {
    const s = sDoc.data();
    console.log(`\n[session ${sDoc.id}]`);
    console.log(`  title:       ${s.title || '(none)'}`);
    console.log(`  image_url:   ${s.image_url ? 'yes' : 'no'}`);
    console.log(`  order:       ${s.order ?? 'n/a'}`);
    console.log(`  isRestDay:   ${s.isRestDay ?? false}`);
    console.log(`  defaultDataTemplate: ${short(s.defaultDataTemplate || null, 300)}`);

    const exSnap = await sDoc.ref.collection('exercises').orderBy('order', 'asc').get();
    console.log(`  exercises:   ${exSnap.size}`);
    for (const eDoc of exSnap.docs) {
      const e = eDoc.data();
      const setsSnap = await eDoc.ref.collection('sets').orderBy('order', 'asc').get();
      console.log(`    - [${e.order ?? '?'}] ${e.name || '(no name)'}`);
      console.log(`        exerciseId:     ${eDoc.id}`);
      console.log(`        libraryId:      ${e.libraryId || '-'}`);
      console.log(`        primary:        ${e.primary ? JSON.stringify(e.primary) : '-'}`);
      console.log(`        primaryMuscles: ${Array.isArray(e.primaryMuscles) ? e.primaryMuscles.join(',') : '-'}`);
      console.log(`        notes:          ${e.notes || '-'}`);
      console.log(`        measures:       ${Array.isArray(e.measures) ? e.measures.join(',') : '(inherit)'}`);
      console.log(`        objectives:     ${Array.isArray(e.objectives) ? e.objectives.join(',') : '(inherit)'}`);
      console.log(`        defaultSetValues: ${e.defaultSetValues ? JSON.stringify(e.defaultSetValues) : '-'}`);
      console.log(`        sets: ${setsSnap.size}`);
      setsSnap.docs.forEach((sd) => {
        const { created_at, updated_at, ...rest } = sd.data();
        console.log(`          • ${JSON.stringify(rest)}`);
      });
    }
  }
  console.log('');

  // 5) modules (brief)
  console.log('=== LIBRARY MODULES ===');
  const modulesSnap = await db
    .collection('creator_libraries').doc(uid)
    .collection('modules')
    .get();
  console.log(`modules: ${modulesSnap.size}`);
  modulesSnap.docs.forEach((m) => {
    const d = m.data();
    console.log(`  [${m.id}] title="${d.title || ''}" sessionRefs=${Array.isArray(d.sessionRefs) ? d.sessionRefs.length : 'n/a'}`);
  });

  console.log('\n✓ done (read-only, no writes performed)\n');
  process.exit(0);
})().catch((err) => {
  console.error('ERROR:', err);
  process.exit(1);
});
