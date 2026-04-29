// Daily integrity sweep for ownership-critical fields on prod data.
//
// Triggered from wakeDailyPulseCron. Posts to wake_ops "signals" topic only
// when anomalies are found — silent on a clean day.
//
// Today's check: client_sessions.creator_id presence + correctness against
// courses[program_id].creatorId. Add new checks here as new collections
// adopt similar ownership conventions.

import * as admin from "firebase-admin";
import * as functions from "firebase-functions";
import {sendTo, type TopicMap} from "./telegram.js";

const SAMPLE_LIMIT = 5;

interface Anomaly {
  docId: string;
  reason: string;
}

async function scanClientSessions(): Promise<{
  scanned: number;
  missing: Anomaly[];
  mismatched: Anomaly[];
}> {
  const db = admin.firestore();
  const programCreatorCache = new Map<string, string | null>();

  async function getProgramCreator(programId: string): Promise<string | null> {
    if (programCreatorCache.has(programId)) return programCreatorCache.get(programId)!;
    const doc = await db.collection("courses").doc(programId).get();
    const cid = doc.exists ?
      (doc.data()?.creatorId ?? doc.data()?.creator_id ?? null) :
      null;
    programCreatorCache.set(programId, cid);
    return cid;
  }

  const missing: Anomaly[] = [];
  const mismatched: Anomaly[] = [];
  let scanned = 0;

  const snap = await db.collection("client_sessions").get();
  scanned = snap.size;

  for (const d of snap.docs) {
    const data = d.data();
    if (data.creator_id == null) {
      missing.push({docId: d.id, reason: "creator_id missing"});
      continue;
    }
    const programId = data.program_id as string | undefined;
    if (!programId) continue;
    const expected = await getProgramCreator(programId);
    if (expected && expected !== data.creator_id) {
      mismatched.push({
        docId: d.id,
        reason: `creator_id=${data.creator_id} but courses[${programId}].creatorId=${expected}`,
      });
    }
  }

  return {scanned, missing, mismatched};
}

export async function runDataIntegrity(opts: {
  botToken: string;
  chatId: string;
  topics?: TopicMap;
}): Promise<void> {
  const {botToken, chatId, topics} = opts;
  const ctx = {botToken, chatId, topics};

  const result = await scanClientSessions();
  if (result.missing.length === 0 && result.mismatched.length === 0) {
    functions.logger.info("[data-integrity] clean", {scanned: result.scanned});
    return;
  }

  const lines: string[] = [
    "[wake-data-integrity] anomalies detected",
    `scanned client_sessions: ${result.scanned}`,
    `missing creator_id: ${result.missing.length}`,
    `mismatched creator_id vs program: ${result.mismatched.length}`,
  ];
  if (result.missing.length > 0) {
    lines.push("\nmissing (sample):");
    for (const a of result.missing.slice(0, SAMPLE_LIMIT)) lines.push(`  ${a.docId}`);
  }
  if (result.mismatched.length > 0) {
    lines.push("\nmismatched (sample):");
    for (const a of result.mismatched.slice(0, SAMPLE_LIMIT)) {
      lines.push(`  ${a.docId} — ${a.reason}`);
    }
  }
  await sendTo(ctx, "signals", lines.join("\n"));
}
