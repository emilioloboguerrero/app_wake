// Workout Session Service - Manages local workout sessions with auto-save
import AsyncStorage from '@react-native-async-storage/async-storage';
import firestoreService from '../services/firestoreService';

import logger from '../utils/logger.js';
// Session states
export const SessionStates = {
  CREATING: "creating",
  ACTIVE: "active", 
  AUTO_SAVING: "auto_saving",
  PAUSED: "paused",
  COMPLETING: "completing",
  COMPLETED: "completed",
  CANCELLED: "cancelled",
  UPLOAD_PENDING: "upload_pending",
  UPLOAD_FAILED: "upload_failed",
  UPLOADED: "uploaded"
};

class WorkoutSessionService {
  /**
   * Start a new workout session
   * @param {string} courseId - Course ID
   * @param {string} sessionId - Session ID from course structure
   * @param {string} userId - User ID
   */
  async startSession(courseId, sessionId, userId) {
    try {
      logger.log('🏋️ Starting workout session:', { courseId, sessionId, userId });
      
      // Check if there's already an active session
      const existingSession = await this.getCurrentSession();
      if (existingSession && existingSession.status === SessionStates.ACTIVE) {
        logger.log('⚠️ Found existing active session, completing it first');
        await this.completeSession();
      }
      
      // Create new session
      const sessionData = {
        sessionId: `session_${Date.now()}`,
        userId,
        courseId,
        sessionType: sessionId, // e.g., "session-1" from course structure
        status: SessionStates.ACTIVE,
        startTime: new Date().toISOString(),
        
        // Progress tracking
        currentModule: null,
        currentSession: null,
        currentExercise: null,
        currentSet: 0,
        
        // Performance data
        sets: [],
        
        // Auto-save metadata
        lastSaved: new Date().toISOString(),
        saveCount: 0,
        backupCount: 0
      };
      
      // Save initial session
      await this.saveSessionData(sessionData);
      
      logger.log('✅ Workout session started:', sessionData.sessionId);
      return sessionData;
      
    } catch (error) {
      logger.error('❌ Failed to start session:', error);
      throw error;
    }
  }
  
  /**
   * Add a completed set to the current session
   * @param {Object} setData - Set performance data
   */
  async addSetToSession(setData) {
    try {
      const session = await this.getCurrentSession();
      if (!session || session.status !== SessionStates.ACTIVE) {
        throw new Error('No active session found');
      }
      
      // Validate set data structure
      this.validateSetData(setData);
      
      // Add set to session with metadata
      const enrichedSetData = {
        ...setData,
        completedAt: new Date().toISOString(),
        setNumber: session.sets.length + 1,
        sessionId: session.sessionId
      };
      
      session.sets.push(enrichedSetData);
      
      // Update session progress
      session.currentSet = session.sets.length;
      session.lastActivity = new Date().toISOString();
      session.currentExercise = setData.exercise_id;
      session.currentModule = setData.module_id;
      session.currentSession = setData.session_id;
      
      // CRITICAL: Auto-save after every set
      await this.autoSaveSession(session);
      
      logger.log(`✅ Set added to session (${session.sets.length} total sets)`);
      return session;
      
    } catch (error) {
      logger.error('❌ Failed to add set to session:', error);
      throw error;
    }
  }
  
  /**
   * Complete the current workout session
   */
  async completeSession() {
    try {
      const session = await this.getCurrentSession();
      if (!session) {
        logger.log('ℹ️ No active session to complete');
        return null;
      }
      
      logger.log('🏁 Completing workout session:', session.sessionId);
      
      // Update session completion data
      session.status = SessionStates.COMPLETED;
      session.endTime = new Date().toISOString();
      session.duration_minutes = this.calculateDuration(session);
      session.completedAt = new Date().toISOString();
      
      // Calculate session summary
      session.sessionSummary = this.calculateSessionSummary(session);
      
      // Final save
      await this.saveSessionData(session);
      
      // Add to upload queue
      await this.addToUploadQueue(session);
      
      logger.log('✅ Session completed:', {
        sessionId: session.sessionId,
        duration: session.duration_minutes,
        sets: session.sets.length
      });
      
      return session;
      
    } catch (error) {
      logger.error('❌ Failed to complete session:', error);
      throw error;
    }
  }
  
  /**
   * Cancel the current workout session
   */
  async cancelSession() {
    try {
      const session = await this.getCurrentSession();
      if (!session) {
        return null;
      }
      
      logger.log('❌ Cancelling workout session:', session.sessionId);
      
      session.status = SessionStates.CANCELLED;
      session.cancelledAt = new Date().toISOString();
      
      await this.saveSessionData(session);
      
      // Clean up active session
      await AsyncStorage.removeItem('active_session');
      
      logger.log('✅ Session cancelled');
      return session;
      
    } catch (error) {
      logger.error('❌ Failed to cancel session:', error);
      throw error;
    }
  }
  
  /**
   * Get current active session
   */
  async getCurrentSession() {
    try {
      const sessionData = await AsyncStorage.getItem('active_session');
      return sessionData ? JSON.parse(sessionData) : null;
    } catch (error) {
      logger.error('❌ Failed to get current session:', error);
      return null;
    }
  }
  
  /**
   * Auto-save session after every set (critical for crash protection)
   */
  async autoSaveSession(sessionData) {
    try {
      // Update save metadata
      sessionData.lastSaved = new Date().toISOString();
      sessionData.saveCount += 1;
      
      // Create multiple save points for redundancy
      await Promise.all([
        // Primary save
        AsyncStorage.setItem('active_session', JSON.stringify(sessionData)),
        
        // Rotating backup (keep last 3 saves)
        AsyncStorage.setItem(
          `session_backup_${sessionData.saveCount % 3}`, 
          JSON.stringify(sessionData)
        ),
        
        // Quick metadata for recovery
        AsyncStorage.setItem('session_metadata', JSON.stringify({
          sessionId: sessionData.sessionId,
          setCount: sessionData.sets.length,
          lastSaved: sessionData.lastSaved,
          status: sessionData.status,
          userId: sessionData.userId,
          courseId: sessionData.courseId
        }))
      ]);
      
      logger.log(`💾 Auto-saved session after set ${sessionData.sets.length}`);
      
    } catch (error) {
      logger.error('❌ Auto-save failed:', error);
      // Don't throw error - workout should continue even if save fails
    }
  }
  
  /**
   * Save session data to local storage
   */
  async saveSessionData(sessionData) {
    try {
      await AsyncStorage.setItem('active_session', JSON.stringify(sessionData));
    } catch (error) {
      logger.error('❌ Failed to save session data:', error);
      throw error;
    }
  }
  
  /**
   * Add completed session to upload queue
   */
  async addToUploadQueue(sessionData) {
    try {
      // Get current upload queue
      const queueData = await AsyncStorage.getItem('upload_queue');
      const queue = queueData ? JSON.parse(queueData) : { sessions: [], queueMetadata: {} };
      
      // Add session to queue
      queue.sessions.push({
        sessionId: sessionData.sessionId,
        status: 'pending',
        attempts: 0,
        lastAttempt: null,
        priority: 1, // High priority for recent sessions
        size_kb: this.estimateSessionSize(sessionData),
        queuedAt: new Date().toISOString()
      });
      
      // Update queue metadata
      queue.queueMetadata = {
        totalSessions: queue.sessions.length,
        totalSize_kb: queue.sessions.reduce((sum, s) => sum + s.size_kb, 0),
        lastUpdated: new Date().toISOString()
      };
      
      // Save updated queue
      await AsyncStorage.setItem('upload_queue', JSON.stringify(queue));
      
      // Store complete session data for upload
      await AsyncStorage.setItem(
        `pending_session_${sessionData.sessionId}`, 
        JSON.stringify(sessionData)
      );
      
      logger.log('📤 Session added to upload queue:', sessionData.sessionId);
      
    } catch (error) {
      logger.error('❌ Failed to add session to upload queue:', error);
    }
  }
  
  /**
   * Validate set data structure
   */
  validateSetData(setData) {
    // Validate required fields
    if (!setData.exercise_id) {
      throw new Error('Set data missing exercise_id');
    }
    
    if (!setData.performance || typeof setData.performance !== 'object') {
      throw new Error('Set data missing performance object');
    }
    
    // Validate performance data (flexible for all disciplines)
    const performance = setData.performance;
    
    // Validate numeric fields if present
    if (performance.reps !== undefined && (typeof performance.reps !== 'number' || performance.reps < 0)) {
      throw new Error('Invalid reps value');
    }
    
    if (performance.weight_kg !== undefined && (typeof performance.weight_kg !== 'number' || performance.weight_kg < 0)) {
      throw new Error('Invalid weight value');
    }
    
    if (performance.time_seconds !== undefined && (typeof performance.time_seconds !== 'number' || performance.time_seconds < 0)) {
      throw new Error('Invalid time value');
    }
    
    return true;
  }
  
  /**
   * Calculate session duration in minutes
   */
  calculateDuration(session) {
    if (!session.startTime || !session.endTime) {
      return 0;
    }
    
    const start = new Date(session.startTime);
    const end = new Date(session.endTime);
    const durationMs = end - start;
    const durationMinutes = Math.round(durationMs / (1000 * 60));
    
    return durationMinutes;
  }
  
  /**
   * Calculate session summary for analytics
   */
  calculateSessionSummary(session) {
    const sets = session.sets || [];
    
    // Basic counts
    const totalSets = sets.length;
    const uniqueExercises = [...new Set(sets.map(set => set.exercise_id))].length;
    
    // Calculate total volume (for strength training)
    const totalVolume = sets.reduce((sum, set) => {
      const reps = set.performance.reps || 0;
      const weight = set.performance.weight_kg || 0;
      return sum + (reps * weight);
    }, 0);
    
    // Calculate average RIR (if available)
    const rirSets = sets.filter(set => set.performance.rir !== undefined);
    const averageRir = rirSets.length > 0 
      ? rirSets.reduce((sum, set) => sum + set.performance.rir, 0) / rirSets.length 
      : null;
    
    return {
      total_sets: totalSets,
      total_exercises: uniqueExercises,
      total_volume_kg: totalVolume,
      average_rir: averageRir ? Math.round(averageRir * 10) / 10 : null,
      completion_percentage: 100 // Assume 100% if session completed
    };
  }
  
  /**
   * Estimate session data size for queue management
   */
  estimateSessionSize(sessionData) {
    const jsonString = JSON.stringify(sessionData);
    const sizeInBytes = new Blob([jsonString]).size;
    const sizeInKB = sizeInBytes / 1024;
    return Math.round(sizeInKB);
  }
  
  /**
   * Create progress session using new flat structure
   * Document ID: {userId}_{courseId}_{sessionId}
   */
  async createProgressSession(session) {
    try {
      logger.log('📊 Creating progress session:', session.sessionId);
      
      // Group sets by exercise for better organization
      const exercisesMap = {};
      (session.sets || []).forEach(set => {
        const exerciseId = set.exercise_id || 'unknown';
        if (!exercisesMap[exerciseId]) {
          exercisesMap[exerciseId] = {
            exercise_id: exerciseId,
            exercise_name: set.exercise_name || 'Unknown Exercise',
            sets: []
          };
        }
        
        exercisesMap[exerciseId].sets.push({
          set_number: set.set_number || 1,
          completed_at: set.completed_at || new Date().toISOString(),
          performance: {
            // Include all user-entered data (weight, reps, RIR, etc.) - only if they exist
            ...(set.weight !== undefined && { weight: set.weight }),
            ...(set.reps !== undefined && { reps: set.reps }),
            ...(set.rir !== undefined && { rir: set.rir }),
            ...(set.time !== undefined && { time: set.time }),
            ...(set.distance !== undefined && { distance: set.distance }),
            ...(set.pace !== undefined && { pace: set.pace }),
            ...(set.heart_rate !== undefined && { heart_rate: set.heart_rate }),
            ...(set.calories !== undefined && { calories: set.calories }),
            ...(set.rest_time !== undefined && { rest_time: set.rest_time }),
            ...(set.duration !== undefined && { duration: set.duration }),
            // Include any other fields that might be present (only if not undefined)
            ...Object.keys(set).reduce((acc, key) => {
              if (!['exercise_id', 'exercise_name', 'set_number', 'completed_at', 'module_id', 'session_id', 'course_id'].includes(key) && set[key] !== undefined) {
                acc[key] = set[key];
              }
              return acc;
            }, {})
          }
        });
      });
      
      const sessionData = {
        user_id: session.userId || 'unknown',
        course_id: session.courseId || 'unknown',
        session_id: session.sessionId || 'unknown',
        status: 'completed',
        completed_at: session.completedAt || new Date().toISOString(),
        duration_minutes: session.duration_minutes || 0,
        exercises: Object.values(exercisesMap),
        summary: {
          total_sets: session.sets?.length || 0,
          total_exercises: Object.keys(exercisesMap).length,
          total_reps: (session.sets || []).reduce((sum, set) => sum + (set.reps || 0), 0),
          total_volume: (session.sets || []).reduce((sum, set) => sum + ((set.reps || 0) * (set.weight || 0)), 0)
        }
      };
      
      const progressId = await firestoreService.createProgressSession(sessionData);
      logger.log('✅ Progress session created:', progressId);
      
      return progressId;
    } catch (error) {
      logger.error('❌ Failed to create progress session:', error);
      throw error;
    }
  }

  /**
   * Get session progress information
   */
  async getSessionProgress() {
    try {
      const session = await this.getCurrentSession();
      if (!session) {
        return null;
      }
      
      return {
        sessionId: session.sessionId,
        status: session.status,
        setsCompleted: session.sets.length,
        currentExercise: session.currentExercise,
        duration: this.calculateDuration({ 
          ...session, 
          endTime: new Date().toISOString() 
        }),
        lastSaved: session.lastSaved
      };
    } catch (error) {
      logger.error('❌ Failed to get session progress:', error);
      return null;
    }
  }

  /**
   * Get completed session data for completion screen
   */
  async getCompletedSessionData(sessionId) {
    try {
      const sessionKey = `workout_session_${sessionId}`;
      const sessionData = await AsyncStorage.getItem(sessionKey);
      
      if (sessionData) {
        const session = JSON.parse(sessionData);
        logger.log('📊 Retrieved completed session data:', session.sessionId);
        return session;
      }
      
      logger.log('📊 No completed session data found for:', sessionId);
      return null;
    } catch (error) {
      logger.error('❌ Failed to get completed session data:', error);
      return null;
    }
  }
}

export default new WorkoutSessionService();
