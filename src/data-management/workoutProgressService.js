// Workout Progress Service - Main orchestrator for the workout progress system
import AsyncStorage from '@react-native-async-storage/async-storage';
import courseDownloadService from './courseDownloadService';
import workoutSessionService from './workoutSessionService';
import uploadService from './uploadService';
import sessionRecoveryService from './sessionRecoveryService';
import progressQueryService from './progressQueryService';
import storageManagementService from './storageManagementService';
import firestoreService from '../services/firestoreService';
import exerciseLibraryService from '../services/exerciseLibraryService';

import logger from '../utils/logger.js';
class WorkoutProgressService {
  /**
   * Initialize the workout progress system
   * Called on app startup
   */
  async initialize() {
    try {
      logger.log('🚀 Initializing workout progress system...');
      
      // Initialize recovery system (handles crashed sessions)
      await sessionRecoveryService.initializeRecovery();
      
      // Optimize storage (cleanup old data)
      await storageManagementService.optimizeStorage();
      
      // Check for expired courses (will be enhanced when auth context is available)
      logger.log('🔍 Checking for expired courses...');
      
      logger.log('✅ Workout progress system initialized');
      
    } catch (error) {
      logger.error('❌ Failed to initialize workout progress system:', error);
    }
  }

  /**
   * Check and cleanup expired courses for a user
   * Called when user logs in or app starts with authenticated user
   */
  async checkExpiredCoursesForUser(userId) {
    try {
      logger.log('🔍 Checking expired courses for user:', userId);
      
      // This will compare user's active courses vs locally stored courses
      // and delete any courses that are no longer active
      const cleanedCount = await courseDownloadService.cleanupExpiredCourses(userId);
      
      if (cleanedCount > 0) {
        logger.log(`🧹 Cleaned up ${cleanedCount} expired courses`);
      } else {
        logger.log('✅ No expired courses found');
      }
      
      return cleanedCount;
      
    } catch (error) {
      logger.error('❌ Failed to check expired courses:', error);
      return 0;
    }
  }
  
  /**
   * Handle course purchase - trigger course download
   * @param {string} userId - User ID
   * @param {string} courseId - Course ID
   */
  async onCoursePurchased(userId, courseId) {
    try {
      logger.log('📥 Course purchased, starting background download:', courseId);
      
      // Download course content in background (non-blocking)
      // Don't await - let it download in background while user can use the app
      courseDownloadService.downloadCourse(courseId, userId).catch(error => {
        logger.error('❌ Background course download failed:', error);
        // Don't throw - course purchase should still succeed even if download fails
      });
      
      logger.log('✅ Course download started in background for:', courseId);
      
    } catch (error) {
      logger.error('❌ Error starting course download:', error);
      // Don't throw - course purchase should still succeed even if download fails
    }
  }
  
  /**
   * Handle course expiration/cancellation - cleanup course data
   * @param {string} userId - User ID
   * @param {string} courseId - Course ID
   */
  async onCourseExpired(userId, courseId) {
    try {
      logger.log('⏰ Course expired, cleaning up:', courseId);
      
      // Delete course data
      await courseDownloadService.deleteCourse(courseId);
      
      // Clean up related progress cache
      await this.cleanupCourseProgressCache(userId, courseId);
      
      logger.log('✅ Course cleanup completed for:', courseId);
      
    } catch (error) {
      logger.error('❌ Course cleanup failed:', error);
    }
  }
  
  /**
   * Start a workout session
   * @param {string} userId - User ID
   * @param {string} courseId - Course ID
   * @param {string} sessionId - Session ID from course structure
   */
  async startWorkout(userId, courseId, sessionId) {
    try {
      logger.log('🏋️ Starting workout:', { userId, courseId, sessionId });
      
      // Verify course is available locally
      const isAvailable = await courseDownloadService.isCourseAvailable(courseId);
      if (!isAvailable) {
        throw new Error('Course not available offline. Please download first.');
      }
      
      // Start session
      const session = await workoutSessionService.startSession(courseId, sessionId, userId);
      
      logger.log('✅ Workout started successfully:', session.sessionId);
      return session;
      
    } catch (error) {
      logger.error('❌ Failed to start workout:', error);
      throw error;
    }
  }
  
  /**
   * Record a completed set
   * @param {Object} setData - Set performance data
   */
  async recordSet(setData) {
    try {
      // Add set to current session (includes auto-save)
      const session = await workoutSessionService.addSetToSession(setData);
      
      logger.log(`✅ Set recorded: ${session.sets.length} total sets`);
      return session;
      
    } catch (error) {
      logger.error('❌ Failed to record set:', error);
      throw error;
    }
  }
  
  /**
   * Complete current workout session
   */
  async completeWorkout() {
    try {
      logger.log('🏁 Completing workout...');
      
      // Complete session
      const session = await workoutSessionService.completeSession();
      
      if (session) {
        // Trigger background upload
        this.triggerBackgroundUpload();
        
        logger.log('✅ Workout completed:', {
          sessionId: session.sessionId,
          sets: session.sets.length,
          duration: session.duration_minutes
        });
      }
      
      return session;
      
    } catch (error) {
      logger.error('❌ Failed to complete workout:', error);
      throw error;
    }
  }
  
  /**
   * Cancel current workout session
   */
  async cancelWorkout() {
    try {
      const session = await workoutSessionService.cancelSession();
      logger.log('❌ Workout cancelled');
      return session;
      
    } catch (error) {
      logger.error('❌ Failed to cancel workout:', error);
      throw error;
    }
  }
  
  /**
   * Get current session progress
   */
  async getCurrentProgress() {
    try {
      return await workoutSessionService.getSessionProgress();
    } catch (error) {
      logger.error('❌ Failed to get current progress:', error);
      return null;
    }
  }
  
  /**
   * Get user's course progress
   * @param {string} userId - User ID
   * @param {string} courseId - Course ID
   */
  async getCourseProgress(userId, courseId) {
    try {
      // Check cache first
      const cachedProgress = await progressQueryService.getCachedProgressData(userId, courseId);
      if (cachedProgress) {
        return cachedProgress;
      }
      
      // Query cloud data
      const progress = await progressQueryService.getUserCourseProgress(userId, courseId);
      
      // Cache result
      await progressQueryService.cacheProgressData(userId, courseId, progress);
      
      return progress;
      
    } catch (error) {
      logger.error('❌ Failed to get course progress:', error);
      return { sessions: [], analytics: null };
    }
  }
  
  /**
   * Get course progress summary
   * @param {string} userId - User ID
   * @param {string} courseId - Course ID
   */
  async getCourseProgressSummary(userId, courseId) {
    try {
      logger.log('📊 Getting course progress summary:', { courseId, userId });
      
      // Get course data
      const courseData = await this.getCourseDataForWorkout(courseId, userId);
      if (!courseData?.courseData?.modules) {
        return { totalSessions: 0, completedSessions: 0, progressPercentage: 0 };
      }
      
      // Count total sessions
      let totalSessions = 0;
      courseData.courseData.modules.forEach(module => {
        if (module.sessions) {
          totalSessions += module.sessions.length;
        }
      });
      
      // Get completed sessions
      const completedSessions = await this.getCompletedSessionsLocally(userId, courseId);
      const completedCount = completedSessions.length;
      
      // Calculate progress percentage
      const progressPercentage = totalSessions > 0 ? Math.round((completedCount / totalSessions) * 100) : 0;
      
      logger.log('📊 Progress summary:', { 
        totalSessions, 
        completedSessions: completedCount, 
        progressPercentage 
      });
      logger.log('📋 Completed sessions details:', completedSessions);
      logger.log('📚 Course modules structure:', courseData.courseData.modules.map(m => ({
        moduleId: m.id,
        moduleTitle: m.title,
        sessionsCount: m.sessions?.length || 0,
        sessionIds: m.sessions?.map(s => s.id) || []
      })));
      
      return {
        totalSessions,
        completedSessions: completedCount,
        progressPercentage,
        isCompleted: completedCount >= totalSessions
      };
      
    } catch (error) {
      logger.error('❌ Failed to get course progress summary:', error);
      return { totalSessions: 0, completedSessions: 0, progressPercentage: 0 };
    }
  }

  /**
   * Clear all progress for a specific course
   * @param {string} userId - User ID
   * @param {string} courseId - Course ID
   */
  async clearCourseProgress(userId, courseId) {
    try {
      logger.log('🔄 Clearing course progress:', { courseId, userId });
      
      // Get all keys from AsyncStorage
      const allKeys = await AsyncStorage.getAllKeys();
      
      // Filter keys that match the pattern for this course
      const courseProgressKeys = allKeys.filter(key => 
        key.startsWith(`session_completed_${userId}_${courseId}_`)
      );
      
      logger.log('📋 Found', courseProgressKeys.length, 'progress keys to remove');
      
      // Remove all progress keys for this course
      if (courseProgressKeys.length > 0) {
        await AsyncStorage.multiRemove(courseProgressKeys);
        logger.log('✅ Course progress cleared:', courseProgressKeys.length, 'sessions');
      }
      
      return true;
      
    } catch (error) {
      logger.error('❌ Failed to clear course progress:', error);
      throw error;
    }
  }

  /**
   * Get recent workout activity
   * @param {string} userId - User ID
   * @param {number} days - Days to look back
   */
  async getRecentActivity(userId, days = 7) {
    try {
      return await progressQueryService.getRecentWorkouts(userId, days);
    } catch (error) {
      logger.error('❌ Failed to get recent activity:', error);
      return [];
    }
  }
  
  /**
   * Trigger background upload (non-blocking)
   */
  triggerBackgroundUpload() {
    // Run upload in background without blocking UI
    setTimeout(async () => {
      try {
        await uploadService.processUploadQueue();
      } catch (error) {
        logger.log('Background upload will retry later:', error.message);
      }
    }, 1000); // 1 second delay to not block completion UI
  }
  
  /**
   * Get system status for debugging
   */
  async getSystemStatus() {
    try {
      const [storageUsage, queueStatus, recoveryStatus] = await Promise.all([
        storageManagementService.getStorageUsage(),
        uploadService.getUploadQueueStatus(),
        sessionRecoveryService.getRecoveryStatus()
      ]);
      
      return {
        storage: storageUsage,
        uploadQueue: queueStatus,
        recovery: recoveryStatus,
        timestamp: new Date().toISOString()
      };
      
    } catch (error) {
      logger.error('❌ Failed to get system status:', error);
      return null;
    }
  }
  
  /**
   * Perform maintenance operations
   */
  async performMaintenance() {
    try {
      logger.log('🔧 Performing system maintenance...');
      
      const results = await Promise.all([
        storageManagementService.optimizeStorage(),
        uploadService.retryFailedUploads(),
        this.cleanupExpiredCourses()
      ]);
      
      logger.log('✅ Maintenance completed:', {
        storageOptimized: results[0],
        uploadsRetried: results[1],
        coursesCleanedUp: results[2]
      });
      
      return results;
      
    } catch (error) {
      logger.error('❌ Maintenance failed:', error);
      return [0, 0, 0];
    }
  }
  
  /**
   * Clean up expired courses for user (called when courses are no longer available)
   */
  async cleanupExpiredCourses(userId) {
    try {
      if (!userId) {
        // Get current user ID from auth context if not provided
        return 0;
      }
      
      return await courseDownloadService.cleanupExpiredCourses(userId);
      
    } catch (error) {
      logger.error('❌ Failed to cleanup expired courses:', error);
      return 0;
    }
  }
  
  /**
   * Handle user course status change (called when course expires/gets cancelled)
   */
  async onUserCourseStatusChange(userId) {
    try {
      logger.log('🔄 User course status changed, cleaning up...');
      
      // This will check user's active courses vs locally stored courses
      // and delete any courses that are no longer active
      const cleanedCount = await courseDownloadService.cleanupExpiredCourses(userId);
      
      if (cleanedCount > 0) {
        logger.log(`✅ Cleaned up ${cleanedCount} expired courses`);
      }
      
      return cleanedCount;
      
    } catch (error) {
      logger.error('❌ Failed to handle course status change:', error);
      return 0;
    }
  }
  
  /**
   * Clean up course progress cache
   */
  async cleanupCourseProgressCache(userId, courseId) {
    try {
      const cacheKey = `progress_cache_${userId}_${courseId}`;
      await AsyncStorage.removeItem(cacheKey);
      logger.log('🧹 Progress cache cleaned for course:', courseId);
    } catch (error) {
      logger.error('❌ Failed to cleanup progress cache:', error);
    }
  }
  
  /**
   * Check if course is ready for workout
   * @param {string} courseId - Course ID
   */
  async isCourseReadyForWorkout(courseId) {
    try {
      return await courseDownloadService.isCourseAvailable(courseId);
    } catch (error) {
      logger.error('❌ Failed to check course availability:', error);
      return false;
    }
  }
  
  async getCourseDataForWorkout(courseId, userId = null) {
    try {
      // Fast path: try local storage first (skip version checks for speed)
      // This ensures instant load if course is already downloaded
      let courseData = await courseDownloadService.getCourseData(courseId, true);
      
      // If course not found locally, try hybrid cache (instant, no network)
      if (!courseData && userId) {
        logger.log('📥 Course not found locally, checking hybrid cache:', courseId);
        try {
          const hybridDataService = require('../services/hybridDataService').default;
          const allCourses = await hybridDataService.loadCourses();
          const hybridCourse = allCourses.find(c => c.id === courseId);
          
          if (hybridCourse) {
            logger.log('✅ Found course in hybrid cache, fetching modules...');
            // Get modules from Firestore (still needed, but at least we have course metadata)
            const modules = await firestoreService.getCourseModules(courseId);
            
            if (modules) {
              logger.log('✅ Using hybrid cache + modules for instant load');
              // Start download in background (non-blocking)
              courseDownloadService.downloadCourse(courseId, userId).catch(error => {
                logger.error('❌ Background download failed:', error);
              });
              
              return {
                courseId,
                courseData: {
                  ...hybridCourse,
                  modules
                },
                version: hybridCourse.version || '1.0',
                expiresAt: hybridCourse.expires_at || hybridCourse.expiresAt,
                imageUrl: hybridCourse.image_url || hybridCourse.imageUrl
              };
            }
          }
        } catch (error) {
          logger.error('❌ Error checking hybrid cache:', error);
        }
        
        // Last resort: Firestore (slower, but still needed if hybrid cache fails)
        logger.log('📥 Course not in hybrid cache, fetching from Firestore:', courseId);
        try {
          // Start download in background (non-blocking)
          courseDownloadService.downloadCourse(courseId, userId).catch(error => {
            logger.error('❌ Background download failed:', error);
          });
          
          // Fetch in parallel for faster response
          const [firestoreCourse, modules] = await Promise.all([
            firestoreService.getCourse(courseId),
            firestoreService.getCourseModules(courseId)
          ]);
          
          if (firestoreCourse && modules) {
            logger.log('✅ Using Firestore fallback while downloading');
            return {
              courseId,
              courseData: {
                ...firestoreCourse,
                modules
              },
              version: firestoreCourse.version || '1.0',
              expiresAt: firestoreCourse.expires_at || firestoreCourse.expiresAt,
              imageUrl: firestoreCourse.image_url || firestoreCourse.imageUrl
            };
          }
        } catch (error) {
          logger.error('❌ Failed to fetch course from Firestore:', error);
        }
      }
      
      return courseData;
    } catch (error) {
      logger.error('❌ Failed to get course data:', error);
      return null;
    }
  }

  /**
   * Get current active session
   */
  async getCurrentSession() {
    try {
      return await workoutSessionService.getCurrentSession();
    } catch (error) {
      logger.error('❌ Failed to get current session:', error);
      return null;
    }
  }

  /**
   * Complete current session
   * @param {string} userId - User ID
   * @param {string} sessionId - Session ID
   */
  async completeSession(userId, sessionId) {
    try {
      logger.log('🏁 Completing session via workoutProgressService:', { userId, sessionId });
      
      // Complete the session
      const completedSession = await workoutSessionService.completeSession();
      
      if (completedSession) {
        // Trigger background upload
        this.triggerBackgroundUpload();
        
        logger.log('✅ Session completed successfully:', completedSession.sessionId);
        return completedSession;
      } else {
        logger.log('⚠️ No active session found to complete');
        return null;
      }
    } catch (error) {
      logger.error('❌ Failed to complete session:', error);
      throw error;
    }
  }

  /**
   * Get completed session data for completion screen
   */
  async getCompletedSessionData(sessionId) {
    try {
      return await firestoreService.getProgressSession(sessionId);
    } catch (error) {
      logger.error('❌ Failed to get completed session data:', error);
      return null;
    }
  }

  /**
   * Get user's progress for a specific course
   */
  async getUserCourseProgress(userId, courseId) {
    try {
      return await firestoreService.getUserCourseProgress(userId, courseId);
    } catch (error) {
      logger.error('❌ Failed to get user course progress:', error);
      return [];
    }
  }

  /**
   * Get user's all progress
   */
  async getUserAllProgress(userId) {
    try {
      return await firestoreService.getUserAllProgress(userId);
    } catch (error) {
      logger.error('❌ Failed to get user all progress:', error);
      return [];
    }
  }

  /**
   * Get course statistics
   */
  async getCourseStatistics(courseId) {
    try {
      return await firestoreService.getCourseStatistics(courseId);
    } catch (error) {
      logger.error('❌ Failed to get course statistics:', error);
      return { sessions: [], stats: null };
    }
  }

  /**
   * Get next available session for a course based on progress (SIMPLE APPROACH)
   */
  async getNextAvailableSession(userId, courseId) {
    try {
      logger.log('🔍 Getting next available session for course:', { courseId, userId });
      
      // Get course data
      const courseData = await this.getCourseDataForWorkout(courseId, userId);
      if (!courseData?.courseData?.modules) {
        logger.log('❌ Course has no modules');
        return null;
      }
      
      // Get completed sessions from local storage (simple approach)
      const completedSessions = await this.getCompletedSessionsLocally(userId, courseId);
      logger.log('📊 Found', completedSessions.length, 'completed sessions locally');
      
      // Find the next session to do
      const nextSession = this.findNextSession(courseData.courseData.modules, completedSessions);
      
      if (!nextSession) {
        logger.log('🎉 Course completed! All sessions finished.');
        return { 
          isCourseCompleted: true,
          message: '¡Felicidades! Has completado todo el curso.'
        };
      }
      
      logger.log('✅ Next session found:', nextSession?.title || 'None');
      return nextSession;
      
    } catch (error) {
      logger.error('❌ Failed to get next available session:', error);
      return null;
    }
  }

  /**
   * Find the next session to complete based on course order and progress
   */
  findNextSession(modules, completedSessions) {
    // Create a set of completed session IDs for quick lookup
    const completedSessionIds = new Set(
      completedSessions.map(session => session.session_id)
    );
    
    logger.log('📋 Completed session IDs:', Array.from(completedSessionIds));
    
    // Go through modules in order
    for (const module of modules) {
      if (!module.sessions || module.sessions.length === 0) continue;
      
      // Go through sessions in order within each module
      for (const session of module.sessions) {
        if (!completedSessionIds.has(session.id)) {
          logger.log('🎯 Found next session:', session.title, 'in module:', module.title);
          logger.log('🔍 Session structure:', {
            id: session.id,
            title: session.title,
            hasExercises: !!session.exercises,
            exercisesLength: session.exercises?.length || 0
          });
          return {
            ...session,
            moduleId: module.id,
            moduleTitle: module.title
          };
        }
      }
    }
    
    logger.log('🏁 All sessions completed!');
    return null; // All sessions completed
  }

  /**
   * Get completed sessions from local storage (SIMPLE APPROACH)
   */
  async getCompletedSessionsLocally(userId, courseId) {
    try {
      const completedSessions = [];
      
      // Get all keys from AsyncStorage
      const allKeys = await AsyncStorage.getAllKeys();
      
      // Filter keys that match our completion pattern
      const completionKeys = allKeys.filter(key => 
        key.startsWith(`session_completed_${userId}_${courseId}_`)
      );
      
      logger.log('🔍 Looking for completion keys with pattern:', `session_completed_${userId}_${courseId}_`);
      logger.log('📋 All keys found:', allKeys.filter(key => key.includes('session_completed')));
      logger.log('📋 Matching keys for this course:', completionKeys);
      
      // Get all completion data
      for (const key of completionKeys) {
        try {
          const completionData = await AsyncStorage.getItem(key);
          if (completionData) {
            const parsed = JSON.parse(completionData);
            completedSessions.push({
              session_id: parsed.sessionId,
              completed_at: parsed.completedAt
            });
            logger.log('✅ Parsed completion data:', { key, sessionId: parsed.sessionId });
          }
        } catch (parseError) {
          logger.warn('⚠️ Failed to parse completion data for key:', key);
        }
      }
      
      logger.log('📋 Found completed sessions locally:', completedSessions.length);
      return completedSessions;
      
    } catch (error) {
      logger.error('❌ Failed to get completed sessions locally:', error);
      return [];
    }
  }

  /**
   * Mark a session as completed (called when workout is finished)
   */
  async markSessionCompleted(userId, courseId, sessionId) {
    try {
      logger.log('✅ Marking session as completed:', { userId, courseId, sessionId });
      
      // Store completion in local storage for quick access
      const completionKey = `session_completed_${userId}_${courseId}_${sessionId}`;
      await AsyncStorage.setItem(completionKey, JSON.stringify({
        userId,
        courseId,
        sessionId,
        completedAt: new Date().toISOString()
      }));
      
      logger.log('✅ Session completion marked locally');
      
    } catch (error) {
      logger.error('❌ Failed to mark session as completed:', error);
    }
  }
}

export default new WorkoutProgressService();
