// Session Service - Single source of truth for all session operations
import sessionManager from './sessionManager';
import oneRepMaxService from './oneRepMaxService';
import exerciseHistoryService from './exerciseHistoryService';
import apiClient from '../utils/apiClient';
import logger from '../utils/logger.js';
import { queryClient } from '../config/queryClient';

class SessionService {
  constructor() {
    this.cache = new Map();
    this.inflight = new Map();
    this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
  }

  /**
   * Get current session state - single method for all session operations
   */
  async getCurrentSession(userId, courseId, options = {}) {
    const {
      forceRefresh = false,
      manualSessionId = null,
      manualSessionIndex = null,
      targetDate = null
    } = options;

    const cacheKey = targetDate ? `${userId}|${courseId}|${targetDate}` : `${userId}|${courseId}`;

    logger.debug('[SessionService.getCurrentSession] called', {
      userId, courseId, options: { forceRefresh, manualSessionId, manualSessionIndex, targetDate },
      cacheKey,
    });

    try {

      // Check cache first (unless force refresh) - 5 minute cache
      if (!forceRefresh) {
        const cached = this.cache.get(cacheKey);
        if (cached && (Date.now() - cached.timestamp) < 300000) {
          const ageMs = Date.now() - cached.timestamp;
          logger.debug('[SessionService.getCurrentSession] CACHE HIT', {
            cacheKey, ageMs, hasSession: !!cached.data?.session, emptyReason: cached.data?.emptyReason,
            allSessionsCount: cached.data?.allSessions?.length,
          });
          return cached.data;
        }
        if (cached) {
          logger.debug('[SessionService.getCurrentSession] CACHE EXPIRED', { cacheKey, ageMs: Date.now() - cached.timestamp });
        } else {
          logger.debug('[SessionService.getCurrentSession] CACHE MISS', { cacheKey });
        }
      } else {
        logger.debug('[SessionService.getCurrentSession] FORCE REFRESH - skipping cache');
      }

      // Build query params
      const params = { courseId };
      if (targetDate) params.date = targetDate;
      if (manualSessionId) params.sessionId = manualSessionId;

      logger.debug('[SessionService.getCurrentSession] API params', params);

      // Deduplicate in-flight requests with the same key
      const inflightKey = manualSessionId ? `${cacheKey}|${manualSessionId}` : cacheKey;
      if (this.inflight.has(inflightKey)) {
        logger.debug('[SessionService.getCurrentSession] INFLIGHT DEDUP - reusing pending request', { inflightKey });
        return this.inflight.get(inflightKey);
      }

      const fetchPromise = this._fetchDaily(params, cacheKey, manualSessionId, manualSessionIndex);
      this.inflight.set(inflightKey, fetchPromise);
      try {
        return await fetchPromise;
      } finally {
        this.inflight.delete(inflightKey);
      }

    } catch (error) {
      logger.error('Error getting current session:', error);
      return {
        session: null,
        workout: null,
        index: 0,
        isManual: false,
        allSessions: [],
        progress: null,
        isLoading: false,
        error: error.message,
        emptyReason: null
      };
    }
  }

  async _fetchDaily(params, cacheKey, manualSessionId, manualSessionIndex) {
      logger.debug('[SessionService._fetchDaily] requesting GET /workout/daily', { params });
      const res = await apiClient.get('/workout/daily', { params });

      const d = res?.data;
      logger.debug('[SessionService._fetchDaily] raw API response', {
        hasSession: d?.hasSession,
        isRestDay: d?.isRestDay,
        emptyReason: d?.emptyReason,
        allSessionsCount: d?.allSessions?.length,
        allSessions: d?.allSessions?.map(s => ({ sessionId: s.sessionId, title: s.title, moduleId: s.moduleId, plannedDate: s.plannedDate, order: s.order })),
        sessionId: d?.session?.sessionId,
        sessionTitle: d?.session?.title,
        sessionModuleId: d?.session?.moduleId,
        sessionPlannedDate: d?.session?.plannedDate,
        exerciseCount: d?.session?.exercises?.length,
        progress: d?.progress,
        todaySessionAlreadyCompleted: d?.todaySessionAlreadyCompleted,
      });

      if (!d?.hasSession) {
        logger.debug('[SessionService._fetchDaily] NO SESSION returned', {
          emptyReason: d?.emptyReason, progress: d?.progress,
        });
        const sessionState = {
          session: null,
          workout: null,
          index: 0,
          isManual: false,
          allSessions: [],
          progress: d?.progress ?? null,
          isLoading: false,
          error: null,
          emptyReason: d?.emptyReason ?? null,
          todaySessionAlreadyCompleted: false,
        };
        this.cache.set(cacheKey, { data: sessionState, timestamp: Date.now() });
        return sessionState;
      }

      const apiSession = d.session;

      // Map API exercises to internal workout exercise shape
      const workoutExercises = (apiSession.exercises ?? []).map(ex => ({
        id: ex.exerciseId,
        // ex.name is hydrated server-side to the displayName. We deliberately do NOT
        // fall back to Object.values(ex.primary)[0] because that's now an exerciseId.
        name: ex.name || '',
        description: ex.description,
        video_url: ex.video_url,
        muscle_activation: ex.muscle_activation,
        implements: ex.implements ?? [],
        libraryId: ex.libraryId || (ex.primary && typeof ex.primary === 'object' ? Object.keys(ex.primary)[0] : null),
        order: ex.order,
        primary: ex.primary,
        alternatives: ex.alternatives ?? {},
        objectives: ex.objectives ?? [],
        measures: ex.measures ?? [],
        customMeasureLabels: ex.customMeasureLabels ?? {},
        customObjectiveLabels: ex.customObjectiveLabels ?? {},
        sets: (ex.sets ?? []).map(s => ({
          id: s.setId,
          reps: s.reps,
          weight: s.weight,
          intensity: s.intensity,
          rir: s.rir,
          title: s.title,
          order: s.order,
        })),
        lastPerformance: ex.lastPerformance ?? null,
      }));

      const workout = {
        id: apiSession.sessionId,
        title: apiSession.title,
        description: '',
        moduleId: apiSession.moduleId,
        moduleTitle: apiSession.moduleTitle,
        sessionId: apiSession.sessionId,
        image_url: apiSession.image_url,
        exercises: workoutExercises,
      };

      // Raw session object (for sessionManager.startSession and similar)
      const session = {
        id: apiSession.sessionId,
        sessionId: apiSession.sessionId,
        title: apiSession.title,
        image_url: apiSession.image_url,
        moduleId: apiSession.moduleId,
        moduleTitle: apiSession.moduleTitle,
        plannedDate: apiSession.plannedDate ?? null,
        exercises: (apiSession.exercises ?? []).map(ex => ({
          id: ex.exerciseId,
          primary: ex.primary,
          order: ex.order,
          objectives: ex.objectives ?? [],
          measures: ex.measures ?? [],
          alternatives: ex.alternatives ?? {},
          customMeasureLabels: ex.customMeasureLabels ?? {},
          customObjectiveLabels: ex.customObjectiveLabels ?? {},
          sets: (ex.sets ?? []).map(s => ({
            id: s.setId,
            reps: s.reps,
            weight: s.weight,
            intensity: s.intensity,
            rir: s.rir,
            title: s.title,
            order: s.order,
          })),
        })),
      };

      // allSessions for session picker
      const allSessions = (d.allSessions ?? []).map(s => ({
        id: s.sessionId,
        sessionId: s.sessionId,
        title: s.title,
        moduleId: s.moduleId,
        moduleTitle: s.moduleTitle,
        order: s.order,
        plannedDate: s.plannedDate ?? null,
        image_url: s.image_url ?? null,
      }));

      const currentIndex = allSessions.findIndex(s => s.sessionId === apiSession.sessionId);

      const sessionState = {
        session,
        workout,
        index: currentIndex >= 0 ? currentIndex : (manualSessionIndex ?? 0),
        isManual: !!manualSessionId,
        allSessions,
        progress: d.progress,
        isLoading: false,
        error: null,
        emptyReason: null,
        todaySessionAlreadyCompleted: d.todaySessionAlreadyCompleted ?? false,
        availableLibraries: d.availableLibraries ?? [],
      };

      logger.debug('[SessionService._fetchDaily] MAPPED session state', {
        sessionId: session.id,
        sessionTitle: session.title,
        workoutId: workout.id,
        workoutExerciseCount: workout.exercises?.length,
        workoutExercises: workout.exercises?.map(e => ({ id: e.id, name: e.name, setsCount: e.sets?.length })),
        allSessionsCount: allSessions.length,
        allSessions: allSessions.map(s => ({ id: s.sessionId, title: s.title, moduleId: s.moduleId, plannedDate: s.plannedDate })),
        currentIndex,
        isManual: !!manualSessionId,
        progress: d.progress,
      });

      this.cache.set(cacheKey, { data: sessionState, timestamp: Date.now() });
      return sessionState;
  }

  /**
   * Select a session manually — uses lightweight endpoint (skips allSessions rebuild)
   * @param {string} userId
   * @param {string} courseId
   * @param {string} sessionId
   * @param {number} sessionIndex
   * @param {Object} [existingState] - current sessionState with allSessions/progress to reuse
   */
  async selectSession(userId, courseId, sessionId, sessionIndex, existingState = null) {
    try {
      // Find moduleId from existing allSessions for the lightweight endpoint
      const allSessions = existingState?.allSessions ?? [];
      const targetSession = allSessions.find(s => s.sessionId === sessionId || s.id === sessionId);
      const moduleId = targetSession?.moduleId ?? null;

      const res = await apiClient.get('/workout/session-exercises', {
        params: { courseId, sessionId, moduleId }
      });

      const apiSession = res?.data?.session;
      if (!apiSession) {
        throw new Error('No session data returned');
      }

      // Map API exercises to internal workout exercise shape (same as getCurrentSession)
      const workoutExercises = (apiSession.exercises ?? []).map(ex => ({
        id: ex.exerciseId,
        // ex.name is hydrated server-side to the displayName. We deliberately do NOT
        // fall back to Object.values(ex.primary)[0] because that's now an exerciseId.
        name: ex.name || '',
        description: ex.description,
        video_url: ex.video_url,
        muscle_activation: ex.muscle_activation,
        implements: ex.implements ?? [],
        libraryId: ex.libraryId || (ex.primary && typeof ex.primary === 'object' ? Object.keys(ex.primary)[0] : null),
        order: ex.order,
        primary: ex.primary,
        alternatives: ex.alternatives ?? {},
        objectives: ex.objectives ?? [],
        measures: ex.measures ?? [],
        customMeasureLabels: ex.customMeasureLabels ?? {},
        customObjectiveLabels: ex.customObjectiveLabels ?? {},
        sets: (ex.sets ?? []).map(s => ({
          id: s.setId,
          reps: s.reps,
          weight: s.weight,
          intensity: s.intensity,
          rir: s.rir,
          title: s.title,
          order: s.order,
        })),
        lastPerformance: ex.lastPerformance ?? null,
      }));

      const workout = {
        id: apiSession.sessionId,
        title: apiSession.title,
        description: '',
        moduleId: apiSession.moduleId,
        moduleTitle: apiSession.moduleTitle,
        sessionId: apiSession.sessionId,
        image_url: apiSession.image_url,
        exercises: workoutExercises,
      };

      const session = {
        id: apiSession.sessionId,
        sessionId: apiSession.sessionId,
        title: apiSession.title,
        image_url: apiSession.image_url,
        moduleId: apiSession.moduleId,
        moduleTitle: apiSession.moduleTitle,
        exercises: (apiSession.exercises ?? []).map(ex => ({
          id: ex.exerciseId,
          primary: ex.primary,
          order: ex.order,
          objectives: ex.objectives ?? [],
          measures: ex.measures ?? [],
          alternatives: ex.alternatives ?? {},
          customMeasureLabels: ex.customMeasureLabels ?? {},
          customObjectiveLabels: ex.customObjectiveLabels ?? {},
          sets: (ex.sets ?? []).map(s => ({
            id: s.setId, reps: s.reps, weight: s.weight, intensity: s.intensity,
            rir: s.rir, title: s.title, order: s.order,
          })),
        })),
      };

      const sessionState = {
        session,
        workout,
        index: sessionIndex ?? 0,
        isManual: true,
        allSessions,
        progress: existingState?.progress ?? null,
        isLoading: false,
        error: null,
        emptyReason: null,
        todaySessionAlreadyCompleted: false,
      };

      // Update cache with the new session state
      const cacheKey = `${userId}|${courseId}`;
      this.cache.set(cacheKey, { data: sessionState, timestamp: Date.now() });

      return sessionState;
    } catch (error) {
      logger.error('Error selecting session:', error);
      throw error;
    }
  }

  /**
   * Build planned snapshot from workout template (for session history).
   * Captures what was planned at completion time so history is self-contained.
   */
  buildPlannedSnapshot(workout) {
    if (!workout || !workout.exercises || !Array.isArray(workout.exercises)) return null;
    return {
      exercises: workout.exercises.map(ex => ({
        id: ex.id,
        title: ex.name || ex.exerciseName || '',
        name: ex.name || ex.exerciseName || '',
        primary: ex.primary || (ex.libraryId ? { [ex.libraryId]: ex.name || ex.exerciseName } : {}),
        sets: (ex.sets || []).map(s => ({
          reps: s.reps,
          weight: s.weight,
          intensity: s.intensity
        }))
      }))
    };
  }

  /**
   * Complete a session
   * @param {string} userId - User ID
   * @param {string} courseId - Course ID
   * @param {Object} sessionData - Session/workout data with performed exercises
   * @param {Object} [options] - Optional options
   * @param {Object} [options.plannedWorkout] - Original workout template (before user merge) for planned snapshot
   */
  async completeSession(userId, courseId, sessionData, options = {}) {
    try {
      // Handle both session objects and workout objects
      let actualSessionData;

      if (sessionData.exercises && sessionData.exercises[0] && sessionData.exercises[0].exerciseId) {
        actualSessionData = sessionData;
      } else {
        actualSessionData = this.convertWorkoutToSession(sessionData, userId, courseId);
        
        // Get the actual session from sessionManager to preserve startTime
        try {
          const currentSession = await sessionManager.getCurrentSession();
          if (currentSession && currentSession.startTime) {
            actualSessionData.startTime = currentSession.startTime;
          }
        } catch (error) {
          // Could not get current session for startTime
        }
      }

      // Always ensure required fields exist (fixes checkpoint recovery path
      // where exercises have exerciseId but courseId/completedAt/duration are missing)
      actualSessionData.courseId = actualSessionData.courseId || courseId;
      actualSessionData.completedAt = actualSessionData.completedAt || new Date().toISOString();
      actualSessionData.duration = actualSessionData.duration ?? 0;
      actualSessionData.sessionId = actualSessionData.sessionId || actualSessionData.id || `session_${Date.now()}`;

      // Merge user notes
      actualSessionData.userNotes = options.userNotes ?? actualSessionData.userNotes ?? '';

      // Build planned snapshot from template when available
      const plannedSnapshot = options.plannedWorkout
        ? this.buildPlannedSnapshot(options.plannedWorkout)
        : null;

      // Submit session — server handles course progress, 1RM, streak atomically
      const serverResult = await this.addSessionData(userId, actualSessionData, plannedSnapshot);
      const personalRecords = serverResult?.personalRecords ?? [];
      if (serverResult?.completionId) {
        actualSessionData.completionDocId = serverResult.completionId;
      }

      // Calculate stats
      const stats = this.calculateStats(actualSessionData);

      // Calculate muscle volumes for display using plannedWorkout (already has muscle_activation from GET /workout/daily)
      let sessionMuscleVolumes = {};
      try {
        const workoutForVolume = options.plannedWorkout ?? null;
        if (workoutForVolume?.exercises?.length) {
          sessionMuscleVolumes = this.calculateSimpleMuscleVolumes(actualSessionData, workoutForVolume);
        }
      } catch (error) {
        logger.error('Error calculating muscle volumes:', error);
      }

      // Clear caches to force refresh
      this.clearCache(userId, courseId);
      queryClient.invalidateQueries({ queryKey: ['user', userId] });


      return {
        sessionData: actualSessionData,
        stats,
        sessionMuscleVolumes,
        personalRecords,
      };

    } catch (error) {
      logger.error('Error completing session:', error);
      throw error;
    }
  }

  /**
   * SIMPLIFIED VOLUME CALCULATION
   * Only count sets where user actually performed reps/weight AND intensity >= 7
   */
  calculateSimpleMuscleVolumes(sessionData, workoutData) {
    const muscleSets = {};

    sessionData.exercises.forEach((sessionExercise) => {
      const workoutExercise = workoutData.exercises.find(we =>
        we.name === sessionExercise.exerciseName || we.id === sessionExercise.exerciseId
      );

      if (!workoutExercise?.muscle_activation) return;

      let effectiveSets = 0;
      sessionExercise.sets.forEach((set) => {
        const hasActualReps = set.reps && set.reps !== '' && !isNaN(parseFloat(set.reps));
        const hasActualWeight = set.weight && set.weight !== '' && !isNaN(parseFloat(set.weight));
        if (!hasActualReps && !hasActualWeight) return;

        const intensity = oneRepMaxService.parseIntensity(set.intensity);
        if (intensity >= 7) effectiveSets++;
      });

      if (effectiveSets > 0) {
        Object.entries(workoutExercise.muscle_activation).forEach(([muscle, percentage]) => {
          const numericPercentage = parseFloat(percentage);
          if (!isNaN(numericPercentage)) {
            const contribution = effectiveSets * (numericPercentage / 100);
            muscleSets[muscle] = (muscleSets[muscle] || 0) + contribution;
          }
        });
      }
    });

    Object.keys(muscleSets).forEach(muscle => {
      muscleSets[muscle] = Math.round(muscleSets[muscle] * 10) / 10;
    });

    return muscleSets;
  }

  /**
   * Convert workout object to session format
   */
  convertWorkoutToSession(workout, userId, courseId) {
    const sessionId = workout.sessionId || workout.id || `session_${Date.now()}`;
    
    // Create unique document ID using timestamp to ensure each completion creates a new document
    const completionTimestamp = Date.now();
    const uniqueDocId = `${sessionId}_${completionTimestamp}`;
    
    const convertedSession = {
      sessionId: sessionId,
      completionDocId: uniqueDocId,
      userId: userId,
      courseId: courseId,
      sessionName: workout.title || 'Workout Session',
      startTime: workout.startTime || new Date().toISOString(),
      completedAt: new Date().toISOString(),
      duration: 0,
      exercises: workout.exercises.map((exercise, index) => {
        // Properly resolve libraryId from exercise data
        let libraryId = exercise.libraryId;
        
        // If libraryId is not available, try to extract it from the exercise structure
        if (!libraryId && exercise.primary) {
          libraryId = Object.keys(exercise.primary)[0];
        }
        
        // If still no libraryId, skip this exercise (don't default to 'unknown')
        if (!libraryId) {
          return null;
        }
        
        const processedSets = exercise.sets ? exercise.sets
          .map((set) => ({
            reps: set.reps || '',
            weight: set.weight || '',
            intensity: set.intensity || '',
            id: set.id,
            title: set.title,
            order: set.order,
            previous: set.previous
          }))
          .filter((set) => {
            const hasReps = set.reps && set.reps !== '' && !isNaN(parseFloat(set.reps));
            const hasWeight = set.weight && set.weight !== '' && !isNaN(parseFloat(set.weight));
            return hasReps || hasWeight;
          }) : [];
        
        // Extract primary muscle names from muscle_activation map
        const primaryMuscles = exercise.muscle_activation
          ? Object.keys(exercise.muscle_activation)
          : [];

        const processedExercise = {
          exerciseId: exercise.id || exercise.exerciseId || `exercise_${Date.now()}_${index}`,
          exerciseName: exercise.name || exercise.exerciseName || 'Unknown Exercise',
          libraryId: libraryId,
          primary: exercise.primary,
          primaryMuscles,
          sets: processedSets
        };
        
        return processedExercise;
      }).filter(exercise => exercise !== null) // Remove null exercises
    };
    
    return convertedSession;
  }


  /**
   * Add session data to exercise and session history
   * @param {string} userId - User ID
   * @param {Object} sessionData - Session data with exercises (performed)
   * @param {Object} [plannedSnapshot] - Optional snapshot of planned session at completion time
   */
  async addSessionData(userId, sessionData, plannedSnapshot = null) {
    try {
      const result = await exerciseHistoryService.addSessionData(userId, sessionData, plannedSnapshot);
      return result;
      
    } catch (error) {
      logger.error('Error adding session data:', error);
      throw error;
    }
  }

  /**
   * Calculate stats for session data
   */
  calculateStats(sessionData) {
    try {
      const stats = {
        totalExercises: sessionData.exercises?.length || 0,
        totalSets: 0,
        totalReps: 0,
        totalWeight: 0,
        duration: sessionData.duration || 0
      };

      if (sessionData.exercises) {
        sessionData.exercises.forEach(exercise => {
          if (exercise.sets) {
            exercise.sets.forEach(set => {
              if (set.reps && set.weight) {
                stats.totalSets++;
                stats.totalReps += parseInt(set.reps) || 0;
                stats.totalWeight += parseFloat(set.weight) || 0;
              }
            });
          }
        });
      }

      return stats;
    } catch (error) {
      logger.error('Error calculating stats:', error);
      return {
        totalExercises: 0,
        totalSets: 0,
        totalReps: 0,
        totalWeight: 0,
        duration: 0
      };
    }
  }

  /**
   * Clear cache
   */
  clearCache(userId, courseId) {
    const prefix = `${userId}|${courseId}`;
    const toDelete = [];
    for (const key of this.cache.keys()) {
      if (key === prefix || (typeof key === 'string' && key.startsWith(prefix + '|'))) toDelete.push(key);
    }
    toDelete.forEach((k) => this.cache.delete(k));
  }

  /**
   * Clear all cache
   */
  clearAllCache() {
    this.cache.clear();
  }
}

export default new SessionService();
