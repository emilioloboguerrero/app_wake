#!/usr/bin/env node
'use strict';

/**
 * READ-ONLY full inspection for the video-mapping work:
 *   - All modules of courses/NTQIWMZBOxntwmUiXQZp (title, published_at, unlocks_at)
 *   - Library exercises matching candidate names (abdominales, pec deck, etc.)
 *
 * Usage: NODE_PATH=functions/node_modules node scripts/inspect-bejarano-state.js
 */

const admin = require('firebase-admin');

const PROJECT_ID = 'wolf-20b8b';
const COURSE_ID = 'NTQIWMZBOxntwmUiXQZp';
const LIB_ID = 'jeoVyzhUrBeJofT62MOe';
const META = new Set(['creator_id', 'creator_name', 'title', 'created_at', 'updated_at', 'icon', 'exercises']);

admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId: PROJECT_ID });
const db = admin.firestore();

const CANDIDATES = [
  // abdominales
  'crunch', 'abdom', 'elevaci', 'pierna decl', 'pierna colg',
  // pec deck / vuelos en máquina
  'pec deck', 'pec-deck', 'vuelo', 'apertur',
  // posteriores
  'posterior', 'invertid', 'rear delt',
  // jalón unilateral
  'unilateral', 'jal',
  // smith
  'smith', 'mil',
];

(async () => {
  // Modules
  console.log('=== MÓDULOS del curso ===');
  const modSnap = await db.collection(`courses/${COURSE_ID}/modules`).orderBy('order', 'asc').get();
  for (const m of modSnap.docs) {
    const d = m.data();
    console.log(`order=${d.order}  id=${m.id}  title="${d.title}"  published_at=${d.published_at || 'null'}  unlocks_at=${d.unlocks_at || 'null'}  status=${d.status || 'n/a'}`);
    const sessSnap = await m.ref.collection('sessions').orderBy('order', 'asc').get();
    for (const s of sessSnap.docs) {
      const sd = s.data();
      const exSnap = await s.ref.collection('exercises').get();
      console.log(`   - session order=${sd.order}  id=${s.id}  title="${sd.title}"  exercises=${exSnap.size}`);
    }
  }

  console.log('\n=== BUSCAR candidatos en exercises_library ===');
  const libDoc = await db.collection('exercises_library').doc(LIB_ID).get();
  const data = libDoc.data() || {};
  const all = [];
  if (data.exercises && typeof data.exercises === 'object') {
    for (const [id, e] of Object.entries(data.exercises)) {
      all.push({ id, name: e?.displayName || e?.name || '(unnamed)', hasVideo: !!(e?.video_url || e?.videoUrl), shape: 'subMap' });
    }
  }
  for (const k of Object.keys(data)) {
    if (META.has(k)) continue;
    const v = data[k];
    if (v && typeof v === 'object' && !all.some((x) => x.id === k)) {
      all.push({ id: k, name: v.name || k, hasVideo: !!v.video_url, shape: 'legacy' });
    }
  }
  console.log(`Total entries: ${all.length}`);
  for (const c of CANDIDATES) {
    const matches = all.filter((x) => x.name.toLowerCase().includes(c.toLowerCase()));
    if (!matches.length) continue;
    console.log(`\n  match "${c}":`);
    for (const m of matches.slice(0, 12)) {
      const tag = m.hasVideo ? '[VIDEO]' : '[     ]';
      console.log(`    ${tag} ${m.shape}  ${m.id}  ${m.name}`);
    }
  }
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
