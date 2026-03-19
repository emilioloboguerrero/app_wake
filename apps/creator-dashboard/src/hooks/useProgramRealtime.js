import { useEffect } from 'react';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { queryKeys, cacheConfig } from '../config/queryClient';
import programService from '../services/programService';

const ACTIVE_REFETCH_INTERVAL = 30 * 1000; // 30 seconds when actively editing

/**
 * Hook to keep program and module data fresh during active editing.
 * Replaced onSnapshot with polling-based React Query — no Firestore listeners.
 */
export const useProgramRealtime = (programId, isActive = false) => {
  const queryClient = useQueryClient();

  useQuery({
    queryKey: queryKeys.programs.detail(programId),
    queryFn: () => programService.getProgramById(programId),
    enabled: !!programId && isActive,
    staleTime: cacheConfig.programStructure.staleTime,
    gcTime: cacheConfig.programStructure.gcTime,
    refetchInterval: isActive ? ACTIVE_REFETCH_INTERVAL : false,
    refetchOnWindowFocus: isActive,
  });

  useQuery({
    queryKey: queryKeys.modules.all(programId),
    queryFn: () => programService.getModulesByProgram(programId),
    enabled: !!programId && isActive,
    staleTime: cacheConfig.programStructure.staleTime,
    gcTime: cacheConfig.programStructure.gcTime,
    refetchInterval: isActive ? ACTIVE_REFETCH_INTERVAL : false,
    refetchOnWindowFocus: isActive,
  });

  useEffect(() => {
    if (!programId || !isActive) return;
    queryClient.invalidateQueries({ queryKey: queryKeys.programs.detail(programId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.modules.all(programId) });
  }, [programId, isActive, queryClient]);
};

/**
 * Hook to keep session data fresh for a module during active editing.
 */
export const useModuleSessionsRealtime = (programId, moduleId, isActive = false) => {
  const queryClient = useQueryClient();

  useQuery({
    queryKey: queryKeys.sessions.all(programId, moduleId),
    queryFn: () => programService.getSessionsByModule(programId, moduleId),
    enabled: !!programId && !!moduleId && isActive,
    staleTime: cacheConfig.programStructure.staleTime,
    gcTime: cacheConfig.programStructure.gcTime,
    refetchInterval: isActive ? ACTIVE_REFETCH_INTERVAL : false,
    refetchOnWindowFocus: isActive,
  });

  useEffect(() => {
    if (!programId || !moduleId || !isActive) return;
    queryClient.invalidateQueries({ queryKey: queryKeys.sessions.all(programId, moduleId) });
  }, [programId, moduleId, isActive, queryClient]);
};

/**
 * Hook to keep exercise data fresh for a session during active editing.
 */
export const useSessionExercisesRealtime = (programId, moduleId, sessionId, isActive = false) => {
  const queryClient = useQueryClient();

  useQuery({
    queryKey: queryKeys.exercises.all(programId, moduleId, sessionId),
    queryFn: () => programService.getExercisesBySession(programId, moduleId, sessionId),
    enabled: !!programId && !!moduleId && !!sessionId && isActive,
    staleTime: cacheConfig.programStructure.staleTime,
    gcTime: cacheConfig.programStructure.gcTime,
    refetchInterval: isActive ? ACTIVE_REFETCH_INTERVAL : false,
    refetchOnWindowFocus: isActive,
  });

  useEffect(() => {
    if (!programId || !moduleId || !sessionId || !isActive) return;
    queryClient.invalidateQueries({ queryKey: queryKeys.exercises.all(programId, moduleId, sessionId) });
  }, [programId, moduleId, sessionId, isActive, queryClient]);
};
