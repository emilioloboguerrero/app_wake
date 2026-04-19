import {GoogleAuth} from "google-auth-library";
import * as functions from "firebase-functions";
import {sendTelegram} from "./telegram.js";

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

const LOOKBACK_MS = 48 * 60 * 60 * 1000;

interface LogEntry {
  timestamp?: string;
  resource?: {labels?: {service_name?: string}};
}

async function listLastRunPerService(
  accessToken: string,
  projectId: string,
  serviceNames: string[],
  sinceIso: string
): Promise<Map<string, number>> {
  const servicesClause = serviceNames
    .map((n) => `"${n}"`)
    .join(" OR ");
  const filter = [
    `timestamp >= "${sinceIso}"`,
    "resource.type=\"cloud_run_revision\"",
    `resource.labels.service_name=(${servicesClause})`,
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
    const entries = json.entries ?? [];
    // Bucket max timestamp per service.
    const lastRun = new Map<string, number>();
    for (const e of entries) {
      const svc = e.resource?.labels?.service_name;
      const ts = e.timestamp;
      if (!svc || !ts) continue;
      const ms = new Date(ts).getTime();
      const prev = lastRun.get(svc) ?? 0;
      if (ms > prev) lastRun.set(svc, ms);
    }
    return lastRun;
  } finally {
    clearTimeout(timer);
  }
}

function formatAge(ms: number): string {
  const min = Math.round(ms / 60_000);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 48) return `${hr}h ago`;
  const days = Math.round(hr / 24);
  return `${days}d ago`;
}

export async function runCronHeartbeat(opts: {
  botToken: string;
  chatId: string;
  rawChatId?: string;
  projectId: string;
}): Promise<void> {
  const {botToken, chatId, projectId} = opts;
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
    await sendTelegram(
      botToken,
      chatId,
      `[wake-cron-heartbeat] ${today}\n\nLogging API error: ${msg.slice(0, 200)}`
    );
    return;
  }

  const stale: Array<{job: JobSpec; age: string; reason: string}> = [];
  const healthy: Array<{job: JobSpec; age: string}> = [];

  for (const job of JOBS) {
    const last = lastRun.get(job.name);
    const thresholdMs = job.intervalMin * 60_000 * 3;
    if (!last) {
      stale.push({
        job,
        age: `>${Math.round(LOOKBACK_MS / 3_600_000)}h`,
        reason: "no logs in lookback",
      });
      continue;
    }
    const age = now - last;
    if (age > thresholdMs) {
      stale.push({job, age: formatAge(age), reason: "exceeds 3× cadence"});
    } else {
      healthy.push({job, age: formatAge(age)});
    }
  }

  const lines: string[] = [];
  const staleMark = stale.length > 0 ? `${stale.length} STALE` : "all healthy";
  lines.push(
    `[wake-cron-heartbeat] ${today} · ${JOBS.length} jobs · ${staleMark}`
  );
  lines.push("");

  if (stale.length > 0) {
    lines.push("STALE");
    for (const s of stale) {
      lines.push(
        `• ${s.job.name} (${s.job.label}) — last ${s.age} (${s.reason})`
      );
    }
    lines.push("");
  }

  lines.push("HEALTHY");
  for (const h of healthy) {
    lines.push(`• ${h.job.name} (${h.job.label}) — ${h.age}`);
  }

  let body = lines.join("\n").trim();
  if (body.length > TELEGRAM_MAX) {
    body = body.slice(0, TELEGRAM_MAX - 20) + "\n…[truncated]";
  }
  await sendTelegram(botToken, chatId, body);
}
