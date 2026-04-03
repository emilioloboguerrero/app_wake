import { get, set, del } from 'idb-keyval';
import { persistQueryClient } from '@tanstack/react-query-persist-client';

const IDB_KEY = 'wake-react-query-cache';
const MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

const idbPersister = {
  persistClient: async (client) => {
    await set(IDB_KEY, client);
  },
  restoreClient: async () => {
    return await get(IDB_KEY);
  },
  removeClient: async () => {
    await del(IDB_KEY);
  },
};

/**
 * Initializes IndexedDB persistence for the React Query cache.
 * Call once on web after queryClient is created.
 * Returns the unsubscribe function.
 */
export function initQueryPersistence(queryClient) {
  return persistQueryClient({
    queryClient,
    persister: idbPersister,
    maxAge: MAX_AGE_MS,
    buster: 'api-migration-v4', // bumped: sessions orderBy fix + 1RM history shape fix
  });
}
