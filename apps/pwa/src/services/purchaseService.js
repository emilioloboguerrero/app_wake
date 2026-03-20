import apiClient from '../utils/apiClient';
import { createError } from '../utils/errorHandler';
import { calculateExpirationDate } from '../utils/durationHelper';
import apiService from './apiService';
import logger from '../utils/logger';

class PurchaseService {
  isCourseEntryActive(courseEntry) {
    if (!courseEntry) return false;

    const expiresAt = courseEntry.expires_at ? new Date(courseEntry.expires_at) : null;
    const now = new Date();
    const isNotExpired = !expiresAt || expiresAt > now;

    if (!isNotExpired) return false;
    if (courseEntry.status === 'active') return true;
    if (courseEntry.is_trial) return true;

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

      const courseDetails = await apiClient.get(`/workout/programs/${courseId}`).then(r => r?.data ?? null);
      if (!courseDetails) {
        return {
          success: false,
          error: 'El programa no fue encontrado',
          code: 'COURSE_NOT_FOUND',
        };
      }

      const result = await apiClient.post(`/users/me/courses/${courseId}/trial`, {
        courseDetails,
        durationInDays: durationDays,
      });
      return result?.data ?? { success: false, error: 'Error al iniciar la prueba gratuita', code: 'TRIAL_ERROR' };
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
      const userDoc = await apiClient.get('/users/me/full').then(r => r?.data ?? null);
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
      const existingPurchase = await this.checkUserOwnsCourse(userId, courseId);

      if (existingPurchase) {
        return {
          success: false,
          error: 'Ya tienes este curso en tu biblioteca',
          code: 'ALREADY_PURCHASED'
        };
      }

      const courseDetails = await apiClient.get(`/workout/programs/${courseId}`).then(r => r?.data ?? null);

      if (!courseDetails) {
        throw createError('firebase/not-found', 'El programa no fue encontrado');
      }

      if (!courseDetails.access_duration) {
        throw createError('validation/invalid-input', 'Programa sin duración de acceso');
      }

      const expirationDate = calculateExpirationDate(courseDetails.access_duration);

      await apiClient.post('/users/me/move-course', {
        courseId,
        expirationDate,
        accessDuration: courseDetails.access_duration,
        courseDetails,
      });

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
      const courseDetails = await apiClient.get(`/workout/programs/${courseId}`).then(r => r?.data ?? null);

      if (!courseDetails) {
        return {
          success: false,
          error: "Course not found",
        };
      }

      if (courseDetails.access_duration === "monthly") {
        const userDoc = await apiClient.get('/users/me/full').then(r => r?.data ?? null);
        const payerEmail = userDoc?.email || null;
        return await this.prepareSubscription(userId, courseId, payerEmail);
      } else {
        const body = { userId, courseId };
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

  async getUserActiveCourses(userId) {
    return apiService.getUserActiveCourses(userId);
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
        return await this.getUserActiveCourses(userId);
      }

      const userDoc = await apiClient.get('/users/me/full').then(r => r?.data ?? null);
      if (!userDoc) {
        return [];
      }

      const userCourses = userDoc.courses || {};

      const now = new Date();

      let coursesWithDetails = [];
      if (Object.keys(userCourses).length > 0) {
        coursesWithDetails = await Promise.all(
          Object.entries(userCourses).map(async ([courseId, courseData]) => {
            const courseDetails = await apiClient.get(`/workout/programs/${courseId}`).then(r => r?.data ?? null);

            const isActive = courseData.status === 'active';
            const isNotExpired = new Date(courseData.expires_at) > now;
            const isCancelled = courseData.status === 'cancelled';

            return {
              id: `${userId}-${courseId}`,
              courseId,
              courseData,
              courseDetails: courseDetails || { title: 'Curso no encontrado', id: courseId },
              isActive: isActive && isNotExpired,
              isExpired: !isNotExpired && !isCancelled,
              isCompleted: false,
              status: courseData.status,
              paid_at: { toDate: () => new Date(courseData.purchased_at) },
              expires_at: courseData.expires_at
            };
          })
        );
      }

      const courseIdsFromUser = new Set(Object.keys(userCourses));
      try {
        const orphaned = await apiClient.get('/workout/client-programs', { params: { orphaned: true } }).then(r => r?.data ?? []);
        if (orphaned.length > 0) {
          coursesWithDetails = [...coursesWithDetails, ...orphaned];
        }
      } catch (err) {
        logger.warn('⚠️ getUserPurchasedCourses: orphan fallback failed:', err?.message);
      }

      return coursesWithDetails;
    } catch (error) {
      logger.error('❌ Error getting user courses:', error);
      return [];
    }
  }
}

export default new PurchaseService();
