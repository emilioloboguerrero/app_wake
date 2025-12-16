import React, { useState, useMemo } from 'react';
import './CalendarView.css';

const MONTHS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

const DAYS_OF_WEEK = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

// Color palette for programs (cycle through these)
const PROGRAM_COLORS = [
  'rgba(191, 168, 77, 0.6)',   // Gold
  'rgba(107, 142, 35, 0.6)',   // Olive
  'rgba(70, 130, 180, 0.6)',   // Steel blue
  'rgba(186, 85, 211, 0.6)',   // Medium orchid
  'rgba(220, 20, 60, 0.6)',    // Crimson
  'rgba(255, 140, 0, 0.6)',    // Dark orange
];

const CalendarView = ({ onDateSelect, plannedSessions = [], programColors = {}, onMonthChange }) => {
  const today = new Date();
  const [currentDate, setCurrentDate] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState(null);

  const currentYear = currentDate.getFullYear();
  const currentMonth = currentDate.getMonth();

  // Get first day of month and number of days
  const firstDayOfMonth = new Date(currentYear, currentMonth, 1);
  const lastDayOfMonth = new Date(currentYear, currentMonth + 1, 0);
  const daysInMonth = lastDayOfMonth.getDate();
  // Convert Sunday (0) to 6, Monday (1) to 0, etc. so Monday is first
  const startingDayOfWeek = (firstDayOfMonth.getDay() + 6) % 7;

  // Generate calendar days
  const calendarDays = [];
  
  // Add empty cells for days before the first day of the month
  for (let i = 0; i < startingDayOfWeek; i++) {
    calendarDays.push(null);
  }
  
  // Add all days of the month
  for (let day = 1; day <= daysInMonth; day++) {
    calendarDays.push(day);
  }

  const handlePrevMonth = () => {
    const newDate = new Date(currentYear, currentMonth - 1, 1);
    setCurrentDate(newDate);
    if (onMonthChange) {
      onMonthChange(newDate);
    }
  };

  const handleNextMonth = () => {
    const newDate = new Date(currentYear, currentMonth + 1, 1);
    setCurrentDate(newDate);
    if (onMonthChange) {
      onMonthChange(newDate);
    }
  };

  const handleMonthYearChange = (e) => {
    const [monthStr, yearStr] = e.target.value.split('-');
    const newMonth = parseInt(monthStr);
    const newYear = parseInt(yearStr);
    const newDate = new Date(newYear, newMonth, 1);
    setCurrentDate(newDate);
    if (onMonthChange) {
      onMonthChange(newDate);
    }
  };

  const handleDateClick = (day) => {
    if (day === null) return;
    const date = new Date(currentYear, currentMonth, day);
    setSelectedDate(date);
    if (onDateSelect) {
      onDateSelect(date);
    }
  };

  const isToday = (day) => {
    if (day === null) return false;
    const today = new Date();
    return (
      day === today.getDate() &&
      currentMonth === today.getMonth() &&
      currentYear === today.getFullYear()
    );
  };

  const isSelected = (day) => {
    if (day === null || !selectedDate) return false;
    return (
      day === selectedDate.getDate() &&
      currentMonth === selectedDate.getMonth() &&
      currentYear === selectedDate.getFullYear()
    );
  };

  // Format date for comparison (YYYY-MM-DD)
  const formatDateForStorage = (date) => {
    const d = date instanceof Date ? date : (date?.toDate ? date.toDate() : new Date(date));
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // Create a map of date strings to sessions for quick lookup
  const sessionsByDate = useMemo(() => {
    const map = {};
    if (!plannedSessions || plannedSessions.length === 0) return map;

    plannedSessions.forEach(session => {
      let dateStr = session.date;
      if (!dateStr && session.date_timestamp) {
        // Handle Firestore Timestamp
        const timestamp = session.date_timestamp;
        const dateObj = timestamp?.toDate ? timestamp.toDate() : new Date(timestamp);
        dateStr = formatDateForStorage(dateObj);
      }
      if (dateStr) {
        if (!map[dateStr]) {
          map[dateStr] = [];
        }
        map[dateStr].push(session);
      }
    });

    return map;
  }, [plannedSessions]);


  // Get sessions for a specific day
  const getSessionsForDay = (day) => {
    if (day === null) return [];
    const date = new Date(currentYear, currentMonth, day);
    const dateStr = formatDateForStorage(date);
    return sessionsByDate[dateStr] || [];
  };

  // Get color for a program
  const getProgramColor = (programId) => {
    if (programColors && programColors[programId]) {
      return programColors[programId];
    }
    // Default color based on program ID hash
    if (!programId) return PROGRAM_COLORS[0];
    const hash = programId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return PROGRAM_COLORS[hash % PROGRAM_COLORS.length];
  };

  // Generate month-year options (current year ± 2 years)
  const currentYearValue = new Date().getFullYear();
  const monthYearOptions = [];
  for (let year = currentYearValue - 2; year <= currentYearValue + 2; year++) {
    for (let month = 0; month < 12; month++) {
      monthYearOptions.push({
        month,
        year,
        value: `${month}-${year}`,
        label: `${MONTHS[month]} ${year}`
      });
    }
  }
  
  const currentMonthYearValue = `${currentMonth}-${currentYear}`;

  return (
    <div className="calendar-view">
      {/* Month/Year Selector */}
      <div className="calendar-header-controls">
        <div className="calendar-month-year-selector">
          <select 
            className="calendar-month-year-select"
            value={currentMonthYearValue}
            onChange={handleMonthYearChange}
          >
            {monthYearOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div className="calendar-nav-buttons">
          <button 
            className="calendar-nav-button"
            onClick={handlePrevMonth}
            aria-label="Mes anterior"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M15 18L9 12L15 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          <button 
            className="calendar-nav-button"
            onClick={handleNextMonth}
            aria-label="Mes siguiente"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M9 18L15 12L9 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>
      </div>

      {/* Calendar Grid */}
      <div className="calendar-grid-container">
        {/* Days of week header */}
        <div className="calendar-weekdays">
          {DAYS_OF_WEEK.map((day, index) => (
            <div key={index} className="calendar-weekday">
              {day}
            </div>
          ))}
        </div>

        {/* Calendar days */}
        <div className="calendar-days">
          {calendarDays.map((day, index) => {
            const daySessions = getSessionsForDay(day);
            const hasSessions = daySessions.length > 0;
            
            // Get primary session color (first session's program color)
            const primaryColor = hasSessions ? getProgramColor(daySessions[0].program_id) : null;
            
            return (
              <button
                key={index}
                className={`calendar-day ${day === null ? 'calendar-day-empty' : ''} ${isToday(day) ? 'calendar-day-today' : ''} ${isSelected(day) ? 'calendar-day-selected' : ''} ${hasSessions ? 'calendar-day-has-session' : ''}`}
                onClick={() => handleDateClick(day)}
                disabled={day === null}
                style={hasSessions && primaryColor ? {
                  backgroundColor: primaryColor,
                  borderColor: primaryColor
                } : {}}
                title={hasSessions ? `${daySessions.length} sesión${daySessions.length > 1 ? 'es' : ''} planificada${daySessions.length > 1 ? 's' : ''}` : ''}
              >
                <span className="calendar-day-number">{day}</span>
                {hasSessions && (
                  <div className="calendar-day-session-indicator">
                    {daySessions.length > 1 && (
                      <span className="calendar-day-session-count">{daySessions.length}</span>
                    )}
                    <div className="calendar-day-session-dots">
                      {daySessions.slice(0, 3).map((session, idx) => (
                        <div
                          key={idx}
                          className="calendar-day-session-dot"
                          style={{ backgroundColor: getProgramColor(session.program_id) }}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default CalendarView;

