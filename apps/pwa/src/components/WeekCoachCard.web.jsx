// Third card — two faces with a 3D flip.
//   Front: coach picker (with avatar), two adherence line graphs (workouts + nutrition),
//          flip-to-calendar button.
//   Back:  month label + nav, full month grid, flip-back button.
// Neither face overflows the card; no internal scrolling. Accent CSS vars are
// scoped to this card (derived from the active coach's profile picture).
import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import sessionService from '../services/sessionService';
import { getDiaryEntriesInRange } from '../services/nutritionFirestoreService';
import { useAccentFromImage } from '../hooks/hoy/useAccentFromImage';

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

  // Adherence bar charts
  adherenceList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
  },
  chart: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  chartHeader: {
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  chartLabel: {
    fontSize: 12,
    fontWeight: 500,
    color: 'rgba(255,255,255,0.65)',
    letterSpacing: 0.2,
  },
  chartScore: {
    fontSize: 18,
    fontWeight: 700,
    letterSpacing: -0.3,
    color: '#fff',
    fontVariantNumeric: 'tabular-nums',
  },
  chartScoreEmpty: {
    color: 'rgba(255,255,255,0.35)',
    fontWeight: 600,
    fontSize: 13,
  },
  chartPlot: {
    width: '100%',
    height: 48,
    display: 'block',
  },
  chartLabelsRow: {
    display: 'flex',
    gap: 4,
  },
  chartDayLabel: {
    flex: 1,
    minWidth: 0,
    textAlign: 'center',
    fontSize: 9,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    fontWeight: 700,
    color: 'rgba(255,255,255,0.4)',
  },
  chartDayLabelToday: {
    color: '#fff',
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
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.1)',
    color: '#fff',
    fontSize: 13,
    fontWeight: 600,
    letterSpacing: 0.3,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
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
    backgroundColor: 'rgba(255,255,255,0.7)',
    marginTop: 2,
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

const CoachAvatar = ({ imageUrl, name, small = false }) => (
  <div style={small ? { ...styles.coachAvatar, ...styles.coachAvatarSm } : styles.coachAvatar}>
    {imageUrl ? (
      <img src={imageUrl} alt="" style={styles.coachAvatarImg} loading="lazy" />
    ) : (
      <span style={styles.coachAvatarFallback}>{initialsFor(name)}</span>
    )}
  </div>
);

// Line graph rendered in SVG (viewBox-based, scales with the container).
// Breaks the line wherever a point's value is null — for workouts that means rest
// days, for nutrition it means future days.
const LineGraph = ({ points }) => {
  const W = 100;
  const H = 40;
  const PAD_X = 3;
  const PAD_Y = 4;
  const n = points.length;
  if (n === 0) return null;
  const xFor = (i) => (n <= 1 ? W / 2 : PAD_X + (i / (n - 1)) * (W - 2 * PAD_X));
  const yFor = (v) => PAD_Y + (1 - v) * (H - 2 * PAD_Y);

  const segments = [];
  let current = [];
  points.forEach((p, i) => {
    if (p.value == null) {
      if (current.length > 0) segments.push(current);
      current = [];
      return;
    }
    current.push({ x: xFor(i), y: yFor(p.value), i });
  });
  if (current.length > 0) segments.push(current);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      style={styles.chartPlot}
      aria-hidden
    >
      <line
        x1={0}
        y1={H - PAD_Y}
        x2={W}
        y2={H - PAD_Y}
        stroke="rgba(255,255,255,0.08)"
        strokeWidth={0.4}
        vectorEffect="non-scaling-stroke"
      />
      {segments.map((seg, idx) => {
        if (seg.length < 2) return null;
        const first = seg[0];
        const last = seg[seg.length - 1];
        const areaPath =
          `M ${first.x},${H - PAD_Y} ` +
          `L ${seg.map((p) => `${p.x},${p.y}`).join(' L ')} ` +
          `L ${last.x},${H - PAD_Y} Z`;
        return (
          <path
            key={`area-${idx}`}
            d={areaPath}
            fill="var(--accent, rgba(255,255,255,0.85))"
            fillOpacity={0.18}
          />
        );
      })}
      {segments.map((seg, idx) => {
        if (seg.length < 2) return null;
        const linePath = `M ${seg.map((p) => `${p.x},${p.y}`).join(' L ')}`;
        return (
          <path
            key={`line-${idx}`}
            d={linePath}
            fill="none"
            stroke="var(--accent, rgba(255,255,255,0.9))"
            strokeWidth={1.4}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        );
      })}
      {points.map((p, i) => {
        if (p.value == null) return null;
        const x = xFor(i);
        const y = yFor(p.value);
        const r = p.isToday ? 1.8 : 1.1;
        return (
          <g key={`pt-${i}`}>
            {p.isToday ? (
              <circle
                cx={x}
                cy={y}
                r={3.2}
                fill="var(--accent, #fff)"
                fillOpacity={0.18}
              />
            ) : null}
            <circle
              cx={x}
              cy={y}
              r={r}
              fill={p.isToday ? 'var(--accent, #fff)' : '#fff'}
            />
          </g>
        );
      })}
    </svg>
  );
};

const AdherenceChart = ({ label, score, points }) => {
  const hasScore = typeof score === 'number' && Number.isFinite(score);
  const pct = hasScore ? Math.max(0, Math.min(100, score)) : 0;
  const visiblePoints = (points && points.length > 0) ? points : Array.from({ length: 7 }, () => ({
    label: '·', value: null, isToday: false,
  }));
  return (
    <div style={styles.chart}>
      <div style={styles.chartHeader}>
        <span style={styles.chartLabel}>{label}</span>
        {hasScore ? (
          <span style={styles.chartScore}>{pct}%</span>
        ) : (
          <span style={styles.chartScoreEmpty}>—</span>
        )}
      </div>
      <LineGraph points={visiblePoints} />
      <div style={styles.chartLabelsRow}>
        {visiblePoints.map((p, i) => (
          <span
            key={i}
            style={p.isToday ? { ...styles.chartDayLabel, ...styles.chartDayLabelToday } : styles.chartDayLabel}
          >
            {p.label}
          </span>
        ))}
      </div>
    </div>
  );
};

const WeekCoachCard = ({
  coachEnvironments = [],
  selectedCoachId,
  profileImagesByCoachId = {},
  hasNutrition = false,
  nutritionCaloriesTarget = 0,
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
  const primaryCourse = selected?.workouts?.[0];
  const courseId = primaryCourse?.courseId || primaryCourse?.id;
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

  const completedSessionIds = useMemo(() => {
    const arr = sessionState?.progress?.allSessionsCompleted;
    return new Set(Array.isArray(arr) ? arr : []);
  }, [sessionState?.progress?.allSessionsCompleted]);

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
  const moduleWeekSessions = useMemo(() => {
    const all = sessionState?.allSessions || [];
    if (!all.length) return [];
    return all.slice(0, 7);
  }, [sessionState?.allSessions]);

  const weekItems = isOneOnOne ? weekSessions : moduleWeekSessions;
  const weekTotal = weekItems.length;
  const weekDone = useMemo(
    () => weekItems.filter((s) => completedSessionIds.has(s.sessionId)).length,
    [weekItems, completedSessionIds],
  );
  // Workout adherence: % of this week's planned sessions completed.
  const workoutAdherence = weekTotal > 0 ? Math.min(100, Math.round((weekDone / weekTotal) * 100)) : null;

  // Workout per-day points for the line graph. For one_on_one we map by date,
  // skipping rest days (value: null) so the line breaks across them. For fixed
  // programs each session in the cycle is its own point on the X axis.
  const workoutPoints = useMemo(() => {
    if (isOneOnOne) {
      return weekDates.map((d, i) => {
        const ymd = toYYYYMMDD(d);
        const sessions = sessionsByDate.get(ymd) || [];
        const hasSession = sessions.length > 0;
        const anyCompleted = sessions.some((s) => completedSessionIds.has(s.sessionId));
        let value = null;
        if (hasSession) value = anyCompleted ? 1 : 0;
        return { label: DAY_LABELS[i], value, isToday: isSameDay(d, today) };
      });
    }
    return moduleWeekSessions.map((s, i) => {
      const isCompleted = completedSessionIds.has(s.sessionId);
      const order = s.order != null ? s.order + 1 : i + 1;
      return {
        label: String(order).padStart(2, '0'),
        value: isCompleted ? 1 : 0,
        isToday: false,
      };
    });
  }, [isOneOnOne, weekDates, sessionsByDate, completedSessionIds, today, moduleWeekSessions]);

  // Weekly diary entries — used to score nutrition adherence Mon → today.
  const todayYmd = useMemo(() => toYYYYMMDD(today), [today]);
  const nutritionEnabled = hasNutrition && nutritionCaloriesTarget > 0;
  const { data: weekDiaryEntries } = useQuery({
    queryKey: ['hoy', 'weekDiary', user?.uid, mondayYmd, todayYmd],
    queryFn: () => getDiaryEntriesInRange(user.uid, mondayYmd, todayYmd),
    enabled: !!user?.uid && nutritionEnabled,
    staleTime: 60 * 1000,
  });

  // Per-day calorie adherence Mon → Sun for the line graph. Each day's value is
  // capped at 100% of target so a one-day overshoot can't inflate the curve.
  // Future days are null so the line stops at today. The aggregate score averages
  // only past + today.
  const { nutritionPoints, nutritionAdherence } = useMemo(() => {
    if (!nutritionEnabled) return { nutritionPoints: [], nutritionAdherence: null };
    const todayIndex = weekDates.findIndex((d) => isSameDay(d, today));
    const caloriesByDate = new Map();
    (weekDiaryEntries || []).forEach((e) => {
      const ymd = String(e.date || '').slice(0, 10);
      if (!ymd) return;
      caloriesByDate.set(ymd, (caloriesByDate.get(ymd) || 0) + (Number(e.calories) || 0));
    });
    const points = weekDates.map((d, i) => {
      const ymd = toYYYYMMDD(d);
      const consumed = caloriesByDate.get(ymd) || 0;
      const isFuture = todayIndex >= 0 && i > todayIndex;
      const value = isFuture ? null : Math.min(1, consumed / nutritionCaloriesTarget);
      return { label: DAY_LABELS[i], value, isToday: i === todayIndex };
    });
    const dayCount = todayIndex >= 0 ? todayIndex + 1 : 0;
    const adherence = dayCount > 0
      ? Math.round(
          (points.slice(0, dayCount).reduce((acc, p) => acc + (p.value || 0), 0) / dayCount) * 100,
        )
      : null;
    return { nutritionPoints: points, nutritionAdherence: adherence };
  }, [nutritionEnabled, nutritionCaloriesTarget, weekDiaryEntries, weekDates, today]);

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
        <div style={styles.face}>
          {showCoachPicker ? (
            <div style={styles.coachWrap}>
              <div style={styles.coachRow} onClick={togglePicker} role="button" tabIndex={0}>
                <div style={styles.coachInfo}>
                  <CoachAvatar imageUrl={selectedProfileImageUrl} name={selected?.coachName} />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                    <span style={styles.coachKicker}>Coach</span>
                    <span style={styles.coachName}>{selected?.coachName}</span>
                  </div>
                </div>
                <span style={{ ...styles.coachChevron, transform: pickerOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}>▾</span>
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
            <div style={styles.coachInfo}>
              <CoachAvatar imageUrl={selectedProfileImageUrl} name={selected?.coachName} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                <span style={styles.coachKicker}>Coach</span>
                <span style={styles.coachName}>{selected?.coachName || '—'}</span>
              </div>
            </div>
          )}

          <div style={styles.section}>
            <span style={styles.sectionLabel}>Esta semana</span>
            <div style={styles.adherenceList}>
              <AdherenceChart label="Entrenamientos" score={workoutAdherence} points={workoutPoints} />
              {nutritionEnabled ? (
                <AdherenceChart label="Nutrición" score={nutritionAdherence} points={nutritionPoints} />
              ) : null}
            </div>
          </div>

          <div style={styles.footer}>
            {hasFixedProgram ? (
              <button style={styles.programLink} onClick={handleSeeProgram}>
                Ver programa completo
              </button>
            ) : null}
            <button style={styles.flipButton} onClick={handleFlip} aria-label="Ver calendario del mes">
              <span>Calendario del mes</span>
              <span aria-hidden>↻</span>
            </button>
          </div>
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

          <button style={{ ...styles.flipButton, marginTop: 'auto' }} onClick={handleFlip} aria-label="Volver">
            <span aria-hidden>←</span>
            <span>Volver</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default WeekCoachCard;
