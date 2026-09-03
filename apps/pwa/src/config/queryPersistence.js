import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'wake-react-query-cache';
const MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours — parity with queryPersistence.web.js
const BUSTER = 'api-migration-v8-idb-clone-fix';

// JSON round-trip mirrors the web persister: apiService._wrapTimestamp attaches
// toDate/toMillis closures to cached objects; serializing strips them so callers
// that check `typeof x.toDate === 'function'` fall through safely on restore.
export const asyncStoragePersister = {
  persistClient: async (client) => {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(client));
  },
  restoreClient: async () => {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : undefined;
  },
  removeClient: async () => {
    await AsyncStorage.removeItem(STORAGE_KEY);
  },
};

export const persistOptions = {
  persister: asyncStoragePersister,
  maxAge: MAX_AGE_MS,
  buster: BUSTER,
};
