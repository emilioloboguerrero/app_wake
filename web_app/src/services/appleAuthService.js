// Apple Authentication Service for Wake Web Dashboard
// Note: Apple Sign-In on web is less common than on iOS, but available
import { OAuthProvider, signInWithPopup } from 'firebase/auth';
import { auth } from '../config/firebase';
import { createUserDocument } from './firestoreService';
import { getUser, updateUser } from './firestoreService';

class AppleAuthService {
  // Sign in with Apple using Firebase Web SDK
  async signIn() {
    try {
      const provider = new OAuthProvider('apple.com');
      
      // Add scopes if needed
      provider.addScope('email');
      provider.addScope('name');
      
      // Sign in with popup
      const result = await signInWithPopup(auth, provider);
      const firebaseUser = result.user;
      
      // Create or update user document in Firestore
      await this.createOrUpdateUserDocument(firebaseUser);
      
      return { 
        success: true, 
        user: firebaseUser
      };
      
    } catch (error) {
      console.error('Apple Sign-In error:', error);
      
      // Handle specific error cases
      if (error.code === 'auth/account-exists-with-different-credential') {
        return { 
          success: false, 
          error: 'Ya existe una cuenta con este correo electrónico usando otro método de inicio de sesión' 
        };
      }
      
      if (error.code === 'auth/popup-closed-by-user') {
        return { 
          success: false, 
          error: 'Inicio de sesión cancelado' 
        };
      }
      
      if (error.code === 'auth/popup-blocked') {
        return { 
          success: false, 
          error: 'El popup fue bloqueado. Por favor permite popups para este sitio' 
        };
      }
      
      if (error.code === 'auth/operation-not-allowed') {
        return { 
          success: false, 
          error: 'Apple Sign-In no está habilitado. Contacta al administrador.' 
        };
      }
      
      return { 
        success: false, 
        error: 'Error al iniciar sesión con Apple. Por favor intenta de nuevo' 
      };
    }
  }

  // Create or update user document in Firestore
  async createOrUpdateUserDocument(firebaseUser) {
    try {
      const userData = {
        email: firebaseUser.email,
        displayName: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'Usuario',
        photoURL: firebaseUser.photoURL,
        provider: 'apple',
        lastLoginAt: new Date(),
      };

      // Check if user already exists in Firestore
      const existingUser = await getUser(firebaseUser.uid);
      
      if (existingUser) {
        // User exists - update login time and provider info
        await updateUser(firebaseUser.uid, {
          ...userData,
          onboardingCompleted: existingUser.onboardingCompleted,
          webOnboardingCompleted: existingUser.webOnboardingCompleted ?? false, // Preserve web onboarding status
        });
      } else {
        // New user - create with onboarding required
        const newUserData = {
          ...userData,
          onboardingCompleted: false,
          profileCompleted: false,
          webOnboardingCompleted: false, // New users need to complete web onboarding
        };
        
        await createUserDocument(firebaseUser.uid, newUserData);
      }
      
    } catch (error) {
      console.error('Error creating/updating user document:', error);
    }
  }
}

export default new AppleAuthService();

