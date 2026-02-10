import React, { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { getMondayWeek, getWeekDates } from '../utils/weekCalculation';
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
  clientUserId = null,
  onDateSelect, 
  plannedSessions = [], 
  programColors = {}, 
  completedSessionIds = new Set(),
  onMonthChange,
  planAssignments = {},
  plans = [],
  onPlanAssignment,
  onRemovePlanFromWeek,
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
  planWeeksCount = {}, // optional: { [planId]: number } for "Plan name (N semanas)"
  onVerDesempeno = null
}) => {
  const PLAN_BAR_COLOR = 'rgba(78, 64, 44, 0.96)'; // rich bronze/amber (más llamativo)
  const PLAN_BAR_ACCENT = 'rgba(191, 168, 77, 0.65)'; // visible gold accent
  const today = new Date();
  const [currentDate, setCurrentDate] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState(null);
  const [draggedOverDay, setDraggedOverDay] = useState(null);
  const [selectedDayInfo, setSelectedDayInfo] = useState(null);
  const [sessionMenuContext, setSessionMenuContext] = useState(null);
  const openSessionMenuId = sessionMenuContext?.id ?? null;
  const [planBarMenuContext, setPlanBarMenuContext] = useState(null);

  const currentYear = currentDate.getFullYear();
  const currentMonth = currentDate.getMonth();

  useEffect(() => {
    console.log('[CalendarView] plannedSessions prop changed', { length: plannedSessions?.length ?? 0, sample: plannedSessions?.slice(0, 2)?.map(s => ({ id: s.id, date: s.date, client_id: s.client_id })) });
  }, [plannedSessions]);

  // Close session card menu when clicking outside (not on trigger or portal menu)
  useEffect(() => {
    if (!sessionMenuContext) return;
    const close = (e) => {
      if (e.target.closest('.calendar-day-session-card-actions') || e.target.closest('.calendar-day-session-card-menu-portal')) return;
      setSessionMenuContext(null);
    };
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [sessionMenuContext]);

  // Close plan bar menu when clicking outside
  useEffect(() => {
    if (!planBarMenuContext) return;
    const close = (e) => {
      if (e.target.closest('.calendar-week-plan-bar-actions') || e.target.closest('.calendar-week-plan-bar-menu-portal')) return;
      setPlanBarMenuContext(null);
    };
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [planBarMenuContext]);

  // Get Date from cell { day, monthOffset }
  const getDateFromCell = (cell) => {
    if (!cell) return null;
    return new Date(currentYear, currentMonth + cell.monthOffset, cell.day);
  };

  // Get first day of month and number of days
  const firstDayOfMonth = new Date(currentYear, currentMonth, 1);
  const lastDayOfMonth = new Date(currentYear, currentMonth + 1, 0);
  const daysInMonth = lastDayOfMonth.getDate();
  // Convert Sunday (0) to 6, Monday (1) to 0, etc. so Monday is first
  const startingDayOfWeek = (firstDayOfMonth.getDay() + 6) % 7;

  // Generate calendar days - each cell has { day, monthOffset } (monthOffset: 0=current, -1=prev, +1=next)
  const calendarDays = [];
  const totalCells = Math.ceil((startingDayOfWeek + daysInMonth) / 7) * 7;
  const trailingCount = Math.max(0, totalCells - startingDayOfWeek - daysInMonth);

  // Leading cells (past month)
  for (let i = 0; i < startingDayOfWeek; i++) {
    const d = new Date(currentYear, currentMonth, 1 - (startingDayOfWeek - i));
    calendarDays.push({ day: d.getDate(), monthOffset: -1 });
  }
  // Current month
  for (let day = 1; day <= daysInMonth; day++) {
    calendarDays.push({ day, monthOffset: 0 });
  }
  // Trailing cells (future month)
  for (let i = 0; i < trailingCount; i++) {
    calendarDays.push({ day: i + 1, monthOffset: 1 });
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

  const handleDateClick = (cell) => {
    if (!cell) return;
    const date = getDateFromCell(cell);
    setSelectedDate(date);
    
    // Collect information for this day
    const daySessions = getSessionsForCell(cell);
    const planAssignmentsForDay = getPlanAssignmentsForCell(cell);
    const planSessionsForDay = getPlanSessionsForCell(cell);
    // Exclude plan-origin client_sessions when plan sessions shown (same filter as calendar display)
    const displayedDaySessions = planSessionsForDay.length > 0
      ? daySessions.filter((s) => !s.plan_id)
      : daySessions;
    const weekKey = getWeekKeyForCell(cell);
    const hasAnySession = displayedDaySessions.length > 0 || planSessionsForDay.length > 0;
    
    const dayInfo = {
      date,
      day,
      weekKey,
      sessions: displayedDaySessions,
      planSessions: planSessionsForDay,
      planAssignments: planAssignmentsForDay,
      hasContent: displayedDaySessions.length > 0 || planAssignmentsForDay.length > 0,
      hasAnySession
    };
    
    setSelectedDayInfo(dayInfo);
    if (onSelectedDayChange) onSelectedDayChange(dayInfo);
    if (onDateSelect) {
      onDateSelect(date, dayInfo);
    }
  };

  const isToday = (cell) => {
    if (!cell) return false;
    const date = getDateFromCell(cell);
    const today = new Date();
    return (
      date.getDate() === today.getDate() &&
      date.getMonth() === today.getMonth() &&
      date.getFullYear() === today.getFullYear()
    );
  };

  const isSelected = (cell) => {
    if (!cell || !selectedDate) return false;
    const date = getDateFromCell(cell);
    return (
      date.getDate() === selectedDate.getDate() &&
      date.getMonth() === selectedDate.getMonth() &&
      date.getFullYear() === selectedDate.getFullYear()
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

  // Monday = 0, Tuesday = 1, ... Sunday = 6 (for dateStr YYYY-MM-DD)
  const getWeekdayIndexFromDateStr = (dateStr) => {
    if (!dateStr) return 0;
    const d = new Date(dateStr + 'T12:00:00');
    return (d.getDay() + 6) % 7;
  };

  // Create a map of date strings to sessions for quick lookup.
  // Plan-origin sessions (plan_id set) are only shown on the weekday that matches day_index to avoid ghost sessions on other days.
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
        const isPlanOrigin = !!session.plan_id;
        const dayIndex = session.day_index != null ? session.day_index : 0;
        if (isPlanOrigin && getWeekdayIndexFromDateStr(dateStr) !== dayIndex) {
          return;
        }
        if (!map[dateStr]) map[dateStr] = [];
        map[dateStr].push(session);
      } else {
        console.log('[CalendarView] sessionsByDate: session has no date', { id: session.id, keys: Object.keys(session) });
      }
    });
    console.log('[CalendarView] sessionsByDate: built map', { plannedCount: plannedSessions.length, dateKeys: Object.keys(map), sample: Object.keys(map).slice(0, 5) });
    return map;
  }, [plannedSessions]);

  // Debug: log exact completed IDs and candidate IDs so we can see any mismatch (must run after sessionsByDate is defined)
  useEffect(() => {
    const size = completedSessionIds?.size ?? 0;
    const completedArr = size ? [...completedSessionIds] : [];
    console.log('[CalendarView] completedSessionIds (exact)', { size, ids: completedArr });

    if (size === 0) return;

    const dateKeys = plannedSessions?.length ? Object.keys(sessionsByDate || {}) : [];
    const dateSessionsSample = [];
    for (const dateStr of dateKeys.slice(0, 5)) {
      const sessions = sessionsByDate[dateStr] || [];
      for (const s of sessions.slice(0, 2)) {
        const candidateIds = [s.id, s.session_id].filter(Boolean);
        const matched = candidateIds.some((id) => id && completedSessionIds.has(id));
        dateSessionsSample.push({ dateStr, session_id: s.session_id, sessionId: s.id, candidateIds, matched });
      }
    }
    if (dateSessionsSample.length) {
      console.log('[CalendarView] PLANNED vs COMPLETED (date-assigned). Completed ids:', completedArr);
      dateSessionsSample.forEach((item, i) => {
        const inId = completedSessionIds.has(item.sessionId);
        const inSessionId = completedSessionIds.has(item.session_id);
        console.log(`  [${i}] PLANNED id=${item.sessionId} session_id=${item.session_id} date=${item.dateStr} | inCompleted: id? ${inId} session_id? ${inSessionId} | MATCH: ${item.matched}`);
      });
    }

    const weekKeys = weekContentByWeekKey ? Object.keys(weekContentByWeekKey) : [];
    const planSessionsSample = [];
    for (const weekKey of weekKeys.slice(0, 3)) {
      const weekContent = weekContentByWeekKey[weekKey];
      const sessions = weekContent?.sessions || [];
      let weekStartDate;
      try {
        const { start } = getWeekDates(weekKey);
        weekStartDate = start;
      } catch (_) {
        weekStartDate = null;
      }
      for (const s of sessions.slice(0, 3)) {
        const dayIndex = s.dayIndex != null ? s.dayIndex : 0;
        const sessionDate = weekStartDate ? new Date(weekStartDate.getTime()) : null;
        if (sessionDate) sessionDate.setDate(sessionDate.getDate() + dayIndex);
        const y = sessionDate?.getFullYear();
        const m = sessionDate != null && !Number.isNaN(y) ? String(sessionDate.getMonth() + 1).padStart(2, '0') : null;
        const d = sessionDate != null && !Number.isNaN(y) ? String(sessionDate.getDate()).padStart(2, '0') : null;
        const dateStrForDay = y != null && m != null && d != null ? `${y}-${m}-${d}` : null;
        const clientSessionDocId = clientUserId && dateStrForDay ? `${clientUserId}_${dateStrForDay}_${s.id}` : null;
        const candidateIds = [s.id, s.session_id, clientSessionDocId, s.librarySessionRef].filter(Boolean);
        const matched = candidateIds.some((id) => id && completedSessionIds.has(id));
        planSessionsSample.push({
          weekKey,
          dayIndex,
          dateStrForDay,
          sessionId: s.id,
          session_id: s.session_id,
          librarySessionRef: s.librarySessionRef,
          clientSessionDocId,
          candidateIds,
          matched
        });
      }
    }
    if (planSessionsSample.length) {
      console.log('[CalendarView] PLANNED vs COMPLETED (plan). Completed ids:', completedArr);
      planSessionsSample.forEach((item, i) => {
        const inId = completedSessionIds.has(item.sessionId);
        const inSessionId = completedSessionIds.has(item.session_id);
        const inLibRef = completedSessionIds.has(item.librarySessionRef);
        const inDocId = completedSessionIds.has(item.clientSessionDocId);
        console.log(`  [${i}] PLANNED id=${item.sessionId} session_id=${item.session_id} libraryRef=${item.librarySessionRef ?? 'n/a'} docId=${item.clientSessionDocId ?? 'n/a'} | inCompleted: id? ${inId} session_id? ${inSessionId} libraryRef? ${inLibRef} docId? ${inDocId} | MATCH: ${item.matched}`);
      });
    }
  }, [completedSessionIds, plannedSessions, sessionsByDate, weekContentByWeekKey, clientUserId]);

  // Get sessions for a specific cell
  const getSessionsForCell = (cell) => {
    if (!cell) return [];
    const date = getDateFromCell(cell);
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

  // Get week key for a specific cell
  const getWeekKeyForCell = (cell) => {
    if (!cell) return null;
    const date = getDateFromCell(cell);
    return getMondayWeek(date);
  };

  // Get plan assignments for a specific cell
  const getPlanAssignmentsForCell = (cell) => {
    if (!cell) return [];
    const weekKey = getWeekKeyForCell(cell);
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
  const getWeekdayIndex = (cell) => {
    if (!cell) return 0;
    const date = getDateFromCell(cell);
    return (date.getDay() + 6) % 7;
  };

  // Plan sessions for this cell from the week's content (by dayIndex; null/undefined dayIndex → show on Monday)
  const getPlanSessionsForCell = (cell) => {
    if (!cell) return [];
    const weekKey = getWeekKeyForCell(cell);
    const weekContent = weekContentByWeekKey?.[weekKey];
    if (!weekContent?.sessions?.length) return [];
    const weekdayIndex = getWeekdayIndex(cell);
    return weekContent.sessions.filter((s) => {
      const sessionDay = s.dayIndex != null ? s.dayIndex : 0;
      return sessionDay === weekdayIndex;
    });
  };

  // Count how many calendar cards show each "naked" session id, and the first dateStr where each appears.
  // When the same session appears on multiple days, we only mark the first occurrence as completed (by naked match).
  const { nakedIdToCount, nakedIdToFirstDateStr } = useMemo(() => {
    const count = new Map();
    const firstDateStr = new Map();
    for (let i = 0; i < calendarDays.length; i++) {
      const cell = calendarDays[i];
      const date = getDateFromCell(cell);
      const dateStr = formatDateForStorage(date);
      const weekKey = getWeekKeyForCell(cell);
      const weekContent = weekContentByWeekKey?.[weekKey];
      const weekdayIndex = (date.getDay() + 6) % 7;
      const planSessionsForDay = weekContent?.sessions?.filter((s) => (s.dayIndex != null ? s.dayIndex : 0) === weekdayIndex) ?? [];
      const daySessions = sessionsByDate[dateStr] ?? [];
      const displayed = planSessionsForDay.length > 0 ? daySessions.filter((s) => !s.plan_id) : daySessions;
      for (const s of planSessionsForDay) {
        const id = s.librarySessionRef || s.session_id;
        if (id) {
          count.set(id, (count.get(id) || 0) + 1);
          if (!firstDateStr.has(id)) firstDateStr.set(id, dateStr);
        }
      }
      for (const s of displayed) {
        if (s.session_id) {
          count.set(s.session_id, (count.get(s.session_id) || 0) + 1);
          if (!firstDateStr.has(s.session_id)) firstDateStr.set(s.session_id, dateStr);
        }
      }
    }
    return { nakedIdToCount: count, nakedIdToFirstDateStr: firstDateStr };
  }, [calendarDays, weekContentByWeekKey, sessionsByDate, currentYear, currentMonth]);

  // Check if session is completed. Prefer date-specific id (client_session doc id). If only a "naked" session id
  // matches: when it appears on one card, show green; when it appears on multiple cards, show green only on the
  // first occurrence (by date) so we don't mark all of them.
  const isSessionCompleted = (candidateIds, dateSpecificIds, options = {}) => {
    if (!completedSessionIds?.size) return false;
    const { nakedIdToCountMap = nakedIdToCount, nakedIdToFirstDateStrMap = nakedIdToFirstDateStr, thisDateStr = null } = options;
    const dateSpecificSet = new Set((dateSpecificIds || []).filter(Boolean));
    for (const id of candidateIds) {
      if (!id || !completedSessionIds.has(id)) continue;
      if (dateSpecificSet.has(id)) return true;
    }
    for (const id of candidateIds) {
      if (!id || !completedSessionIds.has(id)) continue;
      if (dateSpecificSet.has(id)) continue;
      const n = nakedIdToCountMap.get(id);
      if (n === undefined || n <= 1) return true;
      if (thisDateStr && nakedIdToFirstDateStrMap.get(id) === thisDateStr) return true;
      return false;
    }
    return false;
  };

  // Handle drag over (preventDefault required for drop to fire)
  const handleDragOver = (e, index) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';
    setDraggedOverDay(index);
  };

  // Handle drag leave
  const handleDragLeave = (e) => {
    e.preventDefault();
    setDraggedOverDay(null);
  };

  // Handle drop (plan or library session)
  const handleDrop = (e, cell) => {
    e.preventDefault();
    e.stopPropagation();
    setDraggedOverDay(null);
    if (!cell) return;

    const date = getDateFromCell(cell);
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

      if (type === DRAG_TYPE_PLAN && dragData.planId) {
        const weekKey = getMondayWeek(date);
        if (onPlanAssignment) onPlanAssignment(dragData.planId, weekKey, date.getDate());
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
              const idxAttr = dayEl.getAttribute?.('data-calendar-index');
              if (idxAttr !== null && idxAttr !== '') {
                const idx = parseInt(idxAttr, 10);
                if (!Number.isNaN(idx) && calendarDays[idx]) {
                  handleDrop(e, calendarDays[idx]);
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
                {onRemovePlanFromWeek && (
                  <div className="calendar-week-plan-bar-actions">
                    <button
                      type="button"
                      className="calendar-week-plan-bar-menu-trigger"
                      aria-label="Opciones del plan"
                      onClick={(e) => {
                        e.stopPropagation();
                        const isOpen = planBarMenuContext?.weekKey === weekKey;
                        if (isOpen) {
                          setPlanBarMenuContext(null);
                        } else {
                          setPlanBarMenuContext({ weekKey, anchorEl: e.currentTarget });
                        }
                      }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                        <circle cx="12" cy="6" r="1.5" />
                        <circle cx="12" cy="12" r="1.5" />
                        <circle cx="12" cy="18" r="1.5" />
                      </svg>
                    </button>
                  </div>
                )}
              </div>
            ) : null;
            const dayCells = rowDays.map((cell, colIndex) => {
            const index = rowIndex * 7 + colIndex;
            const isOtherMonth = cell?.monthOffset !== 0;
            const daySessions = getSessionsForCell(cell);
            const planSessionsForDay = getPlanSessionsForCell(cell);
            // Exclude plan-origin client_sessions when plan sessions are shown - they're duplicates
            // created for PWA sync; showing both caused a ghost "Sesión 1" card that errored on edit
            const displayedDaySessions = planSessionsForDay.length > 0
              ? daySessions.filter((s) => !s.plan_id)
              : daySessions;
            const hasSessions = displayedDaySessions.length > 0;
            const hasPlanSessions = planSessionsForDay.length > 0;
            const dayPlanAssignments = getPlanAssignmentsForCell(cell);
            const hasPlanAssignments = dayPlanAssignments.length > 0;
            const weekKey = getWeekKeyForCell(cell);
            const weekContent = weekKey ? weekContentByWeekKey[weekKey] : null;
            const isDraggedOver = draggedOverDay === index;
            const hasDayContent = hasSessions || hasPlanAssignments || hasPlanSessions;
            const cellDate = getDateFromCell(cell);
            const dateStr = formatDateForStorage(cellDate);

            // Days under a plan bar get gradient (no solid primaryColor)
            const dayStyle = hasPlanAssignments ? { '--calendar-plan-gradient-start': PLAN_BAR_COLOR } : undefined;
            return (
              <div
                key={index}
                role="button"
                tabIndex={0}
                data-calendar-day={dateStr}
                data-calendar-index={index}
                className={`calendar-day ${isOtherMonth ? 'calendar-day-other-month' : ''} ${isToday(cell) ? 'calendar-day-today' : ''} ${isSelected(cell) ? 'calendar-day-selected' : ''} ${hasSessions ? 'calendar-day-has-session' : ''} ${hasPlanAssignments ? 'calendar-day-has-plan-assignment' : ''} ${isDraggedOver ? 'calendar-day-drag-over' : ''} ${hasDayContent ? 'calendar-day-has-week-content' : ''}`}
                onClick={() => handleDateClick(cell)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleDateClick(cell); } }}
                onDragOver={(e) => { handleDragOver(e, index); }}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, cell)}
                style={dayStyle}
              >
                <span className="calendar-day-number">{cell.day}</span>
                
                {/* Plan sessions (from week plan) - colored cards, draggable, Editar / Eliminar */}
                {hasPlanSessions && weekContent && (
                  <div className="calendar-day-session-cards">
                    {planSessionsForDay.map((session) => {
                      const sessionName = session.title || session.session_name || 'Sesión';
                      const docId = `plan-${weekKey}-${session.id}`;
                      const isMenuOpen = openSessionMenuId === docId;
                      const weekdayIdx = getWeekdayIndex(cell);
                      const clientSessionDocId = clientUserId && cellDate ? `${clientUserId}_${dateStr}_${session.id}` : null;
                      const planCandidateIds = [session.id, session.session_id, clientSessionDocId, session.librarySessionRef].filter(Boolean);
                      const isCompleted = isSessionCompleted(planCandidateIds, [clientSessionDocId], { thisDateStr: dateStr });
                      return (
                        <div
                          key={docId}
                          className={`calendar-day-session-card calendar-day-session-card-from-plan ${isCompleted ? 'calendar-day-session-card-completed' : ''}`}
                          title={`${sessionName}. Arrastra a otro día o semana para mover.`}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (isCompleted && (onEditPlanSession || onDeletePlanSession)) {
                              if (isMenuOpen) setSessionMenuContext(null);
                              else setSessionMenuContext({
                                id: docId,
                                anchorEl: e.currentTarget,
                                type: 'plan',
                                session,
                                weekKey,
                                weekContent,
                                isCompleted: true
                              });
                            }
                          }}
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
                                  if (isMenuOpen) {
                                    setSessionMenuContext(null);
                                  } else {
                                    setSessionMenuContext({
                                      id: docId,
                                      anchorEl: e.currentTarget,
                                      type: 'plan',
                                      session,
                                      weekKey,
                                      weekContent,
                                      isCompleted
                                    });
                                  }
                                }}
                              >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                                  <circle cx="12" cy="6" r="1.5" />
                                  <circle cx="12" cy="12" r="1.5" />
                                  <circle cx="12" cy="18" r="1.5" />
                                </svg>
                              </button>
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
                    {displayedDaySessions.map((session, idx) => {
                      const sessionName = session.session_name || session.title || `Sesión ${idx + 1}`;
                      const sessionDocId = session.id || `session-${dateStr}-${session.session_id || idx}`;
                      const isMenuOpen = openSessionMenuId === sessionDocId;
                      const dateCandidateIds = [session.id, session.session_id].filter(Boolean);
                      const isCompleted = isSessionCompleted(dateCandidateIds, [session.id], { thisDateStr: dateStr });
                      return (
                        <div
                          key={sessionDocId}
                          className={`calendar-day-session-card ${isCompleted ? 'calendar-day-session-card-completed' : ''}`}
                          title={sessionName}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (isCompleted) {
                              if (isMenuOpen) setSessionMenuContext(null);
                              else setSessionMenuContext({
                                id: sessionDocId,
                                anchorEl: e.currentTarget,
                                type: 'date',
                                session,
                                date: cellDate,
                                isCompleted: true
                              });
                            }
                          }}
                        >
                          <span className="calendar-day-session-card-name">{sessionName}</span>
                          <div className="calendar-day-session-card-actions">
                            <button
                              type="button"
                              className="calendar-day-session-card-menu-trigger"
                              aria-label="Abrir menú"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (isMenuOpen) {
                                  setSessionMenuContext(null);
                                } else {
                                  setSessionMenuContext({
                                    id: sessionDocId,
                                    anchorEl: e.currentTarget,
                                    type: 'date',
                                    session,
                                    date: cellDate,
                                    isCompleted
                                  });
                                }
                              }}
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                                <circle cx="12" cy="6" r="1.5" />
                                <circle cx="12" cy="12" r="1.5" />
                                <circle cx="12" cy="18" r="1.5" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          });
            return planBar ? [ planBar, ...dayCells ] : dayCells;
          })}
        </div>
      </div>

      {/* Plan bar menu in portal */}
      {planBarMenuContext?.anchorEl && onRemovePlanFromWeek && (() => {
        const rect = planBarMenuContext.anchorEl.getBoundingClientRect();
        const menuWidth = 160;
        const menuStyle = {
          position: 'fixed',
          top: rect.bottom + 2,
          left: Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - 8),
          zIndex: 10000,
        };
        if (menuStyle.left < 8) menuStyle.left = 8;
        return createPortal(
          <div
            className="calendar-week-plan-bar-menu-portal"
            style={menuStyle}
            role="menu"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="calendar-day-session-card-menu-item calendar-day-session-card-menu-item-danger"
              onClick={() => {
                setPlanBarMenuContext(null);
                onRemovePlanFromWeek(planBarMenuContext.weekKey);
              }}
            >
              Quitar plan de esta semana
            </button>
          </div>,
          document.body
        );
      })()}

      {/* Session card menu rendered in portal so it is not inside the calendar-day button and stays clickable */}
      {sessionMenuContext?.anchorEl && (() => {
        const rect = sessionMenuContext.anchorEl.getBoundingClientRect();
        const menuWidth = 140;
        const menuStyle = {
          position: 'fixed',
          top: rect.bottom + 2,
          left: Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - 8),
          zIndex: 10000,
        };
        if (menuStyle.left < 8) menuStyle.left = 8;
        return createPortal(
          <div
            className="calendar-day-session-card-menu-portal"
            style={menuStyle}
            role="menu"
            onClick={(e) => e.stopPropagation()}
          >
            {sessionMenuContext.type === 'plan' && (
              <>
                {sessionMenuContext.isCompleted && (
                  <button
                    type="button"
                    className="calendar-day-session-card-menu-item"
                    onClick={() => {
                      if (onVerDesempeno) {
                        onVerDesempeno({
                          session: sessionMenuContext.session,
                          type: 'plan',
                          weekKey: sessionMenuContext.weekKey,
                          weekContent: sessionMenuContext.weekContent,
                          date: sessionMenuContext.date,
                        });
                      }
                      setSessionMenuContext(null);
                    }}
                  >
                    Ver desempeño
                  </button>
                )}
                {onEditPlanSession && (
                  <button
                    type="button"
                    className="calendar-day-session-card-menu-item"
                    onClick={() => {
                      setSessionMenuContext(null);
                      onEditPlanSession({
                        session: sessionMenuContext.session,
                        weekKey: sessionMenuContext.weekKey,
                        weekContent: sessionMenuContext.weekContent
                      });
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
                      setSessionMenuContext(null);
                      onDeletePlanSession({
                        session: sessionMenuContext.session,
                        weekKey: sessionMenuContext.weekKey,
                        weekContent: sessionMenuContext.weekContent
                      });
                    }}
                  >
                    Eliminar de esta semana
                  </button>
                )}
              </>
            )}
            {sessionMenuContext.type === 'date' && (
              <>
                {sessionMenuContext.isCompleted && (
                  <button
                    type="button"
                    className="calendar-day-session-card-menu-item"
                    onClick={() => {
                      if (onVerDesempeno) {
                        onVerDesempeno({
                          session: sessionMenuContext.session,
                          type: 'date',
                          date: sessionMenuContext.date,
                        });
                      }
                      setSessionMenuContext(null);
                    }}
                  >
                    Ver desempeño
                  </button>
                )}
                <button
                  type="button"
                  className="calendar-day-session-card-menu-item"
                  onClick={() => {
                    setSessionMenuContext(null);
                    if (onEditSessionAssignment) onEditSessionAssignment({ session: sessionMenuContext.session, date: sessionMenuContext.date });
                  }}
                >
                  Editar
                </button>
                <button
                  type="button"
                  className="calendar-day-session-card-menu-item calendar-day-session-card-menu-item-danger"
                  onClick={() => {
                    setSessionMenuContext(null);
                    if (onDeleteSessionAssignment) onDeleteSessionAssignment({ session: sessionMenuContext.session, date: sessionMenuContext.date });
                  }}
                >
                  Eliminar
                </button>
              </>
            )}
          </div>,
          document.body
        );
      })()}

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

