// Google Authentication Service for Wake Web Dashboard
import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { auth } from '../config/firebase';
import apiClient from '../utils/apiClient';

class GoogleAuthService {
  // Sign in with Google using Firebase Web SDK
  async signIn() {
    try {
      const provider = new GoogleAuthProvider();

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
      console.error('Google Sign-In error:', error);

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

      return {
        success: false,
        error: 'Error al iniciar sesión con Google. Por favor intenta de nuevo'
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
        provider: 'google',
        lastLoginAt: new Date().toISOString(),
      };

      await apiClient.patch('/creator/profile', profileData);

    } catch (error) {
      console.error('Error creating/updating user profile:', error);
      // Don't throw error - authentication was successful
    }
  }
}

export default new GoogleAuthService();
