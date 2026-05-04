// Reserved usernames denylist.
//
// `wakelab.co/{username}` serves the public creator storefront. Any string in
// this set must be unclaimable as a username so it remains available for
// existing routes (e.g. /app, /creators, /e), future product routes
// (e.g. /tienda, /blog), and brand/legal/infra paths.
//
// Trimming this set later is hard (would orphan claimed names); expanding is
// trivial. Be generous.

const RESERVED_USERNAMES_LIST = [
  // Routes & infra
  "app", "creators", "creadores", "api", "e", "www", "mail", "ftp", "smtp",
  "admin", "root", "system", "status", "staging", "dev", "test",
  "static", "assets", "public", "cdn", "cache",
  "developers", "developer", "design", "landing",
  "404", "500", "robots.txt", "sitemap.xml", "favicon.ico", "manifest.json",
  ".well-known", "well-known",

  // Auth & account
  "login", "logout", "signin", "signup", "signout", "register", "auth",
  "password", "reset", "verify", "confirm", "forgot", "oauth", "sso",
  "account", "profile", "settings", "dashboard", "me",

  // Brand & legal
  "wake", "wakelab", "lab", "oficial", "official", "support", "soporte",
  "ayuda", "contacto", "contact", "legal", "privacidad", "privacy",
  "terminos", "terms", "cookies", "gdpr", "dmca",
  "about", "sobre", "equipo", "team", "careers", "jobs", "prensa", "press",

  // Future routes (reserve now)
  "tienda", "store", "shop", "athletes", "atletas", "biblioteca", "library",
  "programas", "programs", "eventos", "events",
  "blog", "comunidad", "community", "entrenadores", "coaches",
  "precios", "pricing", "planes", "plans", "descargar", "download",
  "faq", "success", "error", "checkout",
  "pagar", "pago", "comprar", "comprado", "gracias", "cancelar",
  "invite", "invites", "ref", "referral", "partners",
  "go", "l", "link", "share", "qr", "u", "c",

  // Confusables / squat targets
  "null", "undefined", "true", "false", "anonymous", "anonimo",
  "user", "usuario", "guest", "demo", "sample", "default",
];

const RESERVED_USERNAMES = new Set(
  RESERVED_USERNAMES_LIST.map((s) => s.toLowerCase())
);

export function isReservedUsername(username: string | undefined | null): boolean {
  if (!username) return false;
  return RESERVED_USERNAMES.has(username.toLowerCase().trim());
}

export function getReservedUsernames(): string[] {
  return Array.from(RESERVED_USERNAMES).sort();
}
