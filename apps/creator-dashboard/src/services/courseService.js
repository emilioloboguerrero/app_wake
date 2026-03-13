import { firestore } from '../config/firebase';
import {
  collection,
  query,
  where,
  getDocs,
} from 'firebase/firestore';
import { getUser } from './firestoreService';
import logger from '../utils/logger';

/**
 * Get available courses for a user based on their role.
 * - Admins: all courses
 * - Creators: published courses + their own (any status)
 * - Users: published courses only
 *
 * Filtering is done via Firestore queries rather than client-side so that
 * unpublished courses from other creators are never fetched at all.
 */
export const getAvailableCourses = async (userId = null) => {
  try {
    let userRole = 'user';
    if (userId) {
      const userDoc = await getUser(userId);
      userRole = userDoc?.role || 'user';
    }

    const coursesRef = collection(firestore, 'courses');
    let courseDocs = [];

    if (userRole === 'admin') {
      // Admins see everything — Firestore rules allow admin full read
      const snapshot = await getDocs(coursesRef);
      courseDocs = snapshot.docs;
    } else if (userRole === 'creator' && userId) {
      // Two queries: published courses + own courses (any status), then deduplicate
      const [publishedSnap, ownSnap] = await Promise.all([
        getDocs(query(coursesRef, where('status', 'in', ['publicado', 'published']))),
        getDocs(query(coursesRef, where('creator_id', '==', userId))),
      ]);
      const seen = new Set();
      for (const d of [...publishedSnap.docs, ...ownSnap.docs]) {
        if (!seen.has(d.id)) {
          seen.add(d.id);
          courseDocs.push(d);
        }
      }
    } else {
      // Regular users: published only
      // Backward compat: also include docs with no status field (older records)
      const snapshot = await getDocs(
        query(coursesRef, where('status', 'in', ['publicado', 'published']))
      );
      courseDocs = snapshot.docs;
    }

    const courses = courseDocs.map(d => ({ id: d.id, ...d.data() }));

    // Sort newest first
    courses.sort((a, b) => {
      const aDate = a.created_at?.toDate?.() || a.created_at || new Date(0);
      const bDate = b.created_at?.toDate?.() || b.created_at || new Date(0);
      const aTime = aDate instanceof Date ? aDate.getTime() : new Date(aDate).getTime();
      const bTime = bDate instanceof Date ? bDate.getTime() : new Date(bDate).getTime();
      return bTime - aTime;
    });

    // Normalize creator name field so callers only need to check one property
    return courses.map(course => ({
      ...course,
      creatorName: course.creatorName || course.creator_name || 'Unknown Creator',
      creator_name: course.creator_name || course.creatorName || 'Unknown Creator',
    }));
  } catch (error) {
    logger.error('Error fetching available courses:', error);
    throw error;
  }
};
