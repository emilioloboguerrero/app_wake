// Apple Authentication Service for Wake
// Expo-compatible Apple Sign-In with Firebase Web SDK
import { OAuthProvider, signInWithCredential, updateProfile } from 'firebase/auth';
import { auth } from '../config/firebase';
import firestoreService from './firestoreService';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import logger from '../utils/logger'; 
import * as Crypto from 'expo-crypto';

// Check if running in Expo Go
const isExpoGo = Constants.appOwnership === 'expo';

// Dynamic import for Apple Sign-In (only loaded when needed)
let appleAuth = null;
let AppleButton = null;

const NONCE_CHARSET = '0123456789ABCDEFGHIJKLMNOPQRSTUVXYZabcdefghijklmnopqrstuvwxyz-._';

async function generateSecureNonce(length = 32) {
  const randomBytes = await Crypto.getRandomBytesAsync(length);
  const chars = Array.from(randomBytes, (byte) => NONCE_CHARSET[byte % NONCE_CHARSET.length]);
  return chars.join('');
}

class AppleAuthService {
  constructor() {
    // Apple Sign-In will be loaded dynamically when needed
    logger.log('AppleAuthService initialized');
    if (isExpoGo) {
      logger.log('Apple Sign-In disabled in Expo Go - will work in production builds');
    }
  }

  // Dynamically load Apple Sign-In module
  async loadAppleSignIn() {
    if (appleAuth && AppleButton) {
      return { appleAuth, AppleButton }; // Already loaded
    }

    if (isExpoGo) {
      throw new Error('Apple Sign-In not available in Expo Go');
    }

    try {
      const appleSignInModule = await import('@invertase/react-native-apple-authentication');
      appleAuth = appleSignInModule.appleAuth;
      AppleButton = appleSignInModule.AppleButton;
      
      logger.log('Apple Sign-In loaded successfully');
      
      return { appleAuth, AppleButton };
    } catch (error) {
      logger.error('Error loading Apple Sign-In module:', error);
      
      // Handle the case where native module isn't available (e.g., Expo Go)
      if (isExpoGo || 
          error.message?.includes('RNCAppleAuthentication') || 
          error.message?.includes('TurboModuleRegistry') ||
          error.message?.includes('could not be found')) {
        throw new Error('Apple Sign-In not available in Expo Go');
      }
      
      throw error;
    }
  }

  // Sign in with Apple using React Native Apple Sign-In
  async signIn() {
    // Check if running in Expo Go
    if (isExpoGo) {
      return {
        success: false,
        error: 'Apple Sign-In no está disponible en Expo Go. Usa email/contraseña o construye la app para probar Apple Sign-In.'
      };
    }

    // Check if running on iOS
    if (Platform.OS !== 'ios') {
      return {
        success: false,
        error: 'Apple Sign-In solo está disponible en dispositivos iOS.'
      };
    }

    try {
      logger.log('Apple Sign-In initiated');
      
      // Generate secure nonce required by Firebase to mitigate replay attacks
      const rawNonce = await generateSecureNonce();
      
      // Hash the nonce using SHA256
      // expo-crypto's digestStringAsync returns hex by default, but we'll verify and convert if needed
      const hashResult = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        rawNonce
      );
      
      // Always convert to lowercase hex - handle both hex and base64 output
      let hashedNonce;
      if (/^[0-9a-fA-F]{64}$/.test(hashResult)) {
        // Already valid hex (64 chars), just lowercase
        hashedNonce = hashResult.toLowerCase();
      } else if (hashResult.length === 44 && (hashResult.includes('+') || hashResult.includes('/'))) {
        // It's base64 (44 chars for 32 bytes), convert to hex
        if (typeof Buffer !== 'undefined') {
          const decoded = Buffer.from(hashResult, 'base64');
          hashedNonce = Array.from(decoded)
            .map(b => b.toString(16).padStart(2, '0'))
            .join('')
            .toLowerCase();
        } else {
          // Manual base64 to hex conversion (fallback)
          const base64Chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
          let hex = '';
          for (let i = 0; i < hashResult.length; i += 4) {
            const enc1 = base64Chars.indexOf(hashResult[i] || '=');
            const enc2 = base64Chars.indexOf(hashResult[i + 1] || '=');
            const enc3 = base64Chars.indexOf(hashResult[i + 2] || '=');
            const enc4 = base64Chars.indexOf(hashResult[i + 3] || '=');
            const bitmap = (enc1 << 18) | (enc2 << 12) | (enc3 << 6) | enc4;
            hex += ((bitmap >> 16) & 255).toString(16).padStart(2, '0');
            if (enc3 !== 64) hex += ((bitmap >> 8) & 255).toString(16).padStart(2, '0');
            if (enc4 !== 64) hex += (bitmap & 255).toString(16).padStart(2, '0');
          }
          hashedNonce = hex.toLowerCase();
        }
      } else {
        // Unknown format - log and try to use as lowercase
        console.error('[Apple Auth] Unexpected hash format:', {
          length: hashResult.length,
          preview: hashResult.substring(0, 20),
          rawNonce: rawNonce
        });
        hashedNonce = hashResult.toLowerCase();
      }
      
      // Verify final hash format
      if (hashedNonce.length !== 64 || !/^[0-9a-f]{64}$/.test(hashedNonce)) {
        console.error('[Apple Auth] Invalid hash after conversion:', {
          length: hashedNonce.length,
          preview: hashedNonce.substring(0, 20),
          rawNonce: rawNonce
        });
        throw new Error(`Nonce hash is invalid: expected 64 hex chars, got ${hashedNonce.length}`);
      }
      
      // Debug log (using console to ensure it shows)
      console.log('[Apple Auth] Nonce hash computed:', {
        rawNonce: rawNonce,
        rawNonceLength: rawNonce.length,
        hashLength: hashedNonce.length,
        hashFull: hashedNonce,
        hashStart: hashedNonce.substring(0, 16),
        hashEnd: hashedNonce.substring(48)
      });
      
      // Dynamically load Apple Sign-In module
      const { appleAuth: appleAuthModule } = await this.loadAppleSignIn();
      
      // Start the sign-in request
      // IMPORTANT: @invertase/react-native-apple-authentication expects the RAW nonce
      // The library will hash it internally before sending to Apple
      // We compute the hash here only for verification/debugging
      const appleAuthRequestResponse = await appleAuthModule.performRequest({
        requestedOperation: appleAuthModule.Operation.LOGIN,
        // As per the FAQ of react-native-apple-authentication, the name should come first in the following array.
        // See: https://github.com/invertase/react-native-apple-authentication#faqs
        requestedScopes: [appleAuthModule.Scope.FULL_NAME, appleAuthModule.Scope.EMAIL],
        nonce: rawNonce, // Send RAW nonce - library hashes it internally
      });
      
      console.log('[Apple Auth] Sent raw nonce to Apple:', rawNonce);
      console.log('[Apple Auth] Expected hash (for verification):', hashedNonce.substring(0, 16) + '...');
      
      console.log('[Apple Auth] Apple request completed, received identity token');

      // Ensure Apple returned a user identityToken
      if (!appleAuthRequestResponse.identityToken) {
        throw new Error('Apple Sign-In failed - no identify token returned');
      }

      logger.log('Identity token received, signing in to Firebase...');
      
      // Create a Firebase credential from the response
      const { identityToken } = appleAuthRequestResponse;
      const appleProvider = new OAuthProvider('apple.com');
      const appleCredential = appleProvider.credential({
        idToken: identityToken,
        rawNonce: rawNonce
      });

      // Sign the user in with the credential
      const userCredential = await signInWithCredential(auth, appleCredential);
      const firebaseUser = userCredential.user;

      // Set displayName from Apple full name if provided (avoids re-prompting)
      if (!firebaseUser.displayName && appleAuthRequestResponse.fullName) {
        const givenName = appleAuthRequestResponse.fullName.givenName || '';
        const familyName = appleAuthRequestResponse.fullName.familyName || '';
        const fullName = `${givenName} ${familyName}`.trim();
        if (fullName) {
          try {
            await updateProfile(firebaseUser, { displayName: fullName });
            await firebaseUser.reload();
          } catch (profileError) {
            logger.warn('Failed to set Apple displayName:', profileError);
          }
        }
      }
      
      logger.log('Apple sign-in successful:', firebaseUser.uid);
      
      // Check if user exists in Firestore before allowing access
      const existingUser = await firestoreService.getUser(firebaseUser.uid);
      
      if (!existingUser) {
        // User doesn't exist - sign them out and show message
        await auth.signOut();
        logger.log('New user attempted sign-in');
        return {
          success: false,
          error: 'REGISTRATION_REQUIRED',
          message: 'No encontramos una cuenta asociada con este correo de Apple. Si ya tienes una cuenta, asegúrate de usar el mismo correo electrónico con el que te registraste.'
        };
      }
      
      // User exists - update user document in Firestore
      await this.createOrUpdateUserDocument(firebaseUser);
      
      return { 
        success: true, 
        user: firebaseUser
      };
      
    } catch (error) {
      logger.error('Apple Sign-In error:', error);
      
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
      
      if (error.code === '1001') {
        return { 
          success: false, 
          error: 'Inicio de sesión cancelado' 
        };
      }
      
      if (error.code === '1000') {
        return { 
          success: false, 
          error: 'Error de autorización de Apple' 
        };
      }
      
      return { 
        success: false, 
        error: 'Error al iniciar sesión con Apple. Por favor intenta de nuevo' 
      };
    }
  }

  // Sign out from Apple and Firebase
  async signOut() {
    try {
      logger.log('Signing out from Apple and Firebase...');
      
      // Apple Sign-In doesn't require explicit sign-out
      // The sign-out is handled by Firebase Auth
      
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
      if (isExpoGo || Platform.OS !== 'ios') {
        return false;
      }
      
      // Apple Sign-In doesn't maintain session state
      // We rely on Firebase auth state instead
      return false;
    } catch (error) {
      logger.error('Error checking sign-in status:', error);
      return false;
    }
  }

  // Get current user
  async getCurrentUser() {
    try {
      if (isExpoGo || Platform.OS !== 'ios') {
        return null;
      }
      
      // Apple Sign-In doesn't maintain user state
      // We rely on Firebase auth state instead
      return null;
    } catch (error) {
      logger.error('Error getting current user:', error);
      return null;
    }
  }

  // Revoke Apple Sign-In token (for account deletion)
  async revokeToken() {
    try {
      if (isExpoGo || Platform.OS !== 'ios') {
        return { success: false, error: 'Apple Sign-In not available' };
      }

      logger.log('Revoking Apple Sign-In token...');
      
      // Dynamically load Apple Sign-In module
      const { appleAuth: appleAuthModule } = await this.loadAppleSignIn();
      
      // Get an authorizationCode from Apple
      const { authorizationCode } = await appleAuthModule.performRequest({
        requestedOperation: appleAuthModule.Operation.REFRESH,
      });

      // Ensure Apple returned an authorizationCode
      if (!authorizationCode) {
        throw new Error('Apple Revocation failed - no authorizationCode returned');
      }

      // Revoke the token
      await appleAuthModule.revokeToken(auth, authorizationCode);
      
      logger.log('Apple Sign-In token revoked successfully');
      return { success: true };
      
    } catch (error) {
      logger.error('Error revoking Apple Sign-In token:', error);
      return { 
        success: false, 
        error: 'Error al revocar el token de Apple Sign-In' 
      };
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
        provider: 'apple',
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

  // Get Apple Button component (for UI)
  async getAppleButton() {
    try {
      if (isExpoGo || Platform.OS !== 'ios') {
        return null;
      }

      const { AppleButton } = await this.loadAppleSignIn();
      return AppleButton;
    } catch (error) {
      logger.error('Error getting Apple Button:', error);
      return null;
    }
  }
}

export default new AppleAuthService();
