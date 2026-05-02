#!/usr/bin/env node
'use strict';

/**
 * Pre-deploy gate. Runs all four data-migration scripts in --dry-run mode
 * against whatever project is configured. Surfaces "rule denies legacy
 * doc" / "stray field still present" before the actual deploy.
 *
 * Designed to run against the local emulator with redacted prod-snapshot
 * data imported. The migrations are read-mostly in dry-run, so this is
 * cheap.
 *
 * Usage:
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 \
 *   FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
 *     node scripts/security/pre-deploy-check.js --project wolf-20b8b-dev
 *
 *   # Or against staging:
 *   node scripts/security/pre-deploy-check.js --project wake-staging
 */

const {spawnSync} = require('child_process');
const path = require('path');

const SCRIPT = 'pre-deploy-check';
const SUBSCRIPTS = [
  'phase1-claim-backfill.js',
  'exercises-library-cleanup.js',
  'naming-drift-normalize.js',
  'one-on-one-clients-status-backfill.js',
  'registrations-schema-unify.js',
];

function run(scriptName, passthrough) {
  const full = path.join(__dirname, scriptName);
  console.log(`\n>>> ${scriptName}`);
  const r = spawnSync(process.execPath, [full, ...passthrough], {
    stdio: 'inherit',
    env: process.env,
  });
  if (r.status !== 0) {
    console.error(`!!! ${scriptName} exited ${r.status}`);
  }
  return r.status === 0;
}

function main() {
  console.log(`\n=== ${SCRIPT} ===`);
  // Pass through all args except --apply (force dry-run).
  const passthrough = process.argv.slice(2).filter((a) => a !== '--apply');
  const results = SUBSCRIPTS.map((s) => [s, run(s, passthrough)]);

  console.log('\n=== Summary ===');
  let ok = true;
  for (const [s, r] of results) {
    console.log(`  ${r ? 'OK ' : 'FAIL'} ${s}`);
    if (!r) ok = false;
  }
  if (!ok) {
    console.error('\nOne or more pre-deploy checks failed. Resolve before deploying.\n');
    process.exit(1);
  }
  console.log('\nAll pre-deploy checks passed.\n');
}

main();
