// Firestore service for Wake
import { firestore } from '../config/firebase';
import { 
  doc, 
  setDoc, 
  getDoc, 
  updateDoc, 
  deleteDoc,
  collection, 
  query, 
  where, 
  orderBy, 
  limit, 
  getDocs, 
  addDoc, 
  serverTimestamp,
  writeBatch
} from 'firebase/firestore';
import { getMondayWeek } from '../utils/weekCalculation';

// Helper function to remove undefined values from an object recursively
function removeUndefinedValues(obj) {
  if (obj === null || obj === undefined) {
    return obj;
  }
  
  if (Array.isArray(obj)) {
    return obj.map(item => removeUndefinedValues(item)).filter(item => item !== undefined);
  }
  
  if (typeof obj === 'object') {
    const cleaned = {};
    for (const [key, value] of Object.entries(obj)) {
      if (value !== undefined) {
        cleaned[key] = removeUndefinedValues(value);
      }
    }
    return cleaned;
  }
  
  return obj;
}

class FirestoreService {
  // Users collection operations
  async createUser(userId, userData) {
    try {
      await setDoc(doc(firestore, 'users', userId), {
        ...userData,
        role: userData.role || 'user',        // Default to 'user' if not specified
        created_at: serverTimestamp()
      });
    } catch (error) {
      throw error;
    }
  }

  async getUser(userId) {
    try {
      const userDoc = await getDoc(doc(firestore, 'users', userId));
      return userDoc.exists() ? userDoc.data() : null;
    } catch (error) {
      // Handle offline/network errors gracefully
      if (error.code === 'unavailable' || error.message.includes('offline')) {
        console.log('📱 Device is offline, throwing offline error for caller cache handling');
        const offlineError = new Error('Firestore unavailable offline');
        offlineError.code = 'offline';
        throw offlineError;
      }
      throw error;
    }
  }

  async updateUser(userId, userData) {
    try {
      await updateDoc(doc(firestore, 'users', userId), userData);
    } catch (error) {
      throw error;
    }
  }

  // Progress tracking methods
  async createProgressEntry(userId, progressData) {
    try {
      const progressRef = collection(firestore, 'users', userId, 'progress');
      const docRef = await addDoc(progressRef, {
        ...progressData,
        updated_at: serverTimestamp()
      });
      return docRef.id;
    } catch (error) {
      console.error('Error creating progress entry:', error);
      throw error;
    }
  }

  async updateProgressEntry(userId, progressId, progressData) {
    try {
      const progressRef = doc(firestore, 'users', userId, 'progress', progressId);
      await updateDoc(progressRef, {
        ...progressData,
        updated_at: serverTimestamp()
      });
    } catch (error) {
      console.error('Error updating progress entry:', error);
      throw error;
    }
  }

  async getUserProgress(userId, courseId = null) {
    try {
      let progressQuery = collection(firestore, 'users', userId, 'progress');
      
      if (courseId) {
        progressQuery = query(progressQuery, where('course_id', '==', courseId));
      }
      
      const progressSnapshot = await getDocs(progressQuery);
      return progressSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
    } catch (error) {
      console.error('Error getting user progress:', error);
      throw error;
    }
  }

  /**
   * Get user's progress sessions for a specific course
   */
  async getUserCourseProgress(userId, courseId, limit = 50) {
    try {
      
      const progressQuery = query(
        collection(firestore, 'progress'),
        where('user_id', '==', userId),
        where('course_id', '==', courseId),
        orderBy('completed_at', 'desc'),
        limit(limit)
      );
      
      const snapshot = await getDocs(progressQuery);
      const sessions = [];
      
      snapshot.forEach(doc => {
        sessions.push({
          id: doc.id,
          ...doc.data()
        });
      });
      
      return sessions;
    } catch (error) {
      console.error('❌ Error getting user course progress:', error);
      return [];
    }
  }

  /**
   * Create a new progress session document
   * Document ID: {userId}_{courseId}_{sessionId}
   */
  async createProgressSession(sessionData) {
    try {
      
      // Clean the data to remove undefined values
      const cleanSessionData = removeUndefinedValues(sessionData);
      
      // Create document ID: userId_courseId_sessionId
      const docId = `${sessionData.user_id}_${sessionData.course_id}_${sessionData.session_id}`;
      
      const progressRef = doc(firestore, 'progress', docId);
      await setDoc(progressRef, {
        ...cleanSessionData,
        created_at: serverTimestamp(),
        updated_at: serverTimestamp()
      });
      
      return docId;
    } catch (error) {
      console.error('❌ Error creating progress session:', error);
      throw error;
    }
  }


  /**
   * Get a specific progress session by ID
   */
  async getProgressSession(sessionId) {
    try {
      console.log('📊 Getting progress session:', sessionId);
      
      const progressRef = doc(firestore, 'progress', sessionId);
      const docSnap = await getDoc(progressRef);
      
      if (docSnap.exists()) {
        const sessionData = {
          id: docSnap.id,
          ...docSnap.data()
        };
        console.log('✅ Progress session found');
        return sessionData;
      } else {
        console.log('❌ Progress session not found');
        return null;
      }
    } catch (error) {
      console.error('❌ Error getting progress session:', error);
      return null;
    }
  }

  async getCourseModules(courseId) {
    try {
      // First, get course to check if it's weekly
      const courseData = await this.getCourse(courseId);
      const isWeeklyProgram = courseData?.weekly === true;
      
      let modulesQuery;
      
      if (isWeeklyProgram) {
        // ✅ Weekly program: Filter by current calendar week
        const currentWeek = getMondayWeek(); // "2025-W03"
        
        console.log('📅 Filtering weekly program by week:', currentWeek);
        
        modulesQuery = query(
          collection(firestore, 'courses', courseId, 'modules'),
          where('week', '==', currentWeek), // ✅ Only current week's modules
          orderBy('order', 'asc')
        );
      } else {
        // ✅ Normal program: Download all modules (existing behavior)
        modulesQuery = query(
          collection(firestore, 'courses', courseId, 'modules'),
          orderBy('order', 'asc') // No week filter
        );
      }
      
      const modulesSnapshot = await getDocs(modulesQuery);
      
      if (isWeeklyProgram && modulesSnapshot.empty) {
        console.warn('⚠️ No modules found for current week:', currentWeek);
        // Could return empty array or show message to user
      }
      
      // OPTIMIZED: Fetch all modules in parallel instead of sequential
      const modules = await Promise.all(
        modulesSnapshot.docs.map(async (moduleDoc) => {
          const moduleData = { id: moduleDoc.id, ...moduleDoc.data() };
          
          // Get sessions for this module
          try {
            const sessionsQuery = query(
              collection(firestore, 'courses', courseId, 'modules', moduleDoc.id, 'sessions'),
              orderBy('order', 'asc')
            );
            const sessionsSnapshot = await getDocs(sessionsQuery);
            
            // OPTIMIZED: Fetch all sessions in parallel
            const sessions = await Promise.all(
              sessionsSnapshot.docs.map(async (sessionDoc) => {
                const sessionData = { id: sessionDoc.id, ...sessionDoc.data() };
                
                // Get exercises for this session
                try {
                  const exercisesQuery = query(
                    collection(firestore, 'courses', courseId, 'modules', moduleDoc.id, 'sessions', sessionDoc.id, 'exercises'),
                    orderBy('order', 'asc')
                  );
                  const exercisesSnapshot = await getDocs(exercisesQuery);
                  
                  // OPTIMIZED: Fetch all exercises in parallel
                  const exercises = await Promise.all(
                    exercisesSnapshot.docs.map(async (exerciseDoc) => {
                      const exerciseData = { id: exerciseDoc.id, ...exerciseDoc.data() };
                      
                      // Get sets for this exercise
                      try {
                        const setsQuery = query(
                          collection(firestore, 'courses', courseId, 'modules', moduleDoc.id, 'sessions', sessionDoc.id, 'exercises', exerciseDoc.id, 'sets'),
                          orderBy('order', 'asc')
                        );
                        const setsSnapshot = await getDocs(setsQuery);
                        
                        const sets = setsSnapshot.docs.map(setDoc => ({
                          id: setDoc.id,
                          ...setDoc.data()
                        }));
                        
                        exerciseData.sets = sets;
                      } catch (error) {
                        console.warn(`No sets found for exercise ${exerciseDoc.id}:`, error.message);
                        exerciseData.sets = [];
                      }
                      
                      return exerciseData;
                    })
                  );
                  
                  sessionData.exercises = exercises;
                } catch (error) {
                  console.warn(`No exercises found for session ${sessionDoc.id}:`, error.message);
                  sessionData.exercises = [];
                }
                
                return sessionData;
              })
            );
            
            moduleData.sessions = sessions;
          } catch (error) {
            console.warn(`No sessions found for module ${moduleDoc.id}:`, error.message);
            moduleData.sessions = [];
          }
          
          return moduleData;
        })
      );
      
      return modules;
    } catch (error) {
      console.error('Error in getCourseModules:', error);
      throw error;
    }
  }

  // Simple course management in user document (simplified)
  async addCourseToUser(userId, courseId, expirationDate, accessDuration, courseDetails) {
    try {
      const userRef = doc(firestore, 'users', userId);
      const userDoc = await getDoc(userRef);
      
      if (userDoc.exists()) {
        const userData = userDoc.data();
        const courses = userData.courses || {};
        
        // Store course entry (simplified - minimal fields)
        courses[courseId] = {
          // Access control
          access_duration: accessDuration,
          expires_at: expirationDate,
          status: 'active',
          purchased_at: new Date().toISOString(),
          
          // Minimal cached data for display
          title: courseDetails?.title || 'Untitled Course',
          image_url: courseDetails?.image_url || null,
          discipline: courseDetails?.discipline || 'General',
          creatorName: courseDetails?.creatorName || courseDetails?.creator_name || 'Unknown Creator',
          
          // Tutorial completion tracking
          completedTutorials: {
            dailyWorkout: [],
            warmup: [],
            workoutExecution: [],
            workoutCompletion: []
          }
        };
        
        console.log('💾 Storing course in user document:', courses[courseId]);
        
        await updateDoc(userRef, {
          courses: courses,
          // Keep legacy field for compatibility
          purchased_courses: [...new Set([...(userData.purchased_courses || []), courseId])]
        });
        
        console.log('✅ Course added to user document successfully');
      }
    } catch (error) {
      console.error('❌ Error in addCourseToUser:', error);
      throw error;
    }
  }

  /**
   * Start a free trial for a course by assigning it locally to the user
   * @param {string} userId - User ID
   * @param {string} courseId - Course ID
   * @param {Object} courseDetails - Course metadata
   * @param {number} durationInDays - Trial duration in days
   * @returns {Promise<Object>} Result of the assignment
   */
  async startTrialForCourse(userId, courseId, courseDetails, durationInDays) {
    try {
      if (!durationInDays || durationInDays <= 0) {
        return {
          success: false,
          error: 'Duración de prueba inválida',
          code: 'INVALID_TRIAL_DURATION',
        };
      }

      const userRef = doc(firestore, 'users', userId);
      const userDoc = await getDoc(userRef);

      if (!userDoc.exists()) {
        return {
          success: false,
          error: 'Usuario no encontrado',
          code: 'USER_NOT_FOUND',
        };
      }

      const now = new Date();
      const expirationDate = new Date(now.getTime() + durationInDays * 24 * 60 * 60 * 1000);

      const userData = userDoc.data();
      const courses = { ...(userData.courses || {}) };
      const trialHistory = { ...(userData.free_trial_history || {}) };

      if (trialHistory[courseId]?.consumed) {
        return {
          success: false,
          error: 'Ya usaste la prueba gratuita de este programa',
          code: 'TRIAL_ALREADY_CONSUMED',
        };
      }

      const existingCourse = courses[courseId];
      if (existingCourse?.is_trial) {
        const existingExpiration = existingCourse.trial_expires_at || existingCourse.expires_at;
        if (existingExpiration && new Date(existingExpiration) > now) {
          return {
            success: false,
            error: 'Ya tienes una prueba activa para este programa',
            code: 'TRIAL_ALREADY_ACTIVE',
          };
        }
      }

      const displayCreator =
        courseDetails?.creatorName ||
        courseDetails?.creator_name ||
        existingCourse?.creatorName ||
        existingCourse?.creator_name ||
        'Unknown Creator';

      courses[courseId] = {
        ...existingCourse,
        access_duration: `${durationInDays}_days_trial`,
        expires_at: expirationDate.toISOString(),
        trial_expires_at: expirationDate.toISOString(),
        trial_started_at: now.toISOString(),
        status: 'active',
        is_trial: true,
        trial_duration_days: durationInDays,
        trial_state: 'active',
        purchased_at: existingCourse?.purchased_at || now.toISOString(),
        title: courseDetails?.title || existingCourse?.title || 'Untitled Course',
        image_url: courseDetails?.image_url || existingCourse?.image_url || null,
        discipline: courseDetails?.discipline || existingCourse?.discipline || 'General',
        creatorName: displayCreator,
        completedTutorials: existingCourse?.completedTutorials || {
          dailyWorkout: [],
          warmup: [],
          workoutExecution: [],
          workoutCompletion: [],
        },
      };

      trialHistory[courseId] = {
        consumed: true,
        last_started_at: now.toISOString(),
        last_expires_at: expirationDate.toISOString(),
      };

      await updateDoc(userRef, {
        courses,
        free_trial_history: trialHistory,
      });

      return {
        success: true,
        expirationDate: expirationDate.toISOString(),
      };
    } catch (error) {
      console.error('❌ Error starting trial for course:', error);
      return {
        success: false,
        error: error.message || 'Error al iniciar la prueba gratuita',
        code: 'TRIAL_ERROR',
      };
    }
  }

  async removeCourseFromUser(userId, courseId) {
    try {
      console.log('🗑️ Removing course from user:', userId, courseId);
      
      const userRef = doc(firestore, 'users', userId);
      const userDoc = await getDoc(userRef);
      
      if (!userDoc.exists()) {
        throw new Error('User document not found');
      }
      
      const userData = userDoc.data();
      const courses = userData.courses || {};
      
      // Remove the course from the courses object
      delete courses[courseId];
      
      // Update the user document
      await updateDoc(userRef, {
        courses: courses
      });
      
      console.log('✅ Course removed from user:', courseId);
    } catch (error) {
      console.error('❌ Error removing course from user:', error);
      throw error;
    }
  }

  async getUserActiveCourses(userId) {
    try {
      console.log('🔍 Getting user courses:', userId);
      const userDoc = await getDoc(doc(firestore, 'users', userId));
      
      if (!userDoc.exists()) {
        return [];
      }

      const userData = userDoc.data();
      const userCourses = userData.courses || {};
      const now = new Date();
      const trialHistory = userData.free_trial_history || {};
      
      // Filter active courses and return with embedded course data (no additional queries!)
      console.log('🔍 Filtering courses from user document...');
      console.log('📊 Total courses in user document:', Object.keys(userCourses).length);
      
      const activeCourses = Object.entries(userCourses)
        .filter(([courseId, courseData]) => {
          const isActive = courseData.status === 'active';
          const expiresAt = courseData.expires_at ? new Date(courseData.expires_at) : null;
          const isNotExpired = !expiresAt || expiresAt > now;
          const isTrial = courseData.is_trial === true;
          
          console.log(`📋 Course ${courseId}:`, {
            status: courseData.status,
            expires_at: courseData.expires_at,
            isActive,
            isNotExpired,
            isTrial,
            willInclude: (isActive && isNotExpired) || isTrial
          });
          
          if (isTrial) {
            return true;
          }

          return isActive && isNotExpired;
        })
        .map(([courseId, courseData]) => {
          const isTrial = courseData.is_trial === true;
          const trialEntry = trialHistory[courseId];
          const trialExpiresAt = courseData.trial_expires_at ||
            trialEntry?.last_expires_at ||
            courseData.expires_at;
          const trialState = isTrial
            ? (trialExpiresAt && new Date(trialExpiresAt) > now ? 'active' : 'expired')
            : null;

          console.log(`✅ Including course ${courseId} in active list`);
          return {
            courseId,
            courseData,
            purchasedAt: courseData.purchased_at || null,
            // Use embedded course data (already in user document!)
            courseDetails: {
              id: courseId,
              title: courseData.title || 'Curso sin título',
              image_url: courseData.image_url || '',
              discipline: courseData.discipline || 'General', 
              difficulty: courseData.difficulty || 'Intermedio',
              duration: courseData.duration || 'No especificada',
              description: courseData.description || 'Descripción no disponible',
              creatorName: courseData.creatorName || courseData.creator_name || null
            },
            trialInfo: isTrial ? {
              state: trialState,
              expiresAt: trialExpiresAt || null,
            } : null,
            trialHistory: trialEntry || null,
            isTrialCourse: isTrial,
          };
        });
      
      console.log('✅ Active courses (single query):', activeCourses.length);
      return activeCourses;
    } catch (error) {
      console.error('Error getting user active courses:', error);
      return [];
    }
  }

  // Simple method to update course status (for subscription management)
  async updateCourseStatus(userId, courseId, status, newExpirationDate = null) {
    try {
      const userRef = doc(firestore, 'users', userId);
      const userDoc = await getDoc(userRef);
      
      if (userDoc.exists()) {
        const userData = userDoc.data();
        const courses = userData.courses || {};
        
        if (courses[courseId]) {
          courses[courseId].status = status;
          
          // Update expiration date if provided (for subscription renewals)
          if (newExpirationDate) {
            courses[courseId].expires_at = newExpirationDate;
          }
          
          // Add timestamp for status change
          courses[courseId].status_updated_at = new Date().toISOString();
          
          // Clean up any undefined values before saving
          const cleanedCourses = {};
          Object.keys(courses).forEach(key => {
            const course = courses[key];
            cleanedCourses[key] = {};
            Object.keys(course).forEach(field => {
              if (course[field] !== undefined) {
                cleanedCourses[key][field] = course[field];
              }
            });
          });
          
          await updateDoc(userRef, { courses: cleanedCourses });
          
          console.log(`✅ Updated course ${courseId} status to ${status}`);
          return true;
        }
      }
      return false;
    } catch (error) {
      console.error('Error updating course status:', error);
      return false;
    }
  }

  // Simple method to extend subscription
  async extendCourseSubscription(userId, courseId, newExpirationDate) {
    try {
      return await this.updateCourseStatus(userId, courseId, 'active', newExpirationDate);
    } catch (error) {
      console.error('Error extending course subscription:', error);
      return false;
    }
  }

  // Simple method to cancel subscription
  async cancelCourseSubscription(userId, courseId) {
    try {
      return await this.updateCourseStatus(userId, courseId, 'cancelled');
    } catch (error) {
      console.error('Error cancelling course subscription:', error);
      return false;
    }
  }

  // Courses collection operations (with role-based filtering)
  async getCourses(userId = null) {
    try {
      console.log('🔍 Getting courses for user:', userId);
      
      // Get user role if userId provided
      let userRole = 'user'; // Default
      if (userId) {
        const userDoc = await getDoc(doc(firestore, 'users', userId));
        userRole = userDoc.data()?.role || 'user';
        console.log('👤 User role:', userRole);
      }
      
      // Get all courses (no server-side filtering)
      const coursesSnapshot = await getDocs(collection(firestore, 'courses'));
      const allCourses = coursesSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      console.log('📊 Total courses in database:', allCourses.length);
      
      // Filter based on user role (client-side)
      const filteredCourses = allCourses.filter(course => {
        const courseStatus = course.status || course.estado; // Support both field names
        console.log(`🔍 Filtering course: ${course.title}, status: ${courseStatus}, creator_id: ${course.creator_id}`);
        
        // Admins see everything
        if (userRole === 'admin') {
          console.log('  → Admin: SHOW');
          return true;
        }
        
        // Creators see published + their own
        if (userRole === 'creator') {
          const isPublished = courseStatus === 'publicado' || courseStatus === 'published';
          const isOwnCourse = course.creator_id === userId;
          console.log(`  → Creator: isPublished=${isPublished}, isOwnCourse=${isOwnCourse}`);
          return isPublished || isOwnCourse;
        }
        
        // Regular users see only published
        const isPublished = courseStatus === 'publicado' || courseStatus === 'published';
        const shouldShow = isPublished || !courseStatus; // Backward compatibility
        console.log(`  → User: shouldShow=${shouldShow}, status=${courseStatus}`);
        return shouldShow;
      });
      
      // Sort by creation date (newest first)
      const sortedCourses = filteredCourses.sort((a, b) => {
        const aDate = a.created_at?.toDate?.() || new Date(0);
        const bDate = b.created_at?.toDate?.() || new Date(0);
        return bDate - aDate;
      });
      
      console.log('✅ Filtered courses for role', userRole, ':', sortedCourses.length);
      return sortedCourses;
      
    } catch (error) {
      console.error('❌ Error in getCourses:', error);
      throw error;
    }
  }

  async getCourse(courseId) {
    try {
      console.log('🔍 FirestoreService: Getting course with ID:', courseId);
      const courseDoc = await getDoc(doc(firestore, 'courses', courseId));
      console.log('🔍 FirestoreService: Course document exists:', courseDoc.exists());
      
      if (courseDoc.exists()) {
        const courseData = { id: courseDoc.id, ...courseDoc.data() };
        console.log('✅ FirestoreService: Course data:', courseData);
        return courseData;
      } else {
        console.log('❌ FirestoreService: Course not found in database');
        return null;
      }
    } catch (error) {
      console.error('❌ FirestoreService: Error getting course:', error);
      throw error;
    }
  }

  // Purchase logging operations
  async createPurchaseLog(purchaseData) {
    try {
      console.log('📝 Creating purchase log...', purchaseData);
      const docRef = await addDoc(collection(firestore, 'purchases'), purchaseData);
      console.log('✅ Purchase log created with ID:', docRef.id);
      return docRef.id;
    } catch (error) {
      console.error('❌ Error creating purchase log:', error);
      throw error;
    }
  }

  // Progress collection operations
  async saveProgress(userId, courseId, lessonId, progressData) {
    try {
      await addDoc(collection(firestore, 'users', userId, 'progress'), {
        course_id: courseId,
        lesson_id: lessonId,
        ...progressData,
        updated_at: serverTimestamp()
      });
    } catch (error) {
      throw error;
    }
  }

  async getUserProgress(userId) {
    try {
      const progressQuery = query(
        collection(firestore, 'users', userId, 'progress'),
        orderBy('updated_at', 'desc')
      );
      const progressSnapshot = await getDocs(progressQuery);
      
      return progressSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
    } catch (error) {
      throw error;
    }
  }

  // Community collection operations
  async getCommunityPosts() {
    try {
      const postsQuery = query(
        collection(firestore, 'community'),
        orderBy('created_at', 'desc'),
        limit(20)
      );
      const postsSnapshot = await getDocs(postsQuery);
      
      return postsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
    } catch (error) {
      throw error;
    }
  }

  async createCommunityPost(userId, postData) {
    try {
      await addDoc(collection(firestore, 'community'), {
        user_id: userId,
        ...postData,
        created_at: serverTimestamp(),
        likes_count: 0
      });
    } catch (error) {
      throw error;
    }
  }

  // Version System Methods
  /**
   * Update user course version status
   */
  async updateUserCourseVersionStatus(userId, courseId, statusData) {
    try {
      console.log('🔄 Updating user course version status:', userId, courseId, statusData);
      
      // Build update object conditionally to avoid undefined values
      const updateData = {
        [`courses.${courseId}.update_status`]: statusData.update_status,
        [`courses.${courseId}.last_version_check`]: serverTimestamp()
      };
      
      // Only include downloaded_version if it's provided
      if (statusData.downloaded_version !== undefined) {
        updateData[`courses.${courseId}.downloaded_version`] = statusData.downloaded_version;
      }
      
      // Only include lastUpdated if it's provided
      if (statusData.lastUpdated !== undefined) {
        updateData[`courses.${courseId}.lastUpdated`] = statusData.lastUpdated;
      }
      
      await updateDoc(doc(firestore, 'users', userId), updateData);
      console.log('✅ User course version status updated');
    } catch (error) {
      console.error('❌ Error updating user course version status:', error);
      throw error;
    }
  }

  /**
   * Get user course version info
   */
  async getUserCourseVersion(userId, courseId) {
    try {
      console.log('🔍 Getting user course version:', userId, courseId);
      const userDoc = await getDoc(doc(firestore, 'users', userId));
      if (userDoc.exists()) {
        const userData = userDoc.data();
        const courseData = userData.courses?.[courseId] || null;
        console.log('✅ User course version data:', courseData);
        return courseData;
      }
      console.log('❌ User document not found');
      return null;
    } catch (error) {
      console.error('❌ Error getting user course version:', error);
      throw error;
    }
  }

  /**
   * Save account deletion feedback before deletion
   */
  async saveAccountDeletionFeedback(userId, feedback) {
    try {
      console.log('💬 Saving account deletion feedback for user:', userId);
      
      const feedbackData = {
        userId: userId,
        feedback: feedback,
        timestamp: serverTimestamp(),
        deleted: false, // Will be updated when account is actually deleted
      };

      // Save to a separate collection that won't be deleted
      await addDoc(collection(firestore, 'account_deletion_feedback'), feedbackData);
      
      console.log('✅ Account deletion feedback saved');
      return true;
    } catch (error) {
      console.error('❌ Error saving account deletion feedback:', error);
      throw error;
    }
  }

  /**
   * Delete all user data from Firestore (except purchases as per requirements)
   */
  async deleteAllUserData(userId) {
    try {
      console.log('🗑️ Starting deletion of all user data for:', userId);

      // Delete subcollections
      await this.deleteSubcollection(userId, 'exerciseHistory');
      await this.deleteSubcollection(userId, 'sessionHistory');

      // Delete user_progress documents (documents starting with userId_)
      await this.deleteUserProgressDocuments(userId);

      // Delete completed_sessions documents (documents starting with userId_)
      await this.deleteCompletedSessionsDocuments(userId);

      // Delete main user document
      const userRef = doc(firestore, 'users', userId);
      await deleteDoc(userRef);
      console.log('✅ User document deleted');

      console.log('✅ All user data deleted successfully');
    } catch (error) {
      console.error('❌ Error deleting user data:', error);
      throw error;
    }
  }

  /**
   * Helper: Delete a subcollection
   */
  async deleteSubcollection(userId, subcollectionName) {
    try {
      const subcollectionRef = collection(firestore, 'users', userId, subcollectionName);
      const snapshot = await getDocs(subcollectionRef);
      
      if (snapshot.empty) {
        console.log(`✅ ${subcollectionName} subcollection is empty`);
        return;
      }

      // Firestore batch limit is 500 operations
      const batchSize = 500;
      const docs = snapshot.docs;
      
      for (let i = 0; i < docs.length; i += batchSize) {
        const batch = writeBatch(firestore);
        const batchDocs = docs.slice(i, i + batchSize);
        
        batchDocs.forEach((docSnapshot) => {
          batch.delete(docSnapshot.ref);
        });
        
        await batch.commit();
        console.log(`✅ Deleted ${batchDocs.length} documents from ${subcollectionName} (batch ${Math.floor(i / batchSize) + 1})`);
      }

      console.log(`✅ ${subcollectionName} subcollection deleted (${docs.length} documents)`);
    } catch (error) {
      console.error(`❌ Error deleting ${subcollectionName} subcollection:`, error);
      throw error;
    }
  }

  /**
   * Helper: Delete user_progress documents
   */
  async deleteUserProgressDocuments(userId) {
    try {
      const userProgressRef = collection(firestore, 'user_progress');
      
      // Fetch all user_progress docs and filter client-side
      // Note: For large collections, consider adding a userId field to documents for better querying
      const snapshot = await getDocs(userProgressRef);
      const userDocs = snapshot.docs.filter(doc => 
        doc.id.startsWith(userId + '_') || doc.id === userId
      );

      if (userDocs.length === 0) {
        console.log('✅ No user_progress documents to delete');
        return;
      }

      // Batch delete
      const batchSize = 500;
      for (let i = 0; i < userDocs.length; i += batchSize) {
        const batch = writeBatch(firestore);
        const batchDocs = userDocs.slice(i, i + batchSize);
        
        batchDocs.forEach((docSnapshot) => {
          batch.delete(docSnapshot.ref);
        });
        
        await batch.commit();
        console.log(`✅ Deleted ${batchDocs.length} user_progress documents (batch ${Math.floor(i / batchSize) + 1})`);
      }

      console.log(`✅ user_progress documents deleted (${userDocs.length} documents)`);
    } catch (error) {
      console.error('❌ Error deleting user_progress documents:', error);
      throw error;
    }
  }

  /**
   * Helper: Delete completed_sessions documents
   */
  async deleteCompletedSessionsDocuments(userId) {
    try {
      const completedSessionsRef = collection(firestore, 'completed_sessions');
      const snapshot = await getDocs(completedSessionsRef);
      
      // Filter documents that start with userId_ or have userId in data
      const userDocs = snapshot.docs.filter(doc => {
        const docId = doc.id;
        const docData = doc.data();
        return docId.startsWith(userId + '_') || docData.userId === userId;
      });

      if (userDocs.length === 0) {
        console.log('✅ No completed_sessions documents to delete');
        return;
      }

      // Batch delete
      const batchSize = 500;
      for (let i = 0; i < userDocs.length; i += batchSize) {
        const batch = writeBatch(firestore);
        const batchDocs = userDocs.slice(i, i + batchSize);
        
        batchDocs.forEach((docSnapshot) => {
          batch.delete(docSnapshot.ref);
        });
        
        await batch.commit();
        console.log(`✅ Deleted ${batchDocs.length} completed_sessions documents (batch ${Math.floor(i / batchSize) + 1})`);
      }

      console.log(`✅ completed_sessions documents deleted (${userDocs.length} documents)`);
    } catch (error) {
      console.error('❌ Error deleting completed_sessions documents:', error);
      throw error;
    }
  }
}

export default new FirestoreService();

// Named helper to match existing imports in the app
export const createUserDocument = async (userId, userData) => {
  try {
    await setDoc(doc(firestore, 'users', userId), {
      ...userData,
      role: userData.role || 'user',        // Default to 'user' if not specified
      created_at: serverTimestamp(),
    });
  } catch (error) {
    throw error;
  }
};
