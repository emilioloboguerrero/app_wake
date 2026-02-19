// Session Service - Single source of truth for all session operations
import { doc, getDoc, updateDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { firestore } from '../config/firebase';
import workoutProgressService from '../data-management/workoutProgressService';
import firestoreService from './firestoreService';
import sessionManager from './sessionManager';
import exerciseLibraryService from './exerciseLibraryService';
import oneRepMaxService from './oneRepMaxService';
import exerciseHistoryService from './exerciseHistoryService';
import { shouldTrackMuscleVolume } from '../constants/muscles';
import { getMondayWeek, getWeekDates } from '../utils/weekCalculation';
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
      manualSessionIndex = null
    } = options;

    try {
      logger.log('🎯 Getting current session:', { userId, courseId, manualSessionId });

      // Check cache first (unless force refresh) - 5 minute cache
      if (!forceRefresh) {
        const cached = this.cache.get(`${userId}_${courseId}`);
        if (cached && (Date.now() - cached.timestamp) < 300000) { // 5 min cache
          logger.log('✅ Using cached session state');
          return cached.data;
        }
      }

      const t0 = Date.now();
      // Get course data (with automatic download fallback)
      const courseData = await workoutProgressService.getCourseDataForWorkout(courseId, userId);
      const tAfterCourse = Date.now();
      logger.log('⏱️ [getCurrentSession] getCourseDataForWorkout:', tAfterCourse - t0, 'ms');
      const inner = courseData?.courseData;
      const isOneOnOne = inner?.isOneOnOne === true;
      const modules = inner?.modules;

      logger.log('📦 [getCurrentSession] received:', {
        hasCourseData: !!courseData,
        hasInner: !!inner,
        innerKeys: inner ? Object.keys(inner) : [],
        modulesType: typeof modules,
        modulesLength: Array.isArray(modules) ? modules.length : 'not-array',
        isOneOnOne,
        willThrow: !modules && !isOneOnOne
      });

      if (!modules && !isOneOnOne) {
        logger.error('📦 [getCurrentSession] throwing: inner.modules and inner.isOneOnOne both falsy', {
          innerModules: inner?.modules,
          innerIsOneOnOne: inner?.isOneOnOne
        });
        throw new Error('Course data not available');
      }

      // Flatten all sessions (may be empty for one-on-one week with no planning)
      let allSessions = inner && Array.isArray(modules)
        ? sessionManager.flattenAllSessions({ ...inner, modules })
        : [];

      // One-on-one: only show sessions planned for the current week (never show previous week's incomplete)
      if (isOneOnOne && allSessions.length > 0) {
        const currentWeekKey = getMondayWeek();
        const { start: weekStart, end: weekEnd } = getWeekDates(currentWeekKey);
        const startMs = new Date(weekStart).setHours(0, 0, 0, 0);
        const endMs = new Date(weekEnd).setHours(23, 59, 59, 999);
        const filtered = allSessions.filter((s) => {
          if (s.plannedDate == null) return true;
          const ms = new Date(s.plannedDate).getTime();
          return ms >= startMs && ms <= endMs;
        });
        if (filtered.length !== allSessions.length) {
          logger.log('🔍 [getCurrentSession] one-on-one: filtered to current week only:', { before: allSessions.length, after: filtered.length });
        }
        allSessions = filtered;
        if (allSessions.length === 0) {
          const sessionState = {
            session: null,
            workout: null,
            index: 0,
            isManual: false,
            allSessions: [],
            progress: await this.getCourseProgress(userId, courseId),
            isLoading: false,
            error: null,
            emptyReason: 'no_planning_this_week'
          };
          this.cache.set(`${userId}_${courseId}`, { data: sessionState, timestamp: Date.now() });
          logger.log('🔍 [getCurrentSession] one-on-one: no sessions in current week after filter');
          return sessionState;
        }
      }

      logger.log('📦 [getCurrentSession] allSessions.length:', allSessions.length, 'isOneOnOne:', isOneOnOne);
      logger.log('🔍 [getCurrentSession] allSessions ids (used for matching plannedSessionIdForToday):', allSessions.map((s, i) => ({ i, id: s.id, sessionId: s.sessionId, title: s.title })));

      // One-on-one with no sessions in the week: return empty state with reason
      if (isOneOnOne && allSessions.length === 0) {
        const sessionState = {
          session: null,
          workout: null,
          index: 0,
          isManual: false,
          allSessions: [],
          progress: await this.getCourseProgress(userId, courseId),
          isLoading: false,
          error: null,
          emptyReason: 'no_planning_this_week'
        };
        this.cache.set(`${userId}_${courseId}`, { data: sessionState, timestamp: Date.now() });
        logger.log('🔍 [getCurrentSession] ONE-ON-ONE NO SESSIONS: no_planning_this_week', {
          userId,
          courseId,
          note: 'getCourseModules returned [] - no planAssignments for current week or content_plan_id path returned empty'
        });
        return sessionState;
      }

      if (allSessions.length === 0) {
        throw new Error('No sessions available');
      }

      // Get progress from user document
      const progress = await this.getCourseProgress(userId, courseId);
      const tAfterProgress = Date.now();
      logger.log('⏱️ [getCurrentSession] getCourseProgress:', tAfterProgress - tAfterCourse, 'ms');

      let currentSession;
      let currentIndex;
      let isManual = false;

      if (manualSessionId && manualSessionIndex !== null) {
        // Manual selection
        const foundById = allSessions.find(s =>
          (s.id === manualSessionId) || (s.sessionId === manualSessionId)
        );
        const findIndexById = allSessions.findIndex(s =>
          (s.id === manualSessionId) || (s.sessionId === manualSessionId)
        );
        currentSession = foundById;
        currentIndex = currentSession ? manualSessionIndex : findIndexById;
        if (currentIndex < 0) currentIndex = 0;
        currentSession = allSessions[currentIndex] || currentSession;
        isManual = true;
        logger.log('🔍 [getCurrentSession] manual selection:', {
          manualSessionId,
          manualSessionIndex,
          findIndexById,
          'allSessions indices→id': allSessions.map((s, i) => ({ i, id: s.sessionId || s.id, title: s.title })),
          chosenCurrentIndex: currentIndex,
          chosenSessionId: currentSession?.sessionId || currentSession?.id,
          chosenTitle: currentSession?.title,
          note: 'When same sessionId appears twice, findIndexById is first match only; we use manualSessionIndex for currentIndex so chosen session is correct if index was passed correctly'
        });
        logger.log('🎯 Using manual session selection:', currentSession?.title);
      } else if (isOneOnOne && inner?.plannedSessionIdForToday != null) {
        // One-on-one: use session planned for today as initial current
        const todayId = inner.plannedSessionIdForToday;
        currentIndex = allSessions.findIndex(s =>
          (s.id === todayId) || (s.sessionId === todayId)
        );
        logger.log('🔍 [getCurrentSession] one-on-one today match:', {
          plannedSessionIdForToday: todayId,
          findIndexByTodayId: currentIndex,
          matchSucceeded: currentIndex >= 0,
          'allSessions indices→id': allSessions.map((s, i) => ({ i, id: s.sessionId || s.id, title: s.title })),
          note: currentIndex === -1
            ? 'ROOT CAUSE: plannedSessionIdForToday does not match any allSessions[].id - often because plannedId is client_sessions doc id (userId_date_sessionId) and allSessions use plan session id'
            : 'When same session is planned on multiple days, findIndex returns FIRST match (e.g. Monday not Thursday)'
        });
        if (currentIndex >= 0) {
          currentSession = allSessions[currentIndex];
          logger.log('🎯 One-on-one: using today\'s planned session:', currentSession?.title);
        } else {
          currentSession = null;
          currentIndex = 0;
          logger.log('🔍 [getCurrentSession] One-on-one: today match FAILED (findIndex -1) - showing placeholder; plannedId not in allSessions list');
        }
      } else if (isOneOnOne) {
        // One-on-one but no session planned for today (plannedSessionIdForToday is null): do not show any session in the main card; show placeholder until user explicitly selects one
        currentSession = null;
        currentIndex = 0;
        logger.log('🎯 One-on-one: no session planned for today (plannedSessionIdForToday null), showing placeholder');
      } else {
        // Automatic selection with progression logic
        const currentId = this.findCurrentSessionId(progress, allSessions);
        currentIndex = allSessions.findIndex(s =>
          (s.id === currentId) || (s.sessionId === currentId)
        );
        if (currentIndex < 0) currentIndex = 0;
        currentSession = allSessions[currentIndex];
        logger.log('🎯 Using automatic session selection:', currentSession?.title);
      }

      // One-on-one with sessions but none for today: valid state, show placeholder
      if (isOneOnOne && !currentSession) {
        const sessionState = {
          session: null,
          workout: null,
          index: 0,
          isManual: false,
          allSessions,
          progress,
          isLoading: false,
          error: null,
          emptyReason: 'no_session_today'
        };
        this.cache.set(`${userId}_${courseId}`, { data: sessionState, timestamp: Date.now() });
        logger.log('🔍 [getCurrentSession] One-on-one: emptyReason=no_session_today (plannedSessionIdForToday did not match allSessions or no plan for today)');
        return sessionState;
      }

      if (!currentSession) {
        throw new Error('Current session not found');
      }

      // One-on-one with minimal list: current session may have no exercises yet; fetch full content for this slot only
      const needsFullContent = isOneOnOne && (!currentSession.exercises || currentSession.exercises.length === 0);
      if (needsFullContent) {
        const creatorId = inner?.creator_id ?? inner?.creatorId ?? null;
        const fullContent = await firestoreService.getPlannedSessionContentBySlotId(userId, courseId, currentSession.id, creatorId);
        if (fullContent) {
          Object.assign(currentSession, {
            title: fullContent.title ?? currentSession.title,
            description: fullContent.description ?? currentSession.description,
            exercises: fullContent.exercises ?? [],
            image_url: fullContent.image_url ?? currentSession.image_url
          });
          logger.log('🔍 [getCurrentSession] loaded full content for current slot:', { slotId: currentSession.id, exercisesCount: currentSession.exercises?.length ?? 0 });
        }
      }

      logger.log('🔍 [getCurrentSession] current session content before buildWorkoutFromSession:', {
        sessionId: currentSession.sessionId || currentSession.id,
        title: currentSession.title,
        hasExercises: !!currentSession.exercises?.length,
        exercisesCount: currentSession.exercises?.length ?? 0,
        hasImageUrl: !!currentSession.image_url
      });

      // Build workout data (resolves each exercise from library - main bottleneck when changing session)
      const tBeforeBuild = Date.now();
      const workout = await this.buildWorkoutFromSession(currentSession);
      const tAfterBuild = Date.now();
      logger.log('⏱️ [getCurrentSession] buildWorkoutFromSession:', tAfterBuild - tBeforeBuild, 'ms (exercises:', currentSession.exercises?.length ?? 0, ')');
      logger.log('⏱️ [getCurrentSession] TOTAL (uncached):', tAfterBuild - t0, 'ms');

      // Detect if the session we're showing was already completed (e.g. one-on-one user re-entering after completing today)
      const completedSet = new Set(progress?.allSessionsCompleted || []);
      const currentSessionId = currentSession.sessionId || currentSession.id;
      const todaySessionAlreadyCompleted = !!(
        currentSessionId && (completedSet.has(currentSessionId) || completedSet.has(currentSession.id) || completedSet.has(currentSession.sessionId))
      );

      const sessionState = {
        session: currentSession,
        workout: workout,
        index: currentIndex,
        isManual: isManual,
        allSessions: allSessions,
        progress: progress,
        isLoading: false,
        error: null,
        emptyReason: null,
        todaySessionAlreadyCompleted
      };

      // Cache the result
      this.cache.set(`${userId}_${courseId}`, {
        data: sessionState,
        timestamp: Date.now()
      });

      logger.log('✅ Session state built successfully:', {
        sessionTitle: currentSession.title,
        exerciseCount: workout.exercises.length,
        isManual: isManual
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
      logger.log('📍 Selecting session manually:', { sessionId, sessionIndex });

      // Clear cache first (forces full re-fetch: course data, progress, and workout build)
      this.clearCache(userId, courseId);

      // Get new state with manual selection (no progress update)
      const newState = await this.getCurrentSession(userId, courseId, {
        forceRefresh: true,
        manualSessionId: sessionId,
        manualSessionIndex: sessionIndex
      });

      logger.log('✅ Session selection completed in', Date.now() - tSelectStart, 'ms:', {
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
      logger.log('🏁 Completing session:', sessionData.sessionId || sessionData.id);

      // Handle both session objects and workout objects
      let actualSessionData;
      logger.log('🔍 VOLUME DEBUG: Determining session data type:', {
        hasExercises: !!sessionData.exercises,
        exercisesLength: sessionData.exercises?.length,
        firstExerciseHasExerciseId: !!sessionData.exercises?.[0]?.exerciseId,
        firstExerciseHasId: !!sessionData.exercises?.[0]?.id,
        firstExerciseStructure: sessionData.exercises?.[0] ? Object.keys(sessionData.exercises[0]) : 'no exercises'
      });
      
      if (sessionData.exercises && sessionData.exercises[0] && sessionData.exercises[0].exerciseId) {
        // This is a session object (has exerciseId)
        logger.log('🔍 VOLUME DEBUG: Using session object directly');
        actualSessionData = sessionData;
      } else {
        // This is a workout object (has exercise names), convert to session format
        logger.log('🔍 VOLUME DEBUG: Converting workout object to session format');
        actualSessionData = this.convertWorkoutToSession(sessionData, userId, courseId);
        
        // Get the actual session from sessionManager to preserve startTime
        try {
          const currentSession = await sessionManager.getCurrentSession();
          if (currentSession && currentSession.startTime) {
            actualSessionData.startTime = currentSession.startTime;
            logger.log('✅ Preserved startTime from current session:', currentSession.startTime);
          }
        } catch (error) {
          logger.warn('⚠️ Could not get current session for startTime:', error);
        }
      }
      
      logger.log('🔍 VOLUME DEBUG: actualSessionData created:', {
        hasActualSessionData: !!actualSessionData,
        sessionId: actualSessionData?.sessionId,
        exercisesCount: actualSessionData?.exercises?.length,
        firstExerciseId: actualSessionData?.exercises?.[0]?.exerciseId,
        firstExerciseName: actualSessionData?.exercises?.[0]?.exerciseName
      });

      // Note: Streak update is now handled in addSessionData() to ensure it's called in the actual completion path

      // Update course progress with the current session as completed
      await this.updateCourseProgress(userId, courseId, actualSessionData.sessionId, actualSessionData.exercises);

      // Get course data to add course name BEFORE adding to history
      const courseData = await workoutProgressService.getCourseDataForWorkout(courseId, userId);
      
      // Add course name to session data if available
      if (courseData && courseData.courseData && courseData.courseData.title) {
        actualSessionData.courseName = courseData.courseData.title;
        logger.log('📚 Course name added to session:', courseData.courseData.title);
        
        // If sessionName is generic, use course name as fallback
        if (!actualSessionData.sessionName || actualSessionData.sessionName === 'Workout Session') {
          actualSessionData.sessionName = courseData.courseData.title;
          logger.log('📝 Session name updated to course name:', courseData.courseData.title);
        }
      } else {
        logger.log('❌ Course name not found in course data');
      }

      // Build planned snapshot from template when available (makes history self-contained)
      const plannedSnapshot = options.plannedWorkout
        ? this.buildPlannedSnapshot(options.plannedWorkout)
        : null;

      // Update exercise history
      await this.addSessionData(userId, actualSessionData, plannedSnapshot);
      
      logger.log('🔍 SESSION SERVICE DEBUG: actualSessionData.courseName:', actualSessionData.courseName);
      logger.log('🔍 SESSION SERVICE DEBUG: actualSessionData.sessionName:', actualSessionData.sessionName);

      // Update 1RM if applicable
      if (actualSessionData.exercises && actualSessionData.exercises.length > 0) {
        await this.updateOneRepMax(userId, actualSessionData.exercises);
      }

      // Calculate stats (for compatibility with existing code)
      const stats = this.calculateStats(actualSessionData);

      // Calculate muscle volumes using sessionManager
      let sessionMuscleVolumes = {};
      try {
        logger.log('🔍 VOLUME DEBUG: Starting volume calculation');
        logger.log('🔍 VOLUME DEBUG: Input data for volume calculation:', {
          sessionDataType: typeof sessionData,
          actualSessionDataType: typeof actualSessionData,
          sessionDataExercisesCount: sessionData.exercises?.length || 0,
          actualSessionDataExercisesCount: actualSessionData.exercises?.length || 0,
          sessionDataExercises: sessionData.exercises?.map(ex => ({
            exerciseName: ex.name || ex.exerciseName,
            setsCount: ex.sets?.length || 0,
            sets: ex.sets?.map(set => ({
              reps: set.reps,
              weight: set.weight,
              intensity: set.intensity,
              hasData: !!(set.reps || set.weight),
              hasIntensity: !!(set.intensity && set.intensity !== '')
            })) || []
          })) || [],
          actualSessionDataExercises: actualSessionData.exercises?.map(ex => ({
            exerciseName: ex.exerciseName,
            setsCount: ex.sets?.length || 0,
            sets: ex.sets?.map(set => ({
              reps: set.reps,
              weight: set.weight,
              intensity: set.intensity,
              hasData: !!(set.reps || set.weight),
              hasIntensity: !!(set.intensity && set.intensity !== '')
            })) || []
          })) || []
        });
        
        if (courseData && courseData.courseData) {
          // SIMPLIFIED VOLUME CALCULATION
          logger.log('🔍 VOLUME DEBUG: Starting simplified volume calculation');
          
          // Build workout with muscle activation data
          logger.log('🔍 VOLUME DEBUG: Building workout for volume calculation');
          const workoutForVolume = await this.buildWorkoutFromSession(actualSessionData);
          
          logger.log('🔍 VOLUME DEBUG: Workout built for volume calculation:', {
            workoutForVolumeExists: !!workoutForVolume,
            workoutExercisesCount: workoutForVolume?.exercises?.length || 0,
            workoutExercises: workoutForVolume?.exercises?.map(ex => ({
              exerciseName: ex.name,
              hasMuscleActivation: !!ex.muscle_activation,
              muscleActivationKeys: ex.muscle_activation ? Object.keys(ex.muscle_activation) : []
            })) || []
          });
          
          if (workoutForVolume && workoutForVolume.exercises) {
            // Calculate volumes directly from session data
            logger.log('🔍 VOLUME DEBUG: Calling calculateSimpleMuscleVolumes');
            sessionMuscleVolumes = this.calculateSimpleMuscleVolumes(actualSessionData, workoutForVolume);
            logger.log('💪 Session muscle volumes calculated:', {
              sessionMuscleVolumes,
              volumeKeys: Object.keys(sessionMuscleVolumes),
              volumeCount: Object.keys(sessionMuscleVolumes).length
            });
            
            // Update weekly muscle volumes
            if (Object.keys(sessionMuscleVolumes).length > 0) {
              logger.log('🔍 VOLUME DEBUG: Updating weekly muscle volumes');
              await sessionManager.updateWeeklyMuscleVolumes(userId, sessionMuscleVolumes);
              logger.log('✅ Weekly muscle volumes updated');
            } else {
              logger.log('⚠️ VOLUME DEBUG: No muscle volumes to update');
            }
          } else {
            logger.log('⚠️ VOLUME DEBUG: No workout data for volume calculation');
          }
        } else {
          logger.log('⚠️ VOLUME DEBUG: No course data for volume calculation');
        }
      } catch (error) {
        logger.error('❌ Error calculating muscle volumes:', error);
        logger.error('🔍 VOLUME DEBUG: Volume calculation error details:', {
          errorMessage: error.message,
          errorStack: error.stack,
          actualSessionData: actualSessionData,
          courseData: courseData
        });
        // Don't throw - volume calculation is not critical
      }

      // Clear cache to force refresh
      this.clearCache(userId, courseId);

      logger.log('✅ Session completed successfully');

      return {
        sessionData: actualSessionData,
        stats,
        sessionMuscleVolumes
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
    logger.log('🔍 SIMPLE VOLUME: Starting calculation');
    logger.log('🔍 SIMPLE VOLUME: Input data:', {
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
      logger.log('🔍 SIMPLE VOLUME: Processing session exercise:', {
        exerciseName: sessionExercise.exerciseName,
        exerciseId: sessionExercise.exerciseId,
        setsCount: sessionExercise.sets?.length || 0
      });
      
      // Find workout exercise with muscle activation data
      const workoutExercise = workoutData.exercises.find(we => 
        we.name === sessionExercise.exerciseName || we.id === sessionExercise.exerciseId
      );
      
      logger.log('🔍 SIMPLE VOLUME: Exercise matching result:', {
        sessionExerciseName: sessionExercise.exerciseName,
        sessionExerciseId: sessionExercise.exerciseId,
        foundWorkoutExercise: !!workoutExercise,
        workoutExerciseName: workoutExercise?.name,
        workoutExerciseId: workoutExercise?.id,
        hasMuscleActivation: !!workoutExercise?.muscle_activation,
        muscleActivationKeys: workoutExercise?.muscle_activation ? Object.keys(workoutExercise.muscle_activation) : []
      });
      
      if (!workoutExercise?.muscle_activation) {
        logger.log(`🔍 SIMPLE VOLUME: Skipping ${sessionExercise.exerciseName} - no muscle activation`);
        return;
      }
      
      logger.log(`🔍 SIMPLE VOLUME: Processing ${sessionExercise.exerciseName}`);
      
      // Count only sets with actual user performance
      let effectiveSets = 0;
      sessionExercise.sets.forEach((set, setIndex) => {
        // 🔍 VOLUME DEBUG: Log each set processing
        logger.log('🔍 SIMPLE VOLUME: Processing set:', {
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
        
        logger.log('🔍 SIMPLE VOLUME: Set data validation:', {
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
          logger.log(`🔍 SIMPLE VOLUME: Set ${setIndex + 1} - no actual data (reps: "${set.reps}", weight: "${set.weight}"), skipping`);
          return;
        }
        
        // Check intensity >= 7
        logger.log('🔍 SIMPLE VOLUME: Parsing intensity:', {
          exerciseName: sessionExercise.exerciseName,
          setIndex,
          intensityString: set.intensity,
          intensityType: typeof set.intensity
        });
        
        const intensity = oneRepMaxService.parseIntensity(set.intensity);
        
        logger.log('🔍 SIMPLE VOLUME: Intensity parsing result:', {
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
          logger.log(`🔍 SIMPLE VOLUME: Set ${setIndex + 1} - intensity ${intensity} >= 7, counted (${set.reps} reps, ${set.weight}kg)`);
        } else {
          logger.log(`🔍 SIMPLE VOLUME: Set ${setIndex + 1} - intensity ${intensity} < 7, not counted`);
        }
      });
      
      logger.log(`🔍 SIMPLE VOLUME: ${sessionExercise.exerciseName} - ${effectiveSets} effective sets`);
      
      // Distribute to muscles if there are effective sets
      if (effectiveSets > 0) {
        logger.log('🔍 SIMPLE VOLUME: Distributing to muscles:', {
          exerciseName: sessionExercise.exerciseName,
          effectiveSets,
          muscleActivation: workoutExercise.muscle_activation
        });
        
        Object.entries(workoutExercise.muscle_activation).forEach(([muscle, percentage]) => {
          const numericPercentage = parseFloat(percentage);
          if (!isNaN(numericPercentage)) {
            const contribution = effectiveSets * (numericPercentage / 100);
            muscleSets[muscle] = (muscleSets[muscle] || 0) + contribution;
            logger.log(`🔍 SIMPLE VOLUME: ${muscle} +${contribution.toFixed(2)} sets (${numericPercentage}%)`);
          }
        });
      } else {
        logger.log(`🔍 SIMPLE VOLUME: ${sessionExercise.exerciseName} - no effective sets, skipping muscle distribution`);
      }
    });
    
    // Round to 1 decimal
    Object.keys(muscleSets).forEach(muscle => {
      muscleSets[muscle] = Math.round(muscleSets[muscle] * 10) / 10;
    });
    
    logger.log('🔍 SIMPLE VOLUME: Final result:', muscleSets);
    return muscleSets;
  }

  /**
   * Convert workout object to session format
   */
  convertWorkoutToSession(workout, userId, courseId) {
    logger.log('🔍 VOLUME DEBUG: convertWorkoutToSession called with:', {
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
        logger.log('🔍 VOLUME DEBUG: Processing exercise in convertWorkoutToSession:', {
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
            logger.log('🔍 VOLUME DEBUG: Processing set in convertWorkoutToSession:', {
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
            logger.log('🔍 VOLUME DEBUG: Set filtering in convertWorkoutToSession:', {
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
        logger.log('🔍 VOLUME DEBUG: Final processed exercise:', {
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
    
      logger.log('🔍 VOLUME DEBUG: convertWorkoutToSession result:', {
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
      logger.log('🔍 SESSION HISTORY DEBUG: Exercise keys to be saved:', exerciseKeys);
      
      // Log set filtering results for each exercise
      convertedSession.exercises.forEach(exercise => {
        logger.log('🔍 SET FILTERING DEBUG:', {
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
   * Get course progress from user document
   */
  async getCourseProgress(userId, courseId) {
    try {
      logger.log('📊 Getting course progress:', { userId, courseId });
      
      // Check cache first - 24 hour cache for progress
      const progressCacheKey = `progress_${userId}_${courseId}`;
      const cached = this.cache.get(progressCacheKey);
      if (cached && (Date.now() - cached.timestamp) < 86400000) { // 24 hour cache
        logger.log('✅ Using cached course progress');
        return cached.data;
      }
      
      const userDocRef = doc(firestore, 'users', userId);
      const userDoc = await getDoc(userDocRef);
      
      if (!userDoc.exists()) {
        logger.log('❌ User document not found');
        return null;
      }
      
      const userData = userDoc.data();
      const courseProgress = userData.courseProgress?.[courseId];
      
      logger.log('🔍 DEBUG: Retrieved courseProgress from Firebase:', courseProgress);
      logger.log('🔍 DEBUG: courseProgress.lastSessionCompleted:', courseProgress?.lastSessionCompleted);
      
      // Cache the result
      this.cache.set(progressCacheKey, {
        data: courseProgress || null,
        timestamp: Date.now()
      });
      
      logger.log('✅ Course progress retrieved');
      return courseProgress || null;
    } catch (error) {
      logger.error('❌ Error getting course progress:', error);
      return null;
    }
  }

  /**
   * Update course progress in user document
   */
  async updateCourseProgress(userId, courseId, sessionId, exercisesData) {
    try {
      logger.log('📈 Updating course progress:', { userId, courseId, sessionId });
      
      // Get current progress
      const currentProgress = await this.getCourseProgress(userId, courseId);
      
      // Track all completed sessions (only when actually completing, not skipping)
      const allSessionsCompleted = currentProgress?.allSessionsCompleted || [];
      const isActualCompletion = exercisesData && exercisesData.length > 0;
      
      // Add current session to completed list if it's an actual completion
      if (isActualCompletion && sessionId && !allSessionsCompleted.includes(sessionId)) {
        allSessionsCompleted.push(sessionId);
      }
      
      // Build progress data - SIMPLIFIED LOGIC
      const progressData = {
        ...currentProgress, // Keep existing data like weeklyStreak
        lastSessionCompleted: sessionId, // Set to the session being completed
        allSessionsCompleted: allSessionsCompleted,
        totalSessionsCompleted: (currentProgress?.totalSessionsCompleted || 0) + 1, // Fix: increment counter instead of using array length
        lastActivity: serverTimestamp()
      };
      
      // Update user document
      const userDocRef = doc(firestore, 'users', userId);
      await updateDoc(userDocRef, {
        [`courseProgress.${courseId}`]: progressData
      });

      // Invalidate session state cache so DailyWorkoutScreen shows "already completed" overlay on next open
      this.clearCache(userId, courseId);
      
      logger.log('📈 Course progress updated successfully');
      return progressData;
      
    } catch (error) {
      logger.error('❌ Error updating course progress:', error);
      throw error;
    }
  }

  /**
   * Add session data to exercise and session history
   * @param {string} userId - User ID
   * @param {Object} sessionData - Session data with exercises (performed)
   * @param {Object} [plannedSnapshot] - Optional snapshot of planned session at completion time
   */
  async addSessionData(userId, sessionData, plannedSnapshot = null) {
    try {
      logger.log('📚 Adding session data to history:', sessionData.sessionId);
      logger.log('📚 Session data structure:', {
        sessionId: sessionData.sessionId,
        courseId: sessionData.courseId,
        exercisesCount: sessionData.exercises?.length,
        exerciseKeys: sessionData.exercises?.map(ex => `${ex.libraryId}_${ex.exerciseName}`)
      });
      
      // Use the exerciseHistoryService which has proper data filtering
      await exerciseHistoryService.addSessionData(userId, sessionData, plannedSnapshot);
      
      // Update weekly streak after adding session data
      try {
        logger.log('🔥 Updating weekly streak after session data added');
        await sessionManager.updateWeeklyStreak(userId, sessionData.courseId, sessionData.sessionId);
        logger.log('✅ Weekly streak updated successfully');
      } catch (error) {
        logger.error('❌ Error updating weekly streak:', error);
        // Don't throw - streak update failure shouldn't break session completion
      }
      
      logger.log('✅ Session data added to history successfully');
      logger.log('🔍 SESSION COMPLETION SUMMARY:', {
        sessionId: sessionData.sessionId,
        sessionName: sessionData.sessionName,
        courseName: sessionData.courseName,
        exercisesCount: sessionData.exercises?.length,
        totalSets: sessionData.exercises?.reduce((total, ex) => total + (ex.sets?.length || 0), 0),
        setsWithData: sessionData.exercises?.reduce((total, ex) => {
          const setsWithData = ex.sets?.filter(set => {
            const hasReps = set.reps && set.reps !== '' && !isNaN(parseFloat(set.reps));
            const hasWeight = set.weight && set.weight !== '' && !isNaN(parseFloat(set.weight));
            return hasReps || hasWeight;
          }).length || 0;
          return total + setsWithData;
        }, 0)
      });
      
    } catch (error) {
      logger.error('❌ Error adding session data:', error);
      throw error;
    }
  }

  /**
   * Update 1RM calculations
   */
  async updateOneRepMax(userId, exercises) {
    try {
      for (const exercise of exercises) {
        if (exercise.sets && exercise.sets.length > 0) {
          const validSets = exercise.sets.filter(set => set.reps && set.weight);
          if (validSets.length > 0) {
            await oneRepMaxService.updateEstimatesAfterSession(userId, [exercise], validSets);
          }
        }
      }
    } catch (error) {
      logger.error('❌ Error updating 1RM:', error);
      // Don't throw - 1RM is not critical
    }
  }



  /**
   * Find current session ID from progress
   */
  findCurrentSessionId(progress, allSessions) {
    logger.log('🔍 DEBUG: findCurrentSessionId called');
    logger.log('🔍 DEBUG: progress.lastSessionCompleted:', progress?.lastSessionCompleted);
    
    if (!progress?.lastSessionCompleted) {
      logger.log('🔍 DEBUG: No lastSessionCompleted, returning first session');
      return allSessions[0]?.sessionId || allSessions[0]?.id;
    }
    
    const lastIndex = allSessions.findIndex(s => 
      (s.sessionId === progress.lastSessionCompleted) || (s.id === progress.lastSessionCompleted)
    );
    
    if (lastIndex === -1) {
      logger.log('🔍 DEBUG: lastIndex not found, returning first session');
      return allSessions[0]?.sessionId || allSessions[0]?.id;
    }
    
    // Return the NEXT session after the last completed one
    const nextSession = allSessions[lastIndex + 1];
    if (nextSession) {
      logger.log('🔍 DEBUG: Next session found:', nextSession.sessionId || nextSession.id);
      return nextSession.sessionId || nextSession.id;
    } else {
      // No next session - cycle complete, return first session
      logger.log('🔍 DEBUG: Cycle complete, returning first session');
      return allSessions[0]?.sessionId || allSessions[0]?.id;
    }
  }

  /**
   * Build workout from session data
   */
  async buildWorkoutFromSession(session) {
    const t0 = Date.now();
    try {
      logger.log('🏗️ Building workout from session:', session.title);
      logger.log('🔍 [buildWorkoutFromSession] session content:', {
        sessionId: session.sessionId || session.id,
        title: session.title,
        hasExercises: !!session.exercises?.length,
        exercisesCount: session.exercises?.length ?? 0,
        hasImageUrl: !!session.image_url,
        librarySessionRef: session.librarySessionRef ?? null,
        note: 'Empty exercises => no workout list; no image_url => no session image in UI'
      });

      if (!session.exercises || session.exercises.length === 0) {
        logger.log('🔍 [buildWorkoutFromSession] Session has NO EXERCISES - returning empty workout (root cause: session from getCourseModules may be library ref not resolved)', {
          sessionId: session.sessionId || session.id,
          title: session.title
        });
        return {
          id: session.sessionId || session.id,
          title: session.title || 'Sesión de entrenamiento',
          description: session.description || '',
          moduleId: session.moduleId,
          moduleTitle: session.moduleTitle || 'Módulo',
          sessionId: session.sessionId || session.id,
          image_url: session.image_url,
          exercises: []
        };
      }

      // Resolve all exercises in parallel (each resolvePrimaryExercise may hit Firestore/library - main cost when changing session)
      const resolvedExercises = await Promise.all(
        session.exercises.map(async (exercise) => {
          try {
            const primaryExerciseData = await exerciseLibraryService.resolvePrimaryExercise(exercise.primary);
            
            // Extract libraryId from primary reference
            const libraryId = Object.keys(exercise.primary)[0];
            
            const resolvedExercise = {
              id: exercise.id,
              name: primaryExerciseData.title,
              description: primaryExerciseData.description,
              video_url: primaryExerciseData.video_url,
              muscle_activation: primaryExerciseData.muscle_activation,
              libraryId: libraryId, // Include libraryId for proper exercise identification
              sets: exercise.sets || [],
              objectives: exercise.objectives || [],
              measures: exercise.measures || [],
              order: exercise.order || 0,
              primary: exercise.primary,
              alternatives: exercise.alternatives || {}
            };
            
            logger.log('🔍 BUILD WORKOUT DEBUG: Resolved exercise:', {
              exerciseName: resolvedExercise.name,
              libraryId: resolvedExercise.libraryId,
              exerciseId: resolvedExercise.id
            });
            
            return resolvedExercise;
          } catch (error) {
            logger.error('❌ Error resolving exercise:', exercise.primary, error);
            
            // Extract libraryId from primary reference even in error case
            const libraryId = exercise.primary ? Object.keys(exercise.primary)[0] : 'unknown';
            
            return {
              id: exercise.id,
              name: exercise.primary || 'Exercise',
              description: 'Exercise description not available',
              video_url: null,
              muscle_activation: {}, // Empty muscle activation as fallback
              libraryId: libraryId, // Include libraryId even in error case
              sets: exercise.sets || [],
              objectives: exercise.objectives || [],
              measures: exercise.measures || [],
              order: exercise.order || 0,
              primary: exercise.primary,
              alternatives: exercise.alternatives || {}
            };
          }
        })
      );

      const workout = {
        id: session.sessionId || session.id,
        title: session.title || 'Sesión de entrenamiento',
        description: session.description || '',
        moduleId: session.moduleId,
        moduleTitle: session.moduleTitle || 'Módulo',
        sessionId: session.sessionId || session.id,
        image_url: session.image_url,
        exercises: resolvedExercises
      };

      if (!session.image_url) {
        logger.log('🔍 [buildWorkoutFromSession] Session has no image_url - card/header may show no image', { sessionId: session.sessionId || session.id });
      }
      logger.log('✅ Workout built with', workout.exercises.length, 'exercises in', Date.now() - t0, 'ms');
      return workout;

    } catch (error) {
      logger.error('❌ Error building workout:', error);
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
   * Start a new cycle (when all sessions are completed)
   */
  async startNewCycle(userId, courseId) {
    try {
      logger.log('🔄 Starting new cycle for user:', userId, 'course:', courseId);
      
      const progress = await this.getCourseProgress(userId, courseId);
      
      if (!progress) {
        logger.log('⚠️ No progress found, creating new progress');
        return;
      }
      
      // Increment cycles completed
      const cyclesCompleted = (progress.cyclesCompleted || 0) + 1;
      
      // Reset to first session (lastSessionCompleted = null means first session)
      const updatedProgress = {
        ...progress,
        cyclesCompleted: cyclesCompleted,
        lastSessionCompleted: null,
        lastActivity: serverTimestamp()
      };
      
      // Update user document
      const userDocRef = doc(firestore, 'users', userId);
      await updateDoc(userDocRef, {
        [`courseProgress.${courseId}`]: updatedProgress
      });
      
      // Clear cache to force refresh
      this.clearCache(userId, courseId);
      
      logger.log('✅ New cycle started. Cycles completed:', cyclesCompleted);
      
    } catch (error) {
      logger.error('❌ Error starting new cycle:', error);
      throw error;
    }
  }

  /**
   * Clean data for Firestore (remove undefined values)
   */
  cleanFirestoreData(data) {
    if (data === null || data === undefined) return null;
    if (typeof data !== 'object') return data;
    
    const cleaned = {};
    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined) {
        cleaned[key] = this.cleanFirestoreData(value);
      }
    }
    return cleaned;
  }

  /**
   * Clear cache
   */
  clearCache(userId, courseId) {
    const sessionCacheKey = `${userId}_${courseId}`;
    const progressCacheKey = `progress_${userId}_${courseId}`;
    this.cache.delete(sessionCacheKey);
    this.cache.delete(progressCacheKey);
    logger.log('🗑️ Cache cleared for:', sessionCacheKey, 'and', progressCacheKey);
  }

  /**
   * Clear all cache
   */
  clearAllCache() {
    this.cache.clear();
    logger.log('🗑️ All cache cleared');
  }
}

export default new SessionService();
