import AsyncStorage from '@react-native-async-storage/async-storage';

import logger from './logger.js';
const AUTH_STORAGE_KEY = '@wake_app_auth_state';

export const authStorage = {
  // Save auth state
  async saveAuthState(user) {
    try {
      const authData = {
        uid: user.uid,
        email: user.email,
        displayName: user.displayName,
        photoURL: user.photoURL,
        providerId: user.providerData[0]?.providerId || 'password',
        lastLogin: new Date().toISOString(),
      };
      await AsyncStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(authData));
    } catch (error) {
      logger.error('Error saving auth state:', error);
    }
  },

  // Get saved auth state
  async getAuthState() {
    try {
      const authData = await AsyncStorage.getItem(AUTH_STORAGE_KEY);
      if (authData) {
        return JSON.parse(authData);
      }
      return null;
    } catch (error) {
      logger.error('Error retrieving auth state:', error);
      return null;
    }
  },

  // Clear auth state
  async clearAuthState() {
    try {
      await AsyncStorage.removeItem(AUTH_STORAGE_KEY);
    } catch (error) {
      logger.error('Error clearing auth state:', error);
    }
  },

  // Check if auth state exists
  async hasAuthState() {
    try {
      const authData = await AsyncStorage.getItem(AUTH_STORAGE_KEY);
      return authData !== null;
    } catch (error) {
      logger.error('Error checking auth state:', error);
      return false;
    }
  }
};

export default authStorage;






