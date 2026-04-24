#!/usr/bin/env node
'use strict';

/**
 * Apply per-week rep/RER/workSets progression from a Bejarano program JSON
 * to the corresponding low_ticket course in Firestore.
 *
 * Source of truth: bejarano_programs/{novatos,intermedios,avanzados}.json
 * Target: courses/{courseId} where creator_id == FELIPE_UID and title matches.
 *
 *   novatos      → "Novatos — Full Body"
 *   intermedios  → "Intermedios — Torso-Pierna"
 *   avanzados    → "Avanzados — PPL"
 *
 * Algorithm (per course module "Semana N"):
 *   1. Find the PDF session for week N matching the course session's title
 *      (or falling back to the last PDF week available — relevant for Novatos,
 *      which has 8 weeks of data but 12 course modules).
 *   2. For each exercise in the course session, look up the matching PDF
 *      exercise by resolving its library-name via NAME_MAP.
 *   3. Compute the target sets list (warmups + work) from the PDF
 *      prescription for week N via buildSetsFor().
 *   4. Replace the exercise's sets subcollection: delete all existing set
 *      docs, then write new ones. This is required because workSets counts
 *      can vary week-to-week (Bloque 1 micro-cycles in Intermedios/Avanzados).
 *
 * Usage:
 *   node scripts/apply-week-progression.js novatos              (dry-run)
 *   node scripts/apply-week-progression.js intermedios --write
 *   node scripts/apply-week-progression.js avanzados --write
 *   node scripts/apply-week-progression.js all --write
 *
 * Flags:
 *   --write           actually perform writes (default is dry-run)
 *   --only-week=N     only process course module "Semana N"
 *   --only-session=K  only process the K-th session in each module (0-indexed)
 */

const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

const {
  FELIPE_UID,
  LIB_ID,
  PROJECT_ID,
  buildSetsFor,
  resolveLibraryName,
} = require('./bejarano-progression-helpers.js');

admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId: PROJECT_ID });
const db = admin.firestore();
const { FieldValue } = admin.firestore;

const PROGRAMS_DIR = path.join(__dirname, '..', 'bejarano_programs');

const COURSE_TITLES = {
  novatos: 'Novatos — Full Body',
  intermedios: 'Intermedios — Torso-Pierna',
  avanzados: 'Avanzados — PPL',
};

// Parse CLI flags
function parseArgs() {
  const args = process.argv.slice(2);
  const target = args[0];
  const write = args.includes('--write');
  const onlyWeek = (() => {
    const a = args.find((x) => x.startsWith('--only-week='));
    return a ? parseInt(a.split('=')[1], 10) : null;
  })();
  const onlySession = (() => {
    const a = args.find((x) => x.startsWith('--only-session='));
    return a ? parseInt(a.split('=')[1], 10) : null;
  })();
  return { target, write, onlyWeek, onlySession };
}

// Pick the JSON session for a given week by title.
// JSON sessions can live under `sessions` (flat) or under `blocks[].sessions` (block-scoped).
// Returns {session, fallbackWeek}. If no session with matching title exists in the
// block that owns this week, falls back to the latest week in any other block whose
// sessions include the title (handles course/PDF block-boundary mismatches like
// Avanzados W6 having a B1 session title while PDF W6 is in B2).
function findJsonSessionForWeek(program, week, courseSessionTitle) {
  // First pass: strict — only sessions in the block that owns `week`
  if (program.blocks) {
    for (const block of program.blocks) {
      if (!block.weeks.includes(week)) continue;
      const match = block.sessions.find((s) => s.libraryTitle === courseSessionTitle);
      if (match) return { session: match, fallbackWeek: week };
    }
    // Fallback: pick any block whose sessions include this title;
    // use its max week that is ≤ `week`, else its min week.
    for (const block of program.blocks) {
      const match = block.sessions.find((s) => s.libraryTitle === courseSessionTitle);
      if (!match) continue;
      const lowerOrEq = block.weeks.filter((w) => w <= week);
      const fw = lowerOrEq.length ? Math.max(...lowerOrEq) : Math.min(...block.weeks);
      return { session: match, fallbackWeek: fw };
    }
  } else if (program.sessions) {
    const match = program.sessions.find((s) => s.libraryTitle === courseSessionTitle);
    if (match) return { session: match, fallbackWeek: week };
  }
  return null;
}

// For a week index past the end of the PDF (e.g. Novatos W9-12), clamp to last available week.
function effectiveWeek(program, requestedWeek) {
  if (requestedWeek <= program.programLengthWeeks) return requestedWeek;
  return program.programLengthWeeks;
}

// Get the prescription for a given exercise + week.
function pickWeek(ex, week) {
  if (ex.constant) return ex.constant;
  if (ex.perWeek && ex.perWeek[String(week)]) return ex.perWeek[String(week)];
  return null;
}

async function applyProgram(programKey, { write, onlyWeek, onlySession }) {
  const jsonPath = path.join(PROGRAMS_DIR, `${programKey}.json`);
  const program = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  const courseTitle = COURSE_TITLES[programKey];
  console.log(`\n══ APPLY: ${program.title} → course "${courseTitle}" ══`);
  console.log(`   mode: ${write ? 'WRITE (live)' : 'DRY-RUN'}`);

  // Find the course
  const courseSnap = await db.collection('courses')
    .where('creator_id', '==', FELIPE_UID)
    .where('title', '==', courseTitle)
    .limit(1).get();
  if (courseSnap.empty) {
    console.error(`   ✗ Course not found`);
    return { ok: false };
  }
  const courseDoc = courseSnap.docs[0];
  console.log(`   course id: ${courseDoc.id}`);

  // Walk modules in order
  const modulesSnap = await courseDoc.ref.collection('modules').orderBy('order').get();
  console.log(`   modules: ${modulesSnap.size}`);

  let patched = 0;
  let skipped = 0;
  let missing = 0;
  let exercisesMissing = 0;

  for (const moduleDoc of modulesSnap.docs) {
    const mod = moduleDoc.data();
    const weekMatch = /Semana\s+(\d+)/i.exec(mod.title || '');
    if (!weekMatch) {
      console.log(`   WARN module "${mod.title}" has no week number — skipping`);
      skipped++;
      continue;
    }
    const courseWeek = parseInt(weekMatch[1], 10);
    if (onlyWeek && onlyWeek !== courseWeek) continue;
    const effWeek = effectiveWeek(program, courseWeek);
    const weekSuffix = effWeek !== courseWeek ? ` (clamped to PDF W${effWeek})` : '';
    console.log(`\n   ── module ${moduleDoc.id} "${mod.title}"${weekSuffix} ──`);

    const sessionsSnap = await moduleDoc.ref.collection('sessions').orderBy('order').get();
    for (let sIdx = 0; sIdx < sessionsSnap.size; sIdx++) {
      if (onlySession !== null && sIdx !== onlySession) continue;
      const sesDoc = sessionsSnap.docs[sIdx];
      const ses = sesDoc.data();
      const jsonMatch = findJsonSessionForWeek(program, effWeek, ses.title);
      if (!jsonMatch) {
        console.log(`      [${sIdx}] session "${ses.title}" — NO JSON MATCH for W${effWeek}, skipping`);
        missing++;
        continue;
      }
      const jsonSession = jsonMatch.session;
      const dataWeek = jsonMatch.fallbackWeek;
      const fallbackTag = dataWeek !== effWeek ? ` (using W${dataWeek} data)` : '';
      console.log(`      [${sIdx}] session "${ses.title}"${fallbackTag}`);

      // Walk course exercises (each has primary.{LIB_ID} = verbose library name)
      const courseExSnap = await sesDoc.ref.collection('exercises').orderBy('order').get();
      for (const courseExDoc of courseExSnap.docs) {
        const courseEx = courseExDoc.data();
        const courseExLibName = courseEx.primary && courseEx.primary[LIB_ID];
        if (!courseExLibName) {
          console.log(`         WARN course exercise ${courseExDoc.id} has no primary name — skipping`);
          exercisesMissing++;
          continue;
        }

        // Find matching JSON exercise by resolving each JSON pdfName → library name.
        const matchedJsonEx = jsonSession.exercises.find(
          (jEx) => resolveLibraryName(jEx.pdfName) === courseExLibName
        );
        if (!matchedJsonEx) {
          console.log(`         WARN no PDF match for course exercise "${courseExLibName}" — leaving sets as-is`);
          exercisesMissing++;
          continue;
        }

        const wk = pickWeek(matchedJsonEx, dataWeek);
        if (!wk) {
          console.log(`         WARN "${matchedJsonEx.pdfName}" has no data for W${dataWeek} — skipping`);
          exercisesMissing++;
          continue;
        }

        const targetSets = buildSetsFor({
          warmupSets: matchedJsonEx.warmupSets || 0,
          workSets: wk.workSets,
          reps: wk.reps,
          rer: wk.rer,
        });

        console.log(
          `         - ${courseExLibName}: ${targetSets.length} sets ` +
          `(${matchedJsonEx.warmupSets}+${wk.workSets} × ${wk.reps} @ RER ${wk.rer})`
        );

        if (!write) continue;

        // Replace sets subcollection
        const setsSnap = await courseExDoc.ref.collection('sets').get();
        const batch = db.batch();
        setsSnap.docs.forEach((s) => batch.delete(s.ref));
        for (const setData of targetSets) {
          const newSetRef = courseExDoc.ref.collection('sets').doc();
          batch.set(newSetRef, {
            ...setData,
            created_at: FieldValue.serverTimestamp(),
          });
        }
        await batch.commit();
        patched++;
      }
    }
  }

  console.log(`\n══ ${program.title}: patched=${patched} skipped-modules=${skipped} missing-sessions=${missing} missing-exercises=${exercisesMissing} ══`);
  return { ok: true, patched, skipped, missing, exercisesMissing };
}

(async () => {
  const { target, write, onlyWeek, onlySession } = parseArgs();
  if (!target) {
    console.error('Usage: node scripts/apply-week-progression.js <novatos|intermedios|avanzados|all> [--write] [--only-week=N] [--only-session=K]');
    process.exit(1);
  }
  const keys = target === 'all' ? ['novatos', 'intermedios', 'avanzados'] : [target];
  for (const k of keys) {
    await applyProgram(k, { write, onlyWeek, onlySession });
  }
})().catch((err) => { console.error(err); process.exit(1); });
