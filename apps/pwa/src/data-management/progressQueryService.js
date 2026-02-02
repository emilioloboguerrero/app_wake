// Progress Query Service - Updated to use new data structure
import AsyncStorage from '@react-native-async-storage/async-storage';
import { collection, query, where, orderBy, limit, getDocs } from 'firebase/firestore';
import { firestore } from '../config/firebase';
import firestoreService from '../services/firestoreService';
import userProgressService from '../services/userProgressService';
import exerciseHistoryService from '../services/exerciseHistoryService';

import logger from '../utils/logger.js';
class ProgressQueryService {
  /**
   * Get user's progress for a specific course
   * @param {string} userId - User ID
   * @param {string} courseId - Course ID
   */
  async getUserCourseProgress(userId, courseId) {
    try {
      logger.log('📊 Getting course progress:', { userId, courseId });
      
      // Get course progress from user document
      const progressData = await userProgressService.getCourseProgress(userId, courseId);
      
      if (!progressData) {
        logger.log('📊 No course progress found');
        return {
          sessions: [],
          analytics: this.calculateProgressAnalytics([]),
          lastUpdated: new Date().toISOString()
        };
      }
      
      // Get session history for completed sessions
      const sessions = [];
      if (progressData.allSessionsCompleted) {
        for (const sessionId of progressData.allSessionsCompleted) {
          const sessionData = await exerciseHistoryService.getSessionHistory(userId, sessionId);
          if (sessionData) {
            sessions.push({
              id: sessionId,
              ...sessionData
            });
          }
        }
      }
      
      // Calculate progress analytics
      const progressAnalytics = this.calculateProgressAnalytics(sessions);
      
      logger.log(`✅ Retrieved ${sessions.length} sessions for course progress`);
      
      return {
        sessions,
        analytics: progressAnalytics,
        lastUpdated: new Date().toISOString()
      };
      
    } catch (error) {
      logger.error('❌ Failed to get course progress:', error);
      return { sessions: [], analytics: null };
    }
  }
  
  /**
   * Get recent workouts across all courses
   * @param {string} userId - User ID
   * @param {number} days - Number of days to look back
   */
  async getRecentWorkouts(userId, days = 7) {
    try {
      logger.log('📅 Getting recent workouts:', { userId, days });
      
      // Get all course progress for user
      const allCourseProgress = await userProgressService.getAllCourseProgress(userId);
      
      // Get recent sessions from all courses
      const allSessions = [];
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);
      
      for (const [courseId, courseProgress] of Object.entries(allCourseProgress)) {
        if (courseProgress.allSessionsCompleted) {
          for (const sessionId of courseProgress.allSessionsCompleted) {
            const sessionData = await exerciseHistoryService.getSessionHistory(userId, sessionId);
            if (sessionData && new Date(sessionData.completedAt) >= cutoffDate) {
              allSessions.push({
                id: sessionId,
                courseId: courseId,
                ...sessionData
              });
            }
          }
        }
      }
      
      // Sort all sessions by date
      allSessions.sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt));
      
      logger.log(`✅ Retrieved ${allSessions.length} recent sessions`);
      return allSessions;
      
    } catch (error) {
      logger.error('❌ Failed to get recent workouts:', error);
      return [];
    }
  }
  
  /**
   * Get exercise progress history
   * @param {string} userId - User ID
   * @param {string} exerciseId - Exercise ID
   * @param {string} courseId - Course ID (optional, for performance)
   */
  async getExerciseProgressHistory(userId, exerciseId, courseId = null) {
    try {
      logger.log('💪 Getting exercise progress:', { userId, exerciseId, courseId });
      
      // Get exercise history from subcollection
      const exerciseHistory = await exerciseHistoryService.getExerciseHistory(userId, exerciseId);
      
      logger.log(`✅ Retrieved exercise history: ${exerciseHistory.sessions.length} sessions`);
      return exerciseHistory.sessions;
      
    } catch (error) {
      logger.error('❌ Failed to get exercise progress:', error);
      return [];
    }
  }
  
  /**
   * Calculate progress analytics from session data
   */
  calculateProgressAnalytics(sessions) {
    if (!sessions || sessions.length === 0) {
      return null;
    }
    
    // Basic session analytics
    const totalSessions = sessions.length;
    const totalSets = sessions.reduce((sum, session) => sum + (session.total_sets || 0), 0);
    const totalVolume = sessions.reduce((sum, session) => sum + (session.total_volume_kg || 0), 0);
    
    // Calculate average duration
    const sessionsWithDuration = sessions.filter(s => s.duration_minutes > 0);
    const averageDuration = sessionsWithDuration.length > 0
      ? sessionsWithDuration.reduce((sum, s) => sum + s.duration_minutes, 0) / sessionsWithDuration.length
      : 0;
    
    // Calculate workout frequency (sessions per week)
    const dateRange = this.getDateRange(sessions);
    const weeksBetween = dateRange.days / 7;
    const workoutFrequency = weeksBetween > 0 ? totalSessions / weeksBetween : 0;
    
    // Recent vs older performance comparison
    const recentSessions = sessions.slice(0, Math.min(5, sessions.length));
    const olderSessions = sessions.slice(5, Math.min(10, sessions.length));
    
    const recentAvgVolume = this.calculateAverageVolume(recentSessions);
    const olderAvgVolume = this.calculateAverageVolume(olderSessions);
    const volumeTrend = this.calculateTrend(recentAvgVolume, olderAvgVolume);
    
    return {
      totalSessions,
      totalSets,
      totalVolume_kg: Math.round(totalVolume),
      averageDuration_minutes: Math.round(averageDuration),
      workoutFrequency_per_week: Math.round(workoutFrequency * 10) / 10,
      dateRange,
      trends: {
        volume: volumeTrend,
        frequency: this.calculateFrequencyTrend(sessions)
      },
      lastWorkout: sessions[0]?.workout_date || null,
      consistency: this.calculateConsistency(sessions)
    };
  }
  
  /**
   * Get user's active course IDs
   */
  async getUserActiveCourseIds(userId) {
    try {
      const userDoc = await firestoreService.getUser(userId);
      return userDoc?.courses ? Object.keys(userDoc.courses) : [];
    } catch (error) {
      logger.error('Failed to get user active courses:', error);
      return [];
    }
  }
  
  /**
   * Calculate date range from sessions
   */
  getDateRange(sessions) {
    if (sessions.length === 0) return { days: 0, start: null, end: null };
    
    const dates = sessions.map(s => new Date(s.workout_date)).sort((a, b) => a - b);
    const start = dates[0];
    const end = dates[dates.length - 1];
    const days = Math.ceil((end - start) / (1000 * 60 * 60 * 24));
    
    return {
      days: Math.max(days, 1),
      start: start.toISOString().split('T')[0],
      end: end.toISOString().split('T')[0]
    };
  }
  
  /**
   * Calculate average volume for sessions
   */
  calculateAverageVolume(sessions) {
    if (sessions.length === 0) return 0;
    
    const totalVolume = sessions.reduce((sum, s) => sum + (s.total_volume_kg || 0), 0);
    return totalVolume / sessions.length;
  }
  
  /**
   * Calculate trend between two values
   */
  calculateTrend(recent, older) {
    if (older === 0) return 'stable';
    
    const change = ((recent - older) / older) * 100;
    
    if (change > 10) return 'increasing';
    if (change < -10) return 'decreasing';
    return 'stable';
  }
  
  /**
   * Calculate frequency trend
   */
  calculateFrequencyTrend(sessions) {
    if (sessions.length < 4) return 'stable';
    
    const recentWeek = sessions.slice(0, Math.min(7, sessions.length));
    const previousWeek = sessions.slice(7, Math.min(14, sessions.length));
    
    const recentFreq = recentWeek.length;
    const previousFreq = previousWeek.length;
    
    return this.calculateTrend(recentFreq, previousFreq);
  }
  
  /**
   * Calculate workout consistency score
   */
  calculateConsistency(sessions) {
    if (sessions.length < 3) return 0;
    
    // Calculate gaps between workouts
    const dates = sessions.map(s => new Date(s.workout_date)).sort((a, b) => a - b);
    const gaps = [];
    
    for (let i = 1; i < dates.length; i++) {
      const gapDays = (dates[i] - dates[i-1]) / (1000 * 60 * 60 * 24);
      gaps.push(gapDays);
    }
    
    // Consistency = inverse of gap variance (lower variance = higher consistency)
    const avgGap = gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length;
    const variance = gaps.reduce((sum, gap) => sum + Math.pow(gap - avgGap, 2), 0) / gaps.length;
    
    // Convert to 0-100 score (lower variance = higher score)
    const consistencyScore = Math.max(0, 100 - variance * 2);
    return Math.round(consistencyScore);
  }
  
  /**
   * Cache progress data locally for fast access
   */
  async cacheProgressData(userId, courseId, progressData) {
    try {
      const cacheKey = `progress_cache_${userId}_${courseId}`;
      const cacheData = {
        ...progressData,
        cachedAt: new Date().toISOString()
      };
      
      await AsyncStorage.setItem(cacheKey, JSON.stringify(cacheData));
      logger.log('💾 Progress data cached locally');
      
    } catch (error) {
      logger.error('❌ Failed to cache progress data:', error);
    }
  }
  
  /**
   * Get cached progress data
   */
  async getCachedProgressData(userId, courseId, maxAgeMinutes = 30) {
    try {
      const cacheKey = `progress_cache_${userId}_${courseId}`;
      const cachedData = await AsyncStorage.getItem(cacheKey);
      
      if (!cachedData) return null;
      
      const cache = JSON.parse(cachedData);
      const cacheAge = Date.now() - new Date(cache.cachedAt).getTime();
      const maxAgeMs = maxAgeMinutes * 60 * 1000;
      
      if (cacheAge > maxAgeMs) {
        logger.log('⏰ Progress cache expired');
        return null;
      }
      
      logger.log('⚡ Using cached progress data');
      return cache;
      
    } catch (error) {
      logger.error('❌ Failed to get cached progress:', error);
      return null;
    }
  }
}

export default new ProgressQueryService();
