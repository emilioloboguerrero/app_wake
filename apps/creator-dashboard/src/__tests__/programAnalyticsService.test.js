import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('../config/firebase', () => ({ firestore: {}, auth: {}, storage: {} }));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(), getDocs: vi.fn(), query: vi.fn(),
  where: vi.fn(), doc: vi.fn(), getDoc: vi.fn(), collectionGroup: vi.fn(),
}));

import programAnalyticsService from '../services/programAnalyticsService';

// ─── Shared fixtures ────────────────────────────────────────────────────────

const NOW = new Date('2026-03-12T12:00:00Z');
const FUTURE  = new Date(NOW.getTime() + 60 * 24 * 60 * 60 * 1000).toISOString();
const PAST    = new Date(NOW.getTime() - 60 * 24 * 60 * 60 * 1000).toISOString();
const RECENT  = new Date(NOW.getTime() -  5 * 24 * 60 * 60 * 1000).toISOString();

const makeUser = (overrides = {}) => ({
  userId: 'u1',
  userName: 'Test User',
  userEmail: 'test@example.com',
  userCity: null,
  userAge: null,
  userGender: null,
  onboardingData: null,
  courseData: { status: 'active', expires_at: FUTURE, purchased_at: RECENT },
  courseProgress: null,
  ...overrides,
});

// ─── getAgeBucket ────────────────────────────────────────────────────────────

describe('getAgeBucket', () => {
  it.each([
    [17,  null],
    [18,  '18-24'],
    [24,  '18-24'],
    [25,  '25-34'],
    [34,  '25-34'],
    [35,  '35-44'],
    [44,  '35-44'],
    [45,  '45-54'],
    [54,  '45-54'],
    [55,  '55-64'],
    [64,  '55-64'],
    [65,  '65+'],
    [100, '65+'],
  ])('age %d → bucket "%s"', (age, expected) => {
    expect(programAnalyticsService.getAgeBucket(age)).toBe(expected);
  });
});

// ─── calculateEnrollmentMetrics ──────────────────────────────────────────────

describe('calculateEnrollmentMetrics', () => {
  const activeUser   = makeUser({ userId: 'u1', courseData: { status: 'active',    expires_at: FUTURE, purchased_at: RECENT } });
  const expiredUser  = makeUser({ userId: 'u2', courseData: { status: 'active',    expires_at: PAST,   purchased_at: PAST   } });
  const trialUser    = makeUser({ userId: 'u3', courseData: { status: 'active',    expires_at: FUTURE, purchased_at: RECENT, is_trial: true } });
  const cancelledUser = makeUser({ userId: 'u4', courseData: { status: 'cancelled', expires_at: FUTURE, purchased_at: PAST } });

  it('counts total enrolled', () => {
    const result = programAnalyticsService.calculateEnrollmentMetrics([activeUser, expiredUser]);
    expect(result.totalEnrolled).toBe(2);
  });

  it('counts active enrollments (not expired, status active)', () => {
    const result = programAnalyticsService.calculateEnrollmentMetrics([activeUser, expiredUser]);
    expect(result.activeEnrollments).toBe(1);
  });

  it('counts trial users', () => {
    const result = programAnalyticsService.calculateEnrollmentMetrics([activeUser, trialUser]);
    expect(result.trialUsers).toBe(1);
  });

  it('counts expired enrollments', () => {
    const result = programAnalyticsService.calculateEnrollmentMetrics([activeUser, expiredUser]);
    expect(result.expiredEnrollments).toBe(1);
  });

  it('counts cancelled enrollments', () => {
    const result = programAnalyticsService.calculateEnrollmentMetrics([activeUser, cancelledUser]);
    expect(result.cancelledEnrollments).toBe(1);
  });

  it('counts recent enrollments (last 30 days)', () => {
    const result = programAnalyticsService.calculateEnrollmentMetrics([activeUser, expiredUser]);
    // activeUser purchased 5 days ago (RECENT), expiredUser purchased 60 days ago (PAST)
    expect(result.recentEnrollments30Days).toBe(1);
  });

  it('returns zero counts for an empty list', () => {
    const result = programAnalyticsService.calculateEnrollmentMetrics([]);
    expect(result.totalEnrolled).toBe(0);
    expect(result.activeEnrollments).toBe(0);
    expect(result.trialUsers).toBe(0);
  });

  it('returns enrollmentsOverTime as a 30-element array', () => {
    const result = programAnalyticsService.calculateEnrollmentMetrics([activeUser]);
    expect(result.enrollmentsOverTime).toHaveLength(30);
    expect(result.enrollmentsOverTime[0]).toHaveProperty('date');
    expect(result.enrollmentsOverTime[0]).toHaveProperty('enrollments');
    expect(result.enrollmentsOverTime[0]).toHaveProperty('trials');
  });
});

// ─── calculateEngagementMetrics ──────────────────────────────────────────────

describe('calculateEngagementMetrics', () => {
  const users = [
    makeUser({ userId: 'u1', courseProgress: { totalSessionsCompleted: 10 } }),
    makeUser({ userId: 'u2', courseProgress: { totalSessionsCompleted: 0  } }),
    makeUser({ userId: 'u3', courseProgress: null }),
  ];

  it('sums total sessions completed', () => {
    const result = programAnalyticsService.calculateEngagementMetrics(users);
    expect(result.totalSessionsCompleted).toBe(10);
  });

  it('calculates average sessions per user', () => {
    const result = programAnalyticsService.calculateEngagementMetrics(users);
    // 10 sessions / 3 users
    expect(result.averageSessionsPerUser).toBeCloseTo(3.3, 1);
  });

  it('counts users with at least one session', () => {
    const result = programAnalyticsService.calculateEngagementMetrics(users);
    expect(result.usersWithAtLeastOneSession).toBe(1);
  });

  it('returns 0 completion rate when no users have sessions', () => {
    const noProgress = [makeUser(), makeUser({ userId: 'u2' })];
    const result = programAnalyticsService.calculateEngagementMetrics(noProgress);
    expect(result.completionRate).toBe(0);
  });

  it('returns 0 for all metrics on empty list', () => {
    const result = programAnalyticsService.calculateEngagementMetrics([]);
    expect(result.totalSessionsCompleted).toBe(0);
    expect(result.averageSessionsPerUser).toBe(0);
    expect(result.completionRate).toBe(0);
  });
});

// ─── calculateSessionMetrics ─────────────────────────────────────────────────

describe('calculateSessionMetrics', () => {
  const history = [
    { sessionId: 's1', sessionName: 'Piernas', completedAt: '2026-03-10T10:00:00Z', duration: 60 },
    { sessionId: 's1', sessionName: 'Piernas', completedAt: '2026-03-11T10:00:00Z', duration: 40 },
    { sessionId: 's2', sessionName: 'Empuje',  completedAt: '2026-03-10T11:00:00Z', duration: 50 },
  ];

  it('returns total completions', () => {
    const result = programAnalyticsService.calculateSessionMetrics(history, {});
    expect(result.totalCompletions).toBe(3);
  });

  it('identifies the most completed session', () => {
    const result = programAnalyticsService.calculateSessionMetrics(history, {});
    expect(result.mostCompletedSession.sessionId).toBe('s1');
    expect(result.mostCompletedSession.count).toBe(2);
  });

  it('identifies the least completed session', () => {
    const result = programAnalyticsService.calculateSessionMetrics(history, {});
    expect(result.leastCompletedSession.sessionId).toBe('s2');
    expect(result.leastCompletedSession.count).toBe(1);
  });

  it('calculates average duration', () => {
    const result = programAnalyticsService.calculateSessionMetrics(history, {});
    expect(result.averageDuration).toBe(50); // (60 + 40 + 50) / 3
  });

  it('returns safe zero-state for empty history', () => {
    const result = programAnalyticsService.calculateSessionMetrics([], {});
    expect(result.totalCompletions).toBe(0);
    expect(result.averageDuration).toBe(0);
    expect(result.mostCompletedSession).toBeNull();
  });
});

// ─── calculateExerciseMetrics ────────────────────────────────────────────────

describe('calculateExerciseMetrics', () => {
  const exerciseHistory = {
    squat:    { exerciseKey: 'squat',    totalSessions: 12, totalSets: 36, users: 4 },
    deadlift: { exerciseKey: 'deadlift', totalSessions:  7, totalSets: 21, users: 3 },
    press:    { exerciseKey: 'press',    totalSessions:  3, totalSets:  9, users: 2 },
  };

  it('counts unique exercises', () => {
    const result = programAnalyticsService.calculateExerciseMetrics(exerciseHistory);
    expect(result.totalUniqueExercises).toBe(3);
  });

  it('returns most performed exercises sorted by sessions descending', () => {
    const result = programAnalyticsService.calculateExerciseMetrics(exerciseHistory);
    expect(result.mostPerformedExercises[0].exerciseKey).toBe('squat');
    expect(result.mostPerformedExercises[1].exerciseKey).toBe('deadlift');
  });

  it('limits results to top 10', () => {
    const large = {};
    for (let i = 0; i < 15; i++) {
      large[`ex${i}`] = { exerciseKey: `ex${i}`, totalSessions: i, totalSets: i * 3, users: 1 };
    }
    const result = programAnalyticsService.calculateExerciseMetrics(large);
    expect(result.mostPerformedExercises.length).toBeLessThanOrEqual(10);
  });

  it('returns safe zero-state for empty history', () => {
    const result = programAnalyticsService.calculateExerciseMetrics({});
    expect(result.totalUniqueExercises).toBe(0);
    expect(result.mostPerformedExercises).toHaveLength(0);
  });
});

// ─── calculateProgressionMetrics ─────────────────────────────────────────────

describe('calculateProgressionMetrics', () => {
  const users = [
    makeUser({ userId: 'u1', courseProgress: { totalSessionsCompleted: 0  } }),
    makeUser({ userId: 'u2', courseProgress: { totalSessionsCompleted: 2  } }),
    makeUser({ userId: 'u3', courseProgress: { totalSessionsCompleted: 5  } }),
    makeUser({ userId: 'u4', courseProgress: { totalSessionsCompleted: 8  } }),
    makeUser({ userId: 'u5', courseProgress: { totalSessionsCompleted: 15 } }),
    makeUser({ userId: 'u6', courseProgress: null }),
  ];

  it('counts users with zero sessions', () => {
    const result = programAnalyticsService.calculateProgressionMetrics(users);
    expect(result.usersWithZeroSessions).toBe(1);
  });

  it('counts users with 1–5 sessions', () => {
    const result = programAnalyticsService.calculateProgressionMetrics(users);
    expect(result.usersWithOneToFiveSessions).toBe(2); // u2 (2) and u3 (5)
  });

  it('counts users with 6–10 sessions', () => {
    const result = programAnalyticsService.calculateProgressionMetrics(users);
    expect(result.usersWithSixToTenSessions).toBe(1); // u4 (8)
  });

  it('counts users with 10+ sessions', () => {
    const result = programAnalyticsService.calculateProgressionMetrics(users);
    expect(result.usersWithTenPlusSessions).toBe(1); // u5 (15)
  });

  it('ignores users with null courseProgress', () => {
    // u6 has null courseProgress — should not appear in any bucket
    const result = programAnalyticsService.calculateProgressionMetrics(users);
    const total = result.usersWithZeroSessions + result.usersWithOneToFiveSessions
      + result.usersWithSixToTenSessions + result.usersWithTenPlusSessions;
    expect(total).toBe(5); // not 6
  });
});

// ─── calculateDemographics ───────────────────────────────────────────────────

describe('calculateDemographics', () => {
  const users = [
    makeUser({ userId: 'u1', userAge: 28, userGender: 'female', userCity: 'Bogotá' }),
    makeUser({ userId: 'u2', userAge: 32, userGender: 'male',   userCity: 'Bogotá' }),
    makeUser({ userId: 'u3', userAge: 45, userGender: 'female', userCity: 'Medellín' }),
  ];

  it('calculates average age', () => {
    const { age } = programAnalyticsService.calculateDemographics(users);
    expect(age.average).toBe(35); // (28+32+45)/3 = 35
  });

  it('calculates age min and max', () => {
    const { age } = programAnalyticsService.calculateDemographics(users);
    expect(age.min).toBe(28);
    expect(age.max).toBe(45);
  });

  it('counts gender distribution', () => {
    const { gender } = programAnalyticsService.calculateDemographics(users);
    expect(gender.female).toBe(2);
    expect(gender.male).toBe(1);
  });

  it('returns top cities sorted by count', () => {
    const { topCities } = programAnalyticsService.calculateDemographics(users);
    expect(topCities[0].city).toBe('Bogotá');
    expect(topCities[0].count).toBe(2);
  });

  it('handles users with no demographic data gracefully', () => {
    const result = programAnalyticsService.calculateDemographics([makeUser()]);
    expect(result.age.average).toBeNull();
    expect(result.topCities).toHaveLength(0);
  });
});
