import { get, set, del } from 'idb-keyval';
import { persistQueryClient } from '@tanstack/react-query-persist-client';

const IDB_KEY = 'wake-react-query-cache';
const MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

// apiService._wrapTimestamp attaches toDate/toMillis closures to cached
// subscription/timestamp objects. IndexedDB's structured clone rejects
// functions ("The object can not be cloned."), poisoning the whole cache
// on every persist tick. JSON round-trip strips closures; callers that
// check `typeof x.toDate === 'function'` fall through safely.
const idbPersister = {
  persistClient: async (client) => {
    await set(IDB_KEY, JSON.parse(JSON.stringify(client)));
  },
  restoreClient: async () => {
    return await get(IDB_KEY);
  },
  removeClient: async () => {
    await del(IDB_KEY);
  },
};

export function initQueryPersistence(queryClient) {
  return persistQueryClient({
    queryClient,
    persister: idbPersister,
    maxAge: MAX_AGE_MS,
    buster: 'api-migration-v8-idb-clone-fix',
  });
}
