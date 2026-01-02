// Custom hooks for program data fetching with React Query
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import programService from '../services/programService';
import { getUser } from '../services/firestoreService';
import { queryKeys, cacheConfig } from '../config/queryClient';

// Hook to get all programs for the current creator
export const usePrograms = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useQuery({
    queryKey: user ? queryKeys.programs.byCreator(user.uid) : ['programs', 'none'],
    queryFn: async () => {
      if (!user) return [];
      return await programService.getProgramsByCreator(user.uid);
    },
    enabled: !!user,
    ...cacheConfig.otherPrograms,
  });
};

// Hook to get a single program by ID
export const useProgram = (programId, options = {}) => {
  const { user } = useAuth();
  const { isActive = false, ...queryOptions } = options;

  return useQuery({
    queryKey: programId ? queryKeys.programs.detail(programId) : ['program', 'none'],
    queryFn: async () => {
      if (!programId) return null;
      return await programService.getProgramById(programId);
    },
    enabled: !!programId,
    // Use active program config if editing, otherwise use other programs config
    ...(isActive ? cacheConfig.activeProgram : cacheConfig.otherPrograms),
    ...queryOptions,
  });
};

// Hook to get modules for a program
export const useModules = (programId, options = {}) => {
  const { isActive = false, useCounts = false, ...queryOptions } = options;

  return useQuery({
    queryKey: useCounts 
      ? queryKeys.modules.withCounts(programId)
      : queryKeys.modules.all(programId),
    queryFn: async () => {
      if (!programId) return [];
      if (useCounts) {
        return await programService.getModulesWithCounts(programId);
      }
      return await programService.getModulesByProgram(programId);
    },
    enabled: !!programId,
    ...(isActive ? cacheConfig.activeProgram : cacheConfig.programStructure),
    ...queryOptions,
  });
};

// Hook to get sessions for a module
export const useSessions = (programId, moduleId, options = {}) => {
  const { isActive = false, ...queryOptions } = options;

  return useQuery({
    queryKey: queryKeys.sessions.all(programId, moduleId),
    queryFn: async () => {
      if (!programId || !moduleId) return [];
      return await programService.getSessionsByModule(programId, moduleId);
    },
    enabled: !!programId && !!moduleId,
    ...(isActive ? cacheConfig.activeProgram : cacheConfig.programStructure),
    ...queryOptions,
  });
};

// Hook to get exercises for a session
export const useExercises = (programId, moduleId, sessionId, options = {}) => {
  const { isActive = false, ...queryOptions } = options;

  return useQuery({
    queryKey: queryKeys.exercises.all(programId, moduleId, sessionId),
    queryFn: async () => {
      if (!programId || !moduleId || !sessionId) return [];
      return await programService.getExercisesBySession(programId, moduleId, sessionId);
    },
    enabled: !!programId && !!moduleId && !!sessionId,
    ...(isActive ? cacheConfig.activeProgram : cacheConfig.programStructure),
    ...queryOptions,
  });
};

// Hook to get sets for an exercise
export const useSets = (programId, moduleId, sessionId, exerciseId, options = {}) => {
  const { isActive = false, ...queryOptions } = options;

  return useQuery({
    queryKey: queryKeys.sets.all(programId, moduleId, sessionId, exerciseId),
    queryFn: async () => {
      if (!programId || !moduleId || !sessionId || !exerciseId) return [];
      return await programService.getSetsByExercise(programId, moduleId, sessionId, exerciseId);
    },
    enabled: !!programId && !!moduleId && !!sessionId && !!exerciseId,
    ...(isActive ? cacheConfig.activeProgram : cacheConfig.programStructure),
    ...queryOptions,
  });
};

// Mutation hooks with optimistic updates

// Create module mutation
export const useCreateModule = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ programId, moduleName }) => {
      return await programService.createModule(programId, moduleName);
    },
    onMutate: async ({ programId, moduleName }) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: queryKeys.modules.all(programId) });

      // Snapshot previous value
      const previousModules = queryClient.getQueryData(queryKeys.modules.all(programId)) || [];

      // Optimistically update
      const tempId = `temp-${Date.now()}`;
      const optimisticModule = {
        id: tempId,
        title: moduleName,
        order: previousModules.length,
        created_at: new Date(),
        updated_at: new Date(),
      };

      queryClient.setQueryData(queryKeys.modules.all(programId), [
        ...previousModules,
        optimisticModule,
      ]);

      return { previousModules, tempId };
    },
    onError: (err, variables, context) => {
      // Rollback on error
      if (context?.previousModules) {
        queryClient.setQueryData(
          queryKeys.modules.all(variables.programId),
          context.previousModules
        );
      }
    },
    onSuccess: (data, variables) => {
      // Invalidate to refetch with real data
      queryClient.invalidateQueries({ queryKey: queryKeys.modules.all(variables.programId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.modules.withCounts(variables.programId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.programs.detail(variables.programId) });
    },
  });
};

// Update module order mutation (with debouncing handled in component)
export const useUpdateModuleOrder = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ programId, moduleOrders }) => {
      return await programService.updateModuleOrder(programId, moduleOrders);
    },
    onSuccess: (data, variables) => {
      // Invalidate to ensure consistency
      queryClient.invalidateQueries({ queryKey: queryKeys.modules.all(variables.programId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.modules.withCounts(variables.programId) });
    },
  });
};

// Delete module mutation
export const useDeleteModule = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ programId, moduleId }) => {
      return await programService.deleteModule(programId, moduleId);
    },
    onMutate: async ({ programId, moduleId }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.modules.all(programId) });
      const previousModules = queryClient.getQueryData(queryKeys.modules.all(programId)) || [];
      
      queryClient.setQueryData(
        queryKeys.modules.all(programId),
        previousModules.filter(m => m.id !== moduleId)
      );

      return { previousModules };
    },
    onError: (err, variables, context) => {
      if (context?.previousModules) {
        queryClient.setQueryData(
          queryKeys.modules.all(variables.programId),
          context.previousModules
        );
      }
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.modules.all(variables.programId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.modules.withCounts(variables.programId) });
    },
  });
};

// Create session mutation
export const useCreateSession = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ programId, moduleId, sessionName, order, imageUrl }) => {
      return await programService.createSession(programId, moduleId, sessionName, order, imageUrl);
    },
    onMutate: async ({ programId, moduleId, sessionName, imageUrl }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.sessions.all(programId, moduleId) });
      const previousSessions = queryClient.getQueryData(queryKeys.sessions.all(programId, moduleId)) || [];

      const tempId = `temp-${Date.now()}`;
      const optimisticSession = {
        id: tempId,
        title: sessionName,
        order: previousSessions.length,
        image_url: imageUrl,
        created_at: new Date(),
        updated_at: new Date(),
      };

      queryClient.setQueryData(queryKeys.sessions.all(programId, moduleId), [
        ...previousSessions,
        optimisticSession,
      ]);

      return { previousSessions, tempId };
    },
    onError: (err, variables, context) => {
      if (context?.previousSessions) {
        queryClient.setQueryData(
          queryKeys.sessions.all(variables.programId, variables.moduleId),
          context.previousSessions
        );
      }
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.sessions.all(variables.programId, variables.moduleId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.modules.withCounts(variables.programId) });
    },
  });
};

// Update session order mutation
export const useUpdateSessionOrder = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ programId, moduleId, sessionOrders }) => {
      return await programService.updateSessionOrder(programId, moduleId, sessionOrders);
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.sessions.all(variables.programId, variables.moduleId) });
    },
  });
};

// Create exercise mutation
export const useCreateExercise = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ programId, moduleId, sessionId, exerciseName, order }) => {
      return await programService.createExercise(programId, moduleId, sessionId, exerciseName, order);
    },
    onMutate: async ({ programId, moduleId, sessionId, exerciseName }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.exercises.all(programId, moduleId, sessionId) });
      const previousExercises = queryClient.getQueryData(queryKeys.exercises.all(programId, moduleId, sessionId)) || [];

      const tempId = `temp-${Date.now()}`;
      const optimisticExercise = {
        id: tempId,
        title: exerciseName,
        name: exerciseName,
        order: previousExercises.length,
        created_at: new Date(),
        updated_at: new Date(),
      };

      queryClient.setQueryData(queryKeys.exercises.all(programId, moduleId, sessionId), [
        ...previousExercises,
        optimisticExercise,
      ]);

      return { previousExercises, tempId };
    },
    onError: (err, variables, context) => {
      if (context?.previousExercises) {
        queryClient.setQueryData(
          queryKeys.exercises.all(variables.programId, variables.moduleId, variables.sessionId),
          context.previousExercises
        );
      }
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.exercises.all(variables.programId, variables.moduleId, variables.sessionId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.sessions.all(variables.programId, variables.moduleId) });
    },
  });
};

// Update exercise mutation
export const useUpdateExercise = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ programId, moduleId, sessionId, exerciseId, updates }) => {
      return await programService.updateExercise(programId, moduleId, sessionId, exerciseId, updates);
    },
    onMutate: async ({ programId, moduleId, sessionId, exerciseId, updates }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.exercises.all(programId, moduleId, sessionId) });
      const previousExercises = queryClient.getQueryData(queryKeys.exercises.all(programId, moduleId, sessionId)) || [];

      const updatedExercises = previousExercises.map(ex => 
        ex.id === exerciseId ? { ...ex, ...updates } : ex
      );
      queryClient.setQueryData(queryKeys.exercises.all(programId, moduleId, sessionId), updatedExercises);

      return { previousExercises };
    },
    onError: (err, variables, context) => {
      if (context?.previousExercises) {
        queryClient.setQueryData(
          queryKeys.exercises.all(variables.programId, variables.moduleId, variables.sessionId),
          context.previousExercises
        );
      }
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.exercises.all(variables.programId, variables.moduleId, variables.sessionId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.sessions.all(variables.programId, variables.moduleId) });
    },
  });
};

// Delete exercise mutation
export const useDeleteExercise = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ programId, moduleId, sessionId, exerciseId }) => {
      return await programService.deleteExercise(programId, moduleId, sessionId, exerciseId);
    },
    onMutate: async ({ programId, moduleId, sessionId, exerciseId }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.exercises.all(programId, moduleId, sessionId) });
      const previousExercises = queryClient.getQueryData(queryKeys.exercises.all(programId, moduleId, sessionId)) || [];

      queryClient.setQueryData(
        queryKeys.exercises.all(programId, moduleId, sessionId),
        previousExercises.filter(ex => ex.id !== exerciseId)
      );

      return { previousExercises };
    },
    onError: (err, variables, context) => {
      if (context?.previousExercises) {
        queryClient.setQueryData(
          queryKeys.exercises.all(variables.programId, variables.moduleId, variables.sessionId),
          context.previousExercises
        );
      }
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.exercises.all(variables.programId, variables.moduleId, variables.sessionId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.sessions.all(variables.programId, variables.moduleId) });
    },
  });
};

// Update exercise order mutation
export const useUpdateExerciseOrder = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ programId, moduleId, sessionId, exerciseOrders }) => {
      return await programService.updateExerciseOrder(programId, moduleId, sessionId, exerciseOrders);
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.exercises.all(variables.programId, variables.moduleId, variables.sessionId) });
    },
  });
};

