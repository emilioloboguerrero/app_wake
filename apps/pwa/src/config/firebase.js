// Firebase configuration for Wake
// Using Firebase SDK for Expo

import { initializeApp } from 'firebase/app';
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check';
import { getAuth, initializeAuth, browserLocalPersistence, browserPopupRedirectResolver } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { isWeb } from '../utils/platform';

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
  apiKey: process.env.EXPO_PUBLIC_STAGING_FIREBASE_API_KEY || '',
  authDomain: "wake-staging.firebaseapp.com",
  projectId: "wake-staging",
  storageBucket: "wake-staging.firebasestorage.app",
  messagingSenderId: "950952211622",
  appId: "1:950952211622:web:3ca95c3e0860ea87323067"
};

const firebaseEnv = process.env.EXPO_PUBLIC_FIREBASE_ENV;
const firebaseConfig = firebaseEnv === 'staging' ? stagingConfig : productionConfig;

if (!firebaseConfig.apiKey) {
  throw new Error(`Firebase ${firebaseEnv || 'production'} API key is missing. Set EXPO_PUBLIC_STAGING_FIREBASE_API_KEY in .env for staging.`);
}

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// App Check — must run immediately after initializeApp(), before any other service.
// Key sourced from env; guard lets local dev / emulator run without crashing.
const RECAPTCHA_SITE_KEY = process.env.EXPO_PUBLIC_RECAPTCHA_SITE_KEY ?? '';

let appCheck = null;
if (RECAPTCHA_SITE_KEY) {
  appCheck = initializeAppCheck(app, {
    provider: new ReCaptchaEnterpriseProvider(RECAPTCHA_SITE_KEY),
    isTokenAutoRefreshEnabled: true,
  });
}

// Request persistent storage as early as possible (web). Reduces risk of IndexedDB
// eviction when user closes the PWA. Must run before auth so storage may be granted
// before Firebase writes auth state.
if (isWeb && typeof navigator !== 'undefined' && navigator.storage?.persist) {
  navigator.storage.persist().catch(() => {});
}

// Initialize Firebase Auth with platform-specific persistence
// CRITICAL: For web, we MUST use initializeAuth with persistence BEFORE any auth operations
// Using getAuth() then setPersistence() doesn't work reliably
let auth;
try {
  if (isWeb) {
    // Web: Use initializeAuth with browserLocalPersistence
    // This ensures persistence is set BEFORE auth is initialized
    auth = initializeAuth(app, {
      persistence: browserLocalPersistence,
      popupRedirectResolver: browserPopupRedirectResolver,
    });
  } else {
    // React Native: Use AsyncStorage persistence
    const { getReactNativePersistence } = require('firebase/auth');
    const AsyncStorage = require('@react-native-async-storage/async-storage').default;
    auth = initializeAuth(app, {
      persistence: getReactNativePersistence(AsyncStorage)
    });
  }
} catch (error) {
  // If already initialized, get the existing instance. Do NOT call setPersistence
  // here: it can wipe existing auth state (Firebase SDK behavior).
  if (error.code === 'auth/already-initialized') {
    auth = getAuth(app);
  } else {
    throw error;
  }
}

const firestore = getFirestore(app);
const storage = getStorage(app);

// Export Firebase services
export { auth, firestore, storage, appCheck };
export default app;
