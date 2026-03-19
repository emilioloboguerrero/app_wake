/**
 * Activity streak: one streak per user, kept alive by logging a workout or a meal any day.
 * Streak number = calendar days from streak start through today (inclusive). Each day adds 1.
 * When user doesn't log for 4+ calendar days, streak dies (show 0). On next log, streak restarts at 1.
 */
import React from 'react';
import apiClient from '../utils/apiClient';
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

/** Clear in-memory streak cache so next read refetches (e.g. when app becomes visible again). */
function clearStreakCache(userId) {
  if (userId) streakCache.delete(userId);
  else streakCache.clear();
}

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

/**
 * Get current activity streak state (computed from stored dates).
 * Tries server first; on failure (e.g. unavailable), falls back to cache so we never show 0 due to cold start.
 * @param {string} userId
 * @returns {Promise<{ streakNumber: number, flameLevel: number, longestStreak?: number, longestStreakStartDate?: string, longestStreakEndDate?: string, streakStartDate?: string, lastActivityDate?: string }>}
 */
async function getActivityStreakState(userId) {
  if (!userId) {
    return { streakNumber: 0, flameLevel: 0 };
  }

  const today = getTodayLocal();

  try {
    const res = await apiClient.get('/workout/streak');
    const d = res?.data ?? {};
    const result = {
      streakNumber: d.currentStreak ?? 0,
      flameLevel: d.flameLevel ?? 0,
      longestStreak: d.longestStreak ?? 0,
      lastActivityDate: d.lastActivityDate ?? null,
    };
    streakCache.set(userId, { state: result, computedForDate: today });
    return result;
  } catch (error) {
    logger.error('❌ getActivityStreakState:', error);
    return { streakNumber: 0, flameLevel: 0 };
  }
}

// Streak is now updated server-side atomically by POST /workout/complete.
// Nutrition calls this but it is intentionally a no-op — streak no longer tracks meal logs.
async function updateActivityStreak(_userId, _activityDate) {
  return;
}

function getInitialStreakState(userId) {
  if (!userId) {
    logger.log('[STREAK] getInitialStreakState: no userId → _loaded:true, isLoading:false');
    return { streakNumber: 0, flameLevel: 0, isLoading: false, _loaded: true };
  }
  const cached = streakCache.get(userId);
  const today = getTodayLocal();
  if (cached && cached.computedForDate === today && cached.state) {
    logger.log('[STREAK] getInitialStreakState: cache HIT', { userId: userId.slice(0, 8), today });
    return { ...cached.state, isLoading: false, _loaded: true };
  }
  logger.log('[STREAK] getInitialStreakState: cache MISS → _loaded:false, isLoading:true', { userId: userId.slice(0, 8) });
  return { streakNumber: 0, flameLevel: 0, isLoading: true, _loaded: false };
}

/**
 * useActivityStreak: initial state from cache when available, then GET /workout/streak on mount.
 * Loading is derived from _loaded so it cannot get stuck true.
 */
export function useActivityStreak(userId) {
  const [state, setState] = React.useState(() => getInitialStreakState(userId));
  const effectRunIdRef = React.useRef(0);

  const out = { ...state };
  delete out._loaded;
  out.isLoading = state._loaded === false && !!userId;

  React.useEffect(() => {
    if (!userId) {
      setState({ streakNumber: 0, flameLevel: 0, isLoading: false, _loaded: true });
      return;
    }

    const runId = ++effectRunIdRef.current;

    setState((prev) => {
      const cached = streakCache.get(userId);
      const today = getTodayLocal();
      if (cached && cached.computedForDate === today && cached.state) {
        return { ...cached.state, isLoading: false, _loaded: true };
      }
      return { ...prev, isLoading: true, _loaded: false };
    });

    const applyLoaded = (nextState) => {
      if (effectRunIdRef.current !== runId) return;
      setState((prev) => {
        const merged = typeof nextState === 'function' ? nextState(prev) : { ...prev, ...nextState };
        return { ...merged, isLoading: false, _loaded: true };
      });
    };

    getActivityStreakState(userId).then((result) => {
      if (effectRunIdRef.current !== runId) return;
      applyLoaded(result);
    }).catch((e) => {
      if (effectRunIdRef.current !== runId) return;
      logger.warn?.('🔥 [streak] Initial fetch failed:', e);
      applyLoaded({});
    });

    const earlyClearId = setTimeout(() => {
      if (effectRunIdRef.current !== runId) return;
      setState((prev) => {
        if (prev._loaded) return prev;
        return { ...prev, isLoading: false, _loaded: true };
      });
    }, 400);

    const loadingFallbackId = setTimeout(() => {
      if (effectRunIdRef.current !== runId) return;
      setState((prev) => {
        if (prev._loaded) return prev;
        return { ...prev, isLoading: false, _loaded: true };
      });
    }, 2000);

    let midnightTimeoutId;
    try {
      const now = new Date();
      const nextMidnight = new Date(now);
      nextMidnight.setHours(24, 0, 0, 0);
      const msUntilMidnight = Math.max(0, nextMidnight.getTime() - now.getTime() + 1000);
      midnightTimeoutId = setTimeout(() => {
        if (effectRunIdRef.current !== runId) return;
        setState((prev) => {
          const next = computeStreakStateFromDates(prev.streakStartDate, prev.lastActivityDate);
          return { ...prev, ...next, isLoading: false, _loaded: true };
        });
      }, msUntilMidnight);
    } catch (e) {
      logger.warn?.('🔥 [streak] Failed to schedule midnight refresh:', e);
    }

    return () => {
      clearTimeout(earlyClearId);
      clearTimeout(loadingFallbackId);
      if (midnightTimeoutId) clearTimeout(midnightTimeoutId);
    };
  }, [userId]);

  return out;
}

export { computeStreakStateFromDates, calendarDaysBetween, toYYYYMMDD, getLocalDateString };

export default {
  getTodayLocal,
  getLocalDateString,
  getActivityStreakState,
  updateActivityStreak,
  useActivityStreak,
  clearStreakCache,
  DAYS_WITHOUT_ACTIVITY_TO_DIE
};
