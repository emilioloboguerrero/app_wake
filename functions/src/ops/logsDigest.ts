import * as admin from "firebase-admin";
import {GoogleAuth} from "google-auth-library";
import * as functions from "firebase-functions";
import {fingerprintError, normalizeForDisplay} from "./fingerprint.js";
import {sendTelegram} from "./telegram.js";

const STATE_COLLECTION = "ops_logs_state";
const DAYS_TO_KEEP = 14;
const SAMPLE_LEN = 220;
const TELEGRAM_MAX = 4000;
const QUERY_TIMEOUT_MS = 10_000;
const LOGGING_PAGE_SIZE = 1000;
const LOGGING_SCOPE = "https://www.googleapis.com/auth/logging.read";

const googleAuth = new GoogleAuth({scopes: [LOGGING_SCOPE]});

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

function formatErr(err: any): string {
  if (!err) return "";
  if (typeof err === "string") return err;
  if (typeof err !== "object") return String(err);
  if (typeof err.stack === "string") return err.stack;
  if (typeof err.message === "string") return err.message;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

function extractMessage(entry: any): string {
  if (typeof entry.textPayload === "string") return entry.textPayload;

  const j = entry.jsonPayload;
  if (j && typeof j === "object") {
    const msg = typeof j.message === "string" ? j.message : "";
    const errText = formatErr(j.err ?? j.error);
    if (msg && errText && !errText.includes(msg)) return `${msg}: ${errText}`;
    if (errText) return errText;
    if (msg) return msg;
    try {
      return JSON.stringify(j);
    } catch {
      return String(j);
    }
  }

  const p = entry.protoPayload;
  if (p && typeof p === "object") {
    try {
      return JSON.stringify(p).slice(0, 500);
    } catch {
      return String(p);
    }
  }

  // Cloud Run request logs: no textPayload/jsonPayload, but httpRequest
  // carries everything we need (status, method, path).
  const hr = entry.httpRequest;
  if (hr && hr.requestUrl && hr.requestMethod) {
    const status = hr.status ?? "?";
    const method = String(hr.requestMethod).toUpperCase();
    try {
      const url = new URL(hr.requestUrl);
      return `HTTP ${status} ${method} ${url.pathname}`;
    } catch {
      return `HTTP ${status} ${method} ${hr.requestUrl}`;
    }
  }

  return "";
}

// Reduce a raw error+stack to one line: "<header> @ <app-frame>".
// Frames inside node_modules are dropped; the first app frame (under
// /workspace/lib/) is kept so the digest points to our code, not the framework.
function condenseStack(raw: string): string {
  if (!raw) return raw;
  const lines = raw.split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return raw;
  const header = lines[0].replace(/^Error:\s*Error:\s*/, "Error: ");
  let appFrame = "";
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.startsWith("at ")) continue;
    if (line.includes("node_modules")) continue;
    if (!line.includes("/workspace/")) continue;
    const m = /\/workspace\/(?:lib\/)?([^\s)]+)/.exec(line);
    appFrame = m ? m[1] : line.replace(/^at\s+/, "").replace(/\/workspace\//, "");
    break;
  }
  return appFrame ? `${header} @ ${appFrame}` : header;
}

function extractFunctionName(entry: any): string {
  const labels = entry?.resource?.labels || {};
  return (
    labels.function_name ||
    labels.service_name ||
    labels.cloud_function_name ||
    entry?.resource?.type ||
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

function extractRouteFromHttpRequest(entry: any): {method: string; route: string; status?: number} | null {
  const hr = entry?.httpRequest;
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
  entry: any,
  message: string
): string {
  if (rawFunctionName !== "api") return rawFunctionName;
  const fromHttp = extractRouteFromHttpRequest(entry);
  if (fromHttp) return `api ${fromHttp.method} ${fromHttp.route}`;
  const fromMsg = extractRouteFromMessage(message);
  if (fromMsg) return `api ${fromMsg.method} ${fromMsg.route}`;
  return "api";
}

function extractUserId(message: string, entry: any): string | null {
  const tagMatch = USER_TAG_RE.exec(message);
  if (tagMatch) {
    const u = tagMatch[1].trim();
    if (u && u !== "anon") return u;
  }
  const labels = entry?.labels;
  if (labels && typeof labels.userId === "string") return labels.userId;
  return null;
}

function entryTimeMs(entry: any): number {
  const ts = entry?.timestamp;
  if (typeof ts === "string") return new Date(ts).getTime();
  return Date.now();
}

function isErrorSeverity(severity: string): boolean {
  const s = severity.toUpperCase();
  return s === "ERROR" || s === "CRITICAL" || s === "ALERT" || s === "EMERGENCY";
}

async function listLogEntries(
  accessToken: string,
  projectId: string,
  filter: string,
  timeoutMs: number
): Promise<any[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch("https://logging.googleapis.com/v2/entries:list", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        resourceNames: [`projects/${projectId}`],
        filter,
        orderBy: "timestamp desc",
        pageSize: LOGGING_PAGE_SIZE,
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Logging API ${res.status}: ${body.slice(0, 200)}`);
    }
    const json: any = await res.json();
    return Array.isArray(json.entries) ? json.entries : [];
  } finally {
    clearTimeout(timer);
  }
}

async function fetchRecentDeploys(
  accessToken: string,
  projectId: string,
  sinceIso: string
): Promise<DeployEvent[]> {
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
    const entries = await listLogEntries(accessToken, projectId, filter, QUERY_TIMEOUT_MS);
    const deploys: DeployEvent[] = [];
    for (const entry of entries) {
      const payload: any = entry.protoPayload || {};
      const method = String(payload?.methodName || "");
      const resource = String(payload?.resourceName || "");
      let kind = "deploy";
      if (method.includes("Function")) kind = "functions";
      else if (method.includes("Version") || method.includes("Release")) kind = "hosting";
      deploys.push({
        timeMs: entryTimeMs(entry),
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

// One `firebase deploy --only functions` updates ~20 functions, each emitting
// its own audit event. Cluster events of the same kind within a 5-minute
// window into a single "deploy" so the digest reflects user actions.
const DEPLOY_CLUSTER_WINDOW_MS = 5 * 60_000;

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
    const clusters: {start: number; end: number; count: number}[] = [];
    for (const d of arr) {
      const last = clusters[clusters.length - 1];
      if (last && d.timeMs - last.end < DEPLOY_CLUSTER_WINDOW_MS) {
        last.end = d.timeMs;
        last.count += 1;
      } else {
        clusters.push({start: d.timeMs, end: d.timeMs, count: 1});
      }
    }
    const times = clusters.map((c) => hhmm(c.start)).join(", ");
    const noun = clusters.length === 1 ? "deploy" : "deploys";
    lines.push(`• ${kind}: ${clusters.length} ${noun} (${times})`);
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

  const tokenStart = Date.now();
  const client = await googleAuth.getClient();
  const tokenRes = await client.getAccessToken();
  const accessToken = tokenRes.token;
  if (!accessToken) {
    throw new Error("failed to acquire access token for Logging API");
  }
  functions.logger.info("wake-logs-digest: token", {ms: Date.now() - tokenStart});

  let entries: any[];
  const queryStart = Date.now();
  try {
    entries = await listLogEntries(accessToken, projectId, filter, QUERY_TIMEOUT_MS);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const isAbort = err instanceof Error && err.name === "AbortError";
    functions.logger.error("wake-logs-digest: main query failed", {error: msg});
    const fallback = [
      `[wake-logs-digest] ${todayKey} · prod`,
      "",
      isAbort ?
        `Logging API did not respond within ${QUERY_TIMEOUT_MS / 1000}s.` :
        `Logging API error: ${msg.slice(0, 200)}`,
    ].join("\n");
    await sendTelegram(botToken, chatId, fallback);
    return;
  }
  functions.logger.info("wake-logs-digest: fetched main", {
    count: entries.length,
    ms: Date.now() - queryStart,
  });

  const deploys = await fetchRecentDeploys(accessToken, projectId, since);
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
    const rawFunctionName = extractFunctionName(entry);
    const severity = String(entry?.severity || "WARNING");
    const isErr = isErrorSeverity(severity);
    if (isErr) totalErrors += 1;
    else totalWarns += 1;

    const messageRaw = extractMessage(entry);
    if (!messageRaw) continue;

    const functionLabel = deriveFunctionLabel(rawFunctionName, entry, messageRaw);
    const errorType = inferErrorType(messageRaw, severity);
    const fp = fingerprintError(functionLabel, errorType, messageRaw);
    const userId = extractUserId(messageRaw, entry);
    const timeMs = entryTimeMs(entry);

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
        sampleMessage: normalizeForDisplay(condenseStack(messageRaw)).slice(0, SAMPLE_LEN),
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

  const formatEntry = (e: AggregatedError, extra?: string): string => {
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
    // Drop the "ErrorType:" prefix when the sample already begins with it.
    const sample = e.sampleMessage;
    const prefix =
      sample.toLowerCase().startsWith(`${e.errorType.toLowerCase()}:`) ?
        "" :
        `${e.errorType}: `;
    return (
      `• ${e.functionName} — ${prefix}${sample} ` +
      `(${severityTag}${users}${timeRange}${suffix})`
    );
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
    lines.push(`NEW (${newOnes.length})`);
    for (const s of newOnes) {
      lines.push(formatEntry(s.entry));
    }
    lines.push("");
  }

  if (spiking.length > 0) {
    lines.push(`SPIKING vs 7d avg (${spiking.length})`);
    for (const s of spiking) {
      const pct = Math.round((s.entry.count / Math.max(s.avg, 1) - 1) * 100);
      lines.push(formatEntry(s.entry, `avg ${s.avg.toFixed(1)}, +${pct}%`));
    }
    lines.push("");
  }

  if (baseline.length > 0) {
    lines.push(`RECURRING (${baseline.length})`);
    for (const s of baseline) {
      lines.push(formatEntry(s.entry));
    }
    lines.push("");
  }

  let body = lines.join("\n").trim();
  if (body.length > TELEGRAM_MAX) {
    const marker = "\n…[truncated]";
    body = body.slice(0, TELEGRAM_MAX - marker.length) + marker;
  }

  await Promise.all([batch.commit(), sendTelegram(botToken, chatId, body)]);
}
