class ProgramasPage {
  constructor(page) {
    this.page = page;
  }

  async goto() {
    await this.page.goto('programas');
  }

  get programCards() {
    return this.page.locator('.pgs-card');
  }

  get createButton() {
    return this.page.locator('button').filter({ hasText: /crear|nuevo/i }).first();
  }

  get emptyState() {
    return this.page.getByText(/no tienes programas|crea tu primer/i);
  }

  async clickFirstProgram() {
    await this.programCards.first().click();
  }
}

module.exports = { ProgramasPage };
