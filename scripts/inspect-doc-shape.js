#!/usr/bin/env node
'use strict';

const admin = require('firebase-admin');
const PROJECT_ID = 'wolf-20b8b';
const COURSE_ID = 'NTQIWMZBOxntwmUiXQZp';
const LIB_ID = 'jeoVyzhUrBeJofT62MOe';

admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId: PROJECT_ID });
const db = admin.firestore();

(async () => {
  // Sample exercise doc in a session (M1 Empuje, first exercise)
  const sessRef = db.collection(`courses/${COURSE_ID}/modules/AHSaID03k5K1Cq3qNcIw/sessions/hK5xUHQkhGwR1irfN4eA/exercises`);
  const exSnap = await sessRef.orderBy('order', 'asc').limit(2).get();
  console.log('=== Exercise doc shape (session) ===');
  for (const d of exSnap.docs) {
    console.log(`id=${d.id}`);
    console.log(JSON.stringify(d.data(), null, 2));
    const setsSnap = await d.ref.collection('sets').orderBy('order', 'asc').limit(2).get();
    console.log(`  sets sample (first 2):`);
    for (const s of setsSnap.docs) {
      console.log(`    ${s.id}: ${JSON.stringify(s.data())}`);
    }
  }

  // Sample library entry (PEC DEC + ELEVACIONES LATERALES MANCUERNA)
  console.log('\n=== Library exercise shape ===');
  const libDoc = await db.collection('exercises_library').doc(LIB_ID).get();
  const data = libDoc.data() || {};
  const sample = data.exercises?.MSraEoAeWwZMjwvcH3Eu;
  console.log('PEC DEC (subMap):', JSON.stringify(sample, null, 2));
  const sampleLegacy = data['PEC DEC (APERTURAS EN MÁQUINA)'];
  console.log('PEC DEC (legacy):', JSON.stringify(sampleLegacy, null, 2));

  // Sample a CRUNCH for muscle structure reference
  const crunchLib = data.exercises?.rJpvWPTPeJTKCBurPjZW;
  console.log('\nCRUNCH CONVENCIONAL (subMap):', JSON.stringify(crunchLib, null, 2));
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
