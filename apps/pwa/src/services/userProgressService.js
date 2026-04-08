import apiClient from '../utils/apiClient';
import logger from '../utils/logger.js';

class UserProgressService {
  async getCourseProgress(userId, courseId) {
    try {
      const result = await apiClient.get(`/workout/courses/${courseId}/progress`);
      return result?.data ?? null;
    } catch (error) {
      logger.error('❌ Error getting course progress:', error);
      return null;
    }
  }

  async updateCourseProgress(userId, courseId, progressData) {
    try {
      const result = await apiClient.patch(`/workout/courses/${courseId}/progress`, progressData);
      return result?.data;
    } catch (error) {
      logger.error('❌ Error updating course progress:', error);
      throw error;
    }
  }

  async updateLastSessionPerformed(userId, courseId, sessionId, sessionData) {
    try {
      const result = await apiClient.post(`/workout/courses/${courseId}/progress/last-session`, { sessionId, sessionData });
      return result?.data;
    } catch (error) {
      logger.error('❌ Error updating last session performed:', error);
      throw error;
    }
  }

  async getAllCourseProgress(userId) {
    try {
      const result = await apiClient.get('/workout/progress');
      return result?.data ?? {};
    } catch (error) {
      logger.error('❌ Error getting all course progress:', error);
      return {};
    }
  }
}

export default new UserProgressService();
