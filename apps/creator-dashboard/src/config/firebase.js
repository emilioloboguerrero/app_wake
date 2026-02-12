// Firebase configuration for Wake Web Dashboard
// Reuses the same Firebase project as the mobile app

import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getFunctions, httpsCallable } from 'firebase/functions';

// Firebase configuration (same as mobile app)
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

// Initialize Firebase services (web version - no AsyncStorage needed)
const auth = getAuth(app);
const firestore = getFirestore(app);
const storage = getStorage(app);

// Initialize Functions (us-central1 to match deployed functions)
const functions = getFunctions(app, 'us-central1');

// Export Firebase services
export { auth, firestore, storage, functions };
export { httpsCallable } from 'firebase/functions';
export default app;

