// Duration helper - Maps access duration values to human-readable labels

/**
 * Get access duration in days for a given access type
 * @param {string} accessDuration - "monthly", "yearly", "3-month", "6-month", "one-time"
 * @returns {number} Number of days
 */
export function getAccessDurationDays(accessDuration) {
  const durations = {
    'monthly': 30,
    '3-month': 90,
    '6-month': 180,
    'yearly': 365,
    'one-time': 365 // One-time purchases typically last 1 year
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
 * @param {string} accessDuration - "monthly", "yearly", "3-month", "6-month", "one-time"
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
 * @param {string} accessDuration - "monthly", "yearly", "3-month", "6-month", "one-time"
 * @returns {string} Human-readable label in Spanish
 */
export function getAccessDurationLabel(accessDuration) {
  if (!accessDuration) return 'No especificado';
  
  const labels = {
    'monthly': 'Mensual',
    'yearly': 'Anual',
    '3-month': '3 Meses',
    '6-month': '6 Meses',
    'one-time': 'Una vez',
    'subscription': 'Suscripción'
  };
  
  return labels[accessDuration] || accessDuration;
}

/**
 * Get access type label (one-time payment or subscription)
 * @param {string} accessDuration - "monthly", "yearly", "3-month", "6-month"
 * @returns {string} "Suscripción" or "Pago único"
 */
export function getAccessTypeLabel(accessDuration) {
  if (!accessDuration) return 'No especificado';
  
  // Only monthly is a subscription with auto-renewal
  if (accessDuration === 'monthly') {
    return 'Suscripción';
  }
  
  return 'Pago único';
}

/**
 * Get human-readable duration label (for duration field, not access_duration)
 * @param {string|number} duration - Duration value (string like "4 semanas" or number)
 * @returns {string} Human-readable label in Spanish
 */
export function getDurationLabel(duration) {
  if (!duration && duration !== 0) return 'No especificado';
  
  // If it's "Mensual", return it as-is
  if (typeof duration === 'string' && duration === 'Mensual') {
    return 'Mensual';
  }
  
  // If it's a string like "4 semanas", extract the number and format it
  if (typeof duration === 'string') {
    const match = duration.match(/^(\d+)\s*semanas?$/i);
    if (match) {
      const weeks = parseInt(match[1], 10);
      if (weeks === 1) return '1 Semana';
      return `${weeks} Semanas`;
    }
    return duration; // Return as-is if format doesn't match
  }
  
  // If it's a number, format it
  if (typeof duration === 'number') {
    if (duration === 1) return '1 Semana';
    return `${duration} Semanas`;
  }
  
  return duration || 'No especificado';
}

/**
 * Get human-readable status label
 * @param {string} status - "draft", "published", "archived"
 * @returns {string} Human-readable label in Spanish
 */
export function getStatusLabel(status) {
  if (!status) return 'Borrador';
  
  const labels = {
    'draft': 'Borrador',
    'published': 'Publicado',
    'archived': 'Archivado'
  };
  
  return labels[status] || status;
}

