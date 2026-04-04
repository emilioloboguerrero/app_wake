class SidebarNav {
  constructor(page) {
    this.page = page;
  }

  get sidebar() {
    return this.page.locator('[class*="sidebar"], nav').first();
  }

  navLink(label) {
    return this.page.locator('nav a, [class*="sidebar"] a, [class*="nav-item"]').filter({ hasText: label });
  }

  get inicioLink() { return this.navLink('Inicio'); }
  get asesoriasLink() { return this.navLink('Asesor'); }
  get generalesLink() { return this.navLink('Generales'); }
  get bibliotecaLink() { return this.navLink('Biblioteca'); }
  get eventosLink() { return this.navLink('Eventos'); }
  get profileLink() { return this.page.locator('[class*="avatar"], [class*="profile"]').first(); }
}

module.exports = { SidebarNav };
