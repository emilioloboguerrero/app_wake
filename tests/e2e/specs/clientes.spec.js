const { test, expect } = require('@playwright/test');
const { ClientesPage } = require('../pages/ClientesPage.js');

test.describe('Clientes', () => {
  let clientes;

  test.beforeEach(async ({ page }) => {
    clientes = new ClientesPage(page);
    await clientes.goto();
    await page.waitForTimeout(2000);
  });

  test('loads clientes screen', async ({ page }) => {
    await expect(page).toHaveURL(/\/clientes/);
  });

  test('shows tab navigation', async ({ page }) => {
    await expect(clientes.clientesTab).toBeVisible();
    await expect(clientes.asesoriasTab).toBeVisible();
    await expect(clientes.llamadasTab).toBeVisible();
  });

  test('shows clients or empty state', async ({ page }) => {
    await expect(
      clientes.clientCards.first().or(clientes.emptyState)
    ).toBeVisible({ timeout: 10000 });
  });

  test('can switch to Programas 1:1 tab', async ({ page }) => {
    await clientes.asesoriasTab.click();
    await page.waitForTimeout(1500);
    // Should not crash
    await expect(page).toHaveURL(/\/clientes/);
  });

  test('can switch to Llamadas tab', async ({ page }) => {
    await clientes.llamadasTab.click();
    await page.waitForTimeout(1500);
    await expect(page).toHaveURL(/\/clientes/);
  });

  test('clicking a client navigates to detail', async ({ page }) => {
    const count = await clientes.clientCards.count();
    if (count > 0) {
      await clientes.clickFirstClient();
      await expect(page).toHaveURL(/\/clients\//);
    }
  });
});
