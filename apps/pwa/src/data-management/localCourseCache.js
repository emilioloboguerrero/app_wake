// Local Course Cache - Tracks which courses are active (IDs only, not content)
import AsyncStorage from '@react-native-async-storage/async-storage';
import appSessionManager from './appSessionManager';
import courseDownloadService from './courseDownloadService';

import logger from '../utils/logger.js';
class LocalCourseCache {
  /**
   * Get user's active courses from cache, load content from downloads
   * @param {string} userId - User ID
   */
  async getUserCoursesFromCache(userId) {
    try {
      
      const cacheKey = `active_courses_${userId}`;
      const cachedData = await AsyncStorage.getItem(cacheKey);
      
      if (!cachedData) {
        return [];
      }

      const courseCache = JSON.parse(cachedData);
      
      // Filter expired courses by checking expiration dates
      const validCourseIds = this.filterExpiredCourseIds(courseCache.activeCourses || []);
      
      if (validCourseIds.length !== (courseCache.activeCourses?.length || 0)) {
        await this.updateActiveCourseIds(userId, validCourseIds);
      }
      
      // Now load course content from downloaded courses for each active ID
      const coursesWithContent = await this.loadCourseContentForIds(validCourseIds);
      
      return coursesWithContent;
      
    } catch (error) {
      logger.error('❌ Failed to load courses from cache:', error);
      return [];
    }
  }
  
  /**
   * Update active course IDs cache from database results (only if different)
   * @param {string} userId - User ID
   * @param {Array} courses - Array of course data from database
   */
  async updateUserCourseCache(userId, courses) {
    try {
      
      // Extract just the course IDs and expiration info (minimal data)
      const newActiveCourses = courses.map(course => ({
        courseId: course.courseId,
        expires_at: course.courseData?.expires_at || course.expires_at,
        status: course.courseData?.status || course.status || 'active',
        is_trial: course.courseData?.is_trial || course.isTrialCourse || false,
        trial_expires_at: course.courseData?.trial_expires_at || course.trialInfo?.expiresAt || course.expires_at || null,
      }));
      
      // Get current cache to compare
      const cacheKey = `active_courses_${userId}`;
      const cachedData = await AsyncStorage.getItem(cacheKey);
      
      let currentActiveCourses = [];
      if (cachedData) {
        const courseCache = JSON.parse(cachedData);
        currentActiveCourses = courseCache.activeCourses || [];
      }
      
      // Compare current cache with new data
      const hasChanges = this.compareCourseArrays(currentActiveCourses, newActiveCourses);
      
      if (hasChanges) {
        await this.updateActiveCourseIds(userId, newActiveCourses);
      }
      
    } catch (error) {
      logger.error('❌ Failed to update course cache:', error);
    }
  }
  
  /**
   * Compare two course arrays to detect changes
   * @param {Array} current - Current cached courses
   * @param {Array} new - New courses from database
   */
  compareCourseArrays(current, newCourses) {
    // Different lengths = definitely different
    if (current.length !== newCourses.length) return true;
    
    // Compare each course
    for (const newCourse of newCourses) {
      const existingCourse = current.find(c => c.courseId === newCourse.courseId);
      
      if (!existingCourse) return true;
      
      // Check if critical fields changed
      if (existingCourse.expires_at !== newCourse.expires_at || 
          existingCourse.status !== newCourse.status ||
          existingCourse.is_trial !== newCourse.is_trial ||
          existingCourse.trial_expires_at !== newCourse.trial_expires_at) {
        return true;
      }
    }
    
    // Check for removed courses
    for (const currentCourse of current) {
      const stillExists = newCourses.find(c => c.courseId === currentCourse.courseId);
      if (!stillExists) {
        return true;
      }
    }
    
    return false;
  }
  
  /**
   * Update just the active course IDs (internal method)
   * @param {string} userId - User ID  
   * @param {Array} activeCourses - Array of course IDs with expiration
   */
  async updateActiveCourseIds(userId, activeCourses) {
    try {
      const cacheKey = `active_courses_${userId}`;
      const cacheData = {
        userId,
        activeCourses,
        lastUpdated: new Date().toISOString(),
        version: "2.0"
      };
      
      await AsyncStorage.setItem(cacheKey, JSON.stringify(cacheData));
      
    } catch (error) {
      logger.error('❌ Failed to update active course IDs:', error);
    }
  }
  
  /**
   * Add a new course ID to the cache (called after purchase)
   * @param {string} userId - User ID
   * @param {Object} courseData - Course data to add
   */
  async addCourseToCache(userId, courseData) {
    try {
      
      // Get current active course IDs
      const cacheKey = `active_courses_${userId}`;
      const cachedData = await AsyncStorage.getItem(cacheKey);
      
      let activeCourses = [];
      if (cachedData) {
        const courseCache = JSON.parse(cachedData);
        activeCourses = courseCache.activeCourses || [];
      }
      
      // Check if course already exists
      const existingIndex = activeCourses.findIndex(c => c.courseId === courseData.courseId);
      
      const courseInfo = {
        courseId: courseData.courseId,
        expires_at: courseData.expires_at,
        status: courseData.status || 'active',
        is_trial: courseData.is_trial || false,
        trial_expires_at: courseData.trial_expires_at || courseData.expires_at || null,
      };
      
      if (existingIndex >= 0) {
        // Update existing course
        activeCourses[existingIndex] = courseInfo;
      } else {
        activeCourses.push(courseInfo);
      }
      
      await this.updateActiveCourseIds(userId, activeCourses);
      
    } catch (error) {
      logger.error('❌ Failed to add course to cache:', error);
    }
  }
  
  /**
   * Remove a course from cache (called when course expires)
   * @param {string} userId - User ID
   * @param {string} courseId - Course ID to remove
   */
  async removeCourseFromCache(userId, courseId) {
    try {
      // Get current active course IDs
      const cacheKey = `active_courses_${userId}`;
      const cachedData = await AsyncStorage.getItem(cacheKey);
      
      if (!cachedData) {
        return false;
      }
      
      const courseCache = JSON.parse(cachedData);
      const activeCourses = courseCache.activeCourses || [];
      
      const filteredCourses = activeCourses.filter(c => c.courseId !== courseId);
      
      if (filteredCourses.length < activeCourses.length) {
        await this.updateActiveCourseIds(userId, filteredCourses);
        return true;
      } else {
        return false;
      }
      
    } catch (error) {
      logger.error('❌ Failed to remove course from cache:', error);
      return false;
    }
  }
  
  /**
   * Clear user's course cache (forces refresh from database)
   * @param {string} userId - User ID
   */
  async clearUserCourseCache(userId) {
    try {
      const cacheKey = `active_courses_${userId}`;
      await AsyncStorage.removeItem(cacheKey);
    } catch (error) {
      logger.error('❌ Failed to clear course cache:', error);
    }
  }
  
  /**
   * Force clear cache for testing (clears all cache data)
   * @param {string} userId - User ID
   */
  async forceClearCache(userId) {
    try {
      await this.clearUserCourseCache(userId);
    } catch (error) {
      logger.error('❌ Failed to force clear cache:', error);
    }
  }
  
  /**
   * Check if cache has expired (24 hours)
   * @param {Object} cacheData - Cache data object
   */
  isCacheExpired(cacheData) {
    if (!cacheData.lastUpdated) return true;
    
    const lastUpdated = new Date(cacheData.lastUpdated);
    const now = new Date();
    const hoursSinceUpdate = (now - lastUpdated) / (1000 * 60 * 60);
    
    // Cache expires after 24 hours
    return hoursSinceUpdate > 24;
  }
  
  /**
   * Filter out expired course IDs
   * @param {Array} courseIds - Array of course objects with expiration
   */
  filterExpiredCourseIds(courseIds) {
    if (!courseIds || !Array.isArray(courseIds)) return [];
    
    const now = new Date();
    
    return courseIds.filter(course => {
      if (course.is_trial) {
        if (course.trial_expires_at) {
          try {
            const trialExpiration = new Date(course.trial_expires_at);
            const trialExpired = now > trialExpiration;
            
            if (trialExpired) {
              }
          } catch (error) {
            logger.error('❌ Error parsing trial expiration for course:', course.courseId, error);
          }
        }
        return true; // Always keep trial courses in cache
      }
      
      if (!course.expires_at) {
        return true; // Keep courses without expiration date
      }
      
      try {
        const expirationDate = new Date(course.expires_at);
        const isExpired = now > expirationDate;
        
        return !isExpired;
      } catch (error) {
        logger.error('❌ Error parsing expiration date for course:', course.courseId, error);
        return true; // Keep courses with invalid dates
      }
    });
  }
  
  /**
   * Load course content for active course IDs
   * @param {Array} courseIds - Array of course objects with IDs
   */
  async loadCourseContentForIds(courseIds) {
    try {
      
      const coursesWithContent = [];
      
      for (const courseInfo of courseIds) {
        try {
          
          // Get basic course info from downloaded content
          const courseData = await courseDownloadService.getCourseData(courseInfo.courseId);
          
          if (courseData && courseData.courseData) {
            
            // Create course object for MainScreen display
            const courseForDisplay = {
              courseId: courseInfo.courseId,
              expires_at: courseInfo.expires_at,
              status: courseInfo.status,
              courseDetails: {
                id: courseInfo.courseId,
                title: courseData.courseData.title || 'Curso sin título',
                image_url: courseData.courseData.image_url || '',
                discipline: courseData.courseData.discipline || 'General',
                difficulty: courseData.courseData.difficulty || 'Intermedio',
                description: courseData.courseData.description || '',
                duration: courseData.courseData.duration || 'Variable'
              }
            };
            
            coursesWithContent.push(courseForDisplay);
          }
        } catch (error) {
          logger.error('❌ Failed to load content for course:', courseInfo.courseId, error);
        }
      }
      
      return coursesWithContent;
      
    } catch (error) {
      logger.error('❌ Failed to load course content:', error);
      return [];
    }
  }
  
  /**
   * Check if user has cached courses
   * @param {string} userId - User ID
   */
  async hasCachedCourses(userId) {
    try {
      const cacheKey = `active_courses_${userId}`;
      const cachedData = await AsyncStorage.getItem(cacheKey);
      return cachedData !== null;
    } catch (error) {
      return false;
    }
  }
  
  /**
   * Get cache status for debugging
   * @param {string} userId - User ID
   */
  async getCacheStatus(userId) {
    try {
      const cacheKey = `active_courses_${userId}`;
      const cachedData = await AsyncStorage.getItem(cacheKey);
      
      if (!cachedData) {
        return { exists: false, courses: 0, lastUpdated: null };
      }
      
      const courseCache = JSON.parse(cachedData);
      
      // Check if any courses have expired
      const validCourses = this.filterExpiredCourseIds(courseCache.activeCourses || []);
      const hasExpiredCourses = validCourses.length !== (courseCache.activeCourses?.length || 0);
      
      return {
        exists: true,
        courses: courseCache.activeCourses?.length || 0,
        validCourses: validCourses.length,
        lastUpdated: courseCache.lastUpdated,
        hasExpiredCourses
      };
    } catch (error) {
      return { exists: false, error: error.message };
    }
  }
}

export default new LocalCourseCache();
