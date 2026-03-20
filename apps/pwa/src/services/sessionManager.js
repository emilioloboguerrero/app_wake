// Ultra-Simple Session Manager
import AsyncStorage from '@react-native-async-storage/async-storage';
import apiClient from '../utils/apiClient';
import logger from '../utils/logger.js';

class SessionManager {
  
  /**
   * Clear all cached progress for a specific user (for sign out)
   */
  async clearUserCache(userId) {
    try {
      // Get all keys and filter for this user's progress
      const keys = await AsyncStorage.getAllKeys();
      const userProgressKeys = keys.filter(key => key.startsWith(`progress_${userId}_`));
      
      // Remove all user-specific progress caches
      await Promise.all(userProgressKeys.map(key => AsyncStorage.removeItem(key)));
      
    } catch (error) {
      logger.error('❌ Error clearing session progress cache:', error);
    }
  }

  /**
   * Start a new session
   */
  async startSession(userId, courseId, sessionId, sessionName) {
    try {
      const sessionData = {
        sessionId,
        userId,
        courseId,
        sessionName,
        startTime: new Date().toISOString(),
        exercises: []
      };
      
      await AsyncStorage.setItem('current_session', JSON.stringify(sessionData));
      apiClient.put('/workout/checkpoint', sessionData).catch(e => logger.error('⚠️ Checkpoint save failed (start):', e));
      return sessionData;
    } catch (error) {
      logger.error('❌ Error starting session:', error);
      throw error;
    }
  }
  
  /**
   * Add exercise data to current session
   */
  async addExerciseData(exerciseId, exerciseName, sets) {
    try {
      const sessionData = await this.getCurrentSession();
      if (!sessionData) {
        throw new Error('No active session');
      }
      
      // Find or create exercise
      let exercise = sessionData.exercises.find(e => e.exerciseId === exerciseId);
      if (!exercise) {
        exercise = {
          exerciseId,
          exerciseName,
          sets: []
        };
        sessionData.exercises.push(exercise);
      }
      
      // Update sets
      exercise.sets = sets;
      
      // Save locally and sync to cloud checkpoint
      await AsyncStorage.setItem('current_session', JSON.stringify(sessionData));
      apiClient.put('/workout/checkpoint', sessionData).catch(e => logger.error('⚠️ Checkpoint save failed (exercise):', e));

    } catch (error) {
      logger.error('❌ Error adding exercise data:', error);
      throw error;
    }
  }
  
  /**
   * Get current session from local storage
   */
  async getCurrentSession() {
    try {
      const local = await AsyncStorage.getItem('current_session');
      if (local) return JSON.parse(local);
      // Fallback: check cloud checkpoint (cross-device recovery)
      try {
        const res = await apiClient.get('/workout/checkpoint');
        const checkpoint = res?.data ?? null;
        if (checkpoint) {
          await AsyncStorage.setItem('current_session', JSON.stringify(checkpoint));
          return checkpoint;
        }
      } catch (e) {
        logger.error('⚠️ Cloud checkpoint fetch failed:', e);
      }
      return null;
    } catch (error) {
      logger.error('❌ Error getting current session:', error);
      return null;
    }
  }
  
  /**
   * Cancel current session
   */
  async cancelSession() {
    try {
      await AsyncStorage.removeItem('current_session');
      apiClient.delete('/workout/checkpoint').catch(e => logger.error('⚠️ Checkpoint delete failed (cancel):', e));
    } catch (error) {
      logger.error('❌ Error cancelling session:', error);
    }
  }
  
  /**
   * Clear all progress for a course (for testing/reset)
   */
  async clearProgress(userId, courseId) {
    try {
      // Clear local progress
      const key = `progress_${userId}_${courseId}`;
      await AsyncStorage.removeItem(key);
      
      // Clear any current session
      await AsyncStorage.removeItem('current_session');
      
    } catch (error) {
      logger.error('❌ Error clearing progress:', error);
    }
  }
}

export default new SessionManager();
