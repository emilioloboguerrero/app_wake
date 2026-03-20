import apiClient from '../utils/apiClient';
import logger from '../utils/logger';

class ProgramAnalyticsService {
  // Returns only structure data — analytics fields are not yet implemented
  async getProgramAnalytics(programId) {
    const structure = await this.getProgramStructure(programId);
    return { structure };
  }

  // Aggregates structure data across multiple programs — analytics not yet implemented
  async getAggregatedAnalyticsForCreator(programIds) {
    if (!programIds || programIds.length === 0) return { programs: {} };
    const results = await Promise.all(
      programIds.map((id) =>
        this.getProgramAnalytics(id).catch((err) => {
          logger.error(`Error fetching analytics for program ${id}:`, err);
          return null;
        })
      )
    );
    const programs = {};
    programIds.forEach((id) => { programs[id] = { users: 0 }; });
    return { programs };
  }

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

}

export default new ProgramAnalyticsService();
