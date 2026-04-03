// One Rep Max Service - Calculates and manages 1RM estimates for strength training
import apiClient from '../utils/apiClient';
import logger from '../utils/logger.js';

class OneRepMaxService {
  
  /**
   * Parse reps from string format
   * @param {string} repsStr - Format: "8-12" or "10" or "8 - 12"
   * @returns {number} - Average reps, or 10 as fallback for non-numeric values
   */
  parseReps(repsStr) {
    if (!repsStr || typeof repsStr !== 'string') return 10;

    const cleaned = repsStr.trim().replace(/\s+/g, '');

    if (cleaned.includes('-')) {
      const parts = cleaned.split('-');
      const min = parseInt(parts[0]);
      const max = parseInt(parts[1]);
      if (isNaN(min) || isNaN(max) || min <= 0 || max <= 0) return 10;
      return (min + max) / 2;
    } else {
      const value = parseInt(cleaned);
      if (isNaN(value) || value <= 0) return 10;
      return value;
    }
  }
  
  /**
   * Parse intensity from string format
   * @param {string} intensityStr - Format: "8/10" or "8 / 10"
   * @returns {number|null} - Intensity value (1-10) or null if invalid
   */
  parseIntensity(intensityStr) {
    if (!intensityStr || typeof intensityStr !== 'string') return null;

    const cleaned = intensityStr.trim().replace(/\s+/g, '');
    const match = cleaned.match(/^(\d+)\/10$/);
    if (!match) return null;

    const level = parseInt(match[1]);
    if (level < 1 || level > 10) return null;

    return level;
  }
  
  /**
   * Round to nearest 5kg (round UP)
   * @param {number} weight - Weight to round
   * @returns {number} - Rounded weight
   */
  roundToNearest5(weight) {
    return Math.ceil(weight / 5) * 5;
  }
  
  /**
   * Calculate 1RM estimate from set data
   * Formula: 1RM = actualWeight × (1 + 0.0333 × actualReps) / (1 - 0.025 × (10 - objectiveIntensity))
   * @param {number} actualWeight - Weight lifted
   * @param {number} actualReps - Reps performed
   * @param {number} objectiveIntensity - Intensity level (1-10)
   * @returns {number} - Estimated 1RM rounded to 1 decimal
   */
  calculate1RM(actualWeight, actualReps, objectiveIntensity) {
    const numerator = actualWeight * (1 + 0.0333 * actualReps);
    const denominator = 1 - 0.025 * (10 - objectiveIntensity);
    return Math.round((numerator / denominator) * 10) / 10;
  }
  
  /**
   * Calculate weight suggestion for a set
   * Formula: weight = 1RM × (1 - 0.025 × (10 - objectiveIntensity)) / (1 + 0.0333 × objectiveReps)
   * @param {number} estimate1RM - Estimated 1RM
   * @param {number} objectiveReps - Target reps
   * @param {number} objectiveIntensity - Target intensity (1-10)
   * @returns {number} - Suggested weight (rounded to nearest 5kg)
   */
  calculateWeightSuggestion(estimate1RM, objectiveReps, objectiveIntensity) {
    const numerator = estimate1RM * (1 - 0.025 * (10 - objectiveIntensity));
    const denominator = 1 + 0.0333 * objectiveReps;
    return this.roundToNearest5(numerator / denominator);
  }
  
  /**
   * Get all 1RM estimates for a user
   * @param {string} userId - User ID (unused — auth from token)
   * @returns {Object} - Map of exercise keys to estimates
   */
  async getEstimatesForUser(userId) {
    try {
      const res = await apiClient.get('/workout/prs');
      const prs = res?.data ?? [];
      const estimates = {};
      prs.forEach(pr => {
        estimates[pr.exerciseKey] = {
          current: pr.estimate1RM,
          lastUpdated: pr.lastUpdated,
          achievedWith: pr.achievedWith,
        };
      });
      return estimates;
    } catch (error) {
      logger.error('❌ getEstimatesForUser: Error fetching estimates:', error);
      return {};
    }
  }
  
  async resetEstimate(userId, exerciseKey) {
    try {
      await apiClient.delete(`/workout/prs/${encodeURIComponent(exerciseKey)}`);
    } catch (error) {
      logger.error('❌ resetEstimate: Error:', error);
      throw error;
    }
  }
  
  /**
   * Get history for an exercise (for future progress tracking)
   * @param {string} userId - User ID
   * @param {string} libraryId - Exercise library ID
   * @param {string} exerciseName - Exercise name
   * @returns {Array} - Array of history entries
   */
  async getBatchHistory(userId, exerciseKeys) {
    try {
      const res = await apiClient.post('/workout/prs/batch-history', { keys: exerciseKeys });
      const results = res?.data ?? {};
      return exerciseKeys.map(key => {
        const records = results[key]?.sessions ?? [];
        return {
          exerciseKey: key,
          records: Array.isArray(records)
            ? records.map(r => ({ date: r.date, value: r.estimate1RM }))
            : [],
        };
      });
    } catch (err) {
      logger.error('[1RM] getBatchHistory error', err?.message);
      return exerciseKeys.map(key => ({ exerciseKey: key, records: [] }));
    }
  }

  async getHistoryByKey(userId, exerciseKey) {
    try {
      const res = await apiClient.get(`/workout/prs/${encodeURIComponent(exerciseKey)}/history`);
      const records = res?.data?.sessions ?? res?.data ?? [];
      if (!Array.isArray(records)) return [];
      return records.map(r => ({ date: r.date, value: r.estimate1RM }));
    } catch (err) {
      logger.error('[1RM] getHistoryByKey error', exerciseKey, err?.message);
      return [];
    }
  }

  async getHistoryForExercise(userId, libraryId, exerciseName) {
    try {
      const exerciseKey = `${libraryId}_${exerciseName}`;
      const res = await apiClient.get(`/workout/prs/${encodeURIComponent(exerciseKey)}/history`);
      const records = res?.data?.sessions ?? res?.data ?? [];
      if (!Array.isArray(records)) return [];
      // PRHistoryChart expects { estimate, date: { seconds } }
      return records.map(r => ({
        id: r.date,
        estimate: r.estimate1RM,
        date: { seconds: new Date(r.date).getTime() / 1000 },
      }));
    } catch (error) {
      logger.error('❌ getHistoryForExercise: Error:', error);
      return [];
    }
  }
}

export default new OneRepMaxService();

