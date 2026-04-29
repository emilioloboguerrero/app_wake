#!/usr/bin/env node
// Backfill ownership fields on legacy docs. Default: DRY RUN. Pass --apply to write.
//
// Order (matters):
//   1. nutrition_assignments        (creator_id ← assignedBy, clientUserId ← userId)
//   2. client_nutrition_plan_content (from parent nutrition_assignments, post-step-1 in-memory)
//   3. client_plan_content          (from id format ${client}_${program}_${week} → courses[program])
//      3a. client-scoped: both creator_id + client_id
//      3b. program-scoped (id starts with "program_"): creator_id only
//   4. users/*/subscriptions        (user_id ← parent path uid)
//
// Guardrails:
//   - Only sets fields that are missing/null/empty. Never overwrites.
//   - Cross-validates nutrition_assignments.assignedBy vs planId→creator_nutrition_library.
//   - Refuses to plan a write whose source-of-truth disagrees with an already-set field.
//   - Batched <=400 per commit.

import admin from "firebase-admin";

const APPLY = process.argv.includes("--apply");
admin.initializeApp({projectId: "wolf-20b8b"});
const db = admin.firestore();

const planned = []; // {path, field, newValue, reason}
const conflicts = []; // {path, field, currentValue, derivedValue, reason}
const skipped = []; // {path, reason}

function isMissing(v) {
  return v == null || v === "";
}

function plan(path, field, newValue, reason) {
  planned.push({path, field, newValue, reason});
}

// ─── Pre-load shared caches ──────────────────────────────────────────────

console.error("[1/5] Loading caches…");

const courseSnap = await db.collection("courses").get();
const courseCreator = new Map();
for (const d of courseSnap.docs) {
  courseCreator.set(d.id, d.data().creator_id ?? d.data().creatorId ?? null);
}
console.error(`  courses cache: ${courseCreator.size}`);

const cnLibSnap = await db.collectionGroup("plans").get();
const planToCreator = new Map();
for (const d of cnLibSnap.docs) {
  const segs = d.ref.path.split("/");
  if (segs[0] === "creator_nutrition_library" && segs[2] === "plans") {
    planToCreator.set(d.id, segs[1]);
  }
}
console.error(`  creator_nutrition_library/*/plans cache: ${planToCreator.size}`);

// ─── Step 1: nutrition_assignments ───────────────────────────────────────

console.error("\n[2/5] Planning nutrition_assignments…");

const naSnap = await db.collection("nutrition_assignments").get();
// Hold the post-backfill view in memory for use by step 2.
const naPostBackfill = new Map();

for (const d of naSnap.docs) {
  const data = d.data();
  const path = `nutrition_assignments/${d.id}`;
  const assignedBy = data.assignedBy;
  const userId = data.userId;
  const planId = data.planId;

  // Cross-check: assignedBy vs planId→creator
  const planCreator = planId ? planToCreator.get(planId) : null;
  if (assignedBy && planCreator && assignedBy !== planCreator) {
    conflicts.push({
      path,
      field: "creator_id",
      currentValue: null,
      derivedValue: assignedBy,
      reason: `assignedBy=${assignedBy} disagrees with planId→creator=${planCreator}; refusing to backfill`,
    });
    naPostBackfill.set(d.id, {creator_id: data.creator_id ?? null, client_id: data.clientUserId ?? data.client_id ?? null});
    continue;
  }

  let postCreator = data.creator_id;
  let postClient = data.clientUserId ?? data.client_id;

  // creator_id
  if (isMissing(data.creator_id)) {
    if (assignedBy) {
      plan(path, "creator_id", assignedBy, `← assignedBy (cross-checked vs planId→${planCreator ?? "no-plan"})`);
      postCreator = assignedBy;
    } else {
      skipped.push({path, reason: "creator_id missing AND assignedBy missing — not derivable"});
    }
  } else if (assignedBy && data.creator_id !== assignedBy) {
    conflicts.push({path, field: "creator_id", currentValue: data.creator_id, derivedValue: assignedBy, reason: "existing creator_id disagrees with assignedBy"});
  }

  // clientUserId — only for client-scoped (userId !== null)
  if (isMissing(data.clientUserId)) {
    if (userId) {
      plan(path, "clientUserId", userId, `← userId (client-scoped assignment)`);
      postClient = userId;
    } else {
      skipped.push({path, reason: "clientUserId missing AND userId is null — program-scoped template, no client"});
    }
  } else if (userId && data.clientUserId !== userId) {
    conflicts.push({path, field: "clientUserId", currentValue: data.clientUserId, derivedValue: userId, reason: "existing clientUserId disagrees with userId"});
  }

  naPostBackfill.set(d.id, {creator_id: postCreator ?? null, client_id: postClient ?? null});
}

// ─── Step 2: client_nutrition_plan_content (parent: nutrition_assignments[sameId]) ───

console.error("\n[3/5] Planning client_nutrition_plan_content…");

const cnpcSnap = await db.collection("client_nutrition_plan_content").get();
for (const d of cnpcSnap.docs) {
  const data = d.data();
  const path = `client_nutrition_plan_content/${d.id}`;
  const parent = naPostBackfill.get(d.id);

  if (!parent) {
    skipped.push({path, reason: "no parent nutrition_assignment — cannot derive"});
    continue;
  }

  if (isMissing(data.creator_id)) {
    if (parent.creator_id) {
      plan(path, "creator_id", parent.creator_id, `← parent nutrition_assignment.creator_id (post-backfill)`);
    } else {
      skipped.push({path, reason: "parent has no creator_id even after backfill"});
    }
  } else if (parent.creator_id && data.creator_id !== parent.creator_id) {
    conflicts.push({path, field: "creator_id", currentValue: data.creator_id, derivedValue: parent.creator_id, reason: "disagrees with parent"});
  }

  if (isMissing(data.client_id)) {
    if (parent.client_id) {
      plan(path, "client_id", parent.client_id, `← parent nutrition_assignment.userId (post-backfill)`);
    } else {
      skipped.push({path, reason: "parent has no client (program-scoped); cannot set client_id"});
    }
  } else if (parent.client_id && data.client_id !== parent.client_id) {
    conflicts.push({path, field: "client_id", currentValue: data.client_id, derivedValue: parent.client_id, reason: "disagrees with parent"});
  }
}

// ─── Step 3: client_plan_content (id format) ─────────────────────────────

console.error("\n[4/5] Planning client_plan_content…");

const cpcSnap = await db.collection("client_plan_content").get();
for (const d of cpcSnap.docs) {
  const data = d.data();
  const path = `client_plan_content/${d.id}`;
  const parts = d.id.split("_");
  if (parts.length !== 3) {
    skipped.push({path, reason: `unexpected id format (parts=${parts.length})`});
    continue;
  }
  const [first, programId] = parts;
  const programScoped = first === "program";
  const derivedClient = programScoped ? null : first;
  const derivedCreator = courseCreator.get(programId) ?? null;

  if (!derivedCreator) {
    skipped.push({path, reason: `course[${programId}] not found or has no creator_id`});
    continue;
  }

  if (isMissing(data.creator_id)) {
    plan(path, "creator_id", derivedCreator, `← courses[${programId}].creator_id`);
  } else if (data.creator_id !== derivedCreator) {
    conflicts.push({path, field: "creator_id", currentValue: data.creator_id, derivedValue: derivedCreator, reason: "disagrees with course creator"});
  }

  if (programScoped) {
    if (!isMissing(data.client_id)) {
      conflicts.push({path, field: "client_id", currentValue: data.client_id, derivedValue: null, reason: "program-scoped doc unexpectedly has client_id"});
    }
    // No client_id to set for program-scoped docs
  } else {
    if (isMissing(data.client_id)) {
      plan(path, "client_id", derivedClient, `← id-prefix (clientId)`);
    } else if (data.client_id !== derivedClient) {
      conflicts.push({path, field: "client_id", currentValue: data.client_id, derivedValue: derivedClient, reason: "disagrees with id-prefix"});
    }
  }
}

// ─── Step 4: users/*/subscriptions ───────────────────────────────────────

console.error("\n[5/5] Planning users/*/subscriptions…");

const subSnap = await db.collectionGroup("subscriptions").get();
for (const d of subSnap.docs) {
  const segs = d.ref.path.split("/");
  if (segs.length !== 4 || segs[0] !== "users" || segs[2] !== "subscriptions") continue;
  const data = d.data();
  const expectedUid = segs[1];
  const path = d.ref.path;
  if (isMissing(data.user_id)) {
    plan(path, "user_id", expectedUid, "← parent path uid");
  } else if (data.user_id !== expectedUid) {
    conflicts.push({path, field: "user_id", currentValue: data.user_id, derivedValue: expectedUid, reason: "user_id disagrees with parent path uid"});
  }
}

// ─── Summary ─────────────────────────────────────────────────────────────

console.log("\n=== PLANNED WRITES ===\n");
const byCol = new Map();
for (const p of planned) {
  const col = p.path.split("/").slice(0, -1).join("/").replace(/\/[^/]+$/, "");
  // Normalize to top collection or pattern
  const seg = p.path.split("/");
  let key;
  if (seg[0] === "users" && seg[2] === "subscriptions") key = "users/*/subscriptions";
  else key = seg[0];
  if (!byCol.has(key)) byCol.set(key, []);
  byCol.get(key).push(p);
}

for (const [col, items] of byCol) {
  console.log(`  ${col}: ${items.length} field-writes across ${new Set(items.map(i => i.path)).size} docs`);
}
console.log(`  TOTAL: ${planned.length} field-writes across ${new Set(planned.map(p => p.path)).size} docs`);

console.log("\n=== CONFLICTS (will NOT write) ===");
if (conflicts.length === 0) {
  console.log("  none");
} else {
  for (const c of conflicts) console.log(`  ${c.path} :: ${c.field} :: cur=${c.currentValue} derived=${c.derivedValue} :: ${c.reason}`);
}

console.log("\n=== SKIPPED (not derivable) ===");
if (skipped.length === 0) {
  console.log("  none");
} else {
  for (const s of skipped) console.log(`  ${s.path} :: ${s.reason}`);
}

console.log("\n=== FULL PLANNED LIST ===");
for (const p of planned) {
  console.log(`  SET ${p.path}.${p.field} = "${p.newValue}"  (${p.reason})`);
}

// ─── Apply ───────────────────────────────────────────────────────────────

if (!APPLY) {
  console.log("\n[DRY RUN] Re-run with --apply to commit. Nothing written.");
  process.exit(0);
}

console.log(`\n[APPLY] Committing ${planned.length} field-writes…`);

// Group by doc path to reduce write count (one update per doc with all fields).
const byPath = new Map();
for (const p of planned) {
  if (!byPath.has(p.path)) byPath.set(p.path, {});
  byPath.get(p.path)[p.field] = p.newValue;
}

const docsToUpdate = [...byPath.entries()];
const BATCH_SIZE = 400;
let written = 0;
for (let i = 0; i < docsToUpdate.length; i += BATCH_SIZE) {
  const batch = db.batch();
  const slice = docsToUpdate.slice(i, i + BATCH_SIZE);
  for (const [path, fields] of slice) {
    batch.update(db.doc(path), fields);
  }
  await batch.commit();
  written += slice.length;
  console.log(`  batch ${Math.floor(i / BATCH_SIZE) + 1}: committed ${slice.length} docs (total ${written}/${docsToUpdate.length})`);
}

console.log(`\n[APPLY] Done. ${written} docs updated.`);
process.exit(0);
