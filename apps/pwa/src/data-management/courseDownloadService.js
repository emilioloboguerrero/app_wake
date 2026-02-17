// Course Download Service - Manages offline course content
import AsyncStorage from '@react-native-async-storage/async-storage';
import firestoreService from '../services/firestoreService';
import hybridDataService from '../services/hybridDataService';
import updateEventManager from '../services/updateEventManager';
import { getMondayWeek } from '../utils/weekCalculation';
import logger from '../utils/logger';
import libraryResolutionService from '../services/libraryResolutionService';

class CourseDownloadService {
  constructor() {
    this.currentUserId = null; // Will be set by calling context
    this._versionChecksInProgress = new Set(); // Track courses currently being updated to prevent infinite loops
    this._backgroundUpdatesInProgress = new Set(); // Track background updates to prevent duplicates
    this._weekChecksInProgress = new Set(); // Track week checks in progress to prevent recursion
  }

  /**
   * Set current user ID for version checking
   */
  setCurrentUserId(userId) {
    this.currentUserId = userId;
  }

  /**
   * Get the stored week for a course (last week we downloaded)
   */
  async getStoredWeek(courseId) {
    try {
      const storedCourse = await this.getCourseData(courseId, true); // Skip version check
      return storedCourse?.currentWeek || null;
    } catch (error) {
      logger.error('Error getting stored week:', error);
      return null;
    }
  }

  /**
   * Update stored week locally
   */
  async updateStoredWeek(courseId, week) {
    try {
      const storedCourse = await this.getCourseData(courseId, true);
      if (storedCourse) {
        storedCourse.currentWeek = week;
        await this.storeCourseLocally(courseId, storedCourse);
        logger.debug('✅ Stored week updated:', week);
      }
    } catch (error) {
      logger.error('Error updating stored week:', error);
    }
  }

  /**
   * Check if week changed and trigger re-download if needed
   */
  async checkWeekChange(courseId, userId, skipDownload = false) {
    try {
      // Prevent recursion - if already checking, skip
      const checkKey = `${courseId}_${userId}`;
      if (this._weekChecksInProgress.has(checkKey)) {
        logger.debug('⚠️ Week check already in progress for:', courseId);
        return false;
      }

      this._weekChecksInProgress.add(checkKey);

      try {
        const courseData = await firestoreService.getCourse(courseId);
        
        // Only check for weekly programs
        if (courseData?.weekly !== true) {
          return false; // Not a weekly program, no week change check needed
        }
        
        const currentWeek = getMondayWeek(); // Get current calendar week
        const storedWeek = await this.getStoredWeek(courseId);
        
        // If week changed, re-download (unless skipDownload is true)
        if (storedWeek && storedWeek !== currentWeek && !skipDownload) {
          logger.debug('🔄 Week changed detected!', {
            storedWeek,
            currentWeek,
            courseId
          });
          
          // Clear local cache to force fresh download
          await this.deleteCourse(courseId);
          
          // Re-download with new week (pass skipDownload to prevent recursion)
          await this.downloadCourseInternal(courseId, userId);
          
          // Update stored week
          await this.updateStoredWeek(courseId, currentWeek);
          
          return true; // Week changed, re-downloaded
        }
        
        // Update stored week if first time
        if (!storedWeek) {
          await this.updateStoredWeek(courseId, currentWeek);
        }
        
        return false; // No week change
      } finally {
        // Always remove from in-progress set
        this._weekChecksInProgress.delete(checkKey);
      }
    } catch (error) {
      logger.error('Error checking week change:', error);
      const checkKey = `${courseId}_${userId}`;
      this._weekChecksInProgress.delete(checkKey);
      return false;
    }
  }

  /**
   * Internal download method that skips week check (to prevent recursion)
   */
  async downloadCourseInternal(courseId, userId) {
    try {
      logger.debug('📥 Starting course download (internal):', courseId);
      let courseData = null;
      try {
        const courses = await hybridDataService.loadCourses();
        courseData = courses.find(c => c.id === courseId);
        if (!courseData) {
          courseData = await firestoreService.getCourse(courseId);
          if (!courseData) throw new Error(`Course ${courseId} not found in Firestore`);
        }
      } catch (error) {
        logger.warn('⚠️ Error getting course data:', error.message);
        throw error;
      }
      const publishedVersion = courseData.published_version ?? courseData.version ?? '1.0';
      let isOneOnOne = false;
      if (userId) {
        try {
          const userDoc = await firestoreService.getUser(userId);
          isOneOnOne = userDoc?.courses?.[courseId]?.deliveryType === 'one_on_one';
        } catch (e) {
          logger.warn('⚠️ Could not check deliveryType:', e);
        }
      }
      if (isOneOnOne) {
        const minimalCourseData = {
          courseId,
          downloadedAt: new Date().toISOString(),
          expiresAt: this.calculateCourseExpiration(courseData),
          version: courseData.version || '1.0',
          publishedVersion,
          libraryVersions: {},
          courseData: { ...courseData, modules: [], isOneOnOne: true },
          clientProgramVersion: null,
          clientProgram: null
        };
        await this.storeCourseLocally(courseId, { ...minimalCourseData, size_mb: 0, compressed: false });
        if (userId) {
          await firestoreService.updateUserCourseVersionStatus(userId, courseId, {
            downloaded_version: publishedVersion,
            update_status: 'ready',
            lastUpdated: Date.now()
          });
        }
        return true;
      }
      let modules = [];
      modules = await firestoreService.getCourseModules(courseId, userId);
      const currentWeek = courseData?.weekly === true ? getMondayWeek() : null;
      const libraryVersions = await this.extractLibraryVersions(courseData.creator_id, modules);
      const basicCourseData = {
        courseId,
        downloadedAt: new Date().toISOString(),
        expiresAt: this.calculateCourseExpiration(courseData),
        version: courseData.version || '1.0',
        publishedVersion,
        imageUrl: courseData.image_url || courseData.imageUrl,
        currentWeek,
        libraryVersions,
        courseData: {
          ...courseData,
          modules: modules || [],
          deliveryType: courseData.deliveryType ?? 'low_ticket'
        }
      };
      await this.storeCourseLocally(courseId, {
        ...basicCourseData,
        size_mb: this.estimateDataSize({ ...courseData, modules }),
        compressed: false
      });
      if (userId) {
        await firestoreService.updateUserCourseVersionStatus(userId, courseId, {
          downloaded_version: publishedVersion,
          update_status: 'ready',
          lastUpdated: Date.now()
        });
      }
      try {
        await this.validateCourseData({ ...courseData, modules });
      } catch (validationError) {
        logger.warn('⚠️ Course data validation warning:', validationError);
      }
      return true;
    } catch (error) {
      logger.error('❌ Course download failed (internal):', error);
      throw error;
    }
  }
  /**
   * Download course content when purchased
   * @param {string} courseId - Course ID to download
   * @param {string} userId - User ID for tracking
   */
  async downloadCourse(courseId, userId) {
    try {
      logger.debug('📥 Starting course download:', courseId);
      
      // ✅ NEW: Check if week changed (only for weekly programs)
      // Check without downloading first to see if week changed
      let courseMetadata = await firestoreService.getCourse(courseId);
      if (courseMetadata?.weekly === true) {
        const currentWeek = getMondayWeek();
        const storedWeek = await this.getStoredWeek(courseId);
        
        if (storedWeek && storedWeek !== currentWeek) {
          logger.debug('🔄 Week changed detected during download!', {
            storedWeek,
            currentWeek
          });
          
          // Clear local cache to force fresh download
          await this.deleteCourse(courseId);
          
          // Use internal download to prevent recursion
          await this.downloadCourseInternal(courseId, userId);
          
          // Update stored week
          await this.updateStoredWeek(courseId, currentWeek);
          
          logger.debug('✅ Week changed, course re-downloaded with new week content');
          return true;
        }
      }
      
      let courseData = null;
      try {
        const courses = await hybridDataService.loadCourses();
        courseData = courses.find(c => c.id === courseId);
        if (!courseData) {
          courseData = await firestoreService.getCourse(courseId);
          if (!courseData) throw new Error(`Course ${courseId} not found in Firestore`);
        }
      } catch (error) {
        logger.warn('⚠️ Error getting course data:', error.message);
        throw error;
      }
      
      const publishedVersion = courseData.published_version ?? courseData.version ?? '1.0';
      let isOneOnOne = false;
      if (userId) {
        try {
          const userDoc = await firestoreService.getUser(userId);
          isOneOnOne = userDoc?.courses?.[courseId]?.deliveryType === 'one_on_one';
        } catch (e) {
          logger.warn('⚠️ Could not check deliveryType:', e);
        }
      }
      
      if (isOneOnOne) {
        logger.debug('📱 One-on-one program: storing minimal (no modules), per-session fetch will load content');
        const minimalCourseData = {
          courseId,
          downloadedAt: new Date().toISOString(),
          expiresAt: this.calculateCourseExpiration(courseData),
          version: courseData.version || '1.0',
          publishedVersion,
          libraryVersions: {},
          courseData: {
            ...courseData,
            modules: [],
            isOneOnOne: true
          },
          clientProgramVersion: null,
          clientProgram: null
        };
        try {
          await this.storeCourseLocally(courseId, { ...minimalCourseData, size_mb: 0, compressed: false });
          if (userId) {
            await firestoreService.updateUserCourseVersionStatus(userId, courseId, {
              downloaded_version: publishedVersion,
              update_status: 'ready',
              lastUpdated: Date.now()
            });
          }
        } catch (storeError) {
          logger.error('❌ Failed to store one-on-one minimal:', storeError);
        }
        logger.debug('✅ One-on-one minimal stored:', courseId);
        return true;
      }
      
      let modules = [];
      try {
        modules = await firestoreService.getCourseModules(courseId, userId);
        logger.debug('📚 Course modules loaded from DB:', modules.length);
      } catch (error) {
        logger.warn('⚠️ Error getting modules:', error.message);
        throw error;
      }
      
      let imageUrl = courseData.image_url || null;
      let currentWeek = null;
      if (courseData?.weekly === true) currentWeek = getMondayWeek();
      const libraryVersions = await this.extractLibraryVersions(courseData.creator_id, modules);
      let clientProgram = null;
      let clientProgramVersion = null;
      if (userId) {
        try {
          clientProgram = await firestoreService.getClientProgram(userId, courseId);
          if (clientProgram) clientProgramVersion = clientProgram.version_snapshot || null;
        } catch (error) {
          logger.warn('⚠️ Could not load client program:', error);
        }
      }
      
      const basicCourseData = {
        courseId,
        downloadedAt: new Date().toISOString(),
        expiresAt: this.calculateCourseExpiration(courseData),
        version: courseData.version || '1.0',
        publishedVersion,
        imageUrl: courseData.image_url || courseData.imageUrl,
        currentWeek,
        libraryVersions,
        clientProgramVersion,
        courseData: {
          ...courseData,
          modules: modules || [],
          deliveryType: courseData.deliveryType ?? 'low_ticket'
        },
        clientProgram: clientProgram || null
      };
      
      try {
        await this.storeCourseLocally(courseId, {
          ...basicCourseData,
          size_mb: this.estimateDataSize({ ...courseData, modules }),
          compressed: false
        });
        if (userId) {
          await firestoreService.updateUserCourseVersionStatus(userId, courseId, {
            downloaded_version: publishedVersion,
            update_status: 'ready',
            lastUpdated: Date.now()
          });
        }
        logger.debug('✅ Basic course data stored locally');
      } catch (storeError) {
        logger.error('❌ Failed to store basic course data:', storeError);
      }
      try {
        await this.validateCourseData({ ...courseData, modules });
      } catch (validationError) {
        logger.warn('⚠️ Course data validation warning:', validationError);
      }
      logger.debug('✅ Course downloaded successfully:', courseId);
      return true;
      
    } catch (error) {
      logger.error('❌ Course download failed:', error);
      logger.error('❌ Error details:', error.message);
      
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
        logger.debug('✅ Stored fallback course data after error');
      } catch (fallbackError) {
        logger.error('❌ Failed to store fallback data:', fallbackError);
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
      
      logger.debug('💾 Course stored locally:', courseId);
      
    } catch (error) {
      logger.error('❌ Failed to store course locally:', error);
      throw error;
    }
  }

  
  async getCourseData(courseId, skipVersionCheck = false) {
    try {
      logger.debug('🔍 Looking for course in local storage:', courseId);
      const storageKey = `course_${courseId}`;
      const storedData = await AsyncStorage.getItem(storageKey);
      
      if (!storedData) {
        logger.debug('❌ Course not found locally:', courseId);
        return null;
      }
      
      logger.debug('📦 Found course data in storage, parsing...');
      const courseData = JSON.parse(storedData);
      
      // Check if course has expired
      if (this.isCourseExpired(courseData)) {
        logger.debug('⏰ Course expired, removing:', courseId);
        await this.deleteCourse(courseId);
        return null;
      }
      
      // ✅ NEW: Check if week changed (for weekly programs)
      if (courseData?.courseData?.weekly === true && this.currentUserId) {
        const currentWeek = getMondayWeek();
        const storedWeek = courseData.currentWeek;
        
        if (storedWeek && storedWeek !== currentWeek) {
          logger.debug('🔄 Week changed detected during getCourseData!', {
            storedWeek,
            currentWeek
          });
          
          // Trigger background re-download
          this.checkWeekChange(courseId, this.currentUserId).catch(error => {
            logger.error('Error in background week check:', error);
          });
          
          // Still return old data for now (download happens in background)
          // User will see update on next access
        }
      }

      // Skip version check for fast initial load (will be checked in background)
      if (skipVersionCheck) {
        const decompressedData = await this.decompressCourseData(courseData);
        return {
          ...decompressedData,
          status: 'ready'
        };
      }
      
      const decompressedDataForCheck = await this.decompressCourseData(courseData);
      if (decompressedDataForCheck.courseData?.isOneOnOne === true) {
        logger.debug('📱 One-on-one program: skipping version check, using cached minimal');
        return { ...decompressedDataForCheck, status: 'ready' };
      }
      
      // Version check for low-ticket (only if not already updating)
      if (this.currentUserId) {
        logger.debug('🔍 VERSION CHECK: Starting for course:', courseId, 'userId:', this.currentUserId);
        
        // Check if course is already being updated
        logger.debug('🔍 VERSION CHECK: Calling getUserCourseVersion...');
        const userCourse = await firestoreService.getUserCourseVersion(this.currentUserId, courseId);
        logger.debug('🔍 VERSION CHECK: getUserCourseVersion result:', userCourse);
        const updateStatus = userCourse?.update_status || 'ready';
        
        logger.debug('📊 VERSION CHECK: User course data:', {
          courseId,
          userId: this.currentUserId,
          updateStatus,
          downloadedVersion: userCourse?.downloaded_version,
          userCourse: userCourse
        });
        
        if (updateStatus === 'updating') {
          logger.debug('🔄 VERSION CHECK: Course is already being updated, checking if stuck...');
          
          // Check if update is stuck (older than 5 minutes)
          const lastUpdated = userCourse.lastUpdated || userCourse.updated_at || 0;
          const updateAge = Date.now() - lastUpdated;
          const isStuck = updateAge > 5 * 60 * 1000; // 5 minutes
          
          if (isStuck) {
            logger.debug('⚠️ VERSION CHECK: Update appears stuck, clearing status');
            // Clear stuck status
            await firestoreService.updateUserCourseVersionStatus(this.currentUserId, courseId, {
              update_status: 'ready',
              lastUpdated: Date.now()
            });
            logger.debug('✅ VERSION CHECK: Stuck status cleared');
          } else {
            logger.debug('🔄 VERSION CHECK: Update in progress, returning updating status');
            return {
              ...courseData,
              status: 'updating',
              updateProgress: 0
            };
          }
        }
        
        if (updateStatus === 'failed') {
          logger.debug('❌ VERSION CHECK: Course update failed, returning failed status');
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
            logger.debug('⚠️ VERSION CHECK: Update already in progress for this course, skipping');
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
            logger.debug('🔍 VERSION CHECK: Status is ready, checking for version mismatch');
            
            // ✅ NEW: Check library versions first
            const decompressedData = await this.decompressCourseData(courseData);
            let libraryVersionCheck = null;
            
            if (decompressedData.libraryVersions && decompressedData.courseData?.creator_id) {
              try {
                libraryVersionCheck = await libraryResolutionService.checkLibraryVersionsChanged(
                  decompressedData.courseData.creator_id,
                  decompressedData.libraryVersions
                );
                
                if (libraryVersionCheck.needsUpdate) {
                  logger.debug('🔄 LIBRARY VERSION CHECK: Library items changed, triggering update');
                  this.handleLibraryVersionUpdate(courseId, libraryVersionCheck, this.currentUserId).catch(error => {
                    logger.error('❌ Error in handleLibraryVersionUpdate:', error);
                  });
                  
                  return {
                    ...decompressedData,
                    status: 'updating',
                    updateProgress: 0
                  };
                }
              } catch (libraryError) {
                logger.error('❌ Error checking library versions:', libraryError);
                // Continue with course version check even if library check fails
              }
            }
            
            // ✅ NEW: Check client program version
            if (this.currentUserId && decompressedData.clientProgramVersion) {
              try {
                const currentClientProgram = await firestoreService.getClientProgram(this.currentUserId, courseId);
                if (currentClientProgram) {
                  const currentVersion = currentClientProgram.version_snapshot;
                  const storedVersion = decompressedData.clientProgramVersion;
                  
                  // Compare versions (simple deep equality check)
                  if (JSON.stringify(currentVersion) !== JSON.stringify(storedVersion)) {
                    logger.debug('🔄 CLIENT PROGRAM VERSION CHECK: Client overrides changed, triggering update');
                    // Trigger re-download to get updated client overrides
                    this.handleVersionUpdate(courseId, decompressedData.version, this.currentUserId).catch(error => {
                      logger.error('❌ Error in handleVersionUpdate:', error);
                    });
                    
                    return {
                      ...decompressedData,
                      status: 'updating',
                      updateProgress: 0
                    };
                  }
                }
              } catch (clientError) {
                logger.error('❌ Error checking client program version:', clientError);
              }
            }
            
            // ✅ EXISTING: Check course version
            const versionCheck = await this.checkVersionMismatch(courseId, courseData, this.currentUserId);
            logger.debug('📊 VERSION CHECK: Version check result:', versionCheck);
            
            if (versionCheck.needsUpdate) {
              logger.debug('🔄 VERSION CHECK: Version mismatch detected, starting update process');
              
              // Mark as updating and start background download (non-blocking)
              this.handleVersionUpdate(courseId, versionCheck.newVersion, this.currentUserId).catch(error => {
                logger.error('❌ Error in handleVersionUpdate:', error);
                // Remove from in-progress on error
                if (this._versionChecksInProgress) {
                  this._versionChecksInProgress.delete(updateKey);
                }
              });
              
              return {
                ...decompressedData,
                status: 'updating',
                updateProgress: 0
              };
            } else {
              logger.debug('✅ VERSION CHECK: No update needed, versions match');
              // Remove from in-progress if no update needed
              if (this._versionChecksInProgress) {
                this._versionChecksInProgress.delete(updateKey);
              }
            }
          } catch (error) {
            logger.error('❌ Error in version check:', error);
            // Remove from in-progress on error
            if (this._versionChecksInProgress) {
              this._versionChecksInProgress.delete(updateKey);
            }
            throw error;
          }
        }
      } else {
        logger.debug('⚠️ VERSION CHECK: No currentUserId set, skipping version check');
      }
      
      // Decompress if needed
      const decompressedData = await this.decompressCourseData(courseData);
      
      logger.debug('✅ Course loaded from local storage:', courseId);
      logger.debug('📚 Course has', decompressedData.courseData?.modules?.length || 0, 'modules');
      
      return {
        ...decompressedData,
        status: 'ready'
      };
      
    } catch (error) {
      logger.error('❌ Failed to get course data:', error);
      logger.error('❌ Error details:', error.message);
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
      
      logger.debug('🗑️ Course deleted from local storage:', courseId);
      return true;
      
    } catch (error) {
      logger.error('❌ Failed to delete course:', error);
      return false;
    }
  }

  /**
   * Clear all course data from local storage (for complete reset)
   */
  async clearAllCourseData() {
    try {
      logger.debug('🧹 Clearing all course data from local storage...');
      
      // Get all AsyncStorage keys
      const keys = await AsyncStorage.getAllKeys();
      
      // Find all course-related keys
      const courseKeys = keys.filter(key => key.startsWith('course_'));
      
      // Remove all course data
      if (courseKeys.length > 0) {
        await AsyncStorage.multiRemove(courseKeys);
        logger.debug('✅ Cleared', courseKeys.length, 'course data entries');
      }
      
      // Also clear course index
      await AsyncStorage.removeItem('course_index');
      
      logger.debug('✅ All course data cleared from local storage');
    } catch (error) {
      logger.error('❌ Failed to clear all course data:', error);
      throw error;
    }
  }
  
  /**
   * Cleanup expired courses for a user
   */
  async cleanupExpiredCourses(userId) {
    try {
      logger.debug('🧹 Cleaning up expired courses for user:', userId);
      
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
      
      logger.debug('✅ Cleanup completed. Removed courses:', expiredCourses.length);
      
    } catch (error) {
      logger.error('❌ Cleanup failed:', error);
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
          logger.warn('⚠️ Module missing ID, but continuing:', module);
        }
      }
    }
    
    logger.debug('✅ Course data validation passed');
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
      logger.error('Failed to get course index:', error);
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
      logger.error('Failed to update course index:', error);
    }
  }
  
  async removeCourseFromIndex(courseId) {
    try {
      const index = await this.getCourseIndex();
      delete index[courseId];
      await AsyncStorage.setItem('course_index', JSON.stringify(index));
    } catch (error) {
      logger.error('Failed to remove course from index:', error);
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
      logger.error('Failed to get storage usage:', error);
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
      logger.debug('➖ Removing course from cache:', courseId);
      
      // Get current active course IDs
      const cacheKey = `active_courses_${userId}`;
      const cachedData = await AsyncStorage.getItem(cacheKey);
      
      if (!cachedData) {
        logger.debug('ℹ️ No cache found to remove course from');
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
        logger.debug('✅ Course removed from cache');
        return true;
      } else {
        logger.debug('ℹ️ Course not found in cache');
        return false;
      }
    } catch (error) {
      logger.error('❌ Error removing course from cache:', error);
      return false;
    }
  }

  // Library Version Methods
  /**
   * Extract library versions from modules
   */
  async extractLibraryVersions(creatorId, modules) {
    if (!creatorId || !modules || modules.length === 0) {
      return { sessions: {}, modules: {} };
    }
    
    try {
      // Import library resolution service dynamically to avoid circular dependencies
      const { default: libraryResolutionService } = await import('../services/libraryResolutionService');
      return await libraryResolutionService.extractLibraryVersions(creatorId, modules);
    } catch (error) {
      logger.error('❌ Error extracting library versions:', error);
      return { sessions: {}, modules: {} };
    }
  }

  /**
   * Handle library version update
   */
  async handleLibraryVersionUpdate(courseId, versionCheck, userId) {
    const updateKey = `${courseId}_${userId}`;
    
    // Prevent duplicate updates
    if (this._versionChecksInProgress?.has(updateKey)) {
      logger.debug('⚠️ Library version update already in progress for:', courseId);
      return;
    }
    
    this._versionChecksInProgress.add(updateKey);
    
    try {
      logger.debug('🔄 Handling library version update for course:', courseId);
      
      // Mark as updating
      await firestoreService.updateUserCourseVersionStatus(userId, courseId, {
        update_status: 'updating',
        lastUpdated: Date.now()
      });
      
      // Start background refresh
      this.startLibraryBackgroundUpdate(courseId, versionCheck, userId);
      
    } catch (error) {
      logger.error('❌ Error handling library version update:', error);
      this._versionChecksInProgress.delete(updateKey);
    }
  }

  /**
   * Start background library update
   */
  async startLibraryBackgroundUpdate(courseId, versionCheck, userId) {
    const updateKey = `${courseId}_${userId}`;
    
    if (this._backgroundUpdatesInProgress.has(updateKey)) {
      logger.debug('⚠️ Library background update already in progress for:', courseId);
      return;
    }
    
    this._backgroundUpdatesInProgress.add(updateKey);
    
    setTimeout(async () => {
      try {
        logger.debug('🔄 LIBRARY BACKGROUND UPDATE: Starting for:', courseId);
        
        // Re-download course (will get updated library items)
        await this.downloadCourse(courseId, userId);
        
        logger.debug('✅ LIBRARY BACKGROUND UPDATE: Download completed');
        
        // Update status
        await firestoreService.updateUserCourseVersionStatus(userId, courseId, {
          update_status: 'ready',
          lastUpdated: Date.now()
        });
        
        // Notify UI
        this.notifyUpdateComplete(courseId, null);
        
        // Clean up
        this._backgroundUpdatesInProgress.delete(updateKey);
        if (this._versionChecksInProgress) {
          this._versionChecksInProgress.delete(updateKey);
        }
        
      } catch (error) {
        logger.error('❌ LIBRARY BACKGROUND UPDATE FAILED:', error);
        
        await firestoreService.updateUserCourseVersionStatus(userId, courseId, {
          update_status: 'failed'
        });
        
        this.notifyUpdateFailed(courseId, error);
        
        // Clean up
        this._backgroundUpdatesInProgress.delete(updateKey);
        if (this._versionChecksInProgress) {
          this._versionChecksInProgress.delete(updateKey);
        }
      }
    }, 1000);
  }

  // Version System Methods
  /**
   * Check if course version needs update
   */
  async checkVersionMismatch(courseId, localCourseData, userId) {
    try {
      logger.debug('🔍 Checking version mismatch for course:', courseId);
      
      const latestCourseData = await firestoreService.getCourse(courseId);
      if (!latestCourseData) {
        logger.debug('❌ Course not found in database:', courseId);
        return { needsUpdate: false };
      }
      const publishedVersion = latestCourseData.published_version ?? latestCourseData.version;
      const userCourse = await firestoreService.getUserCourseVersion(userId, courseId);
      const downloadedVersion = userCourse?.downloaded_version || localCourseData.publishedVersion || localCourseData.version || 'unknown';
      
      logger.debug('📊 Version comparison (published_version):', {
        courseId,
        publishedVersion,
        downloadedVersion
      });
      
      if (publishedVersion !== downloadedVersion) {
        logger.debug('🔄 Version mismatch detected:', { publishedVersion, downloadedVersion });
        return {
          needsUpdate: true,
          newVersion: publishedVersion,
          currentVersion: downloadedVersion
        };
      }
      
      logger.debug('✅ Versions match, no update needed');
      return { needsUpdate: false };
      
    } catch (error) {
      logger.error('❌ Error checking version mismatch:', error);
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
          logger.debug('⚠️ handleVersionUpdate: Update already in progress, skipping duplicate call');
          return;
        }
      } catch (error) {
        logger.error('❌ Error checking update status:', error);
      }
    }
    
    try {
      logger.debug('🔄 Handling version update for course:', courseId, 'to version:', newVersion);
      
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
      
      logger.debug('✅ Version update process started');
      
    } catch (error) {
      logger.error('❌ Error handling version update:', error);
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
      logger.debug('⚠️ Background update already in progress for:', courseId, 'skipping duplicate');
      return;
    }
    
    // Mark as in progress
    this._backgroundUpdatesInProgress.add(updateKey);
    
    logger.debug('🚀 STARTING BACKGROUND UPDATE:', {
      courseId,
      newVersion,
      userId,
      timestamp: new Date().toISOString()
    });
    
    // Run in background to not block UI
    setTimeout(async () => {
      try {
        logger.debug('🔄 BACKGROUND UPDATE STEP 1: Starting download for:', courseId);
        
        // Download new content
        await this.downloadCourse(courseId, userId);
        logger.debug('✅ BACKGROUND UPDATE STEP 2: Download completed for:', courseId);
        
        // Program media downloads disabled
        
        // Update user's version
        await firestoreService.updateUserCourseVersionStatus(userId, courseId, {
          downloaded_version: newVersion,
          update_status: 'ready'
        });
        logger.debug('✅ BACKGROUND UPDATE STEP 3: Status updated to ready for:', courseId);
        
        // Notify UI that update is complete
        this.notifyUpdateComplete(courseId, newVersion);
        logger.debug('✅ BACKGROUND UPDATE STEP 4: UI notification sent for:', courseId);
        
        logger.debug('🎉 BACKGROUND UPDATE COMPLETED SUCCESSFULLY:', courseId);
        
        // Clean up: remove from in-progress tracking
        this._backgroundUpdatesInProgress.delete(updateKey);
        if (this._versionChecksInProgress) {
          this._versionChecksInProgress.delete(updateKey);
        }
        
      } catch (error) {
        logger.error('❌ BACKGROUND UPDATE FAILED:', {
          courseId,
          error: error.message,
          stack: error.stack,
          timestamp: new Date().toISOString()
        });
        
        // Mark as failed
        await firestoreService.updateUserCourseVersionStatus(userId, courseId, {
          update_status: 'failed'
        });
        logger.debug('❌ BACKGROUND UPDATE: Status marked as failed for:', courseId);
        
        // Notify UI of failure
        this.notifyUpdateFailed(courseId, error);
        logger.debug('❌ BACKGROUND UPDATE: UI failure notification sent for:', courseId);
        
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
    logger.debug('📢 Update complete notification for:', courseId, 'version:', newVersion);
    logger.debug('🔍 CALLBACK DEBUG: onUpdateComplete exists?', !!this.onUpdateComplete);
    
    // Notify the update event manager
    updateEventManager.notifyUpdateComplete(courseId);
    
    // Direct UI update - Firestore status is already updated in startBackgroundUpdate
    if (this.onUpdateComplete) {
      logger.debug('🔄 CALLBACK DEBUG: Calling onUpdateComplete callback...');
      this.onUpdateComplete(courseId, newVersion, 'ready'); // Pass status
      logger.debug('✅ CALLBACK DEBUG: onUpdateComplete callback called');
    } else {
      logger.debug('❌ CALLBACK DEBUG: onUpdateComplete callback not set!');
    }
  }
  
  /**
   * Notify UI of update failure
   */
  notifyUpdateFailed(courseId, error) {
    logger.debug('📢 Update failed notification for:', courseId, 'error:', error.message);
    
    // Direct UI update - simplest approach
    if (this.onUpdateFailed) {
      this.onUpdateFailed(courseId, error, 'failed'); // Pass status
    }
  }
  
  /**
   * Set UI refresh callbacks
   */
  setUIUpdateCallbacks(onUpdateComplete, onUpdateFailed) {
    logger.debug('🔧 CALLBACK SETUP: Setting UI update callbacks...');
    logger.debug('🔍 CALLBACK SETUP DEBUG: onUpdateComplete provided?', !!onUpdateComplete);
    logger.debug('🔍 CALLBACK SETUP DEBUG: onUpdateFailed provided?', !!onUpdateFailed);
    
    this.onUpdateComplete = onUpdateComplete;
    this.onUpdateFailed = onUpdateFailed;
    
    logger.debug('✅ CALLBACK SETUP: UI update callbacks set successfully');
  }
}

export default new CourseDownloadService();
