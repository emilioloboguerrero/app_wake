// React Query configuration for Wake Web Dashboard
// 
// EDGE CASES HANDLED:
// 1. Network failures: Retry logic (2 retries for queries, 1 for mutations)
// 2. Concurrent edits: Real-time listeners detect external changes
// 3. Race conditions: Optimistic updates with rollback on error
// 4. Cache invalidation: Smart invalidation on write completion
// 5. Stale data: Active program has no cache (staleTime: 0)
// 6. Tab visibility: Real-time listeners pause when tab is hidden
// 7. Memory leaks: All listeners cleaned up on unmount
// 8. Batch limits: Firestore batch writes limited to 500 operations
// 9. Partial failures: Batch writes are atomic (all or nothing)
// 10. Offline scenarios: React Query handles offline gracefully
// 11. Error recovery: Optimistic updates rollback on error
// 12. Data consistency: Cache invalidation ensures fresh data after writes
// 13. Debounce conflicts: Debounced functions are flushed on edit mode exit
// 14. Listener conflicts: Only one set of listeners active at a time
// 15. Completeness flags: Denormalized flags prevent N+1 queries
//
import { QueryClient } from '@tanstack/react-query';

// Create query client with optimized defaults
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Default stale time: 5 minutes
      staleTime: 5 * 60 * 1000,
      // Default cache time: 10 minutes
      gcTime: 10 * 60 * 1000, // Previously cacheTime
      // Retry failed requests
      retry: 2,
      // Disable refetch on window focus by default (respect staleTime instead)
      // Individual queries can override this if needed
      refetchOnWindowFocus: false,
      // Don't refetch on reconnect if data is fresh
      refetchOnReconnect: true,
      // Refetch on mount if data is stale
      refetchOnMount: true,
    },
    mutations: {
      // Retry mutations once on failure
      retry: 1,
    },
  },
});

// Cache configuration for different data types
export const cacheConfig = {
  // Active program being edited: no cache, always fresh
  activeProgram: {
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
  },
  
  // Other programs: cache for 5 minutes
  otherPrograms: {
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  },
  
  // Analytics: cache for 15 minutes
  analytics: {
    staleTime: 15 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  },
  
  // Program structure (modules, sessions, exercises): cache for 2 minutes
  programStructure: {
    staleTime: 2 * 60 * 1000,
    gcTime: 5 * 60 * 1000,
    refetchOnMount: true,
    refetchOnWindowFocus: false,
  },
};

// Query keys factory
export const queryKeys = {
  programs: {
    all: () => ['programs'],
    byCreator: (creatorId) => ['programs', 'creator', creatorId],
    detail: (programId) => ['programs', programId],
  },
  modules: {
    all: (programId) => ['programs', programId, 'modules'],
    detail: (programId, moduleId) => ['programs', programId, 'modules', moduleId],
    withCounts: (programId) => ['programs', programId, 'modules', 'withCounts'],
  },
  sessions: {
    all: (programId, moduleId) => ['programs', programId, 'modules', moduleId, 'sessions'],
    detail: (programId, moduleId, sessionId) => ['programs', programId, 'modules', moduleId, 'sessions', sessionId],
  },
  exercises: {
    all: (programId, moduleId, sessionId) => ['programs', programId, 'modules', moduleId, 'sessions', sessionId, 'exercises'],
    detail: (programId, moduleId, sessionId, exerciseId) => ['programs', programId, 'modules', moduleId, 'sessions', sessionId, 'exercises', exerciseId],
  },
  sets: {
    all: (programId, moduleId, sessionId, exerciseId) => ['programs', programId, 'modules', moduleId, 'sessions', sessionId, 'exercises', exerciseId, 'sets'],
  },
  analytics: {
    program: (programId) => ['analytics', 'program', programId],
  },
  user: {
    detail: (userId) => ['user', userId],
  },
};

