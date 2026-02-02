// Storage Management Service - Handles device storage optimization and cleanup
import AsyncStorage from '@react-native-async-storage/async-storage';

import logger from '../utils/logger.js';
class StorageManagementService {
  /**
   * Get comprehensive storage usage information
   */
  async getStorageUsage() {
    try {
      logger.log('📊 Analyzing storage usage...');
      
      const allKeys = await AsyncStorage.getAllKeys();
      
      // Categorize storage keys
      const storageBreakdown = {
        courses: [],
        activeSessions: [],
        pendingSessions: [],
        backupSessions: [],
        progressCache: [],
        other: [],
        total_keys: allKeys.length
      };
      
      let totalSize = 0;
      
      for (const key of allKeys) {
        try {
          const data = await AsyncStorage.getItem(key);
          const size = data ? new Blob([data]).size : 0;
          totalSize += size;
          
          const item = { key, size_bytes: size, size_kb: Math.round(size / 1024) };
          
          if (key.startsWith('course_')) {
            storageBreakdown.courses.push(item);
          } else if (key === 'active_session') {
            storageBreakdown.activeSessions.push(item);
          } else if (key.startsWith('pending_session_')) {
            storageBreakdown.pendingSessions.push(item);
          } else if (key.startsWith('session_backup_')) {
            storageBreakdown.backupSessions.push(item);
          } else if (key.startsWith('progress_cache_')) {
            storageBreakdown.progressCache.push(item);
          } else {
            storageBreakdown.other.push(item);
          }
          
        } catch (error) {
          logger.warn('⚠️ Failed to analyze key:', key);
        }
      }
      
      const summary = {
        total_size_mb: Math.round(totalSize / (1024 * 1024) * 100) / 100,
        breakdown: {
          courses_mb: Math.round(this.sumSizes(storageBreakdown.courses) / (1024 * 1024) * 100) / 100,
          sessions_mb: Math.round(this.sumSizes(storageBreakdown.pendingSessions) / (1024 * 1024) * 100) / 100,
          cache_mb: Math.round(this.sumSizes(storageBreakdown.progressCache) / (1024 * 1024) * 100) / 100,
          other_mb: Math.round(this.sumSizes(storageBreakdown.other) / (1024 * 1024) * 100) / 100
        },
        details: storageBreakdown
      };
      
      logger.log('✅ Storage analysis completed:', summary);
      return summary;
      
    } catch (error) {
      logger.error('❌ Storage analysis failed:', error);
      return { total_size_mb: 0, breakdown: {}, details: {} };
    }
  }
  
  /**
   * Clean up old session data
   * @param {number} olderThanDays - Remove sessions older than this many days
   */
  async cleanupOldSessions(olderThanDays = 30) {
    try {
      logger.log(`🧹 Cleaning up sessions older than ${olderThanDays} days...`);
      
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);
      
      const allKeys = await AsyncStorage.getAllKeys();
      const sessionKeys = allKeys.filter(key => 
        key.startsWith('pending_session_') || 
        key.startsWith('session_backup_')
      );
      
      let cleanedCount = 0;
      
      for (const key of sessionKeys) {
        try {
          const data = await AsyncStorage.getItem(key);
          if (data) {
            const sessionData = JSON.parse(data);
            const sessionDate = new Date(sessionData.lastSaved || sessionData.completedAt);
            
            if (sessionDate < cutoffDate) {
              await AsyncStorage.removeItem(key);
              cleanedCount++;
              logger.log(`🗑️ Removed old session: ${key}`);
            }
          }
        } catch (error) {
          // Remove corrupted session data
          await AsyncStorage.removeItem(key);
          cleanedCount++;
          logger.log(`🗑️ Removed corrupted session: ${key}`);
        }
      }
      
      logger.log(`✅ Cleanup completed: ${cleanedCount} sessions removed`);
      return cleanedCount;
      
    } catch (error) {
      logger.error('❌ Session cleanup failed:', error);
      return 0;
    }
  }
  
  /**
   * Remove failed upload sessions
   */
  async removeFailedSessions() {
    try {
      logger.log('🧹 Cleaning up failed upload sessions...');
      
      // Get upload queue
      const queueData = await AsyncStorage.getItem('upload_queue');
      if (!queueData) return 0;
      
      const queue = JSON.parse(queueData);
      const failedSessions = queue.sessions.filter(s => s.status === 'failed');
      
      let removedCount = 0;
      
      for (const sessionInfo of failedSessions) {
        // Remove session data
        await AsyncStorage.removeItem(`pending_session_${sessionInfo.sessionId}`);
        removedCount++;
      }
      
      // Update queue (remove failed sessions)
      queue.sessions = queue.sessions.filter(s => s.status !== 'failed');
      await AsyncStorage.setItem('upload_queue', JSON.stringify(queue));
      
      logger.log(`✅ Removed ${removedCount} failed sessions`);
      return removedCount;
      
    } catch (error) {
      logger.error('❌ Failed session cleanup failed:', error);
      return 0;
    }
  }
  
  /**
   * Clear progress cache data
   */
  async clearCacheData() {
    try {
      logger.log('🧹 Clearing progress cache...');
      
      const allKeys = await AsyncStorage.getAllKeys();
      const cacheKeys = allKeys.filter(key => key.startsWith('progress_cache_'));
      
      await AsyncStorage.multiRemove(cacheKeys);
      
      logger.log(`✅ Cleared ${cacheKeys.length} cache entries`);
      return cacheKeys.length;
      
    } catch (error) {
      logger.error('❌ Cache cleanup failed:', error);
      return 0;
    }
  }
  
  /**
   * Optimize storage by compressing old data
   */
  async optimizeStorage() {
    try {
      logger.log('⚡ Optimizing storage...');
      
      const usage = await this.getStorageUsage();
      
      // If storage usage is high, perform cleanup
      if (usage.total_size_mb > 100) {
        logger.log('⚠️ High storage usage detected, performing cleanup...');
        
        const results = await Promise.all([
          this.cleanupOldSessions(30),
          this.removeFailedSessions(),
          this.clearCacheData()
        ]);
        
        const totalCleaned = results.reduce((sum, count) => sum + count, 0);
        logger.log(`✅ Storage optimization completed: ${totalCleaned} items cleaned`);
        
        return totalCleaned;
      }
      
      logger.log('ℹ️ Storage usage within limits, no optimization needed');
      return 0;
      
    } catch (error) {
      logger.error('❌ Storage optimization failed:', error);
      return 0;
    }
  }
  
  /**
   * Get free space estimation (approximate)
   */
  async getFreeSpace() {
    try {
      // This is an approximation - actual free space detection would require native modules
      const usage = await this.getStorageUsage();
      const estimatedDeviceStorage = 2000; // Assume 2GB available for app data
      const freeSpace = estimatedDeviceStorage - usage.total_size_mb;
      
      return {
        estimated_free_mb: Math.max(0, freeSpace),
        app_usage_mb: usage.total_size_mb,
        storage_percentage: (usage.total_size_mb / estimatedDeviceStorage) * 100
      };
      
    } catch (error) {
      logger.error('❌ Failed to estimate free space:', error);
      return { estimated_free_mb: 0, app_usage_mb: 0, storage_percentage: 0 };
    }
  }
  
  /**
   * Remove unused courses (not in user's active courses)
   */
  async removeUnusedCourses(userId) {
    try {
      logger.log('🧹 Removing unused courses...');
      
      // Get user's active courses  
      const firestoreService = require('../services/firestoreService').default;
      const userDoc = await firestoreService.getUser(userId);
      const activeCourseIds = userDoc?.courses ? Object.keys(userDoc.courses) : [];
      
      // Get locally stored courses
      const allKeys = await AsyncStorage.getAllKeys();
      const courseKeys = allKeys.filter(key => key.startsWith('course_'));
      
      let removedCount = 0;
      
      for (const key of courseKeys) {
        const courseId = key.replace('course_', '');
        
        if (!activeCourseIds.includes(courseId)) {
          await AsyncStorage.removeItem(key);
          removedCount++;
          logger.log(`🗑️ Removed unused course: ${courseId}`);
        }
      }
      
      logger.log(`✅ Removed ${removedCount} unused courses`);
      return removedCount;
      
    } catch (error) {
      logger.error('❌ Failed to remove unused courses:', error);
      return 0;
    }
  }
  
  /**
   * Helper method to sum sizes from storage items
   */
  sumSizes(items) {
    return items.reduce((sum, item) => sum + item.size_bytes, 0);
  }
  
  /**
   * Report storage issues if any
   */
  async reportStorageIssues() {
    try {
      const usage = await this.getStorageUsage();
      const freeSpace = await this.getFreeSpace();
      
      const issues = [];
      
      // Check for high storage usage
      if (usage.total_size_mb > 150) {
        issues.push({
          type: 'high_usage',
          message: `High storage usage: ${usage.total_size_mb}MB`,
          severity: 'warning'
        });
      }
      
      // Check for low free space
      if (freeSpace.estimated_free_mb < 100) {
        issues.push({
          type: 'low_space',
          message: `Low free space: ${freeSpace.estimated_free_mb}MB`,
          severity: 'error'
        });
      }
      
      // Check for many pending sessions
      const queueData = await AsyncStorage.getItem('upload_queue');
      if (queueData) {
        const queue = JSON.parse(queueData);
        if (queue.sessions.length > 10) {
          issues.push({
            type: 'upload_backlog',
            message: `Many pending uploads: ${queue.sessions.length}`,
            severity: 'warning'
          });
        }
      }
      
      return issues;
      
    } catch (error) {
      logger.error('❌ Failed to report storage issues:', error);
      return [];
    }
  }
}

export default new StorageManagementService();
