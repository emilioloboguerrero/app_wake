import React, { createContext, useContext, useMemo, useState, useEffect } from 'react';
import { useAuth } from './AuthContext';
import activityStreakService from '../services/activityStreakService';
import { auth } from '../config/firebase';
import { onAuthStateChanged } from 'firebase/auth';

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
  const { user: contextUser } = useAuth();

  // Subscribe to Firebase auth so we get userId as soon as auth restores (same as WebAppNavigator).
  // Otherwise we only re-render when AuthContext updates, and the layout can show main content
  // (using its own firebaseUser state) before AuthContext has set user, leaving streak with userId undefined.
  const [firebaseUser, setFirebaseUser] = useState(null);
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setFirebaseUser(user || null);
    });
    return unsub;
  }, []);

  const effectiveUser = contextUser || firebaseUser;
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

