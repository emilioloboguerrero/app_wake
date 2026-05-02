#!/usr/bin/env node
'use strict';

/**
 * F-DATA-12. Audit §11.1.4 / §11.2 found event registrations carry TWO
 * different schema versions:
 *   - 90% snake/Spanish:  nombre, phoneNumber, responses, checked_in, created_at
 *   - 10% camel/English:  email, displayName, clientUserId, fieldValues,
 *                         checkedIn, checkedInAt, createdAt
 *
 * Canonical = the dominant snake/Spanish shape. Rewrite the 10% camel docs.
 *
 * Mapping:
 *   displayName     -> nombre               (if nombre absent)
 *   clientUserId    -> userId               (if userId absent)
 *   fieldValues     -> responses            (if responses absent)
 *   checkedIn       -> checked_in           (if checked_in absent)
 *   checkedInAt     -> checked_in_at        (if checked_in_at absent)
 *   createdAt       -> created_at           (if created_at absent)
 *
 * email already canonical in both shapes — leave alone.
 *
 * Usage: dry-run by default. --apply writes. --confirm-prod required for prod.
 */

const {parseFlags, assertSafeTarget, maybePause, banner, initAdmin} = require('./_lib');

const SCRIPT = 'registrations-schema-unify';

const MAPPINGS = [
  ['displayName', 'nombre'],
  ['clientUserId', 'userId'],
  ['fieldValues', 'responses'],
  ['checkedIn', 'checked_in'],
  ['checkedInAt', 'checked_in_at'],
  ['createdAt', 'created_at'],
];

async function main() {
  const flags = parseFlags(process.argv);
  assertSafeTarget(flags, SCRIPT);
  banner(SCRIPT, flags);
  await maybePause(flags);

  const admin = initAdmin(flags);
  const db = admin.firestore();
  const FieldValue = admin.firestore.FieldValue;

  // Use a collection-group query to hit every event_signups/{eventId}/registrations doc.
  const snap = await db.collectionGroup('registrations').get();
  console.log(`Inspecting ${snap.size} registration docs (collection-group).`);

  let touched = 0;

  for (const doc of snap.docs) {
    const data = doc.data() || {};
    const update = {};

    for (const [oldKey, newKey] of MAPPINGS) {
      if (data[oldKey] === undefined) continue;
      if (data[newKey] === undefined) update[newKey] = data[oldKey];
      update[oldKey] = FieldValue.delete();
    }

    if (Object.keys(update).length === 0) continue;
    touched++;

    if (flags.apply) {
      await doc.ref.update(update);
      console.log(`  [WRITE] ${doc.ref.path}: ${Object.keys(update).join(', ')}`);
    } else {
      console.log(`  [DRY]   ${doc.ref.path}: ${Object.keys(update).join(', ')}`);
    }
  }

  console.log(`\nSummary: ${touched} ${flags.apply ? 'updated' : 'would-update'} registration(s).`);
}

main().catch((e) => {
  console.error('Fatal:', e);
  process.exit(1);
});
