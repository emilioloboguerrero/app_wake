'use strict';
const admin = require('firebase-admin');
admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId: 'wolf-20b8b' });
const db = admin.firestore();

const COACH_IDS = [
  'QEjugFhBOjdcTfsLC1kQJdak7zP2', // Frieri
  'bUCvwdPYolPe6i8JuCaY5w2PcB53', // Test API User
];

(async () => {
  for (const uid of COACH_IDS) {
    const d = await db.collection('users').doc(uid).get();
    if (!d.exists) { console.log(`${uid}: NOT FOUND`); continue; }
    const u = d.data();
    console.log(`${uid}:`);
    console.log(`  displayName=${u.displayName || u.name || '(none)'}`);
    console.log(`  username=${u.username || '(none)'}`);
    console.log(`  profilePictureUrl=${u.profilePictureUrl || '(none)'}`);
    console.log(`  profile_picture_url=${u.profile_picture_url || '(none)'}`);
    console.log(`  image_url=${u.image_url || '(none)'}`);
    console.log(`  imageUrl=${u.imageUrl || '(none)'}`);
    console.log(`  picture=${u.picture || '(none)'}`);
    console.log(`  photoURL=${u.photoURL || '(none)'}`);
    console.log(`  avatar=${u.avatar || '(none)'}`);
    const imageRelatedKeys = Object.keys(u).filter((k) => /image|photo|picture|avatar/i.test(k));
    console.log(`  image-ish keys: ${imageRelatedKeys.join(', ') || '(none)'}`);
    console.log();
  }
})().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
