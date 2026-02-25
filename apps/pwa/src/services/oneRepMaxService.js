// One Rep Max Service - Calculates and manages 1RM estimates for strength training
import { doc, updateDoc, collection, addDoc, getDoc, serverTimestamp, deleteField, getDocs, query, orderBy, limit } from 'firebase/firestore';
import { firestore } from '../config/firebase';
import logger from '../utils/logger.js';

class OneRepMaxService {
  
  /**
   * Parse reps from string format
   * @param {string} repsStr - Format: "8-12" or "10" or "8 - 12"
   * @returns {number} - Average reps, or 10 as fallback for non-numeric values
   */
  parseReps(repsStr) {
    if (!repsStr || typeof repsStr !== 'string') {
      logger.log('⚠️ parseReps: Invalid input:', repsStr, '→ using fallback: 10');
      return 10;
    }
    
    // Remove all spaces
    const cleaned = repsStr.trim().replace(/\s+/g, '');
    logger.log('🔢 parseReps: Parsing', repsStr, '→ cleaned:', cleaned);
    
    if (cleaned.includes('-')) {
      // Range format: "8-12"
      const parts = cleaned.split('-');
      const min = parseInt(parts[0]);
      const max = parseInt(parts[1]);
      
      if (isNaN(min) || isNaN(max) || min <= 0 || max <= 0) {
        logger.log('⚠️ parseReps: Invalid range values:', { min, max }, '→ using fallback: 10');
        return 10;
      }
      
      const average = (min + max) / 2;
      logger.log('✅ parseReps: Range parsed:', min, '-', max, '→ average:', average);
      return average;
    } else {
      // Single number: "10"
      const value = parseInt(cleaned);
      
      if (isNaN(value) || value <= 0) {
        logger.log('⚠️ parseReps: Non-numeric value:', cleaned, '(e.g., AMRAP/Fallo) → using fallback: 10');
        return 10;
      }
      
      logger.log('✅ parseReps: Single value parsed:', value);
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
    logger.log('🔍 VOLUME DEBUG: parseIntensity called:', {
      intensityStr,
      intensityType: typeof intensityStr,
      intensityLength: intensityStr?.length,
      isNull: intensityStr === null,
      isUndefined: intensityStr === undefined,
      isEmpty: intensityStr === '',
      isString: typeof intensityStr === 'string'
    });
    
    if (!intensityStr || typeof intensityStr !== 'string') {
      logger.log('⚠️ parseIntensity: Invalid input:', {
        intensityStr,
        reason: !intensityStr ? 'falsy value' : 'not a string',
        type: typeof intensityStr
      });
      return null;
    }
    
    // Remove all spaces
    const cleaned = intensityStr.trim().replace(/\s+/g, '');
    logger.log('🔢 parseIntensity: Parsing', {
      original: intensityStr,
      cleaned: cleaned,
      originalLength: intensityStr.length,
      cleanedLength: cleaned.length
    });
    
    // Match pattern "X/10"
    const match = cleaned.match(/^(\d+)\/10$/);
    
    logger.log('🔍 VOLUME DEBUG: Regex matching:', {
      cleaned,
      regexPattern: '/^(\\d+)\\/10$/',
      matchResult: match,
      hasMatch: !!match,
      capturedGroup: match ? match[1] : null
    });
    
    if (!match) {
      logger.log('⚠️ parseIntensity: Does not match X/10 format:', {
        cleaned,
        reason: 'regex pattern mismatch'
      });
      return null;
    }
    
    const level = parseInt(match[1]);
    
    logger.log('🔍 VOLUME DEBUG: Level parsing:', {
      capturedGroup: match[1],
      parsedLevel: level,
      isValidNumber: !isNaN(level),
      levelType: typeof level
    });
    
    // Validate range 1-10
    if (level < 1 || level > 10) {
      logger.log('⚠️ parseIntensity: Out of range (1-10):', {
        level,
        isValidRange: level >= 1 && level <= 10,
        reason: level < 1 ? 'too low' : 'too high'
      });
      return null;
    }
    
    logger.log('✅ parseIntensity: Successfully parsed:', {
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
    logger.log('🔢 roundToNearest5:', weight, '→', rounded, '(rounded up)');
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
    logger.log('🔢 calculate1RM: Input:', { actualWeight, actualReps, objectiveIntensity });
    
    // Formula components
    const numerator = actualWeight * (1 + 0.0333 * actualReps);
    const denominator = 1 - 0.025 * (10 - objectiveIntensity);
    
    logger.log('🔢 calculate1RM: Numerator:', numerator);
    logger.log('🔢 calculate1RM: Denominator:', denominator);
    
    const estimate = numerator / denominator;
    const rounded = Math.round(estimate * 10) / 10; // Round to 1 decimal
    
    logger.log('✅ calculate1RM: Result:', estimate, '→ rounded:', rounded);
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
    logger.log('🔢 calculateWeightSuggestion: Input:', { estimate1RM, objectiveReps, objectiveIntensity });
    
    // Formula components
    const numerator = estimate1RM * (1 - 0.025 * (10 - objectiveIntensity));
    const denominator = 1 + 0.0333 * objectiveReps;
    
    logger.log('🔢 calculateWeightSuggestion: Numerator:', numerator);
    logger.log('🔢 calculateWeightSuggestion: Denominator:', denominator);
    
    const suggestion = numerator / denominator;
    const rounded = this.roundToNearest5(suggestion);
    
    logger.log('✅ calculateWeightSuggestion: Result:', suggestion, '→ rounded to nearest 5kg:', rounded);
    return rounded;
  }
  
  /**
   * Get all 1RM estimates for a user
   * @param {string} userId - User ID
   * @returns {Object} - Map of exercise keys to estimates
   */
  async getEstimatesForUser(userId) {
    try {
      logger.log('📖 getEstimatesForUser: Fetching estimates for user:', userId);
      
      const userDocRef = doc(firestore, 'users', userId);
      const userDoc = await getDoc(userDocRef);
      
      if (!userDoc.exists()) {
        logger.log('ℹ️ getEstimatesForUser: User document does not exist - returning empty');
        return {};
      }
      
      const data = userDoc.data();
      const estimates = data.oneRepMaxEstimates || {};
      
      logger.log('✅ getEstimatesForUser: Found', Object.keys(estimates).length, 'estimates');
      logger.log('📊 getEstimatesForUser: Estimates:', estimates);
      
      return estimates;
    } catch (error) {
      logger.error('❌ getEstimatesForUser: Error fetching estimates:', error);
      return {};
    }
  }
  
  /**
   * Update 1RM estimates after a session
   * @param {string} userId - User ID
   * @param {Array} exercises - Exercise array from workout
   * @param {Object} setData - User input data (weight, reps)
   * @returns {Array} - Array of personal records achieved (improvements only)
   */
  async updateEstimatesAfterSession(userId, exercises, setData) {
    try {
      logger.log('🔄 updateEstimatesAfterSession: Starting update for user:', userId);
      logger.log('🔄 updateEstimatesAfterSession: Processing', exercises.length, 'exercises');
      
      // Get current estimates from DB
      const currentEstimates = await this.getEstimatesForUser(userId);
      logger.log('📊 updateEstimatesAfterSession: Current estimates:', currentEstimates);
      
      const updates = {};
      const historyUpdates = [];
      const personalRecords = []; // NEW: Track PRs for display
      
      // Process each exercise
      for (let exerciseIndex = 0; exerciseIndex < exercises.length; exerciseIndex++) {
        const exercise = exercises[exerciseIndex];
        
        logger.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        logger.log(`🏋️ Processing Exercise ${exerciseIndex + 1}/${exercises.length}:`, exercise.name);
        
        // Get exercise identifier
        if (!exercise.primary || Object.keys(exercise.primary).length === 0) {
          logger.log('⚠️ Exercise has no primary field - skipping:', exercise.name);
          continue;
        }
        
        const libraryId = Object.keys(exercise.primary)[0];
        const exerciseName = exercise.primary[libraryId];
        const exerciseKey = `${libraryId}_${exerciseName}`;
        
        logger.log('🔑 Exercise Key:', exerciseKey);
        logger.log('📚 Library ID:', libraryId);
        logger.log('📝 Exercise Name:', exerciseName);
        
        // Calculate 1RM for each set
        const set1RMs = [];
        const setDetails = []; // Track which set achieved each 1RM
        
        for (let setIndex = 0; setIndex < exercise.sets.length; setIndex++) {
          const set = exercise.sets[setIndex];
          const setKey = `${exerciseIndex}_${setIndex}`;
          const actualData = setData[setKey];
          
          logger.log(`  📋 Set ${setIndex + 1}/${exercise.sets.length}:`);
          logger.log(`    🔑 Set Key:`, setKey);
          logger.log(`    📥 Actual Data:`, actualData);
          logger.log(`    🎯 Objective Data:`, { reps: set.reps, intensity: set.intensity });
          
          // Validate actual data
          if (!actualData || !actualData.weight || !actualData.reps) {
            logger.log(`    ⏭️ Skipping set - missing actual data`);
            continue;
          }
          
          const actualWeight = parseFloat(actualData.weight);
          const actualReps = parseInt(actualData.reps);
          
          if (actualWeight <= 0 || actualReps <= 0) {
            logger.log(`    ⏭️ Skipping set - invalid values (weight:${actualWeight}, reps:${actualReps})`);
            continue;
          }
          
          // Validate objective intensity
          if (!set.intensity) {
            logger.log(`    ⏭️ Skipping set - missing objective intensity`);
            continue;
          }
          
          const objectiveIntensity = this.parseIntensity(set.intensity);
          
          if (!objectiveIntensity) {
            logger.log(`    ⏭️ Skipping set - invalid intensity format:`, set.intensity);
            continue;
          }
          
          // Calculate 1RM
          logger.log(`    🔢 Valid set data - calculating 1RM...`);
          const estimate1RM = this.calculate1RM(actualWeight, actualReps, objectiveIntensity);
          set1RMs.push(estimate1RM);
          
          // Track set details
          setDetails.push({
            setNumber: setIndex + 1,
            weight: actualWeight,
            reps: actualReps,
            estimate1RM: estimate1RM
          });
          
          logger.log(`    ✅ Set 1RM estimate:`, estimate1RM);
        }
        
        // Check if we have any valid estimates
        if (set1RMs.length === 0) {
          logger.log('  ⚠️ No valid sets found for this exercise - skipping');
          continue;
        }
        
        // Find highest 1RM
        const highest1RM = Math.max(...set1RMs);
        const bestSetIndex = set1RMs.indexOf(highest1RM);
        const bestSet = setDetails[bestSetIndex];
        
        logger.log('  📊 All 1RM estimates:', set1RMs);
        logger.log('  🏆 Highest 1RM:', highest1RM);
        logger.log('  🥇 Achieved by set:', bestSet.setNumber, `(${bestSet.weight}kg × ${bestSet.reps} reps)`);
        
        // Compare with current DB value
        const currentValue = currentEstimates[exerciseKey]?.current;
        logger.log('  💾 Current DB value:', currentValue || 'None');
        
        if (!currentValue || highest1RM > currentValue) {
          logger.log('  ✅ New 1RM is higher - updating!');
          
          // Prepare update (store achievedWith for display e.g. "80kg × 5 reps")
          updates[`oneRepMaxEstimates.${exerciseKey}`] = {
            current: highest1RM,
            lastUpdated: new Date().toISOString(),
            achievedWith: {
              weight: bestSet.weight,
              reps: bestSet.reps
            }
          };
          
          // Prepare history entry
          historyUpdates.push({
            libraryId,
            exerciseName,
            estimate: highest1RM
          });
          
          // Track personal record (ONLY if not first time)
          if (currentValue) {
            logger.log('  🏆 Personal Record achieved! (improvement over previous)');
            personalRecords.push({
              exerciseName: exerciseName,
              achievedWith: {
                weight: bestSet.weight,
                reps: bestSet.reps,
                setNumber: bestSet.setNumber
              }
            });
          } else {
            logger.log('  🎉 First time 1RM recorded (not counted as PR)');
          }
          
          logger.log('  📝 Scheduled for update:', highest1RM);
        } else {
          logger.log('  ⏭️ New 1RM not higher - no update needed');
        }
      }
      
      logger.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      logger.log('📊 Update Summary:');
      logger.log('  - Exercises processed:', exercises.length);
      logger.log('  - Estimates to update:', Object.keys(updates).length);
      logger.log('  - History entries to add:', historyUpdates.length);
      logger.log('  - Personal records achieved:', personalRecords.length);
      
      // Apply updates if any
      if (Object.keys(updates).length > 0) {
        logger.log('💾 Updating main document...');
        const userDocRef = doc(firestore, 'users', userId);
        await updateDoc(userDocRef, updates);
        logger.log('✅ Main document updated');
        
        // Add history entries
        logger.log('📚 Adding history entries...');
        for (const historyEntry of historyUpdates) {
          await this.addToHistory(
            userId,
            historyEntry.libraryId,
            historyEntry.exerciseName,
            historyEntry.estimate
          );
        }
        logger.log('✅ History entries added');
      } else {
        logger.log('ℹ️ No updates needed');
      }
      
      logger.log('🎉 updateEstimatesAfterSession: Complete!');
      logger.log('🏆 Returning', personalRecords.length, 'personal records');
      
      return personalRecords; // Return PRs for display
      
    } catch (error) {
      logger.error('❌ updateEstimatesAfterSession: Error:', error);
      // Don't throw - we don't want to block session completion
      return []; // Return empty array on error
    }
  }
  
  /**
   * Add a 1RM estimate to history
   * @param {string} userId - User ID
   * @param {string} libraryId - Exercise library ID
   * @param {string} exerciseName - Exercise name
   * @param {number} estimate - 1RM estimate
   */
  async addToHistory(userId, libraryId, exerciseName, estimate) {
    try {
      const exerciseKey = `${libraryId}_${exerciseName}`;
      logger.log('📚 addToHistory: Adding entry for', exerciseKey);
      
      const historyRef = collection(
        firestore,
        'users',
        userId,
        'oneRepMaxHistory',
        exerciseKey,
        'records'
      );
      
      await addDoc(historyRef, {
        estimate: estimate,
        date: serverTimestamp()
      });
      
      logger.log('✅ addToHistory: Entry added:', estimate);
    } catch (error) {
      logger.error('❌ addToHistory: Error:', error);
    }
  }
  
  /**
   * Reset (delete) a 1RM estimate for an exercise
   * @param {string} userId - User ID
   * @param {string} exerciseKey - Exercise key (libraryId_exerciseName)
   */
  async resetEstimate(userId, exerciseKey) {
    try {
      logger.log('🔄 resetEstimate: Resetting estimate for', exerciseKey);
      
      const userDocRef = doc(firestore, 'users', userId);
      
      await updateDoc(userDocRef, {
        [`oneRepMaxEstimates.${exerciseKey}`]: deleteField()
      });
      
      logger.log('✅ resetEstimate: Estimate deleted successfully');
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
  async getHistoryForExercise(userId, libraryId, exerciseName) {
    try {
      const exerciseKey = `${libraryId}_${exerciseName}`;
      logger.log('📖 getHistoryForExercise: Fetching history for', exerciseKey);
      
      const historyRef = collection(
        firestore,
        'users',
        userId,
        'oneRepMaxHistory',
        exerciseKey,
        'records'
      );
      
      const q = query(historyRef, orderBy('date', 'asc'), limit(20));
      const snapshot = await getDocs(q);
      
      const history = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      logger.log('✅ getHistoryForExercise: Found', history.length, 'entries');
      return history;
    } catch (error) {
      logger.error('❌ getHistoryForExercise: Error:', error);
      return [];
    }
  }
}

export default new OneRepMaxService();

