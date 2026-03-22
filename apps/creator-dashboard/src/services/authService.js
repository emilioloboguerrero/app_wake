import { auth } from '../config/firebase';
import apiClient from '../utils/apiClient';
import logger from '../utils/logger';
import { queryClient } from '../config/queryClient';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  sendPasswordResetEmail
} from 'firebase/auth';
class AuthService {
  async registerUser(email, password, displayName) {
    const userCredential = await createUserWithEmailAndPassword(auth, email.trim(), password);
    const user = userCredential.user;

    const initialDisplayName = (displayName || '').trim() || email.trim().split('@')[0];
    await updateProfile(user, { displayName: initialDisplayName });
    await user.reload();

    return user;
  }

  async signInUser(email, password) {
    const userCredential = await signInWithEmailAndPassword(auth, email.trim(), password);
    const user = userCredential.user;
    logger.debug('[AuthService] Firebase sign-in successful for:', user.uid);

    // Sync displayName from API if Firebase Auth profile is missing it
    if (!user.displayName) {
      try {
        const { data } = await apiClient.get('/users/me');
        const fallbackName = data?.displayName || email.trim().split('@')[0];
        await updateProfile(user, { displayName: fallbackName });
        await user.reload();
      } catch (syncError) {
        logger.warn('[AuthService] Failed to sync displayName (non-fatal):', syncError?.message || syncError);
      }
    }

    return user;
  }

  async signOutUser() {
    try {
      await apiClient.post('/auth/logout', {});
    } catch (logoutErr) {
      logger.warn('Server-side logout failed (non-fatal):', logoutErr?.message);
    }
    await signOut(auth);
    queryClient.clear();
  }

  getCurrentUser() {
    return auth.currentUser;
  }

  async resetPassword(email) {
    await sendPasswordResetEmail(auth, email.trim());
  }
}

export default new AuthService();
