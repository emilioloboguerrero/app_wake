const { test: setup, expect } = require('@playwright/test');
const { readFileSync, mkdirSync } = require('fs');
const { resolve } = require('path');

const authDir = resolve(__dirname, '.auth');
mkdirSync(authDir, { recursive: true });

// Load .env.test
const envPath = resolve(__dirname, '.env.test');
const envContent = readFileSync(envPath, 'utf-8');
const env = Object.fromEntries(
  envContent.split('\n').filter(l => l && !l.startsWith('#')).map(l => l.split('=').map(s => s.trim()))
);

setup('authenticate as creator', async ({ page }) => {
  await page.goto('login');

  // Wait for the login form to be ready
  await expect(page.locator('.ln-glass-field[type="email"]')).toBeVisible({ timeout: 15000 });

  // Fill credentials
  await page.locator('.ln-glass-field[type="email"]').fill(env.TEST_CREATOR_EMAIL);
  await page.locator('.ln-glass-field[type="password"]').fill(env.TEST_CREATOR_PASSWORD);

  // Click login button
  await page.locator('.ln-btn-primary').click();

  // Wait for redirect away from login (auth fully resolved)
  await page.waitForURL(/\/(dashboard|onboarding|biblioteca|complete-profile|lab)/, { timeout: 20000 });

  // Wait for Firebase to flush auth tokens to localStorage
  await page.waitForTimeout(2000);

  // Mark all progressive-reveal guides as seen so tutorials don't overlay test UI
  await page.evaluate(() => {
    const guideKeys = [
      'biblioteca-ejercicios', 'biblioteca-sesiones', 'biblioteca-planes',
      'biblioteca-planes_nutri', 'library-exercises', 'session-detail',
      'library-content', 'create-module',
    ];
    guideKeys.forEach(k => localStorage.setItem(`wake_guide_${k}`, '1'));
  });

  // Save auth state (cookies + localStorage — Firebase now uses localStorage persistence)
  await page.context().storageState({ path: resolve(__dirname, '.auth/creator.json') });
});
