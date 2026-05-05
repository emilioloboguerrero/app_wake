'use strict';
const admin = require('firebase-admin');
admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  projectId: 'wolf-20b8b',
  storageBucket: 'wolf-20b8b.firebasestorage.app',
});
const bucket = admin.storage().bucket();

const PATHS = [
  'profiles/QEjugFhBOjdcTfsLC1kQJdak7zP2/profile.jpg',
  'creator_media/bUCvwdPYolPe6i8JuCaY5w2PcB53/1775148032980_om2da9.webp',
];

(async () => {
  for (const p of PATHS) {
    const file = bucket.file(p);
    const [exists] = await file.exists();
    console.log(`${p}: exists=${exists}`);
    if (!exists) continue;
    const [meta] = await file.getMetadata();
    const tokens = meta.metadata?.firebaseStorageDownloadTokens || '(none)';
    console.log(`  size=${meta.size} contentType=${meta.contentType}`);
    console.log(`  cacheControl=${meta.cacheControl || '(none)'}`);
    console.log(`  firebaseStorageDownloadTokens=${tokens}`);
    console.log();
  }
})().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
