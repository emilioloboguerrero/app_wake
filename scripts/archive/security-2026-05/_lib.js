'use strict';

/**
 * Shared helpers for security migration scripts.
 *
 * Every script in this directory follows the same flag pattern:
 *   --dry-run      (default; logs intended writes, performs none)
 *   --apply        (required to actually write)
 *   --project=<id> (defaults to FIREBASE_PROJECT or 'wake-staging')
 *   --confirm-prod (required when --project is wolf-20b8b; otherwise refuse)
 *
 * Pattern matches scripts/clone-to-staging.js (which refuses wolf-20b8b
 * outright). For these *security* migrations we DO want to be able to
 * target prod — but only when the operator explicitly opts in.
 */

const PROD_PROJECT = 'wolf-20b8b';

function parseFlags(argv) {
  const args = argv.slice(2);
  const projectFlag = args.indexOf('--project');
  const project = projectFlag !== -1
    ? args[projectFlag + 1]
    : (process.env.FIREBASE_PROJECT || 'wake-staging');
  return {
    project,
    apply: args.includes('--apply'),
    confirmProd: args.includes('--confirm-prod'),
    dryRun: !args.includes('--apply'),
    raw: args,
  };
}

function assertSafeTarget(flags, scriptName) {
  if (flags.project === PROD_PROJECT && !flags.confirmProd) {
    console.error(
      `\nERROR: ${scriptName} refuses to target ${PROD_PROJECT} without --confirm-prod.\n` +
      `Re-run with: --project ${PROD_PROJECT} --confirm-prod [--apply]\n`
    );
    process.exit(2);
  }
  if (flags.project === PROD_PROJECT && flags.apply) {
    console.warn(
      `\nWARNING: about to APPLY writes to PRODUCTION (${PROD_PROJECT}).\n` +
      `Sleeping 5s — Ctrl-C to abort.\n`
    );
  }
}

async function maybePause(flags) {
  if (flags.project === PROD_PROJECT && flags.apply) {
    await new Promise((r) => setTimeout(r, 5000));
  }
}

function banner(scriptName, flags) {
  const mode = flags.apply ? 'APPLY' : 'DRY-RUN';
  console.log(`\n=== ${scriptName} ===`);
  console.log(`Project: ${flags.project}`);
  console.log(`Mode:    ${mode}`);
  console.log('');
}

function initAdmin(flags) {
  const admin = require('firebase-admin');
  if (admin.apps.length) return admin;
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: flags.project,
  });
  return admin;
}

module.exports = {
  PROD_PROJECT,
  parseFlags,
  assertSafeTarget,
  maybePause,
  banner,
  initAdmin,
};
