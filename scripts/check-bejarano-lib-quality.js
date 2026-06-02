#!/usr/bin/env node
'use strict';

/**
 * READ-ONLY: reports video_url / muscle_activation coverage of Felipe's
 * library, reading from the `exercises.{id}` sub-map (the canonical
 * post-migration shape) instead of the legacy top-level keys.
 *
 * Usage: NODE_PATH=functions/node_modules node scripts/check-bejarano-lib-quality.js
 */
const admin = require('firebase-admin');

const LIB_ID = 'jeoVyzhUrBeJofT62MOe';
const PROJECT_ID = 'wolf-20b8b';

admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  projectId: PROJECT_ID,
});
const db = admin.firestore();

(async () => {
  const doc = await db.collection('exercises_library').doc(LIB_ID).get();
  if (!doc.exists) { console.error('library missing'); process.exit(1); }
  const exMap = doc.data().exercises || {};
  const ids = Object.keys(exMap);
  let withVideo = 0;
  let withMuscles = 0;
  const noVideo = [];
  const noMuscles = [];
  ids.forEach((id) => {
    const e = exMap[id] || {};
    const hasVideo = !!(e.video_url || e.videoUrl);
    const hasMuscles = e.muscle_activation && Object.keys(e.muscle_activation).length > 0;
    if (hasVideo) withVideo++;
    else noVideo.push({ id, name: e.displayName || e.name || '?' });
    if (hasMuscles) withMuscles++;
    else noMuscles.push({ id, name: e.displayName || e.name || '?' });
  });
  console.log(`exercises_library/${LIB_ID} — exercises.{id} sub-map`);
  console.log(`  total entries:            ${ids.length}`);
  console.log(`  with video_url:           ${withVideo}`);
  console.log(`  without video_url:        ${noVideo.length}`);
  console.log(`  with muscle_activation:   ${withMuscles}`);
  console.log(`  without muscle_activation:${noMuscles.length}`);

  if (noVideo.length) {
    console.log(`\nMissing video (showing first 25):`);
    noVideo.slice(0, 25).forEach((e) => console.log(`  - ${e.id}  "${e.name}"`));
    if (noVideo.length > 25) console.log(`  ... ${noVideo.length - 25} more`);
  }
  if (noMuscles.length) {
    console.log(`\nMissing muscle_activation (showing first 25):`);
    noMuscles.slice(0, 25).forEach((e) => console.log(`  - ${e.id}  "${e.name}"`));
    if (noMuscles.length > 25) console.log(`  ... ${noMuscles.length - 25} more`);
  }

  // Show shape of one entry that has data
  const richEntry = ids.find((id) => exMap[id].video_url) || ids[0];
  console.log(`\nSample entry ${richEntry}:`);
  console.log(JSON.stringify(exMap[richEntry], null, 2).slice(0, 700));
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
