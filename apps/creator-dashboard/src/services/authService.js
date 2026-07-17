import { auth } from '../config/firebase';
import apiClient from '../utils/apiClient';
import logger from '../utils/logger';
import { queryClient } from '../config/queryClient';
import analyticsService from './analyticsService';
import {
  signOut,
  sendEmailVerification
} from 'firebase/auth';
class AuthService {
  async resendEmailVerification() {
    const current = auth.currentUser;
    if (!current) throw new Error('No hay sesión activa');
    await sendEmailVerification(current);
  }

  async reloadCurrentUser() {
    const current = auth.currentUser;
    if (!current) return null;
    await current.reload();
    return auth.currentUser;
  }

  async signOutUser() {
    try {
      await apiClient.post('/auth/logout', {});
    } catch (logoutErr) {
      logger.warn('Server-side logout failed (non-fatal):', logoutErr?.message);
    }
    try {
      analyticsService.track('auth.logout');
      analyticsService.reset();
    } catch {}
    await signOut(auth);
    queryClient.clear();
  }

  getCurrentUser() {
    return auth.currentUser;
  }
}

export default new AuthService();
