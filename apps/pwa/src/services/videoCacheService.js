import AsyncStorage from '@react-native-async-storage/async-storage';

import logger from '../utils/logger.js';
import { isPWA, isWeb } from '../utils/platform';

const MAX_ACTIVE_PRELOADERS = 3;

class VideoCacheService {
  constructor() {
    this.cacheKey = 'video_cache';
    // Web-only: hidden <video> elements that actively buffer upcoming clips.
    // Map<url, { el: HTMLVideoElement, createdAt: number }> — insertion order
    // is the LRU axis (Map preserves insertion order).
    this.activePreloaders = new Map();
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
        const cachedUri = await this.getCachedVideoUri(videoUrl);
        return cachedUri;
      }

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
    } catch (error) {
      logger.error('❌ Error clearing cache:', error);
    }
  }

  // Preload video. On web, attaches a hidden <video preload="auto"> so the
  // browser actually starts pulling bytes into the HTTP cache. On native,
  // expo-video does its own buffering once the player mounts, so this is a
  // metadata-only marker. Idempotent and bounded by MAX_ACTIVE_PRELOADERS
  // (LRU eviction of the oldest preloader keeps memory bounded).
  async preloadVideo(videoUrl) {
    try {
      if (!videoUrl) return;
      this.markVideoAsCached(videoUrl).catch(() => {});

      if (!isWeb || typeof document === 'undefined') return;
      // iOS standalone PWA only has a single active video decoder slot.
      // Hidden preloader <video> elements compete with the visible player
      // for that slot, starving playback. Skip preloading entirely on PWA.
      if (isPWA()) return;
      // Skip non-direct sources — YouTube/Vimeo embeds don't benefit and
      // can't be preloaded with a <video> tag anyway.
      if (/youtu\.?be|vimeo\.com/i.test(videoUrl)) return;
      if (this.activePreloaders.has(videoUrl)) return;

      while (this.activePreloaders.size >= MAX_ACTIVE_PRELOADERS) {
        const oldestKey = this.activePreloaders.keys().next().value;
        this._removePreloader(oldestKey);
      }

      const el = document.createElement('video');
      el.preload = 'auto';
      el.muted = true;
      el.playsInline = true;
      el.crossOrigin = 'anonymous';
      el.style.position = 'absolute';
      el.style.width = '1px';
      el.style.height = '1px';
      el.style.opacity = '0';
      el.style.pointerEvents = 'none';
      el.style.left = '-9999px';
      el.setAttribute('aria-hidden', 'true');
      el.setAttribute('data-wake-preloader', '1');

      const onError = () => {
        // Common cause on Firebase Storage: missing CORS headers when crossOrigin is set.
        // Retry once without crossOrigin so the browser still warms its HTTP cache.
        if (el.crossOrigin) {
          el.removeEventListener('error', onError);
          el.crossOrigin = null;
          el.src = videoUrl;
          return;
        }
        this._removePreloader(videoUrl);
      };
      el.addEventListener('error', onError);
      el.src = videoUrl;
      try { el.load(); } catch (_) {}

      document.body.appendChild(el);
      this.activePreloaders.set(videoUrl, { el, createdAt: Date.now() });
    } catch (error) {
      logger.error('❌ Error preloading video:', error);
    }
  }

  _removePreloader(videoUrl) {
    const entry = this.activePreloaders.get(videoUrl);
    if (!entry) return;
    try {
      entry.el.removeAttribute('src');
      entry.el.load();
      entry.el.parentNode?.removeChild(entry.el);
    } catch (_) {}
    this.activePreloaders.delete(videoUrl);
  }
}

// Export singleton instance
export default new VideoCacheService();
