// Third card — single face. No flip.
// Layout (top to bottom):
//   - Coach picker (only when count >= 2)
//   - Esta semana sessions list (compact)
//   - Full month grid (calendar at the bottom of the card)
//   - "Ver programa completo" CTA (low-ticket only)
//
// Body scrolls internally if content overflows the fixed card height.
import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import sessionService from '../services/sessionService';

const DAY_LABELS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
const MONTH_LABELS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

const getMonday = (date) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
};

const isSameDay = (a, b) => {
  if (!a || !b) return false;
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
};

const toYYYYMMDD = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// Parse a YYYY-MM-DD-prefixed string as a LOCAL date (not UTC).
// new Date("2026-05-02") parses as UTC midnight, which off-shifts to the previous
// day in negative-UTC timezones (Colombia is UTC-5). We need the same calendar day
// the user's coach scheduled, in the user's local timezone.
const parseLocalDate = (ymdLike) => {
  if (!ymdLike) return null;
  const [y, m, d] = String(ymdLike).slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
};

const styles = {
  card: {
    width: '100%',
    height: '100%',
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.07)',
    color: '#fff',
    display: 'flex',
    flexDirection: 'column',
  },
  body: {
    flex: 1,
    minHeight: 0,
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    padding: 20,
    gap: 18,
  },
  coachWrap: {
    position: 'relative',
  },
  coachRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    cursor: 'pointer',
    padding: '10px 12px',
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.07)',
  },
  coachKicker: {
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.5)',
  },
  coachName: {
    fontSize: 15,
    fontWeight: 600,
    color: '#fff',
  },
  coachChevron: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.5)',
    transition: 'transform 200ms cubic-bezier(0.22, 1, 0.36, 1)',
  },
  dropdown: {
    position: 'absolute',
    top: 'calc(100% + 6px)',
    left: 0,
    right: 0,
    borderRadius: 12,
    backgroundColor: '#222',
    border: '1px solid rgba(255,255,255,0.12)',
    boxShadow: '0 10px 40px rgba(0,0,0,0.45)',
    zIndex: 50,
    padding: 6,
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  dropdownItem: {
    padding: '12px 14px',
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 500,
    color: 'rgba(255,255,255,0.85)',
    cursor: 'pointer',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dropdownItemActive: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    color: '#fff',
  },
  dropdownCheck: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.7)',
  },
  dropdownBackdrop: {
    position: 'fixed',
    inset: 0,
    zIndex: 40,
  },
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.5)',
  },

  // 7-day strip (one-on-one): compact, fits the card width, never scrolls laterally.
  dayStrip: {
    display: 'flex',
    gap: 4,
  },
  dayStripCell: {
    flex: 1,
    minWidth: 0,
    height: 52,
    borderRadius: 10,
    border: '1px solid rgba(255,255,255,0.06)',
    backgroundColor: 'rgba(255,255,255,0.02)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    padding: '4px 2px',
  },
  dayStripCellToday: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    border: '1px solid rgba(255,255,255,0.25)',
  },
  dayStripLabel: {
    fontSize: 9,
    letterSpacing: 1.2,
    color: 'rgba(255,255,255,0.45)',
    textTransform: 'uppercase',
    fontWeight: 700,
  },
  dayStripDate: {
    fontSize: 13,
    fontWeight: 600,
    color: 'rgba(255,255,255,0.85)',
  },
  // Equal-flex session cells (general / low_ticket): compact, distributed equally, no scroll.
  sessionFitRow: {
    display: 'flex',
    gap: 4,
  },
  sessionFitCell: {
    flex: 1,
    minWidth: 0,
    height: 52,
    borderRadius: 10,
    border: '1px solid rgba(255,255,255,0.06)',
    backgroundColor: 'rgba(255,255,255,0.02)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    padding: '4px 2px',
  },
  sessionFitCellToday: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    border: '1px solid rgba(255,255,255,0.25)',
  },
  sessionFitNum: {
    fontSize: 13,
    fontWeight: 600,
    color: 'rgba(255,255,255,0.85)',
  },
  // Status dots — green (completed) / gray (planned, not completed).
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusDotCompleted: {
    backgroundColor: 'rgba(91, 200, 130, 0.9)',
  },
  statusDotPlanned: {
    backgroundColor: 'rgba(255, 255, 255, 0.35)',
  },
  statusDotPlaceholder: {
    width: 6,
    height: 6,
  },
  emptyText: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.4)',
    paddingTop: 4,
  },

  // Month grid
  monthHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  monthLabel: {
    fontSize: 14,
    fontWeight: 700,
    letterSpacing: -0.2,
  },
  monthNav: {
    display: 'flex',
    gap: 6,
  },
  monthChevron: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.06)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
    border: 'none',
    cursor: 'pointer',
    fontWeight: 600,
  },
  weekDayHeader: {
    display: 'grid',
    gridTemplateColumns: 'repeat(7, 1fr)',
    gap: 4,
  },
  weekDayHeaderCell: {
    textAlign: 'center',
    fontSize: 10,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.4)',
  },
  monthGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(7, 1fr)',
    gap: 4,
  },
  gridCell: {
    aspectRatio: '1',
    borderRadius: 8,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 13,
    fontWeight: 500,
    color: 'rgba(255,255,255,0.85)',
    border: '1px solid rgba(255,255,255,0.05)',
    backgroundColor: 'rgba(255,255,255,0.02)',
    position: 'relative',
  },
  gridCellOtherMonth: {
    color: 'rgba(255,255,255,0.2)',
    backgroundColor: 'transparent',
    borderColor: 'transparent',
  },
  gridCellToday: {
    backgroundColor: 'rgba(255,255,255,0.14)',
    border: '1px solid rgba(255,255,255,0.3)',
    color: '#fff',
    fontWeight: 700,
  },
  sessionDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.7)',
    marginTop: 2,
  },
  programButton: {
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.08)',
    border: '1px solid rgba(255,255,255,0.12)',
    color: '#fff',
    fontSize: 13,
    fontWeight: 600,
    letterSpacing: 0.3,
    cursor: 'pointer',
    marginTop: 4,
  },
};

const buildMonthGrid = (year, month) => {
  const firstOfMonth = new Date(year, month, 1);
  const start = getMonday(firstOfMonth);
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
};

const WeekCoachCard = ({
  coachEnvironments = [],
  selectedCoachId,
  onSelectCoach,
  onTapDate,
  onSeeProgram,
}) => {
  const { user } = useAuth();
  const today = useMemo(() => {
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    return t;
  }, []);
  const [visibleMonth, setVisibleMonth] = useState({
    year: today.getFullYear(),
    month: today.getMonth(),
  });
  const [pickerOpen, setPickerOpen] = useState(false);

  const selected = coachEnvironments.find((c) => c.coachId === selectedCoachId) || coachEnvironments[0];
  const primaryCourse = selected?.workouts?.[0];
  const courseId = primaryCourse?.courseId || primaryCourse?.id;
  // 'general' and 'low_ticket' both have fixed program trees (sessions in modules).
  // 'one_on_one' is week-by-week assigned. The "Ver programa completo" CTA is for fixed-tree types.
  const hasFixedProgram = primaryCourse?.deliveryType === 'low_ticket' || primaryCourse?.deliveryType === 'general';
  const isOneOnOne = primaryCourse?.deliveryType === 'one_on_one';
  const showCoachPicker = (coachEnvironments?.length || 0) >= 2;

  const { data: sessionState } = useQuery({
    queryKey: ['preview', 'todaySession', user?.uid, courseId],
    queryFn: () => sessionService.getCurrentSession(user.uid, courseId),
    enabled: !!user?.uid && !!courseId,
    staleTime: 0,
  });

  const monday = useMemo(() => getMonday(today), [today]);
  const mondayYmd = useMemo(() => toYYYYMMDD(monday), [monday]);
  const sundayYmd = useMemo(() => {
    const s = new Date(monday);
    s.setDate(monday.getDate() + 6);
    return toYYYYMMDD(s);
  }, [monday]);
  const weekDates = useMemo(() => Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  }), [monday]);

  const sessionsByDate = useMemo(() => {
    const map = new Map();
    (sessionState?.allSessions || []).forEach((s) => {
      if (!s.plannedDate) return;
      const key = String(s.plannedDate).slice(0, 10);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(s);
    });
    return map;
  }, [sessionState?.allSessions]);

  // Set of sessionIds the user has completed — used to color status dots.
  const completedSessionIds = useMemo(() => {
    const arr = sessionState?.progress?.allSessionsCompleted;
    return new Set(Array.isArray(arr) ? arr : []);
  }, [sessionState?.progress?.allSessionsCompleted]);

  // Filter via YYYY-MM-DD string comparison to avoid the UTC-midnight shift bug
  // that hides today's sessions in negative-UTC timezones.
  const weekSessions = useMemo(() => {
    if (!sessionState?.allSessions) return [];
    return sessionState.allSessions
      .filter((s) => {
        if (!s.plannedDate) return false;
        const ymd = String(s.plannedDate).slice(0, 10);
        return ymd >= mondayYmd && ymd <= sundayYmd;
      })
      .sort((a, b) => String(a.plannedDate).localeCompare(String(b.plannedDate)));
  }, [sessionState?.allSessions, mondayYmd, sundayYmd]);

  // For non-date-scheduled programs (low_ticket, general) sessions have plannedDate: null.
  // The current module's sessions == this week's sessions. Cap at 7 so equal-flex cells stay legible.
  const moduleWeekSessions = useMemo(() => {
    const all = sessionState?.allSessions || [];
    if (!all.length) return [];
    return all.slice(0, 7);
  }, [sessionState?.allSessions]);

  const monthLabel = `${MONTH_LABELS[visibleMonth.month]} ${visibleMonth.year}`;
  const monthGrid = useMemo(() => buildMonthGrid(visibleMonth.year, visibleMonth.month), [visibleMonth]);

  const handlePrevMonth = (e) => {
    e?.stopPropagation?.();
    setVisibleMonth((m) => {
      const nm = m.month - 1;
      return nm < 0 ? { year: m.year - 1, month: 11 } : { year: m.year, month: nm };
    });
  };
  const handleNextMonth = (e) => {
    e?.stopPropagation?.();
    setVisibleMonth((m) => {
      const nm = m.month + 1;
      return nm > 11 ? { year: m.year + 1, month: 0 } : { year: m.year, month: nm };
    });
  };
  const handleSeeProgram = (e) => {
    e?.stopPropagation?.();
    if (onSeeProgram && primaryCourse) onSeeProgram(primaryCourse);
  };
  const togglePicker = (e) => {
    e?.stopPropagation?.();
    setPickerOpen((p) => !p);
  };
  const handlePickCoach = (coachId) => (e) => {
    e?.stopPropagation?.();
    onSelectCoach?.(coachId);
    setPickerOpen(false);
  };

  return (
    <div style={styles.card}>
      <div style={styles.body}>
        {showCoachPicker ? (
          <div style={styles.coachWrap}>
            <div style={styles.coachRow} onClick={togglePicker} role="button" tabIndex={0}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={styles.coachKicker}>Coach</span>
                <span style={styles.coachName}>{selected?.coachName}</span>
              </div>
              <span style={{ ...styles.coachChevron, transform: pickerOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}>▾</span>
            </div>
            {pickerOpen ? (
              <>
                <div style={styles.dropdownBackdrop} onClick={togglePicker} />
                <div style={styles.dropdown}>
                  {coachEnvironments.map((c) => {
                    const active = c.coachId === selected?.coachId;
                    return (
                      <div
                        key={c.coachId}
                        style={active ? { ...styles.dropdownItem, ...styles.dropdownItemActive } : styles.dropdownItem}
                        onClick={handlePickCoach(c.coachId)}
                        role="button"
                        tabIndex={0}
                      >
                        <span>{c.coachName}</span>
                        {active ? <span style={styles.dropdownCheck}>✓</span> : null}
                      </div>
                    );
                  })}
                </div>
              </>
            ) : null}
          </div>
        ) : null}

        <div style={styles.section}>
          <span style={styles.sectionLabel}>Esta semana</span>
          {isOneOnOne ? (
            // 7-day strip: every day Mon→Sun. Green dot = a session that day is completed,
            // gray dot = a session that day is planned but not completed, no dot = no session.
            <div style={styles.dayStrip}>
              {weekDates.map((d, i) => {
                const ymd = toYYYYMMDD(d);
                const sessions = sessionsByDate.get(ymd) || [];
                const hasSession = sessions.length > 0;
                const anyCompleted = sessions.some((s) => completedSessionIds.has(s.sessionId));
                const isTodayCell = isSameDay(d, today);
                const cellStyle = {
                  ...styles.dayStripCell,
                  ...(isTodayCell ? styles.dayStripCellToday : {}),
                  cursor: hasSession ? 'pointer' : 'default',
                };
                let dotStyle;
                if (!hasSession) dotStyle = styles.statusDotPlaceholder;
                else if (anyCompleted) dotStyle = { ...styles.statusDot, ...styles.statusDotCompleted };
                else dotStyle = { ...styles.statusDot, ...styles.statusDotPlanned };
                return (
                  <div
                    key={i}
                    style={cellStyle}
                    onClick={hasSession ? () => onTapDate?.(ymd, primaryCourse) : undefined}
                  >
                    <span style={styles.dayStripLabel}>{DAY_LABELS[i]}</span>
                    <span style={styles.dayStripDate}>{d.getDate()}</span>
                    <span style={dotStyle} />
                  </div>
                );
              })}
            </div>
          ) : moduleWeekSessions.length === 0 ? (
            <span style={styles.emptyText}>Sin sesiones programadas</span>
          ) : (
            // General / low_ticket: compact session cells, equal flex, no horizontal scroll.
            // Green dot = completed, gray dot = planned (not yet completed).
            <div style={styles.sessionFitRow}>
              {moduleWeekSessions.map((s, i) => {
                const d = parseLocalDate(s.plannedDate);
                const isTodaySession = d && isSameDay(d, today);
                const isCompleted = completedSessionIds.has(s.sessionId);
                const cellStyle = isTodaySession
                  ? { ...styles.sessionFitCell, ...styles.sessionFitCellToday }
                  : styles.sessionFitCell;
                const dotStyle = isCompleted
                  ? { ...styles.statusDot, ...styles.statusDotCompleted }
                  : { ...styles.statusDot, ...styles.statusDotPlanned };
                return (
                  <div key={s.sessionId} style={cellStyle}>
                    <span style={styles.sessionFitNum}>
                      {String(s.order != null ? s.order + 1 : i + 1).padStart(2, '0')}
                    </span>
                    <span style={dotStyle} />
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div style={styles.section}>
          <div style={styles.monthHeader}>
            <span style={styles.monthLabel}>{monthLabel}</span>
            <div style={styles.monthNav}>
              <button style={styles.monthChevron} onClick={handlePrevMonth} aria-label="Mes anterior">{'‹'}</button>
              <button style={styles.monthChevron} onClick={handleNextMonth} aria-label="Mes siguiente">{'›'}</button>
            </div>
          </div>

          <div style={styles.weekDayHeader}>
            {DAY_LABELS.map((d) => (
              <span key={d} style={styles.weekDayHeaderCell}>{d}</span>
            ))}
          </div>

          <div style={styles.monthGrid}>
            {monthGrid.map((d, i) => {
              const otherMonth = d.getMonth() !== visibleMonth.month;
              const isTodayCell = isSameDay(d, today);
              const ymd = toYYYYMMDD(d);
              const hasSession = sessionsByDate.has(ymd);
              const cellStyle = {
                ...styles.gridCell,
                ...(otherMonth ? styles.gridCellOtherMonth : {}),
                ...(isTodayCell ? styles.gridCellToday : {}),
                cursor: hasSession ? 'pointer' : 'default',
              };
              return (
                <div
                  key={i}
                  style={cellStyle}
                  onClick={hasSession ? () => onTapDate?.(ymd, primaryCourse) : undefined}
                >
                  <span>{d.getDate()}</span>
                  {hasSession ? <span style={styles.sessionDot} /> : null}
                </div>
              );
            })}
          </div>

          {hasFixedProgram ? (
            <button style={styles.programButton} onClick={handleSeeProgram}>
              Ver programa completo
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default WeekCoachCard;
