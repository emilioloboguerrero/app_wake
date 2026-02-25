/**
 * Activity streak: one streak per user, kept alive by logging a workout or a meal any day.
 * Streak number = calendar days from streak start through today (inclusive). Each day adds 1.
 * When user doesn't log for 4+ calendar days, streak dies (show 0). On next log, streak restarts at 1.
 */
import React from 'react';
import { doc, getDoc, getDocFromServer, updateDoc, onSnapshot } from 'firebase/firestore';
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

/** Build streak state from user doc data (no Firestore read). */
function buildStreakResultFromUserData(data) {
  const today = getTodayLocal();
  const as = data?.activityStreak || {};
  const lastActivityDate = toYYYYMMDD(as.lastActivityDate) || null;
  const streakStartDate = toYYYYMMDD(as.streakStartDate) || null;
  const current = computeStreakStateFromDates(streakStartDate, lastActivityDate, today);
  const result = { ...current, streakStartDate, lastActivityDate };
  if (as.longestStreak != null) result.longestStreak = as.longestStreak;
  const longestStart = toYYYYMMDD(as.longestStreakStartDate);
  const longestEnd = toYYYYMMDD(as.longestStreakEndDate);
  if (longestStart != null) result.longestStreakStartDate = longestStart;
  if (longestEnd != null) result.longestStreakEndDate = longestEnd;
  return result;
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
  const userDocRef = doc(firestore, 'users', userId);

  try {
    let userDoc = null;
    let fromServer = false;
    try {
      userDoc = await getDocFromServer(userDocRef);
      fromServer = true;
    } catch (serverError) {
      const isUnavailable = serverError?.code === 'unavailable' || serverError?.message?.includes('offline');
      if (isUnavailable) {
        logger.debug?.('🔥 [streak] Server unavailable, using cache for user', userId);
        userDoc = await getDoc(userDocRef);
      } else {
        throw serverError;
      }
    }

    if (!userDoc || !userDoc.exists()) {
      return { streakNumber: 0, flameLevel: 0 };
    }
    const result = buildStreakResultFromUserData(userDoc.data());
    if (fromServer) {
      streakCache.set(userId, {
        state: result,
        computedForDate: today
      });
    }
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
    // Read from server so we don't overwrite server state with state computed from stale cache.
    let userDoc;
    try {
      userDoc = await getDocFromServer(userDocRef);
    } catch (serverError) {
      const isOffline = serverError?.code === 'unavailable' || serverError?.message?.includes('offline');
      if (isOffline) {
        logger.debug?.('🔥 [streak] Server unavailable on update, using cache for user', userId);
        userDoc = await getDoc(userDocRef);
      } else {
        throw serverError;
      }
    }
    if (!userDoc.exists()) {
      return;
    }
    const data = userDoc.data();
    const existing = data?.activityStreak || {};
    const lastActivityDate = toYYYYMMDD(existing.lastActivityDate) || null;
    const streakStartDate = toYYYYMMDD(existing.streakStartDate) || null;

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
      const existingLongestStart = toYYYYMMDD(existing.longestStreakStartDate);
      const existingLongestEnd = toYYYYMMDD(existing.longestStreakEndDate);
      if (existingLongestStart != null) activityStreakPayload.longestStreakStartDate = existingLongestStart;
      if (existingLongestEnd != null) activityStreakPayload.longestStreakEndDate = existingLongestEnd;
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
 * useActivityStreak: initial state from cache when available, then onSnapshot for live updates
 * and one getActivityStreakState() to confirm/backfill (server or cache fallback).
 * Loading is derived from _loaded so it cannot get stuck true.
 */
export function useActivityStreak(userId) {
  const [state, setState] = React.useState(() => getInitialStreakState(userId));
  const effectRunIdRef = React.useRef(0);

  const out = { ...state };
  delete out._loaded;
  out.isLoading = state._loaded === false && !!userId;
  if (typeof logger.debug === 'function') {
    logger.debug('[STREAK] useActivityStreak render', { userId: userId ? userId.slice(0, 8) : null, _loaded: state._loaded, isLoading: out.isLoading });
  }

  React.useEffect(() => {
    if (!userId) {
      logger.log('[STREAK] effect: no userId, setting _loaded:true and returning');
      setState({ streakNumber: 0, flameLevel: 0, isLoading: false, _loaded: true });
      return;
    }

    const runId = ++effectRunIdRef.current;
    logger.log('[STREAK] effect: started', { runId, userId: userId.slice(0, 8) });

    let midnightTimeoutId;
    let loadingFallbackId;
    let earlyClearId;

    setState((prev) => {
      const cached = streakCache.get(userId);
      const today = getTodayLocal();
      if (cached && cached.computedForDate === today && cached.state) {
        logger.log('[STREAK] effect setState: cache HIT, setting _loaded:true');
        return { ...cached.state, isLoading: false, _loaded: true };
      }
      logger.log('[STREAK] effect setState: no cache, setting _loaded:false (loading true)');
      return { ...prev, isLoading: true, _loaded: false };
    });

    const applyLoaded = (nextState) => {
      if (effectRunIdRef.current !== runId) {
        logger.log('[STREAK] applyLoaded: SKIP (stale runId)', { current: effectRunIdRef.current, runId });
        return;
      }
      logger.log('[STREAK] applyLoaded: applying _loaded:true');
      setState((prev) => {
        const merged = typeof nextState === 'function' ? nextState(prev) : { ...prev, ...nextState };
        return { ...merged, isLoading: false, _loaded: true };
      });
    };

    const userDocRef = doc(firestore, 'users', userId);
    const unsubFirestore = onSnapshot(
      userDocRef,
      { includeMetadataChanges: true },
      (snapshot) => {
        const ok = effectRunIdRef.current === runId;
        logger.log('[STREAK] onSnapshot callback', { runId, currentRunId: effectRunIdRef.current, ok, exists: snapshot?.exists?.() });
        if (!ok) return;
        if (!snapshot.exists()) {
          applyLoaded({ streakNumber: 0, flameLevel: 0 });
          return;
        }
        const result = buildStreakResultFromUserData(snapshot.data());
        applyLoaded(result);
      },
      (err) => {
        logger.log('[STREAK] onSnapshot error callback', { runId, currentRunId: effectRunIdRef.current, skip: effectRunIdRef.current !== runId });
        if (effectRunIdRef.current !== runId) return;
        logger.warn?.('🔥 [streak] Listener error:', err);
        applyLoaded({ streakNumber: 0, flameLevel: 0 });
      }
    );

    getActivityStreakState(userId).then((result) => {
      const ok = effectRunIdRef.current === runId;
      logger.log('[STREAK] getActivityStreakState then', { runId, currentRunId: effectRunIdRef.current, ok });
      if (!ok) return;
      applyLoaded(result);
    }).catch((e) => {
      const ok = effectRunIdRef.current === runId;
      logger.log('[STREAK] getActivityStreakState catch', { runId, currentRunId: effectRunIdRef.current, ok, err: String(e?.message || e) });
      if (!ok) return;
      logger.warn?.('🔥 [streak] Initial fetch failed:', e);
      applyLoaded({});
    });

    earlyClearId = setTimeout(() => {
      const ok = effectRunIdRef.current === runId;
      logger.log('[STREAK] earlyClear 400ms', { runId, currentRunId: effectRunIdRef.current, ok });
      if (!ok) return;
      setState((prev) => {
        if (prev._loaded) return prev;
        logger.log('[STREAK] earlyClear: setting _loaded:true');
        return { ...prev, isLoading: false, _loaded: true };
      });
    }, 400);

    loadingFallbackId = setTimeout(() => {
      const ok = effectRunIdRef.current === runId;
      logger.log('[STREAK] loadingFallback 2s', { runId, currentRunId: effectRunIdRef.current, ok });
      if (!ok) return;
      setState((prev) => {
        if (prev._loaded) return prev;
        logger.log('[STREAK] loadingFallback: setting _loaded:true');
        return { ...prev, isLoading: false, _loaded: true };
      });
    }, 2000);

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

    const unsubscribe = (newState) => {
      if (effectRunIdRef.current !== runId) return;
      applyLoaded(newState);
    };
    streakUpdateListeners.add(unsubscribe);

    return () => {
      logger.log('[STREAK] effect cleanup', { runId });
      clearTimeout(earlyClearId);
      clearTimeout(loadingFallbackId);
      unsubFirestore();
      if (midnightTimeoutId) clearTimeout(midnightTimeoutId);
      streakUpdateListeners.delete(unsubscribe);
    };
  }, [userId]);

  return out;
}

export default {
  getTodayLocal,
  getLocalDateString,
  getActivityStreakState,
  updateActivityStreak,
  useActivityStreak,
  clearStreakCache,
  DAYS_WITHOUT_ACTIVITY_TO_DIE
};
