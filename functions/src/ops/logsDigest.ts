import * as admin from "firebase-admin";
import {Logging} from "@google-cloud/logging";
import * as functions from "firebase-functions";
import {fingerprintError, normalizeForDisplay} from "./fingerprint.js";
import {sendTelegram} from "./telegram.js";

const STATE_COLLECTION = "ops_logs_state";
const DAYS_TO_KEEP = 14;
const MAX_LIST_WITH_URL = 5;
const BASELINE_LIST = 5;
const SAMPLE_LEN = 220;
const TELEGRAM_MAX = 4000;

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
  errorCount: number;
  warnCount: number;
  userIds: Set<string>;
  firstMs: number;
  lastMs: number;
}

interface DeployEvent {
  timeMs: number;
  kind: string;
  resource: string;
}

const ERROR_TYPE_RE =
  /\b(Error|TypeError|RangeError|SyntaxError|ReferenceError|ValidationError|FirebaseError|DeadlineExceeded|PermissionDenied|NotFound|Unauthenticated|ResourceExhausted|FailedPrecondition)\b/;
const USER_TAG_RE = /\(user=([^)]+)\)/;
const UUID_PATH_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HEX_PATH_RE = /^[0-9a-f]{20,}$/i;
const NUM_PATH_RE = /^\d{5,}$/;
const FIREBASE_UID_RE = /^[A-Za-z0-9]{20,40}$/;

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function hhmm(ms: number): string {
  // Format as UTC HH:MM — Bogotá is UTC-5, but consistent UTC is simpler and
  // matches Cloud Logging console display.
  const d = new Date(ms);
  const h = String(d.getUTCHours()).padStart(2, "0");
  const m = String(d.getUTCMinutes()).padStart(2, "0");
  return `${h}:${m}Z`;
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

function normalizePathSegment(seg: string): string {
  if (!seg) return seg;
  if (UUID_PATH_RE.test(seg)) return ":id";
  if (HEX_PATH_RE.test(seg)) return ":id";
  if (NUM_PATH_RE.test(seg)) return ":id";
  if (FIREBASE_UID_RE.test(seg) && /\d/.test(seg) && /[A-Za-z]/.test(seg)) {
    return ":id";
  }
  return seg;
}

function normalizeRoute(path: string): string {
  // Strip /v1 or /api/v1 prefixes, collapse dynamic segments to :id.
  let p = path.replace(/^\/api\/v1/, "").replace(/^\/v1/, "");
  if (!p.startsWith("/")) p = "/" + p;
  const parts = p.split("/").map(normalizePathSegment);
  const result = parts.join("/") || "/";
  return result.length > 80 ? result.slice(0, 80) + "..." : result;
}

function extractRouteFromHttpRequest(metadata: any): {method: string; route: string; status?: number} | null {
  const hr = metadata?.httpRequest;
  if (!hr || !hr.requestUrl) return null;
  try {
    const url = new URL(hr.requestUrl);
    return {
      method: String(hr.requestMethod || "").toUpperCase() || "?",
      route: normalizeRoute(url.pathname),
      status: typeof hr.status === "number" ? hr.status : undefined,
    };
  } catch {
    return null;
  }
}

function extractRouteFromMessage(message: string): {method: string; route: string} | null {
  // Matches our enhanced api error log: "[api] POST /v1/workout/complete — ..."
  const m = /\[api\]\s+([A-Z]+)\s+(\/\S+)/.exec(message);
  if (!m) return null;
  return {method: m[1], route: normalizeRoute(m[2])};
}

function deriveFunctionLabel(
  rawFunctionName: string,
  metadata: any,
  message: string
): string {
  if (rawFunctionName !== "api") return rawFunctionName;
  const fromHttp = extractRouteFromHttpRequest(metadata);
  if (fromHttp) return `api ${fromHttp.method} ${fromHttp.route}`;
  const fromMsg = extractRouteFromMessage(message);
  if (fromMsg) return `api ${fromMsg.method} ${fromMsg.route}`;
  return "api";
}

function extractUserId(message: string, metadata: any): string | null {
  const tagMatch = USER_TAG_RE.exec(message);
  if (tagMatch) {
    const u = tagMatch[1].trim();
    if (u && u !== "anon") return u;
  }
  const labels = metadata?.labels;
  if (labels && typeof labels.userId === "string") return labels.userId;
  return null;
}

function entryTimeMs(metadata: any): number {
  const ts = metadata?.timestamp;
  if (!ts) return Date.now();
  if (typeof ts === "string") return new Date(ts).getTime();
  if (typeof ts === "object" && ts.seconds !== undefined) {
    const secs = typeof ts.seconds === "number" ? ts.seconds : Number(ts.seconds);
    const nanos = typeof ts.nanos === "number" ? ts.nanos : 0;
    return secs * 1000 + Math.floor(nanos / 1_000_000);
  }
  return Date.now();
}

function isErrorSeverity(severity: string): boolean {
  const s = severity.toUpperCase();
  return s === "ERROR" || s === "CRITICAL" || s === "ALERT" || s === "EMERGENCY";
}

function buildLogsUrl(
  projectId: string,
  functionLabel: string,
  errorType: string,
  sinceIso: string
): string {
  // Match on the resource type and a fragment of the sample so the console
  // filters to approximately the same group. Best-effort; the operator can
  // refine in the console.
  const isApiRoute = functionLabel.startsWith("api ");
  const clauses: string[] = ["severity>=WARNING"];
  if (isApiRoute) {
    const parts = functionLabel.split(" ");
    const route = parts.slice(2).join(" ");
    clauses.push("resource.labels.service_name=\"api\"");
    clauses.push(`httpRequest.requestUrl:"${route}"`);
  } else if (functionLabel === "api") {
    clauses.push("resource.labels.service_name=\"api\"");
  } else {
    clauses.push(`resource.labels.function_name="${functionLabel}"`);
  }
  if (errorType && errorType !== "WARNING" && errorType !== "ERROR") {
    clauses.push(`textPayload:"${errorType}"`);
  }
  const query = clauses.join(" AND ");
  const encoded = encodeURIComponent(query);
  const timeEncoded = encodeURIComponent(sinceIso);
  return (
    `https://console.cloud.google.com/logs/query;` +
    `query=${encoded};` +
    `startTime=${timeEncoded}?project=${projectId}`
  );
}

function buildOverallLogsUrl(projectId: string, sinceIso: string): string {
  const query =
    "severity>=WARNING AND " +
    "(resource.type=\"cloud_function\" OR resource.type=\"cloud_run_revision\")";
  return (
    `https://console.cloud.google.com/logs/query;` +
    `query=${encodeURIComponent(query)};` +
    `startTime=${encodeURIComponent(sinceIso)}?project=${projectId}`
  );
}

async function fetchRecentDeploys(
  logging: Logging,
  projectId: string,
  sinceIso: string
): Promise<DeployEvent[]> {
  // Exact logName matches are dramatically faster than substring scans.
  const logNames = [
    `projects/${projectId}/logs/cloudaudit.googleapis.com%2Factivity`,
    `projects/${projectId}/logs/cloudaudit.googleapis.com%2Fsystem_event`,
  ]
    .map((n) => `"${n}"`)
    .join(" OR ");

  const filter = [
    `timestamp >= "${sinceIso}"`,
    `logName=(${logNames})`,
    "protoPayload.methodName:(\"UpdateFunction\" OR \"CreateFunction\" OR \"CreateVersion\" OR \"CreateRelease\")",
  ].join(" AND ");

  try {
    const [entries] = await logging.getEntries({
      filter,
      orderBy: "timestamp desc",
      pageSize: 50,
      gaxOptions: {timeout: 15_000},
    });
    const deploys: DeployEvent[] = [];
    for (const entry of entries) {
      const metadata: any = entry.metadata;
      const payload: any = entry.data;
      const method = String(payload?.methodName || "");
      const resource = String(payload?.resourceName || "");
      let kind = "deploy";
      if (method.includes("Function")) kind = "functions";
      else if (method.includes("Version") || method.includes("Release")) kind = "hosting";
      deploys.push({
        timeMs: entryTimeMs(metadata),
        kind,
        resource: resource.split("/").pop() || resource,
      });
    }
    return deploys;
  } catch (err) {
    functions.logger.warn("wake-logs-digest: deploy audit query failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}

function summarizeDeploys(deploys: DeployEvent[]): string[] {
  if (deploys.length === 0) return [];
  const byKind = new Map<string, DeployEvent[]>();
  for (const d of deploys) {
    const arr = byKind.get(d.kind) ?? [];
    arr.push(d);
    byKind.set(d.kind, arr);
  }
  const lines: string[] = [];
  for (const [kind, arr] of byKind) {
    arr.sort((a, b) => a.timeMs - b.timeMs);
    const first = hhmm(arr[0].timeMs);
    const last = hhmm(arr[arr.length - 1].timeMs);
    const window = first === last ? first : `${first}–${last}`;
    lines.push(`• ${kind}: ${arr.length} (${window})`);
  }
  return lines;
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
  });

  functions.logger.info("wake-logs-digest: fetched main", {count: entries.length});

  // Deploys query runs after the main query so it cannot starve it.
  // fetchRecentDeploys swallows its own errors, including its internal timeout.
  const deploys = await fetchRecentDeploys(logging, projectId, since);

  functions.logger.info("wake-logs-digest: fetched deploys", {count: deploys.length});

  if (entries.length === 0) {
    const deployLines = summarizeDeploys(deploys);
    const body = [
      `[wake-logs-digest] ${todayKey} · prod`,
      "",
      "No warnings or errors in the last 24h. All quiet.",
    ];
    if (deployLines.length > 0) {
      body.push("", "Deploys in window:", ...deployLines);
    }
    await sendTelegram(botToken, chatId, body.join("\n"));
    return;
  }

  const perFp = new Map<string, AggregatedError>();
  let totalErrors = 0;
  let totalWarns = 0;

  for (const entry of entries) {
    const metadata: any = entry.metadata;
    const rawFunctionName = extractFunctionName(metadata);
    const severity = String(metadata?.severity || "WARNING");
    const isErr = isErrorSeverity(severity);
    if (isErr) totalErrors += 1;
    else totalWarns += 1;

    const messageRaw = extractMessage(entry);
    if (!messageRaw) continue;

    const functionLabel = deriveFunctionLabel(rawFunctionName, metadata, messageRaw);
    const errorType = inferErrorType(messageRaw, severity);
    const fp = fingerprintError(functionLabel, errorType, messageRaw);
    const userId = extractUserId(messageRaw, metadata);
    const timeMs = entryTimeMs(metadata);

    const existing = perFp.get(fp);
    if (existing) {
      existing.count += 1;
      if (isErr) existing.errorCount += 1;
      else existing.warnCount += 1;
      if (userId) existing.userIds.add(userId);
      if (timeMs < existing.firstMs) existing.firstMs = timeMs;
      if (timeMs > existing.lastMs) existing.lastMs = timeMs;
    } else {
      const userIds = new Set<string>();
      if (userId) userIds.add(userId);
      perFp.set(fp, {
        fingerprint: fp,
        functionName: functionLabel,
        errorType,
        sampleMessage: normalizeForDisplay(messageRaw).slice(0, SAMPLE_LEN),
        count: 1,
        errorCount: isErr ? 1 : 0,
        warnCount: isErr ? 0 : 1,
        userIds,
        firstMs: timeMs,
        lastMs: timeMs,
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

  // Rank errors-first, then by count.
  const rankByImpact = (a: AggregatedError, b: AggregatedError): number => {
    if (b.errorCount !== a.errorCount) return b.errorCount - a.errorCount;
    return b.count - a.count;
  };
  newOnes.sort((a, b) => rankByImpact(a.entry, b.entry));
  spiking.sort(
    (a, b) =>
      b.entry.count / Math.max(b.avg, 1) -
      a.entry.count / Math.max(a.avg, 1)
  );
  baseline.sort((a, b) => rankByImpact(a.entry, b.entry));

  const formatEntry = (
    e: AggregatedError,
    extra?: string,
    withUrl = false
  ): string[] => {
    const severityTag =
      e.errorCount > 0 && e.warnCount > 0 ?
        `${e.errorCount} err, ${e.warnCount} warn` :
        e.errorCount > 0 ?
        `${e.errorCount} err` :
        `${e.warnCount} warn`;
    const users = e.userIds.size > 0 ? `, ${e.userIds.size} user${e.userIds.size === 1 ? "" : "s"}` : "";
    const timeRange =
      e.firstMs && e.lastMs && e.lastMs - e.firstMs < 30 * 60_000 ?
        `, burst ${hhmm(e.firstMs)}` :
        `, ${hhmm(e.firstMs)}–${hhmm(e.lastMs)}`;
    const suffix = extra ? `, ${extra}` : "";
    const head =
      `• ${e.functionName} — ${e.errorType}: ${e.sampleMessage} ` +
      `(${severityTag}${users}${timeRange}${suffix})`;
    const out = [head];
    if (withUrl) {
      out.push(`  ↳ ${buildLogsUrl(projectId, e.functionName, e.errorType, since)}`);
    }
    return out;
  };

  const lines: string[] = [];
  const headerParts = [
    `${entries.length} events`,
    `${totalErrors} err / ${totalWarns} warn`,
    `${newOnes.length} new`,
    `${spiking.length} spiking`,
  ];
  lines.push(`[wake-logs-digest] ${todayKey} · prod · ${headerParts.join(" · ")}`);

  const deployLines = summarizeDeploys(deploys);
  if (deployLines.length > 0) {
    lines.push("");
    lines.push("Deploys in window:");
    lines.push(...deployLines);
  }

  lines.push("");

  if (newOnes.length > 0) {
    lines.push("NEW");
    for (const s of newOnes.slice(0, MAX_LIST_WITH_URL)) {
      lines.push(...formatEntry(s.entry, undefined, true));
    }
    if (newOnes.length > MAX_LIST_WITH_URL) {
      lines.push(`  …and ${newOnes.length - MAX_LIST_WITH_URL} more`);
    }
    lines.push("");
  }

  if (spiking.length > 0) {
    lines.push("SPIKING (vs 7d avg)");
    for (const s of spiking.slice(0, MAX_LIST_WITH_URL)) {
      const pct = Math.round((s.entry.count / Math.max(s.avg, 1) - 1) * 100);
      lines.push(...formatEntry(s.entry, `avg ${s.avg.toFixed(1)}, +${pct}%`, true));
    }
    if (spiking.length > MAX_LIST_WITH_URL) {
      lines.push(`  …and ${spiking.length - MAX_LIST_WITH_URL} more`);
    }
    lines.push("");
  }

  if (baseline.length > 0) {
    lines.push(`BASELINE (top ${BASELINE_LIST})`);
    for (const s of baseline.slice(0, BASELINE_LIST)) {
      lines.push(...formatEntry(s.entry));
    }
    if (baseline.length > BASELINE_LIST) {
      lines.push(`  …and ${baseline.length - BASELINE_LIST} more recurring`);
    }
    lines.push("");
  }

  lines.push(`All logs: ${buildOverallLogsUrl(projectId, since)}`);

  let body = lines.join("\n").trim();
  if (body.length > TELEGRAM_MAX) {
    const marker = "\n…[truncated — open All logs URL for full view]";
    body = body.slice(0, TELEGRAM_MAX - marker.length) + marker;
  }

  await Promise.all([batch.commit(), sendTelegram(botToken, chatId, body)]);
}
