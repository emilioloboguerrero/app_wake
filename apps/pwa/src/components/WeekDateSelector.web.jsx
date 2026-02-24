import React, { useState, useMemo, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import logger from '../utils/logger';

const DAY_NAMES = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const DAY_NAMES_DISPLAY = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const MONTH_NAMES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

function toYYYYMMDD(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getMonday(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

function isSameDay(a, b) {
  if (!a || !b) return false;
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function isToday(d) {
  const t = new Date();
  return isSameDay(d, t);
}

function getSundayOfCurrentWeek() {
  const t = new Date();
  t.setHours(0, 0, 0, 0);
  const monday = getMonday(t);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return sunday;
}

function isPastCurrentWeek(d) {
  const dNorm = new Date(d);
  dNorm.setHours(0, 0, 0, 0);
  const sunday = getSundayOfCurrentWeek();
  return dNorm > sunday;
}

function formatDateLabel(d) {
  const dayName = DAY_NAMES_DISPLAY[d.getDay()];
  const dayNum = d.getDate();
  const month = MONTH_NAMES[d.getMonth()];
  return `${dayName}, ${month} ${dayNum}`;
}

function getCalendarGridCells(calendarMonth) {
  const year = calendarMonth.getFullYear();
  const month = calendarMonth.getMonth();
  const first = new Date(year, month, 1);
  const startDow = (first.getDay() + 6) % 7;
  const startDate = new Date(first);
  startDate.setDate(first.getDate() - startDow);
  const cells = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(startDate);
    d.setDate(startDate.getDate() + i);
    cells.push({
      date: d,
      day: d.getDate(),
      inMonth: d.getMonth() === month,
    });
  }
  return cells;
}

const ENTRY_GREEN = 'rgba(34, 140, 70, 0.95)';

function monthKey(date) {
  const d = date instanceof Date ? date : new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default function WeekDateSelector({
  selectedDate,
  onDateChange,
  fetchDatesWithEntries,
  fetchDatesWithPlanned,
  initialDatesWithPlanned,
  initialDatesWithEntries,
  initialMonthKey,
}) {
  const selected = useMemo(() => (selectedDate ? new Date(selectedDate + 'T12:00:00') : new Date()), [selectedDate]);

  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [anchorRect, setAnchorRect] = useState(null);
  const [calendarMonth, setCalendarMonth] = useState(() => new Date(selected.getFullYear(), selected.getMonth(), 1));
  const [datesWithEntries, setDatesWithEntries] = useState([]);
  const [datesWithPlanned, setDatesWithPlanned] = useState([]);
  const pillRef = useRef(null);
  const dropdownRef = useRef(null);
  const calendarMonthRef = useRef(calendarMonth);
  calendarMonthRef.current = calendarMonth;
  const fetchCacheRef = useRef({});

  useEffect(() => {
    if (selectedDate) {
      const d = new Date(selectedDate + 'T12:00:00');
      setCalendarMonth(new Date(d.getFullYear(), d.getMonth(), 1));
    }
  }, [selectedDate]);

  const gridCells = useMemo(() => getCalendarGridCells(calendarMonth), [calendarMonth]);

  // Invalidate cache when fetch functions change (e.g. course loads and isOneOnOne becomes true)
  useEffect(() => {
    fetchCacheRef.current = {};
  }, [fetchDatesWithPlanned, fetchDatesWithEntries]);

  useEffect(() => {
    if (!dropdownOpen) return;
    const y = calendarMonth.getFullYear();
    const m = calendarMonth.getMonth();
    const key = monthKey(calendarMonth);
    const start = `${y}-${String(m + 1).padStart(2, '0')}-01`;
    const lastDay = new Date(y, m + 1, 0).getDate();
    const end = `${y}-${String(m + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    // 1. Cache hit — already fetched this month during this session
    if (fetchCacheRef.current[key]) {
      logger.log('[WeekDateSelector.web] calendar open: using cache', { key, plannedCount: fetchCacheRef.current[key].planned?.length, entriesCount: fetchCacheRef.current[key].entries?.length });
      setDatesWithPlanned(fetchCacheRef.current[key].planned);
      setDatesWithEntries(fetchCacheRef.current[key].entries);
      return;
    }

    // 2. Pre-fetched initial data available for this month — use it, skip live fetch
    const hasInitialArrays = Array.isArray(initialDatesWithPlanned) && Array.isArray(initialDatesWithEntries);
    const monthMatch = key === initialMonthKey;
    if (monthMatch && hasInitialArrays) {
      logger.log('[WeekDateSelector.web] calendar open: using initial data', { key, initialMonthKey, plannedCount: initialDatesWithPlanned.length, entriesCount: initialDatesWithEntries.length });
      fetchCacheRef.current[key] = { planned: initialDatesWithPlanned, entries: initialDatesWithEntries };
      setDatesWithPlanned(initialDatesWithPlanned);
      setDatesWithEntries(initialDatesWithEntries);
      return;
    }

    // 3. Live fetch — both queries in parallel
    logger.log('[WeekDateSelector.web] calendar open: live fetch', {
      key,
      initialMonthKey,
      monthMatch,
      hasInitialArrays,
      hasFetchPlanned: !!fetchDatesWithPlanned,
      hasFetchEntries: !!fetchDatesWithEntries,
    });
    setDatesWithPlanned([]);
    setDatesWithEntries([]);
    Promise.all([
      fetchDatesWithPlanned ? fetchDatesWithPlanned(start, end) : Promise.resolve([]),
      fetchDatesWithEntries ? fetchDatesWithEntries(start, end) : Promise.resolve([]),
    ]).then(([planned, entries]) => {
      const plannedList = Array.isArray(planned) ? planned : [];
      const entriesList = Array.isArray(entries) ? entries : [];
      logger.log('[WeekDateSelector.web] live fetch resolved', { key, plannedCount: plannedList.length, entriesCount: entriesList.length, stillCurrentMonth: monthKey(calendarMonthRef.current) === key });
      if (monthKey(calendarMonthRef.current) === key) {
        fetchCacheRef.current[key] = { planned: plannedList, entries: entriesList };
        setDatesWithPlanned(plannedList);
        setDatesWithEntries(entriesList);
      }
    });
  }, [dropdownOpen, calendarMonth, fetchDatesWithEntries, fetchDatesWithPlanned, initialMonthKey, initialDatesWithPlanned, initialDatesWithEntries]);

  useEffect(() => {
    if (!dropdownOpen) return;
    const handleClick = (e) => {
      if (pillRef.current?.contains(e.target) || dropdownRef.current?.contains(e.target)) return;
      closeCalendar();
    };
    const t = setTimeout(() => document.addEventListener('mousedown', handleClick), 0);
    return () => {
      clearTimeout(t);
      document.removeEventListener('mousedown', handleClick);
    };
  }, [dropdownOpen]);

  const prevMonth = () => setCalendarMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1));
  const nextMonth = () => setCalendarMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1));

  const handleDaySelect = (cell) => {
    if (isPastCurrentWeek(cell.date)) return;
    onDateChange(toYYYYMMDD(cell.date));
    setDropdownOpen(false);
    setAnchorRect(null);
  };

  const openCalendar = () => {
    const el = pillRef.current;
    if (typeof el?.getBoundingClientRect === 'function') {
      setAnchorRect(el.getBoundingClientRect());
    } else {
      setAnchorRect({ bottom: 200, right: 24 });
    }
    setDropdownOpen(true);
  };

  const closeCalendar = () => {
    setDropdownOpen(false);
    setAnchorRect(null);
  };

  const calendarOverlay =
    dropdownOpen && anchorRect ? (
      <>
        <TouchableOpacity
          style={[styles.backdrop, { pointerEvents: 'auto' }]}
          onPress={closeCalendar}
          activeOpacity={1}
          accessibilityLabel="Cerrar calendario"
        />
        <View
          ref={dropdownRef}
          style={[
            styles.dropdown,
            styles.dropdownPortal,
            typeof window !== 'undefined'
              ? (() => {
                  const dw = 320;
                  const left = window.innerWidth / 2 - dw / 2;
                  return {
                    top: anchorRect.bottom + 6,
                    left: Math.max(8, Math.min(left, window.innerWidth - dw - 8)),
                  };
                })()
              : { top: anchorRect.bottom + 6, right: 0 },
            { pointerEvents: 'box-none' },
          ]}
        >
          <View style={styles.dropdownInner}>
            <View style={styles.calendarHeader}>
              <TouchableOpacity style={styles.navBtn} onPress={prevMonth} accessibilityLabel="Mes anterior">
                <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.8)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <Path d="M15 18L9 12L15 6" />
                </Svg>
              </TouchableOpacity>
              <Text style={styles.calendarMonthLabel}>
                {MONTH_NAMES[calendarMonth.getMonth()]} {calendarMonth.getFullYear()}
              </Text>
              <TouchableOpacity style={styles.navBtn} onPress={nextMonth} accessibilityLabel="Mes siguiente">
                <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.8)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <Path d="M9 18L15 12L9 6" />
                </Svg>
              </TouchableOpacity>
            </View>
            <View style={styles.weekdayRow}>
              {DAY_NAMES.map((name) => (
                <Text key={name} style={styles.weekdayCell}>
                  {name}
                </Text>
              ))}
            </View>
            <View style={styles.grid}>
              {gridCells.map((cell, i) => {
                const ymd = toYYYYMMDD(cell.date);
                const selectedCell = selectedDate === ymd;
                const todayCell = isToday(cell.date);
                const hasEntries = datesWithEntries.includes(ymd);
                const hasPlannedNotCompleted = datesWithPlanned.length > 0 && datesWithPlanned.includes(ymd) && !hasEntries;
                const disabled = isPastCurrentWeek(cell.date);
                return (
                  <TouchableOpacity
                    key={i}
                    style={[
                      styles.gridCell,
                      !cell.inMonth && styles.gridCellOther,
                      selectedCell && styles.gridCellSelected,
                      disabled && styles.gridCellFuture,
                    ]}
                    onPress={() => handleDaySelect(cell)}
                    activeOpacity={0.7}
                    disabled={disabled}
                  >
                    <Text
                      style={[
                        styles.gridCellText,
                        !cell.inMonth && styles.gridCellTextOther,
                        hasEntries && styles.gridCellTextHasEntries,
                        selectedCell && !hasEntries && styles.gridCellTextSelected,
                        disabled && styles.gridCellTextFuture,
                      ]}
                    >
                      {cell.day}
                    </Text>
                    {todayCell && !selectedCell && <View style={styles.gridTodayDot} />}
                    {hasPlannedNotCompleted && !todayCell && <View style={styles.gridPlannedDot} />}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </View>
      </>
    ) : null;

  const prevDay = () => {
    const d = new Date(selected);
    d.setDate(d.getDate() - 1);
    onDateChange(toYYYYMMDD(d));
  };
  const nextDay = () => {
    const d = new Date(selected);
    d.setDate(d.getDate() + 1);
    if (isPastCurrentWeek(d)) return;
    onDateChange(toYYYYMMDD(d));
  };
  const canGoNext = !isPastCurrentWeek((() => {
    const d = new Date(selected);
    d.setDate(d.getDate() + 1);
    return d;
  })());

  return (
    <View style={styles.wrapper}>
      <View style={styles.row}>
        <View ref={pillRef} style={[styles.pillContainer, isToday(selected) && styles.pillContainerHoy]}>
          <TouchableOpacity
            style={styles.chevronTouch}
            onPress={prevDay}
            activeOpacity={0.7}
            accessibilityLabel="Día anterior"
          >
            <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.95)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <Path d="M15 18L9 12L15 6" />
            </Svg>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.pillDateTouch}
            onPress={openCalendar}
            activeOpacity={0.7}
            accessibilityLabel="Seleccionar fecha"
          >
            <Text style={styles.pillDateText} numberOfLines={1}>
              {isToday(selected) ? 'Hoy' : formatDateLabel(selected)}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.chevronTouch, !canGoNext && styles.chevronDisabled]}
            onPress={canGoNext ? nextDay : undefined}
            activeOpacity={0.7}
            disabled={!canGoNext}
            accessibilityLabel="Día siguiente"
          >
            <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.95)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <Path d="M9 18L15 12L9 6" />
            </Svg>
          </TouchableOpacity>
        </View>
      </View>

      {typeof document !== 'undefined' && calendarOverlay
        ? createPortal(calendarOverlay, document.body)
        : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'relative',
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  pillContainer: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 20,
  },
  pillContainerHoy: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 14,
  },
  chevronTouch: {
    padding: 4,
    marginHorizontal: -2,
  },
  chevronDisabled: {
    opacity: 0.35,
  },
  pillDateTouch: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    minHeight: 24,
    justifyContent: 'center',
  },
  pillDateText: {
    fontSize: 11,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.98)',
    textTransform: 'none',
    letterSpacing: 0.25,
    textAlign: 'center',
  },
  backdrop: {
    position: 'fixed',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    zIndex: 1100,
    backgroundColor: 'rgba(0,0,0,0.62)',
  },
  dropdown: {
    position: 'absolute',
    top: '100%',
    marginTop: 6,
    zIndex: 1101,
    width: 320,
    minWidth: 320,
  },
  dropdownPortal: {
    position: 'fixed',
    marginTop: 0,
  },
  dropdownInner: {
    width: 320,
    padding: 14,
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  calendarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
    gap: 8,
  },
  navBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calendarMonthLabel: {
    flex: 1,
    textAlign: 'center',
    fontSize: 15,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.9)',
  },
  weekdayRow: {
    flexDirection: 'row',
    marginBottom: 8,
    width: '100%',
    gap: 5,
  },
  weekdayCell: {
    width: 36,
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.5)',
    textAlign: 'center',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    width: '100%',
    gap: 5,
    justifyContent: 'flex-start',
  },
  gridCell: {
    position: 'relative',
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gridCellOther: {},
  gridCellSelected: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 18,
  },
  gridCellFuture: {
    opacity: 0.4,
  },
  gridCellText: {
    fontSize: 12,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.85)',
  },
  gridCellTextOther: {
    color: 'rgba(255,255,255,0.25)',
  },
  gridCellTextSelected: {
    color: 'rgba(255,255,255,0.98)',
  },
  gridCellTextHasEntries: {
    color: ENTRY_GREEN,
  },
  gridCellTextFuture: {
    color: 'rgba(255,255,255,0.35)',
  },
  gridTodayDot: {
    position: 'absolute',
    bottom: 2,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.9)',
  },
  gridPlannedDot: {
    position: 'absolute',
    bottom: 2,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.6)',
  },
});

export { toYYYYMMDD };
