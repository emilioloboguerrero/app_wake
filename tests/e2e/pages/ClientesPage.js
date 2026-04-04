class ClientesPage {
  constructor(page) {
    this.page = page;
  }

  async goto(tab) {
    const url = tab ? `clientes?tab=${tab}` : 'clientes';
    await this.page.goto(url);
  }

  get clientesTab() {
    return this.page.getByText('Clientes', { exact: true });
  }

  get asesoriasTab() {
    return this.page.getByText('Programas 1:1', { exact: false });
  }

  get llamadasTab() {
    return this.page.getByText('Llamadas', { exact: true });
  }

  get clientCards() {
    return this.page.locator('.cl-card');
  }

  get emptyState() {
    return this.page.getByText(/no tienes clientes|agrega tu primer/i);
  }

  async clickFirstClient() {
    await this.clientCards.first().click();
  }
}

module.exports = { ClientesPage };
