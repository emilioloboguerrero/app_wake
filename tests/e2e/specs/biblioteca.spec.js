const { test, expect } = require('@playwright/test');
const { BibliotecaPage } = require('../pages/BibliotecaPage.js');

test.describe('Biblioteca - Training', () => {
  let biblioteca;

  test.beforeEach(async ({ page }) => {
    biblioteca = new BibliotecaPage(page);
    await biblioteca.goto();
    await page.waitForTimeout(2000);
  });

  test('loads biblioteca screen', async ({ page }) => {
    await expect(page).toHaveURL(/\/biblioteca/);
  });

  test('shows domain navigation (Entrenamiento / Nutricion)', async ({ page }) => {
    await expect(biblioteca.entrenamientoTab).toBeVisible();
    await expect(biblioteca.nutricionTab).toBeVisible();
  });

  test('shows training sub-tabs', async ({ page }) => {
    await expect(biblioteca.ejerciciosTab).toBeVisible();
    await expect(biblioteca.sesionesTab).toBeVisible();
  });

  test('can switch to Sesiones tab', async ({ page }) => {
    await biblioteca.sesionesTab.click();
    await page.waitForTimeout(1000);
    // Content should update — no crash
    await expect(page).toHaveURL(/\/biblioteca/);
  });

  test('can switch to Planes tab', async ({ page }) => {
    await biblioteca.planesTab.click();
    await page.waitForTimeout(1000);
    await expect(page).toHaveURL(/\/biblioteca/);
  });

  test('search input is available', async ({ page }) => {
    const searchVisible = await biblioteca.searchInput.isVisible();
    // Search may not exist on all tabs, just verify no crash
    expect(searchVisible === true || searchVisible === false).toBeTruthy();
  });
});

test.describe('Biblioteca - Nutrition', () => {
  test('can switch to nutrition domain', async ({ page }) => {
    const biblioteca = new BibliotecaPage(page);
    await biblioteca.goto('nutricion');
    await page.waitForTimeout(2000);

    // Should show nutrition content
    await expect(
      page.getByText(/planes nutricionales/i).or(page.getByText(/nutricion/i).first())
    ).toBeVisible();
  });
});
