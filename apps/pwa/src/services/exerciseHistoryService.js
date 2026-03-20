// Exercise History Service - Manages exercise and session history subcollections
import logger from '../utils/logger.js';
import apiClient, { WakeApiError } from '../utils/apiClient';
import { enqueue } from '../utils/offlineQueue';

class ExerciseHistoryService {
  /**
   * Add session data to both exercise and session history.
   * All writes are handled server-side by POST /workout/complete.
   */
  async addSessionData(userId, sessionData, plannedSnapshot = null) {
    try {
      logger.debug('📚 Adding session data to exercise history:', sessionData.sessionId);

      if (!sessionData || !sessionData.exercises || !Array.isArray(sessionData.exercises)) {
        throw new Error('Invalid session data structure');
      }

      const body = {
        sessionId: sessionData.sessionId,
        courseId: sessionData.courseId,
        courseName: sessionData.courseName,
        sessionName: sessionData.sessionName,
        completedAt: sessionData.completedAt,
        duration: sessionData.duration,
        userNotes: sessionData.userNotes,
        exercises: sessionData.exercises,
        planned: plannedSnapshot ? {
          exercises: plannedSnapshot.exercises,
        } : undefined,
      };

      const res = await apiClient.post('/workout/complete', body);

      logger.debug('✅ Session data added to exercise history');
      return res?.data ?? null;
    } catch (error) {
      if (error instanceof WakeApiError && error.status === 0) {
        enqueue({ method: 'POST', path: '/workout/complete', body: {
          sessionId: sessionData.sessionId,
          courseId: sessionData.courseId,
          courseName: sessionData.courseName,
          sessionName: sessionData.sessionName,
          completedAt: sessionData.completedAt,
          duration: sessionData.duration,
          userNotes: sessionData.userNotes,
          exercises: sessionData.exercises,
          planned: plannedSnapshot ? { exercises: plannedSnapshot.exercises } : undefined,
        }, priority: 'high' });
        logger.debug('[exerciseHistoryService] session queued for offline replay');
        return { queued: true };
      }
      logger.error('❌ Error adding session data to exercise history:', error);
      throw error;
    }
  }

  /**
   * Get exercise history for a specific exercise key.
   */
  async getExerciseHistory(userId, exerciseKey) {
    try {
      const res = await apiClient.get(`/workout/exercises/${encodeURIComponent(exerciseKey)}/history`);
      return { sessions: res?.data ?? [] };
    } catch (error) {
      logger.error('❌ Error getting exercise history:', error);
      return { sessions: [] };
    }
  }

  /**
   * Get last performance document for an exercise.
   * Now embedded in GET /workout/daily response per exercise — kept for legacy callers.
   */
  async getLastExercisePerformance(userId, exerciseKey) {
    try {
      const res = await apiClient.get(`/workout/exercises/${encodeURIComponent(exerciseKey)}/history`);
      const sessions = res?.data ?? [];
      if (sessions.length === 0) return null;
      const latest = sessions[0];
      return {
        sessionId: latest.sessionId ?? null,
        date: latest.date ?? null,
        sets: latest.sets ?? [],
        bestSet: latest.sets?.reduce((best, s) => {
          const w = Number(s.weight) || 0;
          return w > (Number(best?.weight) || 0) ? s : best;
        }, null) ?? null,
      };
    } catch (error) {
      logger.error('❌ Error getting last exercise performance:', { userId, exerciseKey, error });
      return null;
    }
  }

  /**
   * Get a single session history document.
   */
  async getSessionHistory(userId, sessionId) {
    try {
      const res = await apiClient.get(`/workout/sessions/${sessionId}`);
      return res?.data ?? null;
    } catch (error) {
      logger.error('❌ Error getting session history:', error);
      return null;
    }
  }

  /**
   * Get session history for a user with pagination support.
   * @returns {Promise<{sessions: Object, nextPageToken: string|null, hasMore: boolean}>}
   */
  async getSessionHistoryPaginated(userId, pageLimit = 20, pageToken = null) {
    try {
      logger.debug('📊 Getting paginated session history for user:', userId, { limit: pageLimit });
      const sessions = {};
      let token = pageToken;
      let hasMore = false;
      let fetched = 0;

      do {
        const params = { ...(token ? { pageToken: token } : {}) };
        const res = await apiClient.get('/workout/sessions', { params });
        const page = res?.data ?? [];
        page.forEach(s => {
          sessions[s.completionId] = { ...s, id: s.completionId, completionDocId: s.completionId };
        });
        fetched += page.length;
        token = res?.nextPageToken ?? null;
        hasMore = res?.hasMore ?? false;
      } while (hasMore && fetched < pageLimit && token);

      logger.debug('✅ Retrieved paginated session history:', Object.keys(sessions).length, 'sessions');
      return { sessions, nextPageToken: token, hasMore };
    } catch (error) {
      logger.error('❌ Error getting paginated session history:', error);
      return { sessions: {}, nextPageToken: null, hasMore: false };
    }
  }

  /**
   * Get all exercise keys that have completed sessions, with PR data.
   * Returns array of exercise key strings.
   */
  async getAllExerciseKeysFromExerciseHistory(userId) {
    try {
      logger.debug('📊 Getting all exercise keys from exercise history for user:', userId);
      const res = await apiClient.get('/progress/prs');
      const prs = res?.data ?? [];
      logger.debug('✅ Found', prs.length, 'unique exercise keys from exercise history');
      return prs.map((pr) => pr.exerciseKey);
    } catch (error) {
      logger.error('❌ Error getting exercise keys from exercise history:', error);
      return [];
    }
  }

  /**
   * Get dates (YYYY-MM-DD) that have a completed session for a course within a date range.
   * Used by DailyWorkoutScreen calendar to show green days.
   */
  async getDatesWithCompletedSessionsForCourse(userId, courseId, startDate, endDate) {
    try {
      const start = typeof startDate === 'string' ? startDate : new Date(startDate).toISOString().slice(0, 10);
      const end = typeof endDate === 'string' ? endDate : new Date(endDate).toISOString().slice(0, 10);
      const res = await apiClient.get('/workout/calendar', { params: { courseId, startDate: start, endDate: end } });
      return res?.data ?? [];
    } catch (error) {
      logger.error('❌ getDatesWithCompletedSessionsForCourse:', error);
      return [];
    }
  }
}

export default new ExerciseHistoryService();
