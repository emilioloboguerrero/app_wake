// Workout Session Service - Manages local workout sessions with auto-save
// TODO: This subsystem is disconnected from the actual completion flow.
// It writes to active_session, session_backup_N, session_metadata, upload_queue, and pending_session_*
// AsyncStorage keys, but addToUploadQueue feeds into uploadService.uploadSession which is a no-op.
// The actual session persistence goes through sessionService.js → POST /workout/complete.
// Audit callers and either connect this to POST /workout/complete or remove.
import AsyncStorage from '@react-native-async-storage/async-storage';
import apiService from '../services/apiService';
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
      // Check if there's already an active session
      const existingSession = await this.getCurrentSession();
      if (existingSession && existingSession.status === SessionStates.ACTIVE) {
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
      
      return sessionData;
      
    } catch (error) {
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
        return null;
      }
      
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
      
      session.status = SessionStates.CANCELLED;
      session.cancelledAt = new Date().toISOString();
      
      await this.saveSessionData(session);
      
      // Clean up active session
      await AsyncStorage.removeItem('active_session');
      
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
        return JSON.parse(sessionData);
      }

      return null;
    } catch (error) {
      logger.error('❌ Failed to get completed session data:', error);
      return null;
    }
  }
}

export default new WorkoutSessionService();
