import { vi, describe, it, expect } from 'vitest';

// Mock Firebase before any service imports resolve
vi.mock('../config/firebase', () => ({ firestore: {}, auth: {}, storage: {} }));
vi.mock('firebase/firestore', () => ({
  doc: vi.fn(), getDoc: vi.fn(), setDoc: vi.fn(), updateDoc: vi.fn(),
  collection: vi.fn(), getDocs: vi.fn(), addDoc: vi.fn(), deleteDoc: vi.fn(),
  query: vi.fn(), where: vi.fn(), orderBy: vi.fn(), limit: vi.fn(),
  serverTimestamp: vi.fn(() => new Date()), writeBatch: vi.fn(),
}));
vi.mock('firebase/auth', () => ({
  getAuth: vi.fn(), signInWithEmailAndPassword: vi.fn(),
  createUserWithEmailAndPassword: vi.fn(), signOut: vi.fn(),
  updateProfile: vi.fn(), sendPasswordResetEmail: vi.fn(),
}));

import purchaseService from '../services/purchaseService';

// Helpers
const future = () => new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString();
const past   = () => new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();

// ============ isCourseEntryActive ============

describe('isCourseEntryActive', () => {
  it('returns false for null', () => {
    expect(purchaseService.isCourseEntryActive(null)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(purchaseService.isCourseEntryActive(undefined)).toBe(false);
  });

  it('returns true for an active non-expired entry', () => {
    expect(purchaseService.isCourseEntryActive({
      status: 'active',
      expires_at: future(),
    })).toBe(true);
  });

  it('returns false when the entry is expired, even if status is active', () => {
    expect(purchaseService.isCourseEntryActive({
      status: 'active',
      expires_at: past(),
    })).toBe(false);
  });

  it('returns true when expires_at is null (lifetime access)', () => {
    expect(purchaseService.isCourseEntryActive({
      status: 'active',
      expires_at: null,
    })).toBe(true);
  });

  it('returns true when expires_at is missing entirely', () => {
    expect(purchaseService.isCourseEntryActive({ status: 'active' })).toBe(true);
  });

  it('returns true for an active trial that has not expired', () => {
    expect(purchaseService.isCourseEntryActive({
      status: 'active',
      is_trial: true,
      expires_at: future(),
    })).toBe(true);
  });

  it('returns false for an expired trial', () => {
    expect(purchaseService.isCourseEntryActive({
      status: 'active',
      is_trial: true,
      expires_at: past(),
    })).toBe(false);
  });

  it('returns true when is_trial is true even if status is not active', () => {
    // Trial flag alone grants access (as long as not expired)
    expect(purchaseService.isCourseEntryActive({
      status: 'pending',
      is_trial: true,
      expires_at: future(),
    })).toBe(true);
  });

  it('returns false for a cancelled entry that is not a trial', () => {
    expect(purchaseService.isCourseEntryActive({
      status: 'cancelled',
      is_trial: false,
      expires_at: future(),
    })).toBe(false);
  });

  it('returns false when expires_at is exactly now (boundary)', () => {
    // Exactly now → not strictly greater than new Date() → expired
    const justExpired = new Date(Date.now() - 1).toISOString();
    expect(purchaseService.isCourseEntryActive({
      status: 'active',
      expires_at: justExpired,
    })).toBe(false);
  });
});
