// Third card — two faces with a 3D flip.
//   Front: coach picker, Lun→Dom day strip (date + status dot), nutrition adherence,
//          flip-to-calendar button.
//   Back:  month label + nav, full month grid with the same dot system, flip-back button.
// Dot system: green = a session was completed that date; grey = a session is
// planned but not completed (one_on_one, or any program whose sessionState
// exposes per-session plannedDate — e.g. general+scheduling=weekly). Module
// programs without per-day scheduling fall back to green dots from sessionHistory.
// Neither face overflows the card; no internal scrolling. Accent CSS vars are
// scoped to this card (derived from the active coach's profile picture).
import React, { useMemo, useState, useEffect } from 'react';
import { useQuery, useQueries } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import sessionService from '../services/sessionService';
import exerciseHistoryService from '../services/exerciseHistoryService';
import { useAccentFromImage } from '../hooks/hoy/useAccentFromImage';
import VideoExchangeOverlay from './videoExchange/VideoExchangeOverlay.web';

const DAY_LABELS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
const DAY_LABELS_SHORT = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const ENTRY_GREEN = 'rgba(34, 140, 70, 0.95)';
const PLANNED_GREY = 'rgba(255,255,255,0.55)';
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

const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';

const styles = {
  card: {
    width: '100%',
    height: '100%',
    borderRadius: 24,
    position: 'relative',
    perspective: '1600px',
    color: '#fff',
  },
  flipper: {
    position: 'relative',
    width: '100%',
    height: '100%',
    transition: `transform 720ms ${EASE}`,
    transformStyle: 'preserve-3d',
    willChange: 'transform',
  },
  face: {
    position: 'absolute',
    inset: 0,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.07)',
    overflow: 'hidden',
    backfaceVisibility: 'hidden',
    WebkitBackfaceVisibility: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    padding: 20,
    gap: 18,
  },
  faceFront: {
    paddingTop: 20,
  },
  faceBack: {
    transform: 'rotateY(180deg)',
  },

  // Coach picker
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
    transition: `transform 200ms ${EASE}`,
  },
  dropdown: {
    position: 'absolute',
    bottom: 'calc(100% + 6px)',
    left: 0,
    right: 0,
    borderRadius: 12,
    backgroundColor: '#222',
    border: '1px solid rgba(255,255,255,0.12)',
    boxShadow: '0 -10px 40px rgba(0,0,0,0.45)',
    zIndex: 50,
    padding: 6,
    display: 'flex',
    flexDirection: 'column-reverse',
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

  // Section
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
  sectionHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  sectionActions: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  sectionFlipButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.1)',
    color: 'rgba(255,255,255,0.85)',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 0,
  },

  // Coach avatar
  coachAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.1)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  coachAvatarImg: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    display: 'block',
  },
  coachAvatarFallback: {
    fontSize: 13,
    fontWeight: 700,
    color: 'rgba(255,255,255,0.7)',
    letterSpacing: 0.3,
  },
  coachAvatarSm: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  coachInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    minWidth: 0,
    flex: 1,
  },

  // Footer (front)
  footer: {
    marginTop: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  programLink: {
    background: 'transparent',
    border: 'none',
    color: 'rgba(255,255,255,0.6)',
    fontSize: 12,
    fontWeight: 600,
    letterSpacing: 0.4,
    cursor: 'pointer',
    padding: '4px 0',
    textAlign: 'center',
  },
  flipButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.1)',
    color: '#fff',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 0,
    alignSelf: 'center',
  },

  // Back face — month grid
  backHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  backTitle: {
    fontSize: 15,
    fontWeight: 700,
    letterSpacing: -0.2,
    color: '#fff',
    textTransform: 'capitalize',
  },
  backNav: {
    display: 'flex',
    gap: 6,
  },
  navButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.08)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'rgba(255,255,255,0.85)',
    fontSize: 14,
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
    marginTop: 2,
  },

  // Front-face week list (sessions of the week)
  weekList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    width: '100%',
  },
  weekRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '8px 10px',
    borderRadius: 10,
    backgroundColor: 'transparent',
    border: '1px solid transparent',
    cursor: 'pointer',
    transition: 'background-color 160ms ease, border-color 160ms ease',
  },
  weekRowToday: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.12)',
  },
  weekRowSelected: {
    backgroundColor: 'var(--accent, #fff)',
    border: '1px solid var(--accent, #fff)',
  },
  weekRowLeft: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    minWidth: 34,
    flexShrink: 0,
  },
  weekRowDayLabel: {
    fontSize: 9,
    fontWeight: 700,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.5)',
    lineHeight: 1,
  },
  weekRowDayLabelToday: {
    color: '#fff',
  },
  weekRowDayLabelSelected: {
    color: 'var(--accent-text, #1a1a1a)',
    opacity: 0.75,
  },
  weekRowDayNumber: {
    fontSize: 17,
    fontWeight: 600,
    color: '#fff',
    fontVariantNumeric: 'tabular-nums',
    lineHeight: 1.1,
    marginTop: 2,
  },
  weekRowDayNumberSelected: {
    color: 'var(--accent-text, #1a1a1a)',
  },
  weekRowBody: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  weekRowTitle: {
    fontSize: 13,
    fontWeight: 600,
    color: 'rgba(255,255,255,0.92)',
    letterSpacing: -0.1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  weekRowTitleMuted: {
    color: 'rgba(255,255,255,0.32)',
    fontWeight: 500,
  },
  weekRowTitleSelected: {
    color: 'var(--accent-text, #1a1a1a)',
  },
  weekRowTitleRest: {
    color: 'rgba(255,255,255,0.4)',
    fontStyle: 'italic',
    fontWeight: 500,
  },
  weekRowRight: {
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    minWidth: 38,
  },
  weekCheck: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: 'rgba(34, 140, 70, 0.95)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#fff',
    fontSize: 10,
    fontWeight: 800,
  },
  weekTodayPill: {
    fontSize: 9,
    fontWeight: 800,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.65)',
    padding: '3px 7px',
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.08)',
    border: '1px solid rgba(255,255,255,0.12)',
  },
  weekTodayPillSelected: {
    color: 'var(--accent-text, #1a1a1a)',
    backgroundColor: 'rgba(0,0,0,0.12)',
    border: '1px solid rgba(0,0,0,0.18)',
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

const initialsFor = (name) => {
  if (!name) return '·';
  const parts = String(name).trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p.charAt(0).toUpperCase()).join('') || '·';
};

const CalendarIcon = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <rect x="3" y="5" width="18" height="16" rx="2" />
    <path d="M3 10h18" />
    <path d="M8 3v4" />
    <path d="M16 3v4" />
  </svg>
);

const ArrowLeftIcon = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M15 18l-6-6 6-6" />
  </svg>
);

const CameraIcon = ({ size = 15 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M4 7h3l2-2h6l2 2h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1Z" />
    <circle cx="12" cy="13" r="3.5" />
  </svg>
);

const CoachAvatar = ({ imageUrl, name, small = false }) => {
  const [errored, setErrored] = useState(false);
  // Reset error state when imageUrl changes — different coach, different URL.
  useEffect(() => { setErrored(false); }, [imageUrl]);
  const showImage = imageUrl && !errored;
  return (
    <div style={small ? { ...styles.coachAvatar, ...styles.coachAvatarSm } : styles.coachAvatar}>
      {showImage ? (
        <img src={imageUrl} alt="" style={styles.coachAvatarImg} loading="lazy" onError={() => setErrored(true)} />
      ) : (
        <span style={styles.coachAvatarFallback}>{initialsFor(name)}</span>
      )}
    </div>
  );
};

const WeekCoachCard = ({
  coachEnvironments = [],
  selectedCoachId,
  profileImagesByCoachId = {},
  selectedDate,
  onSelectCoach,
  onSelectDate,
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
  const [flipped, setFlipped] = useState(false);

  const selected = coachEnvironments.find((c) => c.coachId === selectedCoachId) || coachEnvironments[0];
  const selectedProfileImageUrl = selected ? (profileImagesByCoachId?.[selected.coachId] || null) : null;
  const accent = useAccentFromImage(selectedProfileImageUrl);
  const accentVarsStyle = accent
    ? {
        '--accent': accent.accent,
        '--accent-r': accent.accentR,
        '--accent-g': accent.accentG,
        '--accent-b': accent.accentB,
        '--accent-text': accent.accentText,
      }
    : {};
  // All courses in the selected coach env contribute to the calendar — multiple
  // programs from the same coach merge their planned/completed dots into one view.
  const envCourses = useMemo(() => selected?.workouts || [], [selected]);
  const primaryCourse = envCourses[0];
  // Programs whose structure can be browsed — one_on_one is week-by-week, no
  // single "complete program" surface. We render one row per fixed program so
  // it's never ambiguous which one the link refers to.
  const fixedCourses = useMemo(
    () => envCourses.filter((c) => c.deliveryType !== 'one_on_one'),
    [envCourses],
  );
  const hasOneOnOne = envCourses.some((c) => c.deliveryType === 'one_on_one');
  const showCoachPicker = (coachEnvironments?.length || 0) >= 2;
  const [videoHistoryOpen, setVideoHistoryOpen] = useState(false);

  const sessionStateQueries = useQueries({
    queries: envCourses.map((c) => {
      const cId = c.courseId || c.id;
      // Expired courses still render in the carousel (with the "Expirado" tag)
      // but we skip the API call — it would 403 and just create noise.
      const expired =
        !c?.is_trial &&
        (c?.hasAccess === false ||
          (c?.expires_at && new Date(c.expires_at) <= new Date()));
      return {
        queryKey: ['preview', 'todaySession', user?.uid, cId],
        queryFn: () => sessionService.getCurrentSession(user.uid, cId),
        enabled: !!user?.uid && !!cId && !expired,
        staleTime: 0,
      };
    }),
  });

  const monday = useMemo(() => getMonday(today), [today]);
  const mondayYmd = useMemo(() => toYYYYMMDD(monday), [monday]);
  const weekDates = useMemo(() => Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  }), [monday]);

  const monthLabel = `${MONTH_LABELS[visibleMonth.month]} ${visibleMonth.year}`;
  const monthGrid = useMemo(() => buildMonthGrid(visibleMonth.year, visibleMonth.month), [visibleMonth]);

  // Date range covering both the visible month grid and this week's strip — single
  // source-of-truth for completed-date lookups across both faces.
  const calendarRange = useMemo(() => {
    const monthStart = monthGrid[0];
    const monthEnd = monthGrid[monthGrid.length - 1];
    const start = monthStart < monday ? monthStart : monday;
    const weekEnd = weekDates[6];
    const end = monthEnd > weekEnd ? monthEnd : weekEnd;
    return { startYmd: toYYYYMMDD(start), endYmd: toYYYYMMDD(end) };
  }, [monthGrid, monday, weekDates]);

  // Courses that don't carry per-session plannedDate (legacy general/low_ticket)
  // need a separate sessionHistory fetch to surface completed dates. Date-scheduled
  // courses (one_on_one, scheduling='weekly') derive both planned and completed
  // dates from sessionState.allSessions + completedSessionIds — no extra fetch.
  const isDateScheduled = (c) => c.deliveryType === 'one_on_one' || c.scheduling === 'weekly';
  const moduleCalendarQueries = useQueries({
    queries: envCourses.map((c) => {
      const cId = c.courseId || c.id;
      return {
        queryKey: ['hoy', 'completedCalendar', user?.uid, cId, calendarRange.startYmd, calendarRange.endYmd],
        queryFn: () => exerciseHistoryService.getDatesWithCompletedSessionsForCourse(
          user.uid, cId, calendarRange.startYmd, calendarRange.endYmd,
        ),
        enabled: !!user?.uid && !!cId && !isDateScheduled(c),
        staleTime: 5 * 60 * 1000,
      };
    }),
  });

  // Per-date course attribution: which course owns the completed/planned session for
  // a given date. First match wins (envCourses already honors pinned-first ordering),
  // so click navigation goes to the most relevant program.
  // sessionTitleByDate is populated for one_on_one (via plannedDate) and for the
  // current day on any deliveryType (via the primary session state).
  const todayYmd = useMemo(() => toYYYYMMDD(today), [today]);
  const { completedDateMap, plannedDateMap, sessionTitleByDate } = useMemo(() => {
    const completed = new Map();
    const planned = new Map();
    const titles = new Map();
    envCourses.forEach((course, idx) => {
      const sessionState = sessionStateQueries[idx]?.data;
      // Branch on the actual data shape, not the course flag. /workout/daily
      // returns plannedDate per session for any date-scheduled program
      // (one_on_one or scheduling='weekly'); that's the truth, regardless of
      // whether the flag has propagated through enrichment + user-doc caches.
      const allSessionsList = sessionState?.allSessions || [];
      const hasPlanned = allSessionsList.some((s) => s.plannedDate);
      if (hasPlanned) {
        const completedIds = new Set(
          Array.isArray(sessionState?.progress?.allSessionsCompleted)
            ? sessionState.progress.allSessionsCompleted
            : [],
        );
        allSessionsList.forEach((s) => {
          if (!s.plannedDate) return;
          const ymd = String(s.plannedDate).slice(0, 10);
          if (completedIds.has(s.sessionId)) {
            if (!completed.has(ymd)) completed.set(ymd, course);
          } else if (!planned.has(ymd)) {
            planned.set(ymd, course);
          }
          if (s.title && !titles.has(ymd)) titles.set(ymd, s.title);
        });
      } else {
        const dates = moduleCalendarQueries[idx]?.data;
        (Array.isArray(dates) ? dates : []).forEach((ymd) => {
          if (!completed.has(ymd)) completed.set(ymd, course);
        });
        const todayTitle = sessionState?.session?.title;
        if (todayTitle && !titles.has(todayYmd)) titles.set(todayYmd, todayTitle);
      }
    });
    return { completedDateMap: completed, plannedDateMap: planned, sessionTitleByDate: titles };
  }, [envCourses, sessionStateQueries, moduleCalendarQueries, todayYmd]);

  const statusForDate = (ymd) => {
    if (completedDateMap.has(ymd)) return 'completed';
    if (plannedDateMap.has(ymd)) return 'planned';
    return 'none';
  };

  // Calendar/strip cutoff — users can access training for the current week AND
  // next week. Anything past next Sunday is treated as out-of-range.
  const nextWeekSunday = useMemo(() => {
    const s = new Date(monday);
    s.setDate(monday.getDate() + 13);
    s.setHours(0, 0, 0, 0);
    return s;
  }, [monday]);

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
  const handleSeeProgram = (course) => (e) => {
    e?.stopPropagation?.();
    if (onSeeProgram && course) onSeeProgram(course);
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
  const handleFlip = (e) => {
    e?.stopPropagation?.();
    setPickerOpen(false);
    setFlipped((f) => !f);
  };

  return (
    <div style={{ ...styles.card, ...accentVarsStyle }}>
      <div
        style={{
          ...styles.flipper,
          transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
        }}
      >
        {/* FRONT */}
        <div style={{ ...styles.face, ...styles.faceFront }}>
          <div style={styles.section}>
            <div style={styles.sectionHeader}>
              <span style={styles.sectionLabel}>Esta semana</span>
              <div style={styles.sectionActions}>
                {hasOneOnOne ? (
                  <button
                    style={styles.sectionFlipButton}
                    onClick={(e) => {
                      e.stopPropagation();
                      setVideoHistoryOpen(true);
                    }}
                    aria-label="Historial de videos"
                    title="Historial de videos"
                  >
                    <CameraIcon size={15} />
                  </button>
                ) : null}
                <button
                  style={styles.sectionFlipButton}
                  onClick={handleFlip}
                  aria-label="Ver calendario del mes"
                >
                  <CalendarIcon size={15} />
                </button>
              </div>
            </div>
            <div style={styles.weekList}>
              {weekDates.map((d, i) => {
                const ymd = toYYYYMMDD(d);
                const status = statusForDate(ymd);
                const isTodayCell = isSameDay(d, today);
                const isSelected = selectedDate === ymd;
                const title = sessionTitleByDate.get(ymd) || null;
                const isWeekend = i >= 5; // Sat/Sun
                const rowStyle = {
                  ...styles.weekRow,
                  ...(isTodayCell && !isSelected ? styles.weekRowToday : {}),
                  ...(isSelected ? styles.weekRowSelected : {}),
                };
                const dayLabelStyle = isSelected
                  ? { ...styles.weekRowDayLabel, ...styles.weekRowDayLabelSelected }
                  : isTodayCell
                    ? { ...styles.weekRowDayLabel, ...styles.weekRowDayLabelToday }
                    : styles.weekRowDayLabel;
                const dayNumberStyle = isSelected
                  ? { ...styles.weekRowDayNumber, ...styles.weekRowDayNumberSelected }
                  : styles.weekRowDayNumber;
                let titleNode;
                if (title) {
                  titleNode = (
                    <span style={isSelected
                      ? { ...styles.weekRowTitle, ...styles.weekRowTitleSelected }
                      : styles.weekRowTitle}>
                      {title}
                    </span>
                  );
                } else if (status === 'completed') {
                  titleNode = (
                    <span style={isSelected
                      ? { ...styles.weekRowTitle, ...styles.weekRowTitleSelected }
                      : { ...styles.weekRowTitle, ...styles.weekRowTitleMuted }}>
                      Sesión completada
                    </span>
                  );
                } else if (isWeekend) {
                  titleNode = (
                    <span style={isSelected
                      ? { ...styles.weekRowTitle, ...styles.weekRowTitleSelected }
                      : styles.weekRowTitleRest}>
                      Descanso
                    </span>
                  );
                } else {
                  titleNode = (
                    <span style={isSelected
                      ? { ...styles.weekRowTitle, ...styles.weekRowTitleSelected }
                      : { ...styles.weekRowTitle, ...styles.weekRowTitleMuted }}>
                      {status === 'planned' ? 'Sesión planeada' : 'Sin sesión'}
                    </span>
                  );
                }
                let rightNode = null;
                if (status === 'completed') {
                  rightNode = <span style={styles.weekCheck}>✓</span>;
                } else if (isTodayCell && !isSelected) {
                  rightNode = <span style={styles.weekTodayPill}>Hoy</span>;
                } else if (isTodayCell && isSelected) {
                  rightNode = (
                    <span style={{ ...styles.weekTodayPill, ...styles.weekTodayPillSelected }}>
                      Hoy
                    </span>
                  );
                }
                return (
                  <div
                    key={ymd}
                    style={rowStyle}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectDate?.(ymd);
                    }}
                    role="button"
                    tabIndex={0}
                  >
                    <div style={styles.weekRowLeft}>
                      <span style={dayLabelStyle}>{DAY_LABELS_SHORT[i]}</span>
                      <span style={dayNumberStyle}>{d.getDate()}</span>
                    </div>
                    <div style={styles.weekRowBody}>
                      {titleNode}
                    </div>
                    <div style={styles.weekRowRight}>
                      {rightNode}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {showCoachPicker ? (
            <div style={{ ...styles.coachWrap, marginTop: 'auto' }}>
              <div style={styles.coachRow} onClick={togglePicker} role="button" tabIndex={0}>
                <div style={styles.coachInfo}>
                  <CoachAvatar imageUrl={selectedProfileImageUrl} name={selected?.coachName} />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                    <span style={styles.coachKicker}>Coach</span>
                    <span style={styles.coachName}>{selected?.coachName}</span>
                  </div>
                </div>
                <span style={{ ...styles.coachChevron, transform: pickerOpen ? 'rotate(0deg)' : 'rotate(180deg)' }}>▾</span>
              </div>
              {pickerOpen ? (
                <>
                  <div style={styles.dropdownBackdrop} onClick={togglePicker} />
                  <div style={styles.dropdown}>
                    {coachEnvironments.map((c) => {
                      const active = c.coachId === selected?.coachId;
                      const itemImage = profileImagesByCoachId?.[c.coachId] || null;
                      return (
                        <div
                          key={c.coachId}
                          style={active ? { ...styles.dropdownItem, ...styles.dropdownItemActive } : styles.dropdownItem}
                          onClick={handlePickCoach(c.coachId)}
                          role="button"
                          tabIndex={0}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                            <CoachAvatar imageUrl={itemImage} name={c.coachName} small />
                            <span>{c.coachName}</span>
                          </div>
                          {active ? <span style={styles.dropdownCheck}>✓</span> : null}
                        </div>
                      );
                    })}
                  </div>
                </>
              ) : null}
            </div>
          ) : (
            <div style={{ ...styles.coachInfo, marginTop: 'auto' }}>
              <CoachAvatar imageUrl={selectedProfileImageUrl} name={selected?.coachName} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                <span style={styles.coachKicker}>Coach</span>
                <span style={styles.coachName}>{selected?.coachName || '—'}</span>
              </div>
            </div>
          )}
        </div>

        {/* BACK */}
        <div style={{ ...styles.face, ...styles.faceBack }}>
          <div style={styles.backHeader}>
            <span style={styles.backTitle}>{monthLabel}</span>
            <div style={styles.backNav}>
              <button style={styles.navButton} onClick={handlePrevMonth} aria-label="Mes anterior">{'‹'}</button>
              <button style={styles.navButton} onClick={handleNextMonth} aria-label="Mes siguiente">{'›'}</button>
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
              const status = statusForDate(ymd);
              const isSelected = selectedDate === ymd;
              const isOutOfRange = d > nextWeekSunday;
              const clickable = !isOutOfRange;
              const cellStyle = {
                ...styles.gridCell,
                ...(otherMonth ? styles.gridCellOtherMonth : {}),
                ...(isTodayCell && !isSelected ? styles.gridCellToday : {}),
                ...(isSelected ? {
                  backgroundColor: 'var(--accent, #fff)',
                  border: '1px solid var(--accent, #fff)',
                  color: 'var(--accent-text, #1a1a1a)',
                } : {}),
                ...(isOutOfRange ? { opacity: 0.4 } : {}),
                cursor: clickable ? 'pointer' : 'default',
              };
              const dotColor =
                status === 'completed' ? ENTRY_GREEN
                : status === 'planned' ? PLANNED_GREY
                : null;
              return (
                <div
                  key={i}
                  style={cellStyle}
                  onClick={clickable ? () => {
                    onSelectDate?.(ymd);
                    setFlipped(false);
                  } : undefined}
                >
                  <span>{d.getDate()}</span>
                  {dotColor ? (
                    <span style={{ ...styles.sessionDot, backgroundColor: dotColor }} />
                  ) : null}
                </div>
              );
            })}
          </div>

          {fixedCourses.length > 0 ? (
            <div style={{ ...styles.footer, marginTop: 'auto' }}>
              {fixedCourses.length === 1 ? (
                <button style={styles.programLink} onClick={handleSeeProgram(fixedCourses[0])}>
                  Ver programa completo
                </button>
              ) : (
                fixedCourses.map((c) => (
                  <button
                    key={c.courseId || c.id}
                    style={styles.programLink}
                    onClick={handleSeeProgram(c)}
                  >
                    Ver {c.title || 'programa'}
                  </button>
                ))
              )}
            </div>
          ) : null}

          <button
            style={fixedCourses.length > 0 ? styles.flipButton : { ...styles.flipButton, marginTop: 'auto' }}
            onClick={handleFlip}
            aria-label="Volver"
          >
            <ArrowLeftIcon />
          </button>
        </div>
      </div>

      {hasOneOnOne ? (
        <VideoExchangeOverlay
          open={videoHistoryOpen}
          mode="history"
          userId={user?.uid}
          onClose={() => setVideoHistoryOpen(false)}
        />
      ) : null}
    </div>
  );
};

export default WeekCoachCard;
