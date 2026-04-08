const { defineConfig } = require('@playwright/test');
const { resolve } = require('path');
const { existsSync } = require('fs');

const AUTH_FILE = resolve(__dirname, '.auth/creator.json');

// Warn early if auth setup hasn't run yet
if (!existsSync(AUTH_FILE)) {
  console.warn(
    '\n⚠ Auth file not found: %s\n  Run "npx playwright test --project=setup" first.\n',
    AUTH_FILE
  );
}

module.exports = defineConfig({
  testDir: './specs',
  timeout: 45000,
  expect: { timeout: 10000 },
  fullyParallel: false,
  retries: 1,
  outputDir: resolve(__dirname, 'test-results'),
  reporter: [['html', { open: 'on-failure', outputFolder: resolve(__dirname, 'playwright-report') }]],

  use: {
    baseURL: 'http://localhost:3000/creators/',
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
    video: 'on-first-retry',
  },

  projects: [
    {
      name: 'setup',
      testDir: __dirname,
      testMatch: /auth\.setup\.js/,
    },
    {
      name: 'creator-dashboard',
      dependencies: ['setup'],
      use: {
        storageState: AUTH_FILE,
        browserName: 'chromium',
      },
    },
  ],
});
