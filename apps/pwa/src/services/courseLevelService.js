import apiClient from '../utils/apiClient';
import logger from '../utils/logger.js';

class CourseLevelService {
  async setLevel(courseId, level) {
    try {
      const res = await apiClient.patch(`/users/me/courses/${courseId}/level`, { level });
      return res?.data ?? res;
    } catch (error) {
      logger.error('Error al guardar el nivel del curso:', error);
      throw error;
    }
  }
}

export default new CourseLevelService();
