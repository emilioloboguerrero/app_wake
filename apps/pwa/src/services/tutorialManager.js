import apiClient from '../utils/apiClient';
import logger from '../utils/logger.js';

class TutorialManager {
  async getTutorialsForScreen(userId, screenName, programId = null) {
    try {
      logger.log('🎬 Getting tutorials for:', { userId, screenName, programId });
      const params = programId ? { screenName, programId } : { screenName };
      const result = await apiClient.get('/users/me/tutorials', { params });
      return result?.data ?? [];
    } catch (error) {
      logger.error('❌ Error getting tutorials:', error);
      return [];
    }
  }

  async getProgramTutorials(userId, programId, screenName) {
    return this.getTutorialsForScreen(userId, screenName, programId);
  }

  async getGeneralTutorials(userId, screenName) {
    return this.getTutorialsForScreen(userId, screenName, null);
  }

  async markTutorialCompleted(userId, screenName, videoUrl, programId = null) {
    try {
      logger.log('✅ Marking tutorial as completed:', { userId, screenName, videoUrl, programId });
      const body = programId ? { screenName, videoUrl, programId } : { screenName, videoUrl };
      await apiClient.post('/users/me/tutorials/complete', body);
    } catch (error) {
      logger.error('❌ Error marking tutorial as completed:', error);
    }
  }

  async markProgramTutorialCompleted(userId, programId, screenName, videoUrl) {
    return this.markTutorialCompleted(userId, screenName, videoUrl, programId);
  }

  async markGeneralTutorialCompleted(userId, screenName) {
    return this.markTutorialCompleted(userId, screenName, null, null);
  }

  async hasCompletedAllTutorials(userId, screenName, programId = null) {
    try {
      const tutorials = await this.getTutorialsForScreen(userId, screenName, programId);
      return tutorials.length === 0;
    } catch (error) {
      logger.error('❌ Error checking tutorial completion:', error);
      return false;
    }
  }
}

export default new TutorialManager();
