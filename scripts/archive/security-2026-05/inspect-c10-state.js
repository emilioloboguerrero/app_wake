#!/usr/bin/env node
/**
 * C-10 v2 debugging — read-only. Looks up a user's one_on_one_clients rows
 * + the matching user.courses entries. Run with:
 *   node scripts/security/inspect-c10-state.js <username>
 *
 * Prints minimal fields needed to debug the "accepted but no program" bug.
 * UID / creator IDs printed but no email / displayName / personal data.
 */

const admin = require('firebase-admin');
admin.initializeApp({ projectId: 'wolf-20b8b' });
const db = admin.firestore();

(async () => {
  const username = process.argv[2] || 'prueba';

  const userSnap = await db.collection('users').where('username', '==', username).limit(1).get();
  if (userSnap.empty) { console.log(`no user with username='${username}'`); process.exit(1); }
  const userDoc = userSnap.docs[0];
  const uid = userDoc.id;

  const courses = userDoc.data().courses ?? {};
  console.log(`uid=${uid}`);
  console.log(`user.courses (${Object.keys(courses).length}):`);
  for (const [cid, c] of Object.entries(courses)) {
    console.log(`  ${cid}  status=${c.status}  deliveryType=${c.deliveryType}  assigned_by=${c.assigned_by}  endedByUser=${!!c.endedByUser}`);
  }

  const rels = await db.collection('one_on_one_clients').where('clientUserId', '==', uid).get();
  console.log(`\none_on_one_clients (${rels.size}):`);
  for (const r of rels.docs) {
    const d = r.data();
    const created = d.createdAt?.toDate?.()?.toISOString?.() ?? '<none>';
    const accepted = d.acceptedAt?.toDate?.()?.toISOString?.() ?? '<none>';
    const ended = d.endedAt?.toDate?.()?.toISOString?.() ?? '<none>';
    const ppa = d.pendingProgramAssignment;
    const ppaStr = ppa ? `programId=${ppa.programId} accessDuration=${ppa.accessDuration ?? '<none>'}` : '<none>';
    console.log(`  ${r.id}  status=${d.status}  resendCount=${d.resendCount ?? 0}`);
    console.log(`    created=${created}`);
    console.log(`    accepted=${accepted}`);
    console.log(`    ended=${ended}`);
    console.log(`    pendingProgramAssignment=${ppaStr}`);
  }

  await admin.app().delete();
})().catch((err) => { console.error('FAIL:', err); process.exit(1); });
