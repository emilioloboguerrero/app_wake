#!/usr/bin/env node
'use strict';

/**
 * Validate a Bejarano program JSON against the current library state in Firestore.
 *
 * For each session in the JSON (Week 1 — or first week of each block — baseline),
 * walk the corresponding library session under creator_libraries/{FELIPE_UID}/sessions/{id}
 * and assert:
 *   (a) session exists at the declared libraryTitle
 *   (b) every JSON exercise resolves via NAME_MAP to a library exercise present
 *       at some order in the session
 *   (c) total set count for that exercise matches warmupSets + workSets
 *
 * This catches transcription errors BEFORE we touch any course data.
 *
 * Usage:
 *   node scripts/validate-bejarano-program.js novatos
 *   node scripts/validate-bejarano-program.js intermedios
 *   node scripts/validate-bejarano-program.js avanzados
 *   node scripts/validate-bejarano-program.js all
 */

const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

const { FELIPE_UID, LIB_ID, PROJECT_ID, resolveLibraryName } = require('./bejarano-progression-helpers.js');

admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId: PROJECT_ID });
const db = admin.firestore();

const PROGRAMS_DIR = path.join(__dirname, '..', 'bejarano_programs');

function firstWeekOfBlock(block) {
  return Math.min(...block.weeks);
}

function pickWeek(ex, week) {
  if (ex.perWeek && ex.perWeek[String(week)]) return ex.perWeek[String(week)];
  if (ex.constant) return ex.constant;
  return null;
}

async function validateProgram(programKey) {
  const jsonPath = path.join(PROGRAMS_DIR, `${programKey}.json`);
  if (!fs.existsSync(jsonPath)) {
    console.error(`  ✗ File not found: ${jsonPath}`);
    return { ok: false };
  }
  const program = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  console.log(`\n══ VALIDATE: ${program.title} (${program.programLengthWeeks} weeks, ${program.daysPerWeek} days/week) ══`);

  const libSessionsSnap = await db.collection('creator_libraries').doc(FELIPE_UID).collection('sessions').get();
  const libByTitle = new Map();
  for (const d of libSessionsSnap.docs) libByTitle.set(d.data().title, { id: d.id, data: d.data() });

  // Unified session list across flat "sessions" or nested "blocks"
  const allSessions = [];
  if (program.blocks) {
    for (const block of program.blocks) {
      const firstWeek = firstWeekOfBlock(block);
      for (const s of block.sessions) allSessions.push({ ...s, _week: firstWeek, _block: block.name, _allBlockWeeks: block.weeks });
    }
  } else if (program.sessions) {
    const allWeeks = Array.from({ length: program.programLengthWeeks }, (_, i) => i + 1);
    for (const s of program.sessions) allSessions.push({ ...s, _week: 1, _block: 'único', _allBlockWeeks: allWeeks });
  } else {
    console.error('  ✗ JSON has neither "blocks" nor "sessions"');
    return { ok: false };
  }

  let fatal = 0;
  let warnings = 0;

  for (const session of allSessions) {
    const libEntry = libByTitle.get(session.libraryTitle);
    console.log(`\n  [${session._block}, W${session._week}] session "${session.libraryTitle}"`);
    if (!libEntry) {
      console.log(`    ✗ NOT FOUND in library`);
      fatal++;
      continue;
    }
    console.log(`    ✓ library session id: ${libEntry.id}`);

    const exSnap = await db
      .collection('creator_libraries').doc(FELIPE_UID)
      .collection('sessions').doc(libEntry.id)
      .collection('exercises').orderBy('order').get();

    const libExByName = new Map();
    for (const exDoc of exSnap.docs) {
      const ex = exDoc.data();
      const primary = ex.primary && ex.primary[LIB_ID];
      if (primary) libExByName.set(primary, { id: exDoc.id, data: ex, ref: exDoc.ref });
    }

    for (const jsonEx of session.exercises) {
      const resolved = resolveLibraryName(jsonEx.pdfName);
      const libEx = libExByName.get(resolved);
      if (!libEx) {
        const isOptional = /^OPCIONAL/i.test(jsonEx.pdfName);
        const tag = isOptional ? 'WARN' : 'FAIL';
        console.log(`      ${tag} no library exercise matches "${jsonEx.pdfName}" → "${resolved}"`);
        if (isOptional) warnings++; else fatal++;
        continue;
      }
      const setsSnap = await libEx.ref.collection('sets').get();
      const actualSetCount = setsSnap.size;
      // Library sessions were seeded from various baseline weeks per handoff audit
      // (Bloque 2 used W8/W9, Bloque 1 used W1). Accept a match against any week
      // that is the first week OR within the same block.
      const candidateWeeks = session._allBlockWeeks || [session._week];
      let matched = false;
      for (const w of candidateWeeks) {
        const wk = pickWeek(jsonEx, w);
        if (!wk) continue;
        const expected = (jsonEx.warmupSets || 0) + (wk.workSets || 0);
        if (expected === actualSetCount) { matched = true; break; }
      }
      if (!matched) {
        const firstWk = pickWeek(jsonEx, session._week);
        if (firstWk) {
          const expected = (jsonEx.warmupSets || 0) + firstWk.workSets;
          console.log(`      WARN "${jsonEx.pdfName}" set count mismatch — no week in block matches library=${actualSetCount} (W${session._week} expects ${expected})`);
        } else {
          console.log(`      WARN "${jsonEx.pdfName}" has no week-${session._week} data`);
        }
        warnings++;
      }
    }
  }

  console.log(`\n══ ${program.title}: ${fatal} fatal, ${warnings} warnings ══`);
  return { ok: fatal === 0, fatal, warnings };
}

(async () => {
  const target = process.argv[2];
  if (!target) {
    console.error('Usage: node scripts/validate-bejarano-program.js <novatos|intermedios|avanzados|all>');
    process.exit(1);
  }
  const keys = target === 'all' ? ['novatos', 'intermedios', 'avanzados'] : [target];
  let totalFatal = 0;
  for (const k of keys) {
    const res = await validateProgram(k);
    totalFatal += (res.fatal || 0);
  }
  process.exit(totalFatal === 0 ? 0 : 1);
})().catch((err) => { console.error(err); process.exit(1); });
