import { describe, it, expect, vi, beforeEach } from 'vitest';

const store = new Map();
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    setItem: vi.fn(async (k, v) => { store.set(k, v); }),
    getItem: vi.fn(async (k) => store.get(k) ?? null),
    removeItem: vi.fn(async (k) => { store.delete(k); }),
  },
}));

import { asyncStoragePersister, persistOptions } from '../config/queryPersistence';

describe('native query persistence', () => {
  beforeEach(() => store.clear());

  it('round-trips a client and strips function props (parity with web JSON round-trip)', async () => {
    const client = {
      clientState: { queries: [{ data: { toDate: () => 1, amount: 19000 } }] },
    };
    await asyncStoragePersister.persistClient(client);
    const restored = await asyncStoragePersister.restoreClient();
    expect(restored.clientState.queries[0].data.amount).toBe(19000);
    expect(restored.clientState.queries[0].data.toDate).toBeUndefined();
  });

  it('returns undefined when nothing persisted', async () => {
    expect(await asyncStoragePersister.restoreClient()).toBeUndefined();
  });

  it('removeClient clears the stored cache', async () => {
    await asyncStoragePersister.persistClient({ a: 1 });
    await asyncStoragePersister.removeClient();
    expect(await asyncStoragePersister.restoreClient()).toBeUndefined();
  });

  it('exposes persistOptions with the shared buster', () => {
    expect(persistOptions.buster).toBe('api-migration-v8-idb-clone-fix');
    expect(persistOptions.maxAge).toBe(24 * 60 * 60 * 1000);
  });
});
