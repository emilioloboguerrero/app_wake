#!/usr/bin/env node
'use strict';

/**
 * Phase 1 prerequisite: backfill custom claims for every creator/admin user
 * before F-RULES-01 / F-MW-08 lock down `users/{uid}.role` reads.
 *
 * Background: production has 66 Auth users, ALL with `customClaims: {}`.
 * Today, role authority is the Firestore field. Once F-RULES-01 forbids
 * users from writing their own `role`, and F-MW-08 reads role from the
 * decoded token claim instead of Firestore, the 9 creators + 2 admins
 * documented in audit §11.1.2 must already carry the claim or they lose
 * privileged access on deploy.
 *
 * Action:
 *   - Iterate users/* where role in ('creator', 'admin').
 *   - Call setCustomUserClaims(uid, { role: data.role }).
 *   - Skip if the existing claim already matches.
 *
 * Usage:
 *   node scripts/security/phase1-claim-backfill.js                     # dry-run, staging
 *   node scripts/security/phase1-claim-backfill.js --apply              # writes to staging
 *   node scripts/security/phase1-claim-backfill.js --project wolf-20b8b --confirm-prod --apply
 */

const {parseFlags, assertSafeTarget, maybePause, banner, initAdmin} = require('./_lib');

const SCRIPT = 'phase1-claim-backfill';
const VALID_ROLES = new Set(['user', 'creator', 'admin']);

async function main() {
  const flags = parseFlags(process.argv);
  assertSafeTarget(flags, SCRIPT);
  banner(SCRIPT, flags);
  await maybePause(flags);

  const admin = initAdmin(flags);
  const db = admin.firestore();
  const auth = admin.auth();

  const snap = await db.collection('users')
    .where('role', 'in', ['creator', 'admin'])
    .get();

  console.log(`Found ${snap.size} users with role in ('creator','admin').`);

  let updated = 0;
  let skipped = 0;
  let invalid = 0;

  for (const doc of snap.docs) {
    const uid = doc.id;
    const data = doc.data() || {};
    const role = data.role;

    if (!VALID_ROLES.has(role)) {
      console.warn(`  [SKIP] ${uid}: invalid role "${role}"`);
      invalid++;
      continue;
    }

    let userRecord;
    try {
      userRecord = await auth.getUser(uid);
    } catch (e) {
      console.warn(`  [SKIP] ${uid}: no Auth record (${e.code || e.message})`);
      invalid++;
      continue;
    }

    const existing = userRecord.customClaims || {};
    if (existing.role === role) {
      console.log(`  [OK]   ${uid}: claim already {role:"${role}"}`);
      skipped++;
      continue;
    }

    if (flags.apply) {
      await auth.setCustomUserClaims(uid, {...existing, role});
      console.log(`  [SET]  ${uid}: role="${role}"`);
    } else {
      console.log(`  [DRY]  ${uid}: would set role="${role}" (existing: ${JSON.stringify(existing)})`);
    }
    updated++;
  }

  console.log(`\nSummary: ${updated} ${flags.apply ? 'updated' : 'would-update'}, ${skipped} already-correct, ${invalid} invalid/missing.`);
}

main().catch((e) => {
  console.error('Fatal:', e);
  process.exit(1);
});
