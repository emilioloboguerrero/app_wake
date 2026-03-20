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
    if (!repsStr || typeof repsStr !== 'string') {
      logger.debug('⚠️ parseReps: Invalid input:', repsStr, '→ using fallback: 10');
      return 10;
    }
    
    // Remove all spaces
    const cleaned = repsStr.trim().replace(/\s+/g, '');
    logger.debug('🔢 parseReps: Parsing', repsStr, '→ cleaned:', cleaned);
    
    if (cleaned.includes('-')) {
      // Range format: "8-12"
      const parts = cleaned.split('-');
      const min = parseInt(parts[0]);
      const max = parseInt(parts[1]);
      
      if (isNaN(min) || isNaN(max) || min <= 0 || max <= 0) {
        logger.debug('⚠️ parseReps: Invalid range values:', { min, max }, '→ using fallback: 10');
        return 10;
      }
      
      const average = (min + max) / 2;
      logger.debug('✅ parseReps: Range parsed:', min, '-', max, '→ average:', average);
      return average;
    } else {
      // Single number: "10"
      const value = parseInt(cleaned);
      
      if (isNaN(value) || value <= 0) {
        logger.debug('⚠️ parseReps: Non-numeric value:', cleaned, '(e.g., AMRAP/Fallo) → using fallback: 10');
        return 10;
      }
      
      logger.debug('✅ parseReps: Single value parsed:', value);
      return value;
    }
  }
  
  /**
   * Parse intensity from string format
   * @param {string} intensityStr - Format: "8/10" or "8 / 10"
   * @returns {number|null} - Intensity value (1-10) or null if invalid
   */
  parseIntensity(intensityStr) {
    // 🔍 VOLUME DEBUG: Enhanced logging for intensity parsing
    logger.debug('🔍 VOLUME DEBUG: parseIntensity called:', {
      intensityStr,
      intensityType: typeof intensityStr,
      intensityLength: intensityStr?.length,
      isNull: intensityStr === null,
      isUndefined: intensityStr === undefined,
      isEmpty: intensityStr === '',
      isString: typeof intensityStr === 'string'
    });
    
    if (!intensityStr || typeof intensityStr !== 'string') {
      logger.debug('⚠️ parseIntensity: Invalid input:', {
        intensityStr,
        reason: !intensityStr ? 'falsy value' : 'not a string',
        type: typeof intensityStr
      });
      return null;
    }
    
    // Remove all spaces
    const cleaned = intensityStr.trim().replace(/\s+/g, '');
    logger.debug('🔢 parseIntensity: Parsing', {
      original: intensityStr,
      cleaned: cleaned,
      originalLength: intensityStr.length,
      cleanedLength: cleaned.length
    });
    
    // Match pattern "X/10"
    const match = cleaned.match(/^(\d+)\/10$/);
    
    logger.debug('🔍 VOLUME DEBUG: Regex matching:', {
      cleaned,
      regexPattern: '/^(\\d+)\\/10$/',
      matchResult: match,
      hasMatch: !!match,
      capturedGroup: match ? match[1] : null
    });
    
    if (!match) {
      logger.debug('⚠️ parseIntensity: Does not match X/10 format:', {
        cleaned,
        reason: 'regex pattern mismatch'
      });
      return null;
    }
    
    const level = parseInt(match[1]);
    
    logger.debug('🔍 VOLUME DEBUG: Level parsing:', {
      capturedGroup: match[1],
      parsedLevel: level,
      isValidNumber: !isNaN(level),
      levelType: typeof level
    });
    
    // Validate range 1-10
    if (level < 1 || level > 10) {
      logger.debug('⚠️ parseIntensity: Out of range (1-10):', {
        level,
        isValidRange: level >= 1 && level <= 10,
        reason: level < 1 ? 'too low' : 'too high'
      });
      return null;
    }
    
    logger.debug('✅ parseIntensity: Successfully parsed:', {
      original: intensityStr,
      cleaned: cleaned,
      level: level,
      levelType: typeof level
    });
    return level;
  }
  
  /**
   * Round to nearest 5kg (round UP)
   * @param {number} weight - Weight to round
   * @returns {number} - Rounded weight
   */
  roundToNearest5(weight) {
    const rounded = Math.ceil(weight / 5) * 5;
    logger.debug('🔢 roundToNearest5:', weight, '→', rounded, '(rounded up)');
    return rounded;
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
    logger.debug('🔢 calculate1RM: Input:', { actualWeight, actualReps, objectiveIntensity });
    
    // Formula components
    const numerator = actualWeight * (1 + 0.0333 * actualReps);
    const denominator = 1 - 0.025 * (10 - objectiveIntensity);
    
    logger.debug('🔢 calculate1RM: Numerator:', numerator);
    logger.debug('🔢 calculate1RM: Denominator:', denominator);
    
    const estimate = numerator / denominator;
    const rounded = Math.round(estimate * 10) / 10; // Round to 1 decimal
    
    logger.debug('✅ calculate1RM: Result:', estimate, '→ rounded:', rounded);
    return rounded;
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
    logger.debug('🔢 calculateWeightSuggestion: Input:', { estimate1RM, objectiveReps, objectiveIntensity });
    
    // Formula components
    const numerator = estimate1RM * (1 - 0.025 * (10 - objectiveIntensity));
    const denominator = 1 + 0.0333 * objectiveReps;
    
    logger.debug('🔢 calculateWeightSuggestion: Numerator:', numerator);
    logger.debug('🔢 calculateWeightSuggestion: Denominator:', denominator);
    
    const suggestion = numerator / denominator;
    const rounded = this.roundToNearest5(suggestion);
    
    logger.debug('✅ calculateWeightSuggestion: Result:', suggestion, '→ rounded to nearest 5kg:', rounded);
    return rounded;
  }
  
  /**
   * Get all 1RM estimates for a user
   * @param {string} userId - User ID (unused — auth from token)
   * @returns {Object} - Map of exercise keys to estimates
   */
  async getEstimatesForUser(userId) {
    try {
      logger.debug('📖 getEstimatesForUser: Fetching estimates');
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
      logger.debug('✅ getEstimatesForUser: Found', prs.length, 'estimates');
      return estimates;
    } catch (error) {
      logger.error('❌ getEstimatesForUser: Error fetching estimates:', error);
      return {};
    }
  }
  
  async resetEstimate(userId, exerciseKey) {
    try {
      logger.debug('🔄 resetEstimate: Resetting estimate for', exerciseKey);
      await apiClient.delete(`/workout/prs/${encodeURIComponent(exerciseKey)}`);
      logger.debug('✅ resetEstimate: Estimate deleted successfully');
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
  async getHistoryByKey(userId, exerciseKey) {
    try {
      const res = await apiClient.get(`/workout/prs/${encodeURIComponent(exerciseKey)}/history`);
      const records = res?.data ?? [];
      return records.map(r => ({ date: r.date, value: r.estimate1RM }));
    } catch (err) {
      logger.error('[1RM] getHistoryByKey error', exerciseKey, err?.message);
      return [];
    }
  }

  async getHistoryForExercise(userId, libraryId, exerciseName) {
    try {
      const exerciseKey = `${libraryId}_${exerciseName}`;
      logger.debug('📖 getHistoryForExercise: Fetching history for', exerciseKey);
      const res = await apiClient.get(`/workout/prs/${encodeURIComponent(exerciseKey)}/history`);
      const records = res?.data ?? [];
      logger.debug('✅ getHistoryForExercise: Found', records.length, 'entries');
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

