// Shared categoriser for fingerprinted signals (errors, payment anomalies,
// quota spikes, client-side errors, …). Mirrors the NEW/SPIKING/RECURRING/
// CHRONIC pattern logsDigest has for `ops_logs_state`, generalised so every
// collector tracks state the same way and the smart agent can reason
// across collectors uniformly.
//
// Usage:
//   const buckets = await categoriseFingerprints(db, {
//     stateCollection: "ops_payments_state",
//     today,              // "YYYY-MM-DD"
//     cutoff,             // "YYYY-MM-DD" — anything older is pruned
//     prior7Keys,         // 7 ISO dates before today
//     signals: [{fingerprint, count, extras}, …],
//   });
//   // buckets → { new: [...], spiking: [...], recurring: [...], chronic: [...] }

import * as admin from "firebase-admin";

export interface Signal<T> {
  fingerprint: string;
  count: number;
  extras: T;
}

export interface StateDoc<T = unknown> {
  extras: T;
  firstSeen: admin.firestore.Timestamp;
  lastSeen: admin.firestore.Timestamp;
  reportedAt?: admin.firestore.Timestamp;
  countsByDay: Record<string, number>;
}

export interface CategoryBuckets<T> {
  new: Array<{signal: Signal<T>}>;
  spiking: Array<{signal: Signal<T>; priorAvg: number}>;
  recurring: Array<{signal: Signal<T>}>;
  chronic: Array<{signal: Signal<T>}>;
}

export interface CategoriseOptions {
  // Minimum today's count needed for SPIKING to fire. Prevents "avg 0.2,
  // today 1, 500% increase!" noise for low-volume signals.
  minSpikeCount?: number;
  // Multiplier vs 7-day average needed for SPIKING.
  spikeMultiplier?: number;
}

const DEFAULT_MIN_SPIKE_COUNT = 5;
const DEFAULT_SPIKE_MULTIPLIER = 2;

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function last7DateKeys(today: Date): string[] {
  const keys: string[] = [];
  for (let i = 1; i <= 7; i++) {
    const day = new Date(today.getTime() - i * 86_400_000);
    keys.push(ymd(day));
  }
  return keys;
}

export function cutoffKey(today: Date, daysToKeep: number): string {
  return ymd(new Date(today.getTime() - daysToKeep * 86_400_000));
}

export async function categoriseFingerprints<T>(
  db: admin.firestore.Firestore,
  params: {
    stateCollection: string;
    todayKey: string;
    prior7Keys: string[];
    cutoffKey: string;
    signals: Array<Signal<T>>;
    options?: CategoriseOptions;
  }
): Promise<CategoryBuckets<T>> {
  const {
    stateCollection,
    todayKey,
    prior7Keys,
    cutoffKey: cutoff,
    signals,
    options = {},
  } = params;
  const minSpikeCount = options.minSpikeCount ?? DEFAULT_MIN_SPIKE_COUNT;
  const spikeMultiplier = options.spikeMultiplier ?? DEFAULT_SPIKE_MULTIPLIER;

  const buckets: CategoryBuckets<T> = {
    new: [],
    spiking: [],
    recurring: [],
    chronic: [],
  };
  if (signals.length === 0) return buckets;

  const refs = signals.map((s) =>
    db.collection(stateCollection).doc(s.fingerprint)
  );
  const snaps = await db.getAll(...refs);
  const nowTs = admin.firestore.Timestamp.now();
  const nowMs = nowTs.toMillis();
  const batch = db.batch();

  for (let i = 0; i < signals.length; i++) {
    const sig = signals[i];
    const snap = snaps[i];
    const existing = snap.exists ? (snap.data() as StateDoc<T>) : null;

    const countsByDay: Record<string, number> = {
      ...(existing?.countsByDay ?? {}),
    };
    countsByDay[todayKey] = sig.count;
    for (const d of Object.keys(countsByDay)) {
      if (d < cutoff) delete countsByDay[d];
    }

    const priorCounts = prior7Keys.map((k) => countsByDay[k] ?? 0);
    const priorAvg = priorCounts.reduce((a, b) => a + b, 0) / 7;

    const isNew = !existing?.reportedAt;
    const isSpiking =
      !isNew &&
      priorAvg > 0 &&
      sig.count >= Math.max(minSpikeCount, spikeMultiplier * priorAvg);
    const firstSeenMs = existing?.firstSeen.toMillis() ?? nowMs;
    const isChronic = firstSeenMs < nowMs - 86_400_000;

    if (isNew) buckets.new.push({signal: sig});
    else if (isSpiking) buckets.spiking.push({signal: sig, priorAvg});
    else if (isChronic) buckets.chronic.push({signal: sig});
    else buckets.recurring.push({signal: sig});

    const updated: StateDoc<T> = {
      extras: sig.extras,
      firstSeen: existing?.firstSeen ?? nowTs,
      lastSeen: nowTs,
      reportedAt: existing?.reportedAt ?? nowTs,
      countsByDay,
    };
    batch.set(refs[i], updated);
  }

  await batch.commit();
  return buckets;
}

// Helper: summary line counts for a digest header.
export function bucketCountsLine<T>(b: CategoryBuckets<T>): string {
  return (
    `${b.new.length} new · ${b.spiking.length} spiking · ` +
    `${b.recurring.length} recurring · ${b.chronic.length} chronic`
  );
}
