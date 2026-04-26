#!/usr/bin/env node
'use strict';

/**
 * Exercise-Identity Migration — Phase 1
 *
 * Rekeys exercises_library entries from name-as-key to id-as-key
 * (with a displayName field), then rewrites every session-exercise
 * reference across the database, then rekeys per-user history docs.
 *
 * Affected collections:
 *   - exercises_library/{libId}                                                    (rekey)
 *   - creator_libraries/{creator}/sessions/{ses}/exercises/{ex}                    (rewrite primary/alternatives)
 *   - courses/{c}/modules/{m}/sessions/{s}/exercises/{e}                           (rewrite primary/alternatives)
 *   - plans/{p}/modules/{m}/sessions/{s}/exercises/{e}                             (rewrite primary/alternatives)
 *   - client_plan_content/{id}/sessions/{s}/exercises/{e}                          (rewrite primary/alternatives)
 *   - users/{uid}/exerciseHistory/{libId_name}        → /{libId_id}                (rekey + backup)
 *   - users/{uid}/exerciseLastPerformance/{libId_name} → /{libId_id}               (rekey + backup)
 *
 * Forward compatibility: the library doc keeps its old top-level name keys
 * alongside the new `exercises.{id}` sub-map. Old clients keep working until
 * Phase 4 cleanup. The Phase-0 read tolerance (deployed in commit bc02a64)
 * makes the new shape readable now.
 *
 * Usage:
 *   node scripts/migration-exercise-id.js                  # full dry-run
 *   node scripts/migration-exercise-id.js --write          # commit
 *   node scripts/migration-exercise-id.js --step=libs      # only steps 1+2
 *   node scripts/migration-exercise-id.js --step=refs      # only step 3
 *   node scripts/migration-exercise-id.js --step=history   # only step 4
 *   node scripts/migration-exercise-id.js --user=UID       # limit step 4 to one user
 *   node scripts/migration-exercise-id.js --verbose        # log every doc rewrite
 *
 * Without --write the script performs zero writes. With --write, history docs
 * are first BACKED UP to users/{uid}/exerciseHistory_pre_id_migration/{key}
 * (and exerciseLastPerformance_pre_id_migration) before the delete-and-rewrite.
 *
 * Requires: NODE_PATH=functions/node_modules (firebase-admin lives there) and
 * gcloud application-default credentials.
 */

const admin = require('firebase-admin');

const PROJECT_ID = 'wolf-20b8b';
admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  projectId: PROJECT_ID,
});
const db = admin.firestore();
const { FieldValue, Timestamp } = admin.firestore;

const META_KEYS = new Set([
  'creator_id', 'creator_name', 'title', 'created_at', 'updated_at', 'icon',
  'exercises', // post-Phase-1 sub-map; ignore so re-runs don't double-process
]);

const isExerciseEntry = (k, v) =>
  !META_KEYS.has(k) && typeof v === 'object' && v !== null && !Array.isArray(v) && !(v instanceof Timestamp);

// ─────────────────────────────────────────────────────────────────────
// CLI args

function parseArgs(argv) {
  const args = { write: false, step: 'all', user: null, verbose: false };
  for (const a of argv) {
    if (a === '--write') args.write = true;
    else if (a === '--verbose') args.verbose = true;
    else if (a.startsWith('--step=')) args.step = a.split('=')[1];
    else if (a.startsWith('--user=')) args.user = a.split('=')[1];
    else if (a === '--help' || a === '-h') { printHelp(); process.exit(0); }
    else { console.error(`Unknown flag: ${a}`); process.exit(1); }
  }
  if (!['all', 'libs', 'refs', 'history'].includes(args.step)) {
    console.error(`--step must be one of: all, libs, refs, history`); process.exit(1);
  }
  return args;
}

function printHelp() {
  console.log(`Usage: node scripts/migration-exercise-id.js [flags]
  --write              commit changes (default: dry-run)
  --step=all|libs|refs|history   default: all
  --user=UID           limit history step to one user (debug)
  --verbose            log every individual rewrite`);
}

// ─────────────────────────────────────────────────────────────────────
// Step 1: build the migration plan (read-only)

/**
 * Returns:
 *   plan[libId] = {
 *     libRef:        DocumentReference,
 *     existingExercisesMap: object | null,  // existing `exercises` field if re-run
 *     entries: {
 *       [oldName]: { newId, oldData, alreadyMigrated: boolean }
 *     }
 *   }
 */
async function buildPlan() {
  const libSnap = await db.collection('exercises_library').get();
  const plan = {};
  let totalExercises = 0;
  let alreadyMigrated = 0;

  for (const libDoc of libSnap.docs) {
    const data = libDoc.data();
    const existingExercisesMap = (data.exercises && typeof data.exercises === 'object' && !Array.isArray(data.exercises))
      ? data.exercises : null;

    // If a previous run wrote `exercises.{id}`, recover the oldName→id map from displayName.
    const recoveredMap = {};
    if (existingExercisesMap) {
      for (const [id, entry] of Object.entries(existingExercisesMap)) {
        const dn = entry && entry.displayName;
        if (typeof dn === 'string') recoveredMap[dn] = id;
      }
    }

    const entries = {};
    for (const [k, v] of Object.entries(data)) {
      if (!isExerciseEntry(k, v)) continue;
      totalExercises++;
      if (recoveredMap[k]) {
        entries[k] = { newId: recoveredMap[k], oldData: v, alreadyMigrated: true };
        alreadyMigrated++;
      } else {
        entries[k] = { newId: db.collection('_').doc().id, oldData: v, alreadyMigrated: false };
      }
    }

    plan[libDoc.id] = {
      libRef: libDoc.ref,
      existingExercisesMap,
      entries,
    };
  }

  console.log(`\n=== Plan ===`);
  console.log(`  libraries: ${libSnap.size}`);
  console.log(`  exercises (total): ${totalExercises}`);
  console.log(`  already migrated (recovered from prior run): ${alreadyMigrated}`);
  console.log(`  to migrate: ${totalExercises - alreadyMigrated}`);
  return plan;
}

/** Resolve a value (could be an oldName or an already-rewritten ID) for libId. */
function resolveValue(plan, libId, value) {
  const lib = plan[libId];
  if (!lib) return { resolved: value, status: 'lib-missing' };
  // Already an ID we generated?
  for (const e of Object.values(lib.entries)) {
    if (e.newId === value) return { resolved: value, status: 'already-id' };
  }
  // Old name we know about?
  const entry = lib.entries[value];
  if (entry) return { resolved: entry.newId, status: 'rewritten' };
  return { resolved: value, status: 'name-missing' };
}

// ─────────────────────────────────────────────────────────────────────
// Step 2: write `exercises.{id}` sub-map on each library doc

async function applyLibraryRewrites(plan, opts) {
  console.log(`\n=== Step 2: library rewrites ===`);
  let libs = 0, entries = 0, skipped = 0;

  for (const [libId, lib] of Object.entries(plan)) {
    const exercisesField = { ...(lib.existingExercisesMap || {}) };
    let added = 0;
    for (const [oldName, e] of Object.entries(lib.entries)) {
      if (e.alreadyMigrated) continue;
      exercisesField[e.newId] = {
        displayName: oldName,
        ...e.oldData, // muscle_activation, implements, video_url, video_path, video_source, created_at, updated_at, ...
      };
      added++;
      entries++;
      if (opts.verbose) console.log(`  [${libId}]  + ${e.newId}  displayName="${oldName}"`);
    }
    if (added === 0) { skipped++; continue; }
    libs++;
    if (opts.write) {
      await lib.libRef.update({
        exercises: exercisesField,
        updated_at: FieldValue.serverTimestamp(),
      });
    }
  }

  console.log(`  libraries written: ${libs} (skipped ${skipped} with no new entries)`);
  console.log(`  exercise entries added to .exercises map: ${entries}`);
  if (!opts.write) console.log(`  (dry-run)`);
}

// ─────────────────────────────────────────────────────────────────────
// Step 3: rewrite primary/alternatives across all session-exercise refs

async function* walkCreatorLibraries() {
  const creators = await db.collection('creator_libraries').listDocuments();
  for (const cRef of creators) {
    const sessSnap = await cRef.collection('sessions').get();
    for (const sDoc of sessSnap.docs) {
      const exSnap = await sDoc.ref.collection('exercises').get();
      for (const eDoc of exSnap.docs) yield eDoc;
    }
  }
}

function walkCoursesOrPlans(rootCol) {
  return async function* () {
    const rootSnap = await db.collection(rootCol).get();
    for (const rDoc of rootSnap.docs) {
      const modSnap = await rDoc.ref.collection('modules').get();
      for (const mDoc of modSnap.docs) {
        const sessSnap = await mDoc.ref.collection('sessions').get();
        for (const sDoc of sessSnap.docs) {
          const exSnap = await sDoc.ref.collection('exercises').get();
          for (const eDoc of exSnap.docs) yield eDoc;
        }
      }
    }
  };
}

async function* walkClientPlanContent() {
  // client_plan_content has shape: {id}/sessions/{s}/exercises/{e}
  const rootSnap = await db.collection('client_plan_content').get();
  for (const rDoc of rootSnap.docs) {
    const sessSnap = await rDoc.ref.collection('sessions').get();
    for (const sDoc of sessSnap.docs) {
      const exSnap = await sDoc.ref.collection('exercises').get();
      for (const eDoc of exSnap.docs) yield eDoc;
    }
  }
}

const REF_COLLECTIONS = [
  // [label, walker-factory]
  ['creator_libraries',  walkCreatorLibraries],
  ['courses',            walkCoursesOrPlans('courses')],
  ['plans',              walkCoursesOrPlans('plans')],
  ['client_plan_content', walkClientPlanContent],
];

async function applyRefRewrites(plan, opts) {
  console.log(`\n=== Step 3: session-exercise ref rewrites ===`);
  const tally = {};

  for (const [label, walker] of REF_COLLECTIONS) {
    let total = 0, rewritten = 0, unchanged = 0, orphans = 0;
    const orphanSamples = [];
    process.stdout.write(`  ${label}: scanning...`);

    for await (const eDoc of walker()) {
      total++;
      const data = eDoc.data();
      const updates = {};
      let didChange = false;
      let didOrphan = false;

      // primary: { libId: name|id } — single entry in practice
      if (data.primary && typeof data.primary === 'object' && !Array.isArray(data.primary)) {
        const newPrimary = {};
        for (const [libId, value] of Object.entries(data.primary)) {
          if (typeof value !== 'string') { newPrimary[libId] = value; continue; }
          const r = resolveValue(plan, libId, value);
          newPrimary[libId] = r.resolved;
          if (r.status === 'rewritten') didChange = true;
          if (r.status === 'lib-missing' || r.status === 'name-missing') {
            didOrphan = true;
            if (orphanSamples.length < 5) orphanSamples.push({ path: eDoc.ref.path, libId, value, status: r.status });
          }
        }
        updates.primary = newPrimary;
      }

      // alternatives: { libId: [name|id, ...] }
      if (data.alternatives && typeof data.alternatives === 'object' && !Array.isArray(data.alternatives)) {
        const newAlts = {};
        for (const [libId, arr] of Object.entries(data.alternatives)) {
          if (!Array.isArray(arr)) { newAlts[libId] = arr; continue; }
          const newArr = [];
          for (const v of arr) {
            if (typeof v !== 'string') { newArr.push(v); continue; }
            const r = resolveValue(plan, libId, v);
            newArr.push(r.resolved);
            if (r.status === 'rewritten') didChange = true;
            if (r.status === 'lib-missing' || r.status === 'name-missing') {
              didOrphan = true;
              if (orphanSamples.length < 5) orphanSamples.push({ path: eDoc.ref.path, libId, value: v, status: r.status });
            }
          }
          newAlts[libId] = newArr;
        }
        updates.alternatives = newAlts;
      }

      if (didOrphan) orphans++;
      if (!didChange) { unchanged++; continue; }
      rewritten++;

      if (opts.verbose) console.log(`  [${label}] ${eDoc.ref.path}  primary=${JSON.stringify(updates.primary)}`);
      if (opts.write) {
        updates.updated_at = FieldValue.serverTimestamp();
        await eDoc.ref.update(updates);
      }
    }

    tally[label] = { total, rewritten, unchanged, orphans };
    process.stdout.write(`\r  ${label}:  total=${total}  rewritten=${rewritten}  unchanged=${unchanged}  orphans=${orphans}\n`);
    if (orphanSamples.length) {
      console.log(`    orphan samples:`);
      orphanSamples.forEach((s) => console.log(`      ${s.status}  libId=${s.libId}  value="${s.value}"  ${s.path}`));
    }
  }
  if (!opts.write) console.log(`  (dry-run)`);
  return tally;
}

// ─────────────────────────────────────────────────────────────────────
// Step 4: rekey users/{uid}/exerciseHistory and exerciseLastPerformance

async function rekeyUserHistoryCol(userRef, colName, plan, opts) {
  const backupCol = `${colName}_pre_id_migration`;
  const snap = await userRef.collection(colName).get();
  let total = 0, rekeyed = 0, alreadyNew = 0, orphans = 0;
  const orphanSamples = [];

  for (const d of snap.docs) {
    total++;
    const oldKey = d.id;
    const sep = oldKey.indexOf('_');
    if (sep <= 0) continue; // unexpected key shape, skip
    const libId = oldKey.slice(0, sep);
    const tail = oldKey.slice(sep + 1);
    const r = resolveValue(plan, libId, tail);
    if (r.status === 'already-id') { alreadyNew++; continue; }
    if (r.status !== 'rewritten') {
      orphans++;
      if (orphanSamples.length < 5) orphanSamples.push({ path: d.ref.path, oldKey, status: r.status });
      continue;
    }
    const newKey = `${libId}_${r.resolved}`;
    if (newKey === oldKey) { alreadyNew++; continue; }
    rekeyed++;

    if (opts.verbose) console.log(`    [${colName}] ${oldKey}  →  ${newKey}`);
    if (opts.write) {
      const data = d.data();
      // 1) backup original
      await userRef.collection(backupCol).doc(oldKey).set({
        ...data,
        _migrated_at: FieldValue.serverTimestamp(),
        _old_key: oldKey,
        _new_key: newKey,
      });
      // 2) write new key with id-aware body
      await userRef.collection(colName).doc(newKey).set({
        ...data,
        exerciseId: r.resolved,
      });
      // 3) delete old
      await userRef.collection(colName).doc(oldKey).delete();
    }
  }
  return { total, rekeyed, alreadyNew, orphans, orphanSamples };
}

async function applyHistoryRekey(plan, opts) {
  console.log(`\n=== Step 4: user history rekey ===`);

  let userIds;
  if (opts.user) {
    userIds = [opts.user];
  } else {
    const usersSnap = await db.collection('users').select().get();
    userIds = usersSnap.docs.map((d) => d.id);
  }
  console.log(`  users to scan: ${userIds.length}`);

  let totals = { eh: { total: 0, rekeyed: 0, alreadyNew: 0, orphans: 0 },
                 el: { total: 0, rekeyed: 0, alreadyNew: 0, orphans: 0 } };
  const allOrphanSamples = [];

  for (let i = 0; i < userIds.length; i++) {
    const uid = userIds[i];
    const userRef = db.collection('users').doc(uid);
    const eh = await rekeyUserHistoryCol(userRef, 'exerciseHistory', plan, opts);
    const el = await rekeyUserHistoryCol(userRef, 'exerciseLastPerformance', plan, opts);
    for (const k of Object.keys(totals.eh)) totals.eh[k] += eh[k];
    for (const k of Object.keys(totals.el)) totals.el[k] += el[k];
    if (eh.orphanSamples.length || el.orphanSamples.length) {
      allOrphanSamples.push(...eh.orphanSamples, ...el.orphanSamples);
    }
    if ((i + 1) % 50 === 0) console.log(`    ...${i + 1}/${userIds.length} users`);
  }

  console.log(`  exerciseHistory:          total=${totals.eh.total}  rekeyed=${totals.eh.rekeyed}  alreadyNew=${totals.eh.alreadyNew}  orphans=${totals.eh.orphans}`);
  console.log(`  exerciseLastPerformance:  total=${totals.el.total}  rekeyed=${totals.el.rekeyed}  alreadyNew=${totals.el.alreadyNew}  orphans=${totals.el.orphans}`);
  if (allOrphanSamples.length) {
    console.log(`  orphan samples (first 8):`);
    allOrphanSamples.slice(0, 8).forEach((s) => console.log(`    ${s.status}  ${s.path}`));
  }
  if (!opts.write) console.log(`  (dry-run — would have backed up + rekeyed each above)`);
}

// ─────────────────────────────────────────────────────────────────────
// Main

(async () => {
  const opts = parseArgs(process.argv.slice(2));
  console.log(`\nProject: ${PROJECT_ID}    Mode: ${opts.write ? 'WRITE' : 'DRY-RUN'}    Step: ${opts.step}    Verbose: ${opts.verbose}`);
  if (opts.user) console.log(`User: ${opts.user}`);

  const plan = await buildPlan();

  if (opts.step === 'libs' || opts.step === 'all') {
    await applyLibraryRewrites(plan, opts);
  }

  if (opts.step === 'refs' || opts.step === 'all') {
    await applyRefRewrites(plan, opts);
  }

  if (opts.step === 'history' || opts.step === 'all') {
    await applyHistoryRekey(plan, opts);
  }

  console.log(`\n${opts.write ? '✓ WRITE complete' : '✓ DRY-RUN complete — re-run with --write to commit'}\n`);
  process.exit(0);
})().catch((e) => { console.error('\nMIGRATION ERROR:', e); process.exit(1); });
