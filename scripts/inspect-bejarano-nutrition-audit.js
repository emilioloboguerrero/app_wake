#!/usr/bin/env node
'use strict';

/**
 * READ-ONLY audit:
 *  1) Does the Bejarano course (NTQIWMZBOxntwmUiXQZp) have content_plan_id?
 *  2) Latest purchase of that course — does the buyer have a nutrition_assignment?
 *     If yes, what created it (creator_id, content_plan_id, created_at, source)?
 *
 * Usage: NODE_PATH=functions/node_modules node scripts/inspect-bejarano-nutrition-audit.js
 */

const admin = require('firebase-admin');

const PROJECT_ID = 'wolf-20b8b';
const COURSE_ID = 'NTQIWMZBOxntwmUiXQZp';
const CREATOR_ID = 'yMqKOXBcVARa6vjU7wImf3Tp85J2';

admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId: PROJECT_ID });
const db = admin.firestore();

function safeIso(v) {
  try {
    if (!v) return null;
    if (typeof v === 'string') return v;
    if (typeof v.toDate === 'function') return v.toDate().toISOString();
    if (v._seconds) return new Date(v._seconds * 1000).toISOString();
    return String(v);
  } catch { return String(v); }
}

(async () => {
  console.log('=== 1) Course doc ===');
  const courseDoc = await db.collection('courses').doc(COURSE_ID).get();
  if (!courseDoc.exists) {
    console.log('Course not found.');
    process.exit(1);
  }
  const c = courseDoc.data();
  console.log({
    title: c.title,
    creator_id: c.creator_id,
    deliveryType: c.deliveryType,
    block_cadence: c.block_cadence,
    status: c.status,
    content_plan_id: c.content_plan_id ?? '(unset)',
    subscription_price: c.subscription_price,
  });

  console.log('\n=== 2) Latest purchase via processed_payments ===');
  const ppSnap = await db.collection('processed_payments')
    .where('courseId', '==', COURSE_ID)
    .limit(50)
    .get();

  if (ppSnap.empty) {
    console.log('No processed_payments for this course.');
  } else {
    const rows = ppSnap.docs
      .map(p => ({ id: p.id, ...p.data() }))
      .filter(r => r.status === 'approved')
      .map(r => ({
        paymentId: r.id, userId: r.userId, processed_at: safeIso(r.processed_at),
        isSubscription: r.isSubscription, isRenewal: r.isRenewal,
        payment_type: r.payment_type, state: r.state,
        _ms: (r.processed_at && r.processed_at._seconds) ? r.processed_at._seconds * 1000 : 0,
      }))
      .sort((a, b) => (b._ms || 0) - (a._ms || 0))
      .slice(0, 10);
    rows.forEach(r => { delete r._ms; console.log(r); });
  }

  // Pick latest userId straight from processed_payments.
  let latestUserId = null;
  {
    const ranked = ppSnap.docs.map(p => ({ id: p.id, ...p.data() }))
      .filter(r => r.status === 'approved' && r.userId)
      .sort((a, b) =>
        ((b.processed_at && b.processed_at._seconds) || 0) -
        ((a.processed_at && a.processed_at._seconds) || 0));
    if (ranked.length) latestUserId = ranked[0].userId;
  }
  if (latestUserId) {
    const u = await db.collection('users').doc(latestUserId).get();
    if (u.exists) {
      const entry = (u.data().courses || {})[COURSE_ID];
      console.log('\n=== 4) Latest buyer: ' + latestUserId + ' (email: ' + (u.data().email ?? '?') + ') ===');
      console.log('courses entry:', entry ? {
        purchased_at: entry.purchased_at,
        expires_at: entry.expires_at,
        status: entry.status,
        is_trial: entry.is_trial,
        deliveryType: entry.deliveryType,
      } : '(missing)');
    }
  }
  if (!latestUserId) {
    console.log('No buyer found — abort.');
    process.exit(0);
  }

  // Check all 3 most recent buyers
  const recentBuyers = ppSnap.docs.map(p => ({ id: p.id, ...p.data() }))
    .filter(r => r.status === 'approved' && r.userId)
    .sort((a, b) =>
      ((b.processed_at && b.processed_at._seconds) || 0) -
      ((a.processed_at && a.processed_at._seconds) || 0))
    .slice(0, 5)
    .map(r => r.userId);
  const buyerSet = new Set(recentBuyers);

  for (const uid of buyerSet) {
    const u = await db.collection('users').doc(uid).get();
    const email = u.exists ? (u.data().email ?? '?') : '(no user doc)';
    const pin = u.exists ? (u.data().pinnedNutritionAssignmentId ?? null) : null;
    console.log('\n=== 5) nutrition_assignments for ' + uid + ' (' + email + ') ===');
    console.log('  pinnedNutritionAssignmentId:', pin);

    const fieldsToTry = ['userId', 'user_id', 'client_user_id', 'clientId', 'client_id'];
    let assignments = [];
    for (const f of fieldsToTry) {
      try {
        const naSnap = await db.collection('nutrition_assignments').where(f, '==', uid).get();
        if (!naSnap.empty) {
          for (const a of naSnap.docs) {
            assignments.push({ id: a.id, _field: f, ...a.data() });
          }
        }
      } catch (e) { /* skip */ }
    }
    const seen = new Set();
    assignments = assignments.filter(a => (seen.has(a.id) ? false : (seen.add(a.id), true)));
    if (assignments.length === 0) {
      console.log('  → No nutrition_assignments found.');
    } else {
      for (const a of assignments) {
        console.log('  ---', a.id, '---');
        console.log('   ', {
          matchedField: a._field,
          creator_id: a.creator_id,
          plan_id: a.plan_id,
          content_plan_id: a.content_plan_id,
          source_course_id: a.source_course_id,
          course_id: a.course_id,
          status: a.status,
          created_at: safeIso(a.created_at) || safeIso(a.createdAt),
          updated_at: safeIso(a.updated_at) || safeIso(a.updatedAt),
          assigned_at: safeIso(a.assigned_at),
          source: a.source,
          creator_name: a.creator_name,
          plan_title: a.plan_title,
          client_user_id: a.client_user_id,
          client_id: a.client_id,
          user_id: a.user_id,
          userId: a.userId,
        });
      }
    }
  }

  // Also: any creator_libraries plans owned by Bejarano (so we can rule out
  // accidental cross-creator default)?
  console.log('\n=== 6) Bejarano nutrition plans (creator_nutrition_library/' + CREATOR_ID + '/plans) ===');
  const plansSnap = await db.collection('creator_nutrition_library').doc(CREATOR_ID).collection('plans').limit(20).get();
  console.log('count:', plansSnap.size);
  for (const p of plansSnap.docs) {
    console.log(' -', p.id, '·', p.data().title || '(no title)');
  }

  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
