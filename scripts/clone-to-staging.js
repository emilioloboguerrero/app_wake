#!/usr/bin/env node
'use strict';

/**
 * Seeds staging with all data related to the test@gmail.com user
 * (bUCvwdPYolPe6i8JuCaY5w2PcB53) from the production dump.
 *
 * Includes: user doc + subcollections, enrolled courses + full tree,
 * plans, one_on_one_clients, creator_availability, call_bookings,
 * client_plan_content, creator_client_access, nutrition_assignments,
 * events, exercises_library, api_keys, app_resources, and the two
 * client users linked to this creator.
 *
 * Creates a Firebase Auth account so you can log in.
 *
 * Usage:
 *   node scripts/clone-to-staging.js                     # defaults to wake-staging
 *   node scripts/clone-to-staging.js --project my-proj
 *   node scripts/clone-to-staging.js --dry-run
 *   node scripts/clone-to-staging.js --clear              # wipe staging first
 */

const admin = require('firebase-admin');
const path = require('path');

// --- Config ---
const SOURCE_UID = 'bUCvwdPYolPe6i8JuCaY5w2PcB53';
const SEED_EMAIL = 'test@gmail.com';
const SEED_PASSWORD = 'okokok';

// --- Parse flags ---
const args = process.argv.slice(2);
const projectFlag = args.indexOf('--project');
const projectId = projectFlag !== -1 ? args[projectFlag + 1] : 'wake-staging';
const dryRun = args.includes('--dry-run');
const clearFirst = args.includes('--clear');

if (projectId === 'wolf-20b8b') {
  console.error('ERROR: Refusing to write to production project wolf-20b8b');
  process.exit(1);
}

console.log(`Target project: ${projectId}${dryRun ? ' (DRY RUN)' : ''}\n`);

// --- Init Firebase Admin ---
admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  projectId,
});

const db = admin.firestore();
const auth = admin.auth();

// --- Load dump ---
const dump = require(path.resolve(__dirname, '..', 'firestore-dump.json'));

// --- Stats ---
let totalDocs = 0;
let totalBatches = 0;

// --- Helpers ---

function convertValue(val) {
  if (val === null || val === undefined) return val;
  if (val && val.__type === 'Timestamp' && typeof val._seconds === 'number') {
    return admin.firestore.Timestamp.fromMillis(val._seconds * 1000);
  }
  if (val && val.__type === 'GeoPoint') {
    return new admin.firestore.GeoPoint(val.latitude, val.longitude);
  }
  if (val && val.__type === 'DocumentReference') {
    return db.doc(val.path);
  }
  if (Array.isArray(val)) return val.map(convertValue);
  if (typeof val === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(val)) {
      if (k === '__subcollections') continue;
      out[k] = convertValue(v);
    }
    return out;
  }
  return val;
}

function collectSubcollectionDocs(parentPath, collectionName, docs, result) {
  for (const [docId, docData] of Object.entries(docs)) {
    const { __subcollections, ...fields } = docData;
    const docPath = `${parentPath}/${collectionName}/${docId}`;
    result.push({ path: docPath, data: convertValue(fields) });
    if (__subcollections) {
      for (const [subName, subDocs] of Object.entries(__subcollections)) {
        collectSubcollectionDocs(docPath, subName, subDocs, result);
      }
    }
  }
}

/** Flatten a top-level doc + its subcollections into { path, data }[] */
function flattenDoc(collection, docId, docData) {
  const { __subcollections, ...fields } = docData;
  const result = [{ path: `${collection}/${docId}`, data: convertValue(fields) }];
  if (__subcollections) {
    for (const [subName, subDocs] of Object.entries(__subcollections)) {
      collectSubcollectionDocs(`${collection}/${docId}`, subName, subDocs, result);
    }
  }
  return result;
}

/** Collect all docs in a collection whose JSON contains the UID */
function collectRelatedDocs(collection) {
  const docs = dump[collection];
  if (!docs) return [];
  const result = [];
  for (const [docId, docData] of Object.entries(docs)) {
    if (docId === SOURCE_UID || JSON.stringify(docData).includes(SOURCE_UID)) {
      result.push(...flattenDoc(collection, docId, docData));
    }
  }
  return result;
}

/** Collect specific doc by ID */
function collectDoc(collection, docId) {
  const docs = dump[collection];
  if (!docs || !docs[docId]) return [];
  return flattenDoc(collection, docId, docs[docId]);
}

/** Collect ALL docs in a collection (for small shared collections) */
function collectAll(collection) {
  const docs = dump[collection];
  if (!docs) return [];
  const result = [];
  for (const [docId, docData] of Object.entries(docs)) {
    result.push(...flattenDoc(collection, docId, docData));
  }
  return result;
}

async function writeBatched(docs, label) {
  if (docs.length === 0) {
    console.log(`  ${label}: nothing to write`);
    return;
  }
  const BATCH_SIZE = 500;
  for (let i = 0; i < docs.length; i += BATCH_SIZE) {
    const chunk = docs.slice(i, i + BATCH_SIZE);
    const batch = db.batch();
    for (const { path: docPath, data } of chunk) {
      batch.set(db.doc(docPath), data);
    }
    if (!dryRun) {
      await batch.commit();
    }
    totalBatches++;
    totalDocs += chunk.length;
  }
  console.log(`  ${label}: ${docs.length} docs`);
}

async function deleteCollection(collRef) {
  const snapshot = await collRef.limit(500).get();
  if (snapshot.empty) return;
  for (const doc of snapshot.docs) {
    const subcollections = await doc.ref.listCollections();
    for (const sub of subcollections) {
      await deleteCollection(sub);
    }
  }
  const batch = db.batch();
  snapshot.docs.forEach(doc => batch.delete(doc.ref));
  await batch.commit();
  await deleteCollection(collRef);
}

async function ensureAuthUser() {
  // Check if UID already exists
  try {
    await auth.getUser(SOURCE_UID);
    console.log(`  Auth user ${SOURCE_UID} already exists`);
    return;
  } catch (e) {
    if (e.code !== 'auth/user-not-found') throw e;
  }

  // UID doesn't exist — check if email is taken by a different account
  try {
    const existing = await auth.getUserByEmail(SEED_EMAIL);
    // Email exists under a different UID — delete it first
    console.log(`  Deleting old auth user ${existing.uid} (had ${SEED_EMAIL})`);
    await auth.deleteUser(existing.uid);
  } catch (e) {
    if (e.code !== 'auth/user-not-found') throw e;
  }

  const userData = dump.users[SOURCE_UID];
  await auth.createUser({
    uid: SOURCE_UID,
    email: SEED_EMAIL,
    displayName: userData?.displayName || 'Test User',
    password: SEED_PASSWORD,
  });
  console.log(`  Auth user created: ${SEED_EMAIL} / ${SEED_PASSWORD}`);
}

// --- Main ---

async function main() {
  const userData = dump.users[SOURCE_UID];
  if (!userData) {
    console.error(`User ${SOURCE_UID} not found in dump`);
    process.exit(1);
  }

  // Enrolled course IDs
  const courseIds = userData.courses ? Object.keys(userData.courses) : [];

  console.log(`User: ${userData.email} (${userData.role})`);
  console.log(`Enrolled courses: ${courseIds.join(', ') || 'none'}\n`);

  // Optionally clear
  if (clearFirst && !dryRun) {
    const collsToClean = [
      'users', 'courses', 'plans', 'exercises_library', 'one_on_one_clients',
      'creator_availability', 'call_bookings', 'client_plan_content',
      'creator_client_access', 'nutrition_assignments', 'events',
      'api_keys', 'app_resources', 'creator_feedback',
    ];
    console.log('Clearing existing staging data...');
    for (const col of collsToClean) {
      process.stdout.write(`  ${col}...`);
      await deleteCollection(db.collection(col));
      console.log(' done');
    }
    console.log('');
  }

  // 1. Auth account
  console.log('Auth:');
  if (!dryRun) {
    await ensureAuthUser();
  } else {
    console.log(`  Would create auth user: ${SEED_EMAIL}`);
  }

  // 2. User doc + all subcollections
  console.log('\nUser data:');
  await writeBatched(flattenDoc('users', SOURCE_UID, userData), 'users/' + SOURCE_UID);

  // 3. Client users linked to this creator (they reference UID in their data)
  console.log('\nLinked client users:');
  const clientUserDocs = [];
  for (const [docId, docData] of Object.entries(dump.users)) {
    if (docId !== SOURCE_UID && JSON.stringify(docData).includes(SOURCE_UID)) {
      clientUserDocs.push(...flattenDoc('users', docId, docData));
    }
  }
  await writeBatched(clientUserDocs, 'client users');

  // 4. Enrolled courses + full tree (modules → sessions → exercises → sets)
  console.log('\nCourses:');
  for (const courseId of courseIds) {
    await writeBatched(collectDoc('courses', courseId), `courses/${courseId}`);
  }
  // Also courses that reference UID (ones they created)
  const creatorCourses = [];
  for (const [docId, docData] of Object.entries(dump.courses || {})) {
    if (!courseIds.includes(docId) && JSON.stringify(docData).includes(SOURCE_UID)) {
      creatorCourses.push(...flattenDoc('courses', docId, docData));
    }
  }
  if (creatorCourses.length > 0) {
    await writeBatched(creatorCourses, 'creator-owned courses');
  }

  // 5. Plans (created by this user)
  console.log('\nPlans:');
  await writeBatched(collectRelatedDocs('plans'), 'plans');

  // 6. Related collections
  console.log('\nRelated data:');
  await writeBatched(collectRelatedDocs('one_on_one_clients'), 'one_on_one_clients');
  await writeBatched(collectRelatedDocs('creator_availability'), 'creator_availability');
  await writeBatched(collectRelatedDocs('call_bookings'), 'call_bookings');
  await writeBatched(collectRelatedDocs('client_plan_content'), 'client_plan_content');
  await writeBatched(collectRelatedDocs('creator_client_access'), 'creator_client_access');
  await writeBatched(collectRelatedDocs('nutrition_assignments'), 'nutrition_assignments');
  await writeBatched(collectRelatedDocs('creator_feedback'), 'creator_feedback');
  await writeBatched(collectRelatedDocs('client_programs'), 'client_programs');
  await writeBatched(collectRelatedDocs('client_sessions'), 'client_sessions');
  await writeBatched(collectRelatedDocs('api_keys'), 'api_keys');

  // 7. Events (this user created them)
  console.log('\nEvents:');
  await writeBatched(collectRelatedDocs('events'), 'events');

  // 8. Exercise libraries (referenced by courses)
  console.log('\nExercise libraries:');
  await writeBatched(collectRelatedDocs('exercises_library'), 'exercises_library');

  // 9. Shared/global collections (small, useful for testing)
  console.log('\nShared data:');
  await writeBatched(collectAll('app_resources'), 'app_resources');

  console.log(`\n${'='.repeat(50)}`);
  console.log(`Done! ${totalDocs} documents written in ${totalBatches} batches`);
  console.log(`Target: ${projectId}${dryRun ? ' (DRY RUN)' : ''}`);
  console.log(`\nLogin: ${SEED_EMAIL} / ${SEED_PASSWORD}`);
  console.log('='.repeat(50));
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\nFailed:', err);
    process.exit(1);
  });
