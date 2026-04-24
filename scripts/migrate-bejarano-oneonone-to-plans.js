#!/usr/bin/env node
'use strict';

/**
 * Migrate Felipe Bejarano's 6 one-on-one "template" courses from the `courses/`
 * collection into the `plans/` collection where they belong.
 *
 * These 6 courses were mistakenly modeled as courses but are actually reusable
 * one-on-one workout blueprints (deliveryType="one_on_one", price=null). This
 * script deep-clones each course's full module/session/exercise/set subtree into
 * a new plan document under `plans/{planId}/modules/.../sets/{setId}`.
 *
 * Does NOT delete the source courses. Deletion is a separate explicit step after
 * UI smoke-test and user approval — see DELETION section at bottom (commented).
 *
 * Idempotency: skips creating a plan if one already exists for Felipe with the
 * same title. Safe to re-run.
 *
 * Usage:
 *   NODE_PATH=functions/node_modules node scripts/migrate-bejarano-oneonone-to-plans.js
 *   NODE_PATH=functions/node_modules node scripts/migrate-bejarano-oneonone-to-plans.js --write
 *   NODE_PATH=functions/node_modules node scripts/migrate-bejarano-oneonone-to-plans.js --only=casa --write
 *
 * Requires: gcloud ADC pointing at wolf-20b8b. Admin SDK bypasses Firestore rules
 * and the API — we still follow the canonical plan-subtree shape documented in
 * functions/src/api/routes/creator.ts lines 3126-3993.
 */

const admin = require('firebase-admin');

const FELIPE_UID = 'yMqKOXBcVARa6vjU7wImf3Tp85J2';
const CREATOR_NAME = 'Juan Felipe Bejarano';
const PROJECT_ID = 'wolf-20b8b';

admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  projectId: PROJECT_ID,
});
const db = admin.firestore();
const { FieldValue } = admin.firestore;

// ─────────────────────────────────────────────────────────────────────
// The 6 source courses, keyed for --only=<key> selection.

const SOURCES = [
  { key: 'casa',  courseId: 'pywKGZIEjGBnMm3hGWeT', title: 'Full body en casa (5 días)' },
  { key: 'gym3',  courseId: 'b3LnilkJHyly6UipAXw5', title: 'Full body gym (3 días)' },
  { key: 'ul4',   courseId: 'EZTLBiFK8XBLXfsE9ZGi', title: 'Superior-Inferior (4 días)' },
  { key: 'ppl5',  courseId: '10RBUhq2fuNQkoDTcLo0', title: 'PPL + Superior (5 días)' },
  { key: 'ppl6',  courseId: 'ivbVBfs1qhtEithY02hG', title: 'Push-Pull-Legs (6 días)' },
  { key: 'glute', courseId: 'xu01BObiQd9n9ToKc3Iq', title: 'Glute Optimization (5 días)' },
];

const BATCH_LIMIT = 450;

// ─────────────────────────────────────────────────────────────────────
// Helpers

function stripTimestamps(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj;
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (k === 'created_at' || k === 'updated_at' || k === 'id') continue;
    out[k] = v;
  }
  return out;
}

function pickPlanFields(courseData) {
  return {
    title: courseData.title,
    description: courseData.description || '',
    discipline: courseData.discipline || null,
    creator_id: FELIPE_UID,
    creatorName: CREATOR_NAME,
  };
}

async function findExistingPlan(title) {
  const snap = await db.collection('plans')
    .where('creator_id', '==', FELIPE_UID)
    .where('title', '==', title)
    .limit(1)
    .get();
  return snap.empty ? null : snap.docs[0];
}

async function readCourseSubtree(courseId) {
  const courseRef = db.collection('courses').doc(courseId);
  const courseDoc = await courseRef.get();
  if (!courseDoc.exists) throw new Error(`Course ${courseId} not found`);
  const courseData = courseDoc.data();

  const modulesSnap = await courseRef.collection('modules').orderBy('order', 'asc').get();
  const modules = [];
  for (const mDoc of modulesSnap.docs) {
    const sessionsSnap = await mDoc.ref.collection('sessions').orderBy('order', 'asc').get();
    const sessions = [];
    for (const sDoc of sessionsSnap.docs) {
      const exSnap = await sDoc.ref.collection('exercises').orderBy('order', 'asc').get();
      const exercises = [];
      for (const eDoc of exSnap.docs) {
        const setsSnap = await eDoc.ref.collection('sets').orderBy('order', 'asc').get();
        exercises.push({ id: eDoc.id, data: eDoc.data(), sets: setsSnap.docs.map((sd) => ({ id: sd.id, data: sd.data() })) });
      }
      sessions.push({ id: sDoc.id, data: sDoc.data(), exercises });
    }
    modules.push({ id: mDoc.id, data: mDoc.data(), sessions });
  }
  return { courseData, modules };
}

// ─────────────────────────────────────────────────────────────────────
// Describe pending writes (dry-run output)

function describePlan(source, tree) {
  const { courseData, modules } = tree;
  const planFields = pickPlanFields(courseData);
  console.log(`\n══ ${source.title} (course ${source.courseId}) ══`);
  console.log(`  → plan doc:`);
  console.log(`      title:       ${planFields.title}`);
  console.log(`      description: ${planFields.description ? JSON.stringify(planFields.description) : '(empty)'}`);
  console.log(`      discipline:  ${planFields.discipline}`);
  console.log(`      creator_id:  ${planFields.creator_id}`);
  console.log(`      creatorName: ${planFields.creatorName}`);

  let totalEx = 0; let totalSets = 0;
  for (const mod of modules) {
    console.log(`  → module "${mod.data.title}" (order ${mod.data.order}) — ${mod.sessions.length} sessions`);
    for (const sess of mod.sessions) {
      const sd = sess.data;
      const libRef = sd.librarySessionRef || sd.source_library_session_id || '—';
      const exCount = sess.exercises.length;
      const setCount = sess.exercises.reduce((n, e) => n + e.sets.length, 0);
      totalEx += exCount; totalSets += setCount;
      console.log(`      [${sd.order}] dayIndex=${sd.order}  "${sd.title}"  libRef=${libRef}  ex=${exCount} sets=${setCount}`);
    }
  }
  console.log(`  totals: ${modules.length} module(s), ${modules.reduce((n,m)=>n+m.sessions.length,0)} sessions, ${totalEx} exercises, ${totalSets} sets`);
}

// ─────────────────────────────────────────────────────────────────────
// Write path

async function writePlan(source, tree) {
  const { courseData, modules } = tree;

  const existing = await findExistingPlan(source.title);
  if (existing) {
    console.log(`  SKIP (plan already exists): ${existing.id}`);
    return { planId: existing.id, skipped: true };
  }

  const planFields = pickPlanFields(courseData);
  const planRef = db.collection('plans').doc();
  await planRef.set({
    ...planFields,
    created_at: FieldValue.serverTimestamp(),
    updated_at: FieldValue.serverTimestamp(),
  });
  console.log(`  + plan ${planRef.id} written`);

  for (const mod of modules) {
    const modRef = planRef.collection('modules').doc();
    await modRef.set({
      title: mod.data.title || 'Semana 1',
      order: mod.data.order ?? 0,
      created_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp(),
    });
    console.log(`    + module ${modRef.id} "${mod.data.title}"`);

    for (const sess of mod.sessions) {
      const sd = sess.data;
      const sessionRef = modRef.collection('sessions').doc();
      const libRef = sd.librarySessionRef || sd.source_library_session_id || null;

      const sessionPayload = {
        title: sd.title,
        order: sd.order ?? 0,
        dayIndex: sd.order ?? 0,
        ...(libRef && {
          librarySessionRef: libRef,
          source_library_session_id: libRef,
        }),
        ...(sd.defaultDataTemplate && { defaultDataTemplate: sd.defaultDataTemplate }),
        ...(sd.image_url && { image_url: sd.image_url }),
        created_at: FieldValue.serverTimestamp(),
        updated_at: FieldValue.serverTimestamp(),
      };
      await sessionRef.set(sessionPayload);

      // Deep-clone exercises + sets using batches of 450 writes.
      let batch = db.batch();
      let count = 0;

      for (const ex of sess.exercises) {
        const exRef = sessionRef.collection('exercises').doc();
        const exPayload = {
          ...stripTimestamps(ex.data),
          id: exRef.id,
          created_at: FieldValue.serverTimestamp(),
          updated_at: FieldValue.serverTimestamp(),
        };
        batch.set(exRef, exPayload);
        count++;
        if (count >= BATCH_LIMIT) { await batch.commit(); batch = db.batch(); count = 0; }

        for (const set of ex.sets) {
          const setRef = exRef.collection('sets').doc();
          const setPayload = {
            ...stripTimestamps(set.data),
            id: setRef.id,
            created_at: FieldValue.serverTimestamp(),
            updated_at: FieldValue.serverTimestamp(),
          };
          batch.set(setRef, setPayload);
          count++;
          if (count >= BATCH_LIMIT) { await batch.commit(); batch = db.batch(); count = 0; }
        }
      }
      if (count > 0) await batch.commit();
      console.log(`      + session ${sessionRef.id} "${sd.title}" (ex=${sess.exercises.length}, sets=${sess.exercises.reduce((n,e)=>n+e.sets.length,0)})`);
    }
  }

  return { planId: planRef.id, skipped: false };
}

// ─────────────────────────────────────────────────────────────────────
// Main

(async () => {
  const args = new Set(process.argv.slice(2));
  const write = args.has('--write');
  const onlyArg = [...args].find((a) => a.startsWith('--only='));
  const onlyKey = onlyArg ? onlyArg.split('=')[1] : null;

  console.log(`Project: ${PROJECT_ID}  felipeUid: ${FELIPE_UID}`);
  console.log(`Mode:    ${write ? 'WRITE' : 'DRY RUN'}`);
  if (onlyKey) console.log(`Only:    ${onlyKey}`);

  const targets = onlyKey ? SOURCES.filter((s) => s.key === onlyKey) : SOURCES;
  if (targets.length === 0) {
    console.error(`No sources matched --only=${onlyKey}`);
    console.error(`Valid keys: ${SOURCES.map((s) => s.key).join(', ')}`);
    process.exit(1);
  }

  const results = [];
  for (const source of targets) {
    try {
      const tree = await readCourseSubtree(source.courseId);
      describePlan(source, tree);
      if (write) {
        const r = await writePlan(source, tree);
        results.push({ key: source.key, title: source.title, planId: r.planId, status: r.skipped ? 'skipped' : 'written' });
      } else {
        results.push({ key: source.key, title: source.title, planId: null, status: 'dry-run' });
      }
    } catch (err) {
      console.error(`  ERROR ${source.key}: ${err.message}`);
      results.push({ key: source.key, title: source.title, planId: null, status: 'error', error: err.message });
    }
  }

  console.log(`\n═══ SUMMARY ═══`);
  for (const r of results) {
    const id = r.planId ?? '—';
    console.log(`  [${r.status.padEnd(8)}]  ${r.key.padEnd(6)}  ${id.padEnd(22)}  "${r.title}"${r.error ? '  ERROR: ' + r.error : ''}`);
  }
  console.log(`\n${write ? 'DONE.' : 'DRY RUN complete. Re-run with --write to commit.'}`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });

// ─────────────────────────────────────────────────────────────────────
// DELETION of source courses (separate, explicit, manual step — DO NOT
// uncomment until after:
//   1. This script has run with --write.
//   2. Plans render correctly in the creator dashboard for Felipe.
//   3. The user has explicitly approved deletion ("yes delete").
//
// See the cascading delete pattern in functions/src/api/routes/creator.ts
// lines 3287-3338 (DELETE /creator/plans/:planId). Same batch-of-450 shape.
// ─────────────────────────────────────────────────────────────────────
