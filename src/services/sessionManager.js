// Ultra-Simple Session Manager
import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, setDoc, updateDoc, increment } from 'firebase/firestore';
import { firestore } from '../config/firebase';
import { shouldTrackMuscleVolume } from '../constants/muscles';
import { getMondayWeek } from '../utils/weekCalculation';
import oneRepMaxService from './oneRepMaxService';
import exerciseHistoryService from './exerciseHistoryService';
import userProgressService from './userProgressService';
import logger from '../utils/logger.js';

class SessionManager {
  
  /**
   * Cache progress with timestamp
   */
  async cacheProgress(userId, courseId, progressData) {
    try {
      await AsyncStorage.setItem(`progress_${userId}_${courseId}`, JSON.stringify({
        data: progressData,
        timestamp: Date.now()
      }));
      logger.log('💾 Progress cached for user:', userId, 'course:', courseId);
    } catch (error) {
      logger.error('❌ Error caching progress:', error);
    }
  }

  /**
   * Get cached progress with staleness check
   */
  async getCachedProgress(userId, courseId) {
    try {
      const cached = await AsyncStorage.getItem(`progress_${userId}_${courseId}`);
      if (!cached) return null;
      
      const { data, timestamp } = JSON.parse(cached);
      const isStale = (Date.now() - timestamp) > (24 * 60 * 60 * 1000); // 24h TTL
      
      return { data, isStale };
    } catch (error) {
      logger.error('❌ Error reading cached progress:', error);
      return null;
    }
  }

  /**
   * Clear all cached progress for a specific user (for sign out)
   */
  async clearUserCache(userId) {
    try {
      logger.log(`🗑️ Clearing session progress cache for user: ${userId}`);
      
      // Get all keys and filter for this user's progress
      const keys = await AsyncStorage.getAllKeys();
      const userProgressKeys = keys.filter(key => key.startsWith(`progress_${userId}_`));
      
      // Remove all user-specific progress caches
      await Promise.all(userProgressKeys.map(key => AsyncStorage.removeItem(key)));
      
      logger.log(`✅ Cleared ${userProgressKeys.length} session progress cache(s) for user: ${userId}`);
    } catch (error) {
      logger.error('❌ Error clearing session progress cache:', error);
    }
  }

  /**
   * Helper: Flatten all sessions from all modules
   */
  flattenAllSessions(courseData) {
    const allSessions = [];
    if (courseData.modules && courseData.modules.length > 0) {
      // Course has modules - flatten all sessions
      courseData.modules.forEach((module, moduleIndex) => {
        if (module.sessions && module.sessions.length > 0) {
          module.sessions.forEach((session, sessionIndex) => {
            allSessions.push({
              ...session,
              moduleTitle: module.title,
              moduleId: module.id,
              moduleOrder: moduleIndex,
              sessionOrder: sessionIndex
            });
          });
        }
      });
    } else if (courseData.sessions) {
      // Course has direct sessions (no modules)
      courseData.sessions.forEach((session, index) => {
        allSessions.push({
          ...session,
          moduleTitle: 'Sesión',
          moduleOrder: 0,
          sessionOrder: index
        });
      });
    }
    return allSessions;
  }
  
  /**
   * Start a new session
   */
  async startSession(userId, courseId, sessionId, sessionName) {
    try {
      const sessionData = {
        sessionId,
        userId,
        courseId,
        sessionName,
        startTime: new Date().toISOString(),
        exercises: []
      };
      
      await AsyncStorage.setItem('current_session', JSON.stringify(sessionData));
      logger.log('✅ Session started:', sessionId);
      return sessionData;
    } catch (error) {
      logger.error('❌ Error starting session:', error);
      throw error;
    }
  }
  
  /**
   * Add exercise data to current session
   */
  async addExerciseData(exerciseId, exerciseName, sets) {
    try {
      const sessionData = await this.getCurrentSession();
      if (!sessionData) {
        throw new Error('No active session');
      }
      
      // Find or create exercise
      let exercise = sessionData.exercises.find(e => e.exerciseId === exerciseId);
      if (!exercise) {
        exercise = {
          exerciseId,
          exerciseName,
          sets: []
        };
        sessionData.exercises.push(exercise);
      }
      
      // Update sets
      exercise.sets = sets;
      
      // Save locally
      await AsyncStorage.setItem('current_session', JSON.stringify(sessionData));
      logger.log('✅ Exercise data saved:', exerciseName);
      
    } catch (error) {
      logger.error('❌ Error adding exercise data:', error);
      throw error;
    }
  }
  
  /**
   * Complete session and upload everything
   * @param {Object} workout - Workout object with exercises (for muscle volume)
   * @param {Object} course - Course object with discipline info
   */
  async completeSession(workout = null, course = null) {
    try {
      const sessionData = await this.getCurrentSession();
      if (!sessionData) {
        throw new Error('No active session');
      }
      
      // Calculate duration
      const startTime = new Date(sessionData.startTime);
      const endTime = new Date();
      sessionData.duration = Math.round((endTime - startTime) / (1000 * 60));
      sessionData.completedAt = endTime.toISOString();
      
      // Add course name if available
      if (course && course.name) {
        sessionData.courseName = course.name;
      }
      
      // Calculate stats
      const stats = this.calculateStats(sessionData);
      
      logger.log('🏁 Session completed:', sessionData.sessionId);
      logger.log('📊 Stats:', stats);
      
      // Calculate muscle volumes for this session (if discipline supports it)
      let sessionMuscleVolumes = {};
      if (workout && course && shouldTrackMuscleVolume(course.discipline)) {
        logger.log('💪 Discipline supports muscle tracking:', course.discipline);
        sessionMuscleVolumes = this.calculateMuscleVolumes(workout);
      } else {
        logger.log('⏭️ Discipline does not support muscle tracking or data missing');
      }
      
      // Update course progress in user document
      const progressData = await this.updateCourseProgress(sessionData.userId, sessionData.courseId, sessionData.sessionId, sessionData.exercises);
      
      // Update exercise history subcollections
      await exerciseHistoryService.addSessionData(sessionData.userId, sessionData);
      
      // Update weekly muscle volumes (if applicable)
      if (Object.keys(sessionMuscleVolumes).length > 0) {
        await this.updateWeeklyMuscleVolumes(sessionData.userId, sessionMuscleVolumes);
      }
      
      // Update weekly streak
      await this.updateWeeklyStreak(sessionData.userId, sessionData.courseId, sessionData.sessionId);
      
      // Cleanup
      await AsyncStorage.removeItem('current_session');
      
      logger.log('✅ Session uploaded and completed');
      
      return {
        sessionData,
        stats,
        sessionMuscleVolumes
      };
      
    } catch (error) {
      logger.error('❌ Error completing session:', error);
      throw error;
    }
  }
  
  /**
   * Upload session data to Firestore - REMOVED (now handled by exerciseHistoryService)
   */
  
  /**
   * Calculate muscle-specific volumes from workout data
   * @param {Array} workout - Workout object with exercises
   * @returns {Object} - Map of muscle names to volumes
   */
  calculateMuscleVolumes(workout) {
    logger.log('🔍 VOLUME DEBUG: calculateMuscleVolumes called');
    logger.log('🔍 VOLUME DEBUG: Workout structure:', {
      hasWorkout: !!workout,
      hasExercises: !!workout?.exercises,
      exercisesLength: workout?.exercises?.length,
      workoutKeys: workout ? Object.keys(workout) : 'no workout'
    });
    
    logger.log('💪 calculateMuscleVolumes: Starting calculation (counting effective sets)');
    
    if (!workout || !workout.exercises || workout.exercises.length === 0) {
      logger.log('⚠️ No exercises to calculate');
      return {};
    }
    
    const muscleSets = {};
    
    workout.exercises.forEach((exercise, exerciseIndex) => {
      logger.log(`🔍 VOLUME DEBUG: Processing exercise ${exerciseIndex + 1}:`, {
        exerciseName: exercise.name,
        hasMuscleActivation: !!exercise.muscle_activation,
        muscleActivationData: exercise.muscle_activation,
        hasSets: !!exercise.sets,
        setsLength: exercise.sets?.length,
        firstSetData: exercise.sets?.[0]
      });
      
      logger.log(`💪 Processing exercise ${exerciseIndex + 1}:`, exercise.name);
      
      // Check if exercise has muscle activation data
      if (!exercise.muscle_activation) {
        logger.log(`  ⏭️ No muscle_activation data - skipping`);
        return;
      }
      
      // Debug: Log the muscle activation data received
      logger.log(`  💪 Muscle activation data received:`, exercise.muscle_activation);
      logger.log(`  💪 Type:`, typeof exercise.muscle_activation);
      logger.log(`  💪 Keys:`, Object.keys(exercise.muscle_activation));
      
      // Get sets data from session
      if (!exercise.sets || exercise.sets.length === 0) {
        logger.log(`  ⏭️ No sets data - skipping`);
        return;
      }
      
      // Count effective sets (intensity >= 7, with actual data)
      let effectiveSets = 0;
      exercise.sets.forEach((set, setIndex) => {
        logger.log(`🔍 VOLUME DEBUG: Processing set ${setIndex + 1}:`, {
          setData: set,
          hasWeight: !!set.weight,
          hasReps: !!set.reps,
          hasIntensity: !!set.intensity,
          weightValue: set.weight,
          repsValue: set.reps,
          intensityValue: set.intensity
        });
        
        // Skip if no actual performance data (need at least reps OR weight)
        const weight = set.weight;
        const reps = set.reps;
        if ((!weight || weight === '') && (!reps || reps === '')) {
          logger.log(`  ⏭️ Set ${setIndex + 1}: No data (needs reps OR weight) - skipping`);
          return;
        }
        
        // Parse objective intensity
        const intensity = oneRepMaxService.parseIntensity(set.intensity);
        
        logger.log(`  📊 Set ${setIndex + 1}: intensity=${intensity}/10, data=${weight}kg × ${reps} reps`);
        
        // Count as effective if intensity >= 7
        if (intensity >= 7) {
          effectiveSets++;
          logger.log(`    ✅ Effective set counted`);
        } else {
          logger.log(`    ⏭️ Intensity too low (${intensity} < 7) - not counted`);
        }
      });
      
      logger.log(`  ✅ Total effective sets for ${exercise.name}: ${effectiveSets}`);
      
      // Distribute effective sets to muscles based on activation percentages
      Object.entries(exercise.muscle_activation).forEach(([muscle, percentage]) => {
        // Convert percentage to number if it's a string
        const numericPercentage = typeof percentage === 'string' ? parseFloat(percentage) : percentage;
        
        if (isNaN(numericPercentage)) {
          logger.log(`    ⚠️ Invalid percentage for ${muscle}: "${percentage}" - skipping`);
          return;
        }
        
        const muscleSetsContribution = effectiveSets * (numericPercentage / 100);
        muscleSets[muscle] = (muscleSets[muscle] || 0) + muscleSetsContribution;
        
        logger.log(`    💪 ${muscle}: +${muscleSetsContribution.toFixed(2)} sets (${numericPercentage}%)`);
      });
    });
    
    // Round all set counts to 1 decimal
    Object.keys(muscleSets).forEach(muscle => {
      muscleSets[muscle] = Math.round(muscleSets[muscle] * 10) / 10;
    });
    
    logger.log('✅ Muscle sets calculated:', muscleSets);
    return muscleSets;
  }
  
  /**
   * Update weekly muscle volumes in user document
   * @param {string} userId - User ID
   * @param {Object} sessionMuscleVolumes - Map of muscle names to volumes
   */
  async updateWeeklyMuscleVolumes(userId, sessionMuscleVolumes) {
    try {
      logger.log('🔍 VOLUME DEBUG: updateWeeklyMuscleVolumes called');
      logger.log('🔍 VOLUME DEBUG: Parameters:', {
        userId: userId,
        sessionMuscleVolumes: sessionMuscleVolumes,
        volumesCount: Object.keys(sessionMuscleVolumes).length
      });
      
      const currentWeek = getMondayWeek();
      logger.log('💪 Updating weekly muscle volumes for week:', currentWeek);
      logger.log('💪 Session muscle volumes:', sessionMuscleVolumes);
      
      const userDocRef = doc(firestore, 'users', userId);
      
      // Build update object with increment operations
      const updates = {};
      Object.entries(sessionMuscleVolumes).forEach(([muscle, volume]) => {
        updates[`weeklyMuscleVolume.${currentWeek}.${muscle}`] = increment(volume);
        logger.log(`🔍 VOLUME DEBUG: Adding update for ${muscle}:`, {
          field: `weeklyMuscleVolume.${currentWeek}.${muscle}`,
          volume: volume,
          incrementValue: volume
        });
      });
      
      logger.log('🔍 VOLUME DEBUG: Final updates object:', updates);
      
      await updateDoc(userDocRef, updates);
      
      logger.log('✅ Weekly muscle volumes updated');
    } catch (error) {
      logger.error('❌ Error updating weekly muscle volumes:', error);
      // Don't throw - we don't want to block session completion
    }
  }
  
  /**
   * Update course progress in user document
   */
  async updateCourseProgress(userId, courseId, sessionId, exercisesData) {
    try {
      logger.log('📈 updateCourseProgress called with:', { userId, courseId, sessionId });
      
      // Get current progress
      const currentProgress = await userProgressService.getCourseProgress(userId, courseId);
      
      // Track all completed sessions (only when actually completing, not skipping)
      const allSessionsCompleted = currentProgress?.allSessionsCompleted || [];
      const isActualCompletion = exercisesData && exercisesData.length > 0;
      
      // Add current session to completed list if it's an actual completion
      if (isActualCompletion && sessionId && !allSessionsCompleted.includes(sessionId)) {
        allSessionsCompleted.push(sessionId);
      }
      
      const progressData = {
        lastSessionCompleted: sessionId || null,
        totalSessionsCompleted: (currentProgress?.totalSessionsCompleted || 0) + 1,
        allSessionsCompleted: allSessionsCompleted,
        lastActivity: new Date().toISOString(),
        weeklyStreak: currentProgress?.weeklyStreak || null
      };
      
      // Add lastSessionPerformed if exercise data provided
      if (exercisesData && sessionId) {
        logger.log('📝 Processing exercises data:', exercisesData.length, 'exercises');
        
        // Convert exercises array to object keyed by exercise ID
        const exercisesMap = {};
        exercisesData.forEach((exercise, idx) => {
          logger.log(`Exercise ${idx}:`, exercise.exerciseId, exercise.exerciseName, 'Sets:', exercise.sets?.length);
          
          if (exercise.exerciseId && exercise.sets) {
            // Sanitize data - remove undefined values
            const sanitizedSets = exercise.sets.map(set => {
              const cleanSet = {};
              Object.keys(set).forEach(key => {
                if (set[key] !== undefined && set[key] !== null && set[key] !== '') {
                  cleanSet[key] = set[key];
                }
              });
              return cleanSet;
            }).filter(set => Object.keys(set).length > 0);
            
            if (sanitizedSets.length > 0) {
              exercisesMap[exercise.exerciseId] = {
                sets: sanitizedSets,
                exerciseName: exercise.exerciseName || 'Exercise'
              };
            }
          }
        });
        
        if (Object.keys(exercisesMap).length > 0) {
          // Get existing lastSessionPerformed
          const existingLastSession = currentProgress?.lastSessionPerformed || {};
          
          // Only keep session data (not progress fields)
          const cleanExistingLastSession = {};
          Object.keys(existingLastSession).forEach(key => {
            if (key !== 'userId' && key !== 'courseId' && key !== 'totalSessionsCompleted' && 
                key !== 'lastActivity' && key !== 'weeklyStreak' && key !== 'lastSessionCompleted') {
              cleanExistingLastSession[key] = existingLastSession[key];
            }
          });
          
          progressData.lastSessionPerformed = {
            ...cleanExistingLastSession,
            [sessionId]: {
              completedAt: new Date().toISOString(),
              exercises: exercisesMap
            }
          };
        }
      } else if (currentProgress?.lastSessionPerformed) {
        // Preserve existing lastSessionPerformed
        const existingLastSession = currentProgress.lastSessionPerformed;
        const cleanExistingLastSession = {};
        Object.keys(existingLastSession).forEach(key => {
          if (key !== 'userId' && key !== 'courseId' && key !== 'totalSessionsCompleted' && 
              key !== 'lastActivity' && key !== 'weeklyStreak' && key !== 'lastSessionCompleted') {
            cleanExistingLastSession[key] = existingLastSession[key];
          }
        });
        if (Object.keys(cleanExistingLastSession).length > 0) {
          progressData.lastSessionPerformed = cleanExistingLastSession;
        }
      }
      
      // Update course progress in user document
      await userProgressService.updateCourseProgress(userId, courseId, progressData);
      
      logger.log('📈 Course progress updated successfully');
      return progressData;
      
    } catch (error) {
      logger.error('❌ Error updating course progress:', error);
      throw error;
    }
  }
  
  /**
   * Get current session from local storage
   */
  async getCurrentSession() {
    try {
      const sessionData = await AsyncStorage.getItem('current_session');
      return sessionData ? JSON.parse(sessionData) : null;
    } catch (error) {
      logger.error('❌ Error getting current session:', error);
      return null;
    }
  }
  
  /**
   * Get course progress from user document
   */
  async getCloudProgress(userId, courseId, forceRefresh = false) {
    try {
      // 1. Try cache first (instant) - unless force refresh
      if (!forceRefresh) {
        const cached = await this.getCachedProgress(userId, courseId);
        
        if (cached && !cached.isStale) {
          logger.log('✅ Using cached progress (instant)');
          return cached.data;
        }
      }
      
      // 2. Fetch from user document (cache stale, missing, or forced refresh)
      logger.log(forceRefresh ? '🔄 Force refresh from user document' : '☁️ Cache stale/missing, fetching from user document');
      const progressData = await userProgressService.getCourseProgress(userId, courseId);
      
      if (progressData) {
        logger.log('📊 Progress retrieved from user document');
        // Update cache with fresh data
        await this.cacheProgress(userId, courseId, progressData);
      } else {
        logger.log('📊 No progress found in user document - clearing cache');
        // Clear stale cache if document doesn't exist
        await AsyncStorage.removeItem(`progress_${userId}_${courseId}`);
      }
      
      return progressData;
      
    } catch (error) {
      logger.error('❌ Error getting course progress:', error);
      return null;
    }
  }
  
  /**
   * Calculate session stats
   */
  calculateStats(sessionData) {
    const totalSets = sessionData.exercises.reduce((total, exercise) => 
      total + (exercise.sets ? exercise.sets.length : 0), 0
    );
    
    const totalExercises = sessionData.exercises.length;
    
    return {
      totalSets,
      totalExercises,
      duration: sessionData.duration || 0,
      exercises: sessionData.exercises.map(exercise => ({
        exerciseId: exercise.exerciseId,
        exerciseName: exercise.exerciseName,
        setsCount: exercise.sets ? exercise.sets.length : 0,
        sets: exercise.sets || []
      }))
    };
  }
  
  /**
   * Skip current session - move to next session
   */
  async skipSession(userId, courseId, currentSessionId) {
    try {
      logger.log('⏭️ Skipping session:', currentSessionId);
      
      // Get course data
      const courseDataResponse = await this.getCourseDataForWorkout(courseId);
      const courseData = courseDataResponse.courseData;
      
      if (!courseData) {
        throw new Error('Course data not found');
      }
      
      const allSessions = this.flattenAllSessions(courseData);
      if (allSessions.length === 0) {
        throw new Error('No sessions found in course');
      }
      
      // Find current session index
      const currentIndex = allSessions.findIndex(s => 
        (s.sessionId === currentSessionId) || (s.id === currentSessionId)
      );
      
      logger.log('📍 Current session index:', currentIndex, 'out of', allSessions.length);
      logger.log('🔍 Looking for session ID:', currentSessionId);
      logger.log('📋 Available session IDs:', allSessions.map(s => s.sessionId || s.id));
      
      if (currentIndex < 0) {
        throw new Error('Current session not found');
      }
      
      // Get next session
      let nextSessionId = null;
      if (currentIndex < allSessions.length - 1) {
        // There's a next session
        const nextSession = allSessions[currentIndex + 1];
        nextSessionId = nextSession.sessionId || nextSession.id;
        logger.log('➡️ Next session found:', nextSessionId);
      } else {
        // This is the last session, cycle complete
        logger.log('🏁 Last session - cycle complete');
        nextSessionId = null;
      }
      
      // Update progress
      const progress = await this.getCloudProgress(userId, courseId);
      if (!progress) {
        logger.log('⚠️ No progress found, creating new progress for skip operation');
        // Create minimal progress for skip operation
        const newProgress = {
          lastSessionCompleted: nextSessionId,
          totalSessionsCompleted: 1,
          createdAt: new Date(),
          updatedAt: new Date()
        };
        await this.updateCourseProgress(userId, courseId, nextSessionId, null);
        logger.log('✅ Session skipped. Next session:', nextSessionId);
        return;
      }
      
      progress.lastSessionCompleted = nextSessionId;
      progress.totalSessionsCompleted = (progress.totalSessionsCompleted || 0) + 1;
      
      // Save progress
      await this.updateCourseProgress(userId, courseId, nextSessionId, null);
      
      // Update streak
      await this.updateWeeklyStreak(userId, courseId, currentSessionId);
      
      logger.log('✅ Session skipped. Next session:', nextSessionId);
    } catch (error) {
      logger.error('❌ Error skipping session:', error);
      throw error;
    }
  }
  
  /**
   * Go back to previous session
   */
  async goBackSession(userId, courseId, currentSessionId) {
    try {
      logger.log('⬅️ Going back from session:', currentSessionId);
      
      // Get course data
      const courseDataResponse = await this.getCourseDataForWorkout(courseId);
      const courseData = courseDataResponse.courseData;
      
      if (!courseData) {
        throw new Error('Course data not found');
      }
      
      const allSessions = this.flattenAllSessions(courseData);
      if (allSessions.length === 0) {
        throw new Error('No sessions found in course');
      }
      
      // Find current session index
      const currentIndex = allSessions.findIndex(s => 
        (s.sessionId === currentSessionId) || (s.id === currentSessionId)
      );
      
      logger.log('📍 Current session index:', currentIndex, 'out of', allSessions.length);
      logger.log('🔍 Looking for session ID:', currentSessionId);
      logger.log('📋 Available session IDs:', allSessions.map(s => s.sessionId || s.id));
      
      if (currentIndex < 0) {
        logger.log('❌ Current session not found in course');
        return; // Just return, don't throw error
      }
      
      if (currentIndex === 0) {
        logger.log('❌ Already at first session, cannot go back');
        return; // Just return, don't throw error
      }
      
      // Get previous session
      const previousSession = allSessions[currentIndex - 1];
      const previousSessionId = previousSession.sessionId || previousSession.id;
      
      logger.log('⬅️ Previous session found:', previousSessionId);
      
      // Update progress - go back means we're now on the previous session
      const progress = await this.getCloudProgress(userId, courseId);
      if (!progress) {
        logger.log('⚠️ No progress found, creating new progress for go back operation');
        // Create minimal progress for go back operation
        const newProgress = {
          lastSessionCompleted: previousSessionId,
          totalSessionsCompleted: 0, // Going back means we haven't completed sessions yet
          createdAt: new Date(),
          updatedAt: new Date()
        };
        await this.updateCourseProgress(userId, courseId, previousSessionId, null);
        logger.log('✅ Went back to session:', previousSessionId);
        return;
      }
      
      // When going back, we're now on the previous session
      // So lastSessionCompleted should point to the session BEFORE the previous one
      let newLastCompleted = null;
      if (currentIndex > 1) {
        // There's a session before the previous one
        const sessionBeforePrevious = allSessions[currentIndex - 2];
        newLastCompleted = sessionBeforePrevious.sessionId || sessionBeforePrevious.id;
      }
      
      progress.lastSessionCompleted = newLastCompleted;
      progress.totalSessionsCompleted = Math.max(0, (progress.totalSessionsCompleted || 0) - 1);
      
      logger.log('🔄 Updating progress - lastSessionCompleted:', newLastCompleted);
      
      // Save progress
      await this.updateCourseProgress(userId, courseId, newLastCompleted, null);
      
      logger.log('✅ Went back to session:', previousSessionId);
    } catch (error) {
      logger.error('❌ Error going back session:', error);
      throw error;
    }
  }
  /**
   * Get next session for a course (simple implementation)
   */
  async getNextSession(userId, courseId, courseData) {
    try {
      logger.log('🔍 getNextSession called with:', { userId, courseId, courseData });
      
      // First try to get progress from database
      const cloudProgress = await this.getCloudProgress(userId, courseId);
      logger.log('☁️ Cloud progress found:', cloudProgress);
      
      // Get all sessions from all modules (flattened)
      const allSessions = this.flattenAllSessions(courseData);
      logger.log('📋 All sessions flattened:', allSessions.length, 'sessions from', courseData.modules?.length || 1, 'modules');
      
      if (allSessions.length === 0) {
        throw new Error('No sessions found in course');
      }
      
      // If no cloud progress, return first session
      if (!cloudProgress || !cloudProgress.lastSessionCompleted) {
        logger.log('🆕 No cloud progress found, returning first session');
        const firstSession = allSessions[0];
        logger.log('🎯 First session:', firstSession);
        return { nextSession: firstSession };
      }
      
      logger.log('📋 Available sessions:', allSessions.map(s => s.sessionId || s.id));
      
      // Find the last completed session
      const lastSessionId = cloudProgress.lastSessionCompleted;
      logger.log('🔍 Looking for session after:', lastSessionId);
      
      const lastSessionIndex = allSessions.findIndex(s => 
        (s.sessionId === lastSessionId) || (s.id === lastSessionId)
      );
      
      logger.log('📍 Last session index:', lastSessionIndex, 'out of', allSessions.length);
      
      // Check if all sessions completed (cycle complete)
      if (lastSessionIndex >= allSessions.length - 1) {
        logger.log('🔄 Cycle complete! Starting new cycle...');
        await this.startNewCycle(userId, courseId);
        
        // Return first session of new cycle
        const firstSession = allSessions[0];
        logger.log('🎯 Starting new cycle with session:', firstSession);
        return { nextSession: firstSession };
      }
      
      // Return next session if available
      if (lastSessionIndex >= 0 && lastSessionIndex < allSessions.length - 1) {
        const nextSession = allSessions[lastSessionIndex + 1];
        logger.log('➡️ Next session:', nextSession);
        return { nextSession: nextSession };
      }
      
      // Fallback to first session
      logger.log('🆘 Fallback to first session');
      const firstSession = allSessions[0];
      return { nextSession: firstSession };
      
    } catch (error) {
      logger.error('❌ Error getting next session:', error);
      // Fallback to first session
      const sessions = courseData.sessions || courseData.modules?.[0]?.sessions || [];
      const firstSession = sessions[0];
      logger.log('🆘 Fallback to first session:', firstSession);
      return { nextSession: firstSession };
    }
  }
  
  /**
   * Start a new cycle (reset progress for subscription programs)
   */
  async startNewCycle(userId, courseId) {
    try {
      logger.log('🔄 Starting new cycle for user:', userId, 'course:', courseId);
      
      const progress = await this.getCloudProgress(userId, courseId);
      if (!progress) {
        logger.log('⚠️ No progress found, creating new progress');
        return;
      }
      
      // Reset progress for new cycle
      progress.lastSessionCompleted = null;
      progress.totalSessionsCompleted = 0;
      progress.cyclesCompleted = (progress.cyclesCompleted || 0) + 1;
      progress.currentCycleStart = new Date().toISOString();
      
      // Keep streak data intact
      logger.log('✅ Cycle reset complete. Cycles completed:', progress.cyclesCompleted);
      
      // Save to cloud
      await this.updateCourseProgress(userId, courseId, progress.lastSessionCompleted, null);
      
    } catch (error) {
      logger.error('❌ Error starting new cycle:', error);
      throw error;
    }
  }
  
  /**
   * Simplified weekly streak update using existing week tracking system
   */
  async updateWeeklyStreak(userId, courseId, sessionId) {
    try {
      logger.log('🔥 Starting weekly streak update:', { userId, courseId, sessionId });

      const progress = await this.getCloudProgress(userId, courseId, true); // Force refresh to get latest streak data
      const courseData = await this.getCourseDataForWorkout(courseId);
      
      if (!progress) {
        logger.error('❌ No progress data found for streak update');
        return;
      }

      logger.log('🔍 DEBUG: Progress data structure:', {
        hasProgress: !!progress,
        hasWeeklyStreak: !!progress.weeklyStreak,
        weeklyStreakValue: progress.weeklyStreak,
        progressKeys: Object.keys(progress || {})
      });
      
      if (!courseData) {
        logger.error('❌ No course data found for streak update');
        return;
      }
      
      const minimumSessions = courseData.programSettings?.minimumSessionsPerWeek || 3;
      const currentWeek = getMondayWeek(); // Use existing week tracking system
      
      // Initialize streak if not exists (first workout ever)
      if (!progress.weeklyStreak) {
        progress.weeklyStreak = {
          currentStreak: 1, // Start streak immediately on first workout
          sessionsCompletedThisWeek: 1,
          weekStart: currentWeek, // Use existing week key format
          lastWorkoutDate: new Date().toISOString()
        };
        
        logger.log('🔥 First workout - starting streak immediately!', {
          currentStreak: 1,
          sessionsCompletedThisWeek: 1,
          weekStart: currentWeek,
          lastWorkoutDate: new Date().toISOString()
        });
      } else {
        // Check if we're in a new week
        if (progress.weeklyStreak.weekStart !== currentWeek) {
          // Previous week evaluation: if >= minimum → increment, else reset
          const previousSessions = progress.weeklyStreak.sessionsCompletedThisWeek;
          const previousStreak = progress.weeklyStreak.currentStreak;
          
          if (previousSessions >= minimumSessions) {
            progress.weeklyStreak.currentStreak++;
            logger.log('🔥 Week completed successfully - streak increased!', {
              previousStreak,
              newStreak: progress.weeklyStreak.currentStreak,
              sessionsCompleted: previousSessions,
              minimumRequired: minimumSessions
            });
          } else {
            progress.weeklyStreak.currentStreak = 0;
            logger.log('💔 Week not completed - streak reset to 0', {
              previousStreak,
              sessionsCompleted: previousSessions,
              minimumRequired: minimumSessions
            });
          }
          
          // Reset for new week
          progress.weeklyStreak.weekStart = currentWeek;
          progress.weeklyStreak.sessionsCompletedThisWeek = 1; // Start with 1 for current workout
          
          logger.log('📅 New week started', {
            newWeekStart: currentWeek,
            sessionsCompletedThisWeek: 1
          });
        } else {
          // Same week - just increment sessions
          const previousSessions = progress.weeklyStreak.sessionsCompletedThisWeek;
          progress.weeklyStreak.sessionsCompletedThisWeek++;
          
          logger.log('📈 Same week - incrementing sessions', {
            previousSessions,
            newSessions: progress.weeklyStreak.sessionsCompletedThisWeek,
            currentStreak: progress.weeklyStreak.currentStreak
          });
        }
        
        // Update last workout date
        progress.weeklyStreak.lastWorkoutDate = new Date().toISOString();
      }
      
      // Save updated streak to user document
      await userProgressService.updateWeeklyStreak(userId, courseId, progress.weeklyStreak);
      
      logger.log('📊 Streak updated:', {
        currentStreak: progress.weeklyStreak.currentStreak,
        sessionsCompletedThisWeek: progress.weeklyStreak.sessionsCompletedThisWeek,
        weekStart: progress.weeklyStreak.weekStart,
        lastWorkoutDate: progress.weeklyStreak.lastWorkoutDate
      });
      
    } catch (error) {
      logger.error('❌ Error updating weekly streak:', error);
      // Re-throw the error so calling code can handle it appropriately
      throw error;
    }
  }

  /**
   * Get current week start (Monday) - legacy method
   */
  getCurrentWeekStart() {
    const now = new Date();
    const dayOfWeek = now.getDay();
    const monday = new Date(now);
    monday.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
    monday.setHours(0, 0, 0, 0);
    return monday.toISOString().split('T')[0]; // YYYY-MM-DD format
  }


  /**
   * Get course data for workout (simple implementation)
   */
  async getCourseDataForWorkout(courseId) {
    try {
      // Import workoutProgressService dynamically to avoid circular dependency
      const workoutProgressService = await import('../data-management/workoutProgressService');
      return await workoutProgressService.default.getCourseDataForWorkout(courseId);
    } catch (error) {
      logger.error('❌ Error getting course data:', error);
      return null;
    }
  }

  /**
   * Cancel current session
   */
  async cancelSession() {
    try {
      await AsyncStorage.removeItem('current_session');
      logger.log('❌ Session cancelled');
    } catch (error) {
      logger.error('❌ Error cancelling session:', error);
    }
  }
  
  /**
   * Clear all progress for a course (for testing/reset)
   */
  async clearProgress(userId, courseId) {
    try {
      // Clear local progress
      const key = `progress_${userId}_${courseId}`;
      await AsyncStorage.removeItem(key);
      
      // Clear any current session
      await AsyncStorage.removeItem('current_session');
      
      logger.log('🗑️ Progress cleared for:', { userId, courseId });
      
    } catch (error) {
      logger.error('❌ Error clearing progress:', error);
    }
  }
}

export default new SessionManager();
