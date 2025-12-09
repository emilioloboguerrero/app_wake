// Environment configuration
// Handles different environments (development, production, staging)

const ENV = {
  DEVELOPMENT: 'development',
  PRODUCTION: 'production',
  STAGING: 'staging'
};

// Get current environment
const getEnvironment = () => {
  if (__DEV__) {
    return ENV.DEVELOPMENT;
  }
  
  // In production builds, you can set this via environment variables
  // For now, we'll default to production when not in development
  return ENV.PRODUCTION;
};

// Environment-specific configurations
const config = {
  [ENV.DEVELOPMENT]: {
    // Development settings
    apiUrl: 'https://dev-api.wake.com',
    enableLogging: true,
    enableAnalytics: false,
    enableCrashReporting: false,
    enablePerformanceMonitoring: false,
    debugMode: true,
  },
  
  [ENV.PRODUCTION]: {
    // Production settings
    apiUrl: 'https://api.wake.com',
    enableLogging: false,
    enableAnalytics: true,
    enableCrashReporting: true,
    enablePerformanceMonitoring: true,
    debugMode: false,
  },
  
  [ENV.STAGING]: {
    // Staging settings (for testing before production)
    apiUrl: 'https://staging-api.wake.com',
    enableLogging: true,
    enableAnalytics: true,
    enableCrashReporting: true,
    enablePerformanceMonitoring: true,
    debugMode: false,
  }
};

// Get current configuration
const getConfig = () => {
  const environment = getEnvironment();
  return config[environment];
};

// Export current configuration
export const currentConfig = getConfig();
export const isDevelopment = getEnvironment() === ENV.DEVELOPMENT;
export const isProduction = getEnvironment() === ENV.PRODUCTION;
export const isStaging = getEnvironment() === ENV.STAGING;

export default currentConfig;
