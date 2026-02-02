// Storage Adapter - Platform-agnostic storage interface
// Uses webStorageService on web, AsyncStorage on native
// This allows all mobile app services to work on web without modification

import { isWeb } from './platform';

let storage = null;

if (isWeb) {
  // Web: Use webStorageService (IndexedDB)
  const webStorageService = require('../services/webStorageService').default;
  storage = {
    getItem: async (key) => {
      try {
        await webStorageService.init();
        return await webStorageService.getItem(key);
      } catch (error) {
        logger.error('[STORAGE] Error getting item:', error);
        return null;
      }
    },
    setItem: async (key, value) => {
      try {
        await webStorageService.init();
        return await webStorageService.setItem(key, value);
      } catch (error) {
        logger.error('[STORAGE] Error setting item:', error);
        throw error;
      }
    },
    removeItem: async (key) => {
      try {
        await webStorageService.init();
        return await webStorageService.removeItem(key);
      } catch (error) {
        logger.error('[STORAGE] Error removing item:', error);
        throw error;
      }
    },
    multiGet: async (keys) => {
      try {
        await webStorageService.init();
        const results = await Promise.all(
          keys.map(async (key) => [key, await webStorageService.getItem(key)])
        );
        return results;
      } catch (error) {
        logger.error('[STORAGE] Error in multiGet:', error);
        return keys.map(key => [key, null]);
      }
    },
    multiSet: async (keyValuePairs) => {
      try {
        await webStorageService.init();
        await Promise.all(
          keyValuePairs.map(([key, value]) => webStorageService.setItem(key, value))
        );
      } catch (error) {
        logger.error('[STORAGE] Error in multiSet:', error);
        throw error;
      }
    },
    multiRemove: async (keys) => {
      try {
        await webStorageService.init();
        await Promise.all(
          keys.map(key => webStorageService.removeItem(key))
        );
      } catch (error) {
        logger.error('[STORAGE] Error in multiRemove:', error);
        throw error;
      }
    },
    clear: async () => {
      try {
        await webStorageService.init();
        return await webStorageService.clear();
      } catch (error) {
        logger.error('[STORAGE] Error clearing:', error);
        throw error;
      }
    },
    getAllKeys: async () => {
      try {
        await webStorageService.init();
        return await webStorageService.getAllKeys();
      } catch (error) {
        logger.error('[STORAGE] Error getting all keys:', error);
        return [];
      }
    }
  };
} else {
  // Native: Use AsyncStorage
  const AsyncStorage = require('@react-native-async-storage/async-storage').default;
  storage = AsyncStorage;
}

export default storage;

