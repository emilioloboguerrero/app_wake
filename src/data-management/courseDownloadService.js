// Course Download Service - Manages offline course content
import AsyncStorage from '@react-native-async-storage/async-storage';
import firestoreService from '../services/firestoreService';
import hybridDataService from '../services/hybridDataService';
import updateEventManager from '../services/updateEventManager';

class CourseDownloadService {
  constructor() {
    this.currentUserId = null; // Will be set by calling context
    this._versionChecksInProgress = new Set(); // Track courses currently being updated to prevent infinite loops
    this._backgroundUpdatesInProgress = new Set(); // Track background updates to prevent duplicates
  }

  /**
   * Set current user ID for version checking
   */
  setCurrentUserId(userId) {
    this.currentUserId = userId;
  }
  /**
   * Download course content when purchased
   * @param {string} courseId - Course ID to download
   * @param {string} userId - User ID for tracking
   */
  async downloadCourse(courseId, userId) {
    try {
      console.log('📥 Starting course download:', courseId);
      
      // Try to get course data from hybrid system first (cached)
      console.log('🔍 Checking hybrid cache for course data...');
      let courseData = null;
      let modules = [];
      
      try {
        // Get course metadata from hybrid cache
        const courses = await hybridDataService.loadCourses();
        courseData = courses.find(c => c.id === courseId);
        
        if (courseData) {
          console.log('✅ Course metadata found in hybrid cache');
          
          // Try to get modules from hybrid cache if available
          // Note: Modules might not be in hybrid cache yet, so we'll fallback to DB
          console.log('🔍 Checking if modules are available in cache...');
          
          // For now, we still need to get modules from DB as they're not cached in hybrid system
          // This is a temporary solution - we could extend hybrid system to cache modules too
          console.log('⚠️ Modules not in hybrid cache, fetching from DB...');
          modules = await firestoreService.getCourseModules(courseId);
          console.log('📚 Course modules loaded from DB:', modules.length);
        } else {
          console.log('⚠️ Course not found in hybrid cache, fetching from DB...');
          // Fallback to direct Firestore calls
          courseData = await firestoreService.getCourse(courseId);
          if (!courseData) {
            throw new Error(`Course ${courseId} not found in Firestore`);
          }
          console.log('📖 Course data retrieved from DB:', Object.keys(courseData));
          
          modules = await firestoreService.getCourseModules(courseId);
          console.log('📚 Course modules loaded from DB:', modules.length);
        }
        
        // Log structure for debugging
        if (modules.length > 0) {
          console.log('📋 First module structure:', Object.keys(modules[0]));
          if (modules[0].sessions && modules[0].sessions.length > 0) {
            console.log('📋 First session structure:', Object.keys(modules[0].sessions[0]));
            if (modules[0].sessions[0].exercises && modules[0].sessions[0].exercises.length > 0) {
              console.log('📋 First exercise structure:', Object.keys(modules[0].sessions[0].exercises[0]));
            }
          }
        }
      } catch (error) {
        console.warn('⚠️ Error getting course data:', error.message);
        throw error;
      }
      
      // Store image URL for direct use
      let imageUrl = null;
      if (courseData.image_url) {
        imageUrl = courseData.image_url;
        console.log(`📥 Course ${courseId} has image URL:`, imageUrl);
      } else {
        console.log(`⚠️ No image_url found for course ${courseId}`);
      }
      
      // FIX: Store basic course data immediately, even if full download fails
      const basicCourseData = {
        courseId,
        downloadedAt: new Date().toISOString(),
        expiresAt: this.calculateCourseExpiration(courseData),
        version: courseData.version || "1.0",
        imageUrl: courseData.image_url || courseData.imageUrl,
        courseData: {
          ...courseData,
          modules: modules || []
        }
      };
      
      // FIX: Try to store immediately with basic data
      try {
        await this.storeCourseLocally(courseId, {
          ...basicCourseData,
          size_mb: this.estimateDataSize({ ...courseData, modules }),
          compressed: false
        });
        console.log('✅ Basic course data stored locally');
      } catch (storeError) {
        console.error('❌ Failed to store basic course data:', storeError);
        // Continue anyway - we'll retry
      }
      
      // Validate course data structure (non-blocking)
      try {
        await this.validateCourseData({ ...courseData, modules });
      } catch (validationError) {
        console.warn('⚠️ Course data validation warning:', validationError);
        // Continue even if validation fails - basic data is already stored
      }
      
      // Program media downloads disabled
      
      console.log('✅ Course downloaded successfully:', courseId);
      return true;
      
    } catch (error) {
      console.error('❌ Course download failed:', error);
      console.error('❌ Error details:', error.message);
      
      // FIX: Even on error, try to store basic data so course shows up
      try {
        const fallbackData = {
          courseId,
          downloadedAt: new Date().toISOString(),
          expiresAt: this.calculateCourseExpiration(courseData || {}),
          version: "1.0",
          imageUrl: courseData?.image_url || courseData?.imageUrl,
          courseData: courseData || {},
          status: 'ready',
          size_mb: 0,
          compressed: false
        };
        await this.storeCourseLocally(courseId, fallbackData);
        console.log('✅ Stored fallback course data after error');
      } catch (fallbackError) {
        console.error('❌ Failed to store fallback data:', fallbackError);
      }
      
      throw error;
    }
  }
  
  /**
   * Store course data locally with compression
   */
  async storeCourseLocally(courseId, courseData) {
    try {
      const storageKey = `course_${courseId}`;
      const compressedData = await this.compressCourseData(courseData);
      
      await AsyncStorage.setItem(storageKey, JSON.stringify(compressedData));
      
      // Update course index
      await this.updateCourseIndex(courseId, {
        downloadedAt: courseData.downloadedAt,
        size_mb: courseData.size_mb,
        expiresAt: courseData.expiresAt
      });
      
      console.log('💾 Course stored locally:', courseId);
      
    } catch (error) {
      console.error('❌ Failed to store course locally:', error);
      throw error;
    }
  }

  
  async getCourseData(courseId, skipVersionCheck = false) {
    try {
      console.log('🔍 Looking for course in local storage:', courseId);
      const storageKey = `course_${courseId}`;
      const storedData = await AsyncStorage.getItem(storageKey);
      
      if (!storedData) {
        console.log('❌ Course not found locally:', courseId);
        return null;
      }
      
      console.log('📦 Found course data in storage, parsing...');
      const courseData = JSON.parse(storedData);
      
      // Check if course has expired
      if (this.isCourseExpired(courseData)) {
        console.log('⏰ Course expired, removing:', courseId);
        await this.deleteCourse(courseId);
        return null;
      }
      
      // Skip version check for fast initial load (will be checked in background)
      if (skipVersionCheck) {
        const decompressedData = await this.decompressCourseData(courseData);
        return {
          ...decompressedData,
          status: 'ready'
        };
      }
      
      // NEW: Version check (only if not already updating)
      if (this.currentUserId) {
        console.log('🔍 VERSION CHECK: Starting for course:', courseId, 'userId:', this.currentUserId);
        
        // Check if course is already being updated
        console.log('🔍 VERSION CHECK: Calling getUserCourseVersion...');
        const userCourse = await firestoreService.getUserCourseVersion(this.currentUserId, courseId);
        console.log('🔍 VERSION CHECK: getUserCourseVersion result:', userCourse);
        const updateStatus = userCourse?.update_status || 'ready';
        
        console.log('📊 VERSION CHECK: User course data:', {
          courseId,
          userId: this.currentUserId,
          updateStatus,
          downloadedVersion: userCourse?.downloaded_version,
          userCourse: userCourse
        });
        
        if (updateStatus === 'updating') {
          console.log('🔄 VERSION CHECK: Course is already being updated, checking if stuck...');
          
          // Check if update is stuck (older than 5 minutes)
          const lastUpdated = userCourse.lastUpdated || userCourse.updated_at || 0;
          const updateAge = Date.now() - lastUpdated;
          const isStuck = updateAge > 5 * 60 * 1000; // 5 minutes
          
          if (isStuck) {
            console.log('⚠️ VERSION CHECK: Update appears stuck, clearing status');
            // Clear stuck status
            await firestoreService.updateUserCourseVersionStatus(this.currentUserId, courseId, {
              update_status: 'ready',
              lastUpdated: Date.now()
            });
            console.log('✅ VERSION CHECK: Stuck status cleared');
          } else {
            console.log('🔄 VERSION CHECK: Update in progress, returning updating status');
            return {
              ...courseData,
              status: 'updating',
              updateProgress: 0
            };
          }
        }
        
        if (updateStatus === 'failed') {
          console.log('❌ VERSION CHECK: Course update failed, returning failed status');
          return {
            ...courseData,
            status: 'failed',
            updateProgress: 0
          };
        }
        
        // Only check for version mismatch if status is ready
        if (updateStatus === 'ready') {
          // Check if we're already handling an update for this course (prevent infinite loop)
          const updateKey = `${courseId}_${this.currentUserId}`;
          if (this._versionChecksInProgress?.has(updateKey)) {
            console.log('⚠️ VERSION CHECK: Update already in progress for this course, skipping');
            const decompressedData = await this.decompressCourseData(courseData);
            return {
              ...decompressedData,
              status: 'updating',
              updateProgress: 0
            };
          }
          
          // Mark as in progress BEFORE checking version (prevents race condition)
          if (!this._versionChecksInProgress) {
            this._versionChecksInProgress = new Set();
          }
          this._versionChecksInProgress.add(updateKey);
          
          try {
            console.log('🔍 VERSION CHECK: Status is ready, checking for version mismatch');
            const versionCheck = await this.checkVersionMismatch(courseId, courseData, this.currentUserId);
            console.log('📊 VERSION CHECK: Version check result:', versionCheck);
            
            if (versionCheck.needsUpdate) {
              console.log('🔄 VERSION CHECK: Version mismatch detected, starting update process');
              
              // Mark as updating and start background download (non-blocking)
              this.handleVersionUpdate(courseId, versionCheck.newVersion, this.currentUserId).catch(error => {
                console.error('❌ Error in handleVersionUpdate:', error);
                // Remove from in-progress on error
                if (this._versionChecksInProgress) {
                  this._versionChecksInProgress.delete(updateKey);
                }
              });
              
              const decompressedData = await this.decompressCourseData(courseData);
              return {
                ...decompressedData,
                status: 'updating',
                updateProgress: 0
              };
            } else {
              console.log('✅ VERSION CHECK: No update needed, versions match');
              // Remove from in-progress if no update needed
              if (this._versionChecksInProgress) {
                this._versionChecksInProgress.delete(updateKey);
              }
            }
          } catch (error) {
            console.error('❌ Error in version check:', error);
            // Remove from in-progress on error
            if (this._versionChecksInProgress) {
              this._versionChecksInProgress.delete(updateKey);
            }
            throw error;
          }
        }
      } else {
        console.log('⚠️ VERSION CHECK: No currentUserId set, skipping version check');
      }
      
      // Decompress if needed
      const decompressedData = await this.decompressCourseData(courseData);
      
      console.log('✅ Course loaded from local storage:', courseId);
      console.log('📚 Course has', decompressedData.courseData?.modules?.length || 0, 'modules');
      
      return {
        ...decompressedData,
        status: 'ready'
      };
      
    } catch (error) {
      console.error('❌ Failed to get course data:', error);
      console.error('❌ Error details:', error.message);
      return null;
    }
  }
  
  /**
   * Check if course is available locally
   */
  async isCourseAvailable(courseId) {
    try {
      const courseData = await this.getCourseData(courseId);
      return courseData !== null;
    } catch (error) {
      return false;
    }
  }
  
  /**
   * Delete course from local storage
   */
  async deleteCourse(courseId) {
    try {
      const storageKey = `course_${courseId}`;
      await AsyncStorage.removeItem(storageKey);
      
      // Update course index
      await this.removeCourseFromIndex(courseId);
      
      console.log('🗑️ Course deleted from local storage:', courseId);
      return true;
      
    } catch (error) {
      console.error('❌ Failed to delete course:', error);
      return false;
    }
  }

  /**
   * Clear all course data from local storage (for complete reset)
   */
  async clearAllCourseData() {
    try {
      console.log('🧹 Clearing all course data from local storage...');
      
      // Get all AsyncStorage keys
      const keys = await AsyncStorage.getAllKeys();
      
      // Find all course-related keys
      const courseKeys = keys.filter(key => key.startsWith('course_'));
      
      // Remove all course data
      if (courseKeys.length > 0) {
        await AsyncStorage.multiRemove(courseKeys);
        console.log('✅ Cleared', courseKeys.length, 'course data entries');
      }
      
      // Also clear course index
      await AsyncStorage.removeItem('course_index');
      
      console.log('✅ All course data cleared from local storage');
    } catch (error) {
      console.error('❌ Failed to clear all course data:', error);
      throw error;
    }
  }
  
  /**
   * Cleanup expired courses for a user
   */
  async cleanupExpiredCourses(userId) {
    try {
      console.log('🧹 Cleaning up expired courses for user:', userId);
      
      // Get user's active courses from Firestore
      const userDoc = await firestoreService.getUser(userId);
      if (!userDoc) return;
      
      const activeCourseIds = Object.keys(userDoc.courses || {});
      
      // Get locally stored courses
      const courseIndex = await this.getCourseIndex();
      const localCourseIds = Object.keys(courseIndex);
      
      // Find courses that are no longer active
      const expiredCourses = localCourseIds.filter(courseId => 
        !activeCourseIds.includes(courseId)
      );
      
      // Delete expired courses and update cache
      for (const courseId of expiredCourses) {
        await this.deleteCourse(courseId);
        
        // Also remove from user's course cache
        await this.removeCourseFromCache(userId, courseId);
      }
      
      console.log('✅ Cleanup completed. Removed courses:', expiredCourses.length);
      
    } catch (error) {
      console.error('❌ Cleanup failed:', error);
    }
  }
  
  /**
   * Validate course data structure
   */
  async validateCourseData(courseData) {
    if (!courseData.title || typeof courseData.title !== 'string') {
      throw new Error('Course missing valid title');
    }
    
    // Modules are optional - some courses might not have them yet
    if (courseData.modules && !Array.isArray(courseData.modules)) {
      throw new Error('Course modules must be an array if present');
    }
    
    // Validate module structure if modules exist
    if (courseData.modules && courseData.modules.length > 0) {
      for (const module of courseData.modules) {
        if (!module.id) {
          console.warn('⚠️ Module missing ID, but continuing:', module);
        }
      }
    }
    
    console.log('✅ Course data validation passed');
    return true;
  }
  
  /**
   * Calculate course expiration based on user's course data
   */
  calculateCourseExpiration(courseData) {
    // Default to 1 year from download
    const oneYearFromNow = new Date();
    oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1);
    return oneYearFromNow.toISOString();
  }
  
  /**
   * Estimate data size for storage planning
   */
  estimateDataSize(courseData) {
    const jsonString = JSON.stringify(courseData);
    const sizeInBytes = new Blob([jsonString]).size;
    const sizeInMB = sizeInBytes / (1024 * 1024);
    return Math.round(sizeInMB * 100) / 100; // Round to 2 decimal places
  }
  
  /**
   * Simple compression for course data
   */
  async compressCourseData(courseData) {
    // For now, just mark as compressed (can implement actual compression later)
    return {
      ...courseData,
      compressed: true,
      originalSize: this.estimateDataSize(courseData)
    };
  }
  
  /**
   * Decompress course data
   */
  async decompressCourseData(courseData) {
    if (!courseData.compressed) {
      return courseData;
    }
    
    // For now, just return the data (implement actual decompression later)
    return courseData;
  }
  
  /**
   * Check if course has expired
   */
  isCourseExpired(courseData) {
    if (!courseData.expiresAt) return false;
    
    const expirationDate = new Date(courseData.expiresAt);
    const now = new Date();
    return now > expirationDate;
  }
  
  /**
   * Manage course index for quick lookups
   */
  async getCourseIndex() {
    try {
      const indexData = await AsyncStorage.getItem('course_index');
      return indexData ? JSON.parse(indexData) : {};
    } catch (error) {
      console.error('Failed to get course index:', error);
      return {};
    }
  }
  
  async updateCourseIndex(courseId, metadata) {
    try {
      const index = await this.getCourseIndex();
      index[courseId] = {
        ...metadata,
        lastAccessed: new Date().toISOString()
      };
      
      await AsyncStorage.setItem('course_index', JSON.stringify(index));
    } catch (error) {
      console.error('Failed to update course index:', error);
    }
  }
  
  async removeCourseFromIndex(courseId) {
    try {
      const index = await this.getCourseIndex();
      delete index[courseId];
      await AsyncStorage.setItem('course_index', JSON.stringify(index));
    } catch (error) {
      console.error('Failed to remove course from index:', error);
    }
  }
  
  /**
   * Get storage usage information
   */
  async getStorageUsage() {
    try {
      const index = await this.getCourseIndex();
      const totalCourses = Object.keys(index).length;
      const totalSize = Object.values(index).reduce((sum, course) => sum + (course.size_mb || 0), 0);
      
      return {
        totalCourses,
        totalSize_mb: totalSize,
        courses: index
      };
    } catch (error) {
      console.error('Failed to get storage usage:', error);
      return { totalCourses: 0, totalSize_mb: 0, courses: {} };
    }
  }

  /**
   * Remove a course from user's active course cache
   * @param {string} userId - User ID
   * @param {string} courseId - Course ID to remove
   */
  async removeCourseFromCache(userId, courseId) {
    try {
      console.log('➖ Removing course from cache:', courseId);
      
      // Get current active course IDs
      const cacheKey = `active_courses_${userId}`;
      const cachedData = await AsyncStorage.getItem(cacheKey);
      
      if (!cachedData) {
        console.log('ℹ️ No cache found to remove course from');
        return false;
      }
      
      const courseCache = JSON.parse(cachedData);
      const activeCourses = courseCache.activeCourses || [];
      
      const filteredCourses = activeCourses.filter(c => c.courseId !== courseId);
      
      if (filteredCourses.length < activeCourses.length) {
        // Update the cache with filtered courses
        const updatedCache = {
          ...courseCache,
          activeCourses: filteredCourses,
          lastUpdated: new Date().toISOString()
        };
        
        await AsyncStorage.setItem(cacheKey, JSON.stringify(updatedCache));
        console.log('✅ Course removed from cache');
        return true;
      } else {
        console.log('ℹ️ Course not found in cache');
        return false;
      }
    } catch (error) {
      console.error('❌ Error removing course from cache:', error);
      return false;
    }
  }

  // Version System Methods
  /**
   * Check if course version needs update
   */
  async checkVersionMismatch(courseId, localCourseData, userId) {
    try {
      console.log('🔍 Checking version mismatch for course:', courseId);
      
      // Get latest course data from DB
      const latestCourseData = await firestoreService.getCourse(courseId);
      if (!latestCourseData) {
        console.log('❌ Course not found in database:', courseId);
        return { needsUpdate: false };
      }
      
      // Get user's downloaded version
      const userCourse = await firestoreService.getUserCourseVersion(userId, courseId);
      const downloadedVersion = userCourse?.downloaded_version || localCourseData.version || 'unknown';
      
      console.log('📊 Version comparison:', {
        courseId,
        latestVersion: latestCourseData.version,
        downloadedVersion: downloadedVersion
      });
      
      // Compare versions
      if (latestCourseData.version !== downloadedVersion) {
        console.log('🔄 Version mismatch detected:', {
          latest: latestCourseData.version,
          downloaded: downloadedVersion
        });
        return {
          needsUpdate: true,
          newVersion: latestCourseData.version,
          currentVersion: downloadedVersion
        };
      }
      
      console.log('✅ Versions match, no update needed');
      return { needsUpdate: false };
      
    } catch (error) {
      console.error('❌ Error checking version mismatch:', error);
      return { needsUpdate: false };
    }
  }
  
  /**
   * Handle version update process
   */
  async handleVersionUpdate(courseId, newVersion, userId) {
    const updateKey = `${courseId}_${userId}`;
    
    // Double-check: if already in progress, skip
    if (this._versionChecksInProgress?.has(updateKey)) {
      // Check if status is already 'updating' in Firestore
      try {
        const userCourse = await firestoreService.getUserCourseVersion(userId, courseId);
        if (userCourse?.update_status === 'updating') {
          console.log('⚠️ handleVersionUpdate: Update already in progress, skipping duplicate call');
          return;
        }
      } catch (error) {
        console.error('❌ Error checking update status:', error);
      }
    }
    
    try {
      console.log('🔄 Handling version update for course:', courseId, 'to version:', newVersion);
      
      // CRITICAL: Mark course as updating FIRST to prevent infinite loop
      // This must happen before any getCourseData() calls
      await firestoreService.updateUserCourseVersionStatus(userId, courseId, {
        downloaded_version: newVersion,
        update_status: 'updating',
        lastUpdated: Date.now()
      });
      
      // Get old version from local data (skip version check to avoid loop)
      const localCourseData = await this.getCourseData(courseId, true);
      const oldVersion = localCourseData?.version || '1.0';
      
      // Start background download (only once)
      this.startBackgroundUpdate(courseId, newVersion, userId);
      
      // Program media downloads disabled
      
      console.log('✅ Version update process started');
      
    } catch (error) {
      console.error('❌ Error handling version update:', error);
      // Remove from in-progress on error
      if (this._versionChecksInProgress) {
        this._versionChecksInProgress.delete(updateKey);
      }
    }
  }
  
  /**
   * Start background update (non-blocking)
   */
  async startBackgroundUpdate(courseId, newVersion, userId) {
    const updateKey = `${courseId}_${userId}`;
    
    // Prevent duplicate background updates
    if (this._backgroundUpdatesInProgress.has(updateKey)) {
      console.log('⚠️ Background update already in progress for:', courseId, 'skipping duplicate');
      return;
    }
    
    // Mark as in progress
    this._backgroundUpdatesInProgress.add(updateKey);
    
    console.log('🚀 STARTING BACKGROUND UPDATE:', {
      courseId,
      newVersion,
      userId,
      timestamp: new Date().toISOString()
    });
    
    // Run in background to not block UI
    setTimeout(async () => {
      try {
        console.log('🔄 BACKGROUND UPDATE STEP 1: Starting download for:', courseId);
        
        // Download new content
        await this.downloadCourse(courseId, userId);
        console.log('✅ BACKGROUND UPDATE STEP 2: Download completed for:', courseId);
        
        // Program media downloads disabled
        
        // Update user's version
        await firestoreService.updateUserCourseVersionStatus(userId, courseId, {
          downloaded_version: newVersion,
          update_status: 'ready'
        });
        console.log('✅ BACKGROUND UPDATE STEP 3: Status updated to ready for:', courseId);
        
        // Notify UI that update is complete
        this.notifyUpdateComplete(courseId, newVersion);
        console.log('✅ BACKGROUND UPDATE STEP 4: UI notification sent for:', courseId);
        
        console.log('🎉 BACKGROUND UPDATE COMPLETED SUCCESSFULLY:', courseId);
        
        // Clean up: remove from in-progress tracking
        this._backgroundUpdatesInProgress.delete(updateKey);
        if (this._versionChecksInProgress) {
          this._versionChecksInProgress.delete(updateKey);
        }
        
      } catch (error) {
        console.error('❌ BACKGROUND UPDATE FAILED:', {
          courseId,
          error: error.message,
          stack: error.stack,
          timestamp: new Date().toISOString()
        });
        
        // Mark as failed
        await firestoreService.updateUserCourseVersionStatus(userId, courseId, {
          update_status: 'failed'
        });
        console.log('❌ BACKGROUND UPDATE: Status marked as failed for:', courseId);
        
        // Notify UI of failure
        this.notifyUpdateFailed(courseId, error);
        console.log('❌ BACKGROUND UPDATE: UI failure notification sent for:', courseId);
        
        // Clean up: remove from in-progress tracking
        this._backgroundUpdatesInProgress.delete(updateKey);
        if (this._versionChecksInProgress) {
          this._versionChecksInProgress.delete(updateKey);
        }
      }
    }, 1000); // 1 second delay to not block UI
  }
  
  /**
   * Notify UI of update completion
   */
  notifyUpdateComplete(courseId, newVersion) {
    console.log('📢 Update complete notification for:', courseId, 'version:', newVersion);
    console.log('🔍 CALLBACK DEBUG: onUpdateComplete exists?', !!this.onUpdateComplete);
    
    // Notify the update event manager
    updateEventManager.notifyUpdateComplete(courseId);
    
    // Direct UI update - Firestore status is already updated in startBackgroundUpdate
    if (this.onUpdateComplete) {
      console.log('🔄 CALLBACK DEBUG: Calling onUpdateComplete callback...');
      this.onUpdateComplete(courseId, newVersion, 'ready'); // Pass status
      console.log('✅ CALLBACK DEBUG: onUpdateComplete callback called');
    } else {
      console.log('❌ CALLBACK DEBUG: onUpdateComplete callback not set!');
    }
  }
  
  /**
   * Notify UI of update failure
   */
  notifyUpdateFailed(courseId, error) {
    console.log('📢 Update failed notification for:', courseId, 'error:', error.message);
    
    // Direct UI update - simplest approach
    if (this.onUpdateFailed) {
      this.onUpdateFailed(courseId, error, 'failed'); // Pass status
    }
  }
  
  /**
   * Set UI refresh callbacks
   */
  setUIUpdateCallbacks(onUpdateComplete, onUpdateFailed) {
    console.log('🔧 CALLBACK SETUP: Setting UI update callbacks...');
    console.log('🔍 CALLBACK SETUP DEBUG: onUpdateComplete provided?', !!onUpdateComplete);
    console.log('🔍 CALLBACK SETUP DEBUG: onUpdateFailed provided?', !!onUpdateFailed);
    
    this.onUpdateComplete = onUpdateComplete;
    this.onUpdateFailed = onUpdateFailed;
    
    console.log('✅ CALLBACK SETUP: UI update callbacks set successfully');
  }
}

export default new CourseDownloadService();
