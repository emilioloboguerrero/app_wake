import apiClient from '../utils/apiClient';
import logger from '../utils/logger';

class PurchaseService {
  isCourseEntryActive(courseEntry) {
    if (!courseEntry) return false;
    const expiresAt = courseEntry.expires_at ? new Date(courseEntry.expires_at) : null;
    if (expiresAt && expiresAt <= new Date()) return false;
    return courseEntry.status === 'active' || courseEntry.is_trial === true;
  }

  async getUserCourseState(userId, courseId) {
    try {
      const result = await apiClient.get(`/users/${userId}/public-profile`);
      const profile = result?.data ?? {};
      const courseData = profile.courses?.[courseId] ?? null;
      return {
        ownsCourse: this.isCourseEntryActive(courseData),
        courseData,
        trialHistory: null,
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

  async grantFreeAccess(userId, courseId) {
    try {
      const result = await apiClient.post(
        `/creator/clients/${userId}/programs/${courseId}`,
        { expiresAt: null }
      );
      return {
        success: true,
        message: 'Acceso gratuito otorgado exitosamente',
        data: result?.data,
      };
    } catch (error) {
      logger.error('Error granting free access:', error);
      return {
        success: false,
        error: error.message || 'Error al otorgar acceso gratuito',
        code: error.code || 'FREE_ACCESS_ERROR',
      };
    }
  }

  async startLocalTrial(_userId, _courseId, _durationDays) {
    return {
      success: false,
      error: 'startLocalTrial no está soportado en la API. Use el flujo de pagos.',
      code: 'NOT_SUPPORTED',
    };
  }

  async prepareSubscription(userId, courseId, payerEmail) {
    try {
      if (!payerEmail) {
        return {
          success: false,
          requiresAlternateEmail: true,
          error: 'Necesitamos el correo de tu cuenta de Mercado Pago',
        };
      }

      const result = await apiClient.post('/payments/subscription', {
        courseId,
        payer_email: payerEmail,
      });

      return { success: true, checkoutURL: result?.data?.initPoint };
    } catch (error) {
      if (error.status === 409 && error.code === 'REQUIRES_ALTERNATE_EMAIL') {
        return {
          success: false,
          requiresAlternateEmail: true,
          error: error.message || 'Por favor ingresa tu correo de Mercado Pago',
        };
      }
      return {
        success: false,
        error: error.message || 'Error preparing subscription',
      };
    }
  }

  async preparePurchase(userId, courseId) {
    try {
      const programResult = await apiClient.get(`/creator/programs/${courseId}`);
      const program = programResult?.data;
      if (!program) {
        return { success: false, error: 'Course not found' };
      }

      if (program.accessDuration === 'monthly') {
        return await this.prepareSubscription(userId, courseId);
      }

      const result = await apiClient.post('/payments/preference', {
        courseId,
        accessDuration: program.accessDuration || 'monthly',
      });

      return { success: true, checkoutURL: result?.data?.initPoint };
    } catch (error) {
      return {
        success: false,
        error: error.message || 'Error preparing payment',
      };
    }
  }
}

export default new PurchaseService();
