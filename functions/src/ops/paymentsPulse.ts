import * as admin from "firebase-admin";
import {GoogleAuth} from "google-auth-library";
import * as functions from "firebase-functions";
import {sendTo, type TopicMap} from "./telegram.js";
import {
  categoriseFingerprints,
  cutoffKey,
  last7DateKeys,
  bucketCountsLine,
  type CategoryBuckets,
} from "./stateTracker.js";

const LOGGING_SCOPE = "https://www.googleapis.com/auth/logging.read";
const QUERY_TIMEOUT_MS = 10_000;
const TELEGRAM_MAX = 4000;
const STATE_COLLECTION = "ops_payments_state";
const DAYS_TO_KEEP = 14;

const googleAuth = new GoogleAuth({scopes: [LOGGING_SCOPE]});

const MP_FUNCTIONS = [
  "createPaymentPreference",
  "createSubscriptionCheckout",
  "processPaymentWebhook",
  "updateSubscriptionStatus",
];

interface LogEntry {
  timestamp?: string;
  severity?: string;
  resource?: {labels?: {function_name?: string}};
  textPayload?: string;
  jsonPayload?: {message?: string; err?: unknown; error?: unknown};
}

interface FunctionStats {
  invocations: number;
  errors: number;
  warnings: number;
  hmacMismatches: number;
  signatureIssues: number;
}

// Each "signal" tracked for NEW/SPIKING state is a specific payment anomaly
// category, keyed by a stable fingerprint. This is deliberately coarse —
// we're tracking anomaly categories, not individual errors. Individual
// webhook errors are picked up by logsDigest.
interface PaymentSignalExtras {
  label: string;
  detail: string;
}

async function queryMpLogs(
  accessToken: string,
  projectId: string,
  sinceIso: string
): Promise<LogEntry[]> {
  const namesClause = MP_FUNCTIONS.map((n) => `"${n}"`).join(" OR ");
  const filter = [
    `timestamp >= "${sinceIso}"`,
    "resource.type=\"cloud_function\"",
    `resource.labels.function_name=(${namesClause})`,
  ].join(" AND ");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), QUERY_TIMEOUT_MS);
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
        pageSize: 1000,
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Logging API ${res.status}: ${body.slice(0, 200)}`);
    }
    const json: {entries?: LogEntry[]} = await res.json();
    return json.entries ?? [];
  } finally {
    clearTimeout(timer);
  }
}

function messageOf(entry: LogEntry): string {
  if (typeof entry.textPayload === "string") return entry.textPayload;
  const j = entry.jsonPayload;
  if (!j) return "";
  const msg = typeof j.message === "string" ? j.message : "";
  const err = j.err ?? j.error;
  const errText =
    typeof err === "string" ?
      err :
      err && typeof err === "object" ?
        JSON.stringify(err).slice(0, 200) :
        "";
  return [msg, errText].filter(Boolean).join(": ");
}

function newStats(): FunctionStats {
  return {
    invocations: 0,
    errors: 0,
    warnings: 0,
    hmacMismatches: 0,
    signatureIssues: 0,
  };
}

function aggregateLogs(entries: LogEntry[]): Map<string, FunctionStats> {
  const perFn = new Map<string, FunctionStats>();
  for (const fn of MP_FUNCTIONS) perFn.set(fn, newStats());

  for (const e of entries) {
    const fn = e.resource?.labels?.function_name;
    if (!fn || !perFn.has(fn)) continue;
    const stats = perFn.get(fn) as FunctionStats;
    const sev = (e.severity || "").toUpperCase();
    const msg = messageOf(e);
    const lower = msg.toLowerCase();

    if (lower.includes("function execution started")) stats.invocations += 1;
    if (sev === "ERROR" || sev === "CRITICAL") stats.errors += 1;
    else if (sev === "WARNING") stats.warnings += 1;

    if (lower.includes("hmac")) stats.hmacMismatches += 1;
    else if (
      lower.includes("invalid signature") ||
      lower.includes("signature mismatch") ||
      lower.includes("signature validation")
    ) {
      stats.signatureIssues += 1;
    }
  }
  return perFn;
}

async function countSubscriptionChanges(
  sinceMs: number
): Promise<{authorized: number; cancelled: number; paused: number; other: number; total: number}> {
  const db = admin.firestore();
  const snap = await db
    .collectionGroup("subscriptions")
    .where("updated_at", ">=", admin.firestore.Timestamp.fromMillis(sinceMs))
    .get();

  let authorized = 0;
  let cancelled = 0;
  let paused = 0;
  let other = 0;
  for (const doc of snap.docs) {
    const status = String(doc.get("status") || "").toLowerCase();
    if (status === "authorized") authorized += 1;
    else if (status === "cancelled") cancelled += 1;
    else if (status === "paused") paused += 1;
    else other += 1;
  }
  return {authorized, cancelled, paused, other, total: snap.size};
}

async function countProcessedPayments(
  sinceMs: number
): Promise<{approved: number; errors: number; other: number; total: number}> {
  const db = admin.firestore();
  const snap = await db
    .collection("processed_payments")
    .where("processed_at", ">=", admin.firestore.Timestamp.fromMillis(sinceMs))
    .get();

  let approved = 0;
  let errors = 0;
  let other = 0;
  for (const doc of snap.docs) {
    const status = String(doc.get("status") || "").toLowerCase();
    if (status === "approved") approved += 1;
    else if (status === "error") errors += 1;
    else other += 1;
  }
  return {approved, errors, other, total: snap.size};
}

// Build the "signal" set for state tracking. Each anomaly category is a
// stable fingerprint so NEW/SPIKING works across runs even as numbers
// fluctuate. Fingerprints are deliberately coarse — one per category.
function buildSignals(
  perFn: Map<string, FunctionStats>,
  subs: {cancelled: number; paused: number},
  pays: {errors: number}
): Array<{fingerprint: string; count: number; extras: PaymentSignalExtras}> {
  const signals: Array<{
    fingerprint: string;
    count: number;
    extras: PaymentSignalExtras;
  }> = [];

  for (const [fn, s] of perFn) {
    if (s.errors > 0) {
      signals.push({
        fingerprint: `mp:${fn}:errors`,
        count: s.errors,
        extras: {label: `${fn} errors`, detail: `${s.errors} error(s)`},
      });
    }
    if (s.hmacMismatches + s.signatureIssues > 0) {
      const n = s.hmacMismatches + s.signatureIssues;
      signals.push({
        fingerprint: `mp:${fn}:signature`,
        count: n,
        extras: {label: `${fn} signature issues`, detail: `${n} signature issue(s)`},
      });
    }
  }
  if (subs.cancelled > 0) {
    signals.push({
      fingerprint: "mp:subs:cancelled",
      count: subs.cancelled,
      extras: {label: "subs cancelled", detail: `${subs.cancelled} cancelled`},
    });
  }
  if (subs.paused > 0) {
    signals.push({
      fingerprint: "mp:subs:paused",
      count: subs.paused,
      extras: {label: "subs paused", detail: `${subs.paused} paused`},
    });
  }
  if (pays.errors > 0) {
    signals.push({
      fingerprint: "mp:payments:errors",
      count: pays.errors,
      extras: {
        label: "processed payments errored",
        detail: `${pays.errors} errored`,
      },
    });
  }
  return signals;
}

function formatBuckets(buckets: CategoryBuckets<PaymentSignalExtras>): string[] {
  const lines: string[] = [];
  const fmt = (s: {signal: {extras: PaymentSignalExtras; count: number}}) =>
    `• ${s.signal.extras.label} — ${s.signal.extras.detail}`;
  if (buckets.new.length > 0) {
    lines.push(`NEW (${buckets.new.length})`);
    for (const s of buckets.new) lines.push(fmt(s));
    lines.push("");
  }
  if (buckets.spiking.length > 0) {
    lines.push(`SPIKING vs 7d avg (${buckets.spiking.length})`);
    for (const s of buckets.spiking) {
      lines.push(
        `${fmt(s)} (avg ${s.priorAvg.toFixed(1)})`
      );
    }
    lines.push("");
  }
  if (buckets.recurring.length > 0) {
    lines.push(`RECURRING (${buckets.recurring.length})`);
    for (const s of buckets.recurring) lines.push(fmt(s));
    lines.push("");
  }
  if (buckets.chronic.length > 0) {
    lines.push(`CHRONIC (${buckets.chronic.length})`);
    for (const s of buckets.chronic) lines.push(fmt(s));
    lines.push("");
  }
  return lines;
}

export async function runPaymentsPulse(opts: {
  botToken: string;
  chatId: string;
  topics?: TopicMap;
  projectId: string;
}): Promise<void> {
  const {botToken, chatId, topics, projectId} = opts;
  const ctx = {botToken, chatId, topics};
  const now = Date.now();
  const nowDate = new Date(now);
  const sinceMs = now - 24 * 60 * 60 * 1000;
  const since = new Date(sinceMs).toISOString();
  const todayKey = nowDate.toISOString().slice(0, 10);

  const client = await googleAuth.getClient();
  const tokenRes = await client.getAccessToken();
  const accessToken = tokenRes.token;
  if (!accessToken) {
    throw new Error("failed to acquire access token for Logging API");
  }

  let entries: LogEntry[] = [];
  let logsError: string | null = null;
  try {
    entries = await queryMpLogs(accessToken, projectId, since);
  } catch (err) {
    logsError = err instanceof Error ? err.message : String(err);
    functions.logger.error("wake-payments-pulse: logs query failed", {
      error: logsError,
    });
  }

  const perFn = aggregateLogs(entries);

  let subs = {authorized: 0, cancelled: 0, paused: 0, other: 0, total: 0};
  let pays = {approved: 0, errors: 0, other: 0, total: 0};
  const firestoreErrors: string[] = [];
  try {
    subs = await countSubscriptionChanges(sinceMs);
  } catch (err) {
    firestoreErrors.push(
      "subscriptions: " + (err instanceof Error ? err.message : String(err))
    );
  }
  try {
    pays = await countProcessedPayments(sinceMs);
  } catch (err) {
    firestoreErrors.push(
      "processed_payments: " +
        (err instanceof Error ? err.message : String(err))
    );
  }

  const totalInvocations = [...perFn.values()].reduce(
    (a, s) => a + s.invocations,
    0
  );
  const totalErrors = [...perFn.values()].reduce((a, s) => a + s.errors, 0);
  const totalHmac = [...perFn.values()].reduce(
    (a, s) => a + s.hmacMismatches + s.signatureIssues,
    0
  );

  // NEW/SPIKING state tracking
  const signals = buildSignals(perFn, subs, pays);
  const db = admin.firestore();
  let buckets: CategoryBuckets<PaymentSignalExtras> = {
    new: [], spiking: [], recurring: [], chronic: [],
  };
  try {
    buckets = await categoriseFingerprints<PaymentSignalExtras>(db, {
      stateCollection: STATE_COLLECTION,
      todayKey,
      prior7Keys: last7DateKeys(nowDate),
      cutoffKey: cutoffKey(nowDate, DAYS_TO_KEEP),
      signals,
    });
  } catch (err) {
    functions.logger.warn("wake-payments-pulse: state tracking failed", {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  const header =
    `[wake-payments-pulse] ${todayKey} · 24h · ` +
    `${totalInvocations} calls · ${totalErrors} err · ` +
    `${pays.approved} paid · ${subs.total} sub chg · ` +
    bucketCountsLine(buckets);

  const lines: string[] = [header, ""];

  if (logsError) {
    lines.push(`Cloud Logging error: ${logsError.slice(0, 200)}`);
    lines.push("");
  }

  const bucketLines = formatBuckets(buckets);
  if (bucketLines.length > 0) {
    lines.push(...bucketLines);
  }

  lines.push("FUNCTIONS");
  for (const fn of MP_FUNCTIONS) {
    const s = perFn.get(fn) as FunctionStats;
    const parts = [
      `${s.invocations} calls`,
      `${s.errors} err`,
      `${s.warnings} warn`,
    ];
    const flags: string[] = [];
    if (s.hmacMismatches > 0) flags.push(`${s.hmacMismatches} HMAC`);
    if (s.signatureIssues > 0) flags.push(`${s.signatureIssues} sig`);
    const flagText = flags.length > 0 ? ` · ${flags.join(", ")}` : "";
    lines.push(`• ${fn} — ${parts.join(" · ")}${flagText}`);
  }

  lines.push("");
  lines.push("SUBSCRIPTIONS (changed in 24h)");
  lines.push(
    `• authorized ${subs.authorized} · cancelled ${subs.cancelled} · ` +
      `paused ${subs.paused} · other ${subs.other} · total ${subs.total}`
  );

  lines.push("");
  lines.push("PROCESSED PAYMENTS (24h)");
  lines.push(
    `• approved ${pays.approved} · error ${pays.errors} · ` +
      `other ${pays.other} · total ${pays.total}`
  );

  if (totalHmac > 0) {
    lines.push("");
    lines.push(
      `ALERT — ${totalHmac} webhook signature/HMAC issue` +
        `${totalHmac === 1 ? "" : "s"} in 24h`
    );
  }

  if (firestoreErrors.length > 0) {
    lines.push("");
    lines.push("Firestore query errors:");
    for (const e of firestoreErrors) lines.push(`• ${e.slice(0, 200)}`);
  }

  let body = lines.join("\n").trim();
  if (body.length > TELEGRAM_MAX) {
    body = body.slice(0, TELEGRAM_MAX - 20) + "\n…[truncated]";
  }
  await sendTo(ctx, "signals", body);
}
