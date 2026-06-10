// Pure helpers for shell->plan level resolution + weekly variety. No Firestore I/O.
export interface CourseLevels { options: string[]; default: string; }
interface CourseLike { levels?: CourseLevels; level_plans?: Record<string, string>; }
interface EntryLike { level?: string | null; }

/** entry.level if a valid option, else course.levels.default; null when course has no levels. */
export function resolveUserLevel(course: CourseLike, entry: EntryLike | null | undefined): string | null {
  const levels = course.levels;
  if (!levels || !Array.isArray(levels.options) || levels.options.length === 0) return null;
  const chosen = entry?.level;
  if (typeof chosen === "string" && levels.options.includes(chosen)) return chosen;
  return levels.default;
}

/** Map the resolved level to its planId. null when no level_plans. */
export function resolveLevelPlanId(course: CourseLike, entry: EntryLike | null | undefined): string | null {
  const level = resolveUserLevel(course, entry);
  if (!level) return null;
  const map = course.level_plans;
  if (!map || typeof map !== "object") return null;
  return map[level] ?? null;
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
/** Cohort-synced current week within the live block: clamp(floor((now-start)/7d),0,max). */
export function computeWeekInBlock(startedAtMs: number | null, nowMs: number, maxWeekIndex: number): number {
  if (startedAtMs === null || !Number.isFinite(startedAtMs)) return 0;
  const raw = Math.floor((nowMs - startedAtMs) / WEEK_MS);
  if (raw < 0) return 0;
  if (raw > maxWeekIndex) return maxWeekIndex;
  return raw;
}

/** True if the session belongs to the current week, or has no weekIndex (legacy). */
export function sessionMatchesWeek(session: { weekIndex?: number | null }, weekInBlock: number): boolean {
  const wi = session.weekIndex;
  if (wi === undefined || wi === null) return true;
  return wi === weekInBlock;
}

/** Highest weekIndex among sessions; 0 when none declare one. */
export function maxWeekIndexOf(sessions: Array<{ weekIndex?: number | null }>): number {
  let max = 0;
  for (const s of sessions) if (typeof s.weekIndex === "number" && s.weekIndex > max) max = s.weekIndex;
  return max;
}

/** Validate a level choice against the course's declared options. */
export function isValidLevelChoice(course: CourseLike, level: string): boolean {
  const opts = course.levels?.options;
  return Array.isArray(opts) && opts.includes(level);
}

/** Cron gate: advance only if every level plan reports a published next-block. */
export function allLevelPlansPublishAt(perPlanPublished: Record<string, boolean>): boolean {
  const vals = Object.values(perPlanPublished);
  if (vals.length === 0) return false;
  return vals.every(Boolean);
}
