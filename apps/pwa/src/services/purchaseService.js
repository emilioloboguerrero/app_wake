// Purchase service for Wake
// Simple Epayco WebView integration

import firestoreService from './firestoreService';
import { createError } from '../utils/errorHandler';
import { calculateExpirationDate } from '../utils/durationHelper';
import logger from '../utils/logger';

class PurchaseService {
  isCourseEntryActive(courseEntry) {
    logger.log(`🔍 [isCourseEntryActive] Checking course entry:`, {
      hasEntry: !!courseEntry,
      status: courseEntry?.status,
      is_trial: courseEntry?.is_trial,
      expires_at: courseEntry?.expires_at,
      expires_at_parsed: courseEntry?.expires_at ? new Date(courseEntry.expires_at).toISOString() : null
    });
    
    if (!courseEntry) {
      logger.log(`❌ [isCourseEntryActive] No course entry - returning false`);
      return false;
    }
    
    const expiresAt = courseEntry.expires_at ? new Date(courseEntry.expires_at) : null;
    const now = new Date();
    const isNotExpired = !expiresAt || expiresAt > now;
    
    logger.log(`🔍 [isCourseEntryActive] Expiration check:`, {
      expiresAt: expiresAt ? expiresAt.toISOString() : null,
      now: now.toISOString(),
      isNotExpired,
      expiresAt_gt_now: expiresAt ? expiresAt > now : 'N/A (null)'
    });

    if (!isNotExpired) {
      logger.log(`❌ [isCourseEntryActive] Course expired - returning false`);
      return false;
    }

    if (courseEntry.status === 'active') {
      logger.log(`✅ [isCourseEntryActive] Course is active - returning true`);
      return true;
    }

    if (courseEntry.is_trial) {
      logger.log(`✅ [isCourseEntryActive] Course is trial - returning true`);
      return true;
    }

    logger.log(`❌ [isCourseEntryActive] Course not active and not trial - returning false`);
    return false;
  }

  /**
   * Start a local free trial for a course
   * @param {string} userId - User ID
   * @param {string} courseId - Course ID
   * @param {number} durationDays - Trial duration in days
   * @returns {Promise<Object>} Trial result
   */
  async startLocalTrial(userId, courseId, durationDays) {
    try {
      if (!durationDays || durationDays <= 0) {
        return {
          success: false,
          error: 'Duración de prueba inválida',
          code: 'INVALID_DURATION',
        };
      }

      const { ownsCourse, trialHistory, courseData } = await this.getUserCourseState(userId, courseId);
      if (ownsCourse && !courseData?.is_trial) {
        return {
          success: false,
          error: 'Ya tienes acceso a este programa',
          code: 'ALREADY_OWNED',
        };
      }

      if (trialHistory?.consumed || courseData?.trial_consumed) {
        return {
          success: false,
          error: 'Ya usaste la prueba gratuita de este programa',
          code: 'TRIAL_ALREADY_USED',
        };
      }

      // Get course details required for display metadata
      const courseDetails = await firestoreService.getCourse(courseId);
      if (!courseDetails) {
        return {
          success: false,
          error: 'El programa no fue encontrado',
          code: 'COURSE_NOT_FOUND',
        };
      }

      const result = await firestoreService.startTrialForCourse(
        userId,
        courseId,
        courseDetails,
        durationDays
      );

      return result;
    } catch (error) {
      logger.error('❌ Error starting local trial:', error);
      return {
        success: false,
        error: error.message || 'Error al iniciar la prueba gratuita',
        code: 'TRIAL_ERROR',
      };
    }
  }

  /**
   * Get course info for a user along with ownership state
   * @param {string} userId
   * @param {string} courseId
   * @returns {Promise<{ownsCourse: boolean, courseData: Object|null, trialHistory: Object|null}>}
   */
  async getUserCourseState(userId, courseId) {
    try {
      const userDoc = await firestoreService.getUser(userId);
      if (!userDoc) {
        return { ownsCourse: false, courseData: null, trialHistory: null };
      }

      const courseData = userDoc.courses?.[courseId] || null;
      const trialHistory = userDoc.free_trial_history?.[courseId] || null;

      return {
        ownsCourse: this.isCourseEntryActive(courseData),
        courseData,
        trialHistory,
      };
    } catch (error) {
      logger.error('Error getting user course state:', error);
      return { ownsCourse: false, courseData: null, trialHistory: null };
    }
  }

  /**
   * Check if user already owns a specific course
   * @param {string} userId - User ID
   * @param {string} courseId - Course ID
   * @returns {Promise<boolean>} True if user owns the course
   */
  async checkUserOwnsCourse(userId, courseId) {
    try {
      const { ownsCourse } = await this.getUserCourseState(userId, courseId);
      return ownsCourse;
    } catch (error) {
      logger.error('Error checking course ownership:', error);
      return false;
    }
  }

  /**
   * Grant free access to a course (for draft programs or admin users)
   * @param {string} userId - User ID
   * @param {string} courseId - Course ID
   * @returns {Promise<Object>} Free access result
   */
  async grantFreeAccess(userId, courseId) {
    try {
      logger.debug(`🆓 Granting free access: User ${userId} → Course ${courseId}`);
      
      // Check if user already owns this course
      const existingPurchase = await this.checkUserOwnsCourse(userId, courseId);
      
      if (existingPurchase) {
        return {
          success: false,
          error: 'Ya tienes este curso en tu biblioteca',
          code: 'ALREADY_PURCHASED'
        };
      }

      // Get course details
      const courseDetails = await firestoreService.getCourse(courseId);
      
      if (!courseDetails) {
        throw createError('firebase/not-found', 'El programa no fue encontrado');
      }
      
      // Validate required fields
      if (!courseDetails.access_duration) {
        throw createError('validation/invalid-input', 'Programa sin duración de acceso');
      }

      // Calculate expiration using helper
      const expirationDate = calculateExpirationDate(courseDetails.access_duration);

      // Add course to user document
      await firestoreService.addCourseToUser(
        userId, 
        courseId, 
        expirationDate, 
        courseDetails.access_duration,
        courseDetails
      );

      logger.debug('✅ Free access granted successfully');

      return {
        success: true,
        message: 'Acceso gratuito otorgado exitosamente',
        expirationDate
      };

    } catch (error) {
      logger.error('❌ Error granting free access:', error);
      return {
        success: false,
        error: error.message || 'Error al otorgar acceso gratuito',
        code: error.code || 'FREE_ACCESS_ERROR'
      };
    }
  }


  /**
   * Prepare subscription checkout - creates subscription checkout link
   * @param {string} userId - User ID
   * @param {string} courseId - Course ID
   * @param {string} payerEmail - Mercado Pago email from login
   * @returns {Promise<Object>} Checkout result
   */
  async prepareSubscription(userId, courseId, payerEmail) {
    try {
      if (!payerEmail) {
        return {
          success: false,
          requiresAlternateEmail: true,
          error: "Necesitamos el correo de tu cuenta de Mercado Pago",
        };
      }

      const requestBody = { userId, courseId, payer_email: payerEmail };
      logger.log('💳 [prepareSubscription] Request to createSubscriptionCheckout', {
        params: requestBody,
        hasUserId: !!userId,
        hasCourseId: !!courseId,
        hasPayerEmail: !!payerEmail,
      });

      const response = await fetch(
        "https://us-central1-wolf-20b8b.cloudfunctions.net/createSubscriptionCheckout",
        {
          method: "POST",
          headers: {"Content-Type": "application/json"},
          body: JSON.stringify(requestBody),
        }
      );

      let result;
      let responseText;
      try {
        responseText = await response.text();
        result = JSON.parse(responseText);
      } catch (jsonError) {
        logger.error('❌ [prepareSubscription] Failed to parse response:', {
          error: jsonError.message,
          responseText: responseText,
          status: response.status,
        });
        // If response is not valid JSON, return error
        return {
          success: false,
          error: `Error del servidor (${response.status}): ${response.statusText}. Respuesta: ${responseText?.substring(0, 200)}`,
        };
      }

      if (response.status === 409) {
        return {
          success: false,
          requiresAlternateEmail: result.requireAlternateEmail || true,
          error: result.error || "Por favor ingresa tu correo de Mercado Pago",
        };
      }

      if (!response.ok || !result.success) {
        throw new Error(result.error || "Error creating subscription checkout");
      }

      return {
        success: true,
        checkoutURL: result.init_point,
      };
    } catch (error) {
      logger.error('❌ [prepareSubscription] Exception:', error.message);
      return {
        success: false,
        error: error.message || "Error preparing subscription",
      };
    }
  }

  /**
   * Prepare purchase - creates unique payment window
   * Routes to subscription or one-time payment based on course access_duration
   * @param {string} userId - User ID
   * @param {string} courseId - Course ID
   * @returns {Promise<Object>} Checkout result
   */
  async preparePurchase(userId, courseId) {
    try {
      logger.log('💳 [preparePurchase] Input', {
        userId: userId ?? null,
        courseId: courseId ?? null,
        hasUserId: !!userId,
        hasCourseId: !!courseId,
      });

      const courseDetails = await firestoreService.getCourse(courseId);

      if (!courseDetails) {
        return {
          success: false,
          error: "Course not found",
        };
      }

      if (courseDetails.access_duration === "monthly") {
        const userDoc = await firestoreService.getUser(userId);
        const payerEmail = userDoc?.email || null;
        logger.log('💳 [preparePurchase] Calling purchase web function: createSubscriptionCheckout', {
          endpoint: 'createSubscriptionCheckout',
          params: { userId, courseId, payer_email: payerEmail },
          hasUserId: !!userId,
          hasCourseId: !!courseId,
          hasPayerEmail: !!payerEmail,
        });
        return await this.prepareSubscription(userId, courseId, payerEmail);
      } else {
        const body = { userId, courseId };
        logger.log('💳 [preparePurchase] Calling purchase web function: createPaymentPreference', {
          endpoint: 'createPaymentPreference',
          params: body,
          hasUserId: !!userId,
          hasCourseId: !!courseId,
        });
        const response = await fetch(
          "https://us-central1-wolf-20b8b.cloudfunctions.net/createPaymentPreference",
          {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify(body),
          }
        );

        const result = await response.json();

        if (!result.success) {
          throw new Error(result.error || "Error creating payment");
        }

        return {
          success: true,
          checkoutURL: result.init_point,
        };
      }
    } catch (error) {
      return {
        success: false,
        error: error.message || "Error preparing payment",
      };
    }
  }

  /**
   * Get all purchased courses for a user
   * @param {string} userId - User ID
   * @returns {Promise<Array>} Array of purchased courses with details
   */
  async getUserActiveCourses(userId) {
    try {
      return await firestoreService.getUserActiveCourses(userId);
    } catch (error) {
      logger.error('Error getting active courses:', error);
      return [];
    }
  }

  /**
   * Get all courses (active, cancelled, expired) for AllPurchasedCoursesScreen
   * @param {string} userId - User ID
   * @param {boolean} includeInactive - Whether to include inactive courses
   * @returns {Promise<Array>} Array of all user courses
   */
  async getUserPurchasedCourses(userId, includeInactive = false) {
    try {
      if (!includeInactive) {
        // For MainScreen, use the efficient active-only method (includes orphan fallback)
        return await this.getUserActiveCourses(userId);
      }
      
      // For AllPurchasedCoursesScreen, get all courses from user document
      const userDoc = await firestoreService.getUser(userId);
      if (!userDoc) {
        logger.debug('❌ getUserPurchasedCourses: User document not found for:', userId);
        return [];
      }
      
      const userCourses = userDoc.courses || {};
      logger.debug('🔍 getUserPurchasedCourses: User courses object:', {
        userId,
        coursesCount: Object.keys(userCourses).length,
        courseIds: Object.keys(userCourses)
      });
      
      const now = new Date();
      
      // Get all courses with status information
      let coursesWithDetails = [];
      if (Object.keys(userCourses).length > 0) {
        coursesWithDetails = await Promise.all(
          Object.entries(userCourses).map(async ([courseId, courseData]) => {
            logger.debug('🔍 Processing course:', courseId, courseData);
            const courseDetails = await firestoreService.getCourse(courseId);
            
            // Determine status
            const isActive = courseData.status === 'active';
            const isNotExpired = new Date(courseData.expires_at) > now;
            const isCancelled = courseData.status === 'cancelled';
            
            return {
              id: `${userId}-${courseId}`, // Create a unique ID
              courseId,
              courseData,
              courseDetails: courseDetails || { title: 'Curso no encontrado', id: courseId },
              isActive: isActive && isNotExpired,
              isExpired: !isNotExpired && !isCancelled,
              isCompleted: false, // We can add completion logic later
              status: courseData.status,
              paid_at: { toDate: () => new Date(courseData.purchased_at) }, // Mock the old format
              expires_at: courseData.expires_at
            };
          })
        );
      }

      // Merge orphaned one-on-one programs from client_programs (same fallback as getUserActiveCourses)
      const courseIdsFromUser = new Set(Object.keys(userCourses));
      try {
        const orphaned = await firestoreService.getOrphanedOneOnOnePrograms(userId, courseIdsFromUser);
        if (orphaned.length > 0) {
          coursesWithDetails = [...coursesWithDetails, ...orphaned];
          logger.debug('📱 getUserPurchasedCourses: merged', orphaned.length, 'orphaned one-on-one programs');
        }
      } catch (err) {
        logger.warn('⚠️ getUserPurchasedCourses: orphan fallback failed:', err?.message);
      }
      
      logger.debug('✅ getUserPurchasedCourses: Returning', coursesWithDetails.length, 'courses');
      return coursesWithDetails;
    } catch (error) {
      logger.error('❌ Error getting user courses:', error);
      return [];
    }
  }
}

export default new PurchaseService();