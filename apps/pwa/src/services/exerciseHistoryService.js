// Exercise History Service - Manages exercise and session history subcollections
import { doc, getDoc, setDoc, updateDoc, collection, getDocs, query, where, orderBy, limit, startAfter } from 'firebase/firestore';
import { firestore } from '../config/firebase';
import logger from '../utils/logger.js';

class ExerciseHistoryService {
  /**
   * Add session data to both exercise and session history
   * @param {string} userId - User ID
   * @param {Object} sessionData - Session data with exercises (performed)
   * @param {Object} [plannedSnapshot] - Optional snapshot of planned session at completion time
   */
  async addSessionData(userId, sessionData, plannedSnapshot = null) {
    try {
      logger.log('📚 Adding session data to exercise history:', sessionData.sessionId);
      logger.log('📚 Session data structure:', JSON.stringify(sessionData, null, 2));
      
      // Validate session data
      if (!sessionData || !sessionData.exercises || !Array.isArray(sessionData.exercises)) {
        throw new Error('Invalid session data structure');
      }
      
      // Update exercise-specific subcollections
      for (const exercise of sessionData.exercises) {
        await this.updateExerciseHistory(userId, exercise, sessionData);
      }
      
      // Update session-specific subcollection (with planned snapshot when available)
      await this.updateSessionHistory(userId, sessionData, plannedSnapshot);
      
      logger.log('✅ Session data added to exercise history');
    } catch (error) {
      logger.error('❌ Error adding session data to exercise history:', error);
      throw error;
    }
  }
  
  /**
   * Update exercise history subcollection
   */
  async updateExerciseHistory(userId, exercise, sessionData) {
    try {
      // Validate exercise data
      if (!exercise || !exercise.exerciseId || !exercise.sets) {
        logger.log('⚠️ Skipping exercise - missing required data:', exercise);
        return;
      }
      
      // Additional validation for libraryId and exerciseName
      if (!exercise.libraryId || exercise.libraryId === 'unknown') {
        logger.log('⚠️ Skipping exercise - invalid libraryId:', exercise.libraryId);
        return;
      }

      if (!exercise.exerciseName || exercise.exerciseName === 'Unknown Exercise') {
        logger.log('⚠️ Skipping exercise - invalid exerciseName:', exercise.exerciseName);
        return;
      }
      
      // Generate exercise key in the correct format: libraryId_exerciseName
      const exerciseKey = `${exercise.libraryId}_${exercise.exerciseName}`;
      
      // Validate the exercise key format
      if (exerciseKey.includes('unknown') || exerciseKey.includes('Unknown')) {
        logger.warn('⚠️ Skipping exercise with invalid key:', exerciseKey);
        return;
      }
      
      logger.log('💪 Updating exercise history:', exerciseKey);
      
      const docRef = doc(firestore, 'users', userId, 'exerciseHistory', exerciseKey);
      const docSnap = await getDoc(docRef);
      
      const existingData = docSnap.exists() ? docSnap.data() : { sessions: [] };
      
      // Add new session to beginning of array
      const filteredSets = exercise.sets.filter(set => {
        // Only keep sets with actual data
        const hasReps = set.reps && set.reps !== '' && !isNaN(parseFloat(set.reps));
        const hasWeight = set.weight && set.weight !== '' && !isNaN(parseFloat(set.weight));
        return hasReps || hasWeight;
      });
      
      const newSession = {
        date: sessionData.completedAt,
        sessionId: sessionData.sessionId,
        sets: filteredSets
      };
      
      logger.log('🔍 EXERCISE HISTORY SET FILTERING:', {
        exerciseKey: exerciseKey,
        originalSetsCount: exercise.sets?.length || 0,
        filteredSetsCount: filteredSets.length
      });
      
      existingData.sessions.unshift(newSession);
      
      // Clean the data to remove undefined values
      const cleanExistingData = this.cleanFirestoreData(existingData);
      
      // Update document
      await setDoc(docRef, cleanExistingData);

      // Update per-exercise last performance cache (best set of this session)
      await this.updateLastExercisePerformance(userId, exercise, sessionData, filteredSets);
      
      logger.log('✅ Exercise history updated:', exerciseKey);
    } catch (error) {
      logger.error('❌ Error updating exercise history for:', exercise.exerciseName, error);
      // Don't throw - continue with other exercises
    }
  }
  
  /**
   * Update session history subcollection
   * @param {string} userId - User ID
   * @param {Object} sessionData - Session data with exercises (performed)
   * @param {Object} [plannedSnapshot] - Optional snapshot of planned session at completion time.
   *   Format: { exercises: [{ id, title, primary, sets: [{ reps, weight, intensity }] }] }
   *   When present, history is self-contained and immune to plan/library changes.
   */
  async updateSessionHistory(userId, sessionData, plannedSnapshot = null) {
    try {
      logger.log('📋 Updating session history:', {
        sessionId: sessionData.sessionId,
        sessionName: sessionData.sessionName,
        courseName: sessionData.courseName,
        exercisesCount: sessionData.exercises?.length,
        hasPlannedSnapshot: !!plannedSnapshot
      });
      
      // Validate session data
      if (!sessionData || !sessionData.sessionId || !sessionData.exercises) {
        throw new Error('Invalid session data for session history');
      }
      
      // Ensure required fields are present
      if (!sessionData.completedAt) {
        sessionData.completedAt = new Date().toISOString();
      }
      
      if (sessionData.duration === undefined || sessionData.duration === null) {
        sessionData.duration = 0;
      }
      
      const docRef = doc(firestore, 'users', userId, 'sessionHistory', sessionData.sessionId);
      
      const sessionHistoryData = {
        sessionId: sessionData.sessionId,
        courseId: sessionData.courseId,
        courseName: sessionData.courseName || 'Unknown Course',
        sessionName: sessionData.sessionName || 'Workout Session',
        completedAt: sessionData.completedAt,
        duration: sessionData.duration || 0,
        userNotes: sessionData.userNotes ?? '',
        exercises: {}
      };
      
      // Add planned snapshot when available (makes history self-contained)
      if (plannedSnapshot && plannedSnapshot.exercises && Array.isArray(plannedSnapshot.exercises)) {
        sessionHistoryData.planned = {
          exercises: plannedSnapshot.exercises.map(ex => ({
            id: ex.id,
            title: ex.title || ex.name || '',
            name: ex.name || ex.exerciseName || ex.title || '',
            primary: ex.primary || {},
            sets: (ex.sets || []).map(s => ({
              reps: s.reps,
              weight: s.weight,
              intensity: s.intensity
            }))
          }))
        };
      }
      
      // Add exercise data
      sessionData.exercises.forEach(exercise => {
        if (exercise.libraryId && exercise.exerciseName && 
            exercise.libraryId !== 'unknown' && exercise.exerciseName !== 'Unknown Exercise') {
          const exerciseKey = `${exercise.libraryId}_${exercise.exerciseName}`;
          
          // Filter empty sets for session history
          const filteredSets = (exercise.sets || []).filter(set => {
            const hasReps = set.reps && set.reps !== '' && !isNaN(parseFloat(set.reps));
            const hasWeight = set.weight && set.weight !== '' && !isNaN(parseFloat(set.weight));
            return hasReps || hasWeight;
          });
          
          // Only save exercises that have at least one valid set
          if (filteredSets.length > 0) {
            sessionHistoryData.exercises[exerciseKey] = {
              exerciseName: exercise.exerciseName,
              sets: filteredSets
            };
            
            logger.log('🔍 SESSION HISTORY SET FILTERING:', {
              exerciseKey: exerciseKey,
              originalSetsCount: exercise.sets?.length || 0,
              filteredSetsCount: filteredSets.length,
              status: 'SAVED'
            });
          } else {
            logger.log('🔍 SESSION HISTORY SET FILTERING:', {
              exerciseKey: exerciseKey,
              originalSetsCount: exercise.sets?.length || 0,
              filteredSetsCount: filteredSets.length,
              status: 'SKIPPED - No valid sets'
            });
          }
        } else {
          logger.warn('⚠️ Skipping exercise in session history - invalid data:', {
            libraryId: exercise.libraryId,
            exerciseName: exercise.exerciseName
          });
        }
      });
      
      // Clean the data to remove undefined values
      const cleanSessionHistoryData = this.cleanFirestoreData(sessionHistoryData);
      
      await setDoc(docRef, cleanSessionHistoryData);
      
      logger.log('✅ Session history updated:', sessionData.sessionId);
    } catch (error) {
      logger.error('❌ Error updating session history:', error);
      throw error;
    }
  }
  
  /**
   * Clean data to remove undefined values for Firestore
   */
  cleanFirestoreData(data) {
    if (data === null || data === undefined) {
      return null;
    }
    
    if (Array.isArray(data)) {
      return data.map(item => this.cleanFirestoreData(item)).filter(item => item !== null);
    }
    
    if (typeof data === 'object') {
      const cleaned = {};
      for (const [key, value] of Object.entries(data)) {
        if (value !== undefined) {
          cleaned[key] = this.cleanFirestoreData(value);
        }
      }
      return cleaned;
    }
    
    return data;
  }
  
  /**
   * Get exercise history
   */
  async getExerciseHistory(userId, exerciseKey) {
    try {
      const docRef = doc(firestore, 'users', userId, 'exerciseHistory', exerciseKey);
      const docSnap = await getDoc(docRef);
      return docSnap.exists() ? docSnap.data() : { sessions: [] };
    } catch (error) {
      logger.error('❌ Error getting exercise history:', error);
      return { sessions: [] };
    }
  }
  
  /**
   * Update session notes after completion (e.g. from completion screen or session history).
   * @param {string} userId - User ID
   * @param {string} sessionId - Session document ID
   * @param {string} userNotes - Notes text (can be empty string to clear)
   */
  async updateSessionNotes(userId, sessionId, userNotes) {
    try {
      const docRef = doc(firestore, 'users', userId, 'sessionHistory', sessionId);
      await updateDoc(docRef, { userNotes: userNotes ?? '' });
      logger.log('✅ Session notes updated:', sessionId);
    } catch (error) {
      logger.error('❌ Error updating session notes:', error);
      throw error;
    }
  }

  /**
   * Get session history
   */
  async getSessionHistory(userId, sessionId) {
    try {
      const docRef = doc(firestore, 'users', userId, 'sessionHistory', sessionId);
      const docSnap = await getDoc(docRef);
      return docSnap.exists() ? docSnap.data() : null;
    } catch (error) {
      logger.error('❌ Error getting session history:', error);
      return null;
    }
  }

  /**
   * Get session history for a user with pagination support
   * @param {string} userId - User ID
   * @param {number} limit - Number of sessions to fetch (default: 20)
   * @param {DocumentSnapshot} startAfter - Last document from previous page (for pagination)
   * @returns {Promise<{sessions: Object, lastDoc: DocumentSnapshot|null, hasMore: boolean}>}
   */
  async getSessionHistoryPaginated(userId, limit = 20, startAfter = null) {
    try {
      logger.log('📊 Getting paginated session history for user:', userId, { limit, hasStartAfter: !!startAfter });
      
      const sessionHistoryRef = collection(firestore, 'users', userId, 'sessionHistory');
      
      // Build query with pagination
      let q;
      try {
        // Try with orderBy first (preferred for pagination)
        if (startAfter) {
          q = query(
            sessionHistoryRef,
            orderBy('completedAt', 'desc'),
            startAfter(startAfter),
            limit(limit)
          );
        } else {
          q = query(
            sessionHistoryRef,
            orderBy('completedAt', 'desc'),
            limit(limit)
          );
        }
        const querySnapshot = await getDocs(q);
        logger.log('✅ Session history paginated query with orderBy succeeded:', querySnapshot.size, 'docs');
        
        const sessionHistory = {};
        let lastDoc = null;
        
        querySnapshot.forEach((doc) => {
          const data = doc.data();
          sessionHistory[doc.id] = {
            ...data,
            id: doc.id,
            completionDocId: doc.id, // For compatibility
          };
          lastDoc = doc; // Track last document for next page
        });
        
        const hasMore = querySnapshot.size === limit; // If we got full limit, there might be more
        
        logger.log('✅ Retrieved paginated session history:', Object.keys(sessionHistory).length, 'sessions, hasMore:', hasMore);
        return {
          sessions: sessionHistory,
          lastDoc,
          hasMore
        };
      } catch (orderByError) {
        // If orderBy fails (likely missing index), fallback to non-paginated query
        logger.warn('⚠️ OrderBy query failed, using fallback (no pagination):', orderByError.message);
        const querySnapshot = await getDocs(sessionHistoryRef);
        
        const sessionHistory = {};
        querySnapshot.forEach((doc) => {
          const data = doc.data();
          sessionHistory[doc.id] = {
            ...data,
            id: doc.id,
            completionDocId: doc.id,
          };
        });
        
        // Sort manually by completedAt
        const sortedEntries = Object.entries(sessionHistory).sort((a, b) => {
          const dateA = a[1].completedAt ? new Date(a[1].completedAt) : new Date(0);
          const dateB = b[1].completedAt ? new Date(b[1].completedAt) : new Date(0);
          return dateB - dateA; // Descending order (newest first)
        });
        
        const sortedHistory = {};
        sortedEntries.forEach(([id, data]) => {
          sortedHistory[id] = data;
        });
        
        logger.debug('✅ Retrieved session history (fallback, no pagination):', Object.keys(sortedHistory).length, 'sessions');
        return {
          sessions: sortedHistory,
          lastDoc: null,
          hasMore: false // Can't paginate without orderBy
        };
      }
    } catch (error) {
      logger.error('❌ Error getting paginated session history:', error);
      logger.error('❌ Error details:', {
        message: error.message,
        code: error.code,
        stack: error.stack
      });
      return {
        sessions: {},
        lastDoc: null,
        hasMore: false
      };
    }
  }

  /**
   * Get all session history for a user (backward compatibility - loads all at once)
   * @deprecated Use getSessionHistoryPaginated() for better performance
   */
  async getAllSessionHistory(userId) {
    try {
      logger.log('📊 Getting all session history for user:', userId);
      
      const sessionHistoryRef = collection(firestore, 'users', userId, 'sessionHistory');
      
      // Try with orderBy first, but fallback to query without orderBy if index is missing
      let querySnapshot;
      try {
        const q = query(sessionHistoryRef, orderBy('completedAt', 'desc'));
        querySnapshot = await getDocs(q);
        logger.log('✅ Session history query with orderBy succeeded');
      } catch (orderByError) {
        // If orderBy fails (likely missing index), try without orderBy
        logger.warn('⚠️ OrderBy query failed, trying without orderBy:', orderByError.message);
        querySnapshot = await getDocs(sessionHistoryRef);
        logger.log('✅ Session history query without orderBy succeeded');
      }
      
      const sessionHistory = {};
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        sessionHistory[doc.id] = {
          ...data,
          id: doc.id, // Include document ID
        };
      });
      
      // If we didn't use orderBy, sort manually by completedAt
      if (Object.keys(sessionHistory).length > 0) {
        const sortedEntries = Object.entries(sessionHistory).sort((a, b) => {
          const dateA = a[1].completedAt ? new Date(a[1].completedAt) : new Date(0);
          const dateB = b[1].completedAt ? new Date(b[1].completedAt) : new Date(0);
          return dateB - dateA; // Descending order (newest first)
        });
        
        const sortedHistory = {};
        sortedEntries.forEach(([id, data]) => {
          sortedHistory[id] = data;
        });
        
        logger.log('✅ Retrieved session history:', Object.keys(sortedHistory).length, 'sessions');
        return sortedHistory;
      }
      
      logger.log('✅ Retrieved session history:', Object.keys(sessionHistory).length, 'sessions');
      return sessionHistory;
    } catch (error) {
      logger.error('❌ Error getting all session history:', error);
      logger.error('❌ Error details:', {
        message: error.message,
        code: error.code,
        stack: error.stack
      });
      return {};
    }
  }

  /**
   * Choose the best-performing set from a list of sets.
   * Currently prioritizes weight, with reps as a tiebreaker.
   */
  getBestSetFromFilteredSets(filteredSets) {
    if (!Array.isArray(filteredSets) || filteredSets.length === 0) return null;

    const getScore = (set) => {
      const weight = set && set.weight ? parseFloat(set.weight) : 0;
      const reps = set && set.reps ? parseFloat(set.reps) : 0;
      if (isNaN(weight) && isNaN(reps)) return 0;
      const w = isNaN(weight) ? 0 : weight;
      const r = isNaN(reps) ? 0 : reps;
      // Give weight much higher importance than reps
      return w * 1000 + r;
    };

    let bestSet = filteredSets[0];
    let bestScore = getScore(bestSet);

    for (let i = 1; i < filteredSets.length; i++) {
      const candidate = filteredSets[i];
      const candidateScore = getScore(candidate);
      if (candidateScore > bestScore) {
        bestSet = candidate;
        bestScore = candidateScore;
      }
    }

    return bestSet || null;
  }

  /**
   * Update per-user, per-exercise last performance document with the best set of this session.
   * Stored under: users/{userId}/exerciseLastPerformance/{exerciseKey}
   */
  async updateLastExercisePerformance(userId, exercise, sessionData, filteredSets) {
    try {
      if (!userId || !exercise || !sessionData || !Array.isArray(filteredSets) || filteredSets.length === 0) {
        return;
      }

      if (!exercise.libraryId || exercise.libraryId === 'unknown' ||
          !exercise.exerciseName || exercise.exerciseName === 'Unknown Exercise') {
        logger.log('⚠️ Skipping last performance update - invalid exercise data:', {
          libraryId: exercise.libraryId,
          exerciseName: exercise.exerciseName
        });
        return;
      }

      const exerciseKey = `${exercise.libraryId}_${exercise.exerciseName}`;
      const bestSet = this.getBestSetFromFilteredSets(filteredSets);
      if (!bestSet) return;

      const lastPerformedAt = sessionData.completedAt || new Date().toISOString();

      const normalizeDate = (value) => {
        if (!value) return null;
        if (typeof value === 'string') {
          const d = new Date(value);
          return isNaN(d.getTime()) ? null : d;
        }
        if (value && typeof value.toDate === 'function') {
          const d = value.toDate();
          return isNaN(d.getTime()) ? null : d;
        }
        const d = new Date(value);
        return isNaN(d.getTime()) ? null : d;
      };

      const docRef = doc(firestore, 'users', userId, 'exerciseLastPerformance', exerciseKey);
      const existingSnap = await getDoc(docRef);

      if (existingSnap.exists()) {
        const existing = existingSnap.data();
        const existingDate = normalizeDate(existing?.lastPerformedAt);
        const newDate = normalizeDate(lastPerformedAt);

        if (existingDate && newDate && existingDate >= newDate) {
          logger.log('ℹ️ Skipping last performance update - existing entry is newer or same date:', {
            exerciseKey,
            existingLastPerformedAt: existing.lastPerformedAt,
            newLastPerformedAt: lastPerformedAt
          });
          return;
        }
      }

      const lastPerformanceData = this.cleanFirestoreData({
        exerciseId: exercise.exerciseId,
        exerciseName: exercise.exerciseName,
        libraryId: exercise.libraryId,
        lastSessionId: sessionData.sessionId,
        lastPerformedAt,
        totalSets: filteredSets.length,
        bestSet
      });

      await setDoc(docRef, lastPerformanceData);
      logger.log('✅ Exercise last performance updated:', { exerciseKey, lastPerformedAt });
    } catch (error) {
      logger.error('❌ Error updating last exercise performance:', {
        exerciseName: exercise?.exerciseName,
        libraryId: exercise?.libraryId,
        error
      });
      // Non-critical; do not throw
    }
  }

  /**
   * Get last performance document for an exercise (best set of most recent session).
   */
  async getLastExercisePerformance(userId, exerciseKey) {
    try {
      const docRef = doc(firestore, 'users', userId, 'exerciseLastPerformance', exerciseKey);
      const docSnap = await getDoc(docRef);
      return docSnap.exists() ? docSnap.data() : null;
    } catch (error) {
      logger.error('❌ Error getting last exercise performance:', { userId, exerciseKey, error });
      return null;
    }
  }

  /**
   * Get all exercise keys that have been completed (from exercise history directly)
   * @param {string} userId - User ID
   * @returns {Array} - Array of unique exercise keys
   */
  async getAllExerciseKeysFromExerciseHistory(userId) {
    try {
      logger.log('📊 Getting all exercise keys from exercise history for user:', userId);
      
      // Get all exercise history documents directly
      const exerciseHistoryRef = collection(firestore, 'users', userId, 'exerciseHistory');
      const querySnapshot = await getDocs(exerciseHistoryRef);
      
      // Extract exercise keys directly from exercise history
      const exerciseKeys = [];
      querySnapshot.forEach((doc) => {
        const exerciseKey = doc.id; // Document ID is the exercise key
        exerciseKeys.push(exerciseKey);
      });
      
      logger.log('✅ Found', exerciseKeys.length, 'unique exercise keys from exercise history');
      return exerciseKeys;
    } catch (error) {
      logger.error('❌ Error getting exercise keys from exercise history:', error);
      return [];
    }
  }

  /**
   * Get all exercise keys that have been completed (from session history)
   * @param {string} userId - User ID
   * @returns {Array} - Array of unique exercise keys
   */
  async getAllExerciseKeysFromHistory(userId) {
    try {
      logger.log('📊 Getting all exercise keys from session history for user:', userId);
      
      const sessionHistory = await this.getAllSessionHistory(userId);
      const exerciseKeys = [];
      
      // Extract exercise keys from all sessions
      Object.values(sessionHistory).forEach(session => {
        if (session.exercises) {
          Object.keys(session.exercises).forEach(exerciseKey => {
            if (!exerciseKeys.includes(exerciseKey)) {
              exerciseKeys.push(exerciseKey);
            }
          });
        }
      });
      
      logger.log('✅ Found', exerciseKeys.length, 'unique exercise keys from history');
      return exerciseKeys;
    } catch (error) {
      logger.error('❌ Error getting exercise keys from history:', error);
      return [];
    }
  }

  /**
   * Get dates (YYYY-MM-DD) that have a completed session for a course within a date range.
   * Used by DailyWorkoutScreen calendar to show green days (low-ticket and one-on-one).
   */
  async getDatesWithCompletedSessionsForCourse(userId, courseId, startDate, endDate) {
    const start = typeof startDate === 'string' ? new Date(startDate + 'T00:00:00') : new Date(startDate);
    const end = typeof endDate === 'string' ? new Date(endDate + 'T23:59:59.999') : new Date(endDate);
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);

    const sessionHistoryRef = collection(firestore, 'users', userId, 'sessionHistory');

    const parseTimestamp = (completedAt) => {
      if (!completedAt) return null;
      if (typeof completedAt === 'string') {
        return new Date(completedAt);
      }
      if (completedAt?.toDate) {
        return completedAt.toDate();
      }
      return new Date(completedAt);
    };

    const dates = new Set();

    try {
      let primarySnapshot = null;
      try {
        const primaryQuery = query(
          sessionHistoryRef,
          where('courseId', '==', courseId),
          where('completedAt', '>=', start),
          where('completedAt', '<=', end)
        );
        primarySnapshot = await getDocs(primaryQuery);
      } catch (indexError) {
        logger.warn('getDatesWithCompletedSessionsForCourse: indexed query failed, will use fallback:', indexError?.message);
      }

      if (primarySnapshot && !primarySnapshot.empty) {
        primarySnapshot.forEach((docSnap) => {
          const data = docSnap.data();
          if (data.courseId !== courseId) return;
          const ts = parseTimestamp(data.completedAt);
          if (!ts || ts < start || ts > end) return;
          const y = ts.getFullYear();
          const m = String(ts.getMonth() + 1).padStart(2, '0');
          const d = String(ts.getDate()).padStart(2, '0');
          dates.add(`${y}-${m}-${d}`);
        });
        return Array.from(dates);
      }

      // Fallback: fetch recent history and filter in memory (handles string completedAt and older data)
      try {
        const fallbackQuery = query(
          sessionHistoryRef,
          orderBy('completedAt', 'desc'),
          limit(200)
        );
        const fallbackSnapshot = await getDocs(fallbackQuery);
        fallbackSnapshot.forEach((docSnap) => {
          const data = docSnap.data();
          if (data.courseId !== courseId) return;
          const ts = parseTimestamp(data.completedAt);
          if (!ts || ts < start || ts > end) return;
          const y = ts.getFullYear();
          const m = String(ts.getMonth() + 1).padStart(2, '0');
          const d = String(ts.getDate()).padStart(2, '0');
          dates.add(`${y}-${m}-${d}`);
        });
        return Array.from(dates);
      } catch (fallbackError) {
        logger.error('❌ getDatesWithCompletedSessionsForCourse fallback failed:', fallbackError);
        return [];
      }
    } catch (error) {
      logger.error('❌ getDatesWithCompletedSessionsForCourse:', error);
      return [];
    }
  }
}

export default new ExerciseHistoryService();
