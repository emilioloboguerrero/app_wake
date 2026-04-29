import AsyncStorage from '@react-native-async-storage/async-storage';

import logger from './logger.js';

// Audit M-07: previously the helper persisted { uid, email, displayName,
// photoURL, providerId, lastLogin } to AsyncStorage on sign-in. On web
// AsyncStorage falls back to localStorage, so any XSS could read the user's
// email. The save/get/has methods were no longer called from anywhere — only
// clearAuthState ran on sign-out, as a defensive cleanup. We keep that cleanup
// (so any legacy installs scrub the stored payload on next sign-out) and
// remove the writers entirely. Firebase Auth's own persistence already
// retains the session.
const AUTH_STORAGE_KEY = '@wake_app_auth_state';

export const authStorage = {
  async clearAuthState() {
    try {
      await AsyncStorage.removeItem(AUTH_STORAGE_KEY);
    } catch (error) {
      logger.error('Error clearing auth state:', error);
    }
  },
};

export default authStorage;






