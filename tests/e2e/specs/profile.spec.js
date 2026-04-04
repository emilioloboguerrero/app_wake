const { test, expect } = require('@playwright/test');

test.describe('Profile', () => {
  test('profile screen loads', async ({ page }) => {
    await page.goto('profile');
    await page.waitForTimeout(3000);

    // Should show profile form with name field
    await expect(
      page.locator('input').first()
    ).toBeVisible({ timeout: 10000 });
  });

  test('profile has editable fields', async ({ page }) => {
    await page.goto('profile');
    await page.waitForTimeout(3000);

    // Should have at least one input field
    const inputs = page.locator('input');
    const count = await inputs.count();
    expect(count).toBeGreaterThan(0);
  });
});

test.describe('API Keys', () => {
  test('api keys screen loads', async ({ page }) => {
    await page.goto('api-keys');
    await page.waitForTimeout(2000);

    await expect(page).toHaveURL(/\/api-keys/);
    // Should render the API keys interface
    await expect(
      page.locator('[class*="api"], [class*="Api"]').first().or(page.getByText(/API/i).first())
    ).toBeVisible({ timeout: 10000 });
  });
});
