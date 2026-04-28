// Ultra-Simple Session Manager
import AsyncStorage from '@react-native-async-storage/async-storage';
import apiClient from '../utils/apiClient';
import logger from '../utils/logger.js';

const CHECKPOINT_DEBOUNCE_MS = 1500;
const CHECKPOINT_MAX_WAIT_MS = 5000;

class SessionManager {
  #pendingCheckpoint = null;
  #checkpointTimer = null;
  #checkpointMaxWaitTimer = null;
  // AbortController for the in-flight PUT /workout/checkpoint. Without this,
  // a debounced PUT that's already on the wire when the user taps "complete"
  // can land AFTER the activeSession DELETE and resurrect the doc. The user
  // then sees a phantom "Continuar sesión" banner on DailyWorkoutScreen.
  #checkpointInFlight = null;

  #scheduleCheckpoint(sessionData) {
    this.#pendingCheckpoint = sessionData;
    if (this.#checkpointTimer) clearTimeout(this.#checkpointTimer);
    this.#checkpointTimer = setTimeout(() => this.#flushCheckpoint(), CHECKPOINT_DEBOUNCE_MS);
    if (!this.#checkpointMaxWaitTimer) {
      this.#checkpointMaxWaitTimer = setTimeout(() => this.#flushCheckpoint(), CHECKPOINT_MAX_WAIT_MS);
    }
  }

  #flushCheckpoint() {
    if (this.#checkpointTimer) { clearTimeout(this.#checkpointTimer); this.#checkpointTimer = null; }
    if (this.#checkpointMaxWaitTimer) { clearTimeout(this.#checkpointMaxWaitTimer); this.#checkpointMaxWaitTimer = null; }
    const payload = this.#pendingCheckpoint;
    if (!payload) return;
    this.#pendingCheckpoint = null;
    const controller = new AbortController();
    this.#checkpointInFlight = controller;
    apiClient.put('/workout/checkpoint', payload, { signal: controller.signal })
      .catch(e => {
        if (e?.code === 'REQUEST_CANCELLED') return; // expected on completion race
        logger.error('Checkpoint save failed:', e);
      })
      .finally(() => {
        if (this.#checkpointInFlight === controller) this.#checkpointInFlight = null;
      });
  }

  #cancelPendingCheckpoint() {
    if (this.#checkpointTimer) { clearTimeout(this.#checkpointTimer); this.#checkpointTimer = null; }
    if (this.#checkpointMaxWaitTimer) { clearTimeout(this.#checkpointMaxWaitTimer); this.#checkpointMaxWaitTimer = null; }
    this.#pendingCheckpoint = null;
    if (this.#checkpointInFlight) {
      this.#checkpointInFlight.abort();
      this.#checkpointInFlight = null;
    }
  }

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

      // Also clear localStorage checkpoint (survives IndexedDB eviction on Safari iOS)
      try { localStorage.removeItem('wake_session_checkpoint'); } catch {}
    } catch (error) {
      logger.error('Error clearing session progress cache:', error);
    }
  }

  /**
   * Start a new session
   */
  async startSession(userId, courseId, sessionId, sessionName) {
    try {
      const now = new Date().toISOString();
      const sessionData = {
        sessionId,
        userId,
        courseId,
        sessionName,
        startedAt: now,
        startTime: now,
        currentExerciseIndex: 0,
        currentSetIndex: 0,
        exercises: [],
        completedSets: {},
        elapsedSeconds: 0
      };

      await AsyncStorage.setItem('current_session', JSON.stringify(sessionData));
      this.#scheduleCheckpoint(sessionData);
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
      this.#scheduleCheckpoint(sessionData);

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
        const checkpoint = res?.data?.checkpoint ?? null;
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
      try { localStorage.removeItem('wake_session_checkpoint'); } catch {}
      this.#cancelPendingCheckpoint();
      apiClient.delete('/workout/checkpoint').catch(e => logger.error('Checkpoint delete failed (cancel):', e));
    } catch (error) {
      logger.error('Error cancelling session:', error);
    }
  }
  
  /**
   * Drop any queued checkpoint write (call before/after /workout/complete
   * so a pending debounced PUT cannot revive a just-deleted checkpoint doc).
   */
  cancelPendingCheckpoint() {
    this.#cancelPendingCheckpoint();
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
