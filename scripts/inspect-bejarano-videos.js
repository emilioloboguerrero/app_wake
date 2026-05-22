#!/usr/bin/env node
'use strict';

/**
 * READ-ONLY: list every exercise referenced by Método Bejarano (M1+M2+M3) sessions,
 * resolve names from the library, and report which already have video_url.
 *
 * Usage: NODE_PATH=functions/node_modules node scripts/inspect-bejarano-videos.js
 */

const admin = require('firebase-admin');

const PROJECT_ID = 'wolf-20b8b';
const COURSE_ID = 'NTQIWMZBOxntwmUiXQZp';
const LIB_ID = 'jeoVyzhUrBeJofT62MOe';

admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId: PROJECT_ID });
const db = admin.firestore();

(async () => {
  // 1) Load library — both new sub-map and legacy name-keyed entries
  const libDoc = await db.collection('exercises_library').doc(LIB_ID).get();
  const libData = libDoc.data() || {};
  const META = new Set(['creator_id', 'creator_name', 'title', 'created_at', 'updated_at', 'icon', 'exercises']);

  const libByKey = new Map(); // key -> { name, hasVideo }
  if (libData.exercises && typeof libData.exercises === 'object') {
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

  // 2) Walk M1+M2+M3 modules → sessions → exercises
  const modulesSnap = await db.collection(`courses/${COURSE_ID}/modules`).orderBy('order', 'asc').get();
  const usedKeys = new Map(); // key -> { name, sessions: Set<string> }

  for (const modDoc of modulesSnap.docs) {
    const modTitle = modDoc.data().title || modDoc.id;
    const sessSnap = await modDoc.ref.collection('sessions').orderBy('order', 'asc').get();
    for (const sDoc of sessSnap.docs) {
      const sTitle = sDoc.data().title || sDoc.id;
      const exSnap = await sDoc.ref.collection('exercises').orderBy('order', 'asc').get();
      for (const eDoc of exSnap.docs) {
        const d = eDoc.data();
        const primary = d.primary || {};
        const libKey = primary[LIB_ID];
        if (!libKey) continue;
        const entry = usedKeys.get(libKey) || { name: libByKey.get(libKey)?.name || '(unresolved)', sessions: new Set() };
        entry.sessions.add(`${modTitle} / ${sTitle}`);
        usedKeys.set(libKey, entry);
      }
    }
  }

  // 3) Report
  console.log(`\n=== Ejercicios usados en Método Bejarano (M1+M2+M3) ===`);
  console.log(`Total único: ${usedKeys.size}\n`);

  const rows = [...usedKeys.entries()].map(([key, info]) => ({
    key,
    name: info.name,
    hasVideo: libByKey.get(key)?.hasVideo || false,
    sessions: [...info.sessions],
  }));
  rows.sort((a, b) => a.name.localeCompare(b.name, 'es'));

  for (const r of rows) {
    const tag = r.hasVideo ? '[VIDEO]' : '[     ]';
    console.log(`${tag}  ${r.name}`);
    console.log(`           key=${r.key}  · sesiones: ${r.sessions.join(' | ')}`);
  }

  console.log(`\n=== Resumen ===`);
  console.log(`Con video: ${rows.filter(r => r.hasVideo).length}`);
  console.log(`Sin video: ${rows.filter(r => !r.hasVideo).length}`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
