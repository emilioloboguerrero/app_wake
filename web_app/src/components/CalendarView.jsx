import React, { useState, useMemo } from 'react';
import { getMondayWeek, isDateInWeek } from '../utils/weekCalculation';
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

const CalendarView = ({ 
  onDateSelect, 
  plannedSessions = [], 
  programColors = {}, 
  onMonthChange,
  planAssignments = {}, // Object mapping week keys to plan assignments: { [weekKey]: { planId, moduleIndex, ... } }
  onPlanAssignment, // Callback when a plan is assigned to a week: (planId, weekKey, day)
  assignedPrograms = [] // List of assigned programs for display
}) => {
  const today = new Date();
  const [currentDate, setCurrentDate] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState(null);
  const [draggedOverDay, setDraggedOverDay] = useState(null);
  const [selectedDayInfo, setSelectedDayInfo] = useState(null);

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
    
    // Collect information for this day
    const daySessions = getSessionsForDay(day);
    const planAssignmentsForDay = getPlanAssignmentsForDay(day);
    const weekKey = getWeekKeyForDay(day);
    
    const dayInfo = {
      date,
      day,
      weekKey,
      sessions: daySessions,
      planAssignments: planAssignmentsForDay,
      hasContent: daySessions.length > 0 || planAssignmentsForDay.length > 0
    };
    
    setSelectedDayInfo(dayInfo);
    
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

  // Get week key for a specific day
  const getWeekKeyForDay = (day) => {
    if (day === null) return null;
    const date = new Date(currentYear, currentMonth, day);
    return getMondayWeek(date);
  };

  // Get plan assignments for a specific day
  const getPlanAssignmentsForDay = (day) => {
    if (day === null) return [];
    const weekKey = getWeekKeyForDay(day);
    if (!weekKey) return [];
    const assignment = planAssignments[weekKey];
    
    if (!assignment || !assignment.planId) return [];
    
    // Return single assignment (one plan per week)
    return [{
      planId: assignment.planId,
      moduleIndex: assignment.moduleIndex || 0,
      assignedAt: assignment.assignedAt
    }];
  };

  // Check if a week has any sessions or assignments
  const weekHasContent = useMemo(() => {
    const weekMap = {};
    
    // Check sessions by week
    plannedSessions.forEach(session => {
      let dateStr = session.date;
      if (!dateStr && session.date_timestamp) {
        const timestamp = session.date_timestamp;
        const dateObj = timestamp?.toDate ? timestamp.toDate() : new Date(timestamp);
        dateStr = formatDateForStorage(dateObj);
      }
      if (dateStr) {
        const [year, month, day] = dateStr.split('-').map(Number);
        const date = new Date(year, month - 1, day);
        const weekKey = getMondayWeek(date);
        weekMap[weekKey] = true;
      }
    });

    // Check plan assignments
    Object.keys(planAssignments).forEach(weekKey => {
      const assignment = planAssignments[weekKey];
      if (assignment && assignment.planId) {
        weekMap[weekKey] = true;
      }
    });

    return weekMap;
  }, [plannedSessions, planAssignments]);

  // Handle drag over
  const handleDragOver = (e, day) => {
    if (day === null) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDraggedOverDay(day);
  };

  // Handle drag leave
  const handleDragLeave = (e) => {
    e.preventDefault();
    setDraggedOverDay(null);
  };

  // Handle drop
  const handleDrop = (e, day) => {
    e.preventDefault();
    e.stopPropagation();
    setDraggedOverDay(null);
    
    if (day === null) return;

    try {
      const dragData = JSON.parse(e.dataTransfer.getData('application/json'));
      const { planId, type } = dragData;
      
      if (!planId || type !== 'plan') return;

      const date = new Date(currentYear, currentMonth, day);
      const weekKey = getMondayWeek(date);
      
      if (onPlanAssignment) {
        onPlanAssignment(planId, weekKey, day);
      }
    } catch (error) {
      console.error('Error handling drop:', error);
    }
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
            const dayPlanAssignments = getPlanAssignmentsForDay(day);
            const hasPlanAssignments = dayPlanAssignments.length > 0;
            const isDraggedOver = draggedOverDay === day;
            const weekKey = getWeekKeyForDay(day);
            const hasWeekContent = weekKey ? weekHasContent[weekKey] : false;
            
            // Get primary session color (first session's program color) or week assignment color
            let primaryColor = null;
            if (hasSessions) {
              primaryColor = getProgramColor(daySessions[0].program_id);
            } else if (hasPlanAssignments) {
              // For plan assignments, use a default color (could load plan data to get custom color)
              primaryColor = programColors[dayPlanAssignments[0].planId] || 'rgba(107, 142, 35, 0.6)';
            }
            
            return (
              <button
                key={index}
                className={`calendar-day ${day === null ? 'calendar-day-empty' : ''} ${isToday(day) ? 'calendar-day-today' : ''} ${isSelected(day) ? 'calendar-day-selected' : ''} ${hasSessions ? 'calendar-day-has-session' : ''} ${hasPlanAssignments ? 'calendar-day-has-plan-assignment' : ''} ${isDraggedOver ? 'calendar-day-drag-over' : ''} ${hasWeekContent ? 'calendar-day-has-week-content' : ''}`}
                onClick={() => handleDateClick(day)}
                onDragOver={(e) => handleDragOver(e, day)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, day)}
                disabled={day === null}
                style={primaryColor ? {
                  backgroundColor: hasPlanAssignments && !hasSessions ? `${primaryColor}80` : primaryColor,
                  borderColor: primaryColor
                } : {}}
              >
                <span className="calendar-day-number">{day}</span>
                
                {/* Week tag indicator */}
                {hasWeekContent && (
                  <div className="calendar-day-tag">
                    <span className="calendar-day-tag-text">
                      {hasSessions ? 'Sesión' : hasPlanAssignments ? 'Plan' : 'Planificado'}
                    </span>
                  </div>
                )}
                
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
                {hasPlanAssignments && !hasSessions && (
                  <div className="calendar-day-plan-assignment-indicator">
                    {dayPlanAssignments.map((assignment, idx) => (
                      <div
                        key={idx}
                        className="calendar-day-plan-assignment-dot"
                        style={{ backgroundColor: primaryColor || 'rgba(107, 142, 35, 0.6)' }}
                        title="Plan asignado"
                      />
                    ))}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="calendar-legend">
        <div className="calendar-legend-title">Leyenda</div>
        <div className="calendar-legend-items">
          <div className="calendar-legend-item">
            <div className="calendar-legend-badge calendar-legend-badge-session">
              <span className="calendar-legend-badge-text">Sesión</span>
            </div>
            <span className="calendar-legend-label">Día con sesión planificada</span>
          </div>
          <div className="calendar-legend-item">
            <div className="calendar-legend-badge calendar-legend-badge-program">
              <span className="calendar-legend-badge-text">Plan</span>
            </div>
            <span className="calendar-legend-label">Semana con plan asignado</span>
          </div>
          <div className="calendar-legend-item">
            <div className="calendar-legend-badge calendar-legend-badge-planned">
              <span className="calendar-legend-badge-text">Planificado</span>
            </div>
            <span className="calendar-legend-label">Semana con contenido planificado</span>
          </div>
        </div>
      </div>

      {/* Day Info Modal */}
      {selectedDayInfo && selectedDayInfo.hasContent && (
        <div className="calendar-day-info-overlay" onClick={() => setSelectedDayInfo(null)}>
          <div className="calendar-day-info-modal" onClick={(e) => e.stopPropagation()}>
            <div className="calendar-day-info-header">
              <h3 className="calendar-day-info-title">
                {selectedDayInfo.date.toLocaleDateString('es-ES', { 
                  weekday: 'long', 
                  year: 'numeric', 
                  month: 'long', 
                  day: 'numeric' 
                })}
              </h3>
              <button 
                className="calendar-day-info-close"
                onClick={() => setSelectedDayInfo(null)}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            </div>
            <div className="calendar-day-info-content">
              {selectedDayInfo.sessions.length > 0 && (
                <div className="calendar-day-info-section">
                  <h4 className="calendar-day-info-section-title">Sesiones Planificadas</h4>
                  <div className="calendar-day-info-list">
                    {selectedDayInfo.sessions.map((session, idx) => (
                      <div key={idx} className="calendar-day-info-item">
                        <div className="calendar-day-info-item-color" style={{ backgroundColor: getProgramColor(session.program_id) }} />
                        <div className="calendar-day-info-item-content">
                          <div className="calendar-day-info-item-title">{session.session_name || session.title || 'Sesión'}</div>
                          {session.program_name && (
                            <div className="calendar-day-info-item-subtitle">{session.program_name}</div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {selectedDayInfo.planAssignments && selectedDayInfo.planAssignments.length > 0 && (
                <div className="calendar-day-info-section">
                  <h4 className="calendar-day-info-section-title">Plan de la Semana</h4>
                  <div className="calendar-day-info-list">
                    {selectedDayInfo.planAssignments.map((assignment, idx) => (
                      <div key={idx} className="calendar-day-info-item">
                        <div className="calendar-day-info-item-color" style={{ backgroundColor: programColors[assignment.planId] || 'rgba(107, 142, 35, 0.6)' }} />
                        <div className="calendar-day-info-item-content">
                          <div className="calendar-day-info-item-title">Plan asignado</div>
                          <div className="calendar-day-info-item-subtitle">Módulo {assignment.moduleIndex + 1}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {selectedDayInfo.sessions.length === 0 && (!selectedDayInfo.planAssignments || selectedDayInfo.planAssignments.length === 0) && (
                <div className="calendar-day-info-empty">
                  <p>No hay contenido planificado para este día.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CalendarView;

