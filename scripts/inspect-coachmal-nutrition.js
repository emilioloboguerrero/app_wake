#!/usr/bin/env node
'use strict';

/**
 * READ-ONLY: deep dive on TI5dkYVwemUru8yRzi2lctLemO43 (coachmaleardila)
 *  - Full user doc
 *  - Scan ALL nutrition_assignments for ANY field matching this uid
 *  - Scan client_nutrition_plan_content for ANY field matching
 *  - List any nutrition_assignments where this user is the CREATOR
 *  - List any nutrition diary entries
 *  - Pinned assignment id resolution
 */

const admin = require('firebase-admin');
const PROJECT_ID = 'wolf-20b8b';
const UID = 'TI5dkYVwemUru8yRzi2lctLemO43';
admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId: PROJECT_ID });
const db = admin.firestore();

function safeIso(v) {
  if (!v) return null;
  if (typeof v === 'string') return v;
  if (typeof v.toDate === 'function') return v.toDate().toISOString();
  if (v._seconds) return new Date(v._seconds * 1000).toISOString();
  return String(v);
}

function findUidInDoc(data, uid) {
  const hits = [];
  function walk(node, path) {
    if (node === uid) hits.push(path);
    if (!node || typeof node !== 'object') return;
    for (const k of Object.keys(node)) walk(node[k], path ? `${path}.${k}` : k);
  }
  walk(data, '');
  return hits;
}

(async () => {
  console.log('=== USER DOC ===');
  const u = await db.collection('users').doc(UID).get();
  if (!u.exists) { console.log('no user'); process.exit(1); }
  const ud = u.data();
  console.log({
    email: ud.email,
    displayName: ud.displayName ?? ud.name,
    username: ud.username,
    role: ud.role,
    pinnedNutritionAssignmentId: ud.pinnedNutritionAssignmentId ?? null,
    pinnedTrainingCourseId: ud.pinnedTrainingCourseId ?? null,
    created_at: safeIso(ud.created_at),
  });
  console.log('courses keys:', Object.keys(ud.courses ?? {}));

  console.log('\n=== Scan ALL nutrition_assignments (looking for ANY field == UID) ===');
  const allSnap = await db.collection('nutrition_assignments').get();
  console.log('total assignments in collection:', allSnap.size);
  const hits = [];
  for (const a of allSnap.docs) {
    const d = a.data();
    const where = findUidInDoc(d, UID);
    if (where.length) {
      hits.push({ id: a.id, fields: where, data: d });
    }
  }
  console.log('docs referencing this UID anywhere:', hits.length);
  for (const h of hits) {
    console.log('\n  --- assignment', h.id, '---');
    console.log('    matched at fields:', h.fields);
    console.log('    creator_id:', h.data.creator_id, '| creatorId:', h.data.creatorId);
    console.log('    userId:', h.data.userId, '| user_id:', h.data.user_id, '| client_user_id:', h.data.client_user_id);
    console.log('    planId:', h.data.planId ?? h.data.plan_id, '| planName:', h.data.planName ?? h.data.plan_name);
    console.log('    status:', h.data.status, '| createdAt:', safeIso(h.data.createdAt) ?? safeIso(h.data.created_at));
    console.log('    startDate:', h.data.startDate, '| endDate:', h.data.endDate);
    console.log('    source_course_id:', h.data.source_course_id, '| courseId:', h.data.courseId);
    console.log('    raw keys:', Object.keys(h.data));
  }

  console.log('\n=== Scan client_nutrition_plan_content (any field == UID) ===');
  const cpcSnap = await db.collection('client_nutrition_plan_content').get();
  console.log('total docs:', cpcSnap.size);
  for (const c of cpcSnap.docs) {
    const d = c.data();
    const where = findUidInDoc(d, UID);
    if (where.length) {
      console.log(' ', c.id, 'fields:', where);
    }
  }

  console.log('\n=== User diary subcollection ===');
  const diarySnap = await db.collection('users').doc(UID).collection('diary').limit(10).get();
  console.log('diary entry count (sample 10):', diarySnap.size);
  diarySnap.docs.slice(0, 5).forEach(d => console.log(' ', d.id, JSON.stringify({
    date: d.data().date, mealType: d.data().mealType, name: d.data().name,
  })));

  console.log('\n=== If pinned id is set, fetch that assignment doc directly ===');
  const pinId = ud.pinnedNutritionAssignmentId;
  if (pinId) {
    const pinDoc = await db.collection('nutrition_assignments').doc(pinId).get();
    console.log('  pin exists:', pinDoc.exists);
    if (pinDoc.exists) {
      console.log('  pin data keys:', Object.keys(pinDoc.data()));
      console.log('  pin data:', pinDoc.data());
    }
  } else {
    console.log('  (no pinnedNutritionAssignmentId on user doc)');
  }

  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
