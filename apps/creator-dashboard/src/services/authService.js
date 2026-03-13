import { auth } from '../config/firebase';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  sendPasswordResetEmail
} from 'firebase/auth';
import { createUserDocument, getUser } from './firestoreService';
import logger from '../utils/logger';

class AuthService {
  async registerUser(email, password, displayName) {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    const initialDisplayName = displayName || email.split('@')[0];
    await updateProfile(user, { displayName: initialDisplayName });
    await user.reload();

    try {
      await createUserDocument(user.uid, {
        email: user.email,
        displayName: initialDisplayName,
        lastLoginAt: new Date(),
        profileCompleted: false,
        onboardingCompleted: false,
        // New users must complete web onboarding before accessing the dashboard
        webOnboardingCompleted: false,
      });
    } catch (docError) {
      // Auth succeeded — don't block login over a Firestore write failure
      logger.warn('Failed to create user document, but user account was created:', docError);
    }

    return user;
  }

  async signInUser(email, password) {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    // Sync displayName from Firestore if Firebase Auth profile is missing it
    if (!user.displayName) {
      try {
        const userData = await getUser(user.uid);
        const fallbackName = userData?.displayName || email.split('@')[0];
        await updateProfile(user, { displayName: fallbackName });
        await user.reload();
      } catch (syncError) {
        logger.warn('Failed to sync displayName:', syncError);
      }
    }

    return user;
  }

  async signOutUser() {
    await signOut(auth);
  }

  getCurrentUser() {
    return auth.currentUser;
  }

  async resetPassword(email) {
    await sendPasswordResetEmail(auth, email);
  }
}

export default new AuthService();
