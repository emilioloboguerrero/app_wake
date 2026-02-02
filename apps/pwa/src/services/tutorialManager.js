import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { firestore } from '../config/firebase';

import logger from '../utils/logger.js';
class TutorialManager {
  /**
   * Check if user needs to see tutorials for a specific screen
   * @param {string} userId - User ID
   * @param {string} screenName - Screen name (mainScreen, library, etc.)
   * @param {string} programId - Program ID (for program-specific tutorials)
   * @returns {Promise<Array>} Array of tutorial URLs to show
   */
  async getTutorialsForScreen(userId, screenName, programId = null) {
    try {
      logger.log('🎬 Getting tutorials for:', { userId, screenName, programId });

      if (programId) {
        // Program-specific tutorials
        return await this.getProgramTutorials(userId, programId, screenName);
      } else {
        // General app tutorials
        return await this.getGeneralTutorials(userId, screenName);
      }
    } catch (error) {
      logger.error('❌ Error getting tutorials:', error);
      return [];
    }
  }

  /**
   * Get program-specific tutorials
   */
  async getProgramTutorials(userId, programId, screenName) {
    try {
      // Get user document
      const userDoc = await getDoc(doc(firestore, 'users', userId));
      if (!userDoc.exists()) {
        logger.log('❌ User document not found');
        return [];
      }

      const userData = userDoc.data();
      const courses = userData.courses || {};
      const programData = courses[programId];

      if (!programData) {
        logger.log('❌ Program not found in user courses');
        return [];
      }

      // Get program document
      const programDoc = await getDoc(doc(firestore, 'courses', programId));
      if (!programDoc.exists()) {
        logger.log('❌ Program document not found');
        return [];
      }

      const programDetails = programDoc.data();
      const tutorials = programDetails.tutorials || {};
      const screenTutorials = tutorials[screenName] || [];

      // Check which tutorials user has already completed
      const completedTutorials = programData.completedTutorials?.[screenName] || [];
      
      // Filter out completed tutorials and empty/invalid URLs
      const validTutorials = screenTutorials.filter(url => 
        url && 
        typeof url === 'string' && 
        url.trim() !== ''
      );
      
      const newTutorials = validTutorials.filter(url => !completedTutorials.includes(url));

      logger.log('📚 Program tutorials found:', {
        screenName,
        total: screenTutorials.length,
        valid: validTutorials.length,
        completed: completedTutorials.length,
        new: newTutorials.length
      });

      return newTutorials.map(url => ({ videoUrl: url }));
    } catch (error) {
      logger.error('❌ Error getting program tutorials:', error);
      return [];
    }
  }

  /**
   * Get general app tutorials
   */
  async getGeneralTutorials(userId, screenName) {
    try {
      // Get user document
      const userDoc = await getDoc(doc(firestore, 'users', userId));
      if (!userDoc.exists()) {
        logger.log('❌ User document not found');
        return [];
      }

      const userData = userDoc.data();
      const generalTutorials = userData.generalTutorials || {};

      // Check if user has already seen this screen's tutorial
      if (generalTutorials[screenName]) {
        logger.log('✅ User already saw general tutorial for:', screenName);
        return [];
      }

      // Get general tutorials from app_resources
      const appResourcesDoc = await getDoc(doc(firestore, 'app_resources', 'tutorials'));
      if (!appResourcesDoc.exists()) {
        logger.log('❌ App resources document not found');
        return [];
      }

      const appResources = appResourcesDoc.data();
      const generalTutorialsData = appResources.general || {};
      const screenTutorials = generalTutorialsData[screenName] || [];

      // Filter out empty/invalid URLs
      const validTutorials = screenTutorials.filter(url => 
        url && 
        typeof url === 'string' && 
        url.trim() !== ''
      );

      logger.log('📚 General tutorials found:', {
        screenName,
        total: screenTutorials.length,
        valid: validTutorials.length
      });

      return validTutorials.map(url => ({ videoUrl: url }));
    } catch (error) {
      logger.error('❌ Error getting general tutorials:', error);
      return [];
    }
  }

  /**
   * Mark tutorial as completed
   * @param {string} userId - User ID
   * @param {string} screenName - Screen name
   * @param {string} videoUrl - Video URL that was completed
   * @param {string} programId - Program ID (for program-specific tutorials)
   */
  async markTutorialCompleted(userId, screenName, videoUrl, programId = null) {
    try {
      logger.log('✅ Marking tutorial as completed:', { userId, screenName, videoUrl, programId });

      if (programId) {
        // Mark program-specific tutorial as completed
        await this.markProgramTutorialCompleted(userId, programId, screenName, videoUrl);
      } else {
        // Mark general tutorial as completed
        await this.markGeneralTutorialCompleted(userId, screenName);
      }
    } catch (error) {
      logger.error('❌ Error marking tutorial as completed:', error);
    }
  }

  /**
   * Mark program-specific tutorial as completed
   */
  async markProgramTutorialCompleted(userId, programId, screenName, videoUrl) {
    const userRef = doc(firestore, 'users', userId);
    const userDoc = await getDoc(userRef);
    
    if (!userDoc.exists()) return;

    const userData = userDoc.data();
    const courses = { ...userData.courses };
    const programData = { ...courses[programId] };
    
    // Initialize completedTutorials if it doesn't exist
    if (!programData.completedTutorials) {
      programData.completedTutorials = {
        dailyWorkout: [],
        warmup: [],
        workoutExecution: [],
        workoutCompletion: []
      };
    }

    // Add video URL to completed tutorials for this screen
    if (!programData.completedTutorials[screenName]) {
      programData.completedTutorials[screenName] = [];
    }
    
    if (!programData.completedTutorials[screenName].includes(videoUrl)) {
      programData.completedTutorials[screenName].push(videoUrl);
    }

    courses[programId] = programData;

    await updateDoc(userRef, { courses });
    logger.log('✅ Program tutorial marked as completed');
  }

  /**
   * Mark general tutorial as completed
   */
  async markGeneralTutorialCompleted(userId, screenName) {
    const userRef = doc(firestore, 'users', userId);
    const userDoc = await getDoc(userRef);
    
    if (!userDoc.exists()) return;

    const userData = userDoc.data();
    const generalTutorials = { ...userData.generalTutorials };

    // Mark this screen's tutorial as completed
    generalTutorials[screenName] = true;

    await updateDoc(userRef, { generalTutorials });
    logger.log('✅ General tutorial marked as completed');
  }

  /**
   * Check if user has completed all tutorials for a screen
   * @param {string} userId - User ID
   * @param {string} screenName - Screen name
   * @param {string} programId - Program ID (optional)
   * @returns {Promise<boolean>} True if all tutorials completed
   */
  async hasCompletedAllTutorials(userId, screenName, programId = null) {
    try {
      const tutorials = await this.getTutorialsForScreen(userId, screenName, programId);
      return tutorials.length === 0;
    } catch (error) {
      logger.error('❌ Error checking tutorial completion:', error);
      return false;
    }
  }
}

export default new TutorialManager();
