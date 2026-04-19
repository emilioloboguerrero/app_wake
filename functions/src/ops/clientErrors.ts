import * as admin from "firebase-admin";
import * as functions from "firebase-functions";
import {sendTo, type TopicMap} from "./telegram.js";
import {
  categoriseFingerprints,
  cutoffKey,
  last7DateKeys,
  bucketCountsLine,
  type CategoryBuckets,
} from "./stateTracker.js";
import {tryResolveTopFrame} from "./sourcemaps.js";

const TELEGRAM_MAX = 4000;
const TOP_N = 10;
const DAYS_TO_KEEP = 14;

// One state collection per source keeps fingerprints cleanly separated
// between apps. Namespace in the collection name avoids any risk of
// fingerprint collision between PWA and creator.
function stateCollectionFor(source: "pwa" | "creator"): string {
  return source === "pwa" ? "ops_pwa_errors_state" : "ops_creator_errors_state";
}

interface Bucket {
  fingerprint: string;
  errorType: string;
  sampleMessage: string;
  sampleUrl: string;
  sampleStack: string | null;
  count: number;
  users: Set<string>;
}

interface ClientErrorExtras {
  errorType: string;
  sampleMessage: string;
  sampleUrl: string;
  users: number;
}

export async function runClientErrors(
  opts: {
    botToken: string;
    chatId: string;
    topics?: TopicMap;
    projectId: string;
  },
  params: {source: "pwa" | "creator"}
): Promise<void> {
  const {botToken, chatId, topics} = opts;
  const ctx = {botToken, chatId, topics};
  const {source} = params;
  const now = Date.now();
  const nowDate = new Date(now);
  const todayKey = nowDate.toISOString().slice(0, 10);
  const since = admin.firestore.Timestamp.fromMillis(now - 86_400_000);
  const db = admin.firestore();

  const snap = await db
    .collection("ops_client_errors")
    .where("source", "==", source)
    .where("createdAt", ">=", since)
    .get();

  const tag = source === "pwa" ? "wake-pwa-errors" : "wake-creator-errors";

  const byFp = new Map<string, Bucket>();
  let totalCount = 0;
  const allUsers = new Set<string>();

  for (const doc of snap.docs) {
    const d = doc.data();
    const fp = String(d.fingerprint || doc.id);
    const count = Number(d.count) || 1;
    totalCount += count;
    const userId = typeof d.userId === "string" ? d.userId : "";
    if (userId) allUsers.add(userId);

    const existing = byFp.get(fp);
    if (existing) {
      existing.count += count;
      if (userId) existing.users.add(userId);
    } else {
      byFp.set(fp, {
        fingerprint: fp,
        errorType: String(d.errorType || "Error"),
        sampleMessage: String(d.message || "").slice(0, 200),
        sampleUrl: String(d.url || "").slice(0, 80),
        sampleStack: typeof d.stack === "string" ? d.stack : null,
        count,
        users: userId ? new Set([userId]) : new Set(),
      });
    }
  }

  const bucketsList = [...byFp.values()].sort((a, b) => b.count - a.count);
  const top = bucketsList.slice(0, TOP_N);

  // NEW/SPIKING state — every fingerprint is a signal, tracked in a
  // per-source state collection.
  let buckets: CategoryBuckets<ClientErrorExtras> = {
    new: [], spiking: [], recurring: [], chronic: [],
  };
  try {
    buckets = await categoriseFingerprints<ClientErrorExtras>(db, {
      stateCollection: stateCollectionFor(source),
      todayKey,
      prior7Keys: last7DateKeys(nowDate),
      cutoffKey: cutoffKey(nowDate, DAYS_TO_KEEP),
      signals: bucketsList.map((b) => ({
        fingerprint: b.fingerprint,
        count: b.count,
        extras: {
          errorType: b.errorType,
          sampleMessage: b.sampleMessage,
          sampleUrl: b.sampleUrl,
          users: b.users.size,
        },
      })),
    });
  } catch (err) {
    functions.logger.warn("wake-client-errors: state tracking failed", {
      source,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  if (snap.empty) {
    await sendTo(
      ctx,
      "signals",
      `[${tag}] ${todayKey} · 24h\n\nNo errors reported. All quiet.`
    );
    return;
  }

  const header =
    `[${tag}] ${todayKey} · 24h · ` +
    `${totalCount} error${totalCount === 1 ? "" : "s"} · ` +
    `${allUsers.size} user${allUsers.size === 1 ? "" : "s"} · ` +
    `${bucketsList.length} fp · ` +
    bucketCountsLine(buckets);

  const lines: string[] = [header, ""];

  const formatEntry = async (b: Bucket, state: string) => {
    const location = b.sampleUrl ? ` [${b.sampleUrl}]` : "";
    const users =
      b.users.size > 0 ?
        `, ${b.users.size} user${b.users.size === 1 ? "" : "s"}` :
        "";
    const prefix =
      b.sampleMessage
        .toLowerCase()
        .startsWith(b.errorType.toLowerCase() + ":") ?
        "" :
        `${b.errorType}: `;
    let symbolicated: string | null = null;
    if (source === "pwa" && b.sampleStack) {
      try {
        symbolicated = await tryResolveTopFrame(b.sampleStack);
      } catch {
        symbolicated = null;
      }
    }
    const stateTag = state ? ` [${state}]` : "";
    const at = symbolicated ? ` @ ${symbolicated}` : "";
    return `• ${prefix}${b.sampleMessage}${at}${location} (${b.count}${users})${stateTag}`;
  };

  // Grouped output — NEW first, then SPIKING, then top-by-count
  const fpsSeen = new Set<string>();

  if (buckets.new.length > 0) {
    lines.push(`NEW (${buckets.new.length})`);
    for (const s of buckets.new) {
      const b = byFp.get(s.signal.fingerprint);
      if (!b) continue;
      lines.push(await formatEntry(b, "NEW"));
      fpsSeen.add(b.fingerprint);
    }
    lines.push("");
  }

  if (buckets.spiking.length > 0) {
    lines.push(`SPIKING (${buckets.spiking.length})`);
    for (const s of buckets.spiking) {
      const b = byFp.get(s.signal.fingerprint);
      if (!b) continue;
      lines.push(
        await formatEntry(b, `SPIKING avg ${s.priorAvg.toFixed(1)}`)
      );
      fpsSeen.add(b.fingerprint);
    }
    lines.push("");
  }

  const remainingTop = top.filter((b) => !fpsSeen.has(b.fingerprint));
  if (remainingTop.length > 0) {
    lines.push(`TOP (${remainingTop.length})`);
    for (const b of remainingTop) {
      lines.push(await formatEntry(b, ""));
    }
  }

  if (bucketsList.length > TOP_N) {
    lines.push("");
    lines.push(`… and ${bucketsList.length - TOP_N} more fingerprints`);
  }

  let body = lines.join("\n").trim();
  if (body.length > TELEGRAM_MAX) {
    body = body.slice(0, TELEGRAM_MAX - 20) + "\n…[truncated]";
  }
  await sendTo(ctx, "signals", body);
}
