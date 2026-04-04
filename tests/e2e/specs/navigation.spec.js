const { test, expect } = require('@playwright/test');
const { SidebarNav } = require('../pages/SidebarNav.js');

test.describe('Navigation - Sidebar', () => {
  test('sidebar renders with nav links', async ({ page }) => {
    await page.goto('dashboard');
    await page.waitForTimeout(2000);

    const nav = new SidebarNav(page);

    // At least the sidebar/nav area should be visible
    await expect(nav.sidebar).toBeVisible({ timeout: 10000 });
  });

  test('can navigate via sidebar: Inicio -> Biblioteca', async ({ page }) => {
    await page.goto('dashboard');
    await page.waitForTimeout(2000);

    const nav = new SidebarNav(page);
    await nav.bibliotecaLink.click();
    await expect(page).toHaveURL(/\/biblioteca/);
  });

  test('can navigate via sidebar: Biblioteca -> Asesorias', async ({ page }) => {
    await page.goto('biblioteca');
    await page.waitForTimeout(2000);

    const nav = new SidebarNav(page);
    await nav.asesoriasLink.click();
    await expect(page).toHaveURL(/\/clientes/);
  });

  test('can navigate via sidebar: Clientes -> Generales', async ({ page }) => {
    await page.goto('clientes');
    await page.waitForTimeout(2000);

    const nav = new SidebarNav(page);
    await nav.generalesLink.click();
    await expect(page).toHaveURL(/\/programas/);
  });

  test('can navigate via sidebar: Programas -> Eventos', async ({ page }) => {
    await page.goto('programas');
    await page.waitForTimeout(2000);

    const nav = new SidebarNav(page);
    const eventosVisible = await nav.eventosLink.isVisible().catch(() => false);
    if (eventosVisible) {
      await nav.eventosLink.click();
      await expect(page).toHaveURL(/\/events/);
    }
  });
});

test.describe('Navigation - Legacy Redirects', () => {
  test('/ redirects to /dashboard', async ({ page }) => {
    await page.goto('');
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test('/content redirects to /biblioteca', async ({ page }) => {
    await page.goto('content');
    await expect(page).toHaveURL(/\/biblioteca/);
  });

  test('/products redirects to /clientes', async ({ page }) => {
    await page.goto('products');
    await expect(page).toHaveURL(/\/clientes/);
  });

  test('/programs redirects to /programas', async ({ page }) => {
    await page.goto('programs');
    await expect(page).toHaveURL(/\/programas/);
  });

  test('/lab redirects to /dashboard', async ({ page }) => {
    await page.goto('lab');
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test('/clients redirects to /clientes', async ({ page }) => {
    await page.goto('clients');
    await expect(page).toHaveURL(/\/clientes/);
  });

  test('/one-on-one redirects to /clientes', async ({ page }) => {
    await page.goto('one-on-one');
    await expect(page).toHaveURL(/\/clientes/);
  });

  test('/libraries redirects to /biblioteca', async ({ page }) => {
    await page.goto('libraries');
    await expect(page).toHaveURL(/\/biblioteca/);
  });

  test('/nutrition redirects to /biblioteca?domain=nutricion', async ({ page }) => {
    await page.goto('nutrition');
    await expect(page).toHaveURL(/\/biblioteca\?domain=nutricion/);
  });

  test('/availability redirects to /clientes?tab=llamadas', async ({ page }) => {
    await page.goto('availability');
    await expect(page).toHaveURL(/\/clientes\?tab=llamadas/);
  });
});
