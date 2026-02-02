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
  // Admins see everything
  if (userRole === USER_ROLES.ADMIN) {
    return true;
  }
  
  // Creators see published + their own courses
  if (userRole === USER_ROLES.CREATOR) {
    const isPublished = course.status === 'published';
    const isOwnCourse = course.creator_id === userId;
    return isPublished || isOwnCourse;
  }
  
  // Regular users see only published
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
