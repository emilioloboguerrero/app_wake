class DashboardPage {
  constructor(page) {
    this.page = page;
  }

  async goto() {
    await this.page.goto('dashboard');
  }

  get layoutToggle() {
    return this.page.locator('[class*="layout"]').first();
  }

  get widgetCards() {
    return this.page.locator('.bento-card, [class*="widget"], [class*="bento"]');
  }

  get screenTitle() {
    return this.page.locator('[class*="sticky-header"], [class*="screen-title"]').first();
  }
}

module.exports = { DashboardPage };
