// Simple event system for purchase notifications
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
    console.log('📢 Purchase event: Course purchased:', courseId);
    this.listeners.forEach(callback => {
      try {
        callback(courseId);
      } catch (error) {
        console.error('Error in purchase listener:', error);
      }
    });
  }

  // Notify listeners that the purchase is confirmed in Firestore
  notifyPurchaseReady(courseId) {
    console.log('📢 Purchase ready event: Course available:', courseId);
    this.readyListeners.forEach(callback => {
      try {
        callback(courseId);
      } catch (error) {
        console.error('Error in purchase ready listener:', error);
      }
    });
  }
}

export default new PurchaseEventManager();
