#!/usr/bin/env node
// Deep dive on the broken collections.
// 1. nutrition_assignments — what fields ARE present? Can planId → creator_id?
// 2. client_plan_content orphan — what's the id format?

import admin from "firebase-admin";
admin.initializeApp({projectId: "wolf-20b8b"});
const db = admin.firestore();

console.log("\n=== A. nutrition_assignments — full field dump ===\n");
const naSnap = await db.collection("nutrition_assignments").get();
const planIds = new Set();
for (const d of naSnap.docs) {
  const data = d.data();
  console.log(`[${d.id}]`);
  for (const [k, v] of Object.entries(data)) {
    let s;
    if (v && typeof v === "object" && v.toDate) s = `<Timestamp ${v.toDate().toISOString()}>`;
    else if (v && typeof v === "object") s = `<Object keys=${Object.keys(v).join(",")}>`;
    else s = JSON.stringify(v);
    console.log(`  ${k}: ${s}`);
  }
  if (data.planId) planIds.add(data.planId);
  if (data.plan_id) planIds.add(data.plan_id);
  console.log();
}

console.log(`\n=== B. Try resolving planIds via creator_nutrition_library/*/plans collection group ===\n`);
const cgSnap = await db.collectionGroup("plans").get();
const planToCreator = new Map();
for (const d of cgSnap.docs) {
  const segs = d.ref.path.split("/");
  if (segs[0] === "creator_nutrition_library" && segs[2] === "plans") {
    planToCreator.set(d.id, {creatorId: segs[1], path: d.ref.path});
  }
}
console.log(`Total creator_nutrition_library plans found: ${planToCreator.size}`);
for (const planId of planIds) {
  const hit = planToCreator.get(planId);
  console.log(`  planId=${planId} → ${hit ? `creator=${hit.creatorId}` : "NOT FOUND"}`);
}

console.log(`\n=== C. client_plan_content — list all 77 doc ids to inspect orphan ===\n`);
const cpcSnap = await db.collection("client_plan_content").get();
for (const d of cpcSnap.docs) {
  const parts = d.id.split("_");
  const data = d.data();
  const fields = {creator_id: data.creator_id ?? null, client_id: data.client_id ?? null};
  if (parts.length !== 3 || !fields.creator_id || !fields.client_id) {
    console.log(`  [${d.id}] parts=${parts.length} creator_id=${fields.creator_id} client_id=${fields.client_id}`);
  }
}

console.log(`\n=== D. Sample full client_nutrition_plan_content doc to confirm parent linkage ===\n`);
const cnpcSnap = await db.collection("client_nutrition_plan_content").limit(2).get();
for (const d of cnpcSnap.docs) {
  console.log(`[${d.id}]`);
  const data = d.data();
  for (const [k, v] of Object.entries(data)) {
    let s;
    if (v && typeof v === "object" && v.toDate) s = `<Timestamp ${v.toDate().toISOString()}>`;
    else if (v && typeof v === "object") s = `<Object keys=${Object.keys(v).slice(0, 5).join(",")}…>`;
    else s = JSON.stringify(v);
    console.log(`  ${k}: ${s}`);
  }
  console.log();
}

console.log("\n=== E. Cross-check: do nutrition_assignments doc ids match any one_on_one_clients? ===\n");
const ooSnap = await db.collection("one_on_one_clients").get();
const ooIds = new Set(ooSnap.docs.map(d => d.id));
for (const d of naSnap.docs) {
  console.log(`  na/${d.id} in one_on_one_clients? ${ooIds.has(d.id)}`);
}

process.exit(0);
