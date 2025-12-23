// Google Authentication Service for Wake
// Expo-compatible Google Sign-In with Firebase Web SDK
import { GoogleAuthProvider, signInWithCredential } from 'firebase/auth';
import { auth } from '../config/firebase';
import firestoreService from './firestoreService';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import logger from '../utils/logger';

// Check if running in Expo Go
const isExpoGo = Constants.appOwnership === 'expo';

// Dynamic import for Google Sign-In (only loaded when needed)
let GoogleSignin = null;

class GoogleAuthService {
  constructor() {
    // Google Sign-In will be loaded dynamically when needed
    logger.log('GoogleAuthService initialized');
    if (isExpoGo) {
      logger.log('Google Sign-In disabled in Expo Go - will work in production builds');
    }
  }

  // Dynamically load Google Sign-In module
  async loadGoogleSignIn() {
    if (GoogleSignin) {
      return GoogleSignin; // Already loaded
    }

    if (isExpoGo) {
      throw new Error('Google Sign-In not available in Expo Go');
    }

    try {
      const googleSignInModule = await import('@react-native-google-signin/google-signin');
      GoogleSignin = googleSignInModule.GoogleSignin;
      
      // Configure Google Sign-In
      const webClientId = Constants.expoConfig?.extra?.googleSignIn?.webClientId || '781583050959-ces3e6tuur06ke28bgfrmu8h0iuhine3.apps.googleusercontent.com';
      
      GoogleSignin.configure({
        webClientId: webClientId,
      });
      
      logger.log('Google Sign-In loaded and configured successfully');
      logger.log('Web Client ID:', webClientId);
      
      return GoogleSignin;
    } catch (error) {
      logger.error('Error loading Google Sign-In module:', error);
      
      // Handle the case where native module isn't available (e.g., Expo Go)
      if (isExpoGo || 
          error.message?.includes('RNGoogleSignin') || 
          error.message?.includes('TurboModuleRegistry') ||
          error.message?.includes('could not be found')) {
        throw new Error('Google Sign-In not available in Expo Go');
      }
      
      throw error;
    }
  }

  // Sign in with Google using React Native Google Sign-In
  async signIn() {
    // Check if running in Expo Go
    if (isExpoGo) {
      return {
        success: false,
        error: 'Google Sign-In no está disponible en Expo Go. Usa email/contraseña o construye la app para probar Google Sign-In.'
      };
    }

    try {
      logger.log('Google Sign-In initiated');
      
      // Dynamically load Google Sign-In module
      const GoogleSigninModule = await this.loadGoogleSignIn();
      
      // Check if your device supports Google Play
      await GoogleSigninModule.hasPlayServices({ showPlayServicesUpdateDialog: true });
      
      // Get the users ID token
      const signInResult = await GoogleSigninModule.signIn();
      
      // Try the new style of google-sign in result, from v13+ of that module
      let idToken = signInResult.data?.idToken;
      if (!idToken) {
        // if you are using older versions of google-signin, try old style result
        idToken = signInResult.idToken;
      }
      if (!idToken) {
        throw new Error('No ID token found');
      }

      logger.log('ID token received, signing in to Firebase...');
      
      // Create a Google credential with the token
      const googleCredential = GoogleAuthProvider.credential(idToken);

      // Sign-in the user with the credential
      const userCredential = await signInWithCredential(auth, googleCredential);
      const firebaseUser = userCredential.user;
      
      logger.log('Google sign-in successful:', firebaseUser.uid);
      
      // Check if user exists in Firestore before allowing access
      const existingUser = await firestoreService.getUser(firebaseUser.uid);
      
      if (!existingUser) {
        // User doesn't exist - sign them out and show message
        await auth.signOut();
        logger.log('New user attempted sign-in, redirecting to website');
        return {
          success: false,
          error: 'REGISTRATION_REQUIRED',
          message: 'No encontramos una cuenta asociada con este correo de Google. Si ya tienes una cuenta, asegúrate de usar el mismo correo electrónico con el que te registraste.'
        };
      }
      
      // User exists - update user document in Firestore
      await this.createOrUpdateUserDocument(firebaseUser);
      
      return { 
        success: true, 
        user: firebaseUser
      };
      
    } catch (error) {
      logger.error('Google Sign-In error:', error);
      
      // Handle specific error cases
      if (error.code === 'auth/account-exists-with-different-credential') {
        return { 
          success: false, 
          error: 'Ya existe una cuenta con este correo electrónico usando otro método de inicio de sesión' 
        };
      }
      
      if (error.code === 'auth/invalid-credential') {
        return { 
          success: false, 
          error: 'Credenciales inválidas. Por favor intenta de nuevo' 
        };
      }
      
      if (error.code === 'auth/user-disabled') {
        return { 
          success: false, 
          error: 'Esta cuenta ha sido deshabilitada' 
        };
      }
      
      if (error.code === 'SIGN_IN_CANCELLED') {
        return { 
          success: false, 
          error: 'Inicio de sesión cancelado' 
        };
      }
      
      if (error.code === 'IN_PROGRESS') {
        return { 
          success: false, 
          error: 'Ya hay un inicio de sesión en progreso' 
        };
      }
      
      if (error.code === 'PLAY_SERVICES_NOT_AVAILABLE') {
        return { 
          success: false, 
          error: 'Google Play Services no está disponible' 
        };
      }
      
      return { 
        success: false, 
        error: 'Error al iniciar sesión con Google. Por favor intenta de nuevo' 
      };
    }
  }

  // Sign out from Google and Firebase
  async signOut() {
    try {
      logger.log('Signing out from Google and Firebase...');
      
      // Only sign out from Google if not in Expo Go
      if (!isExpoGo) {
        const GoogleSigninModule = await this.loadGoogleSignIn();
        await GoogleSigninModule.signOut();
      }
      
      logger.log('Sign out successful');
      return { success: true };
      
    } catch (error) {
      logger.error('Sign out error:', error);
      return { 
        success: false, 
        error: 'Error al cerrar sesión' 
      };
    }
  }

  // Check if user is signed in
  async isSignedIn() {
    try {
      if (isExpoGo) {
        return false;
      }
      
      const GoogleSigninModule = await this.loadGoogleSignIn();
      // isSignedIn was removed in v16; use hasPreviousSignIn + getCurrentUser
      const hasSession = await GoogleSigninModule.hasPreviousSignIn();
      if (!hasSession) {
        return false;
      }
      const currentUser = await GoogleSigninModule.getCurrentUser();
      return Boolean(currentUser);
    } catch (error) {
      logger.error('Error checking sign-in status:', error);
      return false;
    }
  }

  // Get current user
  async getCurrentUser() {
    try {
      if (isExpoGo) {
        return null;
      }
      
      const GoogleSigninModule = await this.loadGoogleSignIn();
      const user = await GoogleSigninModule.getCurrentUser();
      return user;
    } catch (error) {
      logger.error('Error getting current user:', error);
      return null;
    }
  }

  // Update user document in Firestore (only for existing users)
  async createOrUpdateUserDocument(firebaseUser) {
    try {
      // Prepare user data from Firebase
      const userData = {
        email: firebaseUser.email,
        displayName: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'Usuario',
        photoURL: firebaseUser.photoURL,
        provider: 'google',
        lastLoginAt: new Date(),
      };

      // Check if user already exists in Firestore
      const existingUser = await firestoreService.getUser(firebaseUser.uid);
      
      if (existingUser) {
        // User exists - update login time and provider info
        await firestoreService.updateUser(firebaseUser.uid, {
          ...userData,
          onboardingCompleted: existingUser.onboardingCompleted, // Preserve onboarding status
        });
        logger.log('Updated existing user document');
      } else {
        // This should not happen as we check before calling this function
        // But if it does, log a warning
        logger.warn('Attempted to update user document for non-existent user');
      }
      
    } catch (error) {
      logger.error('Error updating user document:', error);
      // Don't throw error - authentication was successful
      // User document update can be retried later
    }
  }
}

export default new GoogleAuthService();