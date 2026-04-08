import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const productionConfig = {
  apiKey: "AIzaSyAAF71wvJaoEz1zOxiZv2TsNQWh1DKWo9g",
  authDomain: "wolf-20b8b.firebaseapp.com",
  projectId: "wolf-20b8b",
  storageBucket: "wolf-20b8b.firebasestorage.app",
  messagingSenderId: "781583050959",
  appId: "1:781583050959:web:b0397d11565ce113dcefba"
};

const stagingConfig = {
  apiKey: "TODO",
  authDomain: "wake-staging.firebaseapp.com",
  projectId: "wake-staging",
  storageBucket: "wake-staging.firebasestorage.app",
  messagingSenderId: "TODO",
  appId: "TODO"
};

const firebaseEnv = import.meta.env.VITE_FIREBASE_ENV;
const firebaseConfig = firebaseEnv === 'staging' ? stagingConfig : productionConfig;

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const firestore = getFirestore(app);

export { auth, firestore };
export default app;
