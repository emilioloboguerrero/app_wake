import { QueryClient } from '@tanstack/react-query';
import { STALE_TIMES, GC_TIMES } from './queryConfig';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: STALE_TIMES.userProfile,
      gcTime: GC_TIMES.userProfile,
      retry: false,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
      refetchOnMount: true,
    },
    mutations: {
      retry: false,
    },
  },
});

export const cacheConfig = {
  activeSession: {
    staleTime: STALE_TIMES.activeSession,
    gcTime: GC_TIMES.activeSession,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
  },

  programStructure: {
    staleTime: STALE_TIMES.programStructure,
    gcTime: GC_TIMES.programStructure,
    refetchOnMount: true,
    // Refetch on focus so coach edits to library exercises propagate to clients
    // when they bring the tab/app back into focus.
    refetchOnWindowFocus: true,
  },

  nutrition: {
    staleTime: STALE_TIMES.nutritionDiary,
    gcTime: GC_TIMES.nutritionDiary,
    refetchOnMount: true,
    refetchOnWindowFocus: false,
  },

  analytics: {
    staleTime: STALE_TIMES.exerciseHistory,
    gcTime: GC_TIMES.exerciseHistory,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  },

  userProfile: {
    staleTime: STALE_TIMES.userProfile,
    gcTime: GC_TIMES.userProfile,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  },

  sessionHistory: {
    staleTime: STALE_TIMES.sessionHistory,
    gcTime: GC_TIMES.sessionHistory,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  },
  videoExchanges: {
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
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
  videoExchanges: {
    byClient: (clientId) => ['videoExchanges', 'client', clientId],
    detail: (exchangeId) => ['videoExchanges', exchangeId],
    unreadCount: (userId) => ['videoExchanges', 'unreadCount', userId],
  },
};
