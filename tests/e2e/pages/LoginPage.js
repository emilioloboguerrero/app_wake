class LoginPage {
  constructor(page) {
    this.page = page;
    this.emailInput = page.locator('.ln-glass-field[type="email"]');
    this.passwordInput = page.locator('.ln-glass-field[type="password"]');
    this.loginButton = page.locator('.ln-btn-primary');
    this.googleButton = page.locator('.ln-btn-google');
    this.errorBanner = page.locator('.ln-error-banner');
    this.signupTab = page.locator('.ln-mode-btn').filter({ hasText: 'Crear cuenta' });
    this.loginTab = page.locator('.ln-mode-btn').filter({ hasText: 'Iniciar sesion' });
    this.forgotButton = page.locator('.ln-forgot-btn');
  }

  async goto() {
    await this.page.goto('login');
    await this.emailInput.waitFor({ state: 'visible', timeout: 15000 });
  }

  async login(email, password) {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.loginButton.click();
  }
}

module.exports = { LoginPage };
