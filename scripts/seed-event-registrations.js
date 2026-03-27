#!/usr/bin/env node
'use strict';

/**
 * Copies event registrations and creator nutrition library from production
 * to staging for the test@gmail.com creator.
 *
 * Reads LIVE from wolf-20b8b (production) and writes to wake-staging.
 *
 * What it copies:
 *   1. event_signups/{eventId}/registrations/* — for all events owned by SOURCE_UID
 *   2. event_signups/{eventId}/waitlist/*      — same events
 *   3. creator_nutrition_library/{creatorId}/meals/*  — creator's meal library
 *   4. creator_nutrition_library/{creatorId}/plans/*  — creator's plan library
 *
 * Usage:
 *   node scripts/seed-event-registrations.js
 *   node scripts/seed-event-registrations.js --dry-run
 *   node scripts/seed-event-registrations.js --project my-staging-proj
 */

const admin = require('firebase-admin');

// --- Config ---
const SOURCE_UID = 'bUCvwdPYolPe6i8JuCaY5w2PcB53';
const PROD_PROJECT = 'wolf-20b8b';

// --- Parse flags ---
const args = process.argv.slice(2);
const projectFlag = args.indexOf('--project');
const targetProject = projectFlag !== -1 ? args[projectFlag + 1] : 'wake-staging';
const dryRun = args.includes('--dry-run');

if (targetProject === PROD_PROJECT) {
  console.error('ERROR: Refusing to write to production project');
  process.exit(1);
}

console.log(`Source: ${PROD_PROJECT} (read-only)`);
console.log(`Target: ${targetProject}${dryRun ? ' (DRY RUN)' : ''}\n`);

// --- Init two Firebase Admin apps ---
const prodApp = admin.initializeApp(
  { credential: admin.credential.applicationDefault(), projectId: PROD_PROJECT },
  'production'
);

const stagingApp = admin.initializeApp(
  { credential: admin.credential.applicationDefault(), projectId: targetProject },
  'staging'
);

const prodDb = admin.firestore(prodApp);
const stagingDb = admin.firestore(stagingApp);

// --- Helpers ---

function convertValue(val) {
  if (val === null || val === undefined) return val;
  if (val instanceof admin.firestore.Timestamp) return val;
  if (val instanceof admin.firestore.GeoPoint) return val;
  if (val instanceof admin.firestore.DocumentReference) {
    // Remap doc refs to staging project
    return stagingDb.doc(val.path);
  }
  if (Array.isArray(val)) return val.map(convertValue);
  if (typeof val === 'object' && val.constructor === Object) {
    const out = {};
    for (const [k, v] of Object.entries(val)) {
      out[k] = convertValue(v);
    }
    return out;
  }
  return val;
}

async function copyCollection(sourceRef, targetRef, label) {
  const snapshot = await sourceRef.get();
  if (snapshot.empty) {
    console.log(`  ${label}: 0 docs (empty)`);
    return 0;
  }

  let count = 0;
  const batches = [];
  let batch = stagingDb.batch();
  let batchCount = 0;

  for (const doc of snapshot.docs) {
    const data = convertValue(doc.data());
    batch.set(targetRef.doc(doc.id), data);
    batchCount++;
    count++;

    if (batchCount >= 450) {
      batches.push(batch);
      batch = stagingDb.batch();
      batchCount = 0;
    }
  }

  if (batchCount > 0) batches.push(batch);

  if (!dryRun) {
    for (const b of batches) {
      await b.commit();
    }
  }

  console.log(`  ${label}: ${count} docs${dryRun ? ' (dry run)' : ''}`);
  return count;
}

// --- Main ---

async function main() {
  let totalDocs = 0;

  // ──────────────────────────────────────────────
  // 1. Event registrations + waitlist
  // ──────────────────────────────────────────────
  console.log('--- Event Registrations ---\n');

  // Find all events created by SOURCE_UID in production
  const eventsSnap = await prodDb
    .collection('events')
    .where('creator_id', '==', SOURCE_UID)
    .get();

  if (eventsSnap.empty) {
    console.log('No events found for this creator in production.\n');
  } else {
    console.log(`Found ${eventsSnap.size} events by ${SOURCE_UID}:\n`);

    for (const eventDoc of eventsSnap.docs) {
      const eventData = eventDoc.data();
      const eventId = eventDoc.id;
      console.log(`Event: "${eventData.title}" (${eventId})`);

      // Also copy the event doc itself (in case staging doesn't have it)
      if (!dryRun) {
        await stagingDb.collection('events').doc(eventId).set(convertValue(eventData));
      }
      totalDocs++;

      // Copy registrations subcollection
      const regsCount = await copyCollection(
        prodDb.collection('event_signups').doc(eventId).collection('registrations'),
        stagingDb.collection('event_signups').doc(eventId).collection('registrations'),
        'registrations'
      );
      totalDocs += regsCount;

      // Copy waitlist subcollection
      const waitCount = await copyCollection(
        prodDb.collection('event_signups').doc(eventId).collection('waitlist'),
        stagingDb.collection('event_signups').doc(eventId).collection('waitlist'),
        'waitlist'
      );
      totalDocs += waitCount;

      console.log('');
    }
  }

  // ──────────────────────────────────────────────
  // 2. Creator nutrition library
  // ──────────────────────────────────────────────
  console.log('--- Creator Nutrition Library ---\n');

  // Meals
  const mealsCount = await copyCollection(
    prodDb.collection('creator_nutrition_library').doc(SOURCE_UID).collection('meals'),
    stagingDb.collection('creator_nutrition_library').doc(SOURCE_UID).collection('meals'),
    'meals'
  );
  totalDocs += mealsCount;

  // Plans
  const plansCount = await copyCollection(
    prodDb.collection('creator_nutrition_library').doc(SOURCE_UID).collection('plans'),
    stagingDb.collection('creator_nutrition_library').doc(SOURCE_UID).collection('plans'),
    'plans'
  );
  totalDocs += plansCount;

  // Also check if the parent doc exists and copy it
  const nutritionParentDoc = await prodDb
    .collection('creator_nutrition_library')
    .doc(SOURCE_UID)
    .get();

  if (nutritionParentDoc.exists) {
    if (!dryRun) {
      await stagingDb
        .collection('creator_nutrition_library')
        .doc(SOURCE_UID)
        .set(convertValue(nutritionParentDoc.data()));
    }
    console.log(`  parent doc: copied${dryRun ? ' (dry run)' : ''}`);
    totalDocs++;
  }

  // ──────────────────────────────────────────────
  // 3. Nutrition assignments (in case missing)
  // ──────────────────────────────────────────────
  console.log('\n--- Nutrition Assignments ---\n');

  // Find assignments where the creator is SOURCE_UID
  const assignSnap = await prodDb
    .collection('nutrition_assignments')
    .where('creatorId', '==', SOURCE_UID)
    .get();

  // Also try creator_id field
  const assignSnap2 = await prodDb
    .collection('nutrition_assignments')
    .where('creator_id', '==', SOURCE_UID)
    .get();

  const assignDocs = new Map();
  for (const d of [...assignSnap.docs, ...assignSnap2.docs]) {
    assignDocs.set(d.id, d);
  }

  if (assignDocs.size === 0) {
    console.log('  No nutrition assignments found for this creator.');
  } else {
    let assignCount = 0;
    for (const [docId, doc] of assignDocs) {
      if (!dryRun) {
        await stagingDb.collection('nutrition_assignments').doc(docId).set(convertValue(doc.data()));
      }
      assignCount++;

      // Copy matching client_nutrition_plan_content
      const contentDoc = await prodDb
        .collection('client_nutrition_plan_content')
        .doc(docId)
        .get();

      if (contentDoc.exists) {
        if (!dryRun) {
          await stagingDb
            .collection('client_nutrition_plan_content')
            .doc(docId)
            .set(convertValue(contentDoc.data()));
        }
        assignCount++;
      }
    }
    console.log(`  ${assignCount} docs${dryRun ? ' (dry run)' : ''}`);
    totalDocs += assignCount;
  }

  // ──────────────────────────────────────────────
  console.log(`\nDone. ${totalDocs} total docs${dryRun ? ' would be' : ''} written to ${targetProject}.`);

  process.exit(0);
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
