// Firebase configuration for Wake Landing
// Same Firebase project as PWA and creator dashboard

import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyAAF71wvJaoEz1zOxiZv2TsNQWh1DKWo9g',
  authDomain: 'wolf-20b8b.firebaseapp.com',
  projectId: 'wolf-20b8b',
  storageBucket: 'wolf-20b8b.firebasestorage.app',
  messagingSenderId: '781583050959',
  appId: '1:781583050959:android:0239876b40567c87dcefba',
};

const app = initializeApp(firebaseConfig);
const firestore = getFirestore(app);

export { firestore };
export default app;
