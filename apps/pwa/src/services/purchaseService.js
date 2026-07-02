import apiClient from '../utils/apiClient';
import apiService from './apiService';
import logger from '../utils/logger';
import analyticsService from './analyticsService';
import { isCourseEntryActive } from '../utils/courseAccess';

class PurchaseService {
  isCourseEntryActive(courseEntry) {
    return isCourseEntryActive(courseEntry);
  }

  /**
   * Default payment provider by country. Colombia keeps MercadoPago (PSE/Nequi/
   * COP); everyone else — including unknown/empty country — goes to Polar
   * (international cards, USD). A UI toggle can override this per-purchase.
   * @param {string|null|undefined} country ISO2 code from users/{id}.country
   * @returns {'mercadopago'|'polar'}
   */
  resolveDefaultProvider(country) {
    return (typeof country === 'string' && country.trim().toUpperCase() === 'CO')
      ? 'mercadopago'
      : 'polar';
  }

  /**
   * Create a Polar hosted-checkout session (international cards, USD).
   * @param {string} courseId
   * @param {'subscription'|'one_time'} paymentType
   * @returns {Promise<Object>} { success, checkoutURL } | { success:false, ... }
   */
  async preparePolarCheckout(courseId, paymentType) {
    try {
      const result = await apiClient.post('/payments/polar/checkout', { courseId, paymentType });
      const checkoutURL = result?.data?.checkout_url;
      if (!checkoutURL) throw new Error('Error creating international checkout');
      analyticsService.track('subscription.checkout.created', {
        course_id: courseId, surface: 'pwa_web', kind: 'course', provider: 'polar',
      });
      return { success: true, checkoutURL };
    } catch (error) {
      if (error.code === 'CAPACITY_FULL') {
        return { success: false, capacityFull: true, error: error.message || 'Cupos agotados' };
      }
      analyticsService.track('subscription.checkout.create_failed', {
        course_id: courseId, surface: 'pwa_web', kind: 'course', provider: 'polar',
        error_code: error?.code || error?.message || 'unknown',
      });
      return { success: false, error: error.message || 'Error preparing payment' };
    }
  }

  /**
   * Get course info for a user along with ownership state
   * @param {string} userId
   * @param {string} courseId
   * @returns {Promise<{ownsCourse: boolean, courseData: Object|null}>}
   */
  async getUserCourseState(userId, courseId, cachedUserDoc) {
    try {
      const userDoc = cachedUserDoc || await apiClient.get('/users/me').then(r => r?.data ?? null);
      if (!userDoc) {
        return { ownsCourse: false, courseData: null };
      }

      const courseData = userDoc.courses?.[courseId] || null;

      return {
        ownsCourse: this.isCourseEntryActive(courseData),
        courseData,
      };
    } catch (error) {
      logger.error('Error getting user course state:', error);
      return { ownsCourse: false, courseData: null };
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
  async prepareSubscription(userId, courseId, payerEmail, surface) {
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
        result = await apiClient.post('/payments/subscription', {
          courseId,
          payer_email: payerEmail,
          ...(surface ? { surface } : {}),
        });
      } catch (error) {
        if (error.code === 'CAPACITY_FULL') {
          return {
            success: false,
            capacityFull: true,
            error: error.message || "Cupos agotados",
          };
        }
        if (error.code === 'CONFLICT') {
          return {
            success: false,
            requiresAlternateEmail: true,
            error: error.message || "Por favor ingresa tu correo de Mercado Pago",
          };
        }
        analyticsService.track('subscription.checkout.create_failed', {
          course_id: courseId, surface: surface || 'pwa_web', kind: 'course',
          error_code: error?.code || error?.message || 'unknown',
        });
        throw error;
      }

      const initPoint = result?.data?.init_point;
      if (!initPoint) {
        throw new Error("Error creating subscription checkout");
      }

      analyticsService.track('subscription.checkout.created', {
        course_id: courseId, surface: surface || 'pwa_web', kind: 'course',
        subscription_id: result?.data?.subscription_id ?? null,
      });

      return {
        success: true,
        checkoutURL: initPoint,
        subscriptionId: result?.data?.subscription_id || null,
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
  async preparePurchase(userId, courseId, { accessDuration, payerEmail, provider } = {}) {
    try {
      try {
        analyticsService.track('program.purchase_started', {
          course_id: courseId || null,
          access_duration: accessDuration || 'otp',
          kind: 'course',
          provider: provider || 'mercadopago',
        });
      } catch {}

      // International path: Polar hosted checkout (subscription or one-time).
      if (provider === 'polar') {
        return await this.preparePolarCheckout(
          courseId,
          accessDuration === 'monthly' ? 'subscription' : 'one_time'
        );
      }

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
        capacityFull: error.code === 'CAPACITY_FULL',
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
      try {
        analyticsService.track('program.purchase_started', {
          bundle_id: bundleId || null,
          access_duration: 'otp',
          kind: 'bundle',
        });
      } catch {}
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
  async prepareBundleSubscription(bundleId, payerEmail, surface) {
    try {
      try {
        analyticsService.track('program.purchase_started', {
          bundle_id: bundleId || null,
          access_duration: 'monthly',
          kind: 'bundle',
        });
      } catch {}
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
          ...(surface ? { surface } : {}),
        });
      } catch (error) {
        if (error.code === 'CONFLICT') {
          return {
            success: false,
            requiresAlternateEmail: true,
            error: error.message || 'Por favor ingresa tu correo de Mercado Pago',
          };
        }
        analyticsService.track('subscription.checkout.create_failed', {
          bundle_id: bundleId, surface: surface || 'pwa_web', kind: 'bundle',
          error_code: error?.code || error?.message || 'unknown',
        });
        throw error;
      }
      const initPoint = result?.data?.init_point;
      if (!initPoint) throw new Error('Error creating bundle subscription checkout');
      analyticsService.track('subscription.checkout.created', {
        bundle_id: bundleId, surface: surface || 'pwa_web', kind: 'bundle',
        subscription_id: result?.data?.subscription_id ?? null,
      });
      return {
        success: true,
        checkoutURL: initPoint,
        subscriptionId: result?.data?.subscription_id || null,
      };
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

      // Return flat shape matching getUserActiveCourses. isActive routes
      // through the shared courseAccess helper so this list agrees with
      // useUserCourses and HoyScreen.
      return Object.entries(userCourses).map(([courseId, e]) => {
        const isCancelled = e.status === 'cancelled';
        const isNotExpired = e.expires_at ? new Date(e.expires_at) > now : true;

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
          isActive: isCourseEntryActive(e),
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
