// Single source of truth for "does the user have access to this course right
// now?" Used by useUserCourses, purchaseService, HoyScreen, and any caller
// that gates UI on course state. Diverging definitions across these spots
// previously caused "I see it on Hoy but it's missing from My Library"
// inconsistencies — keep them aligned by routing through this helper.
//
// This MUST mirror the server gate (functions workout.ts courseAccessIsActive)
// for subscription courses, or the client and server disagree about whether a
// user is "in" their program — which showed real paying subscribers "Acceso
// expirado" and blocked them on Hoy while the API still served their content.
//
// Grace window applied when gating on `expires_at`. MercadoPago retries a
// failed charge for ~3 days, so a paying subscriber whose card is one day late
// must not lose access the moment expires_at passes. Kept identical to the
// server's ACCESS_EXPIRY_GRACE_MS so the two never diverge.
export const ACCESS_EXPIRY_GRACE_MS = 3 * 24 * 60 * 60 * 1000;

// Rules (in order):
// 1. No course entry → no access.
// 2. expires_at is the hard cutoff, WITH the grace window. If it's set and
//    older than (now - grace), no access. When it's absent we do NOT lock the
//    user out: one_on_one / fixed courses carry no expires_at and the server
//    grants them by mere entry presence — going strict here would wrongly hide
//    active coaching clients.
// 3. status must be 'active' OR is_trial must be true. A 'cancelled' or
//    'expired' entry never grants access (even if expires_at is still in the
//    future) — read the status, since the lapse-flip cron may have stamped it.
export function isCourseEntryActive(courseEntry) {
  if (!courseEntry) return false;

  const raw = courseEntry.expires_at;
  let expiresAtMs = null;
  if (typeof raw === 'string') {
    const ms = Date.parse(raw);
    if (Number.isFinite(ms)) expiresAtMs = ms;
  } else if (raw && typeof raw.toMillis === 'function') {
    expiresAtMs = raw.toMillis();
  }
  if (expiresAtMs !== null && expiresAtMs + ACCESS_EXPIRY_GRACE_MS < Date.now()) return false;

  if (courseEntry.status === 'active') return true;
  if (courseEntry.is_trial === true) return true;

  return false;
}

// Convenience for callers that have the user doc and want a quick boolean.
export function userOwnsCourse(userData, courseId) {
  if (!userData?.courses || !courseId) return false;
  return isCourseEntryActive(userData.courses[courseId]);
}
