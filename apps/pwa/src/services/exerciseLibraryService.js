import apiClient from '../utils/apiClient';
import logger from '../utils/logger.js';
class ExerciseLibraryService {
  constructor() {
    this.cache = new Map();
    this.cacheTTL = 5 * 60 * 1000; // 5 minutes TTL
  }

  /**
   * Get exercise data from library
   * @param {string} libraryId - The document ID of the creator's library
   * @param {string} exerciseName - The name of the exercise
   * @returns {Promise<{description: string, video_url: string, muscle_activation: object}>}
   */
  async getExerciseData(libraryId, exerciseName) {
    const cacheKey = `${libraryId}_${exerciseName}`;
    
    // Check cache first with TTL validation
    if (this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey);
      const now = Date.now();
      
      // Check if cache is still valid
      if (cached.timestamp && (now - cached.timestamp) < this.cacheTTL) {
        return cached.data;
      } else {
        this.cache.delete(cacheKey);
      }
    }

    try {
      const apiResult = await apiClient.get(`/exercises/${libraryId}/${encodeURIComponent(exerciseName)}`);
      const exerciseData = apiResult?.data;

      if (!exerciseData) {
        throw new Error(`Exercise ${exerciseName} not found in library ${libraryId}`);
      }

      const result = {
        description: exerciseData.description || '',
        video_url: exerciseData.video_url || '',
        muscle_activation: exerciseData.muscle_activation || null,
        implements: Array.isArray(exerciseData.implements) ? exerciseData.implements : []
      };
      
      // Cache the result with timestamp
      this.cache.set(cacheKey, {
        data: result,
        timestamp: Date.now()
      });
      
      return result;
      
    } catch (error) {
      logger.error(`❌ Error fetching exercise ${exerciseName} from library ${libraryId}:`, error);
      throw error;
    }
  }

  /**
   * Resolve primary exercise data
   * @param {Object} primaryRef - The primary exercise reference
   * @returns {Promise<{title: string, description: string, video_url: string}>}
   */
  async resolvePrimaryExercise(primaryRef) {
    if (!primaryRef || typeof primaryRef !== 'object') {
      throw new Error('Invalid primary exercise reference');
    }

    // Get the first (and only) library ID and exercise name from the primary map
    const libraryId = Object.keys(primaryRef)[0];
    const exerciseName = primaryRef[libraryId];

    if (!libraryId || !exerciseName) {
      throw new Error('Invalid primary exercise structure');
    }

    const exerciseData = await this.getExerciseData(libraryId, exerciseName);

    return {
      title: exerciseName,
      description: exerciseData.description,
      video_url: exerciseData.video_url,
      muscle_activation: exerciseData.muscle_activation,
      implements: Array.isArray(exerciseData.implements) ? exerciseData.implements : [],
    };
  }


  /**
   * Get the full library document by ID.
   * Returns the raw document data with creator_name and all exercises, or null if not found.
   */
  async getLibraryDocument(libraryId) {
    const cacheKey = `library_${libraryId}`;
    if (this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey);
      if (Date.now() - cached.timestamp < this.cacheTTL) {
        return cached.data;
      }
      this.cache.delete(cacheKey);
    }
    try {
      const result = await apiClient.get(`/exercises/${libraryId}`);
      const data = result?.data ?? null;
      if (data) this.cache.set(cacheKey, { data, timestamp: Date.now() });
      return data;
    } catch (error) {
      logger.error(`❌ Error fetching library document ${libraryId}:`, error);
      return null;
    }
  }

  /**
   * Clear cache (useful for testing or when data changes)
   */
  clearCache() {
    this.cache.clear();
  }
}

export default new ExerciseLibraryService();
