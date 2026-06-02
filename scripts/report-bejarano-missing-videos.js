#!/usr/bin/env node
'use strict';

/**
 * READ-ONLY post-update report:
 *   - Per module: list exercises without video_url
 *   - Maps published_at to calendar month
 *
 * Usage: NODE_PATH=functions/node_modules node scripts/report-bejarano-missing-videos.js
 */

const admin = require('firebase-admin');
const PROJECT_ID = 'wolf-20b8b';
const COURSE_ID = 'NTQIWMZBOxntwmUiXQZp';
const LIB_ID = 'jeoVyzhUrBeJofT62MOe';
const META = new Set(['creator_id', 'creator_name', 'title', 'created_at', 'updated_at', 'icon', 'exercises']);

admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId: PROJECT_ID });
const db = admin.firestore();

function tsToISO(t) {
  if (!t) return 'null';
  if (t.toDate) return t.toDate().toISOString().slice(0, 10);
  if (t._seconds) return new Date(t._seconds * 1000).toISOString().slice(0, 10);
  return String(t);
}

(async () => {
  const libDoc = await db.collection('exercises_library').doc(LIB_ID).get();
  const libData = libDoc.data() || {};
  const libByKey = new Map();
  if (libData.exercises) {
    for (const [id, e] of Object.entries(libData.exercises)) {
      libByKey.set(id, {
        name: e?.displayName || e?.name || '(unnamed)',
        hasVideo: !!(e?.video_url || e?.videoUrl),
      });
    }
  }
  for (const k of Object.keys(libData)) {
    if (META.has(k)) continue;
    const v = libData[k];
    if (v && typeof v === 'object' && !libByKey.has(k)) {
      libByKey.set(k, { name: v.name || k, hasVideo: !!v.video_url });
    }
  }

  const modulesSnap = await db.collection(`courses/${COURSE_ID}/modules`).orderBy('order', 'asc').get();
  for (const modDoc of modulesSnap.docs) {
    const md = modDoc.data();
    const pubISO = tsToISO(md.published_at);
    console.log(`\n=== ${md.title}  (order=${md.order}, published_at=${pubISO}, status=${md.status || 'n/a'}) ===`);
    const sessSnap = await modDoc.ref.collection('sessions').orderBy('order', 'asc').get();
    const seen = new Set();
    const missing = [];
    for (const sDoc of sessSnap.docs) {
      const exSnap = await sDoc.ref.collection('exercises').orderBy('order', 'asc').get();
      for (const eDoc of exSnap.docs) {
        const k = (eDoc.data().primary || {})[LIB_ID];
        if (!k || seen.has(k)) continue;
        seen.add(k);
        const info = libByKey.get(k);
        if (!info) continue;
        if (!info.hasVideo) missing.push({ key: k, name: info.name, session: sDoc.data().title });
      }
    }
    missing.sort((a, b) => a.name.localeCompare(b.name, 'es'));
    console.log(`  Total único en plan: ${seen.size}  ·  Sin video: ${missing.length}`);
    for (const m of missing) {
      console.log(`   ✗ ${m.name}  (${m.session})`);
    }
  }
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
