/**
 * Activity streak: pure computation from two stored dates.
 * No API calls, no cache, no state management.
 *
 * Streak number = calendar days from streakStartDate through today (inclusive).
 * When user doesn't log for 4+ calendar days, streak dies (show 0).
 * Flame level = visual urgency based on days since last activity.
 */

const DAYS_WITHOUT_ACTIVITY_TO_DIE = 4;

function getLocalDateString(dateOrIso) {
  const d = dateOrIso instanceof Date ? dateOrIso : new Date(dateOrIso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getTodayLocal() {
  return getLocalDateString(new Date());
}

/** Normalize Firestore Timestamp, Date, or YYYY-MM-DD string to YYYY-MM-DD. */
function toYYYYMMDD(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  let d;
  if (value instanceof Date) {
    d = value;
  } else if (typeof value?.toDate === 'function') {
    d = value.toDate();
  } else if (typeof value?.toMillis === 'function') {
    d = new Date(value.toMillis());
  } else {
    d = new Date(value);
  }
  if (Number.isNaN(d.getTime())) return null;
  return getLocalDateString(d);
}

function calendarDaysBetween(startYYYYMMDD, endYYYYMMDD) {
  const start = new Date(startYYYYMMDD + 'T12:00:00');
  const end = new Date(endYYYYMMDD + 'T12:00:00');
  return Math.round((end - start) / (1000 * 60 * 60 * 24));
}

/**
 * Pure computation: streak state from stored dates + today.
 * @param {{ streakStartDate?: string, lastActivityDate?: string, longestStreak?: number, longestStreakStartDate?: string, longestStreakEndDate?: string }} activityStreak
 * @returns {{ streakNumber: number, flameLevel: number, longestStreak: number, streakStartDate: string|null, lastActivityDate: string|null, longestStreakStartDate: string|null, longestStreakEndDate: string|null }}
 */
function computeStreakState(activityStreak, today = getTodayLocal()) {
  const lastActivityDate = activityStreak?.lastActivityDate ?? null;
  const streakStartDate = activityStreak?.streakStartDate ?? null;
  const longestStreak = activityStreak?.longestStreak ?? 0;

  if (!lastActivityDate || !streakStartDate) {
    return {
      streakNumber: 0,
      flameLevel: 0,
      longestStreak,
      streakStartDate,
      lastActivityDate,
      longestStreakStartDate: activityStreak?.longestStreakStartDate ?? null,
      longestStreakEndDate: activityStreak?.longestStreakEndDate ?? null,
    };
  }

  const daysSinceLastActivity = calendarDaysBetween(lastActivityDate, today);

  if (daysSinceLastActivity >= DAYS_WITHOUT_ACTIVITY_TO_DIE) {
    return {
      streakNumber: 0,
      flameLevel: 0,
      longestStreak,
      streakStartDate,
      lastActivityDate,
      longestStreakStartDate: activityStreak?.longestStreakStartDate ?? null,
      longestStreakEndDate: activityStreak?.longestStreakEndDate ?? null,
    };
  }

  const streakNumber = calendarDaysBetween(streakStartDate, today) + 1;

  // Flame = visual urgency. Full when active today/yesterday, dims as gap grows.
  // 0-1 days gap -> 3 (full), 2 days gap -> 2 (medium), 3 days gap -> 1 (low)
  const effectiveGap = Math.max(0, daysSinceLastActivity - 1);
  const flameLevel = Math.max(1, 3 - effectiveGap);

  return {
    streakNumber,
    flameLevel,
    longestStreak: Math.max(streakNumber, longestStreak),
    streakStartDate,
    lastActivityDate,
    longestStreakStartDate: activityStreak?.longestStreakStartDate ?? null,
    longestStreakEndDate: activityStreak?.longestStreakEndDate ?? null,
  };
}

export { computeStreakState, calendarDaysBetween, toYYYYMMDD, getLocalDateString, getTodayLocal, DAYS_WITHOUT_ACTIVITY_TO_DIE };

export default {
  computeStreakState,
  getTodayLocal,
  getLocalDateString,
  DAYS_WITHOUT_ACTIVITY_TO_DIE,
};
