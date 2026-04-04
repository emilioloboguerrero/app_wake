// Workout Progress Service - Main orchestrator for the workout progress system
import AsyncStorage from '@react-native-async-storage/async-storage';
import courseDownloadService from './courseDownloadService';
import sessionRecoveryService from './sessionRecoveryService';
import progressQueryService from './progressQueryService';
import storageManagementService from './storageManagementService';
import apiService from '../services/apiService';
import exerciseLibraryService from '../services/exerciseLibraryService';
import { getMondayWeek } from '../utils/weekCalculation';

import logger from '../utils/logger.js';
class WorkoutProgressService {
  /**
   * Initialize the workout progress system
   * Called on app startup
   */
  async initialize() {
    try {
      await sessionRecoveryService.initializeRecovery();
      await storageManagementService.optimizeStorage();
      
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
      const cleanedCount = await courseDownloadService.cleanupExpiredCourses(userId);
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
      courseDownloadService.downloadCourse(courseId, userId).catch(error => {
        logger.error('❌ Background course download failed:', error);
      });
      
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
      await courseDownloadService.deleteCourse(courseId);
      await this.cleanupCourseProgressCache(userId, courseId);
      
    } catch (error) {
      logger.error('❌ Course cleanup failed:', error);
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
      // Get all keys from AsyncStorage
      const allKeys = await AsyncStorage.getAllKeys();
      
      // Filter keys that match the pattern for this course
      const courseProgressKeys = allKeys.filter(key => 
        key.startsWith(`session_completed_${userId}_${courseId}_`)
      );
      
      if (courseProgressKeys.length > 0) {
        await AsyncStorage.multiRemove(courseProgressKeys);
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
      const cleanedCount = await courseDownloadService.cleanupExpiredCourses(userId);
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
  
  async getCourseDataForWorkout(courseId, userId = null, options = {}) {
    const { targetDate = null } = options;
    const effectiveTargetDate = targetDate ? (typeof targetDate === 'string' ? new Date(targetDate + 'T12:00:00') : new Date(targetDate)) : new Date();
    const weekKeyForTarget = targetDate ? getMondayWeek(effectiveTargetDate) : null;

    try {
      let courseData = await courseDownloadService.getCourseData(courseId, true);
      const effectiveUserId = userId;
      if (courseData?.courseData?.isOneOnOne === true && (!courseData.courseData.modules || courseData.courseData.modules.length === 0) && effectiveUserId) {
        const moduleOpts = { cacheInMemory: true, ttlMs: 5 * 60 * 1000 };
        if (weekKeyForTarget) moduleOpts.weekKey = weekKeyForTarget;
        const modules = await apiService.getCourseModules(courseId, { includeSessions: true });
        if (modules) {
          courseData = { ...courseData, courseData: { ...courseData.courseData, modules } };
        }
      }
      // For non-one-on-one programs, merge fresh modules from Firestore so creator dashboard changes (reorder, move sessions) are visible without re-downloading
      if (!courseData?.courseData?.isOneOnOne && courseData?.courseData) {
        try {
          const freshModules = await apiService.getCourseModules(courseId, { includeSessions: true });
          if (freshModules && Array.isArray(freshModules)) {
            courseData = {
              ...courseData,
              courseData: { ...courseData.courseData, modules: freshModules },
            };
          }
        } catch (e) {
          // fresh modules fetch failed, continue with cached data
        }
      }
      // One-on-one: attach planned session id for selected date (or today)
      // Use plan slot id (userId_courseId_weekKey_sessionId) when plan session so list match and sessionHistory dedupes in dashboard
      if (effectiveUserId && courseData?.courseData?.isOneOnOne === true) {
        const planned = await apiService.getPlannedSessionForDate(effectiveUserId, courseId, effectiveTargetDate);
        const plannedId = planned
          ? (planned.plan_id && planned.session_id
            ? `${effectiveUserId}_${courseId}_${getMondayWeek(planned.date_timestamp?.toDate?.() || (planned.date ? new Date(planned.date) : effectiveTargetDate))}_${planned.session_id}`
            : planned.id)
          : null;
        courseData = {
          ...courseData,
          courseData: {
            ...courseData.courseData,
            plannedSessionIdForToday: plannedId
          }
        };
      }
      if (!courseData && effectiveUserId) {
        try {
          const allCourses = await apiService.getCourses();
          const hybridCourse = allCourses.find(c => c.id === courseId);
          
          if (hybridCourse) {
            const moduleOptsHybrid = weekKeyForTarget ? { weekKey: weekKeyForTarget } : {};
            const modulesToUse = await apiService.getCourseModules(courseId, { includeSessions: true });
            const plannedHybrid = await apiService.getPlannedSessionForDate(effectiveUserId, courseId, effectiveTargetDate);
            const isOneOnOne = hybridCourse.deliveryType === 'one_on_one' || hybridCourse.isOneOnOne === true;
            const plannedIdHybrid = isOneOnOne && plannedHybrid
              ? (plannedHybrid.plan_id && plannedHybrid.session_id
                ? `${effectiveUserId}_${courseId}_${getMondayWeek(plannedHybrid.date_timestamp?.toDate?.() || (plannedHybrid.date ? new Date(plannedHybrid.date) : effectiveTargetDate))}_${plannedHybrid.session_id}`
                : plannedHybrid.id)
              : undefined;
            // sessionService reads courseData.courseData as "inner" and expects inner.modules and inner.isOneOnOne
            const innerCourseData = {
              ...(hybridCourse.courseData || hybridCourse),
              modules: modulesToUse || [],
              isOneOnOne: isOneOnOne || !!hybridCourse.isOneOnOne,
              plannedSessionIdForToday: plannedIdHybrid
            };
            const returnPayload = {
              courseId,
              courseData: { ...hybridCourse, ...innerCourseData },
              version: hybridCourse.version || '1.0',
              expiresAt: hybridCourse.expires_at || hybridCourse.expiresAt,
              imageUrl: hybridCourse.image_url || hybridCourse.imageUrl
            };
            courseDownloadService.downloadCourse(courseId, effectiveUserId).catch(error => {
              logger.error('❌ Background download failed:', error);
            });
            return returnPayload;
          }

          // Course not in hybrid (e.g. one-on-one assigned via users.courses; hybrid uses courses collection). Fetch from Firestore.
          const firestoreModuleOpts = weekKeyForTarget ? { weekKey: weekKeyForTarget } : {};
          const [firestoreCourse, modules] = await Promise.all([
            apiService.getCourse(courseId),
            apiService.getCourseModules(courseId, { includeSessions: true })
          ]);
          if (firestoreCourse) {
            courseDownloadService.downloadCourse(courseId, effectiveUserId).catch(error => {
              logger.error('❌ Background download failed:', error);
            });
            const plannedFirestore = await apiService.getPlannedSessionForDate(effectiveUserId, courseId, effectiveTargetDate);
            const isOneOnOne = firestoreCourse.deliveryType === 'one_on_one' || firestoreCourse.isOneOnOne === true;
            const modulesToUse = modules || [];
            const plannedIdFirestore = isOneOnOne && plannedFirestore
              ? (plannedFirestore.plan_id && plannedFirestore.session_id
                ? `${effectiveUserId}_${courseId}_${getMondayWeek(plannedFirestore.date_timestamp?.toDate?.() || (plannedFirestore.date ? new Date(plannedFirestore.date) : effectiveTargetDate))}_${plannedFirestore.session_id}`
                : plannedFirestore.id)
              : undefined;
            const innerCourseData = {
              ...(firestoreCourse.courseData || firestoreCourse),
              modules: modulesToUse,
              isOneOnOne: isOneOnOne || !!firestoreCourse.isOneOnOne,
              plannedSessionIdForToday: plannedIdFirestore
            };
            const returnPayload = {
              courseId,
              courseData: { ...firestoreCourse, ...innerCourseData },
              version: firestoreCourse.version || '1.0',
              expiresAt: firestoreCourse.expires_at || firestoreCourse.expiresAt,
              imageUrl: firestoreCourse.image_url || firestoreCourse.imageUrl
            };
            return returnPayload;
          }
        } catch (error) {
          logger.error('❌ Error in hybrid/Firestore path:', error);
        }
      }
      
      return courseData;
    } catch (error) {
      logger.error('❌ Failed to get course data:', error);
      return null;
    }
  }

  /**
   * Get completed session data for completion screen
   */
  async getCompletedSessionData(sessionId) {
    try {
      return await apiService.getProgressSession(sessionId);
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
      return await apiService.getUserCourseProgress(userId, courseId);
    } catch (error) {
      logger.error('❌ Failed to get user course progress:', error);
      return [];
    }
  }

  /**
   * Get next available session for a course based on progress (SIMPLE APPROACH)
   */
  async getNextAvailableSession(userId, courseId) {
    try {
      // Get course data
      const courseData = await this.getCourseDataForWorkout(courseId, userId);
      if (!courseData?.courseData?.modules) {
        return null;
      }
      
      // Get completed sessions from local storage (simple approach)
      const completedSessions = await this.getCompletedSessionsLocally(userId, courseId);
      // Find the next session to do
      const nextSession = this.findNextSession(courseData.courseData.modules, completedSessions);
      
      if (!nextSession) {
        return {
          isCourseCompleted: true,
          message: '¡Felicidades! Has completado todo el curso.'
        };
      }
      
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
    
    // Go through modules in order
    for (const module of modules) {
      if (!module.sessions || module.sessions.length === 0) continue;
      
      // Go through sessions in order within each module
      for (const session of module.sessions) {
        if (!completedSessionIds.has(session.id)) {
          return {
            ...session,
            moduleId: module.id,
            moduleTitle: module.title
          };
        }
      }
    }
    
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
          }
        } catch (parseError) {
          // Skip corrupted completion data
        }
      }
      
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
      // Store completion in local storage for quick access
      const completionKey = `session_completed_${userId}_${courseId}_${sessionId}`;
      await AsyncStorage.setItem(completionKey, JSON.stringify({
        userId,
        courseId,
        sessionId,
        completedAt: new Date().toISOString()
      }));
      
      
    } catch (error) {
      logger.error('❌ Failed to mark session as completed:', error);
    }
  }
}

export default new WorkoutProgressService();
