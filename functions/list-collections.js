/**
 * One-off script: list root Firestore collections.
 * Run from functions/: node list-collections.js
 * Requires: GOOGLE_APPLICATION_CREDENTIALS or gcloud auth application-default login
 */
const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp({ projectId: 'wolf-20b8b' });
}

const db = admin.firestore();

async function main() {
  const cols = await db.listCollections();
  const names = cols.map((c) => c.id).sort();
  console.log('Root collections (' + names.length + '):');
  names.forEach((n) => console.log('  -', n));
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
