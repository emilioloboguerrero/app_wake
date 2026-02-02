// Simple event system for purchase notifications
import logger from '../utils/logger';

class PurchaseEventManager {
  constructor() {
    this.listeners = [];
    this.readyListeners = [];
  }

  // Subscribe to purchase events
  subscribe(callback) {
    this.listeners.push(callback);
    
    // Return unsubscribe function
    return () => {
      this.listeners = this.listeners.filter(listener => listener !== callback);
    };
  }

  // Subscribe to "purchase ready" events (after Firestore confirms ownership)
  subscribeReady(callback) {
    this.readyListeners.push(callback);

    return () => {
      this.readyListeners = this.readyListeners.filter(listener => listener !== callback);
    };
  }

  // Notify all listeners about a purchase
  notifyPurchaseComplete(courseId) {
    logger.debug('📢 Purchase event: Course purchased:', courseId);
    this.listeners.forEach(callback => {
      try {
        callback(courseId);
      } catch (error) {
        logger.error('Error in purchase listener:', error);
      }
    });
  }

  // Notify listeners that the purchase is confirmed in Firestore
  notifyPurchaseReady(courseId) {
    logger.debug('📢 Purchase ready event: Course available:', courseId);
    this.readyListeners.forEach(callback => {
      try {
        callback(courseId);
      } catch (error) {
        logger.error('Error in purchase ready listener:', error);
      }
    });
  }
}

export default new PurchaseEventManager();
