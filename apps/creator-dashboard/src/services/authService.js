// Firebase Auth service for Wake Web Dashboard
import { auth } from '../config/firebase';
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  signOut, 
  updateProfile,
  sendPasswordResetEmail
} from 'firebase/auth';
import { createUserDocument, getUser } from './firestoreService';

class AuthService {
  // Register new user
  async registerUser(email, password, displayName) {
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;
      
      // Update user profile with displayName
      const initialDisplayName = displayName || email.split('@')[0];
      await updateProfile(user, {
        displayName: initialDisplayName
      });
      await user.reload();
      
      // Create user document in Firestore
      try {
        await createUserDocument(user.uid, {
          email: user.email,
          displayName: initialDisplayName,
          lastLoginAt: new Date(),
          profileCompleted: false,
          onboardingCompleted: false,
          webOnboardingCompleted: false, // New users need to complete web onboarding
        });
      } catch (docError) {
        console.warn('Failed to create user document, but user account was created:', docError);
        // Don't throw error - authentication was successful
      }
      
      return user;
    } catch (error) {
      throw error;
    }
  }

  // Sign in user
  async signInUser(email, password) {
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;
      
      // Check if user has displayName in Firebase Auth
      // If not, sync from Firestore
      if (!user.displayName) {
        try {
          const userData = await getUser(user.uid);
          if (userData?.displayName) {
            await updateProfile(user, {
              displayName: userData.displayName
            });
            await user.reload();
          } else {
            const fallbackName = email.split('@')[0];
            await updateProfile(user, {
              displayName: fallbackName
            });
            await user.reload();
          }
        } catch (syncError) {
          console.warn('Failed to sync displayName:', syncError);
        }
      }
      
      return user;
    } catch (error) {
      throw error;
    }
  }

  // Sign out user
  async signOutUser() {
    try {
      await signOut(auth);
    } catch (error) {
      throw error;
    }
  }

  // Get current user
  getCurrentUser() {
    return auth.currentUser;
  }

  // Reset password
  async resetPassword(email) {
    try {
      await sendPasswordResetEmail(auth, email);
    } catch (error) {
      throw error;
    }
  }
}

export default new AuthService();

