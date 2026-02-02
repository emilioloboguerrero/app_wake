/**
 * Centralized Week Calculation Utility
 * Single source of truth for all week calculations in the app
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
 * Format week key to display string
 * @param {string} weekKey - Week key in format "YYYY-WXX"
 * @returns {string} - Formatted week string like "Semana del 13-19 Oct"
 */
export const formatWeekDisplay = (weekKey) => {
  // Parse week key (format: YYYY-WXX)
  const [year, weekWithW] = weekKey.split('-');
  const week = weekWithW.replace('W', ''); // Remove the 'W' prefix
  
  // Calculate the start date of the week (Monday-based)
  const jan1 = new Date(year, 0, 1);
  
  // Find the Monday of the first week of the year
  const jan1Day = jan1.getDay();
  const daysToFirstMonday = jan1Day === 0 ? 1 : 8 - jan1Day; // Monday is day 1
  const firstMonday = new Date(jan1);
  firstMonday.setDate(jan1.getDate() + daysToFirstMonday);
  
  // Calculate the Monday of the target week
  const weekStart = new Date(firstMonday);
  weekStart.setDate(firstMonday.getDate() + (parseInt(week) - 1) * 7);
  
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6); // Sunday
  
  const monthNames = [
    'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
    'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'
  ];
  
  const startMonth = monthNames[weekStart.getMonth()];
  const startDay = weekStart.getDate();
  const endMonth = monthNames[weekEnd.getMonth()];
  const endDay = weekEnd.getDate();
  
  if (startMonth === endMonth) {
    return `Semana del ${startDay}-${endDay} ${startMonth}`;
  } else {
    return `Semana del ${startDay} ${startMonth} - ${endDay} ${endMonth}`;
  }
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
  return date >= start && date <= end;
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
