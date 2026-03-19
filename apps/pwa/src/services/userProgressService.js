import apiClient from '../utils/apiClient';
import logger from '../utils/logger.js';

class UserProgressService {
  async getCourseProgress(userId, courseId) {
    try {
      logger.log('📊 Getting course progress:', { userId, courseId });
      const result = await apiClient.get(`/workout/courses/${courseId}/progress`);
      logger.log('✅ Course progress retrieved');
      return result?.data ?? null;
    } catch (error) {
      logger.error('❌ Error getting course progress:', error);
      return null;
    }
  }

  async updateCourseProgress(userId, courseId, progressData) {
    try {
      logger.log('📈 Updating course progress:', { userId, courseId });
      const result = await apiClient.patch(`/workout/courses/${courseId}/progress`, progressData);
      logger.log('✅ Course progress updated');
      return result?.data;
    } catch (error) {
      logger.error('❌ Error updating course progress:', error);
      throw error;
    }
  }

  async updateLastSessionPerformed(userId, courseId, sessionId, sessionData) {
    try {
      logger.log('💾 Updating last session performed:', { userId, courseId, sessionId });
      const result = await apiClient.post(`/workout/courses/${courseId}/progress/last-session`, { sessionId, sessionData });
      logger.log('✅ Last session performed updated');
      return result?.data;
    } catch (error) {
      logger.error('❌ Error updating last session performed:', error);
      throw error;
    }
  }

  async getAllCourseProgress(userId) {
    try {
      logger.log('📊 Getting all course progress for user:', userId);
      const result = await apiClient.get('/workout/progress');
      logger.log('✅ All course progress retrieved');
      return result?.data ?? {};
    } catch (error) {
      logger.error('❌ Error getting all course progress:', error);
      return {};
    }
  }
}

export default new UserProgressService();
