// Simple Course Cache - Minimal database reads, maximum cache usage
import AsyncStorage from '@react-native-async-storage/async-storage';

import logger from '../utils/logger.js';
class SimpleCourseCache {
  /**
   * Get courses - always from cache unless cache is empty
   */
  async getUserCourses(userId) {
    try {
      logger.log('📖 Loading courses from cache...');
      
      const cacheKey = `user_courses_${userId}`;
      const cachedData = await AsyncStorage.getItem(cacheKey);
      
      if (!cachedData) {
        logger.log('❌ No cache found - needs initial population');
        return null; // Signal that cache needs to be populated
      }
      
      const courseData = JSON.parse(cachedData);
      logger.log(`✅ Loaded ${courseData.courses.length} courses from cache`);
      
      return courseData.courses;
      
    } catch (error) {
      logger.error('❌ Error loading from cache:', error);
      return null;
    }
  }
  
  /**
   * Update cache with fresh data from database
   */
  async updateCache(userId, courses) {
    try {
      logger.log('💾 Updating cache with', courses.length, 'courses...');
      
      const cacheData = {
        userId,
        courses,
        lastUpdated: new Date().toISOString(),
        version: "3.0"
      };
      
      const cacheKey = `user_courses_${userId}`;
      await AsyncStorage.setItem(cacheKey, JSON.stringify(cacheData));
      
      logger.log('✅ Cache updated successfully');
      
    } catch (error) {
      logger.error('❌ Failed to update cache:', error);
    }
  }
  
  /**
   * Add a single course to cache (after purchase)
   */
  async addCourseToCache(userId, courseData) {
    try {
      logger.log('➕ Adding course to cache:', courseData.courseId);
      
      const currentCourses = await this.getUserCourses(userId) || [];
      
      // Remove if already exists, then add
      const filteredCourses = currentCourses.filter(c => c.courseId !== courseData.courseId);
      filteredCourses.push(courseData);
      
      await this.updateCache(userId, filteredCourses);
      
    } catch (error) {
      logger.error('❌ Failed to add course to cache:', error);
    }
  }
  
  /**
   * Remove course from cache (when expired)
   */
  async removeCourseFromCache(userId, courseId) {
    try {
      logger.log('➖ Removing course from cache:', courseId);
      
      const currentCourses = await this.getUserCourses(userId) || [];
      const filteredCourses = currentCourses.filter(c => c.courseId !== courseId);
      
      if (filteredCourses.length < currentCourses.length) {
        await this.updateCache(userId, filteredCourses);
        logger.log('✅ Course removed from cache');
        return true;
      }
      
      return false;
      
    } catch (error) {
      logger.error('❌ Failed to remove course from cache:', error);
      return false;
    }
  }
  
  /**
   * Clear cache (for testing)
   */
  async clearCache(userId) {
    try {
      const cacheKey = `user_courses_${userId}`;
      await AsyncStorage.removeItem(cacheKey);
      logger.log('🧹 Cache cleared');
    } catch (error) {
      logger.error('❌ Failed to clear cache:', error);
    }
  }
  
  /**
   * Get cache info for debugging
   */
  async getCacheInfo(userId) {
    try {
      const cacheKey = `user_courses_${userId}`;
      const cachedData = await AsyncStorage.getItem(cacheKey);
      
      if (!cachedData) {
        return { exists: false, courses: 0 };
      }
      
      const courseData = JSON.parse(cachedData);
      
      return {
        exists: true,
        courses: courseData.courses?.length || 0,
        lastUpdated: courseData.lastUpdated
      };
    } catch (error) {
      return { exists: false, error: error.message };
    }
  }
}

export default new SimpleCourseCache();
