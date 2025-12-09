// Network service with comprehensive error handling and retry logic
import { handleNetworkError, ERROR_TYPES } from './errorHandler';
import logger from './logger';
import { currentConfig } from '../config/environment';
import { ApiSecurityMiddleware, SecurityUtils } from '../utils/security';

class NetworkService {
  constructor() {
    this.baseURL = currentConfig.apiUrl;
    this.timeout = 10000; // 10 seconds
    this.maxRetries = 3;
    this.retryDelay = 1000; // 1 second
  }

  // Main request method with error handling
  async request(endpoint, options = {}) {
    const {
      method = 'GET',
      body = null,
      headers = {},
      timeout = this.timeout,
      retries = this.maxRetries
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

    if (body && method !== 'GET') {
      // Sanitize request body
      const sanitizedBody = ApiSecurityMiddleware.sanitizeRequestData(body);
      requestOptions.body = JSON.stringify(sanitizedBody);
    }

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
