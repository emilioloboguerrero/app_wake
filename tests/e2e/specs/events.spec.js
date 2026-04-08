const { test, expect } = require('@playwright/test');

test.describe('Events', () => {
  test('loads events screen', async ({ page }) => {
    await page.goto('events');
    await page.waitForTimeout(2000);
    await expect(page).toHaveURL(/\/events/);
  });

  test('shows event tabs (Activos, Borradores, Cerrados)', async ({ page }) => {
    await page.goto('events');
    await page.waitForTimeout(2000);

    await expect(page.getByText('Activos')).toBeVisible();
    await expect(page.getByText('Borradores')).toBeVisible();
    await expect(page.getByText('Cerrados')).toBeVisible();
  });

  test('can switch between event tabs', async ({ page }) => {
    await page.goto('events');
    await page.waitForTimeout(2000);

    await page.getByText('Borradores').click();
    await page.waitForTimeout(1000);

    await page.getByText('Cerrados').click();
    await page.waitForTimeout(1000);

    await page.getByText('Activos').click();
    await page.waitForTimeout(1000);

    // No crash
    await expect(page).toHaveURL(/\/events/);
  });

  test('can navigate to create event', async ({ page }) => {
    await page.goto('events/new');
    await page.waitForTimeout(2000);

    // Event editor should load
    await expect(
      page.locator('[class*="event-editor"], [class*="EventEditor"], form').first()
    ).toBeVisible({ timeout: 10000 });
  });
});
