/**
 * Activity streak: one streak per user, kept alive by logging a workout or a meal any day.
 * Streak number = calendar days from streak start through today (inclusive). Each day adds 1.
 * When user doesn't log for 4+ calendar days, streak dies (show 0). On next log, streak restarts at 1.
 */
import React from 'react';
import { doc, getDoc, getDocFromServer, updateDoc } from 'firebase/firestore';
import { firestore } from '../config/firebase';
import logger from '../utils/logger.js';

const DAYS_WITHOUT_ACTIVITY_TO_DIE = 4;

/** Normalize Firestore Timestamp, Date, or YYYY-MM-DD string to YYYY-MM-DD. Returns null if invalid. */
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

// In-memory cache: one entry per user, per local day
// { state, computedForDate }
const streakCache = new Map();

function getTodayLocal() {
  return getLocalDateString(new Date());
}

function getLocalDateString(dateOrIso) {
  const d = dateOrIso instanceof Date ? dateOrIso : new Date(dateOrIso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function calendarDaysBetween(startYYYYMMDD, endYYYYMMDD) {
  const start = new Date(startYYYYMMDD + 'T12:00:00');
  const end = new Date(endYYYYMMDD + 'T12:00:00');
  const diff = end - start;
  return Math.round(diff / (1000 * 60 * 60 * 24));
}

/**
 * Pure computation: streak state from dates (no Firestore).
 * @param {string} streakStartDate - YYYY-MM-DD
 * @param {string} lastActivityDate - YYYY-MM-DD
 * @param {string} [today] - YYYY-MM-DD, defaults to getTodayLocal()
 * @returns {{ streakNumber: number, flameLevel: number }}
 */
function computeStreakStateFromDates(streakStartDate, lastActivityDate, today = getTodayLocal()) {
  if (!lastActivityDate || !streakStartDate) {
    return { streakNumber: 0, flameLevel: 0 };
  }
  const daysSinceLastActivity = calendarDaysBetween(lastActivityDate, today);
  if (daysSinceLastActivity >= DAYS_WITHOUT_ACTIVITY_TO_DIE) {
    return { streakNumber: 0, flameLevel: 0 };
  }
  const streakNumber = calendarDaysBetween(streakStartDate, today) + 1;
  // Visual rule: today and tomorrow (0–1 days since last log) keep full flame.
  // Only start dimming from the second missed day onward, while death is still controlled
  // solely by DAYS_WITHOUT_ACTIVITY_TO_DIE.
  const effectiveGapForFlame = Math.max(0, daysSinceLastActivity - 1);
  const flameLevel = Math.max(1, 3 - effectiveGapForFlame);
  return { streakNumber, flameLevel };
}

const streakUpdateListeners = new Set();

function notifyStreakUpdated(newState) {
  streakUpdateListeners.forEach((cb) => {
    try {
      cb(newState);
    } catch (e) {
      logger.warn('Streak update listener error:', e);
    }
  });
}

/**
 * Get current activity streak state (computed from stored dates).
 * @param {string} userId
 * @returns {Promise<{ streakNumber: number, flameLevel: number, longestStreak?: number, longestStreakStartDate?: string, longestStreakEndDate?: string, streakStartDate?: string, lastActivityDate?: string }>}
 */
async function getActivityStreakState(userId) {
  if (!userId) {
    return { streakNumber: 0, flameLevel: 0 };
  }

  const today = getTodayLocal();

  // Fast path: use in-memory cache when state was already computed for today
  const cached = streakCache.get(userId);
  if (cached && cached.computedForDate === today) {
    logger.debug?.('🔥 [streak] Using cached activity streak state for user', userId);
    return cached.state;
  }

  try {
    const userDocRef = doc(firestore, 'users', userId);
    const userDoc = await getDoc(userDocRef);
    if (!userDoc.exists()) {
      return { streakNumber: 0, flameLevel: 0 };
    }
    const data = userDoc.data();
    const as = data?.activityStreak || {};
    const lastActivityDate = as.lastActivityDate || null;
    const streakStartDate = as.streakStartDate || null;
    const current = computeStreakStateFromDates(streakStartDate, lastActivityDate, today);
    const result = {
      ...current,
      streakStartDate,
      lastActivityDate,
    };
    if (as.longestStreak != null) result.longestStreak = as.longestStreak;
    if (as.longestStreakStartDate != null) result.longestStreakStartDate = as.longestStreakStartDate;
    if (as.longestStreakEndDate != null) result.longestStreakEndDate = as.longestStreakEndDate;

    // Cache successful result for this user/day
    streakCache.set(userId, {
      state: result,
      computedForDate: today
    });

    return result;
  } catch (error) {
    logger.error('❌ getActivityStreakState:', error);
    return { streakNumber: 0, flameLevel: 0 };
  }
}

/**
 * Call when user logs a workout or a meal. activityDate = YYYY-MM-DD for the day being logged.
 * @param {string} userId
 * @param {string} activityDate - YYYY-MM-DD (local date of the log)
 */
async function updateActivityStreak(userId, activityDate) {
  try {
    const userDocRef = doc(firestore, 'users', userId);
    const userDoc = await getDoc(userDocRef);
    if (!userDoc.exists()) {
      return;
    }
    const data = userDoc.data();
    const existing = data?.activityStreak || {};
    const lastActivityDate = existing.lastActivityDate || null;
    const streakStartDate = existing.streakStartDate || null;

    if (lastActivityDate && activityDate < lastActivityDate) {
      return;
    }

    const daysSinceLast = lastActivityDate ? calendarDaysBetween(lastActivityDate, activityDate) : null;
    const isDead = lastActivityDate && daysSinceLast >= DAYS_WITHOUT_ACTIVITY_TO_DIE;
    const isNewStreak = !streakStartDate || isDead;

    const nextStart = isNewStreak ? activityDate : streakStartDate;
    const currentLongest = existing.longestStreak ?? 0;
    let candidateLength = 0;
    let candidateStart = null;
    let candidateEnd = null;
    if (isDead && streakStartDate && lastActivityDate) {
      candidateLength = calendarDaysBetween(streakStartDate, lastActivityDate) + 1;
      candidateStart = streakStartDate;
      candidateEnd = lastActivityDate;
    } else {
      candidateLength = calendarDaysBetween(nextStart, activityDate) + 1;
      candidateStart = nextStart;
      candidateEnd = activityDate;
    }
    const activityStreakPayload = {
      streakStartDate: nextStart,
      lastActivityDate: activityDate
    };
    if (candidateLength > currentLongest) {
      activityStreakPayload.longestStreak = candidateLength;
      activityStreakPayload.longestStreakStartDate = candidateStart;
      activityStreakPayload.longestStreakEndDate = candidateEnd;
    } else if (existing.longestStreak != null) {
      activityStreakPayload.longestStreak = existing.longestStreak;
      if (existing.longestStreakStartDate != null) activityStreakPayload.longestStreakStartDate = existing.longestStreakStartDate;
      if (existing.longestStreakEndDate != null) activityStreakPayload.longestStreakEndDate = existing.longestStreakEndDate;
    }
    await updateDoc(userDocRef, { activityStreak: activityStreakPayload });
    logger.log('🔥 Activity streak updated:', { userId, activityDate, streakStartDate: nextStart });
    const newState = computeStreakStateFromDates(nextStart, activityDate, getTodayLocal());
    newState.streakStartDate = activityStreakPayload.streakStartDate;
    newState.lastActivityDate = activityStreakPayload.lastActivityDate;
    if (activityStreakPayload.longestStreak != null) {
      newState.longestStreak = activityStreakPayload.longestStreak;
      newState.longestStreakStartDate = activityStreakPayload.longestStreakStartDate;
      newState.longestStreakEndDate = activityStreakPayload.longestStreakEndDate;
    }

    // Keep cache in sync for the current local day
    const today = getTodayLocal();
    streakCache.set(userId, {
      state: newState,
      computedForDate: today
    });

    notifyStreakUpdated(newState);
  } catch (error) {
    logger.error('❌ updateActivityStreak:', error);
  }
}

export function useActivityStreak(userId) {
  const [state, setState] = React.useState({ streakNumber: 0, flameLevel: 0, isLoading: true });
  React.useEffect(() => {
    if (!userId) {
      setState({ streakNumber: 0, flameLevel: 0, isLoading: false });
      return;
    }
    let cancelled = false;
    let midnightTimeoutId;
    setState((s) => ({ ...s, isLoading: true }));
    getActivityStreakState(userId).then((result) => {
      if (!cancelled) {
        setState({ ...result, isLoading: false });
      }
    });

    // Schedule one refresh at next local midnight so flame level and streak number
    // adjust when a new day starts, without tying it to screen navigation.
    try {
      const now = new Date();
      const nextMidnight = new Date(now);
      nextMidnight.setHours(24, 0, 0, 0);
      const msUntilMidnight = Math.max(0, nextMidnight.getTime() - now.getTime() + 1000);
      midnightTimeoutId = setTimeout(() => {
        if (cancelled) return;
        getActivityStreakState(userId).then((result) => {
          if (!cancelled) {
            setState({ ...result, isLoading: false });
          }
        });
      }, msUntilMidnight);
    } catch (e) {
      logger.warn?.('🔥 [streak] Failed to schedule midnight refresh:', e);
    }
    const unsubscribe = (newState) => {
      if (!cancelled) {
        setState({ ...newState, isLoading: false });
      }
    };
    streakUpdateListeners.add(unsubscribe);
    return () => {
      cancelled = true;
      if (midnightTimeoutId) {
        clearTimeout(midnightTimeoutId);
      }
      streakUpdateListeners.delete(unsubscribe);
    };
  }, [userId]);
  return state;
}

export default {
  getTodayLocal,
  getLocalDateString,
  getActivityStreakState,
  updateActivityStreak,
  useActivityStreak,
  DAYS_WITHOUT_ACTIVITY_TO_DIE
};
