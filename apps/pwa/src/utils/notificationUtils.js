import NotificationService from '../services/notificationService';
import logger from './logger';

// Initialize notifications when user logs in
export const initializeNotifications = async () => {
  try {
    await NotificationService.initialize();
    logger.debug('Notifications initialized for user');
  } catch (error) {
    logger.error('Error initializing notifications:', error);
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
      logger.debug('FCM Token for Firebase Console:', token);
      return token;
    } else {
      logger.debug('No FCM token available');
      return null;
    }
  } catch (error) {
    logger.error('Error getting FCM token:', error);
    return null;
  }
};
