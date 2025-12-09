// Duration helper - Hardcoded access durations
// Maps access types to number of days

/**
 * Get access duration in days for a given access type
 * @param {string} accessDuration - "monthly", "yearly", "3-month", "6-month"
 * @returns {number} Number of days
 */
export function getAccessDurationDays(accessDuration) {
  const durations = {
    'monthly': 30,
    '3-month': 90,
    '6-month': 180,
    'yearly': 365
  };
  
  const days = durations[accessDuration];
  
  if (!days) {
    console.warn(`⚠️ Unknown access_duration: ${accessDuration}, defaulting to 30 days`);
    return 30; // Default fallback
  }
  
  return days;
}

/**
 * Calculate expiration date from access type
 * @param {string} accessDuration - "monthly", "yearly", "3-month", "6-month"
 * @returns {string} ISO date string
 */
export function calculateExpirationDate(accessDuration) {
  const now = new Date();
  const durationDays = getAccessDurationDays(accessDuration);
  const expirationDate = new Date(now.getTime() + (durationDays * 24 * 60 * 60 * 1000));
  
  return expirationDate.toISOString();
}

/**
 * Get human-readable duration label
 * @param {string} accessDuration - "monthly", "yearly", "3-month", "6-month"
 * @returns {string} Human-readable label
 */
export function getAccessDurationLabel(accessDuration) {
  const labels = {
    'monthly': 'Mensual',
    '3-month': '3 Meses',
    '6-month': '6 Meses',
    'yearly': 'Anual'
  };
  
  return labels[accessDuration] || accessDuration;
}

/**
 * Check if access type is a subscription (auto-renewal)
 * @param {string} accessDuration - "monthly", "yearly", "3-month", "6-month"
 * @returns {boolean} True if subscription
 */
export function isSubscription(accessDuration) {
  // Only monthly is a subscription with auto-renewal
  return accessDuration === 'monthly';
}
