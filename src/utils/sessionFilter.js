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
    // Support both 'date' and 'completedAt' fields
    const dateValue = session.date || session.completedAt;
    if (!dateValue) {
      // If no date field, include the session (don't filter it out)
      return true;
    }
    
    const sessionDate = new Date(dateValue);
    // Check if date is valid
    if (isNaN(sessionDate.getTime())) {
      // Invalid date, include it anyway to avoid losing data
      return true;
    }
    
    return sessionDate >= cutoffDate;
  });
};

export default filterSessionsByPeriod;
