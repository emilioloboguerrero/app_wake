#!/usr/bin/env node
// Read-only audit for ownership-field gaps across ownership-gated collections.
// Uses ADC. Project: wolf-20b8b. NO WRITES.

import admin from "firebase-admin";

admin.initializeApp({projectId: "wolf-20b8b"});
const db = admin.firestore();

const SAMPLE = 8;

function fmtRow(name, total, missing, mismatched, orphaned, samples) {
  return {
    collection: name,
    total,
    missing,
    mismatched,
    orphaned,
    samples: samples.slice(0, SAMPLE),
  };
}

const findings = [];

// ─── courses cache (used by multiple sources of truth) ───────────────────
const courseCreator = new Map(); // courseId -> creatorId | null

async function getCourseCreator(courseId) {
  if (!courseId) return null;
  if (courseCreator.has(courseId)) return courseCreator.get(courseId);
  const d = await db.collection("courses").doc(courseId).get();
  const c = d.exists ? (d.data()?.creator_id ?? d.data()?.creatorId ?? null) : null;
  courseCreator.set(courseId, c);
  return c;
}

// ─── 1. client_session_content (parent: client_sessions/{sameId}) ────────
async function auditClientSessionContent() {
  const snap = await db.collection("client_session_content").get();
  let missing = 0, mismatched = 0, orphaned = 0;
  const samples = [];

  // Pre-load parents into a map
  const parentSnap = await db.collection("client_sessions").get();
  const parents = new Map();
  for (const p of parentSnap.docs) {
    parents.set(p.id, p.data());
  }

  for (const d of snap.docs) {
    const data = d.data();
    const parent = parents.get(d.id);
    const hasCreator = data.creator_id != null && data.creator_id !== "";
    const hasClient = data.client_id != null && data.client_id !== "";

    if (!parent) {
      if (!hasCreator || !hasClient) {
        orphaned++;
        if (samples.length < SAMPLE) samples.push({id: d.id, why: "no parent client_session and missing field(s)"});
      }
      continue;
    }

    const expectedCreator = parent.creator_id ?? null;
    const expectedClient = parent.client_id ?? null;

    if (!hasCreator || !hasClient) {
      missing++;
      if (samples.length < SAMPLE) samples.push({
        id: d.id,
        why: `missing ${!hasCreator ? "creator_id " : ""}${!hasClient ? "client_id" : ""}`.trim(),
        derivable: {creator_id: expectedCreator, client_id: expectedClient},
      });
    } else if ((expectedCreator && expectedCreator !== data.creator_id) ||
               (expectedClient && expectedClient !== data.client_id)) {
      mismatched++;
      if (samples.length < SAMPLE) samples.push({
        id: d.id,
        why: `disagrees with parent (parent.creator_id=${expectedCreator}, parent.client_id=${expectedClient})`,
      });
    }
  }
  findings.push(fmtRow("client_session_content", snap.size, missing, mismatched, orphaned, samples));
}

// ─── 2. client_plan_content (id format: ${clientId}_${programId}_${weekKey}) ─
async function auditClientPlanContent() {
  const snap = await db.collection("client_plan_content").get();
  let missing = 0, mismatched = 0, orphaned = 0;
  const samples = [];

  for (const d of snap.docs) {
    const data = d.data();
    const hasCreator = data.creator_id != null && data.creator_id !== "";
    const hasClient = data.client_id != null && data.client_id !== "";

    // doc id: ${clientId}_${programId}_${weekKey}
    const parts = d.id.split("_");
    let derivedClient = null, derivedCreator = null;
    if (parts.length >= 3) {
      derivedClient = parts[0];
      const programId = parts[1];
      derivedCreator = await getCourseCreator(programId);
    }

    if (!hasCreator || !hasClient) {
      const haveDeriv = derivedClient && derivedCreator;
      if (haveDeriv) {
        missing++;
        if (samples.length < SAMPLE) samples.push({
          id: d.id,
          why: `missing ${!hasCreator ? "creator_id " : ""}${!hasClient ? "client_id" : ""}`.trim(),
          derived: {creator_id: derivedCreator, client_id: derivedClient},
        });
      } else {
        orphaned++;
        if (samples.length < SAMPLE) samples.push({
          id: d.id,
          why: `missing field(s) and id parse failed (parts=${parts.length})`,
        });
      }
    } else {
      if (derivedCreator && derivedCreator !== data.creator_id) {
        mismatched++;
        if (samples.length < SAMPLE) samples.push({
          id: d.id,
          why: `creator_id=${data.creator_id} but courses[${parts[1]}].creator_id=${derivedCreator}`,
        });
      } else if (derivedClient && derivedClient !== data.client_id) {
        mismatched++;
        if (samples.length < SAMPLE) samples.push({
          id: d.id,
          why: `client_id=${data.client_id} but id-prefix says ${derivedClient}`,
        });
      }
    }
  }
  findings.push(fmtRow("client_plan_content", snap.size, missing, mismatched, orphaned, samples));
}

// ─── 3. client_nutrition_plan_content (parent: nutrition_assignments/{sameId}) ─
async function auditClientNutritionPlanContent() {
  const snap = await db.collection("client_nutrition_plan_content").get();
  let missing = 0, mismatched = 0, orphaned = 0;
  const samples = [];

  const parentSnap = await db.collection("nutrition_assignments").get();
  const parents = new Map();
  for (const p of parentSnap.docs) parents.set(p.id, p.data());

  for (const d of snap.docs) {
    const data = d.data();
    const parent = parents.get(d.id);
    const hasCreator = data.creator_id != null && data.creator_id !== "";
    const hasClient = data.client_id != null && data.client_id !== "";

    if (!parent) {
      if (!hasCreator || !hasClient) {
        orphaned++;
        if (samples.length < SAMPLE) samples.push({id: d.id, why: "no parent nutrition_assignment, fields missing"});
      }
      continue;
    }

    // nutrition_assignments uses creator_id + clientUserId (camelCase!)
    const expectedCreator = parent.creator_id ?? parent.creatorId ?? null;
    const expectedClient = parent.clientUserId ?? parent.client_id ?? null;

    if (!hasCreator || !hasClient) {
      missing++;
      if (samples.length < SAMPLE) samples.push({
        id: d.id,
        why: `missing ${!hasCreator ? "creator_id " : ""}${!hasClient ? "client_id" : ""}`.trim(),
        derived: {creator_id: expectedCreator, client_id: expectedClient},
      });
    } else if ((expectedCreator && expectedCreator !== data.creator_id) ||
               (expectedClient && expectedClient !== data.client_id)) {
      mismatched++;
      if (samples.length < SAMPLE) samples.push({
        id: d.id,
        why: `disagrees: parent.creator=${expectedCreator}, parent.client=${expectedClient}`,
      });
    }
  }
  findings.push(fmtRow("client_nutrition_plan_content", snap.size, missing, mismatched, orphaned, samples));
}

// ─── 4. nutrition_assignments (creator_id + clientUserId) ────────────────
async function auditNutritionAssignments() {
  const snap = await db.collection("nutrition_assignments").get();
  let missing = 0;
  const samples = [];
  for (const d of snap.docs) {
    const data = d.data();
    const hasCreator = data.creator_id != null && data.creator_id !== "";
    const hasClient = data.clientUserId != null && data.clientUserId !== "";
    if (!hasCreator || !hasClient) {
      missing++;
      if (samples.length < SAMPLE) samples.push({
        id: d.id,
        why: `missing ${!hasCreator ? "creator_id " : ""}${!hasClient ? "clientUserId" : ""}`.trim(),
        present: {creator_id: data.creator_id ?? null, clientUserId: data.clientUserId ?? null, planId: data.planId ?? data.plan_id ?? null},
      });
    }
  }
  findings.push(fmtRow("nutrition_assignments", snap.size, missing, 0, 0, samples));
}

// ─── 5. bundles (creatorId camelCase) ────────────────────────────────────
async function auditBundles() {
  const snap = await db.collection("bundles").get();
  let missing = 0;
  const samples = [];
  for (const d of snap.docs) {
    const data = d.data();
    if (data.creatorId == null || data.creatorId === "") {
      missing++;
      if (samples.length < SAMPLE) samples.push({id: d.id, why: "missing creatorId"});
    }
  }
  findings.push(fmtRow("bundles", snap.size, missing, 0, 0, samples));
}

// ─── 6. call_bookings (creatorId + clientUserId, camelCase) ──────────────
async function auditCallBookings() {
  const snap = await db.collection("call_bookings").get();
  let missing = 0;
  const samples = [];
  for (const d of snap.docs) {
    const data = d.data();
    const hasC = data.creatorId != null && data.creatorId !== "";
    const hasCl = data.clientUserId != null && data.clientUserId !== "";
    if (!hasC || !hasCl) {
      missing++;
      if (samples.length < SAMPLE) samples.push({
        id: d.id,
        why: `missing ${!hasC ? "creatorId " : ""}${!hasCl ? "clientUserId" : ""}`.trim(),
      });
    }
  }
  findings.push(fmtRow("call_bookings", snap.size, missing, 0, 0, samples));
}

// ─── 7. events (creator_id OR creatorId — handler accepts either) ────────
async function auditEvents() {
  const snap = await db.collection("events").get();
  let missing = 0;
  const samples = [];
  for (const d of snap.docs) {
    const data = d.data();
    const c = data.creator_id ?? data.creatorId ?? null;
    if (c == null || c === "") {
      missing++;
      if (samples.length < SAMPLE) samples.push({id: d.id, why: "missing both creator_id and creatorId"});
    }
  }
  findings.push(fmtRow("events", snap.size, missing, 0, 0, samples));
}

// ─── 8. users/{uid}/notes — collection group ─────────────────────────────
async function auditNotes() {
  const snap = await db.collectionGroup("notes").get();
  let missing = 0;
  const samples = [];
  let total = 0;
  for (const d of snap.docs) {
    // Ensure this is users/{uid}/notes/{noteId} (path segments=4)
    const segs = d.ref.path.split("/");
    if (segs.length !== 4 || segs[0] !== "users" || segs[2] !== "notes") continue;
    total++;
    const data = d.data();
    if (data.creator_id == null || data.creator_id === "") {
      missing++;
      if (samples.length < SAMPLE) samples.push({path: d.ref.path, why: "missing creator_id"});
    }
  }
  findings.push(fmtRow("users/*/notes", total, missing, 0, 0, samples));
}

// ─── 9. plans (creator_id) ───────────────────────────────────────────────
async function auditPlans() {
  const snap = await db.collection("plans").get();
  let missing = 0;
  const samples = [];
  for (const d of snap.docs) {
    const data = d.data();
    const c = data.creator_id ?? data.creatorId ?? null;
    if (c == null || c === "") {
      missing++;
      if (samples.length < SAMPLE) samples.push({id: d.id, why: "missing creator_id"});
    }
  }
  findings.push(fmtRow("plans", snap.size, missing, 0, 0, samples));
}

// ─── 10. courses (creator_id or creatorId — handler accepts either) ──────
async function auditCourses() {
  const snap = await db.collection("courses").get();
  let missing = 0;
  const samples = [];
  for (const d of snap.docs) {
    const data = d.data();
    const c = data.creator_id ?? data.creatorId ?? null;
    if (c == null || c === "") {
      missing++;
      if (samples.length < SAMPLE) samples.push({id: d.id, why: "missing both creator_id and creatorId"});
    }
  }
  findings.push(fmtRow("courses", snap.size, missing, 0, 0, samples));
}

// ─── 11. one_on_one_clients (creatorId + clientUserId) ───────────────────
async function auditOneOnOne() {
  const snap = await db.collection("one_on_one_clients").get();
  let missing = 0;
  const samples = [];
  for (const d of snap.docs) {
    const data = d.data();
    const hasC = data.creatorId != null && data.creatorId !== "";
    const hasCl = data.clientUserId != null && data.clientUserId !== "";
    if (!hasC || !hasCl) {
      missing++;
      if (samples.length < SAMPLE) samples.push({
        id: d.id,
        why: `missing ${!hasC ? "creatorId " : ""}${!hasCl ? "clientUserId" : ""}`.trim(),
      });
    }
  }
  findings.push(fmtRow("one_on_one_clients", snap.size, missing, 0, 0, samples));
}

// ─── 12. video_exchanges (creatorId + clientId) ──────────────────────────
async function auditVideoExchanges() {
  const snap = await db.collection("video_exchanges").get();
  let missing = 0;
  const samples = [];
  for (const d of snap.docs) {
    const data = d.data();
    const hasC = data.creatorId != null && data.creatorId !== "";
    const hasCl = data.clientId != null && data.clientId !== "";
    if (!hasC || !hasCl) {
      missing++;
      if (samples.length < SAMPLE) samples.push({
        id: d.id,
        why: `missing ${!hasC ? "creatorId " : ""}${!hasCl ? "clientId" : ""}`.trim(),
      });
    }
  }
  findings.push(fmtRow("video_exchanges", snap.size, missing, 0, 0, samples));
}

// ─── 13. api_keys (owner_id) ─────────────────────────────────────────────
async function auditApiKeys() {
  const snap = await db.collection("api_keys").get();
  let missing = 0;
  const samples = [];
  for (const d of snap.docs) {
    const data = d.data();
    if (data.owner_id == null || data.owner_id === "") {
      missing++;
      if (samples.length < SAMPLE) samples.push({id: d.id, why: "missing owner_id"});
    }
  }
  findings.push(fmtRow("api_keys", snap.size, missing, 0, 0, samples));
}

// ─── 14. users/*/subscriptions (user_id; parent path is source) ──────────
async function auditUserSubscriptions() {
  const snap = await db.collectionGroup("subscriptions").get();
  let missing = 0, mismatched = 0;
  const samples = [];
  let total = 0;
  for (const d of snap.docs) {
    const segs = d.ref.path.split("/");
    if (segs.length !== 4 || segs[0] !== "users" || segs[2] !== "subscriptions") continue;
    total++;
    const expectedUid = segs[1];
    const data = d.data();
    if (data.user_id == null || data.user_id === "") {
      missing++;
      if (samples.length < SAMPLE) samples.push({path: d.ref.path, why: "missing user_id", derived: expectedUid});
    } else if (data.user_id !== expectedUid) {
      mismatched++;
      if (samples.length < SAMPLE) samples.push({path: d.ref.path, why: `user_id=${data.user_id} but path uid=${expectedUid}`});
    }
  }
  findings.push(fmtRow("users/*/subscriptions", total, missing, mismatched, 0, samples));
}

// ─── Run ─────────────────────────────────────────────────────────────────

const t0 = Date.now();
console.error("[audit] starting (read-only)…");

const tasks = [
  ["client_session_content", auditClientSessionContent],
  ["client_plan_content", auditClientPlanContent],
  ["client_nutrition_plan_content", auditClientNutritionPlanContent],
  ["nutrition_assignments", auditNutritionAssignments],
  ["bundles", auditBundles],
  ["call_bookings", auditCallBookings],
  ["events", auditEvents],
  ["users/*/notes", auditNotes],
  ["plans", auditPlans],
  ["courses", auditCourses],
  ["one_on_one_clients", auditOneOnOne],
  ["video_exchanges", auditVideoExchanges],
  ["api_keys", auditApiKeys],
  ["users/*/subscriptions", auditUserSubscriptions],
];

for (const [name, fn] of tasks) {
  const tStart = Date.now();
  try {
    await fn();
    console.error(`  ✓ ${name} (${Date.now() - tStart}ms)`);
  } catch (e) {
    console.error(`  ✗ ${name}: ${e.message}`);
    findings.push({collection: name, error: e.message});
  }
}

console.error(`[audit] done in ${Date.now() - t0}ms`);
console.log(JSON.stringify({findings, courses_cached: courseCreator.size}, null, 2));
process.exit(0);
