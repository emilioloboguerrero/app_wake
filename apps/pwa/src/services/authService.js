// Firebase Auth service for Wake
import { auth } from '../config/firebase';
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  signOut, 
  updateProfile,
  sendPasswordResetEmail,
  onAuthStateChanged,
  deleteUser,
  reauthenticateWithCredential,
  EmailAuthProvider,
  GoogleAuthProvider,
  OAuthProvider
} from 'firebase/auth';
import { authStorage } from '../utils/authStorage';
import profilePictureService from './profilePictureService';
import hybridDataService from './hybridDataService';
import sessionManager from './sessionManager';
import googleAuthService from './googleAuthService';
import firestoreService from './firestoreService';
import { handleError, handleNetworkOperation } from '../utils/errorHandler';
import Constants from 'expo-constants';
import logger from '../utils/logger';

// Check if running in Expo Go
const isExpoGo = Constants.appOwnership === 'expo';

class AuthService {
  // Register new user
  async registerUser(email, password, displayName) {
    try {
      // Add timeout to prevent hanging (30 seconds)
      const createUserPromise = createUserWithEmailAndPassword(auth, email, password);
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Registration timeout - please try again')), 30000)
      );
      
      const cred = await Promise.race([createUserPromise, timeoutPromise]);
      
      // Update user profile
      await updateProfile(cred.user, {
        displayName: displayName
      });

      // Create or update Firestore user doc so every sign-in method has a document
      try {
        await firestoreService.updateUser(cred.user.uid, {
          email: cred.user.email,
          displayName: displayName || cred.user.email?.split('@')[0] || 'Usuario',
          provider: 'email',
          lastLoginAt: new Date(),
        });
        logger.log('[AUTH] registerUser: Firestore user doc created/updated for uid:', cred.user?.uid);
      } catch (docError) {
        logger.warn('[AUTH] registerUser: Firestore doc create/update failed (non-fatal):', docError?.message);
      }

      return cred.user;
    } catch (error) {
      // Don't use handleNetworkOperation for web - it can cause freezes
      // Firebase will handle network errors gracefully
      handleError(error, {
        context: 'Register User',
        showAlert: false, // Let calling code handle UI
        title: 'Error al registrarse',
      });
      throw error;
    }
  }

  // Sign in user
  async signInUser(email, password) {
    logger.debug('[AUTH] signInUser called');
    try {
      logger.debug('[AUTH] Calling Firebase signInWithEmailAndPassword...');
      // Add timeout to prevent hanging (30 seconds)
      const signInPromise = signInWithEmailAndPassword(auth, email, password);
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Sign in timeout - please try again')), 30000)
      );
      
      const userCredential = await Promise.race([signInPromise, timeoutPromise]);
      logger.debug('[AUTH] ✅ Sign in successful:', {
        userId: userCredential.user?.uid,
        email: userCredential.user?.email,
        firebaseCurrentUser: !!auth.currentUser
      });
      
      // Wait a bit longer to ensure Firebase auth state propagates and onAuthStateChanged fires
      // This helps AuthContext's onAuthStateChanged listener fire before we return
      await new Promise(resolve => setTimeout(resolve, 150));
      
      // Verify user is still available after delay
      const finalUser = auth.currentUser || userCredential.user;
      logger.debug('[AUTH] Final user check after delay:', {
        hasUser: !!finalUser,
        userId: finalUser?.uid
      });

      // Create or update Firestore user doc so every sign-in method has a document
      if (finalUser?.uid) {
        try {
          await firestoreService.updateUser(finalUser.uid, {
            email: finalUser.email,
            displayName: finalUser.displayName || finalUser.email?.split('@')[0] || 'Usuario',
            provider: 'email',
            lastLoginAt: new Date(),
          });
          logger.debug('[AUTH] signInUser: Firestore user doc created/updated for uid:', finalUser.uid);
        } catch (docError) {
          logger.warn('[AUTH] signInUser: Firestore doc create/update failed (non-fatal):', docError?.message);
        }
      }
      
      return finalUser || userCredential.user;
    } catch (error) {
      logger.error('[AUTH] Sign in error:', error.code, error.message);
      // Don't use handleNetworkOperation for web - it can cause freezes
      // Firebase will handle network errors gracefully
      handleError(error, {
        context: 'Sign In',
        showAlert: false, // Let calling code handle UI
        title: 'Error al iniciar sesión',
      });
      throw error;
    }
  }

  // Sign out user
  async signOutUser() {
    try {
      const currentUser = auth.currentUser;
      const userId = currentUser?.uid;
      
      // Check if user signed in with Google and sign out (only if not in Expo Go)
      if (!isExpoGo) {
        const isGoogleSignedIn = await googleAuthService.isSignedIn();
        if (isGoogleSignedIn) {
          await googleAuthService.signOut();
        }
      }
      
      // Sign out from Firebase
      await signOut(auth);
      
      // Clear auth state
      await authStorage.clearAuthState();
      
      // Clear all user-specific caches
      if (userId) {
        await Promise.all([
          profilePictureService.clearUserCache(userId),
          hybridDataService.clearUserCache(userId),
          sessionManager.clearUserCache(userId)
        ]);
      }
      
    } catch (error) {
      throw error;
    }
  }

  // Get current user
  getCurrentUser() {
    return auth.currentUser;
  }

  // Listen to auth state changes
  onAuthStateChangedListener(callback) {
    return onAuthStateChanged(auth, callback);
  }

  // Reset password
  async resetPassword(email) {
    try {
      await sendPasswordResetEmail(auth, email);
    } catch (error) {
      throw error;
    }
  }

  // Delete user account (requires reauthentication)
  async deleteAccount(credential = null) {
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        throw new Error('No user is currently signed in');
      }

      const userId = currentUser.uid;
      
      // Reauthenticate if credential is provided
      if (credential) {
        await reauthenticateWithCredential(currentUser, credential);
      }

      // Import firestoreService here to avoid circular dependency
      const firestoreService = (await import('./firestoreService')).default;
      
      // Delete profile picture from Storage FIRST (before deleting user document)
      // This ensures we still have permissions to access Storage
      try {
        await profilePictureService.deleteProfilePicture(userId);
      } catch (error) {
        // Ignore errors if picture doesn't exist or permission denied
        // This is not critical - continue with account deletion
        if (error.code === 'storage/object-not-found' || 
            error.code === 'storage/unauthorized' ||
            error.message?.includes('does not exist')) {
          logger.debug('Profile picture does not exist or already deleted, continuing...');
        } else {
          logger.warn('Failed to delete profile picture (non-critical):', error.message || error);
        }
      }

      // Delete all user data from Firestore (except purchases as per requirements)
      await firestoreService.deleteAllUserData(userId);

      // Revoke OAuth tokens (if applicable)
      if (!isExpoGo) {
        try {
          const isGoogleSignedIn = await googleAuthService.isSignedIn();
          if (isGoogleSignedIn) {
            await googleAuthService.signOut();
          }
        } catch (error) {
          logger.warn('Failed to revoke Google token:', error);
        }
      }

      // Clear all local caches before deleting account
      await Promise.all([
        profilePictureService.clearUserCache(userId),
        hybridDataService.clearUserCache(userId),
        sessionManager.clearUserCache(userId),
        authStorage.clearAuthState()
      ]);

      // Delete Firebase Auth account
      await deleteUser(currentUser);

      return { success: true };
    } catch (error) {
      logger.error('Error deleting account:', error);
      throw error;
    }
  }
}

export default new AuthService();