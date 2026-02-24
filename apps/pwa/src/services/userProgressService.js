// User Progress Service - Manages course progress in user document
import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { firestore } from '../config/firebase';
import logger from '../utils/logger.js';

class UserProgressService {
  /**
   * Get course progress from user document
   */
  async getCourseProgress(userId, courseId) {
    try {
      logger.log('📊 Getting course progress:', { userId, courseId });
      
      const userDocRef = doc(firestore, 'users', userId);
      const userDoc = await getDoc(userDocRef);
      
      if (!userDoc.exists()) {
        logger.log('❌ User document not found');
        return null;
      }
      
      const userData = userDoc.data();
      const courseProgress = userData.courseProgress?.[courseId];
      
      logger.log('✅ Course progress retrieved');
      return courseProgress || null;
    } catch (error) {
      logger.error('❌ Error getting course progress:', error);
      return null;
    }
  }
  
  /**
   * Update course progress in user document
   */
  async updateCourseProgress(userId, courseId, progressData) {
    try {
      logger.log('📈 Updating course progress:', { userId, courseId });
      
      const userDocRef = doc(firestore, 'users', userId);
      
      // Update course progress field
      await updateDoc(userDocRef, {
        [`courseProgress.${courseId}`]: {
          ...progressData,
          lastActivity: new Date().toISOString()
        }
      });
      
      logger.log('✅ Course progress updated');
    } catch (error) {
      logger.error('❌ Error updating course progress:', error);
      throw error;
    }
  }
  
  /**
   * Update last session performed
   */
  async updateLastSessionPerformed(userId, courseId, sessionId, sessionData) {
    try {
      logger.log('💾 Updating last session performed:', { userId, courseId, sessionId });
      
      const userDocRef = doc(firestore, 'users', userId);
      
      await updateDoc(userDocRef, {
        [`courseProgress.${courseId}.lastSessionPerformed.${sessionId}`]: sessionData
      });
      
      logger.log('✅ Last session performed updated');
    } catch (error) {
      logger.error('❌ Error updating last session performed:', error);
      throw error;
    }
  }
  
  /**
   * Get all course progress for user
   */
  async getAllCourseProgress(userId) {
    try {
      logger.log('📊 Getting all course progress for user:', userId);
      
      const userDocRef = doc(firestore, 'users', userId);
      const userDoc = await getDoc(userDocRef);
      
      if (!userDoc.exists()) {
        logger.log('❌ User document not found');
        return {};
      }
      
      const userData = userDoc.data();
      const courseProgress = userData.courseProgress || {};
      
      logger.log('✅ All course progress retrieved');
      return courseProgress;
    } catch (error) {
      logger.error('❌ Error getting all course progress:', error);
      return {};
    }
  }
}

export default new UserProgressService();
