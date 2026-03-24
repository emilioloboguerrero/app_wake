#!/usr/bin/env node
'use strict';

/**
 * Seeds a Firestore project with real user data from firestore-dump.json.
 *
 * Seeds two users:
 *   1. test@gmail.com   (bUCvwdPYolPe6i8JuCaY5w2PcB53) → seed-real-user-001
 *   2. prueba@gmail.com (XQ9NDAngzAPEIwPMjDAX8e6xYa72) → seed-real-user-002
 *
 * Also seeds their courses and exercise libraries.
 *
 * Usage:
 *   node scripts/seed-from-dump.js                     # defaults to wake-staging
 *   node scripts/seed-from-dump.js --project my-proj   # target a specific project
 */

const admin = require('firebase-admin');
const path = require('path');

// --- Users to seed ---
const USERS = [
  {
    sourceUid: 'bUCvwdPYolPe6i8JuCaY5w2PcB53',
    seedUid: 'seed-real-user-001',
    seedEmail: 'test@gmail.com',
    seedUsername: 'test',
    seedRole: null, // keep admin role for creator dashboard access
  },
  {
    sourceUid: 'XQ9NDAngzAPEIwPMjDAX8e6xYa72',
    seedUid: 'seed-real-user-002',
    seedEmail: 'prueba@gmail.com',
    seedUsername: 'prueba',
    seedRole: null, // keep original role
  },
];

const SEED_PASSWORD = 'okokok';

// --- Parse flags ---
const args = process.argv.slice(2);
const projectFlag = args.indexOf('--project');
const projectId = projectFlag !== -1 ? args[projectFlag + 1] : 'wake-staging';

console.log(`Seeding project: ${projectId}\n`);

// --- Init Firebase Admin ---
admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  databaseURL: `https://${projectId}.firebaseio.com`,
  projectId,
});

const db = admin.firestore();
const auth = admin.auth();

// --- Load dump ---
const dump = require(path.resolve(__dirname, '..', 'firestore-dump.json'));

// --- Helpers ---

function convertValue(val) {
  if (val === null || val === undefined) return val;
  if (val && val.__type === 'Timestamp' && typeof val._seconds === 'number') {
    return admin.firestore.Timestamp.fromMillis(val._seconds * 1000);
  }
  if (val && val.__type === 'DocumentReference') return val.path;
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

function replaceUids(val, uidMap) {
  if (typeof val === 'string') {
    let result = val;
    for (const [oldUid, newUid] of Object.entries(uidMap)) {
      result = result.split(oldUid).join(newUid);
    }
    return result;
  }
  if (Array.isArray(val)) return val.map(v => replaceUids(v, uidMap));
  if (val !== null && typeof val === 'object') {
    if (val instanceof admin.firestore.Timestamp) return val;
    const out = {};
    for (const [k, v] of Object.entries(val)) {
      out[replaceUids(k, uidMap)] = replaceUids(v, uidMap);
    }
    return out;
  }
  return val;
}

// Build UID replacement map
const uidMap = {};
for (const u of USERS) {
  uidMap[u.sourceUid] = u.seedUid;
}
// Map JFF (course/library creator) to test user so ownership transfers
uidMap['QEjugFhBOjdcTfsLC1kQJdak7zP2'] = 'seed-real-user-001';

async function ensureAuthUser(uid, email, displayName, password) {
  try {
    await auth.getUser(uid);
    console.log(`  Auth user ${uid} already exists, skipping`);
  } catch (e) {
    if (e.code === 'auth/user-not-found') {
      await auth.createUser({ uid, email, displayName, password });
      console.log(`  Auth user ${uid} created (${email})`);
    } else {
      throw e;
    }
  }
}

async function writeDoc(docPath, data) {
  const converted = convertValue(data);
  const replaced = replaceUids(converted, uidMap);
  await db.doc(docPath).set(replaced);
}

async function writeSubcollection(parentPath, collectionName, docs) {
  const entries = Object.entries(docs);
  console.log(`  Writing ${entries.length} docs → ${parentPath}/${collectionName}`);
  for (const [docId, docData] of entries) {
    const { __subcollections, ...fields } = docData;
    await writeDoc(`${parentPath}/${collectionName}/${docId}`, fields);
    if (__subcollections) {
      for (const [subName, subDocs] of Object.entries(__subcollections)) {
        await writeSubcollection(`${parentPath}/${collectionName}/${docId}`, subName, subDocs);
      }
    }
  }
}

// Track which courses/libraries we've already written to avoid duplicates
const writtenCourses = new Set();
const writtenLibraries = new Set();

async function seedCourse(courseId) {
  if (writtenCourses.has(courseId)) return;
  writtenCourses.add(courseId);

  const sourceCourse = dump.courses && dump.courses[courseId];
  if (!sourceCourse) {
    console.log(`  Course ${courseId} not found in dump, skipping`);
    return;
  }

  const { __subcollections: courseSubs, ...courseFields } = sourceCourse;
  await writeDoc(`courses/${courseId}`, courseFields);
  console.log(`  courses/${courseId} done (${courseFields.title})`);

  if (courseSubs) {
    for (const [collName, docs] of Object.entries(courseSubs)) {
      await writeSubcollection(`courses/${courseId}`, collName, docs);
    }
  }

  // Seed referenced exercise libraries
  const libraryIds = sourceCourse.availableLibraries || [];
  for (const libId of libraryIds) {
    await seedExerciseLibrary(libId);
  }
}

async function seedExerciseLibrary(libId) {
  if (writtenLibraries.has(libId)) return;
  writtenLibraries.add(libId);

  if (!dump.exercises_library || !dump.exercises_library[libId]) {
    console.log(`  exercises_library/${libId} not found in dump, skipping`);
    return;
  }

  const { __subcollections: libSubs, ...libFields } = dump.exercises_library[libId];
  await writeDoc(`exercises_library/${libId}`, libFields);
  console.log(`  exercises_library/${libId} done`);

  if (libSubs) {
    for (const [collName, docs] of Object.entries(libSubs)) {
      await writeSubcollection(`exercises_library/${libId}`, collName, docs);
    }
  }
}

// --- Main ---

async function seed() {
  for (const userConfig of USERS) {
    const { sourceUid, seedUid, seedEmail, seedUsername, seedRole } = userConfig;

    const sourceUser = dump.users[sourceUid];
    if (!sourceUser) {
      console.error(`User ${sourceUid} not found in dump, skipping`);
      continue;
    }

    console.log(`\n${'='.repeat(60)}`);
    console.log(`Seeding: ${sourceUser.email} → ${seedEmail} (${seedUid})`);
    console.log('='.repeat(60));

    // 1. Auth account
    console.log('\n  Creating Auth account...');
    await ensureAuthUser(seedUid, seedEmail, sourceUser.displayName || seedUsername, SEED_PASSWORD);

    // 2. User document
    console.log('\n  Writing user document...');
    const { __subcollections: userSubs, ...userFields } = sourceUser;
    const seedUserFields = {
      ...userFields,
      email: seedEmail,
      username: seedUsername,
      profilePicturePath: '',
      profilePictureUrl: '',
    };
    if (seedRole !== null) {
      seedUserFields.role = seedRole;
    }
    await writeDoc(`users/${seedUid}`, seedUserFields);
    console.log(`  users/${seedUid} done`);

    // 3. Subcollections
    console.log('\n  Writing subcollections...');
    if (userSubs) {
      for (const [collName, docs] of Object.entries(userSubs)) {
        if (!docs || Object.keys(docs).length === 0) {
          console.log(`  Skipping empty: ${collName}`);
          continue;
        }
        await writeSubcollection(`users/${seedUid}`, collName, docs);
      }
    }

    // 4. Courses the user is enrolled in
    const courseIds = userFields.courses ? Object.keys(userFields.courses) : [];
    if (courseIds.length > 0) {
      console.log(`\n  Writing ${courseIds.length} course(s)...`);
      for (const courseId of courseIds) {
        await seedCourse(courseId);
      }
    }
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log('Seed complete. All documents written to', projectId);
  console.log('='.repeat(60));
  console.log('\nLogin credentials (password for all: okokok):');
  for (const u of USERS) {
    console.log(`  ${u.seedEmail} → ${u.seedUid}`);
  }
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  });
