import NotificationService from '../services/notificationService';

// Initialize notifications when user logs in
export const initializeNotifications = async () => {
  try {
    await NotificationService.initialize();
    console.log('Notifications initialized for user');
  } catch (error) {
    console.error('Error initializing notifications:', error);
  }
};

// Set user ID for notifications
export const setNotificationUserId = (userId) => {
  NotificationService.setUserId(userId);
};

// Get FCM token for testing
export const getFCMToken = async () => {
  try {
    const token = await NotificationService.getStoredToken();
    if (token) {
      console.log('FCM Token for Firebase Console:', token);
      return token;
    } else {
      console.log('No FCM token available');
      return null;
    }
  } catch (error) {
    console.error('Error getting FCM token:', error);
    return null;
  }
};
