// Course service for Wake Web Dashboard
import { firestore } from '../config/firebase';
import { 
  collection, 
  query, 
  where, 
  getDocs, 
  orderBy 
} from 'firebase/firestore';
import { getUser } from './firestoreService';

/**
 * Get all available courses for a user
 * Filters courses based on user role:
 * - Admins: see all courses
 * - Creators: see published + their own courses
 * - Users: see only published courses
 * @param {string} userId - User ID (optional for non-authenticated users)
 * @returns {Promise<Array>} Array of available courses
 */
export const getAvailableCourses = async (userId = null) => {
  try {
    // Get user role if userId provided
    let userRole = 'user'; // Default
    if (userId) {
      const userDoc = await getUser(userId);
      userRole = userDoc?.role || 'user';
    }
    
    // Get all courses from Firestore
    const coursesRef = collection(firestore, 'courses');
    const coursesSnapshot = await getDocs(coursesRef);
    
    const allCourses = coursesSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    // Filter courses based on user role
    const filteredCourses = allCourses.filter(course => {
      const courseStatus = course.status || course.estado; // Support both field names
      
      // Admins see everything
      if (userRole === 'admin') {
        return true;
      }
      
      // Creators see published + their own courses
      if (userRole === 'creator') {
        const isPublished = courseStatus === 'publicado' || courseStatus === 'published';
        const isOwnCourse = course.creator_id === userId;
        return isPublished || isOwnCourse;
      }
      
      // Regular users see only published courses
      const isPublished = courseStatus === 'publicado' || courseStatus === 'published';
      return isPublished || !courseStatus; // Backward compatibility: show if no status set
    });
    
    // Sort by creation date (newest first)
    const sortedCourses = filteredCourses.sort((a, b) => {
      const aDate = a.created_at?.toDate?.() || a.created_at || new Date(0);
      const bDate = b.created_at?.toDate?.() || b.created_at || new Date(0);
      const aTime = aDate instanceof Date ? aDate.getTime() : new Date(aDate).getTime();
      const bTime = bDate instanceof Date ? bDate.getTime() : new Date(bDate).getTime();
      return bTime - aTime;
    });
    
    // Transform to include creator name for display
    const coursesWithCreator = sortedCourses.map(course => ({
      ...course,
      creatorName: course.creatorName || course.creator_name || 'Unknown Creator',
      creator_name: course.creator_name || course.creatorName || 'Unknown Creator',
    }));
    
    return coursesWithCreator;
  } catch (error) {
    console.error('Error fetching available courses:', error);
    throw error;
  }
};