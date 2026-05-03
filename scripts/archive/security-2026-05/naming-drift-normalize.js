#!/usr/bin/env node
'use strict';

/**
 * F-DATA-01 sweep. Audit §11.1.4 catalogs the field-naming drift across
 * collections. This script picks a canonical convention per collection
 * (decisions documented in docs/SECURITY_FIX_DECISIONS.md) and rewrites
 * non-canonical docs to match.
 *
 * Idempotent: running twice has the same effect as running once. Reads
 * the data shape, only writes when a non-canonical field exists.
 *
 * Collections covered (per §11.1.4):
 *   - events:                creator_id (snake), created_at, updated_at, max_registrations
 *   - bundles:               creatorId  (camel)  — already 100%; this script is a no-op for bundles, kept for symmetry / safety net
 *   - nutrition_assignments: creator_id (snake), userId (camel) canonical; drop assignedBy + clientUserId duplicates
 *   - processed_payments:    userId/courseId (camel), payment_id/processed_at (snake) canonical — minor backfill only
 *
 * Usage:
 *   node scripts/security/naming-drift-normalize.js                    # dry-run, staging
 *   node scripts/security/naming-drift-normalize.js --apply
 *   node scripts/security/naming-drift-normalize.js --project wolf-20b8b --confirm-prod --apply
 */

const {parseFlags, assertSafeTarget, maybePause, banner, initAdmin} = require('./_lib');

const SCRIPT = 'naming-drift-normalize';

async function normalizeEvents(db, FieldValue, apply) {
  const snap = await db.collection('events').get();
  console.log(`\n[events] inspecting ${snap.size} doc(s).`);
  let touched = 0;
  for (const doc of snap.docs) {
    const data = doc.data() || {};
    const update = {};

    // creatorId -> creator_id
    if (data.creatorId !== undefined && data.creator_id === undefined) {
      update.creator_id = data.creatorId;
    }
    if (data.creatorId !== undefined) update.creatorId = FieldValue.delete();

    // createdAt -> created_at
    if (data.createdAt !== undefined && data.created_at === undefined) {
      update.created_at = data.createdAt;
    }
    if (data.createdAt !== undefined) update.createdAt = FieldValue.delete();

    // updatedAt -> updated_at
    if (data.updatedAt !== undefined && data.updated_at === undefined) {
      update.updated_at = data.updatedAt;
    }
    if (data.updatedAt !== undefined) update.updatedAt = FieldValue.delete();

    // maxRegistrations -> max_registrations
    if (data.maxRegistrations !== undefined && data.max_registrations === undefined) {
      update.max_registrations = data.maxRegistrations;
    }
    if (data.maxRegistrations !== undefined) update.maxRegistrations = FieldValue.delete();

    if (Object.keys(update).length === 0) continue;
    touched++;
    if (apply) {
      await doc.ref.update(update);
      console.log(`  [WRITE] events/${doc.id}: ${Object.keys(update).join(', ')}`);
    } else {
      console.log(`  [DRY]   events/${doc.id}: ${Object.keys(update).join(', ')}`);
    }
  }
  console.log(`  [events] ${touched} ${apply ? 'updated' : 'would-update'}.`);
}

async function normalizeNutritionAssignments(db, FieldValue, apply) {
  const snap = await db.collection('nutrition_assignments').get();
  console.log(`\n[nutrition_assignments] inspecting ${snap.size} doc(s).`);
  let touched = 0;
  for (const doc of snap.docs) {
    const data = doc.data() || {};
    const update = {};

    // assignedBy duplicates creator_id; drop assignedBy
    if (data.assignedBy !== undefined) {
      if (data.creator_id === undefined) update.creator_id = data.assignedBy;
      update.assignedBy = FieldValue.delete();
    }

    // clientUserId duplicates userId; drop clientUserId
    if (data.clientUserId !== undefined) {
      if (data.userId === undefined) update.userId = data.clientUserId;
      update.clientUserId = FieldValue.delete();
    }

    if (Object.keys(update).length === 0) continue;
    touched++;
    if (apply) {
      await doc.ref.update(update);
      console.log(`  [WRITE] nutrition_assignments/${doc.id}: ${Object.keys(update).join(', ')}`);
    } else {
      console.log(`  [DRY]   nutrition_assignments/${doc.id}: ${Object.keys(update).join(', ')}`);
    }
  }
  console.log(`  [nutrition_assignments] ${touched} ${apply ? 'updated' : 'would-update'}.`);
}

async function normalizeProcessedPayments(db, FieldValue, apply) {
  // Canonical: userId/courseId (camel), payment_id/processed_at (snake).
  // §11.1.4 reports these are mostly correct; this is a safety net.
  const snap = await db.collection('processed_payments').get();
  console.log(`\n[processed_payments] inspecting ${snap.size} doc(s).`);
  let touched = 0;
  for (const doc of snap.docs) {
    const data = doc.data() || {};
    const update = {};

    if (data.user_id !== undefined && data.userId === undefined) update.userId = data.user_id;
    if (data.user_id !== undefined) update.user_id = FieldValue.delete();

    if (data.course_id !== undefined && data.courseId === undefined) update.courseId = data.course_id;
    if (data.course_id !== undefined) update.course_id = FieldValue.delete();

    if (Object.keys(update).length === 0) continue;
    touched++;
    if (apply) {
      await doc.ref.update(update);
      console.log(`  [WRITE] processed_payments/${doc.id}: ${Object.keys(update).join(', ')}`);
    } else {
      console.log(`  [DRY]   processed_payments/${doc.id}: ${Object.keys(update).join(', ')}`);
    }
  }
  console.log(`  [processed_payments] ${touched} ${apply ? 'updated' : 'would-update'}.`);
}

async function main() {
  const flags = parseFlags(process.argv);
  assertSafeTarget(flags, SCRIPT);
  banner(SCRIPT, flags);
  await maybePause(flags);

  const admin = initAdmin(flags);
  const db = admin.firestore();
  const FieldValue = admin.firestore.FieldValue;

  await normalizeEvents(db, FieldValue, flags.apply);
  await normalizeNutritionAssignments(db, FieldValue, flags.apply);
  await normalizeProcessedPayments(db, FieldValue, flags.apply);
}

main().catch((e) => {
  console.error('Fatal:', e);
  process.exit(1);
});
