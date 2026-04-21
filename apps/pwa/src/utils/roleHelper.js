// Simple role-based access control

export const USER_ROLES = {
  USER: 'user',
  CREATOR: 'creator',
  ADMIN: 'admin'
};

/**
 * Check if user can view a specific course
 * @param {string} userRole - User's role ("user", "creator", "admin")
 * @param {string} userId - User's document ID
 * @param {Object} course - Course object with estado and creator_id
 * @returns {boolean} True if user can view the course
 */
export function canViewCourse(userRole, userId, course) {
  const visibility = course.visibility ?? 'both';
  const isBundleOnly = visibility === 'bundle-only';

  // Admins see everything
  if (userRole === USER_ROLES.ADMIN) {
    return true;
  }

  // Creators see published + their own courses (bundle-only blocked for others' courses)
  if (userRole === USER_ROLES.CREATOR) {
    const isPublished = course.status === 'published';
    const isOwnCourse = course.creator_id === userId;
    if (isBundleOnly && !isOwnCourse) return false;
    return isPublished || isOwnCourse;
  }

  // Regular users: published + not bundle-only
  if (isBundleOnly) return false;
  return course.status === 'published';
}

/**
 * Check if user is admin
 */
export function isAdmin(userRole) {
  return userRole === USER_ROLES.ADMIN;
}

/**
 * Check if user is creator
 */
export function isCreator(userRole) {
  return userRole === USER_ROLES.CREATOR;
}

/**
 * Check if user can access testing features
 */
export function canAccessTestingFeatures(userRole) {
  return userRole === USER_ROLES.ADMIN;
}
