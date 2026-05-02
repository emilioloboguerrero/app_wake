/**
 * Resolves a date → day-of-eating from a program-mode snapshot
 * stored in `client_nutrition_plan_content`.
 *
 * Used by:
 *  - GET /nutrition/assignment (PWA read path: returns the day's full content).
 *  - GET /creator/clients/:clientId/lab (per-day macro target for trends).
 *  - GET /creator/programs (creator dashboard adherence calc).
 *
 * The snapshot shape (program mode):
 *   { type: 'program', weeks: [{ days: [day | null × 7] }, ...], ... }
 * where each `day` (when non-null) carries:
 *   { source_plan_id, name, description, daily_calories, daily_protein_g,
 *     daily_carbs_g, daily_fat_g, categories }
 *
 * Returns the day object for the requested date, or null if:
 *  - the snapshot isn't a program,
 *  - startDate is missing/malformed,
 *  - dateStr is before startDate,
 *  - the resolved week/day slot is empty (rest day).
 *
 * Both date strings must be YYYY-MM-DD; comparison is anchored at UTC noon
 * to keep DST edges from off-by-one'ing the day index.
 */

export type ProgramSnapshotDay = {
  source_plan_id?: string;
  name?: string;
  description?: string;
  daily_calories?: number | null;
  daily_protein_g?: number | null;
  daily_carbs_g?: number | null;
  daily_fat_g?: number | null;
  categories?: unknown[];
};

type ProgramSnapshotWeek = { days?: Array<ProgramSnapshotDay | null> };

export type ProgramSnapshotContent = {
  type?: string;
  weeks?: ProgramSnapshotWeek[];
};

export function isProgramSnapshot(content: unknown): content is ProgramSnapshotContent & { type: "program" } {
  return !!content
    && typeof content === "object"
    && (content as { type?: unknown }).type === "program"
    && Array.isArray((content as { weeks?: unknown }).weeks);
}

export function resolveProgramDay(
  content: ProgramSnapshotContent,
  startDateStr: string | null | undefined,
  dateStr: string,
): ProgramSnapshotDay | null {
  const weeks = Array.isArray(content?.weeks) ? content.weeks : [];
  if (weeks.length === 0) return null;
  if (typeof startDateStr !== "string" || !startDateStr) return null;

  const startMs = Date.parse(`${startDateStr}T12:00:00Z`);
  const todayMs = Date.parse(`${dateStr}T12:00:00Z`);
  if (!Number.isFinite(startMs) || !Number.isFinite(todayMs)) return null;
  if (todayMs < startMs) return null;

  const daysSinceStart = Math.floor((todayMs - startMs) / 86_400_000);
  const weekIndex = Math.floor(daysSinceStart / 7) % weeks.length;
  // Monday=0..Sunday=6 (JS getUTCDay returns Sunday=0..Saturday=6)
  const jsDay = new Date(todayMs).getUTCDay();
  const dayOfWeek = (jsDay + 6) % 7;
  const week = weeks[weekIndex];
  return Array.isArray(week?.days) ? (week.days[dayOfWeek] ?? null) : null;
}

/**
 * Returns true if the program snapshot has at least one day with a non-zero
 * calorie or protein target. Used by adherence calculators to short-circuit
 * "no nutrition plan" before iterating diary entries.
 */
export function programHasAnyMacroTarget(content: ProgramSnapshotContent): boolean {
  const weeks = Array.isArray(content?.weeks) ? content.weeks : [];
  for (const w of weeks) {
    const days = Array.isArray(w?.days) ? w.days : [];
    for (const d of days) {
      if (!d) continue;
      const cal = (d.daily_calories ?? 0) as number;
      const pro = (d.daily_protein_g ?? 0) as number;
      if (cal > 0 || pro > 0) return true;
    }
  }
  return false;
}
