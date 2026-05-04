// Auth flows for the storefront. Wraps Firebase Auth with the options the
// AuthModal exposes: Google and email/password.

import {
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  onAuthStateChanged,
  signOut,
} from 'firebase/auth';
import { getToken } from 'firebase/app-check';
import { auth, appCheck } from '../config/firebase';

export async function signInWithGoogle() {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  const cred = await signInWithPopup(auth, provider);
  return cred.user;
}

export async function signInWithEmail(email, password) {
  const cred = await signInWithEmailAndPassword(auth, email, password);
  return cred.user;
}

export async function signUpWithEmail(email, password, displayName) {
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  if (displayName) {
    try {
      await updateProfile(cred.user, { displayName });
    } catch {
      // Profile name is non-critical for the storefront flow.
    }
  }
  return cred.user;
}

export function getCurrentUser() {
  return auth.currentUser;
}

export function signOutStorefront() {
  return signOut(auth);
}

// Subscribe to auth state. Returns the unsubscribe fn. Use in screens that
// render after a hard reload — `auth.currentUser` is null until Firebase
// restores the session asynchronously.
export function subscribeAuthState(cb) {
  return onAuthStateChanged(auth, cb);
}

export function getCurrentIdToken(forceRefresh = false) {
  if (!auth.currentUser) return null;
  return auth.currentUser.getIdToken(forceRefresh);
}

// Returns the current App Check token, or null if App Check isn't initialized.
// Backend public endpoints rely on this to mitigate headless abuse.
export async function getAppCheckTokenForRequest() {
  if (!appCheck) return null;
  try {
    const result = await getToken(appCheck, /* forceRefresh */ false);
    return result?.token ?? null;
  } catch {
    return null;
  }
}
