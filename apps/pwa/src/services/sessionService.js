// Session Service - Single source of truth for all session operations
import sessionManager from './sessionManager';
import oneRepMaxService from './oneRepMaxService';
import exerciseHistoryService from './exerciseHistoryService';
import apiClient from '../utils/apiClient';
import logger from '../utils/logger.js';

class SessionService {
  constructor() {
    this.cache = new Map();
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

    try {
      logger.debug('🎯 Getting current session:', { userId, courseId, manualSessionId, targetDate });

      // Check cache first (unless force refresh) - 5 minute cache
      if (!forceRefresh) {
        const cached = this.cache.get(cacheKey);
        if (cached && (Date.now() - cached.timestamp) < 300000) {
          logger.debug('✅ Using cached session state');
          return cached.data;
        }
      }

      // Build query params
      const params = { courseId };
      if (targetDate) params.date = targetDate;
      if (manualSessionId) params.sessionId = manualSessionId;

      const t0 = Date.now();
      const res = await apiClient.get('/workout/daily', { params });
      logger.debug('⏱️ [getCurrentSession] GET /workout/daily:', Date.now() - t0, 'ms');

      const d = res?.data;

      if (!d?.hasSession) {
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
        name: ex.name,
        description: ex.description,
        video_url: ex.video_url,
        muscle_activation: ex.muscle_activation,
        implements: ex.implements ?? [],
        libraryId: ex.libraryId,
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
      };

      this.cache.set(cacheKey, { data: sessionState, timestamp: Date.now() });
      logger.debug('✅ Session state built via API:', {
        sessionTitle: session.title,
        exerciseCount: workout.exercises.length,
        isManual: !!manualSessionId,
      });
      return sessionState;

    } catch (error) {
      logger.error('❌ Error getting current session:', error);
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

  /**
   * Select a session manually
   */
  async selectSession(userId, courseId, sessionId, sessionIndex) {
    const tSelectStart = Date.now();
    try {
      logger.debug('📍 Selecting session manually:', { sessionId, sessionIndex });

      // Clear cache first (forces full re-fetch: course data, progress, and workout build)
      this.clearCache(userId, courseId);

      // Get new state with manual selection (no progress update)
      const newState = await this.getCurrentSession(userId, courseId, {
        forceRefresh: true,
        manualSessionId: sessionId,
        manualSessionIndex: sessionIndex
      });

      logger.debug('✅ Session selection completed in', Date.now() - tSelectStart, 'ms:', {
        sessionTitle: newState.session?.title,
        isManual: newState.isManual
      });
      
      return newState;
      
    } catch (error) {
      logger.error('❌ Error selecting session:', error);
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
      logger.debug('🏁 Completing session:', sessionData.sessionId || sessionData.id);

      // Handle both session objects and workout objects
      let actualSessionData;
      logger.debug('🔍 VOLUME DEBUG: Determining session data type:', {
        hasExercises: !!sessionData.exercises,
        exercisesLength: sessionData.exercises?.length,
        firstExerciseHasExerciseId: !!sessionData.exercises?.[0]?.exerciseId,
        firstExerciseHasId: !!sessionData.exercises?.[0]?.id,
        firstExerciseStructure: sessionData.exercises?.[0] ? Object.keys(sessionData.exercises[0]) : 'no exercises'
      });
      
      if (sessionData.exercises && sessionData.exercises[0] && sessionData.exercises[0].exerciseId) {
        // This is a session object (has exerciseId)
        logger.debug('🔍 VOLUME DEBUG: Using session object directly');
        actualSessionData = sessionData;
      } else {
        // This is a workout object (has exercise names), convert to session format
        logger.debug('🔍 VOLUME DEBUG: Converting workout object to session format');
        actualSessionData = this.convertWorkoutToSession(sessionData, userId, courseId);
        
        // Get the actual session from sessionManager to preserve startTime
        try {
          const currentSession = await sessionManager.getCurrentSession();
          if (currentSession && currentSession.startTime) {
            actualSessionData.startTime = currentSession.startTime;
            logger.debug('✅ Preserved startTime from current session:', currentSession.startTime);
          }
        } catch (error) {
          logger.warn('⚠️ Could not get current session for startTime:', error);
        }
      }
      
      logger.debug('🔍 VOLUME DEBUG: actualSessionData created:', {
        hasActualSessionData: !!actualSessionData,
        sessionId: actualSessionData?.sessionId,
        exercisesCount: actualSessionData?.exercises?.length,
        firstExerciseId: actualSessionData?.exercises?.[0]?.exerciseId,
        firstExerciseName: actualSessionData?.exercises?.[0]?.exerciseName
      });

      // Merge user notes
      actualSessionData.userNotes = options.userNotes ?? actualSessionData.userNotes ?? '';

      // Build planned snapshot from template when available
      const plannedSnapshot = options.plannedWorkout
        ? this.buildPlannedSnapshot(options.plannedWorkout)
        : null;

      // Submit session — server handles course progress, 1RM, streak atomically
      const serverResult = await this.addSessionData(userId, actualSessionData, plannedSnapshot);
      const personalRecords = serverResult?.personalRecords ?? [];

      // Calculate stats
      const stats = this.calculateStats(actualSessionData);

      // Calculate muscle volumes for display using plannedWorkout (already has muscle_activation from GET /workout/daily)
      let sessionMuscleVolumes = {};
      try {
        const workoutForVolume = options.plannedWorkout ?? null;
        if (workoutForVolume?.exercises?.length) {
          sessionMuscleVolumes = this.calculateSimpleMuscleVolumes(actualSessionData, workoutForVolume);
          logger.debug('💪 Session muscle volumes calculated:', Object.keys(sessionMuscleVolumes).length, 'muscles');
        }
      } catch (error) {
        logger.error('❌ Error calculating muscle volumes:', error);
      }

      // Clear cache to force refresh
      this.clearCache(userId, courseId);

      logger.debug('✅ Session completed successfully');

      return {
        sessionData: actualSessionData,
        stats,
        sessionMuscleVolumes,
        personalRecords,
      };

    } catch (error) {
      logger.error('❌ Error completing session:', error);
      throw error;
    }
  }

  /**
   * SIMPLIFIED VOLUME CALCULATION
   * Only count sets where user actually performed reps/weight AND intensity >= 7
   */
  calculateSimpleMuscleVolumes(sessionData, workoutData) {
    logger.debug('🔍 SIMPLE VOLUME: Starting calculation');
    logger.debug('🔍 SIMPLE VOLUME: Input data:', {
      sessionDataExercisesCount: sessionData.exercises?.length || 0,
      workoutDataExercisesCount: workoutData.exercises?.length || 0,
      sessionDataExercises: sessionData.exercises?.map(ex => ({
        exerciseName: ex.exerciseName,
        setsCount: ex.sets?.length || 0,
        sets: ex.sets?.map(set => ({
          reps: set.reps,
          weight: set.weight,
          intensity: set.intensity,
          hasData: !!(set.reps || set.weight),
          hasIntensity: !!(set.intensity && set.intensity !== '')
        })) || []
      })) || [],
      workoutDataExercises: workoutData.exercises?.map(ex => ({
        exerciseName: ex.name,
        hasMuscleActivation: !!ex.muscle_activation,
        muscleActivationKeys: ex.muscle_activation ? Object.keys(ex.muscle_activation) : []
      })) || []
    });
    
    const muscleSets = {};
    
    sessionData.exercises.forEach((sessionExercise) => {
      // 🔍 VOLUME DEBUG: Log exercise matching
      logger.debug('🔍 SIMPLE VOLUME: Processing session exercise:', {
        exerciseName: sessionExercise.exerciseName,
        exerciseId: sessionExercise.exerciseId,
        setsCount: sessionExercise.sets?.length || 0
      });
      
      // Find workout exercise with muscle activation data
      const workoutExercise = workoutData.exercises.find(we => 
        we.name === sessionExercise.exerciseName || we.id === sessionExercise.exerciseId
      );
      
      logger.debug('🔍 SIMPLE VOLUME: Exercise matching result:', {
        sessionExerciseName: sessionExercise.exerciseName,
        sessionExerciseId: sessionExercise.exerciseId,
        foundWorkoutExercise: !!workoutExercise,
        workoutExerciseName: workoutExercise?.name,
        workoutExerciseId: workoutExercise?.id,
        hasMuscleActivation: !!workoutExercise?.muscle_activation,
        muscleActivationKeys: workoutExercise?.muscle_activation ? Object.keys(workoutExercise.muscle_activation) : []
      });
      
      if (!workoutExercise?.muscle_activation) {
        logger.debug(`🔍 SIMPLE VOLUME: Skipping ${sessionExercise.exerciseName} - no muscle activation`);
        return;
      }
      
      logger.debug(`🔍 SIMPLE VOLUME: Processing ${sessionExercise.exerciseName}`);
      
      // Count only sets with actual user performance
      let effectiveSets = 0;
      sessionExercise.sets.forEach((set, setIndex) => {
        // 🔍 VOLUME DEBUG: Log each set processing
        logger.debug('🔍 SIMPLE VOLUME: Processing set:', {
          exerciseName: sessionExercise.exerciseName,
          setIndex,
          set,
          reps: set.reps,
          weight: set.weight,
          intensity: set.intensity
        });
        
        // Check if user actually performed the set (has actual reps AND/OR weight)
        const hasActualReps = set.reps && set.reps !== '' && !isNaN(parseFloat(set.reps));
        const hasActualWeight = set.weight && set.weight !== '' && !isNaN(parseFloat(set.weight));
        const hasActualData = hasActualReps || hasActualWeight;
        
        logger.debug('🔍 SIMPLE VOLUME: Set data validation:', {
          exerciseName: sessionExercise.exerciseName,
          setIndex,
          hasActualReps,
          hasActualWeight,
          hasActualData,
          repsValue: set.reps,
          weightValue: set.weight,
          intensityValue: set.intensity
        });
        
        if (!hasActualData) {
          logger.debug(`🔍 SIMPLE VOLUME: Set ${setIndex + 1} - no actual data (reps: "${set.reps}", weight: "${set.weight}"), skipping`);
          return;
        }
        
        // Check intensity >= 7
        logger.debug('🔍 SIMPLE VOLUME: Parsing intensity:', {
          exerciseName: sessionExercise.exerciseName,
          setIndex,
          intensityString: set.intensity,
          intensityType: typeof set.intensity
        });
        
        const intensity = oneRepMaxService.parseIntensity(set.intensity);
        
        logger.debug('🔍 SIMPLE VOLUME: Intensity parsing result:', {
          exerciseName: sessionExercise.exerciseName,
          setIndex,
          intensityString: set.intensity,
          parsedIntensity: intensity,
          intensityType: typeof intensity,
          isIntensityValid: intensity !== null,
          isIntensityGTE7: intensity >= 7
        });
        
        if (intensity >= 7) {
          effectiveSets++;
          logger.debug(`🔍 SIMPLE VOLUME: Set ${setIndex + 1} - intensity ${intensity} >= 7, counted (${set.reps} reps, ${set.weight}kg)`);
        } else {
          logger.debug(`🔍 SIMPLE VOLUME: Set ${setIndex + 1} - intensity ${intensity} < 7, not counted`);
        }
      });
      
      logger.debug(`🔍 SIMPLE VOLUME: ${sessionExercise.exerciseName} - ${effectiveSets} effective sets`);
      
      // Distribute to muscles if there are effective sets
      if (effectiveSets > 0) {
        logger.debug('🔍 SIMPLE VOLUME: Distributing to muscles:', {
          exerciseName: sessionExercise.exerciseName,
          effectiveSets,
          muscleActivation: workoutExercise.muscle_activation
        });
        
        Object.entries(workoutExercise.muscle_activation).forEach(([muscle, percentage]) => {
          const numericPercentage = parseFloat(percentage);
          if (!isNaN(numericPercentage)) {
            const contribution = effectiveSets * (numericPercentage / 100);
            muscleSets[muscle] = (muscleSets[muscle] || 0) + contribution;
            logger.debug(`🔍 SIMPLE VOLUME: ${muscle} +${contribution.toFixed(2)} sets (${numericPercentage}%)`);
          }
        });
      } else {
        logger.debug(`🔍 SIMPLE VOLUME: ${sessionExercise.exerciseName} - no effective sets, skipping muscle distribution`);
      }
    });
    
    // Round to 1 decimal
    Object.keys(muscleSets).forEach(muscle => {
      muscleSets[muscle] = Math.round(muscleSets[muscle] * 10) / 10;
    });
    
    logger.debug('🔍 SIMPLE VOLUME: Final result:', muscleSets);
    return muscleSets;
  }

  /**
   * Convert workout object to session format
   */
  convertWorkoutToSession(workout, userId, courseId) {
    logger.debug('🔍 VOLUME DEBUG: convertWorkoutToSession called with:', {
      hasWorkout: !!workout,
      hasExercises: !!workout?.exercises,
      exercisesLength: workout?.exercises?.length,
      firstExerciseStructure: workout?.exercises?.[0] ? Object.keys(workout.exercises[0]) : 'no exercises',
      firstExerciseId: workout?.exercises?.[0]?.id,
      firstExerciseName: workout?.exercises?.[0]?.name,
      firstExerciseLibraryId: workout?.exercises?.[0]?.libraryId
    });
    
    const sessionId = workout.sessionId || workout.id || `session_${Date.now()}`;
    
    // Create unique document ID using timestamp to ensure each completion creates a new document
    const completionTimestamp = Date.now();
    const uniqueDocId = `${sessionId}_${completionTimestamp}`;
    
    const convertedSession = {
      sessionId: sessionId,
      completionDocId: uniqueDocId, // Add unique document ID for Firestore
      userId: userId,
      courseId: courseId,
      sessionName: workout.title || 'Workout Session',
      startTime: workout.startTime || new Date().toISOString(), // Use workout startTime if available, otherwise current time
      completedAt: new Date().toISOString(),
      duration: 0,
      exercises: workout.exercises.map(exercise => {
        // 🔍 VOLUME DEBUG: Log exercise processing
        logger.debug('🔍 VOLUME DEBUG: Processing exercise in convertWorkoutToSession:', {
          exerciseName: exercise.name || exercise.exerciseName,
          exerciseId: exercise.id || exercise.exerciseId,
          originalLibraryId: exercise.libraryId,
          hasPrimary: !!exercise.primary,
          primaryKeys: exercise.primary ? Object.keys(exercise.primary) : [],
          originalSetsCount: exercise.sets?.length || 0,
          originalSets: exercise.sets?.map((set, index) => ({
            setIndex: index,
            reps: set.reps,
            weight: set.weight,
            intensity: set.intensity,
            hasReps: !!(set.reps && set.reps !== ''),
            hasWeight: !!(set.weight && set.weight !== ''),
            hasIntensity: !!(set.intensity && set.intensity !== '')
          })) || []
        });
        
        // Properly resolve libraryId from exercise data
        let libraryId = exercise.libraryId;
        
        // If libraryId is not available, try to extract it from the exercise structure
        if (!libraryId && exercise.primary) {
          libraryId = Object.keys(exercise.primary)[0];
        }
        
        // If still no libraryId, skip this exercise (don't default to 'unknown')
        if (!libraryId) {
          logger.warn('⚠️ Skipping exercise - no libraryId found:', exercise);
          return null;
        }
        
        // Process sets with detailed logging
        const processedSets = exercise.sets ? exercise.sets
          .map((set, setIndex) => {
            const processedSet = {
              // ONLY preserve actual user performance data
              reps: set.reps || '',
              weight: set.weight || '',
              intensity: set.intensity || '',
              // Keep other set properties
              id: set.id,
              title: set.title,
              order: set.order,
              previous: set.previous
            };
            
            // 🔍 VOLUME DEBUG: Log each set processing
            logger.debug('🔍 VOLUME DEBUG: Processing set in convertWorkoutToSession:', {
              exerciseName: exercise.name || exercise.exerciseName,
              setIndex,
              originalSet: set,
              processedSet,
              hasReps: !!(processedSet.reps && processedSet.reps !== ''),
              hasWeight: !!(processedSet.weight && processedSet.weight !== ''),
              hasIntensity: !!(processedSet.intensity && processedSet.intensity !== ''),
              intensityValue: processedSet.intensity
            });
            
            return processedSet;
          })
          .filter((set, setIndex) => {
            // Only keep sets that have actual data
            const hasReps = set.reps && set.reps !== '' && !isNaN(parseFloat(set.reps));
            const hasWeight = set.weight && set.weight !== '' && !isNaN(parseFloat(set.weight));
            const passesFilter = hasReps || hasWeight;
            
            // 🔍 VOLUME DEBUG: Log set filtering
            logger.debug('🔍 VOLUME DEBUG: Set filtering in convertWorkoutToSession:', {
              exerciseName: exercise.name || exercise.exerciseName,
              setIndex,
              set,
              hasReps,
              hasWeight,
              passesFilter,
              willKeep: passesFilter
            });
            
            return passesFilter;
          }) : [];
        
        const processedExercise = {
          exerciseId: exercise.id || exercise.exerciseId || `exercise_${Date.now()}`,
          exerciseName: exercise.name || exercise.exerciseName || 'Unknown Exercise',
          libraryId: libraryId, // ✅ Now properly resolved
          primary: exercise.primary, // CRITICAL: Include primary field for exercise resolution
          sets: processedSets
        };
        
        // 🔍 VOLUME DEBUG: Log final processed exercise
        logger.debug('🔍 VOLUME DEBUG: Final processed exercise:', {
          exerciseName: processedExercise.exerciseName,
          libraryId: processedExercise.libraryId,
          setsCount: processedExercise.sets.length,
          sets: processedExercise.sets.map((set, index) => ({
            setIndex: index,
            reps: set.reps,
            weight: set.weight,
            intensity: set.intensity,
            hasData: !!(set.reps || set.weight),
            hasIntensity: !!(set.intensity && set.intensity !== '')
          }))
        });
        
        return processedExercise;
      }).filter(exercise => exercise !== null) // Remove null exercises
    };
    
      logger.debug('🔍 VOLUME DEBUG: convertWorkoutToSession result:', {
        sessionId: convertedSession.sessionId,
        exercisesCount: convertedSession.exercises.length,
        firstExerciseId: convertedSession.exercises[0]?.exerciseId,
        firstExerciseName: convertedSession.exercises[0]?.exerciseName,
        firstExerciseLibraryId: convertedSession.exercises[0]?.libraryId,
        firstExerciseSets: convertedSession.exercises[0]?.sets?.length,
        firstSetData: convertedSession.exercises[0]?.sets?.[0]
      });
      
      // Log all exercise keys that will be created
      const exerciseKeys = convertedSession.exercises.map(ex => `${ex.libraryId}_${ex.exerciseName}`);
      logger.debug('🔍 SESSION HISTORY DEBUG: Exercise keys to be saved:', exerciseKeys);
      
      // Log set filtering results for each exercise
      convertedSession.exercises.forEach(exercise => {
        logger.debug('🔍 SET FILTERING DEBUG:', {
          exerciseName: exercise.exerciseName,
          libraryId: exercise.libraryId,
          originalSetsCount: exercise.sets?.length || 0,
          filteredSetsCount: exercise.sets?.length || 0,
          filteredSets: exercise.sets?.map(set => ({
            reps: set.reps,
            weight: set.weight,
            hasData: !!(set.reps || set.weight)
          })) || []
        });
      });
    
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
      logger.debug('📚 Adding session data to history:', sessionData.sessionId);
      logger.debug('📚 Session data structure:', {
        sessionId: sessionData.sessionId,
        courseId: sessionData.courseId,
        exercisesCount: sessionData.exercises?.length,
        exerciseKeys: sessionData.exercises?.map(ex => `${ex.libraryId}_${ex.exerciseName}`)
      });
      
      // Server handles course progress, 1RM, streak atomically
      const result = await exerciseHistoryService.addSessionData(userId, sessionData, plannedSnapshot);
      logger.debug('✅ Session data added to history successfully');
      return result;
      
    } catch (error) {
      logger.error('❌ Error adding session data:', error);
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
      logger.error('❌ Error calculating stats:', error);
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
    const progressCacheKey = `progress_${userId}_${courseId}`;
    this.cache.delete(progressCacheKey);
    const prefix = `${userId}_${courseId}`;
    const toDelete = [];
    for (const key of this.cache.keys()) {
      if (key === prefix || (typeof key === 'string' && key.startsWith(prefix + '_'))) toDelete.push(key);
    }
    toDelete.forEach((k) => this.cache.delete(k));
    logger.debug('🗑️ Cache cleared for session and progress:', userId, courseId);
  }

  /**
   * Clear all cache
   */
  clearAllCache() {
    this.cache.clear();
    logger.debug('🗑️ All cache cleared');
  }
}

export default new SessionService();
