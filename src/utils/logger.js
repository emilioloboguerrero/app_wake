// Logger utility for Wake app
// Provides consistent logging across the application

import { isDevelopment, isProduction } from '../config/environment';

/**
 * Logger service that respects environment settings
 * - In development: logs to console
 * - In production: can be configured to disable or send to remote service
 */
const logger = {
  /**
   * Log informational messages
   */
  log: (...args) => {
    if (isDevelopment) {
      console.log('[WAKE]', ...args);
    }
    // In production, you could send to remote logging service here
  },

  /**
   * Log error messages
   */
  error: (...args) => {
    if (isDevelopment) {
      console.error('[WAKE ERROR]', ...args);
    }
    // In production, send errors to crash reporting service
    if (isProduction) {
      // You can integrate with your crash reporting service here
      // For example: crashlytics().recordError(error);
    }
  },

  /**
   * Log warning messages
   */
  warn: (...args) => {
    if (isDevelopment) {
      console.warn('[WAKE WARN]', ...args);
    }
  },

  /**
   * Log debug messages (only in development)
   */
  debug: (...args) => {
    if (isDevelopment) {
      console.debug('[WAKE DEBUG]', ...args);
    }
  },

  /**
   * Log info messages (similar to log but can be filtered separately)
   */
  info: (...args) => {
    if (isDevelopment) {
      console.info('[WAKE INFO]', ...args);
    }
  },
};

export default logger;
