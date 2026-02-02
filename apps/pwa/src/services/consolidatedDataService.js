// Use storage adapter for platform-agnostic storage
import storageAdapter from '../utils/storageAdapter';
import firestoreService from './firestoreService';
import hybridDataService from './hybridDataService';
import purchaseService from './purchaseService';
import courseDownloadService from '../data-management/courseDownloadService';
import logger from '../utils/logger';

class ConsolidatedDataService {
  constructor() {
    this.cache = new Map();
    this.cacheTimeout = 5 * 60 * 1000; // 5 minutes cache
  }

  getCachedData(key) {
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      // Simple validation: check if data structure is valid
      if (this.validateCacheData(cached.data)) {
        logger.log('✅ Using cached data for key:', key);
        return cached.data;
      } else {
        logger.warn('⚠️ Cached data is invalid, clearing cache');
        this.cache.delete(key);
      }
    }
    return null;
  }

  validateCacheData(data) {
    if (!data || typeof data !== 'object') return false;
    if (!Array.isArray(data.courses)) return false;
    if (typeof data.downloadedData !== 'object') return false;
    
    // Check if courses have required fields
    return data.courses.every(course => 
      course && 
      course.id && 
      course.title && 
      typeof course.title === 'string'
    );
  }

  setCachedData(key, data) {
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });
    logger.log('💾 Cached data for key:', key);
  }

  async getUserCoursesWithDetails(userId) {
    try {
      const cacheKey = `user_courses_${userId}`;
      
      // Check cache first
      const cachedData = this.getCachedData(cacheKey);
      let courses;
      let downloadedData = {};
      let isFromCache = false;

      if (cachedData) {
        // Use cached courses metadata for performance
        courses = cachedData.courses;
        downloadedData = cachedData.downloadedData || {};
        isFromCache = true;
        logger.log('✅ Using cached courses metadata, but checking versions...');
      } else {
        logger.log('🔄 Fetching fresh user courses data...');
        
        // Get user's active courses only (MainScreen should only show active courses)
        // For AllPurchasedCoursesScreen, it will call getUserPurchasedCourses with includeInactive=true directly
        const purchasedCourses = await purchaseService.getUserPurchasedCourses(userId, false);
        logger.log('📚 Active purchased courses:', purchasedCourses.length);
        
        // Log course details for debugging
        if (purchasedCourses.length > 0) {
          logger.log('📋 Course details:', purchasedCourses.map(c => ({
            courseId: c.courseId || c.id,
            title: c.courseDetails?.title || c.title,
            status: c.status || c.courseData?.status,
            expires_at: c.expires_at || c.courseData?.expires_at,
            isActive: c.isActive
          })));
        } else {
          logger.warn('⚠️ No purchased courses found for user:', userId);
        }

        // Get course details from hybrid service
        // Add timeout to prevent hanging if storage is slow
        let allCourses = [];
        try {
          const coursesPromise = hybridDataService.loadCourses();
          const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('loadCourses timeout')), 5000)
          );
          allCourses = await Promise.race([coursesPromise, timeoutPromise]);
          logger.log('📖 All available courses from hybrid service:', allCourses.length);
        } catch (coursesError) {
          logger.warn('⚠️ Error loading courses from hybrid service (non-critical):', coursesError.message);
          // Continue with empty array - we'll use courseDetails from purchaseService instead
          allCourses = [];
        }

        // Map purchased courses to include details
        // If course details aren't found in hybrid service, use the courseDetails from purchaseService
        courses = purchasedCourses
          .map(purchased => {
            const courseId = purchased.courseId || purchased.id?.replace(`${userId}-`, '') || purchased.id;
            const courseDetails = allCourses.find(course => course.id === courseId) || purchased.courseDetails;
            
            // If we still don't have course details, try to get them from Firestore
            if (!courseDetails || !courseDetails.title) {
              logger.warn(`⚠️ Course ${courseId} not found in hybrid service, using purchase data`);
              // Use basic data from purchaseService
              return {
                id: courseId,
                courseId: courseId,
                title: purchased.courseDetails?.title || purchased.title || 'Curso sin título',
                image_url: purchased.courseDetails?.image_url || purchased.imageUrl || '',
                description: purchased.courseDetails?.description || purchased.description || 'No hay descripción disponible',
                creatorName: purchased.courseDetails?.creatorName || purchased.creator_name || 'Desconocido',
                purchasedAt: purchased.purchasedAt || purchased.paid_at?.toDate?.() || null,
                userCourseData: purchased.courseData || null,
                trialInfo: purchased.trialInfo || null,
                trialHistory: purchased.trialHistory || null,
                isTrialCourse: purchased.isTrialCourse || false,
                status: purchased.status || purchased.courseData?.status,
                expires_at: purchased.expires_at || purchased.courseData?.expires_at,
              };
            }
            
            // We have course details from hybrid service
            return { 
              ...courseDetails, 
              courseId: courseDetails.id || courseId, // Add courseId property for MainScreen compatibility
              purchasedAt: purchased.purchasedAt || purchased.paid_at?.toDate?.() || null,
              userCourseData: purchased.courseData || null,
              trialInfo: purchased.trialInfo || null,
              trialHistory: purchased.trialHistory || null,
              isTrialCourse: purchased.isTrialCourse || false,
              status: purchased.status || purchased.courseData?.status,
              expires_at: purchased.expires_at || purchased.courseData?.expires_at,
            };
          })
          .filter(Boolean); // Remove any null entries

        logger.log('✅ Mapped courses with details:', courses.length);
        
        // Log final course list for debugging
        if (courses.length > 0) {
          logger.log('📚 Final courses list:', courses.map(c => ({
            id: c.id || c.courseId,
            title: c.title,
            hasImage: !!c.image_url
          })));
        }
      }

      // CRITICAL FIX: Always set current user ID and check versions, even when using cache
      // This ensures version updates are detected in production builds
      courseDownloadService.setCurrentUserId(userId);

      // Return immediately with cached downloaded data for instant UI
      // All checks happen in background (non-blocking)
      const freshDownloadedData = { ...downloadedData }; // Start with cached data
      
      // Do fast check (skip version checks) in background to populate if no cache
      // Then do full check with version validation
      Promise.all(
        courses.map(async (course) => {
          try {
            // Fast check first (skip version checks) - instant
            const fastDownloaded = await courseDownloadService.getCourseData(course.id, true);
            if (fastDownloaded) {
              freshDownloadedData[course.id] = {
                ...fastDownloaded,
                status: fastDownloaded.status || 'ready',
                // Ensure imageUrl is always set
                imageUrl: fastDownloaded.imageUrl || course.image_url || course.imageUrl
              };
            } else {
              // FIX: If course not downloaded locally, still provide basic data from Firestore
              // This ensures purchased courses show up even if download hasn't completed
              freshDownloadedData[course.id] = {
                status: 'ready',
                imageUrl: course.image_url || course.imageUrl,
                courseData: {
                  ...course,
                  // Include basic course structure
                }
              };
              logger.log(`⚠️ Course ${course.id} not downloaded locally, using Firestore data`);
            }
            
            // Then do full check with version validation (slower, but in background)
            const fullDownloaded = await courseDownloadService.getCourseData(course.id, false);
            if (fullDownloaded) {
              freshDownloadedData[course.id] = {
                ...fullDownloaded,
                status: fullDownloaded.status || 'ready',
                // Ensure imageUrl is always set
                imageUrl: fullDownloaded.imageUrl || course.image_url || course.imageUrl
              };
            }
          } catch (error) {
            logger.error('❌ Error in background refresh for course:', course.id, error);
            // FIX: Even on error, provide fallback data
            if (!freshDownloadedData[course.id]) {
              freshDownloadedData[course.id] = {
                status: 'ready',
                imageUrl: course.image_url || course.imageUrl,
                courseData: course
              };
            }
          }
        })
      ).then(() => {
        // Update cache in background after refresh completes
        const cacheKey = `user_courses_${userId}`;
        this.setCachedData(cacheKey, { courses, downloadedData: freshDownloadedData });
        logger.log('✅ Background refresh of downloaded data completed');
      }).catch(error => {
        logger.error('❌ Error in background refresh:', error);
      });

      // Return immediately with courses and cached downloaded data
      // Background refresh will update cache later
      return { courses, downloadedData: freshDownloadedData };
    } catch (error) {
      logger.error('❌ Error in getUserCoursesWithDetails:', error);
      throw error;
    }
  }

  clearUserCache(userId) {
    const cacheKey = `user_courses_${userId}`;
    this.cache.delete(cacheKey);
    logger.log('🗑️ Cleared cache for user:', userId);
  }

  clearAllCache() {
    this.cache.clear();
    logger.log('🗑️ Cleared all consolidated cache');
  }
}

export default new ConsolidatedDataService();