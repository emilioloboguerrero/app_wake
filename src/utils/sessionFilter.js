/**
 * Get a session's date as a JavaScript Date.
 * Handles Firestore Timestamp { seconds, nanoseconds }, milliseconds, or ISO string.
 */
export const getSessionDateAsDate = (dateValue) => {
  if (dateValue == null) return null;
  if (dateValue && typeof dateValue.seconds === 'number') {
    return new Date(dateValue.seconds * 1000);
  }
  if (typeof dateValue === 'number') {
    return new Date(dateValue);
  }
  const d = new Date(dateValue);
  return isNaN(d.getTime()) ? null : d;
};

// Utility function to filter sessions by time period
export const filterSessionsByPeriod = (sessions, period) => {
  if (!sessions || sessions.length === 0) return sessions;
  
  const now = new Date();
  let cutoffDate;
  
  switch (period) {
    case 'week':
      cutoffDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case 'month':
      cutoffDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      break;
    case '3months':
      cutoffDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      break;
    case '6months':
      cutoffDate = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);
      break;
    case 'year':
      cutoffDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
      break;
    default:
      return sessions;
  }
  
  return sessions.filter(session => {
    const dateValue = session.date || session.completedAt;
    if (!dateValue) return true;

    let sessionDate;
    if (dateValue && typeof dateValue.seconds === 'number') {
      sessionDate = new Date(dateValue.seconds * 1000);
    } else if (dateValue && typeof dateValue.toDate === 'function') {
      sessionDate = dateValue.toDate();
    } else if (typeof dateValue === 'number') {
      sessionDate = new Date(dateValue);
    } else {
      sessionDate = new Date(dateValue);
    }

    if (isNaN(sessionDate.getTime())) return true;
    return sessionDate >= cutoffDate;
  });
};

export default filterSessionsByPeriod;
