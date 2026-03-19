// Upload Service - Handles batch uploading of workout sessions
import AsyncStorage from '@react-native-async-storage/async-storage';
import logger from '../utils/logger.js';
class UploadService {
  /**
   * Upload a completed session to cloud storage
   * @param {Object} sessionData - Complete session data
   */
  async uploadSession(sessionData) {
    try {
      logger.log('📤 Uploading session:', sessionData.sessionId);
      
      // Validate session data before upload
      const isValid = await this.validateUploadData(sessionData);
      
      // If validation fails (no sets), skip upload gracefully
      if (!isValid) {
        logger.log('⚠️ Skipping upload for session with no sets:', sessionData.sessionId);
        await this.markUploadCompleted(sessionData.sessionId); // Mark as completed to remove from queue
        await this.cleanupLocalSession(sessionData.sessionId);
        return null; // Return null to indicate no upload occurred
      }
      
      // Progress is stored in users/{userId}.courseProgress and users/{userId}/sessionHistory.
      // We no longer write to the top-level progress collection (deprecated).
      // Still mark upload completed and cleanup so the queue does not retry.
      const docId = `${sessionData.userId}_${sessionData.courseId}_${sessionData.sessionId}`;

      logger.log('✅ Session upload processed (progress lives in user doc):', docId);
      
      // Mark upload as completed and cleanup
      await this.markUploadCompleted(sessionData.sessionId);
      await this.cleanupLocalSession(sessionData.sessionId);
      
      return docId;
      
    } catch (error) {
      logger.error('❌ Session upload failed:', error);
      await this.markUploadFailed(sessionData.sessionId, error.message);
      throw error;
    }
  }
  
  /**
   * Validate session data before upload
   */
  async validateUploadData(sessionData) {
    if (!sessionData.sessionId) {
      throw new Error('Session missing sessionId');
    }
    
    if (!sessionData.userId) {
      throw new Error('Session missing userId');
    }
    
    if (!sessionData.courseId) {
      throw new Error('Session missing courseId');
    }
    
    if (!sessionData.sets || !Array.isArray(sessionData.sets)) {
      throw new Error('Session missing sets array');
    }
    
    if (sessionData.sets.length === 0) {
      logger.log('⚠️ Session has no sets to upload, skipping upload');
      return false; // Return false instead of throwing error
    }
    
    logger.log('✅ Session data validation passed');
    return true;
  }
  
  /**
   * Process upload queue (background operation)
   */
  async processUploadQueue() {
    try {
      logger.log('🔄 Processing upload queue...');
      
      const queueData = await AsyncStorage.getItem('upload_queue');
      if (!queueData) {
        logger.log('ℹ️ Upload queue is empty');
        return;
      }
      
      const queue = JSON.parse(queueData);
      const pendingSessions = queue.sessions.filter(s => s.status === 'pending');
      
      logger.log(`📋 Found ${pendingSessions.length} pending uploads`);
      
      for (const sessionInfo of pendingSessions) {
        try {
          // Get complete session data
          const sessionData = await AsyncStorage.getItem(`pending_session_${sessionInfo.sessionId}`);
          if (!sessionData) {
            logger.log('⚠️ Session data not found, removing from queue:', sessionInfo.sessionId);
            await this.removeFromUploadQueue(sessionInfo.sessionId);
            continue;
          }
          
          const session = JSON.parse(sessionData);
          
          // Attempt upload
          await this.uploadSession(session);
          
        } catch (error) {
          logger.log('❌ Upload failed for session:', sessionInfo.sessionId, error.message);
          await this.markUploadFailed(sessionInfo.sessionId, error.message);
        }
      }
      
      logger.log('✅ Upload queue processing completed');
      
    } catch (error) {
      logger.error('❌ Failed to process upload queue:', error);
    }
  }
  
  /**
   * Retry failed uploads
   */
  async retryFailedUploads() {
    try {
      logger.log('🔄 Retrying failed uploads...');
      
      const queueData = await AsyncStorage.getItem('upload_queue');
      if (!queueData) return;
      
      const queue = JSON.parse(queueData);
      const failedSessions = queue.sessions.filter(s => s.status === 'failed');
      
      logger.log(`🔄 Found ${failedSessions.length} failed uploads to retry`);
      
      for (const sessionInfo of failedSessions) {
        try {
          // Update status to pending for retry
          await this.markUploadPending(sessionInfo.sessionId);
          
          // Get session data and attempt upload
          const sessionData = await AsyncStorage.getItem(`pending_session_${sessionInfo.sessionId}`);
          if (sessionData) {
            await this.uploadSession(JSON.parse(sessionData));
          }
          
        } catch (error) {
          logger.log('❌ Retry failed for session:', sessionInfo.sessionId);
        }
      }
      
    } catch (error) {
      logger.error('❌ Failed to retry uploads:', error);
    }
  }
  
  /**
   * Mark session upload as pending
   */
  async markUploadPending(sessionId) {
    await this.updateSessionInQueue(sessionId, { 
      status: 'pending',
      lastAttempt: new Date().toISOString()
    });
  }
  
  /**
   * Mark session upload as completed
   */
  async markUploadCompleted(sessionId) {
    await this.updateSessionInQueue(sessionId, { 
      status: 'completed',
      completedAt: new Date().toISOString()
    });
  }
  
  /**
   * Mark session upload as failed
   */
  async markUploadFailed(sessionId, errorMessage) {
    await this.updateSessionInQueue(sessionId, { 
      status: 'failed',
      lastError: errorMessage,
      lastAttempt: new Date().toISOString(),
      attempts: (await this.getSessionFromQueue(sessionId))?.attempts + 1 || 1
    });
  }
  
  /**
   * Update session status in upload queue
   */
  async updateSessionInQueue(sessionId, updates) {
    try {
      const queueData = await AsyncStorage.getItem('upload_queue');
      if (!queueData) return;
      
      const queue = JSON.parse(queueData);
      const sessionIndex = queue.sessions.findIndex(s => s.sessionId === sessionId);
      
      if (sessionIndex >= 0) {
        queue.sessions[sessionIndex] = {
          ...queue.sessions[sessionIndex],
          ...updates
        };
        
        await AsyncStorage.setItem('upload_queue', JSON.stringify(queue));
      }
      
    } catch (error) {
      logger.error('❌ Failed to update session in queue:', error);
    }
  }
  
  /**
   * Get session info from upload queue
   */
  async getSessionFromQueue(sessionId) {
    try {
      const queueData = await AsyncStorage.getItem('upload_queue');
      if (!queueData) return null;
      
      const queue = JSON.parse(queueData);
      return queue.sessions.find(s => s.sessionId === sessionId) || null;
      
    } catch (error) {
      return null;
    }
  }
  
  /**
   * Remove session from upload queue
   */
  async removeFromUploadQueue(sessionId) {
    try {
      const queueData = await AsyncStorage.getItem('upload_queue');
      if (!queueData) return;
      
      const queue = JSON.parse(queueData);
      queue.sessions = queue.sessions.filter(s => s.sessionId !== sessionId);
      
      await AsyncStorage.setItem('upload_queue', JSON.stringify(queue));
      
    } catch (error) {
      logger.error('❌ Failed to remove session from queue:', error);
    }
  }
  
  /**
   * Clean up local session data after successful upload
   */
  async cleanupLocalSession(sessionId) {
    try {
      // Remove session data
      await AsyncStorage.removeItem(`pending_session_${sessionId}`);
      
      // Remove from upload queue
      await this.removeFromUploadQueue(sessionId);
      
      // Clear active session if it matches
      const activeSession = await AsyncStorage.getItem('active_session');
      if (activeSession) {
        const session = JSON.parse(activeSession);
        if (session.sessionId === sessionId) {
          await AsyncStorage.removeItem('active_session');
          await AsyncStorage.removeItem('session_metadata');
        }
      }
      
      logger.log('🧹 Local session data cleaned up:', sessionId);
      
    } catch (error) {
      logger.error('❌ Failed to cleanup local session:', error);
    }
  }
  
  /**
   * Get upload queue status
   */
  async getUploadQueueStatus() {
    try {
      const queueData = await AsyncStorage.getItem('upload_queue');
      if (!queueData) {
        return { totalSessions: 0, pendingSessions: 0, failedSessions: 0 };
      }
      
      const queue = JSON.parse(queueData);
      const sessions = queue.sessions || [];
      
      return {
        totalSessions: sessions.length,
        pendingSessions: sessions.filter(s => s.status === 'pending').length,
        failedSessions: sessions.filter(s => s.status === 'failed').length,
        completedSessions: sessions.filter(s => s.status === 'completed').length,
        totalSize_kb: sessions.reduce((sum, s) => sum + (s.size_kb || 0), 0)
      };
      
    } catch (error) {
      logger.error('❌ Failed to get upload queue status:', error);
      return { totalSessions: 0, pendingSessions: 0, failedSessions: 0 };
    }
  }
}

export default new UploadService();
