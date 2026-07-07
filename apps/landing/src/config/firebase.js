// Firebase configuration for Wake Landing
// Same Firebase project as PWA and creator dashboard

import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';

// Production Firebase project: wolf-20b8b
const productionConfig = {
  apiKey: 'AIzaSyAAF71wvJaoEz1zOxiZv2TsNQWh1DKWo9g',
  authDomain: 'wolf-20b8b.firebaseapp.com',
  projectId: 'wolf-20b8b',
  storageBucket: 'wolf-20b8b.firebasestorage.app',
  messagingSenderId: '781583050959',
  appId: '1:781583050959:web:b0397d11565ce113dcefba',
};

// Staging Firebase project: wake-staging
// API key read from env to avoid committing secrets to the repo.
const stagingConfig = {
  apiKey: import.meta.env.VITE_STAGING_FIREBASE_API_KEY || '',
  authDomain: 'wake-staging.firebaseapp.com',
  projectId: 'wake-staging',
  storageBucket: 'wake-staging.firebasestorage.app',
  messagingSenderId: '950952211622',
  appId: '1:950952211622:web:3ca95c3e0860ea87323067',
};

const firebaseEnv = import.meta.env.VITE_FIREBASE_ENV;
const firebaseConfig = firebaseEnv === 'staging' ? stagingConfig : productionConfig;

if (!firebaseConfig.apiKey) {
  throw new Error('Firebase API key is missing. Set VITE_STAGING_FIREBASE_API_KEY in .env for staging.');
}

const app = initializeApp(firebaseConfig);

const auth = getAuth(app);

// App Check — deferred, NOT eager. The reCAPTCHA Enterprise provider pulls in
// ~2 MB of Google scripts (base.js, recaptcha__en.js, module chunks) at runtime.
// The storefront's public reads (program, storefront) never carry an App Check
// token — only the checkout POST does, and that only fires on a click. So we
// lazy-init on first token request and warm it during idle, keeping ~2 MB off
// the initial critical path. The firebase/app-check SDK is dynamically imported
// so it lands in its own chunk, not the main bundle.
const RECAPTCHA_SITE_KEY = import.meta.env.VITE_RECAPTCHA_SITE_KEY ?? '';
if (!RECAPTCHA_SITE_KEY) {
  console.warn('[Firebase] AppCheck disabled — VITE_RECAPTCHA_SITE_KEY not set');
}

let appCheckPromise = null;

// Initialize App Check once, on demand. Returns the instance (or null when no
// site key is configured, e.g. local dev). Safe to call repeatedly.
export function ensureAppCheck() {
  if (!RECAPTCHA_SITE_KEY) return Promise.resolve(null);
  if (!appCheckPromise) {
    appCheckPromise = import('firebase/app-check')
      .then(({ initializeAppCheck, ReCaptchaEnterpriseProvider }) =>
        initializeAppCheck(app, {
          provider: new ReCaptchaEnterpriseProvider(RECAPTCHA_SITE_KEY),
          isTokenAutoRefreshEnabled: true,
        })
      )
      .catch(() => null);
  }
  return appCheckPromise;
}

// Warm App Check on the buyer's first interaction (scroll / tap / key) so the
// token is ready by the time they click buy — without ever competing with the
// initial content render. requestIdleCallback fires during pre-load idle gaps
// (this page waits on images), which would pull reCAPTCHA into the first paint;
// first-interaction is strictly after render and still well before any checkout.
// ensureAppCheck() is idempotent, so getAppCheckTokenForRequest() on the click
// itself is the backstop if the buyer somehow clicks without interacting first.
if (typeof window !== 'undefined' && RECAPTCHA_SITE_KEY) {
  const warm = () => { ensureAppCheck(); };
  ['pointerdown', 'touchstart', 'keydown', 'scroll'].forEach((ev) =>
    window.addEventListener(ev, warm, { once: true, passive: true })
  );
}

export { auth };
export default app;
