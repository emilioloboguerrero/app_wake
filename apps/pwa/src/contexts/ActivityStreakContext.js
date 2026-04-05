import React, { createContext, useContext, useMemo, useState, useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { useAuth } from './AuthContext';
import { computeStreakState, getTodayLocal } from '../services/activityStreakService';

const DEFAULT_STREAK_STATE = {
  streakNumber: 0,
  flameLevel: 0,
  longestStreak: 0,
  longestStreakStartDate: null,
  longestStreakEndDate: null,
  streakStartDate: null,
  lastActivityDate: null,
  isLoading: true,
  userId: null,
  hasUser: false,
};

const ActivityStreakContext = createContext(DEFAULT_STREAK_STATE);

export const useActivityStreakContext = () => {
  return useContext(ActivityStreakContext);
};

/**
 * Web: subscribes to React Query cache for user profile (activityStreak field).
 * Native: fetches profile via apiClient on mount (no QueryClientProvider at top level).
 */
export const ActivityStreakProvider = ({ children }) => {
  const { user } = useAuth();
  const userId = user?.uid ?? null;
  const [today, setToday] = useState(getTodayLocal);
  const [activityStreak, setActivityStreak] = useState(null);
  const [profileLoaded, setProfileLoaded] = useState(false);

  // Midnight refresh
  useEffect(() => {
    const now = new Date();
    const nextMidnight = new Date(now);
    nextMidnight.setHours(24, 0, 0, 0);
    const ms = Math.max(0, nextMidnight.getTime() - now.getTime() + 1000);
    const id = setTimeout(() => setToday(getTodayLocal()), ms);
    return () => clearTimeout(id);
  }, [today]);

  const isWeb = Platform.OS === 'web';

  // Web path: subscribe to React Query cache
  useEffect(() => {
    if (!isWeb || !userId) {
      if (!userId) {
        setActivityStreak(null);
        setProfileLoaded(false);
      }
      return;
    }

    const { queryClient } = require('../config/queryClient');
    const { queryKeys } = require('../config/queryClient');
    const queryKey = queryKeys.user.detail(userId);

    const cached = queryClient.getQueryData(queryKey);
    if (cached?.activityStreak !== undefined) {
      setActivityStreak(cached.activityStreak);
      setProfileLoaded(true);
    }

    const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
      if (event?.type === 'updated' && event.query?.queryKey?.[0] === 'user' && event.query?.queryKey?.[1] === userId) {
        const data = event.query.state?.data;
        if (data?.activityStreak !== undefined) {
          setActivityStreak(data.activityStreak);
          setProfileLoaded(true);
        }
      }
    });

    return unsubscribe;
  }, [isWeb, userId]);

  // Native path: fetch profile directly
  const fetchedRef = useRef(null);
  useEffect(() => {
    if (isWeb || !userId) return;
    if (fetchedRef.current === userId) return;
    fetchedRef.current = userId;

    const apiClient = require('../utils/apiClient').default;
    apiClient.get('/users/me').then((res) => {
      const data = res?.data ?? res;
      setActivityStreak(data?.activityStreak ?? null);
      setProfileLoaded(true);
    }).catch(() => {
      setProfileLoaded(true);
    });
  }, [isWeb, userId]);

  const value = useMemo(() => {
    if (!userId) return DEFAULT_STREAK_STATE;

    const computed = computeStreakState(activityStreak, today);

    return {
      ...computed,
      isLoading: !profileLoaded,
      userId,
      hasUser: true,
    };
  }, [userId, activityStreak, today, profileLoaded]);

  return (
    <ActivityStreakContext.Provider value={value}>
      {children}
    </ActivityStreakContext.Provider>
  );
};
