const { test, expect } = require('@playwright/test');
const { LoginPage } = require('../pages/LoginPage.js');

// Auth tests must run without stored session
test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Authentication', () => {
  test('redirects unauthenticated user to login', async ({ page }) => {
    await page.goto('dashboard');
    await expect(page).toHaveURL(/\/login/);
  });

  test('login screen renders correctly', async ({ page }) => {
    const login = new LoginPage(page);
    await login.goto();

    await expect(login.emailInput).toBeVisible();
    await expect(login.passwordInput).toBeVisible();
    await expect(login.loginButton).toBeVisible();
    await expect(login.googleButton).toBeVisible();
    await expect(login.loginTab).toBeVisible();
    await expect(login.signupTab).toBeVisible();
  });

  test('shows error for invalid credentials', async ({ page }) => {
    const login = new LoginPage(page);
    await login.goto();
    await login.login('wrong@email.com', 'wrongpassword');

    await expect(
      login.errorBanner.or(page.locator('[class*="error"]').first())
    ).toBeVisible({ timeout: 10000 });
  });

  test('can switch to signup mode', async ({ page }) => {
    const login = new LoginPage(page);
    await login.goto();
    await login.signupTab.click();

    await expect(page.locator('input[placeholder="Tu nombre"]')).toBeVisible();
    await expect(page.locator('button').filter({ hasText: 'Crear cuenta' }).last()).toBeVisible();
  });

  test('forgot password link is visible', async ({ page }) => {
    const login = new LoginPage(page);
    await login.goto();
    await expect(login.forgotButton).toBeVisible();
  });
});
