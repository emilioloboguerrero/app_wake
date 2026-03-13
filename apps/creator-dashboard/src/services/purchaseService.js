import { getUser, getCourse, addCourseToUser, startTrialForCourse } from './firestoreService';
import { calculateExpirationDate } from '../utils/durationHelper';
import logger from '../utils/logger';

class PurchaseService {
  /**
   * Returns true if a course entry grants current access.
   */
  isCourseEntryActive(courseEntry) {
    if (!courseEntry) return false;
    const expiresAt = courseEntry.expires_at ? new Date(courseEntry.expires_at) : null;
    if (expiresAt && expiresAt <= new Date()) return false;
    return courseEntry.status === 'active' || courseEntry.is_trial === true;
  }

  /**
   * Returns the user's ownership state for a specific course.
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
      logger.error('Error getting user course state:', error);
      return { ownsCourse: false, courseData: null, trialHistory: null };
    }
  }

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
   * Grants free access to a course (used for draft programs or admin grants).
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

      const courseDetails = await getCourse(courseId);
      if (!courseDetails) {
        return {
          success: false,
          error: 'El programa no fue encontrado',
          code: 'COURSE_NOT_FOUND'
        };
      }

      if (!courseDetails.access_duration) {
        return {
          success: false,
          error: 'Programa sin duración de acceso',
          code: 'INVALID_ACCESS_DURATION'
        };
      }

      const expirationDate = calculateExpirationDate(courseDetails.access_duration);
      await addCourseToUser(userId, courseId, expirationDate, courseDetails.access_duration, courseDetails);

      return {
        success: true,
        message: 'Acceso gratuito otorgado exitosamente',
        expirationDate
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
   * Starts a local free trial for a course.
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

      const courseDetails = await getCourse(courseId);
      if (!courseDetails) {
        return {
          success: false,
          error: 'El programa no fue encontrado',
          code: 'COURSE_NOT_FOUND',
        };
      }

      return await startTrialForCourse(userId, courseId, courseDetails, durationDays);
    } catch (error) {
      logger.error('Error starting local trial:', error);
      return {
        success: false,
        error: error.message || 'Error al iniciar la prueba gratuita',
        code: 'TRIAL_ERROR',
      };
    }
  }

  /**
   * Initiates a MercadoPago subscription checkout for monthly-access courses.
   * Returns a checkout URL or a flag indicating an alternate email is needed.
   */
  async prepareSubscription(userId, courseId, payerEmail) {
    try {
      if (!payerEmail) {
        return {
          success: false,
          requiresAlternateEmail: true,
          error: 'Necesitamos el correo de tu cuenta de Mercado Pago',
        };
      }

      const response = await fetch(
        'https://us-central1-wolf-20b8b.cloudfunctions.net/createSubscriptionCheckout',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId, courseId, payer_email: payerEmail }),
        }
      );

      const result = await response.json();

      if (response.status === 409 && result.requireAlternateEmail) {
        return {
          success: false,
          requiresAlternateEmail: true,
          error: result.error || 'Por favor ingresa tu correo de Mercado Pago',
        };
      }

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Error creating subscription checkout');
      }

      return { success: true, checkoutURL: result.init_point };
    } catch (error) {
      return {
        success: false,
        error: error.message || 'Error preparing subscription',
      };
    }
  }

  /**
   * Routes to subscription or one-time payment based on course access_duration.
   * Monthly courses go through subscription; everything else through one-time payment.
   */
  async preparePurchase(userId, courseId) {
    try {
      const courseDetails = await getCourse(courseId);
      if (!courseDetails) {
        return { success: false, error: 'Course not found' };
      }

      if (courseDetails.access_duration === 'monthly') {
        return await this.prepareSubscription(userId, courseId);
      }

      const response = await fetch(
        'https://us-central1-wolf-20b8b.cloudfunctions.net/createPaymentPreference',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId, courseId }),
        }
      );

      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error || 'Error creating payment');
      }

      return { success: true, checkoutURL: result.init_point };
    } catch (error) {
      return {
        success: false,
        error: error.message || 'Error preparing payment',
      };
    }
  }
}

export default new PurchaseService();
