/**
 * Centralized Week Calculation Utility for Web App
 * Matches the mobile app's week calculation system
 */

/**
 * Get Monday-based week key for a given date
 * @param {Date} date - Date to get week for (defaults to now)
 * @returns {string} - Week key in format "YYYY-WXX"
 */
export const getMondayWeek = (date = new Date()) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  
  // Get the Monday of the current week
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday
  const monday = new Date(d.setDate(diff));
  
  // Calculate week number from January 1st (Monday-based)
  const year = monday.getFullYear();
  const jan1 = new Date(year, 0, 1);
  
  // Find the Monday of the first week of the year
  const jan1Day = jan1.getDay();
  const daysToFirstMonday = jan1Day === 0 ? 1 : 8 - jan1Day; // Monday is day 1
  const firstMonday = new Date(jan1);
  firstMonday.setDate(jan1.getDate() + daysToFirstMonday);
  
  // Calculate week number
  const daysDiff = Math.floor((monday - firstMonday) / (24 * 60 * 60 * 1000));
  const weekNumber = Math.floor(daysDiff / 7) + 1;
  
  return `${year}-W${String(weekNumber).padStart(2, '0')}`;
};

/**
 * Get week start and end dates
 * @param {string} weekKey - Week key in format "YYYY-WXX"
 * @returns {Object} - { start: Date, end: Date }
 */
export const getWeekDates = (weekKey) => {
  const [year, weekWithW] = weekKey.split('-');
  const week = weekWithW.replace('W', '');
  
  const jan1 = new Date(year, 0, 1);
  
  // Find the Monday of the first week of the year
  const jan1Day = jan1.getDay();
  const daysToFirstMonday = jan1Day === 0 ? 1 : 8 - jan1Day; // Monday is day 1
  const firstMonday = new Date(jan1);
  firstMonday.setDate(jan1.getDate() + daysToFirstMonday);
  
  const weekStart = new Date(firstMonday);
  weekStart.setDate(firstMonday.getDate() + (parseInt(week) - 1) * 7);
  
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  
  return { start: weekStart, end: weekEnd };
};

/**
 * Check if a date falls within a given week
 * @param {Date} date - Date to check
 * @param {string} weekKey - Week key in format "YYYY-WXX"
 * @returns {boolean} - True if date is in the week
 */
export const isDateInWeek = (date, weekKey) => {
  const { start, end } = getWeekDates(weekKey);
  const checkDate = new Date(date);
  checkDate.setHours(0, 0, 0, 0);
  return checkDate >= start && checkDate <= end;
};

/**
 * Get all weeks between two dates
 * @param {Date} startDate - Start date
 * @param {Date} endDate - End date
 * @returns {string[]} - Array of week keys
 */
export const getWeeksBetween = (startDate, endDate) => {
  const weeks = [];
  const current = new Date(startDate);
  
  while (current <= endDate) {
    weeks.push(getMondayWeek(current));
    current.setDate(current.getDate() + 7);
  }
  
  return [...new Set(weeks)]; // Remove duplicates
};

/**
 * Get N consecutive week keys starting from a given week key.
 * Used when assigning a multi-week plan to the calendar (one module per week).
 * @param {string} startWeekKey - Week key in format "YYYY-WXX"
 * @param {number} count - Number of consecutive weeks
 * @returns {string[]} - Array of week keys (length = count), or empty if count < 1
 */
export const getConsecutiveWeekKeys = (startWeekKey, count) => {
  if (count < 1) return [];
  if (count === 1) return [startWeekKey];
  const { start } = getWeekDates(startWeekKey);
  const endDate = new Date(start);
  endDate.setDate(start.getDate() + 7 * count - 1); // last day of Nth week
  return getWeeksBetween(start, endDate);
};

