// Firebase configuration for Wake Landing
// Same Firebase project as PWA and creator dashboard

import { initializeApp } from 'firebase/app';
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check';
import { getFirestore } from 'firebase/firestore';
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
// TODO: Fill in real values once the wake-staging project is created in Firebase Console
const stagingConfig = {
  apiKey: 'TODO',
  authDomain: 'wake-staging.firebaseapp.com',
  projectId: 'wake-staging',
  storageBucket: 'wake-staging.firebasestorage.app',
  messagingSenderId: 'TODO',
  appId: 'TODO',
};

const firebaseEnv = import.meta.env.VITE_FIREBASE_ENV;
const firebaseConfig = firebaseEnv === 'staging' ? stagingConfig : productionConfig;

const app = initializeApp(firebaseConfig);

// App Check — must run immediately after initializeApp(), before any other service
const RECAPTCHA_SITE_KEY = import.meta.env.VITE_RECAPTCHA_SITE_KEY ?? '';
const appCheck = RECAPTCHA_SITE_KEY
  ? initializeAppCheck(app, {
      provider: new ReCaptchaEnterpriseProvider(RECAPTCHA_SITE_KEY),
      isTokenAutoRefreshEnabled: true,
    })
  : null;

const firestore = getFirestore(app);
const auth = getAuth(app);

export { firestore, auth, appCheck };
export default app;
