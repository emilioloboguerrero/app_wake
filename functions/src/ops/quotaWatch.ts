import * as admin from "firebase-admin";
import {MetricServiceClient} from "@google-cloud/monitoring";
import * as functions from "firebase-functions";
import {sendTo, type TopicMap} from "./telegram.js";
import {
  categoriseFingerprints,
  cutoffKey,
  last7DateKeys,
  bucketCountsLine,
  type CategoryBuckets,
} from "./stateTracker.js";

const TELEGRAM_MAX = 4000;
const QUERY_TIMEOUT_MS = 15_000;
const STATE_COLLECTION = "ops_quota_state";
const DAYS_TO_KEEP = 14;

const monitoringClient = new MetricServiceClient();

interface MetricSpec {
  key: string;
  label: string;
  type: string; // Google Cloud metric type
  aligner: "ALIGN_SUM" | "ALIGN_MEAN" | "ALIGN_MAX";
}

// Metrics we pull. Costs are not in this list — billing exports are
// a separate integration we're not building yet.
const METRICS: MetricSpec[] = [
  {
    key: "firestore_reads",
    label: "Firestore reads",
    type: "firestore.googleapis.com/document/read_count",
    aligner: "ALIGN_SUM",
  },
  {
    key: "firestore_writes",
    label: "Firestore writes",
    type: "firestore.googleapis.com/document/write_count",
    aligner: "ALIGN_SUM",
  },
  {
    key: "firestore_deletes",
    label: "Firestore deletes",
    type: "firestore.googleapis.com/document/delete_count",
    aligner: "ALIGN_SUM",
  },
  {
    key: "function_executions",
    label: "Function executions",
    type: "cloudfunctions.googleapis.com/function/execution_count",
    aligner: "ALIGN_SUM",
  },
  {
    key: "function_errors",
    label: "Function errors",
    type: "cloudfunctions.googleapis.com/function/execution_count",
    aligner: "ALIGN_SUM",
  },
];

interface MetricTotal {
  key: string;
  label: string;
  last24h: number;
  prior7dAvg: number;
  ratio: number; // last24h / prior7dAvg (Infinity if baseline is 0 and current > 0)
}

async function sumMetric(
  projectId: string,
  spec: MetricSpec,
  startMs: number,
  endMs: number,
  extraFilter?: string
): Promise<number> {
  const filterParts = [`metric.type = "${spec.type}"`];
  if (extraFilter) filterParts.push(extraFilter);
  const filter = filterParts.join(" AND ");

  const request = {
    name: `projects/${projectId}`,
    filter,
    interval: {
      startTime: {seconds: Math.floor(startMs / 1000)},
      endTime: {seconds: Math.floor(endMs / 1000)},
    },
    aggregation: {
      alignmentPeriod: {seconds: 60 * 60 * 24}, // one bucket per day
      perSeriesAligner: spec.aligner,
      crossSeriesReducer: "REDUCE_SUM" as const,
    },
    view: "FULL" as const,
  };

  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(
      () => reject(new Error(`listTimeSeries timeout ${QUERY_TIMEOUT_MS}ms`)),
      QUERY_TIMEOUT_MS
    );
  });

  const [series] = await Promise.race([
    monitoringClient.listTimeSeries(request),
    timeoutPromise,
  ]);
  let total = 0;
  for (const ts of series) {
    for (const pt of ts.points ?? []) {
      const v = pt.value;
      if (!v) continue;
      const num =
        typeof v.int64Value === "string" ?
          Number(v.int64Value) :
          typeof v.int64Value === "number" ?
            v.int64Value :
            typeof v.doubleValue === "number" ?
              v.doubleValue :
              0;
      if (Number.isFinite(num)) total += num;
    }
  }
  return total;
}

async function fetchMetricTotal(
  projectId: string,
  spec: MetricSpec,
  now: number
): Promise<MetricTotal> {
  const dayMs = 24 * 60 * 60 * 1000;
  const extra =
    spec.key === "function_errors" ?
      "metric.labels.status != \"ok\"" :
      undefined;

  const last24h = await sumMetric(
    projectId,
    spec,
    now - dayMs,
    now,
    extra
  );
  const prior7dSum = await sumMetric(
    projectId,
    spec,
    now - 8 * dayMs,
    now - dayMs,
    extra
  );
  const prior7dAvg = prior7dSum / 7;
  const ratio =
    prior7dAvg > 0 ?
      last24h / prior7dAvg :
      last24h > 0 ?
        Infinity :
        1;

  return {
    key: spec.key,
    label: spec.label,
    last24h,
    prior7dAvg,
    ratio,
  };
}

function fmtNum(n: number): string {
  if (!Number.isFinite(n)) return "∞";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "k";
  return String(Math.round(n));
}

function fmtRatio(r: number): string {
  if (!Number.isFinite(r)) return "n/a (no baseline)";
  return `${r.toFixed(2)}×`;
}

interface QuotaSignalExtras {
  key: string;
  label: string;
  last24h: number;
  prior7dAvg: number;
  ratio: number;
}

export async function runQuotaWatch(opts: {
  botToken: string;
  chatId: string;
  topics?: TopicMap;
  projectId: string;
}): Promise<void> {
  const {botToken, chatId, topics, projectId} = opts;
  const ctx = {botToken, chatId, topics};
  const now = Date.now();
  const nowDate = new Date(now);
  const todayKey = nowDate.toISOString().slice(0, 10);

  const results: MetricTotal[] = [];
  const errors: string[] = [];

  for (const spec of METRICS) {
    try {
      const r = await fetchMetricTotal(projectId, spec, now);
      results.push(r);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      functions.logger.warn("wake-quota-watch: metric failed", {
        key: spec.key,
        error: msg,
      });
      errors.push(`${spec.key}: ${msg.slice(0, 120)}`);
    }
  }

  // NEW/SPIKING state: every metric emits a signal at its daily count so we
  // can track trend changes per metric across days. SPIKING is evaluated
  // against the metric's own 7-day history, not a per-run baseline.
  const signals = results.map((r) => ({
    fingerprint: `quota:${r.key}`,
    count: Math.max(0, Math.round(r.last24h)),
    extras: {
      key: r.key,
      label: r.label,
      last24h: r.last24h,
      prior7dAvg: r.prior7dAvg,
      ratio: r.ratio,
    } satisfies QuotaSignalExtras,
  }));

  const db = admin.firestore();
  let buckets: CategoryBuckets<QuotaSignalExtras> = {
    new: [], spiking: [], recurring: [], chronic: [],
  };
  try {
    buckets = await categoriseFingerprints<QuotaSignalExtras>(db, {
      stateCollection: STATE_COLLECTION,
      todayKey,
      prior7Keys: last7DateKeys(nowDate),
      cutoffKey: cutoffKey(nowDate, DAYS_TO_KEEP),
      signals,
      // Quota metrics are naturally high-volume — raise the spike floor so
      // 1→3 events/day doesn't fire. 100 = baseline "real" usage.
      options: {minSpikeCount: 100, spikeMultiplier: 2},
    });
  } catch (err) {
    functions.logger.warn("wake-quota-watch: state tracking failed", {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  const anomalies = results.filter(
    (r) => Number.isFinite(r.ratio) && r.ratio >= 2 && r.last24h >= 10
  );
  const newSignals = results.filter(
    (r) => !Number.isFinite(r.ratio) && r.last24h >= 10
  );

  const headerParts = [
    `${results.length} metrics`,
    `${anomalies.length} ≥2× baseline`,
  ];
  if (newSignals.length > 0) headerParts.push(`${newSignals.length} new-series`);
  headerParts.push(bucketCountsLine(buckets));

  const lines: string[] = [
    `[wake-quota-watch] ${todayKey} · 24h · ${headerParts.join(" · ")}`,
    "",
  ];

  if (buckets.spiking.length > 0) {
    lines.push(`SPIKING vs stored 7d (${buckets.spiking.length})`);
    for (const s of buckets.spiking) {
      const x = s.signal.extras;
      lines.push(
        `• ${x.label} — ${fmtNum(x.last24h)} today ` +
          `(state-avg ${s.priorAvg.toFixed(0)}, ${fmtRatio(x.ratio)})`
      );
    }
    lines.push("");
  }

  if (anomalies.length > 0) {
    lines.push("ANOMALIES vs 7d avg (Cloud Monitoring baseline)");
    for (const r of anomalies) {
      lines.push(
        `• ${r.label} — ${fmtNum(r.last24h)} today ` +
          `(avg ${fmtNum(r.prior7dAvg)}, ${fmtRatio(r.ratio)})`
      );
    }
    lines.push("");
  }

  lines.push("TOTALS");
  for (const r of results) {
    lines.push(
      `• ${r.label} — ${fmtNum(r.last24h)} today ` +
        `(avg ${fmtNum(r.prior7dAvg)}, ${fmtRatio(r.ratio)})`
    );
  }

  if (errors.length > 0) {
    lines.push("");
    lines.push("Metric query errors:");
    for (const e of errors) lines.push(`• ${e}`);
  }

  let body = lines.join("\n").trim();
  if (body.length > TELEGRAM_MAX) {
    body = body.slice(0, TELEGRAM_MAX - 20) + "\n…[truncated]";
  }
  await sendTo(ctx, "signals", body);
}
