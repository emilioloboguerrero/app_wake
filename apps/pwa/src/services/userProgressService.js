import apiClient from '../utils/apiClient';
import logger from '../utils/logger.js';

class UserProgressService {
  async getCourseProgress(userId, courseId) {
    try {
      logger.debug('📊 Getting course progress:', { userId, courseId });
      const result = await apiClient.get(`/workout/courses/${courseId}/progress`);
      logger.debug('✅ Course progress retrieved');
      return result?.data ?? null;
    } catch (error) {
      logger.error('❌ Error getting course progress:', error);
      return null;
    }
  }

  async updateCourseProgress(userId, courseId, progressData) {
    try {
      logger.debug('📈 Updating course progress:', { userId, courseId });
      const result = await apiClient.patch(`/workout/courses/${courseId}/progress`, progressData);
      logger.debug('✅ Course progress updated');
      return result?.data;
    } catch (error) {
      logger.error('❌ Error updating course progress:', error);
      throw error;
    }
  }

  async updateLastSessionPerformed(userId, courseId, sessionId, sessionData) {
    try {
      logger.debug('💾 Updating last session performed:', { userId, courseId, sessionId });
      const result = await apiClient.post(`/workout/courses/${courseId}/progress/last-session`, { sessionId, sessionData });
      logger.debug('✅ Last session performed updated');
      return result?.data;
    } catch (error) {
      logger.error('❌ Error updating last session performed:', error);
      throw error;
    }
  }

  async getAllCourseProgress(userId) {
    try {
      logger.debug('📊 Getting all course progress for user:', userId);
      const result = await apiClient.get('/workout/progress');
      logger.debug('✅ All course progress retrieved');
      return result?.data ?? {};
    } catch (error) {
      logger.error('❌ Error getting all course progress:', error);
      return {};
    }
  }
}

export default new UserProgressService();
