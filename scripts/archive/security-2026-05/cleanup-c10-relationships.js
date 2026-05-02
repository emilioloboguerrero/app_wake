#!/usr/bin/env node
/**
 * One-off cleanup for the broken C-10 v2 test state on prod.
 *
 *   Deletes ALL one_on_one_clients rows for the given (username, creatorId)
 *   pair so the next "Asignar programa" attempt creates a single fresh row
 *   that the new lookup-priority logic can engage correctly.
 *
 *   Optionally also clears user.courses[programId] entries that match the
 *   creator's catalog — to undo any orphaned assigns made before the fix.
 *
 * Dry-run by default. Pass --execute to actually delete.
 *
 * Usage:
 *   node scripts/security/cleanup-c10-relationships.js <username> <creatorId>
 *   node scripts/security/cleanup-c10-relationships.js <username> <creatorId> --execute
 *   node scripts/security/cleanup-c10-relationships.js <username> <creatorId> --execute --clear-courses
 */

const admin = require('firebase-admin');
admin.initializeApp({ projectId: 'wolf-20b8b' });
const db = admin.firestore();

(async () => {
  const args = process.argv.slice(2);
  const username = args[0];
  const creatorId = args[1];
  const execute = args.includes('--execute');
  const clearCourses = args.includes('--clear-courses');

  if (!username || !creatorId) {
    console.error('Usage: node cleanup-c10-relationships.js <username> <creatorId> [--execute] [--clear-courses]');
    process.exit(1);
  }

  console.log(`\n=== C-10 cleanup ${execute ? '(EXECUTING)' : '(DRY RUN)'} ===`);
  console.log(`username:  ${username}`);
  console.log(`creatorId: ${creatorId}`);
  console.log(`clear-courses: ${clearCourses ? 'yes' : 'no'}\n`);

  // 1. Look up user
  const userSnap = await db.collection('users').where('username', '==', username).limit(1).get();
  if (userSnap.empty) { console.log(`no user with username='${username}'`); process.exit(1); }
  const uid = userSnap.docs[0].id;
  console.log(`uid: ${uid}\n`);

  // 2. Find the relationship rows to delete
  const rels = await db.collection('one_on_one_clients')
    .where('creatorId', '==', creatorId)
    .where('clientUserId', '==', uid)
    .get();

  console.log(`one_on_one_clients to delete (${rels.size}):`);
  for (const r of rels.docs) {
    const d = r.data();
    console.log(`  ${r.id}  status=${d.status}  resendCount=${d.resendCount ?? 0}  ` +
      `created=${d.createdAt?.toDate?.()?.toISOString?.() ?? '?'}`);
  }

  // 3. Optionally find user.courses entries written by this creator
  const userDoc = userSnap.docs[0];
  const courses = userDoc.data().courses ?? {};
  const creatorCourses = await db.collection('courses').where('creator_id', '==', creatorId).get();
  const creatorCourseIds = new Set(creatorCourses.docs.map((d) => d.id));
  const matchingCourseEntries = Object.entries(courses).filter(([cid, c]) =>
    creatorCourseIds.has(cid) && c.deliveryType === 'one_on_one'
  );

  if (clearCourses) {
    console.log(`\nuser.courses entries to clear (${matchingCourseEntries.length}):`);
    for (const [cid, c] of matchingCourseEntries) {
      console.log(`  ${cid}  status=${c.status}  assigned_at=${c.assigned_at ?? '?'}`);
    }
  }

  if (!execute) {
    console.log(`\nDry run only — re-run with --execute to delete.`);
    await admin.app().delete();
    return;
  }

  // 4. Execute the deletions
  console.log(`\nExecuting…`);
  const batch = db.batch();
  for (const r of rels.docs) batch.delete(r.ref);
  if (clearCourses) {
    const updates = {};
    for (const [cid] of matchingCourseEntries) {
      updates[`courses.${cid}`] = admin.firestore.FieldValue.delete();
    }
    if (Object.keys(updates).length > 0) {
      batch.update(userDoc.ref, updates);
    }
  }
  await batch.commit();
  console.log(`✓ deleted ${rels.size} relationship row${rels.size === 1 ? '' : 's'}`);
  if (clearCourses) {
    console.log(`✓ cleared ${matchingCourseEntries.length} user.courses entr${matchingCourseEntries.length === 1 ? 'y' : 'ies'}`);
  }

  await admin.app().delete();
})().catch((err) => { console.error('FAIL:', err); process.exit(1); });
