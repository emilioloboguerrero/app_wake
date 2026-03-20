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
  isLoading: false,
  userId: null,
  hasUser: false,
};

const ActivityStreakContext = createContext(DEFAULT_STREAK_STATE);

export const useActivityStreakContext = () => {
  return useContext(ActivityStreakContext);
};

export const ActivityStreakProvider = ({ children }) => {
  const { user } = useAuth();
  const userId = user?.uid ?? null;

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
