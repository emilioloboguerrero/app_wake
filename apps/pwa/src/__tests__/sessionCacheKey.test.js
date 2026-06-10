import { describe, it, expect, vi } from 'vitest';

// Mock the Firebase-dependent modules before importing sessionService
vi.mock('../config/firebase', () => ({ auth: {}, appCheck: {} }));
vi.mock('../config/queryClient', () => ({ queryClient: { invalidateQueries: vi.fn() } }));
vi.mock('../services/sessionManager', () => ({ default: {} }));
vi.mock('../services/oneRepMaxService', () => ({ default: { parseIntensity: vi.fn() } }));
vi.mock('../services/exerciseHistoryService', () => ({ default: {} }));
vi.mock('../services/analyticsService', () => ({ default: { track: vi.fn() } }));
vi.mock('../utils/offlineQueue', () => ({ enqueue: vi.fn() }));

import { buildSessionCacheKey } from '../services/sessionService';

// ─── buildSessionCacheKey ─────────────────────────────────────────────────────

describe('buildSessionCacheKey', () => {
  it('produces a deterministic key for a given set of params', () => {
    const key = buildSessionCacheKey({ userId: 'u1', courseId: 'c1', targetDate: '2026-06-10', level: 'principiante' });
    expect(key).toBe('u1|c1|2026-06-10|principiante');
  });

  it('keys differ when level differs (principiante vs avanzado)', () => {
    const k1 = buildSessionCacheKey({ userId: 'u1', courseId: 'c1', level: 'principiante' });
    const k2 = buildSessionCacheKey({ userId: 'u1', courseId: 'c1', level: 'avanzado' });
    expect(k1).not.toBe(k2);
  });

  it('switching level forces a refetch by producing a different cache key', () => {
    const before = buildSessionCacheKey({ userId: 'u1', courseId: 'c1', targetDate: '2026-06-10', level: 'principiante' });
    const after = buildSessionCacheKey({ userId: 'u1', courseId: 'c1', targetDate: '2026-06-10', level: 'avanzado' });
    expect(before).not.toBe(after);
  });

  it('omitting level produces the same key as level undefined', () => {
    const k1 = buildSessionCacheKey({ userId: 'u1', courseId: 'c1' });
    const k2 = buildSessionCacheKey({ userId: 'u1', courseId: 'c1', level: undefined });
    expect(k1).toBe(k2);
  });

  it('omitting targetDate and level falls back to empty segments', () => {
    const key = buildSessionCacheKey({ userId: 'u1', courseId: 'c1' });
    expect(key).toBe('u1|c1||');
  });

  it('includes targetDate when provided', () => {
    const key = buildSessionCacheKey({ userId: 'u1', courseId: 'c1', targetDate: '2026-06-10' });
    expect(key).toBe('u1|c1|2026-06-10|');
  });
});
