#!/usr/bin/env node
'use strict';

/**
 * DRY-RUN data-fix planner for Felipe Bejarano's planned-set data.
 *
 * READ-ONLY against Firestore. Writes a diff to /tmp/bejarano-set-fixes.json
 * AND a human-readable summary to stdout. Does NOT mutate any Firestore data.
 *
 * Transformations applied (based on 2026-04-24 audit):
 *
 *   BUCKET 1 — mechanical reps normalization
 *     "X a Y"               → "X-Y"     (Spanish word-range → hyphen range)
 *     "N c/u" / "N c/. pierna" / "N c/ pierna" → "N"   (strip per-side annotation)
 *     "N/N" (2 equal parts) → "N"       (per-leg unilateral, e.g. "20/20" for búlgaras)
 *
 *   BUCKET 2 — plank / hold (time-as-reps)
 *     "Ns" (e.g. "60s", "30s", "40s")
 *       → reps       = DELETE field
 *         intensity  = DELETE field
 *         duration   = N  (seconds)
 *
 *   BUCKET 3 — AMRAP
 *     "AMRAP" stays as-is. Runtime + validator now accept it.
 *
 *   BUCKET 4 — drop-sets (3+ slash-separated parts)
 *     "N1/N2/N3..."
 *       → reps         = String(N1+N2+N3...)  (sum preserved for legacy parsers)
 *         rep_sequence = [N1, N2, N3, ...]
 *
 *   SKIP — "3x 3 de 5s" (6 sets) — ambiguous, flagged for Felipe's call.
 *
 * Each fix is recorded with:
 *   { collectionPath, docPath, beforeReps, beforeIntensity, update, bucket, exercise, session, scope }
 *
 * Usage:
 *   node scripts/fix-bejarano-set-types-dryrun.js        # writes diff + summary
 *   node scripts/fix-bejarano-set-types-dryrun.js --apply # APPLIES to Firestore (destructive)
 */

const admin = require('firebase-admin');
const fs = require('fs');

const FELIPE_UID = 'yMqKOXBcVARa6vjU7wImf3Tp85J2';
const PROJECT_ID = 'wolf-20b8b';
const APPLY = process.argv.includes('--apply');
const OUTPUT_PATH = '/tmp/bejarano-set-fixes.json';

admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  projectId: PROJECT_ID,
});
const db = admin.firestore();
const FieldValue = admin.firestore.FieldValue;

// --- Transformation logic ---------------------------------------------------

const REPS_OK = /^[0-9]+(-[0-9]+)?$/;
const AMRAP_RE = /^AMRAP$/i;
const WORD_RANGE_RE = /^\s*(\d+)\s+a\s+(\d+)\s*$/i;
const CU_RE = /^\s*(\d+)\s*c\/(u|\.?\s*pierna|\s*pierna|\.?)\s*$/i;
const SECONDS_RE = /^\s*(\d+)\s*s\s*$/i;
const SLASH_SEQUENCE_RE = /^\s*\d+(\s*\/\s*\d+)+\s*$/;
const COMPLEX_RE = /^\s*\d+\s*x\s*\d+\s*de\s*\d+\s*s\s*$/i;

/**
 * Given a reps value, returns a fix plan or null if no change needed.
 * Fix plan: { bucket, update: { reps?, rep_sequence?, duration?, intensity? }, note? }
 * Field values of `FieldValue.delete()` sentinel indicate deletion.
 */
function planRepsFix(reps) {
  if (reps === null || reps === undefined) return null;
  if (typeof reps !== 'string') return null;
  const r = reps.trim();
  if (r === '') return null;
  if (REPS_OK.test(r)) return null;          // already valid
  if (AMRAP_RE.test(r)) return null;         // accepted literal

  // BUCKET 2 — seconds suffix → duration, drop reps + intensity
  const sec = r.match(SECONDS_RE);
  if (sec) {
    return {
      bucket: 'duration',
      update: {
        reps: FieldValue.delete(),
        intensity: FieldValue.delete(),
        duration: Number(sec[1]),
      },
    };
  }

  // BUCKET 1a — "X a Y" → "X-Y"
  const word = r.match(WORD_RANGE_RE);
  if (word) {
    return {
      bucket: 'word-range',
      update: { reps: `${word[1]}-${word[2]}` },
    };
  }

  // BUCKET 1b — "N c/u" / "N c/. pierna" / "N c/ pierna"
  const cu = r.match(CU_RE);
  if (cu) {
    return {
      bucket: 'per-side-strip',
      update: { reps: cu[1] },
    };
  }

  // BUCKET 4 & 1c — slash sequences. "N/N" (2 equal) = per-leg. 3+ = drop-set.
  if (SLASH_SEQUENCE_RE.test(r)) {
    const parts = r.split('/').map((s) => parseInt(s.trim(), 10));
    if (parts.some((n) => !Number.isFinite(n) || n <= 0)) return null;
    if (parts.length === 2 && parts[0] === parts[1]) {
      // BUCKET 1c — "20/20" unilateral per-leg
      return {
        bucket: 'per-leg-slash',
        update: { reps: String(parts[0]) },
      };
    }
    if (parts.length >= 3) {
      // BUCKET 4 — drop-set
      return {
        bucket: 'drop-set',
        update: {
          reps: String(parts.reduce((a, b) => a + b, 0)),
          rep_sequence: parts,
        },
      };
    }
    // 2-part but unequal — ambiguous, flag
    return {
      bucket: 'flag-slash-unequal',
      update: null,
      note: `2-part slash with unequal parts (${parts.join('/')}) — needs human review`,
    };
  }

  // BUCKET 5 — complex "3x 3 de 5s" — flag
  if (COMPLEX_RE.test(r)) {
    return {
      bucket: 'flag-complex',
      update: null,
      note: `Complex prescription "${r}" — needs Felipe's input`,
    };
  }

  // Unrecognized — flag
  return {
    bucket: 'flag-unrecognized',
    update: null,
    note: `No automatic normalization for "${r}"`,
  };
}

// --- Walk Firestore and collect fixes --------------------------------------

async function collectSetFixesUnderSession(sessionRef, scope, courseLabel, sessionTitle) {
  const fixes = [];
  const exSnap = await sessionRef.collection('exercises').orderBy('order', 'asc').get();
  for (const eDoc of exSnap.docs) {
    const eData = eDoc.data();
    const exerciseName = eData.primary && typeof eData.primary === 'object'
      ? Object.values(eData.primary)[0]
      : (eData.name || '(no-primary)');
    const setsSnap = await eDoc.ref.collection('sets').get();
    for (const sDoc of setsSnap.docs) {
      const sData = sDoc.data();
      const plan = planRepsFix(sData.reps);
      if (!plan) continue;
      fixes.push({
        scope,
        courseLabel,
        sessionTitle,
        exerciseName,
        docPath: sDoc.ref.path,
        beforeReps: sData.reps,
        beforeIntensity: sData.intensity ?? null,
        beforeDuration: sData.duration ?? null,
        beforeRepSequence: sData.rep_sequence ?? null,
        setTitle: sData.title ?? null,
        setOrder: sData.order ?? null,
        bucket: plan.bucket,
        update: plan.update,
        note: plan.note ?? null,
      });
    }
  }
  return fixes;
}

(async () => {
  const allFixes = [];

  // Library sessions
  const libSessSnap = await db
    .collection('creator_libraries').doc(FELIPE_UID)
    .collection('sessions').orderBy('order', 'asc').get();
  for (const sDoc of libSessSnap.docs) {
    const fixes = await collectSetFixesUnderSession(
      sDoc.ref,
      'LIBRARY',
      `creator_libraries/${FELIPE_UID}`,
      sDoc.data().title ?? '(untitled)'
    );
    allFixes.push(...fixes);
  }

  // Courses
  const courseSnap = await db.collection('courses').where('creator_id', '==', FELIPE_UID).get();
  for (const cDoc of courseSnap.docs) {
    const cData = cDoc.data();
    const modSnap = await cDoc.ref.collection('modules').orderBy('order', 'asc').get();
    for (const mDoc of modSnap.docs) {
      const sSnap = await mDoc.ref.collection('sessions').orderBy('order', 'asc').get();
      for (const sDoc of sSnap.docs) {
        const fixes = await collectSetFixesUnderSession(
          sDoc.ref,
          `COURSE[${cData.deliveryType ?? '?'}]`,
          `courses/${cDoc.id} · ${cData.title}`,
          sDoc.data().title ?? '(untitled)'
        );
        allFixes.push(...fixes);
      }
    }
  }

  // Plans
  const planSnap = await db.collection('plans').where('creator_id', '==', FELIPE_UID).get();
  for (const pDoc of planSnap.docs) {
    const pData = pDoc.data();
    const modSnap = await pDoc.ref.collection('modules').orderBy('order', 'asc').get();
    for (const mDoc of modSnap.docs) {
      const sSnap = await mDoc.ref.collection('sessions').orderBy('order', 'asc').get();
      for (const sDoc of sSnap.docs) {
        const fixes = await collectSetFixesUnderSession(
          sDoc.ref,
          'PLAN',
          `plans/${pDoc.id} · ${pData.title ?? '(untitled)'}`,
          sDoc.data().title ?? '(untitled)'
        );
        allFixes.push(...fixes);
      }
    }
  }

  // Summary
  const byBucket = {};
  for (const f of allFixes) {
    (byBucket[f.bucket] = byBucket[f.bucket] || []).push(f);
  }

  console.log('='.repeat(78));
  console.log(APPLY ? 'APPLYING FIXES TO FIRESTORE' : 'DRY-RUN — NO WRITES');
  console.log('='.repeat(78));
  console.log(`Total sets with a fix plan: ${allFixes.length}`);
  console.log('\nBy bucket:');
  for (const [b, arr] of Object.entries(byBucket).sort((a, b) => b[1].length - a[1].length)) {
    const note = arr[0].note ? ` — ${arr[0].note.split('—')[0].trim()}` : '';
    console.log(`  ${String(arr.length).padStart(5)}  ${b}${note}`);
  }

  // Example rows per bucket
  console.log('\nSample transformations (first 3 per bucket):');
  for (const [bucket, arr] of Object.entries(byBucket)) {
    console.log(`\n  [${bucket}]`);
    for (const f of arr.slice(0, 3)) {
      if (f.update) {
        const u = {};
        for (const [k, v] of Object.entries(f.update)) {
          u[k] = v && typeof v === 'object' && v.constructor.name === 'DeleteTransform' ? '<DELETE>' : v;
        }
        console.log(`    ${f.exerciseName}  reps=${JSON.stringify(f.beforeReps)}  →  ${JSON.stringify(u)}`);
      } else {
        console.log(`    ${f.exerciseName}  reps=${JSON.stringify(f.beforeReps)}  →  SKIP (${f.note})`);
      }
    }
  }

  // Dump to JSON (serialize DeleteTransform as "<DELETE>" sentinel for readability)
  const serializable = allFixes.map((f) => {
    if (!f.update) return f;
    const u = {};
    for (const [k, v] of Object.entries(f.update)) {
      u[k] = v && typeof v === 'object' && v.constructor.name === 'DeleteTransform' ? '<DELETE>' : v;
    }
    return { ...f, update: u };
  });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(serializable, null, 2));
  console.log(`\nWrote diff to ${OUTPUT_PATH}`);

  if (!APPLY) {
    console.log('\n(No writes made. Re-run with --apply to mutate Firestore.)');
    return;
  }

  // Apply phase — batch writes
  console.log('\nApplying updates...');
  const BATCH_SIZE = 400;
  let applied = 0;
  let skipped = 0;
  for (let i = 0; i < allFixes.length; i += BATCH_SIZE) {
    const batch = db.batch();
    for (const f of allFixes.slice(i, i + BATCH_SIZE)) {
      if (!f.update) { skipped++; continue; }
      batch.update(db.doc(f.docPath), { ...f.update, updated_at: FieldValue.serverTimestamp() });
      applied++;
    }
    await batch.commit();
    process.stdout.write(`  batch ${Math.floor(i / BATCH_SIZE) + 1}: applied ${applied} so far, skipped ${skipped}\n`);
  }
  console.log(`\nDone. Applied ${applied} fixes, skipped ${skipped} flagged items.`);
})().catch((err) => {
  console.error('ERROR:', err);
  process.exit(1);
});
