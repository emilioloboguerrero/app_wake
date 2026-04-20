import {GoogleAuth} from "google-auth-library";
import * as functions from "firebase-functions";
import {sendTo, type TopicMap} from "./telegram.js";

const LOGGING_SCOPE = "https://www.googleapis.com/auth/logging.read";
const QUERY_TIMEOUT_MS = 10_000;
const TELEGRAM_MAX = 4000;

const googleAuth = new GoogleAuth({scopes: [LOGGING_SCOPE]});

// Expected cadence per scheduled function (minutes between runs).
// Staleness threshold is 3× this value — balances false positives on
// jittery schedulers against catching real outages. Keep in sync with
// the onSchedule declarations in functions/src/index.ts.
interface JobSpec {
  name: string;
  intervalMin: number;
  label: string; // human-readable cadence
}

const JOBS: JobSpec[] = [
  {name: "processRestTimerNotifications", intervalMin: 1, label: "every 1m"},
  {name: "processEmailQueue", intervalMin: 1, label: "every 1m"},
  {name: "sendCallReminders", intervalMin: 15, label: "every 15m"},
  {name: "detectAbandonedSessions", intervalMin: 360, label: "every 6h"},
  {name: "wakeHeartbeatCron", intervalMin: 360, label: "every 6h"},
  {name: "expandWeeklyAvailability", intervalMin: 1440, label: "daily 03:00"},
  {name: "cleanupVideoExchanges", intervalMin: 1440, label: "daily 04:00"},
  {name: "wakeDailyPulseCron", intervalMin: 1440, label: "daily 19:00"},
];

// Lookback of 14 days so we can report *when* a daily job last ran rather
// than just "no logs in lookback". Any job that hasn't run in 14 days is
// either disabled or the region/name has drifted — the message makes the
// difference explicit.
const LOOKBACK_MS = 14 * 24 * 60 * 60 * 1000;
const LOOKBACK_HOURS = Math.round(LOOKBACK_MS / 3_600_000);

interface LogEntry {
  timestamp?: string;
  resource?: {labels?: {service_name?: string}};
}

async function fetchLastRunForService(
  accessToken: string,
  projectId: string,
  serviceName: string,
  sinceIso: string
): Promise<number | null> {
  // Gen2 onSchedule deploys as a Cloud Run service whose name is the
  // lowercased export name.
  const filter = [
    `timestamp >= "${sinceIso}"`,
    "resource.type=\"cloud_run_revision\"",
    `resource.labels.service_name="${serviceName.toLowerCase()}"`,
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
        pageSize: 1,
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Logging API ${res.status}: ${body.slice(0, 200)}`);
    }
    const json: {entries?: LogEntry[]} = await res.json();
    const ts = json.entries?.[0]?.timestamp;
    return ts ? new Date(ts).getTime() : null;
  } finally {
    clearTimeout(timer);
  }
}

async function listLastRunPerService(
  accessToken: string,
  projectId: string,
  serviceNames: string[],
  sinceIso: string
): Promise<Map<string, number>> {
  // Query per-service in parallel. A single batched query sorted by timestamp
  // desc gets saturated by high-frequency jobs (every-1m services emit tens
  // of thousands of entries over the lookback), pushing daily cron logs out
  // of the result set and producing false "missing" alarms.
  const results = await Promise.all(
    serviceNames.map(async (name) => {
      const last = await fetchLastRunForService(
        accessToken,
        projectId,
        name,
        sinceIso
      );
      return [name.toLowerCase(), last] as const;
    })
  );
  const lastRun = new Map<string, number>();
  for (const [name, ms] of results) {
    if (ms !== null) lastRun.set(name, ms);
  }
  return lastRun;
}

function formatAge(ms: number): string {
  const min = Math.round(ms / 60_000);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 48) return `${hr}h ago`;
  const days = Math.round(hr / 24);
  return `${days}d ago`;
}

function formatIsoMinutes(ms: number): string {
  // 2026-04-18T19:00Z — minute precision is enough for cadence reasoning.
  return new Date(ms).toISOString().slice(0, 16) + "Z";
}

function formatCadence(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const hr = minutes / 60;
  if (hr < 24) return `${hr}h`;
  const days = hr / 24;
  return `${days}d`;
}

function logsLinkForService(projectId: string, serviceName: string): string {
  const q = encodeURIComponent(
    `resource.type="cloud_run_revision" resource.labels.service_name="${serviceName.toLowerCase()}"`
  );
  return `https://console.cloud.google.com/logs/query?project=${projectId}&q=${q}`;
}

export async function runCronHeartbeat(opts: {
  botToken: string;
  chatId: string;
  topics?: TopicMap;
  projectId: string;
}): Promise<void> {
  const {botToken, chatId, topics, projectId} = opts;
  const ctx = {botToken, chatId, topics};
  const now = Date.now();
  const since = new Date(now - LOOKBACK_MS).toISOString();
  const today = new Date(now).toISOString().slice(0, 10);

  const client = await googleAuth.getClient();
  const tokenRes = await client.getAccessToken();
  const accessToken = tokenRes.token;
  if (!accessToken) {
    throw new Error("failed to acquire access token for Logging API");
  }

  let lastRun: Map<string, number>;
  try {
    lastRun = await listLastRunPerService(
      accessToken,
      projectId,
      JOBS.map((j) => j.name),
      since
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    functions.logger.error("wake-cron-heartbeat: query failed", {error: msg});
    await sendTo(
      ctx,
      "signals",
      `[wake-cron-heartbeat] ${today}\n\nLogging API error: ${msg.slice(0, 200)}`
    );
    return;
  }

  interface StaleRow {
    job: JobSpec;
    lastMs: number | null;
    ageMs: number | null;
    thresholdMs: number;
    overBy: number | null; // ratio of age to threshold (>1 = stale)
  }
  const stale: StaleRow[] = [];
  const healthy: Array<{job: JobSpec; ageMs: number; lastMs: number}> = [];

  for (const job of JOBS) {
    const last = lastRun.get(job.name.toLowerCase());
    const thresholdMs = job.intervalMin * 60_000 * 3;
    if (!last) {
      stale.push({job, lastMs: null, ageMs: null, thresholdMs, overBy: null});
      continue;
    }
    const age = now - last;
    if (age > thresholdMs) {
      stale.push({
        job,
        lastMs: last,
        ageMs: age,
        thresholdMs,
        overBy: age / thresholdMs,
      });
    } else {
      healthy.push({job, ageMs: age, lastMs: last});
    }
  }

  const lines: string[] = [];
  const staleMark = stale.length > 0 ? `${stale.length} STALE` : "all healthy";
  lines.push(
    `[wake-cron-heartbeat] ${today} · ${JOBS.length} jobs · ${staleMark} · lookback ${LOOKBACK_HOURS}h`
  );
  lines.push("");

  if (stale.length > 0) {
    lines.push("STALE");
    for (const s of stale) {
      const threshold = formatCadence(s.thresholdMs / 60_000);
      if (s.lastMs === null || s.ageMs === null) {
        // Truly never seen in 14 days — distinct from "ran N days ago but
        // still stale", because it suggests the job is disabled / renamed.
        lines.push(
          `• ${s.job.name} (${s.job.label}) — never seen in last ${LOOKBACK_HOURS}h ` +
            `(threshold ${threshold}) [missing]`
        );
      } else {
        const over = s.overBy ? `${s.overBy.toFixed(1)}× cadence` : "stale";
        lines.push(
          `• ${s.job.name} (${s.job.label}) — last ${formatIsoMinutes(s.lastMs)} ` +
            `(${formatAge(s.ageMs)}, ${over}, threshold ${threshold})`
        );
      }
      lines.push(`  ↳ ${logsLinkForService(projectId, s.job.name)}`);
    }
    lines.push("");
  }

  lines.push("HEALTHY");
  for (const h of healthy) {
    lines.push(
      `• ${h.job.name} (${h.job.label}) — last ${formatIsoMinutes(h.lastMs)} (${formatAge(h.ageMs)})`
    );
  }

  let body = lines.join("\n").trim();
  if (body.length > TELEGRAM_MAX) {
    body = body.slice(0, TELEGRAM_MAX - 20) + "\n…[truncated]";
  }
  await sendTo(ctx, "signals", body);
}
