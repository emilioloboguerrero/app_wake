// Firestore service for Wake
import apiClient from '../utils/apiClient';
import { getMondayWeek } from '../utils/weekCalculation';
import logger from '../utils/logger';

function _wrapTimestamp(ts) {
  if (!ts || typeof ts._seconds !== 'number') return ts;
  const ms = ts._seconds * 1000 + Math.floor((ts._nanoseconds || 0) / 1e6);
  return { ...ts, toDate: () => new Date(ms), toMillis: () => ms };
}

class FirestoreService {
  // ============ USER PROFILE ============

  async createUser(userId, userData) {
    await apiClient.post('/users/me/init', userData);
  }

  async getUser(userId) {
    try {
      const result = await apiClient.get('/users/me/full');
      return result?.data ?? null;
    } catch (error) {
      if (error?.code === 'UNAUTHENTICATED') throw error;
      logger.error('[getUser] error:', error);
      return null;
    }
  }

  async updateUser(userId, userData) {
    await apiClient.patch('/users/me/full', userData);
  }

  async getPinnedTrainingCourseId(userId) {
    const userData = await this.getUser(userId);
    return userData?.pinnedTrainingCourseId ?? null;
  }

  async setPinnedTrainingCourseId(userId, courseId) {
    await apiClient.patch('/users/me', { pinnedTrainingCourseId: courseId || null });
  }

  async getPinnedNutritionAssignmentId(userId) {
    const userData = await this.getUser(userId);
    return userData?.pinnedNutritionAssignmentId ?? null;
  }

  async setPinnedNutritionAssignmentId(userId, assignmentId) {
    await apiClient.patch('/users/me', { pinnedNutritionAssignmentId: assignmentId || null });
  }

  // ============ PROGRESS TRACKING ============

  async createProgressEntry(userId, progressData) {
    const result = await apiClient.post('/progress', progressData);
    return result?.data?.id ?? null;
  }

  async updateProgressEntry(userId, progressId, progressData) {
    await apiClient.patch(`/progress/${progressId}`, progressData);
  }

  async getUserCourseProgress(userId, courseId, limitVal = 50) {
    try {
      const result = await apiClient.get('/progress/user-sessions', { params: { courseId, limitParam: limitVal } });
      return result?.data ?? [];
    } catch (error) {
      logger.error('[getUserCourseProgress] error:', error);
      return [];
    }
  }

  async getProgressSession(sessionId) {
    try {
      const result = await apiClient.get(`/progress/session/${sessionId}`);
      return result?.data ?? null;
    } catch (error) {
      logger.error('[getProgressSession] error:', error);
      return null;
    }
  }

  async getCourseModules(courseId) {
    return apiClient.get(`/workout/programs/${courseId}/modules`).then(r => r?.data ?? []);
  }

  async getSessionOverrides(programId, moduleId, sessionId) {
    return apiClient.get(`/workout/programs/${programId}/modules/${moduleId}/sessions/${sessionId}/overrides`).then(r => r?.data ?? null);
  }

  async getExerciseOverrides(programId, moduleId, sessionId, exerciseId) {
    return apiClient.get(`/workout/programs/${programId}/modules/${moduleId}/sessions/${sessionId}/exercises/${exerciseId}/overrides`).then(r => r?.data ?? null);
  }

  async getSetOverrides(programId, moduleId, sessionId, exerciseId, setId) {
    return apiClient.get(`/workout/programs/${programId}/modules/${moduleId}/sessions/${sessionId}/exercises/${exerciseId}/sets/${setId}/overrides`).then(r => r?.data ?? null);
  }


  /**
   * Get planned session for a client on a specific date (from client_sessions)
   * @param {string} userId - Client user ID
   * @param {string} courseId - Program/course ID
   * @param {Date} date - Date to check
   * @returns {Promise<Object|null>} Client session doc or null
   */
  async getPlannedSessionForDate(userId, courseId, date) {
    try {
      const dateStr = date instanceof Date ? date.toISOString().split('T')[0] : String(date).split('T')[0];
      const result = await apiClient.get('/workout/planned-session', { params: { courseId, date: dateStr } });
      return result?.data ?? null;
    } catch (error) {
      logger.debug('getPlannedSessionForDate:', error?.message);
      return null;
    }
  }

  /**
   * Get dates (YYYY-MM-DD) that have a planned session for a client in a program within a range.
   * Used by DailyWorkoutScreen calendar to show "planned" dots for one-on-one.
   * Tries indexed query first; on failure (e.g. missing composite index) falls back to client_id+program_id then filter by date in memory.
   */
  async getDatesWithPlannedSessions(userId, courseId, startDate, endDate) {
    logger.debug('[getDatesWithPlannedSessions] called', { userId, courseId, startDate, endDate });
    try {
      const result = await apiClient.get('/workout/calendar/planned', { params: { courseId, startDate, endDate } });
      return result?.data ?? [];
    } catch (error) {
      logger.error('[getDatesWithPlannedSessions] error:', error);
      return [];
    }
  }

  /**
   * Get dates (YYYY-MM-DD) that have a *planned* session which the user has completed.
   * Used for one-on-one calendar: show green on the planned day, not on the completion day.
   * Matches creator dashboard logic so we don't show completion on two different days.
   * @param {string} userId - Client user ID
   * @param {string} courseId - Program ID
   * @param {string} startDate - Start of range (YYYY-MM-DD or Date)
   * @param {string} endDate - End of range (YYYY-MM-DD or Date)
   * @returns {Promise<string[]>} Array of YYYY-MM-DD dates
   */
  async getDatesWithCompletedPlannedSessions(userId, courseId, startDate, endDate) {
    try {
      const result = await apiClient.get('/workout/calendar/completed', { params: { courseId, startDate, endDate } });
      return result?.data ?? [];
    } catch (error) {
      logger.warn('[getDatesWithCompletedPlannedSessions] error:', error?.message);
      return [];
    }
  }

  /**
   * Resolve session content for a planned session.
   * Tries client_session_content (client-specific copy) first; then plan or library.
   * @param {Object} clientSession - client_sessions doc (must have id for copy lookup)
   * @param {string} creatorId - Creator ID (for library resolution)
   * @param {Object} [options] - { minimal: true } to skip loading exercises (faster for list display)
   * @returns {Promise<Object|null>} Session with exercises (and sets per exercise) or null
   */
  async resolvePlannedSessionContent(clientSession, creatorId, options = {}) {
    try {
      const clientSessionId = clientSession?.id;
      const planSessionId = clientSession?.session_id;
      if (clientSessionId) {
        const copy = await this.getClientSessionContentCopy(clientSessionId, options);
        if (copy) {
          if (!options.minimal) {
            logger.debug('🔍 [resolvePlannedSessionContent] using client_session_content copy:', {
              clientSessionDocId: clientSessionId,
              copyId: copy.id,
              planSessionId,
              hasExercises: !!copy.exercises?.length
            });
          }
          return copy;
        }
      }

      const { plan_id, session_id, module_id, library_session_ref, program_id, client_id, date_timestamp } = clientSession;
      if (plan_id && session_id && module_id) {
        if (client_id && program_id) {
          let personalizedSession = options.preloadedWeekCopy?.sessions?.find((s) => s.id === session_id) ?? null;
          if (!personalizedSession) {
            const weekKey = clientSession.week_key
              || getMondayWeek(date_timestamp?.toDate?.() || (date_timestamp ? new Date(date_timestamp) : new Date()));
            logger.prod('[firestoreService] resolvePlannedSessionContent client_plan_content lookup:', {
              session_id,
              weekKey,
              weekKeySource: clientSession.week_key ? 'week_key_field' : 'computed_from_date',
              docId: `${client_id}_${program_id}_${weekKey}`,
            });
            const clientCopy = await this.getClientPlanContentCopy(client_id, program_id, weekKey, options);
            logger.prod('[firestoreService] resolvePlannedSessionContent clientCopy result:', {
              hasCopy: !!clientCopy,
              sessionCount: clientCopy?.sessions?.length ?? 0,
              sessionIds: clientCopy?.sessions?.map((s) => s.id) ?? [],
              lookingFor: session_id,
            });
            personalizedSession = clientCopy?.sessions?.find((s) => s.id === session_id) ?? null;
          }
          if (personalizedSession) {
            if (!options.minimal) {
              logger.debug('🔍 [resolvePlannedSessionContent] using client_plan_content session:', {
                session_id,
                resolvedId: personalizedSession.id,
                hasExercises: !!personalizedSession.exercises?.length
              });
            }
            return personalizedSession;
          }
        }
        const fromPlan = await this._resolvePlannedSessionFromPlan(plan_id, module_id, session_id, creatorId, options);
        if (fromPlan) {
          if (!options.minimal) {
            logger.debug('🔍 [resolvePlannedSessionContent] using plan/library:', {
              session_id,
              resolvedId: fromPlan.id,
              hasExercises: !!fromPlan.exercises?.length
            });
          }
          return fromPlan;
        }
      }
      if (library_session_ref && session_id) {
        let effectiveCreatorId = creatorId;
        if (!effectiveCreatorId && program_id) {
          try {
            const courseDoc = await this.getCourse(program_id);
            effectiveCreatorId = courseDoc?.creator_id || courseDoc?.creatorId || null;
          } catch (_) {
            /* ignore */
          }
        }
        if (effectiveCreatorId) {
          const fromLib = await this._resolvePlannedSessionFromLibrary(effectiveCreatorId, session_id, options);
          if (fromLib) return fromLib;
        }
        logger.warn('resolvePlannedSessionContent: library_session_ref but no creator_id');
      }
      logger.debug('🔍 [resolvePlannedSessionContent] no content resolved');
      return null;
    } catch (error) {
      logger.error('resolvePlannedSessionContent:', error);
      return null;
    }
  }

  /**
   * Single entry point: get resolved session content for a planned session on a date.
   * Order: client_sessions for date → client_session_content | plan | library.
   * @param {string} userId - Client user ID
   * @param {string} courseId - Program ID
   * @param {Date} date - Date to check
   * @param {string} [creatorIdFromCourse] - Optional creator ID (from course); resolved from course if missing
   * @returns {Promise<Object|null>} Session with exercises and sets, or null
   */
  async getPlannedSessionContentForDate(userId, courseId, date, creatorIdFromCourse = null) {
    const planned = await this.getPlannedSessionForDate(userId, courseId, date);
    if (!planned) {
      logger.debug('🔍 [getPlannedSessionContentForDate] no planned session for date, returning null');
      return null;
    }
    let creatorId = creatorIdFromCourse ?? planned.creator_id ?? null;
    if (!creatorId && planned.program_id) {
      try {
        const courseDoc = await this.getCourse(planned.program_id);
        creatorId = courseDoc?.creator_id ?? courseDoc?.creatorId ?? null;
      } catch (_) {
        /* ignore */
      }
    }
    const resolved = await this.resolvePlannedSessionContent(planned, creatorId);
    // Slot id = client_sessions doc id so PWA matching and completion use the same id
    const out = resolved ? { ...resolved, sessionIdForMatching: planned.id } : null;
    logger.debug('🔍 [getPlannedSessionContentForDate] resolved content:', {
      plannedDocId: planned.id,
      plannedSessionId: planned.session_id,
      sessionIdForMatching: out?.sessionIdForMatching,
      resolvedId: resolved?.id
    });
    return out;
  }

  /**
   * Get full session content for a slot by client_sessions doc id (for loading current session only).
   * Use when the week list was built with minimal sessions and we need full content for the selected session.
   */
  async getPlannedSessionContentBySlotId(userId, courseId, clientSessionId, creatorIdFromCourse = null) {
    try {
      const result = await apiClient.get(`/workout/client-session-content/${clientSessionId}`);
      return result?.data ?? null;
    } catch (error) {
      logger.debug('getPlannedSessionContentBySlotId:', error?.message);
      return null;
    }
  }

  /**
   * Get client session content copy (client_session_content collection).
   * Returns session with exercises and sets, or null if no copy exists.
   * @param {Object} [options] - { minimal: true } to skip loading exercises (faster for list display)
   */
  async getClientSessionContentCopy(clientSessionId, options = {}) {
    try {
      const result = await apiClient.get(`/workout/client-session-content/${clientSessionId}`);
      const data = result?.data ?? null;
      if (data && options.minimal) data.exercises = [];
      return data;
    } catch (error) {
      logger.debug('getClientSessionContentCopy:', error?.message);
      return null;
    }
  }

  /**
   * Get client plan content copy (client_plan_content collection) for one week.
   * Returns one module with sessions (each with exercises and sets), or null if no copy exists.
   * @param {Object} [options] - { minimal: true } to skip loading exercises (faster for list display)
   */
  async getClientPlanContentCopy(userId, programId, weekKey, options = {}) {
    try {
      logger.prod('[firestoreService] getClientPlanContentCopy:', { userId, programId, weekKey, minimal: !!options.minimal });
      const result = await apiClient.get(`/workout/client-plan-content/${userId}/${programId}/${weekKey}`);
      const data = result?.data ?? null;
      if (data && options.minimal && data.sessions) {
        data.sessions = data.sessions.map((s) => ({ ...s, exercises: [] }));
      }
      logger.prod('[firestoreService] getClientPlanContentCopy sessions loaded:', {
        sessionCount: data?.sessions?.length ?? 0,
        minimal: !!options.minimal,
      });
      return data;
    } catch (error) {
      logger.debug('getClientPlanContentCopy:', error?.message);
      return null;
    }
  }

  async _resolvePlannedSessionFromPlan(plan_id, module_id, session_id, creatorId = null, options = {}) {
    const result = await apiClient.get(`/workout/plans/${plan_id}/modules/${module_id}/sessions/${session_id}/full`);
    return result?.data ?? null;
  }

  async _resolvePlannedSessionFromLibrary(creatorId, session_id, options = {}) {
    const result = await apiClient.get(`/library/sessions/${session_id}`, { params: { creatorId } });
    return result?.data ?? null;
  }

  /**
   * Get client program document
   * @param {string} userId - User ID
   * @param {string} programId - Program ID
   * @returns {Promise<Object|null>} Client program data or null
   */
  async getClientProgram(userId, programId) {
    try {
      const result = await apiClient.get(`/workout/client-programs/${programId}`);
      return result?.data ?? null;
    } catch (error) {
      logger.error('Error getting client program:', error);
      return null;
    }
  }

  /**
   * Create or update client program
   * @param {string} userId - User ID
   * @param {string} programId - Program ID
   * @param {Object} clientProgramData - Client program data
   * @returns {Promise<string>} Client program document ID
   */
  async setClientProgram(userId, programId, clientProgramData) {
    const result = await apiClient.post(`/workout/client-programs/${programId}`, clientProgramData);
    return result?.data?.id;
  }

  async updateClientProgramOverride(userId, programId, path, value) {
    await apiClient.patch(`/workout/client-programs/${programId}/overrides`, { path, value });
  }

  async deleteClientProgram(userId, programId) {
    await apiClient.delete(`/workout/client-programs/${programId}`);
  }

  // Simple course management in user document (simplified)
  async addCourseToUser(userId, courseId, expirationDate, accessDuration, courseDetails) {
    try {
      await apiClient.post('/users/me/move-course', { courseId, expirationDate, accessDuration, courseDetails });
      logger.debug('✅ Course added to user document successfully');
    } catch (error) {
      logger.error('❌ Error in addCourseToUser:', error);
      throw error;
    }
  }

  /**
   * Start a free trial for a course by assigning it locally to the user
   * @param {string} userId - User ID
   * @param {string} courseId - Course ID
   * @param {Object} courseDetails - Course metadata
   * @param {number} durationInDays - Trial duration in days
   * @returns {Promise<Object>} Result of the assignment
   */
  async startTrialForCourse(userId, courseId, courseDetails, durationInDays) {
    try {
      if (!durationInDays || durationInDays <= 0) {
        return {
          success: false,
          error: 'Duración de prueba inválida',
          code: 'INVALID_TRIAL_DURATION',
        };
      }
      const result = await apiClient.post(`/users/me/courses/${courseId}/trial`, { courseDetails, durationInDays });
      return result?.data ?? { success: false, error: 'Error al iniciar la prueba gratuita', code: 'TRIAL_ERROR' };
    } catch (error) {
      logger.error('❌ Error starting trial for course:', error);
      return {
        success: false,
        error: error.message || 'Error al iniciar la prueba gratuita',
        code: 'TRIAL_ERROR',
      };
    }
  }

  /**
   * Get orphaned one-on-one programs (client_programs without users.courses entry)
   * @param {string} userId - User ID
   * @param {Set} courseIdsFromUser - Set of course IDs already in users.courses
   * @returns {Promise<Array>} Array of course entries in getUserPurchasedCourses format
   */
  async getOrphanedOneOnOnePrograms(userId, courseIdsFromUser = new Set()) {
    try {
      const result = await apiClient.get('/workout/client-programs', { params: { orphaned: true } });
      return result?.data ?? [];
    } catch (error) {
      logger.error('[getOrphanedOneOnOnePrograms] error:', error);
      return [];
    }
  }

  /**
   * Backfill users.courses with one-on-one program (repair for orphaned client_programs)
   * @param {string} userId - User ID
   * @param {string} programId - Program ID
   * @param {Object} courseData - Course metadata from courses collection
   */
  async backfillOneOnOneCourseInUserDocument(userId, programId, courseData) {
    try {
      await apiClient.post(`/users/me/courses/${programId}/backfill`, { courseData });
      logger.debug('✅ Backfilled one-on-one course in users.courses:', programId);
    } catch (err) {
      logger.error('❌ Error backfilling one-on-one course:', err);
      throw err;
    }
  }

  async removeCourseFromUser(userId, courseId) {
    try {
      await apiClient.delete(`/users/me/courses/${courseId}`);
      logger.debug('✅ Course removed from user:', courseId);
    } catch (error) {
      logger.error('❌ Error removing course from user:', error);
      throw error;
    }
  }

  async getUserActiveCourses(userId) {
    try {
      const result = await apiClient.get('/users/me/full');
      const userData = result?.data;
      if (!userData?.courses) return [];
      const now = new Date();
      return Object.entries(userData.courses)
        .filter(([, e]) => e.is_trial || (e.status === 'active' && (!e.expires_at || new Date(e.expires_at) > now)))
        .map(([courseId, e]) => {
          const isTrial = e.is_trial === true;
          const expiresAt = e.expires_at || null;
          const trialState = isTrial
            ? (expiresAt && new Date(expiresAt) > now ? 'active' : 'expired')
            : null;
          return {
            courseId,
            courseData: {
              status: e.status,
              access_duration: e.access_duration,
              expires_at: e.expires_at,
              purchased_at: e.purchased_at,
              deliveryType: e.deliveryType,
              title: e.title,
              image_url: e.image_url,
              is_trial: e.is_trial,
              trial_consumed: e.trial_consumed,
            },
            purchasedAt: e.purchased_at || null,
            courseDetails: {
              id: courseId,
              title: e.title || 'Curso sin título',
              image_url: e.image_url || '',
              discipline: e.discipline || 'General',
              creatorName: e.creatorName || null,
            },
            trialInfo: isTrial ? { state: trialState, expiresAt } : null,
            trialHistory: null,
            isTrialCourse: isTrial,
          };
        });
    } catch (error) {
      logger.error('[getUserActiveCourses] error:', error);
      return [];
    }
  }

  async updateCourseStatus(userId, courseId, status, newExpirationDate = null) {
    try {
      await apiClient.patch(`/users/me/courses/${courseId}/status`, { status, expiresAt: newExpirationDate });
      logger.debug(`✅ Updated course ${courseId} status to ${status}`);
      return true;
    } catch (error) {
      logger.error('Error updating course status:', error);
      return false;
    }
  }

  // Simple method to extend subscription
  async extendCourseSubscription(userId, courseId, newExpirationDate) {
    try {
      return await this.updateCourseStatus(userId, courseId, 'active', newExpirationDate);
    } catch (error) {
      logger.error('Error extending course subscription:', error);
      return false;
    }
  }

  // Simple method to cancel subscription
  async cancelCourseSubscription(userId, courseId) {
    try {
      return await this.updateCourseStatus(userId, courseId, 'cancelled');
    } catch (error) {
      logger.error('Error cancelling course subscription:', error);
      return false;
    }
  }

  async getCourses(userId = null) {
    try {
      const result = await apiClient.get('/courses');
      return result?.data ?? [];
    } catch (error) {
      logger.error('❌ Error in getCourses:', error);
      throw error;
    }
  }

  async getCourse(courseId) {
    return apiClient.get(`/workout/programs/${courseId}`).then(r => r?.data ?? null);
  }

  async createPurchaseLog(purchaseData) {
    try {
      logger.debug('📝 Creating purchase log...', purchaseData);
      const result = await apiClient.post('/purchases', purchaseData);
      const id = result?.data?.id ?? null;
      logger.debug('✅ Purchase log created with ID:', id);
      return id;
    } catch (error) {
      logger.error('❌ Error creating purchase log:', error);
      throw error;
    }
  }

  async getCommunityPosts() {
    const result = await apiClient.get('/community/posts');
    return result?.data ?? [];
  }

  async createCommunityPost(userId, postData) {
    await apiClient.post('/community/posts', postData);
  }

  // Version System Methods
  /**
   * Update user course version status
   */
  async updateUserCourseVersionStatus(userId, courseId, statusData) {
    try {
      await apiClient.patch(`/users/me/courses/${courseId}/version`, statusData);
      logger.debug('✅ User course version status updated');
    } catch (error) {
      logger.error('❌ Error updating user course version status:', error);
      throw error;
    }
  }

  /**
   * Get user course version info
   */
  async getUserCourseVersion(userId, courseId) {
    try {
      const result = await apiClient.get('/users/me/full');
      return result?.data?.courses?.[courseId] ?? null;
    } catch (error) {
      logger.error('❌ Error getting user course version:', error);
      throw error;
    }
  }

  async saveAccountDeletionFeedback(userId, feedback) {
    try {
      logger.debug('💬 Saving account deletion feedback for user:', userId);
      await apiClient.post('/users/me/delete-feedback', { feedback });
      logger.debug('✅ Account deletion feedback saved');
      return true;
    } catch (error) {
      logger.error('❌ Error saving account deletion feedback:', error);
      throw error;
    }
  }

  async deleteAllUserData(userId) {
    try {
      logger.debug('🗑️ Starting deletion of all user data for:', userId);
      await apiClient.delete('/users/me');
      logger.debug('✅ All user data deleted successfully');
    } catch (error) {
      logger.error('❌ Error deleting user data:', error);
      throw error;
    }
  }

  // ============ USERNAME / LOOKUP ============

  async isUsernameTaken(username, excludeUid = null) {
    const result = await apiClient.get('/users/me/username-check', { params: { username } });
    return !(result?.data?.available ?? true);
  }

  async getUserSubscriptions(userId) {
    const result = await apiClient.get('/users/me/subscriptions');
    const subs = result?.data ?? [];
    return subs.map(sub => ({
      ...sub,
      created_at: sub.created_at ? _wrapTimestamp(sub.created_at) : null,
      updated_at: sub.updated_at ? _wrapTimestamp(sub.updated_at) : null,
      next_billing_date: sub.next_billing_date ? _wrapTimestamp(sub.next_billing_date) : null,
      expires_at: sub.expires_at ? _wrapTimestamp(sub.expires_at) : null,
      renewal_date: sub.renewal_date ? _wrapTimestamp(sub.renewal_date) : null,
    }));
  }

  // ============ COURSES ============

  async getCoursesByCreatorId(creatorId) {
    const result = await apiClient.get('/creator/courses');
    return result?.data ?? [];
  }

  // ============ EXERCISE LIBRARY ============

  async getExerciseLibraryItem(exerciseId) {
    try {
      const result = await apiClient.get(`/library/exercises/${exerciseId}`);
      return result?.data ?? null;
    } catch (error) {
      logger.error('[getExerciseLibraryItem] error:', error);
      return null;
    }
  }

}

export default new FirestoreService();

// Named helper to match existing imports in the app
export const createUserDocument = async (userId, userData) => {
  await apiClient.post('/users/me/init', userData);
};
