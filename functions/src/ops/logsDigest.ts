import * as admin from "firebase-admin";
import {GoogleAuth} from "google-auth-library";
import * as functions from "firebase-functions";
import {fingerprintError, normalizeForDisplay} from "./fingerprint.js";
import {sendTo, type TopicMap} from "./telegram.js";

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
  reportedAt?: admin.firestore.Timestamp;
  countsByDay: {[date: string]: number};
}

type IpClass = "google-crawler" | "other";

type EventCategory =
  | "bot-probe"
  | "auth-expiry"
  | "broken-internal-link"
  | "server-error"
  | "client-error"
  | "other";

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
  category: EventCategory;
  remoteIps: Map<string, number>;
  ipClasses: Map<IpClass, number>;
  userAgents: Map<string, number>;
  referers: Map<string, number>;
  statuses: Set<number>;
  paths: Set<string>;
  sampleTrace: string;
  sampleInsertId: string;
}

interface DeployEvent {
  timeMs: number;
  kind: string;
  resource: string;
}

const ERROR_TYPE_NAMES = [
  "Error",
  "TypeError",
  "RangeError",
  "SyntaxError",
  "ReferenceError",
  "ValidationError",
  "FirebaseError",
  "DeadlineExceeded",
  "PermissionDenied",
  "NotFound",
  "Unauthenticated",
  "ResourceExhausted",
  "FailedPrecondition",
];
const ERROR_TYPE_RE = new RegExp(`\\b(${ERROR_TYPE_NAMES.join("|")})\\b`);
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

  // Cloud Run request logs: no textPayload/jsonPayload. The route is already
  // captured in the functionLabel (via httpRequest.requestUrl), so the sample
  // only needs status + method.
  const hr = entry.httpRequest;
  if (hr && hr.requestMethod) {
    const status = hr.status ?? "?";
    const method = String(hr.requestMethod).toUpperCase();
    return `HTTP ${status} ${method}`;
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

// IP ranges we see often enough that classifying them improves signal/noise.
// Not exhaustive — extend as new crawler/cloud ranges surface. Match on
// leading octets; skips the cost of a real CIDR library.
const GOOGLE_IP_PREFIXES = [
  "66.249.",
  "66.102.",
  "74.125.",
  "142.250.",
  "172.217.",
  "192.178.",
  "216.58.",
];

function classifyIp(ip: string | undefined): IpClass {
  if (!ip) return "other";
  for (const p of GOOGLE_IP_PREFIXES) {
    if (ip.startsWith(p)) return "google-crawler";
  }
  return "other";
}

const BOT_PROBE_PATH_PATTERNS = [
  /\.(env|git|php|aspx?|ini|bak|swp|ds_store)(\b|$|\?)/i,
  /\/wp-(admin|login|content|includes)/i,
  /\/\.well-known\//i,
  /\/phpmyadmin|\/administrator/i,
  /\/\.aws|\/\.ssh/i,
];

function isBotProbePath(route: string): boolean {
  return BOT_PROBE_PATH_PATTERNS.some((re) => re.test(route));
}

function categorizeEvent(opts: {
  isErr: boolean;
  status?: number;
  route?: string;
  referer?: string;
}): EventCategory {
  const {isErr, status, route = "", referer = ""} = opts;
  if (status && status >= 500) return "server-error";
  if (isErr) return "server-error";
  if (isBotProbePath(route)) return "bot-probe";
  if (status === 401) return "auth-expiry";
  if (status === 404 && /wakelab\.co/i.test(referer)) {
    return "broken-internal-link";
  }
  if (status && status >= 400 && status < 500) return "client-error";
  return "other";
}

interface RequestMeta {
  ip?: string;
  ua?: string;
  referer?: string;
  trace?: string;
  insertId?: string;
  status?: number;
  route?: string;
  method?: string;
}

function extractRequestMeta(entry: any): RequestMeta {
  const hr = entry?.httpRequest || {};
  let route: string | undefined;
  let method: string | undefined;
  if (typeof hr.requestUrl === "string") {
    try {
      route = normalizeRoute(new URL(hr.requestUrl).pathname);
    } catch {
      // requestUrl occasionally isn't a valid absolute URL; drop it
    }
  }
  if (hr.requestMethod) method = String(hr.requestMethod).toUpperCase();
  const rawTrace = typeof entry?.trace === "string" ? entry.trace : "";
  const traceId = rawTrace ? rawTrace.split("/").pop() : undefined;
  return {
    ip: typeof hr.remoteIp === "string" ? hr.remoteIp : undefined,
    ua: typeof hr.userAgent === "string" ? hr.userAgent : undefined,
    referer: typeof hr.referer === "string" ? hr.referer : undefined,
    trace: traceId,
    insertId: typeof entry?.insertId === "string" ? entry.insertId : undefined,
    status: typeof hr.status === "number" ? hr.status : undefined,
    route,
    method,
  };
}

// Condense a UA string to one recognizable token. Full UAs blow the telegram
// budget and all we need is the category: "Googlebot" vs "iOS Safari" vs "curl".
function shortUserAgent(ua: string): string {
  if (/Googlebot|Google-Site-Verification/i.test(ua)) return "Googlebot";
  if (/bingbot/i.test(ua)) return "Bingbot";
  if (/DuckDuckBot/i.test(ua)) return "DuckDuckBot";
  if (/curl\//i.test(ua)) return "curl";
  if (/python-requests|python\//i.test(ua)) return "python";
  if (/Go-http-client/i.test(ua)) return "Go";
  if (/bot|crawler|spider/i.test(ua)) return "bot/other";
  if (/iPhone|iPad/.test(ua)) return /Safari/.test(ua) ? "iOS Safari" : "iOS";
  if (/Android/.test(ua)) return "Android";
  if (/Edg\//.test(ua)) return "Edge";
  if (/Chrome/.test(ua)) return "Chrome";
  if (/Firefox/.test(ua)) return "Firefox";
  if (/Safari/.test(ua)) return "Safari";
  return ua.slice(0, 30);
}

function shortReferer(ref: string): string {
  try {
    const u = new URL(ref);
    const s = u.host + u.pathname;
    return s.length > 50 ? s.slice(0, 50) + "…" : s;
  } catch {
    return ref.length > 50 ? ref.slice(0, 50) + "…" : ref;
  }
}

function deepLinkForTrace(projectId: string, trace: string): string {
  const q = encodeURIComponent(
    `trace="projects/${projectId}/traces/${trace}"`
  );
  return `https://console.cloud.google.com/logs/query?project=${projectId}&q=${q}`;
}

function deepLinkForInsertId(projectId: string, insertId: string): string {
  const q = encodeURIComponent(`insertId="${insertId}"`);
  return `https://console.cloud.google.com/logs/query?project=${projectId}&q=${q}`;
}

function topN<K>(m: Map<K, number>, n: number): K[] {
  return [...m.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([k]) => k);
}

function bumpMap<K>(m: Map<K, number>, key: K | undefined): void {
  if (key === undefined) return;
  m.set(key, (m.get(key) ?? 0) + 1);
}

// Synthetic fingerprint — all bot probes across all paths collapse to this
// single bucket so .env / .git / wp-admin / etc. don't each occupy a NEW slot.
const BOT_PROBE_FINGERPRINT = "bot-probes-aggregate";

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
  topics?: TopicMap;
  projectId: string;
}): Promise<void> {
  const {botToken, chatId, topics, projectId} = opts;
  const ctx = {botToken, chatId, topics};
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
    await sendTo(ctx, "signals", fallback);
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
    await sendTo(ctx, "signals", body.join("\n"));
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

    const meta = extractRequestMeta(entry);
    const ipClass = classifyIp(meta.ip);
    const category = categorizeEvent({
      isErr,
      status: meta.status,
      route: meta.route,
      referer: meta.referer,
    });

    // Collapse all bot-probes into one synthetic fingerprint so a burst of
    // .env / wp-admin / .git scans doesn't flood NEW.
    const isBotProbe = category === "bot-probe";
    const functionLabel = isBotProbe ?
      "bot-probes" :
      deriveFunctionLabel(rawFunctionName, entry, messageRaw);
    const errorType = inferErrorType(messageRaw, severity);
    const fp = isBotProbe ?
      BOT_PROBE_FINGERPRINT :
      fingerprintError(functionLabel, errorType, messageRaw);
    const userId = extractUserId(messageRaw, entry);
    const timeMs = entryTimeMs(entry);
    const uaShort = meta.ua ? shortUserAgent(meta.ua) : undefined;
    const refShort = meta.referer ? shortReferer(meta.referer) : undefined;

    const existing = perFp.get(fp);
    if (existing) {
      existing.count += 1;
      if (isErr) existing.errorCount += 1;
      else existing.warnCount += 1;
      if (userId) existing.userIds.add(userId);
      if (timeMs < existing.firstMs) existing.firstMs = timeMs;
      if (timeMs > existing.lastMs) existing.lastMs = timeMs;
      bumpMap(existing.remoteIps, meta.ip);
      bumpMap(existing.ipClasses, ipClass);
      bumpMap(existing.userAgents, uaShort);
      bumpMap(existing.referers, refShort);
      if (meta.status !== undefined) existing.statuses.add(meta.status);
      if (meta.route) existing.paths.add(meta.route);
      // Keep the earliest sample's trace/insertId for the deep-link.
    } else {
      const userIds = new Set<string>();
      if (userId) userIds.add(userId);
      const remoteIps = new Map<string, number>();
      bumpMap(remoteIps, meta.ip);
      const ipClasses = new Map<IpClass, number>();
      bumpMap(ipClasses, ipClass);
      const userAgents = new Map<string, number>();
      bumpMap(userAgents, uaShort);
      const referers = new Map<string, number>();
      bumpMap(referers, refShort);
      const statuses = new Set<number>();
      if (meta.status !== undefined) statuses.add(meta.status);
      const paths = new Set<string>();
      if (meta.route) paths.add(meta.route);
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
        category,
        remoteIps,
        ipClasses,
        userAgents,
        referers,
        statuses,
        paths,
        sampleTrace: meta.trace ?? "",
        sampleInsertId: meta.insertId ?? "",
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
  const recurring: Array<{entry: AggregatedError}> = [];
  const chronic: Array<{entry: AggregatedError}> = [];

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

    // NEW: never reported before. Once a digest reports a fingerprint, we
    // stamp reportedAt and it becomes RECURRING/CHRONIC/SPIKING from then on.
    const isNew = !existing?.reportedAt;
    const isSpiking =
      !isNew && priorAvg > 0 && agg.count >= Math.max(5, 2 * priorAvg);
    const firstSeenMs = existing?.firstSeen.toMillis() ?? now;
    const isChronic = firstSeenMs < now - 86_400_000;

    if (isNew) {
      newOnes.push({entry: agg});
    } else if (isSpiking) {
      spiking.push({entry: agg, avg: priorAvg});
    } else if (isChronic) {
      chronic.push({entry: agg});
    } else {
      recurring.push({entry: agg});
    }

    const updated: StateDoc = {
      functionName: agg.functionName,
      errorType: agg.errorType,
      sampleMessage: agg.sampleMessage,
      firstSeen: existing?.firstSeen ?? nowTs,
      lastSeen: nowTs,
      reportedAt: existing?.reportedAt ?? nowTs,
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
  recurring.sort((a, b) => rankByImpact(a.entry, b.entry));
  chronic.sort((a, b) => rankByImpact(a.entry, b.entry));

  const categoryTag: Record<EventCategory, string> = {
    "bot-probe": "[noise]",
    "auth-expiry": "[auth]",
    "broken-internal-link": "[actionable]",
    "server-error": "[server]",
    "client-error": "",
    "other": "",
  };

  const formatEntry = (
    e: AggregatedError,
    opts: {extra?: string; rich: boolean}
  ): string => {
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
    const suffix = opts.extra ? `, ${opts.extra}` : "";
    const tag = categoryTag[e.category] ? ` ${categoryTag[e.category]}` : "";

    // Bot-probe meta-entry renders as a single compact summary line instead of
    // the usual "ErrorType: sample" format — paths is what's meaningful.
    if (e.fingerprint === BOT_PROBE_FINGERPRINT) {
      const pathSample = [...e.paths].slice(0, 3).join(", ");
      const pathMore = e.paths.size > 3 ? ` +${e.paths.size - 3} more` : "";
      const ipClassBreakdown = [...e.ipClasses.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([k, v]) => `${v} ${k}`)
        .join(", ");
      return (
        `• bot-probes — ${e.count} hits across ${e.paths.size} ` +
        `path${e.paths.size === 1 ? "" : "s"} (${pathSample}${pathMore}), ` +
        `${e.remoteIps.size} IPs [${ipClassBreakdown}] ` +
        `(${severityTag}${timeRange}${suffix}) [noise]`
      );
    }

    // Drop the "ErrorType:" prefix when the sample already begins with it.
    const sample = e.sampleMessage;
    const prefix =
      sample.toLowerCase().startsWith(`${e.errorType.toLowerCase()}:`) ?
        "" :
        `${e.errorType}: `;

    const base =
      `• ${e.functionName} — ${prefix}${sample} ` +
      `(${severityTag}${users}${timeRange}${suffix})${tag}`;

    if (!opts.rich) return base;

    // Rich mode: append context line (IP class, UA, referer) and deep-link
    // only for NEW/SPIKING, where the extra bytes are worth the budget.
    const contextBits: string[] = [];
    const topIpClass = topN(e.ipClasses, 1)[0];
    if (topIpClass && topIpClass !== "other") {
      contextBits.push(`ip=${topIpClass}`);
    }
    const topUa = topN(e.userAgents, 1)[0];
    if (topUa) contextBits.push(`ua=${topUa}`);
    const topRef = topN(e.referers, 1)[0];
    if (topRef) contextBits.push(`ref=${topRef}`);

    const lines = [base];
    if (contextBits.length > 0) {
      lines.push(`  ↳ ${contextBits.join(" · ")}`);
    }
    if (e.sampleTrace) {
      lines.push(`  ↳ ${deepLinkForTrace(projectId, e.sampleTrace)}`);
    } else if (e.sampleInsertId) {
      lines.push(`  ↳ ${deepLinkForInsertId(projectId, e.sampleInsertId)}`);
    }
    return lines.join("\n");
  };

  const lines: string[] = [];
  const headerParts = [
    `${entries.length} events`,
    `${totalErrors} err / ${totalWarns} warn`,
    `${newOnes.length} new`,
    `${spiking.length} spiking`,
    `${recurring.length} recurring`,
    `${chronic.length} chronic`,
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
      lines.push(formatEntry(s.entry, {rich: true}));
    }
    lines.push("");
  }

  if (spiking.length > 0) {
    lines.push(`SPIKING vs 7d avg (${spiking.length})`);
    for (const s of spiking) {
      const pct = Math.round((s.entry.count / Math.max(s.avg, 1) - 1) * 100);
      lines.push(
        formatEntry(s.entry, {extra: `avg ${s.avg.toFixed(1)}, +${pct}%`, rich: true})
      );
    }
    lines.push("");
  }

  if (recurring.length > 0) {
    lines.push(`RECURRING — first seen in last 24h (${recurring.length})`);
    for (const s of recurring) {
      lines.push(formatEntry(s.entry, {rich: false}));
    }
    lines.push("");
  }

  if (chronic.length > 0) {
    lines.push(`CHRONIC — first seen earlier (${chronic.length})`);
    for (const s of chronic) {
      lines.push(formatEntry(s.entry, {rich: false}));
    }
    lines.push("");
  }

  let body = lines.join("\n").trim();
  if (body.length > TELEGRAM_MAX) {
    const marker = "\n…[truncated]";
    body = body.slice(0, TELEGRAM_MAX - marker.length) + marker;
  }

  await Promise.all([batch.commit(), sendTo(ctx, "signals", body)]);
}
