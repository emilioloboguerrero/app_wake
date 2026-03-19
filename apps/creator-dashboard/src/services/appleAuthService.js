// Apple Authentication Service for Wake Web Dashboard
// Note: Apple Sign-In on web is less common than on iOS, but available
import { OAuthProvider, signInWithPopup } from 'firebase/auth';
import { auth } from '../config/firebase';
import apiClient from '../utils/apiClient';

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

      // Create or update user profile via API
      await this.createOrUpdateUserProfile(firebaseUser);

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

  // Create or update user profile via API
  async createOrUpdateUserProfile(firebaseUser) {
    try {
      const profileData = {
        email: firebaseUser.email,
        displayName: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'Usuario',
        photoURL: firebaseUser.photoURL,
        provider: 'apple',
        lastLoginAt: new Date().toISOString(),
      };

      await apiClient.patch('/profile', profileData);

    } catch (error) {
      console.error('Error creating/updating user profile:', error);
    }
  }
}

export default new AppleAuthService();
