#!/usr/bin/env node
'use strict';

/**
 * READ-ONLY: list every exercise in Felipe Bejarano's library, grouped by primary
 * muscle, marking which have video_url and which don't.
 */

const admin = require('firebase-admin');
const PROJECT_ID = 'wolf-20b8b';
const LIB_ID = 'jeoVyzhUrBeJofT62MOe';
const META = new Set(['creator_id', 'creator_name', 'title', 'created_at', 'updated_at', 'icon', 'exercises']);

admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId: PROJECT_ID });
const db = admin.firestore();

const MUSCLE_GROUPS = {
  pecs: 'Pecho',
  upper_chest: 'Pecho',
  lats: 'Espalda (Dorsal)',
  traps: 'Espalda (Trapecio)',
  rhomboids: 'Espalda (Romboides)',
  lower_back: 'Espalda (Lumbar)',
  front_delts: 'Hombro (Anterior)',
  side_delts: 'Hombro (Lateral)',
  rear_delts: 'Hombro (Posterior)',
  biceps: 'Bíceps',
  triceps: 'Tríceps',
  forearms: 'Antebrazos',
  quads: 'Pierna (Cuádriceps)',
  hamstrings: 'Pierna (Isquios)',
  glutes: 'Glúteos',
  calves: 'Pantorrillas',
  adductors: 'Aductores',
  abductors: 'Abductores',
  abs: 'Abdomen',
  obliques: 'Abdomen',
};

function primaryMuscle(muscleActivation) {
  if (!muscleActivation || typeof muscleActivation !== 'object') return 'Otros';
  let best = null, bestVal = 0;
  for (const [k, v] of Object.entries(muscleActivation)) {
    if (typeof v === 'number' && v > bestVal) { best = k; bestVal = v; }
  }
  return MUSCLE_GROUPS[best] || best || 'Otros';
}

(async () => {
  const libDoc = await db.collection('exercises_library').doc(LIB_ID).get();
  const data = libDoc.data() || {};
  const seenIds = new Set();
  const entries = [];
  if (data.exercises) {
    for (const [id, e] of Object.entries(data.exercises)) {
      seenIds.add(id);
      entries.push({
        id,
        name: e?.displayName || e?.name || id,
        hasVideo: !!(e?.video_url || e?.videoUrl),
        muscle: primaryMuscle(e?.muscle_activation),
        implements: e?.implements || [],
      });
    }
  }
  // also include legacy-only entries
  for (const k of Object.keys(data)) {
    if (META.has(k) || seenIds.has(k)) continue;
    const v = data[k];
    if (v && typeof v === 'object') {
      entries.push({
        id: k,
        name: v.name || k,
        hasVideo: !!v.video_url,
        muscle: primaryMuscle(v.muscle_activation),
        implements: v.implements || [],
      });
    }
  }

  const byMuscle = {};
  for (const e of entries) {
    byMuscle[e.muscle] = byMuscle[e.muscle] || [];
    byMuscle[e.muscle].push(e);
  }
  const order = ['Pecho', 'Espalda (Dorsal)', 'Espalda (Trapecio)', 'Espalda (Romboides)', 'Espalda (Lumbar)',
                 'Hombro (Anterior)', 'Hombro (Lateral)', 'Hombro (Posterior)',
                 'Bíceps', 'Tríceps', 'Antebrazos',
                 'Pierna (Cuádriceps)', 'Pierna (Isquios)', 'Glúteos', 'Pantorrillas', 'Aductores', 'Abductores',
                 'Abdomen', 'Otros'];

  const totalWithVideo = entries.filter((e) => e.hasVideo).length;
  const totalWithout = entries.length - totalWithVideo;

  console.log(`\nTotal en librería: ${entries.length}`);
  console.log(`Con video: ${totalWithVideo}  ·  Sin video: ${totalWithout}\n`);

  for (const muscle of order) {
    const arr = byMuscle[muscle];
    if (!arr || !arr.length) continue;
    arr.sort((a, b) => a.name.localeCompare(b.name, 'es'));
    const withV = arr.filter((e) => e.hasVideo).length;
    console.log(`\n=== ${muscle}  (${withV}/${arr.length} con video) ===`);
    for (const e of arr) {
      const tag = e.hasVideo ? '✓' : '✗';
      console.log(`  ${tag} ${e.name}`);
    }
  }
  // any muscle group not in `order`
  for (const muscle of Object.keys(byMuscle)) {
    if (order.includes(muscle)) continue;
    const arr = byMuscle[muscle];
    arr.sort((a, b) => a.name.localeCompare(b.name, 'es'));
    const withV = arr.filter((e) => e.hasVideo).length;
    console.log(`\n=== ${muscle}  (${withV}/${arr.length} con video) ===`);
    for (const e of arr) {
      console.log(`  ${e.hasVideo ? '✓' : '✗'} ${e.name}`);
    }
  }
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
