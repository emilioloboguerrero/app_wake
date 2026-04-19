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
  firstMs: number;
  lastMs: number;
  userAgents: Map<string, number>;
}

// Short UA buckets so a full Chrome UA string doesn't eat the Telegram
// budget. Just enough to tell iOS Safari from Android Chrome from a bot.
function shortUa(ua: string): string {
  if (!ua) return "";
  if (/iPhone|iPad/.test(ua)) return /Safari/.test(ua) ? "iOS Safari" : "iOS";
  if (/Android/.test(ua)) return /Chrome/.test(ua) ? "Android Chrome" : "Android";
  if (/Edg\//.test(ua)) return "Edge";
  if (/Chrome/.test(ua)) return "Chrome";
  if (/Firefox/.test(ua)) return "Firefox";
  if (/Safari/.test(ua)) return "Safari";
  if (/curl|bot|crawler|spider|python-requests/i.test(ua)) return "bot/other";
  return ua.slice(0, 24);
}

// Fallback when a sourcemap isn't available (creator dashboard, or PWA
// before maps upload): pull the first readable frame out of the raw stack
// so the digest still points somewhere useful.
function rawTopFrame(stack: string | null): string | null {
  if (!stack) return null;
  for (const line of stack.split("\n").map((l) => l.trim())) {
    if (!line.startsWith("at ") && !/^https?:\/\//.test(line)) continue;
    // Collapse absolute URLs to pathname+line:col so the frame fits.
    const urlMatch = /(https?:\/\/[^\s)]+)/.exec(line);
    if (urlMatch) {
      try {
        const u = new URL(urlMatch[1]);
        return u.pathname.replace(/^\/+/, "") +
          line.slice(line.indexOf(urlMatch[1]) + urlMatch[1].length);
      } catch {
        // fall through
      }
    }
    return line.replace(/^at\s+/, "").slice(0, 100);
  }
  return null;
}

function formatHhmm(ms: number): string {
  const d = new Date(ms);
  return (
    String(d.getUTCHours()).padStart(2, "0") +
    ":" +
    String(d.getUTCMinutes()).padStart(2, "0") +
    "Z"
  );
}

function topKey<K>(m: Map<K, number>): K | undefined {
  let best: K | undefined;
  let bestN = -1;
  for (const [k, v] of m) {
    if (v > bestN) {
      best = k;
      bestN = v;
    }
  }
  return best;
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
    const createdMs =
      d.createdAt && typeof d.createdAt.toMillis === "function" ?
        d.createdAt.toMillis() :
        Date.now();
    const uaBucket = shortUa(typeof d.userAgent === "string" ? d.userAgent : "");

    const existing = byFp.get(fp);
    if (existing) {
      existing.count += count;
      if (userId) existing.users.add(userId);
      if (createdMs < existing.firstMs) existing.firstMs = createdMs;
      if (createdMs > existing.lastMs) existing.lastMs = createdMs;
      if (uaBucket) {
        existing.userAgents.set(uaBucket, (existing.userAgents.get(uaBucket) ?? 0) + 1);
      }
      // Prefer a sample with a stack if we don't have one yet.
      if (!existing.sampleStack && typeof d.stack === "string") {
        existing.sampleStack = d.stack;
      }
    } else {
      const userAgents = new Map<string, number>();
      if (uaBucket) userAgents.set(uaBucket, 1);
      byFp.set(fp, {
        fingerprint: fp,
        errorType: String(d.errorType || "Error"),
        sampleMessage: String(d.message || "").slice(0, 200),
        sampleUrl: String(d.url || "").slice(0, 80),
        sampleStack: typeof d.stack === "string" ? d.stack : null,
        count,
        users: userId ? new Set([userId]) : new Set(),
        firstMs: createdMs,
        lastMs: createdMs,
        userAgents,
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
    // Fall back to the raw top frame so we always point somewhere, even
    // when sourcemaps aren't uploaded yet (fresh deploy) or we're looking
    // at creator dashboard errors (no sourcemap pipeline there).
    const frame = symbolicated ?? rawTopFrame(b.sampleStack);
    const stateTag = state ? ` [${state}]` : "";
    const at = frame ? ` @ ${frame}` : "";
    const base =
      `• ${prefix}${b.sampleMessage}${at}${location} (${b.count}${users})${stateTag}`;

    // Timing line: "burst HH:MMZ" for tight clusters, range otherwise. Plus
    // top user-agent and the fingerprint hash so an operator can query
    // `ops_client_errors where fingerprint == X` to pull raw events.
    const detailBits: string[] = [];
    if (b.firstMs && b.lastMs) {
      detailBits.push(
        b.lastMs - b.firstMs < 30 * 60_000 ?
          `burst ${formatHhmm(b.firstMs)}` :
          `${formatHhmm(b.firstMs)}–${formatHhmm(b.lastMs)}`
      );
    }
    const ua = topKey(b.userAgents);
    if (ua) detailBits.push(`ua=${ua}`);
    detailBits.push(`fp=${b.fingerprint.slice(0, 10)}`);

    return `${base}\n  ↳ ${detailBits.join(" · ")}`;
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

  // Refetch pointer: lets the reader pull raw events (full stack, full URL,
  // full UA, full userId) without having to know the Firestore schema.
  lines.push("");
  lines.push(
    `Refetch: opsApi /v1/client-errors?source=${source}&windowHours=24` +
      " · Firestore: ops_client_errors where source==" + source
  );

  let body = lines.join("\n").trim();
  if (body.length > TELEGRAM_MAX) {
    body = body.slice(0, TELEGRAM_MAX - 20) + "\n…[truncated]";
  }
  await sendTo(ctx, "signals", body);
}
