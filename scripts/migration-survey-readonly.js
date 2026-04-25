'use strict';
/**
 * Fresh, comprehensive prod survey for the exercise-identity migration.
 * Read-only. Counts every place that uses the name-as-identity convention.
 */
const admin = require('firebase-admin');
admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId: 'wolf-20b8b' });
const db = admin.firestore();

const META = new Set(['creator_id','creator_name','title','created_at','updated_at','icon']);
const isExEntry = (k, v) => !META.has(k) && typeof v === 'object' && v !== null && !Array.isArray(v);
const sizeBytes = (o) => Buffer.byteLength(JSON.stringify(o), 'utf8');

(async () => {
  // ── 1. exercises_library ──────────────────────────────────────────
  console.log('=== exercises_library ===');
  const libSnap = await db.collection('exercises_library').get();
  const libIndex = new Map(); // libId → Set<exerciseName>
  let totalEx = 0, biggest = 0, biggestId = '';
  const weirdKeys = [];
  let libsWithVideo = 0, exercisesWithVideo = 0;

  for (const d of libSnap.docs) {
    const data = d.data();
    const exNames = Object.keys(data).filter((k) => isExEntry(k, data[k]));
    libIndex.set(d.id, new Set(exNames));
    totalEx += exNames.length;
    const sz = sizeBytes(data);
    if (sz > biggest) { biggest = sz; biggestId = d.id; }
    let libHasVideo = false;
    for (const n of exNames) {
      if (/[./[\]#$]/.test(n)) weirdKeys.push({ libId: d.id, key: n });
      const ex = data[n];
      if (ex.video_url || ex.video_path || ex.video_source) { exercisesWithVideo++; libHasVideo = true; }
    }
    if (libHasVideo) libsWithVideo++;
  }
  console.log(`  library docs: ${libSnap.size}  total exercises: ${totalEx}`);
  console.log(`  largest doc: ${(biggest/1024).toFixed(1)} KB (${biggestId})`);
  console.log(`  exercises with video: ${exercisesWithVideo}  (across ${libsWithVideo} libraries)`);
  console.log(`  weird keys (./[]#$): ${weirdKeys.length}`);
  weirdKeys.forEach((w) => console.log(`    - lib=${w.libId} key="${w.key}"`));

  // ── 2. creator_libraries (now-populated) ──────────────────────────
  console.log('\n=== creator_libraries → sessions → exercises ===');
  const creatorRefs = await db.collection('creator_libraries').listDocuments();
  let clSessions = 0, clEx = 0, clWithPrimary = 0, clWithAlt = 0, clWithName = 0, clOrphanLib = 0, clOrphanKey = 0;
  const perCreator = [];
  let sampleClEx = null;

  for (const cRef of creatorRefs) {
    const sSnap = await cRef.collection('sessions').get();
    let cExCount = 0;
    for (const sDoc of sSnap.docs) {
      const exSnap = await sDoc.ref.collection('exercises').get();
      cExCount += exSnap.size;
      for (const eDoc of exSnap.docs) {
        const e = eDoc.data();
        if (e.primary && Object.keys(e.primary).length) clWithPrimary++;
        if (e.alternatives && typeof e.alternatives === 'object' && Object.keys(e.alternatives).length) clWithAlt++;
        if (typeof e.name === 'string' && e.name.trim()) clWithName++;
        if (e.primary) {
          for (const lid of Object.keys(e.primary)) {
            if (!libIndex.has(lid)) clOrphanLib++;
            else if (!libIndex.get(lid).has(e.primary[lid])) clOrphanKey++;
          }
        }
        if (!sampleClEx) sampleClEx = { creatorId: cRef.id, sessionId: sDoc.id, exId: eDoc.id, data: e };
      }
    }
    clSessions += sSnap.size;
    clEx += cExCount;
    perCreator.push({ creatorId: cRef.id, sessions: sSnap.size, exercises: cExCount });
  }
  console.log(`  creators with library: ${creatorRefs.length}  sessions: ${clSessions}  exercise docs: ${clEx}`);
  console.log(`  withPrimary=${clWithPrimary}  withAlternatives=${clWithAlt}  withName=${clWithName}`);
  console.log(`  orphans: lib-missing=${clOrphanLib}  key-missing=${clOrphanKey}`);
  perCreator.sort((a, b) => b.sessions - a.sessions);
  perCreator.forEach((p) => console.log(`    ${p.creatorId}: ${p.sessions} sessions / ${p.exercises} exercises`));
  if (sampleClEx) {
    console.log('\n  SAMPLE creator_libraries exercise doc:');
    console.log(JSON.stringify(sampleClEx, null, 2).split('\n').map((l) => '    ' + l).join('\n'));
  }

  // also count modules so we don't miss them
  let clModules = 0;
  for (const cRef of creatorRefs) {
    const m = await cRef.collection('modules').get();
    clModules += m.size;
  }
  console.log(`\n  creator_libraries modules total: ${clModules}`);

  // ── 3. courses ───────────────────────────────────────────────────
  console.log('\n=== courses → modules → sessions → exercises ===');
  let cMod = 0, cSes = 0, cEx = 0, cPrim = 0, cAlt = 0, cName = 0, cOrphLib = 0, cOrphKey = 0;
  let sampleCourseEx = null;
  const cSnap = await db.collection('courses').get();
  for (const cDoc of cSnap.docs) {
    const mSnap = await cDoc.ref.collection('modules').get();
    cMod += mSnap.size;
    for (const mDoc of mSnap.docs) {
      const sSnap = await mDoc.ref.collection('sessions').get();
      cSes += sSnap.size;
      for (const sDoc of sSnap.docs) {
        const exSnap = await sDoc.ref.collection('exercises').get();
        cEx += exSnap.size;
        for (const eDoc of exSnap.docs) {
          const e = eDoc.data();
          if (e.primary && Object.keys(e.primary).length) cPrim++;
          if (e.alternatives && typeof e.alternatives === 'object' && Object.keys(e.alternatives).length) cAlt++;
          if (typeof e.name === 'string' && e.name.trim()) cName++;
          if (e.primary) {
            for (const lid of Object.keys(e.primary)) {
              if (!libIndex.has(lid)) cOrphLib++;
              else if (!libIndex.get(lid).has(e.primary[lid])) cOrphKey++;
            }
          }
          if (!sampleCourseEx) sampleCourseEx = { courseId: cDoc.id, exId: eDoc.id, data: e };
        }
      }
    }
  }
  console.log(`  courses: ${cSnap.size}  modules: ${cMod}  sessions: ${cSes}  exercises: ${cEx}`);
  console.log(`  withPrimary=${cPrim}  withAlternatives=${cAlt}  withName=${cName}`);
  console.log(`  orphans: lib-missing=${cOrphLib}  key-missing=${cOrphKey}`);

  // ── 4. plans ─────────────────────────────────────────────────────
  console.log('\n=== plans → modules → sessions → exercises ===');
  let pMod = 0, pSes = 0, pEx = 0, pPrim = 0, pAlt = 0, pName = 0, pOrphLib = 0, pOrphKey = 0;
  const pSnap = await db.collection('plans').get();
  for (const pDoc of pSnap.docs) {
    const mSnap = await pDoc.ref.collection('modules').get();
    pMod += mSnap.size;
    for (const mDoc of mSnap.docs) {
      const sSnap = await mDoc.ref.collection('sessions').get();
      pSes += sSnap.size;
      for (const sDoc of sSnap.docs) {
        const exSnap = await sDoc.ref.collection('exercises').get();
        pEx += exSnap.size;
        for (const eDoc of exSnap.docs) {
          const e = eDoc.data();
          if (e.primary && Object.keys(e.primary).length) pPrim++;
          if (e.alternatives && typeof e.alternatives === 'object' && Object.keys(e.alternatives).length) pAlt++;
          if (typeof e.name === 'string' && e.name.trim()) pName++;
          if (e.primary) {
            for (const lid of Object.keys(e.primary)) {
              if (!libIndex.has(lid)) pOrphLib++;
              else if (!libIndex.get(lid).has(e.primary[lid])) pOrphKey++;
            }
          }
        }
      }
    }
  }
  console.log(`  plans: ${pSnap.size}  modules: ${pMod}  sessions: ${pSes}  exercises: ${pEx}`);
  console.log(`  withPrimary=${pPrim}  withAlternatives=${pAlt}  withName=${pName}`);
  console.log(`  orphans: lib-missing=${pOrphLib}  key-missing=${pOrphKey}`);

  // ── 5. client_plan_content / client_nutrition_plan_content / nutrition_assignments? ──
  // Only client_plan_content can have exercise refs — check shape.
  console.log('\n=== client_plan_content ===');
  const cpc = await db.collection('client_plan_content').get();
  let cpcEx = 0, cpcPrim = 0;
  let sampleCpc = null;
  for (const dDoc of cpc.docs) {
    // client_plan_content is per-assignment. Look at any subcollections.
    const subs = await dDoc.ref.listCollections();
    for (const sub of subs) {
      const sub1 = await sub.get();
      for (const sd of sub1.docs) {
        // dive deeper if it has exercises
        const subSubs = await sd.ref.listCollections();
        for (const ss of subSubs) {
          const exSnap = await ss.get();
          for (const eDoc of exSnap.docs) {
            const e = eDoc.data();
            if (e.primary && typeof e.primary === 'object' && Object.keys(e.primary).length) {
              cpcPrim++; cpcEx++;
              if (!sampleCpc) sampleCpc = { id: dDoc.id, path: eDoc.ref.path, data: e };
            }
          }
        }
      }
    }
  }
  console.log(`  client_plan_content docs: ${cpc.size}  ex-with-primary found: ${cpcPrim}`);
  if (sampleCpc) {
    console.log('  SAMPLE client_plan_content exercise:');
    console.log('    path: ' + sampleCpc.path);
    console.log('    data: ' + JSON.stringify(sampleCpc.data).slice(0, 300));
  }

  // ── 6. sessionHistory snapshot shape ─────────────────────────────
  console.log('\n=== sessionHistory (sample) ===');
  const usersSnap = await db.collection('users').limit(800).get();
  let histSampled = 0, histWithPrimary = 0, histWithExName = 0, histWithExId = 0;
  let sampleHist = null;
  for (const u of usersSnap.docs) {
    const h = await u.ref.collection('sessionHistory').limit(2).get();
    for (const hd of h.docs) {
      histSampled++;
      const data = hd.data();
      const ex = Array.isArray(data.exercises) ? data.exercises : [];
      for (const e of ex) {
        if (e?.primary && typeof e.primary === 'object') histWithPrimary++;
        if (typeof e?.exerciseName === 'string' && e.exerciseName) histWithExName++;
        if (typeof e?.exerciseId === 'string' && e.exerciseId) histWithExId++;
      }
      if (!sampleHist && ex.length) sampleHist = { uid: u.id, hid: hd.id, ex0: ex[0] };
      if (histSampled >= 200) break;
    }
    if (histSampled >= 200) break;
  }
  console.log(`  sampled docs: ${histSampled}`);
  console.log(`  exercises with primary ref: ${histWithPrimary}`);
  console.log(`  exercises with exerciseName snapshot: ${histWithExName}`);
  console.log(`  exercises with exerciseId field: ${histWithExId}`);

  // ── 7. exerciseHistory + exerciseLastPerformance shapes ──────────
  console.log('\n=== exerciseHistory / exerciseLastPerformance (sample) ===');
  let ehDocs = 0, elDocs = 0, ehKeys = new Set();
  for (const u of usersSnap.docs) {
    const eh = await u.ref.collection('exerciseHistory').limit(3).get();
    ehDocs += eh.size;
    eh.docs.forEach((d) => Object.keys(d.data() || {}).forEach((k) => ehKeys.add(k)));
    const el = await u.ref.collection('exerciseLastPerformance').limit(3).get();
    elDocs += el.size;
    if (ehDocs > 30) break;
  }
  console.log(`  exerciseHistory sample docs: ${ehDocs}  field-name union: [${[...ehKeys].join(',')}]`);

  console.log('\n✓ done');
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
