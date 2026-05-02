// Firebase configuration for Wake Web Dashboard
// Reuses the same Firebase project as the mobile app

import { initializeApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, browserLocalPersistence, setPersistence } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';
import { getStorage, connectStorageEmulator } from 'firebase/storage';
import { getFunctions, connectFunctionsEmulator, httpsCallable } from 'firebase/functions';
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check';

// Production Firebase project: wolf-20b8b
const productionConfig = {
  apiKey: "AIzaSyAAF71wvJaoEz1zOxiZv2TsNQWh1DKWo9g",
  authDomain: "wolf-20b8b.firebaseapp.com",
  projectId: "wolf-20b8b",
  storageBucket: "wolf-20b8b.firebasestorage.app",
  messagingSenderId: "781583050959",
  appId: "1:781583050959:web:b0397d11565ce113dcefba"
};

// Staging Firebase project: wake-staging
// API key read from env to avoid committing secrets to the repo.
const stagingConfig = {
  apiKey: import.meta.env.VITE_STAGING_FIREBASE_API_KEY || '',
  authDomain: "wake-staging.firebaseapp.com",
  projectId: "wake-staging",
  storageBucket: "wake-staging.firebasestorage.app",
  messagingSenderId: "950952211622",
  appId: "1:950952211622:web:3ca95c3e0860ea87323067"
};

const firebaseEnv = import.meta.env.VITE_FIREBASE_ENV;
const firebaseConfig = firebaseEnv === 'staging' ? stagingConfig : productionConfig;

if (!firebaseConfig.apiKey) {
  throw new Error(`Firebase API key is missing. Set VITE_STAGING_FIREBASE_API_KEY in .env for staging.`);
}

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize App Check immediately after app, before any other service is used
// Skip in local dev — reCAPTCHA Enterprise is only configured for production
const RECAPTCHA_SITE_KEY = import.meta.env.VITE_RECAPTCHA_SITE_KEY ?? '';
const isDev = import.meta.env.DEV;
const appCheck = (RECAPTCHA_SITE_KEY && !isDev)
  ? initializeAppCheck(app, {
      provider: new ReCaptchaEnterpriseProvider(RECAPTCHA_SITE_KEY),
      isTokenAutoRefreshEnabled: true,
    })
  : null;

// Initialize Firebase services (web version - no AsyncStorage needed)
const auth = getAuth(app);

// Use localStorage persistence so Playwright storageState can capture auth tokens
setPersistence(auth, browserLocalPersistence);
const firestore = getFirestore(app);
const storage = getStorage(app);

// Initialize Functions (us-central1 to match deployed functions)
const functions = getFunctions(app, 'us-central1');

// Connect to emulators when (a) DEV build with no firebase env (default
// behavior preserved) OR (b) explicitly opted-in via VITE_USE_EMULATOR=true
// even with a project env set. (b) is what `npm run dev:full` uses to get
// rules eval against a project-flavored auth flow.
const useEmulators = (import.meta.env.DEV && !firebaseEnv) ||
  import.meta.env.VITE_USE_EMULATOR === 'true';
if (useEmulators) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(firestore, '127.0.0.1', 8080);
  connectStorageEmulator(storage, '127.0.0.1', 9199);
  connectFunctionsEmulator(functions, '127.0.0.1', 5001);
}

// Export Firebase services
export { auth, firestore, storage, functions, appCheck };
export { httpsCallable } from 'firebase/functions';
export default app;

