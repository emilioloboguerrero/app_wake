#!/usr/bin/env node
'use strict';

/**
 * F-DATA-07. Audit §11.1.4 found 60% of one_on_one_clients docs have no
 * `status` field. The leave-cascade and pending-invite filters key on
 * `status == 'active'`, so these legacy rows are invisible to the new
 * flows.
 *
 * Backfill rule:
 *   - status is set already      -> leave alone
 *   - endedAt or ended_at is set -> status = 'inactive'
 *   - otherwise                   -> status = 'active'
 *
 * Usage: dry-run by default. --apply writes. --confirm-prod required for prod.
 */

const {parseFlags, assertSafeTarget, maybePause, banner, initAdmin} = require('./_lib');

const SCRIPT = 'one-on-one-clients-status-backfill';

async function main() {
  const flags = parseFlags(process.argv);
  assertSafeTarget(flags, SCRIPT);
  banner(SCRIPT, flags);
  await maybePause(flags);

  const admin = initAdmin(flags);
  const db = admin.firestore();

  const snap = await db.collection('one_on_one_clients').get();
  console.log(`Inspecting ${snap.size} one_on_one_clients docs.`);

  let touched = 0;
  let activeAdded = 0;
  let inactiveAdded = 0;

  for (const doc of snap.docs) {
    const data = doc.data() || {};
    if (data.status) continue;

    const ended = data.endedAt || data.ended_at;
    const next = ended ? 'inactive' : 'active';
    if (next === 'active') activeAdded++; else inactiveAdded++;

    if (flags.apply) {
      await doc.ref.update({status: next});
      console.log(`  [SET] ${doc.id}: status="${next}"`);
    } else {
      console.log(`  [DRY] ${doc.id}: would set status="${next}"`);
    }
    touched++;
  }

  console.log(`\nSummary: ${touched} ${flags.apply ? 'updated' : 'would-update'} (${activeAdded} active, ${inactiveAdded} inactive).`);
}

main().catch((e) => {
  console.error('Fatal:', e);
  process.exit(1);
});
