// Network service with comprehensive error handling and retry logic
import { handleNetworkError, ERROR_TYPES } from './errorHandler';
import logger from './logger';
import { currentConfig } from '../config/environment';
import { ApiSecurityMiddleware, SecurityUtils } from '../utils/security';

/**
 * Request Deduplication System
 * Prevents duplicate API calls by tracking in-flight requests and returning
 * the same promise for identical requests within a time window.
 */
class RequestDeduplicator {
  constructor() {
    // Map of request keys to their promises
    this.inFlightRequests = new Map();
    // Map of request keys to their timestamps for cleanup
    this.requestTimestamps = new Map();
    // Deduplication window: 5 seconds (requests within this window are considered duplicates)
    this.deduplicationWindow = 5000;
    // Cleanup interval: check for stale requests every 10 seconds
    this.cleanupInterval = 10000;
    // Start cleanup interval
    this.startCleanupInterval();
  }

  /**
   * Generate a unique key for a request
   * @param {string} method - HTTP method
   * @param {string} url - Request URL
   * @param {string} body - Request body (stringified)
   * @returns {string} Unique request key
   */
  generateRequestKey(method, url, body = null) {
    // Create a simple hash of the body for key generation
    let bodyHash = '';
    if (body) {
      try {
        // For simple body hashing, use a combination of length and first/last chars
        // This is faster than full JSON.stringify for large bodies
        const bodyStr = typeof body === 'string' ? body : JSON.stringify(body);
        bodyHash = `_${bodyStr.length}_${bodyStr.substring(0, 50)}_${bodyStr.substring(Math.max(0, bodyStr.length - 50))}`;
      } catch (e) {
        // Fallback: use string representation
        bodyHash = `_${String(body).substring(0, 100)}`;
      }
    }
    return `${method}_${url}${bodyHash}`;
  }

  /**
   * Check if a request is already in flight
   * @param {string} key - Request key
   * @returns {Promise|null} Existing promise or null
   */
  getInFlightRequest(key) {
    const request = this.inFlightRequests.get(key);
    if (request) {
      const timestamp = this.requestTimestamps.get(key);
      const age = Date.now() - timestamp;
      
      // Only return if within deduplication window
      if (age < this.deduplicationWindow) {
        logger.debug(`[DEDUP] Reusing in-flight request: ${key.substring(0, 100)} (age: ${age}ms)`);
        return request;
      } else {
        // Request is stale, remove it
        this.inFlightRequests.delete(key);
        this.requestTimestamps.delete(key);
      }
    }
    return null;
  }

  /**
   * Register a new in-flight request
   * @param {string} key - Request key
   * @param {Promise} promise - Request promise
   */
  registerRequest(key, promise) {
    this.inFlightRequests.set(key, promise);
    this.requestTimestamps.set(key, Date.now());

    // Clean up when request completes (success or error)
    promise
      .then(() => {
        // Small delay before cleanup to allow other duplicate requests to reuse
        setTimeout(() => {
          this.inFlightRequests.delete(key);
          this.requestTimestamps.delete(key);
        }, 100);
      })
      .catch(() => {
        // Clean up immediately on error
        this.inFlightRequests.delete(key);
        this.requestTimestamps.delete(key);
      });
  }

  /**
   * Start cleanup interval to remove stale requests
   */
  startCleanupInterval() {
    if (typeof window !== 'undefined') {
      setInterval(() => {
        const now = Date.now();
        const keysToDelete = [];

        for (const [key, timestamp] of this.requestTimestamps.entries()) {
          const age = now - timestamp;
          // Remove requests older than deduplication window + 1 second buffer
          if (age > this.deduplicationWindow + 1000) {
            keysToDelete.push(key);
          }
        }

        keysToDelete.forEach(key => {
          this.inFlightRequests.delete(key);
          this.requestTimestamps.delete(key);
        });

        if (keysToDelete.length > 0) {
          logger.debug(`[DEDUP] Cleaned up ${keysToDelete.length} stale request(s)`);
        }
      }, this.cleanupInterval);
    }
  }

  /**
   * Clear all in-flight requests (useful for testing or reset)
   */
  clear() {
    this.inFlightRequests.clear();
    this.requestTimestamps.clear();
  }

  /**
   * Get statistics about current in-flight requests
   * @returns {Object} Statistics
   */
  getStats() {
    return {
      inFlightCount: this.inFlightRequests.size,
      oldestRequest: this.requestTimestamps.size > 0
        ? Math.min(...Array.from(this.requestTimestamps.values()))
        : null
    };
  }
}

class NetworkService {
  constructor() {
    this.baseURL = currentConfig.apiUrl;
    this.timeout = 10000; // 10 seconds
    this.maxRetries = 3;
    this.retryDelay = 1000; // 1 second
    // Initialize request deduplicator
    this.deduplicator = new RequestDeduplicator();
  }

  // Main request method with error handling and deduplication
  async request(endpoint, options = {}) {
    const {
      method = 'GET',
      body = null,
      headers = {},
      timeout = this.timeout,
      retries = this.maxRetries,
      skipDeduplication = false // Allow opt-out for specific requests
    } = options;

    const url = `${this.baseURL}${endpoint}`;
    
    // Validate URL for security
    if (!SecurityUtils.validateUrl(url)) {
      return {
        success: false,
        error: 'URL de solicitud no válida'
      };
    }
    
    const requestOptions = {
      method,
      headers: ApiSecurityMiddleware.addSecurityHeaders({
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        ...headers
      }),
      timeout
    };

    let bodyString = null;
    if (body && method !== 'GET') {
      // Sanitize request body
      const sanitizedBody = ApiSecurityMiddleware.sanitizeRequestData(body);
      bodyString = JSON.stringify(sanitizedBody);
      requestOptions.body = bodyString;
    }

    // Check for duplicate request (unless deduplication is skipped)
    if (!skipDeduplication) {
      const requestKey = this.deduplicator.generateRequestKey(method, url, bodyString);
      const existingRequest = this.deduplicator.getInFlightRequest(requestKey);
      
      if (existingRequest) {
        logger.debug(`[DEDUP] Deduplicating request: ${method} ${endpoint}`);
        return existingRequest;
      }

      // Create the request promise
      const requestPromise = this.executeRequest(url, requestOptions, retries);
      
      // Register it for deduplication
      this.deduplicator.registerRequest(requestKey, requestPromise);
      
      return requestPromise;
    }

    // Skip deduplication for this request
    return this.executeRequest(url, requestOptions, retries);
  }

  // Execute request with retry logic
  async executeRequest(url, options, retries) {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        logger.log(`Network request attempt ${attempt}/${retries}: ${options.method} ${url}`);
        
        const response = await this.fetchWithTimeout(url, options);
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        logger.log(`Network request successful: ${options.method} ${url}`);
        
        return {
          success: true,
          data,
          status: response.status
        };

      } catch (error) {
        logger.warn(`Network request attempt ${attempt} failed:`, error.message);
        
        if (attempt === retries) {
          return handleNetworkError(error, {
            operation: `${options.method} ${url}`,
            attempt,
            url
          }, () => this.executeRequest(url, options, retries));
        }

        // Wait before retry with exponential backoff
        const delay = this.retryDelay * Math.pow(2, attempt - 1);
        await this.sleep(delay);
      }
    }
  }

  // Fetch with timeout
  async fetchWithTimeout(url, options) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), options.timeout);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      
      if (error.name === 'AbortError') {
        throw new Error('Request timeout');
      }
      
      throw error;
    }
  }

  // Convenience methods
  async get(endpoint, options = {}) {
    return this.request(endpoint, { ...options, method: 'GET' });
  }

  async post(endpoint, body, options = {}) {
    return this.request(endpoint, { ...options, method: 'POST', body });
  }

  async put(endpoint, body, options = {}) {
    return this.request(endpoint, { ...options, method: 'PUT', body });
  }

  async delete(endpoint, options = {}) {
    return this.request(endpoint, { ...options, method: 'DELETE' });
  }

  // Utility methods
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Check network connectivity
  async checkConnectivity() {
    try {
      // Skip deduplication for health checks
      const response = await this.fetchWithTimeout(`${this.baseURL}/health`, {
        method: 'GET',
        timeout: 5000
      });
      
      return response.ok;
    } catch (error) {
      logger.warn('Network connectivity check failed:', error.message);
      return false;
    }
  }

  /**
   * Get deduplication statistics (useful for debugging)
   * @returns {Object} Deduplication stats
   */
  getDeduplicationStats() {
    return this.deduplicator.getStats();
  }

  /**
   * Clear all in-flight requests (useful for testing or reset)
   */
  clearDeduplicationCache() {
    this.deduplicator.clear();
    logger.debug('[DEDUP] Cleared deduplication cache');
  }

  // Upload file with progress tracking
  async uploadFile(endpoint, file, onProgress = null) {
    const formData = new FormData();
    formData.append('file', file);

    try {
      logger.log(`Uploading file to ${endpoint}`);
      
      const response = await fetch(`${this.baseURL}${endpoint}`, {
        method: 'POST',
        body: formData,
        headers: {
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`Upload failed: ${response.statusText}`);
      }

      const result = await response.json();
      logger.log('File upload successful');
      
      return {
        success: true,
        data: result
      };

    } catch (error) {
      logger.error('File upload failed:', error);
      
      return {
        success: false,
        error: 'Error al subir el archivo. Intenta de nuevo.'
      };
    }
  }
}

// Create singleton instance
const networkService = new NetworkService();

export default networkService;
