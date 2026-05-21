// Single source of truth for the PWA's URL base path. Both App.web.js and
// the inside of WebAppNavigator inspect window.location.pathname and the
// build-time EXPO_PUBLIC_BASE_PATH — they used to derive it independently
// with subtly different rules, which means a future basename change has
// to be coordinated across files or one will silently break.

// Detect the current base path. In production the PWA mounts at /app; in
// dev (Expo web) it's served at /. Prefer URL-detection over env so a hard
// reload at /app/foo correctly recognizes /app as the base, regardless of
// what the build said.
export function getWebBasePath() {
  if (typeof window === 'undefined') {
    // SSR or pre-init — fall back to env (build-time) if available.
    if (typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_BASE_PATH) {
      return process.env.EXPO_PUBLIC_BASE_PATH;
    }
    return '';
  }
  const path = window.location.pathname;
  if (path === '/app' || path.startsWith('/app/')) return '/app';
  if (typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_BASE_PATH) {
    return process.env.EXPO_PUBLIC_BASE_PATH;
  }
  return '';
}

// Build an absolute redirect URL inside the PWA, respecting the base path.
// Use this anywhere we'd otherwise hardcode `/app${path}` — the latter
// breaks if base path ever changes AND already-prefixed `next` values
// silently double up (e.g. `/app/app/library`).
export function buildAppUrl(pathWithLeadingSlash) {
  const base = getWebBasePath();
  const p = pathWithLeadingSlash.startsWith('/') ? pathWithLeadingSlash : `/${pathWithLeadingSlash}`;
  if (base && p.startsWith(`${base}/`)) return p; // already prefixed
  if (base === p) return p; // exact base
  return `${base}${p}`;
}
