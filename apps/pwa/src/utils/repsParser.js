// Reps strings come in several shapes: "10", "10-12", "AMRAP", "10 c/u" (per-side unilateral).
// `parseTotalReps` returns the total reps performed in the set, doubling unilateral counts.

export function isUnilateralReps(reps) {
  if (typeof reps !== 'string') return false;
  return /\bc\s*\/\s*u\b/i.test(reps);
}

export function parseTotalReps(reps) {
  if (reps == null) return 0;
  const str = String(reps).trim();
  if (!str) return 0;
  const n = parseInt(str, 10);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return isUnilateralReps(str) ? n * 2 : n;
}
