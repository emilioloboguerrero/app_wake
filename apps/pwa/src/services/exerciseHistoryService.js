// Exercise History Service - Manages exercise and session history subcollections
import logger from '../utils/logger.js';
import apiClient from '../utils/apiClient';

class ExerciseHistoryService {
  /**
   * Add session data to both exercise and session history.
   * All writes are handled server-side by POST /workout/complete.
   */
  async addSessionData(userId, sessionData, plannedSnapshot = null) {
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
    return res?.queued ? { queued: true } : (res?.data ?? null);
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
      const sessions = {};
      let token = pageToken;
      let hasMore = false;
      let fetched = 0;

      do {
        const params = { limit: pageLimit, ...(token ? { pageToken: token } : {}) };
        const res = await apiClient.get('/workout/sessions', { params });
        const page = res?.data ?? [];
        page.forEach(s => {
          const key = s.completionId || s.id;
          sessions[key] = { ...s, id: key, completionDocId: key, completionId: key };
        });
        fetched += page.length;
        token = res?.nextPageToken ?? null;
        hasMore = res?.hasMore ?? false;
      } while (hasMore && fetched < pageLimit && token);

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
      const res = await apiClient.get('/progress/prs');
      const prs = res?.data ?? [];
      return prs.map((pr) => pr.exerciseKey);
    } catch (error) {
      logger.error('❌ Error getting exercise keys from exercise history:', error);
      return [];
    }
  }

  /**
   * Update userNotes on an existing session history document.
   */
  async updateSessionNotes(userId, sessionId, userNotes) {
    try {
      await apiClient.patch(`/workout/sessions/${sessionId}/notes`, { userNotes });
      return true;
    } catch (error) {
      logger.error('Error updating session notes:', error);
      throw error;
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
      logger.error('getDatesWithCompletedSessionsForCourse:', error);
      return [];
    }
  }
}

export default new ExerciseHistoryService();
