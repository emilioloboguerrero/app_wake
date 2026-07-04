import { describe, it, expect } from 'vitest';
import {
  isCourseEntryActive,
  userOwnsCourse,
  ACCESS_EXPIRY_GRACE_MS,
} from '../utils/courseAccess';

const DAY = 24 * 60 * 60 * 1000;
const now = Date.now();
const iso = (ms) => new Date(ms).toISOString();

const future = iso(now + 30 * DAY);
const justPassed = iso(now - 1 * DAY); // within the 3-day grace
const graceEdgeInside = iso(now - (ACCESS_EXPIRY_GRACE_MS - DAY)); // still inside grace
const beyondGrace = iso(now - (ACCESS_EXPIRY_GRACE_MS + DAY)); // past grace

describe('isCourseEntryActive', () => {
  it('null / undefined entry has no access', () => {
    expect(isCourseEntryActive(null)).toBe(false);
    expect(isCourseEntryActive(undefined)).toBe(false);
  });

  it('active subscription with a future expires_at is active', () => {
    expect(isCourseEntryActive({ status: 'active', expires_at: future })).toBe(true);
  });

  it('active subscription whose expires_at just passed stays active within the 3-day grace', () => {
    // Regression: MercadoPago retries a failed charge for ~3 days; the server
    // grants the same grace, so the client must not lock the user out early.
    expect(isCourseEntryActive({ status: 'active', expires_at: justPassed })).toBe(true);
    expect(isCourseEntryActive({ status: 'active', expires_at: graceEdgeInside })).toBe(true);
  });

  it('active subscription past the grace window is not active', () => {
    expect(isCourseEntryActive({ status: 'active', expires_at: beyondGrace })).toBe(false);
  });

  it('active one_on_one entry without expires_at is active (never expires here)', () => {
    // one_on_one / fixed courses carry no expires_at; the server grants them by
    // mere entry presence, so the client must stay lenient here.
    expect(isCourseEntryActive({ status: 'active' })).toBe(true);
  });

  it('cancelled entry with a future expires_at is not active', () => {
    expect(isCourseEntryActive({ status: 'cancelled', expires_at: future })).toBe(false);
  });

  it('expired entry is not active', () => {
    expect(isCourseEntryActive({ status: 'expired', expires_at: beyondGrace })).toBe(false);
  });

  it('trial with a future expires_at is active', () => {
    expect(isCourseEntryActive({ is_trial: true, expires_at: future })).toBe(true);
  });

  it('lapsed trial past the grace is not active', () => {
    expect(isCourseEntryActive({ is_trial: true, status: 'active', expires_at: beyondGrace })).toBe(false);
  });

  it('parses a Firestore Timestamp-shaped expires_at (defensive)', () => {
    const tsFuture = { toMillis: () => now + 30 * DAY };
    const tsPast = { toMillis: () => now - (ACCESS_EXPIRY_GRACE_MS + DAY) };
    expect(isCourseEntryActive({ status: 'active', expires_at: tsFuture })).toBe(true);
    expect(isCourseEntryActive({ status: 'active', expires_at: tsPast })).toBe(false);
  });
});

describe('userOwnsCourse', () => {
  it('true when the user has an active entry for the course', () => {
    const userData = { courses: { c1: { status: 'active', expires_at: future } } };
    expect(userOwnsCourse(userData, 'c1')).toBe(true);
  });
  it('false when the entry is missing or lapsed', () => {
    expect(userOwnsCourse({ courses: {} }, 'c1')).toBe(false);
    expect(userOwnsCourse({ courses: { c1: { status: 'active', expires_at: beyondGrace } } }, 'c1')).toBe(false);
    expect(userOwnsCourse(null, 'c1')).toBe(false);
  });
});
