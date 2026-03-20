// Security configuration and utilities
// Implements security best practices for the app

import { currentConfig } from '../config/environment';
import logger from '../utils/logger';

// Security headers for API requests
export const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline';"
};

// Content Security Policy for web
export const CSP_POLICY = {
  'default-src': ["'self'"],
  'script-src': ["'self'", "'unsafe-inline'"],
  'style-src': ["'self'", "'unsafe-inline'"],
  'img-src': ["'self'", "data:", "https:"],
  'connect-src': ["'self'", "https:"],
  'font-src': ["'self'", "data:"],
  'object-src': ["'none'"],
  'media-src': ["'self'"],
  'frame-src': ["'none'"]
};

// Security utilities
export const SecurityUtils = {
  // Validate URLs to prevent open redirects
  validateUrl: (url) => {
    try {
      const parsedUrl = new URL(url);
      
      // Only allow HTTPS in production
      if (currentConfig.environment === 'production' && parsedUrl.protocol !== 'https:') {
        logger.warn('Blocked non-HTTPS URL in production:', url);
        return false;
      }
      
      // Block dangerous protocols
      const dangerousProtocols = ['javascript:', 'data:', 'vbscript:', 'file:'];
      if (dangerousProtocols.includes(parsedUrl.protocol)) {
        logger.warn('Blocked dangerous protocol:', url);
        return false;
      }
      
      return true;
    } catch (error) {
      logger.warn('Invalid URL:', url, error.message);
      return false;
    }
  },

  // Sanitize file names to prevent path traversal
  sanitizeFileName: (fileName) => {
    if (typeof fileName !== 'string') return 'unknown';
    
    // Remove path traversal attempts
    let sanitized = fileName
      .replace(/\.\./g, '') // Remove .. 
      .replace(/[\/\\]/g, '_') // Replace path separators
      .replace(/[^\w\-_\.]/g, '') // Keep only safe characters
      .substring(0, 255); // Limit length
    
    // Ensure it's not empty
    if (!sanitized) {
      sanitized = 'file_' + Date.now();
    }
    
    return sanitized;
  },

  // Generate secure random tokens using crypto.getRandomValues()
  generateSecureToken: (length = 32) => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const array = new Uint8Array(length);
    crypto.getRandomValues(array);
    return Array.from(array, b => chars[b % chars.length]).join('');
  },

  // Validate file type
  validateFileType: (fileName, allowedTypes = []) => {
    if (!fileName || typeof fileName !== 'string') return false;
    
    const extension = fileName.split('.').pop()?.toLowerCase();
    return allowedTypes.includes(extension);
  },

  // Check for suspicious patterns
  detectSuspiciousPattern: (input) => {
    if (typeof input !== 'string') return false;
    
    const suspiciousPatterns = [
      /<script/i,
      /javascript:/i,
      /on\w+\s*=/i,
      /eval\s*\(/i,
      /expression\s*\(/i,
      /vbscript:/i,
      /data:text\/html/i
    ];
    
    return suspiciousPatterns.some(pattern => pattern.test(input));
  },

  // Rate limiting helper
  createRateLimiter: (maxRequests = 10, windowMs = 60000) => {
    const requests = new Map();
    const MAX_ENTRIES = 1000;

    return (identifier) => {
      const now = Date.now();
      const windowStart = now - windowMs;

      // Clean old requests
      for (const [key, timestamp] of requests.entries()) {
        if (timestamp < windowStart) {
          requests.delete(key);
        }
      }

      // Evict oldest if map is too large
      if (requests.size > MAX_ENTRIES) {
        const oldest = Array.from(requests.entries()).sort((a, b) => a[1] - b[1]);
        const toRemove = requests.size - MAX_ENTRIES;
        for (let i = 0; i < toRemove; i++) {
          requests.delete(oldest[i][0]);
        }
      }

      // Check current requests
      const currentRequests = Array.from(requests.values())
        .filter(timestamp => timestamp > windowStart).length;

      if (currentRequests >= maxRequests) {
        logger.warn('Rate limit exceeded for:', identifier);
        return false;
      }

      // Add current request
      requests.set(identifier, now);
      return true;
    };
  }
};

// Firebase security rules helper
export const FirebaseSecurityRules = {
  // User data access rules
  userDataRules: {
    read: 'auth != null && auth.uid == resource.id',
    write: 'auth != null && auth.uid == resource.id',
    create: 'auth != null && auth.uid == request.resource.id'
  },

  // Course data access rules
  courseDataRules: {
    read: 'auth != null',
    write: 'auth != null && resource.data.creator_id == auth.uid',
    create: 'auth != null && request.resource.data.creator_id == auth.uid'
  },

  // Public data access rules
  publicDataRules: {
    read: 'true',
    write: 'auth != null',
    create: 'auth != null'
  }
};

// API security middleware
export const ApiSecurityMiddleware = {
  // Add security headers to requests
  addSecurityHeaders: (headers = {}) => {
    return {
      ...headers,
      ...SECURITY_HEADERS
    };
  },

  // Validate request origin
  validateOrigin: (origin) => {
    const allowedOrigins = [
      'https://wake.com',
      'https://www.wake.com',
      'https://api.wake.com'
    ];
    
    if (currentConfig.environment === 'development') {
      allowedOrigins.push('http://localhost:3000', 'http://localhost:8081');
    }
    
    return allowedOrigins.includes(origin);
  },

  // Validate request data types (strings are trimmed, objects recursed, primitives passed through)
  sanitizeRequestData: (data) => {
    if (typeof data !== 'object' || data === null) return data;

    const sanitized = {};

    for (const [key, value] of Object.entries(data)) {
      if (typeof key !== 'string' || !/^[\w.]+$/.test(key)) continue;

      if (typeof value === 'string') {
        sanitized[key] = value.trim();
      } else if (typeof value === 'number' || typeof value === 'boolean') {
        sanitized[key] = value;
      } else if (Array.isArray(value)) {
        sanitized[key] = value.map(item =>
          typeof item === 'object' && item !== null
            ? ApiSecurityMiddleware.sanitizeRequestData(item)
            : item
        );
      } else if (typeof value === 'object' && value !== null) {
        sanitized[key] = ApiSecurityMiddleware.sanitizeRequestData(value);
      }
    }

    return sanitized;
  }
};

// Base64 encoding utilities (NOT encryption — provides zero security)
export const EncryptionUtils = {
  base64Encode: (data) => {
    if (typeof data !== 'string') return data;
    return btoa(data);
  },

  base64Decode: (encoded) => {
    if (typeof encoded !== 'string') return encoded;
    try {
      return atob(encoded);
    } catch (error) {
      logger.warn('Failed to base64 decode data:', error.message);
      return encoded;
    }
  },
};

// Security monitoring
export const SecurityMonitor = {
  suspiciousActivities: new Map(),
  _cleanupInterval: null,

  _ensureCleanup() {
    if (SecurityMonitor._cleanupInterval) return;
    SecurityMonitor._cleanupInterval = setInterval(() => {
      SecurityMonitor.cleanup();
      if (SecurityMonitor.suspiciousActivities.size === 0) {
        clearInterval(SecurityMonitor._cleanupInterval);
        SecurityMonitor._cleanupInterval = null;
      }
    }, 300000); // 5 minutes
  },

  // Log suspicious activity
  logSuspiciousActivity(activity, details = {}) {
    const timestamp = Date.now();
    const key = `${activity}_${timestamp}`;

    SecurityMonitor.suspiciousActivities.set(key, {
      activity,
      details,
      timestamp,
      count: 1
    });

    SecurityMonitor._ensureCleanup();
    logger.warn('Suspicious activity detected:', activity, details);
  },

  // Check for repeated suspicious activities
  checkRepeatedActivity(activity, threshold = 5) {
    const now = Date.now();
    const windowMs = 300000; // 5 minutes

    const recentActivities = Array.from(SecurityMonitor.suspiciousActivities.values())
      .filter(item =>
        item.activity === activity &&
        (now - item.timestamp) < windowMs
      );

    if (recentActivities.length >= threshold) {
      logger.error('Repeated suspicious activity detected:', activity);
      return true;
    }

    return false;
  },

  // Clear old activities
  cleanup() {
    const now = Date.now();
    const maxAge = 3600000; // 1 hour

    for (const [key, activity] of SecurityMonitor.suspiciousActivities.entries()) {
      if ((now - activity.timestamp) > maxAge) {
        SecurityMonitor.suspiciousActivities.delete(key);
      }
    }
  }
};

export default {
  SECURITY_HEADERS,
  CSP_POLICY,
  SecurityUtils,
  FirebaseSecurityRules,
  ApiSecurityMiddleware,
  EncryptionUtils,
  SecurityMonitor
};
