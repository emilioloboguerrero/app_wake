import apiClient from '../utils/apiClient';
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
  async getUserCourseState(userId, courseId, cachedUserDoc) {
    try {
      const userDoc = cachedUserDoc || await apiClient.get('/users/me').then(r => r?.data ?? null);
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
   * @param {Object} [cachedUserDoc] - Cached user doc to avoid /users/me call
   * @returns {Promise<boolean>} True if user owns the course
   */
  async checkUserOwnsCourse(userId, courseId, cachedUserDoc) {
    try {
      const { ownsCourse } = await this.getUserCourseState(userId, courseId, cachedUserDoc);
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
   * @param {Object} [cachedUserDoc] - Cached user doc to avoid /users/me call
   * @returns {Promise<Object>} Free access result
   */
  async grantFreeAccess(userId, courseId, cachedUserDoc) {
    try {
      const existingPurchase = await this.checkUserOwnsCourse(userId, courseId, cachedUserDoc);

      if (existingPurchase) {
        return {
          success: false,
          error: 'Ya tienes este curso en tu biblioteca',
          code: 'ALREADY_PURCHASED'
        };
      }

      await apiClient.post('/users/me/move-course', { courseId });

      return {
        success: true,
        message: 'Acceso gratuito otorgado exitosamente',
      };

    } catch (error) {
      logger.error('Error granting free access:', error);
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

      let result;
      try {
        result = await apiClient.post('/payments/subscription', { courseId, payer_email: payerEmail });
      } catch (error) {
        if (error.code === 'CONFLICT') {
          return {
            success: false,
            requiresAlternateEmail: true,
            error: error.message || "Por favor ingresa tu correo de Mercado Pago",
          };
        }
        throw error;
      }

      const initPoint = result?.data?.init_point;
      if (!initPoint) {
        throw new Error("Error creating subscription checkout");
      }

      return {
        success: true,
        checkoutURL: initPoint,
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
   * Prepare purchase - creates payment preference or subscription checkout link.
   * @param {string} userId - User ID
   * @param {string} courseId - Course ID
   * @param {Object} opts - { accessDuration, payerEmail } — pass from component to skip API round-trips
   * @returns {Promise<Object>} Checkout result
   */
  async preparePurchase(userId, courseId, { accessDuration, payerEmail } = {}) {
    try {
      if (accessDuration === "monthly") {
        return await this.prepareSubscription(userId, courseId, payerEmail || null);
      }

      const result = await apiClient.post('/payments/preference', { courseId });
      const initPoint = result?.data?.init_point;
      if (!initPoint) {
        throw new Error("Error creating payment");
      }
      return {
        success: true,
        checkoutURL: initPoint,
      };
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
   * Prepare a bundle one-time-payment preference. OTP always grants 1 year.
   */
  async prepareBundlePurchase(bundleId) {
    try {
      const result = await apiClient.post('/payments/bundle-preference', { bundleId });
      const initPoint = result?.data?.init_point;
      if (!initPoint) throw new Error('Error creating bundle payment');
      return { success: true, checkoutURL: initPoint };
    } catch (error) {
      return { success: false, error: error.message || 'Error preparing bundle payment' };
    }
  }

  /**
   * Prepare a bundle subscription checkout. Always monthly recurring.
   */
  async prepareBundleSubscription(bundleId, payerEmail) {
    try {
      if (!payerEmail) {
        return {
          success: false,
          requiresAlternateEmail: true,
          error: 'Necesitamos el correo de tu cuenta de Mercado Pago',
        };
      }
      let result;
      try {
        result = await apiClient.post('/payments/bundle-subscription', {
          bundleId,
          payer_email: payerEmail,
        });
      } catch (error) {
        if (error.code === 'CONFLICT') {
          return {
            success: false,
            requiresAlternateEmail: true,
            error: error.message || 'Por favor ingresa tu correo de Mercado Pago',
          };
        }
        throw error;
      }
      const initPoint = result?.data?.init_point;
      if (!initPoint) throw new Error('Error creating bundle subscription checkout');
      return { success: true, checkoutURL: initPoint };
    } catch (error) {
      return { success: false, error: error.message || 'Error preparing bundle subscription' };
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
        return await this.getUserActiveCourses(userId);
      }

      const userDoc = await apiClient.get('/users/me').then(r => r?.data ?? null);
      if (!userDoc) {
        return [];
      }

      const userCourses = userDoc.courses || {};
      const now = new Date();

      // Return flat shape matching getUserActiveCourses
      return Object.entries(userCourses).map(([courseId, e]) => {
        const isActive = e.status === 'active';
        const isNotExpired = e.expires_at ? new Date(e.expires_at) > now : true;
        const isCancelled = e.status === 'cancelled';

        return {
          id: courseId,
          courseId,
          title: e.title || 'Curso sin titulo',
          image_url: e.image_url || '',
          creatorName: e.creatorName || null,
          discipline: e.discipline || 'General',
          status: e.status,
          access_duration: e.access_duration,
          expires_at: e.expires_at,
          purchased_at: e.purchased_at,
          deliveryType: e.deliveryType,
          is_trial: e.is_trial,
          isActive: isActive && isNotExpired,
          isExpired: !isNotExpired && !isCancelled,
          isCompleted: false,
        };
      });
    } catch (error) {
      logger.error('Error getting user courses:', error);
      return [];
    }
  }
}

export default new PurchaseService();
