// Logger utility for Wake app
// Provides consistent logging across the application

import { isDevelopment, isProduction, isProductionDebug } from '../config/environment';

const shouldLog = () => isDevelopment || isProductionDebug();

/**
 * Logger service that respects environment settings
 * - In development: logs to console
 * - In production with ?wake_debug=1 or localStorage WAKE_DEBUG=true: logs to console
 * - Otherwise in production: no console output (except logger.prod and errors)
 */
const logger = {
  /**
   * Log informational messages
   */
  log: (...args) => {
    if (shouldLog()) {
      console.log('[WAKE]', ...args);
    }
  },

  /**
   * Log error messages (always in console when production debug is on; in prod always to console)
   */
  error: (...args) => {
    if (shouldLog()) {
      console.error('[WAKE ERROR]', ...args);
    }
    if (isProduction && !shouldLog()) {
      console.error('[WAKE ERROR]', ...args);
    }
  },

  /**
   * Log warning messages
   */
  warn: (...args) => {
    if (shouldLog()) {
      console.warn('[WAKE WARN]', ...args);
    }
  },

  /**
   * Log debug messages (dev or production debug)
   */
  debug: (...args) => {
    if (shouldLog()) {
      console.debug('[WAKE DEBUG]', ...args);
    }
  },

  /**
   * Log info messages (similar to log but can be filtered separately)
   */
  info: (...args) => {
    if (shouldLog()) {
      console.info('[WAKE INFO]', ...args);
    }
  },

  /**
   * Always logs to console with [WAKE PROD] prefix for debugging Safari etc. in production.
   * Use for critical auth/navigation events so they show without enabling debug mode.
   */
  prod: (...args) => {
    console.log('[WAKE PROD]', ...args);
  },
};

export default logger;
