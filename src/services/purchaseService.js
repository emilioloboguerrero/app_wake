// Purchase service for Wake
// Simple Epayco WebView integration

import firestoreService from './firestoreService';
import { createError } from '../utils/errorHandler';
import { calculateExpirationDate } from '../utils/durationHelper';

class PurchaseService {
  isCourseEntryActive(courseEntry) {
    if (!courseEntry) return false;
    const expiresAt = courseEntry.expires_at ? new Date(courseEntry.expires_at) : null;
    const isNotExpired = !expiresAt || expiresAt > new Date();

    if (!isNotExpired) {
      return false;
    }

    if (courseEntry.status === 'active') {
      return true;
    }

    if (courseEntry.is_trial) {
      return true;
    }

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
      console.error('❌ Error starting local trial:', error);
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
      console.error('Error getting user course state:', error);
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
      console.error('Error checking course ownership:', error);
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
      console.log(`🆓 Granting free access: User ${userId} → Course ${courseId}`);
      
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

      console.log('✅ Free access granted successfully');

      return {
        success: true,
        message: 'Acceso gratuito otorgado exitosamente',
        expirationDate
      };

    } catch (error) {
      console.error('❌ Error granting free access:', error);
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

      const response = await fetch(
        "https://us-central1-wolf-20b8b.cloudfunctions.net/createSubscriptionCheckout",
        {
          method: "POST",
          headers: {"Content-Type": "application/json"},
          body: JSON.stringify({userId, courseId, payer_email: payerEmail}),
        }
      );

      const result = await response.json();

      if (response.status === 409 && result.requireAlternateEmail) {
        return {
          success: false,
          requiresAlternateEmail: true,
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
      // Get course details to check if subscription
      const courseDetails = await firestoreService.getCourse(courseId);
      
      if (!courseDetails) {
        return {
          success: false,
          error: "Course not found",
        };
      }

      // Check if subscription (monthly)
      if (courseDetails.access_duration === "monthly") {
        // Subscription - requires Mercado Pago sign-in (handled by Mercado Pago checkout)
        // Call subscription function
        return await this.prepareSubscription(userId, courseId);
      } else {
        // One-time payment - call existing function
        const response = await fetch(
          "https://us-central1-wolf-20b8b.cloudfunctions.net/createPaymentPreference",
          {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({userId, courseId}),
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
      console.error('Error getting active courses:', error);
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
        // For MainScreen, use the efficient active-only method
        return await this.getUserActiveCourses(userId);
      }
      
      // For AllPurchasedCoursesScreen, get all courses from user document
      const userDoc = await firestoreService.getUser(userId);
      if (!userDoc) return [];
      
      const userCourses = userDoc.courses || {};
      const now = new Date();
      
      // Get all courses with status information
      const coursesWithDetails = await Promise.all(
        Object.entries(userCourses).map(async ([courseId, courseData]) => {
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
      
      return coursesWithDetails;
    } catch (error) {
      console.error('❌ Error getting user courses:', error);
      return [];
    }
  }
}

export default new PurchaseService();