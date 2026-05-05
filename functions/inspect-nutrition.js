'use strict';
// READ-ONLY prod inspection: look up a user by username and dump full Hoy-relevant state.
const admin = require('firebase-admin');
admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId: 'wolf-20b8b' });
const db = admin.firestore();

const TARGET_USERNAME = 'prueba';

(async () => {
  const usnap = await db.collection('users').where('username', '==', TARGET_USERNAME).get();
  if (usnap.empty) {
    console.log(`No user with username="${TARGET_USERNAME}". Trying case-insensitive scan...`);
    const all = await db.collection('users').get();
    all.forEach((d) => {
      const u = d.data().username;
      if (u && String(u).toLowerCase() === TARGET_USERNAME.toLowerCase()) {
        console.log(`  match: ${d.id} username=${u}`);
      }
    });
    process.exit(0);
  }

  for (const d of usnap.docs) {
    const uid = d.id;
    const x = d.data();
    console.log(`uid=${uid}`);
    console.log(`  email=${x.email || '(none)'}`);
    console.log(`  displayName=${x.displayName || '(none)'}`);
    console.log(`  username=${x.username}`);
    console.log(`  pinnedTrainingCourseId=${x.pinnedTrainingCourseId || null}`);
    console.log(`  pinnedNutritionAssignmentId=${x.pinnedNutritionAssignmentId || null}`);

    const courses = x.courses || {};
    console.log(`  courses (${Object.keys(courses).length}):`);
    for (const [cid, c] of Object.entries(courses)) {
      console.log(`    ${cid}:`);
      console.log(`      status=${c.status} expires_at=${c.expires_at || '(none)'} is_trial=${!!c.is_trial}`);
      console.log(`      creatorName=${c.creatorName || '(none)'} creator_id=${c.creator_id || '(none)'}`);
      console.log(`      deliveryType=${c.deliveryType || '(none)'} title=${c.title || '(none)'}`);
    }

    // Top-level course doc resolution
    console.log(`\n  Top-level courses/{id} resolution:`);
    for (const cid of Object.keys(courses)) {
      const cd = await db.collection('courses').doc(cid).get();
      if (!cd.exists) { console.log(`    ${cid}: NOT FOUND`); continue; }
      const d2 = cd.data();
      console.log(`    ${cid}: creator_id=${d2.creator_id || '(none)'} creatorName=${d2.creatorName || d2.creator_name || '(none)'}`);
    }

    // Nutrition assignments
    console.log(`\n  nutrition_assignments where userId == ${uid}:`);
    const naSnap = await db.collection('nutrition_assignments').where('userId', '==', uid).get();
    console.log(`  count: ${naSnap.size}`);
    naSnap.forEach((dd) => {
      const a = dd.data();
      console.log(`    ${dd.id}:`);
      console.log(`      status=${a.status} mode=${a.mode}`);
      console.log(`      creator_id=${a.creator_id || '(none)'} creatorId=${a.creatorId || '(none)'} assignedBy=${a.assignedBy || '(none)'}`);
      console.log(`      planTitle=${a.planTitle || a.title || a.planName || '(none)'}`);
      console.log(`      startDate=${a.startDate || '(none)'} endDate=${a.endDate || '(none)'}`);
      console.log(`      all keys: ${Object.keys(a).join(', ')}`);
    });

    // Pinned assignment doc explicit fetch
    if (x.pinnedNutritionAssignmentId) {
      const pSnap = await db.collection('nutrition_assignments').doc(x.pinnedNutritionAssignmentId).get();
      console.log(`\n  pinned assignment doc:`);
      if (!pSnap.exists) { console.log('    NOT FOUND'); }
      else {
        const a = pSnap.data();
        console.log(`    creator_id=${a.creator_id || '(none)'}`);
        console.log(`    keys: ${Object.keys(a).join(', ')}`);
      }
    }
  }
})().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
