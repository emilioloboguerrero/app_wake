// Exercise History Service - Manages exercise and session history subcollections
import { doc, getDoc, setDoc, serverTimestamp, collection, getDocs, query, orderBy, limit, startAfter } from 'firebase/firestore';
import { firestore } from '../config/firebase';
import logger from '../utils/logger.js';

class ExerciseHistoryService {
  /**
   * Add session data to both exercise and session history
   */
  async addSessionData(userId, sessionData) {
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
      
      // Update session-specific subcollection
      await this.updateSessionHistory(userId, sessionData);
      
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
      
      logger.log('✅ Exercise history updated:', exerciseKey);
    } catch (error) {
      logger.error('❌ Error updating exercise history for:', exercise.exerciseName, error);
      // Don't throw - continue with other exercises
    }
  }
  
  /**
   * Update session history subcollection
   */
  async updateSessionHistory(userId, sessionData) {
    try {
      logger.log('📋 Updating session history:', {
        sessionId: sessionData.sessionId,
        sessionName: sessionData.sessionName,
        courseName: sessionData.courseName,
        exercisesCount: sessionData.exercises?.length
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
        sessionName: sessionData.sessionName || 'Workout Session', // ✅ Add session name
        completedAt: sessionData.completedAt,
        duration: sessionData.duration || 0,
        exercises: {}
      };
      
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
}

export default new ExerciseHistoryService();
