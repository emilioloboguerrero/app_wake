import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('../config/firebase', () => ({ firestore: {} }));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => 'coursesRef'),
  query: vi.fn((...args) => args),
  where: vi.fn((...args) => args),
  getDocs: vi.fn(),
}));
vi.mock('../services/firestoreService', () => ({
  getUser: vi.fn(),
}));

import { getAvailableCourses } from '../services/courseService';
import { getDocs } from 'firebase/firestore';
import { getUser } from '../services/firestoreService';

// Helper: build a mock Firestore doc
const makeDoc = (id, data) => ({ id, data: () => data });

// Helper: build a snapshot from an array of mock docs
const makeSnap = (docs) => ({ docs });

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── Admin role ───────────────────────────────────────────────────────────────

describe('getAvailableCourses — admin', () => {
  it('returns all courses regardless of status', async () => {
    getUser.mockResolvedValue({ role: 'admin' });
    const allDocs = [
      makeDoc('c1', { status: 'published', creator_id: 'u99', title: 'A' }),
      makeDoc('c2', { status: 'draft', creator_id: 'u99', title: 'B' }),
      makeDoc('c3', { status: 'publicado', creator_id: 'u98', title: 'C' }),
    ];
    getDocs.mockResolvedValue(makeSnap(allDocs));

    const result = await getAvailableCourses('admin-uid');
    expect(result).toHaveLength(3);
    expect(getDocs).toHaveBeenCalledTimes(1);
  });
});

// ─── Creator role ─────────────────────────────────────────────────────────────

describe('getAvailableCourses — creator', () => {
  it('returns published courses + own courses, deduplicated', async () => {
    getUser.mockResolvedValue({ role: 'creator' });

    const publishedDocs = [
      makeDoc('c1', { status: 'published', creator_id: 'other', title: 'Pub A' }),
      makeDoc('c2', { status: 'publicado', creator_id: 'creator-uid', title: 'Own+Pub B' }),
    ];
    const ownDocs = [
      makeDoc('c2', { status: 'publicado', creator_id: 'creator-uid', title: 'Own+Pub B' }),
      makeDoc('c3', { status: 'draft', creator_id: 'creator-uid', title: 'Own Draft C' }),
    ];

    getDocs
      .mockResolvedValueOnce(makeSnap(publishedDocs))  // published query
      .mockResolvedValueOnce(makeSnap(ownDocs));        // own query

    const result = await getAvailableCourses('creator-uid');

    // c1 (published by other), c2 (deduped), c3 (own draft) = 3 unique
    expect(result).toHaveLength(3);
    const ids = result.map(c => c.id);
    expect(ids).toContain('c1');
    expect(ids).toContain('c2');
    expect(ids).toContain('c3');
  });

  it('runs two parallel queries', async () => {
    getUser.mockResolvedValue({ role: 'creator' });
    getDocs.mockResolvedValue(makeSnap([]));

    await getAvailableCourses('creator-uid');
    expect(getDocs).toHaveBeenCalledTimes(2);
  });

  it('does not duplicate a course that appears in both query results', async () => {
    getUser.mockResolvedValue({ role: 'creator' });
    const sharedDoc = makeDoc('shared', { status: 'published', creator_id: 'creator-uid', title: 'Shared' });

    getDocs
      .mockResolvedValueOnce(makeSnap([sharedDoc]))
      .mockResolvedValueOnce(makeSnap([sharedDoc]));

    const result = await getAvailableCourses('creator-uid');
    expect(result).toHaveLength(1);
  });
});

// ─── User role ────────────────────────────────────────────────────────────────

describe('getAvailableCourses — user', () => {
  it('returns only published courses', async () => {
    getUser.mockResolvedValue({ role: 'user' });
    const docs = [
      makeDoc('c1', { status: 'published', creator_id: 'u99', title: 'Pub' }),
    ];
    getDocs.mockResolvedValue(makeSnap(docs));

    const result = await getAvailableCourses('user-uid');
    expect(result).toHaveLength(1);
    expect(getDocs).toHaveBeenCalledTimes(1);
  });

  it('defaults to user role when getUser returns no role', async () => {
    getUser.mockResolvedValue({});
    getDocs.mockResolvedValue(makeSnap([]));

    await getAvailableCourses('user-uid');
    expect(getDocs).toHaveBeenCalledTimes(1);
  });
});

// ─── Output shape ─────────────────────────────────────────────────────────────

describe('getAvailableCourses — output shape', () => {
  it('normalizes creatorName from creator_name field', async () => {
    getUser.mockResolvedValue({ role: 'user' });
    getDocs.mockResolvedValue(makeSnap([
      makeDoc('c1', { status: 'published', creator_name: 'Jane Doe', title: 'X' }),
    ]));

    const [course] = await getAvailableCourses('u1');
    expect(course.creatorName).toBe('Jane Doe');
  });

  it('falls back to "Unknown Creator" when no name fields present', async () => {
    getUser.mockResolvedValue({ role: 'user' });
    getDocs.mockResolvedValue(makeSnap([
      makeDoc('c1', { status: 'published', title: 'X' }),
    ]));

    const [course] = await getAvailableCourses('u1');
    expect(course.creatorName).toBe('Unknown Creator');
  });

  it('sorts newest first by created_at', async () => {
    getUser.mockResolvedValue({ role: 'user' });
    getDocs.mockResolvedValue(makeSnap([
      makeDoc('old', { status: 'published', created_at: new Date('2024-01-01') }),
      makeDoc('new', { status: 'published', created_at: new Date('2026-01-01') }),
    ]));

    const result = await getAvailableCourses('u1');
    expect(result[0].id).toBe('new');
    expect(result[1].id).toBe('old');
  });
});
