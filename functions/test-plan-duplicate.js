'use strict';
const admin = require('firebase-admin');
admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId: 'wolf-20b8b' });
const db = admin.firestore();
const { FieldValue } = admin.firestore;

function deepEq(a, b) {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== typeof b) return false;
  if (typeof a !== 'object') return false;
  if (a && b && typeof a.toMillis === 'function' && typeof b.toMillis === 'function') {
    return a.toMillis() === b.toMillis();
  }
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!deepEq(a[i], b[i])) return false;
    return true;
  }
  const ak = Object.keys(a), bk = Object.keys(b);
  if (ak.length !== bk.length) return false;
  for (const k of ak) {
    if (!(k in b)) return false;
    if (!deepEq(a[k], b[k])) return false;
  }
  return true;
}

// Mirror of POST /creator/plans/:planId/duplicate
async function duplicatePlan(planId) {
  const sourceRef = db.collection('plans').doc(planId);
  const sourceDoc = await sourceRef.get();
  if (!sourceDoc.exists) throw new Error('source plan not found');
  const sourceData = sourceDoc.data();

  const newDoc = await db.collection('plans').add({
    ...sourceData,
    title: `${sourceData.title ?? 'Plan'} (copia)`,
    created_at: FieldValue.serverTimestamp(),
    updated_at: FieldValue.serverTimestamp(),
  });
  const newRef = db.collection('plans').doc(newDoc.id);

  const modulesSnap = await sourceRef.collection('modules').get();
  let batch = db.batch(); let count = 0;

  for (const mDoc of modulesSnap.docs) {
    const newModRef = newRef.collection('modules').doc();
    batch.set(newModRef, { ...mDoc.data(), id: newModRef.id, created_at: FieldValue.serverTimestamp() });
    count++;
    if (count >= 450) { await batch.commit(); batch = db.batch(); count = 0; }

    const sessSnap = await mDoc.ref.collection('sessions').get();
    for (const sDoc of sessSnap.docs) {
      const newSessRef = newModRef.collection('sessions').doc();
      batch.set(newSessRef, { ...sDoc.data(), id: newSessRef.id, created_at: FieldValue.serverTimestamp() });
      count++;
      if (count >= 450) { await batch.commit(); batch = db.batch(); count = 0; }

      const exSnap = await sDoc.ref.collection('exercises').get();
      for (const eDoc of exSnap.docs) {
        const newExRef = newSessRef.collection('exercises').doc();
        batch.set(newExRef, { ...eDoc.data(), id: newExRef.id, created_at: FieldValue.serverTimestamp() });
        count++;
        if (count >= 450) { await batch.commit(); batch = db.batch(); count = 0; }

        const setsSnap = await eDoc.ref.collection('sets').get();
        for (const setDoc of setsSnap.docs) {
          const newSetRef = newExRef.collection('sets').doc();
          batch.set(newSetRef, { ...setDoc.data(), id: newSetRef.id, created_at: FieldValue.serverTimestamp() });
          count++;
          if (count >= 450) { await batch.commit(); batch = db.batch(); count = 0; }
        }
      }
    }
  }
  if (count > 0) await batch.commit();
  return newDoc.id;
}

async function cascadeDeletePlan(planId) {
  const ref = db.collection('plans').doc(planId);
  const modSnap = await ref.collection('modules').get();
  let batch = db.batch(); let count = 0;
  let stats = { modules: 0, sessions: 0, exercises: 0, sets: 0 };
  for (const m of modSnap.docs) {
    stats.modules++;
    const sessSnap = await m.ref.collection('sessions').get();
    for (const s of sessSnap.docs) {
      stats.sessions++;
      const exSnap = await s.ref.collection('exercises').get();
      for (const e of exSnap.docs) {
        stats.exercises++;
        const setsSnap = await e.ref.collection('sets').get();
        for (const st of setsSnap.docs) {
          stats.sets++;
          batch.delete(st.ref); count++;
          if (count >= 450) { await batch.commit(); batch = db.batch(); count = 0; }
        }
        batch.delete(e.ref); count++;
        if (count >= 450) { await batch.commit(); batch = db.batch(); count = 0; }
      }
      batch.delete(s.ref); count++;
      if (count >= 450) { await batch.commit(); batch = db.batch(); count = 0; }
    }
    batch.delete(m.ref); count++;
    if (count >= 450) { await batch.commit(); batch = db.batch(); count = 0; }
  }
  batch.delete(ref);
  await batch.commit();
  return stats;
}

async function summarizeSubtree(planId) {
  const ref = db.collection('plans').doc(planId);
  const modSnap = await ref.collection('modules').get();
  let stats = { modules: modSnap.size, sessions: 0, exercises: 0, sets: 0 };
  const mods = [];
  for (const m of modSnap.docs) {
    const sessSnap = await m.ref.collection('sessions').get();
    stats.sessions += sessSnap.size;
    const sessions = [];
    for (const s of sessSnap.docs) {
      const exSnap = await s.ref.collection('exercises').get();
      stats.exercises += exSnap.size;
      const exercises = [];
      for (const e of exSnap.docs) {
        const setsSnap = await e.ref.collection('sets').get();
        stats.sets += setsSnap.size;
        exercises.push({ id: e.id, data: e.data(), sets: setsSnap.docs.map(d => d.data()) });
      }
      sessions.push({ id: s.id, data: s.data(), exercises });
    }
    mods.push({ id: m.id, data: m.data(), sessions });
  }
  return { stats, mods };
}

let allPass = true;
const log = (...a) => console.log(...a);

(async () => {
  // ─── A. HTTP probe — confirm route is NOT yet deployed (expect 404) ───
  log('\n━━━ A: HTTP probe (route not deployed yet) ━━━');
  const probe = await fetch('https://api-7jpoi533la-uc.a.run.app/v1/creator/plans/x/duplicate', { method: 'POST' });
  const probeBody = await probe.text();
  log(`  POST .../plans/x/duplicate → HTTP ${probe.status} (pre-deploy)`);
  if (probe.status === 404) log(`  ✓ route returns 404 — confirms NOT yet deployed`);
  else log(`  note: status ${probe.status} — may already be live or unexpected`);

  // ─── B. Find a real plan in prod ───
  log('\n━━━ B: Find a real plan in prod ━━━');
  const plansSnap = await db.collection('plans').limit(20).get();
  log(`  total plans found: ${plansSnap.size}`);

  // pick the plan with the most subcollection data to stress-test batching
  let pick = null;
  let pickStats = null;
  for (const p of plansSnap.docs) {
    const stats = await summarizeSubtree(p.id);
    log(`    ${p.id} (creator=${p.data().creator_id}) title="${p.data().title}" — ${stats.stats.modules}m/${stats.stats.sessions}s/${stats.stats.exercises}e/${stats.stats.sets}sets`);
    if (!pick || (stats.stats.modules + stats.stats.sessions + stats.stats.exercises + stats.stats.sets) > (pickStats.stats.modules + pickStats.stats.sessions + pickStats.stats.exercises + pickStats.stats.sets)) {
      pick = p; pickStats = stats;
    }
  }
  if (!pick) {
    log('  ✗ no plans found in prod — cannot test'); process.exit(1);
  }
  const planData = pick.data();
  log(`\n  selected: "${planData.title}" (${pick.id})`);
  log(`  totals: ${pickStats.stats.modules} modules, ${pickStats.stats.sessions} sessions, ${pickStats.stats.exercises} exercises, ${pickStats.stats.sets} sets`);
  log(`  total writes a duplicate would perform: ${1 + pickStats.stats.modules + pickStats.stats.sessions + pickStats.stats.exercises + pickStats.stats.sets}`);
  log(`  top-level keys: ${Object.keys(planData).sort().join(', ')}`);

  // ─── C. Run the duplicate ───
  log('\n━━━ C: Run duplicate against real plan ━━━');
  const t0 = Date.now();
  const newId = await duplicatePlan(pick.id);
  log(`  → created plan ${newId} (${Date.now() - t0}ms)`);

  // ─── D. Verify ───
  log('\n━━━ D: Verify ━━━');
  const newRoot = (await db.collection('plans').doc(newId).get()).data();
  log(`  new doc: title="${newRoot.title}"`);
  const titleOk = newRoot.title === `${planData.title} (copia)`;
  log(`    ${titleOk ? '✓' : '✗'} title has (copia) suffix`);
  const creatorOk = newRoot.creator_id === planData.creator_id;
  log(`    ${creatorOk ? '✓' : '✗'} creator_id preserved`);
  const descOk = deepEq(newRoot.description, planData.description);
  log(`    ${descOk ? '✓' : '✗'} description preserved`);
  const discOk = deepEq(newRoot.discipline, planData.discipline);
  log(`    ${discOk ? '✓' : '✗'} discipline preserved`);
  if (!titleOk || !creatorOk || !descOk || !discOk) allPass = false;

  const newSubtree = await summarizeSubtree(newId);
  const countsOk = newSubtree.stats.modules === pickStats.stats.modules
    && newSubtree.stats.sessions === pickStats.stats.sessions
    && newSubtree.stats.exercises === pickStats.stats.exercises
    && newSubtree.stats.sets === pickStats.stats.sets;
  log(`    ${countsOk ? '✓' : '✗'} subtree counts match (src=${JSON.stringify(pickStats.stats)} copy=${JSON.stringify(newSubtree.stats)})`);
  if (!countsOk) allPass = false;

  // Verify a sample exercise's primary/alternatives library refs preserved
  if (pickStats.mods[0]?.sessions[0]?.exercises[0]) {
    const srcEx = pickStats.mods[0].sessions[0].exercises[0];
    // sort modules+sessions+exercises by order for stable comparison
    const newMod = [...newSubtree.mods].sort((a,b)=>(a.data.order||0)-(b.data.order||0))[0];
    const newSess = [...newMod.sessions].sort((a,b)=>(a.data.order||0)-(b.data.order||0))[0];
    const newEx = [...newSess.exercises].sort((a,b)=>(a.data.order||0)-(b.data.order||0))[0];
    const primaryOk = deepEq(srcEx.data.primary, newEx?.data?.primary);
    const altOk = deepEq(srcEx.data.alternatives, newEx?.data?.alternatives);
    const idsNew = srcEx.id !== newEx?.id;
    log(`    ${primaryOk ? '✓' : '✗'} exercise.primary (library refs) preserved verbatim`);
    log(`      sample src.primary: ${JSON.stringify(srcEx.data.primary)}`);
    log(`      sample copy.primary: ${JSON.stringify(newEx?.data?.primary)}`);
    log(`    ${altOk ? '✓' : '✗'} exercise.alternatives preserved verbatim`);
    log(`    ${idsNew ? '✓' : '✗'} exercise has fresh ID (src=${srcEx.id} copy=${newEx?.id})`);
    if (!primaryOk || !altOk || !idsNew) allPass = false;
  }

  // ─── E. Cleanup ───
  log('\n━━━ E: Cleanup ━━━');
  const delStats = await cascadeDeletePlan(newId);
  log(`  ✓ deleted plan + ${delStats.modules}m + ${delStats.sessions}s + ${delStats.exercises}e + ${delStats.sets}sets`);

  log('\n' + (allPass ? '✅ ALL CHECKS PASSED' : '❌ SOME CHECKS FAILED'));
  process.exit(allPass ? 0 : 1);
})().catch(err => { console.error('FATAL:', err); process.exit(1); });
