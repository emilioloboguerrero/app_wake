const { test, expect } = require('@playwright/test');

test.describe('Nutrition', () => {
  test('/nutrition redirects to biblioteca with nutricion domain', async ({ page }) => {
    await page.goto('nutrition');
    await page.waitForTimeout(2000);
    await expect(page).toHaveURL(/\/biblioteca\?domain=nutricion/);
  });

  test('meal editor loads for new meal', async ({ page }) => {
    await page.goto('nutrition/meals/new');
    await page.waitForTimeout(2000);

    // Should render the meal editor form
    await expect(
      page.locator('[class*="meal"], [class*="Meal"], form, input').first()
    ).toBeVisible({ timeout: 10000 });
  });
});
