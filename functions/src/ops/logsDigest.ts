import * as admin from "firebase-admin";
import {Logging} from "@google-cloud/logging";
import * as functions from "firebase-functions";
import {fingerprintError, normalizeMessage} from "./fingerprint.js";
import {sendTelegram} from "./telegram.js";

const STATE_COLLECTION = "ops_logs_state";
const DAYS_TO_KEEP = 14;
const MAX_ENTRIES = 1000;
const MAX_LIST = 10;

interface StateDoc {
  functionName: string;
  errorType: string;
  sampleMessage: string;
  firstSeen: admin.firestore.Timestamp;
  lastSeen: admin.firestore.Timestamp;
  countsByDay: {[date: string]: number};
}

interface AggregatedError {
  fingerprint: string;
  functionName: string;
  errorType: string;
  sampleMessage: string;
  count: number;
}

const ERROR_TYPE_RE =
  /\b(Error|TypeError|RangeError|SyntaxError|ReferenceError|ValidationError|FirebaseError|DeadlineExceeded|PermissionDenied|NotFound|Unauthenticated|ResourceExhausted|FailedPrecondition)\b/;

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function last7Keys(today: Date): string[] {
  const keys: string[] = [];
  for (let i = 1; i <= 7; i++) {
    const day = new Date(today.getTime() - i * 86_400_000);
    keys.push(ymd(day));
  }
  return keys;
}

function inferErrorType(message: string, severity: string): string {
  return ERROR_TYPE_RE.exec(message)?.[1] ?? severity;
}

function extractMessage(entry: any): string {
  const data = entry.data;
  if (typeof data === "string") return data;
  if (data && typeof data === "object") {
    if (typeof data.message === "string") return data.message;
    try {
      return JSON.stringify(data);
    } catch {
      return String(data);
    }
  }
  return "";
}

function extractFunctionName(metadata: any): string {
  const labels = metadata?.resource?.labels || {};
  return (
    labels.function_name ||
    labels.service_name ||
    labels.cloud_function_name ||
    metadata?.resource?.type ||
    "unknown"
  );
}

export async function runLogsDigest(opts: {
  botToken: string;
  chatId: string;
  projectId: string;
}): Promise<void> {
  const {botToken, chatId, projectId} = opts;
  const db = admin.firestore();
  const logging = new Logging({projectId});

  const now = Date.now();
  const nowDate = new Date(now);
  const todayKey = ymd(nowDate);
  const since = new Date(now - 86_400_000).toISOString();

  const filter = [
    `timestamp >= "${since}"`,
    "severity >= WARNING",
    "(resource.type=\"cloud_function\" OR resource.type=\"cloud_run_revision\")",
  ].join(" AND ");

  functions.logger.info("wake-logs-digest: querying", {filter});

  const [entries] = await logging.getEntries({
    filter,
    orderBy: "timestamp desc",
    pageSize: MAX_ENTRIES,
  });

  functions.logger.info("wake-logs-digest: fetched", {count: entries.length});

  if (entries.length === 0) {
    await sendTelegram(
      botToken,
      chatId,
      `[wake-logs-digest] ${todayKey} · prod\n\nNo warnings or errors in the last 24h. All quiet.`
    );
    return;
  }

  const perFp = new Map<string, AggregatedError>();

  for (const entry of entries) {
    const metadata: any = entry.metadata;
    const functionName = extractFunctionName(metadata);
    const severity = String(metadata?.severity || "WARNING");
    const messageRaw = extractMessage(entry);
    if (!messageRaw) continue;

    const errorType = inferErrorType(messageRaw, severity);
    const fp = fingerprintError(functionName, errorType, messageRaw);

    const existing = perFp.get(fp);
    if (existing) {
      existing.count += 1;
    } else {
      perFp.set(fp, {
        fingerprint: fp,
        functionName,
        errorType,
        sampleMessage: normalizeMessage(messageRaw).slice(0, 180),
        count: 1,
      });
    }
  }

  const fingerprints = [...perFp.keys()];
  const refs = fingerprints.map((fp) =>
    db.collection(STATE_COLLECTION).doc(fp)
  );
  const snaps = refs.length > 0 ? await db.getAll(...refs) : [];

  const nowTs = admin.firestore.Timestamp.now();
  const prev7Keys = last7Keys(nowDate);
  const cutoff = ymd(new Date(now - DAYS_TO_KEEP * 86_400_000));

  const newOnes: Array<{entry: AggregatedError}> = [];
  const spiking: Array<{entry: AggregatedError; avg: number}> = [];
  const baseline: Array<{entry: AggregatedError}> = [];

  const batch = db.batch();

  for (let i = 0; i < fingerprints.length; i++) {
    const fp = fingerprints[i];
    const agg = perFp.get(fp) as AggregatedError;
    const snap = snaps[i];
    const existing = snap.exists ? (snap.data() as StateDoc) : null;

    const countsByDay: {[k: string]: number} = {
      ...(existing?.countsByDay ?? {}),
    };
    countsByDay[todayKey] = agg.count;
    for (const d of Object.keys(countsByDay)) {
      if (d < cutoff) delete countsByDay[d];
    }

    const priorCounts = prev7Keys.map((k) => countsByDay[k] ?? 0);
    const priorAvg = priorCounts.reduce((a, b) => a + b, 0) / 7;

    const isNew =
      !existing ||
      existing.firstSeen.toMillis() >= now - 86_400_000;

    const isSpiking =
      !isNew && priorAvg > 0 && agg.count >= Math.max(5, 2 * priorAvg);

    if (isNew) {
      newOnes.push({entry: agg});
    } else if (isSpiking) {
      spiking.push({entry: agg, avg: priorAvg});
    } else {
      baseline.push({entry: agg});
    }

    const updated: StateDoc = {
      functionName: agg.functionName,
      errorType: agg.errorType,
      sampleMessage: agg.sampleMessage,
      firstSeen: existing?.firstSeen ?? nowTs,
      lastSeen: nowTs,
      countsByDay,
    };
    batch.set(refs[i], updated);
  }

  await batch.commit();

  newOnes.sort((a, b) => b.entry.count - a.entry.count);
  spiking.sort(
    (a, b) =>
      b.entry.count / Math.max(b.avg, 1) -
      a.entry.count / Math.max(a.avg, 1)
  );
  baseline.sort((a, b) => b.entry.count - a.entry.count);

  const lines: string[] = [];
  lines.push(
    `[wake-logs-digest] ${todayKey} · prod · ${entries.length} events · ${newOnes.length} new · ${spiking.length} spiking`
  );
  lines.push("");

  if (newOnes.length > 0) {
    lines.push("NEW");
    for (const s of newOnes.slice(0, MAX_LIST)) {
      lines.push(
        `• ${s.entry.functionName} — ${s.entry.errorType}: ${s.entry.sampleMessage} (${s.entry.count})`
      );
    }
    lines.push("");
  }

  if (spiking.length > 0) {
    lines.push("SPIKING (vs 7d avg)");
    for (const s of spiking.slice(0, MAX_LIST)) {
      const pct = Math.round((s.entry.count / Math.max(s.avg, 1) - 1) * 100);
      lines.push(
        `• ${s.entry.functionName} — ${s.entry.errorType}: ${s.entry.count} (avg ${s.avg.toFixed(1)}, +${pct}%)`
      );
    }
    lines.push("");
  }

  if (newOnes.length === 0 && spiking.length === 0 && baseline.length > 0) {
    lines.push("Baseline (top 5 by count)");
    for (const s of baseline.slice(0, 5)) {
      lines.push(
        `• ${s.entry.functionName} — ${s.entry.errorType}: ${s.entry.count}`
      );
    }
  }

  await sendTelegram(botToken, chatId, lines.join("\n").trim());
}
