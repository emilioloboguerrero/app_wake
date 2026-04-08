// Firebase configuration for Wake Landing
// Same Firebase project as PWA and creator dashboard

import { initializeApp } from 'firebase/app';
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check';
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

// App Check — must run immediately after initializeApp(), before any other service
const RECAPTCHA_SITE_KEY = import.meta.env.VITE_RECAPTCHA_SITE_KEY ?? '';
if (!RECAPTCHA_SITE_KEY) {
  console.warn('[Firebase] AppCheck disabled — VITE_RECAPTCHA_SITE_KEY not set');
}
const appCheck = RECAPTCHA_SITE_KEY
  ? initializeAppCheck(app, {
      provider: new ReCaptchaEnterpriseProvider(RECAPTCHA_SITE_KEY),
      isTokenAutoRefreshEnabled: true,
    })
  : null;

const auth = getAuth(app);

export { auth, appCheck };
export default app;
