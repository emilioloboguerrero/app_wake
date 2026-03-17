import { QueryClient, QueryCache } from '@tanstack/react-query';
import { WakeApiError } from '../utils/apiClient';
import authService from '../services/authService';

export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error) => {
      if (error instanceof WakeApiError && error.code === 'UNAUTHENTICATED') {
        authService.signOutUser();
      }
    },
  }),
  defaultOptions: {
    queries: {
      staleTime: 2 * 60 * 1000,
      gcTime: 10 * 60 * 1000,
      retry: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      refetchOnMount: true,
    },
    mutations: {
      retry: false,
    },
  },
});

// staleTime tiers for different data types
export const cacheConfig = {
  // Active workout session in progress: always fresh
  activeSession: {
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
  },

  // Program structure (modules, sessions, exercises): 2 minutes
  programStructure: {
    staleTime: 2 * 60 * 1000,
    gcTime: 5 * 60 * 1000,
    refetchOnMount: true,
    refetchOnWindowFocus: false,
  },

  // Nutrition data (diary, assignments): 5 minutes
  nutrition: {
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnMount: true,
    refetchOnWindowFocus: false,
  },

  // PRs and analytics: 15 minutes
  analytics: {
    staleTime: 15 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  },

  // User profile: 5 minutes
  userProfile: {
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  },
};

export const queryKeys = {
  user: {
    detail: (userId) => ['user', userId],
    courses: (userId) => ['user', userId, 'courses'],
    subscriptions: (userId) => ['user', userId, 'subscriptions'],
  },
  programs: {
    detail: (courseId) => ['programs', courseId],
    session: (courseId, moduleId, sessionId) => ['programs', courseId, moduleId, sessionId],
    dailySession: (userId, courseId, date) => ['programs', courseId, 'daily', userId, date],
  },
  nutrition: {
    assignment: (userId) => ['nutrition', 'assignment', userId],
    diary: (userId, date) => ['nutrition', 'diary', userId, date],
  },
  prs: {
    all: (userId) => ['prs', userId],
    exercise: (userId, exerciseKey) => ['prs', userId, exerciseKey],
  },
};
