import React, { useState, useMemo, useEffect } from 'react';
import { getMondayWeek } from '../utils/weekCalculation';
import { DRAG_TYPE_LIBRARY_SESSION, DRAG_TYPE_PLAN } from './PlanningLibrarySidebar';
import './CalendarView.css';

export const DRAG_TYPE_CLIENT_PLAN_SESSION = 'client_plan_session';

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
  planAssignments = {},
  plans = [],
  onPlanAssignment,
  onSessionAssignment,
  onEditSessionAssignment,
  onDeleteSessionAssignment,
  onSelectedDayChange,
  hasClientPlanCopy = false,
  onPersonalizePlanWeek,
  onResetPlanWeek,
  weekContentByWeekKey = {},
  onEditPlanSession,
  onDeletePlanSession,
  onMovePlanSessionDay,
  onMovePlanSessionToWeek,
  onAddLibrarySessionToPlanDay,
  onAddPlanSessionToDay,
  assignedPrograms = [],
  selectedProgramId = null,
  planWeeksCount = {} // optional: { [planId]: number } for "Plan name (N semanas)"
}) => {
  const PLAN_BAR_COLOR = 'rgba(78, 64, 44, 0.96)'; // rich bronze/amber (más llamativo)
  const PLAN_BAR_ACCENT = 'rgba(191, 168, 77, 0.65)'; // visible gold accent
  const today = new Date();
  const [currentDate, setCurrentDate] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState(null);
  const [draggedOverDay, setDraggedOverDay] = useState(null);
  const [selectedDayInfo, setSelectedDayInfo] = useState(null);
  const [openSessionMenuId, setOpenSessionMenuId] = useState(null);

  const currentYear = currentDate.getFullYear();
  const currentMonth = currentDate.getMonth();

  useEffect(() => {
    console.log('[CalendarView] plannedSessions prop changed', { length: plannedSessions?.length ?? 0, sample: plannedSessions?.slice(0, 2)?.map(s => ({ id: s.id, date: s.date, client_id: s.client_id })) });
  }, [plannedSessions]);

  // Close session card menu when clicking outside (not on trigger or menu)
  useEffect(() => {
    if (openSessionMenuId === null) return;
    const close = (e) => {
      if (e.target.closest('.calendar-day-session-card-actions') || e.target.closest('.calendar-day-session-card-menu')) return;
      setOpenSessionMenuId(null);
    };
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [openSessionMenuId]);

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
    const planSessionsForDay = getPlanSessionsForDay(day);
    const weekKey = getWeekKeyForDay(day);
    const hasAnySession = daySessions.length > 0 || planSessionsForDay.length > 0;
    
    const dayInfo = {
      date,
      day,
      weekKey,
      sessions: daySessions,
      planSessions: planSessionsForDay,
      planAssignments: planAssignmentsForDay,
      hasContent: daySessions.length > 0 || planAssignmentsForDay.length > 0,
      hasAnySession
    };
    
    setSelectedDayInfo(dayInfo);
    if (onSelectedDayChange) onSelectedDayChange(dayInfo);
    if (onDateSelect) {
      onDateSelect(date, dayInfo);
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
    if (!plannedSessions || plannedSessions.length === 0) {
      console.log('[CalendarView] sessionsByDate: no plannedSessions', { length: plannedSessions?.length ?? 0 });
      return map;
    }
    plannedSessions.forEach(session => {
      let dateStr = session.date;
      if (!dateStr && session.date_timestamp) {
        const timestamp = session.date_timestamp;
        const dateObj = timestamp?.toDate ? timestamp.toDate() : new Date(timestamp);
        dateStr = formatDateForStorage(dateObj);
      }
      if (dateStr) {
        if (!map[dateStr]) map[dateStr] = [];
        map[dateStr].push(session);
      } else {
        console.log('[CalendarView] sessionsByDate: session has no date', { id: session.id, keys: Object.keys(session) });
      }
    });
    console.log('[CalendarView] sessionsByDate: built map', { plannedCount: plannedSessions.length, dateKeys: Object.keys(map), sample: Object.keys(map).slice(0, 5) });
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

  // Monday = 0, Tuesday = 1, ... Sunday = 6 (matches plan dayIndex)
  const getWeekdayIndex = (day) => {
    if (day === null) return 0;
    const date = new Date(currentYear, currentMonth, day);
    return (date.getDay() + 6) % 7;
  };

  // Plan sessions for this day from the week's content (by dayIndex; null/undefined dayIndex → show on Monday)
  const getPlanSessionsForDay = (day) => {
    if (day === null) return [];
    const weekKey = getWeekKeyForDay(day);
    const weekContent = weekContentByWeekKey?.[weekKey];
    if (!weekContent?.sessions?.length) return [];
    const weekdayIndex = getWeekdayIndex(day);
    return weekContent.sessions.filter((s) => {
      const sessionDay = s.dayIndex != null ? s.dayIndex : 0;
      return sessionDay === weekdayIndex;
    });
  };

  // Handle drag over (preventDefault required for drop to fire)
  const handleDragOver = (e, day) => {
    if (day === null) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';
    setDraggedOverDay(day);
  };

  // Handle drag leave
  const handleDragLeave = (e) => {
    e.preventDefault();
    setDraggedOverDay(null);
  };

  // Handle drop (plan or library session)
  const handleDrop = (e, day) => {
    console.log('[CalendarView] handleDrop FIRED', { day, currentYear, currentMonth });
    e.preventDefault();
    e.stopPropagation();
    setDraggedOverDay(null);
    if (day === null) return;

    let rawData;
    try {
      rawData = e.dataTransfer.getData('application/json') || e.dataTransfer.getData('text/plain');
    } catch (err) {
      console.log('[CalendarView] handleDrop getData failed', err);
      return;
    }
    console.log('[CalendarView] handleDrop rawData', rawData ? rawData.substring(0, 120) : '(empty)');
    if (!rawData) return;

    try {
      const dragData = JSON.parse(rawData);
      const { type } = dragData;
      const date = new Date(currentYear, currentMonth, day);
      console.log('[CalendarView] handleDrop parsed', { type, DRAG_TYPE_LIBRARY_SESSION, DRAG_TYPE_PLAN });

      if (type === DRAG_TYPE_PLAN && dragData.planId) {
      const weekKey = getMondayWeek(date);
        if (onPlanAssignment) onPlanAssignment(dragData.planId, weekKey, day);
        return;
      }

      if (type === DRAG_TYPE_CLIENT_PLAN_SESSION && dragData.session && dragData.sourceWeekKey != null) {
        const targetWeekKey = getMondayWeek(date);
        const targetDayIndex = (date.getDay() + 6) % 7;
        if (dragData.sourceWeekKey === targetWeekKey) {
          if (onMovePlanSessionDay && targetDayIndex !== dragData.sourceDayIndex) {
            onMovePlanSessionDay({
              session: dragData.session,
              weekKey: targetWeekKey,
              weekContent: dragData.weekContent,
              targetDayIndex
            });
          }
        } else if (onMovePlanSessionToWeek) {
          const targetAssignment = planAssignments[targetWeekKey];
          onMovePlanSessionToWeek({
            session: dragData.session,
            sourceWeekKey: dragData.sourceWeekKey,
            targetWeekKey,
            targetDayIndex,
            targetPlanAssignment: targetAssignment || null
          });
        }
        return;
      }

      if (type === DRAG_TYPE_LIBRARY_SESSION && dragData.librarySessionRef) {
        if (!selectedProgramId) {
          console.warn('[CalendarView] handleDrop: need to select a program first');
          return;
        }
        const weekKey = getMondayWeek(date);
        const weekdayIndex = (date.getDay() + 6) % 7;
        if (planAssignments[weekKey] && onAddLibrarySessionToPlanDay) {
          onAddLibrarySessionToPlanDay({ weekKey, dayIndex: weekdayIndex, librarySessionId: dragData.librarySessionRef });
        } else if (onSessionAssignment) {
          onSessionAssignment({
            sessionId: dragData.librarySessionRef,
            date,
            library_session_ref: true
          });
        }
      } else {
        console.log('[CalendarView] handleDrop: type not handled', { type, hasLibraryRef: !!dragData.librarySessionRef, hasPlanId: !!dragData.planId });
      }
    } catch (error) {
      console.error('[CalendarView] handleDrop:', error);
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

  // Compute weeks visible in current month (one per row of 7 days)
  const weeksInMonth = useMemo(() => {
    const weeks = [];
    let rowStart = 0;
    while (rowStart < calendarDays.length) {
      const rowDays = calendarDays.slice(rowStart, rowStart + 7);
      const firstDayInRow = rowDays.find((d) => d !== null);
      if (firstDayInRow != null) {
        const date = new Date(currentYear, currentMonth, firstDayInRow);
        weeks.push(getMondayWeek(date));
      } else if (weeks.length > 0) {
        const prev = weeks[weeks.length - 1];
        const [y, wPart] = prev.split('-W');
        const w = parseInt(wPart, 10) || 1;
        weeks.push(`${y}-W${String(w + 1).padStart(2, '0')}`);
      }
      rowStart += 7;
    }
    return weeks;
  }, [calendarDays, currentYear, currentMonth]);

  const getPlanTitle = (planId) => {
    if (!planId) return 'Sin plan';
    const plan = plans.find((p) => p.id === planId);
    return plan?.title ?? `Plan ${planId?.slice(0, 8)}` ?? 'Plan';
  };

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

        {/* Calendar days - one row per week: plan bar (if plan) then 7 days */}
        <div
          className="calendar-days"
          onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = 'copy'; }}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setDraggedOverDay(null);
            const x = e.clientX;
            const y = e.clientY;
            const el = document.elementFromPoint(x, y);
            let dayEl = el;
            while (dayEl && dayEl !== document.body) {
              const dayAttr = dayEl.getAttribute?.('data-calendar-day');
              if (dayAttr !== null && dayAttr !== '') {
                const day = parseInt(dayAttr, 10);
                if (!Number.isNaN(day)) {
                  handleDrop(e, day);
                  return;
                }
              }
              dayEl = dayEl.parentElement;
            }
          }}
        >
          {weeksInMonth.flatMap((weekKey, rowIndex) => {
            const assignment = planAssignments[weekKey];
            const planId = assignment?.planId;
            const rowDays = calendarDays.slice(rowIndex * 7, rowIndex * 7 + 7);
            const planTitle = getPlanTitle(planId);
            const weeksNum = planWeeksCount[planId];
            const planBarLabel = weeksNum != null
              ? `${planTitle} (${weeksNum} ${weeksNum === 1 ? 'semana' : 'semanas'})`
              : planTitle;
            const planBar = planId ? (
              <div
                key={`plan-${weekKey}`}
                className="calendar-week-plan-bar"
                style={{
                  backgroundColor: PLAN_BAR_COLOR,
                  borderLeftColor: PLAN_BAR_ACCENT,
                  '--calendar-plan-gradient-start': PLAN_BAR_COLOR,
                }}
                title={planTitle}
              >
                <span className="calendar-week-plan-bar-label">{planBarLabel}</span>
              </div>
            ) : null;
            const dayCells = rowDays.map((day, colIndex) => {
            const index = rowIndex * 7 + colIndex;
            const daySessions = getSessionsForDay(day);
            const planSessionsForDay = getPlanSessionsForDay(day);
            const hasSessions = daySessions.length > 0;
            const hasPlanSessions = planSessionsForDay.length > 0;
            const dayPlanAssignments = getPlanAssignmentsForDay(day);
            const hasPlanAssignments = dayPlanAssignments.length > 0;
            const weekKey = day !== null ? getWeekKeyForDay(day) : null;
            const weekContent = weekKey ? weekContentByWeekKey[weekKey] : null;
            const isDraggedOver = draggedOverDay === day;
            const hasDayContent = hasSessions || hasPlanAssignments || hasPlanSessions;
            
            // Days under a plan bar get gradient (no solid primaryColor)
            const dayStyle = hasPlanAssignments ? { '--calendar-plan-gradient-start': PLAN_BAR_COLOR } : undefined;
            return (
              <button
                key={index}
                data-calendar-day={day !== null ? String(day) : ''}
                className={`calendar-day ${day === null ? 'calendar-day-empty' : ''} ${isToday(day) ? 'calendar-day-today' : ''} ${isSelected(day) ? 'calendar-day-selected' : ''} ${hasSessions ? 'calendar-day-has-session' : ''} ${hasPlanAssignments ? 'calendar-day-has-plan-assignment' : ''} ${isDraggedOver ? 'calendar-day-drag-over' : ''} ${hasDayContent ? 'calendar-day-has-week-content' : ''}`}
                onClick={() => handleDateClick(day)}
                onDragOver={(e) => handleDragOver(e, day)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, day)}
                disabled={day === null}
                style={dayStyle}
              >
                <span className="calendar-day-number">{day}</span>
                
                {/* Plan sessions (from week plan) - colored cards, draggable, Editar / Eliminar */}
                {hasPlanSessions && weekContent && (
                  <div className="calendar-day-session-cards">
                    {planSessionsForDay.map((session) => {
                      const sessionName = session.title || session.session_name || 'Sesión';
                      const docId = `plan-${weekKey}-${session.id}`;
                      const isMenuOpen = openSessionMenuId === docId;
                      const weekdayIdx = getWeekdayIndex(day);
                      return (
                        <div
                          key={docId}
                          className="calendar-day-session-card calendar-day-session-card-from-plan"
                          title={`${sessionName}. Arrastra a otro día o semana para mover.`}
                          onClick={(e) => e.stopPropagation()}
                          draggable={!!(onMovePlanSessionDay || onMovePlanSessionToWeek)}
                          onDragStart={(e) => {
                            if (!onMovePlanSessionDay && !onMovePlanSessionToWeek) return;
                            e.stopPropagation();
                            e.dataTransfer.setData('application/json', JSON.stringify({
                              type: DRAG_TYPE_CLIENT_PLAN_SESSION,
                              session,
                              sourceWeekKey: weekKey,
                              weekContent,
                              sourceDayIndex: weekdayIdx
                            }));
                            e.dataTransfer.effectAllowed = 'move';
                          }}
                        >
                          <span className="calendar-day-session-card-name">{sessionName}</span>
                          {(onEditPlanSession || onDeletePlanSession) && (
                            <div className="calendar-day-session-card-actions">
                              <button
                                type="button"
                                className="calendar-day-session-card-menu-trigger"
                                aria-label="Abrir menú"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setOpenSessionMenuId(isMenuOpen ? null : docId);
                                }}
                              >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                                  <circle cx="12" cy="6" r="1.5" />
                                  <circle cx="12" cy="12" r="1.5" />
                                  <circle cx="12" cy="18" r="1.5" />
                                </svg>
                              </button>
                              {isMenuOpen && (
                                <div
                                  className="calendar-day-session-card-menu"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  {onEditPlanSession && (
                                    <button
                                      type="button"
                                      className="calendar-day-session-card-menu-item"
                                      onClick={() => {
                                        setOpenSessionMenuId(null);
                                        onEditPlanSession({ session, weekKey, weekContent });
                                      }}
                                    >
                                      Editar
                                    </button>
                                  )}
                                  {onDeletePlanSession && (
                                    <button
                                      type="button"
                                      className="calendar-day-session-card-menu-item calendar-day-session-card-menu-item-danger"
                                      onClick={() => {
                                        setOpenSessionMenuId(null);
                                        onDeletePlanSession({ session, weekKey, weekContent });
                                      }}
                                    >
                                      Eliminar de esta semana
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
                
                {/* Date-assigned session name(s) in colored cards with 3-dots menu */}
                {hasSessions && (
                  <div className="calendar-day-session-cards">
                    {daySessions.map((session, idx) => {
                      const sessionName = session.session_name || session.title || `Sesión ${idx + 1}`;
                      const sessionDocId = session.id || `session-${day}-${session.session_id || idx}`;
                      const isMenuOpen = openSessionMenuId === sessionDocId;
                      const date = new Date(currentYear, currentMonth, day);
                      return (
                        <div
                          key={sessionDocId}
                          className="calendar-day-session-card"
                          title={sessionName}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <span className="calendar-day-session-card-name">{sessionName}</span>
                          <div className="calendar-day-session-card-actions">
                            <button
                              type="button"
                              className="calendar-day-session-card-menu-trigger"
                              aria-label="Abrir menú"
                              onClick={(e) => {
                                e.stopPropagation();
                                setOpenSessionMenuId(isMenuOpen ? null : sessionDocId);
                              }}
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                                <circle cx="12" cy="6" r="1.5" />
                                <circle cx="12" cy="12" r="1.5" />
                                <circle cx="12" cy="18" r="1.5" />
                              </svg>
                            </button>
                            {isMenuOpen && (
                              <div
                                className="calendar-day-session-card-menu"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <button
                                  type="button"
                                  className="calendar-day-session-card-menu-item"
                                  onClick={() => {
                                    setOpenSessionMenuId(null);
                                    if (onEditSessionAssignment) onEditSessionAssignment({ session, date });
                                  }}
                                >
                                  Editar
                                </button>
                                <button
                                  type="button"
                                  className="calendar-day-session-card-menu-item calendar-day-session-card-menu-item-danger"
                                  onClick={() => {
                                    setOpenSessionMenuId(null);
                                    if (onDeleteSessionAssignment) onDeleteSessionAssignment({ session, date });
                                  }}
                                >
                                  Eliminar
                                </button>
                              </div>
                            )}
                    </div>
                  </div>
                      );
                    })}
                  </div>
                )}
              </button>
            );
          });
            return planBar ? [ planBar, ...dayCells ] : dayCells;
          })}
        </div>
      </div>

      {/* Day Info Modal - only when this day has at least one session (date-assigned or from plan) */}
      {selectedDayInfo && selectedDayInfo.hasAnySession && (
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
                  <p className="calendar-day-info-plan-hint">Esta semana tiene un plan asignado. Arrastra sesiones desde la biblioteca a un día para asignarlas a esa fecha.</p>
                  <div className="calendar-day-info-list">
                    {selectedDayInfo.planAssignments.map((assignment, idx) => (
                      <div key={idx} className="calendar-day-info-item">
                        <div className="calendar-day-info-item-color" style={{ backgroundColor: programColors[assignment.planId] || getProgramColor(assignment.planId) || 'rgba(107, 142, 35, 0.6)' }} />
                        <div className="calendar-day-info-item-content">
                          <div className="calendar-day-info-item-title">{getPlanTitle(assignment.planId)}</div>
                          <div className="calendar-day-info-item-subtitle">Módulo {assignment.moduleIndex + 1} · Plan de la semana</div>
                          {(onPersonalizePlanWeek || onResetPlanWeek) && selectedDayInfo.weekKey && (
                            <div className="calendar-day-info-plan-actions">
                              {hasClientPlanCopy ? (
                                <button
                                  type="button"
                                  className="calendar-day-info-plan-btn calendar-day-info-plan-btn-reset"
                                  onClick={() => onResetPlanWeek?.({ assignment, weekKey: selectedDayInfo.weekKey })}
                                >
                                  Restablecer al plan original
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  className="calendar-day-info-plan-btn calendar-day-info-plan-btn-personalize"
                                  onClick={() => onPersonalizePlanWeek?.({ assignment, weekKey: selectedDayInfo.weekKey })}
                                >
                                  Personalizar esta semana
                                </button>
                              )}
                            </div>
                          )}
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

