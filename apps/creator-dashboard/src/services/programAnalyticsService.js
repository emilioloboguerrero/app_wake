import apiClient from '../utils/apiClient';
import logger from '../utils/logger';

class ProgramAnalyticsService {
  async getProgramStructure(programId) {
    try {
      const result = await apiClient.get(`/creator/programs/${programId}`);
      const data = result?.data ?? {};
      const modules = data.modules ?? [];
      let totalSessions = 0;
      let totalExercises = 0;

      const modulesSummary = modules.map((m) => {
        const sessions = m.sessions ?? [];
        const exercises = sessions.reduce((sum, s) => sum + (s.exerciseCount ?? 0), 0);
        totalSessions += sessions.length;
        totalExercises += exercises;
        return {
          id: m.moduleId,
          title: m.title || 'Sin título',
          sessions: sessions.length,
          exercises,
        };
      });

      return {
        totalModules: modules.length,
        totalSessions,
        totalExercises,
        averageExercisesPerSession: totalSessions > 0
          ? (totalExercises / totalSessions).toFixed(1)
          : 0,
        modules: modulesSummary,
      };
    } catch (error) {
      logger.error('Error getting program structure:', error);
      return { totalModules: 0, totalSessions: 0, totalExercises: 0, averageExercisesPerSession: 0, modules: [] };
    }
  }

  async getProgramAnalytics(programId) {
    const structure = await this.getProgramStructure(programId);

    return {
      enrollment: {
        totalEnrolled: 0,
        activeEnrollments: 0,
        trialUsers: 0,
        expiredEnrollments: 0,
        cancelledEnrollments: 0,
        recentEnrollments30Days: 0,
        previousEnrollments30Days: 0,
        recentEnrollmentsPercentageChange: null,
        averageEnrollmentDurationDays: 0,
        demographics: { age: { average: null, min: null, max: null, distribution: {} }, gender: {}, topCities: [], onboardingAnswers: {} },
        mostCommonCustomer: null,
        enrollmentsOverTime: [],
      },
      engagement: {
        totalSessionsCompleted: 0,
        averageSessionsPerUser: 0,
        completionRate: 0,
        usersWithAtLeastOneSession: 0,
        topActiveUsers: [],
      },
      sessions: {
        totalCompletions: 0,
        averageDuration: 0,
        mostCompletedSession: null,
        leastCompletedSession: null,
        sessionsCompletedOverTime: [],
        allSessionsWithCounts: [],
      },
      exercises: {
        mostPerformedExercises: [],
        totalUniqueExercises: 0,
      },
      structure,
      progression: {
        usersWithZeroSessions: 0,
        usersWithOneToFiveSessions: 0,
        usersWithSixToTenSessions: 0,
        usersWithTenPlusSessions: 0,
        averageWeeklyStreak: 0,
      },
    };
  }

  async getAggregatedAnalyticsForCreator(programIds) {
    if (!programIds || programIds.length === 0) {
      return this._emptyAggregated();
    }

    const analyticsResults = await Promise.all(
      programIds.map((id) =>
        this.getProgramAnalytics(id).catch((err) => {
          logger.error(`Error fetching analytics for program ${id}:`, err);
          return null;
        })
      )
    );

    const valid = analyticsResults.filter(Boolean);

    if (valid.length === 0) return this._emptyAggregated();

    const programStats = {};
    programIds.forEach((id, i) => {
      programStats[id] = { users: 0 };
    });

    return {
      enrollment: {
        totalEnrolled: 0,
        activeEnrollments: 0,
        trialUsers: 0,
        expiredEnrollments: 0,
        cancelledEnrollments: 0,
        recentEnrollments30Days: 0,
        recentEnrollmentsPercentageChange: 0,
        averageEnrollmentDurationDays: 0,
        demographics: { age: { distribution: {}, average: 0 }, gender: {}, topCities: [] },
        mostCommonCustomer: null,
        enrollmentsOverTime: [],
      },
      engagement: {
        totalSessionsCompleted: 0,
        averageSessionsPerUser: 0,
        completionRate: 0,
        usersWithAtLeastOneSession: 0,
        topActiveUsers: [],
        sessionsCompletedOverTime: [],
      },
      sessions: {
        totalCompletions: 0,
        averageDuration: 0,
        mostCompletedSession: null,
        leastCompletedSession: null,
        allSessionsWithCounts: [],
        sessionsCompletedOverTime: [],
      },
      exercises: {
        totalCompletions: 0,
        averageDuration: 0,
        mostCompletedExercise: null,
        leastCompletedExercise: null,
        allExercisesWithCounts: [],
      },
      progression: {
        usersWithZeroSessions: 0,
        usersWithOneToFiveSessions: 0,
        usersWithSixToTenSessions: 0,
        usersWithTenPlusSessions: 0,
        averageWeeklyStreak: 0,
      },
      programs: programStats,
    };
  }

  _emptyAggregated() {
    return {
      enrollment: {
        totalEnrolled: 0, activeEnrollments: 0, trialUsers: 0, expiredEnrollments: 0,
        cancelledEnrollments: 0, recentEnrollments30Days: 0, recentEnrollmentsPercentageChange: 0,
        averageEnrollmentDurationDays: 0,
        demographics: { age: { distribution: {}, average: 0 }, gender: {}, topCities: [] },
        mostCommonCustomer: null, enrollmentsOverTime: [],
      },
      engagement: {
        totalSessionsCompleted: 0, averageSessionsPerUser: 0, completionRate: 0,
        usersWithAtLeastOneSession: 0, topActiveUsers: [], sessionsCompletedOverTime: [],
      },
      sessions: {
        totalCompletions: 0, averageDuration: 0, mostCompletedSession: null,
        leastCompletedSession: null, allSessionsWithCounts: [], sessionsCompletedOverTime: [],
      },
      exercises: {
        totalCompletions: 0, averageDuration: 0, mostCompletedExercise: null,
        leastCompletedExercise: null, allExercisesWithCounts: [],
      },
      progression: {
        usersWithZeroSessions: 0, usersWithOneToFiveSessions: 0,
        usersWithSixToTenSessions: 0, usersWithTenPlusSessions: 0, averageWeeklyStreak: 0,
      },
      programs: {},
    };
  }

  getAgeBucket(age) {
    if (age >= 18 && age <= 24) return '18-24';
    if (age >= 25 && age <= 34) return '25-34';
    if (age >= 35 && age <= 44) return '35-44';
    if (age >= 45 && age <= 54) return '45-54';
    if (age >= 55 && age <= 64) return '55-64';
    if (age >= 65) return '65+';
    return null;
  }
}

export default new ProgramAnalyticsService();
