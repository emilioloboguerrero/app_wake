// Firebase configuration for Wake
// Using Firebase SDK for Expo

import { initializeApp } from 'firebase/app';
import { getAuth, initializeAuth, setPersistence, browserLocalPersistence } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { isWeb } from '../utils/platform';
import logger from '../utils/logger';

// Firebase configuration object
// Configuration from your Firebase project: wolf-20b8b
const firebaseConfig = {
  apiKey: "AIzaSyAAF71wvJaoEz1zOxiZv2TsNQWh1DKWo9g",
  authDomain: "wolf-20b8b.firebaseapp.com",
  projectId: "wolf-20b8b",
  storageBucket: "wolf-20b8b.firebasestorage.app",
  messagingSenderId: "781583050959",
  appId: "1:781583050959:android:0239876b40567c87dcefba"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase Auth with platform-specific persistence
// CRITICAL: For web, we MUST use initializeAuth with persistence BEFORE any auth operations
// Using getAuth() then setPersistence() doesn't work reliably
let auth;
try {
  if (isWeb) {
    // Web: Use initializeAuth with browserLocalPersistence
    // This ensures persistence is set BEFORE auth is initialized
    logger.debug('[FIREBASE] 🔐 Initializing auth with browserLocalPersistence...');
    auth = initializeAuth(app, {
      persistence: browserLocalPersistence
    });
    logger.debug('[FIREBASE] ✅ Auth initialized with browserLocalPersistence (IndexedDB)');
    
    // Check if there's a current user immediately after initialization
    setTimeout(() => {
      const currentUser = auth.currentUser;
      logger.debug('[FIREBASE] 🔐 [POST-INIT CHECK] auth.currentUser after init:', currentUser ? `User: ${currentUser.uid}, Email: ${currentUser.email}` : 'null');
    }, 100);
  } else {
    // React Native: Use AsyncStorage persistence
    const { getReactNativePersistence } = require('firebase/auth');
    const AsyncStorage = require('@react-native-async-storage/async-storage').default;
    auth = initializeAuth(app, {
      persistence: getReactNativePersistence(AsyncStorage)
    });
  }
} catch (error) {
  // If already initialized, get the existing instance
  if (error.code === 'auth/already-initialized') {
    logger.debug('[FIREBASE] Auth already initialized, using existing instance');
    auth = getAuth(app);
    // Try to set persistence even if already initialized (for web)
    if (isWeb) {
      setPersistence(auth, browserLocalPersistence).then(() => {
        logger.debug('[FIREBASE] ✅ Persistence set on existing auth instance');
      }).catch((persistError) => {
        logger.warn('[FIREBASE] Could not set persistence on existing instance:', persistError.code);
      });
    }
  } else {
    throw error;
  }
}

const firestore = getFirestore(app);
const storage = getStorage(app);

// Export Firebase services
export { auth, firestore, storage };
export default app;
