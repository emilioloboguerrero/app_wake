// Hybrid Data Service - Cache-first loading with selective cloud sync
// Use storage adapter for platform-agnostic storage
import storageAdapter from '../utils/storageAdapter';
const AsyncStorage = storageAdapter; // Use adapter instead of direct import
import firestoreService from './firestoreService';
import userProgressService from './userProgressService';
import logger from '../utils/logger.js';

class HybridDataService {
  // Storage keys for our hybrid system
  STORAGE_KEYS = {
    USER_PROFILE: 'user_profile_v2',
    COURSES: 'courses_data_v2', 
    USER_PROGRESS: 'user_progress_v2',
    LAST_SYNC: 'last_sync_timestamp_v2'
  };

  // TTL settings (24 hours in milliseconds)
  TTL = {
    USER_PROFILE: 24 * 60 * 60 * 1000,
    COURSES: 24 * 60 * 60 * 1000,
    USER_PROGRESS: 24 * 60 * 60 * 1000
  };

  // Debug mode - set to true to see detailed logs
  DEBUG_MODE = true;

  /**
   * Debug logging helper
   */
  debugLog(message, data = null) {
    if (this.DEBUG_MODE) {
      logger.debug(`🔍 [HYBRID DEBUG] ${message}`, data || '');
    }
  }

  /**
   * Check if cached data is stale
   */
  isStale(cachedData, ttl) {
    if (!cachedData) return true;
    const lastSync = cachedData.lastSync;
    if (!lastSync) return true;
    const now = Date.now();
    return (now - lastSync) > ttl;
  }

  /**
   * Load user profile with cache-first approach
   */
  async loadUserProfile(userId) {
    try {
      this.debugLog(`🔄 Loading user profile for: ${userId}`);
      
      // 1. Load from cache instantly
      const cached = await AsyncStorage.getItem(this.STORAGE_KEYS.USER_PROFILE);
      let userProfile = null;
      
      if (cached) {
        const cacheData = JSON.parse(cached);
        userProfile = cacheData.data;
        this.debugLog('📱 User profile loaded from cache', { 
          hasData: !!userProfile, 
          lastSync: new Date(cacheData.lastSync).toLocaleString(),
          isStale: this.isStale(cacheData, this.TTL.USER_PROFILE)
        });
        
        // 2. Check if stale
        if (!this.isStale(cacheData, this.TTL.USER_PROFILE)) {
          this.debugLog('✅ Cache is fresh, returning cached data - NO DB READ');
          return userProfile;
        }
        this.debugLog('⏰ Cache is stale, will sync in background');
      } else {
        this.debugLog('❌ No cache found, will sync in background');
      }
      
      // 3. Background sync if stale or no cache
      this.syncUserProfile(userId, userProfile);
      
      return userProfile;
      
    } catch (error) {
      logger.error('❌ Error loading user profile:', error);
      return null;
    }
  }

  /**
   * Sync user profile from Firestore (background)
   */
  async syncUserProfile(userId, currentProfile = null) {
    try {
      this.debugLog('☁️ Syncing user profile from Firestore - DB READ');
      
      const userData = await firestoreService.getUser(userId);
      if (!userData) {
        this.debugLog('❌ No user data found in Firestore');
        return;
      }
      
      const profileData = {
        displayName: userData?.displayName || userData?.display_name || '',
        username: userData?.username || '',
        email: userData?.email || '',
        phoneNumber: userData?.phoneNumber || '',
        gender: userData?.gender || '',
        interests: userData?.interests || [],
        lastSync: Date.now()
      };
      
      // Update cache
      await AsyncStorage.setItem(
        this.STORAGE_KEYS.USER_PROFILE, 
        JSON.stringify({ data: profileData, lastSync: Date.now() })
      );
      
      this.debugLog('✅ User profile synced and cached');
      
    } catch (error) {
      logger.error('❌ Error syncing user profile:', error);
    }
  }

  /**
   * Update user profile with optimistic updates
   */
  async updateUserProfile(userId, changes) {
    try {
      logger.debug('🔄 Updating user profile:', changes);
      
      // 1. Get current profile
      let currentProfile = await this.loadUserProfile(userId);
      
      // 2. If no profile exists, create a new one (for new users)
      if (!currentProfile) {
        logger.debug('📝 No existing profile found, creating new profile for user:', userId);
        currentProfile = {
          id: userId,
          createdAt: new Date().toISOString(),
          ...changes
        };
      } else {
        // Merge with existing profile
        currentProfile = { ...currentProfile, ...changes };
      }
      
      // 3. Update cache immediately
      await AsyncStorage.setItem(
        this.STORAGE_KEYS.USER_PROFILE,
        JSON.stringify({ data: currentProfile, lastSync: Date.now() })
      );
      
      // 4. Update Firestore
      await firestoreService.updateUser(userId, changes);
      
      logger.debug('✅ User profile updated successfully');
      return currentProfile;
      
    } catch (error) {
      logger.error('❌ Error updating user profile:', error);
      throw error;
    }
  }

  /**
   * Load courses with cache-first approach (role-based)
   */
  async loadCourses(userId = null) {
    try {
      this.debugLog('🔄 Loading courses for user:', userId);
      
      // 1. Load from cache instantly
      const cached = await AsyncStorage.getItem(this.STORAGE_KEYS.COURSES);
      let courses = [];
      
      if (cached) {
        const cacheData = JSON.parse(cached);
        courses = cacheData.data || [];
        this.debugLog('📱 Courses loaded from cache', { 
          count: courses.length,
          lastSync: new Date(cacheData.lastSync).toLocaleString(),
          isStale: this.isStale(cacheData, this.TTL.COURSES)
        });
        
        // 2. Simple validation: check if courses array is valid
        if (Array.isArray(courses) && courses.length > 0) {
          // 3. Check if stale
          if (!this.isStale(cacheData, this.TTL.COURSES)) {
            this.debugLog('✅ Cache is fresh, returning cached data - NO DB READ');
            return courses;
          }
          this.debugLog('⏰ Cache is stale, will sync in background');
        } else {
          this.debugLog('⚠️ Cache data is invalid, will sync immediately');
          courses = [];
        }
      } else {
        this.debugLog('❌ No cache found, will sync in background');
      }
      
      // 3. Background sync if stale or no cache
      this.syncCourses(userId, courses);
      
      return courses;
      
    } catch (error) {
      logger.error('❌ Error loading courses:', error);
      return [];
    }
  }

  /**
   * Sync courses from Firestore (background, role-based)
   */
  async syncCourses(userId = null, currentCourses = []) {
    try {
      this.debugLog('☁️ Syncing courses from Firestore - DB READ');
      
      const coursesData = await firestoreService.getCourses(userId);
      
      // Update cache
      await AsyncStorage.setItem(
        this.STORAGE_KEYS.COURSES,
        JSON.stringify({ data: coursesData, lastSync: Date.now() })
      );
      
      this.debugLog('✅ Courses synced and cached', { count: coursesData.length });
      
    } catch (error) {
      logger.error('❌ Error syncing courses:', error);
    }
  }

  /**
   * Load user progress for a specific course (cache-first with background sync)
   */
  async loadUserProgress(userId, courseId) {
    try {
      this.debugLog(`🔄 Loading user progress for course: ${courseId}`);
      
      // 1. Try cache first
      let progress = null;
      const cacheKey = `${this.STORAGE_KEYS.USER_PROGRESS}_${courseId}`;
      const cached = await AsyncStorage.getItem(cacheKey);
      
      if (cached) {
        const cacheData = JSON.parse(cached);
        progress = cacheData.data;
        this.debugLog('📱 User progress loaded from cache');
        
        // 2. Check if stale
        if (!this.isStale(cacheData, this.TTL.USER_PROGRESS)) {
          this.debugLog('✅ Cache is fresh, returning cached data - NO DB READ');
          return progress;
        }
        this.debugLog('⏰ Cache is stale, will sync in background');
      }
      
      // 3. Background sync if stale or no cache
      this.syncUserProgressForCourse(userId, courseId, progress);
      
      return progress;
      
    } catch (error) {
      logger.error('❌ Error loading user progress:', error);
      return null;
    }
  }

  /**
   * Sync user progress for a specific course from Firestore (background)
   */
  async syncUserProgressForCourse(userId, courseId, currentProgress = null) {
    try {
      this.debugLog(`☁️ Syncing user progress for course ${courseId} from Firestore - DB READ`);
      
      // Get from user document instead of user_progress collection
      const progressData = await userProgressService.getCourseProgress(userId, courseId);
      
      // Update cache
      const cacheKey = `${this.STORAGE_KEYS.USER_PROGRESS}_${courseId}`;
      await AsyncStorage.setItem(
        cacheKey,
        JSON.stringify({ data: progressData, lastSync: Date.now() })
      );
      
      this.debugLog('✅ Course progress synced and cached');
      
    } catch (error) {
      logger.error('❌ Error syncing course progress:', error);
    }
  }

  /**
   * Sync user progress from Firestore (background) - general method
   */
  async syncUserProgress(userId, currentProgress = null) {
    try {
      logger.debug('☁️ Syncing user progress from Firestore...');
      
      // Get user's active courses and progress summaries
      const activeCourses = await firestoreService.getUserActiveCourses(userId);
      
      const progressData = {
        activeCourses: activeCourses.length,
        lastSync: Date.now()
      };
      
      // Update cache
      await AsyncStorage.setItem(
        this.STORAGE_KEYS.USER_PROGRESS,
        JSON.stringify({ data: progressData, lastSync: Date.now() })
      );
      
      logger.debug('✅ User progress synced and cached');
      
    } catch (error) {
      logger.error('❌ Error syncing user progress:', error);
    }
  }

  /**
   * Update user progress for a specific course (optimistic update)
   */
  async updateUserProgress(userId, courseId, progressData) {
    try {
      this.debugLog('📈 Updating user progress with hybrid system...');
      
      // Get current progress from cache
      const currentProgress = await this.loadUserProgress(userId, courseId);
      
      // Merge with new progress data
      const updatedProgress = {
        ...currentProgress,
        ...progressData,
        userId,
        courseId,
        lastActivity: new Date().toISOString()
      };
      
      // Update local cache immediately (optimistic update)
      const cacheKey = `${this.STORAGE_KEYS.USER_PROGRESS}_${courseId}`;
      await AsyncStorage.setItem(cacheKey, JSON.stringify({
        data: updatedProgress,
        lastSync: Date.now()
      }));
      
      this.debugLog('✅ Progress updated locally (optimistic)');
      
      // Update Firestore in background
      // Update user document instead of user_progress collection
      await userProgressService.updateCourseProgress(userId, courseId, updatedProgress);
      
      return updatedProgress;
      
    } catch (error) {
      logger.error('❌ Error updating user progress:', error);
      throw error;
    }
  }

  /**
   * Load available disciplines (for interests modal)
   */
  async loadAvailableDisciplines(userId = null) {
    try {
      logger.debug('🔄 Loading available disciplines...');
      
      // Get courses from cache first
      let courses = await this.loadCourses(userId);
      
      // If no courses, wait for sync to complete
      if (courses.length === 0) {
        logger.debug('⏳ No cached courses, waiting for sync...');
        await this.syncCourses(userId);
        
        // Reload from cache after sync
        const cached = await AsyncStorage.getItem(this.STORAGE_KEYS.COURSES);
        if (cached) {
          courses = JSON.parse(cached).data || [];
        }
      }
      
      // Extract unique disciplines
      const uniqueDisciplines = [...new Set(courses.map(course => course.discipline).filter(Boolean))];
      
      logger.debug('✅ Available disciplines loaded:', uniqueDisciplines.length);
      return uniqueDisciplines;
      
    } catch (error) {
      logger.error('❌ Error loading disciplines:', error);
      return [];
    }
  }

  /**
   * Clear all cached data (for testing/reset)
   */
  async clearAllCache() {
    try {
      logger.debug('🗑️ Clearing all hybrid cache...');
      
      await Promise.all([
        AsyncStorage.removeItem(this.STORAGE_KEYS.USER_PROFILE),
        AsyncStorage.removeItem(this.STORAGE_KEYS.COURSES),
        AsyncStorage.removeItem(this.STORAGE_KEYS.USER_PROGRESS),
        AsyncStorage.removeItem(this.STORAGE_KEYS.LAST_SYNC)
      ]);
      
      logger.debug('✅ All hybrid cache cleared');
      
    } catch (error) {
      logger.error('❌ Error clearing cache:', error);
    }
  }

  /**
   * Clear user-specific cache (for sign out)
   */
  async clearUserCache(userId) {
    try {
      logger.debug(`🗑️ Clearing cache for user: ${userId}`);
      
      // Clear user profile cache (global key, so clear it completely)
      await AsyncStorage.removeItem(this.STORAGE_KEYS.USER_PROFILE);
      
      logger.debug('✅ User cache cleared');
      
    } catch (error) {
      logger.error('❌ Error clearing user cache:', error);
    }
  }

  /**
   * Force sync all data (for manual refresh)
   */
  async forceSyncAll(userId) {
    try {
      this.debugLog('🔄 Force syncing all data...');
      
      await Promise.all([
        this.syncUserProfile(userId),
        this.syncCourses(userId),
        this.syncUserProgress(userId)
      ]);
      
      this.debugLog('✅ Force sync completed');
      
    } catch (error) {
      logger.error('❌ Error in force sync:', error);
    }
  }

  /**
   * Get cache status for debugging
   */
  async getCacheStatus() {
    try {
      const [userProfileCache, coursesCache, progressCache] = await Promise.all([
        AsyncStorage.getItem(this.STORAGE_KEYS.USER_PROFILE),
        AsyncStorage.getItem(this.STORAGE_KEYS.COURSES),
        AsyncStorage.getItem(this.STORAGE_KEYS.USER_PROGRESS)
      ]);

      const status = {
        userProfile: {
          exists: !!userProfileCache,
          isStale: userProfileCache ? this.isStale(JSON.parse(userProfileCache), this.TTL.USER_PROFILE) : true,
          lastSync: userProfileCache ? new Date(JSON.parse(userProfileCache).lastSync).toLocaleString() : 'Never'
        },
        courses: {
          exists: !!coursesCache,
          isStale: coursesCache ? this.isStale(JSON.parse(coursesCache), this.TTL.COURSES) : true,
          lastSync: coursesCache ? new Date(JSON.parse(coursesCache).lastSync).toLocaleString() : 'Never',
          count: coursesCache ? JSON.parse(coursesCache).data?.length || 0 : 0
        },
        progress: {
          exists: !!progressCache,
          isStale: progressCache ? this.isStale(JSON.parse(progressCache), this.TTL.USER_PROGRESS) : true,
          lastSync: progressCache ? new Date(JSON.parse(progressCache).lastSync).toLocaleString() : 'Never'
        }
      };

      this.debugLog('📊 Cache Status:', status);
      return status;
    } catch (error) {
      logger.error('❌ Error getting cache status:', error);
      return null;
    }
  }

  /**
   * Initialize hybrid system (call this once on app start)
   */
  async initialize() {
    try {
      this.debugLog('🚀 Initializing hybrid system...');
      
      // Clear old cache keys that might conflict
      await this.clearOldCacheKeys();
      
      this.debugLog('✅ Hybrid system initialized');
      
    } catch (error) {
      logger.error('❌ Error initializing hybrid system:', error);
    }
  }

  /**
   * Clear old cache keys that might conflict with new system
   */
  async clearOldCacheKeys() {
    try {
      this.debugLog('🗑️ Clearing old cache keys...');
      
      // List of old cache keys that might conflict
      const oldKeys = [
        'user_profile',
        'courses_data', 
        'user_progress',
        'last_sync_timestamp',
        'cachedCourseData',
        'selectedCardIndex'
      ];
      
      await Promise.all(
        oldKeys.map(key => AsyncStorage.removeItem(key))
      );
      
      this.debugLog('✅ Old cache keys cleared');
      
    } catch (error) {
      logger.error('❌ Error clearing old cache keys:', error);
    }
  }
}

export default new HybridDataService();
