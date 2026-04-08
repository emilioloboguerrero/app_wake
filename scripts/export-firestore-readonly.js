/**
 * READ-ONLY Firestore export script.
 *
 * This script ONLY reads data. It uses exclusively:
 *   - collection.get()
 *   - doc.listCollections()
 *   - doc.get()
 *
 * There are ZERO write operations anywhere in this file.
 *
 * Usage:
 *   node scripts/export-firestore-readonly.js /path/to/serviceAccountKey.json
 *
 * Output:
 *   firestore-dump.json in the repo root
 */

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// --- Config ---
const MAX_SUBCOLLECTION_DEPTH = 6; // courses/{id}/modules/{id}/sessions/{id}/exercises/{id}/sets/{id}
const OUTPUT_FILE = path.join(__dirname, '..', 'firestore-dump.json');

// --- Helpers to preserve Firestore types ---
function serializeValue(val) {
  if (val === null || val === undefined) return null;

  // Firestore Timestamp
  if (val && typeof val.toDate === 'function') {
    return { __type: 'Timestamp', value: val.toDate().toISOString(), _seconds: val._seconds };
  }

  // Firestore GeoPoint
  if (val && typeof val.latitude === 'number' && typeof val.longitude === 'number' && val.constructor?.name === 'GeoPoint') {
    return { __type: 'GeoPoint', latitude: val.latitude, longitude: val.longitude };
  }

  // Firestore DocumentReference
  if (val && typeof val.path === 'string' && typeof val.firestore === 'object' && val.constructor?.name === 'DocumentReference') {
    return { __type: 'DocumentReference', path: val.path };
  }

  // Uint8Array / Buffer (Firestore Bytes)
  if (val instanceof Buffer || val instanceof Uint8Array) {
    return { __type: 'Bytes', length: val.length };
  }

  // Array
  if (Array.isArray(val)) {
    return val.map(serializeValue);
  }

  // Plain object / map
  if (typeof val === 'object') {
    const result = {};
    for (const [k, v] of Object.entries(val)) {
      result[k] = serializeValue(v);
    }
    return result;
  }

  // Primitives (string, number, boolean)
  return val;
}

function serializeDocument(doc) {
  const data = doc.data();
  const serialized = {};
  for (const [key, value] of Object.entries(data)) {
    serialized[key] = serializeValue(value);
  }
  return serialized;
}

// --- Recursive read ---
async function exportCollection(collectionRef, depth = 0) {
  if (depth > MAX_SUBCOLLECTION_DEPTH) {
    console.warn(`  Max depth (${MAX_SUBCOLLECTION_DEPTH}) reached at ${collectionRef.path}, skipping deeper.`);
    return {};
  }

  const snapshot = await collectionRef.get(); // READ ONLY
  const result = {};

  for (const doc of snapshot.docs) {
    const docData = serializeDocument(doc);

    // Check for subcollections (READ ONLY — listCollections is a read operation)
    const subcollections = await doc.ref.listCollections();

    if (subcollections.length > 0) {
      docData.__subcollections = {};
      for (const subcol of subcollections) {
        console.log(`  ${'  '.repeat(depth)}${collectionRef.path}/${doc.id}/${subcol.id} ...`);
        docData.__subcollections[subcol.id] = await exportCollection(subcol, depth + 1);
      }
    }

    result[doc.id] = docData;
  }

  return result;
}

// --- Main ---
async function main() {
  const keyPath = process.argv[2];

  if (!keyPath) {
    console.error('Usage: node scripts/export-firestore-readonly.js /path/to/serviceAccountKey.json');
    console.error('');
    console.error('Generate a key from: Firebase Console > Project Settings > Service Accounts > Generate New Private Key');
    process.exit(1);
  }

  if (!fs.existsSync(keyPath)) {
    console.error(`Service account key not found: ${keyPath}`);
    process.exit(1);
  }

  const serviceAccount = JSON.parse(fs.readFileSync(keyPath, 'utf8'));

  console.log(`\nProject: ${serviceAccount.project_id}`);
  console.log('Mode: READ-ONLY (no writes)\n');

  // Initialize with a unique app name so it doesn't conflict with anything
  const app = admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  }, 'firestore-export-readonly');

  const db = app.firestore();

  // Get all top-level collections (READ ONLY)
  const collections = await db.listCollections();
  console.log(`Found ${collections.length} top-level collections:\n`);

  const dump = {
    __meta: {
      project_id: serviceAccount.project_id,
      exported_at: new Date().toISOString(),
      mode: 'READ_ONLY',
      type_markers: {
        Timestamp: '{ __type: "Timestamp", value: "ISO string", _seconds: number }',
        GeoPoint: '{ __type: "GeoPoint", latitude: number, longitude: number }',
        DocumentReference: '{ __type: "DocumentReference", path: "collection/docId" }',
        Bytes: '{ __type: "Bytes", length: number }',
      },
    },
  };

  let totalDocs = 0;

  for (const col of collections) {
    console.log(`Exporting: ${col.id} ...`);
    const data = await exportCollection(col, 0);
    const count = Object.keys(data).length;
    totalDocs += count;
    console.log(`  → ${count} documents\n`);
    dump[col.id] = data;
  }

  // Write output
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(dump, null, 2), 'utf8');

  const sizeMB = (fs.statSync(OUTPUT_FILE).size / 1024 / 1024).toFixed(2);
  console.log(`\nDone. ${totalDocs} top-level documents exported.`);
  console.log(`Output: ${OUTPUT_FILE} (${sizeMB} MB)`);
  console.log('\nIMPORTANT: This file contains production data. Do NOT commit it to git.');

  // Clean up
  await app.delete();
}

main().catch((err) => {
  console.error('Export failed:', err.message);
  process.exit(1);
});
