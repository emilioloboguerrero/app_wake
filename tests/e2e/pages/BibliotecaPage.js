class BibliotecaPage {
  constructor(page) {
    this.page = page;
  }

  async goto(domain) {
    const url = domain ? `biblioteca?domain=${domain}` : 'biblioteca';
    await this.page.goto(url);
  }

  get domainNav() {
    return this.page.locator('[class*="tubelight"], [class*="domain"]').first();
  }

  get entrenamientoTab() {
    return this.page.getByText('Entrenamiento', { exact: false });
  }

  get nutricionTab() {
    return this.page.getByText('Nutricion', { exact: false });
  }

  get ejerciciosTab() {
    return this.page.getByText('Ejercicios', { exact: false });
  }

  get sesionesTab() {
    return this.page.getByText('Sesiones', { exact: false });
  }

  get planesTab() {
    return this.page.getByText('Planes', { exact: true });
  }

  get searchInput() {
    return this.page.locator('input[placeholder*="Buscar"], input[class*="search"]');
  }

  get createButton() {
    return this.page.locator('button').filter({ hasText: /crear|nueva|nuevo/i }).first();
  }
}

module.exports = { BibliotecaPage };
