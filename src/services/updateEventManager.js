// Event system for program update completion notifications
import logger from '../utils/logger';

class UpdateEventManager {
  constructor() {
    this.listeners = [];           // Array of callback functions
    this.pendingUpdates = new Set(); // Set of courseIds that completed updates
  }

  // Subscribe to update completion events
  subscribe(callback) {
    this.listeners.push(callback);
    
    // Return unsubscribe function
    return () => {
      this.listeners = this.listeners.filter(listener => listener !== callback);
    };
  }

  // Notify that an update completed
  notifyUpdateComplete(courseId) {
    logger.debug('📢 Update event: Course update completed:', courseId);
    this.pendingUpdates.add(courseId);
    
    this.listeners.forEach(callback => {
      try {
        callback(courseId);
      } catch (error) {
        logger.error('Error in update listener:', error);
      }
    });
  }

  // Check if there are pending updates
  hasPendingUpdates() {
    return this.pendingUpdates.size > 0;
  }

  // Clear pending updates after refresh
  clearPendingUpdates() {
    logger.debug('🧹 Clearing pending updates:', Array.from(this.pendingUpdates));
    this.pendingUpdates.clear();
  }

  // Get pending updates for debugging
  getPendingUpdates() {
    return Array.from(this.pendingUpdates);
  }
}

export default new UpdateEventManager();
