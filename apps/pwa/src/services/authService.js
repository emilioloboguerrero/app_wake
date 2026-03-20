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
} from 'firebase/auth';
import { authStorage } from '../utils/authStorage';
import profilePictureService from './profilePictureService';
import sessionManager from './sessionManager';
import googleAuthService from './googleAuthService';
import { handleError } from '../utils/errorHandler';
import Constants from 'expo-constants';
import logger from '../utils/logger';
import apiClient from '../utils/apiClient';
import { queryClient } from '../config/queryClient';

// Check if running in Expo Go (executionEnvironment === 'storeClient' is the SDK 54+ replacement for appOwnership === 'expo')
const isExpoGo = Constants.executionEnvironment === 'storeClient';

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
    try {
      // Add timeout to prevent hanging (30 seconds)
      const signInPromise = signInWithEmailAndPassword(auth, email, password);
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Sign in timeout - please try again')), 30000)
      );
      
      const userCredential = await Promise.race([signInPromise, timeoutPromise]);

      // Wait a bit longer to ensure Firebase auth state propagates and onAuthStateChanged fires
      // This helps AuthContext's onAuthStateChanged listener fire before we return
      await new Promise(resolve => setTimeout(resolve, 150));
      
      const finalUser = auth.currentUser || userCredential.user;

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

      // Revoke server-side refresh tokens before signing out locally
      try {
        await apiClient.post('/auth/logout', {});
      } catch (logoutErr) {
        logger.warn('[AUTH] Server-side logout failed (non-fatal):', logoutErr?.message);
      }

      // Check if user signed in with Google and sign out (only if not in Expo Go)
      if (!isExpoGo) {
        const isGoogleSignedIn = await googleAuthService.isSignedIn();
        if (isGoogleSignedIn) {
          await googleAuthService.signOut();
        }
      }

      // Sign out from Firebase
      await signOut(auth);
      queryClient.clear();

      // Clear auth state
      await authStorage.clearAuthState();
      
      // Clear all user-specific caches
      if (userId) {
        await Promise.all([
          profilePictureService.clearUserCache(userId),
          sessionManager.clearUserCache(userId)
        ]);
      }
      
    } catch (error) {
      logger.error('[AUTH] signOutUser error:', error);
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
      const apiService = (await import('./apiService')).default;
      
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
          // Profile picture does not exist or already deleted
        } else {
          logger.warn('Failed to delete profile picture (non-critical):', error.message || error);
        }
      }

      // Delete all user data from Firestore (except purchases as per requirements)
      await apiService.deleteAllUserData(userId);

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