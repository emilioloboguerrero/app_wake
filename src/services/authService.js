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
import appleAuthService from './appleAuthService';
import { handleError, handleNetworkOperation } from '../utils/errorHandler';
import Constants from 'expo-constants';

// Check if running in Expo Go
const isExpoGo = Constants.appOwnership === 'expo';

class AuthService {
  // Register new user
  async registerUser(email, password, displayName) {
    try {
      const userCredential = await handleNetworkOperation(
        async () => {
          const cred = await createUserWithEmailAndPassword(auth, email, password);
          
          // Update user profile
          await updateProfile(cred.user, {
            displayName: displayName
          });

          return cred.user;
        },
        {
          context: 'Register User',
          title: 'Error al registrarse',
          checkConnection: true,
          showAlert: false, // Let calling code handle UI
        }
      );
      
      return userCredential;
    } catch (error) {
      handleError(error, {
        context: 'Register User',
        showAlert: true,
        title: 'Error al registrarse',
      });
      throw error;
    }
  }

  // Sign in user
  async signInUser(email, password) {
    try {
      const userCredential = await handleNetworkOperation(
        async () => {
          return await signInWithEmailAndPassword(auth, email, password);
        },
        {
          context: 'Sign In',
          title: 'Error al iniciar sesión',
          checkConnection: true,
          showAlert: false, // Let calling code handle UI
        }
      );
      
      return userCredential.user;
    } catch (error) {
      handleError(error, {
        context: 'Sign In',
        showAlert: true,
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
      
      // Check if user signed in with Google or Apple and sign out (only if not in Expo Go)
      if (!isExpoGo) {
        const isGoogleSignedIn = await googleAuthService.isSignedIn();
        if (isGoogleSignedIn) {
          await googleAuthService.signOut();
        }
        
        const isAppleSignedIn = await appleAuthService.isSignedIn();
        if (isAppleSignedIn) {
          await appleAuthService.signOut();
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
          console.log('Profile picture does not exist or already deleted, continuing...');
        } else {
          console.warn('Failed to delete profile picture (non-critical):', error.message || error);
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
          console.warn('Failed to revoke Google token:', error);
        }

        try {
          const isAppleSignedIn = await appleAuthService.isSignedIn();
          if (isAppleSignedIn) {
            await appleAuthService.revokeToken();
          }
        } catch (error) {
          console.warn('Failed to revoke Apple token:', error);
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
      console.error('Error deleting account:', error);
      throw error;
    }
  }
}

export default new AuthService();