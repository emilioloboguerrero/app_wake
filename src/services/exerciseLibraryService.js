import { firestore } from '../config/firebase';
import { doc, getDoc } from 'firebase/firestore';

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
        logger.log(`✅ Cache hit for ${exerciseName} (age: ${Math.round((now - cached.timestamp) / 1000)}s)`);
        return cached.data;
      } else {
        // Cache expired, remove it
        logger.log(`⏰ Cache expired for ${exerciseName}, fetching fresh data`);
        this.cache.delete(cacheKey);
      }
    }

    try {
      logger.log(`📚 Fetching exercise: ${exerciseName} from library: ${libraryId}`);
      
      const libraryDocRef = doc(firestore, 'exercises_library', libraryId);
      const libraryDoc = await getDoc(libraryDocRef);
      
      if (!libraryDoc.exists()) {
        throw new Error(`Library ${libraryId} not found`);
      }
      
      const libraryData = libraryDoc.data();
      const exerciseData = libraryData[exerciseName];
      
      if (!exerciseData) {
        throw new Error(`Exercise ${exerciseName} not found in library ${libraryId}`);
      }
      
      // Debug: log implements from Firestore
      logger.log('🔧 exerciseLibraryService.getExerciseData Firestore payload:', {
        exerciseName,
        hasImplements: Array.isArray(exerciseData.implements),
        implementsLength: Array.isArray(exerciseData.implements) ? exerciseData.implements.length : 'n/a',
        implementsSample: Array.isArray(exerciseData.implements)
          ? exerciseData.implements.slice(0, 5)
          : exerciseData.implements ?? null,
      });

      const result = {
        description: exerciseData.description || '',
        video_url: exerciseData.video_url || '',
        muscle_activation: exerciseData.muscle_activation || null,
        implements: Array.isArray(exerciseData.implements) ? exerciseData.implements : []
      };
      
      // Debug: Log the muscle activation data structure
      if (exerciseData.muscle_activation) {
        logger.log(`💪 Muscle activation data for "${exerciseName}":`, exerciseData.muscle_activation);
        logger.log(`💪 Type of muscle_activation:`, typeof exerciseData.muscle_activation);
        logger.log(`💪 Keys in muscle_activation:`, Object.keys(exerciseData.muscle_activation));
      } else {
        logger.log(`⚠️ No muscle_activation data found for "${exerciseName}"`);
      }
      
      // Debug: log result object shape (still without implements)
      logger.log('🔧 exerciseLibraryService.getExerciseData result (with implements):', {
        hasDescription: !!result.description,
        hasVideoUrl: !!result.video_url,
        hasMuscleActivation: !!result.muscle_activation,
        hasImplements: Array.isArray(result.implements),
        implementsLength: Array.isArray(result.implements)
          ? result.implements.length
          : 'n/a',
      });
      
      // Cache the result with timestamp
      this.cache.set(cacheKey, {
        data: result,
        timestamp: Date.now()
      });
      
      logger.log(`✅ Exercise data loaded and cached: ${exerciseName}`);
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
    logger.log('🔍 Resolving primary exercise with data:', JSON.stringify(primaryRef, null, 2));
    
    if (!primaryRef || typeof primaryRef !== 'object') {
      logger.error('❌ Primary ref is not an object:', primaryRef);
      throw new Error('Invalid primary exercise reference');
    }

    // Get the first (and only) library ID and exercise name from the primary map
    const libraryId = Object.keys(primaryRef)[0];
    const exerciseName = primaryRef[libraryId];

    logger.log('🔍 Library ID:', libraryId, 'Exercise Name:', exerciseName);

    if (!libraryId || !exerciseName) {
      logger.error('❌ Missing libraryId or exerciseName:', { libraryId, exerciseName });
      throw new Error('Invalid primary exercise structure');
    }

    const exerciseData = await this.getExerciseData(libraryId, exerciseName);
    
    logger.log(`🔍 resolvePrimaryExercise: Got exercise data for "${exerciseName}":`, {
      description: exerciseData.description,
      video_url: exerciseData.video_url,
      muscle_activation: exerciseData.muscle_activation,
      implements: exerciseData.implements ?? null,
      hasImplements: Array.isArray(exerciseData.implements),
      implementsLength: Array.isArray(exerciseData.implements)
        ? exerciseData.implements.length
        : 'n/a',
    });
    
    return {
      title: exerciseName,
      description: exerciseData.description,
      video_url: exerciseData.video_url,
      muscle_activation: exerciseData.muscle_activation,
      implements: Array.isArray(exerciseData.implements) ? exerciseData.implements : [],
    };
  }


  /**
   * Clear cache (useful for testing or when data changes)
   */
  clearCache() {
    this.cache.clear();
  }
}

export default new ExerciseLibraryService();
