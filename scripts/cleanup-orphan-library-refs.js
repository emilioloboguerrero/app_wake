#!/usr/bin/env node
'use strict';

/**
 * Hard-deletes every doc that references a given (deleted) libraryId.
 * Targets:
 *   - creator_libraries/{c}/sessions/{s}/exercises/{e}                 with primary[libId]
 *   - plans/{p}/modules/{m}/sessions/{s}/exercises/{e}                  with primary[libId]
 *   - courses/{c}/modules/{m}/sessions/{s}/exercises/{e}                with primary[libId]
 *   - client_plan_content/{id}/sessions/{s}/exercises/{e}               with primary[libId]
 *   - users/{uid}/exerciseHistory/{libId_*}
 *   - users/{uid}/exerciseLastPerformance/{libId_*}
 *
 * Default: dry-run. Pass --write to commit. Pass --libIds=A,B to target multiple.
 *
 * Usage:
 *   node scripts/cleanup-orphan-library-refs.js --libIds=ftX6UgCfhh43wWaLDvfo
 *   node scripts/cleanup-orphan-library-refs.js --libIds=ftX6UgCfhh43wWaLDvfo --write
 */

const admin = require('firebase-admin');
admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId: 'wolf-20b8b' });
const db = admin.firestore();

function parseArgs(argv) {
  const args = { write: false, libIds: [] };
  for (const a of argv) {
    if (a === '--write') args.write = true;
    else if (a.startsWith('--libIds=')) args.libIds = a.split('=')[1].split(',').filter(Boolean);
    else { console.error(`Unknown flag: ${a}`); process.exit(1); }
  }
  if (args.libIds.length === 0) { console.error('Pass --libIds=A,B'); process.exit(1); }
  return args;
}

async function* walk4(rootCol, hasModules) {
  const r = await db.collection(rootCol).get();
  for (const rDoc of r.docs) {
    if (hasModules) {
      const ms = await rDoc.ref.collection('modules').get();
      for (const mDoc of ms.docs) {
        const ss = await mDoc.ref.collection('sessions').get();
        for (const sDoc of ss.docs) {
          const es = await sDoc.ref.collection('exercises').get();
          for (const eDoc of es.docs) yield eDoc;
        }
      }
    } else {
      const ss = await rDoc.ref.collection('sessions').get();
      for (const sDoc of ss.docs) {
        const es = await sDoc.ref.collection('exercises').get();
        for (const eDoc of es.docs) yield eDoc;
      }
    }
  }
}

async function* walkCreatorLibs() {
  const refs = await db.collection('creator_libraries').listDocuments();
  for (const r of refs) {
    const ss = await r.collection('sessions').get();
    for (const sDoc of ss.docs) {
      const es = await sDoc.ref.collection('exercises').get();
      for (const eDoc of es.docs) yield eDoc;
    }
  }
}

const REF_WALKERS = [
  ['creator_libraries',   walkCreatorLibs],
  ['courses',             () => walk4('courses', true)],
  ['plans',               () => walk4('plans', true)],
  ['client_plan_content', () => walk4('client_plan_content', false)],
];

(async () => {
  const opts = parseArgs(process.argv.slice(2));
  const libIdSet = new Set(opts.libIds);
  console.log(`\nProject: wolf-20b8b   Mode: ${opts.write ? 'WRITE' : 'DRY-RUN'}`);
  console.log(`Target libIds: ${opts.libIds.join(', ')}`);

  let totalDeletes = 0;
  const refsToDelete = [];

  console.log(`\n--- Scanning session-exercise refs ---`);
  for (const [label, walkerFn] of REF_WALKERS) {
    let hits = 0;
    for await (const eDoc of walkerFn()) {
      const data = eDoc.data();
      const primary = data.primary;
      if (!primary || typeof primary !== 'object') continue;
      const matchesLibId = Object.keys(primary).some((k) => libIdSet.has(k));
      if (matchesLibId) {
        refsToDelete.push(eDoc.ref);
        hits++;
      }
    }
    console.log(`  ${label}: ${hits} doc(s) match`);
  }

  console.log(`\n--- Scanning user history ---`);
  const hits = { eh: [], el: [] };
  const userDocs = await db.collection('users').select().get();
  for (const u of userDocs.docs) {
    for (const colName of ['exerciseHistory', 'exerciseLastPerformance']) {
      const snap = await u.ref.collection(colName).get();
      for (const d of snap.docs) {
        const sep = d.id.indexOf('_');
        if (sep <= 0) continue;
        const libId = d.id.slice(0, sep);
        if (libIdSet.has(libId)) hits[colName === 'exerciseHistory' ? 'eh' : 'el'].push(d.ref);
      }
    }
  }
  console.log(`  exerciseHistory: ${hits.eh.length} doc(s) match`);
  console.log(`  exerciseLastPerformance: ${hits.el.length} doc(s) match`);

  const allDeletes = [...refsToDelete, ...hits.eh, ...hits.el];
  totalDeletes = allDeletes.length;

  console.log(`\n--- Plan ---`);
  console.log(`Total docs to delete: ${totalDeletes}`);
  for (const ref of allDeletes) console.log(`  - ${ref.path}`);

  if (!opts.write) {
    console.log(`\n(dry-run — re-run with --write to commit)\n`);
    process.exit(0);
  }

  console.log(`\n--- DELETING ---`);
  let n = 0;
  for (const ref of allDeletes) {
    await ref.delete();
    n++;
    if (n % 25 === 0) console.log(`  ...${n}/${totalDeletes}`);
  }
  console.log(`\n✓ deleted ${n} doc(s)\n`);
  process.exit(0);
})().catch((e) => { console.error('CLEANUP ERROR:', e); process.exit(1); });
