// One Rep Max Service - Calculates and manages 1RM estimates for strength training
import apiClient from '../utils/apiClient';
import logger from '../utils/logger.js';

class OneRepMaxService {
  
  /**
   * Parse reps for 1RM / weight-suggestion math.
   * Accepts either a raw reps string ("8", "8-12") or a full set object
   * ({ reps, rep_sequence }). When rep_sequence is present, uses its first
   * segment — drop-sets are programmed so the first mini-set determines the
   * starting weight (subsequent drops are decided live). AMRAP sets fall back
   * to 10 reps so suggestions remain meaningful.
   * @param {string | object} input - reps string OR a set object
   * @returns {number}
   */
  parseReps(input) {
    if (input && typeof input === 'object' && !Array.isArray(input)) {
      if (Array.isArray(input.rep_sequence) && input.rep_sequence.length > 0) {
        const first = Number(input.rep_sequence[0]);
        if (Number.isFinite(first) && first > 0) return first;
      }
      return this.parseReps(input.reps);
    }

    if (!input || typeof input !== 'string') return 10;

    const trimmed = input.trim();
    if (trimmed.toUpperCase() === 'AMRAP') return 10;

    const cleaned = trimmed.replace(/\s+/g, '');

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
    if (objectiveIntensity === null || objectiveIntensity === undefined) {
      return Math.round(numerator * 10) / 10;
    }
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
        // The /workout/prs endpoint returns raw exerciseLastPerformance docs.
        // Compute 1RM from bestSet if available, using a default intensity of 8.
        const bestSet = pr.bestSet ?? (pr.sets ?? []).reduce((best, s) => {
          const w = Number(s?.weight) || 0;
          return w > (Number(best?.weight) || 0) ? s : best;
        }, null);

        const weight = Number(bestSet?.weight) || 0;
        const reps = Number(bestSet?.reps) || 0;

        if (weight > 0 && reps > 0) {
          estimates[pr.exerciseKey] = {
            current: pr.estimate1RM > 0 ? pr.estimate1RM : this.calculate1RM(weight, reps, null),
            lastUpdated: pr.date ?? null,
            achievedWith: bestSet,
            // Snapshot from server doc body (preserved by migration). Used by PR/Lab
            // screens to render human-readable names — the exerciseKey tail is now an
            // exerciseId post-migration and would render as a 20-char hash if shown.
            exerciseName: pr.exerciseName ?? pr.name ?? null,
            libraryId: pr.libraryId ?? null,
            exerciseId: pr.exerciseId ?? null,
          };
        }
      });
      return estimates;
    } catch (error) {
      logger.error('Error fetching 1RM estimates:', error);
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
            ? records
                .map(r => {
                  let bestEstimate = 0;
                  const sets = r.sets ?? [];
                  for (const s of sets) {
                    const weight = parseFloat(s.weight);
                    const reps = parseFloat(s.reps);
                    if (weight > 0 && reps > 0) {
                      const estimate = weight * (1 + 0.0333 * reps);
                      if (estimate > bestEstimate) bestEstimate = estimate;
                    }
                  }
                  if (bestEstimate <= 0) return null;
                  return { date: r.date, value: Math.round(bestEstimate * 10) / 10 };
                })
                .filter(Boolean)
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
      return records
        .map(r => {
          let bestEstimate = 0;
          const sets = r.sets ?? [];
          for (const s of sets) {
            const weight = parseFloat(s.weight);
            const reps = parseFloat(s.reps);
            if (weight > 0 && reps > 0) {
              const estimate = weight * (1 + 0.0333 * reps);
              if (estimate > bestEstimate) bestEstimate = estimate;
            }
          }
          if (bestEstimate <= 0) return null;
          return { date: r.date, value: Math.round(bestEstimate * 10) / 10 };
        })
        .filter(Boolean);
    } catch (err) {
      logger.error('[1RM] getHistoryByKey error', exerciseKey, err?.message);
      return [];
    }
  }

  async getHistoryForExercise(userId, libraryId, exerciseName, exerciseKey) {
    try {
      // Prefer the exact exerciseKey when supplied — the rekeyed history docs use
      // `${libraryId}_${exerciseId}`, which won't match a reconstructed name-based key
      // post-migration.
      const key = exerciseKey || `${libraryId}_${exerciseName}`;
      const res = await apiClient.get(`/workout/prs/${encodeURIComponent(key)}/history`);
      const records = res?.data?.sessions ?? res?.data ?? [];
      if (!Array.isArray(records)) return [];
      // PRHistoryChart expects { estimate, date: { seconds } }
      // Sessions store { date, sessionId, sets } — compute best 1RM from sets
      return records
        .map(r => {
          let bestEstimate = 0;
          const sets = r.sets ?? [];
          for (const s of sets) {
            const weight = parseFloat(s.weight);
            const reps = parseFloat(s.reps);
            if (weight > 0 && reps > 0) {
              const estimate = weight * (1 + 0.0333 * reps);
              if (estimate > bestEstimate) bestEstimate = estimate;
            }
          }
          if (bestEstimate <= 0) return null;
          const dateMs = r.date?._seconds
            ? r.date._seconds * 1000
            : new Date(r.date).getTime();
          return {
            id: r.date,
            estimate: Math.round(bestEstimate * 10) / 10,
            date: { seconds: dateMs / 1000 },
          };
        })
        .filter(Boolean);
    } catch (error) {
      logger.error('getHistoryForExercise: Error:', error);
      return [];
    }
  }
}

export default new OneRepMaxService();

