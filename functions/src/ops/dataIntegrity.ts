// Daily integrity sweep for ownership-critical fields on prod data.
//
// Triggered from wakeDailyPulseCron. Posts to wake_ops "signals" topic only
// when anomalies are found — silent on a clean day.
//
// Covers every collection whose API handlers gate on doc-level ownership
// fields (creator_id / client_id / clientUserId). The 2026-04-29 audit
// extended this from client_sessions to also cover client_plan_content,
// client_nutrition_plan_content, nutrition_assignments, and per-user
// subscription docs. Add new collections here as new ones adopt the same
// ownership convention.

import * as admin from "firebase-admin";
import * as functions from "firebase-functions";
import {sendTo, type TopicMap} from "./telegram.js";

const SAMPLE_LIMIT = 5;

interface Anomaly {
  docId: string;
  reason: string;
}

interface ScanResult {
  collection: string;
  scanned: number;
  missing: Anomaly[];
  mismatched: Anomaly[];
}

async function getProgramCreator(
  db: FirebaseFirestore.Firestore,
  cache: Map<string, string | null>,
  programId: string
): Promise<string | null> {
  if (cache.has(programId)) return cache.get(programId)!;
  const doc = await db.collection("courses").doc(programId).get();
  const cid = doc.exists ?
    ((doc.data()?.creatorId as string | undefined) ?? (doc.data()?.creator_id as string | undefined) ?? null) :
    null;
  cache.set(programId, cid);
  return cid;
}

async function scanClientSessions(db: FirebaseFirestore.Firestore): Promise<ScanResult> {
  const cache = new Map<string, string | null>();
  const missing: Anomaly[] = [];
  const mismatched: Anomaly[] = [];

  const snap = await db.collection("client_sessions").get();

  for (const d of snap.docs) {
    const data = d.data();
    if (data.creator_id == null) {
      missing.push({docId: d.id, reason: "creator_id missing"});
      continue;
    }
    const programId = data.program_id as string | undefined;
    if (!programId) continue;
    const expected = await getProgramCreator(db, cache, programId);
    if (expected && expected !== data.creator_id) {
      mismatched.push({
        docId: d.id,
        reason: `creator_id=${data.creator_id} but courses[${programId}].creatorId=${expected}`,
      });
    }
  }

  return {collection: "client_sessions", scanned: snap.size, missing, mismatched};
}

// `client_plan_content` doc id is `${clientId}_${programId}_${weekKey}` for
// client-scoped docs and `program_${programId}_${weekKey}` for program-scoped
// templates. Templates legitimately have client_id: null.
async function scanClientPlanContent(db: FirebaseFirestore.Firestore): Promise<ScanResult> {
  const cache = new Map<string, string | null>();
  const missing: Anomaly[] = [];
  const mismatched: Anomaly[] = [];

  const snap = await db.collection("client_plan_content").get();

  for (const d of snap.docs) {
    const data = d.data();
    const parts = d.id.split("_");
    if (parts.length !== 3) continue; // unexpected id shape — skip rather than false-positive
    const programScoped = parts[0] === "program";
    const programId = parts[1];

    if (data.creator_id == null) {
      missing.push({docId: d.id, reason: "creator_id missing"});
      continue;
    }
    const expected = await getProgramCreator(db, cache, programId);
    if (expected && expected !== data.creator_id) {
      mismatched.push({
        docId: d.id,
        reason: `creator_id=${data.creator_id} but courses[${programId}].creatorId=${expected}`,
      });
    }

    if (programScoped) {
      // Program templates: client_id must be null (or absent).
      if (data.client_id != null && data.client_id !== "") {
        mismatched.push({docId: d.id, reason: `program-scoped template has client_id=${data.client_id}`});
      }
    } else {
      // Client-scoped: client_id must be set and match id-prefix.
      if (data.client_id == null || data.client_id === "") {
        missing.push({docId: d.id, reason: "client_id missing on client-scoped doc"});
      } else if (data.client_id !== parts[0]) {
        mismatched.push({docId: d.id, reason: `client_id=${data.client_id} but id-prefix=${parts[0]}`});
      }
    }
  }

  return {collection: "client_plan_content", scanned: snap.size, missing, mismatched};
}

// `nutrition_assignments` legitimately holds program-scoped templates
// (userId === null, source === "program"). Those have clientUserId: null.
async function scanNutritionAssignments(db: FirebaseFirestore.Firestore): Promise<ScanResult> {
  const missing: Anomaly[] = [];
  const mismatched: Anomaly[] = [];

  const snap = await db.collection("nutrition_assignments").get();

  for (const d of snap.docs) {
    const data = d.data();

    if (data.creator_id == null) {
      missing.push({docId: d.id, reason: "creator_id missing"});
    } else if (data.assignedBy && data.creator_id !== data.assignedBy) {
      mismatched.push({
        docId: d.id,
        reason: `creator_id=${data.creator_id} disagrees with assignedBy=${data.assignedBy}`,
      });
    }

    const programScoped = data.source === "program" || data.userId == null;
    if (programScoped) {
      if (data.clientUserId != null && data.clientUserId !== "") {
        mismatched.push({docId: d.id, reason: `program-scoped assignment has clientUserId=${data.clientUserId}`});
      }
    } else {
      if (data.clientUserId == null || data.clientUserId === "") {
        missing.push({docId: d.id, reason: "clientUserId missing on client-scoped assignment"});
      } else if (data.userId && data.clientUserId !== data.userId) {
        mismatched.push({
          docId: d.id,
          reason: `clientUserId=${data.clientUserId} disagrees with userId=${data.userId}`,
        });
      }
    }
  }

  return {collection: "nutrition_assignments", scanned: snap.size, missing, mismatched};
}

// `client_nutrition_plan_content` parents to `nutrition_assignments` 1:1 by id.
async function scanClientNutritionPlanContent(db: FirebaseFirestore.Firestore): Promise<ScanResult> {
  const missing: Anomaly[] = [];
  const mismatched: Anomaly[] = [];

  // Pre-load parent assignments for cross-checks.
  const parentSnap = await db.collection("nutrition_assignments").get();
  const parents = new Map<string, FirebaseFirestore.DocumentData>();
  for (const p of parentSnap.docs) parents.set(p.id, p.data());

  const snap = await db.collection("client_nutrition_plan_content").get();

  for (const d of snap.docs) {
    const data = d.data();
    const parent = parents.get(d.id);

    if (data.creator_id == null) {
      missing.push({docId: d.id, reason: "creator_id missing"});
    } else if (parent?.creator_id && data.creator_id !== parent.creator_id) {
      mismatched.push({
        docId: d.id,
        reason: `creator_id=${data.creator_id} disagrees with parent assignment`,
      });
    }

    // Program-scoped parents have userId: null — content doc gets client_id: null.
    const parentProgramScoped = parent && (parent.source === "program" || parent.userId == null);

    if (parentProgramScoped) {
      if (data.client_id != null && data.client_id !== "") {
        mismatched.push({docId: d.id, reason: `program-scoped content has client_id=${data.client_id}`});
      }
    } else if (parent) {
      if (data.client_id == null || data.client_id === "") {
        missing.push({docId: d.id, reason: "client_id missing on client-scoped content"});
      } else if (parent.userId && data.client_id !== parent.userId) {
        mismatched.push({
          docId: d.id,
          reason: `client_id=${data.client_id} disagrees with parent userId=${parent.userId}`,
        });
      }
    }
  }

  return {collection: "client_nutrition_plan_content", scanned: snap.size, missing, mismatched};
}

// users/{uid}/subscriptions: user_id must equal the parent path uid.
async function scanUserSubscriptions(db: FirebaseFirestore.Firestore): Promise<ScanResult> {
  const missing: Anomaly[] = [];
  const mismatched: Anomaly[] = [];

  const snap = await db.collectionGroup("subscriptions").get();
  let scanned = 0;
  for (const d of snap.docs) {
    const segs = d.ref.path.split("/");
    if (segs.length !== 4 || segs[0] !== "users" || segs[2] !== "subscriptions") continue;
    scanned++;
    const expectedUid = segs[1];
    const data = d.data();
    if (data.user_id == null || data.user_id === "") {
      missing.push({docId: d.ref.path, reason: "user_id missing"});
    } else if (data.user_id !== expectedUid) {
      mismatched.push({
        docId: d.ref.path,
        reason: `user_id=${data.user_id} but parent path uid=${expectedUid}`,
      });
    }
  }

  return {collection: "users/*/subscriptions", scanned, missing, mismatched};
}

export async function runDataIntegrity(opts: {
  botToken: string;
  chatId: string;
  topics?: TopicMap;
}): Promise<void> {
  const {botToken, chatId, topics} = opts;
  const ctx = {botToken, chatId, topics};
  const db = admin.firestore();

  const results = await Promise.all([
    scanClientSessions(db),
    scanClientPlanContent(db),
    scanNutritionAssignments(db),
    scanClientNutritionPlanContent(db),
    scanUserSubscriptions(db),
  ]);

  const dirty = results.filter((r) => r.missing.length > 0 || r.mismatched.length > 0);
  if (dirty.length === 0) {
    functions.logger.info(
      "[data-integrity] clean",
      Object.fromEntries(results.map((r) => [r.collection, r.scanned]))
    );
    return;
  }

  const lines: string[] = ["[wake-data-integrity] anomalies detected"];
  for (const r of results) {
    lines.push(
      `${r.collection}: scanned=${r.scanned} missing=${r.missing.length} mismatched=${r.mismatched.length}`
    );
  }
  for (const r of dirty) {
    if (r.missing.length > 0) {
      lines.push(`\n${r.collection} missing (sample):`);
      for (const a of r.missing.slice(0, SAMPLE_LIMIT)) lines.push(`  ${a.docId} — ${a.reason}`);
    }
    if (r.mismatched.length > 0) {
      lines.push(`\n${r.collection} mismatched (sample):`);
      for (const a of r.mismatched.slice(0, SAMPLE_LIMIT)) lines.push(`  ${a.docId} — ${a.reason}`);
    }
  }
  await sendTo(ctx, "signals", lines.join("\n"));
}
