import {db, FieldValue} from "./firestore.js";

const DAYS_WITHOUT_ACTIVITY_TO_DIE = 4;

interface StreakData {
  lastActivityDate: string | null;
  streakStartDate: string | null;
  longestStreak: number;
  longestStreakStartDate: string | null;
  longestStreakEndDate: string | null;
}

interface StreakUpdateResult {
  updated: boolean;
  streakData: StreakData;
}

function calendarDaysBetween(a: string, b: string): number {
  const da = new Date(a + "T12:00:00");
  const db2 = new Date(b + "T12:00:00");
  return Math.round((db2.getTime() - da.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * Update streak after an activity (workout or meal).
 * Accepts optional lastKnownActivityDate from client to skip the read when possible.
 * Returns { updated, streakData }.
 */
export async function updateStreak(
  userId: string,
  activityDate: string,
  lastKnownActivityDate?: string | null
): Promise<StreakUpdateResult> {
  // If client tells us lastActivityDate is already today, skip entirely
  if (lastKnownActivityDate === activityDate) {
    return {
      updated: false,
      streakData: {
        lastActivityDate: activityDate,
        streakStartDate: null, // unknown, client already has it
        longestStreak: 0,
        longestStreakStartDate: null,
        longestStreakEndDate: null,
      },
    };
  }

  // If client sent a lastKnownActivityDate, we can compute without reading
  if (lastKnownActivityDate) {
    const gap = calendarDaysBetween(lastKnownActivityDate, activityDate);

    if (gap < 0) {
      // Activity date is before last known — no update needed
      return {updated: false, streakData: {lastActivityDate: lastKnownActivityDate, streakStartDate: null, longestStreak: 0, longestStreakStartDate: null, longestStreakEndDate: null}};
    }

    if (gap < DAYS_WITHOUT_ACTIVITY_TO_DIE) {
      // Streak is alive, just update lastActivityDate
      await db.collection("users").doc(userId).update({
        "activityStreak.lastActivityDate": activityDate,
        "updated_at": FieldValue.serverTimestamp(),
      });
      return {updated: true, streakData: {lastActivityDate: activityDate, streakStartDate: null, longestStreak: 0, longestStreakStartDate: null, longestStreakEndDate: null}};
    }

    // Streak was dead — reset start date, update longest if needed
    // Need to read for longestStreak comparison
  }

  // Full read path: read user doc, compute everything
  const userDoc = await db.collection("users").doc(userId).get();
  const userData = userDoc.data() ?? {};
  const streak = userData.activityStreak ?? {};
  const storedLastActivity: string | null = streak.lastActivityDate ?? userData.lastSessionDate ?? null;

  // If already same date, skip
  if (storedLastActivity === activityDate) {
    return {
      updated: false,
      streakData: {
        lastActivityDate: storedLastActivity,
        streakStartDate: streak.streakStartDate ?? null,
        longestStreak: streak.longestStreak ?? 0,
        longestStreakStartDate: streak.longestStreakStartDate ?? null,
        longestStreakEndDate: streak.longestStreakEndDate ?? null,
      },
    };
  }

  let newStreakStart: string = streak.streakStartDate ?? activityDate;
  const previousLongest: number = streak.longestStreak ?? 0;

  if (storedLastActivity) {
    const gap = calendarDaysBetween(storedLastActivity, activityDate);
    if (gap < 0) {
      // Activity is in the past before last activity — no update
      return {
        updated: false,
        streakData: {
          lastActivityDate: storedLastActivity,
          streakStartDate: streak.streakStartDate ?? null,
          longestStreak: previousLongest,
          longestStreakStartDate: streak.longestStreakStartDate ?? null,
          longestStreakEndDate: streak.longestStreakEndDate ?? null,
        },
      };
    }
    if (gap >= DAYS_WITHOUT_ACTIVITY_TO_DIE) {
      // Streak died — reset
      newStreakStart = activityDate;
    }
    // Otherwise streak is alive, keep existing streakStartDate
  } else {
    // First ever activity
    newStreakStart = activityDate;
  }

  // Compute current streak for longestStreak comparison
  const currentStreak = calendarDaysBetween(newStreakStart, activityDate) + 1;
  const newLongest = Math.max(currentStreak, previousLongest);

  const update: Record<string, unknown> = {
    "activityStreak.lastActivityDate": activityDate,
    "activityStreak.streakStartDate": newStreakStart,
    "activityStreak.longestStreak": newLongest,
    "updated_at": FieldValue.serverTimestamp(),
  };

  if (newLongest > previousLongest) {
    update["activityStreak.longestStreakStartDate"] = newStreakStart;
    update["activityStreak.longestStreakEndDate"] = activityDate;
  }

  await db.collection("users").doc(userId).update(update);

  return {
    updated: true,
    streakData: {
      lastActivityDate: activityDate,
      streakStartDate: newStreakStart,
      longestStreak: newLongest,
      longestStreakStartDate: newLongest > previousLongest ? newStreakStart : (streak.longestStreakStartDate ?? null),
      longestStreakEndDate: newLongest > previousLongest ? activityDate : (streak.longestStreakEndDate ?? null),
    },
  };
}

// Remove stored currentStreak and flameLevel fields (no longer needed)
// They are now computed client-side from streakStartDate + lastActivityDate
