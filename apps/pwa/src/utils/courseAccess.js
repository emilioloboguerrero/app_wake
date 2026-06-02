// Single source of truth for "does the user have access to this course right
// now?" Used by useUserCourses, purchaseService, HoyScreen, and any caller
// that gates UI on course state. Diverging definitions across these spots
// previously caused "I see it on Hoy but it's missing from My Library"
// inconsistencies — keep them aligned by routing through this helper.
//
// Rules (in order):
// 1. No course entry → no access.
// 2. expires_at is the hard cutoff. If it's set and in the past, no access.
//    Trials respect their expiry too — once a trial lapses, no access.
// 3. status must be 'active' OR is_trial must be true. A 'cancelled' or
//    'expired' entry never grants access (even if expires_at is still
//    in the future, the cancellation flow already messaged the user that
//    access ends naturally — but read the status, since the lapse-flip
//    cron may have stamped it).

export function isCourseEntryActive(courseEntry) {
  if (!courseEntry) return false;

  if (courseEntry.expires_at) {
    const expiresAt = new Date(courseEntry.expires_at);
    if (!isNaN(expiresAt.getTime()) && expiresAt <= new Date()) return false;
  }

  if (courseEntry.status === 'active') return true;
  if (courseEntry.is_trial === true) return true;

  return false;
}

// Convenience for callers that have the user doc and want a quick boolean.
export function userOwnsCourse(userData, courseId) {
  if (!userData?.courses || !courseId) return false;
  return isCourseEntryActive(userData.courses[courseId]);
}
