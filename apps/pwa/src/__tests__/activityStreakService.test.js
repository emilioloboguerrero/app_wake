import { vi, describe, it, expect } from 'vitest';

vi.mock('../config/firebase', () => ({ firestore: {} }));
vi.mock('firebase/firestore', () => ({
  doc: vi.fn(), getDoc: vi.fn(), getDocFromServer: vi.fn(),
  updateDoc: vi.fn(), onSnapshot: vi.fn(),
}));
vi.mock('react', () => ({
  useState: vi.fn(), useRef: vi.fn(), useEffect: vi.fn(),
}));
vi.mock('../utils/logger.js', () => ({
  default: { log: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import {
  computeStreakStateFromDates,
  calendarDaysBetween,
  toYYYYMMDD,
  getLocalDateString,
} from '../services/activityStreakService';

// ─── calendarDaysBetween ──────────────────────────────────────────────────────

describe('calendarDaysBetween', () => {
  it('returns 0 for the same day', () => {
    expect(calendarDaysBetween('2026-03-10', '2026-03-10')).toBe(0);
  });

  it('returns 1 for adjacent days', () => {
    expect(calendarDaysBetween('2026-03-10', '2026-03-11')).toBe(1);
  });

  it('returns negative for reversed order', () => {
    expect(calendarDaysBetween('2026-03-11', '2026-03-10')).toBe(-1);
  });

  it('returns correct count across a month boundary', () => {
    expect(calendarDaysBetween('2026-01-28', '2026-02-03')).toBe(6);
  });

  it('returns 365 for exactly one non-leap year', () => {
    expect(calendarDaysBetween('2026-03-10', '2027-03-10')).toBe(365);
  });
});

// ─── toYYYYMMDD ───────────────────────────────────────────────────────────────

describe('toYYYYMMDD', () => {
  it('passes through a valid YYYY-MM-DD string unchanged', () => {
    expect(toYYYYMMDD('2026-03-10')).toBe('2026-03-10');
  });

  it('converts a Date object to YYYY-MM-DD', () => {
    const d = new Date('2026-03-10T12:00:00');
    expect(toYYYYMMDD(d)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('converts a Firestore-like Timestamp (toDate method)', () => {
    const ts = { toDate: () => new Date('2026-03-10T00:00:00Z') };
    expect(toYYYYMMDD(ts)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('converts a Firestore-like Timestamp (toMillis method)', () => {
    const ts = { toMillis: () => new Date('2026-03-10T12:00:00Z').getTime() };
    expect(toYYYYMMDD(ts)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('returns null for null', () => {
    expect(toYYYYMMDD(null)).toBeNull();
  });

  it('returns null for undefined', () => {
    expect(toYYYYMMDD(undefined)).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(toYYYYMMDD('')).toBeNull();
  });

  it('returns null for an invalid date string', () => {
    expect(toYYYYMMDD('not-a-date')).toBeNull();
  });
});

// ─── computeStreakStateFromDates ──────────────────────────────────────────────

describe('computeStreakStateFromDates', () => {
  const TODAY = '2026-03-12';

  it('returns zero state when lastActivityDate is null', () => {
    expect(computeStreakStateFromDates('2026-03-10', null, TODAY))
      .toEqual({ streakNumber: 0, flameLevel: 0 });
  });

  it('returns zero state when streakStartDate is null', () => {
    expect(computeStreakStateFromDates(null, '2026-03-10', TODAY))
      .toEqual({ streakNumber: 0, flameLevel: 0 });
  });

  it('returns zero state when both dates are null', () => {
    expect(computeStreakStateFromDates(null, null, TODAY))
      .toEqual({ streakNumber: 0, flameLevel: 0 });
  });

  it('streak is alive when last activity was today (0 days ago)', () => {
    const result = computeStreakStateFromDates('2026-03-10', TODAY, TODAY);
    expect(result.streakNumber).toBeGreaterThan(0);
    expect(result.flameLevel).toBe(3);
  });

  it('streak is alive when last activity was yesterday (1 day ago)', () => {
    const result = computeStreakStateFromDates('2026-03-10', '2026-03-11', TODAY);
    expect(result.streakNumber).toBeGreaterThan(0);
    expect(result.flameLevel).toBe(3);
  });

  it('flameLevel drops to 2 when last activity was 2 days ago', () => {
    const result = computeStreakStateFromDates('2026-03-08', '2026-03-10', TODAY);
    expect(result.flameLevel).toBe(2);
  });

  it('flameLevel drops to 1 when last activity was 3 days ago', () => {
    const result = computeStreakStateFromDates('2026-03-07', '2026-03-09', TODAY);
    expect(result.flameLevel).toBe(1);
  });

  it('streak dies (returns zero) when last activity was 4 days ago', () => {
    const result = computeStreakStateFromDates('2026-03-01', '2026-03-08', TODAY);
    expect(result).toEqual({ streakNumber: 0, flameLevel: 0 });
  });

  it('streak dies when last activity was more than 4 days ago', () => {
    const result = computeStreakStateFromDates('2026-02-01', '2026-03-01', TODAY);
    expect(result).toEqual({ streakNumber: 0, flameLevel: 0 });
  });

  it('calculates streakNumber as days from start to today inclusive', () => {
    // start 2026-03-10, today 2026-03-12 → 2 days between + 1 = 3
    const result = computeStreakStateFromDates('2026-03-10', TODAY, TODAY);
    expect(result.streakNumber).toBe(3);
  });

  it('streakNumber is 1 when streak started today', () => {
    const result = computeStreakStateFromDates(TODAY, TODAY, TODAY);
    expect(result.streakNumber).toBe(1);
  });

  it('flameLevel is at least 1 even on the last alive day (3 days since last)', () => {
    const result = computeStreakStateFromDates('2026-03-07', '2026-03-09', TODAY);
    expect(result.flameLevel).toBeGreaterThanOrEqual(1);
  });
});
