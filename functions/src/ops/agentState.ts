// Agent runtime state — pause flag, daily budget counters, mention dedupe.
// All docs live under the ops_agent_state Firestore collection, keyed by
// role so a single collection serves all three purposes.
//
//   ops_agent_state/pause               — { paused: boolean, setAt }
//   ops_agent_state/budget_{YYYYMMDD}   — { date, mentionCount, inputTokens }
//   ops_agent_state/mention_{chat}_{id} — { processedAt, expiresAt }
//
// Dedupe docs carry an expiresAt so a Firestore TTL policy can reclaim
// them. Budget docs are kept small (one per day).

import * as admin from "firebase-admin";

const COLLECTION = "ops_agent_state";
const DEDUPE_TTL_HOURS = 24;

function dateKey(d: Date = new Date()): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

// ─── Pause flag ────────────────────────────────────────────────────────
export async function isAgentPaused(): Promise<boolean> {
  const db = admin.firestore();
  const snap = await db.collection(COLLECTION).doc("pause").get();
  if (!snap.exists) return false;
  const data = snap.data() as {paused?: boolean} | undefined;
  return !!data?.paused;
}

export async function setAgentPaused(paused: boolean): Promise<void> {
  const db = admin.firestore();
  await db.collection(COLLECTION).doc("pause").set({
    paused,
    setAt: admin.firestore.Timestamp.now(),
  });
}

// ─── Daily budget ─────────────────────────────────────────────────────
export interface BudgetDoc {
  date: string;
  mentionCount: number;
  synthesisInputTokens: number;
  synthesisOutputTokens: number;
  mentionInputTokens: number;
  mentionOutputTokens: number;
}

async function readBudget(): Promise<BudgetDoc> {
  const db = admin.firestore();
  const date = dateKey();
  const ref = db.collection(COLLECTION).doc(`budget_${date}`);
  const snap = await ref.get();
  if (!snap.exists) {
    return {
      date,
      mentionCount: 0,
      synthesisInputTokens: 0,
      synthesisOutputTokens: 0,
      mentionInputTokens: 0,
      mentionOutputTokens: 0,
    };
  }
  return snap.data() as BudgetDoc;
}

export async function tryConsumeMention(limit: number): Promise<{
  allowed: boolean;
  used: number;
  limit: number;
}> {
  const db = admin.firestore();
  const date = dateKey();
  const ref = db.collection(COLLECTION).doc(`budget_${date}`);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const current = snap.exists ?
      (snap.data() as BudgetDoc) :
      {
        date,
        mentionCount: 0,
        synthesisInputTokens: 0,
        synthesisOutputTokens: 0,
        mentionInputTokens: 0,
        mentionOutputTokens: 0,
      };
    if (current.mentionCount >= limit) {
      return {allowed: false, used: current.mentionCount, limit};
    }
    tx.set(
      ref,
      {...current, mentionCount: current.mentionCount + 1},
      {merge: true}
    );
    return {allowed: true, used: current.mentionCount + 1, limit};
  });
}

export async function checkSynthesisInputBudget(
  limit: number
): Promise<{allowed: boolean; used: number; limit: number}> {
  const b = await readBudget();
  const used = b.synthesisInputTokens;
  return {allowed: used < limit, used, limit};
}

export async function recordAgentUsage(
  mode: "synthesis" | "mention" | "test",
  input: number,
  output: number
): Promise<void> {
  if (mode === "test") return;
  const db = admin.firestore();
  const date = dateKey();
  const ref = db.collection(COLLECTION).doc(`budget_${date}`);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const current = snap.exists ?
      (snap.data() as BudgetDoc) :
      {
        date,
        mentionCount: 0,
        synthesisInputTokens: 0,
        synthesisOutputTokens: 0,
        mentionInputTokens: 0,
        mentionOutputTokens: 0,
      };
    const patch: BudgetDoc =
      mode === "synthesis" ? {
        ...current,
        synthesisInputTokens: current.synthesisInputTokens + input,
        synthesisOutputTokens: current.synthesisOutputTokens + output,
      } : {
        ...current,
        mentionInputTokens: current.mentionInputTokens + input,
        mentionOutputTokens: current.mentionOutputTokens + output,
      };
    tx.set(ref, patch, {merge: true});
  });
}

// ─── Mention dedupe ────────────────────────────────────────────────────
export async function markMentionProcessed(
  chatId: string,
  messageId: number
): Promise<{firstTime: boolean}> {
  const db = admin.firestore();
  const ref = db
    .collection(COLLECTION)
    .doc(`mention_${chatId}_${messageId}`);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists) return {firstTime: false};
    tx.set(ref, {
      processedAt: admin.firestore.Timestamp.now(),
      expiresAt: admin.firestore.Timestamp.fromMillis(
        Date.now() + DEDUPE_TTL_HOURS * 3_600_000
      ),
    });
    return {firstTime: true};
  });
}
