import React, { createContext, useContext, useMemo } from 'react';
import { useAuth } from './AuthContext';
import activityStreakService from '../services/activityStreakService';

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

export const ActivityStreakProvider = ({ children }) => {
  const { user: contextUser } = useAuth();

  // Stay in sync with auth detection used in WebAppNavigator:
  // Prefer AuthContext user, but fall back to direct Firebase auth.currentUser
  let directAuthUser = null;
  try {
    // eslint-disable-next-line global-require, import/no-unresolved
    const { auth } = require('../config/firebase');
    directAuthUser = auth.currentUser || null;
  } catch (_e) {
    // Ignore – best-effort fallback only
  }

  const effectiveUser = contextUser || directAuthUser;
  const userId = effectiveUser?.uid ?? null;

  const streakState = activityStreakService.useActivityStreak(userId);

  const value = useMemo(
    () => ({
      ...DEFAULT_STREAK_STATE,
      ...streakState,
      userId,
      hasUser: !!userId,
    }),
    [streakState, userId]
  );

  return (
    <ActivityStreakContext.Provider value={value}>
      {children}
    </ActivityStreakContext.Provider>
  );
};

