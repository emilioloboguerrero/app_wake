// Purchase service for Wake Web App
import { getUser, getCourse, addCourseToUser, startTrialForCourse } from './firestoreService';
import { calculateExpirationDate } from '../utils/durationHelper';

class PurchaseService {
  /**
   * Check if a course entry is active
   * @param {Object} courseEntry - Course entry from user document
   * @returns {boolean} True if course is active
   */
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
   * Get course info for a user along with ownership state
   * @param {string} userId
   * @param {string} courseId
   * @returns {Promise<{ownsCourse: boolean, courseData: Object|null, trialHistory: Object|null}>}
   */
  async getUserCourseState(userId, courseId) {
    try {
      const userDoc = await getUser(userId);
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
      const courseDetails = await getCourse(courseId);
      
      if (!courseDetails) {
        return {
          success: false,
          error: 'El programa no fue encontrado',
          code: 'COURSE_NOT_FOUND'
        };
      }
      
      // Validate required fields
      if (!courseDetails.access_duration) {
        return {
          success: false,
          error: 'Programa sin duración de acceso',
          code: 'INVALID_ACCESS_DURATION'
        };
      }

      // Calculate expiration using helper
      const expirationDate = calculateExpirationDate(courseDetails.access_duration);

      // Add course to user document
      await addCourseToUser(
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
      const courseDetails = await getCourse(courseId);
      if (!courseDetails) {
        return {
          success: false,
          error: 'El programa no fue encontrado',
          code: 'COURSE_NOT_FOUND',
        };
      }

      const result = await startTrialForCourse(
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
      const courseDetails = await getCourse(courseId);
      
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
}

export default new PurchaseService();



