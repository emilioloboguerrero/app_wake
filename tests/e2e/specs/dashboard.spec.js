const { test, expect } = require('@playwright/test');
const { DashboardPage } = require('../pages/DashboardPage.js');

test.describe('Dashboard', () => {
  test('loads dashboard screen', async ({ page }) => {
    const dashboard = new DashboardPage(page);
    await dashboard.goto();
    await expect(page).toHaveURL(/\/dashboard/);

    // Should render some widget content (bento grid or cards)
    await expect(
      page.locator('[class*="bento"], [class*="widget"], [class*="dashboard"]').first()
    ).toBeVisible({ timeout: 15000 });
  });

  test('dashboard has widget cards', async ({ page }) => {
    await page.goto('dashboard');
    await page.waitForTimeout(3000);

    // At least one widget-like element should be present
    const widgets = page.locator('[class*="bento-card"], [class*="widget"]');
    const count = await widgets.count();
    expect(count).toBeGreaterThan(0);
  });

  test('sidebar navigation is visible on dashboard', async ({ page }) => {
    await page.goto('dashboard');

    // Nav links should be present
    await expect(page.locator('nav, [class*="sidebar"]').first()).toBeVisible({ timeout: 10000 });
  });
});
