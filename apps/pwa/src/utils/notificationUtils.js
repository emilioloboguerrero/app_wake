import NotificationService from '../services/notificationService';
import logger from './logger';

// Initialize notifications when user logs in
export const initializeNotifications = async () => {
  try {
    await NotificationService.initialize();
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
    return token || null;
  } catch (error) {
    logger.error('Error getting FCM token:', error);
    return null;
  }
};
