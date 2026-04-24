#!/usr/bin/env node
'use strict';

/**
 * Apply audit fixes to Felipe's exercise library.
 *   - HIP THRUST CON BARRA           : fix muscle_activation (swap glutes/hamstrings, drop traps)
 *   - HIP THRUST UNILATERAL CON MANC : same muscle fix + add "Mancuernas" to implements
 *   - HIP THRUST EN MÁQUINA          : same muscle fix + implements = ["Máquina"]
 *
 * ENTERRADORAS left as-is per user decision.
 * REMO EN CABLE AGARRE CERRADO / NEUTRO left as-is per user decision.
 *
 * Usage:
 *   node scripts/fix-bejarano-library-audit.js           # dry run
 *   node scripts/fix-bejarano-library-audit.js --write   # apply
 */

const admin = require('firebase-admin');

const PROJECT_ID = 'wolf-20b8b';
const LIB_ID = 'jeoVyzhUrBeJofT62MOe';
const WRITE = process.argv.includes('--write');

admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  projectId: PROJECT_ID,
});
const db = admin.firestore();
const FV = admin.firestore.FieldValue;

// Correct muscle_activation for hip thrust family.
// Hip thrust is a hip-extension movement driven by glutes, supported by hamstrings
// (especially in longer ROM) and lower_back. No traps involvement.
const CORRECT_HIP_THRUST_MUSCLES = {
  glutes: 100,
  hamstrings: 55,
  lower_back: 30,
};

const FIXES = [
  {
    name: 'HIP THRUST CON BARRA',
    muscle_activation: CORRECT_HIP_THRUST_MUSCLES,
    implements: ['Barra', 'Banco'],
    reason: 'Swap glutes↔hamstrings dominance. Drop implausible traps=23. Implements set to barbell + bench.',
  },
  {
    name: 'HIP THRUST UNILATERAL CON MANCUERNA',
    muscle_activation: CORRECT_HIP_THRUST_MUSCLES,
    implements: ['Mancuernas', 'Banco'],
    reason: 'Same muscle fix. Name explicitly says "CON MANCUERNA" but implements was [Banco, Peso Corporal] — add Mancuernas, remove Peso Corporal.',
  },
  {
    name: 'HIP THRUST EN MÁQUINA',
    muscle_activation: CORRECT_HIP_THRUST_MUSCLES,
    implements: ['Máquina'],
    reason: 'Same muscle fix. Implements set to Máquina only.',
  },
];

(async () => {
  const docRef = db.collection('exercises_library').doc(LIB_ID);
  const snap = await docRef.get();
  if (!snap.exists) {
    console.error('FATAL: library doc not found:', LIB_ID);
    process.exit(1);
  }
  const data = snap.data() || {};

  console.log(WRITE ? '\n--- APPLYING FIXES ---\n' : '\n--- DRY RUN ---\n');

  const patch = {};
  for (const fix of FIXES) {
    const current = data[fix.name];
    if (!current) {
      console.log(`SKIP: ${fix.name} — not found in library`);
      continue;
    }

    console.log(`${fix.name}`);
    console.log(`  reason: ${fix.reason}`);
    console.log(`  BEFORE: muscle_activation = ${JSON.stringify(current.muscle_activation)}`);
    console.log(`          implements        = ${JSON.stringify(current.implements)}`);
    console.log(`  AFTER:  muscle_activation = ${JSON.stringify(fix.muscle_activation)}`);
    console.log(`          implements        = ${JSON.stringify(fix.implements)}`);
    console.log('');

    patch[`${fix.name}.muscle_activation`] = fix.muscle_activation;
    patch[`${fix.name}.implements`]        = fix.implements;
    patch[`${fix.name}.updated_at`]        = FV.serverTimestamp();
  }

  if (Object.keys(patch).length === 0) {
    console.log('Nothing to write.');
    return;
  }

  if (!WRITE) {
    console.log('(dry run — re-run with --write to apply)');
    return;
  }

  await docRef.update(patch);
  console.log(`✓ wrote ${FIXES.length} fixes to exercises_library/${LIB_ID}`);
})().catch((err) => {
  console.error('ERROR:', err);
  process.exit(1);
});
