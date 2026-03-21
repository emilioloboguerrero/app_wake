'use strict';

const ENVIRONMENTS = {
  local: {
    baseUrl: 'http://127.0.0.1:5001/wake-staging/us-central1/api/v1',
    apiKey: 'fake-api-key',
    authUrl: 'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1',
    label: 'Local Emulator',
  },
  staging: {
    baseUrl: 'http://127.0.0.1:5001/wake-staging/us-central1/api/v1',
    apiKey: process.env.STAGING_API_KEY || 'fake-api-key',
    authUrl: 'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1',
    label: 'Staging (emulator)',
  },
  production: {
    baseUrl: 'https://wakelab.co/api/v1',
    apiKey: process.env.PRODUCTION_API_KEY || '',
    authUrl: 'https://identitytoolkit.googleapis.com/v1',
    label: 'Production (read-only tests)',
  },
};

function resolveEnv() {
  const env = process.env.TEST_ENV || 'staging';
  const config = ENVIRONMENTS[env];
  if (!config) {
    console.error(`Unknown environment: ${env}. Use: ${Object.keys(ENVIRONMENTS).join(', ')}`);
    process.exit(1);
  }
  return { ...config, name: env };
}

module.exports = { ENVIRONMENTS, resolveEnv };
