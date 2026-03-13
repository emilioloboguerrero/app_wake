import { firestore } from '../config/firebase';
import {
  doc,
  setDoc,
  getDoc,
  updateDoc,
  serverTimestamp,
  collection,
  query,
  where,
  getDocs
} from 'firebase/firestore';
import logger from '../utils/logger';

// ============ USER PROFILE ============

export const createUserDocument = async (userId, userData) => {
  await setDoc(doc(firestore, 'users', userId), {
    ...userData,
    role: userData.role || 'user',
    created_at: serverTimestamp(),
  });
};

export const getUser = async (userId) => {
  const userDoc = await getDoc(doc(firestore, 'users', userId));
  return userDoc.exists() ? userDoc.data() : null;
};

export const updateUser = async (userId, userData) => {
  await updateDoc(doc(firestore, 'users', userId), userData);
};

export const completeWebOnboarding = async (userId, onboardingData = {}) => {
  await updateDoc(doc(firestore, 'users', userId), {
    webOnboardingCompleted: true,
    webOnboardingCompletedAt: serverTimestamp(),
    ...(onboardingData && Object.keys(onboardingData).length > 0 && {
      webOnboardingData: onboardingData
    })
  });
};

// ============ COURSES ============

export const getCourse = async (courseId) => {
  try {
    const courseDoc = await getDoc(doc(firestore, 'courses', courseId));
    if (courseDoc.exists()) {
      return { id: courseDoc.id, ...courseDoc.data() };
    }
    return null;
  } catch (error) {
    logger.error('Error getting course:', error);
    throw error;
  }
};

// Writes course access entry onto the user document.
// Also maintains the legacy purchased_courses array — remove once all user docs
// have been migrated to the courses map and no code reads purchased_courses.
export const addCourseToUser = async (userId, courseId, expirationDate, accessDuration, courseDetails) => {
  try {
    const userRef = doc(firestore, 'users', userId);
    const userDoc = await getDoc(userRef);

    if (!userDoc.exists()) {
      throw new Error('User document does not exist');
    }

    const userData = userDoc.data();
    const courses = userData.courses || {};

    courses[courseId] = {
      access_duration: accessDuration,
      expires_at: expirationDate instanceof Date ? expirationDate.toISOString() : expirationDate,
      status: 'active',
      purchased_at: new Date().toISOString(),
      title: courseDetails?.title || 'Untitled Course',
      image_url: courseDetails?.image_url || null,
      discipline: courseDetails?.discipline || 'General',
      creatorName: courseDetails?.creatorName || courseDetails?.creator_name || 'Unknown Creator',
      completedTutorials: {
        dailyWorkout: [],
        warmup: [],
        workoutExecution: [],
        workoutCompletion: []
      }
    };

    await updateDoc(userRef, {
      courses,
      purchased_courses: [...new Set([...(userData.purchased_courses || []), courseId])]
    });
  } catch (error) {
    logger.error('Error adding course to user:', error);
    throw error;
  }
};

// ============ TRIALS ============

export const startTrialForCourse = async (userId, courseId, courseDetails, durationInDays) => {
  if (!durationInDays || durationInDays <= 0) {
    return {
      success: false,
      error: 'Duración de prueba inválida',
      code: 'INVALID_TRIAL_DURATION',
    };
  }

  try {
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

    await updateDoc(userRef, { courses, free_trial_history: trialHistory });

    return { success: true, expirationDate: expirationDate.toISOString() };
  } catch (error) {
    logger.error('Error starting trial for course:', error);
    return {
      success: false,
      error: error.message || 'Error al iniciar la prueba gratuita',
      code: 'TRIAL_ERROR',
    };
  }
};

export const isUsernameTaken = async (username, excludeUid) => {
  const snap = await getDocs(query(
    collection(firestore, 'users'),
    where('username', '==', username.toLowerCase())
  ));
  return !snap.empty && snap.docs.some(d => d.id !== excludeUid);
};
