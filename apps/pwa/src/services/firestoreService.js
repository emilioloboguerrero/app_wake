// Firestore service for Wake
import apiClient from '../utils/apiClient';
import { firestore } from '../config/firebase';
import {
  doc,
  setDoc,
  getDoc,
  updateDoc,
  deleteDoc,
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  addDoc,
  serverTimestamp,
  writeBatch,
  onSnapshot
} from 'firebase/firestore';
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
    await setDoc(doc(firestore, 'users', userId), {
      ...userData,
      role: userData.role || 'user',
      created_at: serverTimestamp()
    });
  }

  // TODO: no endpoint for getUser — GET /api/v1/users/me is me-only and returns a different shape; callers pass arbitrary userIds and expect Firestore field shapes
  async getUser(userId) {
    try {
      const userRef = doc(firestore, 'users', userId);
      const userDoc = await getDoc(userRef);
      if (!userDoc.exists()) {
        logger.debug('[FIRESTORE] getUser: no document for users/', userId);
        return null;
      }
      return userDoc.data();
    } catch (error) {
      // Handle offline/network errors gracefully
      if (error.code === 'unavailable' || error.message.includes('offline')) {
        logger.debug('📱 Device is offline, throwing offline error for caller cache handling');
        const offlineError = new Error('Firestore unavailable offline');
        offlineError.code = 'offline';
        throw offlineError;
      }
      throw error;
    }
  }

  // TODO: no endpoint for updateUser — PATCH /api/v1/users/me accepts only a whitelist of fields; this is called with arbitrary payloads including courses, courseProgress, legacy fields
  async updateUser(userId, userData) {
    const userRef = doc(firestore, 'users', userId);
    try {
      const existing = await getDoc(userRef);
      if (existing.exists()) {
        logger.debug('[FIRESTORE] updateUser: document exists, updating users/', userId);
        await updateDoc(userRef, userData);
      } else {
        logger.log('[FIRESTORE] updateUser: no document for users/', userId, '— creating with setDoc(merge).');
        await setDoc(userRef, { ...userData, created_at: serverTimestamp() }, { merge: true });
      }
    } catch (error) {
      logger.error('[FIRESTORE] updateUser failed for users/', userId, error?.code, error?.message);
      throw error;
    }
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
    const progressRef = collection(firestore, 'users', userId, 'progress');
    const docRef = await addDoc(progressRef, {
      ...progressData,
      updated_at: serverTimestamp()
    });
    return docRef.id;
  }

  async updateProgressEntry(userId, progressId, progressData) {
    const progressRef = doc(firestore, 'users', userId, 'progress', progressId);
    await updateDoc(progressRef, {
      ...progressData,
      updated_at: serverTimestamp()
    });
  }

  async getUserProgress(userId, courseId = null) {
    try {
      let progressQuery = collection(firestore, 'users', userId, 'progress');
      
      if (courseId) {
        progressQuery = query(progressQuery, where('course_id', '==', courseId));
      }
      
      const progressSnapshot = await getDocs(progressQuery);
      return progressSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
    } catch (error) {
      logger.error('Error getting user progress:', error);
      throw error;
    }
  }

  /**
   * Get user's progress sessions from top-level progress collection.
   * @deprecated New progress lives in users/{userId}.courseProgress and sessionHistory. Use userProgressService / progressQueryService for current data.
   */
  async getUserCourseProgress(userId, courseId, limit = 50) {
    try {
      
      const progressQuery = query(
        collection(firestore, 'progress'),
        where('user_id', '==', userId),
        where('course_id', '==', courseId),
        orderBy('completed_at', 'desc'),
        limit(limit)
      );
      
      const snapshot = await getDocs(progressQuery);
      const sessions = [];
      
      snapshot.forEach(doc => {
        sessions.push({
          id: doc.id,
          ...doc.data()
        });
      });
      
      return sessions;
    } catch (error) {
      logger.error('❌ Error getting user course progress:', error);
      return [];
    }
  }

  /**
   * Get a specific progress session by ID from top-level progress collection.
   * @deprecated New progress lives in users/{userId}/sessionHistory. Use exerciseHistoryService for current data.
   */
  async getProgressSession(sessionId) {
    try {
      logger.debug('📊 Getting progress session:', sessionId);
      
      const progressRef = doc(firestore, 'progress', sessionId);
      const docSnap = await getDoc(progressRef);
      
      if (docSnap.exists()) {
        const sessionData = {
          id: docSnap.id,
          ...docSnap.data()
        };
        logger.debug('✅ Progress session found');
        return sessionData;
      } else {
        logger.debug('❌ Progress session not found');
        return null;
      }
    } catch (error) {
      logger.error('❌ Error getting progress session:', error);
      return null;
    }
  }

  async getCourseModules(courseId) {
    return apiClient.get(`/workout/courses/${courseId}/modules`).then(r => r?.data ?? []);
  }

  /**
   * Get session-level overrides
   */
  async getSessionOverrides(programId, moduleId, sessionId) {
    try {
      const overridesRef = doc(firestore,
        'courses', programId,
        'modules', moduleId,
        'sessions', sessionId,
        'overrides', 'data'
      );
      const docSnap = await getDoc(overridesRef);
      return docSnap.exists() ? docSnap.data() : null;
    } catch (error) {
      logger.error('Error fetching session overrides:', error);
      return null;
    }
  }

  /**
   * Get exercise-level overrides
   */
  async getExerciseOverrides(programId, moduleId, sessionId, exerciseId) {
    try {
      const overridesRef = doc(firestore,
        'courses', programId,
        'modules', moduleId,
        'sessions', sessionId,
        'exercises', exerciseId,
        'overrides', 'data'
      );
      const docSnap = await getDoc(overridesRef);
      return docSnap.exists() ? docSnap.data() : null;
    } catch (error) {
      logger.error('Error fetching exercise overrides:', error);
      return null;
    }
  }

  /**
   * Get set-level overrides
   */
  async getSetOverrides(programId, moduleId, sessionId, exerciseId, setId) {
    try {
      const overridesRef = doc(firestore,
        'courses', programId,
        'modules', moduleId,
        'sessions', sessionId,
        'exercises', exerciseId,
        'sets', setId,
        'overrides', 'data'
      );
      const docSnap = await getDoc(overridesRef);
      return docSnap.exists() ? docSnap.data() : null;
    } catch (error) {
      logger.error('Error fetching set overrides:', error);
      return null;
    }
  }


  /**
   * Get planned session for a client on a specific date (from client_sessions)
   * @param {string} userId - Client user ID
   * @param {string} courseId - Program/course ID
   * @param {Date} date - Date to check
   * @returns {Promise<Object|null>} Client session doc or null
   */
  // TODO: no endpoint for getPlannedSessionForDate — no matching REST endpoint
  async getPlannedSessionForDate(userId, courseId, date) {
    try {
      const d = date instanceof Date ? date : new Date(date);
      const start = new Date(d);
      start.setHours(0, 0, 0, 0);
      const end = new Date(d);
      end.setHours(23, 59, 59, 999);
      logger.log('🔍 [getPlannedSessionForDate] query client_sessions:', {
        userId,
        courseId,
        date: d.toDateString(),
        start: start.toISOString(),
        end: end.toISOString()
      });
      const q = query(
        collection(firestore, 'client_sessions'),
        where('client_id', '==', userId),
        where('program_id', '==', courseId),
        where('date_timestamp', '>=', start),
        where('date_timestamp', '<=', end),
        orderBy('date_timestamp', 'asc'),
        limit(1)
      );
      const snap = await getDocs(q);
      if (snap.empty) {
        logger.log('🔍 [getPlannedSessionForDate] no client_sessions doc for this date (empty snapshot)');
        return null;
      }
      const doc = snap.docs[0];
      const data = { id: doc.id, ...doc.data() };
      logger.log('🔍 [getPlannedSessionForDate] found:', {
        clientSessionDocId: data.id,
        session_id: data.session_id,
        plan_id: data.plan_id,
        note: 'Slot id = client_sessions doc id (data.id); PWA uses this for matching and completion'
      });
      return data;
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
    logger.log('[getDatesWithPlannedSessions] called', { userId, courseId, startDate, endDate });
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
            logger.log('🔍 [resolvePlannedSessionContent] using client_session_content copy:', {
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
              logger.log('🔍 [resolvePlannedSessionContent] using client_plan_content session:', {
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
            logger.log('🔍 [resolvePlannedSessionContent] using plan/library:', {
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
            const courseDoc = await getDoc(doc(firestore, 'courses', program_id));
            effectiveCreatorId = courseDoc.data()?.creator_id || courseDoc.data()?.creatorId || null;
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
      logger.log('🔍 [resolvePlannedSessionContent] no content resolved');
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
      logger.log('🔍 [getPlannedSessionContentForDate] no planned session for date, returning null');
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
    logger.log('🔍 [getPlannedSessionContentForDate] resolved content:', {
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
      const plannedRef = doc(firestore, 'client_sessions', clientSessionId);
      const plannedSnap = await getDoc(plannedRef);
      if (!plannedSnap.exists()) {
        logger.prod('[firestoreService] getPlannedSessionContentBySlotId: client_sessions doc NOT FOUND:', clientSessionId);
        return null;
      }
      const planned = { id: plannedSnap.id, ...plannedSnap.data() };
      logger.prod('[firestoreService] getPlannedSessionContentBySlotId planned doc:', {
        clientSessionId,
        session_id: planned.session_id ?? 'none',
        plan_id: planned.plan_id ?? 'none',
        module_id: planned.module_id ?? 'none',
        week_key: planned.week_key ?? 'NOT SET',
        date: planned.date ?? 'none',
        client_id_match: planned.client_id === userId,
        program_id_match: planned.program_id === courseId,
      });
      if (planned.client_id !== userId || planned.program_id !== courseId) return null;
      let creatorId = creatorIdFromCourse ?? planned.creator_id ?? null;
      if (!creatorId && planned.program_id) {
        try {
          const courseDoc = await this.getCourse(planned.program_id);
          creatorId = courseDoc?.creator_id ?? courseDoc?.creatorId ?? null;
        } catch (_) {}
      }
      return await this.resolvePlannedSessionContent(planned, creatorId);
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
    const sessionRef = doc(firestore, 'plans', plan_id, 'modules', module_id, 'sessions', session_id);
    const sessionDoc = await getDoc(sessionRef);
    if (!sessionDoc.exists()) return null;
    const sessionData = { id: sessionDoc.id, ...sessionDoc.data() };
    if (sessionData.librarySessionRef && creatorId) {
      return this._resolvePlannedSessionFromLibrary(creatorId, sessionData.librarySessionRef, options);
    }
    if (options.minimal) {
      sessionData.exercises = [];
      return sessionData;
    }
    const exercisesSnap = await getDocs(
      query(
        collection(firestore, 'plans', plan_id, 'modules', module_id, 'sessions', session_id, 'exercises'),
        orderBy('order', 'asc')
      )
    );
    const exercises = await Promise.all(
      exercisesSnap.docs.map(async (exDoc) => {
        const exData = { id: exDoc.id, ...exDoc.data() };
        try {
          const setsSnap = await getDocs(
            query(
              collection(firestore, 'plans', plan_id, 'modules', module_id, 'sessions', session_id, 'exercises', exDoc.id, 'sets'),
              orderBy('order', 'asc')
            )
          );
          exData.sets = setsSnap.docs.map((s) => ({ id: s.id, ...s.data() }));
        } catch (_) {
          exData.sets = [];
        }
        return exData;
      })
    );
    sessionData.exercises = exercises;
    return sessionData;
  }

  async _resolvePlannedSessionFromLibrary(creatorId, session_id, options = {}) {
    const sessionRef = doc(firestore, 'creator_libraries', creatorId, 'sessions', session_id);
    const sessionDoc = await getDoc(sessionRef);
    if (!sessionDoc.exists()) return null;
    const sessionData = { id: sessionDoc.id, ...sessionDoc.data() };
    if (options.minimal) {
      sessionData.exercises = [];
      return sessionData;
    }
    const exercisesSnap = await getDocs(
      query(
        collection(firestore, 'creator_libraries', creatorId, 'sessions', session_id, 'exercises'),
        orderBy('order', 'asc')
      )
    );
    const exercises = await Promise.all(
      exercisesSnap.docs.map(async (exDoc) => {
        const exData = { id: exDoc.id, ...exDoc.data() };
        try {
          const setsSnap = await getDocs(
            query(
              collection(firestore, 'creator_libraries', creatorId, 'sessions', session_id, 'exercises', exDoc.id, 'sets'),
              orderBy('order', 'asc')
            )
          );
          exData.sets = setsSnap.docs.map((s) => ({ id: s.id, ...s.data() }));
        } catch (_) {
          exData.sets = [];
        }
        return exData;
      })
    );
    sessionData.exercises = exercises;
    return sessionData;
  }

  /**
   * Get client program document
   * @param {string} userId - User ID
   * @param {string} programId - Program ID
   * @returns {Promise<Object|null>} Client program data or null
   */
  // TODO: no endpoint for getClientProgram — no REST endpoint for client_programs collection
  async getClientProgram(userId, programId) {
    try {
      const clientProgramId = `${userId}_${programId}`;
      const clientProgramDoc = await getDoc(doc(firestore, 'client_programs', clientProgramId));
      
      if (clientProgramDoc.exists()) {
        return {
          id: clientProgramDoc.id,
          ...clientProgramDoc.data()
        };
      }
      return null;
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
    try {
      const clientProgramId = `${userId}_${programId}`;
      await setDoc(doc(firestore, 'client_programs', clientProgramId), {
        program_id: programId,
        user_id: userId,
        ...clientProgramData,
        updated_at: serverTimestamp()
      }, { merge: true });
      return clientProgramId;
    } catch (error) {
      logger.error('Error setting client program:', error);
      throw error;
    }
  }

  /**
   * Update client program overrides at a specific path
   * @param {string} userId - User ID
   * @param {string} programId - Program ID
   * @param {string} path - Dot-separated path (e.g., 'modules.moduleId.sessions.sessionId.title')
   * @param {*} value - Value to set (null to delete)
   */
  async updateClientProgramOverride(userId, programId, path, value) {
    try {
      const clientProgramId = `${userId}_${programId}`;
      const clientProgramRef = doc(firestore, 'client_programs', clientProgramId);
      
      // Build nested update object
      const pathParts = path.split('.');
      const updateData = {};
      let current = updateData;
      
      for (let i = 0; i < pathParts.length - 1; i++) {
        current[pathParts[i]] = {};
        current = current[pathParts[i]];
      }
      
      current[pathParts[pathParts.length - 1]] = value;
      
      await updateDoc(clientProgramRef, {
        ...updateData,
        updated_at: serverTimestamp()
      });
    } catch (error) {
      logger.error('Error updating client program override:', error);
      throw error;
    }
  }

  /**
   * Delete client program
   * @param {string} userId - User ID
   * @param {string} programId - Program ID
   */
  async deleteClientProgram(userId, programId) {
    try {
      const clientProgramId = `${userId}_${programId}`;
      await deleteDoc(doc(firestore, 'client_programs', clientProgramId));
    } catch (error) {
      logger.error('Error deleting client program:', error);
      throw error;
    }
  }

  // Simple course management in user document (simplified)
  async addCourseToUser(userId, courseId, expirationDate, accessDuration, courseDetails) {
    try {
      const userRef = doc(firestore, 'users', userId);
      const userDoc = await getDoc(userRef);
      
      if (userDoc.exists()) {
        const userData = userDoc.data();
        const courses = userData.courses || {};
        
        // Store course entry (simplified - minimal fields)
        courses[courseId] = {
          // Access control
          access_duration: accessDuration,
          expires_at: expirationDate,
          status: 'active',
          purchased_at: new Date().toISOString(),
          deliveryType: courseDetails?.deliveryType ?? 'low_ticket', // PWA: one_on_one vs low_ticket load path
          // Minimal cached data for display
          title: courseDetails?.title || 'Untitled Course',
          image_url: courseDetails?.image_url || null,
          discipline: courseDetails?.discipline || 'General',
          creatorName: courseDetails?.creatorName || courseDetails?.creator_name || 'Unknown Creator',
          
          // Tutorial completion tracking
          completedTutorials: {
            dailyWorkout: [],
            warmup: [],
            workoutExecution: [],
            workoutCompletion: []
          }
        };
        
        logger.debug('💾 Storing course in user document:', courses[courseId]);
        
        await updateDoc(userRef, {
          courses: courses,
          // Keep legacy field for compatibility
          purchased_courses: [...new Set([...(userData.purchased_courses || []), courseId])]
        });
        
        logger.debug('✅ Course added to user document successfully');
      }
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

      const userRef = doc(firestore, 'users', userId);
      const userDoc = await getDoc(userRef);

      if (!userDoc.exists()) {
        return {
          success: false,
          error: 'Usuario no encontrado',
          code: 'USER_NOT_FOUND',
        };
      }

      const now = new Date();
      const expirationDate = new Date(now.getTime() + durationInDays * 24 * 60 * 60 * 1000);

      const userData = userDoc.data();
      const courses = { ...(userData.courses || {}) };
      const trialHistory = { ...(userData.free_trial_history || {}) };

      if (trialHistory[courseId]?.consumed) {
        return {
          success: false,
          error: 'Ya usaste la prueba gratuita de este programa',
          code: 'TRIAL_ALREADY_CONSUMED',
        };
      }

      const existingCourse = courses[courseId];
      if (existingCourse?.is_trial) {
        const existingExpiration = existingCourse.trial_expires_at || existingCourse.expires_at;
        if (existingExpiration && new Date(existingExpiration) > now) {
          return {
            success: false,
            error: 'Ya tienes una prueba activa para este programa',
            code: 'TRIAL_ALREADY_ACTIVE',
          };
        }
      }

      const displayCreator =
        courseDetails?.creatorName ||
        courseDetails?.creator_name ||
        existingCourse?.creatorName ||
        existingCourse?.creator_name ||
        'Unknown Creator';

      courses[courseId] = {
        ...existingCourse,
        access_duration: `${durationInDays}_days_trial`,
        expires_at: expirationDate.toISOString(),
        trial_expires_at: expirationDate.toISOString(),
        trial_started_at: now.toISOString(),
        status: 'active',
        is_trial: true,
        trial_duration_days: durationInDays,
        trial_state: 'active',
        purchased_at: existingCourse?.purchased_at || now.toISOString(),
        deliveryType: courseDetails?.deliveryType ?? existingCourse?.deliveryType ?? 'low_ticket',
        title: courseDetails?.title || existingCourse?.title || 'Untitled Course',
        image_url: courseDetails?.image_url || existingCourse?.image_url || null,
        discipline: courseDetails?.discipline || existingCourse?.discipline || 'General',
        creatorName: displayCreator,
        completedTutorials: existingCourse?.completedTutorials || {
          dailyWorkout: [],
          warmup: [],
          workoutExecution: [],
          workoutCompletion: [],
        },
      };

      trialHistory[courseId] = {
        consumed: true,
        last_started_at: now.toISOString(),
        last_expires_at: expirationDate.toISOString(),
      };

      await updateDoc(userRef, {
        courses,
        free_trial_history: trialHistory,
      });

      return {
        success: true,
        expirationDate: expirationDate.toISOString(),
      };
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
    const orphaned = [];
    try {
      const clientProgramsQuery = query(
        collection(firestore, 'client_programs'),
        where('user_id', '==', userId)
      );
      const clientProgramsSnap = await getDocs(clientProgramsQuery);
      for (const docSnap of clientProgramsSnap.docs) {
        const data = docSnap.data();
        const programId = data.program_id;
        if (!programId || courseIdsFromUser.has(programId)) continue;
        const courseDoc = await getDoc(doc(firestore, 'courses', programId));
        if (!courseDoc.exists()) continue;
        const courseData = courseDoc.data();
        const farFuture = new Date();
        farFuture.setFullYear(farFuture.getFullYear() + 10);
        orphaned.push({
          id: `${userId}-${programId}`,
          courseId: programId,
          courseData: {
            access_duration: 'one_on_one',
            expires_at: farFuture.toISOString(),
            status: 'active',
            purchased_at: new Date().toISOString(),
            deliveryType: 'one_on_one',
            title: courseData.title || 'Untitled Program',
            image_url: courseData.image_url || null,
            discipline: courseData.discipline || 'General',
            creatorName: courseData.creatorName || courseData.creator_name || 'Unknown Creator',
          },
          courseDetails: {
            id: programId,
            title: courseData.title || 'Curso sin título',
            image_url: courseData.image_url || '',
            discipline: courseData.discipline || 'General',
            creatorName: courseData.creatorName || courseData.creator_name || null,
          },
          isActive: true,
          isExpired: false,
          isCompleted: false,
          status: 'active',
          paid_at: { toDate: () => new Date() },
          expires_at: farFuture.toISOString(),
        });
        // Backfill users.courses in background
        this.backfillOneOnOneCourseInUserDocument(userId, programId, courseData).catch(() => {});
      }
    } catch (err) {
      logger.warn('getOrphanedOneOnOnePrograms:', err?.message);
    }
    return orphaned;
  }

  /**
   * Backfill users.courses with one-on-one program (repair for orphaned client_programs)
   * @param {string} userId - User ID
   * @param {string} programId - Program ID
   * @param {Object} courseData - Course metadata from courses collection
   */
  async backfillOneOnOneCourseInUserDocument(userId, programId, courseData) {
    try {
      const userRef = doc(firestore, 'users', userId);
      const userDoc = await getDoc(userRef);
      if (!userDoc.exists()) return;
      const userData = userDoc.data();
      const courses = userData.courses || {};
      if (courses[programId]) return; // Already present
      const farFuture = new Date();
      farFuture.setFullYear(farFuture.getFullYear() + 10);
      courses[programId] = {
        access_duration: 'one_on_one',
        expires_at: farFuture.toISOString(),
        status: 'active',
        purchased_at: new Date().toISOString(),
        deliveryType: 'one_on_one',
        assigned_at: new Date().toISOString(),
        title: courseData.title || 'Untitled Program',
        image_url: courseData.image_url || null,
        discipline: courseData.discipline || 'General',
        creatorName: courseData.creatorName || courseData.creator_name || 'Unknown Creator',
        completedTutorials: {
          dailyWorkout: [],
          warmup: [],
          workoutExecution: [],
          workoutCompletion: [],
        },
      };
      await updateDoc(userRef, { courses });
      logger.debug('✅ Backfilled one-on-one course in users.courses:', programId);
    } catch (err) {
      logger.error('❌ Error backfilling one-on-one course:', err);
      throw err;
    }
  }

  async removeCourseFromUser(userId, courseId) {
    try {
      logger.debug('🗑️ Removing course from user:', userId, courseId);
      
      const userRef = doc(firestore, 'users', userId);
      const userDoc = await getDoc(userRef);
      
      if (!userDoc.exists()) {
        throw new Error('User document not found');
      }
      
      const userData = userDoc.data();
      const courses = userData.courses || {};
      
      // Remove the course from the courses object
      delete courses[courseId];
      
      // Update the user document
      await updateDoc(userRef, {
        courses: courses
      });
      
      logger.debug('✅ Course removed from user:', courseId);
    } catch (error) {
      logger.error('❌ Error removing course from user:', error);
      throw error;
    }
  }

  async getUserActiveCourses(userId) {
    try {
      const courses = await apiClient.get('/workout/courses').then(r => r?.data ?? []);
      const now = new Date();
      return courses
        .filter(c => c.is_trial || (c.status === 'active' && (!c.expires_at || new Date(c.expires_at) > now)))
        .map(c => {
          const isTrial = c.is_trial === true;
          const expiresAt = c.expires_at || null;
          const trialState = isTrial
            ? (expiresAt && new Date(expiresAt) > now ? 'active' : 'expired')
            : null;
          return {
            courseId: c.courseId,
            courseData: {
              status: c.status,
              access_duration: c.access_duration,
              expires_at: c.expires_at,
              purchased_at: c.purchased_at,
              deliveryType: c.deliveryType,
              title: c.title,
              image_url: c.image_url,
              is_trial: c.is_trial,
              trial_consumed: c.trial_consumed,
            },
            purchasedAt: c.purchased_at || null,
            courseDetails: {
              id: c.courseId,
              title: c.title || c.courseData?.title || 'Curso sin título',
              image_url: c.image_url || c.courseData?.image_url || '',
              discipline: c.courseData?.discipline || 'General',
              difficulty: c.courseData?.difficulty || 'Intermedio',
              duration: c.courseData?.duration || 'No especificada',
              description: c.courseData?.description || 'Descripción no disponible',
              creatorName: c.courseData?.creatorName || c.courseData?.creator_name || null,
            },
            trialInfo: isTrial ? { state: trialState, expiresAt } : null,
            trialHistory: null,
            isTrialCourse: isTrial,
          };
        });
    } catch (error) {
      logger.error('Error getting user active courses:', error);
      return [];
    }
  }

  // Simple method to update course status (for subscription management)
  async updateCourseStatus(userId, courseId, status, newExpirationDate = null) {
    try {
      const userRef = doc(firestore, 'users', userId);
      const userDoc = await getDoc(userRef);
      
      if (userDoc.exists()) {
        const userData = userDoc.data();
        const courses = userData.courses || {};
        
        if (courses[courseId]) {
          courses[courseId].status = status;
          
          // Update expiration date if provided (for subscription renewals)
          if (newExpirationDate) {
            courses[courseId].expires_at = newExpirationDate;
          }
          
          // Add timestamp for status change
          courses[courseId].status_updated_at = new Date().toISOString();
          
          // Clean up any undefined values before saving
          const cleanedCourses = {};
          Object.keys(courses).forEach(key => {
            const course = courses[key];
            cleanedCourses[key] = {};
            Object.keys(course).forEach(field => {
              if (course[field] !== undefined) {
                cleanedCourses[key][field] = course[field];
              }
            });
          });
          
          await updateDoc(userRef, { courses: cleanedCourses });
          
          logger.debug(`✅ Updated course ${courseId} status to ${status}`);
          return true;
        }
      }
      return false;
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

  // Courses collection operations (with role-based filtering)
  async getCourses(userId = null) {
    try {
      logger.debug('🔍 Getting courses for user:', userId);
      
      // Get user role if userId provided
      let userRole = 'user'; // Default
      if (userId) {
        const userDoc = await getDoc(doc(firestore, 'users', userId));
        userRole = userDoc.data()?.role || 'user';
        logger.debug('👤 User role:', userRole);
      }
      
      // Get all courses (no server-side filtering)
      const coursesSnapshot = await getDocs(collection(firestore, 'courses'));
      const allCourses = coursesSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      logger.debug('📊 Total courses in database:', allCourses.length);
      
      // Filter based on user role (client-side)
      const filteredCourses = allCourses.filter(course => {
        const courseStatus = course.status || course.estado; // Support both field names
        logger.debug(`🔍 Filtering course: ${course.title}, status: ${courseStatus}, creator_id: ${course.creator_id}`);
        
        // Admins see everything
        if (userRole === 'admin') {
          logger.debug('  → Admin: SHOW');
          return true;
        }
        
        // Creators see published + their own
        if (userRole === 'creator') {
          const isPublished = courseStatus === 'publicado' || courseStatus === 'published';
          const isOwnCourse = course.creator_id === userId;
          logger.debug(`  → Creator: isPublished=${isPublished}, isOwnCourse=${isOwnCourse}`);
          return isPublished || isOwnCourse;
        }
        
        // Regular users see only published
        const isPublished = courseStatus === 'publicado' || courseStatus === 'published';
        const shouldShow = isPublished || !courseStatus; // Backward compatibility
        logger.debug(`  → User: shouldShow=${shouldShow}, status=${courseStatus}`);
        return shouldShow;
      });
      
      // Sort by creation date (newest first)
      const sortedCourses = filteredCourses.sort((a, b) => {
        const aDate = a.created_at?.toDate?.() || new Date(0);
        const bDate = b.created_at?.toDate?.() || new Date(0);
        return bDate - aDate;
      });
      
      logger.debug('✅ Filtered courses for role', userRole, ':', sortedCourses.length);
      return sortedCourses;
      
    } catch (error) {
      logger.error('❌ Error in getCourses:', error);
      throw error;
    }
  }

  // TODO: no endpoint for getCourse — GET /api/v1/workout/courses/:courseId returns different shape (courseId key, includes modules); callers expect { id, title, ... }
  async getCourse(courseId) {
    try {
      logger.debug('🔍 FirestoreService: Getting course with ID:', courseId);
      const courseDoc = await getDoc(doc(firestore, 'courses', courseId));
      logger.debug('🔍 FirestoreService: Course document exists:', courseDoc.exists());
      
      if (courseDoc.exists()) {
        const courseData = { id: courseDoc.id, ...courseDoc.data() };
        logger.debug('✅ FirestoreService: Course data:', courseData);
        return courseData;
      } else {
        logger.debug('❌ FirestoreService: Course not found in database');
        return null;
      }
    } catch (error) {
      logger.error('❌ FirestoreService: Error getting course:', error);
      throw error;
    }
  }

  // Purchase logging operations
  async createPurchaseLog(purchaseData) {
    try {
      logger.debug('📝 Creating purchase log...', purchaseData);
      const docRef = await addDoc(collection(firestore, 'purchases'), purchaseData);
      logger.debug('✅ Purchase log created with ID:', docRef.id);
      return docRef.id;
    } catch (error) {
      logger.error('❌ Error creating purchase log:', error);
      throw error;
    }
  }

  // Progress collection operations
  async saveProgress(userId, courseId, lessonId, progressData) {
    try {
      await addDoc(collection(firestore, 'users', userId, 'progress'), {
        course_id: courseId,
        lesson_id: lessonId,
        ...progressData,
        updated_at: serverTimestamp()
      });
    } catch (error) {
      throw error;
    }
  }

  async getUserProgress(userId) {
    try {
      const progressQuery = query(
        collection(firestore, 'users', userId, 'progress'),
        orderBy('updated_at', 'desc')
      );
      const progressSnapshot = await getDocs(progressQuery);
      
      return progressSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
    } catch (error) {
      throw error;
    }
  }

  // Community collection operations
  async getCommunityPosts() {
    try {
      const postsQuery = query(
        collection(firestore, 'community'),
        orderBy('created_at', 'desc'),
        limit(20)
      );
      const postsSnapshot = await getDocs(postsQuery);
      
      return postsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
    } catch (error) {
      throw error;
    }
  }

  async createCommunityPost(userId, postData) {
    try {
      await addDoc(collection(firestore, 'community'), {
        user_id: userId,
        ...postData,
        created_at: serverTimestamp(),
        likes_count: 0
      });
    } catch (error) {
      throw error;
    }
  }

  // Version System Methods
  /**
   * Update user course version status
   */
  async updateUserCourseVersionStatus(userId, courseId, statusData) {
    try {
      logger.debug('🔄 Updating user course version status:', userId, courseId, statusData);
      
      // Build update object conditionally to avoid undefined values
      const updateData = {
        [`courses.${courseId}.update_status`]: statusData.update_status,
        [`courses.${courseId}.last_version_check`]: serverTimestamp()
      };
      
      // Only include downloaded_version if it's provided
      if (statusData.downloaded_version !== undefined) {
        updateData[`courses.${courseId}.downloaded_version`] = statusData.downloaded_version;
      }
      
      // Only include lastUpdated if it's provided
      if (statusData.lastUpdated !== undefined) {
        updateData[`courses.${courseId}.lastUpdated`] = statusData.lastUpdated;
      }
      
      await updateDoc(doc(firestore, 'users', userId), updateData);
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
      logger.debug('🔍 Getting user course version:', userId, courseId);
      const userDoc = await getDoc(doc(firestore, 'users', userId));
      if (userDoc.exists()) {
        const userData = userDoc.data();
        const courseData = userData.courses?.[courseId] || null;
        logger.debug('✅ User course version data:', courseData);
        return courseData;
      }
      logger.debug('❌ User document not found');
      return null;
    } catch (error) {
      logger.error('❌ Error getting user course version:', error);
      throw error;
    }
  }

  /**
   * Save account deletion feedback before deletion
   */
  async saveAccountDeletionFeedback(userId, feedback) {
    try {
      logger.debug('💬 Saving account deletion feedback for user:', userId);
      
      const feedbackData = {
        userId: userId,
        feedback: feedback,
        timestamp: serverTimestamp(),
        deleted: false, // Will be updated when account is actually deleted
      };

      // Save to a separate collection that won't be deleted
      await addDoc(collection(firestore, 'account_deletion_feedback'), feedbackData);
      
      logger.debug('✅ Account deletion feedback saved');
      return true;
    } catch (error) {
      logger.error('❌ Error saving account deletion feedback:', error);
      throw error;
    }
  }

  /**
   * Delete all user data from Firestore (except purchases as per requirements)
   */
  async deleteAllUserData(userId) {
    try {
      logger.debug('🗑️ Starting deletion of all user data for:', userId);

      // Delete subcollections
      await this.deleteSubcollection(userId, 'exerciseHistory');
      await this.deleteSubcollection(userId, 'sessionHistory');

      // Delete user_progress documents (documents starting with userId_)
      await this.deleteUserProgressDocuments(userId);

      // Delete completed_sessions documents (documents starting with userId_)
      await this.deleteCompletedSessionsDocuments(userId);

      // Delete progress collection documents (doc id: userId_courseId_sessionId)
      await this.deleteProgressDocuments(userId);

      // Delete main user document
      const userRef = doc(firestore, 'users', userId);
      await deleteDoc(userRef);
      logger.debug('✅ User document deleted');

      logger.debug('✅ All user data deleted successfully');
    } catch (error) {
      logger.error('❌ Error deleting user data:', error);
      throw error;
    }
  }

  /**
   * Helper: Delete a subcollection
   */
  async deleteSubcollection(userId, subcollectionName) {
    try {
      const subcollectionRef = collection(firestore, 'users', userId, subcollectionName);
      const snapshot = await getDocs(subcollectionRef);
      
      if (snapshot.empty) {
        logger.debug(`✅ ${subcollectionName} subcollection is empty`);
        return;
      }

      // Firestore batch limit is 500 operations
      const batchSize = 500;
      const docs = snapshot.docs;
      
      for (let i = 0; i < docs.length; i += batchSize) {
        const batch = writeBatch(firestore);
        const batchDocs = docs.slice(i, i + batchSize);
        
        batchDocs.forEach((docSnapshot) => {
          batch.delete(docSnapshot.ref);
        });
        
        await batch.commit();
        logger.debug(`✅ Deleted ${batchDocs.length} documents from ${subcollectionName} (batch ${Math.floor(i / batchSize) + 1})`);
      }

      logger.debug(`✅ ${subcollectionName} subcollection deleted (${docs.length} documents)`);
    } catch (error) {
      logger.error(`❌ Error deleting ${subcollectionName} subcollection:`, error);
      throw error;
    }
  }

  /**
   * Helper: Delete user_progress documents
   */
  async deleteUserProgressDocuments(userId) {
    try {
      const userProgressRef = collection(firestore, 'user_progress');
      
      // Fetch all user_progress docs and filter client-side
      // Note: For large collections, consider adding a userId field to documents for better querying
      const snapshot = await getDocs(userProgressRef);
      const userDocs = snapshot.docs.filter(doc => 
        doc.id.startsWith(userId + '_') || doc.id === userId
      );

      if (userDocs.length === 0) {
        logger.debug('✅ No user_progress documents to delete');
        return;
      }

      // Batch delete
      const batchSize = 500;
      for (let i = 0; i < userDocs.length; i += batchSize) {
        const batch = writeBatch(firestore);
        const batchDocs = userDocs.slice(i, i + batchSize);
        
        batchDocs.forEach((docSnapshot) => {
          batch.delete(docSnapshot.ref);
        });
        
        await batch.commit();
        logger.debug(`✅ Deleted ${batchDocs.length} user_progress documents (batch ${Math.floor(i / batchSize) + 1})`);
      }

      logger.debug(`✅ user_progress documents deleted (${userDocs.length} documents)`);
    } catch (error) {
      logger.error('❌ Error deleting user_progress documents:', error);
      throw error;
    }
  }

  /**
   * Helper: Delete completed_sessions documents
   */
  async deleteCompletedSessionsDocuments(userId) {
    try {
      const completedSessionsRef = collection(firestore, 'completed_sessions');
      const snapshot = await getDocs(completedSessionsRef);
      
      // Filter documents that start with userId_ or have userId in data
      const userDocs = snapshot.docs.filter(doc => {
        const docId = doc.id;
        const docData = doc.data();
        return docId.startsWith(userId + '_') || docData.userId === userId;
      });

      if (userDocs.length === 0) {
        logger.debug('✅ No completed_sessions documents to delete');
        return;
      }

      // Batch delete
      const batchSize = 500;
      for (let i = 0; i < userDocs.length; i += batchSize) {
        const batch = writeBatch(firestore);
        const batchDocs = userDocs.slice(i, i + batchSize);
        
        batchDocs.forEach((docSnapshot) => {
          batch.delete(docSnapshot.ref);
        });
        
        await batch.commit();
        logger.debug(`✅ Deleted ${batchDocs.length} completed_sessions documents (batch ${Math.floor(i / batchSize) + 1})`);
      }

      logger.debug(`✅ completed_sessions documents deleted (${userDocs.length} documents)`);
    } catch (error) {
      logger.error('❌ Error deleting completed_sessions documents:', error);
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

  // ============ REAL-TIME LISTENERS ============

  // TODO: no endpoint for subscribeToUserSubscriptions — onSnapshot listener is incompatible with REST; no equivalent polling endpoint
  subscribeToUserSubscriptions(userId, callback, errorCallback) {
    const subsRef = collection(firestore, 'users', userId, 'subscriptions');
    return onSnapshot(subsRef, callback, errorCallback);
  }

  // ============ COURSES ============

  async getCoursesByCreatorId(creatorId) {
    const q = query(collection(firestore, 'courses'), where('creator_id', '==', creatorId));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }

  // ============ EXERCISE LIBRARY ============

  async getExerciseLibraryItem(exerciseId) {
    const snap = await getDoc(doc(firestore, 'exercises_library', exerciseId));
    if (!snap.exists()) return null;
    return { id: snap.id, ...snap.data() };
  }

  /**
   * Helper: Delete progress collection documents for a user (doc id: userId_*)
   */
  async deleteProgressDocuments(userId) {
    try {
      const progressRef = collection(firestore, 'progress');
      const snapshot = await getDocs(progressRef);
      const userDocs = snapshot.docs.filter((d) => d.id.startsWith(userId + '_'));

      if (userDocs.length === 0) {
        logger.debug('✅ No progress documents to delete');
        return;
      }

      const batchSize = 500;
      for (let i = 0; i < userDocs.length; i += batchSize) {
        const batch = writeBatch(firestore);
        const batchDocs = userDocs.slice(i, i + batchSize);
        batchDocs.forEach((docSnapshot) => batch.delete(docSnapshot.ref));
        await batch.commit();
        logger.debug(`✅ Deleted ${batchDocs.length} progress documents (batch ${Math.floor(i / batchSize) + 1})`);
      }
      logger.debug(`✅ progress documents deleted (${userDocs.length} documents)`);
    } catch (error) {
      logger.error('❌ Error deleting progress documents:', error);
      throw error;
    }
  }
}

export default new FirestoreService();

// Named helper to match existing imports in the app
export const createUserDocument = async (userId, userData) => {
  try {
    await setDoc(doc(firestore, 'users', userId), {
      ...userData,
      role: userData.role || 'user',        // Default to 'user' if not specified
      created_at: serverTimestamp(),
    });
  } catch (error) {
    throw error;
  }
};
