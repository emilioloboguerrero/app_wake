// Minimal essential monitoring service
// Uses only free Firebase services for crash reporting and basic analytics

import logger from '../utils/logger';

// Conditional imports for Firebase services (not available in Expo Go)
let crashlytics = null;
let analytics = null;

try {
  crashlytics = require('@react-native-firebase/crashlytics').default;
} catch (error) {
  logger.log('Crashlytics not available in Expo Go - will work in production builds');
}

try {
  analytics = require('@react-native-firebase/analytics').default;
} catch (error) {
  logger.log('Analytics not available in Expo Go - will work in production builds');
}

class MonitoringService {
  constructor() {
    this.isInitialized = false;
    this.userId = null;
  }

  // Initialize monitoring (call this when user logs in)
  async initialize(userId = null) {
    try {
      this.userId = userId;
      
      if (crashlytics && userId) {
        await crashlytics().setUserId(userId);
        logger.log('Crashlytics initialized for user:', userId);
      }
      
      if (analytics && userId) {
        await analytics().setUserId(userId);
        logger.log('Analytics initialized for user:', userId);
      }
      
      this.isInitialized = true;
      logger.log('Monitoring service initialized');
      
    } catch (error) {
      logger.error('Failed to initialize monitoring:', error);
    }
  }

  // Report errors to Crashlytics
  reportError(error, context = {}) {
    try {
      // Log error locally
      logger.error('Error reported:', error.message, context);
      
      // Report to Crashlytics if available
      if (crashlytics && !__DEV__) {
        crashlytics().recordError(error);
        
        // Add context
        if (Object.keys(context).length > 0) {
          crashlytics().setAttributes(context);
        }
      }
      
    } catch (reportError) {
      logger.error('Failed to report error:', reportError);
    }
  }

  // Track essential business events
  async trackEvent(eventName, parameters = {}) {
    try {
      // Log event locally
      logger.log(`Event tracked: ${eventName}`, parameters);
      
      // Track in Analytics if available
      if (analytics && !__DEV__) {
        await analytics().logEvent(eventName, parameters);
      }
      
    } catch (error) {
      logger.error('Failed to track event:', error);
    }
  }

  // Essential business events
  async trackUserRegistration() {
    await this.trackEvent('user_registration');
  }

  async trackWorkoutStarted(courseId, difficulty) {
    await this.trackEvent('workout_started', {
      course_id: courseId,
      difficulty: difficulty
    });
  }

  async trackWorkoutCompleted(courseId, duration, exercisesCount) {
    await this.trackEvent('workout_completed', {
      course_id: courseId,
      duration_minutes: Math.round(duration / 60),
      exercises_count: exercisesCount
    });
  }

  async trackCoursePurchased(courseId, price, currency) {
    await this.trackEvent('course_purchased', {
      course_id: courseId,
      price: price,
      currency: currency
    });
  }

  async trackScreenView(screenName) {
    await this.trackEvent('screen_view', {
      screen_name: screenName
    });
  }

  // Set user properties for segmentation
  async setUserProperty(property, value) {
    try {
      if (analytics && !__DEV__) {
        await analytics().setUserProperty(property, value);
        logger.log(`User property set: ${property} = ${value}`);
      }
    } catch (error) {
      logger.error('Failed to set user property:', error);
    }
  }

  // Set user level for analytics segmentation
  async setUserLevel(level) {
    await this.setUserProperty('user_level', level);
  }

  // Set user subscription status
  async setSubscriptionStatus(status) {
    await this.setUserProperty('subscription_status', status);
  }
}

// Create singleton instance
const monitoringService = new MonitoringService();

// Export convenience methods
export const reportError = (error, context) => monitoringService.reportError(error, context);
export const trackEvent = (eventName, parameters) => monitoringService.trackEvent(eventName, parameters);
export const trackWorkoutStarted = (courseId, difficulty) => monitoringService.trackWorkoutStarted(courseId, difficulty);
export const trackWorkoutCompleted = (courseId, duration, exercisesCount) => monitoringService.trackWorkoutCompleted(courseId, duration, exercisesCount);
export const trackCoursePurchased = (courseId, price, currency) => monitoringService.trackCoursePurchased(courseId, price, currency);
export const trackScreenView = (screenName) => monitoringService.trackScreenView(screenName);
export const initializeMonitoring = (userId) => monitoringService.initialize(userId);
export const trackUserRegistration = () => monitoringService.trackUserRegistration();

export default monitoringService;
