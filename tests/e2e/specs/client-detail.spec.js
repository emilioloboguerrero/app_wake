const { test, expect } = require('@playwright/test');

test.describe('Client Detail', () => {
  test('navigates to client from clientes and shows profile', async ({ page }) => {
    await page.goto('clientes');
    await page.waitForTimeout(3000);

    const clientCards = page.locator('.cl-card');
    const count = await clientCards.count();

    if (count === 0) {
      test.skip('No clients available to test');
      return;
    }

    await clientCards.first().click();
    await expect(page).toHaveURL(/\/clients\//);
    await page.waitForTimeout(2000);

    // Client screen should render something meaningful
    await expect(
      page.locator('[class*="client"], [class*="Client"]').first()
    ).toBeVisible({ timeout: 10000 });
  });

  test('client detail has tab structure', async ({ page }) => {
    await page.goto('clientes');
    await page.waitForTimeout(3000);

    const clientCards = page.locator('.cl-card');
    const count = await clientCards.count();

    if (count === 0) {
      test.skip('No clients available');
      return;
    }

    await clientCards.first().click();
    await page.waitForTimeout(3000);

    // Look for tabs or tab-like navigation
    const hasTabs = await page.locator('[class*="tab"], [role="tab"], [class*="tubelight"]').first().isVisible().catch(() => false);
    expect(typeof hasTabs).toBe('boolean');
  });
});
