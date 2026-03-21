// Firebase configuration for Wake Web Dashboard
// Reuses the same Firebase project as the mobile app

import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getFunctions, httpsCallable } from 'firebase/functions';
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
const stagingConfig = {
  apiKey: "AIzaSyDFd0v35FQhWefCmROGeX9B8SqbYN6GFlk",
  authDomain: "wake-staging.firebaseapp.com",
  projectId: "wake-staging",
  storageBucket: "wake-staging.firebasestorage.app",
  messagingSenderId: "950952211622",
  appId: "1:950952211622:web:3ca95c3e0860ea87323067"
};

const firebaseEnv = import.meta.env.VITE_FIREBASE_ENV;
const firebaseConfig = firebaseEnv === 'staging' ? stagingConfig : productionConfig;

if (firebaseConfig.apiKey === 'TODO') {
  throw new Error(`Firebase ${firebaseEnv} config is incomplete — fill in real values in config/firebase.js`);
}

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize App Check immediately after app, before any other service is used
const RECAPTCHA_SITE_KEY = import.meta.env.VITE_RECAPTCHA_SITE_KEY ?? '';
const appCheck = RECAPTCHA_SITE_KEY
  ? initializeAppCheck(app, {
      provider: new ReCaptchaEnterpriseProvider(RECAPTCHA_SITE_KEY),
      isTokenAutoRefreshEnabled: true,
    })
  : null;

// Initialize Firebase services (web version - no AsyncStorage needed)
const auth = getAuth(app);
const firestore = getFirestore(app);
const storage = getStorage(app);

// Initialize Functions (us-central1 to match deployed functions)
const functions = getFunctions(app, 'us-central1');

// Export Firebase services
export { auth, firestore, storage, functions, appCheck };
export { httpsCallable } from 'firebase/functions';
export default app;

