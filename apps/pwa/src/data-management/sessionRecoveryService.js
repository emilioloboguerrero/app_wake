// Session Recovery Service - Handles crash recovery and session restoration
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SessionStates } from './workoutSessionService';
import uploadService from './uploadService';

import logger from '../utils/logger.js';
import apiClient, { WakeApiError } from '../utils/apiClient.js';
import { auth } from '../config/firebase';
class SessionRecoveryService {
  /**
   * Initialize recovery system on app startup
   */
  async initializeRecovery() {
    try {
      // Check for incomplete sessions
      await this.detectAndRecoverSessions();
      
      // Process any pending uploads
      await uploadService.processUploadQueue();
      
    } catch (error) {
      logger.error('❌ Recovery initialization failed:', error);
    }
  }
  
  /**
   * Detect and handle incomplete sessions
   */
  async detectAndRecoverSessions() {
    try {
      // Check for active session
      const activeSessionData = await AsyncStorage.getItem('current_session');
      if (activeSessionData) {
        const sessionData = JSON.parse(activeSessionData);
        await this.handleIncompleteSession(sessionData);
      }

      // Check for session metadata (backup recovery)
      const metadataData = await AsyncStorage.getItem('session_metadata');
      if (metadataData && !activeSessionData) {
        const metadata = JSON.parse(metadataData);
        await this.handleOrphanedMetadata(metadata);
      }

      // Check for backup sessions
      await this.checkBackupSessions();

      // If no local session was found, check the server for a persisted checkpoint
      if (!activeSessionData && auth.currentUser) {
        await this.recoverFromServerCheckpoint();
      }

    } catch (error) {
      logger.error('❌ Session detection failed:', error);
    }
  }

  /**
   * Attempt to recover an in-progress workout from the server checkpoint.
   * Called only when no local current_session was found and the user is authenticated.
   */
  async recoverFromServerCheckpoint() {
    try {
      const response = await apiClient.get('/workout/checkpoint');
      if (!response || !response.data) {
        return;
      }

      const checkpoint = response.data;
      logger.warn('🔄 Sesión de entrenamiento activa encontrada en el servidor, restaurando...');

      // Write the server checkpoint into AsyncStorage under the key that the
      // existing localStorage recovery path already watches.
      await AsyncStorage.setItem('current_session', JSON.stringify(checkpoint));

      // Re-run recovery now that the data is present locally.
      const restored = await AsyncStorage.getItem('current_session');
      if (restored) {
        const sessionData = JSON.parse(restored);
        await this.handleIncompleteSession(sessionData);
      }

    } catch (error) {
      if (error instanceof WakeApiError && error.status === 404) {
        // No active checkpoint on the server — expected case, ignore silently.
        return;
      }
      logger.error('❌ Error al recuperar sesión del servidor:', error);
    }
  }
  
  /**
   * Handle incomplete session found on startup
   */
  async handleIncompleteSession(sessionData) {
    try {
      const timeSinceLastSave = Date.now() - new Date(sessionData.lastSaved).getTime();
      const hoursAgo = timeSinceLastSave / (1000 * 60 * 60);
      
      if (hoursAgo > 24) {
        await this.discardOldSession(sessionData);
      } else {
        await this.autoCompleteSession(sessionData);
      }
      
    } catch (error) {
      logger.error('❌ Failed to handle incomplete session:', error);
    }
  }
  
  /**
   * Auto-complete interrupted session
   */
  async autoCompleteSession(sessionData) {
    try {
      // Mark as completed (no user interaction needed)
      sessionData.status = SessionStates.COMPLETED;
      sessionData.endTime = sessionData.lastSaved;
      sessionData.completedAt = sessionData.lastSaved;
      sessionData.recovery_note = 'Auto-completed after app interruption';
      
      // Calculate duration and summary
      sessionData.duration_minutes = this.calculateDuration(sessionData);
      sessionData.sessionSummary = this.calculateSessionSummary(sessionData);
      
      // Add to upload queue
      await this.addToUploadQueue(sessionData);
      
      // Clear active session
      await AsyncStorage.removeItem('current_session');
      
    } catch (error) {
      logger.error('❌ Failed to auto-complete session:', error);
    }
  }
  
  /**
   * Discard old abandoned session
   */
  async discardOldSession(sessionData) {
    try {
      // Remove all traces of old session
      await AsyncStorage.removeItem('current_session');
      await AsyncStorage.removeItem('session_metadata');
      
      // Remove backup sessions
      for (let i = 0; i < 3; i++) {
        await AsyncStorage.removeItem(`session_backup_${i}`);
      }
      
    } catch (error) {
      logger.error('❌ Failed to discard old session:', error);
    }
  }
  
  /**
   * Handle orphaned metadata (session data lost but metadata exists)
   */
  async handleOrphanedMetadata(metadata) {
    try {
      // Try to recover from backup sessions
      let recoveredSession = null;
      
      for (let i = 0; i < 3; i++) {
        const backupData = await AsyncStorage.getItem(`session_backup_${i}`);
        if (backupData) {
          const backup = JSON.parse(backupData);
          if (backup.sessionId === metadata.sessionId) {
            recoveredSession = backup;
            break;
          }
        }
      }
      
      if (recoveredSession) {
        await this.autoCompleteSession(recoveredSession);
      } else {
        await AsyncStorage.removeItem('session_metadata');
      }
      
    } catch (error) {
      logger.error('❌ Failed to handle orphaned metadata:', error);
    }
  }
  
  /**
   * Check and recover from backup sessions
   */
  async checkBackupSessions() {
    try {
      const backupSessions = [];
      
      // Check all backup slots
      for (let i = 0; i < 3; i++) {
        const backupData = await AsyncStorage.getItem(`session_backup_${i}`);
        if (backupData) {
          backupSessions.push(JSON.parse(backupData));
        }
      }
      
      // Find most recent backup if no active session
      if (backupSessions.length > 0) {
        const mostRecent = backupSessions.reduce((latest, current) => 
          new Date(current.lastSaved) > new Date(latest.lastSaved) ? current : latest
        );
        
        const hoursAgo = (Date.now() - new Date(mostRecent.lastSaved).getTime()) / (1000 * 60 * 60);
        
        if (hoursAgo < 6 && mostRecent.status === SessionStates.ACTIVE) {
          await this.autoCompleteSession(mostRecent);
        }
      }
      
    } catch (error) {
      logger.error('❌ Failed to check backup sessions:', error);
    }
  }
  
  /**
   * Add session to upload queue
   */
  async addToUploadQueue(sessionData) {
    try {
      // Get current queue
      const queueData = await AsyncStorage.getItem('upload_queue');
      const queue = queueData ? JSON.parse(queueData) : { sessions: [], queueMetadata: {} };
      
      // Add session to queue
      queue.sessions.push({
        sessionId: sessionData.sessionId,
        status: 'pending',
        attempts: 0,
        lastAttempt: null,
        priority: 1,
        size_kb: this.estimateSessionSize(sessionData),
        queuedAt: new Date().toISOString()
      });
      
      // Update metadata
      queue.queueMetadata = {
        totalSessions: queue.sessions.length,
        totalSize_kb: queue.sessions.reduce((sum, s) => sum + s.size_kb, 0),
        lastUpdated: new Date().toISOString()
      };
      
      // Save queue and session data
      await Promise.all([
        AsyncStorage.setItem('upload_queue', JSON.stringify(queue)),
        AsyncStorage.setItem(`pending_session_${sessionData.sessionId}`, JSON.stringify(sessionData))
      ]);
      
    } catch (error) {
      logger.error('❌ Failed to add session to upload queue:', error);
    }
  }
  
  /**
   * Calculate session duration
   */
  calculateDuration(session) {
    if (!session.startTime || !session.endTime) {
      return 0;
    }
    
    const start = new Date(session.startTime);
    const end = new Date(session.endTime);
    const durationMs = end - start;
    return Math.round(durationMs / (1000 * 60)); // Minutes
  }
  
  /**
   * Calculate session summary
   */
  calculateSessionSummary(session) {
    const sets = session.sets || [];
    
    return {
      total_sets: sets.length,
      total_exercises: [...new Set(sets.map(set => set.exercise_id))].length,
      total_volume_kg: sets.reduce((sum, set) => {
        const reps = set.performance?.reps || 0;
        const weight = set.performance?.weight_kg || 0;
        return sum + (reps * weight);
      }, 0),
      average_rir: this.calculateAverageRir(sets),
      completion_percentage: 100
    };
  }
  
  /**
   * Calculate average RIR if available
   */
  calculateAverageRir(sets) {
    const rirSets = sets.filter(set => set.performance?.rir !== undefined);
    if (rirSets.length === 0) return null;
    
    const totalRir = rirSets.reduce((sum, set) => sum + set.performance.rir, 0);
    return Math.round((totalRir / rirSets.length) * 10) / 10;
  }
  
  /**
   * Estimate session size for queue management
   */
  estimateSessionSize(sessionData) {
    const jsonString = JSON.stringify(sessionData);
    const sizeInBytes = new Blob([jsonString]).size;
    return Math.round(sizeInBytes / 1024); // KB
  }
  
  /**
   * Get recovery status for debugging
   */
  async getRecoveryStatus() {
    try {
      const activeSession = await AsyncStorage.getItem('current_session');
      const metadata = await AsyncStorage.getItem('session_metadata');
      const queueStatus = await uploadService.getUploadQueueStatus();
      
      return {
        hasActiveSession: !!activeSession,
        hasMetadata: !!metadata,
        uploadQueue: queueStatus,
        lastRecoveryCheck: new Date().toISOString()
      };
      
    } catch (error) {
      logger.error('❌ Failed to get recovery status:', error);
      return null;
    }
  }
}

export default new SessionRecoveryService();
