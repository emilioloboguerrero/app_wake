import AsyncStorage from '@react-native-async-storage/async-storage';

import logger from '../utils/logger.js';
class VideoCacheService {
  constructor() {
    this.cacheKey = 'video_cache';
  }

  // Generate cache key from video URL
  getCacheKey(videoUrl) {
    if (!videoUrl) return null;
    // Create a simple hash-like key from URL
    return videoUrl.split('/').pop().split('?')[0] || 'video_' + Date.now();
  }

  // Check if video is cached (just metadata, not actual file)
  async isVideoCached(videoUrl) {
    try {
      const cacheKey = this.getCacheKey(videoUrl);
      if (!cacheKey) return false;

      const cacheData = await this.getCacheData();
      return cacheData[cacheKey] !== undefined;
    } catch (error) {
      logger.error('❌ Error checking video cache:', error);
      return false;
    }
  }

  // Get cached video URI (returns original URL if cached)
  async getCachedVideoUri(videoUrl) {
    try {
      const cacheKey = this.getCacheKey(videoUrl);
      if (!cacheKey) return null;

      const cacheData = await this.getCacheData();
      
      if (cacheData[cacheKey]) {
        // Update last accessed time
        cacheData[cacheKey].lastAccessed = Date.now();
        await AsyncStorage.setItem(this.cacheKey, JSON.stringify(cacheData));
        
        // Return original URL (browser/player will handle caching)
        return videoUrl;
      }
      
      return null;
    } catch (error) {
      logger.error('❌ Error getting cached video URI:', error);
      return null;
    }
  }

  // Mark video as cached (just metadata)
  async markVideoAsCached(videoUrl) {
    try {
      const cacheKey = this.getCacheKey(videoUrl);
      if (!cacheKey) return;

      const cacheData = await this.getCacheData();
      
      cacheData[cacheKey] = {
        url: videoUrl,
        cachedAt: Date.now(),
        lastAccessed: Date.now()
      };

      await AsyncStorage.setItem(this.cacheKey, JSON.stringify(cacheData));
      logger.log('✅ Video marked as cached:', cacheKey);
    } catch (error) {
      logger.error('❌ Error marking video as cached:', error);
    }
  }

  // Get cache metadata
  async getCacheData() {
    try {
      const data = await AsyncStorage.getItem(this.cacheKey);
      return data ? JSON.parse(data) : {};
    } catch (error) {
      logger.error('❌ Error getting cache data:', error);
      return {};
    }
  }

  // Get video URI (simple implementation)
  async getVideoUri(videoUrl) {
    try {
      if (!videoUrl) return null;

      // Check if video is already cached
      const isCached = await this.isVideoCached(videoUrl);
      
      if (isCached) {
        logger.log('📱 Using cached video metadata');
        const cachedUri = await this.getCachedVideoUri(videoUrl);
        return cachedUri;
      }

      // Mark as cached and return original URL
      logger.log('📥 Marking video as cached for future reference');
      await this.markVideoAsCached(videoUrl);
      
      return videoUrl;
    } catch (error) {
      logger.error('❌ Error getting video URI:', error);
      // Fallback to original URL if caching fails
      return videoUrl;
    }
  }

  // Get cache statistics
  async getCacheStats() {
    try {
      const cacheData = await this.getCacheData();
      const fileCount = Object.keys(cacheData).length;

      return {
        fileCount,
        totalSize: 0,
        totalSizeMB: 0,
        maxSizeMB: 0,
        maxAgeDays: 0
      };
    } catch (error) {
      logger.error('❌ Error getting cache stats:', error);
      return { fileCount: 0, totalSize: 0, totalSizeMB: 0 };
    }
  }

  // Clear all cache
  async clearAllCache() {
    try {
      await AsyncStorage.removeItem(this.cacheKey);
      logger.log('🗑️ All cache cleared');
    } catch (error) {
      logger.error('❌ Error clearing cache:', error);
    }
  }

  // Preload video (mark as cached for future reference)
  async preloadVideo(videoUrl) {
    try {
      if (!videoUrl) return;
      
      logger.log('📥 Preloading video:', videoUrl);
      
      // Mark video as cached (metadata only)
      await this.markVideoAsCached(videoUrl);
      
      logger.log('✅ Video preloaded:', videoUrl);
    } catch (error) {
      logger.error('❌ Error preloading video:', error);
      // Don't throw - preloading is non-critical
    }
  }
}

// Export singleton instance
export default new VideoCacheService();
